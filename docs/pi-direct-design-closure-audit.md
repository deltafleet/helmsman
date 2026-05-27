# Pi-Direct Design Closure Audit

Status: current design-closure audit; not implementation proof

## Purpose

This audit answers one question: does the current Pi-direct design preserve the
ultimate Helmsman product scope, or did the pivot to Pi silently reduce the
product into a demo, prompt pack, thin chat wrapper, desktop revival, or
mock-only plan?

Verdict: the design-level product contract is closed enough to begin Gate 1
implementation without scope reduction. The product is not implemented in this
checkout. Completion still requires the proof gates in `implementation-route.md`
and the focused verification named by each contract.

This document does not make new architecture. It maps the existing authority
documents to the full product requirements and records the boundaries that
future implementation must not cross.

## Inputs Audited

- User objective: design the full Pi-based ultimate Helmsman product without
  MVP/demo scope reduction, mocks, stubs, or hardcoded substitute behavior.
- `AGENTS.md`: project guardrail for preserving user intent, scope, and quality
  bar.
- `docs/product-north-star.md`: product boundary and non-negotiable behavior.
- `docs/pi-direct-ultimate-product-design.md`: Pi-direct architecture and gate
  sequence.
- `docs/pi-direct-data-contracts.md`: durable data, event, Board, operation,
  role-runner, and Question UI Adapter contracts.
- `docs/core-event-reducer-board-contract.md`: Core authority, append,
  reducer, Board, gate, replay, recovery, and error-code contract.
- `docs/pi-runtime-foundation-contract.md`: Gate 1 Pi runtime foundation.
- `docs/pi-role-runtime-contract.md`: role execution over Pi AgentSession.
- `docs/memory-research-contract.md`: Aperture-scoped memory and artifact
  backed parallel research.
- `docs/question-ui-adapter-decision.md`: Core-owned question rendering and
  `rpiv-ask-user-question` boundary.
- `docs/route-lock-amendment-contract.md`: Route Lock, amendments, unlock, and
  invalidation.
- `docs/autopilot-loop-contract.md`: Board-governed Autopilot loop.
- `docs/verification-closeout-contract.md`: scenario-backed verification and
  closeout.
- `docs/install-doctor-product-audit-contract.md`: install, doctor, update,
  uninstall, no-mock product audit, and release evidence.
- `docs/native-core-tui-plan.md`, `docs/tui-user-scenarios.md`,
  `docs/reference-models.md`, and `docs/current-execution.md`.

## Closure Decision

Design closure is accepted at the product-contract level.

The Pi-direct route is valid only because the design preserves these authority
rules:

- Pi is implementation substrate, not route authority.
- Helmsman Core owns Charting, Manifest, Board, gates, Route Lock, amendments,
  Autopilot legality, verification, and closeout.
- Manifest is the machine source of truth.
- Board is the live projection Autopilot reads before acting.
- Pi sessions, Pi TUI state, third-party question packages, chat transcript,
  role output, and external adapter output are evidence only.
- User route authority is represented by Core events, not by model prose.
- Completion is represented by verifier verdict and closeout events, not by
  green command exits, final chat text, or a TUI label.

The remaining work is implementation and proof, not permission to shrink the
target product.

## Requirement Matrix

| ID | Requirement | Binding design evidence | Design status | Implementation proof status | Non-acceptance guardrail |
| --- | --- | --- | --- | --- | --- |
| DC-001 | Preserve the full ultimate product scope without MVP, demo, mock, or hardcoded downgrade. | `AGENTS.md`, `product-north-star.md`, `pi-direct-ultimate-product-design.md`, this audit | Closed | Not implemented | A partial CLI, prompt pack, smoke proof, or fake provider path cannot be called Helmsman product completion. |
| DC-002 | Build directly on Pi while keeping Helmsman Core as product authority. | `pi-direct-ultimate-product-design.md`, `pi-runtime-foundation-contract.md`, `implementation-route.md` | Closed | Gate 1 implemented | Pi session history, Pi TUI state, or Pi event streams cannot become Manifest or Board authority. |
| DC-003 | Maintain Manifest as source of truth and Board as rebuildable Autopilot projection. | `pi-direct-data-contracts.md`, `core-event-reducer-board-contract.md` | Closed | Gate 2 implemented | Markdown, transcript text, adapter output, or UI-only state cannot be source of truth. |
| DC-004 | Keep normal chat available and Charting explicit. | `product-north-star.md`, `native-core-tui-plan.md`, `tui-user-scenarios.md` | Closed | Gate 3 Workbench shell implemented | Normal chat must not silently force Charting or route decisions. |
| DC-005 | Preserve Charting as repeated question-first route compilation. | `product-north-star.md`, `pi-direct-data-contracts.md`, `question-ui-adapter-decision.md`, `tui-user-scenarios.md` | Closed | Gate 4 implemented | A one-question prompt, summarized recommendation, or lead-only route choice cannot replace bundles, route effects, and user evidence. |
| DC-006 | Use a Core-owned Question UI Adapter; treat `rpiv-ask-user-question` as UX reference or optional wrapped/vendor implementation only. | `question-ui-adapter-decision.md`, `pi-direct-data-contracts.md`, `reference-models.md` | Closed | Gate 4 implemented | Third-party package tool results cannot become route authority unless Core validates stable ids, bundle hashes, route effects, evidence, and command legality. |
| DC-007 | Preserve Aperture-before-memory and artifact-backed parallel research. | `memory-research-contract.md`, `product-north-star.md`, `native-core-tui-plan.md` | Closed | Gate 5B implemented | Research cannot be ephemeral chat, a single unindexed lead answer, or unvalidated model prose. |
| DC-008 | Execute purpose-specific roles through bounded Pi AgentSession plans. | `pi-role-runtime-contract.md`, `pi-direct-data-contracts.md` | Closed | RoleRuntime foundation implemented | Role final messages cannot mutate Manifest, satisfy gates, or complete work without accepted artifacts and Core events. |
| DC-009 | Keep external CLIs as secondary adapters. | `reference-models.md`, `pi-role-runtime-contract.md`, `autopilot-loop-contract.md` | Closed | Adapter implementation pending | Codex, OpenCode, OMP, Claude Code, or any future host cannot own completion, lock state, or Board reads. |
| DC-010 | Require user-confirmed Route Lock over a canonical route snapshot before Autopilot execution. | `route-lock-amendment-contract.md`, `core-event-reducer-board-contract.md`, `pi-direct-data-contracts.md` | Closed | Gate 6 implemented | A recommendation, UI highlight, model statement, or unconfirmed route card cannot lock the route. |
| DC-011 | Require typed amendments, unlock, invalidation, or park for post-lock route changes. | `route-lock-amendment-contract.md`, `autopilot-loop-contract.md` | Closed | Gate 6 and Gate 7 implemented | Autopilot cannot improvise around changed scope or silently continue against a stale route. |
| DC-012 | Run Autopilot as a Board-governed loop with bounded packets and drift response. | `autopilot-loop-contract.md`, `pi-direct-data-contracts.md`, `native-core-tui-plan.md` | Closed | Gate 7 implemented | A long prompt, self-continuing transcript, or agent assertion cannot count as Autopilot. |
| DC-013 | Close work only through scenario-backed verification and closeout events. | `verification-closeout-contract.md`, `install-doctor-product-audit-contract.md`, `pi-direct-data-contracts.md` | Closed | Gate 8 implemented | Green tests, command exits, final prose, or TUI labels are insufficient without Core verdict and closeout artifacts. |
| DC-014 | Require installed-state doctor, update authority, uninstall, package smoke, no-mock product audit, and release evidence. | `install-doctor-product-audit-contract.md` | Closed | Gate 9 implemented | Repo-only checks, generated files, or package metadata cannot prove installed product readiness. |
| DC-015 | Preserve a native terminal workbench user surface instead of reviving Electron desktop as the default. | `native-core-tui-plan.md`, `tui-user-scenarios.md`, `docs/README.md` | Closed | Gate 3-9 TUI command surfaces implemented; release hardening remains | `helmsman-desktop` can donate semantics, but its Electron shell is not the current product surface. |
| DC-016 | Keep proof order explicit and non-MVP. | `implementation-route.md`, `first-slice-work-order.md`, `current-execution.md` | Closed | Gate 1-9 implemented; release gate evidence remains | Incremental gates cannot be used to narrow the end state or claim product completion early. |

## End-State Product Shape

The accepted end-state design is:

```text
Pi runtime foundation
-> Helmsman Core event append/reducer/gates
-> Manifest source of truth
-> Board live projection
-> native Pi TUI workbench
-> Core-owned Question UI Adapter
-> RoleRuntime over Pi AgentSession
-> Aperture-scoped memory and parallel research
-> optional bounded external adapters
-> user-confirmed Route Lock
-> Board-governed Autopilot
-> scenario-backed verification and closeout
-> install/doctor/update/uninstall/product audit/release evidence
```

This is one product. The gates are proof order, not separate reduced products.

## Current Checkout Reality

The design is closed at the contract level. Gate 1 Pi Runtime Foundation, Gate
2 Core Event System, Gate 3 Pi TUI Workbench shell, Gate 4 Charting Form
Authority, RoleRuntime foundation, Gate 5B Memory/Research, and Gate 6 Route
Lock/Amendments, Gate 7 Board-Governed Autopilot, and Gate 8
Verification/Closeout are implemented and verified in this checkout:

- real `bin/helmsman.js`
- real `src/` runtime, CLI, Pi TUI Workbench, Document Bus, event,
  operation-state, redaction, Pi session, capability report, RoleRuntime,
  Memory/Research, Route Lock/Amendment, Autopilot, Verification/Closeout, and
  focused verification code
- pinned `@earendil-works/*` Pi runtime dependencies
- Core command registry, append-only `manifest.events.jsonl`, deterministic
  Manifest reducer, Board projector, gate evaluator, replay/recovery
  diagnostics, and rendered projections
- focused verification scripts for typecheck, Gate 1 runtime proof, Gate 2 Core
  proof, Gate 3 TUI Workbench proof, Gate 4 Question UI proof, RoleRuntime
  proof, Gate 5B Memory/Research proof, Gate 6 Route Lock/Amendment proof,
  Gate 7 Autopilot proof, Gate 8 Verification/Closeout proof, and
  live-provider proof

The implementation gates are now present through Gate 9. Publication readiness
is still a separate claim and remains false until release-gate evidence is
current, preserved, and tied to the release being published.

## Implementation Gates Required After This Audit

1. Gate 1: Pi Runtime Foundation from `pi-runtime-foundation-contract.md` is
   implemented and verified.
2. Gate 2: Core event append, reducer, Board projector, gate evaluator, replay,
   recovery, and error codes from `core-event-reducer-board-contract.md` are
   implemented and verified.
3. Gate 3: Pi TUI Workbench shell from `native-core-tui-plan.md` and
   `implementation-route.md` is implemented and verified.
4. Gate 4: Core-owned Question UI Adapter from
   `question-ui-adapter-decision.md` is implemented and verified.
5. Gate 5A: RoleRuntime foundation from `pi-role-runtime-contract.md` is
   implemented and verified.
6. Gate 5B: memory scan, research lanes, worker packets, artifact validation,
   synthesis, and Board projection from `memory-research-contract.md` are
   implemented and verified.
7. Gate 6: Route Lock, amendments, unlock, and invalidation from
   `route-lock-amendment-contract.md` are implemented and verified.
8. Gate 7: Board-governed Autopilot from `autopilot-loop-contract.md` is
   implemented and verified.
9. Gate 8: verification and closeout from
   `verification-closeout-contract.md` are implemented and verified.
10. Gate 9: install, doctor, update, uninstall, product audit, package smoke,
   and release evidence from `install-doctor-product-audit-contract.md` are
   implemented and verified for the current command surface. Release hardening
   still has to preserve full gate evidence before publication.

## Forbidden Substitutions

Future work fails this audit if it:

- treats Pi transcript, role final prose, adapter output, or TUI state as route
  authority
- uses mock providers, fake artifacts, hardcoded package surfaces, or
  hand-authored success rows as product proof
- collapses Charting into one prompt or one route recommendation without full
  option/evidence/route-effect capture
- starts Autopilot before Route Lock and Board preconditions are true
- lets Autopilot continue after scope drift without amendment, unlock,
  invalidation, park, or user confirmation
- accepts research, implementation, audit, verification, or closeout from chat
  text alone
- reports release health without installed-state doctor and product audit
  evidence
- treats this audit as runtime verification

## Final Audit Result

The Pi-direct design is closed at the architecture and product-contract level.
It keeps the ultimate product intact and gives a deterministic implementation
route.

The product implementation gates are now present through Gate 9. The next valid
step is release hardening and evidence preservation without reducing the
end-state scope or treating non-live product-audit output as release proof.
