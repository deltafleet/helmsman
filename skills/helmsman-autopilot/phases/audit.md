# Autopilot Audit Stage

Use before risky execution or after a plan revision.

## Inputs

- `route-card.md`
- `decision-log.md`
- `research-index.md`
- `research/*.md`
- `evidence/*.md`
- `director-blueprint.md`
- `plan.md`
- `hardening.md` when present

## Output

Write `audit.md`.

## Contract

Audit is adversarial. It does not implement. It attacks the accepted plan against the route promise, evidence, ownership, dependencies, and verification scenarios.

`audit.md` must include:

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

## Exit Gate

- `Verdict: proceed` unlocks execution only inside the approved write scope.
- `Verdict: revise` returns to Blueprint or Hardening with explicit required fixes.
