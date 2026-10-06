import { describe, expect, it } from "vitest";
import {
  aggregateFarmFertiliserDemand,
  aggregateFarmFertiliserRecommendation,
  aggregateFarmLimeRequirement,
  aggregateFarmNutrientRequirementKg,
  calculateRemainingFertiliserRequirement,
  nutrientContributionFromFertiliserActual,
  roundKgToTonnes,
  sumConfirmedFertiliserApplications,
  toFarmFertiliserPurchaseRequirementTonnes,
  roundKgUpToDisplayTonnes,
  toFarmInputDemand,
  totalProductQuantityKgByProduct,
  countUnresolvedFertiliserQuantities,
} from "./fertiliser-plan";
import type { Field, NutrientPlan } from "./types";

describe("nutrientContributionFromFertiliserActual", () => {
  it("computes a real nutrient contribution for a known catalogue product, kg unit", () => {
    const result = nutrientContributionFromFertiliserActual({ product: "18-6-12", quantity: 1000, quantityUnit: "kg" });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.value).toEqual({ n: 180, p: 60, k: 120 });
  });

  it("converts tonnes to kg before applying the real composition", () => {
    const result = nutrientContributionFromFertiliserActual({ product: "Protected Urea", quantity: 2, quantityUnit: "t" });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    // 2 t = 2000 kg, 46% N -> 920 kg N, 0 P, 0 K.
    expect(result.value).toEqual({ n: 920, p: 0, k: 0 });
  });

  it("fails closed for a product with no verified catalogue composition, never guessing", () => {
    const result = nutrientContributionFromFertiliserActual({ product: "CAN 27%", quantity: 500, quantityUnit: "kg" });
    expect(result.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (result.status !== "BLOCKED_INSUFFICIENT_EVIDENCE") throw new Error("expected blocked");
    expect(result.reasonCode).toBe("UNKNOWN_FERTILISER_PRODUCT_COMPOSITION");
  });

  it("never fuzzy-matches a near-miss product name", () => {
    const result = nutrientContributionFromFertiliserActual({ product: "protected urea", quantity: 500, quantityUnit: "kg" });
    expect(result.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("fails closed for a 'bags' unit — no verified bag weight exists", () => {
    const result = nutrientContributionFromFertiliserActual({ product: "18-6-12", quantity: 10, quantityUnit: "bags" });
    expect(result.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (result.status !== "BLOCKED_INSUFFICIENT_EVIDENCE") throw new Error("expected blocked");
    expect(result.reasonCode).toBe("UNVERIFIED_BAG_WEIGHT");
  });

  it("fails closed when the product is missing entirely", () => {
    const result = nutrientContributionFromFertiliserActual({ quantity: 500, quantityUnit: "kg" });
    expect(result.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (result.status !== "BLOCKED_INSUFFICIENT_EVIDENCE") throw new Error("expected blocked");
    expect(result.reasonCode).toBe("MISSING_FERTILISER_PRODUCT");
  });

  it("fails closed when quantity is missing, zero, or invalid", () => {
    expect(nutrientContributionFromFertiliserActual({ product: "18-6-12" }).status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(nutrientContributionFromFertiliserActual({ product: "18-6-12", quantity: 0, quantityUnit: "kg" }).status).toBe(
      "BLOCKED_INSUFFICIENT_EVIDENCE",
    );
    expect(nutrientContributionFromFertiliserActual({ product: "18-6-12", quantity: -5, quantityUnit: "kg" }).status).toBe(
      "BLOCKED_INSUFFICIENT_EVIDENCE",
    );
  });

  it("real fixture: 0-7-30 has zero N, matching its own real analysis", () => {
    const result = nutrientContributionFromFertiliserActual({ product: "0-7-30", quantity: 1000, quantityUnit: "kg" });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.value.n).toBe(0);
    expect(result.value.p).toBeCloseTo(70, 5);
    expect(result.value.k).toBeCloseTo(300, 5);
  });
});

describe("sumConfirmedFertiliserApplications", () => {
  it("sums real nutrient contributions across multiple known-composition applications", () => {
    const result = sumConfirmedFertiliserApplications([
      { product: "18-6-12", quantity: 1000, quantityUnit: "kg" },
      { product: "Protected Urea", quantity: 500, quantityUnit: "kg" },
    ]);
    expect(result.confirmedAppliedKg).toEqual({ n: 180 + 230, p: 60, k: 120 });
    expect(result.applicationsWithKnownComposition).toBe(2);
    expect(result.applicationsWithUnknownComposition).toBe(0);
  });

  it("counts, but excludes from the total, an application with an unknown composition — never silently dropped from the count", () => {
    const result = sumConfirmedFertiliserApplications([
      { product: "18-6-12", quantity: 1000, quantityUnit: "kg" },
      { product: "CAN 27%", quantity: 500, quantityUnit: "kg" },
    ]);
    expect(result.confirmedAppliedKg).toEqual({ n: 180, p: 60, k: 120 });
    expect(result.applicationsWithKnownComposition).toBe(1);
    expect(result.applicationsWithUnknownComposition).toBe(1);
  });

  it("returns an honest zero total for an empty list, not an error", () => {
    const result = sumConfirmedFertiliserApplications([]);
    expect(result.confirmedAppliedKg).toEqual({ n: 0, p: 0, k: 0 });
    expect(result.applicationsWithKnownComposition).toBe(0);
    expect(result.applicationsWithUnknownComposition).toBe(0);
  });
});

describe("calculateRemainingFertiliserRequirement", () => {
  it("computes a real remaining requirement matching the brief's own worked example shape", () => {
    // Initial requirement 100 kg N/ha; previous confirmed applications
    // 54 kg N/ha (over a 10 ha field, 540 kg total); remaining 46 kg N/ha.
    const result = calculateRemainingFertiliserRequirement({ n: 100, p: 20, k: 30 }, 10, { n: 540, p: 100, k: 150 });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.value.confirmedAppliedKgHa).toEqual({ n: 54, p: 10, k: 15 });
    expect(result.value.remainingKgHa).toEqual({ n: 46, p: 10, k: 15 });
  });

  it("never goes negative — floors at zero once confirmed applications exceed the requirement", () => {
    const result = calculateRemainingFertiliserRequirement({ n: 50, p: 10, k: 10 }, 10, { n: 1000, p: 1000, k: 1000 });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.value.remainingKgHa).toEqual({ n: 0, p: 0, k: 0 });
  });

  it("fails closed when the field has no valid mapped area — never fabricates a per-ha applied figure", () => {
    expect(calculateRemainingFertiliserRequirement({ n: 100, p: 20, k: 30 }, undefined, { n: 0, p: 0, k: 0 }).status).toBe(
      "BLOCKED_INSUFFICIENT_EVIDENCE",
    );
    expect(calculateRemainingFertiliserRequirement({ n: 100, p: 20, k: 30 }, 0, { n: 0, p: 0, k: 0 }).status).toBe(
      "BLOCKED_INSUFFICIENT_EVIDENCE",
    );
    expect(calculateRemainingFertiliserRequirement({ n: 100, p: 20, k: 30 }, -5, { n: 0, p: 0, k: 0 }).status).toBe(
      "BLOCKED_INSUFFICIENT_EVIDENCE",
    );
  });

  it("returns the full requirement as remaining when nothing has been confirmed yet", () => {
    const result = calculateRemainingFertiliserRequirement({ n: 80, p: 15, k: 25 }, 5, { n: 0, p: 0, k: 0 });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.value.remainingKgHa).toEqual({ n: 80, p: 15, k: 25 });
  });
});

describe("aggregateFarmFertiliserRecommendation", () => {
  function planWithProducts(
    products: NutrientPlan["purchasedProducts"],
    purchaseStatus: NutrientPlan["purchaseStatus"] = products.length > 0 ? { status: "RECOMMENDED" } : { status: "NONE_NEEDED", basis: "REMAINING_ZERO" },
  ): Pick<NutrientPlan, "purchasedProducts" | "purchaseStatus"> {
    return { purchasedProducts: products, purchaseStatus };
  }

  it("Session 2b: only a sized blend contributes — never a field whose purchase status is not a recommendation", () => {
    const line = { name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 200, totalKg: 1000, costEur: 620 };
    const result = aggregateFarmFertiliserRecommendation([
      planWithProducts([line], { status: "RECOMMENDED_CREDIT_NOT_COUNTED", reasonCode: "SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED", missingInputs: [] }),
      planWithProducts([line], { status: "UNKNOWN", reasonCode: "MISSING_LIVESTOCK_DATA", missingInputs: ["livestockGroups"] }),
      planWithProducts([line], { status: "NOT_APPLICABLE", reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED" }),
    ]);
    expect(result).toEqual([{ product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalKg: 1000, recommendedTotalCostEur: 620, fieldsCount: 1 }]);
  });

  it("sums the same real product's totalKg/costEur across multiple real fields", () => {
    const result = aggregateFarmFertiliserRecommendation([
      planWithProducts([{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 200, totalKg: 1000, costEur: 620 }]),
      planWithProducts([{ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 150, totalKg: 750, costEur: 465 }]),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalKg: 1750, recommendedTotalCostEur: 1085, fieldsCount: 2 });
  });

  it("keeps distinct products separate", () => {
    const result = aggregateFarmFertiliserRecommendation([
      planWithProducts([
        { name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 200, totalKg: 1000, costEur: 620 },
        { name: "Protected Urea", npkAnalysis: "46-0-0", rateKgHa: 100, totalKg: 500, costEur: 278 },
      ]),
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.product).sort()).toEqual(["18-6-12", "Protected Urea"]);
  });

  it("returns an empty array for fields with no purchased products, never a fabricated zero-row", () => {
    expect(aggregateFarmFertiliserRecommendation([planWithProducts([])])).toEqual([]);
    expect(aggregateFarmFertiliserRecommendation([])).toEqual([]);
  });
});

describe("totalProductQuantityKgByProduct", () => {
  it("sums real product kg by exact product name, converting tonnes to kg", () => {
    const totals = totalProductQuantityKgByProduct([
      { product: "18-6-12", quantity: 100, quantityUnit: "kg" },
      { product: "18-6-12", quantity: 1, quantityUnit: "t" },
      { product: "Protected Urea", quantity: 50, quantityUnit: "kg" },
    ]);
    expect(totals.get("18-6-12")).toBe(1100);
    expect(totals.get("Protected Urea")).toBe(50);
  });

  it("excludes a 'bags'-unit quantity — no verified bag weight exists", () => {
    const totals = totalProductQuantityKgByProduct([{ product: "18-6-12", quantity: 10, quantityUnit: "bags" }]);
    expect(totals.has("18-6-12")).toBe(false);
  });

  it("excludes a quantity with no product, no quantity, or a non-positive quantity", () => {
    const totals = totalProductQuantityKgByProduct([
      { quantity: 100, quantityUnit: "kg" },
      { product: "18-6-12", quantityUnit: "kg" },
      { product: "18-6-12", quantity: 0, quantityUnit: "kg" },
      { product: "18-6-12", quantity: -5, quantityUnit: "kg" },
    ]);
    expect(totals.size).toBe(0);
  });

  it("returns an empty map for an empty list", () => {
    expect(totalProductQuantityKgByProduct([]).size).toBe(0);
  });
});

// Codex audit MEDIUM (round 21): `totalProductQuantityKgByProduct`
// silently excludes a quantity it can't resolve to a real kg figure —
// correct for that function's own job, but the farm-wide aggregator
// consuming its totals needs a real, honest count of how many
// exclusions happened, not just the (possibly understated) totals.
describe("countUnresolvedFertiliserQuantities", () => {
  it("counts a 'bags'-unit quantity as unresolved — no verified bag weight exists", () => {
    expect(countUnresolvedFertiliserQuantities([{ product: "18-6-12", quantity: 10, quantityUnit: "bags" }])).toBe(1);
  });

  it("counts a quantity with no product, no quantity, or a non-positive quantity as unresolved", () => {
    expect(
      countUnresolvedFertiliserQuantities([
        { quantity: 100, quantityUnit: "kg" },
        { product: "18-6-12", quantityUnit: "kg" },
        { product: "18-6-12", quantity: 0, quantityUnit: "kg" },
        { product: "18-6-12", quantity: -5, quantityUnit: "kg" },
      ]),
    ).toBe(4);
  });

  it("never counts a real, resolvable kg or tonne quantity as unresolved", () => {
    expect(
      countUnresolvedFertiliserQuantities([
        { product: "18-6-12", quantity: 100, quantityUnit: "kg" },
        { product: "18-6-12", quantity: 1, quantityUnit: "t" },
      ]),
    ).toBe(0);
  });

  it("returns 0 for an empty list", () => {
    expect(countUnresolvedFertiliserQuantities([])).toBe(0);
  });
});

describe("aggregateFarmFertiliserDemand", () => {
  const recommended = [
    { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalKg: 1000, recommendedTotalCostEur: 620, fieldsCount: 2 },
    { product: "Protected Urea", npkAnalysis: "46-0-0", recommendedTotalKg: 500, recommendedTotalCostEur: 278, fieldsCount: 1 },
  ];

  it("combines real recommended totals with real planned/confirmed totals by product", () => {
    const result = aggregateFarmFertiliserDemand(
      recommended,
      new Map([["18-6-12", 400]]),
      new Map([["18-6-12", 300], ["Protected Urea", 500]]),
    );
    expect(result).toEqual([
      { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalKg: 1000, recommendedTotalCostEur: 620, fieldsCount: 2, plannedTotalKg: 400, confirmedAppliedTotalKg: 300, remainingTotalKg: 700 },
      { product: "Protected Urea", npkAnalysis: "46-0-0", recommendedTotalKg: 500, recommendedTotalCostEur: 278, fieldsCount: 1, plannedTotalKg: 0, confirmedAppliedTotalKg: 500, remainingTotalKg: 0 },
    ]);
  });

  it("never goes negative — floors remainingTotalKg at zero once confirmed exceeds recommended", () => {
    const result = aggregateFarmFertiliserDemand(recommended, new Map(), new Map([["18-6-12", 5000]]));
    expect(result[0].remainingTotalKg).toBe(0);
  });

  it("defaults planned/confirmed to zero for a product with no real planned/confirmed record at all", () => {
    const result = aggregateFarmFertiliserDemand(recommended, new Map(), new Map());
    expect(result[0].plannedTotalKg).toBe(0);
    expect(result[0].confirmedAppliedTotalKg).toBe(0);
    expect(result[0].remainingTotalKg).toBe(1000);
  });

  // Codex audit HIGH, round 1: a real planned/confirmed product with no
  // field currently recommending it must never silently vanish from this
  // farm-wide report.
  it("includes a real planned product no field currently recommends, with an honest zero recommendedTotalKg — never dropped", () => {
    const result = aggregateFarmFertiliserDemand(recommended, new Map([["0-7-30", 150]]), new Map());
    const row = result.find((r) => r.product === "0-7-30");
    expect(row).toEqual({
      product: "0-7-30",
      npkAnalysis: "",
      recommendedTotalKg: 0,
      recommendedTotalCostEur: 0,
      fieldsCount: 0,
      plannedTotalKg: 150,
      confirmedAppliedTotalKg: 0,
      remainingTotalKg: 0,
    });
    expect(result).toHaveLength(3);
  });

  it("includes a real confirmed product no field currently recommends, with an honest zero recommendedTotalKg — never dropped", () => {
    const result = aggregateFarmFertiliserDemand(recommended, new Map(), new Map([["CAN 27%", 80]]));
    const row = result.find((r) => r.product === "CAN 27%");
    expect(row?.confirmedAppliedTotalKg).toBe(80);
    expect(row?.recommendedTotalKg).toBe(0);
    expect(result).toHaveLength(3);
  });

  it("never double-counts a product that is both currently recommended and separately planned/confirmed", () => {
    const result = aggregateFarmFertiliserDemand(recommended, new Map([["18-6-12", 400]]), new Map());
    expect(result.filter((r) => r.product === "18-6-12")).toHaveLength(1);
  });
});

describe("roundKgToTonnes (Fertiliser Vertical V1, Checkpoint 3)", () => {
  it("converts kg to tonnes rounded to the documented 2-decimal (10 kg) precision", () => {
    expect(roundKgToTonnes(1234)).toBe(1.23);
  });

  it("rounds a real farm-scale figure to the nearest 10 kg of tonnage", () => {
    expect(roundKgToTonnes(1000)).toBe(1);
    expect(roundKgToTonnes(1005)).toBe(1); // rounds to nearest 0.01 t = 10 kg
    expect(roundKgToTonnes(1006)).toBe(1.01);
  });

  it("returns exactly zero for zero kg, never -0", () => {
    expect(Object.is(roundKgToTonnes(0), -0)).toBe(false);
    expect(roundKgToTonnes(0)).toBe(0);
  });
});

describe("toFarmFertiliserPurchaseRequirementTonnes (Fertiliser Vertical V1, Checkpoint 3)", () => {
  const demand = [
    {
      product: "18-6-12", npkAnalysis: "18-6-12",
      recommendedTotalKg: 1000, recommendedTotalCostEur: 620, fieldsCount: 2,
      plannedTotalKg: 400, confirmedAppliedTotalKg: 300, remainingTotalKg: 700,
    },
    {
      product: "Protected Urea", npkAnalysis: "46-0-0",
      recommendedTotalKg: 12345, recommendedTotalCostEur: 6789, fieldsCount: 3,
      plannedTotalKg: 0, confirmedAppliedTotalKg: 5000, remainingTotalKg: 7345,
    },
  ];

  it("reconciles exactly with the underlying kg totals — each line's tonnes figure, multiplied back by 1000, reproduces the real kg total already shown on the per-field/farm kg screens (within this module's own documented 10 kg rounding precision)", () => {
    const result = toFarmFertiliserPurchaseRequirementTonnes(demand);
    for (const [i, line] of result.entries()) {
      const source = demand[i];
      // Purchase quantities round up: never below the kg total, at most one 0.01 t step above.
      expect(line.recommendedTotalTonnes * 1000 - source.recommendedTotalKg).toBeGreaterThanOrEqual(-1e-6);
      expect(line.recommendedTotalTonnes * 1000 - source.recommendedTotalKg).toBeLessThan(10);
      expect(Math.abs(line.plannedTotalTonnes * 1000 - source.plannedTotalKg)).toBeLessThanOrEqual(5);
      expect(Math.abs(line.confirmedAppliedTotalTonnes * 1000 - source.confirmedAppliedTotalKg)).toBeLessThanOrEqual(5);
      expect(line.remainingTotalTonnes * 1000 - source.remainingTotalKg).toBeGreaterThanOrEqual(-1e-6);
      expect(line.remainingTotalTonnes * 1000 - source.remainingTotalKg).toBeLessThan(10);
      // Codex audit HIGH (round 1): `remainingTotalKg` must be the
      // exact, unrounded figure — never itself subject to the tonnes
      // rounding policy — so a caller deciding whether a real remainder
      // exists never has to use the rounded display value for that
      // decision.
      expect(line.remainingTotalKg).toBe(source.remainingTotalKg);
    }
  });

  it("converts the farm's real recommended kg total to tonnes exactly once, at the farm level — never by summing individually-rounded per-field tonnages (which would drift)", () => {
    // Three real per-field kg allocations, each individually below the
    // 5 kg rounding threshold (so each rounds to 0 t on its own) but
    // summing to a real, non-trivial farm total.
    const perFieldKg = [4, 4, 4]; // sums to 12 kg
    const farmTotalKg = perFieldKg.reduce((sum, kg) => sum + kg, 0);
    const roundedThenSummed = perFieldKg.reduce((sum, kg) => sum + roundKgToTonnes(kg), 0);
    const roundedOnceAtFarmLevel = roundKgToTonnes(farmTotalKg);

    // Rounding each field's tiny kg amount to the nearest 10 kg before
    // summing collapses the real 12 kg farm requirement to "0.00 t" -- a
    // farmer would see nothing to buy. Converting the farm total once
    // (this module's actual policy) correctly surfaces 0.01 t instead.
    expect(roundedThenSummed).toBe(0);
    expect(roundedOnceAtFarmLevel).toBe(0.01);
    expect(roundedOnceAtFarmLevel).not.toBe(roundedThenSummed);
  });

  it("carries the real product identity and fields count through unchanged — never fabricates or drops a field", () => {
    const result = toFarmFertiliserPurchaseRequirementTonnes(demand);
    expect(result.map((r) => r.product)).toEqual(["18-6-12", "Protected Urea"]);
    expect(result.map((r) => r.npkAnalysis)).toEqual(["18-6-12", "46-0-0"]);
    expect(result.map((r) => r.fieldsCount)).toEqual([2, 3]);
  });

  it("floors remaining at zero, in both tonnes and the exact kg figure, when a real confirmed application already exceeds the recommendation", () => {
    const overApplied = [{ ...demand[0], remainingTotalKg: 0 }];
    const result = toFarmFertiliserPurchaseRequirementTonnes(overApplied);
    expect(result[0].remainingTotalTonnes).toBe(0);
    expect(result[0].remainingTotalKg).toBe(0);
  });

  it("carries a real, small sub-rounding-threshold remainder through as a genuine non-zero exact kg figure, and (FV Session 5 round-up) never displays it as 0.00 t", () => {
    const tinyRemainder = [{ ...demand[0], remainingTotalKg: 4 }];
    const result = toFarmFertiliserPurchaseRequirementTonnes(tinyRemainder);
    expect(result[0].remainingTotalTonnes).toBe(0.01);
    expect(result[0].remainingTotalKg).toBe(4);
  });

  it("FV Session 5: with nothing applied, 'still to buy' equals the farm requirement's displayed tonnes (both round up)", () => {
    for (const kg of [1485.3, 675.2, 4, 1000, 999.999]) {
      const [line] = toFarmFertiliserPurchaseRequirementTonnes([{ ...demand[0], recommendedTotalKg: kg, remainingTotalKg: kg }]);
      expect(line.remainingTotalTonnes).toBe(roundKgUpToDisplayTonnes(kg));
      expect(line.recommendedTotalTonnes).toBe(roundKgUpToDisplayTonnes(kg));
    }
  });

  it("returns an empty list for a farm with no real fertiliser demand at all — never fabricates a placeholder line", () => {
    expect(toFarmFertiliserPurchaseRequirementTonnes([])).toEqual([]);
  });
});

describe("toFarmInputDemand", () => {
  it("maps a real farm fertiliser demand row to the FarmInputDemand shape, farm-scoped", () => {
    const result = toFarmInputDemand("farm-1", {
      product: "18-6-12",
      npkAnalysis: "18-6-12",
      recommendedTotalKg: 1000,
      recommendedTotalCostEur: 620,
      fieldsCount: 2,
      plannedTotalKg: 400,
      confirmedAppliedTotalKg: 300,
      remainingTotalKg: 700,
    });
    expect(result).toEqual({
      farmId: "farm-1",
      product: "18-6-12",
      unit: "kg",
      totalRequirementKg: 1000,
      plannedRequirementKg: 400,
      confirmedRequirementKg: 300,
      remainingRequirementKg: 700,
      confidence: "estimated",
    });
  });
});

// Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
// F5) — real lime requirement reconciliation, field tonnes -> farm
// tonnes, built only from each field's own already-saved laboratory
// `limeRequirement` (t/ha), never derived or guessed.
describe("aggregateFarmLimeRequirement (Grassland Fertiliser Pilot Completion, Checkpoint B)", () => {
  function field(overrides: Partial<Field> = {}): Field {
    return {
      id: "field-1",
      farmId: "farm-1",
      name: "Field",
      areaHa: 4,
      centroid: [0, 0],
      fertility: {},
      ...overrides,
    } as Field;
  }

  it("converts a real laboratory lime rate (t/ha) to real field tonnes, exactly (rate x area)", () => {
    const result = aggregateFarmLimeRequirement([
      field({ id: "f1", name: "Back Meadow", areaHa: 5, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R1", p: 5, k: 90, pH: 6, limeRequirement: 2.5 } } }),
    ]);
    // Codex audit round 1 MEDIUM — a farmer with more than one field on
    // the list needs a real name to tell rows apart, not just an id.
    expect(result.fields[0].fieldName).toBe("Back Meadow");
    expect(result.fields[0].rateTHa).toBe(2.5);
    expect(result.fields[0].fieldTonnes).toBe(12.5);
    expect(result.farmTotalTonnes).toBe(12.5);
    expect(result.fieldsWithoutLimeEvidence).toBe(0);
  });

  it("sums real field tonnes into a real farm total across multiple fields", () => {
    const result = aggregateFarmLimeRequirement([
      field({ id: "f1", areaHa: 4, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R1", p: 5, k: 90, pH: 6, limeRequirement: 2 } } }),
      field({ id: "f2", areaHa: 6, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R2", p: 5, k: 90, pH: 6, limeRequirement: 1.5 } } }),
    ]);
    // f1: 4*2=8, f2: 6*1.5=9, total 17.
    expect(result.farmTotalTonnes).toBe(17);
  });

  it("never guesses a lime requirement from pH alone — a field with no real laboratory lime figure contributes 0 to the farm total and is counted separately, never silently treated as needing none", () => {
    const result = aggregateFarmLimeRequirement([
      field({ id: "f1", areaHa: 5, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R1", p: 5, k: 90, pH: 5.2 } } }), // real low pH, no lime figure reported
      field({ id: "f2", areaHa: 3, fertility: {} }), // no test at all
    ]);
    expect(result.fields[0].rateTHa).toBeUndefined();
    expect(result.fields[0].fieldTonnes).toBeUndefined();
    expect(result.farmTotalTonnes).toBe(0);
    expect(result.fieldsWithoutLimeEvidence).toBe(2);
  });

  it("never labels a partial total as complete — fieldsWithoutLimeEvidence discloses exactly how many real fields are missing", () => {
    const result = aggregateFarmLimeRequirement([
      field({ id: "f1", areaHa: 5, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R1", p: 5, k: 90, pH: 6, limeRequirement: 1 } } }),
      field({ id: "f2", areaHa: 3, fertility: {} }),
      field({ id: "f3", areaHa: 2, fertility: {} }),
    ]);
    expect(result.farmTotalTonnes).toBe(5);
    expect(result.fieldsWithoutLimeEvidence).toBe(2);
  });

  it("returns a real, honest zero total with no fields at all — never fabricates a placeholder line", () => {
    expect(aggregateFarmLimeRequirement([])).toEqual({ fields: [], farmTotalTonnes: 0, fieldsWithoutLimeEvidence: 0 });
  });

  // Codex audit round 2 HIGH — the farm total must sum each field's real,
  // unrounded quantity and round exactly once, never sum already-rounded
  // per-field figures (which can silently lose a genuine small total).
  it("sums exact unrounded field quantities before rounding the farm total once — never loses a real small aggregate to per-field rounding", () => {
    // Each field's own exact tonnage: 0.004 t (rate 0.001 t/ha x area 4ha).
    // Each rounds to 0.00 t individually, but the true sum (0.012 t) rounds to 0.01 t.
    const result = aggregateFarmLimeRequirement([
      field({ id: "f1", areaHa: 4, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R1", p: 5, k: 90, pH: 6, limeRequirement: 0.001 } } }),
      field({ id: "f2", areaHa: 4, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R2", p: 5, k: 90, pH: 6, limeRequirement: 0.001 } } }),
      field({ id: "f3", areaHa: 4, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R3", p: 5, k: 90, pH: 6, limeRequirement: 0.001 } } }),
    ]);
    expect(result.fields[0].fieldTonnes).toBe(0); // each field's own display figure genuinely rounds to 0
    expect(result.farmTotalTonnes).toBe(0.01); // but the real farm total does not lose the aggregate
  });

  // Codex audit round 2 HIGH — malformed evidence (negative/non-finite
  // rate or area) must never contribute to the total or hide as a
  // silent zero; it is unresolved evidence, counted honestly.
  describe("invalid lime evidence never contributes to the farm total (Codex audit round 2 HIGH)", () => {
    it("treats a negative laboratory rate as unresolved evidence, never a negative contribution", () => {
      const result = aggregateFarmLimeRequirement([
        field({ id: "f1", areaHa: 5, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R1", p: 5, k: 90, pH: 6, limeRequirement: -1 } } }),
      ]);
      expect(result.fields[0].rateTHa).toBeUndefined();
      expect(result.fields[0].fieldTonnes).toBeUndefined();
      expect(result.farmTotalTonnes).toBe(0);
      expect(result.fieldsWithoutLimeEvidence).toBe(1);
    });

    it("treats a non-finite laboratory rate as unresolved evidence", () => {
      const result = aggregateFarmLimeRequirement([
        field({ id: "f1", areaHa: 5, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R1", p: 5, k: 90, pH: 6, limeRequirement: Number.NaN } } }),
      ]);
      expect(result.fields[0].rateTHa).toBeUndefined();
      expect(result.farmTotalTonnes).toBe(0);
      expect(result.fieldsWithoutLimeEvidence).toBe(1);
    });

    it("treats a negative/non-finite field area as unresolved evidence too, never a real rate x a corrupt area", () => {
      const result = aggregateFarmLimeRequirement([
        field({ id: "f1", areaHa: -5, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R1", p: 5, k: 90, pH: 6, limeRequirement: 2 } } }),
      ]);
      expect(result.fields[0].rateTHa).toBeUndefined();
      expect(result.farmTotalTonnes).toBe(0);
      expect(result.fieldsWithoutLimeEvidence).toBe(1);
    });

    it("never lets one invalid field's evidence contaminate a real, valid field's own correct total", () => {
      const result = aggregateFarmLimeRequirement([
        field({ id: "f1", areaHa: 5, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R1", p: 5, k: 90, pH: 6, limeRequirement: 2 } } }),
        field({ id: "f2", areaHa: 3, fertility: { verifiedTest: { sampleDate: "2026-06-01", laboratory: "Lab", sampleRef: "R2", p: 5, k: 90, pH: 6, limeRequirement: -1 } } }),
      ]);
      expect(result.farmTotalTonnes).toBe(10); // only f1's real 5*2=10 contributes
      expect(result.fieldsWithoutLimeEvidence).toBe(1);
    });
  });
});

describe("aggregateFarmNutrientRequirementKg", () => {
  it("sums each field's own requirementKgHa x areaHa to a real farm total", () => {
    const result = aggregateFarmNutrientRequirementKg([
      { areaHa: 10, requirementKgHa: { n: 100, p: 20, k: 30 } },
      { areaHa: 5, requirementKgHa: { n: 50, p: 10, k: 15 } },
    ]);
    expect(result.n).toBe(1250); // 10*100 + 5*50
    expect(result.p).toBe(250);
    expect(result.k).toBe(375);
    expect(result.fieldsIncluded).toBe(2);
  });

  it("excludes a field with no real requirement figure, never treating it as zero-and-included", () => {
    const result = aggregateFarmNutrientRequirementKg([
      { areaHa: 10, requirementKgHa: { n: 100, p: 20, k: 30 } },
      { areaHa: 5, requirementKgHa: undefined },
    ]);
    expect(result.n).toBe(1000);
    expect(result.fieldsIncluded).toBe(1);
  });

  it("excludes a field with a non-finite or non-positive area, never a real rate x a corrupt area", () => {
    const result = aggregateFarmNutrientRequirementKg([
      { areaHa: 0, requirementKgHa: { n: 100, p: 20, k: 30 } },
      { areaHa: -5, requirementKgHa: { n: 100, p: 20, k: 30 } },
      { areaHa: Number.NaN, requirementKgHa: { n: 100, p: 20, k: 30 } },
    ]);
    expect(result.fieldsIncluded).toBe(0);
    expect(result.n).toBe(0);
  });

  it("returns real zeros, not undefined, for an empty farm", () => {
    const result = aggregateFarmNutrientRequirementKg([]);
    expect(result).toEqual({ n: 0, p: 0, k: 0, fieldsIncluded: 0 });
  });
});
