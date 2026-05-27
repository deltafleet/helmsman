# Install, Doctor, And Product Audit Contract

Status: current binding design for distribution, installation health checks,
update authority, no-mock product audit, and release evidence

## Purpose

This contract closes the product boundary around "it works on a user's
machine." It defines what installation means for the Pi-direct Helmsman product,
what `doctor` may and may not do, how updates are authorized, and how product
QA proves the North Star without substituting green unit tests, mock providers,
or repo-only checks for real installed behavior.

This is not a release checklist for a smaller product. It is the acceptance
surface for the ultimate product after the implementation gates exist.

## Decision

Helmsman ships as a native terminal workbench package with a real `helmsman`
command. Pi is a runtime dependency/substrate; Helmsman Core remains the
authority.

The public lifecycle is:

```text
install package
-> run read-only doctor
-> initialize or open project/run
-> operate through TUI and non-interactive commands
-> verify route/product evidence
-> product audit maps every North Star requirement to proof
-> release only after installed-state and no-mock gates pass
```

No command may present a dry-run, mock provider, stale plugin cache, generated
file, or final assistant message as product completion.

## Command Surface

Planned product commands:

```text
helmsman doctor [--json]
helmsman install --scope <project|user> [--dry-run] [--json]
helmsman update [--json]
helmsman uninstall --scope <project|user> [--dry-run] [--json]
helmsman init [--workspace <path>] [--json]
helmsman tui [--workspace <path>]
helmsman product-audit [--json] [--live]
helmsman verify [--json]
helmsman pi-runtime doctor --json
```

`doctor` is the first-entry command. Once the CLI exists, an agent entering a
Helmsman workspace should run the read-only doctor check before mutating product
state.

`--json` is the machine-readable form. The human command remains simple:

```text
helmsman doctor
```

Do not expose timeout or update knobs in the first-entry protocol unless a user
explicitly asks for them.

## Install Scope

`install` may write only declared surfaces:

Project scope:

```text
.helmsman/
  install-manifest.json
  config.json
  role-registry.json
  adapters/
    codex/
    opencode/
    omp/
    claude/
```

User scope:

```text
<user-config-root>/helmsman/
  install-manifest.json
  config.json
  adapters/
```

The concrete user config root is platform-specific and must be reported by
`doctor --json`. Do not hide user-scope writes.

The package install itself must provide:

- `helmsman` binary entrypoint
- package version metadata
- pinned Pi dependency versions or documented compatible ranges
- runtime import surface
- TUI entry surface
- non-interactive command surface
- bundled schemas and default role templates
- no generated cache requirement before first `doctor`

## Install Manifest

Each install writes a manifest:

```ts
interface InstallManifest {
  schemaVersion: "helmsman.install.v1";
  installedAt: string;
  packageName: string;
  packageVersion: string;
  commandPath: string;
  scope: "project" | "user";
  workspace?: string;
  nodeVersion: string;
  piBaseline: {
    codingAgent: string;
    agentCore: string;
    tui: string;
  };
  files: Array<{
    path: string;
    kind:
      | "config"
      | "role_registry"
      | "adapter_config"
      | "schema"
      | "template"
      | "generated_cache";
    sha256: string;
    managed: boolean;
  }>;
  staleFilesRemoved: string[];
  skippedFiles: Array<{
    path: string;
    reason: string;
  }>;
  warnings: string[];
}
```

`managed: true` files may be updated or removed only by explicit Helmsman
install/update/uninstall commands. User-owned files must not be overwritten
without a conflict report and explicit approval.

## Doctor Contract

`doctor` is read-only.

It may inspect:

- Node version and package manager state
- `helmsman` command path and package version
- package dependency resolution
- Pi package versions and public exports
- TUI package import availability
- project `.helmsman` readability and atomic-write capability through a
  temporary probe that cleans itself up
- install manifest presence and hash consistency
- managed file drift
- role registry schema
- adapter config presence
- provider readiness metadata
- safe auth status without printing or storing secrets
- current run health when executed inside a run
- whether product commands are implemented in the current checkout

It must not:

- run install/update/uninstall
- write persistent state
- refresh tokens
- call live model providers
- mutate `.helmsman`
- remove stale files
- silently repair generated caches
- mark the product ready when implementation entrypoints are missing

`doctor --json` returns:

```ts
interface DoctorReport {
  schemaVersion: "helmsman.doctor.v1";
  checkedAt: string;
  ready: boolean;
  command: {
    path?: string;
    version?: string;
    source: "package" | "workspace" | "unknown";
  };
  environment: {
    platform: string;
    nodeVersion: string;
    cwd: string;
    workspace?: string;
  };
  package: {
    installed: boolean;
    packageName?: string;
    packageVersion?: string;
    piVersions: Record<string, string>;
    exportsOk: boolean;
  };
  install: {
    projectManifest?: string;
    userManifest?: string;
    managedFileDrift: DoctorFinding[];
    staleFiles: DoctorFinding[];
  };
  runtime: {
    piImportOk: boolean;
    tuiImportOk: boolean;
    documentBusWritable: boolean;
    fullProductEntryPointsPresent: boolean;
  };
  providers: {
    configured: number;
    ready: number;
    missingAuth: string[];
    warnings: DoctorFinding[];
  };
  checks: DoctorFinding[];
  nextRecommendedAction:
    | "ready"
    | "install"
    | "update_requires_approval"
    | "repair_requires_approval"
    | "configure_provider"
    | "implementation_missing"
    | "blocked";
}

interface DoctorFinding {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  evidenceRef?: string;
}
```

Exit behavior:

- Exit `0` when installed surfaces are inspectable and only optional provider
  credentials are missing.
- Exit non-zero when package imports fail, Node is incompatible, managed files
  drift, install manifests contradict installed state, the Document Bus cannot
  be safely probed, or a requested product surface is not implemented.

Missing live-provider auth is a readiness warning for doctor. It is a blocker
for live-provider verification.

## Update Contract

`update` is approval-gated. Doctor may recommend update; it must not perform it.

Update must:

- show current version, target version, and source
- show managed files that will change
- preserve user-owned files
- produce a pre-update backup or rollback pointer for managed files
- write a new install manifest
- report stale files removed
- run post-update doctor
- refuse to proceed when package version or schema migration is ambiguous

`update` must not:

- run from a doctor path
- silently migrate active runs
- overwrite user-owned adapter config
- change provider credentials
- claim release health without product audit evidence

## Uninstall Contract

`uninstall` removes only managed files recorded in the install manifest unless
the user explicitly approves broader cleanup.

It must preserve:

- run history
- evidence
- user-owned configs
- external provider auth
- unmanaged adapter files

It must write an uninstall report rather than hiding partial cleanup.

## Product Audit

`product-audit` is the release gate that proves the North Star at product
level.

Audit artifacts:

```text
.helmsman/product-audits/<audit-id>/
  audit-plan.json
  requirements.json
  evidence-index.json
  command-log.jsonl
  install-state.json
  live-provider.json
  no-mock-audit.json
  report.md
```

Every audit requirement follows the data contract in
`docs/pi-direct-data-contracts.md` and adds proof strictness:

```ts
interface ProductAuditRequirement {
  requirementId: string;
  requirementText: string;
  category:
    | "north_star"
    | "core_authority"
    | "pi_runtime"
    | "tui"
    | "question_ui"
    | "manifest_board"
    | "role_runtime"
    | "memory_research"
    | "route_lock"
    | "autopilot"
    | "verification"
    | "install_doctor"
    | "security"
    | "release";
  requiredEvidence: ProductAuditEvidenceRef[];
  status: "proved" | "contradicted" | "incomplete" | "missing" | "not_applicable";
  reason: string;
}

interface ProductAuditEvidenceRef {
  kind:
    | "schema"
    | "unit_test"
    | "replay_test"
    | "tui_pty"
    | "live_pi_provider"
    | "live_agent_session"
    | "package_install"
    | "doctor"
    | "role_run"
    | "artifact"
    | "manual_review";
  ref: string;
  coverage: string;
}
```

The audit passes only when every non-optional requirement is `proved`.

## Required Audit Requirements

The initial product audit matrix must include at least:

| Requirement ID | Requirement | Required evidence |
| --- | --- | --- |
| `NS-001` | Helmsman Core owns Charting, Manifest, Board, gates, Route Lock, Autopilot legality, verification, and closeout. | schema tests, reducer replay, authority-negative tests |
| `PI-001` | Pi is the runtime substrate for sessions, models, TUI primitives, resources, persistence, and event streaming. | Pi import tests, live AgentSession proof, TUI import/render proof |
| `MF-001` | Manifest is the machine source of truth and Board is rebuildable projection. | event append tests, reducer replay, projector replay |
| `CH-001` | Charting is explicit, question-first, repeated, and route-changing. | question bundle tests, TUI surface evidence, route-effect reducer tests |
| `QU-001` | Question UI renders full Core-authored option surface with stable ids and evidence. | bundle hash tests, rendered transcript evidence, answer mapping tests |
| `RR-001` | RoleRuntime maps Core plans and worker packets to bounded Pi AgentSession runs. | role-run tests, Pi event logs, artifact validation, concurrency tests |
| `MR-001` | Memory scan precedes research and research lanes only cover stale, missing, or conflicting memory. | memory classification tests, research-index replay, worker artifacts |
| `MR-002` | Research lane completion is artifact-backed, observation/inference separated, source-cited, and accepted only through Core synthesis. | artifact validator tests, synthesis replay tests, chat-only completion rejection tests |
| `RL-001` | Route Lock refuses unresolved questions, missing evidence, and stale Board revisions. | gate tests, negative route-lock scenarios |
| `RL-002` | Route Lock confirms only through a user-visible canonical route snapshot hash and post-lock route changes require amendment, unlock, invalidation, or park. | route-lock snapshot tests, confirmation evidence, amendment tests |
| `AP-001` | Autopilot reads Board before every loop and cannot accept final prose as completion. | Board-read loop tests, final-message rejection tests, artifact acceptance tests |
| `AP-002` | Autopilot selects only the Board's next legal action, launches bounded packets, records route adherence, and responds to drift through repair, ask, amend, park, or stop. | action-legality tests, packet contract tests, drift matrix tests, resume tests |
| `VF-001` | Verification scenarios pass only through declared verifier role and Core event. | verifier role-run evidence, verification event replay |
| `VF-002` | Closeout requires scenario-backed verdicts, accepted evidence, closeout artifacts, and cannot treat green tests or final prose as completion. | scenario matrix tests, closeout replay tests, final-prose rejection tests, memory promotion candidate tests |
| `ID-001` | Install, doctor, update, and uninstall behave as declared and are safe around user-owned files. | package install smoke, doctor report, update dry-run, uninstall dry-run |
| `SC-001` | Secrets are never written to `.helmsman` artifacts, logs, reports, or audit files. | secret-scan command output, redaction tests, live-provider report |
| `QA-001` | Product QA maps every North Star requirement to evidence and rejects mock-only proof. | product-audit requirements file, no-mock audit, live-provider status |

Additional release-specific requirements may be added, but these may not be
removed without a schema migration and design decision.

## No-Mock Audit

`no-mock-audit.json` must record every mocked, fake, fixture, synthetic, or
headless-only surface and classify it:

```ts
interface NoMockAuditRecord {
  path: string;
  kind: "mock" | "fixture" | "fake_provider" | "headless_driver" | "synthetic_data";
  allowedFor: "unit_test" | "contract_test" | "ci_only";
  forbiddenFor: string[];
  productClaimBlocked: boolean;
  reason: string;
}
```

Mocked tests can prove deterministic code behavior. They cannot prove:

- live provider readiness
- user-visible TUI behavior
- installed package discovery
- route authority under real role execution
- release readiness

## Release Gate

A release candidate is valid only when these pass in order:

```text
npm run verify
npm run verify:pi-runtime
npm run verify:role-runtime
npm run verify:question-ui
npm run verify:product-audit
npm pack --dry-run
install package into an isolated environment
helmsman doctor --json
helmsman product-audit --json
```

When credentials are available, the release gate must also include:

```text
npm run verify:pi-runtime:live
npm run verify:role-runtime:live
helmsman product-audit --json --live
```

If live credentials are unavailable, the release candidate must mark live QA as
blocked and cannot claim live-provider product proof.

## Current Checkout Reality

This worktree now contains the `helmsman` CLI, read-only doctor, install,
init, update, uninstall, product-audit, verify command, focused
`verify:product-audit`, actual `npm pack` plus isolated installed-binary smoke,
and TUI `/qa-product` routing.

Do not report release health from this checkout unless the ordered release gate
has been run and the product-audit artifacts prove release readiness. A product
audit run without `--live` must record live QA as not run and must not be
treated as live-provider product proof.

## Non-Acceptance Cases

The install/doctor/product-audit surface is not accepted if:

- doctor writes persistent files
- doctor runs update or install
- update runs without explicit user approval
- install verification checks only source files but not installed command state
- product audit has green tests but no requirement-to-evidence map
- mock providers are counted as live provider proof
- final assistant messages are counted as completed artifacts
- user-owned files are overwritten without conflict reporting
- secrets appear in `.helmsman`, audit files, logs, or reports
- package install smoke skips the actual installed binary

## Handoff

This contract feeds Gate 9 and release hardening. Gate 1 may implement the
minimal read-only `doctor` subset from `docs/pi-runtime-foundation-contract.md`,
but full package install, update, uninstall, and no-mock product audit must
follow this contract.
