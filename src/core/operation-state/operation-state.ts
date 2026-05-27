import type { OperationStatus } from "../events/event-types.ts";

export interface OperationRecord {
  operationId: string;
  mode: string;
  cwd: string;
  status: OperationStatus;
  startedAt: string;
  finishedAt?: string;
  reasonCode?: string;
  message?: string;
  artifacts: string[];
  routeAuthority: "unchanged";
}

export interface OperationState {
  schemaVersion: "helmsman.operation-state.v1";
  rebuiltAt: string;
  runId: string;
  operations: OperationRecord[];
}
