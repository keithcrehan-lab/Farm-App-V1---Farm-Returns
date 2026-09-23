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

export const WHAT_MATTERS_PILOT_ENGINE_VERSION = "what_matters_pilot_presentation_v1.0.0";

export type WhatMattersPilotResult =
  | { kind: "actionable"; candidate: RecommendationCandidateEvaluation; rainfallScore: string | null }
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
}

export interface WhatMattersPilotPresentation {
  engineVersion: string;
  result: WhatMattersPilotResult;
  /** Every ranked candidate's own actionability evaluation, for full
   * auditability of the ranked-but-not-selected ones too — never
   * stripped down to just the selected one. */
  candidateActionability: ReadonlyMap<string, SlurryActionabilityEvaluation>;
}

export function buildWhatMattersPilotPresentation(input: BuildWhatMattersPilotPresentationInput): WhatMattersPilotPresentation {
  const assessmentsByRecordId = new Map<string, ActionabilityAssessment>();
  for (const [recordId, evaluation] of input.actionabilityEvaluationsByRecordId) {
    if (evaluation.outcome.status === "OK") assessmentsByRecordId.set(recordId, evaluation.outcome.assessment);
  }
  // The ONLY way to obtain a VerifiedActionabilityMap — never a naked cast.
  const verifiedActionability = deriveVerifiedActionability(input.rankingResult, assessmentsByRecordId);
  const outcome = evaluateRecommendation(input.rankingResult, input.decisionStates, verifiedActionability, input.recommendationPolicy, input.evaluatedAt);

  if (outcome.status !== "OK") {
    return { engineVersion: WHAT_MATTERS_PILOT_ENGINE_VERSION, result: { kind: "none", reasonCode: outcome.reasonCode }, candidateActionability: input.actionabilityEvaluationsByRecordId };
  }

  const { evaluation } = outcome;

  if (evaluation.primaryRecommendation !== null) {
    const rainfallScore = input.rainfallScoreByRecordId?.get(evaluation.primaryRecommendation.recordId) ?? null;
    return {
      engineVersion: WHAT_MATTERS_PILOT_ENGINE_VERSION,
      result: { kind: "actionable", candidate: evaluation.primaryRecommendation, rainfallScore },
      candidateActionability: input.actionabilityEvaluationsByRecordId,
    };
  }

  const topCandidate = evaluation.candidates[0];
  if (topCandidate === undefined) {
    return { engineVersion: WHAT_MATTERS_PILOT_ENGINE_VERSION, result: { kind: "none", reasonCode: evaluation.noRecommendationReasonCode ?? "NO_RANKED_OPPORTUNITIES" }, candidateActionability: input.actionabilityEvaluationsByRecordId };
  }

  const topEvaluation = input.actionabilityEvaluationsByRecordId.get(topCandidate.recordId);
  if (topCandidate.outcome.kind === "deferred" && topCandidate.outcome.code === "ACTIONABILITY_UNKNOWN" && topEvaluation !== undefined && topEvaluation.requiredConfirmations.length > 0) {
    return {
      engineVersion: WHAT_MATTERS_PILOT_ENGINE_VERSION,
      result: { kind: "needs_confirmation", candidate: topCandidate, requiredConfirmations: topEvaluation.requiredConfirmations },
      candidateActionability: input.actionabilityEvaluationsByRecordId,
    };
  }
  if (topCandidate.outcome.kind === "deferred" || topCandidate.outcome.kind === "suppressed" || topCandidate.outcome.kind === "not_applicable") {
    return { engineVersion: WHAT_MATTERS_PILOT_ENGINE_VERSION, result: { kind: "blocked", candidate: topCandidate, reasonCode: topCandidate.outcome.code }, candidateActionability: input.actionabilityEvaluationsByRecordId };
  }
  return {
    engineVersion: WHAT_MATTERS_PILOT_ENGINE_VERSION,
    result: { kind: "unknown", candidate: topCandidate, reasonCode: evaluation.noRecommendationReasonCode ?? "UNKNOWN" },
    candidateActionability: input.actionabilityEvaluationsByRecordId,
  };
}
