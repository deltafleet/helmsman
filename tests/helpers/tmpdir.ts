import { test as baseTest } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

export interface TmpdirFixture {
  tmpdir: string;
}

const hasExtend =
  typeof (baseTest as { extend?: unknown }).extend === "function";

const createTmpdir = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), "helmsman-test-"));

const withTmpdir = async <T>(
  fn: (ctx: TmpdirFixture) => Promise<T>,
): Promise<T> => {
  const dir = await createTmpdir();
  try {
    return await fn({ tmpdir: dir });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
};

export const test = hasExtend
  ? (
      baseTest as typeof baseTest & {
        extend: (fixture: Record<string, unknown>) => typeof baseTest;
      }
    ).extend<TmpdirFixture>({
      tmpdir: async ({}, use) => {
        const dir = await createTmpdir();
        await use(dir);
        await fs.rm(dir, { recursive: true, force: true });
      },
    })
  : (
      name: string,
      fn: (ctx: TmpdirFixture) => Promise<void>,
      options?: unknown,
    ) =>
      (
        baseTest as (
          name: string,
          fn: () => Promise<void>,
          options?: unknown,
        ) => void
      )(
        name,
        async () => {
          await withTmpdir(fn);
        },
        options,
      );

export async function writeFixture(
  tmpdir: string,
  rel: string,
  content: string,
): Promise<string> {
  const full = path.join(tmpdir, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
  return full;
}

export async function readFixture(
  tmpdir: string,
  rel: string,
): Promise<string> {
  return fs.readFile(path.join(tmpdir, rel), "utf8");
}
