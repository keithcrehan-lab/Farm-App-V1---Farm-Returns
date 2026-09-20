import { describe, expect, it } from "vitest";
import { PRIORITY_DOT_BG, toneForTodayPriority } from "./TodayOpportunityCard";

describe("toneForTodayPriority — Priority Colour Reference (2026-09-19)", () => {
  it("maps HIGH to the risk (red) tone", () => {
    expect(toneForTodayPriority("HIGH")).toBe("risk");
  });

  it("maps MEDIUM to the attention (amber) tone", () => {
    expect(toneForTodayPriority("MEDIUM")).toBe("attention");
  });

  it("maps LOW to the good (green) tone — never info/blue", () => {
    expect(toneForTodayPriority("LOW")).toBe("good");
  });

  it("maps VERY_LOW to the neutral (muted grey) tone", () => {
    expect(toneForTodayPriority("VERY_LOW")).toBe("neutral");
  });
});

describe("PRIORITY_DOT_BG — the one shared dot-colour system", () => {
  it("has a real background class for every tone toneForTodayPriority can return", () => {
    for (const priority of ["HIGH", "MEDIUM", "LOW", "VERY_LOW"] as const) {
      const tone = toneForTodayPriority(priority);
      expect(PRIORITY_DOT_BG[tone]).toBeTruthy();
    }
  });

  it("uses the agreed red/amber/green/grey colour tokens", () => {
    expect(PRIORITY_DOT_BG[toneForTodayPriority("HIGH")]).toBe("bg-fr-risk");
    expect(PRIORITY_DOT_BG[toneForTodayPriority("MEDIUM")]).toBe("bg-fr-attention");
    expect(PRIORITY_DOT_BG[toneForTodayPriority("LOW")]).toBe("bg-fr-good");
    expect(PRIORITY_DOT_BG[toneForTodayPriority("VERY_LOW")]).toBe("bg-fr-ink-400");
  });
});
