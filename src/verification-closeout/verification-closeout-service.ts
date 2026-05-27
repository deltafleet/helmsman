import { mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { executeCoreCommand, type CoreCommandResult } from "../core/authority/core-store.ts";
import type {
  BoardProjection,
  CloseoutRecord,
  CloseoutStatus,
  HelmsmanManifest,
  MemoryPromotionCandidate,
  RequiredArtifactContract,
  VerificationEvidenceKind,
  VerificationRunFinishRecord,
  VerificationRunPlan,
  VerificationScenarioContract,
  VerificationScenarioVerdict,
  VerificationVerdictStatus,
} from "../core/authority/types.ts";
import { atomicWriteFile } from "../core/document-bus/atomic-write.ts";
import { ensureRunDirs, type RunPaths } from "../core/document-bus/paths.ts";

export interface VerificationStateInput {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
}

export interface VerificationPreconditionBlocker {
  blockerId: string;
  code:
    | "ROUTE_LOCK_REQUIRED"
    | "LOCKED_SNAPSHOT_MISSING"
    | "BOARD_ACTION_ILLEGAL"
    | "AMENDMENT_PENDING"
    | "AUTOPILOT_INCOMPLETE"
    | "SCENARIO_MISSING"
    | "SCENARIO_EVIDENCE_MISSING"
    | "VERIFIER_BINDING_MISSING";
  reason: string;
}

export interface StartVerificationRunInput extends VerificationStateInput {
  verifierRoleId?: string;
  timeoutMs?: number;
  allowedReadScope?: string[];
}

export interface StartVerificationRunOutput {
  plan: VerificationRunPlan;
  planPath: string;
  core: CoreCommandResult;
}

export interface RecordVerificationResultInput extends VerificationStateInput {
  verificationRunId: string;
  scenarioId: string;
  status: VerificationVerdictStatus;
  evidenceIds: string[];
  evidenceKinds: VerificationEvidenceKind[];
  executionStatus?: VerificationScenarioVerdict["executionStatus"];
  criteriaSatisfied?: string[];
  criteriaFailed?: string[];
  criteriaBlocked?: string[];
  observations: string[];
  residualRisk: string;
  followUpRequired?: string[];
  missingAuthorityOrEnvironment?: string;
}

export interface RecordCloseoutInput extends VerificationStateInput {
  status?: CloseoutStatus;
  residualRiskIds?: string[];
  memoryPromotionCandidates?: MemoryPromotionCandidate[];
}

export function evaluateVerificationPreconditions(input: VerificationStateInput & { verifierRoleId?: string }): { ok: boolean; blockers: VerificationPreconditionBlocker[] } {
  const blockers: VerificationPreconditionBlocker[] = [];
  const routeLock = input.manifest.run.routeLock;
  if (routeLock.status !== "locked") blockers.push({ blockerId: "route-lock-required", code: "ROUTE_LOCK_REQUIRED", reason: "Verification requires a locked route." });
  if (!routeLock.snapshotHash || !routeLock.snapshotPath || !routeLock.lockEventId) {
    blockers.push({ blockerId: "locked-snapshot-missing", code: "LOCKED_SNAPSHOT_MISSING", reason: "Verification requires locked snapshot path, hash, and lock event id." });
  }
  if (input.board.nextLegalAction.kind !== "run_verification") {
    blockers.push({ blockerId: "board-action-illegal", code: "BOARD_ACTION_ILLEGAL", reason: `Board next legal action is ${input.board.nextLegalAction.kind}, not run_verification.` });
  }
  for (const pendingId of Object.keys(input.manifest.amendments.pending)) {
    blockers.push({ blockerId: `pending-amendment:${pendingId}`, code: "AMENDMENT_PENDING", reason: `Route amendment ${pendingId} is pending.` });
  }
  for (const loop of Object.values(input.manifest.autopilot.loops)) {
    if (["planned", "running", "needs_repair", "needs_user_action", "failed", "timed_out"].includes(loop.status)) {
      blockers.push({ blockerId: `autopilot:${loop.loopId}`, code: "AUTOPILOT_INCOMPLETE", reason: `Autopilot loop ${loop.loopId} is ${loop.status}.` });
    }
  }
  if (input.manifest.route.verificationScenarios.length === 0) blockers.push({ blockerId: "scenarios-missing", code: "SCENARIO_MISSING", reason: "Verification requires locked route scenarios." });
  for (const scenario of input.manifest.route.verificationScenarios) {
    if (scenario.expectedEvidence.length === 0) blockers.push({ blockerId: `scenario-evidence:${scenario.scenarioId}`, code: "SCENARIO_EVIDENCE_MISSING", reason: `Scenario ${scenario.scenarioId} has no expected evidence.` });
  }
  const roleId = input.verifierRoleId ?? "verifier";
  const binding = input.manifest.roles.bindings[roleId];
  if (!binding || binding.purpose !== "verification") {
    blockers.push({ blockerId: `verifier-binding:${roleId}`, code: "VERIFIER_BINDING_MISSING", reason: `Verifier role binding ${roleId} is required before verification.` });
  }
  return { ok: blockers.length === 0, blockers };
}

export async function startVerificationRun(input: StartVerificationRunInput): Promise<StartVerificationRunOutput> {
  await ensureRunDirs(input.paths);
  const verifierRoleId = input.verifierRoleId ?? "verifier";
  const preconditions = evaluateVerificationPreconditions({ ...input, verifierRoleId });
  if (!preconditions.ok) {
    throw new Error(`Verification preconditions failed: ${preconditions.blockers.map((blocker) => `${blocker.code}:${blocker.reason}`).join("; ")}`);
  }
  const verificationRunId = `verification-run-${randomUUID().slice(0, 8)}`;
  const runDir = `verification/${verificationRunId}`;
  const planPath = `${runDir}/plan.json`;
  const scenarios = input.manifest.route.verificationScenarios.map((scenario) => buildScenarioContract(input, scenario.scenarioId, scenario.title, verifierRoleId, `${runDir}/${safeSlug(scenario.scenarioId)}.md`));
  const expectedArtifacts: RequiredArtifactContract[] = scenarios.map((scenario) => ({
    artifactId: `verification-artifact-${safeSlug(scenario.scenarioId)}`,
    kind: "verification.verdict",
    expectedPath: scenario.expectedArtifactPath,
    required: scenario.hardFloor,
    description: `Scenario verdict artifact for ${scenario.scenarioId}.`,
  }));
  const plan: VerificationRunPlan = {
    schemaVersion: "helmsman.verification-run-plan.v1",
    runId: input.paths.runId,
    verificationRunId,
    boardRevisionRead: input.board.revision,
    boardProjectionHash: input.board.projectionHash,
    routeSnapshotHash: input.manifest.run.routeLock.snapshotHash ?? "",
    scenarioIds: scenarios.map((scenario) => scenario.scenarioId),
    scenarios,
    verifierRoleRunPlans: [],
    expectedArtifacts,
    allowedReadScope: input.allowedReadScope ?? [".", input.manifest.run.routeLock.snapshotPath ?? "route-lock/snapshot.json", "rendered/route-card.md", "rendered/board.md"],
    allowedWriteScope: [runDir],
    forbiddenClaims: [
      "Do not change Route Lock.",
      "Do not propose or apply a route amendment.",
      "Do not record closeout.",
      "Do not claim product readiness.",
      "Do not perform scenario deletion or weakening.",
      "Do not treat execution success as verdict.",
    ],
    timeoutMs: input.timeoutMs ?? 120000,
    createdAt: new Date().toISOString(),
  };
  await mkdir(join(input.paths.runRoot, runDir), { recursive: true });
  await atomicWriteFile(join(input.paths.runRoot, planPath), `${JSON.stringify(plan, null, 2)}\n`);
  await atomicWriteFile(input.paths.verificationIndexPath, renderVerificationIndex(input.manifest, plan));
  const core = await executeCoreCommand(input.paths, {
    commandType: "verification.run_start",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "verification" },
    boardRevisionRead: input.board.revision,
    payload: { plan, planPath } as unknown as Record<string, unknown>,
  });
  await atomicWriteFile(input.paths.verificationIndexPath, renderVerificationIndex(core.manifest, plan));
  return { plan, planPath, core };
}

export async function recordVerificationResult(input: RecordVerificationResultInput): Promise<{ verdict: VerificationScenarioVerdict; artifactContent: string; core: CoreCommandResult }> {
  const plan = input.manifest.verification.plans[input.verificationRunId];
  if (!plan) throw new Error(`Unknown verification run ${input.verificationRunId}.`);
  const scenario = plan.scenarios.find((candidate) => candidate.scenarioId === input.scenarioId);
  if (!scenario) throw new Error(`Unknown scenario ${input.scenarioId} in ${input.verificationRunId}.`);
  const attempt = (input.manifest.verification.verdicts[input.scenarioId]?.length ?? 0) + 1;
  const criteriaSatisfied = input.criteriaSatisfied ?? (input.status === "passed" ? scenario.passCriteria : []);
  const criteriaFailed = input.criteriaFailed ?? (input.status === "failed" ? [scenario.failCriteria[0] ?? "declared fail criterion"] : []);
  const criteriaBlocked = input.criteriaBlocked ?? (input.status === "blocked" ? [scenario.blockedCriteria[0] ?? "declared blocked criterion"] : []);
  const followUpRequired = input.followUpRequired ?? (input.status === "passed" ? [] : [`Resolve ${input.status} scenario ${input.scenarioId}.`]);
  const artifactContent = renderVerificationArtifact({
    scenario,
    status: input.status,
    evidenceIds: input.evidenceIds,
    criteriaSatisfied,
    criteriaFailed,
    criteriaBlocked,
    observations: input.observations,
    residualRisk: input.residualRisk,
    followUpRequired,
  });
  const artifactPath = join(input.paths.runRoot, scenario.expectedArtifactPath);
  await mkdir(dirname(artifactPath), { recursive: true });
  await atomicWriteFile(artifactPath, artifactContent);
  const verdict: VerificationScenarioVerdict = {
    schemaVersion: "helmsman.verification-verdict.v1",
    runId: input.paths.runId,
    verificationRunId: input.verificationRunId,
    verdictId: `verification-verdict-${randomUUID().slice(0, 8)}`,
    scenarioId: input.scenarioId,
    status: input.status,
    attempt,
    verifierRoleId: scenario.verifierRoleId,
    boardRevisionRead: input.board.revision,
    boardProjectionHash: plan.boardProjectionHash,
    routeSnapshotHash: plan.routeSnapshotHash,
    artifactId: `verification-artifact-${safeSlug(input.scenarioId)}`,
    artifactPath: scenario.expectedArtifactPath,
    artifactHash: sha256Text(artifactContent),
    evidenceIds: input.evidenceIds,
    evidenceKinds: input.evidenceKinds,
    executionStatus: input.executionStatus ?? "completed",
    criteriaSatisfied,
    criteriaFailed,
    criteriaBlocked,
    observations: input.observations,
    residualRisk: input.residualRisk,
    followUpRequired,
    missingAuthorityOrEnvironment: input.missingAuthorityOrEnvironment,
    recordedAt: new Date().toISOString(),
  };
  const core = await executeCoreCommand(input.paths, {
    commandType: "verification.result_record",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "verifier", id: scenario.verifierRoleId },
    boardRevisionRead: input.board.revision,
    payload: verdict as unknown as Record<string, unknown>,
  });
  await atomicWriteFile(input.paths.verificationIndexPath, renderVerificationIndex(core.manifest));
  return { verdict, artifactContent, core };
}

export async function finishVerificationRun(input: VerificationStateInput & { verificationRunId: string; status?: VerificationRunFinishRecord["status"] }): Promise<{ finish: VerificationRunFinishRecord; core: CoreCommandResult }> {
  const plan = input.manifest.verification.plans[input.verificationRunId];
  if (!plan) throw new Error(`Unknown verification run ${input.verificationRunId}.`);
  const summary = summarizeScenarioIds(plan.scenarioIds, input.manifest);
  const inferredStatus = input.status ?? (summary.failed.length > 0 ? "failed" : summary.blocked.length > 0 || summary.unverified.length > 0 ? "blocked" : summary.parked.length > 0 ? "parked" : "completed");
  const finish: VerificationRunFinishRecord = {
    verificationRunId: input.verificationRunId,
    status: inferredStatus,
    boardRevisionRead: input.board.revision,
    boardProjectionHash: plan.boardProjectionHash,
    routeSnapshotHash: plan.routeSnapshotHash,
    scenarioSummary: summary,
    evidenceIds: plan.scenarioIds.map((scenarioId) => `verification:${scenarioId}`).filter((evidenceId) => input.manifest.evidence.records[evidenceId]),
    finishedAt: new Date().toISOString(),
  };
  const core = await executeCoreCommand(input.paths, {
    commandType: "verification.run_finish",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "verification" },
    boardRevisionRead: input.board.revision,
    payload: finish as unknown as Record<string, unknown>,
  });
  await atomicWriteFile(input.paths.verificationIndexPath, renderVerificationIndex(core.manifest));
  return { finish, core };
}

export async function recordCloseout(input: RecordCloseoutInput): Promise<{ closeout: CloseoutRecord; core: CoreCommandResult }> {
  const summary = summarizeScenarioIds(input.manifest.route.verificationScenarios.map((scenario) => scenario.scenarioId), input.manifest);
  const status = input.status ?? (summary.failed.length > 0 ? "failed" : summary.blocked.length > 0 || summary.unverified.length > 0 ? "blocked" : summary.parked.length > 0 ? "parked" : "completed");
  const closeoutId = `closeout-${randomUUID().slice(0, 8)}`;
  const acceptedArtifactIds = Object.values(input.manifest.verification.latestVerdictByScenario).map((verdict) => verdict.artifactId);
  const closeout: CloseoutRecord = {
    schemaVersion: "helmsman.closeout.v1",
    runId: input.paths.runId,
    closeoutId,
    status,
    boardRevisionRead: input.board.revision,
    boardProjectionHash: input.board.projectionHash,
    routeSnapshotHash: input.manifest.run.routeLock.snapshotHash ?? "",
    verificationSummary: {
      passed: summary.passed,
      failed: summary.failed,
      blocked: summary.blocked,
      parked: summary.parked,
    },
    acceptedArtifactIds,
    residualRiskIds: input.residualRiskIds ?? Object.values(input.manifest.verification.latestVerdictByScenario).filter((verdict) => verdict.residualRisk !== "none").map((verdict) => verdict.verdictId),
    closeoutArtifactPath: "closeout.md",
    renderedManifestPath: "rendered/manifest.md",
    renderedBoardPath: "rendered/board.md",
    evidenceIndexPath: "evidence/index.md",
    memoryPromotionCandidatePath: input.memoryPromotionCandidates?.length ? "memory/promotion-candidates.md" : undefined,
    memoryPromotionCandidates: input.memoryPromotionCandidates,
    recordedAt: new Date().toISOString(),
  };
  await atomicWriteFile(input.paths.closeoutPath, renderCloseoutArtifact(closeout, input.manifest));
  await atomicWriteFile(input.paths.closeoutEvidenceIndexPath, renderEvidenceIndex(input.manifest));
  if (input.memoryPromotionCandidates?.length) {
    await atomicWriteFile(input.paths.memoryPromotionCandidatePath, renderMemoryPromotionCandidates(input.memoryPromotionCandidates));
  }
  const core = await executeCoreCommand(input.paths, {
    commandType: "closeout.record",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "closeout" },
    boardRevisionRead: input.board.revision,
    payload: closeout as unknown as Record<string, unknown>,
  });
  return { closeout, core };
}

function buildScenarioContract(input: StartVerificationRunInput, scenarioId: string, title: string, verifierRoleId: string, expectedArtifactPath: string): VerificationScenarioContract {
  const scenario = input.manifest.route.verificationScenarios.find((candidate) => candidate.scenarioId === scenarioId)!;
  return {
    schemaVersion: "helmsman.verification-scenario.v1",
    runId: input.paths.runId,
    scenarioId,
    title,
    routeAssertionIds: input.manifest.route.scope.map((item) => item.id),
    successCriterionIds: input.manifest.route.successCriteria.map((item) => item.id),
    riskIds: input.manifest.route.risks.map((risk) => risk.id),
    scope: "integration",
    method: "artifact_inspection",
    verifierRoleId,
    expectedArtifactPath,
    requiredEvidenceKinds: ["command_output", "artifact"],
    passCriteria: scenario.expectedEvidence.map((evidence) => `Evidence present: ${evidence}`),
    failCriteria: [`Evidence contradicts locked scenario ${scenarioId}.`],
    blockedCriteria: [`Required evidence is unavailable for locked scenario ${scenarioId}.`],
    hardFloor: true,
    createdFromEventId: input.manifest.run.routeLock.lockEventId ?? "route-lock",
  };
}

function summarizeScenarioIds(scenarioIds: string[], manifest: HelmsmanManifest): VerificationRunFinishRecord["scenarioSummary"] {
  const summary: VerificationRunFinishRecord["scenarioSummary"] = { passed: [], failed: [], blocked: [], parked: [], unverified: [] };
  for (const scenarioId of scenarioIds) {
    const verdict = manifest.verification.latestVerdictByScenario[scenarioId];
    if (!verdict) summary.unverified.push(scenarioId);
    else if (verdict.status === "passed") summary.passed.push(scenarioId);
    else if (verdict.status === "failed") summary.failed.push(scenarioId);
    else if (verdict.status === "blocked") summary.blocked.push(scenarioId);
    else summary.parked.push(scenarioId);
  }
  return summary;
}

function renderVerificationArtifact(input: {
  scenario: VerificationScenarioContract;
  status: VerificationVerdictStatus;
  evidenceIds: string[];
  criteriaSatisfied: string[];
  criteriaFailed: string[];
  criteriaBlocked: string[];
  observations: string[];
  residualRisk: string;
  followUpRequired: string[];
}): string {
  return [
    `# Verification: ${input.scenario.scenarioId} ${input.scenario.title}`,
    "",
    "## Scenario",
    input.scenario.title,
    "",
    "## Route Assertions",
    ...input.scenario.routeAssertionIds.map((id) => `- ${id}`),
    "",
    "## Method",
    `${input.scenario.method} / ${input.scenario.scope}`,
    "",
    "## Evidence",
    ...input.evidenceIds.map((id) => `- ${id}`),
    "",
    "## Observations",
    ...input.observations.map((item) => `- ${item}`),
    "",
    "## Verdict",
    `Status: ${input.status}`,
    ...input.criteriaSatisfied.map((item) => `- satisfied: ${item}`),
    ...input.criteriaFailed.map((item) => `- failed: ${item}`),
    ...input.criteriaBlocked.map((item) => `- blocked: ${item}`),
    "",
    "## Residual Risk",
    input.residualRisk,
    "",
    "## Follow-Up Required",
    ...(input.followUpRequired.length === 0 ? ["- none"] : input.followUpRequired.map((item) => `- ${item}`)),
    "",
  ].join("\n");
}

function renderVerificationIndex(manifest: HelmsmanManifest, pendingPlan?: VerificationRunPlan): string {
  return [
    "# Verification Index",
    "",
    `Run: ${manifest.run.id}`,
    `Route Lock: ${manifest.run.routeLock.status}`,
    `Locked snapshot hash: ${manifest.run.routeLock.snapshotHash ?? "none"}`,
    "",
    "## Runs",
    ...(Object.values(manifest.verification.runs).length === 0 ? ["- no verification runs recorded"] : Object.values(manifest.verification.runs).map((run) => `- ${run.verificationRunId}: ${run.status} scenarios=${run.scenarioIds.join(", ")}`)),
    ...(pendingPlan ? ["", "## Pending Plan", `- ${pendingPlan.verificationRunId}: scenarios=${pendingPlan.scenarioIds.join(", ")}`] : []),
    "",
    "## Scenario Matrix",
    ...(manifest.route.verificationScenarios.length === 0
      ? ["- no scenarios"]
      : manifest.route.verificationScenarios.map((scenario) => {
          const verdict = manifest.verification.latestVerdictByScenario[scenario.scenarioId];
          return `- ${scenario.scenarioId}: ${verdict?.status ?? "unverified"} ${verdict?.artifactPath ?? ""}`.trim();
        })),
    "",
  ].join("\n");
}

function renderCloseoutArtifact(closeout: CloseoutRecord, manifest: HelmsmanManifest): string {
  return [
    `# Closeout: ${closeout.closeoutId}`,
    "",
    `Status: ${closeout.status}`,
    `Run: ${closeout.runId}`,
    `Route snapshot hash: ${closeout.routeSnapshotHash}`,
    "",
    "## Verification Summary",
    `Passed: ${closeout.verificationSummary.passed.join(", ") || "none"}`,
    `Failed: ${closeout.verificationSummary.failed.join(", ") || "none"}`,
    `Blocked: ${closeout.verificationSummary.blocked.join(", ") || "none"}`,
    `Parked: ${closeout.verificationSummary.parked.join(", ") || "none"}`,
    "",
    "## Accepted Artifacts",
    ...(closeout.acceptedArtifactIds.length === 0 ? ["- none"] : closeout.acceptedArtifactIds.map((artifactId) => `- ${artifactId}: ${manifest.artifacts.records[artifactId]?.path ?? "unknown"}`)),
    "",
    "## Residual Risks",
    ...(closeout.residualRiskIds.length === 0 ? ["- none"] : closeout.residualRiskIds.map((riskId) => `- ${riskId}`)),
    "",
    "## Completion Boundary",
    closeout.status === "completed" ? "All required scenario verdicts are passed by Core." : "This closeout is not successful completion.",
    "",
  ].join("\n");
}

function renderEvidenceIndex(manifest: HelmsmanManifest): string {
  return [
    "# Evidence Index",
    "",
    ...Object.values(manifest.evidence.records).map((record) => `- ${record.evidenceId}: ${record.kind} ${record.path ?? ""} - ${record.summary}`),
    "",
  ].join("\n");
}

function renderMemoryPromotionCandidates(candidates: MemoryPromotionCandidate[]): string {
  return [
    "# Memory Promotion Candidates",
    "",
    ...candidates.flatMap((candidate) => [
      `## ${candidate.candidateId}`,
      `Claim: ${candidate.claim}`,
      `Source run: ${candidate.sourceRunId}`,
      `Source artifacts: ${candidate.sourceArtifactIds.join(", ")}`,
      `Source evidence: ${candidate.sourceEvidenceIds.join(", ")}`,
      `Applicable scope: ${candidate.applicableScope}`,
      `Known limitations: ${candidate.knownLimitations.join("; ") || "none"}`,
      `Staleness trigger: ${candidate.stalenessTrigger}`,
      `Contradiction notes: ${candidate.contradictionNotes}`,
      `Destination: ${candidate.suggestedDestinationNamespace}`,
      `Approval policy: ${candidate.approvalPolicy}`,
      "",
    ]),
  ].join("\n");
}

function safeSlug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "scenario";
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
