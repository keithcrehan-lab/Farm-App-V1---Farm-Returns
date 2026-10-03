import { describe, expect, it } from "vitest";
import {
  aggregateFarmFertiliserPurchasing,
  aggregateFarmFertiliserRecommendation,
  buildFarmFertiliserQuoteBasket,
  roundKgUpToDisplayTonnes,
  FARM_FERTILISER_AGGREGATION_VERSION,
  FARM_FERTILISER_QUOTE_BASKET_VERSION,
  type FarmFertiliserAggregationFieldInput,
} from "./fertiliser-plan";
import { calculateNutrientPlan, NUTRIENT_ENGINE_VERSION } from "./nutrients";
import { tracked } from "./types";
import type { FertiliserProduct, Field, FieldPurchaseStatus, LivestockGroup, NutrientPlan } from "./types";

// Fertiliser Vertical Completion, Session 3b — canonical whole-farm
// aggregation and quote-ready basket over field `purchaseStatus` +
// `purchasedProducts`.

function product(name: string, npkAnalysis: string, totalKg: number, costEur: number): FertiliserProduct {
  return { name, npkAnalysis, rateKgHa: 0, totalKg, costEur };
}

function field(
  fieldId: string,
  purchaseStatus: FieldPurchaseStatus,
  purchasedProducts: FertiliserProduct[] = [],
  calculationVersion = NUTRIENT_ENGINE_VERSION,
): FarmFertiliserAggregationFieldInput {
  return { fieldId, fieldName: `Field ${fieldId}`, plan: { purchaseStatus, purchasedProducts, calculationVersion } };
}

const RECOMMENDED: FieldPurchaseStatus = { status: "RECOMMENDED" };
const CREDIT_NOT_COUNTED: FieldPurchaseStatus = {
  status: "RECOMMENDED_CREDIT_NOT_COUNTED",
  reasonCode: "SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED",
  missingInputs: [],
};
const NONE_NEEDED: FieldPurchaseStatus = { status: "NONE_NEEDED", basis: "REMAINING_ZERO" };
const WITHHELD: FieldPurchaseStatus = { status: "WITHHELD_MIXED_EVIDENCE", reasonCode: "MIXED_SOIL_INDEX_EVIDENCE", missingInputs: ["kIndex"] };
const UNKNOWN: FieldPurchaseStatus = { status: "UNKNOWN", reasonCode: "MISSING_LIVESTOCK_DATA", missingInputs: ["livestockGroups"] };
const PROHIBITED: FieldPurchaseStatus = { status: "PROHIBITED", reasonCode: "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED" };
const NOT_APPLICABLE: FieldPurchaseStatus = { status: "NOT_APPLICABLE", reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED" };

const blend = (kg: number, cost: number) => product("18-6-12", "18-6-12", kg, cost);
const urea = (kg: number, cost: number) => product("Protected Urea", "46-0-0", kg, cost);

describe("aggregateFarmFertiliserPurchasing", () => {
  it("1/15: two fields with the same product aggregate into one line — neither double-counted nor split", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [blend(1000, 620)]), field("b", RECOMMENDED, [blend(750, 465)])]);
    expect(a.products).toHaveLength(1);
    expect(a.products[0]).toMatchObject({ productKey: "18-6-12|18-6-12", name: "18-6-12", npkAnalysis: "18-6-12", totalKg: 1750, knownCostEur: 1085, estimatedCostEur: 1085, unit: "kg" });
    expect(a.products[0].contributions.map((c) => c.fieldId)).toEqual(["a", "b"]);
  });

  it("2: different products stay separate", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [blend(1000, 620), urea(500, 278)]), field("b", RECOMMENDED, [urea(100, 56)])]);
    expect(a.products.map((p) => [p.name, p.totalKg])).toEqual([
      ["18-6-12", 1000],
      ["Protected Urea", 600],
    ]);
  });

  it("2: the same name with a different analysis is never merged (identity is name + analysis)", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [blend(100, 60)]), field("b", RECOMMENDED, [product("18-6-12", "18-6-12S", 100, 60)])]);
    expect(a.products).toHaveLength(2);
  });

  it("3: field quantities sum exactly, unrounded — rounding happens only for display, and upwards", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [blend(333.3, 200)]), field("b", RECOMMENDED, [blend(333.3, 200)]), field("c", RECOMMENDED, [blend(333.4, 200)])]);
    expect(a.products[0].totalKg).toBeCloseTo(1000, 9);
    expect(a.products[0].displayTonnes).toBe(1);
    const b = aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [blend(1000.1, 1)]), field("b", RECOMMENDED, [blend(4.2, 1)])]);
    expect(b.products[0].totalKg).toBeCloseTo(1004.3, 9);
    // 1.0043 t displays as 1.01 t — never the nearest-rounded 1.00 t below the aggregate.
    expect(b.products[0].displayTonnes).toBe(1.01);
    expect(b.products[0].displayTonnes * 1000).toBeGreaterThanOrEqual(b.products[0].totalKg);
  });

  it("4: NONE_NEEDED contributes zero and stays identified, distinct from unresolved / excluded", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", NONE_NEEDED, [blend(500, 300)])]);
    expect(a.products).toEqual([]);
    expect(a.fields).toEqual([expect.objectContaining({ fieldId: "a", purchaseClass: "NO_PURCHASE", purchaseStatus: NONE_NEEDED })]);
    expect(a.counts).toMatchObject({ noPurchase: 1, unresolved: 0, prohibited: 0, notApplicable: 0 });
    expect(a.status).toBe("READY");
  });

  it("5: WITHHELD_MIXED_EVIDENCE contributes nothing and makes the basket INCOMPLETE", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [blend(1000, 620)]), field("b", WITHHELD, [urea(999, 999)])]);
    expect(a.products.map((p) => p.name)).toEqual(["18-6-12"]);
    expect(a.counts).toMatchObject({ withheld: 1, unresolved: 1 });
    expect(a.fields[1]).toMatchObject({ purchaseClass: "UNRESOLVED", purchaseStatus: WITHHELD });
    expect(a.status).toBe("INCOMPLETE");
  });

  it("6: UNKNOWN contributes nothing and makes the basket INCOMPLETE — never zero demand", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", UNKNOWN)]);
    expect(a.products).toEqual([]);
    expect(a.counts).toMatchObject({ unknown: 1, unresolved: 1, noPurchase: 0 });
    expect(a.status).toBe("INCOMPLETE");
  });

  it("7: PROHIBITED contributes nothing, keeps its reason and does not make the basket incomplete", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", PROHIBITED, [blend(500, 300)])]);
    expect(a.products).toEqual([]);
    expect(a.fields[0]).toMatchObject({ purchaseClass: "EXCLUDED", purchaseStatus: PROHIBITED });
    expect(a.counts.prohibited).toBe(1);
    expect(a.status).toBe("READY");
  });

  it("8: NOT_APPLICABLE (tillage) contributes nothing — no placeholder quantity", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", NOT_APPLICABLE, [blend(500, 300)])]);
    expect(a.products).toEqual([]);
    expect(a.fields[0]).toMatchObject({ purchaseClass: "EXCLUDED", purchaseStatus: NOT_APPLICABLE });
    expect(a.counts.notApplicable).toBe(1);
  });

  it("9/11: RECOMMENDED_CREDIT_NOT_COUNTED contributes, visibly provisional, and the basket is READY_WITH_PROVISIONAL_ITEMS", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [blend(1000, 620)]), field("b", CREDIT_NOT_COUNTED, [blend(500, 310)])]);
    expect(a.products[0]).toMatchObject({ totalKg: 1500, provisional: true });
    expect(a.products[0].contributions.map((c) => c.provisional)).toEqual([false, true]);
    expect(a.fields[1]).toMatchObject({ purchaseClass: "INCLUDED", provisional: true, purchaseStatus: CREDIT_NOT_COUNTED });
    expect(a.counts.provisional).toBe(1);
    expect(a.status).toBe("READY_WITH_PROVISIONAL_ITEMS");
  });

  it("10: an all-supported farm is READY", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [blend(1000, 620)]), field("b", NONE_NEEDED), field("c", PROHIBITED), field("d", NOT_APPLICABLE)]);
    expect(a.status).toBe("READY");
  });

  it("12: an unresolved field outranks a provisional one — INCOMPLETE, never READY because products aggregate", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", CREDIT_NOT_COUNTED, [blend(1000, 620)]), field("b", UNKNOWN)]);
    expect(a.products).toHaveLength(1);
    expect(a.status).toBe("INCOMPLETE");
  });

  it("14: a missing or invalid price is never €0 — the product and the farm total are cost-unknown", () => {
    const a = aggregateFarmFertiliserPurchasing([
      field("a", RECOMMENDED, [blend(1000, 620)]),
      field("b", RECOMMENDED, [blend(500, Number.NaN), urea(200, 112)]),
    ]);
    const line = a.products.find((p) => p.name === "18-6-12")!;
    expect(line.estimatedCostEur).toBeNull();
    expect(line.knownCostEur).toBe(620);
    expect(line.contributions[1].costEur).toBeNull();
    expect(a.productsWithUnknownCost).toEqual(["18-6-12|18-6-12"]);
    expect(a.estimatedTotalCostEur).toBeNull();
    expect(a.knownCostSubtotalEur).toBe(732);
    // Quantity readiness is separate from price: still READY.
    expect(a.status).toBe("READY");
  });

  it("16: field traceability is preserved per product (field → quantity)", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [blend(1000, 620)]), field("b", RECOMMENDED, [blend(250.5, 155)])]);
    expect(a.products[0].contributions).toEqual([
      { fieldId: "a", fieldName: "Field a", quantityKg: 1000, costEur: 620, provisional: false },
      { fieldId: "b", fieldName: "Field b", quantityKg: 250.5, costEur: 155, provisional: false },
    ]);
  });

  it("17: reads only canonical purchaseStatus + purchasedProducts — products on a non-recommended status never count, a malformed sized blend fails closed", () => {
    const a = aggregateFarmFertiliserPurchasing([
      field("a", NONE_NEEDED, [blend(1, 1)]),
      field("b", RECOMMENDED, []),
      field("c", RECOMMENDED, [blend(Number.NaN, 1)]),
      field("d", RECOMMENDED, [blend(-5, 1)]),
    ]);
    expect(a.products).toEqual([]);
    expect(a.fields.map((f) => f.aggregationReasonCode)).toEqual([undefined, "RECOMMENDED_WITHOUT_PRODUCTS", "INVALID_PRODUCT_QUANTITY", "INVALID_PRODUCT_QUANTITY"]);
    expect(a.counts.unresolved).toBe(3);
    expect(a.status).toBe("INCOMPLETE");
  });

  it("flags a product outside the verified catalogue as unsupported (INCOMPLETE), and records the bag conversion as unavailable", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [product("Mystery Blend", "10-10-20", 100, 50)])]);
    expect(a.products[0]).toMatchObject({ catalogueVerified: false, bagConversion: { status: "UNAVAILABLE", reasonCode: "NO_VERIFIED_PACKAGE_SIZE" } });
    expect(a.unsupportedProducts).toEqual(["Mystery Blend|10-10-20"]);
    expect(a.status).toBe("INCOMPLETE");
    expect(aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [blend(1, 1), urea(1, 1), product("0-7-30", "0-7-30", 1, 1)])]).unsupportedProducts).toEqual([]);
  });

  it("records the aggregation and distinct engine versions", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [blend(1, 1)]), field("b", NONE_NEEDED), field("c", UNKNOWN, [], "nutrient_engine_v1.4.0")]);
    expect(a.aggregationVersion).toBe(FARM_FERTILISER_AGGREGATION_VERSION);
    expect(a.engineVersions).toEqual(["nutrient_engine_v1.4.0", NUTRIENT_ENGINE_VERSION].sort());
  });

  it("the legacy recommended view is the same aggregation (no second summation)", () => {
    const inputs = [field("a", RECOMMENDED, [blend(1000, 620), urea(10, 6)]), field("b", CREDIT_NOT_COUNTED, [blend(500, 310)]), field("c", UNKNOWN, [blend(9, 9)])];
    const canonical = aggregateFarmFertiliserPurchasing(inputs);
    const legacy = aggregateFarmFertiliserRecommendation(inputs.map((i) => i.plan));
    expect(legacy).toEqual(
      canonical.products.map((p) => ({ product: p.name, npkAnalysis: p.npkAnalysis, recommendedTotalKg: p.totalKg, recommendedTotalCostEur: p.knownCostEur, fieldsCount: p.contributions.length })),
    );
  });
});

describe("roundKgUpToDisplayTonnes", () => {
  it("never displays below the aggregate and never shows a positive quantity as 0", () => {
    expect(roundKgUpToDisplayTonnes(0)).toBe(0);
    expect(roundKgUpToDisplayTonnes(3)).toBe(0.01);
    expect(roundKgUpToDisplayTonnes(1000)).toBe(1);
    expect(roundKgUpToDisplayTonnes(1000.1)).toBe(1.01);
    expect(roundKgUpToDisplayTonnes(0.1 + 0.2 + 999.7)).toBe(1);
  });
});

describe("buildFarmFertiliserQuoteBasket", () => {
  const meta = { farmId: "farm-1", createdAt: "2026-10-03T09:00:00.000Z" };

  it("carries everything a quote request needs without recalculation", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [blend(1000, 620)]), field("b", CREDIT_NOT_COUNTED, [blend(500.5, 310), urea(200, 112)])]);
    const basket = buildFarmFertiliserQuoteBasket(a, meta);
    expect(basket).toMatchObject({
      basketVersion: FARM_FERTILISER_QUOTE_BASKET_VERSION,
      aggregationVersion: FARM_FERTILISER_AGGREGATION_VERSION,
      engineVersions: [NUTRIENT_ENGINE_VERSION],
      farmId: "farm-1",
      createdAt: meta.createdAt,
      currency: "EUR",
      status: "READY_WITH_PROVISIONAL_ITEMS",
      isCompleteFarmRequirement: true,
      knownCostSubtotalEur: 1042,
      estimatedTotalCostEur: 1042,
      provisionalFieldCount: 1,
      unresolvedFields: [],
    });
    expect(basket.lines).toEqual([
      {
        productKey: "18-6-12|18-6-12",
        name: "18-6-12",
        npkAnalysis: "18-6-12",
        catalogueVerified: true,
        unit: "kg",
        quantityKg: 1500.5,
        displayTonnes: 1.51,
        bagConversion: { status: "UNAVAILABLE", reasonCode: "NO_VERIFIED_PACKAGE_SIZE" },
        estimatedCostEur: 930,
        contributingFieldCount: 2,
        provisional: true,
      },
      expect.objectContaining({ name: "Protected Urea", quantityKg: 200, contributingFieldCount: 1, provisional: true }),
    ]);
  });

  it("13: an INCOMPLETE basket still shows the known subtotal, flagged as not the whole-farm requirement, with the unresolved fields named", () => {
    const a = aggregateFarmFertiliserPurchasing([field("a", RECOMMENDED, [blend(1000, 620)]), field("b", WITHHELD), field("c", UNKNOWN), field("d", PROHIBITED), field("e", NONE_NEEDED)]);
    const basket = buildFarmFertiliserQuoteBasket(a, meta);
    expect(basket.status).toBe("INCOMPLETE");
    expect(basket.isCompleteFarmRequirement).toBe(false);
    expect(basket.lines).toHaveLength(1);
    expect(basket.knownCostSubtotalEur).toBe(620);
    expect(basket.unresolvedFields).toEqual([
      { fieldId: "b", fieldName: "Field b", status: "WITHHELD_MIXED_EVIDENCE", reasonCode: "MIXED_SOIL_INDEX_EVIDENCE" },
      { fieldId: "c", fieldName: "Field c", status: "UNKNOWN", reasonCode: "MISSING_LIVESTOCK_DATA" },
    ]);
    expect(basket.excludedFields).toEqual([{ fieldId: "d", fieldName: "Field d", status: "PROHIBITED", reasonCode: "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED" }]);
    expect(basket.noPurchaseFieldCount).toBe(1);
  });
});

describe("Session 3b over real engine plans", () => {
  const herd: LivestockGroup[] = [
    { id: "g1", farmId: "farm-3b", category: "suckler_cow", label: "Cows", count: tracked(30, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
  ];
  function realField(id: string, p: 1 | 2 | 3 | 4 | undefined, k: 1 | 2 | 3 | 4 | undefined, extra: Partial<Field> = {}): Field {
    return {
      id,
      farmId: "farm-3b",
      name: id,
      areaHa: 6,
      centroid: [0, 0],
      plannedUse: tracked("grazing", "farmer_adjusted", "Farmer"),
      mappedSoil: { soilAssociation: "Fermoy", dominantSeries: "Brown Earth", texture: "Loam", drainage: "moderately_drained", coveragePct: 88, datasetVersion: "test", source: "test" },
      fertility: { ...(p ? { pIndex: tracked(p, "verified", "Lab") } : {}), ...(k ? { kIndex: tracked(k, "verified", "Lab") } : {}) },
      history: [],
      ...extra,
    };
  }
  const fields = [
    realField("f1", 1, 1),
    realField("f2", 2, 3, { areaHa: 4.3 }),
    realField("f3", 2, undefined),
    realField("f4", 3, 3, { plannedUse: tracked("tillage", "farmer_adjusted", "Farmer") }),
  ];
  const farmGrasslandAreaHa = 6 + 4.3 + 6;
  const plans: NutrientPlan[] = fields.map((f) => calculateNutrientPlan({ field: f, farmGrasslandAreaHa, livestockGroups: herd, slurryAllocation: undefined }));
  const inputs = () => plans.map((plan, i) => ({ fieldId: fields[i].id, fieldName: fields[i].name, plan }));

  it("18/20: farm totals are exactly the sum of each fully indexed field's own engine products — nothing recomputed", () => {
    const a = aggregateFarmFertiliserPurchasing(inputs());
    expect(plans.map((p) => p.purchaseStatus.status)).toEqual(["RECOMMENDED", "RECOMMENDED", "WITHHELD_MIXED_EVIDENCE", "NOT_APPLICABLE"]);
    const expected = new Map<string, number>();
    for (const plan of plans.slice(0, 2)) for (const p of plan.purchasedProducts) expected.set(p.name, (expected.get(p.name) ?? 0) + p.totalKg);
    expect(new Map(a.products.map((p) => [p.name, p.totalKg]))).toEqual(expected);
    for (const p of a.products) for (const c of p.contributions) {
      const plan = plans.find((pl) => pl.fieldId === c.fieldId)!;
      expect(plan.purchasedProducts.find((pp) => pp.name === p.name)).toMatchObject({ totalKg: c.quantityKg, costEur: c.costEur });
    }
    expect(a.status).toBe("INCOMPLETE");
  });

  it("19: aggregation never mutates or reinterprets a field plan (statutory / NAP outputs untouched)", () => {
    const before = structuredClone(plans);
    const frozen = inputs().map((i) => ({ ...i, plan: Object.freeze(structuredClone(i.plan)) }));
    expect(() => aggregateFarmFertiliserPurchasing(frozen)).not.toThrow();
    aggregateFarmFertiliserPurchasing(inputs());
    expect(plans).toEqual(before);
  });
});
