import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeCoreCommand, replayCore } from "../core/authority/core-store.ts";
import { readManifestEvents } from "../core/authority/event-io.ts";
import { CoreError, type BoardProjection, type HelmsmanManifest, type ManifestEvent, type ResearchLaneContract, type RouteAmendment } from "../core/authority/types.ts";
import { resolveRunPaths, type RunPaths } from "../core/document-bus/paths.ts";
import { renderResearchArtifactFixture, validateResearchArtifact } from "../memory-research/artifact-validation.ts";
import { runScopedMemoryScan } from "../memory-research/memory-scan.ts";
import { declareResearchLanesFromMemory, prepareResearchWorkerPackets } from "../memory-research/research-service.ts";
import { recordResearchSynthesis } from "../memory-research/synthesis.ts";
import {
  applyRouteAmendment,
  buildRouteLockSnapshot,
  confirmRouteLock,
  evaluateRouteLockReadiness,
  hashRouteLockSnapshot,
  invalidateRouteLock,
  proposeRouteAmendment,
  proposeRouteLock,
  unlockRouteLock,
} from "../route-lock/index.ts";
import { routeWorkbenchCommand } from "../tui/workbench-command-router.ts";
import { loadWorkbenchState, openWorkbenchSession } from "../tui/workbench-state.ts";

async function main(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "helmsman-gate6-route-lock-"));
  try {
    await verifyReadinessBlockers(workspace);
    await verifyRouteLockLifecycle(workspace);
    await verifyTuiLockSurface(workspace);
    console.log("Route Lock/Amendment verification passed");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function verifyReadinessBlockers(workspace: string): Promise<void> {
  let state = await openWorkbenchSession({
    cwd: workspace,
    runId: "readiness-open",
    title: "Readiness blockers",
    initialIntent: "Verify Route Lock readiness blockers.",
    createIfMissing: true,
  });
  let routed = await routeWorkbenchCommand(state, "/charting", { renderer: "headless_cli", width: 100 });
  state = routed.state;
  const openReadiness = evaluateRouteLockReadiness({ paths: state.paths, manifest: state.manifest, board: state.board });
  assert.equal(openReadiness.status, "blocked");
  assert(openReadiness.hardBlockers.some((blocker) => blocker.code === "OPEN_ROUTE_QUESTION"));

  const ready = await buildLockReadySession(workspace, "readiness-ready");
  const noSurface = structuredClone(ready.manifest) as HelmsmanManifest;
  const firstSurfaceId = Object.values(noSurface.questions.answers)[0]!.surfaceId;
  delete noSurface.evidence.records[firstSurfaceId];
  const missingSurface = evaluateRouteLockReadiness({ paths: ready.paths, manifest: noSurface, board: ready.board });
  assert(missingSurface.hardBlockers.some((blocker) => blocker.code === "QUESTION_SURFACE_MISSING"));

  const noArtifact = structuredClone(ready.manifest) as HelmsmanManifest;
  const firstArtifactId = noArtifact.research.acceptedArtifactIds[0]!;
  noArtifact.artifacts.records[firstArtifactId]!.status = "submitted";
  const missingAcceptedArtifact = evaluateRouteLockReadiness({ paths: ready.paths, manifest: noArtifact, board: ready.board });
  assert(missingAcceptedArtifact.hardBlockers.some((blocker) => blocker.code === "ARTIFACT_NOT_ACCEPTED"));

  const noScenario = structuredClone(ready.manifest) as HelmsmanManifest;
  noScenario.route.verificationScenarios = [];
  const missingScenario = evaluateRouteLockReadiness({ paths: ready.paths, manifest: noScenario, board: ready.board });
  assert(missingScenario.hardBlockers.some((blocker) => blocker.code === "VERIFICATION_SCENARIOS_MISSING"));
}

async function verifyRouteLockLifecycle(workspace: string): Promise<void> {
  let state = await buildLockReadySession(workspace, "lifecycle");
  const readiness = evaluateRouteLockReadiness(state);
  assert.equal(readiness.status, "lock_ready");

  const firstSnapshotHash = hashRouteLockSnapshot(buildRouteLockSnapshot(state));
  const secondSnapshotHash = hashRouteLockSnapshot(buildRouteLockSnapshot(state));
  assert.equal(firstSnapshotHash, secondSnapshotHash);

  const proposal = await proposeRouteLock(state);
  assert.equal(proposal.core.manifest.run.routeLock.status, "lock_ready");
  assert.equal(proposal.proposal.snapshotHash, firstSnapshotHash);
  assert((await readFile(state.paths.routeLockSnapshotMarkdownPath, "utf8")).includes(firstSnapshotHash));

  await expectCoreError(
    "lead/core cannot confirm initial Route Lock",
    () =>
      executeCoreCommand(state.paths, {
        commandType: "route.lock_confirm",
        cwd: workspace,
        runId: state.paths.runId,
        actor: { kind: "core_policy", id: "verify" },
        boardRevisionRead: proposal.core.board.revision,
        payload: {
          proposalId: proposal.proposal.proposalId,
          confirmedBy: "user",
          confirmedSurfaceEvidenceId: "route-lock:confirmation:bad",
          snapshotPath: proposal.proposal.snapshotPath,
          snapshotHash: proposal.proposal.snapshotHash,
          confirmationEvidence: {
            schemaVersion: "helmsman.route-lock-confirmation-evidence.v1",
            evidenceId: "route-lock:confirmation:bad",
            runId: state.paths.runId,
            proposalId: proposal.proposal.proposalId,
            confirmedAt: new Date().toISOString(),
            userAction: "confirmed",
            visibleSnapshotHash: proposal.proposal.snapshotHash,
            snapshotPath: proposal.proposal.snapshotPath,
            snapshotHash: proposal.proposal.snapshotHash,
            surface: "headless",
            userId: "verify",
          },
        },
      }),
    "EVENT_ACTOR_UNAUTHORIZED",
  );

  await expectCoreError(
    "wrong visible hash cannot confirm Route Lock",
    () => confirmRouteLock({ paths: state.paths, manifest: proposal.core.manifest, board: proposal.core.board, snapshotHash: "wrong-hash", surface: "headless" }),
    "EVENT_SCHEMA_INVALID",
  );

  await expectCoreError(
    "stale Board revision rejects confirmation",
    () => confirmRouteLock({ paths: state.paths, manifest: proposal.core.manifest, board: state.board, snapshotHash: proposal.proposal.snapshotHash, surface: "headless" }),
    "BOARD_REVISION_STALE",
  );

  const confirmed = await confirmRouteLock({ paths: state.paths, manifest: proposal.core.manifest, board: proposal.core.board, proposalId: proposal.proposal.proposalId, snapshotHash: proposal.proposal.snapshotHash, surface: "headless" });
  state = { paths: state.paths, manifest: confirmed.core.manifest, board: confirmed.core.board };
  assert.equal(state.manifest.run.routeLock.status, "locked");
  assert.equal(state.board.routeLock.snapshotHash, proposal.proposal.snapshotHash);
  assert(!state.board.forbiddenActions.some((action) => action.action === "run_autopilot_loop"));

  await expectCoreError("post-lock route mutation requires amendment", () => appendRouteChangingEventAndReplay(state.paths, state.manifest, state.board), "AMENDMENT_REQUIRED");

  await expectCoreError(
    "autonomy broadening amendment requires user confirmation",
    () =>
      executeCoreCommand(state.paths, {
        commandType: "route.amend_propose",
        cwd: workspace,
        runId: state.paths.runId,
        actor: { kind: "role_runner", id: "verify-role" },
        boardRevisionRead: state.board.revision,
        payload: {
          amendment: amendmentPayload(state.manifest, "bad-autonomy", {
            kind: "autonomy_boundary_change",
            proposedBy: "role_runner",
            requiresUserConfirmation: false,
            routeEffects: [{ id: "bad-autonomy", kind: "route.autonomy_boundary.set", boundary: { canUseNetwork: true } }],
          }),
          renderedPath: "route-lock/amendments/bad-autonomy.md",
        },
      }),
    "EVENT_SCHEMA_INVALID",
  );

  await expectCoreError(
    "verification scenario removal requires user confirmation",
    () =>
      executeCoreCommand(state.paths, {
        commandType: "route.amend_propose",
        cwd: workspace,
        runId: state.paths.runId,
        actor: { kind: "role_runner", id: "verify-role" },
        boardRevisionRead: state.board.revision,
        payload: {
          amendment: amendmentPayload(state.manifest, "bad-verification", {
            kind: "verification_change",
            proposedBy: "role_runner",
            requiresUserConfirmation: false,
            routeEffects: [{ id: "bad-verification", kind: "route.verification_scenario.remove", scenarioId: state.manifest.route.verificationScenarios[0]!.scenarioId, reason: "bad removal" }],
          }),
          renderedPath: "route-lock/amendments/bad-verification.md",
        },
      }),
    "EVENT_SCHEMA_INVALID",
  );

  const amendment = await proposeRouteAmendment({
    ...state,
    kind: "scope_refinement",
    reason: "Add a post-lock success criterion through a typed amendment.",
    routeEffects: [{ id: "amend-success", kind: "route.success_criterion.add", text: "Typed amendments update the locked route through Core only." }],
    actor: "user",
  });
  state = { paths: state.paths, manifest: amendment.core.manifest, board: amendment.core.board };
  assert(state.board.forbiddenActions.some((action) => action.action === "run_autopilot_loop"));
  await expectCoreError(
    "role runner cannot apply amendment",
    () =>
      executeCoreCommand(state.paths, {
        commandType: "route.amend_apply",
        cwd: workspace,
        runId: state.paths.runId,
        actor: { kind: "role_runner", id: "verify-role" },
        boardRevisionRead: state.board.revision,
        payload: { amendmentId: amendment.amendment.amendmentId },
      }),
    "EVENT_ACTOR_UNAUTHORIZED",
  );

  const applied = await applyRouteAmendment({ ...state, amendmentId: amendment.amendment.amendmentId, actor: "core_policy" });
  state = { paths: state.paths, manifest: applied.core.manifest, board: applied.core.board };
  assert.equal(state.manifest.amendments.pending[amendment.amendment.amendmentId], undefined);
  assert(state.manifest.route.successCriteria.some((criterion) => criterion.id === "amend-success"));
  assert.notEqual(state.manifest.run.routeLock.snapshotHash, proposal.proposal.snapshotHash);

  const invalidated = await invalidateRouteLock({ ...state, reason: "Hard route drift detected by Gate 6 verifier.", severity: "hard", requiredResponse: "park" });
  state = { paths: state.paths, manifest: invalidated.manifest, board: invalidated.board };
  assert.equal(state.manifest.run.routeLock.status, "invalidated");
  assert.equal(state.board.nextLegalAction.kind, "park");
  assert(state.board.forbiddenActions.some((action) => action.action === "run_autopilot_loop"));

  const unlocked = await unlockRouteLock({ ...state, reason: "User returns to Charting after invalidation." });
  assert.equal(unlocked.manifest.run.activeStage, "charting");
  assert.equal(unlocked.manifest.run.routeLock.status, "unlocked");

  const replayed = await replayCore(state.paths, { repair: true });
  assert.equal(replayed.status === "healthy" || replayed.status === "projection_stale", true);
  assert(replayed.manifest);
  assert.equal(replayed.manifest.run.routeLock.status, "unlocked");
}

async function verifyTuiLockSurface(workspace: string): Promise<void> {
  let state = await buildLockReadySession(workspace, "tui-lock");
  let routed = await routeWorkbenchCommand(await loadWorkbenchState({ paths: state.paths, view: "route_lock", statusLine: "verify" }), "/lock propose", { renderer: "headless_cli", width: 100 });
  assert.equal(routed.ok, true);
  state = { paths: state.paths, manifest: routed.state.manifest, board: routed.state.board };
  const hash = state.manifest.run.routeLock.snapshotHash;
  assert(hash);
  routed = await routeWorkbenchCommand(routed.state, `/lock confirm ${hash}`, { renderer: "headless_cli", width: 100 });
  assert.equal(routed.ok, true);
  assert.equal(routed.state.manifest.run.routeLock.status, "locked");
}

async function buildLockReadySession(workspace: string, runId: string): Promise<{ paths: RunPaths; manifest: HelmsmanManifest; board: BoardProjection }> {
  let state = await openWorkbenchSession({
    cwd: workspace,
    runId,
    title: `Gate 6 ${runId}`,
    initialIntent: "Verify Route Lock and amendment contracts for the full Helmsman product.",
    createIfMissing: true,
  });
  let routed = await routeWorkbenchCommand(state, "/charting", { renderer: "headless_cli", width: 100 });
  assert.equal(routed.ok, true);
  state = routed.state;
  routed = await routeWorkbenchCommand(state, '/answer {"q1":["a"],"q2":["a"],"q3":["a","b"],"q4":["a","b"]}', { renderer: "headless_cli", width: 100 });
  assert.equal(routed.ok, true);
  state = routed.state;

  await writeFile(join(workspace, `${runId}-reused-memory.md`), "helmsman-memory-status: reused\nRoute Lock should preserve full product scope.\n", "utf8");
  await writeFile(join(workspace, `${runId}-stale-memory.md`), "helmsman-memory-status: stale\nOld route lock implementation notes need Pi-direct validation.\n", "utf8");
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
  assert.equal(synthesis.synthesis.outcome, "lock_ready");
  return { paths: state.paths, manifest: synthesis.core.manifest, board: synthesis.core.board };
}

async function writeValidArtifact(paths: RunPaths, lane: ResearchLaneContract): Promise<void> {
  const content = renderResearchArtifactFixture({
    topic: lane.slug,
    lane,
    workerPacketId: lane.workerPacketId!,
    source: lane.sourcesToInspect[0] ?? paths.researchIndexPath,
    observation: `Observed ${lane.sourcesToInspect[0] ?? "source"} for ${lane.laneId}.`,
    inference: `Route Lock can use the accepted artifact for ${lane.laneId}.`,
  });
  await writeFile(join(paths.runRoot, lane.expectedArtifactPath), content, "utf8");
}

async function appendRouteChangingEventAndReplay(paths: RunPaths, manifest: HelmsmanManifest, board: BoardProjection): Promise<void> {
  const events = await readManifestEvents(paths.manifestEventsPath);
  const event: ManifestEvent = {
    schemaVersion: "helmsman.manifest-event.v1",
    eventId: "verify-post-lock-route-change",
    runId: manifest.run.id,
    sequence: events.length + 1,
    type: "research.synthesis_recorded",
    createdAt: new Date().toISOString(),
    actor: { kind: "core_policy", id: "verify" },
    causality: { commandId: "verify-post-lock-route-change", boardRevisionRead: board.revision },
    payload: {
      schemaVersion: "helmsman.research-synthesis.v1",
      synthesisId: "post-lock-bad",
      outcome: "lock_ready",
      acceptedArtifactIds: [],
      droppedLaneIds: Object.keys(manifest.research.lanes),
      openLaneIds: [],
      summary: "Bad post-lock mutation.",
      openUncertainty: [],
      routeEffects: [{ id: "bad-post-lock", kind: "route.scope.add", text: "This should require an amendment." }],
      evidenceIds: [],
      recordedAt: new Date().toISOString(),
    },
  };
  const { replayManifest } = await import("../core/authority/reducer.ts");
  replayManifest([...events, event]);
}

function amendmentPayload(
  manifest: HelmsmanManifest,
  amendmentId: string,
  overrides: Partial<RouteAmendment>,
): RouteAmendment {
  return {
    schemaVersion: "helmsman.route-amendment.v1",
    amendmentId,
    kind: "scope_refinement",
    proposedAt: new Date().toISOString(),
    proposedBy: "user",
    reason: "Verifier amendment payload.",
    routeEffects: [],
    evidenceIds: [],
    requiresUserConfirmation: false,
    invalidatesLock: false,
    previousSnapshotHash: manifest.run.routeLock.snapshotHash ?? "",
    ...overrides,
  };
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

await main();
