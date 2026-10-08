import { describe, expect, it } from "vitest";
import {
  aggregateFarmFertiliserPurchasing,
  buildFarmFertiliserQuoteBasket,
  type FarmFertiliserAggregationFieldInput,
  type FarmFertiliserPurchaseRequirementLine,
} from "@/domain/fertiliser-plan";
import { createFertiliserQuoteRequestDraft, setRequestedQuantity } from "@/domain/fertiliser-quote-request";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { tracked } from "@/domain/types";
import type { FertiliserProduct, Field, FieldPurchaseStatus, LivestockGroup } from "@/domain/types";
import { formatDisplayTonnes, formatProductKg } from "@/lib/farm-fertiliser-basket-presentation";
import {
  PLAN_HANDOFF,
  marketHandoffView,
  outstandingQuantityView,
  planHandoffView,
  stillToBuyLines,
  wholeFarmFieldRows,
  type WholeFarmFieldInput,
} from "./whole-farm-nutrient-plan-presentation";

// Farm Spatial V2 Phase 5 — whole-farm nutrient plan presentation over the
// canonical aggregation and basket.

const FARM_ID = "farm-wf";
const BASKET_META = { farmId: FARM_ID, createdAt: "2026-10-08T09:00:00.000Z" };
const REQUEST_META = { requestId: "req-wf", createdAt: "2026-10-08T09:05:00.000Z" };

function product(name: string, npkAnalysis: string, totalKg: number, costEur: number): FertiliserProduct {
  return { name, npkAnalysis, rateKgHa: 0, totalKg, costEur };
}

function input(fieldId: string, purchaseStatus: FieldPurchaseStatus, purchasedProducts: FertiliserProduct[] = []): FarmFertiliserAggregationFieldInput {
  return { fieldId, fieldName: `Field ${fieldId}`, plan: { purchaseStatus, purchasedProducts } };
}

function breakdown(fieldId: string, status: WholeFarmFieldInput["status"] = "OK"): WholeFarmFieldInput {
  return { fieldId, fieldName: `Field ${fieldId}`, areaHa: 5, seasonalUse: "grazing", status };
}

const RECOMMENDED: FieldPurchaseStatus = { status: "RECOMMENDED" };
const CREDIT_NOT_COUNTED: FieldPurchaseStatus = { status: "RECOMMENDED_CREDIT_NOT_COUNTED", reasonCode: "SLURRY_APPLICATION_CONTEXT_TIMING_NOT_SUPPORTED", missingInputs: [] };
const UNKNOWN: FieldPurchaseStatus = { status: "UNKNOWN", reasonCode: "MISSING_LIVESTOCK_DATA", missingInputs: ["livestockGroups"] };
const NOT_APPLICABLE: FieldPurchaseStatus = { status: "NOT_APPLICABLE", reasonCode: "TILLAGE_FIELD_NOT_SUPPORTED" };

const blend = (kg: number) => product("18-6-12", "18-6-12", kg, kg * 0.6);
const urea = (kg: number) => product("Protected Urea", "46-0-0", kg, kg * 0.7);

describe("outstandingQuantityView", () => {
  it("leads with the largest canonical product and copies its displayTonnes/totalKg verbatim", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([input("a", RECOMMENDED, [blend(1000), urea(250)]), input("b", RECOMMENDED, [blend(2001)])]);
    const view = outstandingQuantityView(aggregation);
    const blendLine = aggregation.products.find((p) => p.name === "18-6-12")!;
    expect(view.primary?.name).toBe("18-6-12");
    expect(view.primary?.tonnesText).toBe(formatDisplayTonnes(blendLine.displayTonnes));
    expect(view.primary?.tonnesText).toBe("3.01 t");
    expect(view.primary?.kgText).toBe(formatProductKg(blendLine.totalKg));
    expect(view.primary?.fieldCountText).toBe("2 fields");
    expect(view.supporting.map((p) => p.name)).toEqual(["Protected Urea"]);
    expect(view.isWholeFarm).toBe(true);
    expect(view.emptyMessage).toBeNull();
  });

  it("never presents an INCOMPLETE aggregation as the whole-farm requirement", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([input("a", RECOMMENDED, [blend(1000)]), input("b", UNKNOWN)]);
    const view = outstandingQuantityView(aggregation);
    expect(view.isWholeFarm).toBe(false);
    expect(view.status.label).toBe("Incomplete");
    expect(view.status.message).toMatch(/known subtotal, not the whole-farm requirement/);
  });

  it("states an honest message, never a zero quantity, when nothing is aggregated", () => {
    const view = outstandingQuantityView(aggregateFarmFertiliserPurchasing([input("a", UNKNOWN)]));
    expect(view.primary).toBeNull();
    expect(view.emptyMessage).toMatch(/No fertiliser can be totalled yet/);
  });

  it("does not mutate the aggregation", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([input("a", RECOMMENDED, [urea(100)]), input("b", RECOMMENDED, [blend(900)])]);
    const before = structuredClone(aggregation);
    outstandingQuantityView(aggregation);
    wholeFarmFieldRows([breakdown("a"), breakdown("b")], aggregation);
    expect(aggregation).toEqual(before);
  });
});

describe("wholeFarmFieldRows", () => {
  const aggregation = aggregateFarmFertiliserPurchasing([
    input("a", RECOMMENDED, [blend(1000), urea(250)]),
    input("b", CREDIT_NOT_COUNTED, [blend(400)]),
    input("c", UNKNOWN),
    input("d", NOT_APPLICABLE),
  ]);
  const rows = wholeFarmFieldRows([breakdown("a"), breakdown("b"), breakdown("c", "BLOCKED_INSUFFICIENT_EVIDENCE"), breakdown("d", "NOT_APPLICABLE")], aggregation);
  const byId = new Map(rows.map((r) => [r.fieldId, r]));

  it("shows each field's own canonical contribution kg, not a recomputed share", () => {
    expect(byId.get("a")!.purchase.contributions.map((c) => [c.name, c.kgText])).toEqual([
      ["18-6-12", formatProductKg(1000)],
      ["Protected Urea", formatProductKg(250)],
    ]);
    expect(byId.get("a")!.purchase.label).toBe("Contributes to purchase");
    expect(byId.get("a")!.requirement?.label).toBe("Included in plan");
    expect(byId.get("a")!.canPlanApplication).toBe(true);
  });

  it("keeps a provisional field's quantity flagged provisional", () => {
    const b = byId.get("b")!;
    expect(b.purchase.label).toBe("Provisional quantity");
    expect(b.purchase.contributions[0].provisional).toBe(true);
  });

  it("gives an unresolved field no quantity and its reason — UNKNOWN is never zero", () => {
    const c = byId.get("c")!;
    expect(c.purchase.label).toBe("Needs more information");
    expect(c.purchase.contributions).toEqual([]);
    expect(c.purchase.detail).toBeTruthy();
    expect(c.requirement?.label).toBe("Missing evidence");
    expect(c.canPlanApplication).toBe(false);
  });

  it("links to the field's spatial plan and its persisted planner", () => {
    expect(byId.get("a")!.fieldPlanHref).toBe("/today/field/a");
    expect(byId.get("a")!.plannerHref).toBe("/nutrients?field=a");
    expect(byId.get("d")!.purchase.label).toBe("Excluded from purchasing");
  });

  it("never drops a field the aggregation knows but the overview did not list", () => {
    const extra = wholeFarmFieldRows([breakdown("a")], aggregation);
    expect(extra.map((r) => r.fieldId)).toEqual(["a", "b", "c", "d"]);
    expect(extra[1].requirement).toBeNull();
  });
});

describe("stillToBuyLines", () => {
  const line = (product: string, remainingTotalKg: number, remainingTotalTonnes: number): FarmFertiliserPurchaseRequirementLine => ({
    product,
    npkAnalysis: "18-6-12",
    recommendedTotalTonnes: 1,
    plannedTotalTonnes: 0,
    confirmedAppliedTotalTonnes: 0,
    remainingTotalTonnes,
    remainingTotalKg,
    fieldsCount: 1,
  });

  it("gates on the exact kg and never shows a positive remainder as 0.00 t", () => {
    expect(stillToBuyLines([line("A", 0, 0), line("B", 3, 0), line("C", 1500, 1.5)]).map((l) => [l.product, l.text])).toEqual([
      ["B", "< 0.01 t"],
      ["C", "1.5 t"],
    ]);
  });
});

describe("Plan and Market handoffs", () => {
  it("Plan never claims persistence", () => {
    expect(PLAN_HANDOFF.persistence).toBe("Not saved");
    expect(PLAN_HANDOFF.message).toMatch(/nothing on this page is saved to Plan/);
    const aggregation = aggregateFarmFertiliserPurchasing([input("a", RECOMMENDED, [blend(10)]), input("b", UNKNOWN)]);
    expect(planHandoffView(aggregation)).toEqual({ plannableFieldCount: 1, summary: expect.stringMatching(/^1 field has an application to plan/) });
  });

  it("Market labels a partial basket as a subtotal and states the separation", () => {
    const basket = buildFarmFertiliserQuoteBasket(aggregateFarmFertiliserPurchasing([input("a", RECOMMENDED, [blend(10)]), input("b", UNKNOWN)]), BASKET_META);
    const view = marketHandoffView(basket);
    expect(view.available).toBe(true);
    expect(view.coverage).toMatch(/known subtotal, not the farm's full requirement/);
    expect(view.separation).toMatch(/never changes the calculated requirement/);
    expect(marketHandoffView(buildFarmFertiliserQuoteBasket(aggregateFarmFertiliserPurchasing([]), BASKET_META)).available).toBe(false);
  });
});

// Real frozen vertical: field engine → farm aggregation → plan view → basket
// → quote request. Every displayed quantity reconciles with the canonical one.
describe("field → whole farm → fertiliser plan → Market reconciliation", () => {
  const herd: LivestockGroup[] = [
    { id: "g1", farmId: FARM_ID, category: "suckler_cow", label: "Cows", count: tracked(40, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
  ];
  function field(id: string, p: 1 | 2 | 3 | 4 | undefined, k: 1 | 2 | 3 | 4 | undefined): Field {
    return {
      id,
      farmId: FARM_ID,
      name: `Field ${id}`,
      areaHa: 5,
      centroid: [0, 0],
      plannedUse: tracked("grazing", "farmer_adjusted", "Farmer"),
      mappedSoil: { soilAssociation: "Fermoy", dominantSeries: "Brown Earth", texture: "Loam", drainage: "moderately_drained", coveragePct: 88, datasetVersion: "test", source: "test" },
      fertility: { ...(p !== undefined ? { pIndex: tracked(p, "verified", "Lab") } : {}), ...(k !== undefined ? { kIndex: tracked(k, "verified", "Lab") } : {}) },
      history: [],
    };
  }
  const fields = [field("a", 2, 2), field("b", 1, 3), field("c", 3, 1), field("d", undefined, 2)];
  const inputs = fields.map((f) => ({
    fieldId: f.id,
    fieldName: f.name,
    plan: calculateNutrientPlan({ field: f, farmGrasslandAreaHa: 20, livestockGroups: herd, asOfDate: "2026-10-03" }),
  }));
  const aggregation = aggregateFarmFertiliserPurchasing(inputs);
  const basket = buildFarmFertiliserQuoteBasket(aggregation, BASKET_META);
  const draft = createFertiliserQuoteRequestDraft(basket, REQUEST_META);

  it("produces real products to reconcile", () => {
    expect(aggregation.products.length).toBeGreaterThan(0);
    expect(draft.ok).toBe(true);
  });

  it("plan view, basket and quote request carry identical canonical quantities", () => {
    if (!draft.ok) throw new Error("draft failed");
    const view = outstandingQuantityView(aggregation);
    const shown = [view.primary!, ...view.supporting];
    expect(new Set(shown.map((p) => p.productKey))).toEqual(new Set(aggregation.products.map((p) => p.productKey)));
    for (const p of aggregation.products) {
      const shownLine = shown.find((s) => s.productKey === p.productKey)!;
      const basketLine = basket.lines.find((l) => l.productKey === p.productKey)!;
      const requestLine = draft.value.lines.find((l) => l.productKey === p.productKey)!;
      expect(shownLine.tonnesText).toBe(formatDisplayTonnes(basketLine.displayTonnes));
      expect(shownLine.kgText).toBe(formatProductKg(basketLine.quantityKg));
      expect(requestLine.canonicalQuantityKg).toBe(p.totalKg);
      expect(requestLine.canonicalDisplayTonnes).toBe(p.displayTonnes);
    }
  });

  it("field rows' contribution kg are the aggregation's own contributions", () => {
    const rows = wholeFarmFieldRows(
      fields.map((f) => breakdown(f.id)),
      aggregation,
    );
    for (const p of aggregation.products) {
      for (const c of p.contributions) {
        const row = rows.find((r) => r.fieldId === c.fieldId)!;
        expect(row.purchase.contributions.find((x) => x.productKey === p.productKey)?.kgText).toBe(formatProductKg(c.quantityKg));
      }
    }
  });

  it("Market cannot alter the scientific requirement: a requested quantity edit leaves aggregation, basket and plan view unchanged", () => {
    if (!draft.ok) throw new Error("draft failed");
    const aggregationBefore = structuredClone(aggregation);
    const basketBefore = structuredClone(basket);
    const viewBefore = outstandingQuantityView(aggregation);
    const line = draft.value.lines[0];
    const edited = setRequestedQuantity(draft.value, line.productKey, line.requestedTonnes + 5);
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const editedLine = edited.value.lines.find((l) => l.productKey === line.productKey)!;
    expect(editedLine.requestedTonnes).toBe(line.requestedTonnes + 5);
    expect(editedLine.canonicalQuantityKg).toBe(line.canonicalQuantityKg);
    expect(editedLine.canonicalDisplayTonnes).toBe(line.canonicalDisplayTonnes);
    expect(aggregation).toEqual(aggregationBefore);
    expect(basket).toEqual(basketBefore);
    expect(outstandingQuantityView(aggregation)).toEqual(viewBefore);
  });
});
