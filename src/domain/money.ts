/**
 * Economic Opportunity Engine, Phase 1 — auditable monetary foundation
 * (`docs/farm-return-next/DOMAIN_CONTRACTS.md`'s "Economic Opportunity
 * Engine" section has the full Phase 1 brief and invariants).
 *
 * Farm Return's existing money calculations (`finance.ts`, `nutrients.ts`'s
 * `costEur`, `price-resolution.ts`, ...) use plain JS `number` arithmetic —
 * a real, accepted, pre-existing gap Phase 0's audit found and did not fix
 * (out of this phase's scope; see DOMAIN_CONTRACTS.md). This module is a
 * clean-room monetary foundation for the *new* Economic Opportunity Engine
 * only: canonical decimal arithmetic via `decimal.js`, never native
 * floating point, so a chain of economic calculations cannot silently
 * accumulate the rounding drift plain `number` money is exposed to.
 *
 * `MoneyAmount` is the only persisted/serialisable shape — a decimal
 * *string* plus an explicit currency code, never a `Decimal` class
 * instance (which does not survive `JSON.stringify`/round-trip identity).
 * Arithmetic converts to `Decimal` internally and converts back to a
 * validated canonical string before returning. No function in this module
 * rounds a value that would otherwise be exact — `addMoney`/`subtractMoney`
 * format their result at the wider of the two operands' own decimal
 * places, which is always lossless for an exact decimal sum/difference.
 *
 * Currency is a real field on every value, never inferred from a variable
 * name (contrast `priceEur`, `costEur` elsewhere in this codebase). Farm
 * Return performs no FX conversion; every operation below throws — fails
 * closed — rather than silently combining two different currencies, the
 * same "throw, never guess" convention `units.ts`'s `convert()` already
 * established for physical units.
 */

import Decimal from "decimal.js";

/**
 * EUR is the only currency Farm Return's product currently requires
 * (CLAUDE.md). Kept as its own explicit type — not inferred from a field
 * name — specifically so a second currency is a type-level addition later,
 * not a silent parsing assumption today.
 */
export type CurrencyCode = "EUR";

/**
 * A canonical decimal string: an optional leading "-", digits with no
 * leading zero (other than a bare "0"), and an optional "." followed by
 * one or more digits. Rejects "NaN", "Infinity", scientific notation,
 * leading "+", empty strings and leading-zero integers ("007") — anything
 * that isn't an unambiguous, exact decimal literal.
 */
const CANONICAL_DECIMAL_STRING = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/**
 * Canonical serialisable money. `amount` is always a validated canonical
 * decimal string (never a `Decimal` instance, never a plain `number`).
 * Construct with `createMoneyAmount`/`moneyFromNumber`/`zeroMoney` —
 * never build this object literal directly, so the canonical-string
 * invariant can't be bypassed.
 */
export interface MoneyAmount {
  readonly amount: string;
  readonly currency: CurrencyCode;
}

/**
 * Validates and wraps an already-decimal-string amount. Throws — refuses
 * to guess or silently coerce — for anything that isn't a canonical
 * decimal string, including `"NaN"`, `"Infinity"`, `""`, and malformed
 * numerics. This is the "invalid monetary inputs cannot enter the domain"
 * gate every other constructor in this module ultimately calls.
 */
export function createMoneyAmount(amount: string, currency: CurrencyCode): MoneyAmount {
  if (!CANONICAL_DECIMAL_STRING.test(amount)) {
    throw new Error(
      `MoneyAmount: "${amount}" is not a canonical decimal string (expected an optional leading "-", digits with no leading zero, and an optional "." followed by digits — no exponent, no "NaN"/"Infinity").`,
    );
  }
  // "-0" is a second, distinct valid string for a value that is
  // economically identical to "0" — negative zero carries no monetary
  // meaning (unlike scale, e.g. "0.00" vs "0", which intentionally
  // preserves real input precision — see this module's header comment).
  // Rejecting it outright, rather than silently normalising it to "0",
  // keeps this constructor's "invalid input cannot enter the domain"
  // guarantee honest: a caller passing "-0" almost certainly has an
  // upstream sign-handling bug worth surfacing, not a value worth
  // quietly accepting.
  if (amount === "-0") {
    throw new Error('MoneyAmount: "-0" is not accepted — negative zero has no economic meaning; use "0".');
  }
  return { amount, currency };
}

/**
 * The largest number of decimal places `moneyFromNumber` accepts. Chosen
 * to comfortably cover any realistic hand-authored farm monetary literal
 * (prices in this codebase never carry more than 2-4 decimal places) while
 * rejecting the shape IEEE-754 float error actually produces in practice
 * (typically 15-17 decimal places — see the function's own doc comment).
 * This is a heuristic, not a proof: it cannot detect every possible
 * float-imprecise value (some happen to round-trip cleanly), only the
 * common, visible failure shape `0.1 + 0.2`-style arithmetic produces.
 */
const MONEY_FROM_NUMBER_MAX_DECIMAL_PLACES = 6;

/**
 * Constructs a `MoneyAmount` from a plain JS number — the one place this
 * module accepts native floating point, and only as an entry point that
 * immediately converts to an exact decimal string via `decimal.js` (never
 * used for the arithmetic itself). Throws for `NaN`/`Infinity`/`-Infinity`
 * rather than silently producing a nonsensical amount.
 *
 * `decimal.js` does NOT fix an already-inexact JS number: `Decimal(n)`
 * captures `n`'s own (possibly float-imprecise) value faithfully, so
 * `moneyFromNumber(0.1 + 0.2, "EUR")` would otherwise produce
 * `{ amount: "0.30000000000000004", ... }`, not `"0.3"` — importing the
 * classic IEEE-754 rounding artifact verbatim into an otherwise-exact
 * domain. This function is intended ONLY for literal, hand-authored
 * numeric constants (a price typed directly into code or a test) — never
 * for the output of prior floating-point arithmetic. As a guard against
 * the common failure shape, a value that cannot be represented exactly in
 * `MONEY_FROM_NUMBER_MAX_DECIMAL_PLACES` decimal places is rejected
 * outright; construct a `MoneyAmount` from an explicit decimal string via
 * `createMoneyAmount` instead of computing a float and importing it here.
 */
export function moneyFromNumber(value: number, currency: CurrencyCode): MoneyAmount {
  if (!Number.isFinite(value)) {
    throw new Error(`MoneyAmount: cannot construct from a non-finite number (${value}).`);
  }
  const exact = new Decimal(value).toString();
  const dot = exact.indexOf(".");
  const decimalPlaceCount = dot === -1 ? 0 : exact.length - dot - 1;
  if (decimalPlaceCount > MONEY_FROM_NUMBER_MAX_DECIMAL_PLACES) {
    throw new Error(
      `MoneyAmount: cannot construct from ${value} — its exact decimal representation ("${exact}") needs ${decimalPlaceCount} decimal places, more than the ${MONEY_FROM_NUMBER_MAX_DECIMAL_PLACES} a real monetary literal should ever need. This is the shape floating-point arithmetic error takes (e.g. 0.1 + 0.2 === 0.30000000000000004 in JS) — moneyFromNumber is for hand-authored literals only, never the output of prior number arithmetic. Use createMoneyAmount with an explicit decimal string instead.`,
    );
  }
  return createMoneyAmount(exact, currency);
}

/** A genuine, exact zero amount — distinct from "no value" (see
 * `EngineOutcome<MoneyAmount>` usage in `economic-opportunity.ts`: a real
 * `zeroMoney` result is wrapped `ok(...)`, never confused with a
 * `BLOCKED_INSUFFICIENT_EVIDENCE`/`UNKNOWN` outcome that has no amount at
 * all). */
export function zeroMoney(currency: CurrencyCode): MoneyAmount {
  return { amount: "0", currency };
}

export function isZeroMoney(a: MoneyAmount): boolean {
  return new Decimal(a.amount).isZero();
}

function requireSameCurrency(a: MoneyAmount, b: MoneyAmount, operation: string): void {
  if (a.currency !== b.currency) {
    throw new Error(
      `MoneyAmount: cannot ${operation} differing currencies (${a.currency} vs ${b.currency}) — Farm Return performs no FX conversion; this operation fails closed rather than silently combining them.`,
    );
  }
}

function decimalPlaces(value: string): number {
  const dot = value.indexOf(".");
  return dot === -1 ? 0 : value.length - dot - 1;
}

/**
 * Same-currency exact addition. The result is formatted at the wider of
 * the two operands' own decimal places — always lossless for an exact
 * decimal sum, never a rounding decision (§B: "no silent rounding is
 * allowed in the domain layer"). Throws on a currency mismatch.
 */
export function addMoney(a: MoneyAmount, b: MoneyAmount): MoneyAmount {
  requireSameCurrency(a, b, "add");
  const scale = Math.max(decimalPlaces(a.amount), decimalPlaces(b.amount));
  const sum = new Decimal(a.amount).plus(b.amount);
  return createMoneyAmount(sum.toFixed(scale), a.currency);
}

/** Same-currency exact subtraction — see `addMoney` for the formatting
 * and currency-mismatch rules, which this mirrors exactly. */
export function subtractMoney(a: MoneyAmount, b: MoneyAmount): MoneyAmount {
  requireSameCurrency(a, b, "subtract");
  const scale = Math.max(decimalPlaces(a.amount), decimalPlaces(b.amount));
  const diff = new Decimal(a.amount).minus(b.amount);
  return createMoneyAmount(diff.toFixed(scale), a.currency);
}

/** Exact negation, preserving the operand's own decimal places. */
export function negateMoney(a: MoneyAmount): MoneyAmount {
  const scale = decimalPlaces(a.amount);
  return createMoneyAmount(new Decimal(a.amount).negated().toFixed(scale), a.currency);
}

/** Same-currency exact comparison. Throws on a currency mismatch, the
 * same fail-closed rule every other cross-amount operation here follows —
 * comparing across currencies without FX would itself be a silent
 * combination of two different currencies. */
export function compareMoney(a: MoneyAmount, b: MoneyAmount): -1 | 0 | 1 {
  requireSameCurrency(a, b, "compare");
  const comparison = new Decimal(a.amount).comparedTo(b.amount);
  return comparison < 0 ? -1 : comparison > 0 ? 1 : 0;
}

/** Same-currency exact equality. Throws on a currency mismatch — see
 * `compareMoney`. */
export function equalsMoney(a: MoneyAmount, b: MoneyAmount): boolean {
  requireSameCurrency(a, b, "compare");
  return new Decimal(a.amount).equals(b.amount);
}
