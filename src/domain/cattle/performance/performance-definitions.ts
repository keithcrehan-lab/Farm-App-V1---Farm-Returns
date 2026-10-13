/**
 * Cattle C5 — supplied, provenance-bound performance definitions: targets
 * (`PerformanceTarget`) and explicit policies (`PerformancePolicy`).
 *
 * The engine ships with NO target, threshold, tolerance or trend boundary
 * (CAT-INV-027). Every value here is caller-supplied data bound to its
 * provenance: a C0 `SourceVersionRef` (required — a definition without one is
 * rejected), an optional C0 `RuleVersionRef`, and the knowledge time
 * `receivedAt`. Legacy `livestock.ts` constants are never read.
 *
 * Identity is definition id + version. Same identity + identical content
 * (instants by instant) is idempotent; same identity + different content
 * (an invalid copy included) fails closed. A revision is a new version whose
 * `supersedesVersions` names earlier versions of the same definition
 * (policies: of the same kind). Nothing is deleted.
 *
 * Admission at a knowledge cutoff (TEMPORAL_EVIDENCE.md):
 * 1. a record whose readable `provenance.receivedAt` is after the cutoff is
 *    set aside before any other read (CAT-INV-003/004); an unreadable one is
 *    kept and fails closed at validation (CAT-INV-005);
 * 2. identity among admitted records before validity (CAT-INV-008);
 * 3. content and provenance validation — malformed ⇒ rejected (CAT-INV-022/024);
 * 4. supersession at the cutoff through C2 `resolveBitemporalRecords`: an
 *    unknown target or a cycle fails closed; competing revisions, or more
 *    than one live version, are a conflict with no winner (CAT-INV-026).
 * A later revision is therefore invisible at an earlier cutoff.
 *
 * Materialised definitions carry every instant in the canonical nine-digit
 * spelling (semantic form for C5 outputs and fingerprints); the supplied
 * record itself remains the caller's stored representation (CAT-INV-011).
 *
 * Module-internal readers trust already-canonical input; the public entry
 * point (`evaluatePerformance`) runs the canonical boundary first.
 */

import { canonicalizeValue } from "../../assessment-integrity";
import { animalInstantKey, compareInstants, isOpaqueRef, isValidAnimalInstant } from "../animal-ledger";
import { compareStrings, sortedUnique } from "../integrity";
import type { CattleRuleProductionState, RuleVersionRef } from "../rule";
import type { SourceVersionRef } from "../source";
import { canonicalField } from "../regulatory/canonical-input";
import { canonicalObligationInstant } from "../regulatory/obligation-time";
import { collectBitemporalRecords, resolveBitemporalRecords, type BitemporalRecord } from "../regulatory/bitemporal-records";
import { hasOnlyFields, isRecord, oneOf, rawIdentityKey, sourceVersionRefOf, type Raw } from "../health/health-input";
import { WEIGHT_COLLECTION_METHODS, weightMeasurementBasis, type WeightMeasurementBasis } from "../weights";

/** C0 production states; only `PRODUCTION` makes a supplied definition verified. */
export const DEFINITION_REVIEW_STATES = ["RESEARCH", "DRAFT", "VALIDATED", "APPROVED", "PRODUCTION", "SUPERSEDED", "BLOCKED"] as const satisfies readonly CattleRuleProductionState[];

/** The measurement bases C4 reports (`weightMeasurementBasis`), as a closed list. */
export const PERFORMANCE_MEASUREMENT_BASES: readonly WeightMeasurementBasis[] = sortedUnique(WEIGHT_COLLECTION_METHODS.map(weightMeasurementBasis)) as WeightMeasurementBasis[];

export interface DefinitionProvenance {
  /** The exact source version the definition is taken from (required). */
  sourceRef: SourceVersionRef;
  /** The exact C0 rule version, when the definition is a rule's content. */
  ruleRef: RuleVersionRef | null;
  /** KNOWLEDGE time (strict UTC). */
  receivedAt: string;
  actor: string | null;
}

/** An explicit target metric. Values in canonical units: kg/day (ADG) or kg (weight at an instant). */
export type PerformanceTargetMetric = { kind: "ADG"; valueKgPerDay: number } | { kind: "WEIGHT_AT"; at: string; valueKg: number };

/** Supplied with the target, in the metric's unit; `null` = no tolerance (exact comparison). */
export interface TargetTolerance {
  below: number;
  above: number;
}

export interface ApplicabilityAttribute {
  key: string;
  value: string;
}

/**
 * Each non-null field restricts applicability; `null` (and an empty attribute
 * list) means no restriction on that dimension.
 */
export interface TargetApplicability {
  goalRef: string | null;
  productionSystemRef: string | null;
  /** Explicit animal set (sorted), or `null` = any animal. */
  animalIds: string[] | null;
  /** Exact key/value constraints (sorted by key). */
  attributes: ApplicabilityAttribute[];
}

export interface PerformanceTarget {
  targetId: string;
  version: string;
  supersedesVersions: string[];
  metric: PerformanceTargetMetric;
  tolerance: TargetTolerance | null;
  applicability: TargetApplicability;
  /** Validity period over valid time: inclusive start, exclusive end (`null` = open). */
  validFrom: string;
  validTo: string | null;
  reviewState: CattleRuleProductionState;
  provenance: DefinitionProvenance;
}

export type PerformancePolicyRule =
  | { kind: "MINIMUM_INTERVAL"; minimumDays: number }
  | { kind: "ACCEPTED_BASES"; acceptedBases: WeightMeasurementBasis[] }
  | { kind: "TREND"; fallingBelowKgPerDay: number; risingAboveKgPerDay: number };

export type PerformancePolicyKind = PerformancePolicyRule["kind"];
export const PERFORMANCE_POLICY_KINDS = ["ACCEPTED_BASES", "MINIMUM_INTERVAL", "TREND"] as const satisfies readonly PerformancePolicyKind[];

export interface PerformancePolicy {
  policyId: string;
  version: string;
  supersedesVersions: string[];
  rule: PerformancePolicyRule;
  provenance: DefinitionProvenance;
}

/** The exact definition version an output relied on. */
export interface DefinitionVersionRef {
  id: string;
  version: string;
  sourceRef: SourceVersionRef;
  ruleRef: RuleVersionRef | null;
}

export type DefinitionIssueCode =
  | "NOT_OBJECT"
  | "INVALID_IDENTITY"
  | "INVALID_KNOWLEDGE_TIME"
  | "INVALID_PROVENANCE"
  | "INVALID_CONTENT"
  | "SELF_SUPERSESSION"
  | "DUPLICATE_VERSION_DIFFERENT_CONTENT"
  | "SUPERSESSION_TARGET_NOT_KNOWN"
  | "SUPERSESSION_OUT_OF_SCOPE"
  | "SUPERSESSION_CYCLE";

export interface DefinitionIssue {
  code: DefinitionIssueCode;
  /** `id@version` when readable. */
  ref: string | null;
}

// ---------------------------------------------------------------------------
// Readers (canonical plain data; shape only, never repaired)
// ---------------------------------------------------------------------------

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNonNegative = (v: unknown): v is number => isFiniteNumber(v) && v >= 0;

function ruleRefOf(raw: unknown): { ok: boolean; value: RuleVersionRef | null } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (!isRecord(raw) || !hasOnlyFields(raw, ["ruleId", "version"]) || !isOpaqueRef(raw.ruleId) || !Number.isSafeInteger(raw.version) || (raw.version as number) < 1) {
    return { ok: false, value: null };
  }
  return { ok: true, value: { ruleId: raw.ruleId, version: raw.version as number } };
}

function provenanceOf(raw: unknown): DefinitionProvenance | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["sourceRef", "ruleRef", "receivedAt", "actor"])) return null;
  const sourceRef = sourceVersionRefOf(raw.sourceRef);
  const ruleRef = ruleRefOf(raw.ruleRef);
  const actor = raw.actor ?? null;
  if (sourceRef === null || !ruleRef.ok || !isValidAnimalInstant(raw.receivedAt) || (actor !== null && !isOpaqueRef(actor))) return null;
  return { sourceRef, ruleRef: ruleRef.value, receivedAt: canonicalObligationInstant(raw.receivedAt) as string, actor: actor as string | null };
}

function versionsOf(raw: unknown): string[] | null {
  const list = raw ?? [];
  if (!Array.isArray(list) || !list.every(isOpaqueRef) || new Set(list).size !== list.length) return null;
  return [...(list as string[])].sort(compareStrings);
}

function attributesOf(raw: unknown): ApplicabilityAttribute[] | null {
  const list = raw ?? [];
  if (!Array.isArray(list)) return null;
  const out: ApplicabilityAttribute[] = [];
  for (const a of list) {
    if (!isRecord(a) || !hasOnlyFields(a, ["key", "value"]) || !isOpaqueRef(a.key) || !isOpaqueRef(a.value)) return null;
    out.push({ key: a.key, value: a.value });
  }
  if (new Set(out.map((a) => a.key)).size !== out.length) return null;
  return out.sort((a, b) => compareStrings(a.key, b.key));
}

function optionalRef(raw: unknown): { ok: boolean; value: string | null } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  return isOpaqueRef(raw) ? { ok: true, value: raw } : { ok: false, value: null };
}

function applicabilityOf(raw: unknown): TargetApplicability | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["goalRef", "productionSystemRef", "animalIds", "attributes"])) return null;
  const goal = optionalRef(raw.goalRef);
  const system = optionalRef(raw.productionSystemRef);
  const attributes = attributesOf(raw.attributes);
  let animalIds: string[] | null = null;
  if (raw.animalIds !== undefined && raw.animalIds !== null) {
    const ids = raw.animalIds;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isOpaqueRef) || new Set(ids).size !== ids.length) return null;
    animalIds = [...(ids as string[])].sort(compareStrings);
  }
  if (!goal.ok || !system.ok || attributes === null) return null;
  return { goalRef: goal.value, productionSystemRef: system.value, animalIds, attributes };
}

function metricOf(raw: unknown): PerformanceTargetMetric | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "ADG" && hasOnlyFields(raw, ["kind", "valueKgPerDay"]) && isFiniteNumber(raw.valueKgPerDay)) {
    return { kind: "ADG", valueKgPerDay: raw.valueKgPerDay };
  }
  if (raw.kind === "WEIGHT_AT" && hasOnlyFields(raw, ["kind", "at", "valueKg"]) && isValidAnimalInstant(raw.at) && isFiniteNumber(raw.valueKg) && raw.valueKg > 0) {
    return { kind: "WEIGHT_AT", at: canonicalObligationInstant(raw.at) as string, valueKg: raw.valueKg };
  }
  return null;
}

function toleranceOf(raw: unknown): { ok: boolean; value: TargetTolerance | null } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (!isRecord(raw) || !hasOnlyFields(raw, ["below", "above"]) || !isNonNegative(raw.below) || !isNonNegative(raw.above)) return { ok: false, value: null };
  return { ok: true, value: { below: raw.below, above: raw.above } };
}

function policyRuleOf(raw: unknown): PerformancePolicyRule | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "MINIMUM_INTERVAL" && hasOnlyFields(raw, ["kind", "minimumDays"]) && isFiniteNumber(raw.minimumDays) && raw.minimumDays > 0) {
    return { kind: "MINIMUM_INTERVAL", minimumDays: raw.minimumDays };
  }
  if (raw.kind === "ACCEPTED_BASES" && hasOnlyFields(raw, ["kind", "acceptedBases"])) {
    const bases = raw.acceptedBases;
    if (!Array.isArray(bases) || bases.length === 0 || !bases.every((b) => oneOf(PERFORMANCE_MEASUREMENT_BASES, b)) || new Set(bases).size !== bases.length) return null;
    return { kind: "ACCEPTED_BASES", acceptedBases: [...(bases as WeightMeasurementBasis[])].sort(compareStrings) };
  }
  if (
    raw.kind === "TREND" &&
    hasOnlyFields(raw, ["kind", "fallingBelowKgPerDay", "risingAboveKgPerDay"]) &&
    isFiniteNumber(raw.fallingBelowKgPerDay) &&
    isFiniteNumber(raw.risingAboveKgPerDay) &&
    raw.fallingBelowKgPerDay <= raw.risingAboveKgPerDay
  ) {
    return { kind: "TREND", fallingBelowKgPerDay: raw.fallingBelowKgPerDay, risingAboveKgPerDay: raw.risingAboveKgPerDay };
  }
  return null;
}

type Materialised<R> = { ok: true; record: R } | { ok: false; ref: string | null; codes: DefinitionIssueCode[] };

const TARGET_FIELDS = ["targetId", "version", "supersedesVersions", "metric", "tolerance", "applicability", "validFrom", "validTo", "reviewState", "provenance"];
const POLICY_FIELDS = ["policyId", "version", "supersedesVersions", "rule", "provenance"];

function displayRef(id: unknown, version: unknown): string | null {
  return isOpaqueRef(id) && isOpaqueRef(version) ? `${id}@${version}` : null;
}

function commonChecks(raw: Raw, idField: string, fields: string[], codes: DefinitionIssueCode[]): { provenance: DefinitionProvenance | null; supersedes: string[] | null } {
  if (!hasOnlyFields(raw, fields)) codes.push("INVALID_CONTENT");
  if (displayRef(raw[idField], raw.version) === null) codes.push("INVALID_IDENTITY");
  if (!isValidAnimalInstant(canonicalField(raw, "provenance", "receivedAt"))) codes.push("INVALID_KNOWLEDGE_TIME");
  const provenance = provenanceOf(raw.provenance);
  if (provenance === null) codes.push("INVALID_PROVENANCE");
  const supersedes = versionsOf(raw.supersedesVersions);
  if (supersedes === null) codes.push("INVALID_CONTENT");
  else if (supersedes.includes(raw.version as string)) codes.push("SELF_SUPERSESSION");
  return { provenance, supersedes };
}

/** Validates an already-canonical target record (module-internal). */
export function materialisePerformanceTarget(raw: unknown): Materialised<PerformanceTarget> {
  if (!isRecord(raw)) return { ok: false, ref: null, codes: ["NOT_OBJECT"] };
  const ref = displayRef(raw.targetId, raw.version);
  const codes: DefinitionIssueCode[] = [];
  const { provenance, supersedes } = commonChecks(raw, "targetId", TARGET_FIELDS, codes);
  const metric = metricOf(raw.metric);
  const tolerance = toleranceOf(raw.tolerance);
  const applicability = applicabilityOf(raw.applicability);
  const validFrom = isValidAnimalInstant(raw.validFrom) ? (canonicalObligationInstant(raw.validFrom) as string) : null;
  const rawTo = raw.validTo ?? null;
  const validTo = rawTo === null ? null : isValidAnimalInstant(rawTo) ? (canonicalObligationInstant(rawTo) as string) : undefined;
  if (metric === null || !tolerance.ok || applicability === null || validFrom === null || validTo === undefined || !oneOf(DEFINITION_REVIEW_STATES, raw.reviewState)) {
    codes.push("INVALID_CONTENT");
  } else if (validTo !== null && compareInstants(validFrom, validTo) >= 0) {
    codes.push("INVALID_CONTENT");
  }
  if (codes.length > 0 || ref === null || provenance === null || supersedes === null || metric === null || applicability === null || validFrom === null || validTo === undefined) {
    return { ok: false, ref, codes: sortedUnique(codes) as DefinitionIssueCode[] };
  }
  return {
    ok: true,
    record: {
      targetId: raw.targetId as string,
      version: raw.version as string,
      supersedesVersions: supersedes,
      metric,
      tolerance: tolerance.value,
      applicability,
      validFrom,
      validTo,
      reviewState: raw.reviewState as CattleRuleProductionState,
      provenance,
    },
  };
}

/** Validates an already-canonical policy record (module-internal). */
export function materialisePerformancePolicy(raw: unknown): Materialised<PerformancePolicy> {
  if (!isRecord(raw)) return { ok: false, ref: null, codes: ["NOT_OBJECT"] };
  const ref = displayRef(raw.policyId, raw.version);
  const codes: DefinitionIssueCode[] = [];
  const { provenance, supersedes } = commonChecks(raw, "policyId", POLICY_FIELDS, codes);
  const rule = policyRuleOf(raw.rule);
  if (rule === null) codes.push("INVALID_CONTENT");
  if (codes.length > 0 || ref === null || provenance === null || supersedes === null || rule === null) return { ok: false, ref, codes: sortedUnique(codes) as DefinitionIssueCode[] };
  return { ok: true, record: { policyId: raw.policyId as string, version: raw.version as string, supersedesVersions: supersedes, rule, provenance } };
}

// ---------------------------------------------------------------------------
// Admission and resolution at a knowledge cutoff
// ---------------------------------------------------------------------------

const instantKeyOrNull = (v: string | null) => (v === null ? null : animalInstantKey(v));

function semanticProvenance(p: DefinitionProvenance): unknown {
  return { ...p, receivedAt: animalInstantKey(p.receivedAt) };
}

/** Every field of a target, instants by instant. */
export function performanceTargetContentKey(t: PerformanceTarget): string {
  return canonicalizeValue({
    ...t,
    metric: t.metric.kind === "WEIGHT_AT" ? { ...t.metric, at: animalInstantKey(t.metric.at) } : t.metric,
    validFrom: animalInstantKey(t.validFrom),
    validTo: instantKeyOrNull(t.validTo),
    provenance: semanticProvenance(t.provenance),
  });
}

export function performancePolicyContentKey(p: PerformancePolicy): string {
  return canonicalizeValue({ ...p, provenance: semanticProvenance(p.provenance) });
}

interface DefinitionSpec<R> {
  idOf: (r: R) => string;
  idField: string;
  materialise: (raw: unknown) => Materialised<R>;
  contentKey: (r: R) => string;
  /** Extra supersession scope beyond "same id" (policies: same kind). */
  sameScope: (a: R, b: R) => boolean;
}

/**
 * One definition id's state at the cutoff: exactly one live version and no
 * competing revision ⇒ RESOLVED; otherwise EVIDENCE_CONFLICT with every live
 * version and competing terminal involved (sorted by version), no winner.
 */
export type DefinitionResolution<R> = { state: "RESOLVED"; record: R } | { state: "EVIDENCE_CONFLICT"; records: R[] };

export type DefinitionAdmission<R> =
  | { ok: true; byId: Map<string, DefinitionResolution<R>> }
  | { ok: false; issues: DefinitionIssue[] };

const recordKey = (id: string, version: string) => JSON.stringify([id, version]);

function receivedAfter(raw: unknown, knowledgeCutoff: string): boolean {
  const t = canonicalField(raw, "provenance", "receivedAt");
  return isValidAnimalInstant(t) && compareInstants(t, knowledgeCutoff) > 0;
}

function uniqueIssues(issues: DefinitionIssue[]): DefinitionIssue[] {
  const unique = new Map(issues.map((i) => [`${i.ref ?? ""}\u0000${i.code}`, i]));
  return [...unique.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, i]) => i);
}

function admitDefinitions<R extends { version: string; supersedesVersions: string[]; provenance: DefinitionProvenance }>(
  raws: readonly unknown[],
  knowledgeCutoff: string,
  spec: DefinitionSpec<R>,
): DefinitionAdmission<R> {
  const admitted = raws.filter((raw) => !receivedAfter(raw, knowledgeCutoff));
  const materialised = admitted.map((raw) => ({ raw, result: spec.materialise(raw) }));
  const issues: DefinitionIssue[] = [];
  // Identity before validity (CAT-INV-008): an invalid copy still collides.
  const byIdentity = new Map<string, Set<string>>();
  for (const { raw, result } of materialised) {
    const ref = isRecord(raw) ? displayRef(raw[spec.idField], raw.version) : null;
    if (ref === null) continue;
    const key = result.ok ? `valid:${spec.contentKey(result.record)}` : `raw:${rawIdentityKey(raw)}`;
    byIdentity.set(ref, (byIdentity.get(ref) ?? new Set()).add(key));
  }
  for (const [ref, keys] of byIdentity) if (keys.size > 1) issues.push({ code: "DUPLICATE_VERSION_DIFFERENT_CONTENT", ref });
  type Envelope = { def: R } & BitemporalRecord;
  const envelopes: Envelope[] = [];
  for (const { result } of materialised) {
    if (!result.ok) {
      issues.push(...result.codes.map((code) => ({ code, ref: result.ref })));
      continue;
    }
    const r = result.record;
    const id = spec.idOf(r);
    envelopes.push({ def: r, recordId: recordKey(id, r.version), supersedes: r.supersedesVersions.map((v) => recordKey(id, v)).sort(compareStrings), receivedAt: r.provenance.receivedAt });
  }
  const display = (recordId: string) => {
    const [id, version] = JSON.parse(recordId) as [string, string];
    return `${id}@${version}`;
  };
  const collected = collectBitemporalRecords(envelopes, (e) => spec.contentKey(e.def));
  if (!collected.ok) {
    for (const i of collected.issues) issues.push({ code: i.code === "CATTLE_RECORD_SELF_SUPERSESSION" ? "SELF_SUPERSESSION" : "DUPLICATE_VERSION_DIFFERENT_CONTENT", ref: display(i.recordId) });
  }
  if (issues.length > 0 || !collected.ok) return { ok: false, issues: uniqueIssues(issues) };
  const resolution = resolveBitemporalRecords(collected.records, knowledgeCutoff, {
    linkAllowed: (source, target) => spec.idOf(source.def) === spec.idOf(target.def) && spec.sameScope(source.def, target.def),
    competitionKey: (e) => spec.contentKey(e.def),
  });
  if (resolution.linkIssues.length > 0) {
    const code = (c: string): DefinitionIssueCode =>
      c === "CATTLE_RECORD_SUPERSESSION_TARGET_NOT_KNOWN" ? "SUPERSESSION_TARGET_NOT_KNOWN" : c === "CATTLE_RECORD_SUPERSESSION_CYCLE" ? "SUPERSESSION_CYCLE" : "SUPERSESSION_OUT_OF_SCOPE";
    return { ok: false, issues: uniqueIssues(resolution.linkIssues.map((i) => ({ code: code(i.code), ref: display(i.recordId) }))) };
  }
  const ids = sortedUnique(resolution.known.map((e) => spec.idOf(e.def)));
  const byId = new Map<string, DefinitionResolution<R>>();
  for (const id of ids) {
    const live = resolution.live.filter((e) => spec.idOf(e.def) === id);
    const terminals = resolution.competitions.filter((c) => spec.idOf(c.terminals[0].def) === id).flatMap((c) => c.terminals);
    if (live.length === 1 && terminals.length === 0) {
      byId.set(id, { state: "RESOLVED", record: live[0].def });
    } else {
      const involved = new Map([...live, ...terminals].map((e) => [e.recordId, e.def]));
      byId.set(id, { state: "EVIDENCE_CONFLICT", records: [...involved.values()].sort((a, b) => compareStrings(a.version, b.version)) });
    }
  }
  return { ok: true, byId };
}

export function admitPerformanceTargets(raws: readonly unknown[], knowledgeCutoff: string): DefinitionAdmission<PerformanceTarget> {
  return admitDefinitions(raws, knowledgeCutoff, {
    idOf: (t) => t.targetId,
    idField: "targetId",
    materialise: materialisePerformanceTarget,
    contentKey: performanceTargetContentKey,
    sameScope: () => true,
  });
}

export function admitPerformancePolicies(raws: readonly unknown[], knowledgeCutoff: string): DefinitionAdmission<PerformancePolicy> {
  return admitDefinitions(raws, knowledgeCutoff, {
    idOf: (p) => p.policyId,
    idField: "policyId",
    materialise: materialisePerformancePolicy,
    contentKey: performancePolicyContentKey,
    sameScope: (a, b) => a.rule.kind === b.rule.kind,
  });
}

export function targetVersionRef(t: PerformanceTarget): DefinitionVersionRef {
  return { id: t.targetId, version: t.version, sourceRef: t.provenance.sourceRef, ruleRef: t.provenance.ruleRef };
}

export function policyVersionRef(p: PerformancePolicy): DefinitionVersionRef {
  return { id: p.policyId, version: p.version, sourceRef: p.provenance.sourceRef, ruleRef: p.provenance.ruleRef };
}

/**
 * The policy in force for one kind: none supplied/known ⇒ `NONE` (no
 * threshold, never a default); exactly one live policy ⇒ `SUPPLIED`; more
 * than one live policy of the kind, or a policy whose versions compete ⇒
 * `EVIDENCE_CONFLICT` (no winner).
 */
export type PolicyResolution<K extends PerformancePolicyKind> =
  | { state: "NONE" }
  | { state: "SUPPLIED"; policy: DefinitionVersionRef; rule: Extract<PerformancePolicyRule, { kind: K }> }
  | { state: "EVIDENCE_CONFLICT"; policyIds: string[] };

export function resolvePolicyKind<K extends PerformancePolicyKind>(byId: ReadonlyMap<string, DefinitionResolution<PerformancePolicy>>, kind: K): PolicyResolution<K> {
  const resolved: PerformancePolicy[] = [];
  const involvedIds: string[] = [];
  for (const [id, r] of byId) {
    if (r.state === "RESOLVED") {
      if (r.record.rule.kind !== kind) continue;
      resolved.push(r.record);
      involvedIds.push(id);
    } else if (r.records.some((p) => p.rule.kind === kind)) {
      involvedIds.push(id);
    }
  }
  if (involvedIds.length === 0) return { state: "NONE" };
  if (involvedIds.length > 1 || resolved.length !== 1) return { state: "EVIDENCE_CONFLICT", policyIds: involvedIds.sort(compareStrings) };
  const only = resolved[0];
  return { state: "SUPPLIED", policy: policyVersionRef(only), rule: only.rule as Extract<PerformancePolicyRule, { kind: K }> };
}
