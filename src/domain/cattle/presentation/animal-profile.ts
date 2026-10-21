/**
 * Cattle C10 — the animal profile view-model. Selects and shapes frozen
 * engine outputs at one viewpoint (C1 snapshot, C4 series, C5 performance,
 * C6 goals, C3 health, C8 recommendation, C9 + Plan work) and the C10
 * direct-cost summary. No new calculation: every number is an engine output
 * or a documented display rounding (`format.ts`); every unresolved input is
 * its own display state (CAT-INV-009 / 022).
 *
 * Availability (`availability.ts`): an owner output that wasn't produced —
 * the snapshot, a weight series or performance entry, goals, health, the C8
 * context, the planning run, the cost summary — is UNAVAILABLE (or
 * `EVALUATION_UNAVAILABLE`), never "not recorded", "no jobs", "no costs" or
 * an empty list.
 */

import type { AnimalResolution } from "../animal-snapshot";
import type { AnimalPerformance, PerformancePoint } from "../performance";
import type { WeightSeriesEntry } from "../weights";
import { costPerKgLiveweight, isPlanDate, utcDateOfInstant, type AnimalCostRead } from "../../animal-plan";
import { known, unavailable, type Availability } from "./availability";
import type { CattleDirectory, CattleOutputs } from "./cattle-outputs";
import {
  ADMINISTRATION_WITHDRAWAL_DISPLAY,
  EVALUATION_UNAVAILABLE,
  GAIN_DISPLAY,
  GOAL_DISPLAY,
  IDENTITY_DISPLAY,
  LATEST_WEIGHT_DISPLAY,
  MEMBERSHIP_DISPLAY,
  OBLIGATION_DISPLAY,
  PREDICTION_DISPLAY,
  PROGRAMME_DISPLAY,
  RECOMMENDATION_DISPLAY,
  TARGET_DISPLAY,
  TREND_DISPLAY,
  UNAVAILABLE_DISPLAY,
  WITHDRAWAL_DISPLAY,
  displayOf,
  type DisplayState,
} from "./display-states";
import { ageInMonths, formatAdg, formatAge, formatDate, formatDayMonth, formatEuro, formatEuroPerKg, formatKg, formatSignedKg, formatUtcTime } from "./format";
import { buildAnimalTimeline, type TimelineEntryVM } from "./timeline";
import { animalWork, type WorkVM } from "./work-view";

export interface FieldVM {
  label: string;
  /** Display text when resolved; `null` otherwise (render `state`). */
  value: string | null;
  state: DisplayState;
}

export interface ChartPointVM {
  at: string;
  dateLabel: string;
  /** Usable kilograms (`null` for a conflicting / unsupported point). */
  kg: number | null;
  kgLabel: string;
  state: "MEASURED" | "ESTIMATED" | "CONFLICT" | "UNSUPPORTED" | "EXCLUDED";
  stateLabel: string;
  method: string;
  /** Competing kilograms at a conflicting instant (ascending). */
  candidates: number[];
  recordIds: string[];
}

export interface MetricVM {
  label: string;
  /** Large numeral (resolved) or `null`. */
  value: string | null;
  unit: string | null;
  state: DisplayState;
  caption: string | null;
}

export interface AnimalProfileVM {
  animalId: string;
  title: string;
  tag: FieldVM;
  identity: { breed: FieldVM; sex: FieldVM; age: FieldVM; group: FieldVM & { groupRef: string | null }; location: FieldVM & { housed: boolean | null }; status: FieldVM };
  asOf: { effectiveAt: string; knowledgeCutoff: string; label: string };
  metrics: { weight: MetricVM; gain: MetricVM; cost: MetricVM };
  /** The headline performance state (target comparison, or why there is none). */
  performanceState: DisplayState;
  weight: { state: DisplayState; kg: number | null; observedAt: string | null; candidatesKg: number[] };
  gain: {
    state: DisplayState;
    adgKgPerDay: number | null;
    periodLabel: string | null;
    recentLabel: string | null;
    trend: DisplayState;
    trace: { formula: string; start: string | null; end: string | null; days: string | null } | null;
  };
  target: { state: DisplayState; label: string | null; bandLabel: string | null; source: string | null };
  /** UNAVAILABLE when C5 didn't run or produced no entry for the animal (never an empty chart). */
  chart: Availability<{ points: ChartPointVM[]; projection: { at: string; kg: number; label: string; dateLabel: string } | null; goalTarget: { kg: number; label: string; date: string | null } | null }>;
  projection: { state: DisplayState; label: string | null; at: string | null; assumptions: string[] };
  goal: { state: DisplayState; typeLabel: string | null; targetWeightLabel: string | null; targetWeightKg: number | null; targetDate: string | null; targetDateLabel: string | null; goalType: string | null };
  health: {
    /** `EVALUATION_UNAVAILABLE` when C3 produced no projection for the animal. */
    withdrawal: { state: DisplayState; label: string; until: string | null; untilLabel: string | null; product: string };
    /** KNOWN (possibly empty) vs UNAVAILABLE (the C8 context wasn't produced): never collapsed into an empty list. */
    programmes: Availability<{ label: string; state: DisplayState }[]>;
    obligations: Availability<{ label: string; state: DisplayState }[]>;
    /** UNAVAILABLE when C3 produced no projection for the animal. */
    medicines: Availability<{ date: string; label: string; product: string; withdrawal: DisplayState; withdrawalEndLabel: string | null }[]>;
  };
  recommendation: { state: DisplayState; text: string | null };
  work: {
    /** Open jobs (`primary: null` = none open); UNAVAILABLE when the planning run failed — never "no open jobs". */
    open: Availability<{ primary: WorkVM | null; others: WorkVM[] }>;
    /** Jobs the Plan kernel already closed (history: shown even when the latest run failed). */
    closed: WorkVM[];
    failureCodes: string[];
  };
  timeline: TimelineEntryVM[];
  /** Record families the timeline couldn't include because their evaluation didn't run. */
  timelineGaps: string[];
  costSummary: AnimalCostRead;
}

/** `r` is `undefined` only when the C1 snapshot itself is missing: unknown because it wasn't produced, not "not recorded". */
const field = <T>(label: string, r: AnimalResolution<T> | null | undefined, render: (v: T) => string): FieldVM => {
  if (r === undefined) return { label, value: null, state: EVALUATION_UNAVAILABLE };
  if (r === null) return { label, value: null, state: displayOf(IDENTITY_DISPLAY, "UNKNOWN", "IDENTITY") };
  return { label, value: r.state === "KNOWN" && r.value !== null ? render(r.value) : null, state: displayOf(IDENTITY_DISPLAY, r.state, "IDENTITY") };
};

const GOAL_TYPE_LABEL: Readonly<Record<string, string>> = { FINISHING: "Finishing", SALE: "Sale", RETAIN: "Keep on farm", BREEDING: "Breeding", REPLACEMENT: "Replacement" };
const SEX_LABEL: Readonly<Record<string, string>> = { MALE: "Male", FEMALE: "Female" };
const METHOD_LABEL: Readonly<Record<string, string>> = {
  SCALE: "Scale",
  WEIGHBRIDGE: "Weighbridge",
  ESTIMATE_VISUAL: "Visual estimate",
  ESTIMATE_TAPE: "Tape estimate",
  DERIVED_EXTERNAL: "External figure",
  UNKNOWN: "Method not recorded",
};

function pointVM(p: PerformancePoint): ChartPointVM {
  const first = p.inputs[0];
  const estimated = p.inputs.some((i) => i.basis !== "MEASURED");
  const state: ChartPointVM["state"] = p.state === "USABLE" ? (estimated ? "ESTIMATED" : "MEASURED") : p.state === "CONFLICT" ? "CONFLICT" : p.state === "UNSUPPORTED" ? "UNSUPPORTED" : "EXCLUDED";
  const candidates = [...new Set(p.inputs.map((i) => i.kg).filter((k): k is number => k !== null))].sort((a, b) => a - b);
  const stateLabel = { MEASURED: "Weighed", ESTIMATED: "Estimate", CONFLICT: "Weights disagree", UNSUPPORTED: "Unit not supported", EXCLUDED: "Not used" }[state];
  return {
    at: p.at,
    dateLabel: formatDate(p.at),
    kg: p.kg,
    kgLabel: p.kg !== null ? formatKg(p.kg) : state === "CONFLICT" ? candidates.map((c) => formatKg(c)).join(" or ") : "—",
    state,
    stateLabel,
    method: first ? (METHOD_LABEL[first.method] ?? first.method) : "",
    candidates,
    recordIds: p.inputs.map((i) => i.recordId),
  };
}

function seriesOf(outputs: CattleOutputs, animalId: string) {
  return outputs.weights?.series.find((s) => s.animalId === animalId) ?? null;
}

export function performanceOf(outputs: CattleOutputs, animalId: string): AnimalPerformance | null {
  return outputs.performance?.animals.find((a) => a.animalId === animalId) ?? null;
}

/** The headline performance state: the single target comparison, or why there isn't one (`null` = C5 produced no entry: unknown). */
export function headlinePerformance(perf: AnimalPerformance | null): DisplayState {
  if (perf === null) return EVALUATION_UNAVAILABLE;
  if (perf.targetOutcome === "NO_TARGET" || perf.comparisons.length === 0) return TARGET_DISPLAY.NO_TARGET;
  // More than one known target: each is shown in detail; the headline is the first by target id (C5 order), never a blend.
  return displayOf(TARGET_DISPLAY, perf.comparisons[0].state, "TARGET");
}

export function buildAnimalProfile(outputs: CattleOutputs, animalId: string, directory: CattleDirectory, costs: AnimalCostRead): AnimalProfileVM {
  const snap = outputs.snapshots[animalId] ?? null;
  const vp = outputs.viewpoint;
  const tagScheme = snap?.externalIdentifiers.byScheme.find((s) => s.scheme === directory.tagScheme) ?? null;
  const tag: FieldVM = tagScheme
    ? { label: "Tag", value: tagScheme.state === "KNOWN" ? tagScheme.value : null, state: displayOf(IDENTITY_DISPLAY, tagScheme.state, "IDENTITY") }
    : { label: "Tag", value: null, state: snap === null ? EVALUATION_UNAVAILABLE : IDENTITY_DISPLAY.UNKNOWN };

  const months = snap?.dateOfBirth.state === "KNOWN" && snap.dateOfBirth.value ? ageInMonths(snap.dateOfBirth.value, vp.effectiveAt) : null;
  const age: FieldVM = snap?.dateOfBirth.state === "KNOWN" && months !== null ? { label: "Age", value: formatAge(months), state: IDENTITY_DISPLAY.KNOWN } : field("Age", snap?.dateOfBirth, () => "");
  const groupRes = snap?.managementGroup;
  const groupRef = groupRes?.state === "KNOWN" ? groupRes.value : null;
  const group = { ...field("Group", groupRes, (v) => directory.groupLabels[v] ?? "Unnamed group"), groupRef };
  if (groupRes?.state === "CONFLICTING_EVIDENCE") group.state = MEMBERSHIP_DISPLAY.EVIDENCE_CONFLICT;
  const locRes = snap?.location;
  const location = { ...field("Location", locRes, (v) => directory.locationLabels[v.ref] ?? (v.kind === "HOUSING" ? "Housed (unnamed)" : "Unnamed location")), housed: locRes?.state === "KNOWN" && locRes.value ? locRes.value.kind === "HOUSING" : null };

  // Weight (C4) and performance (C5).
  const series = seriesOf(outputs, animalId);
  const latest = series?.latest ?? null;
  // A null C4 / C5 output — or no entry for this animal (C4 / C5 emit one per requested animal) — means the
  // evaluation didn't run for it (fail-closed upstream): unknown, never "no weights".
  const perf = performanceOf(outputs, animalId);
  const perfEvaluated = perf !== null;
  const weightState = series === null ? EVALUATION_UNAVAILABLE : displayOf(LATEST_WEIGHT_DISPLAY, series.latest.state, "WEIGHT");
  const period = perf?.period ?? null;
  const gainState = !perfEvaluated ? EVALUATION_UNAVAILABLE : period ? displayOf(GAIN_DISPLAY, period.state, "GAIN") : GAIN_DISPLAY.INSUFFICIENT_EVIDENCE;
  const lastInterval = perf ? [...perf.intervals].reverse().find((i) => i.state === "DERIVED") ?? null : null;
  const comparison = perf?.comparisons[0] ?? null;
  const headline = headlinePerformance(perf);
  const targetDef = comparison && outputs.performance ? outputs.performance.targetDefinitions.find((t) => t.targetId === comparison.targetId) : undefined;

  const goalProj = outputs.goals[animalId] ?? null;
  const goalState = goalProj ? displayOf(GOAL_DISPLAY, goalProj.status, "GOAL") : EVALUATION_UNAVAILABLE;
  const active = goalProj?.status === "ACTIVE" ? goalProj.activeGoals[0]?.declaration ?? null : null;
  const goalKg = active?.targetWeight?.canonical && active.targetWeight.canonical.state === "KNOWN" ? active.targetWeight.canonical.kg : null;

  const prediction = perf?.prediction ?? null;
  const points = (perf?.points ?? []).map(pointVM);

  // Health (C3), programmes / obligations (C8 sealed context), recommendation (C8).
  const health = outputs.health[animalId] ?? null;
  const gate = health?.withdrawalGate.entries[0] ?? null;
  const rec = outputs.recommendations.ok ? outputs.recommendations.result.animals.find((a) => a.animalId === animalId) ?? null : null;
  const ctx = rec?.context ?? null;
  const programmes: AnimalProfileVM["health"]["programmes"] =
    ctx && ctx.programmes.state === "SUPPLIED" ? known(ctx.programmes.occurrences.filter((o) => o.state !== "NOT_APPLICABLE").map((o) => ({ label: directory.programmeLabels[o.programmeId] ?? "Unnamed programme", state: displayOf(PROGRAMME_DISPLAY, o.state, "PROGRAMME") }))) : unavailable();
  const obligations: AnimalProfileVM["health"]["obligations"] =
    ctx && ctx.obligations.state === "SUPPLIED" ? known(ctx.obligations.records.filter((o) => o.state !== "NOT_APPLICABLE").map((o) => ({ label: directory.obligationLabels[o.obligationId] ?? "Unnamed requirement", state: displayOf(OBLIGATION_DISPLAY, o.state, "OBLIGATION") }))) : unavailable();
  const medicineRows = (entries: NonNullable<typeof health>["medicineLedger"]["entries"]) =>
    entries
    .filter((e) => e.status === "LIVE")
    .map((e) => {
      const w = e.withdrawals[0];
      const productId = e.binding.state === "BOUND" ? e.binding.product?.productId ?? null : null;
      return {
        date: e.occurredAt ?? "",
        label: e.occurredAt ? formatDate(e.occurredAt) : "Date not recorded",
        product: productId !== null ? (directory.productLabels[productId] ?? "Recorded product") : "Product not identified",
        withdrawal: w ? displayOf(ADMINISTRATION_WITHDRAWAL_DISPLAY, w.state, "ADMIN_WITHDRAWAL") : ADMINISTRATION_WITHDRAWAL_DISPLAY.UNKNOWN,
        withdrawalEndLabel: w?.state === "KNOWN" && w.withdrawalEnd ? `Withdrawal end ${formatDate(w.withdrawalEnd)}` : null,
      };
    });
  const medicines: AnimalProfileVM["health"]["medicines"] = health === null ? unavailable() : known(medicineRows(health.medicineLedger.entries));

  const work = animalWork(outputs, animalId, directory);
  const withdrawalState = health === null ? EVALUATION_UNAVAILABLE : gate ? displayOf(WITHDRAWAL_DISPLAY, gate.state, "WITHDRAWAL") : WITHDRAWAL_DISPLAY.UNKNOWN;
  const costMetric: MetricVM =
    costs.state === "UNAVAILABLE"
      ? { label: "Direct cost to date", value: null, unit: null, state: UNAVAILABLE_DISPLAY.COSTS, caption: null }
      : costs.state === "NONE_RECORDED"
      ? { label: "Direct cost to date", value: null, unit: null, state: { code: "COST:NONE_RECORDED", label: "No costs recorded", tone: "unknown", detail: "No direct costs are recorded for this animal yet. That isn't €0." }, caption: null }
      : costs.state !== "RECORDED" || costs.total === null
        ? { label: "Direct cost to date", value: null, unit: null, state: { code: `COST:${costs.state}`, label: costs.state === "MIXED_CURRENCY" ? "Costs in mixed currencies" : "A cost record can't be read", tone: "review", detail: null }, caption: null }
        : costs.currency !== "EUR"
          ? { label: "Direct cost to date", value: null, unit: null, state: { code: "COST:NOT_IN_EURO", label: "Costs not in euro", tone: "review", detail: `Costs are recorded in ${costs.currency}; no exchange rate is used, so no euro total is shown.` }, caption: null }
        : {
            label: "Direct cost to date",
            value: formatEuro(costs.total),
            unit: null,
            state: { code: "COST:RECORDED", label: "Recorded costs only", tone: "neutral", detail: `${costs.entryCount} recorded entr${costs.entryCount === 1 ? "y" : "ies"}; overheads not included.` },
            caption: (() => {
              const perKg = costPerKgLiveweight(costs, latest?.state === "KNOWN" ? latest.kg : null);
              return perKg === null ? null : `${formatEuroPerKg(perKg)} of liveweight`;
            })(),
          };

  return {
    animalId,
    title: tag.value ? tag.value : "Untagged animal",
    tag,
    identity: {
      breed: field("Breed", snap?.breed, (v) => v.label ?? v.code ?? "Recorded (no label)"),
      sex: field("Sex", snap?.sex, (v) => SEX_LABEL[v] ?? v),
      age,
      group,
      location,
      status: field("Status", snap?.lifecycleStatus, (v) => ({ PRESENT: "On farm", DEPARTED: "Left the farm", DECEASED: "Died" })[v] ?? v),
    },
    asOf: { effectiveAt: vp.effectiveAt, knowledgeCutoff: vp.knowledgeCutoff, label: `As of ${formatDate(vp.effectiveAt)}, ${formatUtcTime(vp.effectiveAt)}` },
    metrics: {
      weight: {
        label: "Current weight",
        value: latest?.state === "KNOWN" && latest.kg !== null ? formatKg(latest.kg).replace(" kg", "") : null,
        unit: latest?.state === "KNOWN" ? "kg" : null,
        state: weightState,
        caption: latest?.state === "KNOWN" && latest.observedAt ? `Weighed ${formatDayMonth(latest.observedAt)}` : latest?.state === "EVIDENCE_CONFLICT" ? latest.candidateKg.map((k) => formatKg(k)).join(" or ") : null,
      },
      gain: {
        label: "Daily gain",
        value: period?.state === "DERIVED" && period.adgKgPerDay !== null ? formatAdg(period.adgKgPerDay).replace(" kg/day", "") : null,
        unit: period?.state === "DERIVED" ? "kg/day" : null,
        state: gainState,
        caption: period?.state === "DERIVED" && period.from && period.to ? `${formatDayMonth(period.from)} – ${formatDayMonth(period.to)}` : null,
      },
      cost: costMetric,
    },
    performanceState: headline,
    weight: { state: weightState, kg: latest?.state === "KNOWN" ? latest.kg : null, observedAt: latest?.observedAt ?? null, candidatesKg: latest?.candidateKg ?? [] },
    gain: {
      state: gainState,
      adgKgPerDay: period?.state === "DERIVED" ? period.adgKgPerDay : null,
      periodLabel: period?.state === "DERIVED" && period.gainKg !== null && period.from && period.to ? `${formatSignedKg(period.gainKg)} from ${formatDayMonth(period.from)} to ${formatDayMonth(period.to)}` : null,
      recentLabel: lastInterval && lastInterval.gainKg !== null && lastInterval.from && lastInterval.to && lastInterval.adgKgPerDay !== null ? `${formatSignedKg(lastInterval.gainKg)} from ${formatDayMonth(lastInterval.from)} to ${formatDayMonth(lastInterval.to)} (${formatAdg(lastInterval.adgKgPerDay)})` : null,
      trend: !perfEvaluated ? EVALUATION_UNAVAILABLE : perf ? displayOf(TREND_DISPLAY, perf.trend.state, "TREND") : TREND_DISPLAY.INSUFFICIENT_EVIDENCE,
      trace: period?.trace ? { formula: period.trace.formula, start: period.from, end: period.to, days: period.elapsedDays !== null ? period.elapsedDays.toFixed(3) : null } : null,
    },
    target: {
      state: headline,
      label: comparison && comparison.targetValue !== null ? (comparison.metric === "ADG" ? `Target ${formatAdg(comparison.targetValue)}` : `Target ${formatKg(comparison.targetValue)}`) : null,
      bandLabel: comparison && comparison.lowerBound !== null && comparison.upperBound !== null ? (comparison.metric === "ADG" ? `${formatAdg(comparison.lowerBound)} – ${formatAdg(comparison.upperBound)}` : `${formatKg(comparison.lowerBound)} – ${formatKg(comparison.upperBound)}`) : null,
      source: targetDef?.versions[0] ? `${targetDef.versions[0].provenance.sourceRef?.sourceId ?? "Unsourced"} · ${targetDef.versions[0].reviewState.toLowerCase()}` : null,
    },
    // The chart plots C4 weights through C5: unavailable when either owner produced nothing for the animal.
    chart: !perfEvaluated || series === null
      ? unavailable()
      : known({
          points,
          projection: prediction && prediction.state === "PROJECTED" && prediction.projectedKg !== null ? { at: prediction.at, kg: prediction.projectedKg, label: formatKg(prediction.projectedKg), dateLabel: formatDate(prediction.at) } : null,
          goalTarget: goalKg !== null ? { kg: goalKg, label: formatKg(goalKg), date: active?.targetDate ?? null } : null,
        }),
    projection: {
      state: !perfEvaluated ? EVALUATION_UNAVAILABLE : prediction ? displayOf(PREDICTION_DISPLAY, prediction.state, "PREDICTION") : PREDICTION_DISPLAY.NOT_REQUESTED,
      label: prediction && prediction.state === "PROJECTED" && prediction.projectedKg !== null ? `${formatKg(prediction.projectedKg)} by ${formatDate(prediction.at)}` : null,
      at: prediction?.at ?? null,
      assumptions: prediction?.assumptions ?? [],
    },
    goal: {
      state: goalState,
      goalType: active?.goalType ?? null,
      typeLabel: active ? (GOAL_TYPE_LABEL[active.goalType] ?? active.goalType) : null,
      targetWeightKg: goalKg,
      targetWeightLabel: goalKg !== null ? formatKg(goalKg) : null,
      targetDate: active?.targetDate ?? null,
      targetDateLabel: active?.targetDate ? formatDate(active.targetDate) : null,
    },
    health: {
      withdrawal: {
        state: withdrawalState,
        label: withdrawalState.label,
        until: gate?.state === "IN_WITHDRAWAL" ? gate.inWithdrawalUntil : null,
        untilLabel: gate?.state === "IN_WITHDRAWAL" && gate.inWithdrawalUntil ? `Until ${formatDate(gate.inWithdrawalUntil)} (engine calculation from the product record)` : null,
        product: gate ? (directory.foodProductLabels[gate.foodProduct] ?? "Food product") : "Food product",
      },
      programmes,
      obligations,
      medicines,
    },
    recommendation: rec ? { state: displayOf(RECOMMENDATION_DISPLAY, rec.record.outcome, "RECOMMENDATION"), text: rec.record.recommendedAction?.description ?? null } : { state: EVALUATION_UNAVAILABLE, text: null },
    work: outputs.plan.ok
      ? { open: known({ primary: work.open[0] ?? null, others: work.open.slice(1) }), closed: work.closed, failureCodes: [] }
      : { open: unavailable(UNAVAILABLE_DISPLAY.PLANNING), closed: work.closed, failureCodes: outputs.plan.issues.map((i) => i.code) },
    timeline: buildAnimalTimeline(outputs, animalId, directory, costs),
    timelineGaps: [
      ...(outputs.weights === null ? ["weighings (weight records couldn't be read)"] : []),
      ...(health === null ? ["health records (couldn't be read)"] : []),
      ...(goalProj === null ? ["goals (couldn't be read)"] : []),
      ...(!outputs.plan.ok ? ["work (the planning run failed)"] : []),
      ...(costs.state === "UNAVAILABLE" ? ["costs (couldn't be read)"] : []),
    ],
    costSummary: costs,
  };
}

/** For callers that need the canonical latest-weight entries of an animal (e.g. the chart's record ids). */
export function liveObservations(outputs: CattleOutputs, animalId: string): WeightSeriesEntry[] {
  return seriesOf(outputs, animalId)?.observations ?? [];
}

export const viewpointDate = (outputs: CattleOutputs): string | null => utcDateOfInstant(outputs.viewpoint.effectiveAt);

/**
 * The C3 withdrawal gate read against a planned sale date. Reports the frozen engine's own end instant;
 * adds no rule of its own. Conservative: a sale on the calendar day the withdrawal ends counts as inside it.
 * Not a legal determination — a notice for the farmer to check before a sale for slaughter.
 */
export function saleWithdrawalNotice(w: AnimalProfileVM["health"]["withdrawal"], saleDate: string): { tone: "risk" | "unknown"; text: string } | null {
  if (!isPlanDate(saleDate)) return null;
  const product = w.product.toLowerCase();
  if (w.state.code === "WITHDRAWAL:CLEAR") return null;
  if (w.state.code === "WITHDRAWAL:IN_WITHDRAWAL") {
    const end = w.until ? utcDateOfInstant(w.until) : null;
    if (end === null) return { tone: "unknown", text: `In a medicine withdrawal (${product}) with no known end. Check the medicine records before any sale for slaughter.` };
    return saleDate <= end ? { tone: "risk", text: `This sale date is inside the medicine withdrawal (${product}), which runs until ${formatDate(w.until as string)}. Don't sell for slaughter before it ends.` } : null;
  }
  return { tone: "unknown", text: `Medicine withdrawal (${product}) is ${w.state.code === "WITHDRAWAL:EVIDENCE_CONFLICT" ? "disputed by conflicting records" : "unknown"}. Check the medicine records before any sale for slaughter.` };
}
