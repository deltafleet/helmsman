import { readFile } from "node:fs/promises";
import { join } from "node:path";

const TRANSCRIPT_REL = "evidence/native-chat-transcript.jsonl";
const TRANSCRIPT_REF_PATTERN = /^evidence\/native-chat-transcript\.jsonl#([A-Za-z0-9._:-]+)$/;

function fail(message) {
  throw new Error(message);
}

function normalize(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function containsNormalized(haystack, needle) {
  const normalizedNeedle = normalize(needle);
  return normalizedNeedle.length > 0 && normalize(haystack).includes(normalizedNeedle);
}

function parseReference(rel, bundleId, label, value, { required }) {
  const ref = String(value || "").trim();
  if (!ref || ref.toLowerCase() === "none") {
    if (required) {
      fail(`${rel} ${bundleId} ${label} must reference ${TRANSCRIPT_REL}#<message-id>`);
    }
    return null;
  }
  const match = ref.match(TRANSCRIPT_REF_PATTERN);
  if (!match) {
    fail(`${rel} ${bundleId} ${label} must reference ${TRANSCRIPT_REL}#<message-id>`);
  }
  return match[1];
}

async function readTranscript(rootDir) {
  let body;
  try {
    body = await readFile(join(rootDir, TRANSCRIPT_REL), "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") fail(`${TRANSCRIPT_REL} is missing`);
    throw error;
  }
  if (!body.trim()) fail(`${TRANSCRIPT_REL} is empty`);

  const records = new Map();
  const lines = body.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      fail(`${TRANSCRIPT_REL}:${index + 1} is not valid JSON: ${error.message}`);
    }
    if (!record || typeof record !== "object") {
      fail(`${TRANSCRIPT_REL}:${index + 1} must be a JSON object`);
    }
    if (typeof record.id !== "string" || !record.id.trim()) {
      fail(`${TRANSCRIPT_REL}:${index + 1} missing id`);
    }
    if (records.has(record.id)) fail(`${TRANSCRIPT_REL} duplicate id '${record.id}'`);
    if (!["assistant", "user"].includes(record.role)) {
      fail(`${TRANSCRIPT_REL}:${index + 1} has invalid role '${record.role}'`);
    }
    if (record.surface !== "native-chat") {
      fail(`${TRANSCRIPT_REL}:${index + 1} must have surface 'native-chat'`);
    }
    if (typeof record.text !== "string" || !record.text.trim()) {
      fail(`${TRANSCRIPT_REL}:${index + 1} missing text`);
    }
    records.set(record.id, record);
  }
  if (records.size === 0) fail(`${TRANSCRIPT_REL} has no message records`);
  return records;
}

function transcriptRecord(records, rel, bundleId, label, id, role) {
  const record = records.get(id);
  if (!record) fail(`${rel} ${bundleId} ${label} references missing transcript id '${id}'`);
  if (record.role !== role) {
    fail(`${rel} ${bundleId} ${label} transcript id '${id}' must have role '${role}'`);
  }
  return record;
}

function questionField(question, label) {
  const pattern = new RegExp(`^${label}\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:Why this matters:|[ABC]\\.\\s+|Free-form answers|User answer:|Route effect:|$))`, "im");
  return question.match(pattern)?.[1]?.trim() || "";
}

function userAnswer(question) {
  const match = question.match(/^User answer:\s*\n([\s\S]*?)(?=\n\s*Route effect:|$)/im);
  return match?.[1]?.trim() || "";
}

function optionLine(question, option) {
  return question.match(new RegExp(`^${option}\\.\\s+(.+)$`, "im"))?.[0]?.trim() || "";
}

function validateAssistantTranscriptText(rel, bundleId, question, transcriptText) {
  const questionText = questionField(question.body, "Question:");
  if (!containsNormalized(transcriptText, questionText)) {
    fail(`${rel} ${bundleId} ${question.id} transcript evidence missing question text`);
  }
  if (!containsNormalized(transcriptText, "Free-form answers are welcome")) {
    fail(`${rel} ${bundleId} ${question.id} transcript evidence missing free-form override`);
  }
  if (!containsNormalized(transcriptText, "(Recommended)")) {
    fail(`${rel} ${bundleId} ${question.id} transcript evidence missing recommendation marker`);
  }

  for (const option of ["A", "B", "C"]) {
    const line = optionLine(question.body, option);
    if (!line) continue;
    if (!containsNormalized(transcriptText, line)) {
      fail(`${rel} ${bundleId} ${question.id} transcript evidence missing option ${option}`);
    }
  }
}

function validateUserTranscriptText(rel, bundleId, question, transcriptText) {
  const answer = userAnswer(question.body);
  if (!answer || /^pending\b/i.test(answer)) {
    fail(`${rel} ${bundleId} ${question.id} is answered but User answer is pending`);
  }
  if (!containsNormalized(transcriptText, answer) && !containsNormalized(answer, transcriptText)) {
    fail(`${rel} ${bundleId} ${question.id} user answer evidence does not match User answer`);
  }
}

export async function validateNativeQuestionTranscript({
  rootDir,
  rel,
  bundleId,
  status,
  nativeTranscriptEvidence,
  userAnswerEvidence,
  questions,
}) {
  if (!["rendered", "answered"].includes(status)) {
    parseReference(rel, bundleId, "Native transcript evidence:", nativeTranscriptEvidence, {
      required: false,
    });
    parseReference(rel, bundleId, "User answer evidence:", userAnswerEvidence, {
      required: false,
    });
    return;
  }

  const assistantId = parseReference(
    rel,
    bundleId,
    "Native transcript evidence:",
    nativeTranscriptEvidence,
    { required: true },
  );
  const userId = parseReference(rel, bundleId, "User answer evidence:", userAnswerEvidence, {
    required: status === "answered",
  });

  const records = await readTranscript(rootDir);
  const assistantRecord = transcriptRecord(
    records,
    rel,
    bundleId,
    "Native transcript evidence:",
    assistantId,
    "assistant",
  );
  for (const question of questions) {
    validateAssistantTranscriptText(rel, bundleId, question, assistantRecord.text);
  }

  if (status === "answered") {
    const userRecord = transcriptRecord(
      records,
      rel,
      bundleId,
      "User answer evidence:",
      userId,
      "user",
    );
    for (const question of questions) {
      validateUserTranscriptText(rel, bundleId, question, userRecord.text);
    }
  }
}
