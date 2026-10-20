/**
 * Cattle C10 — mart valuation: a provider boundary and an honest estimate
 * (an isolated C10 capability; never a C8 economic observation, never an
 * audited or validated price).
 *
 * A provider answers one question: "what did comparable animals make at this
 * market, and when?" It returns an observed range for a named comparable
 * category on a stated pricing basis, with the market, the report date and
 * whether the data is live or a development fixture. `valueAnimalAtMart`
 * turns that into an ESTIMATE for one animal:
 *
 * - basis €/kg liveweight → estimate = liveweight × price (low / central / high);
 * - basis €/head → the observed per-head values, unchanged.
 *
 * It never invents a price, never treats a fixture as live and never hides
 * staleness: freshness is judged against a caller-supplied product setting
 * (`staleAfterDays`), not a built-in constant.
 */

import Decimal from "decimal.js";
import { daysBetween, isPlanDate } from "./plan-dates";

export type PricingBasis = "EUR_PER_KG_LIVEWEIGHT" | "EUR_PER_HEAD";

/** LIVE_FEED / OFFICIAL_STATISTICS: future approved providers. DEVELOPMENT_FIXTURE: never live. */
export type MartProviderKind = "LIVE_FEED" | "OFFICIAL_STATISTICS" | "DEVELOPMENT_FIXTURE";

export interface MartProviderDescription {
  providerId: string;
  name: string;
  kind: MartProviderKind;
  /** True only for an approved live source. A development fixture is never live. */
  isLive: boolean;
}

export interface MartRef {
  martId: string;
  martName: string;
}

/** What the caller knows about the animal (unknown stays `null`). */
export interface MartValuationRequest {
  animalId: string;
  martId: string;
  /** Latest known liveweight (C4 KNOWN only), else `null`. */
  liveweightKg: number | null;
  sex: "MALE" | "FEMALE" | null;
  breedLabel: string | null;
  ageMonths: number | null;
  /** Calendar date the valuation is for. */
  asOfDate: string;
}

export interface MartComparable {
  provider: MartProviderDescription;
  mart: MartRef;
  /** Calendar date of the mart report. */
  reportDate: string;
  /** The comparable category used (e.g. "Bullocks 500–600 kg, continental cross"). */
  category: { label: string; sex: "MALE" | "FEMALE" | null; weightBandKg: [number, number] | null; breedType: string | null };
  basis: PricingBasis;
  /** Exact decimal strings on `basis`. */
  observedLow: string;
  observedHigh: string;
  /** The central figure and how it was obtained. */
  central: string;
  centralDerivation: "OBSERVED_AVERAGE" | "OBSERVED_MEDIAN" | "DERIVED_MIDPOINT";
  sampleSize: number | null;
  /** Provider-stated quality note, verbatim (`null` = none supplied). */
  quality: string | null;
}

export type MartComparableResult =
  | { state: "AVAILABLE"; comparable: MartComparable }
  | { state: "NO_COMPARABLE"; provider: MartProviderDescription; mart: MartRef | null; reason: string }
  | { state: "UNAVAILABLE"; provider: MartProviderDescription; reason: string };

export interface MartValuationProvider {
  describe(): MartProviderDescription;
  listMarts(): MartRef[];
  findComparable(request: MartValuationRequest): MartComparableResult;
}

export type MartValuationState =
  /** An estimate exists (see `freshness` for staleness). */
  | "ESTIMATED"
  /** €/kg basis but no known liveweight: no per-head estimate. */
  | "NO_WEIGHT"
  | "NO_COMPARABLE"
  | "UNAVAILABLE"
  /** The provider returned something malformed: no estimate (fail closed). */
  | "INVALID_PROVIDER_DATA";

export interface MartValuation {
  state: MartValuationState;
  provider: MartProviderDescription | null;
  mart: MartRef | null;
  reportDate: string | null;
  freshness: { ageDays: number; staleAfterDays: number; state: "CURRENT" | "STALE" } | null;
  category: MartComparable["category"] | null;
  basis: PricingBasis | null;
  centralDerivation: MartComparable["centralDerivation"] | null;
  sampleSize: number | null;
  quality: string | null;
  /** Prices on `basis` (exact decimals) — the scenario inputs. */
  price: { low: string; central: string; high: string } | null;
  /** Per-head estimate (exact decimals). Set only when ESTIMATED. */
  estimate: { low: string; central: string; high: string } | null;
  /** OBSERVED: per-head values as reported; DERIVED: €/kg × liveweight. */
  estimateDerivation: "OBSERVED_PER_HEAD" | "DERIVED_FROM_PER_KG_AND_LIVEWEIGHT" | null;
  liveweightKg: number | null;
  reasons: string[];
}

const DECIMAL_RE = /^\d{1,7}(\.\d{1,4})?$/;

function empty(state: MartValuationState, reasons: string[], extra: Partial<MartValuation> = {}): MartValuation {
  return {
    state,
    provider: null,
    mart: null,
    reportDate: null,
    freshness: null,
    category: null,
    basis: null,
    centralDerivation: null,
    sampleSize: null,
    quality: null,
    price: null,
    estimate: null,
    estimateDerivation: null,
    liveweightKg: null,
    reasons,
    ...extra,
  };
}

/** Reads a provider answer into an estimate for one animal at `asOfDate`. */
export function valueAnimalAtMart(result: MartComparableResult, request: MartValuationRequest, staleAfterDays: number): MartValuation {
  if (result.state === "UNAVAILABLE") return empty("UNAVAILABLE", [result.reason], { provider: result.provider });
  if (result.state === "NO_COMPARABLE") return empty("NO_COMPARABLE", [result.reason], { provider: result.provider, mart: result.mart });
  const c = result.comparable;
  const malformed =
    !isPlanDate(c.reportDate) ||
    !isPlanDate(request.asOfDate) ||
    ![c.observedLow, c.central, c.observedHigh].every((v) => typeof v === "string" && DECIMAL_RE.test(v)) ||
    new Decimal(c.observedLow).gt(c.central) ||
    new Decimal(c.central).gt(c.observedHigh) ||
    (c.provider.kind === "DEVELOPMENT_FIXTURE" && c.provider.isLive) ||
    !Number.isInteger(staleAfterDays) ||
    staleAfterDays < 0;
  if (malformed) return empty("INVALID_PROVIDER_DATA", ["MART_PROVIDER_DATA_MALFORMED"], { provider: c.provider, mart: c.mart });
  const ageDays = daysBetween(c.reportDate, request.asOfDate);
  if (ageDays < 0) return empty("INVALID_PROVIDER_DATA", ["MART_REPORT_AFTER_VALUATION_DATE"], { provider: c.provider, mart: c.mart });
  const base: Partial<MartValuation> = {
    provider: c.provider,
    mart: c.mart,
    reportDate: c.reportDate,
    freshness: { ageDays, staleAfterDays, state: ageDays > staleAfterDays ? "STALE" : "CURRENT" },
    category: c.category,
    basis: c.basis,
    centralDerivation: c.centralDerivation,
    sampleSize: c.sampleSize,
    quality: c.quality,
    price: { low: c.observedLow, central: c.central, high: c.observedHigh },
    liveweightKg: request.liveweightKg,
  };
  if (c.basis === "EUR_PER_HEAD") {
    return { ...empty("ESTIMATED", []), ...base, estimate: { low: c.observedLow, central: c.central, high: c.observedHigh }, estimateDerivation: "OBSERVED_PER_HEAD" };
  }
  const w = request.liveweightKg;
  if (w === null || !Number.isFinite(w) || w <= 0) return { ...empty("NO_WEIGHT", ["MART_VALUATION_NEEDS_KNOWN_LIVEWEIGHT"]), ...base, liveweightKg: null };
  const kg = new Decimal(w);
  return {
    ...empty("ESTIMATED", []),
    ...base,
    estimate: { low: kg.times(c.observedLow).toFixed(), central: kg.times(c.central).toFixed(), high: kg.times(c.observedHigh).toFixed() },
    estimateDerivation: "DERIVED_FROM_PER_KG_AND_LIVEWEIGHT",
  };
}
