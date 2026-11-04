/**
 * Goal-first cattle nutrition plan — the farmer states the outcome (target
 * liveweight by a target date) and Farm Return derives the feeding plan the
 * published Teagasc guidance directly supports, or says plainly that it
 * does not.
 *
 * Decision support with real livestock consequences, so every branch fails
 * closed. Reuses, never duplicates (AGENTS.md):
 *  - required gain / days / ADG: `deriveCattleGroupProductionPlanMetrics`
 *    (`cattle-group-production-plan.ts`) — the caller passes its metrics;
 *  - production stage: `classifyFinishingAnimalType` (`livestock.ts`);
 *  - concentrate kg/head/day by silage DMD: `concentrateKgPerDay` and
 *    `targetADGForAnimalType` (`livestock.ts`), the existing exact-lookup
 *    encoding of the DairyBeef 500 Table 3 (no interpolation, GFT115).
 *
 * Evidence encoded here (verified against the pages 2026-11-04):
 *  - DairyBeef 500 "Silage quality and concentrate supplementation"
 *    (`TEAGASC_DAIRYBEEF_DMD`): Table 3 footnote (heifer 66 DMD: ad-lib
 *    should be considered); ration energy >0.94 UFL (weanling) / >0.92 UFV
 *    (finishing); concentrate CP general text (weanling 14–16%, finishing
 *    11–14%) and Table 4 (CP by 10% / 14% CP grass silage).
 *  - Teagasc "Nutritional management of finishing beef cattle", 1 Jul 2026
 *    (`TEAGASC_BEEF_2026_FINISHING`): ~0.33 kg concentrate per DMD unit for
 *    ~600 kg steers at ~1 kg/day and the curvilinear response — disclosed as
 *    context ONLY, never used to interpolate (exact scenario, and the repo's
 *    DMD contract forbids interpolation).
 *  - Teagasc Beef Management Notes, 4 Nov 2026: concentrates 0.93–0.94
 *    UFL/UFV per kg fed; UFV for finishing cattle, UFL for growing stock.
 *
 * Applicability rules (documented, tested):
 *  - Required ADG "matches" a Table 3 target when it rounds (half-up) to the
 *    target at the table's own stated precision of 0.1 kg/day.
 *  - Required ADG below the target: the table rate is shown only as an
 *    UPPER BOUND (it is the published rate for a higher gain); never a
 *    precise lower rate.
 *  - Required ADG above the target: OUTSIDE_EVIDENCE — no kg figure; the
 *    date the target would be reached at the guideline ADG is shown instead.
 *  - Lab DMD on a published row: exact. Between rows (or above 76): the next
 *    LOWER published row, labelled as a conservative bound (lower DMD needs
 *    at least as much concentrate in every Table 3 column). Below 66:
 *    OUTSIDE_EVIDENCE.
 *  - Unknown silage quality: INPUT_REQUIRED, unless the farmer explicitly
 *    chose a published-row planning scenario, which is always labelled and
 *    never presented as a lab-backed recommendation.
 */

import Decimal from "decimal.js";
import { classifyFinishingAnimalType, concentrateKgPerDay, targetADGForAnimalType, type FinishingAnimalType } from "./livestock";
import { SOURCE_REGISTER } from "./source-register";
import type { CattleFeedingSituation, CattleGroupProductionPlanMetrics, SilageQualityBasis } from "./cattle-group-production-plan";
import type { InputReferencePrice } from "./inputs-market";
import type { LivestockCategory, LivestockGoal } from "./types";

export const CATTLE_NUTRITION_PLAN_VERSION = "cattle_nutrition_plan_v1.0.0";

/** DairyBeef 500 Table 3's published DMD rows — the only values a planning
 * scenario may choose. */
export const PUBLISHED_SILAGE_DMD_ROWS = [66, 68, 70, 72, 74, 76] as const;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface SilageColumns {
  silageQualityBasis?: SilageQualityBasis | null;
  silageDmdPct?: number | null;
  silageCpPct?: number | null;
  silageAnalysisDate?: string | null;
}

function validPct(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100;
}

/** Silage quality keeps its provenance: a dated lab result, an explicit
 * published-row scenario, or nothing. Returns the columns to write, or a
 * rejection code. `undefined` input leaves the stored silage untouched. */
export function silageColumnsFor(
  input: { silageQualityBasis?: SilageQualityBasis | null; silageDmdPct?: number | null; silageCpPct?: number | null; silageAnalysisDate?: string | null },
  today: string,
): { ok: true; columns: SilageColumns } | { ok: false; reasonCode: string } {
  if (input.silageQualityBasis === undefined) return { ok: true, columns: {} };
  if (input.silageQualityBasis === null) {
    return { ok: true, columns: { silageQualityBasis: null, silageDmdPct: null, silageCpPct: null, silageAnalysisDate: null } };
  }
  if (input.silageQualityBasis === "planning_scenario") {
    if (!(PUBLISHED_SILAGE_DMD_ROWS as readonly number[]).includes(input.silageDmdPct ?? Number.NaN)) return { ok: false, reasonCode: "SILAGE_SCENARIO_DMD_INVALID" };
    return { ok: true, columns: { silageQualityBasis: "planning_scenario", silageDmdPct: input.silageDmdPct, silageCpPct: null, silageAnalysisDate: null } };
  }
  if (input.silageQualityBasis !== "lab_analysis") return { ok: false, reasonCode: "SILAGE_BASIS_INVALID" };
  if (!validPct(input.silageDmdPct)) return { ok: false, reasonCode: "SILAGE_DMD_INVALID" };
  if (input.silageCpPct !== null && input.silageCpPct !== undefined && !validPct(input.silageCpPct)) return { ok: false, reasonCode: "SILAGE_CP_INVALID" };
  const date = input.silageAnalysisDate;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00.000Z`)) || date > today) {
    return { ok: false, reasonCode: "SILAGE_ANALYSIS_DATE_INVALID" };
  }
  return { ok: true, columns: { silageQualityBasis: "lab_analysis", silageDmdPct: input.silageDmdPct, silageCpPct: input.silageCpPct ?? null, silageAnalysisDate: date } };
}

/**
 * The feeding situation the engine uses: the farmer's saved choice, else a
 * visible inference for a group recorded as housed (Irish winter housing
 * is assumed grass-silage-based only as a disclosed, editable assumption).
 * A grazing group is never inferred — the farmer confirms.
 */
export function feedingSituationFor(
  saved: FeedingSituation | undefined,
  groupSystem: "grazing" | "housed" | undefined,
): CattleNutritionPlanInput["feedingSituation"] {
  if (saved) return { value: saved, source: "farmer" };
  if (groupSystem === "housed") return { value: "housed_grass_silage", source: "inferred_from_group" };
  return undefined;
}

/** The stored plan's silage fields as the engine's provenance-carrying input. */
export function silageQualityOf(plan: SilageColumns | undefined): SilageQuality {
  if (plan?.silageQualityBasis === "lab_analysis" && validPct(plan.silageDmdPct ?? undefined) && plan.silageAnalysisDate) {
    return {
      basis: "lab_analysis",
      dmdPct: plan.silageDmdPct!,
      ...(validPct(plan.silageCpPct ?? undefined) ? { cpPct: plan.silageCpPct! } : {}),
      analysisDate: plan.silageAnalysisDate,
    };
  }
  if (plan?.silageQualityBasis === "planning_scenario" && (PUBLISHED_SILAGE_DMD_ROWS as readonly number[]).includes(plan.silageDmdPct ?? Number.NaN)) {
    return { basis: "planning_scenario", dmdPct: plan.silageDmdPct! };
  }
  return { basis: "unknown" };
}


export type NutritionStage = FinishingAnimalType | "finishing_bull";

export const NUTRITION_STAGE_LABEL: Record<NutritionStage, string> = {
  weanling: "Weanling (growing)",
  finishing_steer: "Finishing steer",
  finishing_heifer: "Finishing heifer",
  finishing_bull: "Finishing bull",
};

export type FeedingSituation = CattleFeedingSituation;

export const FEEDING_SITUATION_LABEL: Record<FeedingSituation, string> = {
  housed_grass_silage: "Housed on grass silage",
  at_grass: "At grass",
  other_diet: "Other diet (maize silage, ad-lib meal …)",
};

export type SilageQuality =
  | { basis: "lab_analysis"; dmdPct: number; cpPct?: number; analysisDate: string }
  | { basis: "planning_scenario"; dmdPct: number }
  | { basis: "unknown" };

export interface CattleNutritionPlanInput {
  category: LivestockCategory;
  goal?: LivestockGoal;
  headCount?: number;
  /** The plan's derived metrics (`deriveCattleGroupProductionPlanMetrics`). */
  metrics: Pick<CattleGroupProductionPlanMetrics, "currentWeightKg" | "remainingDays" | "requiredGainKg" | "requiredAdgKgDay">;
  asOfDate: string;
  feedingSituation?: { value: FeedingSituation; source: "farmer" | "inferred_from_group" };
  silage: SilageQuality;
  /** Farmer/advisor overrides — never the default path. */
  override?: { concentrateKgHeadDay?: number; concentratePriceEurT?: number };
  /** The concentrate reference price (Inputs Market catalogue). */
  concentrateReferencePrice?: InputReferencePrice;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type NutritionApplicability = "SUPPORTED" | "BOUNDED" | "OUTSIDE_EVIDENCE" | "INPUT_REQUIRED";

export type NutritionInputCode =
  | "CURRENT_WEIGHT"
  | "TARGET_WEIGHT"
  | "TARGET_DATE"
  | "HEAD_COUNT"
  | "FEEDING_SITUATION"
  | "SILAGE_ANALYSIS";

export const NUTRITION_INPUT_LABEL: Record<NutritionInputCode, string> = {
  CURRENT_WEIGHT: "Record a current group average weight",
  TARGET_WEIGHT: "Set a target weight above the current average",
  TARGET_DATE: "Set a future target date",
  HEAD_COUNT: "Record the group head count",
  FEEDING_SITUATION: "Confirm the feeding situation",
  SILAGE_ANALYSIS: "Add a silage lab analysis (DMD, CP)",
};

export type AdgFit =
  | { status: "matches"; guidelineAdgKgDay: number }
  | { status: "below_guideline"; guidelineAdgKgDay: number }
  | { status: "above_guideline"; guidelineAdgKgDay: number; guidelineDate: string | null }
  | { status: "not_applicable" }
  | { status: "unknown" };

export type ConcentrateRate =
  | {
      status: "recommended";
      kgHeadDay: number;
      /** `exact`: a published row for the group's exact ADG target and DMD.
       * `upper_bound`: a published rate used conservatively (lower target
       * ADG, or a lab DMD between rows). */
      precision: "exact" | "upper_bound";
      tableDmd: number;
      tableAdgKgDay: number;
    }
  | { status: "override"; kgHeadDay: number; guideline: Extract<ConcentrateRate, { status: "recommended" }> | null }
  | { status: "not_supported"; reason: string };

export interface NutrientSpec {
  status: "specified" | "general" | "not_specified";
  /** Farmer-facing statement, e.g. "14% CP". */
  text: string;
  detail: string;
}

export type NutritionTotals =
  | {
      status: "known";
      precision: "exact" | "upper_bound";
      days: number;
      headCount: number;
      kgHeadDay: number;
      kgPerHead: number;
      kgGroup: number;
    }
  | { status: "unknown"; reason: string };

export type NutritionCost =
  | {
      status: "known";
      priceBasis: "reference_benchmark" | "reference_statistic" | "farmer_price";
      eurPerTonne: number;
      sourceLabel: string;
      referencePeriod: string | null;
      caveat: string | null;
      eurPerHeadDay: number;
      eurGroupDay: number;
      eurGroupPeriod: number;
      eurPerKgTargetGain: number | null;
    }
  | { status: "unknown"; reason: string };

export interface NutritionEvidenceCitation {
  title: string;
  authority: string;
  url: string;
  date: string | null;
  usedFor: string;
  limitation: string;
}

export interface CattleNutritionPlan {
  version: typeof CATTLE_NUTRITION_PLAN_VERSION;
  applicability: NutritionApplicability;
  stage: { status: "resolved"; stage: NutritionStage; label: string } | { status: "unsupported"; reason: string };
  silage: SilageQuality;
  adgFit: AdgFit;
  concentrate: ConcentrateRate;
  energy: NutrientSpec;
  protein: NutrientSpec;
  totals: NutritionTotals;
  cost: NutritionCost;
  inputsNeeded: NutritionInputCode[];
  /** Headline explanation of the applicability state. */
  summary: string;
  assumptions: string[];
  notes: string[];
  evidence: NutritionEvidenceCitation[];
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

const DAIRYBEEF = SOURCE_REGISTER.TEAGASC_DAIRYBEEF_DMD;
const FINISHING = SOURCE_REGISTER.TEAGASC_BEEF_2026_FINISHING;

export const BEEF_NOTES_NOV_2026 = {
  title: "Beef Management Notes – November 2026",
  authority: "Teagasc",
  url: "https://teagasc.ie/news--events/daily/beef-management-notes-november-2026/",
  date: "2026-11-04",
} as const;

function evidenceFor(stage: NutritionStage | null): NutritionEvidenceCitation[] {
  const out: NutritionEvidenceCitation[] = [
    {
      title: DAIRYBEEF.title,
      authority: DAIRYBEEF.authority,
      url: DAIRYBEEF.url!,
      date: DAIRYBEEF.publicationDate ?? null,
      usedFor: "Guideline concentrate kg/head/day by silage DMD (Table 3), ration energy, concentrate crude protein (Table 4).",
      limitation: "Guideline rates for grass-silage-based winter diets at one target ADG per class; exact rows only, no interpolation.",
    },
    {
      title: BEEF_NOTES_NOV_2026.title,
      authority: BEEF_NOTES_NOV_2026.authority,
      url: BEEF_NOTES_NOV_2026.url,
      date: BEEF_NOTES_NOV_2026.date,
      usedFor: "Concentrate energy 0.93–0.94 UFL/UFV per kg fed (finishing headline); UFV for finishing cattle, UFL for growing stock.",
      limitation: "Seasonal advisory notes; check UFL/UFV values with the feed supplier before buying.",
    },
  ];
  if (stage === "finishing_steer" || stage === "finishing_heifer" || stage === "finishing_bull") {
    out.push({
      title: FINISHING.title,
      authority: FINISHING.authority,
      url: FINISHING.url!,
      date: FINISHING.publicationDate ?? null,
      usedFor: "Context: ~600 kg steers at ~1 kg/day need 7–8 kg (66 DMD), 5.5–6.5 kg (70) and 4–5 kg (74); ~0.33 kg extra per unit fall in DMD; curvilinear response.",
      limitation: "Shown as context only. The ~0.33 kg/DMD figure applies to ~600 kg finishing steers at ~1 kg/day and is not used to interpolate.",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

function resolveStage(category: LivestockCategory, goal: LivestockGoal | undefined): CattleNutritionPlan["stage"] {
  if (category === "bull" && goal === "finish_slaughter") {
    return { status: "resolved", stage: "finishing_bull", label: NUTRITION_STAGE_LABEL.finishing_bull };
  }
  const classified = classifyFinishingAnimalType({ category, goal } as Parameters<typeof classifyFinishingAnimalType>[0]);
  if (classified.status === "OK") {
    return { status: "resolved", stage: classified.value, label: NUTRITION_STAGE_LABEL[classified.value] };
  }
  return {
    status: "unsupported",
    reason:
      "The Teagasc silage-and-concentrate guidance covers weanlings and finishing steers, heifers and bulls. Set the group's goal to finish for slaughter if these cattle are being finished.",
  };
}

// ---------------------------------------------------------------------------
// Nutrient specifications
// ---------------------------------------------------------------------------

function energySpec(stage: NutritionStage): NutrientSpec {
  if (stage === "weanling") {
    return {
      status: "specified",
      text: ">0.94 UFL/kg",
      detail: "DairyBeef 500: weanling rations need >0.94 UFL — the class-specific and stricter figure. Teagasc Nov 2026 notes: concentrates 0.93–0.94 UFL/UFV per kg fed. Growing stock are rated in UFL.",
    };
  }
  return {
    status: "specified",
    text: "0.93–0.94 UFV/kg",
    detail: "Concentrate energy per kg fed (Teagasc, Nov 2026). DairyBeef 500: finishing rations need >0.92 UFV. Finishing cattle are rated in UFV.",
  };
}

/** Lab CP rounded half-up to the whole percent Table 4 is stated in; the
 * 14% column covers "14% or greater" (Table 4 footnote). */
function silageCpRow(silage: SilageQuality): 10 | 14 | "other" | null {
  if (silage.basis !== "lab_analysis" || silage.cpPct === undefined) return null;
  const rounded = new Decimal(silage.cpPct).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  return rounded === 10 ? 10 : rounded >= 14 ? 14 : "other";
}

function proteinSpec(stage: NutritionStage, silage: SilageQuality, kgHeadDay: number | null): NutrientSpec {
  const row = silageCpRow(silage);
  const table4 = "Teagasc DairyBeef 500 Table 4 (CP %, fresh weight, grass-silage diets)";
  if (stage === "finishing_bull") {
    return { status: "specified", text: "11–12% CP", detail: `${table4}: finishing bulls 11–12% with 10% or 14% CP silage.` };
  }
  if (stage === "weanling") {
    if (row === 14) return { status: "specified", text: "14–16% CP", detail: `${table4}: weanlings on 14% (or greater) CP silage.` };
    if (row === 10 && kgHeadDay !== null && kgHeadDay >= 1 && kgHeadDay <= 1.5) {
      return { status: "specified", text: "20% CP", detail: `${table4}: weanlings on 10% CP silage at a 1.0–1.5 kg/day feeding rate.` };
    }
    if (row === 10) {
      return {
        status: "not_specified",
        text: "16–20% CP",
        detail: `${table4} gives 20% at 1.0–1.5 kg/day and 16% at 2.5 kg/day on 10% CP silage; this feeding rate is not a published row — confirm with an advisor.`,
      };
    }
    return {
      status: "general",
      text: "14–16% CP",
      detail: "DairyBeef 500 general guidance for weanling concentrate. Table 4 refines this by silage CP — add a silage analysis.",
    };
  }
  if (row === 10) return { status: "specified", text: "14% CP", detail: `${table4}: finishing steers and heifers on 10% CP silage.` };
  if (row === 14) return { status: "specified", text: "11–12% CP", detail: `${table4}: finishing steers and heifers on 14% (or greater) CP silage.` };
  return {
    status: "general",
    text: "11–14% CP",
    detail: "DairyBeef 500 general guidance for finishing concentrates: 14% with 10% CP silage, 11–12% with 14% CP silage.",
  };
}

// ---------------------------------------------------------------------------
// Concentrate rate
// ---------------------------------------------------------------------------

function roundTo1dp(value: number): number {
  return new Decimal(value).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toNumber();
}

function addDaysIso(isoDate: string, days: number): string | null {
  const ms = Date.parse(`${isoDate}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

/** The published DMD row to use for a lab/scenario DMD, or null (< 66). */
function tableDmdFor(dmdPct: number): { row: number; exact: boolean } | null {
  const exact = PUBLISHED_SILAGE_DMD_ROWS.find((row) => row === dmdPct);
  if (exact !== undefined) return { row: exact, exact: true };
  const lower = [...PUBLISHED_SILAGE_DMD_ROWS].reverse().find((row) => row < dmdPct);
  return lower === undefined ? null : { row: lower, exact: false };
}

function validPositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validNonNegative(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export function buildCattleNutritionPlan(input: CattleNutritionPlanInput): CattleNutritionPlan {
  const stage = resolveStage(input.category, input.goal);
  const stageValue = stage.status === "resolved" ? stage.stage : null;
  const assumptions: string[] = [];
  const notes: string[] = [];
  const inputsNeeded: NutritionInputCode[] = [];

  const { currentWeightKg, remainingDays, requiredGainKg, requiredAdgKgDay } = input.metrics;
  if (currentWeightKg.status === "unknown") inputsNeeded.push("CURRENT_WEIGHT");
  else if (requiredGainKg.status === "unknown") inputsNeeded.push("TARGET_WEIGHT");
  if (remainingDays.status === "unknown") inputsNeeded.push("TARGET_DATE");
  const headCount = validPositive(input.headCount) ? input.headCount : null;
  if (headCount === null) inputsNeeded.push("HEAD_COUNT");

  const feeding = input.feedingSituation;
  if (!feeding) inputsNeeded.push("FEEDING_SITUATION");
  else if (feeding.source === "inferred_from_group" && feeding.value === "housed_grass_silage") {
    assumptions.push("Grass-silage-based winter diet assumed because the group is recorded as housed — change the feeding situation if not.");
  }

  const silage = input.silage;
  if (silage.basis === "unknown") inputsNeeded.push("SILAGE_ANALYSIS");
  if (silage.basis === "planning_scenario") {
    assumptions.push(`Planning scenario: silage assumed at ${silage.dmdPct} DMD. Not a lab result — test the silage before relying on this rate.`);
    inputsNeeded.push("SILAGE_ANALYSIS");
  }
  if (silage.basis === "lab_analysis") {
    assumptions.push(`Silage lab analysis dated ${silage.analysisDate}: ${silage.dmdPct} DMD${silage.cpPct !== undefined ? `, ${silage.cpPct}% CP` : ""}. Assumed to be the silage being fed over this plan.`);
  }

  // ADG fit against the stage's Table 3 target.
  let adgFit: AdgFit = { status: "unknown" };
  const tableStage: FinishingAnimalType | null = stageValue && stageValue !== "finishing_bull" ? stageValue : null;
  if (stageValue === "finishing_bull") adgFit = { status: "not_applicable" };
  if (tableStage && requiredAdgKgDay.status === "known") {
    const guideline = targetADGForAnimalType(tableStage);
    const rounded = roundTo1dp(requiredAdgKgDay.value);
    if (rounded === guideline) adgFit = { status: "matches", guidelineAdgKgDay: guideline };
    else if (rounded < guideline) adgFit = { status: "below_guideline", guidelineAdgKgDay: guideline };
    else {
      const guidelineDays = requiredGainKg.status === "known" ? Math.ceil(new Decimal(requiredGainKg.value).dividedBy(guideline).toNumber()) : null;
      adgFit = {
        status: "above_guideline",
        guidelineAdgKgDay: guideline,
        guidelineDate: guidelineDays === null ? null : addDaysIso(input.asOfDate, guidelineDays),
      };
    }
  }

  // Guideline concentrate rate.
  let guideline: Extract<ConcentrateRate, { status: "recommended" }> | null = null;
  let notSupported: string | null = null;
  if (stage.status === "unsupported") notSupported = stage.reason;
  else if (stageValue === "finishing_bull") {
    notSupported = "DairyBeef 500 Table 3 publishes no concentrate feeding rate for finishing bulls. Concentrate energy and protein specification only — agree the feeding rate with an advisor.";
  } else if (feeding && feeding.value !== "housed_grass_silage") {
    notSupported = "The Teagasc feeding-rate table applies to grass-silage-based winter diets. No rate is generated for this feeding situation.";
  } else if (adgFit.status === "above_guideline") {
    notSupported = `The target needs more than the Teagasc guideline ${adgFit.guidelineAdgKgDay.toFixed(1)} kg/day for this class. No published rate supports that gain — advisor review required.`;
  } else if (silage.basis !== "unknown" && tableStage && feeding && (adgFit.status === "matches" || adgFit.status === "below_guideline")) {
    const dmd = tableDmdFor(silage.dmdPct);
    if (dmd === null) {
      notSupported = `Silage at ${silage.dmdPct} DMD is below the lowest published row (66 DMD). No rate is generated — advisor review required.`;
    } else {
      const outcome = concentrateKgPerDay(tableStage, dmd.row);
      if (outcome.status === "OK") {
        const exact = dmd.exact && adgFit.status === "matches";
        guideline = {
          status: "recommended",
          kgHeadDay: outcome.value,
          precision: exact ? "exact" : "upper_bound",
          tableDmd: dmd.row,
          tableAdgKgDay: targetADGForAnimalType(tableStage),
        };
        if (!dmd.exact) assumptions.push(`Lab DMD ${silage.dmdPct} is between published rows — the ${dmd.row} DMD row is used as a conservative bound.`);
        if (adgFit.status === "below_guideline") {
          assumptions.push(`Required gain is below the Teagasc ${adgFit.guidelineAdgKgDay.toFixed(1)} kg/day target. The published rate is shown as an upper bound; a lower rate may meet the target, but no Teagasc figure is published for it.`);
        }
        if (tableStage === "finishing_heifer" && dmd.row === 66) notes.push("Teagasc: at 66 DMD, ad-lib feeding should be considered for finishing heifers.");
      }
    }
  }

  const overrideKg = validNonNegative(input.override?.concentrateKgHeadDay) ? input.override!.concentrateKgHeadDay! : null;
  const concentrate: ConcentrateRate =
    overrideKg !== null
      ? { status: "override", kgHeadDay: overrideKg, guideline }
      : guideline ?? { status: "not_supported", reason: notSupported ?? "Add the missing inputs to generate a feeding plan." };
  if (overrideKg !== null) assumptions.push(`Concentrate rate ${overrideKg} kg/head/day is a farmer/advisor override, not a Teagasc guideline.`);

  // Applicability.
  // `notSupported` is only ever set for an evidence reason (never a missing input).
  const applicability: NutritionApplicability =
    notSupported !== null ? "OUTSIDE_EVIDENCE" : guideline === null ? "INPUT_REQUIRED" : guideline.precision === "exact" ? "SUPPORTED" : "BOUNDED";

  const kgForTotals =
    concentrate.status === "override" ? concentrate.kgHeadDay : concentrate.status === "recommended" ? concentrate.kgHeadDay : null;
  const totalsPrecision: "exact" | "upper_bound" =
    concentrate.status === "recommended" ? concentrate.precision : "exact";

  let totals: NutritionTotals;
  if (kgForTotals === null) totals = { status: "unknown", reason: "No supported concentrate rate yet." };
  else if (remainingDays.status !== "known") totals = { status: "unknown", reason: "Set a future target date to size the plan." };
  else if (headCount === null) totals = { status: "unknown", reason: "Record the head count to size the group requirement." };
  else {
    const perHead = new Decimal(kgForTotals).times(remainingDays.value);
    totals = {
      status: "known",
      precision: totalsPrecision,
      days: remainingDays.value,
      headCount,
      kgHeadDay: kgForTotals,
      kgPerHead: perHead.toNumber(),
      kgGroup: perHead.times(headCount).toNumber(),
    };
  }

  const cost = costOf(totals, input, requiredAdgKgDay);

  const summary = summaryFor(applicability, concentrate, silage, notSupported);

  return {
    version: CATTLE_NUTRITION_PLAN_VERSION,
    applicability,
    stage,
    silage,
    adgFit,
    concentrate,
    energy: stageValue ? energySpec(stageValue) : { status: "not_specified", text: "Not specified", detail: "No Teagasc specification for this group." },
    protein: stageValue
      ? proteinSpec(stageValue, silage, kgForTotals)
      : { status: "not_specified", text: "Not specified", detail: "No Teagasc specification for this group." },
    totals,
    cost,
    inputsNeeded: [...new Set(inputsNeeded)],
    summary,
    assumptions,
    notes: [
      ...notes,
      ...(stageValue && stageValue !== "weanling"
        ? ["Teagasc: gains respond to extra concentrate at a diminishing (curvilinear) rate, especially on high-DMD silage."]
        : []),
    ],
    evidence: evidenceFor(stageValue),
  };
}

function costOf(
  totals: NutritionTotals,
  input: CattleNutritionPlanInput,
  requiredAdg: CattleNutritionPlanInput["metrics"]["requiredAdgKgDay"],
): NutritionCost {
  if (totals.status !== "known") return { status: "unknown", reason: totals.reason };
  const farmerPrice = validPositive(input.override?.concentratePriceEurT) ? input.override!.concentratePriceEurT! : null;
  const ref = input.concentrateReferencePrice;
  let price: { eurPerTonne: number; basis: Extract<NutritionCost, { status: "known" }>["priceBasis"]; sourceLabel: string; referencePeriod: string | null; caveat: string | null };
  if (farmerPrice !== null) {
    price = { eurPerTonne: farmerPrice, basis: "farmer_price", sourceLabel: "Your price (override)", referencePeriod: null, caveat: null };
  } else if (ref?.status === "available") {
    price = {
      eurPerTonne: ref.eurPerTonne,
      basis: ref.basis === "official_statistic" ? "reference_statistic" : "reference_benchmark",
      sourceLabel: ref.sourceLabel,
      referencePeriod: ref.referencePeriod,
      caveat: ref.caveat ?? null,
    };
  } else {
    return { status: "unknown", reason: ref?.status === "unavailable" ? ref.reason : "No concentrate reference price available — request a quote." };
  }
  const perTonne = new Decimal(price.eurPerTonne);
  const perHeadDay = new Decimal(totals.kgHeadDay).times(perTonne).dividedBy(1000);
  const groupDay = perHeadDay.times(totals.headCount);
  const groupPeriod = new Decimal(totals.kgGroup).times(perTonne).dividedBy(1000);
  return {
    status: "known",
    priceBasis: price.basis,
    eurPerTonne: price.eurPerTonne,
    sourceLabel: price.sourceLabel,
    referencePeriod: price.referencePeriod,
    caveat: price.caveat,
    eurPerHeadDay: perHeadDay.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    eurGroupDay: groupDay.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
    eurGroupPeriod: groupPeriod.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
    eurPerKgTargetGain:
      requiredAdg.status === "known" && requiredAdg.value > 0
        ? perHeadDay.dividedBy(requiredAdg.value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
        : null,
  };
}

function summaryFor(applicability: NutritionApplicability, concentrate: ConcentrateRate, silage: SilageQuality, notSupported: string | null): string {
  if (concentrate.status === "override") return "Farmer/advisor override in use. The Teagasc guideline is shown alongside for comparison.";
  if (applicability === "OUTSIDE_EVIDENCE") return notSupported ?? "Outside the current evidence range — advisor review required.";
  if (applicability === "INPUT_REQUIRED") return "More information is needed before Farm Return can generate a feeding plan.";
  if (silage.basis === "planning_scenario") return "Planning scenario only — the silage has not been tested, so this rate is not a lab-backed recommendation.";
  if (applicability === "BOUNDED") return "Indicative: a published Teagasc rate used conservatively. Treat the figures as an upper bound.";
  return "Matches a published Teagasc guideline for this class, target gain and silage quality.";
}
