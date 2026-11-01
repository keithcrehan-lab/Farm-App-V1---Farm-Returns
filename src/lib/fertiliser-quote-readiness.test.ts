import { describe, expect, it } from "vitest";
import { buildFertiliserQuoteReadiness } from "./fertiliser-quote-readiness";
import { aggregateFarmFertiliserPurchasing } from "@/domain/fertiliser-plan";
import type { Field } from "@/domain/types";
import type { FieldProductionCycle } from "@/domain/fertiliser-field-evidence";

const field = (overrides: Partial<Field> = {}): Field => ({
  id: "f1", farmId: "farm", name: "P Collins", areaHa: 4,
  centroid: [0, 0],
  fertility: {
    pIndex: { value: 2, status: "verified", source: "Lab" },
    kIndex: { value: 2, status: "verified", source: "Lab" },
    verifiedTest: { sampleDate: "2026-01-01", laboratory: "Lab", sampleRef: "1", p: 4, k: 80, pH: 6.2 },
  },
  commonageStatus: { value: "not_commonage", status: "verified", source: "DAFM" },
  waterBufferContext: { value: { featureType: "surface_water", distanceM: 12, localOverrideStatus: "verified_none" }, status: "verified", source: "EPA" },
  ...overrides,
} as Field);

const cycle: FieldProductionCycle = {
  id: "c1", fieldId: "f1", season: "2026", cropSystem: "GRASS_GRAZING", status: "active",
  evidence: {
    cropSystem: { value: "GRASS_GRAZING", method: "FARMER_DECLARED", source: "Farmer" },
    grazingProductionSystem: { value: "SUCKLER_CALF_TO_BEEF", method: "FARMER_DECLARED", source: "Farmer" },
    chemicalNAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Farmer" },
    chemicalPAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Farmer" },
    chemicalKAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Farmer" },
  },
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

describe("buildFertiliserQuoteReadiness", () => {
  it("is complete when every applicable P3/legal input is available", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([{ fieldId: "f1", fieldName: "P Collins", plan: { purchaseStatus: { status: "NONE_NEEDED", basis: "REMAINING_ZERO" }, purchasedProducts: [], calculationVersion: "p3" } }]);
    const result = buildFertiliserQuoteReadiness({ fields: [field()], cycles: [cycle], slurryAllocations: [], aggregation });
    expect(result.ready).toBe(true);
    expect(result.percentage).toBe(100);
    expect(result.remainingCount).toBe(0);
  });

  it("shows missing production-cycle and legal evidence as incomplete checks", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([{ fieldId: "f1", fieldName: "P Collins", plan: { purchaseStatus: { status: "UNKNOWN", reasonCode: "P3_MISSING_PRODUCTION_CYCLE", missingInputs: ["productionCycle"] }, purchasedProducts: [], calculationVersion: "p3" } }]);
    const result = buildFertiliserQuoteReadiness({ fields: [field({ commonageStatus: undefined, waterBufferContext: undefined })], cycles: [], slurryAllocations: [], aggregation });
    expect(result.ready).toBe(false);
    expect(result.items.find((item) => item.label === "Field use / production cycle")?.complete).toBe(false);
  });

  it("routes stocking evidence to cattle management", () => {
    const aggregation = aggregateFarmFertiliserPurchasing([{ fieldId: "f1", fieldName: "P Collins", plan: { purchaseStatus: { status: "UNKNOWN", reasonCode: "INCOMPLETE_EVIDENCE", missingInputs: ["annualOrganicNStockingRateKgHa"] }, purchasedProducts: [], calculationVersion: "p3" } }]);
    const result = buildFertiliserQuoteReadiness({ fields: [field()], cycles: [cycle], slurryAllocations: [], aggregation });
    const item = result.items.find((row) => row.label === "Livestock / grazing stocking evidence");
    expect(item?.complete).toBe(false);
    expect(item?.href).toBe("/cattle/manage");
  });
});
