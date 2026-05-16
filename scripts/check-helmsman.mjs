#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const EXPECTED_SKILLS = [
  "helmsman-charting",
  "helmsman-autopilot",
  "helmsman-verify",
];

const REQUIRED_DOCS = [
  "README.md",
  "README.ko.md",
  "SKILL.md",
  "docs/distribution.md",
  "docs/open-source-operations.md",
  "docs/helmsman-protocol.md",
  "docs/map-schema.md",
  "docs/release-guards.md",
];

const REQUIRED_SCRIPTS = [
  "scripts/build-plugin.mjs",
  "scripts/verify-plugin.mjs",
  "scripts/install-plugin.mjs",
  "scripts/verify-installed-plugin.mjs",
  "scripts/verify-version-consistency.mjs",
  "scripts/validate-skill-session.mjs",
  "scripts/render-skill-status.mjs",
  "scripts/render-plugin-status.mjs",
  "scripts/scaffold-skill-artifact.mjs",
  "scripts/fetch-skill-memory.mjs",
  "scripts/compile-skill-memory.mjs",
  "scripts/audit-removed-surfaces.mjs",
  "scripts/install-helmsman-skills.mjs",
  "scripts/verify-ci.mjs",
  "scripts/verify-helmsman.mjs",
];

const REMOVED_PUBLIC_PATHS = [
  "docs/competitive-dogfood-runs",
  "docs/superpowers",
  "docs/competitive-dogfood-benchmark.md",
  "docs/competitive-dogfood-surfaces.md",
  "docs/helmsman-completion-audit.md",
  "scripts/audit-active-goal.mjs",
  "scripts/audit-competitive-benchmark.mjs",
  "scripts/audit-competitive-claims.mjs",
  "scripts/audit-competitive-runtime-prereqs.mjs",
  "scripts/audit-competitive-surfaces.mjs",
  "scripts/audit-skill-completion.mjs",
  "scripts/audit-superpowers-isolation.mjs",
  "scripts/dogfood-helmsman.mjs",
  "scripts/run-competitive-benchmark.mjs",
  "tests/docs/active-thread-goal-audit.spec.ts",
  "tests/docs/helmsman-competitive-benchmark.spec.ts",
  "tests/docs/helmsman-competitive-surfaces.spec.ts",
  "tests/docs/helmsman-completion-audit.spec.ts",
];

function fail(message) {
  throw new Error(message);
}

async function read(path) {
  return readFile(join(ROOT, path), "utf8");
}

async function pathExists(path) {
  try {
    await stat(join(ROOT, path));
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

function assertIncludes(path, body, phrases) {
  for (const phrase of phrases) {
    if (!body.includes(phrase)) fail(`${path}: missing '${phrase}'`);
  }
}

function assertFrontmatter(path, body, expectedName) {
  const match = body.match(/^---\n([\s\S]*?)\n---/);
  if (!match) fail(`${path}: missing YAML frontmatter`);
  const fm = match[1];
  if (!fm.includes(`name: ${expectedName}`)) fail(`${path}: expected name ${expectedName}`);
  if (!fm.includes("description:")) fail(`${path}: missing description`);
}

async function main() {
  for (const path of [...REQUIRED_DOCS, ...REQUIRED_SCRIPTS]) {
    if (!(await pathExists(path))) fail(`${path}: required public file is missing`);
  }
  for (const path of REMOVED_PUBLIC_PATHS) {
    if (await pathExists(path)) fail(`${path}: internal launch-history surface must not be public`);
  }

  const packageJson = await read("package.json");
  const packageData = JSON.parse(packageJson);
  if (typeof packageData.version !== "string" || !packageData.version) {
    fail("package.json: version is required");
  }
  if (JSON.stringify(packageData.bin) !== JSON.stringify({ helmsman: "bin/helmsman.mjs" })) {
    fail("package.json: helmsman bin must point only at the distribution CLI");
  }
  for (const script of [
    "check:helmsman",
    "build:plugin",
    "verify:plugin",
    "verify:version",
    "verify:installed-plugin",
    "verify:ci",
    "prepack",
    "install:plugin",
    "validate:skill-session",
    "render:skill-status",
    "render:plugin-status",
    "scaffold:skill-artifact",
    "fetch:skill-memory",
    "compile:skill-memory",
    "audit:removed-surfaces",
    "install:skills",
    "verify:helmsman",
  ]) {
    if (!packageData.scripts?.[script]) fail(`package.json: missing ${script} script`);
  }
  for (const removedScript of [
    "dogfood:helmsman",
    "audit:active-goal",
    "audit:competitive-benchmark",
    "render:benchmark-queue",
    "render:completion-status",
  ]) {
    if (packageData.scripts?.[removedScript]) {
      fail(`package.json: internal launch-history script must not be public: ${removedScript}`);
    }
  }

  const rootSkill = await read("SKILL.md");
  assertFrontmatter("SKILL.md", rootSkill, "helmsman");
  assertIncludes("SKILL.md", rootSkill, [
    "Helmsman protocol workspace",
    "Do not require a separate UI surface",
    "Helper scripts are a protocol toolbelt",
    "validate:skill-session",
    "render:skill-status",
    "build:plugin",
    "verify:plugin",
    "verify:version",
    "render:plugin-status",
    "helmsman doctor",
  ]);
  for (const forbidden of [
    "competitive-dogfood",
    "render:completion-status",
    "render:benchmark-queue",
    "audit:active-goal",
    "dogfood:helmsman",
  ]) {
    if (rootSkill.includes(forbidden)) fail(`SKILL.md: internal launch-history phrase remains: ${forbidden}`);
  }

  const entries = (await readdir(join(ROOT, "skills"))).sort();
  const expected = [...EXPECTED_SKILLS].sort();
  if (entries.join("\n") !== expected.join("\n")) {
    fail(`skills/: expected exactly ${expected.join(", ")}`);
  }
  for (const skill of EXPECTED_SKILLS) {
    const path = `skills/${skill}/SKILL.md`;
    const body = await read(path);
    assertFrontmatter(path, body, skill);
    assertIncludes(path, body, ["contract.md", "Exit gate:", "Required artifacts"]);
  }

  const distribution = await read("docs/distribution.md");
  assertIncludes("docs/distribution.md", distribution, [
    "npx @deltafleet/helmsman install",
    "npx @deltafleet/helmsman doctor",
    "helmsman update",
    "first skill entry",
    "Codex and Claude Code are host adapters",
    "bun run verify:version",
    "does not currently claim an official hosted Codex marketplace channel",
  ]);

  const guards = await read("docs/release-guards.md");
  assertIncludes("docs/release-guards.md", guards, [
    "Public Release Checklist",
    "npm publish --access public",
    `git tag v${packageData.version}`,
    "Do not publish from a dirty worktree",
  ]);

  console.log("helmsman check pass");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
