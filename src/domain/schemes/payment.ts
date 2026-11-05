import type { SchemeDataPoint } from "./contracts";
import type { StoredSchemeDefinition } from "./repository";

export type SchemePaymentState =
  | "CALCULATED"
  | "INSUFFICIENT_DATA"
  | "UNSUPPORTED"
  | "REVIEW_REQUIRED";

export interface SchemePaymentEstimate {
  state: SchemePaymentState;
  currency: "EUR";
  amount: number | null;
  low: number | null;
  high: number | null;
  method: string | null;
  rateStatus: "headline" | "provisional" | "final" | "not_applicable";
  detail: string;
  sourceIds: string[];
}

export type SchemePaymentCalculator = (input: {
  definition: StoredSchemeDefinition;
  snapshot: ReadonlyMap<string, SchemeDataPoint>;
}) => SchemePaymentEstimate;

export function storedSchemeVersionKey(
  definition: StoredSchemeDefinition,
): string {
  const version = definition.version;
  return `${version.schemeKey}:${version.schemeYear}:${version.rulesVersion}`;
}

/**
 * Payment logic is explicitly registered per source-reviewed scheme
 * version/calculation family. There is no generic arithmetic fallback and
 * missing data is never converted to €0.
 */
export function calculateSchemePayment(
  definition: StoredSchemeDefinition,
  snapshot: ReadonlyMap<string, SchemeDataPoint>,
  calculators: Readonly<Record<string, SchemePaymentCalculator>>,
): SchemePaymentEstimate {
  const key = storedSchemeVersionKey(definition);
  const calculator = calculators[key];

  if (!calculator) {
    return {
      state: "UNSUPPORTED",
      currency: "EUR",
      amount: null,
      low: null,
      high: null,
      method: null,
      rateStatus: "not_applicable",
      detail:
        "No source-reviewed payment calculator is registered for this scheme version.",
      sourceIds: [],
    };
  }

  return calculator({ definition, snapshot });
}
