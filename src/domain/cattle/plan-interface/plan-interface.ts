/**
 * Cattle C9 — the Plan interface entry point.
 *
 * `planCattleWork(request, hash, trusted)` translates the cattle outputs of
 * ONE canonical `CattlePlanRequest` into the existing Plan kernel inputs
 * (C8P1-frozen types only): job proposals (`PlanJobInput`), shared
 * `PlanBlocker`s, `ScopeReality` and `CanonicalEvidence`, every one projected
 * from the canonical C9 objects (work items → proposal groups) and citing
 * the cattle output ids and fingerprints it came from.
 *
 * request → canonical boundary + field policy (`readCattlePlanRequest`)
 *   → delegation to the frozen C8 / C2 / C7 / C4 engines at one viewpoint,
 *     with the B1 structural-equivalence check (`plan-delegation.ts`)
 *   → canonical work items + D2 folding (`plan-work-items.ts`)
 *   → proposal groups by `planJobIdentityKey` (`plan-merge.ts`)
 *   → Plan projections, completion evidence and scope reality.
 *
 * Any issue fails the whole request closed (no proposals). Pure: no clock,
 * persistence, network or model call; no Plan kernel change. The result is
 * detached and deep-frozen. C9 persists nothing, and no C9 function turns a
 * stored C9 object or C8 pack into authoritative Plan work: proposals exist
 * only as the output of a fresh delegated evaluation (CAT-INV-028 unchanged).
 */

import { deepFreezeAnimalValue } from "../animal-ledger";
import { compareStrings, type CattleHash } from "../integrity";
import type { RecommendationTrustedInputs } from "../recommendations";
import type { CattlePlanIssue, CattlePlanOutcome, CattlePlanResult } from "./plan-contracts";
import { delegate, readCattlePlanRequest } from "./plan-delegation";
import { buildCanonicalEvidence, buildScopeReality } from "./plan-evidence";
import { CATTLE_PLAN_PAYLOAD_VERSION, computeCattlePlanFingerprint } from "./plan-integrity";
import { groupWorkItems, projectBlockers, projectProposal } from "./plan-merge";
import { buildWorkItems } from "./plan-work-items";

const fail = (issues: CattlePlanIssue[]): CattlePlanOutcome => deepFreezeAnimalValue({ ok: false, issues: structuredClone(issues) });

export function planCattleWork(request: unknown, hash: CattleHash, trusted: RecommendationTrustedInputs = {}): CattlePlanOutcome {
  const read = readCattlePlanRequest(request);
  if (!read.ok) return fail(read.issues);
  const delegated = delegate(read.cattle, read.groupRefs, hash, trusted);
  if (!delegated.ok) return fail(delegated.issues);
  const d = delegated.delegated;

  const built = buildWorkItems(d.obligations, d.programmes, d.recommendation.animals);
  if (built.issues.length > 0) return fail(built.issues);
  const grouped = groupWorkItems(built.items);
  if (!grouped.ok) return fail(grouped.issues);
  const evidence = buildCanonicalEvidence(d.obligations, d.programmes, d.recommendation.animals);
  if (!evidence.ok) return fail(evidence.issues);
  const scopes = buildScopeReality(d.scopes);
  if (!scopes.ok) return fail(scopes.issues);

  const proposals = [];
  for (const g of grouped.groups) {
    const p = projectProposal(g, d.effectiveAt);
    if (p === null) return fail([{ code: "CATTLE_PLAN_TIMING_INVALID", ref: g.identityKey }]);
    proposals.push(p);
  }
  proposals.sort((a, b) => compareStrings(a.id, b.id));

  const body: Omit<CattlePlanResult, "fingerprint"> = {
    cattlePlanPayloadVersion: CATTLE_PLAN_PAYLOAD_VERSION,
    effectiveAt: d.effectiveAt,
    knowledgeCutoff: d.knowledgeCutoff,
    workItems: built.items,
    groups: grouped.groups,
    proposals,
    blockers: projectBlockers(grouped.groups),
    scopes: scopes.canonical,
    scopeReality: scopes.reality,
    evidence: evidence.evidence,
    withoutProposal: built.withoutProposal,
  };
  // The fingerprint binds the canonical objects, not the lossy Plan projections derived from them.
  const fingerprint = computeCattlePlanFingerprint(
    "CATTLE_PLAN_INTERFACE_RESULT",
    { effectiveAt: body.effectiveAt, knowledgeCutoff: body.knowledgeCutoff, workItems: body.workItems, groups: body.groups, scopes: body.scopes, evidence: body.evidence, withoutProposal: body.withoutProposal },
    hash,
  );
  return deepFreezeAnimalValue({ ok: true, result: structuredClone({ ...body, fingerprint }) });
}
