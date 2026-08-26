import { describe, expect, it } from "vitest";
import { tracked } from "./types";
import { farmerAdjust, hasFarmerInput, provenanceHistory, verify } from "./provenance";

describe("farmerAdjust", () => {
  it("sets the new value and status without mutating the original", () => {
    const original = tracked(2 as const, "estimated", "Farm Return assumption");
    const adjusted = farmerAdjust(original, 3 as const, "Keith", "2026-08-23");

    expect(adjusted.value).toBe(3);
    expect(adjusted.status).toBe("farmer_adjusted");
    expect(adjusted.source).toBe("Keith");
    expect(adjusted.sourceDate).toBe("2026-08-23");
    expect(original.value).toBe(2);
    expect(original.status).toBe("estimated");
  });

  it("never overwrites provenance — chains the prior value under `previous`", () => {
    const original = tracked(2 as const, "estimated", "Farm Return assumption");
    const adjusted = farmerAdjust(original, 3 as const, "Keith");

    expect(adjusted.previous).toBe(original);
    expect(adjusted.previous?.value).toBe(2);
    expect(adjusted.previous?.status).toBe("estimated");
  });

  it("GFT179: a manual override is auditable — the working value is the override (620), while the original estimate (650) is preserved, not discarded", () => {
    const estimated = tracked(650, "estimated", "Farm Return assumption");
    const overridden = farmerAdjust(estimated, 620, "Keith");

    // Any downstream calculation reading `.value` uses the override.
    expect(overridden.value).toBe(620);
    // The report can still show both the override and the original.
    expect(overridden.previous?.value).toBe(650);
    expect(overridden.previous?.status).toBe("estimated");
  });

  it("chains multiple edits so the full history survives", () => {
    const v1 = tracked(2 as const, "estimated", "Farm Return assumption");
    const v2 = farmerAdjust(v1, 3 as const, "Keith", "2026-01-01");
    const v3 = farmerAdjust(v2, 4 as const, "Keith", "2026-08-23");

    expect(v3.value).toBe(4);
    expect(v3.previous?.value).toBe(3);
    expect(v3.previous?.previous?.value).toBe(2);
    expect(v3.previous?.previous).toBe(v1);
  });

  it("defaults sourceDate to today when not given", () => {
    const original = tracked(1 as const, "estimated", "Farm Return assumption");
    const adjusted = farmerAdjust(original, 2 as const, "Keith");
    expect(adjusted.sourceDate).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("verify", () => {
  it("sets status to verified rather than farmer_adjusted", () => {
    const original = tracked(120, "farmer_adjusted", "Keith");
    const verified = verify(original, 118, "Soil test", { sourceDate: "2026-05-12" });

    expect(verified.status).toBe("verified");
    expect(verified.value).toBe(118);
    expect(verified.previous).toBe(original);
    expect(verified.sourceDate).toBe("2026-05-12");
  });
});

describe("hasFarmerInput", () => {
  it("is false for a chain that never had farmer or verified input", () => {
    const estimated = tracked(2 as const, "estimated", "Farm Return assumption");
    expect(hasFarmerInput(estimated)).toBe(false);
  });

  it("is true when the current value is farmer_adjusted", () => {
    const adjusted = farmerAdjust(
      tracked(2 as const, "estimated", "Farm Return assumption"),
      3 as const,
      "Keith",
    );
    expect(hasFarmerInput(adjusted)).toBe(true);
  });

  it("is true when a farmer/verified edit exists anywhere earlier in the chain", () => {
    const v1 = tracked(2 as const, "estimated", "Farm Return assumption");
    const v2 = farmerAdjust(v1, 3 as const, "Keith");
    // A later "mapped" re-estimate still chains through a prior farmer edit.
    const v3 = { ...tracked(5 as const, "mapped", "Irish Soil Information System"), previous: v2 };
    expect(hasFarmerInput(v3)).toBe(true);
  });
});

describe("provenanceHistory", () => {
  it("flattens the chain most-recent first", () => {
    const v1 = tracked(2 as const, "estimated", "Farm Return assumption");
    const v2 = farmerAdjust(v1, 3 as const, "Keith", "2026-01-01");
    const v3 = farmerAdjust(v2, 4 as const, "Keith", "2026-08-23");

    const history = provenanceHistory(v3);
    expect(history).toHaveLength(3);
    expect(history.map((h) => h.value)).toEqual([4, 3, 2]);
  });

  it("returns a single-entry array for a value with no history", () => {
    const v1 = tracked(2 as const, "estimated", "Farm Return assumption");
    expect(provenanceHistory(v1)).toEqual([v1]);
  });
});
