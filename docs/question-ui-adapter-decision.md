# Question UI Adapter Decision

Status: current binding decision for Gate 4 Charting Form Authority

Implementation status: Gate 4 is implemented for the Core-owned Pi TUI /
headless CLI renderer path. `rpiv_wrapper` remains a future optional adapter
path and is still not route authority.

## Decision

Helmsman will build a Core-owned Question UI Adapter.

The canonical route-authority question surface is:

```text
Core-authored QuestionBundleContract
-> Helmsman Question UI Adapter
-> full rendered-surface evidence
-> structured answer mapped to stable ids
-> Core validation
-> question ledger event
-> Manifest event
-> Board projection
```

`@juicesharp/rpiv-ask-user-question` is a strong candidate for UX reuse, but it
must not be used directly as the authority surface for Helmsman route decisions.
In its current `1.13.0` package shape, it is a Pi extension/tool that lets a
model ask structured questions. Helmsman route questions are not model-authored
tool calls; they are Core-authored authority checkpoints.

The primary implementation path is therefore:

```text
Core-owned Pi TUI renderer first
rpiv wrapper only after contract proof
upstream patch or narrow vendored adapter if direct reuse requires private APIs
```

This preserves the user's earlier instinct that the package is directionally
useful while keeping the product authority boundary intact.

## Verified Package Surface

Checked on 2026-05-27:

```text
@juicesharp/rpiv-ask-user-question: 1.13.0
exports:
  ".": "./index.ts"
  "./events": "./events.ts"
peerDependencies:
  @juicesharp/rpiv-i18n
  @earendil-works/pi-coding-agent
  @earendil-works/pi-tui
  typebox
```

Tarball source contains:

```text
ask-user-question.ts
events.ts
tool/types.ts
tool/validate-questionnaire.ts
tool/response-envelope.ts
state/questionnaire-session.ts
state/state-reducer.ts
view/*
```

The exported package root registers the `ask_user_question` tool. The public
events export exposes `ASK_USER_PROMPT_EVENT` and prompt event payload types.
Internal state/view modules exist in the tarball, but they are not part of the
declared package export surface.

## What The Package Proves

The package already proves useful interaction mechanics:

- 1 to 4 questions per invocation
- 2 to 4 options per question
- header chip with max length
- single-select and multi-select
- option descriptions
- optional markdown previews
- per-option notes
- submit/review tab
- cancellation
- localized UI labels
- validation for reserved labels and duplicates
- answer details with `questionIndex`, `question`, `kind`, selected labels,
  notes, preview, and cancellation state
- a prompt event with question/header/multiSelect/options/hasPreview metadata

These mechanics are worth borrowing. The product mistake would be treating them
as sufficient for Helmsman route authority.

## Gaps Against Helmsman Authority

Current `rpiv-ask-user-question@1.13.0` is insufficient as-is for route
authority because:

- It is model-tool oriented; the model calls `ask_user_question`.
- The input schema has question text and option labels, but no stable
  `bundleId`, `questionId`, or `optionId`.
- Recommendation is represented by convention only: first option plus
  `(Recommended)` in the label.
- There is no route-effect metadata.
- There is no lock-blocker metadata.
- There is no authority-source metadata.
- The answer returns labels and indices, not stable Helmsman ids.
- The prompt event omits preview content and does not carry bundle hash.
- The package has no public headless renderer/driver export.
- The package has no public full rendered transcript export proving the user
  saw every option, description, recommendation, and route consequence.
- Free-form fallback is suppressed in some preview/multi-select layouts by
  package design; Helmsman must make that explicit because Route Lock may still
  require user wording.
- Deep importing internal `state/*` or `view/*` modules would rely on a
  non-public package surface.

None of these gaps make the package bad. They mean Helmsman cannot delegate
route authority to the package.

## Required Helmsman Adapter Surface

The adapter must expose a Helmsman-owned interface:

```ts
interface QuestionUiAdapter {
  renderBundle(input: RenderQuestionBundleInput): Promise<QuestionUiResult>;
  renderBundleHeadless(input: HeadlessQuestionBundleInput): Promise<QuestionUiResult>;
  inspectCapabilities(): QuestionUiAdapterCapabilities;
}

interface RenderQuestionBundleInput {
  runId: string;
  bundle: QuestionBundleContract;
  surface: {
    renderer: "helmsman_pi_tui" | "rpiv_wrapper" | "headless_cli";
    locale: string;
    width?: number;
  };
  evidencePaths: {
    transcriptJsonl: string;
    renderedMarkdown: string;
  };
}

interface QuestionUiResult {
  status: "answered" | "cancelled" | "chat_requested" | "renderer_failed";
  surfaceId: string;
  bundleHash: string;
  userVisibleBundleHash: string;
  answers: QuestionAnswerContract[];
  evidenceIds: string[];
  rendererDiagnostics: QuestionRendererDiagnostic[];
}
```

The adapter result is not authority by itself. Core must validate it and append
the corresponding Manifest events.

## Bundle Hash Contract

Before rendering, Core computes a canonical hash over:

- `bundleId`
- `purpose`
- `routeQuestion`
- each `questionId`
- prompt
- `whyItMatters`
- each `optionId`
- label
- description
- recommendation marker and reason
- route effects
- required-for-lock flag
- free-form policy

The renderer records the hash it displayed. Core rejects answers when:

- displayed hash differs from Core hash
- answer references unknown labels/options
- the selected label maps ambiguously to more than one option id
- rendered transcript is missing
- transcript omits option descriptions or recommendation reason
- cancellation/chat request is hidden as a normal answer

## Evidence Contract

Every rendered bundle must produce:

```text
.helmsman/sessions/<run-id>/evidence/native-question-surface.jsonl
.helmsman/sessions/<run-id>/rendered/questions/<bundle-id>.md
```

Each evidence record:

```ts
interface NativeQuestionSurfaceEvidence {
  evidenceId: string;
  surfaceId: string;
  bundleId: string;
  renderer: "helmsman_pi_tui" | "rpiv_wrapper" | "headless_cli";
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
```

This is the Pi-direct replacement for the old native-chat-only evidence rule.
The invariant remains the same: a structurally valid question bundle is not
enough if the full option surface never reached the user-facing UI.

## Primary Renderer: Core-Owned Pi TUI

Gate 4 should implement `helmsman_pi_tui` first.

Reasons:

- It can render stable Helmsman ids without depending on third-party labels.
- It can show recommendation reason and route effects as first-class fields.
- It can write full rendered evidence before accepting user input.
- It can support headless CLI and CI with the same data model.
- It can avoid a model-tool loop for Core-authored questions.
- It can preserve free-form overrides consistently.
- It can fail closed under Core control.

The renderer should use Pi TUI primitives directly:

- `Component.render(width)`
- `Focusable`
- `Input`
- `SelectList`
- `SettingsList` where useful
- overlays for modal form surfaces
- width-aware rendering and IME cursor behavior

The renderer may borrow visual/interaction ideas from rpiv: tabbed question
bundles, submit review, notes, markdown previews, and row-aware overflow.

## rpiv Wrapper Path

`rpiv_wrapper` may exist only as a compatibility/reuse adapter.

It must:

- convert `QuestionBundleContract` to rpiv `QuestionParams`
- maintain a private stable mapping from rpiv question index/label to
  Helmsman `questionId` and `optionId`
- encode recommendation as display text only after preserving separate
  Helmsman recommendation metadata
- pre-render full Helmsman evidence before calling rpiv
- listen for `ASK_USER_PROMPT_EVENT` as supporting evidence only
- reject ambiguous labels
- map `option`, `multi`, `custom`, `chat`, and cancellation to Helmsman result
  statuses
- record that preview-mode or multi-select may suppress inline custom text
- fail closed when it cannot prove displayed bundle hash

It must not:

- let the model author route-changing questions
- accept label-only answers when labels are ambiguous
- treat rpiv's human-readable envelope as the answer source of truth
- rely on prompt text parsing for recommendation or route effects
- deep import non-exported rpiv internals in product code without a vendoring
  decision

## Patch Or Vendor Criteria

Patch upstream if the package maintainers are willing to expose:

- a public `QuestionnaireSession` or renderer component factory
- stable metadata passthrough for question and option ids
- rendered surface evidence hooks
- headless driver
- bundle hash or caller metadata passthrough
- explicit recommendation metadata
- answer result with caller-defined ids

Vendor a narrow adapter only if:

- upstream cannot expose these in time
- the vendored code is limited to renderer/session pieces needed by Helmsman
- MIT license notice is preserved
- vendored code is wrapped by Helmsman tests
- modifications are documented and kept small
- future upstream replacement remains possible

Do not vendor the whole package casually. The purpose is to preserve route
authority, not to fork a UI ecosystem.

## Product Modes

### Normal Chat

Pi/rpiv model-tool questions may be allowed for normal chat only when their
answers are treated as conversation context, not Manifest authority.

If a normal-chat question changes route scope, Core must convert it into a
Charting question or amendment before it can affect the Manifest.

### Charting

Charting questions must be Core-authored. `ask_user_question` model-tool calls
are not accepted as Charting authority.

### Autopilot

Autopilot may request a question only by returning to Core:

```text
drift or missing authority
-> Core records blocker
-> Core enters Charting/amendment question surface
```

The role runner cannot directly ask and then mutate the route.

## Verification Contract

Gate 4 must add:

- question bundle schema tests
- route-effect validation tests
- bundle hash tests
- label-to-id mapping tests
- duplicate-label rejection tests
- recommendation rendering tests
- full-surface evidence tests
- cancellation/chat request tests
- free-form preservation tests
- headless CLI question adapter tests
- Pi TUI render tests at narrow/normal/wide widths
- rpiv wrapper contract tests if the wrapper exists

No test that bypasses the rendered surface can prove the user-facing question
contract.

## Current Conclusion

Use `@juicesharp/rpiv-ask-user-question` as a UX reference and optional adapter
candidate, not as the default route-authority implementation.

The default product implementation is a Core-owned Pi TUI Question UI Adapter.
The package becomes acceptable for route authority only through a Helmsman
wrapper with evidence, stable ids, route effects, headless behavior, and
fail-closed validation, or through an upstream patch/vendor decision that
exposes those same contracts.
