import { describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const OBSOLETE = `${"gg"}-workflow`;
const OBSOLETE_DOT = `.${OBSOLETE}`;

async function gitLsFiles(): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-files"], { cwd: ROOT });
  return stdout.split("\n").filter(Boolean);
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

describe("canonical namespace and memory docs", () => {
  test("tracked paths and content contain no obsolete namespace family", async () => {
    const files = await gitLsFiles();
    expect(files.filter((file) => file.includes(OBSOLETE))).toEqual([]);

    const hits: string[] = [];
    for (const file of files) {
      if (!(await pathExists(file))) continue;
      const body = await readFile(file, "utf8");
      if (body.includes(OBSOLETE) || body.includes(OBSOLETE_DOT)) {
        hits.push(file);
      }
    }
    expect(hits).toEqual([]);
  });

  test("repo-root memory file is no longer tracked as canonical output", async () => {
    const files = await gitLsFiles();
    expect(files).not.toContain("HELMSMAN.md");
  });

  test("persistent docs name the canonical promoted memory path", async () => {
    const skill = await readFile("SKILL.md", "utf8");

    expect(skill).toContain(".helmsman/HELMSMAN.md");
    expect(skill).not.toMatch(/repo-root `?HELMSMAN\.md`?.*canonical/i);
  });

  test("removed CLI state-machine roots are absent from the current product tree", async () => {
    for (const rel of [
      "agents",
      "bin/helmsman",
      "lib/commands",
      "lib/core",
      "phases",
      "references",
      "scripts/generate-docs.sh",
      "tests/commands",
      "tests/core",
      "tests/integration",
    ]) {
      expect(await pathExists(join(ROOT, rel))).toBe(false);
    }

    const packageJson = JSON.parse(await readFile("package.json", "utf8"));
    expect(packageJson.bin).toEqual({ helmsman: "bin/helmsman.mjs" });
  });
});
