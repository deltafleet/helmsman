#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

const ROOT = process.cwd();

function usage() {
  return [
    "Usage: bun scripts/verify-installed-plugin.mjs [--plugin-dir <path>] [--marketplace <path>] [--compare-to <path>] [--skip-build]",
    "",
    "Builds the generated Helmsman plugin payload, then verifies the installed plugin matches it and is discoverable from the local marketplace.",
    "Defaults to $HOME/plugins/helmsman and $HOME/.agents/plugins/marketplace.json compared with plugins/helmsman.",
  ].join("\n");
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const parsed = {
    pluginDir: "",
    marketplace: "",
    compareTo: "plugins/helmsman",
    skipBuild: false,
  };
  const args = [...argv];
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
    if (flag === "--marketplace") {
      parsed.marketplace = args.shift() ?? fail("--marketplace requires a value");
      continue;
    }
    if (flag === "--compare-to") {
      parsed.compareTo = args.shift() ?? fail("--compare-to requires a value");
      continue;
    }
    if (flag === "--skip-build") {
      parsed.skipBuild = true;
      continue;
    }
    fail(`unknown argument: ${flag}`);
  }
  if (!parsed.pluginDir) {
    const home = process.env.HOME;
    if (!home) fail("HOME is required when --plugin-dir is omitted");
    parsed.pluginDir = join(home, "plugins/helmsman");
  }
  if (!parsed.marketplace) {
    const home = process.env.HOME;
    if (!home) fail("HOME is required when --marketplace is omitted");
    parsed.marketplace = join(home, ".agents/plugins/marketplace.json");
  }
  return parsed;
}

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function assertInstalledPluginPresent(pluginDir) {
  if (existsSync(pluginDir)) return;
  fail(
    [
      `installed Helmsman plugin not found at ${pluginDir}`,
      "Run: npx @deltafleet/helmsman install",
      "For repository-only payload verification, run: bun run verify:plugin",
    ].join("\n"),
  );
}

function readInstalledPluginVersion(pluginDir) {
  const manifestPath = join(pluginDir, ".codex-plugin/plugin.json");
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!manifest.version) fail(`${manifestPath}: version is required`);
    return manifest.version;
  } catch (error) {
    if (error instanceof SyntaxError) fail(`${manifestPath}: invalid JSON: ${error.message}`);
    throw error;
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

function configEnablesHelmsman(configBody) {
  const match = configBody.match(/\[plugins\."helmsman@local"\]([\s\S]*?)(?=\n\[|$)/);
  return !!match && /^\s*enabled\s*=\s*true\s*$/m.test(match[1]);
}

function assertCodexInstall(pluginDir) {
  const home = process.env.HOME;
  if (!home && !process.env.CODEX_HOME) fail("HOME or CODEX_HOME is required to verify Codex plugin cache");
  const codexHome = process.env.CODEX_HOME || join(home, ".codex");
  const version = readInstalledPluginVersion(pluginDir);
  const cacheDir = join(codexHome, "plugins/cache/local/helmsman", version);
  if (!isDirectory(cacheDir)) {
    fail(
      [
        "Codex plugin cache is missing helmsman@local",
        `Expected cache directory: ${cacheDir}`,
        "Run: npx @deltafleet/helmsman install",
      ].join("\n"),
    );
  }
  const configPath = join(codexHome, "config.toml");
  if (!existsSync(configPath)) {
    fail(`Codex config.toml not found at ${configPath}`);
  }
  const configBody = readFileSync(configPath, "utf8");
  if (!configEnablesHelmsman(configBody)) {
    fail(`Codex config does not enable helmsman@local in ${configPath}`);
  }
  console.log(`Codex plugin cache verified: ${cacheDir}`);
  console.log(`Codex plugin enabled: ${configPath}`);
  return cacheDir;
}

function marketplaceRoot(marketplacePath) {
  return resolve(dirname(marketplacePath), "../..");
}

function resolveMarketplacePluginPath(marketplacePath, entryPath) {
  if (typeof entryPath !== "string" || !entryPath) {
    fail("marketplace helmsman entry source.path is required");
  }
  if (entryPath.startsWith("/")) return resolve(entryPath);
  return resolve(marketplaceRoot(marketplacePath), entryPath);
}

function readMarketplace(marketplacePath) {
  if (!existsSync(marketplacePath)) {
    fail(
      [
        `local plugin marketplace not found at ${marketplacePath}`,
        "Run: npx @deltafleet/helmsman install",
      ].join("\n"),
    );
  }
  try {
    const parsed = JSON.parse(readFileSync(marketplacePath, "utf8"));
    if (!Array.isArray(parsed.plugins)) {
      fail(`${marketplacePath}: plugins must be an array`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      fail(`${marketplacePath}: invalid JSON: ${error.message}`);
    }
    throw error;
  }
}

function assertMarketplaceEntry(pluginDir, marketplacePath) {
  const marketplace = readMarketplace(marketplacePath);
  const entry = marketplace.plugins.find((plugin) => plugin?.name === "helmsman");
  if (!entry) {
    fail(`local plugin marketplace lacks helmsman entry at ${marketplacePath}`);
  }
  if (entry.source?.source !== "local") {
    fail("marketplace helmsman entry source.source must be local");
  }
  const entryPluginDir = resolveMarketplacePluginPath(marketplacePath, entry.source?.path);
  if (entryPluginDir !== resolve(pluginDir)) {
    fail(
      [
        "marketplace helmsman entry points at a different plugin directory",
        `Entry path resolves to: ${entryPluginDir}`,
        `Expected pluginDir: ${resolve(pluginDir)}`,
      ].join("\n"),
    );
  }
  if (entry.policy?.installation !== "AVAILABLE") {
    fail("marketplace helmsman entry policy.installation must be AVAILABLE");
  }
  if (entry.policy?.authentication !== "ON_INSTALL") {
    fail("marketplace helmsman entry policy.authentication must be ON_INSTALL");
  }
  if (entry.category !== "Coding") {
    fail("marketplace helmsman entry category must be Coding");
  }
  console.log(`marketplace entry verified: ${marketplacePath}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.skipBuild) {
    run(["scripts/build-plugin.mjs"]);
  }
  const pluginDir = resolve(args.pluginDir);
  const marketplacePath = resolve(args.marketplace);
  assertInstalledPluginPresent(pluginDir);
  assertMarketplaceEntry(pluginDir, marketplacePath);
  const cacheDir = assertCodexInstall(pluginDir);
  run([
    "scripts/verify-plugin.mjs",
    "--plugin-dir",
    cacheDir,
    "--compare-to",
    pluginDir,
  ]);
  run([
    "scripts/verify-plugin.mjs",
    "--plugin-dir",
    pluginDir,
    "--compare-to",
    args.compareTo,
  ]);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
