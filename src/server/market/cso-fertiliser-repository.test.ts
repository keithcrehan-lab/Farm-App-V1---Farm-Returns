import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findObservationsByMappedProduct, fromDbRow, insertObservations, toInsertRow, type MarketPriceObservationRow } from "./cso-fertiliser-repository";
import { createMarketPriceObservation, type MarketPriceObservation } from "@/domain/market-evidence";

function realObservation(overrides: Partial<Parameters<typeof createMarketPriceObservation>[0]> = {}): MarketPriceObservation {
  return createMarketPriceObservation({
    sourceId: "CSO_AG_PRICES",
    datasetId: "AJM09",
    sourceSeriesCode: "012",
    sourceSeriesLabel: "Compound 18-6-12",
    mappedProduct: "18-6-12",
    mappingKind: "EXACT_PRODUCT_MATCH",
    priceAmount: "645.50",
    priceBasis: "per_tonne",
    vatTreatment: "unknown",
    deliveryBasis: "unknown",
    geography: "Ireland",
    referencePeriod: "2026-07",
    sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
    retrievedAt: "2026-09-20T12:00:00.000Z",
    contentHash: "a".repeat(64),
    ingestionBatchId: "11111111-1111-1111-1111-111111111111",
    sourceUrl: "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en",
    ...overrides,
  });
}

describe("toInsertRow / fromDbRow round-trip", () => {
  it("19. preserves the exact decimal price string, including trailing zeros, with no numeric coercion", () => {
    const obs = realObservation({ priceAmount: "645.50" });
    const row = toInsertRow(obs);
    expect(row.price_amount).toBe("645.50");
    expect(typeof row.price_amount).toBe("string");
    const roundTripped = fromDbRow(row);
    expect(roundTripped.price.amount).toBe("645.50");
  });

  it("round-trips every field losslessly", () => {
    const obs = realObservation();
    const roundTripped = fromDbRow(toInsertRow(obs));
    expect(roundTripped).toEqual(obs);
  });

  it("fromDbRow re-validates at the boundary and throws on an invalid row rather than trusting it", () => {
    const badRow: MarketPriceObservationRow = {
      ...toInsertRow(realObservation()),
      mapping_kind: "UNSUPPORTED_MAPPING",
      mapped_product: "18-6-12", // invalid combination — must be null
    };
    expect(() => fromDbRow(badRow)).toThrow(/mappedProduct: null/);
  });
});

function makeFakeClient(responseData: MarketPriceObservationRow[] | null, error: { message: string } | null = null) {
  const upsertSpy = vi.fn().mockReturnThis();
  const selectSpy = vi.fn().mockResolvedValue({ data: responseData, error });
  const fromSpy = vi.fn().mockReturnValue({ upsert: upsertSpy, select: selectSpy });
  const client = { from: fromSpy } as unknown as SupabaseClient;
  return { client, fromSpy, upsertSpy, selectSpy };
}

describe("insertObservations", () => {
  it("12. first observation persists — a fresh insert returns it as inserted", async () => {
    const obs = realObservation();
    const row = toInsertRow(obs);
    const { client, fromSpy, upsertSpy } = makeFakeClient([row]);
    const result = await insertObservations(client, [obs]);
    expect(fromSpy).toHaveBeenCalledWith("market_price_observations");
    expect(upsertSpy).toHaveBeenCalledWith(
      [row],
      expect.objectContaining({ onConflict: "dataset_id,source_series_code,reference_period,content_hash", ignoreDuplicates: true }),
    );
    expect(result.insertedCount).toBe(1);
    expect(result.skippedAsDuplicateCount).toBe(0);
  });

  it("13. repeated identical observation does not create an uncontrolled duplicate — ignoreDuplicates omits it from the response", async () => {
    const obs = realObservation();
    const { client } = makeFakeClient([]); // PostgREST returns no rows for a conflicting ignoreDuplicates upsert
    const result = await insertObservations(client, [obs]);
    expect(result.insertedCount).toBe(0);
    expect(result.skippedAsDuplicateCount).toBe(1);
  });

  it("14/15/16. a revised value is a different content_hash, so it is never treated as a conflict — both old and new remain independently insertable", async () => {
    const original = realObservation({ priceAmount: "645", contentHash: "a".repeat(64) });
    const revised = realObservation({ priceAmount: "647", contentHash: "b".repeat(64) });
    const { client } = makeFakeClient([toInsertRow(original), toInsertRow(revised)]);
    const result = await insertObservations(client, [original, revised]);
    expect(result.insertedCount).toBe(2);
    expect(result.inserted.map((o) => o.price.amount).sort()).toEqual(["645", "647"]);
  });

  it("does nothing and never calls the client for an empty batch", async () => {
    const { client, fromSpy } = makeFakeClient([]);
    const result = await insertObservations(client, []);
    expect(result).toEqual({ insertedCount: 0, skippedAsDuplicateCount: 0, inserted: [] });
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("fails closed (throws) on a database error rather than silently swallowing it", async () => {
    const obs = realObservation();
    const { client } = makeFakeClient(null, { message: "connection refused" });
    await expect(insertObservations(client, [obs])).rejects.toThrow(/connection refused/);
  });
});

describe("findObservationsByMappedProduct (Phase 3 read side)", () => {
  function makeSelectClient(responseData: MarketPriceObservationRow[] | null, error: { message: string } | null = null) {
    const eqSpy = vi.fn().mockResolvedValue({ data: responseData, error });
    const selectSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const fromSpy = vi.fn().mockReturnValue({ select: selectSpy });
    const client = { from: fromSpy } as unknown as SupabaseClient;
    return { client, fromSpy, selectSpy, eqSpy };
  }

  it("queries by mapped_product and returns validated domain objects paired with their real row id", async () => {
    const obs = realObservation();
    const row = { ...toInsertRow(obs), id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" };
    const { client, fromSpy, eqSpy } = makeSelectClient([row]);
    const results = await findObservationsByMappedProduct(client, "18-6-12");
    expect(fromSpy).toHaveBeenCalledWith("market_price_observations");
    expect(eqSpy).toHaveBeenCalledWith("mapped_product", "18-6-12");
    expect(results).toHaveLength(1);
    expect(results[0].observation.price.amount).toBe("645.50");
    expect(results[0].databaseId).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });

  it("returns an empty array, not null/undefined, when nothing matches", async () => {
    const { client } = makeSelectClient(null);
    const results = await findObservationsByMappedProduct(client, "18-6-12");
    expect(results).toEqual([]);
  });

  it("fails closed on a database error", async () => {
    const { client } = makeSelectClient(null, { message: "timeout" });
    await expect(findObservationsByMappedProduct(client, "18-6-12")).rejects.toThrow(/timeout/);
  });

  it("fails closed (Phase 3 independent review §4) when a returned row is missing its database id", async () => {
    const row = toInsertRow(realObservation()); // no `id` — mirrors an insertable, not a selected, row
    const { client } = makeSelectClient([row]);
    await expect(findObservationsByMappedProduct(client, "18-6-12")).rejects.toThrow(/missing its database id/);
  });
});
