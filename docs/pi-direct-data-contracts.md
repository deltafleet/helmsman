# Pi-Direct Data Contracts

Status: current binding data contract for the Pi-direct product route

## Purpose

This document closes the first product-level contract gap left by
`pi-direct-ultimate-product-design.md`: exact durable state, event, Board,
operation, role-runner, and Question UI Adapter contracts.

Core append transactions, reducer behavior, Board projector behavior, gate
evaluation, replay, recovery, and stable Core error codes are binding in
`docs/core-event-reducer-board-contract.md`.

The goal is not to create paperwork before implementation. The goal is to make
Helmsman implementable without letting Pi, a TUI component, a model reply, a
chat transcript, or an external adapter become the hidden source of truth.

## Contract Rules

- The Manifest is the only machine source of truth for route state.
- `manifest.events.jsonl` is the append-only authority log.
- `board.json` is a rebuildable projection, not an independent authority file.
- Pi session files are evidence links and replay inputs only.
- UI state is never accepted until Core records an event.
- Runtime output is never accepted until Core validates the expected artifact
  and evidence.
- No generic `setState`, arbitrary JSON patch, or adapter-authored route mutation
  is allowed.
- Fake providers can prove unit contracts only. Live-provider claims require
  live-provider evidence.

## Files

Canonical run layout:

```text
.helmsman/sessions/<run-id>/
  manifest.json
  manifest.events.jsonl
  board.json
  question-ledger.json
  role-registry.json
  scorecard.json
  memory-index.md
  memory/
    <scan-id>.md
  research-index.md
  worker-packets.md
  research/
    <slug>.md
  question-design/
    <design-id>.json
  role-runs/
    <role-run-id>/
      plan.json
      prompt.md
      pi-events.jsonl
      transcript.jsonl
      tool-events.jsonl
      artifacts.json
      diagnostics.json
      result.json
  verification/
    <pass-id>.md
  adapter/
    pi/
      <operation-id>.prompt.md
      <operation-id>.events.jsonl
      <operation-id>.session.json
      <operation-id>.last-message.md
    codex/
    opencode/
  rendered/
    manifest.md
    board.md
    route-card.md
  evidence/
    native-question-surface.jsonl
    pi-session-links.jsonl
    artifact-index.jsonl
  operation-state.json
  closeout.md
```

Writes to canonical JSON files must be atomic. Appending an event and rebuilding
projections must happen under the run lock:

```text
.helmsman/sessions/<run-id>/session.lock
```

## Common Primitives

All timestamps are ISO 8601 strings with timezone or `Z`.

```ts
type RunId = string;
type EventId = string;
type Revision = number;
type RoleId = string;
type OperationId = string;
type ArtifactId = string;
type EvidenceId = string;
type QuestionBundleId = string;
type QuestionId = string;
type OptionId = string;
type ResearchLaneId = string;
type VerificationScenarioId = string;

type AuthoritySource =
  | "user"
  | "lead_default"
  | "core_policy"
  | "role_runner"
  | "external_adapter"
  | "verifier";

type RuntimeKind =
  | "pi"
  | "codex"
  | "opencode"
  | "omp"
  | "claude_code"
  | "manual";

type OperationStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "aborted"
  | "interrupted"
  | "parked";

type GateStatus =
  | "not_evaluated"
  | "blocked"
  | "ready"
  | "passed"
  | "failed"
  | "waived";
```

IDs must be generated from a stable run-local id generator. The prefix may name
the domain for readability, but meaning must come from the typed field, not from
parsing the id string.

## Manifest Shape

`manifest.json`:

```ts
interface HelmsmanManifest {
  schemaVersion: "helmsman.pi-direct.v1";
  run: RunState;
  route: RouteState;
  questions: QuestionState;
  memory: MemoryState;
  research: ResearchState;
  roles: RoleState;
  workers: WorkerState;
  operations: OperationState;
  artifacts: ArtifactState;
  evidence: EvidenceState;
  gates: GateState;
  scorecard: ScorecardState;
  adapters: AdapterState;
  amendments: AmendmentState;
}
```

Required run state:

```ts
interface RunState {
  id: RunId;
  title: string;
  workspace: string;
  createdAt: string;
  updatedAt: string;
  activeStage:
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
  routeLock: {
    status: "unlocked" | "lock_ready" | "locked" | "invalidated";
    lockedAt?: string;
    lockedBy?: AuthoritySource;
    lockEventId?: EventId;
    snapshotPath?: string;
    snapshotHash?: string;
    invalidatedBy?: EventId;
  };
}
```

Required route state:

```ts
interface RouteState {
  goal: string;
  scope: string[];
  nonGoals: string[];
  assumptions: RouteAssertion[];
  risks: RouteRisk[];
  stopConditions: RouteAssertion[];
  successCriteria: RouteAssertion[];
  autonomyBoundary: AutonomyBoundary;
  verificationScenarios: VerificationScenario[];
}

interface RouteAssertion {
  id: string;
  text: string;
  sourceEventId: EventId;
  evidenceIds: EvidenceId[];
}

interface RouteRisk extends RouteAssertion {
  severity: "low" | "medium" | "high" | "critical";
  mitigation?: string;
}

interface AutonomyBoundary {
  canEditFiles: boolean;
  canRunCommands: boolean;
  canUseNetwork: boolean;
  canInstallDependencies: boolean;
  canUseExternalAdapters: boolean;
  mustAskBefore: string[];
}
```

The Manifest may contain additional domains only after the schema version is
bumped or a migration event records the extension.

## Event Envelope

Each line in `manifest.events.jsonl` is one event:

```ts
interface ManifestEvent<TType extends string, TPayload> {
  eventId: EventId;
  runId: RunId;
  sequence: number;
  type: TType;
  createdAt: string;
  actor: {
    kind: AuthoritySource;
    id: string;
    roleId?: RoleId;
    operationId?: OperationId;
  };
  causality: {
    parentEventId?: EventId;
    commandId?: string;
    boardRevisionRead?: Revision;
    operationId?: OperationId;
  };
  payload: TPayload;
}
```

Reducers must reject an event when:

- `sequence` is not the next sequence.
- required causality is missing.
- the actor lacks authority for the event type.
- the event would violate the active Board's forbidden actions.
- the event tries to mutate route state through an untyped payload.

## Event Types

### Run Events

```ts
type RunCreated = ManifestEvent<"run.created", {
  title: string;
  workspace: string;
  initialIntent?: string;
}>;

type StageChanged = ManifestEvent<"run.stage_changed", {
  from: RunState["activeStage"];
  to: RunState["activeStage"];
  reason: string;
}>;
```

`run.created` initializes the Manifest. `run.stage_changed` may only move to a
legal next stage computed by Core.

### Role Events

```ts
type RoleBindingSet = ManifestEvent<"role.binding_set", {
  binding: RoleBindingContract;
  evidenceIds: EvidenceId[];
}>;

type RoleRunPlanned = ManifestEvent<"role.run_planned", {
  roleRunId: string;
  operationId: OperationId;
  roleId: RoleId;
  planPath: string;
  promptPath: string;
  boardRevisionRead: Revision;
}>;

type RoleRunStarted = ManifestEvent<"role.run_started", {
  roleRunId: string;
  operationId: OperationId;
  runtime: RuntimeKind;
  piSessionId?: string;
  eventLogPath: string;
}>;

type RoleRunEvidenceCaptured = ManifestEvent<"role.run_evidence_captured", {
  roleRunId: string;
  eventLogPath: string;
  transcriptPath: string;
  toolEventsPath: string;
  evidenceIds: EvidenceId[];
}>;

type RoleRunFinished = ManifestEvent<"role.run_finished", {
  roleRunId: string;
  operationId: OperationId;
  resultPath: string;
  status:
    | "completed"
    | "failed"
    | "timed_out"
    | "aborted"
    | "blocked"
    | "rejected";
  artifactIds: ArtifactId[];
  evidenceIds: EvidenceId[];
}>;
```

Role bindings are runtime inputs. A role binding never grants route authority.
`RoleBindingContract`, `RoleRunPlan`, role-run result files, concurrency, and
worker-packet mapping are defined in `docs/pi-role-runtime-contract.md`.
`role.run_finished` means execution settled; it does not accept artifacts,
advance phase state, pass verification, or close a run.

### Question Events

```ts
type QuestionBundleAsked = ManifestEvent<"question.bundle_asked", {
  bundle: QuestionBundleContract;
  surface: QuestionSurfaceContract;
}>;

type QuestionAnswered = ManifestEvent<"question.answered", {
  bundleId: QuestionBundleId;
  questionId: QuestionId;
  answer: QuestionAnswerContract;
  appliedRouteEffects: RouteEffect[];
  evidenceIds: EvidenceId[];
}>;

type QuestionWaived = ManifestEvent<"question.waived", {
  bundleId: QuestionBundleId;
  questionId: QuestionId;
  reason: string;
  waivedBy: AuthoritySource;
  lockImpact: "none" | "blocks_lock" | "requires_user_confirmation";
}>;
```

`question.bundle_asked` requires 1 to 4 questions. Each question requires 2 to 4
options unless the type is explicitly a free-form verification note. User-owned
route-changing questions cannot be answered by a recommendation.

### Memory Events

The detailed Memory and Research semantics are binding in
`docs/memory-research-contract.md`.

```ts
type MemoryScanCreated = ManifestEvent<"memory.scan_created", {
  scanId: string;
  routeQuestion: string;
  apertureAnswerEventIds: EventId[];
  artifactPath: string;
}>;

type MemoryCandidateClassified = ManifestEvent<"memory.candidate_classified", {
  scanId: string;
  candidateId: string;
  sourceRef: string;
  classification: "reused" | "stale" | "irrelevant" | "missing" | "conflict";
  routeEffectIds: string[];
  reason: string;
}>;
```

Core must reject broad memory scans before the first Aperture answer.

### Research Events

The detailed lane, packet, artifact, synthesis, and Board projection semantics
are binding in `docs/memory-research-contract.md`.

```ts
type ResearchLaneDeclared = ManifestEvent<"research.lane_declared", {
  laneId: ResearchLaneId;
  slug: string;
  routeChangingQuestion: string;
  laneType: "local_code" | "docs" | "external_reference" | "memory_refresh" | "runtime_probe" | "adapter_probe";
  sourcesToInspect: string[];
  sourcesToSkip: string[];
  expectedArtifactPath: string;
  ownerRoleId: RoleId;
  allowedWriteScope: string[];
  acceptanceCriteria: string[];
  decisionImpact: string;
  openUncertainty: string;
}>;

type ResearchArtifactSubmitted = ManifestEvent<"research.artifact_submitted", {
  laneId: ResearchLaneId;
  operationId?: OperationId;
  artifactId: ArtifactId;
  artifactPath: string;
  evidenceIds: EvidenceId[];
}>;

type ResearchArtifactAccepted = ManifestEvent<"research.artifact_accepted", {
  laneId: ResearchLaneId;
  artifactId: ArtifactId;
  acceptedBy: AuthoritySource;
  routeEffects: RouteEffect[];
  scoreEffects: ScoreEffect[];
}>;

type ResearchLaneDropped = ManifestEvent<"research.lane_dropped", {
  laneId: ResearchLaneId;
  reason: string;
  droppedBy: AuthoritySource;
  lockImpact: "none" | "blocks_lock" | "requires_user_confirmation";
}>;
```

Every active lane must end with exactly one accepted artifact or one drop event.

### Operation Events

```ts
type OperationStarted = ManifestEvent<"operation.started", {
  operationId: OperationId;
  runtime: RuntimeKind;
  roleId: RoleId;
  promptPath: string;
  eventLogPath: string;
  expectedArtifacts: ArtifactExpectation[];
  boardRevisionRead: Revision;
  timeoutMs: number;
}>;

type OperationEventCaptured = ManifestEvent<"operation.event_captured", {
  operationId: OperationId;
  runtimeEventPath: string;
  eventKind: string;
  safeSummary: string;
}>;

type OperationFinished = ManifestEvent<"operation.finished", {
  operationId: OperationId;
  status: OperationStatus;
  finishedAt: string;
  exitCode?: number;
  lastMessagePath?: string;
  producedArtifactIds: ArtifactId[];
  evidenceIds: EvidenceId[];
}>;
```

Operation completion does not accept artifacts. Artifact acceptance is a separate
Core event.

### Artifact And Evidence Events

```ts
type ArtifactExpected = ManifestEvent<"artifact.expected", {
  artifact: ArtifactExpectation;
}>;

type ArtifactProduced = ManifestEvent<"artifact.produced", {
  artifactId: ArtifactId;
  path: string;
  kind: "research" | "patch" | "verification" | "diagnostic" | "closeout";
  producerOperationId?: OperationId;
  sha256?: string;
}>;

type ArtifactAccepted = ManifestEvent<"artifact.accepted", {
  artifactId: ArtifactId;
  acceptedBy: AuthoritySource;
  evidenceIds: EvidenceId[];
  reason: string;
}>;

type EvidenceRecorded = ManifestEvent<"evidence.recorded", {
  evidence: EvidenceRecord;
}>;
```

Raw secrets must never be stored as artifact or evidence payloads.

### Route Lock And Amendment Events

The binding detailed Route Lock, snapshot hash, confirmation surface,
amendment, unlock, invalidation, and Autopilot precondition contract is
`docs/route-lock-amendment-contract.md`.

```ts
type RouteLockProposed = ManifestEvent<"route_lock.proposed", {
  proposalId: string;
  snapshotPath: string;
  snapshotHash: string;
  renderedPath: string;
  readinessEvidenceIds: EvidenceId[];
  remainingRisks: string[];
  evidenceIds: EvidenceId[];
}>;

type RouteLocked = ManifestEvent<"route_lock.locked", {
  proposalId: string;
  confirmedBy: "user";
  confirmedSurfaceEvidenceId: EvidenceId;
  snapshotPath: string;
  snapshotHash: string;
  routeCardPath: string;
}>;

type RouteUnlocked = ManifestEvent<"route_lock.unlocked", {
  reason: string;
  unlockedBy: AuthoritySource;
  previousSnapshotHash: string;
  requiredNextStage: "charting";
  evidenceIds: EvidenceId[];
}>;

type RouteLockInvalidated = ManifestEvent<"route_lock.invalidated", {
  previousSnapshotHash: string;
  reason: string;
  severity: "warning" | "hard";
  evidenceIds: EvidenceId[];
  requiredResponse: "ask" | "amend" | "unlock" | "park" | "stop";
}>;

type AmendmentProposed = ManifestEvent<"amendment.proposed", {
  amendmentId: string;
  kind:
    | "scope_refinement"
    | "success_criteria_change"
    | "non_goal_change"
    | "autonomy_boundary_change"
    | "verification_change"
    | "research_evidence_update"
    | "stop_condition_change"
    | "risk_update"
    | "unlock_required";
  reason: string;
  routeEffects: RouteEffect[];
  invalidatesLock: boolean;
  requiresUserConfirmation: boolean;
  evidenceIds: EvidenceId[];
}>;

type AmendmentApplied = ManifestEvent<"amendment.applied", {
  amendmentId: string;
  appliedBy: "user" | "core_policy";
  previousSnapshotHash: string;
  newSnapshotPath: string;
  newSnapshotHash: string;
  evidenceIds: EvidenceId[];
}>;

type AmendmentRejected = ManifestEvent<"amendment.rejected", {
  amendmentId: string;
  rejectedBy: AuthoritySource;
  reason: string;
}>;
```

Only the user can confirm initial Route Lock. Core may unlock or invalidate a
route when evidence proves the current route is unsafe or stale.
Role-run output, adapter output, rendered Markdown, and TUI state cannot apply
an amendment or lock a route.

### Autopilot And Verification Events

The detailed loop semantics are binding in `docs/autopilot-loop-contract.md`.
The detailed Verification and Closeout semantics are binding in
`docs/verification-closeout-contract.md`.

```ts
type AutopilotActionSelected = ManifestEvent<"autopilot.action_selected", {
  loopId: string;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeLockEventId: EventId;
  lockedSnapshotHash: string;
  nextLegalAction: BoardNextAction;
  selectionReason: string;
  forbiddenActionCount: number;
}>;

type AutopilotPacketPrepared = ManifestEvent<"autopilot.packet_prepared", {
  loopId: string;
  loopPlanPath: string;
  packetPaths: string[];
  roleRunPlanIds: string[];
  expectedArtifactIds: ArtifactId[];
  stopConditionIds: string[];
}>;

type AutopilotLoopStarted = ManifestEvent<"autopilot.loop_started", {
  loopId: string;
  attempt: number;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeLockEventId: EventId;
  lockedSnapshotHash: string;
  nextLegalAction: BoardNextAction;
  loopPlanPath: string;
  packetPaths: string[];
}>;

type DriftDetected = ManifestEvent<"autopilot.drift_detected", {
  loopId: string;
  severity: "minor" | "route_changing" | "critical" | "missing_evidence" | "forbidden_authority_claim";
  evidenceIds: EvidenceId[];
  requiredResponse: "repair" | "ask" | "amend" | "park" | "stop";
}>;

type AutopilotRouteAdherenceEvaluated = ManifestEvent<"autopilot.route_adherence_evaluated", {
  loopId: string;
  operationIds: OperationId[];
  artifactIds: ArtifactId[];
  evidenceIds: EvidenceId[];
  result:
    | "adherent"
    | "minor_drift"
    | "route_changing_drift"
    | "critical_drift"
    | "missing_evidence"
    | "forbidden_authority_claim";
  driftEventIds: EventId[];
}>;

type AutopilotLoopFinished = ManifestEvent<"autopilot.loop_finished", {
  loopId: string;
  status:
    | "continued"
    | "repaired"
    | "audited"
    | "asked"
    | "amended"
    | "parked"
    | "stopped"
    | "failed"
    | "timed_out";
  routeAdherence:
    | "adherent"
    | "minor_drift"
    | "route_changing_drift"
    | "critical_drift"
    | "missing_evidence"
    | "forbidden_authority_claim";
  boardRevisionAfter: Revision;
  boardProjectionHashAfter: string;
  boardDeltaId: string;
  acceptedArtifactIds: ArtifactId[];
  rejectedArtifactIds: ArtifactId[];
  nextDecision: BoardNextAction["kind"];
}>;

type VerificationRunStarted = ManifestEvent<"verification.run_started", {
  plan: VerificationRunPlan;
  planPath: string;
}>;

type VerificationResultRecorded = ManifestEvent<"verification.result_recorded", {
  runId: RunId;
  verificationRunId: string;
  verdictId: string;
  scenarioId: VerificationScenarioId;
  status: "passed" | "failed" | "blocked" | "parked";
  attempt: number;
  verifierRoleId: RoleId;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeSnapshotHash: string;
  artifactId: ArtifactId;
  artifactPath: string;
  artifactHash?: string;
  evidenceIds: EvidenceId[];
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
}>;

type VerificationRunFinished = ManifestEvent<"verification.run_finished", {
  verificationRunId: string;
  status: "completed" | "failed" | "blocked" | "parked";
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeSnapshotHash: string;
  scenarioSummary: {
    passed: VerificationScenarioId[];
    failed: VerificationScenarioId[];
    blocked: VerificationScenarioId[];
    parked: VerificationScenarioId[];
    unverified: VerificationScenarioId[];
  };
  evidenceIds: EvidenceId[];
  finishedAt: string;
}>;

type CloseoutRecorded = ManifestEvent<"closeout.recorded", {
  runId: RunId;
  closeoutId: string;
  status: "completed" | "parked" | "blocked" | "failed";
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeSnapshotHash: string;
  verificationSummary: {
    passed: VerificationScenarioId[];
    failed: VerificationScenarioId[];
    blocked: VerificationScenarioId[];
    parked: VerificationScenarioId[];
  };
  acceptedArtifactIds: ArtifactId[];
  residualRiskIds: string[];
  closeoutArtifactPath: string;
  renderedManifestPath: string;
  renderedBoardPath: string;
  evidenceIndexPath: string;
  memoryPromotionCandidatePath?: string;
  memoryPromotionCandidates?: MemoryPromotionCandidate[];
  recordedAt: string;
}>;
```

Memory promotion candidates are carried inside `closeout.recorded`; Core never
silently writes global memory.

Autopilot must read the current Board revision before starting a loop. If the
Board revision changes incompatibly before operation launch, the loop must stop
and re-evaluate.

## Route Effects

Question options, research acceptance, amendments, and verification results use
typed route effects. They do not contain raw patches.

```ts
type RouteEffect =
  | { id: string; kind: "route.scope.add"; text: string }
  | { id: string; kind: "route.scope.remove"; targetId: string; reason: string }
  | { id: string; kind: "route.non_goal.add"; text: string }
  | { id: string; kind: "route.assumption.add"; text: string }
  | { id: string; kind: "route.risk.add"; text: string; severity: RouteRisk["severity"]; mitigation?: string }
  | { id: string; kind: "route.stop_condition.add"; text: string }
  | { id: string; kind: "route.success_criterion.add"; text: string }
  | { id: string; kind: "route.verification_scenario.add"; scenario: VerificationScenario }
  | { id: string; kind: "route.autonomy_boundary.set"; boundary: Partial<AutonomyBoundary> }
  | { id: string; kind: "research.lane.request"; laneDraft: ResearchLaneDraft }
  | { id: string; kind: "gate.block"; gateId: string; blockerId: string; reason: string }
  | { id: string; kind: "gate.unblock"; gateId: string; blockerId: string; reason: string };
```

Core maps these effects to concrete Manifest state changes. UI and runtime
adapters must not apply them directly.

## Question Bundle Contract

```ts
interface QuestionBundleContract {
  bundleId: QuestionBundleId;
  purpose: "aperture" | "decision" | "amendment" | "verification" | "stop";
  title: string;
  routeQuestion: string;
  questions: QuestionContract[];
  maxQuestions: 4;
  lockImpact: "none" | "blocks_lock" | "requires_user_confirmation";
  createdByRoleId: RoleId;
}

interface QuestionContract {
  questionId: QuestionId;
  type: "single_select" | "multi_select" | "free_text";
  prompt: string;
  whyItMatters: string;
  options: QuestionOptionContract[];
  recommendedOptionId?: OptionId;
  recommendationReason?: string;
  allowFreeForm: boolean;
  requiredForLock: boolean;
  routeEffectsByOption: Record<OptionId, RouteEffect[]>;
}

interface QuestionOptionContract {
  optionId: OptionId;
  label: string;
  description: string;
  tradeoffs: string[];
  opens: string[];
  closes: string[];
}
```

Validation rules:

- A bundle must contain 1 to 4 questions.
- Select questions must contain 2 to 4 options.
- A recommended option must be one of the declared options.
- A recommendation is not an answer.
- A free-form answer must be preserved verbatim and may require a Core-authored
  follow-up route-effect event before Route Lock.
- Every route-changing option must have at least one route effect or an explicit
  reason it changes only authority/evidence.

## Question UI Adapter Contract

Question rendering is a product authority surface.

```ts
interface QuestionSurfaceContract {
  surfaceId: string;
  renderer: "pi_tui" | "rpiv_wrapper" | "headless_cli";
  rendererVersion: string;
  displayedAt: string;
  transcriptEvidencePath: string;
  width?: number;
  locale: string;
  bundleHash: string;
}

interface QuestionAnswerContract {
  questionId: QuestionId;
  selectedOptionIds: OptionId[];
  freeFormText?: string;
  answeredAt: string;
  authority: "user";
  surfaceId: string;
  userVisibleBundleHash: string;
  answerDetails: {
    optionLabels: string[];
    optionDescriptions: string[];
    perOptionNotes?: Record<OptionId, string>;
    cancellationReason?: string;
  };
}
```

The adapter must fail closed when it cannot prove that the displayed bundle hash
matches the Core-authored bundle hash. In that case Core records a renderer
failure operation; it does not infer an answer from partial UI state.

`@juicesharp/rpiv-ask-user-question` may be used only through a wrapper that
preserves this contract. If the package cannot expose stable ids, answer
details, cancellation, or full-surface evidence, the wrapper must supplement the
missing evidence or the product must use a Core-owned Pi TUI renderer for that
bundle.

The binding integration decision is in `question-ui-adapter-decision.md`.
Current default: implement a Core-owned Pi TUI renderer first; treat rpiv as a
UX reference and optional wrapper candidate, not as the default route-authority
surface.

## Operation State

`operation-state.json` is a runtime monitor projection. It is rebuildable from
events and operation evidence:

```ts
interface OperationStateFile {
  schemaVersion: "helmsman.operation-state.v1";
  runId: RunId;
  updatedAt: string;
  operations: OperationRecord[];
}

interface OperationRecord {
  operationId: OperationId;
  kind:
    | "chat"
    | "question_design"
    | "memory_scan"
    | "research"
    | "synthesis"
    | "autopilot"
    | "verification"
    | "doctor"
    | "qa";
  runtime: RuntimeKind;
  roleId: RoleId;
  provider?: string;
  model?: string;
  thinking?: string;
  mode?: string;
  promptPath: string;
  eventLogPath: string;
  piSessionId?: string;
  externalSessionId?: string;
  status: OperationStatus;
  startedAt: string;
  finishedAt?: string;
  timeoutMs?: number;
  cancelRequestedAt?: string;
  artifactIds: ArtifactId[];
  evidenceIds: EvidenceId[];
  boardBefore: Revision;
  boardAfter?: Revision;
  routeAdherence:
    | "not_evaluated"
    | "adherent"
    | "minor_drift"
    | "route_changing_drift"
    | "critical_drift"
    | "missing_evidence"
    | "forbidden_authority_claim"
    | "failed";
  retryCommand?: string;
  resumeCommand?: string;
}
```

`operation-state.json` may drive the UI, but Core events decide whether a phase
advanced.

## Board Projection

`board.json`:

```ts
interface BoardProjection {
  schemaVersion: "helmsman.board.v1";
  runId: RunId;
  revision: Revision;
  rebuiltFromEventSequence: number;
  generatedAt: string;
  activeStage: RunState["activeStage"];
  routeLock: RunState["routeLock"];
  nextLegalAction: BoardNextAction;
  forbiddenActions: BoardForbiddenAction[];
  blockers: BoardBlocker[];
  openQuestions: QuestionId[];
  memory: BoardMemorySummary;
  research: BoardResearchSummary;
  roles: BoardRoleSummary;
  operations: BoardOperationSummary;
  gates: Record<string, BoardGate>;
  scorecard: BoardScorecard;
  recentDelta: BoardDelta;
  driftWarnings: BoardDriftWarning[];
  pendingAmendments: string[];
  verification: BoardVerificationSummary;
  artifacts: BoardArtifactSummary;
  recovery: BoardRecoveryHints;
}
```

Board next action:

```ts
interface BoardNextAction {
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
```

Board invariants:

- `revision` increments only when projected content changes.
- `rebuiltFromEventSequence` must match the latest accepted event sequence.
- `nextLegalAction.requiredBoardRevision` must equal the Board revision that an
  Autopilot loop reads before acting.
- Every blocker must cite an event, gate, question, operation, artifact, or
  evidence record.
- No Board field may be edited directly; it is rebuilt.
- The detailed Board hash, replay, stale-projection, and recovery rules are in
  `docs/core-event-reducer-board-contract.md`.

## Gate Evaluation

```ts
interface GateState {
  charting: GateRecord;
  memory: GateRecord;
  research: GateRecord;
  routeLock: GateRecord;
  autopilot: GateRecord;
  verification: GateRecord;
  closeout: GateRecord;
}

interface GateRecord {
  gateId: string;
  status: GateStatus;
  hardBlockers: string[];
  softWarnings: string[];
  requiredEvidenceIds: EvidenceId[];
  lastEvaluatedAt?: string;
  lastEvaluatedByEventId?: EventId;
}
```

Gate predicates, stable blocker codes, command legality, route-lock
immutability, and replay/recovery behavior are binding in
`docs/core-event-reducer-board-contract.md`.

Route Lock is blocked when any required gate has a hard blocker, any
user-owned route-changing question remains unanswered, or any required evidence
record is missing.

## Product QA Evidence

The no-mock product audit must map each North Star requirement to evidence:

```ts
interface ProductAuditRequirement {
  requirementId: string;
  requirementText: string;
  evidenceKind:
    | "schema"
    | "unit_test"
    | "replay_test"
    | "tui_pty"
    | "live_pi_provider"
    | "live_agent_session"
    | "package_install"
    | "manual_review";
  evidenceRefs: string[];
  status: "proved" | "contradicted" | "incomplete" | "missing" | "not_applicable";
  reason: string;
}
```

An audit can pass only when every non-optional requirement is `proved`. A green
test suite without requirement mapping is insufficient.
The binding install, doctor, product-audit, no-mock audit, and release evidence
contract is `docs/install-doctor-product-audit-contract.md`.

## Design Closure Checklist

The Pi-direct design is not implementation-complete until these contracts have
code and verification:

- Manifest event parser and validator.
- Deterministic Manifest reducer.
- Deterministic Board projector.
- Atomic append and lock behavior.
- Question UI Adapter bundle hash and answer evidence checks.
- Role runtime resolver backed by Pi capabilities.
- Operation state reconstruction from events.
- Artifact and evidence acceptance rules.
- Route Lock gate evaluator.
- Autopilot Board-read enforcement.
- Product audit requirement mapper.

This checklist is not a product scope reduction. It is the minimum evidence
needed to prove the ultimate product is real rather than a polished narrative.
