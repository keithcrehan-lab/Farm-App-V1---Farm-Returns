import { describe, expect, it } from "vitest";
import {
  addMoney,
  compareMoney,
  createMoneyAmount,
  equalsMoney,
  isZeroMoney,
  moneyFromNumber,
  negateMoney,
  subtractMoney,
  zeroMoney,
  type MoneyAmount,
} from "./money";

describe("createMoneyAmount", () => {
  it("accepts canonical decimal strings", () => {
    expect(createMoneyAmount("412.35", "EUR")).toEqual({ amount: "412.35", currency: "EUR" });
    expect(createMoneyAmount("0", "EUR")).toEqual({ amount: "0", currency: "EUR" });
    expect(createMoneyAmount("-9.5", "EUR")).toEqual({ amount: "-9.5", currency: "EUR" });
  });

  // Item 5: invalid/NaN/infinite monetary inputs cannot enter the domain.
  it("rejects NaN, Infinity, and malformed decimal strings", () => {
    expect(() => createMoneyAmount("NaN", "EUR")).toThrow();
    expect(() => createMoneyAmount("Infinity", "EUR")).toThrow();
    expect(() => createMoneyAmount("-Infinity", "EUR")).toThrow();
    expect(() => createMoneyAmount("", "EUR")).toThrow();
    expect(() => createMoneyAmount("12.5e3", "EUR")).toThrow();
    expect(() => createMoneyAmount("007", "EUR")).toThrow();
    expect(() => createMoneyAmount("12.", "EUR")).toThrow();
    expect(() => createMoneyAmount("abc", "EUR")).toThrow();
    expect(() => createMoneyAmount("+5", "EUR")).toThrow();
  });

  // Codex review hardening (2026-09-20): "-0" has no economic meaning and
  // is a second, distinct valid string for the same value as "0" — reject
  // it rather than silently accepting a non-canonical zero.
  it('rejects "-0" — negative zero has no economic meaning', () => {
    expect(() => createMoneyAmount("-0", "EUR")).toThrow(/negative zero/);
  });
});

describe("moneyFromNumber", () => {
  it("converts a finite number to an exact decimal string", () => {
    expect(moneyFromNumber(412.35, "EUR")).toEqual({ amount: "412.35", currency: "EUR" });
  });

  it("rejects NaN and infinite numbers", () => {
    expect(() => moneyFromNumber(NaN, "EUR")).toThrow();
    expect(() => moneyFromNumber(Infinity, "EUR")).toThrow();
    expect(() => moneyFromNumber(-Infinity, "EUR")).toThrow();
  });

  // Codex review hardening (2026-09-20): decimal.js does not fix an
  // already-inexact JS number — Decimal(n) faithfully preserves n's own
  // float error. moneyFromNumber must reject the classic failure shape
  // rather than importing 0.30000000000000004 as if it were exact.
  it("rejects the classic 0.1 + 0.2 floating-point artifact rather than importing it verbatim", () => {
    expect(() => moneyFromNumber(0.1 + 0.2, "EUR")).toThrow(/floating-point/);
  });

  it("still accepts a genuine hand-authored literal with a few decimal places", () => {
    expect(moneyFromNumber(0.125, "EUR")).toEqual({ amount: "0.125", currency: "EUR" });
  });
});

describe("addMoney / subtractMoney — exact decimal arithmetic", () => {
  // Item 1: "0.10" + "0.20" produces exact "0.30", not floating-point
  // drift (native JS: 0.1 + 0.2 === 0.30000000000000004).
  it('adds "0.10" and "0.20" to exactly "0.30"', () => {
    const a = createMoneyAmount("0.10", "EUR");
    const b = createMoneyAmount("0.20", "EUR");
    expect(addMoney(a, b)).toEqual({ amount: "0.30", currency: "EUR" });
  });

  it("confirms this is not achievable with native floating point", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  // Item 3: same-currency amounts add/subtract correctly.
  it("adds and subtracts same-currency amounts correctly", () => {
    const a = createMoneyAmount("100.00", "EUR");
    const b = createMoneyAmount("42.50", "EUR");
    expect(addMoney(a, b)).toEqual({ amount: "142.50", currency: "EUR" });
    expect(subtractMoney(a, b)).toEqual({ amount: "57.50", currency: "EUR" });
  });

  it("subtraction can produce an exact negative amount", () => {
    const a = createMoneyAmount("10", "EUR");
    const b = createMoneyAmount("42.50", "EUR");
    expect(subtractMoney(a, b)).toEqual({ amount: "-32.50", currency: "EUR" });
  });

  // Item 4: different currencies cannot be silently combined.
  it("fails closed on a currency mismatch rather than combining", () => {
    const eur = createMoneyAmount("10", "EUR");
    // A second, hypothetical currency the type system does not currently
    // allow — cast to prove the runtime guard also fails closed, not only
    // the type checker.
    const other = { amount: "10", currency: "USD" } as unknown as MoneyAmount;
    expect(() => addMoney(eur, other)).toThrow(/differing currencies/);
    expect(() => subtractMoney(eur, other)).toThrow(/differing currencies/);
    expect(() => compareMoney(eur, other)).toThrow(/differing currencies/);
    expect(() => equalsMoney(eur, other)).toThrow(/differing currencies/);
  });
});

describe("compareMoney / equalsMoney", () => {
  it("compares same-currency amounts", () => {
    expect(compareMoney(createMoneyAmount("10", "EUR"), createMoneyAmount("20", "EUR"))).toBe(-1);
    expect(compareMoney(createMoneyAmount("20", "EUR"), createMoneyAmount("10", "EUR"))).toBe(1);
    expect(compareMoney(createMoneyAmount("10", "EUR"), createMoneyAmount("10.0", "EUR"))).toBe(0);
  });

  it("treats differently-scaled equal amounts as equal", () => {
    expect(equalsMoney(createMoneyAmount("10", "EUR"), createMoneyAmount("10.00", "EUR"))).toBe(true);
  });
});

describe("negateMoney / zeroMoney / isZeroMoney", () => {
  it("negates an amount, preserving scale", () => {
    expect(negateMoney(createMoneyAmount("42.50", "EUR"))).toEqual({ amount: "-42.50", currency: "EUR" });
  });

  it("zeroMoney is exactly zero", () => {
    expect(isZeroMoney(zeroMoney("EUR"))).toBe(true);
    expect(isZeroMoney(createMoneyAmount("0.00", "EUR"))).toBe(true);
    expect(isZeroMoney(createMoneyAmount("0.01", "EUR"))).toBe(false);
  });
});

// Item 2: money serialises deterministically.
describe("serialisation", () => {
  it("round-trips through JSON with no loss and no Decimal instances leaking", () => {
    const amount = createMoneyAmount("412.35", "EUR");
    const json = JSON.stringify(amount);
    expect(json).toBe('{"amount":"412.35","currency":"EUR"}');
    const parsed = JSON.parse(json) as MoneyAmount;
    expect(parsed).toEqual(amount);
    expect(typeof parsed.amount).toBe("string");
  });

  it("serialises the same logical amount identically every time", () => {
    const first = JSON.stringify(addMoney(createMoneyAmount("0.10", "EUR"), createMoneyAmount("0.20", "EUR")));
    const second = JSON.stringify(addMoney(createMoneyAmount("0.10", "EUR"), createMoneyAmount("0.20", "EUR")));
    expect(first).toBe(second);
  });
});
