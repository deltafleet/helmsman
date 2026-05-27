import { createHash } from "node:crypto";

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortForJson(value));
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value)).digest("hex");
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortForJson(item));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    output[key] = sortForJson((value as Record<string, unknown>)[key]);
  }
  return output;
}
