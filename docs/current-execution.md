# Current Execution Surface

Status: current checkout reality check

This checkout is not currently a published release candidate. Gate 1 Pi
Runtime Foundation, Gate 2 Core Event System, Gate 3 Pi TUI Workbench shell,
Gate 4 Charting Form Authority, RoleRuntime foundation, Gate 5B
Memory/Research, Gate 6 Route Lock/Amendments, Gate 7 Board-Governed
Autopilot, Gate 8 Verification/Closeout, and Gate 9
Install/Doctor/Product Audit are implemented and verified.

Current contents prove the design direction plus Gate 1, Gate 2, Gate 3, Gate
4, the RoleRuntime foundation, Gate 5B Memory/Research, Gate 6 Route
Lock/Amendments, Gate 7 Board-Governed Autopilot, Gate 8
Verification/Closeout, and Gate 9 Install/Doctor/Product Audit:

- product docs under `docs/`
- imported Korean desktop README at `README.ko.md`
- reference checkouts under `references/`
- `package.json` with Node `>=22.19.0`, pinned Pi runtime dependencies, CLI
  bin metadata, and focused verification scripts
- `bin/helmsman.js` as the current CLI entrypoint
- `src/` runtime, CLI, Document Bus, operation-state, Core authority, event,
  redaction, Pi TUI Workbench, Core-owned Question UI Adapter, RoleRuntime,
  Gate 1 verification, Gate 2 verification, Gate 3 verification, Gate 4
  verification, RoleRuntime verification, Memory/Research verification,
  Route Lock verification, Autopilot verification, Verification/Closeout
  verification code, and Install/Doctor/Product Audit verification code
- `.helmsman/sessions/<run-id>/...` runtime evidence emitted by
  `pi-runtime probe`
- `.helmsman/sessions/<run-id>/manifest.events.jsonl`, `manifest.json`,
  `board.json`, rendered projections, and `core/*.json` diagnostics emitted by
  Core commands
- `.helmsman/sessions/<run-id>/evidence/native-question-surface.jsonl` and
  `rendered/questions/<bundle-id>.md` emitted by the Question UI Adapter
- `.helmsman/sessions/<run-id>/role-runs/<role-run-id>/...` plans, prompts,
  Pi event logs, transcripts, tool-event logs, artifacts ledgers, diagnostics,
  and sealed results emitted by RoleRuntime
- `.helmsman/sessions/<run-id>/memory/*.md`, `memory-index.md`,
  `research-index.md`, `worker-packets/*.json`, `worker-packets.md`, and
  `research/*.md` emitted by Gate 5B Memory/Research services
- `.helmsman/sessions/<run-id>/route-lock/proposal.json`,
  `route-lock/snapshot.json`, `route-lock/snapshot.md`,
  `route-lock/amendments/*.md`, `route-lock/amendments/*-snapshot.json`, and
  `evidence/route-lock-confirmation.jsonl` emitted by Gate 6 Route Lock and
  amendment services
- `.helmsman/sessions/<run-id>/autopilot/autopilot-index.md`,
  `autopilot/loops/<loop-id>/plan.json`,
  `autopilot/loops/<loop-id>/<packet-id>.json`, and
  `autopilot/loops/<loop-id>/artifacts/` emitted by Gate 7 Autopilot services
- `.helmsman/sessions/<run-id>/verification/verification-run-*/plan.json`,
  `verification/verification-run-*/*.md`, `verification/verification-index.md`,
  `closeout.md`, `evidence/index.md`, and
  `memory/promotion-candidates.md` emitted by Gate 8 Verification/Closeout
  services
- `.helmsman/install-manifest.json`, `.helmsman/config.json`,
  `.helmsman/role-registry.json`, `.helmsman/adapters/*/config.json`, and
  `.helmsman/product-audits/<audit-id>/...` emitted by Gate 9 lifecycle and
  product-audit commands
- `npm run verify` as the current Gate 1 + Gate 2 + Gate 3 + Gate 4 +
  RoleRuntime + Gate 5B + Gate 6 + Gate 7 + Gate 8 + Gate 9 verification
  command

Older command examples that claimed a full TUI, QA surface, Codex adapter,
OpenCode adapter, or product-complete release health are stale relative to this
worktree. Do not use them as evidence for unimplemented release surfaces. The
current TUI includes the Gate 3 Workbench shell, Gate 4 Question UI Adapter,
RoleRuntime state inspection, Memory/Research projection views, Route
Lock/amendment projection plus confirm/apply/reject surfaces, Gate 7 Autopilot
inspect/start/finish/recover surfaces, Gate 8 Verification/Closeout
inspect/start/result/finish/record surfaces, and Gate 9 `/qa-product`
product-audit routing.

## Current Binding Direction

The current design authority is:

```text
docs/pi-direct-ultimate-product-design.md
docs/pi-direct-design-closure-audit.md
docs/pi-direct-data-contracts.md
docs/core-event-reducer-board-contract.md
docs/pi-runtime-foundation-contract.md
docs/pi-role-runtime-contract.md
docs/install-doctor-product-audit-contract.md
docs/memory-research-contract.md
docs/route-lock-amendment-contract.md
docs/autopilot-loop-contract.md
docs/verification-closeout-contract.md
docs/question-ui-adapter-decision.md
docs/product-north-star.md
docs/native-core-tui-plan.md
docs/implementation-route.md
docs/tui-user-scenarios.md
docs/reference-models.md
```

## Current Runtime Baseline

The Pi-direct design requires the package/runtime baseline recorded in
`docs/pi-direct-ultimate-product-design.md`:

```text
@earendil-works/pi-coding-agent: 0.75.5
@earendil-works/pi-tui: 0.75.5
Node requirement: >=22.19.0
@juicesharp/rpiv-ask-user-question: 1.13.0
```

`package.json` should keep that Node floor until a newer selected Pi version
requires a different floor.

## Current Implemented Surface

Gate 1 from `docs/implementation-route.md`,
`docs/first-slice-work-order.md`, and
`docs/pi-runtime-foundation-contract.md` is implemented:

- read-only `doctor --json`
- read-only `pi-runtime doctor --json`
- `pi-runtime probe --mode persisted-session --json`
- `pi-runtime probe --mode timeout --json`
- `pi-runtime probe --mode live-provider --json`
- safe provider readiness reporting without secret capture
- Pi session import/runtime compatibility checks
- durable operation event capture without writing canonical Manifest/Board
  authority

Gate 2 from `docs/core-event-reducer-board-contract.md` is implemented:

- `core create`, `core resume`, `core replay`, and typed `core command`
- append-only `manifest.events.jsonl` authority log under `session.lock`
- typed command registry for the required Core command surface
- deterministic Manifest reducer and Board projector
- atomic projection writes for `manifest.json`, `board.json`, generated
  Markdown, ledgers, scorecard, and Core diagnostics
- stable Core error codes for sequence, actor, stale Board, illegal stage,
  immutable route, gate, projection, and secret failures
- replay/recovery for stale projections
- focused `npm run verify:core`

Do not claim any of the following until the corresponding files and focused
verification exist in this checkout:

- external adapter execution
- published release health
- live product-audit release readiness without `--live` evidence

The RoleRuntime foundation from `docs/pi-role-runtime-contract.md` is
implemented:

- `role.binding_set`, `role.run_plan`, `role.run_start`, and
  `role.run_finish` Core commands and events
- live Pi provider/model binding through the installed Pi settings
- bounded `RoleRunPlan` and prompt generation from Manifest and Board state
- Pi AgentSession execution with event stream, transcript, tool-event,
  diagnostics, artifact ledger, and sealed result files
- role-run evidence records in the Manifest
- final model messages remaining evidence only, with no artifact acceptance or
  route movement
- focused `npm run verify:role-runtime`

Gate 5B Memory/Research from `docs/memory-research-contract.md` is
implemented:

- Aperture-scoped memory scans through `helmsman memory-research scan`
- Core `memory.scan_created` and `memory.candidate_classified` events
- reused, stale, irrelevant, missing, and conflict classifications
- stale/missing/conflict judgments becoming typed research lanes
- Core `research.lane_declared`, `research.worker_packet_created`,
  `research.artifact_submitted`, `research.artifact_rejected`,
  `research.artifact_accepted`, and `research.synthesis_recorded` events
- worker packet generation with allowed write scope, required artifact path,
  done criteria, forbidden authority claims, and parallel cap accounting
- research index and worker packet ledgers
- artifact validation rejecting missing, placeholder, uncited, path-mismatched,
  or observation/inference-collapsed artifacts
- accepted artifacts updating Board/scorecard only through Core events
- synthesis outcomes that can move the run to `lock_ready` without locking the
  route
- TUI `/memory` and `/research` projection views
- focused `npm run verify:memory-research`

Gate 6 Route Lock/Amendments from
`docs/route-lock-amendment-contract.md` is implemented:

- Route Lock readiness evaluation with hard blockers for open questions,
  missing question-surface evidence, missing route effects, missing scoped
  memory scan, unresolved research lanes, missing accepted artifacts, missing
  verification scenarios, stale Board reads, and hard gates
- deterministic canonical route snapshots and snapshot hashes under
  `route-lock/`
- Core `route_lock.proposed`, `route_lock.locked`,
  `route_lock.cancelled`, `route_lock.unlocked`, and
  `route_lock.invalidated` events
- user-only initial Route Lock confirmation with visible snapshot hash
  evidence in `evidence/route-lock-confirmation.jsonl`
- typed amendment proposal, application, and rejection events
- post-lock route-changing event rejection outside the amendment path
- amendment rules for autonomy boundary changes and verification scenario
  removal requiring user confirmation
- Board blockers/forbidden actions for invalidated routes and pending
  amendments
- CLI `helmsman route-lock ...` command surface
- TUI `/lock` and `/amend` surfaces for proposal, confirmation, unlock, apply,
  and reject actions
- focused `npm run verify:route-lock`

Gate 7 Board-Governed Autopilot from `docs/autopilot-loop-contract.md` is
implemented:

- Autopilot precondition evaluation requires a locked route, locked snapshot
  path/hash, Board `run_autopilot_loop`, no pending amendments, no hard
  Autopilot blockers, no active duplicate loop, and no write-root conflicts
- Core `autopilot.action_selected`, `autopilot.packet_prepared`,
  `autopilot.loop_started`, `autopilot.route_adherence_evaluated`,
  `autopilot.drift_recorded`, `autopilot.loop_finished`, and
  `autopilot.loop_recovered` events
- durable `AutopilotLoopPlan`, packet files, and `autopilot-index.md`
- reducer validation for locked snapshot hashes, Board revisions,
  idempotency, write-root conflicts, route-adherence status, drift response,
  final-message non-authority, and recovery without duplicate launch
- Board projection for Autopilot loops, packets, drift warnings, blockers,
  forbidden actions, and gates
- CLI `helmsman autopilot evaluate|start|finish|recover|dispatch`
- TUI `/autopilot` inspect/start/finish/recover surface
- focused `npm run verify:autopilot`

Gate 8 Verification/Closeout from `docs/verification-closeout-contract.md` is
implemented:

- Core `verification.run_started`, `verification.result_recorded`,
  `verification.run_finished`, and `closeout.recorded` authority events
- durable verification run plans under `verification/`
- scenario contracts derived from locked route scenarios
- expected verdict artifacts and accepted verification artifact records
- pass/fail/blocked/parked verdict validation with retry attempt history
- Board verification matrix and closeout readiness projection
- closeout artifacts at `closeout.md`, evidence index at `evidence/index.md`,
  and optional `memory/promotion-candidates.md`
- CLI `helmsman verification evaluate|start|result|finish`
- CLI `helmsman closeout record`
- TUI `/verify` and `/closeout` surfaces
- focused `npm run verify:verification-closeout`

Gate 9 Install/Doctor/Product Audit from
`docs/install-doctor-product-audit-contract.md` is implemented:

- CLI `helmsman install --scope <project|user> [--dry-run]`
- CLI `helmsman init`, `helmsman update`, `helmsman uninstall`,
  `helmsman product-audit`, and `helmsman verify`
- read-only `helmsman.doctor.v1` reports with package, runtime, provider,
  install-manifest, managed-file drift, user config root, and product-surface
  evidence
- install manifests with managed-file hashes and user-owned conflict reporting
- approval-gated update with managed-file backup pointers and post-update
  doctor
- uninstall dry-run/approval behavior that removes only hash-matching managed
  files, preserves drifted/user-owned files, and writes an uninstall report
- product-audit artifacts under `.helmsman/product-audits/<audit-id>/`
  including audit plan, requirements matrix, evidence index, command log,
  install state, live-provider status, no-mock audit, and report
- actual `npm pack` plus isolated `npm install` smoke that runs the installed
  binary's doctor/install/update dry-run/uninstall dry-run
- TUI `/qa-product` route that writes product-audit evidence without mutating
  Manifest/Board authority
- focused `npm run verify:product-audit`

## Next Executable Surface To Build

The next real implementation step is release hardening: run and preserve the
full release gate evidence, including live `helmsman product-audit --json
--live` when credentials are available, then resolve any release-only blockers
without weakening the Gate 1-9 contracts.

## Verification Status

The current verification surface proves Gate 1, Gate 2, Gate 3, Gate 4,
RoleRuntime foundation, Gate 5B Memory/Research, Gate 6 Route Lock/Amendments,
Gate 7 Board-Governed Autopilot, Gate 8 Verification/Closeout, and Gate 9
Install/Doctor/Product Audit:

```text
npm run typecheck
npm run verify
npm run verify:core
npm run verify:tui
npm run verify:question-ui
npm run verify:role-runtime
npm run verify:memory-research
npm run verify:route-lock
npm run verify:autopilot
npm run verify:verification-closeout
npm run verify:product-audit
npm run verify:pi-runtime:live
```

Release-candidate verification additionally requires the ordered release gate
from `docs/install-doctor-product-audit-contract.md`, including installed
package smoke and live product-audit proof when release credentials are
available.
