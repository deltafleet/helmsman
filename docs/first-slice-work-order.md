# Pi Runtime Foundation Work Order

Status: Gate 1 implemented and verified

This file replaces the older Core-first/Codex-first first-slice handoff. The
current direction is Pi-direct: prove Helmsman can build on Pi without ceding
route authority.

The binding detailed contract for this gate is:

```text
docs/pi-runtime-foundation-contract.md
```

## Goal

Implement the first real product gate:

```text
Pi package/runtime baseline
+ Helmsman runtime import boundary
+ Pi AgentSession proof
+ settings/resource loader proof
+ event capture evidence
+ abort/timeout/interrupted operation state
+ provider/model readiness reporting without secret capture
```

This is not a demo. It is the foundation for the full product's role runner,
question UI, research lanes, Autopilot loops, and verification.

## Implementation Status

Gate 1 is implemented in this worktree with:

- pinned Pi runtime dependencies in `package.json`
- `bin/helmsman.js`
- runtime, CLI, Document Bus, operation-state, event, redaction, Pi session,
  capability-report, and verification code under `src/`
- read-only doctor commands
- persisted, timeout, and live-provider probe modes
- durable evidence under `.helmsman/sessions/<run-id>/...`
- Board projection that intentionally keeps route phase at `not_started`

Verified commands:

```text
npm run typecheck
npm run verify
npm run verify:pi-runtime:live
```

## Required Product Evidence

- `package.json` uses the Node floor required by the selected Pi version.
- Runtime code imports the chosen Pi SDK packages from the real package surface.
- A Helmsman operation can create a Pi agent session in a real workspace.
- Operation events are written to the Document Bus.
- Operation status distinguishes completed, failed, timed out, aborted, and
  interrupted.
- Provider/model readiness is reported as safe metadata only.
- No provider token, OAuth refresh token, API key, or raw debug secret is stored
  under `.helmsman`.
- Unit tests may use fake providers only when named as unit/contract tests.
  Live-provider claims require live-provider evidence.

## Out Of Gate

- full Charting loop
- full Question UI Adapter implementation
- route locking
- broad Autopilot
- external Codex/OpenCode/OMP/Claude execution
- package release

These are out of Gate 1, not out of product. The gate exists so later product
behavior runs on a proven runtime substrate.

The later Question UI implementation must follow
`docs/question-ui-adapter-decision.md`.
The later role-runner implementation must follow
`docs/pi-role-runtime-contract.md`.
The later Memory and Research implementation must follow
`docs/memory-research-contract.md`.
The later install, update, uninstall, product-audit, and release evidence
surface must follow `docs/install-doctor-product-audit-contract.md`.
The later Core event reducer and Board projector implementation must follow
`docs/core-event-reducer-board-contract.md`.
The later Route Lock, amendment, unlock, and invalidation implementation must
follow `docs/route-lock-amendment-contract.md`.
The later Board-governed Autopilot implementation must follow
`docs/autopilot-loop-contract.md`.
The later Verification and Closeout implementation must follow
`docs/verification-closeout-contract.md`.

## Acceptance

Gate 1 is accepted only when:

- runtime code exists in this worktree
- a focused verification command exists and passes
- the Document Bus records operation evidence
- failures and timeouts are inspectable after process exit
- docs, package metadata, and verification commands agree
- no mock-only or hardcoded provider path is presented as product completion
- `docs/pi-runtime-foundation-contract.md` acceptance and non-acceptance cases
  are satisfied
