#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const tsxImport = require.resolve("tsx");
const entry = fileURLToPath(new URL("../src/cli/main.ts", import.meta.url));
const result = spawnSync(process.execPath, ["--import", tsxImport, entry, ...process.argv.slice(2)], {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
