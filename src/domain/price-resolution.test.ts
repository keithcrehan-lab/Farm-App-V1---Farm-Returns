import { describe, expect, it } from "vitest";
import { resolvePrice } from "./price-resolution";

describe("resolvePrice — market data source hierarchy", () => {
  it("returns unavailable (null value, not 0) when nothing exists", () => {
    const result = resolvePrice({ today: "2026-08-28" });
    expect(result.level).toBe("unavailable");
    expect(result.valueEurPerUnit).toBeNull();
  });

  it("prefers a farmer-adjusted assumption over everything else", () => {
    const result = resolvePrice({
      today: "2026-08-28",
      farmerAssumption: { value: 500, status: "farmer_adjusted", unit: "€/t", source: "Keith Crehan" },
      supplierQuotes: [{ supplierName: "ABC Merchants", priceEur: 480, unit: "€/t", quoteDate: "2026-08-01" }],
      marketReference: { value: 520, unit: "€/t", source: "CSO reference", asOf: "2026-06" },
    });
    expect(result.level).toBe("farmer_entered");
    expect(result.valueEurPerUnit).toBe(500);
    expect(result.source).toBe("Keith Crehan");
  });

  it("does NOT treat an accepted 'estimated' default as farmer-entered", () => {
    const result = resolvePrice({
      today: "2026-08-28",
      farmerAssumption: { value: 500, status: "estimated", unit: "€/t", source: "CSO reference" },
      marketReference: { value: 520, unit: "€/t", source: "CSO reference", asOf: "2026-06" },
    });
    // Falls through to the next tier — an accepted default is not the
    // same fact as a farmer having typed in a real cost.
    expect(result.level).toBe("market_reference");
  });

  it("prefers a supplier quote over a market reference", () => {
    const result = resolvePrice({
      today: "2026-08-28",
      supplierQuotes: [{ supplierName: "ABC Merchants", priceEur: 480, unit: "€/t", quoteDate: "2026-08-01" }],
      marketReference: { value: 520, unit: "€/t", source: "CSO reference", asOf: "2026-06" },
    });
    expect(result.level).toBe("supplier_quote");
    expect(result.valueEurPerUnit).toBe(480);
    expect(result.source).toBe("ABC Merchants quote");
  });

  it("ignores an expired supplier quote and falls through to market reference", () => {
    const result = resolvePrice({
      today: "2026-08-28",
      supplierQuotes: [{ supplierName: "ABC Merchants", priceEur: 480, unit: "€/t", quoteDate: "2026-01-01", validUntil: "2026-02-01" }],
      marketReference: { value: 520, unit: "€/t", source: "CSO reference", asOf: "2026-06" },
    });
    expect(result.level).toBe("market_reference");
  });

  it("picks the most recent of multiple valid supplier quotes", () => {
    const result = resolvePrice({
      today: "2026-08-28",
      supplierQuotes: [
        { supplierName: "Old Quote Ltd", priceEur: 500, unit: "€/t", quoteDate: "2026-05-01" },
        { supplierName: "Recent Merchants", priceEur: 470, unit: "€/t", quoteDate: "2026-08-01" },
      ],
    });
    expect(result.source).toBe("Recent Merchants quote");
    expect(result.valueEurPerUnit).toBe(470);
  });

  it("prefers market reference over historical benchmark", () => {
    const result = resolvePrice({
      today: "2026-08-28",
      marketReference: { value: 520, unit: "€/t", source: "CSO reference, 2026-06", asOf: "2026-06" },
      historicalBenchmark: { value: 490, unit: "€/t", source: "5-year average", asOf: "2021-2026" },
    });
    expect(result.level).toBe("market_reference");
  });

  it("falls back to a historical benchmark when no current reference exists", () => {
    const result = resolvePrice({
      today: "2026-08-28",
      historicalBenchmark: { value: 490, unit: "€/t", source: "5-year average", asOf: "2021-2026" },
    });
    expect(result.level).toBe("historical_benchmark");
    expect(result.valueEurPerUnit).toBe(490);
  });

  it("a quote valid exactly on today's date still counts", () => {
    const result = resolvePrice({
      today: "2026-08-28",
      supplierQuotes: [{ supplierName: "ABC Merchants", priceEur: 480, unit: "€/t", quoteDate: "2026-08-01", validUntil: "2026-08-28" }],
    });
    expect(result.level).toBe("supplier_quote");
  });
});
