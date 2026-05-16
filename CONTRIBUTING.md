# Contributing

Helmsman is maintained as a public source project by Deltafleet. The current project shape is protocol-driven: skills, artifacts, verification scripts, and generated plugin payloads are the supported surface. Removed legacy interface and CLI state-machine surfaces should not be reintroduced.

## Workflow

1. Open an issue for substantial product, protocol, or packaging changes before implementation.
2. Use a feature branch from `main`.
3. Keep pull requests narrow enough to review as one unit.
4. Include verification output in the PR description.
5. Do not claim finished-product readiness, benchmark superiority, or marketplace availability without the repository gates and explicit maintainer acceptance.

## Required Checks

Run the cloud-safe gate before requesting review:

```bash
bun install
bun run install:plugin -- --target-home --force
bun run verify:ci
```

Maintainers should also run the stronger local gate before tagging a release:

```bash
bun install
bun run verify:helmsman
```

`verify:helmsman` checks local `codex` and `omx` CLI availability for the deferred comparative benchmark. It is stronger than CI and intentionally depends on maintainer machine setup.

For plugin-only changes, also make sure these pass:

```bash
bun run verify:plugin
bun run verify:installed-plugin
```

`verify:installed-plugin` depends on a local install and may not be available in all contributor environments. If it cannot run, explain that in the PR and include `verify:plugin` output.

## Branch Policy

- `main` is the release branch.
- Feature branches should be named `feature/<short-topic>` or `fix/<short-topic>`.
- Maintainers merge by squash or regular merge depending on review clarity.
- Force-push only to your own branch.

## Release Policy

- Patch releases: documentation, packaging, validation, or bug fixes that do not change the skill contract.
- Minor releases: new skills, new artifact contracts, or meaningful workflow behavior.
- Major releases: breaking changes to the public plugin or skill contract.

The generated plugin payload under `plugins/helmsman/` must match source skills before a release is tagged.

## Public Distribution

The current distribution path is GitHub source plus local Codex plugin installation:

```bash
git clone https://github.com/deltafleet/helmsman.git
cd helmsman
bun install
bun run verify:plugin
bun run install:plugin -- --target-home --force
bun run verify:installed-plugin
```

An official hosted Codex marketplace flow, if available later, should be treated as a separate release channel with its own verification checklist.
