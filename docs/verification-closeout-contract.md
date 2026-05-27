# Verification And Closeout Contract

Status: current binding contract for Gate 8 Verification And Closeout

## Purpose

Verification and closeout are product authority phases. They are not a generic
test run, a model's final answer, a green exit code, or an adapter summary.

Helmsman can claim route completion only when named route scenarios have
verdicts recorded by Core, required artifacts are accepted, the Board projects
the verification matrix correctly, and closeout is recorded through a separate
Core event with durable closeout artifacts.

The product rule is:

```text
locked route with stable scenarios
-> accepted implementation and evidence artifacts
-> verifier RoleRuntime plans
-> scenario-specific verification artifacts
-> Core records scenario verdicts
-> Board projects verification matrix
-> closeout precondition check
-> closeout artifact and event
-> optional Wiki Memory promotion candidates
```

Passing unrelated tests is useful evidence only when mapped to a named
scenario. No broad "green suite" claim may replace scenario verdicts.

## Authority Stack

Verification and closeout use these authorities in order:

1. Manifest events are the machine source of truth.
2. Route scenarios are the route promises declared before Route Lock.
3. Board projection is the live verification matrix.
4. RoleRuntime executes verifier packets.
5. Verification artifacts and command output are evidence candidates.
6. Core records pass, fail, or blocked verdicts.
7. Closeout records final run status separately from verification verdicts.

Role output, Pi transcript, shell output, adapter result, TUI state, and final
assistant prose cannot pass verification or close the run by themselves.

## Preconditions

Core may enter verification only when:

- the route is locked or explicitly parked for partial closeout.
- required implementation/research artifacts are accepted or explicitly parked.
- verification scenarios are declared with stable ids.
- Board `nextLegalAction.kind` is `run_verification`.
- verifier role bindings resolve through `docs/pi-role-runtime-contract.md`.
- every scenario has expected evidence, artifact path, and pass/fail criteria.
- no pending amendment invalidates the scenario matrix.

Core may enter closeout only when:

- every required scenario is `passed`, or
- unresolved scenarios are explicitly parked/blocked with user-visible reason
  and closeout status is not represented as successful completion.
- all hard floor gates are satisfied or explicitly block closeout.
- final artifacts are accepted through Core.
- no route-changing drift or invalidating amendment is pending.

## Verification Scenario

Each route scenario is a stable promise from Charting and Route Lock.

```ts
interface VerificationScenarioContract {
  schemaVersion: "helmsman.verification-scenario.v1";
  runId: RunId;
  scenarioId: VerificationScenarioId;
  title: string;
  routeAssertionIds: string[];
  successCriterionIds: string[];
  riskIds: string[];
  scope: "unit" | "integration" | "e2e" | "tui_pty" | "live_provider" | "manual_review" | "release";
  method:
    | "command"
    | "role_review"
    | "tui_session"
    | "artifact_inspection"
    | "live_provider_probe"
    | "manual_review";
  verifierRoleId: RoleId;
  expectedArtifactPath: string;
  requiredEvidenceKinds: VerificationEvidenceKind[];
  passCriteria: string[];
  failCriteria: string[];
  blockedCriteria: string[];
  hardFloor: boolean;
  createdFromEventId: EventId;
}

type VerificationEvidenceKind =
  | "command_output"
  | "test_result"
  | "role_run"
  | "artifact"
  | "tui_capture"
  | "live_provider"
  | "manual_observation"
  | "replay_hash"
  | "audit_report";
```

Scenario ids are immutable after Route Lock except through user-approved route
amendment. Removing or weakening a scenario is a route change.

## Verification Run Plan

Before execution, Core writes a verifier launch plan:

```ts
interface VerificationRunPlan {
  schemaVersion: "helmsman.verification-run-plan.v1";
  runId: RunId;
  verificationRunId: string;
  boardRevisionRead: Revision;
  boardProjectionHash: string;
  routeSnapshotHash: string;
  scenarioIds: VerificationScenarioId[];
  verifierRoleRunPlans: RoleRunPlan[];
  expectedArtifacts: ExpectedArtifact[];
  allowedReadScope: string[];
  allowedWriteScope: string[];
  forbiddenClaims: ForbiddenAuthorityClaim[];
  timeoutMs: number;
  createdAt: string;
}
```

Verifier packets must forbid:

- route lock changes
- route amendments
- closeout
- product readiness claims
- scenario deletion or weakening
- treating execution success as verdict

## Verdict Contract

Executor status and scenario verdict are different.

```text
role run completed
command exited 0
test suite green
manual reviewer wrote PASS
```

These are evidence candidates. The scenario verdict exists only after Core
records `verification.result_recorded`.

Verdict meanings:

| Verdict | Meaning |
| --- | --- |
| `passed` | evidence satisfies every pass criterion and no fail/block criterion applies |
| `failed` | evidence contradicts a route promise, fails a hard floor, or shows a product regression |
| `blocked` | verifier could not produce adequate evidence because authority, environment, credentials, artifact, or external state is missing |

`report --status failed` style execution failure is not the same as a product
FAIL verdict. Execution failure usually produces `blocked` unless the failure
itself proves a scenario fail criterion.

## Verification Artifact

Each scenario verdict needs a durable artifact:

```text
# Verification: <scenario id> <title>

## Scenario
## Route Assertions
## Method
## Evidence
## Observations
## Verdict
## Residual Risk
## Follow-Up Required
```

Validation rules:

- artifact path matches the scenario contract.
- evidence cites command output, role-run logs, artifacts, UI captures, live
  provider evidence, manual observation, or replay hashes.
- observations are separated from verdict.
- verdict maps explicitly to pass/fail/blocked criteria.
- residual risk is explicit, even when `none`.
- placeholder text and generic "tests passed" prose are rejected.
- artifact cannot close the run by existing on disk.

## Board Projection

The Board verification section must expose:

- total scenarios
- required, optional, hard-floor, and parked counts
- per-scenario status
- verifier role and operation state
- artifact links
- evidence links
- failed criteria
- blocked criteria
- residual risks
- next legal action
- closeout readiness

The Board may project closeout readiness only from Manifest events and accepted
artifacts. It must not infer readiness from chat or TUI state.

## Failure, Repair, And Retry

Verification failure does not automatically close or loop forever.

Core may choose:

```text
retry verifier
repair implementation
repair verifier packet
ask user
amend route
park scenario
block closeout
stop
```

Rules:

- A failed verifier execution must preserve evidence and increment an attempt
  counter before retry.
- A product FAIL verdict must create a Board blocker and route back to repair,
  amendment, or user decision.
- A BLOCKED verdict must name the missing authority or external state.
- Automatic retry cannot bypass Board revision checks, hard floors, budgets, or
  user-owned decisions.
- A later PASS must not hide prior failed or blocked attempts; closeout must
  retain the attempt history.

## Closeout

Closeout is a separate phase and event.

```ts
interface CloseoutRecord {
  schemaVersion: "helmsman.closeout.v1";
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
}
```

Closeout artifacts:

```text
.helmsman/sessions/<run-id>/closeout.md
.helmsman/sessions/<run-id>/rendered/manifest.md
.helmsman/sessions/<run-id>/rendered/board.md
.helmsman/sessions/<run-id>/evidence/index.md
.helmsman/sessions/<run-id>/memory/promotion-candidates.md
```

`completed` requires all required scenarios passed and no hard floor blockers.
`parked` or `blocked` may be a legitimate stop state, but it must not be
presented as successful product completion.

## Wiki Memory Promotion Candidates

Closeout may propose reusable memory. It must not silently write global memory.

Promotion candidates must include:

- claim
- source run id
- source artifacts and evidence ids
- applicable scope
- known limitations
- staleness trigger
- contradiction/supersession notes
- suggested destination memory namespace
- required approval policy

Promotion is rejected when the candidate is only a transcript summary, lacks
source evidence, conflicts with current route facts, exposes secrets, or turns a
parked/blocked run into success lore.

## Recovery And Resume

On resume, Core must:

1. Replay Manifest and rebuild Board.
2. Inspect verification run plans and role-run evidence.
3. Inspect expected verification artifacts.
4. Reconcile each scenario as passed, failed, blocked, stale, or unverified.
5. Rebuild closeout readiness.
6. Append recovery diagnostics before launching retries.

Duplicate verifier launches for the same scenario and attempt id are rejected.
Retries require a fresh Board read.

## TUI Projection

The native TUI must show:

- scenario matrix
- hard-floor markers
- latest verifier attempt
- evidence/artifact links
- pass/fail/blocked reasons
- residual risk
- closeout readiness
- closeout status
- memory promotion candidates

The UI cannot mark verification passed or closeout complete. It only renders
Core state.

## Verification Contract

Gate 8 is accepted only when focused verification proves:

- scenarios require stable ids before Route Lock.
- scenario removal or weakening after Route Lock requires amendment.
- verifier packets include scenario id, expected artifact, pass/fail criteria,
  and forbidden authority claims.
- role-run completion does not record a scenario verdict.
- command exit 0 does not record a scenario verdict.
- final prose does not record a scenario verdict.
- missing verification artifact produces blocked or failed status, not pass.
- failed verifier execution is separated from product FAIL verdict.
- retry increments attempt history and preserves prior evidence.
- PASS verdict maps to declared pass criteria and accepted evidence.
- FAIL verdict blocks closeout and routes to repair/amend/ask.
- BLOCKED verdict records missing authority or environment.
- Board projects verification matrix from Manifest replay.
- closeout is rejected while required scenarios are unresolved.
- verification pass does not automatically close the run.
- closeout writes closeout, rendered Manifest, rendered Board, evidence index,
  and memory promotion candidates when applicable.
- completed closeout requires all required scenarios passed and no hard floor
  blockers.
- parked or blocked closeout is not presented as successful completion.
- memory promotion candidates require provenance, scope, staleness triggers,
  and approval policy.
- resume reconciles verification and closeout state without duplicate launches.

These are product authority tests. They cannot be replaced by generic unit
tests, mock-only providers, or a single successful agent transcript.
