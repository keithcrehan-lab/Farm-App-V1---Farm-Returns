/**
 * Economic Opportunity Engine — Slurry Realisation Cost V1 Pilot Benchmark.
 *
 * `SlurryDirectEconomicAssessment`'s `realisationCost` (Phase 5,
 * `slurry-direct-economic-assessment.ts:107-111`) is a tri-state
 * "incremental realisation cost (contractor spreading, transport, ...)"
 * that Phase 5 subtracts from the audited gross fertiliser-plan-cost
 * difference to produce a net economic result — confirmed directly from
 * Phase 5's own type doc comment and its net-return calculation (never
 * reinterpreted here). Until real farmer-specific contractor-quote
 * evidence exists, this module supplies that incremental cost from a
 * single, explicit, versioned Farm Return pilot benchmark: a flat
 * €120/ha Irish LESS trailing-shoe contractor rate for 2026.
 *
 * This is NOT a live contractor quote, NOT a farmer-specific price, and
 * NOT a regional benchmark — it is one fixed, disclosed, versioned
 * assumption (`SLURRY_REALISATION_COST_IE_V1`), always labelled as such
 * everywhere it is surfaced (code, docs, UI). It must be superseded by a
 * higher-quality farmer-specific or contractor-quote evidence tier in a
 * future pricing hierarchy — this module does not attempt to build that
 * hierarchy, only the smallest safe V1 rung of it.
 *
 * Field area is read exclusively from the authoritative `Field.areaHa`
 * (always derived from the farmer-drawn polygon at field-creation time —
 * `types.ts:196-202`, `field-boundary.ts:72` — never typed/guessed).
 * Missing, non-finite, non-positive, or unexpectedly-precise area values
 * (i.e. not genuinely rounded to `field-boundary.ts`'s own 2-decimal-place
 * boundary) all resolve to `{status: "unknown"}` via `units.ts`'s
 * `exactQuantityFromRoundedNumber` — never a fabricated/default area, and
 * never a `known_zero` cost for a field whose area could not actually be
 * established.
 */
import Decimal from "decimal.js";
import { createMoneyAmount, multiplyMoney, type CurrencyCode, type MoneyAmount } from "./money";
import { exactQuantityFromRoundedNumber } from "./units";
import type { RealisationCostInput } from "./slurry-direct-economic-assessment";
import type { Field } from "./types";

/** `field-boundary.ts:72`'s own rounding boundary for `Field.areaHa`
 * (`Math.round((areaM2 / 10_000) * 100) / 100`) — 2 decimal places. */
const FIELD_AREA_HA_MAX_DECIMAL_PLACES = 2;

export interface SlurryRealisationCostBenchmarkV1 {
  readonly benchmarkId: "SLURRY_REALISATION_COST_IE_V1";
  /** Exact canonical decimal string — never a JS `number` literal. */
  readonly value: string;
  readonly currency: CurrencyCode;
  readonly unit: "EUR_PER_HECTARE";
  readonly benchmarkYear: 2026;
  readonly sourceType: "FARM_RETURN_PILOT_BENCHMARK";
  readonly basis: "FCI_2026_CONTRACTOR_RATES_DERIVED";
  readonly methodBasis: "LESS_TRAILING_SHOE";
  readonly liveQuote: false;
  readonly farmerSpecific: false;
}

/** 2026 Farm Return pilot contractor-cost benchmark — €120/ha, LESS
 * trailing-shoe method, derived from 2026 Irish contractor-rate evidence
 * (FCI). Not a live quote, not farmer-specific. */
export const SLURRY_REALISATION_COST_IE_V1: SlurryRealisationCostBenchmarkV1 = {
  benchmarkId: "SLURRY_REALISATION_COST_IE_V1",
  value: "120",
  currency: "EUR",
  unit: "EUR_PER_HECTARE",
  benchmarkYear: 2026,
  sourceType: "FARM_RETURN_PILOT_BENCHMARK",
  basis: "FCI_2026_CONTRACTOR_RATES_DERIVED",
  methodBasis: "LESS_TRAILING_SHOE",
  liveQuote: false,
  farmerSpecific: false,
};

export type SlurryRealisationCostUnavailableReasonCode =
  | "SLURRY_REALISATION_COST_FIELD_AREA_UNAVAILABLE"
  | "SLURRY_REALISATION_COST_FIELD_AREA_NOT_POSITIVE";

/** Full reconstruction trail for one field's resolved (or unresolved)
 * realisation cost — a reviewer must be able to verify `fieldAreaHa ×
 * benchmark.value = amount` from this object alone, without reading
 * source code. */
export interface SlurryRealisationCostResolution {
  readonly fieldId: string;
  readonly input: RealisationCostInput;
  readonly benchmark: SlurryRealisationCostBenchmarkV1;
  /** Exact decimal string actually used, or `null` when unresolved. */
  readonly fieldAreaHa: string | null;
  /** Human-reconstructible expression, e.g. `"5 ha × €120/ha = €600"`, or
   * `null` when unresolved. */
  readonly calculationExpression: string | null;
  readonly reasonCode: SlurryRealisationCostUnavailableReasonCode | null;
}

function unresolved(fieldId: string, fieldAreaHa: string | null, reasonCode: SlurryRealisationCostUnavailableReasonCode): SlurryRealisationCostResolution {
  return {
    fieldId,
    input: { status: "unknown" },
    benchmark: SLURRY_REALISATION_COST_IE_V1,
    fieldAreaHa,
    calculationExpression: null,
    reasonCode,
  };
}

/**
 * Resolves the V1 pilot realisation-cost evidence for one field, from the
 * field's own authoritative `areaHa` only. Never accepts a caller-supplied
 * area — the whole point is to bind to Farm Return's one authoritative
 * field-area source, not a second, independently-trusted value.
 */
export function resolveSlurryRealisationCostV1(field: Pick<Field, "id" | "areaHa">): SlurryRealisationCostResolution {
  let areaExact: string;
  try {
    areaExact = exactQuantityFromRoundedNumber(field.areaHa, FIELD_AREA_HA_MAX_DECIMAL_PLACES, "field area (ha)");
  } catch {
    return unresolved(field.id, null, "SLURRY_REALISATION_COST_FIELD_AREA_UNAVAILABLE");
  }

  // Zero (or, defensively, any non-positive value `exactQuantityFromRoundedNumber`
  // did not already reject) is treated as unresolved area, not a known-zero
  // cost: a 0ha field cannot really be spread on, so "€0 to spread here" would
  // misrepresent a data problem as a confirmed favourable cost.
  if (new Decimal(areaExact).lessThanOrEqualTo(0)) {
    return unresolved(field.id, areaExact, "SLURRY_REALISATION_COST_FIELD_AREA_NOT_POSITIVE");
  }

  const rate: MoneyAmount = createMoneyAmount(SLURRY_REALISATION_COST_IE_V1.value, SLURRY_REALISATION_COST_IE_V1.currency);
  const amount = multiplyMoney(rate, areaExact);

  return {
    fieldId: field.id,
    input: { status: "quantified", amount },
    benchmark: SLURRY_REALISATION_COST_IE_V1,
    fieldAreaHa: areaExact,
    calculationExpression: `${areaExact} ha × €${SLURRY_REALISATION_COST_IE_V1.value}/ha = €${amount.amount}`,
    reasonCode: null,
  };
}
