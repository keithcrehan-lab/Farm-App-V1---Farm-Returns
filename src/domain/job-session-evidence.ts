/**
 * Farm Return Next — the Observed / Estimated / Actual evidence-tier
 * vocabulary for a Job Session and its resulting record
 * (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
 * §2/§15).
 *
 * **Deliberately a new, small type — not a reuse of `src/domain/types.ts`'s
 * `DataStatus`/`TrackedValue<T>`.** `DataStatus` ("verified" |
 * "farmer_adjusted" | "estimated" | "mapped" | "unavailable") answers a
 * different question — *how much confidence does Farm Return have in a
 * piece of farm reference data* (a field's soil pH, its mapped area) —
 * from the one this contract's own frozen product decision asks: *which
 * of three sharply distinct sources produced this particular job-session
 * value* (the phone's own sensor; Farm Return's own inference/plan; the
 * farmer's explicit confirmation). Overloading `DataStatus` with a sixth,
 * differently-shaped meaning ("observed") would blur a distinction the
 * product decision explicitly wants kept sharp ("Observed or Estimated
 * values must NEVER silently become Actual") and would touch a widely-used
 * exhaustively-switched-over union across the app for a concept it was
 * never designed to express. `JobEvidenceValue<T>` below intentionally
 * mirrors `TrackedValue<T>`'s *shape* (a value plus source/version
 * metadata plus a never-overwritten `.previous` revision chain) — the
 * reusable idea, not the reused type — because that structural discipline
 * ("never overwrite provenance") is correct here too, just keyed by a
 * different, purpose-built tier enum.
 */

export type JobEvidenceTier = "observed" | "estimated" | "actual";

export interface JobEvidenceValue<T> {
  value: T;
  tier: JobEvidenceTier;
  /** e.g. "Phone GPS", "Farm Return plan", "Farmer confirmed", "Weather station". */
  source: string;
  /** When this specific value was captured/derived/confirmed (ISO datetime) —
   * distinct from the created_at/audit timestamp of whatever row stores it. */
  recordedAt?: string;
  /** The `src/domain/*.ts` module version that derived this value, when it
   * was derived rather than directly observed/confirmed. */
  calculationVersion?: string;
  /** Never overwritten — a later revision (e.g. Confirm Actual editing an
   * already-confirmed value) prepends a new `JobEvidenceValue`, chaining
   * the previous one here rather than replacing it in place. Mirrors
   * `TrackedValue.previous`'s exact discipline
   * (`GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §14, "Actuals must be
   * revision-safe"). */
  previous?: JobEvidenceValue<T>;
}

export function observedValue<T>(
  value: T,
  source: string,
  extra: Partial<Omit<JobEvidenceValue<T>, "value" | "tier" | "source">> = {},
): JobEvidenceValue<T> {
  return { value, tier: "observed", source, ...extra };
}

export function estimatedValue<T>(
  value: T,
  source: string,
  extra: Partial<Omit<JobEvidenceValue<T>, "value" | "tier" | "source">> = {},
): JobEvidenceValue<T> {
  return { value, tier: "estimated", source, ...extra };
}

/**
 * Constructs an `"actual"`-tier value. **The only legitimate way to
 * produce one is by passing an already-`"actual"`-tier `confirmedFrom`
 * value through unchanged, or by supplying a value that did not exist as
 * Observed/Estimated evidence at all (a farmer typing a fresh number Farm
 * Return never estimated).** This function cannot, by its own type
 * signature, accept an `"observed"` or `"estimated"` `JobEvidenceValue`
 * and silently promote it — see this module's own header comment
 * ("Observed or Estimated values must NEVER silently become Actual").
 * Callers that pre-fill a Confirm Actual form from Observed/Estimated
 * evidence must read `.value` off those and pass it here as a *plain*
 * value, an explicit, visible step, not something this function does for
 * them implicitly.
 */
export function actualValue<T>(
  value: T,
  source: string,
  extra: Partial<Omit<JobEvidenceValue<T>, "value" | "tier" | "source">> = {},
): JobEvidenceValue<T> {
  return { value, tier: "actual", source, ...extra };
}

/**
 * Revises an existing `"actual"`-tier value, chaining the prior one into
 * `.previous` rather than discarding it — the one sanctioned way to
 * "edit" a confirmed Actual (`GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §14).
 * Throws if `existing.tier !== "actual"` — revision is a concept that only
 * applies to already-confirmed facts; an Estimated value is simply
 * recomputed, not "revised".
 */
export function reviseActualValue<T>(existing: JobEvidenceValue<T>, newValue: T, source: string): JobEvidenceValue<T> {
  if (existing.tier !== "actual") {
    throw new Error(`reviseActualValue: cannot revise a "${existing.tier}"-tier value — only "actual" values have revision history.`);
  }
  return { value: newValue, tier: "actual", source, recordedAt: undefined, previous: existing };
}

export const JOB_SESSION_EVIDENCE_VERSION = "job_session_evidence_v1.0.0";
