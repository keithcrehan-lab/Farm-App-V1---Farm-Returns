/**
 * Cattle C10 — every weight a farmer sees (current weight, the previous weight
 * on the record sheet, the herd row, the activity timeline, the weight chart),
 * admitted from the frozen C4 series and C5 performance outputs.
 *
 * Two invariants live here:
 *
 * - Known vs unavailable (A): the latest weight is KNOWN, NONE (C4: no
 *   observation in view), CONFLICT, UNSUPPORTED or UNAVAILABLE (C4 produced no
 *   series); the chart is CHART, NOT_CHARTABLE (records exist, none can be
 *   plotted), EMPTY (C4 and C5 both say there are no weights) or UNAVAILABLE.
 *   Only C4's own NONE / an empty C4 series is ever "no weights".
 * - Provenance (material provenance survives the boundary): how a weight was
 *   obtained is C4's `measurementBasis` of the contributing record (the KNOWN
 *   latest weight is exactly one record, `latest.recordIds[0]`). Only a
 *   MEASURED (scale / weighbridge) value is ever "Weighed"; an estimate, an
 *   external figure or an unrecorded method each says what it is.
 *
 * No calculation: values are C4 / C5 outputs; formatting rounds for display only.
 */

import type { AnimalPerformance, PerformancePoint } from "../performance";
import type { AnimalWeightSeries, WeightCollectionMethod, WeightMeasurementBasis } from "../weights";
import { admitProjectedWeight, type CurrentWeightRead } from "../../animal-plan";
import type { GoalTargetRead } from "./goal-read";
import { EMPTY_DISPLAY, EVALUATION_UNAVAILABLE, LATEST_WEIGHT_DISPLAY, NOT_CHARTABLE_DISPLAY, UNAVAILABLE_DISPLAY, WEIGHT_BASIS_DISPLAY, displayOf, type DisplayState } from "./display-states";
import { formatDate, formatDayMonth, formatKg } from "./format";
import { canonicalNumberText } from "./numeric-input";
import { details, nonEmpty, type Details, type NonEmpty } from "./view-state";

export const WEIGHT_METHOD_LABEL: Readonly<Record<WeightCollectionMethod, string>> = {
  SCALE: "Scale",
  WEIGHBRIDGE: "Weighbridge",
  ESTIMATE_VISUAL: "Visual estimate",
  ESTIMATE_TAPE: "Tape estimate",
  DERIVED_EXTERNAL: "External figure",
  UNKNOWN: "Method not recorded",
};

const methodLabel = (method: string): string => (Object.hasOwn(WEIGHT_METHOD_LABEL, method) ? WEIGHT_METHOD_LABEL[method as WeightCollectionMethod] : "Method not recorded");

/** How a weight was obtained, from C4 (never inferred from the value or the label). */
export interface WeightBasisVM {
  kind: WeightMeasurementBasis;
  /** "Scale", "Tape estimate", "Visual estimate", … */
  methodLabel: string;
  display: DisplayState;
}

export function weightBasisOf(basis: WeightMeasurementBasis, method: string): WeightBasisVM {
  return { kind: basis, methodLabel: methodLabel(method), display: displayOf(WEIGHT_BASIS_DISPLAY, basis, "WEIGHT_BASIS") };
}

/**
 * The animal's latest weight, explicitly (C4 `latest`, or UNAVAILABLE when C4 produced no series for
 * the animal). Each state is its own: a conflict or an unavailable evaluation is never "no weight",
 * and a KNOWN weight always carries its measurement basis.
 */
export type LatestWeightVM =
  | { state: "KNOWN"; kg: number; observedAt: string; basis: WeightBasisVM; display: DisplayState }
  | { state: "NONE"; display: DisplayState }
  | { state: "CONFLICT"; candidatesKg: Details<number>; observedAt: string | null; display: DisplayState }
  | { state: "UNSUPPORTED"; display: DisplayState }
  | { state: "UNAVAILABLE"; display: DisplayState };

type SeriesRead = Pick<AnimalWeightSeries, "latest" | "observations">;

/** The explicit latest weight of a C4 series (`null` series = C4 produced nothing for the animal: UNAVAILABLE). */
export function latestWeightOf(series: SeriesRead | null): LatestWeightVM {
  if (series === null) return { state: "UNAVAILABLE", display: EVALUATION_UNAVAILABLE };
  const l = series.latest;
  switch (l.state) {
    case "KNOWN": {
      // Exactly one live record at the latest instant (C4 precedence); its basis is the weight's provenance.
      const entry = l.recordIds.length === 1 ? series.observations.find((o) => o.recordId === l.recordIds[0]) : undefined;
      // A KNOWN weight whose record (and so its provenance) can't be found is not shown as a weight.
      if (l.kg === null || !Number.isFinite(l.kg) || l.observedAt === null || entry === undefined) return { state: "UNAVAILABLE", display: EVALUATION_UNAVAILABLE };
      const basis = weightBasisOf(entry.measurementBasis, entry.observation.method);
      return { state: "KNOWN", kg: l.kg, observedAt: l.observedAt, basis, display: basis.display };
    }
    case "NONE":
      return { state: "NONE", display: LATEST_WEIGHT_DISPLAY.NONE };
    case "EVIDENCE_CONFLICT":
      return { state: "CONFLICT", candidatesKg: details([...l.candidateKg]), observedAt: l.observedAt, display: LATEST_WEIGHT_DISPLAY.EVIDENCE_CONFLICT };
    case "UNSUPPORTED":
      return { state: "UNSUPPORTED", display: LATEST_WEIGHT_DISPLAY.UNSUPPORTED };
    default:
      return { state: "UNAVAILABLE", display: displayOf(LATEST_WEIGHT_DISPLAY, l.state, "WEIGHT") };
  }
}

/** "Weighed 14 Oct" only for a measured weight; "Tape estimate · 14 Oct", "External figure · 14 Oct", … otherwise. */
export function weightCaption(w: Extract<LatestWeightVM, { state: "KNOWN" }>): string {
  return w.basis.kind === "MEASURED" ? `Weighed ${formatDayMonth(w.observedAt)}` : `${w.basis.methodLabel} · ${formatDayMonth(w.observedAt)}`;
}

/** The current weight a plan may use, with each unknown reason kept (never one generic "unknown"). */
export function currentWeightInput(w: LatestWeightVM): CurrentWeightRead {
  switch (w.state) {
    case "KNOWN":
      return { state: "KNOWN", kg: w.kg };
    case "NONE":
      return { state: "UNKNOWN", reason: "NOT_WEIGHED" };
    case "CONFLICT":
      return { state: "UNKNOWN", reason: "WEIGHTS_DISAGREE" };
    case "UNSUPPORTED":
      return { state: "UNKNOWN", reason: "UNIT_NOT_SUPPORTED" };
    case "UNAVAILABLE":
      return { state: "UNKNOWN", reason: "WEIGHTS_UNAVAILABLE" };
  }
}

/** A canonical weight shown without losing its recorded decimals (up to 2 places, trailing zeros dropped). */
export function formatKgExact(kg: number): string {
  return `${Number(kg.toFixed(2)).toString()} kg`;
}

/**
 * The record-weight sheet's "previous weight" line. Absence wording ("No earlier weight recorded.")
 * is reserved for C4's confirmed NONE; a conflict, an unsupported unit and an unavailable evaluation
 * each say what they are; an estimate says it was an estimate. The previous weight is never
 * invented, averaged or picked from a conflict.
 */
export function previousWeightLine(w: LatestWeightVM): { tone: DisplayState["tone"]; text: string } {
  switch (w.state) {
    case "KNOWN":
      return { tone: "neutral", text: `Last recorded ${formatKgExact(w.kg)} on ${formatDayMonth(w.observedAt)}${w.basis.kind === "MEASURED" ? "" : ` (${w.basis.methodLabel.toLowerCase()})`}.` };
    case "NONE":
      return { tone: "unknown", text: "No earlier weight recorded." };
    case "CONFLICT":
      return { tone: "conflict", text: `Previous weight couldn't be determined — records disagree${w.candidatesKg.length > 0 ? ` (${w.candidatesKg.map((k) => formatKgExact(k)).join(" or ")})` : ""}.` };
    case "UNSUPPORTED":
      return { tone: "review", text: "Previous weight couldn't be used — it's in a unit that can't be converted to kilograms." };
    case "UNAVAILABLE":
      return { tone: "unknown", text: "Previous weight couldn't be checked." };
  }
}

/**
 * The record-weight sheet's entry: it starts from the exact previous weight when one is KNOWN
 * (invariant B: never a rounded one), else empty; steppers step from that same exact text.
 */
export function weightEntryStart(w: LatestWeightVM): { initialText: string; stepFrom: string | null } {
  const exact = w.state === "KNOWN" ? canonicalNumberText(w.kg) : null;
  return exact === null ? { initialText: "", stepFrom: null } : { initialText: exact, stepFrom: exact };
}

/** A herd row's weight: the value and its date line ("14 Oct", or "14 Oct · tape estimate"), else the state. */
export function weightRowOf(w: LatestWeightVM): { label: string | null; dateLine: string | null; state: DisplayState } {
  if (w.state !== "KNOWN") return { label: null, dateLine: null, state: w.display };
  return { label: formatKg(w.kg), dateLine: w.basis.kind === "MEASURED" ? formatDayMonth(w.observedAt) : `${formatDayMonth(w.observedAt)} · ${w.basis.methodLabel.toLowerCase()}`, state: w.display };
}

/** A timeline title for one C4 record: "Weighed 548 kg" only when measured. */
export function weightRecordTitle(kg: number | null, basis: WeightMeasurementBasis, method: string): string {
  if (kg === null) return "Weight recorded (unit not convertible)";
  if (basis === "MEASURED") return `Weighed ${formatKg(kg)}`;
  if (basis === "UNKNOWN") return `Weight ${formatKg(kg)} (method not recorded)`;
  return `${methodLabel(method)} ${formatKg(kg)}`;
}

// ---------------------------------------------------------------------------
// The weight chart.

/** Where a point sits on the chart: a value, competing candidates (never averaged), or nothing to plot. */
export type ChartPlot = { kind: "VALUE"; kg: number } | { kind: "CANDIDATES"; candidatesKg: NonEmpty<number> } | { kind: "NOT_PLOTTED" };

export type ChartPointKind = "MEASURED" | "ESTIMATED" | "DERIVED" | "METHOD_UNKNOWN" | "CONFLICT" | "UNSUPPORTED" | "EXCLUDED";

export interface ChartPointVM {
  at: string;
  dateLabel: string;
  plot: ChartPlot;
  kgLabel: string;
  kind: ChartPointKind;
  /** "Weighed" only for MEASURED. */
  stateLabel: string;
  /** "Scale", "Tape estimate", …; always set ("Method not recorded" when it isn't). */
  methodLabel: string;
  /** Drawn solid only when MEASURED; every other basis is drawn hollow. */
  style: "MEASURED" | "NOT_MEASURED" | "CONFLICT" | "NOT_PLOTTED";
  recordIds: Details<string>;
}

/** NOT_USABLE: C5 projected a weight `admitProjectedWeight` refuses (zero or less) — said in `note`, never drawn. */
export type ChartOverlay = { state: "SHOWN"; at: string; kg: number; label: string; dateLabel: string; from: { at: string; kg: number } } | { state: "NOT_USABLE"; note: string } | { state: "NOT_SHOWN" };
/** The goal target as the chart needs it: the sole goal's target (UNRESOLVED: recorded, no kg conversion), or SEVERAL goals in force (none drawn). */
export type GoalTargetWeightRead = GoalTargetRead | { state: "SEVERAL"; count: number };
/** UNRESOLVED: a goal target exists but can't be drawn — said in `note`, never silently dropped. */
export type GoalOverlay = { state: "SHOWN"; kg: number; label: string } | { state: "UNRESOLVED"; note: string } | { state: "NOT_SHOWN" };

export type WeightChartVM =
  | {
      state: "CHART";
      points: NonEmpty<ChartPointVM>;
      /** The plotted single values, in order (the drawn line). */
      line: Details<{ at: string; kg: number }>;
      /** The C5 PREDICTION — drawn dashed and labelled a prediction, never like a weighing. */
      projection: ChartOverlay;
      goalTarget: GoalOverlay;
      legend: Details<{ style: ChartPointVM["style"] | "PROJECTED"; label: string }>;
      /** Records on the chart's dates that aren't drawn, and why. */
      notCharted: string | null;
    }
  /** Weight records exist but none can be plotted: listed, never "no weights". */
  | { state: "NOT_CHARTABLE"; display: DisplayState; points: NonEmpty<ChartPointVM> }
  /** C4 and C5 evaluated and there is no weight in view. */
  | { state: "EMPTY"; display: DisplayState }
  | { state: "UNAVAILABLE"; display: DisplayState };

const POINT_LABEL: Readonly<Record<ChartPointKind, string>> = {
  MEASURED: "Weighed",
  ESTIMATED: "Estimate",
  DERIVED: "External figure",
  METHOD_UNKNOWN: "Method not recorded",
  CONFLICT: "Weights disagree",
  UNSUPPORTED: "Unit not supported",
  EXCLUDED: "Not used",
};

function pointKind(p: PerformancePoint): ChartPointKind {
  if (p.state === "CONFLICT") return "CONFLICT";
  if (p.state === "UNSUPPORTED") return "UNSUPPORTED";
  if (p.state === "EXCLUDED") return "EXCLUDED";
  const bases = p.inputs.map((i) => i.basis);
  if (bases.length > 0 && bases.every((b) => b === "MEASURED")) return "MEASURED";
  if (bases.length === 0 || bases.includes("UNKNOWN")) return "METHOD_UNKNOWN";
  return bases.includes("DERIVED") ? "DERIVED" : "ESTIMATED";
}

export function chartPointOf(p: PerformancePoint): ChartPointVM {
  const kind = pointKind(p);
  const candidates = nonEmpty([...new Set(p.inputs.map((i) => i.kg).filter((k): k is number => k !== null))].sort((a, b) => a - b));
  const plot: ChartPlot =
    p.state === "USABLE" && p.kg !== null && Number.isFinite(p.kg) ? { kind: "VALUE", kg: p.kg } : kind === "CONFLICT" && candidates !== null ? { kind: "CANDIDATES", candidatesKg: candidates } : { kind: "NOT_PLOTTED" };
  const methods = [...new Set(p.inputs.map((i) => methodLabel(i.method)))];
  return {
    at: p.at,
    dateLabel: formatDate(p.at),
    plot,
    kgLabel: plot.kind === "VALUE" ? formatKg(plot.kg) : plot.kind === "CANDIDATES" ? plot.candidatesKg.map((c) => formatKg(c)).join(" or ") : "—",
    kind,
    stateLabel: POINT_LABEL[kind],
    methodLabel: methods.length > 0 ? methods.join(" + ") : "Method not recorded",
    style: plot.kind === "NOT_PLOTTED" ? "NOT_PLOTTED" : plot.kind === "CANDIDATES" ? "CONFLICT" : kind === "MEASURED" ? "MEASURED" : "NOT_MEASURED",
    recordIds: details(p.inputs.map((i) => i.recordId)),
  };
}

/**
 * The chart of one animal: C4 series + C5 performance (both required; either missing = UNAVAILABLE).
 * EMPTY only when C4 has no observation in view and C5 has no point; records that exist but can't be
 * plotted (an unsupported unit, excluded records) are NOT_CHARTABLE — never "no weights recorded".
 */
export function weightChartOf(series: Pick<AnimalWeightSeries, "observations"> | null, perf: Pick<AnimalPerformance, "points" | "prediction"> | null, goalTarget: GoalTargetWeightRead): WeightChartVM {
  if (series === null || perf === null) return { state: "UNAVAILABLE", display: UNAVAILABLE_DISPLAY.WEIGHT_HISTORY };
  const points = nonEmpty(perf.points.map(chartPointOf));
  if (points === null) {
    // C5 plotted nothing: "no weights" only when C4 agrees there are none; otherwise the evaluation is incomplete.
    return series.observations.length === 0 ? { state: "EMPTY", display: EMPTY_DISPLAY.WEIGHTS } : { state: "UNAVAILABLE", display: UNAVAILABLE_DISPLAY.WEIGHT_HISTORY };
  }
  if (points.every((p) => p.plot.kind === "NOT_PLOTTED")) {
    return { state: "NOT_CHARTABLE", display: points.some((p) => p.kind === "UNSUPPORTED") ? NOT_CHARTABLE_DISPLAY.UNSUPPORTED : NOT_CHARTABLE_DISPLAY.EXCLUDED, points };
  }
  const line = points.flatMap((p) => (p.plot.kind === "VALUE" ? [{ at: p.at, kg: p.plot.kg }] : []));
  const last = line.length > 0 ? line[line.length - 1] : null;
  const prediction = perf.prediction;
  const admitted = prediction && prediction.state === "PROJECTED" && prediction.projectedKg !== null ? admitProjectedWeight(prediction.projectedKg) : null;
  const projection: ChartOverlay =
    prediction === null || admitted === null || last === null
      ? { state: "NOT_SHOWN" }
      : admitted.state === "USABLE"
        ? { state: "SHOWN", at: prediction.at, kg: admitted.kg, label: formatKg(admitted.kg), dateLabel: formatDate(prediction.at), from: last }
        : { state: "NOT_USABLE", note: "No projection is drawn — continuing the recent daily gain gives a weight of zero or less, which can't be right." };
  const has = (style: ChartPointVM["style"]) => points.some((p) => p.style === style);
  const legend = [
    ...(has("MEASURED") ? [{ style: "MEASURED" as const, label: "Weighed" }] : []),
    ...(has("NOT_MEASURED") ? [{ style: "NOT_MEASURED" as const, label: "Estimate or other source" }] : []),
    ...(projection.state === "SHOWN" ? [{ style: "PROJECTED" as const, label: "Projected (prediction)" }] : []),
    ...(has("CONFLICT") ? [{ style: "CONFLICT" as const, label: "Weights disagree" }] : []),
  ];
  const unplotted = points.filter((p) => p.plot.kind === "NOT_PLOTTED");
  const unsupported = unplotted.filter((p) => p.kind === "UNSUPPORTED").length;
  const notCharted =
    unplotted.length === 0
      ? null
      : `${unplotted.length} record${unplotted.length === 1 ? " isn't" : "s aren't"} charted${unsupported > 0 ? ` — ${unsupported === unplotted.length ? "" : "some "}in a weight unit Farm Return can't currently convert to kilograms` : " — they can't be used"}.`;
  return {
    state: "CHART",
    points,
    line: details(line),
    projection,
    goalTarget:
      goalTarget.state === "KNOWN"
        ? { state: "SHOWN", kg: goalTarget.kg, label: formatKg(goalTarget.kg) }
        : goalTarget.state === "UNRESOLVED"
          ? { state: "UNRESOLVED", note: `Goal target ${goalTarget.recorded} isn't drawn — it can't be converted to kilograms.` }
          : goalTarget.state === "SEVERAL"
            ? { state: "UNRESOLVED", note: `${goalTarget.count} goals are in force, so no single goal target is drawn — each is listed under Goal.` }
            : { state: "NOT_SHOWN" },
    legend: details(legend),
    notCharted,
  };
}
