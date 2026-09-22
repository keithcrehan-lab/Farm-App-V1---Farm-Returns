/**
 * Farm Return Core Engine, Phase 10 — Audited Actionability Evidence
 * Contract.
 *
 * Phase 9 answers: "which of Phase 8's already-ranked opportunities should
 * actually be surfaced now?" — but it requires an explicit actionability
 * state as an input, and previously accepted that state as a bare,
 * unprovenanced caller-supplied enum. Phase 10 answers the question Phase 9
 * itself cannot: "WHY is this audited opportunity considered actionable,
 * not actionable, or unknown at this evaluation point?" It produces a real,
 * evidence-backed `ActionabilityAssessment` and wraps Phase 9's existing
 * input boundary so a production caller can never merely assert
 * `"actionable"` with no provenance behind it.
 *
 * Phase 10 does NOT decide which opportunity ranks highest (Phase 8), does
 * NOT calculate economic value (Phase 1-6), does NOT reinterpret scientific
 * recommendations (Phase 5/6's own science), and does NOT change Phase 9's
 * selection policy. Its only job is a trustworthy actionability state with
 * provenance — Phase 9 remains the sole selection/policy authority.
 *
 * ---------------------------------------------------------------------
 * THE CRITICAL DESIGN QUESTION (brief §9) — investigated directly, not
 * assumed: does this codebase have ANY real, authoritative evidence source
 * for actionability beyond Phase 7's own workflow lifecycle state? No —
 * confirmed by direct search: there is no weather engine, no
 * regulatory-deadline engine, no operational-constraint engine, and no
 * farmer-declaration capture mechanism implemented anywhere in this repo.
 * `SourceId`/`SOURCE_REGISTER` (source-register.ts) and `EvidenceState`
 * (evidence.ts) both exist, but are SCIENTIFIC/market citation vocabularies
 * (Teagasc tables, CSO series, statutory instruments) — reusing either one
 * for an ordinary workflow/policy fact would be the exact class of mistake
 * Phase 7.1's own adversarial review already flagged once (reusing
 * `MEASURED` for a national market statistic that was never farm-measured).
 * Phase 9's own header comment already established this same principle for
 * recommendation policy; Phase 10 follows it for actionability evidence.
 *
 * Consequence: `assessWorkflowStateActionability` (the ONE real,
 * production-usable derivation this phase wires up) can honestly produce
 * `NOT_ACTIONABLE` (for an exact, completed audited action) or `UNKNOWN`
 * (everything else) — it can never honestly produce `ACTIONABLE` from real
 * data today, because nothing in this codebase yet proves an opportunity
 * CAN currently be acted on. This is the correct, expected pilot outcome
 * per the brief's own words: "It is valid for many pilot opportunities to
 * remain UNKNOWN. Correct uncertainty is preferable to fabricated
 * actionability." The general-purpose `createActionabilityAssessment`
 * constructor below DOES support representing a real `ACTIONABLE` state
 * (so the contract is ready for a genuine future evidence source), and its
 * tests exercise that path with realistic fixture evidence (brief §9:
 * "Tests may still use fixtures where appropriate") — but no production
 * code path in this phase ever calls it with a fabricated `ACTIONABLE`
 * claim for a real pilot opportunity.
 *
 * ---------------------------------------------------------------------
 * STOP-CONDITION REVIEW (brief's ten named conditions) — resolved, not
 * triggered.
 * ---------------------------------------------------------------------
 *
 * STOP A (Phase 9 cannot be wrapped without material redesign) — NOT
 * triggered. `deriveVerifiedActionability` (below) is a pure function that
 * takes a real `OpportunityRankingResult` plus a map of
 * `ActionabilityAssessment`s and produces exactly the
 * `ReadonlyMap<string, RecommendationActionability>` shape
 * `evaluateRecommendation` already accepts — ZERO changes to
 * `recommendation-selection.ts` were made or are required. Phase 9's own
 * already-hardened, adversarially-reviewed selection logic is untouched.
 *
 * STOP B (no authoritative evidence exists, and using it would require
 * inventing operational facts) — NOT triggered, per the design-question
 * investigation above. Workflow-derived evidence is real and sufficient to
 * make the contract genuinely useful (a completed action honestly excludes
 * itself); everything else honestly resolves to `UNKNOWN` rather than
 * being fabricated. `UNKNOWN` is the correct outcome for most pilot
 * opportunities, not a defect.
 *
 * STOP C (actionability cannot be bound to exact identity) — NOT
 * triggered. Every `ActionabilityAssessment` carries `opportunityRecordId`
 * (the real Phase 7 record `.id`) and `boundAssessmentId` (the record's
 * own `.assessmentId` AT THE TIME of evaluation) — both real fields
 * already present on `AuditedActionOpportunityRecord`/
 * `AuditedWholeFarmDecisionRecord`. `validateActionabilityBinding`
 * cross-checks both against a record's CURRENT state before an assessment
 * is ever trusted — never blindly accepted by `opportunityRecordId` alone.
 *
 * STOP D (lifecycle semantics used to imply more than they establish) —
 * NOT triggered, and this is the phase's central discipline, applied
 * precisely: `active` → `UNKNOWN` (merely "not yet resolved," never proof
 * of actionability). `accepted` → `UNKNOWN` (a farmer's decision to accept
 * is not evidence the action can physically be performed right now — Phase
 * 9's OWN selection policy already suppresses accepted opportunities from
 * new-recommendation surfacing; Phase 10 must not duplicate that policy
 * decision by claiming it as actionability evidence). `rejected` →
 * `UNKNOWN` (rejection is a workflow/farmer decision, not proof the action
 * is physically impossible — again Phase 9's own policy handles
 * suppression separately). `completed` → the ONLY state that supports
 * `NOT_ACTIONABLE`, and only for the EXACT audited action (identity-bound
 * via `boundAssessmentId`, so a genuinely new reassessment of the same
 * real-world action is never silently blocked by an old completed record).
 *
 * STOP E (new scientific reasoning required) — NOT triggered. This module
 * never reads a scientific field of any kind — not `scienceSupport`, not
 * product/quantity data, nothing from `nutrients.ts` or any Teagasc rule.
 *
 * STOP F (economic recalculation required) — NOT triggered. Grep this
 * file: there is no `MoneyAmount`, `compareMoney`, `addMoney`,
 * `subtractMoney`, or `multiplyMoney` anywhere — `ActionabilityAssessment`
 * has no monetary field of any kind, structurally preventing this from
 * ever becoming a second ranking layer (brief §38/§39: no value, no score,
 * no 1-10/0-100/high-medium-low urgency rating — tri-state plus
 * reason/provenance only).
 *
 * STOP G (conflicting evidence cannot be represented safely) — NOT
 * triggered. `combineActionabilityEvidence` resolves a genuine conflict
 * (some sources say actionable, others say not_actionable, for the SAME
 * bound opportunity/assessment) to `UNKNOWN` with an explicit
 * `UNKNOWN_CONFLICTING_EVIDENCE` reason — it never arbitrarily prefers one
 * evidence category over another, since no existing domain rule
 * establishes such a precedence (brief §37).
 *
 * STOP H (historical assessments cannot remain immutable) — NOT triggered.
 * Every `ActionabilityAssessment` field is a plain string/primitive
 * extracted from its source at construction time — there is no nested
 * mutable object retained by reference anywhere in the type, so there is
 * structurally nothing for a caller's later mutation of their own source
 * objects to reach. If evidence changes, `assessWorkflowStateActionability`
 * (or `createActionabilityAssessment`) produces a brand NEW assessment
 * with its own `id` — nothing is ever edited in place.
 *
 * STOP I (Phase 9 would need to re-rank to consume Phase 10) — NOT
 * triggered. `deriveVerifiedActionability` never reads `.rank`,
 * `.amount`, or `.direction` for anything beyond passing `recordId`/
 * `assessmentId` through for binding validation — it has no way to
 * influence economic order, and does not touch `rankingResult.ranked`'s
 * array order at all.
 *
 * STOP J (final recommendation cannot retain both audit chains) — NOT
 * triggered. The economic chain is exactly what Phase 8/9 already
 * preserve (`recordId` → `assessmentId` → the full `TrustedOpportunityRecord`
 * a caller already holds). The actionability chain is reconstructable by
 * the SAME `recordId`: `assessWorkflowStateActionability` is a pure,
 * deterministic function of `(record, decisionState)` — a reviewer holding
 * the same real `OpportunityDecisionState` a caller already threads
 * through Phase 8/9 can re-derive the identical `ActionabilityAssessment`
 * at any time, proven directly by this module's own determinism test. No
 * new field was added to Phase 9's own result type to carry a redundant
 * reference — one canonical source of truth per fact, re-derivable by id,
 * the same discipline every phase since 6 has used.
 */

import type { OpportunityDecisionState, OpportunityDecisionStatus } from "./audited-opportunity-record";
import type { OpportunityRankingResult } from "./opportunity-ranking";
import type { RecommendationActionability } from "./recommendation-selection";

export const RECOMMENDATION_ACTIONABILITY_ENGINE_VERSION = "recommendation_actionability_engine_v1.0.0";

/** Brief §7 — the full evidence-category vocabulary. Only `WORKFLOW_STATE`
 * (and the fallback `UNKNOWN`, used when no evidence exists at all or
 * evidence conflicts) has a real production derivation in this phase. The
 * remaining five are documented, typed placeholders for future evidence
 * engines (brief §22-24) — declaring them now gives those future phases a
 * real place to plug in without a breaking type change, but NO code in
 * this module ever constructs one of them from real (or fabricated) data.
 *
 * - PLANNING_WINDOW: a future planning-calendar/season-window engine.
 * - OPERATIONAL_CONSTRAINT: a future contractor/equipment/field-access
 *   engine (brief §24) — would need its own source/timestamp/applicability.
 * - REGULATORY_RULE: a future regulatory-deadline engine (brief §23) —
 *   would need jurisdiction/regulation/rule-version/effective-dates/
 *   applicable-context, never inferred from calendar month alone.
 * - WEATHER_CONDITION: a future weather-actionability engine (brief §22) —
 *   would need source/station/observation-or-forecast-timestamp/horizon/
 *   variables/rule/applicability/uncertainty/rule-version, never a bare
 *   `weatherGood = true`.
 * - FARMER_DECLARATION: an explicit operational fact the farmer supplies
 *   (brief §20) — honestly provenanced as a farmer declaration, never
 *   misclassified as an authoritative scientific observation.
 * - SYSTEM_OBSERVATION: a future automated/sensor observation source.
 */
export type ActionabilityEvidenceCategory =
  | "WORKFLOW_STATE"
  | "PLANNING_WINDOW"
  | "OPERATIONAL_CONSTRAINT"
  | "REGULATORY_RULE"
  | "WEATHER_CONDITION"
  | "FARMER_DECLARATION"
  | "SYSTEM_OBSERVATION"
  | "UNKNOWN";

/** Brief §45 — actionability is a workflow/policy fact, not a scientific
 * claim; deliberately NOT wrapped in `EngineOutcome<T>`/`EvidenceState`
 * (the same design choice Phase 9 already made for recommendation policy,
 * for the identical reason). */
export const RECOMMENDATION_ACTIONABILITY_NOT_SCIENCE_LIMITATION =
  "Actionability evidence describes operational/workflow state, not scientific or economic evidence. It answers whether an already-audited opportunity can/should currently be considered for recommendation — it does not reinterpret the underlying scientific or economic assessment in any way.";

export const WORKFLOW_STATE_ACTIONABILITY_RULE_ID = "WORKFLOW_STATE_ACTIONABILITY_RULE";
export const WORKFLOW_STATE_ACTIONABILITY_RULE_VERSION = "1.0.0";

export interface ActionabilityAssessment {
  /** This assessment's own deterministic identity — distinct from
   * `opportunityRecordId` (the audited opportunity), `boundAssessmentId`
   * (the underlying economic assessment), and any future recommendation
   * result id (brief §29). Caller-supplied, never randomly generated. */
  id: string;
  engineVersion: string;
  /** Binds this assessment to the exact `AuditedActionOpportunityRecord`/
   * `AuditedWholeFarmDecisionRecord.id` it evaluates (brief §10). */
  opportunityRecordId: string;
  /** Binds this assessment to the record's own `.assessmentId` AT THE TIME
   * of evaluation (brief §10/§12/§34) — a later economic reassessment
   * (a new, different `assessmentId` on the same `opportunityRecordId`)
   * makes this assessment stale; `validateActionabilityBinding` rejects
   * reuse against the new assessment rather than silently carrying it
   * across. */
  boundAssessmentId: string;
  state: RecommendationActionability;
  evidenceCategory: ActionabilityEvidenceCategory;
  /** Real, human/machine-readable detail explaining the evidence — never
   * empty for a non-"unknown" state (enforced by `createActionabilityAssessment`). */
  evidenceDetail: string;
  ruleId: string;
  ruleVersion: string;
  reasonCode: string;
  /** Explicit, caller-supplied evaluation time — never `Date.now()`/
   * `new Date()` inside this module (brief §13/§39). */
  evaluatedAt: string;
  limitations: string[];
}

export type ActionabilityAssessmentOutcome =
  | { status: "OK"; assessment: ActionabilityAssessment }
  | { status: "REJECTED"; reasonCode: string; detail: string };

// ---------------------------------------------------------------------------
// General-purpose, validated constructor (brief §6/§35/§38/§39). Every
// non-"unknown" state requires real provenance — missing provenance is
// rejected outright, never silently accepted as "actionable" (brief §35).
// ---------------------------------------------------------------------------

export interface CreateActionabilityAssessmentInput {
  id: string;
  opportunityRecordId: string;
  boundAssessmentId: string;
  state: RecommendationActionability;
  evidenceCategory: ActionabilityEvidenceCategory;
  evidenceDetail: string;
  ruleId: string;
  ruleVersion: string;
  reasonCode: string;
  evaluatedAt: string;
  limitations?: string[];
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export function createActionabilityAssessment(input: CreateActionabilityAssessmentInput): ActionabilityAssessmentOutcome {
  if (isBlank(input.id) || isBlank(input.opportunityRecordId) || isBlank(input.boundAssessmentId) || isBlank(input.evaluatedAt)) {
    return {
      status: "REJECTED",
      reasonCode: "RECOMMENDATION_ACTIONABILITY_MALFORMED_INPUT",
      detail: "id, opportunityRecordId, boundAssessmentId and evaluatedAt must all be non-empty — an actionability assessment cannot bind to nothing.",
    };
  }
  if (input.state !== "unknown") {
    // Brief §35 — missing provenance can never produce ACTIONABLE or
    // NOT_ACTIONABLE; it must be rejected outright (never silently
    // resolved to a state on the caller's behalf either).
    if (input.evidenceCategory === "UNKNOWN" || isBlank(input.evidenceDetail) || isBlank(input.ruleId) || isBlank(input.ruleVersion) || isBlank(input.reasonCode)) {
      return {
        status: "REJECTED",
        reasonCode: "RECOMMENDATION_ACTIONABILITY_MISSING_PROVENANCE",
        detail: `a "${input.state}" actionability state requires a real evidence category, evidence detail, rule id, rule version and reason code — none may be empty or "UNKNOWN". Missing provenance can never produce "actionable" or "not_actionable"; it must resolve to "unknown" instead.`,
      };
    }
  }
  return {
    status: "OK",
    assessment: {
      id: input.id,
      engineVersion: RECOMMENDATION_ACTIONABILITY_ENGINE_VERSION,
      opportunityRecordId: input.opportunityRecordId,
      boundAssessmentId: input.boundAssessmentId,
      state: input.state,
      evidenceCategory: input.evidenceCategory,
      evidenceDetail: input.evidenceDetail,
      ruleId: input.ruleId,
      ruleVersion: input.ruleVersion,
      reasonCode: input.reasonCode,
      evaluatedAt: input.evaluatedAt,
      limitations: [RECOMMENDATION_ACTIONABILITY_NOT_SCIENCE_LIMITATION, ...(input.limitations ?? [])],
    },
  };
}

// ---------------------------------------------------------------------------
// The one real, production-usable evidence derivation (brief §8/§16-19).
// Precise, non-generous lifecycle interpretation — see the module header's
// STOP D review for exactly why each status maps where it does.
// ---------------------------------------------------------------------------

interface WorkflowBoundOpportunity {
  id: string;
  assessmentId: string;
}

export function assessWorkflowStateActionability(
  record: WorkflowBoundOpportunity,
  decisionState: OpportunityDecisionState | undefined,
  id: string,
  evaluatedAt: string,
): ActionabilityAssessmentOutcome {
  const status: OpportunityDecisionStatus = decisionState?.status ?? "active";

  if (status === "completed") {
    return createActionabilityAssessment({
      id,
      opportunityRecordId: record.id,
      boundAssessmentId: record.assessmentId,
      state: "not_actionable",
      evidenceCategory: "WORKFLOW_STATE",
      evidenceDetail: `OpportunityDecisionStatus is "completed" for this exact audited action (opportunityRecordId="${record.id}").`,
      ruleId: WORKFLOW_STATE_ACTIONABILITY_RULE_ID,
      ruleVersion: WORKFLOW_STATE_ACTIONABILITY_RULE_VERSION,
      reasonCode: "NOT_ACTIONABLE_ALREADY_COMPLETED",
      evaluatedAt,
    });
  }

  if (decisionState === undefined) {
    return createActionabilityAssessment({
      id,
      opportunityRecordId: record.id,
      boundAssessmentId: record.assessmentId,
      state: "unknown",
      evidenceCategory: "UNKNOWN",
      evidenceDetail: "",
      ruleId: "",
      ruleVersion: "",
      reasonCode: "UNKNOWN_MISSING_ACTIONABILITY_EVIDENCE",
      evaluatedAt,
    });
  }

  // Brief §9/§16/§17/§18 — "active" merely means not yet resolved (never
  // proof of actionability); "accepted"/"rejected" are farmer/workflow
  // decisions Phase 9's OWN policy already handles for suppression
  // purposes — Phase 10 must not duplicate that policy decision by
  // claiming either state as actionability evidence.
  return createActionabilityAssessment({
    id,
    opportunityRecordId: record.id,
    boundAssessmentId: record.assessmentId,
    state: "unknown",
    evidenceCategory: "WORKFLOW_STATE",
    evidenceDetail: `OpportunityDecisionStatus is "${status}" — insufficient by itself to establish current actionability either way.`,
    ruleId: WORKFLOW_STATE_ACTIONABILITY_RULE_ID,
    ruleVersion: WORKFLOW_STATE_ACTIONABILITY_RULE_VERSION,
    reasonCode: "UNKNOWN_WORKFLOW_STATE_INSUFFICIENT",
    evaluatedAt,
  });
}

// ---------------------------------------------------------------------------
// Identity binding (brief §10/§29/§33/§34/§45) — never trust an assessment
// merely because a caller attaches it to a given recordId; verify it
// actually describes the CURRENT record it's being used against.
// ---------------------------------------------------------------------------

export interface ActionabilityBindingValidationResult {
  valid: boolean;
  reasonCode?: string;
  detail?: string;
}

export function validateActionabilityBinding(
  assessment: ActionabilityAssessment,
  record: WorkflowBoundOpportunity,
): ActionabilityBindingValidationResult {
  if (assessment.opportunityRecordId !== record.id) {
    return {
      valid: false,
      reasonCode: "ACTIONABILITY_EVIDENCE_IDENTITY_MISMATCH",
      detail: `assessment.opportunityRecordId "${assessment.opportunityRecordId}" does not match record id "${record.id}" — an actionability assessment must never be applied to an opportunity it was not built for.`,
    };
  }
  if (assessment.boundAssessmentId !== record.assessmentId) {
    return {
      valid: false,
      reasonCode: "RECOMMENDATION_ACTIONABILITY_STALE_ASSESSMENT_BINDING",
      detail: `assessment.boundAssessmentId "${assessment.boundAssessmentId}" does not match the record's current assessmentId "${record.assessmentId}" — this actionability assessment was made against a prior economic assessment of this action and is stale following a reassessment; a fresh assessment is required.`,
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Conflicting evidence (brief §7/§36/§37) — fails closed to UNKNOWN; no
// evidence-category precedence is invented. Low real-world likelihood
// today (WORKFLOW_STATE is the only wired production source, and there is
// only ever one decision state per opportunity), but the capability is a
// required, independently-tested contract regardless (brief's own
// "Required tests" item 7).
// ---------------------------------------------------------------------------

export function combineActionabilityEvidence(
  id: string,
  assessments: readonly ActionabilityAssessment[],
  evaluatedAt: string,
): ActionabilityAssessmentOutcome {
  if (assessments.length === 0) {
    return {
      status: "REJECTED",
      reasonCode: "RECOMMENDATION_ACTIONABILITY_MALFORMED_INPUT",
      detail: "combineActionabilityEvidence requires at least one assessment to combine.",
    };
  }
  const [first, ...rest] = assessments;
  for (const other of rest) {
    if (other.opportunityRecordId !== first.opportunityRecordId || other.boundAssessmentId !== first.boundAssessmentId) {
      return {
        status: "REJECTED",
        reasonCode: "RECOMMENDATION_ACTIONABILITY_MALFORMED_INPUT",
        detail: "combineActionabilityEvidence requires every assessment to bind to the exact same opportunityRecordId/boundAssessmentId — evidence for different opportunities or different underlying assessments can never be combined into one actionability state.",
      };
    }
  }
  const nonUnknown = assessments.filter((assessment) => assessment.state !== "unknown");
  const states = new Set(nonUnknown.map((assessment) => assessment.state));

  if (states.size > 1) {
    return createActionabilityAssessment({
      id,
      opportunityRecordId: first.opportunityRecordId,
      boundAssessmentId: first.boundAssessmentId,
      state: "unknown",
      evidenceCategory: "UNKNOWN",
      evidenceDetail: `conflicting evidence: ${nonUnknown.map((assessment) => `${assessment.evidenceCategory}="${assessment.state}"`).join(", ")} — no evidence-category precedence is established, so a genuine conflict resolves to unknown rather than arbitrarily preferring one source.`,
      ruleId: "",
      ruleVersion: "",
      reasonCode: "UNKNOWN_CONFLICTING_EVIDENCE",
      evaluatedAt,
    });
  }
  if (states.size === 0) {
    return createActionabilityAssessment({
      id,
      opportunityRecordId: first.opportunityRecordId,
      boundAssessmentId: first.boundAssessmentId,
      state: "unknown",
      evidenceCategory: "UNKNOWN",
      evidenceDetail: "no non-unknown evidence available to combine.",
      ruleId: "",
      ruleVersion: "",
      reasonCode: "UNKNOWN_MISSING_ACTIONABILITY_EVIDENCE",
      evaluatedAt,
    });
  }
  const [agreedState] = states;
  const agreeing = nonUnknown.filter((assessment) => assessment.state === agreedState);
  return createActionabilityAssessment({
    id,
    opportunityRecordId: first.opportunityRecordId,
    boundAssessmentId: first.boundAssessmentId,
    state: agreedState,
    evidenceCategory: agreeing[0].evidenceCategory,
    evidenceDetail: agreeing.map((assessment) => assessment.evidenceDetail).join(" | "),
    ruleId: agreeing[0].ruleId,
    ruleVersion: agreeing[0].ruleVersion,
    reasonCode: agreeing[0].reasonCode,
    evaluatedAt,
  });
}

// ---------------------------------------------------------------------------
// Phase 9 integration boundary (brief §9/§26/§27) — WRAPS Phase 9's
// existing `actionabilityByRecordId` input; makes ZERO changes to
// `recommendation-selection.ts`. A production caller now builds real
// `ActionabilityAssessment`s (via `assessWorkflowStateActionability`, or a
// future evidence engine via `createActionabilityAssessment`), then calls
// this function to derive the map `evaluateRecommendation` already
// accepts — Phase 9 remains the sole selection/policy authority; this
// function only VALIDATES evidence binding, never decides who gets
// recommended.
// ---------------------------------------------------------------------------

/** Adversarial-review finding (HIGH — see the module header addendum below
 * for the full writeup): before this brand existed, `evaluateRecommendation`
 * accepted a bare `ReadonlyMap<string, RecommendationActionability>` — any
 * caller could hand-construct `new Map([["rec-1", "actionable"]])` and pass
 * it straight through, completely bypassing Phase 10's evidence/provenance
 * requirement. Live-reproduced: this was accepted and selected as a real
 * recommendation with zero evidence behind it. `VerifiedActionabilityMap` is
 * a nominally-branded type — structurally identical to the plain map at
 * runtime, but TypeScript will only accept a value of this type where one is
 * required if it was actually produced by `deriveVerifiedActionability`
 * (the sole real production constructor) or via an explicit, visible
 * `as unknown as VerifiedActionabilityMap` cast. This is a compile-time
 * barrier, not a runtime one — consistent with this codebase's own
 * established standard elsewhere (every earlier phase's STOP-condition
 * review has cited "no `unknown as` cast exists anywhere in the module" as
 * sufficient proof a trust boundary is closed, not "impossible even under a
 * deliberate cast"). It protects against the realistic failure mode (an
 * engineer accidentally skipping Phase 10 because Phase 9's original
 * signature made that just as easy as doing it correctly) without requiring
 * Phase 9's already-hardened, adversarially-reviewed selection logic to be
 * rewritten to re-validate bindings itself. */
declare const verifiedActionabilityBrand: unique symbol;
export type VerifiedActionabilityMap = ReadonlyMap<string, RecommendationActionability> & { readonly [verifiedActionabilityBrand]: true };

export function deriveVerifiedActionability(
  rankingResult: OpportunityRankingResult,
  assessmentsByRecordId: ReadonlyMap<string, ActionabilityAssessment>,
): VerifiedActionabilityMap {
  const result = new Map<string, RecommendationActionability>();
  for (const ranked of rankingResult.ranked) {
    const assessment = assessmentsByRecordId.get(ranked.recordId);
    if (assessment === undefined) continue; // Phase 9's own default (no entry -> "unknown") applies.
    const binding = validateActionabilityBinding(assessment, { id: ranked.recordId, assessmentId: ranked.assessmentId });
    if (!binding.valid) continue; // Fail closed: a mismatched/stale assessment is never trusted — falls through to Phase 9's "unknown" default.
    result.set(ranked.recordId, assessment.state);
  }
  return result as unknown as VerifiedActionabilityMap;
}
