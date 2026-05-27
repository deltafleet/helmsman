import { strict as assert } from "node:assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeCoreCommand, replayCore } from "../core/authority/core-store.ts";
import { readManifestEvents } from "../core/authority/event-io.ts";
import { CoreError, type AutopilotPacket, type BoardProjection, type HelmsmanManifest, type ResearchLaneContract } from "../core/authority/types.ts";
import { resolveRunPaths, type RunPaths } from "../core/document-bus/paths.ts";
import { renderResearchArtifactFixture, validateResearchArtifact } from "../memory-research/artifact-validation.ts";
import { runScopedMemoryScan } from "../memory-research/memory-scan.ts";
import { declareResearchLanesFromMemory, prepareResearchWorkerPackets } from "../memory-research/research-service.ts";
import { recordResearchSynthesis } from "../memory-research/synthesis.ts";
import { confirmRouteLock, invalidateRouteLock, proposeRouteLock } from "../route-lock/index.ts";
import { finishAutopilotLoop, prepareAutopilotLoop, recoverAutopilotLoops, startAutopilotLoop } from "../autopilot/index.ts";
import { buildLivePiRoleBinding } from "../role-runtime/bindings.ts";
import { routeWorkbenchCommand } from "../tui/workbench-command-router.ts";
import { loadWorkbenchState, openWorkbenchSession } from "../tui/workbench-state.ts";

async function main(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "helmsman-gate7-autopilot-"));
  try {
    await verifyPreconditionsAndHappyPath(workspace);
    await verifyAutopilotRejections(workspace);
    await verifyDriftAndRecovery(workspace);
    await verifyTuiAutopilotSurface(workspace);
    console.log("Autopilot Loop verification passed");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function verifyPreconditionsAndHappyPath(workspace: string): Promise<void> {
  const unlocked = await openWorkbenchSession({
    cwd: workspace,
    runId: "autopilot-unlocked",
    title: "Autopilot unlocked rejection",
    initialIntent: "Autopilot must reject unlocked routes.",
    createIfMissing: true,
  });
  await expectError("unlocked route cannot start Autopilot", () => startAutopilotLoop(unlocked), "ROUTE_LOCK_REQUIRED");

  const noRole = await buildLockedSession(workspace, "autopilot-no-role", false);
  await expectError("Autopilot requires a dispatch-ready role binding", () => startAutopilotLoop(noRole), "ROLE_BINDING_MISSING");

  let state = await buildLockedSession(workspace, "autopilot-happy");
  const started = await startAutopilotLoop(state);
  assert.equal(started.core.manifest.run.activeStage, "autopilot");
  assert.equal(started.core.manifest.autopilot.loops[started.plan.loopId]?.status, "running");
  assert.equal(started.core.manifest.autopilot.actionSelections[started.plan.loopId]?.boardRevisionRead, state.board.revision);
  assert.equal(started.core.manifest.autopilot.packets[started.packets[0]!.packetId]?.lockedSnapshotHash, state.manifest.run.routeLock.snapshotHash);
  const eventTypes = (await readManifestEvents(state.paths.manifestEventsPath)).map((event) => event.type);
  assert(eventTypes.includes("autopilot.action_selected"));
  assert(eventTypes.includes("autopilot.packet_prepared"));
  assert(eventTypes.includes("autopilot.loop_started"));
  assert.equal(started.core.board.autopilot["latestLoopStatus"], "running");

  await expectError(
    "duplicate active Autopilot loop is blocked",
    () => startAutopilotLoop({ paths: state.paths, manifest: started.core.manifest, board: started.core.board }),
    "AUTOPILOT",
  );

  const finished = await finishAutopilotLoop({
    paths: state.paths,
    manifest: started.core.manifest,
    board: started.core.board,
    loopId: started.plan.loopId,
    status: "completed",
    adherenceStatus: "adherent",
    reason: "Autopilot loop produced declared route-adherent evidence.",
    requiredResponse: "continue",
    evidenceIds: [`autopilot:loop:${started.plan.loopId}:plan`],
    nextStage: "verification",
  });
  assert.equal(finished.core.manifest.run.activeStage, "verification");
  assert.equal(finished.core.board.nextLegalAction.kind, "run_verification");
  assert.equal(finished.core.manifest.autopilot.loops[started.plan.loopId]?.routeAdherence?.status, "adherent");
}

async function verifyAutopilotRejections(workspace: string): Promise<void> {
  const state = await buildLockedSession(workspace, "autopilot-reject");
  const prepared = await prepareAutopilotLoop(state);

  await expectCoreError(
    "stale Board revision rejects Autopilot start",
    () =>
      executeCoreCommand(state.paths, {
        commandType: "autopilot.loop_start",
        cwd: workspace,
        runId: state.paths.runId,
        actor: { kind: "core_policy", id: "verify-autopilot" },
        boardRevisionRead: state.board.revision - 1,
        payload: {
          actionSelection: prepared.actionSelection,
          packets: prepared.packets,
          plan: prepared.plan,
          planPath: prepared.planPath,
        } as unknown as Record<string, unknown>,
      }),
    "BOARD_REVISION_STALE",
  );

  const missingHashPacket: AutopilotPacket = { ...prepared.packets[0]!, packetId: "missing-hash-packet", operationId: "missing-hash-operation", lockedSnapshotHash: "" };
  await expectCoreError(
    "packet without locked snapshot hash is rejected",
    () =>
      executeCoreCommand(state.paths, {
        commandType: "autopilot.loop_start",
        cwd: workspace,
        runId: state.paths.runId,
        actor: { kind: "core_policy", id: "verify-autopilot" },
        boardRevisionRead: state.board.revision,
        payload: {
          actionSelection: { ...prepared.actionSelection, loopId: "missing-hash-loop", plannedOperationIds: [missingHashPacket.operationId], packetPaths: ["autopilot/loops/missing-hash-loop/missing-hash-packet.json"] },
          packets: [missingHashPacket],
          plan: { ...prepared.plan, loopId: "missing-hash-loop", packetPaths: ["autopilot/loops/missing-hash-loop/missing-hash-packet.json"] },
          planPath: "autopilot/loops/missing-hash-loop/plan.json",
        } as unknown as Record<string, unknown>,
      }),
    "EVENT_SCHEMA_INVALID",
  );

  const conflictPacket: AutopilotPacket = {
    ...prepared.packets[0]!,
    packetId: "conflict-packet",
    operationId: "conflict-operation",
    evidenceCapturePath: "autopilot/loops/conflict-loop/conflict-evidence.jsonl",
    retryPolicy: { ...prepared.packets[0]!.retryPolicy, idempotencyKey: `${prepared.actionSelection.idempotencyKey}:conflict` },
  };
  await expectCoreError(
    "conflicting write roots are rejected before parallel launch",
    () =>
      executeCoreCommand(state.paths, {
        commandType: "autopilot.loop_start",
        cwd: workspace,
        runId: state.paths.runId,
        actor: { kind: "core_policy", id: "verify-autopilot" },
        boardRevisionRead: state.board.revision,
        payload: {
          actionSelection: { ...prepared.actionSelection, loopId: "conflict-loop", plannedOperationIds: [prepared.packets[0]!.operationId, conflictPacket.operationId], packetPaths: ["autopilot/loops/conflict-loop/a.json", "autopilot/loops/conflict-loop/b.json"], idempotencyKey: `${prepared.actionSelection.idempotencyKey}:conflict` },
          packets: [
            { ...prepared.packets[0]!, loopId: "conflict-loop", packetId: "conflict-first", evidenceCapturePath: "autopilot/loops/conflict-loop/first-evidence.jsonl", retryPolicy: { ...prepared.packets[0]!.retryPolicy, idempotencyKey: `${prepared.actionSelection.idempotencyKey}:conflict` } },
            { ...conflictPacket, loopId: "conflict-loop" },
          ],
          plan: { ...prepared.plan, loopId: "conflict-loop", packetPaths: ["autopilot/loops/conflict-loop/a.json", "autopilot/loops/conflict-loop/b.json"], idempotencyKey: `${prepared.plan.idempotencyKey}:conflict`, maxRoleRuns: 2 },
          planPath: "autopilot/loops/conflict-loop/plan.json",
        } as unknown as Record<string, unknown>,
      }),
    "COMMAND_PRECONDITION_FAILED",
  );

  let running = await startAutopilotLoop(state);
  await expectCoreError(
    "forbidden authority claim cannot complete Autopilot",
    () =>
      finishAutopilotLoop({
        paths: state.paths,
        manifest: running.core.manifest,
        board: running.core.board,
        loopId: running.plan.loopId,
        status: "completed",
        adherenceStatus: "forbidden_authority_claim",
        reason: "Model final prose claimed product completion.",
        requiredResponse: "repair",
      }),
    "FINAL_MESSAGE_NOT_COMPLETION",
  );
}

async function verifyDriftAndRecovery(workspace: string): Promise<void> {
  let state = await buildLockedSession(workspace, "autopilot-minor-drift");
  let started = await startAutopilotLoop(state);
  let finished = await finishAutopilotLoop({
    paths: state.paths,
    manifest: started.core.manifest,
    board: started.core.board,
    loopId: started.plan.loopId,
    status: "needs_repair",
    adherenceStatus: "minor_drift",
    reason: "Minor metadata gap can be repaired inside the locked route.",
    requiredResponse: "repair",
  });
  assert.equal(finished.core.manifest.autopilot.loops[started.plan.loopId]?.status, "needs_repair");
  assert.equal(finished.core.board.nextLegalAction.kind, "run_autopilot_loop");

  state = await buildLockedSession(workspace, "autopilot-route-drift");
  started = await startAutopilotLoop(state);
  finished = await finishAutopilotLoop({
    paths: state.paths,
    manifest: started.core.manifest,
    board: started.core.board,
    loopId: started.plan.loopId,
    status: "needs_user_action",
    adherenceStatus: "route_changing_drift",
    reason: "The role discovered a route-changing scope expansion.",
    requiredResponse: "amend",
  });
  assert.equal(finished.core.board.nextLegalAction.kind, "park");
  assert(finished.core.board.forbiddenActions.some((action) => action.action === "run_autopilot_loop"));

  state = await buildLockedSession(workspace, "autopilot-critical-drift");
  started = await startAutopilotLoop(state);
  finished = await finishAutopilotLoop({
    paths: state.paths,
    manifest: started.core.manifest,
    board: started.core.board,
    loopId: started.plan.loopId,
    status: "parked",
    adherenceStatus: "critical_drift",
    reason: "Critical drift requires visible route recovery.",
    requiredResponse: "park",
  });
  const invalidated = await invalidateRouteLock({
    paths: state.paths,
    manifest: finished.core.manifest,
    board: finished.core.board,
    reason: "Critical Autopilot drift invalidated the locked route.",
    severity: "hard",
    requiredResponse: "park",
  });
  assert.equal(invalidated.manifest.run.routeLock.status, "invalidated");
  assert.equal(invalidated.board.nextLegalAction.kind, "park");

  state = await buildLockedSession(workspace, "autopilot-missing-evidence");
  started = await startAutopilotLoop(state);
  finished = await finishAutopilotLoop({
    paths: state.paths,
    manifest: started.core.manifest,
    board: started.core.board,
    loopId: started.plan.loopId,
    status: "parked",
    adherenceStatus: "missing_evidence",
    reason: "Required evidence was absent after execution.",
    requiredResponse: "park",
  });
  assert.equal(finished.core.manifest.autopilot.loops[started.plan.loopId]?.status, "parked");
  assert.equal(finished.core.board.nextLegalAction.kind, "park");

  state = await buildLockedSession(workspace, "autopilot-recovery");
  started = await startAutopilotLoop(state);
  const beforePacketCount = Object.keys(started.core.manifest.autopilot.packets).length;
  const recovered = await recoverAutopilotLoops({ paths: state.paths, manifest: started.core.manifest, board: started.core.board });
  assert.equal(recovered.recovered.length, 1);
  const recoveredCore = recovered.cores.at(-1)!;
  assert.equal(recoveredCore.manifest.autopilot.loops[started.plan.loopId]?.status, "parked");
  assert.equal(Object.keys(recoveredCore.manifest.autopilot.packets).length, beforePacketCount);
  const replayed = await replayCore(state.paths, { repair: true });
  assert.equal(replayed.status === "healthy" || replayed.status === "projection_stale", true);
  assert.equal(replayed.manifest?.autopilot.loops[started.plan.loopId]?.status, "parked");
}

async function verifyTuiAutopilotSurface(workspace: string): Promise<void> {
  let state = await buildLockedSession(workspace, "autopilot-tui");
  let routed = await routeWorkbenchCommand(await loadWorkbenchState({ paths: state.paths, view: "autopilot", statusLine: "verify" }), "/autopilot");
  assert.equal(routed.ok, true);
  assert.equal(routed.mutatedAuthority, false);
  routed = await routeWorkbenchCommand(routed.state, "/autopilot start");
  assert.equal(routed.ok, true);
  assert.equal(routed.mutatedAuthority, true);
  const loopId = Object.keys(routed.state.manifest.autopilot.loops)[0]!;
  routed = await routeWorkbenchCommand(routed.state, `/autopilot finish ${loopId} completed adherent continue route adhered`);
  assert.equal(routed.ok, true);
  assert.equal(routed.state.manifest.autopilot.loops[loopId]?.status, "completed");
}

async function buildLockedSession(workspace: string, runId: string, bindAutopilotRole = true): Promise<{ paths: RunPaths; manifest: HelmsmanManifest; board: BoardProjection }> {
  let state = await openWorkbenchSession({
    cwd: workspace,
    runId,
    title: `Gate 7 ${runId}`,
    initialIntent: "Verify Board-governed Autopilot for the full Helmsman product.",
    createIfMissing: true,
  });
  let routed = await routeWorkbenchCommand(state, "/charting", { renderer: "headless_cli", width: 100 });
  assert.equal(routed.ok, true);
  state = routed.state;
  routed = await routeWorkbenchCommand(state, '/answer {"q1":["a"],"q2":["a"],"q3":["a","b"],"q4":["a","b"]}', { renderer: "headless_cli", width: 100 });
  assert.equal(routed.ok, true);
  state = routed.state;

  await writeFile(join(workspace, `${runId}-reused-memory.md`), "helmsman-memory-status: reused\nAutopilot should preserve the locked route.\n", "utf8");
  await writeFile(join(workspace, `${runId}-stale-memory.md`), "helmsman-memory-status: stale\nAutopilot loop behavior needs current Pi-direct validation.\n", "utf8");
  const scan = await runScopedMemoryScan({
    paths: state.paths,
    manifest: state.manifest,
    board: state.board,
    sourcesToInspect: [{ ref: `${runId}-reused-memory.md` }, { ref: `${runId}-stale-memory.md` }],
  });
  let manifest = scan.core.manifest;
  let board = scan.core.board;

  const lanes = await declareResearchLanesFromMemory({ paths: state.paths, manifest, board });
  assert(lanes.core);
  manifest = lanes.core.manifest;
  board = lanes.core.board;
  const packets = await prepareResearchWorkerPackets({ paths: state.paths, manifest, board });
  assert(packets.core);
  manifest = packets.core.manifest;
  board = packets.core.board;

  for (const lane of Object.values(manifest.research.lanes)) {
    await writeValidArtifact(state.paths, lane);
    const result = await validateResearchArtifact({ paths: state.paths, manifest, board, laneId: lane.laneId });
    assert.equal(result.ok, true, result.issues.join("; "));
    manifest = result.accept!.manifest;
    board = result.accept!.board;
  }

  const synthesis = await recordResearchSynthesis({ paths: state.paths, manifest, board });
  const proposal = await proposeRouteLock({ paths: state.paths, manifest: synthesis.core.manifest, board: synthesis.core.board });
  const confirmed = await confirmRouteLock({
    paths: state.paths,
    manifest: proposal.core.manifest,
    board: proposal.core.board,
    proposalId: proposal.proposal.proposalId,
    snapshotHash: proposal.proposal.snapshotHash,
    surface: "headless",
  });
  if (!bindAutopilotRole) return { paths: state.paths, manifest: confirmed.core.manifest, board: confirmed.core.board };
  const binding = buildLivePiRoleBinding({
    cwd: workspace,
    roleId: "autopilot-implementer",
    purpose: "autopilot",
    allowedReadRoots: [workspace, "route-lock/snapshot.json", "rendered/route-card.md"],
    allowedWriteRoots: ["autopilot"],
    timeoutMs: 120000,
  });
  const bound = await executeCoreCommand(state.paths, {
    commandType: "role.binding_set",
    cwd: workspace,
    runId: state.paths.runId,
    actor: { kind: "core_policy", id: "verify-autopilot" },
    boardRevisionRead: confirmed.core.board.revision,
    payload: { binding, evidenceIds: [] },
  });
  return { paths: state.paths, manifest: bound.manifest, board: bound.board };
}

async function writeValidArtifact(paths: RunPaths, lane: ResearchLaneContract): Promise<void> {
  const content = renderResearchArtifactFixture({
    topic: lane.slug,
    lane,
    workerPacketId: lane.workerPacketId!,
    source: lane.sourcesToInspect[0] ?? paths.researchIndexPath,
    observation: `Observed ${lane.sourcesToInspect[0] ?? "source"} for ${lane.laneId}.`,
    inference: `Autopilot can use the accepted artifact for ${lane.laneId}.`,
  });
  await writeFile(join(paths.runRoot, lane.expectedArtifactPath), content, "utf8");
}

async function expectCoreError(name: string, fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof CoreError, `${name}: expected CoreError, got ${error instanceof Error ? error.message : String(error)}`);
    assert.equal(error.code, code, name);
    return;
  }
  assert.fail(`${name}: expected CoreError ${code}`);
}

async function expectError(name: string, fn: () => Promise<unknown>, needle: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(needle), `${name}: expected error containing ${needle}, got ${message}`);
    return;
  }
  assert.fail(`${name}: expected error containing ${needle}`);
}

await main();
