import { describe, expect, test } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const SKILL_NAMES = [
  "helmsman-charting",
  "helmsman-autopilot",
  "helmsman-verify",
] as const;

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
    expect(template).toContain("## Aperture Bundles");
    expect(template).toContain("## Research Lane Contract");
    expect(template).toContain("## Decision Bundles");
  });

  test("package surface exposes public launch scripts only", async () => {
    const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));

    expect(packageJson.version).toBe("0.2.0");
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
    expect(guards).toContain("git tag v0.2.0");
    expect(guards).not.toContain("OMX");
    expect(guards).not.toContain("Superpowers");
  });
});
