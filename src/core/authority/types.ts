export type Revision = number;
export type AuthoritySource = "user" | "lead_default" | "core_policy" | "role_runner" | "external_adapter" | "verifier";
export type RuntimeKind = "pi" | "codex" | "opencode" | "omp" | "claude_code" | "manual";
export type OperationStatus = "queued" | "running" | "completed" | "failed" | "timed_out" | "aborted" | "interrupted" | "parked";
export type GateStatus = "not_evaluated" | "blocked" | "ready" | "passed" | "failed" | "waived";
export type RolePurpose = "chat" | "charting" | "memory_scan" | "research" | "synthesis" | "autopilot" | "audit" | "verification" | "closeout";
export type RoleRuntimeKind = "pi_agent_session" | "codex_adapter" | "opencode_adapter" | "omp_adapter" | "claude_adapter";
export type RoleThinking = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type RoleRunStatus = OperationStatus | "blocked" | "rejected";
export type MemoryClassification = "reused" | "stale" | "irrelevant" | "missing" | "conflict";
export type ResearchLaneStatus = "queued" | "running" | "submitted" | "accepted" | "rejected" | "dropped" | "blocked";
export type ResearchLaneType =
  | "source_of_truth"
  | "current_code"
  | "prior_art"
  | "failure_mode"
  | "ux"
  | "implementation_feasibility"
  | "memory_refresh"
  | "runtime_probe"
  | "adapter_probe";
export type ResearchSynthesisOutcome = "continue_research" | "ask_decision_bundle" | "lock_ready" | "blocked" | "drop_or_waive";
export type RouteLockStatus = "unlocked" | "lock_ready" | "locked" | "invalidated";
export type AutopilotLoopStatus = "planned" | "running" | "completed" | "needs_repair" | "needs_user_action" | "parked" | "stopped" | "failed" | "timed_out";
export type AutopilotDriftClass = "none" | "minor_drift" | "route_changing_drift" | "critical_drift" | "missing_evidence" | "forbidden_authority_claim";
export type AutopilotDriftResponse = "continue" | "repair" | "ask" | "amend" | "invalidate" | "park" | "stop";
export type VerificationEvidenceKind = "command_output" | "test_result" | "role_run" | "artifact" | "tui_capture" | "live_provider" | "manual_observation" | "replay_hash" | "audit_report";
export type VerificationScenarioScope = "unit" | "integration" | "e2e" | "tui_pty" | "live_provider" | "manual_review" | "release";
export type VerificationScenarioMethod = "command" | "role_review" | "tui_session" | "artifact_inspection" | "live_provider_probe" | "manual_review";
export type VerificationVerdictStatus = "passed" | "failed" | "blocked" | "parked";
export type VerificationRunStatus = "running" | "completed" | "failed" | "blocked" | "parked";
export type CloseoutStatus = "completed" | "parked" | "blocked" | "failed";
export type RouteLockBlockerCode =
  | "OPEN_ROUTE_QUESTION"
  | "QUESTION_SURFACE_MISSING"
  | "ROUTE_EFFECT_MISSING"
  | "MEMORY_SCAN_MISSING"
  | "RESEARCH_LANE_OPEN"
  | "RESEARCH_ARTIFACT_MISSING"
  | "ARTIFACT_NOT_ACCEPTED"
  | "VERIFICATION_SCENARIOS_MISSING"
  | "USER_AUTHORITY_MISSING"
  | "BOARD_REVISION_STALE"
  | "GATE_BLOCKED";
export type AmendmentKind =
  | "scope_refinement"
  | "success_criteria_change"
  | "non_goal_change"
  | "autonomy_boundary_change"
  | "verification_change"
  | "research_evidence_update"
  | "stop_condition_change"
  | "risk_update"
  | "unlock_required";

export type RunStage =
  | "chat"
  | "charting"
  | "memory_scan"
  | "research"
  | "synthesis"
  | "lock_ready"
  | "locked"
  | "autopilot"
  | "verification"
  | "closeout"
  | "closed";

export type CoreErrorCode =
  | "EVENT_SEQUENCE_GAP"
  | "EVENT_SEQUENCE_DUPLICATE"
  | "EVENT_ID_DUPLICATE"
  | "EVENT_SCHEMA_INVALID"
  | "EVENT_ACTOR_UNAUTHORIZED"
  | "BOARD_REVISION_REQUIRED"
  | "BOARD_REVISION_STALE"
  | "COMMAND_STAGE_ILLEGAL"
  | "COMMAND_PRECONDITION_FAILED"
  | "ROUTE_LOCK_REQUIRED"
  | "ROUTE_LOCK_IMMUTABLE"
  | "AMENDMENT_REQUIRED"
  | "QUESTION_SURFACE_MISSING"
  | "QUESTION_ANSWER_UNAUTHORIZED"
  | "ARTIFACT_NOT_DECLARED"
  | "ARTIFACT_NOT_ACCEPTED"
  | "EVIDENCE_MISSING"
  | "GATE_BLOCKED"
  | "FINAL_MESSAGE_NOT_COMPLETION"
  | "PROJECTION_STALE"
  | "PROJECTION_HASH_MISMATCH"
  | "SECRET_DETECTED"
  | "RECOVERY_REQUIRED";

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly eventId?: string;
  readonly sequence?: number;
  readonly evidenceRefs: string[];

  constructor(input: {
    code: CoreErrorCode;
    message: string;
    eventId?: string;
    sequence?: number;
    evidenceRefs?: string[];
  }) {
    super(input.message);
    this.name = "CoreError";
    this.code = input.code;
    this.eventId = input.eventId;
    this.sequence = input.sequence;
    this.evidenceRefs = input.evidenceRefs ?? [];
  }
}

export interface ManifestActor {
  kind: AuthoritySource;
  id: string;
  roleId?: string;
  operationId?: string;
}

export interface ManifestEvent<TType extends string = string, TPayload = unknown> {
  schemaVersion: "helmsman.manifest-event.v1";
  eventId: string;
  runId: string;
  sequence: number;
  type: TType;
  createdAt: string;
  actor: ManifestActor;
  causality: {
    parentEventId?: string;
    commandId?: string;
    boardRevisionRead?: Revision;
    operationId?: string;
  };
  payload: TPayload;
}

export interface RouteAssertion {
  id: string;
  text: string;
  sourceEventId: string;
  evidenceIds: string[];
}

export interface RouteRisk extends RouteAssertion {
  severity: "low" | "medium" | "high" | "critical";
  mitigation?: string;
}

export interface AutonomyBoundary {
  canEditFiles: boolean;
  canRunCommands: boolean;
  canUseNetwork: boolean;
  canInstallDependencies: boolean;
  canUseExternalAdapters: boolean;
  mustAskBefore: string[];
}

export interface VerificationScenario {
  scenarioId: string;
  title: string;
  expectedEvidence: string[];
}

export interface VerificationScenarioContract {
  schemaVersion: "helmsman.verification-scenario.v1";
  runId: string;
  scenarioId: string;
  title: string;
  routeAssertionIds: string[];
  successCriterionIds: string[];
  riskIds: string[];
  scope: VerificationScenarioScope;
  method: VerificationScenarioMethod;
  verifierRoleId: string;
  expectedArtifactPath: string;
  requiredEvidenceKinds: VerificationEvidenceKind[];
  passCriteria: string[];
  failCriteria: string[];
  blockedCriteria: string[];
  hardFloor: boolean;
  createdFromEventId: string;
}

export type RouteEffect =
  | { id: string; kind: "route.scope.add"; text: string }
  | { id: string; kind: "route.scope.remove"; targetId: string; reason: string }
  | { id: string; kind: "route.non_goal.add"; text: string }
  | { id: string; kind: "route.assumption.add"; text: string }
  | { id: string; kind: "route.risk.add"; text: string; severity: RouteRisk["severity"]; mitigation?: string }
  | { id: string; kind: "route.stop_condition.add"; text: string }
  | { id: string; kind: "route.success_criterion.add"; text: string }
  | { id: string; kind: "route.verification_scenario.add"; scenario: VerificationScenario }
  | { id: string; kind: "route.verification_scenario.remove"; scenarioId: string; reason: string }
  | { id: string; kind: "route.autonomy_boundary.set"; boundary: Partial<AutonomyBoundary> }
  | { id: string; kind: "research.lane.request"; laneDraft: Record<string, unknown> }
  | { id: string; kind: "gate.block"; gateId: string; blockerId: string; reason: string }
  | { id: string; kind: "gate.unblock"; gateId: string; blockerId: string; reason: string };

export interface QuestionOptionContract {
  optionId: string;
  label: string;
  description: string;
  tradeoffs: string[];
  opens: string[];
  closes: string[];
}

export interface QuestionContract {
  questionId: string;
  type: "single_select" | "multi_select" | "free_text";
  prompt: string;
  whyItMatters: string;
  options: QuestionOptionContract[];
  recommendedOptionId?: string;
  recommendationReason?: string;
  allowFreeForm: boolean;
  requiredForLock: boolean;
  routeEffectsByOption: Record<string, RouteEffect[]>;
}

export interface QuestionBundleContract {
  bundleId: string;
  purpose: "aperture" | "decision" | "amendment" | "verification" | "stop";
  title: string;
  routeQuestion: string;
  questions: QuestionContract[];
  maxQuestions: 4;
  lockImpact: "none" | "blocks_lock" | "requires_user_confirmation";
  createdByRoleId: string;
}

export interface QuestionSurfaceContract {
  surfaceId: string;
  renderer: "pi_tui" | "rpiv_wrapper" | "headless_cli";
  rendererVersion: string;
  displayedAt: string;
  transcriptEvidencePath: string;
  width?: number;
  locale: string;
  bundleHash: string;
}

export interface QuestionAnswerContract {
  questionId: string;
  selectedOptionIds: string[];
  freeFormText?: string;
  answeredAt: string;
  authority: "user";
  surfaceId: string;
  userVisibleBundleHash: string;
  answerDetails: {
    optionLabels: string[];
    optionDescriptions: string[];
    perOptionNotes?: Record<string, string>;
    cancellationReason?: string;
  };
}

export interface EvidenceRecord {
  evidenceId: string;
  kind: string;
  path?: string;
  summary: string;
  recordedAt: string;
}

export interface ArtifactExpectation {
  artifactId: string;
  kind: string;
  expectedPath: string;
  required: boolean;
}

export interface RequiredArtifactContract extends ArtifactExpectation {
  description?: string;
}

export interface ToolPolicyContract {
  allowedToolNames: string[];
  network: "forbidden" | "allowed" | "approval_required";
  filesystem: "read_only" | "declared_writes_only" | "workspace_write";
  shell: "forbidden" | "read_only" | "declared_commands" | "allowed";
  customTools: string[];
}

export interface SandboxPolicyContract {
  cwd: string;
  allowedReadRoots: string[];
  allowedWriteRoots: string[];
  deniedRoots: string[];
  secretsPolicy: "no_secret_output" | "provider_auth_only";
}

export interface RoleConcurrencyContract {
  class: "lead" | "research_worker" | "implementation_worker" | "auditor" | "verifier";
  maxParallel: number;
  queue: "fifo" | "priority";
  leaseMs: number;
}

export interface RoleBudgetContract {
  maxTurns?: number;
  timeoutMs: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxCostUsd?: number;
}

export interface RoleFallbackContract {
  onMissingAuth: "block" | "fallback_role" | "ask_user";
  onModelUnsupportedThinking: "clamp_and_record" | "block";
  onRuntimeUnavailable: "fallback_role" | "block";
  fallbackRoleId?: string;
}

export interface RoleBindingContract {
  roleId: string;
  purpose: RolePurpose;
  runtime: RoleRuntimeKind;
  provider: string;
  model: string;
  api?: string;
  thinking: RoleThinking;
  mode: "auto" | "fast" | "deep";
  toolPolicy: ToolPolicyContract;
  sandboxPolicy: SandboxPolicyContract;
  concurrency: RoleConcurrencyContract;
  budgets: RoleBudgetContract;
  fallback: RoleFallbackContract;
  requiredArtifacts: RequiredArtifactContract[];
  forbiddenAuthorityClaims: string[];
}

export interface RoleRunPlan {
  schemaVersion: "helmsman.role-run-plan.v1";
  runId: string;
  roleRunId: string;
  operationId: string;
  roleId: string;
  purpose: RolePurpose;
  boardRevision: Revision;
  routeLockStatus: HelmsmanManifest["run"]["routeLock"]["status"];
  inputKind: "chat" | "charting_bundle" | "memory_scan" | "research_lane" | "worker_packet" | "autopilot_step" | "verification_scenario";
  inputRef: string;
  promptPath: string;
  expectedArtifacts: RequiredArtifactContract[];
  allowedReadRoots: string[];
  allowedWriteRoots: string[];
  stopConditions: string[];
  timeoutMs: number;
  binding: RoleBindingContract;
}

export interface RoleRunResult {
  schemaVersion: "helmsman.role-run-result.v1";
  runId: string;
  roleRunId: string;
  operationId: string;
  roleId: string;
  purpose: RolePurpose;
  status: RoleRunStatus;
  startedAt: string;
  finishedAt: string;
  runtime: RuntimeKind;
  provider: string;
  model: string;
  thinking: RoleThinking;
  piSessionId?: string;
  sessionFile?: string;
  promptPath: string;
  eventLogPath: string;
  transcriptPath: string;
  toolEventsPath: string;
  artifactsPath: string;
  diagnosticsPath: string;
  resultPath: string;
  lastMessagePath?: string;
  artifactIds: string[];
  evidenceIds: string[];
  routeAuthority: "unchanged";
  finalMessageIsCompletion: false;
  errorMessage?: string;
}

export interface MemorySourceRef {
  sourceId: string;
  kind: "file" | "directory" | "memory_registry" | "url" | "manual";
  ref: string;
  description?: string;
}

export interface MemoryScanPlan {
  schemaVersion: "helmsman.memory-scan.v1";
  runId: string;
  scanId: string;
  selectedApertureQuestionIds: string[];
  apertureAnswerEventIds: string[];
  routeQuestion: string;
  searchCoordinates: string[];
  sourcesToInspect: MemorySourceRef[];
  sourcesToSkip: MemorySourceRef[];
  artifactPath: string;
  indexPath: string;
  createdAt: string;
}

export interface MemoryCandidateJudgment {
  scanId: string;
  candidateId: string;
  sourceRef: string;
  classification: MemoryClassification;
  reason: string;
  routeEffects: RouteEffect[];
  createsResearchLaneId?: string;
  blocksRouteLock: boolean;
}

export interface ResearchLaneContract {
  schemaVersion: "helmsman.research-lane.v1";
  runId: string;
  laneId: string;
  slug: string;
  selectedApertureEventIds: string[];
  sourceMemoryJudgmentIds: string[];
  routeChangingQuestion: string;
  laneType: ResearchLaneType;
  sourcesToInspect: string[];
  sourcesToSkip: string[];
  expectedArtifactPath: string;
  ownerRoleId: string;
  allowedWriteScope: string[];
  acceptanceCriteria: string[];
  decisionImpact: string;
  openUncertainty: string;
  status: ResearchLaneStatus;
  workerPacketId?: string;
  roleRunId?: string;
  dropReason?: string;
}

export interface ResearchWorkerPacket {
  schemaVersion: "helmsman.research-worker-packet.v1";
  runId: string;
  laneId: string;
  packetId: string;
  boardRevisionRead: Revision;
  routeQuestion: string;
  selectedApertureSummary: string;
  mission: string;
  contextRefs: string[];
  sourcesToInspect: string[];
  sourcesToSkip: string[];
  allowedReadScope: string[];
  allowedWriteScope: string[];
  requiredArtifactPath: string;
  requiredHeadings: string[];
  doneCriteria: string[];
  forbiddenActions: string[];
  verificationNotes: string;
  parallelGroupId: string;
}

export interface ResearchSynthesisRecord {
  schemaVersion: "helmsman.research-synthesis.v1";
  synthesisId: string;
  outcome: ResearchSynthesisOutcome;
  acceptedArtifactIds: string[];
  droppedLaneIds: string[];
  openLaneIds: string[];
  summary: string;
  openUncertainty: string[];
  routeEffects: RouteEffect[];
  evidenceIds: string[];
  recordedAt: string;
}

export interface RouteLockBlocker {
  blockerId: string;
  code: RouteLockBlockerCode;
  reason: string;
  sourceId?: string;
  requiredAction: BoardNextAction["kind"];
}

export interface RouteLockWarning {
  warningId: string;
  reason: string;
  sourceId?: string;
}

export interface RouteLockReadiness {
  schemaVersion: "helmsman.route-lock-readiness.v1";
  runId: string;
  evaluatedAt: string;
  boardRevisionRead: Revision;
  eventSequenceRead: number;
  status: "blocked" | "lock_ready";
  routeSnapshotHash?: string;
  hardBlockers: RouteLockBlocker[];
  softWarnings: RouteLockWarning[];
  requiredEvidenceIds: string[];
}

export interface RouteLockSnapshot {
  schemaVersion: "helmsman.route-lock-snapshot.v1";
  runId: string;
  createdAt: string;
  eventSequenceRead: number;
  boardRevisionRead: Revision;
  route: {
    goal: string;
    scope: RouteAssertion[];
    nonGoals: RouteAssertion[];
    assumptions: RouteAssertion[];
    risks: RouteRisk[];
    stopConditions: RouteAssertion[];
    successCriteria: RouteAssertion[];
    autonomyBoundary: AutonomyBoundary;
    verificationScenarios: VerificationScenario[];
  };
  answeredQuestions: QuestionAnswerContract[];
  waivedQuestionIds: string[];
  memorySummary: {
    scanIds: string[];
    candidateIds: string[];
    blockingCandidateIds: string[];
  };
  researchSummary: {
    laneIds: string[];
    acceptedArtifactIds: string[];
    droppedLaneIds: string[];
    synthesisIds: string[];
  };
  acceptedArtifacts: ArtifactRecord[];
  knownRisks: RouteRisk[];
  autonomyBoundary: AutonomyBoundary;
  verificationScenarios: VerificationScenario[];
}

export interface RouteLockProposal {
  schemaVersion: "helmsman.route-lock-proposal.v1";
  proposalId: string;
  runId: string;
  proposedAt: string;
  boardRevisionRead: Revision;
  eventSequenceRead: number;
  snapshotPath: string;
  snapshotHash: string;
  renderedPath: string;
  remainingRisks: RouteRisk[];
  softWarnings: RouteLockWarning[];
  requiredUserConfirmation: true;
  readiness: RouteLockReadiness;
}

export interface RouteLockConfirmationEvidence {
  schemaVersion: "helmsman.route-lock-confirmation-evidence.v1";
  evidenceId: string;
  runId: string;
  proposalId: string;
  confirmedAt: string;
  userAction: "confirmed";
  visibleSnapshotHash: string;
  snapshotPath: string;
  snapshotHash: string;
  surface: "cli" | "tui" | "headless";
  userId: string;
}

export interface RouteLockInvalidationRecord {
  previousSnapshotHash: string;
  reason: string;
  severity: "warning" | "hard";
  evidenceIds: string[];
  requiredResponse: "ask" | "amend" | "unlock" | "park" | "stop";
}

export interface RouteAmendment {
  schemaVersion: "helmsman.route-amendment.v1";
  amendmentId: string;
  kind: AmendmentKind;
  proposedAt: string;
  proposedBy: AuthoritySource;
  reason: string;
  routeEffects: RouteEffect[];
  evidenceIds: string[];
  requiresUserConfirmation: boolean;
  invalidatesLock: boolean;
  previousSnapshotHash: string;
}

export interface RouteAmendmentApplication {
  amendmentId: string;
  appliedBy: "user" | "core_policy";
  confirmationEvidenceId?: string;
  previousSnapshotHash: string;
  newSnapshotPath: string;
  newSnapshotHash: string;
}

export interface RouteAmendmentRejection {
  amendmentId: string;
  rejectedBy: AuthoritySource;
  reason: string;
}

export interface AutopilotAcceptanceCriterion {
  criterionId: string;
  description: string;
  required: boolean;
}

export interface AutopilotStopCondition {
  conditionId: string;
  description: string;
}

export interface AutopilotPacket {
  schemaVersion: "helmsman.autopilot-packet.v1";
  runId: string;
  loopId: string;
  packetId: string;
  operationId: string;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  lockedSnapshotPath: string;
  lockedSnapshotHash: string;
  roleId: string;
  rolePurpose: RolePurpose;
  mission: string;
  boardExcerpt: {
    nextLegalAction: BoardNextAction;
    blockers: BoardProjection["blockers"];
    routeLock: HelmsmanManifest["run"]["routeLock"];
  };
  allowedReadRoots: string[];
  allowedWriteRoots: string[];
  requiredArtifacts: RequiredArtifactContract[];
  stopConditions: AutopilotStopCondition[];
  forbiddenAuthorityClaims: string[];
  evidenceCapturePath: string;
  retryPolicy: { maxAttempts: number; idempotencyKey: string };
  resumePolicy: { resumeFromPlan: true; duplicateExecution: "reject" };
}

export interface AutopilotLoopPlan {
  schemaVersion: "helmsman.autopilot-loop-plan.v1";
  runId: string;
  loopId: string;
  attempt: number;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeLockEventId: string;
  lockedSnapshotPath: string;
  lockedSnapshotHash: string;
  nextLegalAction: BoardNextAction;
  actionReason: string;
  autonomyBoundaryIds: string[];
  packetPaths: string[];
  roleRunPlanRefs: string[];
  externalAdapterPlans: string[];
  expectedArtifacts: RequiredArtifactContract[];
  acceptanceCriteria: AutopilotAcceptanceCriterion[];
  forbiddenClaims: string[];
  stopConditions: AutopilotStopCondition[];
  maxRoleRuns: number;
  maxRepairPasses: number;
  maxAuditPasses: number;
  timeoutMs: number;
  idempotencyKey: string;
  createdAt: string;
}

export interface AutopilotActionSelection {
  loopId: string;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeLockEventId: string;
  lockedSnapshotHash: string;
  selectedAction: BoardNextAction;
  reason: string;
  plannedOperationIds: string[];
  packetPaths: string[];
  idempotencyKey: string;
}

export interface AutopilotRouteAdherence {
  loopId: string;
  status: Exclude<AutopilotDriftClass, "none"> | "adherent";
  evaluatedAt: string;
  reason: string;
  evidenceIds: string[];
  requiredResponse: AutopilotDriftResponse;
}

export interface AutopilotDriftRecord {
  driftId: string;
  loopId: string;
  class: Exclude<AutopilotDriftClass, "none">;
  reason: string;
  severity: "warning" | "hard";
  evidenceIds: string[];
  requiredResponse: Exclude<AutopilotDriftResponse, "continue">;
}

export interface AutopilotLoopFinishRecord {
  loopId: string;
  status: AutopilotLoopStatus;
  routeAdherence: AutopilotRouteAdherence;
  drift?: AutopilotDriftRecord;
  nextRecommendedAction: BoardNextAction["kind"];
  evidenceIds: string[];
  completedAt: string;
  nextStage?: RunStage;
}

export interface AutopilotRecoveryRecord {
  recoveryId: string;
  loopId: string;
  recoveredAt: string;
  previousStatus: AutopilotLoopStatus;
  recoveredStatus: AutopilotLoopStatus;
  reason: string;
  evidenceIds: string[];
}

export interface AutopilotLoopRecord {
  loopId: string;
  status: AutopilotLoopStatus;
  planPath: string;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  lockedSnapshotHash: string;
  startedAt?: string;
  finishedAt?: string;
  packetIds: string[];
  roleRunIds: string[];
  driftIds: string[];
  recoveryIds: string[];
  routeAdherence?: AutopilotRouteAdherence;
  nextRecommendedAction?: BoardNextAction["kind"];
}

export interface VerificationRunPlan {
  schemaVersion: "helmsman.verification-run-plan.v1";
  runId: string;
  verificationRunId: string;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeSnapshotHash: string;
  scenarioIds: string[];
  scenarios: VerificationScenarioContract[];
  verifierRoleRunPlans: RoleRunPlan[];
  expectedArtifacts: RequiredArtifactContract[];
  allowedReadScope: string[];
  allowedWriteScope: string[];
  forbiddenClaims: string[];
  timeoutMs: number;
  createdAt: string;
}

export interface VerificationScenarioVerdict {
  schemaVersion: "helmsman.verification-verdict.v1";
  runId: string;
  verificationRunId: string;
  verdictId: string;
  scenarioId: string;
  status: VerificationVerdictStatus;
  attempt: number;
  verifierRoleId: string;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeSnapshotHash: string;
  artifactId: string;
  artifactPath: string;
  artifactHash?: string;
  evidenceIds: string[];
  evidenceKinds: VerificationEvidenceKind[];
  executionStatus: OperationStatus | "not_run";
  criteriaSatisfied: string[];
  criteriaFailed: string[];
  criteriaBlocked: string[];
  observations: string[];
  residualRisk: string;
  followUpRequired: string[];
  missingAuthorityOrEnvironment?: string;
  recordedAt: string;
}

export interface VerificationRunFinishRecord {
  verificationRunId: string;
  status: Exclude<VerificationRunStatus, "running">;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeSnapshotHash: string;
  scenarioSummary: {
    passed: string[];
    failed: string[];
    blocked: string[];
    parked: string[];
    unverified: string[];
  };
  evidenceIds: string[];
  finishedAt: string;
}

export interface VerificationRunRecord {
  verificationRunId: string;
  status: VerificationRunStatus;
  planPath: string;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeSnapshotHash: string;
  scenarioIds: string[];
  expectedArtifactIds: string[];
  startedAt: string;
  finishedAt?: string;
  finish?: VerificationRunFinishRecord;
}

export interface MemoryPromotionCandidate {
  candidateId: string;
  claim: string;
  sourceRunId: string;
  sourceArtifactIds: string[];
  sourceEvidenceIds: string[];
  applicableScope: string;
  knownLimitations: string[];
  stalenessTrigger: string;
  contradictionNotes: string;
  suggestedDestinationNamespace: string;
  approvalPolicy: "explicit_user_approval_required";
}

export interface CloseoutRecord {
  schemaVersion: "helmsman.closeout.v1";
  runId: string;
  closeoutId: string;
  status: CloseoutStatus;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeSnapshotHash: string;
  verificationSummary: {
    passed: string[];
    failed: string[];
    blocked: string[];
    parked: string[];
  };
  acceptedArtifactIds: string[];
  residualRiskIds: string[];
  closeoutArtifactPath: string;
  renderedManifestPath: string;
  renderedBoardPath: string;
  evidenceIndexPath: string;
  memoryPromotionCandidatePath?: string;
  memoryPromotionCandidates?: MemoryPromotionCandidate[];
  recordedAt: string;
}

export interface ArtifactRecord {
  artifactId: string;
  path?: string;
  kind?: string;
  status: "expected" | "produced" | "submitted" | "accepted" | "rejected";
  producerOperationId?: string;
  sha256?: string;
  evidenceIds: string[];
}

export interface OperationRecord {
  operationId: string;
  kind: string;
  runtime: RuntimeKind;
  roleId: string;
  promptPath: string;
  eventLogPath: string;
  status: OperationStatus;
  startedAt: string;
  finishedAt?: string;
  timeoutMs?: number;
  artifactIds: string[];
  evidenceIds: string[];
  boardBefore: Revision;
  boardAfter?: Revision;
  routeAdherence: string;
}

export interface HelmsmanManifest {
  schemaVersion: "helmsman.pi-direct.v1";
  run: {
    id: string;
    title: string;
    workspace: string;
    createdAt: string;
    updatedAt: string;
    activeStage: RunStage;
    routeLock: {
      status: RouteLockStatus;
      proposalId?: string;
      proposalPath?: string;
      renderedPath?: string;
      readiness?: RouteLockReadiness;
      lockedAt?: string;
      lockedBy?: AuthoritySource;
      lockEventId?: string;
      snapshotPath?: string;
      snapshotHash?: string;
      confirmedSurfaceEvidenceId?: string;
      invalidatedBy?: string;
      invalidatedAt?: string;
      invalidation?: RouteLockInvalidationRecord;
    };
  };
  route: {
    goal: string;
    scope: RouteAssertion[];
    nonGoals: RouteAssertion[];
    assumptions: RouteAssertion[];
    risks: RouteRisk[];
    stopConditions: RouteAssertion[];
    successCriteria: RouteAssertion[];
    autonomyBoundary: AutonomyBoundary;
    verificationScenarios: VerificationScenario[];
  };
  questions: {
    bundles: Record<string, QuestionBundleContract>;
    surfaces: Record<string, QuestionSurfaceContract>;
    answers: Record<string, QuestionAnswerContract>;
    openQuestionIds: string[];
    waivedQuestionIds: string[];
  };
  memory: { scans: Record<string, MemoryScanPlan>; candidates: Record<string, MemoryCandidateJudgment> };
  research: {
    lanes: Record<string, ResearchLaneContract>;
    packets: Record<string, ResearchWorkerPacket>;
    syntheses: Record<string, ResearchSynthesisRecord>;
    submittedArtifactIds: string[];
    acceptedArtifactIds: string[];
    rejectedArtifactIds: string[];
    droppedLaneIds: string[];
  };
  roles: { bindings: Record<string, RoleBindingContract>; roleRuns: Record<string, Record<string, unknown>> };
  workers: { packets: Record<string, ResearchWorkerPacket>; lanes: Record<string, { packetId: string; status: ResearchLaneStatus; parallelGroupId: string }> };
  operations: { records: Record<string, OperationRecord> };
  artifacts: { records: Record<string, ArtifactRecord> };
  evidence: { records: Record<string, EvidenceRecord> };
  gates: Record<string, { status: GateStatus; hardBlockers: string[]; softWarnings: string[]; requiredEvidenceIds: string[]; lastEvaluatedByEventId?: string }>;
  scorecard: { currentScore: number; hardFloorPassed: boolean; lastMovement: string[] };
  adapters: { capabilityReports: Record<string, unknown>; diagnostics: Record<string, unknown> };
  amendments: {
    pending: Record<string, { amendment: RouteAmendment; renderedPath: string }>;
    applied: Record<string, RouteAmendmentApplication>;
    rejected: Record<string, RouteAmendmentRejection>;
  };
  autopilot: {
    loops: Record<string, AutopilotLoopRecord>;
    packets: Record<string, AutopilotPacket>;
    actionSelections: Record<string, AutopilotActionSelection>;
    driftRecords: Record<string, AutopilotDriftRecord>;
    recoveries: Record<string, AutopilotRecoveryRecord>;
  };
  verification: {
    runs: Record<string, VerificationRunRecord>;
    plans: Record<string, VerificationRunPlan>;
    scenarioContracts: Record<string, VerificationScenarioContract>;
    verdicts: Record<string, VerificationScenarioVerdict[]>;
    latestVerdictByScenario: Record<string, VerificationScenarioVerdict>;
    activeRunId?: string;
  };
  closeout: {
    records: Record<string, CloseoutRecord>;
    latestCloseoutId?: string;
    memoryPromotionCandidates: Record<string, MemoryPromotionCandidate>;
  };
}

export interface BoardNextAction {
  kind:
    | "continue_chat"
    | "ask_question_bundle"
    | "run_memory_scan"
    | "dispatch_research"
    | "synthesize"
    | "propose_route_lock"
    | "confirm_route_lock"
    | "run_autopilot_loop"
    | "run_verification"
    | "closeout"
    | "park";
  reason: string;
  requiredCommand?: string;
  requiresUserInput: boolean;
  requiredBoardRevision: Revision;
}

export interface BoardProjection {
  schemaVersion: "helmsman.board.v1";
  runId: string;
  revision: Revision;
  rebuiltFromEventSequence: number;
  generatedAt: string;
  manifestHash: string;
  projectionHash: string;
  activeStage: RunStage;
  routeLock: HelmsmanManifest["run"]["routeLock"];
  nextLegalAction: BoardNextAction;
  forbiddenActions: Array<{ action: string; reason: string; source: Record<string, string> }>;
  blockers: Array<{
    blockerId: string;
    severity: "info" | "warning" | "hard";
    blocks: "route_lock" | "autopilot" | "verification" | "closeout" | "release";
    reason: string;
    sourceEventId?: string;
    sourceQuestionId?: string;
    sourceOperationId?: string;
    sourceArtifactId?: string;
    sourceEvidenceId?: string;
    requiredAction: BoardNextAction["kind"];
  }>;
  openQuestions: string[];
  memory: Record<string, unknown>;
  research: Record<string, unknown>;
  autopilot: Record<string, unknown>;
  closeout: Record<string, unknown>;
  roles: Record<string, unknown>;
  operations: Record<string, unknown>;
  gates: Record<string, { gateId: string; status: GateStatus; hardBlockerIds: string[]; softWarningIds: string[]; requiredEvidenceIds: string[]; lastEvaluatedAt: string }>;
  scorecard: Record<string, unknown>;
  recentDelta: { fromRevision: Revision; toRevision: Revision; changedPaths: string[]; summary: string[] };
  driftWarnings: Array<Record<string, unknown>>;
  pendingAmendments: string[];
  verification: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  recovery: { canReplay: boolean; lastGoodEventSequence: number; projectionStale: boolean; requiredCommand?: string };
}
