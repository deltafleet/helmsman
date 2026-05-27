import type { AuthoritySource, RunStage } from "./types.ts";

export interface CommandContract {
  commandType: string;
  allowedStages: RunStage[] | ["none"] | ["any"];
  readOnly: boolean;
  requiresBoardRevision: boolean;
  requiredActorKinds: AuthoritySource[];
  eventsProduced: string[];
  projectionsUpdated: string[];
}

export const COMMAND_REGISTRY: Record<string, CommandContract> = {
  "run.create": contract("run.create", ["none"], false, false, ["user", "core_policy"], ["run.created"]),
  "run.resume": contract("run.resume", ["any"], true, false, ["user", "core_policy"], []),
  "run.stage_change": contract("run.stage_change", ["any"], false, true, ["core_policy"], ["run.stage_changed"]),
  "chat.message_record": contract("chat.message_record", ["chat"], false, true, ["user", "role_runner", "core_policy"], ["chat.message_recorded"]),
  "charting.enter": contract("charting.enter", ["chat"], false, true, ["user", "core_policy"], ["run.stage_changed"]),
  "question.bundle_ask": contract("question.bundle_ask", ["charting"], false, true, ["core_policy"], ["question.bundle_asked"]),
  "question.answer_record": contract("question.answer_record", ["charting"], false, true, ["user"], ["question.answered"]),
  "role.binding_set": contract("role.binding_set", ["any"], false, true, ["core_policy"], ["role.binding_set"]),
  "role.run_plan": contract("role.run_plan", ["any"], false, true, ["core_policy"], ["role.run_planned", "operation.started", "artifact.expected"]),
  "role.run_start": contract("role.run_start", ["any"], false, true, ["role_runner", "core_policy"], ["role.run_started"]),
  "role.run_finish": contract("role.run_finish", ["any"], false, true, ["role_runner", "core_policy"], ["role.run_evidence_captured", "artifact.produced", "role.run_finished", "operation.finished"]),
  "memory.scan_record": contract("memory.scan_record", ["memory_scan"], false, true, ["core_policy"], ["memory.scan_created", "memory.candidate_classified"]),
  "research.lane_plan": contract("research.lane_plan", ["research"], false, true, ["core_policy"], ["research.lane_declared"]),
  "research.packet_prepare": contract("research.packet_prepare", ["research"], false, true, ["core_policy"], ["research.worker_packet_created"]),
  "research.artifact_submit": contract("research.artifact_submit", ["research"], false, true, ["role_runner", "external_adapter", "core_policy"], ["research.artifact_submitted"]),
  "research.artifact_accept": contract("research.artifact_accept", ["research", "synthesis"], false, true, ["core_policy", "verifier"], ["research.artifact_accepted"]),
  "research.artifact_reject": contract("research.artifact_reject", ["research"], false, true, ["core_policy", "verifier"], ["research.artifact_rejected"]),
  "research.lane_drop": contract("research.lane_drop", ["research", "synthesis"], false, true, ["user", "core_policy"], ["research.lane_dropped"]),
  "research.synthesis_record": contract("research.synthesis_record", ["synthesis"], false, true, ["core_policy"], ["research.synthesis_recorded"]),
  "artifact.accept": contract("artifact.accept", ["research", "synthesis", "verification", "closeout"], false, true, ["user", "core_policy", "verifier"], ["artifact.accepted"]),
  "route.lock_propose": contract("route.lock_propose", ["lock_ready"], false, true, ["core_policy"], ["route_lock.proposed"]),
  "route.lock_confirm": contract("route.lock_confirm", ["lock_ready"], false, true, ["user"], ["route_lock.locked"]),
  "route.lock_cancel": contract("route.lock_cancel", ["lock_ready"], false, true, ["user", "core_policy"], ["route_lock.cancelled"]),
  "route.unlock": contract("route.unlock", ["locked", "autopilot"], false, true, ["user", "core_policy"], ["route_lock.unlocked"]),
  "route.invalidate": contract("route.invalidate", ["locked", "autopilot"], false, true, ["core_policy"], ["route_lock.invalidated"]),
  "route.amend_propose": contract("route.amend_propose", ["locked", "autopilot"], false, true, ["user", "core_policy", "role_runner", "external_adapter", "verifier"], ["amendment.proposed"]),
  "route.amend_apply": contract("route.amend_apply", ["locked", "autopilot"], false, true, ["user", "core_policy"], ["amendment.applied"]),
  "route.amend_reject": contract("route.amend_reject", ["locked", "autopilot"], false, true, ["user", "core_policy"], ["amendment.rejected"]),
  "autopilot.loop_start": contract("autopilot.loop_start", ["locked", "autopilot"], false, true, ["core_policy"], ["autopilot.action_selected", "autopilot.packet_prepared", "autopilot.loop_started"]),
  "autopilot.loop_finish": contract("autopilot.loop_finish", ["autopilot"], false, true, ["core_policy"], ["autopilot.route_adherence_evaluated", "autopilot.drift_recorded", "autopilot.loop_finished"]),
  "autopilot.recover": contract("autopilot.recover", ["locked", "autopilot"], false, true, ["core_policy"], ["autopilot.loop_recovered"]),
  "verification.run_start": contract("verification.run_start", ["verification"], false, true, ["core_policy"], ["verification.run_started", "artifact.expected"]),
  "verification.result_record": contract("verification.result_record", ["verification"], false, true, ["verifier", "core_policy"], ["verification.result_recorded"]),
  "verification.run_finish": contract("verification.run_finish", ["verification"], false, true, ["core_policy"], ["verification.run_finished"]),
  "closeout.record": contract("closeout.record", ["closeout"], false, true, ["user", "core_policy"], ["closeout.recorded"]),
  "doctor.report": contract("doctor.report", ["any"], true, false, ["user", "core_policy"], []),
  "core.replay": contract("core.replay", ["any"], true, false, ["user", "core_policy"], []),
};

function contract(
  commandType: string,
  allowedStages: CommandContract["allowedStages"],
  readOnly: boolean,
  requiresBoardRevision: boolean,
  requiredActorKinds: AuthoritySource[],
  eventsProduced: string[],
): CommandContract {
  return {
    commandType,
    allowedStages,
    readOnly,
    requiresBoardRevision,
    requiredActorKinds,
    eventsProduced,
    projectionsUpdated: readOnly ? [] : ["manifest.json", "board.json", "rendered/*.md", "core/*.json"],
  };
}
