/**
 * Confirm stage — `MASTER_SPEC.md`: "The farmer marks the job done,
 * ideally from GPS job mode while still on the field." Typed interfaces
 * only in this checkpoint — real GPS job mode UI is Vertical C
 * (`BUILD_PLAN.md`), gated on this checkpoint's `jobs` table and Vertical
 * A's offline queue existing first.
 */

export type ConfirmMethod = "gps_job_mode" | "manual";

export interface Confirmation {
  id: string;
  jobId: string;
  farmId: string;
  method: ConfirmMethod;
  /** ISO datetime. */
  confirmedAt: string;
  /** What actually happened, where it differs from the Act-stage record —
   * the loop's "Actual" (`MASTER_SPEC.md`'s loop table), e.g. an actual
   * spread rate differing from the planned one. Never a second Estimate —
   * a farmer-observed fact only. */
  actual?: Record<string, unknown>;
}
