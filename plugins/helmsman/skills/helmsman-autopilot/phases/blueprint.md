# Autopilot Blueprint Stage

Use after strategy has converged enough to compile one executable route.

## Inputs

- `route-card.md`
- `decision-log.md`
- `research-index.md`
- `research/*.md`
- `evidence/*.md`
- `strategy-samples.md` when present
- relevant source files

## Outputs

- `director-blueprint.md`
- `plan.md`

## Contract

The Director compiles one plan. Implementors should not infer architecture, write scope, dependencies, or verification criteria.

`director-blueprint.md` must include:

```text
# Director Blueprint

## Accepted Direction
## Rejected Directions
## File And Artifact Ownership
## Dependency Graph
## Plan Compilation Notes
## Scenario Coverage
## Open Risks
```

## Exit Gate

- `plan.md` names an `Execution Strategy` of `inline`, `serial-workers`, `parallel-workers`, or `parked`.
- `parallel-workers` plans include a file-to-work-item map and integration order.
- Every work item in `plan.md` has owner, exact scope, inputs, exact changes, expected evidence, dependency, rollback, and scenario links.
- Rejected directions are recorded when they shaped the plan.
- The dependency graph is acyclic or the blocked dependency is explicit.
