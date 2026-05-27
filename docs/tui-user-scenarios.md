# Native TUI User Scenarios

Status: current product scenario

## 1. Start Helmsman

The user starts Helmsman in a project:

```text
$ helmsman
```

The first screen is a normal chat-first TUI with a compact Board/route status
area. Charting is not forced on every request.

## 2. Normal Chat

The user can use Helmsman like a regular coding agent:

```text
> inspect this repo
> fix this narrow bug
> explain this module
```

For small tasks, Helmsman does not require a full Charting loop.

## 3. Enter Charting Explicitly

For route-sensitive work, the user enters Charting:

```text
/charting rebuild this project as a native Core-owned TUI harness
```

Helmsman creates or resumes:

```text
.helmsman/sessions/<session-id>/
  manifest.json
  manifest.events.jsonl
  board.json
  question-ledger.json
```

## 4. Answer Question Bundles

Helmsman asks structured form bundles. One bundle contains at most 4 questions.

Questions are written for the user first, not for the implementation. The UI
should make the choice easy to understand before exposing internal terms. Core
product words such as Charting, Manifest, Board, and Autopilot can appear when
they make the product clearer.

Each question supports:

- single select
- multi select
- recommended option
- option title and description
- custom answer
- defer or waive when allowed
- route effect metadata

Answers become events and update the Manifest. Recommendation is not treated as
an answer.

## 5. Run Parallel Research Lanes

Charting declares independent research lanes:

```text
Lane 1: old Helmsman protocol kernel extraction
Lane 2: Pi AgentSession runtime capability proof
Lane 3: Question UI Adapter route-effect proof
Lane 4: External adapter boundary for Codex/OpenCode/OMP
```

Accepted lanes run in parallel through available adapters. Every lane must
write a document artifact:

```text
.helmsman/sessions/<session-id>/research/<slug>.md
```

Chat-only completion is invalid.

Research is not only web research. Helmsman also inspects local codebases,
archived project history, skills, docs, prior artifacts, and host CLI behavior.
The rule is not "research less"; the rule is "aim each lane tightly."

Before spawning lanes, Helmsman runs a scoped Wiki Memory scan. If the same
topic was already researched, the prior memory is reused unless it is stale,
missing, conflicting, or too shallow for the current route decision.

The research note can be free-form. The TUI should not make every worker output
feel like a rigid report. Completion, score movement, and route impact are
tracked by the research index and Board.

## 6. Compile Manifest And Board

Helmsman compiles:

```text
rendered/manifest.md
rendered/board.md
```

The user sees progress through concrete gate coverage, not a naked clarity
percentage:

```text
Intent questions: 12 answered, 1 open
Research lanes: 4 complete, 1 waived
Verification scenarios: 5 ready
Route Lock: blocked by q-scope-risk
```

## 7. Lock Route

When gates pass, Helmsman proposes Route Lock:

```text
Route is lock-ready.

Proceed?
  A. Lock and enter Autopilot
  B. Ask another bundle
  C. Run more research
  D. Edit contract
```

Route Lock writes a lock event and Board update. Route-changing edits after
lock require amendment, unlock, re-Charting, or parking.

## 8. Run Autopilot

The user starts Autopilot:

```text
/autopilot
```

Every loop reads the current Board revision before acting:

```text
Board revision: 42
Phase: adapter-spike
Allowed action: implement Codex artifact collection proof
Forbidden: change product direction, skip verification, edit route contract
```

Pi role runners or external adapters execute bounded work. Helmsman Core
decides whether the work advances the route. After meaningful work, Autopilot
updates the Board with checklist coverage, score changes, improvements,
regressions, and remaining blockers.

## 9. Stop Drift

If an adapter or agent discovers a route-changing issue, Helmsman records it on
the Board and either repairs, re-aims, asks, amends, or parks. Hard stops are
reserved for route-changing drift, missing authority, or broken evidence gates:

```text
Pi role runner cannot preserve the required route-effect metadata for this
question surface.

Options:
  A. Patch or wrap the Question UI Adapter
  B. Use a Core-owned Pi TUI renderer for this bundle
  C. Return to Charting
  D. Park Autopilot
```

The host agent cannot silently change the route.

## 10. Verify And Close

Completion means Board and Manifest verification pass, not that a model says the
work is done.

Closeout writes:

```text
closeout.md
rendered/manifest.md
rendered/board.md
```

Reusable lessons can later be promoted to project memory.
