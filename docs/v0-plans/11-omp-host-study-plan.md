# OMP Host Study Plan

Status: superseded OMP host study plan

Current authority: `../product-north-star.md` and `../native-core-tui-plan.md`.
This file is retained for OMP adapter/reference research only.

This plan treats OMP as the host runtime, not as loose inspiration.

Helmsman should not fork the TUI, provider registry, auth, task runtime,
MCP/LSP tools, session persistence, compaction, or plugin loader unless this
study proves a specific host seam cannot support the product contract.

## Goal

Prove whether Helmsman can be implemented as an OMP plugin suite that owns:

- explicit `/hm:*` commands
- question-first Charting
- Manifest and Board state
- parallel research lane orchestration
- project role installation
- Board-governed Autopilot
- drift and verification gates

The proof must read both OMP docs and OMP code. Docs alone are insufficient
because several important seams are behavioral, not just declared APIs.

## Study Lanes

### 1. Extension Lifecycle and Command Routing

Docs:

- `references/oh-my-pi/docs/extensions.md`
- `references/oh-my-pi/docs/extension-loading.md`
- `references/oh-my-pi/docs/skills/authoring-extensions.md`
- `references/oh-my-pi/docs/slash-command-internals.md`

Code:

- `references/oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts`
- `references/oh-my-pi/packages/coding-agent/src/extensibility/extensions/loader.ts`
- `references/oh-my-pi/packages/coding-agent/src/extensibility/extensions/runner.ts`
- `references/oh-my-pi/packages/coding-agent/src/slash-commands/helpers/parse.ts`

Helmsman question:

Can `/hm:charting` and `/hm:autopilot` be implemented as one OMP command
with subcommands while preserving normal OMP chat by default?

Required output:

- command contract
- subcommand parse contract
- plugin loading contract
- reload boundary

### 2. Question UI Surface

Docs:

- `references/oh-my-pi/docs/tools/ask.md`
- `references/oh-my-pi/docs/extensions.md`

Code:

- `references/oh-my-pi/packages/coding-agent/src/tools/ask.ts`
- `references/oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts`

Helmsman question:

Can Helmsman show question bundles with at most 4 questions, recommended
choices, single select, multi select, custom input, and enough per-option
explanation to support serious Charting?

Required output:

- native Ask reuse decision
- custom extension UI decision
- evidence capture format proving the full question surface reached the user
- fallback behavior when `ctx.hasUI` is false

### 3. Task and Subagent Execution

Docs:

- `references/oh-my-pi/docs/tools/task.md`
- `references/oh-my-pi/docs/task-agent-discovery.md`

Code:

- `references/oh-my-pi/packages/coding-agent/src/task/index.ts`
- `references/oh-my-pi/packages/coding-agent/src/task/executor.ts`
- `references/oh-my-pi/packages/coding-agent/src/task/discovery.ts`
- `references/oh-my-pi/packages/coding-agent/src/task/output-manager.ts`

Helmsman question:

Can a Helmsman extension dispatch declared research lanes as a single parallel
OMP task batch, then validate one artifact per lane?

Required output:

- direct dispatch proof or minimal host patch
- lane-to-task mapping
- artifact validation contract
- failure and timeout behavior

### 4. Agent Discovery and Installation

Docs:

- `references/oh-my-pi/docs/task-agent-discovery.md`
- `references/oh-my-pi/docs/marketplace.md`
- `references/oh-my-pi/docs/skills/authoring-marketplaces.md`

Code:

- `references/oh-my-pi/packages/coding-agent/src/task/discovery.ts`
- `references/oh-my-pi/packages/coding-agent/src/task/agents.ts`
- `references/oh-my-pi/packages/coding-agent/src/discovery/helpers.ts`
- `references/oh-my-pi/packages/coding-agent/src/extensibility/plugins/marketplace/registry.ts`

Helmsman question:

Which Helmsman agents ship inside the plugin, and which are installed or
overridden project-locally under `.omp/agents`?

Required output:

- plugin `agents/` boundary
- project `.omp/agents` override boundary
- compatibility mirror decision for `.agents/subagents`
- stale install cleanup contract

### 5. Model, Provider, Thinking, and Fast Mode

Docs:

- `references/oh-my-pi/docs/models.md`
- `references/oh-my-pi/docs/auth-broker-gateway.md`

Code:

- `references/oh-my-pi/packages/coding-agent/src/config/model-resolver.ts`
- `references/oh-my-pi/packages/coding-agent/src/config/settings-schema.ts`
- `references/oh-my-pi/packages/coding-agent/src/session/agent-session.ts`
- `references/oh-my-pi/packages/coding-agent/src/modes/components/agent-dashboard.ts`

Helmsman question:

Can each Helmsman role resolve to a specific OMP model, thinking level,
tool policy, and fast-mode preference without rebuilding auth?

Required output:

- role registry schema
- model/thinking resolution rules
- per-subagent override path
- fast mode mapping and provider limits

### 6. Autopilot Continuation

Docs:

- `references/oh-my-pi/docs/extensions.md`
- `references/oh-my-pi/docs/session.md`
- `references/oh-my-pi/docs/compaction.md`

Code:

- `references/oh-my-pi/packages/coding-agent/src/autoresearch/index.ts`
- `references/oh-my-pi/packages/coding-agent/src/session/agent-session.ts`
- `references/oh-my-pi/packages/coding-agent/src/session/session-manager.ts`

Helmsman question:

Can Helmsman keep an Autopilot loop alive by injecting Board state on every
turn and scheduling the next bounded action after `agent_end`?

Required output:

- continuation loop design
- loop idempotency key
- stop conditions
- Board injection prompt
- manual interruption contract

### 7. Tool Governance and Drift Blocking

Docs:

- `references/oh-my-pi/docs/extensions.md`
- `references/oh-my-pi/docs/hooks.md`

Code:

- `references/oh-my-pi/packages/coding-agent/src/extensibility/extensions/wrapper.ts`
- `references/oh-my-pi/packages/coding-agent/src/extensibility/shared-events.ts`

Helmsman question:

Can Helmsman block or mark tool calls when they violate the Board contract?

Required output:

- allowed actions schema
- blocked tool response shape
- scope-change question flow
- audit log event shape

### 8. Compaction, Context, and System Prompt

Docs:

- `references/oh-my-pi/docs/compaction.md`
- `references/oh-my-pi/docs/session.md`
- `references/oh-my-pi/docs/extensions.md`

Code:

- `references/oh-my-pi/packages/coding-agent/src/session/agent-session.ts`
- `references/oh-my-pi/packages/coding-agent/src/session/session-manager.ts`
- `references/oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts`

Helmsman question:

Which Manifest and Board projection survives compaction, and how does
Autopilot continue after session context maintenance?

Required output:

- compaction preservation contract
- session reload reconstruction contract
- human-rendered Manifest path
- machine Manifest state path

### 9. MCP, LSP, Hooks, Skills, and Baseline Agent Features

Docs:

- `references/oh-my-pi/docs/mcp-config.md`
- `references/oh-my-pi/docs/tools/lsp.md`
- `references/oh-my-pi/docs/hooks.md`
- `references/oh-my-pi/docs/skills.md`

Code:

- `references/oh-my-pi/packages/coding-agent/src/mcp/manager.ts`
- `references/oh-my-pi/packages/coding-agent/src/lsp/index.ts`
- `references/oh-my-pi/packages/coding-agent/src/extensibility/skills.ts`
- `references/oh-my-pi/packages/coding-agent/src/system-prompt.ts`

Helmsman question:

What should Helmsman inherit from OMP unchanged, and what must it configure
for Charting or Autopilot roles?

Required output:

- inherited surface list
- Helmsman-owned configuration list
- explicit non-goals

## Required Study Artifact

Every lane must produce an entry in:

```text
docs/v0-plans/13-omp-helmsman-feasibility-matrix.md
```

Each entry must answer:

- product requirement
- OMP support
- exact doc or code evidence
- feasibility level
- required spike or patch

## Decision Rule

The OMP plugin direction is accepted only if:

1. Charting can ask repeated native or native-equivalent question bundles.
2. Research lanes can run in parallel with durable lane artifacts.
3. Autopilot can read Board state every loop before acting.
4. Tool calls can be blocked or marked when they violate Board state.
5. Model, thinking, and fast-mode choices can be bound to Helmsman roles.
6. Compaction and resume preserve the Manifest and Board authority.

If one of these fails because the OMP extension API is missing a narrow
primitive, the preferred answer is a small OMP host patch, not a forked TUI.
