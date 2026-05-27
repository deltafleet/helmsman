import { readFile } from "node:fs/promises";
import type { HelmsmanEvent } from "./event-types.ts";

export async function readEvents(path: string): Promise<HelmsmanEvent[]> {
  try {
    const text = await readFile(path, "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as HelmsmanEvent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
