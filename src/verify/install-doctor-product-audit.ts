import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DoctorReport, InstallCommandResult, ProductAuditResult, UninstallCommandResult, UpdateCommandResult } from "../install-doctor/types.ts";

const bin = fileURLToPath(new URL("../../bin/helmsman.js", import.meta.url));

async function main(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "helmsman-gate9-"));
  try {
    await verifyDoctorIsReadOnly(workspace);
    await verifyInstallAndDoctor(workspace);
    await verifyUpdateApprovalAndBackup(workspace);
    await verifyUninstallBoundaries(workspace);
    await verifyConflictProtection(workspace);
    await verifyProductAuditCommand(workspace);
    console.log("Install/doctor/product-audit verification passed");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function verifyDoctorIsReadOnly(workspace: string): Promise<void> {
  const before = await pathExists(join(workspace, ".helmsman"));
  const doctor = run(["doctor", "--workspace", workspace, "--json"], workspace);
  assert.equal(doctor.status, 0, doctor.stderr);
  const report = JSON.parse(doctor.stdout) as DoctorReport;
  assert.equal(report.schemaVersion, "helmsman.doctor.v1");
  assert.equal(report.ok, true);
  assert.equal(report.runtime.fullProductEntryPointsPresent, true);
  assert.equal(report.productSurface.productAuditAvailable, true);
  assert.equal(report.nextRecommendedAction, "install");
  const after = await pathExists(join(workspace, ".helmsman"));
  assert.equal(after, before, "doctor must clean its temporary Document Bus probe");
}

async function verifyInstallAndDoctor(workspace: string): Promise<void> {
  const dryRun = JSON.parse(run(["install", "--scope", "project", "--workspace", workspace, "--dry-run", "--json"], workspace).stdout) as InstallCommandResult;
  assert.equal(dryRun.dryRun, true);
  assert.equal(await pathExists(join(workspace, ".helmsman")), false, "install --dry-run must not write project state");

  const install = JSON.parse(run(["install", "--scope", "project", "--workspace", workspace, "--json"], workspace).stdout) as InstallCommandResult;
  assert.equal(install.ok, true);
  assert.equal(install.scope, "project");
  assert(install.writtenFiles.some((path) => path.endsWith("install-manifest.json")));
  const manifestText = await readFile(join(workspace, ".helmsman", "install-manifest.json"), "utf8");
  assert(manifestText.includes('"schemaVersion": "helmsman.install.v1"'));
  const manifest = JSON.parse(manifestText) as InstallCommandResult["manifest"];
  assert(manifest.files.some((file) => file.kind === "role_registry"));
  for (const file of manifest.files) {
    const text = await readFile(resolve(workspace, ".helmsman", file.path), "utf8");
    assert.equal(sha256(text), file.sha256, `hash mismatch for ${file.path}`);
  }

  const manifestHashBefore = sha256(await readFile(join(workspace, ".helmsman", "install-manifest.json"), "utf8"));
  const doctor = JSON.parse(run(["doctor", "--workspace", workspace, "--json"], workspace).stdout) as DoctorReport;
  const manifestHashAfter = sha256(await readFile(join(workspace, ".helmsman", "install-manifest.json"), "utf8"));
  assert.equal(manifestHashAfter, manifestHashBefore, "doctor must not repair or rewrite install manifests");
  assert.equal(doctor.ok, true);
  assert.equal(doctor.install.projectManifest, join(workspace, ".helmsman", "install-manifest.json"));
  assert.notEqual(doctor.nextRecommendedAction, "install");
}

async function verifyUpdateApprovalAndBackup(workspace: string): Promise<void> {
  const noApproval = run(["update", "--workspace", workspace, "--json"], workspace);
  assert.equal(noApproval.status, 3);
  const approvalReport = JSON.parse(noApproval.stdout) as UpdateCommandResult;
  assert.equal(approvalReport.approvalRequired, true);

  const dryRun = JSON.parse(run(["update", "--workspace", workspace, "--dry-run", "--json"], workspace).stdout) as UpdateCommandResult;
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.approvalRequired, false);
  assert(dryRun.managedFilesThatWillChange.length > 0);

  const approved = JSON.parse(run(["update", "--workspace", workspace, "--approve", "--json"], workspace).stdout) as UpdateCommandResult;
  assert.equal(approved.ok, true);
  assert(approved.backupRoot, "approved update must create a rollback pointer for managed files");
  assert.equal(approved.postUpdateDoctor?.ok, true);
  assert(await pathExists(approved.backupRoot!));
}

async function verifyUninstallBoundaries(workspace: string): Promise<void> {
  const configPath = join(workspace, ".helmsman", "config.json");
  await writeFile(configPath, `${await readFile(configPath, "utf8")}\n`, "utf8");

  const dryRun = JSON.parse(run(["uninstall", "--scope", "project", "--workspace", workspace, "--dry-run", "--json"], workspace).stdout) as UninstallCommandResult;
  assert.equal(dryRun.dryRun, true);
  assert(await pathExists(join(workspace, ".helmsman", "role-registry.json")), "uninstall dry-run must not remove files");

  const noApproval = run(["uninstall", "--scope", "project", "--workspace", workspace, "--json"], workspace);
  assert.equal(noApproval.status, 3);
  const approvalReport = JSON.parse(noApproval.stdout) as UninstallCommandResult;
  assert.equal(approvalReport.approvalRequired, true);

  const approved = JSON.parse(run(["uninstall", "--scope", "project", "--workspace", workspace, "--approve", "--json"], workspace).stdout) as UninstallCommandResult;
  assert.equal(approved.approvalRequired, false);
  assert(approved.preservedFiles.includes(configPath), "drifted managed file must be preserved instead of silently removed");
  assert(await pathExists(configPath), "drifted file should still exist");
  assert(approved.reportPath && await pathExists(approved.reportPath), "uninstall must write a report");
}

async function verifyConflictProtection(root: string): Promise<void> {
  const workspace = join(root, "conflict-workspace");
  const configPath = join(workspace, ".helmsman", "config.json");
  await writeFile(configPath, "user-owned=true\n", "utf8").catch(async (error) => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await import("node:fs/promises").then(({ mkdir }) => mkdir(join(workspace, ".helmsman"), { recursive: true }));
    await writeFile(configPath, "user-owned=true\n", "utf8");
  });
  const install = run(["install", "--scope", "project", "--workspace", workspace, "--json"], workspace);
  assert.equal(install.status, 3);
  const result = JSON.parse(install.stdout) as InstallCommandResult;
  assert(result.skippedFiles.some((file) => file.path === configPath));
  assert.equal(await readFile(configPath, "utf8"), "user-owned=true\n");
}

async function verifyProductAuditCommand(workspace: string): Promise<void> {
  const auditRun = run(["product-audit", "--cwd", workspace, "--json"], workspace, 300000);
  assert(auditRun.status === 0 || auditRun.status === 3, auditRun.stderr);
  const audit = JSON.parse(auditRun.stdout) as ProductAuditResult;
  assert.equal(audit.schemaVersion, "helmsman.product-audit.v1");
  assert(await pathExists(audit.artifacts.auditPlan));
  assert(await pathExists(audit.artifacts.requirements));
  assert(await pathExists(audit.artifacts.evidenceIndex));
  assert(await pathExists(audit.artifacts.commandLog));
  assert(await pathExists(audit.artifacts.installState));
  assert(await pathExists(audit.artifacts.noMockAudit));
  assert(await pathExists(audit.artifacts.report));
  const installState = JSON.parse(await readFile(audit.artifacts.installState, "utf8")) as { ok?: boolean };
  assert.equal(installState.ok, true, "product audit must install the packed package and run installed lifecycle commands");
  const requirements = JSON.parse(await readFile(audit.artifacts.requirements, "utf8")) as Array<{ requirementId: string; status: string }>;
  for (const id of ["NS-001", "PI-001", "MF-001", "CH-001", "QU-001", "RR-001", "MR-001", "MR-002", "RL-001", "RL-002", "AP-001", "AP-002", "VF-001", "VF-002", "ID-001", "SC-001", "QA-001"]) {
    assert(requirements.some((requirement) => requirement.requirementId === id), `missing product-audit requirement ${id}`);
  }
  assert(requirements.some((requirement) => requirement.requirementId === "ID-001" && requirement.status === "proved"));
  const noMock = JSON.parse(await readFile(audit.artifacts.noMockAudit, "utf8")) as Array<{ productClaimBlocked: boolean }>;
  assert(noMock.length > 0);
  assert(noMock.every((record) => record.productClaimBlocked === true), "mock/headless records must be blocked from release proof");
}

function run(args: string[], cwd: string, timeoutMs = 120000): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr || (result.error ? result.error.message : ""),
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value.endsWith("\n") ? value : `${value}\n`).digest("hex");
}

await main();
