# Native Core TUI Plan

Status: current architecture plan, superseded by the Pi-direct substrate
decision in `pi-direct-ultimate-product-design.md` wherever older adapter-first
language conflicts.

## Decision

Helmsman is not an OMP plugin-first or Codex-first adapter product.

The current architecture is:

```text
Native Helmsman TUI
  owns the user-facing workbench, chat surface, form gates, Board, and status

Helmsman Core
  owns protocol legality, Charting, Manifest, Board, gates, events, and Autopilot

Document Bus
  stores machine SSOT, rendered human contracts, research artifacts, evidence,
  scorecards, and closeout memory

Pi Runtime Substrate
  provides AgentSession, runtime/session management, provider/model access,
  settings/resource loading, terminal UI primitives, and event streaming

Adapter Layer
  launches or coordinates Codex, OMP, OpenCode, Claude Code, and later hosts
  only when a role needs a host-specific execution capability
```

The product is a route-governed agent harness. Host CLIs execute work. They do
not own route authority.

## Why This Replaces OMP Plugin-First

The OMP plugin study proved OMP has valuable infrastructure: terminal UI,
provider/auth registry, model controls, task subagents, compaction, MCP/LSP, and
extension hooks.

It did not prove that an OMP plugin can deterministically own Helmsman's core
requirements:

- rich structured Charting forms with option descriptions and native evidence
- programmatic parallel research lane dispatch
- durable Manifest and Board reducer semantics
- session resolution independent of host chat state
- Board-read Autopilot continuation without duplicate or hidden drift
- route-changing decision stops that cannot be skipped by the host model

Those are not accessory features. They are the product.

Therefore OMP moves from product host to adapter/reference candidate. The same
authority rule applies to Pi: Pi is the direct substrate, but Helmsman Core
still owns route state and product legality.

## Authority Rules

Helmsman Core owns:

- session and run identity
- phase state
- question bundle lifecycle
- user answer evidence
- Manifest schema and reducer
- Board projection
- research lane contracts
- worker packet contracts
- route lock
- route amendments
- scorecard and verification matrix
- Autopilot next legal action
- drift detection
- completion and closeout gates

The TUI owns:

- normal chat surface
- explicit mode commands
- structured form rendering
- plain-language question and option presentation
- Board and Manifest views
- research lane status
- artifact and evidence inspection
- user stop, resume, amendment, and approval actions

Adapters own:

- host detection
- auth status reporting without storing secrets
- model/provider capability reporting
- worker launch or prompt handoff
- event collection where available
- artifact collection
- cancellation where available

Adapters do not mark a phase complete, lock a route, accept an artifact, or
change the Manifest directly.

Pi sessions and Pi TUI components follow the same authority boundary. They may
execute, render, persist Pi-native history, and stream events. They must not
replace the Manifest, Board, question ledger, or Core gate evaluation.

## Primary Surface

The primary surface is a native terminal TUI.

It starts as a normal chat-first coding-agent interface. Charting is a mode, not
an always-on tax.

Primary commands inside Helmsman:

```text
/chat
/charting
/questions
/research
/manifest
/board
/lock
/autopilot
/roles
/doctor
```

When running as an integration inside another host, commands may be namespaced
as `/hm:*`, but that is an adapter surface, not the core product language.

## Question UX Philosophy

Charting questions are not internal architecture memos. They are user decision
surfaces.

Every question should:

- use plain language first
- name the decision in one sentence
- explain why the answer matters
- offer 2 to 4 realistic options
- mark one recommendation when there is a clear default
- describe consequences without jargon
- allow a custom answer

Avoid option labels that require the user to already understand Helmsman
internals. Terms such as Charting, Core, adapter, Manifest, Board, Autopilot,
and route lock may appear when they are real product nouns, but they should be
introduced through the user's choice instead of used as a shortcut.

If the user has to understand donor implementation nouns such as `GoalRun`,
`RouteContract`, reducer, or adapter proof mode before they can answer, the
question is too internal. Translate it into the product choice first, then keep
the internal mapping in the Manifest or route notes.

The goal is not to simplify the product. The goal is to make serious choices
easy to answer without losing precision.

## State Layout

Current canonical layout:

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
  rendered/
    manifest.md
    board.md
  research-index.md
  worker-packets.md
  research/
    <slug>.md
  adapter/
    pi/
      <operation-id>.events.jsonl
      <operation-id>.last-message.md
    codex/
    opencode/
  artifacts/
  evidence/
  operation-state.json
  closeout.md
```

The machine Manifest and event log are the source of truth. Rendered Markdown is
for human inspection and agent reading.

## Implementation Route

The current implementation route is Pi-direct and Core-owned:

```text
Pi runtime foundation
+ Core event system
+ Pi TUI workbench shell
+ Charting form authority
+ RoleRuntime foundation
+ memory and research role runners
+ Route Lock and amendments
+ Board-governed Autopilot
+ verification and release QA
```

This is a proof sequence, not a product ceiling. The first gate proves that
Helmsman can use Pi's SDK/runtime/TUI surfaces without ceding route authority.
External CLI execution waits until Core, Manifest, Board, gates, questions, and
operation evidence are deterministic.

The old `helmsman-desktop` implementation should be reused through a mapping
table instead of copied as a shell. Keep the old protocol meanings where they
are proven: run identity, route contract, question bundles, worker packets,
artifacts, evidence, gates, adapter diagnostics, and rebuildable projections.
Expose the new product through Helmsman, Charting, Manifest, Board, Route Lock,
and Autopilot language.

See `implementation-route.md` for the binding implementation route and
`pi-direct-data-contracts.md` for Manifest, event, Board, operation, role-runner,
and Question UI Adapter contracts. Gate 1 runtime foundation details are
specified by `pi-runtime-foundation-contract.md`; RoleRuntime execution details
are specified by `pi-role-runtime-contract.md`.

## Research Philosophy

Research is an aggressive Charting tool, not a scarce resource to preserve.
The control mechanism is angle discipline, not research avoidance.

The intended token posture is useful-token maximization:

- use many tokens when independent lanes can improve route quality
- run parallel lanes when the host allows it
- force every lane to return a durable artifact
- avoid duplicate research by consulting Wiki Memory first
- refresh prior research only when it is stale, missing, conflicting, or too weak

Research sources include:

- local project code
- archived Helmsman history
- user-authored skills and agent definitions
- existing docs and previous session artifacts
- external reference projects
- host CLI behavior and config surfaces

Each lane must still be bounded. A valid lane names the decision it can change,
the sources it will inspect, the artifact it will write, and the acceptance bar.
Broad research is allowed only when it is split into aimed lanes.

The research artifact itself can be a free-form note. Helmsman should not force
every worker report into a rigid essay template. The required structure belongs
to the coordination layer:

- `research-index.md` records lane status, sources, decision impact, and route effect
- `board.json` records checklist and scorecard movement
- the note records the actual useful findings in the clearest shape for that lane

Route Lock cannot rely on an unindexed note. A free-form note becomes acceptable
only after the research index and Board can account for it.

## Wiki Memory Scan

Wiki Memory is a pre-research map, not a replacement for judgment.

Before launching research lanes, Charting should create or update:

```text
.helmsman/sessions/<session-id>/memory-scan.md
```

The scan records:

- current route question
- relevant wiki/index entries or prior session artifacts
- what prior memory already answers
- what is stale, missing, conflicting, or too shallow
- which research lanes remain necessary

Memory lookup must not skip the first Aperture Bundle. The Aperture answer gives
memory lookup its coordinates. After that, memory prevents waste: already
researched topics are reused, while gaps become research lanes.

## Board And Scorecard Loop

Autopilot reads the Board before every loop and writes back to it after every
meaningful step.

The Board should contain:

- current phase and next legal action
- checklist gate coverage
- benchmark categories
- scorecard values
- last improvement and last regression
- open risks and blocked items
- drift signals and route amendments

Board governance does not mean stopping on every mismatch. Minor drift should
update the Board and trigger repair or re-aiming. Route-changing drift, missing
authority, or broken evidence gates must stop the loop and return to Charting,
amendment, or user approval.

## Runtime And Adapter Order

The first execution substrate is Pi in-process runtime:

1. Pi SDK/runtime/session manager integration
2. Pi TUI workbench and Question UI Adapter
3. Pi role runner for chat, research, audit, implementation, and verification
4. External adapters only when host-specific capability is required

The role runner follows `docs/pi-role-runtime-contract.md`: Core prepares a
RoleRunPlan from the Manifest and current Board revision; Pi AgentSession
executes the bounded prompt; Core accepts or rejects artifacts through Manifest
events after inspecting evidence.

External adapter order is no longer product-defining. Codex, OpenCode, OMP,
Claude Code, and future hosts are selected by capability, evidence quality,
auth availability, cancellation behavior, artifact collection, and route
control. None of them may become the workflow authority.

## Reuse From `helmsman-desktop`

The archived desktop checkout should be used as a donor for:

- protocol object shapes
- kernel command model
- document-bus layout and rebuild logic
- Codex adapter patterns
- question, route, worker, artifact, and evidence schemas

Do not revive the Electron app as the default surface. If a graphical workbench
is needed later, it should be a secondary surface over the same Core and
document bus.

## Proof Gates

Implementation is not closed until these gates pass:

1. Pi runtime foundation proves SDK/runtime/session/settings/resource/event integration.
2. Core event system deterministically rebuilds Manifest and Board without generic mutation.
3. Pi TUI Workbench can run normal chat without entering Charting. This gate is
   implemented and verified for the Workbench shell surface.
4. `/charting` opens a Core-authored structured form bundle with at most 4
   questions. This gate is implemented and verified for the current Question UI
   Adapter surface.
5. Question answers append events, update the ledger, and project Board
   blockers or route patches. This gate is implemented and verified for
   Core-routed question answers.
6. Memory scans and research lanes can be declared, dispatched in parallel, and validated by artifact.
7. Route Lock refuses unresolved route-changing questions and missing critical evidence, then locks only through a user-confirmed route snapshot.
8. Autopilot reads the current Board revision before every action and updates checklist/scorecard state after meaningful work.
9. Pi role-runner or external adapter output cannot advance phase state without required artifacts and evidence.
10. Drift produces a Board event and either stops, asks, amends, repairs, or parks.
11. Product readiness requires installed-state doctor and product audit evidence.

These are not MVP cuts. They are the minimum proofs for the complete product.
The detailed Core event, reducer, Board projection, gate, replay, and recovery
rules are binding in `docs/core-event-reducer-board-contract.md`.
Memory scan, research lanes, worker packets, artifact validation, synthesis,
and Board projection are binding in `docs/memory-research-contract.md`.
Route Lock, amendment, unlock, invalidation, and Autopilot preconditions are
binding in `docs/route-lock-amendment-contract.md`.
Board-read Autopilot action selection, packet preparation, drift handling,
repair/audit loops, park/stop/ask/amend decisions, resume, and final-message
non-authority are binding in `docs/autopilot-loop-contract.md`.
Scenario-backed verification, verdict artifacts, closeout events, closeout
artifacts, and Wiki Memory promotion candidates are binding in
`docs/verification-closeout-contract.md`.

## Next Work

1. Add Route Lock readiness, deterministic route snapshots, user confirmation,
   amendments, unlock, and invalidation from
   `docs/route-lock-amendment-contract.md`.
2. Add Board-governed Autopilot only after Charting, Memory/Research, and Route Lock gates work,
   then prove it against `docs/autopilot-loop-contract.md`.
3. Add verification and closeout only through named scenario verdicts and
   closeout evidence from `docs/verification-closeout-contract.md`.
