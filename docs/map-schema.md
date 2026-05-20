# Map Schema

`map.json` is a read-only status projection for a Helmsman session under `.helmsman/sessions/<session-id>/`. It is not workflow authority. The authoritative artifacts remain `contract.md`, `route-card.md`, `research-index.md`, `research/*.md`, `evidence/*.md` when present, `plan.md`, `verification.md`, and `retro.md`.

Required fields:

- `schemaVersion`: must be `1`.
- `stage`: one of `charting`, `research`, `autopilot`, `verify`, `retro`; `research` and `retro` are artifact checkpoints owned by Charting and Verify.
- `status`: one of `blocked`, `ready`, `complete`, `closed`.
- `checkpoints`: ordered stage list.
- `currentCheckpoint`: must match `stage`.
- `autopilotStage`: required only when `stage` is `autopilot`; one of `strategy`, `blueprint`, `hardening`, `audit`, `execute`, `repair`.
- `requiredArtifacts`: artifacts expected for the current route.
- `presentArtifacts`: artifacts present in the session directory.
- `missingArtifacts`: required artifacts not yet present.
- `openQuestions`: unresolved charting or verification questions.
- `blockedReason`: string when blocked, otherwise `null`.
- `nextSkill`: recommended next callable skill, or `none` when closed.

Rules:

- The map must not contain decisions that are absent from the route card.
- The map must not mark completion when verification scenarios are missing.
- Renderers may read the map, but they must not mutate the session.
- Validators may reject impossible projections, such as `stage` and `currentCheckpoint` disagreement.
- `autopilotStage` must match the `Autopilot stage:` field in `contract.md` when the current stage is `autopilot`.
