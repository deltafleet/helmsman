# Autopilot Execute Stage

Use only after plan scope is approved and audit permits execution.

## Inputs

- `plan.md`
- `worker-packets.md` when delegation is used
- `audit.md`
- relevant source files

## Output

Write `execution-report.md`.

## Contract

Execution changes only the approved write scope. Workers may not expand scope, rewrite route decisions, or treat tests as final completion.

## Execution Strategy

Before dispatch or edits, confirm the plan strategy:

- `inline`: lead worker edits directly.
- `serial-workers`: launch or simulate one packet at a time, integrate, then verify before the next packet.
- `parallel-workers`: run only after the Parallel Safety Check below.
- `parked`: write why execution is stopped and hand back to the user or the owning stage.

## Parallel Safety Check

For `parallel-workers`:

1. Build a file-to-work-item map from allowed write scope, expected artifacts, generated payloads, and test paths.
2. Treat any shared path as an overlap, including lock files, package manifests, generated plugin payloads, validation scripts, and docs edited by more than one worker.
3. If workers share one checkout and overlap exists, downgrade to `serial-workers`.
4. If isolated worker workspaces exist, record predicted overlaps and merge order before launch.
5. After return, compare actual changed paths against declared paths. If two workers touched the same path in a shared checkout, re-run the affected work serially from the current tree.

## Worker Lifecycle

Worker completion requires artifact evidence, not worker liveness or self-report:

1. Packet is launched, simulated, skipped, or blocked.
2. Required output artifact exists.
3. Changed paths are inside approved scope.
4. Commands are recorded with pass, fail, blocked, or skipped.
5. Deviations are empty or explicitly approved.
6. Integrated result has verification evidence ready for `helmsman-verify`.

`execution-report.md` must include:

```text
# Execution Report

## Approved Scope
## Execution Strategy
## Work Items Completed
## Worker Lifecycle
## Changed Paths
## Commands Run
## Integration And Collision Handling
## Worker Reports
## Deviations
## Evidence For Verification
## Next Step
```

## Exit Gate

- Every changed path is listed.
- Commands run are recorded with pass, fail, blocked, or skipped reason.
- Worker lifecycle entries show launched, simulated, skipped, or blocked.
- Collision handling is explicit even when there were no collisions.
- Deviations are empty or explicitly approved.
- Handoff goes to `helmsman-verify`, not final completion.
