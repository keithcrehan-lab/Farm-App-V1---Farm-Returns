import { describe, expect, it } from "vitest";
import { calculateNutrientPlan, NUTRIENT_ENGINE_VERSION } from "./nutrients";
import { tracked } from "./types";
import type { Field, LivestockGroup, NutrientPlan, SlurryAllocation } from "./types";
import type { SlurryComposition } from "./slurry-composition";

// Fertiliser Vertical Completion, Session 2b — the chemical product
// recommendation is sized from the canonical remaining requirement and
// carries an explicit `purchaseStatus`. Fully indexed grassland fields keep
// exactly the products, delivered supply and cost the paired path produced:
// the 192-case digest in `nutrients.test.ts` covers the silage matrix, and
// here the NAP delivered-supply total (still fed by the
// LEGACY_COMPATIBILITY_PATH blend) proves the published blend equals the
// legacy one for grazing and silage, with and without slurry, including
// every credit-not-counted case.
describe("Session 2b — canonical product recommendation (purchaseStatus)", () => {
  type Idx = 1 | 2 | 3 | 4;
  const base: Field = {
    id: "field-2b",
    farmId: "farm-2b",
    name: "2b Field",
    areaHa: 5,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "farmer_adjusted", "Farmer"),
    mappedSoil: { soilAssociation: "Fermoy", dominantSeries: "Brown Earth", texture: "Loam", drainage: "moderately_drained", coveragePct: 88, datasetVersion: "test", source: "test" },
    fertility: {},
    history: [],
  };
  const herd: LivestockGroup[] = [
    { id: "g1", farmId: "farm-2b", category: "suckler_cow", label: "Cows", count: tracked(40, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
  ];
  const indexed = (p: Idx | undefined, k: Idx | undefined): Field => ({
    ...base,
    fertility: { ...(p !== undefined ? { pIndex: tracked(p, "verified", "Lab") } : {}), ...(k !== undefined ? { kIndex: tracked(k, "verified", "Lab") } : {}) },
  });
  type Allocation = SlurryAllocation & { applicationMethodConflict?: boolean };
  const allocation = (extra: Partial<Allocation> = {}): Allocation => ({
    fieldId: base.id,
    housingId: "h1",
    priority: "high",
    volumeM3: 30 * base.areaHa,
    score: 90,
    ...extra,
  });
  const dated = (method: "LESS" | "splashplate" | "incorporate_24h", date: string): Allocation =>
    allocation({ applicationMethod: tracked(method, "farmer_adjusted", "F"), applicationDate: tracked(date, "farmer_adjusted", "F") });
  const neat = { volumeM3: 30 * base.areaHa, status: "farmer_adjusted" as const, source: "test", origin: "imported" as const };
  // LESS tables need a recorded DM% (6%, within their evidenced range).
  const slurryComposition: SlurryComposition = {
    id: "comp-2b",
    farmId: base.farmId,
    housingId: "h1",
    slurryType: "cattle_slurry",
    status: "verified",
    dmPct: 6,
    sampleDate: "2026-06-10",
    source: "Lab report",
    laboratory: "Lab",
    recordedAt: "2026-06-12T09:00:00.000Z",
  };
  const silage = { cutNumber: 1 as const, expectedYieldTDMha: 5, wasGrazedPreviousYear: false };
  type PlanInput = Parameters<typeof calculateNutrientPlan>[0];
  const plan = (field: Field, extra: Partial<PlanInput> = {}) =>
    calculateNutrientPlan({ field, farmGrasslandAreaHa: 20, livestockGroups: herd, slurryComposition, asOfDate: "2026-10-03", ...extra });

  // The NAP total counts the LEGACY blend's delivered N/P (plus the
  // statutory manure N/P for imported slurry) — compare the published blend.
  const expectPublishedEqualsLegacyBlend = (p: NutrientPlan) => {
    if (p.napCompliance.status !== "OK") throw new Error(`expected an OK NAP check, got ${JSON.stringify(p.napCompliance)}`);
    const manure = p.statutoryManureValue.status === "OK" ? p.statutoryManureValue.value : { availableNKgHa: 0, availablePKgHa: 0 };
    expect(p.deliveredKgHa.n).toBeCloseTo(p.napCompliance.value.nRequiredKgHa - manure.availableNKgHa, 9);
    expect(p.deliveredKgHa.p).toBeCloseTo(p.napCompliance.value.pRequiredKgHa - manure.availablePKgHa, 9);
  };

  it("engine version is bumped to v1.5.0", () => {
    expect(NUTRIENT_ENGINE_VERSION).toBe("nutrient_engine_v1.5.0");
    expect(plan(indexed(2, 2)).calculationVersion).toBe("nutrient_engine_v1.5.0");
  });

  const creditAssessed: [string, Allocation][] = [
    ["splashplate spring", dated("splashplate", "2027-03-15")],
    ["LESS spring", dated("LESS", "2027-03-15")],
    ["LESS summer", dated("LESS", "2027-06-10")],
  ];
  const creditNotCounted: [string, Allocation, string | undefined][] = [
    ["LESS late summer", dated("LESS", "2027-09-10"), "SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED"],
    ["splashplate summer (unsupported timing)", dated("splashplate", "2027-06-10"), "SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED"],
    ["unsupported method", dated("incorporate_24h", "2027-03-15"), "SLURRY_APPLICATION_CONTEXT_UNSUPPORTED_METHOD"],
    ["method conflict", allocation({ applicationMethodConflict: true }), undefined],
  ];

  for (const crop of ["grazing", "silage"] as const) {
    const cropInput: Partial<PlanInput> = crop === "silage" ? { silage } : {};
    for (const idx of [1, 2, 3, 4] as const) {
      it(`${crop} Index ${idx}, no slurry: sized from the remaining requirement, equal to the legacy blend`, () => {
        const p = plan(indexed(idx, idx), cropInput);
        expect(["RECOMMENDED", "NONE_NEEDED"]).toContain(p.purchaseStatus.status);
        expectPublishedEqualsLegacyBlend(p);
      });

      for (const [label, alloc] of creditAssessed) {
        it(`${crop} Index ${idx}, ${label}: credit counted, equal to the legacy blend`, () => {
          const p = plan(indexed(idx, idx), { ...cropInput, slurryAllocation: alloc, plannedRegulatoryNeatSlurry: neat });
          expect(p.organicApplication.availableNutrientAssessment.status).toBe("OK");
          expect(["RECOMMENDED", "NONE_NEEDED"]).toContain(p.purchaseStatus.status);
          expect(p.requirementProvisional.isProvisional).toBe(false);
          expectPublishedEqualsLegacyBlend(p);
        });
      }

      for (const [label, alloc, reason] of creditNotCounted) {
        it(`${crop} Index ${idx}, ${label}: RECOMMENDED_CREDIT_NOT_COUNTED, identical to the no-credit figures`, () => {
          const p = plan(indexed(idx, idx), { ...cropInput, slurryAllocation: alloc, plannedRegulatoryNeatSlurry: neat });
          const noSlurry = plan(indexed(idx, idx), cropInput);
          expect(p.purchaseStatus.status).toBe("RECOMMENDED_CREDIT_NOT_COUNTED");
          if (p.purchaseStatus.status === "RECOMMENDED_CREDIT_NOT_COUNTED" && reason !== undefined) expect(p.purchaseStatus.reasonCode).toBe(reason);
          expect(p.requirementProvisional.isProvisional).toBe(true);
          expect(p.purchasedProducts.length).toBeGreaterThan(0);
          expect(p.purchasedProducts).toEqual(noSlurry.purchasedProducts);
          expect(p.deliveredKgHa).toEqual(noSlurry.deliveredKgHa);
          expect(p.estimatedFieldCostEur).toBe(noSlurry.estimatedFieldCostEur);
        });
      }
    }
  }

  it("unresolved slurry composition: UNKNOWN with its reason, no products", () => {
    const p = plan(indexed(2, 2), {
      slurryAllocation: dated("LESS", "2027-03-15"),
      slurryCompositionUnresolved: { housingIds: ["h1", "h2"], compositionRecordIds: ["c1", "c2"] },
    });
    expect(p.purchaseStatus).toMatchObject({ status: "UNKNOWN", reasonCode: "SLURRY_COMPOSITION_SOURCES_UNRESOLVED" });
    expect(p.purchasedProducts).toEqual([]);
    expect(p.deliveredKgHa).toEqual({ n: 0, p: 0, k: 0 });
    expect(p.estimatedFieldCostEur).toBe(0);
  });

  it("mixed P/K (D3 a): WITHHELD_MIXED_EVIDENCE, no products, the known remaining arm still exposed", () => {
    const p = plan(indexed(2, undefined));
    expect(p.purchaseStatus).toEqual({ status: "WITHHELD_MIXED_EVIDENCE", reasonCode: "MIXED_SOIL_INDEX_EVIDENCE", missingInputs: ["fertility.kIndex"] });
    expect(p.purchasedProducts).toEqual([]);
    expect(p.estimatedFieldCostEur).toBe(0);
    expect(p.fieldRemainingRequirement.p.status).toBe("KNOWN");
    expect(p.fieldRemainingRequirement.k.status).toBe("UNKNOWN");
  });

  it("no index at all: UNKNOWN (MISSING_SOIL_FERTILITY_INDEX), no products", () => {
    const p = plan(indexed(undefined, undefined));
    expect(p.purchaseStatus).toEqual({ status: "UNKNOWN", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: ["fertility.pIndex", "fertility.kIndex"] });
    expect(p.purchasedProducts).toEqual([]);
  });

  it("tillage: NOT_APPLICABLE, the legacy grassland-table products retired", () => {
    const p = plan({ ...indexed(2, 2), plannedUse: tracked("tillage", "farmer_adjusted", "Farmer") });
    expect(p.purchaseStatus).toEqual({ status: "NOT_APPLICABLE", reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED" });
    expect(p.purchasedProducts).toEqual([]);
    expect(p.deliveredKgHa).toEqual({ n: 0, p: 0, k: 0 });
    expect(p.estimatedFieldCostEur).toBe(0);
    // The paired requirement keeps its legacy figure (LEGACY_COMPATIBILITY_PATH).
    expect(p.requirement.status).toBe("estimated");
  });

  it("grazing with no recorded livestock: UNKNOWN (MISSING_LIVESTOCK_DATA), no products", () => {
    const p = plan(indexed(2, 2), { livestockGroups: [] });
    expect(p.purchaseStatus).toEqual({ status: "UNKNOWN", reasonCode: "MISSING_LIVESTOCK_DATA", missingInputs: ["livestockGroups"] });
    expect(p.purchasedProducts).toEqual([]);
    expect(p.estimatedFieldCostEur).toBe(0);
  });

  it("grazing with no usable grassland area: UNKNOWN (MISSING_GRASSLAND_AREA), no products", () => {
    const p = plan(indexed(2, 2), { farmGrasslandAreaHa: 0 });
    expect(p.purchaseStatus).toEqual({ status: "UNKNOWN", reasonCode: "MISSING_GRASSLAND_AREA", missingInputs: ["farmGrasslandAreaHa"] });
    expect(p.purchasedProducts).toEqual([]);
  });

  it("a silage-planned field with no silage plan: UNKNOWN (MISSING_SILAGE_PLAN_DATA), no products", () => {
    const p = plan({ ...indexed(2, 2), plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Farmer") });
    expect(p.purchaseStatus).toMatchObject({ status: "UNKNOWN", reasonCode: "MISSING_SILAGE_PLAN_DATA" });
    expect(p.purchasedProducts).toEqual([]);
  });

  it("every remaining arm known and zero: NONE_NEEDED (REMAINING_ZERO)", () => {
    // Index 4 second cut, yield 0, 100 m3/ha spring LESS: the slurry credit
    // covers every arm.
    const p = plan(indexed(4, 4), {
      silage: { cutNumber: 2, expectedYieldTDMha: 0, wasGrazedPreviousYear: false },
      slurryAllocation: { ...dated("LESS", "2027-03-15"), volumeM3: 100 * base.areaHa },
    });
    const { n, p: pArm, k } = p.fieldRemainingRequirement;
    expect([n, pArm, k].every((arm) => arm.status === "KNOWN" && arm.kgHa === 0)).toBe(true);
    expect(p.purchaseStatus).toEqual({ status: "NONE_NEEDED", basis: "REMAINING_ZERO" });
    expect(p.purchasedProducts).toEqual([]);
  });

  it("commonage: PROHIBITED whatever the requirement (also with no recorded livestock)", () => {
    const commonage: Field = { ...indexed(2, 2), commonageStatus: tracked("commonage", "verified", "Farmer") };
    expect(plan(commonage).purchaseStatus).toEqual({ status: "PROHIBITED", reasonCode: "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED" });
    expect(plan(commonage, { livestockGroups: [] }).purchaseStatus).toEqual({ status: "PROHIBITED", reasonCode: "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED" });
    expect(plan(commonage).purchasedProducts).toEqual([]);
  });

  it("water buffer prohibition of a sized blend: PROHIBITED, no products", () => {
    // Surface water at 2 m: below chemical fertiliser's 3 m.
    const waterBufferContext = tracked({ featureType: "surface_water" as const, distanceM: 2, localOverrideStatus: "verified_none" as const }, "farmer_adjusted", "F");
    const p = plan({ ...indexed(2, 2), waterBufferContext });
    expect(p.nationalBufferDistanceStatus.status).toBe("LEGAL_PROHIBITION");
    expect(p.purchaseStatus).toEqual({ status: "PROHIBITED", reasonCode: "WATER_BUFFER_CHEMICAL_FERTILISER_PROHIBITED" });
    expect(p.purchasedProducts).toEqual([]);
  });

  it("buffer isolation (CC-B5): retired and withheld fields keep the buffer material the legacy blend decides", () => {
    // Surface water at 4 m: chemical (3 m) met, organic (5 m) not — so the
    // result reveals which material the statutory check saw.
    const waterBufferContext = tracked({ featureType: "surface_water" as const, distanceM: 4, localOverrideStatus: "verified_none" as const }, "farmer_adjusted", "F");
    const met = { status: "OK", value: "BOUNDARY_MET_SUBJECT_TO_OTHER_RULES", evidenceState: "DERIVED" };
    const withSlurry = { slurryAllocation: dated("LESS", "2027-03-15") };
    // No products are published, but the legacy blend is non-empty, so the
    // chemical-fertiliser buffer still applies, exactly as before.
    for (const p of [
      plan({ ...indexed(2, 2), plannedUse: tracked("tillage", "farmer_adjusted", "Farmer"), waterBufferContext }, withSlurry),
      plan({ ...indexed(2, 2), waterBufferContext }, { ...withSlurry, livestockGroups: [] }),
      plan({ ...indexed(2, undefined), waterBufferContext }, withSlurry),
    ]) {
      expect(p.purchasedProducts).toEqual([]);
      expect(p.nationalBufferDistanceStatus).toEqual(met);
    }
  });
});
