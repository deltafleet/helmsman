# Pi Role Runtime Contract

Status: current binding design and implemented foundation for role execution,
worker packet mapping, and Pi AgentSession evidence

## Purpose

This contract closes the gap between Helmsman Core authority and Pi's agent
runtime. It defines how a Core-approved role run becomes a Pi AgentSession, how
worker packets are executed, how concurrent runs are bounded, and which evidence
Core must inspect before Manifest or Board state may move.

This is not an adapter convenience layer. It is the product boundary that keeps
Autopilot, research workers, auditors, and verifiers useful without letting a
model session become the workflow authority.

## Decision

The role runtime is Core-owned.

```text
Manifest + Board revision
-> Core prepares RoleRunPlan
-> RoleRuntime resolves provider/model/tools/sandbox
-> Pi AgentSession executes bounded prompt
-> event stream and artifacts are recorded
-> Core evaluates route adherence and artifact contracts
-> Manifest events accept, reject, amend, park, or verify
-> Board projection updates
```

The Pi AgentSession is an execution substrate. Its transcript, tool events,
usage, and final message are evidence only. They cannot change route lock,
phase, artifact acceptance, verification status, or closeout state without Core
events.

## Verified Pi Package Surface

Checked on 2026-05-27 from package tarballs:

```text
@earendil-works/pi-coding-agent: 0.75.5
@earendil-works/pi-agent-core: 0.75.5
@earendil-works/pi-ai: 0.75.5
```

Relevant public exports:

```text
createAgentSession
createAgentSessionRuntime
AgentSession
AgentSessionRuntime
SessionManager
SettingsManager
DefaultResourceLoader
AuthStorage
ModelRegistry
defineTool
createReadOnlyTools
createCodingTools
createReadTool
createBashTool
createEditTool
createWriteTool
getModel
getSupportedThinkingLevels
clampThinkingLevel
calculateCost
```

Relevant `AgentSession` methods and properties:

```text
subscribe(listener)
prompt(text, options)
sendUserMessage(content, options)
steer(text)
followUp(text)
abort()
setModel(model)
setThinkingLevel(level)
getActiveToolNames()
setActiveToolsByName(toolNames)
getSessionStats()
getContextUsage()
sessionId
sessionFile
messages
isStreaming
```

Relevant Pi event names exposed by the type surface:

```text
agent_start
agent_end
turn_start
turn_end
message_start
message_update
message_end
tool_execution_start
tool_execution_update
tool_execution_end
queue_update
compaction_start
compaction_end
auto_retry_start
auto_retry_end
thinking_level_changed
session_info_changed
```

Implementation re-verifies this package surface through the current runtime and
RoleRuntime verification scripts before claiming the implemented foundation
surface. The remaining memory/research worker packet behavior still requires
Gate 5 implementation.

## Authority Boundaries

Core owns:

- role binding validity
- run authorization
- Board revision checks
- autonomy boundary checks
- worker packet construction
- allowed read/write/tool policy
- artifact contract validation
- evidence acceptance
- route-adherence judgment
- phase advancement
- retry, repair, amendment, parking, and closeout decisions

RoleRuntime owns:

- resolving a role binding to Pi runtime inputs
- creating or resuming an AgentSession
- applying model, thinking, tool, and sandbox policy
- capturing Pi events
- enforcing timeout and abort signals
- recording transcript, usage, diagnostics, and artifacts
- returning a sealed `RoleRunResult`

Pi owns:

- provider/model request execution
- model streaming
- tool-call orchestration inside the allowed tool set
- session history and compaction mechanics
- provider usage/cost metadata when available

External adapters own only host-specific execution. They use the same
`RoleRunPlan` and result contract when selected by Core.

## Files

One Helmsman run stores role runtime state under the run directory:

```text
.helmsman/sessions/<run-id>/
  role-registry.json
  role-runs/
    <role-run-id>/
      plan.json
      prompt.md
      pi-events.jsonl
      transcript.jsonl
      tool-events.jsonl
      artifacts.json
      diagnostics.json
      result.json
```

`role-registry.json` is derived from Manifest events and configuration. The
`role-runs/<id>/` directory is operation evidence. It is not a source of truth
until Core records Manifest events that reference its evidence ids.

## Current Implementation Status

The current checkout implements the RoleRuntime foundation:

- `helmsman role-runtime bind-live`
- `helmsman role-runtime run --auto-bind-live`
- Core `role.binding_set`, `role.run_plan`, `role.run_start`, and
  `role.run_finish` commands
- Manifest events for role binding, planning, start, evidence capture, finish,
  operation start, operation finish, and expected artifacts
- live Pi provider/model resolution through installed Pi settings
- bounded Pi AgentSession execution with configurable allowed tool names
- role-run `plan.json`, `prompt.md`, `pi-events.jsonl`, `transcript.jsonl`,
  `tool-events.jsonl`, `artifacts.json`, `diagnostics.json`, and `result.json`
- Core evidence records proving event stream, transcript, tool-event log, and
  sealed result capture
- focused `npm run verify:role-runtime`

Gate 5B now builds on this foundation for scoped memory scan, research lane
declaration, research worker packets, research artifact validation, synthesis,
and Memory/Research Board/TUI projection. Gate 6 now builds on the same Core
authority layer for Route Lock and amendments. This RoleRuntime foundation is
not itself Autopilot, Verification/Closeout, product audit, or release
publication readiness.

## Role Binding

```ts
interface RoleBindingContract {
  roleId: RoleId;
  purpose:
    | "chat"
    | "charting"
    | "memory_scan"
    | "research"
    | "synthesis"
    | "autopilot"
    | "audit"
    | "verification"
    | "closeout";
  runtime: "pi_agent_session" | "codex_adapter" | "opencode_adapter" | "omp_adapter" | "claude_adapter";
  provider: string;
  model: string;
  api?: string;
  thinking: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  mode: "auto" | "fast" | "deep";
  toolPolicy: ToolPolicyContract;
  sandboxPolicy: SandboxPolicyContract;
  concurrency: RoleConcurrencyContract;
  budgets: RoleBudgetContract;
  fallback: RoleFallbackContract;
  requiredArtifacts: RequiredArtifactContract[];
  forbiddenAuthorityClaims: string[];
}

interface ToolPolicyContract {
  allowedToolNames: string[];
  network: "forbidden" | "allowed" | "approval_required";
  filesystem: "read_only" | "declared_writes_only" | "workspace_write";
  shell: "forbidden" | "read_only" | "declared_commands" | "allowed";
  customTools: string[];
}

interface SandboxPolicyContract {
  cwd: string;
  allowedReadRoots: string[];
  allowedWriteRoots: string[];
  deniedRoots: string[];
  secretsPolicy: "no_secret_output" | "provider_auth_only";
}

interface RoleConcurrencyContract {
  class: "lead" | "research_worker" | "implementation_worker" | "auditor" | "verifier";
  maxParallel: number;
  queue: "fifo" | "priority";
  leaseMs: number;
}

interface RoleBudgetContract {
  maxTurns?: number;
  timeoutMs: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxCostUsd?: number;
}

interface RoleFallbackContract {
  onMissingAuth: "block" | "fallback_role" | "ask_user";
  onModelUnsupportedThinking: "clamp_and_record" | "block";
  onRuntimeUnavailable: "fallback_role" | "block";
  fallbackRoleId?: RoleId;
}
```

Fallback is explicit. A fallback model or adapter cannot silently weaken the
route, lower the autonomy boundary, remove required artifacts, or turn a live
provider proof into a mock proof.

## Role Run Plan

```ts
interface RoleRunPlan {
  runId: RunId;
  roleRunId: string;
  operationId: OperationId;
  roleId: RoleId;
  purpose: RoleBindingContract["purpose"];
  boardRevision: Revision;
  routeLockStatus: RunState["routeLock"]["status"];
  inputKind: "chat" | "charting_bundle" | "memory_scan" | "research_lane" | "worker_packet" | "autopilot_step" | "verification_scenario";
  inputRef: string;
  promptPath: string;
  expectedArtifacts: RequiredArtifactContract[];
  allowedReadRoots: string[];
  allowedWriteRoots: string[];
  stopConditions: string[];
  timeoutMs: number;
  binding: RoleBindingContract;
}
```

Core must build the plan from the current Manifest and Board revision. A stale
Board revision invalidates the plan before launch.

## Worker Packet Mapping

A worker packet is not a prompt blob. It is a Core-authored execution contract.

```text
ResearchLane or Autopilot task
-> WorkerPacketContract
-> RoleRunPlan
-> Pi AgentSession prompt
-> artifacts and evidence
-> Core acceptance or rejection
```

The generated Pi prompt must include:

- route goal, scope, non-goals, and stop conditions
- current Board revision and relevant Board blockers
- selected lane or task id
- precise mission
- allowed read roots
- allowed write roots
- required output artifacts
- done criteria
- forbidden actions
- evidence expectations
- instruction that final prose is not completion

The prompt must not include:

- provider credentials
- hidden Core validation shortcuts
- permission to mutate Manifest or Board directly
- permission to broaden scope
- permission to mark route lock, verification, or closeout complete

## Pi AgentSession Execution

The Pi implementation path is:

```ts
const { session } = await createAgentSession({
  cwd,
  agentDir,
  authStorage,
  model,
  thinkingLevel,
  tools: allowedToolNames,
  resourceLoader,
  sessionManager,
  sessionStartEvent,
});

const unsubscribe = session.subscribe(recordPiEvent);
await session.prompt(promptText, { source: "sdk" });
```

This sketch is illustrative. Product code must use the actual type surface and
must record diagnostics when package behavior differs.

For each run, RoleRuntime must:

- subscribe before the first prompt
- write every Pi event to `pi-events.jsonl`
- write user/assistant/tool transcript records to `transcript.jsonl`
- split tool execution records into `tool-events.jsonl`
- record session id, session file, model, provider, thinking level, active
  tools, context usage, token usage, and cost when available
- abort on timeout through `session.abort()`
- dispose or release session resources after settlement
- write `result.json` only after the event stream has settled

## Event Mapping

Pi events are runtime evidence. Core events are authority.

| Pi event | RoleRuntime evidence | Core authority effect |
| --- | --- | --- |
| `agent_start` | append `role_run.pi_agent_started` evidence | none |
| `turn_start` | append turn evidence | none |
| `message_start`/`message_update`/`message_end` | append transcript evidence | none |
| `tool_execution_start`/`update`/`end` | append tool evidence and diagnostics | none |
| `turn_end` | append turn summary and tool result refs | none |
| `compaction_start`/`compaction_end` | append context-management evidence | none |
| `auto_retry_start`/`auto_retry_end` | append retry evidence | none |
| `agent_end` | append settlement evidence | Core may evaluate result |

Core may then record separate Manifest events such as `artifact.submitted`,
`artifact.accepted`, `verification.result_recorded`, `autopilot.loop_finished`,
or `operation.finished`. Those authority events must cite the role-run evidence
ids they rely on.

## Result Contract

```ts
interface RoleRunResult {
  roleRunId: string;
  operationId: OperationId;
  status:
    | "completed"
    | "failed"
    | "timed_out"
    | "aborted"
    | "blocked"
    | "rejected";
  piSessionId?: string;
  piSessionFile?: string;
  startedAt: string;
  finishedAt: string;
  boardRevisionRead: Revision;
  binding: {
    roleId: RoleId;
    runtime: RoleBindingContract["runtime"];
    provider: string;
    model: string;
    thinking: RoleBindingContract["thinking"];
    mode: RoleBindingContract["mode"];
    activeTools: string[];
  };
  usage?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    costUsd?: number;
  };
  artifacts: Array<{
    expectedArtifactId: ArtifactId;
    path: string;
    exists: boolean;
    sha256?: string;
    sizeBytes?: number;
  }>;
  evidenceIds: EvidenceId[];
  diagnostics: RoleRunDiagnostic[];
}

interface RoleRunDiagnostic {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  evidenceIds: EvidenceId[];
}
```

`completed` means Pi execution settled. It does not mean the task succeeded at
the product level. Core must separately evaluate artifact contracts, route
adherence, and verification scenarios.

## Concurrency Contract

Core schedules role runs; Pi sessions execute them.

Rules:

- Lead roles default to `maxParallel: 1`.
- Research workers may run in parallel up to the selected lane cap.
- Implementation workers require a locked route and Board-approved packets.
- Auditors and verifiers may run in parallel only when their scenario inputs do
  not share writable artifacts.
- Two role runs may not write to the same declared artifact path.
- A role run lease must expire into `blocked` or `timed_out`, never into silent
  success.
- Queue state is rebuildable from Manifest events and role-run evidence.

Parallelism is a throughput mechanism, not a relaxation of route authority.
For Autopilot, role dispatch must also satisfy
`docs/autopilot-loop-contract.md`: every packet references the locked route
snapshot hash, the Board revision read, declared write roots, stop conditions,
and forbidden authority claims before any Pi AgentSession or external adapter
is launched.

## Artifact Acceptance

RoleRuntime records artifacts. Core accepts or rejects them.

Core must reject a role-run artifact when:

- it is outside the allowed write roots
- it was not declared in the plan
- it is missing after a `completed` run
- it conflicts with the expected artifact kind
- it lacks required evidence citations
- it claims route lock, verification pass, or closeout without a Core event
- it violates a stop condition or autonomy boundary
- the Board revision read by the run is stale for that artifact decision

Rejected artifacts remain evidence. They do not move the Board except through a
diagnostic, blocker, repair, or drift event.

## Failure And Recovery

RoleRuntime must distinguish:

- missing auth
- missing model
- unsupported thinking level
- provider error
- context overflow
- tool policy violation
- timeout
- user abort
- process interruption
- artifact missing
- route-adherence failure
- Core rejection

Recovery actions are Core decisions:

```text
retry same binding
fallback role
repair prompt or artifact
return to Charting
create route amendment
park the operation
stop and ask the user
```

No automatic retry may bypass Board revision checks, autonomy boundaries,
artifact contracts, or budget limits.

## Live Provider QA

Unit tests may use fake providers to test deterministic reducers and event
handling. Product-surface claims require live provider evidence.

The live-provider QA must prove:

- auth readiness is reported without storing secrets under `.helmsman`
- a real Pi AgentSession can start in a real workspace
- a bounded prompt can complete
- events are captured
- usage/cost metadata is recorded when available
- timeout and abort produce inspectable terminal states
- expected artifacts are validated by Core rather than accepted by transcript
  wording

Live QA is allowed to be skipped only with an explicit blocked status in product
audit evidence. A skipped live QA cannot be counted as proved.

## Verification Contract

The role runtime gate is accepted only when focused verification proves:

- role binding schema validation
- provider/model/thinking resolution, including clamping diagnostics
- missing-auth blocking without secret capture
- tool allowlist enforcement
- worker packet to prompt mapping
- Board revision stale-plan rejection
- Pi event capture from a real AgentSession
- timeout and abort state reconstruction
- artifact allowed-path validation
- artifact declaration and hash recording
- Core rejection of final-message-only completion
- research-worker concurrency cap
- write-path collision rejection
- live-provider smoke, when credentials are available

These checks must be mapped into product audit requirements before release.

## Non-Acceptance Cases

Do not claim the role runtime is accepted if:

- only a prompt template exists
- the role runner calls Pi without recording events
- worker packets are pasted into a chat transcript manually
- final assistant prose is treated as completion
- a fallback model silently changes the route or removes artifacts
- fake providers are used as evidence for live provider behavior
- concurrency is controlled only by convention
- artifacts are accepted because they exist on disk without Core validation
- secrets appear in `.helmsman` evidence
- Board revision is not read before launch

## Handoff

This contract feeds:

- Gate 1 runtime foundation, for the minimal Pi session proof
- Gate 5 memory and research, for research worker execution
- Gate 7 Board-governed Autopilot, for repeated bounded role runs
- Gate 8 verification and closeout, for verifier role execution
- Gate 9 product QA, for no-mock evidence mapping

The next implementation work should not invent local role-run state shapes. It
should implement this contract or explicitly amend it before code lands.
