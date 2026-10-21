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
