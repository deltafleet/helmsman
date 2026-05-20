#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

const ROOT = process.cwd();
const PAYLOAD_MANIFEST_REL = ".codex-plugin/payload-manifest.json";
const DEFAULT_REGISTRY = "https://registry.npmjs.org/";

function usage() {
  return [
    "Usage: bun scripts/render-plugin-status.mjs [--plugin-dir <path>] [--marketplace <path>] [--compare-to <path>] [--skip-payload-compare] [--check-latest] [--json]",
    "",
    "Renders the current Helmsman plugin install status without building, installing, or mutating files.",
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
    skipPayloadCompare: false,
    checkLatest: false,
    latestTimeoutMs: 2000,
    registry: "",
    json: false,
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
    if (flag === "--skip-payload-compare") {
      parsed.skipPayloadCompare = true;
      continue;
    }
    if (flag === "--check-latest") {
      parsed.checkLatest = true;
      continue;
    }
    if (flag === "--no-latest-check") {
      parsed.checkLatest = false;
      continue;
    }
    if (flag === "--latest-timeout-ms") {
      const value = Number(args.shift() ?? fail("--latest-timeout-ms requires a value"));
      if (!Number.isInteger(value) || value < 100) {
        fail("--latest-timeout-ms must be an integer >= 100");
      }
      parsed.latestTimeoutMs = value;
      continue;
    }
    if (flag === "--registry") {
      parsed.registry = args.shift() ?? fail("--registry requires a value");
      continue;
    }
    if (flag === "--json") {
      parsed.json = true;
      continue;
    }
    fail(`unknown argument: ${flag}`);
  }
  if (!parsed.pluginDir || !parsed.marketplace) {
    const home = process.env.HOME;
    if (!home) fail("HOME is required when --plugin-dir or --marketplace is omitted");
    parsed.pluginDir ||= join(home, "plugins/helmsman");
    parsed.marketplace ||= join(home, ".agents/plugins/marketplace.json");
  }
  return parsed;
}

function normalizeRegistry(registry) {
  const value = registry || process.env.HELMSMAN_NPM_REGISTRY || process.env.npm_config_registry || process.env.NPM_CONFIG_REGISTRY || DEFAULT_REGISTRY;
  return value.endsWith("/") ? value : `${value}/`;
}

async function pathStatus(path) {
  try {
    const info = await stat(path);
    return {
      exists: true,
      directory: info.isDirectory(),
      file: info.isFile(),
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { exists: false, directory: false, file: false };
    }
    return {
      exists: false,
      directory: false,
      file: false,
      error: error.message,
    };
  }
}

function marketplaceRoot(marketplacePath) {
  return resolve(dirname(marketplacePath), "../..");
}

function resolveMarketplacePluginPath(marketplacePath, entryPath) {
  if (typeof entryPath !== "string" || !entryPath) return "";
  if (isAbsolute(entryPath)) return resolve(entryPath);
  return resolve(marketplaceRoot(marketplacePath), entryPath);
}

async function readMarketplace(marketplacePath) {
  const status = await pathStatus(marketplacePath);
  if (!status.exists) {
    return {
      status,
      validJson: false,
      entry: null,
      error: "marketplace file is missing",
    };
  }
  if (!status.file) {
    return {
      status,
      validJson: false,
      entry: null,
      error: "marketplace path is not a file",
    };
  }
  try {
    const parsed = JSON.parse(await readFile(marketplacePath, "utf8"));
    if (!Array.isArray(parsed.plugins)) {
      return {
        status,
        validJson: false,
        entry: null,
        error: "plugins must be an array",
      };
    }
    return {
      status,
      validJson: true,
      entry: parsed.plugins.find((plugin) => plugin?.name === "helmsman") ?? null,
      error: "",
    };
  } catch (error) {
    return {
      status,
      validJson: false,
      entry: null,
      error: `invalid JSON: ${error.message}`,
    };
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readPackageMetadata() {
  try {
    const packageJson = await readJson(join(ROOT, "package.json"));
    return {
      name: packageJson.name || "",
      version: packageJson.version || "",
    };
  } catch {
    return {
      name: "",
      version: "",
    };
  }
}

function configEnablesHelmsman(configBody) {
  const match = configBody.match(/\[plugins\."helmsman@local"\]([\s\S]*?)(?=\n\[|$)/);
  return !!match && /^\s*enabled\s*=\s*true\s*$/m.test(match[1]);
}

async function readCodexInstallStatus(pluginDir) {
  const home = process.env.HOME;
  const codexHome = process.env.CODEX_HOME || (home ? join(home, ".codex") : "");
  const configPath = codexHome ? join(codexHome, "config.toml") : "";
  let version = "";
  let manifestReadable = false;
  try {
    const manifest = await readJson(join(pluginDir, ".codex-plugin/plugin.json"));
    version = manifest.version || "";
    manifestReadable = true;
  } catch {
    version = "";
  }

  const cacheDir = codexHome && version ? join(codexHome, "plugins/cache/local/helmsman", version) : "";
  const cacheStatus = cacheDir
    ? await pathStatus(cacheDir)
    : { exists: false, directory: false, file: false };
  const configStatus = configPath
    ? await pathStatus(configPath)
    : { exists: false, directory: false, file: false };
  let configEnabled = false;
  if (configStatus.file) {
    try {
      configEnabled = configEnablesHelmsman(await readFile(configPath, "utf8"));
    } catch {
      configEnabled = false;
    }
  }

  return {
    codexHome,
    configPath,
    pluginVersion: version,
    pluginManifestReadable: manifestReadable,
    cacheDir,
    cachePresent: cacheStatus.directory,
    configPresent: configStatus.file,
    configEnabled,
    installed: manifestReadable && cacheStatus.directory && configEnabled,
  };
}

async function listFiles(root, prefix = "") {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, rel)));
    } else if (entry.isFile()) {
      files.push(rel);
    } else {
      files.push(`${rel} [non-regular]`);
    }
  }
  return files.sort();
}

function safeManifestPath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !isAbsolute(path) &&
    !path.includes("\\") &&
    !path.split("/").includes("..")
  );
}

async function validatePayloadManifest(root) {
  const manifestPath = join(root, PAYLOAD_MANIFEST_REL);
  try {
    const manifest = await readJson(manifestPath);
    if (!Array.isArray(manifest.files)) {
      return {
        checked: true,
        valid: false,
        manifestVersion: manifest.version || "",
        filesChecked: 0,
        missing: [],
        extra: [],
        differing: [],
        invalidEntries: ["files must be an array"],
        error: "",
      };
    }

    const invalidEntries = [];
    const expectedFiles = [];
    const seen = new Set();
    for (const entry of manifest.files) {
      if (!entry || !safeManifestPath(entry.path)) {
        invalidEntries.push(`invalid path: ${entry?.path ?? ""}`);
        continue;
      }
      if (seen.has(entry.path)) {
        invalidEntries.push(`duplicate path: ${entry.path}`);
        continue;
      }
      seen.add(entry.path);
      expectedFiles.push(entry.path);
      if (!Number.isInteger(entry.bytes) || entry.bytes < 0) {
        invalidEntries.push(`invalid bytes: ${entry.path}`);
      }
      if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
        invalidEntries.push(`invalid sha256: ${entry.path}`);
      }
    }

    const actualFiles = (await listFiles(root)).filter((file) => file !== PAYLOAD_MANIFEST_REL);
    const actualSet = new Set(actualFiles);
    const expectedSet = new Set(expectedFiles);
    const missing = expectedFiles.filter((file) => !actualSet.has(file));
    const extra = actualFiles.filter((file) => !expectedSet.has(file));
    const differing = [];
    for (const entry of manifest.files) {
      if (!safeManifestPath(entry?.path) || missing.includes(entry.path)) continue;
      const bytes = await readFile(join(root, entry.path));
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (entry.bytes !== bytes.byteLength || entry.sha256 !== sha256) {
        differing.push(entry.path);
      }
    }

    return {
      checked: true,
      valid:
        invalidEntries.length === 0 &&
        missing.length === 0 &&
        extra.length === 0 &&
        differing.length === 0,
      manifestVersion: manifest.version || "",
      filesChecked: expectedFiles.length,
      missing,
      extra,
      differing,
      invalidEntries,
      error: "",
    };
  } catch (error) {
    return {
      checked: true,
      valid: false,
      manifestVersion: "",
      filesChecked: 0,
      missing: [],
      extra: [],
      differing: [],
      invalidEntries: [],
      error: error.message,
    };
  }
}

function parseVersion(version) {
  const match = String(version).trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || "",
  };
}

function comparePrerelease(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const left = a.split(".");
  const right = b.split(".");
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const l = left[index];
    const r = right[index];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const ln = /^\d+$/.test(l) ? Number(l) : null;
    const rn = /^\d+$/.test(r) ? Number(r) : null;
    if (ln !== null && rn !== null && ln !== rn) return ln < rn ? -1 : 1;
    if (ln !== null && rn === null) return -1;
    if (ln === null && rn !== null) return 1;
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

async function fetchLatestVersion(packageName, registry, timeoutMs) {
  if (!packageName) fail("package name is required for latest version check");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(`${encodeURIComponent(packageName)}/latest`, normalizeRegistry(registry));
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
      },
    });
    if (!response.ok) {
      fail(`npm registry returned HTTP ${response.status}`);
    }
    const body = await response.json();
    if (typeof body.version !== "string" || !body.version) {
      fail("npm registry response did not include a version");
    }
    return body.version;
  } finally {
    clearTimeout(timeout);
  }
}

async function latestCheck(args, installedVersion) {
  const packageMetadata = await readPackageMetadata();
  const registry = normalizeRegistry(args.registry);
  const base = {
    checked: args.checkLatest,
    packageName: packageMetadata.name,
    registry,
    currentPackageVersion: packageMetadata.version,
    installedVersion: installedVersion || "",
    latestVersion: "",
    updateAvailable: false,
    relation: args.checkLatest ? "unavailable" : "skipped",
    error: "",
  };
  if (!args.checkLatest) return base;
  try {
    const latestVersion = await fetchLatestVersion(
      packageMetadata.name,
      registry,
      args.latestTimeoutMs,
    );
    const installed = installedVersion || "";
    if (!installed) {
      return {
        ...base,
        latestVersion,
        updateAvailable: true,
        relation: "not-installed",
      };
    }
    const comparison = compareVersions(installed, latestVersion);
    if (comparison === null) {
      return {
        ...base,
        latestVersion,
        updateAvailable: installed !== latestVersion,
        relation: installed === latestVersion ? "current" : "different",
      };
    }
    return {
      ...base,
      latestVersion,
      updateAvailable: comparison < 0,
      relation: comparison < 0 ? "behind" : comparison > 0 ? "ahead" : "current",
    };
  } catch (error) {
    return {
      ...base,
      error: error.message,
    };
  }
}

function skippedPayloadComparison() {
  return {
    checked: false,
    required: false,
    matches: true,
    reason: "payload comparison skipped",
    missing: [],
    extra: [],
    differing: [],
  };
}

async function comparePayloads(actualRoot, expectedRoot) {
  const actualStatus = await pathStatus(actualRoot);
  const expectedStatus = await pathStatus(expectedRoot);
  if (!actualStatus.directory || !expectedStatus.directory) {
    return {
      checked: false,
      required: true,
      matches: false,
      reason: !actualStatus.directory
        ? "installed plugin directory is missing"
        : "generated plugin directory is missing",
      missing: [],
      extra: [],
      differing: [],
    };
  }
  try {
    const actualFiles = await listFiles(actualRoot);
    const expectedFiles = await listFiles(expectedRoot);
    const actualSet = new Set(actualFiles);
    const expectedSet = new Set(expectedFiles);
    const missing = expectedFiles.filter((file) => !actualSet.has(file));
    const extra = actualFiles.filter((file) => !expectedSet.has(file));
    const differing = [];
    for (const file of expectedFiles) {
      if (!actualSet.has(file) || file.endsWith(" [non-regular]")) continue;
      const actual = await readFile(join(actualRoot, file));
      const expected = await readFile(join(expectedRoot, file));
      if (!actual.equals(expected)) differing.push(file);
    }
    return {
      checked: true,
      required: true,
      matches: missing.length === 0 && extra.length === 0 && differing.length === 0,
      reason: "",
      missing,
      extra,
      differing,
    };
  } catch (error) {
    return {
      checked: false,
      required: true,
      matches: false,
      reason: error.message,
      missing: [],
      extra: [],
      differing: [],
    };
  }
}

async function summarize(args) {
  const pluginDir = resolve(args.pluginDir);
  const marketplacePath = resolve(args.marketplace);
  const compareTo = resolve(args.compareTo);
  const generatedStatus = await pathStatus(compareTo);
  const installedStatus = await pathStatus(pluginDir);
  const manifestStatus = await pathStatus(join(pluginDir, PAYLOAD_MANIFEST_REL));
  const marketplace = await readMarketplace(marketplacePath);
  const entry = marketplace.entry;
  const entryResolvedPath = entry ? resolveMarketplacePluginPath(marketplacePath, entry.source?.path) : "";
  const codexInstall = await readCodexInstallStatus(pluginDir);
  const marketplaceReady =
    marketplace.validJson &&
    !!entry &&
    entry.source?.source === "local" &&
    entryResolvedPath === pluginDir &&
    entry.policy?.installation === "AVAILABLE" &&
    entry.policy?.authentication === "ON_INSTALL" &&
    entry.category === "Coding";
  const payloadManifestValidation = await validatePayloadManifest(pluginDir);
  const payloadComparison = args.skipPayloadCompare
    ? skippedPayloadComparison()
    : await comparePayloads(pluginDir, compareTo);
  const codexCacheComparison = codexInstall.cachePresent
    ? await comparePayloads(codexInstall.cacheDir, pluginDir)
    : {
        checked: false,
        required: true,
        matches: false,
        reason: "Codex plugin cache is missing",
        missing: [],
        extra: [],
        differing: [],
      };
  const latest = await latestCheck(args, codexInstall.pluginVersion);
  const ready =
    installedStatus.directory &&
    manifestStatus.file &&
    payloadManifestValidation.valid &&
    marketplaceReady &&
    (!payloadComparison.required || payloadComparison.matches) &&
    codexInstall.installed &&
    codexCacheComparison.matches;

  const blockers = [];
  if (payloadComparison.required && !generatedStatus.directory) {
    blockers.push("generated plugin payload is missing");
  }
  if (!installedStatus.directory) blockers.push("installed plugin directory is missing");
  if (!manifestStatus.file) blockers.push("installed payload manifest is missing");
  if (manifestStatus.file && !payloadManifestValidation.valid) {
    blockers.push("installed payload manifest does not match installed files");
  }
  if (!marketplace.validJson) blockers.push(`marketplace invalid: ${marketplace.error}`);
  if (marketplace.validJson && !entry) blockers.push("marketplace lacks helmsman entry");
  if (entry && entry.source?.source !== "local") {
    blockers.push("marketplace helmsman entry source.source is not local");
  }
  if (entry && entryResolvedPath !== pluginDir) {
    blockers.push("marketplace helmsman entry does not resolve to pluginDir");
  }
  if (entry && entry.policy?.installation !== "AVAILABLE") {
    blockers.push("marketplace helmsman entry policy.installation is not AVAILABLE");
  }
  if (entry && entry.policy?.authentication !== "ON_INSTALL") {
    blockers.push("marketplace helmsman entry policy.authentication is not ON_INSTALL");
  }
  if (entry && entry.category !== "Coding") {
    blockers.push("marketplace helmsman entry category is not Coding");
  }
  if (payloadComparison.checked && !payloadComparison.matches) {
    blockers.push("installed payload differs from generated plugin payload");
  }
  if (payloadComparison.required && !payloadComparison.checked) {
    blockers.push(`payload comparison skipped: ${payloadComparison.reason}`);
  }
  if (!codexInstall.pluginManifestReadable) blockers.push("installed plugin manifest is unreadable");
  if (codexInstall.pluginManifestReadable && !codexInstall.cachePresent) {
    blockers.push("Codex plugin cache is missing helmsman@local");
  }
  if (!codexInstall.configPresent) blockers.push("Codex config.toml is missing");
  if (codexInstall.configPresent && !codexInstall.configEnabled) {
    blockers.push("Codex config does not enable helmsman@local");
  }
  if (codexCacheComparison.checked && !codexCacheComparison.matches) {
    blockers.push("Codex plugin cache differs from installed plugin payload");
  }
  if (codexCacheComparison.required && !codexCacheComparison.checked) {
    blockers.push(`Codex plugin cache comparison skipped: ${codexCacheComparison.reason}`);
  }

  return {
    ready,
    readOnly: true,
    pluginDir,
    marketplacePath,
    compareTo,
    generatedPayloadPresent: generatedStatus.directory,
    installedPayloadPresent: installedStatus.directory,
    installedPayloadManifestPresent: manifestStatus.file,
    payloadManifestValidation,
    marketplaceValid: marketplace.validJson,
    marketplaceEntryPresent: !!entry,
    marketplaceEntryResolves: entryResolvedPath === pluginDir,
    marketplaceEntryPath: entry?.source?.path ?? "",
    marketplaceEntryResolvedPath: entryResolvedPath,
    marketplaceReady,
    payloadComparison,
    codexCacheComparison,
    codexInstall,
    latestCheck: latest,
    blockers,
  };
}

function printText(summary) {
  console.log("Helmsman Plugin Status");
  console.log("Read-only: yes");
  console.log(`Ready: ${summary.ready ? "yes" : "no"}`);
  console.log(`Generated payload: ${summary.generatedPayloadPresent ? "present" : "missing"}`);
  console.log(`Installed payload: ${summary.installedPayloadPresent ? "present" : "missing"}`);
  console.log(
    `Installed payload manifest: ${summary.installedPayloadManifestPresent ? "present" : "missing"}`,
  );
  console.log(`Installed payload manifest valid: ${summary.payloadManifestValidation.valid ? "yes" : "no"}`);
  console.log(
    `Payload comparison: ${
      summary.payloadComparison.required
        ? summary.payloadComparison.matches
          ? "matches generated"
          : "differs from generated"
        : "skipped"
    }`,
  );
  console.log(`Marketplace: ${summary.marketplacePath}`);
  console.log(`Marketplace valid: ${summary.marketplaceValid ? "yes" : "no"}`);
  console.log(`Marketplace entry: ${summary.marketplaceEntryPresent ? "present" : "missing"}`);
  console.log(`Marketplace entry resolves: ${summary.marketplaceEntryResolves ? "yes" : "no"}`);
  console.log(`Codex cache installed: ${summary.codexInstall.cachePresent ? "yes" : "no"}`);
  console.log(
    `Codex cache payload: ${summary.codexCacheComparison.matches ? "matches installed" : "differs from installed"}`,
  );
  console.log(`Codex config enabled: ${summary.codexInstall.configEnabled ? "yes" : "no"}`);
  if (summary.codexInstall.cacheDir) console.log(`Codex cache: ${summary.codexInstall.cacheDir}`);
  if (summary.latestCheck.checked) {
    console.log(`Installed version: ${summary.latestCheck.installedVersion || "missing"}`);
    if (summary.latestCheck.latestVersion) {
      console.log(`Latest npm version: ${summary.latestCheck.latestVersion}`);
      console.log(`Update available: ${summary.latestCheck.updateAvailable ? "yes" : "no"}`);
      if (summary.latestCheck.updateAvailable) console.log("Update command: helmsman update");
    } else {
      console.log(`Latest npm version: unavailable${summary.latestCheck.error ? ` (${summary.latestCheck.error})` : ""}`);
    }
  }
  if (summary.marketplaceEntryPath) {
    console.log(`Marketplace entry path: ${summary.marketplaceEntryPath}`);
    console.log(`Resolved entry path: ${summary.marketplaceEntryResolvedPath}`);
  }
  if (summary.blockers.length > 0) {
    console.log("Blockers:");
    for (const blocker of summary.blockers) console.log(`- ${blocker}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = await summarize(args);
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printText(summary);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
