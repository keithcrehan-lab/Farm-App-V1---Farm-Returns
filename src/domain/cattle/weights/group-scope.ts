/**
 * Cattle C4 — group-scope resolution at an explicit (`effectiveAt`,
 * `knowledgeCutoff`). Group truth stays in C1 (`MANAGEMENT_GROUP`
 * assertions); this module creates none. Membership is read ONLY from C1
 * `projectAnimalSnapshot` (`managementGroup` dimension) at the same instants
 * and cutoff; nothing is inferred from location, lifecycle or weights.
 *
 * Membership state per animal (from the C1 resolution, first match wins):
 *   INVALID (C1 INVALID_EVIDENCE) > EVIDENCE_CONFLICT (C1
 *   CONFLICTING_EVIDENCE, whichever groups compete) > UNKNOWN (C1 UNKNOWN,
 *   including no group evidence at all) > MEMBER (KNOWN, exactly the
 *   requested group ref) / NOT_MEMBER (KNOWN, another group).
 * REQUIRED input for MEMBER / NOT_MEMBER: a KNOWN C1 management group at
 * `effectiveAt`. Unknown, conflicting and invalid animals are reported in
 * their own sets — never silently included or excluded (CAT-INV-009/022).
 *
 * Herd scope is an explicit, caller-supplied animal set: every listed animal
 * is a member by declaration; no ledger is read and no history applies.
 *
 * History (GROUP only, when `historyFrom` is supplied): the membership state
 * at `historyFrom` and at every MANAGEMENT_GROUP interval bound known by the
 * cutoff in (`historyFrom`, `effectiveAt`], each projected through C1, kept
 * where it changes. Membership is piecewise constant between those bounds,
 * so the segments are the complete history over the window.
 *
 * The complete request is checked with `toCanonicalPlainData` first; any
 * malformed ledger, a repeated animal with a different ledger, or a malformed
 * query fails closed. Output is sorted, deep-frozen and fingerprinted.
 */

import { canonicalizeValue, type AssessmentFingerprint } from "../../assessment-integrity";
import {
  animalInstantKey,
  assertionContentKey,
  compareInstants,
  deepFreezeAnimalValue,
  isOpaqueRef,
  rematerialiseAnimalLedger,
  type AnimalAssertion,
  type AnimalLedger,
  type FarmReturnAnimalId,
} from "../animal-ledger";
import { animalAssertionHistory, projectAnimalSnapshot, type AnimalDimensionIssueCode, type AnimalResolution } from "../animal-snapshot";
import { compareStrings, type CattleHash } from "../integrity";
import { canonicalField, toCanonicalPlainData } from "../regulatory/canonical-input";
import { canonicalObligationInstant } from "../regulatory/obligation-time";
import { isRecord } from "../health/health-input";
import { CATTLE_WEIGHT_PAYLOAD_VERSION, computeWeightFingerprint } from "./weight-integrity";
import { readAnimalSet, readWeightTimes, type ValidWeightTimes } from "./weight-series";

export type ScopeKind = "GROUP" | "EXPLICIT_SET";

/** Every part must be canonical plain data. `ledgers` are C1 `AnimalLedger`s. */
export type ScopeSpec = { kind: "GROUP"; groupRef: string; ledgers: readonly AnimalLedger[] } | { kind: "EXPLICIT_SET"; animalIds: readonly string[] };

export interface ScopeQuery {
  effectiveAt: string;
  knowledgeCutoff: string;
  /** GROUP only: start of the audit history window (strictly before `effectiveAt`). */
  historyFrom?: string | null;
}

export interface GroupScopeRequest {
  scope: ScopeSpec;
  query: ScopeQuery;
}

export type ScopeMembershipState = "MEMBER" | "NOT_MEMBER" | "UNKNOWN" | "EVIDENCE_CONFLICT" | "INVALID";

export interface ScopeMembership {
  state: ScopeMembershipState;
  /** The KNOWN C1 management group (`null` otherwise, and for an explicit set). */
  group: string | null;
  /** Competing C1 group values when EVIDENCE_CONFLICT (sorted). */
  conflictingGroups: string[];
  /** C1 dimension issues behind a non-KNOWN state. */
  issues: AnimalDimensionIssueCode[];
}

export interface ScopeAnimalEntry extends ScopeMembership {
  animalId: FarmReturnAnimalId;
  /** The C1 MANAGEMENT_GROUP assertions explaining the state (as stored). */
  evidence: AnimalAssertion[];
}

export interface MembershipSegment {
  /** Canonical spelling; the state holds from here until the next segment (or `effectiveAt`). */
  from: string;
  membership: ScopeMembership;
}

export interface ScopeHistory {
  /** Canonical spellings; window [`from`, `to`]. */
  from: string;
  to: string;
  /** One per animal (sorted by id). */
  animals: { animalId: FarmReturnAnimalId; segments: MembershipSegment[] }[];
}

export interface ScopeResolution {
  weightPayloadVersion: typeof CATTLE_WEIGHT_PAYLOAD_VERSION;
  scopeKind: ScopeKind;
  groupRef: string | null;
  effectiveAt: string;
  knowledgeCutoff: string;
  /** Every animal considered (sorted by id). */
  animals: ScopeAnimalEntry[];
  members: string[];
  notMembers: string[];
  unknown: string[];
  conflict: string[];
  invalid: string[];
  history: ScopeHistory | null;
  fingerprint: AssessmentFingerprint;
}

export type ScopeIssueCode =
  | "CATTLE_SCOPE_NON_CANONICAL_INPUT"
  | "CATTLE_SCOPE_INVALID_REQUEST"
  | "CATTLE_SCOPE_INVALID_EFFECTIVE_AT"
  | "CATTLE_SCOPE_INVALID_KNOWLEDGE_CUTOFF"
  | "CATTLE_SCOPE_INVALID_HISTORY_FROM"
  | "CATTLE_SCOPE_HISTORY_NOT_APPLICABLE"
  | "CATTLE_SCOPE_INVALID_GROUP_REF"
  | "CATTLE_SCOPE_INVALID_ANIMAL_SET"
  | "CATTLE_SCOPE_INVALID_LEDGER"
  | "CATTLE_SCOPE_DUPLICATE_ANIMAL_DIFFERENT_LEDGER";

export interface ScopeIssue {
  code: ScopeIssueCode;
  /** Animal id / non-canonical path when readable. */
  ref: string | null;
}

export type ScopeResult = { ok: true; scope: ScopeResolution } | { ok: false; issues: ScopeIssue[] };

// ---------------------------------------------------------------------------
// Membership through C1
// ---------------------------------------------------------------------------

function membershipOf(resolution: AnimalResolution<string>, groupRef: string): ScopeMembership {
  const issues = [...resolution.issues];
  switch (resolution.state) {
    case "INVALID_EVIDENCE":
      return { state: "INVALID", group: null, conflictingGroups: [], issues };
    case "CONFLICTING_EVIDENCE":
      return { state: "EVIDENCE_CONFLICT", group: null, conflictingGroups: [...resolution.conflictingValues].sort(compareStrings), issues };
    case "UNKNOWN":
      return { state: "UNKNOWN", group: null, conflictingGroups: [], issues };
    case "KNOWN":
      return { state: resolution.value === groupRef ? "MEMBER" : "NOT_MEMBER", group: resolution.value, conflictingGroups: [], issues };
  }
}

function snapshotGroup(ledger: AnimalLedger, effectiveAt: string, knowledgeCutoff: string): AnimalResolution<string> | null {
  const projected = projectAnimalSnapshot(ledger, { effectiveAt, knowledgeCutoff });
  return projected.ok ? projected.snapshot.managementGroup : null;
}

/** MANAGEMENT_GROUP interval bounds known by the cutoff in (`from`, `to`], canonical and sorted. */
function boundsWithin(ledger: AnimalLedger, knowledgeCutoff: string, from: string, to: string): string[] | null {
  const history = animalAssertionHistory(ledger, "MANAGEMENT_GROUP", knowledgeCutoff);
  if (history === null) return null;
  const bounds = new Map<string, string>();
  for (const { assertion } of history) {
    if (!("validFrom" in assertion)) continue;
    for (const t of [assertion.validFrom, assertion.validTo]) {
      if (t === null || compareInstants(t, from) <= 0 || compareInstants(t, to) > 0) continue;
      const canonical = canonicalObligationInstant(t);
      if (canonical !== null) bounds.set(animalInstantKey(canonical), canonical);
    }
  }
  return [...bounds.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, t]) => t);
}

// ---------------------------------------------------------------------------
// Fingerprint payload (semantic)
// ---------------------------------------------------------------------------

/** The `CATTLE_GROUP_SCOPE` payload: every output field, instants as canonical keys, evidence by C1 content key. Throws on a malformed scope. */
export function scopeResolutionPayload(s: Omit<ScopeResolution, "fingerprint">): unknown {
  return {
    scopeKind: s.scopeKind,
    groupRef: s.groupRef,
    effectiveAt: animalInstantKey(s.effectiveAt),
    knowledgeCutoff: animalInstantKey(s.knowledgeCutoff),
    animals: s.animals.map((a) => ({ ...a, evidence: a.evidence.map(assertionContentKey) })),
    members: s.members,
    notMembers: s.notMembers,
    unknown: s.unknown,
    conflict: s.conflict,
    invalid: s.invalid,
    history:
      s.history === null
        ? null
        : {
            from: animalInstantKey(s.history.from),
            to: animalInstantKey(s.history.to),
            animals: s.history.animals.map((a) => ({ animalId: a.animalId, segments: a.segments.map((g) => ({ from: animalInstantKey(g.from), membership: g.membership })) })),
          },
  };
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

interface ValidScopeRequest {
  spec: { kind: "GROUP"; groupRef: string; ledgers: AnimalLedger[] } | { kind: "EXPLICIT_SET"; animalIds: string[] };
  times: ValidWeightTimes;
  historyFrom: string | null;
}

const fail = (code: ScopeIssueCode, ref: string | null = null): ScopeResult => ({ ok: false, issues: [{ code, ref }] });

function readLedgers(raw: unknown): { ok: true; ledgers: AnimalLedger[] } | { ok: false; issues: ScopeIssue[] } {
  if (!Array.isArray(raw)) return { ok: false, issues: [{ code: "CATTLE_SCOPE_INVALID_REQUEST", ref: null }] };
  const issues: ScopeIssue[] = [];
  const byAnimal = new Map<string, { ledger: AnimalLedger; key: string; spelling: string }[]>();
  for (const entry of raw) {
    const rebuilt = rematerialiseAnimalLedger(entry);
    if (!rebuilt.ok) {
      const id = canonicalField(entry, "animalId");
      issues.push({ code: "CATTLE_SCOPE_INVALID_LEDGER", ref: isOpaqueRef(id) ? id : null });
      continue;
    }
    const ledger = rebuilt.ledger;
    const candidate = { ledger, key: canonicalizeValue(ledger.assertions.map(assertionContentKey)), spelling: canonicalizeValue(ledger) };
    byAnimal.set(ledger.animalId, [...(byAnimal.get(ledger.animalId) ?? []), candidate]);
  }
  const ledgers: AnimalLedger[] = [];
  for (const [animalId, candidates] of byAnimal) {
    if (new Set(candidates.map((c) => c.key)).size > 1) {
      issues.push({ code: "CATTLE_SCOPE_DUPLICATE_ANIMAL_DIFFERENT_LEDGER", ref: animalId });
      continue;
    }
    // Identical ledgers (instants by instant) are idempotent; one spelling kept independently of input order.
    ledgers.push([...candidates].sort((a, b) => compareStrings(a.spelling, b.spelling))[0].ledger);
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, ledgers: ledgers.sort((a, b) => compareStrings(a.animalId, b.animalId)) };
}

const SCOPE_REQUEST_FIELDS = ["scope", "query"];
const QUERY_FIELDS = ["effectiveAt", "knowledgeCutoff", "historyFrom"];

/** Validates an already-canonical scope request (spec + query). */
export function readScopeRequest(scopeRaw: unknown, queryRaw: unknown): { ok: true; request: ValidScopeRequest } | { ok: false; issues: ScopeIssue[] } {
  const issues: ScopeIssue[] = [];
  if (!isRecord(queryRaw) || !Object.keys(queryRaw).every((k) => QUERY_FIELDS.includes(k))) return { ok: false, issues: [{ code: "CATTLE_SCOPE_INVALID_REQUEST", ref: null }] };
  const times = readWeightTimes(queryRaw);
  if (!times.ok) {
    for (const c of times.codes) issues.push({ code: c === "CATTLE_WEIGHT_INVALID_EFFECTIVE_AT" ? "CATTLE_SCOPE_INVALID_EFFECTIVE_AT" : "CATTLE_SCOPE_INVALID_KNOWLEDGE_CUTOFF", ref: null });
  }
  const rawFrom = queryRaw.historyFrom ?? null;
  const historyFrom = rawFrom === null ? null : canonicalObligationInstant(rawFrom);
  if (rawFrom !== null && (historyFrom === null || (times.ok && compareInstants(historyFrom, times.times.effectiveAt) >= 0))) {
    issues.push({ code: "CATTLE_SCOPE_INVALID_HISTORY_FROM", ref: null });
  }
  if (!isRecord(scopeRaw)) return { ok: false, issues: [...issues, { code: "CATTLE_SCOPE_INVALID_REQUEST", ref: null }] };
  let spec: ValidScopeRequest["spec"] | null = null;
  if (scopeRaw.kind === "GROUP" && Object.keys(scopeRaw).every((k) => ["kind", "groupRef", "ledgers"].includes(k))) {
    if (!isOpaqueRef(scopeRaw.groupRef)) issues.push({ code: "CATTLE_SCOPE_INVALID_GROUP_REF", ref: null });
    const ledgers = readLedgers(scopeRaw.ledgers);
    if (!ledgers.ok) issues.push(...ledgers.issues);
    else if (isOpaqueRef(scopeRaw.groupRef)) spec = { kind: "GROUP", groupRef: scopeRaw.groupRef, ledgers: ledgers.ledgers };
  } else if (scopeRaw.kind === "EXPLICIT_SET" && Object.keys(scopeRaw).every((k) => ["kind", "animalIds"].includes(k))) {
    const animalIds = readAnimalSet(scopeRaw.animalIds);
    if (animalIds === null) issues.push({ code: "CATTLE_SCOPE_INVALID_ANIMAL_SET", ref: null });
    else spec = { kind: "EXPLICIT_SET", animalIds };
    if (rawFrom !== null) issues.push({ code: "CATTLE_SCOPE_HISTORY_NOT_APPLICABLE", ref: null });
  } else {
    issues.push({ code: "CATTLE_SCOPE_INVALID_REQUEST", ref: null });
  }
  if (issues.length > 0 || spec === null || !times.ok) {
    const unique = new Map(issues.map((i) => [`${i.ref ?? ""}\u0000${i.code}`, i]));
    return { ok: false, issues: [...unique.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, i]) => i) };
  }
  return { ok: true, request: { spec, times: times.times, historyFrom } };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Module-internal: resolves an already validated, detached scope request. */
export function resolveValidScope(request: ValidScopeRequest, hash: CattleHash): ScopeResult {
  const { spec, times, historyFrom } = request;
  let animals: ScopeAnimalEntry[];
  let history: ScopeHistory | null = null;
  if (spec.kind === "EXPLICIT_SET") {
    animals = spec.animalIds.map((animalId) => ({ animalId: animalId as FarmReturnAnimalId, state: "MEMBER", group: null, conflictingGroups: [], issues: [], evidence: [] }));
  } else {
    animals = [];
    const histories: ScopeHistory["animals"] = [];
    for (const ledger of spec.ledgers) {
      const resolution = snapshotGroup(ledger, times.effectiveAt, times.knowledgeCutoff);
      if (resolution === null) return fail("CATTLE_SCOPE_INVALID_LEDGER", ledger.animalId);
      animals.push({ animalId: ledger.animalId, ...membershipOf(resolution, spec.groupRef), evidence: [...resolution.evidence] });
      if (historyFrom === null) continue;
      const bounds = boundsWithin(ledger, times.knowledgeCutoff, historyFrom, times.effectiveAt);
      if (bounds === null) return fail("CATTLE_SCOPE_INVALID_LEDGER", ledger.animalId);
      const segments: MembershipSegment[] = [];
      for (const at of [historyFrom, ...bounds]) {
        const r = snapshotGroup(ledger, at, times.knowledgeCutoff);
        if (r === null) return fail("CATTLE_SCOPE_INVALID_LEDGER", ledger.animalId);
        const membership = membershipOf(r, spec.groupRef);
        const previous = segments[segments.length - 1];
        if (!previous || canonicalizeValue(previous.membership) !== canonicalizeValue(membership)) segments.push({ from: at, membership });
      }
      histories.push({ animalId: ledger.animalId, segments });
    }
    if (historyFrom !== null) history = { from: historyFrom, to: times.effectiveAt, animals: histories };
  }
  const ids = (state: ScopeMembershipState) => animals.filter((a) => a.state === state).map((a) => a.animalId as string);
  const content: Omit<ScopeResolution, "fingerprint"> = {
    weightPayloadVersion: CATTLE_WEIGHT_PAYLOAD_VERSION,
    scopeKind: spec.kind,
    groupRef: spec.kind === "GROUP" ? spec.groupRef : null,
    effectiveAt: times.effectiveAt,
    knowledgeCutoff: times.knowledgeCutoff,
    animals,
    members: ids("MEMBER"),
    notMembers: ids("NOT_MEMBER"),
    unknown: ids("UNKNOWN"),
    conflict: ids("EVIDENCE_CONFLICT"),
    invalid: ids("INVALID"),
    history,
  };
  const scope: ScopeResolution = { ...content, fingerprint: computeWeightFingerprint("CATTLE_GROUP_SCOPE", scopeResolutionPayload(content), hash) };
  return { ok: true, scope: deepFreezeAnimalValue(structuredClone(scope)) };
}

/**
 * Resolves a group scope (C1 MANAGEMENT_GROUP membership) or an explicit herd
 * set at (`effectiveAt`, `knowledgeCutoff`). The complete request must be
 * canonical plain data; only the detached copy is used. The result is
 * deep-frozen.
 */
export function resolveGroupScope(request: GroupScopeRequest, hash: CattleHash): ScopeResult {
  return deepFreezeAnimalValue(resolveScopeRequest(request, hash));
}

function resolveScopeRequest(request: GroupScopeRequest, hash: CattleHash): ScopeResult {
  const canonical = toCanonicalPlainData(request);
  if (!canonical.ok) return fail("CATTLE_SCOPE_NON_CANONICAL_INPUT", canonical.path);
  const req: unknown = canonical.value;
  if (!isRecord(req) || !Object.keys(req).every((k) => SCOPE_REQUEST_FIELDS.includes(k))) return fail("CATTLE_SCOPE_INVALID_REQUEST");
  const valid = readScopeRequest(req.scope, req.query);
  return valid.ok ? resolveValidScope(valid.request, hash) : valid;
}
