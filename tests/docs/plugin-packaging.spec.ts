import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, cp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect } from "vitest";
import { test, writeFixture } from "../helpers/tmpdir";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const PLUGIN = join(ROOT, "plugins/helmsman");

async function readPackageVersion() {
  const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  return packageJson.version;
}

async function runScript(script: string, args: string[] = [], options = {}) {
  return execFileAsync(process.execPath, [script, ...args], { cwd: ROOT, ...options });
}

async function runCli(args: string[] = [], options = {}) {
  return execFileAsync(process.execPath, ["bin/helmsman.mjs", ...args], {
    cwd: ROOT,
    ...options,
  });
}

async function refreshPayloadManifestEntry(pluginRoot: string, path: string) {
  const manifestPath = join(pluginRoot, ".codex-plugin/payload-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const bytes = await readFile(join(pluginRoot, path));
  const entry = manifest.files.find((file: { path: string }) => file.path === path);
  if (!entry) throw new Error(`missing payload manifest entry for ${path}`);
  entry.bytes = bytes.byteLength;
  entry.sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function writeFakeCodex(tmpdir: string) {
  const fakeBin = join(tmpdir, "fake-bin");
  const fakeCodex = join(fakeBin, "codex");
  const logPath = join(tmpdir, "fake-codex-rpc.log");
  await mkdir(fakeBin, { recursive: true });
  await writeFile(
    fakeCodex,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const args = process.argv.slice(2);
if (!(args[0] === "app-server" && args[1] === "--listen" && args[2] === "stdio://")) {
  console.error("unexpected fake codex args: " + args.join(" "));
  process.exit(64);
}

let buffer = "";
function send(message) {
  process.stdout.write(JSON.stringify(message) + "\\n");
}
function marketplaceRoot(marketplacePath) {
  return path.resolve(path.dirname(marketplacePath), "../..");
}
function resolveEntryPath(marketplacePath, entryPath) {
  return path.isAbsolute(entryPath)
    ? path.resolve(entryPath)
    : path.resolve(marketplaceRoot(marketplacePath), entryPath);
}
function installPlugin(params) {
  const marketplace = JSON.parse(fs.readFileSync(params.marketplacePath, "utf8"));
  const entry = marketplace.plugins.find((plugin) => plugin && plugin.name === params.pluginName);
  if (!entry) throw new Error("missing plugin entry");
  const source = resolveEntryPath(params.marketplacePath, entry.source.path);
  const manifest = JSON.parse(fs.readFileSync(path.join(source, ".codex-plugin/plugin.json"), "utf8"));
  const codexHome = process.env.CODEX_HOME || path.join(process.env.HOME, ".codex");
  const cacheDir = path.join(codexHome, "plugins/cache/local/helmsman", manifest.version);
  fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
  fs.cpSync(source, cacheDir, { recursive: true });
  const configPath = path.join(codexHome, "config.toml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.appendFileSync(configPath, '\\n[plugins."helmsman@local"]\\nenabled = true\\n');
  fs.appendFileSync(
    process.env.FAKE_CODEX_RPC_LOG,
    JSON.stringify({
      method: "plugin/install",
      marketplacePath: params.marketplacePath,
      pluginName: params.pluginName,
      cacheDir,
    }) + "\\n",
  );
  return { authPolicy: "ON_INSTALL", appsNeedingAuth: [] };
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\\r?\\n/);
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.method === "initialize") {
      send({
        id: message.id,
        result: {
          userAgent: "fake-codex/0.0.0",
          codexHome: process.env.CODEX_HOME || path.join(process.env.HOME, ".codex"),
          platformFamily: "unix",
          platformOs: "macos",
        },
      });
      continue;
    }
    if (message.method === "plugin/install") {
      try {
        send({ id: message.id, result: installPlugin(message.params) });
        process.exit(0);
      } catch (error) {
        send({ id: message.id, error: { message: error.message } });
        process.exit(1);
      }
    }
  }
});
`,
  );
  await chmod(fakeCodex, 0o755);
  return {
    fakeCodex,
    logPath,
    env: {
      ...process.env,
      HOME: tmpdir,
      PATH: `${fakeBin}:${process.env.PATH}`,
      HELMSMAN_CODEX_BIN: fakeCodex,
      FAKE_CODEX_RPC_LOG: logPath,
    },
  };
}

async function writeFakeNpx(tmpdir: string) {
  const fakeBin = join(tmpdir, "fake-bin");
  const fakeNpx = join(fakeBin, "npx");
  const logPath = join(tmpdir, "fake-npx.log");
  await mkdir(fakeBin, { recursive: true });
  await writeFile(
    fakeNpx,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.writeFileSync(process.env.FAKE_NPX_LOG, JSON.stringify(args) + "\\n");
process.stdout.write(JSON.stringify({ args }) + "\\n");
`,
  );
  await chmod(fakeNpx, 0o755);
  return {
    fakeNpx,
    logPath,
    env: {
      ...process.env,
      HELMSMAN_NPX_BIN: fakeNpx,
      FAKE_NPX_LOG: logPath,
    },
  };
}

async function startFakeRegistry(version: string) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url || "");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ version }));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fake registry did not bind");
  return {
    registry: `http://127.0.0.1:${address.port}/`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

describe("Codex plugin packaging", () => {
  test("npm package metadata exposes the installer CLI and public package payload", async () => {
    const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));

    expect(packageJson.bin).toEqual({ helmsman: "bin/helmsman.mjs" });
    expect(packageJson.publishConfig).toEqual({ access: "public" });
    expect(packageJson.scripts.prepack).toBe(
      "bun run build:plugin && bun run verify:plugin && bun run verify:version",
    );
    expect(packageJson.scripts["verify:version"]).toBe(
      "bun scripts/verify-version-consistency.mjs",
    );
    expect(packageJson.files).toEqual(
      expect.arrayContaining([
        "bin/",
        "scripts/",
        "plugins/helmsman/",
        "skills/",
        ".agents/plugins/marketplace.json",
        ".claude-plugin/marketplace.json",
      ]),
    );
  });

  test("build creates the expected manifest and skill tree", async () => {
    await runScript("scripts/build-plugin.mjs");

    const manifest = JSON.parse(
      await readFile(join(PLUGIN, ".codex-plugin/plugin.json"), "utf8"),
    );
    const claudeManifest = JSON.parse(
      await readFile(join(PLUGIN, ".claude-plugin/plugin.json"), "utf8"),
    );
    const payloadManifest = JSON.parse(
      await readFile(join(PLUGIN, ".codex-plugin/payload-manifest.json"), "utf8"),
    );
    expect(manifest.name).toBe("helmsman");
    expect(manifest.skills).toBe("./skills/");
    expect(manifest.interface.displayName).toBe("Helmsman");
    expect(manifest.interface.category).toBe("Coding");
    expect(manifest.interface.capabilities).toEqual(["Interactive", "Read", "Write"]);
    expect(manifest.interface.defaultPrompt.length).toBeLessThanOrEqual(3);
    expect(manifest.agents).toBeUndefined();
    expect(manifest.mcpServers).toBeUndefined();
    expect(manifest.hooks).toBeUndefined();
    expect(claudeManifest).toMatchObject({
      name: "helmsman",
      version: manifest.version,
      repository: "https://github.com/deltafleet/helmsman",
      license: "MIT",
    });
    expect(claudeManifest.agents).toBeUndefined();
    expect(claudeManifest.hooks).toBeUndefined();
    expect(claudeManifest.mcpServers).toBeUndefined();
    expect(payloadManifest).toMatchObject({
      schemaVersion: 1,
      plugin: "helmsman",
      version: manifest.version,
      generatedBy: "scripts/build-plugin.mjs",
    });
    expect(payloadManifest.files.map((file: { path: string }) => file.path)).toContain(
      ".codex-plugin/plugin.json",
    );
    expect(payloadManifest.files.map((file: { path: string }) => file.path)).toContain(
      ".claude-plugin/plugin.json",
    );
    expect(payloadManifest.files.map((file: { path: string }) => file.path)).toContain(
      "skills/helmsman/SKILL.md",
    );
    expect(payloadManifest.files.map((file: { path: string }) => file.path)).toContain(
      "skills/helmsman/references/release-guards.md",
    );
    expect(payloadManifest.files.map((file: { path: string }) => file.path)).not.toContain(
      ".codex-plugin/payload-manifest.json",
    );
    expect(payloadManifest.files.every((file: { sha256: string }) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true);

    const rootSkill = await readFile(join(PLUGIN, "skills/helmsman/SKILL.md"), "utf8");
    expect(rootSkill).toContain("name: helmsman");
    expect(rootSkill).toContain("Helmsman protocol workspace");
    expect(rootSkill).toContain("does not install Codex custom agents");
    expect(rootSkill).toContain("research-index.md");
    expect(rootSkill).toContain("research/");
    expect(rootSkill).toContain("references/release-guards.md");

    const chartingSkill = await readFile(
      join(PLUGIN, "skills/helmsman-charting/SKILL.md"),
      "utf8",
    );
    const routeTemplate = await readFile(
      join(PLUGIN, "skills/helmsman-charting/templates/route-card.md"),
      "utf8",
    );
    expect(chartingSkill).toContain("Parallel research is the default");
    expect(chartingSkill).toContain("host-neutral research worker packets");
    expect(routeTemplate).toContain("Parallel research posture:");
    expect(routeTemplate).toContain("Research worker packets:");
    expect(routeTemplate).toContain("Lead-only lanes:");
  });

  test("repository marketplace descriptor exposes the generated Helmsman plugin", async () => {
    const marketplace = JSON.parse(
      await readFile(join(ROOT, ".agents/plugins/marketplace.json"), "utf8"),
    );
    const claudeMarketplace = JSON.parse(
      await readFile(join(ROOT, ".claude-plugin/marketplace.json"), "utf8"),
    );

    expect(marketplace).toMatchObject({
      name: "helmsman-plugin",
      interface: {
        displayName: "Helmsman",
      },
      plugins: [
        {
          name: "helmsman",
          source: {
            source: "local",
            path: "./plugins/helmsman",
          },
          policy: {
            installation: "AVAILABLE",
            authentication: "ON_INSTALL",
          },
          category: "Coding",
        },
      ],
    });
    expect(claudeMarketplace).toMatchObject({
      name: "deltafleet",
      owner: {
        name: "Deltafleet",
      },
      plugins: [
        {
          name: "helmsman",
          source: "./plugins/helmsman",
          repository: "https://github.com/deltafleet/helmsman",
          license: "MIT",
          category: "Coding",
        },
      ],
    });
  });

  test("build preserves templates, phase files, role sidecars, release guards, and skill UI metadata", async () => {
    await runScript("scripts/build-plugin.mjs");

    const files = [
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
      "skills/helmsman-charting/templates/research.md",
      "skills/helmsman-charting/templates/worker-packets.md",
      "skills/helmsman-charting/templates/evidence.md",
      "skills/helmsman-charting/roles/researcher.md",
      "skills/helmsman-autopilot/templates/director-blueprint.md",
      "skills/helmsman-autopilot/phases/strategy.md",
      "skills/helmsman-autopilot/roles/director.md",
      "skills/helmsman-autopilot/agents/openai.yaml",
      "skills/helmsman-verify/templates/verification.md",
      "skills/helmsman-verify/templates/retro.md",
      "skills/helmsman/references/release-guards.md",
    ];
    for (const file of files) {
      const body = await readFile(join(PLUGIN, file), "utf8");
      expect(body.trim().length).toBeGreaterThan(20);
    }
    await expect(readFile(join(PLUGIN, "agents/strategist.toml"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    const guardReference = await readFile(
      join(PLUGIN, "skills/helmsman/references/release-guards.md"),
      "utf8",
    );
    expect(guardReference).toContain("Plugin payload note");
    expect(guardReference).toContain("HELMSMAN_ROOT");
    expect(guardReference).toContain("installed plugin payload directory");
    expect(guardReference).toContain("Release Guards");
    expect(guardReference).toContain("Public Release Checklist");
    expect(guardReference).toContain("npm publish --access public");
  });

  test("build uses a temporary staging directory without leaving staging artifacts", async ({
    tmpdir,
  }) => {
    const output = join(tmpdir, "helmsman-plugin");

    await runScript("scripts/build-plugin.mjs", ["--output", output]);

    const manifest = JSON.parse(
      await readFile(join(output, ".codex-plugin/plugin.json"), "utf8"),
    );
    const entries = await readdir(tmpdir);
    expect(manifest.name).toBe("helmsman");
    expect(entries).toContain("helmsman-plugin");
    expect(entries).not.toContain(".helmsman-plugin.build.lock");
    expect(entries.some((entry) => entry.startsWith(".helmsman-plugin.tmp-"))).toBe(false);
    expect(entries.some((entry) => entry.startsWith(".helmsman-plugin.previous-"))).toBe(false);
  });

  test("build rejects a concurrent build lock for the same output", async ({ tmpdir }) => {
    const output = join(tmpdir, "helmsman-plugin");
    const lock = join(tmpdir, ".helmsman-plugin.build.lock");
    await mkdir(lock);

    await expect(
      runScript("scripts/build-plugin.mjs", ["--output", output]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("plugin build already in progress"),
    });

    try {
      await runScript("scripts/build-plugin.mjs", ["--output", output]);
    } catch (error) {
      const stderr = (error as { stderr: string }).stderr;
      const entries = await readdir(tmpdir);
      expect(stderr).toContain(`Lock: ${lock}`);
      expect(stderr).toContain("remove the lock only after confirming no build is running");
      expect(entries).toContain(".helmsman-plugin.build.lock");
      expect(entries.some((entry) => entry.startsWith(".helmsman-plugin.tmp-"))).toBe(false);
      expect(entries.some((entry) => entry.startsWith(".helmsman-plugin.previous-"))).toBe(false);
    }
  });

  test("build rejects missing source skill assets", async ({ tmpdir }) => {
    await writeFixture(tmpdir, "package.json", JSON.stringify({ version: "0.0.0" }));
    await writeFixture(
      tmpdir,
      "SKILL.md",
      "---\nname: helmsman\ndescription: temporary root skill for plugin build failure test.\n---\n",
    );
    await writeFixture(
      tmpdir,
      "docs/release-guards.md",
      "# Temporary Release Guards\n\nNon-empty release guard reference for missing skill asset test.\n",
    );

    await expect(
      runScript("scripts/build-plugin.mjs", [
        "--source-root",
        tmpdir,
        "--output",
        join(tmpdir, "plugin"),
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("skills/helmsman-charting/SKILL.md is missing"),
    });
  });

  test("verification rejects removed current-facing command surfaces", async ({ tmpdir }) => {
    await runScript("scripts/build-plugin.mjs");
    const copied = join(tmpdir, "helmsman-plugin");
    await cp(PLUGIN, copied, { recursive: true });
    await writeFixture(
      tmpdir,
      "helmsman-plugin/skills/helmsman/SKILL.md",
      [
        "---",
        "name: helmsman",
        "description: temporary plugin skill with a removed command surface.",
        "---",
        "# Helmsman",
        "",
        "Run `helmsman runtime` for the old controller.",
        "",
      ].join("\n"),
    );

    await expect(
      runScript("scripts/verify-plugin.mjs", ["--plugin-dir", copied]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("removed current-facing surface 'helmsman runtime'"),
    });
  });

  test("verification rejects custom-agent claims in the native plugin manifest", async ({
    tmpdir,
  }) => {
    await runScript("scripts/build-plugin.mjs");
    const copied = join(tmpdir, "helmsman-plugin");
    await cp(PLUGIN, copied, { recursive: true });
    const manifestPath = join(copied, ".codex-plugin/plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.agents = "./agents/";
    await writeFixture(
      tmpdir,
      "helmsman-plugin/.codex-plugin/plugin.json",
      JSON.stringify(manifest, null, 2),
    );

    await expect(
      runScript("scripts/verify-plugin.mjs", ["--plugin-dir", copied]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("plugin manifest must not define agents"),
    });
  });

  test("verification rejects custom-agent claims in the Claude plugin manifest", async ({
    tmpdir,
  }) => {
    await runScript("scripts/build-plugin.mjs");
    const copied = join(tmpdir, "helmsman-plugin");
    await cp(PLUGIN, copied, { recursive: true });
    const manifestPath = join(copied, ".claude-plugin/plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.agents = "./agents/";
    await writeFixture(
      tmpdir,
      "helmsman-plugin/.claude-plugin/plugin.json",
      JSON.stringify(manifest, null, 2),
    );
    await refreshPayloadManifestEntry(copied, ".claude-plugin/plugin.json");

    await expect(
      runScript("scripts/verify-plugin.mjs", ["--plugin-dir", copied]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Claude plugin manifest must not define agents"),
    });
  });

  test("verification rejects symlinks and other non-regular payload entries", async ({
    tmpdir,
  }) => {
    await runScript("scripts/build-plugin.mjs");
    const copied = join(tmpdir, "helmsman-plugin");
    await cp(PLUGIN, copied, { recursive: true });
    await symlink(
      join(tmpdir, "outside.md"),
      join(copied, "skills/helmsman/templates-linked.md"),
    );

    await expect(
      runScript("scripts/verify-plugin.mjs", ["--plugin-dir", copied]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "plugin payload must not include non-regular entry skills/helmsman/templates-linked.md",
      ),
    });
  });

  test("verification rejects payload changes that do not match the managed manifest", async ({
    tmpdir,
  }) => {
    await runScript("scripts/build-plugin.mjs");
    const copied = join(tmpdir, "helmsman-plugin");
    await cp(PLUGIN, copied, { recursive: true });
    const rootSkill = await readFile(join(copied, "skills/helmsman/SKILL.md"), "utf8");
    await writeFixture(
      tmpdir,
      "helmsman-plugin/skills/helmsman/SKILL.md",
      `${rootSkill}\n\nUnmanifested payload mutation.\n`,
    );

    await expect(
      runScript("scripts/verify-plugin.mjs", ["--plugin-dir", copied]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "payload manifest byte count mismatch at skills/helmsman/SKILL.md",
      ),
    });
  });

  test("verification rejects payload files missing from the managed manifest", async ({
    tmpdir,
  }) => {
    await runScript("scripts/build-plugin.mjs");
    const copied = join(tmpdir, "helmsman-plugin");
    await cp(PLUGIN, copied, { recursive: true });
    await writeFixture(tmpdir, "helmsman-plugin/skills/helmsman/extra-note.md", "# Extra\n");

    await expect(
      runScript("scripts/verify-plugin.mjs", ["--plugin-dir", copied]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "payload manifest is missing entries for files: skills/helmsman/extra-note.md",
      ),
    });
  });

  test("home install dry-run reports plugin path and marketplace entry without writes", async ({
    tmpdir,
  }) => {
    const { stdout } = await runScript(
      "scripts/install-plugin.mjs",
      ["--target-home", "--dry-run", "--json"],
      { env: { ...process.env, HOME: tmpdir } },
    );

    const parsed = JSON.parse(stdout);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.pluginDir).toBe(join(tmpdir, "plugins/helmsman"));
    expect(parsed.marketplacePath).toBe(join(tmpdir, ".agents/plugins/marketplace.json"));
    expect(parsed.codexInstall.requested).toBe(true);
    expect(parsed.plannedWrites).toContain("Codex plugin cache/config");
    expect(parsed.marketplaceEntry).toMatchObject({
      name: "helmsman",
      source: {
        source: "local",
        path: "./plugins/helmsman",
      },
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_INSTALL",
      },
      category: "Coding",
    });
  });

  test("npm CLI install dry-run defaults to Codex home plugin paths", async ({ tmpdir }) => {
    const { stdout } = await runCli(["install", "--dry-run", "--json"], {
      env: { ...process.env, HOME: tmpdir },
    });

    const parsed = JSON.parse(stdout);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.skipBuild).toBe(true);
    expect(parsed.pluginDir).toBe(join(tmpdir, "plugins/helmsman"));
    expect(parsed.marketplacePath).toBe(join(tmpdir, ".agents/plugins/marketplace.json"));
    expect(parsed.marketplaceEntry).toMatchObject({
      name: "helmsman",
      source: { source: "local", path: "./plugins/helmsman" },
    });
  });

  test("npm CLI install copies the generated payload without requiring source build flags", async ({
    tmpdir,
  }) => {
    await runScript("scripts/build-plugin.mjs");
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");

    const { stdout } = await runCli([
      "install",
      "--plugin-dir",
      pluginDir,
      "--marketplace",
      marketplace,
      "--json",
    ]);

    const parsed = JSON.parse(stdout);
    expect(parsed.skipBuild).toBe(true);
    expect(parsed.pluginDir).toBe(pluginDir);
    expect(parsed.marketplacePath).toBe(marketplace);
    const { stdout: verifyStdout } = await runScript("scripts/verify-plugin.mjs", [
      "--plugin-dir",
      pluginDir,
      "--compare-to",
      PLUGIN,
    ]);
    expect(verifyStdout).toContain(`plugin payload matches: ${PLUGIN}`);
  });

  test("npm CLI doctor renders read-only install status", async ({ tmpdir }) => {
    const fake = await writeFakeCodex(tmpdir);
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");

    await runScript("scripts/install-plugin.mjs", [
      "--plugin-dir",
      pluginDir,
      "--marketplace",
      marketplace,
      "--codex-install",
    ], {
      env: fake.env,
    });

    const { stdout } = await runCli(
      [
        "doctor",
        "--plugin-dir",
        pluginDir,
        "--marketplace",
        marketplace,
        "--compare-to",
        PLUGIN,
        "--no-latest-check",
        "--json",
      ],
      {
        env: fake.env,
      },
    );

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      ready: true,
      readOnly: true,
      pluginDir,
      marketplacePath: marketplace,
      blockers: [],
    });
  });

  test("npm CLI doctor reports npm latest updates without mutating install state", async ({
    tmpdir,
  }) => {
    const version = await readPackageVersion();
    const fake = await writeFakeCodex(tmpdir);
    await runCli(["install", "--json"], {
      env: fake.env,
    });
    const registry = await startFakeRegistry("9.9.9");
    try {
      const { stdout } = await runCli(["doctor", "--json"], {
        env: {
          ...fake.env,
          HELMSMAN_NPM_REGISTRY: registry.registry,
        },
      });

      const parsed = JSON.parse(stdout);
      expect(parsed.ready).toBe(true);
      expect(parsed.payloadComparison).toMatchObject({
        checked: false,
        required: false,
      });
      expect(parsed.latestCheck).toMatchObject({
        checked: true,
        packageName: "@deltafleet/helmsman",
        installedVersion: version,
        latestVersion: "9.9.9",
        updateAvailable: true,
        relation: "behind",
      });
      expect(registry.requests).toEqual([
        expect.stringContaining("%40deltafleet%2Fhelmsman/latest"),
      ]);
    } finally {
      await registry.close();
    }
  });

  test("npm CLI update delegates to the npm latest installer", async ({ tmpdir }) => {
    const fake = await writeFakeNpx(tmpdir);

    const { stdout } = await runCli(["update", "--dry-run", "--json", "--skip-codex-install"], {
      env: fake.env,
    });

    const parsed = JSON.parse(stdout);
    expect(parsed.args).toEqual([
      "--yes",
      "@deltafleet/helmsman@latest",
      "install",
      "--dry-run",
      "--json",
      "--skip-codex-install",
    ]);
    const log = JSON.parse(await readFile(fake.logPath, "utf8"));
    expect(log).toEqual(parsed.args);
  });

  test("npm CLI version reports package and generated plugin versions", async () => {
    await runScript("scripts/build-plugin.mjs");

    const packageJson = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
    const { stdout } = await runCli(["version", "--json"]);
    const parsed = JSON.parse(stdout);

    expect(parsed).toEqual({
      packageName: "@deltafleet/helmsman",
      packageVersion: packageJson.version,
      codexPluginVersion: packageJson.version,
      claudePluginVersion: packageJson.version,
      payloadManifestVersion: packageJson.version,
      claudeMarketplaceVersion: packageJson.version,
    });
  });

  test("home install rejects destinations overlapping the generated source payload", async ({
    tmpdir,
  }) => {
    const marketplace = join(tmpdir, "marketplace.json");

    await expect(
      runScript("scripts/install-plugin.mjs", [
        "--plugin-dir",
        PLUGIN,
        "--marketplace",
        marketplace,
        "--dry-run",
        "--force",
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("plugin install destination overlaps generated source payload"),
    });

    await expect(
      runScript("scripts/install-plugin.mjs", [
        "--plugin-dir",
        join(ROOT, "plugins"),
        "--marketplace",
        marketplace,
        "--dry-run",
        "--force",
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Choose a separate install directory"),
    });
  });

  test("home install uses staged replacement without leaving install artifacts", async ({
    tmpdir,
  }) => {
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");

    await runScript("scripts/install-plugin.mjs", [
      "--plugin-dir",
      pluginDir,
      "--marketplace",
      marketplace,
      "--force",
    ]);

    const pluginParentEntries = await readdir(join(tmpdir, "plugins"));
    const marketplaceEntries = await readdir(join(tmpdir, ".agents/plugins"));
    expect(pluginParentEntries).toContain("helmsman");
    expect(pluginParentEntries).not.toContain(".helmsman.install.lock");
    expect(pluginParentEntries.some((entry) => entry.startsWith(".helmsman.install.tmp-"))).toBe(false);
    expect(pluginParentEntries.some((entry) => entry.startsWith(".helmsman.install.previous-"))).toBe(false);
    expect(marketplaceEntries).toContain("marketplace.json");
    expect(marketplaceEntries.some((entry) => entry.startsWith(".marketplace.json.tmp-"))).toBe(false);
    expect(marketplaceEntries).not.toContain(".marketplace.json.install.lock");
  });

  test("home install is idempotent for an existing Helmsman-owned install without force", async ({
    tmpdir,
  }) => {
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");

    await runScript("scripts/install-plugin.mjs", [
      "--plugin-dir",
      pluginDir,
      "--marketplace",
      marketplace,
    ]);
    const { stdout } = await runScript("scripts/install-plugin.mjs", [
      "--plugin-dir",
      pluginDir,
      "--marketplace",
      marketplace,
      "--json",
    ]);

    const parsed = JSON.parse(stdout);
    expect(parsed.replacedExistingPlugin).toBe(true);
    expect(parsed.replacedExistingMarketplaceEntry).toBe(true);
    const installedManifest = JSON.parse(
      await readFile(join(pluginDir, ".codex-plugin/plugin.json"), "utf8"),
    );
    expect(installedManifest.name).toBe("helmsman");
  });

  test("home install still rejects an existing non-Helmsman directory without force", async ({
    tmpdir,
  }) => {
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");
    await writeFixture(tmpdir, "plugins/helmsman/foreign.txt", "not helmsman\n");

    await expect(
      runScript("scripts/install-plugin.mjs", [
        "--plugin-dir",
        pluginDir,
        "--marketplace",
        marketplace,
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("existing plugin directory is not a Helmsman plugin"),
    });
  });

  test("home install still rejects a marketplace entry pointing elsewhere without force", async ({
    tmpdir,
  }) => {
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");
    await writeFixture(
      tmpdir,
      ".agents/plugins/marketplace.json",
      JSON.stringify(
        {
          name: "local",
          interface: { displayName: "Local Plugins" },
          plugins: [
            {
              name: "helmsman",
              source: { source: "local", path: "./plugins/other-helmsman" },
              policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
              category: "Coding",
            },
          ],
        },
        null,
        2,
      ),
    );

    await expect(
      runScript("scripts/install-plugin.mjs", [
        "--plugin-dir",
        pluginDir,
        "--marketplace",
        marketplace,
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("marketplace helmsman entry points at a different plugin directory"),
    });
  });

  test("home install removes stale files from the previous plugin payload", async ({
    tmpdir,
  }) => {
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");
    await writeFixture(tmpdir, "plugins/helmsman/stale-root-file.md", "# stale\n");
    await writeFixture(
      tmpdir,
      "plugins/helmsman/skills/helmsman/stale-skill-file.md",
      "# stale skill\n",
    );

    await runScript("scripts/install-plugin.mjs", [
      "--plugin-dir",
      pluginDir,
      "--marketplace",
      marketplace,
      "--force",
    ]);

    await expect(readFile(join(pluginDir, "stale-root-file.md"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      readFile(join(pluginDir, "skills/helmsman/stale-skill-file.md"), "utf8"),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
    const { stdout } = await runScript("scripts/verify-plugin.mjs", [
      "--plugin-dir",
      pluginDir,
      "--compare-to",
      PLUGIN,
    ]);
    expect(stdout).toContain(`plugin payload matches: ${PLUGIN}`);
  });

  test("home install actual --json emits parseable JSON without build noise", async ({
    tmpdir,
  }) => {
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");

    const { stdout } = await runScript("scripts/install-plugin.mjs", [
      "--plugin-dir",
      pluginDir,
      "--marketplace",
      marketplace,
      "--force",
      "--json",
    ]);

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      dryRun: false,
      pluginDir,
      marketplacePath: marketplace,
      marketplaceEntry: {
        name: "helmsman",
        source: { source: "local", path: "./plugins/helmsman" },
      },
    });
  });

  test("helmsman install registers the plugin with Codex cache and config", async ({
    tmpdir,
  }) => {
    const fake = await writeFakeCodex(tmpdir);

    const { stdout } = await runCli(["install", "--json"], {
      env: fake.env,
    });

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      dryRun: false,
      pluginDir: join(tmpdir, "plugins/helmsman"),
      marketplacePath: join(tmpdir, ".agents/plugins/marketplace.json"),
      codexInstall: {
        requested: true,
        installed: true,
        authPolicy: "ON_INSTALL",
        appsNeedingAuth: [],
      },
    });
    const rpcLog = (await readFile(fake.logPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(rpcLog).toEqual([
      expect.objectContaining({
        method: "plugin/install",
        marketplacePath: join(tmpdir, ".agents/plugins/marketplace.json"),
        pluginName: "helmsman",
      }),
    ]);

    const { stdout: statusStdout } = await runCli(["doctor", "--no-latest-check", "--json"], {
      env: fake.env,
    });
    const status = JSON.parse(statusStdout);
    expect(status.ready).toBe(true);
    expect(status.codexInstall).toMatchObject({
      cachePresent: true,
      configEnabled: true,
      installed: true,
    });
  });

  test("home install rolls back payload replacement when marketplace write fails", async ({
    tmpdir,
  }) => {
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplaceDir = join(tmpdir, ".agents/plugins");
    const marketplace = join(marketplaceDir, "marketplace.json");
    await writeFixture(tmpdir, "plugins/helmsman/old-marker.txt", "old install\n");
    await writeFixture(
      tmpdir,
      ".agents/plugins/marketplace.json",
      JSON.stringify({ name: "local", interface: { displayName: "Local Plugins" }, plugins: [] }),
    );
    await chmod(marketplaceDir, 0o555);

    try {
      await expect(
        runScript("scripts/install-plugin.mjs", [
          "--plugin-dir",
          pluginDir,
          "--marketplace",
          marketplace,
          "--force",
        ]),
      ).rejects.toMatchObject({
        stderr: expect.stringMatching(/EACCES|EPERM|permission/i),
      });
    } finally {
      await chmod(marketplaceDir, 0o755);
    }

    const pluginParentEntries = await readdir(join(tmpdir, "plugins"));
    const restoredMarker = await readFile(join(pluginDir, "old-marker.txt"), "utf8");
    const marketplaceEntries = await readdir(marketplaceDir);
    expect(restoredMarker).toBe("old install\n");
    expect(pluginParentEntries).toContain("helmsman");
    expect(pluginParentEntries).not.toContain(".helmsman.install.lock");
    expect(pluginParentEntries.some((entry) => entry.startsWith(".helmsman.install.tmp-"))).toBe(false);
    expect(pluginParentEntries.some((entry) => entry.startsWith(".helmsman.install.previous-"))).toBe(false);
    expect(marketplaceEntries).toContain("marketplace.json");
    expect(marketplaceEntries.some((entry) => entry.startsWith(".marketplace.json.tmp-"))).toBe(false);
    expect(marketplaceEntries).not.toContain(".marketplace.json.install.lock");
  });

  test("home install rejects a concurrent marketplace lock before replacing payload", async ({
    tmpdir,
  }) => {
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplaceDir = join(tmpdir, ".agents/plugins");
    const marketplace = join(marketplaceDir, "marketplace.json");
    const lock = join(marketplaceDir, ".marketplace.json.install.lock");
    await mkdir(lock, { recursive: true });

    await expect(
      runScript("scripts/install-plugin.mjs", [
        "--plugin-dir",
        pluginDir,
        "--marketplace",
        marketplace,
        "--force",
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("marketplace install already in progress"),
    });

    const marketplaceEntries = await readdir(marketplaceDir);
    const pluginParentEntries = await readdir(join(tmpdir, "plugins")).catch(() => []);
    expect(marketplaceEntries).toContain(".marketplace.json.install.lock");
    expect(marketplaceEntries).not.toContain("marketplace.json");
    expect(pluginParentEntries).not.toContain("helmsman");
    expect(pluginParentEntries.some((entry) => entry.startsWith(".helmsman.install.tmp-"))).toBe(false);
    expect(pluginParentEntries.some((entry) => entry.startsWith(".helmsman.install.previous-"))).toBe(false);
  });

  test("home install rejects a concurrent install lock for the same destination", async ({
    tmpdir,
  }) => {
    const pluginParent = join(tmpdir, "plugins");
    const pluginDir = join(pluginParent, "helmsman");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");
    const lock = join(pluginParent, ".helmsman.install.lock");
    await mkdir(lock, { recursive: true });

    await expect(
      runScript("scripts/install-plugin.mjs", [
        "--plugin-dir",
        pluginDir,
        "--marketplace",
        marketplace,
        "--force",
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("plugin install already in progress"),
    });

    const entries = await readdir(pluginParent);
    expect(entries).toContain(".helmsman.install.lock");
    expect(entries).not.toContain("helmsman");
    expect(entries.some((entry) => entry.startsWith(".helmsman.install.tmp-"))).toBe(false);
    expect(entries.some((entry) => entry.startsWith(".helmsman.install.previous-"))).toBe(false);
  });

  test("home install preserves unrelated marketplace entries", async ({ tmpdir }) => {
    await runScript("scripts/build-plugin.mjs");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");
    await mkdir(join(tmpdir, ".agents/plugins"), { recursive: true });
    await writeFixture(
      tmpdir,
      ".agents/plugins/marketplace.json",
      JSON.stringify(
        {
          name: "local",
          interface: { displayName: "Local Plugins" },
          plugins: [
            {
              name: "other-plugin",
              source: { source: "local", path: "./plugins/other-plugin" },
              policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
              category: "Coding",
            },
          ],
        },
        null,
        2,
      ),
    );

    await runScript("scripts/install-plugin.mjs", [
      "--plugin-dir",
      join(tmpdir, "plugins/helmsman"),
      "--marketplace",
      marketplace,
      "--force",
    ]);

    const parsed = JSON.parse(await readFile(marketplace, "utf8"));
    expect(parsed.plugins.map((plugin: { name: string }) => plugin.name).sort()).toEqual([
      "helmsman",
      "other-plugin",
    ]);
    expect(parsed.plugins.find((plugin: { name: string }) => plugin.name === "helmsman")).toMatchObject({
      source: { source: "local", path: "./plugins/helmsman" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Coding",
    });
  });

  test("verify-plugin can prove an installed payload matches the generated plugin", async ({ tmpdir }) => {
    await runScript("scripts/build-plugin.mjs");
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");

    await runScript("scripts/install-plugin.mjs", [
      "--plugin-dir",
      pluginDir,
      "--marketplace",
      marketplace,
      "--force",
    ]);

    const { stdout } = await runScript("scripts/verify-plugin.mjs", [
      "--plugin-dir",
      pluginDir,
      "--compare-to",
      PLUGIN,
    ]);
    expect(stdout).toContain(`plugin verify pass: ${pluginDir}`);
    expect(stdout).toContain(`plugin payload matches: ${PLUGIN}`);
  });

  test("verify-plugin rejects installed payload drift from the generated plugin", async ({ tmpdir }) => {
    await runScript("scripts/build-plugin.mjs");
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");

    await runScript("scripts/install-plugin.mjs", [
      "--plugin-dir",
      pluginDir,
      "--marketplace",
      marketplace,
      "--force",
    ]);

    const rootSkill = await readFile(join(pluginDir, "skills/helmsman/SKILL.md"), "utf8");
    await writeFixture(
      tmpdir,
      "plugins/helmsman/skills/helmsman/SKILL.md",
      `${rootSkill}\n\nInstalled payload drift marker.\n`,
    );
    await refreshPayloadManifestEntry(pluginDir, "skills/helmsman/SKILL.md");

    await expect(
      runScript("scripts/verify-plugin.mjs", [
        "--plugin-dir",
        pluginDir,
        "--compare-to",
        PLUGIN,
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "plugin payload differs from compare target at .codex-plugin/payload-manifest.json",
      ),
    });
  });

  test("package script verifies a home-installed plugin against the generated payload", async ({
    tmpdir,
  }) => {
    const version = await readPackageVersion();
    const fake = await writeFakeCodex(tmpdir);
    await execFileAsync(process.execPath, ["run", "install:plugin", "--", "--target-home", "--force", "--codex-install"], {
      cwd: ROOT,
      env: fake.env,
    });

    const { stdout } = await execFileAsync(process.execPath, ["run", "verify:installed-plugin"], {
      cwd: ROOT,
      env: fake.env,
    });

    expect(stdout).toContain(
      `marketplace entry verified: ${join(tmpdir, ".agents/plugins/marketplace.json")}`,
    );
    expect(stdout).toContain(`Codex plugin cache verified: ${join(tmpdir, ".codex/plugins/cache/local/helmsman", version)}`);
    expect(stdout).toContain(`Codex plugin enabled: ${join(tmpdir, ".codex/config.toml")}`);
    expect(stdout).toContain(
      `plugin payload matches: ${join(tmpdir, "plugins/helmsman")}`,
    );
    expect(stdout).toContain("plugin payload matches: plugins/helmsman");
    expect(stdout).toContain(`plugin verify pass: ${join(tmpdir, "plugins/helmsman")}`);
  });

  test("installed plugin verifier rejects stale Codex cache payload", async ({
    tmpdir,
  }) => {
    const version = await readPackageVersion();
    const fake = await writeFakeCodex(tmpdir);
    await execFileAsync(process.execPath, ["run", "install:plugin", "--", "--target-home", "--force"], {
      cwd: ROOT,
      env: fake.env,
    });

    const cacheDir = join(tmpdir, ".codex/plugins/cache/local/helmsman", version);
    const skillPath = join(cacheDir, "skills/helmsman/SKILL.md");
    const skill = await readFile(skillPath, "utf8");
    await writeFile(skillPath, `${skill}\n\nCodex cache drift marker.\n`);
    await refreshPayloadManifestEntry(cacheDir, "skills/helmsman/SKILL.md");

    await expect(
      execFileAsync(process.execPath, ["run", "verify:installed-plugin"], {
        cwd: ROOT,
        env: fake.env,
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("plugin payload differs from compare target"),
    });
  });

  test("plugin status renderer reports a ready installed marketplace payload without writes", async ({
    tmpdir,
  }) => {
    const fake = await writeFakeCodex(tmpdir);
    await execFileAsync(process.execPath, ["run", "install:plugin", "--", "--target-home", "--force", "--codex-install"], {
      cwd: ROOT,
      env: fake.env,
    });

    const { stdout } = await execFileAsync(process.execPath, ["run", "render:plugin-status", "--", "--json"], {
      cwd: ROOT,
      env: fake.env,
    });

    const parsed = JSON.parse(stdout);
    expect(parsed).toMatchObject({
      ready: true,
      readOnly: true,
      pluginDir: join(tmpdir, "plugins/helmsman"),
      marketplacePath: join(tmpdir, ".agents/plugins/marketplace.json"),
      generatedPayloadPresent: true,
      installedPayloadPresent: true,
      installedPayloadManifestPresent: true,
      marketplaceValid: true,
      marketplaceEntryPresent: true,
      marketplaceEntryResolves: true,
      marketplaceReady: true,
      payloadComparison: {
        checked: true,
        matches: true,
      },
      codexInstall: {
        cachePresent: true,
        configEnabled: true,
        installed: true,
      },
      codexCacheComparison: {
        matches: true,
      },
      blockers: [],
    });
  });

  test("plugin status renderer reports stale Codex cache payload", async ({
    tmpdir,
  }) => {
    const version = await readPackageVersion();
    const fake = await writeFakeCodex(tmpdir);
    await execFileAsync(process.execPath, ["run", "install:plugin", "--", "--target-home", "--force"], {
      cwd: ROOT,
      env: fake.env,
    });

    const cacheDir = join(tmpdir, ".codex/plugins/cache/local/helmsman", version);
    const skillPath = join(cacheDir, "skills/helmsman/SKILL.md");
    const skill = await readFile(skillPath, "utf8");
    await writeFile(skillPath, `${skill}\n\nCodex cache drift marker.\n`);
    await refreshPayloadManifestEntry(cacheDir, "skills/helmsman/SKILL.md");

    const { stdout } = await execFileAsync(process.execPath, ["run", "render:plugin-status", "--", "--json"], {
      cwd: ROOT,
      env: fake.env,
    });

    const parsed = JSON.parse(stdout);
    expect(parsed.ready).toBe(false);
    expect(parsed.codexCacheComparison.matches).toBe(false);
    expect(parsed.blockers).toContain("Codex plugin cache differs from installed plugin payload");
  });

  test("plugin status renderer exposes stale marketplace wiring without mutating it", async ({
    tmpdir,
  }) => {
    await runScript("scripts/build-plugin.mjs");
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");

    await runScript("scripts/install-plugin.mjs", [
      "--plugin-dir",
      pluginDir,
      "--marketplace",
      marketplace,
      "--force",
    ]);

    const before = JSON.parse(await readFile(marketplace, "utf8"));
    before.plugins.find((plugin: { name: string }) => plugin.name === "helmsman").source.path =
      "./plugins/stale-helmsman";
    await writeFile(marketplace, `${JSON.stringify(before, null, 2)}\n`);

    const { stdout } = await runScript("scripts/render-plugin-status.mjs", [
      "--plugin-dir",
      pluginDir,
      "--marketplace",
      marketplace,
      "--compare-to",
      PLUGIN,
      "--json",
    ]);

    const parsed = JSON.parse(stdout);
    const after = JSON.parse(await readFile(marketplace, "utf8"));
    expect(parsed.ready).toBe(false);
    expect(parsed.readOnly).toBe(true);
    expect(parsed.marketplaceEntryResolves).toBe(false);
    expect(parsed.blockers).toContain("marketplace helmsman entry does not resolve to pluginDir");
    expect(after).toEqual(before);
  });

  test("installed plugin verifier rejects marketplace entries pointing elsewhere", async ({
    tmpdir,
  }) => {
    await runScript("scripts/build-plugin.mjs");
    const pluginDir = join(tmpdir, "plugins/helmsman");
    const marketplace = join(tmpdir, ".agents/plugins/marketplace.json");

    await runScript("scripts/install-plugin.mjs", [
      "--plugin-dir",
      pluginDir,
      "--marketplace",
      marketplace,
      "--force",
    ]);

    const parsed = JSON.parse(await readFile(marketplace, "utf8"));
    parsed.plugins.find((plugin: { name: string }) => plugin.name === "helmsman").source.path =
      "./plugins/stale-helmsman";
    await writeFile(marketplace, `${JSON.stringify(parsed, null, 2)}\n`);

    await expect(
      runScript("scripts/verify-installed-plugin.mjs", [
        "--plugin-dir",
        pluginDir,
        "--marketplace",
        marketplace,
        "--compare-to",
        PLUGIN,
        "--skip-build",
      ]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        "marketplace helmsman entry points at a different plugin directory",
      ),
    });
  });

  test("installed plugin verifier reports argument errors without a stack trace", async () => {
    await expect(
      runScript("scripts/verify-installed-plugin.mjs", ["--bad-flag"]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("unknown argument: --bad-flag"),
    });

    try {
      await runScript("scripts/verify-installed-plugin.mjs", ["--bad-flag"]);
    } catch (error) {
      expect((error as { stderr: string }).stderr).not.toContain("Bun v");
      expect((error as { stderr: string }).stderr).not.toContain("at fail");
    }
  });

  test("installed plugin verifier explains missing local install", async ({ tmpdir }) => {
    await expect(
      runScript("scripts/verify-installed-plugin.mjs", [], {
        env: { ...process.env, HOME: tmpdir },
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        `installed Helmsman plugin not found at ${join(tmpdir, "plugins/helmsman")}`,
      ),
    });

    try {
      await runScript("scripts/verify-installed-plugin.mjs", [], {
        env: { ...process.env, HOME: tmpdir },
      });
    } catch (error) {
      const stderr = (error as { stderr: string }).stderr;
      expect(stderr).toContain("npx @deltafleet/helmsman install");
      expect(stderr).toContain("bun run verify:plugin");
      expect(stderr).not.toContain("Bun v");
      expect(stderr).not.toContain("at fail");
    }
  });

  test("version verifier rejects drift across package and plugin release manifests", async ({
    tmpdir,
  }) => {
    const pluginDir = join(tmpdir, "plugins/helmsman");
    await runScript("scripts/build-plugin.mjs", ["--output", pluginDir]);
    const manifestPath = join(pluginDir, ".codex-plugin/plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.version = "0.0.0-drift";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await expect(
      runScript("scripts/verify-version-consistency.mjs", ["--plugin-dir", pluginDir]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        ".codex-plugin/plugin.json version 0.0.0-drift does not match package.json",
      ),
    });
  });
});
