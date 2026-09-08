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
import { FERTILISER_RECOMMENDATION_PROMPT_KIND, type FertiliserRecommendationSummary } from "@/orchestration/prompt/fertiliser-recommendation";
import { getFieldRemainingFertiliserRequirement, getFarmFertiliserDemand } from "@/orchestration/fertiliser-plan";
import { toFarmInputDemand, type FertiliserNutrientContributionKg, type FarmInputDemand } from "@/domain/fertiliser-plan";

/** `Decision.calculationKind` for a real planned fertiliser application —
 * identical string to the Prompt kind it was decided from
 * (`decideAsFarmer` copies `Prompt.kind` verbatim into
 * `calculationKind`). */
const FERTILISER_PLAN_CALCULATION_KIND: string = FERTILISER_RECOMMENDATION_PROMPT_KIND;

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
 * `"edited"`, and not already linked to any job session (checked against
 * `listJobSessionDecisionIdsForFarm`, defense in depth on top of the
 * database's own `unique(decision_id)` constraint). No time-window
 * narrowing is applied: this app's only real "planned date" is the
 * optional, farmer-entered `edits.plannedDate`, so a hard window would
 * silently exclude a genuine undated plan rather than make matching
 * safer. If more than one real candidate remains, this returns
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

  const [{ decisions, truncated: decisionsTruncated }, { decisionIds: linkedDecisionIds, truncated: linksTruncated }] = await Promise.all([
    listDecisionsForFarm(farm.id),
    listJobSessionDecisionIdsForFarm(farm.id),
  ]);

  const candidates = decisions.filter(
    (d) =>
      d.fieldId === fieldId &&
      d.calculationKind === FERTILISER_PLAN_CALCULATION_KIND &&
      (d.outcome === "accepted" || d.outcome === "edited") &&
      !linkedDecisionIds.has(d.id),
  );

  if (decisionsTruncated || linksTruncated) {
    return { status: "ambiguous", candidateCount: candidates.length };
  }
  if (candidates.length === 0) return { status: "none" };
  if (candidates.length > 1) return { status: "ambiguous", candidateCount: candidates.length };
  return { status: "matched", plan: candidates[0] };
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

  const farm = await getFarmForCurrentUser();
  if (!farm) {
    throw new Error("startJobSessionFromPlanAction: no real farm for the current session");
  }

  const fields = await listFieldsForFarm(farm.id);
  if (!fields.some((f) => f.id === input.fieldId)) {
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

  const { decisionIds: linkedDecisionIds } = await listJobSessionDecisionIdsForFarm(farm.id);
  if (linkedDecisionIds.has(plan.id)) {
    throw new Error(`startJobSessionFromPlanAction: plan ${plan.id} is already linked to a job session`);
  }

  const now = new Date().toISOString();
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

  return {
    decisionId: plan.id,
    fieldId: plan.fieldId,
    recommendedProducts: recommendation.products,
    plannedProduct: edits?.plannedProduct,
    plannedQuantityKg: edits?.plannedQuantityKg,
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
  const { demand, truncated } = await getFarmFertiliserDemand({ farmId: farm.id, fields, livestockGroups, slurryAllocations });
  return { demand: demand.map((d) => toFarmInputDemand(farm.id, d)), truncated };
}
