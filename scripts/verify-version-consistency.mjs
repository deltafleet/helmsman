#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();

function usage() {
  return "Usage: bun scripts/verify-version-consistency.mjs [--plugin-dir <path>]";
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  const parsed = {
    pluginDir: "plugins/helmsman",
  };
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--help" || flag === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (flag === "--plugin-dir") {
      parsed.pluginDir = args.shift() ?? fail("--plugin-dir requires a value");
      continue;
    }
    fail(`unknown argument: ${flag}`);
  }
  return parsed;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") fail(`${path} is missing`);
    if (error instanceof SyntaxError) fail(`${path}: invalid JSON: ${error.message}`);
    throw error;
  }
}

function assertVersion(label, actual, expected) {
  if (actual !== expected) {
    fail(`${label} version ${actual} does not match package.json ${expected}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageJson = await readJson(join(ROOT, "package.json"));
  const version = packageJson.version;
  if (typeof version !== "string" || !version) fail("package.json version is required");

  const codexManifest = await readJson(join(args.pluginDir, ".codex-plugin/plugin.json"));
  const claudeManifest = await readJson(join(args.pluginDir, ".claude-plugin/plugin.json"));
  const payloadManifest = await readJson(join(args.pluginDir, ".codex-plugin/payload-manifest.json"));
  const claudeMarketplace = await readJson(join(ROOT, ".claude-plugin/marketplace.json"));
  const claudeEntry = claudeMarketplace.plugins?.find((plugin) => plugin?.name === "helmsman");
  if (!claudeEntry) fail(".claude-plugin/marketplace.json missing helmsman entry");

  assertVersion(".codex-plugin/plugin.json", codexManifest.version, version);
  assertVersion(".claude-plugin/plugin.json", claudeManifest.version, version);
  assertVersion(".codex-plugin/payload-manifest.json", payloadManifest.version, version);
  assertVersion(".claude-plugin/marketplace.json helmsman entry", claudeEntry.version, version);

  console.log(`version consistency pass: ${version}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
