import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentSession, AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { safeSummary } from "../../core/redaction/secrets.ts";

export interface PiCapturedEvent {
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

export async function writeCapturedEvent(path: string, event: PiCapturedEvent): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
}

export function capturePiSessionEvents(input: {
  session: AgentSession;
  path: string;
  operationId: string;
}): () => void {
  let sequence = 0;
  return input.session.subscribe((event: AgentSessionEvent) => {
    const summary = safeSummary(event);
    void writeCapturedEvent(input.path, {
      operationId: input.operationId,
      capturedAt: new Date().toISOString(),
      piEventType: event.type,
      sequence: sequence++,
      safeSummary: summary.text,
      redaction: {
        applied: summary.applied,
        reasonCodes: summary.reasonCodes,
      },
    });
  });
}
