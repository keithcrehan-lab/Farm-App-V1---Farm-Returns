import { describe, expect, it } from "vitest";
import { calculateNutrientPlan, HOME_GRAZING_MANURE_MAXIMA_RULE, napMaxAvailablePGrazingKgHa, type CalculateNutrientPlanInput, type RegulatoryManureOrigin } from "./nutrients";
import { checkConcentratePCompliance } from "./concentrate-gates";
import { buildFarmRegulatoryContext } from "./slurry-regulatory-context";
import { tracked } from "./types";
import type { Field, LivestockGroup, NapComplianceCheck } from "./types";

// Campaign B regulatory interpretation — S.I. 588/2025 Art. 17(8) (not
// amended by S.I. 119/2026): the Table 13/15a/15b/16/17 maxima are in
// addition to N/P in grazing livestock manure produced on the holding.
// Scenario letters follow the task's section D.

const AREA_HA = 6.8;
const FARM_GRASS_HA = 27;

function labField(pIndex: 1 | 2 | 3 | 4, extra: Partial<Field["fertility"]> = {}, plannedUse: Field["plannedUse"] = tracked("grazing", "farmer_adjusted", "Farmer")): Field {
  return {
    id: "field-a",
    farmId: "farm-a",
    name: "Field A",
    areaHa: AREA_HA,
    centroid: [0, 0],
    plannedUse,
    mappedSoil: { soilAssociation: "Fermoy", dominantSeries: "Brown Earth", texture: "Loam", drainage: "moderately_drained", coveragePct: 88, datasetVersion: "test", source: "test" },
    fertility: { pIndex: tracked(pIndex, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab"), ...extra },
    history: [],
  };
}

const grazingHerd: LivestockGroup[] = [
  { id: "g1", farmId: "farm-a", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(0, "estimated", "x") },
];

const NEAT_M3 = 5 * AREA_HA;
const allocation = { fieldId: "field-a", housingId: "h1", priority: "high" as const, volumeM3: NEAT_M3, score: 90 };

function plan(opts: { field: Field; origin?: RegulatoryManureOrigin; herd?: LivestockGroup[]; slurry?: boolean; silage?: CalculateNutrientPlanInput["silage"] }) {
  const slurry = opts.slurry ?? true;
  return calculateNutrientPlan({
    field: opts.field,
    farmGrasslandAreaHa: FARM_GRASS_HA,
    livestockGroups: opts.herd ?? grazingHerd,
    slurryAllocation: slurry ? allocation : undefined,
    ...(slurry ? { plannedRegulatoryNeatSlurry: { volumeM3: NEAT_M3, status: "farmer_adjusted" as const, source: "test", ...(opts.origin ? { origin: opts.origin } : {}) } } : {}),
    ...(opts.silage ? { silage: opts.silage } : {}),
  });
}

function okCheck(p: ReturnType<typeof plan>): NapComplianceCheck {
  if (p.napCompliance.status !== "OK") throw new Error(`expected OK, got ${p.napCompliance.status} ${"reasonCode" in p.napCompliance ? p.napCompliance.reasonCode : ""}`);
  return p.napCompliance.value;
}

function statutoryP(p: ReturnType<typeof plan>): { n: number; p: number } {
  if (p.statutoryManureValue.status !== "OK") throw new Error("expected statutory manure value");
  return { n: p.statutoryManureValue.value.availableNKgHa, p: p.statutoryManureValue.value.availablePKgHa };
}

function blockedReason(p: ReturnType<typeof plan>): string | undefined {
  return p.napCompliance.status === "BLOCKED_INSUFFICIENT_EVIDENCE" ? p.napCompliance.reasonCode : undefined;
}

describe("S.I. 588/2025 Art. 17(8) — home-produced grazing-livestock manure and the Table 15a/15b P maxima", () => {
  it("records the legal basis as a versioned legal interpretation, not scientific evidence", () => {
    expect(HOME_GRAZING_MANURE_MAXIMA_RULE.legislation).toMatch(/Article 17\(8\)/);
    expect(HOME_GRAZING_MANURE_MAXIMA_RULE.legislation).toMatch(/119\/2026/);
    expect(HOME_GRAZING_MANURE_MAXIMA_RULE.regulatoryStatus).toBe("legal_interpretation");
    expect(HOME_GRAZING_MANURE_MAXIMA_RULE.version).toBe("1.0.0");
  });

  it("A: grazing holding, home-produced cattle slurry, lab P Index 2 — the slurry's P does not reduce the Table 15a rate; only chemical P is counted", () => {
    const p = plan({ field: labField(2), origin: "home_produced_grazing_livestock" });
    const c = okCheck(p);
    const manure = statutoryP(p);
    expect(manure.p).toBeGreaterThan(0);
    expect(c.legislation).toContain("Tables 13 & 15a");
    expect(c.pCeilingKgHa).toBe(napMaxAvailablePGrazingKgHa(c.orgNStockingRateKgHa, 2));
    expect(c.pRequiredKgHa).toBe(p.deliveredKgHa.p);
    expect(c.nRequiredKgHa).toBe(p.deliveredKgHa.n);
    expect(c.pWithinCeiling).toBe(p.deliveredKgHa.p <= c.pCeilingKgHa);
    expect(c.homeProducedGrazingManureExcluded).toEqual({ nKgHa: manure.n, pKgHa: manure.p, legalBasis: HOME_GRAZING_MANURE_MAXIMA_RULE.legislation });
    // The statutory manure ledger itself is kept, not zeroed.
    expect(p.statutoryManureValue.status).toBe("OK");
  });

  it("B: imported manure on the same field does not take the exemption — its statutory N/P is counted with the chemical supply", () => {
    const p = plan({ field: labField(2), origin: "imported" });
    const c = okCheck(p);
    const manure = statutoryP(p);
    expect(c.homeProducedGrazingManureExcluded).toBeUndefined();
    expect(c.pRequiredKgHa).toBeCloseTo(manure.p + p.deliveredKgHa.p, 9);
    expect(c.nRequiredKgHa).toBeCloseTo(manure.n + p.deliveredKgHa.n, 9);
  });

  it("C: chemical P stays counted against the Table 15a maximum", () => {
    const p = plan({ field: labField(1), origin: "home_produced_grazing_livestock" });
    const c = okCheck(p);
    expect(p.deliveredKgHa.p).toBeGreaterThan(0);
    expect(c.pRequiredKgHa).toBe(p.deliveredKgHa.p);
  });

  it("D: concentrate-feed P accounting (Art. 17(7)) is unchanged and not merged into the field check", () => {
    const conc = checkConcentratePCompliance({ livestockManureNKg: 92, concentrateKg: 400, pContentKgPer100kg: 0.5 });
    expect(conc.status).toBe("OK");
    if (conc.status === "OK") expect(conc.value).toEqual({ thresholdConcentrateKg: 300, excessConcentrateKg: 100, availablePKg: 0.5 });
    const c = okCheck(plan({ field: labField(2), origin: "home_produced_grazing_livestock" }));
    expect(c.pRequiredKgHa).toBe(plan({ field: labField(2), origin: "home_produced_grazing_livestock" }).deliveredKgHa.p);
  });

  it("E: P Index 4 keeps the surplus-home-manure restriction — blocked, never an OK zero-chemical verdict", () => {
    expect(blockedReason(plan({ field: labField(4), origin: "home_produced_grazing_livestock" }))).toBe("P_INDEX_4_HOME_MANURE_SURPLUS_UNRESOLVED");
    // Imported manure on Index 4 is counted in full against the 0 kg P ceiling.
    const imported = okCheck(plan({ field: labField(4), origin: "imported" }));
    expect(imported.pCeilingKgHa).toBe(0);
    expect(imported.pWithinCeiling).toBe(false);
  });

  it("F: >20% organic-matter handling is unchanged — the exemption does not alter the ceiling", () => {
    const omField = labField(2, { verifiedTest: { sampleDate: "2025-06-01", laboratory: "Test Lab", sampleRef: "OM", p: 5, k: 110, pH: 6.2, organicMatterPct: 25 } });
    const withHome = okCheck(plan({ field: omField, origin: "home_produced_grazing_livestock" }));
    const noSlurry = okCheck(plan({ field: omField, slurry: false }));
    expect(withHome.pCeilingKgHa).toBe(noSlurry.pCeilingKgHa);
    expect(withHome.legislation).toBe(noSlurry.legislation);
  });

  it("F: >20% organic matter caps the P ceiling at Index 3 (Art. 17(4)(i)) and makes manure P 100% available (Table 10 fn 1)", () => {
    const omField = labField(2, { verifiedTest: { sampleDate: "2025-06-01", laboratory: "Test Lab", sampleRef: "OM", p: 5, k: 110, pH: 6.2, organicMatterPct: 25 } });
    const noSlurry = okCheck(plan({ field: omField, slurry: false }));
    expect(noSlurry.pCeilingKgHa).toBe(napMaxAvailablePGrazingKgHa(noSlurry.orgNStockingRateKgHa, 3));
    expect(noSlurry.pCeilingKgHa).toBeLessThan(napMaxAvailablePGrazingKgHa(noSlurry.orgNStockingRateKgHa, 2));
    const imported = plan({ field: omField, origin: "imported" });
    if (imported.statutoryManureValue.status !== "OK") throw new Error("expected statutory manure value");
    expect(imported.statutoryManureValue.value.pAvailabilityPct).toBe(100);
    const mineral = plan({ field: labField(2), origin: "imported" });
    if (mineral.statutoryManureValue.status !== "OK") throw new Error("expected statutory manure value");
    expect(mineral.statutoryManureValue.value.pAvailabilityPct).toBe(50);
  });

  it("F: mapped peat soil with no laboratory OM result takes the same Index 3 cap and 100% manure-P availability (Table 10 fn 1-2)", () => {
    const peat = labField(2);
    peat.mappedSoil = { ...peat.mappedSoil!, organicCarbonStatus: "peat" };
    const noSlurry = okCheck(plan({ field: peat, slurry: false }));
    expect(noSlurry.pCeilingKgHa).toBe(napMaxAvailablePGrazingKgHa(noSlurry.orgNStockingRateKgHa, 3));
    const imported = plan({ field: peat, origin: "imported" });
    if (imported.statutoryManureValue.status !== "OK") throw new Error("expected statutory manure value");
    expect(imported.statutoryManureValue.value.pAvailabilityPct).toBe(100);
    // A laboratory OM result determines otherwise (Art. 17(4)(j)).
    const tested = labField(2, { verifiedTest: { sampleDate: "2025-06-01", laboratory: "Test Lab", sampleRef: "OM", p: 5, k: 110, pH: 6.2, organicMatterPct: 12 } });
    tested.mappedSoil = { ...tested.mappedSoil!, organicCarbonStatus: "peat" };
    const testedCheck = okCheck(plan({ field: tested, slurry: false }));
    expect(testedCheck.pCeilingKgHa).toBe(napMaxAvailablePGrazingKgHa(testedCheck.orgNStockingRateKgHa, 2));
  });

  it("G: a holding with no grazing livestock does not inherit the grazing-holding treatment", () => {
    expect(blockedReason(plan({ field: labField(2), origin: "home_produced_grazing_livestock", herd: [] }))).toBe("HOME_GRAZING_MANURE_WITHOUT_GRAZING_LIVESTOCK");
    // Cut-for-sale (Table 16/17) with no grazing livestock: same block.
    const saleSilage = { cutNumber: 1 as const, expectedYieldTDMha: 5, intendedUse: "sale" as const, saleEvidence: { hasWrittenEvidence: true } };
    const cutField = labField(2, {}, tracked("silage_1st_cut", "farmer_adjusted", "Farmer"));
    expect(blockedReason(plan({ field: cutField, origin: "home_produced_grazing_livestock", herd: [], silage: saleSilage }))).toBe("HOME_GRAZING_MANURE_WITHOUT_GRAZING_LIVESTOCK");
    // Without the exemption claimed, cut-for-sale counts the manure in full.
    const imported = okCheck(plan({ field: cutField, origin: "imported", herd: [], silage: saleSilage }));
    expect(imported.legislation).toContain("Tables 16 & 17");
    expect(imported.homeProducedGrazingManureExcluded).toBeUndefined();
  });

  it("H: livestock-manure N limits are unchanged — the farm organic-N limit stays blocked and the Table 13 N ceiling is the same", () => {
    const farm = buildFarmRegulatoryContext(grazingHerd, FARM_GRASS_HA);
    expect(farm.organicNLimit.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (farm.organicNLimit.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(farm.organicNLimit.reasonCode).toBe("ORGANIC_N_LIMIT_RULE_NOT_ADOPTED");
    const withHome = okCheck(plan({ field: labField(2), origin: "home_produced_grazing_livestock" }));
    const noSlurry = okCheck(plan({ field: labField(2), slurry: false }));
    expect(withHome.nCeilingKgHa).toBe(noSlurry.nCeilingKgHa);
  });

  it("I: unavailable evidence stays UNKNOWN — unestablished origin or neat volume blocks, never counted as zero", () => {
    expect(blockedReason(plan({ field: labField(2) }))).toBe("PLANNED_MANURE_ORIGIN_NOT_ESTABLISHED");
    const noNeat = calculateNutrientPlan({ field: labField(2), farmGrasslandAreaHa: FARM_GRASS_HA, livestockGroups: grazingHerd, slurryAllocation: allocation });
    expect(blockedReason(noNeat as ReturnType<typeof plan>)).toBe("REGULATORY_NEAT_SLURRY_VOLUME_UNKNOWN");
    const farm = buildFarmRegulatoryContext(grazingHerd, FARM_GRASS_HA);
    expect(farm.manureImports.state).toBe("missing");
    expect(farm.homeProducedManurePAccounting.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("J: a field with no slurry planned is unaffected", () => {
    const c = okCheck(plan({ field: labField(2), slurry: false }));
    expect(c.homeProducedGrazingManureExcluded).toBeUndefined();
    expect(c.pRequiredKgHa).toBe(plan({ field: labField(2), slurry: false }).deliveredKgHa.p);
    expect(c.regulatory).toBe("compliance_value");
  });
});
