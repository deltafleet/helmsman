import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { executeCoreCommand, type CoreCommandResult } from "../core/authority/core-store.ts";
import type {
  AutopilotActionSelection,
  AutopilotDriftRecord,
  AutopilotDriftResponse,
  AutopilotLoopFinishRecord,
  AutopilotLoopPlan,
  AutopilotLoopStatus,
  AutopilotPacket,
  AutopilotRouteAdherence,
  BoardNextAction,
  BoardProjection,
  HelmsmanManifest,
  RequiredArtifactContract,
  RoleBindingContract,
  RunStage,
} from "../core/authority/types.ts";
import { atomicWriteFile } from "../core/document-bus/atomic-write.ts";
import { ensureRunDirs, type RunPaths } from "../core/document-bus/paths.ts";
import { runPiRole, type RunPiRoleOutput } from "../role-runtime/pi-role-runtime.ts";

export interface AutopilotStateInput {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
}

export interface AutopilotPreconditionBlocker {
  blockerId: string;
  code:
    | "ROUTE_LOCK_REQUIRED"
    | "LOCKED_SNAPSHOT_MISSING"
    | "BOARD_ACTION_ILLEGAL"
    | "BOARD_REVISION_STALE"
    | "AMENDMENT_PENDING"
    | "AUTOPILOT_BLOCKER"
    | "AUTOPILOT_ALREADY_ACTIVE"
    | "WRITE_ROOT_CONFLICT"
    | "ROLE_BINDING_MISSING";
  reason: string;
}

export interface StartAutopilotLoopInput extends AutopilotStateInput {
  roleId?: string;
  mission?: string;
  allowedReadRoots?: string[];
  allowedWriteRoots?: string[];
  expectedArtifacts?: RequiredArtifactContract[];
  acceptanceCriteria?: string[];
  maxRoleRuns?: number;
  maxRepairPasses?: number;
  maxAuditPasses?: number;
  timeoutMs?: number;
  requireDispatchReady?: boolean;
}

export interface PreparedAutopilotLoop {
  plan: AutopilotLoopPlan;
  actionSelection: AutopilotActionSelection;
  packets: AutopilotPacket[];
  planPath: string;
  packetPaths: string[];
}

export interface StartAutopilotLoopOutput extends PreparedAutopilotLoop {
  core: CoreCommandResult;
}

export interface FinishAutopilotLoopInput extends AutopilotStateInput {
  loopId: string;
  status: AutopilotLoopStatus;
  adherenceStatus: AutopilotRouteAdherence["status"];
  reason: string;
  requiredResponse: AutopilotDriftResponse;
  evidenceIds?: string[];
  nextStage?: RunStage;
}

export function evaluateAutopilotPreconditions(input: AutopilotStateInput & {
  roleId?: string;
  allowedWriteRoots?: string[];
  requireDispatchReady?: boolean;
}): { ok: boolean; blockers: AutopilotPreconditionBlocker[] } {
  const blockers: AutopilotPreconditionBlocker[] = [];
  const routeLock = input.manifest.run.routeLock;
  if (routeLock.status !== "locked") {
    blockers.push({ blockerId: "route-lock-required", code: "ROUTE_LOCK_REQUIRED", reason: "Autopilot requires a user-confirmed locked route." });
  }
  if (!routeLock.snapshotHash || !routeLock.snapshotPath || !routeLock.lockEventId) {
    blockers.push({ blockerId: "locked-snapshot-missing", code: "LOCKED_SNAPSHOT_MISSING", reason: "Autopilot requires locked snapshot path, hash, and lock event id." });
  }
  if (input.board.nextLegalAction.kind !== "run_autopilot_loop") {
    blockers.push({ blockerId: "board-action-illegal", code: "BOARD_ACTION_ILLEGAL", reason: `Board next legal action is ${input.board.nextLegalAction.kind}, not run_autopilot_loop.` });
  }
  if (input.board.nextLegalAction.requiredBoardRevision !== input.board.revision) {
    blockers.push({ blockerId: "board-revision-stale", code: "BOARD_REVISION_STALE", reason: "Board next legal action does not require the current Board revision." });
  }
  for (const pendingId of Object.keys(input.manifest.amendments.pending)) {
    blockers.push({ blockerId: `pending-amendment:${pendingId}`, code: "AMENDMENT_PENDING", reason: `Route amendment ${pendingId} is pending.` });
  }
  for (const blocker of input.board.blockers.filter((candidate) => candidate.blocks === "autopilot" && candidate.severity === "hard")) {
    blockers.push({ blockerId: blocker.blockerId, code: "AUTOPILOT_BLOCKER", reason: blocker.reason });
  }
  const activeLoop = Object.values(input.manifest.autopilot.loops).find((loop) => loop.status === "planned" || loop.status === "running");
  if (activeLoop) {
    blockers.push({ blockerId: `active-loop:${activeLoop.loopId}`, code: "AUTOPILOT_ALREADY_ACTIVE", reason: `Autopilot loop ${activeLoop.loopId} is already ${activeLoop.status}.` });
  }
  const writeRoots = input.allowedWriteRoots ?? [];
  if (writeRoots.length > 0 && activeWriteRootsConflict(input.manifest, writeRoots)) {
    blockers.push({ blockerId: "write-root-conflict", code: "WRITE_ROOT_CONFLICT", reason: "Declared Autopilot write roots conflict with active packets." });
  }
  const roleId = input.roleId ?? "autopilot-implementer";
  if (input.requireDispatchReady && !input.manifest.roles.bindings[roleId]) {
    blockers.push({ blockerId: `role-binding:${roleId}`, code: "ROLE_BINDING_MISSING", reason: `Role binding ${roleId} is required before Autopilot launch.` });
  }
  return { ok: blockers.length === 0, blockers };
}

export async function prepareAutopilotLoop(input: StartAutopilotLoopInput): Promise<PreparedAutopilotLoop> {
  await ensureRunDirs(input.paths);
  const roleId = input.roleId ?? "autopilot-implementer";
  const preconditions = evaluateAutopilotPreconditions({ ...input, roleId, requireDispatchReady: input.requireDispatchReady ?? true });
  if (!preconditions.ok) {
    throw new Error(`Autopilot preconditions failed: ${preconditions.blockers.map((blocker) => `${blocker.code}:${blocker.reason}`).join("; ")}`);
  }

  const loopId = `autopilot-loop-${randomUUID().slice(0, 8)}`;
  const packetId = `autopilot-packet-${randomUUID().slice(0, 8)}`;
  const operationId = `autopilot-op-${randomUUID().slice(0, 8)}`;
  const loopDir = `autopilot/loops/${loopId}`;
  const planPath = `${loopDir}/plan.json`;
  const packetPath = `${loopDir}/${packetId}.json`;
  const evidenceCapturePath = `${loopDir}/evidence.jsonl`;
  const allowedWriteRoots = input.allowedWriteRoots ?? [`${loopDir}/artifacts`];
  const expectedArtifacts = input.expectedArtifacts ?? [
    {
      artifactId: `autopilot-artifact-${loopId}`,
      kind: "autopilot.loop_report",
      expectedPath: `${loopDir}/artifacts/loop-report.md`,
      required: true,
      description: "Autopilot loop report with route-adherence evidence.",
    },
  ];
  const idempotencyKey = `autopilot:${input.paths.runId}:r${input.board.revision}:${input.board.projectionHash}:${input.manifest.run.routeLock.snapshotHash}`;
  const packetPaths = [packetPath];
  const plannedOperationIds = [operationId];
  const actionSelection: AutopilotActionSelection = {
    loopId,
    boardRevisionRead: input.board.revision,
    boardProjectionHash: input.board.projectionHash,
    routeLockEventId: input.manifest.run.routeLock.lockEventId ?? "",
    lockedSnapshotHash: input.manifest.run.routeLock.snapshotHash ?? "",
    selectedAction: input.board.nextLegalAction,
    reason: input.board.nextLegalAction.reason,
    plannedOperationIds,
    packetPaths,
    idempotencyKey,
  };
  const stopConditions = input.manifest.route.stopConditions.length === 0
    ? [{ conditionId: "authority-mismatch", description: "Stop on route authority mismatch, missing evidence, scope expansion, or forbidden authority claim." }]
    : input.manifest.route.stopConditions.map((condition) => ({ conditionId: condition.id, description: condition.text }));
  const forbiddenAuthorityClaims = [
    "Do not claim Route Lock.",
    "Do not mutate Manifest or Board directly.",
    "Do not accept artifacts.",
    "Do not mark verification, closeout, release, or product completion.",
    "Final prose is evidence only.",
  ];
  const packet: AutopilotPacket = {
    schemaVersion: "helmsman.autopilot-packet.v1",
    runId: input.paths.runId,
    loopId,
    packetId,
    operationId,
    boardRevisionRead: input.board.revision,
    boardProjectionHash: input.board.projectionHash,
    lockedSnapshotPath: input.manifest.run.routeLock.snapshotPath ?? "",
    lockedSnapshotHash: input.manifest.run.routeLock.snapshotHash ?? "",
    roleId,
    rolePurpose: "autopilot",
    mission: input.mission ?? "Execute the next Board-selected Autopilot step inside the locked route and produce only declared artifacts.",
    boardExcerpt: {
      nextLegalAction: input.board.nextLegalAction,
      blockers: input.board.blockers,
      routeLock: input.manifest.run.routeLock,
    },
    allowedReadRoots: input.allowedReadRoots ?? [".", input.manifest.run.routeLock.snapshotPath ?? "route-lock/snapshot.json", "rendered/route-card.md"],
    allowedWriteRoots,
    requiredArtifacts: expectedArtifacts,
    stopConditions,
    forbiddenAuthorityClaims,
    evidenceCapturePath,
    retryPolicy: { maxAttempts: 1, idempotencyKey },
    resumePolicy: { resumeFromPlan: true, duplicateExecution: "reject" },
  };
  const plan: AutopilotLoopPlan = {
    schemaVersion: "helmsman.autopilot-loop-plan.v1",
    runId: input.paths.runId,
    loopId,
    attempt: nextAttempt(input.manifest),
    boardRevisionRead: input.board.revision,
    boardProjectionHash: input.board.projectionHash,
    routeLockEventId: input.manifest.run.routeLock.lockEventId ?? "",
    lockedSnapshotPath: input.manifest.run.routeLock.snapshotPath ?? "",
    lockedSnapshotHash: input.manifest.run.routeLock.snapshotHash ?? "",
    nextLegalAction: input.board.nextLegalAction,
    actionReason: input.board.nextLegalAction.reason,
    autonomyBoundaryIds: autonomyBoundaryIds(input.manifest),
    packetPaths,
    roleRunPlanRefs: [],
    externalAdapterPlans: [],
    expectedArtifacts,
    acceptanceCriteria: (input.acceptanceCriteria ?? input.manifest.route.successCriteria.map((criterion) => criterion.text)).map((description, index) => ({
      criterionId: `autopilot-criterion-${index + 1}`,
      description,
      required: true,
    })),
    forbiddenClaims: forbiddenAuthorityClaims,
    stopConditions,
    maxRoleRuns: input.maxRoleRuns ?? 1,
    maxRepairPasses: input.maxRepairPasses ?? 1,
    maxAuditPasses: input.maxAuditPasses ?? 1,
    timeoutMs: input.timeoutMs ?? 120000,
    idempotencyKey,
    createdAt: new Date().toISOString(),
  };
  await mkdir(join(input.paths.runRoot, `${loopDir}/artifacts`), { recursive: true });
  await atomicWriteFile(join(input.paths.runRoot, planPath), `${JSON.stringify(plan, null, 2)}\n`);
  await atomicWriteFile(join(input.paths.runRoot, packetPath), `${JSON.stringify(packet, null, 2)}\n`);
  await atomicWriteFile(input.paths.autopilotIndexPath, renderAutopilotIndex(input.manifest, plan));
  return { plan, actionSelection, packets: [packet], planPath, packetPaths };
}

export async function startAutopilotLoop(input: StartAutopilotLoopInput): Promise<StartAutopilotLoopOutput> {
  const prepared = await prepareAutopilotLoop(input);
  const core = await executeCoreCommand(input.paths, {
    commandType: "autopilot.loop_start",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "autopilot" },
    boardRevisionRead: input.board.revision,
    payload: {
      actionSelection: prepared.actionSelection,
      packets: prepared.packets,
      plan: prepared.plan,
      planPath: prepared.planPath,
    } as unknown as Record<string, unknown>,
  });
  await atomicWriteFile(input.paths.autopilotIndexPath, renderAutopilotIndex(core.manifest, prepared.plan));
  return { ...prepared, core };
}

export async function finishAutopilotLoop(input: FinishAutopilotLoopInput): Promise<{ routeAdherence: AutopilotRouteAdherence; drift?: AutopilotDriftRecord; finish: AutopilotLoopFinishRecord; core: CoreCommandResult }> {
  const routeAdherence: AutopilotRouteAdherence = {
    loopId: input.loopId,
    status: input.adherenceStatus,
    evaluatedAt: new Date().toISOString(),
    reason: input.reason,
    evidenceIds: input.evidenceIds ?? [],
    requiredResponse: input.requiredResponse,
  };
  const drift = input.adherenceStatus === "adherent"
    ? undefined
    : {
        driftId: `autopilot-drift-${randomUUID().slice(0, 8)}`,
        loopId: input.loopId,
        class: input.adherenceStatus,
        reason: input.reason,
        severity: input.adherenceStatus === "minor_drift" ? "warning" : "hard",
        evidenceIds: input.evidenceIds ?? [],
        requiredResponse: input.requiredResponse === "continue" ? "repair" : input.requiredResponse,
      } satisfies AutopilotDriftRecord;
  const finish: AutopilotLoopFinishRecord = {
    loopId: input.loopId,
    status: input.status,
    routeAdherence,
    drift,
    nextRecommendedAction: nextRecommendedAction(input.requiredResponse, input.nextStage),
    evidenceIds: input.evidenceIds ?? [],
    completedAt: new Date().toISOString(),
    nextStage: input.nextStage,
  };
  const core = await executeCoreCommand(input.paths, {
    commandType: "autopilot.loop_finish",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "autopilot" },
    boardRevisionRead: input.board.revision,
    payload: { routeAdherence, drift, finish } as unknown as Record<string, unknown>,
  });
  await atomicWriteFile(input.paths.autopilotIndexPath, renderAutopilotIndex(core.manifest));
  return { routeAdherence, drift, finish, core };
}

export async function recoverAutopilotLoops(input: AutopilotStateInput & { reason?: string }): Promise<{ recovered: AutopilotLoopStatus[]; cores: CoreCommandResult[] }> {
  const cores: CoreCommandResult[] = [];
  const recovered: AutopilotLoopStatus[] = [];
  let manifest = input.manifest;
  let board = input.board;
  const loops = Object.values(manifest.autopilot.loops).filter((loop) => loop.status === "planned" || loop.status === "running");
  for (const loop of loops) {
    const recovery = {
      recoveryId: `autopilot-recovery-${randomUUID().slice(0, 8)}`,
      loopId: loop.loopId,
      recoveredAt: new Date().toISOString(),
      previousStatus: loop.status,
      recoveredStatus: "parked" as const,
      reason: input.reason ?? "Recovered an in-flight Autopilot loop without duplicate execution.",
      evidenceIds: [],
    };
    const core = await executeCoreCommand(input.paths, {
      commandType: "autopilot.recover",
      cwd: input.paths.cwd,
      runId: input.paths.runId,
      actor: { kind: "core_policy", id: "autopilot" },
      boardRevisionRead: board.revision,
      payload: recovery,
    });
    cores.push(core);
    recovered.push(recovery.previousStatus);
    manifest = core.manifest;
    board = core.board;
  }
  await atomicWriteFile(input.paths.autopilotIndexPath, renderAutopilotIndex(manifest));
  return { recovered, cores };
}

export async function dispatchAutopilotPacket(input: AutopilotStateInput & {
  loopId: string;
  packetId: string;
  binding?: RoleBindingContract;
  timeoutMs?: number;
}): Promise<RunPiRoleOutput> {
  const packet = input.manifest.autopilot.packets[input.packetId];
  if (!packet || packet.loopId !== input.loopId) throw new Error(`Unknown Autopilot packet ${input.packetId} for loop ${input.loopId}.`);
  return await runPiRole({
    paths: input.paths,
    manifest: input.manifest,
    board: input.board,
    binding: input.binding,
    roleId: packet.roleId,
    purpose: packet.rolePurpose,
    inputKind: "autopilot_step",
    inputRef: packet.packetId,
    mission: packet.mission,
    timeoutMs: input.timeoutMs,
  });
}

function nextAttempt(manifest: HelmsmanManifest): number {
  return Object.keys(manifest.autopilot.loops).length + 1;
}

function autonomyBoundaryIds(manifest: HelmsmanManifest): string[] {
  return Object.entries(manifest.route.autonomyBoundary)
    .filter(([, value]) => value === true || (Array.isArray(value) && value.length > 0))
    .map(([key]) => key);
}

function activeWriteRootsConflict(manifest: HelmsmanManifest, writeRoots: string[]): boolean {
  for (const packet of Object.values(manifest.autopilot.packets)) {
    const loop = manifest.autopilot.loops[packet.loopId];
    if (loop && ["completed", "parked", "stopped", "failed", "timed_out", "needs_user_action"].includes(loop.status)) continue;
    if (writeRootsConflict(writeRoots, packet.allowedWriteRoots)) return true;
  }
  return false;
}

function writeRootsConflict(leftRoots: string[], rightRoots: string[]): boolean {
  for (const left of leftRoots) {
    for (const right of rightRoots) {
      if (!left || !right) continue;
      if (left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)) return true;
    }
  }
  return false;
}

function nextRecommendedAction(response: AutopilotDriftResponse, nextStage?: RunStage): BoardNextAction["kind"] {
  if (nextStage === "verification") return "run_verification";
  if (response === "repair" || response === "continue") return "run_autopilot_loop";
  return "park";
}

function renderAutopilotIndex(manifest: HelmsmanManifest, pendingPlan?: AutopilotLoopPlan): string {
  const loops = Object.values(manifest.autopilot.loops);
  return [
    "# Autopilot Index",
    "",
    `Run: ${manifest.run.id}`,
    `Route Lock: ${manifest.run.routeLock.status}`,
    `Locked snapshot hash: ${manifest.run.routeLock.snapshotHash ?? "none"}`,
    "",
    "## Loops",
    "",
    ...(loops.length === 0 ? ["- no Core-accepted Autopilot loops yet"] : loops.map((loop) => `- ${loop.loopId}: ${loop.status} board=${loop.boardRevisionRead} packets=${loop.packetIds.join(", ")}`)),
    ...(pendingPlan ? ["", "## Pending Plan", "", `- ${pendingPlan.loopId}: board=${pendingPlan.boardRevisionRead} packets=${pendingPlan.packetPaths.join(", ")}`] : []),
    "",
  ].join("\n");
}
