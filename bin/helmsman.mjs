#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGE_PATH = join(ROOT, "package.json");
const DEFAULT_PLUGIN_DIR = join(ROOT, "plugins/helmsman");

function usage() {
  return [
    "Usage: helmsman <command> [options]",
    "",
    "Commands:",
    "  install   install the Helmsman plugin into the local Codex home",
    "  doctor    render read-only plugin install status",
    "  update    install the latest npm-published Helmsman plugin payload",
    "  version   print package and generated plugin versions",
    "",
    "Install options:",
    "  --dry-run           print planned writes without mutating files",
    "  --json              print machine-readable output",
    "  --force             override a conflicting existing install",
    "  --skip-codex-install skip Codex cache/enable registration after writing files",
    "  --plugin-dir <path> override plugin install destination",
    "  --marketplace <path> override marketplace JSON destination",
    "",
    "Doctor options:",
    "  --json              print machine-readable output",
    "  --no-latest-check   skip npm latest version lookup",
    "  --latest-timeout-ms <ms> bound npm latest lookup time",
    "  --plugin-dir <path> override installed plugin directory",
    "  --marketplace <path> override marketplace JSON path",
    "  --compare-to <path> override generated payload comparison target",
    "",
    "Update options:",
    "  Same as install. Delegates to npx --yes @deltafleet/helmsman@latest install.",
  ].join("\n");
}

function fail(message) {
  throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function runScript(script, args) {
  const result = spawnSync(process.execPath, [join(ROOT, script), ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) fail(result.error.message);
  process.exit(result.status ?? 0);
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) fail(result.error.message);
  process.exit(result.status ?? 0);
}

function hasExplicitTarget(args) {
  return args.includes("--plugin-dir") || args.includes("--marketplace");
}

function install(args) {
  const skipCodexInstall = args.includes("--skip-codex-install");
  const forwarded = hasExplicitTarget(args)
    ? ["--skip-build", ...args]
    : [
        "--target-home",
        "--skip-build",
        ...(skipCodexInstall ? [] : ["--codex-install"]),
        ...args,
      ];
  runScript("scripts/install-plugin.mjs", forwarded);
}

function doctor(args) {
  const forwarded = args.includes("--compare-to")
    ? args
    : ["--skip-payload-compare", ...args];
  const wantsLatestCheck = !forwarded.includes("--no-latest-check");
  runScript("scripts/render-plugin-status.mjs", [
    ...(wantsLatestCheck ? ["--check-latest"] : []),
    ...forwarded,
  ]);
}

function update(args) {
  const npxBin = process.env.HELMSMAN_NPX_BIN || "npx";
  runCommand(npxBin, ["--yes", "@deltafleet/helmsman@latest", "install", ...args]);
}

function version(args) {
  const json = args.includes("--json");
  const pluginDirFlag = args.indexOf("--plugin-dir");
  const pluginDir = pluginDirFlag >= 0 ? args[pluginDirFlag + 1] : DEFAULT_PLUGIN_DIR;
  if (pluginDirFlag >= 0 && !pluginDir) fail("--plugin-dir requires a value");
  for (const arg of args) {
    if (arg === "--json" || arg === "--plugin-dir" || arg === pluginDir) continue;
    fail(`unknown argument for version: ${arg}`);
  }

  const packageJson = readJson(PACKAGE_PATH);
  const codexManifest = readJson(join(pluginDir, ".codex-plugin/plugin.json"));
  const claudeManifest = readJson(join(pluginDir, ".claude-plugin/plugin.json"));
  const payloadManifest = readJson(join(pluginDir, ".codex-plugin/payload-manifest.json"));
  const claudeMarketplace = readJson(join(ROOT, ".claude-plugin/marketplace.json"));
  const claudeEntry = claudeMarketplace.plugins.find((plugin) => plugin?.name === "helmsman");
  const summary = {
    packageName: packageJson.name,
    packageVersion: packageJson.version,
    codexPluginVersion: codexManifest.version,
    claudePluginVersion: claudeManifest.version,
    payloadManifestVersion: payloadManifest.version,
    claudeMarketplaceVersion: claudeEntry?.version ?? "",
  };

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(`${summary.packageName} ${summary.packageVersion}`);
  console.log(`Codex plugin: ${summary.codexPluginVersion}`);
  console.log(`Claude plugin: ${summary.claudePluginVersion}`);
  console.log(`Payload manifest: ${summary.payloadManifestVersion}`);
  console.log(`Claude marketplace: ${summary.claudeMarketplaceVersion}`);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }
  if (command === "install") {
    install(args);
    return;
  }
  if (command === "doctor") {
    doctor(args);
    return;
  }
  if (command === "update") {
    update(args);
    return;
  }
  if (command === "version") {
    version(args);
    return;
  }
  fail(`unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
