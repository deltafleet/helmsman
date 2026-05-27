# Open Contracts To Close

Status: superseded OMP plugin closure audit

Current authority: `../product-north-star.md` and `../native-core-tui-plan.md`.
This file is retained for OMP adapter/reference research only.

The current OMP plugin direction is coherent, but it is not fully closed. These contracts must be resolved before implementation is allowed to pretend the architecture is deterministic.

## Priority A: Blocks Implementation

### 1. Extension-Orchestrated Autopilot Continuation

Open question:

```text
Can a Helmsman OMP extension reliably continue an Autopilot loop without forking OMP?
```

Current docs say Autopilot can use `context`, `tool_call`, `tool_result`, and `turn_end`. That is not enough. The exact continuation primitive must be closed:

- how the next loop is triggered
- whether it is a real user-visible follow-up, hidden follow-up, queued prompt, or command continuation
- how cancellation works
- how duplicate loops are prevented after restart or compaction
- how infinite loops are capped
- how a running OMP turn is distinguished from a Helmsman-owned loop

Required closure:

```text
AutopilotLoopDriver contract
- start
- continue
- pause
- park
- cancel
- resume
- idempotency key
- max iterations
- loop event written before and after each turn
```

Proof gate impact:

- strengthens Gate 9: Autopilot Continuation
- may force a minimal OMP patch if extension APIs cannot safely drive continuation

### 2. Programmatic Research Lane Dispatch

Open question:

```text
Can Helmsman dispatch OMP `task` subagents directly from extension code,
or must it ask the model to call the task tool?
```

The product requires research lanes to run in parallel. The docs prove OMP has a `task` tool, but they do not yet prove the Helmsman extension can programmatically launch a task batch.

Required closure:

```text
ResearchDispatcher contract
- input lane contracts
- resolve agent names
- choose task sync or async mode
- launch one OMP task batch
- collect outputPaths / agent:// handles
- verify required research/<slug>.md files
- write research_lane.completed or research_lane.failed events
```

If direct dispatch is impossible, the fallback must be explicit:

```text
Helmsman emits a model instruction that calls task,
then verifies that the task result matches declared lane contracts.
```

That fallback is weaker and must be labeled as such.

### 3. State Schema And Reducer

Open question:

```text
What is the exact JSON schema for Manifest, Board, events, questions, lanes, roles, and lock state?
```

Current docs name files and fields, but not schema versions, reducer rules, or validation errors.

Required closure:

- `manifest.schema.json`
- `board.schema.json`
- `event.schema.json`
- `question-ledger.schema.json`
- `research-lane.schema.json`
- `role-registry.schema.json`
- reducer rules from `manifest.events.jsonl` to `manifest.json` and `board.json`
- invalid-state codes
- migration policy

Non-negotiable:

```text
Board must be reproducible from Manifest plus events,
or the docs must state exactly why it is not and how divergence is detected.
```

### 4. Session Resolution

Open question:

```text
When the user runs /hm:* in a project with several .helmsman sessions,
which session is active?
```

The current plan says create or resume a session, but does not define deterministic resolution.

Required closure:

```text
SessionResolver contract
- no session
- one active session
- multiple active sessions
- locked route but no autopilot
- parked route
- stale running marker
- explicit --session or selected session id
- current OMP session to Helmsman session mapping
```

Commands cannot be deterministic until this is closed.

### 5. Route Lock And Amendment Semantics

Open question:

```text
After Route Lock, what exact changes require unlock, amendment, or re-Charting?
```

Current docs say changes cannot be silent. That is correct but incomplete.

Required closure:

```text
RouteChangePolicy
- non-route-changing evidence update
- scoped amendment
- phase-local adjustment
- route unlock
- return to Charting
- user override
- emergency stop
```

Each category needs examples and event types.

## Priority B: Needed For A Real Product

### 6. Question Strategy And Ledger Semantics

Open question:

```text
How does Helmsman ask many questions without turning the UI into an interrogation wall?
```

The product principle is clear: ask many questions because intent matters. The pacing contract is not closed.

Required closure:

- question bundle priority classes
- when to ask now vs defer
- when to infer and ask for confirmation
- when research should happen before the next question
- how to prevent repeated equivalent questions
- how to preserve user wording as authority
- how waived questions affect Route Lock
- how custom answers are normalized without losing nuance

Question count is not the metric. Route-changing uncertainty closed per bundle is the metric.

### 7. OMP Ask UI Adapter

Open question:

```text
Does Helmsman use OMP's `ask` tool, extension `ctx.ui` primitives, or a custom extension renderer?
```

The docs currently say to wrap OMP Ask. That is directionally right, but the implementation surface must be exact.

Required closure:

```text
QuestionUIAdapter
- single select
- multi select
- recommended marker
- option title and description
- custom answer
- maximum 4 questions
- structured result capture
- timeout behavior
- headless behavior
- transcript evidence
```

Prior Helmsman work already showed that a valid question artifact is not enough if the full choice surface never reaches the native conversation. This proof must be built into the OMP plugin version from the start.

### 8. Research Artifact Verification

Open question:

```text
What makes a research lane artifact valid?
```

It is not enough that a file exists.

Required closure:

- source list required
- observations and inferences separated
- decision impact required
- open uncertainty required
- output path must match lane contract
- lane artifact cannot modify Manifest directly
- parent synthesis must accept, reject, or retry the lane

Add a validator before implementation:

```text
validateResearchLaneArtifact(lane, artifact)
```

### 9. Role And Model Runtime Adapter

Open question:

```text
Which OMP APIs actually set model, thinking level, active tools, and subagent model per role?
```

The role registry shape is documented. The adapter is not closed.

Required closure:

- supported OMP runtime methods
- settings-file-only fields
- reload boundaries
- unsupported thinking level behavior
- fast/deep provider mapping
- per-subagent model override behavior
- fallback model behavior
- auth-missing behavior

Without this, "purpose-specific model settings" remains product copy rather than executable contract.

### 10. Tool Scope Policy

Open question:

```text
How does Helmsman decide that a tool call is inside approved scope?
```

`tool_call` blocking is a mechanism, not a policy.

Required closure:

- path-scope matcher
- command-scope matcher
- network/web permission policy
- MCP tool policy
- write vs read distinction
- generated artifact write exceptions
- installer write exceptions
- user override flow
- drift event shape

This must be strict enough to stop Autopilot from improvising around the Manifest.

### 11. Compaction And Context Preservation

Open question:

```text
What exact Board and Manifest projection survives OMP compaction?
```

Required closure:

- compact projection format
- maximum token budget
- what is injected every call
- what is read from disk on demand
- what never enters model context
- how lock hash and Board event id are preserved
- post-compaction consistency check

Autopilot cannot depend on chat context surviving.

### 12. Plugin Packaging And Agent Install Boundary

Open question:

```text
What ships in the OMP plugin, and what is installed into the project by /hm:install?
```

Current docs say plugin plus installer. The exact boundary is not closed.

Required closure:

- extension entry files
- bundled agent templates
- generated `.omp/agents` files
- role config template
- install manifest
- stale cleanup
- project vs user scope
- marketplace install behavior
- update behavior
- rollback behavior

## Priority C: Close Before Polishing

### 13. Scorecard And Benchmark Rubric

Open question:

```text
What is the exact scorecard shape compiled by Charting?
```

The user wants roadmap, phase specs, benchmark criteria, and scoring categories. The docs name these, but the rubric schema is not closed.

Required closure:

- scorecard categories
- per-phase acceptance criteria
- evaluation scale
- evidence required per score
- what counts as failure
- how Autopilot updates score state
- how closeout reports final score

### 14. Error Recovery

Open question:

```text
What does Helmsman do when a lane fails, an OMP task hangs, an agent omits yield, a file write fails, or Board update is partial?
```

Required closure:

- retry policy
- partial artifact policy
- failed lane event
- stale running marker policy
- task timeout behavior
- user cancellation behavior
- recovery command
- doctor diagnostics

### 15. Observability

Open question:

```text
How does the user inspect what Helmsman did without reading raw JSON?
```

Required closure:

- `/hm:status`
- `/hm:events`
- `/hm:research`
- `/hm:board`
- `/hm:manifest`
- `/hm:doctor`
- compact progress strip
- artifact links

The product can remain TUI-only, but it still needs inspectability.

### 16. Secrets And Privacy

Open question:

```text
What is forbidden from Manifest, Board, research artifacts, and rendered Markdown?
```

Required closure:

- no API keys in artifacts
- auth status only, not tokens
- redaction rules
- source URL policy
- local path sensitivity
- user-provided secret handling
- MCP secret boundary

### 17. Compatibility With Existing Helmsman Artifacts

Open question:

```text
Does the OMP plugin version read old .helmsman skill-era sessions, or is it a new state lineage?
```

Required closure:

- new schema lineage only
- import old sessions
- read-only archive view
- migration command
- explicit non-compatibility declaration

Leaving this vague will cause confusing resume behavior.

## Recommended Closure Order

Close in this order:

```text
1. Extension continuation
2. Programmatic task dispatch
3. State schemas and reducer
4. Session resolver
5. Question UI adapter
6. Research artifact validator
7. Role/model adapter
8. Route lock amendments
9. Tool scope policy
10. Compaction projection
```

This order is deliberate. Autopilot and parallel Charting cannot be implemented honestly until the host-control and state contracts are closed.
