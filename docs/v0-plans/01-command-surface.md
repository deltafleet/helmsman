# Command Surface

Status: superseded OMP plugin-first study

Current authority: `../product-north-star.md` and `../native-core-tui-plan.md`.
This file is retained for OMP adapter/reference research only.

## Primary Namespace

Use one short extension command:

```text
/hm
```

OMP parses `/foo:bar` as command `foo` with args `bar`. Therefore `/hm:charting` should be implemented as command `hm` with subcommand `charting`.

Primary commands:

```text
/hm:install
/hm:charting <optional rough goal>
/hm:resume
/hm:questions
/hm:research
/hm:manifest
/hm:board
/hm:lock
/hm:autopilot
/hm:roles
/hm:doctor
```

Verbose aliases may exist:

```text
/helmsman:charting
/helmsman:autopilot
```

The short namespace should be the documented default.

## Why `charting`, Not `chart`

The archived Helmsman story uses the navigation metaphor and names the route-setting phase `Charting`. In the product language, Charting is the stage where intent, evidence, route, and Autopilot handoff are compiled.

`chart` is too short and ambiguous:

- it can read as a noun
- it can mean diagramming rather than route-setting
- it weakens the existing `Charting -> Autopilot` story

Use:

```text
/hm:charting
```

Do not use:

```text
/hm:chart
```

Internal aliases may exist only for developer convenience, not as the main product surface.

## Explicit Invocation

OMP should not propose Helmsman by default. This version is for explicit use:

```text
user runs /hm:charting
Helmsman starts Charting mode
```

Normal coding-agent requests remain normal OMP requests. This prevents Helmsman from becoming an always-on tax.

## Command Responsibilities

`/hm:install`

- install project-local OMP agents under `.omp/agents`
- install or verify Helmsman plugin files if needed
- write an install manifest
- report missing roles, stale files, and active discovery paths

`/hm:charting`

- create or resume a `.helmsman/sessions/<id>` workspace
- start the repeated Charting loop
- generate question bundles
- dispatch research lanes
- update Manifest and Board
- propose Route Lock only when gates pass

`/hm:questions`

- show open question ledger
- generate the next question bundle when useful
- allow answer, waiver, or defer decisions

`/hm:research`

- show lane map
- dispatch ready lanes in parallel through OMP `task`
- show lane artifacts and gaps

`/hm:manifest`

- render the current machine Manifest as a human-readable contract
- show changes since last wave

`/hm:board`

- show the live Board projection Autopilot reads
- include active phase, open risks, next allowed actions, verification state, and drift warnings

`/hm:lock`

- run the Route Lock gate
- produce a lock-ready proposal or a concrete missing-items report
- require user confirmation for high-risk route lock

`/hm:autopilot`

- start or resume Board-governed Autopilot
- refuse if Route Lock is absent or invalid
- read Board before each loop

`/hm:roles`

- show purpose-specific model and thinking settings
- validate required role mappings

`/hm:doctor`

- verify plugin, OMP version assumptions, agent discovery, config, and session artifacts

## Unknown Or Partial Commands

The `hm` command should fail closed for unknown subcommands. It should not pass malformed Helmsman commands into normal agent chat as if they were user intent.

Example:

```text
/hm:chart
```

Expected response:

```text
Unknown Helmsman command: chart
Did you mean /hm:charting?
```
