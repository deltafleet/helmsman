import { appendFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ensureRunDirs, resolveRunPaths } from "../../core/document-bus/paths.ts";
import { appendEvent } from "../../core/events/append-event.ts";
import type { OperationFinishedPayload } from "../../core/events/event-types.ts";
import { rebuildOperationState } from "../../core/operation-state/rebuild-operation-state.ts";
import { scanForSecrets } from "../../core/redaction/secrets.ts";
import { atomicWriteFile } from "../../core/document-bus/atomic-write.ts";
import { createHelmsmanPiSession, getLiveModelCandidates } from "./session-factory.ts";
import { capturePiSessionEvents, writeCapturedEvent } from "./event-capture.ts";
import { writeCapabilityReport } from "./capability-report.ts";
import { HelmsmanAbortError, sleepWithAbort } from "./timeout.ts";

export type PiProbeMode =
  | "import"
  | "in-memory-session"
  | "persisted-session"
  | "timeout"
  | "abort"
  | "live-provider";

export interface PiProbeResult {
  runId: string;
  operationId: string;
  mode: PiProbeMode;
  status: OperationFinishedPayload["status"];
  runRoot: string;
  artifacts: string[];
  message: string;
}

export async function runPiProbe(input: {
  cwd: string;
  runId: string;
  mode: PiProbeMode;
  timeoutMs?: number;
}): Promise<PiProbeResult> {
  const paths = resolveRunPaths({ cwd: input.cwd, runId: input.runId });
  await ensureRunDirs(paths);

  const operationId = `pi-${input.mode}-${randomUUID()}`;
  const promptPath = join(paths.piRoot, `${operationId}.prompt.md`);
  const eventCapturePath = join(paths.piRoot, `${operationId}.events.jsonl`);
  const lastMessagePath = join(paths.piRoot, `${operationId}.last-message.md`);
  const redactionReportPath = join(paths.piRoot, `${operationId}.redaction-report.json`);
  const artifacts = [promptPath, eventCapturePath, lastMessagePath, paths.operationStatePath];

  await appendEvent({
    path: paths.eventsPath,
    runId: paths.runId,
    operationId,
    type: "operation.started",
    payload: {
      mode: input.mode,
      cwd: paths.cwd,
      timeoutMs: input.timeoutMs,
      routeAuthority: "unchanged",
    },
  });

  await writeFile(promptPath, buildPrompt(input.mode), "utf8");

  let status: OperationFinishedPayload["status"] = "completed";
  let reasonCode = "ok";
  let message = "Pi runtime probe completed.";

  try {
    if (input.mode === "import") {
      await writeCapturedEvent(eventCapturePath, captured(operationId, "helmsman.import_surface_checked", 0, "Pi package import surface checked."));
      await writeFile(lastMessagePath, "Import surface checked. No Pi session was created by this mode.\n", "utf8");
    } else if (input.mode === "timeout") {
      await runTimeoutProbe({ paths, operationId, eventCapturePath });
      status = "timed_out";
      reasonCode = "deadline_expired";
      message = "Helmsman deadline expired and operation was marked timed_out.";
      await writeFile(lastMessagePath, "Timeout probe did not execute a live model prompt.\n", "utf8");
    } else if (input.mode === "abort") {
      await runAbortProbe({ paths, operationId, eventCapturePath });
      status = "aborted";
      reasonCode = "abort_requested";
      message = "Helmsman abort path was invoked and operation was marked aborted.";
      await writeFile(lastMessagePath, "Abort probe did not execute a live model prompt.\n", "utf8");
    } else {
      const liveProvider = input.mode === "live-provider";
      if (liveProvider) {
        await runLiveProviderPrompt({
          cwd: paths.cwd,
          paths,
          operationId,
          eventCapturePath,
          lastMessagePath,
          artifacts,
        });
      } else {
        const sessionHandle = await createHelmsmanPiSession({
          cwd: paths.cwd,
          paths,
          persistent: input.mode === "persisted-session",
          liveProvider: false,
        });
        const unsubscribe = capturePiSessionEvents({
          session: sessionHandle.session,
          path: eventCapturePath,
          operationId,
        });
        try {
          await writeCapturedEvent(
            eventCapturePath,
            captured(operationId, "helmsman.pi_session_constructed", 0, `Pi session ${sessionHandle.sessionId} constructed.`),
          );
          if (sessionHandle.persistent) {
            await appendPiSessionLink(paths.piSessionLinksPath, operationId, sessionHandle);
            artifacts.push(paths.piSessionLinksPath);
          }
          await writeFile(lastMessagePath, "Pi session constructed. No live model prompt was executed by this mode.\n", "utf8");
        } finally {
          unsubscribe();
          sessionHandle.session.dispose();
        }
      }
    }
  } catch (error) {
    if (error instanceof HelmsmanAbortError) {
      status = error.reasonCode;
      reasonCode = error.reasonCode === "timed_out" ? "deadline_expired" : "abort_requested";
      message = `${error.reasonCode} during Pi runtime operation.`;
    } else if (input.mode === "live-provider" && error instanceof Error && error.message.startsWith("live_provider_unavailable")) {
      status = "unavailable";
      reasonCode = "live_provider_unavailable";
      message = "No configured Pi provider/model is available; live proof was not replaced with a fake provider.";
      await writeFile(lastMessagePath, `${message}\n`, "utf8");
    } else {
      status = "failed";
      reasonCode = "pi_runtime_error";
      message = error instanceof Error ? error.message : String(error);
      await writeFile(lastMessagePath, `${message}\n`, "utf8");
    }
  }

  const redactionFindings = await scanForSecrets(paths.runRoot);
  await atomicWriteFile(redactionReportPath, `${JSON.stringify({ findings: redactionFindings }, null, 2)}\n`);
  artifacts.push(redactionReportPath, paths.capabilityReportPath);
  await writeCapabilityReport(paths);

  await appendEvent({
    path: paths.eventsPath,
    runId: paths.runId,
    operationId,
    type: "operation.finished",
    payload: {
      status,
      reasonCode,
      message,
      artifacts,
      routeAuthority: "unchanged",
    },
  });
  await rebuildOperationState(paths);

  return { runId: paths.runId, operationId, mode: input.mode, status, runRoot: paths.runRoot, artifacts, message };
}

async function runLiveProviderPrompt(input: {
  cwd: string;
  paths: ReturnType<typeof resolveRunPaths>;
  operationId: string;
  eventCapturePath: string;
  lastMessagePath: string;
  artifacts: string[];
}): Promise<void> {
  const candidates = getLiveModelCandidates(input.cwd);
  const maxAttempts = Math.max(1, Number.parseInt(process.env.HELMSMAN_PI_LIVE_MAX_ATTEMPTS ?? "3", 10));
  const attempted = candidates.slice(0, maxAttempts);
  if (attempted.length === 0) {
    throw new Error("live_provider_unavailable:no_configured_model");
  }

  const failures: string[] = [];
  for (const model of attempted) {
    const sessionHandle = await createHelmsmanPiSession({
      cwd: input.cwd,
      paths: input.paths,
      persistent: true,
      liveProvider: true,
      liveModel: model,
    });
    const unsubscribe = capturePiSessionEvents({
      session: sessionHandle.session,
      path: input.eventCapturePath,
      operationId: input.operationId,
    });
    try {
      await writeCapturedEvent(
        input.eventCapturePath,
        captured(
          input.operationId,
          "helmsman.pi_session_constructed",
          0,
          `Pi session ${sessionHandle.sessionId} constructed for ${model.provider}:${model.id}.`,
        ),
      );
      await appendPiSessionLink(input.paths.piSessionLinksPath, input.operationId, sessionHandle);
      if (!input.artifacts.includes(input.paths.piSessionLinksPath)) input.artifacts.push(input.paths.piSessionLinksPath);
      await sessionHandle.session.prompt("Reply with one concise sentence confirming Helmsman Gate 1 live provider runtime execution.");
      const text = sessionHandle.session.getLastAssistantText()?.trim();
      if (text) {
        await writeFile(input.lastMessagePath, `${text}\n`, "utf8");
        return;
      }
      failures.push(`${model.provider}:${model.id}:empty_assistant_response`);
    } catch (error) {
      failures.push(`${model.provider}:${model.id}:${error instanceof Error ? error.message : String(error)}`);
    } finally {
      unsubscribe();
      sessionHandle.session.dispose();
    }
  }

  throw new Error(`live_provider_no_successful_response:${failures.join(" | ")}`);
}

async function appendPiSessionLink(
  path: string,
  operationId: string,
  sessionHandle: Awaited<ReturnType<typeof createHelmsmanPiSession>>,
): Promise<void> {
  await appendFile(
    path,
    `${JSON.stringify({
      operationId,
      sessionId: sessionHandle.sessionId,
      sessionFile: sessionHandle.sessionFile,
      sessionDir: sessionHandle.sessionDir,
      persistence: "pi_session_manager",
      routeAuthority: "evidence_only",
      recordedAt: new Date().toISOString(),
    })}\n`,
    "utf8",
  );
}

function captured(operationId: string, piEventType: string, sequence: number, safeSummary: string) {
  return {
    operationId,
    capturedAt: new Date().toISOString(),
    piEventType,
    sequence,
    safeSummary,
    redaction: {
      applied: false,
      reasonCodes: [],
    },
  };
}

async function runTimeoutProbe(input: { paths: ReturnType<typeof resolveRunPaths>; operationId: string; eventCapturePath: string }): Promise<void> {
  const controller = new AbortController();
  await createHelmsmanPiSession({ cwd: input.paths.cwd, paths: input.paths, persistent: false, liveProvider: false });
  await writeCapturedEvent(input.eventCapturePath, captured(input.operationId, "helmsman.pi_session_constructed", 0, "Pi session constructed before timeout."));
  setTimeout(() => controller.abort("timed_out"), 5);
  await sleepWithAbort(250, controller.signal);
}

async function runAbortProbe(input: { paths: ReturnType<typeof resolveRunPaths>; operationId: string; eventCapturePath: string }): Promise<void> {
  const controller = new AbortController();
  await createHelmsmanPiSession({ cwd: input.paths.cwd, paths: input.paths, persistent: false, liveProvider: false });
  await writeCapturedEvent(input.eventCapturePath, captured(input.operationId, "helmsman.pi_session_constructed", 0, "Pi session constructed before abort."));
  controller.abort("aborted");
  await sleepWithAbort(250, controller.signal);
}

function buildPrompt(mode: PiProbeMode): string {
  return [
    `# Helmsman Pi Runtime Probe`,
    ``,
    `Mode: ${mode}`,
    ``,
    `This artifact is evidence for Gate 1 only. It is not route authority and it does not advance Charting, Route Lock, Autopilot, verification, or closeout.`,
  ].join("\n");
}
