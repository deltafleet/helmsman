# Reference Models

Status: current reference map

Helmsman should not reinvent every part of the modern terminal coding-agent stack.

The goal is to learn from open-source tools, adopt proven patterns, and avoid
copying product centers that do not match Helmsman's route-governed autonomy.
References do not decide the product boundary. Helmsman Core authority does.

## Pi Runtime Stack

Primary packages:

- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- `@earendil-works/pi-tui`

Useful patterns and surfaces:

- programmatic agent sessions through the SDK
- session runtime and session manager abstractions
- settings/resource loading for project and user context
- provider/model/auth access through the Pi ecosystem
- terminal UI components, focus handling, overlays, and custom panes
- durable Pi-native session history and event streams
- extension and custom tool surfaces

What Helmsman should borrow directly:

- in-process AgentSession execution for role runners
- Pi TUI primitives for the Workbench and question forms
- Pi settings/resource loading as runtime substrate
- Pi event streams as operation evidence
- Pi session files as evidence links and replay inputs

What Helmsman must not copy directly:

- treating Pi chat/session history as the Manifest
- letting a Pi tool or model response advance Helmsman phase state
- turning Helmsman into a thin Pi chat skin
- relying on package-provided form UX unless route-effect metadata and user
  evidence survive Helmsman's authority contract

Pi is the implementation substrate, not just a reference model. Helmsman Core
still owns Charting, Manifest, Board, gates, Route Lock, and Autopilot legality.

## Question UI Package Candidate

Package: `@juicesharp/rpiv-ask-user-question`

Useful patterns:

- structured question arrays
- bounded options
- option descriptions
- optional previews
- multi-select
- free-text fallback
- answer details
- cancellation
- per-option notes
- submit review surface

What Helmsman should borrow:

- form ergonomics for question bundles
- option descriptions and review-before-submit behavior
- free-form override mechanics
- headless-friendly answer structures where available

What Helmsman must add or preserve:

- stable `questionId` and `bundleId`
- question category such as aperture, decision, amendment, verification, or stop
- recommended option id and recommendation reason
- route-effect metadata
- authority boundary metadata
- evidence reference proving the user saw the full question surface
- max four questions per bundle
- two to four options per question
- Core validation before Manifest mutation

If the package cannot preserve these contracts, Helmsman should patch, wrap, or
vendor a narrow adapter after review. It must not silently drop route authority
metadata for a nicer form surface.

Current decision: `docs/question-ui-adapter-decision.md` makes a Core-owned Pi
TUI renderer the default route-authority surface. This package remains a UX
reference and optional wrapper/vendor candidate until stable ids, route effects,
full rendered evidence, and headless behavior are proven.

## OMP / Oh My Pi

Repository: `https://github.com/can1357/oh-my-pi`

Useful patterns:

- chat-first terminal coding-agent experience
- TUI engine separated from agent/session semantics
- model/provider registry independent from the TUI renderer
- provider auth flows, including OAuth/API-key paths
- role-like model selection for different purposes
- skill and agent discovery across common project/user directories
- model selector and login flows inside the TUI
- long-running session ergonomics

What Helmsman should borrow as reference or secondary adapter material:

- split renderer mechanics from workflow semantics
- keep provider/auth/model registry outside UI components
- support custom models and provider discovery
- expose model role selection through TUI commands
- make skills and agents discoverable and inspectable

What Helmsman should not copy directly:

- OMP as the primary product boundary
- generic coding-agent loop as the whole product identity
- every provider feature before Charting/Autopilot contracts work
- broad extension surface before core route authority is stable

## OpenCode

Repository: `https://github.com/anomalyco/opencode`

Useful patterns:

- polished terminal coding-agent UX
- normal chat-first usage
- plan/build style mode separation
- provider and model configuration
- agent definitions with model/tool/permission choices
- permission handling and practical developer workflow ergonomics

What Helmsman should borrow:

- chat-first default experience
- mode transition ergonomics
- practical provider configuration style
- agent/persona definitions tied to tools and permissions
- strong baseline coding-agent features before specialized workflow UX

What Helmsman should not copy directly:

- treating planning as enough for long-running autonomy
- allowing a generic session to become the source of truth for a large goal

## Hermes Agent

Repository: `https://github.com/NousResearch/hermes-agent`

Useful patterns:

- runtime configuration as an explicit product surface
- provider/model/profile configuration
- gateway/runtime separation
- environment-driven deployment and operation
- memory/context/runtime knobs exposed through config

What Helmsman should borrow:

- explicit config profiles
- provider/model/runtime settings as first-class configuration
- clear separation between runtime config and UI
- deployment-friendly environment/config handling

What Helmsman should not copy directly:

- making runtime infrastructure the user-facing center
- hiding product workflow behind low-level config complexity

## DeepSeek-Style TUIs

Reference class: DeepSeek-focused terminal coding agents and TUI wrappers.

Initial candidate repositories to inspect before borrowing any concrete pattern:

- `https://github.com/Hmbown/CodeWhale`
- `https://github.com/esengine/DeepSeek-Reasonix`
- `https://github.com/itmisx/deepx-code`
- `https://github.com/DeepSeekTUI/DeepSeek-TUI`

Useful patterns:

- model-specific routing for fast vs reasoning models
- visible cost/performance tradeoffs
- explicit model selection for coding, reasoning, and review
- lightweight terminal-first operation

What Helmsman should borrow:

- fast/deep mode routing where the provider supports it
- reasoning model assignment for skeptical Charting and audit roles
- cheap/fast model assignment for broad research or low-risk edits

What Helmsman should not copy directly:

- a provider-specific product identity
- model branding as the core UX

## Codex

Reference class: OpenAI Codex CLI and Codex app.

Useful patterns:

- strong coding-agent baseline
- OAuth/session path for authenticated execution
- goal-like long-running operation
- sandbox/approval model
- local workspace operation

What Helmsman should borrow:

- authenticated execution adapter path
- high-quality code editing baseline
- approval/sandbox discipline

What Helmsman should not copy directly:

- depending on Codex as the whole workflow authority
- treating chat/session state as the durable Manifest

## Reference Pattern Summary

```text
OMP
  provider registry, TUI engine split, model roles, skills, adapter/reference candidate

Pi Runtime Stack
  in-process agent sessions, session runtime, settings/resources, TUI primitives, event evidence

Question UI Package
  structured form ergonomics wrapped by Helmsman authority rules

OpenCode
  chat-first TUI, mode ergonomics, agent/provider config

Hermes Agent
  explicit runtime/profile config and deployment knobs

DeepSeek-style TUIs
  fast/reasoning routing and model-specific cost/performance choices

Codex
  execution quality, OAuth/session path, sandbox discipline
```

## Helmsman-Specific Synthesis

Helmsman should combine these references into a different product center:

```text
chat-first coding agent baseline
+ role-based provider/model/thinking registry
+ Charting mode as Manifest compiler
+ Autopilot mode as Manifest-aware execution
+ built-in skills and agent definitions
+ Core-owned protocol state
+ Pi runtime and TUI substrate
+ external CLI adapters where useful
```

The key constraint:

```text
Do not let the chat session become the source of truth.
The compiled Manifest, events, artifacts, and gates are the source of truth.
```

## Initial Role Configuration Contract

Helmsman role configuration should support this shape:

```yaml
roles:
  <role-id>:
    provider: <provider-id>
    model: <model-id>
    api: <api-shape>
    auth: oauth | api_key | none | inherited
    thinking: off | minimal | low | medium | high | xhigh
    mode: auto | fast | deep
    fallback: <role-id or provider/model>
    tools:
      read: true
      write: true
      shell: true
      web: false
    budget:
      max_turns: 20
      max_cost_usd: 5
    concurrency:
      class: lead | researcher | worker | auditor
      max_parallel: 1
```

This schema should remain provider-neutral. Provider-specific extensions can be nested later.

## Reference Evaluation Rules

When studying a reference project, record four things:

1. What it proves.
2. What Helmsman should borrow.
3. What Helmsman should avoid.
4. Which Helmsman product contract it strengthens.

Do not collect references as inspiration only. Each reference must either improve the coding-agent baseline, the role/model registry, Charting, Autopilot, or skill/agent definitions.
