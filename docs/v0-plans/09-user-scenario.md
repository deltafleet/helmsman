# OMP Plugin User Scenario

Status: superseded OMP plugin scenario

Current authority: `../product-north-star.md`, `../native-core-tui-plan.md`, and
`../tui-user-scenarios.md`. This file is retained for OMP adapter/reference
research only.

## 1. Install

The user is already inside an OMP project session.

```text
/hm:install
```

Helmsman verifies and installs:

```text
.omp/agents/helmsman-*.md
.helmsman/install-manifest.json
```

The user sees:

```text
Helmsman installed for this project.
Agents: 10 installed
Roles: 10 mapped, 2 need model auth
Commands: /hm:charting /hm:autopilot /hm:manifest /hm:board
```

## 2. Start Charting Explicitly

The user invokes Helmsman:

```text
/hm:charting I want Helmsman to become an OMP plugin with strict Charting and Autopilot.
```

Helmsman creates:

```text
.helmsman/sessions/<session-id>/
  manifest.json
  manifest.events.jsonl
  board.json
  question-ledger.json
```

OMP chat remains the surface. Helmsman enters Charting mode inside it.

## 3. Ask Many Intent Questions

Helmsman asks the first bundle:

```text
Question Bundle 1: product boundary

Q1. What is the product center?
  A. OMP plugin route governor recommended
  B. Independent TUI
  C. Desktop app revival
  Other

Q2. Should Helmsman ever auto-suggest Charting?
  A. No, explicit only recommended
  B. Yes, for risky requests
  C. Configurable
  Other
```

After answers, Helmsman writes:

```text
question.answered events
manifest intent update
board status update
```

It does not stop. It asks more bundles as needed.

## 4. Declare Research Lanes

Helmsman proposes lane contracts:

```text
Lane 1: OMP Ask UI reuse
Lane 2: OMP task subagent artifact behavior
Lane 3: OMP agent discovery install path
Lane 4: OMP extension hook feasibility
Lane 5: old Helmsman README philosophy extraction
```

The user can accept, edit, waive, or add lanes.

Accepted independent lanes run in parallel through OMP `task`.

## 5. Save Lane Artifacts

Each lane writes:

```text
.helmsman/sessions/<session-id>/research/omp-ask-ui.md
.helmsman/sessions/<session-id>/research/omp-task-subagents.md
.helmsman/sessions/<session-id>/research/omp-agent-discovery.md
.helmsman/sessions/<session-id>/research/omp-extension-hooks.md
.helmsman/sessions/<session-id>/research/old-helmsman-philosophy.md
```

Parent synthesis updates:

```text
research-index.md
manifest.json
board.json
```

## 6. Ask Better Second-Wave Questions

Research results reveal sharper choices. Helmsman asks again:

```text
Question Bundle 2: execution authority

Q1. Should Autopilot be extension-orchestrated first, with OMP patch only if blocked?
  A. Yes recommended
  B. Patch OMP immediately
  C. Keep Autopilot manual for now
  Other

Q2. Should `.agents/subagents` be supported?
  A. Only as optional mirror recommended
  B. Primary install path
  C. Do not support
  Other
```

This repeats until the user intent and product contract are truly closed.

## 7. Render Manifest

The user inspects:

```text
/hm:manifest
```

The rendered contract shows:

```text
Goal
Decisions
Non-goals
Research evidence
Role registry
Roadmap
Scorecard
Verification scenarios
Autopilot handoff
```

The machine source remains:

```text
manifest.json
manifest.events.jsonl
```

## 8. Route Lock

When gates pass, Helmsman proposes:

```text
Charting is lock-ready.

Missing: none
Waived: 1 non-critical lane
Risks: 2 known, both have stop conditions

Proceed?
  A. Lock route and start Autopilot recommended
  B. Review Manifest
  C. Run skeptical pass
  D. Continue Charting
```

Route Lock writes:

```text
route.locked event
manifest.lockHash
board.routeLock.status = locked
rendered/manifest.md
```

## 9. Start Autopilot

The user invokes:

```text
/hm:autopilot
```

Autopilot reads:

```text
board.json
manifest.json
```

Every loop shows or injects the current Board projection:

```text
Phase: plugin installer
Approved scope: .omp/agents, packages/helmsman-plugin
Next allowed action: implement dry-run install
Open risks: plugin API continuation not yet proved
Verification: V-001 pending
```

OMP executes. Helmsman governs.

## 10. Drift Or Completion

If Autopilot drifts:

```text
Blocked by Board.
Attempted write outside approved scope: docs/product-north-star.md

Proceed?
  A. Deny and repair recommended
  B. Approve scoped amendment
  C. Return to Charting
```

If Autopilot completes:

```text
Phase complete.
Verification matrix satisfied.
Closeout ready.
```

The end state is not "the agent said it is done." The end state is Board and Manifest verification.
