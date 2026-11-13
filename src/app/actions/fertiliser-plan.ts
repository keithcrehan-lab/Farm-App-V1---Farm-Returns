"use server";

/**
 * Fertiliser Vertical campaign — server actions connecting a real,
 * persisted planned fertiliser application (a real, accepted
 * `fertiliser_recommendation` Decision — see
 * `docs/farm-return-next/FERTILISER_VERTICAL_PHASE0.md`'s "no new Plan
 * table" architecture decision: the Decision row itself *is* the
 * canonical Plan, there is no separate `fertiliser_plans` table) to GPS
 * Job Mode and Confirm Actual.
 *
 * Every real read here is farm-scoped the same way every other action in
 * this app is — `getFarmForCurrentUser()` first, then only that farm's
 * own RLS-scoped rows; nothing here ever trusts a caller-supplied farm
 * or decision id without checking it against a fresh, farm-scoped read
 * (campaign item 23).
 */
import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import {
  listDecisionsForFarm,
  getDecisionById,
} from "@/lib/farm-data/decisions";
import {
  listJobSessionDecisionIdsForFarm,
  getJobSessionById,
} from "@/lib/farm-data/job-sessions";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import {
  listSlurryAllocationRecordsForFarm,
  listSlurryAllocationsForFarm,
} from "@/lib/farm-data/slurry";
import {
  createSlurryForecastAdoption,
  isSystemSlurryForecastWriteConfigured,
  listSlurryForecastAdoptionsForFarm,
} from "@/lib/farm-data/slurry-forecast-adoptions";
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { listSlurryCompositionRecordsForFarm } from "@/lib/farm-data/slurry-composition";
import { listGrazingFieldSessionsForFarm } from "@/lib/farm-data/grazing-field-sessions";
import { loadRegulatoryEvidenceRecordsForFarm } from "@/lib/farm-data/regulatory-evidence";
import {
  getFieldProductionCycle,
  listFieldProductionCyclesForSeason,
} from "@/lib/farm-data/field-production-cycles";
import {
  SLURRY_COMPOSITION_VERSION,
  type SlurryComposition,
} from "@/domain/slurry-composition";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import {
  startJobSessionFromPlan,
  type StartJobSessionResult,
} from "@/orchestration/job-session";
import { recomputePromptByKind } from "@/orchestration/prompt/recompute";
import {
  FERTILISER_RECOMMENDATION_PROMPT_KIND,
  sanitiseRecommendedProduct,
  type FertiliserRecommendationSummary,
} from "@/orchestration/prompt/fertiliser-recommendation";
import {
  getFarmFertiliserDemand,
  sanitiseDecisionRecordForClient,
  selectedProductName,
} from "@/orchestration/fertiliser-plan";
import {
  toFarmInputDemand,
  toFarmFertiliserPurchaseRequirementTonnes,
  aggregateFarmLimeRequirement,
  buildFarmFertiliserQuoteBasket,
  aggregateFarmFertiliserPurchasing,
  toFarmFertiliserProductTotals,
  aggregateFarmFertiliserDemand,
  type FarmFertiliserAggregation,
  type FarmFertiliserQuoteBasket,
  type FertiliserNutrientContributionKg,
  type FarmInputDemand,
  type FarmFertiliserPurchaseRequirementLine,
  type FarmLimeRequirement,
} from "@/domain/fertiliser-plan";
import {
  checkClosedPeriodCalendar,
  normaliseCountyForZoneLookup,
} from "@/domain/closed-period-calendar";
import { checkLessMethodGate } from "@/domain/less-method-gate";
import { unknownReasonMessage } from "@/lib/purchase-status-presentation";
import { checkSpreadingWindowGate } from "@/domain/spreading-window-gate";
import { cropFamilyFor } from "@/domain/fertiliser-field-evidence";
import {
  calculateGrassFertiliserV2,
  GRASS_ENGINE_V2_VERSION,
  type GrassFertiliserResult,
  type GrassRuleTrace,
  type NutrientQuantity,
} from "@/domain/grass-fertiliser-engine-v2";
import {
  calculateFieldGrazingPressure,
  type GrazingFieldSession,
} from "@/domain/grazing-field-pressure";
import { resolveGrazingProductionSystem } from "@/domain/grazing-production-system-resolution";
import { calculateStatutoryGrasslandStockingRateKgHa } from "@/domain/statutory-excretion";
import {
  allocatePurchasedProducts,
  allocatePurchasedProductsPConstrained,
  checkNapCompliance,
  MURIATE_OF_POTASH_PRODUCT_NAME,
  manureOriginExcludedFromNapMaxima,
  NUTRIENT_ENGINE_VERSION,
  SLURRY_TABLE_9_8_RATE_RANGE_M3_HA,
  resolveAvailableSlurryNutrients,
  type RegulatoryManureOrigin,
  resolveEffectiveSlurryComposition,
  resolveFieldSlurryAllocation,
} from "@/domain/nutrients";
import { currentSlurryCompositionByHousing } from "@/domain/slurry-composition";
import { statutoryManureNutrientValuePerHa } from "@/domain/statutory-manure-value";
import type { SlurryOriginEvidenceRecord } from "@/domain/slurry-origin-evidence";
import {
  isActiveReservation,
  type SlurryAllocationRecord,
} from "@/domain/slurry-allocation-lifecycle";
import {
  resolvePrecedingYearGsr,
  type PrecedingYearGsrRecord,
  type PrecedingYearGsrResolution,
} from "@/domain/preceding-year-gsr";
import {
  currentSlurryForecastAdoption,
  bindSystemSlurryForecast,
  forecastIntentAllocations,
  forecastSupersededFieldIds,
  planningSeasonSlurryAllocations,
  type PlanningSlurryAllocation,
  type PlanningSlurrySource,
  type SlurryForecastAdoptionRecord,
  type SystemSlurryForecastSnapshot,
} from "@/domain/slurry-forecast-adoption";
import { resolveFieldSlurryCompositionInput } from "@/domain/slurry-evidence-context";
import { resolveSlurrySpreadableArea } from "@/domain/slurry-spreadable-area";
import type { SpreadableAreaRecord } from "@/domain/regulatory-evidence-records";
import {
  buildSlurryRegulatoryContextFromRecords,
  type FieldSpreadableAreaEvidence,
} from "@/domain/slurry-regulatory-context";
import { checkCommonageFertiliserGate } from "@/domain/commonage-gate";
import { checkNationalBufferDistance } from "@/domain/buffer-gate";
import { checkLocalBufferOverrideWithEvidence } from "@/domain/local-buffer-override-gate";
import { resolveChemicalFertiliserWaterStrip } from "@/domain/chemical-fertiliser-water-strip";
import {
  requireCommonageStatus,
  resolveLocalWaterBufferOverrideStatus,
} from "@/domain/input-gates";
import {
  activeFields,
  tracked,
  type Farm,
  type Field,
  type FertiliserProduct,
  type FieldPurchaseStatus,
  type Housing,
  type LivestockGroup,
  type SlurryAllocation,
  type TrackedValue,
} from "@/domain/types";
import {
  buildSlurryPlanningScenario,
  type SlurryPlanningScenarioInput,
} from "@/domain/slurry-planning-scenario";
import {
  buildFarmSlurryForecast,
  type FarmSlurryForecast,
} from "@/domain/slurry-storage-forecast";
import {
  carryCycleForwardForPlanningSeason,
  resolvePlanningSeasonCycles,
  slurryAllocationsForPlanningSeason,
  withFuturePlanningChemicalBaseline,
} from "@/lib/fertiliser-planning-season";

/** `Decision.calculationKind` for a real planned fertiliser application —
 * identical string to the Prompt kind it was decided from
 * (`decideAsFarmer` copies `Prompt.kind` verbatim into
 * `calculationKind`). */
const FERTILISER_PLAN_CALCULATION_KIND: string =
  FERTILISER_RECOMMENDATION_PROMPT_KIND;

function grazingStockingInputForField(args: {
  field: Pick<Field, "id" | "areaHa">;
  livestockGroups: LivestockGroup[];
  sessions: GrazingFieldSession[];
  season: string;
  asOf: string;
  holdingFallbackKgHa?: number;
}): {
  annualOrganicNStockingRateKgHa?: number;
  grazingStockingEvidence?: NonNullable<
    Parameters<typeof calculateGrassFertiliserV2>[0]["grazingStockingEvidence"]
  >;
} {
  // Fertiliser close-out (2026-11-11, Keith's decision): the Green Book
  // grazing tables are keyed on the holding's grassland stocking rate
  // (Table 12-3 footnote 3), so only that figure selects a table row. The
  // field's own recorded grazing is disclosed as context; with no holding
  // figure the caller blocks with its own reason rather than substituting
  // in-season paddock pressure.
  if (args.holdingFallbackKgHa === undefined) return {};
  const pressure = calculateFieldGrazingPressure({
    fieldId: args.field.id,
    fieldAreaHa: args.field.areaHa,
    livestockGroups: args.livestockGroups,
    sessions: args.sessions,
    seasonStart: `${args.season}-01-01T00:00:00.000Z`,
    asOf: args.asOf,
  });
  const fieldGrazingContext =
    pressure.status === "READY" && pressure.averageStockingRateLUHa !== undefined
      ? {
          averageStockingRateLUHa: pressure.averageStockingRateLUHa,
          ...(pressure.trackingStart ? { trackingStart: pressure.trackingStart } : {}),
          ...(pressure.trackingDays !== undefined ? { trackingDays: pressure.trackingDays } : {}),
          sourceSessionCount: pressure.sourceSessionIds.length,
        }
      : undefined;
  return {
    annualOrganicNStockingRateKgHa: args.holdingFallbackKgHa,
    grazingStockingEvidence: {
      basis: "HOLDING_GSR",
      ...(fieldGrazingContext ? { fieldGrazingContext } : {}),
    },
  };
}

/**
 * Codex audit HIGH (round 4) — a plan is only safe to treat as one
 * executable job when it unambiguously represents exactly one product:
 * either the farmer's own explicit `edits.plannedProduct` (always a
 * single real product, by `validateFertiliserPlanEdits`'s own
 * construction), or a bare `"accepted"` Decision whose real
 * recommendation snapshot itself only ever named one product. A bare
 * acceptance of a *multi*-product recommendation has no real way to say
 * which product a single GPS-detected job represents — linking it would
 * both misrepresent that one job as satisfying the whole blend and
 * permanently exhaust the Decision's one real `job_sessions` link
 * (`unique(decision_id)`) before the other products in it were ever
 * addressed. Never guessed here — an ambiguous multi-product plan is
 * simply not GPS-matchable at all (campaign item 11).
 */
function isUnambiguouslySingleProductPlan(plan: DecisionRecord): boolean {
  const edits = plan.edits as { plannedProduct?: unknown } | undefined;
  if (typeof edits?.plannedProduct === "string") return true;
  if (plan.estimateSnapshot.status !== "OK") return false;
  const recommendation = plan.estimateSnapshot
    .value as FertiliserRecommendationSummary;
  return (
    Array.isArray(recommendation.products) &&
    recommendation.products.length === 1
  );
}

/**
 * Codex audit CRITICAL (round 7): a plan Decision persisted before round
 * 6's tillage/missing-livestock gates existed (`fertiliser-recommendation.ts`)
 * can still carry a real, accepted, `"OK"` `estimateSnapshot` built from
 * a since-recognised-invalid basis — a tillage field, or a farm with no
 * recorded livestock at plan time. That historical record is never
 * rewritten (provenance is permanent — `CLAUDE.md`) — but it must not
 * remain an *active*, GPS-matchable, startable plan going forward once
 * the field's own *current* live recommendation no longer supports it.
 * Reruns the identical real, current recompute
 * `submitPromptDecisionAction`'s own accept/edit path already requires
 * before persisting a *new* Decision (`decisions.ts`).
 *
 * Returns the field's real, current recommendation when the recomputed
 * Prompt's own basis is genuinely `OK`, `undefined` otherwise — the one
 * real, authoritative "is there anything current to check a stored plan
 * against at all" answer, shared by every call site below rather than
 * re-derived.
 */
function getCurrentFertiliserRecommendation(
  farm: Farm,
  field: Field,
  allFields: readonly Field[],
  livestockGroups: readonly LivestockGroup[],
  slurryAllocations: readonly SlurryAllocation[],
  now: string,
  slurryCompositionRecords: readonly SlurryComposition[],
): FertiliserRecommendationSummary | undefined {
  const prompt = recomputePromptByKind({
    promptKind: FERTILISER_RECOMMENDATION_PROMPT_KIND,
    farm,
    field,
    allFields,
    livestockGroups,
    slurryAllocations,
    slurryCompositionRecords,
    now,
  });
  return prompt.basis.status === "OK"
    ? (prompt.basis.value as FertiliserRecommendationSummary)
    : undefined;
}

/**
 * Codex audit HIGH (round 9, revised round 10 — the prior rejection is
 * withdrawn; Codex's own independent re-assessment of it was correct):
 * a stored plan's own selected product must still be among the field's
 * *current* live recommendation's real products, not merely "some
 * current recommendation exists". Round 9's rejection reasoning
 * (`validateFertiliserPlanEdits`'s own "a planned quantity may
 * legitimately differ from the recommendation" design decision) only
 * ever protected *quantity* independence — it never justified treating
 * a product the live recommendation no longer names at all as still
 * safely executable. Example this closes: a stored single-product
 * `18-6-12` plan, after new soil/slurry evidence shifts the live
 * recommendation to Protected Urea only — the Prompt is still `OK`
 * (some real recommendation exists), but `18-6-12` itself is no longer
 * part of it. The historical Decision and its own frozen
 * `estimateSnapshot` are never rewritten (provenance is permanent) —
 * only whether it remains *matchable/startable* changes. Planned
 * quantity independence (round 9's real, still-valid point) is
 * completely unaffected: nothing here compares quantities.
 */
function isPlanProductStillRecommended(
  plan: DecisionRecord,
  recommendation: FertiliserRecommendationSummary,
): boolean {
  const product = selectedProductName(plan);
  return (
    product !== undefined &&
    recommendation.products.some((p) => p.name === product)
  );
}

export type MatchablePlanResult =
  | { status: "none" }
  | { status: "ambiguous"; candidateCount: number }
  | { status: "matched"; plan: DecisionRecord };

/**
 * Finds a real, unambiguous, not-yet-linked, accepted fertiliser plan for
 * one field — the lookup `GpsActivityCandidateCard.tsx` calls before
 * offering to link a detected fertiliser job to a plan (campaign item
 * 10/11).
 *
 * PRODUCT JUDGEMENT CALL (`docs/evidence-register.md`): "matchable" means
 * — this field, `fertiliser_recommendation`, `outcome` of `"accepted"` or
 * `"edited"`, not already linked to any job session (checked against
 * `listJobSessionDecisionIdsForFarm`, defense in depth on top of the
 * database's own `unique(decision_id)` constraint), and unambiguously
 * representing exactly one product (`isUnambiguouslySingleProductPlan`'s
 * own doc comment, Codex audit HIGH round 4 — a bare acceptance of a
 * multi-product recommendation is never GPS-matchable, since one
 * detected job can never safely stand in for a whole blend). No time-
 * window narrowing is applied: this app's only real "planned date" is
 * the optional, farmer-entered `edits.plannedDate`, so a hard window
 * would silently exclude a genuine undated plan rather than make
 * matching safer. If more than one real candidate remains, this returns
 * `"ambiguous"` rather than guessing — never auto-selects among multiple
 * plans (campaign item 11: "a false link is worse than no link").
 *
 * Codex audit HIGH (round 1): both real reads this function depends on
 * are capped (`MAX_DECISION_HISTORY_ROWS`/`MAX_JOB_SESSION_DECISION_ID_ROWS`)
 * — a farm at either cap could have a real, hidden extra candidate (or a
 * real, hidden existing link) this function would never see, turning a
 * genuinely ambiguous or already-linked plan into a false `"matched"`.
 * Either truncation therefore fails this whole lookup to `"ambiguous"`
 * (never a confident match) rather than trusting an incomplete read.
 */
export async function getMatchablePlanForFieldAction(
  fieldId: string,
): Promise<MatchablePlanResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error(
      "getMatchablePlanForFieldAction: no real farm for the current session",
    );
  }

  const [
    { decisions, truncated: decisionsTruncated },
    { decisionIds: linkedDecisionIds, truncated: linksTruncated },
    allFields,
    livestockGroups,
    slurryAllocations,
    slurryCompositionRecords,
  ] = await Promise.all([
    listDecisionsForFarm(farm.id),
    listJobSessionDecisionIdsForFarm(farm.id),
    listFieldsForFarm(farm.id),
    listLivestockGroupsForFarm(farm.id),
    listSlurryAllocationsForFarm(farm.id),
    listSlurryCompositionRecordsForFarm(farm.id),
  ]);
  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2) — `listFieldsForFarm` returns every field regardless of
  // `archivedAt`; an archived field must not be matchable/plannable, and
  // must not inflate the farm-wide grassland area denominator the
  // recomputed recommendation below divides by.
  const fields = activeFields(allFields);
  // Codex audit CRITICAL (round 7): needed to recompute this field's
  // *current* live recommendation below — see
  // `isPlanStillCurrentlyRecommendable`'s own doc comment. No real field
  // means no real candidate either way.
  const field = fields.find((f) => f.id === fieldId);
  if (!field) return { status: "none" };
  const p3Cycle = await getFieldProductionCycle(
    field.id,
    new Date().toISOString().slice(0, 4),
  );
  if (p3Cycle) return { status: "none" };

  const candidates = decisions.filter(
    (d) =>
      d.fieldId === fieldId &&
      d.calculationKind === FERTILISER_PLAN_CALCULATION_KIND &&
      (d.outcome === "accepted" || d.outcome === "edited") &&
      !linkedDecisionIds.has(d.id) &&
      isUnambiguouslySingleProductPlan(d),
  );

  if (decisionsTruncated || linksTruncated) {
    return { status: "ambiguous", candidateCount: candidates.length };
  }
  if (candidates.length === 0) return { status: "none" };
  // Codex audit CRITICAL (round 7), revised HIGH (round 10): a candidate
  // whose field is no longer currently recommendable at all (tillage
  // now, no recorded livestock, missing soil evidence, a new legal
  // prohibition — anything `promptForFertiliserRecommendation` itself
  // would now block or find not applicable), or whose own selected
  // product is no longer among the field's *current* live
  // recommendation's real products, must not remain matchable just
  // because its own frozen snapshot was once "OK" — never treated as
  // ambiguous either, simply not a real candidate any more. Computed
  // once per field, not once per candidate — every candidate here
  // shares the same real field.
  const currentRecommendation = getCurrentFertiliserRecommendation(
    farm,
    field,
    fields,
    livestockGroups,
    slurryAllocations,
    new Date().toISOString(),
    slurryCompositionRecords,
  );
  const stillCurrentCandidates = currentRecommendation
    ? candidates.filter((c) =>
        isPlanProductStillRecommended(c, currentRecommendation),
      )
    : [];
  if (stillCurrentCandidates.length === 0) return { status: "none" };
  if (stillCurrentCandidates.length > 1)
    return {
      status: "ambiguous",
      candidateCount: stillCurrentCandidates.length,
    };
  return {
    status: "matched",
    plan: sanitiseDecisionRecordForClient(stillCurrentCandidates[0]),
  };
}

export interface StartJobSessionFromPlanActionInput {
  planDecisionId: string;
  fieldId: string;
  /** Fixed to `"fertiliser_spreading"` — a `fertiliser_recommendation`
   * plan can only ever authorise a fertiliser-spreading job. Codex audit
   * HIGH (round 1): the first version accepted `ActivityType | string`
   * and passed it straight through, so a direct server-action caller
   * could link a real fertiliser plan to an unrelated slurry/silage/etc.
   * job session. */
  activityType: "fertiliser_spreading";
  jobSessionId: string;
}

/**
 * Starts a Job Session from a real, already-persisted, accepted plan
 * Decision — the GPS Job Mode connection (campaign item 10). Every check
 * below runs against a fresh, farm-scoped database read; none of it
 * trusts `input` beyond which decision/field/session id the caller wants
 * to act on.
 */
export async function startJobSessionFromPlanAction(
  input: StartJobSessionFromPlanActionInput,
): Promise<StartJobSessionResult> {
  if (input.activityType !== "fertiliser_spreading") {
    throw new Error(
      `startJobSessionFromPlanAction: activityType must be "fertiliser_spreading" — a fertiliser plan can never authorise any other job type`,
    );
  }

  const now = new Date().toISOString();
  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error(
      "startJobSessionFromPlanAction: no real farm for the current session",
    );
  }

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2) — a new job session must never be startable against a field the
  // farmer has archived; `activeFields` makes an archived field
  // genuinely "not found" here, the same fail-closed shape an actually
  // deleted field would produce.
  const fields = activeFields(await listFieldsForFarm(farm.id));
  const field = fields.find((f) => f.id === input.fieldId);
  if (!field) {
    throw new Error(
      `startJobSessionFromPlanAction: field ${input.fieldId} not found on the current session's farm`,
    );
  }
  const p3CycleForExecution = await getFieldProductionCycle(
    field.id,
    now.slice(0, 4),
  );
  if (p3CycleForExecution) {
    throw new Error(
      "startJobSessionFromPlanAction: legacy fertiliser plans are disabled for fields with a current P3 production cycle",
    );
  }

  // listDecisionsForFarm is farm-scoped (RLS + explicit farm_id filter) —
  // `plan.farmId` below is therefore already guaranteed to equal
  // `farm.id`; every other check here is a real product-safety check
  // (campaign item 11), not an ownership one.
  const { decisions } = await listDecisionsForFarm(farm.id);
  const plan = decisions.find((d) => d.id === input.planDecisionId);
  if (!plan) {
    throw new Error(
      `startJobSessionFromPlanAction: plan ${input.planDecisionId} not found on the current session's farm`,
    );
  }
  if (plan.outcome !== "accepted" && plan.outcome !== "edited") {
    throw new Error(
      `startJobSessionFromPlanAction: plan ${plan.id} has outcome "${plan.outcome}" — only an accepted/edited plan can start a job`,
    );
  }
  if (plan.calculationKind !== FERTILISER_PLAN_CALCULATION_KIND) {
    throw new Error(
      `startJobSessionFromPlanAction: decision ${plan.id} is not a real fertiliser plan (calculationKind "${plan.calculationKind}")`,
    );
  }
  if (plan.fieldId !== input.fieldId) {
    throw new Error(
      `startJobSessionFromPlanAction: plan ${plan.id} is for a different field than requested`,
    );
  }
  // Codex audit HIGH (round 4) — defense in depth on top of
  // `getMatchablePlanForFieldAction`'s own identical check: a direct
  // caller (bypassing the UI's own matching lookup) must not be able to
  // start a job from a bare-accepted, genuinely multi-product plan
  // either — see `isUnambiguouslySingleProductPlan`'s own doc comment.
  if (!isUnambiguouslySingleProductPlan(plan)) {
    throw new Error(
      `startJobSessionFromPlanAction: plan ${plan.id} represents more than one product with no farmer-chosen single product — not safely executable as one job`,
    );
  }
  // Codex audit CRITICAL (round 7), revised HIGH (round 10): defense in
  // depth on top of `getMatchablePlanForFieldAction`'s own identical
  // check — a direct caller (bypassing the UI's own matching lookup)
  // must not be able to start a job from a plan whose field is no
  // longer currently recommendable at all, or whose own selected
  // product is no longer among the field's current live recommendation
  // — even though its own frozen snapshot was once "OK" — see
  // `getCurrentFertiliserRecommendation`'s own doc comment.
  const [livestockGroups, slurryAllocations, slurryCompositionRecords] =
    await Promise.all([
      listLivestockGroupsForFarm(farm.id),
      listSlurryAllocationsForFarm(farm.id),
      listSlurryCompositionRecordsForFarm(farm.id),
    ]);
  const currentRecommendation = getCurrentFertiliserRecommendation(
    farm,
    field,
    fields,
    livestockGroups,
    slurryAllocations,
    now,
    slurryCompositionRecords,
  );
  if (
    !currentRecommendation ||
    !isPlanProductStillRecommended(plan, currentRecommendation)
  ) {
    throw new Error(
      `startJobSessionFromPlanAction: plan ${plan.id}'s field is no longer currently recommendable — not safely executable as one job`,
    );
  }

  const { decisionIds: linkedDecisionIds } =
    await listJobSessionDecisionIdsForFarm(farm.id);
  if (linkedDecisionIds.has(plan.id)) {
    throw new Error(
      `startJobSessionFromPlanAction: plan ${plan.id} is already linked to a job session`,
    );
  }

  // Codex audit HIGH (round 32): every check above revalidates the
  // agronomic recommendation itself, but nothing in this real execution
  // boundary ever consulted the statutory closed-period calendar —
  // `build-all.ts`'s own `promptForSpreadingWindow` computes it, but
  // only as a separate, informational Prompt the plan sheet merely
  // displays (`FertiliserPlanSheet.tsx`); neither `getMatchablePlanForFieldAction`
  // nor this function's own execution path used it as a gate. A
  // GPS-detected or directly invoked plan start could therefore turn a
  // valid nutrient plan into real, executed chemical-fertiliser
  // spreading during a period when spreading is legally prohibited
  // (S.I. 588/2025) — the identical "defense in depth, re-verify at the
  // real execution boundary, never trust a stale display-only check"
  // discipline every other real check in this function already applies.
  // Fails closed on missing county-zone evidence too, not just a
  // confirmed prohibition — this function commits to a real, physical
  // job, so it must never proceed on an unverifiable legal question.
  const closedPeriod = checkClosedPeriodCalendar({
    county: normaliseCountyForZoneLookup(farm.location.county),
    date: now.slice(0, 10),
    material: "chemical_fertiliser",
  });
  if (closedPeriod.status !== "OK") {
    throw new Error(
      `startJobSessionFromPlanAction: cannot start this job — ${
        closedPeriod.status === "LEGAL_PROHIBITION"
          ? closedPeriod.consequence
          : "the statutory closed-period calendar could not be verified for this farm's county"
      }`,
    );
  }

  const result = await startJobSessionFromPlan({
    planDecision: plan,
    activityType: input.activityType,
    jobSessionId: input.jobSessionId,
    decidedAt: now,
    primaryFieldId: input.fieldId,
  });
  revalidatePath("/today");
  revalidatePath("/plan");
  return result;
}

/**
 * Confirm Actual prefill (campaign item 12): the real planned
 * product/quantity/date behind a `"plan"`-origin job session, so
 * `ConfirmActualSheet` can prefill rather than ask the farmer to
 * re-enter what Farm Return already knows. Returns `null` whenever there
 * is genuinely nothing to prefill from — a manual/detected/prompt-origin
 * session, a plan the farmer accepted as-is with no quantity/product
 * edit, or a session/plan this farm does not own — never a fabricated
 * default.
 */
export interface LinkedFertiliserPlanSummary {
  decisionId: string;
  fieldId?: string;
  recommendedProducts: FertiliserRecommendationSummary["products"];
  plannedProduct?: string;
  plannedQuantityKg?: number;
  plannedDate?: string;
}

export async function getLinkedFertiliserPlanForJobSessionAction(
  jobSessionId: string,
): Promise<LinkedFertiliserPlanSummary | null> {
  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error(
      "getLinkedFertiliserPlanForJobSessionAction: no real farm for the current session",
    );
  }

  const jobSession = await getJobSessionById(farm.id, jobSessionId);
  if (!jobSession || jobSession.origin !== "plan") return null;

  // Codex audit MEDIUM (round 2): this used to search
  // `listDecisionsForFarm`'s own capped, most-recent-first 200-row read
  // — a real plan Decision older than that window would silently
  // resolve to "no plan found", indistinguishable from a session with
  // genuinely nothing to prefill from. A direct, uncapped lookup by the
  // job session's own real `decisionId` has no such ceiling.
  const plan = await getDecisionById(farm.id, jobSession.decisionId);
  if (
    !plan ||
    plan.calculationKind !== FERTILISER_PLAN_CALCULATION_KIND ||
    plan.estimateSnapshot.status !== "OK"
  )
    return null;

  const recommendation = plan.estimateSnapshot
    .value as FertiliserRecommendationSummary;
  const edits = plan.edits as
    | {
        plannedProduct?: string;
        plannedQuantityKg?: number;
        plannedDate?: string;
      }
    | undefined;

  // Codex audit HIGH (round 14): a bare "accept as recommended" plan (no
  // `edits` at all) carries no explicit `plannedProduct`/`plannedQuantityKg`
  // — but for a single-product recommendation, that exact product/quantity
  // pair is already treated elsewhere as authoritative enough to count
  // toward farm-wide Planned demand and to GPS-match/start a job
  // (`selectedProductName`'s own doc comment). Before this fix,
  // `ConfirmActualSheet` only ever read the explicit `edits` fields, so a
  // farmer who tapped "Accept as recommended" saw both fields empty and
  // could confirm the job with no product/quantity recorded at all —
  // turning a perfectly well-known application into an
  // unresolved-composition Actual that can't reduce the remaining
  // requirement. `selectedProductName` returns the identical value
  // whether it came from an explicit edit or the single-product
  // fallback, so this reuses it rather than re-deriving a second copy of
  // that same rule; `effectiveProductDetail`'s own `totalKg` also backs
  // the quantity default when a farmer named a product but never
  // overrode its quantity.
  const effectiveProduct = selectedProductName(plan);
  const effectiveProductDetail = effectiveProduct
    ? recommendation.products.find((p) => p.name === effectiveProduct)
    : undefined;

  return {
    decisionId: plan.id,
    fieldId: plan.fieldId,
    // Codex audit CRITICAL (round 7): a Decision persisted before round
    // 6's `sanitiseRecommendedProduct` fix existed can still carry a
    // real per-product mock `costEur` inside its own frozen
    // `estimateSnapshot` — that historical record is never rewritten
    // (provenance is permanent), but this action's own client-facing
    // response must never forward it. Sanitised here defensively,
    // regardless of whether the stored snapshot happens to predate or
    // postdate that fix — a genuinely already-clean product is
    // unaffected (stripping an absent field is a no-op).
    recommendedProducts: recommendation.products.map((p) =>
      sanitiseRecommendedProduct(p as FertiliserProduct),
    ),
    plannedProduct: effectiveProduct,
    plannedQuantityKg:
      edits?.plannedQuantityKg ?? effectiveProductDetail?.totalKg,
    plannedDate: edits?.plannedDate,
  };
}

/**
 * Remaining requirement (campaign item 14) — the real, farm-scoped
 * "how much fertiliser does this field still need" figure, combining
 * the field's real, freshly-recomputed recommendation with its real
 * confirmed fertiliser Actuals (`getFieldRemainingFertiliserRequirement`,
 * `src/orchestration/fertiliser-plan/index.ts`). A discriminated result
 * — never a single mutable number — so the caller can render each real,
 * honest state distinctly rather than collapsing "no recommendation
 * exists" and "zero remaining" into the same zero.
 */
export type FieldFertiliserStatusResult =
  | { status: "blocked"; reasonCode: string }
  /** Chemical fertiliser is legally prohibited on this field. Never
   * reported as "not applicable": the farmer must see which legal gate
   * (commonage or the national water buffer) applies. */
  | {
      status: "prohibited";
      reasonCode: Extract<
        P3FieldLegalOutcome,
        { status: "PROHIBITED" }
      >["reasonCode"];
    }
  | {
      status: "ok";
      engineVersion: string;
      cropSystem: string;
      requirementKgHa: FertiliserNutrientContributionKg;
      organicCreditsKgHa: FertiliserNutrientContributionKg;
      confirmedAppliedKgHa?: FertiliserNutrientContributionKg;
      remainingKgHa?: FertiliserNutrientContributionKg;
      recommendedProducts: FertiliserProduct[];
      /** Present when part of the field is inside the 3 m chemical-
       * fertiliser surface-water strip; product kg cover the rest. */
      waterStrip?: ChemicalWaterStripExclusion;
      /** How `organicCreditsKgHa` was calculated — present whenever
       * planned slurry is credited. */
      organicCreditBasis?: OrganicCreditBasis;
      /** Present when products were limited to the statutory P maximum. */
      phosphorusLimit?: PhosphorusLimit;
      ruleTraces: {
        n?: GrassRuleTrace;
        p?: GrassRuleTrace;
        k?: GrassRuleTrace;
      };
      limitations: string[];
      blockedReasonCode?: string;
      confirmedApplications: number;
      applicationsWithUnknownComposition: number;
      /** A real confirmed Actual covering more than one field, excluded
       * from the figures above — see `getFieldRemainingFertiliserRequirement`'s
       * own doc comment. */
      applicationsExcludedMultiField: number;
      /** True when the real confirmed-session read hit its own row cap —
       * the figures above may understate the truth. */
      truncated: boolean;
    };

type P3Cycle = Awaited<
  ReturnType<typeof listFieldProductionCyclesForSeason>
>[number];

/**
 * Every persisted input the P3 planning calculation reads, loaded once per
 * request by the ONE loader every entry point uses — the per-field status,
 * the farm-demand/quote engine, the slurry-first preview and the automatic
 * slurry plan. Movement evidence is read from the same assessment viewpoint
 * (`now`) everywhere, so two paths can never resolve a field's grazing
 * system or stocking from different evidence.
 */
interface P3PlanningEvidence {
  fields: Field[];
  livestockGroups: LivestockGroup[];
  /** Planned (active) physical slurry reservations with their identity. */
  physicalAllocationRecords: SlurryAllocationRecord[];
  /** Every allocation with its full lifecycle (planned, completed,
   * cancelled) — what decides forecast supersession
   * (`forecastSupersededFieldIds`). */
  allocationRecords: SlurryAllocationRecord[];
  forecastAdoptions: SlurryForecastAdoptionRecord[];
  slurryCompositionRecords: SlurryComposition[];
  grazingSessions: GrazingFieldSession[];
  spreadableAreaRecords: SpreadableAreaRecord[];
  slurryOriginEvidenceRecords: SlurryOriginEvidenceRecord[];
}

async function loadP3PlanningEvidence(
  farm: Farm,
  now: string,
): Promise<P3PlanningEvidence> {
  const [
    allFields,
    livestockGroups,
    allocationRecords,
    slurryCompositionRecords,
    grazingSessions,
    { spreadableAreaRecords, slurryOriginEvidenceRecords },
    forecastAdoptions,
  ] = await Promise.all([
    listFieldsForFarm(farm.id),
    listLivestockGroupsForFarm(farm.id),
    listSlurryAllocationRecordsForFarm(farm.id),
    listSlurryCompositionRecordsForFarm(farm.id),
    listGrazingFieldSessionsForFarm(farm.id, now),
    loadRegulatoryEvidenceRecordsForFarm(farm.id),
    listSlurryForecastAdoptionsForFarm(farm.id),
  ]);
  return {
    fields: activeFields(allFields),
    livestockGroups,
    physicalAllocationRecords: allocationRecords.filter(isActiveReservation),
    allocationRecords,
    forecastAdoptions,
    slurryCompositionRecords,
    grazingSessions,
    spreadableAreaRecords,
    slurryOriginEvidenceRecords,
  };
}

/** The production cycles for a planning season: its own saved cycles, and
 * for a future season the canonical carry-forward
 * (`resolvePlanningSeasonCycles`). */
async function loadPlanningSeasonCycles(
  fieldIds: string[],
  season: string,
  currentSeason: string,
): Promise<P3Cycle[]> {
  const targetCycles = await listFieldProductionCyclesForSeason(
    fieldIds,
    season,
  );
  if (season <= currentSeason) return targetCycles;
  return resolvePlanningSeasonCycles({
    targetCycles,
    currentCycles: await listFieldProductionCyclesForSeason(
      fieldIds,
      currentSeason,
    ),
    planningSeason: season,
    currentSeason,
  });
}

/**
 * Which slurry a planning calculation credits:
 * - `CANONICAL`: the farm's own planning-season slurry — physical
 *   reservations dated in the season, plus the season's adopted forecast
 *   intent for fields with none (`planningSeasonSlurryAllocations`).
 * - an explicit list: a preview scenario or an automatic-plan candidate,
 *   evaluated in memory through the identical calculation.
 */
type P3SlurrySelection = "CANONICAL" | readonly PlanningSlurryAllocation[];

/**
 * Farm-wide inputs every per-field P3 calculation shares. Built once per
 * request so the per-field status path and the farm-demand engine resolve
 * cycles, grassland area, the holding stocking fallback and planning-season
 * slurry identically.
 */
interface P3FieldPlanContext {
  farm: Farm;
  cycleByFieldId: Map<string, P3Cycle>;
  livestockGroups: LivestockGroup[];
  seasonSlurryAllocations: PlanningSlurryAllocation[];
  /** Evidenced origin of each field's planned physical slurry
   * (`fieldPlannedManureOrigin`), known values only. Forecast and scenario
   * slurry has no declaration, so its origin stays unknown. */
  manureOriginByField: Map<string, RegulatoryManureOrigin>;
  compositionByHousing: ReturnType<typeof currentSlurryCompositionByHousing>;
  grazingSessions: GrazingFieldSession[];
  season: string;
  now: string;
  /** The farm-wide holding stocking rate. Only available when every active
   * field has a planning-season cycle: with a cycle missing, the farm's
   * grassland area is unknown and a whole-farm rate would be a guess. Used
   * for agronomic grazing stocking and the Table 15a band — never for the
   * LESS trigger, which needs the preceding year's figure. */
  holdingFallbackKgHa?: number;
  holdingFallbackUnavailableReason?: string;
  /** Season-bound evidence for the LESS `LESS_GSR_100` trigger. */
  precedingYearGsrRecords: readonly PrecedingYearGsrRecord[];
  /** Current spreadable-area evidence per field (the farmer's mapped
   * no-spread exclusions), resolved through the existing contract. */
  spreadableAreaByField: Map<string, FieldSpreadableAreaEvidence["spreadableAreaHa"]>;
  spreadableAreaRecords: readonly SpreadableAreaRecord[];
}

function buildP3FieldPlanContext(input: {
  farm: Farm;
  fields: readonly Field[];
  cycles: readonly P3Cycle[];
  evidence: P3PlanningEvidence;
  slurry: P3SlurrySelection;
  season: string;
  now: string;
}): P3FieldPlanContext {
  const { evidence } = input;
  const cycleByFieldId = new Map(
    input.cycles.map((cycle) => [cycle.fieldId, cycle]),
  );
  const grasslandAreaComplete = input.fields.every((field) =>
    cycleByFieldId.has(field.id),
  );
  const grasslandAreaHa = input.fields.reduce((sum, field) => {
    const cycle = cycleByFieldId.get(field.id);
    return cycle && cropFamilyFor(cycle.cropSystem) === "grassland"
      ? sum + field.areaHa
      : sum;
  }, 0);
  const stocking = calculateStatutoryGrasslandStockingRateKgHa(
    evidence.livestockGroups,
    grasslandAreaHa,
  );
  const physicalSeasonRecords = slurryAllocationsForPlanningSeason(
    evidence.physicalAllocationRecords,
    input.season,
  );
  const adoption = currentSlurryForecastAdoption(
    evidence.forecastAdoptions,
    input.season,
  );
  const seasonSlurryAllocations =
    input.slurry === "CANONICAL"
      ? planningSeasonSlurryAllocations(
          physicalSeasonRecords.map((record) => ({
            ...record,
            planningSource: {
              kind: "PHYSICAL_RESERVATION" as const,
              allocationId: record.id,
              ...(record.planRevision !== undefined
                ? { planRevision: record.planRevision }
                : {}),
            },
          })),
          adoption
            ? slurryAllocationsForPlanningSeason(
                forecastIntentAllocations(adoption),
                input.season,
              )
            : [],
          forecastSupersededFieldIds(evidence.allocationRecords, input.season),
        )
      : [...input.slurry];
  // The canonical Campaign B context is the only selector of Campaign B
  // evidence: spreadable area per field, and — for the season's physical
  // reservations — each field's declared manure origin.
  const regulatory = buildSlurryRegulatoryContextFromRecords({
    fields: input.fields,
    housing: [],
    allocationRecords: input.slurry === "CANONICAL" ? physicalSeasonRecords : [],
    compositionRecords: [],
    livestockGroups: evidence.livestockGroups,
    asOfDate: input.now.slice(0, 10),
    neatSlurryEvidenceRecords: [],
    spreadableAreaRecords: evidence.spreadableAreaRecords,
    slurryOriginEvidenceRecords:
      input.slurry === "CANONICAL" ? evidence.slurryOriginEvidenceRecords : [],
  });
  const manureOriginByField = new Map<string, RegulatoryManureOrigin>();
  for (const [fieldId, origin] of Object.entries(
    regulatory.plannedManureOriginByField,
  ))
    if (origin.state === "known" && origin.status !== "unavailable")
      manureOriginByField.set(fieldId, origin.value);
  return {
    farm: input.farm,
    cycleByFieldId,
    livestockGroups: evidence.livestockGroups,
    seasonSlurryAllocations,
    manureOriginByField,
    compositionByHousing: currentSlurryCompositionByHousing([
      ...evidence.slurryCompositionRecords,
    ]),
    grazingSessions: evidence.grazingSessions,
    precedingYearGsrRecords: input.farm.precedingYearGsrRecords ?? [],
    spreadableAreaByField: new Map(
      regulatory.spreadableArea.map((area) => [
        area.fieldId,
        area.spreadableAreaHa,
      ]),
    ),
    spreadableAreaRecords: evidence.spreadableAreaRecords,
    season: input.season,
    now: input.now,
    ...(!grasslandAreaComplete
      ? {
          holdingFallbackUnavailableReason:
            "MISSING_FARM_PRODUCTION_CYCLES_FOR_GRASSLAND_AREA",
        }
      : stocking.status === "OK"
        ? { holdingFallbackKgHa: stocking.value.gsrKgNHa }
        : { holdingFallbackUnavailableReason: stocking.reasonCode }),
  };
}

/** The S.I. 588/2025 Article 18(1) 3 m surface-water strip excluded from
 * a field's chemical-fertiliser area. */
export interface ChemicalWaterStripExclusion {
  chemicalAreaHa: number;
  excludedStripHa: number;
  ruleId: string;
  source: string;
}

/** A tracked input as carried into an audit: its value, status and source,
 * and every superseded value it replaced (`TrackedValue.previous`), newest
 * first — never reduced to the bare value. */
export interface TrackedEvidence<T> {
  value: T;
  status: string;
  source: string;
  sourceDate?: string;
  history: { value: T; status: string; source: string; sourceDate?: string }[];
}

function trackedEvidence<T>(value: TrackedValue<T>): TrackedEvidence<T> {
  const history: TrackedEvidence<T>["history"] = [];
  for (let previous = value.previous; previous; previous = previous.previous)
    history.push({
      value: previous.value,
      status: previous.status,
      source: previous.source,
      ...(previous.sourceDate ? { sourceDate: previous.sourceDate } : {}),
    });
  return {
    value: value.value,
    status: value.status,
    source: value.source,
    ...(value.sourceDate ? { sourceDate: value.sourceDate } : {}),
    history,
  };
}

/**
 * The calculation basis of a field's slurry credit, carried unchanged from
 * `resolveAvailableSlurryNutrients` and the evidence it was given: which
 * allocation(s) — physical reservation (id and revision), adopted forecast
 * intent (adoption id, forecast source and volume) or scenario — the
 * tracked method and date with their source, status and history, the
 * dry-matter evidence and composition record, the spreading area, the
 * selected availability rule and the nutrient-engine version that turned
 * them into a credit. The credit is per hectare spread; the engine
 * subtracts its field-average equivalent.
 */
export interface OrganicCreditBasis {
  /** The slurry nutrient transformation that produced the credit — a
   * different engine from the grass requirement engine. */
  calculationVersion: string;
  allocation: {
    fieldId: string;
    housingId: string;
    volumeM3: number;
    /** Every allocation that makes up the credit, with its identity. */
    contributing: {
      housingId: string;
      volumeM3: number;
      source: PlanningSlurrySource;
      compositionRecordId?: string;
    }[];
  };
  applicationMethod: TrackedEvidence<string>;
  applicationDate: TrackedEvidence<string>;
  spreadableArea: {
    areaHa: number;
    grossAreaHa: number;
    basis: "SPREADABLE_AREA_DECLARATION" | "MAPPED_FIELD_DEFAULT";
    recordId?: string;
    source: string;
    effectiveDate?: string;
    version: string;
  };
  applicationRateM3ha: number;
  dryMatter: {
    dmPct: number;
    status: string;
    source: string;
    sourceDate?: string;
    compositionRecordId?: string;
    compositionVersion: string;
  };
  rule: {
    ruleId: string;
    source: string;
    timingCategory: string;
    timingAssumed: boolean;
    soilIndexAdjustmentApplied: { p: boolean; k: boolean };
    scientificBasisNote: string;
  };
  evidenceState: string;
  creditOnSpreadAreaKgHa: NutrientQuantity;
  fieldAverageCreditKgHa: NutrientQuantity;
  /** The LESS trigger evidence the planned method was checked against. */
  lessTrigger: PrecedingYearGsrResolution;
}

type P3FieldLegalOutcome =
  | { status: "PERMITTED"; waterStrip?: ChemicalWaterStripExclusion }
  | {
      status: "PROHIBITED";
      reasonCode:
        | "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED"
        | "WATER_BUFFER_CHEMICAL_FERTILISER_PROHIBITED";
    }
  | { status: "UNKNOWN"; reasonCode: string; missingInputs: string[] };

type P3FieldPlanOutcome =
  | {
      status: "UNKNOWN";
      calculationVersion: string;
      reasonCode: string;
      missingInputs: string[];
    }
  | {
      status: "CALCULATED";
      result: GrassFertiliserResult & {
        grossRequirementKgHa: NutrientQuantity;
        remainingRequirementKgHa: NutrientQuantity;
        priorChemicalCreditsKgHa: NutrientQuantity;
      };
      products: FertiliserProduct[];
      /** How the slurry credit was calculated — absent when no slurry is
       * planned for the field in the planning season. */
      organicCreditBasis?: OrganicCreditBasis;
      /** Present when products were limited to the statutory P maximum. */
      phosphorusLimit?: PhosphorusLimit;
      /** Chemical-fertiliser legal gates and the statutory P maximum. */
      legal: P3FieldLegalOutcome;
    };

/**
 * THE canonical per-field P3 fertiliser calculation. The per-field status,
 * the farm-demand/quote engine, the slurry-first preview and the automatic
 * slurry plan all call this, so a field's own recommendation, its
 * contribution to procurement and any slurry economics can never be
 * produced by different gates.
 */
function calculateP3FieldPlan(
  context: P3FieldPlanContext,
  field: Field,
): P3FieldPlanOutcome {
  const unknown = (reasonCode: string, missingInputs: string[]) => ({
    status: "UNKNOWN" as const,
    calculationVersion: GRASS_ENGINE_V2_VERSION,
    reasonCode,
    missingInputs,
  });
  const cycle = context.cycleByFieldId.get(field.id);
  if (!cycle) return unknown("P3_MISSING_PRODUCTION_CYCLE", ["productionCycle"]);

  let organicCreditsKgHa = { n: 0, p: 0, k: 0 };
  let organicCreditBasis: OrganicCreditBasis | undefined;
  let statutoryOrganic: StatutoryOrganicPhosphorus | undefined;
  const slurryAllocation = resolveFieldSlurryAllocation(
    context.seasonSlurryAllocations,
    field.id,
  );
  if (slurryAllocation) {
    const compositionInput = resolveFieldSlurryCompositionInput(
      context.seasonSlurryAllocations,
      field.id,
      context.compositionByHousing,
    );
    if (
      !slurryAllocation.applicationMethod?.value ||
      !slurryAllocation.applicationDate?.value ||
      compositionInput.unresolved ||
      !field.fertility.pIndex?.value ||
      !field.fertility.kIndex?.value
    )
      return unknown("P3_INCOMPLETE_SLURRY_EVIDENCE", ["slurry"]);
    // A credit is only real if the planned application is lawful. Slurry
    // that cannot legally be spread on that date or at that field must never
    // reduce the chemical requirement; the plan has to be corrected first.
    const lessTrigger = resolvePrecedingYearGsr(
      context.precedingYearGsrRecords,
      slurryAllocation.applicationDate.value,
    );
    const slurryLegal = plannedSlurryLegalOutcome({
      farm: context.farm,
      field,
      applicationDate: slurryAllocation.applicationDate.value,
      applicationMethod: slurryAllocation.applicationMethod.value,
      lessTrigger,
      landUse:
        cropFamilyFor(cycle.cropSystem) === "grassland" ? "grass" : "arable",
    });
    if (slurryLegal) return unknown(slurryLegal, ["slurry"]);
    // Slurry is spread only on the spreadable area (the field less any
    // mapped no-spread exclusions), so the application rate is over that
    // area and the credit is scaled back to the whole field.
    const spreadable = resolveSlurrySpreadableArea(
      field,
      context.spreadableAreaByField.get(field.id),
      context.spreadableAreaRecords,
    );
    if (spreadable.status !== "RESOLVED")
      return unknown(spreadable.reasonCode, ["spreadableArea"]);
    const composition = resolveEffectiveSlurryComposition(
      compositionInput.composition,
    );
    const applicationRateM3ha =
      slurryAllocation.volumeM3 / spreadable.spreadableAreaHa;
    const available = resolveAvailableSlurryNutrients({
      allocation: slurryAllocation,
      applicationRateM3ha,
      dmPct: composition.dmPct,
      dmPctStatus: composition.status,
      pIndex: field.fertility.pIndex.value,
      kIndex: field.fertility.kIndex.value,
    });
    if (available.status !== "OK")
      return unknown(
        available.reasonCode,
        "missingInputs" in available ? available.missingInputs : [],
      );
    const spreadShare = spreadable.spreadableAreaHa / field.areaHa;
    organicCreditsKgHa = {
      n: available.value.n * spreadShare,
      p: available.value.p * spreadShare,
      k: available.value.k * spreadShare,
    };
    statutoryOrganic = statutoryOrganicPhosphorus(
      field,
      slurryAllocation.volumeM3,
      spreadable.spreadableAreaHa,
      context.manureOriginByField.get(field.id),
    );
    organicCreditBasis = {
      calculationVersion: NUTRIENT_ENGINE_VERSION,
      allocation: {
        fieldId: slurryAllocation.fieldId,
        housingId: slurryAllocation.housingId,
        volumeM3: slurryAllocation.volumeM3,
        contributing: context.seasonSlurryAllocations
          .filter(
            (allocation) =>
              allocation.fieldId === field.id &&
              allocation.priority !== "not_suitable",
          )
          .map((allocation) => {
            const recordId = context.compositionByHousing.get(
              allocation.housingId,
            )?.id;
            return {
              housingId: allocation.housingId,
              volumeM3: allocation.volumeM3,
              source: allocation.planningSource,
              ...(recordId ? { compositionRecordId: recordId } : {}),
            };
          }),
      },
      applicationMethod: trackedEvidence(slurryAllocation.applicationMethod),
      applicationDate: trackedEvidence(slurryAllocation.applicationDate),
      spreadableArea: {
        areaHa: spreadable.spreadableAreaHa,
        grossAreaHa: spreadable.grossAreaHa,
        basis: spreadable.basis,
        ...(spreadable.recordId ? { recordId: spreadable.recordId } : {}),
        source: spreadable.source,
        ...(spreadable.effectiveDate
          ? { effectiveDate: spreadable.effectiveDate }
          : {}),
        version: spreadable.version,
      },
      applicationRateM3ha,
      dryMatter: {
        dmPct: composition.dmPct,
        status: composition.status,
        source: composition.source,
        ...(composition.sourceDate
          ? { sourceDate: composition.sourceDate }
          : {}),
        ...(composition.compositionRecordId
          ? { compositionRecordId: composition.compositionRecordId }
          : {}),
        compositionVersion: SLURRY_COMPOSITION_VERSION,
      },
      rule: {
        ruleId: available.value.ruleId,
        source: available.value.source,
        timingCategory: available.value.timingCategory,
        timingAssumed: available.value.timingAssumed,
        soilIndexAdjustmentApplied: available.value.soilIndexAdjustmentApplied,
        scientificBasisNote: available.value.scientificBasisNote,
      },
      evidenceState: available.evidenceState,
      creditOnSpreadAreaKgHa: {
        n: available.value.n,
        p: available.value.p,
        k: available.value.k,
      },
      fieldAverageCreditKgHa: organicCreditsKgHa,
      lessTrigger,
    };
  }

  let grazingStockingInput: ReturnType<typeof grazingStockingInputForField> =
    {};
  let grazingSystem: ReturnType<typeof resolveGrazingProductionSystem> | null =
    null;
  if (cycle.cropSystem === "GRASS_GRAZING" || cycle.cropSystem === "GRASS_WHITE_CLOVER_GRAZING") {
    grazingStockingInput = grazingStockingInputForField({
      field,
      livestockGroups: context.livestockGroups,
      sessions: context.grazingSessions,
      season: context.season,
      asOf: context.now,
      ...(context.holdingFallbackKgHa !== undefined
        ? { holdingFallbackKgHa: context.holdingFallbackKgHa }
        : {}),
    });
    // No field-movement evidence and no trustworthy holding fallback: say
    // exactly why rather than letting the engine report a bare gap.
    if (
      grazingStockingInput.annualOrganicNStockingRateKgHa === undefined &&
      context.holdingFallbackUnavailableReason
    )
      return unknown(
        context.holdingFallbackUnavailableReason,
        context.holdingFallbackUnavailableReason ===
          "MISSING_FARM_PRODUCTION_CYCLES_FOR_GRASSLAND_AREA"
          ? ["farmProductionCycles"]
          : ["annualOrganicNStockingRateKgHa"],
      );
    grazingSystem = resolveGrazingProductionSystem({
      farm: context.farm,
      fieldId: field.id,
      cycle,
      sessions: context.grazingSessions,
    });
  }

  const result = calculateGrassFertiliserV2({
    field,
    cycle,
    ...grazingStockingInput,
    ...(grazingSystem?.value
      ? { grazingProductionSystem: grazingSystem.value }
      : {}),
    organicCreditsKgHa,
  });
  if (
    result.status !== "READY" ||
    !result.grossRequirementKgHa ||
    !result.remainingRequirementKgHa ||
    !result.priorChemicalCreditsKgHa
  )
    return {
      status: "UNKNOWN",
      calculationVersion: result.engineVersion,
      reasonCode:
        result.status === "UNSUPPORTED_PATHWAY"
          ? "P3_UNSUPPORTED_PATHWAY"
          : result.status === "SOURCE_CONFLICT"
            ? "P3_SOURCE_CONFLICT"
            : result.status === "READY"
              ? "P3_INCOMPLETE_EVIDENCE"
              : result.status,
      missingInputs: result.missingInputs,
    };
  const ready = {
    ...result,
    grossRequirementKgHa: result.grossRequirementKgHa,
    remainingRequirementKgHa: result.remainingRequirementKgHa,
    priorChemicalCreditsKgHa: result.priorChemicalCreditsKgHa,
  };

  // The statutory P maximum governs everything this plan proposes to put
  // on the field — chemical products and planned slurry alike — so the
  // phosphorus products may deliver is bounded by it whatever the
  // agronomic need (`resolvePhosphorusSupply`).
  const firstAllocation = allocatePurchasedProducts(
    ready.remainingRequirementKgHa.n,
    ready.remainingRequirementKgHa.p,
    ready.remainingRequirementKgHa.k,
    field.areaHa,
  );
  const phosphorus: ReturnType<typeof resolvePhosphorusSupply> =
    firstAllocation.products.length > 0 || statutoryOrganic !== undefined
      ? resolvePhosphorusSupply(
          context,
          field,
          ready.remainingRequirementKgHa,
          ready.priorChemicalCreditsKgHa,
          firstAllocation,
          statutoryOrganic,
        )
      : {
          status: "WITHIN",
          productPKgHa: ready.remainingRequirementKgHa.p,
          strategy: "DEFAULT",
        };
  const productPKgHa =
    phosphorus.status === "WITHIN"
      ? phosphorus.productPKgHa
      : ready.remainingRequirementKgHa.p;
  // The final (and water-strip) allocation uses the same product mix the P
  // budget was checked against.
  const allocator =
    phosphorus.status === "WITHIN" && phosphorus.strategy === "P_CONSTRAINED"
      ? allocatePurchasedProductsPConstrained
      : allocatePurchasedProducts;
  const allocate = (areaHa: number) =>
    allocator(
      ready.remainingRequirementKgHa.n,
      productPKgHa,
      ready.remainingRequirementKgHa.k,
      areaHa,
    );
  const allocation = allocate(field.areaHa);
  const products = allocation.products;
  const limited =
    phosphorus.status === "WITHIN" && phosphorus.limit
      ? {
          ...ready,
          limitations: [...ready.limitations, phosphorus.limit.disclosure],
        }
      : ready;
  const phosphorusLimit =
    phosphorus.status === "WITHIN" && phosphorus.limit
      ? { phosphorusLimit: phosphorus.limit }
      : {};
  // Location gates (commonage, water strip) apply to any chemical
  // fertiliser at all, so a prohibition or unknown location evidence is
  // reported first; then the statutory P maximum.
  const locationLegal =
    firstAllocation.products.length > 0
      ? chemicalFertiliserLegalOutcome(field)
      : undefined;
  if (locationLegal && locationLegal.status !== "PERMITTED")
    return {
      status: "CALCULATED",
      result: limited,
      products,
      ...(organicCreditBasis ? { organicCreditBasis } : {}),
      legal: locationLegal,
    };
  if (phosphorus.status === "BLOCKED")
    return {
      status: "CALCULATED",
      result: limited,
      products,
      ...(organicCreditBasis ? { organicCreditBasis } : {}),
      legal: phosphorus.outcome,
    };
  if (products.length === 0)
    return {
      status: "CALCULATED",
      result: limited,
      products,
      ...(organicCreditBasis ? { organicCreditBasis } : {}),
      ...phosphorusLimit,
      legal: { status: "PERMITTED" },
    };
  const legal = locationLegal ?? chemicalFertiliserLegalOutcome(field);
  // Chemical fertiliser goes only on the area outside the 3 m water strip,
  // so product kg are sized to that area; the kg/ha need is unchanged.
  return {
    status: "CALCULATED",
    result: limited,
    products:
      legal.status === "PERMITTED" && legal.waterStrip
        ? allocate(legal.waterStrip.chemicalAreaHa).products
        : products,
    ...(organicCreditBasis ? { organicCreditBasis } : {}),
    ...phosphorusLimit,
    legal,
  };
}

/** Planned slurry's P on the statutory (not agronomic) ledger, for the
 * Table 15a maximum. */
interface StatutoryOrganicPhosphorus {
  /** Statutory available P per hectare spread, taking the whole planned
   * physical volume as neat cattle slurry. Neat slurry can never exceed
   * the physical volume it is part of, so this is an upper bound: a field
   * within its maximum on this figure is within it on the true one.
   * `undefined` when the statutory value itself cannot be resolved. */
  upperBoundPKgHa: number | undefined;
  /** Evidenced home-produced grazing-livestock manure: the maxima are in
   * addition to it (S.I. 588/2025 Art. 17(8)), so it is not counted. */
  excludedAsHomeProduced: boolean;
}

function soilOrganicMatterOver20Pct(field: Field): boolean {
  const labOrganicMatterPct = field.fertility.verifiedTest?.organicMatterPct;
  return labOrganicMatterPct !== undefined
    ? labOrganicMatterPct > 20
    : field.mappedSoil?.organicCarbonStatus === "peat";
}

function statutoryOrganicPhosphorus(
  field: Field,
  volumeM3: number,
  spreadableAreaHa: number,
  origin: RegulatoryManureOrigin | undefined,
): StatutoryOrganicPhosphorus | undefined {
  const pIndex = field.fertility.pIndex?.value;
  if (!pIndex) return { upperBoundPKgHa: undefined, excludedAsHomeProduced: false };
  const value = statutoryManureNutrientValuePerHa(
    "cattle_slurry",
    volumeM3,
    spreadableAreaHa,
    pIndex,
    soilOrganicMatterOver20Pct(field),
  );
  return {
    upperBoundPKgHa: value.status === "OK" ? value.value.availablePKgHa : undefined,
    excludedAsHomeProduced: manureOriginExcludedFromNapMaxima(origin),
  };
}

/** Products are sized this far under the P budget so the published
 * 0.1 kg/ha product-rate rounding can never carry delivered P over it. */
const P_BUDGET_ROUNDING_MARGIN_KG_HA = 0.01;

/** When the default blend would deliver more P than the field may lawfully
 * receive (an agronomic need above the budget, or the potash product's own
 * P), how the products were limited — carried to every surface that shows
 * the recommendation. */
export interface PhosphorusLimit {
  statutoryMaximumKgHa: number;
  /** HOLDING_GSR: the band from the holding's stocking rate. LOWEST_BAND:
   * the stocking rate is unknown, so the lowest band — lawful in every
   * band — is applied. */
  band: "HOLDING_GSR" | "LOWEST_BAND_GSR_UNKNOWN";
  priorChemicalPKgHa: number;
  /** Planned slurry P counted against the maximum (statutory upper bound),
   * 0 when none or when evidenced home-produced grazing manure. */
  organicPCountedKgHa: number;
  agronomicPNeedKgHa: number;
  productPKgHa: number;
  legislation: string;
  disclosure: string;
}

/**
 * The phosphorus the proposed products may deliver, from the field's
 * statutory P maximum (S.I. 588/2025 Table 15a via the existing
 * `checkNapCompliance` contract) less everything else the field receives:
 * chemical P already applied this season and planned slurry's statutory P
 * (unless evidenced home-produced grazing manure, Art. 17(8)). Checked
 * against the products' real delivered P (published rates,
 * `allocatePurchasedProducts`) in every case — whatever the agronomic need,
 * with no tolerance.
 *
 * - Default blend's delivered P within the budget: unchanged (`DEFAULT`).
 * - Default blend over the budget (an agronomic need above it, or 0-7-30's
 *   own P by-product — e.g. any K need on a P Index 4 field, maximum 0):
 *   the P-constrained allocation (`P_CONSTRAINED`) sizes 18-6-12 to at most
 *   the budget and supplies the remaining K as phosphorus-free Muriate of
 *   Potash, disclosed as a `PhosphorusLimit` (a P need above the budget is
 *   unchanged and shown as not fully met).
 * - Constrained mix still over the budget (a guard; the rounding margin
 *   prevents it): blocked, nothing proposed.
 * - Prior chemical P alone over the maximum: blocked with its own reason —
 *   the field is already over its maximum, never shown as within it.
 * - Only slurry's statutory upper bound takes the field over: the true
 *   figure depends on the slurry's evidenced origin and neat volume, so it
 *   fails closed as unresolved.
 *
 * Without the holding's GSR the lowest Table 15a band applies — lawful in
 * every band. Cut-only Tables 16/17 need written sale evidence this path
 * does not capture, so Table 15a applies (the same fallback
 * `checkNapCompliance` makes); elevated-rate and P build-up eligibility are
 * not asserted.
 */
function resolvePhosphorusSupply(
  context: P3FieldPlanContext,
  field: Field,
  remainingKgHa: NutrientQuantity,
  priorChemicalKgHa: NutrientQuantity,
  firstAllocation: ReturnType<typeof allocatePurchasedProducts>,
  organic: StatutoryOrganicPhosphorus | undefined,
):
  | {
      status: "WITHIN";
      productPKgHa: number;
      /** Which allocator the products must be sized with. */
      strategy: "DEFAULT" | "P_CONSTRAINED";
      limit?: PhosphorusLimit;
    }
  | { status: "BLOCKED"; outcome: P3FieldLegalOutcome } {
  const unresolved = (missingInputs: string[]) => ({
    status: "BLOCKED" as const,
    outcome: {
      status: "UNKNOWN" as const,
      reasonCode: "P3_NAP_P_CEILING_UNRESOLVED",
      missingInputs,
    },
  });
  const exceeded = {
    status: "BLOCKED" as const,
    outcome: {
      status: "UNKNOWN" as const,
      reasonCode: "P3_PRODUCT_P_EXCEEDS_NAP_CEILING",
      missingInputs: [],
    },
  };
  const priorExceeded = {
    status: "BLOCKED" as const,
    outcome: {
      status: "UNKNOWN" as const,
      reasonCode: "P3_PRIOR_CHEMICAL_P_EXCEEDS_NAP_CEILING",
      missingInputs: [],
    },
  };
  const pIndex = field.fertility.pIndex?.value;
  if (!pIndex) return unresolved(["fertility.pIndex"]);
  const band =
    context.holdingFallbackKgHa !== undefined
      ? ("HOLDING_GSR" as const)
      : ("LOWEST_BAND_GSR_UNKNOWN" as const);
  const check = checkNapCompliance(
    "grazing",
    { n: 0, p: 0 },
    context.holdingFallbackKgHa ?? 0,
    pIndex,
    1,
    false,
    false,
    0,
    false,
    soilOrganicMatterOver20Pct(field),
  );
  const ceiling = check.pCeilingKgHa;
  const organicUnknownOrigin =
    organic !== undefined && !organic.excludedAsHomeProduced;
  if (organicUnknownOrigin && organic.upperBoundPKgHa === undefined)
    return unresolved(["slurry.statutoryNutrientValue"]);
  const organicCounted = organicUnknownOrigin
    ? (organic.upperBoundPKgHa ?? 0)
    : 0;
  const prior = priorChemicalKgHa.p;
  if (prior > ceiling) return priorExceeded;
  const budget = ceiling - prior - organicCounted;
  const originMayLower = organicUnknownOrigin && organicCounted > 0;
  if (budget < 0)
    return unresolved(["slurry.regulatoryOrigin", "slurry.regulatoryNeatVolume"]);
  if (firstAllocation.deliveredKgHa.p <= budget)
    return {
      status: "WITHIN",
      productPKgHa: remainingKgHa.p,
      strategy: "DEFAULT",
    };

  const productPKgHa = Math.max(
    0,
    Math.min(remainingKgHa.p, budget - P_BUDGET_ROUNDING_MARGIN_KG_HA),
  );
  const resized = allocatePurchasedProductsPConstrained(
    remainingKgHa.n,
    productPKgHa,
    remainingKgHa.k,
    field.areaHa,
  );
  if (resized.deliveredKgHa.p > budget)
    return originMayLower
      ? unresolved(["slurry.regulatoryOrigin", "slurry.regulatoryNeatVolume"])
      : exceeded;
  const parts = [
    prior > 0 ? `${prior.toFixed(1)} kg P/ha already applied` : undefined,
    organicCounted > 0
      ? `up to ${organicCounted.toFixed(1)} kg P/ha from planned slurry (statutory value)`
      : undefined,
  ].filter((part): part is string => part !== undefined);
  const basis = `${check.legislation}${
    band === "LOWEST_BAND_GSR_UNKNOWN"
      ? "; the farm's stocking rate is unknown, so the lowest stocking-rate band is applied"
      : ""
  }${parts.length > 0 ? `; counting ${parts.join(" and ")}` : ""}`;
  const pFreePotash = resized.products.some(
    (product) => product.name === MURIATE_OF_POTASH_PRODUCT_NAME,
  );
  const potashNote = pFreePotash
    ? " Potash is supplied as phosphorus-free Muriate of Potash (0-0-50)."
    : "";
  // A shortfall exists only where the budget, not the need, sized the P.
  const disclosure =
    productPKgHa < remainingKgHa.p
      ? `Phosphorus products are limited to ${resized.deliveredKgHa.p.toFixed(1)} kg P/ha so the field stays within its legal maximum of ${ceiling} kg P/ha (${basis}). The agronomic need of ${remainingKgHa.p.toFixed(1)} kg P/ha is not fully met.${potashNote}`
      : `${
          pFreePotash
            ? "Phosphorus-free potash (Muriate of Potash, 0-0-50) was selected"
            : "Products were selected"
        } so the field stays within its legal maximum of ${ceiling} kg P/ha (${basis}). ${
          remainingKgHa.p > 0
            ? `The agronomic need of ${remainingKgHa.p.toFixed(1)} kg P/ha is met.`
            : "No phosphorus is needed agronomically."
        }`;
  return {
    status: "WITHIN",
    productPKgHa,
    strategy: "P_CONSTRAINED",
    limit: {
      statutoryMaximumKgHa: ceiling,
      band,
      priorChemicalPKgHa: prior,
      organicPCountedKgHa: organicCounted,
      agronomicPNeedKgHa: remainingKgHa.p,
      productPKgHa: resized.deliveredKgHa.p,
      legislation: check.legislation,
      disclosure,
    },
  };
}

/**
 * Statutory gates for a planned slurry application, composed only from the
 * existing gates: closed-period calendar, national buffer distances, the
 * local-authority buffer determination (`checkLocalBufferOverrideWithEvidence`)
 * and the LESS method requirement (`checkLessMethodGate`, S.I. 588/2025
 * Art. 19(1)(b)). Returns the blocking reason, or `undefined` only when
 * every gate is resolved and none stands in the way — a national-distance
 * pass alone is never treated as complete approval.
 */
function plannedSlurryLegalOutcome(input: {
  farm: Farm;
  field: Field;
  applicationDate: string;
  applicationMethod: NonNullable<SlurryAllocation["applicationMethod"]>["value"];
  /** The preceding-year stocking-rate evidence for the LESS trigger. */
  lessTrigger: PrecedingYearGsrResolution;
  landUse: "grass" | "arable";
}): string | undefined {
  const { farm, field, applicationDate } = input;
  const calendar = checkSpreadingWindowGate({
    county: normaliseCountyForZoneLookup(farm.location.county),
    date: applicationDate,
    material: "organic_fertiliser_other_than_FYM",
  });
  if (calendar.status === "LEGAL_PROHIBITION")
    return "P3_PLANNED_SLURRY_IN_CLOSED_PERIOD";
  if (calendar.status !== "OK") return "P3_PLANNED_SLURRY_DATE_UNRESOLVED";

  // Missing, null or non-finite distance is unknown evidence — never a
  // 0 m prohibition (null < n) nor a pass (NaN < n is false), as for the
  // chemical-fertiliser strip.
  const buffer = field.waterBufferContext?.value;
  if (
    buffer?.featureType === undefined ||
    typeof buffer.distanceM !== "number" ||
    !Number.isFinite(buffer.distanceM)
  )
    return "MISSING_NATIONAL_BUFFER_ASSESSMENT";
  const atBaseline = checkNationalBufferDistance({
    material: "organic_fertiliser_or_soiled_water",
    feature: buffer.featureType,
    distanceM: buffer.distanceM,
  });
  if (atBaseline.status === "LEGAL_PROHIBITION")
    return "P3_PLANNED_SLURRY_WITHIN_WATER_BUFFER";
  // The elevated surface-water distance applies around the closed period
  // and on steep ground toward water. Neither is resolved here, so a field
  // that only meets the baseline distance fails closed rather than passing.
  const atElevated = checkNationalBufferDistance({
    material: "organic_fertiliser_or_soiled_water",
    feature: buffer.featureType,
    distanceM: buffer.distanceM,
    enhancedPeriod: true,
  });
  if (atElevated.status === "LEGAL_PROHIBITION")
    return "P3_PLANNED_SLURRY_BUFFER_UNRESOLVED";

  // The local authority may set a wider organic-fertiliser buffer than the
  // national baseline. An unknown or incomplete determination is
  // unresolved evidence, so the credit is not admitted.
  const local = checkLocalBufferOverrideWithEvidence({
    actualDistanceM: buffer.distanceM,
    localOverrideStatus: resolveLocalWaterBufferOverrideStatus(field),
    localOverrideDistanceM: buffer.localOverrideDistanceM,
  });
  if (local.status === "LEGAL_PROHIBITION")
    return "P3_PLANNED_SLURRY_WITHIN_LOCAL_BUFFER";
  if (local.status !== "OK") return "P3_PLANNED_SLURRY_LOCAL_BUFFER_UNRESOLVED";

  // LESS: the GSR ≥ 100 trigger is defined on the PREVIOUS year's
  // stocking rate. Without that season-bound evidence the trigger cannot be
  // evaluated, so a non-LESS method is unresolved rather than a pass — the
  // current herd is never a substitute (it can hide an obligation).
  if (
    input.applicationMethod !== "LESS" &&
    input.lessTrigger.status !== "RESOLVED"
  )
    return "P3_PLANNED_SLURRY_METHOD_UNRESOLVED";
  const less = checkLessMethodGate({
    material: "cattle_slurry",
    ...(input.lessTrigger.status === "RESOLVED"
      ? { gsrKgNHa: input.lessTrigger.gsrKgNHa }
      : {}),
    landUse: input.landUse,
    method: input.applicationMethod,
  });
  if (less.status === "LEGAL_PROHIBITION")
    return "P3_PLANNED_SLURRY_LESS_REQUIRED";
  if (less.status !== "OK" && less.status !== "NOT_APPLICABLE")
    return "P3_PLANNED_SLURRY_METHOD_UNRESOLVED";
  return undefined;
}

function chemicalFertiliserLegalOutcome(field: Field): P3FieldLegalOutcome {
  const commonage = checkCommonageFertiliserGate(
    requireCommonageStatus(field),
    "chemical_fertiliser",
  );
  if (commonage.status === "LEGAL_PROHIBITION")
    return {
      status: "PROHIBITED",
      reasonCode: "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED",
    };
  if (commonage.status !== "NOT_APPLICABLE")
    return {
      status: "UNKNOWN",
      reasonCode:
        "reasonCode" in commonage
          ? commonage.reasonCode
          : "P3_COMMONAGE_GATE_UNRESOLVED",
      missingInputs: ["FIELD_COMMONAGE_STATUS"],
    };
  // S.I. 588/2025 Article 18(1): chemical fertiliser is excluded within
  // 3 m of surface waters — a strip, not the whole field. Missing, null or
  // non-finite distance is unknown evidence (never a 0 m strip nor a pass),
  // the same evidence test quote readiness uses.
  const water = field.waterBufferContext?.value;
  const strip = resolveChemicalFertiliserWaterStrip({
    fieldPolygon: field.polygon,
    fieldAreaHa: field.areaHa,
    featureType: water?.featureType,
    distanceM: water?.distanceM,
    waterLines: water?.chemicalStripWaterLines,
  });
  if (strip.status === "UNKNOWN")
    return {
      status: "UNKNOWN",
      reasonCode: strip.reasonCode,
      missingInputs: strip.missingInputs,
    };
  if (strip.status === "WHOLE_FIELD_WITHIN_STRIP")
    return {
      status: "PROHIBITED",
      reasonCode: "WATER_BUFFER_CHEMICAL_FERTILISER_PROHIBITED",
    };
  if (strip.status === "STRIP_EXCLUDED")
    return {
      status: "PERMITTED",
      waterStrip: {
        chemicalAreaHa: strip.chemicalAreaHa,
        excludedStripHa: strip.excludedStripHa,
        ruleId: strip.provenance.ruleId,
        source: strip.provenance.source,
      },
    };
  return { status: "PERMITTED" };
}

export async function getFieldFertiliserStatusAction(
  fieldId: string,
  planningSeason?: string,
): Promise<FieldFertiliserStatusResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm)
    throw new Error(
      "getFieldFertiliserStatusAction: no real farm for the current session",
    );

  const now = new Date().toISOString();
  const evidence = await loadP3PlanningEvidence(farm, now);
  const { fields } = evidence;
  const field = fields.find((candidate) => candidate.id === fieldId);
  if (!field)
    throw new Error(
      "getFieldFertiliserStatusAction: field " +
        fieldId +
        " not found on the current session's farm",
    );

  const currentSeason = now.slice(0, 4);
  const season = planningSeason ?? currentSeason;

  let cycles: P3Cycle[];
  let cycle: Awaited<ReturnType<typeof getFieldProductionCycle>>;
  if (season > currentSeason) {
    cycles = await loadPlanningSeasonCycles(
      fields.map((candidate) => candidate.id),
      season,
      currentSeason,
    );
    cycle = cycles.find((candidate) => candidate.fieldId === field.id) ?? null;
  } else {
    [cycle, cycles] = await Promise.all([
      getFieldProductionCycle(field.id, season),
      listFieldProductionCyclesForSeason(
        fields.map((candidate) => candidate.id),
        season,
      ),
    ]);
  }

  if (!cycle)
    return { status: "blocked", reasonCode: "MISSING_FIELD_PRODUCTION_CYCLE" };

  const outcome = calculateP3FieldPlan(
    buildP3FieldPlanContext({
      farm,
      fields,
      cycles,
      evidence,
      slurry: "CANONICAL",
      season,
      now,
    }),
    field,
  );
  if (outcome.status === "UNKNOWN")
    return { status: "blocked", reasonCode: outcome.reasonCode };
  if (outcome.legal.status === "PROHIBITED")
    return { status: "prohibited", reasonCode: outcome.legal.reasonCode };
  if (outcome.legal.status === "UNKNOWN")
    return { status: "blocked", reasonCode: outcome.legal.reasonCode };

  const { result, products, legal, organicCreditBasis, phosphorusLimit } =
    outcome;
  return {
    status: "ok",
    ...(legal.waterStrip ? { waterStrip: legal.waterStrip } : {}),
    ...(organicCreditBasis ? { organicCreditBasis } : {}),
    ...(phosphorusLimit ? { phosphorusLimit } : {}),
    engineVersion: result.engineVersion,
    cropSystem: result.cropSystem,
    requirementKgHa: result.grossRequirementKgHa,
    organicCreditsKgHa: result.organicCreditsKgHa ?? { n: 0, p: 0, k: 0 },
    confirmedAppliedKgHa: result.priorChemicalCreditsKgHa,
    remainingKgHa: result.remainingRequirementKgHa,
    recommendedProducts: products,
    ruleTraces: result.traces,
    limitations: result.limitations,
    confirmedApplications: 0,
    applicationsWithUnknownComposition: 0,
    applicationsExcludedMultiField: 0,
    truncated: false,
  };
}

/**
 * Farm-wide fertiliser demand (campaign items 19/20) — the real
 * recommended/planned/confirmed/remaining totals by product for this
 * farm, shaped as `FarmInputDemand[]` for a later commercial demand-
 * aggregation system to consume without reinterpreting fertiliser
 * science (`toFarmInputDemand`'s own doc comment,
 * `src/domain/fertiliser-plan.ts`). No supplier/purchasing behaviour is
 * built here — this action only ever returns this farm's own read-only
 * summary, farm-scoped like every other action in this file.
 */
export type FarmFertiliserDemandFieldCalculation =
  | {
      fieldId: string;
      fieldName: string;
      areaHa: number;
      status: "OK";
      engineVersion: string;
      cropSystem: string;
      requirementKgHa: FertiliserNutrientContributionKg;
      organicCreditsKgHa: FertiliserNutrientContributionKg;
      remainingKgHa: FertiliserNutrientContributionKg;
      /** The area chemical fertiliser is sized to: the field area less any
       * 3 m surface-water strip (S.I. 588/2025 Article 18(1)). */
      chemicalAreaHa: number;
      waterStrip?: ChemicalWaterStripExclusion;
      /** How `organicCreditsKgHa` was calculated, when slurry is credited. */
      organicCreditBasis?: OrganicCreditBasis;
      /** Present when products were limited to the statutory P maximum. */
      phosphorusLimit?: PhosphorusLimit;
    }
  | {
      fieldId: string;
      fieldName: string;
      areaHa: number;
      status: "BLOCKED_INSUFFICIENT_EVIDENCE";
      reasonCode: string;
    };

/**
 * Canonical farm-demand result. fieldCalculations is populated by the P3
 * grass engine from the SAME field pass that produces product contributions.
 * Overview surfaces should consume it instead of recalculating each field.
 */
export interface FarmFertiliserDemandActionResult {
  demand: FarmInputDemand[];
  fieldCalculations?: FarmFertiliserDemandFieldCalculation[];
  /**
   * Fertiliser Vertical V1, Checkpoint 3 (item D/E) — the same real
   * per-product kg totals above, converted to tonnes for the farm-wide
   * Purchase Requirement screen. Never a second, independently-derived
   * figure — `toFarmFertiliserPurchaseRequirementTonnes` only converts
   * the exact kg totals `getFarmFertiliserDemand` already computed
   * (`demand` above, pre-`toFarmInputDemand` mapping), so a farmer
   * cross-checking this screen's tonnes against any kg-based screen
   * elsewhere in the app will always find them consistent to within
   * this module's own documented 10 kg rounding precision.
   */
  purchaseRequirementTonnes: FarmFertiliserPurchaseRequirementLine[];
  /** True when a real, farm-scoped read this aggregation depends on
   * (planned Decisions or confirmed Actuals) hit its own row cap — the
   * totals above may understate the truth. */
  truncated: boolean;
  /** Codex audit MEDIUM (round 21) — real count of confirmed
   * fertiliser_spreading Actuals, farm-wide, whose quantity could not be
   * resolved to a real kg figure (most commonly an unverified "bags"
   * unit) and were therefore silently excluded from
   * `confirmedRequirementKg`/`remainingRequirementKg` above — see
   * `getFarmFertiliserDemand`'s own identical field for the full
   * account. Greater than zero means those totals are real lower/upper
   * bounds, never presented as exact. */
  applicationsWithUnknownComposition: number;
  /** Codex audit HIGH (round 22) — real count of fields excluded from
   * this farm's Recommended total purely because their own real Prompt
   * classification came back blocked (most commonly a grazing field
   * with no recorded livestock) — see `getFarmFertiliserDemand`'s own
   * identical field for the full account. Greater than zero means these
   * totals genuinely understate the truth, never indistinguishable from
   * a farm that needs no fertiliser at all. */
  fieldsWithBlockedEvidence: number;
  /** Session 3b — the canonical whole-farm aggregation (field
   * classification, per-product totals with field contributions) and the
   * quote-ready basket built from it. Review only: nothing is persisted or
   * sent to any supplier. */
  aggregation: FarmFertiliserAggregation;
  basket: FarmFertiliserQuoteBasket;
}

function buildP3FarmFertiliserDemandResult(input: {
  farm: Farm;
  evidence: P3PlanningEvidence;
  slurry: P3SlurrySelection;
  now: string;
  p3Cycles: readonly P3Cycle[];
  planningSeason: string;
}): FarmFertiliserDemandActionResult {
  const { farm, evidence, now, p3Cycles, planningSeason } = input;
  const { fields } = evidence;
  const context = buildP3FieldPlanContext({
    farm,
    fields,
    cycles: p3Cycles,
    evidence,
    slurry: input.slurry,
    season: planningSeason,
    now,
  });
  let fieldsWithBlockedEvidence = 0;
  const fieldCalculationsById = new Map<
    string,
    FarmFertiliserDemandFieldCalculation
  >();

  const aggregationInputs = fields.map((field) => {
    const outcome = calculateP3FieldPlan(context, field);
    const entry = (
      calculationVersion: string,
      purchaseStatus: FieldPurchaseStatus,
      purchasedProducts: FertiliserProduct[] = [],
    ) => ({
      fieldId: field.id,
      fieldName: field.name,
      plan: { calculationVersion, purchaseStatus, purchasedProducts },
    });
    if (outcome.status === "UNKNOWN") {
      fieldsWithBlockedEvidence++;
      fieldCalculationsById.set(field.id, {
        fieldId: field.id,
        fieldName: field.name,
        areaHa: field.areaHa,
        status: "BLOCKED_INSUFFICIENT_EVIDENCE",
        reasonCode: outcome.reasonCode,
      });
      return entry(outcome.calculationVersion, {
        status: "UNKNOWN",
        reasonCode: outcome.reasonCode,
        missingInputs: outcome.missingInputs,
      });
    }

    const { result, products, legal } = outcome;
    fieldCalculationsById.set(field.id, {
      fieldId: field.id,
      fieldName: field.name,
      areaHa: field.areaHa,
      status: "OK",
      engineVersion: result.engineVersion,
      cropSystem: result.cropSystem,
      requirementKgHa: result.grossRequirementKgHa,
      organicCreditsKgHa: result.organicCreditsKgHa ?? { n: 0, p: 0, k: 0 },
      remainingKgHa: result.remainingRequirementKgHa,
      chemicalAreaHa:
        legal.status === "PERMITTED" && legal.waterStrip
          ? legal.waterStrip.chemicalAreaHa
          : field.areaHa,
      ...(legal.status === "PERMITTED" && legal.waterStrip
        ? { waterStrip: legal.waterStrip }
        : {}),
      ...(outcome.organicCreditBasis
        ? { organicCreditBasis: outcome.organicCreditBasis }
        : {}),
      ...(outcome.phosphorusLimit
        ? { phosphorusLimit: outcome.phosphorusLimit }
        : {}),
    });
    // An unresolved legal outcome (including planned slurry over the P
    // maximum with nothing to buy) is never "nothing needed".
    if (legal.status === "UNKNOWN") {
      fieldsWithBlockedEvidence++;
      return entry(result.engineVersion, {
        status: "UNKNOWN",
        reasonCode: legal.reasonCode,
        missingInputs: legal.missingInputs,
      });
    }
    if (products.length === 0)
      return entry(result.engineVersion, {
        status: "NONE_NEEDED",
        basis: "REMAINING_ZERO",
      });
    if (legal.status === "PROHIBITED")
      return entry(result.engineVersion, {
        status: "PROHIBITED",
        reasonCode: legal.reasonCode,
      });
    return entry(
      result.engineVersion,
      { status: "RECOMMENDED" },
      products,
    );
  });

  const aggregation = aggregateFarmFertiliserPurchasing(aggregationInputs);
  const recommended = toFarmFertiliserProductTotals(aggregation);
  const demand = aggregateFarmFertiliserDemand(
    recommended,
    new Map(),
    new Map(),
  );
  return {
    demand: demand.map((row) => toFarmInputDemand(farm.id, row)),
    fieldCalculations: fields
      .map((field) => fieldCalculationsById.get(field.id))
      .filter(
        (value): value is FarmFertiliserDemandFieldCalculation =>
          value !== undefined,
      ),
    purchaseRequirementTonnes:
      toFarmFertiliserPurchaseRequirementTonnes(demand),
    truncated: false,
    applicationsWithUnknownComposition: 0,
    fieldsWithBlockedEvidence,
    aggregation,
    basket: buildFarmFertiliserQuoteBasket(aggregation, {
      farmId: farm.id,
      createdAt: now,
    }),
  };
}

export async function getFarmFertiliserDemandAction(
  planningSeason?: string,
): Promise<FarmFertiliserDemandActionResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm)
    throw new Error(
      "getFarmFertiliserDemandAction: no real farm for the current session",
    );

  const now = new Date().toISOString();
  const evidence = await loadP3PlanningEvidence(farm, now);
  const { fields } = evidence;
  const currentSeason = now.slice(0, 4);
  const targetSeason = planningSeason ?? currentSeason;
  const p3Cycles = await loadPlanningSeasonCycles(
    fields.map((field) => field.id),
    targetSeason,
    currentSeason,
  );

  if (p3Cycles.length > 0 || targetSeason > currentSeason) {
    // Physical reservations and the season's adopted forecast intent
    // (`planningSeasonSlurryAllocations`) — the procurement and quote basis.
    return buildP3FarmFertiliserDemandResult({
      farm,
      evidence,
      slurry: "CANONICAL",
      now,
      p3Cycles,
      planningSeason: targetSeason,
    });
  }

  const {
    demand,
    truncated,
    applicationsWithUnknownComposition,
    fieldsWithBlockedEvidence,
    aggregation,
  } = await getFarmFertiliserDemand({
    farmId: farm.id,
    fields,
    livestockGroups: evidence.livestockGroups,
    grazingProductionSystem: farm.grazingProductionSystem?.value,
    slurryAllocations: evidence.physicalAllocationRecords,
    pBuildUpCompliance: farm.pBuildUpCompliance?.value,
    slurryCompositionRecords: evidence.slurryCompositionRecords,
    asOfDate: now,
  });
  return {
    demand: demand.map((d) => toFarmInputDemand(farm.id, d)),
    purchaseRequirementTonnes:
      toFarmFertiliserPurchaseRequirementTonnes(demand),
    truncated,
    applicationsWithUnknownComposition,
    fieldsWithBlockedEvidence,
    aggregation,
    basket: buildFarmFertiliserQuoteBasket(aggregation, {
      farmId: farm.id,
      createdAt: now,
    }),
  };
}

export interface AutomaticSlurryFieldRecommendation {
  fieldId: string;
  fieldName: string;
  housingId: string;
  storeName: string;
  applicationDate: string;
  applicationMethod: "LESS" | "splashplate";
  /** Why this method: the preceding-year stocking-rate evidence for the
   * LESS trigger, or LESS because that evidence is not recorded. */
  methodBasis: PrecedingYearGsrResolution;
  /** m³/ha on the spreadable area. */
  rateM3ha: number;
  volumeM3: number;
  spreadableAreaHa: number;
  spreadableAreaBasis: "SPREADABLE_AREA_DECLARATION" | "MAPPED_FIELD_DEFAULT";
  /** Available N/P/K per hectare spread. */
  availableNpkKgHa: { n: number; p: number; k: number };
  /** Chemical product cost for the field without slurry and with this
   * exact recommended volume, both from the canonical field calculation. */
  baselineChemicalCostEur: number;
  withSlurryChemicalCostEur: number;
  estimatedChemicalSavingEur: number;
  estimatedSavingEurPerM3: number;
  basis: "P3_PURCHASE_REDUCTION";
}

export type AutomaticSlurryPlanActionResult =
  | { status: "blocked"; reasonCode: string; message: string }
  | {
      status: "ready";
      planningDate: string;
      expectedAvailableM3: number;
      allocatedM3: number;
      unallocatedM3: number;
      recommendations: AutomaticSlurryFieldRecommendation[];
      excludedFields: {
        fieldId: string;
        fieldName: string;
        reasonCode: string;
        message: string;
      }[];
      limitations: string[];
    };

function isoAddDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextSupportedSpringSlurryDate(
  county: string,
  fromDate: string,
): string | undefined {
  const normalisedCounty = normaliseCountyForZoneLookup(county);
  const startYear = Number(fromDate.slice(0, 4));
  for (let yearOffset = 0; yearOffset <= 2; yearOffset++) {
    const year = startYear + yearOffset;
    const start = `${year}-01-01`;
    for (let i = 0; i < 120; i++) {
      const date = isoAddDays(start, i);
      if (date.slice(0, 4) !== String(year) || Number(date.slice(5, 7)) > 4)
        break;
      if (date < fromDate) continue;
      const gate = checkClosedPeriodCalendar({
        county: normalisedCounty,
        date,
        material: "organic_fertiliser_other_than_FYM",
      });
      if (gate.status === "OK") return date;
    }
  }
  return undefined;
}

function roundDown1(value: number): number {
  return Math.floor((value + 1e-9) * 10) / 10;
}

/** Upper bound for the rate search on a per-m³ (linear) availability
 * rule. Not an agronomic limit: the requirement caps the rate long before
 * it; this only bounds the search. */
const AUTOMATIC_SLURRY_SEARCH_MAX_M3_HA = 500;

function productsCostEur(products: readonly FertiliserProduct[]): number {
  return products.reduce((sum, product) => sum + product.costEur, 0);
}

/**
 * P3-native automatic slurry plan. This deliberately does not persist an
 * allocation: it is a planning recommendation. Every figure — eligibility,
 * the spreadable area the rate is sized on, the legal gates, the credit and
 * the chemical cost with and without slurry — comes from the canonical
 * field calculation (`calculateP3FieldPlan`) the plan and quotes use, and
 * the cost is recomputed for the final, supply-limited volume.
 */
export async function getAutomaticSlurryPlanAction(
  requestedPlanningDate?: string,
): Promise<AutomaticSlurryPlanActionResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm)
    throw new Error(
      "getAutomaticSlurryPlanAction: no real farm for the current session",
    );
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const planningDate =
    requestedPlanningDate ??
    nextSupportedSpringSlurryDate(farm.location.county, today);
  if (!planningDate)
    return {
      status: "blocked",
      reasonCode: "NO_SUPPORTED_SPRING_WINDOW",
      message:
        "Farm Return could not resolve a supported spring slurry date from the current county calendar.",
    };
  const planningMonth = Number(planningDate.slice(5, 7));
  const calendarGate = checkClosedPeriodCalendar({
    county: normaliseCountyForZoneLookup(farm.location.county),
    date: planningDate,
    material: "organic_fertiliser_other_than_FYM",
  });
  if (planningMonth < 1 || planningMonth > 4 || calendarGate.status !== "OK") {
    return {
      status: "blocked",
      reasonCode: "UNSUPPORTED_SLURRY_PLANNING_DATE",
      message:
        "Automatic slurry allocation currently uses a supported, baseline-open spring application date (January-April).",
    };
  }

  const [evidence, housing] = await Promise.all([
    loadP3PlanningEvidence(farm, now),
    listHousingForFarm(farm.id),
  ]);
  const { fields } = evidence;
  const season = planningDate.slice(0, 4);
  const currentSeason = now.slice(0, 4);
  const p3Cycles = await loadPlanningSeasonCycles(
    fields.map((field) => field.id),
    season,
    currentSeason,
  );
  if (p3Cycles.length === 0) {
    return {
      status: "blocked",
      reasonCode: "MISSING_PRODUCTION_CYCLES",
      message: `No field has enough production-cycle evidence for an automatic slurry recommendation in ${season}.`,
    };
  }

  const forecast = buildFarmSlurryForecast({
    housing,
    livestockGroups: evidence.livestockGroups,
    allocations: evidence.physicalAllocationRecords,
    asOfDate: today,
    targetDate: planningDate,
  });
  if (forecast.status !== "READY") {
    return {
      status: "blocked",
      reasonCode: "INCOMPLETE_SLURRY_FORECAST",
      message: `${forecast.blockedStoreCount} store${forecast.blockedStoreCount === 1 ? " is" : "s are"} missing evidence needed for an automatic slurry plan.`,
    };
  }
  if (forecast.projectedAvailableForNewPlanM3 <= 0) {
    return {
      status: "blocked",
      reasonCode: "NO_PROJECTED_SLURRY_AVAILABLE",
      message: `No unallocated slurry is projected to be available on ${planningDate}.`,
    };
  }

  // The same base context the plan uses, with no slurry: each candidate is
  // evaluated by replacing only the slurry it credits.
  const baseContext = buildP3FieldPlanContext({
    farm,
    fields,
    cycles: p3Cycles,
    evidence,
    slurry: [],
    season,
    now,
  });
  // LESS is chosen unless the preceding year's stocking rate is evidenced
  // below the trigger — never inferred from the current herd.
  const methodBasis = resolvePrecedingYearGsr(
    baseContext.precedingYearGsrRecords,
    planningDate,
  );
  const applicationMethod: "LESS" | "splashplate" =
    methodBasis.status === "RESOLVED" &&
    checkLessMethodGate({
      gsrKgNHa: methodBasis.gsrKgNHa,
      material: "cattle_slurry",
      landUse: "grass",
      method: "splashplate",
    }).status !== "LEGAL_PROHIBITION"
      ? "splashplate"
      : "LESS";

  // The rate range the method's availability rule supports: for the Table
  // 9-8 splashplate rule only its tabulated rows, never the clamped edges.
  const rateRange =
    applicationMethod === "splashplate"
      ? SLURRY_TABLE_9_8_RATE_RANGE_M3_HA
      : { min: 0.1, max: AUTOMATIC_SLURRY_SEARCH_MAX_M3_HA };

  const storeRemaining = new Map<string, number>();
  for (const sf of forecast.stores) {
    if (sf.status !== "READY") continue;
    storeRemaining.set(sf.housingId, sf.projectedAvailableForNewPlanM3);
  }
  const excludedFields: {
    fieldId: string;
    fieldName: string;
    reasonCode: string;
    message: string;
  }[] = [];
  const exclude = (field: Field, reasonCode: string, message?: string) =>
    excludedFields.push({
      fieldId: field.id,
      fieldName: field.name,
      reasonCode,
      message: message ?? unknownReasonMessage(reasonCode),
    });

  /** The canonical calculation for this field crediting exactly `volumeM3`
   * from `storeId`, or the reason it cannot be recommended. A candidate has
   * no origin declaration, so its statutory P counts against the field's
   * maximum (origin is never inferred from the herd or the store). */
  const evaluate = (
    field: Field,
    storeId: string,
    volumeM3: number,
  ):
    | {
        status: "OK";
        withSlurryCostEur: number;
        creditOnSpreadAreaKgHa: NutrientQuantity;
      }
    | { status: "EXCLUDED"; reasonCode: string } => {
    const sourceNote = "Farm Return automatic slurry planning";
    const outcome = calculateP3FieldPlan(
      {
        ...baseContext,
        seasonSlurryAllocations: [
          {
            fieldId: field.id,
            housingId: storeId,
            volumeM3,
            applicationMethod: tracked(applicationMethod, "estimated", sourceNote),
            applicationDate: tracked(planningDate, "estimated", sourceNote),
            planningSource: { kind: "AUTOMATIC_CANDIDATE", planningDate },
          },
        ],
        manureOriginByField: new Map(),
      },
      field,
    );
    if (outcome.status === "UNKNOWN")
      return { status: "EXCLUDED", reasonCode: outcome.reasonCode };
    if (outcome.legal.status !== "PERMITTED" || !outcome.organicCreditBasis)
      return {
        status: "EXCLUDED",
        reasonCode:
          outcome.legal.status === "PERMITTED"
            ? "P3_INCOMPLETE_SLURRY_EVIDENCE"
            : outcome.legal.reasonCode,
      };
    return {
      status: "OK",
      withSlurryCostEur: productsCostEur(outcome.products),
      creditOnSpreadAreaKgHa: outcome.organicCreditBasis.creditOnSpreadAreaKgHa,
    };
  };

  type Candidate = AutomaticSlurryFieldRecommendation & {
    desiredVolumeM3: number;
  };
  const candidates: Candidate[] = [];
  for (const field of fields) {
    const cycle = baseContext.cycleByFieldId.get(field.id);
    if (!cycle) {
      exclude(
        field,
        "MISSING_PRODUCTION_CYCLE",
        "No current production cycle is recorded for this field, so it was not ranked.",
      );
      continue;
    }
    if (cropFamilyFor(cycle.cropSystem) !== "grassland") {
      exclude(
        field,
        "NON_GRASSLAND",
        "The automatic slurry allocator currently supports grassland fields only.",
      );
      continue;
    }
    if (!field.fertility.pIndex?.value || !field.fertility.kIndex?.value) {
      exclude(
        field,
        "MISSING_SOIL_INDEX",
        "A verified P and K Index is required before Farm Return can recommend a slurry rate.",
      );
      continue;
    }
    // Mapped no-spread exclusions govern the rate: a zero, stale,
    // conflicting or invalid declaration excludes the field outright.
    const spreadable = resolveSlurrySpreadableArea(
      field,
      baseContext.spreadableAreaByField.get(field.id),
      baseContext.spreadableAreaRecords,
    );
    if (spreadable.status !== "RESOLVED") {
      exclude(field, spreadable.reasonCode);
      continue;
    }
    // The same statutory gates a saved or previewed allocation must pass.
    const slurryLegal = plannedSlurryLegalOutcome({
      farm,
      field,
      applicationDate: planningDate,
      applicationMethod,
      lessTrigger: methodBasis,
      landUse: "grass",
    });
    if (slurryLegal) {
      exclude(field, slurryLegal);
      continue;
    }

    const baseline = calculateP3FieldPlan(baseContext, field);
    if (baseline.status === "UNKNOWN") {
      exclude(field, baseline.reasonCode);
      continue;
    }
    const gross = baseline.result.grossRequirementKgHa;
    const soilPIndex = field.fertility.pIndex.value;
    const soilKIndex = field.fertility.kIndex.value;
    const baselineCostEur = productsCostEur(baseline.products);
    let lastExclusion: string | undefined;

    for (const store of housing) {
      const availableStore = storeRemaining.get(store.id) ?? 0;
      if (availableStore <= 0 || store.shedType !== "slatted") continue;
      const composition = resolveEffectiveSlurryComposition(
        baseContext.compositionByHousing.get(store.id),
      );
      const sourceNote = "Farm Return automatic slurry planning";
      const creditAt = (rateM3ha: number) =>
        resolveAvailableSlurryNutrients({
          allocation: {
            applicationMethod: tracked(applicationMethod, "estimated", sourceNote),
            applicationDate: tracked(planningDate, "estimated", sourceNote),
          },
          applicationRateM3ha: rateM3ha,
          dmPct: composition.dmPct,
          dmPctStatus: composition.status,
          pIndex: soilPIndex,
          kIndex: soilKIndex,
        });
      // Per hectare spread, slurry alone never supplies more of any
      // nutrient than the field's gross requirement. The rate is found
      // on the canonical availability curve itself — never extrapolated
      // from a per-m³ figure — and, for the Table 9-8 splashplate rule,
      // only inside its tabulated range, where it is not clamped.
      const withinRequirement = (rateM3ha: number): boolean | undefined => {
        const credit = creditAt(rateM3ha);
        if (credit.status !== "OK") return undefined;
        return (["n", "p", "k"] as const).every(
          (key) => credit.value[key] <= gross[key] + 1e-9,
        );
      };
      const range = rateRange;
      const atMin = withinRequirement(range.min);
      if (atMin === undefined) {
        const credit = creditAt(range.min);
        lastExclusion =
          credit.status !== "OK" && "reasonCode" in credit
            ? credit.reasonCode
            : "SLURRY_NUTRIENT_CREDIT_UNAVAILABLE";
        continue;
      }
      if (!atMin) {
        lastExclusion = "SLURRY_MINIMUM_RATE_EXCEEDS_REQUIREMENT";
        continue;
      }
      let low = range.min;
      let high = range.max;
      if (withinRequirement(high)) low = high;
      else
        for (let i = 0; i < 40; i++) {
          const mid = (low + high) / 2;
          if (withinRequirement(mid)) low = mid;
          else high = mid;
        }
      const usefulRate = roundDown1(low);
      if (applicationMethod === "splashplate" && usefulRate < range.min) {
        lastExclusion = "SLURRY_MINIMUM_RATE_EXCEEDS_REQUIREMENT";
        continue;
      }
      if (usefulRate <= 0) continue;
      const desiredVolumeM3 = usefulRate * spreadable.spreadableAreaHa;
      const evaluated = evaluate(field, store.id, desiredVolumeM3);
      if (evaluated.status !== "OK") {
        lastExclusion = evaluated.reasonCode;
        continue;
      }
      const saving = Math.max(0, baselineCostEur - evaluated.withSlurryCostEur);
      candidates.push({
        fieldId: field.id,
        fieldName: field.name,
        housingId: store.id,
        storeName: store.shedName,
        applicationDate: planningDate,
        applicationMethod,
        methodBasis,
        rateM3ha: usefulRate,
        volumeM3: desiredVolumeM3,
        desiredVolumeM3,
        spreadableAreaHa: spreadable.spreadableAreaHa,
        spreadableAreaBasis: spreadable.basis,
        availableNpkKgHa: evaluated.creditOnSpreadAreaKgHa,
        baselineChemicalCostEur: baselineCostEur,
        withSlurryChemicalCostEur: evaluated.withSlurryCostEur,
        estimatedChemicalSavingEur: saving,
        estimatedSavingEurPerM3:
          desiredVolumeM3 > 0 ? saving / desiredVolumeM3 : 0,
        basis: "P3_PURCHASE_REDUCTION",
      });
    }
    if (
      lastExclusion !== undefined &&
      !candidates.some((candidate) => candidate.fieldId === field.id)
    )
      exclude(field, lastExclusion);
  }

  candidates.sort(
    (a, b) =>
      b.estimatedSavingEurPerM3 - a.estimatedSavingEurPerM3 ||
      a.fieldId.localeCompare(b.fieldId) ||
      a.housingId.localeCompare(b.housingId),
  );
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const selected: AutomaticSlurryFieldRecommendation[] = [];
  const selectedFields = new Set<string>();
  const belowSupportedMinimum = new Set<string>();
  for (const candidate of candidates) {
    if (selectedFields.has(candidate.fieldId)) continue;
    const available = storeRemaining.get(candidate.housingId) ?? 0;
    if (available <= 0) continue;
    const field = fieldById.get(candidate.fieldId)!;
    const volume = Math.min(candidate.desiredVolumeM3, available);
    const rate = roundDown1(volume / candidate.spreadableAreaHa);
    if (rate <= 0) continue;
    // Supply clipping can push the final rate below the lowest rate the
    // availability rule supports (Codex audit F014). The canonical credit
    // would then read the table's clamped minimum row — crediting slurry
    // that is not spread. No other evidenced rule exists below it, so the
    // allocation is not recommended: the store's remainder stays unused for
    // this field and remains available to the next eligible candidate.
    if (rate < rateRange.min || rate > rateRange.max) {
      belowSupportedMinimum.add(candidate.fieldId);
      continue;
    }
    const actualVolume = rate * candidate.spreadableAreaHa;
    // Supply may have cut the volume: every figure below is recomputed for
    // the volume actually recommended — never the candidate's full-rate
    // credit, cost or saving.
    const final = evaluate(field, candidate.housingId, actualVolume);
    if (final.status !== "OK") continue;
    const saving = Math.max(
      0,
      candidate.baselineChemicalCostEur - final.withSlurryCostEur,
    );
    const { desiredVolumeM3: _desired, ...rest } = candidate;
    void _desired;
    selected.push({
      ...rest,
      rateM3ha: rate,
      volumeM3: actualVolume,
      availableNpkKgHa: final.creditOnSpreadAreaKgHa,
      withSlurryChemicalCostEur: final.withSlurryCostEur,
      estimatedChemicalSavingEur: saving,
      estimatedSavingEurPerM3: saving / actualVolume,
    });
    selectedFields.add(candidate.fieldId);
    storeRemaining.set(
      candidate.housingId,
      Math.max(0, available - actualVolume),
    );
  }

  for (const fieldId of belowSupportedMinimum) {
    if (selectedFields.has(fieldId)) continue;
    exclude(
      fieldById.get(fieldId)!,
      "SLURRY_SUPPLY_BELOW_SUPPORTED_MINIMUM_RATE",
      `The slurry left for this field would spread below ${rateRange.min} m³/ha, the lowest rate the ${applicationMethod === "splashplate" ? "Teagasc Table 9-8" : "slurry availability"} rule supports, so it is not recommended.`,
    );
  }

  const allocatedM3 = selected.reduce((sum, r) => sum + r.volumeM3, 0);
  return {
    status: "ready",
    planningDate,
    expectedAvailableM3: forecast.projectedAvailableForNewPlanM3,
    allocatedM3,
    unallocatedM3: Math.max(
      0,
      forecast.projectedAvailableForNewPlanM3 - allocatedM3,
    ),
    recommendations: selected,
    excludedFields,
    limitations: [
      "This is a planning recommendation, not a persisted farmer allocation.",
      "Rates are sized on each field's spreadable area and capped so slurry alone does not supply more N, P or K per hectare spread than the P3 gross field requirement.",
      "Finite slurry is prioritised by the P3 chemical-fertiliser cost reduction per m³, recalculated for the final recommended volume using the app's current CSO-backed product prices; it is not the legacy Economic Opportunity Engine.",
      methodBasis.status === "RESOLVED"
        ? `Spreading method follows the recorded ${methodBasis.referenceYear} grassland stocking rate (${methodBasis.gsrKgNHa} kg N/ha, ${methodBasis.source}).`
        : `LESS is recommended because the ${methodBasis.referenceYear ?? "preceding-year"} grassland stocking rate that decides whether LESS is required is not recorded.`,
      "Fields without a current production cycle are excluded rather than blocking otherwise-valid field recommendations; the result is therefore not claimed to be a complete whole-farm optimum until every active field is classified.",
      "Slurry phosphorus counts against each field's statutory P maximum at its statutory value: a recommendation has no declared origin, so home-produced grazing manure is never assumed (S.I. 588/2025 Art. 17(8) needs an explicit declaration on the saved slurry plan).",
      "Rainfall, soiled water and other unmodelled store inflows are excluded from forecast slurry supply.",
    ],
  };
}

export type SlurryStorageForecastActionResult =
  | { status: "ready"; forecast: FarmSlurryForecast }
  | { status: "blocked"; forecast: FarmSlurryForecast; message: string };

/** Future physical slurry resource on a chosen planning date. This is a
 * projection from the farm's recorded store observations and livestock/housing
 * state; it never mutates today's tank level or creates slurry allocations. */
export async function getSlurryStorageForecastAction(
  targetDate: string,
): Promise<SlurryStorageForecastActionResult> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) ||
    Number.isNaN(new Date(`${targetDate}T00:00:00.000Z`).getTime())
  ) {
    throw new Error("getSlurryStorageForecastAction: invalid target date");
  }
  const farm = await getFarmForCurrentUser();
  if (!farm)
    throw new Error(
      "getSlurryStorageForecastAction: no real farm for the current session",
    );
  const [livestockGroups, housing, allocations] = await Promise.all([
    listLivestockGroupsForFarm(farm.id),
    listHousingForFarm(farm.id),
    listSlurryAllocationsForFarm(farm.id),
  ]);
  const forecast = buildFarmSlurryForecast({
    housing,
    livestockGroups,
    allocations,
    asOfDate: new Date().toISOString().slice(0, 10),
    targetDate,
  });
  if (forecast.status !== "READY") {
    return {
      status: "blocked",
      forecast,
      message: `${forecast.blockedStoreCount} slurry store${forecast.blockedStoreCount === 1 ? " is" : "s are"} missing the evidence needed for a complete future-volume forecast.`,
    };
  }
  return { status: "ready", forecast };
}

export type SlurryFirstProductionBasis =
  "TARGET_SEASON_SAVED" | "CARRY_FORWARD_CURRENT_SETTINGS";

export interface SlurryFirstPreviewInput extends SlurryPlanningScenarioInput {
  productionBasis: SlurryFirstProductionBasis;
}

export type SlurryFirstFertiliserPlanResult =
  | { status: "validation_error"; issues: string[] }
  | { status: "blocked"; reasonCode: string; message: string }
  | {
      status: "ready";
      scenario: {
        planningDate: string;
        expectedAvailableM3: number;
        allocatedM3: number;
        unallocatedM3: number;
        source: "FARMER_FORECAST" | "SYSTEM_FORECAST";
        productionBasis: SlurryFirstProductionBasis;
        carriedForwardFromSeason?: string;
      };
      /** The viewpoint both calculations were made from — the same one the
       * canonical plan uses: movement evidence recorded before `asOf`,
       * the planning season's production cycles. */
      assessment: { asOf: string; planningSeason: string };
      allocations: {
        fieldId: string;
        fieldName: string;
        housingId: string;
        storeName: string;
        volumeM3: number;
        applicationDate: string;
        applicationMethod: string;
      }[];
      baseline: FarmFertiliserDemandActionResult;
      withPlannedSlurry: FarmFertiliserDemandActionResult;
      automaticOptimisation: {
        status: "BLOCKED";
        reasonCode: "P3_ECONOMIC_ADAPTER_NOT_AVAILABLE";
        message: string;
      };
    };

type ResolvedSlurryFirstScenario =
  | { status: "validation_error"; issues: string[] }
  | { status: "blocked"; reasonCode: string; message: string }
  | {
      status: "resolved";
      scenario: Extract<
        ReturnType<typeof buildSlurryPlanningScenario>,
        { status: "READY" }
      >;
      evidence: P3PlanningEvidence;
      p3Cycles: P3Cycle[];
      carriedForwardFromSeason?: string;
      fieldById: Map<string, Field>;
      housingById: Map<string, { shedName: string }>;
      housing: Housing[];
      season: string;
      now: string;
    };

/** The validation, evidence read and season cycles shared by previewing
 * and adopting a slurry-first scenario — one contract, so an adopted plan
 * is always exactly a plan that previews. */
async function resolveSlurryFirstScenario(
  farm: Farm,
  input: SlurryFirstPreviewInput,
): Promise<ResolvedSlurryFirstScenario> {
  const scenario = buildSlurryPlanningScenario(input);
  if (scenario.status === "INVALID")
    return { status: "validation_error", issues: scenario.issues };

  const now = new Date().toISOString();
  const [evidence, housingList] = await Promise.all([
    loadP3PlanningEvidence(farm, now),
    listHousingForFarm(farm.id),
  ]);
  const { fields } = evidence;
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const housingById = new Map(
    housingList.map((housing) => [housing.id, housing]),
  );

  const identityIssues: string[] = [];
  const perStorePlanned = new Map<string, number>();
  for (const candidate of scenario.candidates) {
    if (!fieldById.has(candidate.fieldId))
      identityIssues.push("FIELD_NOT_FOUND");
    const store = housingById.get(candidate.housingId);
    if (!store) {
      identityIssues.push("STORE_NOT_FOUND");
      continue;
    }
    perStorePlanned.set(
      candidate.housingId,
      (perStorePlanned.get(candidate.housingId) ?? 0) + candidate.volumeM3,
    );
  }
  for (const [housingId, volumeM3] of perStorePlanned) {
    const capacityM3 = housingById.get(housingId)?.storageCapacityM3;
    if (capacityM3 !== undefined && volumeM3 > capacityM3 + 1e-9)
      identityIssues.push("STORE_CAPACITY_EXCEEDED");
  }
  if (identityIssues.length > 0)
    return { status: "validation_error", issues: [...new Set(identityIssues)] };

  const season = scenario.planningDate.slice(0, 4);
  const currentSeason = now.slice(0, 4);
  // A saved target-season cycle always wins; carrying forward only fills
  // fields that have none. Saved future cycles get the same zero prior
  // chemical baseline as every other future-season planning path.
  let p3Cycles: P3Cycle[] = (
    await listFieldProductionCyclesForSeason(
      fields.map((field) => field.id),
      season,
    )
  ).map((cycle) =>
    season > currentSeason
      ? withFuturePlanningChemicalBaseline(cycle, season)
      : cycle,
  );
  let carriedForwardFromSeason: string | undefined;
  if (
    p3Cycles.length !== fields.length &&
    input.productionBasis === "CARRY_FORWARD_CURRENT_SETTINGS"
  ) {
    const savedFieldIds = new Set(p3Cycles.map((cycle) => cycle.fieldId));
    const carried = (
      await listFieldProductionCyclesForSeason(
        fields.map((field) => field.id),
        currentSeason,
      )
    )
      .filter((cycle) => !savedFieldIds.has(cycle.fieldId))
      // The canonical carry-forward used by the plan and quotes: every
      // effective value (including a field exception) is kept; only the
      // chemical baseline is reset. The carry-forward itself is recorded on
      // the cycle id and `carriedForwardFromSeason`.
      .map((cycle) => carryCycleForwardForPlanningSeason(cycle, season));
    p3Cycles = [...p3Cycles, ...carried];
    if (carried.length > 0) carriedForwardFromSeason = currentSeason;
  }
  if (p3Cycles.length !== fields.length) {
    return {
      status: "blocked",
      reasonCode: "MISSING_TARGET_SEASON_PRODUCTION_CYCLES",
      message:
        input.productionBasis === "CARRY_FORWARD_CURRENT_SETTINGS"
          ? `Farm Return could not build a complete ${season} planning basis because one or more active fields also lack a current-season production cycle.`
          : `A ${season} production cycle is required for every active field. You can instead explicitly carry forward the current field production settings as a forecast starting point.`,
    };
  }
  return {
    status: "resolved",
    scenario,
    evidence,
    p3Cycles,
    ...(carriedForwardFromSeason ? { carriedForwardFromSeason } : {}),
    fieldById,
    housingById,
    housing: housingList,
    season,
    now,
  };
}

/**
 * Future-season slurry-first fertiliser planning.
 *
 * A farmer forecast is INTENT, never current physical storage. It is
 * therefore never written to `slurry_allocations`, whose contract reserves
 * slurry physically available now. The scenario is evaluated in memory
 * through the canonical field calculation, from the canonical evidence and
 * viewpoint (`loadP3PlanningEvidence`: recorded cattle movements, spreadable
 * area, LESS evidence) — the same as the plan and quotes. The same P3 farm
 * aggregation is run twice: no slurry, then the explicit forecast
 * allocations. The latter is the procurement preview; adopting it
 * (`adoptSlurryForecastScenarioAction`) makes it the season's procurement
 * basis.
 *
 * Automatic best-return selection is deliberately blocked here until the
 * Economic Opportunity Engine consumes P3 rather than the legacy
 * `calculateNutrientPlan` path. Explicit forecast allocations are safe to
 * preview; cross-engine ranking is not.
 */
export async function previewSlurryFirstFertiliserPlanAction(
  input: SlurryFirstPreviewInput,
): Promise<SlurryFirstFertiliserPlanResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm)
    throw new Error(
      "previewSlurryFirstFertiliserPlanAction: no real farm for the current session",
    );
  const resolved = await resolveSlurryFirstScenario(farm, input);
  if (resolved.status !== "resolved") return resolved;
  const {
    scenario,
    evidence,
    p3Cycles,
    carriedForwardFromSeason,
    fieldById,
    housingById,
    season,
    now,
  } = resolved;

  const scenarioAllocations: PlanningSlurryAllocation[] =
    scenario.candidates.map((candidate) => ({
      fieldId: candidate.fieldId,
      housingId: candidate.housingId,
      volumeM3: candidate.volumeM3,
      applicationMethod: tracked(
        candidate.applicationMethod,
        "farmer_adjusted",
        "Farmer forecast slurry plan",
        { sourceDate: scenario.planningDate },
      ),
      applicationDate: tracked(
        candidate.applicationDate,
        "farmer_adjusted",
        "Farmer forecast slurry plan",
        { sourceDate: scenario.planningDate },
      ),
      planningSource: {
        kind: "PREVIEW_SCENARIO",
        planningDate: scenario.planningDate,
        forecastSource: scenario.source,
        scenarioVersion: scenario.version,
      },
    }));

  const demand = (slurry: P3SlurrySelection) =>
    buildP3FarmFertiliserDemandResult({
      farm,
      evidence,
      slurry,
      now,
      p3Cycles,
      planningSeason: season,
    });

  return {
    status: "ready",
    scenario: {
      planningDate: scenario.planningDate,
      expectedAvailableM3: scenario.expectedAvailableM3,
      allocatedM3: scenario.allocatedM3,
      unallocatedM3: scenario.unallocatedM3,
      source: scenario.source,
      productionBasis: input.productionBasis,
      ...(carriedForwardFromSeason ? { carriedForwardFromSeason } : {}),
    },
    assessment: { asOf: now, planningSeason: season },
    allocations: scenario.candidates.map((candidate) => ({
      fieldId: candidate.fieldId,
      fieldName: fieldById.get(candidate.fieldId)!.name,
      housingId: candidate.housingId,
      storeName: housingById.get(candidate.housingId)!.shedName,
      volumeM3: candidate.volumeM3,
      applicationDate: candidate.applicationDate,
      applicationMethod: candidate.applicationMethod,
    })),
    baseline: demand([]),
    withPlannedSlurry: demand(scenarioAllocations),
    automaticOptimisation: {
      status: "BLOCKED",
      reasonCode: "P3_ECONOMIC_ADAPTER_NOT_AVAILABLE",
      message:
        "Automatic best-return slurry allocation is held back because the current whole-farm economic optimiser still evaluates the legacy nutrient engine. Forecast allocations can be previewed safely through P3, but Farm Return will not rank them across incompatible agronomy engines.",
    },
  };
}

export interface AdoptedSlurryForecastSummary {
  adoptionId: string;
  planningSeason: string;
  planningDate: string;
  forecastSource: "FARMER_FORECAST" | "SYSTEM_FORECAST";
  expectedAvailableM3: number;
  adoptedAt: string;
  intents: {
    fieldId: string;
    fieldName: string;
    housingId: string;
    volumeM3: number;
    applicationMethod: string;
    applicationDate: string;
    /** False when a physical allocation for this field in the season —
     * planned or completed — replaces the forecast intent in the plan
     * (`forecastSupersededFieldIds`). */
    countsInPlan: boolean;
  }[];
}

function adoptedForecastSummary(
  adoption: SlurryForecastAdoptionRecord & { action: "adopt" },
  fields: readonly Field[],
  allocationRecords: readonly SlurryAllocationRecord[],
): AdoptedSlurryForecastSummary {
  const nameById = new Map(fields.map((field) => [field.id, field.name]));
  const physicalFields = forecastSupersededFieldIds(
    allocationRecords,
    adoption.planningSeason,
  );
  return {
    adoptionId: adoption.id,
    planningSeason: adoption.planningSeason,
    planningDate: adoption.planningDate ?? "",
    forecastSource: adoption.forecastSource ?? "SYSTEM_FORECAST",
    expectedAvailableM3: adoption.expectedAvailableM3 ?? 0,
    adoptedAt: adoption.adoptedAt,
    intents: adoption.intents.map((intent) => ({
      ...intent,
      fieldName: nameById.get(intent.fieldId) ?? "Field no longer active",
      countsInPlan: !physicalFields.has(intent.fieldId),
    })),
  };
}

/** The adopted forecast that currently feeds `planningSeason`'s plan and
 * quotes, if any. */
export async function getAdoptedSlurryForecastAction(
  planningSeason: string,
): Promise<AdoptedSlurryForecastSummary | null> {
  const farm = await getFarmForCurrentUser();
  if (!farm)
    throw new Error(
      "getAdoptedSlurryForecastAction: no real farm for the current session",
    );
  const [adoptions, fields, allocationRecords] = await Promise.all([
    listSlurryForecastAdoptionsForFarm(farm.id),
    listFieldsForFarm(farm.id),
    listSlurryAllocationRecordsForFarm(farm.id),
  ]);
  const adoption = currentSlurryForecastAdoption(adoptions, planningSeason);
  return adoption
    ? adoptedForecastSummary(
        adoption,
        activeFields(fields),
        allocationRecords,
      )
    : null;
}

export type AdoptSlurryForecastResult =
  | { status: "validation_error"; issues: string[] }
  | { status: "blocked"; reasonCode: string; message: string }
  | { status: "adopted"; adoption: AdoptedSlurryForecastSummary };

/**
 * Adopts a previewed future-season slurry scenario as that season's
 * planning basis (Codex audit F010). The scenario is re-validated by the
 * exact preview contract, then stored as one immutable forecast-intent
 * record — never as `slurry_allocations`, so today's tank contents and
 * physical reservations are untouched. From then on the canonical plan,
 * procurement basket and quotes for that season credit it
 * (`planningSeasonSlurryAllocations`).
 */
export async function adoptSlurryForecastScenarioAction(
  input: SlurryFirstPreviewInput,
): Promise<AdoptSlurryForecastResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm)
    throw new Error(
      "adoptSlurryForecastScenarioAction: no real farm for the current session",
    );
  const resolved = await resolveSlurryFirstScenario(farm, input);
  if (resolved.status !== "resolved") return resolved;
  const { scenario, season, now, evidence, carriedForwardFromSeason, housing } =
    resolved;
  // A forecast is intent for a season that has not started; slurry for the
  // current season is planned as a physical reservation.
  if (season <= now.slice(0, 4))
    return {
      status: "validation_error",
      issues: ["FORECAST_ADOPTION_REQUIRES_FUTURE_SEASON"],
    };
  // Trust boundary (Codex audit F010): a SYSTEM_FORECAST label is only
  // accepted when it matches the forecast the server calculates here, from
  // the same evidence and assessment date the forecast action uses; the
  // stored volume is the server's. Anything else the farmer enters stays a
  // FARMER_FORECAST.
  let expectedAvailableM3 = scenario.expectedAvailableM3;
  let systemForecast: SystemSlurryForecastSnapshot | undefined;
  if (scenario.source === "SYSTEM_FORECAST") {
    // Only the server-only write boundary can record a system forecast
    // (`createSlurryForecastAdoption`); without it, fail closed.
    if (!isSystemSlurryForecastWriteConfigured())
      return {
        status: "validation_error",
        issues: ["SYSTEM_FORECAST_WRITE_UNAVAILABLE"],
      };
    const assessedOn = now.slice(0, 10);
    const binding = bindSystemSlurryForecast({
      planningDate: scenario.planningDate,
      expectedAvailableM3: scenario.expectedAvailableM3,
      candidates: scenario.candidates,
      forecast: buildFarmSlurryForecast({
        housing,
        livestockGroups: evidence.livestockGroups,
        allocations: evidence.physicalAllocationRecords,
        asOfDate: assessedOn,
        targetDate: scenario.planningDate,
      }),
      assessedOn,
    });
    if (binding.status === "REJECTED")
      return { status: "validation_error", issues: binding.issues };
    expectedAvailableM3 = binding.expectedAvailableM3;
    systemForecast = binding.snapshot;
  }
  const adoption = await createSlurryForecastAdoption(farm.id, {
    planningSeason: season,
    action: "adopt",
    planningDate: scenario.planningDate,
    forecastSource: scenario.source,
    expectedAvailableM3,
    ...(systemForecast ? { systemForecast } : {}),
    productionBasis: input.productionBasis,
    ...(carriedForwardFromSeason ? { carriedForwardFromSeason } : {}),
    scenarioVersion: scenario.version,
    intents: scenario.candidates.map((candidate) => ({
      fieldId: candidate.fieldId,
      housingId: candidate.housingId,
      volumeM3: candidate.volumeM3,
      applicationMethod: candidate.applicationMethod,
      applicationDate: candidate.applicationDate,
    })),
    adoptedBy: farm.ownerName,
  });
  revalidatePath("/fertiliser-plan");
  return {
    status: "adopted",
    adoption: adoptedForecastSummary(
      adoption as SlurryForecastAdoptionRecord & { action: "adopt" },
      evidence.fields,
      evidence.allocationRecords,
    ),
  };
}

/** Withdraws the season's adopted forecast: an appended withdrawal record,
 * so the history of what was adopted is kept. */
export async function withdrawSlurryForecastAdoptionAction(
  planningSeason: string,
): Promise<void> {
  const farm = await getFarmForCurrentUser();
  if (!farm)
    throw new Error(
      "withdrawSlurryForecastAdoptionAction: no real farm for the current session",
    );
  if (!/^\d{4}$/.test(planningSeason))
    throw new Error("withdrawSlurryForecastAdoptionAction: invalid season");
  await createSlurryForecastAdoption(farm.id, {
    planningSeason,
    action: "withdraw",
    intents: [],
    adoptedBy: farm.ownerName,
  });
  revalidatePath("/fertiliser-plan");
}

/**
 * Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
 * F5) — the real farm-wide lime requirement, field tonnes and farm
 * tonnes, built only from each active field's own already-saved
 * laboratory `limeRequirement` (t/ha). Never a new lime engine — see
 * `aggregateFarmLimeRequirement`'s own doc comment.
 */
export async function getFarmLimeRequirementAction(): Promise<FarmLimeRequirement> {
  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error(
      "getFarmLimeRequirementAction: no real farm for the current session",
    );
  }
  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2) — an archived field must never contribute to this farm-wide
  // total, the same rule every other farm-wide aggregation in this app
  // now applies.
  const fields = activeFields(await listFieldsForFarm(farm.id));
  // Audit F006: the pH target follows each field's canonical crop for the
  // current season (production cycles); a field without one gets no advice.
  const currentSeason = new Date().toISOString().slice(0, 4);
  const cycles = await listFieldProductionCyclesForSeason(
    fields.map((field) => field.id),
    currentSeason,
  );
  const cropSystemByFieldId = new Map(
    cycles.map((cycle) => [cycle.fieldId, cycle.cropSystem] as const),
  );
  return aggregateFarmLimeRequirement(fields, { cropSystemByFieldId });
}
