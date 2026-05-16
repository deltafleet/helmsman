import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();

async function runRemovedSurfaceAudit(args: string[]) {
  return execFileAsync(process.execPath, ["scripts/audit-removed-surfaces.mjs", ...args], {
    cwd: ROOT,
  });
}

describe("removed surface audit", () => {
  test("current repo has no current-facing removed runtime surfaces", async () => {
    const { stdout } = await runRemovedSurfaceAudit([]);

    expect(stdout).toContain("removed surface audit pass");
  });

  test("json output exposes the clean current-facing scan", async () => {
    const { stdout } = await runRemovedSurfaceAudit(["--json"]);
    const audit = JSON.parse(stdout);

    expect(audit.removedSurfaceReady).toBe(true);
    expect(audit.scannedFiles).toBeGreaterThan(0);
    expect(audit.hits).toEqual([]);
  });

  test("fails when removed content reappears in a current-facing file", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "helmsman-removed-surface-content-"));
    try {
      await writeFile(join(tmp, "README.md"), "This asks users to launch OpenTUI again.\n");

      let error;
      try {
        await runRemovedSurfaceAudit(["--root", tmp]);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeTruthy();
      const stderr = (error as { stderr: string }).stderr;
      expect(stderr).toContain("removed surface audit fail");
      expect(stderr).toContain("README.md content OpenTUI");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("fails when removed path families reappear", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "helmsman-removed-surface-path-"));
    try {
      await mkdir(join(tmp, "lib/runtime"), { recursive: true });
      await writeFile(join(tmp, "lib/runtime/worker.ts"), "export const removed = true;\n");

      let error;
      try {
        await runRemovedSurfaceAudit(["--root", tmp]);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeTruthy();
      const stderr = (error as { stderr: string }).stderr;
      expect(stderr).toContain("removed surface audit fail");
      expect(stderr).toContain("lib/runtime/worker.ts path lib/runtime");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("fails when the removed CLI state-machine entrypoint reappears", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "helmsman-removed-cli-path-"));
    try {
      await mkdir(join(tmp, "bin"), { recursive: true });
      await writeFile(join(tmp, "bin/helmsman"), "#!/usr/bin/env bun\n");

      let error;
      try {
        await runRemovedSurfaceAudit(["--root", tmp]);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeTruthy();
      const stderr = (error as { stderr: string }).stderr;
      expect(stderr).toContain("removed surface audit fail");
      expect(stderr).toContain("bin/helmsman path bin/helmsman");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test("fails when Round state-machine language reappears", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "helmsman-removed-round-content-"));
    try {
      await writeFile(join(tmp, "README.md"), "Run round-a and round-b before phase advance.\n");

      let error;
      try {
        await runRemovedSurfaceAudit(["--root", tmp]);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeTruthy();
      const stderr = (error as { stderr: string }).stderr;
      expect(stderr).toContain("README.md content round-a");
      expect(stderr).toContain("README.md content round-b");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
