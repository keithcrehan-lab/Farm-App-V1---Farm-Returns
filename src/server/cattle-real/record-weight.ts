/**
 * Pilot Integration P2 — the real Record Weight request: what the browser may send, and the server's own validation
 * of it (pure; no Supabase, no clock). The browser sends only the submission id, the animal id, the typed weight TEXT
 * and the calendar date (or `null` for "now"). It never sends a farm: the action resolves that server-side. The weight text is re-read here
 * with the same shared parser the sheet uses (`parseNumericInput`), so "500abc", "-5", "0", "1e3" or "52.123" are
 * refused, never coerced into another number (F016).
 *
 * Method: Farm Return stores no weighing method (DECISIONS D12), so nothing here asks for or records one — the
 * frozen engines keep reporting the method as not recorded.
 */

import { NUMERIC_FIELDS, numericInputValue, parseNumericInput } from "@/domain/cattle/presentation";

/** The `source` written for a weight recorded on the Cattle screen (the same wording `/livestock` writes). */
export const REAL_WEIGHT_SOURCE = "Farmer entered";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** A real calendar date `YYYY-MM-DD` (no 30 February). */
export function isCalendarDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = DATE_RE.exec(v);
  if (m === null) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** The calendar date in Ireland at `now` — the farmer's "today" (the stored date is that calendar date, D5/D12). */
export function irelandCalendarDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export type RecordWeightRefusal =
  | "INVALID_REQUEST"
  | "INVALID_WEIGHT"
  | "INVALID_DATE"
  | "FUTURE_DATE"
  | "DEMO_MODE"
  | "NOT_SIGNED_IN"
  | "ANIMAL_NOT_FOUND"
  | "DUPLICATE_CONFLICT"
  | "WRITE_FAILED";

export type RecordWeightResult = { ok: true; observationId: string; replayed: boolean } | { ok: false; reason: RecordWeightRefusal; message: string };

/** Farmer-facing words for each refusal (never mentions another farm, or whether an id exists elsewhere). */
export const RECORD_WEIGHT_MESSAGES: Readonly<Record<RecordWeightRefusal, string>> = {
  INVALID_REQUEST: "This weight couldn't be saved. Reload the page and try again.",
  INVALID_WEIGHT: "Enter a weight above zero, up to 2000 kg, like 452 or 452.5.",
  INVALID_DATE: "Enter a real date.",
  FUTURE_DATE: "The date can't be later than today.",
  DEMO_MODE: "Weights can't be saved here.",
  NOT_SIGNED_IN: "Sign in to record a weight.",
  ANIMAL_NOT_FOUND: "This animal isn't on your farm's records, so the weight wasn't saved.",
  DUPLICATE_CONFLICT: "This weight may already have been saved. Reload the page to check before entering it again.",
  WRITE_FAILED: "The weight couldn't be saved. Nothing was recorded — try again.",
};

export const refuse = (reason: RecordWeightRefusal): RecordWeightResult => ({ ok: false, reason, message: RECORD_WEIGHT_MESSAGES[reason] });

export interface RecordWeightRequest {
  requestId: string;
  animalId: string;
  weightKg: number;
  observedDate: string;
}

/** Validates an untrusted request against the farmer's `today` (Ireland). */
export function readRecordWeightRequest(raw: unknown, today: string): { ok: true; request: RecordWeightRequest } | { ok: false; reason: RecordWeightRefusal } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "INVALID_REQUEST" };
  const r = raw as Record<string, unknown>;
  const keys = Object.keys(r).sort().join(",");
  // Exactly these fields: in particular no farm id, method or source can be supplied.
  if (keys !== "animalId,observedDate,requestId,weightText") return { ok: false, reason: "INVALID_REQUEST" };
  if (!isUuid(r.requestId) || !isUuid(r.animalId)) return { ok: false, reason: "INVALID_REQUEST" };
  if (typeof r.weightText !== "string") return { ok: false, reason: "INVALID_WEIGHT" };
  const kg = numericInputValue(parseNumericInput(r.weightText, NUMERIC_FIELDS.WEIGHT_KG));
  if (kg === null || !Number.isFinite(kg) || kg <= 0) return { ok: false, reason: "INVALID_WEIGHT" };
  // `null` = "Now": the server's own Ireland date at the moment of saving (never a date the page captured earlier).
  const observedDate = r.observedDate === null ? today : r.observedDate;
  if (!isCalendarDate(observedDate)) return { ok: false, reason: "INVALID_DATE" };
  if (observedDate > today) return { ok: false, reason: "FUTURE_DATE" };
  return { ok: true, request: { requestId: r.requestId.toLowerCase(), animalId: r.animalId.toLowerCase(), weightKg: kg, observedDate } };
}
