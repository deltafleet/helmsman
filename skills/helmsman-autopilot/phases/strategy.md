# Autopilot Strategy Stage

Use when the route is locked but the path is still strategically uncertain.

## Inputs

- `route-card.md`
- `decision-log.md`
- `evidence/*.md`
- relevant source files or product docs

## Output

Write `strategy-samples.md`.

## Contract

Strategy produces independent approaches under the same mission. It does not choose the final plan and it does not ask new user questions unless a user-owned decision is missing.

`strategy-samples.md` must include:

```text
# Strategy Samples

## Mission
## Shared Constraints
## Samples
### Sample S-001
Approach:
Strengths:
Weaknesses:
Risks:
Evidence used:
Decision impact:
## Convergence
## Open Decision Boundaries
```

## Exit Gate

- At least two samples exist for broad, high-risk, or ambiguous work.
- Every sample cites evidence or explicitly marks an assumption.
- User-owned decisions are listed under `Open Decision Boundaries` instead of being invented.
