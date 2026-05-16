export type SkillMemoryPromotionVerdict = "promote" | "session-only" | "reject";

export interface SkillMemoryCandidate {
  id: string;
  type: string;
  stability: string;
  trigger: string;
  symptom: string;
  cause: string;
  fix: string;
  futureUse: string;
  sourceArtifact: string;
  promotionVerdict: SkillMemoryPromotionVerdict;
}

const FIELD_LABELS = [
  "Type",
  "Stability",
  "Trigger",
  "Symptom",
  "Cause",
  "Fix",
  "Future use",
  "Source artifact",
  "Promotion verdict",
] as const;

function field(body: string, label: (typeof FIELD_LABELS)[number]): string {
  const match = new RegExp(`^${label}:\\s*(.+)$`, "im").exec(body);
  if (!match?.[1]?.trim()) {
    throw new Error(`memory candidate missing '${label}:'`);
  }
  return match[1].trim();
}

function section(body: string, heading: string): string {
  const match = new RegExp(`^##\\s+${heading}\\s*$`, "im").exec(body);
  if (!match) return "";
  const rest = body.slice(match.index + match[0].length);
  const next = /^##\s+/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

export function parseSkillMemoryCandidates(retro: string): SkillMemoryCandidate[] {
  const body = section(retro, "Promoted Memory Candidates");
  if (!body || /^No promoted memory candidates\./im.test(body)) return [];

  const headings = [...body.matchAll(/^#{2,3}\s+(?:Memory Candidate|Candidate):\s*(.+)$/gim)];
  if (headings.length === 0) {
    throw new Error("retro.md missing memory candidate blocks");
  }

  return headings.map((heading, index) => {
    const start = heading.index ?? 0;
    const next = headings[index + 1];
    const candidateBody = body.slice(start, next?.index ?? body.length);
    const verdict = field(candidateBody, "Promotion verdict");
    if (!["promote", "session-only", "reject"].includes(verdict)) {
      throw new Error(`memory candidate has invalid promotion verdict '${verdict}'`);
    }
    const stability = field(candidateBody, "Stability");
    if (stability === "session-bound" && verdict === "promote") {
      throw new Error("memory candidate cannot promote session-bound detail");
    }

    return {
      id: heading[1]?.trim() ?? "unknown",
      type: field(candidateBody, "Type"),
      stability,
      trigger: field(candidateBody, "Trigger"),
      symptom: field(candidateBody, "Symptom"),
      cause: field(candidateBody, "Cause"),
      fix: field(candidateBody, "Fix"),
      futureUse: field(candidateBody, "Future use"),
      sourceArtifact: field(candidateBody, "Source artifact"),
      promotionVerdict: verdict as SkillMemoryPromotionVerdict,
    };
  });
}
