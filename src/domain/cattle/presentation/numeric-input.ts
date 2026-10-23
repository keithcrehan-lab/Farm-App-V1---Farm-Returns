/**
 * Cattle C10 — editing arithmetic for numeric form fields (invariant B:
 * presentation formatting may round; editing and saving never reduce
 * precision). A field's canonical value is its exact decimal text; steppers
 * add an exact decimal step (decimal.js — no binary floating-point drift, no
 * rounding), and display formatting (`format.ts`) is never fed back into it.
 */

import Decimal from "decimal.js";

const DECIMAL_TEXT = /^\d+(\.\d+)?$/;

/** True when `text` is a plain non-negative decimal (`548`, `548.24`, `0.375`). */
export function isDecimalText(text: string): boolean {
  return DECIMAL_TEXT.test(text.trim());
}

/**
 * The exact decimal text of a canonical number, for an editable field (`548.24` → `"548.24"`;
 * never rounded). `null` for a non-finite value.
 */
export function canonicalNumberText(value: number): string | null {
  return Number.isFinite(value) ? new Decimal(value).toFixed() : null;
}

/**
 * `text` plus `step` (an exact decimal, e.g. `"5"`, `"-0.05"`), clamped to `min`, as exact decimal text.
 * When `text` isn't a decimal, steps from `from` (e.g. the previous canonical value) or else from `min`.
 */
export function stepDecimalText(text: string, step: string, opts: { min: string; from?: string | null }): string {
  const base = isDecimalText(text) ? new Decimal(text.trim()) : opts.from != null && isDecimalText(opts.from) ? new Decimal(opts.from) : new Decimal(opts.min);
  return Decimal.max(new Decimal(opts.min), base.plus(step)).toFixed();
}

/**
 * A farmer-editable numeric field's limits. Every C10 numeric field is positive-only today (weights, feed,
 * prices, costs); a field that may legitimately be negative would say so here (`allowNegative`) — there is
 * no universal rule. `minExclusive`: the minimum itself is refused (a weight of 0 kg).
 */
export interface NumericFieldSpec {
  min: string;
  minExclusive?: boolean;
  max: string;
  /** Most decimal places accepted (rejected, never rounded, beyond it). */
  maxDecimals: number;
  allowNegative?: boolean;
}

export type NumericInputRead =
  | { state: "EMPTY" }
  /** `canonical`: exact decimal text with "." (`"52,1"` → `"52.1"`); never rounded. */
  | { state: "VALID"; canonical: string }
  | { state: "INVALID"; reason: "SYNTAX" | "GROUPED" | "NEGATIVE" | "TOO_PRECISE" | "OUT_OF_RANGE"; message: string };

/** One number, optional sign, at most one decimal separator ("." or ","). Anything else is not a number here. */
const NUMBER_SYNTAX = /^(-?)(\d+)(?:[.,](\d+))?$/;
/** "1,000" — a comma before exactly three digits may be a thousands separator: ambiguous, so refused. */
const AMBIGUOUS_GROUPED = /^-?\d{1,3},\d{3}$/;
/** Grouped forms: "1,000,000", "1.000,5", "1,000.5". */
const GROUPED = /^-?\d{1,3}([.,]\d{3}){2,}$|^-?\d{1,3}(,\d{3})+\.\d+$|^-?\d{1,3}(\.\d{3})+,\d+$/;

/**
 * The ONE parser for farmer-typed numbers in C10 (F016). It never rewrites input: the raw text stays in the
 * field; this either accepts it — "." or "," as the decimal separator, input convenience only — or says why
 * not. Validation may reject a value; it never turns one meaning into another ("-12" is never 12, "1e3"
 * never 13, "52,1" never 521, "1,000" never 1000 or 1.0). Surrounding spaces are ignored.
 */
export function parseNumericInput(raw: string, spec: NumericFieldSpec): NumericInputRead {
  const text = raw.trim();
  if (text === "") return { state: "EMPTY" };
  if (AMBIGUOUS_GROUPED.test(text) || GROUPED.test(text)) return { state: "INVALID", reason: "GROUPED", message: "Enter the number without a thousands separator." };
  const m = NUMBER_SYNTAX.exec(text);
  if (m === null) return { state: "INVALID", reason: "SYNTAX", message: "Enter a number, like 52.1 or 52,1." };
  if (m[1] === "-" && spec.allowNegative !== true) return { state: "INVALID", reason: "NEGATIVE", message: "Enter a number above zero." };
  if ((m[3] ?? "").length > spec.maxDecimals) return { state: "INVALID", reason: "TOO_PRECISE", message: spec.maxDecimals === 0 ? "Enter a whole number." : `Use at most ${spec.maxDecimals} decimal places.` };
  const value = new Decimal(`${m[1]}${m[2]}${m[3] === undefined ? "" : `.${m[3]}`}`);
  const min = new Decimal(spec.min);
  if ((spec.minExclusive ? value.lte(min) : value.lt(min)) || value.gt(new Decimal(spec.max))) {
    return { state: "INVALID", reason: "OUT_OF_RANGE", message: `Enter a number ${spec.minExclusive ? "above" : "from"} ${min.toFixed()} up to ${new Decimal(spec.max).toFixed()}.` };
  }
  return { state: "VALID", canonical: value.toFixed() };
}

/** The C10 farmer numeric fields and their limits (the plan figures match the economics' own input bound, `PLAN_NUMBER`). */
export const NUMERIC_FIELDS = {
  /** A scale reading (kg). */
  WEIGHT_KG: { min: "0", minExclusive: true, max: "2000", maxDecimals: 2 },
  /** The goal target weight in the plan (kg). */
  TARGET_KG: { min: "0", minExclusive: true, max: "2000", maxDecimals: 2 },
  /** Plan assumptions: concentrate kg/day, €/tonne, forage €/day, housing €/day. */
  PLAN_AMOUNT: { min: "0", max: "9999999.9999", maxDecimals: 4 },
} as const satisfies Record<string, NumericFieldSpec>;

/** `parseNumericInput` for a step: the parsed value, or null when the field holds no valid number. */
function stepBase(text: string, spec: NumericFieldSpec): Decimal | null {
  const r = parseNumericInput(text, spec);
  return r.state === "VALID" ? new Decimal(r.canonical) : null;
}

/**
 * A stepper on a parsed field: `text` + `step` exactly, clamped to the field's bounds. An EMPTY field steps from
 * `from` (e.g. the previous canonical value) or the minimum; a field holding text that isn't a valid number is
 * left exactly as typed (`null`: nothing to do) — a stepper never overwrites a value the farmer is correcting.
 */
export function stepNumericInput(text: string, step: string, spec: NumericFieldSpec, from: string | null = null): string | null {
  const parsed = stepBase(text, spec);
  if (parsed === null && text.trim() !== "") return null;
  const base = parsed ?? (from !== null && isDecimalText(from) ? new Decimal(from) : new Decimal(spec.min));
  const min = new Decimal(spec.min);
  const next = Decimal.min(new Decimal(spec.max), Decimal.max(min, base.plus(step)));
  // An exclusive minimum (a 0 kg weight) is never stepped onto: the step that would reach it does nothing.
  return spec.minExclusive && next.lte(min) ? base.toFixed() : next.toFixed();
}

/** The number a VALID read stands for (exact decimal text → binary64 only at the domain boundary); null otherwise. */
export function numericInputValue(r: NumericInputRead): number | null {
  return r.state === "VALID" ? Number(r.canonical) : null;
}
