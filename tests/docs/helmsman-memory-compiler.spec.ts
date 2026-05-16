import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect } from "vitest";
import { test, writeFixture } from "../helpers/tmpdir";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

describe("helmsman memory compiler", () => {
  test("writes promoted candidates and skips session-only candidates", async ({ tmpdir }) => {
    const session = join(tmpdir, "session");
    const target = join(tmpdir, "wiki/candidates");
    await mkdir(session, { recursive: true });
    await writeFixture(
      tmpdir,
      "session/retro.md",
      [
        "# Retro",
        "",
        "## Promoted Memory Candidates",
        "",
        "### Memory Candidate: promoted-rule",
        "",
        "Type: principle",
        "Stability: stable",
        "Trigger: future Helmsman workflow closure",
        "Symptom: completion claimed from worker status",
        "Cause: workflow authority detached from artifacts",
        "Fix: validate artifacts first",
        "Future use: run validator before closure",
        "Source artifact: verification.md",
        "Promotion verdict: promote",
        "",
        "### Memory Candidate: local-note",
        "",
        "Type: project-fact",
        "Stability: session-bound",
        "Trigger: this one session",
        "Symptom: none",
        "Cause: none",
        "Fix: none",
        "Future use: keep local",
        "Source artifact: retro.md",
        "Promotion verdict: session-only",
        "",
      ].join("\n"),
    );

    const { stdout } = await execFileAsync(
      process.execPath,
      ["scripts/compile-skill-memory.mjs", session, "--target", target],
      { cwd: ROOT },
    );

    expect(stdout).toContain("skill memory compile pass: 1 promoted, 1 skipped");
    const promoted = await readFile(join(target, "promoted-rule.md"), "utf8");
    expect(promoted).toContain("# promoted-rule");
    expect(promoted).toContain("sourceArtifact: verification.md");
    await expect(readFile(join(target, "local-note.md"), "utf8")).rejects.toThrow();
  });
});
