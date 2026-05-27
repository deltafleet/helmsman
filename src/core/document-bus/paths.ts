import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export interface RunPaths {
  cwd: string;
  runId: string;
  runRoot: string;
  renderedRoot: string;
  renderedQuestionsRoot: string;
  memoryRoot: string;
  researchRoot: string;
  workerPacketsRoot: string;
  routeLockRoot: string;
  amendmentsRoot: string;
  autopilotRoot: string;
  autopilotLoopsRoot: string;
  verificationRoot: string;
  closeoutRoot: string;
  roleRunsRoot: string;
  coreRoot: string;
  adapterRoot: string;
  piRoot: string;
  piSessionDir: string;
  evidenceRoot: string;
  eventsPath: string;
  manifestEventsPath: string;
  manifestPath: string;
  questionLedgerPath: string;
  roleRegistryPath: string;
  scorecardPath: string;
  memoryIndexPath: string;
  researchIndexPath: string;
  workerPacketsIndexPath: string;
  routeLockProposalPath: string;
  routeLockSnapshotPath: string;
  routeLockSnapshotMarkdownPath: string;
  routeLockConfirmationEvidencePath: string;
  amendmentIndexPath: string;
  autopilotIndexPath: string;
  verificationIndexPath: string;
  closeoutPath: string;
  closeoutEvidenceIndexPath: string;
  memoryPromotionCandidatePath: string;
  operationStatePath: string;
  boardPath: string;
  renderedManifestPath: string;
  renderedBoardPath: string;
  renderedRouteCardPath: string;
  nativeQuestionSurfaceEvidencePath: string;
  appendJournalPath: string;
  replayReportPath: string;
  projectorReportPath: string;
  gateReportPath: string;
  corruptionReportPath: string;
  sessionLockPath: string;
  capabilityReportPath: string;
  piSessionLinksPath: string;
}

export function assertSafeRunId(runId: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
    throw new Error(`Unsafe Helmsman run id: ${runId}`);
  }
}

export function resolveRunPaths(input: { cwd: string; runId: string }): RunPaths {
  assertSafeRunId(input.runId);
  const cwd = resolve(input.cwd);
  const runRoot = resolve(cwd, ".helmsman", "sessions", input.runId);
  const renderedRoot = resolve(runRoot, "rendered");
  const renderedQuestionsRoot = resolve(renderedRoot, "questions");
  const memoryRoot = resolve(runRoot, "memory");
  const researchRoot = resolve(runRoot, "research");
  const workerPacketsRoot = resolve(runRoot, "worker-packets");
  const routeLockRoot = resolve(runRoot, "route-lock");
  const amendmentsRoot = resolve(routeLockRoot, "amendments");
  const autopilotRoot = resolve(runRoot, "autopilot");
  const autopilotLoopsRoot = resolve(autopilotRoot, "loops");
  const verificationRoot = resolve(runRoot, "verification");
  const closeoutRoot = resolve(runRoot, "closeout");
  const roleRunsRoot = resolve(runRoot, "role-runs");
  const coreRoot = resolve(runRoot, "core");
  const adapterRoot = resolve(runRoot, "adapter");
  const piRoot = resolve(adapterRoot, "pi");
  const evidenceRoot = resolve(runRoot, "evidence");
  return {
    cwd,
    runId: input.runId,
    runRoot,
    renderedRoot,
    renderedQuestionsRoot,
    memoryRoot,
    researchRoot,
    workerPacketsRoot,
    routeLockRoot,
    amendmentsRoot,
    autopilotRoot,
    autopilotLoopsRoot,
    verificationRoot,
    closeoutRoot,
    roleRunsRoot,
    coreRoot,
    adapterRoot,
    piRoot,
    piSessionDir: resolve(piRoot, "sessions"),
    evidenceRoot,
    eventsPath: resolve(runRoot, "events.jsonl"),
    manifestEventsPath: resolve(runRoot, "manifest.events.jsonl"),
    manifestPath: resolve(runRoot, "manifest.json"),
    questionLedgerPath: resolve(runRoot, "question-ledger.json"),
    roleRegistryPath: resolve(runRoot, "role-registry.json"),
    scorecardPath: resolve(runRoot, "scorecard.json"),
    memoryIndexPath: resolve(runRoot, "memory-index.md"),
    researchIndexPath: resolve(runRoot, "research-index.md"),
    workerPacketsIndexPath: resolve(runRoot, "worker-packets.md"),
    routeLockProposalPath: resolve(routeLockRoot, "proposal.json"),
    routeLockSnapshotPath: resolve(routeLockRoot, "snapshot.json"),
    routeLockSnapshotMarkdownPath: resolve(routeLockRoot, "snapshot.md"),
    routeLockConfirmationEvidencePath: resolve(evidenceRoot, "route-lock-confirmation.jsonl"),
    amendmentIndexPath: resolve(amendmentsRoot, "amendments.md"),
    autopilotIndexPath: resolve(autopilotRoot, "autopilot-index.md"),
    verificationIndexPath: resolve(verificationRoot, "verification-index.md"),
    closeoutPath: resolve(runRoot, "closeout.md"),
    closeoutEvidenceIndexPath: resolve(evidenceRoot, "index.md"),
    memoryPromotionCandidatePath: resolve(memoryRoot, "promotion-candidates.md"),
    operationStatePath: resolve(runRoot, "operation-state.json"),
    boardPath: resolve(runRoot, "board.json"),
    renderedManifestPath: resolve(renderedRoot, "manifest.md"),
    renderedBoardPath: resolve(renderedRoot, "board.md"),
    renderedRouteCardPath: resolve(renderedRoot, "route-card.md"),
    nativeQuestionSurfaceEvidencePath: resolve(evidenceRoot, "native-question-surface.jsonl"),
    appendJournalPath: resolve(coreRoot, "append-journal.jsonl"),
    replayReportPath: resolve(coreRoot, "replay-report.json"),
    projectorReportPath: resolve(coreRoot, "projector-report.json"),
    gateReportPath: resolve(coreRoot, "gate-report.json"),
    corruptionReportPath: resolve(coreRoot, "corruption-report.json"),
    sessionLockPath: resolve(runRoot, "session.lock"),
    capabilityReportPath: resolve(piRoot, "capability-report.json"),
    piSessionLinksPath: resolve(evidenceRoot, "pi-session-links.jsonl"),
  };
}

export async function ensureRunDirs(paths: RunPaths): Promise<void> {
  await Promise.all([
    mkdir(paths.runRoot, { recursive: true }),
    mkdir(paths.renderedRoot, { recursive: true }),
    mkdir(paths.renderedQuestionsRoot, { recursive: true }),
    mkdir(paths.memoryRoot, { recursive: true }),
    mkdir(paths.researchRoot, { recursive: true }),
    mkdir(paths.workerPacketsRoot, { recursive: true }),
    mkdir(paths.routeLockRoot, { recursive: true }),
    mkdir(paths.amendmentsRoot, { recursive: true }),
    mkdir(paths.autopilotRoot, { recursive: true }),
    mkdir(paths.autopilotLoopsRoot, { recursive: true }),
    mkdir(paths.verificationRoot, { recursive: true }),
    mkdir(paths.closeoutRoot, { recursive: true }),
    mkdir(paths.roleRunsRoot, { recursive: true }),
    mkdir(paths.coreRoot, { recursive: true }),
    mkdir(paths.piRoot, { recursive: true }),
    mkdir(paths.piSessionDir, { recursive: true }),
    mkdir(paths.evidenceRoot, { recursive: true }),
  ]);
}
