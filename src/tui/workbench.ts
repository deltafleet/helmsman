import { Box, Input, Text, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { routeWorkbenchCommand, type WorkbenchCommandOptions, type WorkbenchCommandResult } from "./workbench-command-router.ts";
import type { WorkbenchState } from "./workbench-state.ts";

export class WorkbenchRoot implements Component {
  readonly commandInput = new Input();
  shouldExit = false;
  lastResult?: WorkbenchCommandResult;
  onAfterSubmit?: (result: WorkbenchCommandResult) => void;

  constructor(public state: WorkbenchState, private readonly options: WorkbenchCommandOptions = {}) {
    this.commandInput.onSubmit = (value) => {
      void this.submit(value);
    };
  }

  async submit(value: string): Promise<WorkbenchCommandResult> {
    const result = await routeWorkbenchCommand(this.state, value, this.options);
    this.state = result.state;
    this.lastResult = result;
    this.shouldExit = result.shouldExit;
    this.commandInput.setValue("");
    this.invalidate();
    this.onAfterSubmit?.(result);
    return result;
  }

  invalidate(): void {
    this.commandInput.invalidate();
  }

  render(width: number): string[] {
    const safeWidth = Math.max(48, width);
    const lines: string[] = [];
    lines.push(fit(`Helmsman Workbench | ${this.state.runId} | stage ${this.state.board.activeStage} | board r${this.state.board.revision}`, safeWidth));
    lines.push(fit(`Core owns Manifest/Board. TUI renders state and submits commands only. View: ${this.state.view}`, safeWidth));
    lines.push(rule(safeWidth));
    lines.push(...this.renderStatus(safeWidth));
    lines.push(rule(safeWidth));
    lines.push(...this.renderActiveSurface(safeWidth));
    lines.push(rule(safeWidth));
    lines.push(fit("Commands: /chat <text> /charting /board /manifest /questions /memory /research /lock /amend /autopilot /verify /closeout /qa-product /operations /evidence /roles /providers /diagnostics /doctor /replay /help /quit", safeWidth));
    lines.push(...this.renderPrompt(safeWidth));
    return lines.map((line) => fit(line, safeWidth));
  }

  private renderStatus(width: number): string[] {
    const board = this.state.board;
    return [
      fit(`Status: ${this.state.diagnostics.statusLine}`, width),
      fit(`Next legal action: ${board.nextLegalAction.kind} -> ${board.nextLegalAction.reason}`, width),
      fit(`Route lock: ${board.routeLock.status}; open questions: ${board.openQuestions.length}; blockers: ${board.blockers.length}`, width),
    ];
  }

  private renderActiveSurface(width: number): string[] {
    if (width >= 112 && (this.state.view === "conversation" || this.state.view === "board" || this.state.view === "manifest")) {
      return columns(
        renderPanel("Board", this.boardLines(), Math.floor((width - 3) / 2), 16),
        renderPanel("Manifest / Route", this.manifestLines(), width - Math.floor((width - 3) / 2) - 3, 16),
        width,
      );
    }

    const panel = (() => {
      switch (this.state.view) {
        case "conversation":
          return ["Conversation", this.conversationLines()] as const;
        case "board":
          return ["Board", this.boardLines()] as const;
        case "manifest":
          return ["Manifest / Route", this.manifestLines()] as const;
        case "questions":
          return ["Question Surface", this.questionLines()] as const;
        case "memory":
          return ["Memory Scan", this.memoryLines()] as const;
        case "research":
          return ["Research Lanes", this.researchLines()] as const;
        case "route_lock":
          return ["Route Lock / Amendments", this.routeLockLines()] as const;
        case "autopilot":
          return ["Autopilot", this.autopilotLines()] as const;
        case "verification":
          return ["Verification Matrix", this.verificationLines()] as const;
        case "closeout":
          return ["Closeout", this.closeoutLines()] as const;
        case "product_audit":
          return ["Product Audit", this.productAuditLines()] as const;
        case "operations":
          return ["Operation Monitor", this.operationLines()] as const;
        case "evidence":
          return ["Artifact / Evidence Inspector", this.evidenceLines()] as const;
        case "roles":
          return ["Role Controls", this.roleLines()] as const;
        case "providers":
          return ["Provider / Model Controls", this.providerLines()] as const;
        case "diagnostics":
          return ["Diagnostics / Run Review", this.diagnosticLines()] as const;
        case "help":
          return ["Help", this.helpLines()] as const;
      }
    })();
    return renderPanel(panel[0], panel[1], width, 20);
  }

  private renderPrompt(width: number): string[] {
    const prompt = "> ";
    const inputWidth = Math.max(8, width - visibleWidth(prompt));
    const rendered = this.commandInput.render(inputWidth);
    const box = new Box(0, 0);
    box.addChild(new Text(`${prompt}${rendered[0] ?? ""}`));
    return box.render(width).slice(0, 1);
  }

  private conversationLines(): string[] {
    const chatEvidence = Object.values(this.state.manifest.evidence.records)
      .filter((record) => record.kind.startsWith("chat."))
      .slice(-8);
    return [
      "Normal chat is legal in the chat stage and does not force Charting.",
      "Use /charting only when the user explicitly enters route compilation.",
      "",
      ...(chatEvidence.length === 0 ? ["No chat evidence recorded yet."] : chatEvidence.map((record) => `${record.kind}: ${record.summary}`)),
    ];
  }

  private boardLines(): string[] {
    const board = this.state.board;
    return [
      `Revision: ${board.revision}`,
      `Stage: ${board.activeStage}`,
      `Next: ${board.nextLegalAction.kind}`,
      `Requires user input: ${board.nextLegalAction.requiresUserInput ? "yes" : "no"}`,
      "",
      "Blockers",
      ...(board.blockers.length === 0 ? ["- none"] : board.blockers.slice(0, 8).map((blocker) => `- ${blocker.blockerId}: ${blocker.reason}`)),
      "",
      "Forbidden",
      ...(board.forbiddenActions.length === 0 ? ["- none"] : board.forbiddenActions.slice(0, 5).map((action) => `- ${action.action}: ${action.reason}`)),
    ];
  }

  private manifestLines(): string[] {
    const manifest = this.state.manifest;
    return [
      `Title: ${manifest.run.title}`,
      `Goal: ${manifest.route.goal}`,
      `Workspace: ${manifest.run.workspace}`,
      "",
      "Scope",
      ...(manifest.route.scope.length === 0 ? ["- pending"] : manifest.route.scope.slice(0, 5).map((item) => `- ${item.text}`)),
      "",
      "Success Criteria",
      ...(manifest.route.successCriteria.length === 0 ? ["- pending"] : manifest.route.successCriteria.slice(0, 5).map((item) => `- ${item.text}`)),
      "",
      "Stop Conditions",
      ...(manifest.route.stopConditions.length === 0 ? ["- pending"] : manifest.route.stopConditions.slice(0, 5).map((item) => `- ${item.text}`)),
    ];
  }

  private questionLines(): string[] {
    const questions = this.state.manifest.questions;
    return [
      "Core-authored question bundles render here. Answers must go through /answer and Core validation.",
      "",
      `Bundles: ${Object.keys(questions.bundles).length}`,
      `Open question ids: ${questions.openQuestionIds.length === 0 ? "none" : questions.openQuestionIds.join(", ")}`,
      "",
      ...questionBundleLines(this.state.manifest),
    ];
  }

  private operationLines(): string[] {
    const operations = Object.values(this.state.manifest.operations.records);
    const byStatus = this.state.board.operations["byStatus"] as Record<string, unknown> | undefined;
    return [
      `Manifest operations: ${operations.length}`,
      `Board operation statuses: ${JSON.stringify(byStatus ?? {})}`,
      `Adapter operation-state file: ${this.state.operationState ? "present" : "absent"}`,
      "",
      ...operations.slice(-8).map((operation) => `${operation.operationId}: ${operation.status} (${operation.runtime}/${operation.roleId})`),
      ...(operations.length === 0 ? ["No Core operation records yet."] : []),
    ];
  }

  private memoryLines(): string[] {
    const scans = Object.values(this.state.manifest.memory.scans);
    const candidates = Object.values(this.state.manifest.memory.candidates);
    const classificationCounts = this.state.board.memory["classificationCounts"] as Record<string, unknown> | undefined;
    return [
      "Memory scan is Aperture-scoped. It cannot start from broad initial chat.",
      "",
      `Scans: ${scans.length}`,
      `Candidates: ${candidates.length}`,
      `Classification counts: ${JSON.stringify(classificationCounts ?? {})}`,
      "",
      ...(scans.length === 0 ? ["No scoped memory scan recorded. Use helmsman memory-research scan with explicit --source."] : scans.slice(-3).map((scan) => `${scan.scanId}: ${scan.artifactPath}`)),
      "",
      ...(candidates.length === 0 ? ["No candidate judgments recorded."] : candidates.slice(-8).map((candidate) => `${candidate.candidateId}: ${candidate.classification} ${candidate.createsResearchLaneId ?? ""}`)),
    ];
  }

  private researchLines(): string[] {
    const lanes = Object.values(this.state.manifest.research.lanes);
    const research = this.state.board.research;
    return [
      `Lanes: ${lanes.length}`,
      `Packets: ${Object.keys(this.state.manifest.research.packets).length}`,
      `Launch posture: ${String(research["launchPosture"] ?? "blocked")}`,
      `Max active cap: ${String(research["maxActiveLaneCap"] ?? 6)}`,
      `Accepted artifacts: ${this.state.manifest.research.acceptedArtifactIds.length}`,
      `Syntheses: ${Object.keys(this.state.manifest.research.syntheses).length}`,
      "",
      ...(lanes.length === 0
        ? ["No research lanes declared. Use helmsman memory-research lanes after a scoped memory scan."]
        : lanes.slice(-8).map((lane) => `${lane.laneId}: ${lane.status} ${lane.expectedArtifactPath} packet=${lane.workerPacketId ?? "none"}`)),
      "",
      "TUI is projection only; lane completion requires Core artifact validation and synthesis events.",
    ];
  }

  private routeLockLines(): string[] {
    const routeLock = this.state.manifest.run.routeLock;
    const pending = Object.entries(this.state.manifest.amendments.pending);
    return [
      `Status: ${routeLock.status}`,
      `Proposal: ${routeLock.proposalId ?? "none"}`,
      `Snapshot hash: ${routeLock.snapshotHash ?? "none"}`,
      `Snapshot path: ${routeLock.snapshotPath ?? "none"}`,
      `Confirmation evidence: ${routeLock.confirmedSurfaceEvidenceId ?? "none"}`,
      `Invalidation: ${routeLock.invalidation?.reason ?? "none"}`,
      "",
      "Readiness",
      `Status: ${routeLock.readiness?.status ?? "not evaluated"}`,
      `Hard blockers: ${routeLock.readiness?.hardBlockers.length ?? "unknown"}`,
      ...(routeLock.readiness?.hardBlockers.slice(0, 6).map((blocker) => `- ${blocker.code}: ${blocker.reason}`) ?? []),
      "",
      "Pending Amendments",
      ...(pending.length === 0 ? ["- none"] : pending.slice(0, 6).map(([amendmentId, record]) => `- ${amendmentId}: ${record.amendment.kind} user=${record.amendment.requiresUserConfirmation ? "yes" : "no"}`)),
      "",
      "Commands: /lock propose, /lock confirm <hash>, /lock unlock <reason>, /amend apply <id>, /amend reject <id> <reason>",
    ];
  }

  private autopilotLines(): string[] {
    const autopilot = this.state.manifest.autopilot;
    const loops = Object.values(autopilot.loops);
    const latest = loops.at(-1);
    const boardAutopilot = this.state.board.autopilot;
    return [
      `Route Lock: ${this.state.manifest.run.routeLock.status}`,
      `Snapshot hash: ${this.state.manifest.run.routeLock.snapshotHash ?? "none"}`,
      `Board revision: ${this.state.board.revision}`,
      `Next legal action: ${this.state.board.nextLegalAction.kind}`,
      "",
      `Loops: ${loops.length}`,
      `Packets: ${Object.keys(autopilot.packets).length}`,
      `Latest loop: ${latest?.loopId ?? "none"} ${latest?.status ?? ""}`,
      `Latest route adherence: ${latest?.routeAdherence?.status ?? "not evaluated"}`,
      `Board autopilot: ${JSON.stringify(boardAutopilot)}`,
      "",
      "Drift",
      ...(Object.values(autopilot.driftRecords).length === 0 ? ["- none"] : Object.values(autopilot.driftRecords).slice(-6).map((drift) => `- ${drift.driftId}: ${drift.class} ${drift.requiredResponse} - ${drift.reason}`)),
      "",
      "Commands: /autopilot start, /autopilot finish <loop> <status> <adherence> <response> <reason>, /autopilot recover",
    ];
  }

  private verificationLines(): string[] {
    const verification = this.state.manifest.verification;
    const scenarios = this.state.manifest.route.verificationScenarios;
    return [
      `Declared scenarios: ${scenarios.length}`,
      `Verification runs: ${Object.keys(verification.runs).length}`,
      `Active run: ${verification.activeRunId ?? "none"}`,
      `Board matrix: ${JSON.stringify(this.state.board.verification)}`,
      "",
      ...(scenarios.length === 0
        ? ["No locked route scenarios declared."]
        : scenarios.map((scenario) => {
            const verdict = verification.latestVerdictByScenario[scenario.scenarioId];
            return `${scenario.scenarioId}: ${verdict?.status ?? "unverified"} attempt=${verdict?.attempt ?? 0} artifact=${verdict?.artifactPath ?? "none"}`;
          })),
      "",
      "Commands: /verify start, /verify pass|fail|blocked|parked <run> <scenario> <observation>, /verify finish <run>",
    ];
  }

  private closeoutLines(): string[] {
    const closeout = this.state.manifest.closeout;
    const latest = closeout.latestCloseoutId ? closeout.records[closeout.latestCloseoutId] : undefined;
    return [
      `Closeout records: ${Object.keys(closeout.records).length}`,
      `Latest: ${latest?.closeoutId ?? "none"} ${latest?.status ?? ""}`,
      `Board closeout: ${JSON.stringify(this.state.board.closeout)}`,
      `Memory promotion candidates: ${Object.keys(closeout.memoryPromotionCandidates).length}`,
      "",
      ...(latest
        ? [
            `Artifact: ${latest.closeoutArtifactPath}`,
            `Evidence index: ${latest.evidenceIndexPath}`,
            `Passed: ${latest.verificationSummary.passed.join(", ") || "none"}`,
            `Failed: ${latest.verificationSummary.failed.join(", ") || "none"}`,
            `Blocked: ${latest.verificationSummary.blocked.join(", ") || "none"}`,
            `Parked: ${latest.verificationSummary.parked.join(", ") || "none"}`,
          ]
        : ["No closeout event recorded."]),
      "",
      "Commands: /closeout record [completed|parked|blocked|failed]",
    ];
  }

  private evidenceLines(): string[] {
    const evidence = Object.values(this.state.manifest.evidence.records);
    const artifacts = Object.values(this.state.manifest.artifacts.records);
    return [
      `Evidence records: ${evidence.length}`,
      `Artifacts: ${artifacts.length}`,
      "",
      "Evidence",
      ...(evidence.length === 0 ? ["- none"] : evidence.slice(-6).map((record) => `- ${record.evidenceId}: ${record.kind} - ${record.summary}`)),
      "",
      "Artifacts",
      ...(artifacts.length === 0 ? ["- none"] : artifacts.slice(-6).map((artifact) => `- ${artifact.artifactId}: ${artifact.status} ${artifact.path ?? ""}`)),
    ];
  }

  private roleLines(): string[] {
    const roleRuns = Object.entries(this.state.manifest.roles.roleRuns);
    return [
      `Role bindings: ${Object.keys(this.state.manifest.roles.bindings).length}`,
      `Role runs: ${roleRuns.length}`,
      "",
      ...(roleRuns.length === 0
        ? ["No RoleRuntime runs recorded yet. Use helmsman role-runtime for bounded Pi AgentSession execution."]
        : roleRuns.slice(-6).map(([roleRunId, record]) => `${roleRunId}: ${String(record.status ?? "unknown")}`)),
      "",
      "RoleRuntime transcripts and final messages are evidence only; Core events still own artifacts, route movement, verification, and closeout.",
    ];
  }

  private providerLines(): string[] {
    const readiness = this.state.providerReadiness;
    return [
      "Provider readiness is read-only here; model binding mutation belongs to RoleRuntime.",
      "",
      ...(readiness ? objectPreview(readiness, 8) : ["Run /providers or /doctor to load provider readiness."]),
    ];
  }

  private productAuditLines(): string[] {
    const audit = this.state.productAudit;
    if (!audit) return ["Run /qa-product to create an installed-state product audit."];
    const artifacts = audit.artifacts as Record<string, string> | undefined;
    const summary = audit.requirementSummary as Record<string, number> | undefined;
    return [
      `Audit: ${String(audit.auditId ?? "unknown")}`,
      `Release ready: ${audit.releaseReady === true ? "yes" : "no"}`,
      `Requirements proved: ${audit.requirementsProved === true ? "yes" : "no"}`,
      `Root: ${String(audit.auditRoot ?? "unknown")}`,
      summary ? `Summary: proved ${summary.proved ?? 0}, incomplete ${summary.incomplete ?? 0}, contradicted ${summary.contradicted ?? 0}` : "Summary: not loaded",
      "",
      ...(artifacts ? Object.entries(artifacts).map(([name, path]) => `${name}: ${path}`) : ["No artifact index loaded."]),
    ];
  }

  private diagnosticLines(): string[] {
    return [
      `Loaded: ${this.state.diagnostics.loadedAt}`,
      `Last command: ${this.state.diagnostics.lastCommand ?? "none"}`,
      `Replay status: ${this.state.diagnostics.replayStatus ?? "not run"}`,
      `Manifest: ${this.state.paths.manifestPath}`,
      `Board: ${this.state.paths.boardPath}`,
      `Rendered manifest: ${this.state.paths.renderedManifestPath}`,
      `Rendered board: ${this.state.paths.renderedBoardPath}`,
      `Projection hash: ${this.state.board.projectionHash}`,
      `Recovery can replay: ${this.state.board.recovery.canReplay ? "yes" : "no"}`,
    ];
  }

  private helpLines(): string[] {
    return [
      "/chat <text>     record normal chat through Core; does not force Charting",
      "/charting        enter Charting through Core; Question UI remains Gate 4",
      "/board           show Board projection Autopilot will later read",
      "/manifest        show Manifest/Route source-of-truth projection",
      "/questions       inspect question state without fabricating form authority",
      "/memory          inspect Aperture-scoped memory scan status",
      "/research        inspect research lanes, packets, artifacts, and synthesis",
      "/lock            inspect/propose/confirm/unlock Route Lock through Core",
      "/amend           inspect/apply/reject typed route amendments",
      "/autopilot       inspect/start/finish/recover Board-governed Autopilot loops",
      "/verify          inspect/start/record/finish scenario-backed verification",
      "/closeout        inspect/record Core closeout after scenario verdicts",
      "/qa-product      write installed-state product audit evidence",
      "/operations      inspect operation monitor state",
      "/evidence        inspect artifacts and evidence",
      "/roles           inspect role bindings/runs; execution uses helmsman role-runtime",
      "/providers       inspect Pi provider/model readiness read-only",
      "/doctor          load read-only doctor report",
      "/replay          run Core replay/repair through authority layer",
    ];
  }
}

export function renderWorkbenchHeadless(state: WorkbenchState, width: number): string[] {
  return new WorkbenchRoot(state, { renderer: "headless_cli", width }).render(width);
}

function questionBundleLines(manifest: WorkbenchState["manifest"]): string[] {
  const open = new Set(manifest.questions.openQuestionIds);
  const bundle = Object.values(manifest.questions.bundles).find((candidate) => candidate.questions.some((question) => open.has(question.questionId)));
  if (!bundle) return ["No open question bundle. Use /charting or /questions ask."];
  const lines: string[] = [`Bundle: ${bundle.bundleId}`, `Route question: ${bundle.routeQuestion}`, ""];
  bundle.questions.forEach((question, questionIndex) => {
    lines.push(`q${questionIndex + 1}: ${question.prompt}`);
    lines.push(`id: ${question.questionId}`);
    lines.push(`why: ${question.whyItMatters}`);
    question.options.forEach((option, optionIndex) => {
      const alias = String.fromCharCode("a".charCodeAt(0) + optionIndex);
      const recommended = option.optionId === question.recommendedOptionId ? " recommended" : "";
      lines.push(`  ${alias}. ${option.label}${recommended} [${option.optionId}]`);
      lines.push(`     ${option.description}`);
      if (option.optionId === question.recommendedOptionId && question.recommendationReason) {
        lines.push(`     reason: ${question.recommendationReason}`);
      }
    });
    if (question.allowFreeForm) lines.push("  free-form override allowed");
    lines.push("");
  });
  lines.push('Answer example: /answer {"q1":["a"],"q2":["a"],"q3":["a","b"],"q4":["a"]}');
  return lines;
}

function renderPanel(title: string, content: string[], width: number, maxBodyLines: number): string[] {
  const header = fit(`== ${title} ${"=".repeat(Math.max(0, width - visibleWidth(title) - 4))}`, width);
  const text = new Text(content.join("\n"));
  const rendered = text.render(width).slice(0, maxBodyLines).map((line) => fit(line, width));
  return [header, ...rendered, ...Array.from({ length: Math.max(0, maxBodyLines - rendered.length) }, () => "")];
}

function columns(left: string[], right: string[], width: number): string[] {
  const leftWidth = Math.floor((width - 3) / 2);
  const rightWidth = width - leftWidth - 3;
  const rows = Math.max(left.length, right.length);
  const output: string[] = [];
  for (let index = 0; index < rows; index++) {
    output.push(fit(`${pad(left[index] ?? "", leftWidth)} | ${fit(right[index] ?? "", rightWidth)}`, width));
  }
  return output;
}

function objectPreview(value: Record<string, unknown>, maxLines: number): string[] {
  return JSON.stringify(value, null, 2).split("\n").slice(0, maxLines);
}

function rule(width: number): string {
  return "-".repeat(Math.max(1, width));
}

function pad(value: string, width: number): string {
  const clipped = fit(value, width);
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function fit(value: string, width: number): string {
  return visibleWidth(value) <= width ? value : truncateToWidth(value, Math.max(1, width));
}
