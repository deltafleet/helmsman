---
name: helmsman-verify
description: Use after implementation or analysis to verify the actual result against the route promise, scenarios, evidence, tests, and unresolved risks before completion is claimed.
---

# helmsman-verify

Use this before saying a Helmsman-driven workflow is complete.

## Version Notice

On first entry to this Helmsman skill in a conversation, the lead agent should run `helmsman doctor` as a read-only check before stage work, unless another Helmsman skill already ran it in the same conversation. If it reports `Update available: yes`, notify the user with the installed version, latest npm version, and `helmsman update`. Do not run `helmsman update` without explicit user approval. If the command is unavailable or npm lookup fails, continue the workflow.

## Inputs

Read:

- `route-card.md`
- `plan.md`
- `audit.md`
- `research-index.md` and `research/*.md` when Charting research was used
- worker evidence
- changed files or produced artifacts
- relevant command/test output

## Contract

Update `contract.md`:

```text
Current stage: verify
Allowed actions:
- inspect artifacts and changed files
- run verification commands
- compare results to route scenarios
- record failures and residual risk
Forbidden actions:
- treat tests as completion by themselves
- ignore scenario mismatch
- erase failed evidence
Required artifacts:
- verification.md
- retro.md when the workflow passes or is intentionally parked
Exit gate:
- every route scenario has pass/fail/blocked evidence
Next owner:
- lead worker for repair, or user/future lead worker after closeout
```

## Verification Matrix

Write `verification.md`:

```text
# Verification

## Route Promise
## Scenario Matrix
| Scenario ID | Route Scenario | Evidence | Result | Notes |
| --- | --- | --- | --- | --- |

## Commands Run
## Files Inspected
## Residual Risks
## Verdict
```

Every `Scenario ID` from `route-card.md` must appear in this matrix. Do not rewrite or drop a route scenario after implementation to make the result look cleaner.

Results must be one of:

- `pass`
- `fail`
- `blocked`
- `not-applicable`

## Rules

- If a scenario is user-visible, inspect the user-visible path where feasible.
- If tests pass but route criteria fail, verdict is fail.
- If verification cannot run, say what blocked it and what evidence is missing.
- If implementation touched shared contracts, include regression-oriented checks.

## Closeout

Retro is not a user-invoked skill. When verification passes, the lead agent closes the session inside `helmsman-verify` by writing `retro.md`.

Use this shape:

```text
# Retro

## Objective
## Final Outcome
## What Changed
## Verification Evidence
## Decisions That Mattered
## Reusable Lessons
## Promoted Memory Candidates
## Follow-Up Work
```

Keep lessons operational:

- symptom
- cause
- fix
- reuse trigger: the specific future situation where this lesson should change behavior

Only propose project memory for facts likely to matter again. Do not promote one-off command output, stale session ids, subjective reassurance, or details that belong only in the closed session artifact.

## Exit

Verification exits only when every route scenario is accounted for.

If verdict is fail or blocked, return to `helmsman-autopilot` with the repair scope.

If verdict is pass, write the closeout `retro.md` when useful and update `map.json` with `stage: "closed"`, `currentCheckpoint: "closed"`, `status: "closed"`, and `nextSkill: "none"`.
