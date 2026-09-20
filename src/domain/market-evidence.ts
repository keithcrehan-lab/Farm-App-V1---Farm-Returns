/**
 * Economic Opportunity Engine, Phase 2 — canonical market-price evidence
 * type (`src/server/market/`'s CSO adapter/sync pipeline is the only
 * writer; `supabase/migrations/20260920000000_market_price_observations.sql`
 * is the only table). This module is pure domain — no fetch, no
 * Supabase client, no Node-only APIs — so it is safe to import from
 * anywhere `money.ts`/`economic-opportunity.ts` already are.
 *
 * This is MARKET EVIDENCE, not a calculation: a `MarketPriceObservation`
 * records what an official source said, when, for what reference period,
 * and how confidently it maps to a Farm Return product — nothing here
 * computes a farm return, an avoided cost, or a ranked opportunity (that
 * is explicitly out of Phase 2's scope; see DOMAIN_CONTRACTS.md).
 *
 * Reuses Phase 1's `MoneyAmount`/`PriceBasis`/`VatTreatment` and
 * `source-register.ts`'s `SourceId` exactly — no parallel vocabulary.
 */

import { createMoneyAmount, type MoneyAmount } from "./money";
import type { PriceBasis, VatTreatment } from "./economic-opportunity";
import type { SourceId } from "./source-register";

/**
 * How confidently `sourceSeriesLabel` (the official source's own
 * category/product label) maps to a Farm Return product. Never inferred
 * loosely — `createMarketPriceObservation` enforces that
 * `UNSUPPORTED_MAPPING` can only pair with `mappedProduct: null`, so a
 * mapping that cannot be defended can never carry a fabricated
 * product-specific price (see `src/server/market/cso-fertiliser-mapping.ts`
 * for the actual AJM09 classifications).
 */
export type MarketEvidenceMappingKind =
  | "EXACT_PRODUCT_MATCH"
  | "CATEGORY_BENCHMARK"
  | "DERIVED_PROXY"
  | "UNSUPPORTED_MAPPING";

/** Whether the observed price is known to include/exclude delivery, or
 * the official source simply doesn't say — same "never infer" discipline
 * as `VatTreatment`. */
export type DeliveryBasis = "included" | "excluded" | "unknown";

/** "YYYY-MM" — the source's own calendar-month reference period. Deliberately
 * a distinct field from `retrievedAt` (brief §8: never describe a July
 * observation as "the current September price" merely because it was
 * fetched in September). */
export type ReferencePeriod = string;

const REFERENCE_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * One immutable, append-only market-price observation from an official
 * external source. Always `benchmarkStatus: "INDICATIVE"` in Phase
 * 2 — this is national market evidence, never a supplier quotation,
 * never presented as "live". Construct only via
 * `createMarketPriceObservation`, never as an object literal, so the
 * mapping/decimal invariants below cannot be bypassed.
 */
export interface MarketPriceObservation {
  readonly sourceId: SourceId;
  readonly datasetId: string;
  /** The official source's own series/category code (e.g. AJM09's
   * `C02069V02500` code, `"012"`). */
  readonly sourceSeriesCode: string;
  /** The official source's own label for that series, verbatim (e.g.
   * `"Compound 18-6-12"`) — always retained, even when `mappedProduct`
   * is null. */
  readonly sourceSeriesLabel: string;
  /** A Farm Return product name (`nutrients.ts`'s `PRODUCTS`), or `null`
   * whenever `mappingKind` is `UNSUPPORTED_MAPPING`. */
  readonly mappedProduct: string | null;
  readonly mappingKind: MarketEvidenceMappingKind;
  readonly price: MoneyAmount;
  readonly priceBasis: PriceBasis;
  readonly vatTreatment: VatTreatment;
  readonly deliveryBasis: DeliveryBasis;
  readonly geography: string;
  readonly referencePeriod: ReferencePeriod;
  /** The official dataset's own last-revised timestamp, where the source
   * exposes one (ISO string) — null when not obtainable, never guessed. */
  readonly sourceUpdatedAt: string | null;
  /** When Farm Return itself fetched this row (ISO string) — see this
   * type's own doc comment: never conflated with `referencePeriod`. */
  readonly retrievedAt: string;
  /** Deterministic content identity for idempotent sync — see
   * `canonicalContentHashInput`. A 64-character lowercase hex SHA-256
   * digest, computed server-side (`src/server/market/`, which has
   * Node's `crypto` available; this module stays hash-*input*-only so it
   * has no Node-only dependency). */
  readonly contentHash: string;
  /** Groups every row written by one sync run — not part of content
   * identity (brief §11: "do not use timestamps alone to determine
   * equality"). */
  readonly ingestionBatchId: string;
  readonly sourceUrl: string | null;
  readonly benchmarkStatus: "INDICATIVE";
}

export interface CreateMarketPriceObservationInput {
  sourceId: SourceId;
  datasetId: string;
  sourceSeriesCode: string;
  sourceSeriesLabel: string;
  mappedProduct: string | null;
  mappingKind: MarketEvidenceMappingKind;
  /** A canonical decimal string, exactly as read from the official
   * source's own text representation — never a JS `number` derived from
   * prior floating-point arithmetic (see `src/server/market/
   * cso-fertiliser-parser.ts`'s own header for how AJM09's CSV VALUE
   * column is kept textual all the way to this call). */
  priceAmount: string;
  priceBasis: PriceBasis;
  vatTreatment: VatTreatment;
  deliveryBasis: DeliveryBasis;
  geography: string;
  referencePeriod: ReferencePeriod;
  sourceUpdatedAt: string | null;
  retrievedAt: string;
  contentHash: string;
  ingestionBatchId: string;
  sourceUrl: string | null;
}

/**
 * Validated constructor — the only way to build a `MarketPriceObservation`.
 * Throws (fails closed) rather than silently accepting:
 *  - a non-canonical `priceAmount` (delegated to `createMoneyAmount`,
 *    Phase 1's own "invalid monetary inputs cannot enter the domain" gate);
 *  - `mappingKind: "UNSUPPORTED_MAPPING"` paired with a non-null
 *    `mappedProduct` (a fabricated product-specific price for a mapping
 *    that can't be defended — brief §15's central rule);
 *  - a `referencePeriod` that isn't a real "YYYY-MM" string;
 *  - a `contentHash` that isn't a 64-character hex SHA-256 digest shape.
 */
export function createMarketPriceObservation(input: CreateMarketPriceObservationInput): MarketPriceObservation {
  if (input.mappingKind === "UNSUPPORTED_MAPPING" && input.mappedProduct !== null) {
    throw new Error(
      `MarketPriceObservation: mappingKind "UNSUPPORTED_MAPPING" must have mappedProduct: null — got "${input.mappedProduct}". An unsupported mapping must never carry a fabricated product-specific price.`,
    );
  }
  if (input.mappingKind !== "UNSUPPORTED_MAPPING" && input.mappedProduct === null) {
    throw new Error(
      `MarketPriceObservation: mappingKind "${input.mappingKind}" requires a non-null mappedProduct.`,
    );
  }
  if (!REFERENCE_PERIOD_PATTERN.test(input.referencePeriod)) {
    throw new Error(`MarketPriceObservation: referencePeriod "${input.referencePeriod}" is not a canonical "YYYY-MM" string.`);
  }
  if (!/^[0-9a-f]{64}$/.test(input.contentHash)) {
    throw new Error(`MarketPriceObservation: contentHash must be a 64-character lowercase hex SHA-256 digest, got "${input.contentHash}".`);
  }
  const price = createMoneyAmount(input.priceAmount, "EUR");
  return {
    sourceId: input.sourceId,
    datasetId: input.datasetId,
    sourceSeriesCode: input.sourceSeriesCode,
    sourceSeriesLabel: input.sourceSeriesLabel,
    mappedProduct: input.mappedProduct,
    mappingKind: input.mappingKind,
    price,
    priceBasis: input.priceBasis,
    vatTreatment: input.vatTreatment,
    deliveryBasis: input.deliveryBasis,
    geography: input.geography,
    referencePeriod: input.referencePeriod,
    sourceUpdatedAt: input.sourceUpdatedAt,
    retrievedAt: input.retrievedAt,
    contentHash: input.contentHash,
    ingestionBatchId: input.ingestionBatchId,
    sourceUrl: input.sourceUrl,
    benchmarkStatus: "INDICATIVE",
  };
}

/**
 * The exact, deterministic string `src/server/market/`'s SHA-256 hashing
 * must run over to produce `contentHash` — kept here (not in the server
 * layer) so both the writer (sync pipeline) and any future reader that
 * needs to re-derive/verify a hash use one definition. Only the fields
 * that determine whether two observations are the *same content*
 * participate — never `retrievedAt`/`ingestionBatchId`/`sourceUpdatedAt`,
 * so re-fetching identical source content on a later day still produces
 * the same hash (idempotent sync), and a genuine source revision (any
 * field below actually changing) produces a different hash (new retained
 * revision). Field order is fixed and explicit, not derived from object
 * key order, so the result is stable across engine versions.
 */
export function canonicalContentHashInput(
  input: Pick<
    CreateMarketPriceObservationInput,
    | "datasetId"
    | "sourceSeriesCode"
    | "referencePeriod"
    | "priceAmount"
    | "priceBasis"
    | "vatTreatment"
    | "deliveryBasis"
    | "mappingKind"
    | "mappedProduct"
  >,
): string {
  return [
    input.datasetId,
    input.sourceSeriesCode,
    input.referencePeriod,
    input.priceAmount,
    input.priceBasis,
    input.vatTreatment,
    input.deliveryBasis,
    input.mappingKind,
    input.mappedProduct ?? "",
  ].join("\u0000");
}
