/**
 * Cattle C4 — weight observations and group scope. Synthetic data only: every
 * animal, group, device, quality scheme and weight is a fictional `SYNTH-*`
 * fixture with no biological meaning.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONFORMS,
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
  cutoffMatrix,
  equivalentInstantSpellings,
  isDeepFrozen,
} from "@/tooling/cattle-conformance/cattle-conformance";
import { createAnimalLedger, type AnimalLedger } from "../animal-ledger";
import * as cattle from "../index";
import { hash } from "../test-fixtures";
import { resolveGroupScope, type ScopeResult } from "./group-scope";
import { buildWeightReadContract, verifyWeightReadContract, type WeightReadContract } from "./weight-read-contract";
import { projectWeightSeries, type AnimalWeightSeries, type WeightSeriesResult } from "./weight-series";

const A = "SYNTH-ANIMAL-1";
const B = "SYNTH-ANIMAL-2";
const C = "SYNTH-ANIMAL-3";
const D = "SYNTH-ANIMAL-4";
const E = "SYNTH-ANIMAL-5";
const G = "SYNTH-GROUP-G";
const H = "SYNTH-GROUP-H";
const T1 = "2026-05-01T08:00:00Z";
const T2 = "2026-05-10T08:00:00Z";
const RECEIVED = "2026-05-20T12:00:00Z";
const EFFECTIVE = "2026-06-01T00:00:00Z";
const CUTOFF = "2026-12-31T00:00:00Z";

type Rec = Record<string, unknown>;

function obs(recordId: string, fields: Rec = {}, receivedAt = RECEIVED): Rec {
  return {
    recordId,
    animalId: A,
    observedAt: T1,
    weight: { value: 412.5, unit: "KILOGRAM" },
    method: "SCALE",
    provenance: { sourceCategory: "DEVICE", receivedAt },
    ...fields,
  };
}
const kg = (value: number, unit = "KILOGRAM") => ({ value, unit });

const run = (observations: unknown[], animalIds: string[] = [A], query: Rec = { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF }): WeightSeriesResult =>
  projectWeightSeries({ observations, animalIds, query } as never, hash);
const at = (cutoff: string, effectiveAt = EFFECTIVE) => ({ effectiveAt, knowledgeCutoff: cutoff });

function ok(result: WeightSeriesResult) {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.projection;
}
const codes = (result: { ok: boolean; issues?: { code: string }[] }) => (result.ok ? [] : (result.issues ?? []).map((i) => i.code));
const seriesOf = (result: WeightSeriesResult, id = A): AnimalWeightSeries => ok(result).series.find((s) => s.animalId === id)!;
const failsClosed = (result: { ok: boolean }) => !result.ok;

// ---------------------------------------------------------------------------
// Group-scope fixtures (C1 MANAGEMENT_GROUP assertions only)
// ---------------------------------------------------------------------------

interface GroupFixture {
  id: string;
  value: string;
  from: string;
  to?: string | null;
  supersedes?: string[];
  receivedAt?: string;
}

function ledger(animalId: string, groups: GroupFixture[]): AnimalLedger {
  const result = createAnimalLedger(
    animalId,
    groups.map((g) => ({
      assertionId: g.id,
      animalId,
      kind: "MANAGEMENT_GROUP",
      value: g.value,
      validFrom: g.from,
      validTo: g.to ?? null,
      supersedes: g.supersedes ?? [],
      provenance: { sourceCategory: "FARMER", receivedAt: g.receivedAt ?? "2026-01-01T00:00:00Z" },
    })),
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.ledger;
}

const LEDGERS = [
  ledger(A, [{ id: "g-a", value: G, from: "2026-01-01T00:00:00Z" }]),
  ledger(B, [
    { id: "g-b1", value: G, from: "2026-01-01T00:00:00Z", to: "2026-05-15T00:00:00Z" },
    { id: "g-b2", value: H, from: "2026-05-15T00:00:00Z" },
  ]),
  ledger(C, []),
  ledger(D, [
    { id: "g-d1", value: G, from: "2026-01-01T00:00:00Z" },
    { id: "g-d2", value: H, from: "2026-02-01T00:00:00Z" },
  ]),
  ledger(E, [{ id: "g-e1", value: G, from: "2026-01-01T00:00:00Z", supersedes: ["g-missing"] }]),
];

const scopeOf = (ledgers: AnimalLedger[] = LEDGERS, query: Rec = { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF }, groupRef: unknown = G): ScopeResult =>
  resolveGroupScope({ scope: { kind: "GROUP", groupRef, ledgers }, query } as never, hash);
function scopeOk(result: ScopeResult) {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.scope;
}

// ---------------------------------------------------------------------------

describe("C4 weight observation record", () => {
  it("round-trips a valid observation with provenance, method, device, quality and conditions preserved", () => {
    const full = obs("w-1", {
      deviceRef: "SYNTH-SCALE-7",
      quality: { scheme: "SYNTH-QUALITY", value: "SYNTH-GRADE-B" },
      conditionsNote: "synthetic: weighed after overnight fast",
      provenance: { sourceCategory: "DEVICE", sourceSystem: "SYNTH-SYSTEM", sourceRecordRef: "SYNTH-REC-1", observedAt: "2026-05-01T08:00:05Z", receivedAt: RECEIVED, actor: "SYNTH-ACTOR" },
    });
    const s = seriesOf(run([full]));
    expect(s.observations).toHaveLength(1);
    const e = s.observations[0];
    expect(e.observation).toEqual({ ...full, supersedes: [] });
    expect(e.canonicalWeight).toEqual({ state: "CONVERTED", kg: 412.5, conversion: "IDENTITY" });
    expect(e.measurementBasis).toBe("MEASURED");
    expect(e.informationClass).toBe("OBSERVATION");
    expect(s.latest).toEqual({ state: "KNOWN", observedAt: "2026-05-01T08:00:00.000000000Z", kg: 412.5, recordIds: ["w-1"], candidateKg: [], reasonCodes: [] });
  });

  it("optional fields absent stay explicit null — no invented device, quality or confidence", () => {
    const e = seriesOf(run([obs("w-1")])).observations[0].observation;
    expect(e.deviceRef).toBeNull();
    expect(e.quality).toBeNull();
    expect(e.conditionsNote).toBeNull();
    expect(e.provenance).toEqual({ sourceCategory: "DEVICE", sourceSystem: null, sourceRecordRef: null, observedAt: null, receivedAt: RECEIVED, actor: null });
  });

  it.each([
    ["zero", { weight: kg(0) }, "CATTLE_WEIGHT_RECORD_INVALID_VALUE"],
    ["negative", { weight: kg(-3) }, "CATTLE_WEIGHT_RECORD_INVALID_VALUE"],
    ["numeric string", { weight: { value: "412", unit: "KILOGRAM" } }, "CATTLE_WEIGHT_RECORD_INVALID_VALUE"],
    ["value missing", { weight: { unit: "KILOGRAM" } }, "CATTLE_WEIGHT_RECORD_INVALID_VALUE"],
    ["weight missing", { weight: undefined }, "CATTLE_WEIGHT_RECORD_INVALID_VALUE"],
    ["bare number", { weight: 412 }, "CATTLE_WEIGHT_RECORD_INVALID_VALUE"],
    ["unit-less", { weight: { value: 412 } }, "CATTLE_WEIGHT_RECORD_MISSING_UNIT"],
    ["null unit", { weight: { value: 412, unit: null } }, "CATTLE_WEIGHT_RECORD_MISSING_UNIT"],
    ["abbreviated unit", { weight: kg(412, "KG") }, "CATTLE_WEIGHT_RECORD_UNKNOWN_UNIT"],
    ["lower-case unit", { weight: kg(412, "kilogram") }, "CATTLE_WEIGHT_RECORD_UNKNOWN_UNIT"],
    ["unknown unit", { weight: kg(412, "SYNTH-STONE") }, "CATTLE_WEIGHT_RECORD_UNKNOWN_UNIT"],
    ["extra weight field", { weight: { value: 412, unit: "KILOGRAM", rounded: 410 } }, "CATTLE_WEIGHT_RECORD_INVALID_VALUE"],
    ["unknown method", { method: "MEASURED" }, "CATTLE_WEIGHT_RECORD_INVALID_METHOD"],
    ["missing observation instant", { observedAt: undefined }, "CATTLE_WEIGHT_RECORD_INVALID_OBSERVED_AT"],
    ["offset observation instant", { observedAt: "2026-05-01T08:00:00+00:00" }, "CATTLE_WEIGHT_RECORD_INVALID_OBSERVED_AT"],
    ["empty quality value", { quality: { scheme: "SYNTH-Q", value: "" } }, "CATTLE_WEIGHT_RECORD_INVALID_QUALITY"],
    ["padded device ref", { deviceRef: " SYNTH-SCALE " }, "CATTLE_WEIGHT_RECORD_INVALID_DEVICE"],
    ["empty conditions note", { conditionsNote: "" }, "CATTLE_WEIGHT_RECORD_INVALID_CONDITIONS"],
    ["unsupported field", { adg: 1 }, "CATTLE_WEIGHT_RECORD_UNSUPPORTED_FIELD"],
    ["bad source category", { provenance: { sourceCategory: "SCALE", receivedAt: RECEIVED } }, "CATTLE_WEIGHT_RECORD_INVALID_PROVENANCE"],
    ["blank animal id", { animalId: "" }, "CATTLE_WEIGHT_RECORD_INVALID_ANIMAL_ID"],
  ])("rejects %s (fail closed, never coerced)", (_label, fields, code) => {
    const result = run([obs("w-1", fields as Rec)]);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain(code);
  });

  it.each([
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["NaN", Number.NaN],
  ])("rejects a non-finite weight (%s) at the canonical boundary", (_label, value) => {
    expect(codes(run([obs("w-1", { weight: kg(value) })]))).toEqual(["CATTLE_WEIGHT_NON_CANONICAL_INPUT"]);
  });

  it("a recognised unit without an exact conversion is UNSUPPORTED — never silently converted, recorded value kept", () => {
    const s = seriesOf(run([obs("w-1", { weight: kg(900, "POUND") })]));
    expect(s.observations[0].observation.weight).toEqual({ value: 900, unit: "POUND" });
    expect(s.observations[0].canonicalWeight).toEqual({ state: "UNSUPPORTED", kg: null, conversion: null });
    expect(s.latest).toMatchObject({ state: "UNSUPPORTED", kg: null, reasonCodes: ["CATTLE_WEIGHT_UNIT_NOT_CONVERTIBLE"] });
    // An earlier convertible weight is never substituted for the unsupported latest one.
    const withEarlier = seriesOf(run([obs("w-0", { observedAt: "2026-04-01T08:00:00Z" }), obs("w-1", { weight: kg(900, "POUND") })]));
    expect(withEarlier.latest.state).toBe("UNSUPPORTED");
    expect(withEarlier.latest.kg).toBeNull();
    expect(cattle.WEIGHT_UNIT_CONVERSIONS).toEqual({ KILOGRAM: "IDENTITY", POUND: null });
  });
});

describe("C4 collection method — an estimate is never relabelled as a measurement", () => {
  it.each([
    ["SCALE", "MEASURED", "OBSERVATION"],
    ["WEIGHBRIDGE", "MEASURED", "OBSERVATION"],
    ["ESTIMATE_VISUAL", "ESTIMATED", "OBSERVATION"],
    ["ESTIMATE_TAPE", "ESTIMATED", "OBSERVATION"],
    ["DERIVED_EXTERNAL", "DERIVED", "DERIVED_VALUE"],
    ["UNKNOWN", "UNKNOWN", "OBSERVATION"],
  ])("%s keeps its method; basis %s; class %s", (method, basis, informationClass) => {
    const s = seriesOf(run([obs("w-1", { method })]));
    expect(s.observations[0].observation.method).toBe(method);
    expect(s.observations[0].measurementBasis).toBe(basis);
    expect(s.observations[0].informationClass).toBe(informationClass);
    expect(s.latest.state).toBe("KNOWN");
  });

  it("a correction cannot change the collection method (estimate → scale is a new observation, not a correction)", () => {
    const estimate = obs("w-1", { method: "ESTIMATE_VISUAL" });
    const relabel = obs("w-2", { method: "SCALE", supersedes: ["w-1"] }, "2026-05-21T00:00:00Z");
    expect(codes(run([estimate, relabel]))).toEqual(["CATTLE_WEIGHT_SUPERSESSION_OUT_OF_SCOPE"]);
  });
});

describe("C4 append-only ledger semantics", () => {
  const original = obs("w-1", { weight: kg(400) });
  const correction = obs("w-2", { weight: kg(404), supersedes: ["w-1"] }, "2026-07-01T00:00:00Z");

  it("a correction supersedes; history keeps the corrected record", () => {
    const s = seriesOf(run([original, correction]));
    expect(s.observations.map((e) => e.recordId)).toEqual(["w-2"]);
    expect(s.history.map((e) => [e.recordId, e.status, e.supersededBy])).toEqual([
      ["w-1", "SUPERSEDED", ["w-2"]],
      ["w-2", "LIVE", []],
    ]);
    expect(s.latest.kg).toBe(404);
  });

  it("CAT-INV-013: an earlier cutoff reproduces the earlier series and fingerprint after a later correction", () => {
    const before = "2026-06-15T00:00:00Z";
    const evaluate = (records: readonly unknown[], cutoff: string) => run([...records], [A], at(cutoff));
    expect(
      checkCorrectionPreservesHistory("weight correction", [original], correction, { beforeCorrection: before, afterCorrection: CUTOFF }, evaluate, (r) => (r.ok ? r.projection.series[0].history.map((e) => e.recordId) : []), "w-1"),
    ).toEqual(CONFORMS);
    expect(seriesOf(evaluate([original, correction], before)).fingerprint).toEqual(seriesOf(evaluate([original], before)).fingerprint);
    expect(seriesOf(evaluate([original, correction], before)).latest.kg).toBe(400);
  });

  it("CAT-INV-008: identical duplicate (equivalent spelling) is idempotent; same id + different content fails closed, invalid copy included", () => {
    const spelled = obs("w-1", { weight: kg(400), observedAt: "2026-05-01T08:00:00.000Z" }, "2026-05-20T12:00:00.0Z");
    const withSpelled = run([original, spelled]);
    expect(withSpelled.ok).toBe(true);
    expect(seriesOf(withSpelled).fingerprint).toEqual(seriesOf(run([original])).fingerprint);
    expect(seriesOf(withSpelled).knownRecordIds).toEqual(["w-1"]);
    expect(
      checkDuplicateIdentity(
        "weight record",
        [original],
        structuredClone(original),
        [
          { label: "different value", record: obs("w-1", { weight: kg(401) }) },
          { label: "different method", record: obs("w-1", { weight: kg(400), method: "ESTIMATE_TAPE" }) },
          { label: "invalid copy", record: obs("w-1", { weight: kg(-1) }) },
          { label: "different unit", record: obs("w-1", { weight: kg(400, "POUND") }) },
        ],
        (records) => run([...records]),
        failsClosed,
      ),
    ).toEqual(CONFORMS);
    expect(codes(run([original, obs("w-1", { weight: kg(-1) })]))).toContain("CATTLE_WEIGHT_RECORD_DUPLICATE_ID_DIFFERENT_CONTENT");
  });

  it("the kept spelling of an idempotent duplicate is independent of input order", () => {
    const spelled = obs("w-1", { weight: kg(400), observedAt: "2026-05-01T08:00:00.000Z" });
    expect(ok(run([original, spelled]))).toEqual(ok(run([spelled, original])));
  });

  it("competing corrections stay in conflict — no latest-wins, no winner", () => {
    const c1 = obs("w-2", { weight: kg(404), supersedes: ["w-1"] }, "2026-05-21T00:00:00Z");
    const c2 = obs("w-3", { weight: kg(408), supersedes: ["w-1"] }, "2026-05-22T00:00:00Z");
    const s = seriesOf(run([original, c1, c2]));
    expect(s.competitions).toEqual([{ targetId: "w-1", terminalIds: ["w-2", "w-3"] }]);
    expect(s.observations.every((e) => e.inCompetition)).toBe(true);
    expect(s.latest).toMatchObject({ state: "EVIDENCE_CONFLICT", kg: null, candidateKg: [404, 408] });
    expect(s.latest.reasonCodes).toContain("CATTLE_WEIGHT_COMPETING_CORRECTIONS");
  });

  it("a competing correction moved before the latest observation does not contaminate an uncontested later weight", () => {
    const c1 = obs("w-2", { weight: kg(404), observedAt: "2026-04-20T08:00:00Z", supersedes: ["w-1"] });
    const c2 = obs("w-3", { weight: kg(408), observedAt: "2026-07-20T08:00:00Z", supersedes: ["w-1"] });
    const later = obs("w-9", { weight: kg(430), observedAt: T2 });
    const s = seriesOf(run([original, c1, c2, later]));
    expect(s.notYetObservedRecordIds).toEqual(["w-3"]);
    expect(s.latest).toMatchObject({ state: "KNOWN", kg: 430, recordIds: ["w-9"] });
  });

  it.each([
    ["unknown target", [obs("w-2", { supersedes: ["w-404"] })], "CATTLE_WEIGHT_SUPERSESSION_TARGET_NOT_KNOWN"],
    ["target not yet known at the cutoff", [obs("w-1", {}, "2027-02-01T00:00:00Z"), obs("w-2", { supersedes: ["w-1"] })], "CATTLE_WEIGHT_SUPERSESSION_TARGET_NOT_KNOWN"],
    ["another animal", [obs("w-1"), obs("w-2", { animalId: B, supersedes: ["w-1"] })], "CATTLE_WEIGHT_SUPERSESSION_OUT_OF_SCOPE"],
    ["cycle", [obs("w-1", { supersedes: ["w-2"] }), obs("w-2", { supersedes: ["w-1"] })], "CATTLE_WEIGHT_SUPERSESSION_CYCLE"],
    ["self", [obs("w-1", { supersedes: ["w-1"] })], "CATTLE_WEIGHT_RECORD_SELF_SUPERSESSION"],
  ])("a malformed supersession (%s) fails closed", (_label, records, code) => {
    const result = run(records);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain(code);
  });
});

describe("C4 latest-known weight", () => {
  it("no observation ⇒ NONE, never zero", () => {
    const s = seriesOf(run([], [A]));
    expect(s.latest).toEqual({ state: "NONE", observedAt: null, kg: null, recordIds: [], candidateKg: [], reasonCodes: ["CATTLE_WEIGHT_NO_OBSERVATION"] });
    expect(s.observations).toEqual([]);
    const onlyLater = seriesOf(run([obs("w-1", { observedAt: "2026-07-01T00:00:00Z" })]));
    expect(onlyLater.latest.state).toBe("NONE");
    expect(onlyLater.notYetObservedRecordIds).toEqual(["w-1"]);
  });

  it("two distinct live weights at the same instant ⇒ conflict, never averaged (equivalent spellings are the same instant)", () => {
    const s = seriesOf(run([obs("w-1", { weight: kg(400) }), obs("w-2", { weight: kg(410), observedAt: "2026-05-01T08:00:00.000Z" })]));
    expect(s.latest).toEqual({
      state: "EVIDENCE_CONFLICT",
      observedAt: "2026-05-01T08:00:00.000000000Z",
      kg: null,
      recordIds: ["w-1", "w-2"],
      candidateKg: [400, 410],
      reasonCodes: ["CATTLE_WEIGHT_SAME_INSTANT_OBSERVATIONS"],
    });
    expect(s.latest.candidateKg).not.toContain(405);
  });

  it("several distinct live observations at the same instant conflict even when their values agree", () => {
    const s = seriesOf(run([obs("w-1", { weight: kg(400) }), obs("w-2", { weight: kg(400), method: "ESTIMATE_VISUAL" })]));
    expect(s.latest).toMatchObject({ state: "EVIDENCE_CONFLICT", kg: null, candidateKg: [400] });
  });

  it("an earlier same-instant conflict does not mask a later single observation", () => {
    const s = seriesOf(run([obs("w-1", { weight: kg(400) }), obs("w-2", { weight: kg(410) }), obs("w-3", { weight: kg(420), observedAt: T2 })]));
    expect(s.latest).toMatchObject({ state: "KNOWN", kg: 420 });
    expect(s.observations.map((e) => e.recordId)).toEqual(["w-1", "w-2", "w-3"]);
  });

  it("CAT-INV-009: unresolved latest-known evidence never surfaces as KNOWN or a resolved-looking state", () => {
    const cases = [
      { label: "no observation", result: seriesOf(run([])) },
      { label: "same-instant conflict", result: seriesOf(run([obs("w-1"), obs("w-2", { weight: kg(1) })])) },
      { label: "unsupported unit", result: seriesOf(run([obs("w-1", { weight: kg(9, "POUND") })])) },
    ];
    expect(checkUnresolvedEvidenceNotMasked(cases, (s) => [s.latest.state], [...RESOLVED_LOOKING_STATES, "KNOWN"])).toEqual(CONFORMS);
    expect(cases.every((c) => c.result.latest.kg === null)).toBe(true);
  });
});

describe("C4 historical series — bitemporal admission", () => {
  const base = [obs("w-1", { weight: kg(400) }), obs("w-2", { weight: kg(420), observedAt: T2 })];

  it("excludes observations after effectiveAt and records received after the cutoff", () => {
    const s = seriesOf(run([...base, obs("w-3", { observedAt: "2026-07-01T00:00:00Z" }), obs("w-4", { observedAt: T2 }, "2027-01-05T00:00:00Z")]));
    expect(s.observations.map((e) => e.recordId)).toEqual(["w-1", "w-2"]);
    expect(s.notYetObservedRecordIds).toEqual(["w-3"]);
    expect(s.knownRecordIds).toEqual(["w-1", "w-2", "w-3"]);
    const earlier = seriesOf(run(base, [A], at(CUTOFF, "2026-05-05T00:00:00Z")));
    expect(earlier.observations.map((e) => e.recordId)).toEqual(["w-1"]);
    expect(earlier.latest.kg).toBe(400);
  });

  it("CAT-INV-003/004/006: cutoff before/at/after — later records (incl. malformed content) are invisible", () => {
    const lateReceived = "2026-08-01T00:00:00Z";
    const m = cutoffMatrix(lateReceived);
    const later = [
      obs("w-5", { weight: kg(430) }, "2026-08-01T00:00:00.000000001Z"),
      obs("w-6", { weight: kg(-5) }, "2026-08-02T00:00:00Z"),
      obs("w-7", { weight: kg(10, "SYNTH-STONE"), method: "GUESS" }, "2026-08-02T00:00:00Z"),
      obs("w-1", { weight: kg(999) }, "2026-08-03T00:00:00Z"),
      obs("w-8", { supersedes: ["w-404"] }, "2026-08-03T00:00:00Z"),
    ];
    const evaluate = (records: readonly unknown[], cutoff: string) => run([...records], [A], at(cutoff));
    expect(
      checkFutureKnowledgeInvisible(
        [
          { label: "before", known: base, later: [obs("w-5", {}, lateReceived), ...later], knowledgeCutoff: m.before },
          { label: "at", known: [...base, obs("w-5", {}, lateReceived)], later, knowledgeCutoff: m.at },
          { label: "after", known: [...base, obs("w-5", {}, lateReceived)], later: later.map((r) => ({ ...r, provenance: { sourceCategory: "DEVICE", receivedAt: "2026-09-01T00:00:00Z" } })), knowledgeCutoff: m.after },
        ],
        evaluate,
      ),
    ).toEqual(CONFORMS);
    expect(seriesOf(evaluate([...base, obs("w-5", {}, lateReceived)], m.before)).knownRecordIds).toEqual(["w-1", "w-2"]);
    expect(seriesOf(evaluate([...base, obs("w-5", {}, lateReceived)], m.at)).knownRecordIds).toEqual(["w-1", "w-2", "w-5"]);
  });

  it("CAT-INV-005: a malformed or missing receivedAt fails closed (never guessed in or out)", () => {
    expect(
      checkMalformedKnowledgeTimeFailsClosed(
        "weight receivedAt",
        base,
        (value) => obs("w-9", { provenance: { sourceCategory: "DEVICE", receivedAt: value } }),
        (records) => run([...records]),
        failsClosed,
      ),
    ).toEqual(CONFORMS);
  });

  it("CAT-INV-012: series and latest are independent of input order", () => {
    const records = [...base, obs("w-3", { weight: kg(401) }), obs("w-4", { animalId: B }), obs("w-5", { weight: kg(422), supersedes: ["w-2"] }, "2026-06-01T00:00:00Z")];
    expect(checkOrderIndependence("weight series", records, (r) => run(r, [A, B]))).toEqual(CONFORMS);
    expect(checkOrderIndependence("animal set", [A, B, C], (ids) => run(records, ids))).toEqual(CONFORMS);
  });

  it("another animal's records never change this animal's series fingerprint; malformed ones still fail closed", () => {
    const alone = seriesOf(run(base, [A, B]));
    const withB = seriesOf(run([...base, obs("w-b", { animalId: B })], [A, B]));
    expect(withB.fingerprint).toEqual(alone.fingerprint);
    expect(seriesOf(run([...base, obs("w-b", { animalId: B })], [A, B]), B).latest.state).toBe("KNOWN");
    expect(run([...base, obs("w-b", { animalId: C, weight: kg(0) })], [A]).ok).toBe(false);
  });

  it.each([
    ["effectiveAt", { effectiveAt: "2026-06-01", knowledgeCutoff: CUTOFF }, "CATTLE_WEIGHT_INVALID_EFFECTIVE_AT"],
    ["knowledgeCutoff", { effectiveAt: EFFECTIVE, knowledgeCutoff: "2026-12-31T00:00:00+01:00" }, "CATTLE_WEIGHT_INVALID_KNOWLEDGE_CUTOFF"],
    ["missing knowledgeCutoff (never defaulted to effectiveAt)", { effectiveAt: EFFECTIVE }, "CATTLE_WEIGHT_INVALID_KNOWLEDGE_CUTOFF"],
    ["unknown query field", { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, now: true }, "CATTLE_WEIGHT_INVALID_REQUEST"],
  ])("invalid query (%s) fails closed", (_label, query, code) => {
    expect(codes(run(base, [A], query))).toEqual([code]);
  });

  it.each([
    ["duplicate ids", [A, A]],
    ["padded id", [" SYNTH-ANIMAL-1"]],
    ["not an array", A],
  ])("invalid animal set (%s) fails closed", (_label, animalIds) => {
    expect(codes(projectWeightSeries({ observations: base, animalIds, query: at(CUTOFF) } as never, hash))).toEqual(["CATTLE_WEIGHT_INVALID_ANIMAL_SET"]);
  });
});

describe("C4 canonical input boundary (CAT-INV-001)", () => {
  const getterList = () => {
    const list: unknown[] = [];
    Object.defineProperty(list, "0", { get: () => obs("w-1"), enumerable: true });
    Object.defineProperty(list, "length", { value: 1 });
    return list;
  };
  const withGetter = () => {
    const o = obs("w-1");
    Object.defineProperty(o, "weight", { get: () => kg(400), enumerable: true });
    return o;
  };

  it.each([
    ["collection getter", () => ({ observations: getterList(), animalIds: [A], query: at(CUTOFF) })],
    ["element getter", () => ({ observations: [withGetter()], animalIds: [A], query: at(CUTOFF) })],
    ["class instance", () => ({ observations: [obs("w-1", { observedAt: new Date(0) })], animalIds: [A], query: at(CUTOFF) })],
    ["function", () => ({ observations: [obs("w-1", { method: () => "SCALE" })], animalIds: [A], query: at(CUTOFF) })],
  ])("weight series rejects non-canonical input (%s) before evaluation", (_label, make) => {
    expect(codes(projectWeightSeries(make() as never, hash))).toEqual(["CATTLE_WEIGHT_NON_CANONICAL_INPUT"]);
  });

  it("group scope and read contract reject non-canonical input", () => {
    const ledgers = [...LEDGERS];
    Object.defineProperty(ledgers, "extra", { get: () => 1, enumerable: false });
    expect(codes(resolveGroupScope({ scope: { kind: "GROUP", groupRef: G, ledgers }, query: at(CUTOFF) }, hash))).toEqual(["CATTLE_SCOPE_NON_CANONICAL_INPUT"]);
    expect(codes(buildWeightReadContract({ observations: getterList(), scope: { kind: "EXPLICIT_SET", animalIds: [A] }, query: at(CUTOFF) }, hash))).toEqual(["CATTLE_WEIGHT_NON_CANONICAL_INPUT"]);
  });
});

describe("C4 group scope (C1 MANAGEMENT_GROUP, no new group truth)", () => {
  it("resolves members at the instant; unknown, conflicting and invalid animals are reported, never silently in or out", () => {
    const s = scopeOk(scopeOf());
    expect(s.members).toEqual([A]);
    expect(s.notMembers).toEqual([B]);
    expect(s.unknown).toEqual([C]);
    expect(s.conflict).toEqual([D]);
    expect(s.invalid).toEqual([E]);
    expect(s.animals.find((a) => a.animalId === D)!.conflictingGroups).toEqual([G, H]);
    expect(s.animals.find((a) => a.animalId === B)!.group).toBe(H);
    expect(s.animals.find((a) => a.animalId === A)!.evidence.map((e) => e.assertionId)).toEqual(["g-a"]);
    expect(s.history).toBeNull();
    // Earlier instant: B was still in G.
    expect(scopeOk(scopeOf(LEDGERS, { effectiveAt: "2026-05-01T00:00:00Z", knowledgeCutoff: CUTOFF })).members).toEqual([A, B]);
  });

  it("CAT-INV-009: unresolved membership never surfaces as MEMBER / NOT_MEMBER", () => {
    const s = scopeOk(scopeOf());
    const cases = [C, D, E].map((id) => ({ label: id, result: s.animals.find((a) => a.animalId === id)! }));
    expect(checkUnresolvedEvidenceNotMasked(cases, (a) => [a.state], [...RESOLVED_LOOKING_STATES, "MEMBER", "NOT_MEMBER"])).toEqual(CONFORMS);
  });

  it("reports membership changes between two instants", () => {
    const s = scopeOk(scopeOf(LEDGERS, { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, historyFrom: "2026-04-01T00:00:00Z" }));
    const historyOf = (id: string) => s.history!.animals.find((a) => a.animalId === id)!.segments.map((g) => [g.from, g.membership.state, g.membership.group]);
    expect(s.history!.from).toBe("2026-04-01T00:00:00.000000000Z");
    expect(s.history!.to).toBe("2026-06-01T00:00:00.000000000Z");
    expect(historyOf(A)).toEqual([["2026-04-01T00:00:00.000000000Z", "MEMBER", G]]);
    expect(historyOf(B)).toEqual([
      ["2026-04-01T00:00:00.000000000Z", "MEMBER", G],
      ["2026-05-15T00:00:00.000000000Z", "NOT_MEMBER", H],
    ]);
    expect(historyOf(C)).toEqual([["2026-04-01T00:00:00.000000000Z", "UNKNOWN", null]]);
  });

  it("history captures a join-and-leave inside the window", () => {
    const visitor = ledger(A, [{ id: "g-v", value: G, from: "2026-04-10T00:00:00Z", to: "2026-04-20T00:00:00Z" }]);
    const s = scopeOk(scopeOf([visitor], { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, historyFrom: "2026-04-01T00:00:00Z" }));
    expect(s.unknown).toEqual([A]);
    expect(s.history!.animals[0].segments.map((g) => g.membership.state)).toEqual(["UNKNOWN", "MEMBER", "UNKNOWN"]);
  });

  it("a group assertion received after the cutoff is invisible (incl. its history bound)", () => {
    const late = ledger(C, [{ id: "g-c", value: G, from: "2026-03-01T00:00:00Z", receivedAt: "2027-02-01T00:00:00Z" }]);
    const ledgers = [...LEDGERS.filter((l) => l.animalId !== C), late];
    const query = { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, historyFrom: "2026-02-01T00:00:00Z" };
    const s = scopeOk(scopeOf(ledgers, query));
    expect(s.unknown).toEqual([C]);
    expect(s.fingerprint).toEqual(scopeOk(scopeOf(LEDGERS, query)).fingerprint);
    expect(scopeOk(scopeOf(ledgers, { ...query, knowledgeCutoff: "2027-03-01T00:00:00Z" })).members).toEqual([A, C]);
  });

  it("CAT-INV-012: ledger order never changes the scope", () => {
    expect(checkOrderIndependence("group scope", LEDGERS, (ls) => scopeOf(ls, { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, historyFrom: "2026-04-01T00:00:00Z" }))).toEqual(CONFORMS);
  });

  it("an identical repeated ledger is idempotent; a different ledger for the same animal fails closed", () => {
    expect(scopeOf([...LEDGERS, LEDGERS[0]])).toEqual(scopeOf());
    const other = ledger(A, [{ id: "g-a", value: H, from: "2026-01-01T00:00:00Z" }]);
    expect(codes(scopeOf([...LEDGERS, other]))).toEqual(["CATTLE_SCOPE_DUPLICATE_ANIMAL_DIFFERENT_LEDGER"]);
  });

  it.each([
    ["malformed ledger", () => scopeOf([{ ...LEDGERS[0], species: "OVINE" } as never]), "CATTLE_SCOPE_INVALID_LEDGER"],
    ["padded group ref", () => scopeOf(LEDGERS, at(CUTOFF), " SYNTH-GROUP-G"), "CATTLE_SCOPE_INVALID_GROUP_REF"],
    ["historyFrom after effectiveAt", () => scopeOf(LEDGERS, { ...at(CUTOFF), historyFrom: "2026-07-01T00:00:00Z" }), "CATTLE_SCOPE_INVALID_HISTORY_FROM"],
    ["malformed historyFrom", () => scopeOf(LEDGERS, { ...at(CUTOFF), historyFrom: "2026-04-01" }), "CATTLE_SCOPE_INVALID_HISTORY_FROM"],
    ["malformed effectiveAt", () => scopeOf(LEDGERS, { effectiveAt: "x", knowledgeCutoff: CUTOFF }), "CATTLE_SCOPE_INVALID_EFFECTIVE_AT"],
    ["unknown scope kind", () => resolveGroupScope({ scope: { kind: "HERD", animalIds: [A] }, query: at(CUTOFF) } as never, hash), "CATTLE_SCOPE_INVALID_REQUEST"],
    ["history on an explicit set", () => resolveGroupScope({ scope: { kind: "EXPLICIT_SET", animalIds: [A] }, query: { ...at(CUTOFF), historyFrom: T1 } }, hash), "CATTLE_SCOPE_HISTORY_NOT_APPLICABLE"],
  ])("fails closed: %s", (_label, make, code) => {
    expect(codes(make())).toContain(code);
  });

  it("herd scope is the explicit supplied set, order-independent", () => {
    const s = (ids: string[]) => resolveGroupScope({ scope: { kind: "EXPLICIT_SET", animalIds: ids }, query: at(CUTOFF) }, hash);
    const r = s([C, A, B]);
    expect(scopeOk(r).members).toEqual([A, B, C]);
    expect(scopeOk(r).scopeKind).toBe("EXPLICIT_SET");
    expect(checkOrderIndependence("explicit set", [A, B, C], s)).toEqual(CONFORMS);
  });
});

describe("C4 read contract for C5", () => {
  const observations = [
    obs("w-1", { weight: kg(400) }),
    obs("w-2", { weight: kg(420), observedAt: T2 }),
    obs("w-b", { animalId: B, weight: kg(380) }),
    obs("w-c", { animalId: C, weight: kg(390), method: "ESTIMATE_TAPE" }),
  ];
  const request = (obsList: unknown[] = observations) => ({ observations: obsList, scope: { kind: "GROUP" as const, groupRef: G, ledgers: [...LEDGERS] }, query: at(CUTOFF) });
  const build = (obsList?: unknown[]) => {
    const r = buildWeightReadContract(request(obsList), hash);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.contract;
  };

  it("carries the scope (incl. unresolved sets) and one series per member", () => {
    const c = build();
    expect(c.scope.members).toEqual([A]);
    expect(c.scope.unknown).toEqual([C]);
    expect(c.series.map((s) => s.animalId)).toEqual([A]);
    expect(c.series[0].latest).toMatchObject({ state: "KNOWN", kg: 420 });
    expect(c.series[0].observations.map((e) => [e.recordId, e.observation.method, e.measurementBasis, e.canonicalWeight.kg])).toEqual([
      ["w-1", "SCALE", "MEASURED", 400],
      ["w-2", "SCALE", "MEASURED", 420],
    ]);
    expect(verifyWeightReadContract(c, hash)).toEqual({ valid: true });
  });

  it("validates every admitted observation, including non-members'", () => {
    expect(codes(buildWeightReadContract(request([...observations, obs("w-x", { animalId: D, weight: kg(-1) })]), hash))).toContain("CATTLE_WEIGHT_RECORD_INVALID_VALUE");
  });

  it("verification fails closed on tampering or malformed structure — never throws", () => {
    const c = build();
    const tampered = (mutate: (x: Rec) => void) => {
      const copy = structuredClone(c) as unknown as Rec;
      mutate(copy);
      return verifyWeightReadContract(copy as unknown as WeightReadContract, hash).valid;
    };
    expect(tampered((x) => (((x.series as Rec[])[0].observations as Rec[])[0].canonicalWeight = { state: "CONVERTED", kg: 1, conversion: "IDENTITY" }))).toBe(false);
    expect(tampered((x) => ((x.scope as Rec).members = [A, C]))).toBe(false);
    expect(tampered((x) => ((x.scope as Rec).unknown = []))).toBe(false);
    expect(tampered((x) => (x.series = []))).toBe(false);
    expect(tampered((x) => (x.series = "x"))).toBe(false);
    expect(tampered((x) => (x.fingerprint = null))).toBe(false);
    expect(tampered((x) => (x.effectiveAt = "2026-06-01"))).toBe(false);
    expect(tampered((x) => (x.weightPayloadVersion = 2))).toBe(false);
    expect(tampered((x) => (((x.series as Rec[])[0].latest as Rec).kg = 999))).toBe(false);
  });

  it("CAT-INV-002/021: detached, deep-frozen, reproducible", () => {
    expect(
      checkDetachedResult(
        "read contract",
        () => request(structuredClone(observations)),
        (input) => buildWeightReadContract(input, hash),
        (input) => {
          ((input.observations[0] as Rec).weight as Rec).value = 1;
          (input.scope.ledgers as unknown as Rec[]).pop();
        },
      ),
    ).toEqual(CONFORMS);
    expect(
      checkDetachedResult(
        "weight series",
        () => ({ observations: structuredClone(observations), animalIds: [A, B], query: at(CUTOFF) }),
        (input) => projectWeightSeries(input, hash),
        (input) => {
          (input.observations[0] as Rec).method = "ESTIMATE_VISUAL";
          input.animalIds.pop();
        },
      ),
    ).toEqual(CONFORMS);
    expect(isDeepFrozen(scopeOf())).toBe(true);
    expect(isDeepFrozen(run([obs("w-1", { weight: { value: 1 } })]))).toBe(true);
  });
});

describe("C4 fingerprints", () => {
  const base = [obs("w-1", { weight: kg(400), deviceRef: "SYNTH-SCALE-1", quality: { scheme: "SYNTH-Q", value: 3 } }), obs("w-2", { weight: kg(420), observedAt: T2 })];
  const fp = (records: unknown[], query: Rec = at(CUTOFF)) => seriesOf(run(records, [A], query)).fingerprint.digest;
  const edit = (index: number, fields: Rec) => base.map((r, i) => (i === index ? { ...r, ...fields } : r));

  it("CAT-INV-010/021: equivalent spellings and orders keep the series fingerprint; material changes change it", () => {
    const equivalent = [
      ...equivalentInstantSpellings(T1).map((t) => ({ label: `observedAt ${t}`, payload: edit(0, { observedAt: t }) })),
      ...equivalentInstantSpellings(RECEIVED).map((t) => ({ label: `receivedAt ${t}`, payload: edit(0, { provenance: { sourceCategory: "DEVICE", receivedAt: t } }) })),
      { label: "input order", payload: [...base].reverse() },
      { label: "key order", payload: base.map((r) => Object.fromEntries(Object.entries(r).reverse())) },
      { label: "value spelling", payload: edit(0, { weight: { unit: "KILOGRAM", value: 400.0 } }) },
    ];
    const material = [
      { label: "value", payload: edit(0, { weight: kg(400.5) }) },
      { label: "unit", payload: edit(0, { weight: kg(400, "POUND") }) },
      { label: "method", payload: edit(0, { method: "ESTIMATE_VISUAL" }) },
      { label: "observedAt", payload: edit(0, { observedAt: "2026-05-01T08:00:00.000000001Z" }) },
      { label: "receivedAt", payload: edit(0, { provenance: { sourceCategory: "DEVICE", receivedAt: "2026-05-20T12:00:01Z" } }) },
      { label: "source category", payload: edit(0, { provenance: { sourceCategory: "FARMER", receivedAt: RECEIVED } }) },
      { label: "device", payload: edit(0, { deviceRef: "SYNTH-SCALE-2" }) },
      { label: "quality", payload: edit(0, { quality: { scheme: "SYNTH-Q", value: "3" } }) },
      { label: "conditions", payload: edit(0, { conditionsNote: "synthetic note" }) },
      { label: "added observation", payload: [...base, obs("w-3", { observedAt: "2026-04-01T00:00:00Z" })] },
      { label: "correction", payload: [...base, obs("w-3", { weight: kg(421), observedAt: T2, supersedes: ["w-2"] })] },
    ];
    expect(checkFingerprintStability("weight series", base, equivalent, material, (records) => fp(records))).toEqual(CONFORMS);
  });

  it("the fingerprint binds effectiveAt and knowledgeCutoff (not their spelling)", () => {
    expect(fp(base, { effectiveAt: "2026-06-01T00:00:00.000Z", knowledgeCutoff: "2026-12-31T00:00:00.0Z" })).toBe(fp(base));
    expect(fp(base, at(CUTOFF, "2026-06-02T00:00:00Z"))).not.toBe(fp(base));
    expect(fp(base, at("2026-12-30T00:00:00Z"))).not.toBe(fp(base));
  });

  it("scope fingerprint: order/spelling-stable; changes with membership evidence and group ref", () => {
    const digest = (r: ScopeResult) => scopeOk(r).fingerprint.digest;
    const respelled = ledger(A, [{ id: "g-a", value: G, from: "2026-01-01T00:00:00.000Z" }]);
    expect(digest(scopeOf([respelled, ...LEDGERS.slice(1)]))).toBe(digest(scopeOf()));
    expect(digest(scopeOf([...LEDGERS].reverse()))).toBe(digest(scopeOf()));
    expect(digest(scopeOf(LEDGERS, at(CUTOFF), H))).not.toBe(digest(scopeOf()));
    const moved = ledger(A, [{ id: "g-a", value: G, from: "2026-01-02T00:00:00Z" }]);
    expect(digest(scopeOf([moved, ...LEDGERS.slice(1)]))).not.toBe(digest(scopeOf()));
  });

  it("uses a distinct wrapper and kinds; deterministic", () => {
    expect(cattle.CATTLE_WEIGHT_PAYLOAD_VERSION).toBe(1);
    const p = { x: 1 };
    const kinds = ["CATTLE_WEIGHT_SERIES", "CATTLE_GROUP_SCOPE", "CATTLE_WEIGHT_READ_CONTRACT"] as const;
    const digests = kinds.map((k) => cattle.computeWeightFingerprint(k, p, hash).digest);
    expect(new Set(digests).size).toBe(3);
    expect(cattle.computeWeightFingerprint("CATTLE_WEIGHT_SERIES", p, hash)).toEqual(cattle.computeWeightFingerprint("CATTLE_WEIGHT_SERIES", p, hash));
    expect(cattle.computeHealthFingerprint("CATTLE_HEALTH_TIMELINE", p, hash).digest).not.toBe(digests[0]);
  });
});

describe("C4 boundaries", () => {
  it("weight is never an animal property: the C1 ledger and snapshot are unchanged", () => {
    expect(cattle.ANIMAL_ASSERTION_KINDS).not.toContain("WEIGHT");
  });

  it("no clock, network, AI, tooling or performance (ADG / trend / target) dependency", () => {
    const dir = __dirname;
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sources.length).toBeGreaterThanOrEqual(5);
    for (const f of sources) {
      const text = readFileSync(join(dir, f), "utf8");
      const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(text, f).not.toMatch(/Date\.now|new Date\(|performance\.now|Math\.random|fetch\(|XMLHttpRequest|openai|anthropic|@\/tooling|src\/tooling/);
      expect(code, f).not.toMatch(/adg|dailygain|growthrate|\btrend|performancetarget|targetkg|targetweight|86_?400/i);
      expect(text, f).not.toMatch(/from "\.\.\/(performance|goals|programmes|recommendations)/);
    }
  });

  it("every C4 public entry point is reachable through the cattle barrel", () => {
    expect(typeof cattle.projectWeightSeries).toBe("function");
    expect(typeof cattle.resolveGroupScope).toBe("function");
    expect(typeof cattle.buildWeightReadContract).toBe("function");
    expect(typeof cattle.verifyWeightReadContract).toBe("function");
    expect(allConform([CONFORMS])).toEqual(CONFORMS);
  });

  it("helpers that trust already-canonical input stay out of the cattle barrel (CAT-INV-001/002)", () => {
    for (const name of ["materialiseWeightObservation", "latestKnownWeightOf", "projectCanonicalWeightSeries", "resolveValidScope", "readScopeRequest", "canonicalWeightOf"]) {
      expect(name in cattle, name).toBe(false);
    }
  });
});
