# Agent Installation And Role Registry

Status: superseded OMP plugin-first study

Current authority: `../product-north-star.md` and `../native-core-tui-plan.md`.
This file is retained for OMP adapter/reference research only.

## OMP Agent Discovery

OMP task agents are markdown files with frontmatter. Current OMP discovery uses source-family order:

```text
.omp
.claude
.codex
.gemini
```

For OMP-native operation, Helmsman task agents should be installed project-locally under:

```text
<project>/.omp/agents/*.md
```

User-global installation may use:

```text
~/.omp/agent/agents/*.md
```

Do not treat `.agents/subagents` as the OMP primary path. That path may be useful for cross-tool compatibility later, but OMP task discovery does not make it the primary task-agent directory.

## Installer Requirement

The Helmsman plugin alone should not assume required task agents are already installed in the project. Provide an installer:

```text
/hm:install
```

and a CLI equivalent:

```text
helmsman install --target omp --scope project
helmsman install --target omp --scope user
```

The installer writes:

```text
.omp/agents/helmsman-charting-lead.md
.omp/agents/helmsman-question-designer.md
.omp/agents/helmsman-research-planner.md
.omp/agents/helmsman-researcher.md
.omp/agents/helmsman-synthesizer.md
.omp/agents/helmsman-skeptic.md
.omp/agents/helmsman-autopilot-director.md
.omp/agents/helmsman-implementor.md
.omp/agents/helmsman-auditor.md
.omp/agents/helmsman-verifier.md
```

The installer also writes:

```text
.helmsman/install-manifest.json
```

The install manifest records file paths, hashes, source version, install scope, and stale files removed.

## Required Agent Fields

Each OMP agent file should include:

```yaml
---
name: helmsman-researcher
description: Research a single Helmsman Charting lane and write a lane artifact.
tools: read, search, web_search, yield
model: inherited
thinkingLevel: medium
blocking: false
---
```

Exact fields should track OMP's current task-agent parser:

- `name`
- `description`
- body as system prompt
- optional `tools`
- optional `spawns`
- optional `model`
- optional `thinkingLevel`
- optional `output`
- optional `blocking`

## Role Registry

Agents define behavior. Roles define model and runtime preference.

Helmsman needs a purpose-specific role registry:

```yaml
roles:
  charting.question_designer:
    agent: helmsman-question-designer
    provider: anthropic
    model: claude-opus-4-6
    thinking: high
    mode: deep

  charting.researcher:
    agent: helmsman-researcher
    provider: openrouter
    model: sonar-deep-research
    thinking: medium
    mode: fast
    max_parallel: 6

  charting.skeptic:
    agent: helmsman-skeptic
    provider: deepseek
    model: deepseek-reasoner
    thinking: high
    mode: deep

  autopilot.implementor:
    agent: helmsman-implementor
    provider: openai-codex
    model: gpt-5.3-codex
    thinking: high
    mode: auto

  autopilot.auditor:
    agent: helmsman-auditor
    provider: anthropic
    model: claude-opus-4-6
    thinking: xhigh
    mode: deep
```

Required role settings:

- provider
- model
- thinking level
- fast/deep/auto mode when supported
- fallback role or model
- allowed tools
- write scope policy
- concurrency class
- cost or turn budget

## Model Control

OMP already owns provider and model configuration. Helmsman should integrate with OMP model settings instead of rebuilding auth.

Helmsman role resolution should produce:

```text
role -> OMP agent name -> provider/model/thinking/tool policy
```

If OMP exposes runtime methods for setting model, thinking level, or active tools, Helmsman uses them. If a setting is only available through config, Helmsman writes or validates the config and reports the required reload boundary.

## Verification

`/hm:doctor` must verify:

- OMP sees the required agents
- installed agent names match role registry names
- required roles are mapped
- missing provider auth is reported
- thinking levels are supported or downgraded explicitly
- fast/deep mode is supported or ignored with a recorded reason
- stale Helmsman agent files are removed or marked
