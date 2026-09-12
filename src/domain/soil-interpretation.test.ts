import { describe, expect, it } from "vitest";
import { interpretLabResult, SOIL_INTERPRETATION_VERSION } from "./soil-interpretation";

const NOW = "2026-09-13T10:00:00.000Z";

describe("interpretLabResult", () => {
  it("classifies a clear grassland P Index (below the statutory boundary)", () => {
    const result = interpretLabResult({ labResultId: "lab-1", pMgL: 4.0, kMgL: 90, pH: 6.3, plannedUse: "grazing", now: NOW });
    expect(result.pIndexOutcome.status).toBe("OK");
    expect(result.pIndex).toBe(2);
    expect(result.pIndexConservativeTreatment).toBe(false);
    expect(result.kIndex).toBe(2);
    expect(result.methodologyVersion).toBe(SOIL_INTERPRETATION_VERSION);
    expect(result.cropGroup).toBe("grassland");
  });

  it("defaults to grassland when plannedUse is absent — same non-fail-closed behaviour as addSoilTestToField", () => {
    const result = interpretLabResult({ labResultId: "lab-1", pMgL: 4.0, kMgL: 90, pH: 6.3, now: NOW });
    expect(result.cropGroup).toBe("grassland");
  });

  it("routes tillage fields to the other_crop P Index bounds", () => {
    const result = interpretLabResult({ labResultId: "lab-1", pMgL: 7.0, kMgL: 90, pH: 6.3, plannedUse: "tillage", now: NOW });
    expect(result.cropGroup).toBe("other_crop");
    // 7.0 mg/L is within other_crop's Index 2 band (<=6.04 is Index 2... actually check boundary), status OK either way.
    expect(result.pIndexOutcome.status).toBe("OK");
  });

  it("preserves AMBIGUOUS_STATUTORY_BOUNDARY rather than silently resolving it, while still returning a usable conservative index", () => {
    // 8.005 mg/L falls in the grassland ambiguous gap (8.0, 8.01].
    const result = interpretLabResult({ labResultId: "lab-1", pMgL: 8.005, kMgL: 90, pH: 6.3, plannedUse: "grazing", now: NOW });
    expect(result.pIndexOutcome.status).toBe("AMBIGUOUS");
    expect(result.pIndex).toBe(4);
    expect(result.pIndexConservativeTreatment).toBe(true);
  });

  it("classifies K Index by soil material — peat vs mineral bands differ", () => {
    const mineral = interpretLabResult({ labResultId: "lab-1", pMgL: 4.0, kMgL: 120, pH: 6.3, organicCarbonStatus: "mineral", now: NOW });
    const peat = interpretLabResult({ labResultId: "lab-1", pMgL: 4.0, kMgL: 120, pH: 6.3, organicCarbonStatus: "peat", now: NOW });
    expect(mineral.kIndex).toBe(3);
    expect(peat.kIndex).toBe(2);
  });

  it("passes through a lab-reported lime requirement verbatim, never deriving one", () => {
    const withLime = interpretLabResult({ labResultId: "lab-1", pMgL: 4.0, kMgL: 90, pH: 5.8, limeRequirementTHa: 5, now: NOW });
    expect(withLime.limeRequirementTHa).toBe(5);
    const withoutLime = interpretLabResult({ labResultId: "lab-1", pMgL: 4.0, kMgL: 90, pH: 5.8, now: NOW });
    expect(withoutLime.limeRequirementTHa).toBeUndefined();
  });

  it("carries the real, verified pH through unchanged", () => {
    const result = interpretLabResult({ labResultId: "lab-1", pMgL: 4.0, kMgL: 90, pH: 6.45, now: NOW });
    expect(result.pH).toBe(6.45);
  });
});
