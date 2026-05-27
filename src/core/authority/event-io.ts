import { readFile } from "node:fs/promises";
import type { ManifestEvent } from "./types.ts";

export async function readManifestEvents(path: string): Promise<ManifestEvent[]> {
  try {
    const text = await readFile(path, "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ManifestEvent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function serializeManifestEvents(events: ManifestEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n") + (events.length > 0 ? "\n" : "");
}
