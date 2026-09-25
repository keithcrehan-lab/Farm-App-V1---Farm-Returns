/**
 * What Matters pilot — "why nothing was ranked" explanation.
 *
 * Pure read-model over outputs that already exist: the real Phase 7
 * `AuditedActionOpportunityRecord`s the pilot built and the real Phase 8
 * `OpportunityRankingResult` it ranked them with. Adds NO economic,
 * ranking, threshold or actionability logic — every value below is read
 * verbatim off those records (gross = Phase 5's `directCostDifference`,
 * realisation cost = Phase 5's `realisationCost`, net = Phase 5's
 * `netEconomicResult`, eligibility = Phase 8's own exclusion reason). It
 * only groups Phase 8's existing exclusion reasons into the few categories
 * a farmer-facing "no recommendation" message needs to tell apart, so
 * Today never says "nothing needs your attention" when real slurry
 * candidates were assessed and failed qualification.
 */

import type { AuditedActionOpportunityRecord } from "./audited-opportunity-record";
import type { OpportunityEligibilityReason, OpportunityRankingResult } from "./opportunity-ranking";
import type { MoneyAmount } from "./money";
import type { Field, SlurryAllocation } from "./types";
import { resolveFieldSlurryAllocation } from "./nutrients";

export const WHAT_MATTERS_NO_RECOMMENDATION_ENGINE_VERSION = "what_matters_no_recommendation_v1.0.0";

export type NoRankedOpportunityExplanationCode =
  /** No well-formed slurry action (allocation with method + date) exists. */
  | "NO_CANDIDATE_DATA"
  /** Every unquantified candidate is blocked only by missing economic
   * evidence (an unresolved price, or an unknown realisation cost). */
  | "MISSING_ECONOMIC_EVIDENCE"
  /** Every unquantified candidate is blocked because Phase 5's own science
   * gate found the slurry nutrient assessment unsupported/blocked (e.g. an
   * application method with no evidenced available-nutrient table) — its
   * prices and costs may well exist. */
  | "UNSUPPORTED_SCIENTIFIC_EVIDENCE"
  /** Unquantified candidates are blocked for a mix of the above, or for
   * another Phase 5 reason (e.g. counterfactual invariance). */
  | "INSUFFICIENT_EVIDENCE"
  /** Every candidate was quantified, and every one came out zero or adverse. */
  | "NO_POSITIVE_ECONOMIC_OPPORTUNITY"
  /** Excluded by a lifecycle/freshness/supersession eligibility rule. */
  | "EXCLUDED_BY_ELIGIBILITY_RULE"
  /** Any other existing audited Phase 8 exclusion (integrity, version,
   * duplicate, conflict, currency, parent/child). */
  | "OTHER_AUDITED_EXCLUSION";

export interface SlurryCandidateTrace {
  recordId: string;
  fieldId: string;
  /** Phase 5 gross direct value (plan-cost difference) — `amount` is
   * `null` whenever Phase 5 itself did not quantify it, never `"0"`. */
  gross: { direction: "benefit" | "cost" | "zero" | null; amount: MoneyAmount | null };
  realisationCost: { status: "quantified" | "known_zero" | "unknown"; amount: MoneyAmount | null };
  net: { direction: "benefit" | "cost" | "zero" | null; amount: MoneyAmount | null };
  /** Phase 8's own verdict for this record, verbatim. */
  eligibility: OpportunityEligibilityReason;
}

export interface NoRankedOpportunityExplanation {
  engineVersion: string;
  code: NoRankedOpportunityExplanationCode;
  candidates: SlurryCandidateTrace[];
}

const ELIGIBILITY_RULE_KINDS: ReadonlySet<OpportunityEligibilityReason["kind"]> = new Set(["lifecycle_excluded", "stale_evidence", "superseded"]);
const NON_POSITIVE_KINDS: ReadonlySet<OpportunityEligibilityReason["kind"]> = new Set(["adverse_outcome_excluded", "zero_outcome_excluded"]);

type UnquantifiedCause = "science" | "economic" | "other";

/** Reads WHY Phase 5 left a record unquantified, straight off its own
 * assessment — the same gates, in the same order, Phase 5 applied. */
function unquantifiedCause(record: AuditedActionOpportunityRecord): UnquantifiedCause {
  const { assessment } = record;
  const direct = assessment.directCostDifference;
  if (direct.status !== "OK") {
    if (assessment.scienceSupport.status !== "OK") return "science";
    if (!assessment.counterfactualInvariance.valid) return "other";
    // Incomplete baseline/intervention plan cost = an unresolved price.
    if (assessment.baselineFertiliserPlanCost.aggregateOutcome.status !== "OK" || assessment.interventionFertiliserPlanCost.aggregateOutcome.status !== "OK") return "economic";
    return "other";
  }
  return assessment.realisationCost.status === "unknown" ? "economic" : "other";
}

export function traceSlurryCandidate(record: AuditedActionOpportunityRecord, eligibility: OpportunityEligibilityReason): SlurryCandidateTrace {
  const { assessment } = record;
  const realisationCost = assessment.realisationCost;
  return {
    recordId: record.id,
    fieldId: record.fieldId,
    gross: {
      direction: assessment.directCostDifferenceDirection,
      amount: assessment.directCostDifference.status === "OK" ? assessment.directCostDifference.value : null,
    },
    realisationCost: { status: realisationCost.status, amount: realisationCost.status === "quantified" ? realisationCost.amount : null },
    net: {
      direction: assessment.netEconomicResult.direction,
      amount: assessment.netEconomicResult.amount.status === "OK" ? assessment.netEconomicResult.amount.value : null,
    },
    eligibility,
  };
}

export type MissingSlurryPlanningDetail = "method" | "date";

export interface FieldMissingSlurryPlanningDetails {
  fieldId: string;
  /** Only the details the farmer can actually add — never ones already on
   * record. */
  missing: MissingSlurryPlanningDetail[];
}

/** Which fields have planned slurry spreading that the What Matters
 * pipeline skipped ONLY because a real allocation still lacks its spreading
 * method and/or date — the same `resolveFieldSlurryAllocation` +
 * method/date check the pilot's own candidate builder applies, so this
 * never disagrees with it. A field whose resolved allocation is incomplete
 * for a reason the farmer cannot fix by adding a missing value (e.g. two
 * housing sources with conflicting methods) is left out rather than
 * pointed at a form that cannot resolve it. */
export function listMissingSlurryPlanningDetails(fields: readonly Field[], allocations: readonly SlurryAllocation[]): FieldMissingSlurryPlanningDetails[] {
  const result: FieldMissingSlurryPlanningDetails[] = [];
  for (const field of fields) {
    const resolved = resolveFieldSlurryAllocation(allocations, field.id);
    if (!resolved || (resolved.applicationMethod && resolved.applicationDate)) continue;
    const applicable = allocations.filter((a) => a.fieldId === field.id && a.priority !== "not_suitable");
    const missing: MissingSlurryPlanningDetail[] = [];
    if (applicable.some((a) => !a.applicationMethod)) missing.push("method");
    if (applicable.some((a) => !a.applicationDate)) missing.push("date");
    if (missing.length > 0) result.push({ fieldId: field.id, missing });
  }
  return result;
}

/** Explains an EMPTY Phase 8 ranked set. `rankingResult` is `null` only
 * when there were no records to rank at all. Returns `null` if the ranked
 * set is not actually empty — this never explains away a real ranking. */
export function explainNoRankedOpportunities(
  records: readonly AuditedActionOpportunityRecord[],
  rankingResult: OpportunityRankingResult | null,
): NoRankedOpportunityExplanation | null {
  if (rankingResult !== null && rankingResult.ranked.length > 0) return null;
  if (records.length === 0 || rankingResult === null) {
    return { engineVersion: WHAT_MATTERS_NO_RECOMMENDATION_ENGINE_VERSION, code: "NO_CANDIDATE_DATA", candidates: [] };
  }

  const reasonByRecordId = new Map(rankingResult.excluded.map((e) => [e.recordId, e.reason]));
  const candidates: SlurryCandidateTrace[] = [];
  for (const record of records) {
    const reason = reasonByRecordId.get(record.id);
    // Every record Phase 8 did not rank is in `excluded` by construction;
    // a record missing from both is not something we can explain honestly.
    if (reason === undefined) return { engineVersion: WHAT_MATTERS_NO_RECOMMENDATION_ENGINE_VERSION, code: "OTHER_AUDITED_EXCLUSION", candidates };
    candidates.push(traceSlurryCandidate(record, reason));
  }

  const kinds = candidates.map((c) => c.eligibility.kind);
  let code: NoRankedOpportunityExplanationCode;
  if (kinds.includes("not_quantified")) {
    const causes = new Set(records.filter((r) => reasonByRecordId.get(r.id)?.kind === "not_quantified").map(unquantifiedCause));
    if (causes.size === 1 && causes.has("economic")) code = "MISSING_ECONOMIC_EVIDENCE";
    else if (causes.size === 1 && causes.has("science")) code = "UNSUPPORTED_SCIENTIFIC_EVIDENCE";
    else code = "INSUFFICIENT_EVIDENCE";
  }
  else if (kinds.every((k) => NON_POSITIVE_KINDS.has(k))) code = "NO_POSITIVE_ECONOMIC_OPPORTUNITY";
  else if (kinds.some((k) => ELIGIBILITY_RULE_KINDS.has(k))) code = "EXCLUDED_BY_ELIGIBILITY_RULE";
  else code = "OTHER_AUDITED_EXCLUSION";

  return { engineVersion: WHAT_MATTERS_NO_RECOMMENDATION_ENGINE_VERSION, code, candidates };
}
