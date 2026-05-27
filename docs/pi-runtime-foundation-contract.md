# Pi Runtime Foundation Contract

Status: Gate 1 implemented and verified

## Purpose

Gate 1 proves that Helmsman can use the real Pi runtime stack without giving Pi
route authority. It is the foundation for normal chat, Charting question design,
memory scan, research lanes, Autopilot, verification, and release QA.

This is not a demo gate. It is accepted only when the runtime code, durable
operation evidence, failure handling, provider readiness reporting, and focused
verification all agree.

## Verified Package Surface

Baseline checked on 2026-05-27 using `npm view` and `npm pack`:

```text
@earendil-works/pi-coding-agent: 0.75.5
@earendil-works/pi-agent-core: 0.75.5
@earendil-works/pi-tui: 0.75.5
Node requirement: >=22.19.0
```

`@earendil-works/pi-coding-agent` root export includes the Gate 1 APIs:

- `createAgentSession`
- `createAgentSessionRuntime`
- `AgentSessionRuntime`
- `SessionManager`
- `SettingsManager`
- `DefaultResourceLoader`
- `AuthStorage`
- `ModelRegistry`
- `defineTool`
- built-in tool factories such as `createReadOnlyTools`, `createReadTool`,
  `createGrepTool`, `createFindTool`, `createBashTool`, `createWriteTool`

`@earendil-works/pi-tui` root export includes the future Workbench primitives:

- `Component`
- `Focusable`
- `TUI`
- `Container`
- `Input`
- `SelectList`
- `SettingsList`
- `Markdown`
- overlay types and handles

Gate 1 implementation must import from `@earendil-works/*`, not the older
reference checkout namespace.

## Dependency Contract

Gate 1 uses real runtime dependencies in `package.json`, pinned intentionally:

```json
{
  "dependencies": {
    "@earendil-works/pi-coding-agent": "0.75.5",
    "@earendil-works/pi-agent-core": "0.75.5",
    "@earendil-works/pi-ai": "0.75.5",
    "@earendil-works/pi-tui": "0.75.5"
  },
  "engines": {
    "node": ">=22.19.0"
  }
}
```

Version ranges are not acceptable for the foundation gate. Runtime API drift in
session, auth, TUI, or settings code would invalidate the proof.

These dependencies are not decorative metadata. They are paired with import
verification and focused runtime checks in this worktree.

## Source Layout Contract

Gate 1 introduces the first real runtime source layout:

```text
bin/
  helmsman.js
src/
  cli/
    main.ts
    commands/
      doctor.ts
      pi-runtime.ts
  core/
    document-bus/
      paths.ts
      atomic-write.ts
      run-lock.ts
    events/
      append-event.ts
      event-types.ts
      replay.ts
    operation-state/
      operation-state.ts
      rebuild-operation-state.ts
    redaction/
      secrets.ts
  runtime/
    pi/
      api-surface.ts
      capability-report.ts
      session-runner.ts
      session-factory.ts
      event-capture.ts
      timeout.ts
      provider-readiness.ts
  verify/
    pi-runtime-foundation.ts
```

The exact TypeScript build tooling may change, but the boundaries may not:

- `runtime/pi/*` is the only layer that imports Pi runtime packages directly.
- `core/*` does not import Pi.
- `cli/*` calls Core and runtime services; it does not write authority files
  directly.
- `verify/*` proves contracts through the public Helmsman command/runtime
  surface, not by mutating state files by hand.

## Implemented Command Contract

These commands are implemented by Gate 1 and are the current foundation command
surface:

```bash
node bin/helmsman.js doctor --json
node bin/helmsman.js pi-runtime doctor --json
node bin/helmsman.js pi-runtime probe --cwd <workspace> --session <run-id> --mode import
node bin/helmsman.js pi-runtime probe --cwd <workspace> --session <run-id> --mode in-memory-session
node bin/helmsman.js pi-runtime probe --cwd <workspace> --session <run-id> --mode persisted-session
node bin/helmsman.js pi-runtime probe --cwd <workspace> --session <run-id> --mode timeout
node bin/helmsman.js pi-runtime probe --cwd <workspace> --session <run-id> --mode abort
node bin/helmsman.js pi-runtime probe --cwd <workspace> --session <run-id> --mode live-provider
npm run verify:pi-runtime
npm run verify:pi-runtime:live
```

`doctor` is read-only. It may report missing provider credentials, missing model
availability, or version drift, but it must not run update/install or write
provider secrets.

`verify:pi-runtime` proves import, file, event, operation-state, timeout/abort,
and redaction contracts without requiring live provider credentials.

`verify:pi-runtime:live` is the only Gate 1 command allowed to claim a live Pi
agent-session proof. It must skip with a clear unavailable status when no
provider is configured; it must not replace live evidence with a fake provider.

## Runtime API Boundary

Gate 1 wraps the Pi SDK behind a Helmsman-owned boundary:

```ts
interface PiRuntimeApi {
  createSession(input: PiSessionInput): Promise<PiSessionHandle>;
  runPrompt(input: PiPromptInput): Promise<PiOperationResult>;
  abort(operationId: string, reason: string): Promise<void>;
  inspectReadiness(input: PiReadinessInput): Promise<PiReadinessReport>;
}
```

The wrapper may call:

```ts
import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
  createAgentSessionRuntime,
} from "@earendil-works/pi-coding-agent";
```

No caller outside `runtime/pi/*` may depend on Pi SDK object shapes. If Pi
changes its APIs, only the runtime boundary and its focused tests should need to
move.

## Session Modes

Gate 1 must prove three session modes.

### Import Surface

The import surface verifies that the package can be imported under Helmsman's
Node floor and module format.

Acceptance evidence:

- `api-surface.ts` imports the selected Pi symbols.
- `pi-runtime doctor --json` reports package versions and export availability.
- no runtime side effects create `.helmsman` or Pi sessions during import.

### In-Memory Session

The in-memory session proves Helmsman can construct a Pi session without
filesystem persistence:

```ts
SessionManager.inMemory(cwd)
SettingsManager.inMemory(...)
```

Acceptance evidence:

- an operation record is created under the Helmsman run root
- Pi session file is absent or recorded as non-persistent
- operation status reaches `completed`, `failed`, `timed_out`, or `aborted`
  through Core events
- no route phase advances

This mode may use fake or disabled model inputs for unit-level construction
tests. It cannot prove live provider readiness or live agent execution.

### Persisted Session

The persisted session proves Helmsman can place Pi session evidence in a
controlled location:

```ts
SessionManager.create(cwd, piSessionDir)
```

The Pi session directory must be under the Helmsman run:

```text
.helmsman/sessions/<run-id>/adapter/pi/sessions/
```

Acceptance evidence:

- Pi session file path is recorded in `evidence/pi-session-links.jsonl`
- `operation-state.json` links the operation to the Pi session id/path
- Helmsman Manifest events do not derive route state from the Pi JSONL file
- replay can rebuild the operation monitor after process exit

## Operation Lifecycle

Every Pi operation follows the same lifecycle:

```text
Core validates requested operation
-> Core records operation.started
-> runtime/pi creates prompt artifact
-> runtime/pi starts AgentSession or AgentSessionRuntime
-> runtime/pi subscribes to session events
-> event capture writes adapter/pi/<operation-id>.events.jsonl
-> runtime/pi writes last-message/evidence artifacts
-> Core records operation.finished
-> Core rebuilds operation-state.json and board.json
```

Required files:

```text
.helmsman/sessions/<run-id>/adapter/pi/<operation-id>.prompt.md
.helmsman/sessions/<run-id>/adapter/pi/<operation-id>.events.jsonl
.helmsman/sessions/<run-id>/adapter/pi/<operation-id>.last-message.md
.helmsman/sessions/<run-id>/evidence/pi-session-links.jsonl
.helmsman/sessions/<run-id>/operation-state.json
```

An operation finishing successfully is not route progress. Route progress
requires later Core events that accept artifacts or evidence.

## Event Capture Contract

Pi event capture must preserve enough evidence for run review without storing
unsafe payloads.

Each captured runtime event record:

```ts
interface PiCapturedEvent {
  operationId: string;
  capturedAt: string;
  piEventType: string;
  sequence: number;
  safeSummary: string;
  redaction: {
    applied: boolean;
    reasonCodes: string[];
  };
  rawRef?: string;
}
```

`rawRef` is optional and must point only to a redacted local artifact. Raw
provider envelopes, auth headers, API keys, OAuth tokens, and full environment
dumps are forbidden.

Text deltas may be coalesced for evidence, but event order must remain
recoverable.

## Timeout And Abort Contract

Gate 1 must distinguish:

- `timed_out`: Helmsman deadline expired.
- `aborted`: user or Core requested cancellation before deadline.
- `interrupted`: process exited, TUI closed, or runtime ended before Core
  received a terminal event.
- `failed`: Pi returned an error or setup failed.

Timeout behavior:

- Core records the requested timeout on `operation.started`.
- runtime/pi uses an `AbortController` or Pi-supported abort path.
- timeout produces `operation.finished` with `status: "timed_out"`.
- partial artifacts are marked candidate evidence only.
- retry/resume hints are written to `operation-state.json`.

Abort behavior:

- user/Core cancellation records a cancel request timestamp.
- runtime/pi calls the best available Pi abort path.
- terminal status is `aborted` only when the cancellation path was invoked.
- if the process dies without confirmation, status is `interrupted`.

## Provider Readiness Contract

Provider readiness reports are safe metadata:

```ts
interface PiProviderReadiness {
  checkedAt: string;
  packageVersion: string;
  nodeVersion: string;
  authStorage: "available" | "missing" | "error";
  modelRegistry: "available" | "empty" | "error";
  providers: Array<{
    providerId: string;
    configured: "yes" | "no" | "unknown";
    modelCount?: number;
    selectedModelId?: string;
    warnings: string[];
  }>;
  secretPolicy: {
    rawSecretsStored: false;
    checkedPaths: string[];
  };
}
```

Forbidden readiness output:

- raw API keys
- OAuth refresh/access tokens
- full credential file contents
- full request/response headers
- environment variable values
- provider debug dumps that may contain secrets

Missing credentials are not a product failure for `doctor`; they are a live QA
blocker for `verify:pi-runtime:live`.

## Capability Report

Gate 1 writes a safe capability report under the run:

```text
.helmsman/sessions/<run-id>/adapter/pi/capability-report.json
```

Required fields:

- package names and versions
- Node version
- import availability
- session modes supported
- settings/resource loader availability
- event subscription availability
- timeout/abort status
- provider readiness summary
- unsupported or unproved capabilities

This report informs role resolution later. It does not grant route authority.

## Doctor Contract

`doctor --json` must check:

- Node version satisfies `package.json#engines.node`
- package dependencies are installed
- Pi package versions match the pinned baseline
- Helmsman run root is writable when a run is requested
- `.helmsman` files can be written atomically
- provider readiness can be inspected without storing secrets
- no full product commands are reported as available until their entrypoints
  exist

Exit behavior:

- Exit `0` when the local runtime foundation is inspectable and any missing
  provider credential is reported as a readiness warning.
- Exit non-zero when imports fail, Node is incompatible, the Document Bus cannot
  write, or package versions drift from the pinned baseline.

`doctor` must not run update/install. Updates require explicit user approval.

## Verification Contract

Gate 1 adds focused verification before broader product verification exists.

### `verify:pi-runtime`

Required checks:

- import surface check
- package version and Node floor check
- in-memory session construction check
- persisted session path check
- Document Bus atomic write and replay check
- operation lifecycle event ordering check
- timeout status check
- abort status check
- redaction fixture check
- stale executable-claim scan

Fake providers may be used only in tests named as unit/contract tests.

### `verify:pi-runtime:live`

Required checks when provider credentials are available:

- model registry returns at least one usable model or the configured role model
- a real `createAgentSession` prompt runs
- event capture records runtime events
- last message artifact is written
- Pi session link evidence is written
- operation status reaches `completed`
- no route phase advances from the model response alone

If credentials are unavailable, the command reports `live_provider: unavailable`
and exits with a status that CI can treat separately from contract failure.

## Security Contract

Gate 1 must include a redaction scanner over `.helmsman/sessions/<run-id>/`.

It must flag likely leaks:

- `sk-` style API keys
- `Bearer ` headers
- OAuth refresh/access token field names
- known provider credential env var names with values
- serialized auth storage objects

The scanner may produce false positives. A false positive must be waived by a
Core event with reason and path, not by editing the scanner to ignore the
specific case silently.

## Non-Acceptance Cases

Gate 1 is not accepted if:

- Pi packages are added without import/runtime verification.
- command docs claim the TUI or product QA exists before code exists.
- live provider claims are backed only by fake providers.
- Pi session JSONL is used as Manifest authority.
- `operation.finished` advances route state.
- timeout, abort, and interrupted collapse into one failure bucket.
- provider credentials are written under `.helmsman`.
- verification checks implementation internals while bypassing the public
  Helmsman command/runtime surface.

## Handoff To Later Gates

Gate 1 hands these proven surfaces to later gates:

- Pi runtime import boundary
- provider/model readiness summary
- session creation and persisted evidence paths
- operation lifecycle events
- operation monitor projection
- timeout/abort semantics
- redaction policy
- focused verification command shape

Gate 2 has implemented full Manifest reducers and Board projection using the
same event and operation contracts. Gate 3 may now build the Pi TUI Workbench
on top of proven runtime, Core, Board, and TUI package imports. Gate 4 may
implement Question UI Adapter proofs without reopening the runtime foundation.
Later role execution, worker packet mapping, concurrency, and live-provider
role QA must follow
`docs/pi-role-runtime-contract.md`. Full install, update, uninstall, product
audit, and release gates must follow
`docs/install-doctor-product-audit-contract.md`.
