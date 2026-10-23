/**
 * Cattle C10 — display formatting. Display rounding lives ONLY here
 * (CAT-INV-019) and never feeds back into a domain call:
 *
 * - liveweight: whole kilograms (`521 kg`), half away from zero;
 * - daily gain: two decimals (`1.08 kg/day`);
 * - gain over a period: whole kilograms with sign (`+32 kg`);
 * - money: whole euro with grouping (`€1,990`), sign before the symbol
 *   (`−€42`); per-kg money: two decimals (`€3.62/kg`);
 * - dates: the UTC calendar date of the supplied instant, English month
 *   names, no locale or time-zone conversion (`16 Oct`, `16 Oct 2026`);
 * - age: whole calendar months from the date of birth to the viewpoint date.
 *
 * Every formatter takes an already-resolved value; unknown values never reach
 * a formatter (the view-model renders their display state instead).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MINUS = "−";

function roundHalfAway(value: number, digits: number): number {
  const f = 10 ** digits;
  return (Math.sign(value) * Math.round(Math.abs(value) * f)) / f;
}

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatKg(kg: number): string {
  return `${formatKgNumber(kg)} kg`;
}

/** Number part only (for large numerals with a quieter unit). */
export function formatKgNumber(kg: number): string {
  const r = roundHalfAway(kg, 0);
  return `${r < 0 ? MINUS : ""}${group(String(Math.abs(r)))}`;
}

/**
 * A projected weight for display: whole kilograms, except that a positive projection never reads "0 kg"
 * because of rounding — below half a kilogram it is "<1 kg" (display precision, not a biological rule;
 * the canonical value is unchanged and a zero / negative projection never reaches here — `admitProjectedWeight`).
 */
export function formatProjectedKg(kg: number): string {
  return kg > 0 && roundHalfAway(kg, 0) === 0 ? "<1 kg" : formatKg(kg);
}

export function formatSignedKg(kg: number): string {
  const r = roundHalfAway(kg, 0);
  return `${r > 0 ? "+" : r < 0 ? MINUS : ""}${group(String(Math.abs(r)))} kg`;
}

export function formatAdg(kgPerDay: number): string {
  return `${formatAdgNumber(kgPerDay)} kg/day`;
}

export function formatAdgNumber(kgPerDay: number): string {
  const r = roundHalfAway(kgPerDay, 2);
  return `${r < 0 ? MINUS : ""}${Math.abs(r).toFixed(2)}`;
}

/** `amount` is an exact decimal string (or a number) in euro. */
export function formatEuro(amount: string | number, opts: { signed?: boolean } = {}): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const r = roundHalfAway(n, 0);
  const sign = r < 0 ? MINUS : opts.signed && r > 0 ? "+" : "";
  return `${sign}€${group(String(Math.abs(r)))}`;
}

/** A ledger amount in its own currency: `€42` for EUR, otherwise the ISO code (`GBP 42`) — never a € sign on another currency. */
export function formatMoney(amount: string | number, currency: string): string {
  if (currency === "EUR") return formatEuro(amount);
  const n = typeof amount === "string" ? Number(amount) : amount;
  const r = roundHalfAway(n, 0);
  return `${r < 0 ? MINUS : ""}${currency} ${group(String(Math.abs(r)))}`;
}

export function formatEuroPerKg(amount: string | number): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const r = roundHalfAway(n, 2);
  const [whole, cents] = Math.abs(r).toFixed(2).split(".");
  return `${r < 0 ? MINUS : ""}€${group(whole)}.${cents}/kg`;
}

export function formatEuroPrecise(amount: string | number): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  const r = roundHalfAway(n, 2);
  return `${r < 0 ? MINUS : ""}€${group(Math.trunc(Math.abs(r)).toString())}.${Math.abs(r).toFixed(2).split(".")[1]}`;
}

function dateParts(isoOrDate: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoOrDate);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** `16 Oct` (UTC calendar date of an instant, or a date-only value). */
export function formatDayMonth(isoOrDate: string): string {
  const p = dateParts(isoOrDate);
  return p ? `${p[2]} ${MONTHS[p[1] - 1]}` : isoOrDate;
}

/** `16 Oct 2026`. */
export function formatDate(isoOrDate: string): string {
  const p = dateParts(isoOrDate);
  return p ? `${p[2]} ${MONTHS[p[1] - 1]} ${p[0]}` : isoOrDate;
}

/** `09:10 UTC` — shown only where a time of day matters (demo session actions). */
export function formatUtcTime(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]} UTC` : iso;
}

/** Whole calendar months between a birth date and a viewpoint date (both date-only or instants). */
export function ageInMonths(dateOfBirth: string, at: string): number | null {
  const b = dateParts(dateOfBirth);
  const a = dateParts(at);
  if (!b || !a) return null;
  let months = (a[0] - b[0]) * 12 + (a[1] - b[1]);
  if (a[2] < b[2]) months -= 1;
  return months < 0 ? null : months;
}

export function formatAge(months: number): string {
  if (months < 24) return `${months} month${months === 1 ? "" : "s"}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m === 0 ? `${y} years` : `${y} yr ${m} mo`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
