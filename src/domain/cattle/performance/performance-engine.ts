/**
 * Cattle C5 — the performance engine: deterministic gain / ADG, coverage,
 * explicit trend and target comparison, optional labelled prediction and
 * scope aggregation over the C4 read contract, at one explicit
 * (`effectiveAt`, `knowledgeCutoff`). No clock is read; no target, threshold,
 * tolerance or trend boundary is built in (CAT-INV-027).
 *
 * Inputs (CAT-INV-014/023): a C4 `WeightReadContract` — re-verified with
 * C4 `verifyWeightReadContract` and required to be projected at exactly the
 * query's times (the caller passes the same times to C4) — plus supplied
 * targets, policies and per-animal applicability contexts. Raw weight
 * records are never read.
 *
 * Order:
 * 1. The complete request is checked with `toCanonicalPlainData`;
 *    non-canonical input is rejected (`CATTLE_PERFORMANCE_NON_CANONICAL_INPUT`)
 *    and only the detached, deep-frozen copy is used (CAT-INV-001/002).
 * 2. Query, C4 contract (verification + time binding), contexts.
 * 3. Targets and policies admitted at the cutoff (`performance-definitions.ts`):
 *    later knowledge invisible, malformed fails closed, identity before
 *    validity, supersession without precedence.
 * 4. Per scope member: points, window, period and per-interval derivations,
 *    coverage, quality, trend, target comparisons, optional prediction
 *    (`performance-derivation.ts` documents every precedence list).
 * 5. Aggregation over KNOWN results only, with unresolved counts.
 * 6. Output rebuilt, sorted, fingerprinted and deep-frozen.
 *
 * REQUIRED inputs per authoritative outcome (ARCHITECTURE.md §Status and
 * evidence precedence):
 * - gain / ADG: two non-excluded points with a single live, unconflicted,
 *   kilogram-convertible C4 observation each, positive elapsed time, and —
 *   only when supplied — a single resolved minimum-interval / accepted-bases
 *   policy;
 * - trend: a single resolved TREND policy and a DERIVED period ADG;
 * - target comparison: a single live target version, every applicability
 *   input it restricts on KNOWN, a PRODUCTION review state, and a resolved
 *   observed metric;
 * - aggregation: per-animal results; unresolved results are counted, never
 *   averaged; scope animals with unknown / conflicting / invalid membership
 *   are reported (C4 supplies no weights for them).
 * Unresolved required evidence never yields ON_TRACK, AHEAD, BEHIND, RISING,
 * FALLING, FLAT or a DERIVED value (CAT-INV-009/022).
 */

import { canonicalizeValue, type AssessmentFingerprint } from "../../assessment-integrity";
import { compareInstants, deepFreezeAnimalValue, isOpaqueRef, isValidAnimalInstant } from "../animal-ledger";
import { compareStrings, sortedUnique, type CattleHash } from "../integrity";
import { canonicalField, toCanonicalPlainData } from "../regulatory/canonical-input";
import { canonicalObligationInstant } from "../regulatory/obligation-time";
import { hasOnlyFields, isRecord } from "../health/health-input";
import { verifyWeightReadContract, type ScopeKind, type WeightCollectionMethod, type WeightMeasurementBasis, type WeightReadContract } from "../weights";
import {
  admitPerformancePolicies,
  admitPerformanceTargets,
  resolvePolicyKind,
  type DefinitionIssueCode,
  type PerformanceTarget,
  type PolicyResolution,
} from "./performance-definitions";
import {
  classifyTrend,
  compareWithTarget,
  coverageOf,
  deriveIntervals,
  derivePeriod,
  evidenceBasisOf,
  performancePoints,
  predictWeight,
  type ApplicabilityContext,
  type DerivationPolicies,
  type DerivationState,
  type EvidenceBasis,
  type IntervalDerivation,
  type PerformanceCoverage,
  type PerformanceLimitationCode,
  type PerformancePoint,
  type TargetComparison,
  type TargetComparisonState,
  type TrendClassification,
  type WeightPrediction,
} from "./performance-derivation";
import { CATTLE_PERFORMANCE_PAYLOAD_VERSION, computePerformanceFingerprint } from "./performance-integrity";

export interface PerformanceQuery {
  /** VALID time; must equal the C4 contract's (by instant). */
  effectiveAt: string;
  /** KNOWLEDGE time; must equal the C4 contract's (by instant). */
  knowledgeCutoff: string;
  /** Start of the observation window (inclusive, strictly before `effectiveAt`); `null` = the whole series in view. */
  windowFrom?: string | null;
  /** Optional instant (strictly after `effectiveAt`) for a labelled PREDICTION. */
  projectionAt?: string | null;
}

/** Every part must be canonical plain data (CAMPAIGN.md, "Canonical input contract"). */
export interface PerformanceRequest {
  weights: WeightReadContract;
  query: PerformanceQuery;
  /** Supplied `PerformanceTarget` records (any version history). */
  targets: readonly unknown[];
  /** Supplied `PerformancePolicy` records. */
  policies: readonly unknown[];
  /** Supplied applicability contexts (`{animalId, goalRef?, productionSystemRef?, attributes?}`); an absent field is UNKNOWN. */
  contexts: readonly unknown[];
}

export type PerformanceIssueCode =
  | "CATTLE_PERFORMANCE_NON_CANONICAL_INPUT"
  | "CATTLE_PERFORMANCE_INVALID_REQUEST"
  | "CATTLE_PERFORMANCE_INVALID_EFFECTIVE_AT"
  | "CATTLE_PERFORMANCE_INVALID_KNOWLEDGE_CUTOFF"
  | "CATTLE_PERFORMANCE_INVALID_WINDOW"
  | "CATTLE_PERFORMANCE_INVALID_PROJECTION_AT"
  | "CATTLE_PERFORMANCE_WEIGHT_CONTRACT_INVALID"
  | "CATTLE_PERFORMANCE_WEIGHT_CONTRACT_TIME_MISMATCH"
  | "CATTLE_PERFORMANCE_INVALID_CONTEXT"
  | "CATTLE_PERFORMANCE_CONTEXT_DUPLICATE_DIFFERENT_CONTENT"
  | `CATTLE_PERFORMANCE_TARGET_${DefinitionIssueCode}`
  | `CATTLE_PERFORMANCE_POLICY_${DefinitionIssueCode}`;

export interface PerformanceIssue {
  code: PerformanceIssueCode;
  /** Record ref / animal id / non-canonical path / C4 reason code when readable. */
  ref: string | null;
}

export interface PerformanceQuality {
  /** Distinct collection methods / bases of the window's observations (sorted). */
  methods: WeightCollectionMethod[];
  bases: WeightMeasurementBasis[];
  evidenceBasis: EvidenceBasis | null;
  mixedMethods: boolean;
  /** Canonical instants of CONFLICT / UNSUPPORTED points; record ids of EXCLUDED points. */
  conflictInstants: string[];
  unsupportedInstants: string[];
  excludedRecordIds: string[];
  /** Supplied quality values, verbatim, per record (sorted by record id). */
  suppliedQuality: { recordId: string; quality: { scheme: string; value: string | number } }[];
  limitations: PerformanceLimitationCode[];
}

export interface AnimalPerformance {
  animalId: string;
  /** The C4 series this result was derived from. */
  seriesFingerprint: AssessmentFingerprint;
  /** The supplied applicability context (`null` = none supplied: every field UNKNOWN). */
  context: ApplicabilityContext | null;
  /** Observation points in the window, chronological. */
  points: PerformancePoint[];
  coverage: PerformanceCoverage;
  /** First → last non-excluded window point. */
  period: IntervalDerivation;
  /** Consecutive non-excluded window points. */
  intervals: IntervalDerivation[];
  quality: PerformanceQuality;
  trend: TrendClassification;
  /** NO_TARGET when no target is known at the cutoff (a state, never a default). */
  targetOutcome: "NO_TARGET" | "COMPARED";
  /** One per known target id (sorted). */
  comparisons: TargetComparison[];
  prediction: WeightPrediction | null;
  fingerprint: AssessmentFingerprint;
}

export interface DistributionSummary {
  /** Animals with a DERIVED value (sorted). */
  knownAnimalIds: string[];
  /** Animals without one, by state (states sorted; empty states omitted). */
  unresolved: { state: Exclude<DerivationState, "DERIVED">; animalIds: string[] }[];
  /** Over KNOWN values only; `null` when none is known (never zero). */
  statistics: { count: number; min: number; max: number; mean: number; median: number } | null;
}

export interface PerformanceAggregate {
  scopeKind: ScopeKind;
  groupRef: string | null;
  members: string[];
  /** Scope animals C4 could not resolve; no weights are included for them. */
  membershipUnknown: string[];
  membershipConflict: string[];
  membershipInvalid: string[];
  periodAdgKgPerDay: DistributionSummary;
  periodGainKg: DistributionSummary;
  noTargetAnimalIds: string[];
  /** Per known target id: members by comparison state (states sorted; empty omitted). */
  comparisons: { targetId: string; byState: { state: TargetComparisonState; animalIds: string[] }[] }[];
}

export interface PerformanceEvaluation {
  performancePayloadVersion: typeof CATTLE_PERFORMANCE_PAYLOAD_VERSION;
  /** Canonical spellings. */
  effectiveAt: string;
  knowledgeCutoff: string;
  windowFrom: string | null;
  projectionAt: string | null;
  weightContractFingerprint: AssessmentFingerprint;
  policies: {
    minimumInterval: PolicyResolution<"MINIMUM_INTERVAL">;
    acceptedBases: PolicyResolution<"ACCEPTED_BASES">;
    trend: PolicyResolution<"TREND">;
  };
  /** Known target ids at the cutoff (sorted). */
  targetIds: string[];
  /** The exact supplied target versions relied on, per id (RESOLVED: the live version; EVIDENCE_CONFLICT: every competing version). */
  targetDefinitions: { targetId: string; state: "RESOLVED" | "EVIDENCE_CONFLICT"; versions: PerformanceTarget[] }[];
  /** One per scope member, in member order. */
  animals: AnimalPerformance[];
  aggregate: PerformanceAggregate;
  fingerprint: AssessmentFingerprint;
}

export type PerformanceResult = { ok: true; evaluation: PerformanceEvaluation } | { ok: false; issues: PerformanceIssue[] };

// ---------------------------------------------------------------------------
// Request readers (already-canonical data)
// ---------------------------------------------------------------------------

const REQUEST_FIELDS = ["weights", "query", "targets", "policies", "contexts"];
const QUERY_FIELDS = ["effectiveAt", "knowledgeCutoff", "windowFrom", "projectionAt"];
const CONTEXT_FIELDS = ["animalId", "goalRef", "productionSystemRef", "attributes"];

function uniqueIssues(issues: readonly PerformanceIssue[]): PerformanceIssue[] {
  const unique = new Map(issues.map((i) => [`${i.ref ?? ""}\u0000${i.code}`, i]));
  return [...unique.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, i]) => i);
}

function optionalRef(v: unknown): { ok: boolean; value: string | null } {
  if (v === undefined || v === null) return { ok: true, value: null };
  return isOpaqueRef(v) ? { ok: true, value: v } : { ok: false, value: null };
}

function contextOf(raw: unknown): ApplicabilityContext | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, CONTEXT_FIELDS) || !isOpaqueRef(raw.animalId)) return null;
  const goal = optionalRef(raw.goalRef);
  const system = optionalRef(raw.productionSystemRef);
  const list = raw.attributes ?? [];
  if (!goal.ok || !system.ok || !Array.isArray(list)) return null;
  const attributes: { key: string; value: string }[] = [];
  for (const a of list) {
    if (!isRecord(a) || !hasOnlyFields(a, ["key", "value"]) || !isOpaqueRef(a.key) || !isOpaqueRef(a.value)) return null;
    attributes.push({ key: a.key, value: a.value });
  }
  if (new Set(attributes.map((a) => a.key)).size !== attributes.length) return null;
  return { animalId: raw.animalId, goalRef: goal.value, productionSystemRef: system.value, attributes: attributes.sort((a, b) => compareStrings(a.key, b.key)) };
}

function readContexts(raw: unknown): { ok: true; byAnimal: Map<string, ApplicabilityContext> } | { ok: false; issues: PerformanceIssue[] } {
  if (!Array.isArray(raw)) return { ok: false, issues: [{ code: "CATTLE_PERFORMANCE_INVALID_REQUEST", ref: null }] };
  const issues: PerformanceIssue[] = [];
  const byAnimal = new Map<string, ApplicabilityContext>();
  for (const entry of raw) {
    const ctx = contextOf(entry);
    if (ctx === null) {
      const id = canonicalField(entry, "animalId");
      issues.push({ code: "CATTLE_PERFORMANCE_INVALID_CONTEXT", ref: isOpaqueRef(id) ? id : null });
      continue;
    }
    const existing = byAnimal.get(ctx.animalId);
    if (existing && canonicalizeValue(existing) !== canonicalizeValue(ctx)) issues.push({ code: "CATTLE_PERFORMANCE_CONTEXT_DUPLICATE_DIFFERENT_CONTENT", ref: ctx.animalId });
    else byAnimal.set(ctx.animalId, ctx);
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, byAnimal };
}

function optionalInstant(raw: unknown): { ok: boolean; value: string | null } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  const value = isValidAnimalInstant(raw) ? canonicalObligationInstant(raw) : null;
  return value === null ? { ok: false, value: null } : { ok: true, value };
}

// ---------------------------------------------------------------------------
// Per-animal evaluation
// ---------------------------------------------------------------------------

function qualityOf(points: readonly PerformancePoint[], period: IntervalDerivation, policies: DerivationPolicies): PerformanceQuality {
  const inputs = points.flatMap((p) => p.inputs);
  const methods = sortedUnique(inputs.map((i) => i.method)) as WeightCollectionMethod[];
  const bases = sortedUnique(inputs.map((i) => i.basis)) as WeightMeasurementBasis[];
  const limitations = new Set<PerformanceLimitationCode>(period.limitations);
  if (methods.length > 1) limitations.add("CATTLE_PERFORMANCE_MIXED_COLLECTION_METHODS");
  if (policies.minimumInterval.state === "NONE") limitations.add("CATTLE_PERFORMANCE_NO_MINIMUM_INTERVAL_POLICY");
  if (policies.acceptedBases.state === "NONE") limitations.add("CATTLE_PERFORMANCE_NO_QUALITY_POLICY");
  return {
    methods,
    bases,
    evidenceBasis: evidenceBasisOf(bases),
    mixedMethods: methods.length > 1,
    conflictInstants: points.filter((p) => p.state === "CONFLICT").map((p) => p.at),
    unsupportedInstants: points.filter((p) => p.state === "UNSUPPORTED").map((p) => p.at),
    excludedRecordIds: sortedUnique(points.filter((p) => p.state === "EXCLUDED").flatMap((p) => p.inputs.map((i) => i.recordId))),
    suppliedQuality: inputs
      .filter((i) => i.quality !== null)
      .map((i) => ({ recordId: i.recordId, quality: i.quality! }))
      .sort((a, b) => compareStrings(a.recordId, b.recordId)),
    limitations: [...limitations].sort(compareStrings),
  };
}

// ---------------------------------------------------------------------------
// Aggregation (KNOWN results only)
// ---------------------------------------------------------------------------

function distribution(animals: readonly AnimalPerformance[], valueOf: (d: IntervalDerivation) => number | null): DistributionSummary {
  const known: { id: string; value: number }[] = [];
  const unresolved = new Map<Exclude<DerivationState, "DERIVED">, string[]>();
  for (const a of animals) {
    const value = a.period.state === "DERIVED" ? valueOf(a.period) : null;
    if (value !== null) known.push({ id: a.animalId, value });
    else if (a.period.state !== "DERIVED") unresolved.set(a.period.state, [...(unresolved.get(a.period.state) ?? []), a.animalId]);
  }
  const values = known.map((k) => k.value).sort((a, b) => a - b);
  let statistics: DistributionSummary["statistics"] = null;
  if (values.length > 0) {
    const n = values.length;
    let sum = 0;
    for (const v of values) sum += v;
    const mid = Math.floor(n / 2);
    statistics = { count: n, min: values[0], max: values[n - 1], mean: sum / n, median: n % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2 };
  }
  return {
    knownAnimalIds: known.map((k) => k.id).sort(compareStrings),
    unresolved: [...unresolved.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([state, ids]) => ({ state, animalIds: ids.sort(compareStrings) })),
    statistics,
  };
}

function aggregateOf(contract: WeightReadContract, animals: readonly AnimalPerformance[], targetIds: readonly string[]): PerformanceAggregate {
  const s = contract.scope;
  return {
    scopeKind: s.scopeKind,
    groupRef: s.groupRef,
    members: [...s.members],
    membershipUnknown: [...s.unknown],
    membershipConflict: [...s.conflict],
    membershipInvalid: [...s.invalid],
    periodAdgKgPerDay: distribution(animals, (d) => d.adgKgPerDay),
    periodGainKg: distribution(animals, (d) => d.gainKg),
    noTargetAnimalIds: animals.filter((a) => a.targetOutcome === "NO_TARGET").map((a) => a.animalId).sort(compareStrings),
    comparisons: targetIds.map((targetId) => {
      const byState = new Map<TargetComparisonState, string[]>();
      for (const a of animals) {
        const c = a.comparisons.find((x) => x.targetId === targetId);
        if (c) byState.set(c.state, [...(byState.get(c.state) ?? []), a.animalId]);
      }
      return { targetId, byState: [...byState.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([state, ids]) => ({ state, animalIds: ids.sort(compareStrings) })) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Evaluates performance for every member of a verified C4 read contract. The
 * complete request must be canonical plain data; it is checked as a whole
 * before evaluation and only the detached copy is used. Any malformed part
 * fails closed (`ok: false`); the result is detached and deep-frozen.
 */
export function evaluatePerformance(request: PerformanceRequest, hash: CattleHash): PerformanceResult {
  return deepFreezeAnimalValue(evaluateRequest(request, hash));
}

function evaluateRequest(request: PerformanceRequest, hash: CattleHash): PerformanceResult {
  const canonical = toCanonicalPlainData(request);
  if (!canonical.ok) return { ok: false, issues: [{ code: "CATTLE_PERFORMANCE_NON_CANONICAL_INPUT", ref: canonical.path }] };
  const req: unknown = canonical.value;
  if (!isRecord(req) || !hasOnlyFields(req, REQUEST_FIELDS) || !Array.isArray(req.targets) || !Array.isArray(req.policies) || !isRecord(req.query) || !hasOnlyFields(req.query, QUERY_FIELDS)) {
    return { ok: false, issues: [{ code: "CATTLE_PERFORMANCE_INVALID_REQUEST", ref: null }] };
  }
  const issues: PerformanceIssue[] = [];
  const effectiveAt = canonicalObligationInstant(req.query.effectiveAt);
  const knowledgeCutoff = canonicalObligationInstant(req.query.knowledgeCutoff);
  if (effectiveAt === null) issues.push({ code: "CATTLE_PERFORMANCE_INVALID_EFFECTIVE_AT", ref: null });
  if (knowledgeCutoff === null) issues.push({ code: "CATTLE_PERFORMANCE_INVALID_KNOWLEDGE_CUTOFF", ref: null });
  const windowFrom = optionalInstant(req.query.windowFrom);
  const projectionAt = optionalInstant(req.query.projectionAt);
  if (!windowFrom.ok || (windowFrom.value !== null && effectiveAt !== null && compareInstants(windowFrom.value, effectiveAt) >= 0)) issues.push({ code: "CATTLE_PERFORMANCE_INVALID_WINDOW", ref: null });
  if (!projectionAt.ok || (projectionAt.value !== null && effectiveAt !== null && compareInstants(projectionAt.value, effectiveAt) <= 0)) issues.push({ code: "CATTLE_PERFORMANCE_INVALID_PROJECTION_AT", ref: null });
  const contexts = readContexts(req.contexts);
  if (!contexts.ok) issues.push(...contexts.issues);
  const verified = verifyWeightReadContract(req.weights as WeightReadContract, hash);
  if (!verified.valid) issues.push({ code: "CATTLE_PERFORMANCE_WEIGHT_CONTRACT_INVALID", ref: verified.reasonCode ?? null });
  if (issues.length > 0 || effectiveAt === null || knowledgeCutoff === null || !contexts.ok || !verified.valid) return { ok: false, issues: uniqueIssues(issues) };

  const contract = req.weights as WeightReadContract;
  if (compareInstants(contract.effectiveAt, effectiveAt) !== 0 || compareInstants(contract.knowledgeCutoff, knowledgeCutoff) !== 0) {
    return { ok: false, issues: [{ code: "CATTLE_PERFORMANCE_WEIGHT_CONTRACT_TIME_MISMATCH", ref: null }] };
  }

  const targets = admitPerformanceTargets(req.targets as unknown[], knowledgeCutoff);
  const policyAdmission = admitPerformancePolicies(req.policies as unknown[], knowledgeCutoff);
  if (!targets.ok) issues.push(...targets.issues.map((i) => ({ code: `CATTLE_PERFORMANCE_TARGET_${i.code}` as PerformanceIssueCode, ref: i.ref })));
  if (!policyAdmission.ok) issues.push(...policyAdmission.issues.map((i) => ({ code: `CATTLE_PERFORMANCE_POLICY_${i.code}` as PerformanceIssueCode, ref: i.ref })));
  if (!targets.ok || !policyAdmission.ok) return { ok: false, issues: uniqueIssues(issues) };

  const policies = {
    minimumInterval: resolvePolicyKind(policyAdmission.byId, "MINIMUM_INTERVAL"),
    acceptedBases: resolvePolicyKind(policyAdmission.byId, "ACCEPTED_BASES"),
    trend: resolvePolicyKind(policyAdmission.byId, "TREND"),
  };
  const derivationPolicies: DerivationPolicies = { minimumInterval: policies.minimumInterval, acceptedBases: policies.acceptedBases };
  const acceptedBases = policies.acceptedBases.state === "SUPPLIED" ? policies.acceptedBases.rule.acceptedBases : null;
  const targetIds = [...targets.byId.keys()].sort(compareStrings);

  const animals: AnimalPerformance[] = contract.series.map((series) => {
    const allPoints = performancePoints(series.observations, acceptedBases);
    const points = windowFrom.value === null ? allPoints : allPoints.filter((p) => compareInstants(p.at, windowFrom.value as string) >= 0);
    const period = derivePeriod(points, derivationPolicies);
    const context = contexts.byAnimal.get(series.animalId) ?? null;
    const content: Omit<AnimalPerformance, "fingerprint"> = {
      animalId: series.animalId,
      seriesFingerprint: series.fingerprint,
      context,
      points,
      coverage: coverageOf(points),
      period,
      intervals: deriveIntervals(points, derivationPolicies),
      quality: qualityOf(points, period, derivationPolicies),
      trend: classifyTrend(period, policies.trend),
      targetOutcome: targetIds.length === 0 ? "NO_TARGET" : "COMPARED",
      comparisons: targetIds.map((id) => compareWithTarget(id, targets.byId.get(id)!, series.animalId, context, effectiveAt, period, allPoints, derivationPolicies)),
      prediction: projectionAt.value === null ? null : predictWeight(period, projectionAt.value),
    };
    // A result fingerprint binds its evaluation context (FINGERPRINTS.md rule 4).
    const payload = { effectiveAt, knowledgeCutoff, windowFrom: windowFrom.value, projectionAt: projectionAt.value, policies, result: content };
    return { ...content, fingerprint: computePerformanceFingerprint("CATTLE_PERFORMANCE_ANIMAL_RESULT", payload, hash) };
  });

  const content: Omit<PerformanceEvaluation, "fingerprint"> = {
    performancePayloadVersion: CATTLE_PERFORMANCE_PAYLOAD_VERSION,
    effectiveAt,
    knowledgeCutoff,
    windowFrom: windowFrom.value,
    projectionAt: projectionAt.value,
    weightContractFingerprint: contract.fingerprint,
    policies,
    targetIds,
    targetDefinitions: targetIds.map((targetId) => {
      const r = targets.byId.get(targetId)!;
      return { targetId, state: r.state, versions: r.state === "RESOLVED" ? [r.record] : r.records };
    }),
    animals,
    aggregate: aggregateOf(contract, animals, targetIds),
  };
  const evaluation: PerformanceEvaluation = { ...content, fingerprint: computePerformanceFingerprint("CATTLE_PERFORMANCE_RESULT", content, hash) };
  return { ok: true, evaluation: deepFreezeAnimalValue(structuredClone(evaluation)) };
}
