# Helmsman Agent Guardrail

## Core Principle

Preserve the user's intended product scope. Do not silently downgrade Helmsman
into a prototype, demo, narrow smoke proof, prompt pack, OMP plugin, or desktop
archive revival.

The target product is a native terminal workbench where Helmsman Core owns
Charting, Manifest, Board, gates, route authority, and Autopilot legality.
Helmsman is now designed to build directly on the Pi runtime stack for agent
sessions, provider/model access, terminal UI primitives, resource loading,
session trees, and event streaming. Pi is the substrate, not the product
authority. External CLIs such as Codex and OpenCode are secondary execution
adapters. They do not own completion, route lock, or source-of-truth state.

## Current Authority

Treat these files as the current product SSOT:

- `docs/pi-direct-ultimate-product-design.md`
- `docs/pi-direct-design-closure-audit.md`
- `docs/pi-direct-data-contracts.md`
- `docs/core-event-reducer-board-contract.md`
- `docs/pi-runtime-foundation-contract.md`
- `docs/pi-role-runtime-contract.md`
- `docs/install-doctor-product-audit-contract.md`
- `docs/memory-research-contract.md`
- `docs/route-lock-amendment-contract.md`
- `docs/autopilot-loop-contract.md`
- `docs/verification-closeout-contract.md`
- `docs/question-ui-adapter-decision.md`
- `docs/product-north-star.md`
- `docs/native-core-tui-plan.md`
- `docs/tui-user-scenarios.md`
- `docs/implementation-route.md`
- `docs/reference-models.md`

The archived `docs/v0-plans/` material is reference evidence, not current
authority unless a current SSOT document explicitly promotes it.

`docs/current-execution.md` is a current-state reality check, not proof that a
runtime exists. Do not treat older executable command claims as current unless
the files and verification scripts exist in this worktree.

## Goalkeeper Continuity

This repo has an active Goalkeeper session:

```text
.goalkeeper/sessions/pi-direct-ultimate-product-design/checkpoint.md
```

On a new long-running goal turn, read that checkpoint before project reads,
edits, or progress messages. Update Goalkeeper after meaningful decisions,
verification, risks, or next actions change.

## Engineering Rules

- Implement real product behavior, not mock-only paths, unless the file is an
  explicit test or smoke harness.
- Keep Manifest as machine source of truth and Board as projection. Do not make
  Markdown, transcript text, or adapter output the authority.
- Keep `docs/pi-direct-design-closure-audit.md` as the design-level closure
  check: remaining gates are implementation proof, not permission to shrink the
  product scope.
- Keep the data contracts in `docs/pi-direct-data-contracts.md` binding when
  implementing events, reducers, Board projection, operation state, role
  runners, and question surfaces.
- Keep Core event append, reducer, Board projection, gate evaluation, replay,
  and recovery behavior aligned with `docs/core-event-reducer-board-contract.md`.
- Keep Core-authored Charting questions on the Helmsman Question UI Adapter
  path. Do not let a model-tool questionnaire become route authority.
- Keep Charting explicit. Normal chat must not force Charting.
- Keep memory and research aligned with `docs/memory-research-contract.md`:
  Aperture before memory scan, scoped memory before research, stale/missing/
  conflict judgments before lanes, and artifact-backed lane completion.
- Keep Autopilot Board-governed. Long loops must read the Board and preserve
  route authority. Implement loop selection, packet preparation, drift
  handling, repair, park, resume, and completion boundaries through
  `docs/autopilot-loop-contract.md`.
- Keep Route Lock and amendments aligned with
  `docs/route-lock-amendment-contract.md`; do not let role output, adapter
  output, or UI state change a locked route.
- Keep Pi role-runner and external adapter behavior bounded and visible through
  operation state, run review, diagnostics, and artifacts.
- Implement role runners, worker packet execution, concurrency, and Pi
  AgentSession evidence through `docs/pi-role-runtime-contract.md`.
- Keep verification and closeout aligned with
  `docs/verification-closeout-contract.md`: named scenario verdicts, accepted
  evidence, separate closeout events, and no final-message completion.
- Keep install, doctor, update, uninstall, product audit, and release evidence
  aligned with `docs/install-doctor-product-audit-contract.md`.
- Update docs and verification when product contracts move.
- Run focused verification for the changed surface. Run `npm run verify` before
  claiming a product-surface change is closed once this checkout has the
  package scripts to support it.

## Completion Standard

Completion means the requested product state is genuinely handled at user level:
the command surface, TUI, durable artifacts, adapter contracts, docs, and
verification evidence all agree. Passing tests are evidence only when they cover
the product requirement being claimed.
