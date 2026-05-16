# Helmsman Native Goal

This is the file to pass to the platform native goal command:

```text
/goal @.helmsman/goals/<goal-id>/goal.md
```

## Goal

Complete the Helmsman Goal Charter for this work.

## Binding Contract

This document and its sibling files are the execution contract for the native goal:

- `goal-charter.md`: route promise, autonomy boundary, and completion standard
- `route-card.md`: scope, risks, decisions, scenarios, and handoff
- `contract.md`: current operating rules and forbidden actions
- `verification-scenarios.md`: evidence required before completion can be claimed
- `stop-conditions.md`: conditions that require stopping instead of guessing
- `resume-report-template.md`: report shape to leave before any blocked stop

Do not replace, summarize, or reinterpret these files as a weaker goal. Follow them as written.

## Required Operating Mode

Use Helmsman skills to execute this goal:

- use `helmsman-charting` only if the attached goal contract is incomplete or contradictory
- use `helmsman-charting` for evidence-dependent decisions until the route is locked
- use `helmsman-autopilot` for strategy, blueprint, audit, execution, and repair
- use `helmsman-verify` before claiming completion
- write `retro.md` through the verify closeout path or leave `resume-report-template.md` before stopping

## Completion Rule

Do not claim completion until every verification scenario is either passing with evidence or explicitly blocked with a resume report.

## Stop Rule

If this goal conflicts with any sibling contract file, stop and report the conflict. If a required decision is outside the autonomy boundary, stop and leave a blocked resume packet instead of guessing.
