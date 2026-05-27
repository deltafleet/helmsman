import type { RunPaths } from "../document-bus/paths.ts";
import { atomicWriteFile } from "../document-bus/atomic-write.ts";
import { readEvents } from "../events/replay.ts";
import type { OperationFinishedPayload, OperationStartedPayload } from "../events/event-types.ts";
import type { OperationRecord, OperationState } from "./operation-state.ts";

export async function rebuildOperationState(paths: RunPaths): Promise<OperationState> {
  const events = await readEvents(paths.eventsPath);
  const operations = new Map<string, OperationRecord>();

  for (const event of events) {
    if (!event.operationId) continue;
    if (event.type === "operation.started") {
      const payload = event.payload as OperationStartedPayload;
      operations.set(event.operationId, {
        operationId: event.operationId,
        mode: payload.mode,
        cwd: payload.cwd,
        status: "started",
        startedAt: event.occurredAt,
        artifacts: [],
        routeAuthority: "unchanged",
      });
    }
    if (event.type === "operation.finished") {
      const payload = event.payload as OperationFinishedPayload;
      const previous = operations.get(event.operationId);
      operations.set(event.operationId, {
        operationId: event.operationId,
        mode: previous?.mode ?? "unknown",
        cwd: previous?.cwd ?? paths.cwd,
        status: payload.status,
        startedAt: previous?.startedAt ?? event.occurredAt,
        finishedAt: event.occurredAt,
        reasonCode: payload.reasonCode,
        message: payload.message,
        artifacts: payload.artifacts,
        routeAuthority: "unchanged",
      });
    }
  }

  const state: OperationState = {
    schemaVersion: "helmsman.operation-state.v1",
    rebuiltAt: new Date().toISOString(),
    runId: paths.runId,
    operations: [...operations.values()],
  };

  await atomicWriteFile(paths.operationStatePath, `${JSON.stringify(state, null, 2)}\n`);
  return state;
}
