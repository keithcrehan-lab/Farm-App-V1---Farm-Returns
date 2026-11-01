import { describe, expect, it } from "vitest";
import { canApplyDerivedWaterEvidence } from "./fields";
import { tracked } from "@/domain/types";

describe("canApplyDerivedWaterEvidence", () => {
  it("allows EPA to fill a missing distance after the farmer selected the same surface-water feature type", () => {
    const existing = tracked({ featureType: "surface_water" as const, localOverrideStatus: "unknown" as const }, "farmer_adjusted", "Farmer");
    expect(canApplyDerivedWaterEvidence(existing, "surface_water")).toBe(true);
  });

  it("does not overwrite a farmer distance that is already recorded", () => {
    const existing = tracked({ featureType: "surface_water" as const, distanceM: 5, localOverrideStatus: "unknown" as const }, "farmer_adjusted", "Farmer");
    expect(canApplyDerivedWaterEvidence(existing, "surface_water")).toBe(false);
  });

  it("does not replace a farmer-selected feature with conflicting mapped evidence", () => {
    const existing = tracked({ featureType: "surface_water" as const, localOverrideStatus: "unknown" as const }, "farmer_adjusted", "Farmer");
    expect(canApplyDerivedWaterEvidence(existing, undefined)).toBe(false);
  });
});
