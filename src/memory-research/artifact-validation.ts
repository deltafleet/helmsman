import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { executeCoreCommand, type CoreCommandResult } from "../core/authority/core-store.ts";
import type { BoardProjection, HelmsmanManifest, ResearchLaneContract, RouteEffect } from "../core/authority/types.ts";
import type { RunPaths } from "../core/document-bus/paths.ts";
import { REQUIRED_RESEARCH_HEADINGS, resolveRunArtifactPath } from "./contracts.ts";

export interface ValidateResearchArtifactInput {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
  laneId: string;
  artifactPath?: string;
  artifactId?: string;
  routeEffects?: RouteEffect[];
  operationId?: string;
}

export interface ValidateResearchArtifactOutput {
  ok: boolean;
  artifactId: string;
  issues: string[];
  submit?: CoreCommandResult;
  accept?: CoreCommandResult;
  reject?: CoreCommandResult;
}

export async function validateResearchArtifact(input: ValidateResearchArtifactInput): Promise<ValidateResearchArtifactOutput> {
  const lane = input.manifest.research.lanes[input.laneId];
  if (!lane) throw new Error(`Unknown research lane ${input.laneId}.`);
  const artifactPath = input.artifactPath ?? lane.expectedArtifactPath;
  const artifactId = input.artifactId ?? `research-artifact-${lane.laneId}`;
  if (artifactPath !== lane.expectedArtifactPath) {
    throw new Error(`Research artifact path ${artifactPath} does not match lane expected path ${lane.expectedArtifactPath}.`);
  }

  const issues: string[] = [];
  let content = "";
  try {
    content = await readFile(resolveRunArtifactPath(input.paths, artifactPath), "utf8");
  } catch {
    issues.push("artifact missing");
  }
  if (content) issues.push(...validateArtifactContent(lane, content));

  const submit = await executeCoreCommand(input.paths, {
    commandType: "research.artifact_submit",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "artifact-validator" },
    boardRevisionRead: input.board.revision,
    payload: {
      laneId: lane.laneId,
      operationId: input.operationId,
      artifactId,
      artifactPath,
      evidenceIds: lane.workerPacketId ? [`research-worker-packet:${lane.workerPacketId}`] : [],
    },
  });

  if (issues.length > 0) {
    const reject = await executeCoreCommand(input.paths, {
      commandType: "research.artifact_reject",
      cwd: input.paths.cwd,
      runId: input.paths.runId,
      actor: { kind: "core_policy", id: "artifact-validator" },
      boardRevisionRead: submit.board.revision,
      payload: {
        laneId: lane.laneId,
        artifactId,
        reason: issues.join("; "),
        evidenceIds: lane.workerPacketId ? [`research-worker-packet:${lane.workerPacketId}`] : [],
      },
    });
    return { ok: false, artifactId, issues, submit, reject };
  }

  const accept = await executeCoreCommand(input.paths, {
    commandType: "research.artifact_accept",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "artifact-validator" },
    boardRevisionRead: submit.board.revision,
    payload: {
      laneId: lane.laneId,
      artifactId,
      routeEffects: input.routeEffects ?? defaultArtifactRouteEffects(lane),
      scoreEffects: [{ kind: "research_artifact_validated", laneId: lane.laneId }],
    },
  });
  return { ok: true, artifactId, issues, submit, accept };
}

export function validateArtifactContent(lane: ResearchLaneContract, content: string): string[] {
  const issues: string[] = [];
  if (!content.startsWith("# Research: ")) issues.push("artifact must start with # Research: <topic>");
  for (const heading of REQUIRED_RESEARCH_HEADINGS) {
    if (!new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "m").test(content)) issues.push(`missing heading: ${heading}`);
  }
  if (/\b(TODO|TBD|placeholder|lorem ipsum|generic finding|fill in later)\b/i.test(content)) issues.push("placeholder or generic finding text present");
  const sections = sectionMap(content);
  const sources = sections.get("Sources Checked") ?? "";
  if (!concreteSourcesListed(sources)) issues.push("missing concrete source citation");
  const observations = cleanSection(sections.get("Observations") ?? "");
  const inferences = cleanSection(sections.get("Inferences") ?? "");
  if (!observations) issues.push("observations section is empty");
  if (!inferences) issues.push("inferences section is empty");
  if (observations && inferences && normalize(observations) === normalize(inferences)) issues.push("observations and inferences are collapsed");
  if (!cleanSection(sections.get("Decision Impact") ?? "")) issues.push("decision impact is empty");
  if (!cleanSection(sections.get("Route Changes Required") ?? "")) issues.push("route changes required is empty");
  const packet = sections.get("Worker Packet") ?? "";
  if (lane.workerPacketId && !packet.includes(lane.workerPacketId)) issues.push("worker packet section does not cite the Core packet id");
  return issues;
}

export function renderResearchArtifactFixture(input: {
  topic: string;
  lane: ResearchLaneContract;
  workerPacketId: string;
  source: string;
  observation: string;
  inference: string;
  routeChangesRequired?: string;
}): string {
  return [
    `# Research: ${input.topic}`,
    "",
    "## Question",
    input.lane.routeChangingQuestion,
    "",
    "## Lane Type",
    input.lane.laneType,
    "",
    "## Worker Packet",
    input.workerPacketId,
    "",
    "## Sources Checked",
    `- file: ${input.source}`,
    "",
    "## Observations",
    input.observation,
    "",
    "## Inferences",
    input.inference,
    "",
    "## Uncertainty",
    input.lane.openUncertainty,
    "",
    "## Decision Impact",
    input.lane.decisionImpact,
    "",
    "## Route Changes Required",
    input.routeChangesRequired ?? "none",
    "",
    "## Recommended Next Step",
    "Accept this artifact through Core validation and continue to synthesis.",
    "",
  ].join("\n");
}

function defaultArtifactRouteEffects(lane: ResearchLaneContract): RouteEffect[] {
  return [
    {
      id: `research:${lane.laneId}:accepted:${randomUUID().slice(0, 8)}`,
      kind: "route.assumption.add",
      text: `Accepted research artifact ${lane.expectedArtifactPath} resolved lane ${lane.laneId}.`,
    },
  ];
}

function sectionMap(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  let current: string | undefined;
  let buffer: string[] = [];
  const flush = () => {
    if (current) sections.set(current, buffer.join("\n").trim());
  };
  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      flush();
      current = match[1]!;
      buffer = [];
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

function concreteSourcesListed(value: string): boolean {
  return value
    .split(/\r?\n/)
    .some((line) => /(?:file:|https?:\/\/|command:|package:|rendered ui|direct observation|\/|\.\w{1,8}\b)/i.test(line) && !/\b(none|n\/a)\b/i.test(line));
}

function cleanSection(value: string): string {
  return value.replace(/^[-*]\s*/gm, "").trim();
}

function normalize(value: string): string {
  return cleanSection(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
