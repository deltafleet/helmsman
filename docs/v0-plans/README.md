# Helmsman V0 OMP Plugin Study

Status: superseded OMP plugin-first study

This directory records the previous OMP plugin-first plan.

It is retained as host research and implementation evidence. It is not the
current product authority. Current authority lives in:

```text
docs/product-north-star.md
docs/native-core-tui-plan.md
docs/tui-user-scenarios.md
```

The useful conclusion from this directory is not "build Helmsman as an OMP
plugin." The useful conclusion is:

```text
Borrow host infrastructure where it strengthens Helmsman,
but keep route authority in Helmsman Core.
```

OMP remains a reference and adapter candidate for terminal UI, provider/auth,
model registry, tools, session runtime, subagent execution, extension loading,
hooks, slash commands, MCP, LSP, and baseline coding-agent behavior.

## Still Valid Product Requirements

- Helmsman is explicitly invoked.
- Primary native entrypoint is `/charting`; host integrations may expose `/hm:charting`.
- `charting` is the mode name. Do not shorten it to `chart` in user-facing command names.
- Charting is a repeated loop, not one question pass and one research pass.
- Charting should ask as many questions as needed to understand user intent.
- One question bundle contains at most 4 questions, but there can be many bundles across many waves.
- Agents can fill in implementation detail once intent is clear. User questions should focus on intent, taste, constraints, boundaries, risk tolerance, success criteria, and authority.
- Research lanes are parallel by default. Declared active lanes are dispatched together through adapters/subagents.
- Every research lane writes a document artifact. No lane is considered complete from chat text alone.
- The Manifest is machine source of truth and must be translatable into a human-readable contract.
- The Board is the live situation projection Autopilot reads before every loop.
- Autopilot uses adapters as executors while Helmsman owns loop policy, board reads, drift checks, and gates.
- There is no MVP downgrade path in these plans. The target is the complete product, implemented through proof gates.

## Archived Plan Set

- `00-omp-plugin-product-contract.md`: old product boundary and authority split between OMP and Helmsman.
- `01-command-surface.md`: slash command namespace, naming, and explicit invocation model.
- `02-question-first-charting-loop.md`: repeated Charting waves with many intent questions.
- `03-manifest-board-state.md`: machine Manifest, generated human contract, Board, and event state.
- `04-research-lanes-and-subagents.md`: parallel lane execution through OMP task subagents.
- `05-agent-installation-and-role-registry.md`: `.omp/agents` installer and purpose-specific model settings.
- `06-autopilot-board-loop.md`: OMP executor with Helmsman board-governed loop control.
- `07-omp-runtime-reuse-map.md`: concrete OMP surfaces to reuse instead of rebuilding.
- `08-proof-gates.md`: proof gates required before implementation can be called closed.
- `09-user-scenario.md`: end-to-end OMP plugin user flow.
- `10-open-contracts-to-close.md`: remaining contract gaps that must be closed before implementation.
- `11-omp-host-study-plan.md`: required OMP docs/code study lanes before implementation.
- `12-omp-code-integration-map.md`: concrete OMP code surfaces to reuse, patch, or avoid.
- `13-omp-helmsman-feasibility-matrix.md`: product requirement to OMP support matrix.

## Reference Sources

The local OMP clone is the primary implementation reference:

```text
references/oh-my-pi/docs/skills/authoring-extensions.md
references/oh-my-pi/docs/tools/ask.md
references/oh-my-pi/docs/tools/task.md
references/oh-my-pi/docs/task-agent-discovery.md
references/oh-my-pi/docs/slash-command-internals.md
references/oh-my-pi/docs/hooks.md
references/oh-my-pi/docs/extension-loading.md
```

The archived Helmsman desktop README remains the philosophy reference:

```text
/Users/moonsunkim/Documents/deltafleet/projects/helmsman-desktop/README.ko.md
```
