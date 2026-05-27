# Product North Star

Status: current product SSOT

## One-Line Positioning

```text
Helmsman is a native terminal workbench for route-governed autonomy.
It turns rough user intent into a compiled Manifest, then runs Autopilot
against a live Board without letting host agents drift from the route.
```

Helmsman is the product surface and protocol authority. Pi is the direct
runtime substrate for sessions, provider/model access, terminal UI primitives,
resources, and event streaming. External coding-agent CLIs are optional
secondary execution adapters.

## Why Helmsman Should Exist

Most coding agents are good at the next turn. They are weaker at preserving a large user intent across long-running autonomy.

Helmsman exists because Autopilot can only be trusted when Charting has produced a strong enough contract. That contract is built mostly by asking the user the right questions, then letting agents fill in implementation detail through research, synthesis, and audit.

## Core Product Advantages

### 1. Question-First Charting

Charting is explicitly entered inside Helmsman:

```text
/charting
```

Charting is not one question and one research pass. It repeats:

```text
ask -> answer -> research -> synthesize -> ask better questions -> update Manifest
```

The system should ask as many questions as needed to understand intent. One bundle has at most 4 questions, but a session can have many bundles and many waves.

Questions must be easy to answer. Helmsman should translate complex product and
architecture choices into plain user-facing options without hiding the real
tradeoffs. A good question feels respectful, specific, and answerable even when
the underlying decision is technical. Core product words such as Charting,
Manifest, Board, Autopilot, and adapter are allowed when they help preserve
precision, but the question must still explain the user-visible choice.

### 2. Machine Manifest And Human Contract

The Manifest is machine source of truth:

```text
.helmsman/sessions/<id>/manifest.json
.helmsman/sessions/<id>/manifest.events.jsonl
```

Human-readable Markdown is generated:

```text
.helmsman/sessions/<id>/rendered/manifest.md
```

The user should see a clear contract, not raw internal machinery.

### 3. Parallel Research Lanes

Research lanes are declared during Charting and run in parallel through
declared adapters and subagents. Every lane writes a document artifact.

```text
.helmsman/sessions/<id>/research/<slug>.md
```

Research exists to create better questions and stronger route decisions.
It is not limited to external web research. Local codebases, archived project
history, existing skills, previous session artifacts, docs, config, and host
CLI behavior are all first-class research sources.

Helmsman should not be frugal with research. It should be strict with angles:
each lane must name the decision it can change, the sources it will inspect,
and the artifact it must produce.

The token posture is:

```text
maximize useful tokens, minimize discarded tokens
```

Helmsman should spend heavily on parallel, decision-changing research when it
improves the route. It should not spend tokens repeating research that already
exists in project memory unless that memory is stale, missing, conflicting, or
insufficient for the current route decision.

Research notes should not feel like paperwork for its own sake. A lane may
produce a free-form note as the human artifact, while `research-index.md` and
the Board carry the machine-visible metadata: sources checked, decision impact,
completion status, score movement, and route changes.

### 4. Purpose-Specific Roles And Models

Helmsman maps purposes to agents, providers, models, thinking levels, fast/deep modes, tools, and concurrency policy.

Charting, research, skeptical audit, implementation, and verification should not be forced through the same model profile.

### 5. Board-Governed Autopilot

Autopilot executes a locked route while reading the Board before every loop:

```text
.helmsman/sessions/<id>/board.json
```

Adapters execute. Helmsman governs. Verification is part of the Autopilot loop,
not an afterthought. The Board is not only a stop sign; it is the live checklist,
benchmark table, scorecard, and progress ledger. Each loop should update what
improved, what regressed, what remains blocked, and whether the current work
still serves the locked route.

### 6. Wiki Memory As Research Cache

Wiki Memory is not raw chat history and not an embedding score pretending to be
judgment. It is a structured map of prior decisions, concepts, session records,
and reusable evidence.

Before launching new research lanes, Helmsman performs a scoped memory scan:

```text
read wiki index -> select relevant memory -> check stale/missing/conflict -> research only the gap
```

The goal is not to research less. The goal is to avoid researching the same
topic twice while preserving enough evidence to challenge or refresh old
conclusions.

## Non-Goals

Helmsman should not become:

- an OMP plugin whose core behavior depends on OMP doing the right thing
- a thin Pi chat wrapper whose core behavior depends on Pi session history as
  route authority
- an Electron desktop workbench revival as the default surface
- a spreadsheet-style scorecard UI
- a generic chat prompt pack
- an always-on recommendation layer inside OMP
- a one-pass planning command
- a system that treats chat history as the source of truth
- a demo that must be thrown away before the real product

## Current Planning Authority

The binding architecture track is:

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
docs/tui-user-scenarios.md
docs/implementation-route.md
```

The previous OMP plugin-first plan under `docs/v0-plans/` is retained as a
host study archive. It is not current product authority.

## Current Implementation Route

The current proof route is described in `docs/implementation-route.md` and is
anchored by `docs/pi-direct-ultimate-product-design.md`.
The design closure audit is recorded in
`docs/pi-direct-design-closure-audit.md`: the Pi-direct product contract is
closed at design level, while implementation proof remains gated.
The binding durable state, event, Board, operation, and Question UI Adapter
contracts are defined in `docs/pi-direct-data-contracts.md`.
The binding Core event append, reducer, Board projector, gate evaluator, replay,
and recovery contract is defined in
`docs/core-event-reducer-board-contract.md`.
The binding Gate 1 runtime, command, evidence, security, and verification
contract is defined in `docs/pi-runtime-foundation-contract.md`.
The binding role runtime, worker packet mapping, concurrency, Pi AgentSession
execution, and role-run evidence contract is defined in
`docs/pi-role-runtime-contract.md`.
The binding install, read-only doctor, update authority, no-mock product audit,
and release evidence contract is defined in
`docs/install-doctor-product-audit-contract.md`.
The binding Memory and Research contract is defined in
`docs/memory-research-contract.md`. It governs Aperture-scoped memory scan,
stale/missing/conflict research lane creation, parallel RoleRuntime dispatch,
artifact validation, synthesis, and Board projection.
The binding Route Lock, route snapshot, amendment, unlock, invalidation, and
Autopilot precondition contract is defined in
`docs/route-lock-amendment-contract.md`.
The binding Autopilot loop contract is defined in
`docs/autopilot-loop-contract.md`. It governs Board-read action selection,
bounded packets, drift response, repair/audit loops, park/stop/ask/amend
decisions, resume, and the boundary that final prose is never completion.
The binding Verification and Closeout contract is defined in
`docs/verification-closeout-contract.md`. It governs scenario-backed verifier
runs, verdict artifacts, Board verification projection, closeout events, and
Wiki Memory promotion candidates.
The binding question UI decision is defined in
`docs/question-ui-adapter-decision.md`.

Its binding choices are:

- reuse `helmsman-desktop` protocol semantics as donor material, not its Electron shell
- expose the product through Manifest and Board language
- make every state-changing command an append-only Core transaction with
  deterministic Manifest and Board replay
- build directly on Pi for in-process agent sessions, provider/model access,
  terminal UI primitives, settings/resource loading, session persistence, and
  event capture
- build the first gate around Pi runtime foundation before higher-level
  Charting and Autopilot behavior
- execute purpose-specific roles through Core-owned RoleRuntime plans, not
  transcript-only prompts
- treat memory and research as Charting authority work: scoped memory first,
  parallel artifact-backed lanes second, synthesis before Route Lock
- prove product readiness through installed-state doctor and product audit
  evidence, not repo-only generated files
- require user-confirmed Route Lock over a canonical route snapshot before
  Autopilot may execute
- run Autopilot as a Core-owned Board-read loop, not as a self-authorizing
  agent prompt or transcript continuation
- close only through scenario-backed verification and separate closeout
  evidence, never through green tests or final prose alone
- keep Codex, OpenCode, OMP, Claude Code, and later hosts as secondary
  adapters while Core owns legality, Board reads, route adherence, run review,
  and verification evidence

The purpose is to keep route authority intact while Pi role runners and any
external adapters execute. An agent session that can run code is useful only
when Helmsman can prove the route did not drift, the Board moved, verification
evidence exists, and the user can inspect or resume the run from the TUI.
