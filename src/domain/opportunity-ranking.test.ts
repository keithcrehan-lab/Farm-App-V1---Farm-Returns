import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { calculateNutrientPlan } from "./nutrients";
import { tracked, type Field, type LivestockGroup, type NutrientPlan, type SlurryAllocation } from "./types";
import { createMarketPriceObservation, canonicalContentHashInput, type MarketPriceObservation, type CreateMarketPriceObservationInput } from "./market-evidence";
import { resolveMarketReferencePrice, type AuditableMarketPriceResolution } from "./market-price-resolution";
import type { EngineOutcome } from "./evidence";
import { createMoneyAmount, zeroMoney, type MoneyAmount } from "./money";
import type { EconomicEffect } from "./economic-opportunity";
import { buildSlurryDirectEconomicAssessment, type SlurryDirectEconomicAssessmentInput, type SlurryDirectEconomicAssessment, type SlurryScienceSupportOutcome } from "./slurry-direct-economic-assessment";
import { buildSlurryWholeFarmAllocation, type SlurryAllocationCandidateInput, type SlurryWholeFarmAllocationResult } from "./slurry-whole-farm-allocation";
import type { FertiliserPlanCostAssessment } from "./fertiliser-plan-cost";
import {
  createAuditedActionOpportunityRecord,
  buildAuditedWholeFarmDecisionRecord,
  createOpportunityDecisionState,
  AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION,
  type AuditedActionOpportunityRecord,
  type AuditedWholeFarmDecisionRecord,
  type CreateAuditedActionOpportunityRecordInput,
  type BuildAuditedWholeFarmDecisionRecordInput,
  type OpportunityDecisionState,
} from "./audited-opportunity-record";
import { ASSESSMENT_INTEGRITY_SCHEMA_VERSION } from "./assessment-integrity";
import {
  rankOpportunities,
  OPPORTUNITY_RANKING_ENGINE_VERSION,
  RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT,
  type OpportunityRankingPolicy,
  type TrustedOpportunityRecord,
} from "./opportunity-ranking";

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
function createRecord(input: Omit<CreateAuditedActionOpportunityRecordInput, "hash">): AuditedActionOpportunityRecord {
  return createAuditedActionOpportunityRecord({ ...input, hash });
}
function buildDecisionRecord(input: Omit<BuildAuditedWholeFarmDecisionRecordInput, "hash">): AuditedWholeFarmDecisionRecord {
  const outcome = buildAuditedWholeFarmDecisionRecord({ ...input, hash });
  if (outcome.status !== "OK") throw new Error(`expected OK decision record, got ${JSON.stringify(outcome)}`);
  return outcome.value;
}

// ---------------------------------------------------------------------------
// PART A — real end-to-end fixtures (brief §44/§45: real Phase 5/6 output
// required for at least one positive/blocked/zero/whole-farm integration
// case — the exact same pattern every earlier phase's own test file uses).
// ---------------------------------------------------------------------------

const livestockGroups: LivestockGroup[] = [
  { id: "g1", farmId: "farm-test", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
];
const farmGrasslandAreaHa = 27;
const asOfDate = "2026-09-25";

function makeField(id: string, areaHa: number, pIndex: 1 | 2 | 3 | 4, kIndex: 1 | 2 | 3 | 4): Field {
  return {
    id,
    farmId: "farm-test",
    name: id,
    areaHa,
    centroid: [0, 0],
    plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
    fertility: { pIndex: tracked(pIndex, "farmer_adjusted", "Keith"), kIndex: tracked(kIndex, "farmer_adjusted", "Keith") },
    history: [],
  };
}
const goldenField = makeField("field-golden", 10, 2, 2);
const fieldB = makeField("field-B", 8, 2, 2);

function slurryOn(field: Field, volumeM3: number): SlurryAllocation {
  return { fieldId: field.id, housingId: "h1", priority: "high", volumeM3, score: 90, applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith"), applicationDate: tracked("2026-02-15", "farmer_adjusted", "Keith") };
}
const unsupportedMethodOn = (field: Field, volumeM3: number): SlurryAllocation => ({ fieldId: field.id, housingId: "h1", priority: "high", volumeM3, score: 90, applicationMethod: tracked("incorporate_24h", "farmer_adjusted", "Keith"), applicationDate: tracked("2026-02-15", "farmer_adjusted", "Keith") });

function planWithout(field: Field): NutrientPlan {
  return calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation: undefined, asOfDate });
}
function planWith(field: Field, allocation: SlurryAllocation): NutrientPlan {
  return calculateNutrientPlan({ field, farmGrasslandAreaHa, livestockGroups, slurryAllocation: allocation, asOfDate });
}
function observation(overrides: Partial<CreateMarketPriceObservationInput>): MarketPriceObservation {
  const fields = {
    datasetId: "AJM09", sourceSeriesCode: "012", sourceSeriesLabel: "Compound 18-6-12", mappedProduct: "18-6-12", mappingKind: "EXACT_PRODUCT_MATCH" as const,
    priceAmount: "645", referencePeriod: "2026-07", priceBasis: "per_tonne" as const, vatTreatment: "unknown" as const, deliveryBasis: "unknown" as const,
    sourceId: "CSO_AG_PRICES" as const, geography: "Ireland", sourceUpdatedAt: "2026-09-15T11:00:00.000Z", retrievedAt: "2026-09-20T12:00:00.000Z",
    ingestionBatchId: "11111111-1111-1111-1111-111111111111", sourceUrl: "https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/AJM09/CSV/1.0/en", ...overrides,
  };
  return createMarketPriceObservation({ ...fields, contentHash: hash(canonicalContentHashInput(fields)) });
}
function resolved(candidates: MarketPriceObservation[], mappedProduct: string, decisionDate = asOfDate): EngineOutcome<AuditableMarketPriceResolution> {
  return resolveMarketReferencePrice({ candidates, mappedProduct, asOfDate: decisionDate });
}
function allProductPrices(decisionDate = asOfDate): Record<string, EngineOutcome<AuditableMarketPriceResolution>> {
  const zeroSevenThirty = observation({ sourceSeriesCode: "008", priceAmount: "412", mappingKind: "EXACT_PRODUCT_MATCH", mappedProduct: "0-7-30", sourceSeriesLabel: "Compound 0-7-30" });
  const eighteenSixTwelve = observation({ sourceSeriesCode: "012", priceAmount: "645", mappingKind: "EXACT_PRODUCT_MATCH", mappedProduct: "18-6-12", sourceSeriesLabel: "Compound 18-6-12" });
  const protectedUrea = observation({ sourceSeriesCode: "002", priceAmount: "550", mappingKind: "CATEGORY_BENCHMARK", mappedProduct: "Protected Urea", sourceSeriesLabel: "Urea (46% N)" });
  return { "0-7-30": resolved([zeroSevenThirty], "0-7-30", decisionDate), "18-6-12": resolved([eighteenSixTwelve], "18-6-12", decisionDate), "Protected Urea": resolved([protectedUrea], "Protected Urea", decisionDate) };
}
const pricesOk = allProductPrices()["18-6-12"];
const knownAt = pricesOk.status === "OK" ? pricesOk.value.trace.knownAt : "";

function realAssessment(overrides: Partial<SlurryDirectEconomicAssessmentInput> & Pick<SlurryDirectEconomicAssessmentInput, "id" | "evaluatedActionId" | "fieldId" | "baselinePlan" | "interventionPlan">): SlurryDirectEconomicAssessment {
  return buildSlurryDirectEconomicAssessment({ asOfDate, knownAt, resolvedPricesByProduct: allProductPrices(), realisationCost: { status: "known_zero" }, createdAt: "2026-09-25T00:00:00.000Z", ...overrides });
}
function positiveAssessment(): SlurryDirectEconomicAssessment {
  return realAssessment({ id: "assessment-positive", evaluatedActionId: "allocation-real-db-id-1", fieldId: goldenField.id, baselinePlan: planWithout(goldenField), interventionPlan: planWith(goldenField, slurryOn(goldenField, 20 * goldenField.areaHa)) });
}
function blockedAssessment(): SlurryDirectEconomicAssessment {
  return realAssessment({ id: "assessment-blocked", evaluatedActionId: "allocation-real-db-id-2", fieldId: goldenField.id, baselinePlan: planWithout(goldenField), interventionPlan: planWith(goldenField, unsupportedMethodOn(goldenField, 20 * goldenField.areaHa)) });
}
function realCandidate(field: Field, volumeM3: number, evaluatedActionId: string): SlurryAllocationCandidateInput {
  const a = realAssessment({ id: `assessment-${evaluatedActionId}`, evaluatedActionId, fieldId: field.id, baselinePlan: planWithout(field), interventionPlan: planWith(field, slurryOn(field, volumeM3)) });
  return { evaluatedActionId, fieldId: field.id, volumeM3, assessment: a };
}
function realWholeFarmResult(): { result: SlurryWholeFarmAllocationResult; childRecords: AuditedActionOpportunityRecord[] } {
  const candidateA = realCandidate(goldenField, 20 * goldenField.areaHa, "allocation-farm-A");
  const candidateB = realCandidate(fieldB, 20 * fieldB.areaHa, "allocation-farm-B");
  const outcome = buildSlurryWholeFarmAllocation({ id: "allocation-result-1", asOfDate, knownAt, availableVolume: { status: "known", volumeM3: 1000 }, candidates: [candidateA, candidateB], createdAt: "2026-09-25T00:00:00.000Z" });
  if (outcome.status !== "OK") throw new Error(`expected OK whole-farm result, got ${JSON.stringify(outcome)}`);
  const childRecords = outcome.value.selected.map((s) => createRecord({ id: `record-${s.evaluatedActionId}`, assessment: s.assessment, recordCreatedAt: "2026-09-25T01:00:00.000Z" }));
  return { result: outcome.value, childRecords };
}

// ---------------------------------------------------------------------------
// PART B — fixture helper for controlled exact-value pure ranking-logic
// tests (same "Part B" pattern slurry-whole-farm-allocation.test.ts already
// uses) — every fixture is still built via the REAL
// createAuditedActionOpportunityRecord/buildAuditedWholeFarmDecisionRecord
// constructors, never a hand-rolled record object, so Phase 7/7.1's own
// construction-time invariants (fingerprinting, deep-clone, derivation)
// genuinely run.
// ---------------------------------------------------------------------------

function stubScienceSupportOk(): SlurryScienceSupportOutcome {
  return { status: "OK", evidenceState: "IRISH_MODEL", value: { n: 10, p: 0, k: 0, unit: "kg/ha", applicationMethod: "splashplate", assumedDefault: false, applicationRateM3ha: 20, dmPct: 6, applicationDate: "2026-02-15" } as unknown as SlurryScienceSupportOutcome extends EngineOutcome<infer V> ? V : never };
}
function stubPlanCost(id: string): FertiliserPlanCostAssessment {
  return { id, engineVersion: "stub", asOfDate, knownAt, lines: [], aggregateOutcome: { status: "OK", value: zeroMoney("EUR"), evidenceState: "IRISH_MODEL" }, limitations: [], createdAt: "2026-01-01T00:00:00.000Z" };
}
function fixtureAssessment(params: { evaluatedActionId: string; fieldId: string; direction: "benefit" | "cost" | "zero"; magnitude: string; volumeM3?: number }): SlurryDirectEconomicAssessment {
  const amount: MoneyAmount = createMoneyAmount(params.magnitude, "EUR");
  const zero = zeroMoney("EUR");
  const value = params.direction === "zero" ? zero : amount;
  const effect: EconomicEffect = {
    id: `${params.evaluatedActionId}:effect`, type: params.direction === "cost" ? "ADDITIONAL_INPUT_COST" : "AVOIDED_FERTILISER_PLAN_COST", direction: params.direction === "cost" ? "cost" : "benefit", impactKind: "ECONOMIC",
    amount: { status: "OK", value, evidenceState: "IRISH_MODEL" }, vatTreatment: "unknown", priceBasis: "per_tonne",
    creditClaim: { creditKey: `slurry-allocation:${JSON.stringify([params.evaluatedActionId, params.fieldId])}:fertiliser-plan-cost-difference`, resourceDescription: `fixture effect for ${params.evaluatedActionId}`, scopeFieldId: params.fieldId },
    scenarioId: "intervention", limitations: [],
  };
  return {
    id: `assessment-${params.evaluatedActionId}`, engineVersion: "fixture_engine_v1.0.0", evaluatedActionId: params.evaluatedActionId, fieldId: params.fieldId, asOfDate, knownAt,
    scenarios: [{ id: "baseline", role: "baseline", label: "Without" }, { id: "intervention", role: "intervention", label: "With" }],
    scienceSupport: stubScienceSupportOk(), counterfactualInvariance: { valid: true }, evaluatedActionVolumeM3: String(params.volumeM3 ?? 0),
    baselineFertiliserPlanCost: stubPlanCost(`${params.evaluatedActionId}:baseline`), interventionFertiliserPlanCost: stubPlanCost(`${params.evaluatedActionId}:intervention`),
    directCostDifference: { status: "OK", value, evidenceState: "IRISH_MODEL" }, directCostDifferenceDirection: params.direction, effect, realisationCost: { status: "known_zero" },
    netEconomicResult: { direction: params.direction, amount: { status: "OK", value, evidenceState: "IRISH_MODEL" } }, limitations: [], createdAt: "2026-01-01T00:00:00.000Z",
  };
}
function fixtureRecord(id: string, evaluatedActionId: string, fieldId: string, direction: "benefit" | "cost" | "zero", magnitude: string, opts: { supersedesRecordId?: string; volumeM3?: number } = {}): AuditedActionOpportunityRecord {
  return createRecord({ id, assessment: fixtureAssessment({ evaluatedActionId, fieldId, direction, magnitude, volumeM3: opts.volumeM3 }), recordCreatedAt: "2026-09-25T01:00:00.000Z", supersedesRecordId: opts.supersedesRecordId });
}
// A reference "accept everything real" policy — every real accepted-version
// list is populated from the actual engine-version constants these fixtures
// really carry, matching the brief's own "explicit, not silently broadened"
// requirement (no wildcard acceptance exists anywhere in the module).
function policy(overrides: Partial<OpportunityRankingPolicy> = {}): OpportunityRankingPolicy {
  return {
    id: "policy-v1", rankingMode: RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT, acceptedIntegritySchemaVersions: [ASSESSMENT_INTEGRITY_SCHEMA_VERSION],
    acceptedSourceEngineVersions: ["fixture_engine_v1.0.0", "slurry_direct_economic_engine_v1.0.0", "slurry_whole_farm_allocation_engine_v1.0.0"],
    acceptedRecordEngineVersions: [AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION], eligibleLifecycleStates: ["active"], freshness: { mode: "not_evaluated" },
    includeAdverseOutcomes: false, includeZeroOutcomes: true, ...overrides,
  };
}
const noDecisionStates = new Map<string, OpportunityDecisionState>();
const evaluatedAt = "2026-09-25T02:00:00.000Z";

// ---------------------------------------------------------------------------
// Scenario A — simple ranking.
// ---------------------------------------------------------------------------
describe("rankOpportunities — real Phase 5 positive-benefit integration (brief §44)", () => {
  it("ranks a real, unmodified Phase 5 positive assessment produced through the actual scientific/costing pipeline", () => {
    const assessment = positiveAssessment();
    expect(assessment.netEconomicResult.amount.status).toBe("OK");
    const record = createRecord({ id: "record-real-positive", assessment, recordCreatedAt: "2026-09-25T01:00:00.000Z" });
    const result = rankOpportunities([record], noDecisionStates, policy({ acceptedSourceEngineVersions: ["slurry_direct_economic_engine_v1.0.0"] }), evaluatedAt);
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0].amount).toEqual(assessment.netEconomicResult.amount.status === "OK" ? assessment.netEconomicResult.amount.value : undefined);
    expect(result.ranked[0].sourceEngineVersion).toBe(assessment.engineVersion);
  });
});

describe("rankOpportunities — Scenario A: simple ranking", () => {
  it("ranks three current comparable benefits descending by audited amount", () => {
    const records = [
      fixtureRecord("r1", "a1", "f1", "benefit", "321"),
      fixtureRecord("r2", "a2", "f2", "benefit", "842"),
      fixtureRecord("r3", "a3", "f3", "benefit", "510"),
    ];
    const result = rankOpportunities(records, noDecisionStates, policy(), evaluatedAt);
    expect(result.ranked.map((r) => r.amount.amount)).toEqual(["842", "510", "321"]);
    expect(result.ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(result.excluded).toEqual([]);
    expect(result.engineVersion).toBe(OPPORTUNITY_RANKING_ENGINE_VERSION);
  });
});

// ---------------------------------------------------------------------------
// Scenario B — supersession.
// ---------------------------------------------------------------------------
describe("rankOpportunities — Scenario B: supersession", () => {
  it("only the current €842 record ranks; the superseded €970 does not, regardless of its larger numeric value", () => {
    const old = fixtureRecord("r-old", "a1", "f1", "benefit", "970");
    const current = fixtureRecord("r-new", "a1", "f1", "benefit", "842", { supersedesRecordId: "r-old" });
    const result = rankOpportunities([old, current], noDecisionStates, policy(), evaluatedAt);
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0].amount.amount).toBe("842");
    const excludedOld = result.excluded.find((e) => e.recordId === "r-old");
    expect(excludedOld?.reason).toEqual({ kind: "superseded", supersededByRecordId: "r-new" });
  });
});

// ---------------------------------------------------------------------------
// Scenario C — blocked (real).
// ---------------------------------------------------------------------------
describe("rankOpportunities — Scenario C: blocked", () => {
  it("a real unsupported-science record is excluded, never ranked, never €0", () => {
    const record = createRecord({ id: "record-blocked", assessment: blockedAssessment(), recordCreatedAt: "2026-09-25T01:00:00.000Z" });
    expect(record.quantified).toBe(false);
    const result = rankOpportunities([record], noDecisionStates, policy({ acceptedSourceEngineVersions: ["slurry_direct_economic_engine_v1.0.0"] }), evaluatedAt);
    expect(result.ranked).toEqual([]);
    expect(result.excluded[0].reason).toEqual({ kind: "not_quantified" });
  });
});

// ---------------------------------------------------------------------------
// Scenario D — genuine zero.
// ---------------------------------------------------------------------------
describe("rankOpportunities — Scenario D: genuine zero", () => {
  it("a real quantified €0 is recognised as quantified, distinct from blocked, and ranks below positives", () => {
    const zeroRecord = fixtureRecord("r-zero", "a1", "f1", "zero", "0");
    const benefit = fixtureRecord("r-benefit", "a2", "f2", "benefit", "100");
    const result = rankOpportunities([zeroRecord, benefit], noDecisionStates, policy(), evaluatedAt);
    expect(result.ranked.map((r) => r.recordId)).toEqual(["r-benefit", "r-zero"]);
    expect(result.ranked[1].direction).toBe("zero");
    expect(result.ranked[1].amount.amount).toBe("0");
  });
  it("excludes genuine zero when policy.includeZeroOutcomes is false, with a distinct reason from blocked", () => {
    const zeroRecord = fixtureRecord("r-zero", "a1", "f1", "zero", "0");
    const result = rankOpportunities([zeroRecord], noDecisionStates, policy({ includeZeroOutcomes: false }), evaluatedAt);
    expect(result.excluded[0].reason).toEqual({ kind: "zero_outcome_excluded" });
  });
});

// ---------------------------------------------------------------------------
// Scenario E — adverse.
// ---------------------------------------------------------------------------
describe("rankOpportunities — Scenario E: adverse", () => {
  it("a valid audited cost outcome is excluded from ranking by default, never ranked by absolute value among benefits", () => {
    const adverse = fixtureRecord("r-cost", "a1", "f1", "cost", "9999");
    const benefit = fixtureRecord("r-benefit", "a2", "f2", "benefit", "50");
    const result = rankOpportunities([adverse, benefit], noDecisionStates, policy(), evaluatedAt);
    expect(result.ranked.map((r) => r.recordId)).toEqual(["r-benefit"]);
    expect(result.excluded[0].reason).toEqual({ kind: "adverse_outcome_excluded" });
  });
  it("when explicitly included, a cost never outranks a benefit and its amount is a non-negative magnitude with direction cost", () => {
    const adverse = fixtureRecord("r-cost", "a1", "f1", "cost", "9999");
    const benefit = fixtureRecord("r-benefit", "a2", "f2", "benefit", "1");
    const result = rankOpportunities([adverse, benefit], noDecisionStates, policy({ includeAdverseOutcomes: true }), evaluatedAt);
    expect(result.ranked.map((r) => r.recordId)).toEqual(["r-benefit", "r-cost"]);
    expect(result.ranked[1].amount.amount).toBe("9999");
    expect(result.ranked[1].direction).toBe("cost");
  });
});

// ---------------------------------------------------------------------------
// Scenario F — duplicate same assessment.
// ---------------------------------------------------------------------------
describe("rankOpportunities — Scenario F: duplicate same assessment", () => {
  it("the exact same assessment recorded twice contributes exactly one ranked opportunity, chosen deterministically", () => {
    const assessment = fixtureAssessment({ evaluatedActionId: "a1", fieldId: "f1", direction: "benefit", magnitude: "100" });
    const dup1 = createRecord({ id: "record-b", assessment, recordCreatedAt: "2026-09-25T01:00:00.000Z" });
    const dup2 = createRecord({ id: "record-a", assessment, recordCreatedAt: "2026-09-25T01:05:00.000Z" });
    const result = rankOpportunities([dup1, dup2], noDecisionStates, policy(), evaluatedAt);
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0].recordId).toBe("record-a");
    const excludedDup = result.excluded.find((e) => e.recordId === "record-b");
    expect(excludedDup?.reason).toEqual({ kind: "duplicate_assessment", keptRecordId: "record-a" });
  });
  it("same assessmentId with genuinely different content is an integrity conflict — neither side ranks", () => {
    const a = createRecord({ id: "record-a", assessment: fixtureAssessment({ evaluatedActionId: "a1", fieldId: "f1", direction: "benefit", magnitude: "100" }), recordCreatedAt: "2026-09-25T01:00:00.000Z" });
    const forged = { ...a.assessment, netEconomicResult: { direction: "benefit" as const, amount: { status: "OK" as const, value: createMoneyAmount("999", "EUR"), evidenceState: "IRISH_MODEL" as const } } };
    const b = createRecord({ id: "record-b", assessment: forged, recordCreatedAt: "2026-09-25T01:05:00.000Z" });
    expect(a.assessmentId).toBe(b.assessmentId);
    expect(a.assessmentFingerprint.digest).not.toBe(b.assessmentFingerprint.digest);
    const result = rankOpportunities([a, b], noDecisionStates, policy(), evaluatedAt);
    expect(result.ranked).toEqual([]);
    expect(result.excluded.every((e) => e.reason.kind === "identity_content_conflict")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario G — legitimate same-value distinct actions.
// ---------------------------------------------------------------------------
describe("rankOpportunities — Scenario G: legitimate distinct actions, same value", () => {
  it("two genuinely distinct actions with identical value both remain eligible, deterministically tie-broken", () => {
    const first = fixtureRecord("r1", "a1", "f1", "benefit", "500");
    const second = fixtureRecord("r2", "a2", "f2", "benefit", "500");
    const result = rankOpportunities([first, second], noDecisionStates, policy(), evaluatedAt);
    expect(result.ranked).toHaveLength(2);
    expect(result.ranked.map((r) => r.recordId)).toEqual(["r1", "r2"]); // deterministic tie-break by primaryIdentity (a1 < a2)
    const reversedResult = rankOpportunities([second, first], noDecisionStates, policy(), evaluatedAt);
    expect(reversedResult.ranked.map((r) => r.recordId)).toEqual(["r1", "r2"]);
  });
});

// ---------------------------------------------------------------------------
// Scenario H — real Phase 6 parent + children, no double counting.
// ---------------------------------------------------------------------------
describe("rankOpportunities — Scenario H: real Phase 6 parent + real Phase 5 children", () => {
  it("ranks the real whole-farm parent decision, never its own real selected constituent children", () => {
    const { result, childRecords } = realWholeFarmResult();
    expect(childRecords.length).toBeGreaterThan(0);
    const parentRecord = buildDecisionRecord({ id: "decision-record-1", result, constituentActionRecords: childRecords, recordCreatedAt: "2026-09-25T01:00:00.000Z" });
    const allRecords: TrustedOpportunityRecord[] = [parentRecord, ...childRecords];
    const rankingPolicy = policy({ acceptedSourceEngineVersions: ["slurry_direct_economic_engine_v1.0.0", "slurry_whole_farm_allocation_engine_v1.0.0"] });
    const rankResult = rankOpportunities(allRecords, noDecisionStates, rankingPolicy, evaluatedAt);
    expect(rankResult.ranked).toHaveLength(1);
    expect(rankResult.ranked[0].recordId).toBe("decision-record-1");
    expect(rankResult.ranked[0].sourcePhase).toBe("phase_6_whole_farm_decision");
    expect(rankResult.ranked[0].constituentActionRecordIds).toEqual(parentRecord.constituentActionRecordIds);
    for (const child of childRecords) {
      const excludedChild = rankResult.excluded.find((e) => e.recordId === child.id);
      expect(excludedChild?.reason).toEqual({ kind: "parent_child_double_count", parentRecordId: "decision-record-1" });
    }
    // No provenance stripped — the real Phase 5 records remain fully
    // inspectable by the caller who already holds them; Phase 8 merely does
    // not additionally RANK them alongside their own parent.
    expect(rankResult.creditValidation.valid).toBe(true);
  });

  it("frees the children to rank independently when the parent itself is excluded for an unrelated reason", () => {
    const { result, childRecords } = realWholeFarmResult();
    const parentRecord = buildDecisionRecord({ id: "decision-record-1", result, constituentActionRecords: childRecords, recordCreatedAt: "2026-09-25T01:00:00.000Z" });
    const allRecords: TrustedOpportunityRecord[] = [parentRecord, ...childRecords];
    // Policy accepts the children's own engine version but NOT the parent's
    // — the parent is excluded (unsupported_source_engine_version), so it
    // must not suppress its real, independently-valid children.
    const rankingPolicy = policy({ acceptedSourceEngineVersions: ["slurry_direct_economic_engine_v1.0.0"] });
    const rankResult = rankOpportunities(allRecords, noDecisionStates, rankingPolicy, evaluatedAt);
    const excludedParent = rankResult.excluded.find((e) => e.recordId === "decision-record-1");
    expect(excludedParent?.reason.kind).toBe("unsupported_source_engine_version");
    expect(rankResult.ranked.map((r) => r.recordId).sort()).toEqual(childRecords.map((c) => c.id).sort());
  });

  it("adversarial review regression: frees real, individually-valid children when the parent is excluded by the ADVERSE/ZERO policy pass, not just an earlier structural pass", () => {
    // Real Phase 6 output can never actually produce a non-empty selection
    // with an adverse/zero total (its own hardening only ever selects
    // candidates that strictly improve on doing nothing), so this forces
    // the parent's own read-model fields to simulate that state on an
    // otherwise-real, correctly-bound decision record — exactly reproducing
    // the live attack this review found: Pass 4 (parent/child suppression)
    // originally ran BEFORE Pass 5 (adverse/zero exclusion) evaluated the
    // parent's OWN fate, so a parent that would itself be excluded as
    // adverse/zero still suppressed its real, positive-benefit children,
    // with no way to recover them, even though the parent never ranked and
    // posed no actual double-counting risk. Passes are now ordered so
    // parent/child suppression runs last, after every other pass has
    // reached its final verdict on the parent.
    const { result, childRecords } = realWholeFarmResult();
    const parentRecord = buildDecisionRecord({ id: "decision-record-1", result, constituentActionRecords: childRecords, recordCreatedAt: "2026-09-25T01:00:00.000Z" });
    const forcedAdverseParent: TrustedOpportunityRecord = {
      ...parentRecord,
      netDirection: "cost",
      result: { ...parentRecord.result, totalNetEconomicResult: { direction: "cost", amount: { status: "OK", value: createMoneyAmount("500", "EUR"), evidenceState: "IRISH_MODEL" } } },
    };
    const rankingPolicy = policy({ acceptedSourceEngineVersions: ["slurry_direct_economic_engine_v1.0.0", "slurry_whole_farm_allocation_engine_v1.0.0"] }); // includeAdverseOutcomes: false (default)
    const rankResult = rankOpportunities([forcedAdverseParent, ...childRecords], noDecisionStates, rankingPolicy, evaluatedAt);
    expect(rankResult.excluded.find((e) => e.recordId === "decision-record-1")?.reason).toEqual({ kind: "adverse_outcome_excluded" });
    expect(rankResult.ranked.map((r) => r.recordId).sort()).toEqual(childRecords.map((c) => c.id).sort());
    for (const child of childRecords) {
      expect(rankResult.excluded.find((e) => e.recordId === child.id)).toBeUndefined();
    }
  });

  it("adversarial review regression: frees real, individually-valid children when the parent is excluded by the CURRENCY pass, the other pass that used to run after parent/child suppression", () => {
    const { result, childRecords } = realWholeFarmResult();
    const parentRecord = buildDecisionRecord({ id: "decision-record-1", result, constituentActionRecords: childRecords, recordCreatedAt: "2026-09-25T01:00:00.000Z" });
    const forcedForeignCurrencyParent: TrustedOpportunityRecord = {
      ...parentRecord,
      currency: "USD" as never,
      result: { ...parentRecord.result, totalNetEconomicResult: { direction: "benefit", amount: { status: "OK", value: { amount: "9999", currency: "USD" as never }, evidenceState: "IRISH_MODEL" } } },
    };
    // A EUR-majority peer forces the USD-currency parent to be the
    // minority group excluded by Pass 5 (currency comparability).
    const eurPeer = fixtureRecord("r-eur-peer", "a-eur-peer", "f-eur-peer", "benefit", "1");
    const rankingPolicy = policy({ acceptedSourceEngineVersions: ["slurry_direct_economic_engine_v1.0.0", "slurry_whole_farm_allocation_engine_v1.0.0", "fixture_engine_v1.0.0"] });
    const rankResult = rankOpportunities([forcedForeignCurrencyParent, eurPeer, ...childRecords], noDecisionStates, rankingPolicy, evaluatedAt);
    expect(rankResult.excluded.find((e) => e.recordId === "decision-record-1")?.reason).toEqual({ kind: "incomparable_currency" });
    for (const child of childRecords) {
      expect(rankResult.excluded.find((e) => e.recordId === child.id)).toBeUndefined();
      expect(rankResult.ranked.some((r) => r.recordId === child.id)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenario I — mixed currencies.
// ---------------------------------------------------------------------------
describe("rankOpportunities — Scenario I: mixed currencies", () => {
  it("never combines incompatible currencies into one raw ranking — only the majority currency group ranks", () => {
    const eur1 = fixtureRecord("r-eur1", "a1", "f1", "benefit", "100");
    const eur2 = fixtureRecord("r-eur2", "a2", "f2", "benefit", "50");
    // Constructed with an out-of-type-union currency to simulate a future
    // multi-currency record — proves the structural guard, not merely that
    // the type system currently forbids it (mirrors Phase 6's own
    // currency-mismatch defence, built even though currently unreachable
    // via the real constructors).
    const usdRecord: TrustedOpportunityRecord = {
      ...eur1,
      id: "r-usd",
      assessmentId: "assessment-usd",
      evaluatedActionId: "a-usd",
      currency: "USD" as never,
      assessment: { ...eur1.assessment, id: "assessment-usd", evaluatedActionId: "a-usd", netEconomicResult: { direction: "benefit", amount: { status: "OK", value: { amount: "9999", currency: "USD" as never }, evidenceState: "IRISH_MODEL" } } },
    };
    const result = rankOpportunities([eur1, eur2, usdRecord], noDecisionStates, policy(), evaluatedAt);
    expect(result.ranked.map((r) => r.recordId)).toEqual(["r-eur1", "r-eur2"]);
    const excludedUsd = result.excluded.find((e) => e.recordId === "r-usd");
    expect(excludedUsd?.reason).toEqual({ kind: "incomparable_currency" });
  });
});

// ---------------------------------------------------------------------------
// Scenario J — stale evidence, policy-driven.
// ---------------------------------------------------------------------------
describe("rankOpportunities — Scenario J: stale evidence", () => {
  it("the same record is excluded under a strict freshness policy and eligible under a permissive one", () => {
    const record = fixtureRecord("r1", "a1", "f1", "benefit", "100"); // asOfDate = 2026-09-25
    const strict = policy({ freshness: { mode: "max_age_days", maxAgeDays: 1, evaluationDate: "2026-10-25" } });
    const strictResult = rankOpportunities([record], noDecisionStates, strict, evaluatedAt);
    expect(strictResult.excluded[0]?.reason).toEqual({ kind: "stale_evidence" });

    const permissive = policy({ freshness: { mode: "max_age_days", maxAgeDays: 365, evaluationDate: "2026-10-25" } });
    const permissiveResult = rankOpportunities([record], noDecisionStates, permissive, evaluatedAt);
    expect(permissiveResult.ranked).toHaveLength(1);
    expect(permissiveResult.ranked[0].freshness).toBe("current");
  });
  it("mode: not_evaluated never blocks on freshness, and reports freshness_undetermined honestly", () => {
    const record = fixtureRecord("r1", "a1", "f1", "benefit", "100");
    const result = rankOpportunities([record], noDecisionStates, policy({ freshness: { mode: "not_evaluated" } }), evaluatedAt);
    expect(result.ranked[0].freshness).toBe("freshness_undetermined");
  });
});

// ---------------------------------------------------------------------------
// Scenario K — invalid integrity.
// ---------------------------------------------------------------------------
describe("rankOpportunities — Scenario K: invalid integrity", () => {
  it("rejects a record whose integrity schema version is not accepted by policy", () => {
    const record = fixtureRecord("r1", "a1", "f1", "benefit", "100");
    const result = rankOpportunities([record], noDecisionStates, policy({ acceptedIntegritySchemaVersions: [999] }), evaluatedAt);
    expect(result.ranked).toEqual([]);
    expect(result.excluded[0].reason.kind).toBe("integrity_not_verified");
  });
  it("rejects a record with a malformed fingerprint digest", () => {
    const record = fixtureRecord("r1", "a1", "f1", "benefit", "100");
    const malformed: TrustedOpportunityRecord = { ...record, assessmentFingerprint: { ...record.assessmentFingerprint, digest: "not-a-real-digest" } };
    const result = rankOpportunities([malformed], noDecisionStates, policy(), evaluatedAt);
    expect(result.excluded[0].reason.kind).toBe("integrity_not_verified");
  });
});

// ---------------------------------------------------------------------------
// Scenario L — shuffled input.
// ---------------------------------------------------------------------------
describe("rankOpportunities — Scenario L: input-order independence", () => {
  it("produces an identical ranking regardless of input array order", () => {
    const records = [
      fixtureRecord("r1", "a1", "f1", "benefit", "321"),
      fixtureRecord("r2", "a2", "f2", "benefit", "842"),
      fixtureRecord("r3", "a3", "f3", "benefit", "510"),
      fixtureRecord("r4", "a4", "f4", "zero", "0"),
    ];
    const baseline = rankOpportunities(records, noDecisionStates, policy(), evaluatedAt).ranked.map((r) => r.recordId);
    const shuffles = [
      [records[3], records[0], records[2], records[1]],
      [records[1], records[3], records[0], records[2]],
      [...records].reverse(),
    ];
    for (const shuffled of shuffles) {
      const shuffledRanking = rankOpportunities(shuffled, noDecisionStates, policy(), evaluatedAt).ranked.map((r) => r.recordId);
      expect(shuffledRanking).toEqual(baseline);
    }
  });
});

// ---------------------------------------------------------------------------
// Required invariant tests not already covered by a lettered scenario above.
// ---------------------------------------------------------------------------
describe("rankOpportunities — required invariants", () => {
  it("trust: only the real trusted record type can be ranked — no arithmetic recomputes the ranked amount, it is read verbatim off the trusted record", () => {
    const record = fixtureRecord("r1", "a1", "f1", "benefit", "321.091");
    const result = rankOpportunities([record], noDecisionStates, policy(), evaluatedAt);
    expect(result.ranked[0].amount).toEqual(record.assessment.netEconomicResult.amount.status === "OK" ? record.assessment.netEconomicResult.amount.value : undefined);
  });

  it("unsupported record engine version is excluded, never silently accepted", () => {
    const record = fixtureRecord("r1", "a1", "f1", "benefit", "100");
    const result = rankOpportunities([record], noDecisionStates, policy({ acceptedRecordEngineVersions: ["some_other_engine_v9.9.9"] }), evaluatedAt);
    expect(result.excluded[0].reason).toEqual({ kind: "unsupported_record_engine_version", recordEngineVersion: AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION });
  });

  it("unsupported source engine version is excluded, never silently accepted", () => {
    const record = fixtureRecord("r1", "a1", "f1", "benefit", "100");
    const result = rankOpportunities([record], noDecisionStates, policy({ acceptedSourceEngineVersions: ["some_other_engine_v9.9.9"] }), evaluatedAt);
    expect(result.excluded[0].reason).toEqual({ kind: "unsupported_source_engine_version", engineVersion: "fixture_engine_v1.0.0" });
  });

  it("lifecycle: an accepted decision record ranks, a rejected one does not, absence of a decision state defaults to active", () => {
    const active = fixtureRecord("r1", "a1", "f1", "benefit", "100");
    const rejected = fixtureRecord("r2", "a2", "f2", "benefit", "100");
    const states = new Map<string, OpportunityDecisionState>([["r2", createOpportunityDecisionState("r2", "2026-09-25T00:00:00.000Z")]]);
    states.set("r2", { opportunityRecordId: "r2", status: "rejected", updatedAt: "2026-09-25T00:00:00.000Z" });
    const result = rankOpportunities([active, rejected], states, policy(), evaluatedAt);
    expect(result.ranked.map((r) => r.recordId)).toEqual(["r1"]);
    expect(result.excluded[0].reason).toEqual({ kind: "lifecycle_excluded", status: "rejected" });
  });

  it("determinism: identical input and policy produce a byte-identical ranking across repeated calls", () => {
    const records = [fixtureRecord("r1", "a1", "f1", "benefit", "842"), fixtureRecord("r2", "a2", "f2", "benefit", "510")];
    const first = rankOpportunities(records, noDecisionStates, policy(), evaluatedAt);
    const second = rankOpportunities(records, noDecisionStates, policy(), evaluatedAt);
    expect(JSON.stringify(second.ranked)).toBe(JSON.stringify(first.ranked));
  });

  it("policy traceability: the ranking result records the exact policy used", () => {
    const p = policy({ id: "policy-2026-09-25-v3" });
    const result = rankOpportunities([fixtureRecord("r1", "a1", "f1", "benefit", "1")], noDecisionStates, p, evaluatedAt);
    expect(result.policy).toEqual(p);
  });

  it("audit continuity: a ranked opportunity's identity fields trace directly back to the source record", () => {
    const record = fixtureRecord("r1", "a1", "f1", "benefit", "100");
    const result = rankOpportunities([record], noDecisionStates, policy(), evaluatedAt);
    const top = result.ranked[0];
    expect(top.recordId).toBe(record.id);
    expect(top.assessmentId).toBe(record.assessmentId);
    expect(top.primaryIdentity).toBe(record.evaluatedActionId);
    expect(top.recordEngineVersion).toBe(record.recordEngineVersion);
    expect(top.sourceEngineVersion).toBe(record.assessment.engineVersion);
    expect(top.limitations).toEqual(record.limitations);
  });

  it("real credit-claim double counting: the real Phase 1 validator flags two effects sharing one credit key even though structural passes did not exclude either", () => {
    // Two genuinely different records (different assessmentId, different
    // evaluatedActionId — not caught by the duplicate-assessment or
    // parent-child passes) that happen to carry EFFECTS with an identical
    // creditKey — an architecturally-adjacent misuse this defence-in-depth
    // check is specifically there to catch.
    const sharedCreditKey = "slurry-allocation:shared:fertiliser-plan-cost-difference";
    const a = fixtureRecord("r1", "a1", "f1", "benefit", "100");
    const b = fixtureRecord("r2", "a2", "f2", "benefit", "50");
    const bWithSharedClaim: AuditedActionOpportunityRecord = { ...b, assessment: { ...b.assessment, effect: b.assessment.effect ? { ...b.assessment.effect, creditClaim: { ...b.assessment.effect.creditClaim, creditKey: sharedCreditKey } } : null } };
    const aWithSharedClaim: AuditedActionOpportunityRecord = { ...a, assessment: { ...a.assessment, effect: a.assessment.effect ? { ...a.assessment.effect, creditClaim: { ...a.assessment.effect.creditClaim, creditKey: sharedCreditKey } } : null } };
    const result = rankOpportunities([aWithSharedClaim, bWithSharedClaim], noDecisionStates, policy(), evaluatedAt);
    expect(result.ranked).toHaveLength(2); // structural passes don't catch this — by design, brief §27
    expect(result.creditValidation.valid).toBe(false);
    expect(result.creditValidation.duplicateCreditKeys).toContain(sharedCreditKey);
  });

  it("no recalculation: ranking never performs money arithmetic beyond comparison — the ranked amount is reference-identical in value to the source's own amount", () => {
    const record = fixtureRecord("r1", "a1", "f1", "benefit", "321.091");
    const result = rankOpportunities([record], noDecisionStates, policy(), evaluatedAt);
    const sourceAmount = record.assessment.netEconomicResult.amount;
    expect(sourceAmount.status).toBe("OK");
    if (sourceAmount.status === "OK") {
      expect(result.ranked[0].amount.amount).toBe(sourceAmount.value.amount);
      expect(result.ranked[0].amount.currency).toBe(sourceAmount.value.currency);
    }
  });

  it("structured ranking reason, never AI prose", () => {
    const record = fixtureRecord("r1", "a1", "f1", "benefit", "842.17");
    const result = rankOpportunities([record], noDecisionStates, policy(), evaluatedAt);
    expect(result.ranked[0].rankingReason).toEqual({ code: RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT, amount: { amount: "842.17", currency: "EUR" }, currency: "EUR" });
  });

  it("global ranking limitation is present, stating precision is not certainty", () => {
    const result = rankOpportunities([], noDecisionStates, policy(), evaluatedAt);
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.limitations[0]).toMatch(/does not prove it will produce a greater realised return/);
  });
});
