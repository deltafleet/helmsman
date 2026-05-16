import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";

const SKILL = "SKILL.md";
const MAP_SCHEMA = "docs/map-schema.md";

describe("docs data contract", () => {
  test("helmsman map schema documents canonical artifact storage", async () => {
    const body = await readFile(MAP_SCHEMA, "utf8");
    expect(body).toContain(".helmsman/sessions/<session-id>/");
    expect(body).toContain("map.json");
    expect(body).toContain("contract.md");
    expect(body).toContain("route-card.md");
    expect(body).not.toContain("state.json");
    expect(body).not.toContain("round-a");
    expect(body).not.toContain("round-b");
  });

  test("SKILL.md documents canonical project memory without old state files", async () => {
    const body = await readFile(SKILL, "utf8");
    expect(body).toContain(".helmsman/HELMSMAN.md");
    expect(body).not.toContain(".helmsman/{session-id}/state.json");
  });

  test("SKILL.md keeps the route-governed artifact authority surface", async () => {
    const body = await readFile(SKILL, "utf8");
    expect(body).toContain("Helmsman is a route-governed autonomy protocol");
    expect(body).toContain("Helmsman protocol workspace");
    expect(body).toContain("Artifacts hold durable state.");
    expect(body).toContain("The user owns decisions.");
  });

  test("SKILL.md routes downstream protocol work through autopilot", async () => {
    const body = await readFile(SKILL, "utf8");
    expect(body).toContain("Autopilot coordinates strategy, blueprinting, audit, execution, and repair.");
    expect(body).toContain("strategy samples, a blueprint, hardening, audit, worker packets");
  });

  test("SKILL.md no longer documents legacy state-machine command surfaces", async () => {
    const body = await readFile(SKILL, "utf8");
    expect(body).not.toContain("helmsman next --json");
    expect(body).not.toContain("--artifact-language en|ko");
    expect(body).not.toContain("helmsman language set");
  });
});
