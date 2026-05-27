# Autopilot Board Loop

Status: superseded OMP plugin-first study

Current authority: `../product-north-star.md` and `../native-core-tui-plan.md`.
This file is retained for OMP adapter/reference research only.

## Core Contract

Autopilot uses OMP as executor, but Helmsman owns direction.

```text
OMP executes.
Helmsman governs.
Board directs every loop.
```

Autopilot is not a static goal prompt. It is a loop that reads Board state before deciding what OMP should do next.

## Loop Shape

Every Autopilot loop must:

```text
1. Read board.json.
2. Read the locked Manifest projection needed for the active phase.
3. Check route lock, active phase, allowed scope, open risks, and next allowed actions.
4. Select role, model, thinking level, and active tool policy.
5. Inject Board projection into OMP context.
6. Let OMP execute the next bounded action.
7. Intercept tool calls for scope and drift checks.
8. Update evidence, verification state, events, and Board.
9. Decide continue, ask user, repair, verify, park, or complete.
```

If Board cannot be read, Autopilot stops. If Board and Manifest disagree, Autopilot stops.

## OMP Extension Mechanics

The OMP plugin path should use:

- slash command for `/hm:autopilot`
- `context` event to inject Board projection before LLM calls
- `tool_call` event to block forbidden or out-of-scope actions
- `tool_result` event to collect evidence and update state
- `turn_end` event to update Board and schedule or propose next step
- compaction events to preserve Manifest and Board context
- OMP role/model/tool controls where exposed

This is extension-orchestrated control. It does not require replacing the OMP internal agent loop at first.

## Board Projection

Autopilot should inject a compact Board projection, not the full Manifest every time:

```text
Route: locked
Phase: PH-02
Approved scope: packages/helmsman-plugin, .omp/agents
Forbidden: archive rewrite, provider auth changes
Next allowed action: implement installer dry-run
Open risks: R-004 plugin API cannot dispatch task directly
Verification: V-001 pending, V-002 blocked
Drift warnings: none
```

Full artifacts remain on disk and can be read when needed.

## Drift Control

Autopilot must stop or repair when:

- tool call is outside approved write scope
- implementation skips required phase artifact
- verification scenario has no evidence
- a new route-changing decision appears
- user intent conflicts with locked Manifest
- subagent result contradicts the plan
- compaction loses required context
- Board update fails

Drift should become a Board event, not just a chat warning.

## Verification Is Built In

Verification is not a separate everyday mode. Autopilot includes verification checks during phase execution and at closeout.

Each phase must track:

- acceptance criteria
- required evidence
- tests or manual checks
- reviewer or auditor pass
- unresolved risks

Closeout cannot be claimed until Board verification matrix is satisfied or explicitly parked.

## User Intervention

Autopilot asks the user when:

- a route-changing question appears
- scope must change
- a non-goal would be violated
- a risk exceeds threshold
- a tool action requires permission
- the Board is blocked

The user should see a form-style question where possible, not a vague prose paragraph.

## Known Spike

The plugin path must prove whether a Helmsman extension can reliably continue the loop and dispatch the needed OMP actions without forking OMP.

If extension APIs are insufficient, the next step is a minimal OMP patch. The patch should expose missing orchestration primitives, not fork the TUI or provider stack.
