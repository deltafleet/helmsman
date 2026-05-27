import { resolveRunPaths } from "../../core/document-bus/paths.ts";
import { CoreError, type RolePurpose } from "../../core/authority/types.ts";
import { executeCoreCommand, serializeCoreError } from "../../core/authority/core-store.ts";
import { buildLivePiRoleBinding } from "../../role-runtime/bindings.ts";
import { runPiRole } from "../../role-runtime/pi-role-runtime.ts";

const ROLE_PURPOSES = new Set<RolePurpose>(["chat", "charting", "memory_scan", "research", "synthesis", "autopilot", "audit", "verification", "closeout"]);

export async function runRoleRuntimeCommand(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  try {
    if (subcommand === "bind-live") return await bindLive(rest);
    if (subcommand === "run") return await runRole(rest);
    console.error("Usage: helmsman role-runtime <bind-live|run>");
    return 2;
  } catch (error) {
    if (error instanceof CoreError) {
      output(rest, { ok: false, error: serializeCoreError(error) });
      return 1;
    }
    output(rest, { ok: false, error: { message: error instanceof Error ? error.message : String(error) } });
    return 1;
  }
}

async function bindLive(args: string[]): Promise<number> {
  const cwd = flagValue(args, "--cwd") ?? process.cwd();
  const runId = required(args, "--session");
  const roleId = flagValue(args, "--role-id") ?? "lead";
  const purpose = rolePurpose(flagValue(args, "--purpose") ?? "chat");
  const timeoutMs = numberFlag(args, "--timeout-ms") ?? 120000;
  const paths = resolveRunPaths({ cwd, runId });
  const resumed = await executeCoreCommand(paths, {
    commandType: "run.resume",
    cwd,
    runId,
    actor: { kind: "user", id: "role-runtime-cli" },
    payload: {},
  });
  const binding = buildLivePiRoleBinding({
    cwd: paths.cwd,
    roleId,
    purpose,
    timeoutMs,
    allowedToolNames: values(args, "--tool"),
  });
  const result = await executeCoreCommand(paths, {
    commandType: "role.binding_set",
    cwd,
    runId,
    actor: { kind: "core_policy", id: "role-runtime-cli" },
    boardRevisionRead: resumed.board.revision,
    payload: {
      binding,
      evidenceIds: [],
    },
  });
  output(args, { ok: true, binding, boardRevision: result.board.revision });
  return 0;
}

async function runRole(args: string[]): Promise<number> {
  const cwd = flagValue(args, "--cwd") ?? process.cwd();
  const runId = required(args, "--session");
  const roleId = flagValue(args, "--role-id") ?? "lead";
  const purpose = rolePurpose(flagValue(args, "--purpose") ?? "chat");
  const inputKind = (flagValue(args, "--input-kind") ?? "chat") as Parameters<typeof runPiRole>[0]["inputKind"];
  const inputRef = flagValue(args, "--input-ref") ?? "cli";
  const mission = flagValue(args, "--prompt") ?? flagValue(args, "--mission") ?? "Provide concise evidence for this bounded Helmsman role run.";
  const timeoutMs = numberFlag(args, "--timeout-ms") ?? 120000;
  const paths = resolveRunPaths({ cwd, runId });
  const resumed = await executeCoreCommand(paths, {
    commandType: "run.resume",
    cwd,
    runId,
    actor: { kind: "user", id: "role-runtime-cli" },
    payload: {},
  });
  const binding = args.includes("--auto-bind-live")
    ? buildLivePiRoleBinding({
        cwd: paths.cwd,
        roleId,
        purpose,
        timeoutMs,
        allowedToolNames: values(args, "--tool"),
      })
    : undefined;
  const result = await runPiRole({
    paths,
    manifest: resumed.manifest,
    board: resumed.board,
    binding,
    roleId,
    purpose,
    inputKind,
    inputRef,
    mission,
    timeoutMs,
  });
  output(args, {
    ok: result.result.status === "completed",
    result: result.result,
    boardRevision: result.core.board.revision,
    roleRun: result.core.manifest.roles.roleRuns[result.result.roleRunId],
  });
  return result.result.status === "completed" ? 0 : 1;
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

function rolePurpose(value: string): RolePurpose {
  if (!ROLE_PURPOSES.has(value as RolePurpose)) {
    throw new Error(`Invalid purpose ${value}. Expected one of: ${[...ROLE_PURPOSES].join(", ")}`);
  }
  return value as RolePurpose;
}

function required(args: string[], name: string): string {
  const value = flagValue(args, name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function values(args: string[], name: string): string[] {
  const output: string[] = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === name && args[index + 1]) output.push(args[index + 1]!);
  }
  return output;
}

function numberFlag(args: string[], name: string): number | undefined {
  const value = flagValue(args, name);
  return value ? Number.parseInt(value, 10) : undefined;
}
