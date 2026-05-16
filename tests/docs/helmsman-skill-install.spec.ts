import { execFile } from "node:child_process";
import { lstat, readlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect } from "vitest";
import { test, writeFixture } from "../helpers/tmpdir";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

async function runInstall(target: string, extraArgs: string[] = []) {
  return execFileAsync(
    process.execPath,
    ["scripts/install-helmsman-skills.mjs", "--target", target, ...extraArgs],
    { cwd: ROOT },
  );
}

describe("helmsman install helper", () => {
  test("symlinks root and split skills into a target skill directory", async ({
    tmpdir,
  }) => {
    const target = join(tmpdir, "skills");
    const { stdout } = await runInstall(target);

    expect(stdout).toContain("helmsman install pass");
    for (const name of [
      "helmsman",
      "helmsman-charting",
      "helmsman-autopilot",
      "helmsman-verify",
    ]) {
      const link = join(target, name);
      expect((await lstat(link)).isSymbolicLink()).toBe(true);
      expect(resolve(target, await readlink(link))).toContain(
        name === "helmsman" ? ROOT : join(ROOT, "skills", name),
      );
    }
  });

  test("refuses to overwrite existing skills without force", async ({ tmpdir }) => {
    const target = join(tmpdir, "skills");
    await writeFixture(tmpdir, "skills/helmsman/SKILL.md", "---\nname: old\n---\n");

    await expect(runInstall(target)).rejects.toMatchObject({
      stderr: expect.stringContaining("already exists"),
    });
  });
});
