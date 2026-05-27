# Research Lanes And Subagents

Status: superseded OMP plugin-first study

Current authority: `../product-north-star.md` and `../native-core-tui-plan.md`.
This file is retained for OMP adapter/reference research only.

## Core Rule

Research lanes are parallel by default.

If Charting declares multiple independent active lanes, Helmsman dispatches them in one OMP `task` batch unless there is a real dependency between lanes.

```text
one lane = one subagent task
one wave = one batch of independent lane tasks
one completed lane = one written artifact
```

## Why Parallel

Charting should deepen quickly without making the user wait through serial research. The user is already answering many questions. Agent-side evidence gathering should use concurrency.

The old Helmsman philosophy already treats research as Charting-owned evidence work. The OMP plugin path gives a concrete execution primitive: `task` launches subagents for parallel work and writes subagent artifacts.

## Lane Contract

Each lane must have a written contract before dispatch:

```json
{
  "id": "lane-omp-ask-ui",
  "wave": 2,
  "agent": "helmsman-researcher",
  "question": "What OMP Ask UI features can Helmsman reuse?",
  "purpose": "avoid rebuilding form UI",
  "requiredSources": [
    "references/oh-my-pi/docs/tools/ask.md",
    "references/oh-my-pi/packages/coding-agent/src/tools/ask.ts"
  ],
  "outputPath": ".helmsman/sessions/s-001/research/omp-ask-ui.md",
  "doneCriteria": [
    "identify supported form behaviors",
    "identify missing Helmsman semantics",
    "name exact files or docs used",
    "return risks and adoption recommendation"
  ],
  "forbiddenActions": [
    "modify source files",
    "update Manifest directly",
    "claim Route Lock"
  ]
}
```

## Dispatch Through OMP Task

Use OMP `task` with one item per lane:

```text
agent: helmsman-researcher
context: shared Charting context, Manifest projection, lane output rules
tasks:
  - id: lane-omp-ask-ui
    description: OMP Ask UI reuse
    assignment: lane contract plus exact output path
  - id: lane-agent-discovery
    description: OMP agent discovery
    assignment: lane contract plus exact output path
```

Subagents do not inherit full conversation history automatically. Every lane assignment must include the facts, file paths, user decisions, and output path required to complete the lane.

## Mandatory Artifacts

Every completed lane writes:

```text
.helmsman/sessions/<session-id>/research/<slug>.md
```

The parent updates:

```text
.helmsman/sessions/<session-id>/research-index.md
manifest.json
manifest.events.jsonl
board.json
```

Lane artifact template:

```text
# <Lane Title>

Status:
Question:
Recommendation:
Evidence:
Findings:
Risks:
Open Questions:
Manifest Updates Proposed:
Sources:
```

No chat-only research completion is valid.

## Lane Status

Lane status values:

```text
proposed
active
running
completed
failed
waived
superseded
blocked
```

Waived lanes require a reason. Failed lanes can trigger a retry, a new lane, or a user-visible risk.

## Concurrency

Default active research lane cap:

```text
max active lanes per wave: 6
```

The cap can be changed in config, but unbounded research is not allowed. More lanes can be queued for later waves.

## Research Feeds More Questions

Research is not the end of Charting. Research results often create better questions.

After every research batch, Charting must run a synthesis and gap pass:

```text
What did evidence close?
What did evidence contradict?
Which user intent questions remain?
Which route choices now have better options?
Which research lane should run next?
Is Route Lock still blocked?
```

This is why Charting is multi-wave.
