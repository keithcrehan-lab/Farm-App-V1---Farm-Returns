/**
 * AJM09 series-code → Farm Return product mapping (brief §15 — "this is a
 * critical audit area"). Live-verified 2026-09-20 against AJM09's real
 * `C02069V02500` dimension (26 real category codes/labels — see
 * `cso-fertiliser-client.real-fixtures.ts` and the full live curl this
 * mapping's classifications were checked against).
 *
 * Only two codes are `EXACT_PRODUCT_MATCH` — CSO's own label is a
 * byte-identical compound formulation to a `nutrients.ts` `PRODUCTS`
 * name. Urea is `CATEGORY_BENCHMARK`, never `EXACT_PRODUCT_MATCH`: AJM09
 * tracks generic "Urea (46% N)", not specifically stabilised/protected
 * urea — `market.ts`'s own `CSO_UREA_46N` doc comment already recorded
 * this exact caveat for the embedded snapshot; this mapping makes the
 * same real distinction for the live pipeline. Every other AJM09 code is
 * `UNSUPPORTED_MAPPING` — Farm Return's `PRODUCTS` catalogue has no
 * corresponding entry, so `mappedProduct` stays `null` rather than
 * inventing one (`market-evidence.ts`'s constructor enforces this).
 *
 * Deliberately independent of `market.ts`/`nutrients.ts`: this mapping
 * feeds Phase 2's new evidence pipeline only. `nutrients.ts`'s
 * `PRODUCTS.pricePerTonneEur` keeps reading `market.ts`'s embedded
 * snapshot unchanged (brief §17) — wiring the two together is an
 * explicit later-phase decision, not made here.
 *
 * Phase 2 review hardening (2026-09-20): mapping is keyed on
 * `sourceSeriesCode` alone, which is deliberately robust to a cosmetic
 * label rename or a brand-new future code (both correctly fall through
 * to/stay `UNSUPPORTED_MAPPING`) — but that same code-only lookup means a
 * code/label MISMATCH (CSO hypothetically reassigning "012" to a
 * different product in some future release) would otherwise be trusted
 * silently. `expectedSourceSeriesLabel` closes that gap: every
 * `EXACT_PRODUCT_MATCH`/`CATEGORY_BENCHMARK` entry records the exact
 * label this mapping was authored against, and `mapCsoFertiliserSeries`
 * demotes to `UNSUPPORTED_MAPPING` (never fabricating a now-unverified
 * exact/benchmark claim) whenever the label CSO actually sent doesn't
 * match — deterministic, per-row, and never fatal to the rest of the
 * sync batch (mirrors `cso-fertiliser-parser.ts`'s own per-row
 * fail-closed pattern, not a whole-batch rejection). The comparison is
 * trim + case-fold only (brief §10: "a cosmetic source-label change must
 * not silently change an otherwise stable mapping") — the same
 * normalisation discipline `economic-opportunity.ts`'s `creditKey`
 * matching already established in this codebase — so incidental
 * whitespace/capitalisation drift is tolerated while a genuinely
 * different label is not.
 */

import type { MarketEvidenceMappingKind } from "@/domain/market-evidence";

export interface FertiliserProductMapping {
  sourceSeriesCode: string;
  mappedProduct: string | null;
  mappingKind: MarketEvidenceMappingKind;
}

/** Keyed by AJM09's own `C02069V02500` series code. Codes not present
 * here fall through to `UNSUPPORTED_MAPPING` in `mapCsoFertiliserSeries`
 * — this table only needs to list the exceptions to that default. */
const AJM09_PRODUCT_MAPPING: Record<
  string,
  { mappedProduct: string; mappingKind: MarketEvidenceMappingKind; expectedSourceSeriesLabel: string }
> = {
  // Compound 0-7-30 — exact byte-identical match to nutrients.ts's
  // PRODUCTS.zeroSevenThirty.name.
  "008": { mappedProduct: "0-7-30", mappingKind: "EXACT_PRODUCT_MATCH", expectedSourceSeriesLabel: "Compound 0-7-30" },
  // Compound 18-6-12 — exact byte-identical match to
  // PRODUCTS.blend181612.name.
  "012": { mappedProduct: "18-6-12", mappingKind: "EXACT_PRODUCT_MATCH", expectedSourceSeriesLabel: "Compound 18-6-12" },
  // Urea (46% N) — same nutrient content (46% N) and the dominant driver
  // of Protected Urea's own price, but CSO does not track a
  // stabilised/protected-urea-specific series; see this file's header.
  "002": { mappedProduct: "Protected Urea", mappingKind: "CATEGORY_BENCHMARK", expectedSourceSeriesLabel: "Urea (46% N)" },
};

function normaliseLabel(label: string): string {
  return label.trim().toLowerCase();
}

/** Classifies one AJM09 series code against the label CSO actually sent
 * for that row. Returns `UNSUPPORTED_MAPPING` with `mappedProduct: null`
 * for any code not explicitly listed above, or whose observed label
 * doesn't match (trim + case-fold) the expected label recorded for a
 * known code (see this file's header) — never a fuzzy/guessed match, and
 * never a silently trusted code/label mismatch. */
export function mapCsoFertiliserSeries(sourceSeriesCode: string, sourceSeriesLabel: string): FertiliserProductMapping {
  const known = AJM09_PRODUCT_MAPPING[sourceSeriesCode];
  if (!known || normaliseLabel(known.expectedSourceSeriesLabel) !== normaliseLabel(sourceSeriesLabel)) {
    return { sourceSeriesCode, mappedProduct: null, mappingKind: "UNSUPPORTED_MAPPING" };
  }
  return { sourceSeriesCode, mappedProduct: known.mappedProduct, mappingKind: known.mappingKind };
}
