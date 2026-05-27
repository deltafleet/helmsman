import { randomUUID } from "node:crypto";
import { buildDoctorReport } from "../cli/commands/doctor.ts";
import { runProductAudit } from "../install-doctor/service.ts";
import { executeCoreCommand, serializeCoreError } from "../core/authority/core-store.ts";
import { CoreError } from "../core/authority/types.ts";
import { inspectProviderReadiness } from "../runtime/pi/provider-readiness.ts";
import { answerCoreQuestions, askCoreQuestionBundle } from "../question-ui/charting-service.ts";
import { evaluateAutopilotPreconditions, finishAutopilotLoop, recoverAutopilotLoops, startAutopilotLoop } from "../autopilot/index.ts";
import { evaluateVerificationPreconditions, finishVerificationRun, recordCloseout, recordVerificationResult, startVerificationRun } from "../verification-closeout/index.ts";
import { applyRouteAmendment, cancelRouteLock, confirmRouteLock, evaluateRouteLockReadiness, proposeRouteLock, rejectRouteAmendment, unlockRouteLock } from "../route-lock/index.ts";
import { loadWorkbenchState, replayWorkbenchState, type WorkbenchState, type WorkbenchView } from "./workbench-state.ts";

export interface WorkbenchCommandResult {
  ok: boolean;
  mutatedAuthority: boolean;
  shouldExit: boolean;
  message: string;
  state: WorkbenchState;
  error?: Record<string, unknown>;
}

export interface WorkbenchCommandOptions {
  renderer?: "pi_tui" | "headless_cli";
  width?: number;
}

const VIEW_COMMANDS: Record<string, WorkbenchView> = {
  "/chat": "conversation",
  "/board": "board",
  "/manifest": "manifest",
  "/route": "manifest",
  "/questions": "questions",
  "/memory": "memory",
  "/research": "research",
  "/lock": "route_lock",
  "/amend": "route_lock",
  "/autopilot": "autopilot",
  "/verify": "verification",
  "/verification": "verification",
  "/closeout": "closeout",
  "/qa-product": "product_audit",
  "/product-audit": "product_audit",
  "/operations": "operations",
  "/evidence": "evidence",
  "/artifacts": "evidence",
  "/roles": "roles",
  "/providers": "providers",
  "/models": "providers",
  "/diagnostics": "diagnostics",
  "/runs": "diagnostics",
  "/help": "help",
};

const PENDING_GATE_COMMANDS: Record<string, string> = {};

export async function routeWorkbenchCommand(state: WorkbenchState, rawCommand: string, options: WorkbenchCommandOptions = {}): Promise<WorkbenchCommandResult> {
  const input = rawCommand.trim();
  if (!input) return unchanged(state, false, "No command submitted.");

  const commandToken = input.startsWith("/") ? (input.split(/\s+/)[0] ?? "") : "/chat";
  const command = commandToken.toLowerCase();
  const argument = input.startsWith("/") ? input.slice(commandToken.length).trim() : input;

  try {
    if (command === "/quit" || command === "/exit") {
      return { ok: true, mutatedAuthority: false, shouldExit: true, message: "Leaving the Workbench. Core state is unchanged.", state };
    }

    if (command === "/charting") {
      let result = state.manifest.run.activeStage === "charting"
        ? undefined
        : await executeCoreCommand(state.paths, {
            commandType: "charting.enter",
            cwd: state.cwd,
            runId: state.runId,
            actor: { kind: "user", id: "tui" },
            boardRevisionRead: state.board.revision,
            payload: { reason: argument || "user entered Charting from the Pi TUI Workbench" },
          });
      let manifest = result?.manifest ?? state.manifest;
      let board = result?.board ?? state.board;
      if (manifest.questions.openQuestionIds.length === 0) {
        result = await askCoreQuestionBundle({
          paths: state.paths,
          manifest,
          board,
          renderer: options.renderer ?? "pi_tui",
          width: options.width,
        });
        manifest = result.manifest;
        board = result.board;
      }
      const nextState = await loadWorkbenchState({
        paths: state.paths,
        view: "questions",
        statusLine: `Charting is active with ${manifest.questions.openQuestionIds.length} open Core-authored questions at Board revision ${board.revision}.`,
        lastCommand: input,
      });
      return success(nextState, true, "Charting entered through Core and rendered a Core-authored question bundle.");
    }

    if (command === "/chat") {
      if (!argument) {
        const nextState = await switchView(state, "conversation", input, "Conversation view selected. Submit text or /chat <message> to record chat evidence.");
        return success(nextState, false, "Conversation view selected.");
      }
      const result = await executeCoreCommand(state.paths, {
        commandType: "chat.message_record",
        cwd: state.cwd,
        runId: state.runId,
        actor: { kind: "user", id: "tui" },
        boardRevisionRead: state.board.revision,
        payload: {
          messageId: `chat:user:${randomUUID()}`,
          role: "user",
          text: argument,
          evidenceIds: [],
        },
      });
      const nextState = await loadWorkbenchState({
        paths: state.paths,
        view: "conversation",
        statusLine: `Recorded chat through Core at Board revision ${result.board.revision}; active stage is ${result.manifest.run.activeStage}.`,
        lastCommand: input,
      });
      return success(nextState, true, "Chat message recorded without entering Charting.");
    }

    if (command === "/questions") {
      if (argument.toLowerCase() !== "ask") {
        const nextState = await switchView(state, "questions", input, "Question surface selected. Use /questions ask to render the next Core-authored bundle.");
        return success(nextState, false, "Question surface selected.");
      }
      if (state.manifest.run.activeStage !== "charting") {
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "questions",
          statusLine: "Question bundles require Charting. Use /charting first.",
          lastCommand: input,
        });
        return { ok: false, mutatedAuthority: false, shouldExit: false, message: "Question bundles require Charting. Use /charting first.", state: nextState };
      }
      if (state.manifest.questions.openQuestionIds.length > 0) {
        const nextState = await switchView(state, "questions", input, "A Core-authored bundle is already open; answer it before asking another.");
        return success(nextState, false, "A Core-authored bundle is already open.");
      }
      const result = await askCoreQuestionBundle({
        paths: state.paths,
        manifest: state.manifest,
        board: state.board,
        renderer: options.renderer ?? "pi_tui",
        width: options.width,
      });
      const nextState = await loadWorkbenchState({
        paths: state.paths,
        view: "questions",
        statusLine: `Rendered question bundle through Core at Board revision ${result.board.revision}.`,
        lastCommand: input,
      });
      return success(nextState, true, "Rendered Core-authored question bundle.");
    }

    if (command === "/answer") {
      const result = await answerCoreQuestions({
        paths: state.paths,
        manifest: state.manifest,
        board: state.board,
        rawAnswer: argument,
      });
      const nextState = await loadWorkbenchState({
        paths: state.paths,
        view: "questions",
        statusLine: `Recorded ${Object.keys(result.manifest.questions.answers).length} question answers through Core; open questions: ${result.manifest.questions.openQuestionIds.length}.`,
        lastCommand: input,
      });
      return success(nextState, true, "Question answer recorded through Core.");
    }

    if (command === "/lock") {
      if (!argument) {
        const readiness = evaluateRouteLockReadiness({ paths: state.paths, manifest: state.manifest, board: state.board });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "route_lock",
          statusLine: `Route Lock view selected; readiness is ${readiness.status} with ${readiness.hardBlockers.length} hard blockers.`,
          lastCommand: input,
        });
        return success(nextState, false, "Route Lock view selected.");
      }
      const [action, ...rest] = argument.split(/\s+/);
      if (action === "propose") {
        const result = await proposeRouteLock({ paths: state.paths, manifest: state.manifest, board: state.board });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "route_lock",
          statusLine: `Route Lock proposal ${result.proposal.proposalId} rendered with hash ${result.proposal.snapshotHash}. Confirm with /lock confirm ${result.proposal.snapshotHash}.`,
          lastCommand: input,
        });
        return success(nextState, true, "Route Lock proposal rendered through Core.");
      }
      if (action === "confirm") {
        const snapshotHash = rest[0];
        if (!snapshotHash) throw new CoreError({ code: "COMMAND_PRECONDITION_FAILED", message: "/lock confirm requires the visible snapshot hash." });
        const result = await confirmRouteLock({ paths: state.paths, manifest: state.manifest, board: state.board, snapshotHash, surface: "tui", userId: "tui" });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "route_lock",
          statusLine: `Route Lock confirmed by user evidence ${result.evidence.evidenceId} at Board revision ${result.core.board.revision}.`,
          lastCommand: input,
        });
        return success(nextState, true, "Route Lock confirmed through Core.");
      }
      if (action === "cancel") {
        const result = await cancelRouteLock({ paths: state.paths, manifest: state.manifest, board: state.board, reason: rest.join(" ") || "user cancelled Route Lock proposal from TUI" });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "route_lock",
          statusLine: `Route Lock proposal cancelled; active stage is ${result.manifest.run.activeStage}.`,
          lastCommand: input,
        });
        return success(nextState, true, "Route Lock proposal cancelled through Core.");
      }
      if (action === "unlock") {
        const result = await unlockRouteLock({ paths: state.paths, manifest: state.manifest, board: state.board, reason: rest.join(" ") || "user unlocked route from TUI" });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "route_lock",
          statusLine: `Route unlocked; active stage is ${result.manifest.run.activeStage}.`,
          lastCommand: input,
        });
        return success(nextState, true, "Route unlocked through Core.");
      }
      const nextState = await switchView(state, "route_lock", input, "Route Lock commands: /lock, /lock propose, /lock confirm <visible-hash>, /lock cancel <reason>, /lock unlock <reason>.");
      return { ok: false, mutatedAuthority: false, shouldExit: false, message: "Unknown /lock action.", state: nextState };
    }

    if (command === "/amend") {
      if (!argument) {
        const nextState = await switchView(state, "route_lock", input, "Amendment view selected. Use CLI for typed proposals; TUI can apply/reject pending amendment ids.");
        return success(nextState, false, "Amendment view selected.");
      }
      const [action, amendmentId, ...rest] = argument.split(/\s+/);
      if (action === "apply" && amendmentId) {
        const result = await applyRouteAmendment({ paths: state.paths, manifest: state.manifest, board: state.board, amendmentId, actor: "user", confirmationEvidenceId: `tui-amendment-confirmation:${amendmentId}` });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "route_lock",
          statusLine: `Amendment ${amendmentId} applied; new snapshot hash ${result.application.newSnapshotHash}.`,
          lastCommand: input,
        });
        return success(nextState, true, "Route amendment applied through Core.");
      }
      if (action === "reject" && amendmentId) {
        const result = await rejectRouteAmendment({ paths: state.paths, manifest: state.manifest, board: state.board, amendmentId, reason: rest.join(" ") || "user rejected amendment from TUI" });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "route_lock",
          statusLine: `Amendment ${result.rejection.amendmentId} rejected.`,
          lastCommand: input,
        });
        return success(nextState, true, "Route amendment rejected through Core.");
      }
      const nextState = await switchView(state, "route_lock", input, "Amendment commands: /amend, /amend apply <id>, /amend reject <id> <reason>.");
      return { ok: false, mutatedAuthority: false, shouldExit: false, message: "Unknown /amend action.", state: nextState };
    }

    if (command === "/autopilot") {
      if (!argument) {
        const preconditions = evaluateAutopilotPreconditions({ paths: state.paths, manifest: state.manifest, board: state.board, roleId: "autopilot-implementer", requireDispatchReady: true });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "autopilot",
          statusLine: `Autopilot view selected; preconditions ${preconditions.ok ? "ready" : "blocked"} with ${preconditions.blockers.length} blockers.`,
          lastCommand: input,
        });
        return success(nextState, false, "Autopilot view selected.");
      }
      const [action, ...rest] = argument.split(/\s+/);
      if (action === "start") {
        const result = await startAutopilotLoop({ paths: state.paths, manifest: state.manifest, board: state.board, mission: rest.join(" ") || undefined });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "autopilot",
          statusLine: `Autopilot loop ${result.plan.loopId} started from Board revision ${result.plan.boardRevisionRead}.`,
          lastCommand: input,
        });
        return success(nextState, true, "Autopilot loop started through Core.");
      }
      if (action === "finish") {
        const [loopId, status, adherence, response, ...reasonParts] = rest;
        if (!loopId || !status || !adherence || !response) throw new CoreError({ code: "COMMAND_PRECONDITION_FAILED", message: "/autopilot finish requires <loop> <status> <adherence> <response> <reason>." });
        const result = await finishAutopilotLoop({
          paths: state.paths,
          manifest: state.manifest,
          board: state.board,
          loopId,
          status: status as never,
          adherenceStatus: adherence as never,
          requiredResponse: response as never,
          reason: reasonParts.join(" ") || "Autopilot loop finished from TUI.",
          nextStage: status === "completed" && adherence === "adherent" ? "verification" : undefined,
        });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "autopilot",
          statusLine: `Autopilot loop ${loopId} finished as ${result.finish.status}; adherence ${result.routeAdherence.status}.`,
          lastCommand: input,
        });
        return success(nextState, true, "Autopilot loop finished through Core.");
      }
      if (action === "recover") {
        const result = await recoverAutopilotLoops({ paths: state.paths, manifest: state.manifest, board: state.board, reason: rest.join(" ") || undefined });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "autopilot",
          statusLine: `Autopilot recovery recorded for ${result.recovered.length} in-flight loops.`,
          lastCommand: input,
        });
        return success(nextState, result.recovered.length > 0, "Autopilot recovery reconciled through Core.");
      }
      const nextState = await switchView(state, "autopilot", input, "Autopilot commands: /autopilot, /autopilot start, /autopilot finish <loop> <status> <adherence> <response> <reason>, /autopilot recover.");
      return { ok: false, mutatedAuthority: false, shouldExit: false, message: "Unknown /autopilot action.", state: nextState };
    }

    if (command === "/verify" || command === "/verification") {
      if (!argument) {
        const preconditions = evaluateVerificationPreconditions({ paths: state.paths, manifest: state.manifest, board: state.board, verifierRoleId: "verifier" });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "verification",
          statusLine: `Verification view selected; preconditions ${preconditions.ok ? "ready" : "blocked"} with ${preconditions.blockers.length} blockers.`,
          lastCommand: input,
        });
        return success(nextState, false, "Verification view selected.");
      }
      const [action, ...rest] = argument.split(/\s+/);
      if (action === "start") {
        const result = await startVerificationRun({ paths: state.paths, manifest: state.manifest, board: state.board });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "verification",
          statusLine: `Verification run ${result.plan.verificationRunId} started for ${result.plan.scenarioIds.length} scenarios.`,
          lastCommand: input,
        });
        return success(nextState, true, "Verification run started through Core.");
      }
      if (action === "pass" || action === "fail" || action === "blocked" || action === "parked") {
        const [verificationRunId, scenarioId, ...observationParts] = rest;
        if (!verificationRunId || !scenarioId) throw new CoreError({ code: "COMMAND_PRECONDITION_FAILED", message: "/verify <pass|fail|blocked|parked> requires <run> <scenario> <observation>." });
        const result = await recordVerificationResult({
          paths: state.paths,
          manifest: state.manifest,
          board: state.board,
          verificationRunId,
          scenarioId,
          status: action === "pass" ? "passed" : action === "fail" ? "failed" : action,
          evidenceIds: [`tui-verification:${scenarioId}`],
          evidenceKinds: ["command_output", "artifact", "manual_observation"],
          observations: [observationParts.join(" ") || `TUI recorded ${action} verdict for ${scenarioId}.`],
          residualRisk: action === "pass" ? "none" : `${action} scenario requires follow-up before successful closeout.`,
          missingAuthorityOrEnvironment: action === "blocked" ? "TUI verifier marked the required authority or environment missing." : undefined,
        });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "verification",
          statusLine: `Scenario ${scenarioId} recorded as ${result.verdict.status}; artifact ${result.verdict.artifactPath}.`,
          lastCommand: input,
        });
        return success(nextState, true, "Verification scenario verdict recorded through Core.");
      }
      if (action === "finish") {
        const verificationRunId = rest[0];
        if (!verificationRunId) throw new CoreError({ code: "COMMAND_PRECONDITION_FAILED", message: "/verify finish requires <run>." });
        const result = await finishVerificationRun({ paths: state.paths, manifest: state.manifest, board: state.board, verificationRunId });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "verification",
          statusLine: `Verification run ${verificationRunId} finished as ${result.finish.status}.`,
          lastCommand: input,
        });
        return success(nextState, true, "Verification run finished through Core.");
      }
      const nextState = await switchView(state, "verification", input, "Verification commands: /verify, /verify start, /verify pass|fail|blocked|parked <run> <scenario> <observation>, /verify finish <run>.");
      return { ok: false, mutatedAuthority: false, shouldExit: false, message: "Unknown /verify action.", state: nextState };
    }

    if (command === "/closeout") {
      if (!argument) {
        const nextState = await switchView(state, "closeout", input, "Closeout view selected. Use /closeout record after scenario verdicts are finished.");
        return success(nextState, false, "Closeout view selected.");
      }
      const [action, ...rest] = argument.split(/\s+/);
      if (action === "record") {
        const status = rest[0] as never;
        const result = await recordCloseout({ paths: state.paths, manifest: state.manifest, board: state.board, status });
        const nextState = await loadWorkbenchState({
          paths: state.paths,
          view: "closeout",
          statusLine: `Closeout ${result.closeout.closeoutId} recorded as ${result.closeout.status}.`,
          lastCommand: input,
        });
        return success(nextState, true, "Closeout recorded through Core.");
      }
      const nextState = await switchView(state, "closeout", input, "Closeout commands: /closeout, /closeout record [completed|parked|blocked|failed].");
      return { ok: false, mutatedAuthority: false, shouldExit: false, message: "Unknown /closeout action.", state: nextState };
    }

    if (command === "/replay") {
      const nextState = await replayWorkbenchState({ paths: state.paths, view: state.view, repair: true, lastCommand: input });
      return success(nextState, false, "Core replay completed through the authority layer.");
    }

    if (command === "/doctor") {
      const report = await buildDoctorReport({ cwd: state.cwd });
      const nextState = await loadWorkbenchState({
        paths: state.paths,
        view: "diagnostics",
        statusLine: `Doctor ${report.ok ? "ok" : "failed"}; read-only product surface report loaded.`,
        lastCommand: input,
      });
      nextState.providerReadiness = report.providerReadiness as unknown as Record<string, unknown>;
      return success(nextState, false, "Doctor report loaded read-only.");
    }

    if (command === "/qa-product" || command === "/product-audit") {
      const audit = await runProductAudit({ cwd: state.cwd, includeLive: argument === "--live" || argument === "live" });
      const nextState = await loadWorkbenchState({
        paths: state.paths,
        view: "product_audit",
        statusLine: `Product audit ${audit.auditId} wrote ${audit.auditRoot}; release ready: ${audit.releaseReady ? "yes" : "no"}.`,
        lastCommand: input,
        productAudit: audit as unknown as Record<string, unknown>,
      });
      return { ok: audit.releaseReady, mutatedAuthority: false, shouldExit: false, message: audit.releaseReady ? "Product audit passed release gate." : "Product audit wrote evidence and left release readiness blocked.", state: nextState };
    }

    if (command === "/providers" || command === "/models") {
      const providerReadiness = await inspectProviderReadiness(state.cwd);
      const nextState = await loadWorkbenchState({
        paths: state.paths,
        view: "providers",
        statusLine: "Provider/model readiness loaded read-only from Pi runtime settings.",
        lastCommand: input,
        providerReadiness: providerReadiness as unknown as Record<string, unknown>,
      });
      return success(nextState, false, "Provider/model controls selected.");
    }

    const view = VIEW_COMMANDS[command];
    if (view) {
      const nextState = await switchView(state, view, input, `${viewLabel(view)} view selected. Authority files were not mutated.`);
      return success(nextState, false, `${viewLabel(view)} view selected.`);
    }

    const pending = PENDING_GATE_COMMANDS[command];
    if (pending) {
      const nextState = await loadWorkbenchState({
        paths: state.paths,
        view: state.view,
        statusLine: pending,
        lastCommand: input,
      });
      return { ok: false, mutatedAuthority: false, shouldExit: false, message: pending, state: nextState };
    }

    const nextState = await loadWorkbenchState({
      paths: state.paths,
      view: "help",
      statusLine: `Unknown Workbench command: ${command}.`,
      lastCommand: input,
    });
    return { ok: false, mutatedAuthority: false, shouldExit: false, message: `Unknown Workbench command: ${command}.`, state: nextState };
  } catch (error) {
    if (error instanceof CoreError) {
      const nextState = await loadWorkbenchState({
        paths: state.paths,
        view: state.view,
        statusLine: `${error.code}: ${error.message}`,
        lastCommand: input,
      });
      return { ok: false, mutatedAuthority: false, shouldExit: false, message: error.message, error: serializeCoreError(error), state: nextState };
    }
    throw error;
  }
}

function success(state: WorkbenchState, mutatedAuthority: boolean, message: string): WorkbenchCommandResult {
  return { ok: true, mutatedAuthority, shouldExit: false, message, state };
}

function unchanged(state: WorkbenchState, ok: boolean, message: string): WorkbenchCommandResult {
  return { ok, mutatedAuthority: false, shouldExit: false, message, state };
}

async function switchView(state: WorkbenchState, view: WorkbenchView, lastCommand: string, statusLine: string): Promise<WorkbenchState> {
  return await loadWorkbenchState({ paths: state.paths, view, statusLine, lastCommand });
}

function viewLabel(view: WorkbenchView): string {
  return view.replace(/^\w/, (match) => match.toUpperCase());
}
