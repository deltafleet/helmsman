# Distribution

Helmsman's core product is host-neutral: a skill tree plus durable workflow artifacts. Codex and Claude Code are host adapters for the same protocol, not separate products.

The normal user install path is npm. Source installation is for maintainers and contributors.

## Repository Shape

Canonical source lives in:

```text
SKILL.md
skills/
docs/release-guards.md
scripts/
```

The generated host payload lives in:

```text
plugins/helmsman/
  .codex-plugin/plugin.json
  .claude-plugin/plugin.json
  .codex-plugin/payload-manifest.json
  skills/
```

The same `skills/` tree is exposed to both hosts. Host-specific manifests only advertise the payload to the host.

## Normal Install

Install or update the local Codex plugin with npm:

```bash
npx @deltafleet/helmsman install
npx @deltafleet/helmsman doctor
```

Global install is optional:

```bash
npm i -g @deltafleet/helmsman
helmsman install
helmsman doctor
helmsman update
```

`helmsman install` writes the generated payload to `$HOME/plugins/helmsman`, updates `$HOME/.agents/plugins/marketplace.json`, and asks Codex to install/cache `helmsman@local` so the skills appear in new Codex CLI sessions. It is idempotent for a Helmsman-owned install. Re-running it updates the payload, marketplace entry, and Codex cache without requiring `--force`.

`helmsman doctor` is read-only. It verifies the installed payload, local marketplace wiring, Codex cache/config state, and the npm `latest` version. If npm has a newer payload than the installed local plugin, it reports the version gap and tells the user to run `helmsman update`.

Helmsman skills instruct the lead agent to run `helmsman doctor` once on first skill entry in a conversation. That check is advisory and read-only: the agent may tell the user a newer version exists, but it must not run `helmsman update` unless the user explicitly approves the update.

`helmsman update` delegates to `npx --yes @deltafleet/helmsman@latest install`. This matters when the globally installed CLI is older than the npm package: the update copies the newest published payload instead of the old CLI's bundled payload. It updates the local plugin payload and Codex cache; it does not update the global `helmsman` binary itself. Use `npm i -g @deltafleet/helmsman@latest` when the global CLI package should also be refreshed.

The `npx` path does not install a permanent `helmsman` command. Use `npx @deltafleet/helmsman <command>` unless you installed the package globally.

`--force` is only for override cases:

- the target directory exists but is not a Helmsman plugin
- the local marketplace already has a `helmsman` entry pointing somewhere else
- the install was manually corrupted and the maintainer intentionally wants to replace it

Do not put `--force` in normal user install instructions.

## Codex

Codex currently uses local marketplace wiring:

```text
$HOME/.agents/plugins/marketplace.json
  -> $HOME/plugins/helmsman
$HOME/.codex/plugins/cache/local/helmsman/<version>
$HOME/.codex/config.toml
  [plugins."helmsman@local"]
  enabled = true
```

The repository descriptor lives at `.agents/plugins/marketplace.json`; it points at `./plugins/helmsman` for source checkout testing.

Invoke the root skill when the stage is unclear:

```text
$helmsman
```

Use the split skills when the next stage is obvious:

```text
$helmsman-charting
$helmsman-autopilot
$helmsman-verify
```

Research runs inside Charting through the Research Lane Contract. Closeout notes are written after Verify passes or the workflow is intentionally parked.

## Claude Code

Claude Code can load the same generated payload because plugin skills live under `skills/<name>/SKILL.md` and the payload includes `.claude-plugin/plugin.json`.

Development smoke path:

```bash
bun run build:plugin
claude --plugin-dir ./plugins/helmsman
```

Inside Claude Code, plugin skills are namespaced by plugin name:

```text
/helmsman:helmsman
/helmsman:helmsman-charting
/helmsman:helmsman-autopilot
/helmsman:helmsman-verify
```

Marketplace-style installation after the public GitHub repository is available:

```text
/plugin marketplace add deltafleet/helmsman
/plugin install helmsman@deltafleet
```

For local marketplace testing before publication:

```text
/plugin marketplace add .
/plugin install helmsman@deltafleet
```

The Claude marketplace descriptor is `.claude-plugin/marketplace.json`; it lists `helmsman` with source `./plugins/helmsman`.

When Claude Code is pointed at the local Helmsman payload, `helmsman update` refreshes that shared payload because the Claude manifest lives under the same `$HOME/plugins/helmsman` directory. If Helmsman later ships through an official hosted Claude marketplace, that channel should get its own update instructions; npm publish alone should not be treated as proof that a hosted marketplace install has updated.

## Maintainer Source Install

Use this when developing Helmsman itself:

```bash
git clone https://github.com/deltafleet/helmsman.git
cd helmsman
bun install
bun run build:plugin
bun run verify:plugin
bun run install:plugin -- --target-home
bun run verify:installed-plugin
```

`bun run install:plugin -- --target-home` is the low-level source equivalent of `helmsman install`. It should not need `--force` during ordinary development unless replacing a conflicting or corrupted install.

## NPM Package

The npm package is `@deltafleet/helmsman`.

It exposes one binary:

```text
helmsman
```

The binary is a distribution and diagnostics tool only:

```bash
helmsman install
helmsman doctor
helmsman update
helmsman version
```

It does not drive Charting, Autopilot, Verify, Charting-owned research lanes, or Verify-owned closeout. Workflow state remains in Helmsman artifacts, and workflow judgment remains with the lead agent using the installed skills.

## Versioning

`package.json` is the version source of truth.

The same version must appear in:

- `package.json`
- `plugins/helmsman/.codex-plugin/plugin.json`
- `plugins/helmsman/.claude-plugin/plugin.json`
- `plugins/helmsman/.codex-plugin/payload-manifest.json`
- `.claude-plugin/marketplace.json`

Run the version gate before release:

```bash
bun run verify:version
```

The npm `prepack` hook runs:

```bash
bun run build:plugin
bun run verify:plugin
bun run verify:version
```

This prevents publishing a package whose generated payload or marketplace metadata has version drift.

## Official Marketplaces

Helmsman does not currently claim an official hosted Codex marketplace channel or an official Claude marketplace listing. Public distribution starts as npm plus GitHub source plus host-local plugin installation. Official marketplace submission, if pursued later, should be treated as a separate release channel with its own checklist.

## Verification

Use the cloud-safe gate for PRs and CI:

```bash
bun run verify:ci
```

Use the stronger local maintainer gate before release tags:

```bash
bun run verify:helmsman
```

`verify:plugin` checks both host manifests, both repository marketplace descriptors, payload boundaries, the managed payload manifest, required sidecar references, and version consistency. `verify:installed-plugin` proves the installed Codex payload has not drifted from the generated payload.
