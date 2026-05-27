import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strict as assert } from "node:assert";
import { executeCoreCommand } from "../core/authority/core-store.ts";
import { readManifestEvents } from "../core/authority/event-io.ts";
import { hashQuestionBundle } from "../core/authority/question-hash.ts";
import { CoreError, type QuestionBundleContract } from "../core/authority/types.ts";
import { renderQuestionBundle } from "../question-ui/adapter.ts";
import { routeWorkbenchCommand } from "../tui/workbench-command-router.ts";
import { openWorkbenchSession } from "../tui/workbench-state.ts";

async function main(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "helmsman-gate4-question-ui-"));
  try {
    let state = await openWorkbenchSession({
      cwd: workspace,
      runId: "gate4-question-ui",
      title: "Gate 4 Question UI verification",
      initialIntent: "Verify Core-owned Charting forms and answer evidence.",
      createIfMissing: true,
    });

    const charting = await routeWorkbenchCommand(state, "/charting", { renderer: "headless_cli", width: 96 });
    assert.equal(charting.ok, true);
    state = charting.state;

    const bundle = activeBundle(state.manifest.questions.bundles);
    assert.equal(bundle.questions.length, 4);
    assert.equal(bundle.maxQuestions, 4);
    for (const question of bundle.questions) {
      assert(question.questionId.startsWith(bundle.bundleId));
      assert.equal(question.allowFreeForm, true);
      assert.equal(question.requiredForLock, true);
      assert(question.recommendedOptionId);
      assert(question.recommendationReason);
      assert(question.options.length >= 2 && question.options.length <= 4);
      for (const option of question.options) {
        assert(Array.isArray(question.routeEffectsByOption[option.optionId]));
        assert(question.routeEffectsByOption[option.optionId].length > 0);
      }
    }

    const bundleHash = hashQuestionBundle(bundle);
    const surface = Object.values(state.manifest.questions.surfaces).find((candidate) => candidate.bundleHash === bundleHash);
    assert(surface, "rendered surface with matching bundle hash must exist");
    assert.equal(state.manifest.evidence.records[surface.surfaceId]?.kind, "question.surface");
    const evidenceLog = await readFile(state.paths.nativeQuestionSurfaceEvidencePath, "utf8");
    assert(evidenceLog.includes(bundle.bundleId));
    assert(evidenceLog.includes(bundleHash));
    assert(evidenceLog.includes("recommendationReason"));
    assert(evidenceLog.includes("routeEffectSummary"));
    const renderedMarkdown = await readFile(join(state.paths.renderedQuestionsRoot, `${bundle.bundleId}.md`), "utf8");
    assert(renderedMarkdown.includes("Recommendation reason"));
    assert(renderedMarkdown.includes("Route effects"));
    assert(renderedMarkdown.includes("Answer Syntax"));

    const beforeBadAnswer = (await readManifestEvents(state.paths.manifestEventsPath)).length;
    await expectCoreError(
      "hash mismatch answer rejection",
      () =>
        executeCoreCommand(state.paths, {
          commandType: "question.answer_record",
          cwd: state.cwd,
          runId: state.runId,
          actor: { kind: "user", id: "test" },
          boardRevisionRead: state.board.revision,
          payload: {
            bundleId: bundle.bundleId,
            questionId: bundle.questions[0]!.questionId,
            answer: {
              questionId: bundle.questions[0]!.questionId,
              selectedOptionIds: [bundle.questions[0]!.options[0]!.optionId],
              answeredAt: new Date().toISOString(),
              authority: "user",
              surfaceId: surface.surfaceId,
              userVisibleBundleHash: "wrong-hash",
              answerDetails: {
                optionLabels: [bundle.questions[0]!.options[0]!.label],
                optionDescriptions: [bundle.questions[0]!.options[0]!.description],
              },
            },
            appliedRouteEffects: bundle.questions[0]!.routeEffectsByOption[bundle.questions[0]!.options[0]!.optionId],
            evidenceIds: [surface.surfaceId],
          },
        }),
      "EVENT_SCHEMA_INVALID",
    );
    assert.equal((await readManifestEvents(state.paths.manifestEventsPath)).length, beforeBadAnswer);

    const badOption = await routeWorkbenchCommand(state, '/answer {"q1":["z"]}', { renderer: "headless_cli", width: 96 });
    assert.equal(badOption.ok, false);
    assert.equal(badOption.mutatedAuthority, false);
    assert.equal((await readManifestEvents(state.paths.manifestEventsPath)).length, beforeBadAnswer);

    const beforeAnswer = (await readManifestEvents(state.paths.manifestEventsPath)).length;
    const answer = await routeWorkbenchCommand(
      state,
      '/answer {"q1":{"selected":["a"],"freeFormText":"keep the full route visible"},"q2":["a"],"q3":["a","b"],"q4":["a","b"]}',
      { renderer: "headless_cli", width: 96 },
    );
    assert.equal(answer.ok, true);
    assert.equal(answer.mutatedAuthority, true);
    state = answer.state;
    assert.equal((await readManifestEvents(state.paths.manifestEventsPath)).length, beforeAnswer + 4);
    assert.equal(state.manifest.questions.openQuestionIds.length, 0);
    assert.equal(state.board.gates["charting.bundle_surface"]?.status, "passed");
    assert.equal(state.board.gates["charting.route_sharpness"]?.status, "passed");
    assert.equal(state.board.nextLegalAction.kind, "run_memory_scan");
    assert(Object.values(state.manifest.questions.answers).some((record) => record.freeFormText === "keep the full route visible"));
    assert(state.manifest.route.scope.some((item) => item.text.includes("complete requested Helmsman product")));
    assert(state.manifest.route.verificationScenarios.length >= 2);
    assert(state.manifest.route.stopConditions.length >= 2);

    const badBundle = structuredClone(bundle) as QuestionBundleContract;
    badBundle.bundleId = `${bundle.bundleId}-bad`;
    badBundle.questions[0]!.questionId = `${badBundle.bundleId}:duplicate-labels`;
    badBundle.questions[0]!.options[1]!.label = badBundle.questions[0]!.options[0]!.label;
    const badSurface = await renderQuestionBundle({ paths: state.paths, bundle: badBundle, renderer: "headless_cli", width: 96 });
    await expectCoreError(
      "duplicate label bundle rejection",
      () =>
        executeCoreCommand(state.paths, {
          commandType: "question.bundle_ask",
          cwd: state.cwd,
          runId: state.runId,
          actor: { kind: "core_policy", id: "core" },
          boardRevisionRead: state.board.revision,
          payload: {
            bundle: badBundle,
            surface: badSurface.surface,
            surfaceEvidence: badSurface.surfaceEvidence,
          },
        }),
      "EVENT_SCHEMA_INVALID",
    );

    console.log("Question UI Adapter verification passed");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

function activeBundle(bundles: Record<string, QuestionBundleContract>): QuestionBundleContract {
  const bundle = Object.values(bundles)[0];
  assert(bundle, "expected a question bundle");
  return bundle;
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
