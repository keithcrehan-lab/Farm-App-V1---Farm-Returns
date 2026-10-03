/**
 * Fertiliser Vertical — End-to-End Real Workflow campaign
 * (`docs/farm-return-next/FERTILISER_VERTICAL_PHASE0.md`). The one new
 * domain module this campaign adds: turns a real confirmed fertiliser
 * Actual (`src/domain/job-actual.ts`'s `FertiliserSpreadingActual`) into
 * a real nutrient contribution, and a field's real
 * `NutrientPlan.requirement` (`src/domain/nutrients.ts`) into a real
 * remaining requirement once real confirmed applications are known.
 *
 * Reuses, never re-derives: `nutrients.ts`'s own
 * `knownFertiliserProductComposition` is the only source of N/P/K
 * composition this module ever consults — this module invents no
 * agronomic fact of its own. Every function here is a pure, deterministic
 * arithmetic transformation of already-real, already-verified inputs.
 *
 * **The decisive scope limit this whole module is built around**: a
 * confirmed Actual's own `product` field is free text
 * (`FertiliserSpreadingActual.product?: string`) — there is no
 * structured catalogue link on the record itself. A real nutrient
 * contribution can only be computed when that text exactly matches one
 * of the three real, verified catalogue products
 * `calculateNutrientPlan` can ever recommend. Any other product name —
 * and any `"bags"`-unit quantity, since no verified bag weight exists in
 * this app (`CLAUDE.md`'s "never invent... bag weights") — fails closed,
 * honestly, to `BLOCKED_INSUFFICIENT_EVIDENCE`, never a guessed
 * composition. The real quantity/unit the farmer confirmed is never
 * discarded by this — only the *nutrient contribution* derived from it
 * is unavailable; the confirmed Actual record itself is untouched.
 */
import { blockedInsufficientEvidence, isOk, ok, type EngineOutcome } from "./evidence";
import { knownFertiliserProductComposition } from "./nutrients";
import type { Field, FieldPurchaseStatus, NutrientPlan } from "./types";

export const FERTILISER_PLAN_VERSION = "fertiliser_plan_v1.0.0";

export interface FertiliserActualQuantity {
  product?: string;
  quantity?: number;
  quantityUnit?: "kg" | "t" | "bags";
}

export interface FertiliserNutrientContributionKg {
  n: number;
  p: number;
  k: number;
}

/**
 * The real total nutrient delivered (kg, not kg/ha — this is the whole
 * confirmed application, not a per-hectare rate) by one confirmed
 * fertiliser Actual, or a real, honest reason it cannot be determined.
 * See this module's own header comment for the exact, narrow set of
 * conditions under which this can ever resolve `OK`.
 */
export function nutrientContributionFromFertiliserActual(actual: FertiliserActualQuantity): EngineOutcome<FertiliserNutrientContributionKg> {
  if (!actual.product || actual.product.trim().length === 0) {
    return blockedInsufficientEvidence("MISSING_FERTILISER_PRODUCT", ["product"]);
  }
  if (actual.quantity === undefined || !Number.isFinite(actual.quantity) || actual.quantity <= 0 || actual.quantityUnit === undefined) {
    return blockedInsufficientEvidence("MISSING_FERTILISER_QUANTITY", ["quantity", "quantityUnit"]);
  }
  if (actual.quantityUnit === "bags") {
    // No verified bag weight exists anywhere in this app — converting
    // "bags" to a real kg figure would mean inventing one.
    return blockedInsufficientEvidence("UNVERIFIED_BAG_WEIGHT", ["quantityUnit"]);
  }
  const composition = knownFertiliserProductComposition(actual.product);
  if (!composition) {
    return blockedInsufficientEvidence("UNKNOWN_FERTILISER_PRODUCT_COMPOSITION", ["product"]);
  }
  const totalKg = actual.quantityUnit === "t" ? actual.quantity * 1000 : actual.quantity;
  return ok(
    {
      n: totalKg * composition.nPct,
      p: totalKg * composition.pPct,
      k: totalKg * composition.kPct,
    },
    "DERIVED",
  );
}

export interface SummedFertiliserApplications {
  /** Real total kg N/P/K across every real confirmed application whose
   * nutrient contribution could be determined — never includes an
   * application this module could not resolve (see
   * `applicationsWithUnknownComposition` below for that honest count). */
  confirmedAppliedKg: FertiliserNutrientContributionKg;
  applicationsWithKnownComposition: number;
  /** A real, confirmed application whose own product/quantity/unit did
   * not resolve to a known composition — never silently dropped from
   * this count, so a caller can disclose "N applications recorded, M of
   * them could not be included in the nutrient total" rather than
   * quietly under-counting. */
  applicationsWithUnknownComposition: number;
}

/**
 * Sums every real confirmed fertiliser application's own nutrient
 * contribution — the caller supplies already-farm/field-scoped real
 * confirmed Actuals (this function performs no farm-scoping itself; see
 * `src/orchestration/fertiliser-plan/index.ts` for the real, ownership-
 * verified caller). Order-independent, deterministic.
 */
export function sumConfirmedFertiliserApplications(actuals: readonly FertiliserActualQuantity[]): SummedFertiliserApplications {
  let n = 0;
  let p = 0;
  let k = 0;
  let known = 0;
  let unknown = 0;
  for (const actual of actuals) {
    const outcome = nutrientContributionFromFertiliserActual(actual);
    if (isOk(outcome)) {
      n += outcome.value.n;
      p += outcome.value.p;
      k += outcome.value.k;
      known += 1;
    } else {
      unknown += 1;
    }
  }
  return {
    confirmedAppliedKg: { n, p, k },
    applicationsWithKnownComposition: known,
    applicationsWithUnknownComposition: unknown,
  };
}

export interface RemainingFertiliserRequirement {
  /** The field's real requirement, kg/ha — `NutrientPlan.requirement.value`,
   * unmodified. */
  requirementKgHa: FertiliserNutrientContributionKg;
  /** Real confirmed applications' own nutrient contribution, converted
   * to the same kg/ha basis by dividing by the field's real mapped area
   * — never the other way around (never multiplying a per-ha requirement
   * up without a real, valid area). */
  confirmedAppliedKgHa: FertiliserNutrientContributionKg;
  /** `max(0, requirement - confirmedApplied)` per nutrient — never
   * negative; a field that has already received more than its
   * requirement shows `0` remaining, not a negative "surplus" figure
   * this module does not attempt to characterise. */
  remainingKgHa: FertiliserNutrientContributionKg;
}

/**
 * The real remaining requirement for one field, given its real
 * requirement (`NutrientPlan.requirement.value`, kg/ha), its real
 * mapped area, and the real total kg already confirmed-applied this
 * season (`sumConfirmedFertiliserApplications`'s own output — the
 * caller decides the real date range/season boundary; this function
 * only does the arithmetic on whatever total it's given).
 *
 * `BLOCKED_INSUFFICIENT_EVIDENCE` when the field has no valid real
 * mapped area — converting confirmed-applied kg to a per-ha figure
 * without one would mean fabricating a total, exactly what this
 * campaign's own item 6 forbids. The field may still have a real
 * per-ha *requirement* (`requirementKgHa` itself needs no area) — only
 * the *remaining* calculation, which needs both figures on the same
 * per-ha basis, is blocked.
 */
export function calculateRemainingFertiliserRequirement(
  requirementKgHa: FertiliserNutrientContributionKg,
  areaHa: number | undefined,
  confirmedAppliedTotalKg: FertiliserNutrientContributionKg,
): EngineOutcome<RemainingFertiliserRequirement> {
  if (areaHa === undefined || !Number.isFinite(areaHa) || areaHa <= 0) {
    return blockedInsufficientEvidence("MISSING_VALID_FIELD_AREA", ["areaHa"]);
  }
  const confirmedAppliedKgHa: FertiliserNutrientContributionKg = {
    n: confirmedAppliedTotalKg.n / areaHa,
    p: confirmedAppliedTotalKg.p / areaHa,
    k: confirmedAppliedTotalKg.k / areaHa,
  };
  const remainingKgHa: FertiliserNutrientContributionKg = {
    n: Math.max(0, requirementKgHa.n - confirmedAppliedKgHa.n),
    p: Math.max(0, requirementKgHa.p - confirmedAppliedKgHa.p),
    k: Math.max(0, requirementKgHa.k - confirmedAppliedKgHa.k),
  };
  return ok({ requirementKgHa, confirmedAppliedKgHa, remainingKgHa }, "DERIVED");
}

export interface FarmFertiliserProductTotal {
  product: string;
  npkAnalysis: string;
  /** Sum of `FertiliserProduct.totalKg` across every field this product
   * was recommended for — a real total, never invented: each addend is
   * `calculateNutrientPlan`'s own already-computed real figure. */
  recommendedTotalKg: number;
  /** The canonical `estimatedCostEur`: `null` when any contributing field's
   * price is missing/invalid — never €0 or a silent partial. */
  recommendedTotalCostEur: number | null;
  /** How many real fields currently carry a recommendation for this
   * product — disclosed so "total across N fields" is never presented
   * as a single-field figure. */
  fieldsCount: number;
}

/**
 * Farm-wide RECOMMENDED fertiliser demand by product — sums each real
 * field's own already-computed `NutrientPlan.purchasedProducts` (never
 * recomputing the recommendation itself). This is the "recommended"
 * column only; a real "planned"/"confirmed applied"/"remaining" farm
 * total additionally needs real Decision/Job Actual data this pure
 * domain function has no access to — see
 * `src/orchestration/fertiliser-plan/index.ts`'s own farm-wide
 * aggregator, which adds the other three from real, farm-scoped
 * persistence reads.
 * Session 2b: only a plan whose `purchaseStatus` is a sized blend
 * (`RECOMMENDED` / `RECOMMENDED_CREDIT_NOT_COUNTED`) contributes; the caller
 * counts non-recommendable fields separately, never as zero demand.
 * Session 3b: a thin view over the canonical
 * `aggregateFarmFertiliserPurchasing` (below) — no second summation.
 */
export function aggregateFarmFertiliserRecommendation(
  plans: readonly Pick<NutrientPlan, "purchasedProducts" | "purchaseStatus">[],
): FarmFertiliserProductTotal[] {
  return toFarmFertiliserProductTotals(aggregateFarmFertiliserPurchasing(plans.map((plan, i) => ({ fieldId: `plan-${i}`, fieldName: "", plan }))));
}

/** The canonical aggregation's products in the legacy
 * `FarmFertiliserProductTotal` shape the demand / tonnes / quote-prefill
 * chain already consumes. `fieldsCount` is the number of contributing
 * fields. */
export function toFarmFertiliserProductTotals(aggregation: FarmFertiliserAggregation): FarmFertiliserProductTotal[] {
  return aggregation.products.map((p) => ({
    product: p.name,
    npkAnalysis: p.npkAnalysis,
    recommendedTotalKg: p.totalKg,
    recommendedTotalCostEur: p.estimatedCostEur,
    fieldsCount: p.contributions.length,
  }));
}

// ---------------------------------------------------------------------------
// Fertiliser Vertical Completion, Session 3b — canonical whole-farm
// fertiliser aggregation and quote-ready basket. Derived only from each
// field's canonical `NutrientPlan.purchaseStatus` + `purchasedProducts`:
// no requirement, credit, product selection or price is recomputed here.
// ---------------------------------------------------------------------------

export const FARM_FERTILISER_AGGREGATION_VERSION = "farm_fertiliser_aggregation_v1.0.0";
export const FARM_FERTILISER_QUOTE_BASKET_VERSION = "farm_fertiliser_quote_basket_v1.0.0";

/** How a field's `purchaseStatus` takes part in farm purchasing:
 * - `INCLUDED`: `RECOMMENDED` / `RECOMMENDED_CREDIT_NOT_COUNTED` — contributes products.
 * - `NO_PURCHASE`: `NONE_NEEDED` — known requirement, genuinely nothing to buy.
 * - `EXCLUDED`: `PROHIBITED` / `NOT_APPLICABLE` — decided, contributes nothing.
 * - `UNRESOLVED`: `UNKNOWN` / `WITHHELD_MIXED_EVIDENCE` (or a malformed sized
 *   blend) — purchasing-relevant but undecided; makes the basket INCOMPLETE. */
export type FarmFieldPurchaseClass = "INCLUDED" | "NO_PURCHASE" | "EXCLUDED" | "UNRESOLVED";

/** READY: every purchasing-relevant field resolved and every product in the
 * verified catalogue. READY_WITH_PROVISIONAL_ITEMS: as READY, but at least
 * one contribution is provisional (slurry credit not counted). INCOMPLETE:
 * at least one field is UNKNOWN / WITHHELD (or a product is unsupported) —
 * the known subtotal is never the whole-farm requirement. */
export type FarmFertiliserBasketStatus = "READY" | "READY_WITH_PROVISIONAL_ITEMS" | "INCOMPLETE";

export interface FarmFertiliserAggregationFieldInput {
  fieldId: string;
  fieldName: string;
  plan: Pick<NutrientPlan, "purchaseStatus" | "purchasedProducts"> & Partial<Pick<NutrientPlan, "calculationVersion">>;
}

export interface FarmFertiliserFieldPurchaseEntry {
  fieldId: string;
  fieldName: string;
  purchaseClass: FarmFieldPurchaseClass;
  /** The engine's own status, preserved verbatim (reason codes included). */
  purchaseStatus: FieldPurchaseStatus;
  /** Set only when a sized blend was rejected as malformed (fail closed). */
  aggregationReasonCode?: "RECOMMENDED_WITHOUT_PRODUCTS" | "INVALID_PRODUCT_QUANTITY";
  provisional: boolean;
}

export interface FarmFertiliserProductContribution {
  fieldId: string;
  fieldName: string;
  /** The field's own `FertiliserProduct.totalKg` (product kg), unrounded here. */
  quantityKg: number;
  /** The field's own `FertiliserProduct.costEur`; `null` when missing/invalid — never €0. */
  costEur: number | null;
  provisional: boolean;
}

/** Bag conversion needs a verified package size; the catalogue holds none. */
export interface FarmFertiliserBagConversion {
  status: "UNAVAILABLE";
  reasonCode: "NO_VERIFIED_PACKAGE_SIZE";
}

export interface FarmFertiliserAggregatedProduct {
  /** Catalogue identity: exact product name + N-P-K analysis (no separate
   * product id exists; the name alone is never the merge key). */
  productKey: string;
  name: string;
  npkAnalysis: string;
  /** Exact name match in the verified catalogue (`knownFertiliserProductComposition`). */
  catalogueVerified: boolean;
  unit: "kg";
  /** Exact sum of the contributing fields' product kg — never pre-rounded. */
  totalKg: number;
  /** Display only: `totalKg` rounded UP to 0.01 t, never below the aggregate. */
  displayTonnes: number;
  bagConversion: FarmFertiliserBagConversion;
  contributions: FarmFertiliserProductContribution[];
  /** Sum of the contributions with a known cost. */
  knownCostEur: number;
  /** `knownCostEur` when every contribution's cost is known, else `null`. */
  estimatedCostEur: number | null;
  provisional: boolean;
}

export interface FarmFertiliserAggregationCounts {
  included: number;
  provisional: number;
  noPurchase: number;
  prohibited: number;
  notApplicable: number;
  withheld: number;
  unknown: number;
  /** UNKNOWN + WITHHELD + malformed sized blends. */
  unresolved: number;
}

export interface FarmFertiliserAggregation {
  aggregationVersion: typeof FARM_FERTILISER_AGGREGATION_VERSION;
  /** Distinct `NutrientPlan.calculationVersion`s the field plans came from. */
  engineVersions: string[];
  fields: FarmFertiliserFieldPurchaseEntry[];
  products: FarmFertiliserAggregatedProduct[];
  counts: FarmFertiliserAggregationCounts;
  knownCostSubtotalEur: number;
  /** `null` when any product's cost is unknown — never a fake total. */
  estimatedTotalCostEur: number | null;
  productsWithUnknownCost: string[];
  unsupportedProducts: string[];
  status: FarmFertiliserBasketStatus;
}

/** Display rounding for a product-kg aggregate: up to the next 0.01 t
 * (`TONNES_ROUNDING_DECIMALS`), so a displayed quantity never understates
 * the canonical aggregate. The 1e-9 tolerance (1e-8 kg) only absorbs binary
 * floating-point noise in the kg sum. Not a commercial pack rule. */
export function roundKgUpToDisplayTonnes(kg: number): number {
  const factor = 10 ** TONNES_ROUNDING_DECIMALS;
  const units = (kg / KG_PER_TONNE) * factor;
  return Math.max(0, Math.ceil(units - 1e-9)) / factor;
}

function isValidQuantityKg(kg: unknown): kg is number {
  return typeof kg === "number" && Number.isFinite(kg) && kg > 0;
}

function isValidCostEur(cost: unknown): cost is number {
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0;
}

function classifyPurchaseStatus(status: FieldPurchaseStatus): FarmFieldPurchaseClass {
  switch (status.status) {
    case "RECOMMENDED":
    case "RECOMMENDED_CREDIT_NOT_COUNTED":
      return "INCLUDED";
    case "NONE_NEEDED":
      return "NO_PURCHASE";
    case "PROHIBITED":
    case "NOT_APPLICABLE":
      return "EXCLUDED";
    case "UNKNOWN":
    case "WITHHELD_MIXED_EVIDENCE":
      return "UNRESOLVED";
  }
}

/**
 * The canonical whole-farm fertiliser aggregation: field `purchaseStatus` +
 * `purchasedProducts` → per-product farm totals with field traceability,
 * every field classified (never silently omitted). Identical products
 * (same catalogue name and analysis) merge; field kg are summed unrounded.
 * A sized blend with no products or a non-positive / non-finite quantity is
 * treated as unresolved, never as zero demand.
 */
export function aggregateFarmFertiliserPurchasing(inputs: readonly FarmFertiliserAggregationFieldInput[]): FarmFertiliserAggregation {
  const fields: FarmFertiliserFieldPurchaseEntry[] = [];
  const byKey = new Map<string, FarmFertiliserAggregatedProduct>();
  const engineVersions = new Set<string>();
  const counts: FarmFertiliserAggregationCounts = {
    included: 0,
    provisional: 0,
    noPurchase: 0,
    prohibited: 0,
    notApplicable: 0,
    withheld: 0,
    unknown: 0,
    unresolved: 0,
  };

  for (const { fieldId, fieldName, plan } of inputs) {
    if (plan.calculationVersion) engineVersions.add(plan.calculationVersion);
    const status = plan.purchaseStatus;
    let purchaseClass = classifyPurchaseStatus(status);
    let aggregationReasonCode: FarmFertiliserFieldPurchaseEntry["aggregationReasonCode"];
    const provisional = status.status === "RECOMMENDED_CREDIT_NOT_COUNTED";

    if (purchaseClass === "INCLUDED") {
      if (plan.purchasedProducts.length === 0) aggregationReasonCode = "RECOMMENDED_WITHOUT_PRODUCTS";
      else if (!plan.purchasedProducts.every((p) => isValidQuantityKg(p.totalKg))) aggregationReasonCode = "INVALID_PRODUCT_QUANTITY";
      if (aggregationReasonCode) purchaseClass = "UNRESOLVED";
    }

    fields.push({
      fieldId,
      fieldName,
      purchaseClass,
      purchaseStatus: status,
      ...(aggregationReasonCode ? { aggregationReasonCode } : {}),
      provisional: purchaseClass === "INCLUDED" && provisional,
    });

    switch (purchaseClass) {
      case "INCLUDED":
        counts.included++;
        if (provisional) counts.provisional++;
        break;
      case "NO_PURCHASE":
        counts.noPurchase++;
        break;
      case "EXCLUDED":
        if (status.status === "PROHIBITED") counts.prohibited++;
        else counts.notApplicable++;
        break;
      case "UNRESOLVED":
        counts.unresolved++;
        if (status.status === "WITHHELD_MIXED_EVIDENCE") counts.withheld++;
        else counts.unknown++;
        break;
    }
    if (purchaseClass !== "INCLUDED") continue;

    for (const product of plan.purchasedProducts) {
      const productKey = `${product.name}|${product.npkAnalysis}`;
      const costEur = isValidCostEur(product.costEur) ? product.costEur : null;
      let line = byKey.get(productKey);
      if (!line) {
        line = {
          productKey,
          name: product.name,
          npkAnalysis: product.npkAnalysis,
          catalogueVerified: knownFertiliserProductComposition(product.name) !== undefined,
          unit: "kg",
          totalKg: 0,
          displayTonnes: 0,
          bagConversion: { status: "UNAVAILABLE", reasonCode: "NO_VERIFIED_PACKAGE_SIZE" },
          contributions: [],
          knownCostEur: 0,
          estimatedCostEur: 0,
          provisional: false,
        };
        byKey.set(productKey, line);
      }
      line.contributions.push({ fieldId, fieldName, quantityKg: product.totalKg, costEur, provisional });
      line.totalKg += product.totalKg;
      if (costEur === null) line.estimatedCostEur = null;
      else {
        line.knownCostEur += costEur;
        if (line.estimatedCostEur !== null) line.estimatedCostEur += costEur;
      }
      if (provisional) line.provisional = true;
    }
  }

  const products = Array.from(byKey.values()).map((p) => ({ ...p, displayTonnes: roundKgUpToDisplayTonnes(p.totalKg) }));
  const productsWithUnknownCost = products.filter((p) => p.estimatedCostEur === null).map((p) => p.productKey);
  const unsupportedProducts = products.filter((p) => !p.catalogueVerified).map((p) => p.productKey);
  const knownCostSubtotalEur = products.reduce((sum, p) => sum + p.knownCostEur, 0);
  const status: FarmFertiliserBasketStatus =
    counts.unresolved > 0 || unsupportedProducts.length > 0 ? "INCOMPLETE" : counts.provisional > 0 ? "READY_WITH_PROVISIONAL_ITEMS" : "READY";

  return {
    aggregationVersion: FARM_FERTILISER_AGGREGATION_VERSION,
    engineVersions: [...engineVersions].sort(),
    fields,
    products,
    counts,
    knownCostSubtotalEur,
    estimatedTotalCostEur: productsWithUnknownCost.length > 0 ? null : knownCostSubtotalEur,
    productsWithUnknownCost,
    unsupportedProducts,
    status,
  };
}

export interface FarmFertiliserQuoteBasketLine {
  productKey: string;
  name: string;
  npkAnalysis: string;
  catalogueVerified: boolean;
  unit: "kg";
  quantityKg: number;
  displayTonnes: number;
  bagConversion: FarmFertiliserBagConversion;
  estimatedCostEur: number | null;
  contributingFieldCount: number;
  provisional: boolean;
}

export interface FarmFertiliserQuoteBasketFieldRef {
  fieldId: string;
  fieldName: string;
  status: FieldPurchaseStatus["status"];
  reasonCode?: string;
}

/** Quote-ready basket: everything a future supplier quote request needs
 * without recalculation. No persistence, supplier or submission behaviour. */
export interface FarmFertiliserQuoteBasket {
  basketVersion: typeof FARM_FERTILISER_QUOTE_BASKET_VERSION;
  aggregationVersion: typeof FARM_FERTILISER_AGGREGATION_VERSION;
  engineVersions: string[];
  farmId: string;
  createdAt: string;
  currency: "EUR";
  status: FarmFertiliserBasketStatus;
  /** False whenever the basket is INCOMPLETE — the lines are then a known
   * subtotal, never the whole-farm requirement. */
  isCompleteFarmRequirement: boolean;
  lines: FarmFertiliserQuoteBasketLine[];
  knownCostSubtotalEur: number;
  estimatedTotalCostEur: number | null;
  productsWithUnknownCost: string[];
  unsupportedProducts: string[];
  provisionalFieldCount: number;
  noPurchaseFieldCount: number;
  excludedFields: FarmFertiliserQuoteBasketFieldRef[];
  unresolvedFields: FarmFertiliserQuoteBasketFieldRef[];
}

function fieldRef(entry: FarmFertiliserFieldPurchaseEntry): FarmFertiliserQuoteBasketFieldRef {
  const status = entry.purchaseStatus;
  const reasonCode = entry.aggregationReasonCode ?? ("reasonCode" in status ? status.reasonCode : undefined);
  return { fieldId: entry.fieldId, fieldName: entry.fieldName, status: status.status, ...(reasonCode ? { reasonCode } : {}) };
}

export function buildFarmFertiliserQuoteBasket(
  aggregation: FarmFertiliserAggregation,
  meta: { farmId: string; createdAt: string },
): FarmFertiliserQuoteBasket {
  return {
    basketVersion: FARM_FERTILISER_QUOTE_BASKET_VERSION,
    aggregationVersion: aggregation.aggregationVersion,
    engineVersions: [...aggregation.engineVersions],
    farmId: meta.farmId,
    createdAt: meta.createdAt,
    currency: "EUR",
    status: aggregation.status,
    isCompleteFarmRequirement: aggregation.status !== "INCOMPLETE",
    lines: aggregation.products.map((p) => ({
      productKey: p.productKey,
      name: p.name,
      npkAnalysis: p.npkAnalysis,
      catalogueVerified: p.catalogueVerified,
      unit: p.unit,
      quantityKg: p.totalKg,
      displayTonnes: p.displayTonnes,
      bagConversion: p.bagConversion,
      estimatedCostEur: p.estimatedCostEur,
      contributingFieldCount: p.contributions.length,
      provisional: p.provisional,
    })),
    knownCostSubtotalEur: aggregation.knownCostSubtotalEur,
    estimatedTotalCostEur: aggregation.estimatedTotalCostEur,
    productsWithUnknownCost: [...aggregation.productsWithUnknownCost],
    unsupportedProducts: [...aggregation.unsupportedProducts],
    provisionalFieldCount: aggregation.counts.provisional,
    noPurchaseFieldCount: aggregation.counts.noPurchase,
    excludedFields: aggregation.fields.filter((f) => f.purchaseClass === "EXCLUDED").map(fieldRef),
    unresolvedFields: aggregation.fields.filter((f) => f.purchaseClass === "UNRESOLVED").map(fieldRef),
  };
}

/**
 * Sums real product kg by exact product name — the same "product kg, not
 * nutrient kg, never a fuzzy match" discipline
 * `nutrientContributionFromFertiliserActual` already applies, reused here
 * for a *demand* total (how much product, not how much nutrient) rather
 * than a nutrient contribution. `"bags"` is excluded, same reason as
 * everywhere else in this module: no verified bag weight exists. Used
 * for both real planned quantities (a farmer's own `plannedProduct`/
 * `plannedQuantityKg` edit — always already `"kg"`) and real confirmed
 * Actuals, by the same farm-wide aggregator
 * (`src/orchestration/fertiliser-plan/index.ts`).
 */
function isUnresolvedFertiliserQuantity(q: FertiliserActualQuantity): boolean {
  return !q.product || q.quantity === undefined || !Number.isFinite(q.quantity) || q.quantity <= 0 || q.quantityUnit === undefined || q.quantityUnit === "bags";
}

export function totalProductQuantityKgByProduct(quantities: readonly FertiliserActualQuantity[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const q of quantities) {
    if (isUnresolvedFertiliserQuantity(q)) continue;
    // Non-null by `isUnresolvedFertiliserQuantity`'s own check above.
    const kg = q.quantityUnit === "t" ? q.quantity! * 1000 : q.quantity!;
    totals.set(q.product!, (totals.get(q.product!) ?? 0) + kg);
  }
  return totals;
}

/**
 * Codex audit MEDIUM (round 21): `totalProductQuantityKgByProduct`
 * silently excludes a real quantity it cannot resolve to a real kg
 * figure (most commonly `quantityUnit: "bags"` — no verified bag weight
 * exists anywhere in this app) — correct for that function's own job
 * (never inventing a kg figure), but the farm-wide demand aggregator
 * that consumes its confirmed-quantity totals had no way to know that
 * exclusion happened at all, so a real confirmed application could
 * silently vanish from `confirmedAppliedTotalKg`/`remainingTotalKg`
 * with those figures still reported as complete (`truncated: false`).
 * `getFieldRemainingFertiliserRequirement`'s own field-level
 * `applicationsWithUnknownComposition` already discloses the identical
 * situation one field at a time — this is the same real count, at the
 * farm-wide product-demand level. Reuses the identical exclusion
 * predicate `totalProductQuantityKgByProduct` itself applies, so the
 * two functions can never silently drift apart about what counts as
 * "resolved".
 */
export function countUnresolvedFertiliserQuantities(quantities: readonly FertiliserActualQuantity[]): number {
  return quantities.filter(isUnresolvedFertiliserQuantity).length;
}

export interface FarmFertiliserProductDemand extends FarmFertiliserProductTotal {
  /** Real total product kg across every real, explicit farmer plan
   * (an `edited` Decision's own `plannedProduct`/`plannedQuantityKg`) —
   * see this module's own header and `src/orchestration/fertiliser-plan/
   * index.ts`'s own doc comment for why a plain `accepted` decision (no
   * explicit farmer-chosen product/quantity) is deliberately excluded
   * from this total when more than one product was recommended for that
   * field: PRODUCT JUDGEMENT CALL, `docs/evidence-register.md`. */
  plannedTotalKg: number;
  /** Real total product kg across every real confirmed
   * `fertiliser_spreading` Actual farm-wide, matched by exact product
   * name. */
  confirmedAppliedTotalKg: number;
  /** `max(0, recommendedTotalKg - confirmedAppliedTotalKg)` — never
   * negative; mirrors `calculateRemainingFertiliserRequirement`'s own
   * "confirmed remaining", at the whole-farm/product level rather than
   * one field's own nutrient kg/ha.
   *
   * **Disclosed limitation** (Codex audit round 1): this is a *product*
   * remaining figure, matched by exact product name — not a *nutrient*
   * remaining figure re-allocated across products. A farmer who confirms
   * a different, nutritionally-equivalent product than the one
   * recommended does not reduce this row's own remaining figure (it
   * reduces that *other* product's own row instead, or appears as a new
   * row with `recommendedTotalKg: 0` if nothing currently recommends it
   * — see the "never dropped" fix below). Re-allocating a confirmed
   * application's real nutrient contribution across a farm's *current*
   * recommended-product mix would require inventing a cross-product
   * substitution rule this app has no verified source for — deliberately
   * not attempted; `getFieldRemainingFertiliserRequirement`'s own
   * *nutrient*-based (not product-based) remaining figure is the
   * authoritative per-field answer to "how much nutrient is still
   * needed", unaffected by this limitation. */
  remainingTotalKg: number;
}

/**
 * Combines the real recommended totals (`aggregateFarmFertiliserRecommendation`)
 * with real planned/confirmed totals the caller has already computed from
 * real Decision/job_actuals data — this function performs no I/O and
 * invents no figure of its own, purely arithmetic composition.
 */
export function aggregateFarmFertiliserDemand(
  recommended: readonly FarmFertiliserProductTotal[],
  plannedTotalsByProduct: ReadonlyMap<string, number>,
  confirmedTotalsByProduct: ReadonlyMap<string, number>,
): FarmFertiliserProductDemand[] {
  const byProduct = new Map<string, FarmFertiliserProductDemand>();
  for (const r of recommended) {
    const plannedTotalKg = plannedTotalsByProduct.get(r.product) ?? 0;
    const confirmedAppliedTotalKg = confirmedTotalsByProduct.get(r.product) ?? 0;
    byProduct.set(r.product, {
      ...r,
      plannedTotalKg,
      confirmedAppliedTotalKg,
      remainingTotalKg: Math.max(0, r.recommendedTotalKg - confirmedAppliedTotalKg),
    });
  }
  // Codex audit HIGH (round 1): the first version of this function only
  // ever iterated `recommended` — a product with a real planned or
  // confirmed total, but no field currently recommending it (a
  // recommendation that has since changed, or a plan/actual for a
  // product outside today's live blend), silently vanished from this
  // farm-wide report entirely. Every such product is now included, with
  // an honest `recommendedTotalKg: 0`/`fieldsCount: 0` — never invented,
  // and never dropped.
  for (const product of new Set([...plannedTotalsByProduct.keys(), ...confirmedTotalsByProduct.keys()])) {
    if (byProduct.has(product)) continue;
    const plannedTotalKg = plannedTotalsByProduct.get(product) ?? 0;
    const confirmedAppliedTotalKg = confirmedTotalsByProduct.get(product) ?? 0;
    byProduct.set(product, {
      product,
      // No real NutrientPlan line exists for this product for any
      // current field — never guessed from the product name.
      npkAnalysis: "",
      recommendedTotalKg: 0,
      recommendedTotalCostEur: 0,
      fieldsCount: 0,
      plannedTotalKg,
      confirmedAppliedTotalKg,
      remainingTotalKg: 0,
    });
  }
  return Array.from(byProduct.values());
}

/**
 * Future demand-aggregation hook (campaign item 20) — the safe,
 * farm-level summary a later commercial demand-planning/purchasing
 * system can consume without reinterpreting fertiliser science itself.
 * Deliberately just a type + pure mapping here: no supplier
 * tendering/portal/purchasing is built by this campaign (item 32).
 * `desiredTimingWindow` is genuinely omitted (not fabricated) — this
 * app's only real "planned date" is the optional, per-Decision
 * `edits.plannedDate`, which does not aggregate cleanly to one farm-wide
 * window across possibly-many plans for the same product; a future
 * campaign extending real per-plan timing can populate this honestly
 * once that aggregation question is itself resolved, rather than this
 * one guessing at it.
 */
export interface FarmInputDemand {
  farmId: string;
  product: string;
  unit: "kg";
  totalRequirementKg: number;
  plannedRequirementKg: number;
  confirmedRequirementKg: number;
  remainingRequirementKg: number;
  desiredTimingWindow?: string;
  /** `"estimated"` — every real figure here derives from
   * `calculateNutrientPlan`'s own Green Book estimate and real farmer
   * plans/confirmed actuals, never a lab-verified farm-wide total. */
  confidence: "estimated";
}

export function toFarmInputDemand(farmId: string, demand: FarmFertiliserProductDemand): FarmInputDemand {
  return {
    farmId,
    product: demand.product,
    unit: "kg",
    totalRequirementKg: demand.recommendedTotalKg,
    plannedRequirementKg: demand.plannedTotalKg,
    confirmedRequirementKg: demand.confirmedAppliedTotalKg,
    remainingRequirementKg: demand.remainingTotalKg,
    confidence: "estimated",
  };
}

// ---------------------------------------------------------------------------
// Fertiliser Vertical V1, Checkpoint 3 — Farm Purchase Requirement
// (tonnes). The campaign's own explicit ask: "exact tonnes by product for
// the farm", reconciling exactly to the field allocations that fed it,
// "subject only to documented rounding".
// ---------------------------------------------------------------------------

/**
 * The one documented rounding policy every kg->tonnes conversion in this
 * module uses — Codex audit concern this checkpoint closes: rounding was
 * previously ad hoc (`Math.round(x * 10) / 10` for kg rates,
 * `Math.round(x)` for cost, scattered through `nutrients.ts`) with no
 * single, named, testable rule. Rounds to the nearest 0.01 t (10 kg) —
 * a real, sensible farm-purchasing precision (a fertiliser order is
 * never placed to the nearest gram), applied exactly ONCE, at the farm
 * level, to an already-exact kg total that is itself a plain sum of
 * each field's own already-computed `FertiliserProduct.totalKg`
 * (`aggregateFarmFertiliserRecommendation` above) — never a sum of
 * individually-pre-rounded per-field tonnage figures, which would
 * accumulate rounding error across fields instead of rounding once.
 */
export const KG_PER_TONNE = 1000;
export const TONNES_ROUNDING_DECIMALS = 2;

export function roundKgToTonnes(kg: number): number {
  const factor = 10 ** TONNES_ROUNDING_DECIMALS;
  return Math.round((kg / KG_PER_TONNE) * factor) / factor;
}

export interface FarmFertiliserPurchaseRequirementLine {
  product: string;
  npkAnalysis: string;
  recommendedTotalTonnes: number;
  plannedTotalTonnes: number;
  confirmedAppliedTotalTonnes: number;
  remainingTotalTonnes: number;
  /**
   * Codex audit HIGH (round 1): the exact, unrounded kg figure
   * `remainingTotalTonnes` above was rounded from — carried alongside it
   * so a caller deciding WHETHER anything remains (an "include this
   * product?"/"is there genuinely nothing left to buy?" check) never has
   * to use the rounded tonnes value for that decision. A real farm-wide
   * remainder below 5 kg rounds to `0.00` t for *display*, but is not
   * genuinely zero — filtering or gating on the rounded tonnes figure
   * would silently drop it (or claim "nothing left to buy") even though
   * a real, if small, purchase is still required.
   */
  remainingTotalKg: number;
  fieldsCount: number;
}

/**
 * The farm-wide Purchase Requirement, in tonnes — "FARM FERTILISER
 * REQUIREMENT / Product A / X.XX tonnes" (campaign's own worked
 * example), built from (never re-deriving) `aggregateFarmFertiliserDemand`'s
 * own real kg totals. Each line's own tonnage figures are simple,
 * independent conversions of the exact same kg totals already displayed
 * elsewhere (`RemainingFertiliserRequirementCard`/`PurchasedFertiliserCard`)
 * — a farmer cross-checking one screen's kg figure against this one's
 * tonnes figure will always find them consistent (`recommendedTotalTonnes
 * * 1000` reconstructs `recommendedTotalKg` up to this module's own
 * documented 10 kg rounding precision, never a silently different
 * number).
 */
export function toFarmFertiliserPurchaseRequirementTonnes(demand: readonly FarmFertiliserProductDemand[]): FarmFertiliserPurchaseRequirementLine[] {
  return demand.map((d) => ({
    product: d.product,
    npkAnalysis: d.npkAnalysis,
    recommendedTotalTonnes: roundKgToTonnes(d.recommendedTotalKg),
    plannedTotalTonnes: roundKgToTonnes(d.plannedTotalKg),
    confirmedAppliedTotalTonnes: roundKgToTonnes(d.confirmedAppliedTotalKg),
    remainingTotalTonnes: roundKgToTonnes(d.remainingTotalKg),
    remainingTotalKg: d.remainingTotalKg,
    fieldsCount: d.fieldsCount,
  }));
}

// ---------------------------------------------------------------------------
// Grassland Fertiliser Pilot Completion, Checkpoint B — Lime Requirement
// (audit finding F5). Not a parallel lime engine: the one and only real
// figure this module ever reads is `SoilTest.limeRequirement`, a raw
// laboratory-reported value (t/ha) already saved by the existing soil
// test entry flow (`addSoilTestToField`/`addSoilTest`). This module does
// nothing but the same real, honest unit conversion/aggregation every
// other figure in this file already gets — never derives a lime rate
// from pH or any other proxy.
// ---------------------------------------------------------------------------

export interface FieldLimeRequirement {
  fieldId: string;
  /** The field's own real name — Codex audit round 1 MEDIUM: without
   * this, a farmer with more than one field on the list had no way to
   * tell which real rate/tonnes row belonged to which field. */
  fieldName: string;
  /** The real laboratory-reported rate, t/ha — `undefined` means this
   * field's own active soil test genuinely never reported one (most
   * labs only report a lime requirement when it's actually needed), not
   * a fabricated zero. */
  rateTHa?: number;
  /** `rateTHa * field.areaHa`, rounded to the same 0.01 t precision
   * every other tonnes figure in this app uses — `undefined` whenever
   * `rateTHa` is. */
  fieldTonnes?: number;
  areaHa: number;
}

export interface FarmLimeRequirement {
  fields: FieldLimeRequirement[];
  /** Sum of every real `fieldTonnes` that could actually be computed —
   * never silently including a field with no real lime evidence as if
   * it needed 0. */
  farmTotalTonnes: number;
  /** Real count of fields with no active lime-requirement evidence at
   * all (no verified test, or a verified test that didn't report one) —
   * disclosed so `farmTotalTonnes` is never presented as "the complete
   * farm requirement" when it can only ever be a partial one. */
  fieldsWithoutLimeEvidence: number;
}

/**
 * The real farm-wide lime requirement, in tonnes — Field tonnes/Farm
 * tonnes reconciliation the audit asked for (F5), built only from each
 * field's own real, already-saved laboratory `limeRequirement` (t/ha)
 * and real `areaHa` (always derived from a drawn boundary, never
 * farmer-typed). A field with no active lime evidence contributes
 * nothing to `farmTotalTonnes` and is counted in
 * `fieldsWithoutLimeEvidence` instead of being silently treated as
 * needing none.
 *
 * Codex audit round 2 HIGH x2, both fixed here:
 * - `farmTotalTonnes` now sums each field's real, unrounded
 *   `rateTHa * areaHa` and rounds exactly once at the very end — the
 *   same "never sum individually-rounded figures" principle
 *   `roundKgToTonnes`'s own doc comment above already documents for
 *   this file's kg->tonnes conversions. The previous version summed
 *   each field's already-rounded `fieldTonnes`, so several small real
 *   per-field requirements that individually round to `0.00` t could
 *   silently vanish from the farm total instead of the true sum
 *   correctly rounding up. Each line's own displayed `fieldTonnes` is
 *   still its own independently-rounded figure — only the farm total's
 *   own arithmetic changed.
 * - A non-finite or negative `limeRequirement`/`areaHa` (malformed
 *   evidence — never expected from the real UI, but the persistence
 *   layer does not itself constrain it) is now treated as unresolved
 *   evidence, exactly like a genuinely missing lime figure
 *   (`fieldsWithoutLimeEvidence`), never as a real rate that could
 *   contribute a negative or nonsensical figure to the farm total.
 */
// ---------------------------------------------------------------------------
// Fertiliser Overview and Stock Visuals campaign — Farm N/P/K Requirement
// Totals. The farm-wide landing page's own "Distinguish nutrient kg from
// fertiliser product kg/tonnes" requirement: this is the real total
// NUTRIENT kg (N/P/K), never to be confused with `FarmInputDemand`'s real
// PRODUCT kg above (the same distinction `nutrientContributionFromFertiliserActual`'s
// own header already draws for one confirmed application, applied here at
// the farm level for the recommendation side instead).
// ---------------------------------------------------------------------------

export interface FarmNutrientRequirementTotalsKg {
  n: number;
  p: number;
  k: number;
  /** Real count of fields whose own per-ha requirement contributed to
   * the totals above — never silently including a field with no real
   * requirement figure (a genuinely blocked/not-applicable field
   * contributes nothing, exactly like `aggregateFarmLimeRequirement`'s
   * own `fieldsWithoutLimeEvidence` discipline). */
  fieldsIncluded: number;
}

/**
 * Sums each already-known field's own real per-ha N/P/K requirement
 * (`requirementKgHa`, from that field's own current
 * `FertiliserRecommendationSummary` — never recomputed here) times its
 * real `areaHa`, to a real farm-wide total kg. Pure arithmetic
 * composition only — the caller (`src/app/actions/fertiliser-plan-overview.ts`)
 * supplies each field's own already-recomputed requirement, reusing the
 * identical real `promptForFertiliserRecommendation` engine every other
 * real screen in this app already calls, never a second one.
 */
export function aggregateFarmNutrientRequirementKg(
  fields: readonly { areaHa: number; requirementKgHa?: FertiliserNutrientContributionKg }[],
): FarmNutrientRequirementTotalsKg {
  let n = 0;
  let p = 0;
  let k = 0;
  let fieldsIncluded = 0;
  for (const field of fields) {
    if (!field.requirementKgHa || !Number.isFinite(field.areaHa) || field.areaHa <= 0) continue;
    n += field.requirementKgHa.n * field.areaHa;
    p += field.requirementKgHa.p * field.areaHa;
    k += field.requirementKgHa.k * field.areaHa;
    fieldsIncluded += 1;
  }
  return { n, p, k, fieldsIncluded };
}

export function aggregateFarmLimeRequirement(fields: readonly Field[]): FarmLimeRequirement {
  let farmTotalTonnesExact = 0;
  let fieldsWithoutLimeEvidence = 0;

  const lines: FieldLimeRequirement[] = fields.map((field) => {
    const rateTHa = field.fertility.verifiedTest?.limeRequirement;
    const validRate = rateTHa !== undefined && Number.isFinite(rateTHa) && rateTHa >= 0;
    const validArea = Number.isFinite(field.areaHa) && field.areaHa >= 0;
    if (!validRate || !validArea) {
      fieldsWithoutLimeEvidence += 1;
      return { fieldId: field.id, fieldName: field.name, areaHa: field.areaHa };
    }
    const exactTonnes = rateTHa * field.areaHa;
    farmTotalTonnesExact += exactTonnes;
    const fieldTonnes = Math.round(exactTonnes * 10 ** TONNES_ROUNDING_DECIMALS) / 10 ** TONNES_ROUNDING_DECIMALS;
    return { fieldId: field.id, fieldName: field.name, rateTHa, fieldTonnes, areaHa: field.areaHa };
  });

  return {
    fields: lines,
    farmTotalTonnes: Math.round(farmTotalTonnesExact * 10 ** TONNES_ROUNDING_DECIMALS) / 10 ** TONNES_ROUNDING_DECIMALS,
    fieldsWithoutLimeEvidence,
  };
}
