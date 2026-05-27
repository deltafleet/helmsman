# Route Lock And Amendment Contract

Status: current binding design for Route Lock, lock readiness, user
confirmation, route hashes, amendments, unlock, invalidation, and Autopilot
preconditions

## Purpose

This contract closes the boundary between Charting and Autopilot. Route Lock is
the point where a rough user request becomes a compiled route that long-running
agent work may execute. It must be strict enough that Autopilot cannot choose a
different destination while appearing to make progress.

Route Lock is not a green label in the UI. It is a Core-authored, user-confirmed
event backed by a canonical route snapshot, resolved blockers, rendered evidence,
and a Board projection that makes illegal actions visible.

## Decision

Only Helmsman Core can propose, confirm, unlock, invalidate, or amend a locked
route.

```text
Charting / Memory / Research / Synthesis
-> Core evaluates lock readiness gates
-> Core produces lock proposal + canonical route snapshot
-> user confirms on a rendered authority surface
-> Core records route_lock.locked
-> Board projects locked route and Autopilot preconditions
```

After lock, route-changing changes require an amendment, unlock, invalidation,
or park. Role-run output, adapter output, chat transcript text, TUI state, or a
model's final message cannot change the locked route.

## Prerequisites

Route Lock can be proposed only when:

- active stage is `lock_ready` or Core is evaluating transition into
  `lock_ready`
- all required Charting question bundles are answered, waived with explicit
  user authority, or converted into known route risks
- every required question surface has rendered evidence
- scoped memory scan is complete or explicitly waived by user authority
- selected research lanes are either complete, dropped with reason, or parked
  as known risk
- every artifact required for the route promise is accepted or explicitly
  deferred
- all route-changing free-form answers have a Core-authored route-effect event
- verification scenarios are declared
- no hard gate blocker remains
- the current Board revision matches the command's `boardRevisionRead`

Readiness is a deterministic gate evaluation, not lead judgment.

## Lock Readiness Gate

```ts
interface RouteLockReadiness {
  runId: RunId;
  evaluatedAt: string;
  boardRevisionRead: Revision;
  eventSequenceRead: number;
  status: "blocked" | "lock_ready";
  routeSnapshotHash?: string;
  hardBlockers: RouteLockBlocker[];
  softWarnings: RouteLockWarning[];
  requiredEvidenceIds: EvidenceId[];
}

interface RouteLockBlocker {
  blockerId: string;
  code:
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
  message: string;
  sourceEventId?: EventId;
  sourceQuestionId?: QuestionId;
  sourceArtifactId?: ArtifactId;
  sourceEvidenceId?: EvidenceId;
  requiredAction: BoardNextAction["kind"];
}
```

Core projects these blockers into the Board. A UI may summarize them, but it may
not hide a hard blocker behind a "lock-ready" affordance.

## Canonical Route Snapshot

Before asking for confirmation, Core builds a canonical lock snapshot:

```ts
interface RouteLockSnapshot {
  schemaVersion: "helmsman.route-lock-snapshot.v1";
  runId: RunId;
  eventSequence: number;
  boardRevision: Revision;
  route: RouteState;
  answeredQuestions: QuestionAnswerContract[];
  waivedQuestions: Array<{
    questionId: QuestionId;
    reason: string;
    waivedBy: AuthoritySource;
    evidenceIds: EvidenceId[];
  }>;
  memorySummary: MemoryState;
  researchSummary: ResearchState;
  acceptedArtifacts: ArtifactId[];
  verificationScenarios: VerificationScenario[];
  knownRisks: RouteRisk[];
  autonomyBoundary: AutonomyBoundary;
}
```

The lock hash is a canonical SHA-256 hash over the snapshot excluding generated
timestamps and display-only Markdown. It must include:

- route goal, scope, non-goals, assumptions, stop conditions, risks, success
  criteria, autonomy boundary, and verification scenarios
- every answered or waived route-changing question
- applied route effects
- memory classifications used for the route
- selected and skipped research lanes
- accepted artifact ids and hashes
- known deferred risks
- event sequence and Board revision

The snapshot is written to:

```text
.helmsman/sessions/<run-id>/route-lock/
  proposal.json
  snapshot.json
  snapshot.md
  confirmation-surface.jsonl
```

`snapshot.md` is generated for humans. `snapshot.json` and its hash are the
machine contract.

## Lock Proposal

```ts
interface RouteLockProposal {
  proposalId: string;
  runId: RunId;
  proposedAt: string;
  boardRevisionRead: Revision;
  eventSequenceRead: number;
  snapshotPath: string;
  snapshotHash: string;
  renderedPath: string;
  remainingRisks: RouteRisk[];
  softWarnings: RouteLockWarning[];
  requiredUserConfirmation: true;
}
```

`route_lock.proposed` does not lock the route. It only records that Core believes
the route can be locked if the user confirms the exact snapshot.

## User Confirmation Surface

The confirmation surface must show:

- goal
- scope
- non-goals
- autonomy boundary
- stop conditions
- success criteria
- verification scenarios
- known risks
- accepted research/artifacts
- remaining soft warnings
- what Autopilot will be allowed to do
- what will require amendment or unlock
- snapshot hash or short visible hash

The surface must produce evidence:

```text
.helmsman/sessions/<run-id>/evidence/route-lock-confirmation.jsonl
```

Confirmation evidence:

```ts
interface RouteLockConfirmationEvidence {
  evidenceId: EvidenceId;
  proposalId: string;
  surfaceId: string;
  renderedAt: string;
  snapshotHash: string;
  userVisibleSnapshotHash: string;
  displayedSections: string[];
  userAction: "confirmed" | "cancelled" | "requested_more_charting" | "requested_amendment";
  userText?: string;
}
```

Initial Route Lock requires `userAction: "confirmed"`. A lead recommendation is
not user confirmation.

## Lock Event Payload

The binding event payload refines the data contract:

```ts
type RouteLockProposed = ManifestEvent<"route_lock.proposed", {
  proposalId: string;
  snapshotPath: string;
  snapshotHash: string;
  renderedPath: string;
  readiness: RouteLockReadiness;
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
```

Reducer effects:

- `run.routeLock.status = "locked"`
- `run.routeLock.lockedAt = event.createdAt`
- `run.routeLock.lockedBy = "user"`
- `run.routeLock.lockEventId = event.eventId`
- `run.routeLock.snapshotPath = snapshotPath`
- `run.routeLock.snapshotHash = snapshotHash`
- Board route lock status becomes `locked`
- Board `nextLegalAction` may become `run_autopilot_loop` only if no Autopilot
  blocker remains

## Locked Route Invariants

After lock:

- route goal, scope, non-goals, success criteria, stop conditions, autonomy
  boundary, and verification scenarios are immutable except through amendment,
  unlock, or invalidation
- accepted artifacts remain evidence but cannot rewrite the locked snapshot
- new research can inform amendment proposals but cannot silently change the
  route
- user chat that changes destination becomes an amendment prompt, not a route
  mutation
- role-run output may propose drift, repair, or amendment; it cannot apply one
- Autopilot can execute only Board-approved actions against the locked snapshot

## Amendment Types

```ts
type AmendmentKind =
  | "scope_refinement"
  | "success_criteria_change"
  | "non_goal_change"
  | "autonomy_boundary_change"
  | "verification_change"
  | "research_evidence_update"
  | "stop_condition_change"
  | "risk_update"
  | "unlock_required";

interface RouteAmendment {
  amendmentId: string;
  kind: AmendmentKind;
  proposedAt: string;
  proposedBy: AuthoritySource;
  reason: string;
  sourceEventIds: EventId[];
  sourceEvidenceIds: EvidenceId[];
  routeEffects: RouteEffect[];
  invalidatesLock: boolean;
  requiresUserConfirmation: boolean;
  newSnapshotHash?: string;
}
```

Amendment policy:

- User-owned route changes require user confirmation.
- Core-policy safety invalidation may happen without user approval, but it must
  stop Autopilot and explain the blocker.
- Evidence updates that do not change route semantics may be recorded as
  non-invalidating amendments.
- Autonomy boundary broadening always requires user confirmation.
- Verification scenario removal always requires user confirmation.

## Amendment Events

```ts
type AmendmentProposed = ManifestEvent<"amendment.proposed", {
  amendment: RouteAmendment;
  renderedPath: string;
}>;

type AmendmentApplied = ManifestEvent<"amendment.applied", {
  amendmentId: string;
  appliedBy: "user" | "core_policy";
  confirmationEvidenceId?: EvidenceId;
  previousSnapshotHash: string;
  newSnapshotPath: string;
  newSnapshotHash: string;
}>;

type AmendmentRejected = ManifestEvent<"amendment.rejected", {
  amendmentId: string;
  rejectedBy: AuthoritySource;
  reason: string;
}>;
```

Applying an invalidating amendment changes `routeLock.status` to `invalidated`
unless the same event also records a user-confirmed new lock snapshot. The safe
default is invalidation followed by re-lock.

## Unlock And Re-Charting

Unlock is explicit:

```ts
type RouteUnlocked = ManifestEvent<"route_lock.unlocked", {
  reason: string;
  unlockedBy: "user" | "core_policy";
  previousSnapshotHash: string;
  requiredNextStage: "charting";
  evidenceIds: EvidenceId[];
}>;
```

Unlock rules:

- User may unlock at any time.
- Core may unlock only for safety, stale evidence, broken contract, or recovery
  reasons.
- Unlock moves the Board next action to Charting or amendment resolution.
- Autopilot must stop when the route is unlocked.
- Unlock is not failure; hidden route mutation is failure.

## Lock Invalidation

Core invalidates a lock when continuing would violate the user's route:

```ts
type RouteLockInvalidated = ManifestEvent<"route_lock.invalidated", {
  previousSnapshotHash: string;
  reason: string;
  severity: "warning" | "hard";
  evidenceIds: EvidenceId[];
  requiredResponse: "ask" | "amend" | "unlock" | "park" | "stop";
}>;
```

Invalidation triggers:

- route-changing drift
- accepted evidence contradicts locked assumptions
- required artifact contract becomes impossible
- provider/tool limitation changes execution legality
- user changes scope in chat
- verification scenario becomes invalid
- autonomy boundary would be exceeded
- Board projection cannot be rebuilt from events

Hard invalidation blocks Autopilot immediately.

## Board Projection

When locked, the Board must show:

- locked snapshot hash
- lock event id
- current route lock status
- active blockers
- pending amendments
- invalidation warnings
- next legal Autopilot action
- forbidden actions derived from route lock and autonomy boundary
- recovery action when lock is invalidated

The Board may show a concise user-facing route card, but it must keep machine
links to event ids, snapshot hash, and evidence ids.

## Commands

Required command contracts:

```text
route-lock evaluate --json
route-lock propose --json
route-lock confirm --proposal <id> --snapshot-hash <hash>
route-lock cancel --proposal <id>
route-lock unlock --reason <reason>
route-lock amendment propose --json
route-lock amendment apply --amendment <id>
route-lock amendment reject --amendment <id> --reason <reason>
```

The exact CLI names may be adapted to final command style, but the command
semantics are binding.

Read-only commands:

- evaluate

Mutating commands:

- propose
- confirm
- cancel
- unlock
- amendment propose/apply/reject

Every mutating command requires current Board revision causality.

## TUI Behavior

The TUI must:

- show lock readiness blockers before showing a lock confirmation action
- render the full route snapshot before confirmation
- show the visible snapshot hash
- distinguish recommendation from user confirmation
- prevent Autopilot start when lock is absent, invalidated, or blocked
- show amendment prompts as route authority actions, not normal chat
- keep the Board and route panes in sync after lock/unlock/amendment events

The TUI must not:

- infer lock from a button click before Core records `route_lock.locked`
- hide hard blockers behind soft warnings
- allow broad "continue anyway" when a hard lock blocker exists
- silently edit locked scope from chat input

## Autopilot Preconditions

Autopilot may start only when:

- route lock status is `locked`
- Board revision is current
- no pending invalidating amendment exists
- no hard lock blocker exists
- next legal action permits Autopilot
- role-run packet references the locked snapshot hash
- autonomy boundary permits the requested action

If any precondition fails, Core records a blocker and keeps Autopilot stopped.

## Verification Contract

Gate 6 is accepted only when focused verification proves:

- lock readiness blocks open required questions
- lock readiness blocks missing question surface evidence
- lock readiness blocks missing research artifact acceptance
- lock readiness blocks missing verification scenarios
- proposal snapshot hash is deterministic
- confirmation requires user authority and displayed snapshot hash
- lead recommendation cannot confirm lock
- Board projects locked snapshot hash and forbidden actions
- route-changing post-lock command creates amendment or invalidation
- role-run output cannot apply amendment
- autonomy boundary broadening requires user confirmation
- verification scenario removal requires user confirmation
- hard invalidation stops Autopilot
- unlock routes back to Charting/amendment resolution
- stale Board revision rejects lock and amendment commands
- recovery can replay lock state from events

These are authority tests. They cannot be replaced by UI-only tests.

## Non-Acceptance Cases

Do not accept Route Lock if:

- lock is a Markdown status string only
- lock can be set by adapter output
- user confirmation does not cite the displayed route snapshot
- snapshot hash omits questions, route effects, artifacts, or verification
  scenarios
- open route-changing questions can be ignored without waiver
- Autopilot starts against an unlocked or invalidated route
- amendment can be applied by role-run output alone
- unlock silently changes route without returning to Charting or amendment
  resolution
- tests prove only the happy path

## Handoff

This contract feeds Gate 6 directly and is a prerequisite for Board-governed
Autopilot. Autopilot implementation must reference the locked snapshot hash in
every loop packet and must stop on invalidation, unlock, or pending
user-confirmed amendment.
