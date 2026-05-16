#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

const DEFAULT_ROOT = process.cwd();

const REMOVED_PATH_SEGMENTS = [
  "agents/",
  "bin/helmsman",
  "docs/runtime-shell",
  "lib/commands",
  "lib/core",
  "lib/runtime",
  "phases/",
  "references/",
  "scripts/e2e-",
  "scripts/generate-docs.sh",
  "scripts/invariants.sh",
  "tests/commands",
  "tests/core",
  "tests/runtime",
  "tests/domain/async-jobs",
  "tests/domain/gates",
  "tests/domain/hardening",
  "tests/domain/invariants",
  "tests/domain/language",
  "tests/domain/next",
  "tests/domain/ownership",
  "tests/domain/phases",
  "tests/domain/policies",
  "tests/domain/round",
  "tests/domain/route-card",
  "tests/domain/spawn-manifest",
  "tests/domain/wiki",
  "tests/helpers/state-fixtures",
  "tests/integration",
  "tests/integration/runtime-",
  "tests/commands/runtime-",
  "scripts/smoke/runtime-",
  "scripts/smoke/cockpit-",
];

const REMOVED_CONTENT_PATTERNS = [
  { label: "OpenTUI", pattern: /\bOpenTUI\b/i },
  { label: "cockpit", pattern: /\bcockpit\b/i },
  { label: "runtime-shell", pattern: /\bruntime-shell\b/i },
  { label: "runtime shell", pattern: /\bruntime shell\b/i },
  { label: "helmsman runtime", pattern: /\bhelmsman runtime\b/i },
  { label: "helmsman run", pattern: /\bhelmsman run\b/i },
  { label: "smoke:codex", pattern: /\bsmoke:codex\b/i },
  { label: "runtime-real-codex-smoke", pattern: /\bruntime-real-codex-smoke\b/i },
  { label: "Round A", pattern: /\bRound A\b/ },
  { label: "Round B", pattern: /\bRound B\b/ },
  { label: "round-a", pattern: /\bround-a\b/ },
  { label: "round-b", pattern: /\bround-b\b/ },
  { label: "state.json", pattern: /\bstate\.json\b/ },
  { label: "HELMSMAN_STATE_VERSION", pattern: /\bHELMSMAN_STATE_VERSION\b/ },
  { label: "TUI", pattern: /\bTUI\b/ },
];

const SCAN_ROOTS = [
  "README.md",
  "README.ko.md",
  "SKILL.md",
  "docs",
  "examples",
  "agents",
  "bin",
  "lib",
  "phases",
  "plugins",
  "references",
  "scripts",
  "skills",
  "tests",
  "package.json",
];

const IGNORED_PATH_PREFIXES = [
  "docs/competitive-dogfood-runs/",
];

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".json",
  ".ko.md",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const ALLOWED_GUARD_FILES = new Set([
  "docs/2026-05-08-active-thread-goal-audit.ko.md",
  "docs/2026-05-08-helmsman-protocol-design-closure.ko.md",
  "docs/2026-05-08-helmsman-protocol-implementation-plan.ko.md",
  "scripts/audit-removed-surfaces.mjs",
  "scripts/build-plugin.mjs",
  "scripts/check-helmsman.mjs",
  "scripts/verify-plugin.mjs",
  "tests/docs/data-contract.spec.ts",
  "tests/docs/namespace-canonical.spec.ts",
  "tests/docs/plugin-packaging.spec.ts",
  "tests/docs/removed-surfaces-audit.spec.ts",
  "tests/docs/helmsman-skills.spec.ts",
]);

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "private",
]);

function usage() {
  return [
    "Usage: bun scripts/audit-removed-surfaces.mjs [--root <path>] [--json]",
    "",
    "Fails if removed runtime/TUI/OpenTUI/cockpit surfaces reappear in current-facing files.",
  ].join("\n");
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const parsed = {
    root: DEFAULT_ROOT,
    json: false,
  };
  const args = [...argv];
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--root") {
      parsed.root = resolve(args.shift() ?? fail("--root requires a value"));
      continue;
    }
    if (flag === "--json") {
      parsed.json = true;
      continue;
    }
    if (flag === "--help" || flag === "-h") {
      console.log(usage());
      process.exit(0);
    }
    fail(`unknown argument: ${flag}`);
  }
  return parsed;
}

async function pathInfo(path) {
  try {
    return await stat(path);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

function isTextPath(rel) {
  return [...TEXT_EXTENSIONS].some((extension) => rel.endsWith(extension));
}

async function collectFiles(root, rel) {
  const absolute = resolve(root, rel);
  const info = await pathInfo(absolute);
  if (!info) return [];
  if (info.isFile()) return [rel];
  if (!info.isDirectory()) return [];
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, child)));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

function removedPathHits(files) {
  return files
    .filter((file) => !ALLOWED_GUARD_FILES.has(file))
    .flatMap((file) => REMOVED_PATH_SEGMENTS
      .filter((segment) => removedPathSegmentMatches(file, segment))
      .map((segment) => ({
        file,
        type: "path",
        match: segment,
      })));
}

function removedPathSegmentMatches(file, segment) {
  if (["agents/", "phases/", "references/"].includes(segment)) {
    return file.startsWith(segment);
  }
  if (segment === "bin/helmsman") {
    return file === "bin/helmsman";
  }
  return file.includes(segment);
}

async function removedContentHits(root, files) {
  const hits = [];
  for (const file of files) {
    if (ALLOWED_GUARD_FILES.has(file)) continue;
    if (!isTextPath(file)) continue;
    const body = await readFile(resolve(root, file), "utf8");
    for (const { label, pattern } of REMOVED_CONTENT_PATTERNS) {
      if (pattern.test(body)) {
        hits.push({
          file,
          type: "content",
          match: label,
        });
      }
    }
  }
  return hits;
}

async function buildAudit(root) {
  const scanFiles = new Set();
  for (const rel of SCAN_ROOTS) {
    for (const file of await collectFiles(root, rel)) {
      scanFiles.add(relative(root, resolve(root, file)).replaceAll("\\", "/"));
    }
  }
  const files = [...scanFiles].sort();
  const currentFacingFiles = files.filter(
    (file) => !IGNORED_PATH_PREFIXES.some((prefix) => file.startsWith(prefix)),
  );
  const hits = [
    ...removedPathHits(currentFacingFiles),
    ...(await removedContentHits(root, currentFacingFiles)),
  ];
  return {
    removedSurfaceReady: hits.length === 0,
    scannedFiles: currentFacingFiles.length,
    hits,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const audit = await buildAudit(args.root);

  if (args.json) {
    console.log(JSON.stringify(audit, null, 2));
  } else if (audit.removedSurfaceReady) {
    console.log(`removed surface audit pass: scannedFiles=${audit.scannedFiles}`);
  }

  if (!audit.removedSurfaceReady) {
    if (!args.json) {
      console.error(
        `removed surface audit fail: ${audit.hits.map((hit) => `${hit.file} ${hit.type} ${hit.match}`).join("; ")}`,
      );
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
