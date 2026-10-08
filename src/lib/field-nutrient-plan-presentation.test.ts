import { describe, expect, it } from "vitest";
import { tracked, type Farm, type Field, type LivestockGroup, type NutrientPlan, type SlurryAllocation } from "@/domain/types";
import { roundKgUpToDisplayTonnes } from "@/domain/fertiliser-plan";
import { buildFieldNutrientPlan, type FieldNutrientPlanInput, type FieldNutrientPlanResult } from "@/orchestration/fertiliser-plan/field-nutrient-plan";
import { fieldNutrientPlanView, nutrientCellText, NUTRIENT_KEYS } from "./field-nutrient-plan-presentation";

/**
 * Farm Spatial V2 Phase 4 required audit — every value the drawer and the
 * field nutrient plan display is traced to its canonical `NutrientPlan`
 * arm, and the adapter neither recomputes nor mutates it.
 */

const FARM: Farm = { id: "farm-1", name: "Test Farm", location: { county: "Cork", centroid: [0, 0] }, primaryEnterprises: ["suckler_beef"], units: "metric", ownerName: "Farmer" };
const HERD = [
  { id: "g1", farmId: "farm-1", category: "suckler_cow", label: "Cows", count: { value: 20, status: "verified", source: "Farmer" }, system: "grazing", value: { value: 30000, status: "estimated", source: "Farm Return estimate" } },
] as LivestockGroup[];

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Field 1",
    areaHa: 4,
    centroid: [0, 0],
    fertility: { pIndex: tracked(1, "verified", "Soil test"), kIndex: tracked(1, "verified", "Soil test") },
    ...overrides,
  } as Field;
}

// Splash plate (Table 9-8) resolves at the national-average DM%; LESS at
// that DM% has no published row, so its credit stays unassessed.
const SPLASH: SlurryAllocation = { fieldId: "field-1", housingId: "h1", volumeM3: 100, priority: "high", applicationMethod: tracked("splashplate", "farmer_adjusted", "Farmer") };
const LESS: SlurryAllocation = { ...SPLASH, applicationMethod: tracked("LESS", "farmer_adjusted", "Farmer") };

function build(f: Field, slurryAllocations: SlurryAllocation[] = [SPLASH], overrides: Partial<FieldNutrientPlanInput> = {}): FieldNutrientPlanResult {
  return buildFieldNutrientPlan({
    farm: FARM,
    field: f,
    fields: [f],
    allFields: [f],
    livestockGroups: HERD,
    slurryAllocations,
    slurryCompositionRecords: [],
    housing: [],
    slurryAllocationRecords: [],
    neatSlurryEvidenceRecords: [],
    spreadableAreaRecords: [],
    slurryOriginEvidenceRecords: [],
    regulatoryEvidenceStale: false,
    silagePlan: undefined,
    asOfDate: "2026-03-01",
    ...overrides,
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

describe("fieldNutrientPlanView — canonical pass-through, never recomputed", () => {
  it("copies requirement, organic contribution, remaining and products straight from the engine", () => {
    const result = build(field());
    const { plan } = result;
    const view = fieldNutrientPlanView(result, field());
    if (view.status !== "available") throw new Error("expected an available plan");

    const [requirement, organic, remaining] = view.rows;
    for (const key of NUTRIENT_KEYS) {
      const req = plan.fieldRequirement[key];
      const credit = plan.organicApplication.availableNutrientByNutrient[key];
      const rem = plan.fieldRemainingRequirement[key];
      if (req.status !== "KNOWN" || credit.status !== "OK" || rem.status !== "KNOWN") throw new Error(`fixture must be fully known (${key})`);
      expect(requirement.cells[key]).toEqual({ state: "value", kgHa: req.kgHa });
      expect(organic.cells[key]).toEqual({ state: "value", kgHa: credit.value.kgHa });
      expect(remaining.cells[key]).toEqual({ state: "value", kgHa: rem.kgHa });
    }

    expect(plan.purchaseStatus.status).toBe("RECOMMENDED");
    if (view.solution.kind !== "products") throw new Error("expected products");
    expect(view.solution.products).toEqual(
      plan.purchasedProducts.map((p) => ({ name: p.name, npkAnalysis: p.npkAnalysis, rateKgHa: p.rateKgHa, totalKg: p.totalKg, displayTonnes: roundKgUpToDisplayTonnes(p.totalKg) })),
    );
    expect(view.solution.products.every((p) => !("costEur" in p))).toBe(true);
    expect(view.organic).toMatchObject({ state: "planned", totalM3: plan.organicApplication.totalM3, rateM3ha: plan.organicApplication.rateM3ha, method: "Splash plate", methodAssumed: false, creditAssessed: true });
    expect(view.evidence).toMatchObject({ calculationVersion: plan.calculationVersion, engineVersion: plan.fieldRequirement.engineVersion, cropBasis: "grazing" });
  });

  it("shows the engine's remaining figure even when it disagrees with requirement minus credit (no subtraction in the adapter)", () => {
    const result = build(field());
    const rem = result.plan.fieldRemainingRequirement.n;
    if (rem.status !== "KNOWN") throw new Error("fixture must be known");
    const tampered: NutrientPlan = { ...result.plan, fieldRemainingRequirement: { ...result.plan.fieldRemainingRequirement, n: { ...rem, kgHa: 987.6 } } };
    const view = fieldNutrientPlanView({ ...result, plan: tampered }, field());
    if (view.status !== "available") throw new Error("expected an available plan");
    expect(view.rows[2].cells.n).toEqual({ state: "value", kgHa: 987.6 });
    expect(nutrientCellText(view.rows[2].cells.n)).toBe("988");
  });

  it("never mutates the canonical plan", () => {
    const result = build(field());
    const snapshot = structuredClone(result.plan);
    deepFreeze(result.plan);
    expect(() => fieldNutrientPlanView(result, field())).not.toThrow();
    expect(result.plan).toEqual(snapshot);
  });

  it("keeps a missing soil K Index Unknown with its reason in every row, never 0, and withholds products", () => {
    const f = field({ fertility: { pIndex: tracked(2, "verified", "Soil test") } });
    const result = build(f);
    const view = fieldNutrientPlanView(result, f);
    if (view.status !== "available") throw new Error("expected an available plan");
    for (const row of view.rows) {
      expect(row.cells.k).toMatchObject({ state: "unknown" });
      expect(nutrientCellText(row.cells.k)).toBe("Unknown");
    }
    expect(view.unknownReasons.some((r) => /soil P or K Index/.test(r))).toBe(true);
    expect(view.mixedIndexLine).toMatch(/K requirement isn't shown/);
    expect(view.solution).toMatchObject({ kind: "unavailable", label: "Withheld" });
  });

  it("shows no slurry planned as None (a known zero credit), not Unknown", () => {
    const result = build(field(), []);
    const view = fieldNutrientPlanView(result, field());
    if (view.status !== "available") throw new Error("expected an available plan");
    for (const key of NUTRIENT_KEYS) expect(view.rows[1].cells[key]).toEqual({ state: "none" });
    expect(view.organic).toEqual({ state: "none" });
    expect(view.evidence.slurryDm).toBeUndefined();
  });

  it("keeps an unassessed slurry credit provisional and Unknown, never a floored 0", () => {
    const result = build(field(), [LESS]);
    const view = fieldNutrientPlanView(result, field());
    if (view.status !== "available") throw new Error("expected an available plan");
    expect(result.plan.organicApplication.offsetN).toBe(0);
    for (const key of NUTRIENT_KEYS) expect(view.rows[1].cells[key]).toMatchObject({ state: "unknown" });
    expect(result.plan.purchaseStatus.status).toBe("RECOMMENDED_CREDIT_NOT_COUNTED");
    expect(view.provisional?.headline).toBe(result.plan.requirementProvisional.headline);
    expect(view.organic).toMatchObject({ state: "planned", creditAssessed: false });
  });

  it("shows tillage and a farm with no recorded livestock as unavailable, with no figures", () => {
    const tillage = field({ plannedUse: tracked("tillage", "farmer_adjusted", "Farmer") });
    expect(fieldNutrientPlanView(build(tillage), tillage)).toEqual({ status: "unavailable", message: expect.stringMatching(/tillage/) });
    expect(fieldNutrientPlanView(build(field(), [SPLASH], { livestockGroups: [] }), field())).toEqual({ status: "unavailable", message: expect.stringMatching(/livestock group/) });
  });

  it("keeps a local buffer prohibition but never shows the engine's 0m fallback for an unrecorded distance", () => {
    const f = field({ waterBufferContext: tracked({ localOverrideStatus: "authoritative_rule" as const, localOverrideDistanceM: 10 }, "farmer_adjusted", "Farmer") });
    const result = build(f);
    const prohibited: FieldNutrientPlanResult = {
      ...result,
      plan: {
        ...result.plan,
        localBufferOverrideStatus: {
          status: "LEGAL_PROHIBITION",
          reasonCode: "LOCAL_BUFFER_OVERRIDE_EXCEEDS_ACTUAL_DISTANCE",
          consequence: "A local authority buffer of 10m applies and exceeds the actual distance of 0m.",
        },
      } as NutrientPlan,
    };
    const view = fieldNutrientPlanView(prohibited, f);
    if (view.status !== "available") throw new Error("expected an available plan");
    const gate = view.legalGates.find((g) => g.id === "local_buffer");
    expect(gate?.state).toBe("prohibited");
    expect(gate?.text).not.toMatch(/\b0m\b/);
    expect(gate?.text).toMatch(/10m applies; the actual distance to water is not recorded/);

    const measured = field({ waterBufferContext: tracked({ localOverrideStatus: "authoritative_rule" as const, localOverrideDistanceM: 10, distanceM: 4 }, "farmer_adjusted", "Farmer") });
    const measuredView = fieldNutrientPlanView(build(measured), measured);
    if (measuredView.status !== "available") throw new Error("expected an available plan");
    expect(measuredView.legalGates.find((g) => g.id === "local_buffer")?.text).toMatch(/actual distance of 4m/);
  });
});
