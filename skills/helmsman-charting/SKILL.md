---
name: helmsman-charting
description: Use before autonomy to aim the route. Runs always-on Aperture Bundles, recommended choice questions, research lane contracts, decision bundles, and route-card artifacts through native conversation and durable files.
---

# helmsman-charting

Use this before planning, implementation, or worker spawning. Charting owns targeted research until the route is locked.

## Version Notice

On first entry to this Helmsman skill in a conversation, the lead agent should run `helmsman doctor` as a read-only check before stage work, unless another Helmsman skill already ran it in the same conversation. If it reports `Update available: yes`, notify the user with the installed version, latest npm version, and `helmsman update`. Do not run `helmsman update` without explicit user approval. If the command is unavailable or npm lookup fails, continue the workflow.

Charting is not a lightweight preflight form. It is the route-governing phase that prevents Autopilot from becoming the strategist.

Core rule:

```text
Aperture Bundle is always required before Research.
Bundle Density Read only decides how many Aperture questions to ask and what kind they are.
It never decides to skip Aperture.
```

## Start

Create or reuse `.helmsman/sessions/<session-id>/`. If no session exists, use a timestamped id such as `session-YYYYMMDD-HHMM-charting`.

Initialize or update:

- `contract.md`
- `map.json`
- `chart.md`
- `decision-log.md`
- `route-card.md`
- `charting-loop.md` when the route may need more than one Charting cycle
- `question-bundles.md` when any Aperture or Decision Bundle is asked
- `memory-scan.md` before Research Lanes
- `research-index.md` when Research is selected
- `worker-packets.md` when Research can run through workers
- `research/` when Research workers run

Start route artifacts from the bundled template or `scaffold:skill-artifact`. Do not hand-author `route-card.md` from memory. The route card must keep every field listed in the Route Card section below, even when a field says that work is skipped, lead-only, or not applicable.

If the user is preparing a native `/goal` for a long unattended run, also create a native goal entry set:

- `goal.md`
- `goal-charter.md`
- `charting-loop.md`
- `question-bundles.md`
- `memory-scan.md`
- `research-index.md`
- `worker-packets.md` when Research can run through workers
- `stop-conditions.md`
- `verification-scenarios.md`
- `resume-report-template.md`

## Contract

Write `contract.md` with:

```text
Current stage: charting
Allowed actions:
- ask Aperture and Decision Bundle questions in the native conversation
- inspect nearby files/docs needed to avoid context-free questions
- inspect relevant files/docs
- spawn research workers after the Research Lane Contract when explicitly authorized
- update charting artifacts
Forbidden actions:
- edit product/source files
- spawn implementation workers
- claim verification or completion
Required artifacts:
- chart.md
- decision-log.md
- route-card.md
Exit gate:
- route card has scope, non-goals, Aperture Bundles, Research Lane Contract, Decision Bundles, risks, named verification scenarios, and handoff fields
Next owner:
- lead worker
```

## Signal Read

Read enough immediate context to avoid asking dumb questions:

- the user's latest message
- recent conversation
- current session artifacts when present
- user-named files or obvious route files
- relevant skill/tool surface when it affects the route

Signal Read includes `Bundle Density Read`.

`Bundle Density Read` decides:

- whether the first Aperture Bundle has 1, 2, 3, or 4 questions
- whether the bundle is confirmation-oriented, exploration-oriented, research-aiming, or blocker-oriented
- which wrong destination the first bundle should prevent

It does not decide whether Aperture happens.

Density guide:

| Initial request | First Aperture Bundle |
| --- | --- |
| Very detailed | 1 confirmation question |
| Medium clarity | about 2 scope/research-angle questions |
| Rough | 3 to 4 goal/scope/research/wrong-destination questions |
| Contradictory or risky | up to 4 blocker and authority questions |

## Question Bundles

Questions are safe-navigation work, not overhead.

Rules:

- Ask as many bundles as needed.
- Limit each bundle to at most 4 questions.
- Each question must be route-changing.
- Each question should be multiple-choice by default.
- Each question must include one recommended option and a reason.
- Each question must allow free-form override.
- Each bundle must receive a review: `continue`, `lock-ready`, or `blocked`.

Bundle review meanings:

- `continue`: more route-changing uncertainty remains.
- `lock-ready`: the route is precise enough to attempt Route Lock or handoff.
- `blocked`: user authority or evidence is missing.

## Aperture Bundles

Aperture Bundles happen before Research.

They narrow the research angle, prevent wasted research, confirm execution depth, identify useful evidence, and name wrong destinations to avoid.

Required question shape:

```text
Question:
Why this matters:

A. <plain option>. (Recommended)
   Reason:
   Tradeoff:
   What this opens/closes:

B. <plain option>.
   Reason:
   Tradeoff:
   What this opens/closes:

C. <plain option>.
   Reason:
   Tradeoff:
   What this opens/closes:

Free-form answers are welcome if you want to mix these or correct the frame.
What this answer changes:
```

Do not use a custom Ask UI. Native chat is the question surface.

Native chat replay rule:

When an Aperture or Decision Bundle waits on user authority, the lead's next native-chat message must render the full bundle before asking for an answer. Full bundle means every question, every A/B/C option, the recommended option, recommendation reason, option reason, tradeoff, route effect, and the free-form override sentence.

Writing the bundle to `question-bundles.md` is not the same as asking it. A bundle is not asked until `question-bundles.md` records native question surface evidence showing that the full option set was rendered to native chat, and that evidence must point at `evidence/native-chat-transcript.jsonl#<message-id>` records. The assistant record must contain every question, every A/B/C option, the recommendation marker, and the free-form override sentence. Once answered, the user record must match the recorded `User answer`.

Record the selected aperture, skipped lanes, and bundle review in `route-card.md`.

## Research Lane Contract

Before evidence collection starts, write a Research Lane Contract in `route-card.md`.

It must state:

- selected aperture
- route question
- research lanes to inspect
- research lanes explicitly skipped
- likely sources
- sources that would be wasteful
- evidence shape expected
- decision that research should enable
- stop condition
- parallel research posture
- research topic list with stable slugs
- `research-index.md` as the coordination index
- one required `research/<slug>.md` artifact per selected topic
- Max active research lanes: 6 unless the user explicitly approves a higher cap
- lead-only lanes and why they are not worth spawning
- research worker packets required before launch

Research must be aimed by the Aperture answer. Do not research from a vague Initial Query or unaimed route.

## Research Lane Execution

Parallel research is the default. The point is to spend many model tokens in a short wall-clock window without wasting them: independent research lanes should run as research workers, and every worker token must land in a durable research artifact.

The lead agent should not save tokens by doing parallelizable research alone. It should save wasted tokens by aiming each lane before launch, bounding each packet, and forcing every result into an artifact that can be reused.

Use the smallest lane split that preserves useful parallelism and stays inside the Research Lane Contract. Merge tightly coupled or trivial lanes; split independent lanes. Common lanes:

- source-of-truth lane
- current-code lane
- competitor or prior-art lane
- failure-mode lane
- user-experience lane
- implementation-feasibility lane

Use one research worker per independent lane unless a lane is too cheap, too tightly coupled to the lead's current reasoning, or blocked by a user-owned decision. Do not let the lead worker silently absorb parallelizable research.

Every lane must trace to the selected aperture. If a source would not change the route decision named by Charting, record it as skipped instead of researching it by momentum.

Maintain `research-index.md` as the coordination spine:

```text
# Research Index

Max active research lanes: 6 unless user-approved
Launch posture: <parallel|lead-only|blocked>

| Slug | Question | Lane Type | Owner | Status | Artifact | Sources Checked | Decision Impact | Open Uncertainty |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| <slug> | <question> | <lane type> | <lead|worker name> | <queued|running|done|dropped> | research/<slug>.md | <count or source list> | <route effect> | <none or issue> |
```

The index is not a ranking system. It accounts for every selected topic, owner, status, artifact path, source count, decision impact, and remaining uncertainty.

Before launch, append host-neutral research worker packets to `worker-packets.md`:

```text
# Worker Packets

Launch mode: parallel
Launch evidence: <spawned in parallel|manual launch required|blocked and why>
Parallel launch group: <cycle id>

## Worker: researcher-<topic>

Worker name: researcher-<topic>
Mission: <one route-changing research question>
Context to read: <files, docs, or artifacts>
Allowed write scope: research/<slug>.md
Required artifact: research/<slug>.md
Required output artifact: research/<slug>.md
Done criteria: observations and inferences are split, sources are listed, and decision impact is explicit.
Forbidden actions: do not edit route-card.md, choose user-owned decisions, or expand scope.
Verification notes: <how the lead should verify this artifact>
Parallel group: <cycle id>
Host launch notes: <spawned|manual launch required|blocked>
```

Allowed write scope should usually be exactly one file under `research/`: `research/<slug>.md`. The lead owns `research-index.md` unless a packet explicitly assigns an index update.

Research worker packets are host-neutral. Codex and Claude execute the same host-neutral worker packets through their available agent tooling; only the host launch notes differ.

If worker spawning is explicitly authorized in the conversation, spawn all launchable research workers in parallel through available agent tooling. If the host cannot spawn, or authorization is missing, stop after writing packets and tell the operator exactly what to launch.

Each `research/<slug>.md` file must include:

```text
# Research: <topic>

## Question
## Lane Type
## Sources Checked
## Observations
## Inferences
## Uncertainty
## Decision Impact
## Route Changes Required
## Recommended Next Step
```

Use links, file paths, command outputs, or direct observations. Keep `Observations` limited to what was actually seen. Put interpretation, tradeoffs, and extrapolation in `Inferences`.

Research is complete when `research-index.md` accounts for every selected topic and every active topic has exactly one `research/<slug>.md` artifact or a recorded drop reason. Evidence that collapses observation and inference back into generic findings is not exit-ready.

## Decision Bundles

After targeted research, return to Charting when user-owned decisions remain.

Decision Bundles choose or approve the route after evidence. They use the same friendly multiple-choice structure as Aperture Bundles, but their recommendation is evidence-backed.

Record:

- recommendation
- evidence basis
- accepted user answer or explicit override
- route changes
- bundle review

If no user-owned decision remains after research, record why the Decision Bundle is not needed and keep the route-card explicit.

## Authority Rules

Never collapse these authority sources:

- lead recommendation
- explicit user answer
- evidence-backed conclusion
- lead synthesis
- worker report
- phase completion

Lead recommendation is not user approval.

## Native Goal Attachment Flow

Do not try to wrap or execute the platform's native `/goal` command. Helmsman should prepare the document that the user passes to that native goal.

For overnight or very long work, produce:

```text
.helmsman/goals/<goal-id>/
  goal.md
  goal-charter.md
  route-card.md
  contract.md
  charting-loop.md
  question-bundles.md
  memory-scan.md
  research-index.md
  worker-packets.md
  research/
  verification-scenarios.md
  stop-conditions.md
  resume-report-template.md
```

The user-facing invocation should be:

```text
/goal @.helmsman/goals/<goal-id>/goal.md
```

`goal.md` is the native goal entrypoint. It binds the sibling charter, route card, contract, charting loop, question bundles, memory scan, stop conditions, verification scenarios, and resume template as the operating contract. Do not summarize that contract into a weaker prompt. If `goal.md` and a sibling contract file conflict, stop and report the conflict.

Native goal Charting must preserve the recursive loop:

```text
Signal Read -> Aperture Question Bundle -> Scoped Memory Scan before Research Lanes -> Synthesis -> Sharpness Check -> loop or Route Lock
```

Broad Memory Scan before the first Aperture Question Bundle is forbidden. Research Lanes only handle stale, missing, or conflicting prior memory. Route Lock is forbidden while Autopilot could reasonably execute a different destination from the same route card.

## Route Card

`route-card.md` must contain:

```text
# Route Card

## User Intent
## Scope
## Non-Goals
## Decisions
## Aperture Bundles
Bundle Density Read:
Aperture bundle status:
## Research Lane Contract
Research lanes:
Parallel research posture:
Research worker packets:
Lead-only lanes:
Research index:
Research artifacts:
Max active lanes:
Topic-to-artifact map:
## Decision Bundles
Decision bundle status:
## Open Questions
## Risks
## Success Criteria
## Verification Scenarios
## Next Recommended Skill
## Handoff
Next skill:
Input artifact:
Already satisfied:
Deferred questions:
Carrier warning:
Expected output:
```

Record explicit user decisions in `decision-log.md` with date, decision, source message, and effect.

Every verification scenario must have a stable `Scenario ID:` such as `SC-001`. These IDs are the route promise that `helmsman-verify` must cover later.

If a session was created with older route-card sections, update it before handoff. The session validator rejects route cards that lack the Charting v5 bundle contract.

## Map

Keep `map.json` small:

```json
{
  "schemaVersion": 1,
  "stage": "charting",
  "status": "blocked|ready|complete",
  "checkpoints": ["charting", "research", "autopilot", "verify", "retro"],
  "currentCheckpoint": "charting",
  "requiredArtifacts": ["contract.md", "map.json", "chart.md", "decision-log.md", "route-card.md"],
  "presentArtifacts": [],
  "missingArtifacts": [],
  "openQuestions": [],
  "blockedReason": null,
  "nextSkill": "helmsman-charting|helmsman-autopilot"
}
```

## Exit

Before leaving Charting, reread the route card against the user's original request.

When running inside the Helmsman repository checkout or any environment where the helper exists, run `bun run validate:skill-session -- .helmsman/sessions/<session-id> --stage charting` before reporting a charting session as ready. If `research-index.md`, `research/`, or `evidence/` exists, also run the research-stage validator. Repair missing route-card fields and rerun validation before claiming the session is clean. If the validator is unavailable, explicitly say it was unavailable and manually check every Route Card required field.

Do not continue if:

- no Aperture Bundle was asked or explicitly recorded
- `Bundle Density Read` was used to skip Aperture
- Research Lane Contract is missing before Research
- user-owned decisions remain after Research without a Decision Bundle
- an Aperture or Decision Bundle is blocked, answered, or lock-ready without native question surface evidence in `question-bundles.md` and matching transcript records in `evidence/native-chat-transcript.jsonl`
- success criteria are vague
- implementation scope is unapproved
- verification scenarios are missing
- handoff fields are missing
- the next skill or expected output is unclear

If evidence is still needed, keep the workflow in `helmsman-charting` and execute the Research Lane Contract there.

If Research is complete and the route is lock-ready, hand off to `helmsman-autopilot`.
