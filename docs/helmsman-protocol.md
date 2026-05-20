# Helmsman Protocol

Status: active redesign direction

This document defines the current Helmsman product path. The goal is to keep workflow authority in skills, artifacts, explicit user decisions, and bounded worker packets.

This file is the public product contract. It intentionally points to current repository assets only; private design history and dogfood notes are not part of the launch surface.

## Decision

Do not require a separate Helmsman UI surface as the default path.

Do split Helmsman into focused skills that a lead worker can call when the current situation requires them.

Do keep harnessing where it is cheap and reliable: artifact contracts, explicit stage gates, worker packet structure, allowed write scopes, verification scenarios, and closeout memory.

## Product Shape

```text
User
  owns final decisions and scope changes

Lead worker
  runs the current Helmsman skill
  asks native conversation Aperture and Decision Bundles
  updates artifacts
  decides when to call another Helmsman skill

Specialist workers
  are spawned only when useful
  receive bounded worker packets
  produce required artifacts

Artifacts
  hold durable workflow state
  make drift visible
  survive session restarts

Optional helpers
  may render summaries or validate artifacts
  do not own phase authority by default
```

## Skill Set

| Skill | Responsibility | Default output |
| --- | --- | --- |
| `helmsman-charting` | Always-on Aperture Bundles, Bundle Density Read, Research Lane Contract, parallel topic-bound research, Decision Bundles, route shaping, decision log, scope lock | `chart.md`, `route-card.md`, `research-index.md`, `research/*.md`, `contract.md`, `map.json` |
| `helmsman-autopilot` | Strategy sampling, blueprinting, hardening, audit loop, worker coordination, implementation control | `strategy-samples.md`, `director-blueprint.md`, `plan.md`, `audit.md`, updated `agents.json` |
| `helmsman-verify` | Scenario verification against the route promise plus closeout when pass or parked | `verification.md`, `retro.md`, promoted memory candidates |

The root `helmsman` skill is only a router and contract refresher.

Research is Charting-owned evidence lane work before Route Lock. Closeout is Verify-owned work after the delivery passes or the workflow parks.

## Artifact Workspace

Each serious workflow creates a session directory:

```text
.helmsman/sessions/<session-id>/
  contract.md
  map.json
  chart.md
  decision-log.md
  route-card.md
  research-index.md
  research/
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

`contract.md` is the immediate guardrail for the lead worker. It must state:

```text
Current stage:
Allowed actions:
Forbidden actions:
Required artifacts:
Exit gate:
Next owner:
```

`map.json` is the lightweight status source. It is a projection from artifacts, not workflow authority.

When `stage` is `autopilot`, `map.json` also names the internal stage:

```json
{
  "stage": "autopilot",
  "currentCheckpoint": "autopilot",
  "autopilotStage": "strategy|blueprint|hardening|audit|execute|repair"
}
```

`autopilotStage` is a status and validation aid. It is not a phase-advance authority.

## Native Goal Attachment Flow

Helmsman should not assume it can wrap a platform-native `/goal` command. The supported integration is to prepare the document that the user passes to the native goal.

For overnight or very long work, Charting can create a goal workspace:

```text
.helmsman/goals/<goal-id>/
  goal.md
  goal-charter.md
  route-card.md
  contract.md
  charting-loop.md
  question-bundles.md
  memory-scan.md
  research-index.md
  worker-packets.md
  research/
  verification-scenarios.md
  stop-conditions.md
  resume-report-template.md
```

The user invokes the platform goal with the generated entry document:

```text
/goal @.helmsman/goals/<goal-id>/goal.md
```

`goal.md` is the native goal entrypoint. It should not summarize the route details into a weaker prompt. It should bind the sibling files as the operating contract, require Helmsman skills, require verification against the scenarios before completion is claimed, and require a resume packet when blocked.

Native goal Charting uses the strict route-sharpening loop:

```text
Signal Read -> Aperture Question Bundle -> Scoped Memory Scan -> Research Lanes -> Synthesis -> Sharpness Check -> loop or Route Lock
```

The first Aperture Question Bundle creates the coordinates for memory lookup. Broad Memory Scan before that bundle is invalid. Scoped Memory Scan must happen before Research Lanes, and Research Lanes are only for stale, missing, or conflicting prior memory. A route cannot lock while Autopilot could reasonably execute a different destination from the same route card.

The source of truth split is:

- native goal: the platform-level long-running objective invoked with `@.helmsman/goals/<goal-id>/goal.md`
- sibling Helmsman documents: route, autonomy boundary, `charting-loop.md`, `question-bundles.md`, `memory-scan.md`, `research-index.md`, `worker-packets.md`, stop conditions, verification criteria, and resume format
- Helmsman skills: the operating discipline used to execute that attached contract

For Charting questions, `question-bundles.md` is durable state but native chat is the user decision surface. A bundle cannot be treated as asked, answered, lock-ready, or handoff-ready unless the bundle artifact records native question surface evidence covering all questions, options, recommendation reasons, tradeoffs, route effects, and free-form override language. Rendered or answered bundles must also cite `evidence/native-chat-transcript.jsonl#<message-id>` records. Validators compare those records against the question bundle, so artifact self-report alone is not sufficient proof.

If the native goal and attached charter conflict, the agent must stop and report the conflict instead of reconciling it silently.

## Validation Helper

The Helmsman path has a small deterministic validator:

```bash
bun run verify:helmsman
bun run validate:native-goal -- .helmsman/goals/<goal-id>
bun run validate:skill-session -- .helmsman/sessions/<session-id> --stage charting
bun run validate:skill-session -- .helmsman/sessions/<session-id> --stage research
bun run validate:skill-session -- .helmsman/sessions/<session-id> --stage autopilot
bun run validate:skill-session -- .helmsman/sessions/<session-id> --stage verify
bun run validate:skill-session -- .helmsman/sessions/<session-id> --stage retro
```

The validator checks the artifact contract, route-card coverage, source-backed research, worker packet fields, Autopilot internal-stage artifacts, plan sections, verification matrix, and retro sections. It is a gate over files, not a process owner.

`verify:helmsman` is the local release gate, not only a repo-only validator. It also runs `verify:installed-plugin`, so the home-local plugin must already exist and match `plugins/helmsman`. Use `verify:plugin` when the desired check is limited to the generated repository payload.

The split skills can be symlinked into a Codex skill directory with:

```bash
bun run install:skills -- --target "${CODEX_HOME:-$HOME/.codex}/skills"
```

## CLI Toolbelt

CLI helpers exist to reduce mechanical drift:

```bash
bun run scaffold:skill-artifact -- .helmsman/sessions/<session-id> --artifact director-blueprint
bun run validate:skill-session -- .helmsman/sessions/<session-id> --stage autopilot
bun run render:skill-status -- .helmsman/sessions/<session-id>
bun run build:plugin
bun run verify:plugin
bun run install:plugin -- --target-home
bun run verify:installed-plugin
bun scripts/verify-plugin.mjs --plugin-dir "$HOME/plugins/helmsman" --compare-to plugins/helmsman
bun run fetch:skill-memory -- .helmsman/wiki --index
bun run fetch:skill-memory -- .helmsman/wiki --doc concepts/<page>.md
bun run compile:skill-memory -- .helmsman/sessions/<session-id>
```

These helpers do not advance workflow state, select relevant memory, infer user decisions, or mark worker completion. The lead worker chooses what to read and what to do next.

The helper links the root `helmsman` skill plus each public `helmsman-*` split skill, so future workers can invoke the narrow skill directly.

The plugin build is generated from the same canonical skill files. It emits `plugins/helmsman/.codex-plugin/plugin.json` plus the root and split skill payloads. The repository-level marketplace descriptor at `.agents/plugins/marketplace.json` points at `./plugins/helmsman`, so the repo has a publishable plugin descriptor separate from any local install. Repository tests and audit scripts stay outside the plugin payload. The installer writes the home-local plugin and marketplace entry; it must not decide workflow state or acceptance.

## Codex Plugin Distribution Boundary

The current Codex plugin distribution is skill-native. It installs Helmsman's root skill, public split skills, and skill sidecars. It does not install Codex custom agents.

Autopilot role files under `skills/helmsman-autopilot/roles/` are pressure documents. They tell the lead worker how to spawn or simulate strategists, directors, auditors, and implementors when the available agent tooling supports delegation. They are not registered Codex custom agents and should not be described as such.

If Helmsman later needs installed Codex custom agents, that is a separate companion-installer product layer. It must have:

- a managed install manifest for skills, prompts, and agents it owns
- stale-artifact cleanup that cannot delete user-authored files
- drift verification between source assets and installed agent TOML files
- a clear split between native plugin skills and companion-installed agents

Until that layer exists, the honest product contract is: native plugin skills plus Charting and Autopilot role sidecars.

## Stage Gates

Charting can exit only when:

- the route card has scope, non-goals, success criteria, risks, and verification scenarios
- an Aperture Bundle is recorded before Research
- `Bundle Density Read` controls only the size and type of the first Aperture Bundle, never whether Aperture happens
- a Research Lane Contract names lanes to inspect and lanes to skip before Research starts
- Decision Bundles resolve user-owned choices after Research when evidence exposes them
- user decisions are recorded in `decision-log.md`
- open questions are either answered or explicitly deferred
- implementation has not started unless the user changed scope

Charting-owned research can exit only when:

- Parallel research is a first-class Charting contract, not an optional flourish after the lead agent has done the work locally.
- Codex and Claude execute the same host-neutral worker packets; host-specific launch syntax belongs in launch notes, not in the route authority.
- independent research lanes have one research worker packet each unless the route card records a concrete lead-only reason
- launchable research workers were spawned in parallel when the user authorized worker spawning and the host supported it, or the route records why spawning was blocked
- research-index.md accounts for every selected topic
- worker-packets.md records the parallel launch group, launch evidence, worker name, allowed write scope, required artifact, done criteria, and forbidden actions for each parallel lane
- every active topic has exactly one research/<slug>.md artifact or a recorded drop reason
- research files cite concrete sources, files, commands, or observed behavior
- unresolved uncertainty is visible in the route or plan

Autopilot can execute only when:

- `contract.md` and `map.json` agree on the internal `autopilotStage`
- the required internal-stage artifact exists for `strategy`, `blueprint`, `hardening`, `audit`, `execute`, or `repair`
- `plan.md` names an execution strategy: `inline`, `serial-workers`, `parallel-workers`, or `parked`
- `parallel-workers` plans include a file-to-work-item map, overlap check, and integration order
- worker packets define mission, write scope, required artifact, done criteria, and forbidden actions
- worker lifecycle is checked through required artifacts, changed paths, command evidence, and deviations, not worker liveness or self-report
- the plan names dependencies and verification scenarios
- the user has approved implementation scope when source edits are required

Verification can close only when:

- route scenarios are checked against real evidence
- failing or weak scenarios are listed
- tests are treated as evidence, not as completion by themselves

Verify-owned closeout can close only when:

- reusable lessons are separated from one-off transcript noise
- promoted memory candidates are concrete and future-actionable

## Worker Model

Workers are optional and situational.

If worker spawning is explicitly authorized, the lead worker may spawn specialist workers through the available agent tooling. If not, it writes spawn packets for the operator or later lead worker.

Research workers are topic-bound, not implementation-bound. Their normal write scope is one `research/<slug>.md` artifact, while the lead maintains `research-index.md`. The default cap is 6 active research lanes unless the user explicitly approves more. The point is not to minimize total model tokens; it is to spend many useful tokens in parallel and keep every token accountable to a route-changing question and durable artifact.

Every worker packet must include:

```text
Worker name:
Mission:
Context to read:
Allowed write scope:
Forbidden actions:
Required output artifact:
Done criteria:
Verification notes:
```

Worker completion means the required artifact exists and satisfies the packet. It does not mean the phase is complete.

Parallel worker execution requires a mechanical safety check. The lead worker maps every planned output, source path, generated payload, validation helper, and test path to a work item before dispatch. If two workers share a path in one checkout, the plan must switch to serial execution or split the scope further. If isolated worker workspaces are available, the predicted overlap and integration order must be recorded before launch. After worker return, actual changed paths are compared with the map; an unexpected shared-path edit is treated as a repair condition and re-run serially.

## What Stays From The Protocol Spine

Keep:

- route-first charting
- explicit decision boundaries
- parallel research, strategy, audit, and implementation when useful
- adversarial review before risky execution
- scenario verification
- durable memory
- dashboard-friendly artifact projection

Helmsman implementation confidence is judged by `verify:helmsman`, session artifact validation, and release packaging checks. Public release rules live in `docs/release-guards.md`.

## MVP

The first viable product is one real workflow completed through:

```text
helmsman-charting
  -> route-card.md
  -> Aperture Bundles
  -> Research Lane Contract
  -> research-index.md
  -> research/*.md
  -> Decision Bundles when research exposes user-owned choices
helmsman-autopilot
  -> strategy-samples.md
  -> director-blueprint.md
  -> hardening.md when needed
  -> audit.md
  -> worker-packets.md and plan.md
  -> execution-report.md
helmsman-verify
  -> verification.md
  -> retro.md
```

Success means the artifacts let a fresh lead worker resume without relying on the previous chat transcript.
