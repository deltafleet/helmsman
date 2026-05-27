import { appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { executeCoreCommand, type CoreCommandResult } from "../core/authority/core-store.ts";
import { sha256Json } from "../core/authority/hash.ts";
import type {
  ArtifactRecord,
  BoardProjection,
  HelmsmanManifest,
  RouteAmendment,
  RouteAmendmentApplication,
  RouteAmendmentRejection,
  RouteEffect,
  RouteLockBlocker,
  RouteLockConfirmationEvidence,
  RouteLockInvalidationRecord,
  RouteLockProposal,
  RouteLockReadiness,
  RouteLockSnapshot,
  RouteLockWarning,
} from "../core/authority/types.ts";
import { atomicWriteFile, jsonLine } from "../core/document-bus/atomic-write.ts";
import type { RunPaths } from "../core/document-bus/paths.ts";

export interface RouteLockStateInput {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
}

export function evaluateRouteLockReadiness(input: RouteLockStateInput): RouteLockReadiness {
  const blockers: RouteLockBlocker[] = [];
  const warnings: RouteLockWarning[] = [];
  const requiredEvidenceIds = new Set<string>();

  if (input.manifest.run.activeStage !== "lock_ready") {
    blockers.push(blocker("active-stage", "GATE_BLOCKED", `Route Lock requires lock_ready stage; current stage is ${input.manifest.run.activeStage}.`, "synthesize"));
  }
  for (const questionId of input.manifest.questions.openQuestionIds) {
    blockers.push(blocker(`open-question:${questionId}`, "OPEN_ROUTE_QUESTION", `Required question ${questionId} is still open.`, "ask_question_bundle", questionId));
  }
  for (const answer of Object.values(input.manifest.questions.answers)) {
    const surface = input.manifest.questions.surfaces[answer.surfaceId];
    const evidence = input.manifest.evidence.records[answer.surfaceId];
    if (!surface || !evidence) {
      blockers.push(blocker(`question-surface:${answer.surfaceId}`, "QUESTION_SURFACE_MISSING", `Answer ${answer.questionId} lacks rendered question surface evidence.`, "ask_question_bundle", answer.surfaceId));
    } else {
      requiredEvidenceIds.add(answer.surfaceId);
    }
    const bundle = Object.values(input.manifest.questions.bundles).find((candidate) => candidate.questions.some((question) => question.questionId === answer.questionId));
    const question = bundle?.questions.find((candidate) => candidate.questionId === answer.questionId);
    for (const selected of answer.selectedOptionIds) {
      if (!question || !Array.isArray(question.routeEffectsByOption[selected]) || question.routeEffectsByOption[selected]!.length === 0) {
        blockers.push(blocker(`route-effect:${answer.questionId}:${selected}`, "ROUTE_EFFECT_MISSING", `Answer ${answer.questionId}/${selected} has no Core route effect.`, "ask_question_bundle", answer.questionId));
      }
    }
  }
  const scanIds = Object.keys(input.manifest.memory.scans);
  if (scanIds.length === 0) {
    blockers.push(blocker("memory-scan-missing", "MEMORY_SCAN_MISSING", "A scoped memory scan is required before Route Lock.", "run_memory_scan"));
  } else {
    for (const scanId of scanIds) requiredEvidenceIds.add(`memory-scan:${scanId}`);
  }
  for (const lane of Object.values(input.manifest.research.lanes)) {
    if (!["accepted", "dropped"].includes(lane.status)) {
      blockers.push(blocker(`research-open:${lane.laneId}`, "RESEARCH_LANE_OPEN", `Research lane ${lane.laneId} remains ${lane.status}.`, "dispatch_research", lane.laneId));
    }
    if (lane.status === "accepted") {
      const accepted = Object.values(input.manifest.artifacts.records).find((artifact) => artifact.path === lane.expectedArtifactPath && artifact.status === "accepted");
      if (!accepted) {
        blockers.push(blocker(`research-artifact:${lane.laneId}`, "ARTIFACT_NOT_ACCEPTED", `Research lane ${lane.laneId} has no accepted artifact at ${lane.expectedArtifactPath}.`, "dispatch_research", lane.expectedArtifactPath));
      } else {
        requiredEvidenceIds.add(accepted.artifactId);
        for (const evidenceId of accepted.evidenceIds) requiredEvidenceIds.add(evidenceId);
      }
    }
  }
  if (input.manifest.route.verificationScenarios.length === 0) {
    blockers.push(blocker("verification-scenarios-missing", "VERIFICATION_SCENARIOS_MISSING", "At least one verification scenario must be declared before Route Lock.", "ask_question_bundle"));
  }
  for (const [gateId, gate] of Object.entries(input.manifest.gates)) {
    if (gate.hardBlockers.length > 0) {
      blockers.push(blocker(`gate:${gateId}`, "GATE_BLOCKED", `Gate ${gateId} has hard blockers: ${gate.hardBlockers.join(", ")}.`, "park", gateId));
    }
  }
  if (input.manifest.route.risks.length > 0) {
    warnings.push({ warningId: "known-risks", reason: `${input.manifest.route.risks.length} known route risks remain in the lock snapshot.` });
  }

  return {
    schemaVersion: "helmsman.route-lock-readiness.v1",
    runId: input.manifest.run.id,
    evaluatedAt: input.manifest.run.updatedAt,
    boardRevisionRead: input.board.revision,
    eventSequenceRead: input.board.rebuiltFromEventSequence,
    status: blockers.length === 0 ? "lock_ready" : "blocked",
    hardBlockers: blockers,
    softWarnings: warnings,
    requiredEvidenceIds: [...requiredEvidenceIds].sort(),
  };
}

export function buildRouteLockSnapshot(input: RouteLockStateInput): RouteLockSnapshot {
  const acceptedArtifacts = Object.values(input.manifest.artifacts.records).filter((artifact) => artifact.status === "accepted");
  return {
    schemaVersion: "helmsman.route-lock-snapshot.v1",
    runId: input.manifest.run.id,
    createdAt: input.manifest.run.updatedAt,
    eventSequenceRead: input.board.rebuiltFromEventSequence,
    boardRevisionRead: input.board.revision,
    route: {
      goal: input.manifest.route.goal,
      scope: input.manifest.route.scope,
      nonGoals: input.manifest.route.nonGoals,
      assumptions: input.manifest.route.assumptions,
      risks: input.manifest.route.risks,
      stopConditions: input.manifest.route.stopConditions,
      successCriteria: input.manifest.route.successCriteria,
      autonomyBoundary: input.manifest.route.autonomyBoundary,
      verificationScenarios: input.manifest.route.verificationScenarios,
    },
    answeredQuestions: Object.values(input.manifest.questions.answers).sort((left, right) => left.questionId.localeCompare(right.questionId)),
    waivedQuestionIds: [...input.manifest.questions.waivedQuestionIds].sort(),
    memorySummary: {
      scanIds: Object.keys(input.manifest.memory.scans).sort(),
      candidateIds: Object.keys(input.manifest.memory.candidates).sort(),
      blockingCandidateIds: Object.values(input.manifest.memory.candidates).filter((candidate) => candidate.blocksRouteLock).map((candidate) => candidate.candidateId).sort(),
    },
    researchSummary: {
      laneIds: Object.keys(input.manifest.research.lanes).sort(),
      acceptedArtifactIds: [...input.manifest.research.acceptedArtifactIds].sort(),
      droppedLaneIds: [...input.manifest.research.droppedLaneIds].sort(),
      synthesisIds: Object.keys(input.manifest.research.syntheses).sort(),
    },
    acceptedArtifacts: acceptedArtifacts.sort((left, right) => left.artifactId.localeCompare(right.artifactId)),
    knownRisks: input.manifest.route.risks,
    autonomyBoundary: input.manifest.route.autonomyBoundary,
    verificationScenarios: input.manifest.route.verificationScenarios,
  };
}

export function hashRouteLockSnapshot(snapshot: RouteLockSnapshot): string {
  return sha256Json(snapshot);
}

export async function proposeRouteLock(input: RouteLockStateInput): Promise<{ proposal: RouteLockProposal; snapshot: RouteLockSnapshot; core: CoreCommandResult }> {
  const readiness = evaluateRouteLockReadiness(input);
  const snapshot = buildRouteLockSnapshot(input);
  const snapshotHash = hashRouteLockSnapshot(snapshot);
  readiness.routeSnapshotHash = snapshotHash;
  const proposal: RouteLockProposal = {
    schemaVersion: "helmsman.route-lock-proposal.v1",
    proposalId: `route-lock-${randomUUID().slice(0, 8)}`,
    runId: input.manifest.run.id,
    proposedAt: input.manifest.run.updatedAt,
    boardRevisionRead: input.board.revision,
    eventSequenceRead: input.board.rebuiltFromEventSequence,
    snapshotPath: "route-lock/snapshot.json",
    snapshotHash,
    renderedPath: "route-lock/snapshot.md",
    remainingRisks: input.manifest.route.risks,
    softWarnings: readiness.softWarnings,
    requiredUserConfirmation: true,
    readiness,
  };

  await atomicWriteFile(input.paths.routeLockSnapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  await atomicWriteFile(input.paths.routeLockSnapshotMarkdownPath, renderRouteLockSnapshotMarkdown(snapshot, snapshotHash, proposal));
  await atomicWriteFile(input.paths.routeLockProposalPath, `${JSON.stringify(proposal, null, 2)}\n`);
  const core = await executeCoreCommand(input.paths, {
    commandType: "route.lock_propose",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "route-lock" },
    boardRevisionRead: input.board.revision,
    payload: proposal as unknown as Record<string, unknown>,
  });
  return { proposal, snapshot, core };
}

export async function confirmRouteLock(input: RouteLockStateInput & { proposalId?: string; snapshotHash: string; surface: "cli" | "tui" | "headless"; userId?: string }): Promise<{ evidence: RouteLockConfirmationEvidence; core: CoreCommandResult }> {
  const proposalId = input.proposalId ?? input.manifest.run.routeLock.proposalId;
  if (!proposalId) throw new Error("No active Route Lock proposal to confirm.");
  const evidence: RouteLockConfirmationEvidence = {
    schemaVersion: "helmsman.route-lock-confirmation-evidence.v1",
    evidenceId: `route-lock:confirmation:${proposalId}`,
    runId: input.manifest.run.id,
    proposalId,
    confirmedAt: new Date().toISOString(),
    userAction: "confirmed",
    visibleSnapshotHash: input.snapshotHash,
    snapshotPath: input.manifest.run.routeLock.snapshotPath ?? "route-lock/snapshot.json",
    snapshotHash: input.snapshotHash,
    surface: input.surface,
    userId: input.userId ?? "user",
  };
  await appendFile(input.paths.routeLockConfirmationEvidencePath, jsonLine(evidence), "utf8");
  const core = await executeCoreCommand(input.paths, {
    commandType: "route.lock_confirm",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "user", id: evidence.userId },
    boardRevisionRead: input.board.revision,
    payload: {
      proposalId,
      confirmedBy: "user",
      confirmedSurfaceEvidenceId: evidence.evidenceId,
      snapshotPath: evidence.snapshotPath,
      snapshotHash: evidence.snapshotHash,
      routeCardPath: "rendered/route-card.md",
      confirmationEvidence: evidence,
    },
  });
  return { evidence, core };
}

export async function cancelRouteLock(input: RouteLockStateInput & { proposalId?: string; reason: string }): Promise<CoreCommandResult> {
  const proposalId = input.proposalId ?? input.manifest.run.routeLock.proposalId;
  if (!proposalId) throw new Error("No active Route Lock proposal to cancel.");
  return await executeCoreCommand(input.paths, {
    commandType: "route.lock_cancel",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "user", id: "route-lock-cli" },
    boardRevisionRead: input.board.revision,
    payload: { proposalId, reason: input.reason },
  });
}

export async function unlockRouteLock(input: RouteLockStateInput & { reason: string; evidenceIds?: string[]; actor?: "user" | "core_policy" }): Promise<CoreCommandResult> {
  const actor = input.actor ?? "user";
  return await executeCoreCommand(input.paths, {
    commandType: "route.unlock",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: actor, id: "route-lock" },
    boardRevisionRead: input.board.revision,
    payload: {
      reason: input.reason,
      unlockedBy: actor,
      previousSnapshotHash: input.manifest.run.routeLock.snapshotHash,
      requiredNextStage: "charting",
      evidenceIds: input.evidenceIds ?? [],
    },
  });
}

export async function invalidateRouteLock(input: RouteLockStateInput & { reason: string; severity: "warning" | "hard"; requiredResponse: RouteLockInvalidationRecord["requiredResponse"]; evidenceIds?: string[] }): Promise<CoreCommandResult> {
  const previousSnapshotHash = input.manifest.run.routeLock.snapshotHash;
  if (!previousSnapshotHash) throw new Error("Route invalidation requires an existing locked snapshot hash.");
  return await executeCoreCommand(input.paths, {
    commandType: "route.invalidate",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "route-lock" },
    boardRevisionRead: input.board.revision,
    payload: {
      previousSnapshotHash,
      reason: input.reason,
      severity: input.severity,
      evidenceIds: input.evidenceIds ?? [],
      requiredResponse: input.requiredResponse,
    } satisfies RouteLockInvalidationRecord,
  });
}

export async function proposeRouteAmendment(input: RouteLockStateInput & {
  kind: RouteAmendment["kind"];
  reason: string;
  routeEffects: RouteEffect[];
  requiresUserConfirmation?: boolean;
  invalidatesLock?: boolean;
  evidenceIds?: string[];
  actor?: RouteAmendment["proposedBy"];
}): Promise<{ amendment: RouteAmendment; renderedPath: string; core: CoreCommandResult }> {
  const amendmentId = `amendment-${randomUUID().slice(0, 8)}`;
  const actor = input.actor ?? "user";
  const amendment: RouteAmendment = {
    schemaVersion: "helmsman.route-amendment.v1",
    amendmentId,
    kind: input.kind,
    proposedAt: new Date().toISOString(),
    proposedBy: actor,
    reason: input.reason,
    routeEffects: input.routeEffects,
    evidenceIds: input.evidenceIds ?? [],
    requiresUserConfirmation: input.requiresUserConfirmation ?? routeEffectsRequireUser(input.routeEffects),
    invalidatesLock: input.invalidatesLock ?? input.kind === "unlock_required",
    previousSnapshotHash: input.manifest.run.routeLock.snapshotHash ?? "",
  };
  const renderedPath = `route-lock/amendments/${amendmentId}.md`;
  await atomicWriteFile(join(input.paths.runRoot, renderedPath), renderAmendmentMarkdown(amendment));
  const core = await executeCoreCommand(input.paths, {
    commandType: "route.amend_propose",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: actor, id: "route-amendment" },
    boardRevisionRead: input.board.revision,
    payload: { amendment, renderedPath },
  });
  await atomicWriteFile(input.paths.amendmentIndexPath, renderAmendmentIndex(core.manifest));
  return { amendment, renderedPath, core };
}

export async function applyRouteAmendment(input: RouteLockStateInput & { amendmentId: string; actor?: "user" | "core_policy"; confirmationEvidenceId?: string }): Promise<{ application: RouteAmendmentApplication; core: CoreCommandResult }> {
  const pending = input.manifest.amendments.pending[input.amendmentId];
  if (!pending) throw new Error(`Unknown pending amendment ${input.amendmentId}.`);
  const preview = previewManifestAfterEffects(input.manifest, pending.amendment.routeEffects);
  const snapshot = buildRouteLockSnapshot({ ...input, manifest: preview });
  const hash = hashRouteLockSnapshot(snapshot);
  const newSnapshotPath = `route-lock/amendments/${input.amendmentId}-snapshot.json`;
  await atomicWriteFile(join(input.paths.runRoot, newSnapshotPath), `${JSON.stringify(snapshot, null, 2)}\n`);
  const application: RouteAmendmentApplication = {
    amendmentId: input.amendmentId,
    appliedBy: input.actor ?? "user",
    confirmationEvidenceId: input.confirmationEvidenceId,
    previousSnapshotHash: pending.amendment.previousSnapshotHash,
    newSnapshotPath,
    newSnapshotHash: hash,
  };
  const core = await executeCoreCommand(input.paths, {
    commandType: "route.amend_apply",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: application.appliedBy, id: "route-amendment" },
    boardRevisionRead: input.board.revision,
    payload: application as unknown as Record<string, unknown>,
  });
  await atomicWriteFile(input.paths.amendmentIndexPath, renderAmendmentIndex(core.manifest));
  return { application, core };
}

export async function rejectRouteAmendment(input: RouteLockStateInput & { amendmentId: string; reason: string; actor?: "user" | "core_policy" }): Promise<{ rejection: RouteAmendmentRejection; core: CoreCommandResult }> {
  const actor = input.actor ?? "user";
  const rejection: RouteAmendmentRejection = { amendmentId: input.amendmentId, rejectedBy: actor, reason: input.reason };
  const core = await executeCoreCommand(input.paths, {
    commandType: "route.amend_reject",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: actor, id: "route-amendment" },
    boardRevisionRead: input.board.revision,
    payload: rejection as unknown as Record<string, unknown>,
  });
  await atomicWriteFile(input.paths.amendmentIndexPath, renderAmendmentIndex(core.manifest));
  return { rejection, core };
}

function blocker(blockerId: string, code: RouteLockBlocker["code"], reason: string, requiredAction: RouteLockBlocker["requiredAction"], sourceId?: string): RouteLockBlocker {
  return { blockerId, code, reason, sourceId, requiredAction };
}

function routeEffectsRequireUser(effects: RouteEffect[]): boolean {
  return effects.some((effect) => effect.kind === "route.autonomy_boundary.set" || effect.kind === "route.verification_scenario.remove");
}

function previewManifestAfterEffects(manifest: HelmsmanManifest, effects: RouteEffect[]): HelmsmanManifest {
  const next = structuredClone(manifest) as HelmsmanManifest;
  for (const effect of effects) {
    if (effect.kind === "route.scope.add") next.route.scope.push(assertion(effect.id, effect.text));
    else if (effect.kind === "route.scope.remove") next.route.scope = next.route.scope.filter((item) => item.id !== effect.targetId);
    else if (effect.kind === "route.non_goal.add") next.route.nonGoals.push(assertion(effect.id, effect.text));
    else if (effect.kind === "route.assumption.add") next.route.assumptions.push(assertion(effect.id, effect.text));
    else if (effect.kind === "route.risk.add") next.route.risks.push({ ...assertion(effect.id, effect.text), severity: effect.severity, mitigation: effect.mitigation });
    else if (effect.kind === "route.stop_condition.add") next.route.stopConditions.push(assertion(effect.id, effect.text));
    else if (effect.kind === "route.success_criterion.add") next.route.successCriteria.push(assertion(effect.id, effect.text));
    else if (effect.kind === "route.verification_scenario.add") next.route.verificationScenarios.push(effect.scenario);
    else if (effect.kind === "route.verification_scenario.remove") next.route.verificationScenarios = next.route.verificationScenarios.filter((scenario) => scenario.scenarioId !== effect.scenarioId);
    else if (effect.kind === "route.autonomy_boundary.set") next.route.autonomyBoundary = { ...next.route.autonomyBoundary, ...effect.boundary };
  }
  return next;
}

function assertion(id: string, text: string): HelmsmanManifest["route"]["scope"][number] {
  return { id, text, sourceEventId: "amendment.preview", evidenceIds: [] };
}

function renderRouteLockSnapshotMarkdown(snapshot: RouteLockSnapshot, hash: string, proposal: RouteLockProposal): string {
  return [
    "# Route Lock Snapshot",
    "",
    `Proposal: ${proposal.proposalId}`,
    `Snapshot hash: ${hash}`,
    `Board revision read: ${snapshot.boardRevisionRead}`,
    "",
    "## Goal",
    "",
    snapshot.route.goal,
    "",
    "## Scope",
    "",
    ...lines(snapshot.route.scope.map((item) => item.text)),
    "",
    "## Success Criteria",
    "",
    ...lines(snapshot.route.successCriteria.map((item) => item.text)),
    "",
    "## Stop Conditions",
    "",
    ...lines(snapshot.route.stopConditions.map((item) => item.text)),
    "",
    "## Verification Scenarios",
    "",
    ...lines(snapshot.verificationScenarios.map((scenario) => `${scenario.scenarioId}: ${scenario.title}`)),
    "",
    "## Accepted Artifacts",
    "",
    ...lines(snapshot.acceptedArtifacts.map((artifact) => `${artifact.artifactId}: ${artifact.path ?? ""}`)),
    "",
    "Initial Route Lock requires user confirmation with this exact snapshot hash.",
    "",
  ].join("\n");
}

function renderAmendmentMarkdown(amendment: RouteAmendment): string {
  return [
    "# Route Amendment",
    "",
    `Amendment: ${amendment.amendmentId}`,
    `Kind: ${amendment.kind}`,
    `Requires user confirmation: ${amendment.requiresUserConfirmation ? "yes" : "no"}`,
    `Invalidates lock: ${amendment.invalidatesLock ? "yes" : "no"}`,
    `Previous snapshot hash: ${amendment.previousSnapshotHash}`,
    "",
    "## Reason",
    "",
    amendment.reason,
    "",
    "## Route Effects",
    "",
    ...lines(amendment.routeEffects.map((effect) => `${effect.id}: ${effect.kind}`)),
    "",
  ].join("\n");
}

function renderAmendmentIndex(manifest: HelmsmanManifest): string {
  return [
    "# Route Amendments",
    "",
    "## Pending",
    ...lines(Object.keys(manifest.amendments.pending)),
    "",
    "## Applied",
    ...lines(Object.keys(manifest.amendments.applied)),
    "",
    "## Rejected",
    ...lines(Object.keys(manifest.amendments.rejected)),
    "",
  ].join("\n");
}

function lines(values: string[]): string[] {
  return values.length === 0 ? ["- none"] : values.map((value) => `- ${value}`);
}
