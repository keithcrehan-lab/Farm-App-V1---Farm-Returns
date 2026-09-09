import { describe, expect, it } from "vitest";
import {
  aggregateFarmFertiliserDemand,
  aggregateFarmFertiliserRecommendation,
  calculateRemainingFertiliserRequirement,
  nutrientContributionFromFertiliserActual,
  sumConfirmedFertiliserApplications,
  toFarmInputDemand,
  totalProductQuantityKgByProduct,
  countUnresolvedFertiliserQuantities,
} from "./fertiliser-plan";
import type { NutrientPlan } from "./types";

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
  function planWithProducts(products: NutrientPlan["purchasedProducts"]): Pick<NutrientPlan, "purchasedProducts"> {
    return { purchasedProducts: products };
  }

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
