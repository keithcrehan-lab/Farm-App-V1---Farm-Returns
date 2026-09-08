import { describe, expect, it } from "vitest";
import { NUTRIENT_ENGINE_VERSION } from "@/domain/nutrients";
import type { Field, FertiliserProduct, LivestockGroup, TrackedValue } from "@/domain/types";
import {
  FERTILISER_RECOMMENDATION_PROMPT_KIND,
  promptForFertiliserRecommendation,
  validateFertiliserPlanEdits,
  type FertiliserRecommendationSummary,
} from "./fertiliser-recommendation";

const createdAt = "2026-09-09T09:00:00Z";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function index(value: 1 | 2 | 3 | 4): TrackedValue<1 | 2 | 3 | 4> {
  return { value, status: "verified", source: "Soil test" };
}

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Home Field",
    areaHa: 4,
    centroid: [0, 0],
    fertility: {},
    ...overrides,
  } as Field;
}

const noGroups: LivestockGroup[] = [];

describe("promptForFertiliserRecommendation", () => {
  it("BLOCKED_INSUFFICIENT_EVIDENCE: mirrors calculateNutrientPlan's own fertilityEvidence exactly when no soil index is recorded", () => {
    const f = field();
    const prompt = promptForFertiliserRecommendation(f, 4, noGroups, undefined, undefined, "2026-09-09", createdAt);

    expect(prompt.id).toMatch(UUID_RE);
    expect(prompt.farmId).toBe("farm-1");
    expect(prompt.fieldId).toBe("field-1");
    expect(prompt.kind).toBe(FERTILISER_RECOMMENDATION_PROMPT_KIND);
    expect(prompt.basis.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (prompt.basis.status !== "BLOCKED_INSUFFICIENT_EVIDENCE") throw new Error("expected blocked");
    expect(prompt.basis.reasonCode).toBe("MISSING_SOIL_FERTILITY_INDEX");
    expect(prompt.description).toContain("MISSING_SOIL_FERTILITY_INDEX");
  });

  it("NOT_APPLICABLE: real evidence exists but calculateNutrientPlan recommends no purchased product (commonage field — chemical fertiliser statutorily suppressed)", () => {
    // Deliberately still `noGroups` (Codex audit CRITICAL, round 6: an
    // earlier version of this comment wrongly claimed Table 12-3 has a
    // real "0 LU/ha" row — it does not; `nGrazingSucklerToBeefKgHa`
    // clamps any stocking rate at or below its lowest defined 1.0 LU/ha
    // row to that row's own 35 kg N/ha figure instead). This test proves
    // `promptForFertiliserRecommendation`'s own new
    // `MISSING_LIVESTOCK_DATA` gate correctly does *not* fire here — a
    // commonage field's legal prohibition suppresses the chemical-
    // fertiliser blend regardless of livestock evidence, so this must
    // stay `NOT_APPLICABLE`, never `BLOCKED_INSUFFICIENT_EVIDENCE`.
    const f = field({
      fertility: { pIndex: index(4), kIndex: index(4) },
      commonageStatus: { value: "commonage", status: "verified", source: "Farmer" },
    });
    const prompt = promptForFertiliserRecommendation(f, 4, noGroups, undefined, undefined, "2026-09-09", createdAt);

    expect(prompt.basis.status).toBe("NOT_APPLICABLE");
    if (prompt.basis.status !== "NOT_APPLICABLE") throw new Error("expected not applicable");
    expect(prompt.basis.reasonCode).toBe("NO_FERTILISER_CURRENTLY_RECOMMENDED");
  });

  it("NOT_APPLICABLE: a tillage field never gets a grazing-based recommendation, regardless of soil evidence or livestock", () => {
    // Codex audit CRITICAL (round 6): this app has no tillage N/P/K
    // table anywhere — `buildAllRealPrompts` fans this producer out over
    // every field with no land-use filter, so before this fix a tillage
    // field silently received a real, actionable, persistable grazing
    // recommendation. Real soil evidence and a real herd are both
    // present here specifically to prove the tillage gate fires first,
    // regardless of what either would otherwise produce.
    const f = field({
      fertility: { pIndex: index(1), kIndex: index(1) },
      plannedUse: { value: "tillage", status: "verified", source: "Farmer" },
    });
    const groups: LivestockGroup[] = [
      {
        id: "g1",
        farmId: "farm-1",
        category: "suckler_cow",
        label: "Cows",
        count: { value: 20, status: "verified", source: "Farmer" },
        system: "grazing",
        value: { value: 30000, status: "estimated", source: "Farm Return estimate" },
      },
    ];
    const prompt = promptForFertiliserRecommendation(f, 20, groups, undefined, undefined, "2026-09-09", createdAt);

    expect(prompt.basis.status).toBe("NOT_APPLICABLE");
    if (prompt.basis.status !== "NOT_APPLICABLE") throw new Error("expected not applicable");
    expect(prompt.basis.reasonCode).toBe("TILLAGE_FIELD_NOT_SUPPORTED");
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE: real soil evidence but no recorded livestock never becomes an actionable OK recommendation", () => {
    // Codex audit CRITICAL (round 6): an empty `livestockGroups` read is
    // genuinely ambiguous between "this farm has confirmed zero
    // livestock" and "livestock has simply never been entered" — this
    // app cannot tell the two apart, so the branch that would otherwise
    // become OK (real soil evidence, a genuine purchased-product blend)
    // must fail closed instead of presenting `nGrazingSucklerToBeefKgHa`'s
    // own clamped-to-minimum 35 kg N/ha as if it were a real,
    // confirmed-zero-livestock recommendation.
    const f = field({ fertility: { pIndex: index(1), kIndex: index(1) } });
    const prompt = promptForFertiliserRecommendation(f, 4, noGroups, undefined, undefined, "2026-09-09", createdAt);

    expect(prompt.basis.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (prompt.basis.status !== "BLOCKED_INSUFFICIENT_EVIDENCE") throw new Error("expected blocked");
    expect(prompt.basis.reasonCode).toBe("MISSING_LIVESTOCK_DATA");
    expect(prompt.basis.missingInputs).toEqual(["livestockGroups"]);
  });

  it("OK: a real recommendation is built from calculateNutrientPlan's own real, unmodified purchasedProducts", () => {
    // Index 1/1 with real grazing livestock -> a real N/P/K requirement
    // and a real purchased-product blend, matching nutrients.test.ts's
    // own established fixtures for a genuine recommendation.
    const f = field({ fertility: { pIndex: index(1), kIndex: index(1) } });
    const groups: LivestockGroup[] = [
      {
        id: "g1",
        farmId: "farm-1",
        category: "suckler_cow",
        label: "Cows",
        count: { value: 20, status: "verified", source: "Farmer" },
        system: "grazing",
        value: { value: 30000, status: "estimated", source: "Farm Return estimate" },
      },
    ];
    const prompt = promptForFertiliserRecommendation(f, 20, groups, undefined, undefined, "2026-09-09", createdAt);

    expect(prompt.basis.status).toBe("OK");
    if (prompt.basis.status !== "OK") throw new Error("expected OK");
    expect(prompt.basis.evidenceState).toBe("IRISH_MODEL");
    const summary = prompt.basis.value as {
      fieldId: string;
      areaHa: number;
      requirementKgHa: { n: number; p: number; k: number };
      products: unknown[];
      calculationVersion: string;
    };
    expect(summary.fieldId).toBe("field-1");
    expect(summary.areaHa).toBe(4);
    expect(summary.products.length).toBeGreaterThan(0);
    expect(summary.calculationVersion).toBe(NUTRIENT_ENGINE_VERSION);
    expect(prompt.title).toBe("Fertiliser recommended — Home Field");
    expect(prompt.description).toContain("Home Field needs");
    expect(prompt.calculationVersion).toBe(NUTRIENT_ENGINE_VERSION);
    // Codex audit CRITICAL (round 5): nutrients.ts's own PRODUCTS prices
    // are disclosed mock market data — this real, persisted Prompt/Decision
    // must never carry a monetary figure built from them.
    expect(summary).not.toHaveProperty("estimatedFieldCostEur");
    expect(prompt.description).not.toMatch(/cost|€/i);
    // Codex audit CRITICAL (round 6): round 5's own fix above removed
    // the field-total figure, but every entry in `plan.purchasedProducts`
    // already carries its own real `costEur` — proves that per-product
    // mock cost is genuinely stripped too, not just the total.
    for (const product of summary.products as Array<Record<string, unknown>>) {
      expect(product).not.toHaveProperty("costEur");
    }
  });

  it("never lets one field's identity pair with another field's evidence — fieldId/farmId always match the real field passed in", () => {
    const f = field({ id: "field-9", farmId: "farm-9", fertility: { pIndex: index(1), kIndex: index(1) } });
    const prompt = promptForFertiliserRecommendation(f, 4, noGroups, undefined, undefined, "2026-09-09", createdAt);
    expect(prompt.fieldId).toBe("field-9");
    expect(prompt.farmId).toBe("farm-9");
  });

  it("carries a real inputsSnapshot for later inspection, never a fabricated one", () => {
    const f = field({ fertility: { pIndex: index(2), kIndex: index(3) } });
    const prompt = promptForFertiliserRecommendation(f, 15, noGroups, undefined, 12, "2026-09-09", createdAt);
    expect(prompt.inputsSnapshot).toMatchObject({
      farmGrasslandAreaHa: 15,
      nonGrassPct: 12,
      asOfDate: "2026-09-09",
      pIndex: 2,
      kIndex: 3,
    });
  });
});

function product(overrides: Partial<FertiliserProduct> = {}): FertiliserProduct {
  return { name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 66.7, totalKg: 266.7, costEur: 165, ...overrides };
}

function recommendation(overrides: Partial<FertiliserRecommendationSummary> = {}): FertiliserRecommendationSummary {
  return {
    fieldId: "field-1",
    areaHa: 4,
    requirementKgHa: { n: 35, p: 4, k: 0 },
    products: [product()],
    calculationVersion: NUTRIENT_ENGINE_VERSION,
    ...overrides,
  };
}

describe("validateFertiliserPlanEdits", () => {
  it("accepts a real planned product that matches one of the recommendation's own products", () => {
    const edits = validateFertiliserPlanEdits({ plannedProduct: "18-6-12" }, recommendation());
    expect(edits).toEqual({ plannedProduct: "18-6-12" });
  });

  it("accepts a real positive plannedQuantityKg", () => {
    const edits = validateFertiliserPlanEdits({ plannedQuantityKg: 240 }, recommendation());
    expect(edits).toEqual({ plannedQuantityKg: 240 });
  });

  it("accepts a real ISO plannedDate", () => {
    const edits = validateFertiliserPlanEdits({ plannedDate: "2026-09-15" }, recommendation());
    expect(edits).toEqual({ plannedDate: "2026-09-15" });
  });

  it("accepts all three real edits together", () => {
    const edits = validateFertiliserPlanEdits(
      { plannedProduct: "18-6-12", plannedQuantityKg: 240, plannedDate: "2026-09-15" },
      recommendation(),
    );
    expect(edits).toEqual({ plannedProduct: "18-6-12", plannedQuantityKg: 240, plannedDate: "2026-09-15" });
  });

  it("rejects a plannedProduct not among this recommendation's own real products — never an arbitrary farmer-typed product", () => {
    expect(() => validateFertiliserPlanEdits({ plannedProduct: "CAN 27%" }, recommendation())).toThrow(/must be one of this recommendation's own real products/);
  });

  it("rejects a non-positive or non-finite plannedQuantityKg", () => {
    expect(() => validateFertiliserPlanEdits({ plannedQuantityKg: 0 }, recommendation())).toThrow(/positive number/);
    expect(() => validateFertiliserPlanEdits({ plannedQuantityKg: -5 }, recommendation())).toThrow(/positive number/);
    expect(() => validateFertiliserPlanEdits({ plannedQuantityKg: Infinity }, recommendation())).toThrow(/positive number/);
    expect(() => validateFertiliserPlanEdits({ plannedQuantityKg: "240" }, recommendation())).toThrow(/positive number/);
  });

  it("rejects a malformed plannedDate", () => {
    expect(() => validateFertiliserPlanEdits({ plannedDate: "15-09-2026" }, recommendation())).toThrow(/ISO calendar date/);
    expect(() => validateFertiliserPlanEdits({ plannedDate: 123 }, recommendation())).toThrow(/ISO calendar date/);
  });

  // Codex audit MEDIUM (round 4) — the real round-1 regression case
  // itself: a shape-valid but non-existent calendar date. The two tests
  // above only ever exercised the *shape* check (wrong format, wrong
  // type), never this — the actual reason `isValidIsoUtcDateTime` was
  // wired in.
  it("rejects a shape-valid but non-existent calendar date (the real round-1 regression case)", () => {
    expect(() => validateFertiliserPlanEdits({ plannedDate: "2026-02-31" }, recommendation())).toThrow(/ISO calendar date/);
    expect(() => validateFertiliserPlanEdits({ plannedDate: "2026-13-01" }, recommendation())).toThrow(/ISO calendar date/);
  });

  it("accepts a real leap-day plannedDate, and rejects the identical date in a non-leap year", () => {
    expect(validateFertiliserPlanEdits({ plannedDate: "2028-02-29" }, recommendation())).toEqual({ plannedDate: "2028-02-29" });
    expect(() => validateFertiliserPlanEdits({ plannedDate: "2026-02-29" }, recommendation())).toThrow(/ISO calendar date/);
  });

  it("rejects any key beyond the real allowlist — an allowlist, not a denylist", () => {
    expect(() => validateFertiliserPlanEdits({ quantity: 100 }, recommendation())).toThrow(/unrecognised edit key/);
    expect(() => validateFertiliserPlanEdits({ areaHa: 10 }, recommendation())).toThrow(/unrecognised edit key/);
  });
});
