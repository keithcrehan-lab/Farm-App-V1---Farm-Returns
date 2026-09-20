import { describe, expect, it } from "vitest";
import { canonicalContentHashInput, createMarketPriceObservation } from "./market-evidence";
import { createHash } from "node:crypto";

function realHash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function baseInput() {
  return {
    sourceId: "CSO_AG_PRICES" as const,
    datasetId: "AJM09",
    sourceSeriesCode: "012",
    sourceSeriesLabel: "Compound 18-6-12",
    mappedProduct: "18-6-12",
    mappingKind: "EXACT_PRODUCT_MATCH" as const,
    priceAmount: "645",
    priceBasis: "per_tonne" as const,
    vatTreatment: "unknown" as const,
    deliveryBasis: "unknown" as const,
    geography: "Ireland",
    referencePeriod: "2026-07",
    sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
    retrievedAt: "2026-09-20T12:00:00.000Z",
    ingestionBatchId: "11111111-1111-1111-1111-111111111111",
    sourceUrl: "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en",
  };
}

describe("createMarketPriceObservation", () => {
  it("constructs a valid EXACT_PRODUCT_MATCH observation", () => {
    const input = baseInput();
    const contentHash = realHash(canonicalContentHashInput(input));
    const obs = createMarketPriceObservation({ ...input, contentHash });
    expect(obs.mappedProduct).toBe("18-6-12");
    expect(obs.price).toEqual({ amount: "645", currency: "EUR" });
    expect(obs.benchmarkStatus).toBe("INDICATIVE");
  });

  it("rejects UNSUPPORTED_MAPPING paired with a non-null mappedProduct", () => {
    const input = baseInput();
    const contentHash = realHash(canonicalContentHashInput(input));
    expect(() =>
      createMarketPriceObservation({ ...input, mappingKind: "UNSUPPORTED_MAPPING", mappedProduct: "18-6-12", contentHash }),
    ).toThrow(/mappedProduct: null/);
  });

  it("accepts UNSUPPORTED_MAPPING with a null mappedProduct — no fabricated product price", () => {
    const input = baseInput();
    const unsupported = { ...input, mappingKind: "UNSUPPORTED_MAPPING" as const, mappedProduct: null, sourceSeriesLabel: "Compound 27-2.5-5" };
    const contentHash = realHash(canonicalContentHashInput(unsupported));
    const obs = createMarketPriceObservation({ ...unsupported, contentHash });
    expect(obs.mappedProduct).toBeNull();
    expect(obs.mappingKind).toBe("UNSUPPORTED_MAPPING");
  });

  it("rejects a non-UNSUPPORTED mapping with a null mappedProduct", () => {
    const input = baseInput();
    const contentHash = realHash(canonicalContentHashInput(input));
    expect(() => createMarketPriceObservation({ ...input, mappedProduct: null, contentHash })).toThrow(/requires a non-null mappedProduct/);
  });

  it("rejects a malformed referencePeriod", () => {
    const input = baseInput();
    const contentHash = realHash(canonicalContentHashInput(input));
    expect(() => createMarketPriceObservation({ ...input, referencePeriod: "2026-7", contentHash })).toThrow(/canonical "YYYY-MM"/);
    expect(() => createMarketPriceObservation({ ...input, referencePeriod: "2026-13", contentHash })).toThrow(/canonical "YYYY-MM"/);
  });

  it("rejects a malformed contentHash", () => {
    const input = baseInput();
    expect(() => createMarketPriceObservation({ ...input, contentHash: "not-a-hash" })).toThrow(/64-character lowercase hex/);
  });

  it("rejects a non-canonical priceAmount via createMoneyAmount", () => {
    const input = baseInput();
    const contentHash = realHash(canonicalContentHashInput(input));
    expect(() => createMarketPriceObservation({ ...input, priceAmount: "NaN", contentHash })).toThrow();
    expect(() => createMarketPriceObservation({ ...input, priceAmount: "1.5e3", contentHash })).toThrow();
  });
});

describe("canonicalContentHashInput", () => {
  it("is identical for identical content regardless of retrievedAt/ingestionBatchId", () => {
    const a = baseInput();
    const b = { ...baseInput(), retrievedAt: "2026-09-21T09:00:00.000Z", ingestionBatchId: "22222222-2222-2222-2222-222222222222" };
    expect(canonicalContentHashInput(a)).toBe(canonicalContentHashInput(b));
  });

  it("changes when the price genuinely revises (a real CSO revision must be detectable)", () => {
    const a = baseInput();
    const revised = { ...baseInput(), priceAmount: "647" };
    expect(canonicalContentHashInput(a)).not.toBe(canonicalContentHashInput(revised));
  });

  it("changes when mappingKind/mappedProduct differ, not just price", () => {
    const a = baseInput();
    const b = { ...baseInput(), mappingKind: "CATEGORY_BENCHMARK" as const };
    expect(canonicalContentHashInput(a)).not.toBe(canonicalContentHashInput(b));
  });
});
