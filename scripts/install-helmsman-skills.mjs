#!/usr/bin/env node
import { lstat, mkdir, readlink, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const DEFAULT_TARGET = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "skills");
const LINKS = [
  ["helmsman", ROOT],
  ["helmsman-charting", join(ROOT, "skills/helmsman-charting")],
  ["helmsman-autopilot", join(ROOT, "skills/helmsman-autopilot")],
  ["helmsman-verify", join(ROOT, "skills/helmsman-verify")],
];

function usage() {
  return [
    "Usage: bun scripts/install-helmsman-skills.mjs [--target <skills-dir>] [--force] [--dry-run]",
    "",
    "Creates symlinks for the root helmsman skill and public helmsman-* skills.",
  ].join("\n");
}

function parseArgs(argv) {
  const result = { target: DEFAULT_TARGET, force: false, dryRun: false };
  const args = [...argv];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--help" || flag === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (flag === "--target") {
      result.target = resolve(args.shift() ?? fail("--target requires a value"));
      continue;
    }
    if (flag === "--force") {
      result.force = true;
      continue;
    }
    if (flag === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    fail(`unknown argument: ${flag}`);
  }
  return result;
}

function fail(message) {
  throw new Error(message);
}

async function ensureLink(targetDir, name, source, options) {
  const destination = join(targetDir, name);
  let existing = null;
  try {
    existing = await lstat(destination);
  } catch (error) {
    if (!error || error.code !== "ENOENT") throw error;
  }

  if (existing) {
    if (existing.isSymbolicLink()) {
      const current = resolve(targetDir, await readlink(destination));
      if (current === source) {
        console.log(`ok ${name} -> ${source}`);
        return;
      }
    }
    if (!options.force) {
      fail(`${destination} already exists; rerun with --force to replace it`);
    }
    if (!options.dryRun) {
      await rm(destination, { recursive: true, force: true });
    }
    console.log(`replace ${name}`);
  }

  if (options.dryRun) {
    console.log(`link ${destination} -> ${source}`);
    return;
  }
  await symlink(source, destination, "dir");
  console.log(`linked ${name} -> ${source}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.dryRun) {
    await mkdir(options.target, { recursive: true });
  }
  for (const [name, source] of LINKS) {
    await ensureLink(options.target, name, source, options);
  }
  console.log(`helmsman install ${options.dryRun ? "dry-run" : "pass"}: ${options.target}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
