/**
 * Cattle C10 — projected direct return of one animal's forward plan (an
 * isolated C10 capability, authorised 2026-10-20; definitions recorded in
 * `docs/evidence-register.md`, "Cattle C10 — animal plan definitions").
 *
 * Definitions (exact decimals, no rounding until display):
 *
 *   remainingDays, housedDays, outdoorDays — read from the ONE interval derivation
 *                              (`derivePlanIntervals`, plan-intervals.ts); never recomputed here
 *   forecastFeedCost         = remainingDays × (concentrateKgPerDay × concentratePricePerTonne ÷ 1000 + forageCostPerDay)
 *   forecastHousingCost      = housedDays × housingCostPerDay
 *   forecastDirectHoldingCost = forecastFeedCost + forecastHousingCost
 *   projectedSaleValue       = projectedWeightAtSale × scenario €/kg   (LOW / BASE / HIGH = observed low / central / high)
 *   projectedDirectProfit    = projectedSaleValue − recordedDirectCosts − forecastDirectHoldingCost
 *   currentSellNowMargin     = currentEstimatedMarketValue − recordedDirectCosts
 *   returnFromHolding        = projectedDirectProfit − currentSellNowMargin
 *   costPerKgNow             = recordedDirectCosts ÷ currentWeight
 *   costPerKgAtSale          = (recordedDirectCosts + forecastDirectHoldingCost) ÷ projectedWeightAtSale
 *                              (UNKNOWN unless the projected weight is positive; no non-finite result is ever KNOWN)
 *
 * "Direct" means: only the recorded animal cost entries (direct and explicitly
 * allocated) and the forecast feed / housing entered here. Labour, land,
 * finance, depreciation, general overhead and any unallocated shared cost are
 * NOT included — the result is never "profit".
 *
 * Projected weight is an INPUT: the C5 straight-line prediction at the sale
 * date. Feed and housing inputs change cost only; nothing here changes weight
 * (no feed-response model exists). The current estimated value is the
 * provider's central figure today; the scenario applies to the sale-time
 * price only. Every value that cannot be computed is UNKNOWN with reasons —
 * never zero.
 *
 * Unknown facts block the economics that depend on them; an explicit planning
 * assumption may enable a scenario, but never becomes a recorded fact. When the
 * animal's current housing isn't recorded, every housing-dependent figure
 * (`HOUSING_DEPENDENT_RESULTS`) is UNKNOWN (`CURRENT_HOUSING_UNKNOWN`) — it is
 * never read as "outdoors" — unless the farmer states an assumption, in which
 * case the result says it is assumption-based (`housing.basis: "ASSUMED"`) and
 * the observed state is reported unchanged (`housing.observed`, still UNKNOWN).
 */

import Decimal from "decimal.js";
import { costPerKgLiveweight, type AnimalCostRead } from "./cost-ledger";
import type { MartValuation } from "./mart-valuation";
import { derivePlanIntervals, type HousingAssumption, type HousingObservation, type PlanDateIssue, type PlanHousing, type PlanIntervals } from "./plan-intervals";

/** The only currency the plan computes in. */
export const PLAN_CURRENCY = "EUR";

export const MARKET_SCENARIOS = ["LOW", "BASE", "HIGH"] as const;
export type MarketScenario = (typeof MARKET_SCENARIOS)[number];

export interface AnimalPlanAssumptions {
  saleDate: string;
  /** Exact non-negative decimal strings; `null` = not entered (unknown, never zero). */
  concentrateKgPerDay: string | null;
  concentratePricePerTonne: string | null;
  forageCostPerDay: string | null;
  /** `null` = no housing planned before sale. */
  housingDate: string | null;
  housingCostPerDay: string | null;
  scenario: MarketScenario;
  /**
   * The farmer's planning assumption about where the animal is NOW. Used only when the observed
   * housing state is unknown (an observed state always wins); `null` = no assumption. A scenario
   * input kept with the plan inputs — never written back as a record.
   */
  assumedCurrentHousing: HousingAssumption | null;
}

/**
 * The animal's current weight, explicitly: the C4 latest KNOWN weight, or UNKNOWN with why
 * (no weight recorded, the latest weights disagree, the unit isn't supported, or the weights
 * couldn't be evaluated). Each reason stays its own (`CURRENT_WEIGHT_<reason>`).
 */
export type CurrentWeightRead = { state: "KNOWN"; kg: number } | { state: "UNKNOWN"; reason: "NOT_WEIGHED" | "WEIGHTS_DISAGREE" | "UNIT_NOT_SUPPORTED" | "WEIGHTS_UNAVAILABLE" };

export type WeightProjectionInput =
  | { state: "PROJECTED"; kg: number }
  /** C5 could not project (its reason state, verbatim) or the plan date is invalid. */
  | { state: "NOT_PROJECTED"; reason: string };

/** A C5 PROJECTED weight as C10 may use it: a live weight is positive and finite, anything else is no usable projection. */
export type ProjectedWeightAdmission = { state: "USABLE"; kg: number } | { state: "NOT_USABLE"; reason: "PROJECTION_NOT_POSITIVE" | "PROJECTION_INVALID" };

/**
 * The ONE admission of a C5 straight-line weight (C5 extrapolates without bounds, so a falling gain can
 * project zero or a negative weight). Every C10 reader — the plan economics, the profile projection and
 * the chart overlay — goes through this, so no surface shows a projection another refuses.
 */
export function admitProjectedWeight(kg: number): ProjectedWeightAdmission {
  if (!Number.isFinite(kg)) return { state: "NOT_USABLE", reason: "PROJECTION_INVALID" };
  return kg > 0 ? { state: "USABLE", kg } : { state: "NOT_USABLE", reason: "PROJECTION_NOT_POSITIVE" };
}

export interface AnimalPlanEconomicsInput {
  /** The viewpoint's calendar date (supplied, never a clock). */
  asOfDate: string;
  assumptions: AnimalPlanAssumptions;
  /** OBSERVED housing now (C1 location): KNOWN, or UNKNOWN with why — never read as outdoors. */
  currentHousing: HousingObservation;
  currentWeight: CurrentWeightRead;
  projection: WeightProjectionInput;
  /** The animal's cost summary, or UNAVAILABLE (never read as "none recorded"). */
  costs: AnimalCostRead;
  valuation: MartValuation;
}

export type Money = { state: "KNOWN"; amount: string } | { state: "UNKNOWN"; reasons: string[] };
export type Quantity = { state: "KNOWN"; value: string } | { state: "UNKNOWN"; reasons: string[] };

export type PlanInputIssue =
  | PlanDateIssue
  | "CONCENTRATE_QUANTITY_INVALID"
  | "CONCENTRATE_PRICE_INVALID"
  | "FORAGE_COST_INVALID"
  | "HOUSING_COST_INVALID";

export interface AnimalPlanEconomics {
  validity: { state: "VALID" } | { state: "INVALID"; issues: PlanInputIssue[] };
  /** The housing state the figures used: the observed one (echoed unchanged), or the farmer's assumption, or none. */
  housing: PlanHousing;
  /** The canonical intervals every day count here (and the plan timeline) comes from. */
  intervals: PlanIntervals;
  /** From `intervals` (`null` when the plan inputs are invalid or the split is unknown). */
  remainingDays: number | null;
  housedDays: number | null;
  outdoorDays: number | null;
  forecastFeedCost: Money;
  forecastHousingCost: Money;
  forecastDirectHoldingCost: Money;
  recordedDirectCosts: Money;
  totalDirectCostBySale: Money;
  scenario: MarketScenario;
  /** The scenario's sale price on the provider basis. */
  salePrice: Money;
  projectedWeightKg: Quantity;
  projectedAdditionalKg: Quantity;
  projectedSaleValue: Money;
  projectedDirectProfit: Money;
  currentEstimatedValue: Money;
  currentSellNowMargin: Money;
  returnFromHolding: Money;
  costPerKgNow: Money;
  costPerKgAtSale: Money;
  /** How far the valuation can be leaned on (drives restrained presentation). */
  valuationStanding: "LIVE_CURRENT" | "LIVE_STALE" | "FIXTURE" | "NONE";
}

/** Every result that depends on the animal's housing (assumption-based when `housing.basis` is ASSUMED). */
export const HOUSING_DEPENDENT_RESULTS = [
  "housedDays",
  "outdoorDays",
  "forecastHousingCost",
  "forecastDirectHoldingCost",
  "totalDirectCostBySale",
  "projectedDirectProfit",
  "returnFromHolding",
  "costPerKgAtSale",
] as const satisfies readonly (keyof AnimalPlanEconomics)[];

const NUMBER_RE = /^\d{1,7}(\.\d{1,4})?$/;

const unknown = (...reasons: string[]): Money => ({ state: "UNKNOWN", reasons: [...new Set(reasons)].sort() });
/** A non-finite result (an undefined division, an overflow) is never a known figure. */
const known = (d: Decimal): Money => (d.isFinite() ? { state: "KNOWN", amount: d.toFixed() } : unknown("RESULT_NOT_FINITE"));
const reasonsOf = (...ms: Money[]): string[] => ms.flatMap((m) => (m.state === "UNKNOWN" ? m.reasons : []));
const dec = (m: Money): Decimal | null => (m.state === "KNOWN" ? new Decimal(m.amount) : null);

/** Combine KNOWN values with `f`; UNKNOWN when any input is unknown (reasons merged). */
function combine(inputs: Money[], f: (values: Decimal[]) => Decimal): Money {
  const values = inputs.map(dec);
  if (values.some((v) => v === null)) return unknown(...reasonsOf(...inputs));
  return known(f(values as Decimal[]));
}

function readNumber(raw: string | null, issue: PlanInputIssue, missingReason: string, issues: PlanInputIssue[]): Money {
  if (raw === null) return unknown(missingReason);
  if (!NUMBER_RE.test(raw)) {
    issues.push(issue);
    return unknown("PLAN_INPUT_INVALID");
  }
  return known(new Decimal(raw));
}

export function computeAnimalPlanEconomics(input: AnimalPlanEconomicsInput): AnimalPlanEconomics {
  const a = input.assumptions;
  const issues: PlanInputIssue[] = [];

  // Dates and housing: the ONE interval derivation (observed housing wins; else the explicit assumption; else unknown — never "outdoors").
  const intervals = derivePlanIntervals({ asOfDate: input.asOfDate, saleDate: a.saleDate, housingDate: a.housingDate, observed: input.currentHousing, assumption: a.assumedCurrentHousing ?? null });
  const housing = intervals.housing;
  if (intervals.state === "INVALID") issues.push(...intervals.issues);
  const remainingDays = intervals.state === "VALID" ? intervals.totalDays : null;
  const housedDays = intervals.state === "VALID" && intervals.split.state === "KNOWN" ? intervals.split.housedDays : null;
  const outdoorDays = intervals.state === "VALID" && intervals.split.state === "KNOWN" ? intervals.split.outdoorDays : null;

  // Numbers.
  const concKg = readNumber(a.concentrateKgPerDay, "CONCENTRATE_QUANTITY_INVALID", "CONCENTRATE_QUANTITY_NOT_ENTERED", issues);
  const concPrice = readNumber(a.concentratePricePerTonne, "CONCENTRATE_PRICE_INVALID", "CONCENTRATE_PRICE_NOT_ENTERED", issues);
  const forage = readNumber(a.forageCostPerDay, "FORAGE_COST_INVALID", "FORAGE_COST_NOT_ENTERED", issues);
  const housingRate = readNumber(a.housingCostPerDay, "HOUSING_COST_INVALID", "HOUSING_COST_NOT_ENTERED", issues);

  const invalid = issues.length > 0;
  const days: Money = invalid || remainingDays === null ? unknown("PLAN_INPUT_INVALID") : known(new Decimal(remainingDays));
  const housed: Money = invalid ? unknown("PLAN_INPUT_INVALID") : housedDays === null ? unknown("CURRENT_HOUSING_UNKNOWN") : known(new Decimal(housedDays));

  const forecastFeedCost = combine([days, concKg, concPrice, forage], ([d, k, p, f]) => d.times(k.times(p).dividedBy(1000).plus(f)));
  const forecastHousingCost = housed.state === "KNOWN" && new Decimal(housed.amount).isZero() ? known(new Decimal(0)) : combine([housed, housingRate], ([h, r]) => h.times(r));
  const forecastDirectHoldingCost = combine([forecastFeedCost, forecastHousingCost], ([f, h]) => f.plus(h));

  // The plan is a euro model (€/tonne, €/day, €/kg prices): a cost total in any other currency is never mixed in — no exchange rate is sourced.
  const recordedDirectCosts: Money =
    input.costs.state === "RECORDED" && input.costs.total !== null
      ? input.costs.currency === PLAN_CURRENCY
        ? known(new Decimal(input.costs.total))
        : unknown("COSTS_NOT_IN_EURO")
      : unknown(
          input.costs.state === "UNAVAILABLE" ? "COSTS_UNAVAILABLE" : input.costs.state === "NONE_RECORDED" ? "NO_COSTS_RECORDED" : input.costs.state === "MIXED_CURRENCY" ? "COSTS_IN_MIXED_CURRENCY" : "COST_LEDGER_INVALID",
        );
  const totalDirectCostBySale = combine([recordedDirectCosts, forecastDirectHoldingCost], ([r, h]) => r.plus(h));

  // Valuation.
  const v = input.valuation;
  const priceKey = a.scenario === "LOW" ? "low" : a.scenario === "HIGH" ? "high" : "central";
  const salePrice: Money = v.price === null ? unknown(`VALUATION_${v.state}`) : known(new Decimal(v.price[priceKey]));
  const currentEstimatedValue: Money = v.state === "ESTIMATED" && v.estimate !== null ? known(new Decimal(v.estimate.central)) : unknown(`VALUATION_${v.state}`);

  const admitted = input.projection.state === "PROJECTED" ? admitProjectedWeight(input.projection.kg) : null;
  const projectedWeightKg: Quantity = invalid
    ? { state: "UNKNOWN", reasons: ["PLAN_INPUT_INVALID"] }
    : admitted?.state === "USABLE"
      ? { state: "KNOWN", value: new Decimal(admitted.kg).toFixed() }
      : { state: "UNKNOWN", reasons: [admitted !== null ? admitted.reason : input.projection.state === "NOT_PROJECTED" ? `PROJECTION_${input.projection.reason}` : "PROJECTION_INVALID"] };
  const projectedKg: Money = projectedWeightKg.state === "KNOWN" ? known(new Decimal(projectedWeightKg.value)) : unknown(...projectedWeightKg.reasons);
  const w = input.currentWeight;
  const currentKg: Money = w.state === "KNOWN" ? (Number.isFinite(w.kg) && w.kg > 0 ? known(new Decimal(w.kg)) : unknown("CURRENT_WEIGHT_INVALID")) : unknown(`CURRENT_WEIGHT_${w.reason}`);
  const additional = combine([projectedKg, currentKg], ([p, c]) => p.minus(c));
  const projectedAdditionalKg: Quantity = additional.state === "KNOWN" ? { state: "KNOWN", value: additional.amount } : additional;

  const projectedSaleValue: Money =
    v.basis === "EUR_PER_HEAD" ? unknown("PER_HEAD_PRICE_NOT_PROJECTABLE_TO_SALE_WEIGHT") : combine([projectedKg, salePrice], ([kg, p]) => kg.times(p));
  const projectedDirectProfit = combine([projectedSaleValue, recordedDirectCosts, forecastDirectHoldingCost], ([s, r, h]) => s.minus(r).minus(h));
  const currentSellNowMargin = combine([currentEstimatedValue, recordedDirectCosts], ([c, r]) => c.minus(r));
  const returnFromHolding = combine([projectedDirectProfit, currentSellNowMargin], ([p, n]) => p.minus(n));
  const perKgNow = recordedDirectCosts.state === "KNOWN" && input.costs.state !== "UNAVAILABLE" ? costPerKgLiveweight(input.costs, w.state === "KNOWN" ? w.kg : null) : null;
  const costPerKgNow: Money = perKgNow !== null ? known(new Decimal(perKgNow)) : unknown(...reasonsOf(recordedDirectCosts, currentKg));
  // Per kg only over a positive weight: a zero / negative denominator is undefined, never a figure.
  const costPerKgAtSale = projectedKg.state === "KNOWN" && !new Decimal(projectedKg.amount).isPositive() ? unknown("PROJECTION_NOT_POSITIVE") : combine([totalDirectCostBySale, projectedKg], ([t, kg]) => t.dividedBy(kg));

  const valuationStanding: AnimalPlanEconomics["valuationStanding"] =
    v.provider === null || v.state !== "ESTIMATED" ? "NONE" : !v.provider.isLive ? "FIXTURE" : v.freshness?.state === "STALE" ? "LIVE_STALE" : "LIVE_CURRENT";

  return {
    validity: invalid ? { state: "INVALID", issues: [...new Set(issues)] } : { state: "VALID" },
    housing,
    intervals,
    remainingDays: invalid ? null : remainingDays,
    housedDays: invalid ? null : housedDays,
    outdoorDays: invalid ? null : outdoorDays,
    forecastFeedCost,
    forecastHousingCost,
    forecastDirectHoldingCost,
    recordedDirectCosts,
    totalDirectCostBySale,
    scenario: a.scenario,
    salePrice,
    projectedWeightKg,
    projectedAdditionalKg,
    projectedSaleValue,
    projectedDirectProfit,
    currentEstimatedValue,
    currentSellNowMargin,
    returnFromHolding,
    costPerKgNow,
    costPerKgAtSale,
    valuationStanding,
  };
}
