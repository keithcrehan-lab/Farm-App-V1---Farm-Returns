import { describe, expect, it } from "vitest";
import {
  deriveQuoteRequestFarmerStatus,
  groupCompatibleQuoteDemand,
  nextQuoteRequestRevisionNumber,
  quoteQuantityToKgIfKnown,
  validateQuoteDeliveryWindow,
  validateQuoteRequestRevisionInput,
  type QuoteDemandLine,
} from "./quote-request";

describe("quoteQuantityToKgIfKnown", () => {
  it("passes kg through unchanged", () => {
    expect(quoteQuantityToKgIfKnown(500, "kg")).toBe(500);
  });

  it("converts tonnes to kg", () => {
    expect(quoteQuantityToKgIfKnown(1.5, "tonnes")).toBe(1500);
  });

  it("refuses to guess a bag-to-kg conversion", () => {
    expect(quoteQuantityToKgIfKnown(10, "bags")).toBeNull();
  });
});

describe("validateQuoteDeliveryWindow", () => {
  it("accepts a real, ordered date pair", () => {
    expect(validateQuoteDeliveryWindow({ start: "2026-10-01", end: "2026-10-15" })).toEqual({
      start: "2026-10-01",
      end: "2026-10-15",
    });
  });

  it("rejects a non-existent calendar date", () => {
    expect(() => validateQuoteDeliveryWindow({ start: "2026-02-30", end: "2026-03-01" })).toThrow(/real, existing/);
  });

  it("rejects end before start", () => {
    expect(() => validateQuoteDeliveryWindow({ start: "2026-10-15", end: "2026-10-01" })).toThrow(/on or before/);
  });

  it("rejects a missing field", () => {
    expect(() => validateQuoteDeliveryWindow({ start: "2026-10-01" })).toThrow(/end must be/);
  });
});

describe("validateQuoteRequestRevisionInput", () => {
  const validEstimated = {
    product: "18-6-12",
    quantity: 1500,
    unit: "kg",
    quantityBasis: "estimated",
    estimateSnapshot: {
      remainingRequirementKg: 1800,
      truncated: false,
      applicationsWithUnknownComposition: 0,
      fieldsWithBlockedEvidence: 0,
      asOf: "2026-09-11T08:00:00.000Z",
    },
    deliveryWindow: { start: "2026-10-01", end: "2026-10-15" },
    disclosureVersion: "v1",
    disclosureAcceptedAt: "2026-09-11T08:00:00.000Z",
  };

  it("accepts a valid estimated-basis request", () => {
    const result = validateQuoteRequestRevisionInput(validEstimated);
    expect(result.product).toBe("18-6-12");
    expect(result.quantity).toBe(1500);
    expect(result.quantityBasis).toBe("estimated");
    expect(result.estimateSnapshot?.remainingRequirementKg).toBe(1800);
    expect(result.disclosureVersion).toBe("v1");
    expect(result.disclosureAcceptedAt).toBe("2026-09-11T08:00:00.000Z");
  });

  it("accepts a valid farmer-entered request with no estimate snapshot", () => {
    const result = validateQuoteRequestRevisionInput({
      product: "Protected Urea",
      quantity: 2,
      unit: "tonnes",
      quantityBasis: "farmer_entered",
      deliveryWindow: { start: "2026-10-01", end: "2026-10-15" },
      disclosureVersion: "v1",
      disclosureAcceptedAt: "2026-09-11T08:00:00.000Z",
    });
    expect(result.quantityBasis).toBe("farmer_entered");
    expect(result.estimateSnapshot).toBeUndefined();
  });

  it("rejects a missing disclosureVersion", () => {
    const withoutVersion: Record<string, unknown> = { ...validEstimated };
    delete withoutVersion.disclosureVersion;
    expect(() => validateQuoteRequestRevisionInput(withoutVersion)).toThrow(/disclosureVersion/);
  });

  it("rejects an empty disclosureVersion", () => {
    expect(() => validateQuoteRequestRevisionInput({ ...validEstimated, disclosureVersion: "   " })).toThrow(/disclosureVersion/);
  });

  it("rejects a missing disclosureAcceptedAt", () => {
    const withoutAccepted: Record<string, unknown> = { ...validEstimated };
    delete withoutAccepted.disclosureAcceptedAt;
    expect(() => validateQuoteRequestRevisionInput(withoutAccepted)).toThrow(/disclosureAcceptedAt/);
  });

  it("rejects a malformed disclosureAcceptedAt", () => {
    expect(() => validateQuoteRequestRevisionInput({ ...validEstimated, disclosureAcceptedAt: "not-a-date" })).toThrow(/disclosureAcceptedAt/);
  });

  it("rejects a disclosureAcceptedAt materially in the future", () => {
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(() => validateQuoteRequestRevisionInput({ ...validEstimated, disclosureAcceptedAt: farFuture })).toThrow(/future/);
  });

  it("trims a product name", () => {
    const result = validateQuoteRequestRevisionInput({ ...validEstimated, product: "  18-6-12  " });
    expect(result.product).toBe("18-6-12");
  });

  it("rejects an empty product", () => {
    expect(() => validateQuoteRequestRevisionInput({ ...validEstimated, product: "   " })).toThrow(/non-empty/);
  });

  it("rejects a zero quantity", () => {
    expect(() => validateQuoteRequestRevisionInput({ ...validEstimated, quantity: 0 })).toThrow(/positive/);
  });

  it("rejects a negative quantity", () => {
    expect(() => validateQuoteRequestRevisionInput({ ...validEstimated, quantity: -5 })).toThrow(/positive/);
  });

  it("rejects a non-finite quantity", () => {
    expect(() => validateQuoteRequestRevisionInput({ ...validEstimated, quantity: Infinity })).toThrow(/finite/);
  });

  it("rejects an unlisted unit", () => {
    expect(() => validateQuoteRequestRevisionInput({ ...validEstimated, unit: "litres" })).toThrow(/unit must be one of/);
  });

  it("rejects an unrecognised quantityBasis", () => {
    expect(() => validateQuoteRequestRevisionInput({ ...validEstimated, quantityBasis: "guessed" })).toThrow(/quantityBasis/);
  });

  it("rejects an estimated-basis request with no estimateSnapshot", () => {
    const withoutSnapshot: Record<string, unknown> = { ...validEstimated };
    delete withoutSnapshot.estimateSnapshot;
    expect(() => validateQuoteRequestRevisionInput(withoutSnapshot)).toThrow(/estimateSnapshot is required/);
  });

  it("rejects a farmer-entered request that carries an estimateSnapshot anyway", () => {
    expect(() =>
      validateQuoteRequestRevisionInput({ ...validEstimated, quantityBasis: "farmer_entered" }),
    ).toThrow(/must be omitted/);
  });

  it("rejects an estimateSnapshot with a negative remainingRequirementKg", () => {
    expect(() =>
      validateQuoteRequestRevisionInput({
        ...validEstimated,
        estimateSnapshot: { ...validEstimated.estimateSnapshot, remainingRequirementKg: -1 },
      }),
    ).toThrow(/remainingRequirementKg/);
  });

  it("rejects an estimateSnapshot with a malformed asOf", () => {
    expect(() =>
      validateQuoteRequestRevisionInput({
        ...validEstimated,
        estimateSnapshot: { ...validEstimated.estimateSnapshot, asOf: "not-a-date" },
      }),
    ).toThrow(/asOf must be a real ISO/);
  });

  it("accepts an optional packaging string, trimmed", () => {
    const result = validateQuoteRequestRevisionInput({ ...validEstimated, packaging: "  25kg bags  " });
    expect(result.packaging).toBe("25kg bags");
  });

  it("rejects an empty packaging string", () => {
    expect(() => validateQuoteRequestRevisionInput({ ...validEstimated, packaging: "   " })).toThrow(/packaging/);
  });
});

describe("nextQuoteRequestRevisionNumber", () => {
  it("starts a brand-new request at revision 1", () => {
    expect(nextQuoteRequestRevisionNumber(null)).toBe(1);
  });

  it("increments an existing revision by exactly one", () => {
    expect(nextQuoteRequestRevisionNumber(1)).toBe(2);
    expect(nextQuoteRequestRevisionNumber(4)).toBe(5);
  });
});

describe("deriveQuoteRequestFarmerStatus", () => {
  it("is requested when never withdrawn", () => {
    expect(deriveQuoteRequestFarmerStatus(null)).toBe("requested");
  });

  it("is withdrawn once a real withdrawal timestamp exists", () => {
    expect(deriveQuoteRequestFarmerStatus("2026-09-12T00:00:00.000Z")).toBe("withdrawn");
  });
});

describe("groupCompatibleQuoteDemand", () => {
  const windowA = { start: "2026-10-01", end: "2026-10-15" };
  const windowB = { start: "2026-11-01", end: "2026-11-15" };

  it("combines 1.5 tonnes and 500kg of the same product and window into exactly 2000kg once (brief Q06)", () => {
    const lines: QuoteDemandLine[] = [
      { requestId: "r1", revisionId: "r1v1", farmId: "farmA", product: "18-6-12", quantity: 1.5, unit: "tonnes", deliveryWindow: windowA },
      { requestId: "r2", revisionId: "r2v1", farmId: "farmB", product: "18-6-12", quantity: 500, unit: "kg", deliveryWindow: windowA },
    ];
    const groups = groupCompatibleQuoteDemand(lines);
    expect(groups).toHaveLength(1);
    expect(groups[0].product).toBe("18-6-12");
    expect(groups[0].deliveryWindow).toEqual(windowA);
    expect(groups[0].resolvedTotalKg).toBe(2000);
    expect(groups[0].resolvedLineIds).toEqual(["r1v1", "r2v1"]);
    expect(groups[0].unresolvedLines).toEqual([]);
  });

  it("keeps an incompatible product out of another product's group (brief Q05)", () => {
    const lines: QuoteDemandLine[] = [
      { requestId: "r1", revisionId: "r1v1", farmId: "farmA", product: "18-6-12", quantity: 1000, unit: "kg", deliveryWindow: windowA },
      { requestId: "r2", revisionId: "r2v1", farmId: "farmB", product: "Protected Urea", quantity: 500, unit: "kg", deliveryWindow: windowA },
    ];
    const groups = groupCompatibleQuoteDemand(lines);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.product).sort()).toEqual(["18-6-12", "Protected Urea"]);
  });

  it("keeps the same product in a different window out of another window's group", () => {
    const lines: QuoteDemandLine[] = [
      { requestId: "r1", revisionId: "r1v1", farmId: "farmA", product: "18-6-12", quantity: 1000, unit: "kg", deliveryWindow: windowA },
      { requestId: "r2", revisionId: "r2v1", farmId: "farmB", product: "18-6-12", quantity: 1000, unit: "kg", deliveryWindow: windowB },
    ];
    const groups = groupCompatibleQuoteDemand(lines);
    expect(groups).toHaveLength(2);
    const byWindow = new Map(groups.map((g) => [`${g.deliveryWindow.start}-${g.deliveryWindow.end}`, g]));
    expect(byWindow.get("2026-10-01-2026-10-15")?.resolvedTotalKg).toBe(1000);
    expect(byWindow.get("2026-11-01-2026-11-15")?.resolvedTotalKg).toBe(1000);
  });

  it("blocks an unknown bag-weight line from the resolved total, never dropping or guessing it (brief Q06)", () => {
    const lines: QuoteDemandLine[] = [
      { requestId: "r1", revisionId: "r1v1", farmId: "farmA", product: "18-6-12", quantity: 1000, unit: "kg", deliveryWindow: windowA },
      { requestId: "r2", revisionId: "r2v1", farmId: "farmB", product: "18-6-12", quantity: 20, unit: "bags", deliveryWindow: windowA },
    ];
    const groups = groupCompatibleQuoteDemand(lines);
    expect(groups).toHaveLength(1);
    expect(groups[0].resolvedTotalKg).toBe(1000);
    expect(groups[0].resolvedLineIds).toEqual(["r1v1"]);
    expect(groups[0].unresolvedLines).toEqual([
      { requestId: "r2", revisionId: "r2v1", farmId: "farmB", quantity: 20, unit: "bags" },
    ]);
  });

  it("returns an empty array for no lines", () => {
    expect(groupCompatibleQuoteDemand([])).toEqual([]);
  });
});
