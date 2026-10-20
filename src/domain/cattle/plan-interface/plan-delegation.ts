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
 *
 * TRUST (CAT-INV-028 as clarified 2026-10-15): the outputs these frozen
 * engines return in-process are trusted to satisfy their owners' contracts; C9
 * never re-verifies them against their own fingerprints.
 *
 * ADAPTER BOUNDARY (F004 architecture review 2, Outcome C): each raw result
 * is handed to its adapter (`plan-adapters.ts`) where it is obtained, and only
 * the admitted C9 DTOs leave this module. C8's echoed viewpoint is admitted
 * before it drives any other call; B1 equivalence compares admitted
 * fingerprints only. No raw C2 / C4 / C7 / C8 result is visible downstream.
 */

import { isOpaqueRef, rematerialiseAnimalLedger, type AnimalLedger } from "../animal-ledger";
import { compareStrings } from "../integrity";
import { evaluateHealthProgrammes } from "../programmes";
import { recommendCattle, type RecommendationTrustedInputs } from "../recommendations";
import { evaluateHerdObligations, toCanonicalPlainData, type ObligationImplementationRegistry } from "../regulatory";
import { resolveGroupScope } from "../weights";
import type { CattleHash } from "../integrity";
import { admitObligations, admitProgrammes, admitRecommendations, admitScope, admitViewpoint, equivalenceIssues, type C2Dto, type C4ScopeDto, type C7Dto, type C8Dto, type ViewpointDto } from "./plan-adapters";
import type { CattlePlanIssue } from "./plan-contracts";

interface CanonicalCattle {
  ledgers: unknown[];
  obligations: { catalogue: unknown; obligationIds: string[]; evidence: unknown[] } | null;
  health: unknown;
  programmes: Record<string, unknown> | null;
}

/** The delegated predecessor outputs, admitted: C9 DTOs only, never a raw predecessor result. */
export interface Delegated {
  viewpoint: ViewpointDto;
  /** C8, one entry per animal (sorted by animal id). */
  recommendations: C8Dto;
  /** C2 per-animal evaluations (sorted by animal id), or `null` when no C2 evidence was supplied. */
  obligations: C2Dto | null;
  /** C7, or `null` when no C7 evidence was supplied. */
  programmes: C7Dto | null;
  /** Sorted by group ref. */
  scopes: C4ScopeDto[];
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

/** Invokes C8, then C2 / C7 / C4 with the pinned call shapes at C8's admitted viewpoint; admits every result; checks B1. */
export function delegate(cattleRaw: unknown, groupRefs: readonly string[], hash: CattleHash, trusted: RecommendationTrustedInputs): { ok: true; delegated: Delegated } | { ok: false; issues: CattlePlanIssue[] } {
  const c8 = failClosed(() => recommendCattle(cattleRaw, hash, trusted));
  if (c8 === null) return { ok: false, issues: [issue("CATTLE_PLAN_RECOMMENDATION_REJECTED")] };
  if (!c8.ok) return { ok: false, issues: c8.issues.map((i) => issue("CATTLE_PLAN_RECOMMENDATION_REJECTED", `${i.code}:${i.ref ?? ""}`)) };
  // C8 accepted the request, so it is canonical and conforms to C8's field-presence policy.
  const cattle = cattleRaw as CanonicalCattle;
  // The viewpoint is admitted before any use: it drives every other call and the Plan completion cut-off.
  const viewpoint = admitViewpoint(c8.result);
  if (!viewpoint.ok) return viewpoint;
  const times = { effectiveAt: viewpoint.value.effectiveAt as string, knowledgeCutoff: viewpoint.value.knowledgeCutoff as string };

  let obligations: C2Dto | null = null;
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
    // The C2 result envelope (its own rejection / issue lists) is read fail-closed too.
    if (herd === null || failClosed(() => herd.ok && herd.herd.issues.length === 0 && herd.herd.catalogueIssues.length === 0) !== true) return { ok: false, issues: [issue("CATTLE_PLAN_OBLIGATION_DELEGATION_FAILED")] };
    const admitted = admitObligations(herd.ok ? herd.herd : null);
    if (!admitted.ok) return admitted;
    obligations = admitted.value;
  }

  let programmes: C7Dto | null = null;
  if (cattle.programmes !== null) {
    const request = { ...cattle.programmes, ledgers: cattle.ledgers, health: cattle.health, obligations: cattle.obligations, query: times };
    const result = failClosed(() => evaluateHealthProgrammes(request, hash, { obligationImplementations: trusted.obligationImplementations }));
    if (result === null || failClosed(() => result.ok) !== true) return { ok: false, issues: [issue("CATTLE_PLAN_PROGRAMME_DELEGATION_FAILED")] };
    const admitted = admitProgrammes(result.ok ? result.evaluation : null);
    if (!admitted.ok) return admitted;
    programmes = admitted.value;
  }

  const recommendations = admitRecommendations(c8.result);
  if (!recommendations.ok) return recommendations;

  // B1 structural equivalence over admitted fingerprints: C9's own C2 / C7 outputs are exactly the ones C8 sealed.
  const mismatches = equivalenceIssues(obligations, programmes, recommendations.value);
  if (mismatches.length > 0) return { ok: false, issues: mismatches };

  const scopes: C4ScopeDto[] = [];
  for (const groupRef of groupRefs) {
    const r = failClosed(() => resolveGroupScope({ scope: { kind: "GROUP", groupRef, ledgers: cattle.ledgers as AnimalLedger[] }, query: times }, hash));
    if (r === null || failClosed(() => r.ok) !== true) return { ok: false, issues: [issue("CATTLE_PLAN_GROUP_SCOPE_REJECTED", groupRef)] };
    const admitted = admitScope(groupRef, r.ok ? r.scope : null);
    if (!admitted.ok) return admitted;
    scopes.push(admitted.value);
  }
  return { ok: true, delegated: { viewpoint: viewpoint.value, recommendations: recommendations.value, obligations, programmes, scopes } };
}
