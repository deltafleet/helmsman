import type { BoardProjection, HelmsmanManifest, QuestionBundleContract, RouteEffect } from "../core/authority/types.ts";

export function buildApertureQuestionBundle(input: { manifest: HelmsmanManifest; board: BoardProjection }): QuestionBundleContract {
  const bundleId = `aperture-${input.manifest.run.id}-r${input.board.revision}`;
  const effect = (suffix: string, value: { kind: string; [key: string]: unknown }): RouteEffect => ({ id: `${bundleId}:${suffix}`, ...value } as RouteEffect);

  return {
    bundleId,
    purpose: "aperture",
    title: "Aperture: route authority",
    routeQuestion: `Before Helmsman can lock a route for "${input.manifest.route.goal}", what should the route optimize for?`,
    maxQuestions: 4,
    lockImpact: "blocks_lock",
    createdByRoleId: "core.charting",
    questions: [
      {
        questionId: `${bundleId}:outcome`,
        type: "single_select",
        prompt: "What should this route optimize for first?",
        whyItMatters: "This chooses the shape of the Manifest before research or Autopilot can safely run.",
        recommendedOptionId: `${bundleId}:outcome:complete-product`,
        recommendationReason: "The active user goal asks for the ultimate product, so the default keeps the full product scope intact.",
        allowFreeForm: true,
        requiredForLock: true,
        options: [
          {
            optionId: `${bundleId}:outcome:complete-product`,
            label: "Complete product route",
            description: "Preserve the full intended product and sequence implementation through verified gates.",
            tradeoffs: ["Slower than a narrow slice", "Keeps scope honest"],
            opens: ["All later product gates remain visible"],
            closes: ["MVP or demo-only substitution"],
          },
          {
            optionId: `${bundleId}:outcome:current-gate-first`,
            label: "Current gate first",
            description: "Focus this route on closing the current gate while explicitly preserving the full roadmap.",
            tradeoffs: ["Less surface area now", "Requires follow-up gates"],
            opens: ["Tighter verification for the current gate"],
            closes: ["Claiming full completion from one gate"],
          },
          {
            optionId: `${bundleId}:outcome:design-closure`,
            label: "Design closure first",
            description: "Stop implementation until the selected contract is made stricter and contradiction-free.",
            tradeoffs: ["Delays code", "Reduces ambiguous implementation"],
            opens: ["More design audit work"],
            closes: ["Coding against unstable requirements"],
          },
        ],
        routeEffectsByOption: {
          [`${bundleId}:outcome:complete-product`]: [
            effect("scope:complete-product", { kind: "route.scope.add", text: "Deliver the complete requested Helmsman product through verified implementation gates, without MVP or demo substitution." }),
            effect("success:complete-product", { kind: "route.success_criterion.add", text: "Every claimed product surface has code, durable artifacts, and focused verification before closeout." }),
          ],
          [`${bundleId}:outcome:current-gate-first`]: [
            effect("scope:current-gate", { kind: "route.scope.add", text: "Close the current implementation gate as a deliberate step toward the full Helmsman product." }),
            effect("stop:no-full-claim", { kind: "route.stop_condition.add", text: "Do not claim full product completion from a single-gate implementation." }),
          ],
          [`${bundleId}:outcome:design-closure`]: [
            effect("scope:design-closure", { kind: "route.scope.add", text: "Resolve contract ambiguity before implementing the next product surface." }),
            effect("stop:unstable-contract", { kind: "route.stop_condition.add", text: "Pause implementation when the selected contract leaves authority, evidence, or verification ambiguous." }),
          ],
        },
      },
      {
        questionId: `${bundleId}:autonomy`,
        type: "single_select",
        prompt: "What autonomy boundary should Helmsman use while executing this route?",
        whyItMatters: "Autopilot and RoleRuntime later need a user-confirmed boundary, not a hidden assumption.",
        recommendedOptionId: `${bundleId}:autonomy:bounded-default`,
        recommendationReason: "It matches the current project guardrail: real implementation is allowed, but destructive or external actions require explicit approval.",
        allowFreeForm: true,
        requiredForLock: true,
        options: [
          {
            optionId: `${bundleId}:autonomy:bounded-default`,
            label: "Bounded implementation",
            description: "Allow edits and verification commands; require approval for destructive operations, credential exposure, or publication.",
            tradeoffs: ["Good implementation momentum", "Still blocks high-risk actions"],
            opens: ["Real code and verification"],
            closes: ["Silent destructive or external action"],
          },
          {
            optionId: `${bundleId}:autonomy:approval-before-edits`,
            label: "Ask before edits",
            description: "Require user approval before mutating product files.",
            tradeoffs: ["More control", "Slower progress"],
            opens: ["Design-only or review-first work"],
            closes: ["Unapproved source edits"],
          },
          {
            optionId: `${bundleId}:autonomy:external-adapters-ok`,
            label: "External adapters allowed",
            description: "Permit secondary coding-agent adapters when they produce bounded operation evidence.",
            tradeoffs: ["More capability", "More adapter diagnostics to verify"],
            opens: ["Codex/OpenCode/other adapter execution later"],
            closes: ["Adapter output as route authority"],
          },
        ],
        routeEffectsByOption: {
          [`${bundleId}:autonomy:bounded-default`]: [
            effect("boundary:bounded-default", {
              kind: "route.autonomy_boundary.set",
              boundary: {
                canEditFiles: true,
                canRunCommands: true,
                canUseNetwork: true,
                canInstallDependencies: true,
                canUseExternalAdapters: true,
                mustAskBefore: ["destructive filesystem operations", "external publication", "credential disclosure"],
              },
            }),
          ],
          [`${bundleId}:autonomy:approval-before-edits`]: [
            effect("boundary:approval-before-edits", {
              kind: "route.autonomy_boundary.set",
              boundary: {
                canEditFiles: false,
                canRunCommands: true,
                canUseNetwork: true,
                canInstallDependencies: false,
                canUseExternalAdapters: false,
                mustAskBefore: ["file edits", "dependency installation", "external adapter execution", "external publication"],
              },
            }),
          ],
          [`${bundleId}:autonomy:external-adapters-ok`]: [
            effect("boundary:external-adapters", {
              kind: "route.autonomy_boundary.set",
              boundary: {
                canUseExternalAdapters: true,
                mustAskBefore: ["destructive filesystem operations", "external publication", "credential disclosure"],
              },
            }),
            effect("risk:adapter-authority", { kind: "route.risk.add", text: "External adapter output must remain evidence and cannot mutate Manifest or Board authority directly.", severity: "medium", mitigation: "Require Core command validation and operation evidence for adapter results." }),
          ],
        },
      },
      {
        questionId: `${bundleId}:evidence`,
        type: "multi_select",
        prompt: "Which evidence must exist before this route can be locked?",
        whyItMatters: "Route Lock later refuses unresolved critical evidence and open route-changing questions.",
        recommendedOptionId: `${bundleId}:evidence:focused-verification`,
        recommendationReason: "Focused verification is the minimum proof for any claimed product surface.",
        allowFreeForm: true,
        requiredForLock: true,
        options: [
          {
            optionId: `${bundleId}:evidence:focused-verification`,
            label: "Focused verification",
            description: "Each claimed gate has a verifier that covers the actual requirement.",
            tradeoffs: ["Adds test work", "Prevents unproved claims"],
            opens: ["Requirement-mapped verification"],
            closes: ["Green checks that do not cover the product claim"],
          },
          {
            optionId: `${bundleId}:evidence:rendered-surface`,
            label: "Rendered user surface",
            description: "User-facing surfaces produce evidence showing the full rendered state and options.",
            tradeoffs: ["More evidence files", "Catches UI-only omissions"],
            opens: ["Question UI and workbench proof"],
            closes: ["Hidden or partial user choices"],
          },
          {
            optionId: `${bundleId}:evidence:checkpoint-sync`,
            label: "Checkpoint sync",
            description: "Goalkeeper and current docs state exactly what is complete and incomplete.",
            tradeoffs: ["More documentation updates", "Maintains long-running continuity"],
            opens: ["Reliable continuation"],
            closes: ["Stale completion claims"],
          },
          {
            optionId: `${bundleId}:evidence:live-smoke`,
            label: "Live smoke where relevant",
            description: "Runtime/provider/TUI paths get a live or headless smoke when the gate depends on that surface.",
            tradeoffs: ["Can be slower", "Proves real integration"],
            opens: ["Installed/runtime confidence"],
            closes: ["Purely synthetic proof"],
          },
        ],
        routeEffectsByOption: {
          [`${bundleId}:evidence:focused-verification`]: [
            effect("verify:focused-gate", { kind: "route.verification_scenario.add", scenario: { scenarioId: `${bundleId}:scenario:focused-verification`, title: "Focused verifier covers every claimed gate requirement.", expectedEvidence: ["focused-verifier-output"] } }),
          ],
          [`${bundleId}:evidence:rendered-surface`]: [
            effect("verify:rendered-surface", { kind: "route.verification_scenario.add", scenario: { scenarioId: `${bundleId}:scenario:rendered-surface`, title: "Rendered user surface evidence shows the full option set and selected answers.", expectedEvidence: ["native-question-surface"] } }),
          ],
          [`${bundleId}:evidence:checkpoint-sync`]: [
            effect("success:checkpoint-sync", { kind: "route.success_criterion.add", text: "Goalkeeper and current execution docs distinguish completed gates from remaining gates after implementation." }),
          ],
          [`${bundleId}:evidence:live-smoke`]: [
            effect("verify:live-smoke", { kind: "route.verification_scenario.add", scenario: { scenarioId: `${bundleId}:scenario:live-smoke`, title: "Live or headless smoke proves the relevant runtime surface when the gate depends on it.", expectedEvidence: ["runtime-smoke-output"] } }),
          ],
        },
      },
      {
        questionId: `${bundleId}:stop`,
        type: "multi_select",
        prompt: "What should force Helmsman to stop, ask, or park before continuing?",
        whyItMatters: "A route-governed system must expose drift and uncertainty instead of continuing silently.",
        recommendedOptionId: `${bundleId}:stop:authority-mismatch`,
        recommendationReason: "Authority mismatch is the highest-risk failure for this product.",
        allowFreeForm: true,
        requiredForLock: true,
        options: [
          {
            optionId: `${bundleId}:stop:authority-mismatch`,
            label: "Authority mismatch",
            description: "Manifest, Board, rendered surface, or adapter evidence disagree.",
            tradeoffs: ["Stops earlier", "Prevents divergent state"],
            opens: ["Repair or replay"],
            closes: ["Silent state drift"],
          },
          {
            optionId: `${bundleId}:stop:missing-evidence`,
            label: "Missing evidence",
            description: "A claimed product surface lacks rendered, artifact, or verifier evidence.",
            tradeoffs: ["Blocks premature closeout", "Requires more proof work"],
            opens: ["Evidence repair"],
            closes: ["Unproved completion"],
          },
          {
            optionId: `${bundleId}:stop:scope-drift`,
            label: "Scope drift",
            description: "A later action changes the route without amendment or user confirmation.",
            tradeoffs: ["May interrupt automation", "Keeps user authority"],
            opens: ["Amendment flow"],
            closes: ["Autopilot improvisation"],
          },
          {
            optionId: `${bundleId}:stop:secret-risk`,
            label: "Secret risk",
            description: "Any prompt, event, artifact, or diagnostic appears to contain raw credentials.",
            tradeoffs: ["Can stop otherwise useful logs", "Protects credentials"],
            opens: ["Redaction repair"],
            closes: ["Credential persistence"],
          },
        ],
        routeEffectsByOption: {
          [`${bundleId}:stop:authority-mismatch`]: [
            effect("stop:authority-mismatch", { kind: "route.stop_condition.add", text: "Stop when Manifest, Board, rendered surface, or adapter evidence disagree." }),
          ],
          [`${bundleId}:stop:missing-evidence`]: [
            effect("stop:missing-evidence", { kind: "route.stop_condition.add", text: "Park or ask when a claimed product surface lacks rendered, artifact, or verifier evidence." }),
          ],
          [`${bundleId}:stop:scope-drift`]: [
            effect("stop:scope-drift", { kind: "route.stop_condition.add", text: "Stop or require amendment when later work changes route scope without user confirmation." }),
          ],
          [`${bundleId}:stop:secret-risk`]: [
            effect("stop:secret-risk", { kind: "route.stop_condition.add", text: "Stop before persisting or displaying raw credentials in prompts, events, artifacts, or diagnostics." }),
          ],
        },
      },
    ],
  };
}
