import type { BoardProjection, HelmsmanManifest } from "./types.ts";

export function renderManifestMarkdown(manifest: HelmsmanManifest): string {
  return [
    `# Helmsman Manifest: ${manifest.run.title}`,
    "",
    `Run: ${manifest.run.id}`,
    `Stage: ${manifest.run.activeStage}`,
    `Route Lock: ${manifest.run.routeLock.status}`,
    `Route Lock Hash: ${manifest.run.routeLock.snapshotHash ?? "none"}`,
    "",
    "## Goal",
    "",
    manifest.route.goal,
    "",
    "## Scope",
    "",
    ...manifest.route.scope.map((item) => `- ${item.text}`),
    "",
    "## Verification Scenarios",
    "",
    ...manifest.route.verificationScenarios.map((scenario) => `- ${scenario.scenarioId}: ${scenario.title}`),
    "",
    "## Memory",
    "",
    ...(Object.values(manifest.memory.scans).length === 0 ? ["- no scoped scans recorded"] : Object.values(manifest.memory.scans).map((scan) => `- ${scan.scanId}: ${scan.artifactPath}`)),
    "",
    "## Research",
    "",
    ...(Object.values(manifest.research.lanes).length === 0 ? ["- no research lanes declared"] : Object.values(manifest.research.lanes).map((lane) => `- ${lane.laneId}: ${lane.status} ${lane.expectedArtifactPath}`)),
    "",
    "## Autopilot",
    "",
    ...(Object.values(manifest.autopilot.loops).length === 0 ? ["- no Autopilot loops recorded"] : Object.values(manifest.autopilot.loops).map((loop) => `- ${loop.loopId}: ${loop.status} board=${loop.boardRevisionRead}`)),
    "",
    "## Verification",
    "",
    ...(manifest.route.verificationScenarios.length === 0
      ? ["- no verification scenarios declared"]
      : manifest.route.verificationScenarios.map((scenario) => {
          const verdict = manifest.verification.latestVerdictByScenario[scenario.scenarioId];
          return `- ${scenario.scenarioId}: ${verdict?.status ?? "unverified"} ${verdict?.artifactPath ?? ""}`.trim();
        })),
    "",
    "## Closeout",
    "",
    ...(Object.values(manifest.closeout.records).length === 0 ? ["- no closeout recorded"] : Object.values(manifest.closeout.records).map((record) => `- ${record.closeoutId}: ${record.status} ${record.closeoutArtifactPath}`)),
    "",
  ].join("\n");
}

export function renderBoardMarkdown(board: BoardProjection): string {
  return [
    `# Helmsman Board: ${board.runId}`,
    "",
    `Revision: ${board.revision}`,
    `Stage: ${board.activeStage}`,
    `Route Lock: ${board.routeLock.status}`,
    `Route Lock Hash: ${board.routeLock.snapshotHash ?? "none"}`,
    `Next: ${board.nextLegalAction.kind}`,
    "",
    "## Blockers",
    "",
    ...(board.blockers.length === 0 ? ["- none"] : board.blockers.map((blocker) => `- ${blocker.blockerId}: ${blocker.reason}`)),
    "",
    "## Memory",
    "",
    ...objectLines(board.memory),
    "",
    "## Research",
    "",
    ...objectLines(board.research),
    "",
    "## Autopilot",
    "",
    ...objectLines(board.autopilot),
    "",
    "## Verification",
    "",
    ...objectLines(board.verification),
    "",
    "## Closeout",
    "",
    ...objectLines(board.closeout),
    "",
  ].join("\n");
}

export function renderRouteCardMarkdown(manifest: HelmsmanManifest): string {
  return [
    `# Route Card: ${manifest.run.title}`,
    "",
    `Lock: ${manifest.run.routeLock.status}`,
    `Snapshot hash: ${manifest.run.routeLock.snapshotHash ?? "none"}`,
    "",
    "## Success Criteria",
    "",
    ...(manifest.route.successCriteria.length === 0 ? ["- pending"] : manifest.route.successCriteria.map((item) => `- ${item.text}`)),
    "",
    "## Stop Conditions",
    "",
    ...(manifest.route.stopConditions.length === 0 ? ["- pending"] : manifest.route.stopConditions.map((item) => `- ${item.text}`)),
    "",
    "## Research Evidence",
    "",
    ...(manifest.research.acceptedArtifactIds.length === 0 ? ["- pending"] : manifest.research.acceptedArtifactIds.map((artifactId) => `- accepted: ${artifactId}`)),
    "",
  ].join("\n");
}

function objectLines(value: Record<string, unknown>): string[] {
  return JSON.stringify(value, null, 2).split("\n");
}
