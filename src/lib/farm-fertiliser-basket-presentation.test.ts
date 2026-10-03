import { describe, expect, it } from "vitest";
import { aggregateFarmFertiliserPurchasing, buildFarmFertiliserQuoteBasket } from "@/domain/fertiliser-plan";
import type { FieldPurchaseStatus } from "@/domain/types";
import {
  aggregationStatusCounts,
  basketCostSummary,
  basketStatusCounts,
  basketStatusPresentation,
  emptyRequirementMessage,
  farmCostSummary,
  farmFieldGroups,
} from "./farm-fertiliser-basket-presentation";

const RECOMMENDED: FieldPurchaseStatus = { status: "RECOMMENDED" };
const line = (totalKg: number, costEur: number) => ({ name: "18-6-12", npkAnalysis: "18-6-12", rateKgHa: 0, totalKg, costEur });
const input = (fieldId: string, purchaseStatus: FieldPurchaseStatus, kg?: number, cost?: number) => ({
  fieldId,
  fieldName: fieldId,
  plan: { purchaseStatus, purchasedProducts: kg === undefined ? [] : [line(kg, cost ?? 0)] },
});

describe("farm fertiliser basket presentation", () => {
  it("states the awaiting-evidence count and never calls an incomplete subtotal the total", () => {
    const a = aggregateFarmFertiliserPurchasing([
      input("a", RECOMMENDED, 1000, 620),
      input("b", { status: "WITHHELD_MIXED_EVIDENCE", reasonCode: "MIXED_SOIL_INDEX_EVIDENCE", missingInputs: [] }),
      input("c", { status: "UNKNOWN", reasonCode: "MISSING_LIVESTOCK_DATA", missingInputs: [] }),
    ]);
    const status = basketStatusPresentation(a.status, aggregationStatusCounts(a));
    expect(status.label).toBe("Incomplete");
    expect(status.message).toContain("2 fields require more information before fertiliser can be included.");
    expect(farmCostSummary(a)).toEqual({ label: "Known subtotal (incomplete)", value: "€620" });
    expect(farmFieldGroups(a)[0]).toMatchObject({ key: "awaiting", heading: "2 fields require more information before fertiliser can be included" });
  });

  it("names a product whose price is unknown instead of showing €0", () => {
    const a = aggregateFarmFertiliserPurchasing([input("a", RECOMMENDED, 1000, Number.NaN)]);
    const basket = buildFarmFertiliserQuoteBasket(a, { farmId: "farm-1", createdAt: "2026-10-03T00:00:00.000Z" });
    for (const summary of [farmCostSummary(a), basketCostSummary(basket)]) {
      expect(summary.label).toBe("Known subtotal (incomplete)");
      expect(summary.unknownNote).toBe("Price unavailable for 18-6-12 — not included in the cost.");
    }
    expect(basketStatusPresentation(basket.status, basketStatusCounts(basket)).label).toBe("Ready");
  });

  it("keeps NONE_NEEDED, excluded and unresolved fields in distinct groups", () => {
    const a = aggregateFarmFertiliserPurchasing([
      input("none", { status: "NONE_NEEDED", basis: "BELOW_PRODUCT_THRESHOLD" }),
      input("buffer", { status: "PROHIBITED", reasonCode: "WATER_BUFFER_CHEMICAL_FERTILISER_PROHIBITED" }),
      input("unknown", { status: "UNKNOWN", reasonCode: "MISSING_SOIL_FERTILITY_INDEX", missingInputs: [] }),
    ]);
    expect(farmFieldGroups(a).map((g) => [g.key, g.fields.map((f) => f.fieldId)])).toEqual([
      ["awaiting", ["unknown"]],
      ["none_needed", ["none"]],
      ["excluded", ["buffer"]],
    ]);
    expect(emptyRequirementMessage(a)).toMatch(/No fertiliser can be totalled yet — 1 field requires more information/);
  });
});
