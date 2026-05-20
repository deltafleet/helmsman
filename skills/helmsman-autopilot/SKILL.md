---
name: helmsman-autopilot
description: Use after Charting locks route and evidence to run strategy sampling, blueprinting, hardening, audit, worker coordination, execution, and repair through artifact gates.
---

# helmsman-autopilot

Use this when the route is locked enough to plan or execute. If route or evidence is missing, return to `helmsman-charting`.

## Version Notice

On first entry to this Helmsman skill in a conversation, the lead agent should run `helmsman doctor` as a read-only check before stage work, unless another Helmsman skill already ran it in the same conversation. If it reports `Update available: yes`, notify the user with the installed version, latest npm version, and `helmsman update`. Do not run `helmsman update` without explicit user approval. If the command is unavailable or npm lookup fails, continue the workflow.

Autopilot should feel like pressure, not a loose planning note. At entry, name the concrete mission, the internal stage, the stage artifact to write now, and the gate that would force a return to Charting, Blueprint, or Repair.

## Inputs

Read:

- `route-card.md`
- `decision-log.md`
- `research-index.md`
- `research/*.md`
- `evidence/*.md`
- existing `worker-packets.md`
- relevant product files

## Contract

Update `contract.md`:

```text
Current stage: autopilot
Autopilot stage: strategy|blueprint|hardening|audit|execute|repair
Allowed actions:
- write plan.md
- write strategy samples when independent approaches would reduce risk
- write a director blueprint when multiple approaches must be compiled
- run bounded hardening before risky audit or execution
- write or refine worker packets
- spawn workers only when explicitly authorized
- implement only after approved write scope is clear
- audit plan and implementation against route scenarios
Forbidden actions:
- expand scope silently
- use worker suggestions as user decisions
- mark done without verification
Required artifacts:
- plan.md
- strategy-samples.md when strategy is non-trivial
- director-blueprint.md when multiple approaches must be compiled
- hardening.md when the route touches shared contracts or high-risk behavior
- worker-packets.md when delegation is used
- audit.md for risky plans
Exit gate:
- plan is implemented or explicitly parked, and verification is ready
Next owner:
- lead worker
```

## Stage Entry Packet

Before writing any Autopilot artifact, create a short packet in `contract.md` or the stage artifact:

```text
Mission:
Autopilot stage:
Route promise:
Approved write scope:
Current evidence:
Decision boundaries:
Stage artifact to write now:
Exit gate:
Return path if blocked:
```

This packet is the handhold for the next lead worker. If any field is vague, do not proceed to execution. Return to Charting for missing user decisions or evidence; return to Blueprint or Hardening for plan defects.

## Internal Spine

Autopilot is the public skill. The downstream work is split into internal stages:

| Stage | Read | Write | Gate |
| --- | --- | --- | --- |
| `strategy` | `route-card.md`, `decision-log.md`, `research-index.md`, `research/*.md`, `evidence/*.md` | `strategy-samples.md` | independent options are concrete or explicitly skipped as simple work |
| `blueprint` | route, evidence, strategy samples | `director-blueprint.md`, `plan.md` | work items name owners, exact scope, dependencies, evidence, and scenario links |
| `hardening` | full blueprint and plan | `hardening.md` | decision is `lock`, `continue`, or `revise` with cross-section findings |
| `audit` | route, evidence, blueprint, hardening | `audit.md` | verdict is `revise` or `proceed` |
| `execute` | approved plan and worker packets | `execution-report.md` | every changed path and verification command is recorded |
| `repair` | failed audit, execution, or verification evidence | updated plan or `repair.md` | repair scope is explicit and returns to the right stage |

Read the matching file under `phases/` before doing that stage. Use the matching role file under `roles/` when spawning or simulating a specialist.

The role files are sidecar instructions, not registered Codex custom agents. When spawning is authorized, pass the relevant role file content into the available agent tooling. When spawning is not authorized or unavailable, use the role file to simulate the specialist pass in the lead context and record that choice in the artifact.

Internal stages are not separate public skills. Do not tell the user to invoke `$helmsman-blueprint` or `$helmsman-audit`; keep the user-facing handoff at `$helmsman-autopilot`.

Autopilot may skip a stage only when the skip is explicit in the current artifact and justified against the route risk. Silent skipping is scope drift.

## Blueprint

`plan.md` must include:

```text
# Plan

## Route Summary
## Execution Strategy
## Work Items
## Dependencies
## Allowed Write Scope
## Worker Assignments
## Verification Scenarios
## Risks And Rollback
```

Each work item must be explicit enough that a worker cannot invent scope:

```text
## Work Item: <id>

Owner:
Allowed write scope:
Inputs:
Exact changes:
Expected evidence:
Dependency:
Rollback:
Verification scenario links:
```

Keep tasks atomic enough for ownership, but not so small that the route disappears.

`Execution Strategy` must name one of:

- `inline`: the lead worker implements directly because the work is small or tightly coupled.
- `serial-workers`: workers are useful, but dependencies or shared files require one-at-a-time integration.
- `parallel-workers`: independent packets can run at the same time after the Parallel Safety Check.
- `parked`: execution is intentionally stopped before source edits.

The required artifact line is `Strategy: inline|serial-workers|parallel-workers|parked`.

If the strategy is `parallel-workers`, the plan must include a file-to-work-item map and the expected merge or integration order. If any two work items touch the same path and no isolated worker workspace is available, downgrade to `serial-workers`.

## Worker Coordination

Use workers only when the split is materially useful:

- independent research or implementation lanes
- adversarial review
- large file-scope separation
- verification that can run in parallel

Every worker gets a packet with required output artifacts and forbidden actions. Workers do not own user decisions, scope expansion, or final completion.

Worker lifecycle is part of the phase gate:

1. Write or refresh `worker-packets.md` before dispatch.
2. Mark which packet is launched, simulated, skipped, or blocked in `execution-report.md`.
3. Inspect each worker artifact against its packet; worker self-report or process exit is not enough.
4. Record changed paths, commands run, skipped commands, and deviations.
5. Integrate worker output only inside the approved write scope.
6. Re-run the relevant verification after integration, then hand off to `helmsman-verify`.

When spawning is authorized, prefer concrete worker instructions:

```text
You are not alone in the codebase. Do not revert edits made by others. Own only:
<paths or artifact>
Return changed paths and verification evidence.
```

## Parallel Safety Check

Before parallel workers:

1. Build a file-to-work-item map from every `Allowed write scope`, expected output artifact, and test path.
2. Check for overlaps. Shared docs, generated payloads, lock files, and validator files count as overlaps.
3. If overlap exists and workers share a checkout, use `serial-workers` or split the scope further.
4. If isolated worker workspaces are available, record the predicted overlap and integration order in the plan.
5. After workers return, compare actual changed paths against the declared map. If two workers changed the same path in a shared checkout, treat the path as unsafe and re-run the affected work serially from the current tree.

The check is mechanical. It does not decide that parallelism is useful; the lead worker still decides whether parallelism reduces risk or merely adds ceremony.

## Audit

Before risky implementation, write `audit.md`:

```text
# Audit

## Plan Risks
## Missing Evidence
## Dependency Problems
## Scope Drift Risks
## Verification Gaps
## Verdict
Verdict: revise|proceed
Reason:
Required fixes before proceed:
```

If `Verdict: revise`, update the plan before execution. If the verdict is not exactly `revise` or `proceed`, the audit is not a gate.

## Execution

Before editing product/source files:

- confirm user approval if scope changed
- confirm allowed write scope
- check the working tree for unrelated user changes
- keep edits inside the plan
- run the Parallel Safety Check when any worker may edit in parallel
- discover tests for every behavior-bearing file before marking a work item done

`execution-report.md` must distinguish:

- work item status
- worker lifecycle status
- changed paths
- commands run and their result
- integration or collision handling
- deviations from plan
- evidence prepared for `helmsman-verify`

After execution, do not stop at tests. Tests are evidence for verification, not final completion. Hand off to `helmsman-verify`.

## Failure Routing

Route failures by owner:

- user-owned scope or product decision missing: return to `helmsman-charting`.
- missing or weak evidence: return to `helmsman-charting`.
- plan ownership, dependency, or scenario coverage defect: return to `blueprint` or `hardening`.
- audit verdict `revise`: revise the plan before execution.
- implementation defect inside approved scope: return to `execute` through `repair`.
- verification failure after implementation: write `repair.md` and return to the narrowest stage named by the failed scenario.

Do not overwrite failed artifacts. A repair loop appends evidence and narrows scope; it does not erase the failed run.

## Exit

Autopilot exits when:

- planned work is complete or explicitly parked
- worker artifacts are present when used
- audit findings are resolved or accepted
- verification has a concrete artifact path to write

Update `map.json` with `nextSkill: "helmsman-verify"`.
