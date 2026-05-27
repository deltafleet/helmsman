import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import { readFile, readdir, stat } from "node:fs/promises";
import { executeCoreCommand, type CoreCommandResult } from "../core/authority/core-store.ts";
import { readManifestEvents } from "../core/authority/event-io.ts";
import type { BoardProjection, HelmsmanManifest, MemoryCandidateJudgment, MemoryClassification, MemoryScanPlan, MemorySourceRef, RouteEffect } from "../core/authority/types.ts";
import { atomicWriteFile } from "../core/document-bus/atomic-write.ts";
import type { RunPaths } from "../core/document-bus/paths.ts";
import { assertRelativeUnder, resolveRunArtifactPath, slugify } from "./contracts.ts";

export interface RunScopedMemoryScanInput {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
  sourcesToInspect: Array<Partial<MemorySourceRef> & { ref: string }>;
  sourcesToSkip?: MemorySourceRef[];
  routeQuestion?: string;
  searchCoordinates?: string[];
  scanId?: string;
}

export interface RunScopedMemoryScanOutput {
  plan: MemoryScanPlan;
  candidates: MemoryCandidateJudgment[];
  core: CoreCommandResult;
}

export async function runScopedMemoryScan(input: RunScopedMemoryScanInput): Promise<RunScopedMemoryScanOutput> {
  if (input.manifest.run.activeStage !== "charting" && input.manifest.run.activeStage !== "memory_scan") {
    throw new Error(`Scoped memory scan requires charting or memory_scan stage, found ${input.manifest.run.activeStage}.`);
  }
  if (input.manifest.questions.openQuestionIds.length > 0) {
    throw new Error("Scoped memory scan requires all required Aperture questions to be answered.");
  }
  if (Object.keys(input.manifest.questions.answers).length === 0) {
    throw new Error("Scoped memory scan requires recorded Aperture answer evidence.");
  }
  if (input.sourcesToInspect.length === 0) {
    throw new Error("Scoped memory scan requires at least one named memory source.");
  }

  let manifest = input.manifest;
  let board = input.board;
  if (manifest.run.activeStage === "charting") {
    const staged = await executeCoreCommand(input.paths, {
      commandType: "run.stage_change",
      cwd: input.paths.cwd,
      runId: input.paths.runId,
      actor: { kind: "core_policy", id: "memory-research" },
      boardRevisionRead: board.revision,
      payload: { to: "memory_scan", reason: "Aperture answers recorded; starting scoped memory scan." },
    });
    manifest = staged.manifest;
    board = staged.board;
  }

  const scanId = input.scanId ?? `scan-${slugify(manifest.run.id)}-${randomUUID().slice(0, 8)}`;
  const selectedApertureQuestionIds = Object.keys(manifest.questions.answers);
  const apertureAnswerEventIds = await answerEventIds(input.paths, selectedApertureQuestionIds);
  const routeQuestion = input.routeQuestion ?? latestRouteQuestion(manifest);
  const searchCoordinates = input.searchCoordinates ?? buildSearchCoordinates(manifest);
  const sourcesToInspect = await normalizeSources(input.paths, input.sourcesToInspect);
  const plan: MemoryScanPlan = {
    schemaVersion: "helmsman.memory-scan.v1",
    runId: manifest.run.id,
    scanId,
    selectedApertureQuestionIds,
    apertureAnswerEventIds,
    routeQuestion,
    searchCoordinates,
    sourcesToInspect,
    sourcesToSkip: input.sourcesToSkip ?? [],
    artifactPath: `memory/${scanId}.md`,
    indexPath: "memory-index.md",
    createdAt: new Date().toISOString(),
  };
  assertRelativeUnder(plan.artifactPath, "memory");

  const candidates: MemoryCandidateJudgment[] = [];
  for (const source of sourcesToInspect) {
    candidates.push(await classifyMemorySource({ paths: input.paths, plan, source, searchCoordinates }));
  }

  await atomicWriteFile(resolveRunArtifactPath(input.paths, plan.artifactPath), renderMemoryScanArtifact(plan, candidates));
  await atomicWriteFile(input.paths.memoryIndexPath, renderMemoryIndex(plan, candidates));

  const core = await executeCoreCommand(input.paths, {
    commandType: "memory.scan_record",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "memory-research" },
    boardRevisionRead: board.revision,
    payload: { plan, candidateJudgments: candidates },
  });

  return { plan, candidates, core };
}

async function normalizeSources(paths: RunPaths, sources: Array<Partial<MemorySourceRef> & { ref: string }>): Promise<MemorySourceRef[]> {
  const output: MemorySourceRef[] = [];
  for (const source of sources) {
    const kind = source.kind ?? await inferSourceKind(paths, source.ref);
    output.push({
      sourceId: source.sourceId ?? slugify(`${kind}-${basename(source.ref) || source.ref}`),
      kind,
      ref: source.ref,
      description: source.description,
    });
  }
  return output;
}

async function inferSourceKind(paths: RunPaths, ref: string): Promise<MemorySourceRef["kind"]> {
  if (/^https?:\/\//i.test(ref)) return "url";
  try {
    const info = await stat(resolve(paths.cwd, ref));
    return info.isDirectory() ? "directory" : "file";
  } catch {
    return "file";
  }
}

async function classifyMemorySource(input: {
  paths: RunPaths;
  plan: MemoryScanPlan;
  source: MemorySourceRef;
  searchCoordinates: string[];
}): Promise<MemoryCandidateJudgment> {
  const sourceRead = await readSource(input.paths, input.source);
  const candidateId = `memory-${input.plan.scanId}-${slugify(input.source.sourceId)}`;
  const explicit = sourceRead.content ? extractExplicitClassification(sourceRead.content) : undefined;
  const classification = sourceRead.missing ? "missing" : explicit ?? inferClassification(sourceRead.content, input.searchCoordinates);
  const createsResearchLaneId = ["stale", "missing", "conflict"].includes(classification) ? `lane-${slugify(`${input.source.sourceId}-${classification}`)}` : undefined;
  const routeEffects: RouteEffect[] = classification === "reused"
    ? [
        {
          id: `memory:${candidateId}:reused`,
          kind: "route.assumption.add",
          text: `Reused memory source ${input.source.ref} for route question: ${input.plan.routeQuestion}`,
        },
      ]
    : [];
  return {
    scanId: input.plan.scanId,
    candidateId,
    sourceRef: input.source.ref,
    classification,
    reason: sourceRead.missing
      ? `Source could not be read: ${sourceRead.error ?? input.source.ref}.`
      : explicit
        ? `Source declares ${classification} for this memory review.`
        : classification === "reused"
          ? "Source intersects the Aperture-derived search coordinates and is treated as reusable prior memory."
          : "Source does not intersect the Aperture-derived search coordinates strongly enough for this route.",
    routeEffects,
    createsResearchLaneId,
    blocksRouteLock: Boolean(createsResearchLaneId),
  };
}

async function readSource(paths: RunPaths, source: MemorySourceRef): Promise<{ content: string; missing: boolean; error?: string }> {
  if (source.kind === "manual") return { content: source.ref, missing: false };
  if (source.kind === "url" || source.kind === "memory_registry") {
    return { content: source.ref, missing: false };
  }
  const path = resolve(paths.cwd, source.ref);
  try {
    const info = await stat(path);
    if (info.isDirectory()) {
      const entries = await readdir(path, { withFileTypes: true });
      const chunks = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && /\.(md|mdx|txt|json)$/i.test(entry.name))
          .slice(0, 24)
          .map(async (entry) => {
            try {
              return `\n# ${entry.name}\n${(await readFile(resolve(path, entry.name), "utf8")).slice(0, 20000)}`;
            } catch {
              return "";
            }
          }),
      );
      return { content: chunks.join("\n"), missing: false };
    }
    return { content: await readFile(path, "utf8"), missing: false };
  } catch (error) {
    return { content: "", missing: true, error: error instanceof Error ? error.message : String(error) };
  }
}

function extractExplicitClassification(content: string): MemoryClassification | undefined {
  const match = content.match(/(?:helmsman-memory-status|classification)\s*:\s*(reused|stale|irrelevant|missing|conflict)\b/i);
  return match?.[1]?.toLowerCase() as MemoryClassification | undefined;
}

function inferClassification(content: string, coordinates: string[]): MemoryClassification {
  const haystack = content.toLowerCase();
  const hits = coordinateTokens(coordinates).filter((token) => haystack.includes(token));
  return hits.length >= 2 ? "reused" : "irrelevant";
}

function coordinateTokens(coordinates: string[]): string[] {
  return [...new Set(coordinates.flatMap((coordinate) => coordinate.toLowerCase().split(/[^a-z0-9]+/)).filter((token) => token.length >= 5))].slice(0, 40);
}

function latestRouteQuestion(manifest: HelmsmanManifest): string {
  const latestBundle = Object.values(manifest.questions.bundles).at(-1);
  return latestBundle?.routeQuestion ?? `What prior memory affects ${manifest.route.goal}?`;
}

function buildSearchCoordinates(manifest: HelmsmanManifest): string[] {
  const answerText = Object.values(manifest.questions.answers).flatMap((answer) => [
    ...answer.answerDetails.optionLabels,
    ...answer.answerDetails.optionDescriptions,
    answer.freeFormText ?? "",
  ]);
  return [
    manifest.route.goal,
    ...manifest.route.scope.map((item) => item.text),
    ...manifest.route.successCriteria.map((item) => item.text),
    ...manifest.route.stopConditions.map((item) => item.text),
    ...answerText,
  ].filter((value) => value.trim().length > 0);
}

async function answerEventIds(paths: RunPaths, questionIds: string[]): Promise<string[]> {
  const selected = new Set(questionIds);
  const events = await readManifestEvents(paths.manifestEventsPath);
  return events
    .filter((event) => event.type === "question.answered" && selected.has(String((event.payload as { questionId?: string }).questionId)))
    .map((event) => event.eventId);
}

function renderMemoryScanArtifact(plan: MemoryScanPlan, candidates: MemoryCandidateJudgment[]): string {
  return [
    `# Memory Scan: ${plan.scanId}`,
    "",
    `Route question: ${plan.routeQuestion}`,
    `Created: ${plan.createdAt}`,
    "",
    "## Aperture",
    "",
    ...plan.selectedApertureQuestionIds.map((questionId) => `- question: ${questionId}`),
    ...plan.apertureAnswerEventIds.map((eventId) => `- answer event: ${eventId}`),
    "",
    "## Search Coordinates",
    "",
    ...plan.searchCoordinates.map((coordinate) => `- ${coordinate}`),
    "",
    "## Sources Inspected",
    "",
    ...plan.sourcesToInspect.map((source) => `- ${source.sourceId}: ${source.kind} ${source.ref}`),
    "",
    "## Candidate Judgments",
    "",
    ...candidates.map((candidate) => `- ${candidate.candidateId}: ${candidate.classification}; ${candidate.reason}${candidate.createsResearchLaneId ? `; lane ${candidate.createsResearchLaneId}` : ""}`),
    "",
  ].join("\n");
}

function renderMemoryIndex(plan: MemoryScanPlan, candidates: MemoryCandidateJudgment[]): string {
  return [
    "# Memory Index",
    "",
    `Latest scan: ${plan.scanId}`,
    `Artifact: ${plan.artifactPath}`,
    "",
    "## Classification Counts",
    "",
    ...Object.entries(countBy(candidates.map((candidate) => candidate.classification))).map(([classification, count]) => `- ${classification}: ${count}`),
    "",
    "## Blocking Candidates",
    "",
    ...candidates.filter((candidate) => candidate.blocksRouteLock).map((candidate) => `- ${candidate.candidateId}: ${candidate.createsResearchLaneId}`),
    ...(candidates.some((candidate) => candidate.blocksRouteLock) ? [] : ["- none"]),
    "",
  ].join("\n");
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}
