/**
 * Farm Return Core Engine, Phase 9 — Recommendation Policy / "What Matters"
 * Selection Contract.
 *
 * Phase 8 answers: "which trusted audited opportunities are eligible and
 * how do they rank economically?" Phase 9 answers: "which of those
 * already-ranked opportunities should actually be surfaced to the farmer
 * now?" It is a recommendation-policy / selection / actionability-gate /
 * presentation-candidate-selector layer — never a second economic ranking
 * engine, never a science engine.
 *
 * Phase 9 has NO authority to: recalculate economics, reinterpret
 * scientific evidence, regenerate opportunity value, repair blocked
 * records, convert unknown to zero, fabricate urgency, fabricate
 * actionability, create AI scores, override integrity failures, or detach
 * a recommendation from its audited record. Every field this module ever
 * reads is copied verbatim off a real `RankedOpportunity` Phase 8 already
 * produced — this module performs no `compareMoney`/sorting-by-amount/
 * score calculation at all; Phase 8's order is authoritative and is never
 * re-sorted here.
 *
 * ---------------------------------------------------------------------
 * STOP-CONDITION REVIEW (brief's ten named conditions) — resolved, not
 * triggered.
 * ---------------------------------------------------------------------
 *
 * STOP A (Phase 8 result cannot be trusted as ordered input) — NOT
 * triggered. `evaluateRecommendation` accepts the real
 * `OpportunityRankingResult` type from `opportunity-ranking.ts` — no
 * `unknown as ...` cast, no arbitrary opportunity record, no raw Phase 7
 * record, no Phase 5 assessment directly, no caller-declared monetary
 * value or rank position. `RankedOpportunity.rank`/`.amount` are read
 * verbatim; there is no code path that recomputes either.
 *
 * STOP B (actionability cannot be represented without inventing evidence)
 * — NOT triggered. This phase introduces exactly one narrow, explicit,
 * caller-supplied policy input — `actionabilityByRecordId: VerifiedActionabilityMap`
 * (a nominally-branded `ReadonlyMap<string, RecommendationActionability>`,
 * see the Phase 10 adversarial-review addendum below) — with three honest
 * states (`"actionable" | "not_actionable" | "unknown"`). A record with no
 * entry defaults to `"unknown"` (fail closed — never inferred as actionable
 * from economic value, staleness, or any other proxy). The map's VALUE type
 * is a bare string enum with no numeric/economic field of any kind, so it
 * structurally cannot smuggle in a caller-declared `recommendedValue`/
 * `priorityScore`/`estimatedBenefit` (brief §27) — there is no such field
 * for it to carry.
 *
 * ---------------------------------------------------------------------
 * PHASE 10 ADVERSARIAL-REVIEW ADDENDUM (HIGH finding, fixed): this
 * module originally accepted a bare `ReadonlyMap<string,
 * RecommendationActionability>` here — live-reproduced during Phase 10's
 * own adversarial review: `new Map([["rec-1", "actionable"]])`,
 * hand-constructed with zero Phase 10 evidence, was accepted and selected
 * as a real recommendation. The parameter type below now requires
 * `VerifiedActionabilityMap`, producible only via
 * `recommendation-actionability.ts`'s `deriveVerifiedActionability` (or an
 * explicit, visible unsafe cast) — closing the naked-actionability bypass
 * at the type boundary without requiring this module's own
 * already-adversarially-reviewed selection logic to change. See
 * `recommendation-actionability.ts` for the full writeup.
 *
 * STOP C (lifecycle semantics insufficient) — NOT triggered. The real
 * `OpportunityDecisionStatus` enum (`"active" | "accepted" | "rejected" |
 * "completed"`, confirmed directly in `audited-opportunity-record.ts`,
 * unchanged since Phase 7) is exactly sufficient: `policy.
 * recommendableLifecycleStates` is an explicit whitelist a caller must
 * state (no implicit default — matches Phase 8's own "defaults must not
 * silently broaden eligibility" discipline), and a record's real
 * `OpportunityDecisionState` (the SAME type/map shape Phase 8 already
 * consumes) is looked up by `recordId`, never invented.
 *
 * STOP D (parent/child semantics require rebuilding Phase 8 logic) — NOT
 * triggered, resolved by design rather than merely avoided. Phase 8's own
 * pass 6 (hardened after its own adversarial review) already fully
 * resolves parent/child double counting BEFORE this module ever sees
 * `rankingResult.ranked` — a suppressed Phase 5 child never appears in
 * `ranked` at all (it is in Phase 8's own `excluded`, with reason
 * `parent_child_double_count`). This module therefore contains ZERO
 * parent/child logic of its own; it simply iterates `ranked` in order.
 * The brief's example reason codes `PARENT_DECISION_SELECTED`/
 * `CHILD_SUPPRESSED_BY_PARENT` are deliberately NOT implemented here —
 * they would never fire, since Phase 8 has already made that decision.
 *
 * STOP E (new scientific reasoning required) — NOT triggered. This module
 * never reads a scientific field (no `scienceSupport`, no product/
 * quantity data) — it only reads `RankedOpportunity`'s already-resolved
 * economic read-model fields plus the caller-supplied policy/
 * actionability/decision-state inputs.
 *
 * STOP F (new economic arithmetic required) — NOT triggered. Grep this
 * file: there is no `compareMoney`/`addMoney`/`subtractMoney`/
 * `multiplyMoney` call anywhere. The only "arithmetic" is `===` on an
 * already-computed `direction` string and array indexing against
 * `policy.maxSelectedRecommendations`.
 *
 * STOP G (source/audit identity lost) — NOT triggered. Every
 * `RecommendationCandidateEvaluation` carries `recordId`/`assessmentId`/
 * `primaryIdentity`/`economicRank`/`amount`/`currency`/`limitations`/
 * `constituentActionRecordIds` read verbatim off the source
 * `RankedOpportunity`. `assessmentFingerprint` is deliberately NOT
 * re-embedded here — matching the EXACT precedent `RankedOpportunity`
 * itself already set (Phase 8 does not duplicate the fingerprint into its
 * own output either; see `opportunity-ranking.ts`'s own "Audit-continuity
 * note"): a caller who already holds the full `TrustedOpportunityRecord`
 * (it must, to have passed it into Phase 8/9) can look up the complete
 * fingerprint/audit chain by `recordId`. One canonical source of truth
 * per fact, referenced by id, the same discipline every phase since 6 has
 * used.
 *
 * STOP H (no-current-recommendation cannot be represented distinctly from
 * engine failure) — NOT triggered. `evaluateRecommendation` returns a
 * `RecommendationSelectionOutcome` discriminated union: `{status: "OK",
 * evaluation}` (a real, successful evaluation — `evaluation.
 * primaryRecommendation` may legitimately be `null` with an explicit
 * `noRecommendationReasonCode`, a FIRST-CLASS valid result) versus
 * `{status: "BLOCKED", reasonCode, detail}` (malformed/untrusted input —
 * an unknown `recordId` referenced by the actionability map, or a
 * structurally malformed `rankingResult.ranked` array with duplicate
 * `recordId`s or non-sequential `rank`s — brief §63's defence-in-depth
 * check). These are never conflated.
 *
 * STOP I (policy cannot be versioned/audited) — NOT triggered.
 * `RecommendationSelectionPolicy.id` is caller-supplied, never randomly
 * generated, and is embedded verbatim (via `structuredClone`, so later
 * caller mutation cannot retroactively alter an already-returned result)
 * in every `RecommendationEvaluation.policy` field, alongside
 * `sourceRankingEngineVersion`/`sourceRankingPolicyId` identifying exactly
 * which Phase 8 result/policy produced the input this evaluation ran
 * against.
 *
 * STOP J (hidden current-time dependence required) — NOT triggered. Grep
 * this file: no `Date.now()`/`new Date()` exists anywhere.
 * `evaluatedAt: string` is an explicit, caller-supplied parameter, threaded
 * straight into the result.
 *
 * ---------------------------------------------------------------------
 * A deliberate design note on the top-level result type: this module does
 * NOT wrap its result in the shared `EngineOutcome<T>`/`EvidenceState`
 * machinery every earlier phase uses for a SCIENTIFIC/economic
 * calculation result. Brief §45 is explicit that "recommendation policy
 * and actionability are not science" — attaching an `EvidenceState` tag
 * (`MEASURED`/`DERIVED`/`IRISH_MODEL`/...) to a pure workflow/business-rule
 * decision would misrepresent its nature, the exact class of mistake an
 * earlier phase's own adversarial review already flagged once (reusing
 * `MEASURED` for a national market statistic that was never farm-measured).
 * `RecommendationSelectionOutcome` (below) is therefore its own small,
 * honest two-variant union, not a forced reuse of a vocabulary built for a
 * different kind of claim.
 */

import type { CurrencyCode, MoneyAmount } from "./money";
import type { OpportunityDecisionState, OpportunityDecisionStatus } from "./audited-opportunity-record";
import type { OpportunityRankingResult, RankedOpportunity } from "./opportunity-ranking";
import type { VerifiedActionabilityMap } from "./recommendation-actionability";

export const RECOMMENDATION_SELECTION_ENGINE_VERSION = "recommendation_selection_engine_v1.0.0";
export const RECOMMENDATION_SELECTION_MODE_TOP_ACTIONABLE_AUDITED_OPPORTUNITY = "TOP_ACTIONABLE_AUDITED_OPPORTUNITY";

/** Brief §71 — required on every evaluation. A recommendation is a policy
 * decision layered on top of an audited ECONOMIC estimate; it is never a
 * claim of realised/cash outcome. */
export const RECOMMENDATION_ESTIMATE_NOT_REALISED_LIMITATION =
  "A selected recommendation is Farm Return's currently top-ranked, actionable, audited economic estimate under this recommendation policy. It is not a confirmed cash saving, a realised outcome, or a guarantee — see the underlying opportunity record's own limitations for the full economic/scientific basis.";

// ---------------------------------------------------------------------------
// Actionability (brief §8/§9/§26/§29/§30) — explicit three-state contract.
// `undefined`/no entry in the caller-supplied map means "unknown", never
// "actionable" — actionability is never inferred from economic value,
// staleness or any other proxy.
// ---------------------------------------------------------------------------

export type RecommendationActionability = "actionable" | "not_actionable" | "unknown";

// ---------------------------------------------------------------------------
// Policy (brief §12/§16/§17/§32/§63) — explicit, versioned. No field is
// implicitly defaulted by this module; a caller must state every accepted
// value explicitly (Phase 8's own "defaults must not silently broaden
// eligibility" discipline, carried forward).
// ---------------------------------------------------------------------------

export interface RecommendationSelectionPolicy {
  /** Deterministic, caller-supplied — never randomly generated. Recorded
   * on every result so a policy change is distinguishable historically. */
  id: string;
  selectionMode: typeof RECOMMENDATION_SELECTION_MODE_TOP_ACTIONABLE_AUDITED_OPPORTUNITY;
  /** Which real `OpportunityDecisionStatus` values may surface as a NEW
   * recommendation. Distinct from, and narrower than, Phase 8's own
   * `eligibleLifecycleStates` (which decides whether a record is even
   * VISIBLE/ranked/audited at all) — this is Phase 9's own "is this
   * actionable as a fresh ask right now" policy layer on top of that. */
  recommendableLifecycleStates: OpportunityDecisionStatus[];
  /** Brief §32 — pilot default is expected to be supplied as `1` by the
   * caller; never implicitly defaulted here. */
  maxSelectedRecommendations: number;
}

// ---------------------------------------------------------------------------
// Structured, never-silent candidate outcomes (brief §6/§7/§65/§66/§67).
// ---------------------------------------------------------------------------

export type RecommendationCandidateReason =
  | { kind: "selected"; code: "SELECTED_HIGHEST_RANKED_ACTIONABLE_OPPORTUNITY" }
  | { kind: "eligible_not_selected"; code: "LOWER_RANKED_THAN_SELECTED" }
  | { kind: "deferred"; code: "ACTIONABILITY_UNKNOWN" }
  | { kind: "deferred"; code: "NOT_CURRENTLY_ACTIONABLE" }
  | { kind: "suppressed"; code: "ALREADY_ACCEPTED" }
  | { kind: "suppressed"; code: "ALREADY_COMPLETED" }
  | { kind: "suppressed"; code: "USER_REJECTED" }
  | { kind: "suppressed"; code: "LIFECYCLE_NOT_RECOMMENDABLE"; status: OpportunityDecisionStatus }
  | { kind: "not_applicable"; code: "POLICY_NOT_APPLICABLE" };

export interface RecommendationCandidateEvaluation {
  /** Phase 8's own rank — retained as HISTORICAL FACT (brief §64) and
   * never relabelled, even when a lower-ranked candidate is the one
   * actually selected because a higher-ranked one was deferred/
   * suppressed. */
  economicRank: number;
  recordId: string;
  assessmentId: string;
  primaryIdentity: string;
  sourcePhase: RankedOpportunity["sourcePhase"];
  amount: MoneyAmount;
  currency: CurrencyCode;
  lifecycleStatus: OpportunityDecisionStatus;
  actionability: RecommendationActionability;
  /** Read verbatim off the source `RankedOpportunity` — never re-derived,
   * never stripped. */
  limitations: string[];
  constituentActionRecordIds: string[] | null;
  outcome: RecommendationCandidateReason;
}

export interface RecommendationEvaluation {
  policy: RecommendationSelectionPolicy;
  engineVersion: string;
  /** Identifies exactly which Phase 8 result/policy this evaluation ran
   * against (brief §36). */
  sourceRankingEngineVersion: string;
  sourceRankingPolicyId: string;
  evaluatedAt: string;
  /** Every Phase 8-ranked opportunity Phase 9 considered, in Phase 8's own
   * unmodified order — full auditability of why one was selected over
   * another (brief §14/§16). */
  candidates: RecommendationCandidateEvaluation[];
  /** Ordered, length <= `policy.maxSelectedRecommendations`. */
  selectedRecommendations: RecommendationCandidateEvaluation[];
  /** Convenience accessor for the pilot's `maxSelectedRecommendations: 1`
   * case — always `selectedRecommendations[0] ?? null`, never a second
   * source of truth. */
  primaryRecommendation: RecommendationCandidateEvaluation | null;
  /** Populated exactly when `selectedRecommendations` is empty — a
   * first-class, valid, structured reason, never a fabricated fallback
   * (brief §43). */
  noRecommendationReasonCode: "NO_RANKED_OPPORTUNITIES" | "NO_POSITIVE_CURRENT_RECOMMENDATION" | "NO_ACTIONABLE_CURRENT_RECOMMENDATION" | null;
  limitations: string[];
}

export type RecommendationSelectionOutcome =
  | { status: "OK"; evaluation: RecommendationEvaluation }
  | { status: "BLOCKED"; reasonCode: string; detail: string };

// ---------------------------------------------------------------------------
// Per-candidate structural eligibility (brief §5) — never a bare boolean.
// ---------------------------------------------------------------------------

function structuralReason(
  ranked: RankedOpportunity,
  status: OpportunityDecisionStatus,
  actionability: RecommendationActionability,
  policy: RecommendationSelectionPolicy,
): RecommendationCandidateReason | null {
  // Brief §9/§25 — Phase 9's pilot scope is deliberately conservative:
  // only a genuine BENEFIT is ever recommendable. A cost/adverse outcome
  // is a separate future recommendation class (brief §25), never
  // reintroduced here even if a caller's Phase 8 policy chose to include
  // it in `ranked`. A genuine zero is real and auditable but never the
  // primary "what matters" recommendation (brief §24) — it simply never
  // satisfies this check, so it always falls through to
  // "no positive/actionable candidate" at the evaluation level, never a
  // fabricated importance.
  if (ranked.direction !== "benefit") return { kind: "not_applicable", code: "POLICY_NOT_APPLICABLE" };
  if (!policy.recommendableLifecycleStates.includes(status)) {
    if (status === "accepted") return { kind: "suppressed", code: "ALREADY_ACCEPTED" };
    if (status === "completed") return { kind: "suppressed", code: "ALREADY_COMPLETED" };
    if (status === "rejected") return { kind: "suppressed", code: "USER_REJECTED" };
    return { kind: "suppressed", code: "LIFECYCLE_NOT_RECOMMENDABLE", status };
  }
  // Brief §29 — unknown is NEVER treated as actionable.
  if (actionability === "unknown") return { kind: "deferred", code: "ACTIONABILITY_UNKNOWN" };
  if (actionability === "not_actionable") return { kind: "deferred", code: "NOT_CURRENTLY_ACTIONABLE" };
  return null; // structurally eligible to be selected
}

// ---------------------------------------------------------------------------
// Defence-in-depth validation of the caller-supplied inputs (brief §26/
// §63) — this module's input types are already the real Phase 7/8 trusted
// shapes, so this is a structural sanity check on top of that trust, not a
// re-verification of Phase 8's own economics.
// ---------------------------------------------------------------------------

function validateInputs(
  rankingResult: OpportunityRankingResult,
  actionabilityByRecordId: VerifiedActionabilityMap,
  policy: RecommendationSelectionPolicy,
): { blocked: false } | { blocked: true; reasonCode: string; detail: string } {
  // Adversarial-review finding (HIGH): this module iterates
  // `rankingResult.ranked` in physical array order (brief §3/§15/§37 —
  // never re-sorted), and copies each entry's own `rank` field verbatim
  // into `economicRank` purely as an audit label. A genuine Phase 8
  // `rankOpportunities()` output always has `ranked[i].rank === i + 1` by
  // construction (rank is assigned as `index + 1` after Phase 8's own
  // sort) — but nothing in the type system enforces that invariant on an
  // arbitrary `OpportunityRankingResult` value. Live-reproduced: an array
  // physically ordered [C, A, B] with rank fields [3, 1, 2] caused this
  // module to SELECT C (first in array order) while its own output
  // labelled the selection "economicRank: 3" and marked the genuinely
  // rank-1 record A as "LOWER_RANKED_THAN_SELECTED" — a real detachment
  // between what was selected and what the audit trail's own rank field
  // says should have been selected. Fixed by requiring array position and
  // rank field to agree exactly, the same defence-in-depth discipline
  // already applied to duplicate recordId/rank below.
  if (policy.selectionMode !== RECOMMENDATION_SELECTION_MODE_TOP_ACTIONABLE_AUDITED_OPPORTUNITY) {
    return {
      blocked: true,
      reasonCode: "RECOMMENDATION_SELECTION_UNSUPPORTED_SELECTION_MODE",
      detail: `policy.selectionMode "${String(policy.selectionMode)}" is not a selection mode this engine version supports — only "${RECOMMENDATION_SELECTION_MODE_TOP_ACTIONABLE_AUDITED_OPPORTUNITY}" is implemented. An unsupported mode must fail closed rather than silently falling back to the one implemented behaviour.`,
    };
  }
  const knownRecordIds = new Set([...rankingResult.ranked.map((r) => r.recordId), ...rankingResult.excluded.map((r) => r.recordId)]);
  for (const recordId of actionabilityByRecordId.keys()) {
    if (!knownRecordIds.has(recordId)) {
      return {
        blocked: true,
        reasonCode: "RECOMMENDATION_SELECTION_UNKNOWN_ACTIONABILITY_RECORD_ID",
        detail: `actionabilityByRecordId references recordId "${recordId}", which does not correspond to any record in the supplied Phase 8 ranking result (neither ranked nor excluded) — actionability input must only reference records the trusted Phase 8 result actually considered.`,
      };
    }
  }
  const seenRecordIds = new Set<string>();
  const seenRanks = new Set<number>();
  for (const [index, r] of rankingResult.ranked.entries()) {
    if (seenRecordIds.has(r.recordId)) {
      return {
        blocked: true,
        reasonCode: "RECOMMENDATION_SELECTION_MALFORMED_RANKING_INPUT",
        detail: `the supplied Phase 8 ranking result contains duplicate recordId "${r.recordId}" in its ranked array — this cannot be a genuine trusted Phase 8 output and is rejected rather than silently choosing one.`,
      };
    }
    seenRecordIds.add(r.recordId);
    if (seenRanks.has(r.rank)) {
      return {
        blocked: true,
        reasonCode: "RECOMMENDATION_SELECTION_MALFORMED_RANKING_INPUT",
        detail: `the supplied Phase 8 ranking result contains duplicate rank position ${r.rank} — this cannot be a genuine trusted Phase 8 output.`,
      };
    }
    seenRanks.add(r.rank);
    if (r.rank !== index + 1) {
      return {
        blocked: true,
        reasonCode: "RECOMMENDATION_SELECTION_RANK_ORDER_MISMATCH",
        detail: `the supplied Phase 8 ranking result's array position ${index} holds a record whose own rank field is ${r.rank}, not ${index + 1} — a genuine Phase 8 output always has array order matching its rank field exactly. This cannot be a genuine trusted Phase 8 output and is rejected, since this module selects by array order and a mismatch here could silently select a different record than its own reported economicRank implies.`,
      };
    }
  }
  return { blocked: false };
}

// ---------------------------------------------------------------------------
// Main entry point.
// ---------------------------------------------------------------------------

export function evaluateRecommendation(
  rankingResult: OpportunityRankingResult,
  decisionStates: ReadonlyMap<string, OpportunityDecisionState>,
  actionabilityByRecordId: VerifiedActionabilityMap,
  policy: RecommendationSelectionPolicy,
  evaluatedAt: string,
): RecommendationSelectionOutcome {
  // Brief §11/§39 — no hidden clock: `evaluatedAt` is the caller's own
  // explicit context, never `Date.now()`/`new Date()`.

  // Brief §73 — snapshot semantics: later mutation of the caller's own
  // policy/actionability objects must not alter an already-returned
  // result.
  const snapshotPolicy: RecommendationSelectionPolicy = structuredClone(policy);
  // `structuredClone` yields a plain Map — re-asserting the brand here is
  // safe because we already hold a genuine `VerifiedActionabilityMap`
  // (the parameter type itself is the actual trust boundary); this is a
  // snapshot of already-verified data, not a new unverified input.
  const snapshotActionability: VerifiedActionabilityMap = structuredClone(new Map(actionabilityByRecordId)) as unknown as VerifiedActionabilityMap;

  const validation = validateInputs(rankingResult, snapshotActionability, snapshotPolicy);
  if (validation.blocked) {
    return { status: "BLOCKED", reasonCode: validation.reasonCode, detail: validation.detail };
  }

  const candidates: RecommendationCandidateEvaluation[] = [];
  const selectedRecommendations: RecommendationCandidateEvaluation[] = [];
  let anyPositiveBenefitCandidate = false;

  // Brief §3/§15/§37 — iterate `rankingResult.ranked` EXACTLY as Phase 8
  // ordered it. No sort, no re-rank, anywhere in this function.
  for (const ranked of rankingResult.ranked) {
    const status: OpportunityDecisionStatus = decisionStates.get(ranked.recordId)?.status ?? "active";
    const actionability: RecommendationActionability = snapshotActionability.get(ranked.recordId) ?? "unknown";
    if (ranked.direction === "benefit") anyPositiveBenefitCandidate = true;

    const blockingReason = structuralReason(ranked, status, actionability, snapshotPolicy);
    let outcome: RecommendationCandidateReason;
    if (blockingReason !== null) {
      outcome = blockingReason;
    } else if (selectedRecommendations.length < snapshotPolicy.maxSelectedRecommendations) {
      outcome = { kind: "selected", code: "SELECTED_HIGHEST_RANKED_ACTIONABLE_OPPORTUNITY" };
    } else {
      outcome = { kind: "eligible_not_selected", code: "LOWER_RANKED_THAN_SELECTED" };
    }

    const evaluation: RecommendationCandidateEvaluation = {
      economicRank: ranked.rank,
      recordId: ranked.recordId,
      assessmentId: ranked.assessmentId,
      primaryIdentity: ranked.primaryIdentity,
      sourcePhase: ranked.sourcePhase,
      amount: ranked.amount,
      currency: ranked.currency,
      lifecycleStatus: status,
      actionability,
      limitations: [...ranked.limitations],
      constituentActionRecordIds: ranked.constituentActionRecordIds,
      outcome,
    };
    candidates.push(evaluation);
    if (outcome.kind === "selected") selectedRecommendations.push(evaluation);
  }

  let noRecommendationReasonCode: RecommendationEvaluation["noRecommendationReasonCode"] = null;
  if (selectedRecommendations.length === 0) {
    if (rankingResult.ranked.length === 0) {
      noRecommendationReasonCode = "NO_RANKED_OPPORTUNITIES";
    } else if (!anyPositiveBenefitCandidate) {
      noRecommendationReasonCode = "NO_POSITIVE_CURRENT_RECOMMENDATION";
    } else {
      noRecommendationReasonCode = "NO_ACTIONABLE_CURRENT_RECOMMENDATION";
    }
  }

  const evaluation: RecommendationEvaluation = {
    policy: snapshotPolicy,
    engineVersion: RECOMMENDATION_SELECTION_ENGINE_VERSION,
    sourceRankingEngineVersion: rankingResult.engineVersion,
    sourceRankingPolicyId: rankingResult.policy.id,
    evaluatedAt,
    candidates,
    selectedRecommendations,
    primaryRecommendation: selectedRecommendations[0] ?? null,
    noRecommendationReasonCode,
    limitations: [RECOMMENDATION_ESTIMATE_NOT_REALISED_LIMITATION],
  };
  return { status: "OK", evaluation };
}
