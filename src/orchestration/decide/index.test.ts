import { describe, expect, it } from "vitest";
import { decideAsFarmer } from "./index";

describe("decideAsFarmer", () => {
  const prompt = { id: "prompt-1", farmId: "farm-1" };

  it("builds an accepted Decision carrying the prompt's id/farmId and decidedBy: farmer", () => {
    const decision = decideAsFarmer(prompt, "accepted", "2026-08-29T09:00:00Z", { animalId: "animal-1" });
    expect(decision).toEqual({
      id: "decision:prompt-1:2026-08-29T09:00:00Z",
      promptId: "prompt-1",
      farmId: "farm-1",
      outcome: "accepted",
      edits: { animalId: "animal-1" },
      decidedBy: "farmer",
      decidedAt: "2026-08-29T09:00:00Z",
    });
  });

  it("builds a dismissed Decision with no edits", () => {
    const decision = decideAsFarmer(prompt, "dismissed", "2026-08-29T09:00:00Z");
    expect(decision.outcome).toBe("dismissed");
    expect(decision.edits).toBeUndefined();
    expect(decision.decidedBy).toBe("farmer");
  });
});
