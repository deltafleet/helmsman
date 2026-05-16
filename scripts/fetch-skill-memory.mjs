#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { join, normalize, relative } from "node:path";

function usage() {
  return [
    "Usage: bun scripts/fetch-skill-memory.mjs <wiki-root> --index | --doc <relative-path>",
    "The helper prints explicitly selected wiki files. It does not rank relevance or decide what the agent should read.",
  ].join("\n");
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  const root = args.shift();
  if (!root || root === "--help" || root === "-h") {
    console.log(usage());
    process.exit(root ? 0 : 1);
  }
  let index = false;
  let doc = null;
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--index") {
      index = true;
      continue;
    }
    if (flag === "--doc") {
      doc = args.shift() ?? fail("--doc requires a value");
      continue;
    }
    fail(`unknown argument: ${flag}`);
  }
  if (index === Boolean(doc)) fail("choose exactly one of --index or --doc <relative-path>");
  return { root, index, doc };
}

function safeJoin(root, rel) {
  if (rel.startsWith("/") || rel.includes("\0")) fail("doc path must be relative");
  const normalized = normalize(rel);
  if (normalized.startsWith("..")) fail("doc path must stay inside wiki root");
  const abs = join(root, normalized);
  const back = relative(root, abs);
  if (back.startsWith("..") || back === "") fail("doc path must stay inside wiki root");
  return abs;
}

async function listMarkdown(root, dir = "") {
  const abs = join(root, dir);
  const entries = await readdir(abs, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listMarkdown(root, rel)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(rel);
    }
  }
  return files.sort();
}

async function main() {
  const { root, index, doc } = parseArgs(process.argv.slice(2));
  const info = await stat(root).catch((error) => {
    if (error && error.code === "ENOENT") fail(`wiki root does not exist: ${root}`);
    throw error;
  });
  if (!info.isDirectory()) fail(`wiki root is not a directory: ${root}`);
  if (index) {
    const indexPath = join(root, "index.md");
    const body = await readFile(indexPath, "utf8").catch(async (error) => {
      if (error && error.code === "ENOENT") {
        const files = await listMarkdown(root);
        return [`# Wiki Index`, "", ...files.map((file) => `- ${file}`), ""].join("\n");
      }
      throw error;
    });
    process.stdout.write(body);
    return;
  }
  const docPath = safeJoin(root, doc);
  const body = await readFile(docPath, "utf8");
  process.stdout.write(body);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
