# OMP Plugin Product Contract

Status: superseded OMP plugin-first study

Current authority: `../product-north-star.md` and `../native-core-tui-plan.md`.
This file is retained for OMP adapter/reference research only.

## Product Sentence

```text
Helmsman is an OMP plugin suite for question-first Charting,
machine Manifest compilation, parallel research lanes, and Board-governed Autopilot.
```

Helmsman is not currently an independent TUI. OMP is the host and execution surface. Helmsman is the route governor.

## Authority Split

OMP owns:

- terminal chat UI
- model/provider/auth registry
- OAuth and API-key connection flows
- normal coding-agent tools
- tool rendering and TUI interaction
- slash command infrastructure
- extension loading
- hook and event surfaces
- subagent execution through `task`
- MCP, LSP, compacting, system prompt, session operations, and baseline coding-agent features

Helmsman owns:

- explicit `/hm:*` command surface
- question-first Charting workflow
- Manifest schema and reducer
- Board projection
- research lane contracts
- subagent role installation
- role to model/thinking/fast mode mapping
- Autopilot policy
- per-loop Board read contract
- drift and verification gates
- human-readable contract rendering

## Product Boundary

Helmsman should feel like an OMP plugin, not a rival shell. Normal OMP chat remains normal. The user enters Helmsman only when they ask for it:

```text
/hm:charting rebuild this system around OMP plugins
/hm:autopilot
/hm:board
/hm:manifest
```

No automatic "you should use Helmsman" prompt is required. The product is for the user's own explicit workflow.

## What Must Not Happen

- Do not fork OMP before proving the plugin path fails.
- Do not rebuild OMP's TUI, provider registry, auth, MCP, LSP, hooks, compact, or subagent runtime.
- Do not let the chat transcript become the durable source of truth.
- Do not treat Charting as one ask block plus one research batch.
- Do not start Autopilot from a static goal prompt alone.
- Do not let Autopilot continue without reading Board state.
- Do not hide skipped questions or skipped research lanes.
- Do not call a lane complete unless it wrote an artifact.

## Full Product Target

The target is not a small MVP. The implementation can be staged through proof gates, but every gate must point toward the full system:

```text
OMP plugin host
+ explicit /hm command namespace
+ repeated question-first Charting
+ parallel research lanes
+ machine Manifest
+ live Board
+ purpose-specific roles/models
+ Board-governed Autopilot
+ continuous verification
```

The project is allowed to be incomplete during construction. The design target is not allowed to be a reduced product.

## Success Standard

Helmsman succeeds when a rough user request can become a locked route contract that an agent can execute for a long time without losing intent.

The contract must answer:

- what the user is really trying to achieve
- what must not be done
- what counts as success
- what evidence supports the plan
- what questions remain open
- what phases exist
- what Autopilot is allowed to do next
- when Autopilot must stop and ask
