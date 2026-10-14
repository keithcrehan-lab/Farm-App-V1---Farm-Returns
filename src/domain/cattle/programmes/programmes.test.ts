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
import { computeHealthFingerprint, projectAnimalHealth, semanticHealthRecord, type AnimalHealthProjection } from "../health";
import { addObligationOffset } from "../regulatory/obligation-time";
import { resolveGroupScope } from "../weights";
import { createObligationImplementationRegistry, evaluateAnimalObligations, obligationTermsMarker, type AnimalObligationEvaluation, type ObligationDefinition } from "../regulatory";
import { uniqueProgrammeIssues } from "./programme-definition";
import { PROGRAMME_FIELD_POLICY, conformsToPolicy, type ProgrammeFieldRule, type ProgrammeRecordType } from "./programme-fields";
import { C1_SNAPSHOT, C2_EVALUATION, C3_PROJECTION, C4_SCOPE, GATE_PROJECTION, valid, type ConsumedHealthProjection, type ConsumedMedicineEntry, type ConsumedObligationEvaluation, type FieldSpec } from "./programme-consumed";
import { fromC1Resolution, fromC3Binding, fromC4Membership } from "./programme-evidence";
import { computeAnimalSnapshotFingerprint, projectAnimalSnapshot } from "../animal-snapshot";
import { evaluateHerdObligations, projectObligationHardGates } from "../regulatory";
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
  foldProgrammeStates,
  programmeGateRuleId,
  programmeOccurrenceId,
  projectProgrammeHardGates,
  verifyProgrammeStatusEvaluation,
  type ProgrammeAnimalStatus,
  type ProgrammeEvaluationResult,
  type ProgrammeStatusEvaluation,
} from "./index";

type Rec = Record<string, unknown>;
const compareStringsForTest = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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
const vetDeclaration = (recordId: string, overrides: Rec = {}) =>
  declaration(recordId, {
    declaredBy: { role: "VETERINARIAN", actor: "SYNTH-VET-1" },
    provenance: { sourceCategory: "VETERINARY_SOURCE", sourceSystem: null, sourceRecordRef: null, receivedAt: "2026-03-16T00:00:00Z" },
    ...overrides,
  });

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
/** An administration recorded by a veterinary source (VETERINARY_SOURCE provenance, actor VETERINARIAN). */
const vetAdm = (recordId: string, occurredAt: string | null, fields: Rec = {}, animalId = A): Rec =>
  adm(recordId, occurredAt, { provenance: { sourceCategory: "VETERINARY_SOURCE", actorRole: "VETERINARIAN", actor: "SYNTH-VET-1", receivedAt: "2026-03-01T00:00:00Z" }, ...fields }, animalId);
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

const DEFAULT_PRODUCTS = [product(), product("SYNTH-PRODUCT-2")];

/** One animal's canonical C3 evidence (C7 composes it through C3 `projectAnimalHealth`). */
interface HealthInput {
  animalId: string;
  records: Rec[];
  products: Rec[];
}
function healthFor(records: Rec[], o: { ledger?: AnimalLedger; products?: Rec[] } = {}): HealthInput {
  return { animalId: (o.ledger?.animalId as string | undefined) ?? A, records, products: o.products ?? DEFAULT_PRODUCTS };
}

/** The authoritative C3 projection of canonical evidence (for schema tests of C3 output only — never a C7 input). */
function c3ProjectionFor(records: Rec[], o: { ledger?: AnimalLedger; products?: Rec[] } = {}): AnimalHealthProjection {
  const result = projectAnimalHealth(
    { ledger: o.ledger ?? LEDGER_A, healthRecords: records, productRecords: o.products ?? DEFAULT_PRODUCTS, query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, foodProducts: [MEAT] } } as never,
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
  /** Canonical C3 evidence per animal. Default: animal A with `healthRecords` (none). `[]` = no C3 evidence supplied. */
  health?: HealthInput[];
  healthRecords?: Rec[];
  /** Canonical C2 evidence per animal (`obligationEvidenceFor`). Default / `[]`: none supplied. */
  obligations?: ObligationInput[];
  effectiveAt?: string;
  knowledgeCutoff?: string;
}

const DEF = programme();
const REVIEWS = [review(DEF)];

/** The raw canonical request a `Run` describes. */
function requestOf(o: Run = {}): Rec {
  const health = o.health ?? [healthFor(o.healthRecords ?? [])];
  const obligations = o.obligations ?? [];
  return {
    definitions: o.definitions ?? [DEF],
    reviews: o.reviews ?? REVIEWS,
    completions: o.completions ?? [],
    ledgers: o.ledgers ?? [LEDGER_A],
    health: health.length === 0 ? null : { foodProducts: [MEAT], productRecords: health[0].products, animals: health.map((h) => ({ animalId: h.animalId, healthRecords: h.records })) },
    obligations: obligations.length === 0 ? null : { catalogue: OBL_CATALOGUE, obligationIds: [OBL], evidence: obligations.flatMap((x) => x.evidence) },
    query: { effectiveAt: o.effectiveAt ?? EFFECTIVE, knowledgeCutoff: o.knowledgeCutoff ?? CUTOFF },
  };
}
function run(o: Run = {}): ProgrammeEvaluationResult {
  return evaluateHealthProgrammes(requestOf(o) as never, hash, { obligationImplementations: OBL_IMPLEMENTATIONS });
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
    const health = healthFor([vetAdm("h-1", "2026-03-15T00:00:00Z")]);
    const r = run({ health: [health] });
    expect(states(r)).toEqual(["COMPLETED", "DUE", "UPCOMING"]);
    expect(animalOf(r).records[0].completion?.counted).toEqual([
      { basis: "DECLARED_CRITERIA", authority: "VETERINARY", declaredBy: null, recordProvenance: { sourceCategory: "VETERINARY_SOURCE", actorRole: "VETERINARIAN" }, declarationId: null, healthRecordId: "h-1", completedAt: "2026-03-15T00:00:00.000000000Z", timing: "IN_WINDOW" },
    ]);
    // Provenance: C7 binds the fingerprint of the AUTHORITATIVE C3 projection of the same canonical evidence.
    expect(animalOf(r).inputs.health?.timeline).toEqual(c3ProjectionFor(health.records).timeline.fingerprint);
  });

  it("a mismatched product never completes (no fuzzy matching)", () => {
    const r = run({ health: [healthFor([adm("h-1", "2026-03-15T00:00:00Z", { productId: "SYNTH-PRODUCT-2" })])] });
    expect(occurrenceState(r, 0)).toBe("OVERDUE");
    const linked = run({
      health: [healthFor([adm("h-1", "2026-03-15T00:00:00Z", { productId: "SYNTH-PRODUCT-2" })])],
      completions: [declaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-1" } })],
    });
    expect(occurrenceState(linked, 0)).toBe("OVERDUE");
    expect(animalOf(linked).records[0].completion?.mismatched).toEqual([{ refKind: "DECLARATION", ref: "d-1", reason: "CATTLE_PROGRAMME_PRODUCT_MISMATCH" }]);
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
    expect(animalOf(r).records[1].completion?.mismatched).toEqual([{ refKind: "DECLARATION", ref: "d-2", reason: "CATTLE_PROGRAMME_EVENT_TYPE_MISMATCH" }]);
  });

  it("completion by declaration (veterinarian or farmer), version-bound", () => {
    const r = run({ completions: [vetDeclaration("d-1")] });
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
    expect(animalOf(r).records[0].completion?.conflictingDeclarationIds).toEqual(["d-2", "d-3"]);
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
    expect(record.completion?.unresolved).toEqual([{ refKind: "DECLARATION", ref: "d-2", reason: "CATTLE_PROGRAMME_LINKED_RECORD_NOT_KNOWN", outcome: "INSUFFICIENT_EVIDENCE" }]);
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
    const evaluation = obligationEvidenceFor();
    const r = run({ ...gated([OBL_RULE]), obligations: [evaluation] });
    expect(states(r)).toEqual(["BLOCKED", "BLOCKED", "UPCOMING"]);
    expect(animalOf(r).records[0].gates).toEqual([{ ruleId: OBL_RULE, state: "FAIL", source: "C2_OBLIGATION", blocking: true }]);
    expect(animalOf(r).inputs.obligationRecords).toHaveLength(1);
    const done = run({ ...gated([OBL_RULE]), obligations: [evaluation], completions: [vetDeclaration("d-1")] });
    expect(states(done)).toEqual(["COMPLETED", "BLOCKED", "UPCOMING"]);
  });

  it("canonical C2 / C3 evidence is interpreted only by its own frozen engine; evidence that engine rejects fails the request closed", () => {
    const health = (animals: { animalId: string; healthRecords: unknown[] }[], foodProducts: string[] = [MEAT]) => ({ foodProducts, productRecords: DEFAULT_PRODUCTS, animals });
    const raw = (patch: Rec) => evaluateHealthProgrammes({ ...requestOf(), ...patch } as never, hash, { obligationImplementations: OBL_IMPLEMENTATIONS });
    // C3 rejects a record of another animal in A's evidence, a malformed record and an empty food-product query.
    expect(codes(raw({ health: health([{ animalId: A, healthRecords: [adm("h-x", "2026-03-15T00:00:00Z", {}, B)] }]) }))).toEqual(["CATTLE_PROGRAMME_HEALTH_EVIDENCE_INVALID"]);
    expect(codes(raw({ health: health([{ animalId: A, healthRecords: [{ recordId: "h-x" }] }]) }))).toEqual(["CATTLE_PROGRAMME_HEALTH_EVIDENCE_INVALID"]);
    expect(codes(raw({ health: health([{ animalId: A, healthRecords: [] }], []) }))).toEqual(["CATTLE_PROGRAMME_HEALTH_EVIDENCE_INVALID"]);
    expect(codes(raw({ health: health([{ animalId: B, healthRecords: [] }]) }))).toEqual(["CATTLE_PROGRAMME_HEALTH_EVIDENCE_UNKNOWN_ANIMAL"]);
    expect(codes(raw({ health: health([{ animalId: A, healthRecords: [] }, { animalId: A, healthRecords: [] }]) }))).toEqual(["CATTLE_PROGRAMME_HEALTH_EVIDENCE_DUPLICATE_ANIMAL"]);
    // C2: the trusted registry is required and must be C2's own; evidence for an unevaluated animal is rejected by C2.
    const obligations = { catalogue: OBL_CATALOGUE, obligationIds: [OBL], evidence: [] };
    expect(codes(evaluateHealthProgrammes({ ...requestOf(), obligations } as never, hash))).toEqual(["CATTLE_PROGRAMME_OBLIGATION_IMPLEMENTATIONS_MISSING"]);
    expect(raw({ obligations }).ok).toBe(true);
    const def = programme({ actions: [action({ gates: [OBL_RULE] })] });
    // A registry C2 did not create is C2's to judge: never a PASS gate.
    const forgedRegistry = evaluateHealthProgrammes({ ...requestOf({ definitions: [def], reviews: [review(def)] }), obligations } as never, hash, { obligationImplementations: { implementations: [] } as never });
    expect(forgedRegistry.ok ? animalOf(forgedRegistry).records[0].gates.map((g) => g.state) : ["REJECTED"]).not.toContain("PASS");
    // A malformed catalogue is C2's to judge: C2 yields fail-closed obligation states, never a PASS gate.
    const broken = evaluateHealthProgrammes({ ...requestOf({ definitions: [def], reviews: [review(def)] }), obligations: { ...obligations, catalogue: { ...OBL_CATALOGUE, definitions: [{ obligationId: OBL }] } } } as never, hash, { obligationImplementations: OBL_IMPLEMENTATIONS });
    expect(codes(broken)).toEqual(["CATTLE_PROGRAMME_OBLIGATION_EVIDENCE_INVALID"]);
  });
});

// Synthetic C2 hard-gate obligation (no legal meaning): DOB anchor, window opens +1 DAY, due +10 DAY.
const OBL = "SYNTH-OBLIGATION-1";
const OBL_RULE = "SYNTH-RULE-OBLIGATION";
const OBL_IMPL = impl(() => "PASS", "SYNTH-IMPL-OBLIGATION");
const OBL_DEFINITION: ObligationDefinition = {
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
const OBL_RULE_VERSION = synthRule({ ruleId: OBL_RULE, version: 1, requiredInputs: [], implementation: bindTo(OBL_IMPL), assumptions: ["synthetic assumption", obligationTermsMarker(OBL_DEFINITION, hash)] });
/** The synthetic C2 catalogue (canonical C2 input). */
const OBL_CATALOGUE = { definitions: [OBL_DEFINITION], ruleVersions: [OBL_RULE_VERSION], sources: CATALOGUE, reviews: approveRule(OBL_RULE_VERSION) };
/** The trusted C2 implementation registry (never request data). */
const OBL_IMPLEMENTATIONS = createObligationImplementationRegistry([OBL_IMPL]);

/** One animal's canonical C2 evidence (C7 composes it through C2 `evaluateHerdObligations`). */
interface ObligationInput {
  animalId: string;
  evidence: Rec[];
}
function obligationEvidenceFor(ledger: AnimalLedger = LEDGER_A, evidence: Rec[] = []): ObligationInput {
  return { animalId: ledger.animalId as string, evidence };
}

/** The authoritative C2 evaluation of canonical evidence (for schema tests of C2 output only — never a C7 input). */
function c2EvaluationFor(ledger: AnimalLedger = LEDGER_A): AnimalObligationEvaluation {
  const result = evaluateAnimalObligations(
    { ledger, evidence: [], catalogue: OBL_CATALOGUE, implementations: OBL_IMPLEMENTATIONS, query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, obligationIds: [OBL] } },
    hash,
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
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
    const health = healthFor([vetAdm("h-1", "2026-03-15T00:00:00Z"), vetAdm("h-2", "2026-04-11T00:00:00Z")]);
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
  const asRequest = (root: unknown) => evaluateHealthProgrammes(root as never, hash, { obligationImplementations: OBL_IMPLEMENTATIONS });
  const entries: Entry[] = [
    { type: "request", root: requestOf({ health: [] }), at: [], evaluate: asRequest },
    { type: "query", root: requestOf({ health: [] }), at: ["query"], evaluate: asRequest },
    { type: "healthEvidence", root: requestOf(), at: ["health"], evaluate: asRequest },
    { type: "healthAnimal", root: requestOf(), at: ["health", "animals", 0], evaluate: asRequest },
    { type: "obligationEvidence", root: requestOf({ obligations: [obligationEvidenceFor()] }), at: ["obligations"], evaluate: asRequest },
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
    "healthEvidence.foodProducts": { empty: "C3 itself requires at least one food product to gate (C3 query contract)" },
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
    // Canonical predecessor evidence: `null` = none supplied; a missing field is invalid, never "none".
    expect(codes(evaluateHealthProgrammes(withoutAt(requestOf(), ["health"]) as never, hash))).toEqual(["CATTLE_PROGRAMME_INVALID_REQUEST"]);
    expect(evaluateHealthProgrammes({ ...requestOf(), health: null } as never, hash).ok).toBe(true);
    // The review fingerprint is computed only for a fully present definition.
    expect(computeProgrammeDefinitionFingerprint(noGates, hash)).toBeNull();
  });
});

describe("C7 composition boundary — derived predecessor outputs are never authoritative input (F003 / F007 / F008 class)", () => {
  const withdrawalRule = cattle.withdrawalGateRuleId(MEAT);
  const def = programme({ actions: [action({ gates: [withdrawalRule] })] });
  // A live veterinary-recorded administration of ANOTHER product holds meat in withdrawal at effectiveAt (it does not complete the action).
  const RECORDS = [vetAdm("h-x", "2026-04-12T00:00:00Z", { productId: "SYNTH-PRODUCT-2" })];
  const base: Run = { definitions: [def], reviews: [review(def)], health: [healthFor(RECORDS)] };
  const gateOf = (r: ProgrammeEvaluationResult) => animalOf(r).records[1].gates.find((g) => g.ruleId === withdrawalRule)?.state;
  const genuine = c3ProjectionFor(RECORDS);
  type P = { timeline: { entries: Rec[] }; medicineLedger: { entries: Rec[] }; withdrawalGate: { entries: Rec[] }; knownRecordIds: string[] };
  const forge = (change: (p: P) => void) => {
    const p = structuredClone(genuine) as unknown as P;
    change(p);
    return resealHealth(p as unknown as AnimalHealthProjection); // fingerprints recomputed: integrity checks would pass
  };
  const stale = projectAnimalHealth({ ledger: LEDGER_A, healthRecords: RECORDS, productRecords: DEFAULT_PRODUCTS, query: { effectiveAt: "2026-05-30T00:00:00Z", knowledgeCutoff: CUTOFF, foodProducts: [MEAT] } } as never, hash);
  const FORGED: Record<string, unknown> = {
    "F008: gate CLEAR, administration and product versions omitted": forge((p) => Object.assign(p.withdrawalGate.entries[0], { state: "CLEAR", inWithdrawalUntil: null, administrationIds: [], productVersions: [] })),
    "omitted product version only": forge((p) => (p.withdrawalGate.entries[0].productVersions = [])),
    "omitted administration from every view": forge((p) => ((p.timeline.entries = []), (p.medicineLedger.entries = []), (p.knownRecordIds = []), Object.assign(p.withdrawalGate.entries[0], { state: "CLEAR", inWithdrawalUntil: null, administrationIds: [], productVersions: [] }))),
    "added fabricated administration": forge((p) => (p.withdrawalGate.entries[0].administrationIds as string[]).push("h-fabricated")),
    "mutated gate state only (self-contradictory)": forge((p) => (p.withdrawalGate.entries[0].state = "CLEAR")),
    "internally inconsistent status": forge((p) => (p.timeline.entries[0].status = "SUPERSEDED")),
    "stale (computed at another effectiveAt)": stale.ok ? stale.projection : null,
    "genuine projection (unaltered)": genuine,
  };

  it("F008 and every forged / stale / re-sealed / inconsistent derived C3 output: no injection position can make C7 see it", () => {
    const baseline = run(base);
    expect(states(baseline)).toEqual(["BLOCKED", "BLOCKED", "UPCOMING"]);
    expect(gateOf(baseline)).toBe("FAIL");
    const request = requestOf(base);
    const healthEvidence = request.health as { productRecords: unknown[]; animals: { animalId: string; healthRecords: unknown[] }[] };
    const failures: string[] = [];
    for (const [label, forged] of Object.entries(FORGED)) {
      const positions: Record<string, Rec> = {
        "as the old derived-output field": { ...request, health: [forged] },
        "as the health evidence object": { ...request, health: forged },
        "as an extra request field": { ...request, healthProjection: forged },
        "smuggled among the canonical health records": { ...request, health: { ...healthEvidence, animals: [{ animalId: A, healthRecords: [...RECORDS, forged] }] } },
        "smuggled among the canonical product records": { ...request, health: { ...healthEvidence, productRecords: [...healthEvidence.productRecords, forged] } },
        "as the obligation evidence": { ...request, obligations: forged },
      };
      for (const [position, req] of Object.entries(positions)) {
        const r = evaluateHealthProgrammes(req as never, hash, { obligationImplementations: OBL_IMPLEMENTATIONS });
        // Either rejected outright, or C7's behaviour is exactly the genuine one — never the forged CLEAR / PASS.
        if (r.ok && (canonicalizeValue(states(r)) !== canonicalizeValue(states(baseline)) || gateOf(r) !== "FAIL")) failures.push(`${label} ${position}: ${JSON.stringify(states(r))} gate ${gateOf(r)}`);
      }
    }
    expect(failures).toEqual([]);
    // The derived-output request shape no longer exists.
    expect(codes(evaluateHealthProgrammes({ ...request, health: [genuine] } as never, hash))).toEqual(["CATTLE_PROGRAMME_INVALID_REQUEST"]);
    expect(codes(evaluateHealthProgrammes({ ...request, obligations: [c2EvaluationFor()] } as never, hash, { obligationImplementations: OBL_IMPLEMENTATIONS }))).toEqual(["CATTLE_PROGRAMME_INVALID_REQUEST"]);
  });

  it("only genuine canonical evidence changes the authoritative C3 result (and therefore C7)", () => {
    expect(gateOf(run({ ...base, health: [healthFor([])] }))).toBe("PASS"); // no administration recorded ⇒ C3 computes CLEAR
    expect(gateOf(run({ ...base, health: [healthFor([vetAdm("h-x", "2026-03-01T00:00:00Z", { productId: "SYNTH-PRODUCT-2" })])] }))).toBe("PASS"); // withdrawal ended
    expect(gateOf(run(base))).toBe("FAIL");
    // C2 likewise: genuine fulfilment evidence is C2's to judge; a forged SATISFIED record is not evidence.
    const def2 = programme({ actions: [action({ gates: [OBL_RULE] })] });
    const c2 = (evidence: Rec[]) => animalOf(run({ definitions: [def2], reviews: [review(def2)], obligations: [obligationEvidenceFor(LEDGER_A, evidence)] })).records[0].gates.map((g) => g.state);
    expect(c2([])).toEqual(["FAIL"]);
    const forgedRecord = { ...(c2EvaluationFor().results[0] as unknown as Rec), state: "SATISFIED" };
    const r = run({ definitions: [def2], reviews: [review(def2)], obligations: [obligationEvidenceFor(LEDGER_A, [forgedRecord])] });
    expect(r.ok ? animalOf(r).records[0].gates.map((g) => g.state) : ["REJECTED"]).not.toContain("PASS");
  });

  it("determinism and provenance: the same canonical evidence gives the same result, bound to the authoritative predecessor fingerprints", () => {
    const def2 = programme({ actions: [action({ gates: [withdrawalRule, OBL_RULE] })] });
    const o: Run = { definitions: [def2], reviews: [review(def2)], health: [healthFor([...RECORDS, vetAdm("h-1", "2026-03-15T00:00:00Z")])], obligations: [obligationEvidenceFor()] };
    const first = ok(run(o));
    expect(ok(run(o))).toEqual(first);
    expect(ok(run({ ...o, health: [healthFor([vetAdm("h-1", "2026-03-15T00:00:00Z"), ...RECORDS])] })).fingerprint).toEqual(first.fingerprint);
    const projection = c3ProjectionFor([...RECORDS, vetAdm("h-1", "2026-03-15T00:00:00Z")]);
    const animal = first.programmes[0].animals[0];
    expect(animal.inputs.health).toEqual({ timeline: projection.timeline.fingerprint, medicineLedger: projection.medicineLedger.fingerprint, withdrawalGate: projection.withdrawalGate.fingerprint });
    expect(animal.inputs.obligationRecords).toEqual(c2EvaluationFor().results.map((x) => x.fingerprint).sort((a, b) => compareStringsForTest(a.digest, b.digest)));
  });

  it("ownership: C7 delegates to the frozen C2 / C3 engines and restates none of their derivation", () => {
    const sources = readdirSync(__dirname).filter((f) => f.startsWith("programme-") && f.endsWith(".ts") && !f.endsWith(".test.ts"));
    // The consumed-field schema DECLARES predecessor output fields (validation, not derivation); every other module is checked.
    const all = sources.filter((f) => f !== "programme-consumed.ts").map((f) => readFileSync(join(__dirname, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")).join("\n");
    expect(all).toMatch(/\bprojectAnimalHealth\(/);
    expect(all).toMatch(/\bevaluateHerdObligations\(/);
    // No supplied-output verification and no hand-written C2/C3 derivation predicates remain.
    expect(all).not.toMatch(/verifyAnimalHealthProjection|PREDECESSOR_CONSISTENCY_RULES|c3Consistent|c2Consistent|supersededBy\.includes|inWithdrawalUntil|administrationIds|countedEvidence/);
    expect(all).not.toMatch(/computeAdministrationWithdrawal|foldWithdrawalGate|bindAdministrationProduct|deriveObligationOccurrences|materialiseHealthRecord|evaluateAnimalObligations/);
  });
});

describe("C7 closure C — result dependency set equals result binding set", () => {
  const withdrawalRule = cattle.withdrawalGateRuleId(MEAT);
  const def = programme({ actions: [action({ gates: [OBL_RULE, withdrawalRule] })] });
  const baseLedger = [dobOf(A), sexOf(A), groupOf(A)];
  const baseHealth = [adm("h-1", "2026-04-11T00:00:00Z")];
  const baseCompletions = [vetDeclaration("d-1"), declaration("d-2", { occurrenceId: occId(1), evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-1" } })];
  // Parts and their OWNING phase: C7 owns definition / review / completions; C1 the ledger; C3 the health records; C2 the catalogue.
  type Parts = { definition: Rec; review: Rec | null; completions: Rec[]; ledger: Rec[]; health: Rec[]; catalogue: Rec };
  const OWNER: Record<keyof Parts, "C7" | "C1" | "C2" | "C3"> = { definition: "C7", review: "C7", completions: "C7", ledger: "C1", health: "C3", catalogue: "C2" };
  const base: Parts = { definition: def, review: null, completions: baseCompletions, ledger: baseLedger, health: baseHealth, catalogue: OBL_CATALOGUE as unknown as Rec };

  /** Builds the request from canonical parts; C7 composes C1 / C3 / C2 from them. `null` = rejected upstream. */
  function evaluate(parts: Parts): ProgrammeEvaluationResult | null {
    try {
      const ledger = createAnimalLedger(A, parts.ledger);
      if (!ledger.ok) return null;
      const bound = parts.review ?? (computeProgrammeDefinitionFingerprint(parts.definition, hash) === null ? REVIEWS[0] : review(parts.definition));
      const request = {
        ...requestOf({ definitions: [parts.definition], reviews: [bound], completions: parts.completions, ledgers: [ledger.ledger], health: [healthFor(parts.health, { ledger: ledger.ledger })] }),
        obligations: { catalogue: parts.catalogue, obligationIds: [OBL], evidence: [] },
      };
      return evaluateHealthProgrammes(request as never, hash, { obligationImplementations: OBL_IMPLEMENTATIONS });
    } catch {
      return null;
    }
  }
  /**
   * The canonical outputs the UPSTREAM OWNERS publish for these parts, computed by the owners' own frozen
   * engines (never by C7): C1 snapshot fingerprint, C3 view fingerprints, C2 record fingerprints.
   * `null` = an owner rejects the input (C7 then fails closed too).
   */
  function ownerOutputs(parts: Parts): string | null {
    try {
      const ledger = createAnimalLedger(A, parts.ledger);
      if (!ledger.ok) return null;
      const snapshot = projectAnimalSnapshot(ledger.ledger, { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF });
      const c3 = projectAnimalHealth({ ledger: ledger.ledger, healthRecords: parts.health, productRecords: DEFAULT_PRODUCTS, query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, foodProducts: [MEAT] } } as never, hash);
      const c2 = evaluateHerdObligations({ ledgers: [ledger.ledger], evidence: [], catalogue: parts.catalogue as never, implementations: OBL_IMPLEMENTATIONS, query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, obligationIds: [OBL] } }, hash);
      if (!snapshot.ok || !c3.ok || !c2.ok || c2.herd.issues.length > 0 || c2.herd.catalogueIssues.length > 0) return null;
      const p = c3.projection;
      return canonicalizeValue({
        c1: computeAnimalSnapshotFingerprint(snapshot.snapshot, hash),
        c3: [p.timeline.fingerprint, p.medicineLedger.fingerprint, p.withdrawalGate.fingerprint],
        c2: c2.herd.animals.flatMap((a) => a.results.map((r) => r.fingerprint)),
      });
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
   * (C) Explicit NON-DEPENDENCIES — structured, never a bare path: each names the owning phase and the
   * reason, and the guard proves its mutation leaves every C7 result unchanged.
   */
  const NON_DEPENDENCIES: { part: keyof Parts; path: RegExp; owningPhase: string; reason: string }[] = [];

  /**
   * The A/B/C oracle (CAT-INV-021 downstream binding rule):
   * (A) C7-owned leaf — an accepted material change changes every C7 result fingerprint;
   * (B) upstream-owned leaf — recompute the owner's canonical output with the owner's engine: changed ⇒
   *     every C7 result changes (C7 consumes all of it); unchanged ⇒ every C7 result is byte-identical;
   * (C) explicit non-dependency — every C7 result is unchanged.
   */
  it("binding guard (A / B / C by owner): C7 results change exactly when a C7-owned input or a consumed owner output changes", () => {
    const before = resultOf(evaluate(base)!);
    const baseOwners = ownerOutputs(base);
    expect(baseOwners).not.toBeNull();
    const violations: string[] = [];
    const counts = { ownChanged: 0, upstreamChanged: 0, upstreamUnchanged: 0, rejected: 0, excluded: 0 };
    const roots: [keyof Parts, unknown][] = [
      ["definition", base.definition],
      ["review", review(def)],
      ["completions", base.completions],
      ["ledger", base.ledger],
      ["health", base.health],
      ["catalogue", base.catalogue],
    ];
    for (const [part, root] of roots) {
      for (const leaf of leavesOf(root)) {
        const excluded = NON_DEPENDENCIES.find((n) => n.part === part && n.path.test(leaf.path.join(".")));
        for (const candidate of candidates(leaf.value)) {
          const parts = { ...base, [part]: setAt(root, leaf.path, candidate) };
          const r = evaluate(parts);
          const label = `${part}.${leaf.path.join(".")} → ${JSON.stringify(candidate)}`;
          if (r === null || !r.ok) {
            counts.rejected++;
            continue;
          }
          const after = resultOf(r);
          const changed = after.evaluation !== before.evaluation && after.animal !== before.animal && after.gates !== before.gates;
          const identical = canonicalizeValue(after) === canonicalizeValue(before);
          if (excluded) {
            counts.excluded++;
            if (!identical) violations.push(`(C) ${label}: exempted (${excluded.owningPhase}: ${excluded.reason}) but C7 changed`);
          } else if (OWNER[part] === "C7") {
            counts.ownChanged++;
            if (!changed) violations.push(`(A) ${label}: C7-owned change not bound`);
          } else {
            const owners = ownerOutputs(parts);
            if (owners === baseOwners) {
              counts.upstreamUnchanged++;
              if (!identical) violations.push(`(B) ${label}: ${OWNER[part]} output unchanged but C7 changed (raw upstream input bound)`);
            } else {
              counts.upstreamChanged++;
              if (!changed) violations.push(`(B) ${label}: ${OWNER[part]} output changed but C7 did not (consumed output unbound)`);
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
    // Every direction of the oracle is exercised, not only rejection.
    expect(counts.ownChanged).toBeGreaterThan(40);
    expect(counts.upstreamChanged).toBeGreaterThan(10);
    expect(counts.upstreamUnchanged).toBeGreaterThan(0);
  }, 300_000);

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
    // Upstream-owned equivalents follow their OWNER: where the owner's canonical output is unchanged, C7 is unchanged.
    const baseOwners = ownerOutputs(base);
    const upstream: [string, Parts][] = [
      ["C2 catalogue instant respelled", { ...base, catalogue: respell(base.catalogue) as Rec }],
      ["C2 catalogue arrays reordered", { ...base, catalogue: Object.fromEntries(Object.entries(base.catalogue).map(([k, v]) => [k, Array.isArray(v) ? [...v].reverse() : v])) }],
      ["C3 records respelled", { ...base, health: respell(base.health) as Rec[] }],
      ["C1 ledger respelled", { ...base, ledger: respell(base.ledger) as Rec[] }],
    ];
    for (const [label, parts] of upstream) {
      const after = resultOf(evaluate(parts)!);
      // C1's snapshot fingerprint is representation-sensitive by its documented frozen design: there C7 follows C1.
      if (ownerOutputs(parts) === baseOwners) expect(after, label).toEqual(before);
      else expect(label).toBe("C1 ledger respelled");
    }
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
      obligations: [obligationEvidenceFor(), obligationEvidenceFor(LEDGER_B)],
    });
    const trusted = { obligationImplementations: OBL_IMPLEMENTATIONS };
    const baseline = evaluateHealthProgrammes(request as never, hash, trusted);
    expect(baseline.ok).toBe(true);
    const reverse = (path: Path) => setAt(request, path, [...(getAt(request, path) as unknown[])].reverse());
    const arrays: Path[] = [["definitions"], ["reviews"], ["completions"], ["ledgers"], ["health", "animals"], ["health", "productRecords"], ["obligations", "evidence"]];
    for (const path of arrays) expect(evaluateHealthProgrammes(reverse(path) as never, hash, trusted), path.join(".")).toEqual(baseline);
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

  it("evidence-note identities are namespaced: a declaration id equal to a C3 record id never collapses", () => {
    const def = programme({ actions: [action({ completion: { recordKind: "MEDICINE_ADMINISTRATION", eventTypes: null, matchCriteria: true } })] });
    // C3 record h-2 corrected twice (competing), plus a declaration whose own id is "h-2" in a competing correction.
    const competing = [adm("h-1", "2026-03-15T00:00:00Z"), { ...adm("h-2", "2026-03-15T00:00:00Z"), supersedes: ["h-1"] }, { ...adm("h-3", "2026-03-16T00:00:00Z"), supersedes: ["h-1"] }];
    const d = (id: string, completedAt: string) => vetDeclaration(id, { supersedes: ["d-0"], evidence: { kind: "DECLARED", completedAt }, provenance: { ...(declaration("x").provenance as Rec), receivedAt: "2026-03-20T00:00:00Z" } });
    const r = run({ definitions: [def], reviews: [review(def)], health: [healthFor(competing)], completions: [vetDeclaration("d-0"), d("h-2", "2026-03-12T00:00:00Z"), d("d-9", "2026-03-13T00:00:00Z")] });
    const completion = animalOf(r).records[0].completion!;
    expect(completion.conflictingDeclarationIds).toEqual(["d-9", "h-2"]);
    expect(completion.conflictingRecordIds).toEqual(["h-2", "h-3"]);
    expect(occurrenceState(r, 0)).toBe("EVIDENCE_CONFLICT");
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
    expect(animalOf(farmerOnly).records[0].reasonCodes).toEqual(["CATTLE_PROGRAMME_COMPLETION_NEEDS_VETERINARY_AUTHORITY"]);
    expect(animalOf(farmerOnly).records[0].completion?.counted).toEqual([expect.objectContaining({ basis: "DECLARATION", declaredBy: "FARMER", declarationId: "d-1" })]);
    expect(gateState(farmerOnly)).not.toBe("PASS");
    const farmerLink = run({ health: [healthFor([adm("h-1", "2026-03-15T00:00:00Z")])], definitions: [programme({ actions: [action({ completion: { recordKind: "MEDICINE_ADMINISTRATION", eventTypes: null, matchCriteria: false } })] })], reviews: [review(programme({ actions: [action({ completion: { recordKind: "MEDICINE_ADMINISTRATION", eventTypes: null, matchCriteria: false } })] }))], completions: [declaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-1" } })] });
    expect(occurrenceState(farmerLink, 0)).toBe("REVIEW_REQUIRED");
    expect(gateState(farmerLink)).not.toBe("PASS");
  });
  it("a VETERINARIAN role counts only with veterinary-source provenance; a veterinary programme needs veterinary-source provenance (decision M1)", () => {
    const selfAsserted = declaration("d-1", { declaredBy: { role: "VETERINARIAN", actor: "SYNTH-VET-1" } }); // provenance FARMER
    const r = run({ completions: [selfAsserted] });
    expect(occurrenceState(r, 0)).toBe("REVIEW_REQUIRED");
    expect(animalOf(r).records[0].completion?.counted).toEqual([expect.objectContaining({ declaredBy: "FARMER", declarationId: "d-1" })]);
    expect(occurrenceState(run({ completions: [vetDeclaration("d-1")] }), 0)).toBe("COMPLETED");
    for (const sourceCategory of ANIMAL_DATA_SOURCE_CATEGORIES.filter((c) => c !== "VETERINARY_SOURCE")) {
      const def = programme({ provenance: { ...(DEF.provenance as Rec), sourceCategory } });
      expect(codes(run({ definitions: [def], reviews: [] })), sourceCategory).toEqual(["CATTLE_PROGRAMME_DEFINITION_INVALID_CLASSIFICATION"]);
    }
  });

  it("veterinarian declarations, C3 records matching declared criteria, advisory actions and farmer programmes are unaffected", () => {
    expect(occurrenceState(run({ completions: [vetDeclaration("d-1")] }), 0)).toBe("COMPLETED");
    expect(occurrenceState(run({ completions: [declaration("d-1"), vetDeclaration("d-2")] }), 0)).toBe("COMPLETED");
    expect(occurrenceState(run({ completions: [declaration("d-1")], health: [healthFor([vetAdm("h-1", "2026-03-15T00:00:00Z")])] }), 0)).toBe("COMPLETED");
    const advisory = programme({ actions: [action({ gateRole: "ADVISORY" })] });
    expect(occurrenceState(run({ definitions: [advisory], reviews: [review(advisory)], completions: [declaration("d-1")] }), 0)).toBe("COMPLETED");
    const farmer = farmerProgramme();
    const r = run({ definitions: [farmer], reviews: [], completions: [declaration("d-1", { programmeId: "SYNTH-PROGRAMME-FARMER", occurrenceId: occId(0, A, ACT, "SYNTH-PROGRAMME-FARMER") })] });
    expect(states(r, A, "SYNTH-PROGRAMME-FARMER")[0]).toBe("COMPLETED");
  });
});

describe("C7 closure G — predecessor evidence resolution before matching (F006 class)", () => {
  // (A missing medicine-ledger entry cannot occur: C7 composes C3 from canonical records itself.)
  type BindingCase = "BOUND" | "UNKNOWN" | "INVALID" | "EVIDENCE_CONFLICT" | "REVIEW_REQUIRED" | "UNSUPPORTED" | "NOT_SUPPLIED";
  const RECORD = vetAdm("h-1", "2026-03-15T00:00:00Z"); // inside occurrence 0's window [Mar 11, Mar 21); effectiveAt Apr 15
  // Real C3 product inputs producing each frozen C3 binding state.
  const PRODUCTS: Record<Exclude<BindingCase, "NOT_SUPPLIED">, Rec[]> = {
    BOUND: [product()],
    UNKNOWN: [],
    INVALID: [product(PRODUCT, { supersedesVersions: ["SYNTH-NO-SUCH-VERSION"] })],
    EVIDENCE_CONFLICT: [product(), product(PRODUCT, { version: "v2" })],
    REVIEW_REQUIRED: [product(PRODUCT, { lifecycle: "REVIEW_REQUIRED" })],
    UNSUPPORTED: [product(PRODUCT, { speciesAuthorisations: [{ species: "SYNTH-OTHER-SPECIES", withdrawalPeriods: [] }] })],
  };
  /** Canonical C3 evidence producing each binding state (asserted against the authoritative C3 projection). */
  function healthOf(c: BindingCase): HealthInput[] {
    if (c === "NOT_SUPPLIED") return [];
    expect(c3ProjectionFor([RECORD], { products: PRODUCTS[c] }).medicineLedger.entries[0].binding.state, c).toBe(c);
    return [healthFor([RECORD], { products: PRODUCTS[c] })];
  }
  const BINDINGS: BindingCase[] = ["BOUND", "UNKNOWN", "INVALID", "EVIDENCE_CONFLICT", "REVIEW_REQUIRED", "UNSUPPORTED", "NOT_SUPPLIED"];
  const UNRESOLVED_STATE: Record<Exclude<BindingCase, "BOUND">, string> = {
    UNKNOWN: "INSUFFICIENT_EVIDENCE",
    UNSUPPORTED: "INSUFFICIENT_EVIDENCE",
    NOT_SUPPLIED: "INSUFFICIENT_EVIDENCE",
    INVALID: "INVALID_EVIDENCE",
    EVIDENCE_CONFLICT: "EVIDENCE_CONFLICT",
    REVIEW_REQUIRED: "REVIEW_REQUIRED",
  };
  type Constraint = "PRODUCT_AND_VERSION" | "PRODUCT_ANY_VERSION" | "NO_PRODUCT_CONSTRAINT" | "WRONG_PRODUCT" | "WRONG_VERSION";
  const PRODUCT_REF: Record<Constraint, Rec | null> = {
    PRODUCT_AND_VERSION: { productId: PRODUCT, productVersion: "v1" },
    PRODUCT_ANY_VERSION: { productId: PRODUCT, productVersion: null },
    NO_PRODUCT_CONSTRAINT: null,
    WRONG_PRODUCT: { productId: "SYNTH-PRODUCT-2", productVersion: null },
    WRONG_VERSION: { productId: PRODUCT, productVersion: "v9" },
  };
  type Path = "CRITERIA" | "VET_LINK" | "VET_DECLARED";
  const definitionFor = (constraint: Constraint, path: Path) =>
    programme({
      actions: [
        action({
          productRef: PRODUCT_REF[constraint],
          // One occurrence, so the action's hard gate reflects exactly the occurrence under test.
          schedule: { ...(action().schedule as Rec), repeat: null },
          completion: { recordKind: "MEDICINE_ADMINISTRATION", eventTypes: null, matchCriteria: path === "CRITERIA" },
        }),
      ],
    });
  const completionsFor = (path: Path) =>
    path === "VET_LINK" ? [vetDeclaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-1" } })] : path === "VET_DECLARED" ? [vetDeclaration("d-1")] : [];

  /** The contract's expected occurrence-0 state (DOMAIN_CONTRACTS "Cattle C7", predecessor evidence resolution). */
  function expected(binding: BindingCase, constraint: Constraint, path: Path): string {
    if (path === "VET_DECLARED") return "COMPLETED"; // no C3 dimension is required
    if (binding === "NOT_SUPPLIED") return "INSUFFICIENT_EVIDENCE";
    if (constraint === "NO_PRODUCT_CONSTRAINT") return "COMPLETED"; // the product dimension is waived, not the record's own authority
    if (constraint === "WRONG_PRODUCT") return "OVERDUE"; // the recorded product id is resolved and differs
    if (binding !== "BOUND") return UNRESOLVED_STATE[binding]; // authority before any version comparison
    return constraint === "WRONG_VERSION" ? "OVERDUE" : "COMPLETED";
  }

  it("binding state × product constraint × completion path: unresolved C3 binding never yields COMPLETED or a PASS gate", () => {
    const failures: string[] = [];
    for (const binding of BINDINGS) {
      for (const constraint of Object.keys(PRODUCT_REF) as Constraint[]) {
        for (const path of ["CRITERIA", "VET_LINK", "VET_DECLARED"] as Path[]) {
          if (path === "CRITERIA" && constraint === "NO_PRODUCT_CONSTRAINT") continue; // invalid definition (criteria need a product)
          const def = definitionFor(constraint, path);
          const r = run({ definitions: [def], reviews: [review(def)], health: healthOf(binding), completions: completionsFor(path) });
          const label = `${binding} × ${constraint} × ${path}`;
          if (!r.ok) {
            failures.push(`${label}: rejected ${JSON.stringify(codes(r))}`);
            continue;
          }
          const state = occurrenceState(r, 0);
          const want = expected(binding, constraint, path);
          if (state !== want) failures.push(`${label}: ${state}, expected ${want}`);
          const g = projectProgrammeHardGates(ok(r), A, hash);
          if (!g.ok) throw new Error(JSON.stringify(g.issues));
          const gate = g.gates.ruleEvaluations[0].state;
          const resolvedPass = want === "COMPLETED";
          if (resolvedPass !== (gate === "PASS")) failures.push(`${label}: gate ${gate}`);
          if (!resolvedPass && gate === "NOT_APPLICABLE") failures.push(`${label}: gate NOT_APPLICABLE`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("one C3 record evidences at most one occurrence of an action: claims by links and/or windows for several occurrences conflict (decision H1)", () => {
    // Two occurrences: windows [Mar 11, Mar 21) and [Apr 10, Apr 20); effectiveAt Apr 15; one administration on Apr 12 (window 1).
    const twoDoses = (matchCriteria: boolean) =>
      programme({ actions: [action({ schedule: { ...(action().schedule as Rec), repeat: { interval: { amount: 30, unit: "DAY" }, count: 2 } }, completion: { recordKind: "MEDICINE_ADMINISTRATION", eventTypes: null, matchCriteria } })] });
    const health = [healthFor([vetAdm("h-1", "2026-04-12T00:00:00Z")])];
    const link = (id: string, index: number) => vetDeclaration(id, { occurrenceId: occId(index), evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-1" } });
    const gate = (r: ProgrammeEvaluationResult) => {
      const g = projectProgrammeHardGates(ok(r), A, hash);
      if (!g.ok) throw new Error(JSON.stringify(g.issues));
      return g.gates.ruleEvaluations[0].state;
    };
    const cases: [string, ProgrammeEvaluationResult][] = [
      ["link to dose 0 + criteria window of dose 1", run({ definitions: [twoDoses(true)], reviews: [review(twoDoses(true))], health, completions: [link("d-0", 0)] })],
      ["links to dose 0 and dose 1", run({ definitions: [twoDoses(false)], reviews: [review(twoDoses(false))], health, completions: [link("d-0", 0), link("d-1", 1)] })],
    ];
    for (const [label, r] of cases) {
      expect(states(r), label).toEqual(["EVIDENCE_CONFLICT", "EVIDENCE_CONFLICT"]);
      expect(gate(r), label).not.toBe("PASS");
    }
    // A single claim is not contested: the record completes exactly its own occurrence.
    const single = run({ definitions: [twoDoses(true)], reviews: [review(twoDoses(true))], health });
    expect(states(single)).toEqual(["OVERDUE", "COMPLETED"]);
    const sameOccurrence = run({ definitions: [twoDoses(true)], reviews: [review(twoDoses(true))], health, completions: [link("d-1", 1)] });
    expect(states(sameOccurrence)).toEqual(["OVERDUE", "COMPLETED"]);
    // The same record may evidence a different action.
    const twoActions = programme({ actions: [action({ actionId: "SYNTH-ACTION-A", schedule: { ...(action().schedule as Rec), repeat: null } }), action({ actionId: "SYNTH-ACTION-B", schedule: { ...(action().schedule as Rec), repeat: null } })] });
    const both = run({ definitions: [twoActions], reviews: [review(twoActions)], health: [healthFor([vetAdm("h-1", "2026-03-15T00:00:00Z")])] });
    expect(states(both)).toEqual(["COMPLETED", "COMPLETED"]);
  });

  it("every unresolved candidate carries the outcome it forces; resolved outcomes depend only on resolved evidence", () => {
    const def = definitionFor("PRODUCT_ANY_VERSION", "VET_LINK");
    for (const binding of ["UNKNOWN", "INVALID", "EVIDENCE_CONFLICT", "REVIEW_REQUIRED", "UNSUPPORTED"] as const) {
      const r = run({ definitions: [def], reviews: [review(def)], health: healthOf(binding), completions: completionsFor("VET_LINK") });
      const completion = animalOf(r).records[0].completion!;
      expect(completion.counted, binding).toEqual([]);
      expect(completion.unresolved, binding).toEqual([expect.objectContaining({ ref: "d-1", outcome: UNRESOLVED_STATE[binding] })]);
    }
    // A farmer link to a BOUND, veterinary-recorded record: the record itself is veterinary evidence (ruling M2).
    const farmer = run({ definitions: [def], reviews: [review(def)], health: healthOf("BOUND"), completions: [declaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-1" } })] });
    expect(occurrenceState(farmer, 0)).toBe("COMPLETED");
    // Other resolution-before-match paths: unknown record time, unidentified product, superseded or competing linked record.
    const unknownTime = run({ definitions: [def], reviews: [review(def)], health: [healthFor([adm("h-1", null)])], completions: completionsFor("VET_LINK") });
    expect(occurrenceState(unknownTime, 0)).toBe("INSUFFICIENT_EVIDENCE");
    const unidentified = run({ definitions: [def], reviews: [review(def)], health: [healthFor([adm("h-1", "2026-03-15T00:00:00Z", { productId: null })])], completions: completionsFor("VET_LINK") });
    expect(occurrenceState(unidentified, 0)).toBe("INSUFFICIENT_EVIDENCE");
  });
});

/**
 * Every defect class found in the first C7 attempt, as a semantic index of
 * the regression tests that close it in the rebuild (finding ids were
 * reused by auditors, so classes — not numbers — are listed).
 */
describe("C7 rebuild — historical defect classes are closed (semantic index)", () => {
  const CLASSES: [string, string][] = [
    ["unresolved anchor / membership / candidate evidence surfacing as a resolved state", "a counted completion never masks unresolved candidate evidence (state and hard gate)"],
    ["partial result / evidence binding (completion, review, definition provenance)", "result binding matrix: every canonical definition and review field changes the animal fingerprint and exported gates"],
    ["review fingerprint used as result binding", "result binding matrix: every canonical definition and review field changes the animal fingerprint and exported gates"],
    ["dependency set ≠ binding set (any leaf)", "binding guard (A / B / C by owner): C7 results change exactly when a C7-owned input or a consumed owner output changes"],
    ["foreign C2 / C3 records under a matching envelope (now: no derived output is ever input)", "F008 and every forged / stale / re-sealed / inconsistent derived C3 output: no injection position can make C7 see it"],
    ["canonical predecessor evidence interpreted outside its owner", "canonical C2 / C3 evidence is interpreted only by its own frozen engine; evidence that engine rejects fails the request closed"],
    ["group / historical membership evidence unbound", "membership binding matrix: every C4 group resolution C7 consults (current and each window opening) binds the result"],
    ["hard-gate identifier collisions", "delimiter-containing programme/action ids keep distinct gate rule ids through the C0 pack"],
    ["ambiguous occurrence / issue / missing-input identities", "occurrence ids, gate rule ids, issue refs and gate missing-input refs never collapse distinct identities"],
    ["required collections missing or null read as []", "explicit null / [] keep their contract meaning; the same meaning is never inferred from a missing property"],
    ["missing fields acquiring semantic meaning", "missing / undefined / null / [] / valid / malformed / unknown-field behave exactly as each field's policy declares"],
    ["resolved-state fallbacks", "an empty state set fails closed and a version conflict never reports an empty review set"],
    ["farmer-only completion of a veterinary hard gate", "a FARMER declaration alone never makes a VETERINARY_PROGRAMME HARD_GATE pass; it is retained as evidence"],
    ["unversioned product reference bypassing C3 binding (null waives authority)", "binding state × product constraint × completion path: unresolved C3 binding never yields COMPLETED or a PASS gate"],
    ["raw upstream input bound by C7 / future knowledge via a raw catalogue (F009)", "C2 owns its catalogue: future, malformed, reordered or respelled catalogue content that C2 excludes or normalises leaves C7 byte-identical (F009)"],
    ["one C3 record completing several occurrences of an action (independent review H1)", "one C3 record evidences at most one occurrence of an action: claims by links and/or windows for several occurrences conflict (decision H1)"],
    ["farmer-recorded C3 evidence alone passing a veterinary hard gate; non-monotonic farmer link (ruling M2)", "record authority × completion path × veterinary corroboration → COMPLETED / PASS only with veterinary authority; farmer evidence always retained"],
    ["malformed re-sealed predecessor output reaching evaluation (F007)", "every predecessor output C7 consumes passes the consumed-field schema; every malformed form of every declared field is rejected (generated from the schema)"],
    ["self-contradictory or incomplete re-sealed predecessor output (pre-gate review H1–H4, M1; F008)", "F008 and every forged / stale / re-sealed / inconsistent derived C3 output: no injection position can make C7 see it"],
    ["C7 restating C2 / C3 derivation (ownership)", "ownership: C7 delegates to the frozen C2 / C3 engines and restates none of their derivation"],
    ["self-asserted veterinarian role (independent review M1)", "a VETERINARIAN role counts only with veterinary-source provenance; a veterinary programme needs veterinary-source provenance (decision M1)"],
    ["C2 payload version not checked against the supported version (independent review M3)", "every predecessor output C7 consumes passes the consumed-field schema; every malformed form of every declared field is rejected (generated from the schema)"],
    ["evidence-note identities collapsing across namespaces (independent review M4)", "evidence-note identities are namespaced: a declaration id equal to a C3 record id never collapses"],
  ];
  it("every class names an existing regression test in this file", () => {
    const text = readFileSync(join(__dirname, "programmes.test.ts"), "utf8");
    for (const [cls, test] of CLASSES) expect(text, cls).toContain(`it("${test}"`);
  });

  it("an empty state set fails closed and a version conflict never reports an empty review set", () => {
    expect(foldProgrammeStates([])).toBeNull();
    const v2 = programme({ version: "v2" });
    const e = ok(run({ definitions: [DEF, v2], reviews: [] }));
    expect(e.programmes[0].versionState).toBe("VERSION_CONFLICT");
    const g = projectProgrammeHardGates(e, A, hash);
    if (!g.ok) throw new Error(JSON.stringify(g.issues));
    expect(g.gates.ruleEvaluations[0].reviews).toEqual([{ dimension: "VETERINARY", state: "PENDING" }]);
    expect(g.gates.ruleEvaluations[0].state).not.toBe("PASS");
  });
});

describe("C7 ruling M2 — evidential authority for veterinary hard gates (farmer-recorded C3 evidence)", () => {
  // C3 record provenance → authority. C3 provenance fields are always resolved; non-veterinary or contradictory provenance is not veterinary authority.
  type RecordAuthority = "VETERINARY" | "FARMER" | "OTHER_SOURCE" | "CONTRADICTORY";
  const PROVENANCE: Record<RecordAuthority, Rec> = {
    VETERINARY: { sourceCategory: "VETERINARY_SOURCE", actorRole: "VETERINARIAN", actor: "SYNTH-VET-1", receivedAt: "2026-03-01T00:00:00Z" },
    FARMER: { sourceCategory: "FARMER", actorRole: "FARMER", receivedAt: "2026-03-01T00:00:00Z" },
    OTHER_SOURCE: { sourceCategory: "EXTERNAL_FARM_SOFTWARE", actorRole: "SYSTEM", receivedAt: "2026-03-01T00:00:00Z" },
    CONTRADICTORY: { sourceCategory: "VETERINARY_SOURCE", actorRole: "FARMER", receivedAt: "2026-03-01T00:00:00Z" },
  };
  type Path = "CRITERIA" | "LINK" | "CRITERIA_AND_LINK" | "DECLARATION";
  type Corroboration = "ABSENT" | "PRESENT"; // the declarer of the link / declaration: farmer vs veterinarian
  const singleDose = (matchCriteria: boolean, gateRole = "HARD_GATE") =>
    programme({ actions: [action({ gateRole, schedule: { ...(action().schedule as Rec), repeat: null }, completion: { recordKind: "MEDICINE_ADMINISTRATION", eventTypes: null, matchCriteria } })] });
  const linkBy = (c: Corroboration) => (c === "PRESENT" ? vetDeclaration : declaration)("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-1" } });
  const declaredBy = (c: Corroboration) => (c === "PRESENT" ? vetDeclaration : declaration)("d-1");
  function scenario(authority: RecordAuthority, path: Path, corroboration: Corroboration, gateRole = "HARD_GATE") {
    const def = singleDose(path === "CRITERIA" || path === "CRITERIA_AND_LINK", gateRole);
    const health = [healthFor([adm("h-1", "2026-03-15T00:00:00Z", { provenance: PROVENANCE[authority] })])];
    const completions = path === "CRITERIA" ? [] : path === "DECLARATION" ? [declaredBy(corroboration)] : [linkBy(corroboration)];
    return run({ definitions: [def], reviews: [review(def)], health, completions });
  }
  const gateOf = (r: ProgrammeEvaluationResult) => {
    const g = projectProgrammeHardGates(ok(r), A, hash);
    if (!g.ok) throw new Error(JSON.stringify(g.issues));
    return g.gates.ruleEvaluations[0]?.state ?? "NO_GATE";
  };
  /** Veterinary authority = a veterinary-recorded C3 record on a C3 path, or a veterinarian-authored link / declaration. */
  const veterinary = (authority: RecordAuthority, path: Path, c: Corroboration) => (path !== "DECLARATION" && authority === "VETERINARY") || (path !== "CRITERIA" && c === "PRESENT");

  it("record authority × completion path × veterinary corroboration → COMPLETED / PASS only with veterinary authority; farmer evidence always retained", () => {
    const failures: string[] = [];
    for (const authority of Object.keys(PROVENANCE) as RecordAuthority[]) {
      for (const path of ["CRITERIA", "LINK", "CRITERIA_AND_LINK", "DECLARATION"] as Path[]) {
        for (const c of ["ABSENT", "PRESENT"] as Corroboration[]) {
          if (path === "CRITERIA" && c === "PRESENT") continue; // no declarer on the criteria-only path
          const r = scenario(authority, path, c);
          const label = `${authority} × ${path} × corroboration ${c}`;
          const want = veterinary(authority, path, c) ? "COMPLETED" : "REVIEW_REQUIRED";
          const state = occurrenceState(r, 0);
          if (state !== want) failures.push(`${label}: ${state}, expected ${want}`);
          const gate = gateOf(r);
          if ((gate === "PASS") !== (want === "COMPLETED")) failures.push(`${label}: gate ${gate}`);
          // Retained, never discarded: every independent path's evidence is counted with its authority.
          const counted = animalOf(r).records[0].completion?.counted ?? [];
          const expectedBases = { CRITERIA: ["DECLARED_CRITERIA"], LINK: ["HEALTH_RECORD_LINK"], CRITERIA_AND_LINK: ["DECLARED_CRITERIA", "HEALTH_RECORD_LINK"], DECLARATION: ["DECLARATION"] }[path];
          if (canonicalizeValue(counted.map((x) => x.basis)) !== canonicalizeValue(expectedBases)) failures.push(`${label}: counted ${JSON.stringify(counted.map((x) => x.basis))}`);
          if (want === "REVIEW_REQUIRED" && !counted.every((x) => x.authority === "NON_VETERINARY")) failures.push(`${label}: authority`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("monotonicity: a farmer link to a record that independently completes via veterinary criteria evidence never weakens it", () => {
    const criteriaOnly = scenario("VETERINARY", "CRITERIA", "ABSENT");
    const plusFarmerLink = scenario("VETERINARY", "CRITERIA_AND_LINK", "ABSENT");
    expect(occurrenceState(criteriaOnly, 0)).toBe("COMPLETED");
    expect(occurrenceState(plusFarmerLink, 0)).toBe("COMPLETED");
    expect(gateOf(plusFarmerLink)).toBe("PASS");
    // ...and a veterinarian link corroborates farmer-recorded criteria evidence.
    expect(occurrenceState(scenario("FARMER", "CRITERIA", "ABSENT"), 0)).toBe("REVIEW_REQUIRED");
    expect(occurrenceState(scenario("FARMER", "CRITERIA_AND_LINK", "PRESENT"), 0)).toBe("COMPLETED");
  });

  it("genuine conflicts and unresolved authority are never resolved by a stronger path", () => {
    // Competing corrections of the veterinary record: conflict, whatever the declarer.
    const def = singleDose(true);
    const competing = [vetAdm("h-0", "2026-03-15T00:00:00Z"), { ...vetAdm("h-1", "2026-03-15T00:00:00Z"), supersedes: ["h-0"] }, { ...vetAdm("h-2", "2026-03-16T00:00:00Z"), supersedes: ["h-0"] }];
    const conflict = run({ definitions: [def], reviews: [review(def)], health: [healthFor(competing)], completions: [vetDeclaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-1" } })] });
    expect(occurrenceState(conflict, 0)).toBe("EVIDENCE_CONFLICT");
    expect(gateOf(conflict)).not.toBe("PASS");
    // Unresolved C3 binding under a veterinarian link to a veterinary record: never PASS.
    const unbound = run({ definitions: [def], reviews: [review(def)], health: [healthFor([vetAdm("h-1", "2026-03-15T00:00:00Z")], { products: [] })], completions: [vetDeclaration("d-1", { evidence: { kind: "HEALTH_RECORD", healthRecordId: "h-1" } })] });
    expect(occurrenceState(unbound, 0)).toBe("INSUFFICIENT_EVIDENCE");
    expect(gateOf(unbound)).not.toBe("PASS");
  });

  it("the authority rule applies only to veterinary hard gates: advisory actions and farmer programmes complete on farmer evidence", () => {
    expect(occurrenceState(scenario("FARMER", "CRITERIA", "ABSENT", "ADVISORY"), 0)).toBe("COMPLETED");
    const farmer = farmerProgramme({ actions: [action({ gateRole: "ADVISORY", schedule: { ...(action().schedule as Rec), repeat: null } })] });
    const r = run({ definitions: [farmer], reviews: [], health: [healthFor([adm("h-1", "2026-03-15T00:00:00Z")])] });
    expect(states(r, A, "SYNTH-PROGRAMME-FARMER")).toEqual(["COMPLETED"]);
  });
});

describe("C7 CAT-INV-028 — predecessor outputs are untrusted until their consumed fields are validated", () => {
  type Mutation = { path: Path; label: string; value: unknown | typeof MISSING };
  const MISSING = Symbol("missing");
  const MALFORMED_FINGERPRINT = { schemaVersion: 1, algorithm: "SHA-256", digest: "NOT-A-DIGEST" };
  /** Every malformed form of every field the spec declares, generated from the schema (never hand-listed). */
  function mutationsOf(spec: FieldSpec, value: unknown, path: Path = [], nullable = false): Mutation[] {
    const out: Mutation[] = [];
    const add = (label: string, v: unknown) => out.push({ path, label: `${path.join(".") || "<root>"} ${label}`, value: v });
    if (path.length > 0 && typeof path[path.length - 1] === "string") add("missing", MISSING);
    if (!nullable && !(spec.t === "literal" && spec.value === null)) add("null", null);
    switch (spec.t) {
      case "ref":
        add("wrong type", 42.5);
        add("malformed (empty)", "");
        add("malformed (untrimmed)", " SYNTH-REF");
        break;
      case "code":
        add("wrong type", 42.5);
        add("malformed (empty)", "");
        break;
      case "instant":
        add("wrong type", 42.5);
        add("malformed instant", "2026-13-45T00:00:00Z");
        break;
      case "date":
        add("wrong type", 42.5);
        add("malformed date", "2026-02-30");
        break;
      case "bool":
        add("wrong type", "true");
        break;
      case "literal":
        add("unsupported version", typeof spec.value === "number" ? spec.value + 98 : "SYNTH-UNSUPPORTED");
        add("wrong type", String(spec.value));
        break;
      case "enum":
        add("wrong type", 42.5);
        add("unknown vocabulary", "SYNTH-UNKNOWN-VALUE");
        break;
      case "fingerprint":
        add("wrong type", "digest");
        add("malformed fingerprint", MALFORMED_FINGERPRINT);
        break;
      case "nullable":
        out.splice(0, out.length, ...mutationsOf(spec.of, value === null ? undefined : value, path, true).filter((m) => value !== null || m.label.endsWith("wrong type")));
        if (value === null) add("wrong type", 42.5);
        break;
      case "array":
        add("wrong type", "not-an-array");
        add("malformed element", [42.5]);
        if (Array.isArray(value)) value.forEach((element, i) => out.push(...mutationsOf(spec.of, element, [...path, i])));
        break;
      case "object":
        add("wrong type", "not-an-object");
        for (const [k, f] of Object.entries(spec.fields)) out.push(...mutationsOf(f, (value as Rec)?.[k], [...path, k]));
        break;
      case "kinded": {
        add("wrong type", "not-an-object");
        add("unknown kind", { ...(value as Rec), [spec.tag]: "SYNTH-UNKNOWN-KIND" });
        const variant = spec.variants[(value as Rec)[spec.tag] as string] ?? {};
        for (const [k, f] of Object.entries({ ...spec.common, ...variant })) if (k !== spec.tag) out.push(...mutationsOf(f, (value as Rec)?.[k], [...path, k]));
        break;
      }
    }
    return out;
  }
  const apply = (root: unknown, m: Mutation) => (m.value === MISSING ? withoutAt(root, m.path) : setAt(root, m.path, m.value));

  // An authoritative C3 projection exercising every consumed field: a veterinary-recorded BOUND administration, a veterinary event, a not-yet-occurred administration.
  const C3_VALID = c3ProjectionFor([vetAdm("h-1", "2026-03-15T00:00:00Z"), vetEvent("h-2", "2026-03-16T00:00:00Z"), vetAdm("h-3", "2026-05-01T00:00:00Z")]);

  it("every predecessor output C7 consumes passes the consumed-field schema; every malformed form of every declared field is rejected (generated from the schema)", () => {
    const snapshot = projectAnimalSnapshot(LEDGER_A, { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF });
    if (!snapshot.ok) throw new Error("snapshot");
    const scope = resolveGroupScope({ scope: { kind: "GROUP", groupRef: GROUP, ledgers: [LEDGER_A] }, query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF } }, hash);
    if (!scope.ok) throw new Error("scope");
    const c2 = c2EvaluationFor();
    const gates = projectObligationHardGates(c2, hash);
    if (!gates.ok) throw new Error("gates");
    const withdrawal = cattle.projectWithdrawalHardGates(C3_VALID, hash);
    if (!withdrawal.ok) throw new Error("withdrawal");
    const surfaces: [string, FieldSpec, unknown, number][] = [
      ["C1_SNAPSHOT", C1_SNAPSHOT, snapshot.snapshot, 5],
      ["C2_EVALUATION", C2_EVALUATION, c2, 40],
      ["C3_PROJECTION", C3_PROJECTION, C3_VALID, 150],
      ["C4_SCOPE", C4_SCOPE, scope.scope, 5],
      ["GATE_PROJECTION (C2)", GATE_PROJECTION, gates.projection.ruleEvaluations, 5],
      ["GATE_PROJECTION (C3)", GATE_PROJECTION, withdrawal.gates.ruleEvaluations, 5],
    ];
    for (const [name, spec, value, minimum] of surfaces) {
      expect(valid(spec, value), name).toBe(true);
      const mutations = mutationsOf(spec, value);
      expect(mutations.length, name).toBeGreaterThan(minimum);
      for (const m of mutations) expect(valid(spec, apply(structuredClone(value), m)), `${name} ${m.label}`).toBe(false);
    }
    // F007's shape (a BOUND binding without a valid version) is not a valid C3 projection — and C7 never accepts one from a caller anyway.
    for (const value of [MISSING, null, ""]) {
      const m: Mutation = { path: ["medicineLedger", "entries", 0, "binding", "product", "version"], label: "version", value };
      expect(valid(C3_PROJECTION, apply(structuredClone(C3_VALID), m))).toBe(false);
    }
    // Runtime-exhaustive translations: an unrecognised value is INVALID_EVIDENCE, never a throw or a resolved state.
    expect(fromC3Binding({ state: "SYNTH-X" as never, product: null })).toMatchObject({ resolved: false, outcome: "INVALID_EVIDENCE" });
    expect(fromC4Membership("SYNTH-X" as never, [])).toMatchObject({ resolved: false, outcome: "INVALID_EVIDENCE" });
    expect(fromC1Resolution({ state: "SYNTH-X", value: null, issues: [] } as never, "DIM")).toMatchObject({ resolved: false, outcome: "INVALID_EVIDENCE" });
    expect(fromC3Binding({ state: "BOUND", product: null })).toMatchObject({ resolved: false });
  });

  it("drift guard: only the predecessor boundary reads predecessor outputs; consumed types expose only schema-declared fields", () => {
    // Allowlist: outside the boundary, C7 modules may import only these frozen modules and names (utilities and C7-owned-input readers — no predecessor output).
    const BOUNDARY = new Set(["programme-consumed.ts", "programme-predecessors.ts"]);
    const ALLOWED: Record<string, RegExp> = {
      "../../assessment-integrity": /^(type )?(AssessmentFingerprint|FingerprintVerificationResult|canonicalizeValue|computeAssessmentFingerprint|verifyAssessmentFingerprint)$/,
      "../animal-ledger": /^(type )?(ANIMAL_DATA_SOURCE_CATEGORIES|BIOLOGICAL_SEXES|compareInstants|deepFreezeAnimalValue|isOpaqueRef|isValidAnimalInstant|AnimalDataSourceCategory|BiologicalSex|AnimalLedger)$/,
      "../integrity": /^(type )?(compareStrings|sameFingerprint|sortedUnique|CattleHash)$/,
      "../rule": /^(type )?(MINIMUM_REVIEW_DIMENSIONS|isValidCalendarDate|CattleReviewDimension|CattleRuleGateRole|CattleRuleProductionState|ReviewDimensionState)$/,
      "../source": /^(type )?(SourceVersionRef|compareSourceVersionRefs)$/,
      "../version": /^CATTLE_EVIDENCE_ARCHITECTURE_VERSION$/,
      "../evaluation": /^(type )?(CattleEvaluationState|RuleEvaluationRecord)$/,
      "../regulatory/canonical-input": /^(canonicalField|toCanonicalPlainData)$/,
      "../regulatory/bitemporal-records": /^(type )?(collectBitemporalRecords|resolveBitemporalRecords|BitemporalRecord)$/,
      "../regulatory/obligation-time": /^(type )?(addObligationOffset|canonicalObligationInstant|isValidObligationOffset|obligationOffsetSeconds|utcCalendarDateOf|utcStartOfCalendarDate|ObligationOffset)$/,
      "../health/health-input": /^(type )?(fingerprintOf|isRecord|nullableRef|oneOf|rawIdentityKey|sourceVersionRefOf|Raw)$/,
      "../health/health-records": /^(type )?(VETERINARY_EVENT_TYPES|VeterinaryEventType)$/,
    };
    // programme-types.ts declares the request's accepted input types (type-only).
    const TYPES_ONLY: Record<string, RegExp> = { "../animal-ledger": /^AnimalLedger$/, "../health": /^AnimalHealthProjection$/, "../regulatory": /^AnimalObligationEvaluation$/, "../evaluation": /^CattleEvaluationState$/ };
    const violations: string[] = [];
    for (const f of readdirSync(__dirname).filter((x) => x.startsWith("programme-") && x.endsWith(".ts") && !x.endsWith(".test.ts") && !BOUNDARY.has(x))) {
      const text = readFileSync(join(__dirname, f), "utf8");
      for (const m of text.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)) {
        const from = m[3];
        if (from.startsWith("./")) continue;
        const allowed = f === "programme-types.ts" && TYPES_ONLY[from] ? TYPES_ONLY[from] : ALLOWED[from];
        for (const name of m[2].split(",").map((x) => x.trim()).filter(Boolean)) {
          if (allowed === undefined || !allowed.test(name.replace(/^type /, ""))) violations.push(`${f}: ${name} from ${from}`);
        }
      }
      if (/import\s+\*\s+as/.test(text) || /import\s+[A-Za-z_]+\s+from/.test(text)) violations.push(`${f}: namespace/default import`);
    }
    expect(violations).toEqual([]);
    // Type-level: reading a field the consumed schema does not declare does not compile (checked by `npm run typecheck`).
    const typeGuards = [
      // @ts-expect-error — `sourceRefs` is not a consumed C3 field
      (p: ConsumedHealthProjection) => p.sourceRefs,
      // @ts-expect-error — `withdrawals` is not a consumed C3 medicine-ledger field
      (e: ConsumedMedicineEntry) => e.withdrawals,
      // @ts-expect-error — `consideredVersions` is not a consumed C3 binding field
      (b: ConsumedMedicineEntry["binding"]) => b.consideredVersions,
      // @ts-expect-error — `window` is not a consumed C2 record field
      (e: ConsumedObligationEvaluation) => e.results[0].window,
    ];
    expect(typeGuards).toHaveLength(4);
  });
});

describe("C7 downstream binding rule — C7 binds C2's canonical output, never C2's raw catalogue (F009)", () => {
  const def = programme({ actions: [action({ gates: [OBL_RULE] })] });
  const evaluateWith = (catalogue: unknown) =>
    evaluateHealthProgrammes({ ...requestOf({ definitions: [def], reviews: [review(def)] }), obligations: { catalogue, obligationIds: [OBL], evidence: [] } } as never, hash, { obligationImplementations: OBL_IMPLEMENTATIONS });
  const c2Records = (catalogue: unknown) => {
    const r = evaluateHerdObligations({ ledgers: [LEDGER_A], evidence: [], catalogue: catalogue as never, implementations: OBL_IMPLEMENTATIONS, query: { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF, obligationIds: [OBL] } }, hash);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return canonicalizeValue(r.herd.animals.flatMap((a) => a.results.map((x) => x.fingerprint)));
  };
  const baseline = evaluateWith(OBL_CATALOGUE);
  const FUTURE = "2027-06-01T00:00:00Z"; // after the 2026-12-31 cutoff

  it("C2 owns its catalogue: future, malformed, reordered or respelled catalogue content that C2 excludes or normalises leaves C7 byte-identical (F009)", () => {
    expect(baseline.ok).toBe(true);
    const futureDefinition = { ...OBL_DEFINITION, obligationId: "SYNTH-OBLIGATION-FUTURE", recordedAt: FUTURE };
    const futureMalformed = { obligationId: "SYNTH-OBLIGATION-FUTURE-MALFORMED", recordedAt: FUTURE, ruleId: undefined, terms: undefined };
    const respelled = { ...OBL_DEFINITION, recordedAt: "2026-01-01T00:00:00.000Z" };
    const variants: [string, unknown][] = [
      ["definition recorded after the cutoff", { ...OBL_CATALOGUE, definitions: [OBL_DEFINITION, futureDefinition] }],
      ["future malformed definition (with undefined)", { ...OBL_CATALOGUE, definitions: [OBL_DEFINITION, futureMalformed] }],
      ["definitions reordered", { ...OBL_CATALOGUE, definitions: [futureDefinition, OBL_DEFINITION] }],
      ["sources reordered", { ...OBL_CATALOGUE, sources: [...(OBL_CATALOGUE.sources as unknown[])].reverse() }],
      ["reviews reordered", { ...OBL_CATALOGUE, reviews: [...(OBL_CATALOGUE.reviews as unknown[])].reverse() }],
      ["equivalent instant spelling", { ...OBL_CATALOGUE, definitions: [respelled] }],
    ];
    for (const [label, catalogue] of variants) {
      // The owner's canonical output is unchanged ...
      expect(c2Records(catalogue), label).toEqual(c2Records(OBL_CATALOGUE));
      // ... so C7 neither throws nor changes.
      let r: ProgrammeEvaluationResult | null = null;
      expect(() => (r = evaluateWith(catalogue)), label).not.toThrow();
      expect(r, label).toEqual(baseline);
    }
  });

  it("guard self-test and positive control: C7 changes if and only if C2's canonical output changes", () => {
    // Self-test: a raw catalogue mutation the owner absorbs (knowledge time still before the cutoff) ⇒ unchanged owner output ⇒ unchanged C7.
    const absorbed = { ...OBL_CATALOGUE, definitions: [{ ...OBL_DEFINITION, recordedAt: "2026-01-01T06:00:00Z" }] };
    expect(c2Records(absorbed)).toEqual(c2Records(OBL_CATALOGUE));
    expect(evaluateWith(absorbed)).toEqual(baseline);
    // Positive control: the rule version loses its approval ⇒ C2's canonical output changes ⇒ C7 changes.
    const unapproved = { ...OBL_CATALOGUE, reviews: [] };
    expect(c2Records(unapproved)).not.toEqual(c2Records(OBL_CATALOGUE));
    const changed = evaluateWith(unapproved);
    expect(ok(changed).fingerprint).not.toEqual(ok(baseline).fingerprint);
    expect(animalOf(changed).inputs.obligationRecords).not.toEqual(animalOf(baseline).inputs.obligationRecords);
  });

  it("C7 binds no raw predecessor input: the animal inputs are exactly the owners' published fingerprints", () => {
    const inputs = animalOf(baseline).inputs;
    expect(Object.keys(inputs).sort()).toEqual(["health", "obligationRecords", "snapshotFingerprint"]);
    const sources = readdirSync(__dirname).filter((f) => f.startsWith("programme-") && f.endsWith(".ts") && !f.endsWith(".test.ts"));
    const code = sources.map((f) => readFileSync(join(__dirname, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")).join("\n");
    expect(code).not.toMatch(/OBLIGATION_INPUTS|obligations\.catalogue[^\n]*Fingerprint|computeProgrammeFingerprint\([^)]*catalogue/);
  });
});
