import { installHelmsman, runProductAudit, uninstallHelmsman, updateHelmsman, buildDoctorReport } from "../../install-doctor/service.ts";
import type { InstallScope } from "../../install-doctor/types.ts";

export async function runInstallCommand(args: string[]): Promise<number> {
  const scope = scopeFlag(args);
  const workspace = flagValue(args, "--workspace") ?? process.cwd();
  const result = await installHelmsman({
    scope,
    workspace,
    dryRun: args.includes("--dry-run"),
    approveConflicts: args.includes("--approve-conflicts"),
  });
  output(args, result);
  return result.ok ? 0 : 3;
}

export async function runInitCommand(args: string[]): Promise<number> {
  const workspace = flagValue(args, "--workspace") ?? process.cwd();
  const install = await installHelmsman({
    scope: "project",
    workspace,
    dryRun: args.includes("--dry-run"),
    approveConflicts: args.includes("--approve-conflicts"),
  });
  const doctor = args.includes("--dry-run") ? undefined : await buildDoctorReport({ cwd: workspace, workspace });
  output(args, { ok: install.ok && (doctor?.ok ?? true), install, doctor });
  return install.ok && (doctor?.ok ?? true) ? 0 : 3;
}

export async function runUpdateCommand(args: string[]): Promise<number> {
  const workspace = flagValue(args, "--workspace") ?? process.cwd();
  const result = await updateHelmsman({
    workspace,
    dryRun: args.includes("--dry-run"),
    approve: args.includes("--approve"),
    approveConflicts: args.includes("--approve-conflicts"),
  });
  output(args, result);
  return result.ok ? 0 : result.approvalRequired ? 3 : 1;
}

export async function runUninstallCommand(args: string[]): Promise<number> {
  const workspace = flagValue(args, "--workspace") ?? process.cwd();
  const result = await uninstallHelmsman({
    scope: scopeFlag(args),
    workspace,
    dryRun: args.includes("--dry-run"),
    approve: args.includes("--approve"),
  });
  output(args, result);
  return result.ok ? 0 : result.approvalRequired ? 3 : 1;
}

export async function runProductAuditCommand(args: string[]): Promise<number> {
  const cwd = flagValue(args, "--cwd") ?? process.cwd();
  const result = await runProductAudit({ cwd, includeLive: args.includes("--live") || args.includes("--include-live") });
  output(args, result);
  return result.releaseReady ? 0 : 3;
}

export async function runVerifyCommand(args: string[]): Promise<number> {
  const { spawnSync } = await import("node:child_process");
  const { packageRoot } = await import("../../install-doctor/service.ts");
  const result = spawnSync("npm", ["run", "verify"], {
    cwd: packageRoot(),
    encoding: "utf8",
    stdio: args.includes("--json") ? "pipe" : "inherit",
  });
  if (args.includes("--json")) {
    console.log(JSON.stringify({
      ok: result.status === 0,
      command: "npm run verify",
      status: result.status ?? 1,
      stdout: result.stdout,
      stderr: result.stderr,
    }, null, 2));
  }
  return result.status ?? 1;
}

function scopeFlag(args: string[]): InstallScope {
  const value = flagValue(args, "--scope") ?? "project";
  if (value !== "project" && value !== "user") throw new Error("--scope must be project or user");
  return value;
}

function output(args: string[], value: unknown): void {
  if (args.includes("--json")) {
    console.log(JSON.stringify(value, null, 2));
  } else if (typeof value === "object" && value && "ok" in value) {
    console.log((value as { ok?: boolean }).ok === false ? "failed" : "ok");
  } else {
    console.log(String(value));
  }
}

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
