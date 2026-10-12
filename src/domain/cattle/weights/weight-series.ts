/**
 * Cattle C4 — weight series and latest-known weight per animal at an explicit
 * (`effectiveAt`, `knowledgeCutoff`). No clock is read; both times are strict
 * UTC and compared by instant (C1 `compareInstants`). No ADG, gain, trend or
 * target logic (C5).
 *
 * Admission order (TEMPORAL_EVIDENCE.md):
 * 1. The whole request is checked with `toCanonicalPlainData`; non-canonical
 *    input is rejected (`CATTLE_WEIGHT_NON_CANONICAL_INPUT`) before anything
 *    else, and only the detached deep-frozen copy is used.
 * 2. The query and the explicit animal set are validated.
 * 3. Records whose readable `provenance.receivedAt` is after the cutoff are
 *    set aside unvalidated; an unreadable knowledge time is kept and fails
 *    closed at validation (CAT-INV-003/004/005).
 * 4. Identity among admitted records before validity: same id + different
 *    content (an invalid copy included) fails closed; identical duplicates
 *    (instants by instant) are idempotent (CAT-INV-008).
 * 5. Content validation (`materialiseWeightObservation`): malformed ⇒
 *    `ok: false`, never repaired — for every admitted record, whichever
 *    animal it names.
 * 6. Supersession at the cutoff (C2 `resolveBitemporalRecords`): a link to an
 *    unknown target, to another animal or method, or in a cycle fails closed;
 *    competing live corrections are reported with no winner (CAT-INV-026).
 * 7. Valid-time view: live observations with `observedAt <= effectiveAt`.
 * 8. Output rebuilt, sorted, deep-frozen and fingerprinted.
 *
 * Latest-known weight (per animal) — REQUIRED inputs: the live observations in
 * view, the latest such instant `L`, the observations at `L` and their
 * competition state. Precedence (first match wins):
 *   NONE (no live observation in view; never zero)
 *   > EVIDENCE_CONFLICT (more than one live observation at `L` — never
 *     averaged, whatever their values — or an observation at `L` is in a
 *     competing-correction branch)
 *   > UNSUPPORTED (the single observation at `L` has no exact kilogram
 *     conversion; an earlier weight is never substituted)
 *   > KNOWN (the single observation at `L`, canonical kilograms).
 */

import type { AssessmentFingerprint } from "../../assessment-integrity";
import { animalInstantKey, compareInstants, deepFreezeAnimalValue, isOpaqueRef, isValidAnimalInstant, type FarmReturnAnimalId } from "../animal-ledger";
import type { CattleInformationClass } from "../information";
import { compareStrings, type CattleHash } from "../integrity";
import { canonicalField, toCanonicalPlainData } from "../regulatory/canonical-input";
import { collectBitemporalRecords, resolveBitemporalRecords, type BitemporalRecord } from "../regulatory/bitemporal-records";
import { canonicalObligationInstant } from "../regulatory/obligation-time";
import { isRecord, rawIdentityKey } from "../health/health-input";
import { CATTLE_WEIGHT_PAYLOAD_VERSION, computeWeightFingerprint } from "./weight-integrity";
import {
  canonicalWeightOf,
  materialiseWeightObservation,
  semanticWeightObservation,
  weightInformationClass,
  weightLinkAllowed,
  weightMeasurementBasis,
  weightObservationClaimKey,
  weightObservationContentKey,
  weightRecordIdOf,
  type CanonicalWeight,
  type CattleWeightObservation,
  type WeightMeasurementBasis,
  type WeightRecordIssueCode,
} from "./weight-observation";

export interface WeightProjectionQuery {
  /** VALID time: observations at or before this instant are in view. */
  effectiveAt: string;
  /** KNOWLEDGE time: only records with `provenance.receivedAt <= knowledgeCutoff` exist. */
  knowledgeCutoff: string;
}

/** Every part must be canonical plain data (CAMPAIGN.md, "Canonical input contract"). */
export interface WeightSeriesRequest {
  observations: readonly unknown[];
  /** Explicit animal set (opaque C1 ids, unique). */
  animalIds: readonly string[];
  query: WeightProjectionQuery;
}

export type WeightObservationStatus = "LIVE" | "SUPERSEDED";

export interface WeightSeriesEntry {
  recordId: string;
  /** As recorded (original spelling). */
  observedAt: string;
  status: WeightObservationStatus;
  /** Known records superseding this one (sorted). */
  supersededBy: string[];
  /** A competing-correction branch involves this record. */
  inCompetition: boolean;
  /** `observedAt <= effectiveAt`. */
  inView: boolean;
  measurementBasis: WeightMeasurementBasis;
  informationClass: CattleInformationClass;
  canonicalWeight: CanonicalWeight;
  /** The full record: recorded value/unit, method, device, quality, conditions and provenance. */
  observation: CattleWeightObservation;
}

export interface WeightCompetition {
  targetId: string;
  terminalIds: string[];
}

export type LatestWeightState = "KNOWN" | "NONE" | "EVIDENCE_CONFLICT" | "UNSUPPORTED";

export type LatestWeightReasonCode =
  | "CATTLE_WEIGHT_NO_OBSERVATION"
  | "CATTLE_WEIGHT_SAME_INSTANT_OBSERVATIONS"
  | "CATTLE_WEIGHT_COMPETING_CORRECTIONS"
  | "CATTLE_WEIGHT_UNIT_NOT_CONVERTIBLE";

export interface LatestKnownWeight {
  state: LatestWeightState;
  /** The latest observation instant in view (canonical spelling); `null` when NONE. */
  observedAt: string | null;
  /** Canonical kilograms; set only when KNOWN. */
  kg: number | null;
  /** The live observations at `observedAt` (sorted). */
  recordIds: string[];
  /** Distinct convertible kilogram values at `observedAt` when EVIDENCE_CONFLICT (ascending); never combined. */
  candidateKg: number[];
  reasonCodes: LatestWeightReasonCode[];
}

export interface AnimalWeightSeries {
  animalId: FarmReturnAnimalId;
  /** Canonical spellings. */
  effectiveAt: string;
  knowledgeCutoff: string;
  /** This animal's record ids known by the cutoff (sorted). */
  knownRecordIds: string[];
  /** Live observations in view, chronological (instant, then id). */
  observations: WeightSeriesEntry[];
  /** Every known record of this animal (superseded and not-yet-observed included), chronological. */
  history: WeightSeriesEntry[];
  /** Live known observations after `effectiveAt` (sorted). */
  notYetObservedRecordIds: string[];
  competitions: WeightCompetition[];
  latest: LatestKnownWeight;
  fingerprint: AssessmentFingerprint;
}

export interface WeightSeriesProjection {
  weightPayloadVersion: typeof CATTLE_WEIGHT_PAYLOAD_VERSION;
  effectiveAt: string;
  knowledgeCutoff: string;
  /** The requested animal set (sorted). */
  animalIds: string[];
  /** One per requested animal, in `animalIds` order (an animal with no record gets an empty series, latest NONE). */
  series: AnimalWeightSeries[];
}

export type WeightRequestIssueCode =
  | "CATTLE_WEIGHT_NON_CANONICAL_INPUT"
  | "CATTLE_WEIGHT_INVALID_REQUEST"
  | "CATTLE_WEIGHT_INVALID_EFFECTIVE_AT"
  | "CATTLE_WEIGHT_INVALID_KNOWLEDGE_CUTOFF"
  | "CATTLE_WEIGHT_INVALID_ANIMAL_SET"
  | "CATTLE_WEIGHT_RECORD_DUPLICATE_ID_DIFFERENT_CONTENT"
  | "CATTLE_WEIGHT_SUPERSESSION_TARGET_NOT_KNOWN"
  | "CATTLE_WEIGHT_SUPERSESSION_OUT_OF_SCOPE"
  | "CATTLE_WEIGHT_SUPERSESSION_CYCLE"
  | WeightRecordIssueCode;

export interface WeightIssue {
  code: WeightRequestIssueCode;
  /** Record id (or non-canonical path) when readable. */
  ref: string | null;
}

export type WeightSeriesResult = { ok: true; projection: WeightSeriesProjection } | { ok: false; issues: WeightIssue[] };

// ---------------------------------------------------------------------------
// Query (shared with the scope resolver)
// ---------------------------------------------------------------------------

export interface ValidWeightTimes {
  effectiveAt: string;
  knowledgeCutoff: string;
}

/** Validates both times and returns their canonical nine-digit spellings. */
export function readWeightTimes(raw: unknown): { ok: true; times: ValidWeightTimes } | { ok: false; codes: WeightRequestIssueCode[] } {
  const effectiveAt = canonicalObligationInstant(canonicalField(raw, "effectiveAt"));
  const knowledgeCutoff = canonicalObligationInstant(canonicalField(raw, "knowledgeCutoff"));
  const codes: WeightRequestIssueCode[] = [];
  if (effectiveAt === null) codes.push("CATTLE_WEIGHT_INVALID_EFFECTIVE_AT");
  if (knowledgeCutoff === null) codes.push("CATTLE_WEIGHT_INVALID_KNOWLEDGE_CUTOFF");
  return effectiveAt === null || knowledgeCutoff === null ? { ok: false, codes } : { ok: true, times: { effectiveAt, knowledgeCutoff } };
}

/** A unique set of opaque animal ids, sorted; `null` when malformed. */
export function readAnimalSet(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || !raw.every(isOpaqueRef) || new Set(raw).size !== raw.length) return null;
  return [...(raw as string[])].sort(compareStrings);
}

export function uniqueWeightIssues(issues: readonly WeightIssue[]): WeightIssue[] {
  const unique = new Map(issues.map((i) => [`${i.ref ?? ""}\u0000${i.code}`, i]));
  return [...unique.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, i]) => i);
}

// ---------------------------------------------------------------------------
// Admission
// ---------------------------------------------------------------------------

type WeightEnvelope = CattleWeightObservation & BitemporalRecord;

function envelope(r: CattleWeightObservation): WeightEnvelope {
  return { ...r, receivedAt: r.provenance.receivedAt };
}

function strip(e: WeightEnvelope): CattleWeightObservation {
  const { receivedAt, ...record } = e;
  void receivedAt;
  return record;
}

function receivedAfter(raw: unknown, knowledgeCutoff: string): boolean {
  const t = canonicalField(raw, "provenance", "receivedAt");
  return isValidAnimalInstant(t) && compareInstants(t, knowledgeCutoff) > 0;
}

function admitWeightRecords(raws: readonly unknown[], knowledgeCutoff: string): { ok: true; records: WeightEnvelope[] } | { ok: false; issues: WeightIssue[] } {
  const admitted = raws.filter((raw) => !receivedAfter(raw, knowledgeCutoff));
  const issues: WeightIssue[] = [];
  const materialised = admitted.map((raw) => ({ raw, result: materialiseWeightObservation(raw) }));
  // Identity before validity (CAT-INV-008): an invalid copy still collides.
  const byId = new Map<string, Set<string>>();
  for (const { raw, result } of materialised) {
    const id = weightRecordIdOf(raw);
    if (id === null) continue;
    const key = result.ok ? `valid:${weightObservationContentKey(result.record)}` : `raw:${rawIdentityKey(raw)}`;
    byId.set(id, (byId.get(id) ?? new Set()).add(key));
  }
  for (const [id, keys] of byId) if (keys.size > 1) issues.push({ code: "CATTLE_WEIGHT_RECORD_DUPLICATE_ID_DIFFERENT_CONTENT", ref: id });
  const valid: WeightEnvelope[] = [];
  for (const { result } of materialised) {
    if (result.ok) valid.push(envelope(result.record));
    else issues.push(...result.issues.map((code) => ({ code, ref: result.recordId })));
  }
  const collected = collectBitemporalRecords(valid, (e) => weightObservationContentKey(strip(e)));
  if (!collected.ok) {
    for (const i of collected.issues) {
      issues.push({ code: i.code === "CATTLE_RECORD_SELF_SUPERSESSION" ? "CATTLE_WEIGHT_RECORD_SELF_SUPERSESSION" : "CATTLE_WEIGHT_RECORD_DUPLICATE_ID_DIFFERENT_CONTENT", ref: i.recordId });
    }
  }
  if (issues.length > 0 || !collected.ok) return { ok: false, issues: uniqueWeightIssues(issues) };
  return { ok: true, records: collected.records };
}

const LINK_ISSUE: Record<string, WeightRequestIssueCode> = {
  CATTLE_RECORD_SUPERSESSION_TARGET_NOT_KNOWN: "CATTLE_WEIGHT_SUPERSESSION_TARGET_NOT_KNOWN",
  CATTLE_RECORD_SUPERSESSION_OUT_OF_SCOPE: "CATTLE_WEIGHT_SUPERSESSION_OUT_OF_SCOPE",
  CATTLE_RECORD_SUPERSESSION_CYCLE: "CATTLE_WEIGHT_SUPERSESSION_CYCLE",
};

// ---------------------------------------------------------------------------
// Fingerprint payload (semantic: canonical instants, sorted sets)
// ---------------------------------------------------------------------------

function semanticEntry(e: WeightSeriesEntry): unknown {
  return { ...e, observedAt: animalInstantKey(e.observedAt), observation: semanticWeightObservation(e.observation) };
}

/** The `CATTLE_WEIGHT_SERIES` payload: every output field, instants as canonical keys. Throws on a malformed series. */
export function weightSeriesPayload(s: Omit<AnimalWeightSeries, "fingerprint">): unknown {
  return {
    animalId: s.animalId,
    effectiveAt: animalInstantKey(s.effectiveAt),
    knowledgeCutoff: animalInstantKey(s.knowledgeCutoff),
    knownRecordIds: s.knownRecordIds,
    observations: s.observations.map(semanticEntry),
    history: s.history.map(semanticEntry),
    notYetObservedRecordIds: s.notYetObservedRecordIds,
    competitions: s.competitions,
    latest: { ...s.latest, observedAt: s.latest.observedAt === null ? null : animalInstantKey(s.latest.observedAt) },
  };
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

function chronological(a: WeightSeriesEntry, b: WeightSeriesEntry): number {
  return compareInstants(a.observedAt, b.observedAt) || compareStrings(a.recordId, b.recordId);
}

/** The latest-known weight of a chronological list of live in-view observations (precedence in the header). */
export function latestKnownWeightOf(observations: readonly WeightSeriesEntry[]): LatestKnownWeight {
  if (observations.length === 0) {
    return { state: "NONE", observedAt: null, kg: null, recordIds: [], candidateKg: [], reasonCodes: ["CATTLE_WEIGHT_NO_OBSERVATION"] };
  }
  const last = observations[observations.length - 1];
  const atLatest = observations.filter((e) => compareInstants(e.observedAt, last.observedAt) === 0);
  const observedAt = canonicalObligationInstant(last.observedAt);
  const recordIds = atLatest.map((e) => e.recordId).sort(compareStrings);
  const reasonCodes: LatestWeightReasonCode[] = [];
  if (atLatest.length > 1) reasonCodes.push("CATTLE_WEIGHT_SAME_INSTANT_OBSERVATIONS");
  if (atLatest.some((e) => e.inCompetition)) reasonCodes.push("CATTLE_WEIGHT_COMPETING_CORRECTIONS");
  if (reasonCodes.length > 0) {
    const candidateKg = [...new Set(atLatest.flatMap((e) => (e.canonicalWeight.kg === null ? [] : [e.canonicalWeight.kg])))].sort((a, b) => a - b);
    return { state: "EVIDENCE_CONFLICT", observedAt, kg: null, recordIds, candidateKg, reasonCodes };
  }
  const only = atLatest[0].canonicalWeight;
  if (only.state === "UNSUPPORTED") {
    return { state: "UNSUPPORTED", observedAt, kg: null, recordIds, candidateKg: [], reasonCodes: ["CATTLE_WEIGHT_UNIT_NOT_CONVERTIBLE"] };
  }
  return { state: "KNOWN", observedAt, kg: only.kg, recordIds, candidateKg: [], reasonCodes: [] };
}

/**
 * Module-internal: projects already-canonical observations for an already
 * validated animal set and times. Reached only through `projectWeightSeries`
 * and `buildWeightReadContract`, which run the canonical boundary first.
 */
export function projectCanonicalWeightSeries(
  observationsRaw: readonly unknown[],
  animalIds: readonly string[],
  times: ValidWeightTimes,
  hash: CattleHash,
): WeightSeriesResult {
  const admitted = admitWeightRecords(observationsRaw, times.knowledgeCutoff);
  if (!admitted.ok) return { ok: false, issues: admitted.issues };
  const resolution = resolveBitemporalRecords(admitted.records, times.knowledgeCutoff, {
    linkAllowed: (source, target) => weightLinkAllowed(strip(source), strip(target)),
    competitionKey: (r) => weightObservationClaimKey(strip(r)),
  });
  if (resolution.linkIssues.length > 0) {
    return { ok: false, issues: uniqueWeightIssues(resolution.linkIssues.map((i) => ({ code: LINK_ISSUE[i.code], ref: i.recordId }))) };
  }
  const known = resolution.known.map(strip);
  const competitions: WeightCompetition[] = resolution.competitions.map((c) => ({ targetId: c.targetId, terminalIds: c.terminals.map((t) => t.recordId) }));
  const competing = new Set(competitions.flatMap((c) => [c.targetId, ...c.terminalIds]));
  const toEntry = (r: CattleWeightObservation): WeightSeriesEntry => ({
    recordId: r.recordId,
    observedAt: r.observedAt,
    status: resolution.supersededBy.has(r.recordId) ? "SUPERSEDED" : "LIVE",
    supersededBy: [...(resolution.supersededBy.get(r.recordId) ?? [])],
    inCompetition: competing.has(r.recordId),
    inView: compareInstants(r.observedAt, times.effectiveAt) <= 0,
    measurementBasis: weightMeasurementBasis(r.method),
    informationClass: weightInformationClass(r.method),
    canonicalWeight: canonicalWeightOf(r.weight),
    observation: r,
  });
  const series = animalIds.map((animalId) => {
    const history = known.filter((r) => r.animalId === animalId).map(toEntry).sort(chronological);
    const observations = history.filter((e) => e.status === "LIVE" && e.inView);
    const content: Omit<AnimalWeightSeries, "fingerprint"> = {
      animalId: animalId as FarmReturnAnimalId,
      effectiveAt: times.effectiveAt,
      knowledgeCutoff: times.knowledgeCutoff,
      knownRecordIds: history.map((e) => e.recordId).sort(compareStrings),
      observations,
      history,
      notYetObservedRecordIds: history.filter((e) => e.status === "LIVE" && !e.inView).map((e) => e.recordId).sort(compareStrings),
      competitions: competitions.filter((c) => history.some((e) => e.recordId === c.targetId)),
      latest: latestKnownWeightOf(observations),
    };
    return { ...content, fingerprint: computeWeightFingerprint("CATTLE_WEIGHT_SERIES", weightSeriesPayload(content), hash) };
  });
  const projection: WeightSeriesProjection = {
    weightPayloadVersion: CATTLE_WEIGHT_PAYLOAD_VERSION,
    effectiveAt: times.effectiveAt,
    knowledgeCutoff: times.knowledgeCutoff,
    animalIds: [...animalIds],
    series,
  };
  return { ok: true, projection: deepFreezeAnimalValue(structuredClone(projection)) };
}

const REQUEST_FIELDS = ["observations", "animalIds", "query"];
const QUERY_FIELDS = ["effectiveAt", "knowledgeCutoff"];

/**
 * Projects each requested animal's weight series and latest-known weight.
 * The complete request must be canonical plain data; it is checked as a
 * whole before evaluation and only the detached copy is used. Any malformed
 * admitted record, identity collision or supersession defect fails closed
 * (`ok: false`); the result is detached and deep-frozen.
 */
export function projectWeightSeries(request: WeightSeriesRequest, hash: CattleHash): WeightSeriesResult {
  return deepFreezeAnimalValue(projectSeriesRequest(request, hash));
}

function projectSeriesRequest(request: WeightSeriesRequest, hash: CattleHash): WeightSeriesResult {
  const canonical = toCanonicalPlainData(request);
  if (!canonical.ok) return { ok: false, issues: [{ code: "CATTLE_WEIGHT_NON_CANONICAL_INPUT", ref: canonical.path }] };
  const req: unknown = canonical.value;
  if (!isRecord(req) || !Object.keys(req).every((k) => REQUEST_FIELDS.includes(k)) || !Array.isArray(req.observations)) {
    return { ok: false, issues: [{ code: "CATTLE_WEIGHT_INVALID_REQUEST", ref: null }] };
  }
  if (!isRecord(req.query) || !Object.keys(req.query).every((k) => QUERY_FIELDS.includes(k))) return { ok: false, issues: [{ code: "CATTLE_WEIGHT_INVALID_REQUEST", ref: null }] };
  const times = readWeightTimes(req.query);
  const animalIds = readAnimalSet(req.animalIds);
  const codes: WeightRequestIssueCode[] = times.ok ? [] : [...times.codes];
  if (animalIds === null) codes.push("CATTLE_WEIGHT_INVALID_ANIMAL_SET");
  if (!times.ok || animalIds === null) return { ok: false, issues: codes.map((code) => ({ code, ref: null })) };
  return projectCanonicalWeightSeries(req.observations as unknown[], animalIds, times.times, hash);
}
