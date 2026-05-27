import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { executeCoreCommand } from "../core/authority/core-store.ts";
import { readManifestEvents } from "../core/authority/event-io.ts";
import { CoreError } from "../core/authority/types.ts";
import { buildLivePiRoleBinding } from "../role-runtime/bindings.ts";
import { runPiRole } from "../role-runtime/pi-role-runtime.ts";
import { openWorkbenchSession } from "../tui/workbench-state.ts";

async function main(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "helmsman-role-runtime-"));
  try {
    const state = await openWorkbenchSession({
      cwd: workspace,
      runId: "gate5-role-runtime",
      title: "Gate 5 RoleRuntime verification",
      initialIntent: "Verify Core-owned RoleRuntime execution without route authority leakage.",
      createIfMissing: true,
    });
    const binding = buildLivePiRoleBinding({
      cwd: workspace,
      roleId: "lead",
      purpose: "chat",
      timeoutMs: 120000,
    });
    const roleRun = await runPiRole({
      paths: state.paths,
      manifest: state.manifest,
      board: state.board,
      binding,
      roleId: "lead",
      purpose: "chat",
      inputKind: "chat",
      inputRef: "role-runtime-verifier",
      mission: "Reply in one concise sentence with the exact phrase HELMSMAN_ROLE_RUNTIME_OK and do not claim completion.",
      timeoutMs: 120000,
    });

    assert.equal(roleRun.result.status, "completed");
    assert.equal(roleRun.result.routeAuthority, "unchanged");
    assert.equal(roleRun.result.finalMessageIsCompletion, false);
    assert.equal(roleRun.core.manifest.run.activeStage, "chat");
    assert.equal(roleRun.core.board.nextLegalAction.kind, "continue_chat");
    assert(roleRun.core.manifest.roles.bindings.lead);
    assert.equal(roleRun.core.manifest.roles.roleRuns[roleRun.result.roleRunId]?.status, "completed");
    assert.equal(roleRun.core.manifest.operations.records[roleRun.result.operationId]?.status, "completed");
    assert.equal(Object.values(roleRun.core.manifest.artifacts.records).filter((artifact) => artifact.status === "accepted").length, 0);
    for (const evidenceId of roleRun.result.evidenceIds) {
      assert(roleRun.core.manifest.evidence.records[evidenceId], `missing evidence ${evidenceId}`);
    }

    const plan = JSON.parse(await readFile(roleRun.plan.promptPath.replace(/prompt\.md$/, "plan.json"), "utf8")) as { schemaVersion: string };
    assert.equal(plan.schemaVersion, "helmsman.role-run-plan.v1");
    const piEvents = await readFile(roleRun.result.eventLogPath, "utf8");
    assert(piEvents.includes("message_") || piEvents.includes("turn_"), "role run must capture Pi message or turn events");
    const transcript = await readFile(roleRun.result.transcriptPath, "utf8");
    assert(transcript.includes("message_") || transcript.includes("turn_"), "role run must capture transcript evidence");
    const diagnostics = JSON.parse(await readFile(roleRun.result.diagnosticsPath, "utf8")) as { redactionFindings: unknown[]; routeAuthority: string };
    assert.equal(diagnostics.routeAuthority, "unchanged");
    assert.equal(diagnostics.redactionFindings.length, 0);
    const sealed = JSON.parse(await readFile(roleRun.result.resultPath, "utf8")) as { finalMessageIsCompletion: boolean; status: string };
    assert.equal(sealed.status, "completed");
    assert.equal(sealed.finalMessageIsCompletion, false);

    const beforeBadPlan = (await readManifestEvents(state.paths.manifestEventsPath)).length;
    await expectCoreError(
      "unknown role plan rejection",
      () =>
        executeCoreCommand(state.paths, {
          commandType: "role.run_plan",
          cwd: state.cwd,
          runId: state.runId,
          actor: { kind: "core_policy", id: "test" },
          boardRevisionRead: roleRun.core.board.revision,
          payload: {
            roleRunId: "role-run-bad",
            operationId: "role-op-bad",
            roleId: "missing-role",
            planPath: "/tmp/missing-plan.json",
            promptPath: "/tmp/missing-prompt.md",
            boardRevisionRead: roleRun.core.board.revision,
            runtime: "pi",
            eventLogPath: "/tmp/missing-events.jsonl",
            expectedArtifacts: [],
            timeoutMs: 1000,
          },
        }),
      "EVENT_SCHEMA_INVALID",
    );
    assert.equal((await readManifestEvents(state.paths.manifestEventsPath)).length, beforeBadPlan);

    await expectCoreError(
      "finish without result evidence rejection",
      () =>
        executeCoreCommand(state.paths, {
          commandType: "role.run_finish",
          cwd: state.cwd,
          runId: state.runId,
          actor: { kind: "role_runner", id: "test", roleId: "lead", operationId: roleRun.result.operationId },
          boardRevisionRead: roleRun.core.board.revision,
          payload: {
            roleRunId: roleRun.result.roleRunId,
            operationId: roleRun.result.operationId,
            eventLogPath: roleRun.result.eventLogPath,
            transcriptPath: roleRun.result.transcriptPath,
            toolEventsPath: roleRun.result.toolEventsPath,
            resultPath: roleRun.result.resultPath,
            status: "completed",
            artifactIds: [],
            producedArtifacts: [],
            evidenceIds: roleRun.result.evidenceIds.filter((id) => !id.endsWith(":result")),
          },
        }),
      "EVENT_SCHEMA_INVALID",
    );

    console.log("RoleRuntime verification passed");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function expectCoreError(name: string, fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof CoreError, `${name}: expected CoreError`);
    assert.equal(error.code, code, name);
    return;
  }
  assert.fail(`${name}: expected CoreError ${code}`);
}

await main();
