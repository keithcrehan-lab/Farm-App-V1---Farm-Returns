/**
 * Cattle C6 — production goal engine. Synthetic data only: every animal,
 * scope, goal, actor, registry, rule, target and number is a fictional
 * `SYNTH-*` fixture with no biological, legal or economic meaning.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONFORMS,
  MALFORMED_INSTANTS,
  RESOLVED_LOOKING_STATES,
  checkCorrectionPreservesHistory,
  checkDetachedResult,
  checkDuplicateIdentity,
  checkFingerprintStability,
  checkFutureKnowledgeInvisible,
  checkMalformedKnowledgeTimeFailsClosed,
  checkOrderIndependence,
  checkUnresolvedEvidenceNotMasked,
  cutoffMatrix,
  equivalentInstantSpellings,
  isDeepFrozen,
} from "@/tooling/cattle-conformance/cattle-conformance";
import * as cattle from "../index";
import { computeSourceContentFingerprint } from "../source";
import { hash } from "../test-fixtures";
import { buildWeightReadContract } from "../weights";
import { evaluatePerformance, type PerformanceEvaluation } from "../performance";
import { materialisePerformanceTarget } from "../performance/performance-definitions";
import { computePerformanceFingerprint } from "../performance/performance-integrity";
import {
  EMPTY_GOAL_ROUTING_REGISTRY,
  goalTypeRef,
  projectProductionGoals,
  resolveGoalTargetApplicability,
  routeProductionGoals,
  verifyGoalSnapshotRef,
  type GoalProjection,
  type GoalProjectionResult,
  type GoalRoutingRegistry,
} from "./index";

const A = "SYNTH-ANIMAL-1";
const B = "SYNTH-ANIMAL-2";
const ANIMAL = { kind: "ANIMAL", animalId: A };
const FROM = "2026-01-01T00:00:00Z";
const TO = "2026-03-01T00:00:00Z";
const EFFECTIVE = "2026-02-01T00:00:00Z";
const RECEIVED = "2025-12-01T00:00:00Z";
const LATER = "2026-04-01T00:00:00Z";
const CUTOFF = "2026-06-01T00:00:00Z";

type Rec = Record<string, unknown>;

function goal(goalId: string, fields: Rec = {}): Rec {
  return {
    goalId,
    version: "v1",
    action: "DECLARE",
    subject: ANIMAL,
    goalType: "FINISHING",
    validFrom: FROM,
    declaredBy: { actor: "SYNTH-FARMER-1", role: "FARMER" },
    provenance: { sourceCategory: "FARMER", receivedAt: RECEIVED },
    ...fields,
  };
}
const received = (receivedAt: unknown) => ({ provenance: { sourceCategory: "FARMER", receivedAt } });

interface Q {
  subject?: Rec;
  effectiveAt?: string;
  knowledgeCutoff?: string;
}
const query = (q: Q = {}) =>
  ({
    subject: "subject" in q ? q.subject : ANIMAL,
    effectiveAt: "effectiveAt" in q ? q.effectiveAt : EFFECTIVE,
    knowledgeCutoff: "knowledgeCutoff" in q ? q.knowledgeCutoff : CUTOFF,
  }) as never;

function project(declarations: readonly unknown[], q: Q = {}): GoalProjectionResult {
  return projectProductionGoals({ declarations, query: query(q) }, hash);
}
function ok(result: GoalProjectionResult): GoalProjection {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.projection;
}
const status = (declarations: readonly unknown[], q: Q = {}) => ok(project(declarations, q)).status;
const activeIds = (p: GoalProjection) => p.activeGoals.map((g) => `${g.declaration.goalId}@${g.declaration.version}`);
const issueCodes = (p: GoalProjection) => p.issues.map((i) => i.code);

describe("C6 declarations: declare, correct, supersede, end, withdraw", () => {
  it("a declared goal is ACTIVE intent within its period", () => {
    const p = ok(project([goal("SYNTH-GOAL-1", { targetWeight: { value: 600, unit: "KILOGRAM" }, targetDate: "2026-09-30", targetOutcome: { scheme: "SYNTH-SCHEME", code: "SYNTH-GRADE-X" } })]));
    expect(p.status).toBe("ACTIVE");
    expect(activeIds(p)).toEqual(["SYNTH-GOAL-1@v1"]);
    const g = p.activeGoals[0];
    expect(g).toMatchObject({ informationClass: "INTENT", standing: "DECLARED", versionState: "RESOLVED" });
    expect(g.declaration.targetWeight).toEqual({ value: 600, unit: "KILOGRAM", canonical: { state: "KNOWN", kg: 600 } });
    expect(g.declaration.targetDate).toBe("2026-09-30");
    expect(g.declaration.targetOutcome).toEqual({ scheme: "SYNTH-SCHEME", code: "SYNTH-GRADE-X" });
    expect(g.declaration.validFrom).toBe("2026-01-01T00:00:00.000000000Z");
  });

  it("a target weight without an exact conversion is kept as recorded and UNSUPPORTED canonically", () => {
    const p = ok(project([goal("SYNTH-GOAL-1", { targetWeight: { value: 1300, unit: "POUND" } })]));
    expect(p.activeGoals[0].declaration.targetWeight).toEqual({ value: 1300, unit: "POUND", canonical: { state: "UNSUPPORTED" } });
    for (const bad of [{ value: 0, unit: "KILOGRAM" }, { value: 600, unit: "STONE" }, { value: 600 }, { value: "600", unit: "KILOGRAM" }]) {
      expect(issueCodes(ok(project([goal("SYNTH-GOAL-1", { targetWeight: bad })]))), JSON.stringify(bad)).toEqual(["CATTLE_GOAL_RECORD_INVALID_TARGET_OUTCOME"]);
    }
  });

  it("a projected declaration replays to the same projection; a mismatched canonical weight fails closed", () => {
    for (const targetWeight of [{ value: 600, unit: "KILOGRAM" }, { value: 1300, unit: "POUND" }]) {
      const first = ok(project([goal("SYNTH-GOAL-1", { targetWeight })]));
      const replayed = ok(project([JSON.parse(JSON.stringify(first.activeGoals[0].declaration))]));
      expect(replayed.status, targetWeight.unit).toBe("ACTIVE");
      expect(replayed.snapshot, targetWeight.unit).toEqual(first.snapshot);
      // Supplied and materialised forms of one record are the same content.
      expect(ok(project([goal("SYNTH-GOAL-1", { targetWeight }), first.activeGoals[0].declaration])).status).toBe("ACTIVE");
    }
    for (const canonical of [{ state: "KNOWN", kg: 601 }, { state: "UNSUPPORTED" }, { state: "KNOWN" }, null]) {
      const p = ok(project([goal("SYNTH-GOAL-1", { targetWeight: { value: 600, unit: "KILOGRAM", canonical } })]));
      expect(issueCodes(p), JSON.stringify(canonical)).toEqual(["CATTLE_GOAL_RECORD_INVALID_TARGET_OUTCOME"]);
    }
  });

  it("a malformed supplied canonical weight fails closed instead of throwing", () => {
    for (const canonical of [undefined, { state: "KNOWN", kg: undefined }, { state: "UNSUPPORTED", kg: undefined }]) {
      const p = ok(project([goal("SYNTH-GOAL-1", { targetWeight: { value: 600, unit: "KILOGRAM", canonical } })]));
      expect(issueCodes(p), String(canonical && canonical.state)).toEqual(["CATTLE_GOAL_RECORD_INVALID_TARGET_OUTCOME"]);
    }
  });

  it("a correction supersedes; the corrected version stays in history", () => {
    const v2 = goal("SYNTH-GOAL-1", { version: "v2", supersedesVersions: ["v1"], goalType: "BREEDING", ...received(LATER) });
    const p = ok(project([goal("SYNTH-GOAL-1"), v2]));
    expect(activeIds(p)).toEqual(["SYNTH-GOAL-1@v2"]);
    expect(p.activeGoals[0].declaration.goalType).toBe("BREEDING");
    expect(p.history.map((h) => [h.declaration.version, h.recordState, h.supersededBy])).toEqual([
      ["v1", "SUPERSEDED", [{ goalId: "SYNTH-GOAL-1", version: "v2" }]],
      ["v2", "LIVE", []],
    ]);
  });

  it("an ending is a new version closing the period; a withdrawal is never in force", () => {
    const end = goal("SYNTH-GOAL-1", { version: "v2", action: "END", supersedesVersions: ["v1"], validTo: TO, ...received(LATER) });
    expect(status([goal("SYNTH-GOAL-1"), end], { effectiveAt: EFFECTIVE })).toBe("ACTIVE");
    expect(status([goal("SYNTH-GOAL-1"), end], { effectiveAt: TO })).toBe("NONE");
    const withdraw = goal("SYNTH-GOAL-1", { version: "v2", action: "WITHDRAW", supersedesVersions: ["v1"], ...received(LATER) });
    const p = ok(project([goal("SYNTH-GOAL-1"), withdraw]));
    expect(p.status).toBe("NONE");
    expect(p.history.map((h) => [h.declaration.action, h.recordState])).toEqual([
      ["DECLARE", "SUPERSEDED"],
      ["WITHDRAW", "LIVE"],
    ]);
    // An ending needs an end; ending / withdrawing needs an earlier version.
    expect(issueCodes(ok(project([goal("SYNTH-GOAL-1"), { ...end, validTo: null }])))).toContain("CATTLE_GOAL_RECORD_INVALID_ACTION");
    expect(issueCodes(ok(project([goal("SYNTH-GOAL-1", { action: "WITHDRAW" })])))).toContain("CATTLE_GOAL_RECORD_INVALID_ACTION");
  });

  it("identical duplicates are idempotent (equivalent instant spellings included); same id + different content fails closed", () => {
    const base = ok(project([goal("SYNTH-GOAL-1")]));
    const respelt = goal("SYNTH-GOAL-1", { validFrom: "2026-01-01T00:00:00.000Z", ...received("2025-12-01T00:00:00.000000Z") });
    expect(ok(project([goal("SYNTH-GOAL-1"), goal("SYNTH-GOAL-1"), respelt])).fingerprint).toEqual(base.fingerprint);
    const p = ok(project([goal("SYNTH-GOAL-1"), goal("SYNTH-GOAL-1", { goalType: "SALE" })]));
    expect(p.status).toBe("INVALID");
    expect(p.activeGoals).toEqual([]);
    expect(issueCodes(p)).toEqual(["CATTLE_GOAL_RECORD_DUPLICATE_VERSION_DIFFERENT_CONTENT"]);
    const verdict = checkDuplicateIdentity(
      "goal id + version",
      [goal("SYNTH-GOAL-1")],
      goal("SYNTH-GOAL-1"),
      [
        { label: "different type", record: goal("SYNTH-GOAL-1", { goalType: "RETAIN" }) },
        { label: "invalid copy", record: goal("SYNTH-GOAL-1", { goalType: "NOT-A-TYPE" }) },
        { label: "different declarer", record: goal("SYNTH-GOAL-1", { declaredBy: { actor: "SYNTH-ADVISER-1", role: "ADVISER" } }) },
      ],
      (records) => project(records),
      (r) => r.ok && r.projection.status === "INVALID",
    );
    expect(verdict).toEqual(CONFORMS);
  });

  it("malformed records fail closed (INVALID, no goal reported)", () => {
    const cases: [string, Rec][] = [
      ["unknown field", goal("SYNTH-GOAL-1", { priority: 1 })],
      ["goal type outside the enumeration", goal("SYNTH-GOAL-1", { goalType: "finishing" })],
      ["missing declarer", goal("SYNTH-GOAL-1", { declaredBy: undefined })],
      ["declarer without actor", goal("SYNTH-GOAL-1", { declaredBy: { role: "FARMER" } })],
      ["unknown role", goal("SYNTH-GOAL-1", { declaredBy: { actor: "SYNTH-X", role: "CONTRACTOR" } })],
      ["empty period", goal("SYNTH-GOAL-1", { validTo: FROM })],
      ["subject without kind", goal("SYNTH-GOAL-1", { subject: { animalId: A } })],
      ["goal id in the reserved type-ref space", goal(goalTypeRef("SALE"))],
      ["target date not a calendar date", goal("SYNTH-GOAL-1", { targetDate: "2026-02-30" })],
      ["self supersession", goal("SYNTH-GOAL-1", { supersedesVersions: ["v1"] })],
      ["unknown supersession target", goal("SYNTH-GOAL-1", { version: "v2", supersedesVersions: ["v9"] })],
    ];
    for (const [label, record] of cases) {
      const p = ok(project([goal("SYNTH-GOAL-2"), record]));
      expect(p.status, label).toBe("INVALID");
      expect(p.activeGoals, label).toEqual([]);
      expect(p.inForce, label).toEqual([]);
      expect(p.issues.length, label).toBeGreaterThan(0);
    }
  });

  it("every version of a goal shares subject and standing; a supersession cycle is invalid", () => {
    const otherAnimal = goal("SYNTH-GOAL-1", { version: "v2", supersedesVersions: ["v1"], subject: { kind: "ANIMAL", animalId: B } });
    expect(issueCodes(ok(project([goal("SYNTH-GOAL-1"), otherAnimal])))).toEqual(["CATTLE_GOAL_RECORD_IDENTITY_SCOPE_MISMATCH"]);
    const cycle = [goal("SYNTH-GOAL-1", { supersedesVersions: ["v2"] }), goal("SYNTH-GOAL-1", { version: "v2", supersedesVersions: ["v1"] })];
    expect(issueCodes(ok(project(cycle)))).toContain("CATTLE_GOAL_RECORD_SUPERSESSION_CYCLE");
  });
});

describe("C6 NONE and SYSTEM suggestions", () => {
  it("no declaration ⇒ NONE, never a default goal", () => {
    const p = ok(project([]));
    expect(p).toMatchObject({ status: "NONE", inForce: [], activeGoals: [], conflicts: [], suggestions: [], history: [] });
    expect(p.snapshot.goals).toEqual([]);
    // A goal for another subject, or outside its period, is not a goal here.
    expect(status([goal("SYNTH-GOAL-1", { subject: { kind: "ANIMAL", animalId: B } })])).toBe("NONE");
    expect(status([goal("SYNTH-GOAL-1", { validFrom: TO })])).toBe("NONE");
  });

  it("a SYSTEM record is a suggestion only and never an active declared goal", () => {
    const system = goal("SYNTH-GOAL-S", { declaredBy: { actor: "SYNTH-ENGINE", role: "SYSTEM" }, provenance: { sourceCategory: "OTHER", receivedAt: RECEIVED } });
    const p = ok(project([system]));
    expect(p.status).toBe("NONE");
    expect(p.activeGoals).toEqual([]);
    expect(p.snapshot.goals).toEqual([]);
    expect(p.suggestions.map((s) => [s.declaration.goalId, s.standing, s.informationClass])).toEqual([["SYNTH-GOAL-S", "SUGGESTED", "INTENT"]]);
    // A suggestion never conflicts with, nor joins, the declared intent.
    expect(status([system, goal("SYNTH-GOAL-1", { goalType: "SALE" }), { ...system, goalId: "SYNTH-GOAL-T", goalType: "RETAIN" }])).toBe("ACTIVE");
    // A SYSTEM version can never supersede (end / withdraw) a declared goal.
    const takeover = goal("SYNTH-GOAL-1", { version: "v2", action: "WITHDRAW", supersedesVersions: ["v1"], declaredBy: { actor: "SYNTH-ENGINE", role: "SYSTEM" } });
    expect(ok(project([goal("SYNTH-GOAL-1"), takeover])).status).toBe("INVALID");
  });
});

describe("C6 intent conflicts (structural only)", () => {
  it("SALE vs RETAIN overlapping on the same subject ⇒ INTENT_CONFLICT with no winner", () => {
    const p = ok(project([goal("SYNTH-GOAL-1", { goalType: "SALE" }), goal("SYNTH-GOAL-2", { goalType: "RETAIN" })]));
    expect(p.status).toBe("INTENT_CONFLICT");
    expect(p.activeGoals).toEqual([]);
    expect(p.conflicts.map((c) => [c.kind, c.goals.map((g) => g.goalId)])).toEqual([["MUTUALLY_EXCLUSIVE_GOAL_TYPES", ["SYNTH-GOAL-1", "SYNTH-GOAL-2"]]]);
    expect(p.snapshot.status).toBe("INTENT_CONFLICT");
  });

  it("no overlap, another subject or a non-structural combination is not a conflict", () => {
    expect(status([goal("SYNTH-GOAL-1", { goalType: "SALE", validTo: EFFECTIVE }), goal("SYNTH-GOAL-2", { goalType: "RETAIN", validFrom: EFFECTIVE })])).toBe("ACTIVE");
    expect(status([goal("SYNTH-GOAL-1", { goalType: "SALE" }), goal("SYNTH-GOAL-2", { goalType: "RETAIN", subject: { kind: "ANIMAL", animalId: B } })])).toBe("ACTIVE");
    expect(status([goal("SYNTH-GOAL-1", { goalType: "SALE" }), goal("SYNTH-GOAL-2", { goalType: "RETAIN", subject: { kind: "SCOPE", scopeRef: "SYNTH-SCOPE-1" } })])).toBe("ACTIVE");
    const p = ok(project([goal("SYNTH-GOAL-1", { goalType: "FINISHING" }), goal("SYNTH-GOAL-2", { goalType: "BREEDING" })]));
    expect(p.status).toBe("ACTIVE");
    expect(activeIds(p)).toEqual(["SYNTH-GOAL-1@v1", "SYNTH-GOAL-2@v1"]);
  });

  it("the same type with different declared outcomes conflicts; identical outcomes do not", () => {
    const a = goal("SYNTH-GOAL-1", { targetWeight: { value: 500, unit: "KILOGRAM" } });
    expect(ok(project([a, goal("SYNTH-GOAL-2", { targetWeight: { value: 600, unit: "KILOGRAM" } })])).conflicts.map((c) => c.kind)).toEqual(["SAME_TYPE_DIFFERENT_OUTCOME"]);
    expect(status([a, goal("SYNTH-GOAL-2", { targetWeight: { value: 500, unit: "KILOGRAM" } })])).toBe("ACTIVE");
  });

  it("competing versions of one goal in force ⇒ INTENT_CONFLICT (no latest-wins)", () => {
    const v2a = goal("SYNTH-GOAL-1", { version: "v2a", supersedesVersions: ["v1"], goalType: "SALE" });
    const v2b = goal("SYNTH-GOAL-1", { version: "v2b", supersedesVersions: ["v1"], goalType: "RETAIN", ...received(LATER) });
    const p = ok(project([goal("SYNTH-GOAL-1"), v2a, v2b]));
    expect(p.status).toBe("INTENT_CONFLICT");
    expect(p.conflicts.map((c) => [c.kind, c.goals.map((g) => g.version)])).toEqual([["COMPETING_VERSIONS", ["v2a", "v2b"]]]);
    // Two unlinked live versions also compete.
    expect(status([goal("SYNTH-GOAL-1"), goal("SYNTH-GOAL-1", { version: "v2" })])).toBe("INTENT_CONFLICT");
  });
});

describe("C6 effective-period boundaries", () => {
  it("inclusive start, exclusive end, exact to the nanosecond", () => {
    const g = [goal("SYNTH-GOAL-1", { validTo: TO })];
    const start = cutoffMatrix(FROM);
    const end = cutoffMatrix(TO);
    expect(status(g, { effectiveAt: start.before })).toBe("NONE");
    expect(status(g, { effectiveAt: start.at })).toBe("ACTIVE");
    expect(status(g, { effectiveAt: end.before })).toBe("ACTIVE");
    expect(status(g, { effectiveAt: end.at })).toBe("NONE");
    for (const spelling of equivalentInstantSpellings(TO)) expect(status(g, { effectiveAt: spelling }), spelling).toBe("NONE");
  });
});

describe("C6 historical reproducibility", () => {
  const v1 = goal("SYNTH-GOAL-1");
  const v2 = goal("SYNTH-GOAL-1", { version: "v2", supersedesVersions: ["v1"], goalType: "SALE", ...received(LATER) });
  const early = cutoffMatrix(LATER).before;

  it("a later goal change never changes the projection or snapshot at an earlier cutoff", () => {
    const before = ok(project([v1], { knowledgeCutoff: early }));
    const after = ok(project([v1, v2], { knowledgeCutoff: early }));
    expect(after).toEqual(before);
    expect(after.snapshot).toEqual(before.snapshot);
    expect(ok(project([v1, v2], { knowledgeCutoff: LATER })).snapshot.fingerprint).not.toEqual(before.snapshot.fingerprint);
    // The old snapshot reproduces from the extended ledger.
    expect(verifyGoalSnapshotRef({ snapshot: before.snapshot, declarations: [v2, v1] }, hash)).toEqual({ valid: true, reasonCode: "CATTLE_GOAL_SNAPSHOT_REPRODUCED" });
    const tampered = { ...before.snapshot, status: "NONE" } as never;
    expect(verifyGoalSnapshotRef({ snapshot: tampered, declarations: [v1] }, hash).valid).toBe(false);
  });

  it("future knowledge is invisible, including late malformed records (kit)", () => {
    const evaluate = (records: readonly unknown[], knowledgeCutoff: string) => project(records, { knowledgeCutoff });
    const verdict = checkFutureKnowledgeInvisible(
      [
        { label: "later correction", known: [v1], later: [v2], knowledgeCutoff: early },
        { label: "later conflicting goal", known: [v1], later: [goal("SYNTH-GOAL-2", { goalType: "SALE", ...received(LATER) }), goal("SYNTH-GOAL-3", { goalType: "RETAIN", ...received(LATER) })], knowledgeCutoff: early },
        { label: "later malformed record", known: [v1], later: [goal("SYNTH-GOAL-9", { goalType: "NOT-A-TYPE", ...received(LATER) })], knowledgeCutoff: early },
        { label: "later same-id different content", known: [v1], later: [goal("SYNTH-GOAL-1", { goalType: "RETAIN", ...received(LATER) })], knowledgeCutoff: early },
        { label: "nothing known yet", known: [], later: [v1], knowledgeCutoff: cutoffMatrix(RECEIVED).before },
      ],
      evaluate,
    );
    expect(verdict).toEqual(CONFORMS);
  });

  it("a correction preserves history (kit)", () => {
    const verdict = checkCorrectionPreservesHistory(
      "goal correction",
      [v1],
      v2,
      { beforeCorrection: early, afterCorrection: LATER },
      (records, knowledgeCutoff) => ok(project(records, { knowledgeCutoff })),
      (p) => p.history.map((h) => `${h.declaration.goalId}@${h.declaration.version}`),
      "SYNTH-GOAL-1@v1",
    );
    expect(verdict).toEqual(CONFORMS);
  });

  it("a malformed knowledge time fails closed (kit)", () => {
    const verdict = checkMalformedKnowledgeTimeFailsClosed(
      "goal receivedAt",
      [goal("SYNTH-GOAL-2")],
      (value) => goal("SYNTH-GOAL-1", received(value)),
      (records) => project(records),
      (r) => r.ok && r.projection.status === "INVALID" && r.projection.issues.some((i) => i.code === "CATTLE_GOAL_RECORD_INVALID_KNOWLEDGE_TIME"),
    );
    expect(verdict).toEqual(CONFORMS);
  });

  it("malformed query times are rejected", () => {
    for (const m of MALFORMED_INSTANTS) {
      expect(project([], { effectiveAt: m.value as string }).ok, m.label).toBe(false);
      expect(project([], { knowledgeCutoff: m.value as string }).ok, m.label).toBe(false);
    }
  });
});

describe("C6 routing (registry as data, empty by default)", () => {
  const registry = (entries: unknown[]): GoalRoutingRegistry => ({ registryId: "SYNTH-REGISTRY", version: "r1", entries }) as never;
  const entry = (entryId: string, match: Rec, routes: Rec[], receivedAt = RECEIVED) => ({ entryId, receivedAt, match, routes });
  const route = (declarations: readonly unknown[], reg: GoalRoutingRegistry, q: Q = {}) => routeProductionGoals({ declarations, query: query(q), registry: reg }, hash);
  const routing = (declarations: readonly unknown[], reg: GoalRoutingRegistry, q: Q = {}) => {
    const r = route(declarations, reg, q);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.routing;
  };

  it("the empty production registry routes nothing", () => {
    expect(EMPTY_GOAL_ROUTING_REGISTRY.entries).toEqual([]);
    const r = routing([goal("SYNTH-GOAL-1")], EMPTY_GOAL_ROUTING_REGISTRY);
    expect(r.state).toBe("NO_ROUTED_RULES");
    expect(r.goals.map((g) => [g.goal.goalId, g.state, g.routes])).toEqual([["SYNTH-GOAL-1", "NO_ROUTED_RULES", []]]);
  });

  it("returns only explicitly registered ids, by exact type or goal id", () => {
    const reg = registry([
      entry("SYNTH-E1", { kind: "GOAL_TYPE", goalType: "FINISHING" }, [{ kind: "RULE", ruleId: "SYNTH-RULE-1", version: 2 }, { kind: "TARGET", targetId: "SYNTH-TARGET-1" }]),
      entry("SYNTH-E2", { kind: "GOAL_ID", goalId: "SYNTH-GOAL-1" }, [{ kind: "RULE", ruleId: "SYNTH-RULE-1", version: 2 }, { kind: "RULE", ruleId: "SYNTH-RULE-2", version: 1 }]),
      entry("SYNTH-E3", { kind: "GOAL_TYPE", goalType: "SALE" }, [{ kind: "RULE", ruleId: "SYNTH-RULE-9", version: 1 }]),
      entry("SYNTH-E4", { kind: "GOAL_TYPE", goalType: "FINISHING" }, [{ kind: "RULE", ruleId: "SYNTH-RULE-LATE", version: 1 }], LATER),
    ]);
    const r = routing([goal("SYNTH-GOAL-1"), goal("SYNTH-GOAL-2", { goalType: "BREEDING" })], reg, { knowledgeCutoff: cutoffMatrix(LATER).before });
    expect(r.state).toBe("ROUTED");
    expect(r.admittedEntries.map((e) => e.entryId)).toEqual(["SYNTH-E1", "SYNTH-E2", "SYNTH-E3"]);
    expect(r.goals).toEqual([
      {
        goal: { goalId: "SYNTH-GOAL-1", version: "v1" },
        goalType: "FINISHING",
        state: "ROUTED",
        entryIds: ["SYNTH-E1", "SYNTH-E2"],
        routes: [
          { kind: "RULE", ruleId: "SYNTH-RULE-1", version: 2 },
          { kind: "RULE", ruleId: "SYNTH-RULE-2", version: 1 },
          { kind: "TARGET", targetId: "SYNTH-TARGET-1" },
        ],
      },
      { goal: { goalId: "SYNTH-GOAL-2", version: "v1" }, goalType: "BREEDING", state: "NO_ROUTED_RULES", entryIds: [], routes: [] },
    ]);
    // A later registered entry is visible only from its knowledge time.
    expect(routing([goal("SYNTH-GOAL-1")], reg).goals[0].routes).toContainEqual({ kind: "RULE", ruleId: "SYNTH-RULE-LATE", version: 1 });
  });

  it("unresolved or absent goals are never routed", () => {
    const reg = registry([entry("SYNTH-E1", { kind: "GOAL_TYPE", goalType: "SALE" }, [{ kind: "RULE", ruleId: "SYNTH-RULE-1", version: 1 }])]);
    expect(routing([], reg).state).toBe("NO_ACTIVE_GOAL");
    const conflicting = routing([goal("SYNTH-GOAL-1", { goalType: "SALE" }), goal("SYNTH-GOAL-2", { goalType: "RETAIN" })], reg);
    expect([conflicting.state, conflicting.goals]).toEqual(["GOAL_INTENT_CONFLICT", []]);
    expect(routing([goal("SYNTH-GOAL-1", { goalType: "BAD" })], reg).state).toBe("GOAL_INVALID");
  });

  it("a malformed registry or entry fails closed; identity before validity", () => {
    const good = entry("SYNTH-E1", { kind: "GOAL_TYPE", goalType: "FINISHING" }, [{ kind: "RULE", ruleId: "SYNTH-RULE-1", version: 1 }]);
    const cases: [string, unknown][] = [
      ["no registry id", { version: "r1", entries: [] }],
      ["unknown match kind", registry([entry("SYNTH-E1", { kind: "ANIMAL_SEX", value: "F" }, [{ kind: "RULE", ruleId: "SYNTH-RULE-1", version: 1 }])])],
      ["executable route", registry([{ ...good, routes: [{ kind: "RULE", ruleId: "SYNTH-RULE-1", version: 1, evaluate: "x" }] }])],
      ["rule version not an integer", registry([{ ...good, routes: [{ kind: "RULE", ruleId: "SYNTH-RULE-1", version: "1" }] }])],
      ["empty routes", registry([{ ...good, routes: [] }])],
      ["malformed knowledge time", registry([{ ...good, receivedAt: "2026-01-01" }])],
      ["same id, different content", registry([good, { ...good, routes: [{ kind: "TARGET", targetId: "SYNTH-T" }] }])],
      ["same id, invalid copy", registry([good, { ...good, match: { kind: "GOAL_TYPE", goalType: "NOPE" } }])],
    ];
    for (const [label, reg] of cases) expect(route([goal("SYNTH-GOAL-1")], reg as GoalRoutingRegistry).ok, label).toBe(false);
    expect(routing([goal("SYNTH-GOAL-1")], registry([good, good])).goals[0].entryIds).toEqual(["SYNTH-E1"]);
  });
});

describe("C6 ↔ C5 target applicability (explicit goal ref only)", () => {
  const SOURCE_REF = { sourceId: "SYNTH-SRC-TARGETS", version: "v1", contentFingerprint: computeSourceContentFingerprint({ text: "synthetic target table" }, hash) };
  const target = (targetId: string, goalRef: string | null, fields: Rec = {}) => ({
    targetId,
    version: "v1",
    metric: { kind: "ADG", valueKgPerDay: 1 },
    applicability: goalRef === null ? {} : { goalRef },
    validFrom: "2025-01-01T00:00:00Z",
    reviewState: "PRODUCTION",
    provenance: { sourceRef: SOURCE_REF, receivedAt: RECEIVED },
    ...fields,
  });
  const TARGETS = [
    target("SYNTH-T-TYPE", goalTypeRef("FINISHING")),
    target("SYNTH-T-ID", "SYNTH-GOAL-1"),
    target("SYNTH-T-SALE", goalTypeRef("SALE")),
    target("SYNTH-T-ANY", null),
    target("SYNTH-T-CASE", "cattle_goal_type:FINISHING"),
    target("SYNTH-T-BARE", "FINISHING"),
  ];
  function performanceOf(targets: unknown[], effectiveAt = EFFECTIVE, knowledgeCutoff = CUTOFF): PerformanceEvaluation {
    const contract = buildWeightReadContract({ observations: [], scope: { kind: "EXPLICIT_SET", animalIds: [A] }, query: { effectiveAt, knowledgeCutoff } }, hash);
    if (!contract.ok) throw new Error(JSON.stringify(contract.issues));
    const r = evaluatePerformance({ weights: contract.contract, query: { effectiveAt, knowledgeCutoff }, targets, policies: [], contexts: [] }, hash);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.evaluation;
  }
  const PERF = performanceOf(TARGETS);
  const resolve = (declarations: readonly unknown[], performance: unknown = PERF, q: Q = {}) => resolveGoalTargetApplicability({ declarations, query: query(q), performance: performance as PerformanceEvaluation }, hash);
  const states = (declarations: readonly unknown[]) => {
    const r = resolve(declarations);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return Object.fromEntries(r.applicability.targets.map((t) => [t.targetId, t.state]));
  };

  it("matches by exact goal id or goal-type ref only", () => {
    const r = resolve([goal("SYNTH-GOAL-1")]);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(Object.fromEntries(r.applicability.targets.map((t) => [t.targetId, [t.state, t.matchedGoals.map((m) => m.matchedBy)]]))).toEqual({
      "SYNTH-T-ANY": ["NOT_GOAL_SPECIFIC", []],
      "SYNTH-T-BARE": ["NOT_APPLICABLE", []],
      "SYNTH-T-CASE": ["NOT_APPLICABLE", []],
      "SYNTH-T-ID": ["APPLICABLE", ["GOAL_ID"]],
      "SYNTH-T-SALE": ["NOT_APPLICABLE", []],
      "SYNTH-T-TYPE": ["APPLICABLE", ["GOAL_TYPE"]],
    });
    expect(r.applicability.snapshot.goals).toEqual([{ goalId: "SYNTH-GOAL-1", version: "v1" }]);
    expect(r.applicability.performanceFingerprint).toEqual(PERF.fingerprint);
  });

  it("no goal ⇒ NOT_APPLICABLE; unresolved goals ⇒ never APPLICABLE / NOT_APPLICABLE", () => {
    expect(states([])["SYNTH-T-TYPE"]).toBe("NOT_APPLICABLE");
    const conflict = states([goal("SYNTH-GOAL-1", { goalType: "SALE" }), goal("SYNTH-GOAL-2", { goalType: "RETAIN" })]);
    const invalid = states([goal("SYNTH-GOAL-1", { goalType: "BAD" })]);
    expect(conflict["SYNTH-T-SALE"]).toBe("GOAL_INTENT_CONFLICT");
    expect(invalid["SYNTH-T-TYPE"]).toBe("GOAL_INVALID");
    expect(conflict["SYNTH-T-ANY"]).toBe("NOT_GOAL_SPECIFIC");
    // A SYSTEM suggestion never makes a target applicable.
    expect(states([goal("SYNTH-GOAL-1", { declaredBy: { actor: "SYNTH-ENGINE", role: "SYSTEM" } })])["SYNTH-T-ID"]).toBe("NOT_APPLICABLE");
  });

  it("conflicting C5 target versions stay a conflict", () => {
    const perf = performanceOf([target("SYNTH-T-X", goalTypeRef("FINISHING")), target("SYNTH-T-X", goalTypeRef("SALE"), { version: "v2" })]);
    const r = resolve([goal("SYNTH-GOAL-1")], perf);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.applicability.targets.map((t) => [t.state, t.targetVersions.map((v) => v.goalRef)])).toEqual([
      ["TARGET_EVIDENCE_CONFLICT", [goalTypeRef("FINISHING"), goalTypeRef("SALE")]],
    ]);
  });

  it("an unverifiable C5 evaluation, another viewpoint or a non-animal subject fails closed", () => {
    const tampered = JSON.parse(JSON.stringify(PERF));
    tampered.targetDefinitions[0].versions[0].applicability.goalRef = goalTypeRef("SALE");
    expect(resolve([goal("SYNTH-GOAL-1")], tampered)).toEqual({ ok: false, issues: [{ code: "CATTLE_GOAL_TARGET_PERFORMANCE_INVALID", ref: null }] });
    expect(resolve([goal("SYNTH-GOAL-1")], { ...PERF, fingerprint: { ...PERF.fingerprint, digest: "0".repeat(64) } }).ok).toBe(false);
    expect(resolve([goal("SYNTH-GOAL-1")], performanceOf(TARGETS, TO))).toEqual({ ok: false, issues: [{ code: "CATTLE_GOAL_TARGET_PERFORMANCE_TIME_MISMATCH", ref: null }] });
    expect(resolve([goal("SYNTH-GOAL-1")], PERF, { subject: { kind: "SCOPE", scopeRef: "SYNTH-SCOPE-1" } })).toEqual({ ok: false, issues: [{ code: "CATTLE_GOAL_TARGET_SUBJECT_NOT_ANIMAL", ref: null }] });
  });

  it("malformed target evidence under a recomputed fingerprint fails closed", () => {
    const refingerprinted = (mutate: (version: Rec) => void) => {
      const copy = JSON.parse(JSON.stringify(PERF));
      const definition = copy.targetDefinitions.find((d: Rec) => d.targetId === "SYNTH-T-ID");
      mutate(definition.versions[0]);
      delete copy.fingerprint;
      return { ...copy, fingerprint: computePerformanceFingerprint("CATTLE_PERFORMANCE_RESULT", copy, hash) };
    };
    const invalid = { ok: false, issues: [{ code: "CATTLE_GOAL_TARGET_PERFORMANCE_INVALID", ref: null }] };
    const cases: [string, (v: Rec) => void][] = [
      ["missing goalRef", (v) => delete (v.applicability as Rec).goalRef],
      ["malformed receivedAt", (v) => ((v.provenance as Rec).receivedAt = "not-an-instant")],
      ["receivedAt after the cutoff", (v) => ((v.provenance as Rec).receivedAt = "2026-07-01T00:00:00.000000000Z")],
      ["missing provenance source", (v) => delete (v.provenance as Rec).sourceRef],
      ["missing validFrom", (v) => delete v.validFrom],
      ["unsupported field", (v) => (v.extra = "SYNTH-X")],
    ];
    for (const [label, mutate] of cases) expect(resolve([goal("SYNTH-GOAL-1")], refingerprinted(mutate)), label).toEqual(invalid);
    expect(resolve([goal("SYNTH-GOAL-1")], refingerprinted(() => undefined)).ok).toBe(true);
  });

  // CAT-INV-014/023/024: C5 owns target validation; C6 consumes it and keeps no
  // copy. Whole-class matrix: whatever C5 `materialisePerformanceTarget`
  // rejects, C6 must never turn into an applicability result.
  it("C6 agrees with C5 target validation (ownership boundary matrix)", () => {
    const withValidProvenance = { provenance: { sourceRef: SOURCE_REF, ruleRef: { ruleId: "SYNTH-RULE", version: 1 }, receivedAt: RECEIVED, actor: "SYNTH-ACTOR" } };
    const perf = performanceOf([target("SYNTH-T-ID", "SYNTH-GOAL-1", withValidProvenance)]);
    const refingerprinted = (mutate: (version: Rec) => void) => {
      const copy = JSON.parse(JSON.stringify(perf));
      mutate(copy.targetDefinitions[0].versions[0]);
      delete copy.fingerprint;
      return { evidence: copy.targetDefinitions[0].versions[0] as Rec, performance: { ...copy, fingerprint: computePerformanceFingerprint("CATTLE_PERFORMANCE_RESULT", copy, hash) } };
    };
    const prov = (v: Rec) => v.provenance as Rec;
    const rejectedByC5: [string, (v: Rec) => void][] = [
      ["ruleRef.version 0", (v) => (prov(v).ruleRef = { ruleId: "SYNTH-R", version: 0 })],
      ["ruleRef.version fractional", (v) => (prov(v).ruleRef = { ruleId: "SYNTH-R", version: 1.5 })],
      ["ruleRef.version string", (v) => (prov(v).ruleRef = { ruleId: "SYNTH-R", version: "1" })],
      ["ruleRef.ruleId empty", (v) => (prov(v).ruleRef = { ruleId: "", version: 1 })],
      ["ruleRef.ruleId number", (v) => (prov(v).ruleRef = { ruleId: 7, version: 1 })],
      ["ruleRef extra field", (v) => (prov(v).ruleRef = { ruleId: "SYNTH-R", version: 1, extra: "SYNTH-X" })],
      ["ruleRef not an object", (v) => (prov(v).ruleRef = "SYNTH-R@1")],
      ["actor number", (v) => (prov(v).actor = 42)],
      ["actor empty", (v) => (prov(v).actor = "")],
      ["actor object", (v) => (prov(v).actor = { id: "SYNTH-ACTOR" })],
      ["sourceRef missing", (v) => delete prov(v).sourceRef],
      ["sourceRef null", (v) => (prov(v).sourceRef = null)],
      ["sourceRef.version empty", (v) => (prov(v).sourceRef = { ...SOURCE_REF, version: "" })],
      ["sourceRef.contentFingerprint digest", (v) => (prov(v).sourceRef = { ...SOURCE_REF, contentFingerprint: { ...SOURCE_REF.contentFingerprint, digest: "XYZ" } })],
      ["sourceRef.contentFingerprint algorithm", (v) => (prov(v).sourceRef = { ...SOURCE_REF, contentFingerprint: { ...SOURCE_REF.contentFingerprint, algorithm: "MD5" } })],
      ["sourceRef extra field", (v) => (prov(v).sourceRef = { ...SOURCE_REF, extra: "SYNTH-X" })],
      ["receivedAt malformed", (v) => (prov(v).receivedAt = "not-an-instant")],
      ["receivedAt number", (v) => (prov(v).receivedAt = 0)],
      ["provenance extra field", (v) => (prov(v).extra = "SYNTH-X")],
      ["provenance null", (v) => (v.provenance = null)],
      ["provenance array", (v) => (v.provenance = [])],
      ["reviewState unknown", (v) => (v.reviewState = "SYNTH-STATE")],
      ["metric malformed", (v) => (v.metric = { kind: "ADG", valueKgPerDay: "1" })],
    ];
    const invalid = { ok: false, issues: [{ code: "CATTLE_GOAL_TARGET_PERFORMANCE_INVALID", ref: null }] };
    for (const [label, mutate] of rejectedByC5) {
      const { evidence, performance } = refingerprinted(mutate);
      expect(materialisePerformanceTarget(evidence).ok, `C5 rejects: ${label}`).toBe(false);
      expect(resolve([goal("SYNTH-GOAL-1")], performance), `C6 fails closed: ${label}`).toEqual(invalid);
    }

    // C6-owned rules still apply to evidence C5 accepts.
    const c6Owned: [string, (v: Rec) => void][] = [
      ["version of another target", (v) => (v.targetId = "SYNTH-T-OTHER")],
      ["received after the cutoff", (v) => (prov(v).receivedAt = "2026-07-01T00:00:00.000000000Z")],
      ["not C5's materialised form (instant spelling)", (v) => (prov(v).receivedAt = (prov(v).receivedAt as string).replace(".000000000Z", "Z"))],
    ];
    for (const [label, mutate] of c6Owned) {
      const { evidence, performance } = refingerprinted(mutate);
      expect(materialisePerformanceTarget(evidence).ok, `C5 accepts: ${label}`).toBe(true);
      expect(resolve([goal("SYNTH-GOAL-1")], performance), `C6 fails closed: ${label}`).toEqual(invalid);
    }

    // A valid C5 target (with ruleRef and actor) stays consumable, deterministically.
    const first = resolve([goal("SYNTH-GOAL-1")], perf);
    if (!first.ok) throw new Error(JSON.stringify(first.issues));
    expect(first.applicability.targets.map((t) => [t.targetId, t.state])).toEqual([["SYNTH-T-ID", "APPLICABLE"]]);
    expect(resolve([goal("SYNTH-GOAL-1")], perf)).toEqual(first);
    expect(resolve([goal("SYNTH-GOAL-1")], refingerprinted(() => undefined).performance)).toEqual(first);
  });
});

describe("C6 conformance: intent class, order, detachment, fingerprints, boundary", () => {
  const LEDGER = [
    goal("SYNTH-GOAL-1"),
    goal("SYNTH-GOAL-1", { version: "v2", supersedesVersions: ["v1"], targetWeight: { value: 610, unit: "KILOGRAM" }, ...received(LATER) }),
    goal("SYNTH-GOAL-2", { goalType: "BREEDING" }),
    goal("SYNTH-GOAL-3", { goalType: "SALE", subject: { kind: "ANIMAL", animalId: B } }),
    goal("SYNTH-GOAL-S", { declaredBy: { actor: "SYNTH-ENGINE", role: "SYSTEM" } }),
  ];

  it("intent is never presented as fact", () => {
    const p = ok(project(LEDGER));
    const classes = [...p.inForce, ...p.activeGoals, ...p.suggestions, ...p.history].map((g) => g.informationClass);
    expect(classes.length).toBeGreaterThan(0);
    expect(new Set(classes)).toEqual(new Set(["INTENT"]));
  });

  it("input order never changes the projection or routing (kit)", () => {
    expect(checkOrderIndependence("projection", LEDGER, (records) => project(records))).toEqual(CONFORMS);
    expect(checkOrderIndependence("routing", LEDGER, (records) => routeProductionGoals({ declarations: records, query: query(), registry: EMPTY_GOAL_ROUTING_REGISTRY }, hash))).toEqual(CONFORMS);
  });

  it("results are detached and deep-frozen (kit)", () => {
    const verdict = checkDetachedResult(
      "projection",
      () => ({ declarations: LEDGER.map((r) => structuredClone(r)), query: query() }),
      (input) => projectProductionGoals(input, hash),
      (input) => {
        (input.declarations[0] as Rec).goalType = "SALE";
        (input.query as Rec).effectiveAt = TO;
      },
    );
    expect(verdict).toEqual(CONFORMS);
    expect(isDeepFrozen(route0())).toBe(true);
    expect(isDeepFrozen(project([{}]))).toBe(true);
  });
  const route0 = () => routeProductionGoals({ declarations: LEDGER, query: query(), registry: EMPTY_GOAL_ROUTING_REGISTRY }, hash);

  it("snapshot fingerprints: equivalent variants keep it, material variants change it (kit)", () => {
    const fp = (v: { records: Rec[]; q?: Q }) => ok(project(v.records, v.q)).snapshot.fingerprint.digest;
    const base = { records: [goal("SYNTH-GOAL-1", { targetWeight: { value: 600, unit: "KILOGRAM" } }), goal("SYNTH-GOAL-2", { goalType: "BREEDING" })] };
    const [g1, g2] = base.records;
    const verdict = checkFingerprintStability(
      "goal snapshot",
      base,
      [
        { label: "input order", payload: { records: [g2, g1] } },
        { label: "key order", payload: { records: [Object.fromEntries(Object.entries(g1).reverse()), g2] } },
        { label: "instant spelling", payload: { records: [{ ...g1, validFrom: "2026-01-01T00:00:00.000Z" }, g2], q: { effectiveAt: "2026-02-01T00:00:00.000000Z" } } },
        { label: "a record for another subject", payload: { records: [...base.records, goal("SYNTH-GOAL-9", { subject: { kind: "ANIMAL", animalId: B } })] } },
        { label: "a goal outside its period", payload: { records: [...base.records, goal("SYNTH-GOAL-9", { validFrom: TO })] } },
      ],
      [
        { label: "goal type", payload: { records: [{ ...g1, goalType: "REPLACEMENT" }, g2] } },
        { label: "target weight", payload: { records: [{ ...g1, targetWeight: { value: 601, unit: "KILOGRAM" } }, g2] } },
        { label: "target weight unit", payload: { records: [{ ...g1, targetWeight: { value: 600, unit: "POUND" } }, g2] } },
        { label: "version", payload: { records: [{ ...g1, version: "v1b" }, g2] } },
        { label: "declarer", payload: { records: [{ ...g1, declaredBy: { actor: "SYNTH-VET-1", role: "VETERINARIAN" } }, g2] } },
        { label: "knowledge time", payload: { records: [{ ...g1, ...received("2025-12-02T00:00:00Z") }, g2] } },
        { label: "effectiveAt", payload: { ...base, q: { effectiveAt: "2026-02-02T00:00:00Z" } } },
        { label: "knowledgeCutoff", payload: { ...base, q: { knowledgeCutoff: "2026-06-02T00:00:00Z" } } },
        { label: "goal removed", payload: { records: [g1] } },
      ],
      fp,
    );
    expect(verdict).toEqual(CONFORMS);
    const p = ok(project(base.records));
    expect(p.snapshot.fingerprint.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(p.fingerprint.digest).not.toEqual(p.snapshot.fingerprint.digest);
    const { fingerprint, ...content } = p;
    expect(cattle.verifyGoalFingerprint("CATTLE_GOAL_PROJECTION", content, fingerprint, hash).valid).toBe(true);
  });

  it("unresolved goal evidence never surfaces as a resolved-looking state (kit)", () => {
    const forbidden = [...RESOLVED_LOOKING_STATES, "ACTIVE", "NONE", "APPLICABLE", "NOT_APPLICABLE", "ROUTED", "NO_ROUTED_RULES", "NO_ACTIVE_GOAL"];
    const unresolved = [
      { label: "intent conflict", ledger: [goal("SYNTH-GOAL-1", { goalType: "SALE" }), goal("SYNTH-GOAL-2", { goalType: "RETAIN" })] },
      { label: "competing versions", ledger: [goal("SYNTH-GOAL-1"), goal("SYNTH-GOAL-1", { version: "v2" })] },
      { label: "malformed knowledge time", ledger: [goal("SYNTH-GOAL-1", received("2026-01-01"))] },
      { label: "malformed content", ledger: [goal("SYNTH-GOAL-1", { goalType: "NOPE" })] },
    ];
    const cases = unresolved.map((u) => {
      const p = ok(project(u.ledger));
      const r = route0For(u.ledger);
      return { label: u.label, result: [p.status, p.snapshot.status, r.state, ...p.activeGoals.map(() => "ACTIVE_GOAL_LISTED")] };
    });
    expect(checkUnresolvedEvidenceNotMasked(cases, (r) => r, [...forbidden, "ACTIVE_GOAL_LISTED"])).toEqual(CONFORMS);
  });
  const route0For = (ledger: unknown[]) => {
    const r = routeProductionGoals({ declarations: ledger, query: query(), registry: EMPTY_GOAL_ROUTING_REGISTRY }, hash);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.routing;
  };

  it("non-canonical input is rejected before evaluation, at collection and element level", () => {
    let reads = 0;
    const withGetter = Object.defineProperty(goal("SYNTH-GOAL-1"), "goalType", { get: () => (reads++, "FINISHING"), enumerable: true });
    const collection = [goal("SYNTH-GOAL-1")];
    Object.defineProperty(collection, "extra", { get: () => (reads++, 1), enumerable: false });
    const cases: [string, unknown][] = [
      ["element getter", [withGetter]],
      ["collection hidden accessor", collection],
      ["class instance", [goal("SYNTH-GOAL-1", { validFrom: new Date(0) })]],
      ["function", [goal("SYNTH-GOAL-1", { goalType: () => "FINISHING" })]],
    ];
    for (const [label, declarations] of cases) {
      const r = projectProductionGoals({ declarations: declarations as unknown[], query: query() }, hash);
      expect(r.ok, label).toBe(false);
      if (!r.ok) expect(r.issues[0].code, label).toBe("CATTLE_GOAL_NON_CANONICAL_INPUT");
      expect(routeProductionGoals({ declarations: declarations as unknown[], query: query(), registry: EMPTY_GOAL_ROUTING_REGISTRY }, hash).ok, label).toBe(false);
    }
    expect(reads).toBe(0);
    const getterRegistry = Object.defineProperty({ registryId: "SYNTH-R", version: "1" }, "entries", { get: () => (reads++, []), enumerable: true });
    expect(routeProductionGoals({ declarations: [], query: query(), registry: getterRegistry as never }, hash).ok).toBe(false);
    expect(reads).toBe(0);
  });
});

describe("C6 boundaries", () => {
  it("no clock, network, AI, tooling, raw C4/C5 module or later-phase dependency", () => {
    const dir = __dirname;
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sources.length).toBeGreaterThanOrEqual(6);
    for (const f of sources) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/Date\.now|new Date\(|performance\.now|Math\.random|fetch\(|XMLHttpRequest|openai|anthropic|@\/tooling|src\/tooling/);
      expect(text, f).not.toMatch(/from "[^"]*livestock"|from "\.\.\/(programmes|recommendations|plan-interface|presentation)|from "\.\.\/\.\.\/types"/);
      // Predecessor outputs only through the C4 / C5 barrels — except C5's own
      // target validator, which C6 consumes rather than copies (CAT-INV-014/024).
      const OWNED_VALIDATOR = 'import { materialisePerformanceTarget } from "../performance/performance-definitions";';
      expect(text.replace(OWNED_VALIDATOR, ""), f).not.toMatch(/weights\/(weight-observation|weight-series|group-scope|weight-read-contract)|performance\/performance-/);
    }
    const applicability = readFileSync(join(dir, "goal-target-applicability.ts"), "utf8");
    expect(applicability).toContain('import { materialisePerformanceTarget } from "../performance/performance-definitions";');
    // No shadow copy of C5's target / provenance schema.
    expect(applicability).not.toMatch(/PROVENANCE_FIELDS|TARGET_FIELDS|sourceVersionRefOf|ruleRefOf|\.ruleRef\b|\.actor\b/);
  });

  it("the public entry points are reachable through the cattle barrel; trusting helpers are not", () => {
    for (const name of ["projectProductionGoals", "verifyGoalSnapshotRef", "routeProductionGoals", "resolveGoalTargetApplicability", "computeGoalFingerprint", "goalTypeRef"]) {
      expect(typeof (cattle as Rec)[name], name).toBe("function");
    }
    for (const name of ["admitGoalDeclarations", "materialiseGoalDeclaration", "projectCanonicalGoals", "readGoalRequest"]) {
      expect(name in cattle, name).toBe(false);
    }
  });
});
