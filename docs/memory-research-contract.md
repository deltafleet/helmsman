# Memory And Research Contract

Status: current binding contract for Gate 5 Memory And Research

## Purpose

Memory and research exist to sharpen Charting before Route Lock. They are not a
replacement for user authority, a shortcut around Aperture questions, or a way
for a lead model to turn vague intent into an execution route by itself.

The product rule is:

```text
Aperture answer
-> scoped memory scan
-> stale/missing/conflict judgments become research lanes
-> independent lanes dispatch in parallel through RoleRuntime
-> every active lane produces one durable artifact or an explicit drop reason
-> Core synthesis updates Manifest, Board, route card, scorecard, and questions
```

Research is allowed to use many tokens aggressively, but only through aimed
lanes with durable artifacts and Core validation.

## Authority Stack

Memory and research use these authority boundaries:

1. User answers and Core-authored Charting bundles define the search
   coordinates.
2. Manifest events are the machine source of truth.
3. Board projection shows memory status, lane status, blockers, and next legal
   action.
4. Memory scan artifacts and research artifacts are evidence candidates.
5. RoleRuntime and Pi AgentSession execute research packets.
6. Lead synthesis can recommend route changes, but cannot replace user
   approval for user-owned decisions.

No memory note, research artifact, worker report, web page, command output, or
lead synthesis can lock a route, amend a locked route, pass verification, or
claim completion without a Core event.

## Preconditions

Core may create a memory scan only when:

- Charting has been explicitly entered.
- At least one Aperture Bundle was rendered to the user.
- At least one Aperture answer was recorded with route-effect evidence.
- The scan is scoped to the selected aperture and route question.
- The scan names the memory sources it will inspect.

Core may declare research lanes only when:

- a scoped memory scan exists for the current aperture.
- every lane is tied to a `stale`, `missing`, or `conflict` memory judgment, or
  to an explicit user-approved research request recorded as a missing knowledge
  candidate.
- the lane has a route-changing question and decision impact.
- the expected artifact path is under the run's research root.
- RoleRuntime can produce a bounded `RoleRunPlan` or the lane is recorded as
  blocked/manual.

Broad memory scan before Aperture is forbidden. Research from an unaimed initial
query is forbidden.

## Memory Scan

Memory scan is a scoped classification pass.

```ts
interface MemoryScanPlan {
  schemaVersion: "helmsman.memory-scan.v1";
  runId: RunId;
  scanId: string;
  selectedApertureQuestionIds: QuestionId[];
  apertureAnswerEventIds: EventId[];
  routeQuestion: string;
  searchCoordinates: string[];
  sourcesToInspect: MemorySourceRef[];
  sourcesToSkip: MemorySourceRef[];
  artifactPath: string;
  indexPath: string;
  createdAt: string;
}

interface MemoryCandidateJudgment {
  scanId: string;
  candidateId: string;
  sourceRef: string;
  classification: "reused" | "stale" | "irrelevant" | "missing" | "conflict";
  reason: string;
  routeEffects: RouteEffect[];
  createsResearchLaneId?: ResearchLaneId;
  blocksRouteLock: boolean;
}
```

Classifications mean:

| Classification | Meaning | Research effect |
| --- | --- | --- |
| `reused` | prior memory is current, relevant, and strong enough for this route | no lane; cite route effect |
| `stale` | prior memory may be outdated or tied to an older architecture | create lane or waive with reason |
| `irrelevant` | related but not useful for this route | no lane; record why |
| `missing` | no adequate prior memory exists | create lane or waive with reason |
| `conflict` | prior memories disagree or contradict current evidence | create lane or ask user |

Only `stale`, `missing`, and `conflict` may produce research lanes. Reused
memory must still cite source and route effect. Irrelevant memory must still
record why it does not apply.

## Research Lane Contract

Every selected topic becomes a lane contract before execution:

```ts
interface ResearchLaneContract {
  schemaVersion: "helmsman.research-lane.v1";
  runId: RunId;
  laneId: ResearchLaneId;
  slug: string;
  selectedApertureEventIds: EventId[];
  sourceMemoryJudgmentIds: string[];
  routeChangingQuestion: string;
  laneType:
    | "source_of_truth"
    | "current_code"
    | "prior_art"
    | "failure_mode"
    | "ux"
    | "implementation_feasibility"
    | "memory_refresh"
    | "runtime_probe"
    | "adapter_probe";
  sourcesToInspect: string[];
  sourcesToSkip: string[];
  expectedArtifactPath: string;
  ownerRoleId: RoleId;
  allowedWriteScope: string[];
  acceptanceCriteria: string[];
  decisionImpact: string;
  openUncertainty: string;
  status: "queued" | "running" | "submitted" | "accepted" | "rejected" | "dropped" | "blocked";
}
```

The lane contract must be specific enough that a research worker can execute
without reading the full chat transcript as authority. The transcript may be
included as context evidence only.

## Research Index

`research-index.md` is the human coordination ledger. The Manifest remains the
machine source of truth.

The index must account for:

- max active lanes
- launch posture: `parallel`, `lead-only`, or `blocked`
- every selected lane slug
- route-changing question
- lane type
- owner
- status
- artifact path
- sources checked
- decision impact
- open uncertainty
- dropped or lead-only lane reasons

The default active research lane cap is `6` unless the user explicitly approves
a higher cap. More lanes are queued for later waves, not silently merged or
ignored.

## Worker Packets

Every research worker receives a Core-authored worker packet that maps to
`docs/pi-role-runtime-contract.md`.

```ts
interface ResearchWorkerPacket {
  schemaVersion: "helmsman.research-worker-packet.v1";
  runId: RunId;
  laneId: ResearchLaneId;
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
```

Required packet rules:

- one packet per independent lane
- allowed write scope normally equals exactly `research/<slug>.md`
- worker cannot edit route card, research index, Manifest, Board, or question
  artifacts unless explicitly assigned
- packet must forbid user-owned decisions, scope expansion, Route Lock,
  verification, and completion claims
- packet must require observation/inference separation
- packet must name the artifact path before execution

## Parallel Dispatch

Core dispatches independent lanes in waves:

```text
declare lanes
-> group independent lanes up to max active lane cap
-> write worker packets
-> dispatch RoleRuntime runs
-> collect event logs and artifacts
-> validate each artifact
-> synthesize accepted artifacts
-> update Board and decide next action
```

Research workers may run in parallel only when:

- lane questions are independent enough to execute concurrently
- allowed write scopes do not conflict
- total active lanes stay within the cap
- every lane has a packet and expected artifact
- credentials/provider/model readiness is available or the lane is marked
  blocked/manual

If worker spawning is not available, Core records `manual launch required` or
`blocked` with exact packet paths. It must not pretend lead-only execution is
equivalent to parallel research.

## Research Artifact

Every active lane produces exactly one durable artifact or an explicit drop
reason.

Required artifact shape:

```text
# Research: <topic>

## Question
## Lane Type
## Worker Packet
## Sources Checked
## Observations
## Inferences
## Uncertainty
## Decision Impact
## Route Changes Required
## Recommended Next Step
```

Validation rules:

- artifact path matches the lane's expected artifact path.
- artifact cites sources checked as files, URLs, command output, package
  metadata, rendered UI, or direct observation.
- `Observations` contains only what was actually seen.
- `Inferences` contains interpretation, tradeoffs, and extrapolation.
- `Decision Impact` states how the lane changes or confirms the route.
- `Route Changes Required` is explicit, even when the answer is `none`.
- placeholder text, generic findings, and uncited claims are rejected.
- artifact cannot mutate Manifest or Board by existing on disk.

Rejected artifacts remain evidence and can create repair work, blockers, or new
questions. They do not move the route by themselves.

## Synthesis

After every research wave, Core runs synthesis:

```text
accepted lane artifacts
-> source/evidence summary
-> route effects
-> open uncertainty
-> new or updated decision bundles
-> Board and scorecard deltas
-> next legal action
```

Synthesis outcomes:

- `continue_research`: more stale/missing/conflict uncertainty remains.
- `ask_decision_bundle`: user-owned decision remains after evidence.
- `lock_ready`: route is precise enough to propose Route Lock.
- `blocked`: authority, evidence, provider, or artifact blocker remains.
- `drop_or_waive`: lane is no longer route-changing and has a recorded reason.

Lead synthesis may recommend. It cannot answer user-owned decisions.

## Board Projection

The Board must expose:

- memory scan status and scan artifact path
- reused/stale/irrelevant/missing/conflict counts
- active and queued lane counts
- max active lane cap
- launch posture
- per-lane status and owner
- artifact accepted/rejected state
- synthesis status
- blockers that affect Route Lock
- next legal action

Autopilot cannot begin while required research lanes are active, missing,
rejected without repair, or blocking Route Lock.

## Failure And Recovery

Research failure states must be explicit:

- memory source unavailable
- no relevant prior memory found
- provider/model unavailable
- worker launch unavailable
- worker timeout
- artifact missing
- artifact path mismatch
- source citation missing
- observation/inference collapse
- route-changing conflict discovered
- user-owned decision required

Recovery actions are Core decisions:

```text
retry lane
repair packet
repair artifact
split lane
merge lane
drop with reason
ask user
return to Charting
park
```

Resume must replay Manifest, inspect role-run evidence, inspect expected
artifacts, and rebuild the research index projection before launching any new
worker.

## TUI Projection

The Pi TUI must show enough research state for the user to trust the route:

- selected aperture
- memory scan summary
- lane list and status
- parallel group and cap
- active role runs
- artifact links
- dropped/lead-only lane reasons
- synthesis result
- blockers and next action

This is a projection. TUI state cannot mark lanes complete.

## Verification Contract

Gate 5 is accepted only when focused verification proves:

- memory scan is rejected before Aperture answer evidence.
- broad memory scan from the initial query is rejected.
- `reused` memory cites source and route effect without creating a lane.
- `irrelevant` memory records a reason and creates no lane.
- `stale`, `missing`, and `conflict` judgments can create lanes.
- every lane requires route-changing decision impact.
- lane declaration rejects expected artifact paths outside the research root.
- independent lanes dispatch up to the cap and queue overflow lanes.
- conflicting write scopes reject parallel dispatch.
- worker packets include allowed writes, required artifact path, done criteria,
  and forbidden authority claims.
- chat-only worker completion is rejected.
- artifact missing, placeholder artifact, path mismatch, missing source
  citation, or collapsed observation/inference is rejected.
- accepted artifacts update Board and scorecard only through Core events.
- synthesis returns continue, ask, lock-ready, blocked, or drop/waive states.
- Route Lock is blocked while required research lanes are unresolved.
- resume reconciles partial role runs and artifacts without duplicate launches.

These are product authority tests. They cannot be replaced by a single prompt
smoke or a mock-only provider run.
