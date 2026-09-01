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
  // Date.UTC(year, month, 0) is "day 0 of the given (0-indexed) month" —
  // i.e. the real last day of the *previous* 0-indexed month, which is
  // exactly the (1-indexed) `month` this function received. This
  // correctly accounts for leap years via JS's own real calendar
  // arithmetic, not a hand-maintained days-per-month table.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;
  return true;
}
