#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

function usage() {
  return "Usage: bun scripts/render-skill-status.mjs <session-dir>";
}

function fail(message) {
  throw new Error(message);
}

async function readRequired(sessionDir, rel) {
  try {
    return await readFile(join(sessionDir, rel), "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") fail(`${rel} is missing`);
    throw error;
  }
}

function parseScenarioIds(body) {
  const ids = new Set();
  for (const match of body.matchAll(/\bScenario ID:\s*([A-Za-z0-9_-]+)/g)) {
    ids.add(match[1]);
  }
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || /^\|?\s*-+/.test(trimmed)) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells[0] && /^[A-Za-z]+-[0-9A-Za-z_-]+$/.test(cells[0])) ids.add(cells[0]);
  }
  return [...ids];
}

function formatList(values) {
  if (!values || values.length === 0) return "none";
  return values.join(", ");
}

async function main() {
  const sessionDir = process.argv[2];
  if (!sessionDir || sessionDir === "--help" || sessionDir === "-h") {
    console.log(usage());
    process.exit(sessionDir ? 0 : 1);
  }

  const map = JSON.parse(await readRequired(sessionDir, "map.json"));
  const route = await readRequired(sessionDir, "route-card.md");
  const verification = await readRequired(sessionDir, "verification.md").catch(() => "");
  const routeIds = parseScenarioIds(route);
  const verifiedIds = new Set(parseScenarioIds(verification));
  const covered = routeIds.filter((id) => verifiedIds.has(id)).length;

  const lines = [
    `Skill session: ${basename(sessionDir)}`,
    `Stage: ${map.stage}`,
    `Autopilot stage: ${map.autopilotStage ?? "none"}`,
    `Status: ${map.status}`,
    `Checkpoint: ${map.currentCheckpoint}`,
    `Missing artifacts: ${formatList(map.missingArtifacts)}`,
    `Open questions: ${formatList(map.openQuestions)}`,
    `Blocked reason: ${map.blockedReason ?? "none"}`,
    `Next skill: ${map.nextSkill}`,
    `Scenario coverage: ${covered}/${routeIds.length}`,
  ];

  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
