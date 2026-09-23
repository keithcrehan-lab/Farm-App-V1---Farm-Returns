/**
 * What Matters pilot — presentation-model orchestration.
 *
 * Pure domain glue: takes a real Phase 8 ranking result plus one
 * `SlurryActionabilityEvaluation` (`slurry-actionability-policy.ts`) per
 * ranked candidate, assembles Phase 10's `VerifiedActionabilityMap` the
 * ONLY way that's possible (via `deriveVerifiedActionability`, never a
 * naked cast), runs Phase 9's real, unmodified `evaluateRecommendation`,
 * and maps the result into a small UI-friendly discriminated union. Adds
 * NO new selection/ranking/actionability logic of its own beyond choosing
 * which of Phase 9's own real outputs is most useful to show when nothing
 * was selected (brief Part 3: "if a higher-ranked opportunity is
 * blocked/unfavourable, display the reason honestly").
 *
 * Never resolves a human-readable field/action name — this module has no
 * access to `Field` records, and inventing display text here would risk
 * detaching from real data. A caller (the UI layer, which already holds
 * the farm's real `Field` records) supplies `fieldName`/`actionLabel`
 * lookups if it wants them rendered; this module always exposes the real
 * `fieldId`/`recordId`/`evaluatedActionId` so nothing is lost either way.
 */

import type { OpportunityRankingResult } from "./opportunity-ranking";
import type { OpportunityDecisionState } from "./audited-opportunity-record";
import { deriveVerifiedActionability, type ActionabilityAssessment } from "./recommendation-actionability";
import { evaluateRecommendation, type RecommendationSelectionPolicy, type RecommendationCandidateEvaluation } from "./recommendation-selection";
import type { SlurryActionabilityEvaluation, FarmerConfirmationCode } from "./slurry-actionability-policy";
import type { SlurryRealisationCostResolution } from "./slurry-realisation-cost";

// Codex audit HIGH (this commit's own independent review, base 76c959fb):
// a real, breaking additive change to this module's exported result/input
// shapes (new required `costAssumption` field on the `actionable` variant;
// new optional `realisationCostResolutionByRecordId` input) -- bumped per
// this module's own self-versioning convention, since it is not listed in
// DOMAIN_CONTRACTS.md's formal "Frozen contract inventory" table (that
// table's own stated rule -- "a module in the tables above is frozen by
// default" -- does not literally apply here), but every existing real call
// site was still updated in this same commit, matching the frozen-contract
// protocol's substantive intent even though the module itself is not
// formally in that table. See IMPLEMENTATION_LOG.md for this change's own
// entry.
export const WHAT_MATTERS_PILOT_ENGINE_VERSION = "what_matters_pilot_presentation_v1.1.0";

export type WhatMattersPilotResult =
  | { kind: "actionable"; candidate: RecommendationCandidateEvaluation; rainfallScore: string | null; costAssumption: SlurryRealisationCostResolution | null }
  | { kind: "needs_confirmation"; candidate: RecommendationCandidateEvaluation; requiredConfirmations: FarmerConfirmationCode[] }
  | { kind: "blocked"; candidate: RecommendationCandidateEvaluation; reasonCode: string }
  | { kind: "unknown"; candidate: RecommendationCandidateEvaluation | null; reasonCode: string }
  | { kind: "none"; reasonCode: string };

export interface BuildWhatMattersPilotPresentationInput {
  rankingResult: OpportunityRankingResult;
  decisionStates: ReadonlyMap<string, OpportunityDecisionState>;
  /** One evaluation per ranked candidate this caller was able to build
   * (via `evaluateSlurryActionability`) — a candidate with no entry falls
   * through to Phase 9's own "unknown" default, exactly like any other
   * missing actionability input. */
  actionabilityEvaluationsByRecordId: ReadonlyMap<string, SlurryActionabilityEvaluation>;
  recommendationPolicy: RecommendationSelectionPolicy;
  evaluatedAt: string;
  /** Optional Rainfall Window Score display value per record — this
   * module never computes or re-derives it. */
  rainfallScoreByRecordId?: ReadonlyMap<string, string | null>;
  /** Optional FULL realisation-cost resolution per record
   * (`slurry-realisation-cost.ts` — sourced from a real farmer-entered
   * contractor-rate declaration, never an automatic system value) —
   * this module never computes, re-derives, or reduces it to a
   * pre-formatted string; the complete structured object (the real
   * `FarmerContractorCostDeclaration` actually used, exact area,
   * calculation expression, reason code) passes through to the selected
   * candidate exactly like `rainfallScoreByRecordId`, so a consumer can
   * reconstruct the real figure without trusting a display string built
   * elsewhere. Disclosed, accepted limitation: this full object is NOT
   * embedded inside Phase 5's own fingerprinted
   * `SlurryDirectEconomicAssessment`/`AuditedActionOpportunityRecord`
   * (both frozen, `RealisationCostInput` has no room for extra
   * provenance fields) — it travels alongside the audited record as a
   * genuine, structured, reconstructable object, not inside its
   * SHA-256 fingerprint. */
  realisationCostResolutionByRecordId?: ReadonlyMap<string, SlurryRealisationCostResolution>;
}

export interface WhatMattersPilotPresentation {
  engineVersion: string;
  result: WhatMattersPilotResult;
  /** Every ranked candidate's own actionability evaluation, for full
   * auditability of the ranked-but-not-selected ones too — never
   * stripped down to just the selected one. */
  candidateActionability: ReadonlyMap<string, SlurryActionabilityEvaluation>;
}

/** Returns the top candidate's own evaluation ONLY when its Phase-10
 * assessment genuinely describes this exact candidate (opportunity record
 * + underlying economic assessment) — never merely because it happens to
 * sit under a matching map key (Codex audit finding, MEDIUM: a caller
 * could otherwise store an evaluation under the wrong record id, and its
 * `requiredConfirmations` would be trusted for a candidate it was never
 * actually bound to). A rejected/blocked evaluation, or one whose
 * embedded assessment identity doesn't match the candidate, is treated as
 * absent rather than trusted. */
function evaluationBoundToCandidate(candidate: RecommendationCandidateEvaluation, evaluationsByRecordId: ReadonlyMap<string, SlurryActionabilityEvaluation>): SlurryActionabilityEvaluation | undefined {
  const evaluation = evaluationsByRecordId.get(candidate.recordId);
  if (evaluation === undefined || evaluation.outcome.status !== "OK") return undefined;
  const { assessment } = evaluation.outcome;
  if (assessment.opportunityRecordId !== candidate.recordId || assessment.boundAssessmentId !== candidate.assessmentId) return undefined;
  return evaluation;
}

export function buildWhatMattersPilotPresentation(input: BuildWhatMattersPilotPresentationInput): WhatMattersPilotPresentation {
  // Snapshot the caller's map AND every evaluation value inside it
  // immediately — every returned presentation must remain stable even if
  // the caller goes on to mutate the original `Map`, or an individual
  // evaluation object/its `requiredConfirmations` array, afterward
  // (Codex audit finding, MEDIUM: a shallow `new Map(...)` copy still
  // shares each entry's own object/array by reference; `ReadonlyMap` and
  // a `readonly` array type are compile-time views only, not a runtime
  // guarantee. `structuredClone` is safe here — every field on
  // `SlurryActionabilityEvaluation` is a plain string/array/nested-plain-
  // object, the same JSON-safe shape Phase 7's own snapshot convention
  // already relies on).
  const candidateActionability: ReadonlyMap<string, SlurryActionabilityEvaluation> = new Map(Array.from(input.actionabilityEvaluationsByRecordId, ([recordId, evaluation]) => [recordId, structuredClone(evaluation)]));

  const assessmentsByRecordId = new Map<string, ActionabilityAssessment>();
  for (const [recordId, evaluation] of candidateActionability) {
    if (evaluation.outcome.status === "OK") assessmentsByRecordId.set(recordId, evaluation.outcome.assessment);
  }
  // The ONLY way to obtain a VerifiedActionabilityMap — never a naked cast.
  const verifiedActionability = deriveVerifiedActionability(input.rankingResult, assessmentsByRecordId);
  const outcome = evaluateRecommendation(input.rankingResult, input.decisionStates, verifiedActionability, input.recommendationPolicy, input.evaluatedAt);

  if (outcome.status !== "OK") {
    return { engineVersion: WHAT_MATTERS_PILOT_ENGINE_VERSION, result: { kind: "none", reasonCode: outcome.reasonCode }, candidateActionability };
  }

  const { evaluation } = outcome;

  if (evaluation.primaryRecommendation !== null) {
    const rainfallScore = input.rainfallScoreByRecordId?.get(evaluation.primaryRecommendation.recordId) ?? null;
    const costAssumption = input.realisationCostResolutionByRecordId?.get(evaluation.primaryRecommendation.recordId) ?? null;
    return {
      engineVersion: WHAT_MATTERS_PILOT_ENGINE_VERSION,
      result: { kind: "actionable", candidate: evaluation.primaryRecommendation, rainfallScore, costAssumption },
      candidateActionability,
    };
  }

  const topCandidate = evaluation.candidates[0];
  if (topCandidate === undefined) {
    return { engineVersion: WHAT_MATTERS_PILOT_ENGINE_VERSION, result: { kind: "none", reasonCode: evaluation.noRecommendationReasonCode ?? "NO_RANKED_OPPORTUNITIES" }, candidateActionability };
  }

  const topEvaluation = evaluationBoundToCandidate(topCandidate, candidateActionability);

  // ACTIONABILITY_UNKNOWN is genuine epistemic uncertainty (Phase 9's own
  // vocabulary, recommendation-selection.ts) — it must never be presented
  // as "blocked" (Codex audit finding, MEDIUM: that collapse happened
  // whenever no farmer confirmation was pending, e.g. missing rainfall
  // evidence). It resolves to exactly one of two honest UI states: a real
  // question to ask (`needs_confirmation`), or an honest "not enough
  // information yet" (`unknown`) — never "blocked", which is reserved for
  // an actual decided reason (NOT_CURRENTLY_ACTIONABLE / suppressed /
  // not_applicable).
  if (topCandidate.outcome.kind === "deferred" && topCandidate.outcome.code === "ACTIONABILITY_UNKNOWN") {
    if (topEvaluation !== undefined && topEvaluation.requiredConfirmations.length > 0) {
      return {
        engineVersion: WHAT_MATTERS_PILOT_ENGINE_VERSION,
        result: { kind: "needs_confirmation", candidate: topCandidate, requiredConfirmations: topEvaluation.requiredConfirmations },
        candidateActionability,
      };
    }
    return { engineVersion: WHAT_MATTERS_PILOT_ENGINE_VERSION, result: { kind: "unknown", candidate: topCandidate, reasonCode: topCandidate.outcome.code }, candidateActionability };
  }
  if (topCandidate.outcome.kind === "deferred" || topCandidate.outcome.kind === "suppressed" || topCandidate.outcome.kind === "not_applicable") {
    return { engineVersion: WHAT_MATTERS_PILOT_ENGINE_VERSION, result: { kind: "blocked", candidate: topCandidate, reasonCode: topCandidate.outcome.code }, candidateActionability };
  }
  return {
    engineVersion: WHAT_MATTERS_PILOT_ENGINE_VERSION,
    result: { kind: "unknown", candidate: topCandidate, reasonCode: evaluation.noRecommendationReasonCode ?? "UNKNOWN" },
    candidateActionability,
  };
}
