/**
 * Cattle C5 — the elapsed-time and day convention for performance
 * derivations (NUMERIC_SEMANTICS.md, "Day convention").
 *
 * Convention `UTC_EXACT_ELAPSED_SECONDS_PER_86400` (version 1):
 * 1. Both instants are strict UTC instants (C1 `isValidAnimalInstant`);
 *    their C1 `animalInstantKey` (nine fractional digits) is split into
 *    whole UTC seconds and nanoseconds. Whole seconds come from the
 *    ECMAScript-specified `Date.parse` of the already strictly validated
 *    `YYYY-MM-DDTHH:MM:SSZ` prefix (pure parsing of an explicit UTC string —
 *    no clock, no local time, no lenient repair, since the input was
 *    validated first). UTC has no daylight-saving shifts and leap seconds are
 *    not representable in the C1 instant syntax.
 * 2. The exact elapsed time is the integer pair (`seconds`, `nanoseconds`)
 *    with the same sign (or zero), |nanoseconds| < 10^9. It is carried in
 *    every calculation trace unrounded.
 * 3. Elapsed days = (seconds + nanoseconds / 10^9) / 86 400, evaluated in
 *    IEEE-754 binary64 in exactly that order. For whole-second instants
 *    (`nanoseconds` = 0) this is one correctly rounded division of an exact
 *    integer. No calendar-day counting, no rounding to whole days, no epsilon.
 *
 * Presentation rounding is never applied here (CAT-INV-019).
 */

import { animalInstantKey, isValidAnimalInstant } from "../animal-ledger";

export const PERFORMANCE_DAY_CONVENTION = "UTC_EXACT_ELAPSED_SECONDS_PER_86400" as const;
export const PERFORMANCE_DAY_CONVENTION_VERSION = 1;

const SECONDS_PER_DAY = 86_400;
const NANOS_PER_SECOND = 1_000_000_000;

/** Exact signed elapsed time; `seconds` and `nanoseconds` never have opposite signs. */
export interface ExactElapsed {
  seconds: number;
  nanoseconds: number;
}

function splitInstant(instant: string): { seconds: number; nanos: number } | null {
  if (!isValidAnimalInstant(instant)) return null;
  const key = animalInstantKey(instant); // YYYY-MM-DDTHH:MM:SS.nnnnnnnnn
  const ms = Date.parse(`${key.slice(0, 19)}Z`);
  if (!Number.isSafeInteger(ms)) return null;
  return { seconds: ms / 1000, nanos: Number(key.slice(20)) };
}

/** `to − from` exactly; `null` when either instant is not a strict UTC instant. */
export function exactElapsed(from: string, to: string): ExactElapsed | null {
  const a = splitInstant(from);
  const b = splitInstant(to);
  if (a === null || b === null) return null;
  let seconds = b.seconds - a.seconds;
  let nanoseconds = b.nanos - a.nanos;
  if (seconds > 0 && nanoseconds < 0) {
    seconds -= 1;
    nanoseconds += NANOS_PER_SECOND;
  } else if (seconds < 0 && nanoseconds > 0) {
    seconds += 1;
    nanoseconds -= NANOS_PER_SECOND;
  }
  return { seconds, nanoseconds: nanoseconds === 0 ? 0 : nanoseconds };
}

/** Elapsed days under the convention above (binary64, unrounded). */
export function elapsedDaysOf(elapsed: ExactElapsed): number {
  return (elapsed.seconds + elapsed.nanoseconds / NANOS_PER_SECOND) / SECONDS_PER_DAY;
}

/** True when the elapsed time is strictly positive. */
export function isPositiveElapsed(elapsed: ExactElapsed): boolean {
  return elapsed.seconds > 0 || (elapsed.seconds === 0 && elapsed.nanoseconds > 0);
}
