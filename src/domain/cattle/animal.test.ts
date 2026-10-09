/**
 * Cattle C1 — canonical animal lifecycle. Synthetic data only (`SYNTH-*`).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANIMAL_ASSERTION_KINDS,
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
