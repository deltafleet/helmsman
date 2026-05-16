# Open Source Operations

Helmsman is public source, but it is still maintainer-led. A pull request is a proposal, not an entitlement to merge.

## Contribution Flow

1. Contributors open an issue or discussion for substantial product, protocol, or packaging changes.
2. Contributors work on a branch or fork.
3. They open a pull request against `main`.
4. CI runs `bun run verify:ci`.
5. Maintainers review the PR, request changes, merge it, or close it.

The maintainer decision is final because Helmsman is a protocol product. Changes that add surface area, loosen verification, or reintroduce removed legacy interface concepts should be rejected even if the code works.

## Branch Policy

- `main` is the release branch.
- Feature work happens on `feature/<short-topic>` or contributor forks.
- Bug fixes use `fix/<short-topic>`.
- Direct pushes to `main` should be reserved for maintainers and avoided once branch protection is enabled.
- Force-push only to your own branch.

## Release Policy

Helmsman uses semantic versioning.

- Patch: documentation, packaging, validation, or bug fixes that do not change the public skill contract.
- Minor: new skills, new artifact contracts, or meaningful workflow behavior.
- Major: breaking changes to the public plugin or skill contract.

Release checklist:

```bash
bun install
bun run build:plugin
bun run verify:version
npm pack --dry-run
bun bin/helmsman.mjs install
bun bin/helmsman.mjs doctor
bun run verify:ci
bun run verify:helmsman
```

## NPM Authentication

Use an npm access token, not a committed `.npmrc`.

Create an npm automation token or granular token with publish access to the `@deltafleet` scope. The npm organization or user account must already have permission to publish `@deltafleet/helmsman`.

For local maintainer publish, keep the token in a temporary npm config:

```bash
export NPM_TOKEN="npm_..."
tmpnpmrc="$(mktemp)"
printf '//registry.npmjs.org/:_authToken=%s\n' "$NPM_TOKEN" > "$tmpnpmrc"
NPM_CONFIG_USERCONFIG="$tmpnpmrc" npm whoami
NPM_CONFIG_USERCONFIG="$tmpnpmrc" npm publish --access public
rm -f "$tmpnpmrc"
```

Never write npm tokens to repository files, shell history snippets, issue comments, or release notes.

Then tag the release and publish a GitHub Release:

```bash
git tag v<version>
git push origin main --tags
```

`package.json` is the version source of truth. The Codex plugin manifest, Claude plugin manifest, payload manifest, and Claude marketplace descriptor must carry the same version. `bun run verify:version` is the release gate for that contract.

## PR Review Standard

Review should focus on:

- Does the change preserve explicit user authority?
- Does it keep Helmsman host-neutral instead of binding the protocol to one CLI?
- Does it avoid reintroducing removed legacy interface or CLI state-machine surfaces?
- Are artifacts still the durable source of workflow state?
- Does verification prove the original route promise, not only that scripts pass?
- Are Codex and Claude Code packaging surfaces still valid?

## Maintainer Defaults

Keep the first public phase conservative:

- accept small fixes quickly
- reject broad rewrites without a prior issue
- keep benchmark superiority claims deferred until comparative evidence exists
- keep official marketplace claims out of README until the channel is real
- prefer clear docs and tests over clever automation
