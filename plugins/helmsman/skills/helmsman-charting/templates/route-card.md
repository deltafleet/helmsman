# Route Card

## User Intent
<state the user's requested outcome in their terms>

## Scope
<what this run will handle>

## Non-Goals
<what this run will not handle>

## Decisions
<explicit user decisions and authority boundaries>

## Aperture Bundles
Bundle Density Read: <minimal|medium|full|blocker-oriented and why>
Aperture bundle status: <answered|continue|lock-ready|blocked with bundle count and answer source>
Aperture native surface: <not-rendered|rendered|answered with question-bundles.md#c-001 and evidence/native-chat-transcript.jsonl evidence>

## Research Lane Contract
Research lanes: <selected lanes to inspect before decisions harden>
Skipped lanes: <lanes explicitly skipped to avoid research waste>
Parallel research posture: <parallel by default|lead-only|blocked and why>
Research worker packets: <worker-packets.md entries required before launch or none with reason>
Lead-only lanes: <lanes the lead will inspect locally because they are trivial, tightly coupled, or blocking>
Research index: research-index.md
Research artifacts: research/<slug>.md
Max active lanes: 6 unless user-approved
Topic-to-artifact map: <slug -> question -> artifact path>
Expected evidence: <what evidence should change the route>
Stop condition: <when research is sufficient>

## Decision Bundles
Decision bundle status: <not-started|answered|continue|lock-ready|blocked and why>
Decision native surface: <not-rendered|rendered|answered|not-needed with question-bundles.md#c-002 and evidence/native-chat-transcript.jsonl evidence or reason>
Decision authority: <user-owned decisions, evidence-owned conclusions, lead recommendations>

## Open Questions
<answered, deferred, or blocking questions>

## Risks
<route risks that would make a polished result wrong>

## Success Criteria
<observable criteria for the original route promise>

## Verification Scenarios
- Scenario ID: SC-001
  Route Scenario: <observable route promise>

## Next Recommended Skill
helmsman-charting

## Handoff
Next skill: helmsman-charting
Input artifact: route-card.md
Already satisfied: <what charting settled>
Deferred questions: <non-blocking deferred questions or none>
Carrier warning: <what the next worker must not forget>
Expected output: research-index.md, worker-packets.md when parallel workers can launch, and research/*.md
