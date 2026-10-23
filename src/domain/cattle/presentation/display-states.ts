/**
 * Cattle C10 — display-state tables. Every table is TOTAL over the frozen
 * upstream vocabulary it reads (`satisfies Record<…>`: a new upstream state
 * fails to compile) and maps each state to its own farmer-language display
 * state. No table invents a state, merges two distinct upstream states into
 * one display, or renders an unresolved state with a resolved tone:
 *
 * - `good` is used only for a resolved, favourable state;
 * - `unknown` is its own tone (never green, never blank) for every
 *   unknown / insufficient / not-supplied state;
 * - `conflict` is its own tone for competing evidence;
 * - `review` for anything a person must look at;
 * - `attention` / `risk` for resolved states that need action.
 *
 * Display only (CAT-INV-014): nothing here feeds back into a domain call.
 */

import type { AnimalResolutionState } from "../animal-snapshot";
import type { RecommendationOutcome } from "../evidence-pack";
import type { GoalProjectionStatus } from "../goals";
import type { AdministrationWithdrawalState, WithdrawalGateState } from "../health";
import type { DerivationState, TargetComparisonState, TrendState } from "../performance";
import type { ProgrammeOccurrenceState } from "../programmes";
import type { ObligationState } from "../regulatory";
import type { LatestWeightState, ScopeMembershipState, WeightMeasurementBasis } from "../weights";
import type { CompletionState, PlanBlockerStatus, PlanJobStatus, ReadinessState, SystemPriorityTier } from "../../plan";

export type DisplayTone = "good" | "neutral" | "info" | "attention" | "risk" | "unknown" | "conflict" | "review";

export interface DisplayState {
  /** Stable display-state id (`<FAMILY>:<UPSTREAM_STATE>`), unique across tables. */
  code: string;
  label: string;
  tone: DisplayTone;
  /** One plain sentence; `null` when the label says it all. */
  detail: string | null;
}

const ds = (family: string, state: string, label: string, tone: DisplayTone, detail: string | null = null): DisplayState => ({ code: `${family}:${state}`, label, tone, detail });

type Table<S extends string> = Readonly<Record<S, DisplayState>>;

/** C1 — an identity dimension (DOB, sex, breed, group, location, lifecycle). */
export const IDENTITY_DISPLAY = {
  KNOWN: ds("IDENTITY", "KNOWN", "Recorded", "neutral"),
  UNKNOWN: ds("IDENTITY", "UNKNOWN", "Not recorded", "unknown", "No record of this yet."),
  CONFLICTING_EVIDENCE: ds("IDENTITY", "CONFLICTING_EVIDENCE", "Records disagree", "conflict", "Two records give different answers; neither is chosen."),
  INVALID_EVIDENCE: ds("IDENTITY", "INVALID_EVIDENCE", "Record can't be read", "review", "A record is malformed and was not used."),
} as const satisfies Table<AnimalResolutionState>;

/** C4 — membership of a management group. */
export const MEMBERSHIP_DISPLAY = {
  MEMBER: ds("MEMBERSHIP", "MEMBER", "In group", "neutral"),
  NOT_MEMBER: ds("MEMBERSHIP", "NOT_MEMBER", "Not in group", "neutral"),
  UNKNOWN: ds("MEMBERSHIP", "UNKNOWN", "Group not recorded", "unknown", "We can't tell which group this animal is in."),
  EVIDENCE_CONFLICT: ds("MEMBERSHIP", "EVIDENCE_CONFLICT", "Group records disagree", "conflict", "Two corrections name different groups; neither is chosen."),
  INVALID: ds("MEMBERSHIP", "INVALID", "Group record can't be read", "review"),
} as const satisfies Table<ScopeMembershipState>;

/** C4 — the latest known weight. */
export const LATEST_WEIGHT_DISPLAY = {
  // Basis-neutral: how a KNOWN weight was taken is `WEIGHT_BASIS_DISPLAY` (never "Weighed" for an estimate).
  KNOWN: ds("WEIGHT", "KNOWN", "Weight recorded", "neutral"),
  NONE: ds("WEIGHT", "NONE", "Not weighed yet", "unknown", "No weight is recorded for this animal."),
  EVIDENCE_CONFLICT: ds("WEIGHT", "EVIDENCE_CONFLICT", "Weights disagree", "conflict", "Different weights were recorded at the same time; neither is used."),
  UNSUPPORTED: ds("WEIGHT", "UNSUPPORTED", "Weight unit not supported", "review", "The latest weight is in a unit that can't be converted to kilograms."),
} as const satisfies Table<LatestWeightState>;

/** C5 — the period gain / daily gain derivation. */
export const GAIN_DISPLAY = {
  DERIVED: ds("GAIN", "DERIVED", "Calculated", "neutral"),
  INSUFFICIENT_EVIDENCE: ds("GAIN", "INSUFFICIENT_EVIDENCE", "Needs another weight", "unknown", "Daily gain needs at least two usable weights."),
  INVALID: ds("GAIN", "INVALID", "Can't be calculated", "review", "The weights in view can't produce a valid gain."),
  EVIDENCE_CONFLICT: ds("GAIN", "EVIDENCE_CONFLICT", "Weights disagree", "conflict", "A weight in this period conflicts with another; gain isn't calculated."),
  UNSUPPORTED: ds("GAIN", "UNSUPPORTED", "Weight unit not supported", "review"),
} as const satisfies Table<DerivationState>;

/** C5 — the comparison against an explicit target (NO_TARGET is its own state, never on track). */
export const TARGET_DISPLAY = {
  NO_TARGET: ds("TARGET", "NO_TARGET", "No target set", "unknown", "There's no growth target for this animal, so we can't say whether it's on track."),
  ON_TRACK: ds("TARGET", "ON_TRACK", "On track", "good"),
  AHEAD: ds("TARGET", "AHEAD", "Ahead of target", "good"),
  BEHIND: ds("TARGET", "BEHIND", "Behind target", "attention"),
  TARGET_NOT_APPLICABLE: ds("TARGET", "TARGET_NOT_APPLICABLE", "Target doesn't apply", "neutral", "The recorded target doesn't apply to this animal."),
  TARGET_UNVERIFIED: ds("TARGET", "TARGET_UNVERIFIED", "Target not reviewed", "review", "The target hasn't been reviewed for production use."),
  INSUFFICIENT_EVIDENCE: ds("TARGET", "INSUFFICIENT_EVIDENCE", "Not enough weights", "unknown", "We need more weights before comparing with the target."),
  EVIDENCE_CONFLICT: ds("TARGET", "EVIDENCE_CONFLICT", "Evidence conflict", "conflict", "Conflicting records stop the comparison."),
  INVALID: ds("TARGET", "INVALID", "Can't compare", "review"),
} as const satisfies Table<TargetComparisonState | "NO_TARGET">;

/** C5 — trend under an explicit TREND policy. */
export const TREND_DISPLAY = {
  RISING: ds("TREND", "RISING", "Gaining", "neutral"),
  FALLING: ds("TREND", "FALLING", "Losing weight", "risk"),
  FLAT: ds("TREND", "FLAT", "Holding steady", "attention"),
  NO_POLICY: ds("TREND", "NO_POLICY", "No trend rule", "unknown"),
  EVIDENCE_CONFLICT: ds("TREND", "EVIDENCE_CONFLICT", "Evidence conflict", "conflict"),
  INSUFFICIENT_EVIDENCE: ds("TREND", "INSUFFICIENT_EVIDENCE", "Not enough weights", "unknown"),
  INVALID: ds("TREND", "INVALID", "Can't tell", "review"),
  UNSUPPORTED: ds("TREND", "UNSUPPORTED", "Unit not supported", "review"),
} as const satisfies Table<TrendState>;

/**
 * A frozen evaluation that produced no output (C4 weights or C5 performance returned null because an
 * input record couldn't be read). Not a state of any frozen vocabulary: it says the value is unknown
 * because the calculation didn't run — never "none", never zero.
 */
export const EVALUATION_UNAVAILABLE: DisplayState = {
  code: "EVALUATION:UNAVAILABLE",
  label: "Couldn't be read",
  tone: "unknown",
  detail: "A record couldn't be read, so this wasn't worked out. It's unknown — not missing and not zero.",
};

/**
 * The other "couldn't be worked out" states, one per C10 surface that aggregates an owner output.
 * Like `EVALUATION_UNAVAILABLE` they are not states of any frozen vocabulary; each says the value
 * is unknown because its evaluation produced nothing — never an empty group, no work or no cost.
 */
export const UNAVAILABLE_DISPLAY = {
  EVALUATION: EVALUATION_UNAVAILABLE,
  GROUP_SCOPE: ds("SCOPE", "UNAVAILABLE", "Membership couldn't be checked", "unknown", "The group's membership couldn't be worked out, so which animals are in it — and how many — is unknown, not zero."),
  PLANNING: ds("PLANNING", "UNAVAILABLE", "Work couldn't be checked", "unknown", "The planning run stopped rather than guess, so jobs are unknown — that doesn't mean nothing needs doing."),
  COSTS: ds("COST", "UNAVAILABLE", "Costs couldn't be read", "unknown", "The cost records couldn't be read for this date, so the cost is unknown — not €0 and not \"none recorded\"."),
  WEIGHT_HISTORY: ds("WEIGHT_HISTORY", "UNAVAILABLE", "Weight history couldn't be read", "unknown", "A weight record couldn't be read, so the weights weren't evaluated — the chart isn't drawn until it's fixed."),
  HEALTH: ds("HEALTH", "UNAVAILABLE", "Health records couldn't be read", "unknown", "Health records couldn't be read for this animal, so withdrawal and treatment status are unknown."),
  HEALTH_CONTEXT: ds("HEALTH_CONTEXT", "UNAVAILABLE", "Couldn't be checked", "unknown", "The evaluation didn't run, so their status is unknown."),
  ACTIVITY: ds("ACTIVITY", "UNAVAILABLE", "Activity couldn't be fully read", "unknown", "Some record families couldn't be read, so no activity can be listed as complete."),
} as const;

/**
 * A KNOWN empty work list: the planning run worked and raised nothing open (distinct from PLANNING
 * unavailable). Neutral, never "good": no open job isn't a health or performance check.
 */
export const NO_OPEN_WORK: DisplayState = ds("WORK", "NONE_OPEN", "Nothing currently needs attention", "neutral", "Nothing in the records raises work right now. That isn't a health or performance check.");

/**
 * Known-empty collections, each in its own words (the owner evaluated and found none). The
 * component never writes these: it renders the EMPTY state's display (`view-state.ts`).
 */
export const EMPTY_DISPLAY = {
  WEIGHTS: ds("EMPTY", "WEIGHTS", "No weights recorded yet", "unknown", "Nothing to chart until a weight is recorded."),
  ANIMAL_WORK: ds("EMPTY", "ANIMAL_WORK", "No open jobs for this animal", "neutral", "Nothing in the records raises work right now. That isn't a health or performance check."),
  PROGRAMMES: ds("EMPTY", "PROGRAMMES", "Not in any declared veterinary programme", "neutral"),
  OBLIGATIONS: ds("EMPTY", "OBLIGATIONS", "No recorded requirement applies", "neutral"),
  MEDICINES: ds("EMPTY", "MEDICINES", "No medicines recorded", "neutral"),
  ACTIVITY: ds("EMPTY", "ACTIVITY", "No dated records for this animal yet", "unknown"),
  HERD_ANIMALS: ds("EMPTY", "HERD_ANIMALS", "No animals recorded", "unknown", "There are no animals in this herd yet. Nothing is shown as on track, and no work is raised, until animals are recorded."),
  HERD_GROUPS: ds("EMPTY", "HERD_GROUPS", "No groups set up", "unknown", "Animals are recorded, but no management group is set up to list them by."),
  GROUP_ANIMALS: ds("EMPTY", "GROUP_ANIMALS", "No animals are recorded in this group", "unknown"),
  GAIN_INTERVAL: ds("EMPTY", "GAIN_INTERVAL", "No interval worked out yet", "unknown"),
} as const;

/** C4 — how a KNOWN weight was obtained (its measurement basis, from the C4 series entry). Never "Weighed" unless MEASURED. */
export const WEIGHT_BASIS_DISPLAY = {
  MEASURED: ds("WEIGHT_BASIS", "MEASURED", "Weighed", "neutral"),
  ESTIMATED: ds("WEIGHT_BASIS", "ESTIMATED", "Estimated weight", "info", "An estimate (not a scale reading)."),
  DERIVED: ds("WEIGHT_BASIS", "DERIVED", "External figure", "info", "A figure from an outside source, not weighed here."),
  UNKNOWN: ds("WEIGHT_BASIS", "UNKNOWN", "Method not recorded", "review", "How this weight was taken isn't recorded."),
} as const satisfies Table<WeightMeasurementBasis>;

/** Records exist but none can be charted (never "no weights"). */
export const NOT_CHARTABLE_DISPLAY = {
  UNSUPPORTED: ds("CHART", "NOT_CHARTABLE_UNSUPPORTED", "Weight history can't be charted yet", "review", "One or more records use a weight unit Farm Return can't currently convert to kilograms."),
  EXCLUDED: ds("CHART", "NOT_CHARTABLE_EXCLUDED", "Weight history can't be charted yet", "review", "The recorded weights can't be used, so there's nothing to plot — the records are still listed."),
} as const;

/** Every unavailable display code (the C10 invariant's tests assert these, never a known-empty state). */
export const UNAVAILABLE_CODES: readonly string[] = Object.values(UNAVAILABLE_DISPLAY).map((d) => d.code);

/** C5 — the labelled weight PREDICTION (NOT_REQUESTED: C10 asked for none — no future date to project to). */
export const PREDICTION_DISPLAY = {
  PROJECTED: ds("PREDICTION", "PROJECTED", "Projected", "info", "A straight-line projection of recent daily gain — a prediction, not a weighing."),
  NOT_PROJECTED: ds("PREDICTION", "NOT_PROJECTED", "No projection", "unknown", "Recent daily gain isn't known, so there's no projection."),
  NOT_REQUESTED: ds("PREDICTION", "NOT_REQUESTED", "No date to project to", "neutral", "Set a sale or target date to see a projection."),
  // C10 admission (`admitProjectedWeight`): C5 projected, but not a weight an animal can have.
  NOT_USABLE: ds("PREDICTION", "NOT_USABLE", "No usable projection", "review", "Continuing the recent daily gain gives a weight of zero or less, which can't be right, so no projected weight is shown."),
  // C6 has several goals in force: none is chosen, so there is no single goal date to project to.
  SEVERAL_GOALS: ds("PREDICTION", "SEVERAL_GOALS", "No single goal date to project to", "neutral", "Several goals are in force, each with its own date. The animal plan projects to the sale date you choose."),
} as const satisfies Table<"PROJECTED" | "NOT_PROJECTED" | "NOT_REQUESTED" | "NOT_USABLE" | "SEVERAL_GOALS">;

/** Farmer sentences for C8 / C9 reason-code prefixes (the full code stays in the technical detail). */
export const REASON_COPY: readonly { prefix: string; text: (arg: string | null) => string }[] = [
  { prefix: "CATTLE_RECOMMENDATION_TRIGGER_WEIGHT_STALE", text: (at) => `The latest weight${at ? ` (${at.slice(8, 10).replace(/^0/, "")} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(at.slice(5, 7)) - 1]})` : ""} is older than the staleness setting.` },
  { prefix: "CATTLE_RECOMMENDATION_TRIGGER_WEIGHT_MISSING", text: () => "No weight is recorded for this animal." },
  { prefix: "CATTLE_RECOMMENDATION_TRIGGER_GOAL_STATUS", text: () => "No production goal is declared." },
  { prefix: "CATTLE_RECOMMENDATION_TRIGGER_WITHDRAWAL_STATE", text: () => "The withdrawal status for a food product is unknown." },
  { prefix: "CATTLE_RECOMMENDATION_TRIGGER_OBLIGATION_STATE", text: () => "A requirement has no recorded proof." },
  { prefix: "CATTLE_RECOMMENDATION_TRIGGER_PROGRAMME_ACTION_STATE", text: () => "A programme treatment is in or past its recommended window." },
];

/** Farmer sentences for C8 limitation codes; anything not listed stays in the technical detail. */
export const LIMITATION_COPY: Readonly<Record<string, string>> = {
  CATTLE_RECOMMENDATION_DATA_GAP_ACTION_CLAIMS_NO_BENEFIT: "This fills a gap in your records; it doesn't claim a financial or performance benefit.",
  CATTLE_RECOMMENDATION_ACTION_PRIORITY_TIERS_REGISTRY_DECLARED_UNREVIEWED: "Its priority comes from the action list and hasn't been independently reviewed.",
  CATTLE_RECOMMENDATION_NO_EFFECT_MAGNITUDE_OR_PROBABILITY: "No size or likelihood of effect is estimated.",
};

export function reasonSentence(code: string): string | null {
  const [prefix, ...rest] = code.split(":");
  const hit = REASON_COPY.find((r) => prefix.startsWith(r.prefix));
  return hit ? hit.text(rest.length > 0 ? rest.join(":") : null) : null;
}

/** C6 — production goal status. */
export const GOAL_DISPLAY = {
  ACTIVE: ds("GOAL", "ACTIVE", "Goal set", "neutral"),
  NONE: ds("GOAL", "NONE", "No goal set", "unknown", "No production goal is declared for this animal."),
  INTENT_CONFLICT: ds("GOAL", "INTENT_CONFLICT", "Goals conflict", "conflict", "Two declared goals can't both apply; neither is chosen."),
  INVALID: ds("GOAL", "INVALID", "Goal record can't be read", "review"),
} as const satisfies Table<GoalProjectionStatus>;

/** C3 — the withdrawal gate for a food product. UNKNOWN never looks clear. */
export const WITHDRAWAL_DISPLAY = {
  CLEAR: ds("WITHDRAWAL", "CLEAR", "No withdrawal in force", "good", "No recorded medicine has a withdrawal running."),
  IN_WITHDRAWAL: ds("WITHDRAWAL", "IN_WITHDRAWAL", "In withdrawal", "risk"),
  UNKNOWN: ds("WITHDRAWAL", "UNKNOWN", "Withdrawal unknown", "unknown", "A medicine was recorded without enough product information to know the withdrawal."),
  EVIDENCE_CONFLICT: ds("WITHDRAWAL", "EVIDENCE_CONFLICT", "Medicine records disagree", "conflict"),
} as const satisfies Table<WithdrawalGateState>;

/** C3 — one administration's withdrawal end (not the gate). */
export const ADMINISTRATION_WITHDRAWAL_DISPLAY = {
  KNOWN: ds("ADMIN_WITHDRAWAL", "KNOWN", "Withdrawal end known", "neutral"),
  UNKNOWN: ds("ADMIN_WITHDRAWAL", "UNKNOWN", "Withdrawal end unknown", "unknown"),
  EVIDENCE_CONFLICT: ds("ADMIN_WITHDRAWAL", "EVIDENCE_CONFLICT", "Records disagree", "conflict"),
} as const satisfies Table<AdministrationWithdrawalState>;

/** C7 — a programme occurrence (windows are recommended, never legal deadlines). */
export const PROGRAMME_DISPLAY = {
  NOT_APPLICABLE: ds("PROGRAMME", "NOT_APPLICABLE", "Not in programme", "neutral"),
  UPCOMING: ds("PROGRAMME", "UPCOMING", "Coming up", "info"),
  DUE: ds("PROGRAMME", "DUE", "In its recommended window", "attention"),
  COMPLETED: ds("PROGRAMME", "COMPLETED", "Done", "good"),
  OVERDUE: ds("PROGRAMME", "OVERDUE", "Past its window", "risk"),
  BLOCKED: ds("PROGRAMME", "BLOCKED", "Blocked", "risk", "A required check failed, so this can't go ahead yet."),
  UNKNOWN: ds("PROGRAMME", "UNKNOWN", "Status unknown", "unknown"),
  INSUFFICIENT_EVIDENCE: ds("PROGRAMME", "INSUFFICIENT_EVIDENCE", "Needs information", "unknown"),
  EVIDENCE_CONFLICT: ds("PROGRAMME", "EVIDENCE_CONFLICT", "Records disagree", "conflict"),
  REVIEW_REQUIRED: ds("PROGRAMME", "REVIEW_REQUIRED", "Needs review", "review"),
  INVALID_EVIDENCE: ds("PROGRAMME", "INVALID_EVIDENCE", "Record can't be read", "review"),
} as const satisfies Table<ProgrammeOccurrenceState>;

/** C2 — an obligation occurrence (a legal deadline only where C9 sources one). */
export const OBLIGATION_DISPLAY = {
  NOT_APPLICABLE: ds("OBLIGATION", "NOT_APPLICABLE", "Doesn't apply", "neutral"),
  NOT_TRIGGERED: ds("OBLIGATION", "NOT_TRIGGERED", "Not triggered", "neutral"),
  UPCOMING: ds("OBLIGATION", "UPCOMING", "Coming up", "info"),
  OUTSTANDING: ds("OBLIGATION", "OUTSTANDING", "Outstanding", "attention"),
  SATISFIED: ds("OBLIGATION", "SATISFIED", "Done", "good"),
  SATISFIED_LATE: ds("OBLIGATION", "SATISFIED_LATE", "Done late", "attention"),
  OVERDUE: ds("OBLIGATION", "OVERDUE", "Overdue", "risk"),
  BLOCKED: ds("OBLIGATION", "BLOCKED", "Blocked", "risk"),
  ADVISORY_FAIL: ds("OBLIGATION", "ADVISORY_FAIL", "Advisory check failed", "attention"),
  UNKNOWN: ds("OBLIGATION", "UNKNOWN", "Status unknown", "unknown"),
  INSUFFICIENT_EVIDENCE: ds("OBLIGATION", "INSUFFICIENT_EVIDENCE", "Needs information", "unknown"),
  EVIDENCE_CONFLICT: ds("OBLIGATION", "EVIDENCE_CONFLICT", "Records disagree", "conflict"),
  INVALID_EVIDENCE: ds("OBLIGATION", "INVALID_EVIDENCE", "Record can't be read", "review"),
  UNSUPPORTED: ds("OBLIGATION", "UNSUPPORTED", "Not supported yet", "review"),
  REVIEW_REQUIRED: ds("OBLIGATION", "REVIEW_REQUIRED", "Needs review", "review"),
} as const satisfies Table<ObligationState>;

/** C8 — the recommendation outcome. NO_RECOMMENDATION never reads as "all good". */
export const RECOMMENDATION_DISPLAY = {
  ACTIONABLE: ds("RECOMMENDATION", "ACTIONABLE", "Suggested", "info"),
  NO_RECOMMENDATION: ds("RECOMMENDATION", "NO_RECOMMENDATION", "Nothing suggested", "neutral", "Nothing in the records suggests an action. That isn't a health or performance check."),
  INSUFFICIENT_EVIDENCE: ds("RECOMMENDATION", "INSUFFICIENT_EVIDENCE", "Needs information first", "unknown"),
  BLOCKED: ds("RECOMMENDATION", "BLOCKED", "Blocked", "risk"),
  REVIEW_REQUIRED: ds("RECOMMENDATION", "REVIEW_REQUIRED", "Needs review", "review"),
} as const satisfies Table<RecommendationOutcome>;

/** Plan — a shared blocker. */
export const BLOCKER_DISPLAY = {
  ACTIVE: ds("BLOCKER", "ACTIVE", "Blocked", "risk"),
  UNKNOWN: ds("BLOCKER", "UNKNOWN", "Waiting on information", "unknown"),
  CLEARED: ds("BLOCKER", "CLEARED", "Cleared", "neutral"),
} as const satisfies Table<PlanBlockerStatus>;

/** Plan — job status. */
export const JOB_STATUS_DISPLAY = {
  PROPOSED: ds("JOB", "PROPOSED", "To do", "info"),
  PLANNED: ds("JOB", "PLANNED", "Planned", "info"),
  IN_PROGRESS: ds("JOB", "IN_PROGRESS", "In progress", "info"),
  COMPLETED: ds("JOB", "COMPLETED", "Done", "good"),
  OBSOLETE: ds("JOB", "OBSOLETE", "No longer needed", "neutral"),
  CANCELLED: ds("JOB", "CANCELLED", "Cancelled", "neutral"),
} as const satisfies Table<PlanJobStatus>;

/** Plan — derived readiness. */
export const READINESS_DISPLAY = {
  CLOSED: ds("READINESS", "CLOSED", "Closed", "neutral"),
  WAITING_FOR_DEPENDENCY: ds("READINESS", "WAITING_FOR_DEPENDENCY", "Waiting on other work", "info"),
  WAITING_FOR_LEGAL_WINDOW: ds("READINESS", "WAITING_FOR_LEGAL_WINDOW", "Waiting on a hard check", "risk"),
  WAITING_FOR_WEATHER: ds("READINESS", "WAITING_FOR_WEATHER", "Waiting on weather", "info"),
  WAITING_FOR_INPUT: ds("READINESS", "WAITING_FOR_INPUT", "Waiting on inputs", "info"),
  WAITING_FOR_BLOCKER: ds("READINESS", "WAITING_FOR_BLOCKER", "Waiting on information", "unknown"),
  UPCOMING: ds("READINESS", "UPCOMING", "Not yet — window opens later", "info"),
  NEEDS_ATTENTION: ds("READINESS", "NEEDS_ATTENTION", "Needs attention", "risk"),
  READY: ds("READINESS", "READY", "Ready to do", "info"),
} as const satisfies Table<ReadinessState>;

/** Plan — canonical completion. */
export const COMPLETION_DISPLAY = {
  COMPLETE: ds("COMPLETION", "COMPLETE", "Completed by your records", "good"),
  PARTIAL: ds("COMPLETION", "PARTIAL", "Partly done", "info"),
  NOT_STARTED: ds("COMPLETION", "NOT_STARTED", "Not done yet", "neutral"),
  UNKNOWN: ds("COMPLETION", "UNKNOWN", "Can't tell yet", "unknown"),
  NO_TARGETS: ds("COMPLETION", "NO_TARGETS", "No animals in scope", "neutral"),
  NOT_EVIDENCE_LINKED: ds("COMPLETION", "NOT_EVIDENCE_LINKED", "Mark done when finished", "neutral", "No record proves this one; you mark it done yourself."),
} as const satisfies Table<CompletionState>;

/** Plan — system priority tier (the Plan kernel's order, not a C10 ranking). */
export const PRIORITY_DISPLAY = {
  HARD_OBLIGATION: ds("PRIORITY", "HARD_OBLIGATION", "Required", "risk"),
  AVOID_MATERIAL_LOSS: ds("PRIORITY", "AVOID_MATERIAL_LOSS", "Avoid a loss", "attention"),
  EXPECTED_NET_RETURN: ds("PRIORITY", "EXPECTED_NET_RETURN", "Worth doing", "info"),
  INFORMATION_VALUE: ds("PRIORITY", "INFORMATION_VALUE", "Fills a gap in your records", "info"),
  ROUTINE_MANAGEMENT: ds("PRIORITY", "ROUTINE_MANAGEMENT", "Routine", "neutral"),
} as const satisfies Table<SystemPriorityTier>;

/** Farmer copy for the C8 action kinds C9 consumes (C9 returns machine titles only). */
export const ACTION_COPY: Readonly<Record<string, { title: string; short: string; why: string }>> = {
  RECORD_WEIGHT: { title: "Record weight", short: "Weigh", why: "The latest weight is missing or out of date, so growth and value can't be kept current." },
  DECLARE_PRODUCTION_GOAL: { title: "Set a production goal", short: "Set goal", why: "Without a goal there's no sale date or target weight to plan towards." },
  REVIEW_WITHDRAWAL_STATUS: { title: "Check withdrawal status", short: "Check withdrawal", why: "A medicine was recorded without enough product detail to know when the withdrawal ends." },
  RESOLVE_OBLIGATION_EVIDENCE: { title: "Record proof of a requirement", short: "Record proof", why: "A requirement for this animal has no recorded proof of completion." },
  COMPLETE_PROGRAMME_ACTION: { title: "Complete programme treatment", short: "Programme", why: "A treatment in the declared veterinary programme is due." },
};

export function displayOf<S extends string>(table: Readonly<Record<S, DisplayState>>, state: string, family: string): DisplayState {
  return Object.hasOwn(table, state) ? table[state as S] : ds(family, state, "Unrecognised state", "review", "This state isn't known to this screen; it is shown, not hidden.");
}
