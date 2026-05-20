# Release Guards

Status: public maintainer checklist

This document is the compact release checklist for Helmsman. It is intentionally about public package quality, not private evaluation history or comparison scratch work.

## Public Release Checklist

Run the full gate from a clean checkout before publishing:

```bash
bun install
bun run check:helmsman
bun run verify:version
bun run verify:plugin
bun run verify:helmsman
npm pack --dry-run
```

Then publish and tag:

```bash
export NPM_TOKEN="npm_..."
tmpnpmrc="$(mktemp)"
printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_TOKEN" > "$tmpnpmrc"
NPM_CONFIG_USERCONFIG="$tmpnpmrc" npm whoami
NPM_CONFIG_USERCONFIG="$tmpnpmrc" npm publish --access public
rm -f "$tmpnpmrc"
git tag v0.3.0
git push origin main --tags
```

Do not publish from a dirty worktree. Do not publish a package whose generated plugin payload has not been rebuilt from the current `skills/` tree. Never commit npm tokens or persistent `.npmrc` files.

## Version Contract

`package.json` is the version source of truth. The following files must carry the same version:

- `plugins/helmsman/.codex-plugin/plugin.json`
- `plugins/helmsman/.claude-plugin/plugin.json`
- `plugins/helmsman/.codex-plugin/payload-manifest.json`
- `.claude-plugin/marketplace.json`

Run:

```bash
bun run verify:version
```

## Plugin Contract

The generated payload under `plugins/helmsman/` must contain skills and sidecars only. It must not expose a workflow state-machine, runtime UI, custom agent registry, MCP server, or hook surface.

Run:

```bash
bun run build:plugin
bun run verify:plugin
```

For a local install smoke test, use a temporary home when possible:

```bash
tmpdir="$(mktemp -d)"
HOME="$tmpdir" bun bin/helmsman.mjs install
HOME="$tmpdir" bun bin/helmsman.mjs doctor
HOME="$tmpdir" bun run verify:installed-plugin
```

## Public Surface Contract

Public docs should explain the product, installation, contribution, protocol shape, and artifact contracts. They should not expose private planning trails, dated closeout reports, local benchmark scratchpads, or personal session transcripts.

Keep these public:

- `README.md`
- `README.ko.md`
- `SKILL.md`
- `docs/distribution.md`
- `docs/open-source-operations.md`
- `docs/helmsman-protocol.md`
- `docs/map-schema.md`
- `docs/release-guards.md`

Keep private or untracked:

- dated closeout and audit reports
- comparison scratch artifacts
- local smoke transcripts
- local agent session state
- personal workspace notes
