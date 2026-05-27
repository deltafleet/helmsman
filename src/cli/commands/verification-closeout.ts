import { resolveRunPaths } from "../../core/document-bus/paths.ts";
import { executeCoreCommand } from "../../core/authority/core-store.ts";
import type { CloseoutStatus, VerificationEvidenceKind, VerificationScenarioVerdict, VerificationVerdictStatus } from "../../core/authority/types.ts";
import { evaluateVerificationPreconditions, finishVerificationRun, recordCloseout, recordVerificationResult, startVerificationRun } from "../../verification-closeout/index.ts";

export async function runVerificationCommand(args: string[]): Promise<number> {
  const [subcommand] = args;
  if (subcommand === "evaluate") return await evaluate(args.slice(1));
  if (subcommand === "start") return await start(args.slice(1));
  if (subcommand === "result") return await result(args.slice(1));
  if (subcommand === "finish") return await finish(args.slice(1));
  console.error("Usage: helmsman verification <evaluate|start|result|finish>");
  return 2;
}

export async function runCloseoutCommand(args: string[]): Promise<number> {
  const [subcommand] = args;
  if (!subcommand || subcommand === "record") return await closeoutRecord(subcommand ? args.slice(1) : args);
  console.error("Usage: helmsman closeout record");
  return 2;
}

async function evaluate(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const preconditions = evaluateVerificationPreconditions({ ...state, verifierRoleId: flagValue(args, "--role") ?? "verifier" });
  output(args, { ok: preconditions.ok, preconditions, boardRevision: state.board.revision, nextLegalAction: state.board.nextLegalAction });
  return preconditions.ok ? 0 : 1;
}

async function start(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const run = await startVerificationRun({
    ...state,
    verifierRoleId: flagValue(args, "--role"),
    timeoutMs: numberFlag(args, "--timeout-ms"),
  });
  output(args, { ok: true, verificationRunId: run.plan.verificationRunId, scenarioIds: run.plan.scenarioIds, planPath: run.planPath, boardRevision: run.core.board.revision });
  return 0;
}

async function result(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const recorded = await recordVerificationResult({
    ...state,
    verificationRunId: required(args, "--run"),
    scenarioId: required(args, "--scenario"),
    status: (flagValue(args, "--status") ?? "passed") as VerificationVerdictStatus,
    evidenceIds: csvFlag(args, "--evidence-ids"),
    evidenceKinds: csvFlag(args, "--evidence-kinds") as VerificationEvidenceKind[],
    executionStatus: (flagValue(args, "--execution-status") as VerificationScenarioVerdict["executionStatus"] | undefined) ?? "completed",
    criteriaSatisfied: csvFlag(args, "--criteria-satisfied"),
    criteriaFailed: csvFlag(args, "--criteria-failed"),
    criteriaBlocked: csvFlag(args, "--criteria-blocked"),
    observations: csvFlag(args, "--observations"),
    residualRisk: flagValue(args, "--residual-risk") ?? "none",
    followUpRequired: csvFlag(args, "--follow-up"),
    missingAuthorityOrEnvironment: flagValue(args, "--missing"),
  });
  output(args, { ok: true, verdictId: recorded.verdict.verdictId, status: recorded.verdict.status, artifactPath: recorded.verdict.artifactPath, boardRevision: recorded.core.board.revision });
  return recorded.verdict.status === "passed" ? 0 : 1;
}

async function finish(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const finished = await finishVerificationRun({
    ...state,
    verificationRunId: required(args, "--run"),
    status: flagValue(args, "--status") as never,
  });
  output(args, { ok: finished.finish.status === "completed", finish: finished.finish, boardRevision: finished.core.board.revision, nextLegalAction: finished.core.board.nextLegalAction });
  return finished.finish.status === "completed" ? 0 : 1;
}

async function closeoutRecord(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const closeout = await recordCloseout({
    ...state,
    status: flagValue(args, "--status") as CloseoutStatus | undefined,
    residualRiskIds: csvFlag(args, "--residual-risk-ids"),
  });
  output(args, { ok: closeout.closeout.status === "completed", closeout: closeout.closeout, boardRevision: closeout.core.board.revision, activeStage: closeout.core.manifest.run.activeStage });
  return closeout.closeout.status === "completed" ? 0 : 1;
}

async function resumeState(args: string[]) {
  const cwd = flagValue(args, "--cwd") ?? process.cwd();
  const runId = required(args, "--session");
  const paths = resolveRunPaths({ cwd, runId });
  const resumed = await executeCoreCommand(paths, {
    commandType: "run.resume",
    cwd,
    runId,
    actor: { kind: "user", id: "verification-cli" },
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
