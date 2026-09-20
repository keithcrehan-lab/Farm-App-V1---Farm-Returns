import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createMarketPriceObservation, canonicalContentHashInput, type MarketPriceObservation, type CreateMarketPriceObservationInput } from "./market-evidence";
import { resolveMarketReferencePrice } from "./market-price-resolution";
import type { AuditableMarketPriceResolution } from "./market-price-resolution";
import {
  buildFertiliserPlanCostAssessment,
  costFertiliserProductLine,
  sumExactFertiliserQuantitiesKg,
  FERTILISER_PLAN_COST_METHODOLOGY_LIMITATION,
  type FertiliserPlanCostLine,
} from "./fertiliser-plan-cost";
import type { EngineOutcome } from "./evidence";

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function observation(overrides: Partial<CreateMarketPriceObservationInput> = {}): MarketPriceObservation {
  const fields = {
    datasetId: "AJM09",
    sourceSeriesCode: "012",
    referencePeriod: "2026-07",
    priceAmount: "645",
    priceBasis: "per_tonne" as const,
    vatTreatment: "unknown" as const,
    deliveryBasis: "unknown" as const,
    mappingKind: "EXACT_PRODUCT_MATCH" as const,
    mappedProduct: "18-6-12",
    ...overrides,
  };
  return createMarketPriceObservation({
    sourceId: "CSO_AG_PRICES",
    sourceSeriesLabel: "Compound 18-6-12",
    geography: "Ireland",
    sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
    retrievedAt: "2026-09-20T12:00:00.000Z",
    ingestionBatchId: "11111111-1111-1111-1111-111111111111",
    sourceUrl: "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en",
    contentHash: hash(canonicalContentHashInput(fields)),
    ...fields,
  });
}

function resolvedPrice(overrides: Partial<CreateMarketPriceObservationInput> = {}, asOfDate = "2026-09-25"): EngineOutcome<AuditableMarketPriceResolution> {
  return resolveMarketReferencePrice({
    candidates: [observation(overrides)],
    mappedProduct: overrides.mappedProduct ?? "18-6-12",
    asOfDate,
  });
}

function unavailablePrice(mappedProduct = "18-6-12"): EngineOutcome<AuditableMarketPriceResolution> {
  return resolveMarketReferencePrice({ candidates: [], mappedProduct, asOfDate: "2026-09-25" });
}

function okLineCost(line: FertiliserPlanCostLine): string {
  if (line.lineCost.status !== "OK") throw new Error("expected OK lineCost");
  return line.lineCost.value.amount;
}

// ---------------------------------------------------------------------------
// Golden cases (brief §23) — end-to-end through costFertiliserProductLine,
// not just the low-level multiplyMoney primitive (see money.test.ts for
// that layer's own identical golden cases).
// ---------------------------------------------------------------------------
describe("costFertiliserProductLine — golden cases (§23)", () => {
  it("A. 1,000 kg @ €900/t = exactly €900 (protects the historical unit-mismatch bug class)", () => {
    const price = resolvedPrice({ priceAmount: "900" });
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 1000 }, price);
    expect(line.lineCost.status).toBe("OK");
    expect(okLineCost(line)).toBe("900");
  });

  it("B. 500 kg 18-6-12 @ €645/t = exactly €322.5, with full observation provenance", () => {
    const price = resolvedPrice({ priceAmount: "645" });
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, price);
    expect(okLineCost(line)).toBe("322.5");
    expect(line.calculationTrace.referencePeriod).toBe("2026-07");
    expect(line.calculationTrace.vatTreatment).toBe("unknown");
    expect(line.calculationTrace.priceBasis).toBe("per_tonne");
    expect(line.calculationTrace.observationIdentity).toMatch(/^[0-9a-f]{64}$/);
  });

  it("C. 2,500 kg @ €400/t = exactly €1,000", () => {
    const price = resolvedPrice({ priceAmount: "400" });
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 2500 }, price);
    expect(okLineCost(line)).toBe("1000");
  });

  it("D. 1 kg @ €1,000/t = exactly €1", () => {
    const price = resolvedPrice({ priceAmount: "1000" });
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 1 }, price);
    expect(okLineCost(line)).toBe("1");
  });

  it("E. 0 kg x a valid price = a valid, real €0 (never omitted, never blocked)", () => {
    const price = resolvedPrice({ priceAmount: "645" });
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 0 }, price);
    expect(line.lineCost.status).toBe("OK");
    expect(okLineCost(line)).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Price provenance (brief §24)
// ---------------------------------------------------------------------------
describe("costFertiliserProductLine — price provenance survives (§24)", () => {
  const price = resolvedPrice();
  const line = costFertiliserProductLine({ fieldId: "field-1", product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, price);

  it("1. retains the market observation database UUID (when the candidate carried one)", () => {
    const priceWithDbId = resolveMarketReferencePrice({
      candidates: [{ ...observation(), databaseId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }],
      mappedProduct: "18-6-12",
      asOfDate: "2026-09-25",
    });
    const l = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, priceWithDbId);
    expect(l.calculationTrace.observationDatabaseId).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });

  it("2. retains content hash", () => {
    expect(line.calculationTrace.observationIdentity).toMatch(/^[0-9a-f]{64}$/);
  });

  it("3. reference period survives", () => {
    expect(line.calculationTrace.referencePeriod).toBe("2026-07");
  });

  it("4. retrievedAt survives (on priceResolution, not stripped)", () => {
    if (line.priceResolution.status === "OK") expect(line.priceResolution.value.retrievedAt).toBe("2026-09-20T12:00:00.000Z");
  });

  it("5. mapping kind survives", () => {
    expect(line.calculationTrace.mappingKind).toBe("EXACT_PRODUCT_MATCH");
  });

  it("6. UNKNOWN VAT survives, never cleaned up", () => {
    expect(line.calculationTrace.vatTreatment).toBe("unknown");
  });

  it("7. price basis survives", () => {
    expect(line.calculationTrace.priceBasis).toBe("per_tonne");
  });

  it("8. proxy limitation survives for a CATEGORY_BENCHMARK line", () => {
    const proxyPrice = resolvedPrice({ sourceSeriesCode: "002", sourceSeriesLabel: "Urea (46% N)", mappingKind: "CATEGORY_BENCHMARK", mappedProduct: "Protected Urea" }, "2026-09-25");
    const proxyLine = costFertiliserProductLine({ product: "Protected Urea", npkAnalysis: "46-0-0", totalKg: 500 }, proxyPrice);
    expect(proxyLine.limitations.length).toBeGreaterThan(0);
    expect(proxyLine.limitations[0]).toMatch(/not an exact Protected Urea product price/);
  });

  it("9. an exact-match line has no proxy limitation", () => {
    expect(line.limitations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Failure states (brief §25)
// ---------------------------------------------------------------------------
describe("costFertiliserProductLine — failure states (§25)", () => {
  it("10. a missing price produces a blocked line, never €0", () => {
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, unavailablePrice());
    expect(line.lineCost.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (line.lineCost.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(line.lineCost.reasonCode).toBe("ECONOMIC_PRICE_EVIDENCE_UNAVAILABLE");
    }
  });

  it("11. an unsupported mapping (no eligible observation) resolves to blocked, never a fabricated price", () => {
    const unsupportedOnly = resolveMarketReferencePrice({
      candidates: [observation({ mappingKind: "UNSUPPORTED_MAPPING", mappedProduct: null, sourceSeriesCode: "021", sourceSeriesLabel: "Compound 13-6-20" })],
      mappedProduct: "13-6-20",
      asOfDate: "2026-09-25",
    });
    const line = costFertiliserProductLine({ product: "13-6-20", npkAnalysis: "13-6-20", totalKg: 500 }, unsupportedOnly);
    expect(line.lineCost.status).not.toBe("OK");
  });

  it("12. an unsupported price basis fails closed rather than guessing a conversion", () => {
    const perBagPrice = resolvedPrice({ priceBasis: "per_bag" });
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, perBagPrice);
    expect(line.lineCost.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (line.lineCost.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(line.lineCost.reasonCode).toBe("ECONOMIC_FERTILISER_COST_UNSUPPORTED_PRICE_BASIS");
    }
  });

  it("13. invalid/unexpected precision quantity fails closed rather than silently truncating", () => {
    const price = resolvedPrice();
    // 12.34 needs 2 decimal places, more than nutrients.ts's documented
    // 1-decimal-place rounding boundary — this is exactly the shape an
    // unexpected/un-rounded value would take.
    expect(() => costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 12.34 }, price)).toThrow(/decimal places/);
  });

  it("14. one blocked required line prevents a complete plan total", () => {
    const goodLine = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, resolvedPrice());
    const blockedLine = costFertiliserProductLine({ product: "0-7-30", npkAnalysis: "0-7-30", totalKg: 200 }, unavailablePrice("0-7-30"));
    const assessment = buildFertiliserPlanCostAssessment({ id: "plan-1", asOfDate: "2026-09-25", knownAt: "2026-09-25T23:59:59.999Z", lines: [goodLine, blockedLine], createdAt: "2026-09-25T00:00:00.000Z" });
    expect(assessment.aggregateOutcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("15. an incomplete total cannot masquerade as a complete cost — names the blocked line", () => {
    const goodLine = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, resolvedPrice());
    const blockedLine = costFertiliserProductLine({ product: "0-7-30", npkAnalysis: "0-7-30", totalKg: 200 }, unavailablePrice("0-7-30"));
    const assessment = buildFertiliserPlanCostAssessment({ id: "plan-1", asOfDate: "2026-09-25", knownAt: "2026-09-25T23:59:59.999Z", lines: [goodLine, blockedLine], createdAt: "2026-09-25T00:00:00.000Z" });
    if (assessment.aggregateOutcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(assessment.aggregateOutcome.reasonCode).toBe("ECONOMIC_FERTILISER_PLAN_COST_INCOMPLETE");
      expect(assessment.aggregateOutcome.missingInputs.join(" ")).toMatch(/0-7-30/);
    }
  });

  it("16. a price retrieved after knownAt cannot enter the calculation", () => {
    const price = resolveMarketReferencePrice({ candidates: [observation()], mappedProduct: "18-6-12", asOfDate: "2026-09-25", knownAt: "2026-09-01T00:00:00.000Z" });
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, price);
    expect(line.lineCost.status).not.toBe("OK");
  });

  it("17. a future reference-period price cannot enter the calculation", () => {
    const futurePrice = resolveMarketReferencePrice({ candidates: [observation({ referencePeriod: "2026-12" })], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, futurePrice);
    expect(line.lineCost.status).not.toBe("OK");
  });
});

// ---------------------------------------------------------------------------
// Units (brief §26)
// ---------------------------------------------------------------------------
describe("costFertiliserProductLine — units (§26)", () => {
  it("18. converts kg to tonnes through the canonical exact unit path", () => {
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, resolvedPrice());
    expect(line.calculationTrace.convertedQuantityTonnes).toBe("0.5");
  });

  it("19. contains no hand-written kg<->tonne conversion (no bare 1000 literal or KG_PER_TONNE-style constant — see economic-opportunity.test.ts's shared structural check, which now also covers this file)", () => {
    const source = readFileSync(join(__dirname, "fertiliser-plan-cost.ts"), "utf-8");
    expect(source).not.toContain("KG_PER_TONNE");
    expect(source).not.toContain("TONNE_TO_KG");
    expect(source).not.toContain("1000");
  });

  it("20. 1000 kg @ €900/t regression", () => {
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 1000 }, resolvedPrice({ priceAmount: "900" }));
    expect(okLineCost(line)).toBe("900");
  });

  it("21. small-quantity precision is preserved exactly", () => {
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 0.1 }, resolvedPrice({ priceAmount: "1000" }));
    expect(okLineCost(line)).toBe("0.1");
  });

  it("22. a large, realistic whole-farm quantity resolves exactly", () => {
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 48750.4 }, resolvedPrice({ priceAmount: "645" }));
    // 48.7504 t x 645 = 31444.008 exactly.
    expect(okLineCost(line)).toBe("31444.008");
  });

  it("23. input order cannot change the aggregate result", () => {
    const priceA = resolvedPrice({ priceAmount: "645" });
    const priceB = resolvedPrice({ priceAmount: "512", sourceSeriesCode: "008", mappedProduct: "0-7-30", sourceSeriesLabel: "Compound 0-7-30" }, "2026-09-25");
    const lineA = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, priceA);
    const lineB = costFertiliserProductLine({ product: "0-7-30", npkAnalysis: "0-7-30", totalKg: 200 }, priceB);
    const forward = buildFertiliserPlanCostAssessment({ id: "p", asOfDate: "2026-09-25", knownAt: "2026-09-25T23:59:59.999Z", lines: [lineA, lineB], createdAt: "t" });
    const reversed = buildFertiliserPlanCostAssessment({ id: "p", asOfDate: "2026-09-25", knownAt: "2026-09-25T23:59:59.999Z", lines: [lineB, lineA], createdAt: "t" });
    expect(forward.aggregateOutcome).toEqual(reversed.aggregateOutcome);
    expect(forward.lines.map((l) => l.product)).toEqual(reversed.lines.map((l) => l.product));
  });
});

// ---------------------------------------------------------------------------
// Science firewall (brief §27) — nutrients.ts/fertiliser-plan.ts's own
// existing test suites (run unmodified as part of this phase's gate) are
// the real regression proof; these two tests confirm THIS module's own
// contribution to the firewall: quantity is wholly independent of price.
// ---------------------------------------------------------------------------
describe("costFertiliserProductLine — science/economics firewall (§27)", () => {
  it("24/25. changing only price evidence does not change the recommended quantity", () => {
    const cheapPrice = resolvedPrice({ priceAmount: "400" });
    const expensivePrice = resolvedPrice({ priceAmount: "900" });
    const cheapLine = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, cheapPrice);
    const expensiveLine = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, expensivePrice);
    expect(cheapLine.quantity).toBe(expensiveLine.quantity);
    expect(cheapLine.calculationTrace.convertedQuantityTonnes).toBe(expensiveLine.calculationTrace.convertedQuantityTonnes);
  });

  it("26. this module never imports nutrients.ts's N/P/K/product-allocation logic", () => {
    const source = readFileSync(join(__dirname, "fertiliser-plan-cost.ts"), "utf-8");
    expect(source).not.toMatch(/from ["']\.\/nutrients["']/);
    expect(source).not.toMatch(/allocatePurchasedProducts|calculateNutrientPlan/);
  });
});

// ---------------------------------------------------------------------------
// Benchmark quality (brief §28)
// ---------------------------------------------------------------------------
describe("costFertiliserProductLine — benchmark quality (§28)", () => {
  it("28. 18-6-12 exact market observation produces a complete exact-match cost line", () => {
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, resolvedPrice());
    expect(line.lineCost.status).toBe("OK");
    expect(line.calculationTrace.mappingKind).toBe("EXACT_PRODUCT_MATCH");
    expect(line.limitations).toEqual([]);
  });

  it("29. 0-7-30 exact observation produces a complete exact-match cost line", () => {
    const price = resolvedPrice({ sourceSeriesCode: "008", mappedProduct: "0-7-30", sourceSeriesLabel: "Compound 0-7-30", priceAmount: "512" }, "2026-09-25");
    const line = costFertiliserProductLine({ product: "0-7-30", npkAnalysis: "0-7-30", totalKg: 300 }, price);
    expect(line.lineCost.status).toBe("OK");
    expect(line.calculationTrace.mappingKind).toBe("EXACT_PRODUCT_MATCH");
  });

  it("30. Protected Urea benchmark cost line retains CATEGORY_BENCHMARK and its limitation", () => {
    const price = resolvedPrice({ sourceSeriesCode: "002", sourceSeriesLabel: "Urea (46% N)", mappingKind: "CATEGORY_BENCHMARK", mappedProduct: "Protected Urea" }, "2026-09-25");
    const line = costFertiliserProductLine({ product: "Protected Urea", npkAnalysis: "46-0-0", totalKg: 500 }, price);
    expect(line.calculationTrace.mappingKind).toBe("CATEGORY_BENCHMARK");
    expect(line.limitations.some((l) => l.includes("Urea (46% N)"))).toBe(true);
  });

  it("31. an aggregate containing a Protected Urea line inherits the benchmark limitation", () => {
    const exactPrice = resolvedPrice();
    const proxyPrice = resolvedPrice({ sourceSeriesCode: "002", sourceSeriesLabel: "Urea (46% N)", mappingKind: "CATEGORY_BENCHMARK", mappedProduct: "Protected Urea" }, "2026-09-25");
    const exactLine = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, exactPrice);
    const proxyLine = costFertiliserProductLine({ product: "Protected Urea", npkAnalysis: "46-0-0", totalKg: 300 }, proxyPrice);
    const assessment = buildFertiliserPlanCostAssessment({ id: "p", asOfDate: "2026-09-25", knownAt: "2026-09-25T23:59:59.999Z", lines: [exactLine, proxyLine], createdAt: "t" });
    expect(assessment.limitations).toContain(FERTILISER_PLAN_COST_METHODOLOGY_LIMITATION);
    expect(assessment.limitations.some((l) => l.includes("Urea (46% N)"))).toBe(true);
  });

  it("32. an unsupported source series cannot create a cost", () => {
    const unsupported = resolveMarketReferencePrice({
      candidates: [observation({ mappingKind: "UNSUPPORTED_MAPPING", mappedProduct: null, sourceSeriesCode: "021", sourceSeriesLabel: "Compound 13-6-20" })],
      mappedProduct: "13-6-20",
      asOfDate: "2026-09-25",
    });
    const line = costFertiliserProductLine({ product: "13-6-20", npkAnalysis: "13-6-20", totalKg: 500 }, unsupported);
    expect(line.lineCost.status).not.toBe("OK");
  });
});

// ---------------------------------------------------------------------------
// Assessment-level behaviour and the farm-level exact-sum helper.
// ---------------------------------------------------------------------------
describe("buildFertiliserPlanCostAssessment", () => {
  it("computes an exact aggregate across multiple complete products (golden case E: multi-product plan)", () => {
    const line1 = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, resolvedPrice({ priceAmount: "645" }));
    const line2 = costFertiliserProductLine(
      { product: "0-7-30", npkAnalysis: "0-7-30", totalKg: 2500 },
      resolvedPrice({ sourceSeriesCode: "008", mappedProduct: "0-7-30", sourceSeriesLabel: "Compound 0-7-30", priceAmount: "400" }, "2026-09-25"),
    );
    const assessment = buildFertiliserPlanCostAssessment({ id: "p", asOfDate: "2026-09-25", knownAt: "2026-09-25T23:59:59.999Z", lines: [line1, line2], createdAt: "2026-09-25T00:00:00.000Z" });
    expect(assessment.aggregateOutcome.status).toBe("OK");
    if (assessment.aggregateOutcome.status === "OK") {
      // 322.5 + 1000 = 1322.5 exactly.
      expect(assessment.aggregateOutcome.value.amount).toBe("1322.5");
    }
    expect(assessment.limitations[0]).toBe(FERTILISER_PLAN_COST_METHODOLOGY_LIMITATION);
  });

  it("never uses the words savings/return/optimised anywhere in the assessment's own limitations", () => {
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, resolvedPrice());
    const assessment = buildFertiliserPlanCostAssessment({ id: "p", asOfDate: "2026-09-25", knownAt: "2026-09-25T23:59:59.999Z", lines: [line], createdAt: "t" });
    const allText = assessment.limitations.join(" ").toLowerCase();
    // "return" alone would false-positive on the product's own name, "Farm
    // Return" — check for the specific economic-claim phrasings instead.
    expect(allText).not.toMatch(/saving|economic return|rate of return|optimis|optimiz|cheapest|best buying/);
  });

  it("deterministically orders lines by (product, fieldId), never database/caller input order", () => {
    const priceA = resolvedPrice({ priceAmount: "645" });
    const priceB = resolvedPrice({ sourceSeriesCode: "008", mappedProduct: "0-7-30", sourceSeriesLabel: "Compound 0-7-30", priceAmount: "400" }, "2026-09-25");
    const lineZ = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", totalKg: 500 }, priceA);
    const lineA = costFertiliserProductLine({ product: "0-7-30", npkAnalysis: "0-7-30", totalKg: 200 }, priceB);
    const assessment = buildFertiliserPlanCostAssessment({ id: "p", asOfDate: "2026-09-25", knownAt: "2026-09-25T23:59:59.999Z", lines: [lineZ, lineA], createdAt: "t" });
    expect(assessment.lines.map((l) => l.product)).toEqual(["0-7-30", "18-6-12"]);
  });
});

describe("sumExactFertiliserQuantitiesKg — farm-level exact sum (§20)", () => {
  it("sums real per-field totalKg exactly, returning a decimal string never a lossy number", () => {
    expect(sumExactFertiliserQuantitiesKg("18-6-12", [500, 322.5, 100])).toBe("922.5");
  });

  it("an exact-summed farm total can legitimately need more precision than any single field's own rounding boundary", () => {
    // Three fields each at nutrients.ts's own 1dp boundary, summing to a
    // value that (this decimal library correctly keeps exact regardless,
    // but demonstrates the discriminated exactTotalKg input path exists
    // for a farm-level line that a plain `number` totalKg could not
    // safely carry if it ever did need 2+ decimal places).
    const farmTotal = sumExactFertiliserQuantitiesKg("18-6-12", [100.1, 100.2, 100.3]);
    expect(farmTotal).toBe("300.6");
    const line = costFertiliserProductLine({ product: "18-6-12", npkAnalysis: "18-6-12", exactTotalKg: farmTotal }, resolvedPrice({ priceAmount: "645" }));
    expect(line.quantity).toBe("300.6");
  });

  it("rejects a per-field value exceeding nutrients.ts's own documented rounding boundary", () => {
    expect(() => sumExactFertiliserQuantitiesKg("18-6-12", [500, 12.34])).toThrow(/decimal places/);
  });
});
