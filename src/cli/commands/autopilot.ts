import { resolveRunPaths } from "../../core/document-bus/paths.ts";
import { executeCoreCommand } from "../../core/authority/core-store.ts";
import type { AutopilotDriftResponse, AutopilotLoopStatus, AutopilotRouteAdherence, RunStage } from "../../core/authority/types.ts";
import { dispatchAutopilotPacket, evaluateAutopilotPreconditions, finishAutopilotLoop, recoverAutopilotLoops, startAutopilotLoop } from "../../autopilot/index.ts";

export async function runAutopilotCommand(args: string[]): Promise<number> {
  const [subcommand] = args;
  if (subcommand === "evaluate") return await evaluate(args.slice(1));
  if (subcommand === "start") return await start(args.slice(1));
  if (subcommand === "finish") return await finish(args.slice(1));
  if (subcommand === "recover") return await recover(args.slice(1));
  if (subcommand === "dispatch") return await dispatch(args.slice(1));
  console.error("Usage: helmsman autopilot <evaluate|start|finish|recover|dispatch>");
  return 2;
}

async function evaluate(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const preconditions = evaluateAutopilotPreconditions({ ...state, roleId: flagValue(args, "--role") ?? "autopilot-implementer", requireDispatchReady: true });
  output(args, { ok: preconditions.ok, preconditions, boardRevision: state.board.revision, nextLegalAction: state.board.nextLegalAction });
  return preconditions.ok ? 0 : 1;
}

async function start(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const result = await startAutopilotLoop({
    ...state,
    roleId: flagValue(args, "--role"),
    mission: flagValue(args, "--mission"),
    maxRoleRuns: numberFlag(args, "--max-role-runs"),
    maxRepairPasses: numberFlag(args, "--max-repair-passes"),
    maxAuditPasses: numberFlag(args, "--max-audit-passes"),
    timeoutMs: numberFlag(args, "--timeout-ms"),
  });
  output(args, {
    ok: true,
    loopId: result.plan.loopId,
    packetIds: result.packets.map((packet) => packet.packetId),
    planPath: result.planPath,
    boardRevision: result.core.board.revision,
    activeStage: result.core.manifest.run.activeStage,
  });
  return 0;
}

async function finish(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const result = await finishAutopilotLoop({
    ...state,
    loopId: required(args, "--loop"),
    status: (flagValue(args, "--status") ?? "completed") as AutopilotLoopStatus,
    adherenceStatus: (flagValue(args, "--adherence") ?? "adherent") as AutopilotRouteAdherence["status"],
    reason: required(args, "--reason"),
    requiredResponse: (flagValue(args, "--response") ?? "continue") as AutopilotDriftResponse,
    evidenceIds: csvFlag(args, "--evidence-ids"),
    nextStage: flagValue(args, "--next-stage") as RunStage | undefined,
  });
  output(args, {
    ok: true,
    loopId: result.finish.loopId,
    status: result.finish.status,
    routeAdherence: result.routeAdherence.status,
    driftId: result.drift?.driftId,
    boardRevision: result.core.board.revision,
    nextLegalAction: result.core.board.nextLegalAction,
  });
  return 0;
}

async function recover(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const result = await recoverAutopilotLoops({ ...state, reason: flagValue(args, "--reason") });
  output(args, { ok: true, recoveredCount: result.recovered.length, boardRevision: result.cores.at(-1)?.board.revision ?? state.board.revision });
  return 0;
}

async function dispatch(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const result = await dispatchAutopilotPacket({
    ...state,
    loopId: required(args, "--loop"),
    packetId: required(args, "--packet"),
    timeoutMs: numberFlag(args, "--timeout-ms"),
  });
  output(args, { ok: result.result.status === "completed", roleRunId: result.result.roleRunId, operationId: result.result.operationId, status: result.result.status, resultPath: result.result.resultPath });
  return result.result.status === "completed" ? 0 : 1;
}

async function resumeState(args: string[]) {
  const cwd = flagValue(args, "--cwd") ?? process.cwd();
  const runId = required(args, "--session");
  const paths = resolveRunPaths({ cwd, runId });
  const resumed = await executeCoreCommand(paths, {
    commandType: "run.resume",
    cwd,
    runId,
    actor: { kind: "user", id: "autopilot-cli" },
    payload: {},
  });
  return { paths, manifest: resumed.manifest, board: resumed.board };
}

function output(args: string[], value: unknown): void {
  if (args.includes("--json")) console.log(JSON.stringify(value, null, 2));
  else if (typeof value === "object" && value && "ok" in value) console.log((value as { ok?: boolean }).ok ? "ok" : "failed");
  else console.log(String(value));
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
  return value ? Number(value) : undefined;
}

function csvFlag(args: string[], name: string): string[] {
  const value = flagValue(args, name);
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}
