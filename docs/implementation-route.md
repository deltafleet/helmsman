# Implementation Route

Status: current Pi-direct implementation route

## Decision

The implementation route is Pi-direct and Core-owned. The durable state,
event, Board, operation, and Question UI Adapter contracts are binding in
`docs/pi-direct-data-contracts.md`. The design closure audit is binding in
`docs/pi-direct-design-closure-audit.md`; it separates product-contract closure
from implementation proof and does not authorize scope reduction. Core event
append, reducer, Board
projection, gate evaluation, replay, and recovery are binding in
`docs/core-event-reducer-board-contract.md`. Gate 1 implementation details are binding
in `docs/pi-runtime-foundation-contract.md`. Role execution, worker packet
mapping, Pi AgentSession evidence, and concurrency are binding in
`docs/pi-role-runtime-contract.md`. Package install, doctor, update, product
audit, and release evidence are binding in
`docs/install-doctor-product-audit-contract.md`. Memory scan, research lane
contracts, parallel RoleRuntime dispatch, artifact validation, synthesis, and
Board projection are binding in `docs/memory-research-contract.md`. Route Lock,
route snapshots, amendments, unlock, invalidation, and Autopilot preconditions
are binding in `docs/route-lock-amendment-contract.md`. Board-read Autopilot
loop selection, packet dispatch, drift response, repair/audit,
park/stop/ask/amend, resume, and completion-boundary behavior are binding in
`docs/autopilot-loop-contract.md`. Scenario-backed verification, verdict
artifacts, closeout events, closeout artifacts, and Wiki Memory promotion
candidates are binding in `docs/verification-closeout-contract.md`.

The implementation route is:

```text
Pi runtime foundation
+ Helmsman Core event/reducer protocol
+ Manifest as canonical durable state
+ Board as rebuildable situation projection
+ Pi TUI workbench
+ Core-authored Question UI Adapter
+ Pi role runner for chat, research, audit, implementation, and verification
+ external adapters only where they add host-specific capability
```

This is not an MVP reduction. It is the proof order for the ultimate product:
first prove that Helmsman can use Pi's runtime and TUI surfaces without giving
Pi, a chat transcript, or an external adapter route authority.

Current status: Gate 1 Pi Runtime Foundation, Gate 2 Core Event System, Gate 3
Pi TUI Workbench shell, Gate 4 Charting Form Authority, and the RoleRuntime
foundation are implemented and verified in this worktree. Gate 5B Memory And
Research is also implemented and verified for scoped scans, lane contracts,
worker packets, artifact validation, synthesis, and Board projection. Gate 6
Route Lock And Amendments is implemented and verified for readiness,
deterministic snapshots, user confirmation, amendments, invalidation, unlock,
Board projection, CLI, and TUI surfaces. Gate 7 Board-Governed Autopilot is
implemented and verified for Board-read action selection, loop plans, bounded
packets, route-adherence evaluation, drift response, park/recover semantics,
CLI, and TUI surfaces. Gate 8 Verification And Closeout is implemented and
verified for scenario-backed run plans, verdict artifacts, retry history, Board
verification matrix state, closeout records, evidence indexes, memory
promotion candidates, CLI, and TUI surfaces. Gate 9 Product QA And Release is
implemented and verified for installed-state lifecycle commands, read-only
doctor, package smoke, product-audit artifacts, no-mock audit, update/uninstall
safety, and TUI `/qa-product` routing. Release hardening remains the next
evidence step before any publication claim.

## Closed Route Defaults

These defaults are binding until a later Route Lock or design audit changes
them:

- Build directly on Pi's in-process SDK/runtime/TUI stack.
- Treat Pi as substrate, not product authority.
- Keep the Manifest as machine source of truth and the Board as rebuildable
  projection.
- Reuse `helmsman-desktop` protocol semantics as donor material, not its
  Electron shell.
- Keep Codex, OpenCode, OMP, Claude Code, and future hosts as secondary
  adapters selected by capability and evidence quality.
- Do not claim product surfaces beyond Gate 9 Install/Doctor/Product Audit until this
  worktree contains the corresponding runtime files and verification proves the
  claim.

## Gate Order

### Gate 1: Pi Runtime Foundation

Prove package and runtime integration:

- Node floor matches the selected Pi package version.
- Pi SDK imports work from Helmsman's runtime code.
- `createAgentSession` can run with in-memory and persisted session handling.
- settings and resource loaders are configurable.
- Pi event subscription writes durable operation evidence.
- abort, timeout, and interrupted states are captured.
- provider/model readiness can be reported without storing secrets.

Gate 1 acceptance, command shape, source boundary, operation lifecycle,
provider-readiness behavior, and focused verification are defined in
`docs/pi-runtime-foundation-contract.md`.

Gate 1 implementation status: complete for the current foundation surface.
Verified commands are `npm run typecheck`, `npm run verify`, and
`npm run verify:pi-runtime:live`.

### Gate 2: Core Event System

Implement the authoritative command/event/reducer layer:

- create or resume a Helmsman run
- append events through a locked append transaction
- append validated domain events
- rebuild `manifest.json`
- rebuild `board.json`
- enforce file locks for append-only event logs
- reject generic `setState` mutation
- expose deterministic replay for QA
- evaluate gates with stable blocker/error codes
- recover stale projections from a valid event log

Gate 2 acceptance, command legality, reducer, Board projector, gate evaluator,
replay, recovery, and non-acceptance cases are defined in
`docs/core-event-reducer-board-contract.md`.

Gate 2 implementation status: complete for the current Core authority surface.
Verified commands are `npm run typecheck`, `npm run verify`, and
`npm run verify:core`.

### Gate 3: Pi TUI Workbench

Build the native workbench with Pi TUI primitives:

- normal chat surface that does not force Charting
- command routing
- Board pane
- Manifest/route pane
- operation monitor
- artifact/evidence inspector
- role/provider controls
- session resume and replay

The Workbench renders state and submits commands. It does not mutate authority
files directly.

Gate 3 implementation status: complete for the current Workbench shell surface.
Verified commands are `npm run typecheck`, `npm run verify`, and
`npm run verify:tui`.

### Gate 4: Charting Form Authority

Implement Core-authored question bundles through an audited Question UI Adapter.
The adapter may use Pi TUI components directly or wrap a reviewed package such
as `@juicesharp/rpiv-ask-user-question`.
The binding decision is in `docs/question-ui-adapter-decision.md`: the default
route-authority renderer is Core-owned Pi TUI; rpiv is optional only through a
Helmsman authority wrapper, upstream patch, or narrow vendored adapter.

Acceptance requires:

- at most four questions per bundle
- two to four options per question
- optional recommended option with reason
- free-form override
- route-effect metadata
- stable question and bundle ids
- question ledger evidence
- Manifest events
- Board blockers and route patches
- headless proof for CLI/CI
- rendered evidence that the user saw the full option surface

Gate 4 implementation status: complete for the current Charting Form Authority
surface. Verified commands are `npm run typecheck`, `npm run verify`, and
`npm run verify:question-ui`. This does not complete Memory/Research, Route
Lock, Autopilot, Verification/Closeout, full TUI
completion, or product audit.

### Gate 5A: RoleRuntime Foundation

Implement the Core-owned role execution boundary before memory and research
claim execution:

- live Pi provider/model binding from installed Pi settings
- `RoleBindingContract` validation through Core events
- `RoleRunPlan` generation from Manifest and Board revision
- bounded Pi AgentSession execution
- `role-runs/<role-run-id>/plan.json`, `prompt.md`, `pi-events.jsonl`,
  `transcript.jsonl`, `tool-events.jsonl`, `artifacts.json`,
  `diagnostics.json`, and `result.json`
- Core `role.run_planned`, `role.run_started`,
  `role.run_evidence_captured`, and `role.run_finished` events
- operation records and evidence records that do not accept artifacts or move
  route authority by themselves
- final model messages recorded as evidence only

RoleRuntime implementation status: complete for the current Pi AgentSession
foundation surface. Verified commands are `npm run typecheck`, `npm run verify`,
and `npm run verify:role-runtime`. This foundation remains separate from
research artifact acceptance and route movement authority.

### Gate 5B: Memory And Research

Implement scoped memory scan and parallel research:

- Aperture Bundle before memory scan
- memory classification as reused, stale, irrelevant, missing, or conflict
- research lane contracts with route-changing decision impact
- role bindings resolved through `docs/pi-role-runtime-contract.md`
- worker packets mapped to bounded Pi AgentSession runs
- role-run event, transcript, tool, artifact, and diagnostic evidence captured
- Pi role-runner dispatch for independent lanes
- one durable artifact or explicit drop reason per active lane
- `research-index.md` coordination ledger
- Board movement for lane status and score changes

The binding detailed contract is `docs/memory-research-contract.md`.

Gate 5B implementation status: complete for the current Memory/Research
surface. Verified commands are `npm run typecheck`, `npm run verify`, and
`npm run verify:memory-research`. This implements Aperture-scoped memory scan,
classification, research lane contracts, worker packet generation, research
index, artifact rejection/acceptance, synthesis, and TUI projection. It does
not by itself claim release publication readiness.

### Gate 6: Route Lock And Amendments

Implement user-authorized Route Lock:

- lock readiness evaluation
- deterministic lock snapshot and snapshot hash
- unresolved-question blockers
- missing-evidence blockers
- user authority checkpoint
- route amendments
- unlock and re-Charting semantics
- lock-invalidating drift detection

Gate 6 acceptance, event payloads, user confirmation surface, amendment policy,
unlock, invalidation, Board projection, and Autopilot preconditions are defined
in `docs/route-lock-amendment-contract.md`.

Gate 6 implementation status: complete for the current Route Lock/Amendment
surface. Verified commands are `npm run typecheck`, `npm run verify`, and
`npm run verify:route-lock`. This implements readiness blockers, canonical
snapshot hashes, proposal and user confirmation evidence, locked-route
immutability, typed amendments, invalidation, unlock, Board projection, CLI,
and TUI surfaces. It does not implement installed-state audit or product
release readiness.

### Gate 7: Board-Governed Autopilot

Implement durable Autopilot loops:

- read Board revision before every loop
- select only `BoardProjection.nextLegalAction`
- write an `AutopilotLoopPlan` before execution
- prepare bounded role-runner or adapter packets
- execute role runs through the Core-owned RoleRuntime contract
- capture Pi/external event streams
- record before/after Board snapshots
- evaluate route adherence
- accept or reject artifacts through Core
- support retry, resume, repair, amend, park, stop, and timeout states

An agent's final message is never completion. Completion requires Core-accepted
artifacts, Board movement, and verification evidence.
The binding detailed contract is `docs/autopilot-loop-contract.md`.

Gate 7 implementation status: complete for the current Board-Governed
Autopilot surface. Verified commands are `npm run typecheck`, `npm run
verify`, and `npm run verify:autopilot`. This implements Board-read
preconditions, `AutopilotLoopPlan`, packet preparation, Core
action/packet/start/adherence/drift/finish/recovery events, reducer validation,
Board projection, CLI/TUI surfaces, RoleRuntime packet dispatch entrypoint,
park/recover handling, write-root conflict rejection, and final-message
non-authority. This does not implement installed-state audit or product release
readiness.

### Gate 8: Verification And Closeout

Implement route scenario verification:

- stable scenario ids
- declared verifier role runtime
- expected verification artifact
- Core pass/fail event
- Board projection
- closeout artifact
- Wiki Memory promotion candidates

Green tests count only when they cover a named route scenario.
The binding detailed contract is `docs/verification-closeout-contract.md`.

Gate 8 implementation status: complete for the current Verification/Closeout
surface. Verified commands are `npm run typecheck`, `npm run verify`, and
`npm run verify:verification-closeout`. This implements Core-authored
verification run plans, scenario contracts derived from locked route scenarios,
expected verdict artifacts, Core-recorded pass/fail/blocked/parked verdicts,
retry attempt history, Board verification matrix projection, closeout
precondition checks, closeout artifacts, evidence indexes, memory promotion
candidates requiring explicit user approval, CLI `helmsman verification ...`
and `helmsman closeout record`, and TUI `/verify` and `/closeout` surfaces.
This does not implement installed-state audit, package smoke, update/uninstall
safety, or product release readiness.

### Gate 9: Product QA And Release

Implement product-level release evidence:

- static schema/reducer tests
- Manifest replay tests
- Board projection tests
- question adapter tests
- role runtime resolution tests
- live Pi provider readiness QA
- live Pi agent-session proof QA
- Autopilot Board-read loop QA
- route adherence QA
- package install smoke
- TUI pty smoke
- multisession recovery smoke
- no-mock product audit
- read-only doctor installed-state report
- update and uninstall dry-run safety
- requirement-to-evidence product audit report

Fake providers may support unit or contract tests, but they cannot prove live
provider completion.

Gate 9 implementation status: implemented and verified for the current
Install/Doctor/Product Audit surface. The checkout now has `helmsman install`,
`helmsman init`, `helmsman update`, `helmsman uninstall`,
`helmsman product-audit`, and `helmsman verify`; a read-only
`helmsman.doctor.v1` report; project/user install manifests with managed-file
hashes; approval-gated update and uninstall boundaries; actual `npm pack` plus
isolated installed-binary smoke; product-audit artifacts; no-mock audit
classification; and TUI `/qa-product` routing. Publication readiness still
requires executing the full release gate, including live product-audit evidence
when credentials are available.

## Donor Mapping

The old desktop implementation should be reused for meaning, not for shell.

| Donor term | New product term | Reuse policy |
| --- | --- | --- |
| `GoalRun` | `HelmsmanRun` inside the Manifest | Keep the root-run semantics. A run is larger than one terminal session or one host chat. |
| `RouteContract` | `manifest.route` plus rendered contract | Keep scope, non-goals, stop conditions, evidence, and verification scenarios. |
| `QuestionBundle` | `manifest.questions.bundles` | Keep option reason, tradeoff, opens, closes, recommendation, and route effect. |
| `QuestionAnswer` | `manifest.questions.answers` plus question ledger | Keep answer evidence and route patch semantics. |
| `ResearchLane` | `manifest.research.lanes` | Keep selected aperture, sources, decision impact, expected artifact, and status. |
| `WorkerPacket` | `manifest.workers.packets` | Keep allowed read/write scopes, forbidden actions, expected artifacts, and completion contract. |
| `WorkerLane` | `manifest.workers.lanes` | Keep runtime session, lease/status, blocker, and artifact linkage. |
| `Artifact` | `manifest.artifacts` | Keep expected path, classification, acceptance status, hash, and reviewer evidence. |
| `Evidence` | `manifest.evidence` | Keep accepted proof links for research, verification, route lock, and closeout. |
| `PhaseGate` | `manifest.gates` | Keep gate evaluation in Core, never in the TUI, Pi session, or adapter. |
| `RunWorkbenchProjection` | `board.json` | Rebuild from Manifest and events. The Board is not an independent source of truth. |

The old names can remain inside migration notes and adapter code while the user
surface speaks in Helmsman, Charting, Manifest, Board, Route Lock, and Autopilot.

## Manifest Contract

The Manifest is the machine SSOT for one Helmsman run.

Canonical files:

```text
.helmsman/sessions/<run-id>/manifest.json
.helmsman/sessions/<run-id>/manifest.events.jsonl
```

Required projection/config files:

```text
.helmsman/sessions/<run-id>/board.json
.helmsman/sessions/<run-id>/question-ledger.json
.helmsman/sessions/<run-id>/role-registry.json
.helmsman/sessions/<run-id>/scorecard.json
.helmsman/sessions/<run-id>/research-index.md
```

Required top-level domains:

- `run`: id, title, workspace, created/updated time, active stage, route lock status.
- `route`: goal, scope, non-goals, assumptions, stop conditions, risks, verification scenarios.
- `questions`: bundles, options, answers, recommendation metadata, user/lead authority, evidence references.
- `memory`: scan records, reused/stale/missing/conflict judgments, and route effects.
- `research`: lane contracts, lane artifacts, research index, synthesis.
- `roles`: role ids, provider/model/thinking/mode/tool bindings, concurrency, and fallback policy.
- `workers`: packets, lanes, runtime sessions, leases, blockers.
- `artifacts`: expected artifacts, written artifacts, classification, accepted evidence.
- `evidence`: durable proof records linked to questions, artifacts, verification, route decisions, and closeout.
- `gates`: Charting, research, route lock, Autopilot, verification, and closeout gates.
- `scorecard`: weighted categories, hard floor rules, current score, and last movement.
- `adapters`: capability reports and diagnostics only; no route authority.
- `amendments`: pending, applied, rejected, and lock-invalidating route changes.

Only Core commands may mutate canonical Manifest state. Human Markdown files,
Pi session history, and chat transcript are evidence surfaces, not authority.

## Board Contract

The Board is a rebuildable projection from Manifest, events, research index,
artifacts, and evidence.

Required Board sections:

- active stage and Board revision
- route lock status
- next legal action
- forbidden actions
- open questions and blockers
- memory scan status
- research lane progress
- role runner and adapter status
- operation monitor summary
- checklist gates
- weighted scorecard
- recent Board delta
- drift warnings
- pending amendments
- verification matrix
- replay and recovery hints

Autopilot must read the current Board revision before every loop and write back
through Core events after meaningful work.

## Reducer Contract

Core owns command, event, gate, and projection semantics.

The first reducer must support:

- create or resume a Helmsman run
- ask a Charting question bundle
- record a user answer or lead default
- apply route patches from answers
- create a scoped memory scan
- create or update a research lane contract
- record research artifact status
- update research index membership
- evaluate checklist gates
- evaluate weighted scorecard
- rebuild Board from Manifest and events
- recommend Route Lock without locking it

It must not support a generic mutation escape hatch.

## Runtime Contract

Pi sessions and external adapters are operation surfaces. Each operation must
record:

- operation id
- kind
- role
- provider/model/thinking/mode
- prompt path
- event log path
- Pi session id or adapter session id
- status
- timeout/cancel/interrupted state
- expected artifact path
- produced artifact path
- evidence path
- Board before and after
- route-adherence result
- retry or resume command

Core accepts or rejects operation output. Runtime output cannot advance phase
state by itself.
