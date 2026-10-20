/**
 * Cattle C10 — calendar-date helpers for the animal forward plan. Dates are
 * date-only `YYYY-MM-DD` values (no time zone, no clock): arithmetic is on
 * whole UTC calendar days, so a date never shifts with the viewer's zone.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** True for a real calendar date in `YYYY-MM-DD` form. */
export function isPlanDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function dayNumber(date: string): number {
  const m = DATE_RE.exec(date)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). Both must be valid plan dates. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** `date` plus `days` whole calendar days. */
export function addDays(date: string, days: number): string {
  const t = new Date((dayNumber(date) + days) * DAY_MS);
  return `${t.getUTCFullYear().toString().padStart(4, "0")}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

export function comparePlanDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The UTC calendar date of a strict UTC instant string (`2026-10-16T09:00:00Z` → `2026-10-16`). */
export function utcDateOfInstant(instant: string): string | null {
  const date = instant.slice(0, 10);
  return isPlanDate(date) && instant[10] === "T" ? date : null;
}
