#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { validateNativeQuestionTranscript } from "./lib/native-question-transcript.mjs";

const REQUIRED_FILES = [
  "goal.md",
  "goal-charter.md",
  "route-card.md",
  "contract.md",
  "charting-loop.md",
  "question-bundles.md",
  "memory-scan.md",
  "verification-scenarios.md",
  "stop-conditions.md",
  "resume-report-template.md",
];

const FLOW = [
  "Signal Read",
  "Aperture Question Bundle",
  "Scoped Memory Scan",
  "Research Lanes",
  "Synthesis",
  "Sharpness Check",
];

const MEMORY_JUDGMENTS = new Set(["reused", "stale", "irrelevant", "missing", "conflict"]);
const RESEARCH_REQUIRED = new Set(["stale", "missing", "conflict"]);

function usage() {
  return [
    "Usage: bun scripts/validate-native-goal.mjs <goal-dir>",
    "Validates that a native /goal attachment workspace preserves the strict Charting loop contract.",
  ].join("\n");
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const goalDir = argv[0];
  if (!goalDir || goalDir === "--help" || goalDir === "-h") {
    console.log(usage());
    process.exit(goalDir ? 0 : 1);
  }
  if (argv.length > 1) fail(`unknown argument: ${argv[1]}`);
  return { goalDir };
}

async function readRequired(goalDir, rel) {
  try {
    const body = await readFile(join(goalDir, rel), "utf8");
    if (!body.trim()) fail(`${rel} is empty`);
    return body;
  } catch (error) {
    if (error && error.code === "ENOENT") fail(`${rel} is missing`);
    throw error;
  }
}

async function readOptional(goalDir, rel) {
  try {
    const body = await readFile(join(goalDir, rel), "utf8");
    return body.trim() ? body : null;
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

function requireIncludes(rel, body, phrases) {
  for (const phrase of phrases) {
    if (!body.includes(phrase)) fail(`${rel} missing '${phrase}'`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requireHeadings(rel, body, headings) {
  for (const heading of headings) {
    const pattern = new RegExp(`^#{1,3}\\s+${escapeRegExp(heading)}\\s*$`, "m");
    if (!pattern.test(body)) fail(`${rel} missing heading '${heading}'`);
  }
}

function requireFieldValues(rel, body, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`^\\s*-?\\s*${escapeRegExp(label)}\\s*(.+)$`, "im");
    if (!pattern.test(body)) fail(`${rel} missing '${label}'`);
  }
}

function rejectTemplatePlaceholders(rel, body) {
  const match = body.match(/<[^>\n]+>|\b(TODO|TBD|PLACEHOLDER|FIXME)\b|\?\?\?/i);
  if (match) fail(`${rel} contains unresolved template text '${match[0]}'`);
}

function requireOrderedFlow(rel, body) {
  let cursor = -1;
  for (const phrase of FLOW) {
    const index = body.indexOf(phrase);
    if (index === -1) fail(`${rel} missing Charting loop step '${phrase}'`);
    if (index <= cursor) fail(`${rel} has Charting loop step out of order: ${phrase}`);
    cursor = index;
  }
}

function parseMarkdownRows(body) {
  const rows = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|\s*-+/.test(trimmed)) continue;
    if (/\bCandidate\b.*\bJudgment\b/i.test(trimmed)) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length >= 6) rows.push(cells);
  }
  return rows;
}

function parseChartingCycles(body) {
  return parseMarkdownRows(body)
    .filter((cells) => /^C-\d{3}$/i.test(cells[0] || ""))
    .map((cells) => ({
      cycleId: cells[0].toUpperCase(),
      questionRef: cells[2] || "",
      decision: (cells[8] || "").toLowerCase(),
    }));
}

function nextCycleId(cycleId) {
  const number = Number(cycleId.slice(2));
  return `C-${String(number + 1).padStart(3, "0")}`;
}

function parseQuestionBundleIds(body) {
  return new Set([...body.matchAll(/^##\s+(C-\d{3})\b/gim)].map((match) => match[1].toUpperCase()));
}

function extractBundleSections(body) {
  const matches = [
    ...body.matchAll(/^##\s+(C-\d{3})\s+(Aperture|Decision)\s+Question Bundle\s*$/gim),
  ];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const next = matches[index + 1];
    return {
      id: match[1].toUpperCase(),
      type: match[2].toLowerCase(),
      body: body.slice(start, next?.index ?? body.length).trim(),
    };
  });
}

function extractQuestionSections(bundle) {
  const matches = [...bundle.matchAll(/^###\s+(Q\d+)\s*$/gim)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const next = matches[index + 1];
    return {
      id: match[1].toUpperCase(),
      body: bundle.slice(start, next?.index ?? bundle.length).trim(),
    };
  });
}

function fieldValue(body, label) {
  return (
    body.match(new RegExp(`^\\s*${escapeRegExp(label)}\\s*(.+)$`, "im"))?.[1]?.trim() || ""
  );
}

function bundleReview(bundle) {
  return fieldValue(bundle, "Bundle review:").toLowerCase();
}

function surfaceStatus(bundle) {
  return fieldValue(bundle, "Surface status:").toLowerCase();
}

function optionBlock(question, option) {
  const lines = question.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^${option}\\.\\s+`, "i").test(line));
  if (start === -1) return "";
  const end = lines.findIndex(
    (line, index) => index > start && /^(?:[ABC]\.\s+|Free-form answers)/i.test(line),
  );
  return lines.slice(start, end === -1 ? lines.length : end).join("\n");
}

function parseResearchRows(body) {
  return parseMarkdownRows(body)
    .filter((cells) => cells.length >= 9 && !/^Slug$/i.test(cells[0] || ""))
    .map((cells) => ({
      slug: cells[0],
      owner: cells[3],
      status: cells[4],
      artifact: cells[5],
    }));
}

function parseResearchLaneCell(value) {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && item.toLowerCase() !== "none");
}

function parseLaunchPosture(body) {
  return body.match(/^Launch posture:\s*(.+)$/im)?.[1]?.trim().toLowerCase() || "";
}

function isClearedSharpnessValue(value) {
  const normalized = value.trim().toLowerCase().replace(/[.;]+$/, "");
  return ["none", "no", "0", "cleared", "no plausible divergent destination"].includes(normalized);
}

function sharpnessValue(body, label) {
  return body.match(new RegExp(`^-\\s*${label}:\\s*(.+)$`, "im"))?.[1]?.trim() || "";
}

function validateQuestionCoverage(questions, chartingLoop) {
  const questionIds = parseQuestionBundleIds(questions);
  const cycles = parseChartingCycles(chartingLoop);
  if (cycles.length === 0) fail("charting-loop.md has no charting cycle rows");

  for (const cycle of cycles) {
    const referencedQuestion = cycle.questionRef.match(/question-bundles\.md#(c-\d{3})/i)?.[1]?.toUpperCase();
    if (!referencedQuestion || !questionIds.has(referencedQuestion)) {
      fail(`question-bundles.md missing question bundle for charting cycle ${cycle.cycleId}`);
    }
    if (referencedQuestion !== cycle.cycleId) {
      fail(`charting-loop.md cycle ${cycle.cycleId} must reference question-bundles.md#${cycle.cycleId.toLowerCase()}`);
    }
  }

  const cycleIds = new Set(cycles.map((cycle) => cycle.cycleId));
  for (const cycle of cycles) {
    if (cycle.decision !== "loop") continue;
    const nextId = nextCycleId(cycle.cycleId);
    if (!cycleIds.has(nextId)) fail(`charting-loop.md loop cycle ${cycle.cycleId} has no next cycle ${nextId}`);
    if (!questionIds.has(nextId)) fail(`question-bundles.md missing question bundle for charting cycle ${nextId}`);
  }
}

async function validateNativeQuestionSurface(rel, bundleId, bundle, questions, goalDir) {
  requireHeadings(`${rel} ${bundleId}`, bundle, ["Native Question Surface"]);
  requireFieldValues(`${rel} ${bundleId}`, bundle, [
    "Surface status:",
    "Rendered in native chat:",
    "Rendered message reference:",
    "Native transcript evidence:",
    "Covered questions:",
    "Covered options:",
    "Recommendation shown:",
    "Reasons shown:",
    "Tradeoffs shown:",
    "Route effects shown:",
    "Free-form override shown:",
    "User answer source:",
    "User answer evidence:",
  ]);

  const status = surfaceStatus(bundle);
  if (!["not-rendered", "rendered", "answered", "not-needed"].includes(status)) {
    fail(`${rel} ${bundleId} has invalid Surface status '${fieldValue(bundle, "Surface status:")}'`);
  }

  const review = bundleReview(bundle);
  const mustBeRendered = /\b(blocked|answered|lock-ready|continue)\b/.test(review);
  if (mustBeRendered && status === "not-rendered") {
    fail(`${rel} ${bundleId} is ${review} but native question surface is not-rendered`);
  }
  if (["rendered", "answered"].includes(status)) {
    for (const [label, expected] of [
      ["Rendered in native chat:", "yes"],
      ["Recommendation shown:", "yes"],
      ["Reasons shown:", "yes"],
      ["Tradeoffs shown:", "yes"],
      ["Route effects shown:", "yes"],
      ["Free-form override shown:", "yes"],
    ]) {
      const actual = fieldValue(bundle, label).toLowerCase();
      if (actual !== expected) fail(`${rel} ${bundleId} ${label} must be ${expected}`);
    }
    const coveredOptions = fieldValue(bundle, "Covered options:");
    if (!/\bA\/B\/C\b/i.test(coveredOptions)) {
      fail(`${rel} ${bundleId} Covered options must include A/B/C`);
    }
  }

  await validateNativeQuestionTranscript({
    rootDir: goalDir,
    rel,
    bundleId,
    status,
    nativeTranscriptEvidence: fieldValue(bundle, "Native transcript evidence:"),
    userAnswerEvidence: fieldValue(bundle, "User answer evidence:"),
    questions,
  });
}

function validateQuestionOptionShape(rel, bundleId, question) {
  requireIncludes(`${rel} ${bundleId} ${question.id}`, question.body, [
    "Question:",
    "Why this matters:",
    "Free-form answers are welcome",
    "User answer:",
    "Route effect:",
  ]);

  let recommendedCount = 0;
  for (const option of ["A", "B", "C"]) {
    const block = optionBlock(question.body, option);
    if (!block) fail(`${rel} ${bundleId} ${question.id} missing option ${option}`);
    if (/\(Recommended\)/i.test(block)) recommendedCount += 1;
    for (const label of ["Reason:", "Tradeoff:", "What this answer changes:"]) {
      if (!new RegExp(`^\\s*${escapeRegExp(label)}\\s*\\S+`, "im").test(block)) {
        fail(`${rel} ${bundleId} ${question.id} option ${option} missing '${label}'`);
      }
    }
  }

  if (recommendedCount !== 1) {
    fail(`${rel} ${bundleId} ${question.id} must mark exactly one option as (Recommended)`);
  }
}

async function validateQuestionBundles(goalDir, body) {
  requireIncludes("question-bundles.md", body, ["Aperture Question Bundle"]);
  rejectTemplatePlaceholders("question-bundles.md", body);
  const bundles = extractBundleSections(body);
  if (bundles.length === 0) fail("question-bundles.md has no question bundles");
  if (!bundles.some((bundle) => bundle.type === "aperture")) {
    fail("question-bundles.md missing Aperture Question Bundle");
  }
  for (const bundle of bundles) {
    requireFieldValues(`question-bundles.md ${bundle.id}`, bundle.body, [
      "Bundle type:",
      "Bundle review:",
    ]);
    const questionSections = extractQuestionSections(bundle.body);
    await validateNativeQuestionSurface(
      "question-bundles.md",
      bundle.id,
      bundle.body,
      questionSections,
      goalDir,
    );
    if (surfaceStatus(bundle.body) === "not-needed") continue;
    if (questionSections.length === 0) fail(`question-bundles.md ${bundle.id} has no questions`);
    if (questionSections.length > 4) fail(`question-bundles.md ${bundle.id} has more than 4 questions`);
    for (const question of questionSections) {
      validateQuestionOptionShape("question-bundles.md", bundle.id, question);
    }
  }
}

function validateMemoryScan(body) {
  requireIncludes("memory-scan.md", body, [
    "Broad Memory Scan is forbidden before the first Aperture Question Bundle",
    "Scoped Memory Scan happens before Research Lanes",
    "reused | stale | irrelevant | missing | conflict",
    "Research Lane",
  ]);

  const rows = parseMarkdownRows(body);
  if (rows.length === 0) fail("memory-scan.md has no memory candidate rows");

  const researchLaneOrigins = new Set();
  for (const cells of rows) {
    const judgment = cells[2]?.toLowerCase();
    const researchNeeded = cells[5]?.toLowerCase();
    const researchLanes = parseResearchLaneCell(cells[6]);
    if (!MEMORY_JUDGMENTS.has(judgment)) {
      fail(`memory-scan.md has invalid memory judgment '${cells[2]}'`);
    }
    if (!["yes", "no"].includes(researchNeeded)) {
      fail(`memory-scan.md has invalid Research Needed value '${cells[5]}'`);
    }
    if (RESEARCH_REQUIRED.has(judgment) && researchNeeded !== "yes") {
      fail(`memory-scan.md judgment '${judgment}' must require research`);
    }
    if (RESEARCH_REQUIRED.has(judgment) && researchLanes.length === 0) {
      fail(`memory-scan.md judgment '${judgment}' must name a research lane`);
    }
    if (!RESEARCH_REQUIRED.has(judgment) && researchNeeded !== "no") {
      fail(`memory-scan.md judgment '${judgment}' must not require research`);
    }
    if (!RESEARCH_REQUIRED.has(judgment) && researchLanes.length > 0) {
      fail(`memory-scan.md judgment '${judgment}' must not name a research lane`);
    }
    for (const lane of researchLanes) researchLaneOrigins.add(lane);
  }
  return researchLaneOrigins;
}

async function validateResearchIndex(goalDir, body, researchLaneOrigins) {
  requireIncludes("research-index.md", body, [
    "Max active research lanes:",
    "Launch posture:",
    "| Slug | Question | Lane Type | Owner | Status | Artifact | Sources Checked | Decision Impact | Open Uncertainty |",
  ]);
  rejectTemplatePlaceholders("research-index.md", body);

  const rows = parseResearchRows(body);
  if (rows.length === 0) fail("research-index.md has no research lane rows");
  const rowSlugs = new Set(rows.map((row) => row.slug));
  for (const row of rows) {
    if (!researchLaneOrigins.has(row.slug)) {
      fail(`research-index.md lane '${row.slug}' has no research-needed memory origin`);
    }
  }
  for (const lane of researchLaneOrigins) {
    if (!rowSlugs.has(lane)) fail(`memory-scan.md research lane '${lane}' is missing from research-index.md`);
  }

  const launchPosture = parseLaunchPosture(body);
  if (launchPosture === "parallel" && rows.length > 1) {
    const workerPackets = await readOptional(goalDir, "worker-packets.md");
    if (!workerPackets) fail("worker-packets.md is required for parallel research lanes");
    requireIncludes("worker-packets.md", workerPackets, ["Launch mode: parallel", "Launch evidence: spawned in parallel"]);
    rejectTemplatePlaceholders("worker-packets.md", workerPackets);

    const owners = new Set();
    for (const row of rows) {
      if (!row.owner || /lead/i.test(row.owner)) {
        fail(`research-index.md parallel lane '${row.slug}' must have a research worker owner`);
      }
      if (owners.has(row.owner)) {
        fail(`research-index.md parallel lane owner '${row.owner}' is reused`);
      }
      owners.add(row.owner);
      requireIncludes("worker-packets.md", workerPackets, [
        `Worker name: ${row.owner}`,
        `Allowed write scope: ${row.artifact}`,
        `Required artifact: ${row.artifact}`,
      ]);
    }
  }

  return rows;
}

function validateChartingLoop(body) {
  requireOrderedFlow("charting-loop.md", body);
  requireIncludes("charting-loop.md", body, [
    "Route Lock is forbidden while Autopilot could reasonably execute a different destination",
    "Autopilot ambiguity:",
  ]);
  const locksRoute = /\|\s*lock\s*\|/i.test(body);
  const ambiguityValues = [...body.matchAll(/Autopilot ambiguity:\s*([^\n|]+)/gi)].map((match) =>
    match[1].trim().toLowerCase(),
  );
  const clearsAmbiguity = (value) => value === "none" || value === "no plausible divergent destination";
  if (locksRoute && (ambiguityValues.length === 0 || ambiguityValues.some((value) => !clearsAmbiguity(value)))) {
    fail("charting-loop.md locks route without clearing Autopilot ambiguity");
  }
  if (locksRoute) {
    const unresolvedSharpness = ["User-owned decisions remaining", "Evidence gaps", "Stale memory risks"]
      .map((label) => [label, sharpnessValue(body, label)])
      .filter(([, value]) => !value || !isClearedSharpnessValue(value));
    if (unresolvedSharpness.length > 0) fail("charting-loop.md locks route while sharpness is unresolved");
  }
}

async function validateResearchArtifacts(goalDir, researchRows) {
  const researchDir = join(goalDir, "research");
  const info = await stat(researchDir).catch((error) => {
    if (error && error.code === "ENOENT") fail("research/ is missing");
    throw error;
  });
  if (!info.isDirectory()) fail("research/ is not a directory");
  const files = (await readdir(researchDir)).filter((file) => file.endsWith(".md"));
  if (files.length === 0) fail("research/ has no markdown research artifacts");
  const rowByArtifact = new Map(researchRows.map((row) => [row.artifact, row]));
  for (const file of files) {
    const rel = `research/${file}`;
    const body = await readRequired(goalDir, rel);
    requireIncludes(rel, body, [
      "## Question",
      "## Lane Type",
      "## Sources Checked",
      "## Observations",
      "## Inferences",
      "## Decision Impact",
      "## Recommended Next Step",
    ]);
    const row = rowByArtifact.get(rel);
    if (row) requireIncludes(rel, body, ["## Worker Packet", `Worker: ${row.owner}`]);
    rejectTemplatePlaceholders(rel, body);
  }
  for (const row of researchRows) {
    if (!files.includes(row.artifact.replace(/^research\//, ""))) {
      fail(`research-index.md artifact is missing: ${row.artifact}`);
    }
  }
}

async function main() {
  const { goalDir } = parseArgs(process.argv.slice(2));
  for (const rel of REQUIRED_FILES) {
    await readRequired(goalDir, rel);
  }

  const goal = await readRequired(goalDir, "goal.md");
  requireIncludes("goal.md", goal, [
    "/goal @.helmsman/goals/<goal-id>/goal.md",
    "charting-loop.md",
    "question-bundles.md",
    "memory-scan.md",
    "Scoped Memory Scan before Research Lanes",
    "repeat question, memory, research, synthesis, and sharpness cycles",
  ]);

  const charter = await readRequired(goalDir, "goal-charter.md");
  requireIncludes("goal-charter.md", charter, [
    "broad Memory Scan before the first Aperture Question Bundle is forbidden",
    "Research Lanes only handle stale, missing, or conflicting prior memory",
  ]);
  rejectTemplatePlaceholders("goal-charter.md", charter);

  const questions = await readRequired(goalDir, "question-bundles.md");
  await validateQuestionBundles(goalDir, questions);

  const researchLaneOrigins = validateMemoryScan(await readRequired(goalDir, "memory-scan.md"));

  const researchIndex = await readRequired(goalDir, "research-index.md");
  const researchRows = await validateResearchIndex(goalDir, researchIndex, researchLaneOrigins);
  await validateResearchArtifacts(goalDir, researchRows);

  const chartingLoop = await readRequired(goalDir, "charting-loop.md");
  validateChartingLoop(chartingLoop);
  validateQuestionCoverage(questions, chartingLoop);

  const stop = await readRequired(goalDir, "stop-conditions.md");
  requireIncludes("stop-conditions.md", stop, [
    "Broad Memory Scan would run before the first Aperture Question Bundle",
    "Research Lanes would launch before scoped Memory Scan",
    "Route Lock would happen before a Sharpness Check",
  ]);

  const scenarios = await readRequired(goalDir, "verification-scenarios.md");
  requireIncludes("verification-scenarios.md", scenarios, [
    "SC-LOOP-001",
    "SC-LOOP-002",
    "SC-LOOP-003",
  ]);

  console.log(`native goal check pass: ${goalDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
