---
name: helmsman
description: Route-governed agent workflow harness for Charting-owned research, Autopilot coordination, verification, and closeout memory through Codex skills and durable artifacts.
---

# helmsman

Helmsman is a route-governed autonomy protocol delivered through a Helmsman protocol workspace.

Default operating model:

```text
Lead agent runs the workflow through skills.
Artifacts hold durable state.
Autopilot coordinates strategy, blueprinting, audit, execution, and repair.
Workers produce bounded artifacts.
The user owns decisions.
Helpers are read-only or advisory unless explicitly approved.
```

## Version Notice

On the first Helmsman skill entry in a conversation, run a read-only local install check before stage work:

```bash session=skip
helmsman doctor
```

If it reports `Update available: yes`, tell the user the installed version, the latest npm version, and the exact command `helmsman update`. Do not run `helmsman update` unless the user explicitly asks for an update.

If `helmsman doctor` is unavailable, times out, or cannot reach npm, do not block Charting or Autopilot. Continue the workflow and mention the skipped version notice only when it matters to the user's request.

## Route

Pick the narrowest sub-skill that matches the next real step:

- `skills/helmsman-charting/SKILL.md`: run Aperture Bundles, aim and execute research lanes, record decisions, and lock the route.
- `skills/helmsman-autopilot/SKILL.md`: turn the locked route into strategy samples, a blueprint, hardening, audit, worker packets, implementation coordination, and repair loops.
- `skills/helmsman-verify/SKILL.md`: compare the delivered result against the original route promise and scenarios, then write closeout memory when the workflow passes or parks.

If the split skills are installed as separate Codex skills, invoke the relevant one directly. If they are only present in this checkout, read the corresponding `SKILL.md` file before acting.

Research is not a public skill boundary. It is Charting-owned evidence lane work before Route Lock. Retro is not a user-invoked skill. It is closeout work the lead agent performs after verification passes or the workflow is intentionally parked.

## First Move

On first use, do not summarize Helmsman. Start operating it:

1. Identify the current stage from existing artifacts or create a new session workspace.
2. Name the narrowest next skill and why that skill owns the next move.
3. Write or refresh `contract.md` before doing substantive work.
4. Write the artifact that proves the stage moved forward.
5. Run the relevant validator or status renderer before claiming the stage is ready.

If the request is still ambiguous, the next skill is `helmsman-charting`. If the route is locked but execution strategy is weak, the next skill is `helmsman-autopilot`. If implementation is done but the original route promise has not been checked, the next skill is `helmsman-verify`.

## Workspace

Create or reuse a session directory under `.helmsman/sessions/`:

```text
.helmsman/sessions/<session-id>/
  contract.md
  map.json
  goal.md
  goal-charter.md
  stop-conditions.md
  verification-scenarios.md
  resume-report-template.md
  chart.md
  route-card.md
  worker-packets.md
  agents.json
  evidence/
  strategy-samples.md
  director-blueprint.md
  hardening.md
  plan.md
  audit.md
  execution-report.md
  repair.md
  verification.md
  retro.md
```

Use `.helmsman/HELMSMAN.md` only for promoted durable project memory. A top-level `HELMSMAN.md` is not a promoted-memory destination.

## Harness Rules

- Do not require a separate UI surface. Ask necessary questions in the native conversation unless the user asks for a separate question surface.
- Do not treat chat history, worker liveness, pane exit, or task-list appearance as completion.
- Do not implement before Charting records a route card with Aperture Bundles, Research Lane Contract, Decision Bundles, scope, non-goals, risks, success criteria, and verification scenarios.
- Do not spawn workers until their packet names the mission, allowed write scope, required artifact, done criteria, and forbidden actions.
- If user approval for subagents/workers is explicit, spawn workers through the available agent tooling. Otherwise write worker packets for the user or lead agent to launch.
- Before moving stages, run a gate check by rereading the current artifact set against the stage exit criteria.

## Drift Control

At each stage, keep `contract.md` current:

```text
Current stage:
Allowed actions:
Forbidden actions:
Required artifacts:
Exit gate:
Next owner:
```

If the lead agent or a worker acts outside the contract, stop and mark the stage blocked in `map.json` or the nearest status artifact. Continue only after the user approves the scope change or the artifact set is repaired.

## Helper Toolbelt

Helper scripts are a protocol toolbelt, not a workflow controller. Use them to scaffold, inspect, validate, render, package, or compile memory. Do not use helper output to advance stages, record user decisions, rank relevance, mark workers done, or claim completion.

When working from this repository checkout, validate the skill package and any serious session artifact set before moving on:

```bash session=skip
bun run check:helmsman
bun run verify:helmsman
bun run build:plugin
bun run verify:plugin
bun run validate:skill-session -- .helmsman/sessions/<session-id> --stage charting|research|autopilot|verify|retro
bun run render:skill-status -- .helmsman/sessions/<session-id>
bun run scaffold:skill-artifact -- .helmsman/sessions/<session-id> --artifact goal|goal-charter|stop-conditions|verification-scenarios|resume-report-template|route-card|plan|strategy-samples|director-blueprint|hardening|audit|execution-report|verification|retro
bun run fetch:skill-memory -- .helmsman/wiki --index
bun run fetch:skill-memory -- .helmsman/wiki --doc <relative-wiki-page.md>
bun run render:plugin-status
bun run compile:skill-memory -- .helmsman/sessions/<session-id>
bun run audit:removed-surfaces
```

For normal workflow operation, the most useful helpers are:

- `scaffold:skill-artifact -- --artifact goal|goal-charter|stop-conditions|verification-scenarios|resume-report-template` for preparing native goal documents.
- `validate:skill-session` for the current session artifact gate.
- `render:skill-status` for a read-only status projection.
- `scaffold:skill-artifact` for template creation only.
- `fetch:skill-memory` for explicitly selected wiki index or page reads.
- `compile:skill-memory` after verify closeout when reusable memory candidates exist.

Plugin packaging uses the generated `plugins/helmsman/` payload. Build and verify it from the repo, then install it only when a real local plugin entry should be written:

```bash session=skip
bun run build:plugin
bun run verify:plugin
bun run verify:version
bun run install:plugin -- --target-home
bun run verify:installed-plugin
bun run render:plugin-status
bun scripts/verify-plugin.mjs --plugin-dir "$HOME/plugins/helmsman" --compare-to plugins/helmsman
```

`build:plugin` writes `.codex-plugin/payload-manifest.json` with the managed payload file list, byte counts, and sha256 hashes. `install:plugin -- --target-home` is idempotent for a Helmsman-owned install; reserve `--force` for a conflicting or corrupted local plugin entry. `verify:plugin` validates that inventory before any installed-payload comparison. `verify:installed-plugin` also checks that the local marketplace entry resolves to the installed plugin directory.

The repository-level marketplace descriptor is `.agents/plugins/marketplace.json`. It points at `./plugins/helmsman` and is part of the verified distribution surface. The home-local marketplace entry written by `install:plugin -- --target-home` is an install target, not the source descriptor.

`verify:helmsman` is the local release gate, not a day-to-day phase command. It includes repo plugin verification, installed plugin drift verification, focused tests, typecheck, removed-surface audit, and diff check.

The Codex plugin payload installs Helmsman skills and their sidecars. It does not install Codex custom agents. Autopilot role files under `skills/helmsman-autopilot/roles/` are role pressure references for spawning or simulating specialists through the available agent tooling. Do not tell the user that those role files are registered Codex agents. A future custom-agent layer would need a separate companion installer, managed install manifest, stale-artifact cleanup, and verification.

## Release Guards

Public release rules live in `docs/release-guards.md`. The generated plugin payload carries the same guard reference beside this skill at `references/release-guards.md`. Helper commands in that reference run from the Helmsman source checkout, not from the installed plugin payload directory.

Before publishing, run the public release gate:

```bash session=skip
bun run check:helmsman
bun run verify:version
bun run verify:plugin
bun run verify:helmsman
npm pack --dry-run
```

To expose the root and split skills in another Codex skill directory, use the symlink installer:

```bash session=skip
bun run install:skills -- --target "${CODEX_HOME:-$HOME/.codex}/skills"
```

## Completion

Before claiming completion, produce or update:

- route-card coverage for the original request
- worker/evidence coverage for delegated work
- verification coverage against route scenarios
- closeout notes with reusable lessons
- a short audit listing unmet or weakly verified requirements
