import { describe, expect, test } from "vitest";
import { parseSkillMemoryCandidates } from "../../lib/domain/skill-memory-candidates";

const VALID_RETRO = `# Retro

## Promoted Memory Candidates

### Memory Candidate: helmsman-artifact-authority

Type: principle
Stability: stable
Trigger: future Helmsman session design or recovery work
Symptom: an agent wants to rely on worker completion, chat confidence, or dashboard state
Cause: workflow authority is not tied to route artifacts
Fix: validate route artifacts before completion
Future use: require artifact validation before claiming closure
Source artifact: verification.md
Promotion verdict: promote

### Memory Candidate: local-one-off

Type: project-fact
Stability: session-bound
Trigger: this exact session only
Symptom: none
Cause: none
Fix: none
Future use: keep in retro only
Source artifact: retro.md
Promotion verdict: session-only
`;

describe("skill memory candidate parser", () => {
  test("parses promoted and session-only candidates deterministically", () => {
    const candidates = parseSkillMemoryCandidates(VALID_RETRO);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      id: "helmsman-artifact-authority",
      promotionVerdict: "promote",
      sourceArtifact: "verification.md",
    });
    expect(candidates[1]).toMatchObject({
      id: "local-one-off",
      promotionVerdict: "session-only",
    });
  });

  test("rejects promoted candidates without source artifact", () => {
    expect(() =>
      parseSkillMemoryCandidates(
        VALID_RETRO.replace("Source artifact: verification.md\n", ""),
      ),
    ).toThrow("memory candidate missing 'Source artifact:'");
  });

  test("rejects unknown promotion verdicts", () => {
    expect(() =>
      parseSkillMemoryCandidates(VALID_RETRO.replace("Promotion verdict: promote", "Promotion verdict: maybe")),
    ).toThrow("memory candidate has invalid promotion verdict 'maybe'");
  });

  test("rejects session-bound candidates promoted as durable memory", () => {
    expect(() =>
      parseSkillMemoryCandidates(
        VALID_RETRO.replace("Stability: stable", "Stability: session-bound"),
      ),
    ).toThrow("memory candidate cannot promote session-bound detail");
  });
});
