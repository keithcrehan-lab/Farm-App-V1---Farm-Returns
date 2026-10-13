/**
 * Cattle C5 — performance engine. Synthetic data only: every animal, group,
 * source, target, policy, threshold and weight is a fictional `SYNTH-*`
 * fixture with no biological meaning.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONFORMS,
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
import { createAnimalLedger, type AnimalLedger } from "../animal-ledger";
import * as cattle from "../index";
import { computeSourceContentFingerprint } from "../source";
import { hash } from "../test-fixtures";
import { buildWeightReadContract, type WeightReadContract } from "../weights";
import { elapsedDaysOf, exactElapsed } from "./elapsed-time";
import { derivePerformanceInterval, type DerivationPolicies, type PerformancePoint } from "./performance-derivation";
import { evaluatePerformance, type AnimalPerformance, type PerformanceEvaluation, type PerformanceResult } from "./performance-engine";

const A = "SYNTH-ANIMAL-1";
const B = "SYNTH-ANIMAL-2";
const C = "SYNTH-ANIMAL-3";
const D = "SYNTH-ANIMAL-4";
const G = "SYNTH-GROUP-G";
const D0 = "2026-01-01T00:00:00Z";
const D90 = "2026-04-01T00:00:00Z"; // exactly 90 days after D0 (31 + 28 + 31)
const D45 = "2026-02-15T00:00:00Z"; // exactly 45 days after D0
const RECEIVED = "2026-04-02T00:00:00Z";
const EFFECTIVE = "2026-05-01T00:00:00Z";
const CUTOFF = "2026-06-01T00:00:00Z";

type Rec = Record<string, unknown>;

function obs(recordId: string, observedAt: string, value: number, fields: Rec = {}, receivedAt = RECEIVED): Rec {
  return {
    recordId,
    animalId: A,
    observedAt,
    weight: { value, unit: "KILOGRAM" },
    method: "SCALE",
    provenance: { sourceCategory: "DEVICE", receivedAt },
    ...fields,
  };
}

const SOURCE_REF = { sourceId: "SYNTH-SRC-TARGETS", version: "v1", contentFingerprint: computeSourceContentFingerprint({ text: "synthetic target table" }, hash) };
const provenance = (receivedAt = "2026-01-01T00:00:00Z", extra: Rec = {}) => ({ sourceRef: SOURCE_REF, receivedAt, ...extra });

function target(targetId: string, fields: Rec = {}): Rec {
  return {
    targetId,
    version: "v1",
    metric: { kind: "ADG", valueKgPerDay: 1 },
    applicability: {},
    validFrom: "2025-01-01T00:00:00Z",
    reviewState: "PRODUCTION",
    provenance: provenance(),
    ...fields,
  };
}

function policy(policyId: string, rule: Rec, fields: Rec = {}): Rec {
  return { policyId, version: "v1", rule, provenance: provenance(), ...fields };
}

interface Run {
  observations?: unknown[];
  scope?: Rec;
  effectiveAt?: string;
  knowledgeCutoff?: string;
  windowFrom?: string | null;
  projectionAt?: string | null;
  targets?: unknown[];
  policies?: unknown[];
  contexts?: unknown[];
}

function contractOf(r: Run): WeightReadContract {
  const built = buildWeightReadContract(
    { observations: r.observations ?? [], scope: (r.scope ?? { kind: "EXPLICIT_SET", animalIds: [A] }) as never, query: { effectiveAt: r.effectiveAt ?? EFFECTIVE, knowledgeCutoff: r.knowledgeCutoff ?? CUTOFF } },
    hash,
  );
  if (!built.ok) throw new Error(JSON.stringify(built.issues));
  return built.contract;
}

function evaluate(r: Run): PerformanceResult {
  const query: Rec = { effectiveAt: r.effectiveAt ?? EFFECTIVE, knowledgeCutoff: r.knowledgeCutoff ?? CUTOFF };
  if (r.windowFrom !== undefined) query.windowFrom = r.windowFrom;
  if (r.projectionAt !== undefined) query.projectionAt = r.projectionAt;
  return evaluatePerformance({ weights: contractOf(r), query: query as never, targets: r.targets ?? [], policies: r.policies ?? [], contexts: r.contexts ?? [] }, hash);
}

function ok(result: PerformanceResult): PerformanceEvaluation {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.evaluation;
}
const animal = (result: PerformanceResult, id = A): AnimalPerformance => ok(result).animals.find((a) => a.animalId === id)!;
const codes = (result: PerformanceResult) => (result.ok ? [] : result.issues.map((i) => i.code));
const failsClosed = (result: PerformanceResult) => !result.ok;

const PAIR = [obs("w-0", D0, 200), obs("w-90", D90, 290)];

const NO_POLICIES: DerivationPolicies = { minimumInterval: { state: "NONE" }, acceptedBases: { state: "NONE" } };
function point(at: string, kg: number | null, state: PerformancePoint["state"] = "USABLE", id = `p-${at}`): PerformancePoint {
  return {
    at,
    state,
    kg: state === "USABLE" ? kg : null,
    inputs: [{ recordId: id, observedAt: at, kg, recordedValue: kg ?? 1, recordedUnit: "KILOGRAM", method: "SCALE", basis: "MEASURED", informationClass: "OBSERVATION", quality: null }],
  };
}

// ---------------------------------------------------------------------------

describe("C5 day convention and exact ADG", () => {
  it("multi-month interval: 90 exact days, gain and ADG unrounded, full trace", () => {
    const a = animal(evaluate({ observations: PAIR }));
    expect(a.period.state).toBe("DERIVED");
    expect(a.period.informationClass).toBe("DERIVED_VALUE");
    expect(a.period.gainKg).toBe(90);
    expect(a.period.elapsedDays).toBe(90);
    expect(a.period.adgKgPerDay).toBe(1);
    expect(a.period.sourceRecordIds).toEqual(["w-0", "w-90"]);
    expect(a.period.conventionVersion).toBe(cattle.PERFORMANCE_DAY_CONVENTION_VERSION);
    const trace = a.period.trace!;
    expect(trace.formula).toBe(cattle.PERFORMANCE_FORMULA);
    expect(trace.convention).toBe("UTC_EXACT_ELAPSED_SECONDS_PER_86400");
    expect(trace.elapsed).toEqual({ seconds: 90 * 86_400, nanoseconds: 0 });
    expect(trace.units).toEqual({ gain: "KILOGRAM", elapsed: "DAY", adg: "KILOGRAM_PER_DAY" });
    expect(trace.inputs.map((i) => [i.role, i.input.recordId, i.input.kg, i.input.method, i.input.observedAt])).toEqual([
      ["START", "w-0", 200, "SCALE", "2026-01-01T00:00:00.000000000Z"],
      ["END", "w-90", 290, "SCALE", "2026-04-01T00:00:00.000000000Z"],
    ]);
    expect(trace.minimumIntervalPolicy).toBeNull();
  });

  it("sub-day interval: 12 hours is exactly 0.5 day", () => {
    const a = animal(evaluate({ observations: [obs("w-a", "2026-03-01T06:00:00Z", 300), obs("w-b", "2026-03-01T18:00:00Z", 301)] }));
    expect(a.period.elapsedDays).toBe(0.5);
    expect(a.period.adgKgPerDay).toBe(2);
  });

  it("exact elapsed keeps nanoseconds with a consistent sign", () => {
    expect(exactElapsed("2026-01-01T00:00:00.5Z", "2026-01-01T00:00:01Z")).toEqual({ seconds: 0, nanoseconds: 500_000_000 });
    expect(exactElapsed("2026-01-01T00:00:00.8Z", "2026-01-01T00:00:02.1Z")).toEqual({ seconds: 1, nanoseconds: 300_000_000 });
    expect(exactElapsed("2026-01-01T00:00:01.2Z", "2026-01-01T00:00:00.5Z")).toEqual({ seconds: 0, nanoseconds: -700_000_000 });
    expect(exactElapsed("2028-02-28T00:00:00Z", "2028-03-01T00:00:00Z")).toEqual({ seconds: 2 * 86_400, nanoseconds: 0 }); // leap day
    expect(elapsedDaysOf({ seconds: 43_200, nanoseconds: 0 })).toBe(0.5);
    expect(exactElapsed("2026-01-01", D0)).toBeNull();
  });

  it("a weight loss is a negative gain, never clamped to zero", () => {
    const a = animal(evaluate({ observations: [obs("w-0", D0, 300), obs("w-90", D90, 255)] }));
    expect(a.period.gainKg).toBe(-45);
    expect(a.period.adgKgPerDay).toBe(-0.5);
  });

  it("per-interval list over consecutive points; period uses first and last", () => {
    const a = animal(evaluate({ observations: [...PAIR, obs("w-45", D45, 230)] }));
    expect(a.intervals.map((i) => [i.from, i.to, i.adgKgPerDay])).toEqual([
      ["2026-01-01T00:00:00.000000000Z", "2026-02-15T00:00:00.000000000Z", 30 / 45],
      ["2026-02-15T00:00:00.000000000Z", "2026-04-01T00:00:00.000000000Z", 60 / 45],
    ]);
    expect(a.period.adgKgPerDay).toBe(1);
  });

  it("coverage is descriptive: counts, span, largest gap, intervals", () => {
    const a = animal(evaluate({ observations: [...PAIR, obs("w-45", D45, 230)] }));
    expect(a.coverage).toMatchObject({ observationCount: 3, pointCount: 3, usableCount: 3, spanDays: 90, largestGapDays: 45, intervalCount: 2 });
    const none = animal(evaluate({ observations: [] }));
    expect(none.coverage).toMatchObject({ observationCount: 0, pointCount: 0, spanDays: null, largestGapDays: null, firstObservedAt: null });
  });

  it("the window bounds the period (windowFrom inclusive)", () => {
    const a = animal(evaluate({ observations: [...PAIR, obs("w-45", D45, 230)], windowFrom: D45 }));
    expect(a.period.sourceRecordIds).toEqual(["w-45", "w-90"]);
    expect(a.period.elapsedDays).toBe(45);
    expect(a.points.map((p) => p.inputs[0].recordId)).toEqual(["w-45", "w-90"]);
  });
});

describe("C5 validity rules", () => {
  it("fewer than two observations ⇒ INSUFFICIENT_EVIDENCE (no value, never zero)", () => {
    for (const observations of [[], [obs("w-0", D0, 200)]]) {
      const a = animal(evaluate({ observations }));
      expect(a.period.state).toBe("INSUFFICIENT_EVIDENCE");
      expect(a.period.reasonCodes).toEqual(["CATTLE_PERFORMANCE_FEWER_THAN_TWO_OBSERVATIONS"]);
      expect([a.period.gainKg, a.period.adgKgPerDay, a.period.elapsedDays]).toEqual([null, null, null]);
      expect(a.intervals).toEqual([]);
    }
  });

  it("zero or negative elapsed time ⇒ INVALID", () => {
    const p0 = point(D0, 200);
    const p90 = point(D90, 290);
    expect(derivePerformanceInterval(p0, p0, NO_POLICIES).state).toBe("INVALID");
    const reversed = derivePerformanceInterval(p90, p0, NO_POLICIES);
    expect(reversed.state).toBe("INVALID");
    expect(reversed.reasonCodes).toEqual(["CATTLE_PERFORMANCE_NON_POSITIVE_ELAPSED_TIME"]);
    expect(reversed.adgKgPerDay).toBeNull();
  });

  it("two observations at the same instant are a conflict (C4 contract) ⇒ EVIDENCE_CONFLICT, never averaged", () => {
    const a = animal(evaluate({ observations: [...PAIR, obs("w-90b", D90, 300)] }));
    expect(a.points[1].state).toBe("CONFLICT");
    expect(a.period.state).toBe("EVIDENCE_CONFLICT");
    expect(a.period.reasonCodes).toEqual(["CATTLE_PERFORMANCE_INPUT_IN_CONFLICT"]);
    expect(a.period.sourceRecordIds).toEqual(["w-0", "w-90", "w-90b"]);
    expect(a.quality.conflictInstants).toEqual(["2026-04-01T00:00:00.000000000Z"]);
  });

  it("competing live corrections propagate as EVIDENCE_CONFLICT", () => {
    const corrections = [obs("w-90c1", D90, 291, { supersedes: ["w-90"] }), obs("w-90c2", D90, 292, { supersedes: ["w-90"] })];
    const a = animal(evaluate({ observations: [...PAIR, ...corrections] }));
    expect(a.period.state).toBe("EVIDENCE_CONFLICT");
  });

  it("an end observation without a kilogram conversion ⇒ UNSUPPORTED (no earlier weight substituted)", () => {
    const a = animal(evaluate({ observations: [obs("w-0", D0, 200), obs("w-45", D45, 230), obs("w-90", D90, 600, { weight: { value: 600, unit: "POUND" } })] }));
    expect(a.period.state).toBe("UNSUPPORTED");
    expect(a.quality.unsupportedInstants).toEqual(["2026-04-01T00:00:00.000000000Z"]);
    expect(a.intervals.map((i) => i.state)).toEqual(["DERIVED", "UNSUPPORTED"]);
  });
});

describe("C5 quality: mixed methods and explicit thresholds", () => {
  const mixed = [obs("w-0", D0, 200, { method: "ESTIMATE_VISUAL" }), obs("w-90", D90, 290)];

  it("mixed methods are reported as a limitation; nothing is excluded or upgraded without a policy", () => {
    const a = animal(evaluate({ observations: mixed }));
    expect(a.period.state).toBe("DERIVED");
    expect(a.period.evidenceBasis).toBe("MIXED");
    expect(a.period.methods).toEqual(["ESTIMATE_VISUAL", "SCALE"]);
    expect(a.period.limitations).toContain("CATTLE_PERFORMANCE_MIXED_COLLECTION_METHODS");
    expect(a.quality.mixedMethods).toBe(true);
    expect(a.quality.excludedRecordIds).toEqual([]);
    expect(a.quality.limitations).toEqual([
      "CATTLE_PERFORMANCE_MIXED_COLLECTION_METHODS",
      "CATTLE_PERFORMANCE_NO_MINIMUM_INTERVAL_POLICY",
      "CATTLE_PERFORMANCE_NO_QUALITY_POLICY",
    ]);
  });

  it("an UNKNOWN-method input makes the derived value's basis UNKNOWN (weakest)", () => {
    const a = animal(evaluate({ observations: [obs("w-0", D0, 200, { method: "UNKNOWN" }), obs("w-90", D90, 290)] }));
    expect(a.period.evidenceBasis).toBe("UNKNOWN");
  });

  it("a supplied ACCEPTED_BASES policy excludes (and reports) other bases", () => {
    const policies = [policy("SYNTH-POLICY-Q", { kind: "ACCEPTED_BASES", acceptedBases: ["MEASURED"] })];
    const a = animal(evaluate({ observations: [...mixed, obs("w-45", D45, 230)], policies }));
    expect(a.points.map((p) => p.state)).toEqual(["EXCLUDED", "USABLE", "USABLE"]);
    expect(a.quality.excludedRecordIds).toEqual(["w-0"]);
    expect(a.period.sourceRecordIds).toEqual(["w-45", "w-90"]);
    expect(a.period.limitations).not.toContain("CATTLE_PERFORMANCE_NO_QUALITY_POLICY");
  });

  it("a conflicting observation instant is never excluded by policy", () => {
    const policies = [policy("SYNTH-POLICY-Q", { kind: "ACCEPTED_BASES", acceptedBases: ["MEASURED"] })];
    const a = animal(evaluate({ observations: [...PAIR, obs("w-90e", D90, 280, { method: "ESTIMATE_TAPE" })], policies }));
    expect(a.points[1].state).toBe("CONFLICT");
    expect(a.period.state).toBe("EVIDENCE_CONFLICT");
  });

  it("a supplied MINIMUM_INTERVAL is applied exactly (boundary inclusive, unrounded)", () => {
    const at = (minimumDays: number) => animal(evaluate({ observations: PAIR, policies: [policy("SYNTH-POLICY-MIN", { kind: "MINIMUM_INTERVAL", minimumDays })] }));
    const met = at(90);
    expect(met.period.state).toBe("DERIVED");
    expect(met.period.trace?.minimumIntervalPolicy).toMatchObject({ id: "SYNTH-POLICY-MIN", version: "v1" });
    const notMet = at(90.000001);
    expect(notMet.period.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(notMet.period.reasonCodes).toEqual(["CATTLE_PERFORMANCE_BELOW_MINIMUM_INTERVAL"]);
  });

  it("two live policies of one kind are a conflict, never a winner", () => {
    const policies = [policy("SYNTH-POLICY-MIN-1", { kind: "MINIMUM_INTERVAL", minimumDays: 1 }), policy("SYNTH-POLICY-MIN-2", { kind: "MINIMUM_INTERVAL", minimumDays: 2 })];
    const r = ok(evaluate({ observations: PAIR, policies }));
    expect(r.policies.minimumInterval).toMatchObject({ state: "EVIDENCE_CONFLICT", policyIds: ["SYNTH-POLICY-MIN-1", "SYNTH-POLICY-MIN-2"] });
    expect(r.animals[0].period.state).toBe("EVIDENCE_CONFLICT");
    expect(r.animals[0].period.reasonCodes).toEqual(["CATTLE_PERFORMANCE_POLICY_CONFLICT"]);
  });

  it("resolved and conflicting policy definitions are retained and bound by both fingerprints (CAT-INV-021)", () => {
    const fingerprints = (policies: unknown[]) => {
      const r = ok(evaluate({ observations: PAIR, policies }));
      return [r.fingerprint, r.animals[0].fingerprint];
    };
    const conflict = (v2: string, days2: number) => [
      policy("SYNTH-POLICY-MIN-1", { kind: "MINIMUM_INTERVAL", minimumDays: 1 }),
      policy("SYNTH-POLICY-MIN-2", { kind: "MINIMUM_INTERVAL", minimumDays: days2 }, { version: v2 }),
    ];
    const base = conflict("v1", 2);
    const r = ok(evaluate({ observations: PAIR, policies: base }));
    expect(r.policies.minimumInterval).toMatchObject({
      state: "EVIDENCE_CONFLICT",
      definitions: [
        { policyId: "SYNTH-POLICY-MIN-1", version: "v1", rule: { minimumDays: 1 } },
        { policyId: "SYNTH-POLICY-MIN-2", version: "v1", rule: { minimumDays: 2 } },
      ],
    });
    const baseFp = fingerprints(base);
    for (const changed of [conflict("v2", 2), conflict("v1", 3)]) {
      const fp = fingerprints(changed);
      expect(fp[0]).not.toBe(baseFp[0]);
      expect(fp[1]).not.toBe(baseFp[1]);
    }

    const resolved = (receivedAt: string, actor?: string) => [policy("SYNTH-POLICY-MIN", { kind: "MINIMUM_INTERVAL", minimumDays: 1 }, { provenance: provenance(receivedAt, actor ? { actor } : {}) })];
    const resolvedBase = resolved("2026-01-01T00:00:00Z");
    expect(ok(evaluate({ observations: PAIR, policies: resolvedBase })).policies.minimumInterval).toMatchObject({
      state: "SUPPLIED",
      definition: { policyId: "SYNTH-POLICY-MIN", version: "v1", provenance: { receivedAt: "2026-01-01T00:00:00.000000000Z", actor: null } },
    });
    const resolvedFp = fingerprints(resolvedBase);
    for (const changed of [resolved("2026-01-02T00:00:00Z"), resolved("2026-01-01T00:00:00Z", "SYNTH-ACTOR")]) {
      const fp = fingerprints(changed);
      expect(fp[0]).not.toBe(resolvedFp[0]);
      expect(fp[1]).not.toBe(resolvedFp[1]);
    }
  });

  it("a policy revision supersedes its earlier version", () => {
    const policies = [
      policy("SYNTH-POLICY-MIN", { kind: "MINIMUM_INTERVAL", minimumDays: 100 }),
      policy("SYNTH-POLICY-MIN", { kind: "MINIMUM_INTERVAL", minimumDays: 10 }, { version: "v2", supersedesVersions: ["v1"] }),
    ];
    const r = ok(evaluate({ observations: PAIR, policies }));
    expect(r.policies.minimumInterval).toMatchObject({ state: "SUPPLIED", policy: { version: "v2" } });
    expect(r.animals[0].period.state).toBe("DERIVED");
  });
});

describe("C5 trend (explicit policy only)", () => {
  const trend = (fallingBelowKgPerDay: number, risingAboveKgPerDay: number) => [policy("SYNTH-POLICY-TREND", { kind: "TREND", fallingBelowKgPerDay, risingAboveKgPerDay })];
  const stateWith = (policies: unknown[]) => animal(evaluate({ observations: PAIR, policies })).trend.state;

  it("no policy ⇒ NO_POLICY, never a default classification", () => {
    expect(animal(evaluate({ observations: PAIR })).trend).toEqual({ state: "NO_POLICY", policy: null, adgKgPerDay: null });
  });

  it("supplied boundaries are exact (FLAT inclusive at both bounds)", () => {
    // Period ADG is exactly 1.
    expect(stateWith(trend(1, 1))).toBe("FLAT");
    expect(stateWith(trend(0.5, 1))).toBe("FLAT");
    expect(stateWith(trend(1, 1.5))).toBe("FLAT");
    expect(stateWith(trend(1.0000001, 2))).toBe("FALLING");
    expect(stateWith(trend(0, 0.9999999))).toBe("RISING");
  });

  it("unresolved period ⇒ its unresolved state, never a classification", () => {
    expect(animal(evaluate({ observations: [obs("w-0", D0, 200)], policies: trend(0, 1) })).trend.state).toBe("INSUFFICIENT_EVIDENCE");
  });
});

describe("C5 target comparison", () => {
  const compare = (targets: unknown[], r: Run = {}) => animal(evaluate({ observations: PAIR, targets, ...r })).comparisons;

  it("no target ⇒ NO_TARGET (a state, never ON_TRACK)", () => {
    const a = animal(evaluate({ observations: PAIR }));
    expect(a.targetOutcome).toBe("NO_TARGET");
    expect(a.comparisons).toEqual([]);
  });

  it("each outcome: ON_TRACK / BEHIND / AHEAD with exact, unrounded tolerance bounds", () => {
    // Observed ADG is exactly 1.
    const cases: [Rec, string][] = [
      [{}, "ON_TRACK"],
      [{ metric: { kind: "ADG", valueKgPerDay: 1.25 }, tolerance: { below: 0.25, above: 0 } }, "ON_TRACK"],
      [{ metric: { kind: "ADG", valueKgPerDay: 1.25 }, tolerance: { below: 0.125, above: 0 } }, "BEHIND"],
      [{ metric: { kind: "ADG", valueKgPerDay: 0.75 }, tolerance: { below: 0, above: 0.25 } }, "ON_TRACK"],
      [{ metric: { kind: "ADG", valueKgPerDay: 0.75 }, tolerance: null }, "AHEAD"],
      [{ metric: { kind: "ADG", valueKgPerDay: 1.0000001 } }, "BEHIND"],
    ];
    for (const [fields, expected] of cases) {
      const [c] = compare([target("SYNTH-TARGET-1", fields)]);
      expect(c.state, JSON.stringify(fields)).toBe(expected);
      expect(c.observed).toBe(1);
      expect(c.evidenceRecordIds).toEqual(["w-0", "w-90"]);
      expect(c.target).toMatchObject({ id: "SYNTH-TARGET-1", version: "v1", sourceRef: SOURCE_REF, ruleRef: null });
    }
  });

  it("weight-at-instant target compares the observation at exactly that instant", () => {
    const [onTrack] = compare([target("SYNTH-TARGET-W", { metric: { kind: "WEIGHT_AT", at: D90, valueKg: 290 } })]);
    expect(onTrack).toMatchObject({ state: "ON_TRACK", observed: 290, evidenceRecordIds: ["w-90"] });
    const [noObs] = compare([target("SYNTH-TARGET-W", { metric: { kind: "WEIGHT_AT", at: D45, valueKg: 250 } })]);
    expect(noObs).toMatchObject({ state: "INSUFFICIENT_EVIDENCE", reasonCodes: ["CATTLE_PERFORMANCE_NO_OBSERVATION_AT_TARGET_DATE"] });
    const [future] = compare([target("SYNTH-TARGET-W", { metric: { kind: "WEIGHT_AT", at: "2026-09-01T00:00:00Z", valueKg: 400 } })]);
    expect(future.state).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("unreviewed (non-production) target ⇒ TARGET_UNVERIFIED", () => {
    for (const reviewState of ["DRAFT", "VALIDATED", "APPROVED", "RESEARCH", "BLOCKED", "SUPERSEDED"]) {
      expect(compare([target("SYNTH-TARGET-1", { reviewState })])[0].state).toBe("TARGET_UNVERIFIED");
    }
  });

  it("inapplicable intent / system / validity / animal set ⇒ TARGET_NOT_APPLICABLE (only with KNOWN applicability inputs)", () => {
    const contexts = [{ animalId: A, goalRef: "SYNTH-GOAL-X", productionSystemRef: "SYNTH-SYSTEM-X", attributes: [{ key: "SYNTH-KEY", value: "SYNTH-V1" }] }];
    const cases: [Rec, string][] = [
      [{ goalRef: "SYNTH-GOAL-Y" }, "CATTLE_PERFORMANCE_GOAL_MISMATCH"],
      [{ productionSystemRef: "SYNTH-SYSTEM-Y" }, "CATTLE_PERFORMANCE_PRODUCTION_SYSTEM_MISMATCH"],
      [{ attributes: [{ key: "SYNTH-KEY", value: "SYNTH-V2" }] }, "CATTLE_PERFORMANCE_ATTRIBUTE_MISMATCH"],
      [{ animalIds: [B] }, "CATTLE_PERFORMANCE_ANIMAL_NOT_IN_TARGET_SET"],
    ];
    for (const [applicability, reason] of cases) {
      const [c] = compare([target("SYNTH-TARGET-1", { applicability })], { contexts });
      expect(c.state).toBe("TARGET_NOT_APPLICABLE");
      expect(c.reasonCodes).toEqual([reason]);
    }
    const [expired] = compare([target("SYNTH-TARGET-1", { validTo: "2026-03-01T00:00:00Z" })]);
    expect(expired).toMatchObject({ state: "TARGET_NOT_APPLICABLE", reasonCodes: ["CATTLE_PERFORMANCE_OUTSIDE_TARGET_VALIDITY"] });
    const [matching] = compare([target("SYNTH-TARGET-1", { applicability: { goalRef: "SYNTH-GOAL-X", attributes: [{ key: "SYNTH-KEY", value: "SYNTH-V1" }] } })], { contexts });
    expect(matching.state).toBe("ON_TRACK");
  });

  it("an unknown applicability input ⇒ INSUFFICIENT_EVIDENCE, never NOT_APPLICABLE or ON_TRACK", () => {
    const [c] = compare([target("SYNTH-TARGET-1", { applicability: { goalRef: "SYNTH-GOAL-X", productionSystemRef: "SYNTH-SYSTEM-Y" } })], {
      contexts: [{ animalId: A, productionSystemRef: "SYNTH-SYSTEM-X" }],
    });
    expect(c).toMatchObject({ state: "INSUFFICIENT_EVIDENCE", reasonCodes: ["CATTLE_PERFORMANCE_APPLICABILITY_UNKNOWN"] });
  });

  it("a target without provenance (or with a malformed source binding) is rejected", () => {
    const bad = [
      target("SYNTH-TARGET-1", { provenance: { receivedAt: "2026-01-01T00:00:00Z" } }),
      target("SYNTH-TARGET-1", { provenance: provenance("2026-01-01T00:00:00Z", { sourceRef: { ...SOURCE_REF, contentFingerprint: { ...SOURCE_REF.contentFingerprint, digest: "ABC" } } }) }),
      target("SYNTH-TARGET-1", { provenance: undefined }),
    ];
    for (const t of bad) {
      const result = evaluate({ observations: PAIR, targets: [t] });
      expect(codes(result)).toContain("CATTLE_PERFORMANCE_TARGET_INVALID_PROVENANCE");
    }
  });

  it("distinct (id, version) tuples never collide through their display spelling", () => {
    const targets = [target("SYNTH-X@Y", { version: "Z" }), target("SYNTH-X", { version: "Y@Z", metric: { kind: "ADG", valueKgPerDay: 2 } })];
    expect(ok(evaluate({ observations: PAIR, targets })).targetIds).toEqual(["SYNTH-X", "SYNTH-X@Y"]);
    const policies = [policy("SYNTH-P@Y", { kind: "MINIMUM_INTERVAL", minimumDays: 1 }, { version: "Z" }), policy("SYNTH-P", { kind: "TREND", fallingBelowKgPerDay: 0, risingAboveKgPerDay: 2 }, { version: "Y@Z" })];
    expect(ok(evaluate({ observations: PAIR, policies })).policies).toMatchObject({ minimumInterval: { state: "SUPPLIED" }, trend: { state: "SUPPLIED" } });
  });

  it("malformed target content fails closed (non-finite, negative tolerance, unknown metric, empty validity)", () => {
    const bad = [
      { metric: { kind: "ADG", valueKgPerDay: "1" } },
      { tolerance: { below: -0.1, above: 0 } },
      { metric: { kind: "GROWTH_CURVE" } },
      { validTo: "2025-01-01T00:00:00Z" },
      { reviewState: "OK" },
      { extra: 1 },
    ];
    for (const fields of bad) expect(codes(evaluate({ observations: PAIR, targets: [target("SYNTH-TARGET-1", fields)] })), JSON.stringify(fields)).toContain("CATTLE_PERFORMANCE_TARGET_INVALID_CONTENT");
  });

  it("competing target versions ⇒ EVIDENCE_CONFLICT (no latest-wins)", () => {
    const [c] = compare([target("SYNTH-TARGET-1"), target("SYNTH-TARGET-1", { version: "v2", metric: { kind: "ADG", valueKgPerDay: 2 } })]);
    expect(c).toMatchObject({ state: "EVIDENCE_CONFLICT", target: null, conflictingVersions: ["v1", "v2"] });
  });

  it("insufficient performance evidence ⇒ INSUFFICIENT_EVIDENCE for an applicable verified target", () => {
    const c = animal(evaluate({ observations: [obs("w-0", D0, 200)], targets: [target("SYNTH-TARGET-1")] })).comparisons[0];
    expect(c.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(c.observed).toBeNull();
  });

  it("unresolved required evidence never surfaces as a resolved-looking state (CAT-INV-009)", () => {
    const t = [target("SYNTH-TARGET-1"), target("SYNTH-TARGET-W", { metric: { kind: "WEIGHT_AT", at: D90, valueKg: 290 } })];
    const trendPolicy = [policy("SYNTH-POLICY-TREND", { kind: "TREND", fallingBelowKgPerDay: 0, risingAboveKgPerDay: 2 })];
    const forbidden = [...RESOLVED_LOOKING_STATES, "ON_TRACK", "AHEAD", "BEHIND", "TARGET_NOT_APPLICABLE", "RISING", "FALLING", "FLAT", "DERIVED"];
    // Weight evidence unresolved: period, trend and every comparison stay unresolved.
    const weightCases = [
      { label: "one observation", result: animal(evaluate({ observations: [obs("w-0", D0, 200)], targets: t, policies: trendPolicy })) },
      { label: "no observation", result: animal(evaluate({ observations: [], targets: t, policies: trendPolicy })) },
      { label: "conflicting end", result: animal(evaluate({ observations: [...PAIR, obs("w-90b", D90, 300)], targets: t, policies: trendPolicy })) },
      { label: "unsupported end unit", result: animal(evaluate({ observations: [obs("w-0", D0, 200), obs("w-90", D90, 600, { weight: { value: 600, unit: "POUND" } })], targets: t, policies: trendPolicy })) },
      {
        label: "conflicting trend and quality policies",
        result: animal(
          evaluate({
            observations: PAIR,
            targets: t.slice(0, 1),
            policies: [...trendPolicy, { ...trendPolicy[0], policyId: "SYNTH-POLICY-TREND-2" }, policy("SYNTH-Q1", { kind: "ACCEPTED_BASES", acceptedBases: ["MEASURED"] }), policy("SYNTH-Q2", { kind: "ACCEPTED_BASES", acceptedBases: ["ESTIMATED"] })],
          }),
        ),
      },
    ];
    expect(checkUnresolvedEvidenceNotMasked(weightCases, (a) => [a.period.state, a.trend.state, ...a.comparisons.map((c) => c.state)], forbidden)).toEqual(CONFORMS);
    // Target evidence unresolved (the period itself is DERIVED): every comparison stays unresolved.
    const targetCases = [
      { label: "applicability unknown", result: animal(evaluate({ observations: PAIR, targets: t.map((x) => ({ ...x, applicability: { goalRef: "SYNTH-GOAL-X" } })) })) },
      { label: "target versions in conflict", result: animal(evaluate({ observations: PAIR, targets: [...t, { ...t[0], version: "v2", metric: { kind: "ADG", valueKgPerDay: 3 } }, { ...t[1], version: "v2" }] })) },
    ];
    expect(checkUnresolvedEvidenceNotMasked(targetCases, (a) => a.comparisons.map((c) => c.state), forbidden)).toEqual(CONFORMS);
  });

  it("unresolved metric evidence is never masked by a known applicability mismatch or review state (CAT-INV-009)", () => {
    const contexts = [{ animalId: A, goalRef: "SYNTH-GOAL-X" }];
    const restricted = [
      { applicability: { animalIds: [B] } },
      { applicability: { goalRef: "SYNTH-GOAL-Y" } },
      { validTo: "2026-03-01T00:00:00Z" },
      { reviewState: "DRAFT" },
      { applicability: { productionSystemRef: "SYNTH-SYSTEM-Y" } },
    ];
    const weightAt = { metric: { kind: "WEIGHT_AT", at: D90, valueKg: 290 } };
    const evidence: [string, unknown[], string][] = [
      ["conflicting end", [...PAIR, obs("w-90b", D90, 300)], "EVIDENCE_CONFLICT"],
      ["one observation", [obs("w-0", D0, 200)], "INSUFFICIENT_EVIDENCE"],
      ["no observation", [], "INSUFFICIENT_EVIDENCE"],
    ];
    const cases = evidence.flatMap(([label, observations, expected]) =>
      restricted.flatMap((fields) =>
        [{}, weightAt].map((metric) => ({ label: `${label} ${JSON.stringify({ ...fields, ...metric })}`, expected, result: animal(evaluate({ observations, contexts, targets: [target("SYNTH-TARGET-1", { ...fields, ...metric })] })) })),
      ),
    );
    const forbidden = [...RESOLVED_LOOKING_STATES, "ON_TRACK", "AHEAD", "BEHIND", "TARGET_NOT_APPLICABLE", "TARGET_UNVERIFIED"];
    expect(checkUnresolvedEvidenceNotMasked(cases, (a) => a.comparisons.map((c) => c.state), forbidden)).toEqual(CONFORMS);
    for (const c of cases) expect(c.result.comparisons[0].state, c.label).toBe(c.expected);
  });
});

describe("C5 unrepresentable arithmetic fails closed (no non-finite value hashed)", () => {
  it("an ADG that overflows binary64 ⇒ INVALID, never Infinity", () => {
    const r = evaluate({ observations: [obs("w-0", D0, 1), obs("w-1", "2026-01-01T00:00:00.000000001Z", 1e308)], targets: [target("SYNTH-TARGET-1")], projectionAt: "2026-07-10T00:00:00Z" });
    const a = animal(r);
    expect(a.period).toMatchObject({ state: "INVALID", gainKg: null, adgKgPerDay: null, reasonCodes: ["CATTLE_PERFORMANCE_VALUE_NOT_REPRESENTABLE"] });
    expect(a.comparisons[0].state).toBe("INVALID");
    expect(a.prediction).toMatchObject({ state: "NOT_PROJECTED", projectedKg: null, reasonState: "INVALID" });
    expect(ok(r).aggregate.periodAdgKgPerDay.statistics).toBeNull();
  });

  it("a target band whose bound overflows ⇒ INVALID with null bounds", () => {
    for (const tolerance of [{ below: 0, above: 1.7e308 }, { below: 1.7e308, above: 0 }]) {
      const value = tolerance.above > 0 ? 1.7e308 : -1.7e308;
      const [c] = animal(evaluate({ observations: PAIR, targets: [target("SYNTH-TARGET-1", { metric: { kind: "ADG", valueKgPerDay: value }, tolerance })] })).comparisons;
      expect(c).toMatchObject({ state: "INVALID", lowerBound: null, upperBound: null, reasonCodes: ["CATTLE_PERFORMANCE_VALUE_NOT_REPRESENTABLE"] });
    }
  });

  it("a projection that overflows ⇒ NOT_PROJECTED (INVALID)", () => {
    const a = animal(evaluate({ observations: [obs("w-0", D0, 1), obs("w-90", D90, 1e308)], projectionAt: "9000-01-01T00:00:00Z" }));
    expect(a.period.state).toBe("DERIVED");
    expect(a.prediction).toMatchObject({ state: "NOT_PROJECTED", projectedKg: null, reasonState: "INVALID" });
  });

  it("aggregate mean and median of large finite gains stay finite and exact", () => {
    const observations = [obs("w-0", D0, 1), obs("w-90", D90, 1e308), obs("b-0", D0, 1, { animalId: B }), obs("b-90", D90, 1e308, { animalId: B })];
    const r = ok(evaluate({ observations, scope: { kind: "EXPLICIT_SET", animalIds: [A, B] } }));
    expect(r.aggregate.periodGainKg.statistics).toEqual({ count: 2, min: 1e308, max: 1e308, mean: 1e308, median: 1e308 });
  });

  it("aggregate mean of three maximum-finite gains stays finite (no overflow through accumulated rounding)", () => {
    const ids = [A, B, C];
    const observations = ids.flatMap((id) => [obs(`${id}-0`, D0, 1, { animalId: id }), obs(`${id}-90`, D90, Number.MAX_VALUE, { animalId: id })]);
    const r = ok(evaluate({ observations, scope: { kind: "EXPLICIT_SET", animalIds: ids } }));
    expect(r.aggregate.periodGainKg.statistics).toEqual({ count: 3, min: Number.MAX_VALUE, max: Number.MAX_VALUE, mean: Number.MAX_VALUE, median: Number.MAX_VALUE });
  });
});

describe("C5 historical reconstruction", () => {
  const LATE = "2026-05-15T00:00:00Z";
  const correction = obs("w-90c", D90, 299, { supersedes: ["w-90"] }, LATE);

  it("a late correction changes the current result but not an earlier-cutoff result (fingerprint reproduced)", () => {
    const before = ok(evaluate({ observations: PAIR, knowledgeCutoff: "2026-05-01T00:00:00Z" }));
    const beforeWithLater = ok(evaluate({ observations: [...PAIR, correction], knowledgeCutoff: "2026-05-01T00:00:00Z" }));
    expect(beforeWithLater.fingerprint).toEqual(before.fingerprint);
    expect(beforeWithLater.animals[0].period.adgKgPerDay).toBe(1);
    const now = ok(evaluate({ observations: [...PAIR, correction] }));
    expect(now.animals[0].period.gainKg).toBe(99);
    expect(now.animals[0].period.sourceRecordIds).toEqual(["w-0", "w-90c"]);
    expect(now.fingerprint).not.toEqual(before.fingerprint);
    const run = (records: readonly unknown[], knowledgeCutoff: string) => ok(evaluate({ observations: [...records], knowledgeCutoff }));
    expect(
      checkCorrectionPreservesHistory("C5 correction", PAIR, correction, { beforeCorrection: "2026-05-01T00:00:00Z", afterCorrection: CUTOFF }, run, (r) => r.animals[0].points.flatMap((p) => p.inputs.map((i) => i.recordId)).concat(r.animals[0].period.sourceRecordIds), "w-90c"),
    ).toEqual(CONFORMS);
  });

  it("a later target revision is invisible at an earlier cutoff", () => {
    const v2 = target("SYNTH-TARGET-1", { version: "v2", supersedesVersions: ["v1"], metric: { kind: "ADG", valueKgPerDay: 2 }, provenance: provenance("2026-05-20T00:00:00Z") });
    const early = animal(evaluate({ observations: PAIR, targets: [target("SYNTH-TARGET-1"), v2], knowledgeCutoff: "2026-05-10T00:00:00Z" })).comparisons[0];
    expect(early).toMatchObject({ state: "ON_TRACK", target: { version: "v1" } });
    const late = animal(evaluate({ observations: PAIR, targets: [target("SYNTH-TARGET-1"), v2] })).comparisons[0];
    expect(late).toMatchObject({ state: "BEHIND", target: { version: "v2" } });
  });

  it("targets and policies first known after the cutoff never change it, even malformed (CAT-INV-003/004/006)", () => {
    const cutoff = cutoffMatrix("2026-05-10T00:00:00Z");
    const lateTarget = target("SYNTH-TARGET-LATE", { provenance: provenance("2026-05-20T00:00:00Z") });
    const lateMalformed = { targetId: "SYNTH-TARGET-X", version: "v1", metric: "garbage", provenance: { receivedAt: "2026-05-20T00:00:00Z" } };
    const lateCollision = target("SYNTH-TARGET-1", { metric: { kind: "ADG", valueKgPerDay: 9 }, provenance: provenance("2026-05-20T00:00:00Z") });
    const latePolicy = policy("SYNTH-POLICY-TREND", { kind: "TREND", fallingBelowKgPerDay: 0, risingAboveKgPerDay: 0 }, { provenance: provenance("2026-05-20T00:00:00Z") });
    const run = (records: readonly unknown[], knowledgeCutoff: string) =>
      evaluate({
        observations: PAIR,
        knowledgeCutoff,
        targets: records.filter((r) => (r as Rec).targetId !== undefined) as unknown[],
        policies: records.filter((r) => (r as Rec).policyId !== undefined) as unknown[],
      });
    expect(
      checkFutureKnowledgeInvisible([{ label: "late definitions", known: [target("SYNTH-TARGET-1")], later: [lateTarget, lateMalformed, lateCollision, latePolicy], knowledgeCutoff: cutoff.at }], run),
    ).toEqual(CONFORMS);
  });

  it("a target whose knowledge time is malformed fails closed (CAT-INV-005)", () => {
    expect(
      checkMalformedKnowledgeTimeFailsClosed(
        "target receivedAt",
        [target("SYNTH-TARGET-1")],
        (value) => target("SYNTH-TARGET-2", { provenance: { sourceRef: SOURCE_REF, receivedAt: value } }),
        (records) => evaluate({ observations: PAIR, targets: [...records] }),
        failsClosed,
      ),
    ).toEqual(CONFORMS);
  });

  it("target identity before validity: identical duplicate idempotent, same id+version different content fails closed (CAT-INV-008)", () => {
    expect(
      checkDuplicateIdentity(
        "target identity",
        [target("SYNTH-TARGET-1")],
        target("SYNTH-TARGET-1", { validFrom: "2025-01-01T00:00:00.000Z" }),
        [
          { label: "different value", record: target("SYNTH-TARGET-1", { metric: { kind: "ADG", valueKgPerDay: 2 } }) },
          { label: "invalid copy", record: target("SYNTH-TARGET-1", { metric: "garbage" }) },
        ],
        (records) => evaluate({ observations: PAIR, targets: [...records] }),
        failsClosed,
      ),
    ).toEqual(CONFORMS);
  });

  it("supersession defects in definitions fail closed", () => {
    expect(codes(evaluate({ observations: PAIR, targets: [target("SYNTH-TARGET-1", { supersedesVersions: ["v0"] })] }))).toContain("CATTLE_PERFORMANCE_TARGET_SUPERSESSION_TARGET_NOT_KNOWN");
    expect(codes(evaluate({ observations: PAIR, targets: [target("SYNTH-TARGET-1", { supersedesVersions: ["v1"] })] }))).toContain("CATTLE_PERFORMANCE_TARGET_SELF_SUPERSESSION");
    const crossKind = [policy("SYNTH-POLICY-P", { kind: "MINIMUM_INTERVAL", minimumDays: 1 }), policy("SYNTH-POLICY-P", { kind: "TREND", fallingBelowKgPerDay: 0, risingAboveKgPerDay: 1 }, { version: "v2", supersedesVersions: ["v1"] })];
    expect(codes(evaluate({ observations: PAIR, policies: crossKind }))).toContain("CATTLE_PERFORMANCE_POLICY_SUPERSESSION_OUT_OF_SCOPE");
  });
});

describe("C5 prediction boundary", () => {
  it("a projection is labelled PREDICTION with method, assumptions and limitations, and never feeds comparison", () => {
    const a = animal(evaluate({ observations: PAIR, projectionAt: "2026-07-10T00:00:00Z", targets: [target("SYNTH-TARGET-1")] }));
    expect(a.prediction).toMatchObject({
      informationClass: "PREDICTION",
      state: "PROJECTED",
      method: "LINEAR_EXTRAPOLATION_OF_PERIOD_ADG",
      projectedKg: 390,
      elapsedDays: 100,
      fromObservedAt: "2026-04-01T00:00:00.000000000Z",
      basedOnRecordIds: ["w-0", "w-90"],
    });
    expect(a.prediction!.assumptions.length).toBeGreaterThan(0);
    expect(a.prediction!.limitations.length).toBeGreaterThan(0);
    expect(a.points.flatMap((p) => p.inputs.map((i) => i.informationClass))).not.toContain("PREDICTION");
    expect(a.comparisons[0].observed).toBe(1);
  });

  it("no projection without a derived period; projection is optional; must be after effectiveAt", () => {
    expect(animal(evaluate({ observations: [obs("w-0", D0, 200)], projectionAt: "2026-07-10T00:00:00Z" })).prediction).toMatchObject({ state: "NOT_PROJECTED", projectedKg: null, reasonState: "INSUFFICIENT_EVIDENCE" });
    expect(animal(evaluate({ observations: PAIR })).prediction).toBeNull();
    expect(codes(evaluate({ observations: PAIR, projectionAt: EFFECTIVE }))).toEqual(["CATTLE_PERFORMANCE_INVALID_PROJECTION_AT"]);
  });
});

describe("C5 scope aggregation", () => {
  function ledger(animalId: string, groups: { id: string; value: string }[]): AnimalLedger {
    const result = createAnimalLedger(
      animalId,
      groups.map((g) => ({ assertionId: g.id, animalId, kind: "MANAGEMENT_GROUP", value: g.value, validFrom: "2025-01-01T00:00:00Z", validTo: null, supersedes: [], provenance: { sourceCategory: "FARMER", receivedAt: "2025-01-01T00:00:00Z" } })),
    );
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return result.ledger;
  }
  const ledgers = [
    ledger(A, [{ id: "g-a", value: G }]),
    ledger(B, [{ id: "g-b", value: G }]),
    ledger(C, [{ id: "g-c", value: G }]),
    ledger(D, []), // membership UNKNOWN
  ];
  const observations = [
    ...PAIR, // A: ADG 1
    obs("b-0", D0, 100, { animalId: B }),
    obs("b-45", D45, 190, { animalId: B }), // B: ADG 2
    obs("c-0", D0, 300, { animalId: C }), // C: insufficient
    obs("d-0", D0, 300, { animalId: D }),
    obs("d-90", D90, 900, { animalId: D }), // D: not a resolved member — never included
  ];

  it("statistics over KNOWN results only; unknown counts reported alongside, never averaged into zero", () => {
    const r = ok(evaluate({ observations, scope: { kind: "GROUP", groupRef: G, ledgers }, targets: [target("SYNTH-TARGET-1")] }));
    const agg = r.aggregate;
    expect(agg.members).toEqual([A, B, C]);
    expect(agg.membershipUnknown).toEqual([D]);
    expect(agg.periodAdgKgPerDay.knownAnimalIds).toEqual([A, B]);
    expect(agg.periodAdgKgPerDay.unresolved).toEqual([{ state: "INSUFFICIENT_EVIDENCE", animalIds: [C] }]);
    expect(agg.periodAdgKgPerDay.statistics).toEqual({ count: 2, min: 1, max: 2, mean: 1.5, median: 1.5 });
    expect(agg.periodGainKg.statistics).toEqual({ count: 2, min: 90, max: 90, mean: 90, median: 90 });
    expect(agg.comparisons).toEqual([
      {
        targetId: "SYNTH-TARGET-1",
        byState: [
          { state: "AHEAD", animalIds: [B] },
          { state: "INSUFFICIENT_EVIDENCE", animalIds: [C] },
          { state: "ON_TRACK", animalIds: [A] },
        ],
      },
    ]);
    expect(r.animals.map((a) => a.animalId)).toEqual([A, B, C]);
  });

  it("no known result ⇒ statistics null (never zero)", () => {
    const r = ok(evaluate({ observations: [obs("w-0", D0, 200)] }));
    expect(r.aggregate.periodAdgKgPerDay).toEqual({ knownAnimalIds: [], unresolved: [{ state: "INSUFFICIENT_EVIDENCE", animalIds: [A] }], statistics: null });
    expect(r.aggregate.noTargetAnimalIds).toEqual([A]);
  });
});

describe("C5 canonical input boundary and C4 binding (CAT-INV-001/014/023)", () => {
  it("non-canonical input anywhere in the request is rejected before evaluation", () => {
    const contract = contractOf({ observations: PAIR });
    const getterCollection: unknown[] = [];
    Object.defineProperty(getterCollection, "0", { get: () => target("SYNTH-TARGET-1"), enumerable: true, configurable: true });
    const withGetter = { ...target("SYNTH-TARGET-1") };
    Object.defineProperty(withGetter, "reviewState", { get: () => "PRODUCTION", enumerable: true });
    for (const bad of [
      { weights: contract, query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF }, targets: [withGetter], policies: [], contexts: [] },
      { weights: contract, query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF }, targets: getterCollection, policies: [], contexts: [] },
      { weights: contract, query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF }, targets: [new Date(0)], policies: [], contexts: [] },
      { weights: contract, query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF }, targets: [], policies: [() => 1], contexts: [] },
    ]) {
      expect(codes(evaluatePerformance(bad as never, hash))).toEqual(["CATTLE_PERFORMANCE_NON_CANONICAL_INPUT"]);
    }
  });

  it("a tampered C4 contract fails closed; a contract at other times is rejected", () => {
    const contract = contractOf({ observations: PAIR });
    const tampered = structuredClone(contract) as unknown as { series: { observations: { canonicalWeight: { kg: number } }[] }[] };
    tampered.series[0].observations[1].canonicalWeight.kg = 999;
    const query = { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF };
    expect(codes(evaluatePerformance({ weights: tampered as never, query, targets: [], policies: [], contexts: [] }, hash))).toEqual(["CATTLE_PERFORMANCE_WEIGHT_CONTRACT_INVALID"]);
    expect(codes(evaluatePerformance({ weights: contract, query: { ...query, knowledgeCutoff: "2026-05-20T00:00:00Z" }, targets: [], policies: [], contexts: [] }, hash))).toEqual([
      "CATTLE_PERFORMANCE_WEIGHT_CONTRACT_TIME_MISMATCH",
    ]);
    // Equivalent instant spellings are the same times.
    expect(evaluatePerformance({ weights: contract, query: { effectiveAt: "2026-05-01T00:00:00.000Z", knowledgeCutoff: CUTOFF }, targets: [], policies: [], contexts: [] }, hash).ok).toBe(true);
  });

  it("malformed query, window and contexts fail closed", () => {
    expect(codes(evaluate({ observations: PAIR, windowFrom: EFFECTIVE }))).toEqual(["CATTLE_PERFORMANCE_INVALID_WINDOW"]);
    expect(codes(evaluate({ observations: PAIR, windowFrom: "2026-01-01" }))).toEqual(["CATTLE_PERFORMANCE_INVALID_WINDOW"]);
    expect(codes(evaluate({ observations: PAIR, contexts: [{ animalId: A, goalRef: " padded" }] }))).toEqual(["CATTLE_PERFORMANCE_INVALID_CONTEXT"]);
    expect(codes(evaluate({ observations: PAIR, contexts: [{ animalId: A, goalRef: "SYNTH-GOAL-X" }, { animalId: A, goalRef: "SYNTH-GOAL-Y" }] }))).toEqual([
      "CATTLE_PERFORMANCE_CONTEXT_DUPLICATE_DIFFERENT_CONTENT",
    ]);
    expect(evaluate({ observations: PAIR, contexts: [{ animalId: A, goalRef: "SYNTH-GOAL-X" }, { animalId: A, goalRef: "SYNTH-GOAL-X" }] }).ok).toBe(true);
  });
});

describe("C5 determinism, detachment and fingerprints (CAT-INV-002/010/012/021)", () => {
  const targets = [target("SYNTH-TARGET-1"), target("SYNTH-TARGET-2", { metric: { kind: "ADG", valueKgPerDay: 2 } })];
  const policies = [policy("SYNTH-POLICY-TREND", { kind: "TREND", fallingBelowKgPerDay: 0, risingAboveKgPerDay: 2 }), policy("SYNTH-POLICY-MIN", { kind: "MINIMUM_INTERVAL", minimumDays: 1 })];
  const observations = [...PAIR, obs("w-45", D45, 230), obs("w-90b", D90, 291)];

  it("input order never changes the output", () => {
    expect(checkOrderIndependence("observations", observations, (o) => evaluate({ observations: o, targets, policies }))).toEqual(CONFORMS);
    expect(checkOrderIndependence("targets", targets, (t) => evaluate({ observations, targets: t, policies }))).toEqual(CONFORMS);
    expect(checkOrderIndependence("policies", policies, (p) => evaluate({ observations, targets, policies: p }))).toEqual(CONFORMS);
  });

  it("the result is detached from caller input and deep-frozen", () => {
    const make = () => ({
      weights: contractOf({ observations: PAIR }) as unknown as Rec,
      query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF },
      targets: [target("SYNTH-TARGET-1")] as Rec[],
      policies: [] as Rec[],
      contexts: [{ animalId: A, goalRef: "SYNTH-GOAL-X" }] as Rec[],
    });
    expect(
      checkDetachedResult(
        "evaluatePerformance",
        () => ({ ...make(), weights: structuredClone(make().weights) }),
        (input) => evaluatePerformance(input as never, hash),
        (input) => {
          (input.targets[0].metric as Rec).valueKgPerDay = 5;
          input.contexts[0].goalRef = "SYNTH-GOAL-Z";
          input.query.effectiveAt = D0;
        },
      ),
    ).toEqual(CONFORMS);
    const r = evaluate({ observations, targets, policies });
    expect(isDeepFrozen(r)).toBe(true);
  });

  it("fingerprints: stable under equivalent spellings / order, changed by material inputs", () => {
    const fp = (r: Run) => ok(evaluate(r)).fingerprint.digest;
    const base: Run = { observations, targets, policies };
    const [respelled] = equivalentInstantSpellings(D0).filter((s) => s !== D0);
    expect(
      checkFingerprintStability(
        "C5 result",
        base,
        [
          { label: "observation order", payload: { ...base, observations: [...observations].reverse() } },
          { label: "target order", payload: { ...base, targets: [...targets].reverse() } },
          { label: "equivalent observation instant spelling", payload: { ...base, observations: [obs("w-0", respelled, 200), ...observations.slice(1)] } },
          { label: "equivalent query spelling", payload: { ...base, effectiveAt: "2026-05-01T00:00:00.000000Z" } },
        ],
        [
          { label: "weight value", payload: { ...base, observations: [obs("w-0", D0, 201), ...observations.slice(1)] } },
          { label: "target value", payload: { ...base, targets: [target("SYNTH-TARGET-1", { metric: { kind: "ADG", valueKgPerDay: 1.5 } }), targets[1]] } },
          { label: "target review state", payload: { ...base, targets: [target("SYNTH-TARGET-1", { reviewState: "DRAFT" }), targets[1]] } },
          { label: "policy threshold", payload: { ...base, policies: [policies[0], policy("SYNTH-POLICY-MIN", { kind: "MINIMUM_INTERVAL", minimumDays: 2 })] } },
          { label: "knowledge cutoff", payload: { ...base, knowledgeCutoff: "2026-05-30T00:00:00Z" } },
          { label: "window", payload: { ...base, windowFrom: D45 } },
          { label: "context", payload: { ...base, contexts: [{ animalId: A, goalRef: "SYNTH-GOAL-X" }] } },
          { label: "source binding", payload: { ...base, targets: [target("SYNTH-TARGET-1", { provenance: provenance("2026-01-01T00:00:00Z", { sourceRef: { ...SOURCE_REF, version: "v2" } }) }), targets[1]] } },
        ],
        fp,
      ),
    ).toEqual(CONFORMS);
    const r = ok(evaluate(base));
    // A material target change that preserves every comparison outcome still changes the animal fingerprint.
    const animalFp = (targetFields: Rec) => animal(evaluate({ observations: PAIR, targets: [target("SYNTH-TARGET-1", targetFields)] })).fingerprint.digest;
    expect(animalFp({ applicability: { animalIds: [A] } })).not.toBe(animalFp({}));
    expect(cattle.verifyPerformanceFingerprint("CATTLE_PERFORMANCE_RESULT", (({ fingerprint, ...rest }) => (void fingerprint, rest))(r), r.fingerprint, hash).valid).toBe(true);
    expect(r.animals[0].fingerprint.digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("C5 boundaries", () => {
  it("no clock, network, AI, tooling, legacy livestock constant or later-phase dependency", () => {
    const dir = __dirname;
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sources.length).toBeGreaterThanOrEqual(5);
    for (const f of sources) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/Date\.now|new Date\(|performance\.now|Math\.random|fetch\(|XMLHttpRequest|openai|anthropic|@\/tooling|src\/tooling/);
      expect(text, f).not.toMatch(/from "[^"]*livestock"|targetADGForAnimalType|from "\.\.\/(goals|programmes|recommendations)|from "\.\.\/\.\.\/types"/);
      // Never reads raw weight records or C4 internals: only the C4 barrel.
      expect(text, f).not.toMatch(/weights\/(weight-observation|weight-series|group-scope|weight-read-contract)/);
    }
  });

  it("the engine ships no target, threshold or policy (empty production content)", () => {
    const r = ok(evaluate({ observations: PAIR }));
    expect(r.targetIds).toEqual([]);
    expect(r.policies).toEqual({ minimumInterval: { state: "NONE" }, acceptedBases: { state: "NONE" }, trend: { state: "NONE" } });
  });

  it("the public entry point is reachable through the cattle barrel; trusting helpers are not", () => {
    expect(typeof cattle.evaluatePerformance).toBe("function");
    expect(typeof cattle.computePerformanceFingerprint).toBe("function");
    for (const name of ["derivePerformanceInterval", "performancePoints", "admitPerformanceTargets", "materialisePerformanceTarget", "compareWithTarget", "exactElapsed"]) {
      expect(name in cattle, name).toBe(false);
    }
  });
});
