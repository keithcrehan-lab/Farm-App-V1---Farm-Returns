/**
 * Cattle C7 — occurrence states and their precedence (DOMAIN_CONTRACTS
 * "Cattle C7", State precedence).
 *
 * Evidence outcomes always come first: any unresolved candidate, competing
 * correction or timing disagreement folds in `PROGRAMME_STATUS_PRECEDENCE`
 * before a business state (COMPLETED, UPCOMING, BLOCKED, DUE, OVERDUE) is
 * even considered, so unresolved required evidence can never surface as a
 * resolved-looking state (CAT-INV-009/022). Folding an empty set is never a
 * resolved state: it fails closed (INVALID_EVIDENCE).
 */

import { sortedUnique } from "../integrity";
import type { UnresolvedOutcome } from "./programme-evidence";
import type { WindowPosition } from "./programme-schedule";
import type { ProgrammeCompletionSummary, ProgrammeGateCheck, ProgrammeMembershipState } from "./programme-types";

export const PROGRAMME_OCCURRENCE_STATES = [
  "NOT_APPLICABLE",
  "UPCOMING",
  "DUE",
  "COMPLETED",
  "OVERDUE",
  "BLOCKED",
  "UNKNOWN",
  "INSUFFICIENT_EVIDENCE",
  "EVIDENCE_CONFLICT",
  "REVIEW_REQUIRED",
  "INVALID_EVIDENCE",
] as const;
export type ProgrammeOccurrenceState = (typeof PROGRAMME_OCCURRENCE_STATES)[number];

/** Fold order for occurrence evidence outcomes and animal / group / programme status (first present wins). */
export const PROGRAMME_STATUS_PRECEDENCE: readonly ProgrammeOccurrenceState[] = Object.freeze([
  "REVIEW_REQUIRED",
  "INVALID_EVIDENCE",
  "EVIDENCE_CONFLICT",
  "UNKNOWN",
  "INSUFFICIENT_EVIDENCE",
  "BLOCKED",
  "OVERDUE",
  "DUE",
  "UPCOMING",
  "COMPLETED",
  "NOT_APPLICABLE",
]);

export function foldProgrammeStates(states: readonly ProgrammeOccurrenceState[]): ProgrammeOccurrenceState | null {
  return PROGRAMME_STATUS_PRECEDENCE.find((s) => states.includes(s)) ?? null;
}

/** As `foldProgrammeStates`, but an empty set fails closed instead of resolving. */
export function foldOrInvalid(states: readonly ProgrammeOccurrenceState[]): ProgrammeOccurrenceState {
  return foldProgrammeStates(states) ?? "INVALID_EVIDENCE";
}

/** Every unresolved-evidence outcome is itself an occurrence state (never a resolved one). */
export const outcomeState = (outcome: UnresolvedOutcome): ProgrammeOccurrenceState => outcome;

/** Membership → the occurrence state of a non-member / unresolved membership. */
export function membershipState(state: Exclude<ProgrammeMembershipState, "MEMBER">): ProgrammeOccurrenceState {
  switch (state) {
    case "NOT_MEMBER":
      return "NOT_APPLICABLE";
    case "UNKNOWN":
      return "UNKNOWN";
    case "EVIDENCE_CONFLICT":
      return "EVIDENCE_CONFLICT";
    case "INVALID":
      return "INVALID_EVIDENCE";
  }
}

export interface OccurrenceStateInput {
  completion: ProgrammeCompletionSummary;
  position: WindowPosition;
  gates: readonly ProgrammeGateCheck[];
  /** A VETERINARY_PROGRAMME action with gate role HARD_GATE (rulings B2 / M2). */
  veterinaryHardGate: boolean;
}

/** The state of an occurrence whose window, period and membership are already resolved. */
export function occurrenceState(input: OccurrenceStateInput): { state: ProgrammeOccurrenceState; reasonCodes: string[] } {
  const { completion, position, gates, veterinaryHardGate } = input;
  const result = (state: ProgrammeOccurrenceState, reasons: string[]) => ({ state, reasonCodes: sortedUnique(reasons) });

  // 1. Evidence outcomes (unresolved candidates, competing corrections, timing disagreement).
  const outcomes: ProgrammeOccurrenceState[] = [];
  const reasons: string[] = [];
  for (const u of completion.unresolved) {
    outcomes.push(outcomeState(u.outcome));
    reasons.push(u.reason);
  }
  if (completion.conflictingDeclarationIds.length > 0 || completion.conflictingRecordIds.length > 0) {
    outcomes.push("EVIDENCE_CONFLICT");
    reasons.push("CATTLE_PROGRAMME_COMPLETION_COMPETING_EVIDENCE");
  }
  if (new Set(completion.counted.map((c) => c.timing)).size > 1) {
    outcomes.push("EVIDENCE_CONFLICT");
    reasons.push("CATTLE_PROGRAMME_COMPLETION_TIMING_DISAGREES");
  }
  if (outcomes.length > 0) return result(foldOrInvalid(outcomes), reasons);

  // 2. Counted completions (all required evidence resolved).
  if (completion.counted.length > 0) {
    // Rulings B2 / M2: non-veterinary evidence is retained but never by itself completes a veterinary hard-gate action.
    if (veterinaryHardGate && !completion.counted.some((c) => c.authority === "VETERINARY")) {
      return result("REVIEW_REQUIRED", ["CATTLE_PROGRAMME_COMPLETION_NEEDS_VETERINARY_AUTHORITY"]);
    }
    return result("COMPLETED", [completion.counted.some((c) => c.timing === "LATE") ? "CATTLE_PROGRAMME_COMPLETED_LATE" : "CATTLE_PROGRAMME_COMPLETED_IN_WINDOW"]);
  }
  if (completion.otherVersionDeclarationIds.length > 0) return result("REVIEW_REQUIRED", ["CATTLE_PROGRAMME_COMPLETION_FOR_OTHER_VERSION"]);

  // 3. Business states (no completion; every required input resolved).
  if (position === "BEFORE") return result("UPCOMING", []);
  const blocking = gates.filter((g) => g.blocking);
  if (blocking.length > 0) return result("BLOCKED", blocking.map((g) => `CATTLE_PROGRAMME_GATE_${g.state}:${JSON.stringify(g.ruleId)}`));
  return result(position === "IN" ? "DUE" : "OVERDUE", []);
}
