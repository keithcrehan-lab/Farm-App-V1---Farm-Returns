/**
 * Cattle C9 — the request boundary and the delegated predecessor calls
 * (design freeze B1; CAT-INV-001/002/015/023).
 *
 * The whole request is checked with `toCanonicalPlainData` and a field-presence
 * policy; only the detached copy is read. C9 then invokes the frozen engines
 * in-process over that ONE canonical request and ONE viewpoint, with exactly
 * the call shapes C8 composes in `recommendations/evaluation-context.ts`:
 * - C8 `recommendCattle(cattle, hash, trusted)`;
 * - C2 `evaluateHerdObligations` over the C1-rematerialised request ledgers
 *   (sorted by animal id), `cattle.obligations` and the trusted registry;
 * - C7 `evaluateHealthProgrammes({...cattle.programmes, ledgers, health,
 *   obligations, query}, hash, { obligationImplementations })`;
 * - C4 `resolveGroupScope` per requested group over `cattle.ledgers`.
 * The viewpoint is the canonical `effectiveAt` / `knowledgeCutoff` C8 echoes.
 * No caller-supplied C2 / C7 / C8 output is ever accepted.
 *
 * STRUCTURAL EQUIVALENCE (B1, fail closed): for every animal, C9's C2 record
 * fingerprints must equal C8's sealed-context `obligations.recordFingerprints`
 * and C9's C7 animal-status fingerprints C8's `programmes.animalStatusFingerprints`.
 * A mismatch is an internal invariant failure: an issue, no proposals.
 */

import type { AssessmentFingerprint } from "../../assessment-integrity";
import { isOpaqueRef, rematerialiseAnimalLedger, type AnimalLedger } from "../animal-ledger";
import { compareStrings } from "../integrity";
import { evaluateHealthProgrammes, type ProgrammeStatusEvaluation } from "../programmes";
import { recommendCattle, type CattleRecommendationResult, type RecommendationTrustedInputs } from "../recommendations";
import { evaluateHerdObligations, toCanonicalPlainData, type AnimalObligationEvaluation, type ObligationImplementationRegistry } from "../regulatory";
import { resolveGroupScope, type ScopeResolution } from "../weights";
import type { CattleHash } from "../integrity";
import type { CattlePlanIssue } from "./plan-contracts";

interface CanonicalCattle {
  ledgers: unknown[];
  obligations: { catalogue: unknown; obligationIds: string[]; evidence: unknown[] } | null;
  health: unknown;
  programmes: Record<string, unknown> | null;
}

export interface Delegated {
  effectiveAt: string;
  knowledgeCutoff: string;
  recommendation: CattleRecommendationResult;
  /** C2 per-animal evaluations (sorted by animal id), or `null` when no C2 evidence was supplied. */
  obligations: AnimalObligationEvaluation[] | null;
  /** C7 evaluation, or `null` when no C7 evidence was supplied. */
  programmes: ProgrammeStatusEvaluation | null;
  /** Sorted by group ref. */
  scopes: { groupRef: string; scope: ScopeResolution }[];
}

const issue = (code: string, ref: string | null = null): CattlePlanIssue => ({ code, ref });

const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** Exactly these keys, each present and not `undefined`. */
function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isPlainObject(value) && Object.keys(value).length === keys.length && keys.every((k) => Object.hasOwn(value, k) && value[k] !== undefined);
}

/** Runs a frozen engine; anything it cannot process fails closed (`null`). */
function failClosed<T>(run: () => T): T | null {
  try {
    return run();
  } catch {
    return null;
  }
}

/** The canonical-boundary read: `{ cattle, groupScopes }`; the group refs deduplicated and sorted (a set). */
export function readCattlePlanRequest(request: unknown): { ok: true; cattle: unknown; groupRefs: string[] } | { ok: false; issues: CattlePlanIssue[] } {
  const canonical = toCanonicalPlainData(request);
  if (!canonical.ok) return { ok: false, issues: [issue("CATTLE_PLAN_NON_CANONICAL_INPUT", canonical.path)] };
  const req = canonical.value;
  if (!exactKeys(req, ["cattle", "groupScopes"]) || !Array.isArray(req.groupScopes)) return { ok: false, issues: [issue("CATTLE_PLAN_INVALID_REQUEST")] };
  const refs: string[] = [];
  for (const g of req.groupScopes as unknown[]) {
    if (!exactKeys(g, ["groupRef"]) || !isOpaqueRef(g.groupRef)) return { ok: false, issues: [issue("CATTLE_PLAN_INVALID_GROUP_SCOPE")] };
    refs.push(g.groupRef);
  }
  return { ok: true, cattle: req.cattle, groupRefs: [...new Set(refs)].sort(compareStrings) };
}

const digests = (fs: readonly AssessmentFingerprint[]) => fs.map((f) => f.digest).sort(compareStrings);
const sameDigests = (a: readonly AssessmentFingerprint[], b: readonly AssessmentFingerprint[]) => JSON.stringify(digests(a)) === JSON.stringify(digests(b));

/** Invokes C8, then C2 / C7 / C4 with the pinned call shapes at C8's viewpoint, and checks B1 equivalence. */
export function delegate(cattleRaw: unknown, groupRefs: readonly string[], hash: CattleHash, trusted: RecommendationTrustedInputs): { ok: true; delegated: Delegated } | { ok: false; issues: CattlePlanIssue[] } {
  const c8 = failClosed(() => recommendCattle(cattleRaw, hash, trusted));
  if (c8 === null) return { ok: false, issues: [issue("CATTLE_PLAN_RECOMMENDATION_REJECTED")] };
  if (!c8.ok) return { ok: false, issues: c8.issues.map((i) => issue("CATTLE_PLAN_RECOMMENDATION_REJECTED", `${i.code}:${i.ref ?? ""}`)) };
  const recommendation = c8.result;
  // C8 accepted the request, so it is canonical and conforms to C8's field-presence policy.
  const cattle = cattleRaw as CanonicalCattle;
  const { effectiveAt, knowledgeCutoff } = recommendation;
  const times = { effectiveAt, knowledgeCutoff };

  let obligations: AnimalObligationEvaluation[] | null = null;
  if (cattle.obligations !== null) {
    const ledgers: AnimalLedger[] = [];
    for (const raw of cattle.ledgers) {
      const rebuilt = failClosed(() => rematerialiseAnimalLedger(raw));
      if (rebuilt === null || !rebuilt.ok) return { ok: false, issues: [issue("CATTLE_PLAN_OBLIGATION_DELEGATION_FAILED")] };
      ledgers.push(rebuilt.ledger);
    }
    ledgers.sort((a, b) => compareStrings(a.animalId, b.animalId));
    const o = cattle.obligations;
    const herd = failClosed(() =>
      evaluateHerdObligations(
        { ledgers, evidence: o.evidence, catalogue: o.catalogue as never, implementations: trusted.obligationImplementations as ObligationImplementationRegistry, query: { ...times, obligationIds: o.obligationIds } },
        hash,
      ),
    );
    if (herd === null || !herd.ok || herd.herd.issues.length > 0 || herd.herd.catalogueIssues.length > 0) return { ok: false, issues: [issue("CATTLE_PLAN_OBLIGATION_DELEGATION_FAILED")] };
    obligations = [...herd.herd.animals];
  }

  let programmes: ProgrammeStatusEvaluation | null = null;
  if (cattle.programmes !== null) {
    const request = { ...cattle.programmes, ledgers: cattle.ledgers, health: cattle.health, obligations: cattle.obligations, query: times };
    const result = failClosed(() => evaluateHealthProgrammes(request, hash, { obligationImplementations: trusted.obligationImplementations }));
    if (result === null || !result.ok) return { ok: false, issues: [issue("CATTLE_PLAN_PROGRAMME_DELEGATION_FAILED")] };
    programmes = result.evaluation;
  }

  // B1 structural equivalence: C9's own C2 / C7 outputs are exactly the ones C8 sealed.
  const mismatches: CattlePlanIssue[] = [];
  const c2ByAnimal = new Map((obligations ?? []).map((e) => [e.animalId as string, e]));
  for (const rec of recommendation.animals) {
    const ctx = rec.context;
    const c2 = c2ByAnimal.get(rec.animalId);
    if (obligations === null ? ctx.obligations.state !== "NOT_SUPPLIED" : ctx.obligations.state !== "SUPPLIED" || c2 === undefined || !sameDigests(c2.results.map((r) => r.fingerprint), ctx.obligations.recordFingerprints)) {
      mismatches.push(issue("CATTLE_PLAN_DELEGATION_EQUIVALENCE_MISMATCH", `C2:${rec.animalId}`));
    }
    const c7 = programmes === null ? null : programmes.programmes.flatMap((p) => p.animals.filter((a) => a.animalId === rec.animalId).map((a) => a.fingerprint));
    if (c7 === null ? ctx.programmes.state !== "NOT_SUPPLIED" : ctx.programmes.state !== "SUPPLIED" || !sameDigests(c7, ctx.programmes.animalStatusFingerprints)) {
      mismatches.push(issue("CATTLE_PLAN_DELEGATION_EQUIVALENCE_MISMATCH", `C7:${rec.animalId}`));
    }
  }
  const c8Animals = new Set(recommendation.animals.map((a) => a.animalId));
  for (const id of c2ByAnimal.keys()) if (!c8Animals.has(id)) mismatches.push(issue("CATTLE_PLAN_DELEGATION_EQUIVALENCE_MISMATCH", `C2:${id}`));
  if (mismatches.length > 0) return { ok: false, issues: mismatches };

  const scopes: Delegated["scopes"] = [];
  for (const groupRef of groupRefs) {
    const r = failClosed(() => resolveGroupScope({ scope: { kind: "GROUP", groupRef, ledgers: cattle.ledgers as AnimalLedger[] }, query: times }, hash));
    if (r === null || !r.ok) return { ok: false, issues: [issue("CATTLE_PLAN_GROUP_SCOPE_REJECTED", groupRef)] };
    scopes.push({ groupRef, scope: r.scope });
  }
  return { ok: true, delegated: { effectiveAt, knowledgeCutoff, recommendation, obligations, programmes, scopes } };
}
