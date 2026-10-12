/**
 * Cattle C2 — regulatory/obligation lifecycle engine. Synthetic data only:
 * every rule, source, obligation, window and animal is a fictional `SYNTH-*`
 * fixture with no legal, scheme or veterinary meaning.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAnimalLedger, type AnimalAssertionInput, type AnimalLedger } from "../animal-ledger";
import type { CattleRuleImplementation } from "../evaluation";
import { buildRecommendationEvidencePack, type RecommendationEvidencePackInput } from "../evidence-pack";
import type { CattleRuleClassification, CattleRuleGateRole, CattleRuleVersion, CattleReviewDimension } from "../rule";
import { sourceVersionRef, type CattleEvidenceSource } from "../source";
import { CATALOGUE, LEGAL_SOURCE, SCIENCE_SOURCE, VET_SOURCE, approve, bindTo, descriptor, hash, impl, synthRule } from "../test-fixtures";
import { collectBitemporalRecords, resolveBitemporalRecords } from "./bitemporal-records";
import {
  PRODUCTION_OBLIGATION_CATALOGUE,
  materialiseObligationCatalogue,
  obligationTermsMarker,
  type ObligationCatalogue,
  type ObligationDefinition,
  type ObligationTerms,
} from "./obligation-definition";
import {
  evaluateAnimalObligations,
  evaluateHerdObligations,
  verifyObligationStateRecord,
  type AnimalObligationEvaluation,
  type ObligationStateRecord,
} from "./obligation-engine";
import { appendObligationEvidence, createObligationEvidenceLog } from "./obligation-evidence";
import { projectObligationHardGates } from "./obligation-hard-gates";
import { addObligationOffset, canonicalObligationInstant, obligationInstantJustBefore, utcStartOfCalendarDate } from "./obligation-time";

const A = "SYNTH-ANIMAL-1";
const B = "SYNTH-ANIMAL-2";
const OBL = "SYNTH-OBLIGATION-1";
const RULE_ID = "SYNTH-RULE-OBLIGATION";
const DOB = "2026-03-01";
const ANCHOR = "2026-03-01T00:00:00.000000000Z";
const OPEN = "2026-03-02T00:00:00Z"; // anchor + 1 DAY
const DUE = "2026-03-11T00:00:00Z"; // anchor + 10 DAY
const INSIDE = "2026-03-05T00:00:00Z";
const CUTOFF = "2026-12-31T00:00:00Z";

const passImpl = impl(() => "PASS", "SYNTH-IMPL-OBLIGATION");
const presentImpl = impl((v) => (v["cattle.animal.lifecycleStatus"] === "PRESENT" ? "PASS" : "FAIL"), "SYNTH-IMPL-PRESENT");

function terms(overrides: Partial<ObligationTerms> = {}): ObligationTerms {
  return {
    obligationKind: "SYNTH-KIND",
    anchor: { kind: "DATE_OF_BIRTH" },
    window: { opensAfter: { amount: 1, unit: "DAY" }, dueAfter: { amount: 10, unit: "DAY" }, boundary: "INCLUSIVE_START_EXCLUSIVE_END" },
    timeBasis: "UTC",
    windowSource: sourceVersionRef(LEGAL_SOURCE),
    ...overrides,
  };
}

function definition(overrides: Partial<ObligationDefinition> = {}, termOverrides: Partial<ObligationTerms> = {}): ObligationDefinition {
  return { obligationId: OBL, ruleId: RULE_ID, ruleVersion: 1, recordedAt: "2026-01-01T00:00:00Z", terms: terms(termOverrides), ...overrides };
}

function boundRule(def: ObligationDefinition, overrides: Partial<CattleRuleVersion> = {}, implementation: CattleRuleImplementation = passImpl): CattleRuleVersion {
  return synthRule({
    ruleId: def.ruleId,
    version: def.ruleVersion,
    requiredInputs: [],
    implementation: bindTo(implementation),
    assumptions: ["synthetic assumption", obligationTermsMarker(def, hash)],
    ...overrides,
  });
}

interface Setup {
  def?: ObligationDefinition;
  rule?: CattleRuleVersion;
  implementation?: CattleRuleImplementation;
  sources?: CattleEvidenceSource[];
  reviews?: ReturnType<typeof approve>;
}

function catalogueOf(setup: Setup = {}): ObligationCatalogue {
  const def = setup.def ?? definition();
  const implementation = setup.implementation ?? passImpl;
  const rule = setup.rule ?? boundRule(def, {}, implementation);
  return { definitions: [def], ruleVersions: [rule], sources: setup.sources ?? CATALOGUE, reviews: setup.reviews ?? approve(rule), implementations: [implementation] };
}

const prov = (receivedAt = "2026-03-01T12:00:00Z") => ({ sourceCategory: "FARMER" as const, receivedAt });
const dob = (id: string, value: string | null, receivedAt?: string, extra: Record<string, unknown> = {}): AnimalAssertionInput =>
  ({ assertionId: id, animalId: A, kind: "DATE_OF_BIRTH", value, provenance: prov(receivedAt), ...extra }) as AnimalAssertionInput;
const sex = (id: string, value: "FEMALE" | "MALE"): AnimalAssertionInput => ({ assertionId: id, animalId: A, kind: "SEX", value, provenance: prov() });
const interval = (kind: string, id: string, value: unknown, validFrom: string, validTo: string | null, animalId = A): AnimalAssertionInput =>
  ({ assertionId: id, animalId, kind, value, validFrom, validTo, provenance: prov() }) as AnimalAssertionInput;
const life = (id: string, status: string, from = "2026-03-01T00:00:00Z", to: string | null = null, animalId = A) => interval("LIFECYCLE_STATUS", id, status, from, to, animalId);
const loc = (id: string, ref: string, from: string, to: string | null, kind = "FIELD") => interval("LOCATION", id, { kind, ref }, from, to);

function ledgerOf(inputs: unknown[], animalId = A): AnimalLedger {
  const result = createAnimalLedger(animalId, inputs);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.ledger;
}

const BASE_LEDGER = () => ledgerOf([dob("a-dob", DOB), sex("a-sex", "FEMALE"), life("a-life", "PRESENT")]);

function ful(id: string, fulfilledAt: string, extra: Record<string, unknown> = {}) {
  return {
    evidenceId: id,
    animalId: A,
    obligationId: OBL,
    rule: { ruleId: RULE_ID, version: 1 },
    occurrenceAnchor: null,
    kind: "FULFILMENT",
    fulfilledAt,
    provenance: { sourceCategory: "FARMER", receivedAt: "2026-03-20T00:00:00Z" },
    supersedes: [],
    ...extra,
  };
}

interface Run {
  ledger?: AnimalLedger;
  evidence?: unknown[];
  catalogue?: unknown;
  effectiveAt?: string;
  knowledgeCutoff?: string;
  ids?: string[];
}

function run(opts: Run = {}): AnimalObligationEvaluation {
  const result = evaluateAnimalObligations(
    {
      ledger: opts.ledger ?? BASE_LEDGER(),
      evidence: opts.evidence ?? [],
      catalogue: ("catalogue" in opts ? opts.catalogue : catalogueOf()) as ObligationCatalogue,
      query: { effectiveAt: opts.effectiveAt ?? "2026-03-05T00:00:00Z", knowledgeCutoff: opts.knowledgeCutoff ?? CUTOFF, obligationIds: opts.ids ?? [OBL] },
    },
    hash,
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.evaluation;
}

const only = (ev: AnimalObligationEvaluation): ObligationStateRecord => {
  expect(ev.results).toHaveLength(1);
  return ev.results[0];
};
const stateOf = (opts: Run = {}) => only(run(opts)).state;

function packFor(ev: AnimalObligationEvaluation) {
  const projected = projectObligationHardGates(ev, hash);
  if (!projected.ok) throw new Error(JSON.stringify(projected));
  const p = projected.projection;
  const input: RecommendationEvidencePackInput = {
    recommendationId: "SYNTH-REC-1",
    engineVersion: "synth-engine",
    rulesetVersion: "synth-ruleset",
    evaluationDate: p.evaluationDate,
    knownAt: p.knowledgeCutoff,
    generatedAt: p.knowledgeCutoff,
    targetScope: { kind: "SYNTH-ANIMAL", id: p.animalId, snapshotRef: ev.snapshotFingerprint.digest },
    intent: null,
    inputs: [],
    ruleEvaluations: [...p.ruleEvaluations],
    requiredHardGateRuleIds: [...p.requiredHardGateRuleIds],
    calculationSteps: [],
    additionalSourceRefs: [],
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
  return { projection: p, pack: built.pack };
}

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------

describe("C2 window arithmetic", () => {
  it("adds exact UTC offsets across month/leap boundaries and canonicalises spelling", () => {
    expect(addObligationOffset("2024-02-28T00:00:00Z", { amount: 1, unit: "DAY" })).toBe("2024-02-29T00:00:00.000000000Z");
    expect(addObligationOffset("2025-12-31T23:00:00.5Z", { amount: 2, unit: "HOUR" })).toBe("2026-01-01T01:00:00.500000000Z");
    expect(canonicalObligationInstant("2026-03-01T00:00:00Z")).toBe(canonicalObligationInstant("2026-03-01T00:00:00.000Z"));
    expect(utcStartOfCalendarDate("0000-02-29")).toBe("0000-02-29T00:00:00.000000000Z");
    expect(obligationInstantJustBefore("2026-03-01T00:00:00Z")).toBe("2026-02-28T23:59:59.999999999Z");
    expect(addObligationOffset("9999-12-31T00:00:00Z", { amount: 1, unit: "DAY" })).toBeNull();
    expect(canonicalObligationInstant("2026-03-01T00:00:00+00:00")).toBeNull();
  });
});

describe("C2 test 1 — applicability from KNOWN inputs only", () => {
  const female = { input: descriptor("cattle.animal.sex"), equals: "FEMALE" };
  const def = definition();
  const cat = catalogueOf({ def, rule: boundRule(def, { applicability: [female] }) });

  it("applicable when the KNOWN input matches, not applicable when it does not", () => {
    expect(stateOf({ catalogue: cat })).toBe("OUTSTANDING");
    const male = ledgerOf([dob("a-dob", DOB), sex("a-sex", "MALE")]);
    const r = only(run({ catalogue: cat, ledger: male }));
    expect(r.state).toBe("NOT_APPLICABLE");
    expect(r.occurrence).toBeNull();
  });

  it("unknown applicability input is UNKNOWN, never NOT_APPLICABLE", () => {
    const r = only(run({ catalogue: cat, ledger: ledgerOf([dob("a-dob", DOB)]) }));
    expect(r.state).toBe("UNKNOWN");
    expect(r.reasonCodes).toContain("CATTLE_OBLIGATION_INPUT_UNKNOWN:cattle.animal.sex");
  });

  it("conflicting or non-derivable applicability input never becomes NOT_APPLICABLE", () => {
    const conflicting = ledgerOf([dob("a-dob", DOB), sex("s-1", "FEMALE"), sex("s-2", "MALE")]);
    expect(stateOf({ catalogue: cat, ledger: conflicting })).toBe("EVIDENCE_CONFLICT");
    const foreign = catalogueOf({ def, rule: boundRule(def, { applicability: [{ input: descriptor("synth.not-c1"), equals: "X" }] }) });
    expect(stateOf({ catalogue: foreign })).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("a non-matching KNOWN input never clears an unknown, conflicting or invalid anchor as NOT_APPLICABLE", () => {
    const missing = only(run({ catalogue: cat, ledger: ledgerOf([sex("a-sex", "MALE")]) }));
    expect(missing.state).toBe("UNKNOWN");
    expect(missing.reasonCodes).toContain("CATTLE_OBLIGATION_ANCHOR_UNKNOWN");
    const conflicting = ledgerOf([dob("d-1", DOB), dob("d-2", "2026-03-02"), sex("a-sex", "MALE")]);
    expect(stateOf({ catalogue: cat, ledger: conflicting })).toBe("EVIDENCE_CONFLICT");
    const invalid = ledgerOf([dob("d-1", DOB, undefined, { supersedes: ["d-missing"] }), sex("a-sex", "MALE")]);
    expect(stateOf({ catalogue: cat, ledger: invalid })).toBe("INVALID_EVIDENCE");
    const gates = projectObligationHardGates(run({ catalogue: cat, ledger: ledgerOf([sex("a-sex", "MALE")]) }), hash);
    expect(gates.ok && gates.projection.entries.map((e) => [e.state, e.packState])).toEqual([["UNKNOWN", "INSUFFICIENT_EVIDENCE"]]);
  });

  it("a class the rule does not accept is rejected, not converted", () => {
    const factOnly = catalogueOf({ def, rule: boundRule(def, { applicability: [{ input: descriptor("cattle.animal.lifecycleStatus", ["FACT"]), equals: "PRESENT" }] }) });
    const r = only(run({ catalogue: factOnly }));
    expect(r.state).toBe("INSUFFICIENT_EVIDENCE");
    expect(r.ruleEvaluation.rejectedInputs.map((x) => x.reasonCode)).toEqual(["CATTLE_INPUT_CLASS_NOT_ACCEPTED"]);
  });
});

describe("C2 test 2 — window boundaries", () => {
  it("one instant before open is UPCOMING, exactly at open OUTSTANDING, exactly at due end OVERDUE", () => {
    expect(stateOf({ effectiveAt: "2026-03-01T23:59:59.999999999Z" })).toBe("UPCOMING");
    expect(stateOf({ effectiveAt: OPEN })).toBe("OUTSTANDING");
    expect(stateOf({ effectiveAt: "2026-03-02T00:00:00.000Z" })).toBe("OUTSTANDING");
    expect(stateOf({ effectiveAt: "2026-03-10T23:59:59.999999999Z" })).toBe("OUTSTANDING");
    const overdue = only(run({ effectiveAt: DUE }));
    expect(overdue.state).toBe("OVERDUE");
    expect(overdue.window).toEqual({ opensAt: "2026-03-02T00:00:00.000000000Z", dueAt: "2026-03-11T00:00:00.000000000Z", boundary: "INCLUSIVE_START_EXCLUSIVE_END" });
    expect(overdue.occurrence?.anchorAt).toBe(ANCHOR);
  });

  it("fulfilled inside the window is SATISFIED; fulfilled at/after the exclusive end is SATISFIED_LATE", () => {
    const sat = only(run({ effectiveAt: "2026-04-01T00:00:00Z", evidence: [ful("e-1", INSIDE)] }));
    expect(sat.state).toBe("SATISFIED");
    expect(sat.evidence.countedEvidence.map((e) => e.evidenceId)).toEqual(["e-1"]);
    expect(stateOf({ effectiveAt: "2026-04-01T00:00:00Z", evidence: [ful("e-1", OPEN)] })).toBe("SATISFIED");
    const late = only(run({ effectiveAt: "2026-04-01T00:00:00Z", evidence: [ful("e-1", DUE)] }));
    expect(late.state).toBe("SATISFIED_LATE");
    expect(late.reasonCodes).toContain("CATTLE_OBLIGATION_FULFILLED_AFTER_DUE");
  });

  it("an inclusive-end rule keeps the due instant inside the window", () => {
    const def = definition({}, { window: { opensAfter: { amount: 1, unit: "DAY" }, dueAfter: { amount: 10, unit: "DAY" }, boundary: "INCLUSIVE_START_INCLUSIVE_END" } });
    const cat = catalogueOf({ def });
    expect(stateOf({ catalogue: cat, effectiveAt: DUE })).toBe("OUTSTANDING");
    expect(stateOf({ catalogue: cat, effectiveAt: "2026-03-11T00:00:00.000000001Z" })).toBe("OVERDUE");
    expect(stateOf({ catalogue: cat, effectiveAt: "2026-04-01T00:00:00Z", evidence: [ful("e-1", DUE)] })).toBe("SATISFIED");
  });

  it("fulfilment before the window opens never satisfies it; future-dated fulfilment has not happened yet", () => {
    const early = only(run({ effectiveAt: "2026-03-05T00:00:00Z", evidence: [ful("e-1", "2026-03-01T06:00:00Z")] }));
    expect(early.state).toBe("OUTSTANDING");
    expect(early.evidence.beforeWindowEvidenceIds).toEqual(["e-1"]);
    const future = only(run({ effectiveAt: "2026-03-05T00:00:00Z", evidence: [ful("e-1", "2026-03-08T00:00:00Z")] }));
    expect(future.state).toBe("OUTSTANDING");
    expect(future.evidence.notYetOccurredEvidenceIds).toEqual(["e-1"]);
  });

  it("independent fulfilments disagreeing on timeliness conflict; agreeing ones stay SATISFIED", () => {
    const r = only(run({ effectiveAt: "2026-04-01T00:00:00Z", evidence: [ful("e-1", INSIDE), ful("e-2", "2026-03-20T00:00:00Z")] }));
    expect(r.state).toBe("EVIDENCE_CONFLICT");
    expect(r.evidence.conflictingEvidenceIds).toEqual(["e-1", "e-2"]);
    expect(stateOf({ effectiveAt: "2026-04-01T00:00:00Z", evidence: [ful("e-1", INSIDE), ful("e-2", OPEN)] })).toBe("SATISFIED");
  });
});

describe("C2 test 3 — anchor unknown or conflicting is never satisfied", () => {
  it("unknown date of birth is UNKNOWN even with fulfilment evidence", () => {
    for (const ledger of [ledgerOf([]), ledgerOf([dob("a-dob", null)])]) {
      const r = only(run({ ledger, evidence: [ful("e-1", INSIDE)] }));
      expect(r.state).toBe("UNKNOWN");
      expect(r.occurrence).toBeNull();
      expect(r.evidence.unattributedEvidenceIds).toEqual(["e-1"]);
    }
  });

  it("conflicting date of birth is EVIDENCE_CONFLICT", () => {
    const ledger = ledgerOf([dob("d-1", DOB), dob("d-2", "2026-03-02")]);
    expect(stateOf({ ledger, evidence: [ful("e-1", INSIDE)] })).toBe("EVIDENCE_CONFLICT");
  });

  it("invalid date-of-birth supersession is INVALID_EVIDENCE", () => {
    const ledger = ledgerOf([dob("d-1", DOB, undefined, { supersedes: ["d-missing"] })]);
    expect(stateOf({ ledger })).toBe("INVALID_EVIDENCE");
  });
});

describe("C2 interval anchors", () => {
  const locDef = definition({}, { anchor: { kind: "LOCATION_START", locationKind: "FIELD" } });
  const locCat = catalogueOf({ def: locDef });

  it("each start at a new location is an occurrence; evidence is matched by anchor instant", () => {
    const ledger = ledgerOf([loc("l-1", "field-1", "2026-01-01T00:00:00Z", "2026-05-01T00:00:00Z"), loc("l-2", "field-2", "2026-05-01T00:00:00Z", null)]);
    const ev = run({
      catalogue: locCat,
      ledger,
      effectiveAt: "2026-05-05T00:00:00Z",
      evidence: [ful("e-1", "2026-05-03T00:00:00Z", { occurrenceAnchor: "2026-05-01T00:00:00.000Z" })],
    });
    expect(ev.results.map((r) => [r.occurrence?.anchorAt, r.state])).toEqual([
      ["2026-01-01T00:00:00.000000000Z", "OVERDUE"],
      ["2026-05-01T00:00:00.000000000Z", "SATISFIED"],
    ]);
  });

  it("a continuation at the same location is not a new start", () => {
    const ledger = ledgerOf([loc("l-1", "field-1", "2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"), loc("l-2", "field-1", "2026-03-01T00:00:00Z", null)]);
    const ev = run({ catalogue: locCat, ledger });
    expect(ev.results.map((r) => r.occurrence?.anchorAt)).toEqual(["2026-01-01T00:00:00.000000000Z"]);
  });

  it("an overlapping, conflicting location at a start is EVIDENCE_CONFLICT for that occurrence", () => {
    const ledger = ledgerOf([loc("l-1", "field-1", "2026-01-01T00:00:00Z", null), loc("l-2", "field-2", "2026-02-01T00:00:00Z", null)]);
    const ev = run({ catalogue: locCat, ledger });
    expect(ev.results.map((r) => r.state)).toEqual(["OVERDUE", "EVIDENCE_CONFLICT"]);
  });

  it("no evidence of the dimension is UNKNOWN; evidence without a matching start is NOT_TRIGGERED", () => {
    const departed = catalogueOf({ def: definition({}, { anchor: { kind: "LIFECYCLE_STATUS_START", status: "DEPARTED" } }) });
    expect(stateOf({ catalogue: departed, ledger: ledgerOf([dob("a-dob", DOB)]) })).toBe("UNKNOWN");
    const r = only(run({ catalogue: departed }));
    expect(r.state).toBe("NOT_TRIGGERED");
    const p = packFor(run({ catalogue: departed }));
    expect(p.pack.outcome).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("a non-matching KNOWN input never clears a conflicting or unknown interval-anchor dimension as NOT_APPLICABLE", () => {
    const female = { input: descriptor("cattle.animal.sex"), equals: "FEMALE" };
    const departedDef = definition({}, { anchor: { kind: "LIFECYCLE_STATUS_START", status: "DEPARTED" } });
    const departed = catalogueOf({ def: departedDef, rule: boundRule(departedDef, { applicability: [female] }) });
    const male = (...rest: AnimalAssertionInput[]) => ledgerOf([dob("a-dob", DOB), sex("a-sex", "MALE"), ...rest]);
    const lifeConflict = male(life("l-1", "PRESENT"), life("l-2", "DECEASED", "2026-03-03T00:00:00Z"));
    const r = only(run({ catalogue: departed, ledger: lifeConflict }));
    expect(r.state).toBe("EVIDENCE_CONFLICT");
    const gates = projectObligationHardGates(run({ catalogue: departed, ledger: lifeConflict }), hash);
    expect(gates.ok && gates.projection.entries.map((e) => e.state)).toEqual(["EVIDENCE_CONFLICT"]);
    // A conflict that has since ended is still preserved.
    const pastConflict = male(life("l-1", "PRESENT", "2026-03-01T00:00:00Z", "2026-03-04T00:00:00Z"), life("l-2", "DECEASED", "2026-03-02T00:00:00Z", "2026-03-04T00:00:00Z"), life("l-3", "PRESENT", "2026-03-04T00:00:00Z"));
    expect(stateOf({ catalogue: departed, ledger: pastConflict })).toBe("EVIDENCE_CONFLICT");
    // The dimension is not known at the query: never cleared.
    expect(stateOf({ catalogue: departed, ledger: male(life("l-1", "PRESENT", "2026-03-01T00:00:00Z", "2026-03-04T00:00:00Z")) })).toBe("UNKNOWN");
    expect(stateOf({ catalogue: departed, ledger: male(life("l-1", "PRESENT")) })).toBe("NOT_APPLICABLE");

    const shedDef = definition({}, { anchor: { kind: "LOCATION_START", locationKind: "HOUSING" } });
    const shed = catalogueOf({ def: shedDef, rule: boundRule(shedDef, { applicability: [female] }) });
    const locConflict = male(loc("l-1", "field-1", "2026-01-01T00:00:00Z", null), loc("l-2", "field-2", "2026-02-01T00:00:00Z", null));
    expect(stateOf({ catalogue: shed, ledger: locConflict })).toBe("EVIDENCE_CONFLICT");
    expect(stateOf({ catalogue: shed, ledger: male(loc("l-1", "field-1", "2026-01-01T00:00:00Z", "2026-03-04T00:00:00Z")) })).toBe("UNKNOWN");
    expect(stateOf({ catalogue: shed, ledger: male(loc("l-1", "field-1", "2026-01-01T00:00:00Z", null)) })).toBe("NOT_APPLICABLE");
    // With a known matching start, a conflict elsewhere in the dimension is still preserved.
    const knownStartAndConflict = male(loc("l-1", "shed-1", "2026-01-01T00:00:00Z", null, "HOUSING"), loc("l-2", "field-2", "2026-02-01T00:00:00Z", null));
    expect(stateOf({ catalogue: shed, ledger: knownStartAndConflict })).toBe("EVIDENCE_CONFLICT");
  });

  it("evidence whose occurrence shape does not fit the anchor fails closed", () => {
    const ledger = ledgerOf([loc("l-1", "field-1", "2026-01-01T00:00:00Z", null)]);
    expect(stateOf({ catalogue: locCat, ledger, evidence: [ful("e-1", "2026-01-02T00:00:00Z")] })).toBe("INVALID_EVIDENCE");
    expect(stateOf({ evidence: [ful("e-1", INSIDE, { occurrenceAnchor: ANCHOR })] })).toBe("INVALID_EVIDENCE");
  });
});

describe("C2 test 4 — empty production catalogue", () => {
  it("is empty and frozen, and every queried obligation is UNSUPPORTED", () => {
    expect(PRODUCTION_OBLIGATION_CATALOGUE.definitions).toEqual([]);
    expect(PRODUCTION_OBLIGATION_CATALOGUE.ruleVersions).toEqual([]);
    expect(Object.isFrozen(PRODUCTION_OBLIGATION_CATALOGUE.definitions)).toBe(true);
    const ev = run({ catalogue: PRODUCTION_OBLIGATION_CATALOGUE, ids: ["SYNTH-OBLIGATION-A", "SYNTH-OBLIGATION-B"], evidence: [ful("e-1", INSIDE)] });
    expect(ev.results.map((r) => [r.obligationId, r.state])).toEqual([
      ["SYNTH-OBLIGATION-A", "UNSUPPORTED"],
      ["SYNTH-OBLIGATION-B", "UNSUPPORTED"],
    ]);
    for (const r of ev.results) {
      expect(r.reasonCodes).toContain("CATTLE_OBLIGATION_NOT_IN_CATALOGUE");
      expect(r.ruleEvaluation.state).toBe("UNSUPPORTED");
    }
  });

  it("feeding the empty-catalogue result to a C0 evidence pack is never ACTIONABLE", () => {
    const { projection, pack } = packFor(run({ catalogue: PRODUCTION_OBLIGATION_CATALOGUE }));
    expect(projection.entries.map((e) => e.packState)).toEqual(["UNSUPPORTED"]);
    expect(pack.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(pack.actionableActionId).toBeNull();
  });
});

describe("C2 test 5 — review required", () => {
  const def = definition();

  it("a non-production rule version is REVIEW_REQUIRED, even when approved and fulfilled", () => {
    for (const productionState of ["DRAFT", "APPROVED", "BLOCKED"] as const) {
      const rule = boundRule(def, { productionState });
      const r = only(run({ catalogue: catalogueOf({ def, rule }), effectiveAt: "2026-04-01T00:00:00Z", evidence: [ful("e-1", INSIDE)] }));
      expect(r.state).toBe("REVIEW_REQUIRED");
      expect(r.rule).toEqual({ ruleId: RULE_ID, version: 1 });
      expect(r.ruleEvaluation.reasonCodes).toContain(`CATTLE_RULE_NOT_IN_PRODUCTION:${productionState}`);
      expect(r.reasonCodes).toContain("CATTLE_OBLIGATION_RULE_NOT_RELEASED");
    }
  });

  it("an unapproved version, or one approved only after the cutoff, is REVIEW_REQUIRED", () => {
    const rule = boundRule(def);
    expect(stateOf({ catalogue: catalogueOf({ def, rule, reviews: [] }) })).toBe("REVIEW_REQUIRED");
    const lateReview = approve(rule, rule.requiredReviews, "2026-06-01T00:00:00Z");
    expect(stateOf({ catalogue: catalogueOf({ def, rule, reviews: lateReview }), knowledgeCutoff: "2026-05-01T00:00:00Z" })).toBe("REVIEW_REQUIRED");
    expect(stateOf({ catalogue: catalogueOf({ def, rule, reviews: lateReview }), knowledgeCutoff: "2026-06-01T00:00:00Z" })).toBe("OUTSTANDING");
  });

  it("a source binding that is no longer current is REVIEW_REQUIRED", () => {
    const changed = [{ ...LEGAL_SOURCE, lifecycle: "SUPERSEDED" as const }, { ...LEGAL_SOURCE, version: "v2" }, SCIENCE_SOURCE, VET_SOURCE];
    const r = only(run({ catalogue: catalogueOf({ sources: changed }), evidence: [ful("e-1", INSIDE)] }));
    expect(r.state).toBe("REVIEW_REQUIRED");
    expect(r.ruleEvaluation.reasonCodes).toContain("CATTLE_SOURCE_SOURCE_VERSION_CHANGED:SYNTH-SRC-LEGAL");
  });

  it("fulfilment evidence for another rule version needs review, it is never counted", () => {
    const r = only(run({ effectiveAt: "2026-04-01T00:00:00Z", evidence: [ful("e-1", INSIDE, { rule: { ruleId: RULE_ID, version: 7 } })] }));
    expect(r.state).toBe("REVIEW_REQUIRED");
    expect(r.evidence.otherRuleVersionEvidenceIds).toEqual(["e-1"]);
    expect(r.evidence.countedEvidence).toEqual([]);
  });
});

function versionPair(v2Overrides: Partial<CattleRuleVersion> = {}, v2Recorded = "2026-01-01T00:00:00Z") {
  const d1 = definition();
  const d2 = definition({ ruleVersion: 2, recordedAt: v2Recorded }, { window: { opensAfter: { amount: 0, unit: "DAY" }, dueAfter: { amount: 20, unit: "DAY" }, boundary: "INCLUSIVE_START_EXCLUSIVE_END" } });
  const r1 = boundRule(d1, { effectiveTo: "2026-06-01", productionState: "SUPERSEDED" });
  const r2 = boundRule(d2, { effectiveFrom: "2026-06-01", supersedes: { ruleId: RULE_ID, version: 1 }, ...v2Overrides });
  return {
    d1,
    d2,
    r1,
    r2,
    catalogue: { definitions: [d1, d2], ruleVersions: [r1, r2], sources: CATALOGUE, reviews: [...approve(r1), ...approve(r2)], implementations: [passImpl] } as ObligationCatalogue,
  };
}

describe("C2 test 6 — rule supersession and lineage", () => {
  it("selects the version effective on each side of the boundary", () => {
    const { catalogue } = versionPair();
    const before = only(run({ catalogue, effectiveAt: "2026-05-31T23:59:59.999Z" }));
    const after = only(run({ catalogue, effectiveAt: "2026-06-01T00:00:00Z" }));
    expect(before.rule).toEqual({ ruleId: RULE_ID, version: 1 });
    expect(before.window?.dueAt).toBe("2026-03-11T00:00:00.000000000Z");
    expect(after.rule).toEqual({ ruleId: RULE_ID, version: 2 });
    expect(after.window?.dueAt).toBe("2026-03-21T00:00:00.000000000Z");
  });

  it("invalid lineage is UNSUPPORTED with the lineage issue preserved", () => {
    const { catalogue } = versionPair({ supersedes: { ruleId: RULE_ID, version: 0 } });
    const r = only(run({ catalogue, effectiveAt: "2026-07-01T00:00:00Z" }));
    expect(r.state).toBe("UNSUPPORTED");
    expect(r.rule).toBeNull();
    expect(r.ruleEvaluation.reasonCodes).toContain("CATTLE_RULE_INVALID_SUPERSESSION_LINEAGE");
  });

  it("no effective version, unbound terms, unbound window source, local time, missing implementation or untermed version are UNSUPPORTED", () => {
    const def = definition();
    expect(stateOf({ effectiveAt: "2025-12-31T23:59:59Z" })).toBe("UNSUPPORTED");
    const unbound = catalogueOf({ def, rule: synthRule({ ruleId: RULE_ID, requiredInputs: [], implementation: bindTo(passImpl) }) });
    expect(only(run({ catalogue: unbound })).reasonCodes).toContain("CATTLE_OBLIGATION_TERMS_NOT_BOUND_TO_RULE_VERSION");
    const otherSource = definition({}, { windowSource: sourceVersionRef(SCIENCE_SOURCE) });
    expect(only(run({ catalogue: catalogueOf({ def: otherSource }) })).reasonCodes).toContain("CATTLE_OBLIGATION_WINDOW_SOURCE_NOT_BOUND");
    const local = definition({}, { timeBasis: "HOLDING_LOCAL_TIME" });
    const localRun = only(run({ catalogue: catalogueOf({ def: local }) }));
    expect(localRun.state).toBe("UNSUPPORTED");
    expect(localRun.reasonCodes).toContain("CATTLE_OBLIGATION_TIME_BASIS_UNSUPPORTED:HOLDING_LOCAL_TIME");
    const noImpl = { ...catalogueOf(), implementations: [] };
    expect(only(run({ catalogue: noImpl })).reasonCodes).toContain("CATTLE_OBLIGATION_IMPLEMENTATION_NOT_SUPPLIED");
    const { catalogue, d2 } = versionPair();
    const untermed = { ...catalogue, definitions: catalogue.definitions.filter((d) => d !== d2) };
    expect(only(run({ catalogue: untermed })).reasonCodes).toContain("CATTLE_OBLIGATION_RULE_VERSION_WITHOUT_TERMS:v2");
    for (const c of [unbound, noImpl, untermed]) expect(stateOf({ catalogue: c })).toBe("UNSUPPORTED");
  });
});

describe("C2 test 7 — append-only fulfilment evidence", () => {
  const AT = "2026-04-01T00:00:00Z";

  it("a correction supersedes the earlier record; history is kept", () => {
    const r = only(run({ effectiveAt: AT, evidence: [ful("e-1", "2026-03-20T00:00:00Z"), ful("e-2", INSIDE, { supersedes: ["e-1"] })] }));
    expect(r.state).toBe("SATISFIED");
    expect(r.evidence.consideredEvidenceIds).toEqual(["e-1", "e-2"]);
    expect(r.evidence.supersededEvidenceIds).toEqual(["e-1"]);
    expect(r.evidence.countedEvidence.map((e) => e.evidenceId)).toEqual(["e-2"]);
  });

  it("a retraction removes the fulfilment without deleting it", () => {
    const r = only(run({ effectiveAt: AT, evidence: [ful("e-1", INSIDE), ful("e-2", INSIDE, { kind: "RETRACTION", fulfilledAt: null, supersedes: ["e-1"] })] }));
    expect(r.state).toBe("OVERDUE");
    expect(r.evidence.supersededEvidenceIds).toEqual(["e-1"]);
  });

  it("an identical duplicate is idempotent (instants compared by instant); same id with different content fails closed", () => {
    const a = ful("e-1", INSIDE);
    const b = ful("e-1", "2026-03-05T00:00:00.000Z", { provenance: { sourceCategory: "FARMER", receivedAt: "2026-03-20T00:00:00.0Z" } });
    const log = createObligationEvidenceLog(A, [a, b]);
    expect(log.ok && log.idempotentDuplicateIds).toEqual(["e-1"]);
    expect(stateOf({ effectiveAt: AT, evidence: [a, b] })).toBe("SATISFIED");
    const different = ful("e-1", "2026-03-06T00:00:00Z");
    const bad = createObligationEvidenceLog(A, [a, different]);
    expect(!bad.ok && bad.issues.map((i) => i.code)).toEqual(["CATTLE_OBLIGATION_EVIDENCE_DUPLICATE_ID_DIFFERENT_CONTENT"]);
    const ev = run({ effectiveAt: AT, evidence: [a, different] });
    expect(only(ev).state).toBe("INVALID_EVIDENCE");
    expect(ev.evidenceIssues.map((i) => i.code)).toEqual(["CATTLE_OBLIGATION_EVIDENCE_DUPLICATE_ID_DIFFERENT_CONTENT"]);
  });

  it("competing live corrections stay EVIDENCE_CONFLICT with no winner", () => {
    const r = only(
      run({
        effectiveAt: AT,
        evidence: [ful("e-1", "2026-03-20T00:00:00Z"), ful("e-2", INSIDE, { supersedes: ["e-1"] }), ful("e-3", "2026-03-06T00:00:00Z", { supersedes: ["e-1"], provenance: { sourceCategory: "OFFICIAL_REGISTRY", receivedAt: "2026-03-25T00:00:00Z" } })],
      }),
    );
    expect(r.state).toBe("EVIDENCE_CONFLICT");
    expect(r.evidence.conflictingEvidenceIds).toEqual(["e-2", "e-3"]);
  });

  it("a supersession cycle or a link to an unknown/other-obligation record is INVALID_EVIDENCE", () => {
    expect(stateOf({ effectiveAt: AT, evidence: [ful("e-1", INSIDE, { supersedes: ["e-2"] }), ful("e-2", INSIDE, { supersedes: ["e-1"] })] })).toBe("INVALID_EVIDENCE");
    expect(stateOf({ effectiveAt: AT, evidence: [ful("e-1", INSIDE, { supersedes: ["e-missing"] })] })).toBe("INVALID_EVIDENCE");
    expect(stateOf({ effectiveAt: AT, evidence: [ful("e-0", INSIDE, { obligationId: "SYNTH-OTHER" }), ful("e-1", INSIDE, { supersedes: ["e-0"] })] })).toBe("INVALID_EVIDENCE");
  });

  it("append returns a new log and never rewrites the supplied one", () => {
    const first = createObligationEvidenceLog(A, [ful("e-1", INSIDE)]);
    if (!first.ok) throw new Error("log");
    const next = appendObligationEvidence(first.log, [ful("e-2", OPEN)]);
    expect(next.ok && next.log.records.map((r) => r.evidenceId)).toEqual(["e-1", "e-2"]);
    expect(first.log.records).toHaveLength(1);
  });

  it("generic record machinery resolves only what is known by the cutoff", () => {
    const recs = [
      { recordId: "r-1", supersedes: [], receivedAt: "2026-01-01T00:00:00Z", v: 1 },
      { recordId: "r-2", supersedes: ["r-1"], receivedAt: "2026-02-01T00:00:00Z", v: 2 },
    ];
    const collected = collectBitemporalRecords(recs, (r) => JSON.stringify(r));
    expect(collected.ok).toBe(true);
    const opts = { linkAllowed: () => true, competitionKey: (r: { v: number }) => String(r.v) };
    expect(resolveBitemporalRecords(recs, "2026-01-15T00:00:00Z", opts).live.map((r) => r.recordId)).toEqual(["r-1"]);
    expect(resolveBitemporalRecords(recs, "2026-02-01T00:00:00Z", opts).live.map((r) => r.recordId)).toEqual(["r-2"]);
  });
});

describe("C2 test 8 — bitemporal reconstruction", () => {
  it("an earlier knowledge cutoff reproduces the earlier state and fingerprint after later corrections, late evidence and rule supersession", () => {
    const EARLY = "2026-03-06T00:00:00Z";
    const AT = "2026-07-01T00:00:00Z";
    const early = { ...versionPair().d1 };
    const catalogueEarly = catalogueOf({ def: early });
    const evidenceEarly = [ful("e-1", INSIDE, { provenance: { sourceCategory: "FARMER", receivedAt: "2026-03-05T12:00:00Z" } })];
    const ledgerEarly = BASE_LEDGER();
    const before = run({ catalogue: catalogueEarly, ledger: ledgerEarly, evidence: evidenceEarly, effectiveAt: AT, knowledgeCutoff: EARLY });
    expect(only(before).state).toBe("SATISFIED");

    // Later: a DOB correction, a late fulfilment correction, and a retroactive v2 rule version.
    const ledgerLater = ledgerOf([
      dob("a-dob", DOB),
      sex("a-sex", "FEMALE"),
      life("a-life", "PRESENT"),
      dob("a-dob-fix", "2026-02-01", "2026-04-01T00:00:00Z", { supersedes: ["a-dob"] }),
    ]);
    const evidenceLater = [...evidenceEarly, ful("e-2", "2026-03-30T00:00:00Z", { supersedes: ["e-1"], provenance: { sourceCategory: "OFFICIAL_REGISTRY", receivedAt: "2026-04-02T00:00:00Z" } })];
    const d2 = definition({ ruleVersion: 2, recordedAt: "2026-04-03T00:00:00Z" });
    const r1 = boundRule(early, { productionState: "SUPERSEDED" });
    const r2 = boundRule(d2, { supersedes: { ruleId: RULE_ID, version: 1 } });
    const catalogueLater: ObligationCatalogue = {
      definitions: [early, d2],
      ruleVersions: [r1, r2],
      sources: CATALOGUE,
      reviews: [...approve(r1), ...approve(r2, r2.requiredReviews, "2026-04-03T00:00:00Z")],
      implementations: [passImpl],
    };
    const reproduced = run({ catalogue: catalogueLater, ledger: ledgerLater, evidence: evidenceLater, effectiveAt: AT, knowledgeCutoff: EARLY });
    expect(reproduced).toEqual(before);
    expect(reproduced.results[0].fingerprint).toEqual(before.results[0].fingerprint);

    const now = only(run({ catalogue: catalogueLater, ledger: ledgerLater, evidence: evidenceLater, effectiveAt: AT, knowledgeCutoff: CUTOFF }));
    expect(now.rule).toEqual({ ruleId: RULE_ID, version: 2 });
    expect(now.occurrence?.anchorAt).toBe("2026-02-01T00:00:00.000000000Z");
    expect(now.evidence.otherRuleVersionEvidenceIds).toEqual(["e-2"]);
    expect(now.state).toBe("REVIEW_REQUIRED");
    expect(now.fingerprint).not.toEqual(before.results[0].fingerprint);
  });

  it("a malformed or contradictory definition recorded after the cutoff cannot change an earlier reconstruction", () => {
    const EARLY = "2026-03-21T00:00:00Z";
    const AT = "2026-04-01T00:00:00Z";
    const evidence = [ful("e-1", INSIDE)];
    const before = run({ effectiveAt: AT, knowledgeCutoff: EARLY, evidence });
    expect(only(before).state).toBe("SATISFIED");
    const base = catalogueOf();
    const negative = definition({ ruleVersion: 2, recordedAt: "2026-04-01T00:00:00Z" }, { window: { opensAfter: { amount: 1, unit: "DAY" }, dueAfter: { amount: -1, unit: "DAY" }, boundary: "INCLUSIVE_START_EXCLUSIVE_END" } });
    const contradictory = definition({ recordedAt: "2026-04-01T00:00:00Z" }, { obligationKind: "SYNTH-OTHER-KIND" });
    const otherRule = definition({ ruleId: "SYNTH-RULE-OTHER", ruleVersion: 3, recordedAt: "2026-04-01T00:00:00Z" });
    for (const later of [negative, contradictory, otherRule]) {
      const cat = { ...base, definitions: [...base.definitions, later] };
      const reproduced = run({ catalogue: cat, effectiveAt: AT, knowledgeCutoff: EARLY, evidence });
      expect(reproduced).toEqual(before);
      expect(only(run({ catalogue: cat, effectiveAt: AT, evidence })).state).toBe("UNSUPPORTED");
    }
    // An unreadable knowledge time is never set aside: it still fails closed.
    const unreadable = { ...definition({ ruleVersion: 2 }), recordedAt: "not-an-instant" };
    expect(only(run({ catalogue: { ...base, definitions: [...base.definitions, unreadable] }, effectiveAt: AT, knowledgeCutoff: EARLY, evidence })).state).toBe("UNSUPPORTED");
  });

  it("terms or a whole obligation recorded after the cutoff cannot change an earlier reconstruction", () => {
    const EARLY = "2026-03-21T00:00:00Z";
    const { catalogue, d2 } = versionPair();
    const missing = { ...catalogue, definitions: catalogue.definitions.filter((d) => d !== d2) };
    const lateTerms = { ...missing, definitions: [...missing.definitions, { ...d2, recordedAt: "2026-04-01T00:00:00Z" }] };
    const evidence = [ful("e-1", INSIDE)];
    const before = run({ catalogue: missing, effectiveAt: INSIDE, knowledgeCutoff: EARLY, evidence });
    expect(only(before).state).toBe("UNSUPPORTED");
    expect(only(before).reasonCodes).toContain("CATTLE_OBLIGATION_RULE_VERSION_WITHOUT_TERMS:v2");
    expect(run({ catalogue: lateTerms, effectiveAt: INSIDE, knowledgeCutoff: EARLY, evidence })).toEqual(before);

    const OTHER = "SYNTH-OBLIGATION-FUTURE";
    const base = catalogueOf();
    const absent = run({ catalogue: base, knowledgeCutoff: EARLY, ids: [OBL, OTHER] });
    const futureOnly = { ...base, definitions: [...base.definitions, definition({ obligationId: OTHER, recordedAt: "2026-04-01T00:00:00Z" })] };
    expect(run({ catalogue: futureOnly, knowledgeCutoff: EARLY, ids: [OBL, OTHER] })).toEqual(absent);
  });

  it("a record received after the cutoff — even a contradictory one — cannot change an earlier reconstruction", () => {
    const EARLY = "2026-03-21T00:00:00Z";
    const AT = "2026-04-01T00:00:00Z";
    const before = run({ effectiveAt: AT, knowledgeCutoff: EARLY, evidence: [ful("e-1", INSIDE)] });
    const clash = ful("e-1", "2026-03-06T00:00:00Z", { provenance: { sourceCategory: "FARMER", receivedAt: "2026-05-01T00:00:00Z" } });
    expect(run({ effectiveAt: AT, knowledgeCutoff: EARLY, evidence: [ful("e-1", INSIDE), clash] })).toEqual(before);
    expect(only(run({ effectiveAt: AT, evidence: [ful("e-1", INSIDE), clash] })).state).toBe("INVALID_EVIDENCE");
  });
});

describe("C2 test 9 — hard gates", () => {
  const def = definition();
  const gateRule = boundRule(def, { requiredInputs: [descriptor("cattle.animal.lifecycleStatus")] }, presentImpl);
  const gateCat = catalogueOf({ def, rule: gateRule, implementation: presentImpl });

  it("a hard-gate FAIL is BLOCKED, exposed by the projection, and blocks a C0 evidence pack", () => {
    const deceased = ledgerOf([dob("a-dob", DOB), life("a-life", "DECEASED")]);
    const ev = run({ catalogue: gateCat, ledger: deceased });
    expect(only(ev).state).toBe("BLOCKED");
    const { projection, pack } = packFor(ev);
    expect(projection.entries).toHaveLength(1);
    expect(projection.entries[0]).toMatchObject({ state: "BLOCKED", packState: "FAIL", rule: { ruleId: RULE_ID, version: 1 }, gateRole: "HARD_GATE" });
    expect(projection.requiredHardGateRuleIds).toEqual([RULE_ID]);
    expect(pack.outcome).toBe("BLOCKED");
    expect(pack.actionableActionId).toBeNull();
  });

  it("only SATISFIED/NOT_APPLICABLE hard gates let a pack become ACTIONABLE", () => {
    expect(packFor(run({ catalogue: gateCat, effectiveAt: "2026-04-01T00:00:00Z", evidence: [ful("e-1", INSIDE)] })).pack.outcome).toBe("ACTIONABLE");
    expect(packFor(run({ catalogue: gateCat })).pack.outcome).toBe("INSUFFICIENT_EVIDENCE"); // OUTSTANDING
    expect(packFor(run({ catalogue: gateCat, effectiveAt: "2026-04-01T00:00:00Z" })).pack.outcome).toBe("BLOCKED"); // OVERDUE
  });

  it("an advisory FAIL is ADVISORY_FAIL and is not a hard gate", () => {
    const scienceDef = definition({}, { windowSource: sourceVersionRef(SCIENCE_SOURCE) });
    const advisory = boundRule(
      scienceDef,
      { classification: "SCIENCE_TARGET", gateRole: "ADVISORY", requiredReviews: ["SCIENTIFIC"], sourceBindings: [sourceVersionRef(SCIENCE_SOURCE)], requiredInputs: [descriptor("cattle.animal.lifecycleStatus")] },
      presentImpl,
    );
    const ev = run({ catalogue: catalogueOf({ def: scienceDef, rule: advisory, implementation: presentImpl }), ledger: ledgerOf([dob("a-dob", DOB), life("a-life", "DEPARTED")]) });
    expect(only(ev).state).toBe("ADVISORY_FAIL");
    const p = projectObligationHardGates(ev, hash);
    expect(p.ok && p.projection.entries).toEqual([]);
  });

  it("a tampered record fails the projection closed", () => {
    const ev = run();
    const tampered = structuredClone(ev) as AnimalObligationEvaluation;
    (tampered.results[0] as { state: string }).state = "SATISFIED";
    const p = projectObligationHardGates(tampered, hash);
    expect(p.ok).toBe(false);
  });
});

describe("C2 test 10 — classifications preserved verbatim", () => {
  const cases: { classification: CattleRuleClassification; gateRole: CattleRuleGateRole; source: CattleEvidenceSource; reviews: CattleReviewDimension[] }[] = [
    { classification: "LEGAL_REQUIRED", gateRole: "HARD_GATE", source: LEGAL_SOURCE, reviews: ["LEGAL"] },
    { classification: "LEGAL_CONDITIONAL", gateRole: "HARD_GATE", source: LEGAL_SOURCE, reviews: ["LEGAL"] },
    { classification: "SCHEME_CONDITIONAL", gateRole: "ADVISORY", source: LEGAL_SOURCE, reviews: ["LEGAL"] },
    { classification: "VETERINARY_PROGRAMME", gateRole: "HARD_GATE", source: VET_SOURCE, reviews: ["VETERINARY"] },
    { classification: "SCIENCE_TARGET", gateRole: "ADVISORY", source: SCIENCE_SOURCE, reviews: ["SCIENTIFIC"] },
    { classification: "SCIENCE_CONSTRAINT", gateRole: "HARD_GATE", source: SCIENCE_SOURCE, reviews: ["SCIENTIFIC"] },
    { classification: "FARMER_INTENT", gateRole: "ADVISORY", source: LEGAL_SOURCE, reviews: [] },
    { classification: "SYSTEM_INFERENCE", gateRole: "ADVISORY", source: SCIENCE_SOURCE, reviews: ["SCIENTIFIC"] },
  ];
  it.each(cases)("$classification", ({ classification, gateRole, source, reviews }) => {
    const def = definition({}, { windowSource: sourceVersionRef(source) });
    const rule = boundRule(def, { classification, gateRole, requiredReviews: reviews, sourceBindings: [sourceVersionRef(source)] });
    const r = only(run({ catalogue: catalogueOf({ def, rule }), effectiveAt: "2026-04-01T00:00:00Z", evidence: [ful("e-1", INSIDE)] }));
    expect(r.state).toBe("SATISFIED");
    expect(r.classification).toBe(classification);
    expect(r.ruleEvaluation.classification).toBe(classification);
    expect(r.gateRole).toBe(gateRole);
    expect(r.informationClass).toBe("OBLIGATION_OR_CONSTRAINT");
  });
});

describe("C2 test 11 — determinism, aliasing and immutability", () => {
  const twoDefs = () => {
    const d1 = definition();
    const d2 = definition({ obligationId: "SYNTH-OBLIGATION-2", ruleId: "SYNTH-RULE-2" });
    const r1 = boundRule(d1);
    const r2 = boundRule(d2);
    return { definitions: [d1, d2], ruleVersions: [r1, r2], sources: CATALOGUE, reviews: [...approve(r1), ...approve(r2)], implementations: [passImpl] };
  };
  const evidence = [ful("e-1", INSIDE), ful("e-2", OPEN, { obligationId: "SYNTH-OBLIGATION-2", rule: { ruleId: "SYNTH-RULE-2", version: 1 } })];

  it("input order never changes the result", () => {
    const cat = twoDefs();
    const a = run({ catalogue: cat, evidence, ids: [OBL, "SYNTH-OBLIGATION-2"], effectiveAt: "2026-04-01T00:00:00Z" });
    const reversed = {
      definitions: [...cat.definitions].reverse(),
      ruleVersions: [...cat.ruleVersions].reverse(),
      sources: [...cat.sources].reverse(),
      reviews: [...cat.reviews].reverse(),
      implementations: cat.implementations,
    };
    const b = run({ catalogue: reversed, evidence: [...evidence].reverse(), ids: ["SYNTH-OBLIGATION-2", OBL, OBL], effectiveAt: "2026-04-01T00:00:00.000Z" });
    expect(b).toEqual(a);
  });

  it("mutating inputs after the call changes nothing; outputs are deep-frozen", () => {
    const cat = twoDefs();
    const ev = [ful("e-1", INSIDE)];
    const result = run({ catalogue: cat, evidence: ev, effectiveAt: "2026-04-01T00:00:00Z" });
    const snapshot = structuredClone(result);
    (ev[0] as { fulfilledAt: string }).fulfilledAt = "2026-09-01T00:00:00Z";
    (cat.definitions[0].terms.window.dueAfter as { amount: number }).amount = 99;
    (cat.ruleVersions[0] as { classification: string }).classification = "FARMER_INTENT";
    expect(result).toEqual(snapshot);
    const r = result.results[0];
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(r.evidence.countedEvidence[0].provenance)).toBe(true);
    expect(Object.isFrozen(r.ruleEvaluation.reasonCodes)).toBe(true);
    expect(() => {
      (r as { state: string }).state = "OVERDUE";
    }).toThrow();
  });
});

describe("C2 test 12 — fingerprints", () => {
  it("are deterministic, verifiable and change with state, rule version, evidence id and cutoff", () => {
    const AT = "2026-04-01T00:00:00Z";
    const base = only(run({ effectiveAt: AT, evidence: [ful("e-1", INSIDE)] }));
    expect(only(run({ effectiveAt: AT, evidence: [ful("e-1", INSIDE)] })).fingerprint).toEqual(base.fingerprint);
    expect(verifyObligationStateRecord(base, hash).valid).toBe(true);
    expect(verifyObligationStateRecord({ ...base, state: "OVERDUE" }, hash).valid).toBe(false);
    const variants = [
      only(run({ effectiveAt: AT })), // state
      only(run({ effectiveAt: AT, evidence: [ful("e-9", INSIDE)] })), // evidence id
      only(run({ effectiveAt: AT, evidence: [ful("e-1", INSIDE)], knowledgeCutoff: "2026-11-30T00:00:00Z" })), // cutoff
    ];
    const { catalogue } = versionPair();
    variants.push(only(run({ catalogue, effectiveAt: "2026-06-01T00:00:00Z", evidence: [ful("e-1", INSIDE)] }))); // rule version
    for (const v of variants) expect(v.fingerprint.digest).not.toBe(base.fingerprint.digest);
    expect(new Set(variants.map((v) => v.fingerprint.digest)).size).toBe(variants.length);
  });
});

describe("C2 test 13 — no clock read", () => {
  it("no deterministic module reads a clock or randomness", () => {
    const dir = __dirname;
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) expect(readFileSync(join(dir, file), "utf8")).not.toMatch(/Date\.now|new Date|Math\.random|performance\.now/);
  });

  it("evaluation is unaffected by the system clock", () => {
    const first = run({ evidence: [ful("e-1", INSIDE)] });
    vi.useFakeTimers({ now: Date.UTC(2031, 0, 1) });
    vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("clock read");
    });
    try {
      expect(run({ evidence: [ful("e-1", INSIDE)] })).toEqual(first);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("C2 test 14 — malformed input fails closed", () => {
  it("a malformed definition fails the whole catalogue: every obligation UNSUPPORTED", () => {
    const def = definition();
    const bad = [
      { ...def, ruleVersion: 0 },
      { ...def, terms: { ...def.terms, anchor: { kind: "SYNTH-UNKNOWN-ANCHOR" } } },
      { ...def, terms: { ...def.terms, window: { ...def.terms.window, dueAfter: { amount: 1, unit: "DAY" } } } }, // due == open
      { ...def, terms: { ...def.terms, window: { ...def.terms.window, boundary: "EXCLUSIVE_START" } } },
      { ...def, terms: { ...def.terms, window: { ...def.terms.window, opensAfter: { amount: 1, unit: "MONTH" } } } },
      { ...def, recordedAt: "2026-01-01" },
    ];
    for (const malformed of bad) {
      const cat = { ...catalogueOf({ def }), definitions: [def, malformed] };
      const checked = materialiseObligationCatalogue(cat);
      expect(checked.ok).toBe(false);
      const ev = run({ catalogue: cat, evidence: [ful("e-1", INSIDE)] });
      expect(only(ev).state).toBe("UNSUPPORTED");
      expect(only(ev).reasonCodes).toEqual(["CATTLE_OBLIGATION_CATALOGUE_INVALID"]);
      expect(ev.catalogueIssues.length).toBeGreaterThan(0);
    }
  });

  it("contradictory duplicates and malformed C0 entries fail the catalogue", () => {
    const def = definition();
    const c = catalogueOf({ def });
    const variants = [
      { ...c, definitions: [def, { ...def, terms: { ...def.terms, obligationKind: "SYNTH-OTHER" } }] },
      { ...c, definitions: [def, { ...def, ruleVersion: 2, ruleId: "SYNTH-RULE-OTHER" }] },
      { ...c, ruleVersions: [...c.ruleVersions, { ...c.ruleVersions[0], title: "changed" }] },
      { ...c, ruleVersions: [{ ...c.ruleVersions[0], applicability: "nope" }] },
      { ...c, reviews: [{ ...c.reviews[0], reviewedAt: "yesterday" }] },
      { ...c, sources: [{ ...LEGAL_SOURCE, contentFingerprint: null }] },
      { ...c, implementations: [passImpl, impl(() => "PASS", "SYNTH-IMPL-OBLIGATION")] },
      { ...c, implementations: [{ implementationId: "x", version: 1, evaluate: "not a function" }] },
      null,
      { ...c, definitions: "nope" },
    ];
    for (const v of variants) {
      expect(materialiseObligationCatalogue(v).ok).toBe(false);
      expect(stateOf({ catalogue: v })).toBe("UNSUPPORTED");
    }
  });

  it("malformed evidence fails the log closed", () => {
    const bad = [
      ful("e-1", "2026-03-05"),
      ful("e-1", INSIDE, { kind: "SYNTH-KIND" }),
      ful("e-1", INSIDE, { kind: "RETRACTION", fulfilledAt: null }),
      ful("e-1", INSIDE, { rule: { ruleId: RULE_ID, version: 0 } }),
      ful("e-1", INSIDE, { animalId: B }),
      ful("e-1", INSIDE, { supersedes: ["e-1"] }),
      ful("e-1", INSIDE, { provenance: { sourceCategory: "SYNTH", receivedAt: INSIDE } }),
      ful("e-1", INSIDE, { occurrenceAnchor: "2026-03-01" }),
      { evidenceId: "e-1", get animalId() { return () => A; } },
      "not an object",
    ];
    for (const b of bad) {
      expect(createObligationEvidenceLog(A, [b]).ok).toBe(false);
      const ev = run({ evidence: [b] });
      expect(only(ev).state).toBe("INVALID_EVIDENCE");
      expect(ev.evidenceIssues.length).toBeGreaterThan(0);
    }
  });

  it("invalid query times, obligation ids or ledger fail closed", () => {
    const query = { effectiveAt: "2026-03-05", knowledgeCutoff: CUTOFF, obligationIds: [OBL] };
    const r1 = evaluateAnimalObligations({ ledger: BASE_LEDGER(), evidence: [], catalogue: catalogueOf(), query }, hash);
    expect(!r1.ok && r1.issues).toEqual(["CATTLE_OBLIGATION_INVALID_EFFECTIVE_AT"]);
    const r2 = evaluateAnimalObligations({ ledger: BASE_LEDGER(), evidence: [], catalogue: catalogueOf(), query: { ...query, effectiveAt: INSIDE, obligationIds: [" bad"] } }, hash);
    expect(!r2.ok && r2.issues).toEqual(["CATTLE_OBLIGATION_INVALID_OBLIGATION_IDS"]);
    const r3 = evaluateAnimalObligations({ ledger: { ...BASE_LEDGER(), species: "OVINE" } as unknown as AnimalLedger, evidence: [], catalogue: catalogueOf(), query: { ...query, effectiveAt: INSIDE } }, hash);
    expect(!r3.ok && r3.issues).toEqual(["CATTLE_OBLIGATION_INVALID_LEDGER"]);
  });
});

describe("C2 herd helper", () => {
  const ledgerB = () => ledgerOf([{ ...dob("b-dob", DOB), animalId: B }], B);
  const evB = ful("e-b", INSIDE, { animalId: B });

  it("is input-order independent and evaluates each animal separately", () => {
    const query = { effectiveAt: "2026-04-01T00:00:00Z", knowledgeCutoff: CUTOFF, obligationIds: [OBL] };
    const a = evaluateHerdObligations({ ledgers: [BASE_LEDGER(), ledgerB()], evidence: [ful("e-1", INSIDE), evB], catalogue: catalogueOf(), query }, hash);
    const b = evaluateHerdObligations({ ledgers: [ledgerB(), BASE_LEDGER()], evidence: [evB, ful("e-1", INSIDE)], catalogue: catalogueOf(), query }, hash);
    expect(b).toEqual(a);
    expect(a.ok && a.herd.animals.map((x) => [x.animalId, x.results[0].state])).toEqual([
      [A, "SATISFIED"],
      [B, "SATISFIED"],
    ]);
    expect(a.ok && a.herd.issues).toEqual([]);
  });

  it("reports duplicate animals, invalid ledgers and orphan evidence; never merges", () => {
    const query = { effectiveAt: "2026-04-01T00:00:00Z", knowledgeCutoff: CUTOFF, obligationIds: [OBL] };
    const result = evaluateHerdObligations(
      {
        ledgers: [BASE_LEDGER(), BASE_LEDGER(), ledgerB(), { animalId: "SYNTH-ANIMAL-BAD", species: "OVINE", ledgerSchemaVersion: 1, assertions: [] }],
        evidence: [ful("e-x", INSIDE, { animalId: "SYNTH-ANIMAL-9" })],
        catalogue: catalogueOf(),
        query,
      },
      hash,
    );
    if (!result.ok) throw new Error("herd");
    expect(result.herd.animals.map((x) => x.animalId)).toEqual([B]);
    expect(result.herd.issues).toEqual([
      { code: "CATTLE_OBLIGATION_HERD_DUPLICATE_ANIMAL", animalId: A },
      { code: "CATTLE_OBLIGATION_HERD_EVIDENCE_FOR_UNEVALUATED_ANIMAL", animalId: "SYNTH-ANIMAL-9" },
      { code: "CATTLE_OBLIGATION_HERD_INVALID_LEDGER", animalId: "SYNTH-ANIMAL-BAD" },
    ]);
  });

  it("unattributable evidence fails every animal's evidence closed", () => {
    const query = { effectiveAt: "2026-04-01T00:00:00Z", knowledgeCutoff: CUTOFF, obligationIds: [OBL] };
    const result = evaluateHerdObligations({ ledgers: [BASE_LEDGER(), ledgerB()], evidence: [ful("e-1", INSIDE), { evidenceId: "e-z" }], catalogue: catalogueOf(), query }, hash);
    if (!result.ok) throw new Error("herd");
    expect(result.herd.animals.map((x) => x.results[0].state)).toEqual(["INVALID_EVIDENCE", "INVALID_EVIDENCE"]);
    expect(result.herd.issues.map((i) => i.code)).toEqual(["CATTLE_OBLIGATION_HERD_EVIDENCE_UNATTRIBUTABLE"]);
  });
});

describe("C2 remediation — NOT_APPLICABLE requires an anchor resolved for the animal's whole life (whole class)", () => {
  const female = { input: descriptor("cattle.animal.sex"), equals: "FEMALE" };
  const anchors = {
    dob: { kind: "DATE_OF_BIRTH" },
    departed: { kind: "LIFECYCLE_STATUS_START", status: "DEPARTED" },
    housing: { kind: "LOCATION_START", locationKind: "HOUSING" },
    anyLocation: { kind: "LOCATION_START", locationKind: null },
  } as const;
  const catFor = (anchor: ObligationTerms["anchor"]) => {
    const def = definition({}, { anchor });
    return catalogueOf({ def, rule: boundRule(def, { applicability: [female] }) });
  };
  const male = (...rest: AnimalAssertionInput[]) => ledgerOf([sex("a-sex", "MALE"), ...rest]);
  const AT = "2026-03-10T00:00:00Z";
  const field = (id: string, from: string, to: string | null) => loc(id, `ref-${id}`, from, to);

  /** Interval records for one dimension; `life` for lifecycle anchors, `field` for location anchors. */
  const records = (anchorKind: "departed" | "housing" | "anyLocation", spans: [string, string | null][]) =>
    spans.map(([from, to], i) => (anchorKind === "departed" ? life(`r-${i}`, "PRESENT", from, to) : field(`r-${i}`, from, to)));

  function expectNeverCleared(anchor: ObligationTerms["anchor"], ledger: AnimalLedger, expected: string) {
    const ev = run({ catalogue: catFor(anchor), ledger, effectiveAt: AT });
    const r = only(ev);
    expect(r.state).toBe(expected);
    expect(r.reasonCodes).toContain("CATTLE_OBLIGATION_RULE_NOT_APPLICABLE");
    const gates = projectObligationHardGates(ev, hash);
    expect(gates.ok && gates.projection.entries.map((e) => e.packState)).not.toContain("NOT_APPLICABLE");
    expect(packFor(ev).pack.outcome).not.toBe("ACTIONABLE");
  }

  it("date-of-birth anchor: unknown, source-reported unknown, conflicting and invalid birth dates are never cleared", () => {
    expectNeverCleared(anchors.dob, male(), "UNKNOWN");
    expectNeverCleared(anchors.dob, male(dob("d-1", null)), "UNKNOWN");
    expectNeverCleared(anchors.dob, male(dob("d-1", DOB), dob("d-2", "2026-03-02")), "EVIDENCE_CONFLICT");
    expectNeverCleared(anchors.dob, male(dob("d-1", DOB, undefined, { supersedes: ["d-missing"] })), "INVALID_EVIDENCE");
    expect(stateOf({ catalogue: catFor(anchors.dob), ledger: male(dob("d-1", DOB)), effectiveAt: AT })).toBe("NOT_APPLICABLE");
  });

  for (const name of ["departed", "housing", "anyLocation"] as const) {
    const anchor = anchors[name];
    describe(`${name} anchor`, () => {
      it("unknown, conflicting or invalid life start (birth date) is never cleared", () => {
        const covered = records(name, [["2026-01-01T00:00:00Z", null]]);
        expectNeverCleared(anchor, male(...covered), "UNKNOWN");
        expectNeverCleared(anchor, male(dob("d-1", null), ...covered), "UNKNOWN");
        expectNeverCleared(anchor, male(dob("d-1", DOB), dob("d-2", "2026-02-01"), ...covered), "EVIDENCE_CONFLICT");
        expectNeverCleared(anchor, male(dob("d-1", DOB, undefined, { supersedes: ["d-missing"] }), ...covered), "INVALID_EVIDENCE");
      });

      it("no record, a gap, a record starting after birth, or a record ending before the query is UNKNOWN", () => {
        expectNeverCleared(anchor, male(dob("a-dob", DOB)), "UNKNOWN");
        // The audit's reproduction: a gap between intervals before the query (no evidence inside it).
        expectNeverCleared(anchor, male(dob("a-dob", DOB), ...records(name, [["2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z"], ["2026-03-04T00:00:00Z", null]])), "UNKNOWN");
        expectNeverCleared(anchor, male(dob("a-dob", DOB), ...records(name, [["2026-03-03T00:00:00Z", null]])), "UNKNOWN");
        expectNeverCleared(anchor, male(dob("a-dob", DOB), ...records(name, [["2026-03-01T00:00:00Z", "2026-03-09T00:00:00Z"]])), "UNKNOWN");
      });

      it("a conflict anywhere in the life — past, at the query or after it — is EVIDENCE_CONFLICT", () => {
        for (const spans of [
          [["2026-03-01T00:00:00Z", null], ["2026-03-02T00:00:00Z", "2026-03-04T00:00:00Z"]],
          [["2026-03-01T00:00:00Z", null], ["2026-03-05T00:00:00Z", null]],
          [["2026-03-01T00:00:00Z", null], ["2026-04-01T00:00:00Z", null]],
        ] as [string, string | null][][]) {
          const conflicting = name === "departed" ? spans.map(([from, to], i) => life(`r-${i}`, i === 0 ? "PRESENT" : "DECEASED", from, to)) : records(name, spans);
          expectNeverCleared(anchor, male(dob("a-dob", DOB), ...conflicting), "EVIDENCE_CONFLICT");
        }
      });

      it("an invalid supersession in the dimension is INVALID_EVIDENCE", () => {
        const [first] = records(name, [["2026-03-01T00:00:00Z", null]]);
        expectNeverCleared(anchor, male(dob("a-dob", DOB), { ...first, supersedes: ["r-missing"] } as AnimalAssertionInput), "INVALID_EVIDENCE");
      });

      it("is NOT_APPLICABLE only when the dimension is known from the start of the birth date to the query", () => {
        const exact = records(name, [["2026-03-01T00:00:00Z", "2026-03-05T00:00:00Z"], ["2026-03-05T00:00:00Z", null]]);
        expect(stateOf({ catalogue: catFor(anchor), ledger: male(dob("a-dob", DOB), ...exact), effectiveAt: AT })).toBe("NOT_APPLICABLE");
        const before = records(name, [["2026-01-01T00:00:00Z", null]]);
        expect(stateOf({ catalogue: catFor(anchor), ledger: male(dob("a-dob", DOB), ...before), effectiveAt: AT })).toBe("NOT_APPLICABLE");
        // A query before birth has no life to cover.
        expect(stateOf({ catalogue: catFor(anchor), ledger: male(dob("a-dob", DOB)), effectiveAt: "2026-02-01T00:00:00Z" })).toBe("NOT_APPLICABLE");
      });
    });
  }

  it("an applicable rule with an unknown gap is UNKNOWN, never NOT_TRIGGERED", () => {
    const departed = catalogueOf({ def: definition({}, { anchor: anchors.departed }) });
    const gap = ledgerOf([dob("a-dob", DOB), life("l-1", "PRESENT", "2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z"), life("l-2", "PRESENT", "2026-03-04T00:00:00Z", null)]);
    expect(stateOf({ catalogue: departed, ledger: gap, effectiveAt: AT })).toBe("UNKNOWN");
    const housing = catalogueOf({ def: definition({}, { anchor: anchors.housing }) });
    const locGap = ledgerOf([dob("a-dob", DOB), field("l-1", "2026-03-01T00:00:00Z", "2026-03-02T00:00:00Z"), field("l-2", "2026-03-04T00:00:00Z", null)]);
    expect(stateOf({ catalogue: housing, ledger: locGap, effectiveAt: AT })).toBe("UNKNOWN");
  });
});

describe("C2 remediation — records known only after the cutoff never change a reconstruction (every catalogue record type)", () => {
  const EARLY = "2026-03-21T00:00:00Z";
  const AT = "2026-04-01T00:00:00Z";
  const LATER = "2026-04-01T00:00:00Z";
  const evidence = [ful("e-1", INSIDE)];
  const base = catalogueOf();
  const before = () => run({ catalogue: base, effectiveAt: AT, knowledgeCutoff: EARLY, evidence });
  const reproducesBefore = (catalogue: unknown) => {
    const expected = before();
    expect(only(expected).state).toBe("SATISFIED");
    const reproduced = run({ catalogue, effectiveAt: AT, knowledgeCutoff: EARLY, evidence });
    expect(reproduced).toEqual(expected);
    expect(reproduced.results[0].fingerprint).toEqual(expected.results[0].fingerprint);
    const herd = evaluateHerdObligations({ ledgers: [BASE_LEDGER()], evidence, catalogue: catalogue as ObligationCatalogue, query: { effectiveAt: AT, knowledgeCutoff: EARLY, obligationIds: [OBL] } }, hash);
    expect(herd.ok && herd.herd.animals[0]).toEqual(expected);
  };
  const failsClosed = (catalogue: unknown) => expect(stateOf({ catalogue, effectiveAt: AT, knowledgeCutoff: EARLY, evidence })).toBe("UNSUPPORTED");

  it("reviews: a later malformed or contradictory review is set aside; an unreadable review time fails closed", () => {
    const review = base.reviews[0];
    reproducesBefore({ ...base, reviews: [...base.reviews, { ...review, dimension: "SYNTH-NOT-A-DIMENSION", reviewedAt: LATER }] });
    reproducesBefore({ ...base, reviews: [...base.reviews, { ...review, ruleFingerprint: null, reviewedAt: LATER }] });
    reproducesBefore({ ...base, reviews: [...base.reviews, { ...review, decision: "REJECTED", reviewedAt: LATER }] });
    failsClosed({ ...base, reviews: [...base.reviews, { ...review, dimension: "SYNTH-NOT-A-DIMENSION", reviewedAt: "not-an-instant" }] });
    failsClosed({ ...base, reviews: [...base.reviews, { ...review, dimension: "SYNTH-NOT-A-DIMENSION" }] });
  });

  it("definitions: a later malformed, contradictory or new-obligation definition is set aside", () => {
    const def = base.definitions[0];
    reproducesBefore({ ...base, definitions: [...base.definitions, { ...def, ruleVersion: 0, recordedAt: LATER }] });
    reproducesBefore({ ...base, definitions: [...base.definitions, { ...def, recordedAt: LATER, terms: { ...def.terms, obligationKind: "SYNTH-OTHER" } }] });
    reproducesBefore({ ...base, definitions: [...base.definitions, { ...def, obligationId: "SYNTH-OBLIGATION-LATER", ruleId: "SYNTH-RULE-OTHER", recordedAt: LATER }] });
    failsClosed({ ...base, definitions: [...base.definitions, { ...def, ruleVersion: 2, recordedAt: "2026-04-01" }] });
  });

  it("rule versions: relevant only when a record known at the cutoff names them — never decided by later records", () => {
    const d2 = definition({ ruleVersion: 2, recordedAt: LATER });
    const malformedV2 = { ...boundRule(d2), applicability: "nope" };
    const contradictoryTwin = { ...boundRule(d2), title: "contradictory later twin" };
    reproducesBefore({ ...base, definitions: [...base.definitions, d2], ruleVersions: [...base.ruleVersions, malformedV2] });
    reproducesBefore({ ...base, definitions: [...base.definitions, d2], ruleVersions: [...base.ruleVersions, boundRule(d2), contradictoryTwin] });
    reproducesBefore({ ...base, ruleVersions: [...base.ruleVersions, malformedV2], reviews: [...base.reviews, ...approve(boundRule(d2), undefined, LATER)] });
    // Named by nothing known at the cutoff: irrelevant there, so it cannot change the result ...
    const unreferenced = { ...base, ruleVersions: [...base.ruleVersions, malformedV2] };
    reproducesBefore(unreferenced);
    // ... and a LATER record naming it cannot change that earlier result either (the audit's F003 reproduction).
    reproducesBefore({ ...unreferenced, reviews: [...base.reviews, { ...base.reviews[0], ruleVersion: 2, reviewedAt: LATER }] });
    reproducesBefore({ ...unreferenced, definitions: [...base.definitions, d2] });
    // Named by a record known at the cutoff: validated, fails closed.
    failsClosed({ ...unreferenced, definitions: [...base.definitions, { ...d2, recordedAt: "2026-03-01T00:00:00Z" }] });
    failsClosed({ ...unreferenced, reviews: [...base.reviews, { ...base.reviews[0], ruleVersion: 2, reviewedAt: "2026-03-01T00:00:00Z" }] });
    // An unreadable identity can never be shown irrelevant: fails closed.
    failsClosed({ ...base, ruleVersions: [...base.ruleVersions, { ...malformedV2, version: "two" }] });
  });

  it("implementations: relevant only when a relevant rule version names them — never decided by later records", () => {
    const laterImpl = { implementationId: "SYNTH-IMPL-LATER", version: 1, evaluate: "not a function" };
    const d2 = definition({ ruleVersion: 2, recordedAt: LATER });
    const r2 = boundRule(d2, { implementation: { ...bindTo(passImpl), implementationId: "SYNTH-IMPL-LATER" } });
    reproducesBefore({ ...base, definitions: [...base.definitions, d2], ruleVersions: [...base.ruleVersions, r2], implementations: [...base.implementations, laterImpl] });
    reproducesBefore({ ...base, definitions: [...base.definitions, d2], ruleVersions: [...base.ruleVersions, r2], implementations: [...base.implementations, impl(() => "PASS", "SYNTH-IMPL-LATER"), impl(() => "FAIL", "SYNTH-IMPL-LATER")] });
    const unreferenced = { ...base, implementations: [...base.implementations, laterImpl] };
    reproducesBefore(unreferenced);
    reproducesBefore({ ...unreferenced, definitions: [...base.definitions, d2], ruleVersions: [...base.ruleVersions, r2] });
    failsClosed({ ...unreferenced, definitions: [...base.definitions, { ...d2, recordedAt: "2026-03-01T00:00:00Z" }], ruleVersions: [...base.ruleVersions, r2] });
    failsClosed({ ...base, implementations: [...base.implementations, { implementationId: 7, version: 1, evaluate: () => "PASS" }] });
  });

  it("an uncloneable record recorded after the cutoff is set aside; one known by the cutoff (or with an unreadable time) fails closed", () => {
    const fn = () => "not data";
    const def = base.definitions[0];
    const review = base.reviews[0];
    reproducesBefore({ ...base, reviews: [...base.reviews, { ...review, reviewedAt: LATER, extra: fn }] });
    reproducesBefore({ ...base, definitions: [...base.definitions, { ...def, ruleVersion: 2, recordedAt: LATER, extra: fn }] });
    reproducesBefore({ ...base, sources: [...base.sources, { ...LEGAL_SOURCE, version: "SYNTH-v9", retrievedAt: LATER, extra: fn }] });
    reproducesBefore({ ...base, ruleVersions: [...base.ruleVersions, { ...boundRule(definition({ ruleVersion: 2 })), extra: fn }] });
    failsClosed({ ...base, reviews: [...base.reviews, { ...review, reviewedAt: "2026-03-01T00:00:00Z", extra: fn }] });
    failsClosed({ ...base, reviews: [...base.reviews, { ...review, reviewedAt: "not-an-instant", extra: fn }] });
    failsClosed({ ...base, ruleVersions: [{ ...base.ruleVersions[0], extra: fn }] });
  });

  it("sources: a source retrieved after the cutoff — malformed or a newer version — is set aside; an unreadable retrieval time is validated", () => {
    reproducesBefore({ ...base, sources: [...base.sources, { ...LEGAL_SOURCE, version: "SYNTH-v9", contentFingerprint: null, retrievedAt: LATER }] });
    reproducesBefore({ ...base, sources: [...base.sources.map((s) => (s === LEGAL_SOURCE ? s : s)), { ...LEGAL_SOURCE, version: "SYNTH-v9", retrievedAt: LATER, checkedAt: LATER }] });
    failsClosed({ ...base, sources: [...base.sources, { ...LEGAL_SOURCE, version: "SYNTH-v9", contentFingerprint: null, retrievedAt: "not-an-instant" }] });
  });

  it("without a cutoff (direct materialisation) every record is validated", () => {
    expect(materialiseObligationCatalogue({ ...base, reviews: [...base.reviews, { ...base.reviews[0], dimension: "SYNTH-NOT-A-DIMENSION", reviewedAt: LATER }] }).ok).toBe(false);
    expect(materialiseObligationCatalogue({ ...base, reviews: [...base.reviews, { ...base.reviews[0], dimension: "SYNTH-NOT-A-DIMENSION", reviewedAt: LATER }] }, EARLY).ok).toBe(true);
  });
});

describe("C2 remediation — appending an identical duplicate never rewrites stored evidence", () => {
  it("keeps the stored spelling and the historical fingerprint (the audit's F004 reproduction)", () => {
    const AT = "2026-04-01T00:00:00Z";
    for (const [storedAt, retryAt] of [["2026-03-05T00:00:00.000Z", "2026-03-05T00:00:00Z"], ["2026-03-05T00:00:00Z", "2026-03-05T00:00:00.000Z"]]) {
      const created = createObligationEvidenceLog(A, [ful("e-1", storedAt)]);
      if (!created.ok) throw new Error(JSON.stringify(created));
      const before = run({ effectiveAt: AT, evidence: [...created.log.records] });
      const appended = appendObligationEvidence(created.log, [ful("e-1", retryAt)]);
      if (!appended.ok) throw new Error(JSON.stringify(appended));
      expect(appended.idempotentDuplicateIds).toEqual(["e-1"]);
      expect(appended.log.records).toEqual(created.log.records);
      expect(appended.log.records[0].fulfilledAt).toBe(storedAt);
      const after = run({ effectiveAt: AT, evidence: [...appended.log.records] });
      expect(after).toEqual(before);
      expect(only(after).fingerprint).toEqual(only(before).fingerprint);
    }
  });

  it("a duplicate with different content is still rejected on append", () => {
    const created = createObligationEvidenceLog(A, [ful("e-1", INSIDE)]);
    if (!created.ok) throw new Error(JSON.stringify(created));
    const clash = appendObligationEvidence(created.log, [ful("e-1", "2026-03-06T00:00:00Z")]);
    expect(clash.ok).toBe(false);
  });
});
