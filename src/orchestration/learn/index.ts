/**
 * Learn stage — `SCIENTIFIC_RULES.md`'s Learn boundary: compares an
 * Estimate to its later Actual and produces a confidence calibration,
 * scoped to one farm, surfaced as a separate labelled figure alongside a
 * future Estimate of the same type — never blended into the Estimate
 * itself, never changing a scientific/regulatory constant.
 *
 * Typed interfaces only in this checkpoint — `estimate_calibration`'s real
 * reader/writer is Vertical F (`BUILD_PLAN.md`), gated on this
 * checkpoint's migration and Vertical D's real Actuals existing first.
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
