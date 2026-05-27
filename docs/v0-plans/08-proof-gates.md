# Proof Gates

Status: superseded OMP proof gates

Current authority: `../product-north-star.md` and `../native-core-tui-plan.md`.
This file is retained for OMP adapter/reference research only.

These are not MVP slices. They are proof gates for the full product. Each gate must prove a contract that the final system depends on.

## Gate 1: Plugin Command

Prove:

- OMP loads a Helmsman extension from plugin or project path.
- `/hm:charting` routes to the `hm` extension command.
- `/hm:charting` creates or resumes `.helmsman/sessions/<id>`.
- Unknown `/hm:*` commands fail closed.

Acceptance:

```text
/hm:charting rough goal
creates session
writes manifest.events.jsonl
writes board.json
shows Charting status
```

## Gate 2: Ask UI Wrapper

Prove:

- Helmsman can show a form question bundle using OMP Ask UI.
- Bundle has 1 to 4 questions.
- Single select, multi select, recommended option, and custom answer work.
- Answers become Manifest events and question-ledger updates.

Acceptance:

```text
question bundle -> user answer -> manifest event -> ledger status answered
```

## Gate 3: Repeated Charting Waves

Prove:

- Charting does not end after one question bundle.
- Research results can trigger new questions.
- Answers can trigger new research lanes.
- Lock readiness remains blocked until gates pass.

Acceptance:

```text
wave 1 asks intent
wave 1 dispatches research
wave 2 asks better questions from research
wave 2 updates Manifest
lock is blocked until all route-changing gaps are closed
```

## Gate 4: Parallel Research Lanes

Prove:

- Helmsman declares multiple lane contracts.
- OMP `task` dispatches them in one batch.
- Each lane writes `research/<slug>.md`.
- Parent updates `research-index.md`, Manifest, and Board.

Acceptance:

```text
3 active lanes -> 3 subagent tasks -> 3 artifacts -> one synthesis event
```

## Gate 5: Agent Installer

Prove:

- `/hm:install` writes project-local `.omp/agents/helmsman-*.md`.
- OMP discovers those agents.
- `/hm:doctor` reports installed, missing, stale, and shadowed agents.
- Role registry maps to installed agents.

Acceptance:

```text
fresh project -> /hm:install -> OMP task can spawn helmsman-researcher
```

## Gate 6: Role Model Settings

Prove:

- Roles carry provider, model, thinking level, fast/deep mode, tools, and fallback.
- Helmsman can resolve role to OMP runtime settings or config.
- Unsupported fields are reported explicitly.

Acceptance:

```text
charting.researcher -> model/thinking/tool policy visible before dispatch
```

## Gate 7: Board Context Injection

Prove:

- Before each model call, Helmsman injects current Board projection.
- Board projection updates after tool results.
- Compaction preserves the current Board and Manifest anchor.

Acceptance:

```text
edit board.json -> next OMP loop sees updated Board projection
```

## Gate 8: Tool Scope Blocking

Prove:

- `tool_call` events can block actions outside approved scope.
- Blocked actions become Board drift events.
- User can approve scope change through a question bundle.

Acceptance:

```text
Autopilot attempts forbidden write -> blocked -> drift event -> ask user
```

## Gate 9: Autopilot Continuation

Prove:

- `/hm:autopilot` starts only after Route Lock.
- Autopilot reads Board every loop.
- It can continue, ask, repair, verify, park, or complete based on Board.

Acceptance:

```text
locked route -> autopilot loop -> implementation step -> evidence update -> next Board action
```

## Gate 10: Human Contract Rendering

Prove:

- `manifest.json` renders into `rendered/manifest.md`.
- The rendered contract is understandable without exposing every intermediate file.
- It includes goal, non-goals, decisions, roadmap, scorecard, risks, verification, and handoff.

Acceptance:

```text
/hm:manifest shows the compiled contract and identifies missing sections
```

## Closure Rule

No implementation phase is considered closed until its proof gate has:

- command transcript
- artifact paths
- failure behavior
- verification command or manual check
- recorded unresolved risks
