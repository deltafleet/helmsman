import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect } from "vitest";
import { test, writeFixture } from "../helpers/tmpdir";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

async function runScript(args: string[], cwd = ROOT) {
  return execFileAsync(process.execPath, args, { cwd });
}

async function scaffoldGoalWorkspace(goalDir: string) {
  await mkdir(goalDir, { recursive: true });
  for (const artifact of [
    "goal",
    "goal-charter",
    "route-card",
    "charting-loop",
    "question-bundles",
    "memory-scan",
    "research-index",
    "verification-scenarios",
    "stop-conditions",
    "resume-report-template",
  ]) {
    await runScript(["scripts/scaffold-skill-artifact.mjs", goalDir, "--artifact", artifact]);
  }
}

async function writePassingNativeGoal(tmpdir: string, goalRel: string) {
  const goalDir = join(tmpdir, goalRel);
  await scaffoldGoalWorkspace(goalDir);

  await writeFixture(
    tmpdir,
    `${goalRel}/goal-charter.md`,
    [
      "# Goal Charter",
      "",
      "## Native Goal Source",
      "Implement the strict Charting loop through native goal artifacts.",
      "",
      "## Charter ID",
      "charting-loop-e2e",
      "",
      "## Route Promise",
      "A future agent can run the goal without skipping Aperture, scoped Memory Scan, Research Lanes, Synthesis, or Sharpness Check.",
      "",
      "## Attached Operating Documents",
      "- `goal.md`",
      "- `goal-charter.md`",
      "- `route-card.md`",
      "- `contract.md`",
      "- `charting-loop.md`",
      "- `question-bundles.md`",
      "- `memory-scan.md`",
      "- `research-index.md`",
      "- `verification-scenarios.md`",
      "- `stop-conditions.md`",
      "- `resume-report-template.md`",
      "",
      "## Autonomy Boundary",
      "Allowed without user:",
      "- inspect attached artifacts",
      "- run scoped research listed by memory-scan.md",
      "",
      "Must stop for user:",
      "- selecting between incompatible product routes",
      "",
      "Forbidden:",
      "- broad Memory Scan before the first Aperture Question Bundle is forbidden",
      "- Research Lanes only handle stale, missing, or conflicting prior memory",
      "",
      "## Helmsman Skill Use",
      "- Keep Charting as a recursive route-sharpening loop, not one question bundle plus one research pass.",
      "- Scoped Memory Scan happens before Research Lanes.",
      "- Repeat question, memory, research, synthesis, and sharpness cycles until Route Lock is safe.",
      "",
      "## Completion Standard",
      "Completion requires every SC-LOOP scenario to pass with evidence.",
      "",
      "## Native Goal Instruction",
      "Invoke the native goal with `goal.md`.",
      "",
    ].join("\n"),
  );

  await writeFixture(
    tmpdir,
    `${goalRel}/contract.md`,
    [
      "Current stage: charting",
      "Allowed actions:",
      "- use attached goal artifacts",
      "- run scoped memory scan and research lanes",
      "Forbidden actions:",
      "- skip the first Aperture Question Bundle",
      "- lock route before Sharpness Check",
      "Required artifacts:",
      "- charting-loop.md",
      "- question-bundles.md",
      "- memory-scan.md",
      "- research-index.md",
      "Exit gate:",
      "- route is sharp enough that Autopilot cannot reasonably execute a different destination",
      "Next owner:",
      "- lead worker",
      "",
    ].join("\n"),
  );

  await writeFixture(
    tmpdir,
    `${goalRel}/question-bundles.md`,
    [
      "# Question Bundles",
      "",
      "## C-001 Aperture Question Bundle",
      "",
      "Bundle type: aperture",
      "Bundle review: continue",
      "",
      "### Native Question Surface",
      "",
      "Surface status: answered",
      "Rendered in native chat: yes",
      "Rendered message reference: native goal fixture assistant message",
      "Native transcript evidence: evidence/native-chat-transcript.jsonl#assistant-c001",
      "Covered questions: Q1",
      "Covered options: Q1=A/B/C",
      "Recommendation shown: yes",
      "Reasons shown: yes",
      "Tradeoffs shown: yes",
      "Route effects shown: yes",
      "Free-form override shown: yes",
      "User answer source: fixture accepted A",
      "User answer evidence: evidence/native-chat-transcript.jsonl#user-c001",
      "",
      "### Q1",
      "",
      "Question:",
      "Should this goal prove the loop through real artifacts rather than docs-only assertions?",
      "",
      "Why this matters:",
      "The answer creates coordinates for scoped memory lookup and E2E research lanes.",
      "",
      "A. Prove through real artifacts. (Recommended)",
      "   Reason: It tests the intended execution path.",
      "   Tradeoff: It requires more files than a prose-only test.",
      "   What this answer changes: Memory Scan targets native goal artifacts and loop validation.",
      "",
      "B. Keep docs-only assertions.",
      "   Reason: It is faster to write.",
      "   Tradeoff: It cannot prove the flow runs.",
      "   What this answer changes: No E2E loop validation.",
      "",
      "C. Use a custom Ask UI for the proof.",
      "   Reason: It would make the question surface explicit.",
      "   Tradeoff: It violates the native-chat rule and expands scope.",
      "   What this answer changes: The goal would test UI behavior instead of attached artifacts.",
      "",
      "Free-form answers are welcome if the frame is wrong or options should be mixed.",
      "",
      "User answer:",
      "A. Prove through real artifacts.",
      "",
      "Route effect:",
      "Run scoped Memory Scan before Research Lanes and validate the full loop.",
      "",
      "## C-002 Decision Question Bundle",
      "",
      "Bundle type: decision",
      "Bundle review: lock-ready",
      "",
      "### Native Question Surface",
      "",
      "Surface status: answered",
      "Rendered in native chat: yes",
      "Rendered message reference: native goal fixture assistant message",
      "Native transcript evidence: evidence/native-chat-transcript.jsonl#assistant-c002",
      "Covered questions: Q1",
      "Covered options: Q1=A/B/C",
      "Recommendation shown: yes",
      "Reasons shown: yes",
      "Tradeoffs shown: yes",
      "Route effects shown: yes",
      "Free-form override shown: yes",
      "User answer source: fixture accepted A",
      "User answer evidence: evidence/native-chat-transcript.jsonl#user-c002",
      "",
      "### Q1",
      "",
      "Question:",
      "Can Route Lock proceed after research artifacts clear the remaining ambiguity?",
      "",
      "Why this matters:",
      "Route Lock is unsafe if Autopilot can still execute another destination.",
      "",
      "A. Lock after Sharpness Check. (Recommended)",
      "   Reason: The attached artifacts now prove the intended loop.",
      "   Tradeoff: Future changes must update loop artifacts too.",
      "   What this answer changes: Route moves to lock-ready.",
      "",
      "B. Keep the route parked for another explicit user review.",
      "   Reason: It preserves maximum caution around route authority.",
      "   Tradeoff: It blocks Autopilot despite cleared evidence.",
      "   What this answer changes: Route remains blocked on user authority.",
      "",
      "C. Return to another research loop.",
      "   Reason: It can gather more evidence before lock.",
      "   Tradeoff: Existing evidence already clears the ambiguity.",
      "   What this answer changes: Charting loops instead of locking.",
      "",
      "Free-form answers are welcome if the frame is wrong or options should be mixed.",
      "",
      "User answer:",
      "A. Lock after Sharpness Check.",
      "",
      "Route effect:",
      "Route Card can be treated as lock-ready.",
      "",
    ].join("\n"),
  );

  await writeFixture(
    tmpdir,
    `${goalRel}/evidence/native-chat-transcript.jsonl`,
    [
      JSON.stringify({
        id: "assistant-c001",
        role: "assistant",
        surface: "native-chat",
        text: [
          "Question: Should this goal prove the loop through real artifacts rather than docs-only assertions?",
          "Why this matters: The answer creates coordinates for scoped memory lookup and E2E research lanes.",
          "A. Prove through real artifacts. (Recommended)",
          "Reason: It tests the intended execution path.",
          "Tradeoff: It requires more files than a prose-only test.",
          "What this answer changes: Memory Scan targets native goal artifacts and loop validation.",
          "B. Keep docs-only assertions.",
          "Reason: It is faster to write.",
          "Tradeoff: It cannot prove the flow runs.",
          "What this answer changes: No E2E loop validation.",
          "C. Use a custom Ask UI for the proof.",
          "Reason: It would make the question surface explicit.",
          "Tradeoff: It violates the native-chat rule and expands scope.",
          "What this answer changes: The goal would test UI behavior instead of attached artifacts.",
          "Free-form answers are welcome if the frame is wrong or options should be mixed.",
        ].join("\n"),
      }),
      JSON.stringify({
        id: "user-c001",
        role: "user",
        surface: "native-chat",
        text: "A. Prove through real artifacts.",
      }),
      JSON.stringify({
        id: "assistant-c002",
        role: "assistant",
        surface: "native-chat",
        text: [
          "Question: Can Route Lock proceed after research artifacts clear the remaining ambiguity?",
          "Why this matters: Route Lock is unsafe if Autopilot can still execute another destination.",
          "A. Lock after Sharpness Check. (Recommended)",
          "Reason: The attached artifacts now prove the intended loop.",
          "Tradeoff: Future changes must update loop artifacts too.",
          "What this answer changes: Route moves to lock-ready.",
          "B. Keep the route parked for another explicit user review.",
          "Reason: It preserves maximum caution around route authority.",
          "Tradeoff: It blocks Autopilot despite cleared evidence.",
          "What this answer changes: Route remains blocked on user authority.",
          "C. Return to another research loop.",
          "Reason: It can gather more evidence before lock.",
          "Tradeoff: Existing evidence already clears the ambiguity.",
          "What this answer changes: Charting loops instead of locking.",
          "Free-form answers are welcome if the frame is wrong or options should be mixed.",
        ].join("\n"),
      }),
      JSON.stringify({
        id: "user-c002",
        role: "user",
        surface: "native-chat",
        text: "A. Lock after Sharpness Check.",
      }),
    ].join("\n"),
  );

  await writeFixture(
    tmpdir,
    `${goalRel}/memory-scan.md`,
    [
      "# Memory Scan",
      "",
      "## Rule",
      "Broad Memory Scan is forbidden before the first Aperture Question Bundle.",
      "",
      "Scoped Memory Scan happens before Research Lanes.",
      "",
      "## C-001 Scoped Memory Scan",
      "Selected aperture:",
      "Prove the strict native goal loop through real artifacts.",
      "",
      "Prior memory sources checked:",
      "- `.helmsman/sessions/session-20260516-1202-charting/charting-loop-concept.md`",
      "- `skills/helmsman-charting/templates/goal.md`",
      "- `docs/helmsman-protocol.md`",
      "",
      "| Candidate | Source | Judgment | Reason | Route Effect | Research Needed | Research Lane |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| loop concept | charting-loop-concept.md | reused | Still matches the desired route-sharpening loop. | Keep loop order. | no | none |",
      "| old goal templates | skills/helmsman-charting/templates/goal.md | stale | Before this change, goal artifacts did not prove the loop. | Inspect template gap. | yes | goal-template-gap |",
      "| native goal validator | none | missing | No prior validator proved a filled goal workspace. | Add E2E validation. | yes | native-goal-validator-gap |",
      "| unrelated runtime UI | old runtime notes | irrelevant | Runtime UI is outside current product path. | Skip. | no | none |",
      "",
      "Allowed judgments:",
      "",
      "```text",
      "reused | stale | irrelevant | missing | conflict",
      "```",
      "",
      "## Research Lane Output",
      "Only stale, missing, and conflict judgments may create Research Lanes.",
      "",
    ].join("\n"),
  );

  await writeFixture(
    tmpdir,
    `${goalRel}/research-index.md`,
    [
      "# Research Index",
      "",
      "Max active research lanes: 6 unless user-approved",
      "Launch posture: parallel",
      "",
      "| Slug | Question | Lane Type | Owner | Status | Artifact | Sources Checked | Decision Impact | Open Uncertainty |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| goal-template-gap | Do goal templates bind the strict loop? | source-of-truth | researcher-template | done | research/goal-template-gap.md | 3 files | Adds loop contract to goal artifacts. | none |",
      "| native-goal-validator-gap | Can a filled goal workspace be validated end to end? | implementation-feasibility | researcher-validator | done | research/native-goal-validator-gap.md | 2 files | Adds native goal validator. | none |",
      "",
    ].join("\n"),
  );

  await writeFixture(
    tmpdir,
    `${goalRel}/worker-packets.md`,
    [
      "# Worker Packets",
      "",
      "Launch mode: parallel",
      "Launch evidence: spawned in parallel",
      "Parallel launch group: C-001",
      "",
      "## Worker: researcher-template",
      "Worker name: researcher-template",
      "Mission: Check whether native goal templates bind the strict loop contract.",
      "Allowed write scope: research/goal-template-gap.md",
      "Required artifact: research/goal-template-gap.md",
      "Done criteria: observations and inferences are split, sources are listed, and decision impact is explicit.",
      "Forbidden actions: do not edit route-card.md or user decisions.",
      "",
      "## Worker: researcher-validator",
      "Worker name: researcher-validator",
      "Mission: Check whether a filled native goal workspace can be validated end to end.",
      "Allowed write scope: research/native-goal-validator-gap.md",
      "Required artifact: research/native-goal-validator-gap.md",
      "Done criteria: observations and inferences are split, sources are listed, and decision impact is explicit.",
      "Forbidden actions: do not edit route-card.md or user decisions.",
      "",
    ].join("\n"),
  );

  await writeFixture(
    tmpdir,
    `${goalRel}/research/goal-template-gap.md`,
    [
      "# Research: goal-template-gap",
      "",
      "## Question",
      "Do native goal templates bind the strict Charting loop?",
      "",
      "## Lane Type",
      "source-of-truth",
      "",
      "## Worker Packet",
      "Worker: researcher-template",
      "",
      "## Sources Checked",
      "- skills/helmsman-charting/templates/goal.md",
      "- skills/helmsman-charting/templates/goal-charter.md",
      "- skills/helmsman-charting/templates/stop-conditions.md",
      "",
      "## Observations",
      "- The goal template binds charting-loop.md, question-bundles.md, and memory-scan.md.",
      "- Stop conditions include premature Memory Scan, premature Research Lanes, and premature Route Lock.",
      "",
      "## Inferences",
      "- A future goal runner has explicit loop artifacts to follow.",
      "",
      "## Uncertainty",
      "none",
      "",
      "## Decision Impact",
      "The route can require loop artifacts for native goals.",
      "",
      "## Route Changes Required",
      "none",
      "",
      "## Recommended Next Step",
      "Validate a filled goal workspace.",
      "",
    ].join("\n"),
  );

  await writeFixture(
    tmpdir,
    `${goalRel}/research/native-goal-validator-gap.md`,
    [
      "# Research: native-goal-validator-gap",
      "",
      "## Question",
      "Can a filled native goal workspace be validated end to end?",
      "",
      "## Lane Type",
      "implementation-feasibility",
      "",
      "## Worker Packet",
      "Worker: researcher-validator",
      "",
      "## Sources Checked",
      "- scripts/validate-native-goal.mjs",
      "- tests/docs/native-goal-e2e.spec.ts",
      "",
      "## Observations",
      "- The validator checks goal, question, memory, research, sharpness, and stop-condition artifacts together.",
      "",
      "## Inferences",
      "- This proves the intended loop better than isolated template assertions.",
      "",
      "## Uncertainty",
      "none",
      "",
      "## Decision Impact",
      "The route can claim E2E goal artifact validation when this command passes.",
      "",
      "## Route Changes Required",
      "none",
      "",
      "## Recommended Next Step",
      "Run validate-native-goal on the workspace.",
      "",
    ].join("\n"),
  );

  await writeFixture(
    tmpdir,
    `${goalRel}/charting-loop.md`,
    [
      "# Charting Loop",
      "",
      "Signal Read -> Aperture Question Bundle -> Scoped Memory Scan -> Research Lanes -> Synthesis -> Sharpness Check -> loop or Route Lock",
      "",
      "## Cycles",
      "",
      "| Cycle ID | Starting Route Hypothesis | Question Bundle | User Answer | Memory Scan Result | Research Lanes | Synthesis | Sharpness Check | Decision |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| C-001 | Native goal needs loop proof. | question-bundles.md#c-001 | Prove through real artifacts. | memory-scan.md#c-001 | goal-template-gap, native-goal-validator-gap | Add loop artifacts and validator. | loop required because research was needed. | loop |",
      "| C-002 | Native goal loop proof exists. | question-bundles.md#c-002 | Lock after Sharpness Check. | memory-scan.md#c-001 | completed | No user-owned ambiguity remains. | lock-ready; Autopilot ambiguity: none | lock |",
      "",
      "## Current Sharpness",
      "- Destination: prove native goal strict Charting loop.",
      "- Non-goals: no runtime UI or host internals.",
      "- User-owned decisions remaining: none.",
      "- Evidence gaps: none.",
      "- Stale memory risks: none.",
      "- Autopilot ambiguity: none",
      "",
      "## Route Lock Rule",
      "Route Lock is forbidden while Autopilot could reasonably execute a different destination from the same route card.",
      "",
    ].join("\n"),
  );

  await writeFixture(
    tmpdir,
    `${goalRel}/route-card.md`,
    [
      "# Route Card",
      "",
      "## User Intent",
      "Prove /goal uses the strict recursive Charting loop.",
      "",
      "## Scope",
      "- Native goal artifact workspace.",
      "- Question, memory, research, synthesis, sharpness, and lock proof.",
      "",
      "## Non-Goals",
      "- No host runtime internals.",
      "- No broad Memory Scan before first question.",
      "",
      "## Decisions",
      "- Use artifact-level E2E proof.",
      "",
      "## Aperture Bundles",
      "Bundle Density Read: one confirmation-oriented question.",
      "Aperture bundle status: answered in question-bundles.md.",
      "",
      "## Research Lane Contract",
      "Research lanes: goal-template-gap, native-goal-validator-gap.",
      "Parallel research posture: parallel.",
      "Research worker packets: represented by research-index.md rows.",
      "Lead-only lanes: none.",
      "Research index: research-index.md",
      "Research artifacts: research/<slug>.md",
      "Max active lanes: 6 unless user-approved",
      "Topic-to-artifact map: goal-template-gap -> research/goal-template-gap.md; native-goal-validator-gap -> research/native-goal-validator-gap.md",
      "",
      "## Decision Bundles",
      "Decision bundle status: answered in C-002.",
      "",
      "## Open Questions",
      "none",
      "",
      "## Risks",
      "- Future edits could weaken goal artifacts without E2E coverage.",
      "",
      "## Success Criteria",
      "- validate-native-goal passes on the filled workspace.",
      "",
      "## Verification Scenarios",
      "Scenario ID: SC-LOOP-001",
      "Route Scenario: Aperture Question Bundle happens before scoped Memory Scan.",
      "",
      "Scenario ID: SC-LOOP-002",
      "Route Scenario: Research Lanes are created only from stale or missing memory.",
      "",
      "Scenario ID: SC-LOOP-003",
      "Route Scenario: Route Lock follows Sharpness Check.",
      "",
      "## Next Recommended Skill",
      "helmsman-autopilot",
      "",
      "## Handoff",
      "Next skill: helmsman-autopilot",
      "Input artifact: route-card.md",
      "Already satisfied: strict Charting loop E2E proof.",
      "Deferred questions: none",
      "Carrier warning: do not skip loop artifacts.",
      "Expected output: execution plan only after Route Lock.",
      "",
    ].join("\n"),
  );

  await writeFixture(
    tmpdir,
    `${goalRel}/verification-scenarios.md`,
    [
      "# Verification Scenarios",
      "",
      "## Scenario Matrix",
      "",
      "| Scenario ID | Route Promise | Evidence Required | Status |",
      "| --- | --- | --- | --- |",
      "| SC-LOOP-001 | Charting used at least one Aperture Question Bundle before scoped Memory Scan. | question-bundles.md and memory-scan.md | pass |",
      "| SC-LOOP-002 | Research Lanes were launched only for stale, missing, or conflicting prior memory. | memory-scan.md and research-index.md | pass |",
      "| SC-LOOP-003 | Route Lock followed a Sharpness Check that ruled out plausible divergent Autopilot destinations. | charting-loop.md and route-card.md | pass |",
      "",
      "## Completion Rule",
      "The native goal is complete because every scenario passed with concrete evidence.",
      "",
    ].join("\n"),
  );

  return goalDir;
}

describe("native /goal Charting loop E2E", () => {
  test("scaffolds, fills, and validates a strict Charting loop goal workspace", async ({
    tmpdir,
  }) => {
    const goalDir = await writePassingNativeGoal(tmpdir, ".helmsman/goals/charting-loop-e2e");

    const result = await runScript(["scripts/validate-native-goal.mjs", goalDir]);
    expect(result.stdout).toContain("native goal check pass");

    const loop = await readFile(join(goalDir, "charting-loop.md"), "utf8");
    expect(loop).toContain("Autopilot ambiguity: none");
    expect(loop).toContain("| C-002 |");
    expect(loop).toContain("| lock |");
  });

  test("rejects stale memory that does not create a research lane", async ({ tmpdir }) => {
    const goalDir = await writePassingNativeGoal(tmpdir, ".helmsman/goals/bad-memory");
    const memoryPath = join(goalDir, "memory-scan.md");
    const memory = await readFile(memoryPath, "utf8");
    await writeFile(
      memoryPath,
      memory.replace(
        "| old goal templates | skills/helmsman-charting/templates/goal.md | stale | Before this change, goal artifacts did not prove the loop. | Inspect template gap. | yes | goal-template-gap |",
        "| old goal templates | skills/helmsman-charting/templates/goal.md | stale | Before this change, goal artifacts did not prove the loop. | Inspect template gap. | no | none |",
      ),
      "utf8",
    );

    await expect(runScript(["scripts/validate-native-goal.mjs", goalDir])).rejects.toMatchObject({
      stderr: expect.stringContaining("memory-scan.md judgment 'stale' must require research"),
    });
  });

  test("rejects route lock while Autopilot ambiguity remains", async ({ tmpdir }) => {
    const goalDir = await writePassingNativeGoal(tmpdir, ".helmsman/goals/bad-lock");
    const loopPath = join(goalDir, "charting-loop.md");
    const loop = await readFile(loopPath, "utf8");
    await writeFile(loopPath, loop.replace("Autopilot ambiguity: none", "Autopilot ambiguity: unresolved"), "utf8");

    await expect(runScript(["scripts/validate-native-goal.mjs", goalDir])).rejects.toMatchObject({
      stderr: expect.stringContaining("locks route without clearing Autopilot ambiguity"),
    });
  });

  test("rejects parallel research lanes without worker packets and launch evidence", async ({
    tmpdir,
  }) => {
    const goalDir = await writePassingNativeGoal(tmpdir, ".helmsman/goals/bad-workers");
    await rm(join(goalDir, "worker-packets.md"));

    await expect(runScript(["scripts/validate-native-goal.mjs", goalDir])).rejects.toMatchObject({
      stderr: expect.stringContaining("worker-packets.md is required for parallel research lanes"),
    });
  });

  test("rejects loop cycles that do not produce the next question bundle", async ({ tmpdir }) => {
    const goalDir = await writePassingNativeGoal(tmpdir, ".helmsman/goals/missing-question");
    const questionsPath = join(goalDir, "question-bundles.md");
    const questions = await readFile(questionsPath, "utf8");
    await writeFile(questionsPath, questions.replace(/## C-002 Decision Question Bundle[\s\S]*$/, ""), "utf8");

    await expect(runScript(["scripts/validate-native-goal.mjs", goalDir])).rejects.toMatchObject({
      stderr: expect.stringContaining("question-bundles.md missing question bundle for charting cycle C-002"),
    });
  });

  test("rejects native goal decision bundle without full option surface", async ({ tmpdir }) => {
    const goalDir = await writePassingNativeGoal(tmpdir, ".helmsman/goals/incomplete-options");
    const questionsPath = join(goalDir, "question-bundles.md");
    const questions = await readFile(questionsPath, "utf8");
    await writeFile(
      questionsPath,
      questions.replace(
        /B\. Keep the route parked[\s\S]*?\nC\. Return to another research loop/,
        "C. Return to another research loop",
      ),
      "utf8",
    );

    await expect(runScript(["scripts/validate-native-goal.mjs", goalDir])).rejects.toMatchObject({
      stderr: expect.stringContaining("question-bundles.md C-002 Q1 missing option B"),
    });
  });

  test("rejects native goal surface when transcript omits rendered options", async ({
    tmpdir,
  }) => {
    const goalDir = await writePassingNativeGoal(tmpdir, ".helmsman/goals/bad-transcript");
    await writeFixture(
      tmpdir,
      ".helmsman/goals/bad-transcript/evidence/native-chat-transcript.jsonl",
      [
        JSON.stringify({
          id: "assistant-c001",
          role: "assistant",
          surface: "native-chat",
          text: [
            "Question: Should this goal prove the loop through real artifacts rather than docs-only assertions?",
            "A. Prove through real artifacts. (Recommended)",
            "Reason: It tests the intended execution path.",
            "Tradeoff: It requires more files than a prose-only test.",
            "What this answer changes: Memory Scan targets native goal artifacts and loop validation.",
            "Free-form answers are welcome if the frame is wrong or options should be mixed.",
          ].join("\n"),
        }),
        JSON.stringify({
          id: "user-c001",
          role: "user",
          surface: "native-chat",
          text: "A. Prove through real artifacts.",
        }),
        JSON.stringify({
          id: "assistant-c002",
          role: "assistant",
          surface: "native-chat",
          text: [
            "Question: Can Route Lock proceed after research artifacts clear the remaining ambiguity?",
            "A. Lock after Sharpness Check. (Recommended)",
            "Reason: The attached artifacts now prove the intended loop.",
            "Tradeoff: Future changes must update loop artifacts too.",
            "What this answer changes: Route moves to lock-ready.",
            "B. Keep the route parked for another explicit user review.",
            "Reason: It preserves maximum caution around route authority.",
            "Tradeoff: It blocks Autopilot despite cleared evidence.",
            "What this answer changes: Route remains blocked on user authority.",
            "C. Return to another research loop.",
            "Reason: It can gather more evidence before lock.",
            "Tradeoff: Existing evidence already clears the ambiguity.",
            "What this answer changes: Charting loops instead of locking.",
            "Free-form answers are welcome if the frame is wrong or options should be mixed.",
          ].join("\n"),
        }),
        JSON.stringify({
          id: "user-c002",
          role: "user",
          surface: "native-chat",
          text: "A. Lock after Sharpness Check.",
        }),
      ].join("\n"),
    );

    await expect(runScript(["scripts/validate-native-goal.mjs", goalDir])).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "question-bundles.md C-001 Q1 transcript evidence missing option B",
      ),
    });
  });

  test("rejects next loop cycle that points at the wrong question bundle", async ({ tmpdir }) => {
    const goalDir = await writePassingNativeGoal(tmpdir, ".helmsman/goals/wrong-next-question");
    const loopPath = join(goalDir, "charting-loop.md");
    const loop = await readFile(loopPath, "utf8");
    await writeFile(
      loopPath,
      loop.replace("question-bundles.md#c-002 | Lock after Sharpness Check", "question-bundles.md#c-001 | Lock after Sharpness Check"),
      "utf8",
    );

    await expect(runScript(["scripts/validate-native-goal.mjs", goalDir])).rejects.toMatchObject({
      stderr: expect.stringContaining("charting-loop.md cycle C-002 must reference question-bundles.md#c-002"),
    });
  });

  test("rejects research lanes without a research-needed memory origin", async ({ tmpdir }) => {
    const goalDir = await writePassingNativeGoal(tmpdir, ".helmsman/goals/orphan-research");
    const researchIndexPath = join(goalDir, "research-index.md");
    const researchIndex = await readFile(researchIndexPath, "utf8");
    await writeFile(
      researchIndexPath,
      researchIndex.replace(
        "| native-goal-validator-gap | Can a filled goal workspace be validated end to end? | implementation-feasibility | researcher-validator | done | research/native-goal-validator-gap.md | 2 files | Adds native goal validator. | none |",
        [
          "| native-goal-validator-gap | Can a filled goal workspace be validated end to end? | implementation-feasibility | researcher-validator | done | research/native-goal-validator-gap.md | 2 files | Adds native goal validator. | none |",
          "| orphan-research | Can unrelated research sneak into the route? | exploratory | researcher-orphan | done | research/orphan-research.md | 1 file | Should be rejected. | none |",
        ].join("\n"),
      ),
      "utf8",
    );

    const packetsPath = join(goalDir, "worker-packets.md");
    const packets = await readFile(packetsPath, "utf8");
    await writeFile(
      packetsPath,
      [
        packets,
        "## Worker: researcher-orphan",
        "Worker name: researcher-orphan",
        "Mission: Check whether unrelated research can sneak into the route.",
        "Allowed write scope: research/orphan-research.md",
        "Required artifact: research/orphan-research.md",
        "Done criteria: observations and inferences are split, sources are listed, and decision impact is explicit.",
        "Forbidden actions: do not edit route-card.md or user decisions.",
        "",
      ].join("\n"),
      "utf8",
    );

    await writeFixture(
      tmpdir,
      ".helmsman/goals/orphan-research/research/orphan-research.md",
      [
        "# Research: orphan-research",
        "",
        "## Question",
        "Can unrelated research sneak into the route?",
        "",
        "## Lane Type",
        "exploratory",
        "",
        "## Worker Packet",
        "Worker: researcher-orphan",
        "",
        "## Sources Checked",
        "- one file",
        "",
        "## Observations",
        "- This lane has no memory-scan origin.",
        "",
        "## Inferences",
        "- It should fail validation.",
        "",
        "## Decision Impact",
        "Reject orphan research lanes.",
        "",
        "## Recommended Next Step",
        "Remove the orphan lane.",
        "",
      ].join("\n"),
    );

    await expect(runScript(["scripts/validate-native-goal.mjs", goalDir])).rejects.toMatchObject({
      stderr: expect.stringContaining("research-index.md lane 'orphan-research' has no research-needed memory origin"),
    });
  });

  test("rejects route lock while user-owned decisions remain", async ({ tmpdir }) => {
    const goalDir = await writePassingNativeGoal(tmpdir, ".helmsman/goals/premature-lock");
    const loopPath = join(goalDir, "charting-loop.md");
    const loop = await readFile(loopPath, "utf8");
    await writeFile(
      loopPath,
      loop.replace("User-owned decisions remaining: none", "User-owned decisions remaining: choose execution route"),
      "utf8",
    );

    await expect(runScript(["scripts/validate-native-goal.mjs", goalDir])).rejects.toMatchObject({
      stderr: expect.stringContaining("charting-loop.md locks route while sharpness is unresolved"),
    });
  });
});
