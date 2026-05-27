import { randomUUID } from "node:crypto";
import { executeCoreCommand, type CoreCommandResult } from "../core/authority/core-store.ts";
import type { BoardProjection, HelmsmanManifest, ResearchSynthesisOutcome, ResearchSynthesisRecord, RouteEffect } from "../core/authority/types.ts";
import { atomicWriteFile } from "../core/document-bus/atomic-write.ts";
import type { RunPaths } from "../core/document-bus/paths.ts";
import { resolveRunArtifactPath } from "./contracts.ts";

export interface RecordResearchSynthesisInput {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
  outcome?: ResearchSynthesisOutcome;
  summary?: string;
  routeEffects?: RouteEffect[];
}

export interface RecordResearchSynthesisOutput {
  synthesis: ResearchSynthesisRecord;
  core: CoreCommandResult;
  artifactPath: string;
}

export async function recordResearchSynthesis(input: RecordResearchSynthesisInput): Promise<RecordResearchSynthesisOutput> {
  let manifest = input.manifest;
  let board = input.board;
  if (manifest.run.activeStage === "research") {
    const staged = await executeCoreCommand(input.paths, {
      commandType: "run.stage_change",
      cwd: input.paths.cwd,
      runId: input.paths.runId,
      actor: { kind: "core_policy", id: "memory-research" },
      boardRevisionRead: board.revision,
      payload: { to: "synthesis", reason: "Research wave artifacts are ready for Core synthesis." },
    });
    manifest = staged.manifest;
    board = staged.board;
  }
  if (manifest.run.activeStage !== "synthesis") throw new Error(`Research synthesis requires synthesis stage, found ${manifest.run.activeStage}.`);

  const acceptedArtifactIds = [...manifest.research.acceptedArtifactIds];
  const droppedLaneIds = [...manifest.research.droppedLaneIds];
  const openLaneIds = Object.values(manifest.research.lanes)
    .filter((lane) => !["accepted", "dropped"].includes(lane.status))
    .map((lane) => lane.laneId);
  const outcome = input.outcome ?? inferOutcome(manifest, openLaneIds);
  const synthesisId = `synthesis-${randomUUID().slice(0, 8)}`;
  const routeEffects = input.routeEffects ?? defaultSynthesisRouteEffects(outcome, acceptedArtifactIds);
  const synthesis: ResearchSynthesisRecord = {
    schemaVersion: "helmsman.research-synthesis.v1",
    synthesisId,
    outcome,
    acceptedArtifactIds,
    droppedLaneIds,
    openLaneIds,
    summary: input.summary ?? summaryForOutcome(outcome, acceptedArtifactIds, droppedLaneIds, openLaneIds),
    openUncertainty: openLaneIds.map((laneId) => manifest.research.lanes[laneId]?.openUncertainty ?? laneId),
    routeEffects,
    evidenceIds: acceptedArtifactIds,
    recordedAt: new Date().toISOString(),
  };
  const artifactPath = `research/${synthesisId}.md`;
  await atomicWriteFile(resolveRunArtifactPath(input.paths, artifactPath), renderSynthesisArtifact(synthesis));
  const core = await executeCoreCommand(input.paths, {
    commandType: "research.synthesis_record",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "memory-research" },
    boardRevisionRead: board.revision,
    payload: synthesis as unknown as Record<string, unknown>,
  });
  return { synthesis, core, artifactPath };
}

function inferOutcome(manifest: HelmsmanManifest, openLaneIds: string[]): ResearchSynthesisOutcome {
  if (openLaneIds.length > 0) return "continue_research";
  if (Object.keys(manifest.research.lanes).length === 0) return "blocked";
  if (manifest.questions.openQuestionIds.length > 0) return "ask_decision_bundle";
  return "lock_ready";
}

function defaultSynthesisRouteEffects(outcome: ResearchSynthesisOutcome, acceptedArtifactIds: string[]): RouteEffect[] {
  if (acceptedArtifactIds.length === 0) return [];
  return [
    {
      id: `research:synthesis:${outcome}:${randomUUID().slice(0, 8)}`,
      kind: "route.success_criterion.add",
      text: `Research synthesis outcome ${outcome} is backed by accepted artifacts: ${acceptedArtifactIds.join(", ")}.`,
    },
  ];
}

function summaryForOutcome(outcome: ResearchSynthesisOutcome, accepted: string[], dropped: string[], open: string[]): string {
  return `Outcome ${outcome}; accepted artifacts: ${accepted.length}; dropped lanes: ${dropped.length}; open lanes: ${open.length}.`;
}

function renderSynthesisArtifact(synthesis: ResearchSynthesisRecord): string {
  return [
    `# Research Synthesis: ${synthesis.synthesisId}`,
    "",
    `Outcome: ${synthesis.outcome}`,
    "",
    "## Summary",
    synthesis.summary,
    "",
    "## Accepted Artifacts",
    ...(synthesis.acceptedArtifactIds.length === 0 ? ["- none"] : synthesis.acceptedArtifactIds.map((artifactId) => `- ${artifactId}`)),
    "",
    "## Dropped Lanes",
    ...(synthesis.droppedLaneIds.length === 0 ? ["- none"] : synthesis.droppedLaneIds.map((laneId) => `- ${laneId}`)),
    "",
    "## Open Lanes",
    ...(synthesis.openLaneIds.length === 0 ? ["- none"] : synthesis.openLaneIds.map((laneId) => `- ${laneId}`)),
    "",
    "## Open Uncertainty",
    ...(synthesis.openUncertainty.length === 0 ? ["- none"] : synthesis.openUncertainty.map((item) => `- ${item}`)),
    "",
  ].join("\n");
}
