/**
 * Farm Return Core Engine — What Matters Pilot, `SLURRY_ACTIONABILITY_POLICY_IE_V1`.
 *
 * The first real Phase 10 evidence producer for slurry-spreading
 * opportunities. Combines three real evidence sources into ONE audited
 * `ActionabilityAssessment` (Phase 10's own, unmodified type):
 *
 *   1. Phase 11A's regulatory foundation (authoritative — nothing overrides
 *      a BLOCKED mandatory gate, not even a favourable rainfall score or a
 *      farmer declaration);
 *   2. Phase 11B's frozen Rainfall Window Score, gated at a Farm Return
 *      MODEL-POLICY threshold of 70 (never presented as statutory or
 *      scientific — see `MINIMUM_RAINFALL_WINDOW_SCORE`);
 *   3. adaptive farmer confirmation for exactly the physical field
 *      conditions this codebase currently has NO automated evidence for
 *      (trafficability, visible waterlogging/standing water, frost/snow) —
 *      never a fixed questionnaire, never asked when a higher-precedence
 *      check has already resolved the opportunity one way or the other.
 *
 * System-first principle: Farm Return infers everything it responsibly can
 * from trusted system data (Phase 11A/11B) and only asks the farmer about
 * conditions that remain materially unresolved after that. No air-temperature
 * data exists anywhere in the production weather path (confirmed by
 * repo-wide search before writing this module) — there is no defensible
 * automated frost-clearing rule to build, so frost/snow always requires a
 * farmer declaration when reached; inventing one here would be exactly the
 * "unsupported frost inference" this program's own review discipline exists
 * to catch.
 *
 * Precedence (brief's own "AFFIRMATIVE NEGATIVE EVIDENCE" vs "UNKNOWN"
 * distinction, applied in order — first decisive result wins):
 *   regulatory BLOCKED -> NOT_ACTIONABLE (absolute, farmer cannot override)
 *   regulatory UNKNOWN -> UNKNOWN
 *   rainfall score UNKNOWN -> UNKNOWN
 *   rainfall score < 70   -> NOT_ACTIONABLE (model policy, not legislation)
 *   any physical condition confirmed unfavourable -> NOT_ACTIONABLE
 *   any physical condition unresolved -> UNKNOWN, with the exact unresolved
 *     condition codes surfaced as `requiredConfirmations` for the caller/UI
 *     to ask about (adaptive — never all three by default, only the ones
 *     actually still open)
 *   everything resolved favourably -> ACTIONABLE
 *
 * Reuses Phase 10's real `createActionabilityAssessment` as the sole output
 * constructor — this module produces exactly the same
 * `ActionabilityAssessmentOutcome` type Phase 10 already defined and Phase
 * 9's `deriveVerifiedActionability` already consumes. No new Phase
 * 9/10 contract, no naked cast, no second actionability vocabulary.
 * `combineActionabilityEvidence` (Phase 10) is deliberately NOT used here:
 * it resolves genuine multi-source disagreement to UNKNOWN, which is correct
 * for symmetric evidence about the same question but wrong for this
 * module's HIERARCHICAL policy (an authoritative blocker must win outright
 * over a favourable score, never collapse the two into "conflicting
 * evidence, unknown").
 */

import Decimal from "decimal.js";
import { createActionabilityAssessment, type ActionabilityAssessmentOutcome, type ActionabilityEvidenceCategory } from "./recommendation-actionability";
import type { SpreadingActionabilityFoundationAssessment } from "./spreading-actionability-foundation";
import type { RainfallWindowScoreAssessment } from "./rainfall-window-score";

export const SLURRY_ACTIONABILITY_POLICY_VERSION = "slurry_actionability_policy_ie_v1.0.0";

/** FARM_RETURN_MODEL_POLICY — not legislation, not a Met Éireann or Teagasc
 * threshold. See Phase 11B's own `RAINFALL_WINDOW_SCORE_IE_V1` for the
 * score itself, which this module consumes unchanged. */
export const MINIMUM_RAINFALL_WINDOW_SCORE = "70";

// ---------------------------------------------------------------------------
// Adaptive farmer confirmation — structured codes, never a vague boolean.
// ---------------------------------------------------------------------------

export const CONFIRM_FIELD_TRAFFICABLE = "CONFIRM_FIELD_TRAFFICABLE";
export const CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER = "CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER";
export const CONFIRM_NOT_FROZEN_OR_SNOW_COVERED = "CONFIRM_NOT_FROZEN_OR_SNOW_COVERED";

export type FarmerConfirmationCode =
  | typeof CONFIRM_FIELD_TRAFFICABLE
  | typeof CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER
  | typeof CONFIRM_NOT_FROZEN_OR_SNOW_COVERED;

interface PhysicalConditionRule {
  code: FarmerConfirmationCode;
  blockedReasonCode: string;
}

/** Deterministic evaluation order (brief §… tie-break discipline carried
 * forward from every earlier phase): trafficability, then waterlogging,
 * then frost. Only affects which single reason code an already-blocked
 * result reports when more than one condition happens to be unfavourable
 * at once — never affects whether the result is blocked. */
const PHYSICAL_CONDITIONS: readonly PhysicalConditionRule[] = [
  { code: CONFIRM_FIELD_TRAFFICABLE, blockedReasonCode: "NOT_ACTIONABLE_FIELD_NOT_TRAFFICABLE" },
  { code: CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, blockedReasonCode: "NOT_ACTIONABLE_VISIBLE_WATERLOGGING_OR_STANDING_WATER" },
  { code: CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, blockedReasonCode: "NOT_ACTIONABLE_FROZEN_OR_SNOW_COVERED" },
];

// ---------------------------------------------------------------------------
// Farmer-declaration evidence — immutable, assessment-scoped snapshot.
// ---------------------------------------------------------------------------

export interface CreateFarmerDeclarationEvidenceInput {
  id: string;
  opportunityRecordId: string;
  boundAssessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
  conditionCode: FarmerConfirmationCode;
  /** `true` = condition confirmed favourable (e.g. "yes, trafficable");
   * `false` = confirmed unfavourable. No third state here — an absent
   * declaration (not this type at all) is what represents "unknown". */
  value: boolean;
  declaredAt: string;
  /** The exact evaluation context (`evaluatedAt`) this declaration was
   * made for — binds it to a specific assessment moment, not a rolling
   * validity window (brief: "Do not invent a 6h/12h/24h global validity
   * period. A new actionability assessment requires appropriate current
   * evidence."). */
  evaluatedAt: string;
  /** No actor-identity/authentication concept exists anywhere in this
   * domain layer today (confirmed by repo-wide search before writing this
   * module) — left optional/unset rather than inventing one. */
  declaredByActorId?: string;
}

export interface FarmerDeclarationEvidence {
  id: string;
  opportunityRecordId: string;
  boundAssessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
  conditionCode: FarmerConfirmationCode;
  value: boolean;
  declaredAt: string;
  evaluatedAt: string;
  declaredByActorId: string | null;
  provenance: "FARMER_DECLARATION";
}

export type FarmerDeclarationOutcome = { status: "OK"; declaration: FarmerDeclarationEvidence } | { status: "REJECTED"; reasonCode: string; detail: string };

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export function createFarmerDeclarationEvidence(input: CreateFarmerDeclarationEvidenceInput): FarmerDeclarationOutcome {
  if (
    isBlank(input.id) ||
    isBlank(input.opportunityRecordId) ||
    isBlank(input.boundAssessmentId) ||
    isBlank(input.evaluatedActionId) ||
    isBlank(input.fieldId) ||
    isBlank(input.declaredAt) ||
    isBlank(input.evaluatedAt)
  ) {
    return {
      status: "REJECTED",
      reasonCode: "SLURRY_ACTIONABILITY_DECLARATION_MALFORMED_INPUT",
      detail: "id, opportunityRecordId, boundAssessmentId, evaluatedActionId, fieldId, declaredAt and evaluatedAt must all be non-empty.",
    };
  }
  return {
    status: "OK",
    declaration: {
      id: input.id,
      opportunityRecordId: input.opportunityRecordId,
      boundAssessmentId: input.boundAssessmentId,
      evaluatedActionId: input.evaluatedActionId,
      fieldId: input.fieldId,
      conditionCode: input.conditionCode,
      value: input.value,
      declaredAt: input.declaredAt,
      evaluatedAt: input.evaluatedAt,
      declaredByActorId: input.declaredByActorId ?? null,
      provenance: "FARMER_DECLARATION",
    },
  };
}

interface BoundOpportunity {
  opportunityRecordId: string;
  boundAssessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
}

export interface DeclarationBindingValidationResult {
  valid: boolean;
  reasonCode?: string;
  detail?: string;
}

/** Never trust a declaration merely because it carries a matching
 * `opportunityRecordId` — a wrong-field declaration, or one made against a
 * since-superseded economic assessment of the same field/action, is
 * rejected rather than silently carried across (brief scenarios 7/8). */
export function validateFarmerDeclarationBinding(declaration: FarmerDeclarationEvidence, target: BoundOpportunity): DeclarationBindingValidationResult {
  if (declaration.opportunityRecordId !== target.opportunityRecordId || declaration.fieldId !== target.fieldId) {
    return {
      valid: false,
      reasonCode: "SLURRY_ACTIONABILITY_DECLARATION_WRONG_FIELD",
      detail: `declaration was made for opportunityRecordId="${declaration.opportunityRecordId}"/fieldId="${declaration.fieldId}", not the target opportunityRecordId="${target.opportunityRecordId}"/fieldId="${target.fieldId}" — rejected rather than trusted.`,
    };
  }
  if (declaration.boundAssessmentId !== target.boundAssessmentId || declaration.evaluatedActionId !== target.evaluatedActionId) {
    return {
      valid: false,
      reasonCode: "SLURRY_ACTIONABILITY_DECLARATION_STALE_ASSESSMENT",
      detail: `declaration was bound to boundAssessmentId="${declaration.boundAssessmentId}"/evaluatedActionId="${declaration.evaluatedActionId}", which no longer matches the current target's boundAssessmentId="${target.boundAssessmentId}"/evaluatedActionId="${target.evaluatedActionId}" — this action has been reassessed since the declaration was made; a fresh declaration is required.`,
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Main policy evaluation.
// ---------------------------------------------------------------------------

const SYSTEM_FIRST_LIMITATION = "Farm Return does not ask the farmer to confirm conditions already resolved by trusted system evidence.";
const RAINFALL_NOT_TRAFFICABILITY_LIMITATION = "Rainfall Window Score alone cannot establish field trafficability or the absence of waterlogging.";
const FARMER_CANNOT_OVERRIDE_LIMITATION = "Farmer declarations cannot override authoritative blockers (statutory closed periods, buffer or commonage restrictions).";
const MODEL_POLICY_THRESHOLD_LIMITATION = `The minimum Rainfall Window Score of ${MINIMUM_RAINFALL_WINDOW_SCORE} is a Farm Return model-policy calibration choice (${SLURRY_ACTIONABILITY_POLICY_VERSION}), not a statutory or scientific constant.`;
const DEFAULT_POLICY_LIMITATIONS = [SYSTEM_FIRST_LIMITATION, RAINFALL_NOT_TRAFFICABILITY_LIMITATION, FARMER_CANNOT_OVERRIDE_LIMITATION, MODEL_POLICY_THRESHOLD_LIMITATION];

export interface EvaluateSlurryActionabilityInput {
  id: string;
  opportunityRecordId: string;
  boundAssessmentId: string;
  evaluatedActionId: string;
  fieldId: string;
  evaluatedAt: string;
  foundation: SpreadingActionabilityFoundationAssessment;
  rainfallScore: RainfallWindowScoreAssessment;
  farmerDeclarations: readonly FarmerDeclarationEvidence[];
}

export interface SlurryActionabilityEvaluation {
  /** The real, unmodified Phase 10 output — feed straight into
   * `deriveVerifiedActionability`. */
  outcome: ActionabilityAssessmentOutcome;
  /** Non-empty exactly when the result is UNKNOWN because one or more
   * physical field conditions have no valid current declaration yet — the
   * adaptive question list a caller/UI should present. Always empty for
   * ACTIONABLE, NOT_ACTIONABLE, or an UNKNOWN caused by something other
   * than missing physical-condition evidence (e.g. missing rainfall
   * evidence, unresolved regulatory geometry). */
  requiredConfirmations: FarmerConfirmationCode[];
}

function latestValidDeclaration(code: FarmerConfirmationCode, declarations: readonly FarmerDeclarationEvidence[], target: BoundOpportunity): FarmerDeclarationEvidence | null {
  const valid = declarations.filter((d) => d.conditionCode === code && validateFarmerDeclarationBinding(d, target).valid);
  if (valid.length === 0) return null;
  return valid.reduce((latest, current) => (current.declaredAt > latest.declaredAt ? current : latest));
}

function unknownOutcome(input: { id: string; target: BoundOpportunity; evaluatedAt: string; reasonCode: string }): ActionabilityAssessmentOutcome {
  return createActionabilityAssessment({
    id: input.id,
    opportunityRecordId: input.target.opportunityRecordId,
    boundAssessmentId: input.target.boundAssessmentId,
    state: "unknown",
    evidenceCategory: "UNKNOWN",
    evidenceDetail: "",
    ruleId: "",
    ruleVersion: "",
    reasonCode: input.reasonCode,
    evaluatedAt: input.evaluatedAt,
    limitations: DEFAULT_POLICY_LIMITATIONS,
  });
}

function decidedOutcome(input: {
  id: string;
  target: BoundOpportunity;
  evaluatedAt: string;
  state: "actionable" | "not_actionable";
  category: ActionabilityEvidenceCategory;
  detail: string;
  ruleId: string;
  reasonCode: string;
}): ActionabilityAssessmentOutcome {
  return createActionabilityAssessment({
    id: input.id,
    opportunityRecordId: input.target.opportunityRecordId,
    boundAssessmentId: input.target.boundAssessmentId,
    state: input.state,
    evidenceCategory: input.category,
    evidenceDetail: input.detail,
    ruleId: input.ruleId,
    ruleVersion: SLURRY_ACTIONABILITY_POLICY_VERSION,
    reasonCode: input.reasonCode,
    evaluatedAt: input.evaluatedAt,
    limitations: DEFAULT_POLICY_LIMITATIONS,
  });
}

export function evaluateSlurryActionability(input: EvaluateSlurryActionabilityInput): SlurryActionabilityEvaluation {
  const target: BoundOpportunity = {
    opportunityRecordId: input.opportunityRecordId,
    boundAssessmentId: input.boundAssessmentId,
    evaluatedActionId: input.evaluatedActionId,
    fieldId: input.fieldId,
  };

  // Binding: never trust a Phase 11A/11B assessment merely because it was
  // handed to this call — verify it actually describes this exact
  // opportunity/field/assessment before using it for anything.
  if (input.foundation.opportunityRecordId !== target.opportunityRecordId || input.foundation.fieldId !== target.fieldId) {
    return {
      outcome: { status: "REJECTED", reasonCode: "SLURRY_ACTIONABILITY_FOUNDATION_IDENTITY_MISMATCH", detail: "the supplied Phase 11A foundation assessment does not describe this exact opportunity/field." },
      requiredConfirmations: [],
    };
  }
  if (input.foundation.boundAssessmentId !== target.boundAssessmentId || input.foundation.evaluatedActionId !== target.evaluatedActionId) {
    return {
      outcome: { status: "REJECTED", reasonCode: "SLURRY_ACTIONABILITY_FOUNDATION_STALE_ASSESSMENT_BINDING", detail: "the supplied Phase 11A foundation assessment was built against a prior economic assessment of this action." },
      requiredConfirmations: [],
    };
  }
  if (input.rainfallScore.opportunityRecordId !== target.opportunityRecordId || input.rainfallScore.fieldId !== target.fieldId) {
    return {
      outcome: { status: "REJECTED", reasonCode: "SLURRY_ACTIONABILITY_RAINFALL_SCORE_IDENTITY_MISMATCH", detail: "the supplied Phase 11B rainfall score does not describe this exact opportunity/field." },
      requiredConfirmations: [],
    };
  }
  if (input.rainfallScore.boundAssessmentId !== target.boundAssessmentId || input.rainfallScore.evaluatedActionId !== target.evaluatedActionId) {
    return {
      outcome: { status: "REJECTED", reasonCode: "SLURRY_ACTIONABILITY_RAINFALL_SCORE_STALE_ASSESSMENT_BINDING", detail: "the supplied Phase 11B rainfall score was built against a prior economic assessment of this action." },
      requiredConfirmations: [],
    };
  }

  const evaluatedAt = input.evaluatedAt;

  // 1. Authoritative regulatory evidence — nothing overrides a real blocker.
  const gateStates = [input.foundation.spreadingWindowGate.state, input.foundation.bufferCompliance.state, input.foundation.commonageCompliance.state];
  if (gateStates.includes("BLOCKED")) {
    return {
      outcome: decidedOutcome({
        id: input.id,
        target,
        evaluatedAt,
        state: "not_actionable",
        category: "REGULATORY_RULE",
        detail: `Phase 11A regulatory foundation reports a BLOCKED mandatory gate (aggregateReasonCode="${input.foundation.aggregateReasonCode}").`,
        ruleId: "SLURRY_ACTIONABILITY_POLICY_REGULATORY_GATE",
        reasonCode: "NOT_ACTIONABLE_REGULATORY_BLOCKER",
      }),
      requiredConfirmations: [],
    };
  }
  if (gateStates.includes("UNKNOWN")) {
    return { outcome: unknownOutcome({ id: input.id, target, evaluatedAt, reasonCode: "UNKNOWN_REGULATORY_EVIDENCE_INCOMPLETE" }), requiredConfirmations: [] };
  }

  // 2. Rainfall Window Score — Farm Return model-policy threshold, not
  // statutory. Phase 11B's own model version/anchors/weighting are
  // consumed unchanged; this module only compares the already-computed
  // final score against its own threshold.
  if (input.rainfallScore.score.status !== "OK") {
    return { outcome: unknownOutcome({ id: input.id, target, evaluatedAt, reasonCode: "UNKNOWN_RAINFALL_WINDOW_SCORE_UNAVAILABLE" }), requiredConfirmations: [] };
  }
  const finalScore = new Decimal(input.rainfallScore.score.value.finalScore);
  if (finalScore.lt(MINIMUM_RAINFALL_WINDOW_SCORE)) {
    return {
      outcome: decidedOutcome({
        id: input.id,
        target,
        evaluatedAt,
        state: "not_actionable",
        category: "WEATHER_CONDITION",
        detail: `Rainfall Window Score ${finalScore.toString()} is below the Farm Return pilot policy threshold of ${MINIMUM_RAINFALL_WINDOW_SCORE} (${SLURRY_ACTIONABILITY_POLICY_VERSION} — model policy, not statutory).`,
        ruleId: "SLURRY_ACTIONABILITY_POLICY_RAINFALL_THRESHOLD",
        reasonCode: "NOT_ACTIONABLE_RAINFALL_WINDOW_BELOW_THRESHOLD",
      }),
      requiredConfirmations: [],
    };
  }

  // 3. Physical field conditions — no automated production evidence exists
  // for any of these today; each resolves from the latest VALID (binding
  // checked) farmer declaration only. Deterministic evaluation order.
  const requiredConfirmations: FarmerConfirmationCode[] = [];
  for (const condition of PHYSICAL_CONDITIONS) {
    const declaration = latestValidDeclaration(condition.code, input.farmerDeclarations, target);
    if (declaration === null) {
      requiredConfirmations.push(condition.code);
      continue;
    }
    if (declaration.value === false) {
      return {
        outcome: decidedOutcome({
          id: input.id,
          target,
          evaluatedAt,
          state: "not_actionable",
          category: "FARMER_DECLARATION",
          detail: `Farmer declaration "${condition.code}" (id="${declaration.id}", declaredAt="${declaration.declaredAt}") reported an unfavourable condition.`,
          ruleId: "SLURRY_ACTIONABILITY_POLICY_PHYSICAL_CONDITION",
          reasonCode: condition.blockedReasonCode,
        }),
        requiredConfirmations: [],
      };
    }
  }
  if (requiredConfirmations.length > 0) {
    return { outcome: unknownOutcome({ id: input.id, target, evaluatedAt, reasonCode: "UNKNOWN_PHYSICAL_CONDITION_CONFIRMATION_REQUIRED" }), requiredConfirmations };
  }

  // 4. Every condition resolved favourably.
  return {
    outcome: decidedOutcome({
      id: input.id,
      target,
      evaluatedAt,
      state: "actionable",
      category: "FARMER_DECLARATION",
      detail: `Regulatory foundation clear, Rainfall Window Score ${finalScore.toString()} >= ${MINIMUM_RAINFALL_WINDOW_SCORE}, and all physical field conditions (${PHYSICAL_CONDITIONS.map((c) => c.code).join(", ")}) confirmed favourable by farmer declaration.`,
      ruleId: SLURRY_ACTIONABILITY_POLICY_VERSION,
      reasonCode: "ACTIONABLE_ALL_CONDITIONS_CLEAR",
    }),
    requiredConfirmations: [],
  };
}
