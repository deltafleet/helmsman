#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const STAGES = ["charting", "research", "autopilot", "verify", "retro"];
const MAP_STAGES = [...STAGES, "closed"];
const AUTOPILOT_STAGES = ["strategy", "blueprint", "hardening", "audit", "execute", "repair"];

function usage() {
  return [
    "Usage: bun scripts/validate-skill-session.mjs <session-dir> [--stage <stage>]",
    `Stages: ${STAGES.join(", ")}`,
  ].join("\n");
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
  let stage = null;
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--stage") {
      stage = args.shift() ?? fail("--stage requires a value");
      continue;
    }
    fail(`unknown argument: ${flag}`);
  }
  if (stage && !STAGES.includes(stage)) fail(`unknown stage: ${stage}`);
  return { sessionDir, stage };
}

async function readRequired(sessionDir, rel) {
  try {
    const body = await readFile(join(sessionDir, rel), "utf8");
    if (!body.trim()) fail(`${rel} is empty`);
    return body;
  } catch (error) {
    if (error && error.code === "ENOENT") fail(`${rel} is missing`);
    throw error;
  }
}

async function readOptional(sessionDir, rel) {
  try {
    return await readFile(join(sessionDir, rel), "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

function requireLabels(rel, body, labels) {
  for (const label of labels) {
    if (!body.includes(label)) fail(`${rel} missing '${label}'`);
  }
}

function requireHeadings(rel, body, headings) {
  for (const heading of headings) {
    const pattern = new RegExp(`^#{1,3}\\s+${escapeRegExp(heading)}\\s*$`, "m");
    if (!pattern.test(body)) fail(`${rel} missing heading '${heading}'`);
  }
}

function rejectPlaceholders(rel, body) {
  const match = body.match(/\b(TODO|TBD|PLACEHOLDER|FIXME)\b|\?\?\?/i);
  if (match) fail(`${rel} contains placeholder text '${match[0]}'`);
}

function requireFieldValues(rel, body, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`^\\s*-?\\s*${escapeRegExp(label)}\\s*(.+)$`, "im");
    if (!pattern.test(body)) fail(`${rel} missing '${label}'`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractScenarioIds(body) {
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

function requireMarkdownTableColumns(rel, body, columns) {
  const normalizedLines = body.split("\n").map((line) => line.replace(/\s+/g, " ").trim());
  const expected = `| ${columns.join(" | ")} |`;
  if (!normalizedLines.includes(expected)) {
    fail(`${rel} missing table columns '${columns.join(", ")}'`);
  }
}

function validateScenarioResults(body) {
  const valid = new Set(["pass", "fail", "blocked", "not-applicable"]);
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/Scenario ID\s*\|/i.test(trimmed) || /^\|\s*-+/.test(trimmed)) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 5) continue;
    const result = cells[3]?.toLowerCase();
    if (result && !valid.has(result)) fail(`verification.md has invalid result '${cells[3]}'`);
  }
}

function validateExecutionStrategy(rel, body) {
  if (!/\bStrategy:\s*(inline|serial-workers|parallel-workers|parked)\b/i.test(body)) {
    fail(`${rel} missing 'Strategy: inline|serial-workers|parallel-workers|parked'`);
  }
}

function extractSection(body, heading) {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im");
  const match = pattern.exec(body);
  if (!match) return "";
  const start = match.index + match[0].length;
  const rest = body.slice(start);
  const next = /^##\s+/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function inferStage(contractBody, presentFiles) {
  const match = contractBody.match(/^Current stage:\s*([a-z-]+)/im);
  if (match && STAGES.includes(match[1])) return match[1];
  if (match?.[1] === "closed") return "retro";
  for (const [file, stage] of [
    ["retro.md", "retro"],
    ["verification.md", "verify"],
    ["plan.md", "autopilot"],
    ["evidence", "research"],
    ["route-card.md", "charting"],
  ]) {
    if (presentFiles.has(file)) return stage;
  }
  return "charting";
}

async function listPresent(sessionDir) {
  const entries = new Set();
  try {
    for (const entry of await readdir(sessionDir, { withFileTypes: true })) {
      entries.add(entry.name);
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      fail(`session directory does not exist: ${sessionDir}`);
    }
    throw error;
  }
  return entries;
}

async function validateJson(sessionDir, rel) {
  const body = await readRequired(sessionDir, rel);
  try {
    return JSON.parse(body);
  } catch (error) {
    fail(`${rel} is not valid JSON: ${error.message}`);
  }
}

async function validateMap(sessionDir) {
  const map = await validateJson(sessionDir, "map.json");
  if (map.schemaVersion !== 1) fail("map.json missing schemaVersion 1");
  if (!MAP_STAGES.includes(map.stage)) fail("map.json has unknown stage");
  if (!["blocked", "ready", "complete", "closed"].includes(map.status)) {
    fail("map.json has unknown status");
  }
  if (!Array.isArray(map.checkpoints) || map.checkpoints.length === 0) {
    fail("map.json checkpoints must be a non-empty array");
  }
  if (!map.checkpoints.every((stage) => STAGES.includes(stage))) {
    fail("map.json checkpoints contain an unknown stage");
  }
  if (!MAP_STAGES.includes(map.currentCheckpoint)) {
    fail("map.json has unknown currentCheckpoint");
  }
  if (map.stage !== map.currentCheckpoint) {
    fail("map.json stage must match currentCheckpoint");
  }
  if (map.autopilotStage !== undefined) {
    if (!AUTOPILOT_STAGES.includes(map.autopilotStage)) {
      fail("map.json has unknown autopilotStage");
    }
    if (map.stage !== "autopilot") {
      fail("map.json autopilotStage is allowed only when stage is autopilot");
    }
  } else if (map.stage === "autopilot") {
    fail("map.json missing autopilotStage for autopilot stage");
  }
  for (const field of [
    "requiredArtifacts",
    "presentArtifacts",
    "missingArtifacts",
    "openQuestions",
  ]) {
    if (!Array.isArray(map[field])) fail(`map.json ${field} must be an array`);
    if (!map[field].every((value) => typeof value === "string")) {
      fail(`map.json ${field} must contain only strings`);
    }
  }
  if (map.blockedReason !== null && typeof map.blockedReason !== "string") {
    fail("map.json blockedReason must be a string or null");
  }
  if (typeof map.nextSkill !== "string" || !map.nextSkill.trim()) {
    fail("map.json nextSkill must be a non-empty string");
  }
  return map;
}

async function validateContract(sessionDir) {
  const body = await readRequired(sessionDir, "contract.md");
  requireLabels("contract.md", body, [
    "Current stage:",
    "Allowed actions:",
    "Forbidden actions:",
    "Required artifacts:",
    "Exit gate:",
    "Next owner:",
  ]);
  rejectPlaceholders("contract.md", body);
  return body;
}

async function validateCharting(sessionDir) {
  await validateMap(sessionDir);
  const chart = await readRequired(sessionDir, "chart.md");
  rejectPlaceholders("chart.md", chart);
  const decisions = await readRequired(sessionDir, "decision-log.md");
  rejectPlaceholders("decision-log.md", decisions);
  const route = await readRequired(sessionDir, "route-card.md");
  requireHeadings("route-card.md", route, [
    "User Intent",
    "Scope",
    "Non-Goals",
    "Decisions",
    "Aperture Bundles",
    "Research Lane Contract",
    "Decision Bundles",
    "Open Questions",
    "Risks",
    "Success Criteria",
    "Verification Scenarios",
    "Next Recommended Skill",
    "Handoff",
  ]);
  requireFieldValues("route-card.md", route, [
    "Bundle Density Read:",
    "Aperture bundle status:",
    "Research lanes:",
    "Decision bundle status:",
    "Next skill:",
    "Input artifact:",
    "Already satisfied:",
    "Deferred questions:",
    "Carrier warning:",
    "Expected output:",
  ]);
  if (extractScenarioIds(route).length === 0) {
    fail("route-card.md missing verification scenario id");
  }
  rejectPlaceholders("route-card.md", route);
}

async function validateResearch(sessionDir) {
  const evidenceDir = join(sessionDir, "evidence");
  let files = [];
  try {
    files = (await readdir(evidenceDir)).filter((file) => file.endsWith(".md"));
  } catch (error) {
    if (error && error.code === "ENOENT") fail("evidence/ is missing");
    throw error;
  }
  if (files.length === 0) fail("evidence/ has no markdown evidence files");
  for (const file of files) {
    const rel = `evidence/${file}`;
    const body = await readRequired(sessionDir, rel);
    requireHeadings(rel, body, [
      "Question",
      "Lane Type",
      "Sources Checked",
      "Observations",
      "Inferences",
      "Uncertainty",
      "Decision Impact",
      "Route Changes Required",
      "Recommended Next Step",
    ]);
    rejectPlaceholders(rel, body);
  }
  await validateOptionalWorkerPackets(sessionDir);
  await validateOptionalJson(sessionDir, "agents.json");
}

async function validateAutopilot(sessionDir) {
  const map = await validateMap(sessionDir);
  const contract = await readRequired(sessionDir, "contract.md");
  if (map.stage === "autopilot") {
    requireFieldValues("contract.md", contract, ["Autopilot stage:"]);
    const contractStage = contract.match(/^Autopilot stage:\s*([a-z-]+)/im)?.[1];
    if (!AUTOPILOT_STAGES.includes(contractStage)) {
      fail("contract.md has unknown Autopilot stage");
    }
    if (contractStage !== map.autopilotStage) {
      fail("contract.md Autopilot stage must match map.json autopilotStage");
    }
  }
  await validateAutopilotStageArtifacts(sessionDir, map.autopilotStage);
  const plan = await readRequired(sessionDir, "plan.md");
  requireHeadings("plan.md", plan, [
    "Route Summary",
    "Execution Strategy",
    "Work Items",
    "Dependencies",
    "Allowed Write Scope",
    "Worker Assignments",
    "Verification Scenarios",
    "Risks And Rollback",
  ]);
  requireFieldValues("plan.md", plan, [
    "Strategy:",
    "Reason:",
    "File-to-work-item map:",
    "Integration order:",
    "Owner:",
    "Allowed write scope:",
    "Inputs:",
    "Exact changes:",
    "Expected evidence:",
    "Dependency:",
    "Rollback:",
    "Verification scenario links:",
  ]);
  if (!/^##\s+Work Item:\s*\S+/m.test(plan)) {
    fail("plan.md missing heading 'Work Item: <id>'");
  }
  validateExecutionStrategy("plan.md", plan);
  rejectPlaceholders("plan.md", plan);
  const audit = await readOptional(sessionDir, "audit.md");
  if (audit !== null) {
    if (!/\bVerdict:\s*(revise|proceed)\b/i.test(audit)) {
      fail("audit.md missing 'Verdict: revise|proceed'");
    }
    requireHeadings("audit.md", audit, ["Verdict"]);
    requireFieldValues("audit.md", audit, ["Reason:", "Required fixes before proceed:"]);
    rejectPlaceholders("audit.md", audit);
  }
  await validateOptionalWorkerPackets(sessionDir);
  await validateOptionalJson(sessionDir, "agents.json");
}

async function validateAutopilotStageArtifacts(sessionDir, requiredStage) {
  const requiredByStage = {
    strategy: ["strategy-samples.md"],
    blueprint: ["director-blueprint.md", "plan.md"],
    hardening: ["hardening.md"],
    audit: ["audit.md"],
    execute: ["execution-report.md"],
    repair: ["repair.md"],
  };
  if (requiredStage) {
    for (const rel of requiredByStage[requiredStage] ?? []) {
      await readRequired(sessionDir, rel);
    }
  }
  await validateOptionalStrategySamples(sessionDir);
  await validateOptionalDirectorBlueprint(sessionDir);
  await validateOptionalHardening(sessionDir);
  await validateOptionalExecutionReport(sessionDir);
  await validateOptionalRepair(sessionDir);
}

async function validateOptionalStrategySamples(sessionDir) {
  const body = await readOptional(sessionDir, "strategy-samples.md");
  if (body === null) return;
  requireHeadings("strategy-samples.md", body, [
    "Mission",
    "Shared Constraints",
    "Samples",
    "Convergence",
    "Open Decision Boundaries",
  ]);
  requireFieldValues("strategy-samples.md", body, [
    "Approach:",
    "Strengths:",
    "Weaknesses:",
    "Risks:",
    "Evidence used:",
    "Decision impact:",
  ]);
  if (!/^###\s+Sample\s+\S+/m.test(body)) fail("strategy-samples.md missing sample heading");
  rejectPlaceholders("strategy-samples.md", body);
}

async function validateOptionalDirectorBlueprint(sessionDir) {
  const body = await readOptional(sessionDir, "director-blueprint.md");
  if (body === null) return;
  requireHeadings("director-blueprint.md", body, [
    "Accepted Direction",
    "Rejected Directions",
    "File And Artifact Ownership",
    "Dependency Graph",
    "Plan Compilation Notes",
    "Scenario Coverage",
    "Open Risks",
  ]);
  rejectPlaceholders("director-blueprint.md", body);
}

async function validateOptionalHardening(sessionDir) {
  const body = await readOptional(sessionDir, "hardening.md");
  if (body === null) return;
  requireHeadings("hardening.md", body, [
    "Round",
    "Cross-Section Findings",
    "Ownership Problems",
    "Dependency Problems",
    "Scenario Coverage Problems",
    "Required Plan Changes",
    "Decision",
  ]);
  if (!/\bDecision:\s*(lock|continue|revise)\b/i.test(body)) {
    fail("hardening.md missing 'Decision: lock|continue|revise'");
  }
  requireFieldValues("hardening.md", body, ["Reason:"]);
  rejectPlaceholders("hardening.md", body);
}

async function validateOptionalExecutionReport(sessionDir) {
  const body = await readOptional(sessionDir, "execution-report.md");
  if (body === null) return;
  requireHeadings("execution-report.md", body, [
    "Approved Scope",
    "Execution Strategy",
    "Work Items Completed",
    "Worker Lifecycle",
    "Changed Paths",
    "Commands Run",
    "Integration And Collision Handling",
    "Worker Reports",
    "Deviations",
    "Evidence For Verification",
    "Next Step",
  ]);
  requireFieldValues("execution-report.md", body, [
    "Strategy:",
    "Reason:",
    "Parallel Safety Check:",
  ]);
  validateExecutionStrategy("execution-report.md", body);
  rejectPlaceholders("execution-report.md", body);
}

async function validateOptionalRepair(sessionDir) {
  const body = await readOptional(sessionDir, "repair.md");
  if (body === null) return;
  requireHeadings("repair.md", body, [
    "Failure Source",
    "Failed Scenario Or Gate",
    "Root Cause",
    "Allowed Repair Scope",
    "Plan Changes",
    "Verification Required",
    "Return Stage",
  ]);
  rejectPlaceholders("repair.md", body);
}

async function validateVerify(sessionDir) {
  const body = await readRequired(sessionDir, "verification.md");
  const route = await readRequired(sessionDir, "route-card.md");
  requireHeadings("verification.md", body, [
    "Route Promise",
    "Scenario Matrix",
    "Commands Run",
    "Files Inspected",
    "Residual Risks",
    "Verdict",
  ]);
  requireMarkdownTableColumns("verification.md", body, [
    "Scenario ID",
    "Route Scenario",
    "Evidence",
    "Result",
    "Notes",
  ]);
  validateScenarioResults(body);
  const routeScenarioIds = extractScenarioIds(route);
  const verifiedScenarioIds = new Set(extractScenarioIds(body));
  for (const id of routeScenarioIds) {
    if (!verifiedScenarioIds.has(id)) fail(`verification.md missing route scenario id ${id}`);
  }
  rejectPlaceholders("verification.md", body);
}

async function validateRetro(sessionDir) {
  const body = await readRequired(sessionDir, "retro.md");
  requireHeadings("retro.md", body, [
    "Objective",
    "Final Outcome",
    "What Changed",
    "Verification Evidence",
    "Decisions That Mattered",
    "Reusable Lessons",
    "Promoted Memory Candidates",
    "Follow-Up Work",
  ]);
  validateMemoryCandidates(body);
  rejectPlaceholders("retro.md", body);
}

function validateMemoryCandidates(body) {
  const section = extractSection(body, "Promoted Memory Candidates");
  if (/^No promoted memory candidates\./im.test(section)) return;
  const candidateMatches = [...section.matchAll(/^#{2,3}\s+(?:Memory Candidate|Candidate):\s*(.+)$/gim)];
  if (candidateMatches.length === 0) {
    fail("retro.md missing memory candidate schema or explicit empty candidate note");
  }
  for (let index = 0; index < candidateMatches.length; index += 1) {
    const match = candidateMatches[index];
    const start = match.index ?? 0;
    const next = candidateMatches[index + 1];
    const candidate = section.slice(start, next?.index ?? section.length);
    requireFieldValues("retro.md memory candidate", candidate, [
      "Type:",
      "Stability:",
      "Trigger:",
      "Symptom:",
      "Cause:",
      "Fix:",
      "Future use:",
      "Source artifact:",
      "Promotion verdict:",
    ]);
    const verdict = candidate.match(/^Promotion verdict:\s*(promote|session-only|reject)\b/im);
    if (!verdict) {
      fail("retro.md memory candidate has invalid promotion verdict");
    }
    if (/^Stability:\s*session-bound\b/im.test(candidate) && /promote/i.test(verdict[1])) {
      fail("retro.md memory candidate cannot promote session-bound detail");
    }
  }
}

async function validateOptionalJson(sessionDir, rel) {
  const body = await readOptional(sessionDir, rel);
  if (body === null) return;
  try {
    JSON.parse(body);
  } catch (error) {
    fail(`${rel} is not valid JSON: ${error.message}`);
  }
}

async function validateOptionalWorkerPackets(sessionDir) {
  const body = await readOptional(sessionDir, "worker-packets.md");
  if (body === null || !body.trim()) return;
  requireLabels("worker-packets.md", body, [
    "Worker name:",
    "Mission:",
    "Context to read:",
    "Allowed write scope:",
    "Forbidden actions:",
    "Required output artifact:",
    "Done criteria:",
    "Verification notes:",
  ]);
  rejectPlaceholders("worker-packets.md", body);
}

async function main() {
  const { sessionDir, stage: requestedStage } = parseArgs(process.argv.slice(2));
  const present = await listPresent(sessionDir);
  const contract = await validateContract(sessionDir);
  const stage = requestedStage ?? inferStage(contract, present);
  const targetIndex = STAGES.indexOf(stage);
  const validators = [
    validateCharting,
    validateResearch,
    validateAutopilot,
    validateVerify,
    validateRetro,
  ];
  for (let index = 0; index <= targetIndex; index += 1) {
    await validators[index](sessionDir);
  }
  console.log(`skill session check pass: ${basename(sessionDir)} (${stage})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
