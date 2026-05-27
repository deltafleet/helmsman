# Manifest And Board State

Status: superseded OMP plugin-first study

Current authority: `../product-north-star.md` and `../native-core-tui-plan.md`.
This file is retained for OMP adapter/reference research only.

## Source Of Truth

The Manifest is the durable route contract. It is machine-owned first and human-readable second.

Canonical files:

```text
.helmsman/sessions/<session-id>/
  manifest.json
  manifest.events.jsonl
  board.json
  question-ledger.json
  research-index.md
  rendered/
    manifest.md
    board.md
```

`manifest.json` is the source of truth. `rendered/manifest.md` is a generated human translation. The user should be able to inspect the route without reading JSON, but the machine contract remains canonical.

## Manifest Responsibilities

The Manifest must capture:

- original user request
- interpreted intent
- user decisions
- recommended options and whether accepted
- scope
- non-goals
- assumptions
- constraints
- open questions
- waived questions
- research lanes
- evidence links
- risks
- roadmap phases
- phase acceptance criteria
- scorecard categories
- verification scenarios
- stop conditions
- Autopilot handoff contract

## Event Log

Charting should append events rather than silently mutate state.

Examples:

```text
question.proposed
question.answered
question.waived
research_lane.declared
research_lane.completed
research_lane.waived
manifest.section.updated
risk.added
risk.closed
route.lock_proposed
route.locked
autopilot.started
autopilot.drift_detected
```

`manifest.json` can be a reduced current-state projection. `manifest.events.jsonl` preserves why the current state exists.

## Board Responsibilities

The Board is the live situation projection Autopilot reads before each loop.

`board.json` should include:

- session id
- route lock status
- active phase
- phase progress
- approved write scope
- forbidden actions
- open questions
- open risks
- active research lanes
- worker status
- next allowed actions
- blocked actions
- verification matrix
- drift warnings
- last Board update event id

The Board is not a duplicate Manifest. It is the operational view for current action selection.

## Roadmap As Situation Board

The roadmap is both a planning artifact and a status surface. Each phase needs:

- phase id
- purpose
- entry criteria
- expected artifacts
- allowed write scope
- acceptance criteria
- verification checks
- stop conditions
- current status

Status values:

```text
pending
ready
active
blocked
verifying
done
parked
```

Autopilot should never infer the current phase only from chat context. It reads the Board.

## Human Rendering

The rendered Manifest should read like a compiled contract:

```text
Goal
Scope
Non-goals
Decisions
Research Evidence
Roadmap
Scorecard
Risks
Verification
Autopilot Handoff
```

The user should not need to inspect every intermediate artifact. They should still feel that completion is rising because the rendered contract and Board become more complete and less ambiguous over time.

## Readiness Labels

Use artifact-backed readiness:

```text
needs intent answer
needs non-goal decision
needs evidence
needs scenario
lock-ready
locked
blocked
```

Avoid unsupported precision:

```text
clarity 90%
almost done
probably enough
```

A numeric score may exist only if it maps to concrete gate coverage. It cannot replace the gate.

## Route Lock

Route Lock writes:

```text
route.locked event
manifest.lockedAt
manifest.lockedBy
manifest.lockHash
board.routeLock.status = locked
rendered/manifest.md
```

After lock, changes are not silent. Any route-changing change must create a new event and either:

- unlock the route
- create a scoped amendment
- park Autopilot until the user confirms
