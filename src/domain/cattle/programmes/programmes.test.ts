/**
 * Cattle C7 — veterinary health-programme engine. Synthetic data only: every
 * animal, group, programme, action kind, product, offset, interval, count,
 * practitioner and reviewer is a fictional `SYNTH-*` fixture with no
 * veterinary, legal or scientific meaning.
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
import { buildRecommendationEvidencePack, type RecommendationEvidencePackInput } from "../evidence-pack";
import * as cattle from "../index";
import { computeSourceContentFingerprint, sourceVersionRef } from "../source";
import { CATALOGUE, LEGAL_SOURCE, approve as approveRule, bindTo, hash, impl, synthRule } from "../test-fixtures";
import { projectAnimalHealth, type AnimalHealthProjection } from "../health";
import { createObligationImplementationRegistry, evaluateAnimalObligations, obligationTermsMarker, type AnimalObligationEvaluation, type ObligationDefinition } from "../regulatory";
import {
  PRODUCTION_HEALTH_PROGRAMME_DEFINITIONS,
  computeProgrammeDefinitionFingerprint,
  evaluateHealthProgrammes,
  programmeGateRuleId,
  projectProgrammeHardGates,
  verifyProgrammeStatusEvaluation,
  type ProgrammeAnimalStatus,
  type ProgrammeEvaluationResult,
  type ProgrammeStatusEvaluation,
} from "./index";

type Rec = Record<string, unknown>;

const A = "SYNTH-ANIMAL-1";
const B = "SYNTH-ANIMAL-2";
const GROUP = "SYNTH-GROUP-1";
const P = "SYNTH-PROGRAMME-1";
const ACT = "SYNTH-ACTION-1";
const PRODUCT = "SYNTH-PRODUCT-1";
const MEAT = "SYNTH-FOOD-MEAT";
const DOB = "2026-03-01";
const ANCHOR = "2026-03-01T00:00:00.000000000Z";
// Synthetic schedule: windows open anchor + 10 DAY, due anchor + 20 DAY, repeated every 30 DAY, 3 times.
const OPEN0 = "2026-03-11T00:00:00.000000000Z";
const DUE0 = "2026-03-21T00:00:00.000000000Z";
const OPEN1 = "2026-04-10T00:00:00.000000000Z";
const DUE1 = "2026-04-20T00:00:00.000000000Z";
const OPEN2 = "2026-05-10T00:00:00.000000000Z";
const EFFECTIVE = "2026-04-15T00:00:00Z";
const RECEIVED = "2026-01-01T00:00:00Z";
const CUTOFF = "2026-12-31T00:00:00Z";
const occId = (index: number, animal = A, action = ACT, programme = P) => `${programme}|${action}|${animal}|DATE_OF_BIRTH|${ANCHOR}|${index}`;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const prov = (receivedAt = "2026-02-01T00:00:00Z") => ({ sourceCategory: "FARMER" as const, receivedAt });

function ledgerOf(animalId: string, inputs: Rec[]): AnimalLedger {
  const result = createAnimalLedger(animalId, inputs);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.ledger;
}
const dobOf = (animalId: string, value: string | null = DOB) => ({ assertionId: `${animalId}-dob`, animalId, kind: "DATE_OF_BIRTH", value, provenance: prov() });
const sexOf = (animalId: string, value = "FEMALE") => ({ assertionId: `${animalId}-sex`, animalId, kind: "SEX", value, provenance: prov() });
const groupOf = (animalId: string, value = GROUP, validFrom = "2026-03-01T00:00:00Z", validTo: string | null = null, id = `${animalId}-grp`) => ({
  assertionId: id,
  animalId,
  kind: "MANAGEMENT_GROUP",
  value,
  validFrom,
  validTo,
  provenance: prov(),
});

const LEDGER_A = ledgerOf(A, [dobOf(A), sexOf(A), groupOf(A)]);
const LEDGER_B = ledgerOf(B, [dobOf(B), sexOf(B, "MALE"), groupOf(B, "SYNTH-GROUP-2")]);

function action(overrides: Rec = {}): Rec {
  return {
    actionId: ACT,
    actionKind: "SYNTH-ACTION-KIND",
    productRef: { productId: PRODUCT, productVersion: null },
    schedule: {
      anchor: { kind: "DATE_OF_BIRTH" },
      window: { opensAfter: { amount: 10, unit: "DAY" }, dueAfter: { amount: 20, unit: "DAY" }, boundary: "INCLUSIVE_START_EXCLUSIVE_END" },
      repeat: { interval: { amount: 30, unit: "DAY" }, count: 3 },
    },
    completion: { recordKind: "MEDICINE_ADMINISTRATION", eventTypes: null, matchCriteria: true },
    gates: [],
    gateRole: "HARD_GATE",
    ...overrides,
  };
}

const VET_DOC = { sourceId: "SYNTH-SRC-PROGRAMME", version: "v1", contentFingerprint: computeSourceContentFingerprint({ text: "synthetic programme document" }, hash) };

function programme(overrides: Rec = {}): Rec {
  return {
    programmeId: P,
    version: "v1",
    supersedesVersions: [],
    classification: "VETERINARY_PROGRAMME",
    declaredBy: { role: "VETERINARIAN", actor: "SYNTH-VET-1" },
    validFrom: "2026-01-01T00:00:00Z",
    validTo: null,
    applicability: { kind: "EXPLICIT_SET", animalIds: [A] },
    actions: [action()],
    productionState: "PRODUCTION",
    provenance: { sourceCategory: "VETERINARY_SOURCE", sourceSystem: null, sourceRecordRef: null, receivedAt: RECEIVED, sourceDocument: VET_DOC },
    ...overrides,
  };
}

const farmerProgramme = (overrides: Rec = {}) =>
  programme({
    programmeId: "SYNTH-PROGRAMME-FARMER",
    classification: "FARMER_INTENT",
    declaredBy: { role: "FARMER", actor: "SYNTH-FARMER-1" },
    actions: [action({ gateRole: "ADVISORY" })],
    provenance: { sourceCategory: "FARMER", sourceSystem: null, sourceRecordRef: null, receivedAt: RECEIVED, sourceDocument: null },
    ...overrides,
  });

function review(def: Rec, overrides: Rec = {}): Rec {
  const fp = computeProgrammeDefinitionFingerprint(def, hash);
  if (fp === null) throw new Error("synthetic definition invalid");
  return {
    reviewId: `SYNTH-REVIEW-${def.programmeId as string}-${def.version as string}`,
    programmeId: def.programmeId,
    programmeVersion: def.version,
    definitionFingerprint: fp,
    dimension: "VETERINARY",
    decision: "APPROVED",
    reviewer: { role: "VETERINARIAN", actor: "SYNTH-REVIEWER-1" },
    reviewedAt: "2026-01-02T00:00:00Z",
    supersedes: [],
    ...overrides,
  };
}

function declaration(recordId: string, overrides: Rec = {}): Rec {
  return {
    recordId,
    animalId: A,
    programmeId: P,
    programmeVersion: "v1",
    actionId: ACT,
    occurrenceId: occId(0),
    kind: "COMPLETION",
    evidence: { kind: "DECLARED", completedAt: "2026-03-15T00:00:00Z" },
    declaredBy: { role: "FARMER", actor: "SYNTH-FARMER-1" },
    provenance: { sourceCategory: "FARMER", sourceSystem: null, sourceRecordRef: null, receivedAt: "2026-03-16T00:00:00Z" },
    supersedes: [],
    ...overrides,
  };
}

// C3 health records and synthetic product data (no real product, period or dose).
const SOURCE_REF = { sourceId: "SYNTH-SRC-PRODUCT", version: "v1", contentFingerprint: computeSourceContentFingerprint({ text: "synthetic product sheet" }, hash) };
function product(productId = PRODUCT, overrides: Rec = {}): Rec {
  return {
    productId,
    version: "v1",
    authorisation: { scheme: "SYNTH-SCHEME", number: `SYNTH-AUTH-${productId}` },
    label: "Synthetic product",
    lifecycle: "ACTIVE",
    speciesAuthorisations: [{ species: "BOVINE", withdrawalPeriods: [{ foodProduct: MEAT, route: null, period: { amount: 10, unit: "DAY" } }] }],
    source: { publisher: "SYNTH-PUBLISHER", sourceRef: SOURCE_REF, retrievedAt: "2026-01-01T00:00:00Z", checkedAt: "2026-01-02T00:00:00Z" },
    ...overrides,
  };
}
function adm(recordId: string, occurredAt: string | null, fields: Rec = {}, animalId = A): Rec {
  return {
    recordId,
    animalId,
    kind: "MEDICINE_ADMINISTRATION",
    occurredAt,
    provenance: { sourceCategory: "FARMER", actorRole: "FARMER", receivedAt: "2026-03-01T00:00:00Z" },
    productId: PRODUCT,
    route: "SYNTH-ROUTE-A",
    dose: { amount: 5, unit: "SYNTH-DOSE-UNIT" },
    ...fields,
  };
}
function vetEvent(recordId: string, occurredAt: string, eventType = "EXAMINATION"): Rec {
  return {
    recordId,
    animalId: A,
    kind: "VETERINARY_EVENT",
    occurredAt,
    provenance: { sourceCategory: "VETERINARY_SOURCE", actorRole: "VETERINARIAN", actor: "SYNTH-VET-1", receivedAt: "2026-03-01T00:00:00Z" },
    eventType,
    practitionerRef: "SYNTH-VET-1",
  };
}

function healthFor(records: Rec[], o: { effectiveAt?: string; knowledgeCutoff?: string; ledger?: AnimalLedger; products?: Rec[] } = {}): AnimalHealthProjection {
  const result = projectAnimalHealth(
    {
      ledger: o.ledger ?? LEDGER_A,
      healthRecords: records,
      productRecords: o.products ?? [product(), product("SYNTH-PRODUCT-2")],
      query: { effectiveAt: o.effectiveAt ?? EFFECTIVE, knowledgeCutoff: o.knowledgeCutoff ?? CUTOFF, foodProducts: [MEAT] },
    } as never,
    hash,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.projection;
}

interface Run {
  definitions?: unknown[];
  reviews?: unknown[];
  completions?: unknown[];
  ledgers?: AnimalLedger[];
  /** Default: one C3 projection of `healthRecords` (none) at the run's own times for animal A. */
  health?: unknown[];
  healthRecords?: Rec[];
  obligations?: unknown[];
  effectiveAt?: string;
  knowledgeCutoff?: string;
}

const DEF = programme();
const REVIEWS = [review(DEF)];

function run(o: Run = {}): ProgrammeEvaluationResult {
  return evaluateHealthProgrammes(
    {
      definitions: o.definitions ?? [DEF],
      reviews: o.reviews ?? REVIEWS,
      completions: o.completions ?? [],
      ledgers: o.ledgers ?? [LEDGER_A],
      health: o.health ?? [healthFor(o.healthRecords ?? [], { effectiveAt: o.effectiveAt ?? EFFECTIVE, knowledgeCutoff: o.knowledgeCutoff ?? CUTOFF, ledger: (o.ledgers ?? [LEDGER_A]).find((l) => l.animalId === A) })],
      obligations: o.obligations ?? [],
      query: { effectiveAt: o.effectiveAt ?? EFFECTIVE, knowledgeCutoff: o.knowledgeCutoff ?? CUTOFF },
    } as never,
    hash,
  );
}
function ok(r: ProgrammeEvaluationResult): ProgrammeStatusEvaluation {
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.evaluation;
}
const animalOf = (r: ProgrammeEvaluationResult, animalId = A, programmeId = P): ProgrammeAnimalStatus => ok(r).programmes.find((p) => p.programmeId === programmeId)!.animals.find((a) => a.animalId === animalId)!;
const states = (r: ProgrammeEvaluationResult, animalId = A, programmeId = P) => animalOf(r, animalId, programmeId).records.map((x) => x.state);
const codes = (r: ProgrammeEvaluationResult) => (r.ok ? [] : r.issues.map((i) => i.code));
const failsClosed = (r: ProgrammeEvaluationResult) => !r.ok;
const occurrenceState = (r: ProgrammeEvaluationResult, index: number) => animalOf(r).records.find((x) => x.occurrence?.index === index)!.state;

// ---------------------------------------------------------------------------

describe("C7 test 1 — no declared programme", () => {
  it("nothing is due and the outcome is NO_PROGRAMME, never compliant", () => {
    const e = ok(run({ definitions: [...PRODUCTION_HEALTH_PROGRAMME_DEFINITIONS], reviews: [] }));
    expect(PRODUCTION_HEALTH_PROGRAMME_DEFINITIONS).toEqual([]);
    expect(Object.isFrozen(PRODUCTION_HEALTH_PROGRAMME_DEFINITIONS)).toBe(true);
    expect(e.outcome).toBe("NO_PROGRAMME");
    expect(e.programmes).toEqual([]);
    expect(e.animalIds).toEqual([A]);
  });

  it("a programme not yet in force at effectiveAt is NOT_IN_FORCE with no animal state", () => {
    const e = ok(run({ effectiveAt: "2025-12-01T00:00:00Z" }));
    expect(e.outcome).toBe("NONE_IN_FORCE");
    expect(e.programmes[0].status).toBe("NOT_IN_FORCE");
    expect(e.programmes[0].animals).toEqual([]);
    expect(e.programmes[0].versions.map((v) => v.definition.version)).toEqual(["v1"]);
  });
});

describe("C7 test 2 — applicability and membership", () => {
  it("explicit set: listed animal is a member; another animal is NOT_APPLICABLE", () => {
    const r = run({ ledgers: [LEDGER_A, LEDGER_B] });
    expect(animalOf(r).membership?.state).toBe("MEMBER");
    expect(animalOf(r, B).status).toBe("NOT_APPLICABLE");
    expect(ok(r).programmes[0].scope).toMatchObject({ members: [A], notMembers: [B], unknown: [] });
  });

  it("explicit-set member without a ledger is reported, never assumed done", () => {
    const def = programme({ applicability: { kind: "EXPLICIT_SET", animalIds: [A, "SYNTH-ANIMAL-9"] } });
    const e = ok(run({ definitions: [def], reviews: [review(def)] }));
    expect(e.programmes[0].scope?.declaredMembersNotEvaluated).toEqual(["SYNTH-ANIMAL-9"]);
    expect(e.programmes[0].status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("group scope through C4: member, non-member, and unknown membership is UNKNOWN", () => {
    const def = programme({ applicability: { kind: "GROUP", groupRef: GROUP } });
    const noGroup = ledgerOf("SYNTH-ANIMAL-3", [dobOf("SYNTH-ANIMAL-3"), sexOf("SYNTH-ANIMAL-3")]);
    const r = run({ definitions: [def], reviews: [review(def)], ledgers: [LEDGER_A, LEDGER_B, noGroup] });
    expect(animalOf(r).membership?.state).toBe("MEMBER");
    expect(animalOf(r, B).status).toBe("NOT_APPLICABLE");
    expect(animalOf(r, "SYNTH-ANIMAL-3").status).toBe("UNKNOWN");
    expect(animalOf(r, "SYNTH-ANIMAL-3").records.map((x) => x.state)).toEqual(["UNKNOWN"]);
    expect(ok(r).programmes[0].scope).toMatchObject({ members: [A], notMembers: [B], unknown: ["SYNTH-ANIMAL-3"] });
  });

  it("group membership is re-resolved when each window opened: joining later makes earlier windows NOT_APPLICABLE", () => {
    const def = programme({ applicability: { kind: "GROUP", groupRef: GROUP } });
    const late = ledgerOf(A, [dobOf(A), groupOf(A, "SYNTH-GROUP-2", "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z", "g-old"), groupOf(A, GROUP, "2026-04-01T00:00:00Z", null, "g-new")]);
    const r = run({ definitions: [def], reviews: [review(def)], ledgers: [late] });
    expect(states(r)).toEqual(["NOT_APPLICABLE", "DUE", "UPCOMING"]);
  });

  it("criteria over KNOWN C1 facts; an unknown or conflicting fact is never NOT_APPLICABLE", () => {
    const def = programme({ applicability: { kind: "CRITERIA", sex: "FEMALE", bornOnOrAfter: "2026-01-01", bornBefore: null } });
    const noSex = ledgerOf("SYNTH-ANIMAL-4", [dobOf("SYNTH-ANIMAL-4")]);
    const conflict = ledgerOf("SYNTH-ANIMAL-5", [dobOf("SYNTH-ANIMAL-5"), sexOf("SYNTH-ANIMAL-5"), { ...sexOf("SYNTH-ANIMAL-5", "MALE"), assertionId: "s2" }]);
    const r = run({ definitions: [def], reviews: [review(def)], ledgers: [LEDGER_A, LEDGER_B, noSex, conflict] });
    expect(animalOf(r).membership?.state).toBe("MEMBER");
    expect(animalOf(r, B).status).toBe("NOT_APPLICABLE");
    expect(animalOf(r, "SYNTH-ANIMAL-4").status).toBe("UNKNOWN");
    expect(animalOf(r, "SYNTH-ANIMAL-5").status).toBe("EVIDENCE_CONFLICT");
    const v = checkUnresolvedEvidenceNotMasked(
      [
        { label: "sex UNKNOWN", result: r },
        { label: "sex conflicting", result: r },
      ],
      (res) => [animalOf(res, "SYNTH-ANIMAL-4").status, animalOf(res, "SYNTH-ANIMAL-5").status],
      RESOLVED_LOOKING_STATES,
    );
    expect(v).toEqual(CONFORMS);
  });
});

describe("C7 test 3 — occurrence derivation and window boundaries", () => {
  it("derives repeat occurrences exactly as declared with deterministic ids", () => {
    const records = animalOf(run()).records;
    expect(records.map((x) => [x.occurrence?.occurrenceId, x.occurrence?.opensAt, x.occurrence?.dueAt, x.state])).toEqual([
      [occId(0), OPEN0, DUE0, "OVERDUE"],
      [occId(1), OPEN1, DUE1, "DUE"],
      [occId(2), OPEN2, "2026-05-20T00:00:00.000000000Z", "UPCOMING"],
    ]);
    expect(animalOf(run()).status).toBe("OVERDUE");
  });

  it.each([
    ["one nanosecond before the window opens", "2026-03-10T23:59:59.999999999Z", "INCLUSIVE_START_EXCLUSIVE_END", "UPCOMING"],
    ["exactly at the window start (inclusive)", "2026-03-11T00:00:00Z", "INCLUSIVE_START_EXCLUSIVE_END", "DUE"],
    ["one nanosecond before the exclusive end", "2026-03-20T23:59:59.999999999Z", "INCLUSIVE_START_EXCLUSIVE_END", "DUE"],
    ["exactly at the exclusive end", "2026-03-21T00:00:00Z", "INCLUSIVE_START_EXCLUSIVE_END", "OVERDUE"],
    ["exactly at the inclusive end", "2026-03-21T00:00:00Z", "INCLUSIVE_START_INCLUSIVE_END", "DUE"],
    ["one nanosecond after the inclusive end", "2026-03-21T00:00:00.000000001Z", "INCLUSIVE_START_INCLUSIVE_END", "OVERDUE"],
  ])("%s", (_label, effectiveAt, boundary, expected) => {
    const def = programme({ actions: [action({ schedule: { anchor: { kind: "DATE_OF_BIRTH" }, window: { opensAfter: { amount: 10, unit: "DAY" }, dueAfter: { amount: 20, unit: "DAY" }, boundary }, repeat: null } })] });
    expect(states(run({ definitions: [def], reviews: [review(def)], effectiveAt }))).toEqual([expected]);
  });

  it("a fixed-instant anchor needs no C1 fact; an unknown birth date anchor is UNKNOWN, never COMPLETED or NOT_APPLICABLE", () => {
    const fixed = programme({ actions: [action({ schedule: { anchor: { kind: "FIXED_INSTANT", at: "2026-04-01T00:00:00Z" }, window: { opensAfter: { amount: 0, unit: "DAY" }, dueAfter: { amount: 1, unit: "HOUR" }, boundary: "INCLUSIVE_START_EXCLUSIVE_END" }, repeat: null } })] });
    const noDob = ledgerOf(A, [sexOf(A)]);
    expect(states(run({ definitions: [fixed], reviews: [review(fixed)], ledgers: [noDob] }))).toEqual(["OVERDUE"]);
    const r = run({ ledgers: [noDob] });
    expect(animalOf(r).records).toHaveLength(1);
    expect(animalOf(r).records[0]).toMatchObject({ actionId: ACT, occurrence: null, state: "UNKNOWN" });
    const sourceUnknown = ledgerOf(A, [dobOf(A, null)]);
    expect(states(run({ ledgers: [sourceUnknown] }))).toEqual(["UNKNOWN"]);
    // Even with completion evidence supplied, unresolved anchor / membership never surface as COMPLETED or NOT_APPLICABLE.
    const groupDef = programme({ applicability: { kind: "GROUP", groupRef: GROUP } });
    const noGroup = ledgerOf(A, [dobOf(A), sexOf(A)]);
    const v = checkUnresolvedEvidenceNotMasked(
      [
        { label: "birth date UNKNOWN with a declaration", result: run({ ledgers: [noDob], completions: [declaration("d-1")] }) },
        { label: "birth date source-reported unknown", result: run({ ledgers: [sourceUnknown], completions: [declaration("d-1")] }) },
        { label: "group membership UNKNOWN with a declaration", result: run({ definitions: [groupDef], reviews: [review(groupDef)], ledgers: [noGroup], completions: [declaration("d-1")] }) },
      ],
      (res) => [animalOf(res).status, ...states(res)],
      RESOLVED_LOOKING_STATES,
    );
    expect(v).toEqual(CONFORMS);
  });

  it("overlapping repeat windows are rejected (criteria matching must stay unambiguous)", () => {
    const sched = (interval: number, boundary: string) =>
      programme({ actions: [action({ schedule: { anchor: { kind: "DATE_OF_BIRTH" }, window: { opensAfter: { amount: 0, unit: "DAY" }, dueAfter: { amount: 10, unit: "DAY" }, boundary }, repeat: { interval: { amount: interval, unit: "DAY" }, count: 2 } } })] });
    expect(codes(run({ definitions: [sched(9, "INCLUSIVE_START_EXCLUSIVE_END")] }))).toEqual(["CATTLE_PROGRAMME_DEFINITION_INVALID_ACTIONS"]);
    expect(codes(run({ definitions: [sched(10, "INCLUSIVE_START_INCLUSIVE_END")] }))).toEqual(["CATTLE_PROGRAMME_DEFINITION_INVALID_ACTIONS"]);
    const adjacent = sched(10, "INCLUSIVE_START_EXCLUSIVE_END");
    expect(states(run({ definitions: [adjacent], reviews: [review(adjacent)] }))).toEqual(["OVERDUE", "OVERDUE"]);
  });

  it("an occurrence whose window opens outside the programme period is NOT_APPLICABLE", () => {
    const def = programme({ validFrom: "2026-04-01T00:00:00Z" });
    expect(states(run({ definitions: [def], reviews: [review(def)] }))).toEqual(["NOT_APPLICABLE", "DUE", "UPCOMING"]);
    const ending = programme({ validTo: "2026-05-01T00:00:00Z" });
    expect(states(run({ definitions: [ending], reviews: [review(ending)] }))).toEqual(["OVERDUE", "DUE", "NOT_APPLICABLE"]);
  });
});

describe("C7 test 4 — completion evidence", () => {
  it("declared criteria: an in-window administration of the declared product completes the occurrence", () => {
    const health = healthFor([adm("h-1", "2026-03-15T00:00:00Z")]);
    const r = run({ health: [health] });
    expect(states(r)).toEqual(["COMPLETED", "DUE", "UPCOMING"]);
    expect(animalOf(r).records[0].completion?.counted).toEqual([
      { basis: "DECLARED_CRITERIA", declarationId: null, healthRecordId: "h-1", completedAt: "2026-03-15T00:00:00.000000000Z", timing: "IN_WINDOW" },
    ]);
    expect(animalOf(r).inputs.health?.timeline).toEqual(health.timeline.fingerprint);
  });

  it("a mismatched product never completes (no fuzzy matching)", () => {
    const r = run({ health: [healthFor([adm("h-1", "2026-03-15T00:00:00Z", { productId: "SYNTH-PRODUCT-2" })])] });
    expect(occurrenceState(r, 0)).toBe("OVERDUE");
    const linked = run({
      health: [healthFor([adm("h-1", "2026-03-15T00:00:00Z", { productId: "SYNTH-PRODUCT-2" })])],
      completions: [declaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-1" } })],
    });
    expect(occurrenceState(linked, 0)).toBe("OVERDUE");
    expect(animalOf(linked).records[0].completion?.mismatched).toEqual([{ ref: "d-1", reason: "CATTLE_PROGRAMME_PRODUCT_MISMATCH" }]);
  });

  it("a declared product version must be the exact C3-bound version", () => {
    const def = programme({ actions: [action({ productRef: { productId: PRODUCT, productVersion: "v2" } })] });
    const r = run({ definitions: [def], reviews: [review(def)], health: [healthFor([adm("h-1", "2026-03-15T00:00:00Z")])] });
    expect(occurrenceState(r, 0)).toBe("OVERDUE");
  });

  it("explicit C3 administration link completes, including a late completion; before the window it does not", () => {
    const health = healthFor([adm("h-late", "2026-03-25T00:00:00Z"), adm("h-early", "2026-03-05T00:00:00Z")]);
    const late = run({ health: [health], completions: [declaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-late" } })] });
    expect(occurrenceState(late, 0)).toBe("COMPLETED");
    expect(animalOf(late).records[0].completion?.counted[0]).toMatchObject({ basis: "HEALTH_RECORD_LINK", timing: "LATE", healthRecordId: "h-late" });
    const early = run({ health: [health], completions: [declaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-early" } })] });
    expect(occurrenceState(early, 0)).toBe("OVERDUE");
    expect(animalOf(early).records[0].completion?.beforeWindow).toEqual(["d-1"]);
  });

  it("explicit link to a veterinary event when the action declares event evidence", () => {
    const def = programme({ actions: [action({ productRef: null, completion: { recordKind: "VETERINARY_EVENT", eventTypes: ["EXAMINATION"], matchCriteria: false } })] });
    const health = healthFor([vetEvent("h-vet", "2026-03-12T00:00:00Z"), vetEvent("h-visit", "2026-04-12T00:00:00Z", "VISIT")]);
    const completions = [
      declaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-vet" } }),
      declaration("d-2", { occurrenceId: occId(1), evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-visit" } }),
    ];
    const r = run({ definitions: [def], reviews: [review(def)], health: [health], completions });
    expect(states(r)).toEqual(["COMPLETED", "DUE", "UPCOMING"]);
    expect(animalOf(r).records[1].completion?.mismatched).toEqual([{ ref: "d-2", reason: "CATTLE_PROGRAMME_EVENT_TYPE_MISMATCH" }]);
  });

  it("completion by declaration (veterinarian or farmer), version-bound", () => {
    const r = run({ completions: [declaration("d-1", { declaredBy: { role: "VETERINARIAN", actor: "SYNTH-VET-1" } })] });
    expect(occurrenceState(r, 0)).toBe("COMPLETED");
    const other = run({ completions: [declaration("d-1", { programmeVersion: "v0" })] });
    expect(occurrenceState(other, 0)).toBe("REVIEW_REQUIRED");
    const unmatched = run({ completions: [declaration("d-1", { occurrenceId: "SYNTH-NO-SUCH-OCCURRENCE" })] });
    expect(animalOf(unmatched).unmatchedDeclarationIds).toEqual(["d-1"]);
    expect(occurrenceState(unmatched, 0)).toBe("OVERDUE");
  });

  it("competing completion records are EVIDENCE_CONFLICT with no winner", () => {
    const fix1 = declaration("d-2", { supersedes: ["d-1"], evidence: { kind: "DECLARED", completedAt: "2026-03-12T00:00:00Z" }, provenance: { ...(declaration("x").provenance as Rec), receivedAt: "2026-03-20T00:00:00Z" } });
    const fix2 = declaration("d-3", { supersedes: ["d-1"], evidence: { kind: "DECLARED", completedAt: "2026-03-13T00:00:00Z" }, provenance: { ...(declaration("x").provenance as Rec), receivedAt: "2026-03-20T00:00:00Z" } });
    const r = run({ completions: [declaration("d-1"), fix1, fix2] });
    expect(occurrenceState(r, 0)).toBe("EVIDENCE_CONFLICT");
    expect(animalOf(r).records[0].completion?.conflicting).toEqual(["d-2", "d-3"]);
    // A completion in the window and one late disagree on timing.
    const timing = run({ completions: [declaration("d-1"), declaration("d-4", { evidence: { kind: "DECLARED", completedAt: "2026-03-30T00:00:00Z" } })] });
    expect(occurrenceState(timing, 0)).toBe("EVIDENCE_CONFLICT");
  });

  it("a C3 record in a competing correction is a conflict; unknown time / missing C3 data is INSUFFICIENT_EVIDENCE", () => {
    const base = adm("h-1", "2026-03-15T00:00:00Z");
    const c1 = { ...adm("h-2", "2026-03-15T00:00:00Z", { batchRef: "SYNTH-BATCH-A" }), supersedes: ["h-1"] };
    const c2 = { ...adm("h-3", "2026-03-15T00:00:00Z", { batchRef: "SYNTH-BATCH-B" }), supersedes: ["h-1"] };
    expect(occurrenceState(run({ health: [healthFor([base, c1, c2])] }), 0)).toBe("EVIDENCE_CONFLICT");
    expect(occurrenceState(run({ health: [healthFor([adm("h-1", null)])] }), 0)).toBe("INSUFFICIENT_EVIDENCE");
    expect(occurrenceState(run({ health: [] }), 0)).toBe("INSUFFICIENT_EVIDENCE");
    const noProduct = run({ health: [healthFor([adm("h-1", "2026-03-15T00:00:00Z", { productId: null })])] });
    expect(occurrenceState(noProduct, 0)).toBe("INSUFFICIENT_EVIDENCE");
    const v = checkUnresolvedEvidenceNotMasked(
      [
        { label: "C3 projection not supplied", result: run({ health: [] }) },
        { label: "administration time unknown", result: run({ health: [healthFor([adm("h-1", null)])] }) },
        { label: "competing C3 corrections", result: run({ health: [healthFor([base, c1, c2])] }) },
      ],
      (res) => [occurrenceState(res, 0)],
      RESOLVED_LOOKING_STATES,
    );
    expect(v).toEqual(CONFORMS);
  });

  it("a retraction withdraws a declaration; the earlier cutoff still shows it (append-only)", () => {
    const original = [declaration("d-1")];
    const retraction = declaration("d-9", { kind: "RETRACTION", evidence: null, supersedes: ["d-1"], provenance: { ...(declaration("x").provenance as Rec), receivedAt: "2026-04-01T00:00:00Z" } });
    const v = checkCorrectionPreservesHistory(
      "completion retraction",
      original,
      retraction,
      { beforeCorrection: "2026-03-31T00:00:00Z", afterCorrection: CUTOFF },
      (records, knowledgeCutoff) => run({ completions: [...records], knowledgeCutoff }),
      (res) => (res.ok ? animalOf(res).records.flatMap((x) => x.completion?.consideredDeclarationIds ?? []) : []),
      "d-1",
    );
    expect(v).toEqual(CONFORMS);
    expect(occurrenceState(run({ completions: [...original, retraction] }), 0)).toBe("OVERDUE");
  });
});

describe("C7 test 5 — review and approval", () => {
  it("a non-PRODUCTION programme is REVIEW_REQUIRED for every animal", () => {
    const draft = programme({ productionState: "DRAFT" });
    const r = run({ definitions: [draft], reviews: [review(draft)], ledgers: [LEDGER_A, LEDGER_B] });
    expect(states(r)).toEqual(["REVIEW_REQUIRED"]);
    expect(states(r, B)).toEqual(["REVIEW_REQUIRED"]);
    expect(animalOf(r).records[0].reasonCodes).toContain("CATTLE_PROGRAMME_NOT_CURRENT:DRAFT");
  });

  it("a veterinarian programme needs an APPROVED veterinary review bound to its exact version and content", () => {
    expect(states(run({ reviews: [] }))).toEqual(["REVIEW_REQUIRED"]);
    expect(ok(run({ reviews: [] })).programmes[0].governing?.review.dimensions).toEqual([{ dimension: "VETERINARY", state: "PENDING", reviewIds: [] }]);
    expect(states(run({ reviews: [review(DEF, { decision: "REJECTED" })] }))).toEqual(["REVIEW_REQUIRED"]);
    const v2 = programme({ version: "v2" });
    // Approval of v1 never approves v2, even with identical content otherwise.
    expect(states(run({ definitions: [v2], reviews: [review(DEF)] }))).toEqual(["REVIEW_REQUIRED"]);
    const changed = programme({ actions: [action({ actionKind: "SYNTH-ACTION-KIND-2" })] });
    expect(states(run({ definitions: [changed], reviews: [review(DEF)] }))).toEqual(["REVIEW_REQUIRED"]);
    // A later review that supersedes a rejection approves.
    const rejected = review(DEF, { reviewId: "r-1", decision: "REJECTED" });
    const reapproved = review(DEF, { reviewId: "r-2", supersedes: ["r-1"], reviewedAt: "2026-01-03T00:00:00Z" });
    expect(states(run({ reviews: [rejected, reapproved] }))).toEqual(["OVERDUE", "DUE", "UPCOMING"]);
    expect(states(run({ reviews: [rejected, reapproved], knowledgeCutoff: "2026-01-02T12:00:00Z" }))).toEqual(["REVIEW_REQUIRED"]);
  });

  it("a review received after the cutoff is invisible", () => {
    expect(states(run({ reviews: [review(DEF, { reviewedAt: "2026-06-01T00:00:00Z" })], knowledgeCutoff: "2026-05-01T00:00:00Z" }))).toEqual(["REVIEW_REQUIRED"]);
  });
});

describe("C7 test 6 — supplied blocking gates", () => {
  const gated = (gates: string[]) => {
    const def = programme({ actions: [action({ gates })] });
    return { definitions: [def], reviews: [review(def)] };
  };
  const withdrawalGate = cattle.withdrawalGateRuleId(MEAT);

  it("C3 withdrawal gate IN_WITHDRAWAL blocks an open occurrence; CLEAR does not", () => {
    // An unrelated synthetic administration of another product holds the food product in withdrawal at effectiveAt.
    const inWithdrawal = healthFor([adm("h-x", "2026-04-12T00:00:00Z", { productId: "SYNTH-PRODUCT-2" })]);
    const r = run({ ...gated([withdrawalGate]), health: [inWithdrawal] });
    expect(states(r)).toEqual(["BLOCKED", "BLOCKED", "UPCOMING"]);
    expect(animalOf(r).records[1].gates).toEqual([{ ruleId: withdrawalGate, state: "FAIL", source: "C3_WITHDRAWAL", blocking: true }]);
    const clear = run({ ...gated([withdrawalGate]), health: [healthFor([])] });
    expect(states(clear)).toEqual(["OVERDUE", "DUE", "UPCOMING"]);
    expect(animalOf(clear).records[1].gates).toEqual([{ ruleId: withdrawalGate, state: "PASS", source: "C3_WITHDRAWAL", blocking: false }]);
  });

  it("an UNKNOWN gate (insufficient evidence) or a gate not supplied blocks", () => {
    const unknownProduct = healthFor([adm("h-x", "2026-04-12T00:00:00Z", { productId: "SYNTH-PRODUCT-UNKNOWN" })]);
    const r = run({ ...gated([withdrawalGate]), health: [unknownProduct] });
    expect(animalOf(r).records[1]).toMatchObject({ state: "BLOCKED", gates: [{ ruleId: withdrawalGate, state: "INSUFFICIENT_EVIDENCE", blocking: true }] });
    const missing = run(gated(["SYNTH-RULE-NOT-SUPPLIED"]));
    expect(states(missing)).toEqual(["BLOCKED", "BLOCKED", "UPCOMING"]);
    expect(animalOf(missing).records[1].gates).toEqual([{ ruleId: "SYNTH-RULE-NOT-SUPPLIED", state: "NOT_SUPPLIED", source: null, blocking: true }]);
  });

  it("a C2 hard-gate FAIL (overdue obligation) blocks; completion still takes precedence", () => {
    const evaluation = obligationEvaluation();
    const r = run({ ...gated([OBL_RULE]), obligations: [evaluation] });
    expect(states(r)).toEqual(["BLOCKED", "BLOCKED", "UPCOMING"]);
    expect(animalOf(r).records[0].gates).toEqual([{ ruleId: OBL_RULE, state: "FAIL", source: "C2_OBLIGATION", blocking: true }]);
    expect(animalOf(r).inputs.obligationRecords).toHaveLength(1);
    const done = run({ ...gated([OBL_RULE]), obligations: [evaluation], completions: [declaration("d-1")] });
    expect(states(done)).toEqual(["COMPLETED", "BLOCKED", "UPCOMING"]);
  });

  it("predecessor outputs must be verified and at the same times (fail closed)", () => {
    const health = healthFor([]);
    expect(codes(run({ health: [{ ...health, animalId: B }] }))).toContain("CATTLE_PROGRAMME_HEALTH_PROJECTION_INVALID");
    expect(codes(run({ health: [healthFor([], { effectiveAt: "2026-04-16T00:00:00Z" })] }))).toEqual(["CATTLE_PROGRAMME_HEALTH_PROJECTION_TIME_MISMATCH"]);
    expect(codes(run({ health: [health, health] }))).toEqual(["CATTLE_PROGRAMME_HEALTH_PROJECTION_DUPLICATE"]);
    expect(codes(run({ health: [healthFor([], { ledger: LEDGER_B })] }))).toEqual(["CATTLE_PROGRAMME_HEALTH_PROJECTION_UNKNOWN_ANIMAL"]);
    const filtered = projectAnimalHealth(
      { ledger: LEDGER_A, healthRecords: [], productRecords: [], query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, foodProducts: [MEAT], timelineFilter: { kinds: ["SYMPTOM"], occurredFrom: null, occurredTo: null } } } as never,
      hash,
    );
    expect(filtered.ok).toBe(true);
    expect(codes(run({ health: [filtered.ok ? filtered.projection : null] }))).toEqual(["CATTLE_PROGRAMME_HEALTH_PROJECTION_FILTERED"]);
    expect(codes(run({ obligations: [obligationEvaluation("2026-04-16T00:00:00Z")] }))).toEqual(["CATTLE_PROGRAMME_OBLIGATIONS_TIME_MISMATCH"]);
    expect(codes(run({ obligations: [{ animalId: A }] }))).toEqual(["CATTLE_PROGRAMME_OBLIGATIONS_INVALID"]);
    // Outputs projected from another C1 ledger for the same animal are not bound to this evaluation.
    const otherLedger = ledgerOf(A, [dobOf(A), sexOf(A, "MALE")]);
    expect(codes(run({ health: [healthFor([], { ledger: otherLedger })] }))).toEqual(["CATTLE_PROGRAMME_HEALTH_PROJECTION_LEDGER_MISMATCH"]);
    expect(codes(run({ ledgers: [otherLedger], health: [health] }))).toEqual(["CATTLE_PROGRAMME_HEALTH_PROJECTION_LEDGER_MISMATCH"]);
    expect(codes(run({ ledgers: [otherLedger], health: [], obligations: [obligationEvaluation()] }))).toEqual(["CATTLE_PROGRAMME_OBLIGATIONS_LEDGER_MISMATCH"]);
  });
});

// Synthetic C2 hard-gate obligation (no legal meaning): DOB anchor, window opens +1 DAY, due +10 DAY.
const OBL = "SYNTH-OBLIGATION-1";
const OBL_RULE = "SYNTH-RULE-OBLIGATION";
function obligationEvaluation(effectiveAt = EFFECTIVE): AnimalObligationEvaluation {
  const passImpl = impl(() => "PASS", "SYNTH-IMPL-OBLIGATION");
  const def: ObligationDefinition = {
    obligationId: OBL,
    ruleId: OBL_RULE,
    ruleVersion: 1,
    recordedAt: "2026-01-01T00:00:00Z",
    terms: {
      obligationKind: "SYNTH-KIND",
      anchor: { kind: "DATE_OF_BIRTH" },
      window: { opensAfter: { amount: 1, unit: "DAY" }, dueAfter: { amount: 10, unit: "DAY" }, boundary: "INCLUSIVE_START_EXCLUSIVE_END" },
      timeBasis: "UTC",
      windowSource: sourceVersionRef(LEGAL_SOURCE),
    },
  };
  const rule = synthRule({ ruleId: OBL_RULE, version: 1, requiredInputs: [], implementation: bindTo(passImpl), assumptions: ["synthetic assumption", obligationTermsMarker(def, hash)] });
  const result = evaluateAnimalObligations(
    {
      ledger: LEDGER_A,
      evidence: [],
      catalogue: { definitions: [def], ruleVersions: [rule], sources: CATALOGUE, reviews: approveRule(rule) },
      implementations: createObligationImplementationRegistry([passImpl]),
      query: { effectiveAt, knowledgeCutoff: CUTOFF, obligationIds: [OBL] },
    },
    hash,
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  expect(result.evaluation.results[0].state).toBe("OVERDUE");
  return result.evaluation;
}

describe("C7 test 7 — version supersession and knowledge cutoff", () => {
  const v2 = programme({
    version: "v2",
    supersedesVersions: ["v1"],
    validFrom: "2026-04-01T00:00:00Z",
    actions: [action({ schedule: { anchor: { kind: "DATE_OF_BIRTH" }, window: { opensAfter: { amount: 40, unit: "DAY" }, dueAfter: { amount: 60, unit: "DAY" }, boundary: "INCLUSIVE_START_EXCLUSIVE_END" }, repeat: null } })],
    provenance: { ...(DEF.provenance as Rec), receivedAt: "2026-03-20T00:00:00Z" },
  });
  const reviews = [review(DEF), review(v2)];

  it("v2 takes over at its effective boundary; v1 governs earlier valid times", () => {
    const before = ok(run({ definitions: [DEF, v2], reviews, effectiveAt: "2026-03-15T00:00:00Z" }));
    expect(before.programmes[0].governing?.version.definition.version).toBe("v1");
    expect(before.programmes[0].governing?.version.effectiveTo).toBe("2026-04-01T00:00:00.000000000Z");
    const after = run({ definitions: [DEF, v2], reviews });
    expect(ok(after).programmes[0].governing?.version.definition.version).toBe("v2");
    expect(animalOf(after).programmeVersion).toBe("v2");
    expect(states(after)).toEqual(["DUE"]);
    expect(ok(after).programmes[0].versions.map((v) => [v.definition.version, v.recordState, v.supersededBy])).toEqual([
      ["v1", "SUPERSEDED", ["v2"]],
      ["v2", "LIVE", []],
    ]);
  });

  it("old status is reproducible at an earlier knowledge cutoff (later revision invisible)", () => {
    const m = cutoffMatrix("2026-03-20T00:00:00Z");
    const v = checkFutureKnowledgeInvisible(
      [
        { label: "later revision", known: [DEF], later: [v2], knowledgeCutoff: m.before },
        { label: "later malformed revision", known: [DEF], later: [{ ...v2, actions: "not-actions" }], knowledgeCutoff: m.before },
      ],
      (records, knowledgeCutoff) => run({ definitions: [...records], reviews, knowledgeCutoff }),
    );
    expect(v).toEqual(CONFORMS);
    expect(ok(run({ definitions: [DEF, v2], reviews, knowledgeCutoff: m.before })).programmes[0].governing?.version.definition.version).toBe("v1");
    expect(ok(run({ definitions: [DEF, v2], reviews, knowledgeCutoff: m.at })).programmes[0].governing?.version.definition.version).toBe("v2");
  });

  it("later completion evidence is invisible at an earlier cutoff", () => {
    const later = declaration("d-late", { provenance: { ...(declaration("x").provenance as Rec), receivedAt: "2026-05-01T00:00:00Z" } });
    const malformed = { ...later, recordId: "d-bad", evidence: { kind: "NOT-A-KIND" } };
    const v = checkFutureKnowledgeInvisible([{ label: "later declarations", known: [declaration("d-1")], later: [later, malformed], knowledgeCutoff: "2026-04-30T00:00:00Z" }], (records, knowledgeCutoff) =>
      run({ completions: [...records], knowledgeCutoff }),
    );
    expect(v).toEqual(CONFORMS);
  });

  it("malformed definition, review or completion knowledge time fails closed", () => {
    const verdicts = [
      checkMalformedKnowledgeTimeFailsClosed("definition", [], (t) => ({ ...DEF, provenance: { ...(DEF.provenance as Rec), receivedAt: t } }), (records) => run({ definitions: [...records] }), failsClosed),
      checkMalformedKnowledgeTimeFailsClosed("review", [], (t) => review(DEF, { reviewedAt: t }), (records) => run({ reviews: [...records] }), failsClosed),
      checkMalformedKnowledgeTimeFailsClosed(
        "completion",
        [],
        (t) => declaration("d-1", { provenance: { ...(declaration("x").provenance as Rec), receivedAt: t } }),
        (records) => run({ completions: [...records] }),
        failsClosed,
      ),
    ];
    for (const v of verdicts) expect(v).toEqual(CONFORMS);
  });

  it("overlapping live versions are a conflict with no winner, never a latest-wins choice", () => {
    const parallel = programme({ version: "v3", provenance: { ...(DEF.provenance as Rec), receivedAt: "2026-02-01T00:00:00Z" } });
    const r = run({ definitions: [DEF, parallel], reviews: [review(DEF), review(parallel)] });
    expect(ok(r).programmes[0].versionState).toBe("VERSION_CONFLICT");
    expect(ok(r).programmes[0].conflictingVersions.map((v) => v.definition.version)).toEqual(["v1", "v3"]);
    expect(states(r)).toEqual(["EVIDENCE_CONFLICT"]);
  });

  it("duplicate identities: identical copies are idempotent, different content fails closed", () => {
    const defs = checkDuplicateIdentity(
      "definition",
      [DEF],
      { ...DEF, validFrom: "2026-01-01T00:00:00.000Z" },
      [
        { label: "different content", record: programme({ validTo: "2027-01-01T00:00:00Z" }) },
        { label: "invalid copy", record: programme({ actions: [] }) },
      ],
      (records) => run({ definitions: [...records] }),
      failsClosed,
    );
    const decls = checkDuplicateIdentity(
      "completion",
      [declaration("d-1")],
      declaration("d-1", { evidence: { kind: "DECLARED", completedAt: "2026-03-15T00:00:00.000Z" } }),
      [{ label: "different content", record: declaration("d-1", { evidence: { kind: "DECLARED", completedAt: "2026-03-16T00:00:00Z" } }) }],
      (records) => run({ completions: [...records] }),
      failsClosed,
    );
    expect(defs).toEqual(CONFORMS);
    expect(decls).toEqual(CONFORMS);
  });
});

describe("C7 test 8 — farmer programmes stay FARMER_INTENT", () => {
  it("a farmer programme is INTENT, needs no veterinary review and is never a hard gate", () => {
    const farmer = farmerProgramme();
    const r = run({ definitions: [farmer], reviews: [] });
    const p = ok(r).programmes[0];
    expect(p.classification).toBe("FARMER_INTENT");
    expect(p.informationClass).toBe("INTENT");
    expect(p.governing?.review.dimensions).toEqual([]);
    expect(animalOf(r, A, "SYNTH-PROGRAMME-FARMER").classification).toBe("FARMER_INTENT");
    expect(states(r, A, "SYNTH-PROGRAMME-FARMER")).toEqual(["OVERDUE", "DUE", "UPCOMING"]);
    const gates = projectProgrammeHardGates(ok(r), A, hash);
    expect(gates.ok && gates.gates.ruleEvaluations).toEqual([]);
  });

  it("classification must match the declarer; legal or other classifications are rejected", () => {
    expect(codes(run({ definitions: [farmerProgramme({ actions: [action({ gateRole: "HARD_GATE" })] })] }))).toEqual(["CATTLE_PROGRAMME_DEFINITION_INVALID_ACTIONS"]);
    expect(codes(run({ definitions: [programme({ declaredBy: { role: "FARMER", actor: "SYNTH-FARMER-1" } })] }))).toEqual(["CATTLE_PROGRAMME_DEFINITION_INVALID_CLASSIFICATION"]);
    expect(codes(run({ definitions: [programme({ classification: "LEGAL_REQUIRED" })] }))).toEqual(["CATTLE_PROGRAMME_DEFINITION_INVALID_CLASSIFICATION"]);
    const revised = farmerProgramme({ programmeId: P, version: "v2", supersedesVersions: ["v1"], validFrom: "2026-04-01T00:00:00Z" });
    expect(codes(run({ definitions: [DEF, revised] }))).toEqual(["CATTLE_PROGRAMME_DEFINITION_IDENTITY_SCOPE_MISMATCH"]);
  });

  it("a veterinarian programme is a RULE with VETERINARY_PROGRAMME classification", () => {
    const p = ok(run()).programmes[0];
    expect([p.classification, p.informationClass]).toEqual(["VETERINARY_PROGRAMME", "RULE"]);
  });
});

describe("C7 hard-gate projection — C0 evidence pack", () => {
  function packFor(e: ProgrammeStatusEvaluation) {
    const g = projectProgrammeHardGates(e, A, hash);
    if (!g.ok) throw new Error(JSON.stringify(g.issues));
    const input: RecommendationEvidencePackInput = {
      recommendationId: "SYNTH-REC-1",
      engineVersion: "synth-engine",
      rulesetVersion: "synth-ruleset",
      evaluationDate: g.gates.evaluationDate,
      knownAt: g.gates.knowledgeCutoff,
      generatedAt: g.gates.knowledgeCutoff,
      targetScope: { kind: "SYNTH-ANIMAL", id: A, snapshotRef: e.fingerprint.digest },
      intent: null,
      inputs: [],
      ruleEvaluations: [...g.gates.ruleEvaluations],
      requiredHardGateRuleIds: [...g.gates.requiredHardGateRuleIds],
      calculationSteps: [],
      additionalSourceRefs: [...g.gates.sourceRefs],
      assumptions: [],
      limitations: [],
      uncertainties: [],
      candidateActions: [{ actionId: "SYNTH-ACTION", description: "synthetic action", favourability: "VERY_FAVOURABLE" }],
      rejectedAlternatives: [],
      proposedActionId: "SYNTH-ACTION",
      review: { state: "UNREVIEWED", reviewerRef: null, reviewedAt: null, notes: [] },
    };
    const built = buildRecommendationEvidencePack(input, hash);
    if (built.status !== "BUILT") throw new Error(JSON.stringify(built));
    return { gates: g.gates, pack: built.pack };
  }

  it("an overdue hard-gate action blocks the pack whatever its favourability", () => {
    const { gates, pack } = packFor(ok(run()));
    expect(gates.requiredHardGateRuleIds).toEqual([programmeGateRuleId(P, ACT)]);
    expect(gates.ruleEvaluations[0]).toMatchObject({ state: "FAIL", classification: "VETERINARY_PROGRAMME", gateRole: "HARD_GATE", reviews: [{ dimension: "VETERINARY", state: "APPROVED" }] });
    expect(gates.sourceRefs).toEqual([VET_DOC]);
    expect(pack.outcome).toBe("BLOCKED");
  });

  it("completed occurrences with an upcoming one pass; unapproved programmes need review", () => {
    const health = healthFor([adm("h-1", "2026-03-15T00:00:00Z"), adm("h-2", "2026-04-11T00:00:00Z")]);
    const done = packFor(ok(run({ health: [health] })));
    expect(done.gates.ruleEvaluations[0].state).toBe("PASS");
    expect(packFor(ok(run({ reviews: [] }))).pack.outcome).toBe("REVIEW_REQUIRED");
  });

  it("a tampered evaluation or an unevaluated animal fails closed", () => {
    const e = ok(run());
    const tampered = structuredClone(e) as ProgrammeStatusEvaluation;
    (tampered.programmes[0].animals[0].records[0] as { state: string }).state = "COMPLETED";
    expect(verifyProgrammeStatusEvaluation(tampered, hash).valid).toBe(false);
    expect(projectProgrammeHardGates(tampered, A, hash).ok).toBe(false);
    expect(projectProgrammeHardGates(e, B, hash)).toEqual({ ok: false, issues: ["CATTLE_PROGRAMME_HARD_GATE_ANIMAL_NOT_EVALUATED"] });
    expect(verifyProgrammeStatusEvaluation(e, hash).valid).toBe(true);
  });
});

describe("C7 test 9 — determinism, aliasing, fingerprints, boundary", () => {
  const health = healthFor([adm("h-1", "2026-03-15T00:00:00Z")]);
  const completions = [declaration("d-1", { occurrenceId: occId(1), evidence: { kind: "DECLARED", completedAt: "2026-04-12T00:00:00Z" } }), declaration("d-2")];

  it("input order never changes the output", () => {
    const farmer = farmerProgramme();
    const items = [DEF, farmer, ...REVIEWS, ...completions];
    const v = checkOrderIndependence("records", items, (order) =>
      run({
        definitions: order.filter((x) => "actions" in x),
        reviews: order.filter((x) => "reviewId" in x),
        completions: order.filter((x) => "occurrenceId" in x),
        ledgers: [LEDGER_B, LEDGER_A],
        health: [health],
      }),
    );
    expect(v).toEqual(CONFORMS);
    expect(run({ ledgers: [LEDGER_A, LEDGER_B] })).toEqual(run({ ledgers: [LEDGER_B, LEDGER_A] }));
  });

  it("results are detached from caller input and deep-frozen", () => {
    const v = checkDetachedResult(
      "evaluation",
      () => ({ definitions: [structuredClone(DEF)], completions: [declaration("d-1")] }),
      (input) => run({ definitions: input.definitions, completions: input.completions }),
      (input) => {
        (input.definitions[0] as Rec).validFrom = "2027-01-01T00:00:00Z";
        (input.completions[0] as Rec).occurrenceId = "SYNTH-MUTATED";
      },
    );
    expect(v).toEqual(CONFORMS);
    expect(isDeepFrozen(run({ health: [health] }))).toBe(true);
  });

  it("fingerprints are stable under equivalent spellings / order and change with material inputs", () => {
    const base: Run = { healthRecords: [adm("h-1", "2026-03-15T00:00:00Z")], completions };
    const spelled = equivalentInstantSpellings("2026-04-15T00:00:00Z");
    const v = checkFingerprintStability(
      "evaluation",
      base,
      [
        { label: "equivalent effectiveAt spelling", payload: { ...base, effectiveAt: spelled[spelled.length - 1] } },
        { label: "reversed completions", payload: { ...base, completions: [...completions].reverse() } },
        { label: "equivalent receivedAt spelling", payload: { ...base, definitions: [{ ...DEF, provenance: { ...(DEF.provenance as Rec), receivedAt: "2026-01-01T00:00:00.000Z" } }] } },
      ],
      [
        { label: "completion removed", payload: { ...base, completions: [completions[0]] } },
        { label: "effectiveAt changed", payload: { ...base, effectiveAt: "2026-04-16T00:00:00Z" } },
        { label: "knowledge cutoff changed", payload: { ...base, knowledgeCutoff: "2026-12-30T00:00:00Z" } },
      ],
      (payload) => ok(run(payload)).fingerprint.digest,
    );
    expect(v).toEqual(CONFORMS);
    const a = animalOf(run(base));
    expect(a.fingerprint).toEqual(animalOf(run({ ...base, completions: [...completions].reverse() })).fingerprint);
  });

  it("non-canonical input is rejected before evaluation", () => {
    const definitions: unknown[] = [];
    Object.defineProperty(definitions, "0", { get: () => DEF, enumerable: true });
    Object.defineProperty(definitions, "length", { value: 1 });
    expect(codes(run({ definitions }))).toEqual(["CATTLE_PROGRAMME_NON_CANONICAL_INPUT"]);
    const getterQuery = evaluateHealthProgrammes(
      { definitions: [], reviews: [], completions: [], ledgers: [], health: [], obligations: [], query: Object.defineProperty({ knowledgeCutoff: CUTOFF }, "effectiveAt", { get: () => EFFECTIVE, enumerable: true }) } as never,
      hash,
    );
    expect(codes(getterQuery)).toEqual(["CATTLE_PROGRAMME_NON_CANONICAL_INPUT"]);
    expect(codes(run({ effectiveAt: "2026-04-15", health: [] }))).toEqual(["CATTLE_PROGRAMME_INVALID_EFFECTIVE_AT"]);
    expect(codes(run({ definitions: [programme({ actions: [action({ schedule: { anchor: { kind: "DATE_OF_BIRTH" }, window: { opensAfter: { amount: 0, unit: "DAY" }, dueAfter: { amount: 1, unit: "DAY" }, boundary: "INCLUSIVE_START_EXCLUSIVE_END" }, repeat: { interval: { amount: 1, unit: "DAY" }, count: 1001 } } })] })] }))).toEqual([
      "CATTLE_PROGRAMME_DEFINITION_INVALID_ACTIONS",
    ]);
  });

  it("is exported through the cattle barrel", () => {
    expect(cattle.evaluateHealthProgrammes).toBe(evaluateHealthProgrammes);
    expect(cattle.projectProgrammeHardGates).toBe(projectProgrammeHardGates);
  });

  it("no clock, network, AI, tooling, raw predecessor module or later-phase dependency", () => {
    const dir = __dirname;
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(sources.length).toBeGreaterThanOrEqual(7);
    for (const f of sources) {
      const text = readFileSync(join(dir, f), "utf8");
      expect(text, f).not.toMatch(/Date\.now|new Date\(|performance\.now|Math\.random|fetch\(|XMLHttpRequest|openai|anthropic|@\/tooling|src\/tooling/);
      expect(text, f).not.toMatch(/from "[^"]*livestock"|from "\.\.\/(recommendations|plan-interface|presentation)|from "\.\.\/\.\.\/types"/);
      // C3 withdrawal and C2 obligation state are consumed, never re-derived.
      expect(text, f).not.toMatch(/computeAdministrationWithdrawal|foldWithdrawalGate|bindAdministrationProduct|evaluateAnimalObligations|deriveObligationOccurrences/);
    }
  });
});
