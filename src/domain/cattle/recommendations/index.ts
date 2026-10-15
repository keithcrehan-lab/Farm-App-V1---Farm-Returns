/**
 * Cattle C8 — deterministic, evidence-first recommendation engine. One sealed
 * evaluation context per animal, composed from the frozen C1–C7 engines over
 * canonical evidence; hard gates before eligibility, effect, value and
 * ranking; verified C0 Recommendation Evidence Packs. No invented benefit,
 * value, probability or target; no clock, model, network or AI call. See
 * `docs/farm-return-next/DOMAIN_CONTRACTS.md` ("Cattle C8").
 */

// Admission helpers (`admitCandidateActionRegistry`, `admitRecommendationModels`,
// `admitEconomicObservations`), the context construction (`buildEvaluationContexts`,
// `sealEvaluationContext`) and the consumed-field schema trust already-canonical
// input or are the one internal construction boundary, so they stay
// module-internal: the public paths are `recommendCattle` and
// `verifyCattleRecommendation`, which run the canonical boundary first.
export {
  BENEFIT_CLAIMS,
  CANDIDATE_TRIGGER_KINDS,
  DEFAULT_CANDIDATE_ACTION_REGISTRY,
  GATE_SOURCE_PART,
  RECOMMENDATION_CONTEXT_PARTS,
  RECOMMENDATION_GATE_SOURCES,
  RECOMMENDATION_PRIORITY_TIERS,
  type BenefitClaim,
  type CandidateActionDefinition,
  type CandidateActionRegistry,
  type CandidateTrigger,
  type RecommendationContextPart,
  type RecommendationGateSource,
  type RecommendationModelRef,
  type RecommendationPriorityTier,
} from "./candidate-actions";
export { COMPUTABLE_CURRENCIES, type EconomicObservation, type EconomicValueResolution, type EconomicValueState } from "./economic-context";
export {
  ECONOMIC_VALUE_FORMS,
  RECOMMENDATION_MODEL_ROLES,
  computeRecommendationModelContentFingerprint,
  recommendationModelContentMarker,
  type AdmittedModelCatalogue,
  type EconomicValueForm,
  type ModelEvaluation,
  type RecommendationModelRecord,
  type RecommendationModelRole,
} from "./recommendation-models";
export type { RecommendationTrustedInputs } from "./evaluation-context";
export type * from "./recommendation-contracts";
export { renderRecommendationExplanation, type ExplanationFields } from "./recommendation-explanation";
export { CATTLE_RECOMMENDATION_ENGINE_VERSION, recommendCattle, verifyCattleRecommendation } from "./recommendation-engine";
export * from "./recommendation-integrity";
