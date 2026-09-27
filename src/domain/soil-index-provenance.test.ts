import { describe, expect, it } from "vitest";
import { laboratoryPIndexForSoilTestValidity, resolveFieldSoilIndexProvenance, resolveSoilIndexProvenance } from "./soil-index-provenance";
import { farmerAdjust, verify } from "./provenance";
import { calculateNutrientPlan, soilTestAgeValidityForFertility } from "./nutrients";
import type { Field, SoilTest, TrackedValue } from "./types";

type Idx = 1 | 2 | 3 | 4;

const lab = (value: Idx, sampleDate = "2021-03-01"): TrackedValue<Idx> => verify<Idx>(undefined, value, "Teagasc Johnstown soil test", { sourceDate: sampleDate });

const soilTest = (sampleDate: string): SoilTest => ({ sampleDate, laboratory: "Teagasc Johnstown", sampleRef: "FR-1", p: 3, k: 90, pH: 6.2 }) as SoilTest;

describe("resolveSoilIndexProvenance (Campaign A, A1.2)", () => {
  it("lab only: the effective value is the laboratory result", () => {
    const p = resolveSoilIndexProvenance(lab(2));
    expect(p.basis).toBe("laboratory");
    expect(p.effective).toMatchObject({ value: 2, status: "verified" });
    expect(p.laboratory).toMatchObject({ value: 2, status: "verified", source: "Teagasc Johnstown soil test", sourceDate: "2021-03-01" });
    expect(p.farmerOverride).toBeNull();
  });

  it("farmer override after lab: reported as an override, lab evidence kept alongside, never labelled laboratory", () => {
    const tv = farmerAdjust(lab(2), 4, "Keith", "2026-05-01");
    const p = resolveSoilIndexProvenance(tv);
    expect(p.basis).toBe("farmer_override_of_laboratory");
    expect(p.effective).toMatchObject({ value: 4, status: "farmer_adjusted", source: "Keith" });
    expect(p.farmerOverride).toMatchObject({ value: 4, status: "farmer_adjusted" });
    expect(p.laboratory).toMatchObject({ value: 2, status: "verified" });
    expect(p.effective?.status).not.toBe("verified");
  });

  it("changing the override again keeps the original laboratory evidence unchanged", () => {
    const original = lab(2);
    const snapshot = structuredClone(original);
    const tv = farmerAdjust(farmerAdjust(original, 4, "Keith", "2026-05-01"), 3, "Keith", "2026-06-01");
    const p = resolveSoilIndexProvenance(tv);
    expect(p.basis).toBe("farmer_override_of_laboratory");
    expect(p.effective?.value).toBe(3);
    expect(p.laboratory).toMatchObject({ value: 2, sourceDate: "2021-03-01" });
    expect(original).toEqual(snapshot);
  });

  it("a newer lab result after an override becomes the effective laboratory value again", () => {
    const tv = verify(farmerAdjust(lab(2), 4, "Keith"), 3, "Lab B soil test", { sourceDate: "2026-02-01" });
    const p = resolveSoilIndexProvenance(tv);
    expect(p.basis).toBe("laboratory");
    expect(p.laboratory).toMatchObject({ value: 3, sourceDate: "2026-02-01" });
    expect(p.farmerOverride).toBeNull();
  });

  it("farmer value with no lab, unconfirmed estimate and missing are distinct", () => {
    expect(resolveSoilIndexProvenance(farmerAdjust<Idx>(undefined, 3, "Keith")).basis).toBe("farmer_declared_without_laboratory");
    expect(resolveSoilIndexProvenance({ value: 2, status: "estimated", source: "Farm Return assumption" }).basis).toBe("unconfirmed_estimate");
    expect(resolveSoilIndexProvenance(undefined)).toEqual({ basis: "missing", effective: null, laboratory: null, farmerOverride: null });
  });

  it("resolveFieldSoilIndexProvenance reports P and K independently", () => {
    const both = resolveFieldSoilIndexProvenance({ pIndex: farmerAdjust(lab(2), 4, "Keith"), kIndex: lab(3) });
    expect(both.p.basis).toBe("farmer_override_of_laboratory");
    expect(both.k.basis).toBe("laboratory");
  });
});

describe("soil-test age validity uses the laboratory P Index, never a farmer override", () => {
  it("a 5-year-old Index-2 test stays DISREGARD even when the farmer overrides P to Index 4", () => {
    const fertility = { pIndex: farmerAdjust(lab(2, "2021-03-01"), 4, "Keith"), verifiedTest: soilTest("2021-03-01") };
    const outcome = soilTestAgeValidityForFertility(fertility, "2026-09-27");
    expect(outcome).toMatchObject({ status: "OK", value: "DISREGARD" });
  });

  it("a genuine lab Index 4 persists past 4 years", () => {
    const outcome = soilTestAgeValidityForFertility({ pIndex: lab(4, "2021-03-01"), verifiedTest: soilTest("2021-03-01") }, "2026-09-27");
    expect(outcome).toMatchObject({ status: "OK", value: "INDEX4_PERSISTED" });
  });

  it("a lab test with only a farmer index in the history is not judged on the farmer's value", () => {
    expect(laboratoryPIndexForSoilTestValidity(farmerAdjust<Idx>(undefined, 4, "Keith"))).toMatchObject({
      status: "BLOCKED_INSUFFICIENT_EVIDENCE",
      reasonCode: "SOIL_TEST_LABORATORY_INDEX_NOT_TRACEABLE",
    });
    // The 4-year limit still applies; a farmer's Index 4 never earns the
    // lab-result persistence exception.
    const fertility = { pIndex: farmerAdjust<Idx>(undefined, 4, "Keith"), verifiedTest: soilTest("2020-01-01") };
    expect(soilTestAgeValidityForFertility(fertility, "2026-09-27")).toMatchObject({ status: "OK", value: "DISREGARD" });
    expect(soilTestAgeValidityForFertility({ ...fertility, verifiedTest: soilTest("2025-01-01") }, "2026-09-27")).toMatchObject({ status: "OK", value: "VALID" });
  });
});

describe("calculateNutrientPlan carries truthful P/K provenance downstream", () => {
  const field = (pIndex: TrackedValue<Idx>): Field =>
    ({
      id: "f1",
      farmId: "farm-1",
      name: "Home",
      areaHa: 5,
      centroid: [0, 0],
      plannedUse: { value: "grazing", status: "farmer_adjusted", source: "Keith" },
      fertility: { pIndex, kIndex: lab(3), verifiedTest: soilTest("2025-03-01") },
      history: [],
    }) as unknown as Field;

  it("an override is consumed as the effective value but disclosed as an override with the lab value retained", () => {
    const plan = calculateNutrientPlan({ field: field(farmerAdjust(lab(2), 4, "Keith")), farmGrasslandAreaHa: 5, livestockGroups: [], asOfDate: "2026-09-27" });
    expect(plan.fertilityEvidence).toMatchObject({ status: "OK", value: { pIndex: 4 } });
    expect(plan.fertilityEvidence.status === "OK" && plan.fertilityEvidence.evidenceState).not.toBe("MEASURED");
    expect(plan.soilIndexProvenance?.p).toMatchObject({ basis: "farmer_override_of_laboratory", laboratory: { value: 2 }, farmerOverride: { value: 4 } });
    expect(plan.soilIndexProvenance?.k.basis).toBe("laboratory");
  });

  it("lab-only plans are MEASURED with laboratory basis", () => {
    const plan = calculateNutrientPlan({ field: field(lab(2)), farmGrasslandAreaHa: 5, livestockGroups: [], asOfDate: "2026-09-27" });
    expect(plan.fertilityEvidence.status === "OK" && plan.fertilityEvidence.evidenceState).toBe("MEASURED");
    expect(plan.soilIndexProvenance?.p.basis).toBe("laboratory");
  });
});
