# helmsman

[English](README.md) | [한국어](README.ko.md)

**A navigation protocol for long-running agent work.**

Helmsman is built around a simple belief: autonomous agents do better work when the route is made explicit before they start moving.

Most agent sessions try to hold too much inside a single thread. The user asks, the model interprets, the model researches, the model decides, the model plans, the model implements, and the model later claims it verified the result. That can work for small tasks. It breaks down when the work has product judgment, multiple possible routes, cross-file dependencies, or lessons worth preserving.

Helmsman separates the work into three modes:

- **Charting:** the user and lead agent load context, aim and run targeted research, ask evidence-backed Decision Bundles, and lock the route.
- **Autopilot:** specialized agents strategize, blueprint, harden, audit, implement, repair, and verify inside the route that was already charted.
- **Learning:** the session is compressed into durable project memory, so the next session can reuse what was learned instead of starting from zero.

It is not a prompt template. It is a discipline for turning one-off AI work into a repeatable, inspectable workflow.

## Why This Exists

Agentic work usually fails in quiet, familiar ways.

- A model agrees with the user before the route aperture is visible.
- Research runs in the wrong direction because the initial query sounded clear enough.
- Research gets used as decoration after a decision has already been made.
- A vague plan turns into implementation debt.
- Review checks whether something runs, not whether it satisfies the original promise.
- Lessons disappear into a closed transcript and the next session repeats the same investigation.

Helmsman makes those failures harder by forcing the work to leave evidence at the boundaries where agent sessions usually drift.

```text
user intent
  -> aperture bundle
  -> research lane contract
  -> targeted research
  -> evidence
  -> decision bundle
  -> route lock
  -> route card
  -> same-mission strategy samples
  -> atomic blueprint
  -> hardening loop
  -> blueprint gate
  -> adversarial audit
  -> audit decision
  -> parallel execution
  -> scenario verification
  -> closeout + durable wiki memory
```

## The Core Philosophy

### Converge Before Autonomy

Autonomy is expensive when the destination is vague. Helmsman keeps the early phase close to the user: read the signal, ask an Aperture Bundle, aim research, gather evidence, ask Decision Bundles, and lock the product or technical decisions that should not be invented later by an operator.

Charting is a loop, not a checkpoint. It always externalizes the route aperture before Research. A detailed initial request may need only one confirmation question; a rough request may need several bundles. Each bundle has at most four questions, but there is no fixed limit on the number of bundles. If the route card cannot prove the target, research lane, risk model, and scenarios are concrete, the system goes back to Charting instead of handing vague direction to autonomous agents. A small heading error at the start can become a completely wrong expedition once agents fan out.

`Query Resolution` is not a gate that lets the Lead skip questions. It is an internal Bundle Density Read: how many Aperture questions to ask, and whether they should confirm, explore, aim research, or expose blockers.

Only after the route is concrete does the system shift into agent autonomy.

### The Contract Holds The Protocol

The Lead Agent should reason, synthesize, and coordinate. It should not have to remember the whole protocol from a long prompt. Helmsman now splits those responsibilities through skills and artifacts: the contract states the current stage, allowed actions, forbidden actions, required artifacts, and exit gate; the Lead owns judgment inside that contract.

That split is a control device. The Lead reads a small, current contract at each step instead of carrying a large procedural script in context. This reduces protocol drift, hallucinated shortcuts, and sudden off-route behavior. The goal is not to make the agent less intelligent. It is to keep the agent's intelligence inside an artifact trail that is hard to accidentally leave.

### Evidence Before Decisions

Research is not a paragraph that justifies a choice after the fact. It is an input to the choice, and conceptually it belongs to Charting until the route is locked. Helmsman can split research into parallel source or domain lanes, then preserve the evidence so later agents can see what was known, what was uncertain, and why the route was chosen.

### A Plan Must Survive Attack

The blueprint is not allowed to be a loose to-do list. It must describe ownership, dependencies, expected outputs, and verification scenarios clearly enough that independent auditors can attack it before implementation begins.

When the plan has enough risk, Helmsman uses bounded hardening loops: reread the whole plan against the route, current code, tests, and scenario promises. The point is to find bugs between sections, where checklist-style reviews often miss them.

Blueprint does not flow into Audit just because a plan exists. The blueprint gate checks that the plan is complete enough to audit. If the gate fails, or if the auditors return a revise verdict, the workflow loops back to Blueprint instead of pretending the plan is ready.

### Verification Is About The Original Promise

"The build passed" is not the same as "the work is done." Helmsman verification compares the implementation against the route: the user's intent, the locked decisions, the risk model, and the scenarios that were defined before execution.

If verification fails, the failed artifact is kept. The next implementation pass is a repair loop, not a quiet rewrite of history.

### Memory Should Become A Wiki, Not A Transcript

Raw chat history is too long, too local, and too noisy. Helmsman turns session output into wiki-like pages that future agents can read selectively.

The wiki follows the LLM-wiki pattern. `index.md` is a table of contents, not a ranking system. Later sessions read the index and the agent chooses relevant concept or session pages by semantic relevance from the current question, prior decisions, and task context. Validators check structure and source markers; they do not decide relevance by filename, keyword matching, embedding score, or confidence threshold.

## The Flow

```text
Charting                         Autopilot                         Learning
context, evidence, route lock     autonomous agent work              compounding memory

intent
  -> aperture bundle     externalize the route angle before research
  -> research contract   name lanes to inspect and lanes to skip
  -> research            targeted source/domain lanes before decisions harden
  -> evidence            preserve source-backed facts before choice
  -> decision bundle     choose or approve the evidence-backed route
  -> route lock          freeze the choices that need user authority
  -> route card          define target, risks, success, scenarios
     if unclear: loop back to Charting
  -> strategy            run same-mission strategist samples
  -> blueprint           compile one dependency-aware plan
  -> hardening           bounded full-plan rereads before audit
  -> blueprint gate      if incomplete: loop back to blueprint
  -> audit               parallel auditors attack the plan
     if revise: loop back to blueprint
  -> execution           parallel dependency waves
  -> verification        check scenarios against the route
     if fail: loop back to execution
  -> closeout            explain what actually happened
  -> wiki memory         preserve reusable knowledge for next time
```

Humans are strongest in charting: judgment, taste, priority, tradeoff, and saying "that is not the real problem." Agents are strongest in autopilot: breadth, patience, tireless comparison, and implementation follow-through.

Helmsman is the boundary between those strengths.

## Host Model

Helmsman should not be trapped inside one agent product. The core unit is host-neutral: `SKILL.md` instructions, supporting files, and workflow artifacts. Codex, Claude Code, and future agent hosts are adapters around that unit.

The generated plugin payload under `plugins/helmsman/` exposes the same skill tree to Codex and Claude Code. Host manifests advertise the skills; they do not own the workflow. Distribution and host-specific commands live in [docs/distribution.md](docs/distribution.md). Public contribution and release policy live in [docs/open-source-operations.md](docs/open-source-operations.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Using Helmsman

Use the root skill when the current stage is unclear. Use the narrow skill when the next stage is obvious.

```text
$helmsman
  -> reads the artifact set
  -> chooses charting, autopilot, or verify
  -> refreshes contract.md
  -> writes the next stage artifact
```

For day-to-day work, use the narrow skill that matches the next step:

```text
$helmsman-charting    aim and lock the route before autonomy
$helmsman-autopilot   run strategy, blueprint, hardening, audit, execute, repair
$helmsman-verify      check delivery against route scenarios and close it out
```

A serious workflow should create one session workspace:

```text
.helmsman/sessions/<session-id>/
  contract.md
  map.json
  route-card.md
  evidence/
  strategy-samples.md
  director-blueprint.md
  hardening.md
  audit.md
  plan.md
  execution-report.md
  verification.md
  retro.md
```

The operating rule is simple: artifacts hold state, the lead agent makes judgment calls inside the current contract, and helper scripts only remove mechanical drift. In a normal run, the lead should update `contract.md`, write the next artifact, run the narrow validator or status renderer, and then either continue inside the current skill or move to the next step.

## Current Direction

Helmsman's product direction is route-governed autonomy. The current distribution shape is skill-delivered.

Helmsman is Charting-first. Charting owns the Always Aperture contract: every route starts with an Aperture Bundle, `Bundle Density Read` only sizes that bundle, and targeted Research is scoped by a Research Lane Contract before decisions harden. Autopilot owns the downstream spine after route lock: strategy samples, blueprinting, hardening, audit, worker coordination, implementation, and repair. Verify checks the delivery against route scenarios and leaves the closeout notes that future sessions can reuse. Artifacts hold durable workflow state. Workers are spawned only when useful and receive bounded packets with required outputs. Autopilot records the execution strategy (`inline`, `serial-workers`, `parallel-workers`, or `parked`), runs a file-to-work-item safety check before parallel workers, and treats worker lifecycle evidence as a phase gate rather than trusting worker liveness or self-report. Deterministic helpers scaffold templates, validate artifacts, render status, compile memory, and fetch explicitly selected wiki pages; they do not own workflow decisions.

Distribution is deliberately outside the conceptual README. The short version is: the generated payload exposes skills to both Codex and Claude Code; the product contract remains the artifacts and workflow above. See [docs/distribution.md](docs/distribution.md) for install commands, host manifests, marketplace descriptors, and verification gates.

Published npm releases do not automatically mutate host-local plugin caches. `helmsman doctor` reports npm `latest` drift, and `helmsman update` refreshes the local payload and Codex cache from the newest published package.

The installed skills ask the lead agent to run that read-only `doctor` check once on first Helmsman entry, so users do not have to remember to check manually. The agent reports a newer version if one exists; it does not update without approval.

## Release Boundary

The operational surface above is the product path. Public release checks live in `docs/release-guards.md` so everyday use does not become a maintainer checklist.

The release boundary is intentionally narrow: build the generated plugin payload, verify package and manifest versions, run the artifact/session validators, and keep private planning or evaluation traces out of the public repository.

## Design Ideas Worth Stealing

### Artifact And Leader Contract

Helmsman treats the artifact contract as the helm and the Lead Agent as the navigator. The artifacts do not decide semantic relevance, product taste, or implementation strategy. They make visible what step is allowed, what evidence must exist, and which gate must pass before the Lead can move on.

This is why the Lead instruction can stay small. Instead of asking one long-lived agent to remember every phase rule, the current skill reads the artifact state and narrows the next bounded step. The Lead remains useful where LLMs are strong: interpreting context, comparing options, and coordinating agents. The contract protects the protocol where LLMs are weak: consistency, sequencing, and not inventing permission to skip a gate.

### Route Lock

Before autonomous work begins, the route must be concrete enough to name the target, aperture bundle, research lane contract, success criteria, route risks, and verification scenarios. If it is not, Charting loops back. This is the guardrail against early direction drift, where one small ambiguity can cascade into a convincing but wrong execution path.

### Parallel Research, Strategy, Audit, Execute

Helmsman uses parallelism where independence creates value. During Charting, researchers can split source or domain lanes before a decision hardens. Strategists run same-role, same-mission independent samples after the route is locked and before the system commits to one plan. Auditors attack the blueprint independently so one reviewer does not define the entire risk model. Implementors run in dependency-aware waves, so independent tracks can move together while blocked work waits its turn.

This is why Helmsman can spawn three strategists with the same role and the same mission. They are not three different job titles. They are independent samples of strategic judgment under the same contract. Because LLMs are probabilistic, the same mission can converge differently across runs. That variance is useful signal: repeated independent passes reduce premature convergence and make agreement, disagreement, and missing assumptions easier to see. The director then reads the original strategist reports and compiles one plan.

### Atomic Blueprint

The blueprint turns strategy into implementation units with ownership and dependency order. Work should be small enough to execute and verify, but not so small that the larger contract disappears.

### Hardening Loop

Hardening is a bounded reread of the whole blueprint before audit. It exists because many serious plan bugs are not inside one task; they live between the route card, ownership graph, dependency order, existing code, and verification scenarios.

The loop also uses the same probabilistic insight as parallel strategists. If you ask an LLM to regression-audit the same spec three times, later passes often find new issues because the model does not traverse the problem space deterministically. Helmsman uses up to three hardening loops to create practical convergence pressure without turning review into an infinite ritual. Hardening is not another phase and not a checklist split by topic. It is a repeated full-plan reread designed to catch cross-section failure before auditors and implementors spend real effort.

### Blueprint Gate

The blueprint must pass a gate before Audit begins. Missing ownership, placeholder logic, unclear artifacts, or unresolved hardening findings should send the work back to Blueprint. Audit is for adversarial review of a coherent plan, not for discovering that the plan was never audit-ready.

### Adversarial Audit

Audit happens before implementation, while plan bugs are still cheap. Multiple auditors can inspect the same blueprint independently. Their job is not to be helpful. It is to find contradiction, missing evidence, invalid dependencies, and verification gaps. If the audit verdict is revise, the workflow loops back to Blueprint.

### Scenario Verification

Verification uses scenarios from the route, not vibes from the final diff. A change can be technically clean and still fail if it does not satisfy the scenario the user actually needed.

### Durable Wiki Memory

Closeout is not just a final note. It is raw material for project memory. Durable lessons can be promoted into project-level memory, while session-specific details are compressed into wiki pages that later agents can choose to read.

## What Gets Remembered

Helmsman distinguishes three kinds of memory:

- **Promoted project memory:** stable lessons that should influence future work.
- **Session pages:** compressed accounts of what a specific session decided, tried, changed, and verified.
- **Concept pages:** reusable explanations that outlive any one session.

This is intentionally different from a search index. The system does not try to score the user's next request mechanically. It gives the next agent a structured map, then lets the agent judge relevance in context.

## The Crew

Helmsman uses roles as pressure, not decoration.

| Role | Contribution |
| --- | --- |
| Researcher | collects source-backed evidence for Charting before decisions harden |
| Strategist | produces an independent complete strategy from the same locked mission |
| Director | compiles divergent strategy into an executable blueprint |
| Auditor | attacks plans and verifies implementation against scenarios |
| Implementor | owns bounded work in dependency order |

The important part is not the role names. It is the separation of incentives: the agent that proposes a plan should not be the only agent that audits it, and the agent that implements should still be checked against the original route.

## Current Shape

The repository contains the Helmsman protocol assets, role pressure documents, route and verification contracts, Autopilot spine artifacts, deterministic helper scripts, LLM-wiki compilation, and the current Helmsman direction in `docs/helmsman-protocol.md` plus `skills/helmsman-*`. CLI code that remains in the repo is a helper toolbelt; it is not the workflow authority.

## Native Goals

Native goals are the platform's long-running task target. Helmsman does not replace that target; it turns it into route artifacts the next agent can obey.

The practical flow is attachment-based:

```text
$helmsman-charting
  -> .helmsman/goals/<goal-id>/goal.md
  -> route-card.md
  -> contract.md
  -> verification-scenarios.md
  -> stop-conditions.md

/goal @.helmsman/goals/<goal-id>/goal.md
```

During a long run, Helmsman asks one question: does this action advance the native goal's route promise? If not, it marks the route blocked and leaves a resume packet instead of inventing a new goal.
