/**
 * Cattle C1 — deterministic bitemporal projection of an animal ledger to an
 * as-of snapshot, and the snapshot's content fingerprint.
 *
 * A query names BOTH times explicitly — nothing reads a clock:
 * - `knowledgeCutoff`: only assertions with `provenance.receivedAt <=
 *   knowledgeCutoff` exist, and only supersessions known by then apply. A
 *   correction received later is invisible, so an earlier snapshot is
 *   reproducible exactly.
 * - `effectiveAt`: interval assertions (identifiers, location, management
 *   group, lifecycle status) apply when `validFrom <= effectiveAt < validTo`.
 *   Identity facts (DOB, sex, breed) are not interval-scoped.
 *
 * Each dimension resolves to KNOWN / UNKNOWN / CONFLICTING_EVIDENCE /
 * INVALID_EVIDENCE. Absence is UNKNOWN, never a default. Differing active
 * values are CONFLICTING_EVIDENCE — no source precedence, never "latest
 * wins". A malformed supersession (target missing or not yet known,
 * cross-kind link, cycle) makes the affected dimension(s) INVALID_EVIDENCE
 * (fail closed). Competing corrections of the same assertion with different
 * content are CONFLICTING_EVIDENCE (each branch followed through later
 * corrections to its live terminal descendants) — for interval kinds only when the
 * competing corrections are effective at `effectiveAt`, so a conflict
 * confined to another period stays in history but never contaminates this
 * snapshot. The ledger header must be a supported C1 BOVINE ledger
 * (`rematerialiseAnimalLedger`); anything else fails closed.
 *
 * Projection is order-independent (the ledger is re-materialised and sorted)
 * and the returned snapshot is a deep-frozen copy; it shares nothing with the
 * caller's ledger object.
 */

import { canonicalizeValue, computeAssessmentFingerprint, verifyAssessmentFingerprint, type AssessmentFingerprint, type FingerprintVerificationResult } from "../assessment-integrity";
import {
  animalInstantKey,
  compareInstants,
  deepFreezeAnimalValue,
  intervalCovers,
  isValidAnimalInstant,
  rematerialiseAnimalLedger,
  type AnimalAssertion,
  type AnimalAssertionKind,
  type AnimalLedger,
  type AnimalLedgerIssue,
  type AnimalLocationRef,
  type AnimalPresenceStatus,
  type AnimalSpecies,
  type BiologicalSex,
  type BreedDescription,
  type FarmReturnAnimalId,
} from "./animal-ledger";
import { compareStrings, sortedUnique, type CattleHash } from "./integrity";

export const CATTLE_ANIMAL_SNAPSHOT_SCHEMA_VERSION = 1;

export interface AnimalProjectionQuery {
  /** VALID time: the physical-world instant being reconstructed. */
  effectiveAt: string;
  /** KNOWLEDGE time: the latest `receivedAt` admitted. */
  knowledgeCutoff: string;
}

export type AnimalResolutionState = "KNOWN" | "UNKNOWN" | "CONFLICTING_EVIDENCE" | "INVALID_EVIDENCE";

export type AnimalDimensionIssueCode =
  | "CATTLE_ANIMAL_NO_EVIDENCE"
  | "CATTLE_ANIMAL_SOURCE_REPORTED_UNKNOWN"
  | "CATTLE_ANIMAL_CONFLICTING_VALUES"
  | "CATTLE_ANIMAL_COMPETING_CORRECTIONS"
  | "CATTLE_ANIMAL_SUPERSESSION_TARGET_NOT_KNOWN"
  | "CATTLE_ANIMAL_CROSS_KIND_SUPERSESSION"
  | "CATTLE_ANIMAL_SUPERSESSION_CYCLE";

export interface AnimalResolution<T> {
  state: AnimalResolutionState;
  /** Set only when KNOWN. */
  value: T | null;
  /** Distinct competing values when CONFLICTING_EVIDENCE (canonically sorted). */
  conflictingValues: T[];
  /** Assertions explaining the result (active, and in valid time where scoped). */
  evidence: AnimalAssertion[];
  /** Known-by-cutoff assertions of this dimension that a correction replaced. */
  supersededAssertionIds: string[];
  issues: AnimalDimensionIssueCode[];
}

export interface ExternalIdentifierSchemeResolution extends AnimalResolution<string> {
  scheme: string;
}

export interface AssertionHistoryEntry {
  assertion: AnimalAssertion;
  /** Known-by-cutoff assertions that supersede this one (sorted). */
  supersededBy: string[];
}

export interface ExternalIdentifierProjection {
  /** One entry per scheme seen in history, sorted by scheme. */
  byScheme: ExternalIdentifierSchemeResolution[];
  /** Every identifier assertion known by the cutoff, superseded or not. */
  history: AssertionHistoryEntry[];
  issues: AnimalDimensionIssueCode[];
}

export interface AnimalSnapshotIssue {
  dimension: AnimalAssertionKind;
  scheme: string | null;
  code: AnimalDimensionIssueCode;
}

export interface AnimalSnapshot {
  snapshotSchemaVersion: typeof CATTLE_ANIMAL_SNAPSHOT_SCHEMA_VERSION;
  animalId: FarmReturnAnimalId;
  species: AnimalSpecies;
  effectiveAt: string;
  knowledgeCutoff: string;
  /** Every assertion id known by the cutoff (sorted) — binds the evidence set. */
  knownAssertionIds: string[];
  dateOfBirth: AnimalResolution<string>;
  sex: AnimalResolution<BiologicalSex>;
  breed: AnimalResolution<BreedDescription>;
  externalIdentifiers: ExternalIdentifierProjection;
  lifecycleStatus: AnimalResolution<AnimalPresenceStatus>;
  location: AnimalResolution<AnimalLocationRef>;
  managementGroup: AnimalResolution<string>;
  /** Every non-KNOWN reason across dimensions (sorted). */
  issues: AnimalSnapshotIssue[];
}

export type AnimalProjectionIssueCode = "CATTLE_ANIMAL_INVALID_EFFECTIVE_AT" | "CATTLE_ANIMAL_INVALID_KNOWLEDGE_CUTOFF" | "CATTLE_ANIMAL_INVALID_LEDGER";

export type AnimalProjectionResult =
  | { ok: true; snapshot: AnimalSnapshot }
  | { ok: false; issues: AnimalProjectionIssueCode[]; ledgerIssues: AnimalLedgerIssue[] };

// ---------------------------------------------------------------------------

/** Correction content for competition: interval bounds compare by instant, not spelling. */
function contentOf(a: AnimalAssertion): string {
  return canonicalizeValue(
    "validFrom" in a
      ? { value: a.value, validFrom: animalInstantKey(a.validFrom), validTo: a.validTo === null ? null : animalInstantKey(a.validTo) }
      : { value: a.value },
  );
}

function valueKey(value: unknown): string {
  return canonicalizeValue(value);
}

interface DimensionPrep {
  visible: AnimalAssertion[];
  active: AnimalAssertion[];
  superseded: string[];
  invalidIssues: AnimalDimensionIssueCode[];
  /** Per corrected target, the live (unsuperseded) terminal descendants of
   * every correction branch from it, sorted by id. A branch is followed
   * through corrections-of-corrections, so superseding one side of a
   * competition never detaches it from the other. Whether they compete is
   * decided per query (`competingAt`), never all-time. */
  correctionGroups: AnimalAssertion[][];
  supersededBy: Map<string, string[]>;
}

function prepare(kind: AnimalAssertionKind, known: AnimalAssertion[], byId: Map<string, AnimalAssertion>): DimensionPrep {
  const visible = known.filter((a) => a.kind === kind);
  const invalid: AnimalDimensionIssueCode[] = [];
  const supersededBy = new Map<string, string[]>();
  for (const a of visible) {
    for (const target of a.supersedes) {
      const t = byId.get(target);
      if (!t) invalid.push("CATTLE_ANIMAL_SUPERSESSION_TARGET_NOT_KNOWN");
      else if (t.kind !== kind) invalid.push("CATTLE_ANIMAL_CROSS_KIND_SUPERSESSION");
      else supersededBy.set(target, [...(supersededBy.get(target) ?? []), a.assertionId]);
    }
  }
  // A link from another kind INTO this dimension also taints it.
  for (const a of known) {
    if (a.kind !== kind && a.supersedes.some((t) => byId.get(t)?.kind === kind)) invalid.push("CATTLE_ANIMAL_CROSS_KIND_SUPERSESSION");
  }
  if (hasCycle(visible, byId, kind)) invalid.push("CATTLE_ANIMAL_SUPERSESSION_CYCLE");
  const superseded = [...supersededBy.keys()].sort(compareStrings);
  const active = visible.filter((a) => !supersededBy.has(a.assertionId));
  for (const ids of supersededBy.values()) ids.sort(compareStrings);
  const correctionGroups = superseded.map((target) => sortById(liveDescendants(target, supersededBy).map((id) => byId.get(id)!)));
  return {
    visible,
    active,
    superseded,
    invalidIssues: sortedUnique(invalid) as AnimalDimensionIssueCode[],
    correctionGroups,
    supersededBy,
  };
}

/**
 * Every live (unsuperseded) assertion reachable from `target` through
 * known-by-cutoff supersession links. Iterative with a visited set, so it
 * terminates on any graph; a cycle is already reported as INVALID_EVIDENCE.
 */
function liveDescendants(target: string, supersededBy: Map<string, string[]>): string[] {
  const live = new Set<string>();
  const visited = new Set<string>([target]);
  const stack = [...(supersededBy.get(target) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const next = supersededBy.get(id);
    if (next) stack.push(...next);
    else live.add(id);
  }
  return [...live];
}

/**
 * Live corrections of the same target that disagree in content. Identity
 * facts (`at === null`) compare every live correction; interval kinds compare
 * only corrections effective at `at`, so a competition confined to another
 * period never contaminates this snapshot (it stays visible in history).
 */
function competingAt(prep: DimensionPrep, at: string | null): AnimalAssertion[] {
  const competing = new Map<string, AnimalAssertion>();
  for (const group of prep.correctionGroups) {
    const live = at === null ? group : covering(group, at);
    if (new Set(live.map(contentOf)).size > 1) for (const c of live) competing.set(c.assertionId, c);
  }
  return sortById([...competing.values()]);
}

function hasCycle(visible: AnimalAssertion[], byId: Map<string, AnimalAssertion>, kind: AnimalAssertionKind): boolean {
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    const s = state.get(id);
    if (s === 1) return true;
    if (s === 2) return false;
    state.set(id, 1);
    const a = byId.get(id);
    if (a && a.kind === kind) for (const t of a.supersedes) if (visit(t)) return true;
    state.set(id, 2);
    return false;
  };
  return visible.some((a) => visit(a.assertionId));
}

function resolve<T>(
  candidates: AnimalAssertion[],
  prep: DimensionPrep,
  competing: AnimalAssertion[],
  invalid: AnimalDimensionIssueCode[],
): AnimalResolution<T> {
  const base = { supersededAssertionIds: prep.superseded };
  if (invalid.length > 0) {
    return { ...base, state: "INVALID_EVIDENCE", value: null, conflictingValues: [], evidence: prep.visible, issues: invalid };
  }
  const evidence = sortById([...new Map([...candidates, ...competing].map((a) => [a.assertionId, a])).values()]);
  const stated = candidates.filter((a) => a.value !== null);
  const distinct = new Map<string, T>();
  for (const a of [...stated, ...competing.filter((c) => c.value !== null)]) distinct.set(valueKey(a.value), a.value as T);
  const conflictingValues = [...distinct.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, v]) => v);
  if (competing.length > 0) {
    return { ...base, state: "CONFLICTING_EVIDENCE", value: null, conflictingValues, evidence, issues: ["CATTLE_ANIMAL_COMPETING_CORRECTIONS"] };
  }
  if (distinct.size > 1) {
    return { ...base, state: "CONFLICTING_EVIDENCE", value: null, conflictingValues, evidence, issues: ["CATTLE_ANIMAL_CONFLICTING_VALUES"] };
  }
  if (distinct.size === 1) return { ...base, state: "KNOWN", value: conflictingValues[0], conflictingValues: [], evidence, issues: [] };
  const issues: AnimalDimensionIssueCode[] = candidates.length > 0 ? ["CATTLE_ANIMAL_SOURCE_REPORTED_UNKNOWN"] : ["CATTLE_ANIMAL_NO_EVIDENCE"];
  return { ...base, state: "UNKNOWN", value: null, conflictingValues: [], evidence, issues };
}

function sortById(list: AnimalAssertion[]): AnimalAssertion[] {
  return [...list].sort((a, b) => compareStrings(a.assertionId, b.assertionId));
}

function covering(list: AnimalAssertion[], at: string): AnimalAssertion[] {
  return list.filter((a) => "validFrom" in a && intervalCovers(a, at));
}

function resolveFact<T>(kind: AnimalAssertionKind, known: AnimalAssertion[], byId: Map<string, AnimalAssertion>): AnimalResolution<T> {
  const prep = prepare(kind, known, byId);
  return resolve<T>(prep.active, prep, competingAt(prep, null), prep.invalidIssues);
}

function resolveInterval<T>(kind: AnimalAssertionKind, known: AnimalAssertion[], byId: Map<string, AnimalAssertion>, at: string): AnimalResolution<T> {
  const prep = prepare(kind, known, byId);
  return resolve<T>(covering(prep.active, at), prep, competingAt(prep, at), prep.invalidIssues);
}

function schemeOf(a: AnimalAssertion): string {
  return a.kind === "EXTERNAL_IDENTIFIER" ? a.value.scheme : "";
}

function resolveIdentifiers(known: AnimalAssertion[], byId: Map<string, AnimalAssertion>, at: string): ExternalIdentifierProjection {
  const prep = prepare("EXTERNAL_IDENTIFIER", known, byId);
  const schemes = sortedUnique(prep.visible.map(schemeOf));
  const competingNow = competingAt(prep, at);
  const byScheme: ExternalIdentifierSchemeResolution[] = schemes.map((scheme) => {
    const schemePrep = { ...prep, visible: prep.visible.filter((a) => schemeOf(a) === scheme) };
    const active = covering(prep.active.filter((a) => schemeOf(a) === scheme), at);
    const competing = competingNow.filter((a) => schemeOf(a) === scheme);
    const resolved = resolve<{ scheme: string; identifier: string }>(active, schemePrep, competing, prep.invalidIssues);
    return {
      ...resolved,
      scheme,
      value: resolved.value ? resolved.value.identifier : null,
      conflictingValues: sortedUnique(resolved.conflictingValues.map((v) => v.identifier)),
    };
  });
  const history = prep.visible.map((assertion) => ({ assertion, supersededBy: prep.supersededBy.get(assertion.assertionId) ?? [] }));
  const issues = sortedUnique([...prep.invalidIssues, ...byScheme.flatMap((s) => s.issues)]) as AnimalDimensionIssueCode[];
  return { byScheme, history, issues };
}

/**
 * Projects the ledger as of `effectiveAt`, using only what Farm Return knew by
 * `knowledgeCutoff`. Both times are required, explicit inputs.
 */
export function projectAnimalSnapshot(ledger: AnimalLedger, query: AnimalProjectionQuery): AnimalProjectionResult {
  const effectiveAt = query?.effectiveAt;
  const knowledgeCutoff = query?.knowledgeCutoff;
  const issues: AnimalProjectionIssueCode[] = [];
  if (!isValidAnimalInstant(effectiveAt)) issues.push("CATTLE_ANIMAL_INVALID_EFFECTIVE_AT");
  if (!isValidAnimalInstant(knowledgeCutoff)) issues.push("CATTLE_ANIMAL_INVALID_KNOWLEDGE_CUTOFF");
  // Re-materialise: validates a hand-built ledger and detaches from caller objects.
  const rebuilt = rematerialiseAnimalLedger(ledger);
  if (!rebuilt.ok) issues.push("CATTLE_ANIMAL_INVALID_LEDGER");
  if (issues.length > 0 || !rebuilt.ok) return { ok: false, issues, ledgerIssues: rebuilt.ok ? [] : rebuilt.issues };
  const canonical = rebuilt.ledger;
  const known = canonical.assertions.filter((a) => compareInstants(a.provenance.receivedAt, knowledgeCutoff) <= 0);
  const byId = new Map(known.map((a) => [a.assertionId, a]));

  const dateOfBirth = resolveFact<string>("DATE_OF_BIRTH", known, byId);
  const sex = resolveFact<BiologicalSex>("SEX", known, byId);
  const breed = resolveFact<BreedDescription>("BREED", known, byId);
  const externalIdentifiers = resolveIdentifiers(known, byId, effectiveAt);
  const lifecycleStatus = resolveInterval<AnimalPresenceStatus>("LIFECYCLE_STATUS", known, byId, effectiveAt);
  const location = resolveInterval<AnimalLocationRef>("LOCATION", known, byId, effectiveAt);
  const managementGroup = resolveInterval<string>("MANAGEMENT_GROUP", known, byId, effectiveAt);

  const snapshotIssues: AnimalSnapshotIssue[] = [];
  const add = (dimension: AnimalAssertionKind, scheme: string | null, codes: AnimalDimensionIssueCode[]) => {
    for (const code of codes) snapshotIssues.push({ dimension, scheme, code });
  };
  add("DATE_OF_BIRTH", null, dateOfBirth.issues);
  add("SEX", null, sex.issues);
  add("BREED", null, breed.issues);
  if (externalIdentifiers.byScheme.length === 0) add("EXTERNAL_IDENTIFIER", null, externalIdentifiers.issues.length ? externalIdentifiers.issues : ["CATTLE_ANIMAL_NO_EVIDENCE"]);
  for (const s of externalIdentifiers.byScheme) add("EXTERNAL_IDENTIFIER", s.scheme, s.issues);
  add("LIFECYCLE_STATUS", null, lifecycleStatus.issues);
  add("LOCATION", null, location.issues);
  add("MANAGEMENT_GROUP", null, managementGroup.issues);
  snapshotIssues.sort(
    (a, b) => compareStrings(a.dimension, b.dimension) || compareStrings(a.scheme ?? "", b.scheme ?? "") || compareStrings(a.code, b.code),
  );

  const snapshot: AnimalSnapshot = {
    snapshotSchemaVersion: CATTLE_ANIMAL_SNAPSHOT_SCHEMA_VERSION,
    animalId: canonical.animalId,
    species: canonical.species,
    effectiveAt,
    knowledgeCutoff,
    knownAssertionIds: known.map((a) => a.assertionId),
    dateOfBirth,
    sex,
    breed,
    externalIdentifiers,
    lifecycleStatus,
    location,
    managementGroup,
    issues: snapshotIssues,
  };
  // Detached deep copy: shares no object with the ledger or the caller.
  return { ok: true, snapshot: deepFreezeAnimalValue(structuredClone(snapshot)) };
}

/**
 * Lists every assertion of `kind` known by `knowledgeCutoff`, superseded or
 * not, with the corrections that replaced it — the auditable history behind
 * any as-of projection. `null` if the ledger or cutoff is invalid.
 */
export function animalAssertionHistory(ledger: AnimalLedger, kind: AnimalAssertionKind, knowledgeCutoff: string): AssertionHistoryEntry[] | null {
  if (!isValidAnimalInstant(knowledgeCutoff)) return null;
  const rebuilt = rematerialiseAnimalLedger(ledger);
  if (!rebuilt.ok) return null;
  const known = rebuilt.ledger.assertions.filter((a) => compareInstants(a.provenance.receivedAt, knowledgeCutoff) <= 0);
  const byId = new Map(known.map((a) => [a.assertionId, a]));
  const prep = prepare(kind, known, byId);
  const history = prep.visible.map((assertion) => ({ assertion, supersededBy: prep.supersededBy.get(assertion.assertionId) ?? [] }));
  return deepFreezeAnimalValue(structuredClone(history));
}

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

/**
 * Wraps the snapshot with its own kind and payload version so an animal
 * snapshot fingerprint can never collide with a C0 cattle payload
 * (`{kind, cattlePayloadVersion, payload}`) or an assessment fingerprint.
 * Reuses `assessment-integrity.ts`'s canonicalisation and SHA-256 pipeline
 * unchanged. Change detection only — NOT a digital signature.
 */
function snapshotPayload(snapshot: AnimalSnapshot): unknown {
  return { kind: "CATTLE_ANIMAL_SNAPSHOT", animalSnapshotPayloadVersion: CATTLE_ANIMAL_SNAPSHOT_SCHEMA_VERSION, payload: snapshot };
}

export function computeAnimalSnapshotFingerprint(snapshot: AnimalSnapshot, hash: CattleHash): AssessmentFingerprint {
  return computeAssessmentFingerprint(snapshotPayload(snapshot), hash);
}

export function verifyAnimalSnapshotFingerprint(
  snapshot: AnimalSnapshot,
  expected: AssessmentFingerprint,
  hash: CattleHash,
): FingerprintVerificationResult {
  return verifyAssessmentFingerprint(snapshotPayload(snapshot), expected, hash);
}
