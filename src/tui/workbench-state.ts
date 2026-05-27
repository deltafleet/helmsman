import { access, readFile } from "node:fs/promises";
import { resolveRunPaths, type RunPaths } from "../core/document-bus/paths.ts";
import { executeCoreCommand, replayCore } from "../core/authority/core-store.ts";
import type { BoardProjection, HelmsmanManifest } from "../core/authority/types.ts";

export type WorkbenchView =
  | "conversation"
  | "board"
  | "manifest"
  | "questions"
  | "memory"
  | "research"
  | "route_lock"
  | "autopilot"
  | "verification"
  | "closeout"
  | "product_audit"
  | "operations"
  | "evidence"
  | "roles"
  | "providers"
  | "diagnostics"
  | "help";

export interface WorkbenchState {
  cwd: string;
  runId: string;
  paths: RunPaths;
  view: WorkbenchView;
  manifest: HelmsmanManifest;
  board: BoardProjection;
  operationState?: Record<string, unknown>;
  providerReadiness?: Record<string, unknown>;
  productAudit?: Record<string, unknown>;
  diagnostics: {
    loadedAt: string;
    replayStatus?: string;
    lastCommand?: string;
    statusLine: string;
  };
}

export interface OpenWorkbenchInput {
  cwd: string;
  runId: string;
  title?: string;
  initialIntent?: string;
  createIfMissing: boolean;
  view?: WorkbenchView;
}

export async function openWorkbenchSession(input: OpenWorkbenchInput): Promise<WorkbenchState> {
  const paths = resolveRunPaths({ cwd: input.cwd, runId: input.runId });
  const exists = await fileExists(paths.manifestEventsPath);

  if (!exists) {
    if (!input.createIfMissing) {
      throw new Error(`Helmsman session ${input.runId} does not exist. Pass --create to create it.`);
    }
    const created = await executeCoreCommand(paths, {
      commandType: "run.create",
      cwd: paths.cwd,
      runId: input.runId,
      actor: { kind: "user", id: "tui" },
      payload: {
        title: input.title ?? input.runId,
        workspace: paths.cwd,
        initialIntent: input.initialIntent,
      },
    });
    return buildState({
      paths,
      manifest: created.manifest,
      board: created.board,
      view: input.view ?? "conversation",
      replayStatus: "created",
      statusLine: `Created ${input.runId}. Normal chat is active; Charting has not been entered.`,
    });
  }

  const resumed = await executeCoreCommand(paths, {
    commandType: "run.resume",
    cwd: paths.cwd,
    runId: input.runId,
    actor: { kind: "user", id: "tui" },
    payload: {},
  });
  return buildState({
    paths,
    manifest: resumed.manifest,
    board: resumed.board,
    view: input.view ?? "conversation",
    replayStatus: "resumed",
    statusLine: `Resumed ${input.runId} at Board revision ${resumed.board.revision}.`,
  });
}

export async function loadWorkbenchState(input: {
  paths: RunPaths;
  view: WorkbenchView;
  statusLine: string;
  lastCommand?: string;
  replayStatus?: string;
  providerReadiness?: Record<string, unknown>;
  productAudit?: Record<string, unknown>;
}): Promise<WorkbenchState> {
  const [manifest, board, operationState] = await Promise.all([
    readJson<HelmsmanManifest>(input.paths.manifestPath),
    readJson<BoardProjection>(input.paths.boardPath),
    readOptionalJson<Record<string, unknown>>(input.paths.operationStatePath),
  ]);
  return {
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    paths: input.paths,
    view: input.view,
    manifest,
    board,
    operationState,
    providerReadiness: input.providerReadiness,
    productAudit: input.productAudit,
    diagnostics: {
      loadedAt: new Date().toISOString(),
      replayStatus: input.replayStatus,
      lastCommand: input.lastCommand,
      statusLine: input.statusLine,
    },
  };
}

export async function replayWorkbenchState(input: { paths: RunPaths; view: WorkbenchView; repair: boolean; lastCommand: string }): Promise<WorkbenchState> {
  const replayed = await replayCore(input.paths, { repair: input.repair });
  if (replayed.status === "event_log_corrupt" || !replayed.manifest || !replayed.board) {
    throw new Error(`Core replay failed for ${input.paths.runId}: ${replayed.status}`);
  }
  return buildState({
    paths: input.paths,
    manifest: replayed.manifest,
    board: replayed.board,
    view: input.view,
    replayStatus: replayed.status,
    statusLine: input.repair ? `Core replay repaired projections: ${replayed.status}.` : `Core replay checked projections: ${replayed.status}.`,
    lastCommand: input.lastCommand,
  });
}

async function buildState(input: {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
  view: WorkbenchView;
  replayStatus: string;
  statusLine: string;
  lastCommand?: string;
}): Promise<WorkbenchState> {
  const operationState = await readOptionalJson<Record<string, unknown>>(input.paths.operationStatePath);
  return {
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    paths: input.paths,
    view: input.view,
    manifest: input.manifest,
    board: input.board,
    operationState,
    diagnostics: {
      loadedAt: new Date().toISOString(),
      replayStatus: input.replayStatus,
      lastCommand: input.lastCommand,
      statusLine: input.statusLine,
    },
  };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | undefined> {
  try {
    return await readJson<T>(path);
  } catch {
    return undefined;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
