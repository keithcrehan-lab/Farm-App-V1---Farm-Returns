// @vitest-environment node
/**
 * Self-tests for the shared Cattle conformance kit: each check accepts a
 * conforming engine and detects a violating one, and the kit plugs into the
 * frozen C2 generic bitemporal machinery unchanged. Synthetic data only.
 */
import { describe, expect, it } from "vitest";
import { animalInstantKey, isValidAnimalInstant } from "@/domain/cattle/animal-ledger";
import { collectBitemporalRecords, resolveBitemporalRecords, type BitemporalRecord } from "@/domain/cattle/regulatory/bitemporal-records";
import { toCanonicalPlainData } from "@/domain/cattle/regulatory/canonical-input";
import { computeCattleFingerprint, compareStrings } from "@/domain/cattle/integrity";
import { hash } from "@/domain/cattle/test-fixtures";
import {
  CONFORMS,
  MALFORMED_INSTANTS,
  RESOLVED_LOOKING_STATES,
  allConform,
  checkCorrectionPreservesHistory,
  checkDetachedResult,
  checkDuplicateIdentity,
  checkFingerprintStability,
  checkFutureKnowledgeInvisible,
  checkMalformedKnowledgeTimeFailsClosed,
  checkOrderIndependence,
  checkUnresolvedEvidenceNotMasked,
  conformanceSnapshot,
  cutoffMatrix,
  equivalentInstantSpellings,
  inputPermutations,
  isDeepFrozen,
} from "./cattle-conformance";

const failed = (v: { ok: boolean }) => !v.ok;

describe("cattle conformance kit — primitives", () => {
  it("cutoff matrix brackets the knowledge time exactly", () => {
    const m = cutoffMatrix("2026-03-01T10:00:00Z");
    expect(m).toEqual({ before: "2026-03-01T09:59:59.999999999Z", at: "2026-03-01T10:00:00Z", after: "2026-03-01T11:00:00.000000000Z" });
    expect(() => cutoffMatrix("2026-03-01T10:00:00")).toThrow();
  });

  it("equivalent instant spellings are valid and denote one instant", () => {
    for (const instant of ["2026-03-01T10:00:00Z", "2026-03-01T10:00:00.5Z", "2026-03-01T10:00:00.123456789Z"]) {
      const spellings = equivalentInstantSpellings(instant);
      expect(spellings.length).toBeGreaterThan(0);
      expect(new Set(spellings.map(animalInstantKey)).size).toBe(1);
      expect(spellings.every(isValidAnimalInstant)).toBe(true);
    }
    expect(equivalentInstantSpellings("2026-03-01T10:00:00Z")).toContain("2026-03-01T10:00:00.000000000Z");
  });

  it("every malformed instant is rejected by the C1 instant contract", () => {
    for (const m of MALFORMED_INSTANTS) expect(isValidAnimalInstant(m.value), m.label).toBe(false);
  });

  it("input permutations are deterministic, bounded and distinct", () => {
    const perms = inputPermutations([1, 2, 3, 4]);
    expect(perms[0]).toEqual([1, 2, 3, 4]);
    expect(perms).toContainEqual([4, 3, 2, 1]);
    expect(new Set(perms.map((p) => p.join())).size).toBe(perms.length);
    expect(perms.length).toBeLessThanOrEqual(6);
    expect(inputPermutations([])).toEqual([[]]);
  });

  it("structural snapshot ignores key order but not array order", () => {
    expect(conformanceSnapshot({ a: 1, b: [1, 2] })).toBe(conformanceSnapshot({ b: [1, 2], a: 1 }));
    expect(conformanceSnapshot([1, 2])).not.toBe(conformanceSnapshot([2, 1]));
    expect(conformanceSnapshot(new Map([["b", 1], ["a", 2]]))).toBe(conformanceSnapshot(new Map([["a", 2], ["b", 1]])));
    expect(conformanceSnapshot({ a: undefined })).not.toBe(conformanceSnapshot({ a: null }));
  });

  it("deep-frozen detection", () => {
    expect(isDeepFrozen(Object.freeze({ a: Object.freeze([1]) }))).toBe(true);
    expect(isDeepFrozen(Object.freeze({ a: [1] }))).toBe(false);
  });
});

describe("cattle conformance kit — detects violations", () => {
  const sortedIds = (xs: readonly { id: string }[]) => xs.map((x) => x.id).sort(compareStrings);

  it("order dependence", () => {
    const items = [{ id: "b" }, { id: "a" }, { id: "c" }];
    expect(checkOrderIndependence("sorted", items, sortedIds)).toEqual(CONFORMS);
    const v = checkOrderIndependence("first wins", items, (xs) => xs[0].id);
    expect(failed(v)).toBe(true);
    expect(JSON.stringify(v)).toContain("CAT-INV-012");
  });

  it("future knowledge leakage", () => {
    type Rec = { id: string; receivedAt: string };
    const cases = [{ label: "late record", known: [{ id: "a", receivedAt: "2026-01-01T00:00:00Z" }], later: [{ id: "z", receivedAt: "2026-06-01T00:00:00Z" }], knowledgeCutoff: "2026-02-01T00:00:00Z" }];
    const cutoffFirst = (rs: readonly Rec[], cutoff: string) => sortedIds(rs.filter((r) => animalInstantKey(r.receivedAt) <= animalInstantKey(cutoff)));
    expect(checkFutureKnowledgeInvisible(cases, cutoffFirst)).toEqual(CONFORMS);
    // Leak: relevance computed over every record before the cutoff filter.
    const leaky = (rs: readonly Rec[], cutoff: string) => ({ count: rs.length, ids: cutoffFirst(rs, cutoff) });
    expect(JSON.stringify(checkFutureKnowledgeInvisible(cases, leaky))).toContain("CAT-INV-004");
  });

  it("malformed knowledge time guessed instead of failing closed", () => {
    type Rec = { id: string; receivedAt: unknown };
    const strict = (rs: readonly Rec[]) => (rs.every((r) => isValidAnimalInstant(r.receivedAt)) ? { ok: true } : { ok: false });
    const lenient = (rs: readonly Rec[]) => ({ ok: rs.length >= 0 });
    const make = (value: unknown): Rec => ({ id: "x", receivedAt: value });
    expect(checkMalformedKnowledgeTimeFailsClosed("strict", [], make, strict, (r) => !r.ok)).toEqual(CONFORMS);
    const v = checkMalformedKnowledgeTimeFailsClosed("lenient", [], make, lenient, (r) => !r.ok);
    expect(failed(v) && !v.ok && v.violations.length).toBe(MALFORMED_INSTANTS.length);
    const throws = checkMalformedKnowledgeTimeFailsClosed("throws", [], make, () => { throw new Error("boom"); }, () => true);
    expect(JSON.stringify(throws)).toContain("threw instead of failing closed");
  });

  it("duplicate identity: last-wins instead of failing closed", () => {
    type Rec = { id: string; v: number };
    const strict = (rs: readonly Rec[]) => {
      const byId = new Map<string, number>();
      for (const r of rs) if (byId.has(r.id) && byId.get(r.id) !== r.v) return { ok: false }; else byId.set(r.id, r.v);
      return { ok: true, ids: [...byId.keys()].sort(compareStrings) };
    };
    const lastWins = (rs: readonly Rec[]) => ({ ok: true, ids: [...new Map(rs.map((r) => [r.id, r.v])).keys()].sort(compareStrings) });
    const recs = [{ id: "a", v: 1 }];
    const conflicting = [{ label: "different value", record: { id: "a", v: 2 } }];
    expect(checkDuplicateIdentity("strict", recs, { id: "a", v: 1 }, conflicting, strict, (r) => !r.ok)).toEqual(CONFORMS);
    expect(JSON.stringify(checkDuplicateIdentity("last wins", recs, { id: "a", v: 1 }, conflicting, lastWins, (r) => !r.ok))).toContain("CAT-INV-008");
  });

  it("unresolved evidence masked by a resolved-looking status", () => {
    const cases = [
      { label: "DOB unknown", result: { state: "UNKNOWN" } },
      { label: "evidence conflicting", result: { state: "SATISFIED" } },
    ];
    const v = checkUnresolvedEvidenceNotMasked(cases, (r) => [r.state], RESOLVED_LOOKING_STATES);
    expect(v).toEqual({ ok: false, violations: ["CAT-INV-009 [evidence conflicting]: unresolved required evidence surfaced as SATISFIED"] });
  });

  it("aliased, unfrozen result", () => {
    const detached = (input: { xs: number[] }) => Object.freeze({ xs: Object.freeze([...input.xs]) });
    const aliased = (input: { xs: number[] }) => ({ xs: input.xs });
    const make = () => ({ xs: [1, 2] });
    const mutate = (input: { xs: number[] }) => void input.xs.push(3);
    expect(checkDetachedResult("detached", make, detached, mutate)).toEqual(CONFORMS);
    const v = JSON.stringify(checkDetachedResult("aliased", make, aliased, mutate));
    expect(v).toContain("changed after the caller mutated");
    expect(v).toContain("not deep-frozen");
  });

  it("fingerprint sensitive to representation, or blind to material change", () => {
    const semantic = (p: { at: string; kg: number }) => computeCattleFingerprint("CATTLE_EVIDENCE_PACK", { at: animalInstantKey(p.at), kg: p.kg }, hash).digest;
    const textual = (p: { at: string; kg: number }) => computeCattleFingerprint("CATTLE_EVIDENCE_PACK", p, hash).digest;
    const base = { at: "2026-03-01T10:00:00Z", kg: 410 };
    const equivalent = equivalentInstantSpellings(base.at).map((at) => ({ label: at, payload: { at, kg: 410 } }));
    const material = [{ label: "weight", payload: { at: base.at, kg: 411 } }];
    expect(checkFingerprintStability("semantic", base, equivalent, material, semantic)).toEqual(CONFORMS);
    expect(JSON.stringify(checkFingerprintStability("textual", base, equivalent, material, textual))).toContain("CAT-INV-010");
    expect(JSON.stringify(checkFingerprintStability("blind", base, equivalent, material, () => "same"))).toContain("material change did not change");
  });

  it("verdicts merge", () => {
    expect(allConform([CONFORMS, CONFORMS])).toEqual(CONFORMS);
    expect(allConform([CONFORMS, { ok: false, violations: ["x"] }])).toEqual({ ok: false, violations: ["x"] });
  });
});

/**
 * Plug-in demonstration over FROZEN C2 generic machinery (unchanged): a
 * phase-shaped engine = canonical boundary → knowledge-time validation →
 * C2 collection (identity before validity) → C2 as-of-cutoff resolution.
 */
describe("cattle conformance kit — plugs into the frozen C2 bitemporal machinery", () => {
  interface SynthRecord extends BitemporalRecord {
    value: number;
  }
  const rec = (recordId: string, receivedAt: unknown, value: number, supersedes: string[] = []) =>
    ({ recordId, receivedAt, value, supersedes }) as SynthRecord;
  const contentKey = (r: SynthRecord) => JSON.stringify([r.recordId, animalInstantKey(r.receivedAt), r.value, r.supersedes]);

  function engine(records: readonly unknown[], knowledgeCutoff: string) {
    const canonical = toCanonicalPlainData(records);
    if (!canonical.ok) return { ok: false as const, reason: "NON_CANONICAL" };
    const rs = canonical.value as SynthRecord[];
    if (!rs.every((r) => isValidAnimalInstant(r.receivedAt))) return { ok: false as const, reason: "INVALID_KNOWLEDGE_TIME" };
    const collected = collectBitemporalRecords(rs, contentKey);
    if (!collected.ok) return { ok: false as const, reason: "IDENTITY_CONFLICT" };
    const resolution = resolveBitemporalRecords(collected.records, knowledgeCutoff, { linkAllowed: () => true, competitionKey: (r) => String(r.value) });
    return {
      ok: true as const,
      live: resolution.live.map((r) => [r.recordId, r.value]),
      known: resolution.known.map((r) => r.recordId),
      competitions: resolution.competitions.map((c) => c.targetId),
    };
  }

  const a = rec("SYNTH-A", "2026-01-10T00:00:00Z", 1);
  const b = rec("SYNTH-B", "2026-01-20T00:00:00Z", 2);
  const correction = rec("SYNTH-A2", "2026-03-01T00:00:00Z", 5, ["SYNTH-A"]);
  const cutoff = "2026-02-01T00:00:00Z";

  it("conforms across the shared invariant matrix", () => {
    const m = cutoffMatrix(correction.receivedAt);
    const verdicts = [
      checkOrderIndependence("C2 collect+resolve", [a, b, correction], (rs) => engine(rs, m.after)),
      checkFutureKnowledgeInvisible(
        [
          { label: "well-formed late correction", known: [a, b], later: [correction], knowledgeCutoff: cutoff },
          { label: "late correction just after cutoff", known: [a, b], later: [correction], knowledgeCutoff: m.before },
        ],
        engine,
      ),
      checkMalformedKnowledgeTimeFailsClosed("C2 records", [a, b], (t) => rec("SYNTH-X", t, 9), (rs) => engine(rs, cutoff), (r) => !r.ok),
      checkCorrectionPreservesHistory("C2 supersession", [a, b], correction, { beforeCorrection: m.before, afterCorrection: m.at }, engine, (r) => (r.ok ? r.known : []), "SYNTH-A"),
      checkDuplicateIdentity(
        "C2 identity",
        [a, b],
        rec("SYNTH-A", "2026-01-10T00:00:00.000Z", 1),
        [
          { label: "different value", record: rec("SYNTH-A", a.receivedAt, 7) },
          { label: "different knowledge time", record: rec("SYNTH-A", "2026-01-11T00:00:00Z", 1) },
        ],
        (rs) => engine(rs, cutoff),
        (r) => !r.ok,
      ),
    ];
    expect(allConform(verdicts)).toEqual(CONFORMS);
  });

  it("rejects non-canonical input at the boundary (CAT-INV-001)", () => {
    const hostile = { ...a, get value() { return 1; } };
    expect(engine([hostile], cutoff)).toEqual({ ok: false, reason: "NON_CANONICAL" });
  });
});
