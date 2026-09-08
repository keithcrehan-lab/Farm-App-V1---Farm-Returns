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
import {
  FERTILISER_RECOMMENDATION_PROMPT_KIND,
  isTillageField,
  hasNoRecordedLivestock,
  sanitiseRecommendedProduct,
  type FertiliserRecommendationSummary,
} from "@/orchestration/prompt/fertiliser-recommendation";
import { listConfirmedJobSessionsForFarm, listActiveJobSessionsForFarm } from "@/lib/farm-data/job-sessions";
import { listDecisionsForFarm } from "@/lib/farm-data/decisions";
import type { Field, FertiliserProduct, LivestockGroup, SlurryAllocation } from "@/domain/types";
import type { DecisionRecord } from "@/lib/farm-data/mappers";

/** The one activity type this campaign's own real confirmed-Actual read
 * path recognises — matching `job-actual.ts`'s own real
 * `FertiliserSpreadingActual` shape (`nutrients.ts`'s "no fabricated
 * product/rate" discipline applied to reading real confirmed records,
 * not just producing recommendations). */
const FERTILISER_SPREADING_ACTIVITY_TYPE = "fertiliser_spreading";

/** `Decision.calculationKind` for a real planned fertiliser application —
 * identical string to the Prompt kind it was decided from. Matches
 * `src/app/actions/fertiliser-plan.ts`'s own identical constant. */
const FERTILISER_PLAN_CALCULATION_KIND: string = FERTILISER_RECOMMENDATION_PROMPT_KIND;

/**
 * Codex audit CRITICAL (round 8): a third, independent path that reads a
 * persisted Decision's own frozen `estimateSnapshot` and forwards it to
 * a client — `src/app/(app)/records/page.tsx` passes every real,
 * unfiltered `DecisionRecord` straight into `RecordsPageClient`, the
 * same shape `getMatchablePlanForFieldAction`/
 * `getLinkedFertiliserPlanForJobSessionAction` (`src/app/actions/
 * fertiliser-plan.ts`) already sanitise (round 7). A Decision persisted
 * before round 6's `sanitiseRecommendedProduct` fix existed can still
 * carry a real per-product mock `costEur` inside that frozen snapshot.
 * Moved here (rather than exported from `fertiliser-plan.ts`) because
 * that file is a real Next.js `"use server"` module — every one of its
 * exports becomes a callable Server Action, which requires an async
 * function; this one plain, synchronous sanitiser cannot be exported
 * from there. Both `fertiliser-plan.ts` and `records/page.tsx` now call
 * this one real, authoritative copy instead of each carrying (or
 * lacking) their own.
 */
export function sanitiseDecisionRecordForClient(plan: DecisionRecord): DecisionRecord {
  if (plan.calculationKind !== FERTILISER_PLAN_CALCULATION_KIND || plan.estimateSnapshot.status !== "OK") return plan;
  const value = plan.estimateSnapshot.value as FertiliserRecommendationSummary;
  if (!Array.isArray(value?.products)) return plan;
  return {
    ...plan,
    estimateSnapshot: {
      ...plan.estimateSnapshot,
      value: { ...value, products: value.products.map((p) => sanitiseRecommendedProduct(p as FertiliserProduct)) },
    },
  };
}

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

/**
 * The real, authoritative field list a confirmed Actual actually covers
 * — `FertiliserSpreadingActual.fieldIds`, required and non-empty by
 * `validateFertiliserSpreadingActual`. Codex audit HIGH (round 1): the
 * first version of `getFieldRemainingFertiliserRequirement` matched by
 * `job_sessions.primaryFieldId` instead — the same class of bug Field
 * Awareness's own campaign already found and fixed for its own
 * confirmed-activity matching (round 3, `FIELD_AWARENESS_ARCHITECTURE.md`),
 * for the identical reason: `primaryFieldId` is where a job *started*,
 * not the authoritative record of which field(s) the confirmed work
 * actually covered.
 */
function actualFieldIds(payload: Record<string, unknown>): string[] {
  const raw = payload.fieldIds;
  return Array.isArray(raw) ? raw.filter((f): f is string => typeof f === "string") : [];
}

/**
 * The start of `asOfDate`'s own calendar year, as a real ISO datetime —
 * the season boundary `getFieldRemainingFertiliserRequirement` uses.
 * PRODUCT JUDGEMENT CALL, not a scientific fact (`docs/evidence-register.md`):
 * this app has no dedicated "growing season"/"NAP year" concept of its
 * own, but S.I. 588/2025's own closed-period calendar and NAP N/P
 * ceilings are already implicitly calendar-year-scoped (`kg/ha/year`) —
 * reusing that same annual cadence here, rather than inventing an
 * unrelated one, is the minimal real fix for Codex audit HIGH (round 1):
 * without any boundary, a confirmed application from a prior year would
 * permanently suppress a freshly recomputed current-year requirement.
 */
function startOfCalendarYearIso(asOfDate: string): string {
  const year = asOfDate.slice(0, 4);
  return `${year}-01-01T00:00:00.000Z`;
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
  /** Real "now" (ISO datetime/date) — only its calendar year is used, as
   * the season boundary (`startOfCalendarYearIso`'s own doc comment).
   * Defaults to the real current time. */
  asOfDate?: string;
}

export interface FieldRemainingFertiliserRequirementResult {
  requirementKgHa: FertiliserNutrientContributionKg;
  /** `undefined` only when `areaHa` was missing/invalid — the same
   * `BLOCKED_INSUFFICIENT_EVIDENCE` case `calculateRemainingFertiliserRequirement`
   * itself returns for that. */
  confirmedAppliedKgHa?: FertiliserNutrientContributionKg;
  remainingKgHa?: FertiliserNutrientContributionKg;
  blockedReasonCode?: string;
  /** How many real confirmed fertiliser_spreading Actuals (this calendar
   * year, this field) exist, and how many of those could not be included
   * in the nutrient total (an unrecognised product/quantity/unit — see
   * `nutrientContributionFromFertiliserActual`'s own doc comment) —
   * disclosed so a farmer/UI never silently under-counts. */
  confirmedApplications: number;
  applicationsWithUnknownComposition: number;
  /** A real, confirmed `fertiliser_spreading` Actual this calendar year
   * that covers more than one field — excluded from every figure above
   * (see this function's own doc comment) but never silently invisible:
   * disclosed by count so a caller can say "N applications recorded, M
   * could not be attributed to this one field". */
  applicationsExcludedMultiField: number;
  /** Codex audit CRITICAL (round 1): `listConfirmedJobSessionsForFarm`
   * caps at `MAX_CONFIRMED_JOB_SESSIONS` (200) — a farm with more
   * confirmed sessions than that would previously have its real applied
   * total silently understated (and remaining correspondingly
   * overstated) with no indication anything was missing. Propagated
   * through so the caller can disclose it, exactly like every other real
   * truncation in this app (`FIELD_AWARENESS_ACTIVITY_TRUNCATED_WARNING`'s
   * own precedent). */
  truncated: boolean;
}

/**
 * The real remaining fertiliser requirement for one field — sums every
 * real confirmed `fertiliser_spreading` Actual for this exact farm+field
 * (`listConfirmedJobSessionsForFarm` is already farm-scoped; this
 * function additionally filters to the one requested field via the
 * Actual's own authoritative `payload.fieldIds`, never trusting a
 * caller-supplied field id beyond that filter, and never a job
 * session's own `primaryFieldId`, which only records where work
 * *started* — see `actualFieldIds`'s own doc comment), scoped to the
 * current calendar year, then applies
 * `calculateRemainingFertiliserRequirement`'s own pure arithmetic.
 *
 * A confirmed Actual covering **more than one field** is excluded here
 * (Codex audit HIGH, round 1) — its payload carries only one total
 * quantity for every field it covers, with no real per-field
 * allocation evidence; attributing that whole total to this one field
 * would double-count it against every other field the same Actual also
 * covers, and splitting it evenly (or any other way) would be exactly
 * the kind of fabricated allocation this campaign's own rules forbid.
 * Excluded multi-field Actuals are counted honestly in
 * `applicationsExcludedMultiField`, never silently dropped from the
 * caller's ability to disclose "N applications recorded, M could not be
 * attributed to this one field".
 */
export async function getFieldRemainingFertiliserRequirement(
  input: FieldRemainingFertiliserRequirementInput,
): Promise<FieldRemainingFertiliserRequirementResult> {
  const { sessions, truncated } = await listConfirmedJobSessionsForFarm(input.farmId);
  const seasonStartIso = startOfCalendarYearIso(input.asOfDate ?? new Date().toISOString());

  const fertiliserActualsThisYear = sessions
    .filter(
      (s) =>
        s.activityType === FERTILISER_SPREADING_ACTIVITY_TYPE &&
        s.actual &&
        // Codex audit HIGH (round 2): a "did_not_happen" completion has
        // no real product/quantity at all (`FertiliserSpreadingActual`'s
        // own doc comment — both fields are absent, not merely unknown).
        // Without this, it fell through to "unresolved composition",
        // wrongly implying a real application occurred that this app
        // simply couldn't classify.
        s.actual.completionType !== "did_not_happen" &&
        s.actual.confirmedAt >= seasonStartIso,
    )
    .map((s) => s.actual!);

  const forThisField = fertiliserActualsThisYear.filter((actual) => {
    const fieldIds = actualFieldIds(actual.payload);
    return fieldIds.length === 1 && fieldIds[0] === input.fieldId;
  });
  const excludedMultiField = fertiliserActualsThisYear.filter((actual) => {
    const fieldIds = actualFieldIds(actual.payload);
    return fieldIds.includes(input.fieldId) && fieldIds.length > 1;
  }).length;

  const actuals: FertiliserActualQuantity[] = forThisField.map((actual) => extractFertiliserActualQuantity(actual.payload));

  const summed = sumConfirmedFertiliserApplications(actuals);
  const remaining = calculateRemainingFertiliserRequirement(input.requirementKgHa, input.areaHa, summed.confirmedAppliedKg);

  return {
    requirementKgHa: input.requirementKgHa,
    ...(remaining.status === "OK"
      ? { confirmedAppliedKgHa: remaining.value.confirmedAppliedKgHa, remainingKgHa: remaining.value.remainingKgHa }
      : { blockedReasonCode: remaining.reasonCode }),
    confirmedApplications: actuals.length,
    applicationsWithUnknownComposition: summed.applicationsWithUnknownComposition,
    applicationsExcludedMultiField: excludedMultiField,
    truncated,
  };
}

export interface FarmFertiliserDemandInput {
  farmId: string;
  fields: readonly Field[];
  livestockGroups: readonly LivestockGroup[];
  slurryAllocations: readonly SlurryAllocation[];
  /** Real "now" — only its calendar year is used, the same season
   * boundary `getFieldRemainingFertiliserRequirement` applies. Defaults
   * to the real current time. */
  asOfDate?: string;
}

/**
 * Farm-wide fertiliser demand (campaign items 19/20) — the real
 * recommended/planned/confirmed/remaining totals by product, derived
 * entirely from real field state:
 * - **Recommended**: `aggregateFarmFertiliserRecommendation` over every
 *   real field's own already-computed `NutrientPlan.purchasedProducts`
 *   (the identical calculation `promptForFertiliserRecommendation` and
 *   `NutrientsPageClient` already run — never re-derived differently
 *   here). Codex audit CRITICAL (round 7): a tillage field, and every
 *   field when the farm has no recorded livestock, are excluded from
 *   this aggregation entirely — this function used to call
 *   `calculateNutrientPlan` for every field unconditionally, bypassing
 *   the identical two fail-closed gates round 6 added to
 *   `promptForFertiliserRecommendation` (`TILLAGE_FIELD_NOT_SUPPORTED`/
 *   `MISSING_LIVESTOCK_DATA`) — this farm-wide total could still
 *   silently include a fabricated grazing figure for land/evidence this
 *   vertical does not support a recommendation for at all.
 * - **Planned**: summed from every real, farm-wide, accepted/edited
 *   `fertiliser_recommendation` Decision's own explicit
 *   `edits.plannedProduct`/`edits.plannedQuantityKg`, OR (Codex audit
 *   HIGH, round 7) a bare `accepted` Decision whose own real
 *   recommendation snapshot named exactly one product — treated as
 *   unambiguous for the identical reason `isUnambiguouslySingleProductPlan`
 *   already treats it as safely GPS-matchable/startable (round 4). A
 *   bare `accepted` Decision with more than one recommended product is
 *   still excluded (PRODUCT JUDGEMENT CALL, round 2,
 *   `docs/evidence-register.md`: no real way to say which product/
 *   quantity the farmer means to plan). Codex audit HIGH (round 2): a
 *   plan already linked to a genuinely in-flight or completed job
 *   session is excluded here too — per this campaign's own documented
 *   lifecycle (`FERTILISER_VERTICAL_ARCHITECTURE.md`), "Planned" means
 *   an accepted Decision with no `job_sessions` row *yet*; once linked
 *   and in progress or completed, it must not also still count as
 *   "planned" indefinitely (which would double-represent it once it
 *   also became "confirmed"). Codex audit HIGH (round 3): "linked"
 *   here deliberately means `listActiveJobSessionsForFarm`
 *   (ready/active/paused/completed_estimated) or a real confirmed
 *   session — never `listJobSessionDecisionIdsForFarm`, which also
 *   returns a decision linked to a **cancelled** session. A cancelled
 *   job never produced a real Actual, so the plan behind it genuinely
 *   still needs doing — round 2's own fix used the wrong reader and
 *   would have made a cancelled job's plan vanish from demand
 *   permanently (the database's own `unique(decision_id)` constraint
 *   means that exact Decision can never be linked to a second job
 *   session either, a real, disclosed pre-existing limitation of the
 *   `job_sessions` schema this campaign does not change — see
 *   `FERTILISER_VERTICAL_ARCHITECTURE.md`'s own "Known limitations").
 * - **Confirmed**: summed from every real confirmed, non-`did_not_happen`
 *   `fertiliser_spreading` Actual this calendar year, farm-wide, matched
 *   by exact product name (`totalProductQuantityKgByProduct`'s own "no
 *   fuzzy match, no bags" discipline) — the same season boundary and
 *   `did_not_happen` exclusion `getFieldRemainingFertiliserRequirement`
 *   applies (Codex audit HIGH, round 2: round 1's own calendar-year fix
 *   was applied only to the field-level function, leaving this farm-wide
 *   one still summing unbounded history).
 * - **Remaining**: `max(0, recommended - confirmed)` per product,
 *   computed by `aggregateFarmFertiliserDemand` itself.
 */
export interface FarmFertiliserDemandResult {
  demand: FarmFertiliserProductDemand[];
  /** Codex audit CRITICAL (round 1), extended round 3 — true when the
   * real `decisions` read (planned totals), the real confirmed-session
   * read (confirmed totals), or the real active-session read (planned-
   * exclusion set) hit its own cap
   * (`MAX_DECISION_HISTORY_ROWS`/`MAX_CONFIRMED_JOB_SESSIONS`/
   * `MAX_ACTIVE_JOB_SESSIONS`), meaning this farm's real planned/
   * confirmed totals may understate the truth — disclosed rather than
   * silently presented as complete. */
  truncated: boolean;
}

export async function getFarmFertiliserDemand(input: FarmFertiliserDemandInput): Promise<FarmFertiliserDemandResult> {
  const { farmGrasslandAreaHa, nonGrassPct } = computeFarmGrasslandAggregates(input.fields);
  // Codex audit CRITICAL (round 7, HIGH round 8): this is a second,
  // independent aggregation over the same real fields — it must apply
  // the identical fail-closed rules `promptForFertiliserRecommendation`
  // itself enforces per field, never a second, silently-diverging copy
  // of them. Round 8: reuses that module's own exported
  // `isTillageField`/`hasNoRecordedLivestock` predicates directly
  // (round 7's own version re-derived the same two checks inline —
  // exactly the drift mechanism responsible for rounds 6 and 7's own
  // findings, now closed at the source rather than merely fixed again).
  // A tillage field has no real tillage N/P/K table to recommend from at
  // all, and (since `calculateGrasslandStockingRateKgHa` applies one
  // real farm-wide stocking rate to every grazing field uniformly) an
  // empty `livestockGroups` read is genuinely ambiguous between
  // "confirmed zero livestock" and "never entered" for every grazing
  // field on the farm at once — `nGrazingSucklerToBeefKgHa` would
  // otherwise clamp that ambiguity to a concrete, presented-as-real
  // 35 kg N/ha for each of them. Disclosed, `docs/evidence-register.md`.
  const noLivestock = hasNoRecordedLivestock(input.livestockGroups);
  const recommendableFields = noLivestock ? [] : input.fields.filter((f) => !isTillageField(f));
  // Codex audit CRITICAL (round 8): "Planned" independently classified
  // every unlinked accepted/edited Decision by outcome/edits alone,
  // never checking whether its own field is *currently* recommendable —
  // a legacy plan `getMatchablePlanForFieldAction` now excludes (its
  // field became tillage, or the farm lost its recorded livestock)
  // could still contribute a real, concrete `plannedRequirementKg`
  // here, a third active/executable interpretation of a since-
  // recognised-unsupported basis. Every "Planned" quantity below is now
  // gated on the same real, current field-eligibility set the
  // "Recommended" total above already uses.
  const recommendableFieldIds = new Set(recommendableFields.map((f) => f.id));
  const plans = recommendableFields.map((field) => {
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

  const [
    { decisions, truncated: decisionsTruncated },
    { sessions, truncated: sessionsTruncated },
    { sessions: activeSessions, truncated: activeTruncated },
  ] = await Promise.all([
    listDecisionsForFarm(input.farmId),
    listConfirmedJobSessionsForFarm(input.farmId),
    listActiveJobSessionsForFarm(input.farmId),
  ]);

  // Codex audit HIGH (round 3) — see this function's own doc comment:
  // "linked" for planned-exclusion purposes means genuinely in-flight or
  // completed, never a cancelled session (which produced no real Actual
  // and left the plan itself still outstanding).
  const inFlightOrCompletedDecisionIds = new Set([...activeSessions.map((s) => s.decisionId), ...sessions.map((s) => s.decisionId)]);

  const plannedQuantities: FertiliserActualQuantity[] = decisions
    .filter(
      (d) =>
        d.calculationKind === FERTILISER_PLAN_CALCULATION_KIND &&
        (d.outcome === "accepted" || d.outcome === "edited") &&
        !inFlightOrCompletedDecisionIds.has(d.id) &&
        // Codex audit CRITICAL (round 8): a real field id is required to
        // even ask whether it's still currently recommendable — absent
        // here would mean corrupt/unexpected data, never a reason to
        // include it.
        d.fieldId !== undefined &&
        recommendableFieldIds.has(d.fieldId),
    )
    .map((d): FertiliserActualQuantity | undefined => {
      const edits = d.edits as { plannedProduct?: unknown; plannedQuantityKg?: unknown } | undefined;
      if (typeof edits?.plannedProduct === "string" && typeof edits?.plannedQuantityKg === "number") {
        return { product: edits.plannedProduct, quantity: edits.plannedQuantityKg, quantityUnit: "kg" as const };
      }
      // Codex audit HIGH (round 7): a bare "accepted" Decision (no
      // explicit edits) whose own real recommendation snapshot named
      // exactly one product is just as unambiguous as an explicit
      // edit — the identical reasoning
      // `isUnambiguouslySingleProductPlan` (`src/app/actions/
      // fertiliser-plan.ts`) already uses to decide a bare acceptance
      // is GPS-matchable/startable (round 4). Without this, the
      // farm-wide "Planned" total stayed zero for a real, genuinely
      // unambiguous accepted plan — an inconsistency between what this
      // vertical treats as safely executable and what it counts as
      // "planned". A genuinely ambiguous multi-product bare acceptance
      // is still excluded here — no real way to say which product/
      // quantity the farmer means (PRODUCT JUDGEMENT CALL, round 2,
      // `docs/evidence-register.md`).
      if (d.estimateSnapshot.status !== "OK") return undefined;
      const recommendation = d.estimateSnapshot.value as FertiliserRecommendationSummary;
      if (!Array.isArray(recommendation?.products) || recommendation.products.length !== 1) return undefined;
      const [product] = recommendation.products;
      return { product: product.name, quantity: product.totalKg, quantityUnit: "kg" as const };
    })
    .filter((q): q is FertiliserActualQuantity => q !== undefined);
  const plannedTotals = totalProductQuantityKgByProduct(plannedQuantities);

  const seasonStartIso = startOfCalendarYearIso(input.asOfDate ?? new Date().toISOString());
  const confirmedQuantities: FertiliserActualQuantity[] = sessions
    .filter(
      (s) =>
        s.activityType === FERTILISER_SPREADING_ACTIVITY_TYPE &&
        s.actual &&
        s.actual.completionType !== "did_not_happen" &&
        s.actual.confirmedAt >= seasonStartIso,
    )
    .map((s) => extractFertiliserActualQuantity(s.actual!.payload));
  const confirmedTotals = totalProductQuantityKgByProduct(confirmedQuantities);

  return {
    demand: aggregateFarmFertiliserDemand(recommended, plannedTotals, confirmedTotals),
    // Codex audit HIGH (round 3): the active-session read now feeding
    // the planned-exclusion set above has its own real cap
    // (`MAX_ACTIVE_JOB_SESSIONS`) too — omitted here, its own truncation
    // would let an omitted in-flight plan be silently double-counted as
    // still "planned" while this flag claimed completeness.
    truncated: decisionsTruncated || sessionsTruncated || activeTruncated,
  };
}
