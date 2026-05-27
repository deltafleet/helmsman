# Autopilot Loop Contract

Status: current binding contract for Gate 7 Board-Governed Autopilot

## Purpose

Autopilot is not a long prompt, a self-running agent chat, or a transcript
convention. It is a Core-owned control loop that executes a user-confirmed
locked route by reading the Board before every action and writing typed events
after every meaningful result.

Pi AgentSession, Pi event streams, role-run artifacts, and external adapter
output are executor evidence only. They cannot advance phase state, mutate the
route, satisfy verification, or close the run unless Core accepts their
artifacts and replays the Manifest into a new Board projection.

## Authority Stack

Autopilot uses these authorities in this order:

1. Manifest events are the machine source of truth.
2. Board projection is the live situation surface Autopilot must read.
3. Route Lock snapshot is the immutable execution contract until a typed
   amendment, unlock, invalidation, or park event changes it.
4. RoleRuntime turns Core plans into bounded Pi AgentSession or external
   adapter executions.
5. Operation state, event logs, transcripts, and TUI widgets are visibility and
   evidence surfaces only.

If these surfaces disagree, Autopilot stops and records a blocker. It must not
choose the convenient surface or continue from chat memory.

## Preconditions

Core may start an Autopilot loop only when all of the following are true:

- `routeLock.status` is `locked`.
- The locked route snapshot path and hash are present.
- `BoardProjection.nextLegalAction.kind` is `run_autopilot_loop`.
- `nextLegalAction.requiredBoardRevision` equals the current Board revision.
- No pending invalidating amendment exists.
- No hard blocker with `blocks: "autopilot"` exists.
- The selected action is inside the locked route scope and autonomy boundary.
- Every role-run packet references the locked snapshot hash.
- Declared write roots do not conflict with active role runs.
- Required credentials and provider/model capabilities are ready or the loop
  parks before launch.

Failure to satisfy any precondition appends a blocker or diagnostic event and
keeps Autopilot stopped.

## Loop Flow

Every loop follows the same shape:

```text
read locked route snapshot and Board revision N
-> select Board.nextLegalAction
-> prepare AutopilotLoopPlan
-> append autopilot.action_selected / autopilot.packet_prepared / autopilot.loop_started
-> dispatch RoleRuntime or external adapter with bounded packets
-> capture Pi/external events and artifacts
-> evaluate artifact contracts and route adherence
-> append accepted/rejected/drift/diagnostic events
-> replay Manifest into Board revision N+...
-> append autopilot.loop_finished
-> continue, repair, audit, amend, ask, verify, park, or stop
```

The loop decision after evaluation is always a Core decision. A model's final
message can explain evidence, but it cannot be the loop decision.

## AutopilotLoopPlan

`AutopilotLoopPlan` is the durable launch contract written before execution:

```ts
interface AutopilotLoopPlan {
  schemaVersion: "helmsman.autopilot-loop-plan.v1";
  runId: RunId;
  loopId: string;
  attempt: number;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeLockEventId: EventId;
  lockedSnapshotPath: string;
  lockedSnapshotHash: string;
  nextLegalAction: BoardNextAction;
  actionReason: string;
  autonomyBoundaryIds: string[];
  packetPaths: string[];
  roleRunPlans: RoleRunPlan[];
  externalAdapterPlans: ExternalAdapterRunPlan[];
  expectedArtifacts: ExpectedArtifact[];
  acceptanceCriteria: AcceptanceCriterion[];
  forbiddenClaims: ForbiddenAuthorityClaim[];
  stopConditions: AutopilotStopCondition[];
  maxRoleRuns: number;
  maxRepairPasses: number;
  maxAuditPasses: number;
  timeoutMs: number;
  createdAt: string;
}
```

The plan must be stable enough for resume. If a process exits after the plan is
written but before execution finishes, recovery reconciles the plan, operation
state, role-run evidence, and Manifest events instead of relaunching blindly.

## Action Selection

Autopilot may select only `BoardProjection.nextLegalAction`.

Selection records:

- Board revision read
- Board projection hash
- route lock event id
- locked snapshot hash
- selected action
- reason copied or derived from Board state
- blockers and forbidden actions checked
- planned operation ids and packet paths

Autopilot must reject stale selection when:

- the Board revision changed before `autopilot.loop_started`
- the Board projection hash changed unexpectedly
- an operation already consumed the same idempotency key
- another active operation owns a conflicting write root

## Packet Contract

Every packet given to a role runner or external adapter must include:

- `runId`, `loopId`, and operation id
- `boardRevisionRead`
- Board projection excerpt needed for the task
- locked snapshot hash and path
- allowed reads and writes
- required artifacts and artifact schema ids
- stop conditions
- forbidden authority claims
- evidence capture path
- retry and resume policy

Packets must be specific enough that a role can execute without reading the
full chat transcript as authority. Chat transcript may be included only as
context evidence.

## Role Dispatch

Role dispatch follows `docs/pi-role-runtime-contract.md`.

Autopilot may run parallel role runs only when Core proves:

- packets are independent or explicitly ordered
- no write path conflict exists
- every packet references the same locked snapshot hash
- every packet references the Board revision it read
- the combined run count stays within the plan's max role-run and budget limits
- auditor/verifier packets cannot write implementation artifacts

Parallelism is a throughput mechanism. It cannot widen scope, skip audit, or
relax route adherence.

## Drift Response Matrix

Core evaluates drift after every role result and any intercepted forbidden
operation.

| Drift class | Examples | Required response |
| --- | --- | --- |
| `minor_drift` | harmless naming mismatch, incomplete artifact metadata, low-risk missing citation | record warning, repair, or re-aim within locked route |
| `route_changing_drift` | new user-facing scope, changed architecture choice, autonomy boundary expansion | stop loop, ask or propose amendment |
| `critical_drift` | writes outside allowed root, secret exposure, destructive command, route lock bypass | stop, invalidate or park, require user-visible recovery |
| `missing_evidence` | artifact absent, event log incomplete, no route-adherence proof | repair if bounded; otherwise park |
| `forbidden_authority_claim` | model claims lock, verification, closeout, amendment, or product readiness | reject artifact and record drift |

Repair is allowed only when it stays inside the locked route and the Board's
next legal action permits it. Route-changing drift must not be converted into a
quiet repair.

## Hardening Loop

Autopilot can run bounded implementation, audit, repair, and verification waves:

```text
implement
-> audit
-> repair if bounded and legal
-> audit again up to maxAuditPasses
-> verify when Board.nextLegalAction becomes run_verification
```

Repeated passes exist to converge probabilistic agent work. They are not
permission to loop forever. Each pass must produce a Board delta, accepted
artifact, rejected artifact, diagnostic, blocker, drift event, or park event.

## Park, Stop, Ask, Amend

`park` means the route remains visible but Autopilot cannot legally continue.
It is the correct state for missing credentials, blocked external systems,
missing user authority, exhausted budgets, or unresolved evidence gaps.

`stop` means the loop is ended by user request, critical drift, invalidated
route, or a non-recoverable execution failure.

`ask` means Core returns to Charting or amendment question UI with a
Core-authored bundle. Autopilot cannot ask route-changing questions through a
model-tool questionnaire as authority.

`amend` means a user-approved amendment changes the locked route through
`docs/route-lock-amendment-contract.md`.

## Completion Boundary

Autopilot does not complete the product. It can only move the run to the next
legal Board action.

The run may approach closeout only when:

- required artifacts are Core-accepted
- route adherence is evaluated as adherent or explicitly parked with user
  authority
- Board projection moves to `run_verification` or `closeout`
- verification scenarios are declared and then passed or parked through Core
  events
- no forbidden authority claim is used as evidence

An assistant final message, Pi turn end, adapter exit code, or green test output
does not equal completion by itself.

## Recovery And Resume

On resume, Core must:

1. Replay Manifest into Manifest and Board projections.
2. Read operation state for active or incomplete Autopilot loops.
3. Reconcile role-run evidence and Pi/external event logs.
4. Classify each in-flight loop as completed, timed out, interrupted, stale, or
   needs user action.
5. Append recovery events before continuing.

Autopilot must reject duplicate loop execution for the same idempotency key. It
may continue only from a fresh Board read.

## TUI Projection

The native TUI must show enough state for the user to inspect autonomy:

- locked snapshot hash
- Board revision read by the current loop
- selected legal action
- active packets and role runs
- accepted/rejected artifacts
- drift warnings and blockers
- repair/audit pass count
- park/stop/ask/amend reason
- retry/resume command when legal

This is a projection over Manifest, Board, and operation state. TUI state is not
authority.

## Verification Contract

Gate 7 is not accepted until focused verification proves:

- Autopilot refuses to start without locked route state.
- Autopilot refuses to start with stale Board revision.
- Autopilot refuses a packet missing locked snapshot hash.
- Autopilot reads the Board before every action selection.
- Autopilot records action selection, packet preparation, loop start, route
  adherence, drift, and loop finish events.
- Role output cannot advance stage, amend route, pass verification, or closeout.
- Conflicting write roots reject parallel dispatch.
- Minor drift can repair only within locked route scope.
- Route-changing drift stops and asks or proposes amendment.
- Critical drift stops and invalidates or parks.
- Missing evidence repairs or parks.
- Resume reconciles incomplete loops without duplicate execution.
- Final prose is rejected as completion evidence.
- Board projection changes only through Manifest replay.

These tests may use fake providers for reducer and projector determinism, but
product-surface claims require live Pi AgentSession evidence before release.
