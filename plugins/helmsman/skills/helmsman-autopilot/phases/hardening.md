# Autopilot Hardening Stage

Use before audit when the plan touches shared contracts, cross-file behavior, user-visible flows, or high-risk product judgment.

## Inputs

- `route-card.md`
- `research-index.md`
- `research/*.md`
- `director-blueprint.md`
- `plan.md`
- current source files or artifacts named by the plan

## Output

Write `hardening.md`.

## Contract

Hardening is a bounded whole-plan reread. It looks for failures between route, evidence, ownership, dependencies, and verification scenarios.

`hardening.md` must include:

```text
# Hardening

## Round
## Cross-Section Findings
## Ownership Problems
## Dependency Problems
## Scenario Coverage Problems
## Required Plan Changes
## Decision
Decision: lock|continue|revise
Reason:
```

## Exit Gate

- `Decision: lock` means audit can proceed.
- `Decision: continue` means another bounded hardening pass is needed.
- `Decision: revise` means return to Blueprint before audit.
