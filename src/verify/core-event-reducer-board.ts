import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveRunPaths } from "../core/document-bus/paths.ts";
import { executeCoreCommand, replayCore } from "../core/authority/core-store.ts";
import { readManifestEvents, serializeManifestEvents } from "../core/authority/event-io.ts";
import { replayManifest } from "../core/authority/reducer.ts";
import { projectBoard, projectionHashMatches } from "../core/authority/projector.ts";
import { CoreError, type ManifestActor, type ManifestEvent, type QuestionBundleContract, type RouteEffect } from "../core/authority/types.ts";
import { hashQuestionBundle } from "../core/authority/question-hash.ts";
import { COMMAND_REGISTRY } from "../core/authority/command-registry.ts";
import { scanForSecrets } from "../core/redaction/secrets.ts";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

const checks: Check[] = [];
const actorUser: ManifestActor = { kind: "user", id: "user" };
const actorCore: ManifestActor = { kind: "core_policy", id: "core" };
const actorRole: ManifestActor = { kind: "role_runner", id: "role-runner" };

async function main(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "helmsman-gate2-"));
  try {
    await verifyCommandRegistryCoverage();
    await verifyCoreAppendAndProjection(workspace);
    await verifyReplayRejections();
    await verifyCommandLegality(workspace);
    await verifyRecovery(workspace);
    await verifyRouteLockAndAmendment();
    await verifyArtifactAndRoleRunSeparation(workspace);
    await verifyGateAndCloseoutBlocking(workspace);
    await verifySecretRejection(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

async function verifyCommandRegistryCoverage(): Promise<void> {
  const required = [
    "run.create",
    "run.resume",
    "chat.message_record",
    "charting.enter",
    "question.bundle_ask",
    "question.answer_record",
    "role.binding_set",
    "role.run_plan",
    "role.run_start",
    "role.run_finish",
    "memory.scan_record",
    "research.lane_plan",
    "research.packet_prepare",
    "research.artifact_submit",
    "research.artifact_accept",
    "research.artifact_reject",
    "research.lane_drop",
    "research.synthesis_record",
    "artifact.accept",
    "route.lock_propose",
    "route.lock_confirm",
    "route.lock_cancel",
    "route.unlock",
    "route.invalidate",
    "route.amend_propose",
    "route.amend_apply",
    "route.amend_reject",
    "autopilot.loop_start",
    "autopilot.loop_finish",
    "verification.run_start",
    "verification.result_record",
    "verification.run_finish",
    "closeout.record",
    "doctor.report",
    "core.replay",
  ];
  checks.push({ name: "required command contracts registered", ok: required.every((command) => Boolean(COMMAND_REGISTRY[command])) });
  checks.push({
    name: "mutating command contracts produce typed events",
    ok: Object.values(COMMAND_REGISTRY).every((contract) => contract.readOnly || contract.eventsProduced.length > 0),
  });
}

async function verifyCoreAppendAndProjection(workspace: string): Promise<void> {
  const paths = resolveRunPaths({ cwd: workspace, runId: "append-projection" });
  const result = await executeCoreCommand(paths, {
    commandType: "run.create",
    cwd: workspace,
    runId: "append-projection",
    actor: actorUser,
    payload: { title: "Gate 2", workspace, initialIntent: "Prove Core event reducer and Board projector." },
  });
  const events = await readManifestEvents(paths.manifestEventsPath);
  const manifest = JSON.parse(await readFile(paths.manifestPath, "utf8"));
  const board = JSON.parse(await readFile(paths.boardPath, "utf8"));
  checks.push({ name: "event append writes manifest.events.jsonl", ok: events.length === 1 && events[0]?.sequence === 1 });
  checks.push({ name: "projection writes manifest.json", ok: manifest.schemaVersion === "helmsman.pi-direct.v1" });
  checks.push({ name: "projection writes board.json", ok: board.schemaVersion === "helmsman.board.v1" && projectionHashMatches(board) });
  checks.push({ name: "append journal records commit", ok: (await readFile(paths.appendJournalPath, "utf8")).includes("committed") });
  checks.push({ name: "rendered projections written", ok: await fileContains(paths.renderedManifestPath, "Helmsman Manifest") && await fileContains(paths.renderedBoardPath, "Helmsman Board") });
  checks.push({ name: "Board revision equals accepted event sequence", ok: result.board.revision === 1 && result.board.rebuiltFromEventSequence === 1 });
}

async function verifyReplayRejections(): Promise<void> {
  const base = [event(1, "run.created", { title: "Replay", workspace: "/tmp", initialIntent: "Replay" })];
  expectCoreError("event sequence gap rejection", () => replayManifest([base[0], event(3, "chat.message_recorded", { messageId: "m1", role: "user", text: "x" })]), "EVENT_SEQUENCE_GAP");
  expectCoreError("duplicate event id rejection", () => replayManifest([base[0], { ...event(2, "chat.message_recorded", { messageId: "m1", role: "user", text: "x" }), eventId: base[0].eventId }]), "EVENT_ID_DUPLICATE");
  expectCoreError("unauthorized actor rejection", () =>
    replayManifest([base[0], event(2, "question.answered", { bundleId: "b", questionId: "q", answer: answer("q"), appliedRouteEffects: [], evidenceIds: [] }, { kind: "role_runner", id: "role" })]),
  "EVENT_ACTOR_UNAUTHORIZED");

  const replayed = replayManifest(base);
  const boardA = projectBoard({ manifest: replayed.manifest, latestEventSequence: 1, generatedAt: replayed.manifest.run.updatedAt });
  const boardB = projectBoard({ manifest: replayed.manifest, latestEventSequence: 1, generatedAt: replayed.manifest.run.updatedAt });
  checks.push({ name: "deterministic reducer replay", ok: JSON.stringify(replayed.manifest) === JSON.stringify(replayManifest(base).manifest) });
  checks.push({ name: "deterministic Board projection hash", ok: boardA.projectionHash === boardB.projectionHash });
}

async function verifyCommandLegality(workspace: string): Promise<void> {
  const paths = resolveRunPaths({ cwd: workspace, runId: "legality" });
  await executeCoreCommand(paths, {
    commandType: "run.create",
    cwd: workspace,
    runId: "legality",
    actor: actorUser,
    payload: { title: "Legality", workspace },
  });
  await expectAsyncCoreError("stale Board revision rejection", () =>
    executeCoreCommand(paths, {
      commandType: "charting.enter",
      cwd: workspace,
      runId: "legality",
      actor: actorUser,
      boardRevisionRead: 99,
      payload: { reason: "stale" },
    }),
  "BOARD_REVISION_STALE");
  await expectAsyncCoreError("illegal command stage rejection", () =>
    executeCoreCommand(paths, {
      commandType: "memory.scan_record",
      cwd: workspace,
      runId: "legality",
      actor: actorCore,
      boardRevisionRead: 1,
      payload: { scanId: "scan", routeQuestion: "broad", apertureAnswerEventIds: [], artifactPath: "memory/scan.md" },
    }),
  "COMMAND_STAGE_ILLEGAL");
}

async function verifyRecovery(workspace: string): Promise<void> {
  const paths = resolveRunPaths({ cwd: workspace, runId: "recovery" });
  await executeCoreCommand(paths, {
    commandType: "run.create",
    cwd: workspace,
    runId: "recovery",
    actor: actorUser,
    payload: { title: "Recovery", workspace },
  });
  await writeFile(paths.boardPath, "{}\n", "utf8");
  await expectAsyncCoreError("stale projection blocks mutation", () =>
    executeCoreCommand(paths, {
      commandType: "chat.message_record",
      cwd: workspace,
      runId: "recovery",
      actor: actorUser,
      boardRevisionRead: 1,
      payload: { messageId: "m1", role: "user", text: "hello" },
    }),
  "PROJECTION_STALE");
  const recovery = await replayCore(paths, { repair: true });
  checks.push({ name: "projection stale recovery rebuilds projections", ok: recovery.status === "projection_stale" && recovery.board?.recovery.canReplay === true });
}

async function verifyRouteLockAndAmendment(): Promise<void> {
  const locked = validLockedRouteEvents();
  const routeEffect: RouteEffect = { id: "scope-after-lock", kind: "route.scope.add", text: "Illegal after lock" };
  expectCoreError("route lock immutability requires amendment", () =>
    replayManifest([
      ...locked,
      event(10, "question.answered", { bundleId: "b", questionId: "q", answer: answer("q"), appliedRouteEffects: [routeEffect], evidenceIds: [] }, actorUser),
    ]),
  "AMENDMENT_REQUIRED");

  const amendment = replayManifest([
    ...locked,
    event(10, "amendment.proposed", {
      amendment: {
        schemaVersion: "helmsman.route-amendment.v1",
        amendmentId: "a1",
        kind: "scope_refinement",
        proposedAt: "2026-05-27T00:00:10.000Z",
        proposedBy: "user",
        reason: "needed",
        routeEffects: [routeEffect],
        invalidatesLock: false,
        requiresUserConfirmation: true,
        evidenceIds: [],
        previousSnapshotHash: "hash",
      },
      renderedPath: "route-lock/amendments/a1.md",
    }, actorUser),
    event(11, "amendment.applied", { amendmentId: "a1", appliedBy: "user", confirmationEvidenceId: "amend-confirm-a1", previousSnapshotHash: "hash", newSnapshotPath: "route-lock/amendments/a1-snapshot.json", newSnapshotHash: "hash2" }, actorUser),
  ]);
  checks.push({ name: "amendment applies route effects after lock", ok: amendment.manifest.route.scope.some((item) => item.id === "scope-after-lock") });
}

async function verifyArtifactAndRoleRunSeparation(workspace: string): Promise<void> {
  const rolePaths = resolveRunPaths({ cwd: workspace, runId: "role-separation" });
  let roleResult = await executeCoreCommand(rolePaths, {
    commandType: "run.create",
    cwd: workspace,
    runId: "role-separation",
    actor: actorUser,
    payload: { title: "Role", workspace },
  });
  roleResult = await executeCoreCommand(rolePaths, {
    commandType: "role.binding_set",
    cwd: workspace,
    runId: "role-separation",
    actor: actorCore,
    boardRevisionRead: roleResult.board.revision,
    payload: { binding: roleBindingFixture(workspace), evidenceIds: [] },
  });
  roleResult = await executeCoreCommand(rolePaths, {
    commandType: "role.run_plan",
    cwd: workspace,
    runId: "role-separation",
    actor: actorCore,
    boardRevisionRead: roleResult.board.revision,
    payload: {
      roleRunId: "rr1",
      operationId: "op1",
      roleId: "lead",
      planPath: "role-runs/rr1/plan.json",
      promptPath: "role-runs/rr1/prompt.md",
      boardRevisionRead: roleResult.board.revision,
      runtime: "pi",
      eventLogPath: "role-runs/rr1/pi-events.jsonl",
      expectedArtifacts: [{ artifactId: "artifact-x", kind: "research", expectedPath: "research/role-artifact.md", required: true }],
      timeoutMs: 1000,
    },
  });
  roleResult = await executeCoreCommand(rolePaths, {
    commandType: "role.run_finish",
    cwd: workspace,
    runId: "role-separation",
    actor: { kind: "role_runner", id: "role-runner", roleId: "lead", operationId: "op1" },
    boardRevisionRead: roleResult.board.revision,
    payload: {
      roleRunId: "rr1",
      operationId: "op1",
      eventLogPath: "role-runs/rr1/pi-events.jsonl",
      transcriptPath: "role-runs/rr1/transcript.jsonl",
      toolEventsPath: "role-runs/rr1/tool-events.jsonl",
      resultPath: "role-runs/rr1/result.json",
      status: "completed",
      artifactIds: ["artifact-x"],
      producedArtifacts: [{ artifactId: "artifact-x", path: "research/role-artifact.md", kind: "research", producerOperationId: "op1" }],
      evidenceIds: ["role-run:rr1:pi-events", "role-run:rr1:transcript", "role-run:rr1:tool-events", "role-run:rr1:result"],
    },
  });
  const replayedRoleRun = replayManifest(await readManifestEvents(rolePaths.manifestEventsPath));
  checks.push({
    name: "role-run final message does not accept artifact",
    ok: roleResult.manifest.artifacts.records["artifact-x"]?.status === "produced" && replayedRoleRun.warnings.some((warning) => warning.includes("artifact.accepted remains required")),
  });
  roleResult = await executeCoreCommand(rolePaths, {
    commandType: "run.stage_change",
    cwd: workspace,
    runId: "role-separation",
    actor: actorCore,
    boardRevisionRead: roleResult.board.revision,
    payload: { to: "research", reason: "fixture accepts produced artifact through a separate Core event" },
  });
  roleResult = await executeCoreCommand(rolePaths, {
    commandType: "artifact.accept",
    cwd: workspace,
    runId: "role-separation",
    actor: actorCore,
    boardRevisionRead: roleResult.board.revision,
    payload: { artifactId: "artifact-x", acceptedBy: "core_policy", evidenceIds: ["role-run:rr1:result"], reason: "verified" },
  });
  checks.push({
    name: "artifact acceptance is separate Core event",
    ok: roleResult.manifest.artifacts.records["artifact-x"]?.status === "accepted",
  });
}

async function verifyGateAndCloseoutBlocking(workspace: string): Promise<void> {
  const paths = resolveRunPaths({ cwd: workspace, runId: "gate-closeout" });
  let result = await executeCoreCommand(paths, {
    commandType: "run.create",
    cwd: workspace,
    runId: "gate-closeout",
    actor: actorUser,
    payload: { title: "Gates", workspace },
  });
  checks.push({ name: "gate evaluator maps hard blockers", ok: result.board.gates["charting.bundle_surface"]?.hardBlockerIds.includes("QUESTION_SURFACE_MISSING") });
  result = await executeCoreCommand(paths, {
    commandType: "run.stage_change",
    cwd: workspace,
    runId: "gate-closeout",
    actor: actorCore,
    boardRevisionRead: result.board.revision,
    payload: { to: "closeout", reason: "fixture checks closeout blocker" },
  });
  await expectAsyncCoreError("closeout blocked without verification", () =>
    executeCoreCommand(paths, {
      commandType: "closeout.record",
      cwd: workspace,
      runId: "gate-closeout",
      actor: actorUser,
      boardRevisionRead: result.board.revision,
      payload: {
        schemaVersion: "helmsman.closeout.v1",
        runId: "gate-closeout",
        closeoutId: "closeout-1",
        status: "completed",
        boardRevisionRead: result.board.revision,
        boardProjectionHash: result.board.projectionHash,
        verificationSummary: { passed: [], failed: [], blocked: [], parked: [] },
        acceptedArtifactIds: [],
        residualRiskIds: [],
        closeoutArtifactPath: "closeout.md",
        renderedManifestPath: "rendered/manifest.md",
        renderedBoardPath: "rendered/board.md",
        evidenceIndexPath: "evidence/index.md",
        recordedAt: new Date().toISOString(),
      },
    }),
  "GATE_BLOCKED");
}

async function verifySecretRejection(workspace: string): Promise<void> {
  const paths = resolveRunPaths({ cwd: workspace, runId: "secret-rejection" });
  await executeCoreCommand(paths, {
    commandType: "run.create",
    cwd: workspace,
    runId: "secret-rejection",
    actor: actorUser,
    payload: { title: "Secrets", workspace },
  });
  await expectAsyncCoreError("secret payload rejected before persistence", () =>
    executeCoreCommand(paths, {
      commandType: "chat.message_record",
      cwd: workspace,
      runId: "secret-rejection",
      actor: actorUser,
      boardRevisionRead: 1,
      payload: { messageId: "secret", role: "user", text: "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz" },
    }),
  "SECRET_DETECTED");
  const findings = await scanForSecrets(join(workspace, ".helmsman", "sessions", "secret-rejection"));
  checks.push({ name: "rejected secret is not persisted in Core files", ok: findings.length === 0, detail: findings.map((finding) => finding.path).join(", ") });
}

function expectCoreError(name: string, fn: () => unknown, code: string): void {
  try {
    fn();
    checks.push({ name, ok: false, detail: "expected CoreError" });
  } catch (error) {
    checks.push({ name, ok: error instanceof CoreError && error.code === code, detail: error instanceof CoreError ? error.code : String(error) });
  }
}

async function expectAsyncCoreError(name: string, fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    checks.push({ name, ok: false, detail: "expected CoreError" });
  } catch (error) {
    checks.push({ name, ok: error instanceof CoreError && error.code === code, detail: error instanceof CoreError ? error.code : String(error) });
  }
}

function validLockedRouteEvents(): ManifestEvent[] {
  const routeEffect: RouteEffect = {
    id: "scenario-lock",
    kind: "route.verification_scenario.add",
    scenario: { scenarioId: "scenario-lock", title: "Route Lock verifier scenario", expectedEvidence: ["route-lock-verifier"] },
  };
  const bundle: QuestionBundleContract = {
    bundleId: "bundle-lock",
    purpose: "aperture",
    title: "Lock bundle",
    routeQuestion: "What should be locked?",
    questions: [
      {
        questionId: "q-lock",
        type: "single_select",
        prompt: "Lock?",
        whyItMatters: "Route Lock needs explicit answer evidence.",
        options: [
          { optionId: "o1", label: "Lock", description: "Lock the route.", tradeoffs: [], opens: [], closes: [] },
          { optionId: "o2", label: "Do not lock", description: "Keep charting.", tradeoffs: [], opens: [], closes: [] },
        ],
        recommendedOptionId: "o1",
        recommendationReason: "Verifier uses the positive lock path.",
        allowFreeForm: false,
        requiredForLock: true,
        routeEffectsByOption: {
          o1: [routeEffect],
          o2: [{ id: "stop-lock", kind: "route.stop_condition.add", text: "Do not lock until ready." }],
        },
      },
    ],
    maxQuestions: 4,
    lockImpact: "blocks_lock",
    createdByRoleId: "core.verify",
  };
  const bundleHash = hashQuestionBundle(bundle);
  const surface = {
    surfaceId: "surface-lock",
    renderer: "headless_cli",
    rendererVersion: "verify",
    displayedAt: "2026-05-27T00:00:03.000Z",
    transcriptEvidencePath: "evidence/native-question-surface.jsonl",
    locale: "en",
    bundleHash,
  };
  return [
    event(1, "run.created", { title: "Locked", workspace: "/tmp" }),
    event(2, "run.stage_changed", { from: "chat", to: "charting", reason: "verify charting" }, actorCore),
    event(3, "question.bundle_asked", {
      bundle,
      surface,
      surfaceEvidence: {
        evidenceId: surface.surfaceId,
        kind: "question.surface",
        path: surface.transcriptEvidencePath,
        summary: "Rendered verifier question surface.",
        recordedAt: "2026-05-27T00:00:03.000Z",
      },
    }, actorCore),
    event(4, "question.answered", {
      bundleId: bundle.bundleId,
      questionId: "q-lock",
      answer: {
        questionId: "q-lock",
        selectedOptionIds: ["o1"],
        answeredAt: "2026-05-27T00:00:04.000Z",
        authority: "user",
        surfaceId: surface.surfaceId,
        userVisibleBundleHash: bundleHash,
        answerDetails: { optionLabels: ["Lock"], optionDescriptions: ["Lock the route."] },
      },
      appliedRouteEffects: [routeEffect],
      evidenceIds: [surface.surfaceId],
    }, actorUser),
    event(5, "run.stage_changed", { from: "charting", to: "memory_scan", reason: "verify memory" }, actorCore),
    event(6, "memory.scan_created", {
      schemaVersion: "helmsman.memory-scan.v1",
      runId: "verify-core",
      scanId: "scan-lock",
      selectedApertureQuestionIds: ["q-lock"],
      apertureAnswerEventIds: ["question.answered:4"],
      routeQuestion: "What should be locked?",
      searchCoordinates: ["route lock"],
      sourcesToInspect: [{ sourceId: "memory", kind: "file", ref: "memory.md" }],
      sourcesToSkip: [],
      artifactPath: "memory/lock.md",
      indexPath: "memory-index.md",
      createdAt: "2026-05-27T00:00:06.000Z",
    }, actorCore),
    event(7, "run.stage_changed", { from: "memory_scan", to: "lock_ready", reason: "verify lock-ready" }, actorCore),
    event(8, "route_lock.proposed", {
      schemaVersion: "helmsman.route-lock-proposal.v1",
      proposalId: "p1",
      runId: "verify-core",
      proposedAt: "2026-05-27T00:00:08.000Z",
      boardRevisionRead: 7,
      eventSequenceRead: 7,
      snapshotPath: "route-lock/snapshot.json",
      snapshotHash: "hash",
      renderedPath: "route-lock/snapshot.md",
      remainingRisks: [],
      softWarnings: [],
      requiredUserConfirmation: true,
      readiness: {
        schemaVersion: "helmsman.route-lock-readiness.v1",
        runId: "verify-core",
        evaluatedAt: "2026-05-27T00:00:08.000Z",
        boardRevisionRead: 7,
        eventSequenceRead: 7,
        status: "lock_ready",
        routeSnapshotHash: "hash",
        hardBlockers: [],
        softWarnings: [],
        requiredEvidenceIds: ["surface-lock", "memory-scan:scan-lock"],
      },
    }, actorCore),
    event(9, "route_lock.locked", {
      proposalId: "p1",
      confirmedBy: "user",
      confirmedSurfaceEvidenceId: "route-lock:confirmation:p1",
      snapshotPath: "route-lock/snapshot.json",
      snapshotHash: "hash",
      routeCardPath: "rendered/route-card.md",
      confirmationEvidence: {
        schemaVersion: "helmsman.route-lock-confirmation-evidence.v1",
        evidenceId: "route-lock:confirmation:p1",
        runId: "verify-core",
        proposalId: "p1",
        confirmedAt: "2026-05-27T00:00:09.000Z",
        userAction: "confirmed",
        visibleSnapshotHash: "hash",
        snapshotPath: "route-lock/snapshot.json",
        snapshotHash: "hash",
        surface: "headless",
        userId: "user",
      },
    }, actorUser),
  ];
}

function event(sequence: number, type: string, payload: Record<string, unknown>, actor: ManifestActor = actorUser): ManifestEvent {
  return {
    schemaVersion: "helmsman.manifest-event.v1",
    eventId: `${type}:${sequence}`,
    runId: "verify-core",
    sequence,
    type,
    createdAt: `2026-05-27T00:00:${String(sequence).padStart(2, "0")}.000Z`,
    actor,
    causality: sequence === 1 ? { commandId: `cmd-${sequence}` } : { commandId: `cmd-${sequence}`, boardRevisionRead: sequence - 1 },
    payload,
  };
}

function answer(questionId: string) {
  return {
    questionId,
    selectedOptionIds: ["o1"],
    answeredAt: "2026-05-27T00:00:00.000Z",
    authority: "user",
    surfaceId: "surface",
    userVisibleBundleHash: "hash",
    answerDetails: { optionLabels: ["A"], optionDescriptions: ["A"] },
  };
}

async function fileContains(path: string, needle: string): Promise<boolean> {
  try {
    return (await readFile(path, "utf8")).includes(needle);
  } catch {
    return false;
  }
}

function roleBindingFixture(workspace: string) {
  return {
    roleId: "lead",
    purpose: "chat",
    runtime: "pi_agent_session",
    provider: "fixture-provider",
    model: "fixture-model",
    thinking: "off",
    mode: "auto",
    toolPolicy: {
      allowedToolNames: [],
      network: "forbidden",
      filesystem: "read_only",
      shell: "forbidden",
      customTools: [],
    },
    sandboxPolicy: {
      cwd: workspace,
      allowedReadRoots: [workspace],
      allowedWriteRoots: [],
      deniedRoots: [],
      secretsPolicy: "provider_auth_only",
    },
    concurrency: {
      class: "lead",
      maxParallel: 1,
      queue: "fifo",
      leaseMs: 1000,
    },
    budgets: {
      maxTurns: 1,
      timeoutMs: 1000,
    },
    fallback: {
      onMissingAuth: "block",
      onModelUnsupportedThinking: "clamp_and_record",
      onRuntimeUnavailable: "block",
    },
    requiredArtifacts: [],
    forbiddenAuthorityClaims: ["Final prose is evidence only."],
  };
}

await main();
