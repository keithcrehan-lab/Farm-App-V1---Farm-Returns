/**
 * Fertiliser Vertical campaign — the real, farm-scoped orchestration
 * layer connecting a field's real nutrient requirement
 * (`src/domain/nutrients.ts`) to its real confirmed fertiliser Actuals
 * (`job_actuals`, via `listConfirmedJobSessionsForFarm`), producing the
 * real "remaining requirement" campaign item 14 asks for. All arithmetic
 * itself lives in the pure `src/domain/fertiliser-plan.ts` — this module
 * only does the real I/O (farm-scoped reads) and payload extraction, and
 * performs zero business logic no domain function already owns.
 */
import "server-only";
import {
  sumConfirmedFertiliserApplications,
  calculateRemainingFertiliserRequirement,
  aggregateFarmFertiliserRecommendation,
  aggregateFarmFertiliserDemand,
  totalProductQuantityKgByProduct,
  type FertiliserActualQuantity,
  type FertiliserNutrientContributionKg,
  type FarmFertiliserProductDemand,
} from "@/domain/fertiliser-plan";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { computeFarmGrasslandAggregates } from "@/orchestration/prompt/build-all";
import { FERTILISER_RECOMMENDATION_PROMPT_KIND } from "@/orchestration/prompt/fertiliser-recommendation";
import { listConfirmedJobSessionsForFarm } from "@/lib/farm-data/job-sessions";
import { listDecisionsForFarm } from "@/lib/farm-data/decisions";
import type { Field, LivestockGroup, SlurryAllocation } from "@/domain/types";

/** The one activity type this campaign's own real confirmed-Actual read
 * path recognises — matching `job-actual.ts`'s own real
 * `FertiliserSpreadingActual` shape (`nutrients.ts`'s "no fabricated
 * product/rate" discipline applied to reading real confirmed records,
 * not just producing recommendations). */
const FERTILISER_SPREADING_ACTIVITY_TYPE = "fertiliser_spreading";

/**
 * Extracts a real `FertiliserActualQuantity` from a real, already-farm-
 * scoped confirmed `job_actuals.payload` — never trusts a field's shape
 * beyond its own real, narrow type check; anything malformed simply
 * resolves to `undefined` fields, which `nutrientContributionFromFertiliserActual`
 * (`fertiliser-plan.ts`) already fails closed on.
 */
function extractFertiliserActualQuantity(payload: Record<string, unknown>): FertiliserActualQuantity {
  return {
    product: typeof payload.product === "string" ? payload.product : undefined,
    quantity: typeof payload.quantity === "number" ? payload.quantity : undefined,
    quantityUnit: payload.quantityUnit === "kg" || payload.quantityUnit === "t" || payload.quantityUnit === "bags" ? payload.quantityUnit : undefined,
  };
}

export interface FieldRemainingFertiliserRequirementInput {
  farmId: string;
  fieldId: string;
  /** The field's real requirement, kg/ha — already computed by
   * `calculateNutrientPlan`/`promptForFertiliserRecommendation`; this
   * module never recomputes it. */
  requirementKgHa: FertiliserNutrientContributionKg;
  /** The field's real mapped area, ha — `undefined`/invalid fails the
   * remaining calculation closed (campaign item 6), never fabricates a
   * total. */
  areaHa: number | undefined;
}

export interface FieldRemainingFertiliserRequirementResult {
  requirementKgHa: FertiliserNutrientContributionKg;
  /** `undefined` only when `areaHa` was missing/invalid — the same
   * `BLOCKED_INSUFFICIENT_EVIDENCE` case `calculateRemainingFertiliserRequirement`
   * itself returns for that. */
  confirmedAppliedKgHa?: FertiliserNutrientContributionKg;
  remainingKgHa?: FertiliserNutrientContributionKg;
  blockedReasonCode?: string;
  /** How many real confirmed fertiliser_spreading Actuals exist for this
   * field, and how many of those could not be included in the nutrient
   * total (an unrecognised product/quantity/unit — see
   * `nutrientContributionFromFertiliserActual`'s own doc comment) —
   * disclosed so a farmer/UI never silently under-counts. */
  confirmedApplications: number;
  applicationsWithUnknownComposition: number;
}

/**
 * The real remaining fertiliser requirement for one field — sums every
 * real confirmed `fertiliser_spreading` Actual for this exact farm+field
 * (`listConfirmedJobSessionsForFarm` is already farm-scoped; this
 * function additionally filters to the one requested field, never
 * trusting a caller-supplied field id beyond that filter), then applies
 * `calculateRemainingFertiliserRequirement`'s own pure arithmetic.
 */
export async function getFieldRemainingFertiliserRequirement(
  input: FieldRemainingFertiliserRequirementInput,
): Promise<FieldRemainingFertiliserRequirementResult> {
  const { sessions } = await listConfirmedJobSessionsForFarm(input.farmId);
  const actuals: FertiliserActualQuantity[] = sessions
    .filter((s) => s.activityType === FERTILISER_SPREADING_ACTIVITY_TYPE && s.primaryFieldId === input.fieldId && s.actual)
    .map((s) => extractFertiliserActualQuantity(s.actual!.payload));

  const summed = sumConfirmedFertiliserApplications(actuals);
  const remaining = calculateRemainingFertiliserRequirement(input.requirementKgHa, input.areaHa, summed.confirmedAppliedKg);

  return {
    requirementKgHa: input.requirementKgHa,
    ...(remaining.status === "OK"
      ? { confirmedAppliedKgHa: remaining.value.confirmedAppliedKgHa, remainingKgHa: remaining.value.remainingKgHa }
      : { blockedReasonCode: remaining.reasonCode }),
    confirmedApplications: actuals.length,
    applicationsWithUnknownComposition: summed.applicationsWithUnknownComposition,
  };
}

/** `Decision.calculationKind` for a real planned fertiliser application —
 * identical string to the Prompt kind it was decided from. Duplicated
 * from `@/app/actions/fertiliser-plan`'s own identical constant rather
 * than imported from it — that module is a Server Action boundary
 * (`"use server"`), which this orchestration module must not import
 * from (the dependency belongs in the other direction: actions call
 * orchestration, never the reverse). */
const FERTILISER_PLAN_CALCULATION_KIND: string = FERTILISER_RECOMMENDATION_PROMPT_KIND;

export interface FarmFertiliserDemandInput {
  farmId: string;
  fields: readonly Field[];
  livestockGroups: readonly LivestockGroup[];
  slurryAllocations: readonly SlurryAllocation[];
}

/**
 * Farm-wide fertiliser demand (campaign items 19/20) — the real
 * recommended/planned/confirmed/remaining totals by product, derived
 * entirely from real field state:
 * - **Recommended**: `aggregateFarmFertiliserRecommendation` over every
 *   real field's own already-computed `NutrientPlan.purchasedProducts`
 *   (the identical calculation `promptForFertiliserRecommendation` and
 *   `NutrientsPageClient` already run — never re-derived differently
 *   here).
 * - **Planned**: summed from every real, farm-wide, accepted/edited
 *   `fertiliser_recommendation` Decision's own explicit
 *   `edits.plannedProduct`/`edits.plannedQuantityKg` — a plain
 *   `accepted` Decision with no explicit farmer-chosen product/quantity
 *   is deliberately excluded (PRODUCT JUDGEMENT CALL,
 *   `docs/evidence-register.md`: with more than one product recommended
 *   for a field, a bare acceptance does not by itself say which product/
 *   quantity the farmer means to plan).
 * - **Confirmed**: summed from every real confirmed
 *   `fertiliser_spreading` Actual farm-wide, matched by exact product
 *   name (`totalProductQuantityKgByProduct`'s own "no fuzzy match, no
 *   bags" discipline).
 * - **Remaining**: `max(0, recommended - confirmed)` per product,
 *   computed by `aggregateFarmFertiliserDemand` itself.
 */
export async function getFarmFertiliserDemand(input: FarmFertiliserDemandInput): Promise<FarmFertiliserProductDemand[]> {
  const { farmGrasslandAreaHa, nonGrassPct } = computeFarmGrasslandAggregates(input.fields);
  const plans = input.fields.map((field) => {
    const slurryAllocation = input.slurryAllocations.find((a) => a.fieldId === field.id);
    return calculateNutrientPlan({
      field,
      farmGrasslandAreaHa,
      livestockGroups: [...input.livestockGroups],
      slurryAllocation,
      nonGrassPct,
    });
  });
  const recommended = aggregateFarmFertiliserRecommendation(plans);

  const [{ decisions }, { sessions }] = await Promise.all([
    listDecisionsForFarm(input.farmId),
    listConfirmedJobSessionsForFarm(input.farmId),
  ]);

  const plannedQuantities: FertiliserActualQuantity[] = decisions
    .filter((d) => d.calculationKind === FERTILISER_PLAN_CALCULATION_KIND && (d.outcome === "accepted" || d.outcome === "edited"))
    .map((d) => d.edits as { plannedProduct?: unknown; plannedQuantityKg?: unknown } | undefined)
    .filter((edits): edits is { plannedProduct: string; plannedQuantityKg: number } => typeof edits?.plannedProduct === "string" && typeof edits?.plannedQuantityKg === "number")
    .map((edits) => ({ product: edits.plannedProduct, quantity: edits.plannedQuantityKg, quantityUnit: "kg" as const }));
  const plannedTotals = totalProductQuantityKgByProduct(plannedQuantities);

  const confirmedQuantities: FertiliserActualQuantity[] = sessions
    .filter((s) => s.activityType === FERTILISER_SPREADING_ACTIVITY_TYPE && s.actual)
    .map((s) => extractFertiliserActualQuantity(s.actual!.payload));
  const confirmedTotals = totalProductQuantityKgByProduct(confirmedQuantities);

  return aggregateFarmFertiliserDemand(recommended, plannedTotals, confirmedTotals);
}
