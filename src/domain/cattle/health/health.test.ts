/**
 * Cattle C3 — health and medicines engine. Synthetic data only: every
 * animal, product, authorisation, food-product code, route, period, dose and
 * practitioner is a fictional `SYNTH-*` fixture with no veterinary meaning.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONFORMS,
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
import { buildRecommendationEvidencePack, type RecommendationEvidencePackInput } from "../evidence-pack";
import * as cattle from "../index";
import { computeSourceContentFingerprint } from "../source";
import { hash } from "../test-fixtures";
import { projectAnimalHealth, verifyAnimalHealthProjection, type AnimalHealthProjection, type AnimalHealthResult } from "./health-engine";
import { projectWithdrawalHardGates, withdrawalGateRuleId } from "./health-hard-gates";

const A = "SYNTH-ANIMAL-1";
const MEAT = "SYNTH-FOOD-MEAT";
const MILK = "SYNTH-FOOD-MILK";
const PRODUCT = "SYNTH-PRODUCT-1";
const PRODUCT_2 = "SYNTH-PRODUCT-2";
const ADMIN_AT = "2026-04-01T08:00:00Z";
const MEAT_END = "2026-04-11T08:00:00.000000000Z"; // ADMIN_AT + 10 DAY (synthetic)
const MILK_END = "2026-04-03T08:00:00.000000000Z"; // ADMIN_AT + 48 HOUR (synthetic)
const RECEIVED = "2026-04-01T09:00:00Z";
const EFFECTIVE = "2026-04-05T00:00:00Z";
const CUTOFF = "2026-12-31T00:00:00Z";

function ledgerOf(): AnimalLedger {
  const prov = { sourceCategory: "FARMER" as const, receivedAt: "2026-03-01T12:00:00Z" };
  const result = createAnimalLedger(A, [
    { assertionId: "a-dob", animalId: A, kind: "DATE_OF_BIRTH", value: "2026-03-01", provenance: prov },
    { assertionId: "a-sex", animalId: A, kind: "SEX", value: "FEMALE", provenance: prov },
  ]);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.ledger;
}
const LEDGER = ledgerOf();

type Rec = Record<string, unknown>;

const prov = (receivedAt = RECEIVED, actorRole = "FARMER", sourceCategory = "FARMER", extra: Rec = {}) => ({ sourceCategory, actorRole, receivedAt, ...extra });
const VET = (receivedAt = RECEIVED) => prov(receivedAt, "VETERINARIAN", "VETERINARY_SOURCE", { actor: "SYNTH-VET-1" });

function rec(recordId: string, kind: string, fields: Rec = {}, receivedAt = RECEIVED): Rec {
  return { recordId, animalId: A, kind, occurredAt: ADMIN_AT, provenance: prov(receivedAt), ...fields };
}
const finding = (text = "synthetic sign") => ({ text });
function adm(recordId: string, fields: Rec = {}, receivedAt = RECEIVED): Rec {
  return rec(recordId, "MEDICINE_ADMINISTRATION", { productId: PRODUCT, route: "SYNTH-ROUTE-A", dose: { amount: 5, unit: "SYNTH-DOSE-UNIT" }, batchRef: "SYNTH-BATCH-1", ...fields }, receivedAt);
}

const SOURCE_REF = { sourceId: "SYNTH-SRC-PRODUCT", version: "v1", contentFingerprint: computeSourceContentFingerprint({ text: "synthetic product sheet" }, hash) };
const meat = (amount: number | null = 10, unit = "DAY", extra: Rec = {}) => ({ foodProduct: MEAT, route: null, period: amount === null ? null : { amount, unit }, ...extra });
const milk = (amount = 48, unit = "HOUR") => ({ foodProduct: MILK, route: null, period: { amount, unit } });

function product(overrides: Rec = {}, periods: Rec[] = [meat(), milk()], times = { retrievedAt: "2026-01-01T00:00:00Z", checkedAt: "2026-01-02T00:00:00Z" }): Rec {
  return {
    productId: PRODUCT,
    version: "v1",
    authorisation: { scheme: "SYNTH-SCHEME", number: "SYNTH-AUTH-1" },
    label: "Synthetic product one",
    lifecycle: "ACTIVE",
    speciesAuthorisations: [{ species: "BOVINE", withdrawalPeriods: periods }],
    source: { publisher: "SYNTH-PUBLISHER", sourceRef: SOURCE_REF, ...times },
    ...overrides,
  };
}

interface RunOptions {
  products?: unknown[];
  effectiveAt?: string;
  knowledgeCutoff?: string;
  foodProducts?: string[];
  timelineFilter?: unknown;
}

function run(health: unknown[], o: RunOptions = {}): AnimalHealthResult {
  const query: Rec = { effectiveAt: o.effectiveAt ?? EFFECTIVE, knowledgeCutoff: o.knowledgeCutoff ?? CUTOFF, foodProducts: o.foodProducts ?? [MEAT, MILK] };
  if (o.timelineFilter !== undefined) query.timelineFilter = o.timelineFilter;
  return projectAnimalHealth({ ledger: LEDGER, healthRecords: health, productRecords: o.products ?? [product()], query } as never, hash);
}
function ok(result: AnimalHealthResult): AnimalHealthProjection {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.projection;
}
const gate = (p: AnimalHealthProjection, fp = MEAT) => p.withdrawalGate.entries.find((e) => e.foodProduct === fp)!;
const codes = (r: AnimalHealthResult) => (r.ok ? [] : r.issues.map((i) => i.code));
const failsClosed = (r: AnimalHealthResult) => !r.ok;
const gateStates = (r: AnimalHealthResult) => (r.ok ? r.projection.withdrawalGate.entries.map((e) => e.state) : ["REJECTED"]);

const ALL_KINDS = [
  rec("h-obs", "HEALTH_OBSERVATION", { noteKind: "OBSERVED_SIGN", finding: finding() }),
  rec("h-sym", "SYMPTOM", { finding: { codeSystem: "SYNTH-CODES", code: "SYNTH-S1", text: null } }),
  { ...rec("h-dx", "DIAGNOSIS", { condition: finding("synthetic condition"), diagnosedByRef: "SYNTH-VET-1" }), provenance: VET() },
  { ...rec("h-vet", "VETERINARY_EVENT", { eventType: "EXAMINATION", practitionerRef: "SYNTH-VET-1" }), provenance: VET() },
  rec("h-tx", "TREATMENT", { prescriptionRef: "SYNTH-RX-1", practitionerRef: "SYNTH-VET-1" }),
  adm("h-adm", { treatmentRecordId: "h-tx", prescriptionRef: "SYNTH-RX-1" }),
];

describe("C3 health records — kinds, append-only history, identity", () => {
  it("every record kind is admitted and projected with its information class", () => {
    const p = ok(run(ALL_KINDS));
    expect(p.timeline.entries.map((e) => [e.recordId, e.kind, e.informationClass, e.status])).toEqual([
      ["h-adm", "MEDICINE_ADMINISTRATION", "FACT", "LIVE"],
      ["h-dx", "DIAGNOSIS", "OBSERVATION", "LIVE"],
      ["h-obs", "HEALTH_OBSERVATION", "OBSERVATION", "LIVE"],
      ["h-sym", "SYMPTOM", "OBSERVATION", "LIVE"],
      ["h-tx", "TREATMENT", "FACT", "LIVE"],
      ["h-vet", "VETERINARY_EVENT", "FACT", "LIVE"],
    ]);
    expect(p.knownRecordIds).toEqual(["h-adm", "h-dx", "h-obs", "h-sym", "h-tx", "h-vet"]);
    const entry = p.medicineLedger.entries[0];
    expect(entry.treatmentRecordKnown).toBe(true);
    expect(entry.record.dose).toEqual({ amount: 5, unit: "SYNTH-DOSE-UNIT" });
    expect(entry.record.prescriptionRef).toBe("SYNTH-RX-1");
  });

  it("a correction supersedes within its kind; superseded history stays in the timeline", () => {
    const fix = rec("h-sym-2", "SYMPTOM", { finding: finding("corrected sign"), supersedes: ["h-sym"] }, "2026-04-02T00:00:00Z");
    const p = ok(run([...ALL_KINDS, fix]));
    const sym = p.timeline.entries.find((e) => e.recordId === "h-sym")!;
    expect(sym.status).toBe("SUPERSEDED");
    expect(sym.supersededBy).toEqual(["h-sym-2"]);
    expect(p.timeline.entries.find((e) => e.recordId === "h-sym-2")!.status).toBe("LIVE");
  });

  it("a retraction removes an administration from the gate but keeps its history", () => {
    const retract = { recordId: "h-ret", animalId: A, kind: "RETRACTION", occurredAt: null, provenance: prov("2026-04-02T00:00:00Z"), supersedes: ["h-adm"] };
    const p = ok(run([adm("h-adm"), retract]));
    expect(p.medicineLedger.entries.map((e) => [e.recordId, e.status, e.supersededBy])).toEqual([["h-adm", "SUPERSEDED", ["h-ret"]]]);
    expect(gate(p).state).toBe("CLEAR");
    expect(gate(p).administrationIds).toEqual([]);
    expect(codes(run([{ ...retract, supersedes: [] }]))).toContain("CATTLE_HEALTH_RETRACTION_WITHOUT_TARGET");
  });

  it("identity: identical duplicate idempotent; same id + different content (even invalid) fails closed", () => {
    const base = [adm("h-adm")];
    const verdict = checkDuplicateIdentity(
      "administration",
      base,
      adm("h-adm"),
      [
        { label: "different dose", record: adm("h-adm", { dose: { amount: 6, unit: "SYNTH-DOSE-UNIT" } }) },
        { label: "invalid copy", record: adm("h-adm", { occurredAt: "not-an-instant" }) },
        { label: "different kind", record: rec("h-adm", "SYMPTOM", { finding: finding() }) },
      ],
      (records) => run([...records]),
      failsClosed,
    );
    expect(verdict).toEqual(CONFORMS);
    expect(codes(run([adm("h-adm"), adm("h-adm", { dose: null })]))).toContain("CATTLE_HEALTH_RECORD_DUPLICATE_ID_DIFFERENT_CONTENT");
    // Equivalent instant spellings are the same content: idempotent, one spelling kept independent of input order.
    const respelled = { ...adm("h-adm"), occurredAt: "2026-04-01T08:00:00.000Z", provenance: prov("2026-04-01T09:00:00.000Z") };
    const ab = ok(run([adm("h-adm"), respelled]));
    expect(ab).toEqual(ok(run([respelled, adm("h-adm")])));
    expect(ab.withdrawalGate.fingerprint).toEqual(ok(run([adm("h-adm")])).withdrawalGate.fingerprint);
  });

  it("competing corrections stay in conflict with no winner; administrations put every gate in EVIDENCE_CONFLICT", () => {
    const c1 = adm("h-adm-c1", { supersedes: ["h-adm"], dose: { amount: 6, unit: "SYNTH-DOSE-UNIT" } }, "2026-04-02T00:00:00Z");
    const c2 = adm("h-adm-c2", { supersedes: ["h-adm"], dose: { amount: 7, unit: "SYNTH-DOSE-UNIT" } }, "2026-04-02T00:00:00Z");
    const p = ok(run([adm("h-adm"), c1, c2], { effectiveAt: "2026-06-01T00:00:00Z" }));
    expect(p.timeline.competitions).toEqual([{ targetId: "h-adm", terminalIds: ["h-adm-c1", "h-adm-c2"] }]);
    expect(p.timeline.entries.every((e) => e.inCompetition)).toBe(true);
    expect(p.withdrawalGate.entries.map((e) => e.state)).toEqual(["EVIDENCE_CONFLICT", "EVIDENCE_CONFLICT"]);
    const symptoms = [rec("s", "SYMPTOM", { finding: finding("a") }), rec("s1", "SYMPTOM", { finding: finding("b"), supersedes: ["s"] }), rec("s2", "SYMPTOM", { finding: finding("c"), supersedes: ["s"] })];
    expect(ok(run(symptoms)).timeline.competitions).toEqual([{ targetId: "s", terminalIds: ["s1", "s2"] }]);
  });

  it("supersession defects fail closed: unknown target, cross-kind, targeting a retraction, cycle", () => {
    expect(codes(run([rec("s1", "SYMPTOM", { finding: finding(), supersedes: ["missing"] })]))).toContain("CATTLE_HEALTH_SUPERSESSION_TARGET_NOT_KNOWN");
    const cycle = [rec("x", "SYMPTOM", { finding: finding("a"), supersedes: ["y"] }), rec("y", "SYMPTOM", { finding: finding("b"), supersedes: ["x"] })];
    expect(codes(run(cycle))).toContain("CATTLE_HEALTH_SUPERSESSION_CYCLE");
    const ret = { recordId: "r1", animalId: A, kind: "RETRACTION", occurredAt: null, provenance: prov(), supersedes: ["s"] };
    const reRet = { ...ret, recordId: "r2", supersedes: ["r1"] };
    expect(codes(run([rec("s", "SYMPTOM", { finding: finding() }), ret, reRet]))).toContain("CATTLE_HEALTH_SUPERSESSION_OUT_OF_SCOPE");
    expect(codes(run([rec("s", "SYMPTOM", { finding: finding() }), { ...rec("s", "SYMPTOM"), recordId: "self", finding: finding(), supersedes: ["self"] }]))).toContain(
      "CATTLE_HEALTH_RECORD_SELF_SUPERSESSION",
    );
  });
});

describe("C3 veterinary boundary — no autonomous diagnosis", () => {
  const dx = (provenance: Rec) => ({ ...rec("h-dx", "DIAGNOSIS", { condition: finding("synthetic condition"), diagnosedByRef: "SYNTH-REF" }), provenance });

  it("a farmer / staff / system / mis-channelled record can never create a DIAGNOSIS", () => {
    for (const p of [prov(), prov(RECEIVED, "FARM_STAFF"), prov(RECEIVED, "SYSTEM", "OTHER"), prov(RECEIVED, "OTHER", "VETERINARY_SOURCE"), prov(RECEIVED, "VETERINARIAN", "FARMER"), prov(RECEIVED, "LABORATORY", "DEVICE")]) {
      expect(codes(run([dx(p)]))).toContain("CATTLE_HEALTH_DIAGNOSIS_SOURCE_NOT_DIAGNOSTIC");
    }
  });

  it("veterinary- or laboratory-sourced diagnoses are accepted with their provenance", () => {
    const vet = ok(run([dx(VET())])).timeline.entries[0];
    expect(vet.kind).toBe("DIAGNOSIS");
    expect(vet.record.provenance).toMatchObject({ actorRole: "VETERINARIAN", sourceCategory: "VETERINARY_SOURCE", actor: "SYNTH-VET-1" });
    expect(ok(run([dx(prov(RECEIVED, "LABORATORY", "OTHER"))])).timeline.entries[0].kind).toBe("DIAGNOSIS");
  });

  it("a farmer suspected-condition note stays a labelled observation; a symptom is never upgraded", () => {
    const note = rec("h-note", "HEALTH_OBSERVATION", { noteKind: "SUSPECTED_CONDITION", finding: finding("synthetic suspicion") });
    const symptom = rec("h-sym", "SYMPTOM", { finding: finding() });
    const p = ok(run([note, symptom]));
    expect(p.timeline.entries.map((e) => [e.kind, e.record.kind === "HEALTH_OBSERVATION" ? e.record.noteKind : null])).toEqual([
      ["HEALTH_OBSERVATION", "SUSPECTED_CONDITION"],
      ["SYMPTOM", null],
    ]);
    const upgrade = { ...dx(VET("2026-04-02T00:00:00Z")), supersedes: ["h-sym"] };
    expect(codes(run([symptom, upgrade]))).toContain("CATTLE_HEALTH_SUPERSESSION_OUT_OF_SCOPE");
  });

  it("no code path infers, classifies, diagnoses or prescribes; no clock, network or AI dependency", () => {
    const dir = __dirname;
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sources.length).toBeGreaterThan(5);
    for (const f of sources) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/Date\.now|new Date\(|performance\.now|Math\.random|fetch\(|XMLHttpRequest|openai|anthropic|@\/tooling|src\/tooling/);
      expect(text, f).not.toMatch(/function\s+(infer|classify|diagnose|prescribe|suggest|recommend)([A-Z]|\s*\()/);
    }
  });
});

describe("C3 product binding — supplied data only, never assumed", () => {
  const states = (products: unknown[], admin = adm("h-adm")) => {
    const p = ok(run([admin], { products }));
    return { binding: p.medicineLedger.entries[0].binding, gates: p.withdrawalGate.entries.map((e) => e.state) };
  };

  it("binds the single live ACTIVE BOVINE version and reports it", () => {
    const { binding, gates } = states([product()]);
    expect(binding.state).toBe("BOUND");
    expect(binding.product).toEqual({ productId: PRODUCT, version: "v1", source: SOURCE_REF });
    expect(gates).toEqual(["IN_WITHDRAWAL", "CLEAR"]);
    const v2 = product({ version: "v2", supersedesVersions: ["v1"] }, [meat(12), milk()], { retrievedAt: "2026-02-01T00:00:00Z", checkedAt: "2026-02-01T00:00:00Z" });
    expect(states([product(), v2]).binding.product?.version).toBe("v2");
  });

  it("missing / unidentified / not current / non-bovine / conflicting / invalid product data ⇒ explicit non-bound state, never CLEAR", () => {
    const v2a = product({ version: "v2a", supersedesVersions: ["v1"] }, [meat(11), milk()]);
    const v2b = product({ version: "v2b", supersedesVersions: ["v1"] }, [meat(12), milk()]);
    const cases: [string, unknown[], Rec, string][] = [
      ["no record", [], adm("h-adm"), "UNKNOWN"],
      ["product not identified", [product()], adm("h-adm", { productId: null }), "UNKNOWN"],
      ["record for another product", [product({ productId: PRODUCT_2 })], adm("h-adm"), "UNKNOWN"],
      ["not current", [product({ lifecycle: "REVIEW_REQUIRED" })], adm("h-adm"), "REVIEW_REQUIRED"],
      ["historical", [product({ lifecycle: "HISTORICAL" })], adm("h-adm"), "REVIEW_REQUIRED"],
      ["not authorised for bovine", [product({ speciesAuthorisations: [{ species: "SYNTH-OTHER-SPECIES", withdrawalPeriods: [meat()] }] })], adm("h-adm"), "UNSUPPORTED"],
      ["no species authorisation", [product({ speciesAuthorisations: [] })], adm("h-adm"), "UNSUPPORTED"],
      ["two live versions", [product(), product({ version: "v9" })], adm("h-adm"), "EVIDENCE_CONFLICT"],
      ["competing revisions", [product(), v2a, v2b], adm("h-adm"), "EVIDENCE_CONFLICT"],
      ["authorisation mismatch", [product()], adm("h-adm", { recordedAuthorisation: { scheme: "SYNTH-SCHEME", number: "SYNTH-AUTH-OTHER" } }), "EVIDENCE_CONFLICT"],
      ["revision of an unknown version", [product({ version: "v2", supersedesVersions: ["v1"] })], adm("h-adm"), "INVALID"],
    ];
    const results = cases.map(([label, products, admin, expected]) => {
      const s = states(products, admin);
      expect(s.binding.state, label).toBe(expected);
      expect(s.binding.product, label).toBeNull();
      return { label, result: run([admin], { products }) };
    });
    expect(checkUnresolvedEvidenceNotMasked(results, gateStates, ["CLEAR", "IN_WITHDRAWAL"])).toEqual(CONFORMS);
    expect(states([product()], adm("h-adm", { recordedAuthorisation: { scheme: "SYNTH-SCHEME", number: "SYNTH-AUTH-1" } })).binding.state).toBe("BOUND");
  });

  it("malformed or colliding product records fail closed", () => {
    expect(codes(run([], { products: [product({ lifecycle: "SYNTH-NEW" })] }))).toContain("CATTLE_HEALTH_PRODUCT_RECORD_INVALID_CONTENT");
    expect(codes(run([], { products: [product({ source: { publisher: "P", sourceRef: { ...SOURCE_REF, contentFingerprint: { ...SOURCE_REF.contentFingerprint, digest: "ABC" } }, retrievedAt: "2026-01-01T00:00:00Z", checkedAt: "2026-01-01T00:00:00Z" } })] }))).toContain(
      "CATTLE_HEALTH_PRODUCT_RECORD_INVALID_SOURCE",
    );
    expect(codes(run([], { products: [product(), product({}, [meat(11), milk()])] }))).toContain("CATTLE_HEALTH_PRODUCT_RECORD_DUPLICATE_VERSION_DIFFERENT_CONTENT");
    expect(codes(run([], { products: [product(), product({ label: 5 })] }))).toContain("CATTLE_HEALTH_PRODUCT_RECORD_DUPLICATE_VERSION_DIFFERENT_CONTENT");
    expect(codes(run([], { products: [product({}, [meat(), meat(11)])] }))).toContain("CATTLE_HEALTH_PRODUCT_RECORD_INVALID_CONTENT");
    expect(run([], { products: [product(), product({}, [milk(), meat()], { retrievedAt: "2026-01-01T00:00:00.000Z", checkedAt: "2026-01-02T00:00:00Z" })] }).ok).toBe(true);
  });
});

describe("C3 withdrawal calculation", () => {
  const meatW = (p: AnimalHealthProjection, i = 0) => p.medicineLedger.entries[i].withdrawals.find((w) => w.foodProduct === MEAT)!;

  it("computes the end from the supplied period; boundary: just before end ⇒ IN_WITHDRAWAL, at end ⇒ CLEAR", () => {
    const before = cutoffMatrix(MEAT_END).before;
    const p = ok(run([adm("h-adm")], { effectiveAt: before }));
    expect(meatW(p)).toMatchObject({ state: "KNOWN", withdrawalEnd: MEAT_END, governingPeriod: "PRODUCT" });
    expect(gate(p)).toMatchObject({ state: "IN_WITHDRAWAL", inWithdrawalUntil: MEAT_END, administrationIds: ["h-adm"] });
    expect(gate(p).productVersions).toEqual([{ productId: PRODUCT, version: "v1", source: SOURCE_REF }]);
    for (const at of equivalentInstantSpellings("2026-04-11T08:00:00Z")) expect(gate(ok(run([adm("h-adm")], { effectiveAt: at }))).state).toBe("CLEAR");
    expect(gate(ok(run([adm("h-adm")], { effectiveAt: cutoffMatrix(MILK_END).before })), MILK)).toMatchObject({ state: "IN_WITHDRAWAL", inWithdrawalUntil: MILK_END });
    expect(gate(ok(run([adm("h-adm")], { effectiveAt: MILK_END })), MILK).state).toBe("CLEAR");
  });

  it("a supplied zero period is data: the end is the administration instant", () => {
    const p = ok(run([adm("h-adm")], { products: [product({}, [meat(0), milk()])], effectiveAt: ADMIN_AT }));
    expect(meatW(p).withdrawalEnd).toBe("2026-04-01T08:00:00.000000000Z");
    expect(gate(p).state).toBe("CLEAR");
  });

  it("an administration after effectiveAt is not yet in view", () => {
    const p = ok(run([adm("h-adm")], { effectiveAt: cutoffMatrix(ADMIN_AT).before }));
    expect(p.medicineLedger.entries).toEqual([]);
    expect(p.timeline.notYetOccurredRecordIds).toEqual(["h-adm"]);
    expect(gate(p).state).toBe("CLEAR");
  });

  it("a prescriber-specified longer period is honoured; a shorter one never shortens the product period", () => {
    const longer = adm("h-adm", { prescriberWithdrawal: { prescriberRef: "SYNTH-VET-1", periods: [{ foodProduct: MEAT, period: { amount: 20, unit: "DAY" } }] } });
    const p = ok(run([longer]));
    expect(meatW(p)).toMatchObject({ state: "KNOWN", withdrawalEnd: "2026-04-21T08:00:00.000000000Z", governingPeriod: "PRESCRIBER", prescriberPeriod: { amount: 20, unit: "DAY" } });
    expect(gate(ok(run([longer], { effectiveAt: "2026-04-15T00:00:00Z" }))).state).toBe("IN_WITHDRAWAL");
    const shorter = adm("h-adm", { prescriberWithdrawal: { prescriberRef: "SYNTH-VET-1", periods: [{ foodProduct: MEAT, period: { amount: 1, unit: "DAY" } }] } });
    expect(meatW(ok(run([shorter])))).toMatchObject({ withdrawalEnd: MEAT_END, governingPeriod: "PRODUCT", reasonCodes: ["CATTLE_HEALTH_PRESCRIBER_PERIOD_NOT_LONGER"] });
  });

  it("unknown period, time, route, unit or exactness ⇒ UNKNOWN, never CLEAR", () => {
    const late = "2027-06-01T00:00:00Z";
    const routeSpecific = product({}, [{ ...meat(), route: "SYNTH-ROUTE-A" }, milk()]);
    const cases: [string, Rec, unknown[], string][] = [
      ["period not stated", adm("h-adm"), [product({}, [meat(null), milk()])], "CATTLE_HEALTH_WITHDRAWAL_PERIOD_NOT_STATED"],
      ["no entry for food product", adm("h-adm"), [product({}, [milk()])], "CATTLE_HEALTH_WITHDRAWAL_NO_PERIOD_FOR_FOOD_PRODUCT"],
      ["administration time unknown", adm("h-adm", { occurredAt: null }), [product()], "CATTLE_HEALTH_ADMINISTRATION_TIME_UNKNOWN"],
      ["route not recorded, periods route-specific", adm("h-adm", { route: null }), [routeSpecific], "CATTLE_HEALTH_WITHDRAWAL_ROUTE_UNKNOWN"],
      ["route has no period", adm("h-adm", { route: "SYNTH-ROUTE-B" }), [routeSpecific], "CATTLE_HEALTH_WITHDRAWAL_NO_PERIOD_FOR_FOOD_PRODUCT"],
      ["route and general period both match", adm("h-adm"), [product({}, [meat(), { ...meat(12), route: "SYNTH-ROUTE-A" }, milk()])], "CATTLE_HEALTH_WITHDRAWAL_PERIOD_AMBIGUOUS"],
      ["unsupported unit", adm("h-adm"), [product({}, [meat(3, "SYNTH-MILKINGS"), milk()])], "CATTLE_HEALTH_WITHDRAWAL_PERIOD_UNIT_UNSUPPORTED:SYNTH-MILKINGS"],
      ["fractional amount", adm("h-adm"), [product({}, [meat(1.5), milk()])], "CATTLE_HEALTH_WITHDRAWAL_PERIOD_NOT_WHOLE_UNITS"],
      [
        "prescriber unit unsupported",
        adm("h-adm", { prescriberWithdrawal: { prescriberRef: "SYNTH-VET-1", periods: [{ foodProduct: MEAT, period: { amount: 2, unit: "SYNTH-WEEK" } }] } }),
        [product()],
        "CATTLE_HEALTH_PRESCRIBER_WITHDRAWAL_PERIOD_UNIT_UNSUPPORTED:SYNTH-WEEK",
      ],
    ];
    const results = cases.map(([label, admin, products, reason]) => {
      const result = run([admin], { products, effectiveAt: late });
      const p = ok(result);
      expect(meatW(p), label).toMatchObject({ state: "UNKNOWN", withdrawalEnd: null });
      expect(meatW(p).reasonCodes, label).toContain(reason);
      expect(gate(p).state, label).toBe("UNKNOWN");
      return { label, result };
    });
    expect(checkUnresolvedEvidenceNotMasked(results, (r) => (r.ok ? [gate(r.projection).state] : ["REJECTED"]), ["CLEAR"])).toEqual(CONFORMS);
  });

  it("multiple administrations: the latest end governs only when every end is known; any unknown ⇒ UNKNOWN", () => {
    const products = [product(), product({ productId: PRODUCT_2, authorisation: { scheme: "SYNTH-SCHEME", number: "SYNTH-AUTH-2" } }, [meat(30), milk()])];
    const second = adm("h-adm-2", { productId: PRODUCT_2, occurredAt: "2026-04-02T08:00:00Z" });
    const p = ok(run([adm("h-adm"), second], { products, effectiveAt: "2026-04-20T00:00:00Z" }));
    expect(gate(p)).toMatchObject({ state: "IN_WITHDRAWAL", inWithdrawalUntil: "2026-05-02T08:00:00.000000000Z", administrationIds: ["h-adm", "h-adm-2"] });
    expect(gate(p).productVersions.map((v) => v.productId)).toEqual([PRODUCT, PRODUCT_2]);
    const unknown = ok(run([adm("h-adm"), { ...second, productId: "SYNTH-PRODUCT-UNKNOWN" }], { products, effectiveAt: "2026-04-05T00:00:00Z" }));
    expect(gate(unknown).state).toBe("UNKNOWN");
    expect(gate(unknown).inWithdrawalUntil).toBeNull();
  });

  it("a multi-dose course needs a supplied multi-dose basis; with it, each administration counts from its own instant", () => {
    const tx = rec("h-tx", "TREATMENT", { prescriptionRef: "SYNTH-RX-1" });
    const course = [tx, adm("d1", { treatmentRecordId: "h-tx" }), adm("d2", { treatmentRecordId: "h-tx", occurredAt: "2026-04-02T08:00:00Z" })];
    const without = ok(run(course, { effectiveAt: "2026-06-01T00:00:00Z" }));
    expect(without.medicineLedger.entries.map((e) => e.courseSize)).toEqual([2, 2]);
    expect(meatW(without).reasonCodes).toContain("CATTLE_HEALTH_WITHDRAWAL_MULTI_DOSE_RULE_NOT_SUPPLIED");
    expect(gate(without).state).toBe("UNKNOWN");
    const withBasis = ok(run(course, { products: [product({}, [meat(10, "DAY", { multiDoseBasis: "PERIOD_FROM_EACH_ADMINISTRATION" }), milk()])], effectiveAt: "2026-04-11T09:00:00Z" }));
    expect(gate(withBasis)).toMatchObject({ state: "IN_WITHDRAWAL", inWithdrawalUntil: "2026-04-12T08:00:00.000000000Z" });
    expect(meatW(ok(run([adm("solo", { treatmentRecordId: "h-tx" })]))).state).toBe("KNOWN");
  });
});

describe("C3 bitemporal reconstruction (CAT-INV-003/004/005/006/013)", () => {
  const LATE = "2026-05-01T00:00:00Z";
  const evaluate = (records: readonly unknown[], knowledgeCutoff: string) => run([...records], { knowledgeCutoff, effectiveAt: "2026-04-10T00:00:00Z" });

  it("a late-arriving administration changes the current projection, never an earlier cutoff", () => {
    const late = adm("h-late", {}, LATE);
    const m = cutoffMatrix(LATE);
    expect(gate(ok(evaluate([late], m.before))).state).toBe("CLEAR");
    expect(gate(ok(evaluate([late], m.at))).state).toBe("IN_WITHDRAWAL");
    expect(gate(ok(evaluate([late], m.after))).state).toBe("IN_WITHDRAWAL");
    const observation = rec("h-obs", "HEALTH_OBSERVATION", { noteKind: "OBSERVED_SIGN", finding: finding() });
    const verdict = checkFutureKnowledgeInvisible(
      [
        { label: "late administration", known: [observation], later: [late], knowledgeCutoff: m.before },
        { label: "late malformed administration", known: [observation], later: [adm("h-bad", { dose: "lots" }, LATE)], knowledgeCutoff: m.before },
        { label: "late colliding id", known: [observation], later: [{ ...observation, finding: finding("other"), provenance: prov(LATE) }], knowledgeCutoff: m.before },
        { label: "late dangling correction", known: [adm("h-adm")], later: [adm("h-c", { supersedes: ["nope"] }, LATE)], knowledgeCutoff: m.before },
        { label: "late non-diagnostic diagnosis", known: [], later: [rec("h-dx", "DIAGNOSIS", { condition: finding(), diagnosedByRef: "X" }, LATE)], knowledgeCutoff: m.before },
      ],
      evaluate,
    );
    expect(verdict).toEqual(CONFORMS);
  });

  it("a later product revision (even malformed) never changes an earlier cutoff", () => {
    const revised = (extra: Rec) => product({ version: "v2", supersedesVersions: ["v1"], ...extra }, [meat(30), milk()], { retrievedAt: LATE, checkedAt: LATE });
    const evalProducts = (products: readonly unknown[], knowledgeCutoff: string) => run([adm("h-adm")], { products: [...products], knowledgeCutoff, effectiveAt: "2026-04-20T00:00:00Z" });
    const m = cutoffMatrix(LATE);
    const verdict = checkFutureKnowledgeInvisible(
      [
        { label: "revision", known: [product()], later: [revised({})], knowledgeCutoff: m.before },
        { label: "malformed revision", known: [product()], later: [revised({ lifecycle: 7 })], knowledgeCutoff: m.before },
        { label: "colliding revision", known: [product()], later: [product({}, [meat(99), milk()], { retrievedAt: "2026-01-01T00:00:00Z", checkedAt: LATE })], knowledgeCutoff: m.before },
      ],
      evalProducts,
    );
    expect(verdict).toEqual(CONFORMS);
    expect(gate(ok(evalProducts([product()], m.before))).state).toBe("CLEAR");
    expect(gate(ok(evalProducts([product(), revised({})], m.after))).state).toBe("IN_WITHDRAWAL");
  });

  it("malformed knowledge times fail closed (health receivedAt, product retrievedAt and checkedAt)", () => {
    const verdicts = [
      checkMalformedKnowledgeTimeFailsClosed("health receivedAt", [adm("h-adm")], (t) => ({ ...adm("h-x"), provenance: { ...prov(), receivedAt: t } }), (r) => run([...r]), failsClosed),
      checkMalformedKnowledgeTimeFailsClosed(
        "product retrievedAt",
        [product()],
        (t) => product({ productId: PRODUCT_2, source: { publisher: "P", sourceRef: SOURCE_REF, retrievedAt: t, checkedAt: "2026-01-02T00:00:00Z" } }),
        (r) => run([adm("h-adm")], { products: [...r] }),
        failsClosed,
      ),
      checkMalformedKnowledgeTimeFailsClosed(
        "product checkedAt",
        [product()],
        (t) => product({ productId: PRODUCT_2, source: { publisher: "P", sourceRef: SOURCE_REF, retrievedAt: "2026-01-01T00:00:00Z", checkedAt: t } }),
        (r) => run([adm("h-adm")], { products: [...r] }),
        failsClosed,
      ),
    ];
    expect(allConform(verdicts)).toEqual(CONFORMS);
  });

  it("a correction keeps history and reproduces the earlier cutoff", () => {
    const correction = adm("h-adm-2", { supersedes: ["h-adm"], occurredAt: "2026-04-03T08:00:00Z" }, LATE);
    const verdict = checkCorrectionPreservesHistory(
      "administration time corrected",
      [adm("h-adm")],
      correction,
      { beforeCorrection: cutoffMatrix(LATE).before, afterCorrection: LATE },
      (records, cutoff) => run([...records], { knowledgeCutoff: cutoff, effectiveAt: "2026-04-12T00:00:00Z" }),
      (r) => (r.ok ? r.projection.medicineLedger.entries.map((e) => e.recordId) : []),
      "h-adm",
    );
    expect(verdict).toEqual(CONFORMS);
    const after = ok(run([adm("h-adm"), correction], { knowledgeCutoff: LATE, effectiveAt: "2026-04-12T00:00:00Z" }));
    expect(gate(after)).toMatchObject({ state: "IN_WITHDRAWAL", administrationIds: ["h-adm-2"] });
  });
});

describe("C3 withdrawal hard gate → C0 evidence pack", () => {
  function pack(p: AnimalHealthProjection, fp = MEAT) {
    const gates = projectWithdrawalHardGates(p, hash);
    if (!gates.ok) throw new Error(gates.issues.join());
    const input: RecommendationEvidencePackInput = {
      recommendationId: "SYNTH-REC-1",
      engineVersion: "synthetic",
      rulesetVersion: "synthetic",
      evaluationDate: p.effectiveAt.slice(0, 10),
      knownAt: "2026-12-31T00:00:00Z",
      generatedAt: "2026-12-31T00:00:00Z",
      targetScope: { kind: "ANIMAL", id: A, snapshotRef: p.snapshotFingerprint.digest },
      intent: null,
      inputs: [],
      ruleEvaluations: gates.gates.ruleEvaluations.filter((r) => r.requestedRuleId === withdrawalGateRuleId(fp)),
      requiredHardGateRuleIds: [withdrawalGateRuleId(fp)],
      calculationSteps: [],
      additionalSourceRefs: gates.gates.sourceRefs,
      assumptions: [],
      limitations: [],
      uncertainties: [],
      candidateActions: [{ actionId: "SYNTH-ACTION-SELL", description: "synthetic sale action", favourability: "very favourable" }],
      rejectedAlternatives: [],
      proposedActionId: "SYNTH-ACTION-SELL",
      review: { state: "UNREVIEWED", reviewerRef: null, reviewedAt: null, notes: [] },
    };
    const built = buildRecommendationEvidencePack(input, hash);
    if (built.status !== "BUILT") throw new Error(built.issues.join());
    return built.pack;
  }

  it("IN_WITHDRAWAL blocks, UNKNOWN / conflict are insufficient evidence, CLEAR is actionable", () => {
    const inW = pack(ok(run([adm("h-adm")])));
    expect(inW.outcome).toBe("BLOCKED");
    expect(inW.actionableActionId).toBeNull();
    expect(inW.sourceRefs).toContainEqual(SOURCE_REF);
    const unknown = pack(ok(run([adm("h-adm", { occurredAt: null })])));
    expect(unknown.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(unknown.missingInputs).toEqual([`cattle.health.withdrawal.${MEAT}`]);
    const c1 = adm("c1", { supersedes: ["h-adm"], dose: null }, "2026-04-02T00:00:00Z");
    const c2 = adm("c2", { supersedes: ["h-adm"], route: "SYNTH-ROUTE-B" }, "2026-04-02T00:00:00Z");
    expect(pack(ok(run([adm("h-adm"), c1, c2]))).outcome).toBe("INSUFFICIENT_EVIDENCE");
    const clear = pack(ok(run([adm("h-adm")], { effectiveAt: MEAT_END })));
    expect(clear.outcome).toBe("ACTIONABLE");
    expect(clear.hardGateOutcomes).toEqual([{ ruleId: withdrawalGateRuleId(MEAT), rule: null, state: "PASS", satisfied: true }]);
  });

  it("a tampered or non-canonical projection fails closed", () => {
    const p = ok(run([adm("h-adm")]));
    const tampered = structuredClone(p) as AnimalHealthProjection;
    (tampered.withdrawalGate.entries[0] as { state: string }).state = "CLEAR";
    expect(verifyAnimalHealthProjection(tampered, hash).valid).toBe(false);
    expect(projectWithdrawalHardGates(tampered, hash).ok).toBe(false);
    const swapped = structuredClone(p) as AnimalHealthProjection;
    (swapped.medicineLedger.entries[0].record as { dose: unknown }).dose = null;
    expect(projectWithdrawalHardGates(swapped, hash).ok).toBe(false);
    const getter = { ...structuredClone(p) };
    Object.defineProperty(getter, "withdrawalGate", { get: () => p.withdrawalGate, enumerable: true });
    expect(projectWithdrawalHardGates(getter, hash)).toEqual({ ok: false, issues: ["CATTLE_HEALTH_HARD_GATE_INPUT_NON_CANONICAL"] });
    expect(verifyAnimalHealthProjection(p, hash).valid).toBe(true);
  });
});

describe("C3 timeline, ordering, detachment and fingerprints", () => {
  const mixed = [
    rec("t3", "SYMPTOM", { finding: finding(), occurredAt: "2026-04-03T00:00:00Z" }),
    rec("t1", "HEALTH_OBSERVATION", { noteKind: "OBSERVED_SIGN", finding: finding(), occurredAt: "2026-04-01T00:00:00Z" }),
    rec("t0", "HEALTH_OBSERVATION", { noteKind: "OBSERVED_SIGN", finding: finding(), occurredAt: null }),
    adm("t2", { occurredAt: "2026-04-02T00:00:00.5Z" }),
    rec("t9", "SYMPTOM", { finding: finding(), occurredAt: "2026-09-01T00:00:00Z" }),
  ];

  it("orders chronologically (unknown time last) and filters by kind and period without silent drops", () => {
    const p = ok(run(mixed));
    expect(p.timeline.entries.map((e) => e.recordId)).toEqual(["t1", "t2", "t3", "t0"]);
    expect(p.timeline.notYetOccurredRecordIds).toEqual(["t9"]);
    const filtered = ok(run(mixed, { timelineFilter: { kinds: ["SYMPTOM", "HEALTH_OBSERVATION"], occurredFrom: "2026-04-01T00:00:00Z", occurredTo: "2026-04-03T00:00:00Z" } })).timeline;
    expect(filtered.entries.map((e) => e.recordId)).toEqual(["t1"]);
    expect(filtered.unknownTimeRecordIdsOutsideFilter).toEqual(["t0"]);
    expect(filtered.filter).toEqual({ kinds: ["HEALTH_OBSERVATION", "SYMPTOM"], occurredFrom: "2026-04-01T00:00:00.000000000Z", occurredTo: "2026-04-03T00:00:00.000000000Z" });
    for (const bad of [{ kinds: [] }, { kinds: ["SYNTH"] }, { occurredFrom: "2026-04-03T00:00:00Z", occurredTo: "2026-04-01T00:00:00Z" }, { extra: 1 }]) {
      expect(codes(run(mixed, { timelineFilter: bad }))).toContain("CATTLE_HEALTH_INVALID_TIMELINE_FILTER");
    }
  });

  it("input order never changes the output (CAT-INV-012)", () => {
    expect(checkOrderIndependence("health records", [...mixed, ...ALL_KINDS.slice(0, 5)], (records) => run(records))).toEqual(CONFORMS);
    const products = [product(), product({ productId: PRODUCT_2 }), product({ version: "v2", supersedesVersions: ["v1"] }, [meat(12), milk()])];
    expect(checkOrderIndependence("product records", products, (ps) => run([adm("h-adm")], { products: ps }))).toEqual(CONFORMS);
  });

  it("results are detached from caller input and deep-frozen (CAT-INV-002/021)", () => {
    const verdict = checkDetachedResult(
      "health request",
      () => ({ health: [adm("h-adm", { prescriberWithdrawal: { prescriberRef: "SYNTH-VET-1", periods: [{ foodProduct: MEAT, period: { amount: 20, unit: "DAY" } }] } })], products: [product()] }),
      (input) => run(input.health, { products: input.products }),
      (input) => {
        (input.health[0] as { dose: { amount: number } }).dose.amount = 99;
        (input.products[0] as { speciesAuthorisations: { withdrawalPeriods: { period: { amount: number } }[] }[] }).speciesAuthorisations[0].withdrawalPeriods[0].period.amount = 1;
      },
    );
    expect(verdict).toEqual(CONFORMS);
    const gates = projectWithdrawalHardGates(ok(run([adm("h-adm")])), hash);
    expect(gates.ok && isDeepFrozen(gates.gates)).toBe(true);
  });

  it("fingerprints are deterministic, spelling/order/key-order stable and change with material content", () => {
    const fingerprints = (records: unknown[]) => {
      const p = ok(run(records));
      return [p.timeline.fingerprint.digest, p.medicineLedger.fingerprint.digest, p.withdrawalGate.fingerprint.digest].join("|");
    };
    const base = [adm("h-adm"), rec("h-sym", "SYMPTOM", { finding: finding() })];
    const respelled = [
      { ...adm("h-adm"), occurredAt: "2026-04-01T08:00:00.000Z", provenance: prov("2026-04-01T09:00:00.000000Z") },
      rec("h-sym", "SYMPTOM", { finding: finding() }),
    ];
    const reKeyed = base.map((r) => Object.fromEntries(Object.entries(r).reverse()));
    const verdict = checkFingerprintStability(
      "health projection",
      base,
      [
        { label: "reversed input", payload: [...base].reverse() },
        { label: "equivalent instant spellings", payload: respelled },
        { label: "key order", payload: reKeyed },
      ],
      [
        { label: "dose", payload: [adm("h-adm", { dose: { amount: 6, unit: "SYNTH-DOSE-UNIT" } }), base[1]] },
        { label: "administration instant", payload: [adm("h-adm", { occurredAt: "2026-04-01T08:00:01Z" }), base[1]] },
        { label: "received time", payload: [adm("h-adm", {}, "2026-04-01T09:00:01Z"), base[1]] },
        { label: "batch", payload: [adm("h-adm", { batchRef: "SYNTH-BATCH-2" }), base[1]] },
        { label: "symptom text", payload: [base[0], rec("h-sym", "SYMPTOM", { finding: finding("other") })] },
      ],
      fingerprints,
    );
    expect(verdict).toEqual(CONFORMS);
    const p = ok(run(base));
    const periodChanged = ok(run(base, { products: [product({}, [meat(11), milk()])] }));
    expect(periodChanged.withdrawalGate.fingerprint.digest).not.toBe(p.withdrawalGate.fingerprint.digest);
    expect(periodChanged.medicineLedger.fingerprint.digest).not.toBe(p.medicineLedger.fingerprint.digest);
    expect(ok(run(base, { effectiveAt: "2026-04-05T00:00:00.000Z" })).withdrawalGate.fingerprint).toEqual(p.withdrawalGate.fingerprint);
    expect(ok(run(base, { effectiveAt: "2026-04-06T00:00:00Z" })).withdrawalGate.fingerprint).not.toEqual(p.withdrawalGate.fingerprint);
  });
});

describe("C3 canonical boundary and malformed input (CAT-INV-001/022)", () => {
  it("rejects non-canonical input at every entry point, collection and element", () => {
    const withGetter = <T extends object>(o: T, key: string, value: unknown): T => Object.defineProperty({ ...o }, key, { get: () => value, enumerable: true });
    const arrayWithGetter = (items: unknown[]) => {
      const arr = [...items];
      Object.defineProperty(arr, 0, { get: () => items[0], enumerable: true });
      return arr;
    };
    const request = { ledger: LEDGER, healthRecords: [adm("h-adm")], productRecords: [product()], query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, foodProducts: [MEAT] } };
    const variants: [string, unknown][] = [
      ["request getter", withGetter(request, "healthRecords", [adm("h-adm")])],
      ["health collection getter", { ...request, healthRecords: arrayWithGetter([adm("h-adm")]) }],
      ["product collection getter", { ...request, productRecords: arrayWithGetter([product()]) }],
      ["health element getter", { ...request, healthRecords: [withGetter(adm("h-adm"), "dose", null)] }],
      ["product element class instance", { ...request, productRecords: [{ ...product(), label: new Date(0) }] }],
      ["function in record", { ...request, healthRecords: [{ ...adm("h-adm"), route: () => "SYNTH-ROUTE-A" }] }],
      ["query getter", { ...request, query: withGetter(request.query, "effectiveAt", EFFECTIVE) }],
      ["ledger getter", { ...request, ledger: withGetter(LEDGER, "animalId", A) }],
      ["NaN dose", { ...request, healthRecords: [adm("h-adm", { dose: { amount: Number.NaN, unit: "U" } })] }],
    ];
    for (const [label, req] of variants) {
      const result = projectAnimalHealth(req as never, hash);
      expect(result.ok, label).toBe(false);
      expect(codes(result), label).toEqual(["CATTLE_HEALTH_NON_CANONICAL_INPUT"]);
    }
    expect(projectAnimalHealth(request as never, hash).ok).toBe(true);
    const p = ok(projectAnimalHealth(request as never, hash));
    expect(verifyAnimalHealthProjection(withGetter(p, "timeline", p.timeline), hash).valid).toBe(false);
  });

  it("malformed canonical records fail closed, never repaired", () => {
    const cases: [string, Rec, string][] = [
      ["unknown kind", rec("x", "SYNTH-KIND"), "CATTLE_HEALTH_RECORD_INVALID_KIND"],
      ["other animal", { ...adm("x"), animalId: "SYNTH-ANIMAL-2" }, "CATTLE_HEALTH_RECORD_FOR_OTHER_ANIMAL"],
      ["bad occurredAt", adm("x", { occurredAt: "2026-04-01" }), "CATTLE_HEALTH_RECORD_INVALID_OCCURRED_AT"],
      ["bad actor role", { ...adm("x"), provenance: prov(RECEIVED, "SYNTH-AI") }, "CATTLE_HEALTH_RECORD_INVALID_PROVENANCE"],
      ["bad observedAt", { ...adm("x"), provenance: prov(RECEIVED, "FARMER", "FARMER", { observedAt: "yesterday" }) }, "CATTLE_HEALTH_RECORD_INVALID_PROVENANCE"],
      ["bad source document fingerprint", adm("x", { sourceDocument: { ...SOURCE_REF, contentFingerprint: { ...SOURCE_REF.contentFingerprint, schemaVersion: 99 } } }), "CATTLE_HEALTH_RECORD_INVALID_SOURCE_DOCUMENT"],
      ["negative dose", adm("x", { dose: { amount: -1, unit: "U" } }), "CATTLE_HEALTH_RECORD_INVALID_DETAIL"],
      ["dose without unit", adm("x", { dose: { amount: 1 } }), "CATTLE_HEALTH_RECORD_INVALID_DETAIL"],
      ["unknown field", adm("x", { severity: "high" }), "CATTLE_HEALTH_RECORD_INVALID_DETAIL"],
      ["empty finding", rec("x", "SYMPTOM", { finding: {} }), "CATTLE_HEALTH_RECORD_INVALID_DETAIL"],
      ["code without system", rec("x", "SYMPTOM", { finding: { code: "C1" } }), "CATTLE_HEALTH_RECORD_INVALID_DETAIL"],
      ["duplicate prescriber food product", adm("x", { prescriberWithdrawal: { prescriberRef: "P", periods: [{ foodProduct: MEAT, period: { amount: 1, unit: "DAY" } }, { foodProduct: MEAT, period: { amount: 2, unit: "DAY" } }] } }), "CATTLE_HEALTH_RECORD_INVALID_DETAIL"],
      ["retraction with time", { recordId: "x", animalId: A, kind: "RETRACTION", occurredAt: ADMIN_AT, provenance: prov(), supersedes: ["y"] }, "CATTLE_HEALTH_RECORD_INVALID_OCCURRED_AT"],
      ["padded id", { ...adm("x"), recordId: " x" }, "CATTLE_HEALTH_RECORD_INVALID_ID"],
    ];
    for (const [label, record, code] of cases) expect(codes(run([record])), label).toContain(code);
    for (const query of [{ effectiveAt: "2026-04-05" }, { knowledgeCutoff: null }, { foodProducts: [] }, { foodProducts: [MEAT, MEAT] }]) {
      expect(projectAnimalHealth({ ledger: LEDGER, healthRecords: [], productRecords: [], query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, foodProducts: [MEAT], ...query } } as never, hash).ok).toBe(false);
    }
    expect(codes(projectAnimalHealth({ ledger: { ...LEDGER, species: "SYNTH-OVINE" }, healthRecords: [], productRecords: [], query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, foodProducts: [MEAT] } } as never, hash))).toEqual([
      "CATTLE_HEALTH_INVALID_LEDGER",
    ]);
  });

  it("verification binds the payload version and the product source references (F001)", () => {
    const p = ok(run([adm("h-adm")]));
    expect(p.sourceRefs).toEqual([SOURCE_REF]);
    expect(verifyAnimalHealthProjection(p, hash).valid).toBe(true);
    const mutations: [string, AnimalHealthProjection][] = [
      ["sourceRefs removed", { ...p, sourceRefs: [] }],
      ["sourceRefs replaced", { ...p, sourceRefs: [{ ...SOURCE_REF, version: "v2" }] }],
      ["sourceRefs extra", { ...p, sourceRefs: [...p.sourceRefs, { ...SOURCE_REF, sourceId: "SYNTH-SRC-OTHER" }] }],
      ["payload version", { ...p, healthPayloadVersion: 999 as never }],
    ];
    for (const [label, mutated] of mutations) {
      expect(verifyAnimalHealthProjection(mutated, hash).valid, label).toBe(false);
      expect(projectWithdrawalHardGates(mutated, hash).ok, label).toBe(false);
    }
  });

  it("unsupported nested fields in health and product records fail closed (F002)", () => {
    const period = (extra: Rec) => ({ foodProduct: MEAT, route: null, period: { amount: 0, unit: "DAY", ...extra } });
    const productCases: [string, Rec][] = [
      ["withdrawal period qualifier", product({}, [period({ exactness: "UNKNOWN" })])],
      ["withdrawal entry field", product({}, [{ ...meat(), exactness: "UNKNOWN" }])],
      ["species authorisation field", product({ speciesAuthorisations: [{ species: "BOVINE", withdrawalPeriods: [meat()], note: "x" }] })],
      ["authorisation field", product({ authorisation: { scheme: "SYNTH-SCHEME", number: "SYNTH-AUTH-1", region: "x" } })],
      ["source ref field", product({ source: { publisher: "SYNTH-PUBLISHER", sourceRef: { ...SOURCE_REF, note: "x" }, retrievedAt: "2026-01-01T00:00:00Z", checkedAt: "2026-01-02T00:00:00Z" } })],
      ["fingerprint field", product({ source: { publisher: "SYNTH-PUBLISHER", sourceRef: { ...SOURCE_REF, contentFingerprint: { ...SOURCE_REF.contentFingerprint, note: "x" } }, retrievedAt: "2026-01-01T00:00:00Z", checkedAt: "2026-01-02T00:00:00Z" } })],
    ];
    for (const [label, p] of productCases) expect(failsClosed(run([adm("h-adm")], { products: [p], foodProducts: [MEAT] })), label).toBe(true);
    const healthCases: [string, Rec][] = [
      ["dose qualifier", adm("x", { dose: { amount: 5, unit: "SYNTH-DOSE-UNIT", exactness: "UNKNOWN" } })],
      ["prescriber period qualifier", adm("x", { prescriberWithdrawal: { prescriberRef: "P", periods: [{ foodProduct: MEAT, period: { amount: 0, unit: "DAY", exactness: "UNKNOWN" } }] } })],
      ["prescriber period entry field", adm("x", { prescriberWithdrawal: { prescriberRef: "P", periods: [{ foodProduct: MEAT, period: { amount: 1, unit: "DAY" }, note: "x" }] } })],
      ["prescriber field", adm("x", { prescriberWithdrawal: { prescriberRef: "P", periods: [{ foodProduct: MEAT, period: { amount: 1, unit: "DAY" } }], note: "x" } })],
      ["recorded authorisation field", adm("x", { recordedAuthorisation: { scheme: "SYNTH-SCHEME", number: "SYNTH-AUTH-1", note: "x" } })],
      ["provenance field", { ...adm("x"), provenance: prov(RECEIVED, "FARMER", "FARMER", { confidence: "low" }) }],
      ["finding field", rec("x", "SYMPTOM", { finding: { text: "synthetic sign", severity: "high" } })],
      ["source document field", adm("x", { sourceDocument: { ...SOURCE_REF, note: "x" } })],
    ];
    for (const [label, record] of healthCases) expect(failsClosed(run([record])), label).toBe(true);
    // The reproduction: a qualified zero period must not resolve to CLEAR.
    expect(gateStates(run([adm("h-adm")], { products: [product({}, [period({ exactness: "UNKNOWN" })])], foodProducts: [MEAT] }))).toEqual(["REJECTED"]);
  });

  it("public admission exports enforce the canonical boundary and return frozen output (F003)", () => {
    let touched = false;
    const getter = <T extends object>(o: T, key: string, value: unknown): T =>
      Object.defineProperty({ ...o }, key, {
        get: () => {
          touched = true;
          return value;
        },
        enumerable: true,
      });
    const collection = [product()];
    Object.defineProperty(collection, 0, { get: () => ((touched = true), product()), enumerable: true });
    const admitted = [collection, [getter(product(), "productId", PRODUCT)]].map((raws) => cattle.admitProductRecords(raws, CUTOFF));
    for (const r of admitted) {
      expect(r.ok).toBe(false);
      expect(!r.ok && r.issues.map((i) => i.code)).toEqual(["CATTLE_HEALTH_PRODUCT_RECORD_NON_CANONICAL"]);
    }
    const product1 = cattle.materialiseProductRecord(getter(product(), "productId", PRODUCT));
    expect(!product1.ok && product1.issues).toEqual(["CATTLE_HEALTH_PRODUCT_RECORD_NON_CANONICAL"]);
    const health = cattle.materialiseHealthRecord(LEDGER.animalId, getter(adm("x"), "productId", PRODUCT));
    expect(!health.ok && health.issues).toEqual(["CATTLE_HEALTH_RECORD_NON_CANONICAL"]);
    const nested = cattle.materialiseHealthRecord(LEDGER.animalId, adm("x", { dose: getter({ amount: 5, unit: "U" }, "amount", 5) }));
    expect(nested.ok).toBe(false);
    expect(touched).toBe(false);
    const good = cattle.admitProductRecords([product()], CUTOFF);
    expect(good.ok && isDeepFrozen(good)).toBe(true);
    const goodHealth = cattle.materialiseHealthRecord(LEDGER.animalId, adm("x"));
    expect(goodHealth.ok && isDeepFrozen(goodHealth)).toBe(true);
    expect("healthRecordIdOf" in cattle || "productRecordKnownAfter" in cattle).toBe(false);
  });

  it("malformed canonical projections and cutoffs return explicit rejections, never throw (F004)", () => {
    const p = ok(run([adm("h-adm")]));
    const entry0 = p.medicineLedger.entries[0];
    const malformed: [string, unknown][] = [
      ["payload version only", { healthPayloadVersion: 1 }],
      ["timeline missing", { ...p, timeline: undefined }],
      ["timeline fingerprint missing", { ...p, timeline: { ...p.timeline, fingerprint: null } }],
      ["timeline entries not array", { ...p, timeline: { ...p.timeline, entries: 7 } }],
      ["ledger entry null", { ...p, medicineLedger: { ...p.medicineLedger, entries: [null] } }],
      ["ledger entry bad instant", { ...p, medicineLedger: { ...p.medicineLedger, entries: [{ ...entry0, occurredAt: "yesterday" }] } }],
      ["ledger entry record without provenance", { ...p, medicineLedger: { ...p.medicineLedger, entries: [{ ...entry0, record: { ...entry0.record, provenance: null } }] } }],
      ["product versions malformed", { ...p, medicineLedger: { ...p.medicineLedger, productVersionsUsed: [{ productId: PRODUCT }] } }],
      ["gate ledger fingerprint missing", { ...p, withdrawalGate: { ...p.withdrawalGate, medicineLedgerFingerprint: null } }],
      ["gate entries not array", { ...p, withdrawalGate: { ...p.withdrawalGate, entries: {} } }],
      ["gate entry reason codes missing", { ...p, withdrawalGate: { ...p.withdrawalGate, entries: [{ ...p.withdrawalGate.entries[0], reasonCodes: null }] } }],
      ["effectiveAt malformed", { ...p, effectiveAt: 5 }],
    ];
    for (const [label, mutated] of malformed) {
      expect(() => verifyAnimalHealthProjection(mutated as never, hash), label).not.toThrow();
      expect(verifyAnimalHealthProjection(mutated as never, hash).valid, label).toBe(false);
      expect(() => projectWithdrawalHardGates(mutated as never, hash), label).not.toThrow();
      expect(projectWithdrawalHardGates(mutated as never, hash).ok, label).toBe(false);
    }
    expect(verifyAnimalHealthProjection({ healthPayloadVersion: 1 } as never, hash).reasonCode).toBe("CATTLE_HEALTH_PROJECTION_MALFORMED");
    for (const cutoff of ["invalid", "2026-04-05", null, 5]) {
      for (const raws of [[product()], []]) {
        const label = `${String(cutoff)} / ${raws.length}`;
        expect(() => cattle.admitProductRecords(raws, cutoff as never), label).not.toThrow();
        const result = cattle.admitProductRecords(raws, cutoff as never);
        expect(!result.ok && result.issues.map((i) => i.code), label).toEqual(["CATTLE_HEALTH_PRODUCT_INVALID_KNOWLEDGE_CUTOFF"]);
      }
    }
    expect(verifyAnimalHealthProjection(p, hash).valid).toBe(true);
    expect(projectWithdrawalHardGates(p, hash).ok).toBe(true);
  });

  it("withdrawal, resolution and binding evaluation is reachable only through the validated engine; outputs never alias caller periods", () => {
    for (const unchecked of ["computeAdministrationWithdrawal", "foldWithdrawalGate", "resolveProductRecords", "bindAdministrationProduct"]) {
      expect(unchecked in cattle).toBe(false);
    }
    const period = { amount: 10, unit: "DAY" };
    const entry = { foodProduct: MEAT, route: null, period };
    const projection = ok(run([adm("h-adm")], { products: [product({}, [entry, milk()])] }));
    const used = projection.medicineLedger.entries[0].withdrawals.find((w) => w.foodProduct === MEAT)!;
    period.amount = 0;
    entry.foodProduct = MILK;
    expect(used.productEntry).toEqual({ foodProduct: MEAT, route: null, period: { amount: 10, unit: "DAY" }, multiDoseBasis: null });
    expect(isDeepFrozen(used) && gate(projection).state).toBe("IN_WITHDRAWAL");
  });

  it("ships no product content: with no supplied product records every administration is unresolved, and the barrel exports C3", () => {
    expect(gate(ok(run([adm("h-adm")], { products: [] }))).state).toBe("UNKNOWN");
    expect(cattle.projectAnimalHealth).toBe(projectAnimalHealth);
    expect(cattle.projectWithdrawalHardGates).toBe(projectWithdrawalHardGates);
    expect("isRecord" in cattle).toBe(false);
  });
});
