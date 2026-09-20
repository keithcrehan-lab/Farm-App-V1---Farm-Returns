/**
 * Persistence adapter for `market_price_observations`
 * (`supabase/migrations/20260920000000_market_price_observations.sql`).
 * Server-only by association with its only caller
 * (`cso-fertiliser-sync.ts`, which supplies a service-role client — see
 * `src/lib/supabase/service-role.ts`).
 *
 * `toInsertRow`/`fromDbRow` are the runtime-validated mapper brief §12
 * requires at the database boundary: `fromDbRow` re-validates every field
 * through `createMarketPriceObservation` (Phase 2's own constructor,
 * which itself delegates the monetary check to Phase 1's
 * `createMoneyAmount`) rather than trusting a raw Supabase row shape —
 * exact decimal survives DB -> TypeScript -> MoneyAmount because
 * `price_amount` is a `text` column (never `numeric`, which PostgREST
 * would serialise as a JSON number) and the mapper never calls
 * `Number()`/`parseFloat` on it.
 *
 * Idempotency: `insertObservations` upserts with `ignoreDuplicates: true`
 * against the migration's own composite unique constraint
 * (`dataset_id, source_series_code, reference_period, content_hash`).
 * Supabase/PostgREST omits conflicting rows from the returned data under
 * `ignoreDuplicates`, so `insertedCount`/`skippedAsDuplicateCount` are
 * derived from what's actually returned — no extra existence query
 * needed, and no row is ever updated (a genuine revision has a different
 * `content_hash`, so it is never a "conflict" — it inserts as a new,
 * additional row, exactly brief §11's required behaviour).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createMarketPriceObservation, type MarketPriceObservation } from "@/domain/market-evidence";
import type { SourceId } from "@/domain/source-register";

const TABLE = "market_price_observations";
/** Must match the migration's own composite unique constraint exactly —
 * see this file's header. */
const CONFLICT_TARGET = "dataset_id,source_series_code,reference_period,content_hash";

export interface MarketPriceObservationRow {
  id?: string;
  source_id: string;
  dataset_id: string;
  source_series_code: string;
  source_series_label: string;
  mapped_product: string | null;
  mapping_kind: string;
  price_amount: string;
  currency: string;
  price_basis: string;
  vat_treatment: string;
  delivery_basis: string;
  geography: string;
  reference_period: string;
  source_updated_at: string | null;
  retrieved_at: string;
  content_hash: string;
  ingestion_batch_id: string;
  source_url: string | null;
  benchmark_status?: string;
  created_at?: string;
}

/** Domain object -> insertable row. Never includes `id`/`created_at` —
 * the database assigns both. */
export function toInsertRow(observation: MarketPriceObservation): MarketPriceObservationRow {
  return {
    source_id: observation.sourceId,
    dataset_id: observation.datasetId,
    source_series_code: observation.sourceSeriesCode,
    source_series_label: observation.sourceSeriesLabel,
    mapped_product: observation.mappedProduct,
    mapping_kind: observation.mappingKind,
    price_amount: observation.price.amount,
    currency: observation.price.currency,
    price_basis: observation.priceBasis,
    vat_treatment: observation.vatTreatment,
    delivery_basis: observation.deliveryBasis,
    geography: observation.geography,
    reference_period: observation.referencePeriod,
    source_updated_at: observation.sourceUpdatedAt,
    retrieved_at: observation.retrievedAt,
    content_hash: observation.contentHash,
    ingestion_batch_id: observation.ingestionBatchId,
    source_url: observation.sourceUrl,
    benchmark_status: observation.benchmarkStatus,
  };
}

/** Row (however sourced — a real Supabase response, or a fixture in a
 * test) -> domain object, with full runtime validation. Throws on any
 * row that doesn't satisfy `createMarketPriceObservation`'s own
 * invariants — a defence-in-depth check independent of the DB's own
 * CHECK constraints, never a silent pass-through. */
export function fromDbRow(row: MarketPriceObservationRow): MarketPriceObservation {
  return createMarketPriceObservation({
    sourceId: row.source_id as SourceId,
    datasetId: row.dataset_id,
    sourceSeriesCode: row.source_series_code,
    sourceSeriesLabel: row.source_series_label,
    mappedProduct: row.mapped_product,
    mappingKind: row.mapping_kind as MarketPriceObservation["mappingKind"],
    priceAmount: row.price_amount,
    priceBasis: row.price_basis as MarketPriceObservation["priceBasis"],
    vatTreatment: row.vat_treatment as MarketPriceObservation["vatTreatment"],
    deliveryBasis: row.delivery_basis as MarketPriceObservation["deliveryBasis"],
    geography: row.geography,
    referencePeriod: row.reference_period,
    sourceUpdatedAt: row.source_updated_at,
    retrievedAt: row.retrieved_at,
    contentHash: row.content_hash,
    ingestionBatchId: row.ingestion_batch_id,
    sourceUrl: row.source_url,
  });
}

export interface InsertObservationsResult {
  insertedCount: number;
  skippedAsDuplicateCount: number;
  inserted: MarketPriceObservation[];
}

/**
 * Idempotent batch insert. Accepts any `SupabaseClient` (a real
 * service-role client in production, an injected mock/fake in tests —
 * see `cso-fertiliser-repository.test.ts`) so this function never needs
 * live Supabase to be tested.
 */
export async function insertObservations(
  client: SupabaseClient,
  observations: readonly MarketPriceObservation[],
): Promise<InsertObservationsResult> {
  if (observations.length === 0) {
    return { insertedCount: 0, skippedAsDuplicateCount: 0, inserted: [] };
  }
  const rows = observations.map(toInsertRow);
  const { data, error } = await client
    .from(TABLE)
    .upsert(rows, { onConflict: CONFLICT_TARGET, ignoreDuplicates: true })
    .select();

  if (error) {
    throw new Error(`market_price_observations insert failed: ${error.message}`);
  }

  const insertedRows = (data ?? []) as MarketPriceObservationRow[];
  const inserted = insertedRows.map(fromDbRow);
  return {
    insertedCount: inserted.length,
    skippedAsDuplicateCount: observations.length - inserted.length,
    inserted,
  };
}
