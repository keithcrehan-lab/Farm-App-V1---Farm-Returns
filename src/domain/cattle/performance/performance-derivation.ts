/**
 * Cattle C5 — deterministic performance derivations over C4 series entries.
 * Reads only C4 outputs (`WeightSeriesEntry`: canonical kilograms,
 * measurement basis, method, supplied quality, competition state) — never a
 * raw weight record (CAT-INV-023). Module-internal: the public path is
 * `evaluatePerformance`, which verifies the C4 read contract first.
 *
 * Observation points. The live C4 observations in view are grouped by
 * instant. A point is (first match wins):
 *   CONFLICT     — more than one live observation at the instant (C4: never
 *                  averaged, whatever their values) or one in a competing
 *                  correction branch;
 *   EXCLUDED     — a single observation whose measurement basis an explicit,
 *                  supplied ACCEPTED_BASES policy does not accept (reported,
 *                  never silent; a CONFLICT point is never excluded);
 *   UNSUPPORTED  — a single observation without an exact kilogram value;
 *   USABLE       — a single observation with canonical kilograms.
 *
 * Interval derivation between two points (precedence, first match wins):
 *   INVALID              — elapsed time zero or negative;
 *   EVIDENCE_CONFLICT    — a supplied MINIMUM_INTERVAL or ACCEPTED_BASES
 *                          policy is in conflict, or either point is CONFLICT;
 *   UNSUPPORTED          — either point has no kilogram value;
 *   INSUFFICIENT_EVIDENCE — an explicit MINIMUM_INTERVAL policy is not met
 *                          (elapsed days < minimum days, unrounded);
 *   INVALID              — gain or ADG not representable as a finite binary64
 *                          value (`CATTLE_PERFORMANCE_VALUE_NOT_REPRESENTABLE`);
 *   DERIVED              — gain = end − start (kg, negative kept), elapsed days
 *                          by `elapsed-time.ts`, ADG = gain ÷ days (kg/day),
 *                          all unrounded, with a calculation trace.
 * Without a supplied policy no threshold is applied and the absence is
 * reported as a limitation.
 *
 * Period (first and last non-excluded points of the window): a conflicting
 * policy ⇒ EVIDENCE_CONFLICT; fewer than two such points ⇒
 * INSUFFICIENT_EVIDENCE unless the one point is CONFLICT (⇒
 * EVIDENCE_CONFLICT) or UNSUPPORTED (⇒ UNSUPPORTED); otherwise the interval
 * derivation above. Interior points never change the period value; their
 * state is reported through the per-interval list and the quality summary.
 *
 * Evidence basis of a derived value: UNKNOWN if any input basis is UNKNOWN,
 * else the common basis, else MIXED (mixed collection methods are reported as
 * a limitation; no ranking between ESTIMATED and DERIVED is asserted).
 */

import { compareInstants, intervalCovers } from "../animal-ledger";
import type { CattleInformationClass } from "../information";
import { compareStrings, sortedUnique } from "../integrity";
import { canonicalObligationInstant } from "../regulatory/obligation-time";
import type { SuppliedWeightQuality, WeightCollectionMethod, WeightMeasurementBasis, WeightSeriesEntry } from "../weights";
import {
  PERFORMANCE_DAY_CONVENTION,
  PERFORMANCE_DAY_CONVENTION_VERSION,
  elapsedDaysOf,
  exactElapsed,
  isPositiveElapsed,
  type ExactElapsed,
} from "./elapsed-time";
import type { DefinitionResolution, DefinitionVersionRef, PerformanceTarget, PolicyResolution } from "./performance-definitions";
import { targetVersionRef } from "./performance-definitions";

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

export type PerformancePointState = "USABLE" | "CONFLICT" | "UNSUPPORTED" | "EXCLUDED";

export interface PerformanceInput {
  recordId: string;
  /** Canonical spelling. */
  observedAt: string;
  /** Canonical kilograms (`null` when the recorded unit has no exact conversion). */
  kg: number | null;
  recordedValue: number;
  recordedUnit: string;
  method: WeightCollectionMethod;
  basis: WeightMeasurementBasis;
  informationClass: CattleInformationClass;
  quality: SuppliedWeightQuality | null;
}

export interface PerformancePoint {
  /** Canonical spelling. */
  at: string;
  state: PerformancePointState;
  /** Every live C4 observation at the instant (sorted by record id). */
  inputs: PerformanceInput[];
  /** Set only when USABLE. */
  kg: number | null;
}

function inputOf(e: WeightSeriesEntry): PerformanceInput {
  return {
    recordId: e.recordId,
    observedAt: canonicalObligationInstant(e.observedAt) as string,
    kg: e.canonicalWeight.kg,
    recordedValue: e.observation.weight.value,
    recordedUnit: e.observation.weight.unit,
    method: e.observation.method,
    basis: e.measurementBasis,
    informationClass: e.informationClass,
    quality: e.observation.quality,
  };
}

/** Groups live in-view C4 observations into chronological points. */
export function performancePoints(observations: readonly WeightSeriesEntry[], acceptedBases: readonly WeightMeasurementBasis[] | null): PerformancePoint[] {
  const byInstant = new Map<string, WeightSeriesEntry[]>();
  for (const e of observations) {
    const at = canonicalObligationInstant(e.observedAt) as string;
    byInstant.set(at, [...(byInstant.get(at) ?? []), e]);
  }
  return [...byInstant.entries()]
    .sort(([a], [b]) => compareInstants(a, b))
    .map(([at, entries]) => {
      const inputs = entries.map(inputOf).sort((a, b) => compareStrings(a.recordId, b.recordId));
      let state: PerformancePointState;
      if (entries.length > 1 || entries.some((e) => e.inCompetition)) state = "CONFLICT";
      else if (acceptedBases !== null && !acceptedBases.includes(inputs[0].basis)) state = "EXCLUDED";
      else if (inputs[0].kg === null) state = "UNSUPPORTED";
      else state = "USABLE";
      return { at, state, inputs, kg: state === "USABLE" ? inputs[0].kg : null };
    });
}

// ---------------------------------------------------------------------------
// Intervals
// ---------------------------------------------------------------------------

export type DerivationState = "DERIVED" | "INSUFFICIENT_EVIDENCE" | "INVALID" | "EVIDENCE_CONFLICT" | "UNSUPPORTED";

export type DerivationReasonCode =
  | "CATTLE_PERFORMANCE_FEWER_THAN_TWO_OBSERVATIONS"
  | "CATTLE_PERFORMANCE_NON_POSITIVE_ELAPSED_TIME"
  | "CATTLE_PERFORMANCE_INPUT_IN_CONFLICT"
  | "CATTLE_PERFORMANCE_UNIT_NOT_CONVERTIBLE"
  | "CATTLE_PERFORMANCE_BELOW_MINIMUM_INTERVAL"
  | "CATTLE_PERFORMANCE_POLICY_CONFLICT"
  | "CATTLE_PERFORMANCE_VALUE_NOT_REPRESENTABLE";

export type PerformanceLimitationCode =
  | "CATTLE_PERFORMANCE_MIXED_COLLECTION_METHODS"
  | "CATTLE_PERFORMANCE_NO_MINIMUM_INTERVAL_POLICY"
  | "CATTLE_PERFORMANCE_NO_QUALITY_POLICY";

export type EvidenceBasis = WeightMeasurementBasis | "MIXED";

export interface CalculationTrace {
  formula: string;
  convention: typeof PERFORMANCE_DAY_CONVENTION;
  conventionVersion: typeof PERFORMANCE_DAY_CONVENTION_VERSION;
  /** START then END: the exact C4 observations substituted. */
  inputs: { role: "START" | "END"; input: PerformanceInput }[];
  elapsed: ExactElapsed;
  units: { gain: "KILOGRAM"; elapsed: "DAY"; adg: "KILOGRAM_PER_DAY" };
  /** The explicit policy that bounded the derivation, if any. */
  minimumIntervalPolicy: DefinitionVersionRef | null;
}

export interface IntervalDerivation {
  state: DerivationState;
  informationClass: "DERIVED_VALUE";
  /** Canonical spellings of the two points (`null` when there is no such point). */
  from: string | null;
  to: string | null;
  /** Identity: source observation ids (sorted) + convention version. */
  sourceRecordIds: string[];
  conventionVersion: typeof PERFORMANCE_DAY_CONVENTION_VERSION;
  /** Set only when DERIVED (never zero for unknown). */
  gainKg: number | null;
  elapsedDays: number | null;
  adgKgPerDay: number | null;
  evidenceBasis: EvidenceBasis | null;
  methods: WeightCollectionMethod[];
  limitations: PerformanceLimitationCode[];
  reasonCodes: DerivationReasonCode[];
  trace: CalculationTrace | null;
}

export const PERFORMANCE_FORMULA = "gainKg = endKg - startKg; elapsedDays = (elapsedSeconds + elapsedNanoseconds / 1e9) / 86400; adgKgPerDay = gainKg / elapsedDays";

export interface DerivationPolicies {
  minimumInterval: PolicyResolution<"MINIMUM_INTERVAL">;
  acceptedBases: PolicyResolution<"ACCEPTED_BASES">;
}

export function evidenceBasisOf(bases: readonly WeightMeasurementBasis[]): EvidenceBasis | null {
  if (bases.length === 0) return null;
  if (bases.includes("UNKNOWN")) return "UNKNOWN";
  return new Set(bases).size === 1 ? bases[0] : "MIXED";
}

function policyLimitations(policies: DerivationPolicies): PerformanceLimitationCode[] {
  const out: PerformanceLimitationCode[] = [];
  if (policies.minimumInterval.state === "NONE") out.push("CATTLE_PERFORMANCE_NO_MINIMUM_INTERVAL_POLICY");
  if (policies.acceptedBases.state === "NONE") out.push("CATTLE_PERFORMANCE_NO_QUALITY_POLICY");
  return out;
}

function unresolved(state: Exclude<DerivationState, "DERIVED">, from: PerformancePoint | null, to: PerformancePoint | null, reason: DerivationReasonCode, limitations: PerformanceLimitationCode[]): IntervalDerivation {
  const inputs = [...(from?.inputs ?? []), ...(to === from ? [] : (to?.inputs ?? []))];
  return {
    state,
    informationClass: "DERIVED_VALUE",
    from: from?.at ?? null,
    to: to?.at ?? null,
    sourceRecordIds: sortedUnique(inputs.map((i) => i.recordId)),
    conventionVersion: PERFORMANCE_DAY_CONVENTION_VERSION,
    gainKg: null,
    elapsedDays: null,
    adgKgPerDay: null,
    evidenceBasis: evidenceBasisOf(inputs.map((i) => i.basis)),
    methods: sortedUnique(inputs.map((i) => i.method)) as WeightCollectionMethod[],
    limitations,
    reasonCodes: [reason],
    trace: null,
  };
}

/** Derives gain and ADG between two points (precedence in the header). */
export function derivePerformanceInterval(start: PerformancePoint, end: PerformancePoint, policies: DerivationPolicies): IntervalDerivation {
  const methods = sortedUnique([...start.inputs, ...end.inputs].map((i) => i.method));
  const limitations = [...(methods.length > 1 ? (["CATTLE_PERFORMANCE_MIXED_COLLECTION_METHODS"] as const) : []), ...policyLimitations(policies)];
  const elapsed = exactElapsed(start.at, end.at);
  if (elapsed === null || !isPositiveElapsed(elapsed)) return unresolved("INVALID", start, end, "CATTLE_PERFORMANCE_NON_POSITIVE_ELAPSED_TIME", limitations);
  if (policies.minimumInterval.state === "EVIDENCE_CONFLICT" || policies.acceptedBases.state === "EVIDENCE_CONFLICT") {
    return unresolved("EVIDENCE_CONFLICT", start, end, "CATTLE_PERFORMANCE_POLICY_CONFLICT", limitations);
  }
  if (start.state === "CONFLICT" || end.state === "CONFLICT") return unresolved("EVIDENCE_CONFLICT", start, end, "CATTLE_PERFORMANCE_INPUT_IN_CONFLICT", limitations);
  if (start.kg === null || end.kg === null) return unresolved("UNSUPPORTED", start, end, "CATTLE_PERFORMANCE_UNIT_NOT_CONVERTIBLE", limitations);
  const elapsedDays = elapsedDaysOf(elapsed);
  const minimum = policies.minimumInterval.state === "SUPPLIED" ? policies.minimumInterval : null;
  if (minimum !== null && elapsedDays < minimum.rule.minimumDays) return unresolved("INSUFFICIENT_EVIDENCE", start, end, "CATTLE_PERFORMANCE_BELOW_MINIMUM_INTERVAL", limitations);
  const gainKg = end.kg - start.kg;
  const adgKgPerDay = gainKg / elapsedDays;
  if (!Number.isFinite(gainKg) || !Number.isFinite(adgKgPerDay)) return unresolved("INVALID", start, end, "CATTLE_PERFORMANCE_VALUE_NOT_REPRESENTABLE", limitations);
  const s = start.inputs[0];
  const e = end.inputs[0];
  return {
    state: "DERIVED",
    informationClass: "DERIVED_VALUE",
    from: start.at,
    to: end.at,
    sourceRecordIds: sortedUnique([s.recordId, e.recordId]),
    conventionVersion: PERFORMANCE_DAY_CONVENTION_VERSION,
    gainKg,
    elapsedDays,
    adgKgPerDay,
    evidenceBasis: evidenceBasisOf([s.basis, e.basis]),
    methods: methods as WeightCollectionMethod[],
    limitations,
    reasonCodes: [],
    trace: {
      formula: PERFORMANCE_FORMULA,
      convention: PERFORMANCE_DAY_CONVENTION,
      conventionVersion: PERFORMANCE_DAY_CONVENTION_VERSION,
      inputs: [
        { role: "START", input: s },
        { role: "END", input: e },
      ],
      elapsed,
      units: { gain: "KILOGRAM", elapsed: "DAY", adg: "KILOGRAM_PER_DAY" },
      minimumIntervalPolicy: minimum?.policy ?? null,
    },
  };
}

/** Candidate points: every non-excluded point (EXCLUDED points are reported, never used). */
export function candidatePoints(points: readonly PerformancePoint[]): PerformancePoint[] {
  return points.filter((p) => p.state !== "EXCLUDED");
}

/** Period derivation over the window's candidate points (precedence in the header). */
export function derivePeriod(points: readonly PerformancePoint[], policies: DerivationPolicies): IntervalDerivation {
  const candidates = candidatePoints(points);
  const limitations = policyLimitations(policies);
  if (policies.minimumInterval.state === "EVIDENCE_CONFLICT" || policies.acceptedBases.state === "EVIDENCE_CONFLICT") {
    return unresolved("EVIDENCE_CONFLICT", candidates[0] ?? null, candidates[candidates.length - 1] ?? null, "CATTLE_PERFORMANCE_POLICY_CONFLICT", limitations);
  }
  if (candidates.length < 2) {
    const only = candidates[0] ?? null;
    if (only?.state === "CONFLICT") return unresolved("EVIDENCE_CONFLICT", only, only, "CATTLE_PERFORMANCE_INPUT_IN_CONFLICT", limitations);
    if (only?.state === "UNSUPPORTED") return unresolved("UNSUPPORTED", only, only, "CATTLE_PERFORMANCE_UNIT_NOT_CONVERTIBLE", limitations);
    return unresolved("INSUFFICIENT_EVIDENCE", only, only, "CATTLE_PERFORMANCE_FEWER_THAN_TWO_OBSERVATIONS", limitations);
  }
  return derivePerformanceInterval(candidates[0], candidates[candidates.length - 1], policies);
}

/** Consecutive candidate-point intervals, chronological. */
export function deriveIntervals(points: readonly PerformancePoint[], policies: DerivationPolicies): IntervalDerivation[] {
  const candidates = candidatePoints(points);
  return candidates.slice(1).map((end, i) => derivePerformanceInterval(candidates[i], end, policies));
}

// ---------------------------------------------------------------------------
// Coverage (descriptive only)
// ---------------------------------------------------------------------------

export interface PerformanceCoverage {
  /** Live C4 observations in the window. */
  observationCount: number;
  /** Distinct observation instants in the window (every point state). */
  pointCount: number;
  /** Points by state. */
  usableCount: number;
  conflictCount: number;
  unsupportedCount: number;
  excludedCount: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  /** Elapsed days first → last instant (`null` with fewer than two points). */
  spanDays: number | null;
  /** Largest elapsed days between consecutive instants (`null` with fewer than two points). */
  largestGapDays: number | null;
  /** Consecutive instant pairs. */
  intervalCount: number;
}

export function coverageOf(points: readonly PerformancePoint[]): PerformanceCoverage {
  const count = (state: PerformancePointState) => points.filter((p) => p.state === state).length;
  const gaps = points.slice(1).map((p, i) => elapsedDaysOf(exactElapsed(points[i].at, p.at) as ExactElapsed));
  const first = points[0] ?? null;
  const last = points[points.length - 1] ?? null;
  return {
    observationCount: points.reduce((n, p) => n + p.inputs.length, 0),
    pointCount: points.length,
    usableCount: count("USABLE"),
    conflictCount: count("CONFLICT"),
    unsupportedCount: count("UNSUPPORTED"),
    excludedCount: count("EXCLUDED"),
    firstObservedAt: first?.at ?? null,
    lastObservedAt: last?.at ?? null,
    spanDays: points.length < 2 ? null : elapsedDaysOf(exactElapsed(first!.at, last!.at) as ExactElapsed),
    largestGapDays: gaps.length === 0 ? null : Math.max(...gaps),
    intervalCount: gaps.length,
  };
}

// ---------------------------------------------------------------------------
// Trend (explicit supplied policy only)
// ---------------------------------------------------------------------------

export type TrendState = "RISING" | "FALLING" | "FLAT" | "NO_POLICY" | "EVIDENCE_CONFLICT" | "INSUFFICIENT_EVIDENCE" | "INVALID" | "UNSUPPORTED";

export interface TrendClassification {
  state: TrendState;
  policy: DefinitionVersionRef | null;
  /** The unrounded period ADG classified (set only for RISING / FALLING / FLAT). */
  adgKgPerDay: number | null;
}

/**
 * Precedence: no supplied policy ⇒ NO_POLICY (never a default); conflicting
 * policies ⇒ EVIDENCE_CONFLICT; period not DERIVED ⇒ its state; otherwise
 * FALLING when ADG < fallingBelow, RISING when ADG > risingAbove, else FLAT
 * (both boundaries inclusive in FLAT; unrounded comparison).
 */
export function classifyTrend(period: IntervalDerivation, policy: PolicyResolution<"TREND">): TrendClassification {
  if (policy.state === "NONE") return { state: "NO_POLICY", policy: null, adgKgPerDay: null };
  if (policy.state === "EVIDENCE_CONFLICT") return { state: "EVIDENCE_CONFLICT", policy: null, adgKgPerDay: null };
  if (period.state !== "DERIVED" || period.adgKgPerDay === null) return { state: period.state as TrendState, policy: policy.policy, adgKgPerDay: null };
  const adg = period.adgKgPerDay;
  const state: TrendState = adg < policy.rule.fallingBelowKgPerDay ? "FALLING" : adg > policy.rule.risingAboveKgPerDay ? "RISING" : "FLAT";
  return { state, policy: policy.policy, adgKgPerDay: adg };
}

// ---------------------------------------------------------------------------
// Target comparison
// ---------------------------------------------------------------------------

/** Supplied applicability context for one animal; a `null` field is UNKNOWN. */
export interface ApplicabilityContext {
  animalId: string;
  goalRef: string | null;
  productionSystemRef: string | null;
  /** Sorted by key, unique keys. */
  attributes: { key: string; value: string }[];
}

export type TargetComparisonState =
  | "ON_TRACK"
  | "BEHIND"
  | "AHEAD"
  | "TARGET_NOT_APPLICABLE"
  | "TARGET_UNVERIFIED"
  | "INSUFFICIENT_EVIDENCE"
  | "EVIDENCE_CONFLICT"
  | "INVALID";

export type TargetComparisonReasonCode =
  | "CATTLE_PERFORMANCE_TARGET_VERSIONS_IN_CONFLICT"
  | "CATTLE_PERFORMANCE_APPLICABILITY_UNKNOWN"
  | "CATTLE_PERFORMANCE_OUTSIDE_TARGET_VALIDITY"
  | "CATTLE_PERFORMANCE_ANIMAL_NOT_IN_TARGET_SET"
  | "CATTLE_PERFORMANCE_GOAL_MISMATCH"
  | "CATTLE_PERFORMANCE_PRODUCTION_SYSTEM_MISMATCH"
  | "CATTLE_PERFORMANCE_ATTRIBUTE_MISMATCH"
  | "CATTLE_PERFORMANCE_TARGET_NOT_IN_PRODUCTION"
  | "CATTLE_PERFORMANCE_TARGET_DATE_NOT_REACHED"
  | "CATTLE_PERFORMANCE_NO_OBSERVATION_AT_TARGET_DATE"
  | DerivationReasonCode;

export interface TargetComparison {
  targetId: string;
  /** The exact target version compared (`null` when its versions conflict). */
  target: DefinitionVersionRef | null;
  /** Conflicting live versions (sorted) when EVIDENCE_CONFLICT on the target itself. */
  conflictingVersions: string[];
  metric: "ADG" | "WEIGHT_AT" | null;
  state: TargetComparisonState;
  /** Unrounded observed value compared (kg/day or kg); set only for ON_TRACK / BEHIND / AHEAD. */
  observed: number | null;
  /** The supplied target value (set whenever the target version is resolved). */
  targetValue: number | null;
  /** The band: [target − below, target + above] (exact target when no tolerance), binary64, no epsilon; `null` when a bound is not finite. */
  lowerBound: number | null;
  upperBound: number | null;
  /** C4 record ids behind the observed value. */
  evidenceRecordIds: string[];
  reasonCodes: TargetComparisonReasonCode[];
}

type Applicability = { state: "APPLICABLE" } | { state: "UNKNOWN" } | { state: "NOT_APPLICABLE"; reasons: TargetComparisonReasonCode[] };

function applicabilityOf(target: PerformanceTarget, animalId: string, context: ApplicabilityContext | null, effectiveAt: string): Applicability {
  const a = target.applicability;
  let unknown = false;
  const reasons: TargetComparisonReasonCode[] = [];
  if (!intervalCovers({ validFrom: target.validFrom, validTo: target.validTo }, effectiveAt)) reasons.push("CATTLE_PERFORMANCE_OUTSIDE_TARGET_VALIDITY");
  if (a.animalIds !== null && !a.animalIds.includes(animalId)) reasons.push("CATTLE_PERFORMANCE_ANIMAL_NOT_IN_TARGET_SET");
  const check = (required: string | null, actual: string | null | undefined, reason: TargetComparisonReasonCode) => {
    if (required === null) return;
    if (actual === null || actual === undefined) unknown = true;
    else if (actual !== required) reasons.push(reason);
  };
  check(a.goalRef, context?.goalRef, "CATTLE_PERFORMANCE_GOAL_MISMATCH");
  check(a.productionSystemRef, context?.productionSystemRef, "CATTLE_PERFORMANCE_PRODUCTION_SYSTEM_MISMATCH");
  for (const attr of a.attributes) check(attr.value, context?.attributes.find((x) => x.key === attr.key)?.value, "CATTLE_PERFORMANCE_ATTRIBUTE_MISMATCH");
  // Applicability inputs must be KNOWN before "not applicable" (CAT-INV-009).
  if (unknown) return { state: "UNKNOWN" };
  return reasons.length > 0 ? { state: "NOT_APPLICABLE", reasons: sortedUnique(reasons) as TargetComparisonReasonCode[] } : { state: "APPLICABLE" };
}

/** The supplied target value and band (target facts, echoed whatever the outcome; a bound that is not finite binary64 is `null`). */
function bandOf(target: PerformanceTarget): { targetValue: number; lowerBound: number | null; upperBound: number | null } {
  const targetValue = target.metric.kind === "ADG" ? target.metric.valueKgPerDay : target.metric.valueKg;
  const lowerBound = target.tolerance === null ? targetValue : targetValue - target.tolerance.below;
  const upperBound = target.tolerance === null ? targetValue : targetValue + target.tolerance.above;
  const representable = Number.isFinite(lowerBound) && Number.isFinite(upperBound);
  return { targetValue, lowerBound: representable ? lowerBound : null, upperBound: representable ? upperBound : null };
}

function blank(targetId: string, target: PerformanceTarget | null): Omit<TargetComparison, "state" | "reasonCodes"> {
  return {
    targetId,
    target: target === null ? null : targetVersionRef(target),
    conflictingVersions: [],
    metric: target?.metric.kind ?? null,
    observed: null,
    ...(target === null ? { targetValue: null, lowerBound: null, upperBound: null } : bandOf(target)),
    evidenceRecordIds: [],
  };
}

function derivationToComparison(state: DerivationState): TargetComparisonState {
  return state === "INVALID" ? "INVALID" : state === "EVIDENCE_CONFLICT" ? "EVIDENCE_CONFLICT" : "INSUFFICIENT_EVIDENCE";
}

/**
 * Compares one animal with one supplied target. Precedence (first match
 * wins): target versions in conflict ⇒ EVIDENCE_CONFLICT; band bound not
 * finite ⇒ INVALID; observed metric unresolved ⇒ INVALID / EVIDENCE_CONFLICT /
 * INSUFFICIENT_EVIDENCE (required evidence is resolved before any
 * applicability or review outcome, CAT-INV-009); an applicability input
 * UNKNOWN ⇒ INSUFFICIENT_EVIDENCE; outside validity / known mismatch ⇒
 * TARGET_NOT_APPLICABLE; review state not PRODUCTION ⇒ TARGET_UNVERIFIED;
 * otherwise BEHIND (observed < target − below), AHEAD (observed > target +
 * above) or ON_TRACK — unrounded, no epsilon.
 */
export function compareWithTarget(
  targetId: string,
  resolution: DefinitionResolution<PerformanceTarget>,
  animalId: string,
  context: ApplicabilityContext | null,
  effectiveAt: string,
  period: IntervalDerivation,
  allPoints: readonly PerformancePoint[],
  policies: DerivationPolicies,
): TargetComparison {
  if (resolution.state === "EVIDENCE_CONFLICT") {
    return { ...blank(targetId, null), conflictingVersions: sortedUnique(resolution.records.map((r) => r.version)), state: "EVIDENCE_CONFLICT", reasonCodes: ["CATTLE_PERFORMANCE_TARGET_VERSIONS_IN_CONFLICT"] };
  }
  const target = resolution.record;
  const base = blank(targetId, target);
  if (base.lowerBound === null || base.upperBound === null) return { ...base, state: "INVALID", reasonCodes: ["CATTLE_PERFORMANCE_VALUE_NOT_REPRESENTABLE"] };

  let observed: number;
  let evidenceRecordIds: string[];
  if (target.metric.kind === "ADG") {
    if (period.state !== "DERIVED" || period.adgKgPerDay === null) {
      return { ...base, evidenceRecordIds: period.sourceRecordIds, state: derivationToComparison(period.state), reasonCodes: [...period.reasonCodes] };
    }
    observed = period.adgKgPerDay;
    evidenceRecordIds = period.sourceRecordIds;
  } else {
    const at = target.metric.at;
    if (compareInstants(at, effectiveAt) > 0) return { ...base, state: "INSUFFICIENT_EVIDENCE", reasonCodes: ["CATTLE_PERFORMANCE_TARGET_DATE_NOT_REACHED"] };
    if (policies.acceptedBases.state === "EVIDENCE_CONFLICT") return { ...base, state: "EVIDENCE_CONFLICT", reasonCodes: ["CATTLE_PERFORMANCE_POLICY_CONFLICT"] };
    const point = allPoints.find((p) => compareInstants(p.at, at) === 0);
    if (!point) return { ...base, state: "INSUFFICIENT_EVIDENCE", reasonCodes: ["CATTLE_PERFORMANCE_NO_OBSERVATION_AT_TARGET_DATE"] };
    const ids = point.inputs.map((i) => i.recordId);
    if (point.state === "CONFLICT") return { ...base, evidenceRecordIds: ids, state: "EVIDENCE_CONFLICT", reasonCodes: ["CATTLE_PERFORMANCE_INPUT_IN_CONFLICT"] };
    if (point.state === "UNSUPPORTED") return { ...base, evidenceRecordIds: ids, state: "INSUFFICIENT_EVIDENCE", reasonCodes: ["CATTLE_PERFORMANCE_UNIT_NOT_CONVERTIBLE"] };
    if (point.state === "EXCLUDED" || point.kg === null) return { ...base, evidenceRecordIds: ids, state: "INSUFFICIENT_EVIDENCE", reasonCodes: ["CATTLE_PERFORMANCE_NO_OBSERVATION_AT_TARGET_DATE"] };
    observed = point.kg;
    evidenceRecordIds = ids;
  }
  const applicability = applicabilityOf(target, animalId, context, effectiveAt);
  if (applicability.state === "UNKNOWN") return { ...base, state: "INSUFFICIENT_EVIDENCE", reasonCodes: ["CATTLE_PERFORMANCE_APPLICABILITY_UNKNOWN"] };
  if (applicability.state === "NOT_APPLICABLE") return { ...base, state: "TARGET_NOT_APPLICABLE", reasonCodes: applicability.reasons };
  if (target.reviewState !== "PRODUCTION") return { ...base, state: "TARGET_UNVERIFIED", reasonCodes: ["CATTLE_PERFORMANCE_TARGET_NOT_IN_PRODUCTION"] };
  const { lowerBound, upperBound } = base;
  const state: TargetComparisonState = observed < lowerBound ? "BEHIND" : observed > upperBound ? "AHEAD" : "ON_TRACK";
  return { ...base, observed, evidenceRecordIds, state, reasonCodes: [] };
}

// ---------------------------------------------------------------------------
// Prediction (optional, never an observation, never used for comparison)
// ---------------------------------------------------------------------------

export const PERFORMANCE_PREDICTION_METHOD = "LINEAR_EXTRAPOLATION_OF_PERIOD_ADG" as const;

export interface WeightPrediction {
  informationClass: "PREDICTION";
  state: "PROJECTED" | "NOT_PROJECTED";
  method: typeof PERFORMANCE_PREDICTION_METHOD;
  /** Canonical spelling. */
  at: string;
  /** Set only when PROJECTED. */
  projectedKg: number | null;
  /** The last period observation and the ADG extrapolated (from the period derivation). */
  basedOnRecordIds: string[];
  fromObservedAt: string | null;
  adgKgPerDay: number | null;
  elapsedDays: number | null;
  assumptions: string[];
  limitations: string[];
  /** The period state when NOT_PROJECTED (INVALID when the projected weight is not finite binary64). */
  reasonState: DerivationState | null;
}

const PREDICTION_ASSUMPTIONS = ["The period ADG observed in the window continues unchanged from the last period observation until the projection instant."];
const PREDICTION_LIMITATIONS = [
  "Simple linear extrapolation of observed ADG only; no biological, feed or seasonal model.",
  "A prediction is not an observation and is never used for target comparison or aggregation.",
];

export function predictWeight(period: IntervalDerivation, at: string): WeightPrediction {
  const base = { informationClass: "PREDICTION" as const, method: PERFORMANCE_PREDICTION_METHOD, at, assumptions: [...PREDICTION_ASSUMPTIONS], limitations: [...PREDICTION_LIMITATIONS] };
  const end = period.trace?.inputs.find((i) => i.role === "END")?.input ?? null;
  if (period.state !== "DERIVED" || period.adgKgPerDay === null || end === null || end.kg === null || period.to === null) {
    return { ...base, state: "NOT_PROJECTED", projectedKg: null, basedOnRecordIds: period.sourceRecordIds, fromObservedAt: null, adgKgPerDay: null, elapsedDays: null, reasonState: period.state };
  }
  const elapsedDays = elapsedDaysOf(exactElapsed(period.to, at) as ExactElapsed);
  const projectedKg = end.kg + period.adgKgPerDay * elapsedDays;
  if (!Number.isFinite(projectedKg)) {
    return { ...base, state: "NOT_PROJECTED", projectedKg: null, basedOnRecordIds: period.sourceRecordIds, fromObservedAt: null, adgKgPerDay: null, elapsedDays: null, reasonState: "INVALID" };
  }
  return {
    ...base,
    state: "PROJECTED",
    projectedKg,
    basedOnRecordIds: period.sourceRecordIds,
    fromObservedAt: period.to,
    adgKgPerDay: period.adgKgPerDay,
    elapsedDays,
    reasonState: null,
  };
}
