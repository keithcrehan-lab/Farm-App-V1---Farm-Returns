"use server";

/**
 * What Matters pilot — live server-side wiring of the full audited chain
 * (`calculateNutrientPlan` -> Phase 5 -> Phase 7/7.1 -> Phase 8 -> Phase 11A
 * -> Phase 11B -> `SLURRY_ACTIONABILITY_POLICY_IE_V1` -> Phase 10 -> Phase 9
 * -> `what-matters-presentation.ts`) against this farm's REAL fields, real
 * slurry allocations, real livestock, real Met Éireann weather/forecast, and
 * real persisted CSO fertiliser-price evidence.
 *
 * Every frozen domain module is used exactly as-is, unmodified, via its own
 * real production entry point — this file adds NO new economic, scientific
 * or ranking logic. It only assembles real inputs and passes them through.
 *
 * Real Dev-state note (Phase 2/3's own audit, still true today): the
 * persisted `market_price_observations` table has no confirmed permanent
 * sync run against it. If it is genuinely empty, `resolveMarketReferencePrice`
 * legitimately returns BLOCKED for every product, Phase 5 assessments come
 * back unquantified, and the real result below is an honest "no current
 * recommendation" — never a fabricated fallback value.
 *
 * One evaluation timestamp (`evaluatedAt`) is generated ONCE per fresh
 * evaluation and threaded through every layer (Phase 11A, Phase 11B, the
 * policy, farmer-declaration binding) — never a fresh `new Date()` per
 * layer. `evaluateWhatMattersPilot` always re-fetches real weather using
 * the SAME `evaluatedAt` when one is supplied (the farmer-confirmation
 * flow), since every layer below already rejects evidence bound to a
 * different evaluation moment; only an explicit refresh (no `evaluatedAt`
 * supplied) starts a genuinely new evaluation.
 *
 * Never falls back to the legacy `Prompt`/`select-primary.ts` recommendation
 * path on any failure — a thrown error anywhere in this action resolves to
 * an honest `{status: "error"}` result, which the UI renders as "unable to
 * verify a recommendation right now", never a silently-swapped-in unaudited
 * Prompt (brief §11).
 */
import { createHash } from "node:crypto";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { getLatestContractorCostRateForFarm, createContractorCostRateRecord, type PersistedContractorCostRate } from "@/lib/farm-data/slurry-contractor-cost";
import { createClient } from "@/lib/supabase/server";
import { computeFarmGrasslandAggregates } from "@/orchestration/prompt/build-all";
import { calculateNutrientPlan, resolveFieldSlurryAllocation } from "@/domain/nutrients";
import { findObservationsByMappedProduct } from "@/server/market/cso-fertiliser-repository";
import { resolveMarketReferencePrice, type AuditableMarketPriceResolution } from "@/domain/market-price-resolution";
import type { EngineOutcome } from "@/domain/evidence";
import { buildSlurryDirectEconomicAssessment, type SlurryDirectEconomicAssessment } from "@/domain/slurry-direct-economic-assessment";
import {
  createAuditedActionOpportunityRecord,
  AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION,
  type AuditedActionOpportunityRecord,
} from "@/domain/audited-opportunity-record";
import { ASSESSMENT_INTEGRITY_SCHEMA_VERSION } from "@/domain/assessment-integrity";
import { rankOpportunities, RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT, type OpportunityRankingResult } from "@/domain/opportunity-ranking";
import { RECOMMENDATION_SELECTION_MODE_TOP_ACTIONABLE_AUDITED_OPPORTUNITY } from "@/domain/recommendation-selection";
import { buildSpreadingActionabilityFoundation } from "@/domain/spreading-actionability-foundation";
import { buildRainfallWindowScore } from "@/domain/rainfall-window-score";
import {
  evaluateSlurryActionability,
  createFarmerDeclarationEvidence,
  type SlurryActionabilityEvaluation,
  type FarmerDeclarationEvidence,
  type FarmerConfirmationCode,
} from "@/domain/slurry-actionability-policy";
import { buildWhatMattersPilotPresentation, type WhatMattersPilotResult } from "@/domain/what-matters-presentation";
import {
  resolveSlurryRealisationCostFromFarmerRate,
  createFarmerContractorCostDeclaration,
  validateContractorCostRate,
  type SlurryRealisationCostResolution,
  type FarmerContractorCostDeclaration,
} from "@/domain/slurry-realisation-cost";
import { getWeatherForField } from "@/server/weather/weather-service";
import { meteireannLocationForecastProvider } from "@/server/weather/forecast-provider";
import type { Field } from "@/domain/types";

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** The three, and only three, canonical products the real scientific plan
 * can ever recommend (`nutrients.ts`'s own `PRODUCTS`) — real persisted
 * price evidence is resolved for all three regardless of which ones a
 * given plan actually uses, matching Phase 4's own established
 * `resolvedPricesByProduct` contract. */
const CANONICAL_PRODUCTS = ["0-7-30", "18-6-12", "Protected Urea"] as const;

async function resolvedPricesByProduct(asOfDate: string): Promise<Record<string, EngineOutcome<AuditableMarketPriceResolution>>> {
  const supabase = await createClient();
  const result: Record<string, EngineOutcome<AuditableMarketPriceResolution>> = {};
  for (const product of CANONICAL_PRODUCTS) {
    const rows = await findObservationsByMappedProduct(supabase, product);
    result[product] = resolveMarketReferencePrice({
      candidates: rows.map((r) => r.observation),
      mappedProduct: product,
      asOfDate,
    });
  }
  return result;
}

export interface WhatMattersPilotCandidateContext {
  fieldId: string;
  fieldName: string;
  evaluatedActionId: string;
  assessmentId: string;
}

export type WhatMattersPilotActionResult =
  | {
      status: "ok";
      result: WhatMattersPilotResult;
      evaluatedAt: string;
      declarations: FarmerDeclarationEvidence[];
      /** The raw rate string currently on record for this farm, or `null` if
       * none has been entered yet — never a `FarmerContractorCostDeclaration`
       * object. Safe to echo to the client: it is re-validated and
       * reconstructed into trusted, server-side declarations on every
       * subsequent call, never trusted back as pre-built evidence. */
      contractorRatePerHa: string | null;
      candidateContext: Record<string, WhatMattersPilotCandidateContext>;
      rainfallScoreByRecordId: Record<string, string | null>;
    }
  | { status: "error"; message: string };

interface BuiltCandidate {
  record: AuditedActionOpportunityRecord;
  field: Field;
}

/** One real, well-formed slurry action's canonical identity — computed
 * once from the field/allocation, before any economics run, so both
 * `buildRealCandidates` (economics) and `saveFarmerContractorCostRate`
 * (evidence capture only, no economics) can bind a farmer's contractor
 * rate to the exact same real opportunity/assessment identity without
 * duplicating the id-template logic in two places. */
interface RealSlurryActionTarget {
  field: Field;
  allocation: NonNullable<ReturnType<typeof resolveFieldSlurryAllocation>>;
  evaluatedActionId: string;
  assessmentId: string;
  recordId: string;
}

function listRealSlurryActionTargets(fields: Field[], slurryAllocations: Awaited<ReturnType<typeof listSlurryAllocationsForFarm>>, asOfDate: string): RealSlurryActionTarget[] {
  const targets: RealSlurryActionTarget[] = [];
  for (const field of fields) {
    const allocation = resolveFieldSlurryAllocation(slurryAllocations, field.id);
    if (!allocation || !allocation.applicationMethod || !allocation.applicationDate) continue; // real, honest exclusion -- no fabricated method/date.
    const evaluatedActionId = `slurry-allocation-${field.id}-${allocation.housingId}`;
    targets.push({
      field,
      allocation,
      evaluatedActionId,
      assessmentId: `assessment-${evaluatedActionId}-${asOfDate}`,
      recordId: `record-${evaluatedActionId}-${asOfDate}`,
    });
  }
  return targets;
}

async function buildRealCandidates(
  fields: Field[],
  slurryAllocations: Awaited<ReturnType<typeof listSlurryAllocationsForFarm>>,
  livestockGroups: Awaited<ReturnType<typeof listLivestockGroupsForFarm>>,
  farmGrasslandAreaHa: number,
  asOfDate: string,
  createdAt: string,
  /** The farm's persisted contractor-rate record (latest row of
   * `slurry_contractor_cost_declarations`), or `null` if the farmer has
   * never declared one — NEVER a caller-supplied rate string or a
   * pre-built `FarmerContractorCostDeclaration` object. Codex audit
   * CRITICAL (fixed): an earlier version of this function accepted a
   * caller-supplied declaration array directly, which an exported Server
   * Action's own client bundle could submit with an arbitrary
   * rate/currency/timestamp/provenance, bypassing
   * `createFarmerContractorCostDeclaration`'s own validation entirely. A
   * later revision accepted a raw rate string but still let the client
   * supply the declaration's own timestamp (Codex audit HIGH, also
   * fixed) — the rate AND its timestamp now both come from the database,
   * the one place a farmer's own `saveFarmerContractorCostRate` call
   * writes to, never from anything else this function's own caller
   * passes in. */
  contractorCostRecord: PersistedContractorCostRate | null,
): Promise<{ candidates: BuiltCandidate[]; sourceEngineVersion: string | null; realisationCostResolutionByRecordId: Record<string, SlurryRealisationCostResolution> }> {
  const prices = await resolvedPricesByProduct(asOfDate);
  // `knownAt` is the assessment's own knowledge-cutoff, distinct from any
  // one product's price-resolution trace — real evidence when at least one
  // product genuinely resolved, else the same end-of-day-on-asOfDate
  // default `resolveMarketReferencePrice` itself falls back to when no
  // `knownAt` is supplied (its own header comment), so an all-BLOCKED
  // price set still produces a defensible, non-fabricated cutoff.
  const firstResolved = Object.values(prices).find((p) => p.status === "OK");
  const knownAt = firstResolved && firstResolved.status === "OK" ? firstResolved.value.trace.knownAt : `${asOfDate}T23:59:59.999Z`;
  const candidates: BuiltCandidate[] = [];
  let sourceEngineVersion: string | null = null;
  const realisationCostResolutionByRecordId: Record<string, SlurryRealisationCostResolution> = {};

  const targets = listRealSlurryActionTargets(fields, slurryAllocations, asOfDate);
  for (const { field, allocation, evaluatedActionId, assessmentId, recordId } of targets) {
    const baselinePlan = calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation: undefined, asOfDate });
    const interventionPlan = calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation: allocation, asOfDate });

    // Realisation cost now comes ONLY from a real farmer-entered contractor
    // rate -- never an automatic system value (see
    // `slurry-realisation-cost.ts`'s own header for why the earlier
    // automatic €120/ha benchmark was removed). The trusted declaration is
    // constructed HERE, server-side, from the persisted rate + its real
    // stored timestamp only -- never accepted pre-built, and never with a
    // caller-suppliable timestamp. A malformed/invalid rate (or no rate at
    // all) correctly yields no declaration, so realisation cost stays
    // `{status: "unknown"}`, matching Phase 5's own "absence of evidence
    // is never a known zero" rule.
    const target = { opportunityRecordId: recordId, boundAssessmentId: assessmentId, evaluatedActionId, fieldId: field.id };
    const trustedDeclarations: FarmerContractorCostDeclaration[] = [];
    if (contractorCostRecord !== null) {
      const outcome = createFarmerContractorCostDeclaration({
        id: `contractor-cost-${recordId}-${contractorCostRecord.declaredAt}`,
        opportunityRecordId: recordId,
        boundAssessmentId: assessmentId,
        evaluatedActionId,
        fieldId: field.id,
        ratePerHa: contractorCostRecord.ratePerHa,
        currency: "EUR",
        declaredAt: contractorCostRecord.declaredAt,
      });
      if (outcome.status === "OK") trustedDeclarations.push(outcome.declaration);
    }
    const realisationCostResolution = resolveSlurryRealisationCostFromFarmerRate(field, target, trustedDeclarations);

    const assessment: SlurryDirectEconomicAssessment = buildSlurryDirectEconomicAssessment({
      id: assessmentId,
      evaluatedActionId,
      fieldId: field.id,
      baselinePlan,
      interventionPlan,
      asOfDate,
      knownAt,
      resolvedPricesByProduct: prices,
      realisationCost: realisationCostResolution.input,
      createdAt,
    });
    sourceEngineVersion = assessment.engineVersion;

    const record = createAuditedActionOpportunityRecord({
      id: recordId,
      assessment,
      recordCreatedAt: createdAt,
      hash,
    });
    candidates.push({ record, field });
    realisationCostResolutionByRecordId[record.id] = realisationCostResolution;
  }

  return { candidates, sourceEngineVersion, realisationCostResolutionByRecordId };
}

/**
 * Runs (or re-runs) the full audited chain. Pass `evaluatedAt` +
 * `declarations` to re-evaluate after a farmer confirmation (same
 * evaluation moment, one more declaration) — omit `evaluatedAt` to start a
 * genuinely fresh evaluation (a real refresh, never mutating the old one).
 *
 * The farmer's contractor rate is never an input here — it is always
 * fetched fresh from `slurry_contractor_cost_declarations` (this farm's
 * one persisted, farm-level rate, written only by
 * `saveFarmerContractorCostRate`). This is deliberate, fixing two real
 * Codex audit findings from an earlier revision of this function that DID
 * accept it as a parameter: (1) HIGH — a client-suppliable rate on every
 * call meant the rate silently reset to "no rate" on every ordinary page
 * load/re-evaluation, contradicting the farmer's own "Save"; (2) HIGH — a
 * client-suppliable rate carried a client-suppliable timestamp too
 * (whatever `evaluatedAt` happened to be), which is not genuine
 * declaration provenance. Reading the persisted record here instead means
 * the rate and its real `declaredAt` are always the database's own,
 * regardless of what any caller passes in.
 */
export async function evaluateWhatMattersPilot(input?: { evaluatedAt?: string; declarations?: FarmerDeclarationEvidence[] }): Promise<WhatMattersPilotActionResult> {
  try {
    const farm = await getFarmForCurrentUser();
    if (!farm) return { status: "error", message: "No farm found for this account." };

    const [fields, slurryAllocations, livestockGroups, contractorCostRecord] = await Promise.all([
      listFieldsForFarm(farm.id),
      listSlurryAllocationsForFarm(farm.id),
      listLivestockGroupsForFarm(farm.id),
      getLatestContractorCostRateForFarm(farm.id),
    ]);

    const evaluatedAt = input?.evaluatedAt ?? new Date().toISOString();
    const declarations = input?.declarations ?? [];
    const contractorRatePerHa = contractorCostRecord?.ratePerHa ?? null;
    const asOfDate = evaluatedAt.slice(0, 10);
    const { farmGrasslandAreaHa } = computeFarmGrasslandAggregates(fields);

    const { candidates, sourceEngineVersion, realisationCostResolutionByRecordId } = await buildRealCandidates(fields, slurryAllocations, livestockGroups, farmGrasslandAreaHa, asOfDate, evaluatedAt, contractorCostRecord);

    if (candidates.length === 0 || sourceEngineVersion === null) {
      return {
        status: "ok",
        result: { kind: "none", reasonCode: "NO_RANKED_OPPORTUNITIES" },
        evaluatedAt,
        declarations,
        contractorRatePerHa,
        candidateContext: {},
        rainfallScoreByRecordId: {},
      };
    }

    const rankingResult: OpportunityRankingResult = rankOpportunities(
      candidates.map((c) => c.record),
      new Map(),
      {
        id: "what-matters-pilot-ranking-policy-v1",
        rankingMode: RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT,
        acceptedIntegritySchemaVersions: [ASSESSMENT_INTEGRITY_SCHEMA_VERSION],
        acceptedSourceEngineVersions: [sourceEngineVersion],
        acceptedRecordEngineVersions: [AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION],
        eligibleLifecycleStates: ["active"],
        freshness: { mode: "not_evaluated" },
        includeAdverseOutcomes: false,
        includeZeroOutcomes: false,
      },
      evaluatedAt,
    );

    // Codex audit HIGH (0fc5a25) + Codex re-verification MEDIUM (194e770):
    // real slurry allocations existed (candidates.length > 0) but NONE
    // reached Phase 8's own ranked set. The first fix pass treated this as
    // always meaning "genuinely unquantified" -- but the real ranking
    // policy above also sets `includeAdverseOutcomes: false` and
    // `includeZeroOutcomes: false`, so a candidate that IS fully
    // quantified (real price evidence, real economics) with a genuine
    // zero/adverse net result is ALSO correctly excluded from `ranked` --
    // that is Phase 9's own real, intended "none" case (evidence existed,
    // it just wasn't a positive opportunity), not a missing-evidence one.
    // Only report the honest "more information needed" state when at
    // least one real candidate's own `record.quantified` is `false` --
    // i.e. its economics genuinely could not be resolved (e.g. no
    // persisted CSO price evidence) -- never merely because nothing
    // positive survived the policy's own zero/adverse exclusion.
    if (candidates.length > 0 && rankingResult.ranked.length === 0 && candidates.some((c) => !c.record.quantified)) {
      return {
        status: "ok",
        result: { kind: "unknown", candidate: null, reasonCode: "ECONOMIC_EVIDENCE_UNAVAILABLE" },
        evaluatedAt,
        declarations,
        contractorRatePerHa,
        candidateContext: {},
        rainfallScoreByRecordId: {},
      };
    }

    const candidateByRecordId = new Map(candidates.map((c) => [c.record.id, c]));
    const rankedCandidates = rankingResult.ranked.map((r) => candidateByRecordId.get(r.recordId)).filter((c): c is BuiltCandidate => c !== undefined);

    // Real, sequential (not parallel) weather fetches per ranked candidate —
    // a handful of real fields at most for this pilot; sequential keeps the
    // real per-field county lookup below simple and avoids hammering the
    // real Met Éireann EDR endpoint with a burst of concurrent requests.
    const evaluationsByRecordId = new Map<string, SlurryActionabilityEvaluation>();
    const rainfallScoreByRecordId: Record<string, string | null> = {};
    for (const candidate of rankedCandidates) {
      const { evaluation, rainfallScore } = await evaluateActionabilityForCandidateWithCounty(candidate, evaluatedAt, declarations, farm.location.county);
      evaluationsByRecordId.set(candidate.record.id, evaluation);
      rainfallScoreByRecordId[candidate.record.id] = rainfallScore;
    }

    const presentation = buildWhatMattersPilotPresentation({
      rankingResult,
      decisionStates: new Map(),
      actionabilityEvaluationsByRecordId: evaluationsByRecordId,
      realisationCostResolutionByRecordId: new Map(Object.entries(realisationCostResolutionByRecordId)),
      recommendationPolicy: {
        id: "what-matters-pilot-recommendation-policy-v1",
        selectionMode: RECOMMENDATION_SELECTION_MODE_TOP_ACTIONABLE_AUDITED_OPPORTUNITY,
        recommendableLifecycleStates: ["active"],
        maxSelectedRecommendations: 1,
      },
      evaluatedAt,
      rainfallScoreByRecordId: new Map(Object.entries(rainfallScoreByRecordId)),
    });

    const candidateContext: Record<string, WhatMattersPilotCandidateContext> = {};
    for (const candidate of candidates) {
      candidateContext[candidate.record.id] = {
        fieldId: candidate.field.id,
        fieldName: candidate.field.name,
        evaluatedActionId: candidate.record.evaluatedActionId,
        assessmentId: candidate.record.assessmentId,
      };
    }

    return { status: "ok", result: presentation.result, evaluatedAt, declarations, contractorRatePerHa, candidateContext, rainfallScoreByRecordId };
  } catch (error: unknown) {
    console.error("[what-matters-pilot] evaluateWhatMattersPilot failed:", error);
    return { status: "error", message: "Unable to verify a recommendation right now." };
  }
}

async function evaluateActionabilityForCandidateWithCounty(candidate: BuiltCandidate, evaluatedAt: string, declarations: readonly FarmerDeclarationEvidence[], county: string): Promise<{ evaluation: SlurryActionabilityEvaluation; rainfallScore: string | null }> {
  const { record, field } = candidate;
  const now = new Date(evaluatedAt);

  const [rainfallObservation, rainfallForecast] = await Promise.all([
    getWeatherForField({ centroid: field.centroid }, { now, lookbackHours: 72 }),
    meteireannLocationForecastProvider.getForecastForField({ centroid: field.centroid }),
  ]);

  const foundation = buildSpreadingActionabilityFoundation({
    id: `foundation-${record.id}`,
    opportunityRecordId: record.id,
    boundAssessmentId: record.assessmentId,
    evaluatedActionId: record.evaluatedActionId,
    fieldId: field.id,
    fieldCentroid: field.centroid,
    county,
    date: evaluatedAt.slice(0, 10),
    proposedMaterial: "organic_fertiliser_other_than_FYM",
    evaluatedAt,
    rainfallObservation,
    rainfallForecast,
  });

  const rainfallScoreAssessment = buildRainfallWindowScore({
    id: `rainfall-score-${record.id}`,
    opportunityRecordId: record.id,
    boundAssessmentId: record.assessmentId,
    evaluatedActionId: record.evaluatedActionId,
    fieldId: field.id,
    fieldCentroid: field.centroid,
    evaluatedAt,
    rainfallObservation,
    rainfallForecast,
  });

  const evaluation = evaluateSlurryActionability({
    id: `actionability-${record.id}`,
    opportunityRecordId: record.id,
    boundAssessmentId: record.assessmentId,
    evaluatedActionId: record.evaluatedActionId,
    fieldId: field.id,
    evaluatedAt,
    foundation,
    rainfallScore: rainfallScoreAssessment,
    farmerDeclarations: declarations,
  });

  const rainfallScore = rainfallScoreAssessment.score.status === "OK" ? rainfallScoreAssessment.score.value.finalScore : null;
  return { evaluation, rainfallScore };
}

/** Creates one real, immutable farmer declaration and re-runs the full
 * audited chain (same `evaluatedAt`, all prior declarations plus this new
 * one) — never a local UI toggle. Rejects (structured, not thrown) rather
 * than silently accepting a malformed confirmation. */
export async function confirmWhatMattersPilotCondition(input: {
  evaluatedAt: string;
  priorDeclarations: FarmerDeclarationEvidence[];
  opportunityRecordId: string;
  boundAssessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
  conditionCode: FarmerConfirmationCode;
  value: boolean;
}): Promise<WhatMattersPilotActionResult> {
  const declarationOutcome = createFarmerDeclarationEvidence({
    id: `declaration-${input.opportunityRecordId}-${input.conditionCode}-${Date.now()}`,
    opportunityRecordId: input.opportunityRecordId,
    boundAssessmentId: input.boundAssessmentId,
    evaluatedActionId: input.evaluatedActionId,
    fieldId: input.fieldId,
    conditionCode: input.conditionCode,
    value: input.value,
    declaredAt: new Date().toISOString(),
    evaluatedAt: input.evaluatedAt,
  });
  if (declarationOutcome.status !== "OK") {
    return { status: "error", message: declarationOutcome.detail };
  }
  return evaluateWhatMattersPilot({
    evaluatedAt: input.evaluatedAt,
    declarations: [...input.priorDeclarations, declarationOutcome.declaration],
  });
}

/**
 * Validates and PERSISTS the farmer's raw contractor rate (one new,
 * immutable row in `slurry_contractor_cost_declarations` — a correction is
 * a new row, never an edit of an old one, matching this repo's own
 * established insert-only evidence pattern), then re-runs the full
 * audited chain. Never a UI-side cost calculation, never an automatic
 * system rate — see `slurry-realisation-cost.ts`'s own header for why
 * this replaced the earlier automatic €120/ha benchmark.
 *
 * Only a bare `ratePerHa` string crosses this Server Action boundary — the
 * real per-target `FarmerContractorCostDeclaration` objects are always
 * constructed inside `buildRealCandidates`, server-side, from the row this
 * function writes, never accepted pre-built here (Codex audit CRITICAL,
 * fixed: an earlier version of this action took a caller-supplied
 * `priorContractorCostDeclarations` array and appended it unvalidated,
 * which an exported Server Action's own client bundle could submit with
 * an arbitrary rate/currency/timestamp/provenance).
 *
 * `ratePerHa` is validated up front, before it ever reaches storage
 * (Codex audit MEDIUM, fixed: an earlier version had no up-front
 * validation, so an invalid direct-call rate was silently discarded
 * during candidate construction while the response still claimed
 * `status: "ok"`) — an invalid rate now returns a structured
 * `{status: "error"}` and is never written.
 */
export async function saveFarmerContractorCostRate(input: {
  evaluatedAt: string;
  priorDeclarations: FarmerDeclarationEvidence[];
  ratePerHa: string;
}): Promise<WhatMattersPilotActionResult> {
  try {
    const validation = validateContractorCostRate(input.ratePerHa, "EUR");
    if (validation.status !== "OK") return { status: "error", message: validation.detail };

    const farm = await getFarmForCurrentUser();
    if (!farm) return { status: "error", message: "No farm found for this account." };

    await createContractorCostRateRecord(farm.id, input.ratePerHa);

    return evaluateWhatMattersPilot({ evaluatedAt: input.evaluatedAt, declarations: input.priorDeclarations });
  } catch (error: unknown) {
    console.error("[what-matters-pilot] saveFarmerContractorCostRate failed:", error);
    return { status: "error", message: "Unable to verify a recommendation right now." };
  }
}
