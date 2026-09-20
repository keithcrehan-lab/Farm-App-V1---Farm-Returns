/**
 * Non-production, documentation-only examples (Phase 2 brief §23) —
 * NEVER imported by application code, only by tests/docs that want a
 * concrete, real-shaped `MarketPriceObservation` to point at. Built from
 * genuine fixture semantics (`cso-fertiliser-client.real-fixtures.ts`'s
 * live-captured sample), not an invented "current" price.
 */

import { createMarketPriceObservation, canonicalContentHashInput, type MarketPriceObservation } from "./market-evidence";
import { createHash } from "node:crypto";

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

const EXACT_MATCH_FIELDS = {
  datasetId: "AJM09",
  sourceSeriesCode: "012",
  referencePeriod: "2026-07",
  priceAmount: "645",
  priceBasis: "per_tonne" as const,
  vatTreatment: "unknown" as const,
  deliveryBasis: "unknown" as const,
  mappingKind: "EXACT_PRODUCT_MATCH" as const,
  mappedProduct: "18-6-12",
};

/** A. Canonical valid CSO market observation — Compound 18-6-12, July
 * 2026, an exact product match, real value from the live sample. */
export const EXAMPLE_CANONICAL_OBSERVATION: MarketPriceObservation = createMarketPriceObservation({
  sourceId: "CSO_AG_PRICES",
  ...EXACT_MATCH_FIELDS,
  sourceSeriesLabel: "Compound 18-6-12",
  geography: "Ireland",
  sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
  retrievedAt: "2026-09-20T12:00:00.000Z",
  contentHash: hash(canonicalContentHashInput(EXACT_MATCH_FIELDS)),
  ingestionBatchId: "b1a2c3d4-0000-4000-8000-000000000001",
  sourceUrl: "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en",
});

const REVISED_FIELDS = { ...EXACT_MATCH_FIELDS, priceAmount: "647" };

/** B. The SAME reference period (2026-07, series 012) after a later
 * official revision — a different content_hash, a distinct row; the
 * original (A) remains independently retrievable, never overwritten. */
export const EXAMPLE_REVISED_OBSERVATION: MarketPriceObservation = createMarketPriceObservation({
  sourceId: "CSO_AG_PRICES",
  ...REVISED_FIELDS,
  sourceSeriesLabel: "Compound 18-6-12",
  geography: "Ireland",
  sourceUpdatedAt: "2026-10-15T11:00:00.000Z",
  retrievedAt: "2026-10-20T12:00:00.000Z",
  contentHash: hash(canonicalContentHashInput(REVISED_FIELDS)),
  ingestionBatchId: "b1a2c3d4-0000-4000-8000-000000000002",
  sourceUrl: "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en",
});

const UNSUPPORTED_FIELDS = {
  datasetId: "AJM09",
  sourceSeriesCode: "021",
  referencePeriod: "2026-07",
  priceAmount: "674",
  priceBasis: "per_tonne" as const,
  vatTreatment: "unknown" as const,
  deliveryBasis: "unknown" as const,
  mappingKind: "UNSUPPORTED_MAPPING" as const,
  mappedProduct: null,
};

/** C. Compound 13-6-20 — a real AJM09 series with no corresponding Farm
 * Return product. mappedProduct stays null; the source category/price is
 * still preserved, but no product-specific price is fabricated. */
export const EXAMPLE_UNSUPPORTED_MAPPING_OBSERVATION: MarketPriceObservation = createMarketPriceObservation({
  sourceId: "CSO_AG_PRICES",
  ...UNSUPPORTED_FIELDS,
  sourceSeriesLabel: "Compound 13-6-20",
  geography: "Ireland",
  sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
  retrievedAt: "2026-09-20T12:00:00.000Z",
  contentHash: hash(canonicalContentHashInput(UNSUPPORTED_FIELDS)),
  ingestionBatchId: "b1a2c3d4-0000-4000-8000-000000000001",
  sourceUrl: "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en",
});
