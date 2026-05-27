export type OperationStatus =
  | "started"
  | "completed"
  | "failed"
  | "timed_out"
  | "aborted"
  | "interrupted"
  | "unavailable";

export interface HelmsmanEvent<TType extends string = string, TPayload = unknown> {
  schemaVersion: "helmsman.event.v1";
  id: string;
  type: TType;
  occurredAt: string;
  runId: string;
  operationId?: string;
  payload: TPayload;
}

export interface OperationStartedPayload {
  mode: string;
  cwd: string;
  timeoutMs?: number;
  routeAuthority: "unchanged";
}

export interface OperationFinishedPayload {
  status: Exclude<OperationStatus, "started">;
  reasonCode: string;
  message: string;
  artifacts: string[];
  routeAuthority: "unchanged";
}
