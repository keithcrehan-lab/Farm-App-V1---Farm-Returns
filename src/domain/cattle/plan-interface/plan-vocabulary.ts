/**
 * Cattle C9 — the compiled translation tables (design freeze B2–B6, D1–D4).
 * Every table is total over the frozen upstream vocabulary it reads
 * (`satisfies Record<…>`, so a new upstream state fails to compile) and is
 * looked up at runtime through `lookup`, which yields `undefined` — never a
 * default — for a value outside it (the caller then fails closed).
 *
 * THE vocabulary table (`CATTLE_PLAN_VOCABULARY`) is the only source of the
 * Plan action key, title, completion contract and the canonical records that
 * can prove completion; the job projection and the `CanonicalEvidence`
 * projection both read it, so they cannot drift. Keys are namespaced by
 * source family (`CATTLE_OBLIGATION:<obligationId>`,
 * `CATTLE_PROGRAMME:["<programmeId>","<actionKind>"]`,
 * `CATTLE_RECOMMENDATION:<actionKind>`), so families never merge through
 * coincidentally equal strings.
 */

import type { CompletionContract, PlanBlockerStatus, SystemPriorityTier } from "../../plan";
import type { RecommendationOutcome } from "../evidence-pack";
import type { CattleEvaluationState } from "../evaluation";
import type { GoalProjectionStatus } from "../goals";
import type { ProgrammeOccurrenceState } from "../programmes";
import type { BenefitClaim, RecommendationPriorityTier } from "../recommendations";
import type { ObligationState } from "../regulatory";
import type { LatestWeightState, ScopeMembershipState } from "../weights";
import type { CattlePlanFamily, CattlePlanOrigin } from "./plan-contracts";

/** Own-property lookup: `undefined` for anything not in the table (fail closed at the caller). */
export function lookup<V>(table: Readonly<Record<string, V>>, key: unknown): V | undefined {
  return typeof key === "string" && Object.hasOwn(table, key) ? table[key] : undefined;
}

// ---------------------------------------------------------------------------
// State → proposal (B6) and completion meaning
// ---------------------------------------------------------------------------

/** Blocker a consumed state itself requires (B6); `NONE` = no state blocker. */
export type StateBlocker = "NONE" | "UNKNOWN" | "ACTIVE";

/**
 * How a consumed state counts as completion evidence for work already planned:
 * `DONE` (the owner counted completion evidence), `NOT_DONE` (resolved, no
 * completion) or `NOT_EVIDENCED` (unresolved or not applicable — never complete).
 */
export type CompletionMeaning = "DONE" | "NOT_DONE" | "NOT_EVIDENCED";

export interface StatePlan {
  proposal: boolean;
  blocker: StateBlocker;
  /** `UNRESOLVED` = required evidence is unresolved (evidence-resolution work, B4). */
  resolution: "RESOLVED" | "UNRESOLVED";
  completion: CompletionMeaning;
}

const none = (completion: CompletionMeaning): StatePlan => ({ proposal: false, blocker: "NONE", resolution: "RESOLVED", completion });
const work = (completion: CompletionMeaning): StatePlan => ({ proposal: true, blocker: "NONE", resolution: "RESOLVED", completion });
const blocked: StatePlan = { proposal: true, blocker: "ACTIVE", resolution: "RESOLVED", completion: "NOT_DONE" };
const unresolved: StatePlan = { proposal: true, blocker: "UNKNOWN", resolution: "UNRESOLVED", completion: "NOT_EVIDENCED" };

/** C2 (B6). Unresolved evidence never counts as completion. */
export const C2_STATE_PLAN = {
  NOT_APPLICABLE: none("NOT_EVIDENCED"),
  NOT_TRIGGERED: none("NOT_EVIDENCED"),
  SATISFIED: none("DONE"),
  SATISFIED_LATE: none("DONE"),
  UPCOMING: work("NOT_DONE"),
  OUTSTANDING: work("NOT_DONE"),
  OVERDUE: work("NOT_DONE"),
  ADVISORY_FAIL: work("NOT_DONE"),
  BLOCKED: blocked,
  UNKNOWN: unresolved,
  INSUFFICIENT_EVIDENCE: unresolved,
  EVIDENCE_CONFLICT: unresolved,
  INVALID_EVIDENCE: unresolved,
  UNSUPPORTED: unresolved,
  REVIEW_REQUIRED: unresolved,
} as const satisfies Record<ObligationState, StatePlan>;

/** C7 (B6). A proposal needs a concrete programme action (`actionId`). */
export const C7_STATE_PLAN = {
  NOT_APPLICABLE: none("NOT_EVIDENCED"),
  COMPLETED: none("DONE"),
  UPCOMING: work("NOT_DONE"),
  DUE: work("NOT_DONE"),
  OVERDUE: work("NOT_DONE"),
  BLOCKED: blocked,
  UNKNOWN: unresolved,
  INSUFFICIENT_EVIDENCE: unresolved,
  EVIDENCE_CONFLICT: unresolved,
  REVIEW_REQUIRED: unresolved,
  INVALID_EVIDENCE: unresolved,
} as const satisfies Record<ProgrammeOccurrenceState, StatePlan>;

/** C8 (B6). A proposal needs a concrete proposed action; nothing is invented. */
export const C8_OUTCOME_PLAN = {
  NO_RECOMMENDATION: none("NOT_EVIDENCED"),
  ACTIONABLE: work("NOT_DONE"),
  BLOCKED: blocked,
  REVIEW_REQUIRED: unresolved,
  INSUFFICIENT_EVIDENCE: unresolved,
} as const satisfies Record<RecommendationOutcome, StatePlan>;

// ---------------------------------------------------------------------------
// Gates (D3)
// ---------------------------------------------------------------------------

/** C0 gate state (plus C8's generated `NOT_EVALUATED` and C7's `NOT_SUPPLIED`) → Plan blocker status. */
export const GATE_STATE_STATUS = {
  PASS: "CLEARED",
  NOT_APPLICABLE: "CLEARED",
  FAIL: "ACTIVE",
  INSUFFICIENT_EVIDENCE: "UNKNOWN",
  CONFLICTING_EVIDENCE: "UNKNOWN",
  UNSUPPORTED: "UNKNOWN",
  REVIEW_REQUIRED: "UNKNOWN",
  NOT_EVALUATED: "UNKNOWN",
  NOT_SUPPLIED: "UNKNOWN",
} as const satisfies Record<CattleEvaluationState | "NOT_EVALUATED" | "NOT_SUPPLIED", PlanBlockerStatus>;

/** The B5 blocker reason when a legal / scheme hard-gate window's source cannot be proven unique and current. */
export const DEADLINE_AUTHORITY_NOT_UNIQUELY_ESTABLISHED = "DEADLINE_AUTHORITY_NOT_UNIQUELY_ESTABLISHED";

/** C2 classifications whose hard-gate windows may carry a sourced hard deadline (B4 / B5). */
export const HARD_OBLIGATION_CLASSIFICATIONS: readonly string[] = Object.freeze(["LEGAL_REQUIRED", "LEGAL_CONDITIONAL", "SCHEME_CONDITIONAL"]);

// ---------------------------------------------------------------------------
// Membership (B2)
// ---------------------------------------------------------------------------

/** C4 membership → Plan: all-or-unknown (Plan has no partial membership). */
export const MEMBERSHIP_PLAN = {
  MEMBER: "MEMBER",
  NOT_MEMBER: "NOT_MEMBER",
  UNKNOWN: "UNRESOLVED",
  EVIDENCE_CONFLICT: "UNRESOLVED",
  INVALID: "UNRESOLVED",
} as const satisfies Record<ScopeMembershipState, "MEMBER" | "NOT_MEMBER" | "UNRESOLVED">;

// ---------------------------------------------------------------------------
// C8 action kinds (B3 / B4 / D4)
// ---------------------------------------------------------------------------

/** Default-registry kinds C9 consumes: tier (D4) and vocabulary row. A drift test ties the keys to the default registry. */
export const C8_DEFAULT_KIND_PLAN = {
  RECORD_WEIGHT: { tier: "INFORMATION_VALUE", row: "C8_RECORD_WEIGHT" },
  DECLARE_PRODUCTION_GOAL: { tier: "INFORMATION_VALUE", row: "C8_DECLARE_PRODUCTION_GOAL" },
  REVIEW_WITHDRAWAL_STATUS: { tier: "INFORMATION_VALUE", row: "C8_REVIEW_WITHDRAWAL_STATUS" },
  RESOLVE_OBLIGATION_EVIDENCE: { tier: "INFORMATION_VALUE", row: "C8_RESOLVE_OBLIGATION_EVIDENCE" },
  COMPLETE_PROGRAMME_ACTION: { tier: "ROUTINE_MANAGEMENT", row: "C8_COMPLETE_PROGRAMME_ACTION" },
} as const satisfies Record<string, { tier: SystemPriorityTier; row: CattlePlanVocabularyRowId }>;

/**
 * Modelled actions (not in `C8_DEFAULT_KIND_PLAN`, `benefitClaim: MODELLED`) by
 * their C8 tier. A `SAFETY_LEGAL_WELFARE` label never establishes
 * `HARD_OBLIGATION` and is never a fallback: `null` fails closed.
 */
export const C8_MODELLED_TIER = {
  SAFETY_LEGAL_WELFARE: null,
  AVOID_MATERIAL_LOSS: "AVOID_MATERIAL_LOSS",
  EXPECTED_NET_RETURN: "EXPECTED_NET_RETURN",
  VALUE_OF_INFORMATION: "INFORMATION_VALUE",
} as const satisfies Record<RecommendationPriorityTier, SystemPriorityTier | null>;

/** B3: a data-gap action (`benefitClaim: NONE`) vs a modelled recommendation (never adviser-approved). */
export const C8_ORIGIN = { NONE: "DATA_GAP", MODELLED: "RECOMMENDATION" } as const satisfies Record<BenefitClaim, CattlePlanOrigin>;

/** D2: the only C8 kinds that may fold into authoritative work, and the family they restate. */
export const C8_FOLD_WHITELIST = { RESOLVE_OBLIGATION_EVIDENCE: "C2_OBLIGATION", COMPLETE_PROGRAMME_ACTION: "C7_PROGRAMME" } as const satisfies Record<string, CattlePlanFamily>;

// ---------------------------------------------------------------------------
// Completion evidence vocabularies (owner states consumed through C8's sealed context)
// ---------------------------------------------------------------------------

/** C4 latest weight (via C8) → completion evidence for RECORD_WEIGHT. */
export const WEIGHT_EVIDENCE = { KNOWN: "OBSERVED", NONE: "NO_OBSERVATION", EVIDENCE_CONFLICT: "UNRESOLVED", UNSUPPORTED: "UNRESOLVED" } as const satisfies Record<
  LatestWeightState,
  "OBSERVED" | "NO_OBSERVATION" | "UNRESOLVED"
>;

/** C6 goal projection status (via C8) → data presence for DECLARE_PRODUCTION_GOAL. */
export const GOAL_EVIDENCE = { ACTIVE: "PRESENT", NONE: "MISSING", INTENT_CONFLICT: "UNRESOLVED", INVALID: "UNRESOLVED" } as const satisfies Record<
  GoalProjectionStatus,
  "PRESENT" | "MISSING" | "UNRESOLVED"
>;

// ---------------------------------------------------------------------------
// THE vocabulary table
// ---------------------------------------------------------------------------

export type CattlePlanCompletionForm =
  /** Windowed work: completed only when every origin of the job is completed by its owner (C2 counted fulfilment / C7 counted completion); window-less work is MANUAL. */
  | "OWNER_OCCURRENCE_COMPLETION"
  /** A C4 weight observed at or after the viewpoint the gap was identified at. */
  | "WEIGHT_OBSERVED_SINCE"
  /** A C6 production goal in force. */
  | "GOAL_IN_FORCE"
  /** No canonical record reliably proves completion. */
  | "MANUAL";

export interface CattlePlanVocabularyRow {
  family: CattlePlanFamily;
  completion: CattlePlanCompletionForm;
  /** The owning canonical records that can prove completion (empty for MANUAL). */
  provenBy: readonly string[];
}

export const CATTLE_PLAN_VOCABULARY = {
  C2_OBLIGATION: { family: "C2_OBLIGATION", completion: "OWNER_OCCURRENCE_COMPLETION", provenBy: ["C2 ObligationStateRecord SATISFIED / SATISFIED_LATE: evidence.countedEvidence (ObligationFulfilmentEvidence.evidenceId, fulfilledAt)"] },
  C7_PROGRAMME_ACTION: {
    family: "C7_PROGRAMME",
    completion: "OWNER_OCCURRENCE_COMPLETION",
    provenBy: ["C7 ProgrammeOccurrenceRecord COMPLETED: completion.counted (declarationId or C3 healthRecordId, completedAt)"],
  },
  C8_RECORD_WEIGHT: { family: "C8_RECOMMENDATION", completion: "WEIGHT_OBSERVED_SINCE", provenBy: ["C4 latest-known weight (state KNOWN, observedAt) bound by C8's sealed context weights part"] },
  C8_DECLARE_PRODUCTION_GOAL: { family: "C8_RECOMMENDATION", completion: "GOAL_IN_FORCE", provenBy: ["C6 goal projection status ACTIVE (goal snapshot fingerprint) bound by C8's sealed context goals part"] },
  C8_REVIEW_WITHDRAWAL_STATUS: { family: "C8_RECOMMENDATION", completion: "MANUAL", provenBy: [] },
  C8_RESOLVE_OBLIGATION_EVIDENCE: { family: "C8_RECOMMENDATION", completion: "MANUAL", provenBy: [] },
  C8_COMPLETE_PROGRAMME_ACTION: { family: "C8_RECOMMENDATION", completion: "MANUAL", provenBy: [] },
  C8_MODELLED_ACTION: { family: "C8_RECOMMENDATION", completion: "MANUAL", provenBy: [] },
} as const satisfies Record<string, CattlePlanVocabularyRow>;

export type CattlePlanVocabularyRowId = keyof typeof CATTLE_PLAN_VOCABULARY;

export const obligationActionKey = (obligationId: string) => `CATTLE_OBLIGATION:${obligationId}`;
export const programmeActionKey = (programmeId: string, actionKind: string) => `CATTLE_PROGRAMME:${JSON.stringify([programmeId, actionKind])}`;
export const recommendationActionKey = (actionKind: string) => `CATTLE_RECOMMENDATION:${actionKind}`;

/** Deterministic title of a vocabulary row's job (a function of the action key alone). */
export function vocabularyTitle(row: CattlePlanVocabularyRowId, actionKey: string): string {
  return `Cattle work ${row}: ${actionKey}`;
}

/** `CanonicalEvidence.records` key of windowed owner-occurrence work (the job's own identity). */
export const occurrenceCompletionKind = (identityKey: string) => `CATTLE_PLAN_COMPLETION:${identityKey}`;
/** `CanonicalEvidence.records` key of one animal's C4 weight observations. */
export const weightObservationKind = (animalId: string) => `CATTLE_WEIGHT_OBSERVATION:${animalId}`;
/** `CanonicalEvidence.dataPresence` key of a production goal in force. */
export const GOAL_IN_FORCE_REQUIREMENT = "CATTLE_PRODUCTION_GOAL_IN_FORCE";

/**
 * The completion contract of a job, from its vocabulary row and identity
 * alone — so every work item merged into one job has the same contract by
 * construction. `effectiveAt` is the request viewpoint (the instant the data
 * gap was identified at).
 */
export function completionContractFor(row: CattlePlanVocabularyRowId, identity: { identityKey: string; animalId: string; windowed: boolean }, effectiveAt: string): CompletionContract {
  switch (CATTLE_PLAN_VOCABULARY[row].completion) {
    case "OWNER_OCCURRENCE_COMPLETION":
      return identity.windowed ? { kind: "OPERATIONAL_RECORD", recordKind: occurrenceCompletionKind(identity.identityKey), coverage: "EACH_MEMBER", notBeforeIso: null } : { kind: "MANUAL" };
    case "WEIGHT_OBSERVED_SINCE":
      return { kind: "OPERATIONAL_RECORD", recordKind: weightObservationKind(identity.animalId), coverage: "EACH_MEMBER", notBeforeIso: effectiveAt };
    case "GOAL_IN_FORCE":
      return { kind: "DATA_COMPLETION", requirementKey: GOAL_IN_FORCE_REQUIREMENT };
    case "MANUAL":
      return { kind: "MANUAL" };
  }
}
