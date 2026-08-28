/**
 * Real Mode Completion Phase 21 — market data source hierarchy.
 *
 * "Financial calculations should resolve prices according to an explicit
 * hierarchy... Do not silently fall back to an attractive hard-coded
 * number. The UI must identify which level is being used." (brief)
 *
 * Order, highest priority first:
 *   1. farmer_entered   — a real farmer-adjusted `FinancialAssumption`.
 *   2. supplier_quote    — a real, not-yet-expired `SupplierQuote`.
 *   3. market_reference  — a verified current/reference market price
 *      (e.g. `src/domain/market.ts`'s CSO series via `latestPoint`).
 *   4. historical_benchmark — an older/less current reference figure.
 *   5. unavailable       — none of the above exist; never a fabricated
 *      guess. `valueEurPerUnit` is `null` at this level, not `0` —
 *      "unavailable and 0 mean different things" (the brief's own rule,
 *      restated here because this is exactly the function that must
 *      honour it).
 *
 * Pure and side-effect-free — the caller resolves each input tier from
 * wherever it really lives (a `financial_assumptions` row, a
 * `supplier_quotes` query, `market.ts`) and this function only decides
 * which one wins, never invents a value of its own.
 */

export type PriceSourceLevel = "farmer_entered" | "supplier_quote" | "market_reference" | "historical_benchmark" | "unavailable";

export interface ResolvedPrice {
  level: PriceSourceLevel;
  valueEurPerUnit: number | null;
  unit: string | null;
  /** Human-readable provenance, e.g. "Keith Crehan", "ABC Merchants quote", "CSO reference, 2026-06". */
  source: string;
  /** ISO date the value is as-of, where meaningful (quote date, reference observation date). */
  asOf?: string;
}

export interface SupplierQuoteInput {
  supplierName: string;
  priceEur: number;
  unit: string;
  quoteDate: string;
  /** `undefined` — no expiry set, treated as still valid. */
  validUntil?: string;
}

export interface FarmerAssumptionInput {
  value: number;
  /** Only `"farmer_adjusted"` counts as this farm's own real entered
   * price — `"estimated"` means the farmer accepted a reference default
   * as-is (Phase 4/14's onboarding pattern), which is not the same fact
   * as having typed in a real cost. */
  status: "farmer_adjusted" | "estimated";
  unit: string;
  source: string;
}

export interface ReferencePriceInput {
  value: number;
  unit: string;
  source: string;
  asOf: string;
}

export interface PriceResolutionInput {
  today: string;
  farmerAssumption?: FarmerAssumptionInput;
  supplierQuotes?: SupplierQuoteInput[];
  marketReference?: ReferencePriceInput;
  historicalBenchmark?: ReferencePriceInput;
}

export function resolvePrice(input: PriceResolutionInput): ResolvedPrice {
  if (input.farmerAssumption?.status === "farmer_adjusted") {
    return {
      level: "farmer_entered",
      valueEurPerUnit: input.farmerAssumption.value,
      unit: input.farmerAssumption.unit,
      source: input.farmerAssumption.source,
    };
  }

  const validQuotes = (input.supplierQuotes ?? []).filter((q) => !q.validUntil || q.validUntil >= input.today);
  if (validQuotes.length > 0) {
    const latest = [...validQuotes].sort((a, b) => b.quoteDate.localeCompare(a.quoteDate))[0];
    return {
      level: "supplier_quote",
      valueEurPerUnit: latest.priceEur,
      unit: latest.unit,
      source: `${latest.supplierName} quote`,
      asOf: latest.quoteDate,
    };
  }

  if (input.marketReference) {
    return {
      level: "market_reference",
      valueEurPerUnit: input.marketReference.value,
      unit: input.marketReference.unit,
      source: input.marketReference.source,
      asOf: input.marketReference.asOf,
    };
  }

  if (input.historicalBenchmark) {
    return {
      level: "historical_benchmark",
      valueEurPerUnit: input.historicalBenchmark.value,
      unit: input.historicalBenchmark.unit,
      source: input.historicalBenchmark.source,
      asOf: input.historicalBenchmark.asOf,
    };
  }

  return { level: "unavailable", valueEurPerUnit: null, unit: null, source: "No price available yet" };
}

export const PRICE_SOURCE_LEVEL_LABEL: Record<PriceSourceLevel, string> = {
  farmer_entered: "Farmer entered",
  supplier_quote: "Supplier quote",
  market_reference: "Market reference",
  historical_benchmark: "Historical benchmark",
  unavailable: "Unavailable",
};
