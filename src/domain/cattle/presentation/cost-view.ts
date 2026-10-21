/**
 * Cattle C10 — the ONE reading of an animal's cost summary for display
 * (invariant A). Every cost surface (the profile metric, the cost section,
 * the plan) reads this: UNAVAILABLE, NONE_RECORDED, unreadable and non-euro
 * stay distinct, and a RECORDED view carries every total it shows, so no
 * component substitutes a fallback ("€0") for a missing figure.
 */

import { ANIMAL_COST_CATEGORIES, PLAN_CURRENCY, costPerKgLiveweight, type AnimalCostCategory, type AnimalCostRead } from "../../animal-plan";
import { UNAVAILABLE_DISPLAY, type DisplayState } from "./display-states";
import { details, type Details } from "./view-state";

export interface CostCategoryVM {
  category: AnimalCostCategory;
  label: string;
  /** KNOWN amount, or NONE_RECORDED for this category (never "€0"). */
  amount: { state: "KNOWN"; value: string; allocated: string | null; allAllocated: boolean } | { state: "NONE_RECORDED"; label: "None recorded" };
}

export type CostVM =
  | { state: "UNAVAILABLE"; display: DisplayState; text: string }
  | { state: "NONE_RECORDED"; display: DisplayState; text: string }
  | { state: "NOT_IN_EURO"; display: DisplayState; text: string; currency: string }
  | { state: "UNREADABLE"; display: DisplayState; text: string }
  | {
      state: "RECORDED";
      display: DisplayState;
      total: string;
      direct: string;
      allocated: string;
      entryCount: number;
      /** Every category, each KNOWN or NONE_RECORDED. */
      categories: Details<CostCategoryVM>;
      /** "Recorded entries only — nothing recorded for bedding, other." (direct vs allocated stated separately). */
      breakdownNote: string;
      /** Recorded cost ÷ the KNOWN current weight; `null` when the weight isn't known. */
      perKgLiveweight: string | null;
    };

const CATEGORY_LABEL: Readonly<Record<AnimalCostCategory, string>> = { FEED: "Feed", MEDICINE: "Medicine", VETERINARY: "Veterinary", BEDDING: "Bedding", OTHER: "Other" };

const NONE_RECORDED: DisplayState = { code: "COST:NONE_RECORDED", label: "No costs recorded", tone: "unknown", detail: "No direct costs are recorded for this animal yet. That isn't €0." };

function breakdownNote(categories: CostCategoryVM[]): string {
  const none = categories.filter((c) => c.amount.state === "NONE_RECORDED").map((c) => c.label.toLowerCase());
  return `Recorded entries only${none.length > 0 ? ` — nothing recorded for ${none.join(", ")}` : ""}. Labour, land, finance and overheads are not included. Demonstration figures.`;
}

export function costView(costs: AnimalCostRead, knownWeightKg: number | null): CostVM {
  if (costs.state === "UNAVAILABLE") return { state: "UNAVAILABLE", display: UNAVAILABLE_DISPLAY.COSTS, text: UNAVAILABLE_DISPLAY.COSTS.detail as string };
  if (costs.state === "NONE_RECORDED") {
    return { state: "NONE_RECORDED", display: NONE_RECORDED, text: "No direct costs are recorded for this animal. Until they are, its cost — and any projected direct profit — is unknown, not €0." };
  }
  if (costs.state === "MIXED_CURRENCY" || costs.state === "INVALID") {
    const mixed = costs.state === "MIXED_CURRENCY";
    return { state: "UNREADABLE", display: { code: `COST:${costs.state}`, label: mixed ? "Costs in mixed currencies" : "A cost record can't be read", tone: "review", detail: null }, text: `A cost record can't be read (${mixed ? "mixed currencies" : "invalid entry"}), so no total is shown.` };
  }
  const { total, direct, allocated, currency } = costs;
  if (total === null || direct === null || allocated === null || currency === null) {
    return { state: "UNREADABLE", display: { code: "COST:INVALID", label: "A cost record can't be read", tone: "review", detail: null }, text: "A cost record can't be read, so no total is shown." };
  }
  if (currency !== PLAN_CURRENCY) {
    return { state: "NOT_IN_EURO", currency, display: { code: "COST:NOT_IN_EURO", label: "Costs not in euro", tone: "review", detail: `Costs are recorded in ${currency}; no exchange rate is used, so no euro total is shown.` }, text: `Costs are recorded in ${currency}. No exchange rate is used, so no euro total is shown.` };
  }
  const byCat = new Map(costs.byCategory.map((c) => [c.category, c]));
  const categories: CostCategoryVM[] = ANIMAL_COST_CATEGORIES.map((category) => {
    const c = byCat.get(category);
    return {
      category,
      label: CATEGORY_LABEL[category],
      amount: c && c.amount !== null ? { state: "KNOWN", value: c.amount, allocated: c.allocatedAmount, allAllocated: c.directAmount === null && c.allocatedAmount !== null } : { state: "NONE_RECORDED", label: "None recorded" },
    };
  });
  return {
    state: "RECORDED",
    display: { code: "COST:RECORDED", label: "Recorded costs only", tone: "neutral", detail: `${costs.entryCount} recorded entr${costs.entryCount === 1 ? "y" : "ies"}; overheads not included.` },
    total,
    direct,
    allocated,
    entryCount: costs.entryCount,
    categories: details(categories),
    breakdownNote: breakdownNote(categories),
    perKgLiveweight: costPerKgLiveweight(costs, knownWeightKg),
  };
}
