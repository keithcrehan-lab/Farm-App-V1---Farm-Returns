/**
 * Inputs Market V1 — the pure model behind `/inputs-market`: a reference
 * catalogue of purchasable inputs, normalised unit prices, and the farm's
 * own calculated need for each category, costed at the reference price.
 *
 * Answers exactly: "what does this farm need to buy, and roughly what does
 * that cost at a dated, sourced reference price?" It is NOT a supplier
 * quote, a live price, a cheapest-buy recommendation or a saving. The
 * commercial answer still comes from the existing quote/RFQ workflow
 * (`RequestQuoteSheet`, `src/orchestration/quotes`).
 *
 * Reuses, never duplicates (AGENTS.md):
 *  - Fertiliser need: the canonical stock bands (`buildFertiliserStockBand`,
 *    `fertiliser-stock.ts`) — the same "still to buy" basis the Fertiliser
 *    workspace and the RFQ prefill's `suggestedPurchaseKg` use — plus the
 *    canonical aggregation's status/provisional flags (`fertiliser-plan.ts`).
 *  - Fertiliser composition: `knownFertiliserProductComposition`
 *    (`nutrients.ts`), the only verified N/P/K analyses in the app.
 *  - Fertiliser reference prices: the CSO AJM09 series embedded in
 *    `market.ts` — the same latest points `nutrients.ts` already costs the
 *    fertiliser plan with, so this screen and the plan never disagree.
 *  - Feed need: the farmer's own cattle production plan
 *    (`deriveCattleGroupProductionPlanMetrics`'s remaining days) and, only
 *    when a group has no plan diet rate, the existing finance feed model
 *    (`calculateFarmConcentrateFeedRequirement`) called per group.
 *  - Feed reference price: the Teagasc worked-example concentrate price
 *    (`WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE`, evidence register).
 *
 * The only arithmetic introduced here is unit normalisation (€/t → €/kg,
 * €/kg nutrient from the declared analysis) and quantity × price, both
 * exact-decimal. An unknown price yields an unknown cost — never €0 — and
 * a total that excludes anything unknown says so.
 *
 * Extensibility: categories are data (`INPUT_MARKET_CATEGORIES`). Adding
 * seed or lime is a new category entry, catalogue items and a need
 * builder; nothing here is keyed to "exactly two categories".
 */

import Decimal from "decimal.js";
import {
  CSO_COMPOUND_0_7_30,
  CSO_COMPOUND_18_6_12,
  CSO_FERTILISER_SOURCE_URL,
  CSO_MURIATE_OF_POTASH_50K,
  CSO_UREA_46N,
  latestPoint,
  type TimeSeriesPoint,
} from "./market";
import { knownFertiliserProductComposition, MURIATE_OF_POTASH_PRODUCT_NAME } from "./nutrients";
import { CONCENTRATE_FORMULATION_PCT, WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE } from "./livestock";
import { calculateFarmConcentrateFeedRequirement } from "./finance";
import type { CattleGroupProductionPlan, CattleGroupProductionPlanMetrics } from "./cattle-group-production-plan";
import type { FarmFertiliserAggregation } from "./fertiliser-plan";
import type { FertiliserStockBand } from "./fertiliser-stock";
import type { LivestockGroup } from "./types";

export const INPUTS_MARKET_VERSION = "inputs_market_v1.0.0";

const KG_PER_TONNE = 1000;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type InputCategoryId = "feed" | "fertiliser";

export interface InputCategoryDefinition {
  id: InputCategoryId;
  label: string;
  /** Where the farm's need for this category is calculated. */
  needSource: string;
}

/** Display order is array order. */
export const INPUT_MARKET_CATEGORIES: readonly InputCategoryDefinition[] = [
  { id: "fertiliser", label: "Fertiliser", needSource: "Whole-farm fertiliser plan" },
  { id: "feed", label: "Feed", needSource: "Cattle production plans" },
];

// ---------------------------------------------------------------------------
// Reference catalogue
// ---------------------------------------------------------------------------

/** `official_statistic`: a published national price series observation.
 * `published_benchmark`: a price used in a published advisory worked
 * example — indicative only, not an observed market price. */
export type ReferencePriceBasis = "official_statistic" | "published_benchmark";

export const REFERENCE_PRICE_BASIS_LABEL: Record<ReferencePriceBasis, string> = {
  official_statistic: "Official statistic",
  published_benchmark: "Published benchmark",
};

export type InputReferencePrice =
  | {
      status: "available";
      eurPerTonne: number;
      basis: ReferencePriceBasis;
      sourceLabel: string;
      sourceUrl: string;
      /** "YYYY-MM" — the period the price describes, never the page date. */
      referencePeriod: string;
      /** A material caveat about how well this price matches the product. */
      caveat?: string;
    }
  | { status: "unavailable"; reason: string };

/** Elemental nutrient fractions (0.18 = 18%), Irish label convention. */
export interface InputNutrientContent {
  nPct: number;
  pPct: number;
  kPct: number;
}

export interface InputCatalogueItem {
  id: string;
  category: InputCategoryId;
  name: string;
  /** Like-for-like metadata: analysis, formulation or description. */
  specification: string;
  /** The product name a quote request carries (the fertiliser catalogue's
   * exact name, so the RFQ sheet can match its own estimate option). */
  quoteProductName: string;
  nutrients?: InputNutrientContent;
  referencePrice: InputReferencePrice;
}

const PRICE_NOT_SOURCED = "No sourced reference price yet — request a quote for a current price.";

function csoFertiliserPrice(series: TimeSeriesPoint[], caveat?: string): InputReferencePrice {
  const latest = latestPoint(series);
  return {
    status: "available",
    eurPerTonne: latest.value,
    basis: "official_statistic",
    sourceLabel: "CSO AJM09 fertiliser prices",
    sourceUrl: CSO_FERTILISER_SOURCE_URL,
    referencePeriod: latest.month,
    ...(caveat ? { caveat } : {}),
  };
}

function fertiliserItem(id: string, name: string, analysis: string, price: InputReferencePrice): InputCatalogueItem {
  const composition = knownFertiliserProductComposition(name);
  return {
    id,
    category: "fertiliser",
    name,
    specification: `N-P-K ${analysis}`,
    quoteProductName: name,
    ...(composition ? { nutrients: { nPct: composition.nPct, pPct: composition.pPct, kPct: composition.kPct } } : {}),
    referencePrice: price,
  };
}

function pct(fraction: number): string {
  return `${new Decimal(fraction).times(100).toString()}%`;
}

const RATION_SPEC = `Teagasc standard ration: rolled barley ${pct(CONCENTRATE_FORMULATION_PCT.rolledBarley)}, soya bean meal ${pct(CONCENTRATE_FORMULATION_PCT.soyaBeanMeal)}, molasses ${pct(CONCENTRATE_FORMULATION_PCT.molasses)}, minerals & vitamins ${pct(CONCENTRATE_FORMULATION_PCT.mineralsVitamins)}`;

export const BEEF_CONCENTRATE_ITEM_ID = "feed-beef-concentrate";

export const INPUT_MARKET_CATALOGUE: readonly InputCatalogueItem[] = [
  fertiliserItem("fert-18-6-12", "18-6-12", "18-6-12", csoFertiliserPrice(CSO_COMPOUND_18_6_12)),
  fertiliserItem(
    "fert-protected-urea",
    "Protected Urea",
    "46-0-0",
    csoFertiliserPrice(CSO_UREA_46N, "CSO tracks generic urea (46% N); protected urea is a near match and usually costs more."),
  ),
  fertiliserItem("fert-0-7-30", "0-7-30", "0-7-30", csoFertiliserPrice(CSO_COMPOUND_0_7_30)),
  fertiliserItem("fert-mop", MURIATE_OF_POTASH_PRODUCT_NAME, "0-0-50", csoFertiliserPrice(CSO_MURIATE_OF_POTASH_50K)),
  {
    id: BEEF_CONCENTRATE_ITEM_ID,
    category: "feed",
    name: "Beef concentrate ration",
    specification: RATION_SPEC,
    quoteProductName: "Beef concentrate ration",
    referencePrice: {
      status: "available",
      eurPerTonne: WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE,
      basis: "published_benchmark",
      sourceLabel: "Teagasc first-winter nutrition worked example",
      sourceUrl:
        "https://teagasc.ie/insights/first-winter-nutrition-silage-digestibility-and-concentrate-supplementation-to-maximise-compensatory-growth/",
      referencePeriod: "2026-07",
      caveat: "An advisory worked-example price, not an observed market price.",
    },
  },
  {
    id: "feed-rolled-barley",
    category: "feed",
    name: "Rolled barley",
    specification: "Straight cereal — the main ingredient of the standard ration",
    quoteProductName: "Rolled barley",
    referencePrice: { status: "unavailable", reason: PRICE_NOT_SOURCED },
  },
  {
    id: "feed-maize-meal",
    category: "feed",
    name: "Maize meal",
    specification: "Straight cereal",
    quoteProductName: "Maize meal",
    referencePrice: { status: "unavailable", reason: PRICE_NOT_SOURCED },
  },
  {
    id: "feed-beet-pulp",
    category: "feed",
    name: "Beet pulp (nuts)",
    specification: "Straight by-product feed",
    quoteProductName: "Beet pulp",
    referencePrice: { status: "unavailable", reason: PRICE_NOT_SOURCED },
  },
];

export function catalogueForCategory(category: InputCategoryId, catalogue: readonly InputCatalogueItem[] = INPUT_MARKET_CATALOGUE): InputCatalogueItem[] {
  return catalogue.filter((item) => item.category === category);
}

// ---------------------------------------------------------------------------
// Unit price normalisation
// ---------------------------------------------------------------------------

export interface NormalisedUnitPrices {
  eurPerTonne: number;
  /** €/kg of product, to the cent. */
  eurPerKg: number;
  /** €/kg of nutrient for a straight (single-nutrient) fertiliser, or of
   * total N+P+K for a compound — labelled so the two are never confused.
   * Absent when the analysis is not verified. */
  eurPerKgNutrient?: { label: "N" | "P" | "K" | "N+P+K"; value: number };
}

const NUTRIENT_NAMES = [
  ["nPct", "N"],
  ["pPct", "P"],
  ["kPct", "K"],
] as const;

function toCents(value: Decimal): number {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/** `null` when the item has no sourced price — never a zero price. */
export function normaliseUnitPrices(item: InputCatalogueItem): NormalisedUnitPrices | null {
  if (item.referencePrice.status !== "available") return null;
  const perTonne = new Decimal(item.referencePrice.eurPerTonne);
  const result: NormalisedUnitPrices = {
    eurPerTonne: perTonne.toNumber(),
    eurPerKg: toCents(perTonne.dividedBy(KG_PER_TONNE)),
  };
  if (item.nutrients) {
    const present = NUTRIENT_NAMES.filter(([key]) => item.nutrients![key] > 0);
    if (present.length > 0) {
      const fraction = present.reduce((sum, [key]) => sum.plus(item.nutrients![key]), new Decimal(0));
      result.eurPerKgNutrient = {
        label: present.length === 1 ? present[0][1] : "N+P+K",
        value: toCents(perTonne.dividedBy(fraction.times(KG_PER_TONNE))),
      };
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Need lines
// ---------------------------------------------------------------------------

export type InputNeedBasis = "fertiliser_plan" | "cattle_production_plan" | "feed_model_estimate";

export const INPUT_NEED_BASIS_LABEL: Record<InputNeedBasis, string> = {
  fertiliser_plan: "Fertiliser plan",
  cattle_production_plan: "Your cattle production plan",
  feed_model_estimate: "Teagasc feed budget estimate",
};

export type ImpliedCost =
  | { status: "known"; eur: number; eurPerTonne: number; referencePeriod: string; basis: ReferencePriceBasis }
  | { status: "unknown"; reason: string };

export interface InputNeedDetail {
  label: string;
  value: string;
}

export interface InputNeedLine {
  id: string;
  category: InputCategoryId;
  label: string;
  specification: string | null;
  catalogueItemId: string | null;
  quoteProductName: string;
  basis: InputNeedBasis;
  /** The calculated requirement, before stock. */
  requirementKg: number;
  /** What remains to buy. Equals `requirementKg` when stock is unknown. */
  toBuyKg: number;
  stock: "recorded" | "not_recorded" | "not_tracked";
  horizon: string | null;
  /** Plain-language reliability notes (provisional, partial, model …). */
  notes: string[];
  impliedCost: ImpliedCost;
  /** Feed only: the same quantity at the farmer's own plan price. */
  planPriceCost?: { eurPerTonne: number; eur: number };
  details: InputNeedDetail[];
}

/** A calculable need the farm data cannot size yet — never shown as zero. */
export interface InputNeedGap {
  id: string;
  category: InputCategoryId;
  label: string;
  reason: string;
  action: { label: string; href: string };
}

export function impliedCostAtReference(quantityKg: number, item: InputCatalogueItem | undefined): ImpliedCost {
  if (!item) return { status: "unknown", reason: "This product is not in the reference catalogue." };
  if (item.referencePrice.status !== "available") return { status: "unknown", reason: item.referencePrice.reason };
  const eur = new Decimal(quantityKg).dividedBy(KG_PER_TONNE).times(item.referencePrice.eurPerTonne);
  return {
    status: "known",
    eur: eur.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
    eurPerTonne: item.referencePrice.eurPerTonne,
    referencePeriod: item.referencePrice.referencePeriod,
    basis: item.referencePrice.basis,
  };
}

function itemByQuoteName(name: string, catalogue: readonly InputCatalogueItem[]): InputCatalogueItem | undefined {
  return catalogue.find((item) => item.quoteProductName === name);
}

function formatKgOrTonnes(kg: number): string {
  return kg >= KG_PER_TONNE ? `${new Decimal(kg).dividedBy(KG_PER_TONNE).toDecimalPlaces(2).toString()} t` : `${new Decimal(kg).toDecimalPlaces(1).toString()} kg`;
}

export interface FertiliserNeedInput {
  stockBands: readonly FertiliserStockBand[];
  aggregation: Pick<FarmFertiliserAggregation, "status" | "products">;
  catalogue?: readonly InputCatalogueItem[];
}

/** One line per product with a remaining requirement, from the canonical
 * stock bands. Quantities are passed through, never re-derived. */
export function buildFertiliserNeedLines(input: FertiliserNeedInput): InputNeedLine[] {
  const catalogue = input.catalogue ?? INPUT_MARKET_CATALOGUE;
  return input.stockBands.flatMap((band): InputNeedLine[] => {
    if (!(band.remainingRequirementKg > 0)) return [];
    const item = itemByQuoteName(band.product, catalogue);
    const aggregated = input.aggregation.products.find((p) => p.name === band.product);
    const toBuyKg = band.status === "recorded" ? band.shortfallKg : band.remainingRequirementKg;
    const notes: string[] = [];
    if (aggregated?.provisional) notes.push("Includes provisional field quantities.");
    if (aggregated && !aggregated.catalogueVerified) notes.push("Product analysis is not verified.");
    if (band.status === "not_recorded") notes.push("Stock not recorded — the full remaining requirement is shown as to buy.");
    const details: InputNeedDetail[] = [];
    if (band.status === "recorded") {
      details.push({ label: "Recorded stock", value: `${formatKgOrTonnes(band.stockKg)} · ${band.stockAsOf}` });
    }
    for (const contribution of aggregated?.contributions ?? []) {
      details.push({ label: contribution.fieldName, value: formatKgOrTonnes(contribution.quantityKg) });
    }
    return [
      {
        id: `fertiliser:${band.product}`,
        category: "fertiliser",
        label: band.product,
        specification: item?.specification ?? (band.npkAnalysis ? `N-P-K ${band.npkAnalysis}` : null),
        catalogueItemId: item?.id ?? null,
        quoteProductName: band.product,
        basis: "fertiliser_plan",
        requirementKg: band.remainingRequirementKg,
        toBuyKg,
        stock: band.status,
        horizon: null,
        notes,
        impliedCost: impliedCostAtReference(toBuyKg, item),
        details,
      },
    ];
  });
}

export interface FeedGroupInput {
  group: LivestockGroup;
  plan?: CattleGroupProductionPlan;
  metrics: CattleGroupProductionPlanMetrics;
}

export interface FeedNeedResult {
  lines: InputNeedLine[];
  gaps: InputNeedGap[];
}

function groupHref(groupId: string): string {
  return `/cattle/groups/${encodeURIComponent(groupId)}`;
}

/**
 * Concentrate need per cattle group.
 *
 * - A plan with a diet rate is authoritative: kg/head/day × head ×
 *   days to the plan's target date. A missing target date or head count
 *   is a gap, never a model substitute (the farmer has stated a diet).
 * - With no plan rate, the existing finance feed model is used when it
 *   covers the group (labelled as a model estimate).
 * - Otherwise the group is a gap linking to its plan.
 */
export function buildFeedNeed(groups: readonly FeedGroupInput[], catalogue: readonly InputCatalogueItem[] = INPUT_MARKET_CATALOGUE): FeedNeedResult {
  const item = catalogue.find((candidate) => candidate.id === BEEF_CONCENTRATE_ITEM_ID);
  const lines: InputNeedLine[] = [];
  const gaps: InputNeedGap[] = [];

  for (const { group, plan, metrics } of groups) {
    const head = Number.isFinite(group.count.value) && group.count.value > 0 ? group.count.value : null;
    const rate = plan?.concentrateKgHeadDay;
    const hasRate = typeof rate === "number" && Number.isFinite(rate) && rate >= 0;

    if (hasRate) {
      const days = metrics.remainingDays.status === "known" ? metrics.remainingDays.value : null;
      if (head === null || days === null) {
        gaps.push({
          id: `feed-gap:${group.id}`,
          category: "feed",
          label: group.label,
          reason: head === null ? "Head count is needed to size the feed requirement." : "Add a future target date to size the feed requirement.",
          action: { label: "Open group plan", href: groupHref(group.id) },
        });
        continue;
      }
      const kg = new Decimal(rate).times(head).times(days).toNumber();
      const planPrice = plan?.concentratePriceEurT;
      const hasPlanPrice = typeof planPrice === "number" && Number.isFinite(planPrice) && planPrice > 0;
      lines.push({
        id: `feed:${group.id}`,
        category: "feed",
        label: group.label,
        specification: plan?.dietLabel ?? null,
        catalogueItemId: item?.id ?? null,
        quoteProductName: item?.quoteProductName ?? "Beef concentrate ration",
        basis: "cattle_production_plan",
        requirementKg: kg,
        toBuyKg: kg,
        stock: "not_tracked",
        horizon: `To ${plan!.targetDate} · ${days} days`,
        notes: [],
        impliedCost: impliedCostAtReference(kg, item),
        ...(hasPlanPrice
          ? {
              planPriceCost: {
                eurPerTonne: planPrice,
                eur: new Decimal(kg).dividedBy(KG_PER_TONNE).times(planPrice).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
              },
            }
          : {}),
        details: [
          { label: "Concentrate", value: `${rate} kg/head/day` },
          { label: "Head", value: String(head) },
          { label: "Days to target", value: String(days) },
        ],
      });
      continue;
    }

    const model = calculateFarmConcentrateFeedRequirement([group]);
    if (model.sourceGroupLabels.length > 0 && head !== null) {
      const kg = new Decimal(model.totalTonnes).times(KG_PER_TONNE).toNumber();
      lines.push({
        id: `feed:${group.id}`,
        category: "feed",
        label: group.label,
        specification: null,
        catalogueItemId: item?.id ?? null,
        quoteProductName: item?.quoteProductName ?? "Beef concentrate ration",
        basis: "feed_model_estimate",
        requirementKg: kg,
        toBuyKg: kg,
        stock: "not_tracked",
        horizon: "To finish or target weight (model)",
        notes: ["Model estimate from Teagasc feed budgets — set a diet in the group plan to use your own rate."],
        impliedCost: impliedCostAtReference(kg, item),
        details: [{ label: "Head", value: String(head) }],
      });
      continue;
    }

    gaps.push({
      id: `feed-gap:${group.id}`,
      category: "feed",
      label: group.label,
      reason: "No concentrate rate in the group plan yet.",
      action: { label: "Set diet in group plan", href: groupHref(group.id) },
    });
  }

  return { lines, gaps };
}

// ---------------------------------------------------------------------------
// Category summary
// ---------------------------------------------------------------------------

export interface InputCategorySummary {
  category: InputCategoryId;
  lines: InputNeedLine[];
  gaps: InputNeedGap[];
  totalToBuyKg: number;
  /** Sum of the lines with a known implied cost only. */
  knownImpliedCostEur: number;
  linesWithUnknownCost: number;
  /** `complete` only when every line is costed, nothing is a gap and the
   * upstream calculation itself is not partial. */
  completeness: "complete" | "partial" | "none";
}

export function summariseCategory(
  category: InputCategoryId,
  lines: readonly InputNeedLine[],
  gaps: readonly InputNeedGap[],
  upstreamPartial = false,
): InputCategorySummary {
  const totalToBuyKg = lines.reduce((sum, line) => sum.plus(line.toBuyKg), new Decimal(0)).toNumber();
  const known = lines.filter((line): line is InputNeedLine & { impliedCost: { status: "known" } } => line.impliedCost.status === "known");
  const knownImpliedCostEur = known.reduce((sum, line) => sum + line.impliedCost.eur, 0);
  const linesWithUnknownCost = lines.length - known.length;
  const completeness =
    lines.length === 0 && gaps.length === 0
      ? "none"
      : gaps.length > 0 || linesWithUnknownCost > 0 || upstreamPartial
        ? "partial"
        : "complete";
  return { category, lines: [...lines], gaps: [...gaps], totalToBuyKg, knownImpliedCostEur, linesWithUnknownCost, completeness };
}

// ---------------------------------------------------------------------------
// Workspace view
// ---------------------------------------------------------------------------

export type CategoryNeedState =
  | { status: "ready"; summary: InputCategorySummary; disclosure: string | null }
  | { status: "unavailable"; message: string };

export interface InputsMarketView {
  version: typeof INPUTS_MARKET_VERSION;
  planningSeason: string;
  seasonLabel: string;
  needs: Record<InputCategoryId, CategoryNeedState>;
}

export function fertiliserUpstreamDisclosure(status: FarmFertiliserAggregation["status"]): string | null {
  return status === "INCOMPLETE"
    ? "Some fields are unresolved in the fertiliser plan, so this is a known subtotal, not the whole-farm requirement."
    : status === "READY_WITH_PROVISIONAL_ITEMS"
      ? "Some field quantities are provisional."
      : null;
}
