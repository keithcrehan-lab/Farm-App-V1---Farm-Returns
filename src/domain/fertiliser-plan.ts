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
import type { NutrientPlan } from "./types";

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
  recommendedTotalCostEur: number;
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
 * aggregator, which calls this function for the recommended column and
 * adds the other three from real, farm-scoped persistence reads.
 */
export function aggregateFarmFertiliserRecommendation(plans: readonly Pick<NutrientPlan, "purchasedProducts">[]): FarmFertiliserProductTotal[] {
  const byProduct = new Map<string, FarmFertiliserProductTotal>();
  for (const plan of plans) {
    for (const product of plan.purchasedProducts) {
      const existing = byProduct.get(product.name);
      if (existing) {
        existing.recommendedTotalKg += product.totalKg;
        existing.recommendedTotalCostEur += product.costEur;
        existing.fieldsCount += 1;
      } else {
        byProduct.set(product.name, {
          product: product.name,
          npkAnalysis: product.npkAnalysis,
          recommendedTotalKg: product.totalKg,
          recommendedTotalCostEur: product.costEur,
          fieldsCount: 1,
        });
      }
    }
  }
  return Array.from(byProduct.values());
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
    fieldsCount: d.fieldsCount,
  }));
}
