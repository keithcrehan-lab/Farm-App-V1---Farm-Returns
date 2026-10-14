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
import { canonicalizeValue } from "../../assessment-integrity";
import { ANIMAL_DATA_SOURCE_CATEGORIES, animalInstantKey, createAnimalLedger, isValidAnimalInstant, type AnimalLedger } from "../animal-ledger";
import { buildRecommendationEvidencePack, type RecommendationEvidencePackInput } from "../evidence-pack";
import * as cattle from "../index";
import { computeSourceContentFingerprint, sourceVersionRef } from "../source";
import { CATALOGUE, LEGAL_SOURCE, approve as approveRule, bindTo, hash, impl, synthRule } from "../test-fixtures";
import { computeHealthFingerprint, projectAnimalHealth, semanticHealthRecord, verifyAnimalHealthProjection, type AnimalHealthProjection } from "../health";
import { addObligationOffset } from "../regulatory/obligation-time";
import { resolveGroupScope } from "../weights";
import { computeObligationFingerprint, createObligationImplementationRegistry, evaluateAnimalObligations, obligationTermsMarker, type AnimalObligationEvaluation, type ObligationDefinition } from "../regulatory";
import { uniqueProgrammeIssues } from "./programme-definition";
import { PROGRAMME_FIELD_POLICY, conformsToPolicy, type ProgrammeFieldRule, type ProgrammeRecordType } from "./programme-fields";
import {
  PROGRAMME_ANCHOR_KINDS,
  PROGRAMME_CLASSIFICATIONS,
  PROGRAMME_COMPLETION_RECORD_KINDS,
  PROGRAMME_DECLARER_ROLES,
  PROGRAMME_WINDOW_BOUNDARIES,
  PRODUCTION_HEALTH_PROGRAMME_DEFINITIONS,
  computeProgrammeDefinitionFingerprint,
  computeProgrammeFingerprint,
  evaluateHealthProgrammes,
  programmeGateRuleId,
  programmeOccurrenceId,
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
const occId = (index: number, animal = A, action = ACT, programme = P) => JSON.stringify([programme, action, animal, "DATE_OF_BIRTH", ANCHOR, index]);

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

/** A veterinarian's declaration (a farmer's alone never completes a veterinary hard-gate action — decision B2). */
const vetDeclaration = (recordId: string, overrides: Rec = {}) => declaration(recordId, { declaredBy: { role: "VETERINARIAN", actor: "SYNTH-VET-1" }, ...overrides });

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

/** The raw canonical request a `Run` describes. */
function requestOf(o: Run = {}): Rec {
  return {
    definitions: o.definitions ?? [DEF],
    reviews: o.reviews ?? REVIEWS,
    completions: o.completions ?? [],
    ledgers: o.ledgers ?? [LEDGER_A],
    health: o.health ?? [healthFor(o.healthRecords ?? [], { effectiveAt: o.effectiveAt ?? EFFECTIVE, knowledgeCutoff: o.knowledgeCutoff ?? CUTOFF, ledger: (o.ledgers ?? [LEDGER_A]).find((l) => l.animalId === A) })],
    obligations: o.obligations ?? [],
    query: { effectiveAt: o.effectiveAt ?? EFFECTIVE, knowledgeCutoff: o.knowledgeCutoff ?? CUTOFF },
  };
}
function run(o: Run = {}): ProgrammeEvaluationResult {
  return evaluateHealthProgrammes(requestOf(o) as never, hash);
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
      { basis: "DECLARED_CRITERIA", declaredBy: null, declarationId: null, healthRecordId: "h-1", completedAt: "2026-03-15T00:00:00.000000000Z", timing: "IN_WINDOW" },
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
    const late = run({ health: [health], completions: [vetDeclaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-late" } })] });
    expect(occurrenceState(late, 0)).toBe("COMPLETED");
    expect(animalOf(late).records[0].completion?.counted[0]).toMatchObject({ basis: "HEALTH_RECORD_LINK", timing: "LATE", healthRecordId: "h-late" });
    const early = run({ health: [health], completions: [vetDeclaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-early" } })] });
    expect(occurrenceState(early, 0)).toBe("OVERDUE");
    expect(animalOf(early).records[0].completion?.beforeWindow).toEqual(["d-1"]);
  });

  it("explicit link to a veterinary event when the action declares event evidence", () => {
    const def = programme({ actions: [action({ productRef: null, completion: { recordKind: "VETERINARY_EVENT", eventTypes: ["EXAMINATION"], matchCriteria: false } })] });
    const health = healthFor([vetEvent("h-vet", "2026-03-12T00:00:00Z"), vetEvent("h-visit", "2026-04-12T00:00:00Z", "VISIT")]);
    const completions = [
      vetDeclaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-vet" } }),
      vetDeclaration("d-2", { occurrenceId: occId(1), evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-visit" } }),
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

  it("a counted completion never masks unresolved candidate evidence (state and hard gate)", () => {
    const mixed = run({ completions: [declaration("d-1"), declaration("d-2", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "SYNTH-MISSING-RECORD" } })] });
    const record = animalOf(mixed).records.find((x) => x.occurrence?.index === 0)!;
    expect(record.completion?.counted.length).toBe(1);
    expect(record.completion?.unresolved).toEqual([{ ref: "d-2", reason: "CATTLE_PROGRAMME_LINKED_RECORD_NOT_KNOWN" }]);
    expect(record.state).toBe("INSUFFICIENT_EVIDENCE");
    const g = projectProgrammeHardGates(ok(mixed), A, hash);
    if (!g.ok) throw new Error(JSON.stringify(g.issues));
    expect(g.gates.ruleEvaluations[0].state).not.toBe("PASS");
    // Counted by declared criteria with an unresolved candidate (time unknown) is not COMPLETED either.
    const criteria = run({ health: [healthFor([adm("h-1", "2026-03-15T00:00:00Z"), adm("h-2", null)])] });
    expect(occurrenceState(criteria, 0)).toBe("INSUFFICIENT_EVIDENCE");
    const v = checkUnresolvedEvidenceNotMasked(
      [
        { label: "counted declaration + unknown linked record", result: mixed },
        { label: "counted criteria record + candidate without time", result: criteria },
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
    const done = run({ ...gated([OBL_RULE]), obligations: [evaluation], completions: [vetDeclaration("d-1")] });
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

  // CAT-INV-014/021/023: every consumed C2 record — not only its envelope —
  // must belong to this animal, this C1 snapshot and the query's times.
  it("every C2 record must be bound to this animal's snapshot and the query's times (matching envelope, foreign records)", () => {
    const genuine = obligationEvaluation();
    const accepted = run({ ...gated([OBL_RULE]), obligations: [genuine] });
    expect(accepted.ok).toBe(true);
    // Records genuinely derived from another C1 ledger of the same animal (valid C2 fingerprints of their own).
    const foreign = obligationEvaluation(EFFECTIVE, ledgerOf(A, [dobOf(A), sexOf(A, "MALE")]));
    expect(foreign.snapshotFingerprint).not.toEqual(genuine.snapshotFingerprint);
    const envelopeWith = (results: AnimalObligationEvaluation["results"]) => ({ ...genuine, results });
    const reseal = (r: AnimalObligationEvaluation["results"][number], change: Rec) => {
      const { fingerprint: _drop, ...content } = { ...r, ...change };
      void _drop;
      return { ...content, fingerprint: computeObligationFingerprint("CATTLE_OBLIGATION_STATE", content, hash) } as typeof r;
    };
    const [record] = genuine.results;
    const cases: [string, AnimalObligationEvaluation["results"]][] = [
      ["foreign snapshotFingerprint (genuine foreign record)", foreign.results],
      ["foreign snapshotFingerprint (resealed)", [reseal(record, { snapshotFingerprint: foreign.snapshotFingerprint })]],
      ["wrong animalId", [reseal(record, { animalId: B })]],
      ["wrong effectiveAt", [reseal(record, { effectiveAt: "2026-04-16T00:00:00.000000000Z" })]],
      ["wrong knowledgeCutoff", [reseal(record, { knowledgeCutoff: "2026-12-30T00:00:00.000000000Z" })]],
      ["valid and foreign mixed", [record, ...foreign.results]],
      ["foreign and valid mixed (other order)", [...foreign.results, record]],
    ];
    const mismatch = ["CATTLE_PROGRAMME_OBLIGATIONS_FOREIGN_RECORD", "CATTLE_PROGRAMME_OBLIGATIONS_INVALID"];
    for (const [label, results] of cases) {
      const r = run({ ...gated([OBL_RULE]), obligations: [envelopeWith(results)] });
      expect(r.ok, label).toBe(false);
      expect(codes(r).length, label).toBeGreaterThan(0);
      for (const code of codes(r)) expect(mismatch, label).toContain(code);
    }
    // The audit's exact shape (valid foreign records under a matching envelope) is C7's own rejection.
    expect(codes(run({ ...gated([OBL_RULE]), obligations: [envelopeWith(foreign.results)] }))).toEqual(["CATTLE_PROGRAMME_OBLIGATIONS_FOREIGN_RECORD"]);
    expect(codes(run({ ...gated([OBL_RULE]), obligations: [envelopeWith([...foreign.results, record])] }))).toEqual(codes(run({ ...gated([OBL_RULE]), obligations: [envelopeWith([record, ...foreign.results])] })));
  });
});

// Synthetic C2 hard-gate obligation (no legal meaning): DOB anchor, window opens +1 DAY, due +10 DAY.
const OBL = "SYNTH-OBLIGATION-1";
const OBL_RULE = "SYNTH-RULE-OBLIGATION";
function obligationEvaluation(effectiveAt = EFFECTIVE, ledger: AnimalLedger = LEDGER_A, expectOverdue = true): AnimalObligationEvaluation {
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
      ledger,
      evidence: [],
      catalogue: { definitions: [def], ruleVersions: [rule], sources: CATALOGUE, reviews: approveRule(rule) },
      implementations: createObligationImplementationRegistry([passImpl]),
      query: { effectiveAt, knowledgeCutoff: CUTOFF, obligationIds: [OBL] },
    },
    hash,
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  if (expectOverdue) expect(result.evaluation.results[0].state).toBe("OVERDUE");
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

  it("delimiter-containing programme/action ids keep distinct gate rule ids through the C0 pack", () => {
    const first = programme({ programmeId: "SYNTH-P|SYNTH-Q", actions: [action({ actionId: "SYNTH-R" })] });
    const second = programme({ programmeId: "SYNTH-P", actions: [action({ actionId: "SYNTH-Q|SYNTH-R" })] });
    const { gates, pack } = packFor(ok(run({ definitions: [first, second], reviews: [review(first), review(second)] })));
    expect(programmeGateRuleId("SYNTH-P|SYNTH-Q", "SYNTH-R")).not.toBe(programmeGateRuleId("SYNTH-P", "SYNTH-Q|SYNTH-R"));
    expect(new Set(gates.requiredHardGateRuleIds).size).toBe(2);
    expect(gates.requiredHardGateRuleIds).toEqual([programmeGateRuleId("SYNTH-P", "SYNTH-Q|SYNTH-R"), programmeGateRuleId("SYNTH-P|SYNTH-Q", "SYNTH-R")].sort());
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

  it("result fingerprints bind completion and review content, provenance and supersession", () => {
    const base: Run = { completions: [declaration("d-1")] };
    const d1 = declaration("d-1");
    const prov1 = d1.provenance as Rec;
    const v = checkFingerprintStability(
      "evaluation",
      base,
      [],
      [
        { label: "completion declarer", payload: { completions: [declaration("d-1", { declaredBy: { role: "VETERINARIAN", actor: "SYNTH-VET-9" } })] } },
        { label: "completion receivedAt", payload: { completions: [declaration("d-1", { provenance: { ...prov1, receivedAt: "2026-03-17T00:00:00Z" } })] } },
        { label: "completion sourceRecordRef", payload: { completions: [declaration("d-1", { provenance: { ...prov1, sourceRecordRef: "SYNTH-REF-9" } })] } },
        { label: "completion superseded", payload: { completions: [d1, declaration("d-2", { supersedes: ["d-1"], provenance: { ...prov1, receivedAt: "2026-03-18T00:00:00Z" } })] } },
        { label: "reviewer", payload: { ...base, reviews: [review(DEF, { reviewer: { role: "VETERINARIAN", actor: "SYNTH-REVIEWER-9" } })] } },
        { label: "reviewedAt", payload: { ...base, reviews: [review(DEF, { reviewedAt: "2026-01-03T00:00:00Z" })] } },
        { label: "review supersession", payload: { ...base, reviews: [review(DEF), review(DEF, { reviewId: "SYNTH-REVIEW-2", supersedes: [review(DEF).reviewId], reviewedAt: "2026-01-03T00:00:00Z" })] } },
      ],
      (payload) => ok(run(payload)).fingerprint.digest,
    );
    expect(v).toEqual(CONFORMS);
    const changed = run({ completions: [declaration("d-1", { declaredBy: { role: "VETERINARIAN", actor: "SYNTH-VET-9" } })] });
    expect(animalOf(changed).fingerprint).not.toEqual(animalOf(run(base)).fingerprint);
    expect(animalOf(run(base)).declarations).toEqual([expect.objectContaining({ recordId: "d-1", declaredBy: { role: "FARMER", actor: "SYNTH-FARMER-1" } })]);
    expect(verifyProgrammeStatusEvaluation(ok(changed), hash).valid).toBe(true);
  });

  it("animal-status fingerprints and exported hard gates bind programme definition and review provenance", () => {
    const productDef = programme({ actions: [action({ productRef: { productId: "SYNTH-PRODUCT-2", productVersion: null } })] });
    const v2 = programme({ version: "v2" });
    const variants: { label: string; payload: Run }[] = [
      { label: "reviewer", payload: { reviews: [review(DEF, { reviewer: { role: "VETERINARIAN", actor: "SYNTH-REVIEWER-9" } })] } },
      { label: "reviewedAt", payload: { reviews: [review(DEF, { reviewedAt: "2026-01-03T00:00:00Z" })] } },
      { label: "declared product with matching approval", payload: { definitions: [productDef], reviews: [review(productDef)] } },
      { label: "unapproved definition content", payload: { definitions: [productDef], reviews: [] } },
      { label: "conflicting version content", payload: { definitions: [DEF, v2], reviews: [] } },
    ];
    const baseFor = (label: string): Run => (label === "unapproved definition content" ? { reviews: [] } : label === "conflicting version content" ? { definitions: [DEF, programme({ version: "v2", actions: [action({ actionKind: "SYNTH-ACTION-KIND-2" })] })], reviews: [] } : {});
    for (const { label, payload } of variants) {
      const before = ok(run(baseFor(label)));
      const after = ok(run(payload));
      expect(after.programmes[0].animals[0].status, label).toBe(before.programmes[0].animals[0].status);
      expect(animalOf(run(payload)).fingerprint, label).not.toEqual(animalOf(run(baseFor(label))).fingerprint);
      const g0 = projectProgrammeHardGates(before, A, hash);
      const g1 = projectProgrammeHardGates(after, A, hash);
      expect(g0.ok && g1.ok, label).toBe(true);
      expect(g1, label).not.toEqual(g0);
      expect(verifyProgrammeStatusEvaluation(after, hash).valid, label).toBe(true);
    }
    // Tampering programme provenance alone (evaluation fingerprint recomputed) is caught by the animal-status check.
    const e = structuredClone(ok(run())) as ProgrammeStatusEvaluation;
    (e.programmes[0].governing!.reviewRecords[0] as { reviewedAt: string }).reviewedAt = "2026-01-05T00:00:00Z";
    const content: Partial<ProgrammeStatusEvaluation> = { ...e };
    delete content.fingerprint;
    const resealed = { ...e, fingerprint: computeProgrammeFingerprint("CATTLE_PROGRAMME_STATUS", content, hash) };
    expect(verifyProgrammeStatusEvaluation(resealed, hash).valid).toBe(false);
    expect(projectProgrammeHardGates(resealed, A, hash).ok).toBe(false);
  });

  // CAT-INV-021, FINGERPRINTS.md rule 4: the animal-status RESULT fingerprint
  // binds the complete canonical governing / conflicting version records; the
  // CATTLE_PROGRAMME_DEFINITION review fingerprint keeps its narrower meaning.
  it("result binding matrix: every canonical definition and review field changes the animal fingerprint and exported gates", () => {
    const P2 = "SYNTH-PROGRAMME-2";
    const withDef = (overrides: Rec, reviewOverrides: Rec = {}): Run => {
      const def = programme(overrides);
      return { definitions: [def], reviews: [review(def, reviewOverrides)] };
    };
    const provWith = (fields: Rec) => ({ provenance: { ...(DEF.provenance as Rec), ...fields } });
    const v2 = (fields: Rec = {}) => programme({ version: "v2", ...fields });
    const conflictBase: Run = { definitions: [DEF, v2()], reviews: [] };
    const governingVariants: [string, Run][] = [
      ["programme identity", withDef({ programmeId: P2 })],
      ["definition version", withDef({ version: "v1b" })],
      ["validFrom", withDef({ validFrom: "2026-01-02T00:00:00Z" })],
      ["validTo", withDef({ validTo: "2027-01-01T00:00:00Z" })],
      ["declarer actor", withDef({ declaredBy: { role: "VETERINARIAN", actor: "SYNTH-VET-2" } })],
      ["action content", withDef({ actions: [action({ actionKind: "SYNTH-ACTION-KIND-2" })] })],
      ["production state", withDef({ productionState: "APPROVED" })],
      ["provenance.sourceRecordRef", withDef(provWith({ sourceRecordRef: "SYNTH-RECORD-1" }))],
      ["provenance.sourceSystem", withDef(provWith({ sourceSystem: "SYNTH-SYSTEM-1" }))],
      ["provenance.receivedAt", withDef(provWith({ receivedAt: "2026-01-01T12:00:00Z" }))],
      ["provenance.sourceDocument", withDef(provWith({ sourceDocument: { ...VET_DOC, version: "v2" } }))],
      ["review id", withDef({}, { reviewId: "SYNTH-REVIEW-OTHER" })],
      ["reviewer", withDef({}, { reviewer: { role: "VETERINARIAN", actor: "SYNTH-REVIEWER-9" } })],
      ["reviewedAt", withDef({}, { reviewedAt: "2026-01-03T00:00:00Z" })],
    ];
    const conflictVariants: [string, Run][] = [
      ["conflicting provenance.sourceRecordRef", { definitions: [DEF, v2(provWith({ sourceRecordRef: "SYNTH-RECORD-2" }))], reviews: [] }],
      ["conflicting provenance.sourceSystem", { definitions: [DEF, v2(provWith({ sourceSystem: "SYNTH-SYSTEM-2" }))], reviews: [] }],
      ["conflicting provenance.receivedAt", { definitions: [DEF, v2(provWith({ receivedAt: "2026-01-01T06:00:00Z" }))], reviews: [] }],
      ["conflicting validTo", { definitions: [DEF, v2({ validTo: "2027-01-01T00:00:00Z" })], reviews: [] }],
    ];
    const animal = (e: ProgrammeStatusEvaluation) => e.programmes[0].animals.find((a) => a.animalId === A)!;
    const gatesOf = (e: ProgrammeStatusEvaluation) => {
      const g = projectProgrammeHardGates(e, A, hash);
      if (!g.ok) throw new Error(JSON.stringify(g.issues));
      return g.gates;
    };
    for (const [baseRun, variants] of [[{}, governingVariants], [conflictBase, conflictVariants]] as [Run, [string, Run][]][]) {
      const before = ok(run(baseRun));
      for (const [label, variant] of variants) {
        const after = ok(run(variant));
        expect(verifyProgrammeStatusEvaluation(after, hash).valid, label).toBe(true);
        expect(animal(after).fingerprint, label).not.toEqual(animal(before).fingerprint);
        expect(gatesOf(after).ruleEvaluations, label).not.toEqual(gatesOf(before).ruleEvaluations);
      }
    }

    // Equivalent canonical input (instant spelling, input order) is not a material change.
    const spelled = ok(run(withDef(provWith({ receivedAt: "2026-01-01T00:00:00.000Z" }))));
    expect(animal(spelled).fingerprint).toEqual(animal(ok(run())).fingerprint);
    const conflictReordered = ok(run({ definitions: [v2(), DEF], reviews: [] }));
    expect(animal(conflictReordered).fingerprint).toEqual(animal(ok(run(conflictBase))).fingerprint);

    // The review fingerprint keeps its meaning: knowledge-time provenance is not reviewed content.
    const reReceived = programme(provWith({ sourceRecordRef: "SYNTH-RECORD-1", sourceSystem: "SYNTH-SYSTEM-1", receivedAt: "2026-01-01T12:00:00Z" }));
    expect(computeProgrammeDefinitionFingerprint(reReceived, hash)).toEqual(computeProgrammeDefinitionFingerprint(DEF, hash));
    expect(ok(run()).programmes[0].governing!.version.definitionFingerprint).toEqual(computeProgrammeDefinitionFingerprint(DEF, hash));

    // Tampering definition provenance in a resealed evaluation is caught by the animal-status check.
    const e = structuredClone(ok(run())) as ProgrammeStatusEvaluation;
    (e.programmes[0].governing!.version.definition.provenance as { sourceRecordRef: string | null }).sourceRecordRef = "SYNTH-RECORD-TAMPERED";
    const content: Partial<ProgrammeStatusEvaluation> = { ...e };
    delete content.fingerprint;
    const resealed = { ...e, fingerprint: computeProgrammeFingerprint("CATTLE_PROGRAMME_STATUS", content, hash) };
    expect(verifyProgrammeStatusEvaluation(resealed, hash).valid).toBe(false);
    expect(projectProgrammeHardGates(resealed, A, hash).ok).toBe(false);
  });

  it("membership binding matrix: every C4 group resolution C7 consults (current and each window opening) binds the result", () => {
    const def = programme({ applicability: { kind: "GROUP", groupRef: GROUP } });
    const late = "2026-05-15T00:00:00Z"; // all three repeat windows have opened
    const OLD = "2026-01-01T00:00:00Z";
    // Historical assertion explains windows 0 (Mar 11); current one explains window 1, window 2 and effectiveAt.
    const hist = (fields: Rec = {}, provenance: Rec = {}) => ({ ...groupOf(A, GROUP, "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z", "g-hist"), ...fields, provenance: { ...prov(), ...provenance } });
    const curr = (fields: Rec = {}, provenance: Rec = {}) => ({ ...groupOf(A, GROUP, "2026-04-01T00:00:00Z", null, "g-curr"), ...fields, provenance: { ...prov(), ...provenance } });
    const stale = (provenance: Rec = {}) => ({ ...groupOf(A, "SYNTH-GROUP-3", OLD, "2026-02-01T00:00:00Z", "g-stale"), provenance: { ...prov(OLD), ...provenance } });
    const ledgerWith = (h: Rec = hist(), c: Rec = curr(), st: Rec = stale()) => ledgerOf(A, [dobOf(A), sexOf(A), st, h, c]);
    const at = (effectiveAt: string, ledger: AnimalLedger) => ok(run({ definitions: [def], reviews: [review(def)], ledgers: [ledger], effectiveAt }));
    const animal = (e: ProgrammeStatusEvaluation) => e.programmes[0].animals.find((a) => a.animalId === A)!;
    const gatesOf = (e: ProgrammeStatusEvaluation) => {
      const g = projectProgrammeHardGates(e, A, hash);
      if (!g.ok) throw new Error(JSON.stringify(g.issues));
      return g.gates.ruleEvaluations;
    };
    const c4 = (ledger: AnimalLedger, effectiveAt: string) => {
      const r = resolveGroupScope({ scope: { kind: "GROUP", groupRef: GROUP, ledgers: [ledger] }, query: { effectiveAt, knowledgeCutoff: CUTOFF } }, hash);
      if (!r.ok) throw new Error(JSON.stringify(r.issues));
      return r.scope.fingerprint;
    };

    for (const effectiveAt of [EFFECTIVE, late]) {
      const ledger = ledgerWith();
      const before = at(effectiveAt, ledger);
      expect(states({ ok: true, evaluation: before } as ProgrammeEvaluationResult).slice(0, 2)).toEqual(["OVERDUE", effectiveAt === EFFECTIVE ? "DUE" : "OVERDUE"]);

      // Every C4 resolution consulted is represented: current membership and each opened window (repeated), none for an unopened one.
      expect(animal(before).membership!.evidenceFingerprint).toEqual(c4(ledger, effectiveAt));
      for (const r of animal(before).records) {
        const opened = r.occurrence !== null && r.state !== "UPCOMING";
        expect(r.membershipAtOpen?.evidenceFingerprint ?? null, `window ${r.occurrence?.index}`).toEqual(opened ? c4(ledger, r.occurrence!.opensAt) : null);
        if (opened) expect(r.membershipAtOpen).toMatchObject({ state: "MEMBER", basis: "GROUP", at: r.occurrence!.opensAt });
      }
      expect(animal(before).records.filter((r) => r.membershipAtOpen !== null)).toHaveLength(effectiveAt === EFFECTIVE ? 2 : 3);

      // Material provenance / content changes to any consulted assertion propagate, membership states unchanged.
      const variants: [string, AnimalLedger][] = [
        ["historical provenance.sourceRecordRef", ledgerWith(hist({}, { sourceRecordRef: "SYNTH-RECORD-1" }))],
        ["historical provenance.sourceSystem", ledgerWith(hist({}, { sourceSystem: "SYNTH-SYSTEM-1" }))],
        ["historical provenance.receivedAt", ledgerWith(hist({}, { receivedAt: "2026-02-02T00:00:00Z" }))],
        ["historical validFrom", ledgerWith(hist({ validFrom: "2026-02-15T00:00:00Z" }))],
        ["current provenance.sourceRecordRef", ledgerWith(hist(), curr({}, { sourceRecordRef: "SYNTH-RECORD-2" }))],
        ["current provenance.sourceSystem", ledgerWith(hist(), curr({}, { sourceSystem: "SYNTH-SYSTEM-2" }))],
        ["current validTo", ledgerWith(hist(), curr({ validTo: "2026-12-01T00:00:00Z" }))],
      ];
      for (const [label, variant] of variants) {
        const after = at(effectiveAt, variant);
        expect(verifyProgrammeStatusEvaluation(after, hash).valid, label).toBe(true);
        expect(animal(after).records.map((r) => r.state), label).toEqual(animal(before).records.map((r) => r.state));
        expect(after.fingerprint, label).not.toEqual(before.fingerprint);
        expect(animal(after).fingerprint, label).not.toEqual(animal(before).fingerprint);
        expect(gatesOf(after), label).not.toEqual(gatesOf(before));
      }

      // Equivalent spelling and ledger order are not material.
      const respelled = ledgerWith(hist({ validFrom: "2026-03-01T00:00:00.000Z" }, { receivedAt: "2026-02-01T00:00:00.000000Z" }));
      expect(c4(respelled, OPEN0)).toEqual(c4(ledger, OPEN0));
      const reordered = ledgerOf(A, [curr(), hist(), sexOf(A), stale(), dobOf(A)]);
      expect(at(effectiveAt, reordered).fingerprint).toEqual(before.fingerprint);
      expect(animal(at(effectiveAt, reordered)).fingerprint).toEqual(animal(before).fingerprint);

      // Negative control: a group assertion no consulted resolution relies on leaves every C4 resolution unchanged.
      const irrelevant = ledgerWith(hist(), curr(), stale({ sourceRecordRef: "SYNTH-RECORD-IRRELEVANT" }));
      const control = at(effectiveAt, irrelevant);
      expect(animal(control).membership!.evidenceFingerprint).toEqual(animal(before).membership!.evidenceFingerprint);
      expect(animal(control).records.map((r) => r.membershipAtOpen)).toEqual(animal(before).records.map((r) => r.membershipAtOpen));
      expect(control.fingerprint).toEqual(before.fingerprint);
      expect(animal(control).fingerprint).toEqual(animal(before).fingerprint);

      // Resealed tampering of a window-opening binding fails closed.
      const e = structuredClone(before) as ProgrammeStatusEvaluation;
      const opened = e.programmes[0].animals.find((a) => a.animalId === A)!.records.find((r) => r.membershipAtOpen !== null)!;
      opened.membershipAtOpen!.evidenceFingerprint = { ...opened.membershipAtOpen!.evidenceFingerprint!, digest: "0".repeat(64) };
      const content: Partial<ProgrammeStatusEvaluation> = { ...e };
      delete content.fingerprint;
      const resealed = { ...e, fingerprint: computeProgrammeFingerprint("CATTLE_PROGRAMME_STATUS", content, hash) };
      expect(verifyProgrammeStatusEvaluation(resealed, hash).valid).toBe(false);
      expect(projectProgrammeHardGates(resealed, A, hash).ok).toBe(false);
    }

    // CRITERIA membership is bound to the C1 snapshot it was read from; EXPLICIT_SET to the (provenance-bound) definition.
    const criteria = programme({ applicability: { kind: "CRITERIA", sex: "FEMALE", bornOnOrAfter: null, bornBefore: null } });
    const c = animal(ok(run({ definitions: [criteria], reviews: [review(criteria)] })));
    expect(c.membership).toMatchObject({ basis: "CRITERIA", evidenceFingerprint: c.inputs.snapshotFingerprint });
    expect(animal(ok(run())).membership).toMatchObject({ basis: "EXPLICIT_SET", evidenceFingerprint: null });
    expect(animal(ok(run())).records.every((r) => r.membershipAtOpen === null)).toBe(true);
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

// ---------------------------------------------------------------------------
// C7 closure matrices (human-authorised whole-C7 boundary-policy repair).
// Class-level and table-driven: each matrix is driven by one policy, one
// binding rule or one membership rule, never by a named example.
// ---------------------------------------------------------------------------

type Path = (string | number)[];
const getAt = (root: unknown, path: Path): unknown => path.reduce<unknown>((v, k) => (v as Record<string | number, unknown>)[k], root);
function setAt<T>(root: T, path: Path, value: unknown): T {
  const copy = structuredClone(root);
  if (path.length === 0) return value as T;
  const parent = getAt(copy, path.slice(0, -1)) as Record<string | number, unknown>;
  parent[path[path.length - 1]] = value;
  return copy;
}
function withoutAt<T>(root: T, path: Path): T {
  const copy = structuredClone(root);
  delete (getAt(copy, path.slice(0, -1)) as Record<string | number, unknown>)[path[path.length - 1]];
  return copy;
}

describe("C7 closure A — one field-presence policy for every C7-owned record", () => {
  const OPEN_COMPLETION = { recordKind: "MEDICINE_ADMINISTRATION", eventTypes: null, matchCriteria: false };
  const looseAction = action({ completion: OPEN_COMPLETION });
  const criteriaDef = programme({ applicability: { kind: "CRITERIA", sex: "FEMALE", bornOnOrAfter: "2026-01-01", bornBefore: "2027-01-01" } });
  const fixedDef = programme({ actions: [action({ schedule: { ...(action().schedule as Rec), anchor: { kind: "FIXED_INSTANT", at: "2026-03-01T00:00:00Z" } } })] });
  const groupDef = programme({ applicability: { kind: "GROUP", groupRef: GROUP } });
  const looseDef = programme({ actions: [looseAction] });
  const linkDeclaration = declaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-1" } });

  // One entry per C7-owned record type: a valid root, where the record sits in it, and how the root is evaluated.
  type Entry = { type: ProgrammeRecordType; root: unknown; at: Path; evaluate: (root: unknown) => ProgrammeEvaluationResult };
  const asDefinition = (root: unknown) => run({ definitions: [root], reviews: [] });
  const asReview = (root: unknown) => run({ reviews: [root] });
  const asCompletion = (root: unknown) => run({ completions: [root] });
  const asRequest = (root: unknown) => evaluateHealthProgrammes(root as never, hash);
  const entries: Entry[] = [
    { type: "request", root: requestOf({ health: [] }), at: [], evaluate: asRequest },
    { type: "query", root: requestOf({ health: [] }), at: ["query"], evaluate: asRequest },
    { type: "definition", root: DEF, at: [], evaluate: asDefinition },
    { type: "declarer", root: DEF, at: ["declaredBy"], evaluate: asDefinition },
    { type: "definitionProvenance", root: DEF, at: ["provenance"], evaluate: asDefinition },
    { type: "sourceDocument", root: DEF, at: ["provenance", "sourceDocument"], evaluate: asDefinition },
    { type: "fingerprint", root: DEF, at: ["provenance", "sourceDocument", "contentFingerprint"], evaluate: asDefinition },
    { type: "applicabilityExplicitSet", root: DEF, at: ["applicability"], evaluate: asDefinition },
    { type: "applicabilityGroup", root: groupDef, at: ["applicability"], evaluate: asDefinition },
    { type: "applicabilityCriteria", root: criteriaDef, at: ["applicability"], evaluate: asDefinition },
    { type: "action", root: looseDef, at: ["actions", 0], evaluate: asDefinition },
    { type: "productRef", root: looseDef, at: ["actions", 0, "productRef"], evaluate: asDefinition },
    { type: "schedule", root: DEF, at: ["actions", 0, "schedule"], evaluate: asDefinition },
    { type: "anchorDateOfBirth", root: DEF, at: ["actions", 0, "schedule", "anchor"], evaluate: asDefinition },
    { type: "anchorFixedInstant", root: fixedDef, at: ["actions", 0, "schedule", "anchor"], evaluate: asDefinition },
    { type: "window", root: DEF, at: ["actions", 0, "schedule", "window"], evaluate: asDefinition },
    { type: "offset", root: DEF, at: ["actions", 0, "schedule", "window", "opensAfter"], evaluate: asDefinition },
    { type: "repeat", root: DEF, at: ["actions", 0, "schedule", "repeat"], evaluate: asDefinition },
    { type: "completionCriteria", root: looseDef, at: ["actions", 0, "completion"], evaluate: asDefinition },
    { type: "review", root: REVIEWS[0], at: [], evaluate: asReview },
    { type: "reviewer", root: REVIEWS[0], at: ["reviewer"], evaluate: asReview },
    { type: "completion", root: declaration("d-1"), at: [], evaluate: asCompletion },
    { type: "completionProvenance", root: declaration("d-1"), at: ["provenance"], evaluate: asCompletion },
    { type: "evidenceDeclared", root: declaration("d-1"), at: ["evidence"], evaluate: asCompletion },
    { type: "evidenceHealthRecord", root: linkDeclaration, at: ["evidence"], evaluate: asCompletion },
  ];
  // Content rules that make an explicit `null` / `[]` invalid although the field's presence class allows it (documented, not silent).
  const CONTENT_RULES: Record<string, { null?: string; empty?: string }> = {
    "completion.evidence": { null: "a COMPLETION requires evidence (only a RETRACTION has none)" },
  };

  it("covers every policy record type and stays aligned with the canonical fixtures (drift guard)", () => {
    expect(new Set(entries.map((e) => e.type))).toEqual(new Set(Object.keys(PROGRAMME_FIELD_POLICY)));
    for (const e of entries) {
      const record = getAt(e.root, e.at) as Rec;
      expect(Object.keys(record).sort(), e.type).toEqual(Object.keys(PROGRAMME_FIELD_POLICY[e.type]).sort());
      expect(conformsToPolicy(record, e.type), e.type).toBe(true);
    }
    // The C7 contract publishes the same table.
    const contracts = readFileSync(join(__dirname, "../../../../docs/farm-return-next/DOMAIN_CONTRACTS.md"), "utf8");
    const section = contracts.slice(contracts.indexOf("**Field-presence policy"));
    for (const type of Object.keys(PROGRAMME_FIELD_POLICY)) expect(section, type).toContain(`\`${type}\``);
  });

  it("missing / undefined / null / [] / valid / malformed / unknown-field behave exactly as each field's policy declares", () => {
    const failures: string[] = [];
    for (const e of entries) {
      expect(e.evaluate(e.root).ok, `${e.type} valid baseline`).toBe(true);
      const policy = PROGRAMME_FIELD_POLICY[e.type] as Readonly<Record<string, ProgrammeFieldRule>>;
      const check = (label: string, root: unknown, expected: boolean) => {
        const r = e.evaluate(root);
        if (r.ok !== expected) failures.push(`${e.type}.${label}: expected ${expected ? "accepted" : "rejected"}`);
      };
      for (const [field, rule] of Object.entries(policy)) {
        const path = [...e.at, field];
        const rules = CONTENT_RULES[`${e.type}.${field}`] ?? {};
        check(`${field} missing`, withoutAt(e.root, path), false);
        check(`${field} undefined`, setAt(e.root, path, undefined), false);
        check(`${field} null`, setAt(e.root, path, null), rule === "REQUIRED_NULLABLE" && rules.null === undefined);
        check(`${field} []`, setAt(e.root, path, []), rule === "REQUIRED_ARRAY" && rules.empty === undefined);
        check(`${field} malformed object`, setAt(e.root, path, { "SYNTH-MALFORMED": true }), false);
        check(`${field} malformed number`, setAt(e.root, path, 42.5), false);
      }
      check("unknown field", setAt(e.root, [...e.at, "SYNTH-UNKNOWN-FIELD"], null), false);
    }
    expect(failures).toEqual([]);
  });

  it("explicit null / [] keep their contract meaning; the same meaning is never inferred from a missing property", () => {
    // gates: [] = explicitly no gates; missing = invalid (F005).
    expect(run({ definitions: [programme({ actions: [action({ gates: [] })] })], reviews: [] }).ok).toBe(true);
    const noGates = withoutAt(DEF, ["actions", 0, "gates"]);
    expect(codes(run({ definitions: [noGates] }))).toEqual(["CATTLE_PROGRAMME_DEFINITION_INVALID_ACTIONS"]);
    expect(codes(run({ definitions: [setAt(DEF, ["actions", 0, "gates"], null)] }))).toEqual(["CATTLE_PROGRAMME_DEFINITION_INVALID_ACTIONS"]);
    // productRef: null = no product restriction; missing = invalid (never "any product").
    expect(codes(run({ definitions: [withoutAt(looseDef, ["actions", 0, "productRef"])] }))).toEqual(["CATTLE_PROGRAMME_DEFINITION_INVALID_ACTIONS"]);
    // validTo: null = open-ended; missing = invalid (never open-ended).
    expect(codes(run({ definitions: [withoutAt(DEF, ["validTo"])] }))).toEqual(["CATTLE_PROGRAMME_DEFINITION_INVALID_CONTENT", "CATTLE_PROGRAMME_DEFINITION_INVALID_PERIOD"]);
    // repeat: null = one occurrence; missing = invalid.
    expect(codes(run({ definitions: [withoutAt(DEF, ["actions", 0, "schedule", "repeat"])] }))).toEqual(["CATTLE_PROGRAMME_DEFINITION_INVALID_ACTIONS"]);
    // A missing criterion never widens membership.
    expect(codes(run({ definitions: [withoutAt(criteriaDef, ["applicability", "bornBefore"])] }))).toEqual(["CATTLE_PROGRAMME_DEFINITION_INVALID_APPLICABILITY"]);
    // supersedes lists: [] = supersedes none; missing = invalid.
    expect(codes(run({ definitions: [withoutAt(DEF, ["supersedesVersions"])] }))).toEqual(["CATTLE_PROGRAMME_DEFINITION_INVALID_CONTENT"]);
    expect(codes(run({ reviews: [withoutAt(REVIEWS[0], ["supersedes"])] }))).toEqual(["CATTLE_PROGRAMME_REVIEW_INVALID_CONTENT"]);
    expect(codes(run({ completions: [withoutAt(declaration("d-1"), ["supersedes"])] }))).toEqual(["CATTLE_PROGRAMME_COMPLETION_INVALID_CONTENT"]);
    // The review fingerprint is computed only for a fully present definition.
    expect(computeProgrammeDefinitionFingerprint(noGates, hash)).toBeNull();
  });
});

describe("C7 closure B — every consumed predecessor record proves it belongs to this evaluation", () => {
  /** Re-seals a C3 projection exactly as C3 fingerprints it (adversary model: internally consistent, foreign content). */
  function resealHealth(p: AnimalHealthProjection): AnimalHealthProjection {
    const context = { animalId: p.animalId, effectiveAt: p.effectiveAt, knowledgeCutoff: p.knowledgeCutoff, snapshotFingerprint: p.snapshotFingerprint };
    const key = (t: string | null) => (t === null ? null : animalInstantKey(t));
    const entry = <E extends { occurredAt: string | null; record: Parameters<typeof semanticHealthRecord>[0] }>(e: E) => ({ ...e, occurredAt: key(e.occurredAt), record: semanticHealthRecord(e.record) });
    const { fingerprint: _t, ...timeline } = p.timeline;
    const { fingerprint: _l, ...ledger } = p.medicineLedger;
    const { fingerprint: _g, ...gate } = p.withdrawalGate;
    void [_t, _l, _g];
    const timelineFp = computeHealthFingerprint("CATTLE_HEALTH_TIMELINE", { ...context, knownRecordIds: p.knownRecordIds, ...timeline, entries: timeline.entries.map(entry) }, hash);
    const ledgerFp = computeHealthFingerprint("CATTLE_MEDICINE_LEDGER", { ...context, foodProducts: p.foodProducts, entries: ledger.entries.map(entry), productVersionsUsed: ledger.productVersionsUsed }, hash);
    const gateFp = computeHealthFingerprint("CATTLE_WITHDRAWAL_GATE", { ...context, foodProducts: p.foodProducts, medicineLedgerFingerprint: ledgerFp, entries: gate.entries }, hash);
    return {
      ...p,
      timeline: { ...timeline, fingerprint: timelineFp },
      medicineLedger: { ...ledger, fingerprint: ledgerFp },
      withdrawalGate: { ...gate, medicineLedgerFingerprint: ledgerFp, fingerprint: gateFp },
    };
  }

  it("C3: an outer projection for this animal never vouches for inner records of another animal, time or record (matrix)", () => {
    const genuine = healthFor([adm("h-1", "2026-03-15T00:00:00Z")]);
    // Control: the re-seal is faithful (an unmodified re-sealed projection is accepted).
    expect(verifyAnimalHealthProjection(resealHealth(structuredClone(genuine)), hash).valid).toBe(true);
    expect(run({ health: [resealHealth(structuredClone(genuine))] }).ok).toBe(true);
    type Mutable = { timeline: { entries: Rec[]; notYetOccurredRecordIds: string[] }; medicineLedger: { entries: Rec[] } };
    const variant = (change: (p: Mutable) => void) => {
      const p = structuredClone(genuine) as unknown as Mutable;
      change(p);
      return resealHealth(p as unknown as AnimalHealthProjection);
    };
    const record = (e: Rec) => e.record as Rec;
    const cases: [string, AnimalHealthProjection][] = [
      ["timeline record of another animal", variant((p) => (record(p.timeline.entries[0]).animalId = B))],
      ["ledger record of another animal", variant((p) => (record(p.medicineLedger.entries[0]).animalId = B))],
      ["timeline entry wraps another record id", variant((p) => (record(p.timeline.entries[0]).recordId = "h-other"))],
      ["ledger entry wraps another record id", variant((p) => (record(p.medicineLedger.entries[0]).recordId = "h-other"))],
      ["record unknown to the projection", variant((p) => { p.timeline.entries[0].recordId = "h-foreign"; record(p.timeline.entries[0]).recordId = "h-foreign"; })],
      ["record received after the cutoff", variant((p) => (record(p.timeline.entries[0]).provenance = { ...(record(p.timeline.entries[0]).provenance as Rec), receivedAt: "2027-06-01T00:00:00Z" }))],
      ["entry valid time differs from its record", variant((p) => (p.timeline.entries[0].occurredAt = "2026-03-16T00:00:00Z"))],
      ["timeline record after effectiveAt", variant((p) => { p.timeline.entries[0].occurredAt = "2026-05-01T00:00:00Z"; record(p.timeline.entries[0]).occurredAt = "2026-05-01T00:00:00Z"; })],
      ["entry kind differs from its record", variant((p) => (p.timeline.entries[0].kind = "VETERINARY_EVENT"))],
      ["duplicate timeline entry", variant((p) => p.timeline.entries.push(structuredClone(p.timeline.entries[0])))],
      ["duplicate ledger entry", variant((p) => p.medicineLedger.entries.push(structuredClone(p.medicineLedger.entries[0])))],
      ["not-yet-occurred id unknown", variant((p) => p.timeline.notYetOccurredRecordIds.push("h-unknown"))],
    ];
    for (const [label, projection] of cases) {
      const r = run({ health: [projection] });
      expect(codes(r), label).toEqual(["CATTLE_PROGRAMME_HEALTH_PROJECTION_FOREIGN_RECORD"]);
    }
  });

  it("C2: an envelope for this animal never vouches for records of another animal, snapshot, time, version or identity (matrix)", () => {
    const genuine = obligationEvaluation();
    const reseal = (r: AnimalObligationEvaluation["results"][number], change: Rec) => {
      const { fingerprint: _drop, ...content } = { ...r, ...change };
      void _drop;
      return { ...content, fingerprint: computeObligationFingerprint("CATTLE_OBLIGATION_STATE", content, hash) } as typeof r;
    };
    const other = obligationEvaluation(EFFECTIVE, ledgerOf(A, [dobOf(A), sexOf(A, "MALE")]));
    const [record] = genuine.results;
    const cases: [string, AnimalObligationEvaluation["results"]][] = [
      ["animal", [reseal(record, { animalId: B })]],
      ["snapshot", [reseal(record, { snapshotFingerprint: other.snapshotFingerprint })]],
      ["effectiveAt", [reseal(record, { effectiveAt: "2026-04-16T00:00:00.000000000Z" })]],
      ["knowledgeCutoff", [reseal(record, { knowledgeCutoff: "2026-12-30T00:00:00.000000000Z" })]],
      ["payload version", [reseal(record, { obligationPayloadVersion: genuine.obligationPayloadVersion + 1 })]],
      ["duplicate record identity", [record, record]],
    ];
    const mismatch = ["CATTLE_PROGRAMME_OBLIGATIONS_FOREIGN_RECORD", "CATTLE_PROGRAMME_OBLIGATIONS_INVALID"];
    for (const [label, results] of cases) {
      const r = run({ obligations: [{ ...genuine, results }] });
      expect(r.ok, label).toBe(false);
      for (const code of codes(r)) expect(mismatch, label).toContain(code);
    }
    // C7's own check (not only C2's) rejects the snapshot, payload-version and identity cases.
    for (const label of ["snapshot", "payload version", "duplicate record identity"]) {
      const results = cases.find(([l]) => l === label)![1];
      expect(codes(run({ obligations: [{ ...genuine, results }] })), label).toEqual(["CATTLE_PROGRAMME_OBLIGATIONS_FOREIGN_RECORD"]);
    }
  });
});

describe("C7 closure C — result dependency set equals result binding set", () => {
  const withdrawalRule = cattle.withdrawalGateRuleId(MEAT);
  const def = programme({ actions: [action({ gates: [OBL_RULE, withdrawalRule] })] });
  const baseLedger = [dobOf(A), sexOf(A), groupOf(A)];
  const baseHealth = [adm("h-1", "2026-04-11T00:00:00Z")];
  const baseCompletions = [vetDeclaration("d-1"), declaration("d-2", { occurrenceId: occId(1), evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-1" } })];
  const baseObligation = obligationEvaluation();
  type Parts = { definition: Rec; review: Rec | null; completions: Rec[]; ledger: Rec[]; health: Rec[]; obligationRecord: Rec };
  const base: Parts = { definition: def, review: null, completions: baseCompletions, ledger: baseLedger, health: baseHealth, obligationRecord: baseObligation.results[0] as unknown as Rec };

  /** Builds the request from canonical parts; predecessor outputs are regenerated by C1 / C3 / C2 (or re-sealed for a C2 record). `null` = rejected upstream. */
  function evaluate(parts: Parts): ProgrammeEvaluationResult | null {
    try {
      const ledger = createAnimalLedger(A, parts.ledger);
      if (!ledger.ok) return null;
      const health = healthFor(parts.health, { ledger: ledger.ledger });
      const sameLedger = parts.ledger === base.ledger;
      const obligation = sameLedger ? baseObligation : obligationEvaluation(EFFECTIVE, ledger.ledger, false);
      let results = obligation.results;
      if (parts.obligationRecord !== base.obligationRecord) {
        const { fingerprint: _drop, ...content } = parts.obligationRecord;
        void _drop;
        results = [{ ...content, fingerprint: computeObligationFingerprint("CATTLE_OBLIGATION_STATE", content, hash) } as unknown as (typeof results)[number]];
      }
      const bound = parts.review ?? (computeProgrammeDefinitionFingerprint(parts.definition, hash) === null ? REVIEWS[0] : review(parts.definition));
      return run({ definitions: [parts.definition], reviews: [bound], completions: parts.completions, ledgers: [ledger.ledger], health: [health], obligations: [{ ...obligation, results }] });
    } catch {
      return null;
    }
  }
  const resultOf = (r: ProgrammeEvaluationResult) => {
    const e = ok(r);
    const g = projectProgrammeHardGates(e, A, hash);
    if (!g.ok) throw new Error(JSON.stringify(g.issues));
    // No animal status (e.g. the programme is no longer in force) is itself a distinct result.
    const animal = e.programmes[0]?.animals.find((a) => a.animalId === A);
    return { evaluation: e.fingerprint.digest, animal: animal?.fingerprint.digest ?? "NO_ANIMAL_STATUS", gates: canonicalizeValue(g.gates.ruleEvaluations) };
  };

  type Leaf = { path: Path; value: unknown };
  const leavesOf = (v: unknown, path: Path = []): Leaf[] =>
    Array.isArray(v)
      ? v.length === 0
        ? [{ path, value: v }]
        : v.flatMap((x, i) => leavesOf(x, [...path, i]))
      : v !== null && typeof v === "object"
        ? Object.entries(v).flatMap(([k, x]) => leavesOf(x, [...path, k]))
        : [{ path, value: v }];
  const ENUM_GROUPS: readonly (readonly string[])[] = [
    PROGRAMME_CLASSIFICATIONS,
    PROGRAMME_DECLARER_ROLES,
    PROGRAMME_ANCHOR_KINDS,
    PROGRAMME_WINDOW_BOUNDARIES,
    PROGRAMME_COMPLETION_RECORD_KINDS,
    ANIMAL_DATA_SOURCE_CATEGORIES,
    ["HARD_GATE", "ADVISORY"],
    ["RESEARCH", "DRAFT", "VALIDATED", "APPROVED", "PRODUCTION", "SUPERSEDED", "BLOCKED"],
    ["APPROVED", "REJECTED"],
    ["COMPLETION", "RETRACTION"],
    ["DECLARED", "HEALTH_RECORD"],
    ["DAY", "HOUR"],
    ["FEMALE", "MALE"],
  ];
  /** Material, plausibly valid alternatives for one leaf (never an equivalent spelling). */
  function candidates(value: unknown): unknown[] {
    if (Array.isArray(value)) return [["SYNTH-MUT"]];
    if (typeof value === "boolean") return [!value];
    if (typeof value === "number") return [value + 1, value * 2, value - 1];
    if (value === null) return ["SYNTH-MUT", "2026-02-01T00:00:00Z", "2026-02-01"];
    const s = String(value);
    if (isValidAnimalInstant(value)) return [addObligationOffset(value, { amount: 1, unit: "HOUR" })];
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return [s === "2026-03-02" ? "2026-03-03" : "2026-03-02"];
    if (/^[0-9a-f]{64}$/.test(s)) return [`${s[0] === "0" ? "1" : "0"}${s.slice(1)}`];
    if (/^[A-Z][A-Z_]*$/.test(s)) return [...new Set(ENUM_GROUPS.filter((g) => g.includes(s)).flat())].filter((x) => x !== s).concat(`${s}_MUT`);
    return [`${s}-MUT`];
  }
  /**
   * Documented NON-DEPENDENCIES: canonical input leaves that do not affect
   * the C7 results, each with its reason. Any other leaf whose material
   * change is accepted must change every C7 result fingerprint.
   */
  const NON_DEPENDENCIES: { part: keyof Parts; path: RegExp; reason: string }[] = [];

  it("every material change to a dependency leaf changes the evaluation, animal-status and hard-gate results (or fails closed)", () => {
    const before = resultOf(evaluate(base)!);
    const unbound: string[] = [];
    const counts = { changed: 0, rejected: 0, excluded: 0 };
    const roots: [keyof Parts, unknown][] = [
      ["definition", base.definition],
      ["review", review(def)],
      ["completions", base.completions],
      ["ledger", base.ledger],
      ["health", base.health],
      ["obligationRecord", base.obligationRecord],
    ];
    for (const [part, root] of roots) {
      for (const leaf of leavesOf(root)) {
        if (part === "obligationRecord" && leaf.path[0] === "fingerprint") continue; // re-sealed, not an input
        const excluded = NON_DEPENDENCIES.find((n) => n.part === part && n.path.test(leaf.path.join(".")));
        let accepted = 0;
        for (const candidate of candidates(leaf.value)) {
          const parts = { ...base, [part]: setAt(root, leaf.path, candidate) };
          const r = evaluate(parts);
          if (r === null || !r.ok) continue;
          accepted++;
          const after = resultOf(r);
          const label = `${part}.${leaf.path.join(".")} → ${JSON.stringify(candidate)}`;
          const changed = after.evaluation !== before.evaluation && after.animal !== before.animal && after.gates !== before.gates;
          if (excluded ? after.evaluation !== before.evaluation : !changed) unbound.push(label);
        }
        if (excluded) counts.excluded++;
        else if (accepted === 0) counts.rejected++;
        else counts.changed++;
      }
    }
    expect(unbound).toEqual([]);
    // The guard exercises the binding, not only rejection.
    expect(counts.changed).toBeGreaterThan(140);
  }, 120_000);

  it("equivalent instant spellings and input order never change a result fingerprint", () => {
    const before = resultOf(evaluate(base)!);
    const respell = (root: unknown) =>
      leavesOf(root)
        .filter((l) => typeof l.value === "string" && isValidAnimalInstant(l.value))
        .reduce((acc, l) => setAt(acc, l.path, equivalentInstantSpellings(l.value as string).find((x) => x !== l.value)), root);
    expect(resultOf(evaluate({ ...base, definition: respell(base.definition) as Rec })!)).toEqual(before);
    expect(resultOf(evaluate({ ...base, review: respell(review(def)) as Rec })!)).toEqual(before);
    expect(resultOf(evaluate({ ...base, completions: respell(base.completions) as Rec[] })!)).toEqual(before);
    expect(resultOf(evaluate({ ...base, health: respell(base.health) as Rec[] })!)).toEqual(before);
    expect(resultOf(evaluate({ ...base, completions: [...base.completions].reverse() })!)).toEqual(before);
    expect(resultOf(evaluate({ ...base, ledger: [...base.ledger].reverse() })!)).toEqual(before);
    // Not covered: C1 ledger instant spellings — the frozen C1 snapshot fingerprint is representation-sensitive (FINGERPRINTS.md).
  });
});

describe("C7 closure D — ordering independence over every authoritative input array", () => {
  it("reversing any request array (two animals, two programmes) leaves the evaluation identical", () => {
    const farmer = farmerProgramme({ applicability: { kind: "EXPLICIT_SET", animalIds: [A, B] } });
    const bHealth = healthFor([], { ledger: LEDGER_B });
    const request = requestOf({
      definitions: [DEF, farmer],
      reviews: [...REVIEWS, review(farmer)],
      completions: [vetDeclaration("d-1"), declaration("d-2", { occurrenceId: occId(1) }), declaration("d-3", { animalId: B, programmeId: "SYNTH-PROGRAMME-FARMER", occurrenceId: occId(0, B, ACT, "SYNTH-PROGRAMME-FARMER") })],
      ledgers: [LEDGER_A, LEDGER_B],
      health: [healthFor([adm("h-1", "2026-03-15T00:00:00Z")]), bHealth],
      obligations: [obligationEvaluation(), obligationEvaluation(EFFECTIVE, LEDGER_B, false)],
    });
    const baseline = evaluateHealthProgrammes(request as never, hash);
    expect(baseline.ok).toBe(true);
    for (const key of ["definitions", "reviews", "completions", "ledgers", "health", "obligations"]) {
      const reordered = { ...request, [key]: [...(request[key] as unknown[])].reverse() };
      expect(evaluateHealthProgrammes(reordered as never, hash), key).toEqual(baseline);
    }
  });
});

describe("C7 closure E — identifier collision matrix", () => {
  const adversarial: [string, string][] = [
    ["SYNTH-P|SYNTH-Q", "SYNTH-R"],
    ["SYNTH-P", "SYNTH-Q|SYNTH-R"],
    ["SYNTH-P@SYNTH-Q", "SYNTH-R"],
    ["SYNTH-P", "SYNTH-Q@SYNTH-R"],
    ["SYNTH-P.SYNTH-Q", "SYNTH-R"],
    ["SYNTH-P", "SYNTH-Q.SYNTH-R"],
    ['SYNTH-P","SYNTH-Q', "SYNTH-R"],
    ["SYNTH-P", 'SYNTH-Q","SYNTH-R'],
  ];
  it("occurrence ids, gate rule ids, issue refs and gate missing-input refs never collapse distinct identities", () => {
    const occurrenceIds = adversarial.map(([p, a]) => programmeOccurrenceId(p, a, A, "DATE_OF_BIRTH", ANCHOR, 0));
    expect(new Set(occurrenceIds).size).toBe(adversarial.length);
    expect(new Set(adversarial.map(([p, a]) => programmeOccurrenceId(p, "SYNTH-ACT", a, "FIXED_INSTANT", ANCHOR, 1))).size).toBe(adversarial.length);
    expect(new Set(adversarial.map(([p, a]) => programmeGateRuleId(p, a))).size).toBe(adversarial.length);
    // Issue refs: invalid definitions with colliding display text stay distinct issues.
    const invalid = adversarial.map(([p, v]) => programme({ programmeId: p, version: v, actions: [] }));
    const r = run({ definitions: invalid, reviews: [] });
    expect(new Set(r.ok ? [] : r.issues.map((i) => i.ref)).size).toBe(adversarial.length);
    expect(uniqueProgrammeIssues([{ code: "X", ref: "a\u0000b" }, { code: "b\u0000X", ref: "a" }])).toHaveLength(2);
  });

  it("programmes whose ids collide under joined text keep separate occurrences, declarations and gates through the C0 pack", () => {
    const defs = adversarial.slice(0, 2).map(([p, a]) => programme({ programmeId: p, actions: [action({ actionId: a })] }));
    const completions = adversarial.slice(0, 2).map(([p, a], i) => vetDeclaration(`d-${i}`, { programmeId: p, actionId: a, occurrenceId: programmeOccurrenceId(p, a, A, "DATE_OF_BIRTH", ANCHOR, 0) }));
    const e = ok(run({ definitions: defs, reviews: defs.map((d) => review(d)), completions: [completions[0]] }));
    const [first, second] = adversarial.slice(0, 2).map(([p]) => e.programmes.find((x) => x.programmeId === p)!.animals[0]);
    expect(first.records[0].state).toBe("COMPLETED");
    expect(second.records[0].state).toBe("OVERDUE");
    expect(second.unmatchedDeclarationIds).toEqual([]);
    const g = projectProgrammeHardGates(e, A, hash);
    if (!g.ok) throw new Error(JSON.stringify(g.issues));
    const missing = g.gates.ruleEvaluations.flatMap((x) => x.missingInputs);
    expect(new Set(missing).size).toBe(missing.length);
    for (const x of g.gates.ruleEvaluations) expect(x.missingInputs.every((m) => m === x.requestedRuleId)).toBe(true);
  });
});

describe("C7 closure F — veterinary completion safety (decision B2)", () => {
  const gateState = (r: ProgrammeEvaluationResult) => {
    const g = projectProgrammeHardGates(ok(r), A, hash);
    if (!g.ok) throw new Error(JSON.stringify(g.issues));
    return g.gates.ruleEvaluations[0].state;
  };
  it("a FARMER declaration alone never makes a VETERINARY_PROGRAMME HARD_GATE pass; it is retained as evidence", () => {
    const farmerOnly = run({ completions: [declaration("d-1")] });
    expect(occurrenceState(farmerOnly, 0)).toBe("REVIEW_REQUIRED");
    expect(animalOf(farmerOnly).records[0].reasonCodes).toEqual(["CATTLE_PROGRAMME_FARMER_DECLARATION_NEEDS_VETERINARY_CONFIRMATION"]);
    expect(animalOf(farmerOnly).records[0].completion?.counted).toEqual([expect.objectContaining({ basis: "DECLARATION", declaredBy: "FARMER", declarationId: "d-1" })]);
    expect(gateState(farmerOnly)).not.toBe("PASS");
    const farmerLink = run({ health: [healthFor([adm("h-1", "2026-03-15T00:00:00Z")])], definitions: [programme({ actions: [action({ completion: { recordKind: "MEDICINE_ADMINISTRATION", eventTypes: null, matchCriteria: false } })] })], reviews: [review(programme({ actions: [action({ completion: { recordKind: "MEDICINE_ADMINISTRATION", eventTypes: null, matchCriteria: false } })] }))], completions: [declaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-1" } })] });
    expect(occurrenceState(farmerLink, 0)).toBe("REVIEW_REQUIRED");
    expect(gateState(farmerLink)).not.toBe("PASS");
  });
  it("veterinarian declarations, C3 records matching declared criteria, advisory actions and farmer programmes are unaffected", () => {
    expect(occurrenceState(run({ completions: [vetDeclaration("d-1")] }), 0)).toBe("COMPLETED");
    expect(occurrenceState(run({ completions: [declaration("d-1"), vetDeclaration("d-2")] }), 0)).toBe("COMPLETED");
    expect(occurrenceState(run({ completions: [declaration("d-1")], health: [healthFor([adm("h-1", "2026-03-15T00:00:00Z")])] }), 0)).toBe("COMPLETED");
    const advisory = programme({ actions: [action({ gateRole: "ADVISORY" })] });
    expect(occurrenceState(run({ definitions: [advisory], reviews: [review(advisory)], completions: [declaration("d-1")] }), 0)).toBe("COMPLETED");
    const farmer = farmerProgramme();
    const r = run({ definitions: [farmer], reviews: [], completions: [declaration("d-1", { programmeId: "SYNTH-PROGRAMME-FARMER", occurrenceId: occId(0, A, ACT, "SYNTH-PROGRAMME-FARMER") })] });
    expect(states(r, A, "SYNTH-PROGRAMME-FARMER")[0]).toBe("COMPLETED");
  });
});
