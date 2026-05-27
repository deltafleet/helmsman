import { strict as assert } from "node:assert";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeCoreCommand, replayCore } from "../core/authority/core-store.ts";
import { readManifestEvents } from "../core/authority/event-io.ts";
import { CoreError, type BoardProjection, type HelmsmanManifest, type ResearchLaneContract } from "../core/authority/types.ts";
import { resolveRunPaths, type RunPaths } from "../core/document-bus/paths.ts";
import { renderResearchArtifactFixture, validateResearchArtifact } from "../memory-research/artifact-validation.ts";
import { runScopedMemoryScan } from "../memory-research/memory-scan.ts";
import { declareResearchLanesFromMemory, prepareResearchWorkerPackets } from "../memory-research/research-service.ts";
import { recordResearchSynthesis } from "../memory-research/synthesis.ts";
import { finishAutopilotLoop, startAutopilotLoop } from "../autopilot/index.ts";
import { buildLivePiRoleBinding } from "../role-runtime/bindings.ts";
import { confirmRouteLock, proposeRouteLock } from "../route-lock/index.ts";
import { routeWorkbenchCommand } from "../tui/workbench-command-router.ts";
import { loadWorkbenchState, openWorkbenchSession } from "../tui/workbench-state.ts";
import { finishVerificationRun, recordCloseout, recordVerificationResult, startVerificationRun } from "../verification-closeout/index.ts";

async function main(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "helmsman-gate8-verification-"));
  try {
    await verifyPreconditionsAndPlan(workspace);
    await verifyVerdictBoundaries(workspace);
    await verifyCloseoutBoundaries(workspace);
    await verifyTuiVerificationSurface(workspace);
    console.log("Verification/Closeout verification passed");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function verifyPreconditionsAndPlan(workspace: string): Promise<void> {
  const noRole = await buildVerificationReadySession(workspace, "gate8-no-verifier", false);
  await expectError("verification requires verifier binding", () => startVerificationRun(noRole), "VERIFIER_BINDING_MISSING");

  let state = await buildVerificationReadySession(workspace, "gate8-plan");
  const roleRun = await executeCoreCommand(state.paths, {
    commandType: "role.run_finish",
    cwd: workspace,
    runId: state.paths.runId,
    actor: { kind: "role_runner", id: "fake-verifier" },
    boardRevisionRead: state.board.revision,
    payload: {
      roleRunId: "unplanned-verifier",
      operationId: "unplanned-verifier-op",
      resultPath: "role-runs/unplanned/result.json",
      status: "completed",
      artifactIds: [],
      evidenceIds: ["role-run:unplanned-verifier:result"],
    },
  }).catch((error) => error);
  assert(roleRun instanceof CoreError, "role-run completion cannot fabricate a verification verdict");
  assert.equal(Object.keys(state.manifest.verification.latestVerdictByScenario).length, 0);

  const started = await startVerificationRun(state);
  assert.equal(started.plan.scenarioIds.length, state.manifest.route.verificationScenarios.length);
  assert(started.plan.expectedArtifacts.every((artifact) => artifact.expectedPath.startsWith(`verification/${started.plan.verificationRunId}/`)));
  assert(started.plan.forbiddenClaims.join("\n").toLowerCase().includes("execution success as verdict"));
  const eventTypes = (await readManifestEvents(state.paths.manifestEventsPath)).map((event) => event.type);
  assert(eventTypes.includes("verification.run_started"));
  assert(eventTypes.includes("artifact.expected"));

  const replayed = await replayCore(state.paths, { repair: true });
  assert(replayed.manifest?.verification.activeRunId === started.plan.verificationRunId);
  await expectError(
    "active verification run rejects duplicate launch",
    () => startVerificationRun({ paths: state.paths, manifest: started.core.manifest, board: started.core.board }),
    "already active",
  );
}

async function verifyVerdictBoundaries(workspace: string): Promise<void> {
  let state = await buildVerificationReadySession(workspace, "gate8-verdicts");
  const started = await startVerificationRun(state);
  state = { paths: state.paths, manifest: started.core.manifest, board: started.core.board };
  const scenarioIds = started.plan.scenarioIds;
  const firstScenario = scenarioIds[0]!;

  await expectCoreError(
    "PASS verdict must map every pass criterion",
    () =>
      executeCoreCommand(state.paths, {
        commandType: "verification.result_record",
        cwd: workspace,
        runId: state.paths.runId,
        actor: { kind: "verifier", id: "verifier" },
        boardRevisionRead: state.board.revision,
        payload: {
          schemaVersion: "helmsman.verification-verdict.v1",
          runId: state.paths.runId,
          verificationRunId: started.plan.verificationRunId,
          verdictId: "bad-pass",
          scenarioId: firstScenario,
          status: "passed",
          attempt: 1,
          verifierRoleId: "verifier",
          boardRevisionRead: state.board.revision,
          boardProjectionHash: started.plan.boardProjectionHash,
          routeSnapshotHash: started.plan.routeSnapshotHash,
          artifactId: "bad-pass-artifact",
          artifactPath: started.plan.scenarios[0]!.expectedArtifactPath,
          evidenceIds: ["command:bad-pass"],
          evidenceKinds: ["command_output", "artifact"],
          executionStatus: "completed",
          criteriaSatisfied: [],
          criteriaFailed: [],
          criteriaBlocked: [],
          observations: ["The command output exists but criteria were not mapped."],
          residualRisk: "none",
          followUpRequired: [],
          recordedAt: new Date().toISOString(),
        },
      }),
    "EVENT_SCHEMA_INVALID",
  );

  let blocked = await recordVerificationResult({
    paths: state.paths,
    manifest: state.manifest,
    board: state.board,
    verificationRunId: started.plan.verificationRunId,
    scenarioId: firstScenario,
    status: "blocked",
    evidenceIds: ["command:blocked-verifier-exit"],
    evidenceKinds: ["command_output", "artifact"],
    executionStatus: "failed",
    observations: ["Verifier command failed before enough scenario evidence could be collected."],
    residualRisk: "The scenario is blocked by missing verifier environment, not product failure.",
    missingAuthorityOrEnvironment: "verifier command environment unavailable",
  });
  assert.equal(blocked.verdict.attempt, 1);
  assert.equal(blocked.verdict.status, "blocked");
  state = { paths: state.paths, manifest: blocked.core.manifest, board: blocked.core.board };

  const retryPass = await recordVerificationResult({
    paths: state.paths,
    manifest: state.manifest,
    board: state.board,
    verificationRunId: started.plan.verificationRunId,
    scenarioId: firstScenario,
    status: "passed",
    evidenceIds: ["command:retry-pass", `verification:${firstScenario}:artifact`],
    evidenceKinds: ["command_output", "artifact"],
    observations: ["Retry produced the declared evidence and mapped it to the locked scenario criteria."],
    residualRisk: "none",
  });
  assert.equal(retryPass.verdict.attempt, 2);
  assert.equal(retryPass.core.manifest.verification.verdicts[firstScenario]?.length, 2);
  state = { paths: state.paths, manifest: retryPass.core.manifest, board: retryPass.core.board };

  for (const scenarioId of scenarioIds.slice(1)) {
    const pass = await recordVerificationResult({
      paths: state.paths,
      manifest: state.manifest,
      board: state.board,
      verificationRunId: started.plan.verificationRunId,
      scenarioId,
      status: "passed",
      evidenceIds: [`command:${scenarioId}`, `artifact:${scenarioId}`],
      evidenceKinds: ["command_output", "artifact"],
      observations: [`Scenario ${scenarioId} has declared evidence and no failing criteria.`],
      residualRisk: "none",
    });
    state = { paths: state.paths, manifest: pass.core.manifest, board: pass.core.board };
  }

  const finished = await finishVerificationRun({ paths: state.paths, manifest: state.manifest, board: state.board, verificationRunId: started.plan.verificationRunId });
  assert.equal(finished.finish.status, "completed");
  assert.equal(finished.core.manifest.run.activeStage, "closeout");
  assert.equal(finished.core.board.nextLegalAction.kind, "closeout");
  assert.notEqual(finished.core.manifest.run.activeStage, "closed", "verification pass must not automatically close the run");
  const replayed = await replayCore(state.paths, { repair: true });
  assert.equal((replayed.board?.verification["statusCounts"] as Record<string, number>).passed, scenarioIds.length);
}

async function verifyCloseoutBoundaries(workspace: string): Promise<void> {
  let state = await buildVerificationReadySession(workspace, "gate8-fail-closeout");
  let started = await startVerificationRun(state);
  state = { paths: state.paths, manifest: started.core.manifest, board: started.core.board };
  const failed = await recordVerificationResult({
    paths: state.paths,
    manifest: state.manifest,
    board: state.board,
    verificationRunId: started.plan.verificationRunId,
    scenarioId: started.plan.scenarioIds[0]!,
    status: "failed",
    evidenceIds: ["command:product-fail", "artifact:product-fail"],
    evidenceKinds: ["command_output", "artifact"],
    observations: ["Evidence contradicts a locked scenario promise and therefore is a product FAIL verdict."],
    residualRisk: "Repair or amend before successful closeout.",
  });
  state = { paths: state.paths, manifest: failed.core.manifest, board: failed.core.board };
  const finishedFailed = await finishVerificationRun({ paths: state.paths, manifest: state.manifest, board: state.board, verificationRunId: started.plan.verificationRunId });
  assert.equal(finishedFailed.finish.status, "failed");
  await expectCoreError("completed closeout rejects failed scenarios", () => recordCloseout({ paths: state.paths, manifest: finishedFailed.core.manifest, board: finishedFailed.core.board, status: "completed" }), "GATE_BLOCKED");
  const failedCloseout = await recordCloseout({ paths: state.paths, manifest: finishedFailed.core.manifest, board: finishedFailed.core.board });
  assert.equal(failedCloseout.closeout.status, "failed");
  assert.equal(failedCloseout.core.manifest.run.activeStage, "closeout");

  state = await buildVerificationReadySession(workspace, "gate8-success-closeout");
  started = await startVerificationRun(state);
  state = { paths: state.paths, manifest: started.core.manifest, board: started.core.board };
  await expectCoreError("closeout rejects unresolved scenarios", () => recordCloseout({ paths: state.paths, manifest: state.manifest, board: state.board, status: "completed" }), "COMMAND_STAGE_ILLEGAL");
  for (const scenarioId of started.plan.scenarioIds) {
    const passed = await recordVerificationResult({
      paths: state.paths,
      manifest: state.manifest,
      board: state.board,
      verificationRunId: started.plan.verificationRunId,
      scenarioId,
      status: "passed",
      evidenceIds: [`command:${scenarioId}`, `artifact:${scenarioId}`],
      evidenceKinds: ["command_output", "artifact"],
      observations: [`Scenario ${scenarioId} produced accepted evidence and no blocker criteria.`],
      residualRisk: "none",
    });
    state = { paths: state.paths, manifest: passed.core.manifest, board: passed.core.board };
  }
  const finished = await finishVerificationRun({ paths: state.paths, manifest: state.manifest, board: state.board, verificationRunId: started.plan.verificationRunId });
  const memoryCandidate = {
    candidateId: "gate8-memory-candidate",
    claim: "Gate 8 closeout requires scenario verdict artifacts before completion.",
    sourceRunId: state.paths.runId,
    sourceArtifactIds: Object.values(finished.core.manifest.verification.latestVerdictByScenario).map((verdict) => verdict.artifactId),
    sourceEvidenceIds: started.plan.scenarioIds.map((scenarioId) => `verification:${scenarioId}`),
    applicableScope: "Helmsman Gate 8 Verification/Closeout",
    knownLimitations: ["Applies only after Route Lock and Autopilot completion."],
    stalenessTrigger: "Verification closeout contract changes.",
    contradictionNotes: "Supersede if Core no longer owns verdict events.",
    suggestedDestinationNamespace: "helmsman",
    approvalPolicy: "explicit_user_approval_required" as const,
  };
  const closeout = await recordCloseout({ paths: state.paths, manifest: finished.core.manifest, board: finished.core.board, memoryPromotionCandidates: [memoryCandidate] });
  assert.equal(closeout.closeout.status, "completed");
  assert.equal(closeout.core.manifest.run.activeStage, "closed");
  await access(state.paths.closeoutPath);
  await access(state.paths.renderedManifestPath);
  await access(state.paths.renderedBoardPath);
  await access(state.paths.closeoutEvidenceIndexPath);
  await access(state.paths.memoryPromotionCandidatePath);
  assert((await readFile(state.paths.closeoutPath, "utf8")).includes("All required scenario verdicts are passed by Core."));
  assert.equal(closeout.core.manifest.closeout.memoryPromotionCandidates[memoryCandidate.candidateId]?.approvalPolicy, "explicit_user_approval_required");
}

async function verifyTuiVerificationSurface(workspace: string): Promise<void> {
  let state = await buildVerificationReadySession(workspace, "gate8-tui");
  let routed = await routeWorkbenchCommand(await loadWorkbenchState({ paths: state.paths, view: "verification", statusLine: "verify" }), "/verify");
  assert.equal(routed.ok, true);
  assert.equal(routed.mutatedAuthority, false);
  routed = await routeWorkbenchCommand(routed.state, "/verify start");
  assert.equal(routed.ok, true);
  const verificationRunId = Object.keys(routed.state.manifest.verification.runs)[0]!;
  for (const scenario of routed.state.manifest.route.verificationScenarios) {
    routed = await routeWorkbenchCommand(routed.state, `/verify pass ${verificationRunId} ${scenario.scenarioId} scenario ${scenario.scenarioId} satisfied`);
    assert.equal(routed.ok, true);
  }
  routed = await routeWorkbenchCommand(routed.state, `/verify finish ${verificationRunId}`);
  assert.equal(routed.ok, true);
  assert.equal(routed.state.manifest.run.activeStage, "closeout");
  routed = await routeWorkbenchCommand(routed.state, "/closeout record completed");
  assert.equal(routed.ok, true);
  assert.equal(routed.state.manifest.run.activeStage, "closed");
}

async function buildVerificationReadySession(workspace: string, runId: string, bindVerifierRole = true): Promise<{ paths: RunPaths; manifest: HelmsmanManifest; board: BoardProjection }> {
  let state = await openWorkbenchSession({
    cwd: workspace,
    runId,
    title: `Gate 8 ${runId}`,
    initialIntent: "Verify scenario-backed closeout for the full Helmsman product.",
    createIfMissing: true,
  });
  let routed = await routeWorkbenchCommand(state, "/charting", { renderer: "headless_cli", width: 100 });
  assert.equal(routed.ok, true);
  state = routed.state;
  routed = await routeWorkbenchCommand(state, '/answer {"q1":["a"],"q2":["a"],"q3":["a","b"],"q4":["a","b"]}', { renderer: "headless_cli", width: 100 });
  assert.equal(routed.ok, true);
  state = routed.state;

  await writeFile(join(workspace, `${runId}-reused-memory.md`), "helmsman-memory-status: reused\nVerification should remain scenario-backed.\n", "utf8");
  await writeFile(join(workspace, `${runId}-stale-memory.md`), "helmsman-memory-status: stale\nCloseout behavior needs Gate 8 validation.\n", "utf8");
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
  manifest = confirmed.core.manifest;
  board = confirmed.core.board;

  const autopilotBinding = buildLivePiRoleBinding({
    cwd: workspace,
    roleId: "autopilot-implementer",
    purpose: "autopilot",
    allowedReadRoots: [workspace, "route-lock/snapshot.json", "rendered/route-card.md"],
    allowedWriteRoots: ["autopilot"],
    timeoutMs: 120000,
  });
  let bound = await executeCoreCommand(state.paths, {
    commandType: "role.binding_set",
    cwd: workspace,
    runId: state.paths.runId,
    actor: { kind: "core_policy", id: "verify-gate8" },
    boardRevisionRead: board.revision,
    payload: { binding: autopilotBinding, evidenceIds: [] },
  });
  manifest = bound.manifest;
  board = bound.board;

  const started = await startAutopilotLoop({ paths: state.paths, manifest, board });
  const finished = await finishAutopilotLoop({
    paths: state.paths,
    manifest: started.core.manifest,
    board: started.core.board,
    loopId: started.plan.loopId,
    status: "completed",
    adherenceStatus: "adherent",
    reason: "Autopilot produced route-adherent implementation evidence for Gate 8.",
    requiredResponse: "continue",
    evidenceIds: [`autopilot:loop:${started.plan.loopId}:plan`],
    nextStage: "verification",
  });
  manifest = finished.core.manifest;
  board = finished.core.board;

  if (!bindVerifierRole) return { paths: state.paths, manifest, board };
  const verifierBinding = buildLivePiRoleBinding({
    cwd: workspace,
    roleId: "verifier",
    purpose: "verification",
    allowedReadRoots: [workspace, "route-lock/snapshot.json", "rendered/route-card.md", "rendered/board.md"],
    allowedWriteRoots: ["verification"],
    timeoutMs: 120000,
  });
  bound = await executeCoreCommand(state.paths, {
    commandType: "role.binding_set",
    cwd: workspace,
    runId: state.paths.runId,
    actor: { kind: "core_policy", id: "verify-gate8" },
    boardRevisionRead: board.revision,
    payload: { binding: verifierBinding, evidenceIds: [] },
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
    inference: `Verification can use the accepted artifact for ${lane.laneId}.`,
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
