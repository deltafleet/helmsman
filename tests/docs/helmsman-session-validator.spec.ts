import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect } from "vitest";
import { test, writeFixture } from "../helpers/tmpdir";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

async function runValidator(sessionDir: string, stage: string) {
  return execFileAsync(
    process.execPath,
    ["scripts/validate-skill-session.mjs", sessionDir, "--stage", stage],
    { cwd: ROOT },
  );
}

async function writeCompleteSession(tmpdir: string): Promise<string> {
  const session = "session-helmsman";
  const root = join(tmpdir, session);
  await writeFixture(
    tmpdir,
    `${session}/contract.md`,
    [
      "Current stage: retro",
      "Allowed actions: verify artifacts and write retro",
      "Forbidden actions: edit source outside approved scope",
      "Required artifacts: route-card, plan, verification, retro",
      "Exit gate: all route scenarios have evidence",
      "Next owner: future lead worker",
      "",
    ].join("\n"),
  );
  await writeFixture(
    tmpdir,
    `${session}/map.json`,
    JSON.stringify(
      {
        schemaVersion: 1,
        stage: "retro",
        status: "complete",
        checkpoints: ["charting", "research", "autopilot", "verify", "retro"],
        currentCheckpoint: "retro",
        requiredArtifacts: [
          "contract.md",
          "map.json",
          "route-card.md",
          "question-bundles.md",
          "evidence/source.md",
          "plan.md",
          "verification.md",
          "retro.md",
        ],
        presentArtifacts: [
          "contract.md",
          "map.json",
          "route-card.md",
          "question-bundles.md",
          "evidence/source.md",
          "plan.md",
          "verification.md",
          "retro.md",
        ],
        missingArtifacts: [],
        openQuestions: [],
        blockedReason: null,
        nextSkill: "none",
      },
      null,
      2,
    ),
  );
  await writeFixture(
    tmpdir,
    `${session}/chart.md`,
    "# Chart\n\nThe target is a Helmsman workflow.",
  );
  await writeFixture(
    tmpdir,
    `${session}/decision-log.md`,
    "# Decision Log\n\n- Use native conversation for questions.\n",
  );
  await writeFixture(
    tmpdir,
    `${session}/question-bundles.md`,
    [
      "# Question Bundles",
      "",
      "## C-001 Aperture Question Bundle",
      "",
      "Bundle type: aperture",
      "Bundle review: answered",
      "",
      "### Native Question Surface",
      "",
      "Surface status: answered",
        "Rendered in native chat: yes",
        "Rendered message reference: assistant final message before user answer, 2026-05-19",
        "Native transcript evidence: evidence/native-chat-transcript.jsonl#assistant-c001",
        "Covered questions: Q1",
        "Covered options: Q1=A/B/C",
        "Recommendation shown: yes",
        "Reasons shown: yes",
        "Tradeoffs shown: yes",
        "Route effects shown: yes",
        "Free-form override shown: yes",
        "User answer source: native chat accepted A",
        "User answer evidence: evidence/native-chat-transcript.jsonl#user-c001",
      "",
      "### Q1",
      "",
      "Question:",
      "Should Helmsman keep native chat as the question surface while artifacts record evidence?",
      "",
      "Why this matters:",
      "This decides whether helper scripts remain validators rather than workflow controllers.",
      "",
      "A. Keep native chat as question surface and artifacts as replay evidence. (Recommended)",
      "   Reason: It preserves user authority without adding a custom Ask UI.",
      "   Tradeoff: The lead must record the rendered surface explicitly.",
      "   What this answer changes: Validator can block handoff when replay evidence is missing.",
      "",
      "B. Make artifacts the only question surface.",
      "   Reason: It is simpler for scripts to validate.",
      "   Tradeoff: It weakens the native-chat rule.",
      "   What this answer changes: User decisions could be hidden in files.",
      "",
      "C. Add a custom Ask UI.",
      "   Reason: It creates a dedicated structured surface.",
      "   Tradeoff: It violates the non-goal for this fix.",
      "   What this answer changes: Scope expands into UI work.",
      "",
      "Free-form answers are welcome if the frame is wrong or options should be mixed.",
      "",
      "User answer:",
      "A. Keep native chat as question surface and artifacts as replay evidence.",
      "",
      "Route effect:",
      "Route can proceed with validator-backed native replay evidence.",
      "",
      "## C-002 Decision Question Bundle",
      "",
      "Bundle type: decision",
      "Bundle review: not-needed",
      "",
      "### Native Question Surface",
      "",
      "Surface status: not-needed",
      "Rendered in native chat: no",
      "Rendered message reference: none",
      "Native transcript evidence: none",
      "Covered questions: none",
      "Covered options: none",
      "Recommendation shown: no",
      "Reasons shown: no",
      "Tradeoffs shown: no",
      "Route effects shown: no",
      "Free-form override shown: no",
        "User answer source: no remaining user-owned decision after C-001",
        "User answer evidence: none",
        "",
      ].join("\n"),
  );
  await writeFixture(
    tmpdir,
    `${session}/evidence/native-chat-transcript.jsonl`,
    [
      JSON.stringify({
        id: "assistant-c001",
        role: "assistant",
        surface: "native-chat",
        text: [
          "Question: Should Helmsman keep native chat as the question surface while artifacts record evidence?",
          "Why this matters: This decides whether helper scripts remain validators rather than workflow controllers.",
          "A. Keep native chat as question surface and artifacts as replay evidence. (Recommended)",
          "Reason: It preserves user authority without adding a custom Ask UI.",
          "Tradeoff: The lead must record the rendered surface explicitly.",
          "What this answer changes: Validator can block handoff when replay evidence is missing.",
          "B. Make artifacts the only question surface.",
          "Reason: It is simpler for scripts to validate.",
          "Tradeoff: It weakens the native-chat rule.",
          "What this answer changes: User decisions could be hidden in files.",
          "C. Add a custom Ask UI.",
          "Reason: It creates a dedicated structured surface.",
          "Tradeoff: It violates the non-goal for this fix.",
          "What this answer changes: Scope expands into UI work.",
          "Free-form answers are welcome if the frame is wrong or options should be mixed.",
        ].join("\n"),
      }),
      JSON.stringify({
        id: "user-c001",
        role: "user",
        surface: "native-chat",
        text: "A. Keep native chat as question surface and artifacts as replay evidence.",
      }),
    ].join("\n"),
  );
  await writeFixture(
    tmpdir,
    `${session}/route-card.md`,
    [
      "# Route Card",
      "",
      "## User Intent",
      "Create a Helmsman workflow.",
      "## Scope",
      "Split skills and artifact gates.",
      "## Non-Goals",
      "No separate UI authority.",
      "## Decisions",
      "Use native chat for questions.",
      "## Aperture Bundles",
      "Bundle Density Read: minimal - route and evidence target are already narrow.",
      "Aperture bundle status: answered - user approved artifact authority and native chat.",
      "Aperture native surface: answered with question-bundles.md#c-001 evidence.",
      "## Research Lane Contract",
      "Research lanes: source-of-truth lane over SKILL.md, route-card.md, and validator behavior.",
      "Parallel research posture: lead-only - compact fixture has one local source-of-truth lane.",
      "Research worker packets: none - no independent parallel lane exists in this fixture.",
      "Lead-only lanes: source-of-truth lane because the lead can inspect it faster locally.",
      "Research index: research-index.md",
      "Research artifacts: research/source.md",
      "Max active lanes: 6 unless user-approved.",
      "Topic-to-artifact map: source -> protocol authority -> research/source.md.",
      "Skipped lanes: UI/runtime restoration and old state-machine surfaces.",
      "## Decision Bundles",
      "Decision bundle status: not-needed - no remaining user-owned decision after C-001.",
      "Decision native surface: not-needed - no remaining user-owned decision after C-001.",
      "## Open Questions",
      "No open questions.",
      "## Risks",
      "Worker drift.",
      "## Success Criteria",
      "A fresh lead worker can resume from artifacts.",
      "## Verification Scenarios",
      "- Scenario ID: SC-001",
      "  Route Scenario: validator accepts the session.",
      "## Next Recommended Skill",
      "helmsman-autopilot",
      "## Handoff",
      "Next skill: helmsman-autopilot",
      "Input artifact: route-card.md and evidence/source.md",
      "Already satisfied: scope, evidence, and success criteria are recorded",
      "Deferred questions: none",
      "Carrier warning: do not use custom Ask UI as authority",
      "Expected output: plan.md",
      "",
    ].join("\n"),
  );
  await writeFixture(
    tmpdir,
    `${session}/worker-packets.md`,
    [
      "# Worker Packets",
      "",
      "Worker name: verifier-1",
      "Mission: compare output against route scenarios",
      "Context to read: route-card.md and plan.md",
      "Allowed write scope: verification.md",
      "Forbidden actions: edit source files",
      "Required output artifact: verification.md",
      "Done criteria: every scenario has a verdict",
      "Verification notes: cite commands and files inspected",
      "",
    ].join("\n"),
  );
  await writeFixture(
    tmpdir,
    `${session}/agents.json`,
    JSON.stringify({ workers: [{ name: "verifier-1", status: "completed" }] }, null, 2),
  );
  await writeFixture(
    tmpdir,
    `${session}/evidence/source.md`,
    [
      "# Evidence",
      "",
      "## Source",
      "- SKILL.md",
      "## Question",
      "Which protocol authority should own the workflow?",
      "## Lane Type",
      "source-of-truth",
      "## Sources Checked",
      "- SKILL.md",
      "## Observations",
      "- The root skill routes to split skills.",
      "## Inferences",
      "- Artifact gates are the correct authority for continuation.",
      "## Uncertainty",
      "No unresolved evidence uncertainty.",
      "## Decision Impact",
      "Keep validation artifact-based.",
      "## Route Changes Required",
      "No route changes required.",
      "## Recommended Next Step",
      "Continue to helmsman-autopilot.",
      "",
    ].join("\n"),
  );
  await writeFixture(
    tmpdir,
    `${session}/plan.md`,
    [
      "# Plan",
      "",
      "## Route Summary",
      "Helmsman path.",
      "## Execution Strategy",
      "Strategy: inline",
      "Reason: one lead worker owns this compact fixture.",
      "File-to-work-item map: WI-001 owns docs and skills.",
      "Integration order: lead worker writes artifacts then validates them.",
      "## Work Items",
      "## Work Item: WI-001",
      "Owner: lead worker",
      "Allowed write scope: docs and skills",
      "Inputs: route-card.md, evidence/source.md",
      "Exact changes: add split skills and gates",
      "Expected evidence: validator passes",
      "Dependency: none",
      "Rollback: revert docs if invalid",
      "Verification scenario links: SC-001",
      "## Dependencies",
      "- None.",
      "## Allowed Write Scope",
      "- docs and skills.",
      "## Worker Assignments",
      "- verifier-1 checks scenarios.",
      "## Verification Scenarios",
      "- session validator passes.",
      "## Risks And Rollback",
      "- Revert docs if invalid.",
      "",
    ].join("\n"),
  );
  await writeFixture(
    tmpdir,
    `${session}/strategy-samples.md`,
    [
      "# Strategy Samples",
      "",
      "## Mission",
      "Create a Helmsman workflow.",
      "## Shared Constraints",
      "- Artifacts own workflow state.",
      "## Samples",
      "### Sample S-001",
      "Approach: keep three public phase skills and internal research/closeout checkpoints.",
      "Strengths: simple surface with strong internal pressure.",
      "Weaknesses: validator must enforce stage artifacts.",
      "Risks: autopilot can become vague if stage files are ignored.",
      "Evidence used: route-card.md and evidence/source.md",
      "Decision impact: add internal stage contracts.",
      "### Sample S-002",
      "Approach: expose strategy, blueprint, audit, and execute as directly callable phases.",
      "Strengths: explicit invocation surface.",
      "Weaknesses: too much user-facing fragmentation.",
      "Risks: route and evidence can be bypassed.",
      "Evidence used: route-card.md and evidence/source.md",
      "Decision impact: reject public phase split.",
      "## Convergence",
      "Use three public phase skills with internal research and closeout checkpoints.",
      "## Open Decision Boundaries",
      "No open user-owned decisions.",
      "",
    ].join("\n"),
  );
  await writeFixture(
    tmpdir,
    `${session}/director-blueprint.md`,
    [
      "# Director Blueprint",
      "",
      "## Accepted Direction",
      "Keep the callable surface small and put downstream stages under Autopilot.",
      "## Rejected Directions",
      "- Public strategy, blueprint, audit, and execute skills because they fragment the route.",
      "## File And Artifact Ownership",
      "- lead worker: skills, scripts, tests, and docs.",
      "## Dependency Graph",
      "```text",
      "route-card.md -> strategy-samples.md -> director-blueprint.md -> plan.md",
      "```",
      "## Plan Compilation Notes",
      "Strategy evidence became validator-backed work items.",
      "## Scenario Coverage",
      "- SC-001: covered by validator.",
      "## Open Risks",
      "- None.",
      "",
    ].join("\n"),
  );
  await writeFixture(
    tmpdir,
    `${session}/hardening.md`,
    [
      "# Hardening",
      "",
      "## Round",
      "Round: 1",
      "## Cross-Section Findings",
      "- No cross-section findings.",
      "## Ownership Problems",
      "- No ownership problems.",
      "## Dependency Problems",
      "- No dependency problems.",
      "## Scenario Coverage Problems",
      "- No scenario coverage problems.",
      "## Required Plan Changes",
      "- No required plan changes.",
      "## Decision",
      "Decision: lock",
      "Reason: plan, ownership, and scenario evidence align.",
      "",
    ].join("\n"),
  );
  await writeFixture(
      tmpdir,
      `${session}/audit.md`,
      [
        "# Audit",
        "",
        "## Plan Risks",
        "No unresolved plan risks.",
        "## Missing Evidence",
        "No missing evidence.",
        "## Dependency Problems",
        "No dependency problems.",
        "## Scope Drift Risks",
        "No scope drift risks.",
        "## Verification Gaps",
        "No verification gaps.",
        "## Verdict",
        "Verdict: proceed",
        "Reason: route scenarios have direct validation evidence.",
        "Required fixes before proceed: none",
        "",
      ].join("\n"),
  );
  await writeFixture(
    tmpdir,
    `${session}/verification.md`,
    [
      "# Verification",
      "",
      "## Route Promise",
      "Artifacts define the workflow.",
      "## Scenario Matrix",
      "| Scenario ID | Route Scenario | Evidence | Result | Notes |",
      "| --- | --- | --- | --- | --- |",
      "| SC-001 | validator accepts session | command output | pass | all artifacts present |",
      "## Commands Run",
      "- validate-skill-session",
      "## Files Inspected",
      "- route-card.md",
      "## Residual Risks",
      "- Helper output remains advisory.",
      "## Verdict",
      "pass",
      "",
    ].join("\n"),
  );
  await writeFixture(
    tmpdir,
    `${session}/execution-report.md`,
    [
      "# Execution Report",
      "",
      "## Approved Scope",
      "docs and skills.",
      "## Execution Strategy",
      "Strategy: inline",
      "Reason: one lead worker owned this compact fixture.",
      "Parallel Safety Check: skipped - no parallel workers were launched.",
      "## Work Items Completed",
      "- WI-001: completed.",
      "## Worker Lifecycle",
      "- verifier-1: simulated - verification.md exists.",
      "## Changed Paths",
      "- skills/helmsman-autopilot/SKILL.md",
      "## Commands Run",
      "- validate-skill-session: pass - example session accepted.",
      "## Integration And Collision Handling",
      "- None - inline execution touched one checkout.",
      "## Worker Reports",
      "- verifier-1 completed verification.md.",
      "## Deviations",
      "- None.",
      "## Evidence For Verification",
      "- verification.md",
      "## Next Step",
      "helmsman-verify",
      "",
    ].join("\n"),
  );
  await writeFixture(
    tmpdir,
    `${session}/retro.md`,
    [
      "# Retro",
      "",
      "## Objective",
      "Helmsman pivot.",
      "## Final Outcome",
      "Artifacts can be validated.",
      "## What Changed",
      "Added skills and gates.",
      "## Verification Evidence",
      "Validator passes.",
      "## Decisions That Mattered",
      "No mandatory Ask UI.",
      "## Reusable Lessons",
      "- Keep harnessing artifact based.",
      "## Promoted Memory Candidates",
      "### Memory Candidate: helmsman-validator",
      "Type: workflow-rule",
      "Stability: durable",
      "Trigger: future Helmsman session validation",
      "Symptom: agent may trust worker completion without artifacts",
      "Cause: missing deterministic artifact gate",
      "Fix: run validate-skill-session before completion",
      "Future use: reject incomplete session artifacts",
      "Source artifact: verification.md",
      "Promotion verdict: promote",
      "## Follow-Up Work",
      "- Tighten helper projection boundaries.",
      "",
    ].join("\n"),
  );
  return root;
}

describe("Helmsman session validator", () => {
  test("accepts a complete retro-stage artifact set", async ({ tmpdir }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    const { stdout } = await runValidator(sessionDir, "retro");
    expect(stdout).toContain("skill session check pass");
  });

  test("rejects charting handoff without question bundle evidence", async ({ tmpdir }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await rm(join(sessionDir, "question-bundles.md"));

    await expect(runValidator(sessionDir, "charting")).rejects.toMatchObject({
      stderr: expect.stringContaining("question-bundles.md is missing"),
    });
  });

  test("rejects blocked decision bundle without native question surface replay evidence", async ({
    tmpdir,
  }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/question-bundles.md",
      [
        "# Question Bundles",
        "",
        "## C-001 Aperture Question Bundle",
        "",
        "Bundle type: aperture",
        "Bundle review: answered",
        "",
        "### Native Question Surface",
        "",
        "Surface status: answered",
        "Rendered in native chat: yes",
        "Rendered message reference: assistant message before decision bundle",
        "Native transcript evidence: evidence/native-chat-transcript.jsonl#assistant-decision-prereq",
        "Covered questions: Q1",
        "Covered options: Q1=A/B/C",
        "Recommendation shown: yes",
        "Reasons shown: yes",
        "Tradeoffs shown: yes",
        "Route effects shown: yes",
        "Free-form override shown: yes",
        "User answer source: native chat accepted A",
        "User answer evidence: evidence/native-chat-transcript.jsonl#user-decision-prereq",
        "",
        "### Q1",
        "",
        "Question:",
        "Should the session ask a decision bundle after research?",
        "",
        "Why this matters:",
        "It establishes a valid aperture before testing the decision bundle.",
        "",
        "A. Ask a decision bundle after research. (Recommended)",
        "   Reason: Research left user-owned route authority.",
        "   Tradeoff: It requires one more native answer.",
        "   What this answer changes: Decision Bundle C-002 becomes required.",
        "",
        "B. Skip the decision bundle.",
        "   Reason: It is faster.",
        "   Tradeoff: User-owned route authority remains unresolved.",
        "   What this answer changes: Route Lock would be unsafe.",
        "",
        "C. Return to broad research.",
        "   Reason: It may uncover more evidence.",
        "   Tradeoff: It delays the actual user-owned choice.",
        "   What this answer changes: Charting loops instead of asking C-002.",
        "",
        "Free-form answers are welcome if the frame is wrong or options should be mixed.",
        "",
        "User answer:",
        "A. Ask a decision bundle after research.",
        "",
        "Route effect:",
        "Decision Bundle C-002 is required.",
        "",
        "## C-002 Decision Question Bundle",
        "",
        "Bundle type: decision",
        "Bundle review: blocked",
        "",
        "### Q1",
        "",
        "Question:",
        "Which implementation route should Autopilot receive?",
        "",
        "Why this matters:",
        "Autopilot can execute divergent destinations if this is not answered.",
        "",
        "A. Validator-backed native replay guard. (Recommended)",
        "   Reason: It closes the observed failure without adding UI.",
        "   Tradeoff: Artifact writers must record replay evidence.",
        "   What this answer changes: Route Lock waits for native replay evidence.",
        "",
        "B. Documentation-only warning.",
        "   Reason: It is cheap.",
        "   Tradeoff: It does not prevent recurrence.",
        "   What this answer changes: Validators still allow drift.",
        "",
        "C. Custom Ask UI.",
        "   Reason: It makes options structurally visible.",
        "   Tradeoff: It is outside this issue's non-goals.",
        "   What this answer changes: Scope expands beyond Charting artifacts.",
        "",
        "Free-form answers are welcome if the frame is wrong or options should be mixed.",
        "",
        "User answer:",
        "pending",
        "",
        "Route effect:",
        "pending",
        "",
      ].join("\n"),
    );
    await writeFixture(
      tmpdir,
      "session-helmsman/evidence/native-chat-transcript.jsonl",
      [
        JSON.stringify({
          id: "assistant-decision-prereq",
          role: "assistant",
          surface: "native-chat",
          text: [
            "Question: Should the session ask a decision bundle after research?",
            "A. Ask a decision bundle after research. (Recommended)",
            "Reason: Research left user-owned route authority.",
            "Tradeoff: It requires one more native answer.",
            "What this answer changes: Decision Bundle C-002 becomes required.",
            "B. Skip the decision bundle.",
            "Reason: It is faster.",
            "Tradeoff: User-owned route authority remains unresolved.",
            "What this answer changes: Route Lock would be unsafe.",
            "C. Return to broad research.",
            "Reason: It may uncover more evidence.",
            "Tradeoff: It delays the actual user-owned choice.",
            "What this answer changes: Charting loops instead of asking C-002.",
            "Free-form answers are welcome if the frame is wrong or options should be mixed.",
          ].join("\n"),
        }),
        JSON.stringify({
          id: "user-decision-prereq",
          role: "user",
          surface: "native-chat",
          text: "A. Ask a decision bundle after research.",
        }),
      ].join("\n"),
    );

    await expect(runValidator(sessionDir, "charting")).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "question-bundles.md C-002 missing heading 'Native Question Surface'",
      ),
    });
  });

  test("rejects question bundle options without reason tradeoff and route effect", async ({
    tmpdir,
  }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    const incomplete = [
      "# Question Bundles",
      "",
      "## C-001 Aperture Question Bundle",
      "",
      "Bundle type: aperture",
      "Bundle review: answered",
      "",
      "### Native Question Surface",
      "",
      "Surface status: answered",
      "Rendered in native chat: yes",
      "Rendered message reference: assistant message",
      "Native transcript evidence: evidence/native-chat-transcript.jsonl#assistant-incomplete-options",
      "Covered questions: Q1",
      "Covered options: Q1=A/B/C",
      "Recommendation shown: yes",
      "Reasons shown: yes",
      "Tradeoffs shown: yes",
      "Route effects shown: yes",
      "Free-form override shown: yes",
      "User answer source: native chat accepted A",
      "User answer evidence: evidence/native-chat-transcript.jsonl#user-incomplete-options",
      "",
      "### Q1",
      "",
      "Question:",
      "Should the validator enforce native replay evidence?",
      "",
      "Why this matters:",
      "It blocks incomplete user authority.",
      "",
      "A. Enforce native replay evidence. (Recommended)",
      "   Reason: It catches the bug.",
      "   Tradeoff: It requires explicit recording.",
      "   What this answer changes: Handoff is blocked without evidence.",
      "",
      "B. Keep current validation.",
      "   Tradeoff: It allows the bug.",
      "   What this answer changes: Nothing blocks drift.",
      "",
      "C. Add UI.",
      "   Reason: It exposes options.",
      "   Tradeoff: It expands scope.",
      "   What this answer changes: Adds a new surface.",
      "",
      "Free-form answers are welcome if the frame is wrong or options should be mixed.",
      "",
      "User answer:",
      "A. Enforce native replay evidence.",
      "",
      "Route effect:",
      "Route can proceed only after replay evidence exists.",
      "",
    ].join("\n");
    await writeFixture(tmpdir, "session-helmsman/question-bundles.md", incomplete);
    await writeFixture(
      tmpdir,
      "session-helmsman/evidence/native-chat-transcript.jsonl",
      [
        JSON.stringify({
          id: "assistant-incomplete-options",
          role: "assistant",
          surface: "native-chat",
          text: [
            "Question: Should the validator enforce native replay evidence?",
            "A. Enforce native replay evidence. (Recommended)",
            "Reason: It catches the bug.",
            "Tradeoff: It requires explicit recording.",
            "What this answer changes: Handoff is blocked without evidence.",
            "B. Keep current validation.",
            "Tradeoff: It allows the bug.",
            "What this answer changes: Nothing blocks drift.",
            "C. Add UI.",
            "Reason: It exposes options.",
            "Tradeoff: It expands scope.",
            "What this answer changes: Adds a new surface.",
            "Free-form answers are welcome if the frame is wrong or options should be mixed.",
          ].join("\n"),
        }),
        JSON.stringify({
          id: "user-incomplete-options",
          role: "user",
          surface: "native-chat",
          text: "A. Enforce native replay evidence.",
        }),
      ].join("\n"),
    );

    await expect(runValidator(sessionDir, "charting")).rejects.toMatchObject({
      stderr: expect.stringContaining("question-bundles.md C-001 Q1 option B missing 'Reason:'"),
    });
  });

  test("rejects answered native surface without transcript evidence artifact", async ({
    tmpdir,
  }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await rm(join(sessionDir, "evidence/native-chat-transcript.jsonl"));

    await expect(runValidator(sessionDir, "charting")).rejects.toMatchObject({
      stderr: expect.stringContaining("evidence/native-chat-transcript.jsonl is missing"),
    });
  });

  test("rejects transcript evidence that omits a rendered option", async ({ tmpdir }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/evidence/native-chat-transcript.jsonl",
      [
        JSON.stringify({
          id: "assistant-c001",
          role: "assistant",
          surface: "native-chat",
          text: [
            "Question: Should Helmsman keep native chat as the question surface while artifacts record evidence?",
            "A. Keep native chat as question surface and artifacts as replay evidence. (Recommended)",
            "Reason: It preserves user authority without adding a custom Ask UI.",
            "Tradeoff: The lead must record the rendered surface explicitly.",
            "What this answer changes: Validator can block handoff when replay evidence is missing.",
            "Free-form answers are welcome if the frame is wrong or options should be mixed.",
          ].join("\n"),
        }),
        JSON.stringify({
          id: "user-c001",
          role: "user",
          surface: "native-chat",
          text: "A. Keep native chat as question surface and artifacts as replay evidence.",
        }),
      ].join("\n"),
    );

    await expect(runValidator(sessionDir, "charting")).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "question-bundles.md C-001 Q1 transcript evidence missing option B",
      ),
    });
  });

  test("rejects missing route-card fields before autonomy", async ({ tmpdir }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/route-card.md",
      "# Route Card\n\n## User Intent\nOnly intent is present.\n",
    );

    await expect(runValidator(sessionDir, "charting")).rejects.toMatchObject({
      stderr: expect.stringContaining("route-card.md missing heading 'Scope'"),
    });
  });

  test("rejects map projection whose stage and current checkpoint disagree", async ({
    tmpdir,
  }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/map.json",
      JSON.stringify(
        {
          schemaVersion: 1,
          stage: "research",
          status: "complete",
          checkpoints: ["charting", "research", "autopilot", "verify", "retro"],
          currentCheckpoint: "retro",
          requiredArtifacts: ["contract.md"],
          presentArtifacts: ["contract.md"],
          missingArtifacts: [],
          openQuestions: [],
          blockedReason: null,
          nextSkill: "none",
        },
        null,
        2,
      ),
    );

    await expect(runValidator(sessionDir, "charting")).rejects.toMatchObject({
      stderr: expect.stringContaining("map.json stage must match currentCheckpoint"),
    });
  });

  test("accepts explicit autopilot internal stage when required artifact is present", async ({
    tmpdir,
  }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/contract.md",
      [
        "Current stage: autopilot",
        "Autopilot stage: blueprint",
        "Allowed actions: compile director blueprint and plan",
        "Forbidden actions: execute source edits before audit",
        "Required artifacts: director-blueprint.md, plan.md",
        "Exit gate: blueprint and plan satisfy work item contract",
        "Next owner: lead worker",
        "",
      ].join("\n"),
    );
    await writeFixture(
      tmpdir,
      "session-helmsman/map.json",
      JSON.stringify(
        {
          schemaVersion: 1,
          stage: "autopilot",
          autopilotStage: "blueprint",
          status: "ready",
          checkpoints: ["charting", "research", "autopilot", "verify", "retro"],
          currentCheckpoint: "autopilot",
          requiredArtifacts: ["director-blueprint.md", "plan.md"],
          presentArtifacts: ["director-blueprint.md", "plan.md"],
          missingArtifacts: [],
          openQuestions: [],
          blockedReason: null,
          nextSkill: "helmsman-autopilot",
        },
        null,
        2,
      ),
    );

    const { stdout } = await runValidator(sessionDir, "autopilot");
    expect(stdout).toContain("skill session check pass");
  });

  test("rejects autopilot plan without execution strategy", async ({ tmpdir }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/plan.md",
      [
        "# Plan",
        "",
        "## Route Summary",
        "Helmsman path.",
        "## Work Items",
        "## Work Item: WI-001",
        "Owner: lead worker",
        "Allowed write scope: docs and skills",
        "Inputs: route-card.md, evidence/source.md",
        "Exact changes: add split skills and gates",
        "Expected evidence: validator passes",
        "Dependency: none",
        "Rollback: revert docs if invalid",
        "Verification scenario links: SC-001",
        "## Dependencies",
        "- None.",
        "## Allowed Write Scope",
        "- docs and skills.",
        "## Worker Assignments",
        "- verifier-1 checks scenarios.",
        "## Verification Scenarios",
        "- session validator passes.",
        "## Risks And Rollback",
        "- Revert docs if invalid.",
        "",
      ].join("\n"),
    );

    await expect(runValidator(sessionDir, "autopilot")).rejects.toMatchObject({
      stderr: expect.stringContaining("plan.md missing heading 'Execution Strategy'"),
    });
  });

  test("rejects autopilot stage without matching contract stage", async ({ tmpdir }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/contract.md",
      [
        "Current stage: autopilot",
        "Autopilot stage: strategy",
        "Allowed actions: compile director blueprint and plan",
        "Forbidden actions: execute source edits before audit",
        "Required artifacts: director-blueprint.md, plan.md",
        "Exit gate: blueprint and plan satisfy work item contract",
        "Next owner: lead worker",
        "",
      ].join("\n"),
    );
    await writeFixture(
      tmpdir,
      "session-helmsman/map.json",
      JSON.stringify(
        {
          schemaVersion: 1,
          stage: "autopilot",
          autopilotStage: "blueprint",
          status: "ready",
          checkpoints: ["charting", "research", "autopilot", "verify", "retro"],
          currentCheckpoint: "autopilot",
          requiredArtifacts: ["director-blueprint.md", "plan.md"],
          presentArtifacts: ["director-blueprint.md", "plan.md"],
          missingArtifacts: [],
          openQuestions: [],
          blockedReason: null,
          nextSkill: "helmsman-autopilot",
        },
        null,
        2,
      ),
    );

    await expect(runValidator(sessionDir, "autopilot")).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "contract.md Autopilot stage must match map.json autopilotStage",
      ),
    });
  });

  test("rejects autopilot blueprint stage without director blueprint artifact", async ({
    tmpdir,
  }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/contract.md",
      [
        "Current stage: autopilot",
        "Autopilot stage: blueprint",
        "Allowed actions: compile director blueprint and plan",
        "Forbidden actions: execute source edits before audit",
        "Required artifacts: director-blueprint.md, plan.md",
        "Exit gate: blueprint and plan satisfy work item contract",
        "Next owner: lead worker",
        "",
      ].join("\n"),
    );
    await writeFixture(
      tmpdir,
      "session-helmsman/map.json",
      JSON.stringify(
        {
          schemaVersion: 1,
          stage: "autopilot",
          autopilotStage: "blueprint",
          status: "blocked",
          checkpoints: ["charting", "research", "autopilot", "verify", "retro"],
          currentCheckpoint: "autopilot",
          requiredArtifacts: ["director-blueprint.md", "plan.md"],
          presentArtifacts: ["plan.md"],
          missingArtifacts: ["director-blueprint.md"],
          openQuestions: [],
          blockedReason: "director blueprint missing",
          nextSkill: "helmsman-autopilot",
        },
        null,
        2,
      ),
    );
    await writeFixture(tmpdir, "session-helmsman/director-blueprint.md", "");

    await expect(runValidator(sessionDir, "autopilot")).rejects.toMatchObject({
      stderr: expect.stringContaining("director-blueprint.md is empty"),
    });
  });

  test("accepts a workflow closed by retro when validating through retro stage", async ({
    tmpdir,
  }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/contract.md",
      [
        "Current stage: closed",
        "Allowed actions: inspect closed artifacts only",
        "Forbidden actions: edit source or claim new work",
        "Required artifacts: route-card, plan, verification, retro",
        "Exit gate: workflow is already closed",
        "Next owner: future lead worker",
        "",
      ].join("\n"),
    );
    await writeFixture(
      tmpdir,
      "session-helmsman/map.json",
      JSON.stringify(
        {
          schemaVersion: 1,
          stage: "closed",
          status: "closed",
          checkpoints: ["charting", "research", "autopilot", "verify", "retro"],
          currentCheckpoint: "closed",
          requiredArtifacts: [
            "contract.md",
            "map.json",
            "route-card.md",
            "evidence/source.md",
            "plan.md",
            "verification.md",
            "retro.md",
          ],
          presentArtifacts: [
            "contract.md",
            "map.json",
            "route-card.md",
            "evidence/source.md",
            "plan.md",
            "verification.md",
            "retro.md",
          ],
          missingArtifacts: [],
          openQuestions: [],
          blockedReason: null,
          nextSkill: "none",
        },
        null,
        2,
      ),
    );

    const { stdout } = await runValidator(sessionDir, "retro");
    expect(stdout).toContain("skill session check pass");
  });

  test("rejects route-card handoff headings without handoff fields", async ({ tmpdir }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/route-card.md",
      [
        "# Route Card",
        "",
        "## User Intent",
        "Create a Helmsman workflow.",
        "## Scope",
        "Split skills and artifact gates.",
        "## Non-Goals",
        "No separate UI authority.",
        "## Decisions",
        "Use native chat for questions.",
        "## Aperture Bundles",
        "Bundle Density Read: minimal - handoff-field validation fixture.",
        "Aperture bundle status: answered - fixture keeps route scope narrow.",
        "Aperture native surface: answered with question-bundles.md#c-001 evidence.",
        "## Research Lane Contract",
        "Research lanes: validator route-card contract.",
        "Parallel research posture: lead-only - handoff fixture has no independent lane.",
        "Research worker packets: none - handoff fixture does not launch workers.",
        "Lead-only lanes: validator route-card contract because it is local and tiny.",
        "Research index: research-index.md",
        "Research artifacts: research/source.md",
        "Max active lanes: 6 unless user-approved.",
        "Topic-to-artifact map: source -> validator contract -> research/source.md.",
        "Skipped lanes: implementation details.",
        "## Decision Bundles",
        "Decision bundle status: not-needed - no remaining user-owned decision after C-001.",
        "Decision native surface: not-needed - no remaining user-owned decision after C-001.",
        "## Open Questions",
        "No open questions.",
        "## Risks",
        "Worker drift.",
        "## Success Criteria",
        "A fresh lead worker can resume from artifacts.",
        "## Verification Scenarios",
        "- Scenario ID: SC-001",
        "  Route Scenario: validator accepts the session.",
        "## Next Recommended Skill",
        "helmsman-autopilot",
        "## Handoff",
        "Next skill: helmsman-autopilot",
        "",
      ].join("\n"),
    );

    await expect(runValidator(sessionDir, "charting")).rejects.toMatchObject({
      stderr: expect.stringContaining("route-card.md missing 'Input artifact:'"),
    });
  });

  test("rejects charting route-card without aperture bundle contract", async ({
    tmpdir,
  }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/route-card.md",
      [
        "# Route Card",
        "",
        "## User Intent",
        "Create a Helmsman workflow.",
        "## Scope",
        "Split skills and artifact gates.",
        "## Non-Goals",
        "No separate UI authority.",
        "## Decisions",
        "Use native chat for questions.",
        "## Open Questions",
        "No open questions.",
        "## Risks",
        "Worker drift.",
        "## Success Criteria",
        "A fresh lead worker can resume from artifacts.",
        "## Verification Scenarios",
        "- Scenario ID: SC-001",
        "  Route Scenario: validator accepts the session.",
        "## Next Recommended Skill",
        "helmsman-charting",
        "## Handoff",
        "Next skill: helmsman-charting",
        "Input artifact: route-card.md",
        "Already satisfied: scope and success criteria are recorded",
        "Deferred questions: none",
        "Carrier warning: do not skip route questions",
        "Expected output: evidence/*.md",
        "",
      ].join("\n"),
    );

    await expect(runValidator(sessionDir, "charting")).rejects.toMatchObject({
      stderr: expect.stringContaining("route-card.md missing heading 'Aperture Bundles'"),
    });
  });

  test("rejects charting route-card without parallel research posture", async ({
    tmpdir,
  }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/route-card.md",
      [
        "# Route Card",
        "",
        "## User Intent",
        "Create a Helmsman workflow.",
        "## Scope",
        "Split skills and artifact gates.",
        "## Non-Goals",
        "No separate UI authority.",
        "## Decisions",
        "Use native chat for questions.",
        "## Aperture Bundles",
        "Bundle Density Read: minimal - route and evidence target are already narrow.",
        "Aperture bundle status: answered - user approved artifact authority and native chat.",
        "Aperture native surface: answered with question-bundles.md#c-001 evidence.",
        "## Research Lane Contract",
        "Research lanes: source-of-truth lane.",
        "Skipped lanes: old CLI reversion.",
        "## Decision Bundles",
        "Decision bundle status: not-needed - no remaining user-owned decision after C-001.",
        "Decision native surface: not-needed - no remaining user-owned decision after C-001.",
        "## Open Questions",
        "No open questions.",
        "## Risks",
        "Worker drift.",
        "## Success Criteria",
        "A fresh lead worker can resume from artifacts.",
        "## Verification Scenarios",
        "- Scenario ID: SC-001",
        "  Route Scenario: validator accepts the session.",
        "## Next Recommended Skill",
        "helmsman-autopilot",
        "## Handoff",
        "Next skill: helmsman-autopilot",
        "Input artifact: route-card.md and evidence/source.md",
        "Already satisfied: scope, evidence, and success criteria are recorded",
        "Deferred questions: none",
        "Carrier warning: do not skip parallel research posture",
        "Expected output: plan.md",
        "",
      ].join("\n"),
    );

    await expect(runValidator(sessionDir, "charting")).rejects.toMatchObject({
      stderr: expect.stringContaining("route-card.md missing 'Parallel research posture:'"),
    });
  });

  test("rejects collapsed research findings without observation and inference split", async ({
    tmpdir,
  }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/evidence/source.md",
      [
        "# Evidence",
        "",
        "## Source",
        "- SKILL.md",
        "## Question",
        "Which protocol authority should own the workflow?",
        "## Lane Type",
        "source-of-truth",
        "## Sources Checked",
        "- SKILL.md",
        "## Findings",
        "- The root skill routes to split skills.",
        "## Uncertainty",
        "No unresolved evidence uncertainty.",
        "## Decision Impact",
        "Keep validation artifact-based.",
        "## Route Changes Required",
        "No route changes required.",
        "## Recommended Next Step",
        "Continue to helmsman-autopilot.",
        "",
      ].join("\n"),
    );

    await expect(runValidator(sessionDir, "research")).rejects.toMatchObject({
      stderr: expect.stringContaining("evidence/source.md missing heading 'Observations'"),
    });
  });

  test("rejects autopilot plan work items without exact owner and evidence fields", async ({
    tmpdir,
  }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/plan.md",
      [
        "# Plan",
        "",
        "## Route Summary",
        "Helmsman path.",
        "## Execution Strategy",
        "Strategy: inline",
        "Reason: one lead worker owns this compact fixture.",
        "File-to-work-item map: WI-001 owns docs and skills.",
        "Integration order: lead worker writes artifacts then validates them.",
        "## Work Items",
        "- Add split skills.",
        "## Dependencies",
        "- None.",
        "## Allowed Write Scope",
        "- docs and skills.",
        "## Worker Assignments",
        "- verifier-1 checks scenarios.",
        "## Verification Scenarios",
        "- SC-001",
        "## Risks And Rollback",
        "- Revert docs if invalid.",
        "",
      ].join("\n"),
    );

    await expect(runValidator(sessionDir, "autopilot")).rejects.toMatchObject({
      stderr: expect.stringContaining("plan.md missing 'Owner:'"),
    });
  });

  test("rejects audit without exact revise or proceed verdict", async ({ tmpdir }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/audit.md",
      "# Audit\n\nPlan is coherent enough for verification.\n",
    );

    await expect(runValidator(sessionDir, "autopilot")).rejects.toMatchObject({
      stderr: expect.stringContaining("audit.md missing 'Verdict: revise|proceed'"),
    });
  });

  test("rejects verification that omits a route scenario id", async ({ tmpdir }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/verification.md",
      [
        "# Verification",
        "",
        "## Route Promise",
        "Artifacts define the workflow.",
        "## Scenario Matrix",
        "| Scenario ID | Route Scenario | Evidence | Result | Notes |",
        "| --- | --- | --- | --- | --- |",
        "| SC-999 | unrelated scenario | command output | pass | wrong row |",
        "## Commands Run",
        "- validate-skill-session",
        "## Files Inspected",
        "- route-card.md",
        "## Residual Risks",
        "- Helper output remains advisory.",
        "## Verdict",
        "pass",
        "",
      ].join("\n"),
    );

    await expect(runValidator(sessionDir, "verify")).rejects.toMatchObject({
      stderr: expect.stringContaining("verification.md missing route scenario id SC-001"),
    });
  });

  test("rejects promoted memory candidate without source artifact", async ({ tmpdir }) => {
    const sessionDir = await writeCompleteSession(tmpdir);
    await writeFixture(
      tmpdir,
      "session-helmsman/retro.md",
      [
        "# Retro",
        "",
        "## Objective",
        "Helmsman pivot.",
        "## Final Outcome",
        "Artifacts can be validated.",
        "## What Changed",
        "Added skills and gates.",
        "## Verification Evidence",
        "Validator passes.",
        "## Decisions That Mattered",
        "No mandatory Ask UI.",
        "## Reusable Lessons",
        "- Keep harnessing artifact based.",
        "## Promoted Memory Candidates",
        "### Memory Candidate: helmsman-validator",
        "Type: workflow-rule",
        "Stability: durable",
        "Trigger: future Helmsman session validation",
        "Symptom: agent may trust worker completion without artifacts",
        "Cause: missing deterministic artifact gate",
        "Fix: run validate-skill-session before completion",
        "Future use: reject incomplete session artifacts",
        "Promotion verdict: promote",
        "## Follow-Up Work",
        "- Tighten helper projection boundaries.",
        "",
      ].join("\n"),
    );

    await expect(runValidator(sessionDir, "retro")).rejects.toMatchObject({
      stderr: expect.stringContaining("retro.md memory candidate missing 'Source artifact:'"),
    });
  });
});
