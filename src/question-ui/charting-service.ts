import { executeCoreCommand, type CoreCommandResult } from "../core/authority/core-store.ts";
import type { BoardProjection, HelmsmanManifest } from "../core/authority/types.ts";
import type { RunPaths } from "../core/document-bus/paths.ts";
import { buildApertureQuestionBundle } from "./bundle-builder.ts";
import { buildQuestionAnswerPayloads } from "./answer-mapping.ts";
import { renderQuestionBundle } from "./adapter.ts";

export async function askCoreQuestionBundle(input: {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
  renderer: "pi_tui" | "headless_cli";
  width?: number;
}): Promise<CoreCommandResult> {
  const bundle = buildApertureQuestionBundle({ manifest: input.manifest, board: input.board });
  const rendered = await renderQuestionBundle({ paths: input.paths, bundle, renderer: input.renderer, width: input.width });
  return await executeCoreCommand(input.paths, {
    commandType: "question.bundle_ask",
    cwd: input.paths.cwd,
    runId: input.paths.runId,
    actor: { kind: "core_policy", id: "core" },
    boardRevisionRead: input.board.revision,
    payload: {
      bundle,
      surface: rendered.surface,
      surfaceEvidence: rendered.surfaceEvidence,
    },
  });
}

export async function answerCoreQuestions(input: {
  paths: RunPaths;
  manifest: HelmsmanManifest;
  board: BoardProjection;
  rawAnswer: string;
}): Promise<CoreCommandResult> {
  const payloads = buildQuestionAnswerPayloads({ manifest: input.manifest, rawAnswer: input.rawAnswer });
  let board = input.board;
  let result: CoreCommandResult | undefined;
  for (const payload of payloads) {
    result = await executeCoreCommand(input.paths, {
      commandType: "question.answer_record",
      cwd: input.paths.cwd,
      runId: input.paths.runId,
      actor: { kind: "user", id: "tui" },
      boardRevisionRead: board.revision,
      payload: payload as unknown as Record<string, unknown>,
    });
    board = result.board;
  }
  if (!result) throw new Error("No question answers were submitted.");
  return result;
}
