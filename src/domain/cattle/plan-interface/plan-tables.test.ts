/**
 * Cattle C9 — the compiled translation tables are total over the frozen
 * upstream vocabularies (matrix rows 1–5) and exhaustive at runtime: a value
 * outside a table is `undefined` (the caller fails closed), never a default.
 */

import { describe, expect, it } from "vitest";
import type { CattleEvaluationState } from "../evaluation";
import { PROGRAMME_OCCURRENCE_STATES } from "../programmes";
import { DEFAULT_CANDIDATE_ACTION_REGISTRY, RECOMMENDATION_PRIORITY_TIERS } from "../recommendations";
import { OBLIGATION_STATES } from "../regulatory";
import { c8KindPlan } from "./plan-work-items";
import {
  C2_STATE_PLAN,
  C7_STATE_PLAN,
  C8_DEFAULT_KIND_PLAN,
  C8_FOLD_WHITELIST,
  C8_MODELLED_TIER,
  C8_ORIGIN,
  C8_OUTCOME_PLAN,
  CATTLE_PLAN_VOCABULARY,
  GATE_STATE_STATUS,
  GOAL_EVIDENCE,
  MEMBERSHIP_PLAN,
  WEIGHT_EVIDENCE,
  completionContractFor,
  lookup,
} from "./plan-vocabulary";

describe("C9 tables — total over the frozen vocabularies (B6, D3, B2, D4)", () => {
  it("1. every C2 state maps per B6 (proposal / blocker / completion)", () => {
    expect(Object.keys(C2_STATE_PLAN).sort()).toEqual([...OBLIGATION_STATES].sort());
    const expected: Record<string, [boolean, string, string]> = {
      NOT_APPLICABLE: [false, "NONE", "NOT_EVIDENCED"],
      NOT_TRIGGERED: [false, "NONE", "NOT_EVIDENCED"],
      SATISFIED: [false, "NONE", "DONE"],
      SATISFIED_LATE: [false, "NONE", "DONE"],
      UPCOMING: [true, "NONE", "NOT_DONE"],
      OUTSTANDING: [true, "NONE", "NOT_DONE"],
      OVERDUE: [true, "NONE", "NOT_DONE"],
      ADVISORY_FAIL: [true, "NONE", "NOT_DONE"],
      BLOCKED: [true, "ACTIVE", "NOT_DONE"],
      UNKNOWN: [true, "UNKNOWN", "NOT_EVIDENCED"],
      INSUFFICIENT_EVIDENCE: [true, "UNKNOWN", "NOT_EVIDENCED"],
      EVIDENCE_CONFLICT: [true, "UNKNOWN", "NOT_EVIDENCED"],
      INVALID_EVIDENCE: [true, "UNKNOWN", "NOT_EVIDENCED"],
      UNSUPPORTED: [true, "UNKNOWN", "NOT_EVIDENCED"],
      REVIEW_REQUIRED: [true, "UNKNOWN", "NOT_EVIDENCED"],
    };
    expect(Object.keys(expected).sort()).toEqual([...OBLIGATION_STATES].sort());
    for (const [s, [proposal, blocker, completion]] of Object.entries(expected)) expect(C2_STATE_PLAN[s as keyof typeof C2_STATE_PLAN], s).toMatchObject({ proposal, blocker, completion });
    // Unresolved evidence never counts as completion and is evidence-resolution work.
    for (const [s, p] of Object.entries(C2_STATE_PLAN)) if (p.blocker === "UNKNOWN") expect([p.resolution, p.completion], s).toEqual(["UNRESOLVED", "NOT_EVIDENCED"]);
  });

  it("2. every C7 state maps per B6", () => {
    expect(Object.keys(C7_STATE_PLAN).sort()).toEqual([...PROGRAMME_OCCURRENCE_STATES].sort());
    const expected: Record<string, [boolean, string, string]> = {
      NOT_APPLICABLE: [false, "NONE", "NOT_EVIDENCED"],
      COMPLETED: [false, "NONE", "DONE"],
      UPCOMING: [true, "NONE", "NOT_DONE"],
      DUE: [true, "NONE", "NOT_DONE"],
      OVERDUE: [true, "NONE", "NOT_DONE"],
      BLOCKED: [true, "ACTIVE", "NOT_DONE"],
      UNKNOWN: [true, "UNKNOWN", "NOT_EVIDENCED"],
      INSUFFICIENT_EVIDENCE: [true, "UNKNOWN", "NOT_EVIDENCED"],
      EVIDENCE_CONFLICT: [true, "UNKNOWN", "NOT_EVIDENCED"],
      REVIEW_REQUIRED: [true, "UNKNOWN", "NOT_EVIDENCED"],
      INVALID_EVIDENCE: [true, "UNKNOWN", "NOT_EVIDENCED"],
    };
    for (const [s, [proposal, blocker, completion]] of Object.entries(expected)) expect(C7_STATE_PLAN[s as keyof typeof C7_STATE_PLAN], s).toMatchObject({ proposal, blocker, completion });
  });

  it("3. every C8 outcome and every consumed C8 action kind (unmapped kinds fail closed, no default tier)", () => {
    expect(Object.keys(C8_OUTCOME_PLAN).sort()).toEqual(["ACTIONABLE", "BLOCKED", "INSUFFICIENT_EVIDENCE", "NO_RECOMMENDATION", "REVIEW_REQUIRED"]);
    expect(C8_OUTCOME_PLAN.NO_RECOMMENDATION.proposal).toBe(false);
    expect(C8_OUTCOME_PLAN.ACTIONABLE).toMatchObject({ proposal: true, blocker: "NONE" });
    expect(C8_OUTCOME_PLAN.BLOCKED.blocker).toBe("ACTIVE");
    expect([C8_OUTCOME_PLAN.REVIEW_REQUIRED.blocker, C8_OUTCOME_PLAN.INSUFFICIENT_EVIDENCE.blocker]).toEqual(["UNKNOWN", "UNKNOWN"]);
    // Drift guard: the compiled kind table is exactly the default registry's kinds.
    expect(Object.keys(C8_DEFAULT_KIND_PLAN).sort()).toEqual(DEFAULT_CANDIDATE_ACTION_REGISTRY.definitions.map((d) => d.actionKind).sort());
    expect(Object.fromEntries(Object.entries(C8_DEFAULT_KIND_PLAN).map(([k, v]) => [k, v.tier]))).toEqual({
      RECORD_WEIGHT: "INFORMATION_VALUE",
      DECLARE_PRODUCTION_GOAL: "INFORMATION_VALUE",
      REVIEW_WITHDRAWAL_STATUS: "INFORMATION_VALUE",
      RESOLVE_OBLIGATION_EVIDENCE: "INFORMATION_VALUE",
      COMPLETE_PROGRAMME_ACTION: "ROUTINE_MANAGEMENT",
    });
    expect(Object.keys(C8_MODELLED_TIER).sort()).toEqual([...RECOMMENDATION_PRIORITY_TIERS].sort());
    expect(c8KindPlan("SYNTH-SELL", "MODELLED", "EXPECTED_NET_RETURN")?.tier).toBe("EXPECTED_NET_RETURN");
    expect(c8KindPlan("SYNTH-SELL", "MODELLED", "VALUE_OF_INFORMATION")?.tier).toBe("INFORMATION_VALUE");
    expect(c8KindPlan("SYNTH-SELL", "MODELLED", "AVOID_MATERIAL_LOSS")?.tier).toBe("AVOID_MATERIAL_LOSS");
    expect(c8KindPlan("SYNTH-SELL", "MODELLED", "SAFETY_LEGAL_WELFARE")).toBeNull();
    expect(c8KindPlan("SYNTH-SELL", "MODELLED", "SYNTH-UNKNOWN-TIER")).toBeNull();
    expect(c8KindPlan("SYNTH-GAP", "NONE", "VALUE_OF_INFORMATION")).toBeNull();
    // A default kind keeps its compiled tier whatever the registry declares (a SAFETY label never makes HARD_OBLIGATION).
    expect(c8KindPlan("RESOLVE_OBLIGATION_EVIDENCE", "NONE", "SAFETY_LEGAL_WELFARE")?.tier).toBe("INFORMATION_VALUE");
    expect(C8_ORIGIN).toEqual({ NONE: "DATA_GAP", MODELLED: "RECOMMENDATION" });
    expect(C8_FOLD_WHITELIST).toEqual({ RESOLVE_OBLIGATION_EVIDENCE: "C2_OBLIGATION", COMPLETE_PROGRAMME_ACTION: "C7_PROGRAMME" });
  });

  it("4. every C0 gate state maps to a Plan blocker status (D3)", () => {
    const states: (CattleEvaluationState | "NOT_EVALUATED" | "NOT_SUPPLIED")[] = ["PASS", "FAIL", "INSUFFICIENT_EVIDENCE", "NOT_APPLICABLE", "CONFLICTING_EVIDENCE", "UNSUPPORTED", "REVIEW_REQUIRED", "NOT_EVALUATED", "NOT_SUPPLIED"];
    expect(Object.keys(GATE_STATE_STATUS).sort()).toEqual([...states].sort());
    expect(states.map((s) => GATE_STATE_STATUS[s])).toEqual(["CLEARED", "ACTIVE", "UNKNOWN", "CLEARED", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"]);
  });

  it("5. every C4 membership state maps all-or-unknown (B2); C4 / C6 evidence states are total", () => {
    expect(MEMBERSHIP_PLAN).toEqual({ MEMBER: "MEMBER", NOT_MEMBER: "NOT_MEMBER", UNKNOWN: "UNRESOLVED", EVIDENCE_CONFLICT: "UNRESOLVED", INVALID: "UNRESOLVED" });
    expect(WEIGHT_EVIDENCE).toEqual({ KNOWN: "OBSERVED", NONE: "NO_OBSERVATION", EVIDENCE_CONFLICT: "UNRESOLVED", UNSUPPORTED: "UNRESOLVED" });
    expect(GOAL_EVIDENCE).toEqual({ ACTIVE: "PRESENT", NONE: "MISSING", INTENT_CONFLICT: "UNRESOLVED", INVALID: "UNRESOLVED" });
  });

  it("runtime exhaustiveness: a value outside a table is undefined (fail closed), never a prototype or default value", () => {
    for (const table of [C2_STATE_PLAN, C7_STATE_PLAN, C8_OUTCOME_PLAN, GATE_STATE_STATUS, MEMBERSHIP_PLAN, C8_DEFAULT_KIND_PLAN, C8_MODELLED_TIER] as Record<string, unknown>[]) {
      for (const key of ["SYNTH-NOT-A-STATE", "toString", "__proto__", "constructor", "", null, undefined, 1]) expect(lookup(table, key)).toBeUndefined();
    }
  });

  it("the vocabulary table: one completion contract per row and identity; MANUAL is the only fallback", () => {
    const id = { identityKey: "SYNTH-IDENTITY", animalId: "SYNTH-ANIMAL-1", windowed: true };
    expect(completionContractFor("C2_OBLIGATION", id, "2026-03-05T00:00:00Z")).toEqual({ kind: "OPERATIONAL_RECORD", recordKind: "CATTLE_PLAN_COMPLETION:SYNTH-IDENTITY", coverage: "EACH_MEMBER", notBeforeIso: null });
    expect(completionContractFor("C7_PROGRAMME_ACTION", { ...id, windowed: false }, "2026-03-05T00:00:00Z")).toEqual({ kind: "MANUAL" });
    expect(completionContractFor("C8_RECORD_WEIGHT", id, "2026-03-05T00:00:00Z")).toEqual({ kind: "OPERATIONAL_RECORD", recordKind: "CATTLE_WEIGHT_OBSERVATION:SYNTH-ANIMAL-1", coverage: "EACH_MEMBER", notBeforeIso: "2026-03-05T00:00:00Z" });
    expect(completionContractFor("C8_DECLARE_PRODUCTION_GOAL", id, "2026-03-05T00:00:00Z")).toEqual({ kind: "DATA_COMPLETION", requirementKey: "CATTLE_PRODUCTION_GOAL_IN_FORCE" });
    for (const row of ["C8_REVIEW_WITHDRAWAL_STATUS", "C8_RESOLVE_OBLIGATION_EVIDENCE", "C8_COMPLETE_PROGRAMME_ACTION", "C8_MODELLED_ACTION"] as const) expect(completionContractFor(row, id, "2026-03-05T00:00:00Z")).toEqual({ kind: "MANUAL" });
    for (const [rowId, row] of Object.entries(CATTLE_PLAN_VOCABULARY)) expect(row.completion === "MANUAL" ? row.provenBy.length === 0 : row.provenBy.length > 0, rowId).toBe(true);
    for (const { row } of Object.values(C8_DEFAULT_KIND_PLAN)) expect(CATTLE_PLAN_VOCABULARY[row].family).toBe("C8_RECOMMENDATION");
  });
});
