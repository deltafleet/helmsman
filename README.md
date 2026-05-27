# Helmsman

Native terminal workbench for route-governed coding-agent autonomy.

Helmsman Core owns Charting, Manifest, Board, gates, Autopilot legality,
verification, and closeout. Pi is the direct runtime substrate for agent
sessions, provider/model access, terminal UI primitives, settings/resources,
and event streaming. External coding-agent CLIs such as Codex and OpenCode are
secondary execution adapters.

Current binding design:

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
- `docs/implementation-route.md`

Current checkout reality: Gate 1 Pi Runtime Foundation, Gate 2 Core Event
System, Gate 3 Pi TUI Workbench shell, Gate 4 Charting Form Authority, the
RoleRuntime foundation, Gate 5B Memory/Research, Gate 6 Route
Lock/Amendments, Gate 7 Board-Governed Autopilot, Gate 8
Verification/Closeout, and Gate 9 Install/Doctor/Product Audit are implemented
and verified in this worktree.
The repo now has a real
`bin/helmsman.js`, Pi runtime foundation, Manifest event log, deterministic
Manifest reducer, Board projector, Core command registry, replay/recovery
diagnostics, a Pi TUI Workbench that renders Board/Manifest/operation/evidence/
role/provider/memory/research/route-lock state while submitting commands
through Core, and a Core-owned Question UI Adapter that renders Charting
bundles with stable ids, bundle hashes, route effects, surface evidence, and
answer mapping. RoleRuntime now resolves real Pi live-provider bindings, writes role-run
plans/prompts/events/transcripts/diagnostics/results, and records Core role-run
events without giving model prose route authority. Gate 5B now records scoped
memory scans, research lanes, worker packets, artifact validation, synthesis,
and research projection through Core. Gate 6 now records readiness, route-lock
snapshots, user confirmation evidence, amendments, invalidation, unlock, and
Route Lock Board projection through Core. Gate 7 now records Board-read
Autopilot action selection, loop plans, bounded packets, route-adherence
evaluation, drift response, park/recover state, CLI/TUI surfaces, and focused
verification through Core. Gate 8 now records scenario-backed verification
plans, scenario verdict artifacts, retry attempt history, Board verification
matrix state, closeout artifacts, evidence indexes, memory promotion candidates,
and CLI/TUI verification/closeout surfaces through Core. Gate 9 now adds real
install/init/update/uninstall/product-audit/verify commands, read-only
`helmsman.doctor.v1` reports, install manifests with managed-file hashes,
approval-gated update/uninstall safety, actual `npm pack` plus isolated
installed-binary smoke, no-mock audit records, requirement-to-evidence product
audit artifacts, and `/qa-product` TUI routing. Release readiness still must be
proved by the release gate, including live product-audit evidence when release
credentials are available.
