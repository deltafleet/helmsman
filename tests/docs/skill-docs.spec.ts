import { describe, it } from "vitest";
import { readFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pexec = promisify(exec);

interface Block {
  scope: "continue" | "fresh" | "skip";
  bash: string;
  expectedSubstring?: string;
  expectedRegex?: string;
  expectFail: boolean;
}

/**
 * Parse ```bash fenced blocks from a markdown string.
 *
 * Fence meta grammar (after the opening ```bash):
 *   bash                          → session=continue (default)
 *   bash session=fresh            → new tmpdir for this block
 *   bash session=continue         → reuse current tmpdir
 *   bash session=skip             → parser records it, runner skips execution
 *   bash session=fresh expected=fail
 *   bash expected=fail
 *   bash session=continue expected=fail
 *
 * Optional trailing ```text expected / ```text expected-regex block matches against stdout+stderr.
 */
function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  // Match ```bash, optional space + meta tokens (session=X, expected=fail) in any order.
  const bashRe = /^```bash([^\n]*)\n([\s\S]*?)^```/gm;
  let match: RegExpExecArray | null;
  while ((match = bashRe.exec(md)) !== null) {
    const meta = match[1]?.trim() ?? "";
    const bash = match[2] ?? "";
    const tokens = meta.split(/\s+/).filter(Boolean);
    let scope: Block["scope"] = "continue";
    let expectFail = false;
    for (const tok of tokens) {
      if (tok === "session=fresh") scope = "fresh";
      else if (tok === "session=continue") scope = "continue";
      else if (tok === "session=skip") scope = "skip";
      else if (tok === "expected=fail") expectFail = true;
    }

    // Look for an immediately-following ```text expected[-regex] block.
    // "Immediately" = within a small whitespace window after the closing fence.
    const afterIdx = bashRe.lastIndex;
    const remaining = md.slice(afterIdx);
    const expRe = /^\s*```text\s+(expected|expected-regex)\n([\s\S]*?)^```/;
    const expMatch = expRe.exec(remaining);
    let expectedSubstring: string | undefined;
    let expectedRegex: string | undefined;
    if (expMatch) {
      const whatPrecedes = remaining.slice(0, expMatch.index);
      // Only consider it "immediately" adjacent if whitespace-only between.
      if (/^\s*$/.test(whatPrecedes)) {
        const kind = expMatch[1] ?? "expected";
        const body = (expMatch[2] ?? "").trim();
        if (kind === "expected") expectedSubstring = body;
        else expectedRegex = body;
      }
    }

    blocks.push({ scope, bash, expectedSubstring, expectedRegex, expectFail });
  }
  return blocks;
}

async function runBlocks(md: string, name: string): Promise<void> {
  const all = parseBlocks(md);
  const runnable = all.filter((b) => b.scope !== "skip");
  if (runnable.length === 0) return;

  const helmsmanRoot = process.env.HELMSMAN_ROOT ?? process.cwd();
  const env = {
    ...process.env,
    HELMSMAN_ROOT: helmsmanRoot,
    PATH: process.env.PATH ?? "",
  };

  let currentDir = mkdtempSync(join(tmpdir(), `hm-docs-${name}-`));
  for (const block of runnable) {
    if (block.scope === "fresh") {
      currentDir = mkdtempSync(join(tmpdir(), `hm-docs-${name}-`));
    }
    let stdout = "";
    let stderr = "";
    let threw: unknown = null;
    try {
      const res = await pexec(block.bash, {
        cwd: currentDir,
        env,
        // 30s per-block cap; combined vitest timeout is 60s.
        timeout: 30_000,
      });
      stdout = res.stdout;
      stderr = res.stderr;
    } catch (err) {
      threw = err;
      // node util.promisify(exec) rejects with an Error that carries stdout/stderr
      const e = err as { stdout?: string; stderr?: string };
      stdout = e.stdout ?? "";
      stderr = e.stderr ?? "";
    }

    if (block.expectFail) {
      if (!threw) {
        throw new Error(
          `Expected fail but succeeded.\nbash: ${block.bash.slice(0, 200)}\nstdout: ${stdout}`,
        );
      }
      // Even if it failed, still honor expected substring/regex (against combined output).
    } else {
      if (threw) {
        throw new Error(
          `Unexpected failure.\nbash: ${block.bash.slice(0, 400)}\nstdout: ${stdout}\nstderr: ${stderr}\nerr: ${(threw as Error).message}`,
        );
      }
    }

    const out = stdout + stderr;
    if (block.expectedSubstring && !out.includes(block.expectedSubstring)) {
      throw new Error(
        `expected substring not found.\nbash: ${block.bash.slice(0, 200)}\nwant: ${block.expectedSubstring}\ngot:\n${out}`,
      );
    }
    if (block.expectedRegex && !new RegExp(block.expectedRegex).test(out)) {
      throw new Error(
        `expected regex not matched.\nbash: ${block.bash.slice(0, 200)}\nregex: ${block.expectedRegex}\ngot:\n${out}`,
      );
    }
  }
}

const HELMSMAN_ROOT = process.env.HELMSMAN_ROOT ?? process.cwd();

describe("SKILL.md bash blocks (C-5 C-6)", () => {
  it("all bash blocks execute successfully with expected outputs", async () => {
    const md = await readFile(`${HELMSMAN_ROOT}/SKILL.md`, "utf-8");
    await runBlocks(md, "SKILL");
  }, 60_000);
});
