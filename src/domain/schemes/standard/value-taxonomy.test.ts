import { describe, expect, it } from "vitest";
import {
  schemeValuesMaySum,
  strongestPermittedSchemeValueClass,
  type SchemeValueDescriptor,
} from "./value-taxonomy";

const value = (overrides: Partial<SchemeValueDescriptor> = {}): SchemeValueDescriptor => ({
  valueType: "RECURRING_ANNUAL_SUPPORT",
  valueClass: "CURRENT",
  schemeYear: 2031,
  currency: "EUR",
  ...overrides,
});

describe("schemeValuesMaySum", () => {
  it("allows only the same type, class and year", () => {
    expect(schemeValuesMaySum(value(), value())).toBe(true);
  });

  it.each<[string, Partial<SchemeValueDescriptor>]>([
    ["a capital grant with recurring support", { valueType: "CAPITAL_GRANT" }],
    ["a one-off payment with recurring support", { valueType: "ONE_OFF_PAYMENT" }],
    ["maximum with current", { valueClass: "MAXIMUM" }],
    ["confirmed with current", { valueClass: "CONFIRMED" }],
    ["two scheme years", { schemeYear: 2032 }],
  ])("refuses %s, in either order", (_label, overrides) => {
    expect(schemeValuesMaySum(value(), value(overrides))).toBe(false);
    expect(schemeValuesMaySum(value(overrides), value())).toBe(false);
  });

  it("never sums incomparable value, even with itself", () => {
    const other = value({ valueType: "OTHER_INCOMPARABLE" });
    expect(schemeValuesMaySum(other, other)).toBe(false);
  });
});

describe("strongestPermittedSchemeValueClass", () => {
  it.each([
    [false, false, false, null],
    [false, true, false, null],
    [true, false, false, "MAXIMUM"],
    [true, true, false, "CURRENT"],
    [true, true, true, "CONFIRMED"],
    [false, false, true, "CONFIRMED"],
  ])(
    "sourced=%s facts=%s authoritative=%s gives %s",
    (sourcedCalculation, farmFactsUsable, authoritativeDetermination, expected) => {
      expect(
        strongestPermittedSchemeValueClass({
          sourcedCalculation,
          farmFactsUsable,
          authoritativeDetermination,
        }),
      ).toBe(expected);
    },
  );
});
