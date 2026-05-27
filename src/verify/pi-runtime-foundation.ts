import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scanForSecrets } from "../core/redaction/secrets.ts";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

const checks: Check[] = [];
const live = process.argv.includes("--live");
const bin = fileURLToPath(new URL("../../bin/helmsman.js", import.meta.url));

async function main(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "helmsman-gate1-"));
  try {
    const doctor = run(["doctor", "--json"]);
    checks.push({ name: "doctor import/package surface", ok: doctor.status === 0, detail: doctor.stderr || doctor.stdout });
    const doctorJson = JSON.parse(doctor.stdout);
    checks.push({ name: "doctor contract schema", ok: doctorJson.schemaVersion === "helmsman.doctor.v1" });
    checks.push({ name: "node floor", ok: doctorJson.checks.some((check: { id: string; severity: string }) => check.id === "node.version" && check.severity === "info"), detail: doctorJson.environment.nodeVersion });
    checks.push({
      name: "pinned Pi package versions",
      ok: doctorJson.piApiSurface.packages.every((pkg: { versionMatches: boolean }) => pkg.versionMatches),
    });
    checks.push({
      name: "required Pi exports",
      ok: doctorJson.piApiSurface.packages.every((pkg: { missingExports: string[] }) => pkg.missingExports.length === 0),
    });
    checks.push({
      name: "doctor reports implemented surfaces without claiming later surfaces",
      ok:
        doctorJson.productSurface.coreEventSystemAvailable === true &&
        doctorJson.productSurface.manifestReducerAvailable === true &&
        doctorJson.productSurface.boardProjectorAvailable === true &&
        doctorJson.productSurface.tuiWorkbenchAvailable === true &&
        doctorJson.productSurface.questionUiAdapterAvailable === true &&
        doctorJson.productSurface.roleRuntimeAvailable === true &&
        doctorJson.productSurface.memoryResearchAvailable === true &&
        doctorJson.productSurface.routeLockAvailable === true &&
        doctorJson.productSurface.fullTuiAvailable === true &&
        doctorJson.productSurface.chartingAvailable === true &&
        doctorJson.productSurface.autopilotAvailable === true &&
        doctorJson.productSurface.verificationCloseoutAvailable === true &&
        doctorJson.productSurface.installDoctorAvailable === true &&
        doctorJson.productSurface.updateAvailable === true &&
        doctorJson.productSurface.uninstallAvailable === true &&
        doctorJson.productSurface.productAuditAvailable === true,
    });

    await assertNoHelmsmanCreated("import doctor no run-root side effects", workspace);

    await runProbeAndInspect(workspace, "verify-import", "import", ["completed"]);
    await runProbeAndInspect(workspace, "verify-memory", "in-memory-session", ["completed"]);
    await runProbeAndInspect(workspace, "verify-persisted", "persisted-session", ["completed"]);
    await runProbeAndInspect(workspace, "verify-timeout", "timeout", ["timed_out"]);
    await runProbeAndInspect(workspace, "verify-abort", "abort", ["aborted"]);

    const secretDir = join(workspace, "secret-fixture");
    await writeFile(join(secretDir, "leak.txt"), "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz", { encoding: "utf8" }).catch(async (error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await import("node:fs/promises").then(({ mkdir }) => mkdir(secretDir, { recursive: true }));
      await writeFile(join(secretDir, "leak.txt"), "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz", "utf8");
    });
    const findings = await scanForSecrets(secretDir);
    checks.push({ name: "redaction fixture flags synthetic secret", ok: findings.length > 0 });

    checks.push({ name: "stale executable claim scan", ok: await staleExecutableClaimScan() });

    if (live) {
      const result = run(["pi-runtime", "probe", "--cwd", workspace, "--session", "verify-live", "--mode", "live-provider", "--json"]);
      checks.push({
        name: "live provider probe",
        ok: result.status === 0 || result.status === 3,
        detail: result.status === 3 ? "live_provider unavailable; no fake provider substituted" : result.stdout,
      });
      if (result.status === 0) {
        await inspectExistingProbe(workspace, "verify-live", JSON.parse(result.stdout), "live-provider");
      }
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

async function runProbeAndInspect(
  workspace: string,
  session: string,
  mode: string,
  acceptedStatuses: string[],
): Promise<void> {
  const result = run(["pi-runtime", "probe", "--cwd", workspace, "--session", session, "--mode", mode, "--json"]);
  checks.push({ name: `${mode} command exit`, ok: result.status === 0, detail: result.stderr || result.stdout });
  const json = JSON.parse(result.stdout);
  checks.push({ name: `${mode} status`, ok: acceptedStatuses.includes(json.status), detail: json.status });
  await inspectExistingProbe(workspace, session, json, mode);
}

async function inspectExistingProbe(
  workspace: string,
  session: string,
  json: { operationId: string },
  mode: string,
): Promise<void> {
  const root = join(workspace, ".helmsman", "sessions", session);
  const operationState = JSON.parse(await readFile(join(root, "operation-state.json"), "utf8"));
  checks.push({ name: `${mode} operation-state written`, ok: operationState.operations.length === 1 });
  checks.push({ name: `${mode} does not create Manifest authority`, ok: !(await fileContains(join(root, "manifest.events.jsonl"), "run.created")) });
  checks.push({ name: `${mode} does not write canonical Board`, ok: !(await fileContains(join(root, "board.json"), "helmsman.board.v1")) });
  checks.push({ name: `${mode} captured events written`, ok: await fileContains(join(root, "adapter", "pi", `${json.operationId}.events.jsonl`), json.operationId) });
  checks.push({ name: `${mode} capability report written`, ok: await fileContains(join(root, "adapter", "pi", "capability-report.json"), "helmsman.pi-capability-report.v1") });
  const redactionReport = JSON.parse(await readFile(join(root, "adapter", "pi", `${json.operationId}.redaction-report.json`), "utf8"));
  checks.push({ name: `${mode} run has no secret findings`, ok: redactionReport.findings.length === 0 });
  if (mode === "live-provider") {
    const events = await readFile(join(root, "adapter", "pi", `${json.operationId}.events.jsonl`), "utf8");
    const lastMessage = await readFile(join(root, "adapter", "pi", `${json.operationId}.last-message.md`), "utf8");
    checks.push({ name: "live-provider records Pi runtime events", ok: /"piEventType":"(?:turn_start|agent_start|message_start)"/.test(events) });
    checks.push({ name: "live-provider writes non-empty last message", ok: lastMessage.trim().length > 0 });
    checks.push({ name: "live-provider writes session link evidence", ok: await fileContains(join(root, "evidence", "pi-session-links.jsonl"), json.operationId) });
  }
}

async function assertNoHelmsmanCreated(name: string, workspace: string): Promise<void> {
  try {
    await readFile(join(workspace, ".helmsman"));
    checks.push({ name, ok: false });
  } catch (error) {
    checks.push({ name, ok: (error as NodeJS.ErrnoException).code === "ENOENT" });
  }
}

async function fileContains(path: string, needle: string): Promise<boolean> {
  try {
    return (await readFile(path, "utf8")).includes(needle);
  } catch {
    return false;
  }
}

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function staleExecutableClaimScan(): Promise<boolean> {
  const files = [
    "README.md",
    "docs/current-execution.md",
    "docs/pi-direct-ultimate-product-design.md",
    "docs/pi-runtime-foundation-contract.md",
  ];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    if (/full product verification command exists/i.test(text)) return false;
  }
  return true;
}

await main();
