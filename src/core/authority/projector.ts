import { sha256Json } from "./hash.ts";
import type { BoardNextAction, BoardProjection, GateStatus, HelmsmanManifest } from "./types.ts";

const DEFAULT_MAX_ACTIVE_RESEARCH_LANES = 6;

const REQUIRED_GATES = [
  "charting.bundle_surface",
  "charting.route_sharpness",
  "memory.scoped_scan",
  "memory.aperture_precondition",
  "research.lanes_accounted",
  "research.artifacts_validated",
  "research.synthesis_recorded",
  "route_lock.user_authority",
  "route_lock.no_open_blockers",
  "autopilot.board_read",
  "autopilot.no_stale_board",
  "autopilot.action_legality",
  "autopilot.route_adherence",
  "autopilot.drift_response",
  "verification.scenarios_declared",
  "verification.scenarios_passed",
  "verification.verdict_artifacts",
  "closeout.evidence_complete",
  "closeout.no_unresolved_required_scenarios",
  "release.product_audit",
] as const;

export interface ProjectBoardInput {
  manifest: HelmsmanManifest;
  latestEventSequence: number;
  generatedAt: string;
  previousBoard?: BoardProjection;
}

export function projectBoard(input: ProjectBoardInput): BoardProjection {
  const manifestHash = sha256Json(input.manifest);
  const revision = input.latestEventSequence || 1;
  const gates = evaluateGates(input.manifest, input.generatedAt);
  const blockers = buildBlockers(input.manifest);
  const nextLegalAction = chooseNextAction(input.manifest, revision, blockers.length > 0);
  const acceptedArtifacts = Object.values(input.manifest.artifacts.records).filter((artifact) => artifact.status === "accepted");
  const submittedArtifacts = Object.values(input.manifest.artifacts.records).filter((artifact) => artifact.status === "submitted");
  const verificationProjection = projectVerification(input.manifest);
  const closeoutProjection = projectCloseout(input.manifest);
  const boardWithoutHash: Omit<BoardProjection, "projectionHash"> = {
    schemaVersion: "helmsman.board.v1",
    runId: input.manifest.run.id,
    revision,
    rebuiltFromEventSequence: input.latestEventSequence,
    generatedAt: input.generatedAt,
    manifestHash,
    activeStage: input.manifest.run.activeStage,
    routeLock: input.manifest.run.routeLock,
    nextLegalAction,
    forbiddenActions: buildForbiddenActions(input.manifest),
    blockers,
    openQuestions: input.manifest.questions.openQuestionIds,
    memory: projectMemory(input.manifest),
    research: projectResearch(input.manifest),
    autopilot: projectAutopilot(input.manifest),
    closeout: closeoutProjection,
    roles: {
      bindingCount: Object.keys(input.manifest.roles.bindings).length,
      roleRunCount: Object.keys(input.manifest.roles.roleRuns).length,
    },
    operations: {
      total: Object.keys(input.manifest.operations.records).length,
      byStatus: countBy(Object.values(input.manifest.operations.records).map((operation) => operation.status)),
    },
    gates,
    scorecard: input.manifest.scorecard,
    recentDelta: {
      fromRevision: input.previousBoard?.revision ?? 0,
      toRevision: revision,
      changedPaths: ["manifest", "board"],
      summary: [`Rebuilt Board from manifest event sequence ${input.latestEventSequence}.`],
    },
    driftWarnings: Object.values(input.manifest.autopilot.driftRecords).map((drift) => ({
      driftId: drift.driftId,
      loopId: drift.loopId,
      class: drift.class,
      severity: drift.severity,
      requiredResponse: drift.requiredResponse,
      reason: drift.reason,
    })),
    pendingAmendments: Object.keys(input.manifest.amendments.pending),
    verification: verificationProjection,
    artifacts: {
      total: Object.keys(input.manifest.artifacts.records).length,
      submitted: submittedArtifacts.map((artifact) => artifact.artifactId),
      accepted: acceptedArtifacts.map((artifact) => artifact.artifactId),
    },
    recovery: {
      canReplay: true,
      lastGoodEventSequence: input.latestEventSequence,
      projectionStale: false,
    },
  };

  const hashInput = { ...boardWithoutHash, generatedAt: undefined };
  return { ...boardWithoutHash, projectionHash: sha256Json(hashInput) };
}

export function projectionHashMatches(board: BoardProjection): boolean {
  const { projectionHash: _projectionHash, ...rest } = board;
  return board.projectionHash === sha256Json({ ...rest, generatedAt: undefined });
}

function evaluateGates(manifest: HelmsmanManifest, evaluatedAt: string): BoardProjection["gates"] {
  const output: BoardProjection["gates"] = {};
  const openQuestions = manifest.questions.openQuestionIds;
  const scans = Object.keys(manifest.memory.scans);
  const lanes = Object.keys(manifest.research.lanes);
  const accepted = manifest.research.acceptedArtifactIds;
  const syntheses = Object.keys(manifest.research.syntheses);
  const unresolvedResearch = unresolvedResearchLaneIds(manifest);
  const verificationSummary = summarizeVerification(manifest);
  const requiredScenarioCount = manifest.route.verificationScenarios.length;
  const allRequiredPassed = requiredScenarioCount > 0 && verificationSummary.passed === requiredScenarioCount && verificationSummary.failed === 0 && verificationSummary.blocked === 0 && verificationSummary.parked === 0 && verificationSummary.unverified === 0;
  const verdictArtifactIds = Object.values(manifest.verification.latestVerdictByScenario).map((verdict) => verdict.artifactId);
  const verdictArtifactsAccepted = verdictArtifactIds.length === requiredScenarioCount && verdictArtifactIds.every((artifactId) => manifest.artifacts.records[artifactId]?.status === "accepted");

  for (const gateId of REQUIRED_GATES) {
    let status: GateStatus = "not_evaluated";
    const hardBlockerIds: string[] = [];
    const softWarningIds: string[] = [];
    const requiredEvidenceIds: string[] = [];

    if (gateId === "charting.bundle_surface") {
      status = Object.keys(manifest.questions.bundles).length > 0 ? "passed" : "blocked";
      if (status === "blocked") hardBlockerIds.push("QUESTION_SURFACE_MISSING");
    } else if (gateId === "charting.route_sharpness") {
      status = openQuestions.length === 0 && Object.keys(manifest.questions.answers).length > 0 ? "passed" : "blocked";
      if (status === "blocked") hardBlockerIds.push("QUESTION_ANSWER_UNAUTHORIZED");
    } else if (gateId === "memory.scoped_scan") {
      status = scans.length > 0 ? "passed" : "blocked";
      if (status === "blocked") hardBlockerIds.push("EVIDENCE_MISSING");
    } else if (gateId === "memory.aperture_precondition") {
      status = Object.keys(manifest.questions.answers).length > 0 ? "passed" : "blocked";
      if (status === "blocked") hardBlockerIds.push("QUESTION_SURFACE_MISSING");
    } else if (gateId === "research.lanes_accounted") {
      status = lanes.length > 0 && unresolvedResearch.length === 0 ? "passed" : lanes.length > 0 ? "ready" : "blocked";
      if (status === "blocked") hardBlockerIds.push("EVIDENCE_MISSING");
    } else if (gateId === "research.artifacts_validated") {
      status = accepted.length > 0 && unresolvedResearch.length === 0 ? "passed" : "blocked";
      if (status === "blocked") hardBlockerIds.push("ARTIFACT_NOT_ACCEPTED");
    } else if (gateId === "research.synthesis_recorded") {
      status = syntheses.length > 0 ? "passed" : "blocked";
      if (status === "blocked") hardBlockerIds.push("EVIDENCE_MISSING");
    } else if (gateId === "route_lock.user_authority") {
      status = manifest.run.routeLock.status === "locked" ? "passed" : "blocked";
      if (status === "blocked") hardBlockerIds.push("ROUTE_LOCK_REQUIRED");
    } else if (gateId === "route_lock.no_open_blockers") {
      const routeLockBlockers = routeLockBlockerIds(manifest);
      status = routeLockBlockers.length === 0 ? (manifest.run.routeLock.status === "locked" ? "passed" : "ready") : "blocked";
      if (status === "blocked") hardBlockerIds.push("GATE_BLOCKED");
    } else if (gateId === "verification.scenarios_declared") {
      status = manifest.route.verificationScenarios.length > 0 ? "passed" : "blocked";
      if (status === "blocked") hardBlockerIds.push("EVIDENCE_MISSING");
    } else if (gateId === "verification.scenarios_passed" || gateId === "verification.verdict_artifacts") {
      status = gateId === "verification.scenarios_passed"
        ? allRequiredPassed ? "passed" : requiredScenarioCount > 0 ? "ready" : "blocked"
        : verdictArtifactsAccepted ? "passed" : verdictArtifactIds.length > 0 ? "ready" : "blocked";
      if (status === "blocked") hardBlockerIds.push("EVIDENCE_MISSING");
      requiredEvidenceIds.push(...manifest.route.verificationScenarios.map((scenario) => `verification:${scenario.scenarioId}`).filter((evidenceId) => manifest.evidence.records[evidenceId]));
    } else if (gateId === "autopilot.board_read") {
      status = Object.keys(manifest.autopilot.actionSelections).length > 0 ? "passed" : manifest.run.routeLock.status === "locked" ? "ready" : "blocked";
      if (status === "blocked") hardBlockerIds.push("ROUTE_LOCK_REQUIRED");
    } else if (gateId === "autopilot.no_stale_board") {
      const latestLoop = latestAutopilotLoop(manifest);
      status = latestLoop ? "passed" : manifest.run.routeLock.status === "locked" ? "ready" : "blocked";
      if (status === "blocked") hardBlockerIds.push("BOARD_REVISION_STALE");
    } else if (gateId === "autopilot.action_legality") {
      status = Object.keys(manifest.autopilot.loops).length > 0 ? "passed" : manifest.run.routeLock.status === "locked" && Object.keys(manifest.amendments.pending).length === 0 ? "ready" : "blocked";
      if (status === "blocked") hardBlockerIds.push("GATE_BLOCKED");
    } else if (gateId === "autopilot.route_adherence") {
      const latestLoop = latestAutopilotLoop(manifest);
      if (latestLoop?.routeAdherence?.status === "adherent") status = "passed";
      else if (latestLoop?.routeAdherence) status = "blocked";
      else status = manifest.run.routeLock.status === "locked" ? "ready" : "blocked";
      if (status === "blocked") hardBlockerIds.push("GATE_BLOCKED");
      if (latestLoop?.routeAdherence?.evidenceIds) requiredEvidenceIds.push(...latestLoop.routeAdherence.evidenceIds);
    } else if (gateId === "autopilot.drift_response") {
      const latestDrift = Object.values(manifest.autopilot.driftRecords).at(-1);
      const latestLoop = latestAutopilotLoop(manifest);
      if (!latestDrift) status = manifest.run.routeLock.status === "locked" ? "ready" : "blocked";
      else status = latestLoop && latestLoop.status !== "running" ? "passed" : "blocked";
      if (status === "blocked") hardBlockerIds.push("GATE_BLOCKED");
      if (latestDrift?.evidenceIds) requiredEvidenceIds.push(...latestDrift.evidenceIds);
    } else if (gateId.startsWith("closeout.")) {
      const completedCloseout = Object.values(manifest.closeout.records).find((record) => record.status === "completed");
      status = completedCloseout ? "passed" : allRequiredPassed ? "ready" : "blocked";
      if (status === "blocked") hardBlockerIds.push("FINAL_MESSAGE_NOT_COMPLETION");
      requiredEvidenceIds.push(...manifest.route.verificationScenarios.map((scenario) => `verification:${scenario.scenarioId}`).filter((evidenceId) => manifest.evidence.records[evidenceId]));
    } else if (gateId === "release.product_audit") {
      status = "blocked";
      hardBlockerIds.push("EVIDENCE_MISSING");
    }

    output[gateId] = {
      gateId,
      status,
      hardBlockerIds,
      softWarningIds,
      requiredEvidenceIds,
      lastEvaluatedAt: evaluatedAt,
    };
  }
  return output;
}

function buildBlockers(manifest: HelmsmanManifest): BoardProjection["blockers"] {
  const blockers: BoardProjection["blockers"] = [];
  for (const questionId of manifest.questions.openQuestionIds) {
    blockers.push({
      blockerId: `open-question:${questionId}`,
      severity: "hard",
      blocks: "route_lock",
      reason: "Required question remains unanswered.",
      sourceQuestionId: questionId,
      requiredAction: "ask_question_bundle",
    });
  }
  if (manifest.run.routeLock.status !== "locked") {
    blockers.push({
      blockerId: "route-lock-required",
      severity: "hard",
      blocks: "autopilot",
      reason: "Autopilot requires a user-confirmed Route Lock.",
      requiredAction: "confirm_route_lock",
    });
  }
  if (manifest.run.routeLock.status === "invalidated") {
    blockers.push({
      blockerId: "route-lock-invalidated",
      severity: manifest.run.routeLock.invalidation?.severity === "warning" ? "warning" : "hard",
      blocks: "autopilot",
      reason: manifest.run.routeLock.invalidation?.reason ?? "Locked route was invalidated and Autopilot must stop.",
      requiredAction: "park",
    });
  }
  for (const pendingId of Object.keys(manifest.amendments.pending)) {
    blockers.push({
      blockerId: `pending-amendment:${pendingId}`,
      severity: "hard",
      blocks: "autopilot",
      reason: `Route amendment ${pendingId} is pending; Autopilot cannot run against an unsettled route.`,
      requiredAction: "park",
    });
  }
  const latestLoop = latestAutopilotLoop(manifest);
  if (latestLoop && ["planned", "running"].includes(latestLoop.status)) {
    blockers.push({
      blockerId: `autopilot-active:${latestLoop.loopId}`,
      severity: "hard",
      blocks: "autopilot",
      reason: `Autopilot loop ${latestLoop.loopId} is ${latestLoop.status}; duplicate loop execution is illegal.`,
      requiredAction: "park",
    });
  }
  if (latestLoop && ["parked", "stopped", "needs_user_action", "failed", "timed_out"].includes(latestLoop.status)) {
    blockers.push({
      blockerId: `autopilot-${latestLoop.status}:${latestLoop.loopId}`,
      severity: latestLoop.status === "parked" || latestLoop.status === "needs_user_action" ? "warning" : "hard",
      blocks: "autopilot",
      reason: `Autopilot loop ${latestLoop.loopId} is ${latestLoop.status}; Core must recover, repair, amend, ask, or stop before continuing.`,
      requiredAction: "park",
    });
  }
  for (const candidate of Object.values(manifest.memory.candidates)) {
    if (candidate.blocksRouteLock && candidate.createsResearchLaneId) {
      const lane = manifest.research.lanes[candidate.createsResearchLaneId];
      if (!lane || !["accepted", "dropped"].includes(lane.status)) {
        blockers.push({
          blockerId: `research-required:${candidate.createsResearchLaneId}`,
          severity: "hard",
          blocks: "route_lock",
          reason: `Memory judgment ${candidate.candidateId} is ${candidate.classification} and requires research before Route Lock.`,
          requiredAction: "dispatch_research",
        });
      }
    }
  }
  for (const lane of Object.values(manifest.research.lanes)) {
    if (!["accepted", "dropped"].includes(lane.status)) {
      blockers.push({
        blockerId: `research-lane-open:${lane.laneId}`,
        severity: "hard",
        blocks: "route_lock",
        reason: `Research lane ${lane.slug} remains ${lane.status}.`,
        sourceArtifactId: lane.expectedArtifactPath,
        requiredAction: lane.status === "submitted" || lane.status === "rejected" ? "dispatch_research" : "dispatch_research",
      });
    }
  }
  const verificationSummary = summarizeVerification(manifest);
  if (manifest.route.verificationScenarios.length > 0 && verificationSummary.unverified > 0) {
    blockers.push({
      blockerId: "verification-required",
      severity: "hard",
      blocks: "closeout",
      reason: "Closeout requires every required scenario to have a Core-recorded verdict.",
      requiredAction: "run_verification",
    });
  }
  for (const [scenarioId, verdict] of Object.entries(manifest.verification.latestVerdictByScenario)) {
    if (verdict.status === "failed" || verdict.status === "blocked") {
      blockers.push({
        blockerId: `verification-${verdict.status}:${scenarioId}`,
        severity: "hard",
        blocks: "closeout",
        reason: `Scenario ${scenarioId} is ${verdict.status}; closeout cannot be completed as success.`,
        sourceEvidenceId: `verification:${scenarioId}`,
        requiredAction: verdict.status === "failed" ? "run_autopilot_loop" : "run_verification",
      });
    } else if (verdict.status === "parked") {
      blockers.push({
        blockerId: `verification-parked:${scenarioId}`,
        severity: "warning",
        blocks: "closeout",
        reason: `Scenario ${scenarioId} is parked and requires a parked closeout or user decision.`,
        sourceEvidenceId: `verification:${scenarioId}`,
        requiredAction: "park",
      });
    }
  }
  return blockers;
}

function buildForbiddenActions(manifest: HelmsmanManifest): BoardProjection["forbiddenActions"] {
  const actions: BoardProjection["forbiddenActions"] = [];
  if (manifest.run.routeLock.status !== "locked") {
    actions.push({
      action: "run_autopilot_loop",
      reason: "Autopilot is illegal before Route Lock.",
      source: { kind: "gate", gateId: "route_lock.user_authority" },
    });
  }
  if (manifest.run.routeLock.status === "invalidated") {
    actions.push({
      action: "run_autopilot_loop",
      reason: "Autopilot is illegal while Route Lock is invalidated.",
      source: { kind: "route_lock", status: "invalidated" },
    });
  }
  const pendingAmendments = Object.keys(manifest.amendments.pending);
  if (pendingAmendments.length > 0) {
    actions.push({
      action: "run_autopilot_loop",
      reason: "Autopilot is illegal while route amendments are pending.",
      source: { kind: "amendment", amendmentId: pendingAmendments[0] ?? "unknown" },
    });
  }
  const latestLoop = latestAutopilotLoop(manifest);
  if (latestLoop && ["planned", "running"].includes(latestLoop.status)) {
    actions.push({
      action: "run_autopilot_loop",
      reason: `Autopilot loop ${latestLoop.loopId} is already ${latestLoop.status}.`,
      source: { kind: "autopilot", loopId: latestLoop.loopId },
    });
  }
  if (latestLoop && ["parked", "stopped", "needs_user_action", "failed", "timed_out"].includes(latestLoop.status)) {
    actions.push({
      action: "run_autopilot_loop",
      reason: `Autopilot loop ${latestLoop.loopId} is ${latestLoop.status}; continuing requires recovery, repair, amendment, ask, or user decision.`,
      source: { kind: "autopilot", loopId: latestLoop.loopId },
    });
  }
  if (manifest.questions.openQuestionIds.length > 0) {
    actions.push({
      action: "confirm_route_lock",
      reason: "Route Lock is illegal while required questions are open.",
      source: { kind: "question", questionId: manifest.questions.openQuestionIds[0] ?? "unknown" },
    });
  }
  const unresolvedResearch = unresolvedResearchLaneIds(manifest);
  if (unresolvedResearch.length > 0) {
    actions.push({
      action: "confirm_route_lock",
      reason: "Route Lock is illegal while required research lanes are unresolved.",
      source: { kind: "research", laneId: unresolvedResearch[0] ?? "unknown" },
    });
  }
  const verificationSummary = summarizeVerification(manifest);
  if (manifest.run.activeStage === "closeout" && (verificationSummary.failed > 0 || verificationSummary.blocked > 0 || verificationSummary.unverified > 0)) {
    actions.push({
      action: "closeout",
      reason: "Successful closeout is forbidden while required scenarios are failed, blocked, or unverified.",
      source: { kind: "verification", status: "unresolved" },
    });
  }
  return actions;
}

function chooseNextAction(manifest: HelmsmanManifest, revision: number, hasBlockers: boolean): BoardNextAction {
  const base = (kind: BoardNextAction["kind"], reason: string, requiredCommand?: string, requiresUserInput = false): BoardNextAction => ({
    kind,
    reason,
    requiredCommand,
    requiresUserInput,
    requiredBoardRevision: revision,
  });
  if (manifest.questions.openQuestionIds.length > 0) return base("ask_question_bundle", "Answer the open Core-authored question bundle.", "question.answer_record", true);
  if (manifest.run.routeLock.status === "invalidated") {
    return base("park", "Route Lock is invalidated; choose amend, unlock, ask, park, or stop before Autopilot.", "route.unlock", true);
  }
  if (Object.keys(manifest.amendments.pending).length > 0) {
    return base("park", "A route amendment is pending and must be applied or rejected before Autopilot.", "route.amend_apply", true);
  }
  switch (manifest.run.activeStage) {
    case "chat":
      return base("continue_chat", "Normal chat is legal until Charting is explicitly entered.", "chat.message_record");
    case "charting":
      return base("run_memory_scan", "Charting has no open required questions; run scoped memory scan next.", "memory.scan_record");
    case "memory_scan":
      return Object.keys(manifest.memory.scans).length === 0
        ? base("run_memory_scan", "Record the scoped memory scan before research.", "memory.scan_record")
        : base("dispatch_research", "Scoped memory scan exists; declare research lanes for stale, missing, or conflict judgments.", "research.lane_plan");
    case "research":
      if (Object.keys(manifest.research.lanes).length === 0) return base("dispatch_research", "Declare research lanes from memory judgments.", "research.lane_plan");
      if (unresolvedResearchLaneIds(manifest).length > 0) return base("dispatch_research", "Prepare packets, dispatch lanes, and validate artifacts.", "research.packet_prepare");
      return base("synthesize", "All research lanes are accepted or dropped; synthesize the evidence wave.", "research.synthesis_record");
    case "synthesis":
      return base("synthesize", "Synthesize accepted evidence before Route Lock.", "run.stage_change");
    case "lock_ready":
      return base(manifest.run.routeLock.status === "lock_ready" ? "confirm_route_lock" : "propose_route_lock", "Route Lock requires user-visible authority.", "route.lock_confirm", true);
    case "locked":
    case "autopilot": {
      const latestLoop = latestAutopilotLoop(manifest);
      if (latestLoop && ["planned", "running"].includes(latestLoop.status)) {
        return base("park", `Autopilot loop ${latestLoop.loopId} is ${latestLoop.status}; wait for finish or recover.`, "autopilot.loop_finish");
      }
      if (latestLoop && ["parked", "stopped", "needs_user_action", "failed", "timed_out"].includes(latestLoop.status)) {
        return base("park", `Autopilot loop ${latestLoop.loopId} is ${latestLoop.status}; recover, amend, ask, or stop before continuing.`, "autopilot.recover", true);
      }
      if (latestLoop?.status === "needs_repair") {
        return base("run_autopilot_loop", `Autopilot repair pass is legal for ${latestLoop.loopId}.`, "autopilot.loop_start");
      }
      return base("run_autopilot_loop", "Board-governed Autopilot may run only from locked route state.", "autopilot.loop_start");
    }
    case "verification":
      return base("run_verification", "Run scenario-backed verification.", "verification.run_start");
    case "closeout":
      return base(hasBlockers ? "run_verification" : "closeout", hasBlockers ? "Closeout requires scenario-backed verification verdicts." : "All required scenarios are passed; Core closeout may be recorded.", hasBlockers ? "verification.run_start" : "closeout.record");
    case "closed":
      return base("park", "Run is already closed.");
  }
}

function routeLockBlockerIds(manifest: HelmsmanManifest): string[] {
  const blockers: string[] = [];
  blockers.push(...manifest.questions.openQuestionIds.map((questionId) => `open-question:${questionId}`));
  if (Object.keys(manifest.memory.scans).length === 0) blockers.push("memory-scan-missing");
  blockers.push(...unresolvedResearchLaneIds(manifest).map((laneId) => `research-lane-open:${laneId}`));
  for (const lane of Object.values(manifest.research.lanes)) {
    if (lane.status === "accepted" && !Object.values(manifest.artifacts.records).some((artifact) => artifact.path === lane.expectedArtifactPath && artifact.status === "accepted")) {
      blockers.push(`artifact-not-accepted:${lane.laneId}`);
    }
  }
  if (manifest.route.verificationScenarios.length === 0) blockers.push("verification-scenarios-missing");
  if (Object.values(manifest.questions.answers).some((answer) => !manifest.questions.surfaces[answer.surfaceId] || !manifest.evidence.records[answer.surfaceId])) {
    blockers.push("question-surface-missing");
  }
  return blockers;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function projectMemory(manifest: HelmsmanManifest): Record<string, unknown> {
  const scans = Object.values(manifest.memory.scans);
  const candidates = Object.values(manifest.memory.candidates);
  const latestScan = scans.at(-1);
  return {
    scanCount: scans.length,
    latestScanId: latestScan?.scanId,
    latestScanArtifactPath: latestScan?.artifactPath,
    candidateCount: candidates.length,
    classificationCounts: countBy(candidates.map((candidate) => candidate.classification)),
    blockingCandidateIds: candidates.filter((candidate) => candidate.blocksRouteLock).map((candidate) => candidate.candidateId),
  };
}

function projectResearch(manifest: HelmsmanManifest): Record<string, unknown> {
  const lanes = Object.values(manifest.research.lanes);
  const packets = Object.values(manifest.research.packets);
  const activeLaneIds = packets.slice(0, DEFAULT_MAX_ACTIVE_RESEARCH_LANES).map((packet) => packet.laneId);
  const queuedLaneIds = lanes
    .filter((lane) => lane.status === "queued" && !activeLaneIds.includes(lane.laneId))
    .map((lane) => lane.laneId);
  const latestSynthesis = Object.values(manifest.research.syntheses).at(-1);
  return {
    laneCount: lanes.length,
    maxActiveLaneCap: DEFAULT_MAX_ACTIVE_RESEARCH_LANES,
    launchPosture: lanes.length === 0 ? "blocked" : packets.length > 1 ? "parallel" : packets.length === 1 ? "lead-only" : "blocked",
    activeLaneIds,
    queuedLaneIds,
    laneStatusCounts: countBy(lanes.map((lane) => lane.status)),
    lanes: lanes.map((lane) => ({
      laneId: lane.laneId,
      slug: lane.slug,
      ownerRoleId: lane.ownerRoleId,
      status: lane.status,
      artifactPath: lane.expectedArtifactPath,
      decisionImpact: lane.decisionImpact,
      openUncertainty: lane.openUncertainty,
      workerPacketId: lane.workerPacketId,
      dropReason: lane.dropReason,
    })),
    submittedArtifactIds: manifest.research.submittedArtifactIds,
    acceptedArtifactIds: manifest.research.acceptedArtifactIds,
    rejectedArtifactIds: manifest.research.rejectedArtifactIds,
    droppedLaneIds: manifest.research.droppedLaneIds,
    packetCount: packets.length,
    synthesisCount: Object.keys(manifest.research.syntheses).length,
    latestSynthesisOutcome: latestSynthesis?.outcome,
  };
}

function projectAutopilot(manifest: HelmsmanManifest): Record<string, unknown> {
  const loops = Object.values(manifest.autopilot.loops);
  const packets = Object.values(manifest.autopilot.packets);
  const latestLoop = latestAutopilotLoop(manifest);
  const driftRecords = Object.values(manifest.autopilot.driftRecords);
  return {
    loopCount: loops.length,
    packetCount: packets.length,
    actionSelectionCount: Object.keys(manifest.autopilot.actionSelections).length,
    latestLoopId: latestLoop?.loopId,
    latestLoopStatus: latestLoop?.status,
    latestBoardRevisionRead: latestLoop?.boardRevisionRead,
    latestRouteAdherence: latestLoop?.routeAdherence?.status,
    runningLoopIds: loops.filter((loop) => ["planned", "running"].includes(loop.status)).map((loop) => loop.loopId),
    repairLoopIds: loops.filter((loop) => loop.status === "needs_repair").map((loop) => loop.loopId),
    parkedLoopIds: loops.filter((loop) => ["parked", "needs_user_action", "stopped", "failed", "timed_out"].includes(loop.status)).map((loop) => loop.loopId),
    loopStatusCounts: countBy(loops.map((loop) => loop.status)),
    driftCounts: countBy(driftRecords.map((drift) => drift.class)),
    latestDriftId: driftRecords.at(-1)?.driftId,
    recoveries: Object.keys(manifest.autopilot.recoveries).length,
  };
}

function projectVerification(manifest: HelmsmanManifest): Record<string, unknown> {
  const scenarioIds = manifest.route.verificationScenarios.map((scenario) => scenario.scenarioId);
  const verdicts = manifest.verification.latestVerdictByScenario;
  const summary = summarizeVerification(manifest);
  return {
    scenariosDeclared: scenarioIds.length,
    activeRunId: manifest.verification.activeRunId ?? "none",
    runCount: Object.keys(manifest.verification.runs).length,
    verdictCount: Object.values(manifest.verification.verdicts).reduce((count, history) => count + history.length, 0),
    statusCounts: summary,
    scenarios: scenarioIds.map((scenarioId) => {
      const scenario = manifest.route.verificationScenarios.find((candidate) => candidate.scenarioId === scenarioId)!;
      const verdict = verdicts[scenarioId];
      const contract = manifest.verification.scenarioContracts[scenarioId];
      return {
        scenarioId,
        title: scenario.title,
        status: verdict?.status ?? "unverified",
        hardFloor: contract?.hardFloor ?? true,
        verifierRoleId: contract?.verifierRoleId,
        attempt: verdict?.attempt ?? 0,
        artifactPath: verdict?.artifactPath ?? contract?.expectedArtifactPath,
        evidenceIds: verdict?.evidenceIds ?? [],
        failedCriteria: verdict?.criteriaFailed ?? [],
        blockedCriteria: verdict?.criteriaBlocked ?? [],
        residualRisk: verdict?.residualRisk ?? "unverified",
      };
    }),
    closeoutReady: scenarioIds.length > 0 && summary.failed === 0 && summary.blocked === 0 && summary.parked === 0 && summary.unverified === 0,
  };
}

function projectCloseout(manifest: HelmsmanManifest): Record<string, unknown> {
  const latest = manifest.closeout.latestCloseoutId ? manifest.closeout.records[manifest.closeout.latestCloseoutId] : undefined;
  return {
    closeoutCount: Object.keys(manifest.closeout.records).length,
    latestCloseoutId: latest?.closeoutId ?? "none",
    latestStatus: latest?.status ?? "not_recorded",
    closeoutArtifactPath: latest?.closeoutArtifactPath,
    evidenceIndexPath: latest?.evidenceIndexPath,
    memoryPromotionCandidateCount: Object.keys(manifest.closeout.memoryPromotionCandidates).length,
    memoryPromotionCandidatePath: latest?.memoryPromotionCandidatePath,
  };
}

function latestAutopilotLoop(manifest: HelmsmanManifest): HelmsmanManifest["autopilot"]["loops"][string] | undefined {
  return Object.values(manifest.autopilot.loops)
    .sort((left, right) => left.startedAt?.localeCompare(right.startedAt ?? "") ?? 0)
    .at(-1);
}

function summarizeVerification(manifest: HelmsmanManifest): { passed: number; failed: number; blocked: number; parked: number; unverified: number } {
  const summary = { passed: 0, failed: 0, blocked: 0, parked: 0, unverified: 0 };
  for (const scenario of manifest.route.verificationScenarios) {
    const verdict = manifest.verification.latestVerdictByScenario[scenario.scenarioId];
    if (!verdict) summary.unverified += 1;
    else if (verdict.status === "passed") summary.passed += 1;
    else if (verdict.status === "failed") summary.failed += 1;
    else if (verdict.status === "blocked") summary.blocked += 1;
    else summary.parked += 1;
  }
  return summary;
}

function unresolvedResearchLaneIds(manifest: HelmsmanManifest): string[] {
  return Object.values(manifest.research.lanes)
    .filter((lane) => !["accepted", "dropped"].includes(lane.status))
    .map((lane) => lane.laneId);
}
