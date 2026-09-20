/**
 * Orchestrates one CSO AJM09 sync: fetch -> parse -> map product ->
 * build canonical `MarketPriceObservation`s -> persist. The bounded,
 * server-side "sync mechanism" brief §14 asks for — never invoked from a
 * client component, never something ordinary Today/app rendering depends
 * on. Triggered via `src/app/api/admin/market/sync-cso-fertiliser-prices/
 * route.ts` (an explicit, secret-gated admin pathway — brief §14's own
 * suggested example) in V1; no cron/scheduled automation is added (none
 * already exists in this repo, per boundary).
 *
 * Every dependency (`fetchCsv`, `fetchMetadata`, `insert`, the hash
 * function, the batch-id generator) is injectable so this orchestration
 * is fully unit-testable against deterministic fixtures — never against
 * live CSO or a live database (brief §20/§21: "do not make the entire
 * test suite depend on live CSO availability").
 *
 * External-API-failure and malformed-schema behaviour never call
 * `insert` at all — every previously stored observation is left
 * completely untouched (brief §14: "External API failure must not
 * destroy previously stored observations").
 */

import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCsoFertiliserCsv, fetchCsoFertiliserMetadata } from "./cso-fertiliser-client";
import { parseCsoFertiliserCsv, parseCsoFertiliserMetadata } from "./cso-fertiliser-parser";
import { mapCsoFertiliserSeries } from "./cso-fertiliser-mapping";
import { insertObservations } from "./cso-fertiliser-repository";
import { canonicalContentHashInput, createMarketPriceObservation, type MarketPriceObservation } from "@/domain/market-evidence";

export interface CsoFertiliserSyncResult {
  status: "ok" | "source_unavailable" | "source_schema_unrecognised";
  reason?: string;
  ingestionBatchId: string;
  observationsBuilt: number;
  observationsSkippedMissingValue: number;
  observationsRejectedByParser: number;
  insertedCount: number;
  skippedAsDuplicateCount: number;
  retrievedAt: string;
}

export interface CsoFertiliserSyncDeps {
  fetchCsv?: typeof fetchCsoFertiliserCsv;
  fetchMetadata?: typeof fetchCsoFertiliserMetadata;
  insert?: typeof insertObservations;
  hash?: (input: string) => string;
  generateBatchId?: () => string;
}

function emptyResult(
  status: "source_unavailable" | "source_schema_unrecognised",
  reason: string,
  ingestionBatchId: string,
  retrievedAt: string,
): CsoFertiliserSyncResult {
  return {
    status,
    reason,
    ingestionBatchId,
    observationsBuilt: 0,
    observationsSkippedMissingValue: 0,
    observationsRejectedByParser: 0,
    insertedCount: 0,
    skippedAsDuplicateCount: 0,
    retrievedAt,
  };
}

export async function runCsoFertiliserSync(client: SupabaseClient, deps: CsoFertiliserSyncDeps = {}): Promise<CsoFertiliserSyncResult> {
  const fetchCsv = deps.fetchCsv ?? fetchCsoFertiliserCsv;
  const fetchMetadata = deps.fetchMetadata ?? fetchCsoFertiliserMetadata;
  const insert = deps.insert ?? insertObservations;
  const hash = deps.hash ?? ((input: string) => createHash("sha256").update(input, "utf8").digest("hex"));
  const generateBatchId = deps.generateBatchId ?? (() => randomUUID());

  const ingestionBatchId = generateBatchId();

  const csvResult = await fetchCsv();
  if (csvResult.status === "unavailable") {
    return emptyResult("source_unavailable", csvResult.reason, ingestionBatchId, csvResult.retrievedAt);
  }

  const parsed = parseCsoFertiliserCsv(csvResult.body);
  if (parsed.status === "schema_unrecognised") {
    return emptyResult("source_schema_unrecognised", parsed.reason, ingestionBatchId, csvResult.retrievedAt);
  }

  // Metadata is best-effort enrichment only -- its own unavailability
  // never fails the sync, only leaves sourceUpdatedAt null.
  let sourceUpdatedAt: string | null = null;
  const metadataResult = await fetchMetadata();
  if (metadataResult.status === "ok") {
    sourceUpdatedAt = parseCsoFertiliserMetadata(metadataResult.body).updatedAt;
  }

  const observations: MarketPriceObservation[] = [];
  let skippedMissingValue = 0;

  for (const row of parsed.rows) {
    if (row.value.status === "missing") {
      // A genuine CSO-suppressed observation -- never persisted as a
      // fabricated zero price (brief §2/§4).
      skippedMissingValue++;
      continue;
    }
    const mapping = mapCsoFertiliserSeries(row.seriesCode, row.seriesLabel);
    const hashInput = canonicalContentHashInput({
      datasetId: "AJM09",
      sourceSeriesCode: row.seriesCode,
      referencePeriod: row.referencePeriod,
      priceAmount: row.value.raw,
      priceBasis: "per_tonne",
      vatTreatment: "unknown",
      deliveryBasis: "unknown",
      mappingKind: mapping.mappingKind,
      mappedProduct: mapping.mappedProduct,
    });
    observations.push(
      createMarketPriceObservation({
        sourceId: "CSO_AG_PRICES",
        datasetId: "AJM09",
        sourceSeriesCode: row.seriesCode,
        sourceSeriesLabel: row.seriesLabel,
        mappedProduct: mapping.mappedProduct,
        mappingKind: mapping.mappingKind,
        // row.value.raw is the untouched CSV text -- never parsed to a
        // number anywhere on this path (see cso-fertiliser-parser.ts's
        // header).
        priceAmount: row.value.raw,
        priceBasis: "per_tonne", // AJM09's own UNIT is always "Euro per Tonne" -- validated by the parser.
        vatTreatment: "unknown", // Never stated by the official source -- never inferred.
        deliveryBasis: "unknown",
        geography: "Ireland",
        referencePeriod: row.referencePeriod,
        sourceUpdatedAt,
        retrievedAt: csvResult.retrievedAt,
        contentHash: hash(hashInput),
        ingestionBatchId,
        sourceUrl: csvResult.url,
      }),
    );
  }

  const insertResult = await insert(client, observations);

  return {
    status: "ok",
    ingestionBatchId,
    observationsBuilt: observations.length,
    observationsSkippedMissingValue: skippedMissingValue,
    observationsRejectedByParser: parsed.rejectedRowCount,
    insertedCount: insertResult.insertedCount,
    skippedAsDuplicateCount: insertResult.skippedAsDuplicateCount,
    retrievedAt: csvResult.retrievedAt,
  };
}
