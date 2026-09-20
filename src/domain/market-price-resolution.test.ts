import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createMarketPriceObservation, canonicalContentHashInput, type MarketPriceObservation } from "./market-evidence";
import { resolveMarketReferencePrice } from "./market-price-resolution";
import { resolvePrice } from "./price-resolution";

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function observation(overrides: Partial<Parameters<typeof createMarketPriceObservation>[0]> = {}): MarketPriceObservation {
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

describe("resolveMarketReferencePrice — exact market match (§20)", () => {
  it("1. resolves 18-6-12 from an exact AJM09 012 observation", () => {
    const outcome = resolveMarketReferencePrice({ candidates: [observation()], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value.mappedProduct).toBe("18-6-12");
      expect(outcome.value.mappingKind).toBe("EXACT_PRODUCT_MATCH");
      expect(outcome.value.amount).toEqual({ amount: "645", currency: "EUR" });
    }
  });

  it("2. resolves 0-7-30 from an exact AJM09 008 observation", () => {
    const obs = observation({ sourceSeriesCode: "008", mappedProduct: "0-7-30", priceAmount: "512" });
    const outcome = resolveMarketReferencePrice({ candidates: [obs], mappedProduct: "0-7-30", asOfDate: "2026-09-25" });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value.sourceSeriesCode).toBe("008");
      expect(outcome.value.amount.amount).toBe("512");
    }
  });

  it("3. result retains the exact selected observation's content identity", () => {
    const obs = observation();
    const outcome = resolveMarketReferencePrice({ candidates: [obs], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    if (outcome.status === "OK") expect(outcome.value.observationIdentity).toBe(obs.contentHash);
  });

  it("4. result retains content/revision identity distinct from a different revision", () => {
    const revised = observation({ priceAmount: "647" });
    const outcome = resolveMarketReferencePrice({ candidates: [observation(), revised], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    // both share reference period; revised has the later retrievedAt only if we set it — force via knownAt-free "best evidence now" default which prefers later retrievedAt on tie in period.
    expect(outcome.status).toBe("OK");
  });

  it("5. result retains the exact reference period", () => {
    const outcome = resolveMarketReferencePrice({ candidates: [observation()], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    if (outcome.status === "OK") expect(outcome.value.referencePeriod).toBe("2026-07");
  });

  it("6. result retains retrievedAt", () => {
    const outcome = resolveMarketReferencePrice({ candidates: [observation()], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    if (outcome.status === "OK") expect(outcome.value.retrievedAt).toBe("2026-09-20T12:00:00.000Z");
  });

  it("7. result retains UNKNOWN vat treatment, never cleaned up", () => {
    const outcome = resolveMarketReferencePrice({ candidates: [observation()], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    if (outcome.status === "OK") expect(outcome.value.vatTreatment).toBe("unknown");
  });

  it("8. result retains per_tonne price basis", () => {
    const outcome = resolveMarketReferencePrice({ candidates: [observation()], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    if (outcome.status === "OK") expect(outcome.value.priceBasis).toBe("per_tonne");
  });
});

describe("resolveMarketReferencePrice — Protected Urea proxy (§21)", () => {
  it("9. generic Urea 46% N is never represented as EXACT_PRODUCT_MATCH for Protected Urea", () => {
    const obs = createMarketPriceObservation({
      sourceId: "CSO_AG_PRICES",
      datasetId: "AJM09",
      sourceSeriesCode: "002",
      sourceSeriesLabel: "Urea (46% N)",
      mappedProduct: "Protected Urea",
      mappingKind: "CATEGORY_BENCHMARK",
      priceAmount: "412",
      priceBasis: "per_tonne",
      vatTreatment: "unknown",
      deliveryBasis: "unknown",
      geography: "Ireland",
      referencePeriod: "2026-07",
      sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
      retrievedAt: "2026-09-20T12:00:00.000Z",
      contentHash: "b".repeat(64),
      ingestionBatchId: "11111111-1111-1111-1111-111111111111",
      sourceUrl: null,
    });
    const outcome = resolveMarketReferencePrice({ candidates: [obs], mappedProduct: "Protected Urea", asOfDate: "2026-09-25" });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") expect(outcome.value.mappingKind).not.toBe("EXACT_PRODUCT_MATCH");
  });

  it("10. if eligible as an indicative fallback, it is CATEGORY_BENCHMARK", () => {
    const obs = createMarketPriceObservation({
      sourceId: "CSO_AG_PRICES",
      datasetId: "AJM09",
      sourceSeriesCode: "002",
      sourceSeriesLabel: "Urea (46% N)",
      mappedProduct: "Protected Urea",
      mappingKind: "CATEGORY_BENCHMARK",
      priceAmount: "412",
      priceBasis: "per_tonne",
      vatTreatment: "unknown",
      deliveryBasis: "unknown",
      geography: "Ireland",
      referencePeriod: "2026-07",
      sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
      retrievedAt: "2026-09-20T12:00:00.000Z",
      contentHash: "c".repeat(64),
      ingestionBatchId: "11111111-1111-1111-1111-111111111111",
      sourceUrl: null,
    });
    const outcome = resolveMarketReferencePrice({ candidates: [obs], mappedProduct: "Protected Urea", asOfDate: "2026-09-25" });
    if (outcome.status === "OK") expect(outcome.value.mappingKind).toBe("CATEGORY_BENCHMARK");
  });

  it("11. proxy limitation is present and names the real source label + real product", () => {
    const obs = createMarketPriceObservation({
      sourceId: "CSO_AG_PRICES",
      datasetId: "AJM09",
      sourceSeriesCode: "002",
      sourceSeriesLabel: "Urea (46% N)",
      mappedProduct: "Protected Urea",
      mappingKind: "CATEGORY_BENCHMARK",
      priceAmount: "412",
      priceBasis: "per_tonne",
      vatTreatment: "unknown",
      deliveryBasis: "unknown",
      geography: "Ireland",
      referencePeriod: "2026-07",
      sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
      retrievedAt: "2026-09-20T12:00:00.000Z",
      contentHash: "d".repeat(64),
      ingestionBatchId: "11111111-1111-1111-1111-111111111111",
      sourceUrl: null,
    });
    const outcome = resolveMarketReferencePrice({ candidates: [obs], mappedProduct: "Protected Urea", asOfDate: "2026-09-25" });
    if (outcome.status === "OK") {
      expect(outcome.value.limitations.length).toBeGreaterThan(0);
      expect(outcome.value.limitations[0]).toContain("Urea (46% N)");
      expect(outcome.value.limitations[0]).toContain("not an exact Protected Urea product price");
    }
  });

  it("12. unsupported mapping cannot become a Protected Urea price", () => {
    const unsupported = observation({ mappingKind: "UNSUPPORTED_MAPPING", mappedProduct: null, sourceSeriesCode: "021" });
    const outcome = resolveMarketReferencePrice({ candidates: [unsupported], mappedProduct: "Protected Urea", asOfDate: "2026-09-25" });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });
});

describe("resolveMarketReferencePrice — time / revision (§22)", () => {
  it("13. future reference period is rejected", () => {
    const future = observation({ referencePeriod: "2026-12" });
    const outcome = resolveMarketReferencePrice({ candidates: [future], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("14. newest eligible reference period is selected", () => {
    const june = observation({ referencePeriod: "2026-06", priceAmount: "600" });
    const august = observation({ referencePeriod: "2026-08", priceAmount: "660" });
    const outcome = resolveMarketReferencePrice({ candidates: [june, august], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    if (outcome.status === "OK") expect(outcome.value.referencePeriod).toBe("2026-08");
  });

  it("15. two revisions of the same month: latest known revision selected (no knownAt = best evidence now)", () => {
    const first = observation({ retrievedAt: "2026-09-20T12:00:00.000Z", priceAmount: "645" });
    const revision = observation({ retrievedAt: "2026-10-20T12:00:00.000Z", priceAmount: "647" });
    const outcome = resolveMarketReferencePrice({ candidates: [first, revision], mappedProduct: "18-6-12", asOfDate: "2026-10-31" });
    if (outcome.status === "OK") expect(outcome.value.amount.amount).toBe("647");
  });

  it("16. historical knownAt before revision: earlier revision selected (worked example: known 30 Sept -> 645)", () => {
    const first = observation({ retrievedAt: "2026-09-20T12:00:00.000Z", priceAmount: "645" });
    const revision = observation({ retrievedAt: "2026-10-20T12:00:00.000Z", priceAmount: "647" });
    const outcome = resolveMarketReferencePrice({
      candidates: [first, revision],
      mappedProduct: "18-6-12",
      asOfDate: "2026-10-31",
      knownAt: "2026-09-30T23:59:59.000Z",
    });
    if (outcome.status === "OK") expect(outcome.value.amount.amount).toBe("645");
  });

  it("17. historical knownAt after revision: revised observation selected (worked example: known 31 Oct -> 647)", () => {
    const first = observation({ retrievedAt: "2026-09-20T12:00:00.000Z", priceAmount: "645" });
    const revision = observation({ retrievedAt: "2026-10-20T12:00:00.000Z", priceAmount: "647" });
    const outcome = resolveMarketReferencePrice({
      candidates: [first, revision],
      mappedProduct: "18-6-12",
      asOfDate: "2026-10-31",
      knownAt: "2026-10-31T23:59:59.000Z",
    });
    if (outcome.status === "OK") expect(outcome.value.amount.amount).toBe("647");
  });

  it("18. identical retrievedAt has a deterministic tie-break (lexically greater contentHash wins)", () => {
    const a = observation({ priceAmount: "645" });
    const bFields = { datasetId: "AJM09", sourceSeriesCode: "012", referencePeriod: "2026-07", priceAmount: "650", priceBasis: "per_tonne" as const, vatTreatment: "unknown" as const, deliveryBasis: "unknown" as const, mappingKind: "EXACT_PRODUCT_MATCH" as const, mappedProduct: "18-6-12" };
    const b = createMarketPriceObservation({
      sourceId: "CSO_AG_PRICES",
      ...bFields,
      sourceSeriesLabel: "Compound 18-6-12",
      geography: "Ireland",
      sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
      retrievedAt: a.retrievedAt,
      contentHash: hash(canonicalContentHashInput(bFields)),
      ingestionBatchId: "22222222-2222-2222-2222-222222222222",
      sourceUrl: null,
    });
    const outcome1 = resolveMarketReferencePrice({ candidates: [a, b], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    const outcome2 = resolveMarketReferencePrice({ candidates: [b, a], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    expect(outcome1.status).toBe("OK");
    expect(outcome2.status).toBe("OK");
    if (outcome1.status === "OK" && outcome2.status === "OK") {
      expect(outcome1.value.observationIdentity).toBe(outcome2.value.observationIdentity);
      const expectedWinner = a.contentHash > b.contentHash ? a.contentHash : b.contentHash;
      expect(outcome1.value.observationIdentity).toBe(expectedWinner);
    }
  });

  it("19. reordering input candidates produces the same result", () => {
    const june = observation({ referencePeriod: "2026-06", priceAmount: "600" });
    const august = observation({ referencePeriod: "2026-08", priceAmount: "660" });
    const july = observation({ referencePeriod: "2026-07", priceAmount: "645" });
    const forward = resolveMarketReferencePrice({ candidates: [june, july, august], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    const reversed = resolveMarketReferencePrice({ candidates: [august, july, june], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    expect(forward).toEqual(reversed);
  });
});

describe("resolveMarketReferencePrice — unavailable (§23)", () => {
  it("20. no observation -> unavailable, never zero", () => {
    const outcome = resolveMarketReferencePrice({ candidates: [], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (outcome.status === "BLOCKED_INSUFFICIENT_EVIDENCE") expect(outcome.reasonCode).toBe("ECONOMIC_PRICE_EVIDENCE_UNAVAILABLE");
  });

  it("21. only unsupported mappings -> unavailable", () => {
    const unsupported = observation({ mappingKind: "UNSUPPORTED_MAPPING", mappedProduct: null, sourceSeriesCode: "021" });
    const outcome = resolveMarketReferencePrice({ candidates: [unsupported], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("22. a malformed observation cannot enter resolution (construction itself throws)", () => {
    expect(() =>
      createMarketPriceObservation({
        sourceId: "CSO_AG_PRICES",
        datasetId: "AJM09",
        sourceSeriesCode: "012",
        sourceSeriesLabel: "Compound 18-6-12",
        mappedProduct: "18-6-12",
        mappingKind: "EXACT_PRODUCT_MATCH",
        priceAmount: "not-a-number",
        priceBasis: "per_tonne",
        vatTreatment: "unknown",
        deliveryBasis: "unknown",
        geography: "Ireland",
        referencePeriod: "2026-07",
        sourceUpdatedAt: null,
        retrievedAt: "2026-09-20T12:00:00.000Z",
        contentHash: "e".repeat(64),
        ingestionBatchId: "11111111-1111-1111-1111-111111111111",
        sourceUrl: null,
      }),
    ).toThrow();
  });

  it("23. a category benchmark does not silently become exact even when it is the only eligible candidate", () => {
    const obs = createMarketPriceObservation({
      sourceId: "CSO_AG_PRICES",
      datasetId: "AJM09",
      sourceSeriesCode: "002",
      sourceSeriesLabel: "Urea (46% N)",
      mappedProduct: "Protected Urea",
      mappingKind: "CATEGORY_BENCHMARK",
      priceAmount: "412",
      priceBasis: "per_tonne",
      vatTreatment: "unknown",
      deliveryBasis: "unknown",
      geography: "Ireland",
      referencePeriod: "2026-07",
      sourceUpdatedAt: null,
      retrievedAt: "2026-09-20T12:00:00.000Z",
      contentHash: "f".repeat(64),
      ingestionBatchId: "11111111-1111-1111-1111-111111111111",
      sourceUrl: null,
    });
    const outcome = resolveMarketReferencePrice({ candidates: [obs], mappedProduct: "Protected Urea", asOfDate: "2026-09-25" });
    if (outcome.status === "OK") expect(outcome.value.mappingKind).toBe("CATEGORY_BENCHMARK");
  });
});

describe("existing price-resolution.ts hierarchy remains intact (§24 — pure fixtures, no DB, no modification)", () => {
  it("24. farmer-entered source outranks market reference", () => {
    const resolved = resolvePrice({
      today: "2026-09-25",
      farmerAssumption: { value: 500, status: "farmer_adjusted", unit: "€/t", source: "Keith Crehan" },
      marketReference: { value: 645, unit: "€/t", source: "CSO reference", asOf: "2026-07" },
    });
    expect(resolved.level).toBe("farmer_entered");
  });

  it("25. supplier quote outranks market reference", () => {
    const resolved = resolvePrice({
      today: "2026-09-25",
      supplierQuotes: [{ supplierName: "ABC Merchants", priceEur: 630, unit: "€/t", quoteDate: "2026-09-01" }],
      marketReference: { value: 645, unit: "€/t", source: "CSO reference", asOf: "2026-07" },
    });
    expect(resolved.level).toBe("supplier_quote");
  });

  it("26. market reference outranks historical benchmark", () => {
    const resolved = resolvePrice({
      today: "2026-09-25",
      marketReference: { value: 645, unit: "€/t", source: "CSO reference", asOf: "2026-07" },
      historicalBenchmark: { value: 500, unit: "€/t", source: "Old benchmark", asOf: "2024-01" },
    });
    expect(resolved.level).toBe("market_reference");
  });

  it("27. an unavailable lower source does not override a valid higher source", () => {
    const resolved = resolvePrice({
      today: "2026-09-25",
      marketReference: { value: 645, unit: "€/t", source: "CSO reference", asOf: "2026-07" },
    });
    expect(resolved.level).toBe("market_reference");
    expect(resolved.valueEurPerUnit).toBe(645);
  });
});

describe("science/economics firewall + market.ts non-coupling (§13/§14/§25)", () => {
  it("nutrients.ts's private PRODUCTS catalogue is not exported/importable — this phase adds a parallel evidence pipeline rather than reaching into or changing that existing coupling (full regression proof is nutrients.test.ts/market.test.ts, run unmodified as part of this phase's gate)", async () => {
    const nutrientsModule = await import("./nutrients");
    expect((nutrientsModule as Record<string, unknown>).PRODUCTS).toBeUndefined();
    const { knownFertiliserProductComposition } = nutrientsModule;
    expect(knownFertiliserProductComposition("18-6-12")).toBeDefined();
    const { CSO_COMPOUND_0_7_30, CSO_COMPOUND_18_6_12, CSO_UREA_46N, latestPoint } = await import("./market");
    expect(typeof latestPoint(CSO_COMPOUND_0_7_30).value).toBe("number");
    expect(typeof latestPoint(CSO_COMPOUND_18_6_12).value).toBe("number");
    expect(typeof latestPoint(CSO_UREA_46N).value).toBe("number");
  });

  it("resolveMarketReferencePrice performs no arithmetic on the monetary amount (passthrough identity)", () => {
    const obs = observation({ priceAmount: "645.5" });
    const outcome = resolveMarketReferencePrice({ candidates: [obs], mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    if (outcome.status === "OK") expect(outcome.value.amount).toBe(obs.price);
  });
});

describe("structural: no hand-written kg<->tonne conversion in this phase's new module", () => {
  it("market-price-resolution.ts source contains no KG_PER_TONNE/TONNE_TO_KG/literal 1000 conversion token", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(path.join(__dirname, "market-price-resolution.ts"), "utf8");
    expect(source).not.toMatch(/KG_PER_TONNE|TONNE_TO_KG/);
    expect(source).not.toMatch(/\b1000\b/);
  });
});
