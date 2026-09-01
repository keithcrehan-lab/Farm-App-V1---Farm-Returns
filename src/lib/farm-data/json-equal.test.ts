import { describe, expect, it } from "vitest";
import { jsonValuesEqual } from "./json-equal";

/**
 * Extracted (Vertical A) from what was previously an
 * insertDecision-retry-path-only helper in `decisions.ts` — direct tests
 * here since it now has two independent real callers
 * (`decisions.ts`/`telemetry.ts`) and no longer has the "small enough
 * that its one caller's own tests cover it" justification its original
 * doc comment gave.
 */
describe("jsonValuesEqual", () => {
  it("treats identical primitives as equal", () => {
    expect(jsonValuesEqual(1, 1)).toBe(true);
    expect(jsonValuesEqual("a", "a")).toBe(true);
    expect(jsonValuesEqual(true, true)).toBe(true);
  });

  it("treats different primitives as unequal", () => {
    expect(jsonValuesEqual(1, 2)).toBe(false);
    expect(jsonValuesEqual("a", "b")).toBe(false);
    expect(jsonValuesEqual(true, false)).toBe(false);
  });

  it("treats null and undefined as the same 'absent' value", () => {
    expect(jsonValuesEqual(null, undefined)).toBe(true);
    expect(jsonValuesEqual(undefined, null)).toBe(true);
    expect(jsonValuesEqual(null, null)).toBe(true);
  });

  it("treats null/undefined as unequal to a real value, including zero/empty-string/false", () => {
    expect(jsonValuesEqual(null, 0)).toBe(false);
    expect(jsonValuesEqual(undefined, "")).toBe(false);
    expect(jsonValuesEqual(null, false)).toBe(false);
  });

  it("compares arrays element-wise, order-sensitive, length-sensitive", () => {
    expect(jsonValuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(jsonValuesEqual([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(jsonValuesEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(jsonValuesEqual([], [])).toBe(true);
  });

  it("treats an array and a plain object as unequal even if superficially similar", () => {
    expect(jsonValuesEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
  });

  it("compares plain objects key-by-key, order-insensitive", () => {
    expect(jsonValuesEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(jsonValuesEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
  });

  it("treats a missing key and a key present with an explicit null as equal", () => {
    expect(jsonValuesEqual({ a: 1 }, { a: 1, b: null })).toBe(true);
    expect(jsonValuesEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it("recurses into nested structures", () => {
    expect(jsonValuesEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(jsonValuesEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
  });
});
