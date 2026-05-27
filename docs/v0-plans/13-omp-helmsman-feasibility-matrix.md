# OMP Helmsman Feasibility Matrix

Status: superseded OMP feasibility snapshot

Current authority: `../product-north-star.md` and `../native-core-tui-plan.md`.
This file is retained for OMP adapter/reference research only.

Legend:

- Green: OMP already supports this with a clear API or runtime behavior.
- Yellow-green: OMP supports most of it; Helmsman must design the adapter or
  policy carefully.
- Yellow: host capability exists, but deterministic plugin integration is not
  proven.
- Red: current host surface does not satisfy the product requirement without
  patching or changing the requirement.

| Product requirement | OMP support | Evidence | Feasibility | Required spike or patch |
| --- | --- | --- | --- | --- |
| Explicit Helmsman invocation | OMP slash commands can register `hm`; colon syntax becomes command args. | `slash-commands/helpers/parse.ts` maps `/foo:bar` to command `foo`, args `bar`. | Green | None. |
| `/hm:charting` as primary entry | One `hm` command can parse `charting` subcommand. | `parseSlashCommand`; extension `registerCommand`. | Green | Implement subcommand parser. |
| No proactive Helmsman recommendation | Plugin can stay inactive until command or explicit mode. | Extension commands and events are opt-in. | Green | Do not register intrusive input handlers for normal chat. |
| Normal OMP chat remains normal | OMP owns chat TUI, session, model, tools. | `extensions.md`; extension API is additive. | Green | Helmsman mode flag must be explicit. |
| Repeated Charting waves | Extension can persist state, ask questions, run research, and schedule follow-up work. | `appendEntry`, durable files, `sendMessage`, `agent_end`. | Yellow-green | Define state reducer and loop pacing. |
| Max 4 questions per bundle | Helmsman-owned policy. | OMP Ask accepts arbitrary `questions[]`; code does not enforce a max. | Green | Helmsman validator rejects bundles over 4. |
| Single-select question | OMP Ask supports single-select by default. | `tools/ask.ts` `multi` defaults false. | Green | None. |
| Multi-select question | OMP Ask supports checkbox multi-select. | `tools/ask.ts` multi branch. | Green | None. |
| Custom answer | OMP Ask always appends `Other (type your own)`. | `docs/tools/ask.md`; `tools/ask.ts`. | Green | None. |
| Recommended option | OMP Ask supports zero-based `recommended` and appends a marker in single select. | `tools/ask.ts` `addRecommendedSuffix`. | Green | Multi-select recommendation display must be checked. |
| Option title plus detailed description | Current Ask option schema only supports `{ label }`. | `docs/tools/ask.md`; `tools/ask.ts` `OptionItem`. | Red if using Ask only | Use `ctx.ui.custom` or patch Ask with `options[].description`. |
| Native question evidence | Ask returns structured `details`; custom UI must write its own evidence. | `AskToolDetails`; extension UI APIs. | Yellow | Define `native-question-evidence.jsonl` and verify rendered surface. |
| Question ledger | Helmsman-owned durable state. | No OMP blocker. | Green | Define `question-ledger.schema.json`. |
| Many question bundles over time | Extension can ask again in later turns. | Autoresearch-style continuation and commands. | Yellow-green | Pacing policy: ask vs research vs synthesize. |
| Research lanes declared during Charting | Helmsman-owned contract. | No OMP blocker. | Green | Define lane schema and readiness rules. |
| Parallel lane execution | OMP `task` runs subagents with `task.maxConcurrency`. | `docs/tools/task.md`; `task/index.ts`. | Yellow | Prove direct extension dispatch or patch host. |
| One lane equals one subagent task | OMP task accepts `tasks[]` with ids and assignments. | `docs/tools/task.md`; `task/types.ts`. | Green for runtime | Needs dispatch proof from extension. |
| Lane artifacts are durable documents | OMP writes `<id>.md`; Helmsman requires `.helmsman/.../research/<slug>.md`. | `docs/tools/task.md` artifact behavior. | Yellow-green | Require subagent assignment to write Helmsman path and validate file exists. |
| Chat-only lane completion invalid | Helmsman-owned validator. | OMP artifacts can be inspected. | Green | Implement lane artifact validator. |
| Subagent role definitions | OMP discovers markdown agents with frontmatter. | `docs/task-agent-discovery.md`; `task/discovery.ts`. | Green | Write Helmsman agent files. |
| Project-local role install | OMP primary project path is `.omp/agents`. | `task/discovery.ts`; `docs/task-agent-discovery.md`. | Green | `/hm:install` writes managed files. |
| Plugin-bundled default agents | OMP discovers plugin `agents/` dirs. | `task/discovery.ts`; `discovery/helpers.ts`. | Yellow-green | Confirm packaging shape in marketplace plugin. |
| `.agents/subagents` path | OMP task discovery does not use it as primary. | `task/discovery.ts` uses config dirs and plugin roots. | Yellow | Treat only as compatibility mirror. |
| Per-role model choice | OMP supports `modelRoles`, model resolver, and agent model overrides. | `docs/models.md`; `settings-schema.ts`; `model-resolver.ts`. | Yellow-green | Define Helmsman role registry and map to OMP settings. |
| Per-role thinking level | Model selectors support thinking suffix; extension can set current thinking level. | `docs/models.md`; `agent-session.ts`; `extensions/types.ts`. | Yellow-green | Validate allowed levels per selected model. |
| Fast mode preference | OMP has service tier / processing priority settings. | `settings-schema.ts`; `agent-session.ts` fast-mode methods. | Yellow-green | Map Helmsman role `fast` preference to provider-specific OMP setting. |
| Provider/auth reuse | OMP owns model registry and auth. | `modelRegistry`, auth docs, model APIs. | Green | Helmsman must not store provider secrets. |
| Board file as Autopilot authority | Helmsman-owned state file. | OMP can read files and inject messages. | Green | Define `board.schema.json` and reducer. |
| Board injected every loop | `before_agent_start` can replace or augment system prompt. | `autoresearch/index.ts`; extension events. | Yellow-green | Build Board projection prompt. |
| Autopilot continuation | `sendMessage(... nextTurn, triggerTurn)` has precedent in Autoresearch. | `autoresearch/index.ts`; `agent-session.ts`. | Yellow-green | Idempotency and stop conditions. |
| Stop on route-changing question | Helmsman-owned loop policy plus Ask UI. | OMP supports question UI and abort. | Yellow-green | Define stop condition classifier. |
| Drift blocking before tool call | Extension wrapper can block `tool_call`. | `extensions/wrapper.ts`; `types.ts`. | Green | Define allowed-actions policy. |
| Post-tool result mutation or marking | `tool_result` can modify content/details/isError. | `extensions/wrapper.ts`. | Green | Define drift result format. |
| Verify inside Autopilot loop | Helmsman-owned Board/verification matrix. | OMP does not block this. | Green | Merge verify gates into Board reducer. |
| Compaction survival | OMP exposes compaction events; Helmsman files remain authoritative. | `compaction.md`; `agent-session.ts`. | Yellow-green | Define compact projection and rehydrate behavior. |
| Session resume | OMP has session lifecycle events and session manager. | `extensions/types.ts`; `session-manager.ts`. | Yellow-green | Define OMP-session-to-Helmsman-session resolver. |
| Human-readable Manifest | Helmsman can render from machine SSOT. | No OMP blocker. | Green | Define renderer and status command. |
| Machine Manifest SSOT | Helmsman-owned JSON/events. | No OMP blocker. | Green | Define schema and reducer. |
| Scorecard/rubric | Helmsman-owned artifact. | No OMP blocker. | Green | Define scorecard schema. |
| Strict Route Lock | Helmsman-owned gate. | OMP Ask/task/tool hooks support evidence gathering. | Yellow-green | Implement lock validator. |
| LSP reuse | OMP already has LSP tool. | `docs/tools/lsp.md`. | Green | Inherit. |
| MCP reuse | OMP already has MCP config/runtime. | `docs/mcp-config.md`; task docs note parent MCP reuse. | Green | Inherit. |
| Hooks and extensions reuse | OMP extension event surface is rich. | `docs/extensions.md`; `docs/hooks.md`. | Green | Use extension events first. |
| System prompt reuse | OMP builds base system prompt; extension can inject prompt on `before_agent_start`. | `agent-session.ts`; `extensions/types.ts`. | Yellow-green | Avoid replacing base prompt unless necessary. |
| Compact/reduce context | OMP compaction exists; Helmsman state should not depend on chat history. | `docs/compaction.md`. | Yellow-green | File authority plus projection summary. |
| Install doctor | OMP plugin can expose `/hm:doctor`; this repo currently has no Helmsman CLI. | Local check: no `helmsman` binary in reboot workspace. | Yellow | Build plugin doctor after architecture proof. |

## Feasibility Verdict

The OMP plugin path should continue.

It is not a vague "use OMP for inspiration" plan. The host already contains
most of the runtime Helmsman would otherwise have to build badly:

- TUI
- provider/auth registry
- model and thinking controls
- task subagents
- plugin loading
- session persistence
- compaction
- MCP/LSP/tool ecosystem
- extension events around prompt, tool, and session lifecycle

But the path is not closed until three hard spikes pass.

## Hard Spikes Before Implementation

### 1. Direct Task Dispatch

If a Helmsman extension cannot programmatically dispatch OMP `task`, we need a
minimal OMP patch. Model-mediated task calls are acceptable only as a temporary
proof, because research lanes are core product behavior and must be
deterministic.

### 2. Rich Question Bundle UI

If OMP Ask remains label-only, Helmsman needs either a custom `ctx.ui.custom`
renderer or an OMP Ask patch. Charting cannot be reduced to plain prose
questions because the whole product depends on repeated, inspectable,
recommended-choice question bundles.

### 3. Autopilot Loop Safety

The Autoresearch precedent proves the continuation mechanism is likely viable,
but Helmsman needs stricter loop rules:

- no duplicate loop turns
- no continuation after user interruption
- no action before fresh Board read
- stop on open route-changing question
- stop on drift
- stop on verification failure that needs user authority

## Product Decision

Proceed as OMP plugin-first.

Do not fork OMP. Do not rebuild the TUI. Do not start from a blank CLI.

If a blocker appears, patch OMP narrowly around the missing orchestration
primitive while continuing to reuse the host runtime.
