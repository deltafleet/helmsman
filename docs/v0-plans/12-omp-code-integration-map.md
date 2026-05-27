# OMP Code Integration Map

Status: superseded OMP code reading snapshot

Current authority: `../product-north-star.md` and `../native-core-tui-plan.md`.
This file is retained for OMP adapter/reference research only.

This map names the OMP code surfaces Helmsman should reuse directly and the
surfaces that still need proof or host patching.

## High-Level Result

The OMP plugin approach is plausible.

OMP already has:

- extension loading
- slash commands
- interactive UI primitives
- Ask tool
- model and thinking controls
- provider/auth registry
- task subagents
- plugin and project agent discovery
- session custom messages
- continuation via `sendMessage(..., { deliverAs: "nextTurn", triggerTurn: true })`
- event hooks around prompts, tools, compaction, and sessions

The hard part is not whether OMP has these pieces. It does. The hard part is
whether a plugin can orchestrate them deterministically enough for Helmsman.

## Green: Extension Host

Use:

- `references/oh-my-pi/docs/extensions.md`
- `references/oh-my-pi/docs/extension-loading.md`
- `references/oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts`

Relevant facts:

- `ExtensionAPI` exposes `registerCommand`, `registerTool`,
  `registerMessageRenderer`, `sendMessage`, `sendUserMessage`, `appendEntry`,
  `getActiveTools`, `setActiveTools`, `setModel`, and `setThinkingLevel`.
- `ExtensionContext` exposes `ui`, `cwd`, `sessionManager`, `modelRegistry`,
  `model`, `compact`, `isIdle`, `hasPendingMessages`, `abort`,
  `shutdown`, and `getSystemPrompt`.
- Command handlers get extra session control methods such as `waitForIdle`,
  `newSession`, `switchSession`, `branch`, `navigateTree`, and `reload`.

Helmsman use:

- one extension package
- one primary command `hm`
- optional alias command `helmsman`
- custom message renderers for Manifest, Board, and Charting status
- session entries via `appendEntry` for light runtime state
- durable files under `.helmsman/sessions/<id>/` for authoritative state

Decision:

Green.

The extension host is enough for command surface, widgets, state projection,
tool governance, and session lifecycle integration.

## Green: Slash Command Shape

Use:

- `references/oh-my-pi/packages/coding-agent/src/slash-commands/helpers/parse.ts`

Relevant fact:

`parseSlashCommand` treats the first whitespace or colon as the separator.
Therefore both `/foo bar` and `/foo:bar` become command `foo` with args `bar`.

Helmsman use:

```text
/hm:charting rough goal
/hm:autopilot
/hm:board
/hm:manifest
```

Implementation:

Register `hm` and parse its args as Helmsman subcommands. Do not register a
separate command named `hm:charting`.

Decision:

Green.

## Yellow-Green: Question UI

Use:

- `references/oh-my-pi/docs/tools/ask.md`
- `references/oh-my-pi/packages/coding-agent/src/tools/ask.ts`
- `references/oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts`

Relevant facts:

- OMP `ask` supports one or more questions.
- A question has `id`, `question`, `options`, optional `multi`, and optional
  zero-based `recommended`.
- Every question gets an automatic `Other (type your own)` option.
- Multi-question mode supports back and forward navigation.
- Multi-select mode supports checkbox toggling.
- The current `ask` schema accepts option labels only. It does not accept a
  separate option title plus long description.
- Extension UI exposes lower-level `select`, `input`, `editor`, and `custom`.

Helmsman requirement:

- maximum 4 questions per bundle
- single select and multi select
- recommended option marker
- personal custom answer
- option title and detailed description
- native-surface evidence

Decision:

Yellow-green.

OMP `ask` covers the base interaction but not the full option-description
contract. Helmsman must choose one:

1. Encode each option as a compact label with explanation in the question text.
2. Build a Helmsman question renderer on `ctx.ui.custom`.
3. Patch OMP `ask` to support `options[].description`.

The product-quality path is option 2 or 3. Option 1 is acceptable only for an
early proof, not for the final Charting surface.

## Yellow: Programmatic Task Dispatch

Use:

- `references/oh-my-pi/docs/tools/task.md`
- `references/oh-my-pi/packages/coding-agent/src/task/index.ts`
- `references/oh-my-pi/packages/coding-agent/src/task/executor.ts`
- `references/oh-my-pi/packages/coding-agent/src/sdk.ts`

Relevant facts:

- `TaskTool` already runs parallel subagents.
- `TaskTool.create(session)` requires a `ToolSession`.
- The task tool supports sync and async execution.
- It uses `task.maxConcurrency` for parallelism.
- Every subagent with an artifacts dir writes `<id>.md`; full output is
  available through `agent://<id>`.
- Extension API exposes registered tools and active tools, but no direct
  `runTool("task", params)` host action was found.
- `ExtensionContext.sessionManager` is read-only and is not a `ToolSession`.

Helmsman requirement:

Declared research lanes must dispatch as one parallel batch, and every lane
must write a document artifact under:

```text
.helmsman/sessions/<id>/research/<slug>.md
```

Decision:

Yellow.

The OMP task runtime is exactly the right execution primitive, but direct
plugin dispatch is not closed. There are three implementation paths:

1. Minimal OMP patch: expose a safe extension action such as
   `pi.runTool("task", params)` or `pi.dispatchTaskBatch(params)`.
2. Model-mediated: activate `task`, send a hidden instruction, then validate
   that the model called `task` with the declared lanes.
3. Recreate task execution from SDK primitives.

Preferred:

1. Minimal OMP host patch if direct dispatch is not already available through a
   public API.

Do not choose 3 unless both 1 and 2 fail. Recreating task execution is exactly
the wheel Helmsman is trying not to reinvent.

## Yellow-Green: Agent Discovery and Packaging

Use:

- `references/oh-my-pi/docs/task-agent-discovery.md`
- `references/oh-my-pi/packages/coding-agent/src/task/discovery.ts`
- `references/oh-my-pi/packages/coding-agent/src/discovery/helpers.ts`

Relevant facts:

- OMP discovers task agents from project and user config directories.
- Actual source-family order is `.omp`, `.claude`, `.codex`, `.gemini`.
- Project agents are loaded before user agents for the same source.
- Plugin `agents/` directories are appended after source-family config dirs,
  with project plugins before user plugins.
- Bundled OMP agents are appended last.
- Dedup is first-wins by exact agent name.
- Custom agent files can override bundled agents by name.

Helmsman use:

- plugin `agents/`: default Helmsman roles
- project `.omp/agents`: project-specific generated or pinned overrides
- optional `.agents/subagents` mirror: compatibility only, not OMP primary

Decision:

Yellow-green.

Discovery is good. The open piece is installer policy: what ships in plugin
`agents/`, what `/hm:install` writes to `.omp/agents`, and how stale generated
files are cleaned safely.

## Yellow-Green: Model, Thinking, and Fast Mode

Use:

- `references/oh-my-pi/docs/models.md`
- `references/oh-my-pi/packages/coding-agent/src/config/model-resolver.ts`
- `references/oh-my-pi/packages/coding-agent/src/config/settings-schema.ts`
- `references/oh-my-pi/packages/coding-agent/src/session/agent-session.ts`

Relevant facts:

- OMP `modelRoles` can store role aliases.
- Model selectors can include a thinking-level suffix such as `:minimal`,
  `:low`, `:medium`, `:high`, or `:xhigh`.
- Extension API exposes `setModel` and `setThinkingLevel` for the current
  session.
- `task.agentModelOverrides` exists for subagent model overrides.
- OMP has service tier / processing priority settings that map to provider
  priority or Anthropic fast mode where supported.

Helmsman use:

- role registry maps `charting.question_designer`, `charting.researcher`,
  `charting.skeptic`, `autopilot.director`, `autopilot.implementor`,
  `autopilot.auditor`, and `verify.judge` to OMP model settings.
- subagent frontmatter or OMP settings bind model and thinking per role.
- current parent session can be switched through extension API where needed.

Decision:

Yellow-green.

OMP already owns provider/auth/model selection. Helmsman should configure and
validate role bindings, not rebuild provider auth. The remaining work is an
exact role registry schema and fast-mode mapping.

## Yellow-Green: Autopilot Continuation

Use:

- `references/oh-my-pi/packages/coding-agent/src/autoresearch/index.ts`
- `references/oh-my-pi/packages/coding-agent/src/session/agent-session.ts`
- `references/oh-my-pi/docs/extensions.md`

Relevant facts:

- OMP builtin `autoresearch` is a direct precedent for an extension-governed
  loop.
- It registers a command, toggles mode, updates widgets, enables tools, and
  rehydrates runtime state on session lifecycle events.
- On `agent_end`, it can call `sendMessage` with `deliverAs: "nextTurn"` and
  `triggerTurn: true`.
- On `before_agent_start`, it injects a custom system prompt derived from the
  current stored state.
- `AgentSession` consumes pending next-turn messages alongside the next prompt.

Helmsman use:

- `/hm:autopilot` arms Autopilot only after Route Lock.
- `agent_end` evaluates Board state, stop conditions, drift, and pending user
  questions.
- If safe, it schedules a hidden next-turn continuation.
- `before_agent_start` injects the current Board projection and route contract.

Decision:

Yellow-green.

The pattern exists. The open work is loop safety: idempotency keys, turn caps,
manual interruption, stale Board reads, and what counts as a finished bounded
action.

## Green: Tool Governance

Use:

- `references/oh-my-pi/packages/coding-agent/src/extensibility/extensions/wrapper.ts`
- `references/oh-my-pi/packages/coding-agent/src/extensibility/extensions/types.ts`

Relevant facts:

- Extension tool wrappers emit `tool_call` before execution.
- `tool_call` can block execution.
- `tool_result` can modify content, details, or error state after execution.
- Tool execution events also provide observability.

Helmsman use:

- block edits outside Board-approved write scope
- block risky commands during Charting
- mark research lanes invalid if they omit required artifact writes
- record tool drift into Manifest events

Decision:

Green.

This is enough for Board-based guardrails.

## Yellow-Green: Compaction and Resume

Use:

- `references/oh-my-pi/docs/compaction.md`
- `references/oh-my-pi/packages/coding-agent/src/session/agent-session.ts`
- `references/oh-my-pi/packages/coding-agent/src/session/session-manager.ts`

Relevant facts:

- Extension events include `session_before_compact`, `session.compacting`, and
  `session_compact`.
- Manual compaction can be invoked through extension context.
- OMP persists custom messages and compaction entries in session history.
- Helmsman authoritative state should live in files, not only in session text.

Helmsman use:

- machine SSOT files under `.helmsman/sessions/<id>/`
- Board projection injected into context every turn
- compaction hooks preserve a human summary of active route, Board state, open
  questions, risks, and verification matrix

Decision:

Yellow-green.

The event surface exists. The exact survival contract must be designed around
files as authority and session context as projection.

## Red if Unpatched: Perfect Form UI Through Current Ask

The current OMP `ask` tool does not support per-option `description` as a
first-class schema field. If Helmsman requires Claude/OpenCode-style rich
choice cards exactly, current Ask alone is insufficient.

Resolution:

- use `ctx.ui.custom`, or
- patch OMP Ask schema and renderer, or
- accept a lower-fidelity proof while treating rich option descriptions as a
  required host patch.

## Current Hard Spikes

### Spike 1. Direct Task Dispatch

Question:

Can an extension invoke OMP `task` directly without asking the model to call
the tool?

Pass condition:

A Helmsman extension command launches two dummy lanes through the real OMP task
runtime and validates two artifacts.

Likely patch:

Expose a safe extension runtime method:

```ts
pi.runTool("task", params)
```

or a narrower:

```ts
pi.dispatchTaskBatch(params)
```

### Spike 2. Rich Question Renderer

Question:

Can `ctx.ui.custom` produce the exact question bundle surface Helmsman needs?

Pass condition:

A bundle with 4 questions shows title, explanation, recommended option,
single-select, multi-select, and custom answer, then writes structured results
to `question-ledger.json`.

Likely patch:

Add `options[].description` to OMP `ask`.

### Spike 3. Autopilot Loop Safety

Question:

Can `agent_end` plus hidden `nextTurn` continuation reliably run a loop without
duplicate turns or runaway recursion?

Pass condition:

Autopilot runs at least 3 bounded loop steps, reads a mutated Board before
each step, stops on a route-changing question, and does not continue when the
user sends a message.

Likely patch:

Probably none. The `autoresearch` precedent suggests the host already supports
this. The work is mostly Helmsman state design.
