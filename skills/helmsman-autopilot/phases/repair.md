# Autopilot Repair Stage

Use when audit, execution, or verification fails.

## Inputs

- failed `audit.md`, `execution-report.md`, or `verification.md`
- `route-card.md`
- `research-index.md`
- `research/*.md`
- `plan.md`
- changed files or artifacts

## Output

Write or update `repair.md`, then patch the affected plan or artifact.

## Contract

Repair is scoped. It must not erase failed evidence or silently change the route promise.

`repair.md` must include:

```text
# Repair

## Failure Source
## Failed Scenario Or Gate
## Root Cause
## Allowed Repair Scope
## Plan Changes
## Verification Required
## Return Stage
```

## Exit Gate

- The repair scope is narrower than or equal to the approved route.
- User-owned route changes return to Charting.
- Plan defects return to Blueprint or Hardening.
- Implementation defects return to Execute.
