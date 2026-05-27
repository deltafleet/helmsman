import { join } from "node:path";
import type { RunPaths } from "../core/document-bus/paths.ts";

export const DEFAULT_MAX_ACTIVE_RESEARCH_LANES = 6;

export const REQUIRED_RESEARCH_HEADINGS = [
  "Question",
  "Lane Type",
  "Worker Packet",
  "Sources Checked",
  "Observations",
  "Inferences",
  "Uncertainty",
  "Decision Impact",
  "Route Changes Required",
  "Recommended Next Step",
] as const;

export const FORBIDDEN_RESEARCH_WORKER_ACTIONS = [
  "Do not make or answer user-owned decisions.",
  "Do not expand scope beyond the lane contract.",
  "Do not claim Route Lock.",
  "Do not claim verification, closeout, release readiness, or completion.",
  "Do not edit Manifest, Board, route card, research index, memory index, or question artifacts.",
  "Do not write outside the required artifact path.",
] as const;

export function assertRelativeUnder(relativePath: string, root: "memory" | "research" | "worker-packets"): void {
  if (!relativePath || relativePath.startsWith("/") || relativePath.includes("\\") || relativePath.split("/").includes("..")) {
    throw new Error(`Unsafe relative artifact path: ${relativePath}`);
  }
  if (!relativePath.startsWith(`${root}/`)) {
    throw new Error(`Artifact path ${relativePath} must be under ${root}/.`);
  }
}

export function resolveRunArtifactPath(paths: RunPaths, relativePath: string): string {
  const root = relativePath.split("/", 1)[0];
  if (root !== "memory" && root !== "research" && root !== "worker-packets") {
    throw new Error(`Unsupported run artifact root: ${relativePath}`);
  }
  assertRelativeUnder(relativePath, root);
  return join(paths.runRoot, relativePath);
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "lane";
}
