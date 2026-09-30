import { describe, expect, it } from "vitest";
import { calculateNutrientPlan, NUTRIENT_ENGINE_VERSION } from "./nutrients";
import { buildSlurryRateAllocation, SLURRY_RATE_ALLOCATION_VERSION, type RateConstraintRecord, type SlurryRateAllocation } from "./slurry-rate-allocation";
import { tracked } from "./types";
import type { Field } from "./types";
import type { SlurryComposition } from "./slurry-composition";

// Campaign C rate/allocation architecture (RATE_ALLOCATION_ARCHITECTURE.md).
// Not wired into production: these tests pin the layer's own behaviour and
// that the production plan it consumes is unchanged.

const field: Field = {
  id: "field-rate",
  farmId: "farm-test",
  name: "Rate Field",
  areaHa: 5,
  centroid: [0, 0],
  plannedUse: tracked("silage_1st_cut", "farmer_adjusted", "Keith"),
  fertility: {
    pIndex: tracked(3, "verified", "Lab"),
    kIndex: tracked(3, "verified", "Lab"),
  },
  history: [],
};

const lessComposition: SlurryComposition = {
  id: "comp-rate",
  farmId: field.farmId,
  housingId: "housing-1",
  slurryType: "cattle_slurry",
  status: "verified",
  dmPct: 6,
  sampleDate: "2026-06-10",
  source: "Lab report",
  recordedAt: "2026-06-12T09:00:00.000Z",
};

function lessPlan(fertility: Field["fertility"], rateM3ha = 33) {
  return calculateNutrientPlan({
    field: { ...field, fertility },
    farmGrasslandAreaHa: 20,
    livestockGroups: [],
    slurryAllocation: {
      fieldId: field.id,
      housingId: "housing-1",
      priority: "high",
      volumeM3: rateM3ha * field.areaHa,
      score: 90,
      applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"),
    },
    silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
    slurryComposition: lessComposition,
  });
}

function constraint(allocation: SlurryRateAllocation, id: string): RateConstraintRecord {
  const found = allocation.rateConstraints.find((c) => c.constraintId === id);
  if (found === undefined) throw new Error(`missing constraint ${id}`);
  return found;
}

describe("buildSlurryRateAllocation — separate concepts, no production effect", () => {
  it("keeps requirement, available nutrient, share limit, allocated credit and remaining chemical requirement separate", () => {
    const plan = lessPlan({ pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(1, "verified", "Lab") }, 80);
    const allocation = buildSlurryRateAllocation({ plan });

    expect(allocation.cropRequirement.P).toEqual({ status: "known", value: 30, unit: "kg/ha" });
    expect(allocation.cropRequirement.K).toEqual({ status: "known", value: 185, unit: "kg/ha" });
    // Availability factors applied upstream and unchanged: P 0.5 x 80 x 0.50, K 3.5 x 80 x 0.90.
    expect(allocation.availableSlurryNutrient.P).toEqual({ status: "known", value: 20, unit: "kg/ha" });
    expect(allocation.availableSlurryNutrient.K).toMatchObject({ status: "known" });
    if (allocation.availableSlurryNutrient.K.status === "known") expect(allocation.availableSlurryNutrient.K.value).toBeCloseTo(252);
    // Share limits: 50% of 30 P; 75% of 185 K — requirement shares, not factors.
    expect(allocation.organicShareLimit.P).toEqual({ status: "known", value: 15, unit: "kg/ha" });
    expect(allocation.organicShareLimit.K).toEqual({ status: "known", value: 138.75, unit: "kg/ha" });
    // No double reduction: the allocated credit is the production offset, uncapped.
    expect(allocation.organicAllocatedNutrient.shareCapApplied).toBe(false);
    expect(allocation.organicAllocatedNutrient.P).toEqual({ status: "known", value: plan.organicApplication.offsetP, unit: "kg/ha" });
    expect(allocation.organicAllocatedNutrient.K).toEqual({ status: "known", value: plan.organicApplication.offsetK, unit: "kg/ha" });
    expect(allocation.remainingChemicalRequirement.P).toEqual({ status: "known", value: plan.netRequirement.value.p, unit: "kg/ha" });
    expect(allocation.affectsProductionOutput).toBe(false);
    expect(allocation.rateConstraints.every((c) => c.affectsProductionOutput === false)).toBe(true);
  });

  it("does not mutate or re-derive the production plan (engine version unchanged)", () => {
    const plan = lessPlan({ pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(1, "verified", "Lab") });
    const before = JSON.stringify(plan);
    const allocation = buildSlurryRateAllocation({ plan });
    expect(JSON.stringify(plan)).toBe(before);
    expect(plan.calculationVersion).toBe("nutrient_engine_v1.2.0");
    expect(NUTRIENT_ENGINE_VERSION).toBe("nutrient_engine_v1.2.0");
    expect(allocation.upstreamCalculationVersion).toBe(NUTRIENT_ENGINE_VERSION);
    expect(allocation.calculationVersion).toBe(SLURRY_RATE_ALLOCATION_VERSION);
    // CC-B2 values unchanged: 33 m3/ha 6% LESS at P2/K1 -> P 8, K 104.
    expect(plan.organicApplication.offsetP).toBe(8);
    expect(plan.organicApplication.offsetK).toBe(104);
  });
});

describe("organic-share caps (Phase 3) — IMPLEMENTATION_DEFERRED_RULE_INTERACTION_PROVISIONAL on Index 1/2", () => {
  it("records the verified limit with provenance but leaves binding UNDETERMINED", () => {
    const allocation = buildSlurryRateAllocation({ plan: lessPlan({ pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(1, "verified", "Lab") }, 80) });
    const shareP = constraint(allocation, "ORGANIC_SHARE_LIMIT_P");
    expect(shareP).toMatchObject({
      kind: "ORGANIC_SHARE_LIMIT",
      ruleId: "CC_ORGANIC_SHARE_P_INDEX_1_2",
      evidenceClass: "REPOSITORY_VERIFIED",
      binding: "UNDETERMINED",
      deferral: "IMPLEMENTATION_DEFERRED_RULE_INTERACTION_PROVISIONAL",
      calculationVersion: SLURRY_RATE_ALLOCATION_VERSION,
      limit: { status: "known", value: 15 },
      output: { status: "unknown" },
    });
    expect(shareP.sourceClaimIds).toEqual(["CLM-TGC-OM-SHARE-P", "CLM-AIR-CONF03-SHARE"]);
    expect(constraint(allocation, "ORGANIC_SHARE_LIMIT_K")).toMatchObject({ binding: "UNDETERMINED", limit: { status: "known", value: 138.75 } });
    expect(allocation.bindingConstraintIds).not.toContain("ORGANIC_SHARE_LIMIT_P");
  });

  it("evaluates Index 3 (100% share, no availability factor) without any interaction question", () => {
    const allocation = buildSlurryRateAllocation({ plan: lessPlan({ pIndex: tracked(3, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab") }, 80) });
    // Index 3: P requirement 20, available 0.5 x 80 = 40 -> excess 20.
    expect(constraint(allocation, "ORGANIC_SHARE_LIMIT_P")).toMatchObject({ binding: "BINDING", limit: { status: "known", value: 20 }, output: { status: "known", value: 20 } });
  });

  it("Index 4 has no stated share: unknown, never assumed", () => {
    const allocation = buildSlurryRateAllocation({ plan: lessPlan({ pIndex: tracked(4, "verified", "Lab"), kIndex: tracked(4, "verified", "Lab") }) });
    expect(allocation.organicShareLimit.P.status).toBe("unknown");
    expect(constraint(allocation, "ORGANIC_SHARE_LIMIT_P")).toMatchObject({ binding: "UNDETERMINED", deferral: "SOURCE_DOES_NOT_ADDRESS_INDEX_4" });
  });
});

describe("rate constraints and selector (Phases 4, 5)", () => {
  it("P/K requirement limits are evaluated from verified principles and exposed as binding", () => {
    const allocation = buildSlurryRateAllocation({ plan: lessPlan({ pIndex: tracked(3, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab") }, 80) });
    const p = constraint(allocation, "P_REQUIREMENT_LIMIT");
    expect(p).toMatchObject({ kind: "P_REQUIREMENT_LIMIT", evidenceClass: "REPOSITORY_VERIFIED", binding: "BINDING", output: { status: "known", value: 20 } });
    expect(p.sourceClaimIds).toContain("CLM-TGC-OM-EXCESS");
    // K: requirement 125, available 3.5 x 80 = 280.
    expect(constraint(allocation, "K_REQUIREMENT_LIMIT")).toMatchObject({ binding: "BINDING", output: { status: "known", value: 155 } });
    expect(allocation.bindingConstraintIds).toEqual(["P_REQUIREMENT_LIMIT", "K_REQUIREMENT_LIMIT", "ORGANIC_SHARE_LIMIT_P", "ORGANIC_SHARE_LIMIT_K"]);
  });

  it("never selects a final rate (no min(P, K) selector)", () => {
    const allocation = buildSlurryRateAllocation({ plan: lessPlan({ pIndex: tracked(3, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab") }, 80) });
    expect(allocation.finalAllowedRate).toMatchObject({
      status: "DEFERRED",
      deferral: "RATE_SELECTOR_IMPLEMENTATION_DEFERRED_PROVISIONAL",
      rate: { status: "unknown" },
    });
    expect(allocation.plannedRateM3ha).toBe(80);
  });

  it("records the 90 kg K spring guidance without enforcing it or truncating slurry K", () => {
    const plan = lessPlan({ pIndex: tracked(3, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab") });
    const allocation = buildSlurryRateAllocation({ plan });
    expect(constraint(allocation, "K_SPRING_GUIDANCE_90")).toMatchObject({
      binding: "NOT_ENFORCED",
      deferral: "RULE_RECORDED_IMPLEMENTATION_DEFERRED_PROVISIONAL",
      limit: { status: "known", value: 90 },
      output: { status: "known", value: 35 },
    });
    // CONF-02: 33 m3/ha 6% LESS at K Index 3 keeps its full 115.5 kg/ha K.
    expect(allocation.availableSlurryNutrient.K).toMatchObject({ status: "known" });
    if (allocation.availableSlurryNutrient.K.status === "known") expect(allocation.availableSlurryNutrient.K.value).toBeCloseTo(115.5);
    expect(allocation.bindingConstraintIds).not.toContain("K_SPRING_GUIDANCE_90");
  });

  it("unsupplied regulatory/timing/weather/operational constraints are NOT_EVALUATED, not absent", () => {
    const allocation = buildSlurryRateAllocation({ plan: lessPlan({ pIndex: tracked(3, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab") }) });
    for (const kind of ["REGULATORY_LIMIT", "TIMING_LIMIT", "WEATHER_LIMIT", "OPERATIONAL_LIMIT"]) {
      expect(constraint(allocation, kind)).toMatchObject({ binding: "NOT_EVALUATED", limit: { status: "unknown" } });
    }
  });

  it("records a supplied external constraint with its own provenance and rejects duplicates", () => {
    const plan = lessPlan({ pIndex: tracked(3, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab") });
    const regulatory = {
      kind: "REGULATORY_LIMIT" as const,
      ruleId: "TEST_REGULATORY_RULE",
      sourceClaimIds: ["TEST-CLAIM"],
      calculationVersion: "test_v1",
      limit: { status: "unknown" as const, reason: "test" },
      binding: "BINDING" as const,
      reason: "test regulatory limit",
    };
    const allocation = buildSlurryRateAllocation({ plan, externalConstraints: [regulatory] });
    expect(constraint(allocation, "REGULATORY_LIMIT")).toMatchObject({ ruleId: "TEST_REGULATORY_RULE", calculationVersion: "test_v1", evidenceClass: "EXTERNAL_MODULE", binding: "BINDING" });
    expect(allocation.bindingConstraintIds).toContain("REGULATORY_LIMIT");
    expect(() => buildSlurryRateAllocation({ plan, externalConstraints: [regulatory, regulatory] })).toThrow(/Duplicate/);
  });
});

describe("unknown evidence stays unknown (CC-B2 / CC-B4A preserved)", () => {
  it("a missing K index keeps slurry N and withholds P and K together", () => {
    const plan = lessPlan({ pIndex: tracked(2, "verified", "Lab") });
    expect(plan.organicApplication.availableNutrientAssessment).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_FERTILITY_INDEX" });
    const allocation = buildSlurryRateAllocation({ plan });
    expect(allocation.availableSlurryNutrient.N).toEqual({ status: "known", value: plan.organicApplication.offsetN, unit: "kg/ha" });
    expect(plan.organicApplication.offsetN).toBeGreaterThan(0);
    expect(allocation.availableSlurryNutrient.P.status).toBe("unknown");
    expect(allocation.availableSlurryNutrient.K.status).toBe("unknown");
    expect(allocation.cropRequirement.P.status).toBe("unknown");
    expect(allocation.organicShareLimit.P.status).toBe("unknown");
    expect(allocation.organicAllocatedNutrient.P.status).toBe("unknown");
    expect(constraint(allocation, "P_REQUIREMENT_LIMIT").binding).toBe("UNDETERMINED");
    expect(allocation.bindingConstraintIds).toEqual([]);
  });

  it("a splashplate plan with a missing P index is handled the same way (CC-B4A)", () => {
    const plan = calculateNutrientPlan({
      field: { ...field, fertility: { kIndex: tracked(2, "verified", "Lab") } },
      farmGrasslandAreaHa: 20,
      livestockGroups: [],
      slurryAllocation: { fieldId: field.id, housingId: "housing-1", priority: "high", volumeM3: 33 * field.areaHa, score: 90, applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith") },
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
    });
    const allocation = buildSlurryRateAllocation({ plan });
    expect(allocation.availableSlurryNutrient.N.status).toBe("known");
    expect(allocation.availableSlurryNutrient.P.status).toBe("unknown");
    expect(allocation.availableSlurryNutrient.K.status).toBe("unknown");
  });

  it("no slurry planned is a real zero, not an unknown", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 20,
      livestockGroups: [],
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
    });
    const allocation = buildSlurryRateAllocation({ plan });
    expect(allocation.plannedRateM3ha).toBe(0);
    expect(allocation.availableSlurryNutrient.P).toEqual({ status: "known", value: 0, unit: "kg/ha" });
    expect(constraint(allocation, "P_REQUIREMENT_LIMIT").binding).toBe("NOT_BINDING");
  });
});
