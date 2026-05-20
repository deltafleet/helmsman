#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const REQUIRED_SKILLS = [
  "helmsman",
  "helmsman-charting",
  "helmsman-autopilot",
  "helmsman-verify",
];
const BANNED_CURRENT_SURFACES = [
  "helmsman runtime",
  "helmsman run",
  "smoke:codex",
  "runtime-real-codex-smoke",
  "OpenTUI",
  "opentui",
  "cockpit",
  "runtime shell",
  "runtime-shell",
];
const DISALLOWED_PLUGIN_DIRS = ["scripts", "tests", "docs", "lib"];
const PAYLOAD_MANIFEST_REL = ".codex-plugin/payload-manifest.json";
const REPOSITORY_MARKETPLACE_REL = ".agents/plugins/marketplace.json";
const CLAUDE_MARKETPLACE_REL = ".claude-plugin/marketplace.json";

function usage() {
  return "Usage: bun scripts/verify-plugin.mjs [--plugin-dir <path>] [--compare-to <path>]";
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  let pluginDir = join(ROOT, "plugins/helmsman");
  let compareTo = null;
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--help" || flag === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (flag === "--plugin-dir") {
      pluginDir = args.shift() ?? fail("--plugin-dir requires a value");
      continue;
    }
    if (flag === "--compare-to") {
      compareTo = args.shift() ?? fail("--compare-to requires a value");
      continue;
    }
    fail(`unknown argument: ${flag}`);
  }
  return { pluginDir, compareTo };
}

async function readRequired(path) {
  try {
    const body = await readFile(path, "utf8");
    if (!body.trim()) fail(`${path} is empty`);
    return body;
  } catch (error) {
    if (error && error.code === "ENOENT") fail(`${path} is missing`);
    throw error;
  }
}

async function assertExists(path) {
  try {
    await stat(path);
  } catch (error) {
    if (error && error.code === "ENOENT") fail(`${path} is missing`);
    throw error;
  }
}

function frontmatterName(body, path) {
  const match = body.match(/^---\n([\s\S]*?)\n---/);
  if (!match) fail(`${path}: missing YAML frontmatter`);
  const name = match[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  if (!name) fail(`${path}: missing frontmatter name`);
  return name;
}

async function listFiles(root, prefix = "") {
  const dir = join(root, prefix);
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, rel)));
    } else if (entry.isFile()) {
      files.push(rel);
    } else {
      fail(`plugin payload must not include non-regular entry ${rel}`);
    }
  }
  return files.sort();
}

async function assertDirectory(path) {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) fail(`${path} is not a directory`);
  } catch (error) {
    if (error && error.code === "ENOENT") fail(`${path} is missing`);
    throw error;
  }
}

async function verifyPayloadMatches(pluginDir, compareTo) {
  const actualRoot = resolve(pluginDir);
  const expectedRoot = resolve(compareTo);
  await assertDirectory(actualRoot);
  await assertDirectory(expectedRoot);

  const actualFiles = await listFiles(actualRoot);
  const expectedFiles = await listFiles(expectedRoot);
  const actualSet = new Set(actualFiles);
  const expectedSet = new Set(expectedFiles);
  const missing = expectedFiles.filter((file) => !actualSet.has(file));
  const extra = actualFiles.filter((file) => !expectedSet.has(file));
  if (missing.length > 0) {
    fail(`plugin payload is missing files from compare target: ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    fail(`plugin payload has extra files not in compare target: ${extra.join(", ")}`);
  }

  for (const file of expectedFiles) {
    const actual = await readFile(join(actualRoot, file));
    const expected = await readFile(join(expectedRoot, file));
    if (!actual.equals(expected)) {
      fail(`plugin payload differs from compare target at ${file}`);
    }
  }
}

async function verifyManifest(pluginDir) {
  const body = await readRequired(join(pluginDir, ".codex-plugin/plugin.json"));
  const manifest = JSON.parse(body);
  if (manifest.name !== "helmsman") fail("plugin manifest name must be helmsman");
  if (manifest.skills !== "./skills/") fail("plugin manifest skills must be ./skills/");
  if (manifest.interface?.displayName !== "Helmsman") {
    fail("plugin manifest interface.displayName must be Helmsman");
  }
  if (manifest.interface?.category !== "Coding") {
    fail("plugin manifest interface.category must be Coding");
  }
  const capabilities = manifest.interface?.capabilities ?? [];
  for (const capability of ["Interactive", "Read", "Write"]) {
    if (!capabilities.includes(capability)) {
      fail(`plugin manifest missing capability ${capability}`);
    }
  }
  if (!Array.isArray(manifest.interface?.defaultPrompt) || manifest.interface.defaultPrompt.length > 3) {
    fail("plugin manifest defaultPrompt must contain at most three examples");
  }
  for (const forbidden of ["apps", "mcpServers", "hooks", "agents"]) {
    if (manifest[forbidden] !== undefined) fail(`plugin manifest must not define ${forbidden}`);
  }
  return manifest;
}

async function verifyClaudeManifest(pluginDir, codexManifest) {
  const body = await readRequired(join(pluginDir, ".claude-plugin/plugin.json"));
  const manifest = JSON.parse(body);
  if (manifest.name !== "helmsman") fail("Claude plugin manifest name must be helmsman");
  if (manifest.version !== codexManifest.version) {
    fail("Claude plugin manifest version must match Codex plugin manifest version");
  }
  if (typeof manifest.description !== "string" || !manifest.description.includes("Helmsman")) {
    fail("Claude plugin manifest description must describe the Helmsman protocol");
  }
  if (manifest.repository !== "https://github.com/deltafleet/helmsman") {
    fail("Claude plugin manifest repository must point at deltafleet/helmsman");
  }
  if (manifest.license !== "MIT") fail("Claude plugin manifest license must be MIT");
  for (const forbidden of ["agents", "hooks", "mcpServers", "lspServers", "commands"]) {
    if (manifest[forbidden] !== undefined) {
      fail(`Claude plugin manifest must not define ${forbidden}`);
    }
  }
  return manifest;
}

async function verifySkills(pluginDir) {
  for (const skill of REQUIRED_SKILLS) {
    const skillRoot = join(pluginDir, "skills", skill);
    await assertExists(skillRoot);
    const skillPath = join(skillRoot, "SKILL.md");
    const body = await readRequired(skillPath);
    const actualName = frontmatterName(body, skillPath);
    if (actualName !== skill) fail(`${skillPath}: expected frontmatter name ${skill}`);
  }
  for (const rel of [
    "skills/helmsman-charting/templates/goal.md",
    "skills/helmsman-charting/templates/goal-charter.md",
    "skills/helmsman-charting/templates/stop-conditions.md",
    "skills/helmsman-charting/templates/verification-scenarios.md",
    "skills/helmsman-charting/templates/resume-report-template.md",
    "skills/helmsman-charting/templates/route-card.md",
    "skills/helmsman-charting/templates/charting-loop.md",
    "skills/helmsman-charting/templates/question-bundles.md",
    "skills/helmsman-charting/templates/native-chat-transcript.jsonl",
    "skills/helmsman-charting/templates/memory-scan.md",
    "skills/helmsman-charting/templates/research-index.md",
    "skills/helmsman-charting/templates/worker-packets.md",
    "skills/helmsman-charting/templates/research.md",
    "skills/helmsman-charting/templates/evidence.md",
    "skills/helmsman-charting/roles/researcher.md",
    "skills/helmsman-autopilot/templates/plan.md",
    "skills/helmsman-autopilot/templates/strategy-samples.md",
    "skills/helmsman-autopilot/templates/director-blueprint.md",
    "skills/helmsman-autopilot/templates/hardening.md",
    "skills/helmsman-autopilot/templates/audit.md",
    "skills/helmsman-autopilot/templates/execution-report.md",
    "skills/helmsman-autopilot/phases/strategy.md",
    "skills/helmsman-autopilot/phases/blueprint.md",
    "skills/helmsman-autopilot/phases/hardening.md",
    "skills/helmsman-autopilot/phases/audit.md",
    "skills/helmsman-autopilot/phases/execute.md",
    "skills/helmsman-autopilot/phases/repair.md",
    "skills/helmsman-autopilot/roles/strategist.md",
    "skills/helmsman-autopilot/roles/director.md",
    "skills/helmsman-autopilot/roles/auditor.md",
    "skills/helmsman-autopilot/roles/implementor.md",
    "skills/helmsman/references/release-guards.md",
    "skills/helmsman-verify/templates/verification.md",
    "skills/helmsman-verify/templates/retro.md",
  ]) {
    await assertExists(join(pluginDir, rel));
  }
  const guardReference = await readRequired(
    join(pluginDir, "skills/helmsman/references/release-guards.md"),
  );
  for (const phrase of [
    "Plugin payload note",
    "HELMSMAN_ROOT",
    "installed plugin payload directory",
    "Release Guards",
    "Public Release Checklist",
  ]) {
    if (!guardReference.includes(phrase)) {
      fail(`skills/helmsman/references/release-guards.md: missing '${phrase}'`);
    }
  }
}

async function verifyPayloadBoundaries(pluginDir) {
  for (const dir of DISALLOWED_PLUGIN_DIRS) {
    const info = await stat(join(pluginDir, dir)).catch((error) => {
      if (error && error.code === "ENOENT") return null;
      throw error;
    });
    if (info) fail(`plugin payload must not include ${dir}/`);
  }
  const files = await listFiles(pluginDir);
  for (const file of files) {
    const extension = extname(file);
    if (![".md", ".json", ".yaml", ".yml", ".txt"].includes(extension)) continue;
    const body = await readFile(join(pluginDir, file), "utf8");
    for (const phrase of BANNED_CURRENT_SURFACES) {
      if (body.includes(phrase)) {
        fail(`${file}: contains removed current-facing surface '${phrase}'`);
      }
    }
  }
}

function assertManifestPath(path, manifestPath) {
  if (typeof path !== "string" || !path) fail(`${manifestPath}: payload file path is empty`);
  if (isAbsolute(path) || path.includes("\\") || path.split("/").includes("..")) {
    fail(`${manifestPath}: invalid payload file path ${path}`);
  }
  if (path === PAYLOAD_MANIFEST_REL) {
    fail(`${manifestPath}: payload manifest must not list itself`);
  }
}

async function verifyPayloadManifest(pluginDir, pluginManifest) {
  const manifestPath = join(pluginDir, PAYLOAD_MANIFEST_REL);
  const body = await readRequired(manifestPath);
  const manifest = JSON.parse(body);
  if (manifest.schemaVersion !== 1) fail(`${PAYLOAD_MANIFEST_REL}: schemaVersion must be 1`);
  if (manifest.plugin !== "helmsman") fail(`${PAYLOAD_MANIFEST_REL}: plugin must be helmsman`);
  if (manifest.version !== pluginManifest.version) {
    fail(`${PAYLOAD_MANIFEST_REL}: version must match plugin.json version`);
  }
  if (manifest.generatedBy !== "scripts/build-plugin.mjs") {
    fail(`${PAYLOAD_MANIFEST_REL}: generatedBy must be scripts/build-plugin.mjs`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail(`${PAYLOAD_MANIFEST_REL}: files must be a non-empty array`);
  }

  const expected = [];
  const seen = new Set();
  for (const entry of manifest.files) {
    assertManifestPath(entry?.path, PAYLOAD_MANIFEST_REL);
    if (seen.has(entry.path)) fail(`${PAYLOAD_MANIFEST_REL}: duplicate file entry ${entry.path}`);
    seen.add(entry.path);
    if (!Number.isInteger(entry.bytes) || entry.bytes < 0) {
      fail(`${PAYLOAD_MANIFEST_REL}: invalid byte count for ${entry.path}`);
    }
    if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      fail(`${PAYLOAD_MANIFEST_REL}: invalid sha256 for ${entry.path}`);
    }
    expected.push(entry.path);
  }
  expected.sort();

  const actual = (await listFiles(pluginDir)).filter((file) => file !== PAYLOAD_MANIFEST_REL);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((file) => !actualSet.has(file));
  const extra = actual.filter((file) => !expectedSet.has(file));
  if (missing.length > 0) {
    fail(`payload manifest lists missing files: ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    fail(`payload manifest is missing entries for files: ${extra.join(", ")}`);
  }

  for (const entry of manifest.files) {
    const bytes = await readFile(join(pluginDir, entry.path));
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== entry.bytes) {
      fail(`payload manifest byte count mismatch at ${entry.path}`);
    }
    if (actualHash !== entry.sha256) {
      fail(`payload manifest hash mismatch at ${entry.path}`);
    }
  }
}

async function verifyRepositoryMarketplace() {
  const marketplacePath = join(ROOT, REPOSITORY_MARKETPLACE_REL);
  const body = await readRequired(marketplacePath);
  const marketplace = JSON.parse(body);
  if (marketplace.name !== "helmsman-plugin") {
    fail(`${REPOSITORY_MARKETPLACE_REL}: name must be helmsman-plugin`);
  }
  if (marketplace.interface?.displayName !== "Helmsman") {
    fail(`${REPOSITORY_MARKETPLACE_REL}: interface.displayName must be Helmsman`);
  }
  if (!Array.isArray(marketplace.plugins)) {
    fail(`${REPOSITORY_MARKETPLACE_REL}: plugins must be an array`);
  }
  const entry = marketplace.plugins.find((plugin) => plugin?.name === "helmsman");
  if (!entry) fail(`${REPOSITORY_MARKETPLACE_REL}: missing helmsman plugin entry`);
  if (entry.source?.source !== "local") {
    fail(`${REPOSITORY_MARKETPLACE_REL}: helmsman source.source must be local`);
  }
  if (entry.source?.path !== "./plugins/helmsman") {
    fail(`${REPOSITORY_MARKETPLACE_REL}: helmsman source.path must be ./plugins/helmsman`);
  }
  if (entry.policy?.installation !== "AVAILABLE") {
    fail(`${REPOSITORY_MARKETPLACE_REL}: helmsman policy.installation must be AVAILABLE`);
  }
  if (entry.policy?.authentication !== "ON_INSTALL") {
    fail(`${REPOSITORY_MARKETPLACE_REL}: helmsman policy.authentication must be ON_INSTALL`);
  }
  if (entry.category !== "Coding") {
    fail(`${REPOSITORY_MARKETPLACE_REL}: helmsman category must be Coding`);
  }
  await assertExists(join(ROOT, "plugins/helmsman/.codex-plugin/plugin.json"));
}

async function verifyClaudeMarketplace(pluginManifest) {
  const marketplacePath = join(ROOT, CLAUDE_MARKETPLACE_REL);
  const body = await readRequired(marketplacePath);
  const marketplace = JSON.parse(body);
  if (marketplace.name !== "deltafleet") {
    fail(`${CLAUDE_MARKETPLACE_REL}: name must be deltafleet`);
  }
  if (marketplace.owner?.name !== "Deltafleet") {
    fail(`${CLAUDE_MARKETPLACE_REL}: owner.name must be Deltafleet`);
  }
  if (!Array.isArray(marketplace.plugins)) {
    fail(`${CLAUDE_MARKETPLACE_REL}: plugins must be an array`);
  }
  const entry = marketplace.plugins.find((plugin) => plugin?.name === "helmsman");
  if (!entry) fail(`${CLAUDE_MARKETPLACE_REL}: missing helmsman plugin entry`);
  if (entry.source !== "./plugins/helmsman") {
    fail(`${CLAUDE_MARKETPLACE_REL}: helmsman source must be ./plugins/helmsman`);
  }
  if (entry.version !== pluginManifest.version) {
    fail(`${CLAUDE_MARKETPLACE_REL}: helmsman version must match plugin manifest version`);
  }
  if (entry.repository !== "https://github.com/deltafleet/helmsman") {
    fail(`${CLAUDE_MARKETPLACE_REL}: helmsman repository must point at deltafleet/helmsman`);
  }
  if (entry.license !== "MIT") fail(`${CLAUDE_MARKETPLACE_REL}: helmsman license must be MIT`);
  await assertExists(join(ROOT, "plugins/helmsman/.claude-plugin/plugin.json"));
}

function verifyInstallDryRun() {
  const result = spawnSync(
    process.execPath,
    ["scripts/install-plugin.mjs", "--target-home", "--dry-run", "--json"],
    { cwd: ROOT, encoding: "utf8", env: process.env },
  );
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(result.stderr.trim() || "install dry-run failed");
  const parsed = JSON.parse(result.stdout);
  if (!parsed.dryRun) fail("install dry-run did not report dryRun=true");
  if (parsed.marketplaceEntry?.name !== "helmsman") fail("install dry-run missing helmsman entry");
  if (parsed.marketplaceEntry?.source?.source !== "local") {
    fail("install dry-run marketplace source must be local");
  }
}

function verifyVersionConsistency(pluginDir) {
  const result = spawnSync(
    process.execPath,
    ["scripts/verify-version-consistency.mjs", "--plugin-dir", pluginDir],
    { cwd: ROOT, encoding: "utf8", env: process.env },
  );
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(result.stderr.trim() || "version consistency failed");
}

async function main() {
  const { pluginDir, compareTo } = parseArgs(process.argv.slice(2));
  const manifest = await verifyManifest(pluginDir);
  await verifyClaudeManifest(pluginDir, manifest);
  await verifyRepositoryMarketplace();
  await verifyClaudeMarketplace(manifest);
  await verifySkills(pluginDir);
  await verifyPayloadBoundaries(pluginDir);
  await verifyPayloadManifest(pluginDir, manifest);
  verifyInstallDryRun();
  verifyVersionConsistency(pluginDir);
  if (compareTo) {
    await verifyPayloadMatches(pluginDir, compareTo);
    console.log(`plugin payload matches: ${compareTo}`);
  }
  console.log(`plugin verify pass: ${pluginDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
