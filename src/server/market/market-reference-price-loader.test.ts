import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMarketReferencePrice } from "./market-reference-price-loader";
import { createMarketPriceObservation } from "@/domain/market-evidence";
import { toInsertRow, type MarketPriceObservationRow } from "./cso-fertiliser-repository";

function realObservation() {
  return createMarketPriceObservation({
    sourceId: "CSO_AG_PRICES",
    datasetId: "AJM09",
    sourceSeriesCode: "012",
    sourceSeriesLabel: "Compound 18-6-12",
    mappedProduct: "18-6-12",
    mappingKind: "EXACT_PRODUCT_MATCH",
    priceAmount: "645",
    priceBasis: "per_tonne",
    vatTreatment: "unknown",
    deliveryBasis: "unknown",
    geography: "Ireland",
    referencePeriod: "2026-07",
    sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
    retrievedAt: "2026-09-20T12:00:00.000Z",
    contentHash: "a".repeat(64),
    ingestionBatchId: "11111111-1111-1111-1111-111111111111",
    sourceUrl: null,
  });
}

function makeClient(responseData: MarketPriceObservationRow[] | null) {
  const eqSpy = vi.fn().mockResolvedValue({ data: responseData, error: null });
  const selectSpy = vi.fn().mockReturnValue({ eq: eqSpy });
  const fromSpy = vi.fn().mockReturnValue({ select: selectSpy });
  return { from: fromSpy } as unknown as SupabaseClient;
}

describe("loadMarketReferencePrice — IO + pure resolver composition", () => {
  it("loads eligible candidates for the requested product and resolves the winning one, carrying its real database id", async () => {
    const obs = realObservation();
    const row = { ...toInsertRow(obs), id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" };
    const client = makeClient([row]);
    const outcome = await loadMarketReferencePrice(client, { mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    expect(outcome.status).toBe("OK");
    if (outcome.status === "OK") {
      expect(outcome.value.amount.amount).toBe("645");
      expect(outcome.value.observationDatabaseId).toBe("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    }
  });

  it("returns unavailable, never a fabricated price, when nothing is persisted yet (the real current Dev state)", async () => {
    const client = makeClient(null);
    const outcome = await loadMarketReferencePrice(client, { mappedProduct: "18-6-12", asOfDate: "2026-09-25" });
    expect(outcome.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });
});
