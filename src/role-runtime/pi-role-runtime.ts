import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { executeCoreCommand, type CoreCommandResult } from "../core/authority/core-store.ts";
import type {
  BoardProjection,
  EvidenceRecord,
  HelmsmanManifest,
  RoleBindingContract,
  RolePurpose,
  RoleRunPlan,
  RoleRunResult,
  RoleRunStatus,
} from "../core/authority/types.ts";
import { jsonLine } from "../core/document-bus/atomic-write.ts";
import { ensureRunDirs, type RunPaths } from "../core/document-bus/paths.ts";
import { scanForSecrets, safeSummary } from "../core/redaction/secrets.ts";
import { createHelmsmanPiSession, getLiveModelCandidates } from "../runtime/pi/session-factory.ts";

export interface RunPiRoleInput {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
  binding?: RoleBindingContract;
  roleId: string;
  purpose: RolePurpose;
  inputKind: RoleRunPlan["inputKind"];
  inputRef: string;
  mission: string;
  timeoutMs?: number;
}

export interface RunPiRoleOutput {
  result: RoleRunResult;
  core: CoreCommandResult;
  plan: RoleRunPlan;
}

export async function runPiRole(input: RunPiRoleInput): Promise<RunPiRoleOutput> {
  await ensureRunDirs(input.paths);
  let manifest = input.manifest;
  let board = input.board;
  let binding = input.binding ?? manifest.roles.bindings[input.roleId];
  if (!binding) {
    throw new Error(`Role binding ${input.roleId} is missing. Set it through Core before executing RoleRuntime.`);
  }

  if (input.binding) {
    const bound = await executeCoreCommand(input.paths, {
      commandType: "role.binding_set",
      cwd: input.paths.cwd,
      runId: input.paths.runId,
      actor: { kind: "core_policy", id: "role-runtime" },
      boardRevisionRead: board.revision,
      payload: {
        binding,
        evidenceIds: [],
      },
    });
    manifest = bound.manifest;
    board = bound.board;
    binding = manifest.roles.bindings[input.roleId];
  }

  if (binding.runtime !== "pi_agent_session") {
    throw new Error(`Role binding ${binding.roleId} uses ${binding.runtime}; this runner executes pi_agent_session roles only.`);
  }

  const roleRunId = `role-run-${randomUUID()}`;
  const operationId = `role-op-${randomUUID()}`;
  const runDir = join(input.paths.roleRunsRoot, roleRunId);
  const planPath = join(runDir, "plan.json");
  const promptPath = join(runDir, "prompt.md");
  const eventLogPath = join(runDir, "pi-events.jsonl");
  const transcriptPath = join(runDir, "transcript.jsonl");
  const toolEventsPath = join(runDir, "tool-events.jsonl");
  const artifactsPath = join(runDir, "artifacts.json");
  const diagnosticsPath = join(runDir, "diagnostics.json");
  const resultPath = join(runDir, "result.json");
  const lastMessagePath = join(runDir, "last-message.md");
  await mkdir(runDir, { recursive: true });

  const plan: RoleRunPlan = {
    schemaVersion: "helmsman.role-run-plan.v1",
    runId: input.paths.runId,
    roleRunId,
    operationId,
    roleId: binding.roleId,
    purpose: binding.purpose,
    boardRevision: board.revision,
    routeLockStatus: manifest.run.routeLock.status,
    inputKind: input.inputKind,
    inputRef: input.inputRef,
    promptPath,
    expectedArtifacts: binding.requiredArtifacts,
    allowedReadRoots: binding.sandboxPolicy.allowedReadRoots,
    allowedWriteRoots: binding.sandboxPolicy.allowedWriteRoots,
    stopConditions: manifest.route.stopConditions.map((condition) => condition.text),
    timeoutMs: input.timeoutMs ?? binding.budgets.timeoutMs,
    binding,
  };
  const promptText = buildRolePrompt({ manifest, board, plan, mission: input.mission });
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  await writeFile(promptPath, promptText, "utf8");
  await writeFile(eventLogPath, "", "utf8");
  await writeFile(transcriptPath, "", "utf8");
  await writeFile(toolEventsPath, "", "utf8");

  const planned = await executeCoreCommand(input.paths, {
    commandType: "role.run_plan",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "role-runtime" },
    boardRevisionRead: board.revision,
    payload: {
      roleRunId,
      operationId,
      roleId: binding.roleId,
      planPath,
      promptPath,
      boardRevisionRead: board.revision,
      runtime: "pi",
      eventLogPath,
      expectedArtifacts: binding.requiredArtifacts,
      timeoutMs: plan.timeoutMs,
    },
  });
  board = planned.board;

  const evidenceIds = [
    `role-run:${roleRunId}:pi-events`,
    `role-run:${roleRunId}:transcript`,
    `role-run:${roleRunId}:tool-events`,
    `role-run:${roleRunId}:result`,
  ];
  const startedAt = new Date().toISOString();
  let status: RoleRunStatus = "completed";
  let errorMessage: string | undefined;
  let piSessionId: string | undefined;
  let sessionFile: string | undefined;
  let lastMessage: string | undefined;
  let activeToolNames: string[] = [];
  let sessionStats: unknown;
  let contextUsage: unknown;
  let started: CoreCommandResult | undefined;
  const pendingWrites: Promise<void>[] = [];
  const model = resolveBoundModel(input.paths.cwd, binding);

  try {
    const sessionHandle = await createHelmsmanPiSession({
      cwd: input.paths.cwd,
      paths: input.paths,
      persistent: true,
      liveProvider: true,
      liveModel: model,
      allowedToolNames: binding.toolPolicy.allowedToolNames,
      systemPrompt: "You are Helmsman RoleRuntime. Execute the bounded role plan exactly. Final prose is evidence only and never completion authority.",
      thinkingLevel: thinkingForPi(binding.thinking),
    });
    piSessionId = sessionHandle.sessionId;
    sessionFile = sessionHandle.sessionFile;
    activeToolNames = sessionHandle.session.getActiveToolNames();
    started = await executeCoreCommand(input.paths, {
      commandType: "role.run_start",
      cwd: input.paths.cwd,
      runId: input.paths.runId,
      actor: { kind: "role_runner", id: "pi-agent-session", roleId: binding.roleId, operationId },
      boardRevisionRead: board.revision,
      payload: {
        roleRunId,
        operationId,
        runtime: "pi",
        piSessionId,
        eventLogPath,
      },
    });
    board = started.board;

    let sequence = 0;
    const unsubscribe = sessionHandle.session.subscribe((event: AgentSessionEvent) => {
      pendingWrites.push(recordPiEvent({ event, eventLogPath, transcriptPath, toolEventsPath, operationId, sequence: sequence++ }));
    });
    try {
      await promptWithTimeout(sessionHandle.session.prompt(promptText), plan.timeoutMs, () => sessionHandle.session.abort());
      lastMessage = sessionHandle.session.getLastAssistantText()?.trim();
      await writeFile(lastMessagePath, `${lastMessage ?? ""}\n`, "utf8");
    } catch (error) {
      status = error instanceof RoleRuntimeTimeoutError ? "timed_out" : "failed";
      errorMessage = error instanceof Error ? error.message : String(error);
      await writeFile(lastMessagePath, `${errorMessage}\n`, "utf8");
    } finally {
      unsubscribe();
      sessionStats = sessionHandle.session.getSessionStats();
      contextUsage = sessionHandle.session.getContextUsage();
      sessionHandle.session.dispose();
    }
  } catch (error) {
    status = "failed";
    errorMessage = error instanceof Error ? error.message : String(error);
    await writeFile(lastMessagePath, `${errorMessage}\n`, "utf8");
  }

  await Promise.allSettled(pendingWrites);
  await writeFile(artifactsPath, `${JSON.stringify({ expectedArtifacts: binding.requiredArtifacts, producedArtifacts: [] }, null, 2)}\n`, "utf8");
  const redactionFindings = await scanForSecrets(runDir);
  await writeFile(
    diagnosticsPath,
    `${JSON.stringify(
      {
        provider: binding.provider,
        model: binding.model,
        thinking: binding.thinking,
        activeToolNames,
        sessionStats,
        contextUsage,
        redactionFindings,
        routeAuthority: "unchanged",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const finishedAt = new Date().toISOString();
  const result: RoleRunResult = {
    schemaVersion: "helmsman.role-run-result.v1",
    runId: input.paths.runId,
    roleRunId,
    operationId,
    roleId: binding.roleId,
    purpose: binding.purpose,
    status,
    startedAt,
    finishedAt,
    runtime: "pi",
    provider: binding.provider,
    model: binding.model,
    thinking: binding.thinking,
    piSessionId,
    sessionFile,
    promptPath,
    eventLogPath,
    transcriptPath,
    toolEventsPath,
    artifactsPath,
    diagnosticsPath,
    resultPath,
    lastMessagePath,
    artifactIds: [],
    evidenceIds,
    routeAuthority: "unchanged",
    finalMessageIsCompletion: false,
    errorMessage,
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const finish = await executeCoreCommand(input.paths, {
    commandType: "role.run_finish",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "role_runner", id: "pi-agent-session", roleId: binding.roleId, operationId },
    boardRevisionRead: (started ?? planned).board.revision,
    payload: {
      roleRunId,
      operationId,
      eventLogPath,
      transcriptPath,
      toolEventsPath,
      artifactsPath,
      diagnosticsPath,
      resultPath,
      lastMessagePath,
      status,
      artifactIds: [],
      producedArtifacts: [],
      evidenceIds,
    },
  });

  return { result, core: finish, plan };
}

export function roleRunEvidenceRecords(result: RoleRunResult): EvidenceRecord[] {
  return [
    { evidenceId: `role-run:${result.roleRunId}:pi-events`, kind: "role_run.pi_events", path: result.eventLogPath, summary: "Pi AgentSession event stream captured for role run.", recordedAt: result.finishedAt },
    { evidenceId: `role-run:${result.roleRunId}:transcript`, kind: "role_run.transcript", path: result.transcriptPath, summary: "Role run transcript evidence captured.", recordedAt: result.finishedAt },
    { evidenceId: `role-run:${result.roleRunId}:tool-events`, kind: "role_run.tool_events", path: result.toolEventsPath, summary: "Role run tool-event evidence captured.", recordedAt: result.finishedAt },
    { evidenceId: `role-run:${result.roleRunId}:result`, kind: "role_run.result", path: result.resultPath, summary: "Sealed RoleRunResult captured; final message remains evidence only.", recordedAt: result.finishedAt },
  ];
}

function buildRolePrompt(input: {
  manifest: HelmsmanManifest;
  board: BoardProjection;
  plan: RoleRunPlan;
  mission: string;
}): string {
  return [
    "# Helmsman Role Run",
    "",
    "This is a bounded RoleRuntime execution. The Pi AgentSession transcript is evidence only.",
    "",
    `Run: ${input.plan.runId}`,
    `Role run: ${input.plan.roleRunId}`,
    `Role: ${input.plan.roleId}`,
    `Purpose: ${input.plan.purpose}`,
    `Board revision read: ${input.plan.boardRevision}`,
    `Route lock status: ${input.plan.routeLockStatus}`,
    "",
    "## Route",
    `Goal: ${input.manifest.route.goal}`,
    "",
    "Scope:",
    ...(input.manifest.route.scope.length === 0 ? ["- pending"] : input.manifest.route.scope.map((item) => `- ${item.text}`)),
    "",
    "Non-goals:",
    ...(input.manifest.route.nonGoals.length === 0 ? ["- none recorded"] : input.manifest.route.nonGoals.map((item) => `- ${item.text}`)),
    "",
    "Stop conditions:",
    ...(input.plan.stopConditions.length === 0 ? ["- stop on authority mismatch, missing evidence, or scope expansion"] : input.plan.stopConditions.map((item) => `- ${item}`)),
    "",
    "## Board",
    `Next legal action: ${input.board.nextLegalAction.kind} - ${input.board.nextLegalAction.reason}`,
    `Open blockers: ${input.board.blockers.length}`,
    ...input.board.blockers.slice(0, 8).map((blocker) => `- ${blocker.blockerId}: ${blocker.reason}`),
    "",
    "## Mission",
    input.mission,
    "",
    "## Allowed Boundaries",
    `Allowed read roots: ${input.plan.allowedReadRoots.join(", ") || "none"}`,
    `Allowed write roots: ${input.plan.allowedWriteRoots.join(", ") || "none"}`,
    `Required artifacts: ${input.plan.expectedArtifacts.map((artifact) => artifact.expectedPath).join(", ") || "none"}`,
    "",
    "## Forbidden Actions",
    ...input.plan.binding.forbiddenAuthorityClaims.map((claim) => `- ${claim}`),
    "- Do not broaden scope.",
    "- Do not write Manifest, Board, route-card, verification, or closeout authority files.",
    "- Do not expose provider credentials or raw secrets.",
    "",
    "Respond with evidence for this bounded role run only. Do not claim completion.",
  ].join("\n");
}

function resolveBoundModel(cwd: string, binding: RoleBindingContract): Model<any> {
  const model = getLiveModelCandidates(cwd).find((candidate) => String(candidate.provider) === binding.provider && candidate.id === binding.model);
  if (!model) {
    throw new Error(`live_provider_unavailable:binding_model_not_configured:${binding.provider}:${binding.model}`);
  }
  return model;
}

function thinkingForPi(thinking: RoleBindingContract["thinking"]): ThinkingLevel | undefined {
  return thinking === "off" ? "off" : thinking;
}

async function recordPiEvent(input: {
  event: AgentSessionEvent;
  eventLogPath: string;
  transcriptPath: string;
  toolEventsPath: string;
  operationId: string;
  sequence: number;
}): Promise<void> {
  const summary = safeSummary(input.event);
  const record = {
    operationId: input.operationId,
    capturedAt: new Date().toISOString(),
    piEventType: input.event.type,
    sequence: input.sequence,
    safeSummary: summary.text,
    redaction: {
      applied: summary.applied,
      reasonCodes: summary.reasonCodes,
    },
  };
  await appendFile(input.eventLogPath, jsonLine(record), "utf8");
  if (input.event.type.startsWith("message_") || input.event.type === "turn_start" || input.event.type === "turn_end") {
    await appendFile(input.transcriptPath, jsonLine(record), "utf8");
  }
  if (input.event.type.startsWith("tool_execution_")) {
    await appendFile(input.toolEventsPath, jsonLine(record), "utf8");
  }
}

class RoleRuntimeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`RoleRuntime timed out after ${timeoutMs}ms.`);
    this.name = "RoleRuntimeTimeoutError";
  }
}

async function promptWithTimeout(prompt: Promise<void>, timeoutMs: number, onTimeout: () => void): Promise<void> {
  let timedOut = false;
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      onTimeout();
      reject(new RoleRuntimeTimeoutError(timeoutMs));
    }, timeoutMs);
  });
  try {
    await Promise.race([prompt, timeoutPromise]);
  } catch (error) {
    if (timedOut) throw error;
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
