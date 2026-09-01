/**
 * Farm Return Next Checkpoint 2, Vertical H — a strict ISO-8601 UTC
 * datetime validator. Extracted as its own tiny, shared module (Codex
 * audit HIGH, `docs/farm-return-next/audit-logs/20260901T154550Z.md`,
 * round 3 against `satellite-field-coverage.ts`) because `new Date(value)`
 * alone is not a real validity check: JS's `Date` parser is deliberately
 * lenient and silently "fixes up" genuinely malformed input rather than
 * rejecting it — `new Date("2026-02-30")` (30 February doesn't exist)
 * quietly normalises to `2026-03-02`, `new Date("2026-01-01T25:00:00Z")`
 * (hour 25 doesn't exist) rolls into the next day, and
 * `new Date("2026-01-01junk")` parses the leading valid-looking portion
 * and ignores the trailing garbage entirely — none of these raise, so a
 * bare `Number.isNaN(new Date(value).getTime())` check (this codebase's
 * own first attempt, both here and in `cdse-stac-client.ts`'s STAC
 * feature parsing) never catches them, silently shifting whatever
 * date-window logic depends on the value being what it claims to be.
 *
 * This app's own established convention for every real ISO timestamp
 * (`Decision.decidedAt`, `Prompt.createdAt`, CDSE's own real STAC
 * `datetime` field, ...) is UTC, `Z`-suffixed — this validator requires
 * exactly that shape, not a general ISO-8601 parser accepting every
 * legal offset/precision variant.
 */

const ISO_UTC_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

/** Real Gregorian leap-year rule: divisible by 4, except centuries not
 * divisible by 400 (so 2000 is a leap year, 1900 is not). */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Real days-per-month, February adjusted for `isLeapYear` — `month` is
 * 1-indexed (1 = January). Codex audit HIGH, `docs/farm-return-next/
 * audit-logs/20260901T155638Z.md`, round 4: the first version of this
 * validator computed this via `new Date(Date.UTC(year, month,
 * 0)).getUTCDate()`, which is wrong specifically for two-digit years —
 * `Date.UTC` (and the `new Date(year, ...)` constructor it mirrors)
 * treats any year `0`-`99` as `1900`-`1999`, a real, documented JS
 * quirk existing for legacy two-digit-year compatibility, so
 * `Date.UTC(0, 2, 0)` computed February **1900**'s real day count, not
 * year **0000**'s (a leap year, being divisible by 400) — silently
 * rejecting the otherwise-valid `"0000-02-29T00:00:00Z"`. Fixed with
 * plain Gregorian arithmetic instead, which has no such year-range
 * quirk to trip over. */
const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return DAYS_PER_MONTH[month - 1];
}

/**
 * `true` only for a real, calendar-valid UTC ISO datetime string in this
 * app's own `YYYY-MM-DDTHH:MM:SS[.sss]Z` convention — every component is
 * range-checked explicitly (month 1-12, day valid for that month/year
 * including leap years, hour 0-23, minute/second 0-59), not inferred
 * from whether `new Date(...)` merely avoided throwing.
 */
export function isValidIsoUtcDateTime(value: string): boolean {
  const match = ISO_UTC_DATETIME_PATTERN.exec(value);
  if (!match) return false;
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);
  if (month < 1 || month > 12) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}
