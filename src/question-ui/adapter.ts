import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { jsonLine } from "../core/document-bus/atomic-write.ts";
import type { RunPaths } from "../core/document-bus/paths.ts";
import { hashQuestionBundle } from "../core/authority/question-hash.ts";
import type { EvidenceRecord, QuestionBundleContract, QuestionSurfaceContract, RouteEffect } from "../core/authority/types.ts";

export interface QuestionUiRenderResult {
  surface: QuestionSurfaceContract;
  surfaceEvidence: EvidenceRecord;
  evidenceObject: NativeQuestionSurfaceEvidence;
}

interface NativeQuestionSurfaceEvidence {
  evidenceId: string;
  surfaceId: string;
  bundleId: string;
  renderer: "pi_tui" | "headless_cli";
  rendererVersion: string;
  displayedAt: string;
  locale: string;
  width?: number;
  bundleHash: string;
  transcriptPath: string;
  renderedMarkdownPath: string;
  displayedQuestions: Array<{
    questionId: string;
    prompt: string;
    whyItMatters: string;
    options: Array<{
      optionId: string;
      label: string;
      description: string;
      recommended: boolean;
      recommendationReason?: string;
      routeEffectSummary: string[];
    }>;
    freeFormAvailable: boolean;
    requiredForLock: boolean;
  }>;
}

export async function renderQuestionBundle(input: {
  paths: RunPaths;
  bundle: QuestionBundleContract;
  renderer: "pi_tui" | "headless_cli";
  locale?: string;
  width?: number;
}): Promise<QuestionUiRenderResult> {
  const bundleHash = hashQuestionBundle(input.bundle);
  const surfaceId = `question-surface:${input.bundle.bundleId}:${bundleHash.slice(0, 12)}`;
  const evidenceId = `question-surface:${input.bundle.bundleId}:${bundleHash.slice(0, 12)}`;
  const displayedAt = new Date().toISOString();
  const renderedMarkdownPath = join(input.paths.renderedQuestionsRoot, `${input.bundle.bundleId}.md`);
  const transcriptPath = input.paths.nativeQuestionSurfaceEvidencePath;
  const rendererVersion = "helmsman-question-ui.v1";

  await mkdir(input.paths.renderedQuestionsRoot, { recursive: true });
  const evidenceObject: NativeQuestionSurfaceEvidence = {
    evidenceId,
    surfaceId,
    bundleId: input.bundle.bundleId,
    renderer: input.renderer,
    rendererVersion,
    displayedAt,
    locale: input.locale ?? "en-US",
    width: input.width,
    bundleHash,
    transcriptPath,
    renderedMarkdownPath,
    displayedQuestions: input.bundle.questions.map((question) => ({
      questionId: question.questionId,
      prompt: question.prompt,
      whyItMatters: question.whyItMatters,
      freeFormAvailable: question.allowFreeForm,
      requiredForLock: question.requiredForLock,
      options: question.options.map((option) => ({
        optionId: option.optionId,
        label: option.label,
        description: option.description,
        recommended: option.optionId === question.recommendedOptionId,
        recommendationReason: option.optionId === question.recommendedOptionId ? question.recommendationReason : undefined,
        routeEffectSummary: (question.routeEffectsByOption[option.optionId] ?? []).map(summarizeRouteEffect),
      })),
    })),
  };

  await writeFile(renderedMarkdownPath, renderQuestionBundleMarkdown(input.bundle, evidenceObject), "utf8");
  await appendFile(transcriptPath, jsonLine(evidenceObject), "utf8");

  const surface: QuestionSurfaceContract = {
    surfaceId,
    renderer: input.renderer,
    rendererVersion,
    displayedAt,
    transcriptEvidencePath: transcriptPath,
    width: input.width,
    locale: input.locale ?? "en-US",
    bundleHash,
  };

  return {
    surface,
    evidenceObject,
    surfaceEvidence: {
      evidenceId,
      kind: "question.surface",
      path: transcriptPath,
      summary: `Rendered ${input.bundle.bundleId} with ${input.bundle.questions.length} questions and bundle hash ${bundleHash}.`,
      recordedAt: displayedAt,
    },
  };
}

function renderQuestionBundleMarkdown(bundle: QuestionBundleContract, evidence: NativeQuestionSurfaceEvidence): string {
  const lines: string[] = [
    `# ${bundle.title}`,
    "",
    `Bundle: ${bundle.bundleId}`,
    `Purpose: ${bundle.purpose}`,
    `Bundle Hash: ${evidence.bundleHash}`,
    `Surface: ${evidence.surfaceId}`,
    "",
    bundle.routeQuestion,
    "",
  ];

  bundle.questions.forEach((question, questionIndex) => {
    lines.push(`## q${questionIndex + 1}. ${question.prompt}`);
    lines.push("");
    lines.push(`Question id: ${question.questionId}`);
    lines.push(`Why it matters: ${question.whyItMatters}`);
    lines.push(`Required for lock: ${question.requiredForLock ? "yes" : "no"}`);
    lines.push(`Free form available: ${question.allowFreeForm ? "yes" : "no"}`);
    lines.push("");
    question.options.forEach((option, optionIndex) => {
      const alias = String.fromCharCode("a".charCodeAt(0) + optionIndex);
      const recommended = option.optionId === question.recommendedOptionId ? " recommended" : "";
      lines.push(`- ${alias}. ${option.label}${recommended}`);
      lines.push(`  Option id: ${option.optionId}`);
      lines.push(`  Description: ${option.description}`);
      if (option.optionId === question.recommendedOptionId && question.recommendationReason) {
        lines.push(`  Recommendation reason: ${question.recommendationReason}`);
      }
      const effects = question.routeEffectsByOption[option.optionId] ?? [];
      lines.push(`  Route effects: ${effects.length === 0 ? "none" : effects.map(summarizeRouteEffect).join("; ")}`);
    });
    lines.push("");
  });

  lines.push("## Answer Syntax");
  lines.push("");
  lines.push("Use stable ids or visible aliases. Example:");
  lines.push("");
  lines.push("```text");
  lines.push('/answer {"q1":["a"],"q2":["a"],"q3":["a","b"],"q4":{"selected":["a"],"freeFormText":"keep scope strict"}}');
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function summarizeRouteEffect(effect: RouteEffect): string {
  if ("text" in effect) return `${effect.kind}: ${effect.text}`;
  if (effect.kind === "route.autonomy_boundary.set") return `${effect.kind}: ${Object.keys(effect.boundary).join(", ")}`;
  if (effect.kind === "route.verification_scenario.add") return `${effect.kind}: ${effect.scenario.scenarioId}`;
  if (effect.kind === "research.lane.request") return `${effect.kind}`;
  if (effect.kind === "gate.block" || effect.kind === "gate.unblock") return `${effect.kind}: ${effect.gateId}`;
  return effect.kind;
}
