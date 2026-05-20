#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const COMMANDS = [
  ["bun", ["run", "check:helmsman"]],
  ["bun", ["run", "audit:removed-surfaces"]],
  ["bun", ["run", "verify:plugin"]],
  [
    "bun",
    [
      "test",
      "tests/docs/helmsman-skill-install.spec.ts",
      "tests/docs/helmsman-memory-compiler.spec.ts",
      "tests/docs/helmsman-toolbelt.spec.ts",
      "tests/docs/native-goal-e2e.spec.ts",
      "tests/docs/plugin-packaging.spec.ts",
      "tests/docs/removed-surfaces-audit.spec.ts",
      "tests/docs/helmsman-session-validator.spec.ts",
      "tests/docs/helmsman-skills.spec.ts",
      "tests/domain/skill-memory-candidates.spec.ts",
      "tests/docs/data-contract.spec.ts",
      "tests/docs/skill-docs.spec.ts",
      "tests/docs/namespace-canonical.spec.ts",
    ],
  ],
  ["bun", ["run", "typecheck"]],
  ["git", ["diff", "--check"]],
];

function run(command, args) {
  console.log(`\n$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

for (const [command, args] of COMMANDS) {
  run(command, args);
}

console.log("\nHelmsman verify pass");
