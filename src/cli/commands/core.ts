import { resolveRunPaths } from "../../core/document-bus/paths.ts";
import { CoreError, type AuthoritySource } from "../../core/authority/types.ts";
import { executeCoreCommand, replayCore, serializeCoreError } from "../../core/authority/core-store.ts";

const ACTORS = new Set<AuthoritySource>(["user", "lead_default", "core_policy", "role_runner", "external_adapter", "verifier"]);

export async function runCoreCommand(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args;
  try {
    if (subcommand === "create") return await createRun(rest);
    if (subcommand === "resume") return await resumeRun(rest);
    if (subcommand === "replay") return await replayRun(rest);
    if (subcommand === "command") return await executeTypedCommand(rest);
    console.error("Usage: helmsman core <create|resume|replay|command>");
    return 2;
  } catch (error) {
    if (error instanceof CoreError) {
      output(rest, { ok: false, error: serializeCoreError(error) });
      return coreExitCode(error);
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

async function createRun(args: string[]): Promise<number> {
  const cwd = flagValue(args, "--cwd") ?? process.cwd();
  const runId = required(args, "--session");
  const title = flagValue(args, "--title") ?? runId;
  const initialIntent = flagValue(args, "--intent");
  const paths = resolveRunPaths({ cwd, runId });
  const result = await executeCoreCommand(paths, {
    commandType: "run.create",
    cwd,
    runId,
    actor: actorFromArgs(args, "user"),
    payload: {
      title,
      workspace: cwd,
      initialIntent,
    },
  });
  output(args, result);
  return 0;
}

async function resumeRun(args: string[]): Promise<number> {
  const cwd = flagValue(args, "--cwd") ?? process.cwd();
  const runId = required(args, "--session");
  const paths = resolveRunPaths({ cwd, runId });
  const result = await executeCoreCommand(paths, {
    commandType: "run.resume",
    cwd,
    runId,
    actor: actorFromArgs(args, "user"),
    payload: {},
  });
  output(args, result);
  return 0;
}

async function replayRun(args: string[]): Promise<number> {
  const cwd = flagValue(args, "--cwd") ?? process.cwd();
  const runId = required(args, "--session");
  const paths = resolveRunPaths({ cwd, runId });
  const result = await replayCore(paths, { repair: args.includes("--repair") });
  output(args, { ok: result.status !== "event_log_corrupt", ...result });
  return result.status === "event_log_corrupt" ? 1 : 0;
}

async function executeTypedCommand(args: string[]): Promise<number> {
  const cwd = flagValue(args, "--cwd") ?? process.cwd();
  const runId = required(args, "--session");
  const commandType = required(args, "--type");
  const boardRevisionRead = numberFlag(args, "--board-revision");
  const payload = parsePayload(flagValue(args, "--payload-json") ?? "{}");
  const paths = resolveRunPaths({ cwd, runId });
  const result = await executeCoreCommand(paths, {
    commandType,
    cwd,
    runId,
    actor: actorFromArgs(args, "user"),
    boardRevisionRead,
    payload,
  });
  output(args, result);
  return 0;
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

function actorFromArgs(args: string[], fallback: AuthoritySource): { kind: AuthoritySource; id: string } {
  const kind = (flagValue(args, "--actor") ?? fallback) as AuthoritySource;
  if (!ACTORS.has(kind)) throw new Error(`Invalid --actor. Expected one of: ${[...ACTORS].join(", ")}`);
  return { kind, id: flagValue(args, "--actor-id") ?? kind };
}

function parsePayload(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--payload-json must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
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

function numberFlag(args: string[], name: string): number | undefined {
  const value = flagValue(args, name);
  return value ? Number.parseInt(value, 10) : undefined;
}

function coreExitCode(error: CoreError): number {
  if (error.code === "COMMAND_STAGE_ILLEGAL" || error.code === "BOARD_REVISION_REQUIRED" || error.code === "BOARD_REVISION_STALE") return 3;
  if (error.code === "RECOVERY_REQUIRED" || error.code === "PROJECTION_STALE") return 4;
  return 1;
}
