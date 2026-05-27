# Helmsman Docs

This directory is the product SSOT for the Helmsman reboot.

The current product direction is:

```text
Helmsman is a native terminal workbench for route-governed autonomy.
The Helmsman Core owns protocol state, Charting, Manifest, Board, gates,
and Autopilot legality. Pi is the direct runtime/TUI/session substrate.
External coding-agent CLIs are optional secondary execution adapters.
```

The previous OMP plugin-first and Codex-first adapter directions are
superseded. OMP, Codex, OpenCode, and Claude Code remain important references or
execution adapters, but none of them is the product boundary.

The previous Electron desktop workbench lives at:

```text
/Users/moonsunkim/Documents/deltafleet/projects/helmsman-desktop
```

Treat that checkout as an implementation donor for protocol, kernel,
document-bus, adapter, and UI ideas. Do not treat its Electron app as the
current product surface unless a later SSOT document explicitly reintroduces it.

## Current Documents

- `pi-direct-ultimate-product-design.md`: binding Pi-direct architecture and ultimate product design.
- `pi-direct-design-closure-audit.md`: design-level closure audit proving the Pi-direct route preserves the full product scope and separating implementation proof from product-contract closure.
- `pi-direct-data-contracts.md`: binding Manifest, event, Board, operation, role-runner, and Question UI Adapter data contracts.
- `core-event-reducer-board-contract.md`: binding contract for event append transactions, deterministic reducers, Board projection, gate evaluation, replay, and recovery.
- `pi-runtime-foundation-contract.md`: binding Gate 1 runtime implementation, command, evidence, security, and verification contract.
- `pi-role-runtime-contract.md`: binding contract for role bindings, worker packet mapping, Pi AgentSession execution, concurrency, and role-run evidence.
- `install-doctor-product-audit-contract.md`: binding contract for package install, read-only doctor, update authority, no-mock product audit, and release evidence.
- `memory-research-contract.md`: binding contract for Aperture-scoped memory scan, research lane contracts, parallel RoleRuntime dispatch, artifact validation, synthesis, and Board projection.
- `route-lock-amendment-contract.md`: binding contract for lock readiness, user-confirmed route snapshots, amendments, unlock, invalidation, and Autopilot preconditions.
- `autopilot-loop-contract.md`: binding contract for Board-read Autopilot action selection, packets, drift handling, repair/audit loops, park/stop/ask/amend decisions, and resume.
- `verification-closeout-contract.md`: binding contract for scenario verification, verifier artifacts, verdict events, closeout artifacts, and Wiki Memory promotion candidates.
- `question-ui-adapter-decision.md`: binding decision for Core-owned question rendering and the `rpiv-ask-user-question` wrapper/vendor boundary.
- `product-north-star.md`: current product boundary and non-negotiable direction.
- `native-core-tui-plan.md`: architecture plan for the Pi-backed native TUI, Core, document bus, role runner, and adapters.
- `implementation-route.md`: current Pi-direct proof route, Manifest/Board contract, reducer contract, and gate order.
- `first-slice-work-order.md`: current Gate 1 work order for Pi runtime foundation.
- `tui-user-scenarios.md`: current native Helmsman TUI user scenario.
- `reference-models.md`: reference systems and what Helmsman should borrow or avoid.
- `current-execution.md`: current checkout reality check. It records Gate 1,
  Gate 2, Gate 3, Gate 4, RoleRuntime foundation, Gate 5B, Gate 6, Gate 7, and
  Gate 8 implementation proof, plus the later product surfaces that remain
  unimplemented.
- `v0-plans/`: archived OMP plugin-first study. Useful as evidence, not current authority.

## Product Decision Snapshot

- Native Helmsman TUI is the primary user surface.
- Helmsman Core is the workflow authority. The TUI sends commands; Core evaluates legality and writes events.
- Pi is the direct runtime substrate for agent sessions, provider/model access, TUI primitives, session persistence, settings, resources, and event streaming.
- External CLIs such as Codex, OMP, OpenCode, and Claude Code are secondary adapters.
- Normal chat starts without forcing Charting. Charting is entered explicitly through `/charting`.
- Use `charting`, not `chart`, as the user-facing mode name.
- Charting is repeated and question-first. It asks many intent questions across many bundles.
- One question bundle has at most 4 questions, but a Charting session can have many bundles and many waves.
- Charting questions are Core-authored. Third-party or model-tool
  questionnaire UI can help only through a Helmsman authority wrapper.
- Research lanes run in parallel through declared adapters and subagents.
- Every research lane writes an artifact under `.helmsman/sessions/<id>/research/`.
- Memory scan and research lane behavior are specified by
  `memory-research-contract.md`; research is artifact-backed Charting work, not
  a chat-only completion claim.
- The machine Manifest is the source of truth; Markdown is a generated human view.
- The Board is the live situation surface Autopilot reads before every loop.
- Manifest events, Board projection, operation state, and question surfaces are
  specified by `pi-direct-data-contracts.md`.
- Event append, reducer, Board projection, gate evaluation, replay, and recovery
  semantics are specified by `core-event-reducer-board-contract.md`.
- Purpose-specific provider, model, thinking level, and fast/deep mode settings are first-class.
- Purpose-specific roles execute through the Core-owned role runtime contract;
  Pi AgentSession transcripts and final messages are evidence, not authority.
- Route Lock is a user-confirmed Core event over a canonical route snapshot;
  post-lock changes require amendment, unlock, invalidation, or parking.
- Autopilot is a Core-owned Board-read loop. It must select only the Board's
  next legal action, execute bounded packets, evaluate route adherence, and
  continue, repair, ask, amend, park, verify, or stop through typed events.
- Verification and closeout are scenario-backed Core phases. Green tests,
  command exits, model prose, and TUI state are not completion without Core
  verdict and closeout events.
- The implementation path is described through proof gates, not MVP scope reduction.
- `pi-direct-design-closure-audit.md` records that the design contract is closed
  at product level while implementation proof remains pending.
- Gate 1 Pi Runtime Foundation is implemented and verified: import/runtime
  compatibility, session execution, settings/resource loading, event capture,
  abort/timeout, durable operation evidence, safe provider readiness, and
  focused verification.
- Gate 2 Core Event System is implemented and verified: typed Core commands,
  append-only Manifest events, deterministic reducer replay, Board projection,
  gate evaluation, route-lock immutability, artifact acceptance separation,
  stale projection recovery, and secret rejection.
- Gate 3 Pi TUI Workbench shell is implemented and verified: normal chat
  remains outside Charting, Board/Manifest/operation/evidence/role/provider
  surfaces render from Core state, Workbench commands submit through Core, and
  unsupported future-gate commands remain explicit blockers.
- Gate 4 Charting Form Authority is implemented and verified: `/charting`
  renders a Core-authored question bundle, surface evidence records stable ids
  and bundle hashes, `/answer` maps visible choices to stable option ids, and
  Core applies route effects through Manifest events.
- RoleRuntime foundation is implemented and verified: live Pi provider/model
  bindings produce bounded `RoleRunPlan` files, Pi AgentSession event streams,
  transcripts, tool-event logs, diagnostics, sealed results, Core role-run
  events, and evidence records while final model prose remains non-authority.
- Gate 5B Memory/Research is implemented and verified: Aperture-scoped memory
  scans classify reused/stale/irrelevant/missing/conflict candidates, Core
  declares research lanes, worker packets define allowed writes and forbidden
  authority claims, artifact validation rejects missing/placeholder/uncited or
  observation-inference-collapsed artifacts, accepted artifacts move Board and
  scorecard only through Core events, and synthesis can advance to lock-ready
  without locking the route.
- Gate 6 Route Lock/Amendments is implemented and verified: readiness blocks
  unresolved questions, missing surfaces, unresolved research, missing accepted
  artifacts, missing scenarios, stale Board reads, and hard gates;
  deterministic snapshots and hashes render under `route-lock/`; user
  confirmation records visible hash evidence; post-lock route changes require
  typed amendment, unlock, or invalidation; and Board/TUI/CLI projection
  surfaces reflect the locked route state.
- Gate 7 Board-Governed Autopilot is implemented and verified: Autopilot reads
  the current Board action before launch, writes durable loop plans and packets,
  records typed action/packet/start/adherence/drift/finish/recovery events,
  rejects stale Board reads, missing locked snapshot hashes, conflicting write
  roots, duplicate in-flight loops, and final-prose completion claims, and
  exposes CLI/TUI inspect/start/finish/recover/dispatch surfaces while keeping
  RoleRuntime and adapter output as evidence only.
- Gate 8 Verification/Closeout is implemented and verified: Core writes
  scenario-backed verification run plans, records pass/fail/blocked/parked
  verdict artifacts with retry attempt history, projects the Board verification
  matrix, rejects successful closeout while scenarios are unresolved or failed,
  writes closeout/evidence/memory-promotion artifacts, and exposes
  `helmsman verification ...`, `helmsman closeout record`, `/verify`, and
  `/closeout` surfaces.
- Gate 9 Install/Doctor/Product Audit is implemented and verified: lifecycle
  commands write managed install manifests, doctor is read-only, update and
  uninstall are approval-gated, product audit writes requirement-to-evidence
  artifacts, package smoke uses `npm pack` plus an isolated installed binary,
  and `/qa-product` routes audit evidence through the TUI without making it
  Manifest/Board authority.
- Release health still requires the ordered release gate and live product-audit
  evidence when credentials are available.
- `helmsman-desktop` donor policy: keep its protocol meanings where proven, but expose the new product through Manifest and Board language.
- The current checkout contains Gate 1, Gate 2, Gate 3, Gate 4, RoleRuntime
  foundation, Gate 5B Memory/Research, Gate 6 Route Lock/Amendments, and Gate
  7 Board-Governed Autopilot, Gate 8 Verification/Closeout, and Gate 9
  Install/Doctor/Product Audit `src` and `bin` code. Release hardening remains
  unclaimed until the release gate evidence exists.
