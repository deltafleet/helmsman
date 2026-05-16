#!/usr/bin/env node
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = process.cwd();
const PLUGIN_NAME = "helmsman";
const SOURCE_PLUGIN_DIR = join(ROOT, "plugins/helmsman");

function usage() {
  return [
    "Usage: bun scripts/install-plugin.mjs --target-home [--dry-run] [--force]",
    "       bun scripts/install-plugin.mjs --plugin-dir <path> --marketplace <path> [--dry-run] [--force]",
    "Options:",
    "  --target-home       use ~/plugins/helmsman and ~/.agents/plugins/marketplace.json",
    "  --plugin-dir <path> override plugin install destination",
    "  --marketplace <path> override marketplace JSON destination",
    "  --dry-run           print planned writes without mutating files",
    "  --skip-build        copy the existing generated payload without rebuilding it",
    "  --codex-install     ask Codex to install/cache the marketplace plugin after writing files",
    "  --skip-codex-install do not call Codex even if a wrapper enabled Codex install",
    "  --codex-bin <path>   override the Codex CLI executable used for --codex-install",
    "  --force             replace existing Helmsman plugin dir or marketplace entry",
    "  --json              print machine-readable dry-run or install summary",
  ].join("\n");
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  const parsed = {
    targetHome: false,
    pluginDir: null,
    marketplace: null,
    dryRun: false,
    skipBuild: false,
    codexInstall: false,
    codexBin: process.env.HELMSMAN_CODEX_BIN || "codex",
    force: false,
    json: false,
  };
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--help" || flag === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (flag === "--target-home") {
      parsed.targetHome = true;
      continue;
    }
    if (flag === "--plugin-dir") {
      parsed.pluginDir = args.shift() ?? fail("--plugin-dir requires a value");
      continue;
    }
    if (flag === "--marketplace") {
      parsed.marketplace = args.shift() ?? fail("--marketplace requires a value");
      continue;
    }
    if (flag === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (flag === "--skip-build") {
      parsed.skipBuild = true;
      continue;
    }
    if (flag === "--codex-install") {
      parsed.codexInstall = true;
      continue;
    }
    if (flag === "--skip-codex-install") {
      parsed.codexInstall = false;
      continue;
    }
    if (flag === "--codex-bin") {
      parsed.codexBin = args.shift() ?? fail("--codex-bin requires a value");
      continue;
    }
    if (flag === "--force") {
      parsed.force = true;
      continue;
    }
    if (flag === "--json") {
      parsed.json = true;
      continue;
    }
    fail(`unknown argument: ${flag}`);
  }
  if (parsed.targetHome) {
    const home = process.env.HOME;
    if (!home) fail("HOME is required for --target-home");
    parsed.pluginDir ??= join(home, "plugins/helmsman");
    parsed.marketplace ??= join(home, ".agents/plugins/marketplace.json");
  }
  if (!parsed.pluginDir || !parsed.marketplace) {
    fail("choose --target-home or provide both --plugin-dir and --marketplace");
  }
  return parsed;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonAtomic(path, value) {
  const dir = dirname(path);
  const base = basename(path);
  const temp = join(dir, `.${base}.tmp-${process.pid}-${Date.now().toString(36)}`);
  await mkdir(dir, { recursive: true });
  try {
    await writeJson(temp, value);
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}

function marketplaceRoot(marketplacePath) {
  return resolve(dirname(marketplacePath), "../..");
}

function localSourcePath(pluginDir, marketplacePath) {
  const root = marketplaceRoot(marketplacePath);
  const rel = relative(root, resolve(pluginDir));
  if (!rel || rel.startsWith("..") || rel.includes(`..${sep}`)) {
    return resolve(pluginDir);
  }
  return `./${rel.split(sep).join("/")}`;
}

function marketplaceEntry(pluginDir, marketplacePath) {
  return {
    name: PLUGIN_NAME,
    source: {
      source: "local",
      path: localSourcePath(pluginDir, marketplacePath),
    },
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_INSTALL",
    },
    category: "Coding",
  };
}

function resolveMarketplacePluginPath(marketplacePath, entryPath) {
  if (typeof entryPath !== "string" || !entryPath) return "";
  if (isAbsolute(entryPath)) return resolve(entryPath);
  return resolve(marketplaceRoot(marketplacePath), entryPath);
}

function containsOrSame(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function assertInstallDestinationSafe(pluginDir) {
  const source = resolve(SOURCE_PLUGIN_DIR);
  const destination = resolve(pluginDir);
  if (containsOrSame(source, destination) || containsOrSame(destination, source)) {
    fail(
      [
        `plugin install destination overlaps generated source payload: ${destination}`,
        `Source payload: ${source}`,
        "Choose a separate install directory such as $HOME/plugins/helmsman.",
      ].join("\n"),
    );
  }
}

async function readMarketplace(path) {
  try {
    const body = await readFile(path, "utf8");
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed.plugins)) fail(`${path}: plugins must be an array`);
    return parsed;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        name: "local",
        interface: {
          displayName: "Local Plugins",
        },
        plugins: [],
      };
    }
    if (error instanceof SyntaxError) fail(`${path}: invalid JSON: ${error.message}`);
    throw error;
  }
}

async function pluginOwnership(pluginDir) {
  const info = await stat(pluginDir).catch((error) => {
    if (error && error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) {
    return { exists: false, owned: false };
  }
  if (!info.isDirectory()) {
    return {
      exists: true,
      owned: false,
      reason: "existing plugin path is not a directory",
    };
  }
  for (const rel of [".codex-plugin/plugin.json", ".claude-plugin/plugin.json"]) {
    try {
      const parsed = JSON.parse(await readFile(join(pluginDir, rel), "utf8"));
      if (parsed.name === PLUGIN_NAME) return { exists: true, owned: true };
    } catch (error) {
      if (error && error.code === "ENOENT") continue;
      if (error instanceof SyntaxError) {
        return {
          exists: true,
          owned: false,
          reason: `${rel} is invalid JSON`,
        };
      }
      throw error;
    }
  }
  return {
    exists: true,
    owned: false,
    reason: "missing Helmsman plugin manifest",
  };
}

function withHelmsmanEntry(marketplace, entry, { force, pluginDir, marketplacePath }) {
  const existing = marketplace.plugins.find((plugin) => plugin?.name === PLUGIN_NAME);
  if (existing && !force) {
    if (existing.source?.source !== "local") {
      fail("marketplace helmsman entry is not local; pass --force to replace");
    }
    const existingPath = resolveMarketplacePluginPath(marketplacePath, existing.source?.path);
    if (existingPath !== resolve(pluginDir)) {
      fail("marketplace helmsman entry points at a different plugin directory; pass --force to replace");
    }
  }
  return {
    marketplace: {
      ...marketplace,
      plugins: [
        ...marketplace.plugins.filter((plugin) => plugin?.name !== PLUGIN_NAME),
        entry,
      ],
    },
    replacedExistingMarketplaceEntry: !!existing,
  };
}

function buildSourcePlugin({ quiet = false } = {}) {
  const result = spawnSync(process.execPath, ["scripts/build-plugin.mjs"], {
    cwd: ROOT,
    encoding: quiet ? "utf8" : undefined,
    stdio: quiet ? "pipe" : "inherit",
    env: process.env,
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) {
    if (quiet) {
      const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
      fail(detail || "plugin source build failed");
    }
    process.exit(result.status ?? 1);
  }
}

function installIntoCodex({ codexBin, marketplacePath, timeoutMs = 30000 }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(codexBin, ["app-server", "--listen", "stdio://"], {
      cwd: ROOT,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";
    let settled = false;
    const timer = setTimeout(() => {
      finish(
        new Error(
          [
            `timed out waiting for Codex plugin install after ${timeoutMs}ms`,
            `Codex executable: ${codexBin}`,
          ].join("\n"),
        ),
      );
    }, timeoutMs);

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.destroy();
      child.kill();
      if (error) reject(error);
      else resolvePromise(value);
    }

    function send(id, method, params) {
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    }

    child.on("error", (error) => {
      finish(
        new Error(
          [
            `failed to start Codex CLI for plugin install: ${error.message}`,
            `Codex executable: ${codexBin}`,
          ].join("\n"),
        ),
      );
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id === 1) {
          if (message.error) {
            finish(new Error(`Codex initialize failed: ${JSON.stringify(message.error)}`));
            return;
          }
          send(2, "plugin/install", {
            marketplacePath,
            pluginName: PLUGIN_NAME,
            remoteMarketplaceName: null,
          });
          continue;
        }
        if (message.id === 2) {
          if (message.error) {
            finish(new Error(`Codex plugin install failed: ${JSON.stringify(message.error)}`));
            return;
          }
          finish(null, message.result ?? {});
          return;
        }
      }
    });
    child.on("exit", (code, signal) => {
      if (settled) return;
      finish(
        new Error(
          [
            `Codex app-server exited before plugin install completed: ${signal ?? code}`,
            stderr.trim() ? `stderr: ${stderr.trim()}` : "",
            stdout.trim() ? `stdout: ${stdout.trim()}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });

    send(1, "initialize", {
      clientInfo: {
        name: "helmsman-installer",
        version: "0.2.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });
  });
}

async function withMarketplaceLock(marketplacePath, action) {
  const parent = dirname(marketplacePath);
  const base = basename(marketplacePath);
  const lock = join(parent, `.${base}.install.lock`);
  let locked = false;

  await mkdir(parent, { recursive: true });
  try {
    try {
      await mkdir(lock);
      locked = true;
    } catch (error) {
      if (error && error.code === "EEXIST") {
        fail(
          [
            `marketplace install already in progress for ${marketplacePath}`,
            `Lock: ${lock}`,
            "If this is stale, remove the lock only after confirming no install is running.",
          ].join("\n"),
        );
      }
      throw error;
    }
    await writeJson(join(lock, "owner.json"), {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      marketplacePath,
      pluginName: PLUGIN_NAME,
    });
    return await action();
  } finally {
    if (locked) await rm(lock, { recursive: true, force: true }).catch(() => {});
  }
}

async function installPluginPayload(pluginDir, force, afterInstall = async () => {}) {
  const parent = dirname(pluginDir);
  const base = basename(pluginDir);
  const suffix = `${process.pid}-${Date.now().toString(36)}`;
  const lock = join(parent, `.${base}.install.lock`);
  const staging = join(parent, `.${base}.install.tmp-${suffix}`);
  const backup = join(parent, `.${base}.install.previous-${suffix}`);
  let locked = false;
  let installed = false;
  let committed = false;
  let backedUp = false;

  await mkdir(parent, { recursive: true });
  try {
    try {
      await mkdir(lock);
      locked = true;
    } catch (error) {
      if (error && error.code === "EEXIST") {
        fail(
          [
            `plugin install already in progress for ${pluginDir}`,
            `Lock: ${lock}`,
            "If this is stale, remove the lock only after confirming no install is running.",
          ].join("\n"),
        );
      }
      throw error;
    }
    await writeJson(join(lock, "owner.json"), {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      pluginDir,
      sourcePluginDir: SOURCE_PLUGIN_DIR,
    });

    const ownership = await pluginOwnership(pluginDir);
    if (ownership.exists && !force && !ownership.owned) {
      fail(
        [
          `existing plugin directory is not a Helmsman plugin: ${pluginDir}`,
          `Reason: ${ownership.reason}`,
          "Pass --force only if you intentionally want to replace it.",
        ].join("\n"),
      );
    }

    await rm(staging, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
    await cp(SOURCE_PLUGIN_DIR, staging, { recursive: true, force: true });

    if (await exists(pluginDir)) {
      await rename(pluginDir, backup);
      backedUp = true;
    }
    await rename(staging, pluginDir);
    installed = true;
    await afterInstall();
    committed = true;
  } finally {
    if (!committed && installed) {
      await rm(pluginDir, { recursive: true, force: true }).catch(() => {});
    }
    if (!committed && backedUp) {
      await rename(backup, pluginDir).catch(() => {});
    }
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    if (backedUp) await rm(backup, { recursive: true, force: true }).catch(() => {});
    if (locked) await rm(lock, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pluginDir = resolve(args.pluginDir);
  const marketplacePath = resolve(args.marketplace);
  assertInstallDestinationSafe(pluginDir);
  const entry = marketplaceEntry(pluginDir, marketplacePath);
  const existingPlugin = await pluginOwnership(pluginDir);
  const summary = {
    dryRun: args.dryRun,
    sourcePluginDir: SOURCE_PLUGIN_DIR,
    pluginDir,
    marketplacePath,
    marketplaceEntry: entry,
    skipBuild: args.skipBuild,
    codexInstall: {
      requested: args.codexInstall,
      installed: false,
      codexBin: args.codexBin,
      authPolicy: "",
      appsNeedingAuth: [],
    },
    replacedExistingPlugin: existingPlugin.exists,
    replacedExistingMarketplaceEntry: false,
    plannedWrites: args.codexInstall
      ? [pluginDir, marketplacePath, "Codex plugin cache/config"]
      : [pluginDir, marketplacePath],
  };

  if (args.dryRun) {
    const marketplace = await readMarketplace(marketplacePath);
    const planned = withHelmsmanEntry(marketplace, entry, {
      force: args.force,
      pluginDir,
      marketplacePath,
    });
    summary.replacedExistingMarketplaceEntry = planned.replacedExistingMarketplaceEntry;
    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`plugin install dry-run: ${PLUGIN_NAME}`);
      console.log(`pluginDir: ${pluginDir}`);
      console.log(`marketplace: ${marketplacePath}`);
      console.log(JSON.stringify(entry, null, 2));
    }
    return;
  }

  if (!args.skipBuild) {
    buildSourcePlugin({ quiet: args.json });
  }
  await withMarketplaceLock(marketplacePath, async () => {
    const marketplace = await readMarketplace(marketplacePath);
    const planned = withHelmsmanEntry(marketplace, entry, {
      force: args.force,
      pluginDir,
      marketplacePath,
    });
    summary.replacedExistingMarketplaceEntry = planned.replacedExistingMarketplaceEntry;
    await installPluginPayload(pluginDir, args.force, async () => {
      await writeJsonAtomic(marketplacePath, planned.marketplace);
    });
  });
  if (args.codexInstall) {
    const result = await installIntoCodex({
      codexBin: args.codexBin,
      marketplacePath,
    });
    summary.codexInstall = {
      ...summary.codexInstall,
      installed: true,
      authPolicy: result.authPolicy ?? "",
      appsNeedingAuth: result.appsNeedingAuth ?? [],
    };
  }

  if (args.json) {
    console.log(JSON.stringify({ ...summary, dryRun: false }, null, 2));
  } else {
    console.log(`plugin install pass: ${pluginDir}`);
    console.log(`marketplace updated: ${marketplacePath}`);
    if (summary.codexInstall.installed) {
      console.log("Codex plugin installed: yes");
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
