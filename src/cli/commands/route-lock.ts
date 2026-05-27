import { resolveRunPaths } from "../../core/document-bus/paths.ts";
import { executeCoreCommand } from "../../core/authority/core-store.ts";
import type { RouteEffect, RouteLockInvalidationRecord } from "../../core/authority/types.ts";
import {
  applyRouteAmendment,
  cancelRouteLock,
  confirmRouteLock,
  evaluateRouteLockReadiness,
  invalidateRouteLock,
  proposeRouteAmendment,
  proposeRouteLock,
  rejectRouteAmendment,
  unlockRouteLock,
} from "../../route-lock/index.ts";

export async function runRouteLockCommand(args: string[]): Promise<number> {
  const [subcommand] = args;
  if (subcommand === "evaluate") return await evaluate(args.slice(1));
  if (subcommand === "propose") return await propose(args.slice(1));
  if (subcommand === "confirm") return await confirm(args.slice(1));
  if (subcommand === "cancel") return await cancel(args.slice(1));
  if (subcommand === "unlock") return await unlock(args.slice(1));
  if (subcommand === "invalidate") return await invalidate(args.slice(1));
  if (subcommand === "amendment") return await amendment(args.slice(1));
  console.error("Usage: helmsman route-lock <evaluate|propose|confirm|cancel|unlock|invalidate|amendment>");
  return 2;
}

async function evaluate(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const readiness = evaluateRouteLockReadiness(state);
  output(args, { ok: readiness.status === "lock_ready", readiness });
  return readiness.status === "lock_ready" ? 0 : 1;
}

async function propose(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const result = await proposeRouteLock(state);
  output(args, { ok: true, proposalId: result.proposal.proposalId, snapshotHash: result.proposal.snapshotHash, boardRevision: result.core.board.revision });
  return 0;
}

async function confirm(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const snapshotHash = required(args, "--snapshot-hash");
  const result = await confirmRouteLock({ ...state, proposalId: flagValue(args, "--proposal"), snapshotHash, surface: "cli", userId: flagValue(args, "--user") ?? "route-lock-cli" });
  output(args, { ok: true, evidenceId: result.evidence.evidenceId, snapshotHash, boardRevision: result.core.board.revision });
  return 0;
}

async function cancel(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const core = await cancelRouteLock({ ...state, proposalId: flagValue(args, "--proposal"), reason: required(args, "--reason") });
  output(args, { ok: true, boardRevision: core.board.revision });
  return 0;
}

async function unlock(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const core = await unlockRouteLock({ ...state, reason: required(args, "--reason"), actor: flagValue(args, "--actor") === "core_policy" ? "core_policy" : "user" });
  output(args, { ok: true, boardRevision: core.board.revision, activeStage: core.manifest.run.activeStage });
  return 0;
}

async function invalidate(args: string[]): Promise<number> {
  const state = await resumeState(args);
  const requiredResponse = (flagValue(args, "--response") ?? "park") as RouteLockInvalidationRecord["requiredResponse"];
  const severity = flagValue(args, "--severity") === "warning" ? "warning" : "hard";
  const core = await invalidateRouteLock({ ...state, reason: required(args, "--reason"), severity, requiredResponse });
  output(args, { ok: true, boardRevision: core.board.revision, routeLock: core.manifest.run.routeLock });
  return 0;
}

async function amendment(args: string[]): Promise<number> {
  const [subcommand] = args;
  if (subcommand === "propose") {
    const state = await resumeState(args.slice(1));
    const routeEffects = parseRouteEffects(required(args, "--effect-json"));
    const result = await proposeRouteAmendment({
      ...state,
      kind: (flagValue(args, "--kind") ?? "scope_refinement") as never,
      reason: required(args, "--reason"),
      routeEffects,
      requiresUserConfirmation: args.includes("--requires-user-confirmation") ? true : undefined,
      invalidatesLock: args.includes("--invalidates-lock") ? true : undefined,
      actor: actorFlag(args),
    });
    output(args, { ok: true, amendmentId: result.amendment.amendmentId, renderedPath: result.renderedPath, boardRevision: result.core.board.revision });
    return 0;
  }
  if (subcommand === "apply") {
    const state = await resumeState(args.slice(1));
    const result = await applyRouteAmendment({
      ...state,
      amendmentId: required(args, "--amendment"),
      actor: flagValue(args, "--actor") === "core_policy" ? "core_policy" : "user",
      confirmationEvidenceId: flagValue(args, "--confirmation-evidence"),
    });
    output(args, { ok: true, application: result.application, boardRevision: result.core.board.revision });
    return 0;
  }
  if (subcommand === "reject") {
    const state = await resumeState(args.slice(1));
    const result = await rejectRouteAmendment({
      ...state,
      amendmentId: required(args, "--amendment"),
      reason: required(args, "--reason"),
      actor: flagValue(args, "--actor") === "core_policy" ? "core_policy" : "user",
    });
    output(args, { ok: true, rejection: result.rejection, boardRevision: result.core.board.revision });
    return 0;
  }
  console.error("Usage: helmsman route-lock amendment <propose|apply|reject>");
  return 2;
}

async function resumeState(args: string[]) {
  const cwd = flagValue(args, "--cwd") ?? process.cwd();
  const runId = required(args, "--session");
  const paths = resolveRunPaths({ cwd, runId });
  const resumed = await executeCoreCommand(paths, {
    commandType: "run.resume",
    cwd,
    runId,
    actor: { kind: "user", id: "route-lock-cli" },
    payload: {},
  });
  return { paths, manifest: resumed.manifest, board: resumed.board };
}

function parseRouteEffects(value: string): RouteEffect[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error("--effect-json must be a JSON array of RouteEffect objects.");
  return parsed as RouteEffect[];
}

function actorFlag(args: string[]) {
  const actor = flagValue(args, "--actor");
  if (actor === "core_policy" || actor === "role_runner" || actor === "external_adapter" || actor === "verifier") return actor;
  return "user";
}

function output(args: string[], value: unknown): void {
  if (args.includes("--json")) console.log(JSON.stringify(value, null, 2));
  else if (typeof value === "object" && value && "ok" in value) console.log((value as { ok?: boolean }).ok ? "ok" : "failed");
  else console.log(String(value));
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
