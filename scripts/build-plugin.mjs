#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const ROOT = process.cwd();
const REQUIRED_SKILLS = [
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
const PAYLOAD_MANIFEST_REL = ".codex-plugin/payload-manifest.json";
const RELEASE_GUARD_SOURCE_REL = "docs/release-guards.md";
const RELEASE_GUARD_PAYLOAD_REL = "skills/helmsman/references/release-guards.md";
const RELEASE_GUARD_PLUGIN_PREAMBLE = [
  "> Plugin payload note: this reference is copied from the Helmsman source checkout.",
  "> Run `bun run ...` helper commands from `HELMSMAN_ROOT` or the source checkout, not from the installed plugin payload directory.",
  "",
].join("\n");
const REQUIRED_SOURCE_RELS = [
  RELEASE_GUARD_SOURCE_REL,
  "skills/helmsman-charting/templates/goal.md",
  "skills/helmsman-charting/templates/goal-charter.md",
  "skills/helmsman-charting/templates/stop-conditions.md",
  "skills/helmsman-charting/templates/verification-scenarios.md",
  "skills/helmsman-charting/templates/resume-report-template.md",
  "skills/helmsman-charting/templates/evidence.md",
  "skills/helmsman-autopilot/templates/strategy-samples.md",
  "skills/helmsman-autopilot/templates/director-blueprint.md",
  "skills/helmsman-autopilot/templates/hardening.md",
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
  "skills/helmsman-verify/templates/retro.md",
];

function usage() {
  return [
    "Usage: bun scripts/build-plugin.mjs [--source-root <path>] [--output <path>]",
    "Builds the generated Codex plugin payload at plugins/helmsman by default.",
  ].join("\n");
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  let sourceRoot = ROOT;
  let output = join(ROOT, "plugins/helmsman");
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--help" || flag === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (flag === "--source-root") {
      sourceRoot = args.shift() ?? fail("--source-root requires a value");
      continue;
    }
    if (flag === "--output") {
      output = args.shift() ?? fail("--output requires a value");
      continue;
    }
    fail(`unknown argument: ${flag}`);
  }
  return { sourceRoot, output };
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

async function assertSourcePath(sourceRoot, rel) {
  const path = join(sourceRoot, rel);
  try {
    const info = await stat(path);
    if (!info.isFile()) fail(`${path} is not a file`);
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

async function assertSkill(sourceRoot, skill, rel = `skills/${skill}/SKILL.md`) {
  const path = join(sourceRoot, rel);
  const body = await readRequired(path);
  const expectedName = skill;
  const actualName = frontmatterName(body, path);
  if (actualName !== expectedName) {
    fail(`${path}: expected frontmatter name ${expectedName}, got ${actualName}`);
  }
  return body;
}

function assertNoRemovedSurfaces(path, body) {
  for (const phrase of BANNED_CURRENT_SURFACES) {
    if (body.includes(phrase)) {
      fail(`${path}: contains removed current-facing surface '${phrase}'`);
    }
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function listPayloadFiles(root, prefix = "") {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listPayloadFiles(root, rel)));
    } else if (entry.isFile()) {
      files.push(rel);
    } else {
      fail(`${join(root, rel)} is not a regular payload file`);
    }
  }
  return files.sort();
}

async function writePayloadManifest(root, version) {
  const files = (await listPayloadFiles(root)).filter((file) => file !== PAYLOAD_MANIFEST_REL);
  const entries = [];
  for (const file of files) {
    const bytes = await readFile(join(root, file));
    entries.push({
      path: file,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  await writeJson(join(root, PAYLOAD_MANIFEST_REL), {
    schemaVersion: 1,
    plugin: "helmsman",
    version,
    generatedBy: "scripts/build-plugin.mjs",
    files: entries,
  });
}

async function main() {
  const { sourceRoot, output } = parseArgs(process.argv.slice(2));
  const packageJson = JSON.parse(await readRequired(join(sourceRoot, "package.json")));
  const outputParent = dirname(output);
  const outputBase = basename(output);
  const staging = join(
    outputParent,
    `.${outputBase}.tmp-${process.pid}-${Date.now().toString(36)}`,
  );
  const backup = join(
    outputParent,
    `.${outputBase}.previous-${process.pid}-${Date.now().toString(36)}`,
  );
  const lock = join(outputParent, `.${outputBase}.build.lock`);

  const rootSkill = await assertSkill(sourceRoot, "helmsman", "SKILL.md");
  const releaseGuardReference = await readRequired(join(sourceRoot, RELEASE_GUARD_SOURCE_REL));
  assertNoRemovedSurfaces("SKILL.md", rootSkill);
  for (const skill of REQUIRED_SKILLS) {
    const body = await assertSkill(sourceRoot, skill);
    assertNoRemovedSurfaces(`skills/${skill}/SKILL.md`, body);
  }
  for (const rel of REQUIRED_SOURCE_RELS) {
    await assertSourcePath(sourceRoot, rel);
  }

  const manifest = {
    name: "helmsman",
    version: packageJson.version,
    description:
      "Helmsman workflow protocol for charting, evidence-backed autonomous delivery, verification, and closeout memory.",
    skills: "./skills/",
    interface: {
      displayName: "Helmsman",
      shortDescription: "Helmsman workflow protocol for disciplined Codex agent work",
      longDescription:
        "Use Helmsman to clarify routes, gather Charting-owned evidence, run Autopilot strategy and blueprint loops, verify against scenarios, and preserve reusable closeout memory through Codex skills.",
      developerName: "Deltafleet",
      category: "Coding",
      capabilities: ["Interactive", "Read", "Write"],
      defaultPrompt: [
        "Use Helmsman to chart this task and gather needed evidence before implementation.",
        "Run Helmsman Autopilot after the route and evidence are ready.",
        "Verify this delivery against the original Helmsman route and close it out.",
      ],
      brandColor: "#0F766E",
      screenshots: [],
    },
  };

  let moved = false;
  let backedUp = false;
  let locked = false;
  try {
    await mkdir(outputParent, { recursive: true });
    try {
      await mkdir(lock);
      locked = true;
    } catch (error) {
      if (error && error.code === "EEXIST") {
        fail(
          [
            `plugin build already in progress for ${output}`,
            `Lock: ${lock}`,
            "If this is stale, remove the lock only after confirming no build is running.",
          ].join("\n"),
        );
      }
      throw error;
    }
    await writeJson(join(lock, "owner.json"), {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      output,
    });

    await rm(staging, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
    await mkdir(join(staging, ".codex-plugin"), { recursive: true });
    await mkdir(join(staging, ".claude-plugin"), { recursive: true });
    await mkdir(join(staging, "skills/helmsman"), { recursive: true });
    await mkdir(join(staging, "skills/helmsman/references"), { recursive: true });

    await writeJson(join(staging, ".codex-plugin/plugin.json"), manifest);
    await writeJson(join(staging, ".claude-plugin/plugin.json"), {
      name: "helmsman",
      version: packageJson.version,
      description:
        "Helmsman workflow protocol for charting, evidence-backed autonomous delivery, verification, and closeout memory.",
      author: {
        name: "Deltafleet",
        url: "https://github.com/deltafleet",
      },
      homepage: "https://github.com/deltafleet/helmsman#readme",
      repository: "https://github.com/deltafleet/helmsman",
      license: "MIT",
      keywords: [
        "agent-workflow",
        "skills",
        "codex",
        "claude-code",
        "project-intelligence",
      ],
    });
    await writeFile(join(staging, "skills/helmsman/SKILL.md"), rootSkill);
    await writeFile(
      join(staging, RELEASE_GUARD_PAYLOAD_REL),
      `${RELEASE_GUARD_PLUGIN_PREAMBLE}${releaseGuardReference}`,
    );

    for (const skill of REQUIRED_SKILLS) {
      await cp(join(sourceRoot, "skills", skill), join(staging, "skills", skill), {
        recursive: true,
        force: true,
      });
    }

    await writePayloadManifest(staging, packageJson.version);

    const currentOutput = await stat(output).catch((error) => {
      if (error && error.code === "ENOENT") return null;
      throw error;
    });
    if (currentOutput) {
      await rename(output, backup);
      backedUp = true;
    }
    await rename(staging, output);
    moved = true;
  } finally {
    if (!moved && backedUp) {
      await rm(output, { recursive: true, force: true }).catch(() => {});
      await rename(backup, output).catch(() => {});
    }
    if (!moved) await rm(staging, { recursive: true, force: true }).catch(() => {});
    if (backedUp) await rm(backup, { recursive: true, force: true }).catch(() => {});
    if (locked) await rm(lock, { recursive: true, force: true }).catch(() => {});
  }
  console.log(`plugin build pass: ${output}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
