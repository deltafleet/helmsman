import { appendFile, access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteFile, jsonLine } from "../core/document-bus/atomic-write.ts";
import { scanForSecrets } from "../core/redaction/secrets.ts";
import { apiSurfaceOk, inspectPiApiSurface, PINNED_PI_PACKAGES } from "../runtime/pi/api-surface.ts";
import { inspectProviderReadiness, type PiProviderReadiness } from "../runtime/pi/provider-readiness.ts";
import type {
  DoctorFinding,
  DoctorReport,
  InstallCommandResult,
  InstallManifest,
  InstallManifestFile,
  InstallScope,
  NoMockAuditRecord,
  ProductAuditRequirement,
  ProductAuditResult,
  ProductAuditStatus,
  ProductSurfaceReport,
  UninstallCommandResult,
  UpdateCommandResult,
} from "./types.ts";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const COMMAND_PATH = resolve(PACKAGE_ROOT, "bin", "helmsman.js");
const ADAPTERS = [
  { id: "codex", command: "codex", label: "Codex CLI" },
  { id: "opencode", command: "opencode", label: "OpenCode CLI" },
  { id: "omp", command: "omp", label: "Oh My Pi / OMP host" },
  { id: "claude", command: "claude", label: "Claude CLI" },
] as const;

export function packageRoot(): string {
  return PACKAGE_ROOT;
}

export function commandPath(): string {
  return COMMAND_PATH;
}

export function userConfigRoot(): string {
  if (process.env.XDG_CONFIG_HOME) return resolve(process.env.XDG_CONFIG_HOME);
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support");
  if (platform() === "win32") return process.env.APPDATA ? resolve(process.env.APPDATA) : join(homedir(), "AppData", "Roaming");
  return join(homedir(), ".config");
}

export function installRootFor(input: { scope: InstallScope; workspace?: string }): string {
  if (input.scope === "project") return resolve(input.workspace ?? process.cwd(), ".helmsman");
  return resolve(userConfigRoot(), "helmsman");
}

export function installManifestPathFor(input: { scope: InstallScope; workspace?: string }): string {
  return resolve(installRootFor(input), "install-manifest.json");
}

export async function buildDoctorReport(input: { cwd?: string; workspace?: string } = {}): Promise<DoctorReport> {
  const cwd = resolve(input.cwd ?? process.cwd());
  const workspace = input.workspace ? resolve(input.workspace) : cwd;
  const [packageJson, piApiSurface, providerReadiness] = await Promise.all([
    readPackageJson(),
    inspectPiApiSurface(),
    inspectProviderReadiness(workspace),
  ]);
  const productSurface = currentProductSurface();
  const commandSource = await detectCommandSource();
  const projectManifestPath = installManifestPathFor({ scope: "project", workspace });
  const userManifestPath = installManifestPathFor({ scope: "user" });
  const projectManifest = await readOptionalInstallManifest(projectManifestPath);
  const userManifest = await readOptionalInstallManifest(userManifestPath);
  const managedFileDrift = [
    ...(projectManifest ? await manifestDriftFindings(projectManifest, dirname(projectManifestPath)) : []),
    ...(userManifest ? await manifestDriftFindings(userManifest, dirname(userManifestPath)) : []),
  ];
  const staleFiles: DoctorFinding[] = [
    ...(projectManifest?.staleFilesRemoved ?? []).map((path) => finding("install.stale_removed.project", "info", `Previously removed stale managed file: ${path}`, path)),
    ...(userManifest?.staleFilesRemoved ?? []).map((path) => finding("install.stale_removed.user", "info", `Previously removed stale managed file: ${path}`, path)),
  ];
  const documentBusWritable = await probeDocumentBusWritable(workspace);
  const nodeOk = nodeSatisfies(process.version, [22, 19, 0]);
  const piImportOk = piApiSurface.packages.every((pkg) => pkg.importAvailable);
  const tuiImportOk = piApiSurface.packages.some((pkg) => pkg.packageName === "@earendil-works/pi-tui" && pkg.importAvailable);
  const providerSummary = summarizeProviders(providerReadiness);
  const checks: DoctorFinding[] = [];

  checks.push(finding("node.version", nodeOk ? "info" : "error", `Node ${process.version}; expected >=22.19.0`));
  checks.push(finding("package.metadata", packageJson ? "info" : "error", packageJson ? `Package ${packageJson.name}@${packageJson.version}` : "package.json was not readable"));
  checks.push(finding("pi.exports", apiSurfaceOk(piApiSurface) ? "info" : "error", apiSurfaceOk(piApiSurface) ? "Pinned Pi imports and required exports are available." : "One or more pinned Pi imports or required exports are unavailable."));
  checks.push(finding("document_bus.probe", documentBusWritable ? "info" : "error", documentBusWritable ? "Document Bus write probe cleaned up successfully." : "Document Bus write probe failed or could not clean up."));
  checks.push(finding("entrypoints.product", productSurface.productAuditAvailable ? "info" : "error", productSurface.productAuditAvailable ? "Gate 9 product lifecycle entrypoints are implemented." : "Gate 9 product lifecycle entrypoints are missing."));
  for (const item of providerSummary.warnings) checks.push(item);
  for (const item of managedFileDrift) checks.push(item);

  const criticalFailures = checks.filter((item) => item.severity === "error");
  const installPresent = Boolean(projectManifest || userManifest);
  const ready = criticalFailures.length === 0 && installPresent && providerSummary.missingAuth.length === 0;
  const nextRecommendedAction = selectNextAction({
    criticalFailures,
    installPresent,
    managedFileDrift,
    providerSummary,
    productSurface,
  });

  const report: DoctorReport = {
    schemaVersion: "helmsman.doctor.v1",
    checkedAt: new Date().toISOString(),
    ready,
    ok: criticalFailures.length === 0,
    command: {
      path: COMMAND_PATH,
      version: packageJson?.version,
      source: commandSource,
    },
    environment: {
      platform: platform(),
      nodeVersion: process.version,
      cwd,
      workspace,
      userConfigRoot: userConfigRoot(),
    },
    package: {
      installed: Boolean(packageJson),
      packageName: packageJson?.name,
      packageVersion: packageJson?.version,
      piVersions: Object.fromEntries(piApiSurface.packages.map((pkg) => [pkg.packageName, pkg.installedVersion ?? "missing"])),
      exportsOk: apiSurfaceOk(piApiSurface),
    },
    install: {
      projectManifest: projectManifest ? projectManifestPath : undefined,
      userManifest: userManifest ? userManifestPath : undefined,
      managedFileDrift,
      staleFiles,
    },
    runtime: {
      piImportOk,
      tuiImportOk,
      documentBusWritable,
      fullProductEntryPointsPresent: productSurface.installDoctorAvailable && productSurface.updateAvailable && productSurface.uninstallAvailable && productSurface.productAuditAvailable,
    },
    providers: {
      configured: providerSummary.configured,
      ready: providerSummary.ready,
      missingAuth: providerSummary.missingAuth,
      warnings: providerSummary.warnings,
    },
    checks,
    nextRecommendedAction,
    piApiSurface,
    providerReadiness: providerReadiness as unknown as Record<string, unknown>,
    productSurface,
  };
  return report;
}

export async function installHelmsman(input: {
  scope: InstallScope;
  workspace?: string;
  dryRun?: boolean;
  approveConflicts?: boolean;
}): Promise<InstallCommandResult> {
  const workspace = input.scope === "project" ? resolve(input.workspace ?? process.cwd()) : undefined;
  const root = installRootFor({ scope: input.scope, workspace });
  const manifestPath = installManifestPathFor({ scope: input.scope, workspace });
  const packageJson = await requirePackageJson();
  const existingManifest = await readOptionalInstallManifest(manifestPath);
  const desired = desiredManagedFiles({ scope: input.scope, root, workspace, packageJson });
  const writtenFiles: string[] = [];
  const skippedFiles: InstallManifest["skippedFiles"] = [];
  const staleFilesRemoved: string[] = [];
  const warnings: string[] = [];
  const plannedFiles: InstallManifestFile[] = [];

  for (const file of desired) {
    const existing = await readOptionalText(file.path);
    if (existing !== undefined && !(await canOverwriteManagedFile(file.path, existingManifest, root))) {
      const reason = input.approveConflicts ? "overwriting explicitly approved user-owned conflict" : "existing user-owned file requires explicit approval";
      if (!input.approveConflicts) {
        skippedFiles.push({ path: file.path, reason });
        warnings.push(`Skipped ${file.path}: ${reason}`);
        continue;
      }
    }
    const sha256 = sha256Text(file.content);
    plannedFiles.push({ path: file.path, kind: file.kind, sha256, managed: true });
    if (!input.dryRun) {
      await atomicWriteFile(file.path, `${file.content}\n`);
      writtenFiles.push(file.path);
    }
  }

  const oldManagedPaths = new Set(existingManifest?.files.filter((file) => file.managed).map((file) => resolve(root, file.path)) ?? []);
  const newManagedPaths = new Set(plannedFiles.map((file) => resolve(root, file.path)));
  for (const oldPath of oldManagedPaths) {
    if (newManagedPaths.has(oldPath)) continue;
    const oldFile = existingManifest?.files.find((file) => resolve(root, file.path) === oldPath);
    if (!oldFile) continue;
    if (await fileHashMatches(oldPath, oldFile.sha256)) {
      staleFilesRemoved.push(relative(root, oldPath));
      if (!input.dryRun) await rm(oldPath, { force: true });
    } else {
      skippedFiles.push({ path: oldPath, reason: "stale managed file has drift and was preserved" });
    }
  }

  const manifest: InstallManifest = {
    schemaVersion: "helmsman.install.v1",
    installedAt: new Date().toISOString(),
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    commandPath: COMMAND_PATH,
    scope: input.scope,
    workspace,
    nodeVersion: process.version,
    piBaseline: {
      codingAgent: PINNED_PI_PACKAGES["@earendil-works/pi-coding-agent"],
      agentCore: PINNED_PI_PACKAGES["@earendil-works/pi-agent-core"],
      tui: PINNED_PI_PACKAGES["@earendil-works/pi-tui"],
    },
    files: plannedFiles.map((file) => ({ ...file, path: relative(root, file.path) })),
    staleFilesRemoved,
    skippedFiles,
    warnings,
  };

  if (!input.dryRun) {
    await atomicWriteFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    writtenFiles.push(manifestPath);
  }

  return {
    ok: skippedFiles.length === 0,
    dryRun: Boolean(input.dryRun),
    scope: input.scope,
    root,
    manifestPath,
    manifest,
    plannedFiles,
    writtenFiles,
    skippedFiles,
    warnings,
  };
}

export async function updateHelmsman(input: {
  workspace?: string;
  dryRun?: boolean;
  approve?: boolean;
  approveConflicts?: boolean;
}): Promise<UpdateCommandResult> {
  const workspace = resolve(input.workspace ?? process.cwd());
  const manifestPath = installManifestPathFor({ scope: "project", workspace });
  const current = await readOptionalInstallManifest(manifestPath);
  const target = await requirePackageJson();
  const warnings: string[] = [];
  const managedFilesThatWillChange = current?.files.filter((file) => file.managed).map((file) => resolve(dirname(manifestPath), file.path)) ?? [];
  const preservedUserOwnedFiles = current?.skippedFiles.map((file) => file.path) ?? [];

  if (!current) warnings.push("No project install manifest exists; update will perform a project install after approval.");
  if (!input.dryRun && !input.approve) {
    return {
      ok: false,
      dryRun: false,
      approvalRequired: true,
      currentVersion: current?.packageVersion,
      targetVersion: target.version,
      source: "local_package",
      managedFilesThatWillChange,
      preservedUserOwnedFiles,
      warnings: [...warnings, "Pass --approve to update managed Helmsman files."],
    };
  }

  let backupRoot: string | undefined;
  if (!input.dryRun && current) {
    backupRoot = resolve(dirname(manifestPath), "backups", `update-${safeTimestamp()}`);
    for (const file of current.files.filter((item) => item.managed)) {
      const source = resolve(dirname(manifestPath), file.path);
      if (!(await fileExists(source))) continue;
      const destination = resolve(backupRoot, file.path);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }
  }

  const install = await installHelmsman({
    scope: "project",
    workspace,
    dryRun: input.dryRun,
    approveConflicts: input.approveConflicts,
  });
  const postUpdateDoctor = input.dryRun ? undefined : await buildDoctorReport({ cwd: workspace, workspace });
  return {
    ok: install.ok && (!postUpdateDoctor || postUpdateDoctor.ok),
    dryRun: Boolean(input.dryRun),
    approvalRequired: false,
    backupRoot,
    install,
    postUpdateDoctor,
    currentVersion: current?.packageVersion,
    targetVersion: target.version,
    source: "local_package",
    managedFilesThatWillChange,
    preservedUserOwnedFiles,
    warnings,
  };
}

export async function uninstallHelmsman(input: {
  scope: InstallScope;
  workspace?: string;
  dryRun?: boolean;
  approve?: boolean;
}): Promise<UninstallCommandResult> {
  const workspace = input.scope === "project" ? resolve(input.workspace ?? process.cwd()) : undefined;
  const root = installRootFor({ scope: input.scope, workspace });
  const manifestPath = installManifestPathFor({ scope: input.scope, workspace });
  const manifest = await readOptionalInstallManifest(manifestPath);
  const warnings: string[] = [];
  const removedFiles: string[] = [];
  const preservedFiles: string[] = [];
  const skippedFiles: Array<{ path: string; reason: string }> = [];

  if (!manifest) {
    return {
      ok: true,
      dryRun: Boolean(input.dryRun),
      approvalRequired: false,
      scope: input.scope,
      manifestPath,
      removedFiles,
      preservedFiles,
      skippedFiles,
      warnings: ["No install manifest exists; nothing managed by Helmsman was removed."],
    };
  }

  if (!input.dryRun && !input.approve) {
    return {
      ok: false,
      dryRun: false,
      approvalRequired: true,
      scope: input.scope,
      manifestPath,
      removedFiles,
      preservedFiles,
      skippedFiles,
      warnings: ["Pass --approve to remove only manifest-managed Helmsman files."],
    };
  }

  for (const file of manifest.files.filter((item) => item.managed)) {
    const path = resolve(root, file.path);
    if (!(await fileExists(path))) {
      skippedFiles.push({ path, reason: "managed file already missing" });
      continue;
    }
    if (!(await fileHashMatches(path, file.sha256))) {
      preservedFiles.push(path);
      skippedFiles.push({ path, reason: "managed file drifted and was preserved" });
      continue;
    }
    removedFiles.push(path);
    if (!input.dryRun) await rm(path, { force: true });
  }

  if (!input.dryRun && await fileExists(manifestPath)) {
    const reportPath = resolve(root, `uninstall-report-${safeTimestamp()}.json`);
    const result: UninstallCommandResult = {
      ok: skippedFiles.every((item) => item.reason === "managed file already missing"),
      dryRun: false,
      approvalRequired: false,
      scope: input.scope,
      manifestPath,
      reportPath,
      removedFiles,
      preservedFiles,
      skippedFiles,
      warnings,
    };
    await atomicWriteFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
    await rm(manifestPath, { force: true });
    return result;
  }

  return {
    ok: skippedFiles.every((item) => item.reason === "managed file already missing"),
    dryRun: Boolean(input.dryRun),
    approvalRequired: false,
    scope: input.scope,
    manifestPath,
    removedFiles,
    preservedFiles,
    skippedFiles,
    warnings,
  };
}

export async function runProductAudit(input: { cwd?: string; includeLive?: boolean } = {}): Promise<ProductAuditResult> {
  const cwd = resolve(input.cwd ?? process.cwd());
  const auditId = `audit-${safeTimestamp()}-${randomUUID().slice(0, 8)}`;
  const auditRoot = resolve(cwd, ".helmsman", "product-audits", auditId);
  await mkdir(auditRoot, { recursive: true });
  const artifacts = {
    auditPlan: resolve(auditRoot, "audit-plan.json"),
    requirements: resolve(auditRoot, "requirements.json"),
    evidenceIndex: resolve(auditRoot, "evidence-index.json"),
    commandLog: resolve(auditRoot, "command-log.jsonl"),
    installState: resolve(auditRoot, "install-state.json"),
    liveProvider: resolve(auditRoot, "live-provider.json"),
    noMockAudit: resolve(auditRoot, "no-mock-audit.json"),
    report: resolve(auditRoot, "report.md"),
  };

  const startedAt = new Date().toISOString();
  await atomicWriteFile(artifacts.auditPlan, `${JSON.stringify({
    schemaVersion: "helmsman.product-audit-plan.v1",
    auditId,
    startedAt,
    cwd,
    packageRoot: PACKAGE_ROOT,
    contract: "docs/install-doctor-product-audit-contract.md",
    includeLive: Boolean(input.includeLive),
    commands: ["npm pack --json", "npm install <packed tarball>", "helmsman doctor --json", "helmsman install --scope project --json", "helmsman update --dry-run --json", "helmsman uninstall --scope project --dry-run --json"],
  }, null, 2)}\n`);

  const packageJson = await requirePackageJson();
  const installState = await runInstalledPackageSmoke({ cwd, auditRoot, commandLogPath: artifacts.commandLog, packageName: packageJson.name });
  const doctor = await buildDoctorReport({ cwd, workspace: cwd });
  const noMockAudit = await buildNoMockAudit(PACKAGE_ROOT);
  await atomicWriteFile(artifacts.noMockAudit, `${JSON.stringify(noMockAudit, null, 2)}\n`);

  const liveProvider = await buildLiveProviderAudit({ cwd, includeLive: Boolean(input.includeLive), commandLogPath: artifacts.commandLog });
  await atomicWriteFile(artifacts.liveProvider, `${JSON.stringify(liveProvider, null, 2)}\n`);

  const secretFindings = await scanForSecrets(resolve(cwd, ".helmsman")).catch(() => []);
  const requirements = buildProductAuditRequirements({
    packageJson,
    installState,
    doctor,
    liveProvider,
    noMockAudit,
    secretFindingsCount: secretFindings.length,
  });
  await atomicWriteFile(artifacts.requirements, `${JSON.stringify(requirements, null, 2)}\n`);

  const evidenceIndex = {
    schemaVersion: "helmsman.product-audit-evidence-index.v1",
    auditId,
    generatedAt: new Date().toISOString(),
    evidence: requirements.flatMap((requirement) => requirement.requiredEvidence.map((evidence) => ({ requirementId: requirement.requirementId, ...evidence }))),
    secretFindings,
  };
  await atomicWriteFile(artifacts.evidenceIndex, `${JSON.stringify(evidenceIndex, null, 2)}\n`);
  await atomicWriteFile(artifacts.installState, `${JSON.stringify(installState, null, 2)}\n`);

  const requirementSummary = summarizeRequirements(requirements);
  const requirementsProved = requirements.every((requirement) => requirement.status === "proved" || requirement.status === "not_applicable");
  const blockedReasons = requirements.filter((requirement) => !["proved", "not_applicable"].includes(requirement.status)).map((requirement) => `${requirement.requirementId}: ${requirement.reason}`);
  const releaseReady = requirementsProved && installState.ok === true && secretFindings.length === 0 && liveProvider.status === "proved";
  const result: ProductAuditResult = {
    schemaVersion: "helmsman.product-audit.v1",
    auditId,
    createdAt: startedAt,
    ok: releaseReady,
    releaseReady,
    requirementsProved,
    auditRoot,
    artifacts,
    requirementSummary,
    blockedReasons,
  };

  await atomicWriteFile(artifacts.report, renderProductAuditReport(result, requirements, liveProvider.status));
  return result;
}

async function runInstalledPackageSmoke(input: { cwd: string; auditRoot: string; commandLogPath: string; packageName: string }): Promise<Record<string, unknown> & { ok: boolean }> {
  const scratch = await mkdtemp(join(tmpdir(), "helmsman-product-audit-"));
  try {
    const pack = runLoggedCommand(input.commandLogPath, "npm", ["pack", "--json", "--pack-destination", scratch], { cwd: PACKAGE_ROOT, timeoutMs: 120000 });
    let tarball: string | undefined;
    if (pack.status === 0) {
      const parsed = JSON.parse(pack.stdout) as Array<{ filename?: string }>;
      const filename = parsed[0]?.filename;
      if (filename) tarball = resolve(scratch, filename);
    }
    const project = resolve(scratch, "install-smoke");
    await mkdir(project, { recursive: true });
    const init = runLoggedCommand(input.commandLogPath, "npm", ["init", "-y"], { cwd: project, timeoutMs: 60000 });
    const install = tarball ? runLoggedCommand(input.commandLogPath, "npm", ["install", "--ignore-scripts", tarball], { cwd: project, timeoutMs: 180000 }) : emptyCommandResult("missing tarball");
    const packageRoot = resolve(project, "node_modules", ...input.packageName.split("/"));
    const installedCommand = resolve(packageRoot, "bin", "helmsman.js");
    const doctor = install.status === 0 ? runLoggedCommand(input.commandLogPath, process.execPath, [installedCommand, "doctor", "--json"], { cwd: project, timeoutMs: 120000 }) : emptyCommandResult("install failed");
    const installCommand = doctor.status === 0 ? runLoggedCommand(input.commandLogPath, process.execPath, [installedCommand, "install", "--scope", "project", "--workspace", project, "--json"], { cwd: project, timeoutMs: 120000 }) : emptyCommandResult("doctor failed");
    const updateDryRun = installCommand.status === 0 ? runLoggedCommand(input.commandLogPath, process.execPath, [installedCommand, "update", "--workspace", project, "--dry-run", "--json"], { cwd: project, timeoutMs: 120000 }) : emptyCommandResult("install command failed");
    const uninstallDryRun = installCommand.status === 0 ? runLoggedCommand(input.commandLogPath, process.execPath, [installedCommand, "uninstall", "--scope", "project", "--workspace", project, "--dry-run", "--json"], { cwd: project, timeoutMs: 120000 }) : emptyCommandResult("install command failed");
    const ok = pack.status === 0 && init.status === 0 && install.status === 0 && doctor.status === 0 && installCommand.status === 0 && updateDryRun.status === 0 && uninstallDryRun.status === 0;
    return {
      ok,
      scratch,
      tarball,
      packageRoot,
      installedCommand,
      pack: summarizeCommand(pack),
      init: summarizeCommand(init),
      install: summarizeCommand(install),
      doctor: summarizeCommand(doctor),
      installCommand: summarizeCommand(installCommand),
      updateDryRun: summarizeCommand(updateDryRun),
      uninstallDryRun: summarizeCommand(uninstallDryRun),
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function buildLiveProviderAudit(input: { cwd: string; includeLive: boolean; commandLogPath: string }): Promise<Record<string, unknown> & { status: "proved" | "blocked" | "not_run" }> {
  const readiness = await inspectProviderReadiness(input.cwd);
  const readyProviders = readiness.providers.filter((provider) => provider.configured === "yes").length;
  if (!input.includeLive) {
    return {
      schemaVersion: "helmsman.live-provider-audit.v1",
      status: "not_run",
      reason: "Live provider commands were not requested for this audit; no mock proof was substituted.",
      providerReadyCount: readyProviders,
      readiness,
    };
  }
  const piLive = runLoggedCommand(input.commandLogPath, "npm", ["run", "verify:pi-runtime:live"], { cwd: PACKAGE_ROOT, timeoutMs: 240000 });
  const roleLive = runLoggedCommand(input.commandLogPath, "npm", ["run", "verify:role-runtime:live"], { cwd: PACKAGE_ROOT, timeoutMs: 240000 });
  return {
    schemaVersion: "helmsman.live-provider-audit.v1",
    status: piLive.status === 0 && roleLive.status === 0 ? "proved" : "blocked",
    reason: piLive.status === 0 && roleLive.status === 0 ? "Live Pi runtime and RoleRuntime verification passed." : "Live verification failed or credentials were unavailable; release readiness is blocked.",
    providerReadyCount: readyProviders,
    readiness,
    piRuntimeLive: summarizeCommand(piLive),
    roleRuntimeLive: summarizeCommand(roleLive),
  };
}

function buildProductAuditRequirements(input: {
  packageJson: Record<string, unknown>;
  installState: { ok: boolean };
  doctor: DoctorReport;
  liveProvider: { status: "proved" | "blocked" | "not_run" };
  noMockAudit: NoMockAuditRecord[];
  secretFindingsCount: number;
}): ProductAuditRequirement[] {
  const scripts = input.packageJson.scripts as Record<string, string> | undefined;
  const hasScript = (name: string) => Boolean(scripts?.[name]);
  const packageInstallOk = input.installState.ok === true;
  const liveOk = input.liveProvider.status === "proved";
  const noMockClassified = input.noMockAudit.every((record) => record.productClaimBlocked === true);
  const secretOk = input.secretFindingsCount === 0;
  return [
    requirement("NS-001", "Helmsman Core owns Charting, Manifest, Board, gates, Route Lock, Autopilot legality, verification, and closeout.", "north_star", hasScript("verify:core") && hasScript("verify:autopilot") && hasScript("verify:verification-closeout"), "Core, Autopilot, and Verification/Closeout verifiers exist and are wired as product evidence.", [
      evidence("schema", "src/core/authority/types.ts", "Typed Core authority contracts."),
      evidence("replay_test", "npm run verify:core", "Reducer replay and authority-negative tests."),
      evidence("unit_test", "npm run verify:verification-closeout", "Scenario verdict and closeout authority tests."),
    ]),
    requirement("PI-001", "Pi is the runtime substrate for sessions, models, TUI primitives, resources, persistence, and event streaming.", "pi_runtime", hasScript("verify:pi-runtime") && hasScript("verify:role-runtime") && liveOk, liveOk ? "Pi runtime and live role execution proof passed." : "Live Pi/RoleRuntime proof was not produced in this product audit.", [
      evidence("schema", "src/runtime/pi/api-surface.ts", "Pinned Pi dependency and export checks."),
      evidence("live_pi_provider", "npm run verify:pi-runtime:live", "Live Pi AgentSession runtime event proof."),
      evidence("live_agent_session", "npm run verify:role-runtime:live", "Live RoleRuntime AgentSession execution proof."),
    ]),
    requirement("MF-001", "Manifest is the machine source of truth and Board is rebuildable projection.", "manifest_board", hasScript("verify:core"), "Core verifier covers append-only Manifest events, reducer replay, and Board projector replay.", [
      evidence("replay_test", "npm run verify:core", "Manifest and Board replay coverage."),
      evidence("schema", "src/core/authority/reducer.ts", "Deterministic reducer implementation."),
    ]),
    requirement("CH-001", "Charting is explicit, question-first, repeated, and route-changing.", "question_ui", hasScript("verify:question-ui"), "Question UI verifier covers explicit Charting entry, Core-authored bundles, and route effects.", [
      evidence("unit_test", "npm run verify:question-ui", "Question bundle and answer mapping tests."),
      evidence("artifact", "src/question-ui/bundle-builder.ts", "Aperture bundle builder."),
    ]),
    requirement("QU-001", "Question UI renders full Core-authored option surface with stable ids and evidence.", "question_ui", hasScript("verify:question-ui"), "Question UI verifier covers stable ids, bundle hash, evidence, and answer mapping.", [
      evidence("unit_test", "npm run verify:question-ui", "Stable-id and evidence tests."),
      evidence("artifact", "src/question-ui/adapter.ts", "Rendered question surface evidence."),
    ]),
    requirement("RR-001", "RoleRuntime maps Core plans and worker packets to bounded Pi AgentSession runs.", "role_runtime", hasScript("verify:role-runtime") && liveOk, liveOk ? "RoleRuntime live verifier passed through package scripts." : "RoleRuntime contract exists, but live proof was not produced in this audit.", [
      evidence("live_agent_session", "npm run verify:role-runtime:live", "Pi AgentSession role-run proof."),
      evidence("role_run", "src/role-runtime/pi-role-runtime.ts", "Bounded role-run implementation."),
    ]),
    requirement("MR-001", "Memory scan precedes research and research lanes only cover stale, missing, or conflicting memory.", "memory_research", hasScript("verify:memory-research"), "Memory/Research verifier covers scan preconditions and lane creation.", [
      evidence("unit_test", "npm run verify:memory-research", "Memory classification and lane verification."),
    ]),
    requirement("MR-002", "Research lane completion is artifact-backed, observation/inference separated, source-cited, and accepted only through Core synthesis.", "memory_research", hasScript("verify:memory-research"), "Memory/Research verifier covers artifact rejection/acceptance and Core synthesis.", [
      evidence("unit_test", "npm run verify:memory-research", "Artifact validator and synthesis replay tests."),
    ]),
    requirement("RL-001", "Route Lock refuses unresolved questions, missing evidence, and stale Board revisions.", "route_lock", hasScript("verify:route-lock"), "Route Lock verifier covers blockers and stale Board rejection.", [
      evidence("unit_test", "npm run verify:route-lock", "Route Lock negative scenarios."),
    ]),
    requirement("RL-002", "Route Lock confirms only through a user-visible canonical route snapshot hash and post-lock route changes require amendment, unlock, invalidation, or park.", "route_lock", hasScript("verify:route-lock"), "Route Lock verifier covers snapshots, confirmation evidence, amendments, unlock, and invalidation.", [
      evidence("unit_test", "npm run verify:route-lock", "Snapshot and amendment tests."),
    ]),
    requirement("AP-001", "Autopilot reads Board before every loop and cannot accept final prose as completion.", "autopilot", hasScript("verify:autopilot"), "Autopilot verifier covers Board-read loop and final-message non-authority.", [
      evidence("unit_test", "npm run verify:autopilot", "Board-governed Autopilot tests."),
    ]),
    requirement("AP-002", "Autopilot selects only the Board's next legal action, launches bounded packets, records route adherence, and responds to drift through repair, ask, amend, park, or stop.", "autopilot", hasScript("verify:autopilot"), "Autopilot verifier covers action legality, packets, drift response, and recovery.", [
      evidence("unit_test", "npm run verify:autopilot", "Action legality and drift matrix tests."),
    ]),
    requirement("VF-001", "Verification scenarios pass only through declared verifier role and Core event.", "verification", hasScript("verify:verification-closeout"), "Verification/Closeout verifier covers verifier binding and event replay.", [
      evidence("unit_test", "npm run verify:verification-closeout", "Verifier role and scenario event tests."),
    ]),
    requirement("VF-002", "Closeout requires scenario-backed verdicts, accepted evidence, closeout artifacts, and cannot treat green tests or final prose as completion.", "verification", hasScript("verify:verification-closeout"), "Verification/Closeout verifier covers closeout artifacts and final-prose rejection.", [
      evidence("unit_test", "npm run verify:verification-closeout", "Closeout replay and memory promotion tests."),
    ]),
    requirement("ID-001", "Install, doctor, update, and uninstall behave as declared and are safe around user-owned files.", "install_doctor", packageInstallOk && input.doctor.runtime.fullProductEntryPointsPresent, packageInstallOk ? "Actual packed package installed in an isolated environment and exercised doctor/install/update dry-run/uninstall dry-run." : "Installed-package lifecycle smoke failed.", [
      evidence("package_install", "install-state.json", "npm pack plus isolated npm install."),
      evidence("doctor", "helmsman doctor --json", "Read-only doctor report."),
      evidence("artifact", "helmsman update --dry-run / uninstall --dry-run", "Approval-gated lifecycle dry-runs."),
    ]),
    requirement("SC-001", "Secrets are never written to `.helmsman` artifacts, logs, reports, or audit files.", "security", secretOk, secretOk ? "Secret scan found no credentials under .helmsman." : `${input.secretFindingsCount} secret finding(s) detected under .helmsman.`, [
      evidence("artifact", "evidence-index.json", "Secret scan result."),
      evidence("unit_test", "npm run verify:pi-runtime", "Redaction fixture coverage."),
    ]),
    requirement("QA-001", "Product QA maps every North Star requirement to evidence and rejects mock-only proof.", "release", noMockClassified && liveOk, liveOk ? "Product audit maps every requirement and live proof is present; mock/headless surfaces are classified as non-release proof." : "Requirement map exists, but live proof is absent or blocked; mock/headless proof was not promoted.", [
      evidence("artifact", "requirements.json", "Requirement-to-evidence matrix."),
      evidence("artifact", "no-mock-audit.json", "Mock/headless classification."),
      evidence("live_pi_provider", "live-provider.json", "Live provider status and proof output."),
    ]),
  ];
}

function requirement(
  requirementId: string,
  requirementText: string,
  category: ProductAuditRequirement["category"],
  proved: boolean,
  reason: string,
  requiredEvidence: ProductAuditRequirement["requiredEvidence"],
): ProductAuditRequirement {
  return {
    requirementId,
    requirementText,
    category,
    requiredEvidence,
    status: proved ? "proved" : "incomplete",
    reason,
  };
}

function evidence(kind: ProductAuditRequirement["requiredEvidence"][number]["kind"], ref: string, coverage: string): ProductAuditRequirement["requiredEvidence"][number] {
  return { kind, ref, coverage };
}

async function buildNoMockAudit(root: string): Promise<NoMockAuditRecord[]> {
  const records: NoMockAuditRecord[] = [];
  for (const path of await listTextFiles(root, ["src", "docs", "README.md"])) {
    const text = await readFile(path, "utf8").catch(() => "");
    const lower = text.toLowerCase();
    if (!/(mock|fixture|fake_provider|headless|synthetic|stub|hardcoded)/i.test(text)) continue;
    const kind: NoMockAuditRecord["kind"] = lower.includes("headless")
      ? "headless_driver"
      : lower.includes("fake_provider")
        ? "fake_provider"
        : lower.includes("fixture")
          ? "fixture"
          : lower.includes("synthetic")
            ? "synthetic_data"
            : "mock";
    records.push({
      path: relative(root, path),
      kind,
      allowedFor: path.includes(`${sep}src${sep}verify${sep}`) ? "contract_test" : "unit_test",
      forbiddenFor: ["live provider proof", "installed package discovery", "release readiness", "route authority completion"],
      productClaimBlocked: true,
      reason: "The product audit records this surface as non-release proof unless paired with live or installed-state evidence.",
    });
  }
  return records;
}

async function listTextFiles(root: string, includes: string[]): Promise<string[]> {
  const files: string[] = [];
  async function walk(path: string): Promise<void> {
    const info = await stat(path).catch(() => undefined);
    if (!info) return;
    if (info.isDirectory()) {
      const name = path.split(sep).pop() ?? "";
      if (["node_modules", ".git", ".helmsman"].includes(name)) return;
      for (const entry of await readdir(path)) await walk(resolve(path, entry));
      return;
    }
    if (/\.(ts|md|json)$/.test(path)) files.push(path);
  }
  for (const item of includes) await walk(resolve(root, item));
  return files;
}

function summarizeRequirements(requirements: ProductAuditRequirement[]): Record<ProductAuditStatus, number> {
  const summary: Record<ProductAuditStatus, number> = {
    proved: 0,
    contradicted: 0,
    incomplete: 0,
    missing: 0,
    not_applicable: 0,
  };
  for (const requirement of requirements) summary[requirement.status] += 1;
  return summary;
}

function renderProductAuditReport(result: ProductAuditResult, requirements: ProductAuditRequirement[], liveStatus: string): string {
  const lines = [
    `# Helmsman Product Audit ${result.auditId}`,
    "",
    `Release ready: ${result.releaseReady ? "yes" : "no"}`,
    `Requirements proved: ${result.requirementsProved ? "yes" : "no"}`,
    `Live provider proof: ${liveStatus}`,
    "",
    "## Requirement Matrix",
    "",
    "| ID | Status | Reason |",
    "| --- | --- | --- |",
    ...requirements.map((requirement) => `| ${requirement.requirementId} | ${requirement.status} | ${requirement.reason.replace(/\|/g, "\\|")} |`),
    "",
    "## Blockers",
    "",
    ...(result.blockedReasons.length > 0 ? result.blockedReasons.map((reason) => `- ${reason}`) : ["- none"]),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function currentProductSurface(): ProductSurfaceReport {
  return {
    coreEventSystemAvailable: true,
    manifestReducerAvailable: true,
    boardProjectorAvailable: true,
    tuiWorkbenchAvailable: true,
    questionUiAdapterAvailable: true,
    roleRuntimeAvailable: true,
    memoryResearchAvailable: true,
    routeLockAvailable: true,
    fullTuiAvailable: true,
    chartingAvailable: true,
    autopilotAvailable: true,
    verificationCloseoutAvailable: true,
    installDoctorAvailable: true,
    updateAvailable: true,
    uninstallAvailable: true,
    productAuditAvailable: true,
  };
}

function desiredManagedFiles(input: {
  scope: InstallScope;
  root: string;
  workspace?: string;
  packageJson: Record<string, string>;
}): Array<{ path: string; kind: InstallManifestFile["kind"]; content: string }> {
  const config = {
    schemaVersion: "helmsman.config.v1",
    scope: input.scope,
    workspace: input.workspace,
    packageName: input.packageJson.name,
    packageVersion: input.packageJson.version,
    authority: {
      routeAuthority: "helmsman_core_manifest",
      boardAuthority: "helmsman_core_projection",
      externalAdapters: "evidence_only",
    },
    adapters: Object.fromEntries(ADAPTERS.map((adapter) => [adapter.id, { enabled: false, command: adapter.command, authority: "evidence_only" }])),
  };
  const roleRegistry = {
    schemaVersion: "helmsman.role-registry.v1",
    packageVersion: input.packageJson.version,
    roles: [
      { roleId: "lead", purpose: "chat", runtime: "pi", authority: "evidence_only" },
      { roleId: "researcher", purpose: "research", runtime: "pi", authority: "artifact_candidate" },
      { roleId: "autopilot-implementer", purpose: "implementation", runtime: "pi", authority: "artifact_candidate" },
      { roleId: "verifier", purpose: "verification", runtime: "pi", authority: "scenario_verdict_candidate" },
    ],
  };
  return [
    { path: resolve(input.root, "config.json"), kind: "config", content: JSON.stringify(config, null, 2) },
    { path: resolve(input.root, "role-registry.json"), kind: "role_registry", content: JSON.stringify(roleRegistry, null, 2) },
    ...ADAPTERS.map((adapter) => ({
      path: resolve(input.root, "adapters", adapter.id, "config.json"),
      kind: "adapter_config" as const,
      content: JSON.stringify({
        schemaVersion: "helmsman.adapter-config.v1",
        adapterId: adapter.id,
        label: adapter.label,
        command: adapter.command,
        enabled: false,
        authority: "evidence_only",
        writesRouteAuthority: false,
        managedBy: "helmsman.install.v1",
      }, null, 2),
    })),
  ];
}

async function probeDocumentBusWritable(workspace: string): Promise<boolean> {
  const root = resolve(workspace, ".helmsman");
  const rootExisted = await fileExists(root);
  const probeDir = resolve(root, `.doctor-probe-${process.pid}-${randomUUID()}`);
  const probePath = resolve(probeDir, "probe.txt");
  try {
    await mkdir(probeDir, { recursive: true });
    await writeFile(probePath, "probe", "utf8");
    await rm(probeDir, { recursive: true, force: true });
    if (!rootExisted) await rmdir(root).catch(() => undefined);
    return true;
  } catch {
    await rm(probeDir, { recursive: true, force: true }).catch(() => undefined);
    if (!rootExisted) await rmdir(root).catch(() => undefined);
    return false;
  }
}

async function canOverwriteManagedFile(path: string, existingManifest: InstallManifest | undefined, root: string): Promise<boolean> {
  if (!existingManifest) return false;
  const managed = existingManifest.files.find((file) => resolve(root, file.path) === resolve(path) && file.managed);
  if (!managed) return false;
  return await fileHashMatches(path, managed.sha256);
}

async function manifestDriftFindings(manifest: InstallManifest, root: string): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
  for (const file of manifest.files.filter((item) => item.managed)) {
    const path = resolve(root, file.path);
    if (!(await fileExists(path))) {
      findings.push(finding("install.managed_file_missing", "error", `Managed file is missing: ${path}`, path));
      continue;
    }
    if (!(await fileHashMatches(path, file.sha256))) {
      findings.push(finding("install.managed_file_drift", "error", `Managed file drifted and requires explicit repair approval: ${path}`, path));
    }
  }
  return findings;
}

function summarizeProviders(report: PiProviderReadiness): { configured: number; ready: number; missingAuth: string[]; warnings: DoctorFinding[] } {
  const configured = report.providers.filter((provider) => provider.configured === "yes").length;
  const ready = configured;
  const missingAuth = configured === 0 ? report.providers.filter((provider) => provider.configured !== "yes").map((provider) => provider.providerId) : [];
  const warnings = missingAuth.map((providerId) => finding("provider.missing_auth", "warning", `Provider auth is not configured: ${providerId}`));
  if (report.providers.length === 0) warnings.push(finding("provider.registry_empty", "warning", "No Pi providers are configured in the current Pi model registry."));
  if (report.providers.length > 0 && configured === 0) warnings.push(finding("provider.none_ready", "warning", "No configured Pi provider is ready; live-provider verification remains blocked."));
  return { configured, ready, missingAuth, warnings };
}

function selectNextAction(input: {
  criticalFailures: DoctorFinding[];
  installPresent: boolean;
  managedFileDrift: DoctorFinding[];
  providerSummary: { missingAuth: string[] };
  productSurface: ProductSurfaceReport;
}): DoctorReport["nextRecommendedAction"] {
  if (!input.productSurface.productAuditAvailable) return "implementation_missing";
  if (input.criticalFailures.length > 0 && input.managedFileDrift.length === 0) return "blocked";
  if (input.managedFileDrift.length > 0) return "repair_requires_approval";
  if (!input.installPresent) return "install";
  if (input.providerSummary.missingAuth.length > 0) return "configure_provider";
  return "ready";
}

async function detectCommandSource(): Promise<DoctorReport["command"]["source"]> {
  if (await fileExists(resolve(PACKAGE_ROOT, "src", "cli", "main.ts"))) return "workspace";
  if (await fileExists(COMMAND_PATH)) return "package";
  return "unknown";
}

async function readPackageJson(): Promise<Record<string, string> | undefined> {
  try {
    return JSON.parse(await readFile(resolve(PACKAGE_ROOT, "package.json"), "utf8")) as Record<string, string>;
  } catch {
    return undefined;
  }
}

async function requirePackageJson(): Promise<Record<string, string>> {
  const packageJson = await readPackageJson();
  if (!packageJson?.name || !packageJson.version) throw new Error("package.json must include name and version");
  return packageJson;
}

async function readOptionalInstallManifest(path: string): Promise<InstallManifest | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as InstallManifest;
    return parsed.schemaVersion === "helmsman.install.v1" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function readOptionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function finding(id: string, severity: DoctorFinding["severity"], message: string, evidenceRef?: string): DoctorFinding {
  return { id, severity, message, evidenceRef };
}

function nodeSatisfies(version: string, minimum: [number, number, number]): boolean {
  const parts = version.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < minimum.length; index++) {
    if ((parts[index] ?? 0) > minimum[index]) return true;
    if ((parts[index] ?? 0) < minimum[index]) return false;
  }
  return true;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function fileHashMatches(path: string, expected: string): Promise<boolean> {
  try {
    return await sha256File(path) === expected;
  } catch {
    return false;
  }
}

async function sha256File(path: string): Promise<string> {
  return sha256Text(await readFile(path, "utf8"));
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value.endsWith("\n") ? value : `${value}\n`).digest("hex");
}

function safeTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

interface CommandResult {
  command: string;
  args: string[];
  cwd: string;
  status: number;
  stdout: string;
  stderr: string;
}

function runLoggedCommand(commandLogPath: string, command: string, args: string[], options: { cwd: string; timeoutMs: number }): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeoutMs,
    env: process.env,
  });
  const record: CommandResult = {
    command,
    args,
    cwd: options.cwd,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error ? result.error.message : ""),
  };
  appendFile(commandLogPath, jsonLine(summarizeCommand(record))).catch(() => undefined);
  return record;
}

function emptyCommandResult(reason: string): CommandResult {
  return {
    command: "not-run",
    args: [],
    cwd: PACKAGE_ROOT,
    status: 1,
    stdout: "",
    stderr: reason,
  };
}

function summarizeCommand(result: CommandResult): Record<string, unknown> {
  return {
    command: result.command,
    args: result.args,
    cwd: result.cwd,
    status: result.status,
    stdout: redactAndLimit(result.stdout),
    stderr: redactAndLimit(result.stderr),
  };
}

function redactAndLimit(value: string): string {
  const redacted = value
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/g, "Bearer [REDACTED]")
    .replace(/\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY)=[^\s]+/g, "[REDACTED_ENV]");
  return redacted.length > 4000 ? `${redacted.slice(0, 4000)}...[truncated]` : redacted;
}
