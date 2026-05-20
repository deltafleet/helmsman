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
    expect(goalDoc).toContain("Signal Read -> Aperture Question Bundle");
    expect(goalDoc).toContain("Scoped Memory Scan before Research Lanes");
    expect(goalDoc).toContain("repeat question, memory, research, synthesis, and sharpness cycles");

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
    expect(charter).toContain("charting-loop.md");
    expect(charter).toContain("memory-scan.md");
    expect(charter).toContain("question-bundles.md");

    for (const artifact of ["charting-loop", "memory-scan", "question-bundles", "native-chat-transcript", "worker-packets"]) {
      const result = await execFileAsync(
        process.execPath,
        ["scripts/scaffold-skill-artifact.mjs", session, "--artifact", artifact],
        { cwd: ROOT },
      );
      expect(result.stdout).toContain(`scaffolded ${artifact}`);
    }

    const loop = await readFile(join(session, "charting-loop.md"), "utf8");
    expect(loop).toContain("Signal Read");
    expect(loop).toContain("Sharpness Check");

    const memory = await readFile(join(session, "memory-scan.md"), "utf8");
    expect(memory).toContain("reused | stale | irrelevant | missing | conflict");

    const questions = await readFile(join(session, "question-bundles.md"), "utf8");
    expect(questions).toContain("Aperture Question Bundle");
    expect(questions).toContain("Decision Question Bundle");

    const transcript = await readFile(join(session, "evidence/native-chat-transcript.jsonl"), "utf8");
    expect(transcript).toContain('"surface":"native-chat"');

    const workerPackets = await readFile(join(session, "worker-packets.md"), "utf8");
    expect(workerPackets).toContain("Launch mode: parallel");
    expect(workerPackets).toContain("Worker name: researcher-<topic>");

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
