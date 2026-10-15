/**
 * Cattle C8 — request, sealed-context and output types (types only).
 * DOMAIN_CONTRACTS "Cattle C8 — Recommendation engine".
 */

import type { AssessmentFingerprint } from "../../assessment-integrity";
import type { AnimalLedger } from "../animal-ledger";
import type { RecommendationEvidencePack, RecommendationOutcome, HardGateOutcome } from "../evidence-pack";
import type { SourceVersionRef } from "../source";
import type { CandidateActionRegistry, RecommendationContextPart, RecommendationGateSource, RecommendationModelRef, RecommendationPriorityTier, BenefitClaim } from "./candidate-actions";
import type { EconomicValueResolution } from "./economic-context";
import type { AdmittedModelCatalogue, ModelEvaluation } from "./recommendation-models";
import type { CATTLE_RECOMMENDATION_PAYLOAD_VERSION } from "./recommendation-integrity";
import type { ConsumedGoalSnapshot } from "./recommendation-consumed";
import type { CarriedRuleEvaluation } from "./recommendation-exact";

// ---------------------------------------------------------------------------
// Request (canonical plain data; every field present — field-presence policy)
// ---------------------------------------------------------------------------

export interface RecommendationQuery {
  /** VALID time (strict UTC). */
  effectiveAt: string;
  /** KNOWLEDGE time (strict UTC). Never defaulted from `effectiveAt`. */
  knowledgeCutoff: string;
}

/**
 * C8's request carries ONLY canonical evidence: predecessor inputs that C8
 * passes to the frozen C1–C7 engines inside its one construction boundary,
 * plus C8's own canonical inputs. It never carries a derived predecessor
 * output (no C4 read contract, C5 evaluation, C6 projection, C7 evaluation or
 * C2 / C3 result). `null` = that predecessor's evidence was not supplied.
 */
export interface CattleRecommendationRequest {
  query: RecommendationQuery;
  /** C1 ledgers — the animals in scope (one per animal). */
  ledgers: readonly AnimalLedger[];
  /** C2 canonical inputs. */
  obligations: { catalogue: unknown; obligationIds: readonly string[]; evidence: readonly unknown[] } | null;
  /** C3 canonical inputs (an animal not listed has no C3 evidence supplied). */
  health: { foodProducts: readonly string[]; productRecords: readonly unknown[]; animals: readonly { animalId: string; healthRecords: readonly unknown[] }[] } | null;
  /** C4 canonical weight observations. */
  weights: { observations: readonly unknown[] } | null;
  /** C5 canonical inputs (requires `weights`); `contexts` are passed to C5 unchanged. */
  performance: { targets: readonly unknown[]; policies: readonly unknown[]; contexts: readonly unknown[]; windowFrom: string | null } | null;
  /** C6 canonical inputs. */
  goals: { declarations: readonly unknown[]; routingRegistry: unknown } | null;
  /** C7 canonical inputs (C7 composes C2 / C3 itself from the same evidence above). */
  programmes: { definitions: readonly unknown[]; reviews: readonly unknown[]; completions: readonly unknown[] } | null;
  /** Bound economic observations (C8-owned). */
  economics: { observations: readonly unknown[] };
  /** Registered effect / economic models (C8-owned; empty in production). */
  models: { records: readonly unknown[]; reviews: readonly unknown[]; sources: readonly unknown[] };
  /** The `CandidateActionDefinition` registry (C8-owned data). */
  actions: unknown;
}

// ---------------------------------------------------------------------------
// The sealed evaluation context (CAT-INV-015)
// ---------------------------------------------------------------------------

export type NotSupplied = { state: "NOT_SUPPLIED" };

export interface ObligationsPart {
  state: "SUPPLIED";
  /** C2 `CATTLE_OBLIGATION_STATE` record fingerprints (sorted by digest). */
  recordFingerprints: AssessmentFingerprint[];
  records: { obligationId: string; occurrenceId: string | null; state: string }[];
  /** C2 `projectObligationHardGates` records — exact validated copies (never the raw projector objects). */
  gates: CarriedRuleEvaluation[];
}

export interface HealthPart {
  state: "SUPPLIED";
  timelineFingerprint: AssessmentFingerprint;
  medicineLedgerFingerprint: AssessmentFingerprint;
  withdrawalGateFingerprint: AssessmentFingerprint;
  withdrawal: { foodProduct: string; state: string }[];
  /** C3 `projectWithdrawalHardGates` records — exact validated copies. */
  gates: CarriedRuleEvaluation[];
  sourceRefs: SourceVersionRef[];
}

export interface WeightsPart {
  state: "SUPPLIED";
  contractFingerprint: AssessmentFingerprint;
  seriesFingerprint: AssessmentFingerprint;
  latest: { state: string; observedAt: string | null };
}

export interface PerformancePart {
  state: "SUPPLIED";
  evaluationFingerprint: AssessmentFingerprint;
  animalFingerprint: AssessmentFingerprint;
}

export interface GoalsPart {
  state: "SUPPLIED";
  status: string;
  activeGoalTypes: string[];
  snapshot: ConsumedGoalSnapshot;
  routingState: string;
  routingFingerprint: AssessmentFingerprint;
  /** `null` when no C5 evaluation exists to resolve target applicability over. */
  targetApplicabilityFingerprint: AssessmentFingerprint | null;
}

export interface ProgrammeOccurrenceView {
  programmeId: string;
  classification: string;
  actionId: string | null;
  actionKind: string | null;
  occurrenceId: string | null;
  state: string;
}

export interface ProgrammesPart {
  state: "SUPPLIED";
  /** C7 `CATTLE_PROGRAMME_ANIMAL_STATUS` fingerprints of this animal (sorted by digest). */
  animalStatusFingerprints: AssessmentFingerprint[];
  occurrences: ProgrammeOccurrenceView[];
  /** C7 `projectProgrammeHardGates` records — exact validated copies. */
  gates: CarriedRuleEvaluation[];
  sourceRefs: SourceVersionRef[];
}

/**
 * One animal's sealed, deep-frozen evaluation context: one `effectiveAt`,
 * one `knowledgeCutoff`, every part produced by the frozen C1–C7 engines at
 * those times, plus C8's admitted own inputs. Missing parts stay
 * `NOT_SUPPLIED` (never defaulted). The recommendation is evaluated from
 * this object alone.
 */
export interface CattleEvaluationContext {
  recommendationPayloadVersion: typeof CATTLE_RECOMMENDATION_PAYLOAD_VERSION;
  animalId: string;
  /** Canonical spellings. */
  effectiveAt: string;
  knowledgeCutoff: string;
  /** UTC calendar date of `effectiveAt` (the C0 evaluation date). */
  evaluationDate: string;
  animal: { snapshotFingerprint: AssessmentFingerprint };
  obligations: ObligationsPart | NotSupplied;
  health: HealthPart | NotSupplied;
  weights: WeightsPart | NotSupplied;
  performance: PerformancePart | NotSupplied;
  goals: GoalsPart | NotSupplied;
  programmes: ProgrammesPart | NotSupplied;
  /** The admitted candidate-action registry. */
  actions: CandidateActionRegistry;
  /** The admitted models the registry references, with their reviews and sources. */
  models: AdmittedModelCatalogue;
  /** Each referenced, admitted model evaluated once through C0 at `evaluationDate` (sorted by model id, version). */
  modelEvaluations: { modelId: string; version: string; evaluation: ModelEvaluation }[];
  /** Resolutions of every value key a referenced economic model names. */
  economics: EconomicValueResolution[];
  fingerprint: AssessmentFingerprint;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** NOT_MET: resolved negative, kept as a candidate only because required evidence is unresolved (precedence a before c). */
export type TriggerState = "TRIGGERED" | "UNRESOLVED" | "NOT_MET";
export type GateState = "CLEAR" | "NOT_CLEAR";
export type EffectState = "EFFECT_SUPPORTED" | "EFFECT_NOT_SUPPORTED" | "EFFECT_UNKNOWN" | "NOT_EVALUATED";
export type ValueState = "VALUE_KNOWN" | "VALUE_UNKNOWN" | "NOT_EVALUATED";

export interface CandidateGate {
  ruleId: string;
  /** The C0 state, or NOT_EVALUATED when a required gate / context part is absent. */
  state: string;
  source: RecommendationGateSource | "CONTEXT" | "UNRESOLVED_EVIDENCE";
  satisfied: boolean;
}

export interface CandidateEffect {
  state: EffectState;
  model: RecommendationModelRef | null;
  expectedEffect: string | null;
  reasonCodes: string[];
}

export interface CandidateValue {
  state: ValueState;
  model: RecommendationModelRef | null;
  /** Exact decimal string (VALUE_KNOWN only; never zero for unknown). */
  amount: string | null;
  currency: string | null;
  observationIds: string[];
  reasonCodes: string[];
}

export interface CandidateEvaluation {
  /** JSON `["<actionKind>","ANIMAL","<animalId>"]` — kind + target scope. */
  actionId: string;
  actionKind: string;
  description: string;
  tier: RecommendationPriorityTier;
  benefitClaim: BenefitClaim;
  trigger: { state: TriggerState; reasonCodes: string[] };
  eligibility: { state: "ELIGIBLE" | "UNRESOLVED" | "NOT_ELIGIBLE"; reasonCodes: string[] };
  gates: { state: GateState; checks: CandidateGate[] };
  effect: CandidateEffect;
  value: CandidateValue;
  /** Gates clear and the effect model (if any) not negative. */
  selectable: boolean;
  /** 1-based rank (selectable first, then non-actionable). */
  rank: number;
}

export interface NotCandidate {
  actionKind: string;
  reasonCodes: string[];
}

export interface RankingTie {
  actionIds: string[];
  brokenBy: "ACTION_IDENTITY";
}

export interface RecommendationRecord {
  informationClass: "RECOMMENDATION";
  /** `null` when nothing is proposed. */
  recommendedAction: { actionId: string; actionKind: string; description: string; tier: RecommendationPriorityTier } | null;
  outcome: RecommendationOutcome;
  /** True only when the C0 pack outcome is ACTIONABLE. */
  actionable: boolean;
  reasonCodes: string[];
  /** Deterministic rendering of structured pack fields (no model call). */
  explanation: string;
  expectedOutcome: { effect: CandidateEffect; value: CandidateValue } | null;
  regulatoryStatus: { state: "NO_PREREQUISITE_GATES" | "GATES_SATISFIED" | "GATE_FAILED" | "GATE_REVIEW_REQUIRED" | "GATE_UNRESOLVED"; hardGateOutcomes: HardGateOutcome[] };
  /**
   * Evidence labels (human decisions D1–D3, 2026-10-15): `effectBasis` names a
   * scientifically approved effect model only when its C0 record evidences the
   * approval; `valueBasis` never claims validated prices — an approved value
   * FORM over observations that are not independently validated; the action's
   * priority tier is registry-declared and unreviewed.
   */
  evidence: {
    type: "DATA_GAP_OR_OBLIGATION" | "MODELLED" | "NONE";
    strength: "PREDECESSOR_STATE" | "MODELLED_EFFECT_AND_VALUE" | "MODELLED_EFFECT" | "MODELLED_VALUE" | "UNMODELLED" | "NONE";
    effectBasis: "SCIENTIFICALLY_APPROVED_EFFECT_MODEL" | "NONE";
    valueBasis: "APPROVED_VALUE_FORM_OVER_UNVALIDATED_OBSERVATIONS" | "NONE";
    priorityBasis: "REGISTRY_DECLARED_UNREVIEWED" | "NONE";
  };
  sourceRefs: SourceVersionRef[];
  assumptions: string[];
  limitations: string[];
  unknowns: string[];
  missingContextParts: RecommendationContextPart[];
  packId: string;
  packFingerprint: AssessmentFingerprint;
}

export interface CattleRecommendation {
  recommendationPayloadVersion: typeof CATTLE_RECOMMENDATION_PAYLOAD_VERSION;
  animalId: string;
  effectiveAt: string;
  knowledgeCutoff: string;
  context: CattleEvaluationContext;
  /** Ranked. */
  candidates: CandidateEvaluation[];
  notCandidates: NotCandidate[];
  ties: RankingTie[];
  pack: RecommendationEvidencePack;
  record: RecommendationRecord;
  fingerprint: AssessmentFingerprint;
}

export interface HerdOrderingEntry {
  position: number;
  animalId: string;
  outcome: RecommendationOutcome;
  tier: RecommendationPriorityTier | null;
  actionId: string | null;
  recordFingerprint: AssessmentFingerprint;
}

export interface CattleRecommendationResult {
  recommendationPayloadVersion: typeof CATTLE_RECOMMENDATION_PAYLOAD_VERSION;
  effectiveAt: string;
  knowledgeCutoff: string;
  /** Sorted by animal id. */
  animals: CattleRecommendation[];
  ordering: HerdOrderingEntry[];
  orderingTies: string[][];
  fingerprint: AssessmentFingerprint;
}

export interface RecommendationIssue {
  code: string;
  ref: string | null;
}

export type CattleRecommendationOutcomeResult = { ok: true; result: CattleRecommendationResult } | { ok: false; issues: RecommendationIssue[] };
