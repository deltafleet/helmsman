import { execFile } from "node:child_process";
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
      "## Research Lane Contract",
      "Research lanes: source-of-truth lane over SKILL.md, route-card.md, and validator behavior.",
      "Skipped lanes: UI/runtime restoration and old state-machine surfaces.",
      "## Decision Bundles",
      "Decision bundle status: answered - keep artifacts as authority and proceed to research.",
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
        "## Research Lane Contract",
        "Research lanes: validator route-card contract.",
        "Skipped lanes: implementation details.",
        "## Decision Bundles",
        "Decision bundle status: answered - proceed with validator fixture.",
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
