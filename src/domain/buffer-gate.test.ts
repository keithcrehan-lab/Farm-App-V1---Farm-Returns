import { describe, expect, it } from "vitest";
import { checkLocalBufferOverride, checkNationalBufferDistance, NATIONAL_BUFFER_DISTANCES_M } from "./buffer-gate";
import { resolveLocalWaterBufferOverrideStatus } from "./input-gates";
import { tracked } from "./types";

describe("checkNationalBufferDistance", () => {
  it("real statutory baselines", () => {
    expect(NATIONAL_BUFFER_DISTANCES_M.chemicalFertiliserSurfaceWater).toBe(3);
    expect(NATIONAL_BUFFER_DISTANCES_M.organicSurfaceWaterBaseline).toBe(5);
    expect(NATIONAL_BUFFER_DISTANCES_M.organicSurfaceWaterElevated).toBe(10);
  });

  it("GFT083: chemical fertiliser 2.9m from surface water -> PROHIBITED", () => {
    const outcome = checkNationalBufferDistance({ material: "chemical_fertiliser", feature: "surface_water", distanceM: 2.9 });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
  });

  it("GFT084: chemical fertiliser exactly 3m -> BOUNDARY_MET_SUBJECT_TO_OTHER_RULES", () => {
    const outcome = checkNationalBufferDistance({ material: "chemical_fertiliser", feature: "surface_water", distanceM: 3.0 });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("BOUNDARY_MET_SUBJECT_TO_OTHER_RULES");
  });

  it("GFT085: organic fertiliser 4.9m from surface water (ordinary baseline) -> PROHIBITED", () => {
    const outcome = checkNationalBufferDistance({ material: "organic_fertiliser_or_soiled_water", feature: "surface_water", distanceM: 4.9 });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
  });

  it("GFT086: organic fertiliser 5m, outside enhanced period -> BOUNDARY_MET_SUBJECT_TO_OTHER_RULES", () => {
    const outcome = checkNationalBufferDistance({ material: "organic_fertiliser_or_soiled_water", feature: "surface_water", distanceM: 5.0, enhancedPeriod: false });
    expect(outcome.status).toBe("OK");
  });

  it("GFT087: enhanced 10m period catches 9m -> PROHIBITED (5m baseline alone would have passed)", () => {
    const outcome = checkNationalBufferDistance({ material: "organic_fertiliser_or_soiled_water", feature: "surface_water", distanceM: 9.0, enhancedPeriod: true });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
  });

  it("GFT088: slope-to-water 10m rule — 11% incline sloping toward water catches 9m", () => {
    const outcome = checkNationalBufferDistance({
      material: "organic_fertiliser_or_soiled_water",
      feature: "surface_water",
      distanceM: 9.0,
      averageInclinePct: 11,
      slopesTowardWater: true,
    });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
  });

  it("steep incline NOT sloping toward water does not elevate the requirement", () => {
    const outcome = checkNationalBufferDistance({
      material: "organic_fertiliser_or_soiled_water",
      feature: "surface_water",
      distanceM: 6,
      averageInclinePct: 15,
      slopesTowardWater: false,
    });
    expect(outcome.status).toBe("OK"); // 6m clears the 5m ordinary baseline
  });

  it("real major/minor drinking-water abstraction and other feature baselines", () => {
    expect(checkNationalBufferDistance({ material: "organic_fertiliser_or_soiled_water", feature: "major_drinking_water_abstraction", distanceM: 199 }).status).toBe("LEGAL_PROHIBITION");
    expect(checkNationalBufferDistance({ material: "organic_fertiliser_or_soiled_water", feature: "major_drinking_water_abstraction", distanceM: 200 }).status).toBe("OK");
    expect(checkNationalBufferDistance({ material: "organic_fertiliser_or_soiled_water", feature: "drinking_water_abstraction", distanceM: 100 }).status).toBe("OK");
    expect(checkNationalBufferDistance({ material: "organic_fertiliser_or_soiled_water", feature: "other_drinking_well_spring_borehole", distanceM: 25 }).status).toBe("OK");
    expect(checkNationalBufferDistance({ material: "organic_fertiliser_or_soiled_water", feature: "lake_or_turlough_likely_to_flood", distanceM: 20 }).status).toBe("OK");
    expect(checkNationalBufferDistance({ material: "organic_fertiliser_or_soiled_water", feature: "exposed_cavernous_or_karst_limestone_feature", distanceM: 15 }).status).toBe("OK");
  });
});

describe("checkLocalBufferOverride", () => {
  it("GFT089: local override (50m) exceeds actual distance (30m), even though a national baseline of 25m would pass -> PROHIBITED_BY_LOCAL_OVERRIDE", () => {
    const localOverrideStatus = resolveLocalWaterBufferOverrideStatus({
      waterBufferContext: tracked({ localOverrideStatus: "authoritative_rule" as const, distanceM: 50 }, "verified", "Local authority record"),
    });
    const outcome = checkLocalBufferOverride({ actualDistanceM: 30, localOverrideStatus, localOverrideDistanceM: 50 });
    expect(outcome.status).toBe("LEGAL_PROHIBITION");
    if (outcome.status === "LEGAL_PROHIBITION") {
      expect(outcome.reasonCode).toBe("LOCAL_BUFFER_OVERRIDE_EXCEEDS_ACTUAL_DISTANCE");
    }
  });

  it("GFT090: local override status UNKNOWN (but national buffer passes) -> QUALIFIED_NOT_DEFINITIVE (UNKNOWN)", () => {
    const localOverrideStatus = resolveLocalWaterBufferOverrideStatus({
      waterBufferContext: tracked({ localOverrideStatus: "unknown" as const }, "estimated", "Mapping review"),
    });
    const outcome = checkLocalBufferOverride({ actualDistanceM: 100, localOverrideStatus });
    expect(outcome.status).toBe("UNKNOWN");
    if (outcome.status === "UNKNOWN") expect(outcome.reasonCode).toBe("LOCAL_BUFFER_STATUS_UNKNOWN");
  });

  it("verified_none local override status means the national baseline applies outright", () => {
    const localOverrideStatus = resolveLocalWaterBufferOverrideStatus({
      waterBufferContext: tracked({ localOverrideStatus: "verified_none" as const }, "verified", "Local authority record"),
    });
    const outcome = checkLocalBufferOverride({ actualDistanceM: 10, localOverrideStatus });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value).toBe("NATIONAL_BASELINE_APPLIES");
  });

  it("actual distance meeting or exceeding the local override passes", () => {
    const localOverrideStatus = resolveLocalWaterBufferOverrideStatus({
      waterBufferContext: tracked({ localOverrideStatus: "authoritative_rule" as const, distanceM: 50 }, "verified", "Local authority record"),
    });
    const outcome = checkLocalBufferOverride({ actualDistanceM: 50, localOverrideStatus, localOverrideDistanceM: 50 });
    expect(outcome.status).toBe("OK");
  });

  it("fails closed when the buffer context was never assessed at all", () => {
    const outcome = checkLocalBufferOverride({ actualDistanceM: 30, localOverrideStatus: resolveLocalWaterBufferOverrideStatus({}) });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(outcome.reasonCode).toBe("MISSING_LOCAL_BUFFER_ASSESSMENT");
    }
  });
});
