import { describe, expect, test } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const SKILL_NAMES = [
  "helmsman-charting",
  "helmsman-autopilot",
  "helmsman-verify",
] as const;

async function readPackageJson() {
  return JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
}

function frontmatter(body: string): string {
  const match = body.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error("missing frontmatter");
  return match[1] ?? "";
}

describe("Helmsman docs", () => {
  test("root skill routes to the public split-skill surface", async () => {
    const root = await readFile(join(ROOT, "SKILL.md"), "utf8");

    expect(root).toContain("Helmsman protocol workspace");
    expect(root).toContain("Do not require a separate UI surface");
    expect(root).toContain("Autopilot coordinates strategy, blueprinting, audit, execution, and repair");
    expect(root).toContain("validate:skill-session");
    expect(root).toContain("render:skill-status");
    expect(root).toContain("build:plugin");
    expect(root).toContain("verify:plugin");
    expect(root).toContain("verify:version");
    expect(root).toContain("render:plugin-status");
    expect(root).toContain("helmsman doctor");
    expect(root).toContain("Do not run `helmsman update` unless the user explicitly asks");
    expect(root).toContain("docs/release-guards.md");
    expect(root).not.toContain("competitive-dogfood");
    expect(root).not.toContain("render:completion-status");
    expect(root).not.toContain("audit:active-goal");

    for (const name of SKILL_NAMES) {
      expect(root).toContain(`skills/${name}/SKILL.md`);
    }
  });

  test("split skills have valid frontmatter and focused responsibilities", async () => {
    const entries = await readdir(join(ROOT, "skills"));
    expect(entries.sort()).toEqual([...SKILL_NAMES].sort());

    for (const name of SKILL_NAMES) {
      const body = await readFile(join(ROOT, "skills", name, "SKILL.md"), "utf8");
      const fm = frontmatter(body);
      const ui = await readFile(join(ROOT, "skills", name, "agents/openai.yaml"), "utf8");

      expect(fm).toContain(`name: ${name}`);
      expect(fm).toMatch(/description:/);
      expect(body).toContain("contract.md");
      expect(body).toContain("helmsman doctor");
      expect(body).toContain("Do not run `helmsman update` without explicit user approval");
      expect(body).not.toMatch(/helmsman next --json/);
      expect(ui).toContain("interface:");
      expect(ui).toContain("display_name:");
      expect(ui).toContain("short_description:");
      expect(ui).toContain(`Use $${name}`);
    }
  });

  test("charting skill documents the always-aperture route contract", async () => {
    const charting = await readFile(
      join(ROOT, "skills", "helmsman-charting", "SKILL.md"),
      "utf8",
    );
    const template = await readFile(
      join(ROOT, "skills", "helmsman-charting", "templates", "route-card.md"),
      "utf8",
    );

    expect(charting).toContain("Aperture Bundle is always required before Research");
    expect(charting).toContain("Bundle Density Read only decides how many Aperture questions");
    expect(charting).toContain("Ask as many bundles as needed");
    expect(charting).toContain("Limit each bundle to at most 4 questions");
    expect(charting).toContain("Free-form answers are welcome");
    expect(charting).toContain("Research Lane Execution");
    expect(charting).toContain("Do not research from a vague Initial Query");
    expect(charting).toContain("Do not hand-author `route-card.md` from memory");
    expect(charting).toContain("run `bun run validate:skill-session -- .helmsman/sessions/<session-id> --stage charting`");
    expect(charting).toContain("Repair missing route-card fields and rerun validation");
    expect(template).toContain("## Aperture Bundles");
    expect(template).toContain("## Research Lane Contract");
    expect(template).toContain("## Decision Bundles");
  });

  test("charting skill makes parallel research the default operating contract", async () => {
    const root = await readFile(join(ROOT, "SKILL.md"), "utf8");
    const charting = await readFile(
      join(ROOT, "skills", "helmsman-charting", "SKILL.md"),
      "utf8",
    );
    const template = await readFile(
      join(ROOT, "skills", "helmsman-charting", "templates", "route-card.md"),
      "utf8",
    );
    const protocol = await readFile(join(ROOT, "docs", "helmsman-protocol.md"), "utf8");

    expect(charting).toContain("Parallel research is the default");
    expect(charting).toContain("one research worker per independent lane");
    expect(charting).toContain("Max active research lanes: 6");
    expect(charting).toContain("spawn all launchable research workers in parallel");
    expect(charting).toContain("host-neutral research worker packets");
    expect(charting).toContain("Do not let the lead worker silently absorb parallelizable research");
    expect(charting).toContain("research-index.md");
    expect(charting).toContain("worker-packets.md");
    expect(charting).toContain("research/<slug>.md");

    expect(template).toContain("Parallel research posture:");
    expect(template).toContain("Research worker packets:");
    expect(template).toContain("Lead-only lanes:");
    expect(template).toContain("Research index: research-index.md");
    expect(template).toContain("Research artifacts: research/<slug>.md");
    expect(template).toContain("Max active lanes: 6 unless user-approved");
    expect(template).toContain("Topic-to-artifact map:");

    expect(protocol).toContain("Parallel research is a first-class Charting contract");
    expect(protocol).toContain("Codex and Claude execute the same host-neutral worker packets");
    expect(protocol).toContain("research-index.md accounts for every selected topic");
    expect(protocol).toContain("worker-packets.md records the parallel launch group");
    expect(protocol).toContain("one research/<slug>.md artifact");

    expect(root).toContain("research-index.md");
    expect(root).toContain("worker-packets.md");
    expect(root).toContain("research/");
  });

  test("native goal flow binds the recursive Charting loop contract", async () => {
    const charting = await readFile(
      join(ROOT, "skills", "helmsman-charting", "SKILL.md"),
      "utf8",
    );
    const protocol = await readFile(join(ROOT, "docs", "helmsman-protocol.md"), "utf8");
    const goal = await readFile(
      join(ROOT, "skills", "helmsman-charting", "templates", "goal.md"),
      "utf8",
    );
    const charter = await readFile(
      join(ROOT, "skills", "helmsman-charting", "templates", "goal-charter.md"),
      "utf8",
    );
    const stop = await readFile(
      join(ROOT, "skills", "helmsman-charting", "templates", "stop-conditions.md"),
      "utf8",
    );

    for (const body of [charting, protocol, goal, charter]) {
      expect(body).toContain("charting-loop.md");
      expect(body).toContain("question-bundles.md");
      expect(body).toContain("memory-scan.md");
    }

    expect(goal).toContain("Signal Read -> Aperture Question Bundle");
    expect(goal).toContain("Scoped Memory Scan before Research Lanes");
    expect(goal).toContain("repeat question, memory, research, synthesis, and sharpness cycles");
    expect(goal).toContain("Route Lock is forbidden while Autopilot could reasonably execute a different destination");

    expect(charter).toContain("broad Memory Scan before the first Aperture Question Bundle is forbidden");
    expect(charter).toContain("Research Lanes only handle stale, missing, or conflicting prior memory");
    expect(stop).toContain("Broad Memory Scan would run before the first Aperture Question Bundle");
    expect(stop).toContain("Route Lock would happen before a Sharpness Check");
  });

  test("specialist role sidecars preserve host-neutral subagent definitions", async () => {
    const researcher = await readFile(
      join(ROOT, "skills", "helmsman-charting", "roles", "researcher.md"),
      "utf8",
    );
    expect(researcher).toContain("Role: researcher");
    expect(researcher).toContain("Charting research worker");
    expect(researcher).toContain("Codex");
    expect(researcher).toContain("Claude");
    expect(researcher).toContain("research/<slug>.md");
    expect(researcher).toContain("research-index.md");
    expect(researcher).toContain("No project-norms injection");

    for (const role of ["strategist", "director", "auditor", "implementor"]) {
      const body = await readFile(
        join(ROOT, "skills", "helmsman-autopilot", "roles", `${role}.md`),
        "utf8",
      );
      expect(body).toContain(`Role: ${role}`);
      expect(body).toContain("Host defaults");
      expect(body).toContain("Codex");
      expect(body).toContain("Claude");
      expect(body).toContain("Required output");
    }
  });

  test("package surface exposes public launch scripts only", async () => {
    const packageJson = await readPackageJson();

    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(packageJson.bin).toEqual({ helmsman: "bin/helmsman.mjs" });
    expect(packageJson.scripts).toMatchObject({
      "check:helmsman": "bun scripts/check-helmsman.mjs",
      "verify:plugin": "bun run build:plugin && bun scripts/verify-plugin.mjs",
      "verify:version": "bun scripts/verify-version-consistency.mjs",
      "verify:ci": "bun scripts/verify-ci.mjs",
      "verify:helmsman": "bun scripts/verify-helmsman.mjs",
    });
    expect(packageJson.scripts["dogfood:helmsman"]).toBeUndefined();
    expect(packageJson.scripts["audit:active-goal"]).toBeUndefined();
    expect(packageJson.scripts["audit:competitive-benchmark"]).toBeUndefined();
  });

  test("public docs explain distribution and release without private run history", async () => {
    const english = await readFile(join(ROOT, "README.md"), "utf8");
    const korean = await readFile(join(ROOT, "README.ko.md"), "utf8");
    const distribution = await readFile(join(ROOT, "docs/distribution.md"), "utf8");
    const guards = await readFile(join(ROOT, "docs/release-guards.md"), "utf8");
    const packageJson = await readPackageJson();

    expect(english).toContain("## Host Model");
    expect(english).toContain("## Release Boundary");
    expect(english).toContain("Always Aperture");
    expect(english).toContain("Bundle Density Read");
    expect(english).toContain("docs/distribution.md");
    expect(english).not.toContain("completedRuns=0/12");
    expect(english).not.toContain("competitive-dogfood");

    expect(korean).toContain("## 호스트 모델");
    expect(korean).toContain("## 릴리즈 경계");
    expect(korean).toContain("Always Aperture");
    expect(korean).toContain("Bundle Density Read");
    expect(korean).toContain("docs/distribution.md");
    expect(korean).not.toContain("completedRuns=0/12");
    expect(korean).not.toContain("competitive-dogfood");

    expect(distribution).toContain("npx @deltafleet/helmsman install");
    expect(distribution).toContain("npx @deltafleet/helmsman doctor");
    expect(distribution).toContain("helmsman update");
    expect(distribution).toContain("first skill entry");
    expect(distribution).toContain("bun run verify:version");
    expect(distribution).not.toContain("bun run install:plugin -- --target-home --force");

    expect(guards).toContain("Public Release Checklist");
    expect(guards).toContain("npm publish --access public");
    expect(guards).toContain(`git tag v${packageJson.version}`);
    expect(guards).not.toContain("OMX");
    expect(guards).not.toContain("Superpowers");
  });
});
