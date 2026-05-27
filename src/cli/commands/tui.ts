import { Key, matchesKey, ProcessTerminal, TUI } from "@earendil-works/pi-tui";
import { openWorkbenchSession, type WorkbenchView } from "../../tui/workbench-state.ts";
import { renderWorkbenchHeadless, WorkbenchRoot } from "../../tui/workbench.ts";

const VIEWS = new Set<WorkbenchView>(["conversation", "board", "manifest", "questions", "operations", "evidence", "roles", "providers", "diagnostics", "help"]);

export async function runTuiCommand(args: string[]): Promise<number> {
  const cwd = flagValue(args, "--cwd") ?? process.cwd();
  const runId = required(args, "--session");
  const title = flagValue(args, "--title");
  const initialIntent = flagValue(args, "--intent");
  const view = viewFlag(args);
  const width = numberFlag(args, "--width") ?? 120;
  const createIfMissing = args.includes("--create");
  const json = args.includes("--json");
  const headless = args.includes("--headless-render");
  const command = flagValue(args, "--command");

  let state = await openWorkbenchSession({ cwd, runId, title, initialIntent, createIfMissing, view });

  if (command) {
    const root = new WorkbenchRoot(state, { renderer: headless ? "headless_cli" : "pi_tui", width });
    const result = await root.submit(command);
    state = result.state;
    if (!headless && !json) {
      console.log(result.message);
    }
    if (json) {
      console.log(JSON.stringify({ ok: result.ok, mutatedAuthority: result.mutatedAuthority, shouldExit: result.shouldExit, message: result.message, error: result.error, state: summarizeState(state), renderedLines: headless ? root.render(width) : undefined }, null, 2));
      return result.ok ? 0 : 3;
    }
    if (headless) {
      console.log(root.render(width).join("\n"));
    }
    return result.ok ? 0 : 3;
  }

  if (headless || json) {
    const renderedLines = renderWorkbenchHeadless(state, width);
    if (json) {
      console.log(JSON.stringify({ ok: true, state: summarizeState(state), renderedLines }, null, 2));
    } else {
      console.log(renderedLines.join("\n"));
    }
    return 0;
  }

  await runInteractiveWorkbench(state);
  return 0;
}

async function runInteractiveWorkbench(state: Awaited<ReturnType<typeof openWorkbenchSession>>): Promise<void> {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  const root = new WorkbenchRoot(state, { renderer: "pi_tui" });
  root.onAfterSubmit = () => {
    tui.requestRender(true);
    if (root.shouldExit) tui.stop();
  };
  tui.addChild(root);
  tui.setFocus(root.commandInput);
  tui.addInputListener((data) => {
    if (matchesKey(data, Key.ctrl("c"))) {
      tui.stop();
      return { consume: true };
    }
    return undefined;
  });
  tui.start();
}

function summarizeState(state: Awaited<ReturnType<typeof openWorkbenchSession>>): Record<string, unknown> {
  return {
    cwd: state.cwd,
    runId: state.runId,
    view: state.view,
    activeStage: state.board.activeStage,
    boardRevision: state.board.revision,
    nextLegalAction: state.board.nextLegalAction,
    blockers: state.board.blockers.map((blocker) => ({ blockerId: blocker.blockerId, reason: blocker.reason })),
    paths: {
      manifest: state.paths.manifestPath,
      board: state.paths.boardPath,
      renderedManifest: state.paths.renderedManifestPath,
      renderedBoard: state.paths.renderedBoardPath,
    },
  };
}

function required(args: string[], name: string): string {
  const value = flagValue(args, name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function numberFlag(args: string[], name: string): number | undefined {
  const value = flagValue(args, name);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function viewFlag(args: string[]): WorkbenchView | undefined {
  const value = flagValue(args, "--view");
  if (!value) return undefined;
  if (!VIEWS.has(value as WorkbenchView)) {
    throw new Error(`Invalid --view. Expected one of: ${[...VIEWS].join(", ")}`);
  }
  return value as WorkbenchView;
}
