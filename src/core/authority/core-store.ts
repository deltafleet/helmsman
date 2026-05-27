import { appendFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { RunPaths } from "../document-bus/paths.ts";
import { ensureRunDirs } from "../document-bus/paths.ts";
import { atomicWriteFile, jsonLine } from "../document-bus/atomic-write.ts";
import { withRunLock } from "../document-bus/run-lock.ts";
import { readManifestEvents } from "./event-io.ts";
import { replayManifest } from "./reducer.ts";
import { projectBoard, projectionHashMatches } from "./projector.ts";
import { renderBoardMarkdown, renderManifestMarkdown, renderRouteCardMarkdown } from "./render.ts";
import { sha256Json } from "./hash.ts";
import { CoreError, type BoardProjection, type HelmsmanManifest, type ManifestActor, type ManifestEvent, type Revision } from "./types.ts";
import { COMMAND_REGISTRY } from "./command-registry.ts";

export interface CoreCommandInput {
  commandType: string;
  cwd: string;
  runId: string;
  actor: ManifestActor;
  boardRevisionRead?: Revision;
  payload: Record<string, unknown>;
}

export interface CoreCommandResult {
  ok: true;
  runId: string;
  commandId: string;
  eventsAppended: ManifestEvent[];
  manifest: HelmsmanManifest;
  board: BoardProjection;
  paths: {
    manifest: string;
    manifestEvents: string;
    board: string;
    renderedManifest: string;
    renderedBoard: string;
    renderedRouteCard: string;
  };
}

export async function executeCoreCommand(paths: RunPaths, input: CoreCommandInput): Promise<CoreCommandResult> {
  await ensureRunDirs(paths);
  const contract = COMMAND_REGISTRY[input.commandType];
  if (!contract) {
    throw new CoreError({ code: "COMMAND_PRECONDITION_FAILED", message: `Unknown command ${input.commandType}.` });
  }
  if (!contract.requiredActorKinds.includes(input.actor.kind)) {
    throw new CoreError({ code: "EVENT_ACTOR_UNAUTHORIZED", message: `${input.actor.kind} cannot execute ${input.commandType}.` });
  }

  return await withRunLock(paths.sessionLockPath, async () => {
    const existingEvents = await readManifestEvents(paths.manifestEventsPath);
    const commandId = `${input.commandType}:${randomUUID()}`;
    const current = existingEvents.length === 0 ? undefined : replayManifest(existingEvents).manifest;
    const currentBoard = current ? await assertCurrentBoard(paths, current, existingEvents.length) : undefined;

    if (contract.allowedStages[0] === "none" && current) {
      throw new CoreError({ code: "COMMAND_STAGE_ILLEGAL", message: `${input.commandType} requires a new run.` });
    }
    if (contract.allowedStages[0] !== "none" && !current) {
      throw new CoreError({ code: "RECOVERY_REQUIRED", message: `${input.commandType} requires an existing manifest.` });
    }
    if (current && !stageAllowed(contract.allowedStages, current.run.activeStage)) {
      throw new CoreError({
        code: "COMMAND_STAGE_ILLEGAL",
        message: `${input.commandType} is illegal during ${current.run.activeStage}.`,
      });
    }
    if (contract.requiresBoardRevision && typeof input.boardRevisionRead !== "number") {
      throw new CoreError({ code: "BOARD_REVISION_REQUIRED", message: `${input.commandType} requires boardRevisionRead.` });
    }
    if (contract.requiresBoardRevision && currentBoard && input.boardRevisionRead !== currentBoard.revision) {
      throw new CoreError({
        code: "BOARD_REVISION_STALE",
        message: `Read Board revision ${input.boardRevisionRead}, current revision is ${currentBoard.revision}.`,
      });
    }

    const events = buildCommandEvents({
      commandType: input.commandType,
      commandId,
      runId: input.runId,
      actor: input.actor,
      boardRevisionRead: input.boardRevisionRead,
      payload: input.payload,
      current,
      nextSequence: existingEvents.length + 1,
    });

    if (events.length === 0 && contract.readOnly) {
      const manifest = current ?? replayManifest(existingEvents).manifest;
      const board = currentBoard ?? projectBoard({ manifest, latestEventSequence: existingEvents.length, generatedAt: manifest.run.updatedAt });
      return result(input.runId, commandId, [], manifest, board, paths);
    }

    const replayedEvents = [...existingEvents, ...events];
    const replayed = replayManifest(replayedEvents);
    const board = projectBoard({ manifest: replayed.manifest, latestEventSequence: replayedEvents.length, generatedAt: replayed.manifest.run.updatedAt, previousBoard: currentBoard });

    await appendFile(paths.appendJournalPath, jsonLine({ transactionId: commandId, status: "started", eventCount: events.length, createdAt: new Date().toISOString() }), "utf8");
    await appendFile(paths.manifestEventsPath, events.map((event) => JSON.stringify(event)).join("\n") + "\n", "utf8");
    await writeCoreProjections(paths, replayed.manifest, board, replayed.warnings);
    await appendFile(paths.appendJournalPath, jsonLine({ transactionId: commandId, status: "committed", committedAt: new Date().toISOString() }), "utf8");

    return result(input.runId, commandId, events, replayed.manifest, board, paths);
  });
}

export async function replayCore(paths: RunPaths, input: { repair: boolean }): Promise<{
  status: "healthy" | "projection_stale" | "event_log_corrupt";
  manifest?: HelmsmanManifest;
  board?: BoardProjection;
  reportPath: string;
}> {
  await ensureRunDirs(paths);
  try {
    const events = await readManifestEvents(paths.manifestEventsPath);
    const replayed = replayManifest(events);
    const board = projectBoard({ manifest: replayed.manifest, latestEventSequence: events.length, generatedAt: replayed.manifest.run.updatedAt });
    const stale = await boardIsStale(paths, board);
    const status = stale ? "projection_stale" : "healthy";
    if (input.repair || stale) await writeCoreProjections(paths, replayed.manifest, board, replayed.warnings);
    await atomicWriteFile(paths.replayReportPath, `${JSON.stringify({ status, eventCount: events.length, warnings: replayed.warnings }, null, 2)}\n`);
    return { status, manifest: replayed.manifest, board, reportPath: paths.replayReportPath };
  } catch (error) {
    const coreError = error instanceof CoreError ? error : new CoreError({ code: "EVENT_SCHEMA_INVALID", message: error instanceof Error ? error.message : String(error) });
    await atomicWriteFile(paths.corruptionReportPath, `${JSON.stringify({ status: "event_log_corrupt", error: serializeCoreError(coreError) }, null, 2)}\n`);
    return { status: "event_log_corrupt", reportPath: paths.corruptionReportPath };
  }
}

async function assertCurrentBoard(paths: RunPaths, manifest: HelmsmanManifest, latestEventSequence: number): Promise<BoardProjection> {
  const expected = projectBoard({ manifest, latestEventSequence, generatedAt: manifest.run.updatedAt });
  let board: BoardProjection;
  try {
    board = JSON.parse(await readFile(paths.boardPath, "utf8")) as BoardProjection;
  } catch {
    throw new CoreError({ code: "RECOVERY_REQUIRED", message: "Board projection is missing; run core replay --repair before mutating commands." });
  }
  if (board.rebuiltFromEventSequence !== latestEventSequence || board.manifestHash !== expected.manifestHash || !projectionHashMatches(board)) {
    throw new CoreError({ code: "PROJECTION_STALE", message: "Board projection is stale; run core replay --repair before mutating commands." });
  }
  return board;
}

async function boardIsStale(paths: RunPaths, expected: BoardProjection): Promise<boolean> {
  try {
    const board = JSON.parse(await readFile(paths.boardPath, "utf8")) as BoardProjection;
    return board.rebuiltFromEventSequence !== expected.rebuiltFromEventSequence || board.manifestHash !== expected.manifestHash || board.projectionHash !== expected.projectionHash;
  } catch {
    return true;
  }
}

async function writeCoreProjections(paths: RunPaths, manifest: HelmsmanManifest, board: BoardProjection, warnings: string[]): Promise<void> {
  await Promise.all([
    atomicWriteFile(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
    atomicWriteFile(paths.boardPath, `${JSON.stringify(board, null, 2)}\n`),
    atomicWriteFile(paths.questionLedgerPath, `${JSON.stringify(manifest.questions, null, 2)}\n`),
    atomicWriteFile(paths.roleRegistryPath, `${JSON.stringify(manifest.roles, null, 2)}\n`),
    atomicWriteFile(paths.scorecardPath, `${JSON.stringify(manifest.scorecard, null, 2)}\n`),
    atomicWriteFile(paths.renderedManifestPath, renderManifestMarkdown(manifest)),
    atomicWriteFile(paths.renderedBoardPath, renderBoardMarkdown(board)),
    atomicWriteFile(paths.renderedRouteCardPath, renderRouteCardMarkdown(manifest)),
    atomicWriteFile(paths.projectorReportPath, `${JSON.stringify({ status: "ok", boardRevision: board.revision, manifestHash: board.manifestHash, projectionHash: board.projectionHash }, null, 2)}\n`),
    atomicWriteFile(paths.gateReportPath, `${JSON.stringify({ status: "ok", gates: board.gates }, null, 2)}\n`),
    atomicWriteFile(paths.replayReportPath, `${JSON.stringify({ status: "healthy", warnings }, null, 2)}\n`),
  ]);
}

function buildCommandEvents(input: {
  commandType: string;
  commandId: string;
  runId: string;
  actor: ManifestActor;
  boardRevisionRead?: Revision;
  payload: Record<string, unknown>;
  current?: HelmsmanManifest;
  nextSequence: number;
}): ManifestEvent[] {
  if (input.commandType === "run.resume" || input.commandType === "doctor.report" || input.commandType === "core.replay") return [];
  const createdAt = new Date().toISOString();
  const event = (type: string, payload: Record<string, unknown>, actor = input.actor, sequenceOffset = 0): ManifestEvent => ({
    schemaVersion: "helmsman.manifest-event.v1",
    eventId: `${type}:${randomUUID()}`,
    runId: input.runId,
    sequence: input.nextSequence + sequenceOffset,
    type,
    createdAt,
    actor,
    causality: {
      commandId: input.commandId,
      boardRevisionRead: input.boardRevisionRead,
      operationId: typeof payload.operationId === "string" ? payload.operationId : undefined,
    },
    payload,
  });

  switch (input.commandType) {
    case "run.create":
      return [event("run.created", input.payload)];
    case "run.stage_change":
      return [event("run.stage_changed", { from: input.current?.run.activeStage, ...input.payload }, { kind: "core_policy", id: "core" })];
    case "charting.enter":
      return [event("run.stage_changed", { from: "chat", to: "charting", reason: input.payload.reason ?? "user entered Charting" }, { kind: "core_policy", id: "core" })];
    case "chat.message_record":
      return [event("chat.message_recorded", input.payload)];
    case "question.bundle_ask":
      return [event("question.bundle_asked", input.payload, { kind: "core_policy", id: "core" })];
    case "question.answer_record":
      return [event("question.answered", input.payload)];
    case "role.binding_set":
      return [event("role.binding_set", input.payload, { kind: "core_policy", id: "core" })];
    case "role.run_plan": {
      const payload = input.payload as {
        roleRunId: string;
        operationId: string;
        roleId: string;
        planPath: string;
        promptPath: string;
        boardRevisionRead: Revision;
        runtime: string;
        eventLogPath: string;
        expectedArtifacts?: Array<{ artifactId: string; kind: string; expectedPath: string; required: boolean }>;
        timeoutMs: number;
      };
      const output: ManifestEvent[] = [
        event("role.run_planned", input.payload, { kind: "core_policy", id: "core" }, 0),
        event(
          "operation.started",
          {
            operationId: payload.operationId,
            runtime: payload.runtime,
            roleId: payload.roleId,
            promptPath: payload.promptPath,
            eventLogPath: payload.eventLogPath,
            expectedArtifacts: payload.expectedArtifacts ?? [],
            boardRevisionRead: payload.boardRevisionRead,
            timeoutMs: payload.timeoutMs,
          },
          { kind: "core_policy", id: "core" },
          1,
        ),
      ];
      for (let index = 0; index < (payload.expectedArtifacts ?? []).length; index++) {
        output.push(event("artifact.expected", { artifact: payload.expectedArtifacts![index] }, { kind: "core_policy", id: "core" }, index + 2));
      }
      return output;
    }
    case "role.run_start":
      return [event("role.run_started", input.payload)];
    case "role.run_finish": {
      const payload = input.payload as {
        roleRunId: string;
        operationId: string;
        status: string;
        evidenceIds: string[];
        artifactIds?: string[];
        producedArtifacts?: Array<{ artifactId: string; path: string; kind: string; producerOperationId?: string; sha256?: string }>;
        lastMessagePath?: string;
      };
      const operationStatus = payload.status === "blocked" || payload.status === "rejected" ? "failed" : payload.status;
      const output: ManifestEvent[] = [
        event("role.run_evidence_captured", input.payload),
      ];
      for (let index = 0; index < (payload.producedArtifacts ?? []).length; index++) {
        output.push(event("artifact.produced", payload.producedArtifacts![index] as unknown as Record<string, unknown>, input.actor, index + 1));
      }
      const finishOffset = output.length;
      output.push(event("role.run_finished", input.payload, input.actor, finishOffset));
      output.push(
        event(
          "operation.finished",
          {
            operationId: payload.operationId,
            status: operationStatus,
            finishedAt: new Date().toISOString(),
            lastMessagePath: payload.lastMessagePath,
            producedArtifactIds: payload.artifactIds ?? [],
            evidenceIds: payload.evidenceIds,
          },
          input.actor,
          finishOffset + 1,
        ),
      );
      return output;
    }
    case "memory.scan_record": {
      const plan = (input.payload.plan ?? input.payload) as Record<string, unknown>;
      const candidateJudgments = Array.isArray(input.payload.candidateJudgments) ? input.payload.candidateJudgments as Record<string, unknown>[] : [];
      return [
        event("memory.scan_created", plan, { kind: "core_policy", id: "core" }, 0),
        ...candidateJudgments.map((candidate, index) => event("memory.candidate_classified", candidate, { kind: "core_policy", id: "core" }, index + 1)),
      ];
    }
    case "research.lane_plan": {
      const lanes = Array.isArray(input.payload.lanes) ? input.payload.lanes as Record<string, unknown>[] : [input.payload];
      return lanes.map((lane, index) => event("research.lane_declared", lane, { kind: "core_policy", id: "core" }, index));
    }
    case "research.packet_prepare": {
      const packets = Array.isArray(input.payload.packets) ? input.payload.packets as Record<string, unknown>[] : [input.payload];
      return packets.map((packet, index) => event("research.worker_packet_created", packet, { kind: "core_policy", id: "core" }, index));
    }
    case "research.artifact_submit":
      return [event("research.artifact_submitted", input.payload)];
    case "research.artifact_accept":
      return [event("research.artifact_accepted", input.payload, { kind: "core_policy", id: "core" })];
    case "research.artifact_reject":
      return [event("research.artifact_rejected", input.payload, { kind: "core_policy", id: "core" })];
    case "research.lane_drop":
      return [event("research.lane_dropped", input.payload, input.actor)];
    case "research.synthesis_record":
      return [event("research.synthesis_recorded", input.payload, { kind: "core_policy", id: "core" })];
    case "artifact.accept":
      return [event("artifact.accepted", input.payload)];
    case "route.lock_propose":
      return [event("route_lock.proposed", input.payload, { kind: "core_policy", id: "core" })];
    case "route.lock_confirm":
      return [event("route_lock.locked", input.payload)];
    case "route.lock_cancel":
      return [event("route_lock.cancelled", input.payload, input.actor)];
    case "route.unlock":
      return [event("route_lock.unlocked", input.payload, input.actor)];
    case "route.invalidate":
      return [event("route_lock.invalidated", input.payload, { kind: "core_policy", id: "core" })];
    case "route.amend_propose":
      return [event("amendment.proposed", input.payload)];
    case "route.amend_apply":
      return [event("amendment.applied", input.payload)];
    case "route.amend_reject":
      return [event("amendment.rejected", input.payload, input.actor)];
    case "autopilot.loop_start": {
      const payload = input.payload as {
        actionSelection: Record<string, unknown>;
        packets: Record<string, unknown>[];
        plan: Record<string, unknown>;
        planPath: string;
      };
      return [
        event("autopilot.action_selected", payload.actionSelection, { kind: "core_policy", id: "autopilot" }, 0),
        ...payload.packets.map((packet, index) => event("autopilot.packet_prepared", packet, { kind: "core_policy", id: "autopilot" }, index + 1)),
        event(
          "autopilot.loop_started",
          {
            plan: payload.plan,
            planPath: payload.planPath,
            packetIds: payload.packets.map((packet) => packet.packetId),
            packetPaths: payload.plan.packetPaths,
            roleRunIds: [],
          },
          { kind: "core_policy", id: "autopilot" },
          payload.packets.length + 1,
        ),
      ];
    }
    case "autopilot.loop_finish": {
      const payload = input.payload as {
        routeAdherence: Record<string, unknown>;
        drift?: Record<string, unknown>;
        finish: Record<string, unknown>;
      };
      const output = [event("autopilot.route_adherence_evaluated", payload.routeAdherence, { kind: "core_policy", id: "autopilot" }, 0)];
      if (payload.drift) output.push(event("autopilot.drift_recorded", payload.drift, { kind: "core_policy", id: "autopilot" }, output.length));
      output.push(event("autopilot.loop_finished", payload.finish, { kind: "core_policy", id: "autopilot" }, output.length));
      return output;
    }
    case "autopilot.recover":
      return [event("autopilot.loop_recovered", input.payload, { kind: "core_policy", id: "autopilot" })];
    case "verification.run_start":
      return [
        event("verification.run_started", input.payload, { kind: "core_policy", id: "core" }, 0),
        ...(((input.payload.plan as Record<string, unknown> | undefined)?.expectedArtifacts as Record<string, unknown>[] | undefined) ?? []).map((artifact, index) =>
          event("artifact.expected", { artifact }, { kind: "core_policy", id: "core" }, index + 1),
        ),
      ];
    case "verification.result_record":
      return [event("verification.result_recorded", input.payload)];
    case "verification.run_finish":
      return [event("verification.run_finished", input.payload, { kind: "core_policy", id: "core" })];
    case "closeout.record":
      return [event("closeout.recorded", input.payload)];
    default:
      throw new CoreError({ code: "COMMAND_PRECONDITION_FAILED", message: `No event builder for ${input.commandType}.` });
  }
}

function result(
  runId: string,
  commandId: string,
  eventsAppended: ManifestEvent[],
  manifest: HelmsmanManifest,
  board: BoardProjection,
  paths: RunPaths,
): CoreCommandResult {
  return {
    ok: true,
    runId,
    commandId,
    eventsAppended,
    manifest,
    board,
    paths: {
      manifest: paths.manifestPath,
      manifestEvents: paths.manifestEventsPath,
      board: paths.boardPath,
      renderedManifest: paths.renderedManifestPath,
      renderedBoard: paths.renderedBoardPath,
      renderedRouteCard: paths.renderedRouteCardPath,
    },
  };
}

export function serializeCoreError(error: CoreError): Record<string, unknown> {
  return {
    code: error.code,
    message: error.message,
    eventId: error.eventId,
    sequence: error.sequence,
    evidenceRefs: error.evidenceRefs,
  };
}

export function manifestHash(manifest: HelmsmanManifest): string {
  return sha256Json(manifest);
}

function stageAllowed(allowedStages: typeof COMMAND_REGISTRY[string]["allowedStages"], activeStage: string): boolean {
  if (allowedStages[0] === "any") return true;
  if (allowedStages[0] === "none") return false;
  return (allowedStages as string[]).includes(activeStage);
}
