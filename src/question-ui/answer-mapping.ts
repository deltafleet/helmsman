import { hashQuestionBundle } from "../core/authority/question-hash.ts";
import { CoreError, type HelmsmanManifest, type QuestionAnswerContract, type QuestionBundleContract, type QuestionContract, type RouteEffect } from "../core/authority/types.ts";

export interface QuestionAnswerPayload {
  bundleId: string;
  questionId: string;
  answer: QuestionAnswerContract;
  appliedRouteEffects: RouteEffect[];
  evidenceIds: string[];
}

type RawAnswerValue =
  | string
  | string[]
  | {
      selected?: string | string[];
      optionIds?: string[];
      freeFormText?: string;
      notes?: Record<string, string>;
    };

export function buildQuestionAnswerPayloads(input: {
  manifest: HelmsmanManifest;
  rawAnswer: string;
  answeredAt?: string;
}): QuestionAnswerPayload[] {
  const bundle = findActiveBundle(input.manifest);
  if (!bundle) {
    throw new CoreError({ code: "QUESTION_SURFACE_MISSING", message: "No open Core-authored question bundle is available to answer." });
  }
  const surface = findSurfaceForBundle(input.manifest, bundle);
  if (!surface) {
    throw new CoreError({ code: "QUESTION_SURFACE_MISSING", message: `No rendered surface evidence found for bundle ${bundle.bundleId}.` });
  }
  const parsed = parseRawAnswer(input.rawAnswer);
  const answeredAt = input.answeredAt ?? new Date().toISOString();
  const bundleHash = hashQuestionBundle(bundle);
  const evidenceIds = [surface.surfaceId];
  const payloads: QuestionAnswerPayload[] = [];

  for (let index = 0; index < bundle.questions.length; index++) {
    const question = bundle.questions[index];
    if (!input.manifest.questions.openQuestionIds.includes(question.questionId)) continue;
    const raw = parsed[question.questionId] ?? parsed[`q${index + 1}`];
    if (raw === undefined) continue;

    const normalized = normalizeAnswerValue(raw);
    const selectedOptionIds = normalized.selected.map((selected) => optionIdFromAlias(question, selected));
    validateSelection(question, selectedOptionIds, normalized.freeFormText);

    const selectedOptions = selectedOptionIds.map((optionId) => question.options.find((option) => option.optionId === optionId)!);
    const perOptionNotes = normalizeNotes(question, normalized.notes);
    const answer: QuestionAnswerContract = {
      questionId: question.questionId,
      selectedOptionIds,
      freeFormText: normalized.freeFormText,
      answeredAt,
      authority: "user",
      surfaceId: surface.surfaceId,
      userVisibleBundleHash: bundleHash,
      answerDetails: {
        optionLabels: selectedOptions.map((option) => option.label),
        optionDescriptions: selectedOptions.map((option) => option.description),
        perOptionNotes,
      },
    };
    payloads.push({
      bundleId: bundle.bundleId,
      questionId: question.questionId,
      answer,
      appliedRouteEffects: selectedOptionIds.flatMap((optionId) => question.routeEffectsByOption[optionId] ?? []),
      evidenceIds,
    });
  }

  if (payloads.length === 0) {
    throw new CoreError({ code: "QUESTION_ANSWER_UNAUTHORIZED", message: "No submitted answer matched an open question id or qN alias." });
  }
  return payloads;
}

export function findActiveBundle(manifest: HelmsmanManifest): QuestionBundleContract | undefined {
  const open = new Set(manifest.questions.openQuestionIds);
  return Object.values(manifest.questions.bundles).find((bundle) => bundle.questions.some((question) => open.has(question.questionId)));
}

function findSurfaceForBundle(manifest: HelmsmanManifest, bundle: QuestionBundleContract) {
  const bundleHash = hashQuestionBundle(bundle);
  return Object.values(manifest.questions.surfaces).find((surface) => surface.bundleHash === bundleHash);
}

function parseRawAnswer(rawAnswer: string): Record<string, RawAnswerValue> {
  const trimmed = rawAnswer.trim();
  if (!trimmed) {
    throw new CoreError({ code: "QUESTION_ANSWER_UNAUTHORIZED", message: "Missing answer payload." });
  }
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new CoreError({ code: "EVENT_SCHEMA_INVALID", message: "Answer JSON must be an object keyed by qN or questionId." });
    }
    return parsed as Record<string, RawAnswerValue>;
  }

  const output: Record<string, RawAnswerValue> = {};
  for (const token of trimmed.split(/\s+/)) {
    const separator = token.indexOf("=");
    if (separator <= 0) {
      throw new CoreError({ code: "EVENT_SCHEMA_INVALID", message: `Answer token ${token} must use key=value syntax.` });
    }
    output[token.slice(0, separator)] = token.slice(separator + 1).split(",").filter(Boolean);
  }
  return output;
}

function normalizeAnswerValue(value: RawAnswerValue): { selected: string[]; freeFormText?: string; notes?: Record<string, string> } {
  if (typeof value === "string") return { selected: value.split(",").filter(Boolean) };
  if (Array.isArray(value)) return { selected: value };
  const selectedRaw = value.optionIds ?? value.selected ?? [];
  const selected = typeof selectedRaw === "string" ? selectedRaw.split(",").filter(Boolean) : selectedRaw;
  return { selected, freeFormText: value.freeFormText, notes: value.notes };
}

function optionIdFromAlias(question: QuestionContract, value: string): string {
  const exact = question.options.find((option) => option.optionId === value);
  if (exact) return exact.optionId;
  if (/^[a-d]$/i.test(value)) {
    const index = value.toLowerCase().charCodeAt(0) - "a".charCodeAt(0);
    const option = question.options[index];
    if (option) return option.optionId;
  }
  throw new CoreError({ code: "EVENT_SCHEMA_INVALID", message: `Unknown option ${value} for question ${question.questionId}.` });
}

function validateSelection(question: QuestionContract, selectedOptionIds: string[], freeFormText?: string): void {
  if (question.type === "single_select" && selectedOptionIds.length !== 1) {
    throw new CoreError({ code: "EVENT_SCHEMA_INVALID", message: `Question ${question.questionId} requires exactly one selected option.` });
  }
  if (question.type === "multi_select" && selectedOptionIds.length < 1) {
    throw new CoreError({ code: "EVENT_SCHEMA_INVALID", message: `Question ${question.questionId} requires at least one selected option.` });
  }
  if (question.type === "free_text" && !freeFormText) {
    throw new CoreError({ code: "EVENT_SCHEMA_INVALID", message: `Question ${question.questionId} requires free-form text.` });
  }
  if (freeFormText && !question.allowFreeForm) {
    throw new CoreError({ code: "EVENT_SCHEMA_INVALID", message: `Question ${question.questionId} does not allow free-form text.` });
  }
}

function normalizeNotes(question: QuestionContract, notes?: Record<string, string>): Record<string, string> | undefined {
  if (!notes) return undefined;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(notes)) {
    output[optionIdFromAlias(question, key)] = value;
  }
  return output;
}
