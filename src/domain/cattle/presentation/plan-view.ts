/**
 * Cattle C10 — the Animal plan screen's view-model. The plan component holds
 * only form state (the farmer's draft) and asks this module for everything it
 * shows: it runs `computeAnimalPlanEconomics` (pure C10 domain, exact
 * decimals) on the sealed owner reads and turns each result into an explicit
 * cell — a KNOWN figure, or "Unknown — <why>" — with the assumption,
 * projection and fixture marks already decided. The component never reads a
 * Money / valuation / housing state itself (component boundary, `view-state.ts`).
 *
 * Truthfulness kept here:
 * - unknown housing blocks housing-dependent figures unless the farmer states
 *   an assumption; assumption-based figures carry "Assumed housing" and the
 *   record is never changed;
 * - projected weight is a C5 prediction and says so; feed never changes it;
 * - the market estimate names its provider status: a development fixture is
 *   never "live", and an estimate derived from a weight estimate says so;
 * - "projected direct profit" is exactly sale value − recorded costs −
 *   forecast feed and housing (direct costs only).
 */

import { HOUSING_DEPENDENT_RESULTS, computeAnimalPlanEconomics, isPlanDate, type AnimalCostRead, type AnimalPlanAssumptions, type AnimalPlanEconomics, type CurrentWeightRead, type HousingObservation, type HousingUnknownReason, type MartValuation, type Money } from "../../animal-plan";
import type { GoalRead } from "./animal-profile";
import type { AnimalProfileVM } from "./animal-profile";
import { formatAdg, formatDate, formatDayMonth, formatEuro, formatEuroPerKg, formatKg, formatSignedKg } from "./format";
import { canonicalNumberText } from "./numeric-input";
import { planTimeline, type PlanTimelineVM } from "./plan-timeline";
import { details, unseal, type Details, type SealedInput } from "./view-state";
import { saleWithdrawalNotice } from "./animal-profile";
import type { LatestWeightVM } from "./weight-view";

/** The owner reads the plan economics need. Sealed: a component passes them back here unread. */
export interface PlanInputs {
  asOfDate: string;
  currentWeight: CurrentWeightRead;
  currentHousing: HousingObservation;
  costs: AnimalCostRead;
  /** One valuation per mart id. */
  valuations: Readonly<Record<string, MartValuation>>;
}

/** The C5 projection to the chosen sale date (the server action's result). */
export type PlanProjectionRead =
  | { state: "PROJECTED"; saleDate: string; kg: number; adgKgPerDay: number; fromObservedAt: string; assumptions: string[] }
  | { state: "NOT_PROJECTED"; saleDate: string; reason: string };

export type PlanCellVM =
  | { state: "KNOWN"; text: string; sub: string | null; tone: "plain" | "projected" | "gain" | "loss" }
  | { state: "UNKNOWN"; text: string };

export interface PlanRowVM {
  key: string;
  label: string;
  hint: string | null;
  value: PlanCellVM;
  /** The figure rests on the farmer's housing assumption, not a record. */
  assumed: boolean;
}

export type PlanMarketVM =
  | {
      state: "ESTIMATED";
      central: string;
      source: string;
      freshness: { stale: boolean; text: string };
      range: string;
      priceRange: string;
      comparedWith: string;
      basis: string;
      /** "Live data" only for a live provider; a fixture always says it isn't live. */
      status: string;
      /** Set when the estimate is derived from a weight that is itself an estimate. */
      weightBasisNote: string | null;
    }
  | { state: "NO_ESTIMATE"; text: string };

export interface PlanScreenVM {
  titleDate: string;
  returnHeading: string;
  headline: { value: PlanCellVM; large: boolean; assumed: boolean; summary: string; footnote: string };
  /** Plan input problems, each a farmer sentence (save is blocked while any exist). */
  issues: Details<string>;
  withdrawalNotice: { state: "NOTICE"; tone: "risk" | "unknown"; text: string } | { state: "NONE" };
  timeline: PlanTimelineVM;
  housing: {
    /** Why housing figures are blocked or assumption-based (`null` when the record says). */
    note: string | null;
    /** The assumption control is offered only when the record doesn't establish housing now. */
    assumptionControl: boolean;
    /** Housed now (recorded or assumed): no housing date to plan; otherwise the date field. */
    now: { state: "HOUSED_NOW"; text: string } | { state: "PLAN_HOUSING_DATE" };
  };
  /** The current weight's provenance where it isn't a weighing (e.g. a tape estimate). */
  currentWeightNote: string | null;
  rows: Details<PlanRowVM>;
  market: PlanMarketVM;
  saveBlocked: boolean;
}

const ISSUE_TEXT: Readonly<Record<string, string>> = {
  SALE_DATE_INVALID: "Choose a real sale date.",
  SALE_DATE_NOT_AFTER_TODAY: "The sale date has to be after today.",
  HOUSING_DATE_INVALID: "Choose a real housing date.",
  HOUSING_DATE_AFTER_SALE_DATE: "The housing date is on or after the sale date — move one of them.",
  HOUSING_DATE_BEFORE_TODAY: "The housing date is in the past — choose today or later.",
  CONCENTRATE_QUANTITY_INVALID: "Concentrate per day must be a number of kilograms (0 or more).",
  CONCENTRATE_PRICE_INVALID: "Concentrate price must be a number of euro per tonne.",
  FORAGE_COST_INVALID: "Forage / grazing cost must be a number of euro per day.",
  HOUSING_COST_INVALID: "Housing cost must be a number of euro per day.",
};

const REASON_TEXT: Readonly<Record<string, string>> = {
  NO_COSTS_RECORDED: "no costs recorded yet",
  COSTS_NOT_IN_EURO: "costs aren't recorded in euro (no exchange rate is used)",
  COSTS_IN_MIXED_CURRENCY: "costs are in mixed currencies",
  CONCENTRATE_QUANTITY_NOT_ENTERED: "concentrate per day not entered",
  CONCENTRATE_PRICE_NOT_ENTERED: "concentrate price not entered",
  FORAGE_COST_NOT_ENTERED: "forage cost not entered",
  HOUSING_COST_NOT_ENTERED: "housing cost not entered",
  CURRENT_HOUSING_UNKNOWN: "the animal's current housing status isn't known",
  COSTS_UNAVAILABLE: "the cost records couldn't be read",
  CURRENT_WEIGHT_NOT_WEIGHED: "no weight recorded yet",
  CURRENT_WEIGHT_WEIGHTS_DISAGREE: "current weight couldn't be determined — records disagree",
  CURRENT_WEIGHT_UNIT_NOT_SUPPORTED: "current weight is in a unit that can't be converted",
  CURRENT_WEIGHT_WEIGHTS_UNAVAILABLE: "current weight couldn't be checked",
  CURRENT_WEIGHT_INVALID: "current weight can't be used",
  PLAN_INPUT_INVALID: "fix the plan inputs",
  PER_HEAD_PRICE_NOT_PROJECTABLE_TO_SALE_WEIGHT: "a per-head price can't be moved to a new weight",
  PROJECTION_PENDING: "projecting…",
  // Each projection reason keeps its own meaning (C5 derivation states and the C10 service's refusals).
  PROJECTION_INSUFFICIENT_EVIDENCE: "no weight projection (needs two usable weights)",
  PROJECTION_EVIDENCE_CONFLICT: "no weight projection (recent weights disagree)",
  PROJECTION_UNSUPPORTED: "no weight projection (weights can't be used for gain)",
  PROJECTION_INVALID: "no weight projection (a weight record is invalid)",
  PROJECTION_NOT_POSITIVE: "no usable weight projection (the projected weight is zero or less)",
  PROJECTION_WEIGHTS_INVALID: "no weight projection (a weight record couldn't be read)",
  PROJECTION_PERFORMANCE_INVALID: "no weight projection (performance couldn't be worked out)",
  PROJECTION_SALE_DATE_NOT_AFTER_TODAY: "the sale date must be after today",
  PROJECTION_UNKNOWN_ANIMAL: "animal not found",
  PROJECTION_NO_PREDICTION: "no weight projection",
  PROJECTION_REQUEST_FAILED: "the projection couldn't be loaded",
  RESULT_NOT_FINITE: "can't be worked out from these figures",
  GOAL_UNAVAILABLE: "the goal records couldn't be read",
  GOAL_UNRESOLVED: "the goal records disagree or can't be read",
};

const VALUATION_REASON_TEXT: Readonly<Record<string, string>> = {
  NO_COMPARABLE_WEIGHT_BAND: "no comparable weight band in the report",
  MART_VALUATION_NEEDS_KNOWN_LIVEWEIGHT: "the animal's current weight is unknown",
  ANIMAL_SEX_UNKNOWN: "the animal's sex isn't known",
  ANIMAL_RECORD_UNAVAILABLE: "the animal's record couldn't be read",
  WEIGHT_NEEDED_TO_CHOOSE_CATEGORY: "a current weight is needed to choose the category",
};

/** Why the observed housing is unknown, as the end of "the animal's current housing status …". */
export const HOUSING_UNKNOWN_TEXT: Readonly<Record<HousingUnknownReason, string>> = {
  NOT_RECORDED: "isn't recorded",
  RECORDS_DISAGREE: "couldn't be determined — the location records disagree",
  RECORD_INVALID: "can't be read from its location record",
  RECORD_UNAVAILABLE: "couldn't be checked — the animal's record couldn't be read",
  LOCATION_NOT_SPECIFIC: "isn't shown by its recorded location — a holding, off-farm or other location doesn't say whether it's housed",
};

const HOUSING_DEPENDENT: ReadonlySet<string> = new Set(HOUSING_DEPENDENT_RESULTS);

function reasonText(codes: readonly string[]): string {
  return codes
    .map((c) => REASON_TEXT[c] ?? (c.startsWith("PROJECTION_") ? "no weight projection" : c.startsWith("VALUATION_") ? "no market estimate" : c.toLowerCase().replace(/_/g, " ")))
    .filter((v, i, a) => a.indexOf(v) === i)
    .join("; ");
}

const unknownCell = (reasons: readonly string[]): PlanCellVM => ({ state: "UNKNOWN", text: `Unknown — ${reasonText(reasons)}` });

function moneyCell(m: Money, o: { signed?: boolean; perKg?: boolean; tone?: "plain" | "gain-loss" } = {}): PlanCellVM {
  if (m.state === "UNKNOWN") return unknownCell(m.reasons);
  const text = o.perKg ? formatEuroPerKg(m.amount) : formatEuro(m.amount, { signed: o.signed });
  return { state: "KNOWN", text, sub: null, tone: o.tone === "gain-loss" ? (Number(m.amount) >= 0 ? "gain" : "loss") : "plain" };
}

/** Is the goal-weight text a usable target (empty = none)? Input validation only. */
export function isTargetWeightText(text: string): boolean {
  return text === "" || (Number.isFinite(Number(text)) && Number(text) > 0 && Number(text) <= 2000);
}

/** The goal-weight field's starting text: the active goal's exact target, else empty (never a rounded figure). */
export function planTargetText(goal: GoalRead): string {
  const exact = goal.state === "ACTIVE" && goal.targetWeight.state === "KNOWN" ? canonicalNumberText(goal.targetWeight.kg) : null;
  return exact === null ? "" : exact;
}

/** What saving the plan declares, given the current goal (an unresolved goal is said to be unresolved — never "no goal"). */
export function planSaveIntent(goal: GoalRead, tag: string): { goalType: "SALE" | "FINISHING"; change: string | null } {
  const goalType = goal.state === "ACTIVE" && goal.goalType === "SALE" ? "SALE" : "FINISHING";
  const change =
    goal.state === "UNRESOLVED"
      ? `${tag}'s current goal couldn't be determined (${goal.display.label.toLowerCase()}). Saving declares a finishing goal with this date and weight.`
      : goal.state === "NONE"
        ? `Saving declares a finishing goal for ${tag}.`
        : [
            ...(goal.goalType !== goalType ? [`Saving changes ${tag}'s goal from ${goal.typeLabel.toLowerCase()} to finishing.`] : []),
            ...(goal.targetWeight.state === "UNRESOLVED" ? [`${tag}'s recorded goal target (${goal.targetWeight.recorded}) can't be converted to kg, so it isn't filled in above; saving replaces it with the target weight entered here.`] : []),
          ].join(" ") || null;
  return { goalType, change };
}

/** The plan's starting sale-date sentence. */
export function saleDateSourceText(source: "GOAL" | "NO_GOAL_DATE" | "GOAL_UNRESOLVED"): string {
  return source === "GOAL"
    ? "Sale date starts from the declared goal."
    : source === "GOAL_UNRESOLVED"
      ? "The goal couldn't be determined, so the sale date is a starting suggestion."
      : "No goal date is declared; the sale date is a starting suggestion.";
}

/** The current weight's provenance where the plan leans on a value that wasn't weighed. */
export function currentWeightNote(w: LatestWeightVM): string | null {
  if (w.state !== "KNOWN" || w.basis.kind === "MEASURED") return null;
  return `Current weight ${formatKg(w.kg)} is a ${w.basis.methodLabel.toLowerCase()} (${formatDayMonth(w.observedAt)}), not a weighing — figures that use it rest on that.`;
}

function marketOf(valuation: MartValuation | undefined, weight: LatestWeightVM): PlanMarketVM {
  if (valuation === undefined) return { state: "NO_ESTIMATE", text: "No estimate from this mart: the provider is unavailable. Values that depend on it stay unknown." };
  const v = valuation;
  if (v.state !== "ESTIMATED" || v.estimate === null || v.price === null || v.mart === null || v.provider === null) {
    const why = v.reasons.length > 0 ? v.reasons.map((r) => VALUATION_REASON_TEXT[r] ?? r.toLowerCase().replace(/_/g, " ")).join("; ") : "the provider gave no reason";
    return { state: "NO_ESTIMATE", text: `No estimate from this mart: ${why}. Values that depend on it stay unknown.` };
  }
  const derived = v.basis === "EUR_PER_KG_LIVEWEIGHT";
  return {
    state: "ESTIMATED",
    central: formatEuro(v.estimate.central),
    source: `${v.mart.martName}${v.reportDate ? ` · ${formatDayMonth(v.reportDate)}` : ""}`,
    freshness: v.freshness === null ? { stale: false, text: "Report age unknown" } : v.freshness.state === "STALE" ? { stale: true, text: `Old report — ${v.freshness.ageDays} days` } : { stale: false, text: `${v.freshness.ageDays} days old` },
    range: `${formatEuro(v.estimate.low)} – ${formatEuro(v.estimate.high)}`,
    priceRange: `(${formatEuroPerKg(v.price.low)} – ${formatEuroPerKg(v.price.high)})`,
    comparedWith: `${v.category?.label ?? "Category not named"}${v.sampleSize ? ` · ${v.sampleSize} sold` : ""}`,
    basis: `${derived ? "€/kg liveweight × current weight (derived, not observed for this animal)" : "€/head as reported"} · central figure: ${v.centralDerivation === "OBSERVED_AVERAGE" ? "observed average" : v.centralDerivation === "OBSERVED_MEDIAN" ? "observed median" : "midpoint"}`,
    status: v.provider.isLive ? "Live data" : "Development fixture — not live, not a real mart report",
    weightBasisNote: derived && weight.state === "KNOWN" && weight.basis.kind !== "MEASURED" ? `Uses the current weight, which is a ${weight.basis.methodLabel.toLowerCase()} — not a weighing.` : null,
  };
}

export interface PlanScreenInput {
  inputs: SealedInput<PlanInputs>;
  assumptions: AnimalPlanAssumptions;
  martId: string;
  /** `undefined` while the projection request is in flight. */
  projection: PlanProjectionRead | undefined;
  profile: Pick<AnimalProfileVM, "goal" | "health" | "weight" | "identity">;
}

export function planScreenView({ inputs: sealed, assumptions: a, martId, projection, profile }: PlanScreenInput): PlanScreenVM {
  const inputs = unseal(sealed);
  const valuation = inputs.valuations[martId];
  const e: AnimalPlanEconomics = computeAnimalPlanEconomics({
    asOfDate: inputs.asOfDate,
    assumptions: a,
    currentHousing: inputs.currentHousing,
    currentWeight: inputs.currentWeight,
    projection: projection === undefined ? { state: "NOT_PROJECTED", reason: "PENDING" } : projection.state === "PROJECTED" ? { state: "PROJECTED", kg: projection.kg } : { state: "NOT_PROJECTED", reason: projection.reason },
    costs: inputs.costs,
    valuation: valuation ?? { state: "UNAVAILABLE", provider: null, mart: null, reportDate: null, freshness: null, category: null, basis: null, centralDerivation: null, sampleSize: null, quality: null, price: null, estimate: null, estimateDerivation: null, liveweightKg: null, reasons: ["PROVIDER_UNAVAILABLE"] },
  });
  const assumed = (field: keyof AnimalPlanEconomics) => e.housing.basis === "ASSUMED" && HOUSING_DEPENDENT.has(field);
  const ret = e.returnFromHolding;
  const live = e.valuationStanding === "LIVE_CURRENT";
  const fixture = e.valuationStanding === "FIXTURE";
  const goal = profile.goal.read;

  const projectedWeight: PlanCellVM =
    e.projectedWeightKg.state === "KNOWN"
      ? { state: "KNOWN", text: formatKg(Number(e.projectedWeightKg.value)), sub: e.projectedAdditionalKg.state === "KNOWN" ? formatSignedKg(Number(e.projectedAdditionalKg.value)) : null, tone: "projected" }
      : unknownCell(projection === undefined ? ["PROJECTION_PENDING"] : e.projectedWeightKg.reasons);
  const row = (key: keyof AnimalPlanEconomics | string, label: string, value: PlanCellVM, hint: string | null = null): PlanRowVM => ({ key, label, hint, value, assumed: assumed(key as keyof AnimalPlanEconomics) });
  const rows: PlanRowVM[] = [
    row("projectedWeightKg", "Projected weight at sale", projectedWeight, projection?.state === "PROJECTED" ? `Prediction: recent ${formatAdg(projection.adgKgPerDay)} continued from ${formatDayMonth(projection.fromObservedAt)}` : null),
    ...(goal.state === "ACTIVE" && goal.targetWeight.state === "KNOWN"
      ? [row("goalWeight", "Goal weight", { state: "KNOWN", text: formatKg(goal.targetWeight.kg), sub: null, tone: "plain" })]
      : goal.state === "UNRESOLVED" || (goal.state === "ACTIVE" && goal.targetWeight.state === "UNRESOLVED")
        ? [row("goalWeight", "Goal weight", unknownCell([goal.state === "UNRESOLVED" && goal.display.code === "EVALUATION:UNAVAILABLE" ? "GOAL_UNAVAILABLE" : "GOAL_UNRESOLVED"]))]
        : []),
    row("currentEstimatedValue", "Estimated value now", moneyCell(e.currentEstimatedValue), valuation?.state === "ESTIMATED" && valuation.estimate ? `Range ${formatEuro(valuation.estimate.low)} – ${formatEuro(valuation.estimate.high)}` : null),
    row("projectedSaleValue", "Projected sale value", moneyCell(e.projectedSaleValue), e.salePrice.state === "KNOWN" ? `${formatEuroPerKg(e.salePrice.amount)} × projected weight` : null),
    row("recordedDirectCosts", "Recorded direct costs to date", moneyCell(e.recordedDirectCosts), inputs.costs.state === "RECORDED" ? `${inputs.costs.entryCount} entr${inputs.costs.entryCount === 1 ? "y" : "ies"}, incl. allocated` : null),
    row("forecastFeedCost", "Forecast feed to sale", moneyCell(e.forecastFeedCost), e.remainingDays !== null ? `${e.remainingDays} days` : null),
    row("forecastHousingCost", "Forecast housing to sale", moneyCell(e.forecastHousingCost), e.housedDays !== null ? `${e.housedDays} housed days` : null),
    row("totalDirectCostBySale", "Total direct cost by sale", moneyCell(e.totalDirectCostBySale)),
    row("costPerKgNow", "Cost per kg liveweight now", moneyCell(e.costPerKgNow, { perKg: true })),
    row("costPerKgAtSale", "Cost per kg liveweight at sale", moneyCell(e.costPerKgAtSale, { perKg: true })),
    row("projectedDirectProfit", "Projected direct profit at sale", moneyCell(e.projectedDirectProfit), "Sale value − recorded costs − forecast costs"),
    row("currentSellNowMargin", "Sell-now margin", moneyCell(e.currentSellNowMargin), "Value now − recorded costs"),
    row("returnFromHolding", "Return from holding", moneyCell(ret, { signed: true }), "Projected direct profit − sell-now margin"),
  ];

  const h = e.housing;
  const note =
    h.basis === "OBSERVED"
      ? null
      : h.basis === "UNKNOWN" && h.observed.state === "UNKNOWN"
        ? `Can't calculate housing costs yet — the animal's current housing status ${HOUSING_UNKNOWN_TEXT[h.observed.reason]}. Choose an assumption for this plan to see a scenario.`
        : `The animal's current housing status ${h.observed.state === "UNKNOWN" ? HOUSING_UNKNOWN_TEXT[h.observed.reason] : "isn't recorded"}. Housing figures below use your assumption — the record isn't changed.`;
  const notice = saleWithdrawalNotice(profile.health.withdrawal, a.saleDate);
  const issues = e.validity.state === "INVALID" ? e.validity.issues.map((i) => ISSUE_TEXT[i] ?? i) : [];
  return {
    titleDate: isPlanDate(a.saleDate) ? formatDate(a.saleDate) : "—",
    returnHeading: `Return from holding to ${isPlanDate(a.saleDate) ? formatDayMonth(a.saleDate) : "sale"}`,
    headline: {
      // Gain / loss colour only for a live, current valuation: a fixture or stale figure stays restrained.
      value: ret.state === "KNOWN" ? moneyCell(ret, { signed: true, tone: live ? "gain-loss" : "plain" }) : moneyCell(ret),
      large: ret.state === "KNOWN",
      assumed: assumed("returnFromHolding"),
      summary:
        e.projectedDirectProfit.state === "KNOWN" && e.currentSellNowMargin.state === "KNOWN"
          ? `Projected direct profit ${formatEuro(e.projectedDirectProfit.amount)} at sale, against ${formatEuro(e.currentSellNowMargin.amount)} if sold now.`
          : "Projected direct profit and the sell-now margin need every input below.",
      footnote: `${fixture ? "Based on development fixture prices — not a market quote. " : ""}Direct costs only: labour, land, finance and overheads aren't included. A projection, not a guarantee.`,
    },
    issues: details(issues),
    withdrawalNotice: notice === null ? { state: "NONE" } : { state: "NOTICE", ...notice },
    timeline: planTimeline(e.intervals),
    housing: {
      note,
      assumptionControl: h.basis !== "OBSERVED",
      now:
        h.housedNow === true
          ? { state: "HOUSED_NOW", text: h.basis === "OBSERVED" ? `Recorded as housed now (${profile.identity.location.value ?? "location unnamed"}), so housing costs run every day to sale.` : "Assumed housed now, so housing costs run every day to sale." }
          : { state: "PLAN_HOUSING_DATE" },
    },
    currentWeightNote: currentWeightNote(profile.weight),
    rows: details(rows),
    market: marketOf(valuation, profile.weight),
    saveBlocked: issues.length > 0,
  };
}
