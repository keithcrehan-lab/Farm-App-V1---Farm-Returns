/**
 * Prompt stage — `SCIENTIFIC_RULES.md`'s Prompt-stage boundary: "A Prompt
 * is a presentation of an Estimate the domain layer already computed — it
 * must never contain a number the Estimate stage didn't produce." Where
 * the underlying Estimate is blocked (`DOMAIN_CONTRACTS.md`'s
 * `EngineOutcome<T>` fail-closed pattern), the Prompt says so honestly
 * rather than falling back to a plausible-sounding suggestion.
 *
 * `basis` is typed as `EngineOutcome<unknown>` deliberately — this module
 * is generic over whatever `src/domain/*.ts` Estimate function produced it
 * (`nutrients.ts`'s `NutrientPlan`, `spreading.ts`'s `SpreadingFieldScore`,
 * ...); it must never itself recompute a figure the caller's Estimate
 * already produced or blocked.
 */
import type { EngineOutcome } from "@/domain/evidence";
import type { RegulatoryStatus } from "@/domain/types";

export interface Prompt extends RegulatoryStatus {
  id: string;
  farmId: string;
  /** e.g. "spreading_window", "soil_test_age" — free-form today, the same
   * "reviewed starter registry, not a closed enum" shape `evidence.ts`'s
   * `ReasonCode` uses, until enough real Prompt kinds exist to warrant a
   * closed union. */
  kind: string;
  title: string;
  description: string;
  /** The Estimate this Prompt presents — `status: "OK"` or one of the
   * fail-closed arms. A Prompt built from a non-OK Estimate must say so in
   * `description` (see `describeBlockedBasis` below) rather than presenting
   * a plausible-sounding suggestion. */
  basis: EngineOutcome<unknown>;
  /** ISO datetime. */
  createdAt: string;
}

/**
 * Turns a blocked/ambiguous/not-applicable/prohibited/unknown Estimate
 * outcome into honest Prompt copy — the only sanctioned way to describe a
 * non-OK `EngineOutcome` in a Prompt, so a caller can't hand-write a
 * softer-sounding message that hides the real reason
 * (`SCIENTIFIC_RULES.md`'s "never falls back to a plausible-sounding
 * suggestion" rule).
 */
export function describeBlockedBasis(basis: Exclude<EngineOutcome<unknown>, { status: "OK" }>): string {
  switch (basis.status) {
    case "BLOCKED_INSUFFICIENT_EVIDENCE":
      return `Not enough evidence yet (${basis.reasonCode}) — missing: ${basis.missingInputs.join(", ")}.`;
    case "AMBIGUOUS":
      return `Unresolved: ${basis.detail}`;
    case "NOT_APPLICABLE":
      return `Not applicable here (${basis.reasonCode}).`;
    case "LEGAL_PROHIBITION":
      return `Not permitted: ${basis.consequence}`;
    case "UNKNOWN":
      return `Status unknown (${basis.reasonCode}).`;
  }
}
