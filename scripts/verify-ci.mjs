#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const COMMANDS = [
  ["bun", ["run", "check:helmsman"]],
  ["bun", ["run", "audit:removed-surfaces"]],
  ["bun", ["run", "verify:version"]],
  ["bun", ["run", "verify:plugin"]],
  ["bun", ["run", "verify:installed-plugin"]],
  ["bun", ["test"]],
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

console.log("\nci verify pass");
