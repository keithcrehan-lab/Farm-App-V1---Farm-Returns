/**
 * Cattle C10 — the ONE derivation of an animal plan's time intervals
 * (invariant C, DOMAIN_CONTRACTS.md "Cattle C10"). The plan's economics, its
 * timeline and every day count shown to the farmer read this result; nothing
 * else in C10 computes days to sale, housed days or days at grass.
 *
 * Semantics (whole UTC calendar days, `[from, to)` — the sale day itself is not held):
 *
 *   totalDays     = saleDate − asOfDate                    (sale must be after today)
 *   housed now    = the OBSERVED housing state when known; else the farmer's explicit
 *                   assumption; else UNKNOWN (never "outdoors")
 *   housed now    → one HOUSED phase [asOfDate, saleDate); a planned housing date is not used
 *   outdoors now  → no housing date: one OUTDOORS phase;
 *                   housing date H (today ≤ H < sale): OUTDOORS [asOfDate, H) then HOUSED [H, saleDate)
 *                   — housing today means housed for every remaining day (no outdoor phase)
 *   unknown now   → no split (UNKNOWN, `CURRENT_HOUSING_UNKNOWN`); the dates are still checked
 *
 * Date issues: an unreadable sale / housing date, a sale not after today, a
 * housing date before today, or a housing date on or after the sale date make
 * the intervals INVALID — no day count is produced.
 */

import { comparePlanDates, daysBetween, isPlanDate } from "./plan-dates";

/** The farmer's planning assumption about where the animal is NOW (scenario input, never a record). */
export type HousingAssumption = "OUTDOORS" | "HOUSED";

/** Where the plan's housing state came from. */
export type HousingBasis = "OBSERVED" | "ASSUMED" | "UNKNOWN";

/**
 * The OBSERVED housing state now (C1 location), explicitly: KNOWN, or UNKNOWN with why
 * (not recorded, records disagree, a record can't be read, or the record itself couldn't be read).
 */
export type HousingObservation =
  | { state: "KNOWN"; housed: boolean }
  | { state: "UNKNOWN"; reason: "NOT_RECORDED" | "RECORDS_DISAGREE" | "RECORD_INVALID" | "RECORD_UNAVAILABLE" };

export type PlanDateIssue = "SALE_DATE_INVALID" | "SALE_DATE_NOT_AFTER_TODAY" | "HOUSING_DATE_INVALID" | "HOUSING_DATE_AFTER_SALE_DATE" | "HOUSING_DATE_BEFORE_TODAY";

export interface PlanPhase {
  kind: "OUTDOORS" | "HOUSED";
  /** Inclusive start date. */
  from: string;
  /** Exclusive end date. */
  to: string;
  days: number;
}

export type HousingSplit =
  /** Non-empty phases in order; `housedDays + outdoorDays = totalDays`. */
  | { state: "KNOWN"; phases: PlanPhase[]; housedDays: number; outdoorDays: number; housedFrom: string | null }
  | { state: "UNKNOWN"; reason: "CURRENT_HOUSING_UNKNOWN" };

export interface PlanIntervalsInput {
  asOfDate: string;
  saleDate: string;
  /** `null` = no housing planned before sale. */
  housingDate: string | null;
  observed: HousingObservation;
  /** Used only when the observed state is UNKNOWN; `null` = no assumption. */
  assumption: HousingAssumption | null;
}

export type PlanIntervals =
  | { state: "INVALID"; issues: PlanDateIssue[]; housing: PlanHousing }
  | { state: "VALID"; housing: PlanHousing; start: string; sale: string; totalDays: number; split: HousingSplit };

export interface PlanHousing {
  /** The observed state, echoed unchanged (an assumption never overwrites it). */
  observed: HousingObservation;
  basis: HousingBasis;
  /** The assumption actually used (`null` when the observed state is known or none was given). */
  assumption: HousingAssumption | null;
  /** The housing state the plan uses now: observed, else assumed, else `null` (unknown). */
  housedNow: boolean | null;
}

export function planHousing(observed: HousingObservation, assumption: HousingAssumption | null): PlanHousing {
  if (observed.state === "KNOWN") return { observed, basis: "OBSERVED", assumption: null, housedNow: observed.housed };
  if (assumption !== null) return { observed, basis: "ASSUMED", assumption, housedNow: assumption === "HOUSED" };
  return { observed, basis: "UNKNOWN", assumption: null, housedNow: null };
}

export function derivePlanIntervals(input: PlanIntervalsInput): PlanIntervals {
  const housing = planHousing(input.observed, input.assumption);
  const issues: PlanDateIssue[] = [];
  const { asOfDate: today, saleDate: sale, housingDate: h } = input;
  const saleOk = isPlanDate(sale) && isPlanDate(today) && comparePlanDates(sale, today) > 0;
  if (!isPlanDate(sale)) issues.push("SALE_DATE_INVALID");
  else if (!saleOk) issues.push("SALE_DATE_NOT_AFTER_TODAY");
  // A planned housing date matters unless the animal is (observed or assumed) housed now.
  if (h !== null && housing.housedNow !== true) {
    if (!isPlanDate(h)) issues.push("HOUSING_DATE_INVALID");
    else if (saleOk && comparePlanDates(h, sale) >= 0) issues.push("HOUSING_DATE_AFTER_SALE_DATE");
    else if (saleOk && comparePlanDates(h, today) < 0) issues.push("HOUSING_DATE_BEFORE_TODAY");
  } else if (h !== null && !isPlanDate(h)) issues.push("HOUSING_DATE_INVALID");
  if (issues.length > 0) return { state: "INVALID", issues, housing };

  const totalDays = daysBetween(today, sale);
  const phase = (kind: PlanPhase["kind"], from: string, to: string): PlanPhase => ({ kind, from, to, days: daysBetween(from, to) });
  let split: HousingSplit;
  if (housing.housedNow === null) split = { state: "UNKNOWN", reason: "CURRENT_HOUSING_UNKNOWN" };
  else {
    const phases =
      housing.housedNow === true ? [phase("HOUSED", today, sale)] : h === null ? [phase("OUTDOORS", today, sale)] : [phase("OUTDOORS", today, h), phase("HOUSED", h, sale)].filter((p) => p.days > 0);
    const housedDays = phases.filter((p) => p.kind === "HOUSED").reduce((n, p) => n + p.days, 0);
    split = { state: "KNOWN", phases, housedDays, outdoorDays: totalDays - housedDays, housedFrom: phases.find((p) => p.kind === "HOUSED")?.from ?? null };
  }
  return { state: "VALID", housing, start: today, sale, totalDays, split };
}
