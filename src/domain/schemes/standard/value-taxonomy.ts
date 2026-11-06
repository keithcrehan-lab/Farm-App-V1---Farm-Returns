/**
 * Value taxonomy shared by every scheme value and the later portfolio
 * aggregate. Types are not comparable with each other and classes are never
 * promoted past their evidence (SCH-INV-006, campaign scope item 8).
 */

export type SchemeValueType =
  | "RECURRING_ANNUAL_SUPPORT"
  | "CAPITAL_GRANT"
  | "ONE_OFF_PAYMENT"
  | "OTHER_INCOMPARABLE";

/** Ascending strength. */
export type SchemeValueClass = "MAXIMUM" | "CURRENT" | "CONFIRMED";

export interface SchemeValueDescriptor {
  valueType: SchemeValueType;
  valueClass: SchemeValueClass;
  schemeYear: number;
  currency: "EUR";
}

export interface SchemeValueEvidence {
  /** A pinned source states the rate, cap or formula for this version. */
  sourcedCalculation: boolean;
  /** Every farm fact the calculation reads is KNOWN and none is estimated. */
  farmFactsUsable: boolean;
  /** The paying authority's own determination for this farm and version. */
  authoritativeDetermination: boolean;
}

/**
 * The strongest class the evidence permits, or null when the value is
 * unresolved. An authoritative determination stands by itself; without one,
 * a value can never be stronger than CURRENT however complete the farm's
 * data is.
 */
export function strongestPermittedSchemeValueClass(
  evidence: SchemeValueEvidence,
): SchemeValueClass | null {
  if (evidence.authoritativeDetermination) return "CONFIRMED";
  if (!evidence.sourcedCalculation) return null;
  return evidence.farmFactsUsable ? "CURRENT" : "MAXIMUM";
}

/**
 * Two values may be added only when they have the same type, class, year
 * and currency. OTHER_INCOMPARABLE never sums, even with itself. Whether two
 * schemes exclude each other is a separate question for the registers.
 */
export function schemeValuesMaySum(
  a: SchemeValueDescriptor,
  b: SchemeValueDescriptor,
): boolean {
  if (a.valueType === "OTHER_INCOMPARABLE") return false;
  return (
    a.valueType === b.valueType &&
    a.valueClass === b.valueClass &&
    a.schemeYear === b.schemeYear &&
    a.currency === b.currency
  );
}
