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
import { listDecisionsForFarm, getDecisionById } from "@/lib/farm-data/decisions";
import { listJobSessionDecisionIdsForFarm, getJobSessionById } from "@/lib/farm-data/job-sessions";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { listSlurryCompositionRecordsForFarm } from "@/lib/farm-data/slurry-composition";
import { listGrazingFieldSessionsForFarm } from "@/lib/farm-data/grazing-field-sessions";
import { getFieldProductionCycle, listFieldProductionCyclesForSeason } from "@/lib/farm-data/field-production-cycles";
import type { SlurryComposition } from "@/domain/slurry-composition";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import { startJobSessionFromPlan, type StartJobSessionResult } from "@/orchestration/job-session";
import { recomputePromptByKind } from "@/orchestration/prompt/recompute";
import {
  FERTILISER_RECOMMENDATION_PROMPT_KIND,
  sanitiseRecommendedProduct,
  type FertiliserRecommendationSummary,
} from "@/orchestration/prompt/fertiliser-recommendation";
import { getFarmFertiliserDemand, sanitiseDecisionRecordForClient, selectedProductName } from "@/orchestration/fertiliser-plan";
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
import { checkClosedPeriodCalendar, normaliseCountyForZoneLookup } from "@/domain/closed-period-calendar";
import { checkLessMethodGate } from "@/domain/less-method-gate";
import { cropFamilyFor, type EvidenceValue, type FieldProductionCycle, type FieldProductionCycleEvidence } from "@/domain/fertiliser-field-evidence";
import { calculateGrassFertiliserV2, type GrassRuleTrace } from "@/domain/grass-fertiliser-engine-v2";
import { calculateFieldGrazingPressure, type GrazingFieldSession } from "@/domain/grazing-field-pressure";
import { resolveGrazingProductionSystem } from "@/domain/grazing-production-system-resolution";
import { calculateStatutoryGrasslandStockingRateKgHa } from "@/domain/statutory-excretion";
import { allocatePurchasedProducts, resolveAvailableSlurryNutrients, resolveEffectiveSlurryComposition, resolveFieldSlurryAllocation } from "@/domain/nutrients";
import { currentSlurryCompositionByHousing } from "@/domain/slurry-composition";
import { resolveFieldSlurryCompositionInput } from "@/domain/slurry-evidence-context";
import { checkCommonageFertiliserGate } from "@/domain/commonage-gate";
import { checkNationalBufferDistance } from "@/domain/buffer-gate";
import { requireCommonageStatus } from "@/domain/input-gates";
import { activeFields, tracked, type Farm, type Field, type FertiliserProduct, type LivestockGroup, type SlurryAllocation } from "@/domain/types";
import { buildSlurryPlanningScenario, type SlurryPlanningScenarioInput } from "@/domain/slurry-planning-scenario";
import { buildFarmSlurryForecast, type FarmSlurryForecast } from "@/domain/slurry-storage-forecast";

/** `Decision.calculationKind` for a real planned fertiliser application —
 * identical string to the Prompt kind it was decided from
 * (`decideAsFarmer` copies `Prompt.kind` verbatim into
 * `calculationKind`). */
const FERTILISER_PLAN_CALCULATION_KIND: string = FERTILISER_RECOMMENDATION_PROMPT_KIND;

function grazingStockingInputForField(args: {
  field: Pick<Field, "id" | "areaHa">;
  livestockGroups: LivestockGroup[];
  sessions: GrazingFieldSession[];
  season: string;
  asOf: string;
  holdingFallbackKgHa?: number;
}): {
  annualOrganicNStockingRateKgHa?: number;
  grazingStockingEvidence?: {
    basis: "FIELD_GRAZING_SESSIONS" | "HOLDING_FALLBACK";
    trackingStart?: string;
    trackingDays?: number;
    sourceSessionCount?: number;
  };
} {
  const pressure = calculateFieldGrazingPressure({
    fieldId: args.field.id,
    fieldAreaHa: args.field.areaHa,
    livestockGroups: args.livestockGroups,
    sessions: args.sessions,
    seasonStart: `${args.season}-01-01T00:00:00.000Z`,
    asOf: args.asOf,
  });
  if (pressure.status === "READY" && pressure.annualOrganicNStockingRateKgHa !== undefined) {
    return {
      annualOrganicNStockingRateKgHa: pressure.annualOrganicNStockingRateKgHa,
      grazingStockingEvidence: {
        basis: "FIELD_GRAZING_SESSIONS",
        ...(pressure.trackingStart ? { trackingStart: pressure.trackingStart } : {}),
        ...(pressure.trackingDays !== undefined ? { trackingDays: pressure.trackingDays } : {}),
        sourceSessionCount: pressure.sourceSessionIds.length,
      },
    };
  }
  if (args.holdingFallbackKgHa !== undefined) {
    return {
      annualOrganicNStockingRateKgHa: args.holdingFallbackKgHa,
      grazingStockingEvidence: { basis: "HOLDING_FALLBACK" },
    };
  }
  return {};
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
  const recommendation = plan.estimateSnapshot.value as FertiliserRecommendationSummary;
  return Array.isArray(recommendation.products) && recommendation.products.length === 1;
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
  return prompt.basis.status === "OK" ? (prompt.basis.value as FertiliserRecommendationSummary) : undefined;
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
function isPlanProductStillRecommended(plan: DecisionRecord, recommendation: FertiliserRecommendationSummary): boolean {
  const product = selectedProductName(plan);
  return product !== undefined && recommendation.products.some((p) => p.name === product);
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
export async function getMatchablePlanForFieldAction(fieldId: string): Promise<MatchablePlanResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error("getMatchablePlanForFieldAction: no real farm for the current session");
  }

  const [{ decisions, truncated: decisionsTruncated }, { decisionIds: linkedDecisionIds, truncated: linksTruncated }, allFields, livestockGroups, slurryAllocations, slurryCompositionRecords] = await Promise.all([
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
  const p3Cycle = await getFieldProductionCycle(field.id, new Date().toISOString().slice(0, 4));
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
  const currentRecommendation = getCurrentFertiliserRecommendation(farm, field, fields, livestockGroups, slurryAllocations, new Date().toISOString(), slurryCompositionRecords);
  const stillCurrentCandidates = currentRecommendation ? candidates.filter((c) => isPlanProductStillRecommended(c, currentRecommendation)) : [];
  if (stillCurrentCandidates.length === 0) return { status: "none" };
  if (stillCurrentCandidates.length > 1) return { status: "ambiguous", candidateCount: stillCurrentCandidates.length };
  return { status: "matched", plan: sanitiseDecisionRecordForClient(stillCurrentCandidates[0]) };
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
export async function startJobSessionFromPlanAction(input: StartJobSessionFromPlanActionInput): Promise<StartJobSessionResult> {
  if (input.activityType !== "fertiliser_spreading") {
    throw new Error(`startJobSessionFromPlanAction: activityType must be "fertiliser_spreading" — a fertiliser plan can never authorise any other job type`);
  }

  const now = new Date().toISOString();
  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error("startJobSessionFromPlanAction: no real farm for the current session");
  }

  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2) — a new job session must never be startable against a field the
  // farmer has archived; `activeFields` makes an archived field
  // genuinely "not found" here, the same fail-closed shape an actually
  // deleted field would produce.
  const fields = activeFields(await listFieldsForFarm(farm.id));
  const field = fields.find((f) => f.id === input.fieldId);
  if (!field) {
    throw new Error(`startJobSessionFromPlanAction: field ${input.fieldId} not found on the current session's farm`);
  }
  const p3CycleForExecution = await getFieldProductionCycle(field.id, now.slice(0, 4));
  if (p3CycleForExecution) {
    throw new Error("startJobSessionFromPlanAction: legacy fertiliser plans are disabled for fields with a current P3 production cycle");
  }

  // listDecisionsForFarm is farm-scoped (RLS + explicit farm_id filter) —
  // `plan.farmId` below is therefore already guaranteed to equal
  // `farm.id`; every other check here is a real product-safety check
  // (campaign item 11), not an ownership one.
  const { decisions } = await listDecisionsForFarm(farm.id);
  const plan = decisions.find((d) => d.id === input.planDecisionId);
  if (!plan) {
    throw new Error(`startJobSessionFromPlanAction: plan ${input.planDecisionId} not found on the current session's farm`);
  }
  if (plan.outcome !== "accepted" && plan.outcome !== "edited") {
    throw new Error(`startJobSessionFromPlanAction: plan ${plan.id} has outcome "${plan.outcome}" — only an accepted/edited plan can start a job`);
  }
  if (plan.calculationKind !== FERTILISER_PLAN_CALCULATION_KIND) {
    throw new Error(`startJobSessionFromPlanAction: decision ${plan.id} is not a real fertiliser plan (calculationKind "${plan.calculationKind}")`);
  }
  if (plan.fieldId !== input.fieldId) {
    throw new Error(`startJobSessionFromPlanAction: plan ${plan.id} is for a different field than requested`);
  }
  // Codex audit HIGH (round 4) — defense in depth on top of
  // `getMatchablePlanForFieldAction`'s own identical check: a direct
  // caller (bypassing the UI's own matching lookup) must not be able to
  // start a job from a bare-accepted, genuinely multi-product plan
  // either — see `isUnambiguouslySingleProductPlan`'s own doc comment.
  if (!isUnambiguouslySingleProductPlan(plan)) {
    throw new Error(`startJobSessionFromPlanAction: plan ${plan.id} represents more than one product with no farmer-chosen single product — not safely executable as one job`);
  }
  // Codex audit CRITICAL (round 7), revised HIGH (round 10): defense in
  // depth on top of `getMatchablePlanForFieldAction`'s own identical
  // check — a direct caller (bypassing the UI's own matching lookup)
  // must not be able to start a job from a plan whose field is no
  // longer currently recommendable at all, or whose own selected
  // product is no longer among the field's current live recommendation
  // — even though its own frozen snapshot was once "OK" — see
  // `getCurrentFertiliserRecommendation`'s own doc comment.
  const [livestockGroups, slurryAllocations, slurryCompositionRecords] = await Promise.all([
    listLivestockGroupsForFarm(farm.id),
    listSlurryAllocationsForFarm(farm.id),
    listSlurryCompositionRecordsForFarm(farm.id),
  ]);
  const currentRecommendation = getCurrentFertiliserRecommendation(farm, field, fields, livestockGroups, slurryAllocations, now, slurryCompositionRecords);
  if (!currentRecommendation || !isPlanProductStillRecommended(plan, currentRecommendation)) {
    throw new Error(`startJobSessionFromPlanAction: plan ${plan.id}'s field is no longer currently recommendable — not safely executable as one job`);
  }

  const { decisionIds: linkedDecisionIds } = await listJobSessionDecisionIdsForFarm(farm.id);
  if (linkedDecisionIds.has(plan.id)) {
    throw new Error(`startJobSessionFromPlanAction: plan ${plan.id} is already linked to a job session`);
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

export async function getLinkedFertiliserPlanForJobSessionAction(jobSessionId: string): Promise<LinkedFertiliserPlanSummary | null> {
  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error("getLinkedFertiliserPlanForJobSessionAction: no real farm for the current session");
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
  if (!plan || plan.calculationKind !== FERTILISER_PLAN_CALCULATION_KIND || plan.estimateSnapshot.status !== "OK") return null;

  const recommendation = plan.estimateSnapshot.value as FertiliserRecommendationSummary;
  const edits = plan.edits as { plannedProduct?: string; plannedQuantityKg?: number; plannedDate?: string } | undefined;

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
  const effectiveProductDetail = effectiveProduct ? recommendation.products.find((p) => p.name === effectiveProduct) : undefined;

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
    recommendedProducts: recommendation.products.map((p) => sanitiseRecommendedProduct(p as FertiliserProduct)),
    plannedProduct: effectiveProduct,
    plannedQuantityKg: edits?.plannedQuantityKg ?? effectiveProductDetail?.totalKg,
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
  | { status: "not_applicable" }
  | {
      status: "ok";
      engineVersion: string;
      cropSystem: string;
      requirementKgHa: FertiliserNutrientContributionKg;
      organicCreditsKgHa: FertiliserNutrientContributionKg;
      confirmedAppliedKgHa?: FertiliserNutrientContributionKg;
      remainingKgHa?: FertiliserNutrientContributionKg;
      recommendedProducts: FertiliserProduct[];
      ruleTraces: { n?: GrassRuleTrace; p?: GrassRuleTrace; k?: GrassRuleTrace };
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

export async function getFieldFertiliserStatusAction(fieldId: string, planningSeason?: string): Promise<FieldFertiliserStatusResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("getFieldFertiliserStatusAction: no real farm for the current session");

  const fields = activeFields(await listFieldsForFarm(farm.id));
  const field = fields.find((candidate) => candidate.id === fieldId);
  if (!field) throw new Error("getFieldFertiliserStatusAction: field " + fieldId + " not found on the current session's farm");

  const now = new Date().toISOString();
  const currentSeason = now.slice(0, 4);
  const season = planningSeason ?? currentSeason;
  const [livestockGroups, slurryAllocations, slurryCompositionRecords, grazingSessions] = await Promise.all([
    listLivestockGroupsForFarm(farm.id),
    listSlurryAllocationsForFarm(farm.id),
    listSlurryCompositionRecordsForFarm(farm.id),
    listGrazingFieldSessionsForFarm(farm.id, now),
  ]);

  let cycles: Awaited<ReturnType<typeof listFieldProductionCyclesForSeason>>;
  let cycle: Awaited<ReturnType<typeof getFieldProductionCycle>>;
  if (season > currentSeason) {
    const [targetCycles, currentCycles] = await Promise.all([
      listFieldProductionCyclesForSeason(fields.map((candidate) => candidate.id), season),
      listFieldProductionCyclesForSeason(fields.map((candidate) => candidate.id), currentSeason),
    ]);
    const targetByField = new Map(targetCycles.map((candidate) => [candidate.fieldId, candidate]));
    cycles = currentCycles.map((candidate) => targetByField.get(candidate.fieldId) ?? carryCycleForwardForQuotePlanning(candidate, season));
    for (const candidate of targetCycles) if (!cycles.some((existing) => existing.fieldId === candidate.fieldId)) cycles.push(candidate);
    cycle = cycles.find((candidate) => candidate.fieldId === field.id) ?? null;
  } else {
    [cycle, cycles] = await Promise.all([
      getFieldProductionCycle(field.id, season),
      listFieldProductionCyclesForSeason(fields.map((candidate) => candidate.id), season),
    ]);
  }

  if (!cycle) return { status: "blocked", reasonCode: "MISSING_FIELD_PRODUCTION_CYCLE" };

  const cycleByFieldId = new Map(cycles.map((candidate) => [candidate.fieldId, candidate]));
  const missingCycles = fields.filter((candidate) => !cycleByFieldId.has(candidate.id));
  if (cycle.cropSystem === "GRASS_GRAZING" && missingCycles.length > 0) {
    return { status: "blocked", reasonCode: "MISSING_FARM_PRODUCTION_CYCLES_FOR_GRASSLAND_AREA" };
  }

  const grasslandAreaHa = fields.reduce((sum, candidate) => {
    const candidateCycle = cycleByFieldId.get(candidate.id);
    return candidateCycle && cropFamilyFor(candidateCycle.cropSystem) === "grassland" ? sum + candidate.areaHa : sum;
  }, 0);

  let grazingStockingInput: ReturnType<typeof grazingStockingInputForField> = {};
  if (cycle.cropSystem === "GRASS_GRAZING") {
    const stocking = calculateStatutoryGrasslandStockingRateKgHa(livestockGroups, grasslandAreaHa);
    if (stocking.status !== "OK") return { status: "blocked", reasonCode: stocking.reasonCode };
    grazingStockingInput = grazingStockingInputForField({
      field,
      livestockGroups,
      sessions: grazingSessions,
      season,
      asOf: now,
      holdingFallbackKgHa: stocking.value.gsrKgNHa,
    });
  }

  const seasonSlurryAllocations = slurryAllocations.filter((allocation) => allocation.applicationDate?.value?.slice(0, 4) === season);
  const allocation = resolveFieldSlurryAllocation(seasonSlurryAllocations, field.id);
  let organicCreditsKgHa = { n: 0, p: 0, k: 0 };
  if (allocation) {
    if (!allocation.applicationMethod?.value) return { status: "blocked", reasonCode: "MISSING_SLURRY_APPLICATION_METHOD" };
    if (!allocation.applicationDate?.value) return { status: "blocked", reasonCode: "MISSING_SLURRY_APPLICATION_DATE" };
    const compositionInput = resolveFieldSlurryCompositionInput(
      seasonSlurryAllocations,
      field.id,
      currentSlurryCompositionByHousing(slurryCompositionRecords),
    );
    if (compositionInput.unresolved) return { status: "blocked", reasonCode: "SLURRY_COMPOSITION_SOURCES_UNRESOLVED" };
    const composition = resolveEffectiveSlurryComposition(compositionInput.composition);
    const pIndex = field.fertility.pIndex?.value;
    const kIndex = field.fertility.kIndex?.value;
    if (!pIndex || !kIndex) return { status: "blocked", reasonCode: "MISSING_SOIL_FERTILITY_INDEX" };
    const available = resolveAvailableSlurryNutrients({
      allocation,
      applicationRateM3ha: allocation.volumeM3 / field.areaHa,
      dmPct: composition.dmPct,
      dmPctStatus: composition.status,
      pIndex,
      kIndex,
    });
    if (available.status !== "OK") return { status: "blocked", reasonCode: available.reasonCode };
    organicCreditsKgHa = { n: available.value.n, p: available.value.p, k: available.value.k };
  }

  const grazingSystem = cycle.cropSystem === "GRASS_GRAZING"
    ? resolveGrazingProductionSystem({ farm, fieldId: field.id, cycle, sessions: grazingSessions })
    : null;
  const result = calculateGrassFertiliserV2({
    field,
    cycle,
    ...grazingStockingInput,
    ...(grazingSystem?.value ? { grazingProductionSystem: grazingSystem.value } : {}),
    organicCreditsKgHa,
  });

  if (result.status === "UNSUPPORTED_PATHWAY") return { status: "not_applicable" };
  if (result.status !== "READY" || !result.grossRequirementKgHa || !result.remainingRequirementKgHa || !result.priorChemicalCreditsKgHa) {
    return { status: "blocked", reasonCode: result.status === "SOURCE_CONFLICT" ? "P3_SOURCE_CONFLICT" : "P3_INCOMPLETE_EVIDENCE" };
  }

  const allocationResult = allocatePurchasedProducts(
    result.remainingRequirementKgHa.n,
    result.remainingRequirementKgHa.p,
    result.remainingRequirementKgHa.k,
    field.areaHa,
  );

  if (allocationResult.products.length > 0) {
    const commonage = checkCommonageFertiliserGate(requireCommonageStatus(field), "chemical_fertiliser");
    if (commonage.status === "LEGAL_PROHIBITION") return { status: "not_applicable" };
    if (commonage.status === "BLOCKED_INSUFFICIENT_EVIDENCE") return { status: "blocked", reasonCode: commonage.reasonCode };

    if (field.waterBufferContext?.value.featureType === undefined || field.waterBufferContext.value.distanceM === undefined) {
      return { status: "blocked", reasonCode: "MISSING_NATIONAL_BUFFER_ASSESSMENT" };
    }
    const nationalBuffer = checkNationalBufferDistance({
      material: "chemical_fertiliser",
      feature: field.waterBufferContext.value.featureType,
      distanceM: field.waterBufferContext.value.distanceM,
    });
    if (nationalBuffer.status === "LEGAL_PROHIBITION") return { status: "not_applicable" };

  }

  return {
    status: "ok",
    engineVersion: result.engineVersion,
    cropSystem: result.cropSystem,
    requirementKgHa: result.grossRequirementKgHa,
    organicCreditsKgHa: result.organicCreditsKgHa ?? { n: 0, p: 0, k: 0 },
    confirmedAppliedKgHa: result.priorChemicalCreditsKgHa,
    remainingKgHa: result.remainingRequirementKgHa,
    recommendedProducts: allocationResult.products,
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
export interface FarmFertiliserDemandActionResult {
  demand: FarmInputDemand[];
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

async function buildP3FarmFertiliserDemandResult(input: {
  farm: Farm;
  fields: Field[];
  livestockGroups: LivestockGroup[];
  slurryAllocations: SlurryAllocation[];
  slurryCompositionRecords: SlurryComposition[];
  grazingSessions: GrazingFieldSession[];
  now: string;
  p3Cycles: Awaited<ReturnType<typeof listFieldProductionCyclesForSeason>>;
  planningSeason: string;
}): Promise<FarmFertiliserDemandActionResult> {
  const { farm, fields, livestockGroups, slurryAllocations, slurryCompositionRecords, grazingSessions, now, p3Cycles, planningSeason } = input;
  const cycleByFieldId = new Map(p3Cycles.map((cycle) => [cycle.fieldId, cycle]));

  const grasslandAreaHa = fields.reduce((sum, field) => {
    const cycle = cycleByFieldId.get(field.id);
    return cycle && cropFamilyFor(cycle.cropSystem) === "grassland" ? sum + field.areaHa : sum;
  }, 0);
  const stocking = calculateStatutoryGrasslandStockingRateKgHa(livestockGroups, grasslandAreaHa);
  const compositionByHousing = currentSlurryCompositionByHousing(slurryCompositionRecords);
  let fieldsWithBlockedEvidence = 0;

  const aggregationInputs = fields.map((field) => {
    const cycle = cycleByFieldId.get(field.id);
    if (!cycle) {
      fieldsWithBlockedEvidence++;
      return {
        fieldId: field.id,
        fieldName: field.name,
        plan: {
          calculationVersion: "grass_fertiliser_engine_v2.0.0",
          purchaseStatus: {
            status: "UNKNOWN" as const,
            reasonCode: "P3_MISSING_PRODUCTION_CYCLE",
            missingInputs: ["productionCycle"],
          },
          purchasedProducts: [],
        },
      };
    }
    let organicCreditsKgHa = { n: 0, p: 0, k: 0 };
    const seasonSlurryAllocations = slurryAllocations.filter((allocation) => allocation.applicationDate?.value?.slice(0, 4) === planningSeason);
    const slurryAllocation = resolveFieldSlurryAllocation(seasonSlurryAllocations, field.id);
    if (slurryAllocation) {
      const compositionInput = resolveFieldSlurryCompositionInput(seasonSlurryAllocations, field.id, compositionByHousing);
      if (
        !slurryAllocation.applicationMethod?.value ||
        !slurryAllocation.applicationDate?.value ||
        compositionInput.unresolved ||
        !field.fertility.pIndex?.value ||
        !field.fertility.kIndex?.value
      ) {
        fieldsWithBlockedEvidence++;
        return {
          fieldId: field.id,
          fieldName: field.name,
          plan: {
            calculationVersion: "grass_fertiliser_engine_v2.0.0",
            purchaseStatus: { status: "UNKNOWN" as const, reasonCode: "P3_INCOMPLETE_SLURRY_EVIDENCE", missingInputs: ["slurry"] },
            purchasedProducts: [],
          },
        };
      }
      const composition = resolveEffectiveSlurryComposition(compositionInput.composition);
      const available = resolveAvailableSlurryNutrients({
        allocation: slurryAllocation,
        applicationRateM3ha: slurryAllocation.volumeM3 / field.areaHa,
        dmPct: composition.dmPct,
        dmPctStatus: composition.status,
        pIndex: field.fertility.pIndex.value,
        kIndex: field.fertility.kIndex.value,
      });
      if (available.status !== "OK") {
        fieldsWithBlockedEvidence++;
        return {
          fieldId: field.id,
          fieldName: field.name,
          plan: {
            calculationVersion: "grass_fertiliser_engine_v2.0.0",
            purchaseStatus: { status: "UNKNOWN" as const, reasonCode: available.reasonCode, missingInputs: "missingInputs" in available ? available.missingInputs : [] },
            purchasedProducts: [],
          },
        };
      }
      organicCreditsKgHa = { n: available.value.n, p: available.value.p, k: available.value.k };
    }

    const grazingStockingInput = cycle.cropSystem === "GRASS_GRAZING"
      ? grazingStockingInputForField({
          field,
          livestockGroups,
          sessions: grazingSessions,
          season: planningSeason,
          asOf: now,
          ...(stocking.status === "OK" ? { holdingFallbackKgHa: stocking.value.gsrKgNHa } : {}),
        })
      : {};
    const grazingSystem = cycle.cropSystem === "GRASS_GRAZING"
      ? resolveGrazingProductionSystem({ farm, fieldId: field.id, cycle, sessions: grazingSessions })
      : null;
    const result = calculateGrassFertiliserV2({
      field,
      cycle,
      ...grazingStockingInput,
      ...(grazingSystem?.value ? { grazingProductionSystem: grazingSystem.value } : {}),
      organicCreditsKgHa,
    });

    if (result.status !== "READY" || !result.remainingRequirementKgHa) {
      fieldsWithBlockedEvidence++;
      return {
        fieldId: field.id,
        fieldName: field.name,
        plan: {
          calculationVersion: result.engineVersion,
          purchaseStatus:
            result.status === "UNSUPPORTED_PATHWAY"
              ? { status: "NOT_APPLICABLE" as const, reasonCode: "P3_UNSUPPORTED_PATHWAY" }
              : { status: "UNKNOWN" as const, reasonCode: result.status, missingInputs: result.missingInputs },
          purchasedProducts: [],
        },
      };
    }

    const products = allocatePurchasedProducts(
      result.remainingRequirementKgHa.n,
      result.remainingRequirementKgHa.p,
      result.remainingRequirementKgHa.k,
      field.areaHa,
    ).products;

    if (products.length === 0) {
      return {
        fieldId: field.id,
        fieldName: field.name,
        plan: {
          calculationVersion: result.engineVersion,
          purchaseStatus: { status: "NONE_NEEDED" as const, basis: "REMAINING_ZERO" as const },
          purchasedProducts: [],
        },
      };
    }

    const commonage = checkCommonageFertiliserGate(requireCommonageStatus(field), "chemical_fertiliser");
    if (commonage.status === "LEGAL_PROHIBITION") {
      return {
        fieldId: field.id,
        fieldName: field.name,
        plan: {
          calculationVersion: result.engineVersion,
          purchaseStatus: { status: "PROHIBITED" as const, reasonCode: "COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED" as const },
          purchasedProducts: [],
        },
      };
    }
    if (commonage.status !== "NOT_APPLICABLE") {
      fieldsWithBlockedEvidence++;
      return {
        fieldId: field.id,
        fieldName: field.name,
        plan: {
          calculationVersion: result.engineVersion,
          purchaseStatus: { status: "UNKNOWN" as const, reasonCode: ("reasonCode" in commonage ? commonage.reasonCode : "P3_COMMONAGE_GATE_UNRESOLVED"), missingInputs: ["FIELD_COMMONAGE_STATUS"] },
          purchasedProducts: [],
        },
      };
    }

    if (field.waterBufferContext?.value.featureType === undefined || field.waterBufferContext.value.distanceM === undefined) {
      fieldsWithBlockedEvidence++;
      return {
        fieldId: field.id,
        fieldName: field.name,
        plan: {
          calculationVersion: result.engineVersion,
          purchaseStatus: { status: "UNKNOWN" as const, reasonCode: "MISSING_NATIONAL_BUFFER_ASSESSMENT", missingInputs: ["waterBufferContext"] },
          purchasedProducts: [],
        },
      };
    }
    const national = checkNationalBufferDistance({
      material: "chemical_fertiliser",
      feature: field.waterBufferContext.value.featureType,
      distanceM: field.waterBufferContext.value.distanceM,
    });
    if (national.status === "LEGAL_PROHIBITION") {
      return {
        fieldId: field.id,
        fieldName: field.name,
        plan: {
          calculationVersion: result.engineVersion,
          purchaseStatus: { status: "PROHIBITED" as const, reasonCode: "WATER_BUFFER_CHEMICAL_FERTILISER_PROHIBITED" as const },
          purchasedProducts: [],
        },
      };
    }
    return {
      fieldId: field.id,
      fieldName: field.name,
      plan: {
        calculationVersion: result.engineVersion,
        purchaseStatus: { status: "RECOMMENDED" as const },
        purchasedProducts: products,
      },
    };
  });

  const aggregation = aggregateFarmFertiliserPurchasing(aggregationInputs);
  const recommended = toFarmFertiliserProductTotals(aggregation);
  const demand = aggregateFarmFertiliserDemand(recommended, new Map(), new Map());
  return {
    demand: demand.map((row) => toFarmInputDemand(farm.id, row)),
    purchaseRequirementTonnes: toFarmFertiliserPurchaseRequirementTonnes(demand),
    truncated: false,
    applicationsWithUnknownComposition: 0,
    fieldsWithBlockedEvidence,
    aggregation,
    basket: buildFarmFertiliserQuoteBasket(aggregation, { farmId: farm.id, createdAt: now }),
  };
}

function carryCycleForwardForQuotePlanning(cycle: Awaited<ReturnType<typeof listFieldProductionCyclesForSeason>>[number], planningSeason: string) {
  const zero = (nutrient: string) => ({
    value: 0,
    method: "ASSUMED" as const,
    source: `Farm Return ${planningSeason} quote planning`,
    note: `${nutrient} applied in an earlier season is not deducted from the ${planningSeason} fertiliser requirement.`,
  });
  return {
    ...cycle,
    id: `${cycle.id}:quote:${planningSeason}`,
    season: planningSeason,
    status: "planned" as const,
    evidence: {
      ...cycle.evidence,
      chemicalNAppliedKgHa: zero("Chemical N"),
      chemicalPAppliedKgHa: zero("Chemical P"),
      chemicalKAppliedKgHa: zero("Chemical K"),
    },
  };
}

export async function getFarmFertiliserDemandAction(planningSeason?: string): Promise<FarmFertiliserDemandActionResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("getFarmFertiliserDemandAction: no real farm for the current session");

  const now = new Date().toISOString();
  const [allFields, livestockGroups, slurryAllocations, slurryCompositionRecords, grazingSessions] = await Promise.all([
    listFieldsForFarm(farm.id),
    listLivestockGroupsForFarm(farm.id),
    listSlurryAllocationsForFarm(farm.id),
    listSlurryCompositionRecordsForFarm(farm.id),
    listGrazingFieldSessionsForFarm(farm.id, now),
  ]);
  const fields = activeFields(allFields);
  const currentSeason = now.slice(0, 4);
  const targetSeason = planningSeason ?? currentSeason;
  const targetCycles = await listFieldProductionCyclesForSeason(fields.map((field) => field.id), targetSeason);
  let p3Cycles = targetCycles;
  if (targetSeason > currentSeason) {
    const currentCycles = await listFieldProductionCyclesForSeason(fields.map((field) => field.id), currentSeason);
    const targetByField = new Map(targetCycles.map((cycle) => [cycle.fieldId, cycle]));
    p3Cycles = currentCycles.map((cycle) => targetByField.get(cycle.fieldId) ?? carryCycleForwardForQuotePlanning(cycle, targetSeason));
    for (const cycle of targetCycles) if (!p3Cycles.some((existing) => existing.fieldId === cycle.fieldId)) p3Cycles.push(cycle);
  }

  if (p3Cycles.length > 0 || targetSeason > currentSeason) {
    return buildP3FarmFertiliserDemandResult({ farm, fields, livestockGroups, slurryAllocations, slurryCompositionRecords, grazingSessions, now, p3Cycles, planningSeason: targetSeason });
  }

  const { demand, truncated, applicationsWithUnknownComposition, fieldsWithBlockedEvidence, aggregation } = await getFarmFertiliserDemand({
    farmId: farm.id,
    fields,
    livestockGroups,
    slurryAllocations,
    pBuildUpCompliance: farm.pBuildUpCompliance?.value,
    slurryCompositionRecords,
    asOfDate: now,
  });
  return {
    demand: demand.map((d) => toFarmInputDemand(farm.id, d)),
    purchaseRequirementTonnes: toFarmFertiliserPurchaseRequirementTonnes(demand),
    truncated,
    applicationsWithUnknownComposition,
    fieldsWithBlockedEvidence,
    aggregation,
    basket: buildFarmFertiliserQuoteBasket(aggregation, { farmId: farm.id, createdAt: now }),
  };
}


export interface AutomaticSlurryFieldRecommendation {
  fieldId: string;
  fieldName: string;
  housingId: string;
  storeName: string;
  applicationDate: string;
  applicationMethod: "LESS" | "splashplate";
  rateM3ha: number;
  volumeM3: number;
  availableNpkKgHa: { n: number; p: number; k: number };
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
      excludedFields: { fieldId: string; fieldName: string; reasonCode: string; message: string }[];
      limitations: string[];
    };

function isoAddDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextSupportedSpringSlurryDate(county: string, fromDate: string): string | undefined {
  const normalisedCounty = normaliseCountyForZoneLookup(county);
  const startYear = Number(fromDate.slice(0, 4));
  for (let yearOffset = 0; yearOffset <= 2; yearOffset++) {
    const year = startYear + yearOffset;
    const start = `${year}-01-01`;
    for (let i = 0; i < 120; i++) {
      const date = isoAddDays(start, i);
      if (date.slice(0, 4) !== String(year) || Number(date.slice(5, 7)) > 4) break;
      if (date < fromDate) continue;
      const gate = checkClosedPeriodCalendar({ county: normalisedCounty, date, material: "organic_fertiliser_other_than_FYM" });
      if (gate.status === "OK") return date;
    }
  }
  return undefined;
}

function roundDown1(value: number): number {
  return Math.floor((value + 1e-9) * 10) / 10;
}

/**
 * P3-native automatic slurry plan. This deliberately does not persist an
 * allocation: it is a planning recommendation that uses the same P3 gross
 * requirement and product-cost calculation as the chemical quote basket.
 */
export async function getAutomaticSlurryPlanAction(requestedPlanningDate?: string): Promise<AutomaticSlurryPlanActionResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("getAutomaticSlurryPlanAction: no real farm for the current session");
  const today = new Date().toISOString().slice(0, 10);
  const planningDate = requestedPlanningDate ?? nextSupportedSpringSlurryDate(farm.location.county, today);
  if (!planningDate) return { status: "blocked", reasonCode: "NO_SUPPORTED_SPRING_WINDOW", message: "Farm Return could not resolve a supported spring slurry date from the current county calendar." };
  const planningMonth = Number(planningDate.slice(5, 7));
  const calendarGate = checkClosedPeriodCalendar({ county: normaliseCountyForZoneLookup(farm.location.county), date: planningDate, material: "organic_fertiliser_other_than_FYM" });
  if (planningMonth < 1 || planningMonth > 4 || calendarGate.status !== "OK") {
    return { status: "blocked", reasonCode: "UNSUPPORTED_SLURRY_PLANNING_DATE", message: "Automatic slurry allocation currently uses a supported, baseline-open spring application date (January-April)." };
  }

  const [allFields, livestockGroups, housing, slurryCompositionRecords, existingAllocations, grazingSessions] = await Promise.all([
    listFieldsForFarm(farm.id),
    listLivestockGroupsForFarm(farm.id),
    listHousingForFarm(farm.id),
    listSlurryCompositionRecordsForFarm(farm.id),
    listSlurryAllocationsForFarm(farm.id),
    listGrazingFieldSessionsForFarm(farm.id),
  ]);
  const fields = activeFields(allFields);
  const season = planningDate.slice(0, 4);
  let p3Cycles = await listFieldProductionCyclesForSeason(fields.map((field) => field.id), season);
  const currentSeason = String(new Date().getUTCFullYear());
  if (p3Cycles.length !== fields.length && currentSeason !== season) {
    const currentCycles = await listFieldProductionCyclesForSeason(fields.map((field) => field.id), currentSeason);
    const existing = new Set(p3Cycles.map((cycle) => cycle.fieldId));
    p3Cycles = [
      ...p3Cycles,
      ...currentCycles.filter((cycle) => !existing.has(cycle.fieldId)).map((cycle) => carryForwardProductionCycle(cycle, season, planningDate)),
    ];
  }
  if (p3Cycles.length === 0) {
    return { status: "blocked", reasonCode: "MISSING_PRODUCTION_CYCLES", message: `No field has enough production-cycle evidence for an automatic slurry recommendation in ${season}.` };
  }

  const forecast = buildFarmSlurryForecast({ housing, livestockGroups, allocations: existingAllocations, asOfDate: today, targetDate: planningDate });
  if (forecast.status !== "READY") {
    return { status: "blocked", reasonCode: "INCOMPLETE_SLURRY_FORECAST", message: `${forecast.blockedStoreCount} store${forecast.blockedStoreCount === 1 ? " is" : "s are"} missing evidence needed for an automatic slurry plan.` };
  }
  if (forecast.projectedAvailableForNewPlanM3 <= 0) {
    return { status: "blocked", reasonCode: "NO_PROJECTED_SLURRY_AVAILABLE", message: `No unallocated slurry is projected to be available on ${planningDate}.` };
  }

  const cycleByField = new Map(p3Cycles.map((c) => [c.fieldId, c]));
  const compositionByHousing = currentSlurryCompositionByHousing(slurryCompositionRecords);
  const grasslandAreaHa = fields.reduce((sum, field) => {
    const cycle = cycleByField.get(field.id);
    return cycle && cropFamilyFor(cycle.cropSystem) === "grassland" ? sum + field.areaHa : sum;
  }, 0);
  const statutoryGsr = calculateStatutoryGrasslandStockingRateKgHa(livestockGroups, grasslandAreaHa);
  if (statutoryGsr.status !== "OK") {
    return { status: "blocked", reasonCode: "MISSING_GSR_FOR_LESS_GATE", message: "Farm Return cannot recommend a slurry application method until the statutory grassland stocking rate can be resolved from the livestock records." };
  }
  const gsrKgNHa = statutoryGsr.value.gsrKgNHa;
  const methodGate = checkLessMethodGate({ gsrKgNHa, material: "cattle_slurry", landUse: "grass", method: "splashplate" });
  const applicationMethod: "LESS" | "splashplate" = methodGate.status === "LEGAL_PROHIBITION" ? "LESS" : "splashplate";

  const storeRemaining = new Map<string, number>();
  const storeProvenHomeProducedRemaining = new Map<string, number>();
  for (const sf of forecast.stores) {
    if (sf.status !== "READY") continue;
    storeRemaining.set(sf.housingId, sf.projectedAvailableForNewPlanM3);
    // Only slurry actually forecast from this farm's own recorded livestock is
    // intrinsically proven home-produced here. The current observed tank
    // volume can include an unknown origin and is not silently reclassified.
    storeProvenHomeProducedRemaining.set(sf.housingId, Math.max(0, sf.producedM3 - sf.reservedM3));
  }
  const excludedFields: { fieldId: string; fieldName: string; reasonCode: string; message: string }[] = [];

  type Candidate = AutomaticSlurryFieldRecommendation & { desiredVolumeM3: number };
  const candidates: Candidate[] = [];
  for (const field of fields) {
    const cycle = cycleByField.get(field.id);
    if (!cycle) {
      excludedFields.push({ fieldId: field.id, fieldName: field.name, reasonCode: "MISSING_PRODUCTION_CYCLE", message: "No current production cycle is recorded for this field, so it was not ranked." });
      continue;
    }
    if (cropFamilyFor(cycle.cropSystem) !== "grassland") {
      excludedFields.push({ fieldId: field.id, fieldName: field.name, reasonCode: "NON_GRASSLAND", message: "The automatic slurry allocator currently supports grassland fields only." });
      continue;
    }
    if (!field.fertility.pIndex?.value || !field.fertility.kIndex?.value) {
      excludedFields.push({ fieldId: field.id, fieldName: field.name, reasonCode: "MISSING_SOIL_INDEX", message: "A verified P and K Index is required before Farm Return can recommend a slurry rate." });
      continue;
    }

    const grazingStockingInput = cycle.cropSystem === "GRASS_GRAZING"
      ? grazingStockingInputForField({ field, livestockGroups, sessions: grazingSessions, season, asOf: `${planningDate}T12:00:00.000Z`, ...(gsrKgNHa !== undefined ? { holdingFallbackKgHa: gsrKgNHa } : {}) })
      : {};
    const grazingSystem = cycle.cropSystem === "GRASS_GRAZING"
      ? resolveGrazingProductionSystem({ farm, fieldId: field.id, cycle, sessions: grazingSessions })
      : null;
    const gross = calculateGrassFertiliserV2({
      field, cycle, ...grazingStockingInput,
      ...(grazingSystem?.value ? { grazingProductionSystem: grazingSystem.value } : {}),
      organicCreditsKgHa: { n: 0, p: 0, k: 0 },
    });
    if (gross.status !== "READY" || !gross.grossRequirementKgHa) continue;
    const baselineProducts = allocatePurchasedProducts(gross.grossRequirementKgHa.n, gross.grossRequirementKgHa.p, gross.grossRequirementKgHa.k, field.areaHa);

    for (const store of housing) {
      const availableStore = storeRemaining.get(store.id) ?? 0;
      if (availableStore <= 0 || store.shedType !== "slatted") continue;
      const composition = resolveEffectiveSlurryComposition(compositionByHousing.get(store.id));
      const synthetic: SlurryAllocation = {
        fieldId: field.id,
        housingId: store.id,
        volumeM3: field.areaHa,
        applicationMethod: tracked(applicationMethod, "estimated", "Farm Return automatic slurry planning"),
        applicationDate: tracked(planningDate, "estimated", "Farm Return automatic slurry planning"),
      };
      const oneM3 = resolveAvailableSlurryNutrients({ allocation: synthetic, applicationRateM3ha: 1, dmPct: composition.dmPct, dmPctStatus: composition.status, pIndex: field.fertility.pIndex.value, kIndex: field.fertility.kIndex.value });
      if (oneM3.status !== "OK") continue;
      const pIndex4 = field.fertility.pIndex.value === 4;
      const provenHomeProducedM3 = storeProvenHomeProducedRemaining.get(store.id) ?? 0;
      const limits: number[] = [];
      for (const [key, perM3] of [["n", oneM3.value.n], ["p", oneM3.value.p], ["k", oneM3.value.k]] as const) {
        const req = gross.grossRequirementKgHa[key];
        if (perM3 <= 0) continue;
        if (key === "p" && pIndex4 && provenHomeProducedM3 > 0) continue;
        limits.push(req / perM3);
      }
      if (limits.length === 0) continue;
      let usefulRate = roundDown1(Math.max(0, Math.min(...limits)));
      if (pIndex4) {
        // Article 17(8)/Tables 15a/15b footnote 3 pathway: only the portion
        // positively evidenced as produced by this holding's livestock may
        // bypass the zero P-demand cap on an Index 4 field. Current physical
        // tank volume of unknown origin is never treated as home-produced.
        if (provenHomeProducedM3 <= 0) {
          excludedFields.push({ fieldId: field.id, fieldName: field.name, reasonCode: "P4_HOME_PRODUCED_SURPLUS_NOT_PROVEN", message: "P Index 4 has no routine P requirement. Farm Return can only recommend surplus home-produced grazing-livestock manure here once that slurry is positively evidenced as produced on this holding." });
          continue;
        }
        usefulRate = Math.min(usefulRate, roundDown1(provenHomeProducedM3 / field.areaHa));
      }
      if (usefulRate <= 0) continue;
      const desiredVolumeM3 = usefulRate * field.areaHa;
      const candidateRate = usefulRate;
      const credit = resolveAvailableSlurryNutrients({ allocation: synthetic, applicationRateM3ha: candidateRate, dmPct: composition.dmPct, dmPctStatus: composition.status, pIndex: field.fertility.pIndex.value, kIndex: field.fertility.kIndex.value });
      if (credit.status !== "OK") continue;
      const after = calculateGrassFertiliserV2({
        field, cycle, ...grazingStockingInput,
        ...(grazingSystem?.value ? { grazingProductionSystem: grazingSystem.value } : {}),
        organicCreditsKgHa: credit.value,
      });
      if (after.status !== "READY" || !after.remainingRequirementKgHa) continue;
      const afterProducts = allocatePurchasedProducts(after.remainingRequirementKgHa.n, after.remainingRequirementKgHa.p, after.remainingRequirementKgHa.k, field.areaHa);
      const saving = Math.max(0, baselineProducts.totalCostEur - afterProducts.totalCostEur);
      candidates.push({
        fieldId: field.id, fieldName: field.name, housingId: store.id, storeName: store.shedName,
        applicationDate: planningDate, applicationMethod, rateM3ha: candidateRate, volumeM3: desiredVolumeM3,
        desiredVolumeM3, availableNpkKgHa: credit.value,
        baselineChemicalCostEur: baselineProducts.totalCostEur, withSlurryChemicalCostEur: afterProducts.totalCostEur,
        estimatedChemicalSavingEur: saving, estimatedSavingEurPerM3: desiredVolumeM3 > 0 ? saving / desiredVolumeM3 : 0,
        basis: "P3_PURCHASE_REDUCTION",
      });
    }
  }

  candidates.sort((a, b) => b.estimatedSavingEurPerM3 - a.estimatedSavingEurPerM3 || a.fieldId.localeCompare(b.fieldId) || a.housingId.localeCompare(b.housingId));
  const selected: AutomaticSlurryFieldRecommendation[] = [];
  const selectedFields = new Set<string>();
  for (const candidate of candidates) {
    if (selectedFields.has(candidate.fieldId)) continue;
    const available = storeRemaining.get(candidate.housingId) ?? 0;
    if (available <= 0) continue;
    const volume = Math.min(candidate.desiredVolumeM3, available);
    const rate = roundDown1(volume / fields.find((f) => f.id === candidate.fieldId)!.areaHa);
    if (rate <= 0) continue;
    const actualVolume = rate * fields.find((f) => f.id === candidate.fieldId)!.areaHa;
    const composition = resolveEffectiveSlurryComposition(compositionByHousing.get(candidate.housingId));
    const allocation: SlurryAllocation = {
      fieldId: candidate.fieldId, housingId: candidate.housingId, volumeM3: actualVolume,
      applicationMethod: tracked(applicationMethod, "estimated", "Farm Return automatic slurry planning"),
      applicationDate: tracked(planningDate, "estimated", "Farm Return automatic slurry planning"),
    };
    const field = fields.find((f) => f.id === candidate.fieldId)!;
    const credit = resolveAvailableSlurryNutrients({ allocation, applicationRateM3ha: rate, dmPct: composition.dmPct, dmPctStatus: composition.status, pIndex: field.fertility.pIndex!.value, kIndex: field.fertility.kIndex!.value });
    if (credit.status !== "OK") continue;
    selected.push({ ...candidate, rateM3ha: rate, volumeM3: actualVolume, availableNpkKgHa: credit.value });
    selectedFields.add(candidate.fieldId);
    storeRemaining.set(candidate.housingId, Math.max(0, available - actualVolume));
    const selectedField = fields.find((f) => f.id === candidate.fieldId)!;
    if (selectedField.fertility.pIndex?.value === 4) {
      storeProvenHomeProducedRemaining.set(candidate.housingId, Math.max(0, (storeProvenHomeProducedRemaining.get(candidate.housingId) ?? 0) - actualVolume));
    }
  }

  const allocatedM3 = selected.reduce((sum, r) => sum + r.volumeM3, 0);
  return {
    status: "ready", planningDate, expectedAvailableM3: forecast.projectedAvailableForNewPlanM3,
    allocatedM3, unallocatedM3: Math.max(0, forecast.projectedAvailableForNewPlanM3 - allocatedM3),
    recommendations: selected, excludedFields,
    limitations: [
      "This is a planning recommendation, not a persisted farmer allocation.",
      "Rates are capped so the model does not intentionally supply more N, P or K than the P3 gross field requirement from slurry alone.",
      "Finite slurry is prioritised by estimated P3 chemical-fertiliser cost reduction per m³ using the app's current CSO-backed product prices; it is not the legacy Economic Opportunity Engine.",
      "Fields without a current production cycle are excluded rather than blocking otherwise-valid field recommendations; the result is therefore not claimed to be a complete whole-farm optimum until every active field is classified.",
      "Index 4 phosphorus is only bypassed for the portion of slurry positively evidenced by this forecast as home-produced from this holding's livestock; current physical tank volume of unknown origin remains fail-closed.",
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
export async function getSlurryStorageForecastAction(targetDate: string): Promise<SlurryStorageForecastActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || Number.isNaN(new Date(`${targetDate}T00:00:00.000Z`).getTime())) {
    throw new Error("getSlurryStorageForecastAction: invalid target date");
  }
  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("getSlurryStorageForecastAction: no real farm for the current session");
  const [livestockGroups, housing, allocations] = await Promise.all([
    listLivestockGroupsForFarm(farm.id),
    listHousingForFarm(farm.id),
    listSlurryAllocationsForFarm(farm.id),
  ]);
  const forecast = buildFarmSlurryForecast({
    housing, livestockGroups, allocations,
    asOfDate: new Date().toISOString().slice(0, 10),
    targetDate,
  });
  if (forecast.status !== "READY") {
    return { status: "blocked", forecast, message: `${forecast.blockedStoreCount} slurry store${forecast.blockedStoreCount === 1 ? " is" : "s are"} missing the evidence needed for a complete future-volume forecast.` };
  }
  return { status: "ready", forecast };
}

export type SlurryFirstProductionBasis = "TARGET_SEASON_SAVED" | "CARRY_FORWARD_CURRENT_SETTINGS";

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
      allocations: { fieldId: string; fieldName: string; housingId: string; storeName: string; volumeM3: number; applicationDate: string; applicationMethod: string }[];
      baseline: FarmFertiliserDemandActionResult;
      withPlannedSlurry: FarmFertiliserDemandActionResult;
      automaticOptimisation: {
        status: "BLOCKED";
        reasonCode: "P3_ECONOMIC_ADAPTER_NOT_AVAILABLE";
        message: string;
      };
    };

function forecastEvidenceValue<T>(value: EvidenceValue<T> | undefined, sourceSeason: string, planningDate: string): EvidenceValue<T> | undefined {
  if (!value) return undefined;
  return {
    value: value.value,
    method: "ASSUMED",
    source: `Planning scenario: carried forward from ${sourceSeason} (${value.source})`,
    sourceDate: planningDate,
    note: "Scenario-only carry-forward. Confirm or change this value before adopting the future-season plan.",
    previous: value,
  };
}

function carryForwardProductionCycle(cycle: FieldProductionCycle, targetSeason: string, planningDate: string): FieldProductionCycle {
  const evidence: FieldProductionCycleEvidence = {
    cropSystem: forecastEvidenceValue(cycle.evidence.cropSystem, cycle.season, planningDate),
    grazingProductionSystem: forecastEvidenceValue(cycle.evidence.grazingProductionSystem, cycle.season, planningDate),
    productionTargetTDMHa: forecastEvidenceValue(cycle.evidence.productionTargetTDMHa, cycle.season, planningDate),
    whiteCloverPct: forecastEvidenceValue(cycle.evidence.whiteCloverPct, cycle.season, planningDate),
    reseededOn: forecastEvidenceValue(cycle.evidence.reseededOn, cycle.season, planningDate),
    chemicalNAppliedKgHa: { value: 0, method: "ASSUMED", source: "Planning scenario: no chemical fertiliser applied at season start", sourceDate: planningDate },
    chemicalPAppliedKgHa: { value: 0, method: "ASSUMED", source: "Planning scenario: no chemical fertiliser applied at season start", sourceDate: planningDate },
    chemicalKAppliedKgHa: { value: 0, method: "ASSUMED", source: "Planning scenario: no chemical fertiliser applied at season start", sourceDate: planningDate },
  };
  return {
    ...cycle,
    id: `forecast-${cycle.id}-${targetSeason}`,
    season: targetSeason,
    status: "planned",
    evidence,
    createdAt: planningDate + "T00:00:00.000Z",
    updatedAt: planningDate + "T00:00:00.000Z",
  };
}

/**
 * Future-season slurry-first fertiliser planning.
 *
 * A farmer forecast is INTENT, never current physical storage. It is
 * therefore never written to `slurry_allocations`, whose contract reserves
 * slurry physically available now. Instead the scenario is evaluated in
 * memory against the target season's P3 production cycles. The same P3 farm
 * aggregation is run twice: no slurry, then the explicit forecast
 * allocations. The latter is the procurement preview.
 *
 * Automatic best-return selection is deliberately blocked here until the
 * Economic Opportunity Engine consumes P3 rather than the legacy
 * `calculateNutrientPlan` path. Explicit forecast allocations are safe to
 * preview; cross-engine ranking is not.
 */
export async function previewSlurryFirstFertiliserPlanAction(input: SlurryFirstPreviewInput): Promise<SlurryFirstFertiliserPlanResult> {
  const scenario = buildSlurryPlanningScenario(input);
  if (scenario.status === "INVALID") return { status: "validation_error", issues: scenario.issues };

  const farm = await getFarmForCurrentUser();
  if (!farm) throw new Error("previewSlurryFirstFertiliserPlanAction: no real farm for the current session");

  const [allFields, livestockGroups, housingList, slurryCompositionRecords] = await Promise.all([
    listFieldsForFarm(farm.id),
    listLivestockGroupsForFarm(farm.id),
    listHousingForFarm(farm.id),
    listSlurryCompositionRecordsForFarm(farm.id),
  ]);
  const fields = activeFields(allFields);
  const fieldById = new Map(fields.map((field) => [field.id, field]));
  const housingById = new Map(housingList.map((housing) => [housing.id, housing]));

  const identityIssues: string[] = [];
  const perStorePlanned = new Map<string, number>();
  for (const candidate of scenario.candidates) {
    if (!fieldById.has(candidate.fieldId)) identityIssues.push("FIELD_NOT_FOUND");
    const store = housingById.get(candidate.housingId);
    if (!store) {
      identityIssues.push("STORE_NOT_FOUND");
      continue;
    }
    perStorePlanned.set(candidate.housingId, (perStorePlanned.get(candidate.housingId) ?? 0) + candidate.volumeM3);
  }
  for (const [housingId, volumeM3] of perStorePlanned) {
    const capacityM3 = housingById.get(housingId)?.storageCapacityM3;
    if (capacityM3 !== undefined && volumeM3 > capacityM3 + 1e-9) identityIssues.push("STORE_CAPACITY_EXCEEDED");
  }
  if (identityIssues.length > 0) return { status: "validation_error", issues: [...new Set(identityIssues)] };

  const season = scenario.planningDate.slice(0, 4);
  let p3Cycles = await listFieldProductionCyclesForSeason(fields.map((field) => field.id), season);
  let carriedForwardFromSeason: string | undefined;
  if (p3Cycles.length !== fields.length && input.productionBasis === "CARRY_FORWARD_CURRENT_SETTINGS") {
    const currentSeason = String(new Date().getUTCFullYear());
    const currentCycles = await listFieldProductionCyclesForSeason(fields.map((field) => field.id), currentSeason);
    if (currentCycles.length === fields.length) {
      p3Cycles = currentCycles.map((cycle) => carryForwardProductionCycle(cycle, season, scenario.planningDate));
      carriedForwardFromSeason = currentSeason;
    }
  }
  if (p3Cycles.length !== fields.length) {
    return {
      status: "blocked",
      reasonCode: "MISSING_TARGET_SEASON_PRODUCTION_CYCLES",
      message: input.productionBasis === "CARRY_FORWARD_CURRENT_SETTINGS"
        ? `Farm Return could not build a complete ${season} planning basis because one or more active fields also lack a current-season production cycle.`
        : `A ${season} production cycle is required for every active field. You can instead explicitly carry forward the current field production settings as a forecast starting point.`,
    };
  }

  const scenarioAllocations: SlurryAllocation[] = scenario.candidates.map((candidate) => ({
    fieldId: candidate.fieldId,
    housingId: candidate.housingId,
    volumeM3: candidate.volumeM3,
    applicationMethod: tracked(candidate.applicationMethod, "farmer_adjusted", "Farmer forecast slurry plan", { sourceDate: scenario.planningDate }),
    applicationDate: tracked(candidate.applicationDate, "farmer_adjusted", "Farmer forecast slurry plan", { sourceDate: scenario.planningDate }),
  }));
  const asOf = `${scenario.planningDate}T12:00:00.000Z`;

  const [baseline, withPlannedSlurry] = await Promise.all([
    buildP3FarmFertiliserDemandResult({ farm, fields, livestockGroups, slurryAllocations: [], slurryCompositionRecords, grazingSessions: [], now: asOf, p3Cycles, planningSeason: season }),
    buildP3FarmFertiliserDemandResult({ farm, fields, livestockGroups, slurryAllocations: scenarioAllocations, slurryCompositionRecords, grazingSessions: [], now: asOf, p3Cycles, planningSeason: season }),
  ]);

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
    allocations: scenario.candidates.map((candidate) => ({
      fieldId: candidate.fieldId,
      fieldName: fieldById.get(candidate.fieldId)!.name,
      housingId: candidate.housingId,
      storeName: housingById.get(candidate.housingId)!.shedName,
      volumeM3: candidate.volumeM3,
      applicationDate: candidate.applicationDate,
      applicationMethod: candidate.applicationMethod,
    })),
    baseline,
    withPlannedSlurry,
    automaticOptimisation: {
      status: "BLOCKED",
      reasonCode: "P3_ECONOMIC_ADAPTER_NOT_AVAILABLE",
      message: "Automatic best-return slurry allocation is held back because the current whole-farm economic optimiser still evaluates the legacy nutrient engine. Forecast allocations can be previewed safely through P3, but Farm Return will not rank them across incompatible agronomy engines.",
    },
  };
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
    throw new Error("getFarmLimeRequirementAction: no real farm for the current session");
  }
  // Grassland Fertiliser Pilot Completion, Checkpoint A (audit finding
  // F2) — an archived field must never contribute to this farm-wide
  // total, the same rule every other farm-wide aggregation in this app
  // now applies.
  const fields = activeFields(await listFieldsForFarm(farm.id));
  return aggregateFarmLimeRequirement(fields);
}
