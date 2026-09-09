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
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import { startJobSessionFromPlan, type StartJobSessionResult } from "@/orchestration/job-session";
import { recomputePromptByKind } from "@/orchestration/prompt/recompute";
import {
  FERTILISER_RECOMMENDATION_PROMPT_KIND,
  sanitiseRecommendedProduct,
  type FertiliserRecommendationSummary,
} from "@/orchestration/prompt/fertiliser-recommendation";
import { getFieldRemainingFertiliserRequirement, getFarmFertiliserDemand, sanitiseDecisionRecordForClient, selectedProductName } from "@/orchestration/fertiliser-plan";
import { toFarmInputDemand, type FertiliserNutrientContributionKg, type FarmInputDemand } from "@/domain/fertiliser-plan";
import type { Farm, Field, FertiliserProduct, LivestockGroup, SlurryAllocation } from "@/domain/types";

/** `Decision.calculationKind` for a real planned fertiliser application —
 * identical string to the Prompt kind it was decided from
 * (`decideAsFarmer` copies `Prompt.kind` verbatim into
 * `calculationKind`). */
const FERTILISER_PLAN_CALCULATION_KIND: string = FERTILISER_RECOMMENDATION_PROMPT_KIND;

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
): FertiliserRecommendationSummary | undefined {
  const prompt = recomputePromptByKind({
    promptKind: FERTILISER_RECOMMENDATION_PROMPT_KIND,
    farm,
    field,
    allFields,
    livestockGroups,
    slurryAllocations,
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

  const [{ decisions, truncated: decisionsTruncated }, { decisionIds: linkedDecisionIds, truncated: linksTruncated }, fields, livestockGroups, slurryAllocations] = await Promise.all([
    listDecisionsForFarm(farm.id),
    listJobSessionDecisionIdsForFarm(farm.id),
    listFieldsForFarm(farm.id),
    listLivestockGroupsForFarm(farm.id),
    listSlurryAllocationsForFarm(farm.id),
  ]);
  // Codex audit CRITICAL (round 7): needed to recompute this field's
  // *current* live recommendation below — see
  // `isPlanStillCurrentlyRecommendable`'s own doc comment. No real field
  // means no real candidate either way.
  const field = fields.find((f) => f.id === fieldId);
  if (!field) return { status: "none" };

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
  const currentRecommendation = getCurrentFertiliserRecommendation(farm, field, fields, livestockGroups, slurryAllocations, new Date().toISOString());
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

  const fields = await listFieldsForFarm(farm.id);
  const field = fields.find((f) => f.id === input.fieldId);
  if (!field) {
    throw new Error(`startJobSessionFromPlanAction: field ${input.fieldId} not found on the current session's farm`);
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
  const [livestockGroups, slurryAllocations] = await Promise.all([listLivestockGroupsForFarm(farm.id), listSlurryAllocationsForFarm(farm.id)]);
  const currentRecommendation = getCurrentFertiliserRecommendation(farm, field, fields, livestockGroups, slurryAllocations, now);
  if (!currentRecommendation || !isPlanProductStillRecommended(plan, currentRecommendation)) {
    throw new Error(`startJobSessionFromPlanAction: plan ${plan.id}'s field is no longer currently recommendable — not safely executable as one job`);
  }

  const { decisionIds: linkedDecisionIds } = await listJobSessionDecisionIdsForFarm(farm.id);
  if (linkedDecisionIds.has(plan.id)) {
    throw new Error(`startJobSessionFromPlanAction: plan ${plan.id} is already linked to a job session`);
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
      requirementKgHa: FertiliserNutrientContributionKg;
      confirmedAppliedKgHa?: FertiliserNutrientContributionKg;
      remainingKgHa?: FertiliserNutrientContributionKg;
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

export async function getFieldFertiliserStatusAction(fieldId: string): Promise<FieldFertiliserStatusResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error("getFieldFertiliserStatusAction: no real farm for the current session");
  }
  const fields = await listFieldsForFarm(farm.id);
  const field = fields.find((f) => f.id === fieldId);
  if (!field) {
    throw new Error(`getFieldFertiliserStatusAction: field ${fieldId} not found on the current session's farm`);
  }

  const now = new Date().toISOString();
  const prompt = recomputePromptByKind({
    promptKind: FERTILISER_RECOMMENDATION_PROMPT_KIND,
    farm,
    field,
    allFields: fields,
    livestockGroups: await listLivestockGroupsForFarm(farm.id),
    slurryAllocations: await listSlurryAllocationsForFarm(farm.id),
    now,
  });

  if (prompt.basis.status === "NOT_APPLICABLE") return { status: "not_applicable" };
  if (prompt.basis.status !== "OK") return { status: "blocked", reasonCode: prompt.basis.reasonCode };

  const recommendation = prompt.basis.value as FertiliserRecommendationSummary;
  const remaining = await getFieldRemainingFertiliserRequirement({
    farmId: farm.id,
    fieldId: field.id,
    requirementKgHa: recommendation.requirementKgHa,
    areaHa: field.areaHa,
  });

  return {
    status: "ok",
    requirementKgHa: remaining.requirementKgHa,
    confirmedAppliedKgHa: remaining.confirmedAppliedKgHa,
    remainingKgHa: remaining.remainingKgHa,
    blockedReasonCode: remaining.blockedReasonCode,
    confirmedApplications: remaining.confirmedApplications,
    applicationsWithUnknownComposition: remaining.applicationsWithUnknownComposition,
    applicationsExcludedMultiField: remaining.applicationsExcludedMultiField,
    truncated: remaining.truncated,
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
  /** True when a real, farm-scoped read this aggregation depends on
   * (planned Decisions or confirmed Actuals) hit its own row cap — the
   * totals above may understate the truth. */
  truncated: boolean;
}

export async function getFarmFertiliserDemandAction(): Promise<FarmFertiliserDemandActionResult> {
  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error("getFarmFertiliserDemandAction: no real farm for the current session");
  }
  const [fields, livestockGroups, slurryAllocations] = await Promise.all([
    listFieldsForFarm(farm.id),
    listLivestockGroupsForFarm(farm.id),
    listSlurryAllocationsForFarm(farm.id),
  ]);
  const { demand, truncated } = await getFarmFertiliserDemand({
    farmId: farm.id,
    fields,
    livestockGroups,
    slurryAllocations,
    // Codex audit HIGH (round 14): this farm's real Article 17(6)
    // evidence — previously never supplied, forcing every farm's
    // recommendation through the "not proven" P route.
    pBuildUpCompliance: farm.pBuildUpCompliance?.value,
  });
  return { demand: demand.map((d) => toFarmInputDemand(farm.id, d)), truncated };
}
