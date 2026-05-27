# Question-First Charting Loop

Status: superseded OMP plugin-first study

Current authority: `../product-north-star.md` and `../native-core-tui-plan.md`.
This file is retained for OMP adapter/reference research only.

## Core Thesis

Charting exists to understand the user's real intent before autonomy takes over.

The most valuable information often comes from questions. Once the user's intent, boundaries, taste, risk tolerance, and success criteria are clear, agents can fill in a large amount of implementation detail through research and synthesis.

Therefore Charting should ask many questions. The cap is not on total questions. The cap is on one form bundle:

```text
max 4 questions per bundle
many bundles per Charting session
many waves before Route Lock
```

This keeps the UI manageable while preserving the product principle: ask until intent is clear enough to compile a route.

## What Questions Are For

Questions should close route-changing ambiguity. They are not for making the user manually design everything.

Ask the user about:

- true goal
- priority order
- non-goals
- audience and user impact
- taste and product posture
- risk tolerance
- acceptable tradeoffs
- hidden constraints
- authority boundaries
- success and failure criteria
- timing and stopping conditions
- whether to spend agent effort on research or proceed from current evidence

Let agents handle:

- option generation
- implementation detail expansion
- technical research
- reference teardown
- benchmark criteria drafting
- phase decomposition
- risk analysis
- synthesis
- first draft of the Manifest

## Charting Is Repeated

Charting is a loop, not a single pass:

```text
1. Analyze rough request.
2. Generate question bundle.
3. Collect answers through OMP Ask UI.
4. Write answers into Manifest events.
5. Update intent, scope, non-goals, and open questions.
6. Propose research lanes.
7. Dispatch active lanes in parallel.
8. Read lane artifacts.
9. Synthesize evidence.
10. Run gap and risk audit.
11. Generate the next question bundle or research wave.
12. Repeat until Route Lock gate passes.
```

Every wave must improve at least one durable artifact:

- `manifest.json`
- `manifest.events.jsonl`
- `board.json`
- `question-ledger.json`
- `research-index.md`
- `research/<slug>.md`
- `rendered/manifest.md`

If a wave only produces chat text, it did not move Charting forward.

## Question Bundle Contract

Each bundle contains 1 to 4 questions:

```json
{
  "bundleId": "qb-003",
  "wave": 2,
  "purpose": "close product positioning and autonomy authority",
  "questions": [
    {
      "id": "q-product-center",
      "kind": "single",
      "question": "What should Helmsman primarily be?",
      "recommendedOptionId": "omp-plugin",
      "options": [
        {
          "id": "omp-plugin",
          "title": "OMP plugin",
          "description": "Use OMP as host and make Helmsman the route-governance layer."
        }
      ],
      "allowCustom": true
    }
  ]
}
```

Required fields:

- stable question id
- route impact
- single or multi select
- option title
- option description
- optional recommended marker
- custom answer support
- what the answer will close
- what remains open after the answer

## OMP Ask UI Mapping

OMP's `ask` tool already supports:

- one or more questions
- explicit options
- recommended option index
- single select
- multi select
- custom `Other` input
- structured result details

OMP's current `ask` option schema is label-only. It does not natively carry
Helmsman's `option.title` plus `option.description` contract. Therefore the
adapter decision is:

- use OMP Ask for the base proof
- use `ctx.ui.custom` or patch OMP Ask for the final rich question bundle UI
- never drop option descriptions from the Manifest contract

Helmsman adds stricter semantics:

- no more than 4 questions per bundle
- option ids must be stable
- every answer becomes a Manifest event
- recommendation reason is stored
- waived questions are explicit
- skipped questions remain visible in the question ledger

## Question Ledger

Charting needs a durable question ledger:

```text
.helmsman/sessions/<session-id>/question-ledger.json
```

Each question has status:

```text
proposed
asked
answered
waived
deferred
superseded
blocked
```

Route Lock cannot ignore route-changing open questions. They must be answered, waived with a reason, or converted into a known risk.

## Progress Signal

Do not use a naked clarity percentage as authority.

Prefer concrete progress:

```text
Intent questions: 9 answered, 2 open
Non-goals: locked
Research lanes: 5 complete, 1 waived
Scenarios: 4 complete, 1 missing
Route Lock: blocked by q-risk-tolerance
```

The UI may show compact progress, but the gate is artifact-backed.

## Lock-Readiness Proposal

Charting may proactively propose Route Lock:

```text
Charting is lock-ready.
Proceed to Autopilot?
```

This proposal is allowed only after:

- no route-changing question remains unresolved
- critical research lanes are complete or explicitly waived
- Manifest has success criteria and non-goals
- Board has phases and next allowed actions
- verification scenarios exist
- stop conditions exist

For high-risk work, the user confirms. For low-risk work, confirmation can be lightweight, but it is still explicit.
