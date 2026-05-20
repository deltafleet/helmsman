# Goal Charter

## Native Goal Source
<paste or reference the exact native goal text>

## Charter ID
<goal-id>

## Route Promise
<what must be true when the user returns>

## Attached Operating Documents
- `goal.md`
- `goal-charter.md`
- `route-card.md`
- `contract.md`
- `charting-loop.md`
- `question-bundles.md`
- `memory-scan.md`
- `research-index.md` when research is needed
- `worker-packets.md` when parallel research lanes can launch
- `verification-scenarios.md`
- `stop-conditions.md`
- `resume-report-template.md`

## Autonomy Boundary
Allowed without user:
- <safe action>

Must stop for user:
- <decision boundary>

Forbidden:
- <action that would violate the goal or user trust>

## Helmsman Skill Use
- Use `helmsman-charting` only if this charter is incomplete or contradictory.
- Use `helmsman-charting` for evidence-dependent decisions until the route is locked.
- Keep Charting as a recursive route-sharpening loop, not one question bundle plus one research pass.
- The first Aperture Question Bundle creates the coordinates for memory lookup; broad Memory Scan before the first Aperture Question Bundle is forbidden.
- Scoped Memory Scan happens before Research Lanes.
- Research Lanes only handle stale, missing, or conflicting prior memory.
- Repeat question, memory, research, synthesis, and sharpness cycles until Route Lock is safe.
- Use `helmsman-autopilot` for strategy, blueprint, audit, execution, and repair.
- Use `helmsman-verify` before claiming completion.
- Write `retro.md` through the verify closeout path or leave the resume report before stopping.

## Completion Standard
Completion requires:
- every verification scenario passes or is explicitly marked blocked
- changed files and commands are recorded
- stop conditions are not violated
- blocked decisions are surfaced instead of guessed

## Native Goal Instruction
Invoke the native goal with `goal.md`:

```text
/goal @.helmsman/goals/<goal-id>/goal.md
```

The goal document should order the agent to complete this charter and its sibling operating documents, not summarize or reinterpret them.
