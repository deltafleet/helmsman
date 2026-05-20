#!/usr/bin/env node
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const ROOT = process.cwd();

const ARTIFACTS = new Map([
  ["goal", ["skills/helmsman-charting/templates/goal.md", "goal.md"]],
  ["goal-charter", ["skills/helmsman-charting/templates/goal-charter.md", "goal-charter.md"]],
  ["stop-conditions", ["skills/helmsman-charting/templates/stop-conditions.md", "stop-conditions.md"]],
  ["verification-scenarios", ["skills/helmsman-charting/templates/verification-scenarios.md", "verification-scenarios.md"]],
  ["resume-report-template", ["skills/helmsman-charting/templates/resume-report-template.md", "resume-report-template.md"]],
  ["route-card", ["skills/helmsman-charting/templates/route-card.md", "route-card.md"]],
  ["charting-loop", ["skills/helmsman-charting/templates/charting-loop.md", "charting-loop.md"]],
  ["question-bundles", ["skills/helmsman-charting/templates/question-bundles.md", "question-bundles.md"]],
  ["native-chat-transcript", ["skills/helmsman-charting/templates/native-chat-transcript.jsonl", "evidence/native-chat-transcript.jsonl"]],
  ["memory-scan", ["skills/helmsman-charting/templates/memory-scan.md", "memory-scan.md"]],
  ["research-index", ["skills/helmsman-charting/templates/research-index.md", "research-index.md"]],
  ["worker-packets", ["skills/helmsman-charting/templates/worker-packets.md", "worker-packets.md"]],
  ["research", ["skills/helmsman-charting/templates/research.md", "research/source.md"]],
  ["evidence", ["skills/helmsman-charting/templates/evidence.md", "evidence/source.md"]],
  ["plan", ["skills/helmsman-autopilot/templates/plan.md", "plan.md"]],
  ["strategy-samples", ["skills/helmsman-autopilot/templates/strategy-samples.md", "strategy-samples.md"]],
  ["director-blueprint", ["skills/helmsman-autopilot/templates/director-blueprint.md", "director-blueprint.md"]],
  ["hardening", ["skills/helmsman-autopilot/templates/hardening.md", "hardening.md"]],
  ["audit", ["skills/helmsman-autopilot/templates/audit.md", "audit.md"]],
  ["execution-report", ["skills/helmsman-autopilot/templates/execution-report.md", "execution-report.md"]],
  ["verification", ["skills/helmsman-verify/templates/verification.md", "verification.md"]],
  ["retro", ["skills/helmsman-verify/templates/retro.md", "retro.md"]],
]);

function usage() {
  return [
    "Usage: bun scripts/scaffold-skill-artifact.mjs <session-dir> --artifact <name> [--force]",
    `Artifacts: ${[...ARTIFACTS.keys()].join(", ")}`,
    "This helper copies templates only. It does not advance workflow state or infer decisions.",
  ].join("\n");
}

function fail(message) {
  throw new Error(message);
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

function parseArgs(argv) {
  const args = [...argv];
  const sessionDir = args.shift();
  if (!sessionDir || sessionDir === "--help" || sessionDir === "-h") {
    console.log(usage());
    process.exit(sessionDir ? 0 : 1);
  }
  let artifact = null;
  let force = false;
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--artifact") {
      artifact = args.shift() ?? fail("--artifact requires a value");
      continue;
    }
    if (flag === "--force") {
      force = true;
      continue;
    }
    fail(`unknown argument: ${flag}`);
  }
  if (!artifact) fail("--artifact is required");
  if (!ARTIFACTS.has(artifact)) fail(`unknown artifact: ${artifact}`);
  return { sessionDir, artifact, force };
}

async function main() {
  const { sessionDir, artifact, force } = parseArgs(process.argv.slice(2));
  const [templateRel, outputRel] = ARTIFACTS.get(artifact);
  const templatePath = join(ROOT, templateRel);
  const outputPath = join(sessionDir, outputRel);
  if ((await exists(outputPath)) && !force) {
    fail(`${outputRel} already exists; pass --force to overwrite`);
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(templatePath, outputPath);
  console.log(`scaffolded ${artifact}: ${outputRel}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
