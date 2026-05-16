# AGENTS.md

## Development Contract

Helmsman is a route-governed workflow protocol. Current source of truth lives in:

- `SKILL.md`
- `skills/`
- `docs/distribution.md`
- `docs/release-guards.md`
- `scripts/`
- `tests/`

Keep workflow authority in skills and artifacts. Helper scripts may scaffold, validate, render status, build plugin payloads, install plugin payloads, and verify release contracts. They must not become a workflow state machine.

## Public Surface Rules

- Keep public docs focused on the product, protocol, installation, contribution, and release process.
- Do not commit private session state, dated closeout reports, comparison scratchpads, or local evaluation transcripts.
- Do not reintroduce removed runtime UI/controller surfaces as current product paths.
- Keep `package.json` as the version source of truth.
- Keep generated Codex and Claude plugin manifests version-aligned with `package.json`.

## Verification

Before claiming a change is ready, run:

```bash
bun run check:helmsman
bun run verify:version
bun run verify:plugin
bun test
bun run typecheck
git diff --check
```

For release work, also run:

```bash
npm pack --dry-run
```
