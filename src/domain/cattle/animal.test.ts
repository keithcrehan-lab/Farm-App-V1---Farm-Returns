/**
 * Cattle C1 — canonical animal lifecycle. Synthetic data only (`SYNTH-*`).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANIMAL_ASSERTION_KINDS,
  animalInstantKey,
  appendAnimalAssertions,
  createAnimalLedger,
  type AnimalAssertionInput,
  type AnimalLedger,
  type AnimalProvenanceInput,
} from "./animal-ledger";
import { checkExternalIdentifierRegister } from "./animal-register";
import {
  animalAssertionHistory,
  computeAnimalSnapshotFingerprint,
  projectAnimalSnapshot,
  verifyAnimalSnapshotFingerprint,
  type AnimalProjectionQuery,
  type AnimalSnapshot,
} from "./animal-snapshot";
import { computeCattleFingerprint, sameFingerprint } from "./integrity";
import { hash } from "./test-fixtures";

const A = "SYNTH-ANIMAL-1";
const B = "SYNTH-ANIMAL-2";
const T1 = "2026-03-01T00:00:00Z";
const T2 = "2026-04-01T00:00:00Z";
const T3 = "2026-06-01T00:00:00Z";
const LATER = "2026-12-31T00:00:00Z";
const NOW: AnimalProjectionQuery = { effectiveAt: LATER, knowledgeCutoff: LATER };

function prov(receivedAt: string, overrides: Partial<AnimalProvenanceInput> = {}): AnimalProvenanceInput {
  return { sourceCategory: "FARMER", receivedAt, ...overrides };
}

const dob = (id: string, value: string | null, receivedAt = T1, extra: Partial<AnimalAssertionInput> = {}): AnimalAssertionInput =>
  ({ assertionId: id, animalId: A, kind: "DATE_OF_BIRTH", value, provenance: prov(receivedAt), ...extra }) as AnimalAssertionInput;
const sex = (id: string, value: "FEMALE" | "MALE" | null, receivedAt = T1, extra: Partial<AnimalAssertionInput> = {}): AnimalAssertionInput =>
  ({ assertionId: id, animalId: A, kind: "SEX", value, provenance: prov(receivedAt), ...extra }) as AnimalAssertionInput;
const breed = (id: string, label: string, receivedAt = T1): AnimalAssertionInput => ({
  assertionId: id,
  animalId: A,
  kind: "BREED",
  value: { codeSystem: "SYNTH-BREED-CODES", code: label.toUpperCase(), label, components: [] },
  provenance: prov(receivedAt),
});
function interval(
  kind: "EXTERNAL_IDENTIFIER" | "LOCATION" | "MANAGEMENT_GROUP" | "LIFECYCLE_STATUS",
  id: string,
  value: unknown,
  validFrom: string,
  validTo: string | null,
  receivedAt = T1,
  extra: Record<string, unknown> = {},
): AnimalAssertionInput {
  return { assertionId: id, animalId: A, kind, value, validFrom, validTo, provenance: prov(receivedAt), ...extra } as AnimalAssertionInput;
}
const tag = (id: string, identifier: string, from: string, to: string | null, receivedAt = T1, extra = {}) =>
  interval("EXTERNAL_IDENTIFIER", id, { scheme: "SYNTH-TAG", identifier }, from, to, receivedAt, extra);
const loc = (id: string, ref: string, from: string, to: string | null, receivedAt = T1, extra = {}) =>
  interval("LOCATION", id, { kind: "FIELD", ref }, from, to, receivedAt, extra);
const group = (id: string, ref: string, from: string, to: string | null, receivedAt = T1) => interval("MANAGEMENT_GROUP", id, ref, from, to, receivedAt);
const life = (id: string, status: string, from: string, to: string | null, receivedAt = T1) => interval("LIFECYCLE_STATUS", id, status, from, to, receivedAt);

function ledgerOf(inputs: unknown[], animalId = A): AnimalLedger {
  const result = createAnimalLedger(animalId, inputs);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.ledger;
}

function project(ledger: AnimalLedger, query: AnimalProjectionQuery = NOW): AnimalSnapshot {
  const result = projectAnimalSnapshot(ledger, query);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.snapshot;
}

const FULL = [
  dob("a-dob", "2025-02-10"),
  sex("a-sex", "FEMALE"),
  breed("a-breed", "Synthbreed"),
  tag("a-tag", "SYNTH-0001", "2025-02-10T00:00:00Z", null),
  loc("a-loc-1", "field-1", "2026-01-01T00:00:00Z", "2026-05-01T00:00:00Z"),
  loc("a-loc-2", "field-2", "2026-05-01T00:00:00Z", null),
  group("a-grp-1", "group-1", "2026-01-01T00:00:00Z", "2026-05-01T00:00:00Z"),
  group("a-grp-2", "group-2", "2026-05-01T00:00:00Z", null),
  life("a-life", "PRESENT", "2025-02-10T00:00:00Z", null),
];

afterEach(() => vi.restoreAllMocks());

describe("Cattle C1 — identity facts", () => {
  it("1. empty ledger projects every dimension as explicit UNKNOWN", () => {
    const s = project(ledgerOf([]));
    for (const r of [s.dateOfBirth, s.sex, s.breed, s.lifecycleStatus, s.location, s.managementGroup]) {
      expect(r.state).toBe("UNKNOWN");
      expect(r.value).toBeNull();
      expect(r.issues).toEqual(["CATTLE_ANIMAL_NO_EVIDENCE"]);
    }
    expect(s.externalIdentifiers.byScheme).toEqual([]);
    expect(s.species).toBe("BOVINE");
    expect(s.issues.map((i) => i.dimension)).toContain("EXTERNAL_IDENTIFIER");
  });

  it("2. normal DOB/sex/breed facts resolve KNOWN", () => {
    const s = project(ledgerOf(FULL));
    expect(s.dateOfBirth).toMatchObject({ state: "KNOWN", value: "2025-02-10" });
    expect(s.sex).toMatchObject({ state: "KNOWN", value: "FEMALE" });
    expect(s.breed.state).toBe("KNOWN");
    expect(s.breed.value?.label).toBe("Synthbreed");
    expect(s.issues).toEqual([]);
  });

  it("3. agreeing assertions from multiple sources stay KNOWN with all provenance", () => {
    const s = project(
      ledgerOf([
        dob("d-1", "2025-02-10"),
        { ...dob("d-2", "2025-02-10"), provenance: prov(T1, { sourceCategory: "OFFICIAL_REGISTRY", sourceRecordRef: "rec-9" }) },
      ]),
    );
    expect(s.dateOfBirth.state).toBe("KNOWN");
    expect(s.dateOfBirth.evidence.map((e) => [e.assertionId, e.provenance.sourceCategory])).toEqual([
      ["d-1", "FARMER"],
      ["d-2", "OFFICIAL_REGISTRY"],
    ]);
  });

  it("4. conflicting DOB assertions => CONFLICTING_EVIDENCE with no winner, regardless of arrival order", () => {
    const s = project(ledgerOf([dob("d-1", "2025-02-10", T1), dob("d-2", "2025-02-11", T2)]));
    expect(s.dateOfBirth.state).toBe("CONFLICTING_EVIDENCE");
    expect(s.dateOfBirth.value).toBeNull();
    expect(s.dateOfBirth.conflictingValues).toEqual(["2025-02-10", "2025-02-11"]);
  });

  it("5. conflicting sex assertions => CONFLICTING_EVIDENCE", () => {
    const s = project(ledgerOf([sex("s-1", "FEMALE"), sex("s-2", "MALE")]));
    expect(s.sex.state).toBe("CONFLICTING_EVIDENCE");
    expect(s.sex.issues).toEqual(["CATTLE_ANIMAL_CONFLICTING_VALUES"]);
  });

  it("a source-reported unknown is preserved as UNKNOWN evidence and never conflicts with a stated value", () => {
    const unknownOnly = project(ledgerOf([sex("s-1", null)]));
    expect(unknownOnly.sex).toMatchObject({ state: "UNKNOWN", issues: ["CATTLE_ANIMAL_SOURCE_REPORTED_UNKNOWN"] });
    expect(unknownOnly.sex.evidence).toHaveLength(1);
    const withValue = project(ledgerOf([sex("s-1", null), sex("s-2", "MALE")]));
    expect(withValue.sex).toMatchObject({ state: "KNOWN", value: "MALE" });
  });

  it("breed preserves source code/label and composite components without a breed enum", () => {
    const composite = {
      assertionId: "b-1",
      animalId: A,
      kind: "BREED",
      value: {
        codeSystem: null,
        code: null,
        label: "Synthetic cross",
        components: [
          { codeSystem: "SYNTH", code: "ZZ", label: null, sourceProportion: "1/2" },
          { codeSystem: "SYNTH", code: "AA", label: null, sourceProportion: "1/2" },
        ],
      },
      provenance: prov(T1),
    };
    const s = project(ledgerOf([composite]));
    expect(s.breed.state).toBe("KNOWN");
    expect(s.breed.value?.components.map((c) => c.code)).toEqual(["AA", "ZZ"]);
    expect(createAnimalLedger(A, [{ ...composite, value: { codeSystem: null, code: null, label: null, components: [] } }]).ok).toBe(false);
  });

  it("rejects invented/invalid values: production class as sex, invalid DOB, unknown category", () => {
    expect(createAnimalLedger(A, [{ ...sex("s", "MALE"), value: "BULLOCK" }]).ok).toBe(false);
    expect(createAnimalLedger(A, [dob("d", "2025-02-30")]).ok).toBe(false);
    expect(createAnimalLedger(A, [{ ...dob("d", "2025-02-10"), provenance: { sourceCategory: "AIM_LIVE", receivedAt: T1 } }]).ok).toBe(false);
    expect(createAnimalLedger(A, [{ ...dob("d", "2025-02-10"), provenance: { sourceCategory: "FARMER", receivedAt: "2026-03-01" } }]).ok).toBe(false);
  });
});

describe("Cattle C1 — corrections, supersession and knowledge time", () => {
  it("6. a correction supersedes the prior assertion without deleting it", () => {
    const ledger = ledgerOf([dob("d-1", "2025-02-10", T1), dob("d-2", "2025-02-12", T3, { supersedes: ["d-1"] })]);
    const s = project(ledger);
    expect(s.dateOfBirth).toMatchObject({ state: "KNOWN", value: "2025-02-12", supersededAssertionIds: ["d-1"] });
    expect(ledger.assertions.map((a) => a.assertionId)).toEqual(["d-1", "d-2"]);
    const history = animalAssertionHistory(ledger, "DATE_OF_BIRTH", LATER)!;
    expect(history.map((h) => [h.assertion.assertionId, h.supersededBy])).toEqual([
      ["d-1", ["d-2"]],
      ["d-2", []],
    ]);
  });

  it("7/8/12-bitemporal. T1 < T2 < T3: cutoff T2 sees the old fact, cutoff after T3 sees the correction", () => {
    const ledger = ledgerOf([dob("d-1", "2025-02-10", T1), dob("d-2", "2025-02-12", T3, { supersedes: ["d-1"] })]);
    const atRecommendation = project(ledger, { effectiveAt: T2, knowledgeCutoff: T2 });
    expect(atRecommendation.dateOfBirth).toMatchObject({ state: "KNOWN", value: "2025-02-10", supersededAssertionIds: [] });
    expect(atRecommendation.knownAssertionIds).toEqual(["d-1"]);
    const reconstructed = project(ledger, { effectiveAt: T2, knowledgeCutoff: LATER });
    expect(reconstructed.dateOfBirth.value).toBe("2025-02-12");
    // Reproducible: the T2 snapshot fingerprint never changes after T3 arrives.
    const before = projectAnimalSnapshot(ledgerOf([dob("d-1", "2025-02-10", T1)]), { effectiveAt: T2, knowledgeCutoff: T2 });
    expect(before.ok && sameFingerprint(computeAnimalSnapshotFingerprint(before.snapshot, hash), computeAnimalSnapshotFingerprint(atRecommendation, hash))).toBe(true);
  });

  it("an interval correction respects its validity interval at the later cutoff", () => {
    const ledger = ledgerOf([
      loc("l-1", "field-1", "2026-01-01T00:00:00Z", null, T1),
      loc("l-2", "field-1", "2026-01-01T00:00:00Z", "2026-05-01T00:00:00Z", T3, { supersedes: ["l-1"] }),
      loc("l-3", "field-2", "2026-05-01T00:00:00Z", null, T3),
    ]);
    expect(project(ledger, { effectiveAt: "2026-07-01T00:00:00Z", knowledgeCutoff: T2 }).location.value).toEqual({ kind: "FIELD", ref: "field-1" });
    expect(project(ledger, { effectiveAt: "2026-07-01T00:00:00Z", knowledgeCutoff: LATER }).location.value).toEqual({ kind: "FIELD", ref: "field-2" });
    expect(project(ledger, { effectiveAt: "2026-02-01T00:00:00Z", knowledgeCutoff: LATER }).location.value).toEqual({ kind: "FIELD", ref: "field-1" });
  });

  it("9. broken supersession target fails closed (INVALID_EVIDENCE), incl. a target not yet known at the cutoff", () => {
    const broken = project(ledgerOf([dob("d-1", "2025-02-10"), dob("d-2", "2025-02-12", T1, { supersedes: ["missing"] })]));
    expect(broken.dateOfBirth).toMatchObject({ state: "INVALID_EVIDENCE", value: null, issues: ["CATTLE_ANIMAL_SUPERSESSION_TARGET_NOT_KNOWN"] });
    const early = ledgerOf([dob("d-1", "2025-02-10", T3), dob("d-2", "2025-02-12", T1, { supersedes: ["d-1"] })]);
    expect(project(early, { effectiveAt: T2, knowledgeCutoff: T2 }).dateOfBirth.state).toBe("INVALID_EVIDENCE");
    expect(project(early).dateOfBirth).toMatchObject({ state: "KNOWN", value: "2025-02-12" });
  });

  it("cross-kind supersession fails closed in both dimensions", () => {
    const s = project(ledgerOf([dob("d-1", "2025-02-10"), sex("s-1", "MALE", T1, { supersedes: ["d-1"] })]));
    expect(s.sex.state).toBe("INVALID_EVIDENCE");
    expect(s.dateOfBirth).toMatchObject({ state: "INVALID_EVIDENCE", issues: ["CATTLE_ANIMAL_CROSS_KIND_SUPERSESSION"] });
  });

  it("10. supersession cycle fails closed; self-supersession is rejected at ingestion", () => {
    const s = project(ledgerOf([dob("d-1", "2025-02-10", T1, { supersedes: ["d-2"] }), dob("d-2", "2025-02-12", T1, { supersedes: ["d-1"] })]));
    expect(s.dateOfBirth).toMatchObject({ state: "INVALID_EVIDENCE", issues: ["CATTLE_ANIMAL_SUPERSESSION_CYCLE"] });
    const self = createAnimalLedger(A, [dob("d-1", "2025-02-10", T1, { supersedes: ["d-1"] })]);
    expect(self.ok || self.issues.map((i) => i.code)).toEqual(["CATTLE_ANIMAL_SELF_SUPERSESSION"]);
  });

  it("competing corrections of the same assertion with different content => CONFLICTING_EVIDENCE", () => {
    const s = project(
      ledgerOf([dob("d-1", "2025-02-10"), dob("d-2", "2025-02-12", T2, { supersedes: ["d-1"] }), dob("d-3", "2025-02-13", T2, { supersedes: ["d-1"] })]),
    );
    expect(s.dateOfBirth).toMatchObject({ state: "CONFLICTING_EVIDENCE", issues: ["CATTLE_ANIMAL_COMPETING_CORRECTIONS"] });
    const agreeing = project(
      ledgerOf([dob("d-1", "2025-02-10"), dob("d-2", "2025-02-12", T2, { supersedes: ["d-1"] }), dob("d-3", "2025-02-12", T2, { supersedes: ["d-1"] })]),
    );
    expect(agreeing.dateOfBirth).toMatchObject({ state: "KNOWN", value: "2025-02-12" });
  });

  it("11. same id + identical content is idempotent", () => {
    const result = createAnimalLedger(A, [dob("d-1", "2025-02-10"), dob("d-1", "2025-02-10")]);
    expect(result.ok && result.idempotentDuplicateIds).toEqual(["d-1"]);
    const ledger = ledgerOf([dob("d-1", "2025-02-10")]);
    const again = appendAnimalAssertions(ledger, [dob("d-1", "2025-02-10")]);
    expect(again.ok && again.ledger.assertions).toHaveLength(1);
  });

  it("12. same id + changed content is rejected, never overwritten", () => {
    const ledger = ledgerOf([dob("d-1", "2025-02-10")]);
    const result = appendAnimalAssertions(ledger, [dob("d-1", "2025-02-11")]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.map((i) => i.code)).toEqual(["CATTLE_ANIMAL_DUPLICATE_ID_DIFFERENT_CONTENT"]);
    expect(project(ledger).dateOfBirth.value).toBe("2025-02-10");
    // A provenance-only difference is also different content.
    expect(appendAnimalAssertions(ledger, [{ ...dob("d-1", "2025-02-10"), provenance: prov(T2) }]).ok).toBe(false);
  });

  it("rejects an assertion for another animal and an invalid animal id", () => {
    expect(createAnimalLedger(A, [{ ...dob("d-1", "2025-02-10"), animalId: B }]).ok).toBe(false);
    expect(createAnimalLedger(" ", []).ok).toBe(false);
  });
});

describe("Cattle C1 — external identifiers and register", () => {
  it("13. identifier replacement keeps the old identifier in history and the internal id unchanged", () => {
    const ledger = ledgerOf([
      tag("t-1", "SYNTH-0001", "2025-02-10T00:00:00Z", "2026-03-01T00:00:00Z"),
      tag("t-2", "SYNTH-0002", "2026-03-01T00:00:00Z", null, T2),
    ]);
    const s = project(ledger);
    expect(s.animalId).toBe(A);
    expect(s.externalIdentifiers.byScheme).toMatchObject([{ scheme: "SYNTH-TAG", state: "KNOWN", value: "SYNTH-0002" }]);
    expect(s.externalIdentifiers.history.map((h) => h.assertion.assertionId)).toEqual(["t-1", "t-2"]);
    expect(project(ledger, { effectiveAt: "2026-01-01T00:00:00Z", knowledgeCutoff: LATER }).externalIdentifiers.byScheme[0].value).toBe("SYNTH-0001");
  });

  it("identifier correction via supersession retains the corrected-away identifier in history", () => {
    const s = project(ledgerOf([tag("t-1", "SYNTH-0O01", "2025-02-10T00:00:00Z", null), tag("t-2", "SYNTH-0001", "2025-02-10T00:00:00Z", null, T2, { supersedes: ["t-1"] })]));
    expect(s.externalIdentifiers.byScheme[0].value).toBe("SYNTH-0001");
    expect(s.externalIdentifiers.history.find((h) => h.assertion.assertionId === "t-1")?.supersededBy).toEqual(["t-2"]);
  });

  it("two simultaneous identifiers in one scheme => CONFLICTING_EVIDENCE", () => {
    const s = project(ledgerOf([tag("t-1", "SYNTH-0001", T1, null), tag("t-2", "SYNTH-0002", T1, null)]));
    expect(s.externalIdentifiers.byScheme[0]).toMatchObject({ state: "CONFLICTING_EVIDENCE", conflictingValues: ["SYNTH-0001", "SYNTH-0002"] });
  });

  it("14. two animals with the same current identifier => register conflict, both preserved, no merge", () => {
    const a = ledgerOf([tag("a-t", "SYNTH-0001", T1, null)]);
    const b = ledgerOf([{ ...tag("b-t", "SYNTH-0001", T2, null), animalId: B }], B);
    const check = checkExternalIdentifierRegister([b, a], NOW);
    expect(check.clear).toBe(false);
    expect(check.conflicts).toEqual([{ scheme: "SYNTH-TAG", identifier: "SYNTH-0001", animalIds: [A, B], assertionIds: ["a-t", "b-t"] }]);
    expect(project(a).animalId).toBe(A);
    expect(project(b).animalId).toBe(B);
  });

  it("15. historically reused, non-overlapping identifier is not a current conflict; knowledge cutoff is respected", () => {
    const a = ledgerOf([tag("a-t", "SYNTH-0001", T1, T2)]);
    const b = ledgerOf([{ ...tag("b-t", "SYNTH-0001", T2, null), animalId: B }], B);
    expect(checkExternalIdentifierRegister([a, b], NOW)).toMatchObject({ clear: true, conflicts: [] });
    expect(checkExternalIdentifierRegister([a, b], { effectiveAt: "2026-03-15T00:00:00Z", knowledgeCutoff: LATER }).conflicts).toEqual([]);
    const late = ledgerOf([{ ...tag("b-t", "SYNTH-0001", T1, null, T3), animalId: B }], B);
    const openA = ledgerOf([tag("a-t", "SYNTH-0001", T1, null)]);
    expect(checkExternalIdentifierRegister([openA, late], { effectiveAt: T2, knowledgeCutoff: T2 }).clear).toBe(true);
    expect(checkExternalIdentifierRegister([openA, late], { effectiveAt: T2, knowledgeCutoff: LATER }).conflicts).toHaveLength(1);
  });

  it("register fails closed on invalid identifier evidence, invalid query and duplicate ledgers", () => {
    const broken = ledgerOf([tag("a-t", "SYNTH-0001", T1, null, T1, { supersedes: ["nope"] })]);
    expect(checkExternalIdentifierRegister([broken], NOW).issues.map((i) => i.code)).toEqual(["CATTLE_REGISTER_IDENTIFIERS_UNRESOLVED"]);
    expect(checkExternalIdentifierRegister([], { effectiveAt: "bad", knowledgeCutoff: LATER }).clear).toBe(false);
    const a = ledgerOf([]);
    expect(checkExternalIdentifierRegister([a, a], NOW).issues.map((i) => i.code)).toEqual(["CATTLE_REGISTER_DUPLICATE_ANIMAL_LEDGER"]);
  });
});

describe("Cattle C1 — location, management group and lifecycle history", () => {
  const ledger = ledgerOf(FULL);

  it("16. historical location projection", () => {
    expect(project(ledger, { effectiveAt: "2026-02-01T00:00:00Z", knowledgeCutoff: LATER }).location.value).toEqual({ kind: "FIELD", ref: "field-1" });
    expect(project(ledger).location.value).toEqual({ kind: "FIELD", ref: "field-2" });
    expect(project(ledger, { effectiveAt: "2025-12-01T00:00:00Z", knowledgeCutoff: LATER }).location).toMatchObject({ state: "UNKNOWN", value: null });
  });

  it("17. overlapping incompatible locations => CONFLICTING_EVIDENCE; missing location is never the home farm", () => {
    const s = project(ledgerOf([loc("l-1", "field-1", T1, null), interval("LOCATION", "l-2", { kind: "HOLDING", ref: "holding-1" }, T1, null)]));
    expect(s.location.state).toBe("CONFLICTING_EVIDENCE");
    expect(project(ledgerOf([life("x", "PRESENT", T1, null)])).location.state).toBe("UNKNOWN");
  });

  it("18. interval boundaries are inclusive start / exclusive end", () => {
    const at = (effectiveAt: string) => project(ledger, { effectiveAt, knowledgeCutoff: LATER }).location.value?.ref;
    expect(at("2026-01-01T00:00:00Z")).toBe("field-1");
    expect(at("2026-04-30T23:59:59.999Z")).toBe("field-1");
    expect(at("2026-05-01T00:00:00Z")).toBe("field-2");
    expect(at("2026-05-01T00:00:00.000Z")).toBe("field-2");
    expect(createAnimalLedger(A, [loc("l", "f", T2, T2)]).ok).toBe(false);
    expect(createAnimalLedger(A, [loc("l", "f", T2, T1)]).ok).toBe(false);
  });

  it("19. historical management-group projection", () => {
    expect(project(ledger, { effectiveAt: "2026-02-01T00:00:00Z", knowledgeCutoff: LATER }).managementGroup.value).toBe("group-1");
    expect(project(ledger).managementGroup.value).toBe("group-2");
  });

  it("20. overlapping conflicting management groups => CONFLICTING_EVIDENCE", () => {
    const s = project(ledgerOf([group("g-1", "group-1", T1, null), group("g-2", "group-2", T2, null)]));
    expect(s.managementGroup).toMatchObject({ state: "CONFLICTING_EVIDENCE", conflictingValues: ["group-1", "group-2"] });
    expect(project(ledgerOf([group("g-1", "group-1", T1, null), group("g-2", "group-2", T2, null)]), { effectiveAt: T1, knowledgeCutoff: LATER }).managementGroup.value).toBe("group-1");
  });

  it("21. lifecycle status projection", () => {
    const l = ledgerOf([life("p", "PRESENT", T1, T2), life("d", "DEPARTED", T2, null)]);
    expect(project(l, { effectiveAt: T1, knowledgeCutoff: LATER }).lifecycleStatus.value).toBe("PRESENT");
    expect(project(l).lifecycleStatus.value).toBe("DEPARTED");
    expect(project(ledgerOf([life("x", "DECEASED", T2, null)])).lifecycleStatus.value).toBe("DECEASED");
    expect(createAnimalLedger(A, [life("x", "SLAUGHTERED", T2, null)]).ok).toBe(false);
  });

  it("22. contradictory simultaneous lifecycle states => CONFLICTING_EVIDENCE", () => {
    const s = project(ledgerOf([life("p", "PRESENT", T1, null), life("d", "DECEASED", T2, null)]));
    expect(s.lifecycleStatus).toMatchObject({ state: "CONFLICTING_EVIDENCE", conflictingValues: ["DECEASED", "PRESENT"] });
  });
});

describe("Cattle C1 — determinism, aliasing and fingerprint", () => {
  it("23/26. out-of-order ingestion yields the same ledger, snapshot and fingerprint", () => {
    const reversed = [...FULL].reverse();
    const shuffled = [FULL[4], FULL[0], FULL[8], FULL[2], FULL[6], FULL[1], FULL[7], FULL[3], FULL[5]];
    const base = project(ledgerOf(FULL));
    for (const order of [reversed, shuffled]) {
      const s = project(ledgerOf(order));
      expect(s).toEqual(base);
      expect(sameFingerprint(computeAnimalSnapshotFingerprint(s, hash), computeAnimalSnapshotFingerprint(base, hash))).toBe(true);
    }
    const incremental = appendAnimalAssertions(ledgerOf(FULL.slice(5)), FULL.slice(0, 5));
    expect(incremental.ok && project(incremental.ledger)).toEqual(base);
  });

  it("24. mutating the caller's input after ingestion cannot alter the ledger", () => {
    const input = { ...dob("d-1", "2025-02-10"), provenance: prov(T1) } as Record<string, unknown> & { provenance: Record<string, unknown> };
    const ledger = ledgerOf([input]);
    input.value = "2020-01-01";
    input.provenance.receivedAt = "2020-01-01T00:00:00Z";
    expect(project(ledger).dateOfBirth.value).toBe("2025-02-10");
    expect(ledger.assertions[0].provenance.receivedAt).toBe(T1);
  });

  it("getter inputs are read once; the retained value is the validated value", () => {
    let reads = 0;
    const tricky = {
      assertionId: "d-1",
      animalId: A,
      kind: "DATE_OF_BIRTH",
      provenance: prov(T1),
      get value() {
        reads += 1;
        return reads === 1 ? "2025-02-10" : "not-a-date";
      },
    };
    const ledger = ledgerOf([tricky]);
    expect(reads).toBe(1);
    expect(project(ledger).dateOfBirth.value).toBe("2025-02-10");
    const proxied = new Proxy(dob("d-2", "2025-02-10") as object, {});
    const result = createAnimalLedger(A, [proxied]);
    expect(!result.ok && result.issues.map((i) => i.code)).toEqual(["CATTLE_ANIMAL_INPUT_NOT_CLONEABLE"]);
  });

  it("25. projection output is detached and frozen; the ledger is unaffected", () => {
    const ledger = ledgerOf(FULL);
    const s = project(ledger);
    expect(() => {
      (s.dateOfBirth as { value: string }).value = "1999-01-01";
    }).toThrow();
    expect(() => {
      (s.dateOfBirth.evidence[0].provenance as { receivedAt: string }).receivedAt = T3;
    }).toThrow();
    expect(s.dateOfBirth.evidence[0]).not.toBe(ledger.assertions.find((a) => a.assertionId === "a-dob"));
    expect(Object.isFrozen(ledger.assertions[0].provenance)).toBe(true);
    expect(project(ledger)).toEqual(s);
  });

  it("a hand-mutated (unfrozen) ledger copy is re-validated before projection", () => {
    const forged = structuredClone(ledgerOf([dob("d-1", "2025-02-10")])) as unknown as { assertions: { value: unknown }[] };
    forged.assertions[0].value = "garbage";
    const result = projectAnimalSnapshot(forged as unknown as AnimalLedger, NOW);
    expect(!result.ok && result.issues).toEqual(["CATTLE_ANIMAL_INVALID_LEDGER"]);
  });

  it("27. a material state or provenance change changes the fingerprint", () => {
    const base = computeAnimalSnapshotFingerprint(project(ledgerOf(FULL)), hash);
    const changedState = computeAnimalSnapshotFingerprint(project(ledgerOf([...FULL.slice(1), dob("a-dob", "2025-02-11")])), hash);
    const changedProv = computeAnimalSnapshotFingerprint(
      project(ledgerOf([...FULL.slice(1), { ...dob("a-dob", "2025-02-10"), provenance: prov(T1, { sourceCategory: "OFFICIAL_REGISTRY" }) }])),
      hash,
    );
    const conflict = computeAnimalSnapshotFingerprint(project(ledgerOf([...FULL, sex("a-sex-2", "MALE")])), hash);
    for (const other of [changedState, changedProv, conflict]) expect(sameFingerprint(base, other)).toBe(false);
  });

  it("28. effectiveAt and knowledgeCutoff are bound into the fingerprint", () => {
    const ledger = ledgerOf([dob("d-1", "2025-02-10")]);
    const f = (q: AnimalProjectionQuery) => computeAnimalSnapshotFingerprint(project(ledger, q), hash);
    const base = f({ effectiveAt: T2, knowledgeCutoff: T2 });
    expect(sameFingerprint(base, f({ effectiveAt: T3, knowledgeCutoff: T2 }))).toBe(false);
    expect(sameFingerprint(base, f({ effectiveAt: T2, knowledgeCutoff: T3 }))).toBe(false);
  });

  it("fingerprint verifies, detects tampering, and is kind-separated from C0 payloads", () => {
    const s = project(ledgerOf(FULL));
    const fp = computeAnimalSnapshotFingerprint(s, hash);
    expect(verifyAnimalSnapshotFingerprint(s, fp, hash).valid).toBe(true);
    const tampered = structuredClone(s) as AnimalSnapshot;
    (tampered.sex as { value: string }).value = "MALE";
    expect(verifyAnimalSnapshotFingerprint(tampered, fp, hash).valid).toBe(false);
    expect(sameFingerprint(fp, computeCattleFingerprint("CATTLE_EVIDENCE_PACK", s, hash))).toBe(false);
  });

  it("29. projection never reads the clock or randomness", () => {
    const now = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("clock read");
    });
    const random = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("randomness read");
    });
    const s = project(ledgerOf(FULL));
    computeAnimalSnapshotFingerprint(s, hash);
    checkExternalIdentifierRegister([ledgerOf(FULL)], NOW);
    expect(now).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
    for (const file of ["animal-ledger.ts", "animal-snapshot.ts", "animal-register.ts"]) {
      const source = readFileSync(join(__dirname, file), "utf8");
      expect(source).not.toMatch(/Date\.now|new Date|Math\.random|performance\.now/);
    }
  });

  it("invalid or missing query times fail closed", () => {
    const ledger = ledgerOf([]);
    const result = projectAnimalSnapshot(ledger, { effectiveAt: "2026-03-01", knowledgeCutoff: "" });
    expect(!result.ok && result.issues).toEqual(["CATTLE_ANIMAL_INVALID_EFFECTIVE_AT", "CATTLE_ANIMAL_INVALID_KNOWLEDGE_CUTOFF"]);
  });

  it("30. no C2+ domain concepts leak into C1", () => {
    expect([...ANIMAL_ASSERTION_KINDS].sort()).toEqual(
      ["BREED", "DATE_OF_BIRTH", "EXTERNAL_IDENTIFIER", "LIFECYCLE_STATUS", "LOCATION", "MANAGEMENT_GROUP", "SEX"].sort(),
    );
    const forbidden = /\b(weights?|adg|bcs|calving|fertility|service event|treatments?|medicines?|vaccin\w*|tb|bvd|feed|economics?|price|production goal|recommendations?|slaughter)\b/i;
    for (const file of ["animal-ledger.ts", "animal-snapshot.ts", "animal-register.ts"]) {
      expect(readFileSync(join(__dirname, file), "utf8")).not.toMatch(forbidden);
    }
    expect(createAnimalLedger(A, [{ assertionId: "w", animalId: A, kind: "WEIGHT", value: "1", provenance: prov(T1) }]).ok).toBe(false);
  });
});

describe("Cattle C1 remediation F001 — conflicts are scoped to effective time", () => {
  const FEB = "2026-02-01T00:00:00Z";
  const FEB_MID = "2026-02-15T00:00:00Z";
  const MAR = "2026-03-01T00:00:00Z";
  const DEC = "2026-12-01T00:00:00Z";
  const at = (effectiveAt: string, knowledgeCutoff = LATER): AnimalProjectionQuery => ({ effectiveAt, knowledgeCutoff });
  // An open-ended original corrected by two disagreeing corrections valid only in February,
  // plus an uncontested assertion from March onwards.
  const febCompeting = <T>(make: (id: string, v: T, from: string, to: string | null, receivedAt?: string, extra?: object) => AnimalAssertionInput, v: [T, T, T, T]) => [
    make("x-orig", v[0], "2026-01-01T00:00:00Z", null),
    make("x-c1", v[1], FEB, MAR, T2, { supersedes: ["x-orig"] }),
    make("x-c2", v[2], FEB, MAR, T2, { supersedes: ["x-orig"] }),
    make("x-later", v[3], MAR, null, T2),
  ];
  const groupX = (id: string, v: string, from: string, to: string | null, r = T1, extra = {}) => interval("MANAGEMENT_GROUP", id, v, from, to, r, extra);
  const lifeX = (id: string, v: string, from: string, to: string | null, r = T1, extra = {}) => interval("LIFECYCLE_STATUS", id, v, from, to, r, extra);
  const locX = (id: string, v: string, from: string, to: string | null, r = T1, extra = {}) => loc(id, v, from, to, r, extra);
  const tagX = (id: string, v: string, from: string, to: string | null, r = T1, extra = {}) => tag(id, v, from, to, r, extra);

  const cases = [
    { name: "A. location", inputs: febCompeting(locX, ["field-0", "field-1", "field-2", "field-9"]), pick: (s: AnimalSnapshot) => s.location, dec: { kind: "FIELD", ref: "field-9" } },
    { name: "B. management group", inputs: febCompeting(groupX, ["group-0", "group-1", "group-2", "group-9"]), pick: (s: AnimalSnapshot) => s.managementGroup, dec: "group-9" },
    { name: "C. lifecycle", inputs: febCompeting(lifeX, ["PRESENT", "DEPARTED", "DECEASED", "PRESENT"]), pick: (s: AnimalSnapshot) => s.lifecycleStatus, dec: "PRESENT" },
    { name: "D. external identifier", inputs: febCompeting(tagX, ["SYNTH-0", "SYNTH-1", "SYNTH-2", "SYNTH-9"]), pick: (s: AnimalSnapshot) => s.externalIdentifiers.byScheme[0], dec: "SYNTH-9" },
  ];

  for (const c of cases) {
    it(`${c.name}: a February-only competing correction conflicts in February but not in December`, () => {
      const ledger = ledgerOf(c.inputs);
      expect(c.pick(project(ledger, at(FEB_MID)))).toMatchObject({ state: "CONFLICTING_EVIDENCE", issues: ["CATTLE_ANIMAL_COMPETING_CORRECTIONS"] });
      expect(c.pick(project(ledger, at(DEC)))).toMatchObject({ state: "KNOWN", value: c.dec, issues: [] });
      // The February competition is still auditable in history at the December cutoff.
      const history = animalAssertionHistory(ledger, c.inputs[0].kind, LATER);
      expect(history?.find((h) => h.assertion.assertionId === "x-orig")?.supersededBy).toEqual(["x-c1", "x-c2"]);
    });
  }

  it("A–C. plain overlapping February-only assignments conflict only in February", () => {
    const ledger = ledgerOf([
      locX("l-1", "field-1", FEB, MAR),
      locX("l-2", "field-2", FEB, MAR),
      groupX("g-1", "group-1", FEB, MAR),
      groupX("g-2", "group-2", FEB, MAR),
      lifeX("p-1", "PRESENT", FEB, MAR),
      lifeX("p-2", "DECEASED", FEB, MAR),
      tagX("t-1", "SYNTH-1", FEB, MAR),
      tagX("t-2", "SYNTH-2", FEB, MAR),
    ]);
    const feb = project(ledger, at(FEB_MID));
    const dec = project(ledger, at(DEC));
    for (const r of [feb.location, feb.managementGroup, feb.lifecycleStatus, feb.externalIdentifiers.byScheme[0]]) expect(r.state).toBe("CONFLICTING_EVIDENCE");
    for (const r of [dec.location, dec.managementGroup, dec.lifecycleStatus, dec.externalIdentifiers.byScheme[0]]) {
      expect(r).toMatchObject({ state: "UNKNOWN", issues: ["CATTLE_ANIMAL_NO_EVIDENCE"] });
    }
  });

  it("E. competing corrections actually effective at the requested date still conflict", () => {
    const ledger = ledgerOf([
      locX("l-orig", "field-0", "2026-01-01T00:00:00Z", null),
      locX("l-c1", "field-1", FEB, null, T2, { supersedes: ["l-orig"] }),
      locX("l-c2", "field-2", FEB, null, T2, { supersedes: ["l-orig"] }),
    ]);
    expect(project(ledger, at(DEC)).location).toMatchObject({ state: "CONFLICTING_EVIDENCE", conflictingValues: [{ kind: "FIELD", ref: "field-1" }, { kind: "FIELD", ref: "field-2" }] });
    // Only one correction effective at the date: no competition at that instant.
    const partial = ledgerOf([
      locX("l-orig", "field-0", "2026-01-01T00:00:00Z", null),
      locX("l-c1", "field-1", FEB, null, T2, { supersedes: ["l-orig"] }),
      locX("l-c2", "field-2", FEB, MAR, T2, { supersedes: ["l-orig"] }),
    ]);
    expect(project(partial, at(FEB_MID)).location.state).toBe("CONFLICTING_EVIDENCE");
    expect(project(partial, at(DEC)).location).toMatchObject({ state: "KNOWN", value: { kind: "FIELD", ref: "field-1" } });
    // Identity facts are not interval-scoped: competing DOB corrections still conflict.
    const facts = ledgerOf([dob("d-1", "2025-02-10"), dob("d-2", "2025-02-12", T2, { supersedes: ["d-1"] }), dob("d-3", "2025-02-13", T2, { supersedes: ["d-1"] })]);
    expect(project(facts, at(DEC)).dateOfBirth.state).toBe("CONFLICTING_EVIDENCE");
  });

  it("F. a correction received after the knowledge cutoff stays invisible to an earlier snapshot", () => {
    const ledger = ledgerOf([
      locX("l-orig", "field-0", "2026-01-01T00:00:00Z", null, T1),
      locX("l-c1", "field-1", FEB, MAR, T3, { supersedes: ["l-orig"] }),
      locX("l-c2", "field-2", FEB, MAR, T3, { supersedes: ["l-orig"] }),
    ]);
    expect(project(ledger, at(FEB_MID, T2)).location).toMatchObject({ state: "KNOWN", value: { kind: "FIELD", ref: "field-0" }, supersededAssertionIds: [] });
    expect(project(ledger, at(FEB_MID, LATER)).location.state).toBe("CONFLICTING_EVIDENCE");
    // After the correction is known, December has no effective location (the original was superseded).
    expect(project(ledger, at(DEC, LATER)).location).toMatchObject({ state: "UNKNOWN", issues: ["CATTLE_ANIMAL_NO_EVIDENCE"] });
  });

  it("G. out-of-order input yields the same snapshot and fingerprint for both dates", () => {
    for (const c of cases) {
      for (const q of [at(FEB_MID), at(DEC)]) {
        const base = project(ledgerOf(c.inputs), q);
        const reversed = project(ledgerOf([...c.inputs].reverse()), q);
        expect(reversed).toEqual(base);
        expect(sameFingerprint(computeAnimalSnapshotFingerprint(reversed, hash), computeAnimalSnapshotFingerprint(base, hash))).toBe(true);
      }
    }
  });
});

describe("Cattle C1 remediation F002 — ledger header is validated", () => {
  const good = () => ledgerOf([dob("d-1", "2025-02-10")]);
  const forge = (overrides: Record<string, unknown>) => ({ ...structuredClone(good()), ...overrides }) as unknown as AnimalLedger;
  const codes = (r: ReturnType<typeof projectAnimalSnapshot>) => (r.ok ? [] : r.ledgerIssues.map((i) => i.code));

  it("a supported BOVINE schema-1 ledger projects normally", () => {
    const s = project(forge({}));
    expect(s).toMatchObject({ species: "BOVINE", snapshotSchemaVersion: 1, dateOfBirth: { value: "2025-02-10" } });
  });

  it("an unsupported species is rejected, never coerced to BOVINE", () => {
    const r = projectAnimalSnapshot(forge({ species: "OVINE" }), NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues).toEqual(["CATTLE_ANIMAL_INVALID_LEDGER"]);
    expect(codes(r)).toEqual(["CATTLE_ANIMAL_UNSUPPORTED_SPECIES"]);
  });

  it("an unsupported future (or past) schema version is rejected, never read as the current schema", () => {
    expect(codes(projectAnimalSnapshot(forge({ ledgerSchemaVersion: 999 }), NOW))).toEqual(["CATTLE_ANIMAL_UNSUPPORTED_LEDGER_SCHEMA_VERSION"]);
    expect(codes(projectAnimalSnapshot(forge({ ledgerSchemaVersion: 0 }), NOW))).toEqual(["CATTLE_ANIMAL_UNSUPPORTED_LEDGER_SCHEMA_VERSION"]);
    expect(codes(projectAnimalSnapshot(forge({ species: "OVINE", ledgerSchemaVersion: 999 }), NOW))).toEqual([
      "CATTLE_ANIMAL_UNSUPPORTED_LEDGER_SCHEMA_VERSION",
      "CATTLE_ANIMAL_UNSUPPORTED_SPECIES",
    ]);
  });

  it("a malformed header is rejected", () => {
    for (const bad of [
      forge({ species: undefined }),
      forge({ ledgerSchemaVersion: "1" }),
      forge({ assertions: "nope" }),
      null as unknown as AnimalLedger,
      [] as unknown as AnimalLedger,
    ]) {
      expect(codes(projectAnimalSnapshot(bad, NOW))).toContain("CATTLE_ANIMAL_MALFORMED_LEDGER_HEADER");
    }
  });

  it("history, append and the register apply the same header check", () => {
    const ovine = forge({ species: "OVINE" });
    expect(animalAssertionHistory(ovine, "DATE_OF_BIRTH", LATER)).toBeNull();
    expect(animalAssertionHistory(forge({ ledgerSchemaVersion: 2 }), "DATE_OF_BIRTH", LATER)).toBeNull();
    const appended = appendAnimalAssertions(ovine, [sex("s-1", "FEMALE")]);
    expect(!appended.ok && appended.issues.map((i) => i.code)).toEqual(["CATTLE_ANIMAL_UNSUPPORTED_SPECIES"]);
    expect(appendAnimalAssertions(forge({ ledgerSchemaVersion: 999 }), []).ok).toBe(false);
    expect(appendAnimalAssertions(good(), [sex("s-1", "FEMALE")]).ok).toBe(true);
    expect(checkExternalIdentifierRegister([ovine], NOW)).toMatchObject({ clear: false, issues: [{ code: "CATTLE_REGISTER_INVALID_LEDGER", animalId: A }] });
  });

  it("header getters are read once", () => {
    let reads = 0;
    const base = structuredClone(good()) as unknown as Record<string, unknown>;
    const shifty = {
      ...base,
      get species() {
        reads += 1;
        return reads === 1 ? "OVINE" : "BOVINE";
      },
    } as unknown as AnimalLedger;
    expect(codes(projectAnimalSnapshot(shifty, NOW))).toEqual(["CATTLE_ANIMAL_UNSUPPORTED_SPECIES"]);
    expect(reads).toBe(1);
  });
});

describe("Cattle C1 remediation F003 — correction branches are followed through corrections-of-corrections", () => {
  const FEB = "2026-02-01T00:00:00Z";
  const FEB_MID = "2026-02-15T00:00:00Z";
  const MAR = "2026-03-01T00:00:00Z";
  const DEC = "2026-12-01T00:00:00Z";
  const JAN = "2026-01-01T00:00:00Z";
  const at = (effectiveAt: string, knowledgeCutoff = LATER): AnimalProjectionQuery => ({ effectiveAt, knowledgeCutoff });
  const ids = (list: { assertionId: string }[]) => list.map((a) => a.assertionId);
  // original ── A ── A2 [── A3]   and   original ── B
  const sexChain = (a2: "MALE" | null, a3?: "MALE" | null) => [
    sex("s-0", "FEMALE"),
    sex("s-a", null, T2, { supersedes: ["s-0"] }),
    sex("s-b", "MALE", T2, { supersedes: ["s-0"] }),
    sex("s-a2", a2, T3, { supersedes: ["s-a"] }),
    ...(a3 === undefined ? [] : [sex("s-a3", a3, LATER, { supersedes: ["s-a2"] })]),
  ];
  const locChain = (a2: string, to: string | null = null) => [
    loc("l-0", "field-0", JAN, null),
    loc("l-a", "field-1", FEB, to, T2, { supersedes: ["l-0"] }),
    loc("l-b", "field-2", FEB, to, T2, { supersedes: ["l-0"] }),
    loc("l-a2", a2, FEB, to, T3, { supersedes: ["l-a"] }),
  ];

  it("A. audit reproduction: superseding one SEX branch with an unchanged value keeps the conflict", () => {
    const s = project(ledgerOf(sexChain(null)));
    expect(s.sex).toMatchObject({ state: "CONFLICTING_EVIDENCE", value: null, conflictingValues: ["MALE"], issues: ["CATTLE_ANIMAL_COMPETING_CORRECTIONS"] });
    expect(ids(s.sex.evidence)).toEqual(["s-a2", "s-b"]);
  });

  it("B. genuine reconciliation: both latest branch terminals agree => KNOWN, history retained", () => {
    const ledger = ledgerOf(sexChain("MALE"));
    expect(project(ledger).sex).toMatchObject({ state: "KNOWN", value: "MALE", issues: [], supersededAssertionIds: ["s-0", "s-a"] });
    const history = animalAssertionHistory(ledger, "SEX", LATER)!;
    expect(history.map((h) => [h.assertion.assertionId, h.supersededBy])).toEqual([
      ["s-0", ["s-a", "s-b"]],
      ["s-a", ["s-a2"]],
      ["s-a2", []],
      ["s-b", []],
    ]);
    // Before the reconciling correction was known, the competition is reproduced exactly.
    expect(project(ledger, at(LATER, T2)).sex.state).toBe("CONFLICTING_EVIDENCE");
    // One correction superseding both branches also ends the competition.
    const merged = ledgerOf([...sexChain(null), sex("s-m", "MALE", LATER, { supersedes: ["s-a2", "s-b"] })]);
    expect(project(merged).sex).toMatchObject({ state: "KNOWN", value: "MALE", supersededAssertionIds: ["s-0", "s-a", "s-a2", "s-b"] });
  });

  it("H. multi-generation branch: ancestry is followed transitively, not one level", () => {
    const stillNull = project(ledgerOf(sexChain(null, null))).sex;
    expect(stillNull).toMatchObject({ state: "CONFLICTING_EVIDENCE", issues: ["CATTLE_ANIMAL_COMPETING_CORRECTIONS"] });
    expect(ids(stillNull.evidence)).toEqual(["s-a3", "s-b"]);
    expect(project(ledgerOf(sexChain(null, "MALE"))).sex).toMatchObject({ state: "KNOWN", value: "MALE", issues: [] });
    // Same on an interval kind: three generations on one side of the competition.
    const deep = ledgerOf([...locChain("field-1"), loc("l-a3", "field-1", FEB, null, LATER, { supersedes: ["l-a2"] })]);
    expect(project(deep, at(DEC)).location).toMatchObject({ state: "CONFLICTING_EVIDENCE", issues: ["CATTLE_ANIMAL_COMPETING_CORRECTIONS"] });
    expect(ids(project(deep, at(DEC)).location.evidence)).toEqual(["l-a3", "l-b"]);
  });

  it("C. interval: a corrected location branch still competes with the other branch", () => {
    const s = project(ledgerOf(locChain("field-1")), at(DEC));
    expect(s.location).toMatchObject({
      state: "CONFLICTING_EVIDENCE",
      conflictingValues: [{ kind: "FIELD", ref: "field-1" }, { kind: "FIELD", ref: "field-2" }],
      issues: ["CATTLE_ANIMAL_COMPETING_CORRECTIONS"],
    });
    expect(ids(s.location.evidence)).toEqual(["l-a2", "l-b"]);
  });

  it("D. interval reconciliation: both latest branches agree at effectiveAt => no false conflict", () => {
    expect(project(ledgerOf(locChain("field-2")), at(DEC)).location).toMatchObject({ state: "KNOWN", value: { kind: "FIELD", ref: "field-2" }, issues: [] });
  });

  it("E. F001 preserved: a February-only chained competition does not contaminate December", () => {
    const ledger = ledgerOf([...locChain("field-1", MAR), loc("l-later", "field-9", MAR, null, T2)]);
    expect(project(ledger, at(FEB_MID)).location).toMatchObject({ state: "CONFLICTING_EVIDENCE", issues: ["CATTLE_ANIMAL_COMPETING_CORRECTIONS"] });
    expect(project(ledger, at(DEC)).location).toMatchObject({ state: "KNOWN", value: { kind: "FIELD", ref: "field-9" }, issues: [] });
    // A branch's later correction that moves it out of February ends the February competition only there.
    const moved = ledgerOf([...locChain("field-1", MAR).slice(0, 3), loc("l-a2", "field-1", "2026-04-01T00:00:00Z", "2026-05-01T00:00:00Z", T3, { supersedes: ["l-a"] })]);
    expect(project(moved, at(FEB_MID)).location).toMatchObject({ state: "KNOWN", value: { kind: "FIELD", ref: "field-2" } });
    expect(project(moved, at(DEC)).location).toMatchObject({ state: "UNKNOWN", issues: ["CATTLE_ANIMAL_NO_EVIDENCE"] });
  });

  it("F. a descendant correction received after the knowledge cutoff cannot influence the earlier snapshot", () => {
    // Agreement known at T2; a later descendant (T3) re-opens the competition only for later cutoffs.
    const reopened = ledgerOf([
      loc("l-0", "field-0", JAN, null),
      loc("l-a", "field-1", FEB, null, T2, { supersedes: ["l-0"] }),
      loc("l-b", "field-1", FEB, null, T2, { supersedes: ["l-0"] }),
      loc("l-a2", "field-2", FEB, null, T3, { supersedes: ["l-a"] }),
    ]);
    expect(project(reopened, at(DEC, T2)).location).toMatchObject({ state: "KNOWN", value: { kind: "FIELD", ref: "field-1" } });
    expect(project(reopened, at(DEC, LATER)).location.state).toBe("CONFLICTING_EVIDENCE");
    // A reconciling descendant received at T3 cannot resolve the T2 snapshot's conflict.
    const reconciled = ledgerOf(locChain("field-2"));
    expect(project(reconciled, at(DEC, T2)).location).toMatchObject({ state: "CONFLICTING_EVIDENCE", issues: ["CATTLE_ANIMAL_COMPETING_CORRECTIONS"] });
    expect(project(reconciled, at(DEC, LATER)).location.state).toBe("KNOWN");
    const sexLedger = ledgerOf(sexChain("MALE", null));
    expect(project(sexLedger, at(LATER, T3)).sex.state).toBe("KNOWN");
    expect(project(sexLedger, at(LATER, LATER)).sex.state).toBe("CONFLICTING_EVIDENCE");
  });

  it("G. reversed and shuffled input yield the same snapshot and fingerprint", () => {
    const inputsList = [sexChain(null), sexChain("MALE"), sexChain(null, null), locChain("field-1"), locChain("field-2"), [...locChain("field-1", MAR), loc("l-later", "field-9", MAR, null, T2)]];
    const shuffle = <T>(list: T[]) => list.map((v, i) => [(i * 7 + 3) % 11, v] as const).sort(([a], [b]) => a - b).map(([, v]) => v);
    for (const inputs of inputsList) {
      for (const q of [at(FEB_MID), at(DEC), at(DEC, T2), at(LATER)]) {
        const base = project(ledgerOf(inputs), q);
        for (const variant of [[...inputs].reverse(), shuffle(inputs)]) {
          const other = project(ledgerOf(variant), q);
          expect(other).toEqual(base);
          expect(sameFingerprint(computeAnimalSnapshotFingerprint(other, hash), computeAnimalSnapshotFingerprint(base, hash))).toBe(true);
        }
      }
    }
  });

  it("I. a cycle or broken link inside a correction branch still fails closed", () => {
    const cyclic = project(
      ledgerOf([
        sex("s-0", "FEMALE"),
        sex("s-a", null, T2, { supersedes: ["s-0"] }),
        sex("s-b", "MALE", T2, { supersedes: ["s-0"] }),
        sex("s-a2", null, T3, { supersedes: ["s-a", "s-a3"] }),
        sex("s-a3", null, T3, { supersedes: ["s-a2"] }),
      ]),
    );
    expect(cyclic.sex).toMatchObject({ state: "INVALID_EVIDENCE", value: null, issues: ["CATTLE_ANIMAL_SUPERSESSION_CYCLE"] });
    const locCycle = project(ledgerOf([...locChain("field-1").slice(0, 3), loc("l-a2", "field-1", FEB, null, T3, { supersedes: ["l-a", "l-a3"] }), loc("l-a3", "field-1", FEB, null, T3, { supersedes: ["l-a2"] })]), at(DEC));
    expect(locCycle.location).toMatchObject({ state: "INVALID_EVIDENCE", issues: ["CATTLE_ANIMAL_SUPERSESSION_CYCLE"] });
    const broken = project(ledgerOf([...sexChain(null), sex("s-a3", null, LATER, { supersedes: ["s-a2", "missing"] })]));
    expect(broken.sex).toMatchObject({ state: "INVALID_EVIDENCE", issues: ["CATTLE_ANIMAL_SUPERSESSION_TARGET_NOT_KNOWN"] });
  });
});

describe("Cattle C1 remediation F004 — instant-typed fields compare by instant, not spelling", () => {
  const FEB = "2026-02-01T00:00:00Z";
  const FEB_MS = "2026-02-01T00:00:00.000Z";
  const FEB_MID = "2026-02-15T00:00:00Z";
  const MAR = "2026-03-01T00:00:00Z";
  const MAR_NS = "2026-03-01T00:00:00.000000000Z";
  const DEC = "2026-12-01T00:00:00Z";
  const JAN = "2026-01-01T00:00:00Z";
  const at = (effectiveAt: string, knowledgeCutoff = LATER): AnimalProjectionQuery => ({ effectiveAt, knowledgeCutoff });
  const twoCorrections = (a: [string, string, string | null], b: [string, string, string | null]) => [
    loc("l-0", "field-0", JAN, null),
    loc("l-a", a[0], a[1], a[2], T2, { supersedes: ["l-0"] }),
    loc("l-b", b[0], b[1], b[2], T2, { supersedes: ["l-0"] }),
  ];

  it("A. validFrom differing only in fractional-second spelling does not conflict", () => {
    const s = project(ledgerOf(twoCorrections(["field-1", FEB, null], ["field-1", FEB_MS, null])), at(DEC));
    expect(s.location).toMatchObject({ state: "KNOWN", value: { kind: "FIELD", ref: "field-1" }, issues: [] });
    // Original spellings are retained in the evidence.
    expect(s.location.evidence.map((e) => ("validFrom" in e ? e.validFrom : null))).toEqual([FEB, FEB_MS]);
  });

  it("B. validTo differing only in spelling does not conflict", () => {
    const s = project(ledgerOf(twoCorrections(["field-1", FEB, MAR], ["field-1", FEB, MAR_NS])), at(FEB_MID));
    expect(s.location).toMatchObject({ state: "KNOWN", value: { kind: "FIELD", ref: "field-1" }, issues: [] });
  });

  it("C. genuinely different boundaries keep the existing conflict semantics", () => {
    const s = project(ledgerOf(twoCorrections(["field-1", FEB, null], ["field-1", "2026-02-01T00:00:00.001Z", null])), at(DEC));
    expect(s.location).toMatchObject({ state: "CONFLICTING_EVIDENCE", issues: ["CATTLE_ANIMAL_COMPETING_CORRECTIONS"] });
    const to = project(ledgerOf(twoCorrections(["field-1", FEB, MAR], ["field-1", FEB, "2026-03-01T00:00:00.5Z"])), at(FEB_MID));
    expect(to.location.state).toBe("CONFLICTING_EVIDENCE");
  });

  it("D. F001 isolation, F003 lineage and knowledge cutoff are unchanged with mixed spellings", () => {
    const feb = ledgerOf([...twoCorrections(["field-1", FEB, MAR], ["field-2", FEB_MS, MAR_NS]), loc("l-later", "field-9", MAR_NS, null, T2)]);
    expect(project(feb, at(FEB_MID)).location).toMatchObject({ state: "CONFLICTING_EVIDENCE", issues: ["CATTLE_ANIMAL_COMPETING_CORRECTIONS"] });
    expect(project(feb, at(DEC)).location).toMatchObject({ state: "KNOWN", value: { kind: "FIELD", ref: "field-9" }, issues: [] });
    // Correction-of-correction: the reconciling terminal agrees with the other branch despite spelling.
    const T3_MS = "2026-06-01T00:00:00.000Z";
    const chain = (v: string) => ledgerOf([...twoCorrections(["field-1", FEB, null], ["field-2", FEB, null]), loc("l-a2", v, FEB_MS, null, T3_MS, { supersedes: ["l-a"] })]);
    expect(project(chain("field-2"), at(DEC)).location).toMatchObject({ state: "KNOWN", value: { kind: "FIELD", ref: "field-2" } });
    expect(project(chain("field-1"), at(DEC)).location).toMatchObject({ state: "CONFLICTING_EVIDENCE", issues: ["CATTLE_ANIMAL_COMPETING_CORRECTIONS"] });
    // receivedAt "…00.000Z" is known at cutoff T3 ("…00Z"), not at T2.
    expect(project(chain("field-2"), at(DEC, T3)).location.state).toBe("KNOWN");
    expect(project(chain("field-2"), at(DEC, T2)).location.state).toBe("CONFLICTING_EVIDENCE");
  });

  it("E. mixed spellings in reversed/shuffled order give the same snapshot and fingerprint", () => {
    const inputs = [...twoCorrections(["field-1", FEB, MAR], ["field-1", FEB_MS, MAR_NS]), loc("l-later", "field-9", MAR_NS, null, T2), sex("s-1", "MALE", "2026-03-01T00:00:00.0Z")];
    const shuffle = <T>(list: T[]) => list.map((v, i) => [(i * 5 + 2) % 7, v] as const).sort(([a], [b]) => a - b).map(([, v]) => v);
    for (const q of [at(FEB_MID), at(DEC), at(DEC, T1)]) {
      const base = project(ledgerOf(inputs), q);
      for (const variant of [[...inputs].reverse(), shuffle(inputs)]) {
        const other = project(ledgerOf(variant), q);
        expect(other).toEqual(base);
        expect(sameFingerprint(computeAnimalSnapshotFingerprint(other, hash), computeAnimalSnapshotFingerprint(base, hash))).toBe(true);
      }
    }
  });

  it("F. same id differing only in instant spelling is idempotent; a different instant is still rejected", () => {
    const z = loc("l-1", "field-1", FEB, MAR);
    const ms = loc("l-1", "field-1", FEB_MS, MAR_NS);
    for (const order of [[z, ms], [ms, z]]) {
      const r = createAnimalLedger(A, order);
      expect(r.ok && r.idempotentDuplicateIds).toEqual(["l-1"]);
      // One original spelling is kept, chosen independently of input order.
      expect(r.ok && r.ledger.assertions[0]).toMatchObject({ validFrom: FEB_MS, validTo: MAR_NS });
    }
    // Provenance instants too.
    const prov1 = sex("s-1", "MALE", T2, { provenance: prov(T2, { observedAt: T1 }) });
    const prov2 = sex("s-1", "MALE", T2, { provenance: prov("2026-04-01T00:00:00.000Z", { observedAt: "2026-03-01T00:00:00.00Z" }) });
    expect(createAnimalLedger(A, [prov1, prov2]).ok).toBe(true);
    // Append never rewrites the stored spelling.
    const stored = ledgerOf([z]);
    const again = appendAnimalAssertions(stored, [ms]);
    expect(again.ok && again.ledger.assertions).toEqual(stored.assertions);
    expect(again.ok && Object.isFrozen(again.ledger.assertions[0])).toBe(true);
    // A genuinely different instant (or non-instant field) is still changed content.
    for (const changed of [loc("l-1", "field-1", "2026-02-01T00:00:00.001Z", MAR), loc("l-1", "field-2", FEB_MS, MAR), sex("s-1", "MALE", "2026-04-01T00:00:00.001Z")]) {
      const base = changed.kind === "SEX" ? ledgerOf([sex("s-1", "MALE", T2)]) : stored;
      const r = appendAnimalAssertions(base, [changed]);
      expect(!r.ok && r.issues.map((i) => i.code)).toEqual(["CATTLE_ANIMAL_DUPLICATE_ID_DIFFERENT_CONTENT"]);
    }
    // DOB is a calendar date: exact comparison, unchanged.
    expect(appendAnimalAssertions(ledgerOf([dob("d-1", "2025-02-10")]), [dob("d-1", "2025-02-11")]).ok).toBe(false);
  });

  it("G. malformed or unsupported instant syntax still fails closed", () => {
    for (const bad of ["2026-02-01T01:00:00+01:00", "2026-02-01T00:00:00", "2026-02-01", "2026-02-01T00:00:00.0000000000Z", "2026-02-30T00:00:00Z"]) {
      expect(createAnimalLedger(A, [loc("l-1", "field-1", bad, null)]).ok).toBe(false);
      expect(createAnimalLedger(A, [sex("s-1", "MALE", bad)]).ok).toBe(false);
    }
    expect(projectAnimalSnapshot(ledgerOf([sex("s-1", "MALE")]), at("2026-02-01T01:00:00+01:00")).ok).toBe(false);
    expect(() => animalInstantKey("2026-02-01T01:00:00+01:00")).toThrow();
  });
});
