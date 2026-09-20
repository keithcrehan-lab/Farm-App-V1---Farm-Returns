/**
 * Economic Opportunity Engine, Phase 3 — Auditable Fertiliser Price
 * Resolution V1.
 *
 * Pure domain resolution over Phase 2's persisted `MarketPriceObservation`
 * evidence. This module never touches Supabase — a caller (a server-side
 * loader, e.g. `src/server/market/market-reference-price-loader.ts`) reads
 * a bounded candidate set for one Farm Return product and hands it to
 * `resolveMarketReferencePrice` here; database IO and price-selection
 * methodology stay separately testable (brief §4).
 *
 * This is selection, not calculation: no fertiliser cost, no slurry
 * value, no avoided-purchase cost, no arithmetic on the resolved amount
 * at all — `resolveMarketReferencePrice` only ever returns one candidate
 * observation's own `MoneyAmount` unchanged (brief §18: "No arithmetic
 * should be necessary in Phase 3").
 *
 * Reuses, never duplicates: `MoneyAmount`/`PriceBasis`/`VatTreatment`
 * (Phase 1), `MarketPriceObservation`/`MarketEvidenceMappingKind` (Phase
 * 2), `EngineOutcome<T>`/`ok`/`blockedInsufficientEvidence`
 * (`evidence.ts`), and `PriceSourceLevel` (`price-resolution.ts` — the
 * existing generic farmer_entered > supplier_quote > market_reference >
 * historical_benchmark > unavailable hierarchy, which this module does
 * NOT modify; see this file's own header note below on scope).
 *
 * Eligibility (brief §5/§6): `UNSUPPORTED_MAPPING` observations are never
 * eligible for a product-specific price — `createMarketPriceObservation`
 * already forbids that combination from existing at all
 * (`mappedProduct: null` is enforced), and this resolver adds a
 * redundant, explicit defence-in-depth check anyway rather than relying
 * solely on that upstream invariant. `EXACT_PRODUCT_MATCH` resolves as a
 * genuine product-specific reference; `CATEGORY_BENCHMARK` (e.g. AJM09's
 * generic "Urea (46% N)" standing in for Protected Urea) resolves too,
 * but always carries an explicit `limitations` entry naming it a
 * national benchmark, never an exact product price — this resolver never
 * "promotes" a benchmark's `mappingKind`, only ever passes through
 * whichever kind the selected observation actually has.
 *
 * Time semantics (brief §9/§10 — the core of this phase):
 *  - `asOfDate` ("YYYY-MM-DD") — a decision date. An observation whose
 *    `referencePeriod` is a calendar month after `asOfDate`'s own month
 *    is never selected; among eligible reference periods, the most
 *    recent one is used. No freshness/staleness policy exists — old data
 *    may be selected if it is the latest eligible evidence, and its real
 *    `referencePeriod` stays visible in the result, never disguised.
 *  - `knownAt` (optional, ISO datetime) — a knowledge cutoff, distinct
 *    from `asOfDate`. An observation retrieved after `knownAt` is
 *    ineligible, so a later real-world CSO revision cannot leak into a
 *    resolution reproducing an earlier decision. When omitted, `knownAt`
 *    defaults to the end of `asOfDate`'s own calendar day
 *    ("`asOfDate`T23:59:59.999Z") — NOT to "no cutoff at all". This
 *    matters: `asOfDate` alone answers "which reference period", not
 *    "what was known" — without this default, a caller who only sets a
 *    historical `asOfDate` (forgetting `knownAt`) would silently get a
 *    resolution contaminated by revisions retrieved after that date,
 *    breaking historical reproducibility (found and fixed in the Phase 3
 *    independent review: `asOfDate: "2026-09-30"` with `knownAt` omitted
 *    resolved to a 647 revision not retrieved until 20 October). A
 *    caller who genuinely wants "the best current understanding, applied
 *    retroactively to a past reference period" remains fully able to ask
 *    for that — explicitly, by passing today's real timestamp as
 *    `knownAt` — it is simply no longer the silent default.
 *  - Deterministic tie-break: when two eligible revisions of the same
 *    winning reference period share the exact same `retrievedAt`, the
 *    lexically greater `contentHash` wins — arbitrary but fixed, and
 *    documented here so it is reproducible rather than depending on
 *    database/array natural order (brief §11).
 *
 * Scope note — `price-resolution.ts` integration deliberately NOT built
 * here: that module's `ResolvedPrice.valueEurPerUnit` is a plain
 * JS `number`, and Phase 3's own boundary (brief §18) forbids any
 * `Number()`/arithmetic conversion of a `MoneyAmount` in this phase.
 * `AuditableMarketPriceResolution.sourceTier` is typed as the exact
 * `"market_reference"` member of `price-resolution.ts`'s own
 * `PriceSourceLevel` union purely for vocabulary consistency — so a
 * later phase that DOES wire this into `resolvePrice()` (an explicit
 * later decision, not made here) has a self-identifying tier to map
 * from. `price-resolution.ts` itself is unmodified and untouched by any
 * import in this file.
 */

import type { MarketEvidenceMappingKind, MarketPriceObservation, ReferencePeriod } from "./market-evidence";
import type { MoneyAmount } from "./money";
import type { PriceBasis, VatTreatment } from "./economic-opportunity";
import type { PriceSourceLevel } from "./price-resolution";
import type { SourceId } from "./source-register";
import { ok, blockedInsufficientEvidence, type EngineOutcome } from "./evidence";

/**
 * Every resolved market-reference price uses `IRISH_MODEL` — never
 * `MEASURED` or `DERIVED` (found and fixed in the Phase 3 independent
 * review, §9). `evidence.ts`'s own authoritative vocabulary
 * (`docs/scientific-engine/v3/implementation/data_quality_states.csv`)
 * defines `MEASURED` as "Direct farm/lab measurement" and `DERIVED` as
 * "Calculated deterministically from measured inputs" — neither
 * describes a raw official CSO national statistic, which Farm Return
 * neither measured on-farm nor calculated; `IRISH_MODEL`'s own
 * definition — "Official/current Irish model output such as Met Éireann
 * SMD" — is the exact fit. This is uniform across `EXACT_PRODUCT_MATCH`
 * and `CATEGORY_BENCHMARK`: the evidence SOURCE is equally official in
 * both cases, so `EvidenceState` should not re-encode the
 * product-mapping-quality distinction that `mappingKind` and the
 * mandatory `limitations` entry already carry more precisely.
 */
const MARKET_REFERENCE_EVIDENCE_STATE = "IRISH_MODEL";

/** Always `"market_reference"` — see this file's header "Scope note". */
export type MarketReferenceSourceTier = Extract<PriceSourceLevel, "market_reference">;

const ASOF_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** One rejected/superseded candidate, kept for independent reproduction
 * of *why* the winning observation was selected — not an exhaustive
 * debug log (brief §16: "avoid enormous debug payloads"). Bounded
 * naturally: a candidate set is already scoped to one product by the
 * caller, so this list is at most that product's real observation count. */
export interface RejectedMarketPriceCandidate {
  contentHash: string;
  referencePeriod: ReferencePeriod;
  retrievedAt: string;
  reason: string;
}

/** The full resolution rationale — brief §16's "concise structured
 * resolution trace", not application logging. */
export interface MarketPriceResolutionTrace {
  sourceTier: MarketReferenceSourceTier;
  mappedProduct: string;
  selectedSourceSeriesCode: string;
  selectedContentHash: string;
  mappingKind: MarketEvidenceMappingKind;
  referencePeriod: ReferencePeriod;
  asOfDate: string;
  /** The knowledge cutoff actually applied — always a concrete ISO
   * datetime, whether the caller supplied it explicitly or it was
   * defaulted from `asOfDate` (see `resolveMarketReferencePrice`'s
   * header). Never `null`: the trace must state what was actually used,
   * not merely whether the caller passed something. */
  knownAt: string;
  rejectedCandidates: RejectedMarketPriceCandidate[];
}

/**
 * A successful, fully-audited market-reference price — every field brief
 * §7 requires. `observationIdentity` is the selected observation's own
 * `contentHash` (Phase 2's own immutable revision identity; see
 * `market-evidence.ts` — there is no separate `id` field on the domain
 * type to reuse instead, and `contentHash` already satisfies brief §7's
 * "contentHash or immutable revision identity" wording). Provenance is
 * never stripped after resolution: a future Economic Opportunity Ledger
 * can store `observationIdentity` (plus `sourceSeriesCode`/
 * `referencePeriod`) as the exact evidence a resolved price came from.
 */
export interface AuditableMarketPriceResolution {
  amount: MoneyAmount;
  sourceTier: MarketReferenceSourceTier;
  sourceId: SourceId;
  datasetId: string;
  sourceSeriesCode: string;
  sourceSeriesLabel: string;
  mappedProduct: string;
  mappingKind: MarketEvidenceMappingKind;
  priceBasis: PriceBasis;
  vatTreatment: VatTreatment;
  geography: string;
  referencePeriod: ReferencePeriod;
  retrievedAt: string;
  observationIdentity: string;
  /** The actual `market_price_observations.id` database row UUID behind
   * this resolution, when the caller's candidate set carried one (a real
   * repository-loaded candidate always does — see
   * `src/server/market/cso-fertiliser-repository.ts`'s
   * `MarketPriceObservationWithId`). `null` only for candidates built
   * directly from plain fixtures with no backing row (e.g. pure
   * unit-test data) — a future Economic Opportunity Ledger should prefer
   * this over re-deriving a row from `observationIdentity` alone. */
  observationDatabaseId: string | null;
  /** Plain-language caveats belonging in the domain result itself (Phase
   * 1's §3G pattern) — e.g. the CATEGORY_BENCHMARK proxy disclosure. */
  limitations: string[];
  trace: MarketPriceResolutionTrace;
}

/** A candidate observation, optionally paired with its real database row
 * UUID (see `MarketPriceObservationWithId` in
 * `cso-fertiliser-repository.ts`). Optional so plain `MarketPriceObservation`
 * fixtures — as used throughout this module's own unit tests — remain
 * valid candidates without needing a synthetic id. */
export type MarketPriceResolutionCandidate = MarketPriceObservation & { databaseId?: string };

export interface ResolveMarketReferencePriceInput {
  /** Pre-filtered or not — this resolver re-filters to `mappedProduct`
   * and excludes `UNSUPPORTED_MAPPING` itself regardless (defence in
   * depth), so a caller may safely pass a broader candidate set. */
  candidates: readonly MarketPriceResolutionCandidate[];
  mappedProduct: string;
  /** "YYYY-MM-DD" — the decision date; see this file's header. */
  asOfDate: string;
  /** ISO datetime; omit for "best evidence now". See this file's header. */
  knownAt?: string;
}

function assertValidInput(input: ResolveMarketReferencePriceInput): void {
  if (!ASOF_DATE_PATTERN.test(input.asOfDate)) {
    throw new Error(`resolveMarketReferencePrice: asOfDate must be "YYYY-MM-DD", got "${input.asOfDate}".`);
  }
  if (input.knownAt !== undefined && Number.isNaN(Date.parse(input.knownAt))) {
    throw new Error(`resolveMarketReferencePrice: knownAt must be a valid ISO datetime, got "${input.knownAt}".`);
  }
  if (input.mappedProduct.trim().length === 0) {
    throw new Error("resolveMarketReferencePrice: mappedProduct must not be empty.");
  }
}

/**
 * Resolves the single best auditable market-reference price for one Farm
 * Return product, or an `EngineOutcome` `unavailable` result — never a
 * fabricated `€0`, never an automatic substitution to a different
 * product (brief §8). See this file's header for the full time-selection
 * algorithm.
 */
export function resolveMarketReferencePrice(input: ResolveMarketReferencePriceInput): EngineOutcome<AuditableMarketPriceResolution> {
  assertValidInput(input);
  const asOfMonth = input.asOfDate.slice(0, 7);
  // Defaults to end-of-day on asOfDate, never "unconstrained" — see this
  // file's header note on `knownAt` for why an implicit unconstrained
  // default would silently break historical reproducibility.
  const effectiveKnownAt = input.knownAt ?? `${input.asOfDate}T23:59:59.999Z`;
  const rejected: RejectedMarketPriceCandidate[] = [];

  const eligible = input.candidates.filter((c) => {
    if (c.mappingKind === "UNSUPPORTED_MAPPING" || c.mappedProduct !== input.mappedProduct) {
      rejected.push({ contentHash: c.contentHash, referencePeriod: c.referencePeriod, retrievedAt: c.retrievedAt, reason: "not eligible for this product (unsupported mapping or different mappedProduct)" });
      return false;
    }
    if (c.referencePeriod > asOfMonth) {
      rejected.push({ contentHash: c.contentHash, referencePeriod: c.referencePeriod, retrievedAt: c.retrievedAt, reason: `reference period ${c.referencePeriod} is after asOfDate ${input.asOfDate}` });
      return false;
    }
    if (c.retrievedAt > effectiveKnownAt) {
      rejected.push({ contentHash: c.contentHash, referencePeriod: c.referencePeriod, retrievedAt: c.retrievedAt, reason: `retrieved ${c.retrievedAt} is after knownAt ${effectiveKnownAt}` });
      return false;
    }
    return true;
  });

  if (eligible.length === 0) {
    return blockedInsufficientEvidence<AuditableMarketPriceResolution>("ECONOMIC_PRICE_EVIDENCE_UNAVAILABLE", [
      `no eligible market_reference observation for "${input.mappedProduct}" as of ${input.asOfDate} known by ${effectiveKnownAt}`,
    ]);
  }

  const newestReferencePeriod = eligible.reduce((max, c) => (c.referencePeriod > max ? c.referencePeriod : max), eligible[0].referencePeriod);

  const sameMonthCandidates: MarketPriceResolutionCandidate[] = [];
  for (const c of eligible) {
    if (c.referencePeriod === newestReferencePeriod) {
      sameMonthCandidates.push(c);
    } else {
      rejected.push({ contentHash: c.contentHash, referencePeriod: c.referencePeriod, retrievedAt: c.retrievedAt, reason: `superseded by newer eligible reference period ${newestReferencePeriod}` });
    }
  }

  const selected = sameMonthCandidates.reduce((latest, c) => {
    if (c.retrievedAt > latest.retrievedAt) return c;
    if (c.retrievedAt < latest.retrievedAt) return latest;
    // Deterministic tie-break — see this file's header.
    return c.contentHash > latest.contentHash ? c : latest;
  }, sameMonthCandidates[0]);

  for (const c of sameMonthCandidates) {
    if (c !== selected) {
      const reason = c.retrievedAt === selected.retrievedAt ? "deterministic tie-break lost (lower contentHash)" : "earlier known revision of the same reference period";
      rejected.push({ contentHash: c.contentHash, referencePeriod: c.referencePeriod, retrievedAt: c.retrievedAt, reason });
    }
  }

  const limitations: string[] = [];
  if (selected.mappingKind === "CATEGORY_BENCHMARK") {
    limitations.push(`${selected.sourceSeriesLabel} national benchmark; not an exact ${input.mappedProduct} product price.`);
  }

  // Sorted independently of input/push order — brief §11's determinism
  // requirement covers the whole result, not just which observation
  // wins, so `rejectedCandidates`' own order must not depend on the
  // order candidates were supplied in either.
  const sortedRejected = [...rejected].sort(
    (a, b) => a.referencePeriod.localeCompare(b.referencePeriod) || a.retrievedAt.localeCompare(b.retrievedAt) || a.contentHash.localeCompare(b.contentHash),
  );

  const trace: MarketPriceResolutionTrace = {
    sourceTier: "market_reference",
    mappedProduct: input.mappedProduct,
    selectedSourceSeriesCode: selected.sourceSeriesCode,
    selectedContentHash: selected.contentHash,
    mappingKind: selected.mappingKind,
    referencePeriod: selected.referencePeriod,
    asOfDate: input.asOfDate,
    knownAt: effectiveKnownAt,
    rejectedCandidates: sortedRejected,
  };

  return ok<AuditableMarketPriceResolution>(
    {
      amount: selected.price,
      sourceTier: "market_reference",
      sourceId: selected.sourceId,
      datasetId: selected.datasetId,
      sourceSeriesCode: selected.sourceSeriesCode,
      sourceSeriesLabel: selected.sourceSeriesLabel,
      mappedProduct: input.mappedProduct,
      mappingKind: selected.mappingKind,
      priceBasis: selected.priceBasis,
      vatTreatment: selected.vatTreatment,
      geography: selected.geography,
      referencePeriod: selected.referencePeriod,
      retrievedAt: selected.retrievedAt,
      observationIdentity: selected.contentHash,
      observationDatabaseId: selected.databaseId ?? null,
      limitations,
      trace,
    },
    MARKET_REFERENCE_EVIDENCE_STATE,
  );
}
