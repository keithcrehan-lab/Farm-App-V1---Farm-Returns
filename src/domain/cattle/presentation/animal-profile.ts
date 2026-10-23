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

import { animalAssertionHistory, type AnimalResolution } from "../animal-snapshot";
import type { AnimalLocationRef } from "../animal-ledger";
import type { AnimalPerformance } from "../performance";
import { admitProjectedWeight, isPlanDate, projectionDaysAhead, utcDateOfInstant, type AnimalCostRead, type HousingObservation } from "../../animal-plan";
import type { CattleDirectory, CattleOutputs } from "./cattle-outputs";
import { activeGoalOf, goalSummaryText, soleActiveGoal, type ActiveGoalRead } from "./goal-read";
import {
  ADMINISTRATION_WITHDRAWAL_DISPLAY,
  EMPTY_DISPLAY,
  EVALUATION_UNAVAILABLE,
  GAIN_DISPLAY,
  GOAL_DISPLAY,
  IDENTITY_DISPLAY,
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
import { ageInMonths, formatAdg, formatAge, formatDate, formatDayMonth, formatEuro, formatEuroPerKg, formatKg, formatProjectedKg, formatSignedKg, formatUtcTime } from "./format";
import { costView, type CostVM } from "./cost-view";
import { buildAnimalTimeline, type TimelineEntryVM } from "./timeline";
import { details, listingOf, nonEmpty, unavailableListing, type Details, type Listing } from "./view-state";
import { latestWeightOf, weightCaption, weightChartOf, type LatestWeightVM, type WeightChartVM } from "./weight-view";
import { animalWork, type WorkVM } from "./work-view";

export interface FieldVM {
  label: string;
  /** Display text when resolved; `null` otherwise (render `state`). */
  value: string | null;
  state: DisplayState;
}

export interface MetricVM {
  label: string;
  /** Large numeral (resolved) or `null`. */
  value: string | null;
  unit: string | null;
  state: DisplayState;
  caption: string | null;
}

/**
 * The animal's goals, explicitly: ACTIVE with every goal in force (none chosen; each target KNOWN, NOT_SET or UNRESOLVED),
 * known NONE, or UNRESOLVED (goals conflict, a goal record can't be read, or goals couldn't be read)
 * — never "no goal" unless C6 says so.
 */
export type GoalRead =
  /** Every C6 goal in force (one or more), each with its target KNOWN, NOT_SET or UNRESOLVED (`goal-read.ts`). */
  | { state: "ACTIVE"; goals: readonly [ActiveGoalRead, ...ActiveGoalRead[]] }
  | { state: "NONE" }
  | { state: "UNRESOLVED"; display: DisplayState };

export interface AnimalProfileVM {
  animalId: string;
  title: string;
  tag: FieldVM;
  identity: {
    breed: FieldVM;
    sex: FieldVM;
    age: FieldVM;
    /** `backLabel`: the group's name, or "Cattle" when the group isn't resolved (the back link then goes to the herd). */
    group: FieldVM & { groupRef: string | null; backLabel: string };
    /** `housing`: what the recorded location's KIND establishes (`housingObservationOf`); `housingNote` e.g. "(housed)". */
    location: FieldVM & { housing: HousingObservation; housingNote: string | null };
    status: FieldVM;
  };
  asOf: { effectiveAt: string; knowledgeCutoff: string; label: string };
  metrics: { weight: MetricVM; gain: MetricVM; cost: MetricVM };
  /** The headline performance state (target comparison, or why there is none). */
  performanceState: DisplayState;
  weight: LatestWeightVM;
  gain: {
    state: DisplayState;
    periodLabel: string | null;
    /** The most recent derived interval; "No interval worked out yet" (known) or unavailable when C5 produced nothing. */
    recent: FieldVM;
    trend: DisplayState;
  };
  /** `label`: "Target 1.20 kg/day (band 1.00 – 1.40 kg/day)" — the band only when C5 gives one. */
  target: { state: DisplayState; label: string | null; bandLabel: string | null; source: string | null };
  /** The weight chart: CHART / NOT_CHARTABLE / EMPTY / UNAVAILABLE (`weightChartOf`) — never an empty plot. */
  chart: WeightChartVM;
  projection: { state: DisplayState; label: string | null; at: string | null; assumptions: Details<string> };
  /**
   * `summary`: the goal as one resolved line (ACTIVE: type, target weight — known, not set or
   * unresolved — and target date), or the goal state when there is no active goal.
   */
  goal: { state: DisplayState; read: GoalRead; summary: { state: "TEXT"; text: string } | { state: "STATE"; display: DisplayState } };
  health: {
    /** `EVALUATION_UNAVAILABLE` when C3 produced no projection for the animal. */
    withdrawal: { state: DisplayState; label: string; until: string | null; untilLabel: string | null; product: string };
    /** ITEMS / EMPTY ("not in any declared programme") / UNAVAILABLE (the C8 context wasn't produced). */
    programmes: Listing<{ label: string; state: DisplayState }>;
    obligations: Listing<{ label: string; state: DisplayState }>;
    /** UNAVAILABLE when C3 produced no projection for the animal. */
    medicines: Listing<{ date: string; label: string; product: string; withdrawal: DisplayState; withdrawalEndLabel: string | null }>;
    /** "3 medicine records" (only when there are some). */
    medicinesLabel: string | null;
  };
  recommendation: { state: DisplayState; text: string | null };
  work: {
    /** The primary open job and the rest; EMPTY = known none open; UNAVAILABLE when the planning run failed — never "no open jobs". */
    open:
      | { state: "ITEMS"; primary: WorkVM; others: Details<WorkVM>; othersLabel: string | null }
      | { state: "EMPTY"; display: DisplayState }
      | { state: "UNAVAILABLE"; display: DisplayState; failureCodes: Details<string> };
    /** Jobs the Plan kernel already closed (history: shown even when the latest run failed). */
    closed: Details<WorkVM>;
  };
  /** Dated records, newest first; EMPTY only when every record family was read; UNAVAILABLE when none listed and some couldn't be read. */
  timeline: Listing<TimelineEntryVM>;
  /** Record families the timeline couldn't include because their evaluation didn't run. */
  timelineGaps: Details<string>;
  /** "Not shown: …." when any family is missing. */
  timelineGapNote: string | null;
  /** The display reading of the animal's cost summary (the only one components use). */
  costs: CostVM;
}

/** `r` is `undefined` only when the C1 snapshot itself is missing: unknown because it wasn't produced, not "not recorded". */
const field = <T>(label: string, r: AnimalResolution<T> | null | undefined, render: (v: T) => string): FieldVM => {
  if (r === undefined) return { label, value: null, state: EVALUATION_UNAVAILABLE };
  if (r === null) return { label, value: null, state: displayOf(IDENTITY_DISPLAY, "UNKNOWN", "IDENTITY") };
  return { label, value: r.state === "KNOWN" && r.value !== null ? render(r.value) : null, state: displayOf(IDENTITY_DISPLAY, r.state, "IDENTITY") };
};

/** The goal line: the one goal in force, or every goal when several are (none is picked). */
export function goalLineText(goals: readonly [ActiveGoalRead, ...ActiveGoalRead[]]): string {
  return goals.length === 1 ? goalSummaryText(goals[0]) : `${goals.length} goals in force — ${goals.map(goalSummaryText).join("; ")}`;
}

const SEX_LABEL: Readonly<Record<string, string>> = { MALE: "Male", FEMALE: "Female" };
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

/**
 * The housing state a recorded location ESTABLISHES, by its C1 kind only (authorised mapping,
 * 2026-10-21): HOUSING → housed; FIELD → outdoors; HOLDING, EXTERNAL and OTHER don't say whether the
 * animal is housed → UNKNOWN (`LOCATION_NOT_SPECIFIC`). Never inferred from the opaque ref or a
 * label; a missing, disputed or unreadable location is UNKNOWN with its own reason.
 */
export const LOCATION_KIND_HOUSING = {
  HOUSING: { state: "KNOWN", housed: true },
  FIELD: { state: "KNOWN", housed: false },
  HOLDING: { state: "UNKNOWN", reason: "LOCATION_NOT_SPECIFIC" },
  EXTERNAL: { state: "UNKNOWN", reason: "LOCATION_NOT_SPECIFIC" },
  OTHER: { state: "UNKNOWN", reason: "LOCATION_NOT_SPECIFIC" },
} as const satisfies Readonly<Record<AnimalLocationRef["kind"], HousingObservation>>;

/** `undefined` = the C1 snapshot itself is missing (RECORD_UNAVAILABLE). */
export function housingObservationOf(loc: AnimalResolution<AnimalLocationRef> | undefined): HousingObservation {
  if (loc === undefined) return { state: "UNKNOWN", reason: "RECORD_UNAVAILABLE" };
  if (loc.state === "KNOWN" && loc.value) {
    return Object.hasOwn(LOCATION_KIND_HOUSING, loc.value.kind) ? { ...LOCATION_KIND_HOUSING[loc.value.kind] } : { state: "UNKNOWN", reason: "RECORD_INVALID" };
  }
  return { state: "UNKNOWN", reason: loc.state === "CONFLICTING_EVIDENCE" ? "RECORDS_DISAGREE" : loc.state === "INVALID_EVIDENCE" ? "RECORD_INVALID" : "NOT_RECORDED" };
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
  const groupField = field("Group", groupRes, (v) => directory.groupLabels[v] ?? "Unnamed group");
  const group = { ...groupField, groupRef, backLabel: groupRef !== null && groupField.value !== null ? groupField.value : "Cattle" };
  if (groupRes?.state === "CONFLICTING_EVIDENCE") group.state = MEMBERSHIP_DISPLAY.EVIDENCE_CONFLICT;
  const locRes = snap?.location;
  const housing = housingObservationOf(locRes);
  const location = {
    ...field("Location", locRes, (v) => directory.locationLabels[v.ref] ?? (v.kind === "HOUSING" ? "Housed (unnamed)" : "Unnamed location")),
    housing,
    housingNote: housing.state === "KNOWN" && housing.housed ? "(housed)" : null,
  };

  // Weight (C4) and performance (C5).
  const series = seriesOf(outputs, animalId);
  // A null C4 / C5 output — or no entry for this animal (C4 / C5 emit one per requested animal) — means the
  // evaluation didn't run for it (fail-closed upstream): unknown, never "no weights".
  const perf = performanceOf(outputs, animalId);
  const perfEvaluated = perf !== null;
  const period = perf?.period ?? null;
  const gainState = !perfEvaluated ? EVALUATION_UNAVAILABLE : period ? displayOf(GAIN_DISPLAY, period.state, "GAIN") : GAIN_DISPLAY.INSUFFICIENT_EVIDENCE;
  const lastInterval = perf ? [...perf.intervals].reverse().find((i) => i.state === "DERIVED") ?? null : null;
  const comparison = perf?.comparisons[0] ?? null;
  const headline = headlinePerformance(perf);
  const targetDef = comparison && outputs.performance ? outputs.performance.targetDefinitions.find((t) => t.targetId === comparison.targetId) : undefined;

  const bandLabel = comparison && comparison.lowerBound !== null && comparison.upperBound !== null ? (comparison.metric === "ADG" ? `${formatAdg(comparison.lowerBound)} – ${formatAdg(comparison.upperBound)}` : `${formatKg(comparison.lowerBound)} – ${formatKg(comparison.upperBound)}`) : null;

  const goalProj = outputs.goals[animalId] ?? null;
  const goalState = goalProj ? displayOf(GOAL_DISPLAY, goalProj.status, "GOAL") : EVALUATION_UNAVAILABLE;
  // Every goal C6 has in force, in C6's order — never only the first.
  const activeGoals = goalProj?.status === "ACTIVE" ? goalProj.activeGoals.map((g) => activeGoalOf(g.declaration)) : [];
  const goalRead: GoalRead =
    goalProj === null
      ? { state: "UNRESOLVED", display: EVALUATION_UNAVAILABLE }
      : goalProj.status === "NONE"
        ? { state: "NONE" }
        : goalProj.status === "ACTIVE" && activeGoals.length > 0
          ? { state: "ACTIVE", goals: activeGoals as [ActiveGoalRead, ...ActiveGoalRead[]] }
          : { state: "UNRESOLVED", display: goalState };
  const soleGoal = goalRead.state === "ACTIVE" ? soleActiveGoal(goalRead.goals) : null;

  const prediction = perf?.prediction ?? null;
  // C5 extrapolates without bounds: the projected weight is shown only through the C10 admission the plan also uses.
  const projectedKg = prediction && prediction.state === "PROJECTED" && prediction.projectedKg !== null ? admitProjectedWeight(prediction.projectedKg, projectionDaysAhead(outputs.viewpoint.effectiveAt, prediction.at)) : null;

  // Health (C3), programmes / obligations (C8 sealed context), recommendation (C8).
  const health = outputs.health[animalId] ?? null;
  const gate = health?.withdrawalGate.entries[0] ?? null;
  const rec = outputs.recommendations.ok ? outputs.recommendations.result.animals.find((a) => a.animalId === animalId) ?? null : null;
  const ctx = rec?.context ?? null;
  const programmes: AnimalProfileVM["health"]["programmes"] =
    ctx && ctx.programmes.state === "SUPPLIED"
      ? listingOf(
          ctx.programmes.occurrences.filter((o) => o.state !== "NOT_APPLICABLE").map((o) => ({ label: directory.programmeLabels[o.programmeId] ?? "Unnamed programme", state: displayOf(PROGRAMME_DISPLAY, o.state, "PROGRAMME") })),
          EMPTY_DISPLAY.PROGRAMMES,
        )
      : unavailableListing(UNAVAILABLE_DISPLAY.HEALTH_CONTEXT);
  const obligations: AnimalProfileVM["health"]["obligations"] =
    ctx && ctx.obligations.state === "SUPPLIED"
      ? listingOf(
          ctx.obligations.records.filter((o) => o.state !== "NOT_APPLICABLE").map((o) => ({ label: directory.obligationLabels[o.obligationId] ?? "Unnamed requirement", state: displayOf(OBLIGATION_DISPLAY, o.state, "OBLIGATION") })),
          EMPTY_DISPLAY.OBLIGATIONS,
        )
      : unavailableListing(UNAVAILABLE_DISPLAY.HEALTH_CONTEXT);
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
  const medicines: AnimalProfileVM["health"]["medicines"] = health === null ? unavailableListing(UNAVAILABLE_DISPLAY.HEALTH) : listingOf(medicineRows(health.medicineLedger.entries), EMPTY_DISPLAY.MEDICINES);

  const work = animalWork(outputs, animalId, directory);
  const withdrawalState = health === null ? EVALUATION_UNAVAILABLE : gate ? displayOf(WITHDRAWAL_DISPLAY, gate.state, "WITHDRAWAL") : WITHDRAWAL_DISPLAY.UNKNOWN;
  const weight = latestWeightOf(series);
  const cv = costView(costs, weight.state === "KNOWN" ? weight.kg : null);
  const costMetric: MetricVM =
    cv.state === "RECORDED"
      ? { label: "Direct cost to date", value: formatEuro(cv.total), unit: null, state: cv.display, caption: cv.perKgLiveweight === null ? null : `${formatEuroPerKg(cv.perKgLiveweight)} of liveweight` }
      : { label: "Direct cost to date", value: null, unit: null, state: cv.display, caption: null };

  const primary = work.open[0];
  const others = work.open.slice(1);
  const timeline = buildAnimalTimeline(outputs, animalId, directory, costs);
  const timelineGaps = [
    ...(series === null ? ["weighings (weight records couldn't be read)"] : []),
    ...(health === null ? ["health records (couldn't be read)"] : []),
    ...(goalProj === null ? ["goals (couldn't be read)"] : []),
    ...(!outputs.plan.ok ? ["work (the planning run failed)"] : []),
    ...(costs.state === "UNAVAILABLE" ? ["costs (couldn't be read)"] : []),
    ...timelineHistoryGaps(outputs, animalId),
  ];

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
        value: weight.state === "KNOWN" ? formatKg(weight.kg).replace(" kg", "") : null,
        unit: weight.state === "KNOWN" ? "kg" : null,
        state: weight.display,
        // The caption carries the measurement basis: "Weighed 14 Oct" only for a measured weight.
        caption: weight.state === "KNOWN" ? weightCaption(weight) : weight.state === "CONFLICT" ? weight.candidatesKg.map((k) => formatKg(k)).join(" or ") : null,
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
    weight,
    gain: {
      state: gainState,
      periodLabel: period?.state === "DERIVED" && period.gainKg !== null && period.from && period.to ? `${formatSignedKg(period.gainKg)} from ${formatDayMonth(period.from)} to ${formatDayMonth(period.to)}` : null,
      recent: !perfEvaluated
        ? { label: "Most recent", value: null, state: EVALUATION_UNAVAILABLE }
        : lastInterval && lastInterval.gainKg !== null && lastInterval.from && lastInterval.to && lastInterval.adgKgPerDay !== null
          ? { label: "Most recent", value: `${formatSignedKg(lastInterval.gainKg)} from ${formatDayMonth(lastInterval.from)} to ${formatDayMonth(lastInterval.to)} (${formatAdg(lastInterval.adgKgPerDay)})`, state: GAIN_DISPLAY.DERIVED }
          : { label: "Most recent", value: null, state: EMPTY_DISPLAY.GAIN_INTERVAL },
      trend: !perfEvaluated ? EVALUATION_UNAVAILABLE : perf ? displayOf(TREND_DISPLAY, perf.trend.state, "TREND") : TREND_DISPLAY.INSUFFICIENT_EVIDENCE,
    },
    target: {
      state: headline,
      label: comparison && comparison.targetValue !== null ? `Target ${comparison.metric === "ADG" ? formatAdg(comparison.targetValue) : formatKg(comparison.targetValue)}${bandLabel === null ? "" : ` (band ${bandLabel})`}` : null,
      bandLabel,
      source: targetDef?.versions[0] ? `${targetDef.versions[0].provenance.sourceRef?.sourceId ?? "Unsourced"} · ${targetDef.versions[0].reviewState.toLowerCase()}` : null,
    },
    // The chart plots C4 weights through C5: its four states are decided in `weightChartOf`, never by the chart component.
    chart: weightChartOf(series, perf, goalRead.state !== "ACTIVE" ? { state: "NOT_SET" } : soleGoal !== null ? soleGoal.targetWeight : { state: "SEVERAL", count: goalRead.goals.length }, projectedKg),
    projection: {
      state: !perfEvaluated
        ? EVALUATION_UNAVAILABLE
        : prediction
          ? projectedKg?.state === "NOT_USABLE"
            ? projectedKg.reason === "PROJECTION_BEYOND_HORIZON"
              ? PREDICTION_DISPLAY.BEYOND_HORIZON
              : PREDICTION_DISPLAY.NOT_USABLE
            : displayOf(PREDICTION_DISPLAY, prediction.state, "PREDICTION")
          : goalRead.state === "ACTIVE" && soleGoal === null
            ? PREDICTION_DISPLAY.SEVERAL_GOALS
            : PREDICTION_DISPLAY.NOT_REQUESTED,
      label: prediction && projectedKg?.state === "USABLE" ? `${formatProjectedKg(projectedKg.kg)} by ${formatDate(prediction.at)}` : null,
      at: prediction?.at ?? null,
      assumptions: details(prediction?.assumptions ?? []),
    },
    goal: {
      state: goalState,
      read: goalRead,
      summary: goalRead.state === "ACTIVE" ? { state: "TEXT", text: goalLineText(goalRead.goals) } : { state: "STATE", display: goalRead.state === "UNRESOLVED" ? goalRead.display : goalState },
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
      medicinesLabel: medicines.state === "ITEMS" ? `${medicines.items.length} medicine record${medicines.items.length === 1 ? "" : "s"}` : null,
    },
    recommendation: rec ? { state: displayOf(RECOMMENDATION_DISPLAY, rec.record.outcome, "RECOMMENDATION"), text: rec.record.recommendedAction?.description ?? null } : { state: EVALUATION_UNAVAILABLE, text: null },
    work: {
      open: !outputs.plan.ok
        ? { state: "UNAVAILABLE", display: UNAVAILABLE_DISPLAY.PLANNING, failureCodes: details(outputs.plan.issues.map((i) => i.code)) }
        : primary === undefined
          ? { state: "EMPTY", display: EMPTY_DISPLAY.ANIMAL_WORK }
          : { state: "ITEMS", primary, others: details(others), othersLabel: others.length === 0 ? null : `${others.length} more open job${others.length === 1 ? "" : "s"}` },
      closed: details(work.closed),
    },
    // A missing record family is a gap: with nothing to list it is UNAVAILABLE, never "no dated records".
    timeline: nonEmpty(timeline) !== null || timelineGaps.length === 0 ? listingOf(timeline, EMPTY_DISPLAY.ACTIVITY) : unavailableListing(UNAVAILABLE_DISPLAY.ACTIVITY),
    timelineGaps: details(timelineGaps),
    timelineGapNote: timelineGaps.length === 0 ? null : `Not shown: ${timelineGaps.join("; ")}.`,
    costs: cv,
  };
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

/** C1 history families the timeline couldn't read (an unreadable ledger is a gap, never "no history"). */
function timelineHistoryGaps(outputs: CattleOutputs, animalId: string): string[] {
  const ledger = outputs.ledgers.find((l) => l.animalId === animalId);
  if (!ledger) return ["group and location history (couldn't be read)"];
  return animalAssertionHistory(ledger, "MANAGEMENT_GROUP", outputs.viewpoint.knowledgeCutoff) === null || animalAssertionHistory(ledger, "LOCATION", outputs.viewpoint.knowledgeCutoff) === null
    ? ["group and location history (couldn't be read)"]
    : [];
}
