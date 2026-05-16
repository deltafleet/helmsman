#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseSkillMemoryCandidates } from "../lib/domain/skill-memory-candidates.ts";

function usage() {
  return "Usage: bun scripts/compile-skill-memory.mjs <session-dir> [--target <wiki-candidates-dir>]";
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  const sessionDir = args.shift();
  if (!sessionDir || sessionDir === "--help" || sessionDir === "-h") {
    console.log(usage());
    process.exit(sessionDir ? 0 : 1);
  }
  let target = null;
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--target") {
      target = args.shift() ?? fail("--target requires a value");
      continue;
    }
    fail(`unknown argument: ${flag}`);
  }
  return { sessionDir: resolve(sessionDir), target: target ? resolve(target) : null };
}

function defaultTarget(sessionDir) {
  const parent = dirname(sessionDir);
  if (parent.endsWith("/sessions")) return join(dirname(parent), "wiki", "candidates");
  return join(sessionDir, ".helmsman", "wiki", "candidates");
}

function renderDraft(candidate) {
  return [
    "---",
    `type: ${candidate.type}`,
    `stability: ${candidate.stability}`,
    `sourceArtifact: ${candidate.sourceArtifact}`,
    "promotionVerdict: promote",
    "---",
    "",
    `# ${candidate.id}`,
    "",
    `Trigger: ${candidate.trigger}`,
    "",
    `Symptom: ${candidate.symptom}`,
    "",
    `Cause: ${candidate.cause}`,
    "",
    `Fix: ${candidate.fix}`,
    "",
    `Future use: ${candidate.futureUse}`,
    "",
  ].join("\n");
}

async function main() {
  const { sessionDir, target } = parseArgs(process.argv.slice(2));
  const retro = await readFile(join(sessionDir, "retro.md"), "utf8");
  const candidates = parseSkillMemoryCandidates(retro);
  const promoted = candidates.filter((candidate) => candidate.promotionVerdict === "promote");
  const targetDir = target ?? defaultTarget(sessionDir);
  await mkdir(targetDir, { recursive: true });

  for (const candidate of promoted) {
    await writeFile(join(targetDir, `${candidate.id}.md`), renderDraft(candidate), "utf8");
  }

  console.log(
    `skill memory compile pass: ${promoted.length} promoted, ${
      candidates.length - promoted.length
    } skipped`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
