/**
 * Cattle C8 — recommendation engine. Synthetic data only: every animal,
 * obligation, product, period, programme, goal, action kind, model, rule,
 * source, value key, amount and currency code is a fictional `SYNTH-*`
 * fixture with no legal, veterinary, scientific or economic meaning.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/*
 * Fault model (CAT-INV-028 as clarified by the human architecture decision of
 * 2026-10-15). Validation follows trust boundaries and contract ownership:
 * - IN SCOPE (adversarial): genuinely untrusted boundaries — the canonical
 *   request (external input) and a stored / reloaded recommendation
 *   (`verifyCattleRecommendation`); C8-owned records; and, for outputs of the
 *   frozen in-process engines, only the SHARED cross-engine protocol C8 relies
 *   on — the structural shape of C0's `RuleEvaluationRecord` and evidence pack
 *   (required presence, runtime type, no undeclared field).
 * - OUT OF SCOPE: arbitrary post-return corruption of an approved frozen
 *   engine's OWNER-SPECIFIC domain values (e.g. a C2 rule version of 0, or
 *   C3's contractually null `rule` replaced by an object). C2 / C3 / C7 own
 *   those invariants; C8 does not duplicate them (audit F005 disposition).
 *
 * Seams are wrapped PASS-THROUGH: with no fault armed the real frozen engine's
 * result is returned untouched, so every other suite runs against the real
 * engines. A test arms one seam, which then returns a structured clone of the
 * real result with one STRUCTURAL protocol mutation applied.
 */
const faults = vi.hoisted(() => ({
  armed: null as null | { seam: string; mutate: (record: Record<string, unknown>) => void },
  capture: null as null | { seam: string; value: unknown },
}));
vi.mock("../regulatory", async (importOriginal) => {
  const real = await importOriginal<typeof import("../regulatory")>();
  return { ...real, projectObligationHardGates: (...a: Parameters<typeof real.projectObligationHardGates>) => injected("C2_GATES", real.projectObligationHardGates(...a), (r) => (r.ok ? r.projection.ruleEvaluations[0] : null)) };
});
vi.mock("../health", async (importOriginal) => {
  const real = await importOriginal<typeof import("../health")>();
  return { ...real, projectWithdrawalHardGates: (...a: Parameters<typeof real.projectWithdrawalHardGates>) => injected("C3_GATES", real.projectWithdrawalHardGates(...a), (r) => (r.ok ? r.gates.ruleEvaluations[0] : null)) };
});
vi.mock("../programmes", async (importOriginal) => {
  const real = await importOriginal<typeof import("../programmes")>();
  return { ...real, projectProgrammeHardGates: (...a: Parameters<typeof real.projectProgrammeHardGates>) => injected("C7_GATES", real.projectProgrammeHardGates(...a), (r) => (r.ok ? r.gates.ruleEvaluations[0] : null)) };
});
vi.mock("../evaluation", async (importOriginal) => {
  const real = await importOriginal<typeof import("../evaluation")>();
  return { ...real, evaluateCattleRule: (...a: Parameters<typeof real.evaluateCattleRule>) => injected("MODEL_RECORD", real.evaluateCattleRule(...a), (r) => (r.requestedRuleId === "SYNTH-RULE-EFFECT" ? r : null)) };
});
vi.mock("../evidence-pack", async (importOriginal) => {
  const real = await importOriginal<typeof import("../evidence-pack")>();
  return { ...real, buildRecommendationEvidencePack: (...a: Parameters<typeof real.buildRecommendationEvidencePack>) => injected("PACK", real.buildRecommendationEvidencePack(...a), (r) => (r.status === "BUILT" ? r.pack : null)) };
});
/** Pass-through unless `seam` is armed (mutated clone) or captured (clone recorded). */
function injected<R>(seam: string, result: R, pick: (r: R) => unknown): R {
  if (faults.capture?.seam === seam && faults.capture.value === undefined) {
    const target = pick(result);
    if (target !== null && target !== undefined) faults.capture.value = structuredClone(target);
  }
  if (faults.armed?.seam !== seam) return result;
  const copy = structuredClone(result);
  const target = pick(copy);
  if (target !== null && target !== undefined) faults.armed.mutate(target as Record<string, unknown>);
  return copy;
}
import {
  CONFORMS,
  RESOLVED_LOOKING_STATES,
  checkDetachedResult,
  checkDuplicateIdentity,
  checkFingerprintStability,
  checkFutureKnowledgeInvisible,
  checkMalformedKnowledgeTimeFailsClosed,
  checkOrderIndependence,
  checkUnresolvedEvidenceNotMasked,
  conformanceSnapshot,
  isDeepFrozen,
} from "@/tooling/cattle-conformance/cattle-conformance";
import { createAnimalLedger, type AnimalLedger } from "../animal-ledger";
import * as cattle from "../index";
import { computeSourceContentFingerprint, sourceVersionRef } from "../source";
import { CATALOGUE, LEGAL_SOURCE, SCIENCE_SOURCE, approve, bindTo, hash, impl, synthRule } from "../test-fixtures";
import { createObligationImplementationRegistry, obligationTermsMarker, projectObligationHardGates, evaluateHerdObligations, type ObligationDefinition } from "../regulatory";
import { projectAnimalHealth, projectWithdrawalHardGates } from "../health";
import { buildWeightReadContract } from "../weights";
import { evaluatePerformance } from "../performance";
import { EMPTY_GOAL_ROUTING_REGISTRY, projectProductionGoals, resolveGoalTargetApplicability, routeProductionGoals } from "../goals";
import { computeProgrammeDefinitionFingerprint, evaluateHealthProgrammes, projectProgrammeHardGates } from "../programmes";
import { computeAnimalSnapshotFingerprint, projectAnimalSnapshot } from "../animal-snapshot";
import type { CattleRuleVersion } from "../rule";
import {
  DEFAULT_CANDIDATE_ACTION_REGISTRY,
  RECOMMENDATION_CONTEXT_PARTS,
  recommendCattle,
  verifyCattleRecommendation,
  type CattleRecommendation,
  type CattleRecommendationOutcomeResult,
} from "./index";
import { sealEvaluationContext, buildEvaluationContexts } from "./evaluation-context";
import { recommendationModelContentMarker, type RecommendationModelRecord } from "./recommendation-models";
import { RECOMMENDATION_CONSUMED_SURFACES, valid, type FieldSpec } from "./recommendation-consumed";
import * as cattleExact from "./recommendation-exact";
import * as cattleModels from "./recommendation-models";
import * as cattleEconomic from "./economic-context";
import { computeRecommendationFingerprint } from "./recommendation-integrity";
import { computeCattleFingerprint } from "../integrity";
import { CANDIDATE_STEP_FORMULA } from "./recommendation-explanation";
import type { RecommendationEvidencePack } from "../evidence-pack";

type Rec = Record<string, unknown>;

const A = "SYNTH-ANIMAL-1";
const B = "SYNTH-ANIMAL-2";
const MEAT = "SYNTH-FOOD-MEAT";
const PRODUCT = "SYNTH-PRODUCT-1";
const EFFECTIVE = "2026-04-15T00:00:00Z";
const CUTOFF = "2026-06-01T00:00:00Z";
const LATER = "2026-07-01T00:00:00Z";
const RECEIVED = "2026-01-01T00:00:00Z";

// ---------------------------------------------------------------------------
// Predecessor canonical evidence (synthetic)
// ---------------------------------------------------------------------------

const prov = () => ({ sourceCategory: "FARMER", receivedAt: "2026-02-01T00:00:00Z" });
function ledgerOf(animalId: string, sex = "FEMALE"): AnimalLedger {
  const r = createAnimalLedger(animalId, [
    { assertionId: `${animalId}-dob`, animalId, kind: "DATE_OF_BIRTH", value: "2026-03-01", provenance: prov() },
    { assertionId: `${animalId}-sex`, animalId, kind: "SEX", value: sex, provenance: prov() },
  ]);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.ledger;
}
const LEDGER_A = ledgerOf(A);
const LEDGER_B = ledgerOf(B, "MALE");

// C2: DATE_OF_BIRTH anchor, window [birth + 1 DAY, birth + 10 DAY) — synthetic.
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
const OBL_CATALOGUE = { definitions: [OBL_DEFINITION], ruleVersions: [OBL_RULE_VERSION], sources: CATALOGUE, reviews: approve(OBL_RULE_VERSION) };
const fulfilment = (animalId = A) => ({
  evidenceId: `SYNTH-EVIDENCE-${animalId}`,
  animalId,
  obligationId: OBL,
  rule: { ruleId: OBL_RULE, version: 1 },
  occurrenceAnchor: null,
  kind: "FULFILMENT",
  fulfilledAt: "2026-03-05T00:00:00Z",
  provenance: { sourceCategory: "FARMER", receivedAt: "2026-03-06T00:00:00Z" },
  supersedes: [],
});
const obligations = (o: { evidence?: Rec[]; catalogue?: unknown; ids?: string[] } = {}) => ({ catalogue: o.catalogue ?? OBL_CATALOGUE, obligationIds: o.ids ?? [OBL], evidence: o.evidence ?? [] });

// Model implementations (trusted code) — synthetic predicates.
const MODEL_PASS = impl(() => "PASS", "SYNTH-IMPL-MODEL-PASS");
const MODEL_FAIL = impl(() => "FAIL", "SYNTH-IMPL-MODEL-FAIL");
const TRUSTED = { obligationImplementations: createObligationImplementationRegistry([OBL_IMPL, MODEL_PASS, MODEL_FAIL]) };

// C3: synthetic product with a synthetic 10 DAY meat period.
const PRODUCT_SOURCE = { sourceId: "SYNTH-SRC-PRODUCT", version: "v1", contentFingerprint: computeSourceContentFingerprint({ text: "synthetic product sheet" }, hash) };
const PRODUCTS = [
  {
    productId: PRODUCT,
    version: "v1",
    authorisation: { scheme: "SYNTH-SCHEME", number: "SYNTH-AUTH-1" },
    label: "Synthetic product",
    lifecycle: "ACTIVE",
    speciesAuthorisations: [{ species: "BOVINE", withdrawalPeriods: [{ foodProduct: MEAT, route: null, period: { amount: 10, unit: "DAY" } }] }],
    source: { publisher: "SYNTH-PUBLISHER", sourceRef: PRODUCT_SOURCE, retrievedAt: "2026-01-01T00:00:00Z", checkedAt: "2026-01-02T00:00:00Z" },
  },
];
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
const CLEAR_RECORDS = [adm("h-clear", "2026-03-01T00:00:00Z")];
const IN_WITHDRAWAL_RECORDS = [adm("h-in", "2026-04-10T00:00:00Z")];
const UNKNOWN_RECORDS = [adm("h-unknown", "2026-04-10T00:00:00Z", { productId: null })];
const CONFLICT_RECORDS = [adm("h-1", "2026-04-01T00:00:00Z"), adm("h-2", "2026-04-02T00:00:00Z", { supersedes: ["h-1"] }), adm("h-3", "2026-04-03T00:00:00Z", { supersedes: ["h-1"] })];
const health = (records: Rec[], others: { animalId: string; healthRecords: Rec[] }[] = []) => ({ foodProducts: [MEAT], productRecords: PRODUCTS, animals: [{ animalId: A, healthRecords: records }, ...others] });

// C4
const weightObs = (recordId: string, observedAt: string, animalId = A, receivedAt = "2026-04-02T00:00:00Z") => ({
  recordId,
  animalId,
  observedAt,
  weight: { value: 412.5, unit: "KILOGRAM" },
  method: "SCALE",
  provenance: { sourceCategory: "DEVICE", receivedAt },
});

// C6
const goalDecl = (goalId: string, goalType = "FINISHING", receivedAt = RECEIVED, animalId = A) => ({
  goalId,
  version: "v1",
  action: "DECLARE",
  subject: { kind: "ANIMAL", animalId },
  goalType,
  validFrom: "2026-01-01T00:00:00Z",
  declaredBy: { actor: "SYNTH-FARMER-1", role: "FARMER" },
  provenance: { sourceCategory: "FARMER", receivedAt },
});
const goals = (declarations: Rec[]) => ({ declarations, routingRegistry: EMPTY_GOAL_ROUTING_REGISTRY });

// C7: a synthetic veterinary programme; windows birth + 10..20 DAY, every 30 DAY, 3 times.
const VET_DOC = { sourceId: "SYNTH-SRC-PROGRAMME", version: "v1", contentFingerprint: computeSourceContentFingerprint({ text: "synthetic programme document" }, hash) };
const PROGRAMME = {
  programmeId: "SYNTH-PROGRAMME-1",
  version: "v1",
  supersedesVersions: [],
  classification: "VETERINARY_PROGRAMME",
  declaredBy: { role: "VETERINARIAN", actor: "SYNTH-VET-1" },
  validFrom: "2026-01-01T00:00:00Z",
  validTo: null,
  applicability: { kind: "EXPLICIT_SET", animalIds: [A] },
  actions: [
    {
      actionId: "SYNTH-ACTION-1",
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
    },
  ],
  productionState: "PRODUCTION",
  provenance: { sourceCategory: "VETERINARY_SOURCE", sourceSystem: null, sourceRecordRef: null, receivedAt: RECEIVED, sourceDocument: VET_DOC },
};
const PROGRAMME_REVIEW = {
  reviewId: "SYNTH-REVIEW-1",
  programmeId: PROGRAMME.programmeId,
  programmeVersion: "v1",
  definitionFingerprint: computeProgrammeDefinitionFingerprint(PROGRAMME, hash),
  dimension: "VETERINARY",
  decision: "APPROVED",
  reviewer: { role: "VETERINARIAN", actor: "SYNTH-REVIEWER-1" },
  reviewedAt: "2026-01-02T00:00:00Z",
  supersedes: [],
};
const programmes = (definitions: Rec[] = [PROGRAMME]) => ({ definitions, reviews: definitions.length === 0 ? [] : [PROGRAMME_REVIEW], completions: [] });
const PROGRAMME_GATE = cattle.programmeGateRuleId("SYNTH-PROGRAMME-1", "SYNTH-ACTION-1");

// ---------------------------------------------------------------------------
// C8 canonical inputs (synthetic registry, models and observations)
// ---------------------------------------------------------------------------

function action(actionKind: string, o: Rec = {}): Rec {
  return {
    actionKind,
    recordedAt: "2026-01-01T00:00:00Z",
    description: `Synthetic action ${actionKind}`,
    tier: "EXPECTED_NET_RETURN",
    benefitClaim: "MODELLED",
    applicableGoalTypes: null,
    trigger: { kind: "UNCONDITIONAL" },
    prerequisites: { sources: [], gateRuleIds: [] },
    evidenceRequirements: [],
    effectModelRef: null,
    economicModelRef: null,
    assumptions: ["SYNTH-ASSUMPTION"],
    limitations: [],
    ...o,
  };
}
const registry = (definitions: unknown[], version = "1") => ({ registryId: "SYNTH-REGISTRY", version, definitions });
const defaultOnly = (kind: string, patch: Rec = {}) => registry(DEFAULT_CANDIDATE_ACTION_REGISTRY.definitions.filter((d) => d.actionKind === kind).map((d) => ({ ...d, ...patch })));

function modelRule(ruleId: string, implementation = MODEL_PASS, o: Partial<CattleRuleVersion> = {}): CattleRuleVersion {
  return synthRule({
    ruleId,
    classification: "SYSTEM_INFERENCE",
    gateRole: "ADVISORY",
    jurisdiction: null,
    requiredInputs: [],
    sourceBindings: [sourceVersionRef(SCIENCE_SOURCE)],
    implementation: bindTo(implementation),
    requiredReviews: ["SCIENTIFIC"],
    ...o,
  });
}
const EFFECT_RULE = modelRule("SYNTH-RULE-EFFECT");
const ECON_RULE = modelRule("SYNTH-RULE-ECONOMIC");
/** Binds the model's content into its rule version (`recommendationModelContentMarker` in `assumptions`), as an approver would. */
const bindContent = <M extends Rec>(m: M): M => {
  const rule = m.rule as CattleRuleVersion;
  return { ...m, rule: { ...rule, assumptions: [...rule.assumptions, recommendationModelContentMarker(m as unknown as RecommendationModelRecord, hash)] } };
};
const effectModel = (rule = EFFECT_RULE, o: Rec = {}) =>
  bindContent({ modelId: "SYNTH-MODEL-EFFECT", version: "v1", recordedAt: "2026-01-01T00:00:00Z", role: "EFFECT", rule, expectedEffect: "SYNTH asserted effect", value: null, ...o });
const econModel = (benefitKeys: string[], costKeys: string[], rule = ECON_RULE, o: Rec = {}) =>
  bindContent({
    modelId: "SYNTH-MODEL-ECONOMIC",
    version: "v1",
    recordedAt: "2026-01-01T00:00:00Z",
    role: "ECONOMIC",
    rule,
    expectedEffect: null,
    value: { form: "NET_OF_BOUND_OBSERVATIONS", benefitKeys, costKeys },
    ...o,
  });
/** Approvals of exactly the (bound) rule versions the model records carry. */
const approveModels = (records: Rec[]) =>
  records.flatMap((m) => approve(m.rule as CattleRuleVersion)).filter((r, i, a) => a.findIndex((x) => JSON.stringify(x) === JSON.stringify(r)) === i);
const EFFECT_REF = { modelId: "SYNTH-MODEL-EFFECT", version: "v1" };
const ECON_REF = { modelId: "SYNTH-MODEL-ECONOMIC", version: "v1" };
const PRICE_SOURCE = { sourceId: "SYNTH-SRC-PRICE", version: "v1", contentFingerprint: computeSourceContentFingerprint({ text: "synthetic price list" }, hash) };
const econObs = (observationId: string, valueKey: string, amount: string, o: Rec = {}) => ({
  observationId,
  valueKey,
  amount,
  currency: "EUR",
  observedAt: "2026-04-01T00:00:00Z",
  receivedAt: "2026-04-02T00:00:00Z",
  source: PRICE_SOURCE,
  supersedes: [],
  ...o,
});
const allModels = (records: Rec[], reviews: unknown[] = approveModels(records)) => ({ records, reviews, sources: CATALOGUE });
const NO_MODELS = { records: [], reviews: [], sources: [] };

interface Run {
  effectiveAt?: string;
  knowledgeCutoff?: string;
  ledgers?: unknown[];
  obligations?: unknown;
  health?: unknown;
  weights?: unknown;
  performance?: unknown;
  goals?: unknown;
  programmes?: unknown;
  observations?: unknown[];
  models?: unknown;
  actions?: unknown;
}
function requestOf(o: Run = {}): Rec {
  return {
    query: { effectiveAt: o.effectiveAt ?? EFFECTIVE, knowledgeCutoff: o.knowledgeCutoff ?? CUTOFF },
    ledgers: o.ledgers ?? [LEDGER_A],
    obligations: o.obligations ?? null,
    health: o.health ?? null,
    weights: o.weights ?? null,
    performance: o.performance ?? null,
    goals: o.goals ?? null,
    programmes: o.programmes ?? null,
    economics: { observations: o.observations ?? [] },
    models: o.models ?? NO_MODELS,
    actions: o.actions ?? DEFAULT_CANDIDATE_ACTION_REGISTRY,
  };
}
const run = (o: Run = {}) => recommendCattle(requestOf(o), hash, TRUSTED);
function ok(r: CattleRecommendationOutcomeResult) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.result;
}
const recOf = (r: CattleRecommendationOutcomeResult, animalId = A): CattleRecommendation => ok(r).animals.find((a) => a.animalId === animalId)!;
const outcomeOf = (r: CattleRecommendationOutcomeResult, animalId = A) => recOf(r, animalId).record.outcome;
const codes = (r: CattleRecommendationOutcomeResult) => (r.ok ? [] : r.issues.map((i) => i.code));

/** A favourable, fully modelled synthetic action gated by `sources`. */
const SELL = (sources: string[] = [], o: Rec = {}) => action("SYNTH-SELL", { prerequisites: { sources, gateRuleIds: [] }, effectModelRef: EFFECT_REF, economicModelRef: ECON_REF, ...o });
const FAVOURABLE_MODELS = allModels([effectModel(), econModel(["SYNTH-KEY-PRICE"], ["SYNTH-KEY-COST"])]);
const FAVOURABLE_REVIEWS = approveModels(FAVOURABLE_MODELS.records);
const FAVOURABLE_OBS = [econObs("o-price", "SYNTH-KEY-PRICE", "1000.00"), econObs("o-cost", "SYNTH-KEY-COST", "250.5")];
const favourable = (o: Run = {}): Run => ({ models: FAVOURABLE_MODELS, observations: FAVOURABLE_OBS, ...o });

// ---------------------------------------------------------------------------

describe("C8 test 1 — hard gates precede optimisation", () => {
  it("positive control: every prerequisite gate PASS ⇒ ACTIONABLE with the supported effect and exact known value", () => {
    const r = run(favourable({ actions: registry([SELL(["C2_OBLIGATION", "C3_WITHDRAWAL"])]), obligations: obligations({ evidence: [fulfilment()] }), health: health(CLEAR_RECORDS) }));
    const rec = recOf(r);
    expect(rec.record.outcome).toBe("ACTIONABLE");
    expect(rec.pack.actionableActionId).toBe(JSON.stringify(["SYNTH-SELL", "ANIMAL", A]));
    expect(rec.record.regulatoryStatus.state).toBe("GATES_SATISFIED");
    expect(rec.candidates[0].effect).toMatchObject({ state: "EFFECT_SUPPORTED", expectedEffect: "SYNTH asserted effect" });
    expect(rec.candidates[0].value).toMatchObject({ state: "VALUE_KNOWN", amount: "749.50", currency: "EUR", observationIds: ["o-cost", "o-price"] });
    expect(rec.record.evidence).toEqual({
      type: "MODELLED",
      strength: "MODELLED_EFFECT_AND_VALUE",
      effectBasis: "SCIENTIFICALLY_APPROVED_EFFECT_MODEL",
      valueBasis: "APPROVED_VALUE_FORM_OVER_UNVALIDATED_OBSERVATIONS",
      priorityBasis: "REGISTRY_DECLARED_UNREVIEWED",
    });
    expect(rec.pack.hardGateOutcomes.map((g) => [g.ruleId, g.state])).toEqual([
      ["CATTLE_HEALTH_WITHDRAWAL:SYNTH-FOOD-MEAT", "PASS"],
      [OBL_RULE, "PASS"],
    ]);
  });

  const cases: [string, Run, string, string][] = [
    ["C3 in withdrawal (FAIL)", { actions: registry([SELL(["C3_WITHDRAWAL"])]), health: health(IN_WITHDRAWAL_RECORDS) }, "BLOCKED", "GATE_FAILED"],
    ["C3 withdrawal unknown", { actions: registry([SELL(["C3_WITHDRAWAL"])]), health: health(UNKNOWN_RECORDS) }, "INSUFFICIENT_EVIDENCE", "GATE_UNRESOLVED"],
    ["C3 withdrawal in conflict", { actions: registry([SELL(["C3_WITHDRAWAL"])]), health: health(CONFLICT_RECORDS) }, "INSUFFICIENT_EVIDENCE", "GATE_UNRESOLVED"],
    ["C2 overdue (FAIL)", { actions: registry([SELL(["C2_OBLIGATION"])]), obligations: obligations() }, "BLOCKED", "GATE_FAILED"],
    ["C2 unsupported obligation", { actions: registry([SELL(["C2_OBLIGATION"])]), obligations: obligations({ ids: ["SYNTH-OBLIGATION-UNKNOWN"] }) }, "INSUFFICIENT_EVIDENCE", "GATE_UNRESOLVED"],
    ["C2 review required", { actions: registry([SELL(["C2_OBLIGATION"])]), obligations: obligations({ evidence: [fulfilment()], catalogue: { ...OBL_CATALOGUE, reviews: [] } }) }, "REVIEW_REQUIRED", "GATE_REVIEW_REQUIRED"],
    ["C7 programme action overdue (FAIL)", { actions: registry([SELL(["C7_PROGRAMME"])]), programmes: programmes(), health: health([]) }, "BLOCKED", "GATE_FAILED"],
    ["prerequisite source not supplied", { actions: registry([SELL(["C3_WITHDRAWAL"])]) }, "INSUFFICIENT_EVIDENCE", "GATE_UNRESOLVED"],
    ["explicit prerequisite gate absent", { actions: registry([SELL([], { prerequisites: { sources: [], gateRuleIds: ["SYNTH-GATE-NOT-PROJECTED"] } })]) }, "INSUFFICIENT_EVIDENCE", "GATE_UNRESOLVED"],
  ];

  it.each(cases)("%s blocks the otherwise favourable action (never ACTIONABLE; favourability not consulted)", (_label, o, outcome, gateState) => {
    const rec = recOf(run(favourable(o)));
    expect(rec.record.outcome).toBe(outcome);
    expect(rec.record.actionable).toBe(false);
    expect(rec.pack.actionableActionId).toBeNull();
    expect(rec.record.regulatoryStatus.state).toBe(gateState);
    expect(rec.candidates[0].effect.state).toBe("NOT_EVALUATED");
    expect(rec.candidates[0].value.state).toBe("NOT_EVALUATED");
    expect(rec.pack.candidateActions[0].favourability).toBeNull();
  });

  it("CAT-INV-009: unresolved required evidence never surfaces as a resolved-looking state", () => {
    const forbidden = [...RESOLVED_LOOKING_STATES, "GATES_SATISFIED", "EFFECT_SUPPORTED", "VALUE_KNOWN"];
    const v = checkUnresolvedEvidenceNotMasked(
      cases.map(([label, o]) => ({ label, result: run(favourable(o)) })),
      (res) => {
        const rec = recOf(res);
        return [rec.record.outcome, rec.record.regulatoryStatus.state, ...rec.candidates.flatMap((c) => [c.effect.state, c.value.state])];
      },
      forbidden,
    );
    expect(v).toEqual(CONFORMS);
  });

  it("C7 gates come from the C7 hard-gate projection of the composed programme evaluation", () => {
    const rec = recOf(run(favourable({ actions: registry([SELL(["C7_PROGRAMME"])]), programmes: programmes(), health: health([]) })));
    expect(rec.pack.hardGateOutcomes.map((g) => [g.ruleId, g.state])).toEqual([[PROGRAMME_GATE, "FAIL"]]);
  });
});

describe("C8 test 2 — missing inputs are recorded, never defaulted", () => {
  it("nothing supplied with the default registry ⇒ INSUFFICIENT_EVIDENCE with every missing part recorded", () => {
    const rec = recOf(run());
    expect(rec.record.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(rec.record.missingContextParts).toEqual([...RECOMMENDATION_CONTEXT_PARTS]);
    for (const p of RECOMMENDATION_CONTEXT_PARTS) expect(rec.record.unknowns).toContain(`CATTLE_RECOMMENDATION_CONTEXT_PART_NOT_SUPPLIED:${p}`);
    for (const part of ["obligations", "health", "weights", "performance", "goals", "programmes"] as const) expect(rec.context[part]).toEqual({ state: "NOT_SUPPLIED" });
    expect(rec.candidates.every((c) => c.trigger.state === "UNRESOLVED" && c.gates.state === "NOT_CLEAR")).toBe(true);
  });

  it("an empty registry ⇒ NO_RECOMMENDATION (nothing proposed, no candidates)", () => {
    const rec = recOf(run({ actions: registry([]) }));
    expect(rec.record.outcome).toBe("NO_RECOMMENDATION");
    expect(rec.candidates).toEqual([]);
    expect(rec.record.recommendedAction).toBeNull();
  });

  it("an action requiring an absent context part stays non-actionable (INSUFFICIENT_EVIDENCE)", () => {
    const rec = recOf(run(favourable({ actions: registry([SELL([], { evidenceRequirements: ["PERFORMANCE"] })]) })));
    expect(rec.record.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(rec.pack.hardGateOutcomes).toEqual([{ ruleId: "CATTLE_RECOMMENDATION_REQUIRES:PERFORMANCE", rule: null, state: "NOT_EVALUATED", satisfied: false }]);
  });

  it("goal-specific action: unresolved goal state is never 'not eligible'; a resolved non-matching goal is", () => {
    const sale = (o: Run) => recOf(run(favourable({ actions: registry([SELL([], { applicableGoalTypes: ["SALE"] })]), ...o })));
    expect(sale({}).record.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(sale({ goals: goals([goalDecl("g-sale", "SALE"), goalDecl("g-retain", "RETAIN")]) }).record.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(sale({ goals: goals([goalDecl("g-sale", "SALE"), goalDecl("g-retain", "RETAIN")]) }).candidates[0].eligibility.reasonCodes).toEqual(["CATTLE_RECOMMENDATION_GOAL_UNRESOLVED:INTENT_CONFLICT"]);
    const finishing = sale({ goals: goals([goalDecl("g-fin")]) });
    expect(finishing.record.outcome).toBe("NO_RECOMMENDATION");
    expect(finishing.notCandidates).toEqual([{ actionKind: "SYNTH-SELL", reasonCodes: ["CATTLE_RECOMMENDATION_NOT_ELIGIBLE:GOAL_ACTIVE"] }]);
    expect(sale({ goals: goals([goalDecl("g-sale", "SALE")]) }).record.outcome).toBe("ACTIONABLE");
  });

  it("the production registry is evidence-free data: frozen, five data-gap kinds, no model, no staleness interval", () => {
    expect(isDeepFrozen(DEFAULT_CANDIDATE_ACTION_REGISTRY)).toBe(true);
    expect(DEFAULT_CANDIDATE_ACTION_REGISTRY.definitions.map((d) => d.actionKind)).toEqual([
      "COMPLETE_PROGRAMME_ACTION",
      "DECLARE_PRODUCTION_GOAL",
      "RECORD_WEIGHT",
      "RESOLVE_OBLIGATION_EVIDENCE",
      "REVIEW_WITHDRAWAL_STATUS",
    ]);
    for (const d of DEFAULT_CANDIDATE_ACTION_REGISTRY.definitions) {
      expect(d).toMatchObject({ benefitClaim: "NONE", effectModelRef: null, economicModelRef: null, applicableGoalTypes: null, prerequisites: { sources: [], gateRuleIds: [] } });
    }
    expect(DEFAULT_CANDIDATE_ACTION_REGISTRY.definitions.find((d) => d.actionKind === "RECORD_WEIGHT")?.trigger).toEqual({ kind: "WEIGHT_MISSING_OR_STALE", staleAfter: null });
  });
});

describe("C8 test 3 — each default data-gap action triggers only from its documented condition and claims no benefit", () => {
  const ADULT = [weightObs("w-1", "2026-04-01T00:00:00Z")];
  const table: [string, Run, Run][] = [
    ["RECORD_WEIGHT", { weights: { observations: [] } }, { weights: { observations: ADULT } }],
    ["RESOLVE_OBLIGATION_EVIDENCE", { obligations: obligations() }, { obligations: obligations({ evidence: [fulfilment()] }) }],
    ["REVIEW_WITHDRAWAL_STATUS", { health: health(UNKNOWN_RECORDS) }, { health: health(CLEAR_RECORDS) }],
    ["COMPLETE_PROGRAMME_ACTION", { programmes: programmes(), health: health([]) }, { programmes: programmes([]), health: health([]) }],
    ["DECLARE_PRODUCTION_GOAL", { goals: goals([]) }, { goals: goals([goalDecl("g-fin")]) }],
  ];
  it.each(table)("%s", (kind, positive, negative) => {
    const yes = recOf(run({ ...positive, actions: defaultOnly(kind) }));
    expect(yes.record.outcome).toBe("ACTIONABLE");
    expect(yes.record.recommendedAction?.actionKind).toBe(kind);
    expect(yes.candidates[0]).toMatchObject({ benefitClaim: "NONE", trigger: { state: "TRIGGERED" }, effect: { state: "EFFECT_UNKNOWN" }, value: { state: "VALUE_UNKNOWN", amount: null } });
    expect(yes.record.evidence).toEqual({ type: "DATA_GAP_OR_OBLIGATION", strength: "PREDECESSOR_STATE", effectBasis: "NONE", valueBasis: "NONE", priorityBasis: "REGISTRY_DECLARED_UNREVIEWED" });
    expect(yes.record.limitations).toContain("CATTLE_RECOMMENDATION_DATA_GAP_ACTION_CLAIMS_NO_BENEFIT");
    const no = recOf(run({ ...negative, actions: defaultOnly(kind) }));
    expect(no.record.outcome).toBe("NO_RECOMMENDATION");
    expect(no.notCandidates.map((n) => n.actionKind)).toEqual([kind]);
  });

  it("RECORD_WEIGHT staleness only with an explicitly supplied policy (boundary inclusive at effectiveAt)", () => {
    const stale = (observedAt: string, staleAfter: Rec | null) =>
      recOf(run({ weights: { observations: [weightObs("w-1", observedAt)] }, actions: defaultOnly("RECORD_WEIGHT", { trigger: { kind: "WEIGHT_MISSING_OR_STALE", staleAfter } }) })).record.outcome;
    expect(stale("2026-04-05T00:00:00Z", null)).toBe("NO_RECOMMENDATION");
    expect(stale("2026-04-05T00:00:00Z", { amount: 10, unit: "DAY" })).toBe("ACTIONABLE");
    expect(stale("2026-04-05T00:00:00.000000001Z", { amount: 10, unit: "DAY" })).toBe("NO_RECOMMENDATION");
  });

  it("CAT-INV-009: a trigger over unresolved predecessor states is UNRESOLVED (INSUFFICIENT_EVIDENCE), never a silent NO_RECOMMENDATION", () => {
    const unresolved: [string, string, Run][] = [
      ["DECLARE_PRODUCTION_GOAL", "goal intent conflict", { goals: goals([goalDecl("g-sale", "SALE"), goalDecl("g-retain", "RETAIN")]) }],
      ["REVIEW_WITHDRAWAL_STATUS", "withdrawal in conflict", { health: health(CONFLICT_RECORDS) }],
      ["RESOLVE_OBLIGATION_EVIDENCE", "obligation review required", { obligations: obligations({ evidence: [fulfilment()], catalogue: { ...OBL_CATALOGUE, reviews: [] } }) }],
      ["RESOLVE_OBLIGATION_EVIDENCE", "obligation unsupported", { obligations: obligations({ ids: ["SYNTH-OBLIGATION-UNKNOWN"] }) }],
      ["COMPLETE_PROGRAMME_ACTION", "programme membership unknown (no C3 evidence for the animal)", { programmes: programmes([{ ...PROGRAMME, applicability: { kind: "GROUP", groupRef: "SYNTH-GROUP" } }]), health: health([]) }],
    ];
    const results = unresolved.map(([kind, label, o]) => ({ label, result: run({ ...o, actions: defaultOnly(kind) }) }));
    for (const { label, result } of results) {
      const rec = recOf(result);
      expect(rec.record.outcome, label).toBe("INSUFFICIENT_EVIDENCE");
      expect(rec.candidates[0].trigger.state, label).toBe("UNRESOLVED");
      expect(rec.candidates[0].trigger.reasonCodes[0], label).toMatch(/^CATTLE_RECOMMENDATION_TRIGGER_UNRESOLVED:/);
    }
    const v = checkUnresolvedEvidenceNotMasked(results, (res) => [recOf(res).record.outcome], [...RESOLVED_LOOKING_STATES, "NO_RECOMMENDATION"]);
    expect(v).toEqual(CONFORMS);
  });

  it("a default action's trigger needs its predecessor part: absent ⇒ INSUFFICIENT_EVIDENCE, never assumed", () => {
    for (const d of DEFAULT_CANDIDATE_ACTION_REGISTRY.definitions) expect(outcomeOf(run({ actions: defaultOnly(d.actionKind) }))).toBe("INSUFFICIENT_EVIDENCE");
  });
});

describe("C8 test 4 — registered, provenance-bound, approved models only", () => {
  const sellRun = (o: Run) => recOf(run({ actions: registry([SELL()]), observations: FAVOURABLE_OBS, ...o })).candidates[0];

  it("an approved PASS effect model supports the effect; an approved economic model gives an exact value", () => {
    const c = sellRun({ models: FAVOURABLE_MODELS });
    expect(c.effect.state).toBe("EFFECT_SUPPORTED");
    expect(c.value).toMatchObject({ state: "VALUE_KNOWN", amount: "749.50" });
  });

  const unknownCases: [string, Run][] = [
    ["no model registered", { models: NO_MODELS }],
    ["model reviews absent (not approved)", { models: allModels([effectModel(), econModel(["SYNTH-KEY-PRICE"], ["SYNTH-KEY-COST"])], []) }],
    [
      "a later REJECTED review supersedes approval",
      {
        models: allModels(
          [effectModel(), econModel(["SYNTH-KEY-PRICE"], ["SYNTH-KEY-COST"])],
          [...FAVOURABLE_REVIEWS, ...FAVOURABLE_REVIEWS.map((r) => ({ ...r, decision: "REJECTED", reviewedAt: "2026-01-06T00:00:00Z" }))],
        ),
      },
    ],
    ["model rule not in production", { models: allModels([effectModel(modelRule("SYNTH-RULE-EFFECT", MODEL_PASS, { productionState: "DRAFT" })), econModel(["SYNTH-KEY-PRICE"], ["SYNTH-KEY-COST"], modelRule("SYNTH-RULE-ECONOMIC", MODEL_PASS, { productionState: "DRAFT" }))]) }],
    ["model recorded after the cutoff", { models: allModels([effectModel(undefined, { recordedAt: LATER }), econModel(["SYNTH-KEY-PRICE"], ["SYNTH-KEY-COST"], undefined, { recordedAt: LATER })]) }],
    ["source changed (bound version no longer current)", { models: { ...FAVOURABLE_MODELS, sources: CATALOGUE.map((s) => (s.sourceId === SCIENCE_SOURCE.sourceId ? { ...s, lifecycle: "REVIEW_REQUIRED" } : s)) } }],
  ];
  it.each(unknownCases)("%s ⇒ EFFECT_UNKNOWN / VALUE_UNKNOWN (never a guessed benefit)", (_l, o) => {
    const c = sellRun(o);
    expect(c.effect.state).toBe("EFFECT_UNKNOWN");
    expect(c.value.state).toBe("VALUE_UNKNOWN");
    expect(c.value.amount).toBeNull();
  });

  it("an implementation absent from the trusted registry ⇒ EFFECT_UNKNOWN (an untrusted registry resolves nothing)", () => {
    const r = recommendCattle(requestOf({ actions: registry([SELL()]), models: FAVOURABLE_MODELS, observations: FAVOURABLE_OBS }), hash, {});
    expect(recOf(r).candidates[0].effect.reasonCodes[0]).toMatch(/^CATTLE_RECOMMENDATION_MODEL_IMPLEMENTATION_NOT_REGISTERED/);
    const forged = recommendCattle(requestOf({ actions: registry([SELL()]), models: FAVOURABLE_MODELS, observations: FAVOURABLE_OBS }), hash, { obligationImplementations: { implementations: [MODEL_PASS] } as never });
    expect(recOf(forged).candidates[0].effect.state).toBe("EFFECT_UNKNOWN");
  });

  it("a FAIL effect model ⇒ EFFECT_NOT_SUPPORTED: never proposed, rejected with its reason", () => {
    const rec = recOf(run({ actions: registry([SELL(), action("SYNTH-OTHER")]), models: allModels([effectModel(modelRule("SYNTH-RULE-EFFECT", MODEL_FAIL))]) }));
    expect(rec.record.recommendedAction?.actionKind).toBe("SYNTH-OTHER");
    expect(rec.pack.rejectedAlternatives).toContainEqual({ actionId: JSON.stringify(["SYNTH-SELL", "ANIMAL", A]), reasonCodes: ["CATTLE_RECOMMENDATION_EFFECT_NOT_SUPPORTED"] });
    const alone = recOf(run({ actions: registry([SELL()]), models: allModels([effectModel(modelRule("SYNTH-RULE-EFFECT", MODEL_FAIL))]) }));
    expect(alone.record.outcome).toBe("NO_RECOMMENDATION");
  });

  const valueCases: [string, unknown[], string][] = [
    ["an observation missing", [econObs("o-price", "SYNTH-KEY-PRICE", "1000.00")], "CATTLE_RECOMMENDATION_VALUE_INPUT_UNKNOWN:SYNTH-KEY-COST"],
    ["two live observations of one key (no latest-wins)", [...FAVOURABLE_OBS, econObs("o-cost-2", "SYNTH-KEY-COST", "260", { observedAt: "2026-04-03T00:00:00Z" })], "CATTLE_RECOMMENDATION_VALUE_INPUT_CONFLICT:SYNTH-KEY-COST"],
    ["currencies mixed (no conversion)", [econObs("o-price", "SYNTH-KEY-PRICE", "1000.00"), econObs("o-cost", "SYNTH-KEY-COST", "250.5", { currency: "SYNTH-CUR" })], "CATTLE_RECOMMENDATION_VALUE_CURRENCY_MIXED:EUR,SYNTH-CUR"],
    ["a currency money.ts cannot compute", [econObs("o-price", "SYNTH-KEY-PRICE", "1000.00", { currency: "SYNTH-CUR" }), econObs("o-cost", "SYNTH-KEY-COST", "250.5", { currency: "SYNTH-CUR" })], "CATTLE_RECOMMENDATION_VALUE_CURRENCY_NOT_COMPUTABLE:SYNTH-CUR"],
    ["an observation not yet observed at effectiveAt", [FAVOURABLE_OBS[0], econObs("o-cost", "SYNTH-KEY-COST", "250.5", { observedAt: "2026-05-01T00:00:00Z" })], "CATTLE_RECOMMENDATION_VALUE_INPUT_UNKNOWN:SYNTH-KEY-COST"],
  ];
  it.each(valueCases)("value unknown: %s", (_l, observations, reason) => {
    const c = sellRun({ models: FAVOURABLE_MODELS, observations });
    expect(c.value).toMatchObject({ state: "VALUE_UNKNOWN", amount: null });
    expect(c.value.reasonCodes).toContain(reason);
  });

  it("a correction supersedes an observation (append-only); the earlier cutoff still sees the original", () => {
    const corrected = [...FAVOURABLE_OBS, econObs("o-cost-fix", "SYNTH-KEY-COST", "300", { supersedes: ["o-cost"], receivedAt: "2026-05-10T00:00:00Z" })];
    expect(sellRun({ models: FAVOURABLE_MODELS, observations: corrected }).value.amount).toBe("700.00");
    expect(sellRun({ models: FAVOURABLE_MODELS, observations: corrected, knowledgeCutoff: "2026-05-01T00:00:00Z" }).value.amount).toBe("749.50");
  });

  it("malformed models fail the request closed (hard-gate model, inputs declared, missing field)", () => {
    for (const bad of [
      effectModel(modelRule("SYNTH-RULE-EFFECT", MODEL_PASS, { gateRole: "HARD_GATE" })),
      effectModel(modelRule("SYNTH-RULE-EFFECT", MODEL_PASS, { requiredInputs: [{ inputKey: "synth.x", description: "x", unit: null, acceptedClasses: ["FACT"] }] })),
      (({ expectedEffect, ...rest }) => (void expectedEffect, rest))(effectModel()),
      econModel([], []),
    ]) {
      expect(codes(run({ actions: registry([SELL()]), models: allModels([bad]) }))).toContain("CATTLE_RECOMMENDATION_MODEL_INVALID");
    }
  });

  it("models no registered action references are not dependencies of the context", () => {
    const ctx = recOf(run({ models: FAVOURABLE_MODELS })).context;
    expect(ctx.models).toEqual({ records: [], reviews: [], sources: [] });
    expect(ctx.modelEvaluations).toEqual([]);
    expect(ctx.economics).toEqual([]);
  });
});

describe("C8 test 5 — deterministic ranking", () => {
  const known = (kind: string, benefit: string, cost: string, tier = "EXPECTED_NET_RETURN") => {
    const model = econModel([`SYNTH-KEY-${kind}-B`], [`SYNTH-KEY-${kind}-C`], modelRule(`SYNTH-RULE-${kind}`), { modelId: `SYNTH-MODEL-${kind}` });
    return {
      def: action(kind, { tier, economicModelRef: { modelId: `SYNTH-MODEL-${kind}`, version: "v1" } }),
      model,
      obs: [econObs(`o-${kind}-b`, `SYNTH-KEY-${kind}-B`, benefit), econObs(`o-${kind}-c`, `SYNTH-KEY-${kind}-C`, cost)],
      reviews: approveModels([model]),
    };
  };
  const runKnown = (entries: ReturnType<typeof known>[], extraDefs: Rec[] = []) =>
    recOf(
      run({
        actions: registry([...entries.map((e) => e.def), ...extraDefs]),
        models: allModels(
          entries.map((e) => e.model),
          entries.flatMap((e) => e.reviews),
        ),
        observations: entries.flatMap((e) => e.obs),
      }),
    );
  const order = (rec: CattleRecommendation) => rec.candidates.map((c) => c.actionKind);

  it("tier order first; within a tier KNOWN value (exact, higher first) before VALUE_UNKNOWN", () => {
    const rec = runKnown([known("SYNTH-A", "10", "1"), known("SYNTH-B", "20", "1")], [action("SYNTH-SAFETY", { tier: "SAFETY_LEGAL_WELFARE" }), action("SYNTH-UNKNOWN")]);
    expect(order(rec)).toEqual(["SYNTH-SAFETY", "SYNTH-B", "SYNTH-A", "SYNTH-UNKNOWN"]);
    expect(rec.record.recommendedAction?.actionKind).toBe("SYNTH-SAFETY");
  });

  it("unknown value is never treated as zero: a known negative value still ranks above an unknown one", () => {
    const rec = runKnown([known("SYNTH-LOSS", "1", "5")], [action("SYNTH-AAA-UNKNOWN")]);
    expect(rec.candidates[0]).toMatchObject({ actionKind: "SYNTH-LOSS", value: { state: "VALUE_KNOWN", amount: "-4" } });
    expect(order(rec)).toEqual(["SYNTH-LOSS", "SYNTH-AAA-UNKNOWN"]);
  });

  it("equal exact values (different decimal spellings) tie and are broken by stable action identity, recorded", () => {
    const rec = runKnown([known("SYNTH-Y", "10.50", "0"), known("SYNTH-X", "10.5", "0")], [action("SYNTH-U1"), action("SYNTH-U2")]);
    expect(order(rec)).toEqual(["SYNTH-X", "SYNTH-Y", "SYNTH-U1", "SYNTH-U2"]);
    expect(rec.ties).toEqual([
      { actionIds: [JSON.stringify(["SYNTH-X", "ANIMAL", A]), JSON.stringify(["SYNTH-Y", "ANIMAL", A])], brokenBy: "ACTION_IDENTITY" },
      { actionIds: [JSON.stringify(["SYNTH-U1", "ANIMAL", A]), JSON.stringify(["SYNTH-U2", "ANIMAL", A])], brokenBy: "ACTION_IDENTITY" },
    ]);
    const step = rec.pack.calculationSteps.at(-1)!;
    expect(step.description).toBe("Deterministic ranking of candidate actions");
    expect(step.output).toBe(JSON.stringify(["SYNTH-X", "ANIMAL", A]));
  });

  it("non-actionable candidates rank after every selectable one and their value is never consulted", () => {
    const rec = recOf(run(favourable({ actions: registry([SELL(["C3_WITHDRAWAL"], { tier: "SAFETY_LEGAL_WELFARE" }), action("SYNTH-INFO", { tier: "VALUE_OF_INFORMATION" })]), health: health(IN_WITHDRAWAL_RECORDS) })));
    expect(order(rec)).toEqual(["SYNTH-INFO", "SYNTH-SELL"]);
    expect(rec.record.outcome).toBe("ACTIONABLE");
  });

  it("CAT-INV-012: registry definition order never changes the result", () => {
    const entries = [known("SYNTH-A", "10", "1"), known("SYNTH-B", "10", "1")];
    const defs = [...entries.map((e) => e.def), action("SYNTH-C"), action("SYNTH-D", { tier: "SAFETY_LEGAL_WELFARE" })];
    const v = checkOrderIndependence("registry order", defs, (ds) =>
      recOf(run({ actions: registry(ds), models: allModels(entries.map((e) => e.model), entries.flatMap((e) => e.reviews)), observations: entries.flatMap((e) => e.obs) })).fingerprint,
    );
    expect(v).toEqual(CONFORMS);
  });
});

describe("C8 test 6 — rejected alternatives carry reasons", () => {
  it("every non-proposed candidate is rejected with non-empty structured reasons", () => {
    const rec = recOf(run(favourable({ actions: registry([SELL(["C3_WITHDRAWAL"]), action("SYNTH-B"), action("SYNTH-C", { tier: "VALUE_OF_INFORMATION" })]), health: health(IN_WITHDRAWAL_RECORDS) })));
    const proposed = rec.pack.proposedActionId;
    expect(proposed).toBe(JSON.stringify(["SYNTH-B", "ANIMAL", A]));
    expect(rec.pack.rejectedAlternatives).toEqual([
      { actionId: JSON.stringify(["SYNTH-C", "ANIMAL", A]), reasonCodes: [`CATTLE_RECOMMENDATION_RANKED_BELOW:${proposed}`] },
      { actionId: JSON.stringify(["SYNTH-SELL", "ANIMAL", A]), reasonCodes: ["CATTLE_RECOMMENDATION_GATE_FAIL:CATTLE_HEALTH_WITHDRAWAL:SYNTH-FOOD-MEAT"] },
    ]);
  });
});

describe("C8 test 7 — packs verify and reproduce", () => {
  const base = favourable({ actions: registry([SELL(["C3_WITHDRAWAL"])]), health: health(CLEAR_RECORDS), goals: goals([goalDecl("g-fin")]), weights: { observations: [weightObs("w-1", "2026-04-01T00:00:00Z")] } });

  it("the C0 pack and the C8 record verify; tampering is detected", () => {
    const rec = recOf(run(base));
    expect(cattle.verifyRecommendationEvidencePack(rec.pack, hash)).toEqual({ valid: true });
    expect(verifyCattleRecommendation(rec, hash, TRUSTED)).toEqual({ valid: true });
    const tampered = structuredClone(rec) as CattleRecommendation;
    tampered.record.outcome = "BLOCKED";
    expect(verifyCattleRecommendation(tampered, hash, TRUSTED).valid).toBe(false);
    const packTampered = structuredClone(rec) as CattleRecommendation;
    packTampered.pack.outcome = "BLOCKED";
    expect(verifyCattleRecommendation(packTampered, hash, TRUSTED).valid).toBe(false);
    const contextTampered = structuredClone(rec) as CattleRecommendation;
    contextTampered.context.economics = [];
    expect(verifyCattleRecommendation(contextTampered, hash, TRUSTED).valid).toBe(false);
  });

  it("identical inputs ⇒ identical fingerprints; semantically equivalent inputs keep them; material changes change them", () => {
    const fp = (o: Run) => recOf(run(o)).fingerprint.digest;
    const v = checkFingerprintStability(
      "C8 recommendation",
      base,
      [
        { label: "equivalent query instant spellings", payload: { ...base, effectiveAt: "2026-04-15T00:00:00.000Z", knowledgeCutoff: "2026-06-01T00:00:00.000000000Z" } },
        { label: "equivalent observation instant spelling", payload: { ...base, observations: [econObs("o-price", "SYNTH-KEY-PRICE", "1000.00", { observedAt: "2026-04-01T00:00:00.000Z" }), FAVOURABLE_OBS[1]] } },
        { label: "equivalent definition knowledge-time spelling", payload: { ...base, actions: registry([SELL(["C3_WITHDRAWAL"], { recordedAt: "2026-01-01T00:00:00.0Z" })]) } },
        { label: "observation input order", payload: { ...base, observations: [...FAVOURABLE_OBS].reverse() } },
        { label: "identical duplicate observation", payload: { ...base, observations: [...FAVOURABLE_OBS, FAVOURABLE_OBS[0]] } },
      ],
      [
        { label: "economic amount", payload: { ...base, observations: [econObs("o-price", "SYNTH-KEY-PRICE", "1000.01"), FAVOURABLE_OBS[1]] } },
        { label: "knowledge cutoff", payload: { ...base, knowledgeCutoff: "2026-06-02T00:00:00Z" } },
        { label: "effective time", payload: { ...base, effectiveAt: "2026-04-16T00:00:00Z" } },
        { label: "registry version", payload: { ...base, actions: registry([SELL(["C3_WITHDRAWAL"])], "2") } },
        { label: "action tier", payload: { ...base, actions: registry([SELL(["C3_WITHDRAWAL"], { tier: "AVOID_MATERIAL_LOSS" })]) } },
        { label: "C3 evidence", payload: { ...base, health: health(IN_WITHDRAWAL_RECORDS) } },
        { label: "C6 goal", payload: { ...base, goals: goals([goalDecl("g-fin", "BREEDING")]) } },
        { label: "C4 weight", payload: { ...base, weights: { observations: [weightObs("w-1", "2026-04-02T00:00:00Z")] } } },
      ],
      fp,
    );
    expect(v).toEqual(CONFORMS);
  });

  it("the pack binds the target scope, goal snapshot, exact rule versions and sources", () => {
    const rec = recOf(run(base));
    expect(rec.pack.targetScope).toEqual({ kind: "ANIMAL", id: A, snapshotRef: `CATTLE_ANIMAL_SNAPSHOT:${rec.context.animal.snapshotFingerprint.digest}` });
    expect(rec.pack.intent?.intentId).toMatch(/^CATTLE_GOAL_SNAPSHOT:[0-9a-f]{64}$/);
    expect(rec.pack.ruleEvaluations.map((e) => e.requestedRuleId)).toEqual(["CATTLE_HEALTH_WITHDRAWAL:SYNTH-FOOD-MEAT", "SYNTH-RULE-ECONOMIC", "SYNTH-RULE-EFFECT"]);
    expect(rec.pack.sourceRefs.map((s) => s.sourceId)).toEqual(["SYNTH-SRC-PRICE", "SYNTH-SRC-PRODUCT", "SYNTH-SRC-SCIENCE"]);
    expect(rec.pack.recommendationId).toBe(`CATTLE_RECOMMENDATION:${rec.context.fingerprint.digest}`);
  });
});

describe("C8 test 8 — later knowledge never alters a stored recommendation", () => {
  const T1 = "2026-05-01T00:00:00Z";
  it("CAT-INV-004: a later goal, observation, model, definition or programme change is invisible at the earlier cutoff", () => {
    const known = [{ kind: "goal", value: goalDecl("g-none-yet", "SALE", "2026-01-01T00:00:00Z", B) }];
    const later = [
      { kind: "goal", value: goalDecl("g-late", "FINISHING", "2026-05-02T00:00:00Z") },
      { kind: "goal", value: { ...goalDecl("g-late-bad", "NOT-A-TYPE", "2026-05-02T00:00:00Z") } },
      { kind: "obs", value: econObs("o-late", "SYNTH-KEY-PRICE", "5", { receivedAt: "2026-05-02T00:00:00Z" }) },
      { kind: "obs", value: { observationId: "o-late-bad", receivedAt: "2026-05-02T00:00:00Z" } },
      { kind: "model", value: effectModel(undefined, { modelId: "SYNTH-MODEL-LATE", recordedAt: "2026-05-02T00:00:00Z" }) },
      { kind: "def", value: action("SYNTH-LATE", { recordedAt: "2026-05-02T00:00:00Z", tier: "SAFETY_LEGAL_WELFARE" }) },
      { kind: "def", value: { actionKind: "SYNTH-LATE-BAD", recordedAt: "2026-05-02T00:00:00Z" } },
    ];
    const evaluate = (records: readonly { kind: string; value: unknown }[], cutoff: string) => {
      const of = (k: string) => records.filter((r) => r.kind === k).map((r) => r.value as Rec);
      const r = run({
        knowledgeCutoff: cutoff,
        goals: goals(of("goal")),
        observations: [...FAVOURABLE_OBS, ...of("obs")],
        models: allModels([effectModel(), econModel(["SYNTH-KEY-PRICE"], ["SYNTH-KEY-COST"]), ...of("model")], FAVOURABLE_MODELS.reviews),
        actions: registry([SELL(), ...DEFAULT_CANDIDATE_ACTION_REGISTRY.definitions.filter((d) => d.actionKind === "DECLARE_PRODUCTION_GOAL"), ...of("def")]),
      });
      return ok(r).fingerprint.digest;
    };
    expect(checkFutureKnowledgeInvisible([{ label: "C8 inputs", known, later, knowledgeCutoff: T1 }], evaluate)).toEqual(CONFORMS);
  });

  it("the recommendation reproduced at the earlier cutoff is unchanged after a later goal declaration; the later cutoff sees it", () => {
    const req = (cutoff: string) => run({ knowledgeCutoff: cutoff, goals: goals([goalDecl("g-late", "FINISHING", "2026-05-02T00:00:00Z")]), actions: defaultOnly("DECLARE_PRODUCTION_GOAL") });
    const early = recOf(run({ knowledgeCutoff: T1, goals: goals([]), actions: defaultOnly("DECLARE_PRODUCTION_GOAL") }));
    expect(early.record.recommendedAction?.actionKind).toBe("DECLARE_PRODUCTION_GOAL");
    expect(recOf(req(T1)).fingerprint).toEqual(early.fingerprint);
    expect(recOf(req(T1)).pack.fingerprint).toEqual(early.pack.fingerprint);
    expect(recOf(req(LATER)).record.outcome).toBe("NO_RECOMMENDATION");
  });

  it("late predecessor evidence (C3 administration received later) leaves the earlier gate and pack unchanged", () => {
    const late = adm("h-late", "2026-04-10T00:00:00Z", { provenance: { sourceCategory: "FARMER", actorRole: "FARMER", receivedAt: "2026-05-02T00:00:00Z" } });
    const at = (records: Rec[], cutoff: string) => recOf(run(favourable({ knowledgeCutoff: cutoff, actions: registry([SELL(["C3_WITHDRAWAL"])]), health: health(records) })));
    expect(at([...CLEAR_RECORDS, late], T1).fingerprint).toEqual(at(CLEAR_RECORDS, T1).fingerprint);
    expect(at([...CLEAR_RECORDS, late], T1).record.outcome).toBe("ACTIONABLE");
    expect(at([...CLEAR_RECORDS, late], LATER).record.outcome).toBe("BLOCKED");
  });

  it("CAT-INV-005: a malformed knowledge time on any C8-owned record fails closed", () => {
    const failsClosed = (r: CattleRecommendationOutcomeResult) => !r.ok;
    const obsV = checkMalformedKnowledgeTimeFailsClosed("economic observation receivedAt", FAVOURABLE_OBS, (t) => econObs("o-bad", "SYNTH-KEY-X", "1", { receivedAt: t }), (obs) => run(favourable({ observations: [...obs] })), failsClosed);
    const defV = checkMalformedKnowledgeTimeFailsClosed("definition recordedAt", [action("SYNTH-A")], (t) => action("SYNTH-B", { recordedAt: t }), (defs) => run({ actions: registry([...defs]) }), failsClosed);
    const modelV = checkMalformedKnowledgeTimeFailsClosed("model recordedAt", [effectModel()], (t) => effectModel(undefined, { modelId: "SYNTH-MODEL-X", recordedAt: t }), (ms) => run({ models: allModels([...ms]) }), failsClosed);
    expect([obsV, defV, modelV]).toEqual([CONFORMS, CONFORMS, CONFORMS]);
  });

  it("CAT-INV-008: identity before validity for observations, definitions and models", () => {
    const failsClosed = (r: CattleRecommendationOutcomeResult) => !r.ok;
    const evalObs = (obs: readonly unknown[]) => run(favourable({ actions: registry([SELL()]), observations: [...obs] }));
    const vObs = checkDuplicateIdentity(
      "economic observation",
      FAVOURABLE_OBS,
      econObs("o-price", "SYNTH-KEY-PRICE", "1000.00", { receivedAt: "2026-04-02T00:00:00.000Z" }),
      [
        { label: "different amount", record: econObs("o-price", "SYNTH-KEY-PRICE", "1000.01") },
        { label: "invalid copy", record: { ...econObs("o-price", "SYNTH-KEY-PRICE", "1000.00"), amount: "NaN" } },
      ],
      evalObs,
      failsClosed,
    );
    const vDef = checkDuplicateIdentity("definition", [action("SYNTH-A")], action("SYNTH-A"), [{ label: "different tier", record: action("SYNTH-A", { tier: "AVOID_MATERIAL_LOSS" }) }, { label: "invalid copy", record: action("SYNTH-A", { tier: "NOT-A-TIER" }) }], (d) => run({ actions: registry([...d]) }), failsClosed);
    const vModel = checkDuplicateIdentity("model", [effectModel()], effectModel(), [{ label: "different effect", record: effectModel(undefined, { expectedEffect: "SYNTH other" }) }], (m) => run({ actions: registry([SELL()]), models: allModels([...m]) }), failsClosed);
    expect([vObs, vDef, vModel]).toEqual([CONFORMS, CONFORMS, CONFORMS]);
  });
});

describe("C8 test 9 — deterministic explanation from structured fields", () => {
  it("renders a fixed template from pack / record fields only (snapshot)", () => {
    const rec = recOf(run({ weights: { observations: [] }, actions: defaultOnly("RECORD_WEIGHT") }));
    expect(rec.record.explanation.replace(rec.pack.fingerprint.digest, "<PACK-DIGEST>").replace(rec.pack.recommendationId, "<PACK-ID>")).toBe(
      "Outcome: ACTIONABLE. Proposed action: RECORD_WEIGHT (VALUE_OF_INFORMATION, registry-declared priority) - Record a weight observation for the animal (no weight observation is in view). Hard gates: none. Expected effect: EFFECT_UNKNOWN. Economic value: VALUE_UNKNOWN. Missing context: OBLIGATIONS, HEALTH, PERFORMANCE, GOALS, PROGRAMMES. Evidence pack <PACK-ID> (<PACK-DIGEST>).",
    );
    // The explanation is rendered from the pack alone (F003: single source of decision evidence).
    expect(cattle.renderRecommendationExplanation(rec.pack)).toBe(rec.record.explanation);
  });

  it("no clock, randomness, network, AI or tooling import anywhere in the production modules", () => {
    const dir = __dirname;
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toMatch(/Date\.now|new Date\(|performance\.now|Math\.random|fetch\(|XMLHttpRequest|openai|anthropic|@\/tooling|src\/tooling/);
    }
  });

  it("predecessor engines are invoked only at the one construction boundary", () => {
    const engines = /\b(projectAnimalSnapshot|rematerialiseAnimalLedger|evaluateHerdObligations|projectObligationHardGates|projectAnimalHealth|projectWithdrawalHardGates|buildWeightReadContract|evaluatePerformance|projectProductionGoals|routeProductionGoals|resolveGoalTargetApplicability|evaluateHealthProgrammes|projectProgrammeHardGates)\(/;
    for (const f of readdirSync(__dirname).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts") && n !== "evaluation-context.ts")) {
      expect(readFileSync(join(__dirname, f), "utf8"), f).not.toMatch(engines);
    }
  });
});

describe("C8 test 10 — herd mode, aliasing, frozen output, ownership", () => {
  const herd = (o: Run = {}) =>
    run(
      favourable({
        ledgers: [LEDGER_A, LEDGER_B],
        actions: registry([SELL(["C3_WITHDRAWAL"]), ...DEFAULT_CANDIDATE_ACTION_REGISTRY.definitions.filter((d) => d.actionKind === "RECORD_WEIGHT")]),
        health: health(CLEAR_RECORDS, [{ animalId: B, healthRecords: IN_WITHDRAWAL_RECORDS.map((r) => ({ ...r, animalId: B })) }]),
        weights: { observations: [weightObs("w-a", "2026-04-01T00:00:00Z")] },
        ...o,
      }),
    );

  it("per-animal results plus a deterministic herd ordering", () => {
    const res = ok(herd());
    expect(res.animals.map((a) => [a.animalId, a.record.outcome, a.record.recommendedAction?.actionKind])).toEqual([
      [A, "ACTIONABLE", "SYNTH-SELL"],
      [B, "ACTIONABLE", "RECORD_WEIGHT"],
    ]);
    expect(res.ordering.map((e) => [e.position, e.animalId, e.tier])).toEqual([
      [1, A, "EXPECTED_NET_RETURN"],
      [2, B, "VALUE_OF_INFORMATION"],
    ]);
  });

  it("CAT-INV-012: ledger, health-animal and observation order never change the herd result", () => {
    const v = checkOrderIndependence("ledger order", [LEDGER_A, LEDGER_B, ledgerOf("SYNTH-ANIMAL-3")], (ls) => ok(herd({ ledgers: ls })).fingerprint.digest);
    const w = checkOrderIndependence("observation order", [...FAVOURABLE_OBS, econObs("o-x", "SYNTH-KEY-X", "1")], (obs) => ok(herd({ observations: obs })).fingerprint.digest);
    expect([v, w]).toEqual([CONFORMS, CONFORMS]);
  });

  it("CAT-INV-002: detached from the caller's request, deep-frozen, reproducible", () => {
    const v = checkDetachedResult(
      "recommendCattle",
      () => structuredClone(requestOf(favourable({ ledgers: [LEDGER_A], actions: registry([SELL()]) }))),
      (req) => recommendCattle(req, hash, TRUSTED),
      (req) => {
        ((req.economics as Rec).observations as Rec[])[0].amount = "1";
        ((req.actions as Rec).definitions as Rec[])[0].tier = "SAFETY_LEGAL_WELFARE";
        (req.query as Rec).knowledgeCutoff = LATER;
      },
    );
    expect(v).toEqual(CONFORMS);
  });

  it("A/B/C binding guard: owned inputs change the result; upstream inputs only through the owner's output; declared non-dependencies never", () => {
    const fpA = (o: Run) => recOf(herd(o), A).fingerprint.digest;
    const base = fpA({});
    // A — C8-owned material input consumed by A's recommendation.
    expect(fpA({ observations: [econObs("o-price", "SYNTH-KEY-PRICE", "999"), FAVOURABLE_OBS[1]] })).not.toBe(base);
    // B — upstream-owned: another animal's C3 / C4 evidence leaves A's owner outputs, and so A's result, byte-identical…
    expect(fpA({ health: health(CLEAR_RECORDS, [{ animalId: B, healthRecords: [] }]) })).toBe(base);
    expect(fpA({ weights: { observations: [weightObs("w-a", "2026-04-01T00:00:00Z"), weightObs("w-b", "2026-04-01T00:00:00Z", B)] } })).toBe(base);
    // …an equivalent spelling of A's own C4 record leaves C4's series output unchanged…
    expect(fpA({ weights: { observations: [weightObs("w-a", "2026-04-01T00:00:00.000Z")] } })).toBe(base);
    // …and a raw change the owner turns into a different output changes it.
    expect(fpA({ weights: { observations: [weightObs("w-a", "2026-04-03T00:00:00Z")] } })).not.toBe(base);
    // C — explicit non-dependencies {path, owningPhase, reason}.
    const nonDependencies: { path: string; owningPhase: string; reason: string; run: Run }[] = [
      { path: "economics.observations[unreferenced key]", owningPhase: "C8", reason: "no admitted economic model names the value key", run: { observations: [...FAVOURABLE_OBS, econObs("o-other", "SYNTH-KEY-OTHER", "7")] } },
      { path: "models.records[unreferenced]", owningPhase: "C8", reason: "no admitted action references the model", run: { models: { ...FAVOURABLE_MODELS, records: [...FAVOURABLE_MODELS.records, effectModel(undefined, { modelId: "SYNTH-MODEL-UNUSED" })] } } },
    ];
    for (const n of nonDependencies) expect(fpA(n.run), n.path).toBe(base);
  });

  it("owner-output equivalence: C8's consumed parts equal the frozen engines' own outputs for the same canonical evidence", () => {
    const rec = recOf(herd(), A);
    // C8 passes every engine the canonical spelling of the query times (C1's snapshot fingerprint is representation-sensitive by design).
    const times = { effectiveAt: "2026-04-15T00:00:00.000000000Z", knowledgeCutoff: "2026-06-01T00:00:00.000000000Z" };
    const snap = projectAnimalSnapshot(LEDGER_A, times);
    if (!snap.ok) throw new Error("snapshot");
    expect(rec.context.animal.snapshotFingerprint).toEqual(computeAnimalSnapshotFingerprint(snap.snapshot, hash));
    const c3 = projectAnimalHealth({ ledger: LEDGER_A, healthRecords: CLEAR_RECORDS, productRecords: PRODUCTS, query: { ...times, foodProducts: [MEAT] } }, hash);
    if (!c3.ok) throw new Error("c3");
    const gates = projectWithdrawalHardGates(c3.projection, hash);
    if (!gates.ok) throw new Error("gates");
    expect(rec.context.health).toMatchObject({ state: "SUPPLIED", withdrawalGateFingerprint: c3.projection.withdrawalGate.fingerprint, gates: gates.gates.ruleEvaluations });
    const c4 = buildWeightReadContract({ observations: [weightObs("w-a", "2026-04-01T00:00:00Z")], scope: { kind: "EXPLICIT_SET", animalIds: [A] }, query: times }, hash);
    if (!c4.ok) throw new Error("c4");
    expect(rec.context.weights).toMatchObject({ contractFingerprint: c4.contract.fingerprint, seriesFingerprint: c4.contract.series[0].fingerprint });
  });

  it("the C2 implementation registry is required with C2 evidence", () => {
    expect(codes(recommendCattle(requestOf({ obligations: obligations() }), hash, {}))).toEqual(["CATTLE_RECOMMENDATION_OBLIGATION_IMPLEMENTATIONS_MISSING"]);
  });
});

describe("C8 canonical boundary, field policy and one viewpoint", () => {
  it("CAT-INV-001: non-canonical input anywhere (incl. a collection-level getter) is rejected before evaluation", () => {
    let reads = 0;
    const withGetter = requestOf();
    Object.defineProperty(withGetter.economics as object, "observations", { enumerable: true, get: () => (reads++, []) });
    expect(codes(recommendCattle(withGetter, hash, TRUSTED))).toEqual(["CATTLE_RECOMMENDATION_NON_CANONICAL_INPUT"]);
    expect(reads).toBe(0);
    const ledgerGetter: Rec[] = [];
    Object.defineProperty(ledgerGetter, "0", { enumerable: true, get: () => LEDGER_A });
    expect(codes(recommendCattle(requestOf({ ledgers: ledgerGetter }), hash, TRUSTED))).toEqual(["CATTLE_RECOMMENDATION_NON_CANONICAL_INPUT"]);
  });

  describe("F009: stored-recommendation verification and the public pack readers run the canonical boundary first", () => {
    const stored = () =>
      structuredClone(
        recOf(run(favourable({ actions: registry([SELL(["C3_WITHDRAWAL"])]), health: health(CLEAR_RECORDS), goals: goals([goalDecl("g-fin")]), weights: { observations: [weightObs("w-1", "2026-04-01T00:00:00Z")] } }))),
      ) as CattleRecommendation;
    type Taint = (target: object, key: string, value: unknown, onRead: () => void) => void;
    const taints: Record<string, Taint> = {
      getter: (t, k, v, onRead) => Object.defineProperty(t, k, { enumerable: true, configurable: true, get: () => (onRead(), v) }),
      hidden: (t, k, v) => Object.defineProperty(t, k, { enumerable: false, configurable: true, writable: true, value: v }),
      symbol: (t) => Object.defineProperty(t, Symbol("SYNTH-hidden"), { enumerable: true, value: 1 }),
    };
    // Every level a reader touches: the recommendation, its record, pack, context, and nested pack / context arrays.
    const sites: Record<string, (r: CattleRecommendation) => [object, string]> = {
      recommendation: (r) => [r, "pack"],
      record: (r) => [r.record, "outcome"],
      pack: (r) => [r.pack, "calculationSteps"],
      packStep: (r) => [r.pack.calculationSteps[0], "inputs"],
      context: (r) => [r.context, "fingerprint"],
      fingerprint: (r) => [r.fingerprint, "digest"],
    };

    it("F009: a getter on a valid stored recommendation is rejected and never invoked", () => {
      const rec = stored();
      expect(verifyCattleRecommendation(rec, hash, TRUSTED)).toEqual({ valid: true });
      let reads = 0;
      const pack = rec.pack;
      Object.defineProperty(rec, "pack", { enumerable: true, get: () => (reads++, pack) });
      expect(verifyCattleRecommendation(rec, hash, TRUSTED)).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_NON_CANONICAL_INPUT" });
      expect(reads).toBe(0);
    });

    it("F009 class: every taint kind at every reachable site fails closed for the verifier and each pack reader; getters stay uninvoked", () => {
      for (const [taintName, taint] of Object.entries(taints)) {
        for (const [siteName, site] of Object.entries(sites)) {
          let reads = 0;
          const rec = stored();
          const [target, key] = site(rec);
          taint(target, key, (target as Rec)[key], () => reads++);
          const label = `${taintName}@${siteName}`;
          expect(verifyCattleRecommendation(rec, hash, TRUSTED), label).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_NON_CANONICAL_INPUT" });
          if (siteName.startsWith("pack")) {
            expect(cattle.readPackDecision(rec.pack), label).toBeNull();
            expect(cattle.renderRecommendationExplanation(rec.pack), label).toBeNull();
            expect(cattle.deriveRecommendationRecord(rec.pack), label).toBeNull();
          }
          expect(reads, label).toBe(0);
        }
      }
      // Positive control: the untainted copy still verifies and reads.
      const clean = stored();
      expect(verifyCattleRecommendation(clean, hash, TRUSTED)).toEqual({ valid: true });
      expect(cattle.deriveRecommendationRecord(clean.pack)).toEqual(clean.record);
    });
  });

  it("field-presence policy: a missing field, an extra field or `undefined` fails closed; performance needs weights", () => {
    const { goals: _g, ...missing } = requestOf();
    void _g;
    expect(codes(recommendCattle(missing, hash, TRUSTED))).toEqual(["CATTLE_RECOMMENDATION_INVALID_REQUEST"]);
    expect(codes(recommendCattle({ ...requestOf(), extra: 1 }, hash, TRUSTED))).toEqual(["CATTLE_RECOMMENDATION_INVALID_REQUEST"]);
    expect(codes(recommendCattle({ ...requestOf(), weights: { observations: [], extra: [] } }, hash, TRUSTED))).toEqual(["CATTLE_RECOMMENDATION_INVALID_REQUEST"]);
    expect(codes(run({ performance: { targets: [], policies: [], contexts: [], windowFrom: null } }))).toEqual(["CATTLE_RECOMMENDATION_PERFORMANCE_WITHOUT_WEIGHTS"]);
    expect(codes(run({ effectiveAt: "2026-04-15T00:00:00+00:00" }))).toEqual(["CATTLE_RECOMMENDATION_INVALID_EFFECTIVE_AT"]);
  });

  it("C5 runs over the composed C4 contract and C6 target applicability over that C5 evaluation", () => {
    const rec = recOf(run({ weights: { observations: [weightObs("w-1", "2026-04-01T00:00:00Z")] }, performance: { targets: [], policies: [], contexts: [], windowFrom: null }, goals: goals([goalDecl("g-fin")]) }));
    expect(rec.context.performance.state).toBe("SUPPLIED");
    expect(rec.context.goals).toMatchObject({ state: "SUPPLIED", status: "ACTIVE", activeGoalTypes: ["FINISHING"] });
    expect((rec.context.goals as { targetApplicabilityFingerprint: unknown }).targetApplicabilityFingerprint).not.toBeNull();
  });

  it("CAT-INV-015: a part projected at another cutoff or effective time is rejected at sealing", () => {
    const built = buildEvaluationContexts(requestOf({ weights: { observations: [] } }), hash, TRUSTED);
    if (!built.ok) throw new Error("context");
    const { fingerprint: _f, recommendationPayloadVersion: _v, evaluationDate: _d, ...unsealed } = built.contexts[0];
    void [_f, _v, _d];
    const sealedOk = sealEvaluationContext(unsealed, [{ part: "C4_CONTRACT", effectiveAt: "2026-04-15T00:00:00.000Z", knowledgeCutoff: CUTOFF }], hash);
    expect(sealedOk.ok && sealedOk.context.fingerprint).toEqual(built.contexts[0].fingerprint);
    for (const echo of [
      { part: "C4_CONTRACT", effectiveAt: EFFECTIVE, knowledgeCutoff: LATER },
      { part: "C6_SNAPSHOT", effectiveAt: "2026-04-16T00:00:00Z", knowledgeCutoff: CUTOFF },
    ]) {
      const r = sealEvaluationContext(unsealed, [echo], hash);
      expect(r).toEqual({ ok: false, issues: [{ code: "CATTLE_RECOMMENDATION_CONTEXT_TIME_MISMATCH", ref: `${A}:${echo.part}` }] });
    }
  });

  it("rejected predecessor evidence fails closed (never defaulted to NOT_SUPPLIED)", () => {
    expect(codes(run({ health: health([{ recordId: "bad" }]) }))).toContain("CATTLE_RECOMMENDATION_HEALTH_EVIDENCE_INVALID");
    expect(codes(run({ health: { ...health([]), animals: [{ animalId: "SYNTH-NOBODY", healthRecords: [] }] } }))).toContain("CATTLE_RECOMMENDATION_HEALTH_EVIDENCE_UNKNOWN_ANIMAL");
    expect(codes(run({ weights: { observations: [{ recordId: "bad" }] } }))).toContain("CATTLE_RECOMMENDATION_WEIGHT_EVIDENCE_INVALID");
    expect(codes(run({ obligations: obligations({ evidence: [{ evidenceId: "bad" }] }) }))).toContain("CATTLE_RECOMMENDATION_OBLIGATION_EVIDENCE_INVALID");
    expect(codes(run({ ledgers: [LEDGER_A, LEDGER_A] }))).toContain("CATTLE_RECOMMENDATION_DUPLICATE_ANIMAL");
  });
});

describe("C8 consumed-field schema (CAT-INV-028) — generated malformed-output matrix", () => {
  /** Real outputs of the frozen engines, one per consumed surface. */
  function surfaces(): Record<keyof typeof RECOMMENDATION_CONSUMED_SURFACES, unknown> {
    const times = { effectiveAt: EFFECTIVE, knowledgeCutoff: CUTOFF };
    const must = (r: { ok: boolean }): unknown => {
      if (!r.ok) throw new Error(JSON.stringify(r));
      return r;
    };
    const snap = must(projectAnimalSnapshot(LEDGER_A, times)) as { snapshot: unknown };
    const herd = must(evaluateHerdObligations({ ledgers: [LEDGER_A], evidence: [], catalogue: OBL_CATALOGUE as never, implementations: TRUSTED.obligationImplementations, query: { ...times, obligationIds: [OBL] } }, hash)) as { herd: { animals: never[] } };
    const c2g = must(projectObligationHardGates(herd.herd.animals[0], hash)) as { projection: unknown };
    const c3 = must(projectAnimalHealth({ ledger: LEDGER_A, healthRecords: CLEAR_RECORDS, productRecords: PRODUCTS, query: { ...times, foodProducts: [MEAT] } }, hash)) as { projection: never };
    const c3g = must(projectWithdrawalHardGates(c3.projection, hash)) as { gates: unknown };
    const c4 = must(buildWeightReadContract({ observations: [weightObs("w-1", "2026-04-01T00:00:00Z")], scope: { kind: "EXPLICIT_SET", animalIds: [A] }, query: times }, hash)) as { contract: never };
    const c5 = must(evaluatePerformance({ weights: c4.contract, query: { ...times, windowFrom: null, projectionAt: null }, targets: [], policies: [], contexts: [] }, hash)) as { evaluation: never };
    const query = { subject: { kind: "ANIMAL", animalId: A }, ...times } as never;
    const c6 = must(projectProductionGoals({ declarations: [goalDecl("g-fin")], query }, hash)) as { projection: unknown };
    const c6r = must(routeProductionGoals({ declarations: [goalDecl("g-fin")], query, registry: EMPTY_GOAL_ROUTING_REGISTRY }, hash)) as { routing: unknown };
    const c6t = must(resolveGoalTargetApplicability({ declarations: [goalDecl("g-fin")], query, performance: c5.evaluation }, hash)) as { applicability: unknown };
    const c7 = must(
      evaluateHealthProgrammes({ ...programmes(), ledgers: [LEDGER_A], health: health([]), obligations: null, query: times } as never, hash, TRUSTED),
    ) as { evaluation: never };
    const c7g = must(projectProgrammeHardGates(c7.evaluation, A, hash)) as { gates: unknown };
    return {
      C1_SNAPSHOT_IDENTITY: snap.snapshot,
      C2_EVALUATION: herd.herd.animals[0],
      C2_GATES: c2g.projection,
      C3_PROJECTION: c3.projection,
      C3_GATES: c3g.gates,
      C4_CONTRACT: c4.contract,
      C5_EVALUATION: c5.evaluation,
      C6_PROJECTION: c6.projection,
      C6_ROUTING: c6r.routing,
      C6_TARGET_APPLICABILITY: c6t.applicability,
      C7_EVALUATION: c7.evaluation,
      C7_GATES: c7g.gates,
    };
  }

  /** Every declared field position reachable in `value` (object fields; first array element). */
  function mutations(spec: FieldSpec, value: unknown, path: string[] = []): { label: string; mutate: (root: unknown) => void }[] {
    const out: { label: string; mutate: (root: unknown) => void }[] = [];
    const at = (root: unknown, p: string[]) => p.reduce((v: unknown, k) => (v as Record<string, unknown>)[k], root);
    if (spec.t === "nullable") return value === null ? [] : mutations(spec.of, value, path);
    if (spec.t === "array") return Array.isArray(value) && value.length > 0 ? mutations(spec.of, value[0], [...path, "0"]) : [];
    if (spec.t === "object" || spec.t === "kinded") {
      const fields = spec.t === "object" ? spec.fields : { ...spec.common, ...spec.variants[(value as Record<string, string>)[spec.tag]] };
      for (const [k, f] of Object.entries(fields)) {
        const p = [...path, k];
        const parent = (root: unknown) => at(root, path) as Record<string, unknown>;
        out.push({ label: `${p.join(".")} missing`, mutate: (root) => void delete parent(root)[k] });
        if (f.t !== "nullable") out.push({ label: `${p.join(".")} null`, mutate: (root) => void (parent(root)[k] = null) });
        out.push({ label: `${p.join(".")} wrong type`, mutate: (root) => void (parent(root)[k] = typeof parent(root)[k] === "string" ? 12345 : "SYNTH WRONG TYPE ") });
        out.push(...mutations(f, (value as Record<string, unknown>)[k], p));
      }
    }
    return out;
  }

  it("every surface's real output conforms, and every generated malformation is rejected", () => {
    const outputs = surfaces();
    for (const [name, surface] of Object.entries(RECOMMENDATION_CONSUMED_SURFACES)) {
      const output = outputs[name as keyof typeof outputs];
      expect(valid(surface.spec as FieldSpec, output), name).toBe(true);
      const matrix = mutations(surface.spec as FieldSpec, output);
      expect(matrix.length, name).toBeGreaterThan(0);
      for (const m of matrix) {
        const copy = structuredClone(output);
        m.mutate(copy);
        expect(valid(surface.spec as FieldSpec, copy), `${name}: ${m.label}`).toBe(false);
      }
    }
    expect(conformanceSnapshot(Object.keys(outputs).sort())).toBe(conformanceSnapshot(Object.keys(RECOMMENDATION_CONSUMED_SURFACES).sort()));
  });
});

describe("C8 remediation — model content binding, gate identity, ranking provenance", () => {
  const SELL_ID = JSON.stringify(["SYNTH-SELL", "ANIMAL", A]);
  const [EFFECT_BOUND, ECON_BOUND] = FAVOURABLE_MODELS.records as Rec[];
  /** Replaces a bound model's content WITHOUT rebinding or re-approving its rule (the F001 reproduction). */
  const unbound = (m: Rec, patch: Rec) => ({ ...m, ...patch });
  const sellWith = (records: Rec[]) => recOf(run({ actions: registry([SELL()]), observations: FAVOURABLE_OBS, models: allModels(records, FAVOURABLE_MODELS.reviews) })).candidates[0];

  it("F001: a changed effect statement or reversed benefit / cost keys under the same approval is never supported or valued", () => {
    const effect = sellWith([unbound(EFFECT_BOUND, { expectedEffect: "SYNTH unreviewed effect" }), ECON_BOUND]);
    expect(effect.effect.state).toBe("EFFECT_UNKNOWN");
    expect(effect.effect.reasonCodes[0]).toMatch(/^CATTLE_RECOMMENDATION_MODEL_CONTENT_NOT_BOUND_TO_RULE_VERSION/);
    const reversed = sellWith([EFFECT_BOUND, unbound(ECON_BOUND, { value: { form: "NET_OF_BOUND_OBSERVATIONS", benefitKeys: ["SYNTH-KEY-COST"], costKeys: ["SYNTH-KEY-PRICE"] } })]);
    expect(reversed.value).toMatchObject({ state: "VALUE_UNKNOWN", amount: null });
    expect(reversed.value.reasonCodes[0]).toMatch(/^CATTLE_RECOMMENDATION_MODEL_CONTENT_NOT_BOUND_TO_RULE_VERSION/);
  });

  it("F001 class: every material content mutation unbinds the model; set order of keys does not", () => {
    const econValue = ECON_BOUND.value as Rec;
    const effectMutations: Rec[] = [{ expectedEffect: "SYNTH asserted effect, revised" }, { modelId: "SYNTH-MODEL-EFFECT-2" }, { version: "v2" }];
    const econMutations: Rec[] = [
      { value: { ...econValue, benefitKeys: ["SYNTH-KEY-PRICE", "SYNTH-KEY-EXTRA"] } },
      { value: { ...econValue, costKeys: [] } },
      { value: { ...econValue, benefitKeys: econValue.costKeys, costKeys: econValue.benefitKeys } },
    ];
    for (const patch of effectMutations) {
      const ref = { modelId: (patch.modelId as string | undefined) ?? "SYNTH-MODEL-EFFECT", version: (patch.version as string | undefined) ?? "v1" };
      const c = recOf(run({ actions: registry([SELL([], { effectModelRef: ref })]), observations: FAVOURABLE_OBS, models: allModels([unbound(EFFECT_BOUND, patch), ECON_BOUND], FAVOURABLE_MODELS.reviews) })).candidates[0];
      expect(c.effect.state, JSON.stringify(patch)).toBe("EFFECT_UNKNOWN");
    }
    for (const patch of econMutations) expect(sellWith([EFFECT_BOUND, unbound(ECON_BOUND, patch)]).value.state, JSON.stringify(patch)).toBe("VALUE_UNKNOWN");
    // Metamorphic: benefit / cost keys are sets — permuting them keeps the binding (same approval, same value).
    const two = econModel(["SYNTH-KEY-PRICE", "SYNTH-KEY-BONUS"], ["SYNTH-KEY-COST"]);
    const twoPermuted = unbound(two, { value: { ...(two.value as Rec), benefitKeys: ["SYNTH-KEY-BONUS", "SYNTH-KEY-PRICE"] } });
    const obs = [...FAVOURABLE_OBS, econObs("o-bonus", "SYNTH-KEY-BONUS", "1")];
    const valueWith = (m: Rec) => recOf(run({ actions: registry([SELL()]), observations: obs, models: allModels([EFFECT_BOUND, m], approveModels([EFFECT_BOUND, two])) })).candidates[0].value;
    expect(valueWith(two)).toMatchObject({ state: "VALUE_KNOWN", amount: "750.50" });
    expect(valueWith(twoPermuted)).toMatchObject({ state: "VALUE_KNOWN", amount: "750.50" });
  });

  // A synthetic C2 obligation whose rule id collides with C3's withdrawal gate id.
  const COLLIDING = "CATTLE_HEALTH_WITHDRAWAL:SYNTH-FOOD-MEAT";
  const COLLIDING_DEF: ObligationDefinition = { ...OBL_DEFINITION, ruleId: COLLIDING };
  const COLLIDING_RULE = synthRule({ ruleId: COLLIDING, version: 1, requiredInputs: [], implementation: bindTo(OBL_IMPL), assumptions: ["synthetic assumption", obligationTermsMarker(COLLIDING_DEF, hash)] });
  const collidingObligations = obligations({
    catalogue: { definitions: [COLLIDING_DEF], ruleVersions: [COLLIDING_RULE], sources: CATALOGUE, reviews: approve(COLLIDING_RULE) },
    evidence: [{ ...fulfilment(), rule: { ruleId: COLLIDING, version: 1 } }],
  });
  const collide = (sell: Rec) => run(favourable({ actions: registry([sell]), obligations: collidingObligations, health: health(IN_WITHDRAWAL_RECORDS) }));

  it("F002: a passing C2 gate sharing the failing C3 withdrawal gate id never masks it — every source order and the named lookup fail closed", () => {
    const variants: [string, Rec][] = [
      ["C2 then C3", SELL(["C2_OBLIGATION", "C3_WITHDRAWAL"])],
      ["C3 then C2", SELL(["C3_WITHDRAWAL", "C2_OBLIGATION"])],
      ["named gate only", SELL([], { prerequisites: { sources: [], gateRuleIds: [COLLIDING] } })],
      ["C2 source + named gate", SELL([], { prerequisites: { sources: ["C2_OBLIGATION"], gateRuleIds: [COLLIDING] } })],
    ];
    for (const [label, sell] of variants) {
      const r = collide(sell);
      expect(r.ok, label).toBe(false);
      expect(r.ok ? [] : r.issues, label).toContainEqual({ code: "CATTLE_RECOMMENDATION_GATE_IDENTITY_AMBIGUOUS", ref: `${A}:${COLLIDING}` });
    }
  });

  it("F002 class: prerequisite source order never changes the gates, outcome or pack gate outcomes (no first-match precedence)", () => {
    const sources = ["C2_OBLIGATION", "C3_WITHDRAWAL", "C7_PROGRAMME"];
    for (const records of [CLEAR_RECORDS, IN_WITHDRAWAL_RECORDS]) {
      // Registry content (incl. its source order) is fingerprinted by design, so the gate semantics are compared.
      const v = checkOrderIndependence("prerequisite sources", sources, (s) => {
        const rec = recOf(
          run(
            favourable({
              actions: registry([SELL([...s], { prerequisites: { sources: [...s], gateRuleIds: [OBL_RULE, PROGRAMME_GATE] } })]),
              obligations: obligations({ evidence: [fulfilment()] }),
              health: health(records),
              programmes: programmes(),
            }),
          ),
        );
        return conformanceSnapshot({ outcome: rec.record.outcome, gates: rec.candidates[0].gates, hard: rec.pack.hardGateOutcomes, rules: rec.pack.ruleEvaluations });
      });
      expect(v).toEqual(CONFORMS);
    }
  });

  // F002 (re-audit): generated gates share the rule identity space with supplied gates and pack records.
  /** A passing synthetic C2 obligation whose rule id is `ruleId`. */
  const c2Passing = (ruleId: string) => {
    const def: ObligationDefinition = { ...OBL_DEFINITION, ruleId };
    const rule = synthRule({ ruleId, version: 1, requiredInputs: [], implementation: bindTo(OBL_IMPL), assumptions: ["synthetic assumption", obligationTermsMarker(def, hash)] });
    return obligations({ catalogue: { definitions: [def], ruleVersions: [rule], sources: CATALOGUE, reviews: approve(rule) }, evidence: [{ ...fulfilment(), rule: { ruleId, version: 1 } }] });
  };
  /** A gate-clear alternative that is never selectable (FAIL effect) but whose PASSING economic rule id is `ruleId`. */
  const shadowingAlternative = (ruleId: string) => {
    const effect = effectModel(modelRule("SYNTH-RULE-SHADOW-EFFECT", MODEL_FAIL), { modelId: "SYNTH-MODEL-SHADOW-EFFECT" });
    const econ = econModel(["SYNTH-KEY-PRICE"], ["SYNTH-KEY-COST"], modelRule(ruleId), { modelId: "SYNTH-MODEL-SHADOW-ECON" });
    const def = action("SYNTH-SHADOW", { effectModelRef: { modelId: "SYNTH-MODEL-SHADOW-EFFECT", version: "v1" }, economicModelRef: { modelId: "SYNTH-MODEL-SHADOW-ECON", version: "v1" } });
    return { def, models: allModels([effect, econ]) };
  };
  /** Every generated-gate family of the proposed (NOT_CLEAR) action: its generated id and the action definition producing it. */
  const GENERATED_FAMILIES: { family: string; id: string; gated: Rec; c2: boolean }[] = [
    { family: "evidence requirement", id: "CATTLE_RECOMMENDATION_REQUIRES:PERFORMANCE", gated: action("SYNTH-GATED", { prerequisites: { sources: ["C2_OBLIGATION"], gateRuleIds: [] }, evidenceRequirements: ["PERFORMANCE"] }), c2: true },
    { family: "missing gate source", id: "CATTLE_RECOMMENDATION_REQUIRES:PROGRAMMES", gated: action("SYNTH-GATED", { prerequisites: { sources: ["C2_OBLIGATION", "C7_PROGRAMME"], gateRuleIds: [] } }), c2: true },
    { family: "unresolved eligibility", id: "CATTLE_RECOMMENDATION_REQUIRES:GOALS", gated: action("SYNTH-GATED", { prerequisites: { sources: ["C2_OBLIGATION"], gateRuleIds: [] }, applicableGoalTypes: ["FINISHING"] }), c2: true },
    // A named gate absent from every source: a C2 record under its id would FIND it (not a collision), so only the pack route applies.
    { family: "named gate absent", id: "SYNTH-RULE-NAMED-ABSENT", gated: action("SYNTH-GATED", { prerequisites: { sources: [], gateRuleIds: ["SYNTH-RULE-NAMED-ABSENT"] } }), c2: false },
  ];
  const ambiguous = (r: CattleRecommendationOutcomeResult, id: string, label: string) => {
    expect(r.ok, label).toBe(false);
    expect(r.ok ? [] : r.issues, label).toContainEqual({ code: "CATTLE_RECOMMENDATION_GATE_IDENTITY_AMBIGUOUS", ref: `${A}:${id}` });
  };

  it("F002 re-audit: a passing C2 rule named like a required-evidence marker never satisfies the missing evidence", () => {
    const id = "CATTLE_RECOMMENDATION_REQUIRES:PERFORMANCE";
    const r = run(favourable({ actions: registry([SELL(["C2_OBLIGATION"], { evidenceRequirements: ["PERFORMANCE"] })]), obligations: c2Passing(id) }));
    ambiguous(r, id, "audit reproduction");
  });

  it("F002 class: every generated-gate family fails closed on a collision with a supplied gate or any pack record; never ACTIONABLE", () => {
    for (const { family, id, gated, c2 } of GENERATED_FAMILIES) {
      const shadow = shadowingAlternative(id);
      const control = shadowingAlternative("SYNTH-RULE-SHADOW-ECON");
      const routes: [string, Run, Run][] = [
        ["pack record", { actions: registry([gated, shadow.def]), models: shadow.models, observations: FAVOURABLE_OBS, obligations: c2Passing(OBL_RULE) }, { actions: registry([gated, control.def]), models: control.models, observations: FAVOURABLE_OBS, obligations: c2Passing(OBL_RULE) }],
      ];
      if (c2) routes.push(["supplied C2 gate", { actions: registry([gated]), obligations: c2Passing(id) }, { actions: registry([gated]), obligations: c2Passing(OBL_RULE) }]);
      for (const [route, colliding, nonColliding] of routes) {
        const label = `${family} × ${route}`;
        ambiguous(run(colliding), id, label);
        // Positive control: without the collision the generated gate stays unresolved and the gated proposal is not actionable.
        const rec = recOf(run(nonColliding));
        expect(rec.pack.proposedActionId, label).toBe(JSON.stringify(["SYNTH-GATED", "ANIMAL", A]));
        expect(rec.candidates.find((c) => c.actionKind === "SYNTH-GATED")?.gates.checks.map((c) => c.ruleId), label).toContain(id);
        expect(rec.record.outcome, label).not.toBe("ACTIONABLE");
        expect(rec.pack.hardGateOutcomes.find((g) => g.ruleId === id)?.state, label).toBe("NOT_EVALUATED");
      }
    }
  });

  it("F002 class: a named gate equal to a generated marker is one ambiguous identity, never two checks C0 resolves by first match", () => {
    const id = "CATTLE_RECOMMENDATION_REQUIRES:PERFORMANCE";
    const r = run({ actions: registry([action("SYNTH-GATED", { prerequisites: { sources: [], gateRuleIds: [id] }, evidenceRequirements: ["PERFORMANCE"] })]) });
    ambiguous(r, id, "named gate × marker");
  });

  const alt = (kind: string, benefit: string, ruleId: string) => {
    const model = econModel([`SYNTH-KEY-${kind}`], [], modelRule(ruleId), { modelId: `SYNTH-MODEL-${kind}` });
    return { def: action(kind, { economicModelRef: { modelId: `SYNTH-MODEL-${kind}`, version: "v1" } }), model, obs: [econObs(`o-${kind}`, `SYNTH-KEY-${kind}`, benefit)] };
  };
  /** Class invariant: every candidate's consulted model evaluation, observations and value step are in the pack. */
  function expectRankingEvidence(rec: CattleRecommendation) {
    const ruleIds = rec.pack.ruleEvaluations.map((e) => e.requestedRuleId);
    const inputRefs = rec.pack.inputs.map((i) => i.provenance.ref);
    for (const c of rec.candidates) {
      const label = c.actionId === rec.pack.proposedActionId ? "proposed action" : c.actionId;
      expect(rec.pack.calculationSteps.some((s) => s.formula === rec.pack.calculationSteps[0].formula && s.description.includes(label)), `${c.actionId} gate step`).toBe(true);
      if (c.value.state !== "VALUE_KNOWN") continue;
      const step = rec.pack.calculationSteps.find((s) => s.output === c.value.amount && s.description.startsWith("Economic value") && s.description.includes(label));
      expect(step?.rule, c.actionId).toBeTruthy();
      expect(ruleIds, c.actionId).toContain(step!.rule!.ruleId);
      for (const id of c.value.observationIds) expect(inputRefs, `${c.actionId}:${id}`).toContain(id);
    }
  }

  it("F003: the pack carries the rule evaluation, observations and value step of an alternative it ranked below the proposal", () => {
    const win = alt("SYNTH-WIN", "900", "SYNTH-WIN-RULE");
    const lose = alt("SYNTH-ALT", "250.5", "SYNTH-ALT-RULE");
    const rec = recOf(run({ actions: registry([win.def, lose.def]), models: allModels([win.model, lose.model]), observations: [...win.obs, ...lose.obs] }));
    expect(rec.pack.proposedActionId).toBe(JSON.stringify(["SYNTH-WIN", "ANIMAL", A]));
    expect(rec.pack.ruleEvaluations.map((e) => e.requestedRuleId)).toEqual(["SYNTH-ALT-RULE", "SYNTH-WIN-RULE"]);
    expect(rec.pack.candidateActions.find((c) => c.favourability === "250.5 EUR")).toBeDefined();
    expect(rec.pack.calculationSteps.find((s) => s.description.includes("alternative") && s.output === "250.5")?.rule?.ruleId).toBe("SYNTH-ALT-RULE");
    expect(rec.pack.inputs.map((i) => i.provenance.ref)).toEqual(expect.arrayContaining(["o-SYNTH-ALT", "o-SYNTH-WIN"]));
    expect(rec.record.outcome).toBe("ACTIONABLE");
    expect(verifyCattleRecommendation(rec, hash, TRUSTED).valid).toBe(true);
    expectRankingEvidence(rec);
  });

  it("F003 class: ranking evidence is complete in every scenario; alternatives' hard gates never decide the proposal's outcome", () => {
    const a = alt("SYNTH-A", "10", "SYNTH-RULE-A");
    const b = alt("SYNTH-B", "20", "SYNTH-RULE-B");
    const withA = [...(FAVOURABLE_MODELS.records as Rec[]), a.model];
    const scenarios: Run[] = [
      { actions: registry([a.def, b.def, action("SYNTH-UNKNOWN")]), models: allModels([a.model, b.model]), observations: [...a.obs, ...b.obs] },
      favourable({ actions: registry([SELL(), a.def]), models: allModels(withA), observations: [...FAVOURABLE_OBS, ...a.obs] }),
      // The gated alternative fails its C3 gate: its gate step is recorded, but the ungated proposal stays ACTIONABLE.
      favourable({ actions: registry([SELL(["C3_WITHDRAWAL"], { tier: "SAFETY_LEGAL_WELFARE" }), a.def]), models: allModels(withA), observations: [...FAVOURABLE_OBS, ...a.obs], health: health(IN_WITHDRAWAL_RECORDS) }),
    ];
    for (const s of scenarios) expectRankingEvidence(recOf(run(s)));
    const gated = recOf(run(scenarios[2]));
    expect(gated.pack.proposedActionId).toBe(JSON.stringify(["SYNTH-A", "ANIMAL", A]));
    expect(gated.record.outcome).toBe("ACTIONABLE");
    expect(gated.pack.hardGateOutcomes).toEqual([]);
    expect(gated.pack.rejectedAlternatives).toContainEqual({ actionId: SELL_ID, reasonCodes: ["CATTLE_RECOMMENDATION_GATE_FAIL:CATTLE_HEALTH_WITHDRAWAL:SYNTH-FOOD-MEAT"] });
  });
});

// ---------------------------------------------------------------------------
// C8 consolidated architectural repair (review 2026-10-15; F003 / F004 / F005, R1–R11)
// ---------------------------------------------------------------------------

/** Every mutation of a REAL record, enumerated from the record object itself (never from C8's schema). */
function realMutations(record: unknown, isMap: (path: string[]) => boolean): { label: string; mutate: (root: Record<string, unknown>) => void }[] {
  const out: { label: string; mutate: (root: Record<string, unknown>) => void }[] = [];
  const at = (root: unknown, p: string[]) => p.reduce((v: unknown, k) => (v as Record<string, unknown>)[k], root);
  const wrong = (v: unknown) => (v !== null && typeof v === "object" ? "SYNTH-WRONG-TYPE" : { synthWrongType: true });
  const walk = (value: unknown, path: string[]) => {
    if (Array.isArray(value)) {
      if (value.length > 0) walk(value[0], [...path, "0"]);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const map = isMap(path);
    if (!map) out.push({ label: `${path.join(".") || "<root>"} + undeclared field`, mutate: (root) => void ((at(root, path) as Record<string, unknown>).synthUndeclared = "SYNTH") });
    for (const [k, v] of Object.entries(value)) {
      const p = [...path, k];
      if (!map) out.push({ label: `${p.join(".")} missing`, mutate: (root) => void delete (at(root, path) as Record<string, unknown>)[k] });
      out.push({ label: `${p.join(".")} wrong type`, mutate: (root) => void ((at(root, path) as Record<string, unknown>)[k] = wrong(v)) });
      walk(v, p);
    }
  };
  walk(record, []);
  return out;
}

/** The real record a seam returns in `scenario` (captured through the pass-through wrapper). */
function captureAt(seam: string, scenario: () => unknown): Record<string, unknown> {
  faults.capture = { seam, value: undefined };
  try {
    scenario();
    expect(faults.capture.value, `${seam} captured`).toBeDefined();
    return faults.capture.value as Record<string, unknown>;
  } finally {
    faults.capture = null;
  }
}

function withFault<T>(seam: string, mutate: (record: Record<string, unknown>) => void, scenario: () => T): T {
  faults.armed = { seam, mutate };
  try {
    return scenario();
  } finally {
    faults.armed = null;
  }
}

/** Recursively the object keys of a real value vs an exact spec's declared fields (map values excepted). */
function keyMismatches(spec: unknown, value: unknown, path = "<root>"): string[] {
  const s = spec as { t: string; of?: unknown; fields?: Record<string, unknown> };
  if (s.t === "nullable") return value === null ? [] : keyMismatches(s.of, value, path);
  if (s.t === "array") return Array.isArray(value) ? value.flatMap((x, i) => keyMismatches(s.of, x, `${path}.${i}`)) : [`${path}: not an array`];
  if (s.t === "map") return [];
  if (s.t !== "object") return [];
  const declared = Object.keys(s.fields ?? {}).sort();
  const actual = Object.keys(value as object).sort();
  const diff = [...declared.filter((k) => !actual.includes(k)).map((k) => `${path}.${k} declared, absent`), ...actual.filter((k) => !declared.includes(k)).map((k) => `${path}.${k} present, undeclared`)];
  return [...diff, ...declared.filter((k) => actual.includes(k)).flatMap((k) => keyMismatches(s.fields![k], (value as Record<string, unknown>)[k], `${path}.${k}`))];
}

describe("C8 repair A — shared C0 protocol shape at the in-process seams (CAT-INV-028, clarified)", () => {
  const C2_SCENARIO = (): Run => favourable({ actions: registry([SELL(["C2_OBLIGATION"])]), obligations: obligations({ evidence: [fulfilment()] }) });
  const C3_SCENARIO = (): Run => favourable({ actions: registry([SELL(["C3_WITHDRAWAL"])]), health: health(CLEAR_RECORDS) });
  const C7_SCENARIO = (): Run => favourable({ actions: registry([SELL(["C7_PROGRAMME"])]), programmes: programmes(), health: health([]) });
  const MODEL_SCENARIO = (): Run => favourable({ actions: registry([SELL()]) });
  const SEAMS: { seam: string; scenario: () => Run; code: string }[] = [
    { seam: "C2_GATES", scenario: C2_SCENARIO, code: "CATTLE_RECOMMENDATION_OBLIGATION_EVIDENCE_INVALID" },
    { seam: "C3_GATES", scenario: C3_SCENARIO, code: "CATTLE_RECOMMENDATION_HEALTH_EVIDENCE_INVALID" },
    { seam: "C7_GATES", scenario: C7_SCENARIO, code: "CATTLE_RECOMMENDATION_PROGRAMME_EVIDENCE_INVALID" },
  ];

  it("the exact C0 schemas declare exactly the fields of the REAL frozen outputs (gates of C2 / C3 / C7, model records, packs)", () => {
    for (const { seam, scenario } of SEAMS) expect(keyMismatches(cattleExact.RULE_EVALUATION_RECORD, captureAt(seam, () => run(scenario()))), seam).toEqual([]);
    expect(keyMismatches(cattleExact.RULE_EVALUATION_RECORD, captureAt("MODEL_RECORD", () => run(MODEL_SCENARIO())))).toEqual([]);
    expect(keyMismatches(cattleExact.EVIDENCE_PACK, captureAt("PACK", () => run(C2_SCENARIO())))).toEqual([]);
  });

  it("every gate seam: each mutation of the real record (missing / wrong type / undeclared field, every level) fails the request closed — never ACTIONABLE", () => {
    for (const { seam, scenario, code } of SEAMS) {
      expect(recOf(run(scenario())).record.outcome === "BLOCKED" || recOf(run(scenario())).record.outcome === "ACTIONABLE", `${seam} baseline runs`).toBe(true);
      const matrix = realMutations(captureAt(seam, () => run(scenario())), () => false);
      expect(matrix.length, seam).toBeGreaterThan(30);
      for (const m of matrix) {
        const r = withFault(seam, m.mutate, () => run(scenario()));
        expect(r.ok, `${seam}: ${m.label}`).toBe(false);
        expect(codes(r), `${seam}: ${m.label}`).toContain(code);
      }
    }
  });

  it("F005 exact reproduction: a C3 projector record whose rule version is not an integer fails closed (never ACTIONABLE, never a verified pack)", () => {
    const r = withFault("C3_GATES", (rec) => void (rec.rule = { ruleId: "SYNTH-RULE", version: "SYNTH-INVALID-VERSION" }), () => run(C3_SCENARIO()));
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("CATTLE_RECOMMENDATION_HEALTH_EVIDENCE_INVALID");
  });

  it("model seam: each mutation of the real C0 model record leaves the model UNAVAILABLE (effect unknown, no approval label, record absent from the pack)", () => {
    const matrix = realMutations(captureAt("MODEL_RECORD", () => run(MODEL_SCENARIO())), () => false);
    expect(matrix.length).toBeGreaterThan(30);
    for (const m of matrix) {
      const rec = recOf(withFault("MODEL_RECORD", m.mutate, () => run(MODEL_SCENARIO())));
      expect(rec.candidates[0].effect.state, m.label).toBe("EFFECT_UNKNOWN");
      expect(rec.candidates[0].effect.reasonCodes[0], m.label).toMatch(/^CATTLE_RECOMMENDATION_MODEL_EVALUATION_MALFORMED/);
      expect(rec.record.evidence.effectBasis, m.label).toBe("NONE");
      expect(rec.pack.ruleEvaluations.map((e) => e.requestedRuleId), m.label).not.toContain("SYNTH-RULE-EFFECT");
    }
  });

  it("pack seam: each mutation of the real C0 pack fails the request closed (calculation-step input maps are free-form keys)", () => {
    const isMap = (path: string[]) => path.length === 3 && path[0] === "calculationSteps" && path[2] === "inputs";
    const matrix = realMutations(captureAt("PACK", () => run(C2_SCENARIO())), isMap);
    expect(matrix.length).toBeGreaterThan(100);
    for (const m of matrix) {
      const r = withFault("PACK", m.mutate, () => run(C2_SCENARIO()));
      expect(r.ok, m.label).toBe(false);
      expect(r.ok ? [] : r.issues, m.label).toContainEqual({ code: "CATTLE_RECOMMENDATION_PACK_INVALID", ref: `${A}:CATTLE_RECOMMENDATION_PACK_MALFORMED` });
    }
  });

  it("carried records are detached copies: no raw predecessor object is reachable from the context or the pack", () => {
    const rec = recOf(run(C2_SCENARIO()));
    const gate = (rec.context.obligations as { gates: unknown[] }).gates[0];
    expect(cattleExact.exactValid(cattleExact.RULE_EVALUATION_RECORD, gate)).toBe(true);
    expect(cattleExact.exactValid(cattleExact.EVIDENCE_PACK, rec.pack)).toBe(true);
    expect(verifyCattleRecommendation(rec, hash, TRUSTED).valid).toBe(true);
  });
});

describe("C8 repair C — model eligibility (F004 / R2, R8, R9; human decision D1)", () => {
  const CLASSIFICATIONS = ["LEGAL_REQUIRED", "LEGAL_CONDITIONAL", "SCHEME_CONDITIONAL", "VETERINARY_PROGRAMME", "SCIENCE_TARGET", "SCIENCE_CONSTRAINT", "FARMER_INTENT", "SYSTEM_INFERENCE"] as const;
  const MINIMUM: Record<(typeof CLASSIFICATIONS)[number], ("SCIENTIFIC" | "LEGAL" | "VETERINARY")[]> = {
    LEGAL_REQUIRED: ["LEGAL"],
    LEGAL_CONDITIONAL: ["LEGAL"],
    SCHEME_CONDITIONAL: ["LEGAL"],
    VETERINARY_PROGRAMME: ["VETERINARY"],
    SCIENCE_TARGET: ["SCIENTIFIC"],
    SCIENCE_CONSTRAINT: ["SCIENTIFIC"],
    FARMER_INTENT: [],
    SYSTEM_INFERENCE: ["SCIENTIFIC"],
  };
  const ELIGIBLE = { EFFECT: ["SCIENCE_TARGET", "SCIENCE_CONSTRAINT", "SYSTEM_INFERENCE"], ECONOMIC: ["SYSTEM_INFERENCE"] } as const;

  function cell(role: "EFFECT" | "ECONOMIC", classification: (typeof CLASSIFICATIONS)[number], sourced: boolean, scientific: boolean, approved: boolean, productionState: "PRODUCTION" | "SUPERSEDED") {
    const requiredReviews = [...new Set([...MINIMUM[classification], ...(scientific ? (["SCIENTIFIC"] as const) : [])])];
    const ruleId = role === "EFFECT" ? "SYNTH-RULE-EFFECT" : "SYNTH-RULE-ECONOMIC";
    const rule = modelRule(ruleId, MODEL_PASS, { classification, sourceBindings: sourced ? [sourceVersionRef(SCIENCE_SOURCE)] : [], requiredReviews, productionState });
    const model = role === "EFFECT" ? effectModel(rule) : econModel(["SYNTH-KEY-PRICE"], ["SYNTH-KEY-COST"], rule);
    const other = role === "EFFECT" ? (FAVOURABLE_MODELS.records as Rec[])[1] : (FAVOURABLE_MODELS.records as Rec[])[0];
    const reviews = [...(approved ? approveModels([model]) : []), ...approveModels([other])];
    return recOf(run({ actions: registry([SELL()]), observations: FAVOURABLE_OBS, models: allModels([model, other], reviews) }));
  }

  it("matrix: 8 classifications × 2 roles × sources × SCIENTIFIC review × approval × production state — only the D1 cells are supported / valued, and only those are labelled approved", () => {
    let eligibleCells = 0;
    for (const role of ["EFFECT", "ECONOMIC"] as const)
      for (const classification of CLASSIFICATIONS)
        for (const sourced of [true, false])
          for (const scientific of [true, false])
            for (const approved of [true, false])
              for (const productionState of ["PRODUCTION", "SUPERSEDED"] as const) {
                const label = JSON.stringify({ role, classification, sourced, scientific, approved, productionState });
                const rec = cell(role, classification, sourced, scientific, approved, productionState);
                // SCIENTIFIC is required either explicitly or by the classification's C0 minimum.
                const hasScientific = scientific || MINIMUM[classification].includes("SCIENTIFIC");
                const expected = (ELIGIBLE[role] as readonly string[]).includes(classification) && sourced && hasScientific && approved && productionState === "PRODUCTION";
                if (expected) eligibleCells++;
                const c = rec.candidates[0];
                if (role === "EFFECT") {
                  expect(c.effect.state === "EFFECT_SUPPORTED", label).toBe(expected);
                  expect(rec.record.evidence.effectBasis === "SCIENTIFICALLY_APPROVED_EFFECT_MODEL", label).toBe(expected);
                } else {
                  expect(c.value.state === "VALUE_KNOWN", label).toBe(expected);
                  expect(rec.record.evidence.valueBasis === "APPROVED_VALUE_FORM_OVER_UNVALIDATED_OBSERVATIONS", label).toBe(expected);
                }
              }
    // EFFECT: 3 classifications × SCIENTIFIC explicit-or-minimum (2); ECONOMIC: SYSTEM_INFERENCE × 2.
    expect(eligibleCells).toBe(8);
  });

  it("F004 exact reproduction: content-bound FARMER_INTENT models with no sources, reviews or catalogue are never supported, valued or labelled approved", () => {
    const intent = (id: string) => modelRule(id, MODEL_PASS, { classification: "FARMER_INTENT", sourceBindings: [], requiredReviews: [] });
    const models = { records: [effectModel(intent("SYNTH-RULE-EFFECT")), econModel(["SYNTH-KEY-PRICE"], ["SYNTH-KEY-COST"], intent("SYNTH-RULE-ECONOMIC"))], reviews: [], sources: [] };
    const rec = recOf(run({ actions: registry([SELL()]), observations: FAVOURABLE_OBS, models }));
    expect(rec.candidates[0].effect.state).toBe("EFFECT_UNKNOWN");
    expect(rec.candidates[0].value).toMatchObject({ state: "VALUE_UNKNOWN", amount: null });
    expect(rec.candidates[0].effect.reasonCodes.join(" ")).toMatch(/CATTLE_RECOMMENDATION_MODEL_NOT_ELIGIBLE:CLASSIFICATION_NOT_ELIGIBLE_FOR_EFFECT:FARMER_INTENT/);
    expect(rec.candidates[0].value.reasonCodes.join(" ")).toMatch(/CATTLE_RECOMMENDATION_MODEL_NOT_ELIGIBLE:CLASSIFICATION_NOT_ELIGIBLE_FOR_ECONOMIC:FARMER_INTENT/);
    expect(rec.record.evidence).toMatchObject({ strength: "UNMODELLED", effectBasis: "NONE", valueBasis: "NONE" });
  });

  it("approval must be evidenced by the record itself (defence in depth over the eligibility policy)", () => {
    const base = captureAt("MODEL_RECORD", () => run(favourable({ actions: registry([SELL()]) }))) as unknown as Parameters<typeof cattleModels.approvalEvidenced>[0];
    expect(cattleModels.approvalEvidenced(base)).toBe(true);
    expect(cattleModels.approvalEvidenced({ ...base, reviews: [] })).toBe(false);
    expect(cattleModels.approvalEvidenced({ ...base, reviews: base.reviews.map((r) => ({ ...r, state: "PENDING" as const })) })).toBe(false);
    expect(cattleModels.approvalEvidenced({ ...base, sourceChecks: [] })).toBe(false);
    expect(cattleModels.approvalEvidenced({ ...base, sourceChecks: base.sourceChecks.map((s) => ({ ...s, status: "SOURCE_CONTENT_CHANGED" as const })) })).toBe(false);
    expect(Object.keys(cattleModels.MODEL_ELIGIBILITY).sort()).toEqual(["ECONOMIC", "EFFECT"]);
  });

  it("D2 / D3 safeguards: a known value is never presented as validated prices; a priority tier is never presented as reviewed", () => {
    const rec = recOf(run(favourable({ actions: registry([SELL()]) })));
    expect(rec.candidates[0].value.state).toBe("VALUE_KNOWN");
    expect(rec.pack.limitations).toEqual(
      expect.arrayContaining([
        "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATIONS_NOT_INDEPENDENTLY_VALIDATED",
        "CATTLE_RECOMMENDATION_ECONOMIC_MODEL_APPROVAL_COVERS_VALUE_FORM_ONLY",
        "CATTLE_RECOMMENDATION_ACTION_PRIORITY_TIERS_REGISTRY_DECLARED_UNREVIEWED",
      ]),
    );
    expect(rec.record.evidence.valueBasis).toBe("APPROVED_VALUE_FORM_OVER_UNVALIDATED_OBSERVATIONS");
    expect(rec.record.evidence.priorityBasis).toBe("REGISTRY_DECLARED_UNREVIEWED");
    expect(rec.record.explanation).toContain("economic observations not independently validated");
    expect(rec.record.explanation).toContain("registry-declared priority");
    const ranking = rec.pack.calculationSteps.at(-1)!;
    expect(JSON.parse(ranking.inputs[`basis:${rec.candidates[0].actionId}`] as string)).toMatchObject({ tierBasis: "REGISTRY_DECLARED_UNREVIEWED" });
    expect(JSON.stringify(rec)).not.toMatch(/VALIDATED_PRICE|PRICES_VALIDATED|REVIEWED_PRIORITY|APPROVED_MODEL_VALUE/);
  });
});

describe("C8 repair B — complete decision provenance (F003 / R1, R6)", () => {
  /** Class oracle: every decision in the recommendation record maps to pack content. */
  function expectDecisionProvenance(rec: CattleRecommendation) {
    const steps = rec.pack.calculationSteps;
    const proposedId = rec.pack.proposedActionId;
    const ctxRecords = [rec.context.obligations, rec.context.health, rec.context.programmes].flatMap((p) => (p.state === "SUPPLIED" ? (p as { gates: { requestedRuleId: string; rule: unknown; ruleFingerprint: { digest: string } | null; sourceChecks: { bound: { sourceId: string; version: string } }[] }[] }).gates : []));
    const packSources = rec.pack.sourceRefs.map((s) => `${s.sourceId}@${s.version}`);
    for (const c of rec.candidates) {
      const label = c.actionId === proposedId ? "proposed action" : `alternative ${c.actionId}`;
      for (const check of c.gates.checks) {
        const step = steps.find((s) => s.description === `Prerequisite gate ${check.ruleId} of the ${label}`);
        expect(step, `${label} ${check.ruleId}`).toBeDefined();
        expect(step!.output).toBe(check.state);
        expect(step!.inputs.controlsPackOutcome).toBe(c.actionId === proposedId);
        const source = ctxRecords.find((r) => r.requestedRuleId === check.ruleId);
        if (check.source === "CONTEXT" || check.source === "UNRESOLVED_EVIDENCE") {
          expect(step!.rule).toBeNull();
          expect(step!.inputs.record).toBe("GENERATED_NOT_EVALUATED");
        } else {
          expect(step!.rule).toEqual(source!.rule);
          expect(step!.inputs.ruleFingerprint).toBe(source!.ruleFingerprint?.digest ?? "NONE");
          for (const sc of source!.sourceChecks) expect(packSources, `${check.ruleId} source`).toContain(`${sc.bound.sourceId}@${sc.bound.version}`);
        }
      }
      // Non-control: only the proposed action's gates are C0 hard gates.
      if (c.actionId !== proposedId) for (const check of c.gates.checks) if (!rec.candidates.find((x) => x.actionId === proposedId)?.gates.checks.some((p) => p.ruleId === check.ruleId)) expect(rec.pack.hardGateOutcomes.map((g) => g.ruleId)).not.toContain(check.ruleId);
    }
    const exclusions = steps.find((s) => s.description === "Registered actions not considered");
    expect(exclusions).toBeDefined();
    expect(exclusions!.output).toBe(rec.notCandidates.length);
    for (const n of rec.notCandidates) expect(JSON.parse(exclusions!.inputs[`excluded:${n.actionKind}`] as string)).toEqual(n.reasonCodes);
    const ranking = steps.at(-1)!;
    expect(ranking.description).toBe("Deterministic ranking of candidate actions");
    rec.ties.forEach((tie, i) => expect(JSON.parse(ranking.inputs[`tie:${String(i + 1).padStart(4, "0")}`] as string)).toEqual({ actionIds: tie.actionIds, brokenBy: tie.brokenBy }));
    for (const c of rec.candidates) expect(ranking.inputs[`basis:${c.actionId}`]).toBeDefined();
  }

  const SELL_ID = JSON.stringify(["SYNTH-SELL", "ANIMAL", A]);
  const OTHER = action("SYNTH-OTHER");

  it("F003 exact reproduction: an alternative rejected by a failing C2 rule carries its rule version, fingerprint, state and sources in the pack", () => {
    const rec = recOf(run(favourable({ actions: registry([SELL(["C2_OBLIGATION"]), OTHER]), obligations: obligations() })));
    expect(rec.pack.proposedActionId).toBe(JSON.stringify(["SYNTH-OTHER", "ANIMAL", A]));
    expect(rec.pack.rejectedAlternatives).toContainEqual({ actionId: SELL_ID, reasonCodes: [`CATTLE_RECOMMENDATION_GATE_FAIL:${OBL_RULE}`] });
    const step = rec.pack.calculationSteps.find((s) => s.description === `Prerequisite gate ${OBL_RULE} of the alternative ${SELL_ID}`)!;
    expect(step).toMatchObject({ output: "FAIL", rule: { ruleId: OBL_RULE, version: 1 } });
    expect(step.inputs).toMatchObject({ state: "FAIL", source: "C2_OBLIGATION", controlsPackOutcome: false, ownerOutputInputKey: "cattle.recommendation.c2.obligationState" });
    expect(rec.pack.sourceRefs.length).toBeGreaterThan(0);
    expect(rec.pack.hardGateOutcomes).toEqual([]);
    expect(rec.record.outcome).toBe("ACTIONABLE");
    expectDecisionProvenance(rec);
  });

  it("class: C2 / C3 / C7 / generated-gate rejections, exclusions and ties are all in the pack, and never control the proposal's outcome", () => {
    const tieA = action("SYNTH-TIE-A");
    const tieB = action("SYNTH-TIE-B");
    const notTriggered = action("SYNTH-NOT-TRIGGERED", { trigger: { kind: "GOAL_STATUS", statuses: ["NONE"] } });
    const scenarios: Run[] = [
      favourable({ actions: registry([SELL(["C2_OBLIGATION"]), OTHER]), obligations: obligations() }),
      favourable({ actions: registry([SELL(["C3_WITHDRAWAL"]), OTHER]), health: health(IN_WITHDRAWAL_RECORDS) }),
      favourable({ actions: registry([SELL(["C7_PROGRAMME"]), OTHER]), programmes: programmes(), health: health([]) }),
      favourable({ actions: registry([SELL([], { evidenceRequirements: ["PERFORMANCE"] }), OTHER]) }),
      favourable({ actions: registry([SELL([], { prerequisites: { sources: [], gateRuleIds: ["SYNTH-GATE-ABSENT"] } }), OTHER]) }),
      { actions: registry([tieA, tieB, notTriggered]), goals: goals([goalDecl("g-fin")]) },
      favourable({ actions: registry([SELL(["C2_OBLIGATION", "C3_WITHDRAWAL", "C7_PROGRAMME"]), tieA, tieB, notTriggered]), obligations: obligations(), health: health(IN_WITHDRAWAL_RECORDS), programmes: programmes(), goals: goals([goalDecl("g-fin")]) }),
      favourable({ actions: registry([SELL(["C3_WITHDRAWAL"]), OTHER]), health: health(UNKNOWN_RECORDS) }),
      favourable({ actions: registry([SELL(["C3_WITHDRAWAL"]), OTHER]), health: health(CONFLICT_RECORDS) }),
      favourable({ actions: registry([SELL(["C2_OBLIGATION"]), OTHER]), obligations: obligations({ evidence: [fulfilment()], catalogue: { ...OBL_CATALOGUE, reviews: [] } }) }),
      favourable({ actions: registry([SELL(["C2_OBLIGATION"])]), obligations: obligations() }),
      favourable({ actions: registry([SELL(["C3_WITHDRAWAL"])]) }),
    ];
    for (const s of scenarios) expectDecisionProvenance(recOf(run(s)));
    const rich = recOf(run(scenarios[6]));
    expect(rich.notCandidates.map((n) => n.actionKind)).toEqual(["SYNTH-NOT-TRIGGERED"]);
    expect(rich.ties.length).toBeGreaterThan(0);
    expect(rich.record.outcome).toBe("ACTIONABLE");
  });

  it("metamorphic: adding failing / unresolved alternatives never changes the proposal's C0 outcome or hard-gate outcomes", () => {
    const alone = recOf(run(favourable({ actions: registry([OTHER]) })));
    const crowded = recOf(
      run(
        favourable({
          actions: registry([OTHER, SELL(["C2_OBLIGATION", "C3_WITHDRAWAL", "C7_PROGRAMME"], { tier: "SAFETY_LEGAL_WELFARE", evidenceRequirements: ["PERFORMANCE"] })]),
          obligations: obligations(),
          health: health(IN_WITHDRAWAL_RECORDS),
          programmes: programmes(),
        }),
      ),
    );
    expect(crowded.pack.proposedActionId).toBe(alone.pack.proposedActionId);
    expect(crowded.record.outcome).toBe(alone.record.outcome);
    expect(crowded.pack.hardGateOutcomes).toEqual(alone.pack.hardGateOutcomes);
    expect(crowded.pack.requiredHardGateRuleIds).toEqual(alone.pack.requiredHardGateRuleIds);
    expectDecisionProvenance(crowded);
  });
});

// ---------------------------------------------------------------------------
// C8 bounded architecture repair (2026-10-15): CAT-INV-028 trust boundaries, F003 single source, F006 precision
// ---------------------------------------------------------------------------

describe("C8 bounded repair — genuine trust boundary: a stored / reloaded recommendation (CAT-INV-028)", () => {
  it("every mutation of a stored recommendation (record, pack, context, candidates — every level) is rejected by verification", () => {
    const rec = recOf(run(favourable({ actions: registry([SELL(["C2_OBLIGATION", "C3_WITHDRAWAL"]), action("SYNTH-OTHER")]), obligations: obligations({ evidence: [fulfilment()] }), health: health(CLEAR_RECORDS) })));
    expect(verifyCattleRecommendation(rec, hash, TRUSTED).valid).toBe(true);
    const isMap = (path: string[]) => path.length === 4 && path[0] === "pack" && path[1] === "calculationSteps" && path[3] === "inputs";
    const matrix = realMutations(rec, isMap);
    expect(matrix.length).toBeGreaterThan(500);
    for (const m of matrix) {
      const copy = structuredClone(rec) as unknown as Record<string, unknown>;
      m.mutate(copy);
      expect(verifyCattleRecommendation(copy as unknown as CattleRecommendation, hash, TRUSTED).valid, m.label).toBe(false);
    }
  });

  it("a stored pack that is structurally malformed is rejected before anything in it is read", () => {
    const rec = recOf(run(favourable({ actions: registry([SELL()]) })));
    const copy = structuredClone(rec) as unknown as { pack: Record<string, unknown> };
    copy.pack.synthUndeclared = "SYNTH";
    expect(verifyCattleRecommendation(copy as unknown as CattleRecommendation, hash, TRUSTED)).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_STORED_STRUCTURE_MALFORMED" });
  });

  it("F005 disposition: owner-specific value constraints of a frozen in-process engine are the owner's — C8 neither restates them nor relies on them", () => {
    // C8's own consumption of a carried gate record relies only on the shared C0 protocol shape: identity
    // (`requestedRuleId`), state, rule reference and source checks are carried verbatim into the pack. The owner
    // (C2 / C3) guarantees its rule-version range and null semantics; nothing in C8 branches on them.
    const src = readFileSync(join(__dirname, "recommendation-exact.ts"), "utf8") + readFileSync(join(__dirname, "evaluation-context.ts"), "utf8");
    expect(src).not.toMatch(/version\s*(>=|>|<)\s*[01]\b|rule\s*===\s*null\s*&&\s*source|C3_RULE_MUST_BE_NULL/);
  });
});

describe("C8 bounded repair — F003: the evidence pack is the single source of decision evidence", () => {
  const SELL_RUN = (): Run => favourable({ actions: registry([SELL()]) });

  it("F003 exact reproduction: the effect model's statement, assumptions and limitations are pack evidence, and the explanation shows only what the pack holds", () => {
    const rec = recOf(run(SELL_RUN()));
    expect(rec.record.explanation).toContain("SYNTH asserted effect");
    const model = rec.pack.calculationSteps.find((s) => s.description === `Effect model ${JSON.stringify(["SYNTH-MODEL-EFFECT", "v1"])} of the proposed action`)!;
    expect(model).toBeDefined();
    expect(JSON.parse(model.inputs.expectedEffect as string)).toBe("SYNTH asserted effect");
    expect(JSON.parse(model.inputs.limitations as string)).toContain("synthetic limitation");
    expect(model.rule).toEqual({ ruleId: "SYNTH-RULE-EFFECT", version: 1 });
    const tagged = `CATTLE_RECOMMENDATION_MODEL_LIMITATION:${JSON.stringify(["SYNTH-MODEL-EFFECT", "v1"])}:synthetic limitation`;
    expect(rec.pack.limitations).toContain(tagged);
    expect(rec.record.limitations).toContain(tagged);
    expect(rec.pack.assumptions.some((a) => a.startsWith(`CATTLE_RECOMMENDATION_MODEL_ASSUMPTION:${JSON.stringify(["SYNTH-MODEL-EFFECT", "v1"])}:`))).toBe(true);
  });

  it("construction: the record and the explanation are exactly what the pack derives, in every scenario (no parallel data path)", () => {
    const scenarios: Run[] = [
      SELL_RUN(),
      favourable({ actions: registry([SELL(["C3_WITHDRAWAL"]), action("SYNTH-OTHER")]), health: health(IN_WITHDRAWAL_RECORDS) }),
      favourable({ actions: registry([SELL(["C2_OBLIGATION"])]), obligations: obligations() }),
      { weights: { observations: [] }, actions: defaultOnly("RECORD_WEIGHT") },
      { actions: registry([]) },
      {},
    ];
    for (const s of scenarios) {
      const rec = recOf(run(s));
      expect(cattle.deriveRecommendationRecord(rec.pack)).toEqual(rec.record);
      expect(cattle.renderRecommendationExplanation(rec.pack)).toBe(rec.record.explanation);
    }
    // The renderer and the record derivation take the pack and nothing else.
    expect(cattle.renderRecommendationExplanation.length).toBe(1);
    expect(cattle.deriveRecommendationRecord.length).toBe(1);
  });

  it("explanation-visible model content cannot exist without the corresponding pack content", () => {
    const rec = recOf(run(SELL_RUN()));
    const steps = rec.pack.calculationSteps;
    const candidateIdx = steps.findIndex((s) => s.description === "Candidate proposed action");
    expect(candidateIdx).toBeGreaterThanOrEqual(0);
    // Without the candidate step the decision cannot be read at all — nothing is rendered from elsewhere.
    const stripped = { ...rec.pack, calculationSteps: steps.filter((_, i) => i !== candidateIdx) };
    expect(cattle.renderRecommendationExplanation(stripped)).toBeNull();
    expect(cattle.deriveRecommendationRecord(stripped)).toBeNull();
    // The statement shown is the one IN the pack: change it there and the explanation follows.
    const effect = JSON.parse(steps[candidateIdx].inputs.effect as string);
    const edited = { ...rec.pack, calculationSteps: steps.map((s, i) => (i === candidateIdx ? { ...s, inputs: { ...s.inputs, effect: JSON.stringify({ ...effect, expectedEffect: "SYNTH statement only in this pack" }) } } : s)) };
    expect(cattle.renderRecommendationExplanation(edited)).toContain("SYNTH statement only in this pack");
    expect(cattle.renderRecommendationExplanation(edited)).not.toContain("SYNTH asserted effect");
    // An approval label needs the model's rule evaluation reachable through the pack's own model step.
    const noModelStep = { ...rec.pack, calculationSteps: steps.filter((s) => !s.description.startsWith("Effect model")) };
    expect(cattle.deriveRecommendationRecord(noModelStep)?.evidence.effectBasis).toBe("NONE");
    expect(rec.record.evidence.effectBasis).toBe("SCIENTIFICALLY_APPROVED_EFFECT_MODEL");
  });

  it("a stored record that says more (or other) than its pack fails verification", () => {
    const rec = recOf(run(SELL_RUN()));
    const tampered = structuredClone(rec) as unknown as { record: { explanation: string; evidence: { effectBasis: string } } };
    tampered.record.explanation += " SYNTH claim not in the pack.";
    expect(verifyCattleRecommendation(tampered as unknown as CattleRecommendation, hash, TRUSTED).valid).toBe(false);
  });
});

describe("C8 bounded repair — F006: monetary precision never exceeds the canonical money arithmetic", () => {
  const valueModel = (kind: string) => econModel([`SYNTH-KEY-${kind}`], [], modelRule(`SYNTH-RULE-${kind}`), { modelId: `SYNTH-MODEL-${kind}` });
  const valued = (kind: string) => action(kind, { economicModelRef: { modelId: `SYNTH-MODEL-${kind}`, version: "v1" } });
  const runWith = (entries: [string, string][]) =>
    run({ actions: registry(entries.map(([k]) => valued(k))), models: allModels(entries.map(([k]) => valueModel(k))), observations: entries.map(([k, amount]) => econObs(`o-${k}`, `SYNTH-KEY-${k}`, amount)) });

  it("the precision is the canonical money layer's own (decimal.js configuration used by money.ts), not a C8 constant", () => {
    expect(cattleEconomic.MONEY_ARITHMETIC_PRECISION).toBe(20);
    expect(cattleEconomic.amountWithinMoneyPrecision("1000.0000000000000001")).toBe(true); // 4 + 16 = 20 digits
    expect(cattleEconomic.amountWithinMoneyPrecision("1000.00000000000000001")).toBe(false); // 21 digits
    expect(cattleEconomic.amountWithinMoneyPrecision("0.12345678901234567890")).toBe(true); // 20 fraction digits
    expect(cattleEconomic.amountWithinMoneyPrecision("0.123456789012345678901")).toBe(false);
  });

  it("maximum accepted precision: a 20-digit amount is valued exactly", () => {
    const rec = recOf(runWith([["SYNTH-A", "1000.0000000000000001"]]));
    expect(rec.candidates[0].value).toMatchObject({ state: "VALUE_KNOWN", amount: "1000.0000000000000001", currency: "EUR" });
  });

  it("one digit beyond: the observation is rejected with an explicit deterministic error (fail closed, never rounded)", () => {
    const r = runWith([["SYNTH-A", "1000.00000000000000001"]]);
    expect(r.ok).toBe(false);
    expect(r.ok ? [] : r.issues).toContainEqual({ code: "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_PRECISION_UNSUPPORTED", ref: "o-SYNTH-A" });
  });

  it("F006 exact reproduction: the audit's two over-precise values never collapse into one value — the request fails closed", () => {
    const r = runWith([
      ["SYNTH-A", "1000.00000000000000001"],
      ["SYNTH-B", "1000.00000000000000002"],
    ]);
    expect(r.ok).toBe(false);
    expect(codes(r).filter((c) => c === "CATTLE_RECOMMENDATION_ECONOMIC_OBSERVATION_PRECISION_UNSUPPORTED")).toHaveLength(2);
  });

  it("two distinct maximum-precision values stay distinct: the higher wins on value, never on the identity tie-break", () => {
    // Identity order would favour SYNTH-A; its value is LOWER by one unit in the last supported digit.
    const rec = recOf(runWith([
      ["SYNTH-A", "1000.0000000000000001"],
      ["SYNTH-B", "1000.0000000000000002"],
    ]));
    expect(rec.record.recommendedAction?.actionKind).toBe("SYNTH-B");
    expect(rec.ties).toEqual([]);
    expect(rec.candidates.map((c) => c.value.amount)).toEqual(["1000.0000000000000002", "1000.0000000000000001"]);
  });

  it("a sum whose exact result could exceed the arithmetic's precision is VALUE_UNKNOWN, never a rounded amount", () => {
    const model = econModel(["SYNTH-KEY-X", "SYNTH-KEY-Y"], [], modelRule("SYNTH-RULE-SUM"), { modelId: "SYNTH-MODEL-SUM" });
    const rec = recOf(
      run({
        actions: registry([action("SYNTH-SUM", { economicModelRef: { modelId: "SYNTH-MODEL-SUM", version: "v1" } })]),
        models: allModels([model]),
        observations: [econObs("o-x", "SYNTH-KEY-X", "9999.9999999999999999"), econObs("o-y", "SYNTH-KEY-Y", "0.0000000000000001")],
      }),
    );
    expect(rec.candidates[0].value).toMatchObject({ state: "VALUE_UNKNOWN", amount: null });
    expect(rec.candidates[0].value.reasonCodes[0]).toMatch(/^CATTLE_RECOMMENDATION_VALUE_PRECISION_UNSUPPORTED:21>20$/);
  });
});

describe("C8 audit 2026-10-15T210448Z — F005: re-sealed stored recommendations; F007: required evidence before exclusion", () => {
  /** Re-seals a stored recommendation after an edit: recomputes the OUTER record fingerprint (the audit's attack). */
  const reseal = (r: Record<string, unknown>): CattleRecommendation => {
    const { fingerprint: _f, ...body } = r;
    void _f;
    return { ...(body as object), fingerprint: computeRecommendationFingerprint("CATTLE_RECOMMENDATION_RECORD", body, hash) } as unknown as CattleRecommendation;
  };
  const stored = () => structuredClone(recOf(run(favourable({ actions: registry([SELL(["C3_WITHDRAWAL"]), action("SYNTH-OTHER"), action("SYNTH-OFF", { trigger: { kind: "GOAL_STATUS", statuses: ["NONE"] } })]), health: health(IN_WITHDRAWAL_RECORDS), goals: goals([goalDecl("g-fin")]) })))) as unknown as Record<string, unknown>;

  it("F005 exact reproduction: animal id, invalid time, wrong-typed candidates and an unknown payload version are rejected even when re-sealed", () => {
    const base = stored();
    expect(verifyCattleRecommendation(reseal(base), hash, TRUSTED).valid).toBe(true); // re-sealing an unedited record is a no-op
    const edits: [string, (r: Record<string, unknown>) => void][] = [
      ["animalId → another animal", (r) => void (r.animalId = B)],
      ["effectiveAt → INVALID", (r) => void (r.effectiveAt = "INVALID")],
      ["candidates → string", (r) => void (r.candidates = "SYNTH")],
      ["payload version → 999", (r) => void (r.recommendationPayloadVersion = 999)],
    ];
    for (const [label, edit] of edits) {
      const r = stored();
      edit(r);
      expect(verifyCattleRecommendation(reseal(r), hash, TRUSTED).valid, label).toBe(false);
    }
  });

  it("class: every structural mutation and every identity / time / decision inconsistency of a stored recommendation is rejected after re-sealing", () => {
    const base = stored();
    const isMap = (path: string[]) => path.length === 4 && path[0] === "pack" && path[1] === "calculationSteps" && path[3] === "inputs";
    const matrix = realMutations(base, isMap).filter((m) => !m.label.startsWith("fingerprint"));
    expect(matrix.length).toBeGreaterThan(500);
    for (const m of matrix) {
      const r = stored();
      m.mutate(r);
      expect(verifyCattleRecommendation(reseal(r), hash, TRUSTED).valid, m.label).toBe(false);
    }
    // Well-typed but inconsistent edits (re-sealed): times, ranks, decision fields, exclusions, ties.
    const semantic: [string, (r: Record<string, unknown>) => void][] = [
      ["knowledgeCutoff → another valid instant", (r) => void (r.knowledgeCutoff = LATER)],
      ["candidate rank swapped", (r) => void ((r.candidates as { rank: number }[])[0].rank = 2)],
      ["candidate effect state edited", (r) => void ((r.candidates as { effect: { state: string } }[])[0].effect.state = "EFFECT_SUPPORTED")],
      ["candidate selectable flipped", (r) => void ((r.candidates as { selectable: boolean }[])[1].selectable = !(r.candidates as { selectable: boolean }[])[1].selectable)],
      ["non-candidate reasons edited", (r) => void ((r.notCandidates as { reasonCodes: string[] }[])[0].reasonCodes = ["SYNTH"])],
      ["non-candidate removed", (r) => void (r.notCandidates = [])],
      ["tie invented", (r) => void (r.ties = [{ actionIds: ["a", "b"], brokenBy: "ACTION_IDENTITY" }])],
      ["gate check satisfied flipped", (r) => void ((r.candidates as { gates: { checks: { satisfied: boolean }[] } }[]).find((c) => c.gates.checks.length > 0)!.gates.checks[0].satisfied = true)],
    ];
    for (const [label, edit] of semantic) {
      const r = stored();
      edit(r);
      expect(verifyCattleRecommendation(reseal(r), hash, TRUSTED).valid, label).toBe(false);
    }
  }, 60_000);

  it("audit 2026-10-15T224053Z F005 exact reproduction: deleting a stored candidate's gate checks is rejected after re-sealing", () => {
    const r = stored();
    const gated = (r.candidates as { gates: { checks: { state: string }[] } }[]).find((c) => c.gates.checks.some((g) => g.state === "FAIL"))!;
    expect(gated).toBeDefined();
    gated.gates.checks = [];
    expect(verifyCattleRecommendation(reseal(r), hash, TRUSTED)).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_STORED_CANDIDATES_INCONSISTENT" });
  });

  it("class: stored gate-check and exclusion collections must equal the pack's bidirectionally (deletion, duplication, substitution)", () => {
    type Check = { ruleId: string; state: string };
    type Cand = { gates: { checks: Check[] } };
    const withChecks = (r: Record<string, unknown>) => (r.candidates as Cand[]).filter((c) => c.gates.checks.length > 0);
    expect(withChecks(stored()).length).toBeGreaterThan(0);
    expect((stored().notCandidates as unknown[]).length).toBeGreaterThan(0);
    const edits: [string, (r: Record<string, unknown>) => void][] = [];
    for (const [ci, c] of withChecks(stored()).entries()) {
      const at = (r: Record<string, unknown>) => withChecks(r)[ci].gates.checks;
      edits.push([`candidate ${ci}: delete last check`, (r) => void at(r).pop()]);
      edits.push([`candidate ${ci}: delete first check`, (r) => void at(r).shift()]);
      edits.push([`candidate ${ci}: duplicate first check`, (r) => void at(r).push(structuredClone(at(r)[0]))]);
      if (c.gates.checks.length > 1) edits.push([`candidate ${ci}: replace last check with a duplicate of the first`, (r) => void (at(r)[at(r).length - 1] = structuredClone(at(r)[0]))]);
    }
    edits.push(["duplicate a non-candidate", (r) => void (r.notCandidates as unknown[]).push(structuredClone((r.notCandidates as unknown[])[0]))]);
    for (const [label, edit] of edits) {
      const r = stored();
      edit(r);
      expect(verifyCattleRecommendation(reseal(r), hash, TRUSTED).valid, label).toBe(false);
    }
  });

  it("F007 exact reproduction: a negative trigger never masks a required evidence part that is not supplied", () => {
    // Known weight ⇒ RECORD_WEIGHT's trigger resolves negative; the definition also requires PERFORMANCE, which is absent.
    const rec = recOf(run({ weights: { observations: [weightObs("w-1", "2026-04-10T00:00:00Z")] }, actions: defaultOnly("RECORD_WEIGHT", { evidenceRequirements: ["PERFORMANCE"] }) }));
    expect(rec.record.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(rec.notCandidates).toEqual([]);
    expect(rec.candidates[0]).toMatchObject({ trigger: { state: "NOT_MET" }, selectable: false, gates: { state: "NOT_CLEAR" } });
    expect(rec.candidates[0].gates.checks.map((c) => c.ruleId)).toContain("CATTLE_RECOMMENDATION_REQUIRES:PERFORMANCE");
  });

  it("F007 exact reproduction: unresolved eligibility (GOALS absent) is not masked by a negative trigger", () => {
    const sale = action("SYNTH-SALE", { applicableGoalTypes: ["FINISHING"], trigger: { kind: "WEIGHT_MISSING_OR_STALE", staleAfter: null } });
    const rec = recOf(run({ weights: { observations: [weightObs("w-1", "2026-04-10T00:00:00Z")] }, actions: registry([sale]) }));
    expect(rec.record.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(rec.candidates[0]).toMatchObject({ trigger: { state: "NOT_MET" }, eligibility: { state: "UNRESOLVED" }, selectable: false });
  });

  it("F007 class: negative trigger / eligibility × every kind of unresolved requirement is never NO_RECOMMENDATION; with nothing unresolved it is excluded", () => {
    const known = { weights: { observations: [weightObs("w-1", "2026-04-10T00:00:00Z")] } };
    const notMet = { kind: "WEIGHT_MISSING_OR_STALE", staleAfter: null };
    const cases: [string, Rec, Run][] = [
      ["trigger NO × evidence requirement missing", { trigger: notMet, evidenceRequirements: ["HEALTH"] }, known],
      ["trigger NO × prerequisite gate source missing", { trigger: notMet, prerequisites: { sources: ["C2_OBLIGATION"], gateRuleIds: [] } }, known],
      ["trigger NO × eligibility unresolved (goals absent)", { trigger: notMet, applicableGoalTypes: ["FINISHING"] }, known],
      ["eligibility NO × evidence requirement missing", { applicableGoalTypes: ["SALE"], evidenceRequirements: ["HEALTH"] }, { goals: goals([goalDecl("g-fin")]) }],
      ["eligibility NO × trigger unresolved (weights absent)", { applicableGoalTypes: ["SALE"], trigger: notMet }, { goals: goals([goalDecl("g-fin")]) }],
    ];
    for (const [label, patch, o] of cases) {
      const rec = recOf(run({ ...o, actions: registry([action("SYNTH-X", patch)]) }));
      expect(rec.record.outcome, label).toBe("INSUFFICIENT_EVIDENCE");
      expect(rec.notCandidates, label).toEqual([]);
      expect(rec.candidates[0].selectable, label).toBe(false);
    }
    // Positive control: resolved negative with every requirement supplied ⇒ excluded, NO_RECOMMENDATION.
    const off = recOf(run({ ...known, actions: registry([action("SYNTH-X", { trigger: notMet })]) }));
    expect(off.record.outcome).toBe("NO_RECOMMENDATION");
    expect(off.notCandidates.map((n) => n.actionKind)).toEqual(["SYNTH-X"]);
  });
});

describe("C8 audit 2026-10-15T233648Z — F005 family closed by replay: a stored recommendation must equal the engine's output over its own validated context", () => {
  type Cand = { actionId: string; value: { state: string; amount: string | null } };
  type Step = { formula: string; description: string; inputs: Record<string, unknown> };
  const stored = () => structuredClone(recOf(run(favourable({ actions: registry([SELL()]) })))) as unknown as Record<string, unknown>;
  /** The full attack: edit, rewrite the pack's own candidate step, re-fingerprint the C0 pack, re-derive the record, re-seal the outer record. */
  const forge = (r: Record<string, unknown>): CattleRecommendation => {
    const { fingerprint: _p, generatedAt: _g, ...content } = r.pack as RecommendationEvidencePack;
    void _p;
    void _g;
    const pack = { ...(r.pack as RecommendationEvidencePack), fingerprint: computeCattleFingerprint("CATTLE_EVIDENCE_PACK", content, hash) };
    const record = cattle.deriveRecommendationRecord(pack);
    expect(record).not.toBeNull();
    const { fingerprint: _f, ...body } = { ...r, pack, record } as Record<string, unknown>;
    void _f;
    return { ...body, fingerprint: computeRecommendationFingerprint("CATTLE_RECOMMENDATION_RECORD", body, hash) } as unknown as CattleRecommendation;
  };
  const setAmount = (r: Record<string, unknown>, amount: string) => {
    const c = (r.candidates as Cand[])[0];
    c.value.amount = amount;
    const step = (r.pack as { calculationSteps: Step[] }).calculationSteps.find((s) => s.formula === CANDIDATE_STEP_FORMULA && s.inputs.actionId === c.actionId)!;
    step.inputs.value = JSON.stringify(c.value);
  };

  it("exact reproduction: a known amount forged to NaN (pack step rebuilt, pack and record re-fingerprinted) is rejected by replay", () => {
    expect(verifyCattleRecommendation(forge(stored()), hash, TRUSTED).valid).toBe(true); // forging an unedited record is a no-op
    const r = stored();
    expect((r.candidates as Cand[])[0].value).toMatchObject({ state: "VALUE_KNOWN", amount: "749.50" });
    setAmount(r, "NaN");
    expect(verifyCattleRecommendation(forge(r), hash, TRUSTED)).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_REPLAY_MISMATCH" });
  });

  it("class: any forged decision amount — malformed or well-formed — is rejected by replay", () => {
    for (const amount of ["NaN", "Infinity", "", "1e3", "abc", "749.5", "750.50", "-749.50", "0"]) {
      const r = stored();
      setAmount(r, amount);
      expect(verifyCattleRecommendation(forge(r), hash, TRUSTED), amount).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_REPLAY_MISMATCH" });
    }
  });

  it("exact reproduction: invalid context vocabularies and timestamps are rejected even when the context is re-fingerprinted", () => {
    const withWeights = () => structuredClone(recOf(run(favourable({ actions: registry([SELL()]), weights: { observations: [weightObs("w-1", "2026-04-10T00:00:00Z")] } })))) as unknown as Record<string, unknown>;
    const resealContext = (r: Record<string, unknown>) => {
      const { fingerprint: _c, ...ctx } = r.context as Record<string, unknown>;
      void _c;
      r.context = { ...ctx, fingerprint: computeRecommendationFingerprint("CATTLE_RECOMMENDATION_CONTEXT", ctx, hash) };
    };
    const edits: [string, (ctx: { weights: { latest: { state: string; observedAt: string | null } } }) => void][] = [
      ["weight state outside the C4 vocabulary", (c) => void (c.weights.latest.state = "SYNTH_STATE")],
      ["weight observedAt not an instant", (c) => void (c.weights.latest.observedAt = "not-a-time")],
    ];
    for (const [label, edit] of edits) {
      const r = withWeights();
      edit(r.context as never);
      resealContext(r);
      expect(verifyCattleRecommendation(forge(r), hash, TRUSTED), label).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_STORED_STRUCTURE_MALFORMED" });
    }
  });
});

describe("C8 audit 2026-10-16T064728Z — the stored context's C8-owned parts are validated before replay", () => {
  type Obs = { amount: string; observedAt: string; receivedAt: string; valueKey: string };
  type Econ = { valueKey: string; state: string; observation: Obs | null };
  type Model = { role: string; expectedEffect: string | null };
  type Ctx = { economics: Econ[]; models: { records: Model[]; reviews: unknown[] }; modelEvaluations: { evaluation: { state: string; model: Model; ruleEvaluation: { reviews: { state: string }[]; sourceChecks: { status: string }[] } } }[]; actions: { definitions: { tier: string; actionKind: string }[] } };
  const stored = () => structuredClone(recOf(run(favourable({ actions: registry([SELL()]) })))) as unknown as Record<string, unknown>;
  /** Re-fingerprints the edited context, then the outer record (the audit's attack on the context). */
  const resealContext = (r: Record<string, unknown>): CattleRecommendation => {
    const { fingerprint: _c, ...ctx } = r.context as Record<string, unknown>;
    void _c;
    const out = { ...r, context: { ...ctx, fingerprint: computeRecommendationFingerprint("CATTLE_RECOMMENDATION_CONTEXT", ctx, hash) } } as Record<string, unknown>;
    const { fingerprint: _f, ...body } = out;
    void _f;
    return { ...body, fingerprint: computeRecommendationFingerprint("CATTLE_RECOMMENDATION_RECORD", body, hash) } as unknown as CattleRecommendation;
  };
  const cost = (c: Ctx) => c.economics.find((e) => e.valueKey === "SYNTH-KEY-COST")!.observation!;
  const effect = (c: Ctx) => [c.models.records.find((m) => m.role === "EFFECT")!, c.modelEvaluations.find((e) => e.evaluation.state === "EVALUATED" && e.evaluation.model.role === "EFFECT")!.evaluation.model];

  it("exact reproductions: a negative stored cost observation and an effect statement changed without its content binding are rejected", () => {
    expect(verifyCattleRecommendation(resealContext(stored()), hash, TRUSTED).valid).toBe(true); // re-sealing an unedited context is a no-op
    const neg = stored();
    cost(neg.context as Ctx).amount = "-250.5";
    expect(verifyCattleRecommendation(resealContext(neg), hash, TRUSTED)).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_STORED_ECONOMICS_INVALID" });
    const eff = stored();
    for (const m of effect(eff.context as Ctx)) m.expectedEffect = "SYNTH a different effect";
    expect(verifyCattleRecommendation(resealContext(eff), hash, TRUSTED)).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_STORED_MODEL_EVALUATION_INVALID" });
  });

  it("class: C8-owned context semantics — observations, model approval / source evidence, registry and value keys — are re-admitted, never trusted", () => {
    const edits: [string, (c: Ctx) => void][] = [
      ["observation amount over the money precision", (c) => void (cost(c).amount = "1".repeat(25))],
      ["observation amount malformed", (c) => void (cost(c).amount = "NaN")],
      ["observation observed after effectiveAt", (c) => void (cost(c).observedAt = LATER)],
      ["observation received after the knowledge cutoff", (c) => void (cost(c).receivedAt = LATER)],
      ["observation bound to another value key", (c) => void (cost(c).valueKey = "SYNTH-KEY-PRICE")],
      ["KNOWN resolution without its observation", (c) => void (c.economics[0].observation = null)],
      ["economic value key dropped", (c) => void c.economics.pop()],
      ["model reviews removed (approval no longer evidenced)", (c) => void (c.models.reviews = [])],
      ["carried review forged to REJECTED", (c) => void (c.modelEvaluations[0].evaluation.ruleEvaluation.reviews[0].state = "REJECTED")],
      ["carried source check forged", (c) => void (c.modelEvaluations[0].evaluation.ruleEvaluation.sourceChecks[0].status = "SUPERSEDED")],
      ["model evaluation removed", (c) => void c.modelEvaluations.pop()],
      ["registry definition duplicated", (c) => void c.actions.definitions.push(structuredClone(c.actions.definitions[0]))],
    ];
    for (const [label, edit] of edits) {
      const r = stored();
      edit(r.context as Ctx);
      // Rejected by context validation itself — never left to replay, which would reproduce an invalid context faithfully.
      const v = verifyCattleRecommendation(resealContext(r), hash, TRUSTED);
      expect(v.valid, label).toBe(false);
      expect(v.valid ? null : v.reasonCode, label).toMatch(/^CATTLE_RECOMMENDATION_STORED_(STRUCTURE_MALFORMED|REGISTRY_INVALID|MODELS_INVALID|MODEL_EVALUATION_INVALID|ECONOMICS_INVALID)$/);
    }
  });
});

describe("C8 audit 2026-10-16T074615Z — F005: stored model evaluations are re-run through the authoritative C0 path; F008: conflict cardinality", () => {
  type RuleEval = { state: string; reasonCodes: string[] };
  type Ctx = { modelEvaluations: { modelId: string; evaluation: { state: string; ruleEvaluation: RuleEval } }[]; economics: { valueKey: string; state: string; observation: unknown; candidateObservationIds: string[] }[] };
  const resealContext = (r: Record<string, unknown>): CattleRecommendation => {
    const { fingerprint: _c, ...ctx } = r.context as Record<string, unknown>;
    void _c;
    const out = { ...r, context: { ...ctx, fingerprint: computeRecommendationFingerprint("CATTLE_RECOMMENDATION_CONTEXT", ctx, hash) } } as Record<string, unknown>;
    const { fingerprint: _f, ...body } = out;
    void _f;
    return { ...body, fingerprint: computeRecommendationFingerprint("CATTLE_RECOMMENDATION_RECORD", body, hash) } as unknown as CattleRecommendation;
  };
  const withEffectRule = (rule: CattleRuleVersion) => {
    const models = allModels([effectModel(rule), econModel(["SYNTH-KEY-PRICE"], ["SYNTH-KEY-COST"])]);
    return structuredClone(recOf(run(favourable({ models, actions: registry([SELL()]) })))) as unknown as Record<string, unknown>;
  };
  const effectEval = (r: Record<string, unknown>) => (r.context as Ctx).modelEvaluations.find((e) => e.modelId === "SYNTH-MODEL-EFFECT")!.evaluation;
  const NOT_YET_EFFECTIVE = modelRule("SYNTH-RULE-EFFECT", MODEL_PASS, { effectiveFrom: "2026-05-01" });
  const LOGIC_MISMATCH = modelRule("SYNTH-RULE-EFFECT", MODEL_PASS, { implementation: { ...bindTo(MODEL_PASS), logicFingerprint: bindTo(MODEL_FAIL).logicFingerprint } });
  const PREDICATE_FAIL = modelRule("SYNTH-RULE-EFFECT", MODEL_FAIL);

  it("fails closed: a model-bearing stored recommendation never verifies without the trusted registry; one without models does", () => {
    const rec = recOf(run(favourable({ actions: registry([SELL()]) })));
    expect(rec.context.modelEvaluations.length).toBeGreaterThan(0);
    expect(verifyCattleRecommendation(rec, hash, TRUSTED)).toEqual({ valid: true });
    expect(verifyCattleRecommendation(rec, hash)).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_STORED_MODEL_VERIFICATION_REGISTRY_REQUIRED" });
    expect(verifyCattleRecommendation(rec, hash, {})).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_STORED_MODEL_VERIFICATION_REGISTRY_REQUIRED" });
    // A registry that lacks the model's implementation is authoritative too: the stored EVALUATED record no longer matches.
    const other = { obligationImplementations: createObligationImplementationRegistry([OBL_IMPL]) };
    expect(verifyCattleRecommendation(rec, hash, other)).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_STORED_MODEL_EVALUATION_INVALID" });
    const plain = recOf(run({ weights: { observations: [] } }));
    expect(plain.context.modelEvaluations).toEqual([]);
    expect(verifyCattleRecommendation(plain, hash)).toEqual({ valid: true });
  });

  it("exact reproductions: UNSUPPORTED (rule not yet effective; implementation logic mismatch) forged to PASS and re-sealed is rejected by the authoritative re-run", () => {
    for (const [label, rule] of [["rule not in effect", NOT_YET_EFFECTIVE], ["implementation logic fingerprint mismatch", LOGIC_MISMATCH]] as const) {
      const r = withEffectRule(rule);
      expect(effectEval(r).ruleEvaluation.state, label).toBe("UNSUPPORTED");
      expect(verifyCattleRecommendation(resealContext(r), hash, TRUSTED).valid, label).toBe(true); // untouched: verifies
      effectEval(r).ruleEvaluation.state = "PASS";
      effectEval(r).ruleEvaluation.reasonCodes = [];
      expect(verifyCattleRecommendation(resealContext(r), hash, TRUSTED), label).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_STORED_MODEL_EVALUATION_INVALID" });
    }
  });

  it("class: every forged model-evaluation state, predicate result, availability or supporting field is rejected by the authoritative re-run", () => {
    const edits: [string, CattleRuleVersion, (e: { state: string; ruleEvaluation: RuleEval } & Record<string, unknown>) => void][] = [];
    for (const [name, rule] of [["not effective", NOT_YET_EFFECTIVE], ["logic mismatch", LOGIC_MISMATCH], ["predicate FAIL", PREDICATE_FAIL], ["approved PASS", EFFECT_RULE]] as const) {
      for (const state of ["PASS", "FAIL", "UNSUPPORTED", "REVIEW_REQUIRED", "NOT_APPLICABLE"]) edits.push([`${name}: state → ${state}`, rule, (e) => void (e.ruleEvaluation.state = state)]);
      edits.push([`${name}: reason codes forged`, rule, (e) => void (e.ruleEvaluation.reasonCodes = ["SYNTH"])]);
      edits.push([`${name}: evaluation made UNAVAILABLE`, rule, (e) => {
        for (const k of Object.keys(e)) delete e[k];
        Object.assign(e, { state: "UNAVAILABLE", reasonCodes: ["SYNTH"] });
      }]);
    }
    for (const [label, rule, edit] of edits) {
      const r = withEffectRule(rule);
      const before = JSON.stringify(effectEval(r));
      edit(effectEval(r) as never);
      if (JSON.stringify(effectEval(r)) === before) continue; // not a mutation (the state already had that value)
      expect(verifyCattleRecommendation(resealContext(r), hash, TRUSTED), label).toMatchObject({ valid: false, reasonCode: "CATTLE_RECOMMENDATION_STORED_MODEL_EVALUATION_INVALID" });
    }
  });

  describe("F008 — economic conflict cardinality follows the resolver", () => {
    const cost = (id: string, amount: string, observedAt: string, receivedAt: string, supersedes: string[] = []) => econObs(id, "SYNTH-KEY-COST", amount, { observedAt, receivedAt, supersedes });
    const PRICE = econObs("o-price", "SYNTH-KEY-PRICE", "1000.00");
    const BASE = cost("o-c0", "250.5", "2026-04-01T00:00:00Z", "2026-04-02T00:00:00Z");
    const conflictOf = (observations: unknown[]) => {
      const rec = recOf(run(favourable({ observations, actions: registry([SELL()]) })));
      return { rec, resolution: rec.context.economics.find((e) => e.valueKey === "SYNTH-KEY-COST")! };
    };

    it("exact reproduction: competing corrections spanning effectiveAt yield a one-candidate CONFLICT that verifies after storage", () => {
      const { rec, resolution } = conflictOf([PRICE, BASE, cost("o-c1", "260", "2026-04-05T00:00:00Z", "2026-04-06T00:00:00Z", ["o-c0"]), cost("o-c2", "270", "2026-05-01T00:00:00Z", "2026-05-02T00:00:00Z", ["o-c0"])]);
      expect(resolution).toMatchObject({ state: "CONFLICT", observation: null, candidateObservationIds: ["o-c1"] });
      expect(verifyCattleRecommendation(structuredClone(rec), hash, TRUSTED)).toEqual({ valid: true });
    });

    it("normal multi-candidate CONFLICT verifies; empty, duplicated or observation-bearing CONFLICT structures are rejected", () => {
      const { rec, resolution } = conflictOf([PRICE, BASE, cost("o-c1", "260", "2026-04-05T00:00:00Z", "2026-04-06T00:00:00Z", ["o-c0"]), cost("o-c2", "270", "2026-04-07T00:00:00Z", "2026-04-08T00:00:00Z", ["o-c0"])]);
      expect(resolution).toMatchObject({ state: "CONFLICT", candidateObservationIds: ["o-c1", "o-c2"] });
      expect(verifyCattleRecommendation(structuredClone(rec), hash, TRUSTED)).toEqual({ valid: true });
      const edits: [string, (x: Ctx["economics"][number]) => void][] = [
        ["no candidates", (x) => void (x.candidateObservationIds = [])],
        ["duplicated candidate", (x) => void (x.candidateObservationIds = ["o-c1", "o-c1"])],
        ["unsorted candidates", (x) => void (x.candidateObservationIds = ["o-c2", "o-c1"])],
        ["an observation bound", (x) => void (x.observation = structuredClone(PRICE))],
      ];
      for (const [label, edit] of edits) {
        const r = structuredClone(rec) as unknown as Record<string, unknown>;
        edit((r.context as Ctx).economics.find((e) => e.valueKey === "SYNTH-KEY-COST")!);
        const v = verifyCattleRecommendation(resealContext(r), hash, TRUSTED);
        expect(v.valid, label).toBe(false);
        expect(v.valid ? null : v.reasonCode, label).toMatch(/^CATTLE_RECOMMENDATION_STORED_(STRUCTURE_MALFORMED|ECONOMICS_INVALID)$/);
      }
    });
  });
});

