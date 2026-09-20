/**
 * Non-production, documentation-only examples (Phase 3 brief §32) — built
 * from the exact same real fixture observations `market-evidence.
 * examples.ts` already defines (Phase 2), not invented data. NEVER
 * imported by application code.
 */

import { createMarketPriceObservation, canonicalContentHashInput, type MarketPriceObservation } from "./market-evidence";
import { resolveMarketReferencePrice } from "./market-price-resolution";
import { createHash } from "node:crypto";

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

const UREA_FIELDS = {
  datasetId: "AJM09",
  sourceSeriesCode: "002",
  referencePeriod: "2026-07",
  priceAmount: "412",
  priceBasis: "per_tonne" as const,
  vatTreatment: "unknown" as const,
  deliveryBasis: "unknown" as const,
  mappingKind: "CATEGORY_BENCHMARK" as const,
  mappedProduct: "Protected Urea",
};

const EXAMPLE_UREA_BENCHMARK_OBSERVATION: MarketPriceObservation = createMarketPriceObservation({
  sourceId: "CSO_AG_PRICES",
  ...UREA_FIELDS,
  sourceSeriesLabel: "Urea (46% N)",
  geography: "Ireland",
  sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
  retrievedAt: "2026-09-20T12:00:00.000Z",
  contentHash: hash(canonicalContentHashInput(UREA_FIELDS)),
  ingestionBatchId: "b1a2c3d4-0000-4000-8000-000000000001",
  sourceUrl: "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en",
});

const JULY_SEPT_FIELDS = {
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
const JULY_OCT_REVISION_FIELDS = { ...JULY_SEPT_FIELDS, priceAmount: "647" };

const EXAMPLE_JULY_RETRIEVED_SEPT: MarketPriceObservation = createMarketPriceObservation({
  sourceId: "CSO_AG_PRICES",
  ...JULY_SEPT_FIELDS,
  sourceSeriesLabel: "Compound 18-6-12",
  geography: "Ireland",
  sourceUpdatedAt: "2026-09-15T11:00:00.000Z",
  retrievedAt: "2026-09-20T12:00:00.000Z",
  contentHash: hash(canonicalContentHashInput(JULY_SEPT_FIELDS)),
  ingestionBatchId: "b1a2c3d4-0000-4000-8000-000000000001",
  sourceUrl: "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en",
});

const EXAMPLE_JULY_REVISED_RETRIEVED_OCT: MarketPriceObservation = createMarketPriceObservation({
  sourceId: "CSO_AG_PRICES",
  ...JULY_OCT_REVISION_FIELDS,
  sourceSeriesLabel: "Compound 18-6-12",
  geography: "Ireland",
  sourceUpdatedAt: "2026-10-15T11:00:00.000Z",
  retrievedAt: "2026-10-20T12:00:00.000Z",
  contentHash: hash(canonicalContentHashInput(JULY_OCT_REVISION_FIELDS)),
  ingestionBatchId: "b1a2c3d4-0000-4000-8000-000000000002",
  sourceUrl: "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en",
});

/** A. Exact 18-6-12 market-reference resolution — fixture-based (no live
 * Dev data exists yet; see the Phase 3 STOP AND REPORT). */
export const EXAMPLE_EXACT_RESOLUTION = resolveMarketReferencePrice({
  candidates: [EXAMPLE_JULY_RETRIEVED_SEPT],
  mappedProduct: "18-6-12",
  asOfDate: "2026-09-25",
});

/** B. Protected Urea CATEGORY_BENCHMARK resolution, with the proxy
 * limitation — fixture-based. */
export const EXAMPLE_BENCHMARK_RESOLUTION = resolveMarketReferencePrice({
  candidates: [EXAMPLE_UREA_BENCHMARK_OBSERVATION],
  mappedProduct: "Protected Urea",
  asOfDate: "2026-09-25",
});

/** C. Historical resolution before/after a revision using knownAt —
 * fixture-based; both variants resolve over the SAME two-observation
 * candidate set, differing only in `knownAt`. */
export const EXAMPLE_HISTORICAL_BEFORE_REVISION = resolveMarketReferencePrice({
  candidates: [EXAMPLE_JULY_RETRIEVED_SEPT, EXAMPLE_JULY_REVISED_RETRIEVED_OCT],
  mappedProduct: "18-6-12",
  asOfDate: "2026-10-31",
  knownAt: "2026-09-30T23:59:59.000Z",
});
export const EXAMPLE_HISTORICAL_AFTER_REVISION = resolveMarketReferencePrice({
  candidates: [EXAMPLE_JULY_RETRIEVED_SEPT, EXAMPLE_JULY_REVISED_RETRIEVED_OCT],
  mappedProduct: "18-6-12",
  asOfDate: "2026-10-31",
  knownAt: "2026-10-31T23:59:59.000Z",
});

/** D. Unavailable result — no eligible observation exists (this is the
 * genuinely real behaviour of the actually-empty Dev
 * `market_price_observations` table right now, not just a fixture). */
export const EXAMPLE_UNAVAILABLE_RESOLUTION = resolveMarketReferencePrice({
  candidates: [],
  mappedProduct: "18-6-12",
  asOfDate: "2026-09-25",
});
