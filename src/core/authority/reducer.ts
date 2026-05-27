import {
  type ArtifactRecord,
  type AutonomyBoundary,
  type AutopilotActionSelection,
  type AutopilotDriftRecord,
  type AutopilotLoopFinishRecord,
  type AutopilotLoopPlan,
  type AutopilotLoopStatus,
  type AutopilotPacket,
  type AutopilotRecoveryRecord,
  type AutopilotRouteAdherence,
  type CloseoutRecord,
  CoreError,
  type EvidenceRecord,
  type HelmsmanManifest,
  type ManifestEvent,
  type MemoryPromotionCandidate,
  type OperationRecord,
  type QuestionAnswerContract,
  type QuestionBundleContract,
  type ResearchLaneContract,
  type ResearchSynthesisRecord,
  type ResearchWorkerPacket,
  type Revision,
  type RoleBindingContract,
  type RoleRunStatus,
  type RouteAmendment,
  type RouteAmendmentApplication,
  type RouteAmendmentRejection,
  type RouteEffect,
  type RouteLockConfirmationEvidence,
  type RouteLockInvalidationRecord,
  type RouteLockProposal,
  type RunStage,
  type MemoryCandidateJudgment,
  type MemoryScanPlan,
  type VerificationRunFinishRecord,
  type VerificationRunPlan,
  type VerificationScenarioContract,
  type VerificationScenarioVerdict,
  type VerificationVerdictStatus,
} from "./types.ts";
import { hashQuestionBundle } from "./question-hash.ts";

const ROUTE_CHANGING_EFFECTS = new Set([
  "route.scope.add",
  "route.scope.remove",
  "route.non_goal.add",
  "route.assumption.add",
  "route.risk.add",
  "route.stop_condition.add",
  "route.success_criterion.add",
  "route.verification_scenario.add",
  "route.verification_scenario.remove",
  "route.autonomy_boundary.set",
]);

export interface ReducerResult {
  manifest: HelmsmanManifest;
  warnings: string[];
}

export function replayManifest(events: ManifestEvent[]): ReducerResult {
  const warnings: string[] = [];
  const seenEventIds = new Set<string>();
  let previousCreatedAt = "";
  let manifest: HelmsmanManifest | undefined;

  const sortedEvents = [...events].sort((left, right) => left.sequence - right.sequence);

  for (let index = 0; index < sortedEvents.length; index++) {
    const event = sortedEvents[index];
    const expectedSequence = index + 1;
    if (event.sequence !== expectedSequence) {
      throw new CoreError({
        code: event.sequence < expectedSequence ? "EVENT_SEQUENCE_DUPLICATE" : "EVENT_SEQUENCE_GAP",
        message: `Expected manifest event sequence ${expectedSequence}, got ${event.sequence}.`,
        eventId: event.eventId,
        sequence: event.sequence,
      });
    }
    if (seenEventIds.has(event.eventId)) {
      throw new CoreError({
        code: "EVENT_ID_DUPLICATE",
        message: `Duplicate manifest event id ${event.eventId}.`,
        eventId: event.eventId,
        sequence: event.sequence,
      });
    }
    seenEventIds.add(event.eventId);
    if (previousCreatedAt && event.createdAt < previousCreatedAt) {
      throw schemaError(event, "createdAt must be monotonic non-decreasing.");
    }
    previousCreatedAt = event.createdAt;

    validateEnvelope(event);
    validateActorAuthority(event);

    if (!manifest) {
      if (event.type !== "run.created") {
        throw schemaError(event, "The first manifest event must be run.created.");
      }
      manifest = createInitialManifest(event);
      continue;
    }

    rejectLockedRouteMutation(manifest, event);
    manifest = reduceEvent(manifest, event, warnings);
  }

  if (!manifest) {
    throw new CoreError({
      code: "EVENT_SCHEMA_INVALID",
      message: "Cannot replay an empty manifest event log.",
      evidenceRefs: [],
    });
  }

  return { manifest, warnings };
}

function validateEnvelope(event: ManifestEvent): void {
  if (event.schemaVersion !== "helmsman.manifest-event.v1") throw schemaError(event, "Unknown manifest event schemaVersion.");
  if (!event.eventId || !event.runId || !event.type || !event.createdAt) throw schemaError(event, "Missing required event envelope field.");
  if (!event.actor?.kind || !event.actor.id) throw schemaError(event, "Missing event actor.");
  if (event.type !== "run.created" && !event.causality?.commandId) throw schemaError(event, "Mutating event is missing causality.commandId.");
  if (event.type !== "run.created" && typeof event.causality?.boardRevisionRead !== "number") {
    throw schemaError(event, "Mutating event is missing causality.boardRevisionRead.");
  }
  rejectSecretPayload(event);
}

function validateActorAuthority(event: ManifestEvent): void {
  const actor = event.actor.kind;
  const allowedByType: Record<string, string[]> = {
    "run.created": ["user", "core_policy"],
    "run.stage_changed": ["core_policy"],
    "chat.message_recorded": ["user", "role_runner", "core_policy"],
    "question.bundle_asked": ["core_policy"],
    "question.answered": ["user"],
    "question.waived": ["user", "core_policy"],
    "memory.scan_created": ["core_policy"],
    "memory.candidate_classified": ["core_policy", "role_runner"],
    "research.lane_declared": ["core_policy"],
    "research.worker_packet_created": ["core_policy"],
    "research.artifact_submitted": ["role_runner", "external_adapter", "core_policy"],
    "research.artifact_accepted": ["user", "core_policy", "verifier"],
    "research.artifact_rejected": ["core_policy", "verifier"],
    "research.lane_dropped": ["user", "core_policy"],
    "research.synthesis_recorded": ["core_policy"],
    "role.binding_set": ["core_policy"],
    "role.run_planned": ["core_policy"],
    "role.run_started": ["role_runner", "core_policy"],
    "role.run_evidence_captured": ["role_runner", "core_policy"],
    "role.run_finished": ["role_runner", "core_policy"],
    "operation.started": ["core_policy"],
    "operation.event_captured": ["core_policy", "role_runner", "external_adapter"],
    "operation.finished": ["core_policy", "role_runner", "external_adapter"],
    "artifact.expected": ["core_policy"],
    "artifact.produced": ["core_policy", "role_runner", "external_adapter", "verifier"],
    "artifact.accepted": ["user", "core_policy", "verifier"],
    "evidence.recorded": ["user", "core_policy", "role_runner", "external_adapter", "verifier"],
    "route_lock.proposed": ["core_policy"],
    "route_lock.locked": ["user"],
    "route_lock.cancelled": ["user", "core_policy"],
    "route_lock.unlocked": ["user", "core_policy"],
    "route_lock.invalidated": ["core_policy"],
    "amendment.proposed": ["user", "core_policy", "role_runner", "external_adapter", "verifier"],
    "amendment.applied": ["user", "core_policy"],
    "amendment.rejected": ["user", "core_policy"],
    "autopilot.action_selected": ["core_policy"],
    "autopilot.packet_prepared": ["core_policy"],
    "autopilot.loop_started": ["core_policy"],
    "autopilot.route_adherence_evaluated": ["core_policy"],
    "autopilot.drift_recorded": ["core_policy"],
    "autopilot.loop_finished": ["core_policy"],
    "autopilot.loop_recovered": ["core_policy"],
    "verification.run_started": ["core_policy"],
    "verification.result_recorded": ["verifier", "core_policy"],
    "verification.run_finished": ["core_policy"],
    "closeout.recorded": ["user", "core_policy"],
  };
  const allowed = allowedByType[event.type];
  if (!allowed) throw schemaError(event, `Unknown event type ${event.type}.`);
  if (!allowed.includes(actor)) {
    throw new CoreError({
      code: "EVENT_ACTOR_UNAUTHORIZED",
      message: `${actor} cannot author ${event.type}.`,
      eventId: event.eventId,
      sequence: event.sequence,
    });
  }
}

function createInitialManifest(event: ManifestEvent): HelmsmanManifest {
  const payload = event.payload as { title?: string; workspace?: string; initialIntent?: string };
  if (!payload.title || !payload.workspace) throw schemaError(event, "run.created requires title and workspace.");
  return {
    schemaVersion: "helmsman.pi-direct.v1",
    run: {
      id: event.runId,
      title: payload.title,
      workspace: payload.workspace,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
      activeStage: "chat",
      routeLock: { status: "unlocked" },
    },
    route: {
      goal: payload.initialIntent ?? payload.title,
      scope: payload.initialIntent ? [assertion(event, "initial-scope", payload.initialIntent)] : [],
      nonGoals: [],
      assumptions: [],
      risks: [],
      stopConditions: [],
      successCriteria: [],
      autonomyBoundary: defaultAutonomyBoundary(),
      verificationScenarios: [],
    },
    questions: { bundles: {}, surfaces: {}, answers: {}, openQuestionIds: [], waivedQuestionIds: [] },
    memory: { scans: {}, candidates: {} },
    research: { lanes: {}, packets: {}, syntheses: {}, submittedArtifactIds: [], acceptedArtifactIds: [], rejectedArtifactIds: [], droppedLaneIds: [] },
    roles: { bindings: {}, roleRuns: {} },
    workers: { packets: {}, lanes: {} },
    operations: { records: {} },
    artifacts: { records: {} },
    evidence: { records: {} },
    gates: {},
    scorecard: { currentScore: 0, hardFloorPassed: false, lastMovement: [] },
    adapters: { capabilityReports: {}, diagnostics: {} },
    amendments: { pending: {}, applied: {}, rejected: {} },
    autopilot: { loops: {}, packets: {}, actionSelections: {}, driftRecords: {}, recoveries: {} },
    verification: { runs: {}, plans: {}, scenarioContracts: {}, verdicts: {}, latestVerdictByScenario: {} },
    closeout: { records: {}, memoryPromotionCandidates: {} },
  };
}

function reduceEvent(manifest: HelmsmanManifest, event: ManifestEvent, warnings: string[]): HelmsmanManifest {
  const next = structuredClone(manifest) as HelmsmanManifest;
  next.run.updatedAt = event.createdAt;

  switch (event.type) {
    case "run.stage_changed": {
      const payload = event.payload as { from: RunStage; to: RunStage; reason: string };
      if (payload.from !== next.run.activeStage) throw schemaError(event, `Stage change expected ${payload.from}, found ${next.run.activeStage}.`);
      next.run.activeStage = payload.to;
      break;
    }
    case "chat.message_recorded": {
      const payload = event.payload as { messageId: string; role: string; text: string; evidenceIds?: string[] };
      next.evidence.records[payload.messageId] = {
        evidenceId: payload.messageId,
        kind: `chat.${payload.role}`,
        summary: payload.text,
        recordedAt: event.createdAt,
      };
      break;
    }
    case "question.bundle_asked": {
      const payload = event.payload as { bundle: QuestionBundleContract; surface: { surfaceId: string; bundleHash?: string }; surfaceEvidence?: EvidenceRecord };
      validateQuestionBundle(event, payload.bundle);
      const expectedHash = hashQuestionBundle(payload.bundle);
      if (payload.surface.bundleHash !== expectedHash) {
        throw schemaError(event, "Question surface bundleHash must match the Core-authored bundle hash.");
      }
      next.questions.bundles[payload.bundle.bundleId] = payload.bundle;
      next.questions.surfaces[payload.surface.surfaceId] = payload.surface as never;
      if (payload.surfaceEvidence) {
        if (payload.surfaceEvidence.evidenceId !== payload.surface.surfaceId) throw schemaError(event, "Question surface evidence id must match surfaceId.");
        next.evidence.records[payload.surfaceEvidence.evidenceId] = payload.surfaceEvidence;
      }
      for (const question of payload.bundle.questions) {
        if (question.requiredForLock && !next.questions.openQuestionIds.includes(question.questionId)) {
          next.questions.openQuestionIds.push(question.questionId);
        }
      }
      break;
    }
    case "question.answered": {
      const payload = event.payload as {
        bundleId: string;
        questionId: string;
        answer: QuestionAnswerContract;
        appliedRouteEffects: RouteEffect[];
        evidenceIds: string[];
      };
      const bundle = next.questions.bundles[payload.bundleId];
      const question = bundle?.questions.find((candidate) => candidate.questionId === payload.questionId);
      if (!bundle || !question) throw schemaError(event, "Answer references an unknown question.");
      const surface = next.questions.surfaces[payload.answer.surfaceId];
      if (!surface) throw schemaError(event, "Answer references an unknown rendered question surface.");
      const bundleHash = hashQuestionBundle(bundle);
      if (surface.bundleHash !== bundleHash || payload.answer.userVisibleBundleHash !== bundleHash) {
        throw schemaError(event, "Answer bundle hash must match the rendered Core-authored bundle hash.");
      }
      if (!payload.evidenceIds.includes(payload.answer.surfaceId) || !next.evidence.records[payload.answer.surfaceId]) {
        throw schemaError(event, "Answer must reference the rendered question surface evidence.");
      }
      if (payload.answer.authority !== "user") {
        throw new CoreError({ code: "QUESTION_ANSWER_UNAUTHORIZED", message: "Question answers require user authority.", eventId: event.eventId, sequence: event.sequence });
      }
      if (question.type === "single_select" && payload.answer.selectedOptionIds.length !== 1) {
        throw schemaError(event, "Single-select question answers require exactly one option.");
      }
      if (question.type === "multi_select" && payload.answer.selectedOptionIds.length < 1) {
        throw schemaError(event, "Multi-select question answers require at least one option.");
      }
      for (const selected of payload.answer.selectedOptionIds) {
        if (!question.options.some((option) => option.optionId === selected)) throw schemaError(event, `Unknown selected option ${selected}.`);
      }
      const expectedEffects = payload.answer.selectedOptionIds.flatMap((optionId) => question.routeEffectsByOption[optionId] ?? []);
      if (JSON.stringify(payload.appliedRouteEffects) !== JSON.stringify(expectedEffects)) {
        throw schemaError(event, "Applied route effects must exactly match the selected option route effects.");
      }
      next.questions.answers[payload.questionId] = payload.answer;
      next.questions.openQuestionIds = next.questions.openQuestionIds.filter((questionId) => questionId !== payload.questionId);
      applyRouteEffects(next, payload.appliedRouteEffects, event, payload.evidenceIds);
      break;
    }
    case "question.waived": {
      const payload = event.payload as { questionId: string };
      next.questions.waivedQuestionIds.push(payload.questionId);
      next.questions.openQuestionIds = next.questions.openQuestionIds.filter((questionId) => questionId !== payload.questionId);
      break;
    }
    case "memory.scan_created": {
      const payload = event.payload as MemoryScanPlan;
      validateMemoryScan(event, next, payload);
      next.memory.scans[payload.scanId] = payload;
      next.evidence.records[`memory-scan:${payload.scanId}`] = {
        evidenceId: `memory-scan:${payload.scanId}`,
        kind: "memory.scan",
        path: payload.artifactPath,
        summary: `Scoped memory scan for ${payload.routeQuestion}.`,
        recordedAt: event.createdAt,
      };
      break;
    }
    case "memory.candidate_classified": {
      const payload = event.payload as MemoryCandidateJudgment;
      validateMemoryCandidate(event, next, payload);
      next.memory.candidates[payload.candidateId] = payload;
      if (payload.classification === "reused") {
        applyRouteEffects(next, payload.routeEffects, event, [`memory-scan:${payload.scanId}`]);
      }
      break;
    }
    case "research.lane_declared": {
      const payload = event.payload as ResearchLaneContract;
      validateResearchLane(event, next, payload);
      next.research.lanes[payload.laneId] = payload;
      next.run.activeStage = "research";
      break;
    }
    case "research.worker_packet_created": {
      const payload = event.payload as ResearchWorkerPacket;
      validateResearchWorkerPacket(event, next, payload);
      next.research.packets[payload.packetId] = payload;
      next.workers.packets[payload.packetId] = payload;
      next.workers.lanes[payload.laneId] = {
        packetId: payload.packetId,
        status: "queued",
        parallelGroupId: payload.parallelGroupId,
      };
      next.research.lanes[payload.laneId].workerPacketId = payload.packetId;
      break;
    }
    case "research.artifact_submitted": {
      const payload = event.payload as { laneId: string; artifactId: string; artifactPath: string; evidenceIds: string[]; operationId?: string };
      const lane = next.research.lanes[payload.laneId];
      if (!lane) throw schemaError(event, `Research artifact references unknown lane ${payload.laneId}.`);
      if (payload.artifactPath !== lane.expectedArtifactPath) throw schemaError(event, "Research artifact path must match lane expectedArtifactPath.");
      if (!lane.workerPacketId) throw schemaError(event, "Research artifact submission requires a Core-authored worker packet.");
      if (lane.status === "accepted" || lane.status === "dropped") throw schemaError(event, "Research artifact cannot be submitted for an accepted or dropped lane.");
      if (!next.research.submittedArtifactIds.includes(payload.artifactId)) next.research.submittedArtifactIds.push(payload.artifactId);
      lane.status = "submitted";
      next.artifacts.records[payload.artifactId] = {
        artifactId: payload.artifactId,
        path: payload.artifactPath,
        kind: "research",
        status: "submitted",
        producerOperationId: payload.operationId,
        evidenceIds: payload.evidenceIds,
      };
      break;
    }
    case "research.artifact_accepted": {
      const payload = event.payload as { laneId: string; artifactId: string; routeEffects: RouteEffect[]; scoreEffects?: unknown[] };
      const lane = next.research.lanes[payload.laneId];
      if (!lane) throw schemaError(event, `Research acceptance references unknown lane ${payload.laneId}.`);
      const artifact = next.artifacts.records[payload.artifactId];
      if (!artifact) throw new CoreError({ code: "ARTIFACT_NOT_DECLARED", message: `Artifact ${payload.artifactId} was not submitted.`, eventId: event.eventId, sequence: event.sequence });
      if (artifact.path !== lane.expectedArtifactPath) throw schemaError(event, "Accepted research artifact path must match the lane expectedArtifactPath.");
      if (artifact.status !== "submitted" && artifact.status !== "produced") throw schemaError(event, "Only submitted or produced research artifacts can be accepted.");
      artifact.status = "accepted";
      lane.status = "accepted";
      if (!next.research.acceptedArtifactIds.includes(payload.artifactId)) next.research.acceptedArtifactIds.push(payload.artifactId);
      applyRouteEffects(next, payload.routeEffects, event, []);
      next.scorecard.currentScore += 5;
      next.scorecard.lastMovement.push(`Accepted research artifact ${payload.artifactId}.`);
      break;
    }
    case "research.artifact_rejected": {
      const payload = event.payload as { laneId: string; artifactId: string; reason: string; evidenceIds: string[] };
      const lane = next.research.lanes[payload.laneId];
      if (!lane) throw schemaError(event, `Research rejection references unknown lane ${payload.laneId}.`);
      const artifact = next.artifacts.records[payload.artifactId];
      if (!artifact) throw new CoreError({ code: "ARTIFACT_NOT_DECLARED", message: `Artifact ${payload.artifactId} was not submitted.`, eventId: event.eventId, sequence: event.sequence });
      artifact.status = "rejected";
      artifact.evidenceIds = payload.evidenceIds;
      lane.status = "rejected";
      if (!next.research.rejectedArtifactIds.includes(payload.artifactId)) next.research.rejectedArtifactIds.push(payload.artifactId);
      break;
    }
    case "research.lane_dropped": {
      const payload = event.payload as { laneId: string; reason: string };
      const lane = next.research.lanes[payload.laneId];
      if (!lane) throw schemaError(event, `Drop references unknown lane ${payload.laneId}.`);
      lane.status = "dropped";
      lane.dropReason = payload.reason;
      if (!next.research.droppedLaneIds.includes(payload.laneId)) next.research.droppedLaneIds.push(payload.laneId);
      break;
    }
    case "research.synthesis_recorded": {
      const payload = event.payload as ResearchSynthesisRecord;
      validateResearchSynthesis(event, next, payload);
      next.research.syntheses[payload.synthesisId] = payload;
      applyRouteEffects(next, payload.routeEffects, event, payload.evidenceIds);
      next.scorecard.currentScore += payload.outcome === "lock_ready" ? 10 : 2;
      next.scorecard.lastMovement.push(`Research synthesis ${payload.synthesisId}: ${payload.outcome}.`);
      if (payload.outcome === "lock_ready") next.run.activeStage = "lock_ready";
      else if (payload.outcome === "ask_decision_bundle") next.run.activeStage = "charting";
      else if (payload.outcome === "continue_research") next.run.activeStage = "research";
      else if (payload.outcome === "blocked") next.run.activeStage = "research";
      break;
    }
    case "role.binding_set": {
      const payload = event.payload as { binding: RoleBindingContract; evidenceIds?: string[] };
      validateRoleBinding(event, payload.binding);
      next.roles.bindings[payload.binding.roleId] = payload.binding;
      break;
    }
    case "role.run_planned": {
      const payload = event.payload as {
        roleRunId: string;
        operationId: string;
        roleId: string;
        planPath: string;
        promptPath: string;
        boardRevisionRead: Revision;
        expectedArtifacts?: Array<{ artifactId: string }>;
      };
      if (!next.roles.bindings[payload.roleId]) throw schemaError(event, `Role run references unknown role binding ${payload.roleId}.`);
      if (payload.boardRevisionRead !== event.causality.boardRevisionRead) throw schemaError(event, "Role run plan must record the Board revision read by Core.");
      next.roles.roleRuns[payload.roleRunId] = {
        ...(next.roles.roleRuns[payload.roleRunId] ?? {}),
        planned: payload,
        status: "planned",
      };
      break;
    }
    case "role.run_started": {
      const payload = event.payload as { roleRunId: string; operationId: string; runtime: string; piSessionId?: string; eventLogPath: string };
      const roleRun = next.roles.roleRuns[payload.roleRunId];
      if (!roleRun) throw schemaError(event, `Role run ${payload.roleRunId} was not planned.`);
      next.roles.roleRuns[payload.roleRunId] = {
        ...roleRun,
        started: payload,
        status: "running",
      };
      break;
    }
    case "role.run_evidence_captured": {
      const payload = event.payload as {
        roleRunId: string;
        eventLogPath: string;
        transcriptPath: string;
        toolEventsPath: string;
        resultPath?: string;
        evidenceIds: string[];
      };
      const roleRun = next.roles.roleRuns[payload.roleRunId];
      if (!roleRun) throw schemaError(event, `Role run ${payload.roleRunId} was not planned.`);
      const expectedEvidenceIds = [
        `role-run:${payload.roleRunId}:pi-events`,
        `role-run:${payload.roleRunId}:transcript`,
        `role-run:${payload.roleRunId}:tool-events`,
      ];
      for (const evidenceId of expectedEvidenceIds) {
        if (!payload.evidenceIds.includes(evidenceId)) throw schemaError(event, `Role run evidence is missing ${evidenceId}.`);
      }
      next.evidence.records[`role-run:${payload.roleRunId}:pi-events`] = {
        evidenceId: `role-run:${payload.roleRunId}:pi-events`,
        kind: "role_run.pi_events",
        path: payload.eventLogPath,
        summary: "Pi AgentSession event stream captured for role run.",
        recordedAt: event.createdAt,
      };
      next.evidence.records[`role-run:${payload.roleRunId}:transcript`] = {
        evidenceId: `role-run:${payload.roleRunId}:transcript`,
        kind: "role_run.transcript",
        path: payload.transcriptPath,
        summary: "Role run transcript evidence captured.",
        recordedAt: event.createdAt,
      };
      next.evidence.records[`role-run:${payload.roleRunId}:tool-events`] = {
        evidenceId: `role-run:${payload.roleRunId}:tool-events`,
        kind: "role_run.tool_events",
        path: payload.toolEventsPath,
        summary: "Role run tool-event evidence captured.",
        recordedAt: event.createdAt,
      };
      if (payload.resultPath && payload.evidenceIds.includes(`role-run:${payload.roleRunId}:result`)) {
        next.evidence.records[`role-run:${payload.roleRunId}:result`] = {
          evidenceId: `role-run:${payload.roleRunId}:result`,
          kind: "role_run.result",
          path: payload.resultPath,
          summary: "Sealed RoleRunResult captured; final message remains evidence only.",
          recordedAt: event.createdAt,
        };
      }
      next.roles.roleRuns[payload.roleRunId] = {
        ...roleRun,
        evidence: payload,
      };
      break;
    }
    case "role.run_finished": {
      const payload = event.payload as { roleRunId: string; operationId: string; resultPath: string; status: RoleRunStatus; artifactIds?: string[]; evidenceIds: string[] };
      const roleRun = next.roles.roleRuns[payload.roleRunId];
      if (!roleRun) throw schemaError(event, `Role run ${payload.roleRunId} was not planned.`);
      if (!payload.evidenceIds.includes(`role-run:${payload.roleRunId}:result`)) throw schemaError(event, "Role run finish must reference result evidence.");
      next.roles.roleRuns[payload.roleRunId] = {
        ...roleRun,
        finished: payload,
        status: payload.status,
      };
      if ((payload.artifactIds?.length ?? 0) > 0) {
        warnings.push("role.run_finished produced artifacts but did not accept them; artifact.accepted remains required.");
      }
      break;
    }
    case "operation.started": {
      const payload = event.payload as {
        operationId: string;
        runtime: "pi";
        roleId: string;
        promptPath: string;
        eventLogPath: string;
        boardRevisionRead: Revision;
        timeoutMs: number;
      };
      next.operations.records[payload.operationId] = {
        operationId: payload.operationId,
        kind: "runtime",
        runtime: payload.runtime,
        roleId: payload.roleId,
        promptPath: payload.promptPath,
        eventLogPath: payload.eventLogPath,
        status: "running",
        startedAt: event.createdAt,
        timeoutMs: payload.timeoutMs,
        artifactIds: [],
        evidenceIds: [],
        boardBefore: payload.boardRevisionRead,
        routeAdherence: "not_evaluated",
      };
      break;
    }
    case "operation.finished": {
      const payload = event.payload as { operationId: string; status: OperationRecord["status"]; producedArtifactIds: string[]; evidenceIds: string[] };
      const operation = next.operations.records[payload.operationId];
      if (!operation) throw schemaError(event, `Unknown operation ${payload.operationId}.`);
      operation.status = payload.status;
      operation.finishedAt = event.createdAt;
      operation.artifactIds = payload.producedArtifactIds;
      operation.evidenceIds = payload.evidenceIds;
      break;
    }
    case "operation.event_captured":
      break;
    case "artifact.expected": {
      const payload = event.payload as { artifact: { artifactId: string; kind: string; expectedPath: string; required: boolean } };
      next.artifacts.records[payload.artifact.artifactId] = {
        artifactId: payload.artifact.artifactId,
        kind: payload.artifact.kind,
        path: payload.artifact.expectedPath,
        status: "expected",
        evidenceIds: [],
      };
      break;
    }
    case "artifact.produced": {
      const payload = event.payload as { artifactId: string; path: string; kind: string; producerOperationId?: string; sha256?: string };
      next.artifacts.records[payload.artifactId] = {
        artifactId: payload.artifactId,
        path: payload.path,
        kind: payload.kind,
        producerOperationId: payload.producerOperationId,
        sha256: payload.sha256,
        status: "produced",
        evidenceIds: [],
      };
      break;
    }
    case "artifact.accepted": {
      const payload = event.payload as { artifactId: string; evidenceIds: string[] };
      const artifact = next.artifacts.records[payload.artifactId];
      if (!artifact) throw new CoreError({ code: "ARTIFACT_NOT_DECLARED", message: `Artifact ${payload.artifactId} does not exist.`, eventId: event.eventId, sequence: event.sequence });
      artifact.status = "accepted";
      artifact.evidenceIds = payload.evidenceIds;
      break;
    }
    case "evidence.recorded": {
      const payload = event.payload as { evidence: EvidenceRecord };
      next.evidence.records[payload.evidence.evidenceId] = payload.evidence;
      break;
    }
    case "route_lock.proposed": {
      const payload = event.payload as RouteLockProposal;
      validateRouteLockProposal(event, next, payload);
      next.run.routeLock = {
        status: "lock_ready",
        proposalId: payload.proposalId,
        proposalPath: "route-lock/proposal.json",
        renderedPath: payload.renderedPath,
        readiness: payload.readiness,
        snapshotPath: payload.snapshotPath,
        snapshotHash: payload.snapshotHash,
      };
      next.evidence.records[`route-lock:proposal:${payload.proposalId}`] = {
        evidenceId: `route-lock:proposal:${payload.proposalId}`,
        kind: "route_lock.proposal",
        path: payload.renderedPath,
        summary: `Route Lock proposal ${payload.proposalId} rendered with snapshot hash ${payload.snapshotHash}.`,
        recordedAt: event.createdAt,
      };
      next.run.activeStage = "lock_ready";
      break;
    }
    case "route_lock.locked": {
      const payload = event.payload as {
        proposalId: string;
        confirmedBy: "user";
        confirmedSurfaceEvidenceId: string;
        snapshotPath: string;
        snapshotHash: string;
        routeCardPath?: string;
        confirmationEvidence?: RouteLockConfirmationEvidence;
      };
      validateRouteLockConfirmation(event, next, payload);
      if (payload.confirmationEvidence) {
        next.evidence.records[payload.confirmationEvidence.evidenceId] = {
          evidenceId: payload.confirmationEvidence.evidenceId,
          kind: "route_lock.confirmation",
          path: "evidence/route-lock-confirmation.jsonl",
          summary: `User confirmed Route Lock proposal ${payload.proposalId} with visible hash ${payload.confirmationEvidence.visibleSnapshotHash}.`,
          recordedAt: event.createdAt,
        };
      }
      next.run.routeLock = {
        status: "locked",
        proposalId: payload.proposalId,
        proposalPath: next.run.routeLock.proposalPath,
        renderedPath: next.run.routeLock.renderedPath,
        readiness: next.run.routeLock.readiness,
        lockedAt: event.createdAt,
        lockedBy: event.actor.kind,
        lockEventId: event.eventId,
        snapshotPath: payload.snapshotPath,
        snapshotHash: payload.snapshotHash,
        confirmedSurfaceEvidenceId: payload.confirmedSurfaceEvidenceId,
      };
      next.run.activeStage = "locked";
      break;
    }
    case "route_lock.cancelled": {
      const payload = event.payload as { proposalId: string; reason: string };
      if (next.run.routeLock.status !== "lock_ready" || next.run.routeLock.proposalId !== payload.proposalId) {
        throw schemaError(event, "Route Lock cancellation must reference the active proposal.");
      }
      if (!nonEmpty(payload.reason)) throw schemaError(event, "Route Lock cancellation requires a reason.");
      next.run.routeLock = { status: "unlocked" };
      next.run.activeStage = "charting";
      break;
    }
    case "route_lock.unlocked": {
      const payload = event.payload as { reason: string; unlockedBy: "user" | "core_policy"; previousSnapshotHash: string; requiredNextStage: "charting"; evidenceIds: string[] };
      if (next.run.routeLock.status !== "locked" && next.run.routeLock.status !== "invalidated") throw schemaError(event, "Route unlock requires a locked or invalidated route.");
      if (payload.unlockedBy !== event.actor.kind) throw schemaError(event, "Route unlock actor must match unlockedBy.");
      if (!nonEmpty(payload.reason) || !Array.isArray(payload.evidenceIds)) throw schemaError(event, "Route unlock requires reason and evidenceIds.");
      if (payload.previousSnapshotHash !== next.run.routeLock.snapshotHash) throw schemaError(event, "Route unlock previousSnapshotHash must match the locked snapshot.");
      next.run.routeLock = { status: "unlocked" };
      next.run.activeStage = "charting";
      break;
    }
    case "route_lock.invalidated": {
      const payload = event.payload as RouteLockInvalidationRecord;
      validateRouteLockInvalidation(event, next, payload);
      next.run.routeLock.status = "invalidated";
      next.run.routeLock.invalidatedBy = event.eventId;
      next.run.routeLock.invalidatedAt = event.createdAt;
      next.run.routeLock.invalidation = payload;
      if (next.run.activeStage === "autopilot") next.run.activeStage = "locked";
      break;
    }
    case "amendment.proposed": {
      const payload = event.payload as { amendment: RouteAmendment; renderedPath: string };
      validateRouteAmendmentProposal(event, next, payload);
      next.amendments.pending[payload.amendment.amendmentId] = payload;
      next.evidence.records[`amendment:proposal:${payload.amendment.amendmentId}`] = {
        evidenceId: `amendment:proposal:${payload.amendment.amendmentId}`,
        kind: "route_amendment.proposal",
        path: payload.renderedPath,
        summary: `Route amendment ${payload.amendment.amendmentId} proposed: ${payload.amendment.reason}.`,
        recordedAt: event.createdAt,
      };
      break;
    }
    case "amendment.applied": {
      const payload = event.payload as RouteAmendmentApplication;
      const proposed = next.amendments.pending[payload.amendmentId];
      if (!proposed) throw schemaError(event, `Unknown amendment ${payload.amendmentId}.`);
      validateRouteAmendmentApplication(event, next, proposed.amendment, payload);
      next.amendments.applied[payload.amendmentId] = payload;
      delete next.amendments.pending[payload.amendmentId];
      applyRouteEffects(next, proposed.amendment.routeEffects, event, proposed.amendment.evidenceIds);
      if (proposed.amendment.invalidatesLock || proposed.amendment.kind === "unlock_required") {
        next.run.routeLock.status = "invalidated";
        next.run.routeLock.invalidatedBy = event.eventId;
        next.run.routeLock.invalidatedAt = event.createdAt;
        next.run.routeLock.invalidation = {
          previousSnapshotHash: payload.previousSnapshotHash,
          reason: proposed.amendment.reason,
          severity: "hard",
          evidenceIds: proposed.amendment.evidenceIds,
          requiredResponse: proposed.amendment.kind === "unlock_required" ? "unlock" : "amend",
        };
      } else {
        next.run.routeLock.snapshotPath = payload.newSnapshotPath;
        next.run.routeLock.snapshotHash = payload.newSnapshotHash;
      }
      break;
    }
    case "amendment.rejected": {
      const payload = event.payload as RouteAmendmentRejection;
      if (!next.amendments.pending[payload.amendmentId]) throw schemaError(event, `Unknown amendment ${payload.amendmentId}.`);
      if (payload.rejectedBy !== event.actor.kind) throw schemaError(event, "Amendment rejection actor must match rejectedBy.");
      if (!nonEmpty(payload.reason)) throw schemaError(event, "Amendment rejection requires a reason.");
      next.amendments.rejected[payload.amendmentId] = payload;
      delete next.amendments.pending[payload.amendmentId];
      break;
    }
    case "autopilot.action_selected": {
      const payload = event.payload as AutopilotActionSelection;
      validateAutopilotActionSelection(event, next, payload);
      next.autopilot.actionSelections[payload.loopId] = payload;
      break;
    }
    case "autopilot.packet_prepared": {
      const payload = event.payload as AutopilotPacket;
      validateAutopilotPacket(event, next, payload);
      next.autopilot.packets[payload.packetId] = payload;
      break;
    }
    case "autopilot.loop_started": {
      const payload = event.payload as {
        plan: AutopilotLoopPlan;
        planPath: string;
        packetIds: string[];
        packetPaths: string[];
        roleRunIds?: string[];
      };
      validateAutopilotLoopPlan(event, next, payload);
      next.autopilot.loops[payload.plan.loopId] = {
        loopId: payload.plan.loopId,
        status: "running",
        planPath: payload.planPath,
        boardRevisionRead: payload.plan.boardRevisionRead,
        boardProjectionHash: payload.plan.boardProjectionHash,
        lockedSnapshotHash: payload.plan.lockedSnapshotHash,
        startedAt: event.createdAt,
        packetIds: payload.packetIds,
        roleRunIds: payload.roleRunIds ?? [],
        driftIds: [],
        recoveryIds: [],
      };
      next.evidence.records[`autopilot:loop:${payload.plan.loopId}:plan`] = {
        evidenceId: `autopilot:loop:${payload.plan.loopId}:plan`,
        kind: "autopilot.plan",
        path: payload.planPath,
        summary: `Autopilot loop ${payload.plan.loopId} started from Board revision ${payload.plan.boardRevisionRead}.`,
        recordedAt: event.createdAt,
      };
      next.run.activeStage = "autopilot";
      break;
    }
    case "autopilot.route_adherence_evaluated": {
      const payload = event.payload as AutopilotRouteAdherence;
      validateAutopilotRouteAdherence(event, next, payload);
      next.autopilot.loops[payload.loopId]!.routeAdherence = payload;
      break;
    }
    case "autopilot.drift_recorded": {
      const payload = event.payload as AutopilotDriftRecord;
      validateAutopilotDrift(event, next, payload);
      next.autopilot.driftRecords[payload.driftId] = payload;
      const loop = next.autopilot.loops[payload.loopId]!;
      if (!loop.driftIds.includes(payload.driftId)) loop.driftIds.push(payload.driftId);
      break;
    }
    case "autopilot.loop_finished": {
      const payload = event.payload as AutopilotLoopFinishRecord;
      validateAutopilotLoopFinish(event, next, payload);
      const loop = next.autopilot.loops[payload.loopId]!;
      loop.status = payload.status;
      loop.finishedAt = payload.completedAt || event.createdAt;
      loop.routeAdherence = payload.routeAdherence;
      loop.nextRecommendedAction = payload.nextRecommendedAction;
      if (payload.drift && !loop.driftIds.includes(payload.drift.driftId)) {
        next.autopilot.driftRecords[payload.drift.driftId] = payload.drift;
        loop.driftIds.push(payload.drift.driftId);
      }
      next.evidence.records[`autopilot:loop:${payload.loopId}:finish`] = {
        evidenceId: `autopilot:loop:${payload.loopId}:finish`,
        kind: `autopilot.${payload.status}`,
        summary: `Autopilot loop ${payload.loopId} finished as ${payload.status}; route adherence ${payload.routeAdherence.status}.`,
        recordedAt: event.createdAt,
      };
      if (payload.status === "completed" && payload.nextStage === "verification") next.run.activeStage = "verification";
      else if (payload.status === "needs_repair") next.run.activeStage = "autopilot";
      else if (["parked", "stopped", "needs_user_action", "failed", "timed_out"].includes(payload.status)) next.run.activeStage = "locked";
      else if (payload.status === "completed") next.run.activeStage = "locked";
      break;
    }
    case "autopilot.loop_recovered": {
      const payload = event.payload as AutopilotRecoveryRecord;
      validateAutopilotRecovery(event, next, payload);
      const loop = next.autopilot.loops[payload.loopId]!;
      next.autopilot.recoveries[payload.recoveryId] = payload;
      loop.status = payload.recoveredStatus;
      if (!loop.recoveryIds.includes(payload.recoveryId)) loop.recoveryIds.push(payload.recoveryId);
      if (["parked", "stopped", "needs_user_action", "failed", "timed_out"].includes(payload.recoveredStatus)) next.run.activeStage = "locked";
      break;
    }
    case "verification.run_started": {
      const payload = event.payload as { plan: VerificationRunPlan; planPath: string };
      validateVerificationRunStart(event, next, payload);
      next.verification.plans[payload.plan.verificationRunId] = payload.plan;
      next.verification.activeRunId = payload.plan.verificationRunId;
      next.verification.runs[payload.plan.verificationRunId] = {
        verificationRunId: payload.plan.verificationRunId,
        status: "running",
        planPath: payload.planPath,
        boardRevisionRead: payload.plan.boardRevisionRead,
        boardProjectionHash: payload.plan.boardProjectionHash,
        routeSnapshotHash: payload.plan.routeSnapshotHash,
        scenarioIds: payload.plan.scenarioIds,
        expectedArtifactIds: payload.plan.expectedArtifacts.map((artifact) => artifact.artifactId),
        startedAt: event.createdAt,
      };
      for (const scenario of payload.plan.scenarios) {
        next.verification.scenarioContracts[scenario.scenarioId] = scenario;
      }
      next.evidence.records[`verification-run:${payload.plan.verificationRunId}`] = {
        evidenceId: `verification-run:${payload.plan.verificationRunId}`,
        kind: "verification.run_plan",
        path: payload.planPath,
        summary: `Verification run ${payload.plan.verificationRunId} started for ${payload.plan.scenarioIds.length} scenarios.`,
        recordedAt: event.createdAt,
      };
      break;
    }
    case "verification.result_recorded": {
      const payload = event.payload as VerificationScenarioVerdict;
      validateVerificationVerdict(event, next, payload);
      const history = next.verification.verdicts[payload.scenarioId] ?? [];
      history.push(payload);
      next.verification.verdicts[payload.scenarioId] = history;
      next.verification.latestVerdictByScenario[payload.scenarioId] = payload;
      next.artifacts.records[payload.artifactId] = {
        artifactId: payload.artifactId,
        kind: "verification.verdict",
        path: payload.artifactPath,
        status: "accepted",
        sha256: payload.artifactHash,
        evidenceIds: payload.evidenceIds,
      };
      next.evidence.records[`verification:${payload.scenarioId}`] = {
        evidenceId: `verification:${payload.scenarioId}`,
        kind: `verification.${payload.status}`,
        path: payload.artifactPath,
        summary: `${payload.status}: ${payload.residualRisk}`,
        recordedAt: event.createdAt,
      };
      break;
    }
    case "verification.run_finished": {
      const payload = event.payload as VerificationRunFinishRecord;
      validateVerificationRunFinish(event, next, payload);
      const run = next.verification.runs[payload.verificationRunId]!;
      run.status = payload.status;
      run.finishedAt = payload.finishedAt || event.createdAt;
      run.finish = payload;
      if (next.verification.activeRunId === payload.verificationRunId) delete next.verification.activeRunId;
      next.evidence.records[`verification-run:${payload.verificationRunId}:finish`] = {
        evidenceId: `verification-run:${payload.verificationRunId}:finish`,
        kind: `verification.run.${payload.status}`,
        summary: `Verification run ${payload.verificationRunId} finished with ${payload.scenarioSummary.passed.length} passed, ${payload.scenarioSummary.failed.length} failed, ${payload.scenarioSummary.blocked.length} blocked, ${payload.scenarioSummary.parked.length} parked.`,
        recordedAt: event.createdAt,
      };
      next.run.activeStage = "closeout";
      break;
    }
    case "closeout.recorded": {
      const payload = event.payload as CloseoutRecord;
      validateCloseoutRecord(event, next, payload);
      next.closeout.records[payload.closeoutId] = payload;
      next.closeout.latestCloseoutId = payload.closeoutId;
      for (const candidate of payload.memoryPromotionCandidates ?? []) {
        next.closeout.memoryPromotionCandidates[candidate.candidateId] = candidate;
      }
      next.artifacts.records[`closeout:${payload.closeoutId}`] = {
        artifactId: `closeout:${payload.closeoutId}`,
        kind: "closeout.record",
        path: payload.closeoutArtifactPath,
        status: "accepted",
        evidenceIds: payload.acceptedArtifactIds,
      };
      next.evidence.records[`closeout:${payload.closeoutId}`] = {
        evidenceId: `closeout:${payload.closeoutId}`,
        kind: `closeout.${payload.status}`,
        path: payload.closeoutArtifactPath,
        summary: `Closeout ${payload.closeoutId} recorded as ${payload.status}.`,
        recordedAt: event.createdAt,
      };
      if (payload.status === "completed") next.run.activeStage = "closed";
      break;
    }
    default:
      throw schemaError(event, `Unhandled event type ${event.type}.`);
  }

  return next;
}

function rejectLockedRouteMutation(manifest: HelmsmanManifest, event: ManifestEvent): void {
  if (manifest.run.routeLock.status !== "locked") return;
  if (event.type.startsWith("amendment.") || event.type.startsWith("route_lock.")) return;
  const effects = routeEffectsFromEvent(event);
  if (effects.some((effect) => ROUTE_CHANGING_EFFECTS.has(effect.kind))) {
    throw new CoreError({
      code: "AMENDMENT_REQUIRED",
      message: "Route-changing events after Route Lock require an amendment path.",
      eventId: event.eventId,
      sequence: event.sequence,
    });
  }
}

function routeEffectsFromEvent(event: ManifestEvent): RouteEffect[] {
  const payload = event.payload as { appliedRouteEffects?: RouteEffect[]; routeEffects?: RouteEffect[] };
  return payload.appliedRouteEffects ?? payload.routeEffects ?? [];
}

function applyRouteEffects(manifest: HelmsmanManifest, effects: RouteEffect[], event: ManifestEvent, evidenceIds: string[]): void {
  for (const effect of effects) {
    switch (effect.kind) {
      case "route.scope.add":
        manifest.route.scope.push(assertion(event, effect.id, effect.text, evidenceIds));
        break;
      case "route.scope.remove":
        manifest.route.scope = manifest.route.scope.filter((item) => item.id !== effect.targetId);
        break;
      case "route.non_goal.add":
        manifest.route.nonGoals.push(assertion(event, effect.id, effect.text, evidenceIds));
        break;
      case "route.assumption.add":
        manifest.route.assumptions.push(assertion(event, effect.id, effect.text, evidenceIds));
        break;
      case "route.risk.add":
        manifest.route.risks.push({ ...assertion(event, effect.id, effect.text, evidenceIds), severity: effect.severity, mitigation: effect.mitigation });
        break;
      case "route.stop_condition.add":
        manifest.route.stopConditions.push(assertion(event, effect.id, effect.text, evidenceIds));
        break;
      case "route.success_criterion.add":
        manifest.route.successCriteria.push(assertion(event, effect.id, effect.text, evidenceIds));
        break;
      case "route.verification_scenario.add":
        manifest.route.verificationScenarios.push(effect.scenario);
        break;
      case "route.verification_scenario.remove":
        manifest.route.verificationScenarios = manifest.route.verificationScenarios.filter((scenario) => scenario.scenarioId !== effect.scenarioId);
        break;
      case "route.autonomy_boundary.set":
        manifest.route.autonomyBoundary = { ...manifest.route.autonomyBoundary, ...effect.boundary };
        break;
      case "gate.block":
        manifest.gates[effect.gateId] = {
          status: "blocked",
          hardBlockers: [effect.blockerId],
          softWarnings: [],
          requiredEvidenceIds: [],
          lastEvaluatedByEventId: event.eventId,
        };
        break;
      case "gate.unblock":
        manifest.gates[effect.gateId] = {
          status: "ready",
          hardBlockers: [],
          softWarnings: [],
          requiredEvidenceIds: [],
          lastEvaluatedByEventId: event.eventId,
        };
        break;
      case "research.lane.request":
        break;
    }
  }
}

function validateRouteLockProposal(event: ManifestEvent, manifest: HelmsmanManifest, proposal: RouteLockProposal): void {
  if (proposal.schemaVersion !== "helmsman.route-lock-proposal.v1") throw schemaError(event, "Route Lock proposal schemaVersion is invalid.");
  if (manifest.run.activeStage !== "lock_ready") throw gateBlocked(event, "Route Lock proposal requires lock_ready stage.");
  if (proposal.runId !== manifest.run.id || proposal.runId !== event.runId) throw schemaError(event, "Route Lock proposal runId must match the manifest run.");
  if (!nonEmpty(proposal.proposalId) || !nonEmpty(proposal.snapshotPath) || !nonEmpty(proposal.snapshotHash) || !nonEmpty(proposal.renderedPath)) {
    throw schemaError(event, "Route Lock proposal requires proposalId, snapshotPath, snapshotHash, and renderedPath.");
  }
  validateRelativePath(event, proposal.snapshotPath, "route-lock");
  validateRelativePath(event, proposal.renderedPath, "route-lock");
  if (proposal.boardRevisionRead !== event.causality.boardRevisionRead) throw staleBoard(event, "Route Lock proposal boardRevisionRead must match command boardRevisionRead.");
  if (proposal.eventSequenceRead !== event.causality.boardRevisionRead) throw staleBoard(event, "Route Lock proposal eventSequenceRead must match the Board revision read.");
  if (proposal.requiredUserConfirmation !== true) throw schemaError(event, "Route Lock proposal must require user confirmation.");
  if (!proposal.readiness || proposal.readiness.schemaVersion !== "helmsman.route-lock-readiness.v1") throw schemaError(event, "Route Lock proposal requires readiness evidence.");
  if (proposal.readiness.status !== "lock_ready" || proposal.readiness.hardBlockers.length > 0) {
    throw gateBlocked(event, "Route Lock proposal is blocked by readiness hard blockers.", proposal.readiness.hardBlockers.map((blocker) => blocker.blockerId));
  }
  if (proposal.readiness.boardRevisionRead !== proposal.boardRevisionRead || proposal.readiness.eventSequenceRead !== proposal.eventSequenceRead) {
    throw staleBoard(event, "Route Lock readiness must be evaluated against the proposal Board revision.");
  }
  if (proposal.readiness.routeSnapshotHash !== proposal.snapshotHash) throw schemaError(event, "Route Lock readiness hash must match proposal snapshotHash.");
  const blockers = hardRouteLockBlockers(manifest);
  if (blockers.length > 0) throw gateBlocked(event, `Route Lock proposal has unresolved blockers: ${blockers.join(", ")}.`, blockers);
}

function validateRouteLockConfirmation(
  event: ManifestEvent,
  manifest: HelmsmanManifest,
  payload: {
    proposalId: string;
    confirmedBy: "user";
    confirmedSurfaceEvidenceId: string;
    snapshotPath: string;
    snapshotHash: string;
    confirmationEvidence?: RouteLockConfirmationEvidence;
  },
): void {
  if (manifest.run.routeLock.status !== "lock_ready") throw schemaError(event, "Route Lock confirmation requires an active proposal.");
  if (payload.confirmedBy !== "user" || event.actor.kind !== "user") throw new CoreError({ code: "EVENT_ACTOR_UNAUTHORIZED", message: "Initial Route Lock requires user confirmation.", eventId: event.eventId, sequence: event.sequence });
  if (payload.proposalId !== manifest.run.routeLock.proposalId) throw schemaError(event, "Route Lock confirmation must reference the active proposal.");
  if (payload.snapshotPath !== manifest.run.routeLock.snapshotPath || payload.snapshotHash !== manifest.run.routeLock.snapshotHash) {
    throw schemaError(event, "Route Lock confirmation must match the proposed snapshot path and hash.");
  }
  if (!nonEmpty(payload.confirmedSurfaceEvidenceId)) throw schemaError(event, "Route Lock confirmation requires visible confirmation evidence.");
  const evidence = payload.confirmationEvidence;
  if (!evidence) throw schemaError(event, "Route Lock confirmation requires confirmationEvidence payload.");
  if (evidence.schemaVersion !== "helmsman.route-lock-confirmation-evidence.v1") throw schemaError(event, "Route Lock confirmation evidence schemaVersion is invalid.");
  if (evidence.evidenceId !== payload.confirmedSurfaceEvidenceId) throw schemaError(event, "Route Lock confirmation evidence id must match confirmedSurfaceEvidenceId.");
  if (evidence.runId !== manifest.run.id || evidence.proposalId !== payload.proposalId) throw schemaError(event, "Route Lock confirmation evidence references the wrong run or proposal.");
  if (evidence.userAction !== "confirmed") throw schemaError(event, "Route Lock confirmation evidence must record userAction confirmed.");
  if (evidence.visibleSnapshotHash !== payload.snapshotHash || evidence.snapshotHash !== payload.snapshotHash || evidence.snapshotPath !== payload.snapshotPath) {
    throw schemaError(event, "Route Lock confirmation evidence must display the proposed snapshot hash.");
  }
}

function validateRouteLockInvalidation(event: ManifestEvent, manifest: HelmsmanManifest, payload: RouteLockInvalidationRecord): void {
  if (manifest.run.routeLock.status !== "locked") throw schemaError(event, "Route Lock invalidation requires a locked route.");
  if (payload.previousSnapshotHash !== manifest.run.routeLock.snapshotHash) throw schemaError(event, "Route Lock invalidation previousSnapshotHash must match the locked snapshot.");
  if (!nonEmpty(payload.reason) || !["warning", "hard"].includes(payload.severity) || !["ask", "amend", "unlock", "park", "stop"].includes(payload.requiredResponse)) {
    throw schemaError(event, "Route Lock invalidation requires reason, severity, and requiredResponse.");
  }
  if (!Array.isArray(payload.evidenceIds)) throw schemaError(event, "Route Lock invalidation requires evidenceIds.");
}

function validateRouteAmendmentProposal(event: ManifestEvent, manifest: HelmsmanManifest, payload: { amendment: RouteAmendment; renderedPath: string }): void {
  const amendment = payload.amendment;
  if (manifest.run.routeLock.status !== "locked" && manifest.run.routeLock.status !== "invalidated") throw schemaError(event, "Route amendments require a locked or invalidated route.");
  if (amendment.schemaVersion !== "helmsman.route-amendment.v1") throw schemaError(event, "Route amendment schemaVersion is invalid.");
  if (!nonEmpty(amendment.amendmentId) || !nonEmpty(amendment.reason) || !Array.isArray(amendment.routeEffects)) throw schemaError(event, "Route amendment requires id, reason, and routeEffects.");
  if (amendment.proposedBy !== event.actor.kind) throw schemaError(event, "Route amendment proposedBy must match event actor.");
  if (amendment.previousSnapshotHash !== manifest.run.routeLock.snapshotHash) throw schemaError(event, "Route amendment previousSnapshotHash must match the current locked snapshot.");
  validateRelativePath(event, payload.renderedPath, "route-lock/amendments");
  if (!Array.isArray(amendment.evidenceIds)) throw schemaError(event, "Route amendment evidenceIds must be an array.");
  const requiresUser = amendment.routeEffects.some((effect) => effect.kind === "route.autonomy_boundary.set" || effect.kind === "route.verification_scenario.remove");
  if (requiresUser && amendment.requiresUserConfirmation !== true) {
    throw schemaError(event, "Autonomy boundary changes and verification scenario removal require user confirmation.");
  }
}

function validateRouteAmendmentApplication(event: ManifestEvent, manifest: HelmsmanManifest, amendment: RouteAmendment, application: RouteAmendmentApplication): void {
  if (application.appliedBy !== event.actor.kind) throw schemaError(event, "Route amendment appliedBy must match event actor.");
  if (application.previousSnapshotHash !== amendment.previousSnapshotHash || application.previousSnapshotHash !== manifest.run.routeLock.snapshotHash) {
    throw schemaError(event, "Route amendment application previousSnapshotHash must match the locked snapshot.");
  }
  if (amendment.requiresUserConfirmation && (event.actor.kind !== "user" || !nonEmpty(application.confirmationEvidenceId))) {
    throw new CoreError({ code: "EVENT_ACTOR_UNAUTHORIZED", message: "This route amendment requires user confirmation.", eventId: event.eventId, sequence: event.sequence });
  }
  if (!nonEmpty(application.newSnapshotPath) || !nonEmpty(application.newSnapshotHash)) throw schemaError(event, "Route amendment application requires a new snapshot path and hash.");
  validateRelativePath(event, application.newSnapshotPath, "route-lock");
}

function hardRouteLockBlockers(manifest: HelmsmanManifest): string[] {
  const blockers: string[] = [];
  if (manifest.questions.openQuestionIds.length > 0) blockers.push(...manifest.questions.openQuestionIds.map((id) => `OPEN_ROUTE_QUESTION:${id}`));
  for (const answer of Object.values(manifest.questions.answers)) {
    if (!manifest.questions.surfaces[answer.surfaceId] || !manifest.evidence.records[answer.surfaceId]) blockers.push(`QUESTION_SURFACE_MISSING:${answer.surfaceId}`);
  }
  if (Object.keys(manifest.memory.scans).length === 0) blockers.push("MEMORY_SCAN_MISSING");
  for (const lane of Object.values(manifest.research.lanes)) {
    if (!["accepted", "dropped"].includes(lane.status)) blockers.push(`RESEARCH_LANE_OPEN:${lane.laneId}`);
    if (lane.status === "accepted" && !Object.values(manifest.artifacts.records).some((artifact) => artifact.path === lane.expectedArtifactPath && artifact.status === "accepted")) {
      blockers.push(`ARTIFACT_NOT_ACCEPTED:${lane.laneId}`);
    }
  }
  if (manifest.route.verificationScenarios.length === 0) blockers.push("VERIFICATION_SCENARIOS_MISSING");
  for (const [gateId, gate] of Object.entries(manifest.gates)) {
    if (gate.hardBlockers.length > 0) blockers.push(`GATE_BLOCKED:${gateId}`);
  }
  return blockers;
}

const AUTOPILOT_LOOP_STATUSES = new Set<AutopilotLoopStatus>(["planned", "running", "completed", "needs_repair", "needs_user_action", "parked", "stopped", "failed", "timed_out"]);
const AUTOPILOT_DRIFT_CLASSES = new Set(["minor_drift", "route_changing_drift", "critical_drift", "missing_evidence", "forbidden_authority_claim"]);
const AUTOPILOT_DRIFT_RESPONSES = new Set(["continue", "repair", "ask", "amend", "invalidate", "park", "stop"]);
const AUTOPILOT_TERMINAL_STATUSES = new Set<AutopilotLoopStatus>(["completed", "parked", "stopped", "failed", "timed_out", "needs_user_action"]);
const VERIFICATION_VERDICTS = new Set<VerificationVerdictStatus>(["passed", "failed", "blocked", "parked"]);
const VERIFICATION_EVIDENCE_KINDS = new Set(["command_output", "test_result", "role_run", "artifact", "tui_capture", "live_provider", "manual_observation", "replay_hash", "audit_report"]);
const VERIFICATION_FORBIDDEN_CLAIMS = ["route lock", "route amendment", "closeout", "product readiness", "scenario deletion", "execution success as verdict"];

function validateAutopilotActionSelection(event: ManifestEvent, manifest: HelmsmanManifest, selection: AutopilotActionSelection): void {
  if (manifest.run.routeLock.status !== "locked") throw new CoreError({ code: "ROUTE_LOCK_REQUIRED", message: "Autopilot requires a locked route.", eventId: event.eventId, sequence: event.sequence });
  if (!manifest.run.routeLock.snapshotHash || !manifest.run.routeLock.snapshotPath || !manifest.run.routeLock.lockEventId) {
    throw schemaError(event, "Autopilot requires locked snapshot hash, path, and lock event id.");
  }
  if (!nonEmpty(selection.loopId) || !nonEmpty(selection.boardProjectionHash) || !nonEmpty(selection.idempotencyKey)) {
    throw schemaError(event, "Autopilot action selection requires loopId, boardProjectionHash, and idempotencyKey.");
  }
  if (selection.boardRevisionRead !== event.causality.boardRevisionRead) throw staleBoard(event, "Autopilot selection must record the Board revision read by Core.");
  if (selection.selectedAction?.kind !== "run_autopilot_loop") throw gateBlocked(event, "Autopilot may select only Board.nextLegalAction=run_autopilot_loop.");
  if (selection.selectedAction.requiredBoardRevision !== selection.boardRevisionRead) throw staleBoard(event, "Selected Autopilot action must require the Board revision read.");
  if (selection.routeLockEventId !== manifest.run.routeLock.lockEventId || selection.lockedSnapshotHash !== manifest.run.routeLock.snapshotHash) {
    throw schemaError(event, "Autopilot selection must reference the active Route Lock event and snapshot hash.");
  }
  if (Object.keys(manifest.amendments.pending).length > 0) throw gateBlocked(event, "Autopilot cannot start while route amendments are pending.", Object.keys(manifest.amendments.pending));
  for (const loop of Object.values(manifest.autopilot.loops)) {
    if (!AUTOPILOT_TERMINAL_STATUSES.has(loop.status) && loop.status !== "needs_repair") {
      throw new CoreError({ code: "COMMAND_PRECONDITION_FAILED", message: `Autopilot loop ${loop.loopId} is already ${loop.status}.`, eventId: event.eventId, sequence: event.sequence });
    }
  }
  if (Object.values(manifest.autopilot.actionSelections).some((existing) => existing.idempotencyKey === selection.idempotencyKey)) {
    throw new CoreError({ code: "COMMAND_PRECONDITION_FAILED", message: "Duplicate Autopilot idempotency key.", eventId: event.eventId, sequence: event.sequence });
  }
}

function validateAutopilotPacket(event: ManifestEvent, manifest: HelmsmanManifest, packet: AutopilotPacket): void {
  if (packet.schemaVersion !== "helmsman.autopilot-packet.v1") throw schemaError(event, "Autopilot packet schemaVersion is invalid.");
  const selection = manifest.autopilot.actionSelections[packet.loopId];
  if (!selection) throw schemaError(event, `Autopilot packet references unknown loop selection ${packet.loopId}.`);
  if (packet.runId !== manifest.run.id || packet.runId !== event.runId) throw schemaError(event, "Autopilot packet runId must match the manifest run.");
  if (!nonEmpty(packet.packetId) || !nonEmpty(packet.operationId) || !nonEmpty(packet.roleId) || !nonEmpty(packet.mission)) {
    throw schemaError(event, "Autopilot packet requires packetId, operationId, roleId, and mission.");
  }
  if (packet.boardRevisionRead !== event.causality.boardRevisionRead || packet.boardRevisionRead !== selection.boardRevisionRead) {
    throw staleBoard(event, "Autopilot packet must record the selected Board revision.");
  }
  if (packet.boardProjectionHash !== selection.boardProjectionHash) throw schemaError(event, "Autopilot packet Board hash must match the selected action.");
  if (packet.lockedSnapshotHash !== manifest.run.routeLock.snapshotHash || packet.lockedSnapshotPath !== manifest.run.routeLock.snapshotPath) {
    throw schemaError(event, "Autopilot packet must reference the active locked snapshot path and hash.");
  }
  if (packet.boardExcerpt?.nextLegalAction?.kind !== "run_autopilot_loop") throw schemaError(event, "Autopilot packet must include the selected Board next legal action.");
  if (!Array.isArray(packet.allowedReadRoots) || !Array.isArray(packet.allowedWriteRoots)) throw schemaError(event, "Autopilot packet requires read and write roots.");
  if (!Array.isArray(packet.requiredArtifacts) || !Array.isArray(packet.stopConditions) || !Array.isArray(packet.forbiddenAuthorityClaims)) {
    throw schemaError(event, "Autopilot packet requires artifacts, stop conditions, and forbidden authority claims.");
  }
  validateRelativePath(event, packet.evidenceCapturePath, "autopilot");
  for (const artifact of packet.requiredArtifacts) validateRelativePath(event, artifact.expectedPath, "autopilot");
  if (packet.retryPolicy?.idempotencyKey !== selection.idempotencyKey || packet.resumePolicy?.resumeFromPlan !== true || packet.resumePolicy.duplicateExecution !== "reject") {
    throw schemaError(event, "Autopilot packet must preserve idempotency and duplicate-execution rejection policy.");
  }
  const packetWriteRoots = packet.allowedWriteRoots.filter(nonEmpty);
  if (packetWriteRoots.length > 0) {
    for (const existing of Object.values(manifest.autopilot.packets)) {
      const existingLoop = manifest.autopilot.loops[existing.loopId];
      if (existingLoop && AUTOPILOT_TERMINAL_STATUSES.has(existingLoop.status)) continue;
      if (writeRootsConflict(packetWriteRoots, existing.allowedWriteRoots)) {
        throw new CoreError({ code: "COMMAND_PRECONDITION_FAILED", message: `Autopilot packet write roots conflict with ${existing.packetId}.`, eventId: event.eventId, sequence: event.sequence });
      }
    }
  }
}

function validateAutopilotLoopPlan(
  event: ManifestEvent,
  manifest: HelmsmanManifest,
  payload: { plan: AutopilotLoopPlan; planPath: string; packetIds: string[]; packetPaths: string[]; roleRunIds?: string[] },
): void {
  const plan = payload.plan;
  const selection = manifest.autopilot.actionSelections[plan.loopId];
  if (!selection) throw schemaError(event, `Autopilot loop plan references unknown selection ${plan.loopId}.`);
  if (manifest.autopilot.loops[plan.loopId] && !AUTOPILOT_TERMINAL_STATUSES.has(manifest.autopilot.loops[plan.loopId]!.status)) {
    throw new CoreError({ code: "COMMAND_PRECONDITION_FAILED", message: `Autopilot loop ${plan.loopId} already exists.`, eventId: event.eventId, sequence: event.sequence });
  }
  if (plan.schemaVersion !== "helmsman.autopilot-loop-plan.v1") throw schemaError(event, "Autopilot loop plan schemaVersion is invalid.");
  if (plan.runId !== manifest.run.id || plan.runId !== event.runId) throw schemaError(event, "Autopilot loop plan runId must match the manifest run.");
  if (plan.boardRevisionRead !== event.causality.boardRevisionRead || plan.boardRevisionRead !== selection.boardRevisionRead) {
    throw staleBoard(event, "Autopilot loop plan must record the selected Board revision.");
  }
  if (plan.boardProjectionHash !== selection.boardProjectionHash || plan.idempotencyKey !== selection.idempotencyKey) {
    throw schemaError(event, "Autopilot loop plan must match the selected Board hash and idempotency key.");
  }
  if (plan.routeLockEventId !== manifest.run.routeLock.lockEventId || plan.lockedSnapshotHash !== manifest.run.routeLock.snapshotHash || plan.lockedSnapshotPath !== manifest.run.routeLock.snapshotPath) {
    throw schemaError(event, "Autopilot loop plan must reference the active locked route snapshot.");
  }
  if (plan.nextLegalAction.kind !== "run_autopilot_loop") throw gateBlocked(event, "Autopilot loop plan may only launch the Board-selected Autopilot action.");
  if (!Array.isArray(payload.packetIds) || payload.packetIds.length === 0) throw schemaError(event, "Autopilot loop requires at least one prepared packet.");
  if (payload.packetIds.length > plan.maxRoleRuns) throw gateBlocked(event, "Autopilot packet count exceeds maxRoleRuns.");
  for (const packetId of payload.packetIds) {
    const packet = manifest.autopilot.packets[packetId];
    if (!packet || packet.loopId !== plan.loopId) throw schemaError(event, `Autopilot loop references missing packet ${packetId}.`);
  }
  validateRelativePath(event, payload.planPath, "autopilot");
  if (JSON.stringify(plan.packetPaths) !== JSON.stringify(payload.packetPaths)) throw schemaError(event, "Autopilot plan packet paths must match the loop start payload.");
  if (plan.maxRoleRuns < 1 || plan.maxRepairPasses < 0 || plan.maxAuditPasses < 0 || plan.timeoutMs < 1) throw schemaError(event, "Autopilot loop plan has invalid bounds.");
}

function validateAutopilotRouteAdherence(event: ManifestEvent, manifest: HelmsmanManifest, routeAdherence: AutopilotRouteAdherence): void {
  const loop = manifest.autopilot.loops[routeAdherence.loopId];
  if (!loop) throw schemaError(event, `Route adherence references unknown Autopilot loop ${routeAdherence.loopId}.`);
  if (loop.status !== "running" && loop.status !== "needs_repair") throw schemaError(event, "Route adherence can only be evaluated for a running or repair loop.");
  if (routeAdherence.status !== "adherent" && !AUTOPILOT_DRIFT_CLASSES.has(routeAdherence.status)) throw schemaError(event, "Autopilot route adherence status is invalid.");
  if (!AUTOPILOT_DRIFT_RESPONSES.has(routeAdherence.requiredResponse)) throw schemaError(event, "Autopilot route adherence requiredResponse is invalid.");
  if (routeAdherence.status === "adherent" && routeAdherence.requiredResponse !== "continue") throw schemaError(event, "Adherent Autopilot loops must continue or move to verification.");
  validateDriftResponse(event, routeAdherence.status, routeAdherence.requiredResponse);
}

function validateAutopilotDrift(event: ManifestEvent, manifest: HelmsmanManifest, drift: AutopilotDriftRecord): void {
  const loop = manifest.autopilot.loops[drift.loopId];
  if (!loop) throw schemaError(event, `Drift references unknown Autopilot loop ${drift.loopId}.`);
  if (!loop.routeAdherence) throw schemaError(event, "Drift must follow route-adherence evaluation.");
  if (!AUTOPILOT_DRIFT_CLASSES.has(drift.class)) throw schemaError(event, "Autopilot drift class is invalid.");
  if (!AUTOPILOT_DRIFT_RESPONSES.has(drift.requiredResponse)) throw schemaError(event, "Autopilot drift requires a valid non-continue response.");
  if (loop.routeAdherence.status !== drift.class) throw schemaError(event, "Autopilot drift class must match route-adherence status.");
  validateDriftResponse(event, drift.class, drift.requiredResponse);
}

function validateAutopilotLoopFinish(event: ManifestEvent, manifest: HelmsmanManifest, finish: AutopilotLoopFinishRecord): void {
  const loop = manifest.autopilot.loops[finish.loopId];
  if (!loop) throw schemaError(event, `Finish references unknown Autopilot loop ${finish.loopId}.`);
  if (!AUTOPILOT_LOOP_STATUSES.has(finish.status)) throw schemaError(event, "Autopilot finish status is invalid.");
  if (!loop.routeAdherence) throw schemaError(event, "Autopilot finish requires route-adherence evaluation.");
  if (JSON.stringify(finish.routeAdherence) !== JSON.stringify(loop.routeAdherence)) throw schemaError(event, "Autopilot finish routeAdherence must match the evaluated adherence record.");
  if (!Array.isArray(finish.evidenceIds)) throw schemaError(event, "Autopilot finish requires evidenceIds.");
  validateDriftResponse(event, finish.routeAdherence.status, finish.routeAdherence.requiredResponse);
  if (finish.status === "completed" && finish.routeAdherence.status !== "adherent") {
    throw new CoreError({ code: "FINAL_MESSAGE_NOT_COMPLETION", message: "Non-adherent Autopilot loops cannot finish as completed.", eventId: event.eventId, sequence: event.sequence });
  }
  if (finish.status === "needs_repair" && finish.routeAdherence.requiredResponse !== "repair") throw schemaError(event, "needs_repair status requires repair response.");
  if (finish.status === "needs_user_action" && !["ask", "amend"].includes(finish.routeAdherence.requiredResponse)) throw schemaError(event, "needs_user_action status requires ask or amend response.");
  if (finish.status === "parked" && finish.routeAdherence.requiredResponse !== "park") throw schemaError(event, "parked status requires park response.");
  if (finish.status === "stopped" && finish.routeAdherence.requiredResponse !== "stop") throw schemaError(event, "stopped status requires stop response.");
  if (finish.nextStage && finish.nextStage !== "verification" && finish.nextStage !== "locked" && finish.nextStage !== "autopilot") throw schemaError(event, "Autopilot may only recommend locked, autopilot, or verification nextStage.");
}

function validateAutopilotRecovery(event: ManifestEvent, manifest: HelmsmanManifest, recovery: AutopilotRecoveryRecord): void {
  const loop = manifest.autopilot.loops[recovery.loopId];
  if (!loop) throw schemaError(event, `Recovery references unknown Autopilot loop ${recovery.loopId}.`);
  if (recovery.previousStatus !== loop.status) throw schemaError(event, "Autopilot recovery previousStatus must match the loop status.");
  if (!AUTOPILOT_LOOP_STATUSES.has(recovery.recoveredStatus)) throw schemaError(event, "Autopilot recovery status is invalid.");
  if (!nonEmpty(recovery.recoveryId) || !nonEmpty(recovery.reason) || !Array.isArray(recovery.evidenceIds)) throw schemaError(event, "Autopilot recovery requires recoveryId, reason, and evidenceIds.");
}

function validateVerificationRunStart(event: ManifestEvent, manifest: HelmsmanManifest, payload: { plan: VerificationRunPlan; planPath: string }): void {
  const plan = payload.plan;
  if (manifest.run.activeStage !== "verification") throw schemaError(event, "Verification run start requires the verification stage.");
  if (manifest.run.routeLock.status !== "locked") throw new CoreError({ code: "ROUTE_LOCK_REQUIRED", message: "Verification requires a locked route.", eventId: event.eventId, sequence: event.sequence });
  if (!manifest.run.routeLock.snapshotHash) throw schemaError(event, "Verification requires a locked route snapshot hash.");
  if (Object.keys(manifest.amendments.pending).length > 0) throw gateBlocked(event, "Verification cannot start while route amendments are pending.", Object.keys(manifest.amendments.pending));
  if (manifest.verification.activeRunId) throw gateBlocked(event, `Verification run ${manifest.verification.activeRunId} is already active.`);
  const activeAutopilot = Object.values(manifest.autopilot.loops).find((loop) => loop.status === "planned" || loop.status === "running" || loop.status === "needs_repair");
  if (activeAutopilot) throw gateBlocked(event, `Verification cannot start while Autopilot loop ${activeAutopilot.loopId} is ${activeAutopilot.status}.`);
  if (plan.schemaVersion !== "helmsman.verification-run-plan.v1") throw schemaError(event, "Verification run plan schemaVersion is invalid.");
  if (plan.runId !== manifest.run.id || plan.runId !== event.runId) throw schemaError(event, "Verification run plan runId must match the manifest run.");
  if (!nonEmpty(plan.verificationRunId) || !nonEmpty(payload.planPath) || !nonEmpty(plan.boardProjectionHash)) throw schemaError(event, "Verification run plan requires id, path, and Board projection hash.");
  validateRelativePath(event, payload.planPath, "verification");
  if (plan.boardRevisionRead !== event.causality.boardRevisionRead) throw staleBoard(event, "Verification run plan must record the Board revision read.");
  if (plan.routeSnapshotHash !== manifest.run.routeLock.snapshotHash) throw schemaError(event, "Verification run plan route snapshot hash must match the locked route.");
  if (!Array.isArray(plan.scenarioIds) || plan.scenarioIds.length === 0) throw schemaError(event, "Verification run plan requires scenario ids.");
  const routeScenarioIds = new Set(manifest.route.verificationScenarios.map((scenario) => scenario.scenarioId));
  const planScenarioIds = new Set(plan.scenarioIds);
  if (planScenarioIds.size !== plan.scenarioIds.length) throw schemaError(event, "Verification run scenario ids must be unique.");
  for (const scenarioId of routeScenarioIds) {
    if (!planScenarioIds.has(scenarioId)) throw schemaError(event, `Verification run plan omits route scenario ${scenarioId}.`);
  }
  if (plan.scenarios.length !== plan.scenarioIds.length) throw schemaError(event, "Verification run plan must include a scenario contract for every scenario id.");
  for (const scenario of plan.scenarios) validateVerificationScenarioContract(event, manifest, scenario);
  if (!Array.isArray(plan.expectedArtifacts) || plan.expectedArtifacts.length !== plan.scenarioIds.length) throw schemaError(event, "Verification run plan requires one expected artifact per scenario.");
  for (const artifact of plan.expectedArtifacts) validateRelativePath(event, artifact.expectedPath, "verification");
  if (!Array.isArray(plan.allowedReadScope) || plan.allowedReadScope.length === 0 || !Array.isArray(plan.allowedWriteScope) || plan.allowedWriteScope.length === 0) {
    throw schemaError(event, "Verification run plan requires read and write scopes.");
  }
  for (const writePath of plan.allowedWriteScope) validateRelativePath(event, writePath, "verification");
  const forbidden = plan.forbiddenClaims.join("\n").toLowerCase();
  for (const required of VERIFICATION_FORBIDDEN_CLAIMS) {
    if (!forbidden.includes(required)) throw schemaError(event, `Verification run plan must forbid ${required}.`);
  }
  if (plan.timeoutMs < 1) throw schemaError(event, "Verification run timeout must be positive.");
}

function validateVerificationScenarioContract(event: ManifestEvent, manifest: HelmsmanManifest, scenario: VerificationScenarioContract): void {
  if (scenario.schemaVersion !== "helmsman.verification-scenario.v1") throw schemaError(event, "Verification scenario contract schemaVersion is invalid.");
  if (scenario.runId !== manifest.run.id || scenario.runId !== event.runId) throw schemaError(event, "Verification scenario contract runId must match the manifest run.");
  const routeScenario = manifest.route.verificationScenarios.find((candidate) => candidate.scenarioId === scenario.scenarioId);
  if (!routeScenario) throw schemaError(event, `Verification scenario ${scenario.scenarioId} is not declared on the locked route.`);
  if (routeScenario.title !== scenario.title) throw schemaError(event, "Verification scenario title must match the locked route scenario.");
  if (!manifest.roles.bindings[scenario.verifierRoleId]) throw schemaError(event, `Verifier role binding ${scenario.verifierRoleId} is missing.`);
  if (!nonEmpty(scenario.expectedArtifactPath)) throw schemaError(event, "Verification scenario requires expectedArtifactPath.");
  validateRelativePath(event, scenario.expectedArtifactPath, "verification");
  if (!Array.isArray(scenario.requiredEvidenceKinds) || scenario.requiredEvidenceKinds.length === 0) throw schemaError(event, "Verification scenario requires evidence kinds.");
  for (const kind of scenario.requiredEvidenceKinds) {
    if (!VERIFICATION_EVIDENCE_KINDS.has(kind)) throw schemaError(event, `Verification evidence kind ${kind} is invalid.`);
  }
  if (!Array.isArray(scenario.passCriteria) || scenario.passCriteria.length === 0) throw schemaError(event, "Verification scenario requires pass criteria.");
  if (!Array.isArray(scenario.failCriteria) || scenario.failCriteria.length === 0) throw schemaError(event, "Verification scenario requires fail criteria.");
  if (!Array.isArray(scenario.blockedCriteria) || scenario.blockedCriteria.length === 0) throw schemaError(event, "Verification scenario requires blocked criteria.");
  if (scenario.hardFloor !== true) throw schemaError(event, "Current locked route scenarios are hard-floor verification requirements.");
}

function validateVerificationVerdict(event: ManifestEvent, manifest: HelmsmanManifest, verdict: VerificationScenarioVerdict): void {
  if (verdict.schemaVersion !== "helmsman.verification-verdict.v1") throw schemaError(event, "Verification verdict schemaVersion is invalid.");
  if (verdict.runId !== manifest.run.id || verdict.runId !== event.runId) throw schemaError(event, "Verification verdict runId must match the manifest run.");
  if (!VERIFICATION_VERDICTS.has(verdict.status)) throw schemaError(event, "Verification verdict status is invalid.");
  const run = manifest.verification.runs[verdict.verificationRunId];
  const plan = manifest.verification.plans[verdict.verificationRunId];
  if (!run || !plan) throw schemaError(event, `Verification verdict references unknown run ${verdict.verificationRunId}.`);
  if (run.status !== "running") throw schemaError(event, "Verification verdicts can only be recorded against a running verification run.");
  const scenario = manifest.verification.scenarioContracts[verdict.scenarioId];
  if (!scenario || scenario.verifierRoleId !== verdict.verifierRoleId) throw schemaError(event, "Verification verdict references an unknown scenario contract or verifier role.");
  if (verdict.boardRevisionRead !== event.causality.boardRevisionRead || verdict.boardRevisionRead < run.boardRevisionRead) throw staleBoard(event, "Verification verdict must record a fresh Board revision read by Core.");
  if (verdict.boardProjectionHash !== run.boardProjectionHash) throw schemaError(event, "Verification verdict Board hash must match the verification run plan.");
  if (verdict.routeSnapshotHash !== run.routeSnapshotHash || verdict.routeSnapshotHash !== manifest.run.routeLock.snapshotHash) throw schemaError(event, "Verification verdict route snapshot hash must match the locked route.");
  if (verdict.artifactPath !== scenario.expectedArtifactPath) throw schemaError(event, "Verification verdict artifactPath must match the scenario contract.");
  validateRelativePath(event, verdict.artifactPath, "verification");
  if (!nonEmpty(verdict.verdictId) || !nonEmpty(verdict.artifactId) || verdict.attempt < 1) throw schemaError(event, "Verification verdict requires verdictId, artifactId, and positive attempt.");
  const history = manifest.verification.verdicts[verdict.scenarioId] ?? [];
  if (history.some((existing) => existing.attempt === verdict.attempt || existing.verdictId === verdict.verdictId)) {
    throw new CoreError({ code: "COMMAND_PRECONDITION_FAILED", message: "Duplicate verification scenario attempt or verdict id.", eventId: event.eventId, sequence: event.sequence });
  }
  if (!Array.isArray(verdict.evidenceIds) || verdict.evidenceIds.length === 0) throw schemaError(event, "Verification verdict requires evidence ids.");
  if (!Array.isArray(verdict.evidenceKinds) || verdict.evidenceKinds.length === 0) throw schemaError(event, "Verification verdict requires evidence kinds.");
  for (const required of scenario.requiredEvidenceKinds) {
    if (!verdict.evidenceKinds.includes(required)) throw schemaError(event, `Verification verdict is missing evidence kind ${required}.`);
  }
  if (!Array.isArray(verdict.observations) || verdict.observations.length === 0 || verdict.observations.some((item) => !nonEmpty(item))) {
    throw schemaError(event, "Verification verdict requires explicit observations.");
  }
  if (!nonEmpty(verdict.residualRisk)) throw schemaError(event, "Verification verdict requires residual risk.");
  if (genericOrPlaceholder([verdict.residualRisk, ...verdict.observations, ...verdict.criteriaSatisfied, ...verdict.criteriaFailed, ...verdict.criteriaBlocked].join("\n"))) {
    throw schemaError(event, "Verification verdict cannot rely on placeholder text or generic tests-passed prose.");
  }
  if (verdict.status === "passed") {
    if (!scenario.passCriteria.every((criterion) => verdict.criteriaSatisfied.includes(criterion))) throw schemaError(event, "PASS verdict must satisfy every declared pass criterion.");
    if (verdict.criteriaFailed.length > 0 || verdict.criteriaBlocked.length > 0) throw schemaError(event, "PASS verdict cannot include failed or blocked criteria.");
  } else if (verdict.status === "failed") {
    if (verdict.criteriaFailed.length === 0) throw schemaError(event, "FAIL verdict must name failed criteria.");
  } else if (verdict.status === "blocked") {
    if (verdict.criteriaBlocked.length === 0 || !nonEmpty(verdict.missingAuthorityOrEnvironment)) throw schemaError(event, "BLOCKED verdict must name blocked criteria and missing authority/environment.");
  } else if (verdict.status === "parked") {
    if (verdict.followUpRequired.length === 0) throw schemaError(event, "PARKED verdict must name follow-up required.");
  }
}

function validateVerificationRunFinish(event: ManifestEvent, manifest: HelmsmanManifest, finish: VerificationRunFinishRecord): void {
  const run = manifest.verification.runs[finish.verificationRunId];
  const plan = manifest.verification.plans[finish.verificationRunId];
  if (!run || !plan) throw schemaError(event, `Verification run finish references unknown run ${finish.verificationRunId}.`);
  if (run.status !== "running") throw schemaError(event, "Only a running verification run can be finished.");
  if (finish.boardRevisionRead !== event.causality.boardRevisionRead) throw staleBoard(event, "Verification run finish must record the Board revision read by Core.");
  if (finish.routeSnapshotHash !== run.routeSnapshotHash || finish.routeSnapshotHash !== manifest.run.routeLock.snapshotHash) throw schemaError(event, "Verification run finish route snapshot hash must match the locked route.");
  const computed = summarizeVerification(plan.scenarioIds, manifest.verification.latestVerdictByScenario);
  if (JSON.stringify(finish.scenarioSummary) !== JSON.stringify(computed)) throw schemaError(event, "Verification run finish summary must match Core scenario verdicts.");
  if (finish.status === "completed" && (computed.failed.length > 0 || computed.blocked.length > 0 || computed.parked.length > 0 || computed.unverified.length > 0)) {
    throw gateBlocked(event, "Completed verification requires all declared scenarios to pass.");
  }
  if (finish.status === "failed" && computed.failed.length === 0) throw schemaError(event, "Failed verification finish requires at least one failed scenario.");
  if (finish.status === "blocked" && computed.blocked.length === 0 && computed.unverified.length === 0) throw schemaError(event, "Blocked verification finish requires blocked or unverified scenarios.");
  if (finish.status === "parked" && computed.parked.length === 0) throw schemaError(event, "Parked verification finish requires parked scenarios.");
}

function validateCloseoutRecord(event: ManifestEvent, manifest: HelmsmanManifest, closeout: CloseoutRecord): void {
  if (closeout.schemaVersion !== "helmsman.closeout.v1") throw schemaError(event, "Closeout schemaVersion is invalid.");
  if (closeout.runId !== manifest.run.id || closeout.runId !== event.runId) throw schemaError(event, "Closeout runId must match the manifest run.");
  if (!["completed", "parked", "blocked", "failed"].includes(closeout.status)) throw schemaError(event, "Closeout status is invalid.");
  if (!nonEmpty(closeout.closeoutId)) throw schemaError(event, "Closeout requires closeoutId.");
  if (closeout.boardRevisionRead !== event.causality.boardRevisionRead) throw staleBoard(event, "Closeout must record the Board revision read by Core.");
  if (closeout.routeSnapshotHash !== manifest.run.routeLock.snapshotHash) throw schemaError(event, "Closeout route snapshot hash must match the locked route.");
  validateCloseoutArtifactPath(event, closeout.closeoutArtifactPath);
  if (closeout.renderedManifestPath !== "rendered/manifest.md" || closeout.renderedBoardPath !== "rendered/board.md" || closeout.evidenceIndexPath !== "evidence/index.md") {
    throw schemaError(event, "Closeout must reference rendered Manifest, rendered Board, and evidence index paths.");
  }
  const requiredScenarioIds = manifest.route.verificationScenarios.map((scenario) => scenario.scenarioId);
  const summary = summarizeVerification(requiredScenarioIds, manifest.verification.latestVerdictByScenario);
  const closeoutSummary = { passed: summary.passed, failed: summary.failed, blocked: summary.blocked, parked: summary.parked };
  if (JSON.stringify(closeout.verificationSummary) !== JSON.stringify(closeoutSummary)) throw schemaError(event, "Closeout verification summary must match Core verdicts.");
  if (Object.keys(manifest.amendments.pending).length > 0) throw gateBlocked(event, "Closeout cannot proceed while route amendments are pending.", Object.keys(manifest.amendments.pending));
  if (manifest.run.routeLock.status === "invalidated") throw gateBlocked(event, "Closeout cannot complete while Route Lock is invalidated.");
  if (closeout.status === "completed") {
    if (manifest.run.routeLock.status !== "locked") throw gateBlocked(event, "Completed closeout requires a locked route.");
    if (requiredScenarioIds.length === 0) throw gateBlocked(event, "Completed closeout requires declared verification scenarios.");
    if (summary.failed.length > 0 || summary.blocked.length > 0 || summary.parked.length > 0 || summary.unverified.length > 0) {
      throw gateBlocked(event, "Completed closeout requires every required scenario to pass.");
    }
    for (const scenarioId of requiredScenarioIds) {
      const verdict = manifest.verification.latestVerdictByScenario[scenarioId];
      if (!verdict || !closeout.acceptedArtifactIds.includes(verdict.artifactId)) throw gateBlocked(event, `Completed closeout is missing accepted verdict artifact for ${scenarioId}.`);
    }
  } else if (summary.failed.length === 0 && summary.blocked.length === 0 && summary.parked.length === 0 && summary.unverified.length === 0 && closeout.status !== "failed") {
    throw schemaError(event, "Non-completed closeout must not be used when all scenarios are passed without explicit failure.");
  }
  for (const candidate of closeout.memoryPromotionCandidates ?? []) validateMemoryPromotionCandidate(event, candidate, manifest);
  if (closeout.memoryPromotionCandidatePath) validateRelativePath(event, closeout.memoryPromotionCandidatePath, "memory");
}

function validateMemoryPromotionCandidate(event: ManifestEvent, candidate: MemoryPromotionCandidate, manifest: HelmsmanManifest): void {
  if (!nonEmpty(candidate.candidateId) || !nonEmpty(candidate.claim) || !nonEmpty(candidate.sourceRunId)) throw schemaError(event, "Memory promotion candidates require id, claim, and source run id.");
  if (candidate.sourceRunId !== manifest.run.id) throw schemaError(event, "Memory promotion candidate source run id must match the closeout run.");
  if (!Array.isArray(candidate.sourceArtifactIds) || candidate.sourceArtifactIds.length === 0) throw schemaError(event, "Memory promotion candidate requires source artifacts.");
  if (!Array.isArray(candidate.sourceEvidenceIds) || candidate.sourceEvidenceIds.length === 0) throw schemaError(event, "Memory promotion candidate requires source evidence.");
  if (!nonEmpty(candidate.applicableScope) || !nonEmpty(candidate.stalenessTrigger) || !nonEmpty(candidate.contradictionNotes) || !nonEmpty(candidate.suggestedDestinationNamespace)) {
    throw schemaError(event, "Memory promotion candidate requires scope, staleness trigger, contradiction notes, and destination namespace.");
  }
  if (candidate.approvalPolicy !== "explicit_user_approval_required") throw schemaError(event, "Memory promotion candidates require explicit user approval policy.");
}

function summarizeVerification(scenarioIds: string[], verdicts: Record<string, VerificationScenarioVerdict>): VerificationRunFinishRecord["scenarioSummary"] {
  const summary: VerificationRunFinishRecord["scenarioSummary"] = { passed: [], failed: [], blocked: [], parked: [], unverified: [] };
  for (const scenarioId of scenarioIds) {
    const verdict = verdicts[scenarioId];
    if (!verdict) summary.unverified.push(scenarioId);
    else if (verdict.status === "passed") summary.passed.push(scenarioId);
    else if (verdict.status === "failed") summary.failed.push(scenarioId);
    else if (verdict.status === "blocked") summary.blocked.push(scenarioId);
    else summary.parked.push(scenarioId);
  }
  return summary;
}

function genericOrPlaceholder(text: string): boolean {
  return /\b(TODO|TBD|FIXME|PLACEHOLDER)\b/i.test(text) || /^\s*(tests? passed|all tests passed|green suite|looks good)\s*\.?\s*$/i.test(text.trim());
}

function validateDriftResponse(event: ManifestEvent, status: AutopilotRouteAdherence["status"], response: string): void {
  if (status === "adherent") return;
  if (status === "minor_drift" && !["continue", "repair", "park"].includes(response)) throw schemaError(event, "Minor Autopilot drift requires continue, repair, or park.");
  if (status === "route_changing_drift" && !["ask", "amend", "park", "stop"].includes(response)) throw schemaError(event, "Route-changing Autopilot drift requires ask, amend, park, or stop.");
  if (status === "critical_drift" && !["invalidate", "park", "stop"].includes(response)) throw schemaError(event, "Critical Autopilot drift requires invalidate, park, or stop.");
  if (status === "missing_evidence" && !["repair", "park"].includes(response)) throw schemaError(event, "Missing Autopilot evidence requires repair or park.");
  if (status === "forbidden_authority_claim" && !["repair", "park", "stop"].includes(response)) throw schemaError(event, "Forbidden authority claims require repair, park, or stop.");
}

function writeRootsConflict(leftRoots: string[], rightRoots: string[]): boolean {
  for (const left of leftRoots) {
    for (const right of rightRoots) {
      if (!left || !right) continue;
      if (left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)) return true;
    }
  }
  return false;
}

function validateQuestionBundle(event: ManifestEvent, bundle: QuestionBundleContract): void {
  if (bundle.maxQuestions !== 4) throw schemaError(event, "Question bundle maxQuestions must be 4.");
  if (bundle.questions.length < 1 || bundle.questions.length > 4) throw schemaError(event, "Question bundle must contain 1 to 4 questions.");
  for (const question of bundle.questions) {
    const labels = new Set<string>();
    if (question.type !== "free_text" && (question.options.length < 2 || question.options.length > 4)) {
      throw schemaError(event, "Select questions must contain 2 to 4 options.");
    }
    if (question.recommendedOptionId && !question.options.some((option) => option.optionId === question.recommendedOptionId)) {
      throw schemaError(event, "Recommended option must be declared in the question.");
    }
    if (question.recommendedOptionId && !question.recommendationReason) {
      throw schemaError(event, "Recommended option requires a recommendation reason.");
    }
    for (const option of question.options) {
      if (labels.has(option.label)) throw schemaError(event, "Question option labels must be unique.");
      labels.add(option.label);
      if (!Array.isArray(question.routeEffectsByOption[option.optionId])) {
        throw schemaError(event, `Question option ${option.optionId} is missing routeEffectsByOption metadata.`);
      }
    }
  }
}

const MEMORY_CLASSIFICATIONS = new Set(["reused", "stale", "irrelevant", "missing", "conflict"]);
const RESEARCH_LANE_TYPES = new Set([
  "source_of_truth",
  "current_code",
  "prior_art",
  "failure_mode",
  "ux",
  "implementation_feasibility",
  "memory_refresh",
  "runtime_probe",
  "adapter_probe",
]);
const RESEARCH_LANE_STATUSES = new Set(["queued", "running", "submitted", "accepted", "rejected", "dropped", "blocked"]);
const SYNTHESIS_OUTCOMES = new Set(["continue_research", "ask_decision_bundle", "lock_ready", "blocked", "drop_or_waive"]);
const RESEARCH_REQUIRED_HEADINGS = [
  "Question",
  "Lane Type",
  "Worker Packet",
  "Sources Checked",
  "Observations",
  "Inferences",
  "Uncertainty",
  "Decision Impact",
  "Route Changes Required",
  "Recommended Next Step",
];

function validateMemoryScan(event: ManifestEvent, manifest: HelmsmanManifest, plan: MemoryScanPlan): void {
  if (manifest.run.activeStage !== "memory_scan") throw schemaError(event, "Memory scans require the memory_scan stage.");
  if (plan.schemaVersion !== "helmsman.memory-scan.v1") throw schemaError(event, "Memory scan schemaVersion is invalid.");
  if (plan.runId !== manifest.run.id || plan.runId !== event.runId) throw schemaError(event, "Memory scan runId must match the manifest run.");
  if (!nonEmpty(plan.scanId) || !nonEmpty(plan.routeQuestion) || !nonEmpty(plan.createdAt)) throw schemaError(event, "Memory scan requires scanId, routeQuestion, and createdAt.");
  if (!Array.isArray(plan.selectedApertureQuestionIds) || plan.selectedApertureQuestionIds.length === 0) {
    throw schemaError(event, "Memory scan must select at least one Aperture question.");
  }
  if (!Array.isArray(plan.apertureAnswerEventIds) || plan.apertureAnswerEventIds.length === 0) {
    throw schemaError(event, "Memory scan must cite Aperture answer event ids.");
  }
  if (Object.keys(manifest.questions.bundles).length === 0) throw schemaError(event, "Memory scan requires a rendered Aperture bundle.");
  if (Object.keys(manifest.questions.answers).length === 0) throw schemaError(event, "Memory scan requires recorded Aperture answer evidence.");
  for (const questionId of plan.selectedApertureQuestionIds) {
    if (!manifest.questions.answers[questionId]) throw schemaError(event, `Memory scan selected unanswered Aperture question ${questionId}.`);
  }
  if (!Array.isArray(plan.searchCoordinates) || plan.searchCoordinates.length === 0 || plan.searchCoordinates.some((coordinate) => !nonEmpty(coordinate))) {
    throw schemaError(event, "Memory scan requires non-empty search coordinates.");
  }
  if (!Array.isArray(plan.sourcesToInspect) || plan.sourcesToInspect.length === 0) throw schemaError(event, "Memory scan must name sources to inspect.");
  for (const source of plan.sourcesToInspect) {
    if (!nonEmpty(source.sourceId) || !nonEmpty(source.kind) || !nonEmpty(source.ref)) throw schemaError(event, "Memory source refs require sourceId, kind, and ref.");
  }
  validateRelativePath(event, plan.artifactPath, "memory");
  if (plan.indexPath !== "memory-index.md") throw schemaError(event, "Memory scan indexPath must be memory-index.md.");
}

function validateMemoryCandidate(event: ManifestEvent, manifest: HelmsmanManifest, candidate: MemoryCandidateJudgment): void {
  if (!manifest.memory.scans[candidate.scanId]) throw schemaError(event, `Memory candidate references unknown scan ${candidate.scanId}.`);
  if (!nonEmpty(candidate.candidateId) || !nonEmpty(candidate.sourceRef) || !nonEmpty(candidate.reason)) {
    throw schemaError(event, "Memory candidate requires candidateId, sourceRef, and reason.");
  }
  if (!MEMORY_CLASSIFICATIONS.has(candidate.classification)) throw schemaError(event, "Memory candidate classification is invalid.");
  if (!Array.isArray(candidate.routeEffects)) throw schemaError(event, "Memory candidate routeEffects must be an array.");
  if (candidate.classification === "reused") {
    if (candidate.routeEffects.length === 0) throw schemaError(event, "Reused memory must cite a route effect.");
    if (candidate.createsResearchLaneId) throw schemaError(event, "Reused memory cannot create a research lane.");
    if (candidate.blocksRouteLock) throw schemaError(event, "Reused memory cannot block Route Lock.");
  } else if (candidate.classification === "irrelevant") {
    if (candidate.createsResearchLaneId) throw schemaError(event, "Irrelevant memory cannot create a research lane.");
  } else if (candidate.blocksRouteLock && !candidate.createsResearchLaneId) {
    throw schemaError(event, "Blocking stale, missing, or conflict memory must name the research lane it creates.");
  }
  if ((candidate.classification === "reused" || candidate.classification === "irrelevant") && candidate.createsResearchLaneId) {
    throw schemaError(event, "Only stale, missing, and conflict memory may create research lanes.");
  }
}

function validateResearchLane(event: ManifestEvent, manifest: HelmsmanManifest, lane: ResearchLaneContract): void {
  if (manifest.run.activeStage !== "research") throw schemaError(event, "Research lanes require the research stage.");
  if (lane.schemaVersion !== "helmsman.research-lane.v1") throw schemaError(event, "Research lane schemaVersion is invalid.");
  if (lane.runId !== manifest.run.id || lane.runId !== event.runId) throw schemaError(event, "Research lane runId must match the manifest run.");
  if (!nonEmpty(lane.laneId) || !nonEmpty(lane.slug) || !nonEmpty(lane.routeChangingQuestion)) throw schemaError(event, "Research lane requires laneId, slug, and route-changing question.");
  if (!RESEARCH_LANE_TYPES.has(lane.laneType)) throw schemaError(event, "Research lane type is invalid.");
  if (!RESEARCH_LANE_STATUSES.has(lane.status)) throw schemaError(event, "Research lane status is invalid.");
  if (lane.status !== "queued" && lane.status !== "blocked") throw schemaError(event, "New research lanes must start queued or blocked.");
  if (Object.keys(manifest.memory.scans).length === 0) throw schemaError(event, "Research lanes require a scoped memory scan.");
  if (!Array.isArray(lane.selectedApertureEventIds) || lane.selectedApertureEventIds.length === 0) throw schemaError(event, "Research lane requires selected Aperture event ids.");
  if (!Array.isArray(lane.sourceMemoryJudgmentIds) || lane.sourceMemoryJudgmentIds.length === 0) throw schemaError(event, "Research lane must cite memory judgments.");
  for (const judgmentId of lane.sourceMemoryJudgmentIds) {
    const judgment = manifest.memory.candidates[judgmentId];
    if (!judgment) throw schemaError(event, `Research lane references unknown memory judgment ${judgmentId}.`);
    if (!["stale", "missing", "conflict"].includes(judgment.classification)) {
      throw schemaError(event, "Research lanes can only originate from stale, missing, or conflict judgments.");
    }
    if (judgment.createsResearchLaneId && judgment.createsResearchLaneId !== lane.laneId) {
      throw schemaError(event, "Research lane id must match the originating memory judgment.");
    }
  }
  if (!Array.isArray(lane.sourcesToInspect) || lane.sourcesToInspect.length === 0) throw schemaError(event, "Research lane must name sources to inspect.");
  validateRelativePath(event, lane.expectedArtifactPath, "research");
  if (!Array.isArray(lane.allowedWriteScope) || lane.allowedWriteScope.length !== 1 || lane.allowedWriteScope[0] !== lane.expectedArtifactPath) {
    throw schemaError(event, "Research lane allowedWriteScope must equal the expected artifact path.");
  }
  if (!Array.isArray(lane.acceptanceCriteria) || lane.acceptanceCriteria.length === 0) throw schemaError(event, "Research lane requires acceptance criteria.");
  if (!nonEmpty(lane.ownerRoleId) || !nonEmpty(lane.decisionImpact) || !nonEmpty(lane.openUncertainty)) {
    throw schemaError(event, "Research lane requires ownerRoleId, decisionImpact, and openUncertainty.");
  }
}

function validateResearchWorkerPacket(event: ManifestEvent, manifest: HelmsmanManifest, packet: ResearchWorkerPacket): void {
  if (packet.schemaVersion !== "helmsman.research-worker-packet.v1") throw schemaError(event, "Research worker packet schemaVersion is invalid.");
  if (packet.runId !== manifest.run.id || packet.runId !== event.runId) throw schemaError(event, "Research worker packet runId must match the manifest run.");
  if (!nonEmpty(packet.packetId) || !nonEmpty(packet.laneId) || !nonEmpty(packet.routeQuestion) || !nonEmpty(packet.mission)) {
    throw schemaError(event, "Research worker packet requires packetId, laneId, routeQuestion, and mission.");
  }
  const lane = manifest.research.lanes[packet.laneId];
  if (!lane) throw schemaError(event, `Research worker packet references unknown lane ${packet.laneId}.`);
  if (packet.requiredArtifactPath !== lane.expectedArtifactPath) throw schemaError(event, "Worker packet requiredArtifactPath must match the lane artifact path.");
  if (!Array.isArray(packet.allowedWriteScope) || packet.allowedWriteScope.length !== 1 || packet.allowedWriteScope[0] !== lane.expectedArtifactPath) {
    throw schemaError(event, "Worker packet allowedWriteScope must equal the required artifact path.");
  }
  if (!Array.isArray(packet.allowedReadScope) || packet.allowedReadScope.length === 0) throw schemaError(event, "Worker packet requires allowed read scope.");
  if (!Array.isArray(packet.requiredHeadings) || !RESEARCH_REQUIRED_HEADINGS.every((heading) => packet.requiredHeadings.includes(heading))) {
    throw schemaError(event, "Worker packet is missing required research artifact headings.");
  }
  if (!Array.isArray(packet.doneCriteria) || packet.doneCriteria.length === 0) throw schemaError(event, "Worker packet requires done criteria.");
  const forbidden = packet.forbiddenActions.join("\n").toLowerCase();
  for (const required of ["route lock", "completion", "user-owned decision"]) {
    if (!forbidden.includes(required)) throw schemaError(event, `Worker packet must forbid ${required}.`);
  }
  if (!nonEmpty(packet.parallelGroupId)) throw schemaError(event, "Worker packet requires parallelGroupId.");
  if (packet.boardRevisionRead !== event.causality.boardRevisionRead) throw schemaError(event, "Worker packet must record the Board revision read by Core.");
}

function validateResearchSynthesis(event: ManifestEvent, manifest: HelmsmanManifest, synthesis: ResearchSynthesisRecord): void {
  if (synthesis.schemaVersion !== "helmsman.research-synthesis.v1") throw schemaError(event, "Research synthesis schemaVersion is invalid.");
  if (!nonEmpty(synthesis.synthesisId) || !nonEmpty(synthesis.summary)) throw schemaError(event, "Research synthesis requires synthesisId and summary.");
  if (!SYNTHESIS_OUTCOMES.has(synthesis.outcome)) throw schemaError(event, "Research synthesis outcome is invalid.");
  if (!Array.isArray(synthesis.acceptedArtifactIds) || !Array.isArray(synthesis.droppedLaneIds) || !Array.isArray(synthesis.openLaneIds)) {
    throw schemaError(event, "Research synthesis must account for accepted artifacts, dropped lanes, and open lanes.");
  }
  for (const artifactId of synthesis.acceptedArtifactIds) {
    const artifact = manifest.artifacts.records[artifactId];
    if (!artifact || artifact.status !== "accepted") throw schemaError(event, `Synthesis references unaccepted artifact ${artifactId}.`);
  }
  for (const laneId of synthesis.droppedLaneIds) {
    const lane = manifest.research.lanes[laneId];
    if (!lane || lane.status !== "dropped") throw schemaError(event, `Synthesis references non-dropped lane ${laneId}.`);
  }
  for (const laneId of synthesis.openLaneIds) {
    const lane = manifest.research.lanes[laneId];
    if (!lane || lane.status === "accepted" || lane.status === "dropped") throw schemaError(event, `Synthesis open lane ${laneId} is not open.`);
  }
  const accountedLaneIds = new Set<string>();
  for (const artifactId of synthesis.acceptedArtifactIds) {
    const lane = Object.values(manifest.research.lanes).find((candidate) => manifest.artifacts.records[artifactId]?.path === candidate.expectedArtifactPath);
    if (lane) accountedLaneIds.add(lane.laneId);
  }
  synthesis.droppedLaneIds.forEach((laneId) => accountedLaneIds.add(laneId));
  synthesis.openLaneIds.forEach((laneId) => accountedLaneIds.add(laneId));
  for (const laneId of Object.keys(manifest.research.lanes)) {
    if (!accountedLaneIds.has(laneId)) throw schemaError(event, `Synthesis does not account for lane ${laneId}.`);
  }
  if (synthesis.outcome === "lock_ready" && synthesis.openLaneIds.length > 0) throw schemaError(event, "Lock-ready synthesis cannot leave open lanes.");
  if (!Array.isArray(synthesis.routeEffects) || !Array.isArray(synthesis.evidenceIds)) throw schemaError(event, "Synthesis requires routeEffects and evidenceIds arrays.");
}

function validateRoleBinding(event: ManifestEvent, binding: RoleBindingContract): void {
  if (!binding.roleId || !binding.provider || !binding.model) throw schemaError(event, "Role binding requires roleId, provider, and model.");
  if (binding.runtime !== "pi_agent_session" && !binding.runtime.endsWith("_adapter")) throw schemaError(event, "Role binding runtime is invalid.");
  if (!binding.toolPolicy || !Array.isArray(binding.toolPolicy.allowedToolNames)) throw schemaError(event, "Role binding requires a tool policy with allowedToolNames.");
  if (!binding.sandboxPolicy || !binding.sandboxPolicy.cwd) throw schemaError(event, "Role binding requires sandbox policy cwd.");
  if (!Array.isArray(binding.sandboxPolicy.allowedReadRoots) || !Array.isArray(binding.sandboxPolicy.allowedWriteRoots)) {
    throw schemaError(event, "Role binding sandbox policy requires read and write roots.");
  }
  if (!binding.concurrency || binding.concurrency.maxParallel < 1) throw schemaError(event, "Role binding requires a positive concurrency limit.");
  if (!binding.budgets || binding.budgets.timeoutMs < 1) throw schemaError(event, "Role binding requires a positive timeout.");
  if (!binding.fallback || !binding.fallback.onMissingAuth || !binding.fallback.onRuntimeUnavailable) {
    throw schemaError(event, "Role binding requires explicit fallback policy.");
  }
  if (!Array.isArray(binding.requiredArtifacts) || !Array.isArray(binding.forbiddenAuthorityClaims)) {
    throw schemaError(event, "Role binding requires requiredArtifacts and forbiddenAuthorityClaims arrays.");
  }
}

function validateRelativePath(event: ManifestEvent, path: string, root: string): void {
  if (!nonEmpty(path)) throw schemaError(event, "Artifact path is required.");
  if (path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) {
    throw schemaError(event, "Artifact paths must be relative and cannot escape the run root.");
  }
  if (!path.startsWith(`${root}/`)) throw schemaError(event, `Artifact path must be under ${root}/.`);
}

function validateCloseoutArtifactPath(event: ManifestEvent, path: string): void {
  if (path === "closeout.md") return;
  validateRelativePath(event, path, "closeout");
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertion(event: ManifestEvent, id: string, text: string, evidenceIds: string[] = []): { id: string; text: string; sourceEventId: string; evidenceIds: string[] } {
  return { id, text, sourceEventId: event.eventId, evidenceIds };
}

function defaultAutonomyBoundary(): AutonomyBoundary {
  return {
    canEditFiles: true,
    canRunCommands: true,
    canUseNetwork: true,
    canInstallDependencies: true,
    canUseExternalAdapters: true,
    mustAskBefore: ["destructive filesystem operations", "external publication", "credential disclosure"],
  };
}

function schemaError(event: ManifestEvent, message: string): CoreError {
  return new CoreError({ code: "EVENT_SCHEMA_INVALID", message, eventId: event.eventId, sequence: event.sequence });
}

function gateBlocked(event: ManifestEvent, message: string, evidenceRefs: string[] = []): CoreError {
  return new CoreError({ code: "GATE_BLOCKED", message, eventId: event.eventId, sequence: event.sequence, evidenceRefs });
}

function staleBoard(event: ManifestEvent, message: string): CoreError {
  return new CoreError({ code: "BOARD_REVISION_STALE", message, eventId: event.eventId, sequence: event.sequence });
}

function rejectSecretPayload(event: ManifestEvent): void {
  const text = JSON.stringify(event.payload);
  if (/(sk-[A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,}|(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|SECRET)\s*[:=]\s*["']?[A-Za-z0-9._-]{8,})/.test(text)) {
    throw new CoreError({
      code: "SECRET_DETECTED",
      message: "Manifest events must not persist raw secrets.",
      eventId: event.eventId,
      sequence: event.sequence,
    });
  }
}
