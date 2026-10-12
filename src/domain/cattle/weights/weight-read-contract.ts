/**
 * Cattle C4 — the read contract C5 (performance) consumes: one scope
 * resolution plus the weight series of every scope member, all projected at
 * one (`effectiveAt`, `knowledgeCutoff`), bound together by a result
 * fingerprint. No ADG, gain, trend, coverage or target logic here.
 *
 * What C5 may rely on:
 * - `scope` — members, not-members, and the unknown / conflict / invalid sets
 *   (C5 must report these, never drop them; their weights are not included).
 * - `series` — exactly one `AnimalWeightSeries` per member, in member order:
 *   live observations in view (chronological), superseded and not-yet-observed
 *   history, competitions, latest-known state, and per observation the
 *   recorded value/unit, canonical kilograms (or UNSUPPORTED), collection
 *   method, measurement basis, information class, device, supplied quality,
 *   conditions note and provenance.
 * - `verifyWeightReadContract` — re-verifies every fingerprint and the
 *   structural bindings before a contract received as data is used
 *   (CAT-INV-021/024).
 */

import type { AssessmentFingerprint, FingerprintVerificationResult } from "../../assessment-integrity";
import { canonicalizeValue } from "../../assessment-integrity";
import { animalInstantKey, deepFreezeAnimalValue } from "../animal-ledger";
import type { CattleHash } from "../integrity";
import { toCanonicalPlainData } from "../regulatory/canonical-input";
import { isRecord } from "../health/health-input";
import { readScopeRequest, resolveValidScope, scopeResolutionPayload, type ScopeIssueCode, type ScopeQuery, type ScopeResolution, type ScopeSpec } from "./group-scope";
import { CATTLE_WEIGHT_PAYLOAD_VERSION, computeWeightFingerprint, verifyWeightFingerprint } from "./weight-integrity";
import { latestKnownWeightOf, projectCanonicalWeightSeries, weightSeriesPayload, type AnimalWeightSeries, type WeightRequestIssueCode } from "./weight-series";

/** Every part must be canonical plain data. */
export interface WeightReadContractRequest {
  observations: readonly unknown[];
  scope: ScopeSpec;
  query: ScopeQuery;
}

export interface WeightReadContract {
  weightPayloadVersion: typeof CATTLE_WEIGHT_PAYLOAD_VERSION;
  /** Canonical spellings. */
  effectiveAt: string;
  knowledgeCutoff: string;
  scope: ScopeResolution;
  /** One per `scope.members` entry, same order. */
  series: AnimalWeightSeries[];
  fingerprint: AssessmentFingerprint;
}

export interface WeightReadContractIssue {
  code: WeightRequestIssueCode | ScopeIssueCode;
  ref: string | null;
}

export type WeightReadContractResult = { ok: true; contract: WeightReadContract } | { ok: false; issues: WeightReadContractIssue[] };

function contractPayload(c: Omit<WeightReadContract, "fingerprint">): unknown {
  return {
    effectiveAt: animalInstantKey(c.effectiveAt),
    knowledgeCutoff: animalInstantKey(c.knowledgeCutoff),
    scopeFingerprint: c.scope.fingerprint,
    series: c.series.map((s) => ({ animalId: s.animalId, fingerprint: s.fingerprint })),
  };
}

const REQUEST_FIELDS = ["observations", "scope", "query"];

/**
 * Builds the C5 read contract. The complete request is checked with
 * `toCanonicalPlainData` first; every admitted observation is validated
 * (whichever animal it names) and any defect fails closed. The result is
 * detached and deep-frozen.
 */
export function buildWeightReadContract(request: WeightReadContractRequest, hash: CattleHash): WeightReadContractResult {
  return deepFreezeAnimalValue(buildContract(request, hash));
}

function buildContract(request: WeightReadContractRequest, hash: CattleHash): WeightReadContractResult {
  const canonical = toCanonicalPlainData(request);
  if (!canonical.ok) return { ok: false, issues: [{ code: "CATTLE_WEIGHT_NON_CANONICAL_INPUT", ref: canonical.path }] };
  const req: unknown = canonical.value;
  if (!isRecord(req) || !Object.keys(req).every((k) => REQUEST_FIELDS.includes(k)) || !Array.isArray(req.observations)) {
    return { ok: false, issues: [{ code: "CATTLE_WEIGHT_INVALID_REQUEST", ref: null }] };
  }
  const valid = readScopeRequest(req.scope, req.query);
  if (!valid.ok) return valid;
  const scoped = resolveValidScope(valid.request, hash);
  if (!scoped.ok) return scoped;
  const projected = projectCanonicalWeightSeries(req.observations as unknown[], scoped.scope.members, valid.request.times, hash);
  if (!projected.ok) return projected;
  const content: Omit<WeightReadContract, "fingerprint"> = {
    weightPayloadVersion: CATTLE_WEIGHT_PAYLOAD_VERSION,
    effectiveAt: valid.request.times.effectiveAt,
    knowledgeCutoff: valid.request.times.knowledgeCutoff,
    scope: scoped.scope,
    series: projected.projection.series,
  };
  const contract: WeightReadContract = { ...content, fingerprint: computeWeightFingerprint("CATTLE_WEIGHT_READ_CONTRACT", contractPayload(content), hash) };
  return { ok: true, contract: deepFreezeAnimalValue(structuredClone(contract)) };
}

const invalid = (reasonCode: string, detail: string): FingerprintVerificationResult => ({ valid: false, reasonCode, detail });
const same = (a: unknown, b: unknown) => canonicalizeValue(a) === canonicalizeValue(b);

/** Structural bindings a fingerprint alone does not prove (derived sets and states). */
function bindingDefect(c: WeightReadContract): string | null {
  const t = { effectiveAt: animalInstantKey(c.effectiveAt), knowledgeCutoff: animalInstantKey(c.knowledgeCutoff) };
  const timesOf = (x: { effectiveAt: string; knowledgeCutoff: string }) => ({ effectiveAt: animalInstantKey(x.effectiveAt), knowledgeCutoff: animalInstantKey(x.knowledgeCutoff) });
  if (!same(timesOf(c.scope), t)) return "scope is projected at other times";
  const s = c.scope;
  const ids = (state: string) => s.animals.filter((a) => a.state === state).map((a) => a.animalId);
  const sets = { members: ids("MEMBER"), notMembers: ids("NOT_MEMBER"), unknown: ids("UNKNOWN"), conflict: ids("EVIDENCE_CONFLICT"), invalid: ids("INVALID") };
  if (!same(sets, { members: s.members, notMembers: s.notMembers, unknown: s.unknown, conflict: s.conflict, invalid: s.invalid })) return "scope sets differ from animal states";
  if (!same(c.series.map((x) => x.animalId), s.members)) return "series differ from scope members";
  for (const x of c.series) {
    if (!same(timesOf(x), t)) return `series ${x.animalId} is projected at other times`;
    const inView = x.history.filter((e) => e.status === "LIVE" && e.inView).map((e) => e.recordId);
    if (!same(x.observations.map((e) => e.recordId), inView)) return `series ${x.animalId} observations differ from its history`;
    if (!same(x.latest, latestKnownWeightOf(x.observations))) return `series ${x.animalId} latest-known weight differs from its observations`;
  }
  return null;
}

/**
 * Re-verifies a read contract received as data: canonical plain data, the
 * supported payload version, every fingerprint (scope, each series, the
 * contract) and the structural bindings between them. Any malformed part
 * fails closed (`valid: false`), never throws.
 */
export function verifyWeightReadContract(contract: WeightReadContract, hash: CattleHash): FingerprintVerificationResult {
  const canonical = toCanonicalPlainData(contract);
  if (!canonical.ok) return invalid("CATTLE_WEIGHT_CONTRACT_NON_CANONICAL", canonical.path);
  const c = canonical.value as WeightReadContract;
  if (!isRecord(c) || c.weightPayloadVersion !== CATTLE_WEIGHT_PAYLOAD_VERSION || !isRecord(c.scope) || c.scope.weightPayloadVersion !== CATTLE_WEIGHT_PAYLOAD_VERSION) {
    return invalid("CATTLE_WEIGHT_CONTRACT_UNSUPPORTED_PAYLOAD_VERSION", "unsupported weight payload version");
  }
  try {
    const { fingerprint: scopeFingerprint, ...scope } = c.scope;
    const scopeCheck = verifyWeightFingerprint("CATTLE_GROUP_SCOPE", scopeResolutionPayload(scope), scopeFingerprint, hash);
    if (!scopeCheck.valid) return scopeCheck;
    for (const s of c.series) {
      const { fingerprint, ...series } = s;
      const check = verifyWeightFingerprint("CATTLE_WEIGHT_SERIES", weightSeriesPayload(series), fingerprint, hash);
      if (!check.valid) return check;
    }
    const defect = bindingDefect(c);
    if (defect !== null) return invalid("CATTLE_WEIGHT_CONTRACT_BINDING_MISMATCH", defect);
    const { fingerprint, ...content } = c;
    return verifyWeightFingerprint("CATTLE_WEIGHT_READ_CONTRACT", contractPayload(content), fingerprint, hash);
  } catch {
    return invalid("CATTLE_WEIGHT_CONTRACT_MALFORMED", "contract structure is malformed");
  }
}
