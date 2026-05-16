import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect } from "vitest";
import { test, writeFixture } from "../helpers/tmpdir";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

describe("helmsman CLI toolbelt", () => {
  test("scaffolds known artifacts without advancing workflow state", async ({ tmpdir }) => {
    const session = join(tmpdir, "session-toolbelt");
    await mkdir(session, { recursive: true });

    const { stdout } = await execFileAsync(
      process.execPath,
      ["scripts/scaffold-skill-artifact.mjs", session, "--artifact", "director-blueprint"],
      { cwd: ROOT },
    );

    expect(stdout).toContain("scaffolded director-blueprint");
    const body = await readFile(join(session, "director-blueprint.md"), "utf8");
    expect(body).toContain("# Director Blueprint");
    expect(body).toContain("## Dependency Graph");

    const nativeGoalDoc = await execFileAsync(
      process.execPath,
      ["scripts/scaffold-skill-artifact.mjs", session, "--artifact", "goal"],
      { cwd: ROOT },
    );
    expect(nativeGoalDoc.stdout).toContain("scaffolded goal");
    const goalDoc = await readFile(join(session, "goal.md"), "utf8");
    expect(goalDoc).toContain("/goal @.helmsman/goals/<goal-id>/goal.md");
    expect(goalDoc).toContain("This document and its sibling files are the execution contract");

    const goal = await execFileAsync(
      process.execPath,
      ["scripts/scaffold-skill-artifact.mjs", session, "--artifact", "goal-charter"],
      { cwd: ROOT },
    );
    expect(goal.stdout).toContain("scaffolded goal-charter");
    const charter = await readFile(join(session, "goal-charter.md"), "utf8");
    expect(charter).toContain("# Goal Charter");
    expect(charter).toContain("Native Goal Source");
    expect(charter).toContain("Autonomy Boundary");

    await expect(
      execFileAsync(
        process.execPath,
        ["scripts/scaffold-skill-artifact.mjs", session, "--artifact", "director-blueprint"],
        { cwd: ROOT },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("already exists"),
    });
  });

  test("fetches explicit wiki files and rejects path escape", async ({ tmpdir }) => {
    const wiki = join(tmpdir, "wiki");
    await writeFixture(tmpdir, "wiki/index.md", "# Wiki Index\n\n- concepts/toolbelt.md\n");
    await writeFixture(tmpdir, "wiki/concepts/toolbelt.md", "# Toolbelt\n\nHelpers do not rank relevance.\n");

    const index = await execFileAsync(
      process.execPath,
      ["scripts/fetch-skill-memory.mjs", wiki, "--index"],
      { cwd: ROOT },
    );
    expect(index.stdout).toContain("# Wiki Index");

    const doc = await execFileAsync(
      process.execPath,
      ["scripts/fetch-skill-memory.mjs", wiki, "--doc", "concepts/toolbelt.md"],
      { cwd: ROOT },
    );
    expect(doc.stdout).toContain("Helpers do not rank relevance.");

    await expect(
      execFileAsync(
        process.execPath,
        ["scripts/fetch-skill-memory.mjs", wiki, "--doc", "../secret.md"],
        { cwd: ROOT },
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("doc path must stay inside wiki root"),
    });
  });
});
