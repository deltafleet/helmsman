import { sha256Json } from "./hash.ts";
import type { QuestionBundleContract } from "./types.ts";

export function hashQuestionBundle(bundle: QuestionBundleContract): string {
  return sha256Json({
    bundleId: bundle.bundleId,
    purpose: bundle.purpose,
    routeQuestion: bundle.routeQuestion,
    questions: bundle.questions.map((question) => ({
      questionId: question.questionId,
      prompt: question.prompt,
      whyItMatters: question.whyItMatters,
      recommendedOptionId: question.recommendedOptionId,
      recommendationReason: question.recommendationReason,
      requiredForLock: question.requiredForLock,
      allowFreeForm: question.allowFreeForm,
      options: question.options.map((option) => ({
        optionId: option.optionId,
        label: option.label,
        description: option.description,
        routeEffects: question.routeEffectsByOption[option.optionId] ?? [],
      })),
    })),
  });
}
