import { open, rm } from "node:fs/promises";

export async function withRunLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  const handle = await open(lockPath, "wx");
  try {
    await handle.close();
    return await fn();
  } finally {
    await rm(lockPath, { force: true });
  }
}
