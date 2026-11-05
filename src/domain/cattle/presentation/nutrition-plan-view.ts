/**
 * Goal-first nutrition plan — presentation over `buildCattleNutritionPlan`
 * (`src/domain/cattle-nutrition-plan.ts`). The group workspace calls this on
 * every keystroke so the required ADG and the recommended feeding plan are
 * live; every farmer-facing word, unit and state is decided here, never in
 * the component (component-boundary rules R1–R7).
 *
 * No calculation lives here: the draft is parsed, the existing plan metrics
 * and nutrition engine are called, and the result is formatted.
 */

import {
  deriveCattleGroupProductionPlanMetrics,
  type CattleGroupProductionPlan,
} from "@/domain/cattle-group-production-plan";
import {
  buildCattleNutritionPlan,
  FEEDING_SITUATION_LABEL,
  feedingSituationFor,
  NUTRITION_INPUT_LABEL,
  PUBLISHED_SILAGE_DMD_ROWS,
  silageColumnsFor,
  silageQualityOf,
  type CattleNutritionPlan,
  type FeedingSituation,
  type SilageQuality,
} from "@/domain/cattle-nutrition-plan";
import { BEEF_CONCENTRATE_ITEM_ID, INPUT_MARKET_CATALOGUE } from "@/domain/inputs-market";
import type { LivestockCategory, LivestockGoal } from "@/domain/types";
import type { SilageQualityBasis } from "@/domain/cattle-group-production-plan";
import type { DisplayState } from "./display-states";
import type { MetricVM } from "./animal-profile";
import { formatAdgNumber, formatDate, formatEuro, formatEuroPerKg, formatEuroPrecise, formatFeedQuantity, formatFeedRate, formatKgNumber } from "./format";
import { NUMERIC_FIELDS, parseNumericInput } from "./numeric-input";
import { details, seal, unseal, type Details, type SealedInput } from "./view-state";

export const INPUTS_MARKET_FEED_HREF = "/inputs-market?category=feed";

// ---------------------------------------------------------------------------
// Context & draft
// ---------------------------------------------------------------------------

export type GroupNutritionContext =
  | {
      state: "OK";
      category: LivestockCategory;
      goal?: LivestockGoal;
      system?: "grazing" | "housed";
      headCount?: number;
      averageWeightKg?: number;
      plan?: CattleGroupProductionPlan;
    }
  | { state: "UNAVAILABLE" };

export function sealGroupNutritionContext(context: GroupNutritionContext): SealedInput<GroupNutritionContext> {
  return seal(context);
}

/** The group goal's farmer-facing labels (the goal is owned by the group record; the editor sets it). */
export const LIVESTOCK_GOAL_LABEL: Readonly<Record<LivestockGoal, string>> = {
  finish_slaughter: "Finish to slaughter",
  sell_store: "Sell as store",
  grow: "Grow",
  maintain: "Maintain",
  breed: "Breed",
};

const GOAL_VALUES = Object.keys(LIVESTOCK_GOAL_LABEL) as LivestockGoal[];
const isGoal = (v: string): v is LivestockGoal => (GOAL_VALUES as string[]).includes(v);

/** The goal-first form, as typed. */
export interface NutritionDraft {
  /** The group goal ("" = not chosen). */
  goal: string;
  targetKg: string;
  targetDate: string;
  feedingSituation: string;
  silageBasis: string;
  silageDmd: string;
  silageCp: string;
  silageDate: string;
  scenarioDmd: string;
  overrideConcentrateKg: string;
  overridePriceEurT: string;
  notes: string;
}

const str = (n: number | undefined): string => (n === undefined ? "" : String(n));

export function nutritionDraftOf(sealed: SealedInput<GroupNutritionContext>): NutritionDraft {
  const c = unseal(sealed);
  const p = c.state === "OK" ? c.plan : undefined;
  const lab = p?.silageQualityBasis === "lab_analysis";
  return {
    goal: c.state === "OK" && c.goal ? c.goal : "",
    targetKg: str(p?.targetWeightKg),
    targetDate: p?.targetDate ?? "",
    feedingSituation: p?.feedingSituation ?? "",
    silageBasis: p?.silageQualityBasis ?? "",
    silageDmd: lab ? str(p?.silageDmdPct) : "",
    silageCp: lab ? str(p?.silageCpPct) : "",
    silageDate: lab ? p?.silageAnalysisDate ?? "" : "",
    scenarioDmd: p?.silageQualityBasis === "planning_scenario" ? str(p?.silageDmdPct) : "",
    overrideConcentrateKg: str(p?.concentrateKgHeadDay),
    overridePriceEurT: str(p?.concentratePriceEurT),
    notes: p?.notes ?? "",
  };
}

function num(text: string, spec: (typeof NUMERIC_FIELDS)[keyof typeof NUMERIC_FIELDS]): { value: number | null; valid: boolean } {
  const r = parseNumericInput(text, spec);
  if (r.state === "EMPTY") return { value: null, valid: true };
  if (r.state === "INVALID") return { value: null, valid: false };
  return { value: Number(r.canonical), valid: true };
}

const FEEDING_VALUES = Object.keys(FEEDING_SITUATION_LABEL) as FeedingSituation[];
const isFeeding = (v: string): v is FeedingSituation => (FEEDING_VALUES as string[]).includes(v);

function draftSilage(d: NutritionDraft): SilageQuality {
  return silageQualityOf(draftSilageColumns(d));
}

function draftSilageColumns(d: NutritionDraft) {
  const basis: SilageQualityBasis | null = d.silageBasis === "lab_analysis" || d.silageBasis === "planning_scenario" ? d.silageBasis : null;
  if (basis === "planning_scenario") return { silageQualityBasis: basis, silageDmdPct: num(d.scenarioDmd, NUMERIC_FIELDS.PLAN_AMOUNT).value };
  if (basis === "lab_analysis") {
    return {
      silageQualityBasis: basis,
      silageDmdPct: num(d.silageDmd, NUMERIC_FIELDS.PLAN_AMOUNT).value,
      silageCpPct: num(d.silageCp, NUMERIC_FIELDS.PLAN_AMOUNT).value,
      silageAnalysisDate: d.silageDate.trim() === "" ? null : d.silageDate.trim(),
    };
  }
  return { silageQualityBasis: null };
}

export interface NutritionSaveInput {
  /** The group goal; `null` = not chosen (cleared). */
  goal: LivestockGoal | null;
  targetKg: number | null;
  targetDate: string | null;
  feedingSituation: FeedingSituation | null;
  silageQualityBasis: SilageQualityBasis | null;
  silageDmdPct?: number | null;
  silageCpPct?: number | null;
  silageAnalysisDate?: string | null;
  concentrateKgHeadDay: number | null;
  concentratePriceEurT: number | null;
  notes: string | null;
}

const SAVE_MESSAGES: Record<string, string> = {
  NUMBERS: "Check the production-plan numbers before saving.",
  SILAGE_SCENARIO_DMD_INVALID: "Choose a planning-scenario DMD from the published rows.",
  SILAGE_DMD_INVALID: "Enter the lab DMD as a percentage.",
  SILAGE_CP_INVALID: "Enter the lab crude protein as a percentage.",
  SILAGE_ANALYSIS_DATE_INVALID: "Enter the date on the silage lab report (not in the future).",
};

/** The save payload, or the farmer-facing reason it can't be saved. */
export function nutritionDraftToSaveInput(d: NutritionDraft, asOfDate: string): { ok: true; input: NutritionSaveInput } | { ok: false; message: string } {
  const target = num(d.targetKg, NUMERIC_FIELDS.TARGET_KG);
  const kg = num(d.overrideConcentrateKg, NUMERIC_FIELDS.PLAN_AMOUNT);
  const price = num(d.overridePriceEurT, NUMERIC_FIELDS.PLAN_AMOUNT);
  if (![target, kg, price].every((r) => r.valid)) return { ok: false, message: SAVE_MESSAGES.NUMBERS };
  const silage = silageColumnsFor(draftSilageColumns(d), asOfDate);
  if (!silage.ok) return { ok: false, message: SAVE_MESSAGES[silage.reasonCode] ?? SAVE_MESSAGES.NUMBERS };
  return {
    ok: true,
    input: {
      goal: isGoal(d.goal) ? d.goal : null,
      targetKg: target.value,
      targetDate: d.targetDate.trim() === "" ? null : d.targetDate.trim(),
      feedingSituation: isFeeding(d.feedingSituation) ? d.feedingSituation : null,
      silageQualityBasis: null,
      ...silage.columns,
      concentrateKgHeadDay: kg.value,
      concentratePriceEurT: price.value,
      notes: d.notes.trim() === "" ? null : d.notes.trim(),
    },
  };
}

// ---------------------------------------------------------------------------
// Form options
// ---------------------------------------------------------------------------

export interface OptionVM {
  value: string;
  label: string;
}

export interface NutritionFormOptionsVM {
  goal: Details<OptionVM>;
  feeding: Details<OptionVM>;
  silageBasis: Details<OptionVM>;
  scenarioDmd: Details<OptionVM>;
}

export function nutritionFormOptions(sealed: SealedInput<GroupNutritionContext>): NutritionFormOptionsVM {
  const c = unseal(sealed);
  const housed = c.state === "OK" && c.system === "housed";
  return {
    goal: details([{ value: "", label: "Not chosen yet" }, ...GOAL_VALUES.map((value) => ({ value, label: LIVESTOCK_GOAL_LABEL[value] }))]),
    feeding: details([
      { value: "", label: housed ? "Housed — grass silage assumed" : "Choose feeding situation" },
      ...FEEDING_VALUES.map((value) => ({ value, label: FEEDING_SITUATION_LABEL[value] })),
    ]),
    silageBasis: details([
      { value: "", label: "Silage not tested" },
      { value: "lab_analysis", label: "Lab analysis" },
      { value: "planning_scenario", label: "Planning scenario (assumed DMD)" },
    ]),
    scenarioDmd: details([
      { value: "", label: "Choose DMD" },
      ...PUBLISHED_SILAGE_DMD_ROWS.map((dmd) => ({ value: String(dmd), label: `${dmd} DMD` })),
    ]),
  };
}

// ---------------------------------------------------------------------------
// Plan view
// ---------------------------------------------------------------------------

export interface NutritionRowVM {
  label: string;
  value: string;
  detail: string | null;
}

export interface NutritionEvidenceVM {
  title: string;
  meta: string;
  url: string;
  usedFor: string;
  limitation: string;
}

export interface GroupNutritionVM {
  targetWeight: MetricVM;
  requiredAdg: MetricVM;
  status: DisplayState;
  summary: string;
  stageLine: string;
  concentrate: MetricVM;
  rows: Details<NutritionRowVM>;
  inputsNeeded: Details<string>;
  assumptions: Details<string>;
  notes: Details<string>;
  evidence: Details<NutritionEvidenceVM>;
  /** Shown while no lab result is recorded. */
  silagePrompt: string | null;
  feedCostHeadDay: MetricVM;
  feedCostGroupDay: MetricVM;
  costPerTargetKg: MetricVM;
  costLabel: string;
  costNote: string;
  inputsMarketHref: string;
  inputsMarketLabel: string;
  /** A farmer/advisor override is in force (the advanced disclosure opens). */
  overrideActive: boolean;
}

const st = (code: string, label: string, tone: DisplayState["tone"], detail: string | null = null): DisplayState => ({
  code: `CATTLE_NUTRITION:${code}`,
  label,
  tone,
  detail,
});

const known = (label: string, value: string, unit: string | null, caption: string | null = null): MetricVM => ({
  label,
  value,
  unit,
  state: st("KNOWN", "Calculated", "neutral"),
  caption,
});
const unknown = (label: string, state: DisplayState, caption: string | null = null): MetricVM => ({ label, value: null, unit: null, state, caption });

const NEEDS_GOAL = st("NEEDS_GOAL", "Needs target weight and date", "unknown");
const NEEDS_PLAN = st("NEEDS_PLAN", "Waiting for a feeding plan", "unknown");

function statusOf(plan: CattleNutritionPlan): DisplayState {
  if (plan.concentrate.status === "override") return st("OVERRIDE", "Farmer/advisor override", "review");
  if (plan.applicability === "OUTSIDE_EVIDENCE") return st("OUTSIDE_EVIDENCE", "Outside current evidence · advisor review", "attention");
  if (plan.applicability === "INPUT_REQUIRED") return st("INPUT_REQUIRED", "More information required", "unknown");
  if (plan.silage.basis === "planning_scenario") return st("SCENARIO", "Planning scenario · silage not tested", "review");
  if (plan.applicability === "BOUNDED") return st("BOUNDED", "Indicative · upper bound", "info");
  return st("SUPPORTED", "Teagasc guideline", "good");
}

function silageRow(s: SilageQuality): NutritionRowVM {
  if (s.basis === "lab_analysis") {
    return {
      label: "Silage quality used",
      value: `${s.dmdPct} DMD${s.cpPct !== undefined ? ` · ${s.cpPct}% CP` : ""}`,
      detail: `Lab analysis, ${formatDate(s.analysisDate)}`,
    };
  }
  if (s.basis === "planning_scenario") {
    return { label: "Silage quality used", value: `${s.dmdPct} DMD (assumed)`, detail: "Planning scenario — not a lab result" };
  }
  return { label: "Silage quality used", value: "Unknown", detail: "A lab analysis (DMD, CP) is needed — visual assessment isn't adequate" };
}

function concentrateMetric(plan: CattleNutritionPlan): MetricVM {
  const c = plan.concentrate;
  if (c.status === "recommended") {
    return known(
      "Concentrate",
      `${c.precision === "upper_bound" ? "≤ " : ""}${formatFeedRate(c.kgHeadDay)}`,
      "kg/head/day",
      c.precision === "upper_bound"
        ? `Upper bound: Teagasc rate for ${c.tableDmd} DMD at ${c.tableAdgKgDay.toFixed(1)} kg/day`
        : `Teagasc rate for ${c.tableDmd} DMD at ${c.tableAdgKgDay.toFixed(1)} kg/day`,
    );
  }
  if (c.status === "override") {
    return known(
      "Concentrate",
      formatFeedRate(c.kgHeadDay),
      "kg/head/day",
      c.guideline ? `Override · Teagasc guideline ${formatFeedRate(c.guideline.kgHeadDay)} kg` : "Override · outside Teagasc guideline coverage",
    );
  }
  return unknown("Concentrate", st("RATE_UNSUPPORTED", "Rate not generated", "unknown", c.reason));
}

function rowsOf(plan: CattleNutritionPlan): NutritionRowVM[] {
  const rows: NutritionRowVM[] = [silageRow(plan.silage)];
  rows.push({ label: "Energy", value: plan.energy.text, detail: plan.energy.detail });
  rows.push({ label: "Crude protein", value: plan.protein.text, detail: plan.protein.detail });
  if (plan.totals.status === "known") {
    const t = plan.totals;
    const upTo = t.precision === "upper_bound" ? "Up to " : "";
    rows.push({ label: "Concentrate per head", value: `${upTo}${formatFeedQuantity(t.kgPerHead)}`, detail: `${t.days} days to target` });
    rows.push({ label: "Concentrate for the group", value: `${upTo}${formatFeedQuantity(t.kgGroup)}`, detail: `${t.headCount} head × ${t.days} days` });
  } else {
    rows.push({ label: "Concentrate for the group", value: "Not sized", detail: plan.totals.reason });
  }
  if (plan.cost.status === "known") {
    const c = plan.cost;
    rows.push({
      label: c.priceBasis === "farmer_price" ? "Cost at your price" : "Cost at reference price",
      value: `${plan.totals.status === "known" && plan.totals.precision === "upper_bound" ? "Up to " : "≈ "}${formatEuro(c.eurGroupPeriod)}`,
      detail: `${formatEuroPrecise(c.eurPerHeadDay)}/head/day at €${c.eurPerTonne}/t · ${c.sourceLabel}${c.referencePeriod ? ` (${c.referencePeriod})` : ""}${c.caveat ? `. ${c.caveat}` : ""}`,
    });
  } else {
    rows.push({ label: "Cost", value: "Unavailable", detail: plan.cost.reason });
  }
  if (plan.adgFit.status === "above_guideline" && plan.adgFit.guidelineDate) {
    rows.push({
      label: "At the guideline gain",
      value: formatDate(plan.adgFit.guidelineDate),
      detail: `Target reached at the Teagasc ${plan.adgFit.guidelineAdgKgDay.toFixed(1)} kg/day guideline — consider a later target date`,
    });
  }
  return rows;
}

const COST_NOTE = "Concentrate only. Silage, housing and other costs are not included.";

export function buildGroupNutritionVM(sealed: SealedInput<GroupNutritionContext>, draft: NutritionDraft, asOfDate: string): GroupNutritionVM {
  const c = unseal(sealed);
  if (c.state !== "OK") {
    const un = st("UNAVAILABLE", "Operational cattle data couldn't be read", "unknown");
    return {
      targetWeight: unknown("Target weight", un),
      requiredAdg: unknown("Required ADG", un),
      status: un,
      summary: "The feeding plan is unavailable until the operational cattle data can be read.",
      stageLine: un.label,
      concentrate: unknown("Concentrate", un),
      rows: details([]),
      inputsNeeded: details([]),
      assumptions: details([]),
      notes: details([]),
      evidence: details([]),
      silagePrompt: null,
      feedCostHeadDay: unknown("Concentrate cost", un),
      feedCostGroupDay: unknown("Group/day", un),
      costPerTargetKg: unknown("Cost / target kg", un),
      costLabel: un.label,
      costNote: COST_NOTE,
      inputsMarketHref: INPUTS_MARKET_FEED_HREF,
      inputsMarketLabel: "Open Inputs Market",
      overrideActive: false,
    };
  }

  const targetKg = num(draft.targetKg, NUMERIC_FIELDS.TARGET_KG).value;
  const targetDate = draft.targetDate.trim();
  const metrics = deriveCattleGroupProductionPlanMetrics({
    plan: {
      groupId: "draft",
      farmId: "draft",
      ...(targetKg !== null ? { targetWeightKg: targetKg } : {}),
      ...(targetDate !== "" ? { targetDate } : {}),
    },
    currentWeightKg: c.averageWeightKg,
    headCount: c.headCount,
    asOfDate,
  });
  const overrideKg = num(draft.overrideConcentrateKg, NUMERIC_FIELDS.PLAN_AMOUNT).value;
  const overridePrice = num(draft.overridePriceEurT, NUMERIC_FIELDS.PLAN_AMOUNT).value;
  const item = INPUT_MARKET_CATALOGUE.find((candidate) => candidate.id === BEEF_CONCENTRATE_ITEM_ID);
  // The editor's goal (initialised from the group record) drives the live preview.
  const goal = isGoal(draft.goal) ? draft.goal : undefined;
  const plan = buildCattleNutritionPlan({
    category: c.category,
    ...(goal ? { goal } : {}),
    ...(c.headCount !== undefined ? { headCount: c.headCount } : {}),
    metrics,
    asOfDate,
    feedingSituation: feedingSituationFor(isFeeding(draft.feedingSituation) ? draft.feedingSituation : undefined, c.system),
    silage: draftSilage(draft),
    ...(overrideKg !== null || overridePrice !== null
      ? { override: { ...(overrideKg !== null ? { concentrateKgHeadDay: overrideKg } : {}), ...(overridePrice !== null ? { concentratePriceEurT: overridePrice } : {}) } }
      : {}),
    ...(item ? { concentrateReferencePrice: item.referencePrice } : {}),
  });

  const targetWeight =
    targetKg === null
      ? unknown("Target weight", st("TARGET_WEIGHT_MISSING", "Target weight not set", "unknown"), targetDate ? `Target date ${formatDate(targetDate)}` : "Target date not set")
      : known("Target weight", formatKgNumber(targetKg), "kg", targetDate ? `by ${formatDate(targetDate)}` : "Target date not set");

  const requiredAdg =
    metrics.requiredAdgKgDay.status === "known"
      ? known(
          "Required ADG",
          formatAdgNumber(metrics.requiredAdgKgDay.value),
          "kg/day",
          metrics.remainingDays.status === "known" && metrics.requiredGainKg.status === "known"
            ? `${formatKgNumber(metrics.requiredGainKg.value)} kg over ${metrics.remainingDays.value} days`
            : null,
        )
      : unknown("Required ADG", NEEDS_GOAL);

  const cost = plan.cost;
  const upper = plan.totals.status === "known" && plan.totals.precision === "upper_bound" ? "Up to " : "";
  const costCaption = cost.status === "known" ? `${upper}${cost.priceBasis === "farmer_price" ? "your price" : "reference price"} · concentrate only` : null;

  return {
    targetWeight,
    requiredAdg,
    status: statusOf(plan),
    summary: plan.summary,
    stageLine:
      plan.stage.status === "resolved"
        ? `${plan.stage.label} · from the group's category and goal`
        : "Not covered by the Teagasc silage-and-concentrate guidance",
    concentrate: concentrateMetric(plan),
    rows: details(rowsOf(plan)),
    inputsNeeded: details(plan.inputsNeeded.map((code) => NUTRITION_INPUT_LABEL[code])),
    assumptions: details(plan.assumptions),
    notes: details(plan.notes),
    evidence: details(
      plan.evidence.map((e) => ({
        title: e.title,
        meta: `${e.authority}${e.date ? ` · ${formatDate(e.date)}` : ""}`,
        url: e.url,
        usedFor: e.usedFor,
        limitation: e.limitation,
      })),
    ),
    silagePrompt:
      plan.silage.basis === "lab_analysis"
        ? null
        : "Record the silage lab analysis (DMD and CP) to move from a scenario to a lab-backed recommendation.",
    feedCostHeadDay: cost.status === "known" ? known("Concentrate cost", formatEuroPrecise(cost.eurPerHeadDay), "/head/day", costCaption) : unknown("Concentrate cost", NEEDS_PLAN),
    feedCostGroupDay: cost.status === "known" ? known("Group/day", formatEuroPrecise(cost.eurGroupDay), "/day", costCaption) : unknown("Group/day", NEEDS_PLAN),
    costPerTargetKg:
      cost.status === "known" && cost.eurPerKgTargetGain !== null
        ? known("Cost / target kg", formatEuroPerKg(cost.eurPerKgTargetGain), null, costCaption)
        : unknown("Cost / target kg", NEEDS_PLAN),
    costLabel: cost.status === "known" && cost.eurPerKgTargetGain !== null ? formatEuroPerKg(cost.eurPerKgTargetGain) : "Cost of gain waiting for a feeding plan",
    costNote: COST_NOTE,
    inputsMarketHref: INPUTS_MARKET_FEED_HREF,
    inputsMarketLabel: "Price & request a quote in Inputs Market",
    overrideActive: plan.concentrate.status === "override" || (cost.status === "known" && cost.priceBasis === "farmer_price"),
  };
}
