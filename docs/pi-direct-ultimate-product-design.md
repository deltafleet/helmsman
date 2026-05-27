# Pi-Direct Ultimate Product Design

Status: current binding architecture and product design

## Decision

Helmsman should be built directly on the Pi runtime stack.

Pi is not the product authority. Pi is the implementation substrate for agent
sessions, provider and model access, terminal UI primitives, resource loading,
session trees, event streaming, and optional extension/package surfaces.

Helmsman remains the product and protocol authority:

```text
Helmsman Core owns route legality.
Pi executes agent turns and renders terminal interaction.
The Manifest is the machine source of truth.
The Board is the live projection Autopilot must read.
Pi session history is evidence, never authority.
```

This is not an MVP route. It is the full product route with proof gates ordered
so that each stage proves a real contract needed by the end state.

## Non-Negotiable Product Scope

The final product is a native terminal workbench for route-governed autonomy.

The product must include:

- normal chat that can be used without Charting
- explicit Charting mode
- structured question bundles with plain-language options and user authority
- Manifest and event reducer as machine source of truth
- Board projection as Autopilot's live situation surface
- scoped Wiki Memory scan before repeat research
- parallel research lane dispatch with durable artifacts
- purpose-specific roles, models, thinking levels, tools, and concurrency policy
- Route Lock, route amendment, unlock, and stop semantics
- Board-governed Autopilot loops
- verification matrix and scenario evidence
- operation monitor, diagnostics, replay, and run review
- package/install/doctor/update surfaces
- product QA and requirement-by-requirement audit surfaces
- no dependence on chat transcript, adapter output, or a host model as route authority

The design must not be narrowed into:

- a demo terminal UI
- a prompt pack
- a Pi extension that asks nice questions but does not own route state
- a thin wrapper around Pi chat
- a mock provider harness
- hardcoded question, route, model, or verification branches
- a fake Autopilot loop that only records that an agent said it worked

## Architecture

```text
Helmsman CLI
  starts the native terminal workbench
  exposes non-interactive commands for CI, doctor, QA, and recovery

Helmsman Workbench
  built with Pi TUI primitives
  renders chat, question forms, Board, Manifest, operations, artifacts, and pickers
  never mutates route authority directly

Helmsman Core
  owns command validation, events, reducers, gates, Route Lock, amendments,
  Board projection, scorecards, verification, run review, and closeout

Document Bus
  stores Manifest/events, Board, rendered contracts, memory scans, research
  artifacts, worker packets, adapter evidence, verification, and closeout memory

Pi Runtime Substrate
  provides AgentSession, AgentSessionRuntime, SessionManager, SettingsManager,
  ResourceLoader, provider/model/auth access, event streaming, tools, and TUI components

Question UI Adapter
  renders Core-authored question bundles through Pi TUI or an audited Pi package
  such as @juicesharp/rpiv-ask-user-question
  returns structured answers and evidence to Core

Role Runner
  resolves Helmsman roles to Pi models, thinking levels, tools, budgets, and
  concurrency controls
  launches bounded Pi agent sessions for chat, research, design, audit,
  implementation, and verification work

External Adapter Layer
  integrates Codex, OpenCode, Claude Code, OMP, or future hosts only when their
  capabilities improve the route
  never owns completion, route lock, or Manifest mutation
```

## Pi Integration Contract

Helmsman should use Pi in-process by default.

The primary integration layer is the Pi SDK:

- `createAgentSession` for a single agent session
- `AgentSession` for prompting, steering, following up, event subscription, compaction, model control, abort, and state access
- `createAgentSessionRuntime` and `AgentSessionRuntime` when Helmsman needs session replacement, resume, fork, import, or cwd-bound runtime rebuild
- `SessionManager` for Pi conversation/session persistence and tree traversal
- `SettingsManager` for merged global/project Pi settings
- `DefaultResourceLoader` for extensions, skills, prompts, themes, and context files
- `defineTool` and custom tool surfaces for Helmsman-owned bounded tools when appropriate

Pi RPC and JSON event stream modes are fallback and QA surfaces, not the main
architecture. Use them when process isolation, language-agnostic clients, or
black-box compatibility tests are needed.

Pi session files are useful because they are durable JSONL trees with messages,
custom entries, model/thinking changes, compaction, labels, and session info.
Helmsman may link to them as evidence, but must not derive route legality from
them.

## Package And Runtime Baseline

Current external baseline checked on 2026-05-27:

```text
@earendil-works/pi-coding-agent: 0.75.5
@earendil-works/pi-tui: 0.75.5
Node requirement: >=22.19.0
Local Node: v24.11.0
@juicesharp/rpiv-ask-user-question: 1.13.0
```

Helmsman package metadata must therefore target Node `>=22.19.0` or a newer
floor proven by the chosen Pi version.

Pin Pi package versions intentionally. Do not accept silent major behavior drift
in provider auth, session format, TUI rendering, or extension APIs.

## Authority Model

### Core Authority

Only Helmsman Core may:

- create a Helmsman run
- append authoritative Manifest events
- rebuild `manifest.json`
- rebuild `board.json`
- decide if a question is open, answered, waived, blocked, or lock-ready
- accept research artifacts
- accept verification artifacts
- lock, unlock, or amend a route
- mark Autopilot loops as complete, blocked, failed, timed out, or drifted
- advance phase state
- close a run

### UI Authority

The Workbench may:

- display Core state
- submit user commands to Core
- render question forms from Core-authored bundles
- collect answers and return them to Core
- show operation state, evidence, artifacts, diagnostics, and replay

The Workbench must not:

- patch Manifest or Board files directly
- infer route lock from user interface state
- treat a submitted form as accepted until Core records the event

### Pi Authority

Pi may:

- execute agent turns
- provide model/provider/auth/runtime services
- render TUI components
- stream events
- persist Pi-native session history
- run tools exposed to Pi agents

Pi must not:

- decide whether Helmsman route state advanced
- mark a research lane complete because a model replied
- accept a verification pass without the required artifact
- replace the Helmsman Manifest with Pi session history

### External Adapter Authority

External CLIs may execute bounded work. Their output is evidence candidate only.
Core accepts, rejects, retries, or parks that output.

## Document Bus Layout

Canonical session layout:

```text
.helmsman/sessions/<session-id>/
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

`manifest.events.jsonl` is append-only. Reducers rebuild the Manifest and Board
from events and accepted artifacts. Generated Markdown is a human view, not an
authority layer.

## Manifest Contract

The Manifest is the machine contract for one Helmsman run.
The binding durable schema, event envelope, route-effect model, Board
projection, operation state, and Question UI Adapter contracts are specified in
`pi-direct-data-contracts.md`.

Top-level domains:

- `run`: identity, workspace, title, timestamps, active stage
- `route`: goal, scope, non-goals, assumptions, risks, stop conditions,
  success criteria, verification scenarios
- `questions`: bundles, options, recommendations, answers, authority source,
  route effects, evidence references
- `memory`: memory scans, reused/stale/missing/conflict judgments, route effects
- `research`: lane contracts, workers, artifacts, status, synthesis, accepted evidence
- `roles`: role registry references and resolved runtime bindings
- `workers`: packets, leases, sessions, statuses, blockers, artifacts
- `artifacts`: expected paths, produced paths, hashes, classification, acceptance
- `evidence`: question, research, adapter, verification, route lock, and closeout proof records
- `gates`: Charting, research, lock, Autopilot, verification, closeout evaluations
- `scorecard`: weighted categories, hard floors, movements, latest score
- `adapters`: safe capability reports and operation diagnostics
- `amendments`: pending, applied, rejected, and lock-invalidating route changes

No generic `setState` event is allowed. Every state transition must have a
domain event with validation, preconditions, and deterministic reducer behavior.

## Board Contract

The Board is rebuilt from Manifest events and accepted artifacts.

It must expose:

- current stage
- route lock status
- next legal action
- forbidden actions
- open questions
- blockers
- research lane progress
- role/worker status
- active and recent operations
- checklist gate coverage
- scorecard values and hard floors
- last improvement
- last regression
- drift warnings
- pending route amendments
- verification matrix
- artifact/evidence summary
- replay and recovery hints

Autopilot must read the Board revision before every loop. Every meaningful loop
must record a before/after Board snapshot and a Board delta. A revision bump
alone is not sufficient progress.

## Charting Contract

Charting is the route compiler.

It is explicit:

```text
/charting <intent>
```

Normal chat remains normal. Charting is not forced onto small questions.

Charting loop:

```text
Signal Read
-> Aperture Question Bundle
-> Answer Evidence
-> Scoped Memory Scan
-> Research Lane Contract
-> Parallel Research
-> Synthesis
-> Decision Question Bundle
-> Sharpness Check
-> Route Lock or repeat
```

Rules:

- At least one Aperture Bundle is required before scoped memory scan.
- Broad memory scan before the first Aperture Bundle is forbidden.
- One bundle has at most four questions.
- Bundle count is unbounded across Charting.
- Every question must be route-changing.
- Every question should offer 2 to 4 realistic options.
- One option may be recommended, but recommendation is not an answer.
- Free-form override must be available.
- Answers must preserve the user's wording when it changes authority or nuance.
- Route Lock is forbidden while a reasonable Autopilot could execute a different destination from the same route card.

## Question UI Adapter

The old skill contract said native chat was the only question surface. Pi-direct
Helmsman should replace that with a stricter product-level contract:

```text
Core-authored question bundle
-> audited Question UI Adapter
-> structured answer details
-> Core validation
-> question-ledger event
-> Manifest route patch
-> Board projection
```

The UI adapter may be built directly with Pi TUI components or wrapped around a
reviewed package such as `@juicesharp/rpiv-ask-user-question`.
The binding integration decision is `question-ui-adapter-decision.md`: build a
Core-owned Pi TUI renderer first; use rpiv only through a Helmsman authority
wrapper, upstream patch, or narrow vendored adapter that preserves stable ids,
route effects, rendered evidence, and headless behavior.

That package is directionally strong because it already supports structured
question arrays, 2+ options, option descriptions, optional previews, multi-select,
free-text fallback, answer details, cancellation, per-option notes, and a submit
review surface. Helmsman still needs a wrapper because the package is model-tool
oriented, while Helmsman questions are Core-owned route authority surfaces.

The Helmsman wrapper must add or preserve:

- stable `questionId`
- stable `bundleId`
- question type: aperture, decision, amendment, verification, stop
- recommended option id and reason
- route effect metadata
- authority boundary metadata
- lock blocker impact
- evidence reference
- headless behavior for CLI and CI
- localization policy
- validation of max 4 questions and 2 to 4 options
- transcript/render evidence that the user actually saw the full option surface

If the third-party package cannot expose a needed contract, Helmsman must either
patch upstream, wrap it with a companion renderer, or vendor a narrow adapter
after review. It must not silently drop recommended options, route effects, or
answer evidence.

## Memory Scan Contract

Memory is a scoped research cache, not a substitute for judgment.
The binding detailed Memory and Research contract is
`docs/memory-research-contract.md`.

After the first Aperture answer, Core creates a memory scan:

```text
.helmsman/sessions/<id>/memory/<scan-id>.md
.helmsman/sessions/<id>/memory-index.md
```

Each candidate is classified as:

```text
reused | stale | irrelevant | missing | conflict
```

Only stale, missing, or conflicting memory may create research lanes. Reused
memory must cite the source and route effect. Irrelevant memory must record why
it does not apply.

## Research Lane Contract

Research is parallel by default when lanes are independent.

Every lane must define:

- slug
- route-changing question
- lane type
- sources to inspect
- sources to skip
- expected artifact path
- owner role
- allowed write scope
- acceptance criteria
- decision impact
- open uncertainty

Every active lane must produce exactly one durable artifact or an explicit drop
reason:

```text
research/<slug>.md
```

`research-index.md` is the coordination ledger. A free-form note is acceptable
only if the index and Board can account for sources, status, decision impact,
score movement, and route effect.

The default active research lane cap is 6 unless the user explicitly raises it.

## Role Runtime Contract

Roles are purpose-specific runtime bindings, not labels.

The binding detailed contract is `docs/pi-role-runtime-contract.md`. It defines
role bindings, RoleRunPlan construction, worker packet mapping, Pi AgentSession
execution, event capture, concurrency, artifact acceptance, recovery, and live
provider QA. This section is the product summary; the separate contract is the
implementation authority.

Initial roles:

- `chat.default`
- `charting.question_designer`
- `charting.memory_scanner`
- `charting.researcher`
- `charting.synthesizer`
- `charting.skeptic`
- `autopilot.director`
- `autopilot.strategist`
- `autopilot.implementor`
- `autopilot.auditor`
- `verify.judge`
- `closeout.writer`

Each role resolves to:

- provider
- model
- thinking level
- mode: auto, fast, deep
- tool policy
- sandbox policy
- max parallelism
- max turns
- cost or token budget when supported
- fallback policy
- required artifacts
- forbidden authority claims

Resolution uses Pi model/provider/auth capabilities first. External adapters
are used when a role explicitly requires a host-specific execution capability.
The RoleRuntime must read the current Board revision before launch, subscribe
to Pi events before prompting, write role-run evidence under
`.helmsman/sessions/<run-id>/role-runs/<role-run-id>/`, and return a sealed
result for Core acceptance or rejection.

## Autopilot Contract

Autopilot executes a locked route. It does not choose the route.
The binding detailed loop contract is `docs/autopilot-loop-contract.md`.

Loop:

```text
read Board revision N
-> decide next legal action
-> prepare bounded packet
-> launch role runner or external adapter
-> collect event stream and artifacts
-> record operation evidence
-> evaluate route adherence
-> accept/reject artifacts
-> rebuild Manifest and Board
-> record Board delta
-> continue, repair, amend, ask, park, or stop
```

Autopilot must stop before execution when:

- route is not locked
- pending route amendment exists
- open user-owned question blocks action
- required artifact contract is missing
- Board revision changed incompatibly
- prior loop failed route adherence
- verification evidence contradicts completion
- action would exceed autonomy boundary

Autopilot may run repeated implementor/auditor loops, but each loop must be
bounded by the Board and leave durable evidence. A model's final message is not
completion.

## Verification Contract

Verification is a first-class route phase.
The binding detailed Verification and Closeout contract is
`docs/verification-closeout-contract.md`.

Every route has stable scenario IDs:

```text
VS-001
VS-002
...
```

Verification passes only when:

- the verifier role ran under the declared runtime binding
- the expected artifact exists
- the artifact cites evidence
- Core records the pass event
- Board projects the scenario as passed
- no hard floor or route-adherence failure remains

Green tests are evidence only when they cover the named route scenario.

## TUI Product Surface

The Workbench should be dense, operational, and terminal-native.

Primary panes:

- Conversation
- Board
- Question Form
- Manifest/Route
- Operation Monitor
- Artifact/Evidence Inspector
- Role/Provider Controls
- Activity/Run Review

Primary commands:

```text
/chat
/charting
/questions
/answer
/memory
/research
/manifest
/board
/lock
/amend
/autopilot
/verify
/roles
/providers
/models
/runs
/diagnostics
/doctor
/qa-product
/help
```

Pi TUI components should be used for rendering and input ergonomics. Components
must respect width, IME focus behavior, keyboard shortcuts, overlays, and
existing Pi theming rules. Form text must not be an afterthought; question
surfaces are part of route authority.

## Observability And Recovery

Helmsman must make every long-running action inspectable.

Operation state records:

- operation id
- kind
- role
- provider/model/thinking
- prompt path
- event log path
- Pi session id or adapter session id
- status
- timeout/cancel state
- artifact path
- evidence path
- Board before/after
- route-adherence result
- review severity
- retry/resume command

Run review must survive TUI restart. Interrupted operations are marked
interrupted, not silently dropped. Retry and resume must target the same durable
run when appropriate.

## QA Surfaces

Product QA is not a demo smoke.

Required QA families:

- static schema and reducer tests
- Manifest replay tests
- Board projection tests
- question form UI tests
- headless question adapter tests
- memory scan classification tests
- research lane artifact validation tests
- role runtime resolution tests
- Pi live provider readiness QA
- Pi live agent-session proof QA
- Autopilot Board-read loop QA
- route adherence QA
- verification artifact QA
- package install smoke
- TUI pty smoke
- multisession recovery smoke
- no-mock product audit

Any test that uses fake providers must be named as a unit or contract test. It
cannot be used as live provider evidence. Product completion requires at least
one real provider-backed path for the relevant claim.

## Security And Secrets

Helmsman must not store provider secrets.

Provider credentials remain in Pi auth storage, environment variables, or
provider-specific secure storage. Helmsman may store safe summaries:

- provider id
- availability
- selected model
- auth configured yes/no/unknown
- warning codes
- checked time

Raw tokens, OAuth refresh tokens, API keys, and full provider debug output must
not be written to `.helmsman`.

## Implementation Route

This route is incremental but not scope-reduced.

### Gate 1: Pi Runtime Foundation

Prove package and runtime integration:

- Node floor matches Pi
- Pi SDK imports work
- `createAgentSession` can run with in-memory and persisted session managers
- settings/resource loaders are configurable
- event subscription records stream evidence
- abort/timeout behavior is captured

The binding Gate 1 command, file, operation, security, and verification contract
is `pi-runtime-foundation-contract.md`.

### Gate 2: Core Event System

Implement Manifest events, reducer, schemas, Board projection, and file locks.
No UI or adapter may bypass this.
The binding detailed contract is `docs/core-event-reducer-board-contract.md`.

### Gate 3: Workbench Shell

Build the Pi TUI workbench with normal chat, Board pane, Manifest pane,
operation monitor, command routing, and session resume.

Gate 3 implementation status: implemented and verified for the Workbench shell.
The shell renders Board, Manifest/route, operations, artifacts/evidence, role
state, provider readiness, diagnostics, normal chat, session resume, and Core
replay. It submits `/chat` and `/charting` through Core commands and blocks
future-gate commands instead of faking them.

### Gate 4: Charting Form Authority

Implement Core-authored question bundles through the Question UI Adapter. Record
question ledger, event evidence, and Board blockers. Include headless and TUI
proofs.

Gate 4 implementation status: implemented and verified for the current
Core-owned Question UI Adapter surface. The implementation renders a structured
Aperture bundle, records full surface evidence, validates bundle hashes, maps
visible aliases to stable option ids, preserves free-form text, appends answer
events, and projects route effects through the Manifest/Board authority layer.

### Gate 5A: RoleRuntime Foundation

Implement Core-owned role bindings, RoleRunPlan generation, bounded Pi
AgentSession execution, event/transcript/tool evidence capture, diagnostics,
sealed RoleRunResult files, and Core role-run events.

RoleRuntime implementation status: implemented and verified for the current Pi
AgentSession foundation surface. The implementation records role-run plans,
prompts, Pi event logs, transcripts, tool-event logs, artifact ledgers,
diagnostics, result evidence, operation records, and role-run Manifest events.
Role final messages remain evidence only and cannot accept artifacts, advance
phases, lock routes, verify scenarios, or close work.

### Gate 5B: Memory And Research

Implement scoped memory scan, research lane contracts, parallel role-runner
dispatch, artifact validation, research index, and synthesis.
Implement this from `docs/memory-research-contract.md`.

Gate 5B implementation status: implemented and verified for the current
Memory/Research surface. The checkout now has Aperture-scoped memory scans,
candidate classification, research lane declaration, worker packet generation,
artifact rejection/acceptance, synthesis, research index, and Board/TUI
projection. This does not lock a route or complete Autopilot, Verification,
Closeout, installed-state audit, or product release readiness.

### Gate 6: Route Lock And Amendments

Implement lock readiness, user authority checkpoint, amendments, unlock
semantics, and drift blockers.
The binding detailed contract is `docs/route-lock-amendment-contract.md`.

Gate 6 implementation status: implemented and verified for the current Route
Lock/Amendment surface. The checkout now has route-lock readiness evaluation,
deterministic route snapshots and hashes, user-visible confirmation evidence,
typed amendment proposal/application/rejection, unlock, invalidation, Board
blockers/forbidden actions, CLI command surface, and TUI `/lock` and `/amend`
surfaces. This does not implement installed-state audit or product release
readiness.

### Gate 7: Board-Governed Autopilot

Implement durable goal runs, Board-read loops, role runner execution,
before/after Board deltas, route adherence, retry/resume, and park/stop states.
Implement this from `docs/autopilot-loop-contract.md`.

Gate 7 implementation status: implemented and verified for the current
Board-Governed Autopilot surface. The checkout now has Autopilot precondition
evaluation, Board-read action selection, durable loop plans and packets,
Core action/packet/start/adherence/drift/finish/recovery events, reducer
validation, Board Autopilot projection, CLI/TUI surfaces, RoleRuntime packet
dispatch entrypoint, route-adherence/drift response, park/recover semantics,
write-root conflict rejection, stale Board rejection, missing snapshot hash
rejection, and final-message non-authority proof. This does not implement
installed-state audit or product release readiness.

### Gate 8: Verification And Closeout

Implement route scenario verification, artifact acceptance, closeout, and Wiki
Memory promotion candidates.
Implement this from `docs/verification-closeout-contract.md`.

Gate 8 implementation status: implemented and verified for the current
Verification/Closeout surface. The checkout now has Core-authored verification
run plans, scenario contracts derived from the locked route, expected verdict
artifacts, pass/fail/blocked/parked verdict events, retry attempt history,
Board verification matrix projection, closeout precondition checks, closeout
artifacts, evidence indexes, memory promotion candidates, CLI command surface,
and TUI `/verify` and `/closeout` surfaces. This does not implement
installed-state audit or product release readiness.

### Gate 9: Product QA And Release

Implement install/doctor/update, product QA, live provider QA, package
verification, and release gates.

The binding detailed contract is
`docs/install-doctor-product-audit-contract.md`. It defines the package command
surface, install manifest, read-only doctor behavior, approval-gated update,
uninstall boundaries, no-mock product audit, release gate, and installed-state
evidence requirements.

Each gate produces real product behavior and real evidence. None is a mock-only
prototype.

Gate 9 implementation status: implemented and verified for the current
Install/Doctor/Product Audit surface. The checkout now has lifecycle commands,
read-only doctor reports, install manifests, approval-gated update/uninstall,
actual package-install smoke, product-audit artifacts, no-mock classification,
and TUI `/qa-product` routing. Release readiness remains a separate evidence
claim and requires the full release gate, including live product-audit proof
when credentials are available.

## Current Repo Reality

This checkout contains docs, references, the imported desktop README, pinned Pi
runtime dependencies, a real `bin/helmsman.js`, Gate 1 Pi runtime foundation
code, Gate 2 Core authority code, Gate 3 Pi TUI Workbench shell, Gate 4
Question UI Adapter, RoleRuntime foundation, Gate 5B Memory/Research code,
Gate 6 Route Lock/Amendment code, Gate 7 Autopilot code, Gate 8
Verification/Closeout code, and Gate 9 Install/Doctor/Product Audit code.
Gate 2 adds typed Core
commands, append-only `manifest.events.jsonl`, deterministic Manifest
reduction, rebuildable Board projection, gate diagnostics, and replay/recovery.
Gate 3 adds Pi TUI Workbench rendering and command routing. Gate 4 adds
Core-authored question rendering and answer mapping. RoleRuntime adds bounded
Pi AgentSession execution with role-run evidence. Gate 5B adds Aperture-scoped
memory scan, research lane contracts, worker packets, artifact validation,
synthesis, research index, and Board/TUI projection. Gate 6 adds readiness
evaluation, canonical snapshot hash, user confirmation, amendment, unlock, and
invalidation surfaces. Gate 7 adds Board-read Autopilot preconditions, loop
plans, packets, route adherence, drift response, recovery, Board projection,
and CLI/TUI surfaces. Gate 8 adds scenario-backed verification run plans,
verdict artifacts, retry history, closeout artifacts, evidence indexes, memory
promotion candidates, Board projection, and CLI/TUI surfaces. Gate 9 adds
install/init/update/uninstall/product-audit/verify commands, read-only doctor,
install manifests, package smoke, no-mock audit, release-gate artifacts, and
TUI `/qa-product` routing. Gate 1, Gate 2, Gate 3, Gate 4, RoleRuntime
foundation, Gate 5B, Gate 6, Gate 7, Gate 8, and Gate 9 are implemented and
verified.

This is still not a published release candidate. Any document claiming
release-ready product surface is stale until the ordered release gate has been
run and its artifacts are preserved.

The design authority is this file plus the North Star documents that explicitly
promote this Pi-direct route. The design closure audit is recorded in
`docs/pi-direct-design-closure-audit.md`.

## Open Proofs To Close

These are implementation proof gates, not permission to shrink scope:

- prove any later `rpiv-ask-user-question` wrapper, patch, or vendor path
  preserves recommended option, stable id, bundle hash, route-effect metadata,
  and Core validation
- run and preserve the full release gate from
  `docs/install-doctor-product-audit-contract.md`, including live
  product-audit proof when credentials are available

Until these are closed, do not claim publication readiness. The correct state
is "Gate 1 through Gate 9 implemented and verified; release hardening and
release evidence remain."
