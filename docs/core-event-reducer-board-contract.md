# Core Event Reducer And Board Contract

Status: Gate 2 implemented and verified for Manifest event append,
deterministic reducers, Board projection, gate evaluation, replay, recovery,
and command legality

## Purpose

This contract closes the Core authority surface. It defines how Helmsman accepts
commands, appends Manifest events, rebuilds the machine Manifest, projects the
Board, evaluates gates, rejects illegal state transitions, and recovers after a
process interruption.

Without this contract, Helmsman risks becoming polished prose over ambiguous
state. The product requirement is stricter: every invocation must leave enough
recorded state for the next invocation to choose the correct legal branch.

## Decision

The append-only event log is the authority trail.

```text
Command
-> Core validates preconditions against Manifest + Board
-> Core appends one or more typed Manifest events under run lock
-> Core rebuilds Manifest from event sequence
-> Core rebuilds Board from Manifest + accepted evidence
-> Core writes projections atomically
-> Core returns next legal action, blockers, and evidence refs
```

No UI, Pi AgentSession, role runner, external adapter, Markdown render,
transcript, or final assistant message may mutate state directly.

## Files

Canonical Core files:

```text
.helmsman/sessions/<run-id>/
  manifest.events.jsonl
  manifest.json
  board.json
  question-ledger.json
  role-registry.json
  scorecard.json
  operation-state.json
  session.lock
  rendered/
    manifest.md
    board.md
    route-card.md
```

Recovery and diagnostics:

```text
.helmsman/sessions/<run-id>/
  core/
    append-journal.jsonl
    replay-report.json
    projector-report.json
    gate-report.json
    corruption-report.json
```

The `core/` files are diagnostics and recovery evidence. They do not supersede
`manifest.events.jsonl`.

## Implementation Status

Gate 2 is implemented in this worktree with:

- `helmsman core create`, `core resume`, `core replay`, and typed `core command`
- Core command registry for the required command surface
- append-only `manifest.events.jsonl` authority log under `session.lock`
- pre-append event validation so rejected events are not persisted
- deterministic Manifest reducer and Board projector
- stable Core error codes for sequence, actor, stale Board, stage, route lock,
  gate, projection, and secret failures
- atomic projection writes for Manifest, Board, generated Markdown, ledgers,
  scorecard, and Core diagnostics
- stale projection recovery through `core replay --repair`
- `npm run verify:core`

Gate 2 does not implement the native TUI, Charting form renderer, RoleRuntime,
Memory/Research execution, Route Lock UI confirmation, Autopilot execution,
verification closeout, or installed-state product audit.

## Event Append Transaction

An append transaction is the only way to change authoritative state.

```ts
interface AppendTransaction {
  transactionId: string;
  runId: RunId;
  commandId: string;
  boardRevisionRead: Revision;
  expectedNextSequence: number;
  actor: ManifestEvent<string, unknown>["actor"];
  events: ManifestEvent<string, unknown>[];
  writes: AtomicWritePlan[];
}

interface AtomicWritePlan {
  path: string;
  kind:
    | "append_event_log"
    | "write_manifest"
    | "write_board"
    | "write_projection"
    | "write_diagnostic";
  sha256Before?: string;
  sha256After?: string;
}
```

Transaction order:

1. Acquire `session.lock`.
2. Read `manifest.events.jsonl`, `manifest.json`, and `board.json`.
3. Verify event log sequence and projection hashes.
4. Verify `boardRevisionRead` matches the current Board unless the command is
   explicitly read-only or recovery-only.
5. Validate command preconditions.
6. Build typed events with the next contiguous sequence numbers.
7. Append events to a temporary log or journal entry.
8. Replay the full event log into a new Manifest.
9. Project a new Board.
10. Render generated Markdown views.
11. Atomically replace projections.
12. Mark the append journal entry committed.
13. Release `session.lock`.

If any step fails before commit, the transaction is not accepted. If the process
dies after event append but before projection write, recovery must replay events
and rebuild projections before any mutating command proceeds.

## Event Envelope Requirements

Every event must satisfy the data contract in
`docs/pi-direct-data-contracts.md` and these additional invariants:

- `eventId` is unique within the run.
- `sequence` starts at `1` and increments by `1`.
- `createdAt` is monotonic non-decreasing within a run.
- `actor.kind` is authorized for the event type.
- `causality.commandId` is present for command-originated events.
- `causality.boardRevisionRead` is present for every mutating command after
  `run.created`.
- `causality.operationId` is present for role-run, adapter, artifact, and
  verification events derived from runtime work.
- payload schema is versioned and known.
- payload does not contain untyped route mutation patches.
- payload does not contain secrets.

Unknown event types are rejected unless a schema migration event explicitly
registers them for the current `schemaVersion`.

## Command Legality

Each command has:

```ts
interface CommandContract<TInput> {
  commandType: string;
  inputSchema: unknown;
  allowedStages: RunState["activeStage"][];
  readOnly: boolean;
  requiresBoardRevision: boolean;
  requiredActorKinds: AuthoritySource[];
  preconditions: CommandPrecondition[];
  eventsProduced: string[];
  projectionsUpdated: string[];
}

interface CommandPrecondition {
  code: string;
  description: string;
  onFailure: CoreErrorCode;
}
```

Command handlers must not write projections directly. They produce typed events
or typed read-only reports.

## Required Commands

The Core command contract must cover at least:

| Command | Read-only | Required stage | Product effect |
| --- | --- | --- | --- |
| `run.create` | no | none | creates run and initial projections |
| `run.resume` | yes | any | validates and reports current state |
| `chat.message_record` | no | `chat` | records user/assistant chat evidence without forcing Charting |
| `charting.enter` | no | `chat` | enters Charting explicitly |
| `question.bundle_ask` | no | `charting` | records Core-authored question bundle |
| `question.answer_record` | no | `charting` | records user answer and route effects |
| `memory.scan_record` | no | `memory_scan` | records scoped memory classification |
| `research.lane_plan` | no | `research` | declares research lane contract |
| `research.packet_prepare` | no | `research` | records Core-authored worker packets for lanes |
| `research.artifact_submit` | no | `research` | records role-run artifact as submitted |
| `research.artifact_accept` | no | `research`/`synthesis` | accepts validated research artifact and route effects |
| `research.artifact_reject` | no | `research` | records invalid research artifact evidence and repair blocker |
| `research.lane_drop` | no | `research`/`synthesis` | records explicit lane drop or waiver reason |
| `research.synthesis_record` | no | `synthesis` | records research wave synthesis and next legal action |
| `artifact.accept` | no | any relevant stage | accepts artifact into Manifest |
| `route.lock_propose` | no | `lock_ready` | records lock readiness proposal |
| `route.lock_confirm` | no | `lock_ready` | locks route with user authority |
| `route.amend_propose` | no | `locked`/`autopilot` | records route-changing amendment |
| `route.amend_apply` | no | `locked`/`autopilot` | applies user-approved amendment |
| `autopilot.loop_start` | no | `autopilot` | records Board revision read, action selection, loop plan, and packets |
| `autopilot.loop_finish` | no | `autopilot` | records route adherence, drift response, artifact decisions, and Board delta |
| `verification.run_start` | no | `verification` | records verifier plan, Board read, scenarios, and expected artifacts |
| `verification.result_record` | no | `verification` | records scenario verdict with artifact and evidence |
| `verification.run_finish` | no | `verification` | records scenario matrix delta and next decision |
| `closeout.record` | no | `closeout` | records closeout status, artifacts, evidence index, and memory candidates |
| `doctor.report` | yes | any | reports health without mutation |
| `core.replay` | yes | any | rebuilds and reports projections |

Additional commands may be added only with a command contract, event contract,
and verification scenario.

## Reducer Contract

The reducer is deterministic:

```ts
type ReducerResult =
  | { ok: true; manifest: HelmsmanManifest; warnings: ReducerWarning[] }
  | { ok: false; error: CoreError };

interface CoreError {
  code: CoreErrorCode;
  message: string;
  eventId?: EventId;
  sequence?: number;
  evidenceRefs: string[];
}
```

Reducer rules:

- The same event log always produces the same Manifest, excluding allowed
  generated timestamps in separate reports.
- Event order is sequence order, not file line trust alone.
- Duplicate sequence numbers fail replay.
- Gaps in sequence fail replay.
- Duplicate event ids fail replay.
- An event whose actor lacks authority fails replay.
- A typed payload that fails schema validation fails replay.
- A route-changing event after lock must create an amendment path or invalidate
  the lock; it cannot silently edit route state.
- Submitted artifacts are not accepted until an `artifact.accepted` event.
- Role-run completion is not artifact acceptance.
- Verification pass is not closeout.
- Closeout requires verification or an explicit parked/blocked closeout event.

## Board Projector Contract

The Board is rebuilt, not edited.

```ts
interface BoardProjection {
  schemaVersion: "helmsman.board.v1";
  runId: RunId;
  revision: Revision;
  rebuiltFromEventSequence: number;
  generatedAt: string;
  manifestHash: string;
  projectionHash: string;
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

Revision rules:

- `revision` starts at `1` after `run.created`.
- `revision` increments only when projected content changes.
- `rebuiltFromEventSequence` equals the latest accepted event sequence.
- `manifestHash` is a canonical hash of `manifest.json`.
- `projectionHash` is a canonical hash of the Board content excluding
  `generatedAt`.
- A projector replay from the same Manifest must produce the same
  `projectionHash`.

The Board must include enough state for the next command or Autopilot loop to
decide legally without reading chat history.

## Board Supporting Types

```ts
interface BoardForbiddenAction {
  action: string;
  reason: string;
  source:
    | { kind: "gate"; gateId: string }
    | { kind: "question"; questionId: QuestionId }
    | { kind: "route_lock"; eventId: EventId }
    | { kind: "autonomy_boundary"; assertionId: string }
    | { kind: "artifact"; artifactId: ArtifactId }
    | { kind: "evidence"; evidenceId: EvidenceId };
}

interface BoardBlocker {
  blockerId: string;
  severity: "info" | "warning" | "hard";
  blocks: "route_lock" | "autopilot" | "verification" | "closeout" | "release";
  reason: string;
  sourceEventId?: EventId;
  sourceQuestionId?: QuestionId;
  sourceOperationId?: OperationId;
  sourceArtifactId?: ArtifactId;
  sourceEvidenceId?: EvidenceId;
  requiredAction: BoardNextAction["kind"];
}

interface BoardGate {
  gateId: string;
  status: GateStatus;
  hardBlockerIds: string[];
  softWarningIds: string[];
  requiredEvidenceIds: EvidenceId[];
  lastEvaluatedAt: string;
}

interface BoardDelta {
  fromRevision: Revision;
  toRevision: Revision;
  changedPaths: string[];
  summary: string[];
}

interface BoardRecoveryHints {
  canReplay: boolean;
  lastGoodEventSequence: number;
  projectionStale: boolean;
  requiredCommand?: string;
}
```

The implementation may add richer summary types, but it must preserve these
fields and source links.

## Gate Evaluator Contract

Gates are deterministic predicates over Manifest, Board, and accepted evidence.

```ts
interface GateEvaluation {
  gateId: string;
  status: GateStatus;
  hardBlockers: GateBlocker[];
  softWarnings: GateWarning[];
  requiredEvidenceIds: EvidenceId[];
  evaluatedFromEventSequence: number;
}

interface GateBlocker {
  code: CoreErrorCode;
  message: string;
  sourceEventId?: EventId;
  requiredAction: BoardNextAction["kind"];
}
```

Required gates:

- `charting.bundle_surface`
- `charting.route_sharpness`
- `memory.scoped_scan`
- `memory.aperture_precondition`
- `research.lanes_accounted`
- `research.artifacts_validated`
- `research.synthesis_recorded`
- `route_lock.user_authority`
- `route_lock.no_open_blockers`
- `autopilot.board_read`
- `autopilot.no_stale_board`
- `autopilot.action_legality`
- `autopilot.route_adherence`
- `autopilot.drift_response`
- `verification.scenarios_declared`
- `verification.scenarios_passed`
- `verification.verdict_artifacts`
- `closeout.evidence_complete`
- `closeout.no_unresolved_required_scenarios`
- `release.product_audit`

The accepted model is a triple lock for state transitions:

```text
stage-owned command gating
+ phase/gate exit predicates
+ route/round lock immutability
```

A command that bypasses any one of these must be rejected.

## Error Codes

Core errors use stable codes:

```ts
type CoreErrorCode =
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
```

Tests should assert stable codes and output shape, not fragile prose.

## Route Lock And Amendment Semantics

Route Lock is immutable until a typed route event changes it.
The detailed lock readiness, snapshot hash, user confirmation, amendment,
unlock, and invalidation contract is
`docs/route-lock-amendment-contract.md`.

After `route_lock.locked`, route-changing changes require one of:

- `amendment.proposed` followed by user-approved `amendment.applied`
- `route_lock.invalidated` with blocker and recovery action
- `route_lock.unlocked` followed by re-Charting
- `operation.parked` when authority is missing

Research artifacts, role-run outputs, adapter transcripts, and UI state cannot
change a locked route directly.

## Replay And Recovery

`core.replay` is read-only by default. It may write diagnostics, but it must not
append authority events unless called as a recovery command with explicit
approval.

Replay must check:

- event log parseability
- sequence continuity
- event id uniqueness
- schema validity
- actor authority
- reducer determinism
- manifest hash
- Board projection hash
- rendered Markdown freshness
- operation-state freshness

Recovery states:

```text
healthy
projection_stale
event_log_corrupt
partial_transaction
schema_migration_required
manual_repair_required
```

When projections are stale but the event log is valid, recovery may rebuild
`manifest.json`, `board.json`, and rendered Markdown from events. When the event
log is corrupt, Core must stop mutating commands and produce
`core/corruption-report.json`.

## Compaction And Resume

Pi session compaction cannot change Core state.

Resume must load:

- latest valid Manifest
- latest Board projection
- latest event sequence
- pending question ledger
- operation-state projection
- recovery hints

If Pi chat/session history disagrees with Manifest or Board, Manifest and Board
win. The disagreement is recorded as diagnostic evidence.

## Verification Contract

Gate 2 is accepted only when focused verification proves:

- event append under `session.lock`
- atomic projection writes
- event sequence gap rejection
- duplicate event id rejection
- unauthorized actor rejection
- stale Board revision rejection
- illegal command stage rejection
- deterministic reducer replay
- deterministic Board projection hash
- projection stale recovery
- route lock immutability
- amendment-required behavior
- artifact submitted vs accepted separation
- role-run final message rejection
- gate evaluator hard blocker mapping
- closeout blocked until verification or parked status
- no secret persistence in events, Manifest, Board, rendered Markdown, or
  diagnostic reports

These tests are product authority tests. Passing unrelated package or runtime
checks cannot substitute for them.

## Non-Acceptance Cases

Do not accept Core Event System or Board projection if:

- a generic `setState` or untyped mutation event exists
- the Board can be edited directly
- reducers depend on chat transcript text
- event replay depends on wall-clock time except for diagnostic report fields
- route lock can be changed by role output or artifact text
- operation completion advances phase state automatically
- verification pass closes the run automatically
- closeout can happen without verification or an explicit parked/blocked state
- recovery hides event corruption
- tests use a narrow fixture to claim broad reducer correctness

## Handoff

This contract feeds Gate 2 directly and is a prerequisite for Charting Form
Authority, RoleRuntime acceptance, Board-governed Autopilot, verification, and
product audit. Later gates may add event types, but they must preserve the
append-only authority trail and deterministic replay model.

Gate 7 loop selection, packet preparation, drift response, repair/audit,
park/stop/ask/amend, and resume semantics are binding in
`docs/autopilot-loop-contract.md`.

Gate 5 memory scan, research lane, worker packet, artifact validation,
synthesis, and Board projection semantics are binding in
`docs/memory-research-contract.md`.

Gate 8 scenario-backed verifier runs, verdict artifacts, Board verification
matrix, closeout events, closeout artifacts, and Wiki Memory promotion
candidates are binding in `docs/verification-closeout-contract.md`.
