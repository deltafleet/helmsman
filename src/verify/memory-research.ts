import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeCoreCommand, replayCore } from "../core/authority/core-store.ts";
import { CoreError, type BoardProjection, type HelmsmanManifest, type ResearchLaneContract } from "../core/authority/types.ts";
import { resolveRunPaths, type RunPaths } from "../core/document-bus/paths.ts";
import { renderResearchArtifactFixture, validateResearchArtifact } from "../memory-research/artifact-validation.ts";
import { runScopedMemoryScan } from "../memory-research/memory-scan.ts";
import { declareResearchLanesFromMemory, prepareResearchWorkerPackets } from "../memory-research/research-service.ts";
import { recordResearchSynthesis } from "../memory-research/synthesis.ts";
import { routeWorkbenchCommand } from "../tui/workbench-command-router.ts";
import { openWorkbenchSession } from "../tui/workbench-state.ts";

async function main(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "helmsman-gate5-memory-research-"));
  try {
    await verifyScanRejectedBeforeAperture(workspace);
    await verifyMemoryResearchFlow(workspace);
    console.log("Memory/Research verification passed");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function verifyScanRejectedBeforeAperture(workspace: string): Promise<void> {
  const paths = resolveRunPaths({ cwd: workspace, runId: "precondition" });
  const created = await executeCoreCommand(paths, {
    commandType: "run.create",
    cwd: workspace,
    runId: "precondition",
    actor: { kind: "user", id: "verify" },
    payload: { title: "Precondition", workspace, initialIntent: "Reject broad memory scans before Aperture." },
  });
  await expectRejects(
    "service rejects memory scan before Aperture answer",
    () => runScopedMemoryScan({ paths, manifest: created.manifest, board: created.board, sourcesToInspect: [{ ref: "memory.md" }] }),
    /charting|Aperture/i,
  );
  await expectCoreError(
    "Core rejects broad memory scan command from initial chat",
    () =>
      executeCoreCommand(paths, {
        commandType: "memory.scan_record",
        cwd: workspace,
        runId: "precondition",
        actor: { kind: "core_policy", id: "verify" },
        boardRevisionRead: created.board.revision,
        payload: {
          schemaVersion: "helmsman.memory-scan.v1",
          runId: "precondition",
          scanId: "broad",
          selectedApertureQuestionIds: [],
          apertureAnswerEventIds: [],
          routeQuestion: "broad",
          searchCoordinates: ["initial"],
          sourcesToInspect: [{ sourceId: "broad", kind: "file", ref: "memory.md" }],
          sourcesToSkip: [],
          artifactPath: "memory/broad.md",
          indexPath: "memory-index.md",
          createdAt: new Date().toISOString(),
        },
      }),
    "COMMAND_STAGE_ILLEGAL",
  );
}

async function verifyMemoryResearchFlow(workspace: string): Promise<void> {
  let state = await openWorkbenchSession({
    cwd: workspace,
    runId: "gate5",
    title: "Gate 5 Memory/Research",
    initialIntent: "Verify the full Memory and Research contract.",
    createIfMissing: true,
  });
  let routed = await routeWorkbenchCommand(state, "/charting", { renderer: "headless_cli", width: 100 });
  assert.equal(routed.ok, true);
  state = routed.state;
  routed = await routeWorkbenchCommand(
    state,
    '/answer {"q1":["a"],"q2":["a"],"q3":["a","b"],"q4":["a","b"]}',
    { renderer: "headless_cli", width: 100 },
  );
  assert.equal(routed.ok, true);
  state = routed.state;
  assert.equal(state.board.nextLegalAction.kind, "run_memory_scan");

  await writeFile(join(workspace, "reused-memory.md"), "helmsman-memory-status: reused\nComplete product route focused verification checkpoint sync.\n", "utf8");
  await writeFile(join(workspace, "stale-memory.md"), "helmsman-memory-status: stale\nOld desktop archive notes may not match Pi direct runtime.\n", "utf8");
  await writeFile(join(workspace, "irrelevant-memory.md"), "helmsman-memory-status: irrelevant\nUnrelated meeting notes.\n", "utf8");
  await writeFile(join(workspace, "conflict-memory.md"), "helmsman-memory-status: conflict\nOne note says external adapter owns completion, another says Core owns it.\n", "utf8");

  const scan = await runScopedMemoryScan({
    paths: state.paths,
    manifest: state.manifest,
    board: state.board,
    sourcesToInspect: [
      { ref: "reused-memory.md" },
      { ref: "stale-memory.md" },
      { ref: "irrelevant-memory.md" },
      { ref: "conflict-memory.md" },
      { ref: "missing-memory.md" },
    ],
  });
  let manifest = scan.core.manifest;
  let board = scan.core.board;
  assert.equal(manifest.run.activeStage, "memory_scan");
  assert.equal(Object.keys(manifest.memory.scans).length, 1);
  assert.equal(Object.keys(manifest.memory.candidates).length, 5);
  assert.equal(countClassifications(manifest).reused, 1);
  assert.equal(countClassifications(manifest).irrelevant, 1);
  assert.equal(countClassifications(manifest).stale, 1);
  assert.equal(countClassifications(manifest).missing, 1);
  assert.equal(countClassifications(manifest).conflict, 1);
  assert(manifest.route.assumptions.some((item) => item.text.includes("Reused memory source")));
  assert(!Object.values(manifest.memory.candidates).find((candidate) => candidate.classification === "reused")?.createsResearchLaneId);
  assert(!Object.values(manifest.memory.candidates).find((candidate) => candidate.classification === "irrelevant")?.createsResearchLaneId);
  assert.equal(board.nextLegalAction.kind, "dispatch_research");
  assert(board.blockers.some((blocker) => blocker.blockerId.startsWith("research-required:")));
  assert((await readFile(state.paths.memoryIndexPath, "utf8")).includes("Classification Counts"));

  const laneDeclaration = await declareResearchLanesFromMemory({ paths: state.paths, manifest, board, maxActiveLanes: 2 });
  assert(laneDeclaration.core);
  manifest = laneDeclaration.core.manifest;
  board = laneDeclaration.core.board;
  const lanes = Object.values(manifest.research.lanes);
  assert.equal(lanes.length, 3);
  assert(lanes.every((lane) => lane.expectedArtifactPath.startsWith("research/")));
  assert(lanes.every((lane) => lane.routeChangingQuestion.length > 0 && lane.decisionImpact.length > 0));

  const invalidLane = { ...lanes[0]!, laneId: "lane-invalid-path", slug: "invalid-path", expectedArtifactPath: "../escape.md", allowedWriteScope: ["../escape.md"] };
  await expectCoreError(
    "lane declaration rejects paths outside research root",
    () =>
      executeCoreCommand(state.paths, {
        commandType: "research.lane_plan",
        cwd: workspace,
        runId: state.runId,
        actor: { kind: "core_policy", id: "verify" },
        boardRevisionRead: board.revision,
        payload: invalidLane as unknown as Record<string, unknown>,
      }),
    "EVENT_SCHEMA_INVALID",
  );

  const conflictManifest = structuredClone(manifest) as HelmsmanManifest;
  const conflictLanes = Object.values(conflictManifest.research.lanes);
  conflictLanes[0]!.allowedWriteScope = ["research/conflict.md"];
  conflictLanes[0]!.expectedArtifactPath = "research/conflict.md";
  conflictLanes[1]!.allowedWriteScope = ["research/conflict.md"];
  conflictLanes[1]!.expectedArtifactPath = "research/conflict.md";
  await expectRejects(
    "conflicting write scopes reject parallel dispatch",
    () => prepareResearchWorkerPackets({ paths: state.paths, manifest: conflictManifest, board, maxActiveLanes: 2 }),
    /Conflicting research worker write scope/,
  );

  let packetPrep = await prepareResearchWorkerPackets({ paths: state.paths, manifest, board, maxActiveLanes: 2 });
  assert(packetPrep.core);
  manifest = packetPrep.core.manifest;
  board = packetPrep.core.board;
  assert.equal(packetPrep.packets.length, 2);
  assert(packetPrep.packets.every((packet) => packet.allowedWriteScope.length === 1));
  assert(packetPrep.packets.every((packet) => packet.requiredArtifactPath.startsWith("research/")));
  assert(packetPrep.packets.every((packet) => packet.doneCriteria.length > 0));
  assert(packetPrep.packets.every((packet) => packet.forbiddenActions.join("\n").toLowerCase().includes("route lock")));
  assert.equal((board.research["activeLaneIds"] as string[]).length, 2);
  assert.equal((board.research["queuedLaneIds"] as string[]).length, 1);
  assert(board.blockers.some((blocker) => blocker.blockerId.startsWith("research-lane-open:")));

  const queuedWithoutPacket = Object.values(manifest.research.lanes).find((lane) => !lane.workerPacketId);
  assert(queuedWithoutPacket);
  await writeValidArtifact(state.paths, queuedWithoutPacket);
  await expectCoreError(
    "chat-only or packetless artifact completion is rejected",
    () => validateResearchArtifact({ paths: state.paths, manifest, board, laneId: queuedWithoutPacket.laneId }),
    "EVENT_SCHEMA_INVALID",
  );

  const replayed = await replayCore(state.paths, { repair: true });
  assert.equal(replayed.status === "healthy" || replayed.status === "projection_stale", true);
  assert(replayed.manifest && replayed.board);
  packetPrep = await prepareResearchWorkerPackets({ paths: state.paths, manifest: replayed.manifest, board: replayed.board, maxActiveLanes: 2 });
  assert.equal(packetPrep.packets.length, 1);
  assert(packetPrep.core);
  manifest = packetPrep.core.manifest;
  board = packetPrep.core.board;
  assert.equal(Object.keys(manifest.research.packets).length, 3);

  const firstLane = Object.values(manifest.research.lanes)[0]!;
  ({ manifest, board } = await rejectInvalidArtifacts(state.paths, manifest, board, firstLane));
  ({ manifest, board } = await acceptLaneArtifact(state.paths, manifest, board, firstLane));
  assert.equal(manifest.research.lanes[firstLane.laneId]?.status, "accepted");
  assert(manifest.research.acceptedArtifactIds.includes(`research-artifact-${firstLane.laneId}`));
  assert(manifest.scorecard.currentScore > 0);

  for (const lane of Object.values(manifest.research.lanes).filter((candidate) => candidate.status !== "accepted")) {
    ({ manifest, board } = await acceptLaneArtifact(state.paths, manifest, board, lane));
  }
  assert.equal(Object.values(manifest.research.lanes).every((lane) => lane.status === "accepted"), true);
  assert.equal(board.blockers.some((blocker) => blocker.blockerId.startsWith("research-lane-open:")), false);

  const synthesis = await recordResearchSynthesis({ paths: state.paths, manifest, board });
  manifest = synthesis.core.manifest;
  board = synthesis.core.board;
  assert.equal(synthesis.synthesis.outcome, "lock_ready");
  assert.equal(manifest.run.activeStage, "lock_ready");
  assert.equal(manifest.run.routeLock.status, "unlocked");
  assert.equal(board.nextLegalAction.kind, "propose_route_lock");
  assert.equal(board.gates["research.synthesis_recorded"]?.status, "passed");
  assert((await readFile(join(state.paths.runRoot, synthesis.artifactPath), "utf8")).includes("Research Synthesis"));
}

async function rejectInvalidArtifacts(paths: RunPaths, manifest: HelmsmanManifest, board: BoardProjection, lane: ResearchLaneContract): Promise<{ manifest: HelmsmanManifest; board: BoardProjection }> {
  let result = await validateResearchArtifact({ paths, manifest, board, laneId: lane.laneId });
  assert.equal(result.ok, false);
  assert(result.issues.includes("artifact missing"));
  manifest = result.reject!.manifest;
  board = result.reject!.board;

  await writeFile(join(paths.runRoot, lane.expectedArtifactPath), "# Research: placeholder\n\nTODO placeholder\n", "utf8");
  result = await validateResearchArtifact({ paths, manifest, board, laneId: lane.laneId });
  assert.equal(result.ok, false);
  assert(result.issues.some((issue) => issue.includes("placeholder")));
  manifest = result.reject!.manifest;
  board = result.reject!.board;

  const collapsed = renderResearchArtifactFixture({
    topic: lane.slug,
    lane,
    workerPacketId: lane.workerPacketId!,
    source: lane.sourcesToInspect[0]!,
    observation: "The same sentence appears in both sections.",
    inference: "The same sentence appears in both sections.",
  });
  await writeFile(join(paths.runRoot, lane.expectedArtifactPath), collapsed, "utf8");
  result = await validateResearchArtifact({ paths, manifest, board, laneId: lane.laneId });
  assert.equal(result.ok, false);
  assert(result.issues.includes("observations and inferences are collapsed"));
  return { manifest: result.reject!.manifest, board: result.reject!.board };
}

async function acceptLaneArtifact(paths: RunPaths, manifest: HelmsmanManifest, board: BoardProjection, lane: ResearchLaneContract): Promise<{ manifest: HelmsmanManifest; board: BoardProjection }> {
  await writeValidArtifact(paths, lane);
  const result = await validateResearchArtifact({ paths, manifest, board, laneId: lane.laneId });
  assert.equal(result.ok, true, result.issues.join("; "));
  return { manifest: result.accept!.manifest, board: result.accept!.board };
}

async function writeValidArtifact(paths: RunPaths, lane: ResearchLaneContract): Promise<void> {
  const content = renderResearchArtifactFixture({
    topic: lane.slug,
    lane,
    workerPacketId: lane.workerPacketId ?? "packet-missing",
    source: lane.sourcesToInspect[0] ?? paths.researchIndexPath,
    observation: `Observed source ${lane.sourcesToInspect[0] ?? "unknown"} for lane ${lane.laneId}.`,
    inference: `Lane ${lane.laneId} can be resolved by accepting the cited source evidence through Core.`,
  });
  await writeFile(join(paths.runRoot, lane.expectedArtifactPath), content, "utf8");
}

function countClassifications(manifest: HelmsmanManifest): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const candidate of Object.values(manifest.memory.candidates)) counts[candidate.classification] = (counts[candidate.classification] ?? 0) + 1;
  return counts;
}

async function expectCoreError(name: string, fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof CoreError, `${name}: expected CoreError`);
    assert.equal(error.code, code, name);
    return;
  }
  assert.fail(`${name}: expected CoreError ${code}`);
}

async function expectRejects(name: string, fn: () => Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(pattern.test(message), `${name}: ${message}`);
    return;
  }
  assert.fail(`${name}: expected rejection`);
}

await main();
