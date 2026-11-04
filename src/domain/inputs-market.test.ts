import { describe, expect, it } from "vitest";
import {
  BEEF_CONCENTRATE_ITEM_ID,
  INPUT_MARKET_CATALOGUE,
  INPUT_MARKET_CATEGORIES,
  buildFeedNeed,
  buildFertiliserNeedLines,
  catalogueForCategory,
  fertiliserUpstreamDisclosure,
  impliedCostAtReference,
  normaliseUnitPrices,
  summariseCategory,
  type InputCatalogueItem,
} from "./inputs-market";
import { buildFertiliserStockBand } from "./fertiliser-stock";
import { deriveCattleGroupProductionPlanMetrics, type CattleGroupProductionPlan } from "./cattle-group-production-plan";
import { calculateFarmConcentrateFeedRequirement } from "./finance";
import { CSO_COMPOUND_18_6_12, CSO_UREA_46N, latestPoint } from "./market";
import { WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE } from "./livestock";
import { tracked, type LivestockGroup } from "./types";
import type { FarmFertiliserAggregatedProduct } from "./fertiliser-plan";

const item = (id: string): InputCatalogueItem => {
  const found = INPUT_MARKET_CATALOGUE.find((candidate) => candidate.id === id);
  if (!found) throw new Error(id);
  return found;
};

function group(overrides: Partial<LivestockGroup> = {}): LivestockGroup {
  return {
    id: "g-1",
    farmId: "farm-1",
    category: "steer",
    label: "Finishing steers",
    count: tracked(20, "verified", "Farmer"),
    system: "housed",
    value: tracked(0, "estimated", "test"),
    ...overrides,
  } as LivestockGroup;
}

function plan(overrides: Partial<CattleGroupProductionPlan> = {}): CattleGroupProductionPlan {
  return { groupId: "g-1", farmId: "farm-1", targetDate: "2027-01-31", targetWeightKg: 650, concentrateKgHeadDay: 4, ...overrides };
}

const AS_OF = "2026-11-02";

function feedInput(g: LivestockGroup, p?: CattleGroupProductionPlan) {
  return {
    group: g,
    ...(p ? { plan: p } : {}),
    metrics: deriveCattleGroupProductionPlanMetrics({ plan: p, currentWeightKg: g.avgWeightKg?.value, headCount: g.count.value, asOfDate: AS_OF }),
  };
}

function aggregatedProduct(name: string, overrides: Partial<FarmFertiliserAggregatedProduct> = {}): FarmFertiliserAggregatedProduct {
  return {
    productKey: `${name}|x`,
    name,
    npkAnalysis: "x",
    catalogueVerified: true,
    unit: "kg",
    totalKg: 0,
    displayTonnes: 0,
    bagConversion: { status: "UNAVAILABLE", reasonCode: "NO_VERIFIED_PACKAGE_SIZE" },
    contributions: [],
    knownCostEur: 0,
    estimatedCostEur: null,
    provisional: false,
    ...overrides,
  };
}

describe("category registry and catalogue", () => {
  it("defines Fertiliser and Feed as data, every catalogue item belonging to a registered category", () => {
    expect(INPUT_MARKET_CATEGORIES.map((c) => c.id)).toEqual(["fertiliser", "feed"]);
    const ids = new Set(INPUT_MARKET_CATEGORIES.map((c) => c.id));
    for (const entry of INPUT_MARKET_CATALOGUE) expect(ids.has(entry.category)).toBe(true);
    expect(new Set(INPUT_MARKET_CATALOGUE.map((entry) => entry.id)).size).toBe(INPUT_MARKET_CATALOGUE.length);
  });

  it("prices fertilisers from the same CSO series the fertiliser plan is costed with, dated to the observation", () => {
    const blend = item("fert-18-6-12");
    expect(blend.referencePrice).toMatchObject({
      status: "available",
      eurPerTonne: latestPoint(CSO_COMPOUND_18_6_12).value,
      basis: "official_statistic",
      referencePeriod: latestPoint(CSO_COMPOUND_18_6_12).month,
    });
    expect(item("fert-protected-urea").referencePrice).toMatchObject({ eurPerTonne: latestPoint(CSO_UREA_46N).value });
    const ureaPrice = item("fert-protected-urea").referencePrice;
    expect(ureaPrice.status === "available" ? ureaPrice.caveat : undefined).toMatch(/near match/);
  });

  it("labels the concentrate price as a published benchmark and leaves unsourced feeds without a price", () => {
    expect(item(BEEF_CONCENTRATE_ITEM_ID).referencePrice).toMatchObject({
      status: "available",
      basis: "published_benchmark",
      eurPerTonne: WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE,
    });
    const unsourced = catalogueForCategory("feed").filter((entry) => entry.id !== BEEF_CONCENTRATE_ITEM_ID);
    expect(unsourced.length).toBeGreaterThan(0);
    for (const entry of unsourced) expect(entry.referencePrice.status).toBe("unavailable");
  });
});

describe("normaliseUnitPrices", () => {
  it("normalises a straight fertiliser to €/t, €/kg and €/kg of its one nutrient", () => {
    const urea = item("fert-protected-urea");
    const perTonne = latestPoint(CSO_UREA_46N).value;
    expect(normaliseUnitPrices(urea)).toEqual({
      eurPerTonne: perTonne,
      eurPerKg: Math.round((perTonne / 1000) * 100) / 100,
      eurPerKgNutrient: { label: "N", value: Math.round((perTonne / 460) * 100) / 100 },
    });
  });

  it("uses total N+P+K for a compound, never one nutrient alone", () => {
    const result = normaliseUnitPrices(item("fert-18-6-12"));
    expect(result?.eurPerKgNutrient?.label).toBe("N+P+K");
    expect(result?.eurPerKgNutrient?.value).toBe(Math.round((latestPoint(CSO_COMPOUND_18_6_12).value / 360) * 100) / 100);
  });

  it("returns null (never a zero price) when the price is not sourced, and omits nutrient pricing for feed", () => {
    expect(normaliseUnitPrices(item("feed-rolled-barley"))).toBeNull();
    expect(normaliseUnitPrices(item(BEEF_CONCENTRATE_ITEM_ID))).toEqual({ eurPerTonne: 350, eurPerKg: 0.35 });
  });
});

describe("impliedCostAtReference", () => {
  it("costs quantity × reference €/t exactly, rounded to the euro", () => {
    expect(impliedCostAtReference(2500, item(BEEF_CONCENTRATE_ITEM_ID))).toMatchObject({ status: "known", eur: 875, eurPerTonne: 350 });
  });

  it("is unknown — never €0 — without a sourced price or catalogue item", () => {
    expect(impliedCostAtReference(1000, item("feed-maize-meal")).status).toBe("unknown");
    expect(impliedCostAtReference(1000, undefined).status).toBe("unknown");
  });
});

describe("buildFertiliserNeedLines", () => {
  it("passes through the canonical stock band quantities: remaining without stock, shortfall with recorded stock", () => {
    const lines = buildFertiliserNeedLines({
      stockBands: [
        buildFertiliserStockBand({ product: "18-6-12", npkAnalysis: "18-6-12", remainingRequirementKg: 4000 }),
        buildFertiliserStockBand({
          product: "Protected Urea",
          npkAnalysis: "46-0-0",
          remainingRequirementKg: 3000,
          currentStock: { product: "Protected Urea", quantityKg: 1000, effectiveDate: "2026-10-01", source: "Farmer", recordedAt: "2026-10-01T00:00:00Z" },
        }),
        buildFertiliserStockBand({ product: "0-7-30", remainingRequirementKg: 0 }),
      ],
      aggregation: { status: "READY", products: [aggregatedProduct("18-6-12", { provisional: true })] },
    });
    expect(lines.map((l) => [l.label, l.requirementKg, l.toBuyKg, l.stock])).toEqual([
      ["18-6-12", 4000, 4000, "not_recorded"],
      ["Protected Urea", 3000, 2000, "recorded"],
    ]);
    expect(lines[0].impliedCost).toMatchObject({ status: "known", eur: Math.round(4 * latestPoint(CSO_COMPOUND_18_6_12).value) });
    expect(lines[1].impliedCost).toMatchObject({ status: "known", eur: Math.round(2 * latestPoint(CSO_UREA_46N).value) });
    expect(lines[0].notes.join(" ")).toMatch(/provisional/);
    expect(lines[0].quoteProductName).toBe("18-6-12");
  });

  it("keeps a product outside the catalogue but leaves its cost unknown", () => {
    const [line] = buildFertiliserNeedLines({
      stockBands: [buildFertiliserStockBand({ product: "CAN 27%", remainingRequirementKg: 500 })],
      aggregation: { status: "INCOMPLETE", products: [] },
    });
    expect(line.catalogueItemId).toBeNull();
    expect(line.impliedCost.status).toBe("unknown");
  });

  it("discloses an incomplete upstream plan", () => {
    expect(fertiliserUpstreamDisclosure("INCOMPLETE")).toMatch(/known subtotal/);
    expect(fertiliserUpstreamDisclosure("READY")).toBeNull();
  });
});

describe("buildFeedNeed", () => {
  it("sizes a plan-led group as kg/head/day × head × days to target, costed at the reference and at the plan price", () => {
    const { lines, gaps } = buildFeedNeed([feedInput(group(), plan({ concentratePriceEurT: 380 }))]);
    expect(gaps).toEqual([]);
    // 2026-11-02 → 2027-01-31 = 90 days; 4 × 20 × 90 = 7,200 kg.
    expect(lines[0]).toMatchObject({ basis: "cattle_production_plan", requirementKg: 7200, toBuyKg: 7200, stock: "not_tracked" });
    expect(lines[0].impliedCost).toMatchObject({ status: "known", eur: 2520 });
    expect(lines[0].planPriceCost).toEqual({ eurPerTonne: 380, eur: 2736 });
    expect(lines[0].horizon).toContain("90 days");
  });

  it("treats a stated diet without a target date as a gap, never a model substitute", () => {
    const { lines, gaps } = buildFeedNeed([feedInput(group({ category: "weanling", avgWeightKg: tracked(335, "estimated", "x") }), plan({ targetDate: undefined }))]);
    expect(lines).toEqual([]);
    expect(gaps[0]).toMatchObject({ label: "Finishing steers", action: { href: "/cattle/groups/g-1" } });
    expect(gaps[0].reason).toMatch(/target date/);
  });

  it("falls back to the existing finance feed model when a group has no plan rate, labelled as a model estimate", () => {
    const weanlings = group({ id: "g-w", label: "Weanlings", category: "weanling", avgWeightKg: tracked(335, "estimated", "x") });
    const { lines } = buildFeedNeed([feedInput(weanlings)]);
    const model = calculateFarmConcentrateFeedRequirement([weanlings]);
    expect(model.sourceGroupLabels).toEqual(["Weanlings"]);
    expect(lines[0]).toMatchObject({ basis: "feed_model_estimate", requirementKg: model.totalTonnes * 1000 });
    expect(lines[0].notes.join(" ")).toMatch(/Model estimate/);
  });

  it("is a gap when neither a plan rate nor a model covers the group", () => {
    const { lines, gaps } = buildFeedNeed([feedInput(group({ category: "steer", avgWeightKg: undefined }))]);
    expect(lines).toEqual([]);
    expect(gaps).toHaveLength(1);
  });
});

describe("summariseCategory", () => {
  it("is complete only when every line is costed and nothing is a gap", () => {
    const { lines } = buildFeedNeed([feedInput(group(), plan())]);
    expect(summariseCategory("feed", lines, []).completeness).toBe("complete");
    expect(summariseCategory("feed", lines, [], true).completeness).toBe("partial");
    expect(summariseCategory("feed", [], []).completeness).toBe("none");
  });

  it("totals only known costs and counts the unknown ones", () => {
    const lines = buildFertiliserNeedLines({
      stockBands: [
        buildFertiliserStockBand({ product: "18-6-12", remainingRequirementKg: 1000 }),
        buildFertiliserStockBand({ product: "CAN 27%", remainingRequirementKg: 1000 }),
      ],
      aggregation: { status: "READY", products: [] },
    });
    const summary = summariseCategory("fertiliser", lines, []);
    expect(summary.totalToBuyKg).toBe(2000);
    expect(summary.knownImpliedCostEur).toBe(latestPoint(CSO_COMPOUND_18_6_12).value);
    expect(summary.linesWithUnknownCost).toBe(1);
    expect(summary.completeness).toBe("partial");
  });
});
