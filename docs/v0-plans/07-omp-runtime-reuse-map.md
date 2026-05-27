# OMP Runtime Reuse Map

Status: superseded OMP runtime reference

Current authority: `../product-north-star.md` and `../native-core-tui-plan.md`.
This file is retained for OMP adapter/reference research only.

Helmsman should reuse OMP runtime surfaces directly. This file names the surfaces that should be treated as proven infrastructure unless a proof gate shows they cannot support the required behavior.

## Extension Authoring

Use OMP extensions for Helmsman plugin runtime:

```text
references/oh-my-pi/docs/skills/authoring-extensions.md
references/oh-my-pi/docs/extension-loading.md
```

Relevant OMP capabilities:

- TypeScript or JavaScript extension modules
- `package.json` `omp.extensions`
- project auto-discovery under `.omp/extensions`
- user auto-discovery under `~/.omp/agent/extensions`
- marketplace-installed plugin extension entries
- slash commands, tools, and events in one extension module

Helmsman use:

- register `/hm`
- register Helmsman tools if needed
- subscribe to lifecycle and tool events
- update UI status lines

## Slash Commands

Use OMP slash command routing:

```text
references/oh-my-pi/docs/slash-command-internals.md
references/oh-my-pi/packages/coding-agent/src/slash-commands/helpers/parse.ts
```

Important behavior:

```text
/foo:bar -> command foo, args bar
/foo bar -> command foo, args bar
```

Helmsman use:

```text
/hm:charting
/hm:autopilot
/hm:manifest
```

## Ask UI

Use OMP `ask`:

```text
references/oh-my-pi/docs/tools/ask.md
references/oh-my-pi/packages/coding-agent/src/tools/ask.ts
```

Reusable behavior:

- multiple questions
- options
- recommended option
- single select
- multi select
- custom answer
- structured result details

Known gap:

- current OMP Ask options are label-only; Helmsman needs either a custom
  extension UI or an OMP Ask patch for first-class option descriptions

Helmsman adds:

- max 4 questions per bundle
- stable option ids
- route impact metadata
- Manifest events
- question ledger state

## Task Subagents

Use OMP `task`:

```text
references/oh-my-pi/docs/tools/task.md
references/oh-my-pi/docs/task-agent-discovery.md
references/oh-my-pi/packages/coding-agent/src/task/index.ts
references/oh-my-pi/packages/coding-agent/src/task/executor.ts
```

Reusable behavior:

- parallel task batch
- configured concurrency limit
- per-task output artifacts
- `agent://` artifact handles
- project and user task agents
- optional isolated execution

Helmsman use:

- one research lane per task
- one artifact per lane
- role-specific agents
- no Manifest mutation from subagents
- parent synthesis after batch

## Hooks And Events

Use extension events rather than legacy hooks where possible:

```text
references/oh-my-pi/docs/hooks.md
references/oh-my-pi/docs/skills/authoring-hooks.md
```

Reusable behavior:

- `context`
- `tool_call`
- `tool_result`
- `turn_start`
- `turn_end`
- `session_before_compact`
- `session.compacting`
- `session_compact`

Helmsman use:

- inject Board context
- block forbidden tool calls
- record tool evidence
- preserve Board and Manifest through compaction
- update status display

## Provider, Model, And Auth

Use OMP provider and model surfaces:

```text
references/oh-my-pi/docs/models.md
references/oh-my-pi/docs/auth-broker-gateway.md
references/oh-my-pi/docs/provider-streaming-internals.md
```

Helmsman should not rebuild auth. The role registry should resolve to OMP provider/model settings.

Helmsman adds:

- purpose-specific role mapping
- thinking level policy
- fast/deep mode preference
- fallback model policy
- concurrency class

## MCP, LSP, Compact, System Prompt

Use OMP baseline features where present:

```text
references/oh-my-pi/docs/mcp-config.md
references/oh-my-pi/docs/tools/lsp.md
references/oh-my-pi/docs/compaction.md
references/oh-my-pi/docs/session.md
```

Helmsman should not rebuild:

- MCP config and server lifecycle
- LSP tool behavior
- compaction engine
- base system prompt machinery
- session tree and resume primitives

Helmsman adds:

- route-aware context injection
- Manifest and Board preservation during compaction
- scope and drift policy above tool calls

## Rule

Every Helmsman feature should first ask:

```text
Can OMP already do this part?
```

If yes, reuse it and document the adapter. If no, write a proof gate before building a replacement.
