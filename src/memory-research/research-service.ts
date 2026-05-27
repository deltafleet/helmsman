import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { executeCoreCommand, type CoreCommandResult } from "../core/authority/core-store.ts";
import type {
  BoardProjection,
  HelmsmanManifest,
  MemoryCandidateJudgment,
  ResearchLaneContract,
  ResearchLaneType,
  ResearchWorkerPacket,
  RoleBindingContract,
} from "../core/authority/types.ts";
import { atomicWriteFile } from "../core/document-bus/atomic-write.ts";
import type { RunPaths } from "../core/document-bus/paths.ts";
import { buildLivePiRoleBinding } from "../role-runtime/bindings.ts";
import { runPiRole } from "../role-runtime/pi-role-runtime.ts";
import {
  DEFAULT_MAX_ACTIVE_RESEARCH_LANES,
  FORBIDDEN_RESEARCH_WORKER_ACTIONS,
  REQUIRED_RESEARCH_HEADINGS,
  assertRelativeUnder,
  resolveRunArtifactPath,
  slugify,
} from "./contracts.ts";

export interface DeclareResearchLanesInput {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
  maxActiveLanes?: number;
}

export interface DeclareResearchLanesOutput {
  lanes: ResearchLaneContract[];
  core?: CoreCommandResult;
}

export async function declareResearchLanesFromMemory(input: DeclareResearchLanesInput): Promise<DeclareResearchLanesOutput> {
  let manifest = input.manifest;
  let board = input.board;
  if (manifest.run.activeStage === "memory_scan") {
    const staged = await executeCoreCommand(input.paths, {
      commandType: "run.stage_change",
      cwd: input.paths.cwd,
      runId: input.paths.runId,
      actor: { kind: "core_policy", id: "memory-research" },
      boardRevisionRead: board.revision,
      payload: { to: "research", reason: "Scoped memory scan produced research-producing judgments." },
    });
    manifest = staged.manifest;
    board = staged.board;
  }
  if (manifest.run.activeStage !== "research") throw new Error(`Research lane declaration requires research stage, found ${manifest.run.activeStage}.`);

  const existingLaneIds = new Set(Object.keys(manifest.research.lanes));
  const candidates = Object.values(manifest.memory.candidates).filter((candidate) =>
    ["stale", "missing", "conflict"].includes(candidate.classification) && candidate.createsResearchLaneId && !existingLaneIds.has(candidate.createsResearchLaneId)
  );
  const lanes = candidates.map((candidate) => buildLaneFromCandidate({ manifest, candidate }));
  await atomicWriteFile(input.paths.researchIndexPath, renderResearchIndex({ manifest, lanes, maxActiveLanes: input.maxActiveLanes ?? DEFAULT_MAX_ACTIVE_RESEARCH_LANES, packets: [] }));
  if (lanes.length === 0) return { lanes };

  const core = await executeCoreCommand(input.paths, {
    commandType: "research.lane_plan",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "memory-research" },
    boardRevisionRead: board.revision,
    payload: { lanes },
  });
  await atomicWriteFile(input.paths.researchIndexPath, renderResearchIndex({ manifest: core.manifest, lanes: Object.values(core.manifest.research.lanes), maxActiveLanes: input.maxActiveLanes ?? DEFAULT_MAX_ACTIVE_RESEARCH_LANES, packets: Object.values(core.manifest.research.packets) }));
  return { lanes, core };
}

export interface PrepareResearchPacketsInput {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
  maxActiveLanes?: number;
}

export interface PrepareResearchPacketsOutput {
  packets: ResearchWorkerPacket[];
  core?: CoreCommandResult;
}

export async function prepareResearchWorkerPackets(input: PrepareResearchPacketsInput): Promise<PrepareResearchPacketsOutput> {
  const maxActiveLanes = input.maxActiveLanes ?? DEFAULT_MAX_ACTIVE_RESEARCH_LANES;
  const lanes = Object.values(input.manifest.research.lanes)
    .filter((lane) => lane.status === "queued" && !lane.workerPacketId)
    .slice(0, maxActiveLanes);
  assertNoWriteScopeConflicts(lanes);
  const parallelGroupId = `research-wave-${randomUUID().slice(0, 8)}`;
  const packets = lanes.map((lane) => buildWorkerPacket({ paths: input.paths, manifest: input.manifest, board: input.board, lane, parallelGroupId }));

  for (const packet of packets) {
    const packetPath = `worker-packets/${packet.packetId}.json`;
    assertRelativeUnder(packetPath, "worker-packets");
    await atomicWriteFile(resolveRunArtifactPath(input.paths, packetPath), `${JSON.stringify(packet, null, 2)}\n`);
  }
  await atomicWriteFile(input.paths.workerPacketsIndexPath, renderWorkerPacketIndex(packets));
  if (packets.length === 0) return { packets };

  const core = await executeCoreCommand(input.paths, {
    commandType: "research.packet_prepare",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "memory-research" },
    boardRevisionRead: input.board.revision,
    payload: { packets },
  });
  await atomicWriteFile(input.paths.researchIndexPath, renderResearchIndex({ manifest: core.manifest, lanes: Object.values(core.manifest.research.lanes), maxActiveLanes, packets: Object.values(core.manifest.research.packets) }));
  return { packets, core };
}

export async function dispatchResearchLane(input: {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
  laneId: string;
  binding?: RoleBindingContract;
  timeoutMs?: number;
}): Promise<Awaited<ReturnType<typeof runPiRole>>> {
  const lane = input.manifest.research.lanes[input.laneId];
  if (!lane) throw new Error(`Unknown research lane ${input.laneId}.`);
  const packet = Object.values(input.manifest.research.packets).find((candidate) => candidate.laneId === lane.laneId);
  if (!packet) throw new Error(`Research lane ${lane.laneId} has no Core-authored worker packet.`);
  const artifactId = `research-artifact-${lane.laneId}`;
  const artifactPath = join(input.paths.runRoot, lane.expectedArtifactPath);
  const binding = input.binding ?? {
    ...buildLivePiRoleBinding({
      cwd: input.paths.cwd,
      roleId: lane.ownerRoleId,
      purpose: "research",
      timeoutMs: input.timeoutMs,
      allowedReadRoots: [input.paths.cwd, input.paths.runRoot],
      allowedWriteRoots: [artifactPath],
    }),
    requiredArtifacts: [{ artifactId, kind: "research", expectedPath: lane.expectedArtifactPath, required: true }],
  };

  return await runPiRole({
    paths: input.paths,
    manifest: input.manifest,
    board: input.board,
    binding,
    roleId: lane.ownerRoleId,
    purpose: "research",
    inputKind: "worker_packet",
    inputRef: packet.packetId,
    mission: renderWorkerMission(packet),
    timeoutMs: input.timeoutMs,
  });
}

function buildLaneFromCandidate(input: { manifest: HelmsmanManifest; candidate: MemoryCandidateJudgment }): ResearchLaneContract {
  const laneId = input.candidate.createsResearchLaneId ?? `lane-${slugify(input.candidate.candidateId)}`;
  const slug = slugify(laneId.replace(/^lane-/, ""));
  const artifactPath = `research/${slug}.md`;
  const scan = input.manifest.memory.scans[input.candidate.scanId];
  assertRelativeUnder(artifactPath, "research");
  return {
    schemaVersion: "helmsman.research-lane.v1",
    runId: input.manifest.run.id,
    laneId,
    slug,
    selectedApertureEventIds: scan?.apertureAnswerEventIds ?? [],
    sourceMemoryJudgmentIds: [input.candidate.candidateId],
    routeChangingQuestion: questionForCandidate(input.candidate),
    laneType: laneTypeForCandidate(input.candidate),
    sourcesToInspect: [input.candidate.sourceRef],
    sourcesToSkip: [],
    expectedArtifactPath: artifactPath,
    ownerRoleId: `research.${slug}`,
    allowedWriteScope: [artifactPath],
    acceptanceCriteria: [
      "Artifact uses the required Research headings.",
      "Sources Checked cites concrete files, URLs, command output, package metadata, rendered UI, or direct observation.",
      "Observations and Inferences are separate.",
      "Decision Impact states how the route changes or is confirmed.",
      "Route Changes Required is explicit, even when none.",
    ],
    decisionImpact: `Resolve ${input.candidate.classification} memory before Route Lock: ${input.candidate.reason}`,
    openUncertainty: input.candidate.reason,
    status: "queued",
  };
}

function buildWorkerPacket(input: {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
  lane: ResearchLaneContract;
  parallelGroupId: string;
}): ResearchWorkerPacket {
  return {
    schemaVersion: "helmsman.research-worker-packet.v1",
    runId: input.manifest.run.id,
    laneId: input.lane.laneId,
    packetId: `packet-${input.lane.slug}-${randomUUID().slice(0, 8)}`,
    boardRevisionRead: input.board.revision,
    routeQuestion: input.lane.routeChangingQuestion,
    selectedApertureSummary: apertureSummary(input.manifest),
    mission: `Research ${input.lane.routeChangingQuestion} and write exactly ${input.lane.expectedArtifactPath}.`,
    contextRefs: [input.paths.renderedRouteCardPath, input.paths.memoryIndexPath, input.paths.researchIndexPath],
    sourcesToInspect: input.lane.sourcesToInspect,
    sourcesToSkip: input.lane.sourcesToSkip,
    allowedReadScope: [input.paths.cwd, input.paths.runRoot],
    allowedWriteScope: [input.lane.expectedArtifactPath],
    requiredArtifactPath: input.lane.expectedArtifactPath,
    requiredHeadings: [...REQUIRED_RESEARCH_HEADINGS],
    doneCriteria: input.lane.acceptanceCriteria,
    forbiddenActions: [...FORBIDDEN_RESEARCH_WORKER_ACTIONS],
    verificationNotes: "Final prose and chat transcript are evidence only. The artifact must pass Core validation before route movement.",
    parallelGroupId: input.parallelGroupId,
  };
}

function questionForCandidate(candidate: MemoryCandidateJudgment): string {
  if (candidate.classification === "stale") return `Is ${candidate.sourceRef} still accurate for the current route?`;
  if (candidate.classification === "conflict") return `Which source of truth resolves the conflict around ${candidate.sourceRef}?`;
  return `What source of truth fills the missing route knowledge for ${candidate.sourceRef}?`;
}

function laneTypeForCandidate(candidate: MemoryCandidateJudgment): ResearchLaneType {
  if (candidate.classification === "stale") return "memory_refresh";
  if (candidate.classification === "conflict") return "failure_mode";
  return "source_of_truth";
}

function apertureSummary(manifest: HelmsmanManifest): string {
  return Object.values(manifest.questions.answers)
    .map((answer) => `${answer.questionId}: ${answer.answerDetails.optionLabels.join(", ")}${answer.freeFormText ? ` (${answer.freeFormText})` : ""}`)
    .join("\n");
}

function assertNoWriteScopeConflicts(lanes: ResearchLaneContract[]): void {
  const seen = new Set<string>();
  for (const lane of lanes) {
    for (const path of lane.allowedWriteScope) {
      if (seen.has(path)) throw new Error(`Conflicting research worker write scope: ${path}`);
      seen.add(path);
    }
  }
}

function renderWorkerMission(packet: ResearchWorkerPacket): string {
  return [
    "# Research Worker Packet",
    "",
    `Packet: ${packet.packetId}`,
    `Lane: ${packet.laneId}`,
    `Route question: ${packet.routeQuestion}`,
    "",
    "## Mission",
    packet.mission,
    "",
    "## Required Artifact",
    packet.requiredArtifactPath,
    "",
    "## Required Headings",
    ...packet.requiredHeadings.map((heading) => `- ${heading}`),
    "",
    "## Forbidden Actions",
    ...packet.forbiddenActions.map((action) => `- ${action}`),
  ].join("\n");
}

function renderWorkerPacketIndex(packets: ResearchWorkerPacket[]): string {
  return [
    "# Research Worker Packets",
    "",
    ...(packets.length === 0 ? ["- no packets prepared"] : packets.map((packet) => `- ${packet.packetId}: ${packet.laneId} -> ${packet.requiredArtifactPath}`)),
    "",
  ].join("\n");
}

export function renderResearchIndex(input: {
  manifest: HelmsmanManifest;
  lanes: ResearchLaneContract[];
  packets: ResearchWorkerPacket[];
  maxActiveLanes: number;
}): string {
  const packetByLane = new Map(input.packets.map((packet) => [packet.laneId, packet]));
  const active = input.lanes.filter((lane) => packetByLane.has(lane.laneId)).slice(0, input.maxActiveLanes);
  const launchPosture = input.lanes.length === 0 ? "blocked" : active.length > 1 ? "parallel" : active.length === 1 ? "lead-only" : "blocked";
  return [
    "# Research Index",
    "",
    `Max active lanes: ${input.maxActiveLanes}`,
    `Launch posture: ${launchPosture}`,
    "",
    "## Lanes",
    "",
    ...(input.lanes.length === 0
      ? ["- no research lanes declared"]
      : input.lanes.map((lane) => [
          `- ${lane.slug}`,
          `  - lane id: ${lane.laneId}`,
          `  - question: ${lane.routeChangingQuestion}`,
          `  - type: ${lane.laneType}`,
          `  - owner: ${lane.ownerRoleId}`,
          `  - status: ${lane.status}`,
          `  - artifact: ${lane.expectedArtifactPath}`,
          `  - sources checked: ${lane.sourcesToInspect.join(", ")}`,
          `  - decision impact: ${lane.decisionImpact}`,
          `  - uncertainty: ${lane.openUncertainty}`,
          `  - packet: ${packetByLane.get(lane.laneId)?.packetId ?? "not prepared"}`,
          lane.dropReason ? `  - drop reason: ${lane.dropReason}` : "",
        ].filter(Boolean).join("\n"))),
    "",
  ].join("\n");
}
