import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { HelmsmanEvent } from "./event-types.ts";

export async function appendEvent<TType extends string, TPayload>(input: {
  path: string;
  runId: string;
  operationId?: string;
  type: TType;
  payload: TPayload;
}): Promise<HelmsmanEvent<TType, TPayload>> {
  await mkdir(dirname(input.path), { recursive: true });
  const event: HelmsmanEvent<TType, TPayload> = {
    schemaVersion: "helmsman.event.v1",
    id: randomUUID(),
    type: input.type,
    occurredAt: new Date().toISOString(),
    runId: input.runId,
    operationId: input.operationId,
    payload: input.payload,
  };
  await appendFile(input.path, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}
