/**
 * Cattle C10 — projected direct return of one animal's forward plan (an
 * isolated C10 capability, authorised 2026-10-20; definitions recorded in
 * `docs/evidence-register.md`, "Cattle C10 — animal plan definitions").
 *
 * Definitions (exact decimals, no rounding until display):
 *
 *   remainingDays            = saleDate − asOfDate (whole calendar days)
 *   forecastFeedCost         = remainingDays × (concentrateKgPerDay × concentratePricePerTonne ÷ 1000 + forageCostPerDay)
 *   housedNow                = the OBSERVED housing state (C1 location) when known; else the farmer's
 *                              explicit `assumedCurrentHousing`; else UNKNOWN
 *   housedDays               = remainingDays if housedNow; days from housingDate to saleDate if not housed
 *                              now (0 when no housing date); UNKNOWN when housedNow is UNKNOWN
 *   forecastHousingCost      = housedDays × housingCostPerDay
 *   forecastDirectHoldingCost = forecastFeedCost + forecastHousingCost
 *   projectedSaleValue       = projectedWeightAtSale × scenario €/kg   (LOW / BASE / HIGH = observed low / central / high)
 *   projectedDirectProfit    = projectedSaleValue − recordedDirectCosts − forecastDirectHoldingCost
 *   currentSellNowMargin     = currentEstimatedMarketValue − recordedDirectCosts
 *   returnFromHolding        = projectedDirectProfit − currentSellNowMargin
 *   costPerKgNow             = recordedDirectCosts ÷ currentWeight
 *   costPerKgAtSale          = (recordedDirectCosts + forecastDirectHoldingCost) ÷ projectedWeightAtSale
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
 * the observed state is reported unchanged (`housing.observed: null`).
 */

import Decimal from "decimal.js";
import { costPerKgLiveweight, type AnimalCostRead } from "./cost-ledger";
import type { MartValuation } from "./mart-valuation";
import { comparePlanDates, daysBetween, isPlanDate } from "./plan-dates";

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

export type HousingAssumption = "OUTDOORS" | "HOUSED";

/** Where the plan's housing state came from. */
export type HousingBasis = "OBSERVED" | "ASSUMED" | "UNKNOWN";

export type WeightProjectionInput =
  | { state: "PROJECTED"; kg: number }
  /** C5 could not project (its reason state, verbatim) or the plan date is invalid. */
  | { state: "NOT_PROJECTED"; reason: string };

export interface AnimalPlanEconomicsInput {
  /** The viewpoint's calendar date (supplied, never a clock). */
  asOfDate: string;
  assumptions: AnimalPlanAssumptions;
  /** OBSERVED: C1 location says HOUSING now (`true`), somewhere else (`false`), or unknown (`null`). */
  currentlyHoused: boolean | null;
  /** C4 latest KNOWN weight, else `null`. */
  currentWeightKg: number | null;
  projection: WeightProjectionInput;
  /** The animal's cost summary, or UNAVAILABLE (never read as "none recorded"). */
  costs: AnimalCostRead;
  valuation: MartValuation;
}

export type Money = { state: "KNOWN"; amount: string } | { state: "UNKNOWN"; reasons: string[] };
export type Quantity = { state: "KNOWN"; value: string } | { state: "UNKNOWN"; reasons: string[] };

export type PlanInputIssue =
  | "SALE_DATE_INVALID"
  | "SALE_DATE_NOT_AFTER_TODAY"
  | "HOUSING_DATE_INVALID"
  | "HOUSING_DATE_AFTER_SALE_DATE"
  | "HOUSING_DATE_BEFORE_TODAY"
  | "CONCENTRATE_QUANTITY_INVALID"
  | "CONCENTRATE_PRICE_INVALID"
  | "FORAGE_COST_INVALID"
  | "HOUSING_COST_INVALID";

export interface AnimalPlanEconomics {
  validity: { state: "VALID" } | { state: "INVALID"; issues: PlanInputIssue[] };
  /** The housing state the figures used: the observed one (echoed unchanged), or the farmer's assumption, or none. */
  housing: { observed: boolean | null; basis: HousingBasis; assumption: HousingAssumption | null };
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

const known = (d: Decimal): Money => ({ state: "KNOWN", amount: d.toFixed() });
const unknown = (...reasons: string[]): Money => ({ state: "UNKNOWN", reasons: [...new Set(reasons)].sort() });
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

  // Dates.
  let remainingDays: number | null = null;
  if (!isPlanDate(a.saleDate)) issues.push("SALE_DATE_INVALID");
  else if (!isPlanDate(input.asOfDate) || comparePlanDates(a.saleDate, input.asOfDate) <= 0) issues.push("SALE_DATE_NOT_AFTER_TODAY");
  else remainingDays = daysBetween(input.asOfDate, a.saleDate);

  // Housing now: observed when known; else the farmer's explicit assumption; else unknown (never "outdoors").
  const observed = input.currentlyHoused;
  const assumption = observed === null ? (a.assumedCurrentHousing ?? null) : null;
  const housedNow: boolean | null = observed !== null ? observed : assumption === null ? null : assumption === "HOUSED";
  const housing: AnimalPlanEconomics["housing"] = { observed, basis: observed !== null ? "OBSERVED" : assumption !== null ? "ASSUMED" : "UNKNOWN", assumption };

  let housedDays: number | null = null;
  if (a.housingDate !== null && !isPlanDate(a.housingDate)) issues.push("HOUSING_DATE_INVALID");
  if (remainingDays !== null && housedNow === true) housedDays = remainingDays;
  else if (remainingDays !== null && a.housingDate !== null && isPlanDate(a.housingDate)) {
    if (comparePlanDates(a.housingDate, a.saleDate) >= 0) issues.push("HOUSING_DATE_AFTER_SALE_DATE");
    else if (comparePlanDates(a.housingDate, input.asOfDate) < 0) issues.push("HOUSING_DATE_BEFORE_TODAY");
    else if (housedNow === false) housedDays = daysBetween(a.housingDate, a.saleDate);
  } else if (remainingDays !== null && a.housingDate === null && housedNow === false) housedDays = 0;

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

  const projectedWeightKg: Quantity =
    invalid ? { state: "UNKNOWN", reasons: ["PLAN_INPUT_INVALID"] } : input.projection.state === "PROJECTED" && Number.isFinite(input.projection.kg) ? { state: "KNOWN", value: new Decimal(input.projection.kg).toFixed() } : { state: "UNKNOWN", reasons: [input.projection.state === "NOT_PROJECTED" ? `PROJECTION_${input.projection.reason}` : "PROJECTION_INVALID"] };
  const projectedKg: Money = projectedWeightKg.state === "KNOWN" ? known(new Decimal(projectedWeightKg.value)) : unknown(...projectedWeightKg.reasons);
  const currentKg: Money = input.currentWeightKg !== null && Number.isFinite(input.currentWeightKg) && input.currentWeightKg > 0 ? known(new Decimal(input.currentWeightKg)) : unknown("CURRENT_WEIGHT_UNKNOWN");
  const additional = combine([projectedKg, currentKg], ([p, c]) => p.minus(c));
  const projectedAdditionalKg: Quantity = additional.state === "KNOWN" ? { state: "KNOWN", value: additional.amount } : additional;

  const projectedSaleValue: Money =
    v.basis === "EUR_PER_HEAD" ? unknown("PER_HEAD_PRICE_NOT_PROJECTABLE_TO_SALE_WEIGHT") : combine([projectedKg, salePrice], ([kg, p]) => kg.times(p));
  const projectedDirectProfit = combine([projectedSaleValue, recordedDirectCosts, forecastDirectHoldingCost], ([s, r, h]) => s.minus(r).minus(h));
  const currentSellNowMargin = combine([currentEstimatedValue, recordedDirectCosts], ([c, r]) => c.minus(r));
  const returnFromHolding = combine([projectedDirectProfit, currentSellNowMargin], ([p, n]) => p.minus(n));
  const perKgNow = recordedDirectCosts.state === "KNOWN" && input.costs.state !== "UNAVAILABLE" ? costPerKgLiveweight(input.costs, input.currentWeightKg) : null;
  const costPerKgNow: Money = perKgNow !== null ? known(new Decimal(perKgNow)) : unknown(...reasonsOf(recordedDirectCosts, currentKg));
  const costPerKgAtSale = combine([totalDirectCostBySale, projectedKg], ([t, kg]) => t.dividedBy(kg));

  const valuationStanding: AnimalPlanEconomics["valuationStanding"] =
    v.provider === null || v.state !== "ESTIMATED" ? "NONE" : !v.provider.isLive ? "FIXTURE" : v.freshness?.state === "STALE" ? "LIVE_STALE" : "LIVE_CURRENT";

  return {
    validity: invalid ? { state: "INVALID", issues: [...new Set(issues)] } : { state: "VALID" },
    housing,
    remainingDays: invalid ? null : remainingDays,
    housedDays: invalid ? null : housedDays,
    outdoorDays: invalid || remainingDays === null || housedDays === null ? null : remainingDays - housedDays,
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
