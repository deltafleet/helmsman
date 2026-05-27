import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { Box, Input, ProcessTerminal, Text, TUI, visibleWidth } from "@earendil-works/pi-tui";
import { readManifestEvents } from "../core/authority/event-io.ts";
import { projectionHashMatches } from "../core/authority/projector.ts";
import type { BoardProjection } from "../core/authority/types.ts";
import { routeWorkbenchCommand } from "../tui/workbench-command-router.ts";
import { renderWorkbenchHeadless } from "../tui/workbench.ts";
import { openWorkbenchSession } from "../tui/workbench-state.ts";

async function main(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "helmsman-gate3-tui-"));
  try {
    assert.equal(typeof Text, "function", "Pi TUI Text component must be importable");
    assert.equal(typeof Box, "function", "Pi TUI Box component must be importable");
    assert.equal(typeof Input, "function", "Pi TUI Input component must be importable");
    assert.equal(typeof TUI, "function", "Pi TUI TUI class must be importable");
    assert.equal(typeof ProcessTerminal, "function", "Pi TUI ProcessTerminal must be importable");

    let state = await openWorkbenchSession({
      cwd: workspace,
      runId: "gate3-tui",
      title: "Gate 3 TUI verification",
      initialIntent: "Verify the Pi TUI Workbench without entering Charting.",
      createIfMissing: true,
    });

    assert.equal(state.board.activeStage, "chat");
    assert.equal(state.manifest.run.activeStage, "chat");
    assert.equal(Object.keys(state.manifest.questions.bundles).length, 0);

    const initialLines = renderWorkbenchHeadless(state, 100);
    assertLinesFit(initialLines, 100);
    assertIncludes(initialLines, "Helmsman Workbench");
    assertIncludes(initialLines, "Board");
    assertIncludes(initialLines, "Manifest");
    assertIncludes(initialLines, "does not force Charting");

    const initialEventCount = (await readManifestEvents(state.paths.manifestEventsPath)).length;
    const boardView = await routeWorkbenchCommand(state, "/board");
    assert.equal(boardView.ok, true);
    assert.equal(boardView.mutatedAuthority, false);
    assert.equal((await readManifestEvents(state.paths.manifestEventsPath)).length, initialEventCount);
    state = boardView.state;

    const chat = await routeWorkbenchCommand(state, "/chat normal chat stays outside Charting");
    assert.equal(chat.ok, true);
    assert.equal(chat.mutatedAuthority, true);
    assert.equal(chat.state.manifest.run.activeStage, "chat");
    assert.equal(chat.state.board.activeStage, "chat");
    assert(Object.values(chat.state.manifest.evidence.records).some((record) => record.kind === "chat.user" && record.summary.includes("outside Charting")));
    state = chat.state;

    const manifestViewEventCount = (await readManifestEvents(state.paths.manifestEventsPath)).length;
    const manifestView = await routeWorkbenchCommand(state, "/manifest");
    assert.equal(manifestView.ok, true);
    assert.equal(manifestView.mutatedAuthority, false);
    assert.equal((await readManifestEvents(state.paths.manifestEventsPath)).length, manifestViewEventCount);
    state = manifestView.state;

    const charting = await routeWorkbenchCommand(state, "/charting verify structured form comes later");
    assert.equal(charting.ok, true);
    assert.equal(charting.mutatedAuthority, true);
    assert.equal(charting.state.manifest.run.activeStage, "charting");
    assert.equal(charting.state.board.activeStage, "charting");
    assert.equal(Object.keys(charting.state.manifest.questions.bundles).length, 1, "Charting must render a Core-authored Question UI bundle");
    assert.equal(charting.state.manifest.questions.openQuestionIds.length, 4);
    assert(Object.keys(charting.state.manifest.evidence.records).some((evidenceId) => evidenceId.startsWith("question-surface:")));
    state = charting.state;

    const beforeAutopilotView = (await readManifestEvents(state.paths.manifestEventsPath)).length;
    const autopilot = await routeWorkbenchCommand(state, "/autopilot");
    assert.equal(autopilot.ok, true);
    assert.equal(autopilot.mutatedAuthority, false);
    assert(autopilot.message.includes("Autopilot view"));
    assert.equal((await readManifestEvents(state.paths.manifestEventsPath)).length, beforeAutopilotView);
    state = autopilot.state;

    const staleBoard = { ...state.board, projectionHash: "stale" } satisfies BoardProjection;
    await writeFile(state.paths.boardPath, `${JSON.stringify(staleBoard, null, 2)}\n`, "utf8");
    const replay = await routeWorkbenchCommand(state, "/replay");
    assert.equal(replay.ok, true);
    const repairedBoard = JSON.parse(await readFile(state.paths.boardPath, "utf8")) as BoardProjection;
    assert.equal(projectionHashMatches(repairedBoard), true);
    state = replay.state;

    const finalLines = renderWorkbenchHeadless(state, 88);
    assertLinesFit(finalLines, 88);
    assertIncludes(finalLines, "Core owns Manifest/Board");

    console.log("TUI Workbench verification passed");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function assertLinesFit(lines: string[], width: number): void {
  for (const line of lines) {
    assert(visibleWidth(line) <= width, `Line exceeds width ${width}: ${line}`);
  }
}

function assertIncludes(lines: string[], needle: string): void {
  assert(lines.some((line) => line.includes(needle)), `Expected rendered output to include: ${needle}`);
}

await main();
