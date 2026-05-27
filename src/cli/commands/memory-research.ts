import { resolveRunPaths } from "../../core/document-bus/paths.ts";
import { executeCoreCommand } from "../../core/authority/core-store.ts";
import {
  declareResearchLanesFromMemory,
  dispatchResearchLane,
  prepareResearchWorkerPackets,
  recordResearchSynthesis,
  runScopedMemoryScan,
  validateResearchArtifact,
} from "../../memory-research/index.ts";

export async function runMemoryResearchCommand(args: string[]): Promise<number> {
  const [subcommand] = args;
  if (subcommand === "scan") return await scan(args.slice(1));
  if (subcommand === "lanes") return await lanes(args.slice(1));
  if (subcommand === "packets") return await packets(args.slice(1));
  if (subcommand === "validate-artifact") return await validateArtifact(args.slice(1));
  if (subcommand === "synthesize") return await synthesize(args.slice(1));
  if (subcommand === "dispatch") return await dispatch(args.slice(1));
  console.error("Usage: helmsman memory-research <scan|lanes|packets|validate-artifact|synthesize|dispatch>");
  return 2;
}

async function scan(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const sourceRefs = flagValues(args, "--source");
  if (sourceRefs.length === 0) throw new Error("memory-research scan requires at least one --source.");
  const result = await runScopedMemoryScan({
    paths: state.paths,
    manifest: state.manifest,
    board: state.board,
    sourcesToInspect: sourceRefs.map((ref) => ({ ref })),
  });
  output(args, { ok: true, scanId: result.plan.scanId, candidates: result.candidates, boardRevision: result.core.board.revision });
  return 0;
}

async function lanes(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const result = await declareResearchLanesFromMemory({
    paths: state.paths,
    manifest: state.manifest,
    board: state.board,
    maxActiveLanes: numberFlag(args, "--max-active"),
  });
  output(args, { ok: true, laneIds: result.lanes.map((lane) => lane.laneId), boardRevision: result.core?.board.revision ?? state.board.revision });
  return 0;
}

async function packets(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const result = await prepareResearchWorkerPackets({
    paths: state.paths,
    manifest: state.manifest,
    board: state.board,
    maxActiveLanes: numberFlag(args, "--max-active"),
  });
  output(args, { ok: true, packetIds: result.packets.map((packet) => packet.packetId), boardRevision: result.core?.board.revision ?? state.board.revision });
  return 0;
}

async function validateArtifact(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const laneId = required(args, "--lane");
  const result = await validateResearchArtifact({
    paths: state.paths,
    manifest: state.manifest,
    board: state.board,
    laneId,
    artifactPath: flagValue(args, "--artifact"),
  });
  output(args, { ok: result.ok, artifactId: result.artifactId, issues: result.issues, boardRevision: (result.accept ?? result.reject ?? result.submit)?.board.revision });
  return result.ok ? 0 : 1;
}

async function synthesize(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const result = await recordResearchSynthesis({
    paths: state.paths,
    manifest: state.manifest,
    board: state.board,
    outcome: flagValue(args, "--outcome") as never,
    summary: flagValue(args, "--summary"),
  });
  output(args, { ok: true, synthesisId: result.synthesis.synthesisId, outcome: result.synthesis.outcome, artifactPath: result.artifactPath, boardRevision: result.core.board.revision });
  return 0;
}

async function dispatch(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const laneId = required(args, "--lane");
  const result = await dispatchResearchLane({
    paths: state.paths,
    manifest: state.manifest,
    board: state.board,
    laneId,
    timeoutMs: numberFlag(args, "--timeout-ms"),
  });
  output(args, { ok: result.result.status === "completed", roleRunId: result.result.roleRunId, status: result.result.status, resultPath: result.result.resultPath, boardRevision: result.core.board.revision });
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
    actor: { kind: "user", id: "memory-research-cli" },
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

function flagValues(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] === name && args[index + 1]) values.push(args[index + 1]!);
  }
  return values;
}

function numberFlag(args: string[], name: string): number | undefined {
  const value = flagValue(args, name);
  return value ? Number.parseInt(value, 10) : undefined;
}
