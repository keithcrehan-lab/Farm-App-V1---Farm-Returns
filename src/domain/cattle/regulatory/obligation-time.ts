/**
 * Cattle C2 — deterministic instant arithmetic for obligation windows.
 *
 * Strict UTC only. Instants use C1's strict syntax (`isValidAnimalInstant`)
 * and compare through C1's `compareInstants` (fixed-width `animalInstantKey`),
 * never by spelling. Arithmetic is pure integer calendar arithmetic (days
 * from civil date, Hinnant's algorithm) — no `Date` object, no clock, no
 * timezone or locale conversion. UTC has no daylight-saving shifts, so a DAY
 * offset is exactly 86 400 s and an HOUR offset exactly 3 600 s; leap
 * seconds are not modelled (ISO-8601 UTC strings cannot carry them here).
 *
 * Computed instants are emitted in one canonical spelling with nine
 * fractional digits (`YYYY-MM-DDTHH:MM:SS.nnnnnnnnnZ`). Anything outside
 * years 0000–9999 cannot be represented and returns `null` (fail closed).
 */

import { isValidAnimalInstant } from "../animal-ledger";
import { isValidCalendarDate } from "../rule";

const INSTANT_PARTS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;

export const OBLIGATION_OFFSET_UNITS = ["DAY", "HOUR"] as const;
export type ObligationOffsetUnit = (typeof OBLIGATION_OFFSET_UNITS)[number];

/** A rule-declared, non-negative whole-unit offset. */
export interface ObligationOffset {
  amount: number;
  unit: ObligationOffsetUnit;
}

const SECONDS_PER_UNIT: Record<ObligationOffsetUnit, number> = { DAY: 86_400, HOUR: 3_600 };

interface InstantParts {
  /** Whole seconds since 1970-01-01T00:00:00Z (may be negative). */
  epochSeconds: number;
  /** 0..999 999 999. */
  nanos: number;
}

function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146_097 + doe - 719_468;
}

function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

function parseInstant(value: string): InstantParts | null {
  if (!isValidAnimalInstant(value)) return null;
  const m = INSTANT_PARTS.exec(value);
  if (!m) return null;
  const days = daysFromCivil(Number(m[1]), Number(m[2]), Number(m[3]));
  return {
    epochSeconds: days * 86_400 + Number(m[4]) * 3_600 + Number(m[5]) * 60 + Number(m[6]),
    nanos: Number((m[7] ?? "").padEnd(9, "0")),
  };
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

function formatInstant(parts: InstantParts): string | null {
  if (!Number.isSafeInteger(parts.epochSeconds)) return null;
  const days = Math.floor(parts.epochSeconds / 86_400);
  const secondOfDay = parts.epochSeconds - days * 86_400;
  const { year, month, day } = civilFromDays(days);
  if (year < 0 || year > 9999) return null;
  const hh = Math.floor(secondOfDay / 3_600);
  const mm = Math.floor((secondOfDay % 3_600) / 60);
  const ss = secondOfDay % 60;
  const text = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)}.${pad(parts.nanos, 9)}Z`;
  return isValidAnimalInstant(text) ? text : null;
}

/** The canonical nine-digit spelling of a strict UTC instant; `null` if invalid. */
export function canonicalObligationInstant(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parts = parseInstant(value);
  return parts === null ? null : formatInstant(parts);
}

/** UTC midnight starting a calendar date (`YYYY-MM-DD`), canonical spelling. */
export function utcStartOfCalendarDate(date: string): string | null {
  return isValidCalendarDate(date) ? canonicalObligationInstant(`${date}T00:00:00Z`) : null;
}

/** The UTC calendar date of a strict instant (used as the C0 evaluation date). */
export function utcCalendarDateOf(instant: string): string {
  return instant.slice(0, 10);
}

export function isValidObligationOffset(value: unknown): value is ObligationOffset {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const { amount, unit } = value as Record<string, unknown>;
  return Number.isSafeInteger(amount) && (amount as number) >= 0 && typeof unit === "string" && (OBLIGATION_OFFSET_UNITS as readonly string[]).includes(unit);
}

/** Offset length in seconds (exact in UTC). */
export function obligationOffsetSeconds(offset: ObligationOffset): number {
  return offset.amount * SECONDS_PER_UNIT[offset.unit];
}

/** `instant + offset`, canonical spelling; `null` when unrepresentable. */
export function addObligationOffset(instant: string, offset: ObligationOffset): string | null {
  const parts = parseInstant(instant);
  if (parts === null) return null;
  return formatInstant({ epochSeconds: parts.epochSeconds + obligationOffsetSeconds(offset), nanos: parts.nanos });
}

/** The latest representable instant strictly before `instant` (one nanosecond earlier). */
export function obligationInstantJustBefore(instant: string): string | null {
  const parts = parseInstant(instant);
  if (parts === null) return null;
  return parts.nanos > 0
    ? formatInstant({ epochSeconds: parts.epochSeconds, nanos: parts.nanos - 1 })
    : formatInstant({ epochSeconds: parts.epochSeconds - 1, nanos: 999_999_999 });
}
