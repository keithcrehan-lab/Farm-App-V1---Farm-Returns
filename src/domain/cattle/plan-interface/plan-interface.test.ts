/**
 * Cattle C9 — Plan interface. Synthetic data only (`SYNTH-*`). Every proposal
 * is driven through the REAL Plan kernel functions; the predecessor engines
 * run for real (delegation), except where a seam is deliberately faulted to
 * prove the B1 structural-equivalence check fails closed.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const faults = vi.hoisted(() => ({ c2: 0, c2Calls: 0, c7: 0, c7Calls: 0 }));
const zero = "0".repeat(64);

vi.mock("../regulatory", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../regulatory")>();
  return {
    ...mod,
    evaluateHerdObligations: (...args: Parameters<typeof mod.evaluateHerdObligations>) => {
      const r = mod.evaluateHerdObligations(...args);
      faults.c2Calls += 1;
      if (faults.c2 === 0 || faults.c2Calls !== faults.c2 || !r.ok) return r;
      const animals = r.herd.animals.map((a) => ({ ...a, results: a.results.map((x, i) => (i === 0 ? { ...x, fingerprint: { ...x.fingerprint, digest: zero } } : x)) }));
      return { ok: true, herd: { ...r.herd, animals } };
    },
  };
});
vi.mock("../programmes", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../programmes")>();
  return {
    ...mod,
    evaluateHealthProgrammes: (...args: Parameters<typeof mod.evaluateHealthProgrammes>) => {
      const r = mod.evaluateHealthProgrammes(...args);
      faults.c7Calls += 1;
      if (faults.c7 === 0 || faults.c7Calls !== faults.c7 || !r.ok) return r;
      const programmes = r.evaluation.programmes.map((p) => ({ ...p, animals: p.animals.map((a) => ({ ...a, fingerprint: { ...a.fingerprint, digest: zero } })) }));
      return { ok: true, evaluation: { ...r.evaluation, programmes } };
    },
  };
});

import {
  CONFORMS,
  allConform,
  checkDetachedResult,
  checkFingerprintStability,
  checkOrderIndependence,
  checkUnresolvedEvidenceNotMasked,
  conformanceSnapshot,
  equivalentInstantSpellings,
} from "@/tooling/cattle-conformance/cattle-conformance";
import {
  createPlanJob,
  evaluateCompletion,
  planJobIdentityKey,
  reevaluatePlanJob,
  resolveScope,
  type PlanBlocker,
  type PlanJobInput,
} from "../../plan";
import { EMPTY_GOAL_ROUTING_REGISTRY } from "../goals";
import * as cattle from "../index";
import type { RecommendationTrustedInputs } from "../recommendations";
import { evaluateHerdObligations } from "../regulatory";
import { compareInstants, rematerialiseAnimalLedger, type AnimalLedger } from "../animal-ledger";
import { sourceVersionRef } from "../source";
import { SCIENCE_SOURCE } from "../test-fixtures";
import type { CattlePlanOutcome, CattlePlanProposalGroup, CattlePlanResult, CattlePlanWorkItem } from "./plan-contracts";
import { planCattleWork } from "./plan-interface";
import { cattleGroupScope, groupWorkItems, mergeProposalGroups, projectProposal, summariseGroup } from "./plan-merge";
import { c2Timing, foldRestatements, parseRestatementCitation } from "./plan-work-items";
import { CATTLE_PLAN_VOCABULARY, planNotBeforeBound } from "./plan-vocabulary";
import {
  A,
  B,
  GROUP,
  OBL,
  OBL_FAIL,
  OBL_RULE,
  OTHER_GROUP,
  TRUSTED,
  action,
  defaultOnly,
  fulfilment,
  goalDecl,
  hash,
  ledgerOf,
  oblCatalogue,
  oblDefinition,
  obligations,
  planRequest,
  programmeCompletion,
  programmeDefinition,
  programmes,
  registry,
  weightObs,
  type Rec,
  type Run,
} from "./plan-test-fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const run = (o: Run = {}, trusted: RecommendationTrustedInputs = TRUSTED): CattlePlanOutcome => planCattleWork(planRequest(o), hash, trusted);
function ok(r: CattlePlanOutcome): CattlePlanResult {
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.result;
}
const codes = (r: CattlePlanOutcome) => (r.ok ? [] : r.issues.map((i) => i.code));
const itemsOf = (r: CattlePlanResult, family: CattlePlanWorkItem["family"]) => r.workItems.filter((i) => i.family === family);
const proposalOf = (r: CattlePlanResult, actionKeyPrefix: string) => r.proposals.filter((p) => p.actionKey.startsWith(actionKeyPrefix));
const blockerMap = (r: CattlePlanResult): Record<string, PlanBlocker> => Object.fromEntries(r.blockers.map((b) => [b.id, b]));

/** createPlanJob + reevaluatePlanJob for every proposal, against the result's own (or a later) reality. */
function roundTrip(r: CattlePlanResult, nowIso: string, later: CattlePlanResult = r) {
  return r.proposals.map((p) => {
    const created = createPlanJob(p, nowIso);
    const evaluation = reevaluatePlanJob(created.job, { nowIso, scopeReality: later.scopeReality, evidence: later.evidence, jobStatuses: {}, blockers: { ...blockerMap(r), ...blockerMap(later) } });
    return { proposal: p, created, evaluation };
  });
}

const OVERDUE_RUN: Run = { obligations: obligations(), effectiveAt: "2026-04-15T00:00:00Z", knowledgeCutoff: "2026-04-16T00:00:00Z" };
const OUTSTANDING_RUN: Run = { obligations: obligations(), actions: defaultOnly("RESOLVE_OBLIGATION_EVIDENCE") };

// ---------------------------------------------------------------------------
// 3 — consumed C8 action kinds through real runs (the tables themselves: `plan-tables.test.ts`)
// ---------------------------------------------------------------------------

describe("C9 action kinds — real runs (B3, D4)", () => {
  it("3. an unmapped kind fails closed; a modelled kind maps by its tier only", () => {
    const unmappedNone = run({ actions: registry([action("SYNTH-GAP", { benefitClaim: "NONE", tier: "VALUE_OF_INFORMATION" })]) });
    expect(codes(unmappedNone)).toEqual(["CATTLE_PLAN_ACTION_KIND_UNMAPPED"]);
    const safety = run({ actions: registry([action("SYNTH-SELL", { tier: "SAFETY_LEGAL_WELFARE" })]) });
    expect(codes(safety)).toEqual(["CATTLE_PLAN_ACTION_KIND_UNMAPPED"]);
    const modelled = ok(run({ actions: registry([action("SYNTH-SELL")]) }));
    const [p] = proposalOf(modelled, "CATTLE_RECOMMENDATION:SYNTH-SELL");
    expect(p.systemPriority.tier).toBe("EXPECTED_NET_RETURN");
    expect(p.creationSource).toEqual({ kind: "FARM_RETURN", reason: "RECOMMENDATION" });
  });
});

// ---------------------------------------------------------------------------
// Required 1 / 2 / 14 — each source maps to a valid Plan job; real Plan round trips
// ---------------------------------------------------------------------------

describe("C9 — proposals round-trip through the real Plan kernel", () => {
  it("C2 obligation, C7 occurrence and C8 recommendation each give a PlanJobInput createPlanJob accepts unchanged", () => {
    const r = ok(run({ ...OVERDUE_RUN, programmes: programmes(), actions: registry([action("SYNTH-SELL")]) }));
    const families = new Set(r.groups.map((g) => g.items[0].family));
    expect([...families].sort()).toEqual(["C2_OBLIGATION", "C7_PROGRAMME", "C8_RECOMMENDATION"]);
    for (const { proposal, created, evaluation } of roundTrip(r, "2026-04-15T00:00:00Z")) {
      expect(created.job.actionKey).toBe(proposal.actionKey);
      expect(created.job.creationSource).toEqual(proposal.creationSource);
      expect(created.job.scopeMembers).toEqual([{ type: "CATTLE_ANIMAL", id: A }]);
      expect(created.events[0]).toMatchObject({ type: "JOB_CREATED", source: proposal.creationSource });
      expect(proposal.route).toEqual({ kind: "NONE", reason: "MANUAL_TASK" });
      expect(proposal.creationSource.kind).not.toBe("ADVISER_APPROVED");
      // Identity is the Plan kernel's own, and the job id is derived from it.
      expect(proposal.id).toBe(`CATTLE_PLAN_JOB:${planJobIdentityKey(created.job)}`);
      expect(resolveScope(created.job.scope, created.job.scopeMembers, [], r.scopeReality).status).toBe("KNOWN");
      expect(evaluation.completion.state).not.toBe("COMPLETE");
      expect(evaluation.job.status).toBe("PROPOSED");
    }
  });

  it("2. creation source per B3: OBLIGATION / PROGRAMME / DATA_GAP / RECOMMENDATION, never a new variant", () => {
    const r = ok(run({ ...OVERDUE_RUN, programmes: programmes({ definition: programmeDefinition({ animalIds: [B] }) }), ledgers: [ledgerOf(A), ledgerOf(B)], actions: defaultOnly("RECORD_WEIGHT"), weights: { observations: [] } }));
    const reasons = new Map(r.proposals.map((p) => [p.actionKey.split(":")[0], p.creationSource]));
    expect(reasons.get("CATTLE_OBLIGATION")).toEqual({ kind: "FARM_RETURN", reason: "OBLIGATION" });
    expect(reasons.get("CATTLE_PROGRAMME")).toEqual({ kind: "FARM_RETURN", reason: "PROGRAMME" });
    expect(reasons.get("CATTLE_RECOMMENDATION")).toEqual({ kind: "FARM_RETURN", reason: "DATA_GAP" });
  });

  it("readiness through the real kernel: UPCOMING window, UNKNOWN blocker waits, passed hard deadline needs attention", () => {
    const r = ok(run({ ...OVERDUE_RUN, obligations: obligations({ ids: [OBL, "SYNTH-NOT-CATALOGUED"] }), programmes: programmes() }));
    const at = "2026-04-15T00:00:00Z";
    const byKey = new Map(roundTrip(r, at).map((x) => [x.proposal.id, x.evaluation.readiness]));
    const upcoming = r.proposals.find((p) => p.timing.recommendedWindow?.startIso?.startsWith("2026-05-10"))!;
    expect(byKey.get(upcoming.id)?.state).toBe("UPCOMING");
    const unknown = proposalOf(r, "CATTLE_OBLIGATION:SYNTH-NOT-CATALOGUED")[0];
    expect(byKey.get(unknown.id)?.state).toBe("WAITING_FOR_BLOCKER");
    const hard = proposalOf(r, `CATTLE_OBLIGATION:${OBL}`)[0];
    expect(byKey.get(hard.id)?.reasons).toContainEqual({ kind: "HARD_DEADLINE_PASSED", dueIso: hard.timing.hardDeadline!.dueIso });
    // Plan parses the canonical cattle spellings (values pass through unchanged).
    for (const p of r.proposals) for (const t of [p.timing.recommendedWindow?.startIso, p.timing.recommendedWindow?.endIso, p.timing.hardDeadline?.dueIso]) if (t) expect(Number.isFinite(Date.parse(t))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Required 3 — timing (B5 / D1)
// ---------------------------------------------------------------------------

describe("C9 timing — hard deadline vs recommended window (B5, D1)", () => {
  it("D1: a single CURRENT source binding ⇒ VERSIONED_SOURCE equal to that reference, plus the recommended window", () => {
    const r = ok(run(OVERDUE_RUN));
    const [item] = itemsOf(r, "C2_OBLIGATION");
    const [p] = proposalOf(r, `CATTLE_OBLIGATION:${OBL}`);
    const bound = item.timing.sourceChecks[0].bound;
    expect(item.timing.sourceChecks).toHaveLength(1);
    expect(p.timing.hardDeadline).toEqual({ kind: "HARD_DEADLINE", dueIso: item.timing.window!.dueAt, authority: { kind: "VERSIONED_SOURCE", sourceId: bound.sourceId, version: bound.version, contentFingerprint: bound.contentFingerprint } });
    expect(p.timing.recommendedWindow).toMatchObject({ kind: "RECOMMENDED_WINDOW", startIso: item.timing.window!.opensAt, endIso: item.timing.window!.dueAt });
    expect(p.systemPriority.tier).toBe("HARD_OBLIGATION");
  });

  it("D1: two bindings ⇒ no hard deadline, a recommended window and an UNKNOWN DEADLINE_AUTHORITY_NOT_UNIQUELY_ESTABLISHED blocker", () => {
    const r = ok(run({ ...OVERDUE_RUN, obligations: obligations({ catalogue: oblCatalogue({ extraSource: true }) }) }));
    const [item] = itemsOf(r, "C2_OBLIGATION");
    const [p] = proposalOf(r, `CATTLE_OBLIGATION:${OBL}`);
    expect(item.timing.sourceChecks).toHaveLength(2);
    expect(p.timing.hardDeadline).toBeNull();
    expect(p.timing.recommendedWindow?.basis).toContain("DEADLINE_AUTHORITY_NOT_UNIQUELY_ESTABLISHED");
    const blocker = r.blockers.find((b) => p.dependencies.blockerIds.includes(b.id) && b.id.includes("DEADLINE_AUTHORITY_NOT_UNIQUELY_ESTABLISHED"));
    expect(blocker).toMatchObject({ kind: "OTHER", status: "UNKNOWN" });
  });

  it("D1: a single non-CURRENT binding ⇒ no hard deadline (mapping over a real record's source check)", () => {
    const r = ok(run(OVERDUE_RUN));
    const record = rawC2Records(OVERDUE_RUN)[0];
    const changed = { ...record, ruleEvaluation: { ...record.ruleEvaluation, sourceChecks: [{ ...record.ruleEvaluation.sourceChecks[0], status: "SOURCE_CONTENT_CHANGED" as const }] } };
    expect(c2Timing(record).timing.hardDeadline).not.toBeNull();
    const t = c2Timing(changed);
    expect(t.authorityProven).toBe(false);
    expect(t.timing.hardDeadline).toBeNull();
    expect(t.timing.window).toEqual(itemsOf(r, "C2_OBLIGATION")[0].timing.window);
    // Not legal / scheme hard-gate ⇒ recommended window only, authority not required.
    const advisory = c2Timing({ ...record, classification: "SCIENCE_CONSTRAINT", gateRole: "ADVISORY" });
    expect(advisory).toMatchObject({ authorityProven: true, timing: { hardDeadline: null } });
    expect(advisory.timing.windowBasis).toContain("CATTLE_OBLIGATION_WINDOW_RECOMMENDED");
  });

  it("D1 guarantee pinned: a C2 definition whose window source is not a rule binding is rule-level UNSUPPORTED with no window", () => {
    const def = { ...oblDefinition(), terms: { ...oblDefinition().terms, windowSource: sourceVersionRef(SCIENCE_SOURCE) } };
    const catalogue = { ...oblCatalogue(), definitions: [def] };
    const r = ok(run({ ...OVERDUE_RUN, obligations: obligations({ catalogue }) }));
    const [item] = itemsOf(r, "C2_OBLIGATION");
    expect(item.consumedState).toBe("UNSUPPORTED");
    expect(item.reasonCodes).toContain("CATTLE_OBLIGATION_WINDOW_SOURCE_NOT_BOUND");
    expect(item.timing).toEqual({ window: null, windowBasis: null, hardDeadline: null, sourceChecks: [] });
  });

  it("unknown window ⇒ no date; C7 windows are recommended only; C8 carries no timing", () => {
    const r = ok(run({ ...OVERDUE_RUN, obligations: obligations({ ids: ["SYNTH-NOT-CATALOGUED"] }), programmes: programmes(), actions: registry([action("SYNTH-SELL")]) }));
    for (const p of proposalOf(r, "CATTLE_OBLIGATION:")) expect(p.timing).toEqual({ recommendedWindow: null, hardDeadline: null });
    for (const p of proposalOf(r, "CATTLE_PROGRAMME:")) expect(p.timing.hardDeadline).toBeNull();
    for (const p of proposalOf(r, "CATTLE_PROGRAMME:")) expect(p.timing.recommendedWindow).not.toBeNull();
    for (const p of proposalOf(r, "CATTLE_RECOMMENDATION:")) expect(p.timing).toEqual({ recommendedWindow: null, hardDeadline: null });
    expect(r.effectiveAt).toBe("2026-04-15T00:00:00.000000000Z");
  });
});

/** The real C2 records C9 consumes for a run (the same frozen engine call shape). */
function rawC2Records(o: Run) {
  const req = planRequest(o) as { cattle: { ledgers: unknown[]; query: { effectiveAt: string; knowledgeCutoff: string } } };
  const ledgers: AnimalLedger[] = req.cattle.ledgers.map((l) => {
    const rebuilt = rematerialiseAnimalLedger(l);
    if (!rebuilt.ok) throw new Error("ledger");
    return rebuilt.ledger;
  });
  const ob = obligations();
  const herd = evaluateHerdObligations(
    { ledgers, evidence: ob.evidence, catalogue: ob.catalogue as never, implementations: TRUSTED.obligationImplementations, query: { ...req.cattle.query, obligationIds: ob.obligationIds } },
    hash,
  );
  if (!herd.ok) throw new Error("herd");
  return herd.herd.animals[0].results;
}

// ---------------------------------------------------------------------------
// Required 4 — BLOCKED / UNKNOWN become blockers, never dropped
// ---------------------------------------------------------------------------

describe("C9 blockers — BLOCKED and UNKNOWN are never dropped (B6, D3)", () => {
  it("C2 hard-gate FAIL (BLOCKED) ⇒ proposal with an ACTIVE blocker; readiness waits", () => {
    const r = ok(run({ ...OVERDUE_RUN, obligations: obligations({ catalogue: oblCatalogue({ implementation: OBL_FAIL }) }) }));
    const [item] = itemsOf(r, "C2_OBLIGATION");
    expect(item.consumedState).toBe("BLOCKED");
    expect(item.priority.tier).toBe("HARD_OBLIGATION");
    expect(item.blockers.map((b) => b.status)).toEqual(["ACTIVE"]);
    const [x] = roundTrip(r, "2026-04-15T00:00:00Z").filter((t) => t.proposal.actionKey.startsWith("CATTLE_OBLIGATION:"));
    expect(x.evaluation.readiness.state).toBe("WAITING_FOR_BLOCKER");
  });

  it("C2 unresolved (UNSUPPORTED) ⇒ evidence-resolution work: INFORMATION_VALUE, UNKNOWN blocker, the obligation kept in provenance", () => {
    const r = ok(run({ ...OVERDUE_RUN, obligations: obligations({ ids: ["SYNTH-NOT-CATALOGUED"] }) }));
    const [item] = itemsOf(r, "C2_OBLIGATION");
    expect(item.priority).toEqual({ tier: "INFORMATION_VALUE", basis: "CATTLE_PLAN_PRIORITY_C2_EVIDENCE_RESOLUTION:NONE:NONE:UNSUPPORTED" });
    expect(item.blockers.map((b) => [b.status, b.gateState])).toEqual([["UNKNOWN", "UNSUPPORTED"]]);
  });

  it("C7 BLOCKED (failing C2 gate) ⇒ ACTIVE state blocker plus the gate's own blocker; C8 BLOCKED via a prerequisite gate ⇒ ACTIVE C8 gate blocker", () => {
    const r = ok(
      run({
        ...OVERDUE_RUN,
        programmes: programmes({ definition: programmeDefinition({ gates: [OBL_RULE] }) }),
        actions: registry([action("SYNTH-SELL", { prerequisites: { sources: ["C2_OBLIGATION"], gateRuleIds: [] } })]),
      }),
    );
    const blockedC7 = itemsOf(r, "C7_PROGRAMME").filter((i) => i.consumedState === "BLOCKED");
    expect(blockedC7.length).toBeGreaterThan(0);
    for (const i of blockedC7) {
      expect(i.blockers.some((b) => b.identity[0] === "C7_PROGRAMME" && b.status === "ACTIVE")).toBe(true);
      expect(i.blockers.some((b) => b.identity[0] === "C7_GATE:C2_OBLIGATION" && b.status === "ACTIVE" && b.gateState === "FAIL")).toBe(true);
    }
    const [sell] = itemsOf(r, "C8_RECOMMENDATION");
    expect(sell.consumedState).toBe("BLOCKED");
    expect(sell.blockers.find((b) => b.identity[0] === "C8_GATE:C2_OBLIGATION")).toMatchObject({ status: "ACTIVE", kind: "OTHER" });
    for (const p of r.proposals) for (const id of p.dependencies.blockerIds) expect(blockerMap(r)[id]).toBeDefined();
  });

  it("C8 INSUFFICIENT_EVIDENCE with a concrete action ⇒ proposal with UNKNOWN blockers; NO_RECOMMENDATION ⇒ nothing invented (recorded)", () => {
    const insufficient = ok(run({ actions: defaultOnly("RECORD_WEIGHT") }));
    const [item] = itemsOf(insufficient, "C8_RECOMMENDATION");
    expect(item.consumedState).toBe("INSUFFICIENT_EVIDENCE");
    expect(item.blockers.length).toBeGreaterThan(0);
    expect(item.blockers.every((b) => b.status === "UNKNOWN")).toBe(true);
    const none = ok(run({ actions: registry([]) }));
    expect(none.proposals).toEqual([]);
    expect(none.withoutProposal).toEqual([expect.objectContaining({ family: "C8_RECOMMENDATION", consumedState: "NO_RECOMMENDATION", reason: "CATTLE_PLAN_NO_PROPOSAL:C8_NO_RECOMMENDATION" })]);
  });

  it("C3 withdrawal gates are LEGAL_WINDOW blockers (D3)", () => {
    const r = ok(
      run({
        health: { foodProducts: ["SYNTH-FOOD"], productRecords: [], animals: [] },
        actions: registry([action("SYNTH-SELL", { prerequisites: { sources: ["C3_WITHDRAWAL"], gateRuleIds: [] } })]),
      }),
    );
    const c3 = itemsOf(r, "C8_RECOMMENDATION")[0].blockers.filter((b) => b.identity[0].endsWith(":C3_WITHDRAWAL"));
    for (const b of c3) expect(b.kind).toBe("LEGAL_WINDOW");
    const generated = itemsOf(r, "C8_RECOMMENDATION")[0].blockers.filter((b) => !b.identity[0].endsWith(":C3_WITHDRAWAL"));
    for (const b of generated) expect(b.kind).toBe("OTHER");
  });

  it("CAT-INV-009: unresolved required evidence never surfaces as READY / COMPLETE", () => {
    const cases = [
      { label: "C2 obligation not in catalogue", run: { ...OVERDUE_RUN, obligations: obligations({ ids: ["SYNTH-NOT-CATALOGUED"] }), actions: registry([]) } },
      { label: "C8 weights not supplied", run: { actions: defaultOnly("RECORD_WEIGHT") } },
      { label: "C2 competing fulfilment corrections", run: { ...OVERDUE_RUN, obligations: obligations({ evidence: conflictingFulfilments() }), actions: registry([]) } },
    ];
    const verdict = checkUnresolvedEvidenceNotMasked(
      cases.map((c) => ({ label: c.label, result: ok(run(c.run)) })),
      (r) => roundTrip(r, r.effectiveAt).flatMap((x) => [x.evaluation.readiness.state, x.evaluation.completion.state]),
      ["READY", "COMPLETE"],
    );
    expect(verdict).toEqual(CONFORMS);
    // Positive control: a resolved, gate-clear modelled action is READY.
    const positive = ok(run({ actions: registry([action("SYNTH-SELL")]) }));
    expect(roundTrip(positive, positive.effectiveAt)[0].evaluation.readiness.state).toBe("READY");
  });
});

function conflictingFulfilments(): Rec[] {
  return [
    fulfilment({ evidenceId: "SYNTH-E1", fulfilledAt: "2026-03-05T00:00:00Z", receivedAt: "2026-03-06T00:00:00Z" }),
    fulfilment({ evidenceId: "SYNTH-E2", fulfilledAt: "2026-03-06T00:00:00Z", receivedAt: "2026-03-07T00:00:00Z", supersedes: ["SYNTH-E1"] }),
    fulfilment({ evidenceId: "SYNTH-E3", fulfilledAt: "2026-03-07T00:00:00Z", receivedAt: "2026-03-08T00:00:00Z", supersedes: ["SYNTH-E1"] }),
  ];
}

// ---------------------------------------------------------------------------
// 6 — B1 structural equivalence
// ---------------------------------------------------------------------------

describe("C9 delegation — B1 structural equivalence with C8's sealed context", () => {
  it("positive control: C9's C2 / C7 fingerprints equal C8's; a faulted C9-side C2 or C7 output fails closed with no proposals", () => {
    expect(run({ ...OVERDUE_RUN, programmes: programmes() }).ok).toBe(true);
    try {
      Object.assign(faults, { c2: 2, c2Calls: 0 });
      const r = run(OVERDUE_RUN);
      expect(r.ok).toBe(false);
      expect(codes(r)).toEqual(["CATTLE_PLAN_DELEGATION_EQUIVALENCE_MISMATCH"]);
      Object.assign(faults, { c2: 0, c7: 2, c7Calls: 0 });
      const p = run({ programmes: programmes(), effectiveAt: "2026-04-15T00:00:00Z", knowledgeCutoff: "2026-04-16T00:00:00Z" });
      expect(codes(p)).toEqual(["CATTLE_PLAN_DELEGATION_EQUIVALENCE_MISMATCH"]);
    } finally {
      Object.assign(faults, { c2: 0, c7: 0 });
    }
  });

  it("C9 never accepts caller-supplied predecessor outputs: the request is exactly { cattle, groupScopes }", () => {
    expect(codes(planCattleWork({ ...planRequest(), c8: { animals: [] } }, hash, TRUSTED))).toEqual(["CATTLE_PLAN_INVALID_REQUEST"]);
    expect(codes(planCattleWork({ cattle: planRequest().cattle }, hash, TRUSTED))).toEqual(["CATTLE_PLAN_INVALID_REQUEST"]);
    expect(codes(planCattleWork({ ...planRequest(), groupScopes: [{ groupRef: GROUP, ledgers: [] }] }, hash, TRUSTED))).toEqual(["CATTLE_PLAN_INVALID_GROUP_SCOPE"]);
    expect(codes(planCattleWork({ ...planRequest(), groupScopes: [{ groupRef: " " }] }, hash, TRUSTED))).toEqual(["CATTLE_PLAN_INVALID_GROUP_SCOPE"]);
    // C8 rejects malformed cattle input and a missing trusted registry; C9 passes the rejection through.
    expect(codes(run({ ...OVERDUE_RUN }, {}))).toEqual(["CATTLE_PLAN_RECOMMENDATION_REJECTED"]);
    expect(codes(planCattleWork({ cattle: { query: null }, groupScopes: [] }, hash, TRUSTED))).toEqual(["CATTLE_PLAN_RECOMMENDATION_REJECTED"]);
  });
});

// ---------------------------------------------------------------------------
// 7 / 8 — D2 restatement folding
// ---------------------------------------------------------------------------

describe("C9 folding — C8 restatements of C2 / C7 work (D2)", () => {
  it("7. grammar round trip against real C8 output: RESOLVE_OBLIGATION_EVIDENCE folds into the cited C2 work (no separate job)", () => {
    const r = ok(run(OUTSTANDING_RUN));
    expect(itemsOf(r, "C8_RECOMMENDATION")).toEqual([]);
    const [c2] = itemsOf(r, "C2_OBLIGATION");
    expect(c2.consumedState).toBe("OUTSTANDING");
    expect(c2.supporting).toHaveLength(1);
    const [code] = c2.supporting[0].reasonCodes;
    expect(parseRestatementCitation(code)).toEqual({ family: "C2_OBLIGATION", state: "OUTSTANDING", cites: c2.cites });
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0].supportingReasons).toHaveLength(2);
    // Folding keeps the authoritative origin (the restatement is provenance, not a second origin).
    expect(r.proposals[0].creationSource).toEqual({ kind: "FARM_RETURN", reason: "OBLIGATION" });
  });

  it("7b. COMPLETE_PROGRAMME_ACTION citing several C7 occurrences adds provenance to each; Plan identity alone decides merging", () => {
    const r = ok(run({ programmes: programmes(), effectiveAt: "2026-04-15T00:00:00Z", knowledgeCutoff: "2026-04-16T00:00:00Z" }));
    const supported = itemsOf(r, "C7_PROGRAMME").filter((i) => i.supporting.length > 0);
    expect(supported.map((i) => i.consumedState).sort()).toEqual(["DUE", "OVERDUE"]);
    for (const i of supported) for (const c of i.supporting[0].reasonCodes) expect(parseRestatementCitation(c)).not.toBeNull();
    expect(new Set(supported.map((i) => i.supporting[0].outputId)).size).toBe(1);
    expect(itemsOf(r, "C8_RECOMMENDATION")).toEqual([]);
    expect(proposalOf(r, "CATTLE_PROGRAMME:")).toHaveLength(3);
  });

  it("grammar is strict: anything that does not re-serialise exactly is not a citation", () => {
    const good = `CATTLE_RECOMMENDATION_TRIGGER_OBLIGATION_OVERDUE:${JSON.stringify(["o", "x"])}`;
    expect(parseRestatementCitation(good)).not.toBeNull();
    for (const bad of [
      `CATTLE_RECOMMENDATION_TRIGGER_OBLIGATION_SOMETHING:${JSON.stringify(["o", "x"])}`,
      `CATTLE_RECOMMENDATION_TRIGGER_OBLIGATION_OVERDUE:[ "o","x"]`,
      `CATTLE_RECOMMENDATION_TRIGGER_OBLIGATION_OVERDUE:${JSON.stringify(["o"])}`,
      `CATTLE_RECOMMENDATION_TRIGGER_OBLIGATION_OVERDUE:${JSON.stringify([1, "x"])}`,
      `CATTLE_RECOMMENDATION_TRIGGER_PROGRAMME_DUE:${JSON.stringify(["p", null, "x"])}`,
      "CATTLE_RECOMMENDATION_TRIGGER_UNRESOLVED:OBLIGATION_UNKNOWN",
      "CATTLE_RECOMMENDATION_TRIGGER_OBLIGATION_OVERDUE:not json",
    ])
      expect(parseRestatementCitation(bad), bad).toBeNull();
  });

  it("8. whitelist / animal / cited item / state: any failing condition keeps a separate proposal", () => {
    const base = ok(run(OUTSTANDING_RUN));
    const c2 = base.workItems[0];
    const folded = c2.supporting[0];
    const c8: CattlePlanWorkItem = {
      ...c2,
      key: JSON.stringify(["C8_RECOMMENDATION", folded.outputId]),
      family: "C8_RECOMMENDATION",
      origin: "DATA_GAP",
      outputId: folded.outputId,
      outputFingerprint: folded.outputFingerprint,
      cites: null,
      consumedState: "ACTIONABLE",
      reasonCodes: folded.reasonCodes,
      vocabularyRow: "C8_RESOLVE_OBLIGATION_EVIDENCE",
      actionKey: "CATTLE_RECOMMENDATION:RESOLVE_OBLIGATION_EVIDENCE",
      timing: { window: null, windowBasis: null, hardDeadline: null, sourceChecks: [] },
      blockers: [],
      priority: { tier: "INFORMATION_VALUE", basis: "x" },
      supporting: [],
    };
    const target = { ...c2, supporting: [] };
    const foldsInto = (items: CattlePlanWorkItem[]) => foldRestatements(items).some((i) => i.family === "C8_RECOMMENDATION");
    expect(foldsInto([target, c8])).toBe(false); // positive control: folds
    expect(foldsInto([target, { ...c8, actionKey: "CATTLE_RECOMMENDATION:RECORD_WEIGHT" }])).toBe(true); // not whitelisted
    expect(foldsInto([target, { ...c8, actionKey: "CATTLE_RECOMMENDATION:COMPLETE_PROGRAMME_ACTION" }])).toBe(true); // wrong family
    expect(foldsInto([{ ...target, animalId: B }, c8])).toBe(true); // wrong animal
    expect(foldsInto([c8])).toBe(true); // cited item missing
    expect(foldsInto([{ ...target, consumedState: "OVERDUE" }, c8])).toBe(true); // state differs
    expect(foldsInto([target, { ...c8, reasonCodes: [...c8.reasonCodes, "CATTLE_RECOMMENDATION_TRIGGER_UNRESOLVED:OBLIGATION_UNKNOWN"] }])).toBe(true); // one unparsed code
    expect(foldsInto([target, { ...c8, reasonCodes: [] }])).toBe(true);
    // Input order never changes the fold.
    expect(conformanceSnapshot(foldRestatements([c8, target]))).toBe(conformanceSnapshot(foldRestatements([target, c8])));
  });

  it("a folded restatement's blockers move to the cited work, never dropped", () => {
    const base = ok(run(OUTSTANDING_RUN));
    const c2 = { ...base.workItems[0], supporting: [] };
    const s = base.workItems[0].supporting[0];
    const c8: CattlePlanWorkItem = {
      ...c2,
      key: JSON.stringify(["C8_RECOMMENDATION", s.outputId]),
      family: "C8_RECOMMENDATION",
      outputId: s.outputId,
      outputFingerprint: s.outputFingerprint,
      cites: null,
      consumedState: "BLOCKED",
      reasonCodes: s.reasonCodes,
      vocabularyRow: "C8_RESOLVE_OBLIGATION_EVIDENCE",
      actionKey: "CATTLE_RECOMMENDATION:RESOLVE_OBLIGATION_EVIDENCE",
      blockers: [{ id: "CATTLE_PLAN_BLOCKER:SYNTH", identity: ["C8_GATE:C2_OBLIGATION", s.outputId, s.outputFingerprint.digest, "SYNTH-RULE", "CATTLE_ANIMAL", A, null], kind: "OTHER", status: "ACTIVE", gateState: "FAIL", description: "synthetic" }],
      supporting: [],
    };
    const [only] = foldRestatements([c2, c8]);
    expect(only.blockers.map((b) => b.id)).toContain("CATTLE_PLAN_BLOCKER:SYNTH");
  });
});

// ---------------------------------------------------------------------------
// 9 — blocker identity and collision
// ---------------------------------------------------------------------------

describe("C9 blocker identity (D3)", () => {
  it("ids serialise the full gate-instance tuple, are unique per instance and shared by every job they affect", () => {
    const r = ok(run({ ...OVERDUE_RUN, programmes: programmes({ definition: programmeDefinition({ gates: [OBL_RULE] }) }) }));
    for (const b of r.workItems.flatMap((i) => i.blockers)) {
      expect(b.id).toBe(`CATTLE_PLAN_BLOCKER:${JSON.stringify(b.identity)}`);
      expect(b.identity).toHaveLength(7);
      expect(b.identity[4]).toBe("CATTLE_ANIMAL");
    }
    const gateIds = itemsOf(r, "C7_PROGRAMME").flatMap((i) => i.blockers.filter((b) => b.identity[0] === "C7_GATE:C2_OBLIGATION").map((b) => b.id));
    // The same C2 gate seen from two occurrences is two gate instances (never ruleId + source + animal alone).
    expect(new Set(gateIds).size).toBe(gateIds.length);
    expect(new Set(r.blockers.map((b) => b.id)).size).toBe(r.blockers.length);
  });

  it("collision: one id with different content fails closed; with equal content it is one shared blocker", () => {
    const r = ok(run({ ...OVERDUE_RUN, obligations: obligations({ catalogue: oblCatalogue({ implementation: OBL_FAIL }) }) }));
    const item = itemsOf(r, "C2_OBLIGATION")[0];
    const twin = { ...item, key: `${item.key}-twin`, outputId: `${item.outputId}-twin` };
    const shared = summariseGroup([item, twin]);
    expect(shared.ok && shared.group.blockerIds).toEqual(item.blockers.map((b) => b.id));
    const clash = { ...twin, blockers: item.blockers.map((b) => ({ ...b, status: "CLEARED" as const })) };
    expect(summariseGroup([item, clash])).toEqual({ ok: false, issues: [{ code: "CATTLE_PLAN_BLOCKER_IDENTITY_CONFLICT", ref: item.blockers[0].id }] });
    const other = { ...clash, actionKey: "CATTLE_OBLIGATION:SYNTH-OTHER", key: `${item.key}-other` };
    expect(groupWorkItems([item, other]).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10 — one vocabulary for jobs and evidence
// ---------------------------------------------------------------------------

describe("C9 vocabulary — one table drives the action projection and CanonicalEvidence", () => {
  it("every evidence-linked contract has its key in the evidence, and every evidence key belongs to such a contract family", () => {
    const r = ok(
      run({ ...OVERDUE_RUN, programmes: programmes(), weights: { observations: [] }, goals: { declarations: [], routingRegistry: EMPTY_GOAL_ROUTING_REGISTRY }, actions: defaultOnly("RECORD_WEIGHT") }),
    );
    for (const p of r.proposals) {
      const c = p.completionContract;
      if (c.kind === "OPERATIONAL_RECORD") expect(r.evidence.records[c.recordKind], p.id).toBeDefined();
      if (c.kind === "DATA_COMPLETION") expect(r.evidence.dataPresence[c.requirementKey], p.id).toBeDefined();
    }
    for (const k of Object.keys(r.evidence.records)) expect(k).toMatch(/^(CATTLE_PLAN_COMPLETION:|CATTLE_WEIGHT_OBSERVATION:)/);
    expect(Object.keys(r.evidence.dataPresence)).toEqual(["CATTLE_PRODUCTION_GOAL_IN_FORCE"]);
    expect(r.evidence.decisions).toEqual({});
    for (const [id, row] of Object.entries(CATTLE_PLAN_VOCABULARY)) expect(row.completion === "MANUAL" ? row.provenBy.length === 0 : row.provenBy.length > 0, id).toBe(true);
  });

  it("window-less owner work and unproven C8 work are MANUAL (no other completion vocabulary)", () => {
    const r = ok(run({ ...OVERDUE_RUN, obligations: obligations({ ids: ["SYNTH-NOT-CATALOGUED"] }), actions: registry([action("SYNTH-SELL")]) }));
    for (const p of r.proposals) expect(p.completionContract).toEqual({ kind: "MANUAL" });
  });
});

// ---------------------------------------------------------------------------
// Required 7 — completion evidence drives Plan completion; unknown ⇒ unavailable
// ---------------------------------------------------------------------------

describe("C9 completion evidence — canonical cattle records complete Plan jobs", () => {
  const OUTSTANDING_AT = "2026-03-05T00:00:00Z";
  const later = (o: Run) => ({ ...OUTSTANDING_RUN, effectiveAt: "2026-03-08T00:00:00Z", knowledgeCutoff: "2026-03-09T00:00:00Z", ...o });

  it("C2: a fulfilment counted later completes the obligation job with no farmer checkbox", () => {
    const first = ok(run(OUTSTANDING_RUN));
    const then = ok(run(later({ obligations: obligations({ evidence: [fulfilment()] }) })));
    expect(itemsOf(then, "C2_OBLIGATION")).toEqual([]);
    expect(then.withoutProposal.map((w) => w.consumedState)).toContain("SATISFIED");
    const [x] = roundTrip(first, "2026-03-08T00:00:00Z", then);
    expect(x.evaluation.completion.state).toBe("COMPLETE");
    expect(x.evaluation.job.status).toBe("COMPLETED");
    expect(x.evaluation.completion.evidenceRefs).toEqual([`CATTLE_OBLIGATION_FULFILMENT:SYNTH-EVIDENCE-${A}`]);
    // Positive control the other way: at the first viewpoint the job is not started (resolved, no fulfilment).
    expect(roundTrip(first, OUTSTANDING_AT)[0].evaluation.completion.state).toBe("NOT_STARTED");
  });

  it("C2: competing corrections ⇒ UNAVAILABLE ⇒ UNKNOWN completion, never complete", () => {
    const first = ok(run(OUTSTANDING_RUN));
    const then = ok(run(later({ obligations: obligations({ evidence: conflictingFulfilments() }) })));
    const [x] = roundTrip(first, "2026-03-08T00:00:00Z", then);
    expect(x.evaluation.completion.state).toBe("UNKNOWN");
    expect(x.evaluation.job.status).not.toBe("COMPLETED");
    const kind = (x.proposal.completionContract as { recordKind: string }).recordKind;
    expect(then.evidence.records[kind]).toMatchObject({ status: "UNAVAILABLE" });
  });

  it("C7: a veterinary completion declaration completes the occurrence job", () => {
    const run1: Run = { programmes: programmes(), effectiveAt: "2026-04-15T00:00:00Z", knowledgeCutoff: "2026-04-16T00:00:00Z", actions: registry([]) };
    const first = ok(run(run1));
    const due = itemsOf(first, "C7_PROGRAMME").find((i) => i.consumedState === "DUE")!;
    const occurrenceId = (JSON.parse(due.cites!) as [string, string, string])[2];
    const then = ok(run({ ...run1, effectiveAt: "2026-04-18T00:00:00Z", knowledgeCutoff: "2026-04-18T12:00:00Z", programmes: programmes({ completions: [programmeCompletion(occurrenceId, "2026-04-12T00:00:00Z")] }) }));
    const results = roundTrip(first, "2026-04-18T00:00:00Z", then);
    const dueJob = results.find((x) => x.proposal.timing.recommendedWindow?.startIso === due.timing.window!.opensAt)!;
    expect(dueJob.evaluation.job.status).toBe("COMPLETED");
    expect(dueJob.evaluation.completion.evidenceRefs).toEqual(["CATTLE_PROGRAMME_COMPLETION_DECLARATION:SYNTH-COMPLETION-1"]);
    // The other occurrences are not completed by it.
    for (const x of results.filter((y) => y !== dueJob)) expect(x.evaluation.job.status).not.toBe("COMPLETED");
  });

  it("C4 via C8: a weight observed after the gap completes RECORD_WEIGHT; one observed before does not; not supplied ⇒ unknown", () => {
    const run1: Run = { weights: { observations: [] }, actions: defaultOnly("RECORD_WEIGHT") };
    const first = ok(run(run1));
    expect(first.proposals[0].completionContract).toMatchObject({ kind: "OPERATIONAL_RECORD", notBeforeIso: first.effectiveAt });
    const after = ok(run({ ...run1, effectiveAt: "2026-03-10T00:00:00Z", knowledgeCutoff: "2026-03-10T12:00:00Z", weights: { observations: [weightObs("SYNTH-W1", "2026-03-08T00:00:00Z")] } }));
    expect(roundTrip(first, "2026-03-10T00:00:00Z", after)[0].evaluation.job.status).toBe("COMPLETED");
    const before = ok(run({ ...run1, effectiveAt: "2026-03-10T00:00:00Z", knowledgeCutoff: "2026-03-10T12:00:00Z", weights: { observations: [weightObs("SYNTH-W0", "2026-03-04T00:00:00Z", A, "2026-03-09T00:00:00Z")] } }));
    expect(roundTrip(first, "2026-03-10T00:00:00Z", before)[0].evaluation.completion.state).toBe("NOT_STARTED");
    const unsupplied = ok(run({ ...run1, weights: null, actions: registry([]) }));
    expect(roundTrip(first, "2026-03-10T00:00:00Z", unsupplied)[0].evaluation.completion.state).toBe("UNKNOWN");
  });

  it("F002: a sub-millisecond gap viewpoint is never completed by an observation before it (Plan compares by millisecond)", () => {
    const at = "2026-03-05T00:00:00.000000001Z";
    const run1: Run = { effectiveAt: at, weights: { observations: [] }, actions: defaultOnly("RECORD_WEIGHT") };
    const first = ok(run(run1));
    expect(first.proposals[0].completionContract).toMatchObject({ kind: "OPERATIONAL_RECORD", notBeforeIso: "2026-03-05T00:00:00.001Z" });
    const statusWith = (observedAt: string) =>
      roundTrip(first, "2026-03-10T00:00:00Z", ok(run({ ...run1, effectiveAt: "2026-03-10T00:00:00Z", knowledgeCutoff: "2026-03-10T12:00:00Z", weights: { observations: [weightObs("SYNTH-W", observedAt)] } })))[0].evaluation.job.status;
    expect(statusWith("2026-03-05T00:00:00.000000000Z")).not.toBe("COMPLETED"); // before: never complete
    expect(statusWith(at)).not.toBe("COMPLETED"); // equal, within Plan's millisecond: conservatively not complete
    expect(statusWith("2026-03-05T00:00:00.000999999Z")).not.toBe("COMPLETED"); // after, same millisecond: conservative
    expect(statusWith("2026-03-05T00:00:00.001Z")).toBe("COMPLETED"); // after, next millisecond
  });

  it("F002 class: Plan's millisecond comparison against the contract bound never admits an observation before the viewpoint", () => {
    const instants = ["2026-03-05T00:00:00Z", "2026-03-05T00:00:00.000000001Z", "2026-03-05T00:00:00.0005Z", "2026-03-05T00:00:00.000999999Z", "2026-03-05T00:00:00.001Z", "2026-03-05T00:00:00.001000001Z", "2026-03-05T00:00:00.999999999Z", "2026-03-05T00:00:01Z", "2026-12-31T23:59:59.9999999Z", "2026-02-28T23:59:59.9995Z", "2028-02-28T23:59:59.9995Z", "2027-01-01T00:00:00.000Z"];
    expect(planNotBeforeBound("2026-02-28T23:59:59.9995Z")).toBe("2026-03-01T00:00:00.000Z");
    expect(planNotBeforeBound("2028-02-28T23:59:59.9995Z")).toBe("2028-02-29T00:00:00.000Z");
    expect(planNotBeforeBound("2026-12-31T23:59:59.9999999Z")).toBe("2027-01-01T00:00:00.000Z");
    for (const viewpoint of instants) {
      const bound = planNotBeforeBound(viewpoint);
      expect(compareInstants(bound, viewpoint)).toBeGreaterThanOrEqual(0);
      if (/\.\d{3}0*Z$|:\d{2}Z$/.test(viewpoint)) expect(bound).toBe(viewpoint); // millisecond-aligned: unchanged
      else expect(Date.parse(bound)).toBe(Date.parse(viewpoint) + 1); // the least whole millisecond after
      for (const observed of instants) if (Date.parse(observed) >= Date.parse(bound)) expect(compareInstants(observed, viewpoint)).toBeGreaterThanOrEqual(0);
    }
  });

  it("C6 via C8: a goal in force completes DECLARE_PRODUCTION_GOAL (data completion); not supplied ⇒ unknown", () => {
    const run1: Run = { goals: { declarations: [], routingRegistry: EMPTY_GOAL_ROUTING_REGISTRY }, actions: defaultOnly("DECLARE_PRODUCTION_GOAL") };
    const first = ok(run(run1));
    expect(first.proposals[0].completionContract).toEqual({ kind: "DATA_COMPLETION", requirementKey: "CATTLE_PRODUCTION_GOAL_IN_FORCE" });
    const then = ok(run({ ...run1, effectiveAt: "2026-03-10T00:00:00Z", knowledgeCutoff: "2026-03-10T12:00:00Z", goals: { declarations: [goalDecl("SYNTH-GOAL-1", "2026-03-06T00:00:00Z")], routingRegistry: EMPTY_GOAL_ROUTING_REGISTRY } }));
    expect(roundTrip(first, "2026-03-10T00:00:00Z", then)[0].evaluation.job.status).toBe("COMPLETED");
    const unsupplied = ok(run({ ...run1, goals: null, actions: registry([]) }));
    expect(roundTrip(first, "2026-03-10T00:00:00Z", unsupplied)[0].evaluation.completion.state).toBe("UNKNOWN");
    expect(evaluateCompletion(first.proposals[0].completionContract, { status: "KNOWN", members: [{ type: "CATTLE_ANIMAL", id: A }] }, first.evidence).state).toBe("NOT_STARTED");
  });
});

// ---------------------------------------------------------------------------
// Required 6 — scope reality from C4 group scope
// ---------------------------------------------------------------------------

describe("C9 scope reality — C4 group membership, all-or-unknown (B2)", () => {
  const groupLedgers = (bGroup = GROUP) => [ledgerOf(A, [{ id: "ga", value: GROUP }]), ledgerOf(B, [{ id: "gb", value: bGroup }])];

  it("known membership ⇒ KNOWN members; a membership change resolves through the real Plan scope functions", () => {
    const r1 = ok(run({ ledgers: groupLedgers(), groupScopes: [{ groupRef: GROUP }], actions: registry([]) }));
    expect(r1.scopeReality).toEqual([
      { selector: { kind: "MEMBERS_OF", parent: { type: "CATTLE_GROUP", id: GROUP }, memberType: "CATTLE_ANIMAL" }, membership: { status: "KNOWN", members: [{ type: "CATTLE_ANIMAL", id: A }, { type: "CATTLE_ANIMAL", id: B }] } },
    ]);
    const job: PlanJobInput = {
      id: "SYNTH-GROUP-JOB",
      actionKey: "SYNTH",
      title: "t",
      creationSource: { kind: "FARMER_MANUAL" },
      scope: cattleGroupScope(GROUP),
      initialMembers: (r1.scopeReality[0].membership as unknown as { members: { type: "CATTLE_ANIMAL"; id: string }[] }).members,
      completionContract: { kind: "MANUAL" },
      timing: { recommendedWindow: null, hardDeadline: null },
      dependencies: { jobIds: [], blockerIds: [] },
      systemPriority: { tier: "ROUTINE_MANAGEMENT", basis: "t" },
      route: { kind: "NONE", reason: "MANUAL_TASK" },
    };
    const created = createPlanJob(job, r1.effectiveAt).job;
    const moved = [ledgerOf(A, [{ id: "ga", value: GROUP }]), ledgerOf(B, [{ id: "gb", value: GROUP }, { id: "gb2", value: OTHER_GROUP, from: "2026-03-04T00:00:00Z", supersedes: ["gb"], receivedAt: "2026-03-04T00:00:00Z" }])];
    const r2 = ok(run({ ledgers: moved, groupScopes: [{ groupRef: GROUP }], actions: registry([]) }));
    const resolution = resolveScope(created.scope, created.scopeMembers, [], r2.scopeReality);
    expect(resolution).toMatchObject({ status: "KNOWN", removed: [{ type: "CATTLE_ANIMAL", id: B }], members: [{ type: "CATTLE_ANIMAL", id: A }] });
    const re = reevaluatePlanJob(created, { nowIso: r2.effectiveAt, scopeReality: r2.scopeReality, evidence: r2.evidence, jobStatuses: {}, blockers: {} });
    expect(re.events.some((e) => e.type === "SCOPE_CHANGED")).toBe(true);
  });

  it("any unknown / conflicting member ⇒ the whole selector UNKNOWN with a deterministic reason; Plan keeps members, never empties", () => {
    const conflicting = [ledgerOf(A, [{ id: "ga", value: GROUP }]), ledgerOf(B, [{ id: "gb1", value: GROUP }, { id: "gb2", value: OTHER_GROUP }])];
    const r = ok(run({ ledgers: conflicting, groupScopes: [{ groupRef: GROUP }], actions: registry([]) }));
    expect(r.scopes[0]).toMatchObject({ members: [A], conflict: [B] });
    expect(r.scopeReality[0].membership).toEqual({ status: "UNKNOWN", reason: `CATTLE_GROUP_MEMBERSHIP_UNRESOLVED:${JSON.stringify({ unknown: [], conflict: [B], invalid: [] })}` });
    const unknown = ok(run({ ledgers: [ledgerOf(A, [{ id: "ga", value: GROUP }]), ledgerOf(B)], groupScopes: [{ groupRef: GROUP }], actions: registry([]) }));
    expect(unknown.scopeReality[0].membership.status).toBe("UNKNOWN");
    const scope = cattleGroupScope(GROUP);
    const resolution = resolveScope(scope, [{ type: "CATTLE_ANIMAL", id: A }], [], unknown.scopeReality);
    expect(resolution).toMatchObject({ status: "UNKNOWN", members: [{ type: "CATTLE_ANIMAL", id: A }], removed: [] });
  });

  it("group scopes are a set: order and duplicates never change the result", () => {
    const base = ok(run({ ledgers: groupLedgers(OTHER_GROUP), groupScopes: [{ groupRef: GROUP }, { groupRef: OTHER_GROUP }], actions: registry([]) }));
    const permuted = ok(run({ ledgers: groupLedgers(OTHER_GROUP), groupScopes: [{ groupRef: OTHER_GROUP }, { groupRef: GROUP }, { groupRef: GROUP }], actions: registry([]) }));
    expect(conformanceSnapshot(permuted)).toBe(conformanceSnapshot(base));
  });
});

// ---------------------------------------------------------------------------
// Required 5 / 13 — deduplication and merge algebra
// ---------------------------------------------------------------------------

describe("C9 merge algebra (proposal groups by planJobIdentityKey)", () => {
  const base = ok(run(OVERDUE_RUN));
  const x = itemsOf(base, "C2_OBLIGATION")[0];
  const fp = (d: string) => ({ ...x.outputFingerprint, digest: d.repeat(64) });
  const y: CattlePlanWorkItem = {
    ...x,
    key: JSON.stringify(["C2_OBLIGATION", "SYNTH-OUTPUT-Y"]),
    outputId: "SYNTH-OUTPUT-Y",
    outputFingerprint: fp("b"),
    supporting: [],
    priority: { tier: "ROUTINE_MANAGEMENT", basis: "SYNTH-BASIS-Y" },
    timing: { ...x.timing, windowBasis: "SYNTH-WINDOW-Y", hardDeadline: { dueIso: "2026-03-10T00:00:00.000000000Z", authority: { ...x.timing.hardDeadline!.authority, sourceId: "SYNTH-SRC-Y" } } },
  };
  const z: CattlePlanWorkItem = { ...x, key: JSON.stringify(["C8_RECOMMENDATION", "SYNTH-OUTPUT-Z"]), family: "C8_RECOMMENDATION", origin: "RECOMMENDATION", outputId: "SYNTH-OUTPUT-Z", outputFingerprint: fp("c"), supporting: [], timing: { ...x.timing, hardDeadline: null }, priority: { tier: "EXPECTED_NET_RETURN", basis: "SYNTH-BASIS-Z" } };
  const merged = (items: CattlePlanWorkItem[]) => {
    const g = groupWorkItems(items);
    if (!g.ok) throw new Error(JSON.stringify(g.issues));
    return g.groups;
  };

  it("5. several cattle reasons for the same work ⇒ one proposal with every reason; identity = planJobIdentityKey", () => {
    const [g] = merged([x, y, z]);
    expect(g.items).toHaveLength(3);
    // Three origins plus the C8 restatement already folded into x (D2): every reason kept once.
    expect(x.supporting).toHaveLength(1);
    expect(g.supportingReasons).toHaveLength(4);
    expect(g.origins).toEqual(["OBLIGATION", "RECOMMENDATION"]);
    expect(g.priority.tier).toBe("HARD_OBLIGATION");
    expect(g.priority.bases).toHaveLength(3);
    // Earliest deadline wins; every authority is kept.
    expect(g.hardDeadline?.dueIso).toBe("2026-03-10T00:00:00.000000000Z");
    expect(g.hardDeadline?.authorities).toHaveLength(2);
    expect(g.windowBases).toHaveLength(2);
  });

  it("13. permutation, partition-remerge, duplicate idempotence and canonical fixed point", () => {
    const items = [x, y, z];
    expect(checkOrderIndependence("merge", items, (is) => merged(is))).toEqual(CONFORMS);
    const whole = conformanceSnapshot(merged(items));
    const partitioned = mergeProposalGroups([...merged([x]), ...merged([y, z])]);
    expect(partitioned.ok && conformanceSnapshot(partitioned.groups)).toBe(whole);
    expect(conformanceSnapshot(merged([x, y, z, x, z]))).toBe(whole);
    const groups = merged(items);
    const again = mergeProposalGroups(groups);
    expect(again.ok && conformanceSnapshot(again.groups)).toBe(whole);
    const twice = mergeProposalGroups([...groups, ...groups]);
    expect(twice.ok && conformanceSnapshot(twice.groups)).toBe(whole);
  });

  it("merge needs equal scope / window by construction; a different window is another job", () => {
    const later = { ...y, timing: { ...y.timing, window: { ...y.timing.window!, dueAt: "2026-03-12T00:00:00.000000000Z" } } };
    expect(merged([x, later])).toHaveLength(2);
    const sameKeyDifferent = { ...x, reasonCodes: ["SYNTH-DIFFERENT"] };
    expect(groupWorkItems([x, sameKeyDifferent])).toEqual({ ok: false, issues: [{ code: "CATTLE_PLAN_WORK_ITEM_IDENTITY_CONFLICT", ref: x.key }] });
  });

  it("F001: items differing only in cattle window boundary share the Plan window and merge; each boundary stays in provenance", () => {
    const otherBoundary = { ...y, timing: { ...y.timing, window: { ...y.timing.window!, boundary: `${x.timing.window!.boundary}-SYNTH-OTHER` } } };
    const [g] = merged([x, otherBoundary]);
    expect(g.items.map((i) => i.timing.window!.boundary).sort()).toEqual([x.timing.window!.boundary, otherBoundary.timing.window.boundary].sort());
    expect(checkOrderIndependence("merge-boundary", [x, otherBoundary, z], (is) => merged(is))).toEqual(CONFORMS);
  });

  it("F001 real engine: two C7 actions of one kind with different window boundaries merge into one proposal per occurrence", () => {
    const def = programmeDefinition();
    const [action] = def.actions as { schedule: { window: Record<string, unknown> } & Record<string, unknown> }[];
    const inclusive = { ...action, actionId: "SYNTH-ACTION-2", schedule: { ...action.schedule, window: { ...action.schedule.window, boundary: "INCLUSIVE_START_INCLUSIVE_END" } } };
    const r = ok(run({ programmes: programmes({ definition: { ...def, actions: [action, inclusive] } }) }));
    const c7 = itemsOf(r, "C7_PROGRAMME");
    expect(new Set(c7.map((i) => i.timing.window?.boundary))).toEqual(new Set(["INCLUSIVE_START_EXCLUSIVE_END", "INCLUSIVE_START_INCLUSIVE_END"]));
    const proposals = proposalOf(r, "CATTLE_PROGRAMME:");
    expect(proposals).toHaveLength(3);
    for (const p of proposals) {
      const g = r.groups.find((x) => projectGroup(x, r.effectiveAt).id === p.id)!;
      expect(g.items.map((i) => i.timing.window!.boundary).sort()).toEqual(["INCLUSIVE_START_EXCLUSIVE_END", "INCLUSIVE_START_INCLUSIVE_END"]);
      expect(createPlanJob(p, r.effectiveAt).job.status).toBe("PROPOSED");
    }
  });

  it("COMPOSITE is a projection: the group keeps every origin and Plan accepts the job", () => {
    const [g] = merged([x, z]);
    const r = ok(run(OVERDUE_RUN));
    const projected = projectGroup(g, r.effectiveAt);
    expect(projected.creationSource).toEqual({ kind: "FARM_RETURN", reason: "COMPOSITE" });
    expect(createPlanJob(projected, r.effectiveAt).job.supportingReasons).toEqual(g.supportingReasons);
  });
});

function projectGroup(g: CattlePlanProposalGroup, effectiveAt: string): PlanJobInput {
  const p = projectProposal(g, effectiveAt);
  if (p === null) throw new Error("projection");
  return p;
}

// ---------------------------------------------------------------------------
// 11 / 12 — provenance and fingerprints
// ---------------------------------------------------------------------------

describe("C9 provenance and fingerprints", () => {
  it("11. every proposal cites cattle output ids and fingerprints of the canonical items it was projected from", () => {
    const r = ok(run({ ...OVERDUE_RUN, programmes: programmes() }));
    for (const g of r.groups) {
      const p = r.proposals.find((q) => q.id === `CATTLE_PLAN_JOB:${g.identityKey}`)!;
      const cited = (p.supportingReasons ?? []).map((s) => JSON.parse(s.slice("CATTLE_PLAN_REASON:".length)) as [string, string, string, string]);
      const expected = g.items.flatMap((i) => [[i.family, i.outputId, i.outputFingerprint.digest, i.consumedState], ...i.supporting.map((s) => [s.family, s.outputId, s.outputFingerprint.digest, s.consumedState])]);
      expect(cited.map((c) => JSON.stringify(c)).sort()).toEqual(expected.map((c) => JSON.stringify(c)).sort());
    }
  });

  it("11b. metamorphic: a consumed upstream change changes exactly the affected citation", () => {
    const base = ok(run(OUTSTANDING_RUN));
    const changed = ok(run({ ...OUTSTANDING_RUN, obligations: obligations({ evidence: [fulfilment({ fulfilledAt: "2026-03-01T00:00:00Z", receivedAt: "2026-03-01T06:00:00Z" })] }) }));
    // A fulfilment before the window opens never satisfies (C2) — still OUTSTANDING, but the record (and its citation) changed.
    expect(itemsOf(changed, "C2_OBLIGATION")[0].consumedState).toBe("OUTSTANDING");
    expect(itemsOf(changed, "C2_OBLIGATION")[0].outputFingerprint.digest).not.toBe(itemsOf(base, "C2_OBLIGATION")[0].outputFingerprint.digest);
    expect(changed.fingerprint.digest).not.toBe(base.fingerprint.digest);
  });

  it("12. relevant changes change the fingerprint; equivalent inputs and non-consumed inputs do not", () => {
    const baseRun: Run = { ...OUTSTANDING_RUN, ledgers: [ledgerOf(A), ledgerOf(B)] };
    const [spelling] = equivalentInstantSpellings("2026-03-05T00:00:00Z").filter((s) => s !== "2026-03-05T00:00:00Z");
    const unreferencedModel = { records: [], reviews: [], sources: [] };
    const verdict = checkFingerprintStability(
      "C9 result",
      baseRun,
      [
        { label: "ledger order", payload: { ...baseRun, ledgers: [ledgerOf(B), ledgerOf(A)] } },
        { label: "equivalent effectiveAt spelling", payload: { ...baseRun, effectiveAt: spelling } },
        { label: "empty model catalogue spelled again", payload: { ...baseRun, models: unreferencedModel } },
        { label: "an economic observation no model references", payload: { ...baseRun, observations: [{ observationId: "SYNTH-O1", valueKey: "SYNTH-K", amount: "1", currency: "EUR", observedAt: "2026-03-01T00:00:00Z", receivedAt: "2026-03-01T00:00:00Z", source: sourceVersionRef(SCIENCE_SOURCE), supersedes: [] }] } },
      ],
      [
        { label: "effectiveAt", payload: { ...baseRun, effectiveAt: "2026-03-06T00:00:00Z" } },
        { label: "knowledge cutoff admits a fulfilment", payload: { ...baseRun, obligations: obligations({ evidence: [fulfilment({ receivedAt: "2026-03-05T06:00:00Z", fulfilledAt: "2026-03-04T00:00:00Z" })] }) } },
        { label: "another obligation", payload: { ...baseRun, obligations: obligations({ ids: [OBL, "SYNTH-NOT-CATALOGUED"] }) } },
        { label: "registry", payload: { ...baseRun, actions: registry([]) } },
      ],
      (o) => ok(run(o)).fingerprint.digest,
    );
    expect(verdict).toEqual(CONFORMS);
  });
});

// ---------------------------------------------------------------------------
// Required 9 — determinism, order, aliasing, frozen output, no clock; canonical boundary
// ---------------------------------------------------------------------------

describe("C9 determinism, aliasing and the canonical boundary", () => {
  const FULL: Run = { ...OVERDUE_RUN, programmes: programmes({ definition: programmeDefinition({ animalIds: [A, B] }) }), ledgers: [ledgerOf(A, [{ id: "ga", value: GROUP }]), ledgerOf(B, [{ id: "gb", value: GROUP }])], groupScopes: [{ groupRef: GROUP }] };

  it("CAT-INV-012 / 002 / 021: input order independent, detached, deep-frozen, reproducible", () => {
    const ledgers = FULL.ledgers!;
    expect(
      allConform([
        checkOrderIndependence("ledgers", ledgers, (ls) => run({ ...FULL, ledgers: ls })),
        checkDetachedResult(
          "request",
          () => planRequest(FULL),
          (req) => planCattleWork(req, hash, TRUSTED),
          (req) => {
            (req.groupScopes as Rec[]).push({ groupRef: "SYNTH-MUTATED" });
            ((req.cattle as Rec).query as Rec).effectiveAt = "2026-05-01T00:00:00Z";
          },
        ),
      ]),
    ).toEqual(CONFORMS);
  });

  it("CAT-INV-001: non-canonical input is rejected before any evaluation (a getter is never invoked)", () => {
    let invoked = 0;
    const req = planRequest(FULL);
    Object.defineProperty(req, "groupScopes", { get: () => (invoked += 1, []), enumerable: true });
    expect(codes(planCattleWork(req, hash, TRUSTED))).toEqual(["CATTLE_PLAN_NON_CANONICAL_INPUT"]);
    expect(invoked).toBe(0);
    expect(codes(planCattleWork({ cattle: new Date(0), groupScopes: [] }, hash, TRUSTED))).toEqual(["CATTLE_PLAN_NON_CANONICAL_INPUT"]);
    expect(codes(planCattleWork(null, hash, TRUSTED))).toEqual(["CATTLE_PLAN_INVALID_REQUEST"]);
  });

  it("the failure result is frozen too", () => {
    const r = planCattleWork(null, hash, TRUSTED);
    expect(Object.isFrozen(r)).toBe(true);
  });

  it("no clock, randomness, network, AI, persistence or tooling import in the production modules; Plan is imported, never modified", () => {
    const dir = path.resolve(__dirname);
    const production = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "plan-test-fixtures.ts" && f !== "plan-test-support.ts");
    expect(production.sort()).toEqual(["index.ts", "plan-contracts.ts", "plan-delegation.ts", "plan-evidence.ts", "plan-integrity.ts", "plan-interface.ts", "plan-merge.ts", "plan-vocabulary.ts", "plan-work-items.ts"]);
    for (const f of production) {
      const src = readFileSync(path.join(dir, f), "utf8");
      expect(src, f).not.toMatch(/Date\.now|new Date\(|performance\.now|Math\.random|fetch\(|tooling|supabase|node:/);
    }
  });
});

// ---------------------------------------------------------------------------
// 15 — no Plan file changes (frozen Plan contract, C8P1)
// ---------------------------------------------------------------------------

describe("C9 — the Plan kernel is untouched", () => {
  // SHA-256 of every Plan kernel file and `subject.ts` at the C9 phase base (91ef012, the C8P1-frozen contract).
  const PINNED: Record<string, string> = {
    "plan/action-route.ts": "4bbec37b44c0b96d44deac7863ace4e4d93d25d05741b21dedc4ddc12bb73cc3",
    "plan/audit.ts": "75ac6a3c20e8898582f83e109f3bbdea4f3107d3a9eda7b0addd1dcafb49c35d",
    "plan/cattle-compatibility.test.ts": "6226bca194e7f1541af3c719df53d96ca0db3a4f991364b58f74896dc7824f39",
    "plan/completion.test.ts": "a6986a1234129a46a90baee90013dd4849275aa1865fb434f66d65a26c23bfc8",
    "plan/completion.ts": "a8fceccb2df2ed9b535e810621df236df19fca9b795b6a505a3ed7fee08085e7",
    "plan/dependencies.ts": "932584d2ac01eaefc9e86f77a9050a2f12c0034e52f26cf198b91ea3aa1e5067",
    "plan/farmer-order.test.ts": "5e7db966202560f74e20e0b4615f52655d9e07dd41c46ca055f87359ca05c4af",
    "plan/farmer-order.ts": "0c851a69849547f2b310beaa5ded6d85fe3e136ec0035b50bc36660ad1e73c40",
    "plan/goal.ts": "b4013794c484e652a25bcb7157652bf5da1d059b1cf7214866f49585c25fdcf5",
    "plan/index.ts": "3acd2f5a5015acb6afb3cc5866600279c7ddf28c2e70cdafcbcfa2735a0dfc02",
    "plan/job.test.ts": "e8b30ea313e2e087247829b4146461c5b1ba3e3a811fe34813fa9772569a7ebe",
    "plan/job.ts": "1a6adbbbfba13ecdb7b72b4b847f790c4224cccb7ee5a0d9d6d776e197051123",
    "plan/override.test.ts": "858c8e261c9f847f03498372cf155deb6f5c3b89ee4d61f94d4462156d7cc17e",
    "plan/override.ts": "2728065c7bf2deb0342488201cd911abfb84a03931491104fdb8b414266a17fa",
    "plan/priority.ts": "af6c370879d1fef366a9733e4ade8cbf8d083fd7339644929cedd0e9013de162",
    "plan/readiness.test.ts": "1952a5c58f3ed533307b2bb64e7f28f85322b8e4b4492709fe100c0aabffaece",
    "plan/readiness.ts": "8b91710e81ead24374d3007fd3910efa0119ddc7e99f2d39cfb83ac5641efdfa",
    "plan/reevaluate.test.ts": "de3a906d0b58aefe7a2615fb2d1f156aa8d8f2ce1960ac6b95346f6c313ebae6",
    "plan/reevaluate.ts": "a6a901409a22c3be7fc6522984b8cc4b49eb668298ce8305f27bdbd7e9573435",
    "plan/scope.test.ts": "21a660565498e89c2ae6c73ecf91d29cf825f7766a72ded300a9f5195ece6183",
    "plan/scope.ts": "9b9c7e5554075c2ef9c835997dc5fafa48b7c2d2bc3780bb63b2039b3204c751",
    "plan/status.ts": "d34cc270b686ecc23587d78416e2040fabfc4122b0bec8a4ffe75ee44dcfbf51",
    "plan/test-fixtures.ts": "78be83fae3e2d1fcca1881ebd468e928a4c409951a712ff177cc4ecbb16d5ec6",
    "plan/timing.test.ts": "a72c666d8df33f304db960bfac9256cd0ba347a77a96df1e39a43a6abbe51e5f",
    "plan/timing.ts": "f6cac8f50a65837eb9179d12edb06cc009794e3f9704df58aa4a4ed6352344f0",
    "plan/version.ts": "a3fcccbfec301b61972a1f257e726c62081e31ed3dbad803e4915ece206aeec8",
    "subject.ts": "5ed503ba4a89eae549357fa7784ed30604fab8c8d721753778422aeac91f8ba1",
  };

  it("every Plan kernel file (and subject.ts) is byte-identical to the frozen contract; no file added or removed", () => {
    const root = path.resolve(__dirname, "../..");
    const files = [...readdirSync(path.join(root, "plan")).filter((f) => f.endsWith(".ts")).map((f) => `plan/${f}`), "subject.ts"].sort();
    expect(files).toEqual(Object.keys(PINNED).sort());
    for (const f of files) expect(createHash("sha256").update(readFileSync(path.join(root, f))).digest("hex"), f).toBe(PINNED[f]);
  });

  it("the cattle barrel re-exports C9 additively", () => {
    expect(cattle.planCattleWork).toBe(planCattleWork);
    expect(typeof cattle.cattleGroupScope).toBe("function");
  });
});
