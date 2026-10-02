import { describe, expect, it } from "vitest";
import { calculateNutrientPlan, NUTRIENT_ENGINE_VERSION } from "./nutrients";
import { buildSlurryRateAllocation, SLURRY_RATE_ALLOCATION_VERSION, type RateConstraintRecord, type SlurryRateAllocation } from "./slurry-rate-allocation";
import { tracked } from "./types";
import type { Field, FieldNutrientRequirementArm, LivestockGroup } from "./types";
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

const cows: LivestockGroup = {
  id: "g1",
  farmId: "farm-test",
  category: "suckler_cow",
  label: "Cows",
  count: tracked(20, "verified", "Farmer"),
  system: "grazing",
  value: tracked(30000, "estimated", "Farm Return estimate"),
};

function lessPlan(fertility: Field["fertility"], rateM3ha = 33, expectedYieldTDMha = 5) {
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
    silage: { cutNumber: 1, expectedYieldTDMha, wasGrazedPreviousYear: false },
    slurryComposition: lessComposition,
  });
}

function constraint(allocation: SlurryRateAllocation, id: string): RateConstraintRecord {
  const found = allocation.rateConstraints.find((c) => c.constraintId === id);
  if (found === undefined) throw new Error(`missing constraint ${id}`);
  return found;
}

function knownArmKgHa(arm: FieldNutrientRequirementArm | SlurryRateAllocation["remainingChemicalRequirement"]["p"]): number {
  if (arm.status !== "KNOWN") throw new Error(`expected a KNOWN arm, got ${arm.status}`);
  return arm.kgHa;
}

describe("buildSlurryRateAllocation — separate concepts, no production effect", () => {
  it("keeps requirement, available nutrient, share limit, allocated credit, excess and remaining chemical requirement separate", () => {
    const plan = lessPlan({ pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(1, "verified", "Lab") }, 80);
    const allocation = buildSlurryRateAllocation({ plan });

    // Canonical requirement arms, unmodified (Increment 2c).
    expect(allocation.requirement).toEqual({ contractVersion: "field_nutrient_requirement_v1", n: plan.fieldRequirement.n, p: plan.fieldRequirement.p, k: plan.fieldRequirement.k });
    expect(knownArmKgHa(allocation.requirement.p)).toBe(30);
    expect(knownArmKgHa(allocation.requirement.k)).toBe(185);
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
    // Organic excess: P none (20 <= 30); K 252 - 185.
    expect(allocation.organicExcessOverRequirement.P).toEqual({ status: "known", value: 0, unit: "kg/ha" });
    expect(allocation.organicExcessOverRequirement.K).toMatchObject({ status: "known" });
    if (allocation.organicExcessOverRequirement.K.status === "known") expect(allocation.organicExcessOverRequirement.K.value).toBeCloseTo(67);
    // Canonical remaining arms, unmodified; rounding to the paired net.
    expect(allocation.remainingChemicalRequirement).toEqual({
      contractVersion: "field_nutrient_remaining_v1",
      n: plan.fieldRemainingRequirement.n,
      p: plan.fieldRemainingRequirement.p,
      k: plan.fieldRemainingRequirement.k,
    });
    expect(Math.round(knownArmKgHa(allocation.remainingChemicalRequirement.p))).toBe(plan.netRequirement.value.p);
    expect(allocation.plannedApplication).toEqual({ status: "PLANNED", rateM3ha: 80, totalM3: plan.organicApplication.totalM3, basis: plan.organicApplication.availableNutrientBasis });
    expect(allocation.affectsProductionOutput).toBe(false);
    expect(allocation.rateConstraints.every((c) => c.affectsProductionOutput === false)).toBe(true);
  });

  it("does not mutate or re-derive the production plan (engine version unchanged)", () => {
    const plan = lessPlan({ pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(1, "verified", "Lab") });
    const before = JSON.stringify(plan);
    const allocation = buildSlurryRateAllocation({ plan });
    expect(JSON.stringify(plan)).toBe(before);
    expect(plan.calculationVersion).toBe("nutrient_engine_v1.4.0");
    expect(NUTRIENT_ENGINE_VERSION).toBe("nutrient_engine_v1.4.0");
    expect(allocation.upstreamCalculationVersion).toBe(NUTRIENT_ENGINE_VERSION);
    expect(allocation.calculationVersion).toBe(SLURRY_RATE_ALLOCATION_VERSION);
    expect(SLURRY_RATE_ALLOCATION_VERSION).toBe("slurry_rate_allocation_v0.3.0-draft");
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
    // The excess is the requirement-limit record's output.
    expect(allocation.organicExcessOverRequirement.P).toEqual(p.output);
    expect(allocation.organicExcessOverRequirement.K).toEqual(constraint(allocation, "K_REQUIREMENT_LIMIT").output);
  });

  it("never selects a final rate (no min(P, K) selector)", () => {
    const allocation = buildSlurryRateAllocation({ plan: lessPlan({ pIndex: tracked(3, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab") }, 80) });
    expect(allocation.finalAllowedRate).toMatchObject({
      status: "DEFERRED",
      deferral: "RATE_SELECTOR_IMPLEMENTATION_DEFERRED_PROVISIONAL",
      rate: { status: "unknown" },
    });
    expect(allocation.plannedRateM3ha).toBe(80);
    expect(allocation.plannedApplication).toMatchObject({ status: "PLANNED", rateM3ha: 80 });
  });

  it("records the 90 kg K spring guidance without enforcing it or truncating slurry K", () => {
    const plan = lessPlan({ pIndex: tracked(3, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab") });
    const allocation = buildSlurryRateAllocation({ plan, plannedUse: "silage_1st_cut" });
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

  it("evaluates the first-cut 90 kg K guidance only for a first-cut silage plan (audit F002)", () => {
    const secondCut = calculateNutrientPlan({
      field: { ...field, plannedUse: tracked("silage_2nd_cut", "farmer_adjusted", "Keith") },
      farmGrasslandAreaHa: 20,
      livestockGroups: [],
      silage: { cutNumber: 2, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
    });
    expect(secondCut.requirement.status).not.toBe("unavailable");
    for (const plannedUse of ["silage_2nd_cut", "grazing", undefined] as const) {
      const allocation = buildSlurryRateAllocation({ plan: secondCut, plannedUse });
      const record = constraint(allocation, "K_SPRING_GUIDANCE_90");
      expect(record).toMatchObject({ binding: "NOT_EVALUATED", output: { status: "unknown" } });
      expect(record.deferral).toBeUndefined();
      expect(record.input.scope).toBeUndefined();
    }
  });

  it("compares exactly against the unrounded requirement — no rounding interval (Increment 2c; replaces audit F001's UNDETERMINED band)", () => {
    const index3: Field["fertility"] = { pIndex: tracked(3, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab") };
    // Unrounded P requirement 20.4 (published 20) vs available 20.25: not an excess.
    const belowPlan = lessPlan(index3, 40.5, 5.1);
    const below = buildSlurryRateAllocation({ plan: belowPlan });
    expect(below.availableSlurryNutrient.P).toMatchObject({ status: "known", value: 20.25 });
    expect(knownArmKgHa(below.requirement.p)).toBeCloseTo(20.4);
    expect(belowPlan.requirementByNutrient.p).toMatchObject({ status: "OK", value: 20 });
    expect(constraint(below, "P_REQUIREMENT_LIMIT")).toMatchObject({ binding: "NOT_BINDING", output: { status: "known", value: 0 } });
    expect(constraint(below, "ORGANIC_SHARE_LIMIT_P")).toMatchObject({ binding: "NOT_BINDING", output: { status: "known", value: 0 } });
    expect(below.organicExcessOverRequirement.P).toEqual({ status: "known", value: 0, unit: "kg/ha" });
    expect(knownArmKgHa(below.remainingChemicalRequirement.p)).toBeCloseTo(0.15);
    // Unrounded P requirement 20.6 (published 21) vs available 20.75: an actual excess.
    const abovePlan = lessPlan(index3, 41.5, 5.15);
    const above = buildSlurryRateAllocation({ plan: abovePlan });
    expect(above.availableSlurryNutrient.P).toMatchObject({ status: "known", value: 20.75 });
    expect(knownArmKgHa(above.requirement.p)).toBeCloseTo(20.6);
    expect(abovePlan.requirementByNutrient.p).toMatchObject({ status: "OK", value: 21 });
    const p = constraint(above, "P_REQUIREMENT_LIMIT");
    expect(p.binding).toBe("BINDING");
    expect(p.output.status === "known" && p.output.value).toBeCloseTo(0.15);
    expect(constraint(above, "ORGANIC_SHARE_LIMIT_P").binding).toBe("BINDING");
    expect(above.bindingConstraintIds).toContain("P_REQUIREMENT_LIMIT");
    expect(above.organicExcessOverRequirement.P).toEqual(p.output);
    expect(above.remainingChemicalRequirement.p).toMatchObject({ status: "KNOWN", kgHa: 0 });
  });

  it("available exactly equal to the requirement is not an excess (zero excess, NOT_BINDING)", () => {
    // Index 3, yield 5: P requirement 20; 0.5 kg P/m3 x 40 m3/ha = 20.
    const allocation = buildSlurryRateAllocation({ plan: lessPlan({ pIndex: tracked(3, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab") }, 40) });
    expect(knownArmKgHa(allocation.requirement.p)).toBe(20);
    expect(allocation.availableSlurryNutrient.P).toEqual({ status: "known", value: 20, unit: "kg/ha" });
    expect(constraint(allocation, "P_REQUIREMENT_LIMIT")).toMatchObject({ binding: "NOT_BINDING", output: { status: "known", value: 0 } });
    expect(allocation.organicExcessOverRequirement.P).toEqual({ status: "known", value: 0, unit: "kg/ha" });
    expect(allocation.remainingChemicalRequirement.p).toMatchObject({ status: "KNOWN", kgHa: 0 });
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
      input: { plannedRate: { status: "known" as const, value: 33, unit: "m3/ha" as const }, windowId: "TEST_WINDOW" },
      limit: { status: "known" as const, value: 30, unit: "m3/ha" as const },
      output: { status: "known" as const, value: 28, unit: "m3/ha" as const },
      binding: "BINDING" as const,
      reason: "test regulatory limit",
    };
    const allocation = buildSlurryRateAllocation({ plan, externalConstraints: [regulatory] });
    expect(constraint(allocation, "REGULATORY_LIMIT")).toMatchObject({ ruleId: "TEST_REGULATORY_RULE", calculationVersion: "test_v1", evidenceClass: "EXTERNAL_MODULE", binding: "BINDING" });
    expect(constraint(allocation, "REGULATORY_LIMIT")?.input).toEqual(regulatory.input);
    expect(constraint(allocation, "REGULATORY_LIMIT")?.output).toEqual(regulatory.output);
    expect(constraint(allocation, "REGULATORY_LIMIT")?.limit).toEqual(regulatory.limit);
    expect(allocation.bindingConstraintIds).toContain("REGULATORY_LIMIT");
    expect(() => buildSlurryRateAllocation({ plan, externalConstraints: [regulatory, regulatory] })).toThrow(/Duplicate/);
  });
});

describe("unknown evidence stays unknown (CC-B2 / CC-B4A preserved)", () => {
  // Per-nutrient P/K Increment 4: the known nutrient is no longer withheld
  // with the unknown one; the unknown nutrient stays unknown.
  it("a missing K index keeps slurry N and known P, and withholds only K", () => {
    const plan = lessPlan({ pIndex: tracked(2, "verified", "Lab") });
    expect(plan.organicApplication.availableNutrientAssessment).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "MISSING_SOIL_FERTILITY_INDEX" });
    const allocation = buildSlurryRateAllocation({ plan });
    expect(allocation.availableSlurryNutrient.N).toEqual({ status: "known", value: plan.organicApplication.offsetN, unit: "kg/ha" });
    expect(plan.organicApplication.offsetN).toBeGreaterThan(0);
    expect(allocation.availableSlurryNutrient.P.status).toBe("known");
    expect(allocation.availableSlurryNutrient.K).toEqual({ status: "unknown", reason: "slurry nutrient assessment BLOCKED_INSUFFICIENT_EVIDENCE (MISSING_SOIL_FERTILITY_INDEX)" });
    expect(allocation.requirement.p.status).toBe("KNOWN");
    expect(allocation.requirement.k.status).toBe("UNKNOWN");
    expect(allocation.organicShareLimit.P.status).toBe("known");
    expect(allocation.organicShareLimit.K.status).toBe("unknown");
    // The production plan counts P and K credit together: no P credit is counted.
    expect(allocation.organicAllocatedNutrient.P.status).toBe("unknown");
    expect(allocation.organicAllocatedNutrient.K.status).toBe("unknown");
    expect(constraint(allocation, "K_REQUIREMENT_LIMIT").binding).toBe("UNDETERMINED");
    expect(allocation.bindingConstraintIds).not.toContain("K_REQUIREMENT_LIMIT");
  });

  it("a splashplate plan with a missing P index keeps N and known K, and withholds only P (CC-B4A)", () => {
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
    expect(allocation.availableSlurryNutrient.K.status).toBe("known");
  });

  it("no slurry planned is a real zero, not an unknown: zero excess, remaining equals the requirement", () => {
    const plan = calculateNutrientPlan({
      field,
      farmGrasslandAreaHa: 20,
      livestockGroups: [],
      silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false },
    });
    const allocation = buildSlurryRateAllocation({ plan });
    expect(allocation.plannedRateM3ha).toBe(0);
    expect(allocation.plannedApplication).toEqual({ status: "NONE_PLANNED" });
    expect(allocation.availableSlurryNutrient.P).toEqual({ status: "known", value: 0, unit: "kg/ha" });
    expect(constraint(allocation, "P_REQUIREMENT_LIMIT").binding).toBe("NOT_BINDING");
    for (const nutrient of ["N", "P", "K"] as const) {
      expect(allocation.organicExcessOverRequirement[nutrient]).toEqual({ status: "known", value: 0, unit: "kg/ha" });
    }
    for (const nutrient of ["n", "p", "k"] as const) {
      expect(allocation.remainingChemicalRequirement[nutrient]).toMatchObject({ status: "KNOWN", creditBasis: "NO_SLURRY_PLANNED", kgHa: knownArmKgHa(allocation.requirement[nutrient]) });
    }
  });
});

// Per-nutrient P/K Increment 4 (PER_NUTRIENT_PK_DESIGN.md §4 row 4): the
// layer reads the per-nutrient arms. Driven by real `calculateNutrientPlan`
// output only.

interface SlurryContext {
  label: string;
  method?: "LESS" | "splashplate" | "other";
  date?: string;
  composition?: SlurryComposition;
  unresolved?: boolean;
}

const SUPPORTED_CONTEXTS: readonly SlurryContext[] = [
  { label: "spring LESS", method: "LESS", composition: lessComposition },
  { label: "summer LESS", method: "LESS", date: "2026-06-15", composition: lessComposition },
  { label: "splashplate", method: "splashplate" },
  { label: "assumed method", composition: lessComposition },
];

const TABLE_BLOCKED_CONTEXTS: readonly SlurryContext[] = [
  { label: "unsupported method", method: "other" },
  { label: "unsupported timing", method: "LESS", date: "2026-08-20", composition: lessComposition },
  { label: "unsupported DM%", method: "LESS", composition: { ...lessComposition, dmPct: 5.5 } },
  { label: "unresolved composition", method: "LESS", composition: lessComposition, unresolved: true },
];

const INDICES = [1, 2, 3, 4] as const;

interface PlanOptions {
  rateM3ha?: number;
  silage?: boolean;
  plannedUse?: Field["plannedUse"];
  livestockGroups?: LivestockGroup[];
  farmGrasslandAreaHa?: number;
}

function contextPlan(fertility: Field["fertility"], context: SlurryContext, options: PlanOptions = {}) {
  const rateM3ha = options.rateM3ha ?? 33;
  return calculateNutrientPlan({
    field: { ...field, fertility, ...("plannedUse" in options ? { plannedUse: options.plannedUse } : {}) },
    farmGrasslandAreaHa: options.farmGrasslandAreaHa ?? 20,
    livestockGroups: options.livestockGroups ?? [],
    slurryAllocation: {
      fieldId: field.id,
      housingId: "housing-1",
      priority: "high",
      volumeM3: rateM3ha * field.areaHa,
      score: 90,
      ...(context.method === undefined ? {} : { applicationMethod: tracked(context.method, "farmer_adjusted", "Keith") }),
      ...(context.date === undefined ? {} : { applicationDate: tracked(context.date, "farmer_adjusted", "Keith") }),
    },
    ...(options.silage === false ? {} : { silage: { cutNumber: 1, expectedYieldTDMha: 5, wasGrazedPreviousYear: false } }),
    ...(context.composition === undefined ? {} : { slurryComposition: context.composition }),
    ...(context.unresolved ? { slurryCompositionUnresolved: { housingIds: ["housing-1", "housing-2"], compositionRecordIds: ["comp-a", "comp-b"] } } : {}),
  });
}

function fertilityOf(p: 1 | 2 | 3 | 4 | undefined, k: 1 | 2 | 3 | 4 | undefined): Field["fertility"] {
  return {
    ...(p === undefined ? {} : { pIndex: tracked(p, "verified", "Lab") }),
    ...(k === undefined ? {} : { kIndex: tracked(k, "verified", "Lab") }),
  };
}

function knownKgHa(value: number) {
  return { status: "known", value, unit: "kg/ha" };
}

/** The records of one nutrient: everything the layer derives for it. */
function nutrientRecords(allocation: SlurryRateAllocation, nutrient: "P" | "K") {
  const lower = nutrient === "P" ? "p" : "k";
  return {
    requirement: allocation.requirement[lower],
    availableSlurryNutrient: allocation.availableSlurryNutrient[nutrient],
    organicShareLimit: allocation.organicShareLimit[nutrient],
    organicExcess: allocation.organicExcessOverRequirement[nutrient],
    remainingChemicalRequirement: allocation.remainingChemicalRequirement[lower],
    requirementLimit: constraint(allocation, `${nutrient}_REQUIREMENT_LIMIT`),
    shareLimit: constraint(allocation, `ORGANIC_SHARE_LIMIT_${nutrient}`),
  };
}

/** The P/K requirement limits and organic excess the layer must report for
 * a known requirement and known available nutrient: an exact comparison. */
function expectExactRequirementLimit(allocation: SlurryRateAllocation, nutrient: "P" | "K", label: string) {
  const records = nutrientRecords(allocation, nutrient);
  const requirementKgHa = knownArmKgHa(records.requirement);
  if (records.availableSlurryNutrient.status !== "known") throw new Error(`${label}: available ${nutrient} unknown`);
  const available = records.availableSlurryNutrient.value;
  expect(records.requirementLimit.binding, label).toBe(available > requirementKgHa ? "BINDING" : "NOT_BINDING");
  expect(records.requirementLimit.output, label).toEqual(knownKgHa(Math.max(0, available - requirementKgHa)));
  expect(records.organicExcess, label).toEqual(records.requirementLimit.output);
  // Remaining and excess read the same operands: at most one is positive.
  expect(records.remainingChemicalRequirement, label).toMatchObject({ status: "KNOWN", requirementKgHa, creditKgHa: available, kgHa: Math.max(0, requirementKgHa - available) });
}

describe("canonical remap — fully indexed fields (Increment 2c)", () => {
  it("records equal the v0.2.0 layer's except the version, canonical requirement/remaining, exact comparisons and the new fields", () => {
    for (const context of SUPPORTED_CONTEXTS) {
      for (const p of INDICES) {
        for (const k of INDICES) {
          const label = `${context.label} P${p} K${k}`;
          const plan = contextPlan(fertilityOf(p, k), context);
          const assessment = plan.organicApplication.availableNutrientAssessment;
          expect(assessment.status, label).toBe("OK");
          if (assessment.status !== "OK") continue;
          const allocation = buildSlurryRateAllocation({ plan, plannedUse: "silage_1st_cut" });
          const { requirement, netRequirement, organicApplication } = plan;
          // Canonical arms, unmodified; each rounds to the paired figure v0.2.0 read.
          expect(allocation.requirement).toEqual({ contractVersion: "field_nutrient_requirement_v1", n: plan.fieldRequirement.n, p: plan.fieldRequirement.p, k: plan.fieldRequirement.k });
          expect(allocation.remainingChemicalRequirement).toEqual({
            contractVersion: "field_nutrient_remaining_v1",
            n: plan.fieldRemainingRequirement.n,
            p: plan.fieldRemainingRequirement.p,
            k: plan.fieldRemainingRequirement.k,
          });
          for (const nutrient of ["n", "p", "k"] as const) {
            expect(Math.round(knownArmKgHa(allocation.requirement[nutrient])), label).toBe(requirement.value[nutrient]);
            expect(Math.round(knownArmKgHa(allocation.remainingChemicalRequirement[nutrient])), label).toBe(netRequirement.value[nutrient]);
          }
          // Unchanged records.
          expect(allocation.availableSlurryNutrient).toEqual({ N: knownKgHa(assessment.value.n), P: knownKgHa(assessment.value.p), K: knownKgHa(assessment.value.k) });
          expect(allocation.organicAllocatedNutrient).toEqual({
            N: knownKgHa(organicApplication.offsetN),
            P: knownKgHa(organicApplication.offsetP),
            K: knownKgHa(organicApplication.offsetK),
            basis: "PRODUCTION_PLAN_OFFSET",
            shareCapApplied: false,
          });
          expect(allocation.plannedApplication).toEqual({ status: "PLANNED", rateM3ha: 33, totalM3: organicApplication.totalM3, basis: organicApplication.availableNutrientBasis });
          expect(constraint(allocation, "ORGANIC_SHARE_LIMIT_P").input.soilIndex).toBe(String(p));
          expect(constraint(allocation, "ORGANIC_SHARE_LIMIT_K").input.soilIndex).toBe(String(k));
          // Index 3 is evaluated only when no availability factor was applied (paired flag).
          expect(constraint(allocation, "ORGANIC_SHARE_LIMIT_P").deferral === "IMPLEMENTATION_DEFERRED_RULE_INTERACTION_PROVISIONAL").toBe(p <= 2);
          expect(assessment.value.soilIndexAdjustmentApplied).toEqual({ p: p <= 2, k: k <= 2 });
          expect(constraint(allocation, "ORGANIC_SHARE_LIMIT_P").binding).not.toBe("NOT_EVALUATED");
          expect(constraint(allocation, "K_SPRING_GUIDANCE_90").binding, label).toBe("NOT_ENFORCED");
          // Exact comparisons and the new organic excess.
          expectExactRequirementLimit(allocation, "P", label);
          expectExactRequirementLimit(allocation, "K", label);
          const nExcess = allocation.organicExcessOverRequirement.N;
          expect(nExcess, label).toEqual(knownKgHa(Math.max(0, assessment.value.n - knownArmKgHa(allocation.requirement.n))));
          expect(allocation.rateConstraints.some((c) => c.nutrient === "N"), label).toBe(false);
          expect(allocation.calculationVersion).toBe("slurry_rate_allocation_v0.3.0-draft");
          expect(allocation.finalAllowedRate.status).toBe("DEFERRED");
          expect(allocation.affectsProductionOutput).toBe(false);
          expect(allocation.rateConstraints.every((c) => c.affectsProductionOutput === false)).toBe(true);
        }
      }
    }
  });

  it("missing silage evidence leaves every requirement unknown, with the arm's own reason", () => {
    const plan = contextPlan(fertilityOf(2, 2), SUPPORTED_CONTEXTS[0], { silage: false });
    expect(plan.requirement.status).toBe("unavailable");
    const allocation = buildSlurryRateAllocation({ plan });
    for (const nutrient of ["n", "p", "k"] as const) {
      expect(allocation.requirement[nutrient]).toMatchObject({ status: "UNKNOWN", reasonCode: "MISSING_SILAGE_PLAN_DATA" });
      expect(allocation.remainingChemicalRequirement[nutrient]).toMatchObject({ status: "UNKNOWN", cause: "REQUIREMENT_UNKNOWN", reasonCode: "MISSING_SILAGE_PLAN_DATA" });
    }
    for (const nutrient of ["N", "P", "K"] as const) {
      expect(allocation.organicExcessOverRequirement[nutrient]).toEqual({ status: "unknown", reason: "crop requirement UNKNOWN (MISSING_SILAGE_PLAN_DATA)" });
    }
    expect(constraint(allocation, "P_REQUIREMENT_LIMIT")).toMatchObject({ binding: "UNDETERMINED", limit: { status: "unknown" } });
  });

  it("a table-blocked slurry credit makes the remaining chemical requirement and the excess unknown (product-owner decision 2026-10-02)", () => {
    for (const context of TABLE_BLOCKED_CONTEXTS) {
      const plan = contextPlan(fertilityOf(2, 3), context);
      expect(plan.organicApplication.availableNutrientAssessment.status, context.label).not.toBe("OK");
      expect(plan.requirementProvisional.isProvisional).toBe(true);
      const allocation = buildSlurryRateAllocation({ plan });
      for (const nutrient of ["n", "p", "k"] as const) {
        expect(allocation.requirement[nutrient].status, `${context.label} ${nutrient}`).toBe("KNOWN");
        expect(allocation.remainingChemicalRequirement[nutrient], `${context.label} ${nutrient}`).toMatchObject({ status: "UNKNOWN", cause: "SLURRY_CREDIT_UNKNOWN" });
      }
      for (const nutrient of ["N", "P", "K"] as const) {
        expect(allocation.organicExcessOverRequirement[nutrient].status, `${context.label} ${nutrient}`).toBe("unknown");
      }
      expect(allocation.plannedApplication).toMatchObject({ status: "PLANNED", basis: { status: expect.not.stringMatching(/^OK$/) } });
    }
  });
});

describe("canonical remap — tillage and grazing without livestock or grassland area (Increment 2c)", () => {
  it("tillage: every requirement constraint is NOT_EVALUATED with the requirement's reason; nothing is 0", () => {
    for (const context of [...SUPPORTED_CONTEXTS, ...TABLE_BLOCKED_CONTEXTS]) {
      for (const index of INDICES) {
        const label = `${context.label} Index ${index}`;
        const plan = contextPlan(fertilityOf(index, index), context, { plannedUse: tracked("tillage", "farmer_adjusted", "Keith"), silage: false });
        const allocation = buildSlurryRateAllocation({ plan, plannedUse: "silage_1st_cut" });
        for (const nutrient of ["n", "p", "k"] as const) {
          expect(allocation.requirement[nutrient], label).toMatchObject({ status: "NOT_APPLICABLE", reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED" });
          expect(allocation.remainingChemicalRequirement[nutrient], label).toEqual({ status: "NOT_APPLICABLE", reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED" });
        }
        for (const id of ["P_REQUIREMENT_LIMIT", "K_REQUIREMENT_LIMIT", "ORGANIC_SHARE_LIMIT_P", "ORGANIC_SHARE_LIMIT_K", "K_SPRING_GUIDANCE_90"]) {
          const record = constraint(allocation, id);
          expect(record.binding, `${label} ${id}`).toBe("NOT_EVALUATED");
          expect(record.reason, `${label} ${id}`).toContain("TILLAGE_FIELD_NOT_SUPPORTED");
          expect(record.output.status, `${label} ${id}`).toBe("unknown");
          expect(record.deferral, `${label} ${id}`).toBeUndefined();
        }
        for (const nutrient of ["N", "P", "K"] as const) {
          expect(allocation.organicExcessOverRequirement[nutrient], label).toEqual({ status: "unknown", reason: "crop requirement NOT_APPLICABLE (TILLAGE_FIELD_NOT_SUPPORTED)" });
        }
        expect(allocation.organicShareLimit.P.status).toBe("unknown");
        expect(allocation.organicShareLimit.K.status).toBe("unknown");
        expect(allocation.bindingConstraintIds).toEqual([]);
        expect(allocation.finalAllowedRate.status).toBe("DEFERRED");
      }
    }
  });

  for (const [label, options, reasonCode] of [
    ["no livestock", { livestockGroups: [] }, "MISSING_LIVESTOCK_DATA"],
    ["no grassland area", { livestockGroups: [cows], farmGrasslandAreaHa: 0 }, "MISSING_GRASSLAND_AREA"],
  ] as const) {
    it(`grazing with ${label}: requirement constraints UNDETERMINED, never a limit of 0 (${reasonCode})`, () => {
      for (const context of SUPPORTED_CONTEXTS) {
        for (const index of INDICES) {
          const caseLabel = `${context.label} Index ${index}`;
          const plan = contextPlan(fertilityOf(index, index), context, {
            ...options,
            livestockGroups: [...options.livestockGroups],
            plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
            silage: false,
          });
          // The paired legacy path still carries a figure (LEGACY_COMPATIBILITY_PATH).
          expect(plan.requirementByNutrient.p.status, caseLabel).toBe("OK");
          const allocation = buildSlurryRateAllocation({ plan, plannedUse: "grazing" });
          for (const nutrient of ["n", "p", "k"] as const) {
            expect(allocation.requirement[nutrient], caseLabel).toMatchObject({ status: "UNKNOWN", reasonCode });
            expect(allocation.remainingChemicalRequirement[nutrient], caseLabel).toMatchObject({ status: "UNKNOWN", reasonCode, cause: "REQUIREMENT_UNKNOWN" });
          }
          for (const id of ["P_REQUIREMENT_LIMIT", "K_REQUIREMENT_LIMIT"]) {
            const record = constraint(allocation, id);
            expect(record.binding, `${caseLabel} ${id}`).toBe("UNDETERMINED");
            expect(record.limit, `${caseLabel} ${id}`).toEqual({ status: "unknown", reason: `crop requirement UNKNOWN (${reasonCode})` });
            expect(record.output.status, `${caseLabel} ${id}`).toBe("unknown");
            expect(record.reason, `${caseLabel} ${id}`).toContain(reasonCode);
          }
          // The share record keeps its index-led order: unknown requirement → UNDETERMINED, never 0.
          for (const nutrient of ["P", "K"] as const) {
            expect(allocation.organicShareLimit[nutrient].status, caseLabel).toBe("unknown");
            expect(constraint(allocation, `ORGANIC_SHARE_LIMIT_${nutrient}`).binding, caseLabel).toBe("UNDETERMINED");
          }
          for (const nutrient of ["N", "P", "K"] as const) {
            expect(allocation.organicExcessOverRequirement[nutrient], caseLabel).toEqual({ status: "unknown", reason: `crop requirement UNKNOWN (${reasonCode})` });
          }
          // Available slurry nutrient does not depend on livestock: still known.
          expect(allocation.availableSlurryNutrient.P.status, caseLabel).toBe("known");
          expect(allocation.bindingConstraintIds).toEqual([]);
        }
      }
    });
  }
});

describe("canonical remap — mixed fields (Increment 2c)", () => {
  for (const [knownNutrient, missingNutrient] of [
    ["P", "K"],
    ["K", "P"],
  ] as const) {
    it(`${knownNutrient} known / ${missingNutrient} missing: ${knownNutrient}'s limit, excess and remaining are evaluated and equal the fully indexed field's; no min(P, K)`, () => {
      for (const context of SUPPORTED_CONTEXTS) {
        for (const index of INDICES) {
          const plan = contextPlan(knownNutrient === "P" ? fertilityOf(index, undefined) : fertilityOf(undefined, index), context);
          const allocation = buildSlurryRateAllocation({ plan });
          const label = `${context.label} ${knownNutrient}${index}`;
          const mixed = nutrientRecords(allocation, knownNutrient);
          expect(mixed.requirement.status, label).toBe("KNOWN");
          expect(mixed.availableSlurryNutrient.status, label).toBe("known");
          expect(mixed.remainingChemicalRequirement.status, label).toBe("KNOWN");
          expect(mixed.organicExcess.status, label).toBe("known");
          expect(mixed.shareLimit.input.soilIndex).toBe(String(index));
          expect(mixed.organicShareLimit.status).toBe(index === 4 ? "unknown" : "known");
          expectExactRequirementLimit(allocation, knownNutrient, label);
          // Invariance: the known nutrient's records equal the fully indexed field's.
          for (const other of INDICES) {
            const full = buildSlurryRateAllocation({
              plan: contextPlan(knownNutrient === "P" ? fertilityOf(index, other) : fertilityOf(other, index), context),
            });
            expect(nutrientRecords(full, knownNutrient), `${label} other ${other}`).toEqual(mixed);
          }
          // The missing nutrient stays unknown with its own reason.
          const missing = nutrientRecords(allocation, missingNutrient);
          expect(missing.requirement).toMatchObject({ status: "UNKNOWN", reasonCode: "MISSING_SOIL_FERTILITY_INDEX" });
          expect(missing.availableSlurryNutrient).toEqual({ status: "unknown", reason: "slurry nutrient assessment BLOCKED_INSUFFICIENT_EVIDENCE (MISSING_SOIL_FERTILITY_INDEX)" });
          expect(missing.remainingChemicalRequirement).toMatchObject({ status: "UNKNOWN", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", cause: "REQUIREMENT_UNKNOWN" });
          expect(missing.organicExcess).toEqual({ status: "unknown", reason: "crop requirement UNKNOWN (MISSING_SOIL_FERTILITY_INDEX)" });
          expect(missing.organicShareLimit.status).toBe("unknown");
          expect(missing.requirementLimit.binding).toBe("UNDETERMINED");
          expect(missing.shareLimit.input.soilIndex).toBe("unknown");
          expect(allocation.bindingConstraintIds).not.toContain(`${missingNutrient}_REQUIREMENT_LIMIT`);
          expect(allocation.finalAllowedRate).toMatchObject({ status: "DEFERRED", rate: { status: "unknown" } });
          // Slurry N needs no index (CC-B2 F003): the layer reads the per-nutrient N arm (unrounded),
          // which rounds to the production `offsetN`; production counts no P/K credit.
          const nArm = plan.organicApplication.availableNutrientByNutrient.n;
          expect(nArm.status, label).toBe("OK");
          if (nArm.status !== "OK") continue;
          expect(Math.round(nArm.value.kgHa)).toBe(plan.organicApplication.offsetN);
          expect(allocation.availableSlurryNutrient.N).toEqual(knownKgHa(nArm.value.kgHa));
          // The allocated credit is the one production counts: the rounded `offsetN`.
          expect(allocation.organicAllocatedNutrient.N).toEqual(knownKgHa(plan.organicApplication.offsetN));
          expect(allocation.organicAllocatedNutrient.P.status).toBe("unknown");
          expect(allocation.organicAllocatedNutrient.K.status).toBe("unknown");
        }
      }
    });
  }

  it("organic excess is positive at a high rate and zero at a low rate for the known nutrient of a mixed field", () => {
    // P Index 3 (no factor), P requirement 20: 0.5 kg P/m3.
    const high = buildSlurryRateAllocation({ plan: contextPlan(fertilityOf(3, undefined), SUPPORTED_CONTEXTS[0], { rateM3ha: 80 }) });
    expect(high.organicExcessOverRequirement.P).toEqual(knownKgHa(20));
    expect(constraint(high, "P_REQUIREMENT_LIMIT").binding).toBe("BINDING");
    expect(high.remainingChemicalRequirement.p).toMatchObject({ status: "KNOWN", kgHa: 0 });
    const low = buildSlurryRateAllocation({ plan: contextPlan(fertilityOf(3, undefined), SUPPORTED_CONTEXTS[0], { rateM3ha: 10 }) });
    expect(low.organicExcessOverRequirement.P).toEqual(knownKgHa(0));
    expect(constraint(low, "P_REQUIREMENT_LIMIT").binding).toBe("NOT_BINDING");
    expect(low.remainingChemicalRequirement.p).toMatchObject({ status: "KNOWN", kgHa: 15 });
    for (const allocation of [high, low]) {
      expect(allocation.organicExcessOverRequirement.K.status).toBe("unknown");
      expect(allocation.remainingChemicalRequirement.k.status).toBe("UNKNOWN");
    }
  });

  it("neither index: P and K stay unknown everywhere; N stays known", () => {
    for (const context of SUPPORTED_CONTEXTS) {
      const allocation = buildSlurryRateAllocation({ plan: contextPlan(fertilityOf(undefined, undefined), context) });
      for (const nutrient of ["P", "K"] as const) {
        const records = nutrientRecords(allocation, nutrient);
        expect(records.requirement.status).toBe("UNKNOWN");
        expect(records.availableSlurryNutrient.status).toBe("unknown");
        expect(records.remainingChemicalRequirement.status).toBe("UNKNOWN");
        expect(records.organicExcess.status).toBe("unknown");
        expect(records.organicShareLimit.status).toBe("unknown");
        expect(records.requirementLimit.binding).toBe("UNDETERMINED");
      }
      expect(allocation.availableSlurryNutrient.N.status, context.label).toBe("known");
      expect(allocation.organicExcessOverRequirement.N.status, context.label).toBe("known");
      expect(allocation.bindingConstraintIds).toEqual([]);
    }
  });

  it("table-level blocks make available slurry nutrient, excess and remaining requirement unknown for all three nutrients; requirement follows its own arm", () => {
    for (const context of TABLE_BLOCKED_CONTEXTS) {
      for (const [p, k] of [
        [2, undefined],
        [undefined, 3],
        [undefined, undefined],
        [1, 4],
      ] as const) {
        const plan = contextPlan(fertilityOf(p, k), context);
        const allocation = buildSlurryRateAllocation({ plan });
        const label = `${context.label} P${p ?? "-"} K${k ?? "-"}`;
        for (const nutrient of ["N", "P", "K"] as const) {
          expect(allocation.availableSlurryNutrient[nutrient].status, `${label} ${nutrient}`).toBe("unknown");
          expect(allocation.organicExcessOverRequirement[nutrient].status, `${label} ${nutrient}`).toBe("unknown");
          expect(allocation.organicAllocatedNutrient[nutrient].status, `${label} ${nutrient}`).toBe("unknown");
        }
        for (const nutrient of ["n", "p", "k"] as const) {
          expect(allocation.remainingChemicalRequirement[nutrient].status, `${label} ${nutrient}`).toBe("UNKNOWN");
        }
        expect(allocation.requirement.n.status, label).toBe("KNOWN");
        expect(allocation.requirement.p.status, label).toBe(p === undefined ? "UNKNOWN" : "KNOWN");
        expect(allocation.requirement.k.status, label).toBe(k === undefined ? "UNKNOWN" : "KNOWN");
        expect(constraint(allocation, "P_REQUIREMENT_LIMIT").binding, label).toBe("UNDETERMINED");
        expect(constraint(allocation, "K_REQUIREMENT_LIMIT").binding, label).toBe("UNDETERMINED");
        expect(allocation.bindingConstraintIds).toEqual([]);
      }
    }
  });
});
