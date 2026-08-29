/**
 * Learn stage — `SCIENTIFIC_RULES.md`'s Learn boundary: compares an
 * Estimate to its later Actual and produces a confidence calibration,
 * scoped to one farm, surfaced as a separate labelled figure alongside a
 * future Estimate of the same type — never blended into the Estimate
 * itself, never changing a scientific/regulatory constant.
 *
 * Typed interfaces only in this checkpoint — there is deliberately no
 * `estimate_calibration` table yet either. A draft one was written and
 * audited across five rounds
 * (`docs/farm-return-next/audit-logs/20260829T003659Z.md` through
 * `20260829T005601Z.md`); every round found a real gap, and the last one
 * settled why: real calibration provenance needs to reference confirmed
 * Actuals, not just Decisions, and Actuals aren't a queryable concept
 * anywhere in this schema yet. Removed rather than guessed at — see
 * `docs/farm-return-next/BLOCKERS.md`. Vertical F (`BUILD_PLAN.md`)
 * designs and migrates the real table once Vertical D's real Actuals
 * exist to design it against, not before.
 */

export interface EstimateCalibration {
  id: string;
  farmId: string;
  /** Matches whatever `kind` the Prompt/Estimate used to produce the
   * Estimate this calibration is computed over — same "reviewed starter
   * registry, not a closed enum" shape as `Prompt.kind`. */
  calculationKind: string;
  /** e.g. `0.08` for "this farm's estimates of this type have run ~8%
   * high" — a separate, labelled figure. Never read by an Estimate
   * function as a substitute input (`SCIENTIFIC_RULES.md`). */
  biasRatio: number;
  sampleSize: number;
  computedFromDecisionIds: string[];
  /** ISO datetime. */
  computedAt: string;
}
