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
import type { FertiliserPlanCostAssessment } from "./fertiliser-plan-cost";
import {
  createAuditedActionOpportunityRecord,
  createOpportunityDecisionState,
  updateOpportunityDecisionState,
  AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION,
  type AuditedActionOpportunityRecord,
  type CreateAuditedActionOpportunityRecordInput,
  type OpportunityDecisionState,
} from "./audited-opportunity-record";
import { ASSESSMENT_INTEGRITY_SCHEMA_VERSION } from "./assessment-integrity";
import { rankOpportunities, RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT, type OpportunityRankingPolicy, type TrustedOpportunityRecord } from "./opportunity-ranking";
import {
  evaluateRecommendation,
  RECOMMENDATION_SELECTION_MODE_TOP_ACTIONABLE_AUDITED_OPPORTUNITY,
  type RecommendationSelectionPolicy,
  type RecommendationActionability,
} from "./recommendation-selection";

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
function createRecord(input: Omit<CreateAuditedActionOpportunityRecordInput, "hash">): AuditedActionOpportunityRecord {
  return createAuditedActionOpportunityRecord({ ...input, hash });
}

// ---------------------------------------------------------------------------
// PART A — one real end-to-end fixture (brief §50: a real Phase 8 output
// built from real Phase 5/7 paths for at least one integration test).
// ---------------------------------------------------------------------------

const livestockGroups: LivestockGroup[] = [
  { id: "g1", farmId: "farm-test", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
];
const farmGrasslandAreaHa = 27;
const asOfDate = "2026-09-25";

function makeField(id: string, areaHa: number, pIndex: 1 | 2 | 3 | 4, kIndex: 1 | 2 | 3 | 4): Field {
  return {
    id, farmId: "farm-test", name: id, areaHa, centroid: [0, 0],
    plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
    fertility: { pIndex: tracked(pIndex, "farmer_adjusted", "Keith"), kIndex: tracked(kIndex, "farmer_adjusted", "Keith") },
    history: [],
  };
}
const goldenField = makeField("field-golden", 10, 2, 2);

function slurryOn(field: Field, volumeM3: number): SlurryAllocation {
  return { fieldId: field.id, housingId: "h1", priority: "high", volumeM3, score: 90, applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith"), applicationDate: tracked("2026-02-15", "farmer_adjusted", "Keith") };
}
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
function resolved(candidates: MarketPriceObservation[], mappedProduct: string): EngineOutcome<AuditableMarketPriceResolution> {
  return resolveMarketReferencePrice({ candidates, mappedProduct, asOfDate });
}
function allProductPrices(): Record<string, EngineOutcome<AuditableMarketPriceResolution>> {
  const zeroSevenThirty = observation({ sourceSeriesCode: "008", priceAmount: "412", mappingKind: "EXACT_PRODUCT_MATCH", mappedProduct: "0-7-30", sourceSeriesLabel: "Compound 0-7-30" });
  const eighteenSixTwelve = observation({ sourceSeriesCode: "012", priceAmount: "645", mappingKind: "EXACT_PRODUCT_MATCH", mappedProduct: "18-6-12", sourceSeriesLabel: "Compound 18-6-12" });
  const protectedUrea = observation({ sourceSeriesCode: "002", priceAmount: "550", mappingKind: "CATEGORY_BENCHMARK", mappedProduct: "Protected Urea", sourceSeriesLabel: "Urea (46% N)" });
  return { "0-7-30": resolved([zeroSevenThirty], "0-7-30"), "18-6-12": resolved([eighteenSixTwelve], "18-6-12"), "Protected Urea": resolved([protectedUrea], "Protected Urea") };
}
const pricesOk = allProductPrices()["18-6-12"];
const knownAt = pricesOk.status === "OK" ? pricesOk.value.trace.knownAt : "";

function realAssessment(overrides: Partial<SlurryDirectEconomicAssessmentInput> & Pick<SlurryDirectEconomicAssessmentInput, "id" | "evaluatedActionId" | "fieldId" | "baselinePlan" | "interventionPlan">): SlurryDirectEconomicAssessment {
  return buildSlurryDirectEconomicAssessment({ asOfDate, knownAt, resolvedPricesByProduct: allProductPrices(), realisationCost: { status: "known_zero" }, createdAt: "2026-09-25T00:00:00.000Z", ...overrides });
}
function positiveAssessment(): SlurryDirectEconomicAssessment {
  return realAssessment({ id: "assessment-positive", evaluatedActionId: "allocation-real-db-id-1", fieldId: goldenField.id, baselinePlan: planWithout(goldenField), interventionPlan: planWith(goldenField, slurryOn(goldenField, 20 * goldenField.areaHa)) });
}
function realRankedResultSingleBenefit() {
  const assessment = positiveAssessment();
  const record = createRecord({ id: "record-real-positive", assessment, recordCreatedAt: "2026-09-25T01:00:00.000Z" });
  const rankingResult = rankOpportunities(
    [record],
    new Map<string, OpportunityDecisionState>(),
    rankingPolicy({ acceptedSourceEngineVersions: ["slurry_direct_economic_engine_v1.0.0"] }),
    "2026-09-25T02:00:00.000Z",
  );
  return { assessment, record, rankingResult };
}

// ---------------------------------------------------------------------------
// PART B — controlled exact-value fixtures for pure selection-policy tests
// (same pattern `opportunity-ranking.test.ts` already uses for Phase 8).
// ---------------------------------------------------------------------------

function stubScienceSupportOk(): SlurryScienceSupportOutcome {
  return { status: "OK", evidenceState: "IRISH_MODEL", value: { n: 10, p: 0, k: 0, unit: "kg/ha", applicationMethod: "splashplate", assumedDefault: false, applicationRateM3ha: 20, dmPct: 6, applicationDate: "2026-02-15" } as unknown as SlurryScienceSupportOutcome extends EngineOutcome<infer V> ? V : never };
}
function stubPlanCost(id: string): FertiliserPlanCostAssessment {
  return { id, engineVersion: "stub", asOfDate, knownAt, lines: [], aggregateOutcome: { status: "OK", value: zeroMoney("EUR"), evidenceState: "IRISH_MODEL" }, limitations: [], createdAt: "2026-01-01T00:00:00.000Z" };
}
function fixtureAssessment(params: { evaluatedActionId: string; fieldId: string; direction: "benefit" | "cost" | "zero"; magnitude: string }): SlurryDirectEconomicAssessment {
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
    scienceSupport: stubScienceSupportOk(), counterfactualInvariance: { valid: true }, evaluatedActionVolumeM3: "20",
    baselineFertiliserPlanCost: stubPlanCost(`${params.evaluatedActionId}:baseline`), interventionFertiliserPlanCost: stubPlanCost(`${params.evaluatedActionId}:intervention`),
    directCostDifference: { status: "OK", value, evidenceState: "IRISH_MODEL" }, directCostDifferenceDirection: params.direction, effect, realisationCost: { status: "known_zero" },
    netEconomicResult: { direction: params.direction, amount: { status: "OK", value, evidenceState: "IRISH_MODEL" } }, limitations: [], createdAt: "2026-01-01T00:00:00.000Z",
  };
}
function fixtureRecord(id: string, evaluatedActionId: string, fieldId: string, direction: "benefit" | "cost" | "zero", magnitude: string): AuditedActionOpportunityRecord {
  return createRecord({ id, assessment: fixtureAssessment({ evaluatedActionId, fieldId, direction, magnitude }), recordCreatedAt: "2026-09-25T01:00:00.000Z" });
}
function rankingPolicy(overrides: Partial<OpportunityRankingPolicy> = {}): OpportunityRankingPolicy {
  return {
    id: "ranking-policy-v1", rankingMode: RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT, acceptedIntegritySchemaVersions: [ASSESSMENT_INTEGRITY_SCHEMA_VERSION],
    acceptedSourceEngineVersions: ["fixture_engine_v1.0.0", "slurry_direct_economic_engine_v1.0.0"],
    acceptedRecordEngineVersions: [AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION], eligibleLifecycleStates: ["active", "accepted", "rejected", "completed"], freshness: { mode: "not_evaluated" },
    includeAdverseOutcomes: true, includeZeroOutcomes: true, ...overrides,
  };
}
function recommendationPolicy(overrides: Partial<RecommendationSelectionPolicy> = {}): RecommendationSelectionPolicy {
  return {
    id: "recommendation-policy-v1", selectionMode: RECOMMENDATION_SELECTION_MODE_TOP_ACTIONABLE_AUDITED_OPPORTUNITY,
    recommendableLifecycleStates: ["active"], maxSelectedRecommendations: 1, ...overrides,
  };
}
function rank(records: TrustedOpportunityRecord[], overrides: Partial<OpportunityRankingPolicy> = {}) {
  return rankOpportunities(records, new Map<string, OpportunityDecisionState>(), rankingPolicy(overrides), "2026-09-25T02:00:00.000Z");
}
function decisionMap(entries: [string, OpportunityDecisionState][]): Map<string, OpportunityDecisionState> {
  return new Map(entries);
}
function actionabilityMap(entries: [string, RecommendationActionability][]): Map<string, RecommendationActionability> {
  return new Map(entries);
}
const noDecisionStates = new Map<string, OpportunityDecisionState>();
const noActionability = new Map<string, RecommendationActionability>();
const evaluatedAt = "2026-09-25T03:00:00.000Z";

function expectOk(outcome: ReturnType<typeof evaluateRecommendation>) {
  if (outcome.status !== "OK") throw new Error(`expected OK, got ${JSON.stringify(outcome)}`);
  return outcome.evaluation;
}

// ---------------------------------------------------------------------------
// Real integration + audit continuity (brief §50, test matrix L).
// ---------------------------------------------------------------------------

describe("evaluateRecommendation — real Phase 5/7/8 integration (brief §50)", () => {
  it("selects a real, unmodified Phase 5 positive opportunity produced through the actual scientific/costing/ranking pipeline, with full audit continuity", () => {
    const { assessment, record, rankingResult } = realRankedResultSingleBenefit();
    const outcome = evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([[record.id, "actionable"]]), recommendationPolicy(), evaluatedAt);
    const evaluation = expectOk(outcome);
    expect(evaluation.primaryRecommendation).not.toBeNull();
    const selected = evaluation.primaryRecommendation!;
    // Audit continuity (brief §72): trace straight back to the real Phase 5
    // assessment and the real Phase 7 record via recordId/assessmentId.
    expect(selected.recordId).toBe(record.id);
    expect(selected.assessmentId).toBe(assessment.id);
    expect(selected.primaryIdentity).toBe(assessment.evaluatedActionId);
    expect(selected.amount).toEqual(assessment.netEconomicResult.amount.status === "OK" ? assessment.netEconomicResult.amount.value : undefined);
    expect(selected.economicRank).toBe(1);
    expect(evaluation.sourceRankingEngineVersion).toBe(rankingResult.engineVersion);
    expect(evaluation.sourceRankingPolicyId).toBe(rankingResult.policy.id);
  });
});

// ---------------------------------------------------------------------------
// Test matrix A-O.
// ---------------------------------------------------------------------------

describe("evaluateRecommendation — A: top ranked actionable", () => {
  it("selects rank 1 when both are actionable", () => {
    const r1 = fixtureRecord("r1", "a1", "f1", "benefit", "842");
    const r2 = fixtureRecord("r2", "a2", "f2", "benefit", "510");
    const rankingResult = rank([r1, r2]);
    const evaluation = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r1", "actionable"], ["r2", "actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation?.recordId).toBe("r1");
    expect(evaluation.primaryRecommendation?.economicRank).toBe(1);
  });
});

describe("evaluateRecommendation — B: rank 1 not actionable", () => {
  it("selects rank 2, retaining rank 1's real economic rank in the audit trail (never relabelled)", () => {
    const r1 = fixtureRecord("r1", "a1", "f1", "benefit", "842");
    const r2 = fixtureRecord("r2", "a2", "f2", "benefit", "510");
    const rankingResult = rank([r1, r2]);
    const evaluation = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r1", "not_actionable"], ["r2", "actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation?.recordId).toBe("r2");
    expect(evaluation.primaryRecommendation?.economicRank).toBe(2);
    const deferred = evaluation.candidates.find((c) => c.recordId === "r1")!;
    expect(deferred.economicRank).toBe(1);
    expect(deferred.outcome).toEqual({ kind: "deferred", code: "NOT_CURRENTLY_ACTIONABLE" });
  });
});

describe("evaluateRecommendation — C: rank 1 actionability unknown", () => {
  it("selects the next known-actionable opportunity; unknown is never treated as actionable", () => {
    const r1 = fixtureRecord("r1", "a1", "f1", "benefit", "842");
    const r2 = fixtureRecord("r2", "a2", "f2", "benefit", "510");
    const rankingResult = rank([r1, r2]);
    const evaluation = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r2", "actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation?.recordId).toBe("r2");
    expect(evaluation.candidates.find((c) => c.recordId === "r1")!.outcome).toEqual({ kind: "deferred", code: "ACTIONABILITY_UNKNOWN" });
  });
});

describe("evaluateRecommendation — D: rank 1 accepted", () => {
  it("suppresses the accepted top opportunity and selects the next", () => {
    const r1 = fixtureRecord("r1", "a1", "f1", "benefit", "842");
    const r2 = fixtureRecord("r2", "a2", "f2", "benefit", "510");
    const rankingResult = rank([r1, r2]);
    const states = decisionMap([["r1", { opportunityRecordId: "r1", status: "accepted", updatedAt: "2026-09-24T00:00:00.000Z" }]]);
    const evaluation = expectOk(evaluateRecommendation(rankingResult, states, actionabilityMap([["r1", "actionable"], ["r2", "actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation?.recordId).toBe("r2");
    expect(evaluation.candidates.find((c) => c.recordId === "r1")!.outcome).toEqual({ kind: "suppressed", code: "ALREADY_ACCEPTED" });
  });
});

describe("evaluateRecommendation — E: rank 1 completed", () => {
  it("suppresses the completed top opportunity and selects the next", () => {
    const r1 = fixtureRecord("r1", "a1", "f1", "benefit", "842");
    const r2 = fixtureRecord("r2", "a2", "f2", "benefit", "510");
    const rankingResult = rank([r1, r2]);
    const states = decisionMap([["r1", { opportunityRecordId: "r1", status: "completed", updatedAt: "2026-09-24T00:00:00.000Z" }]]);
    const evaluation = expectOk(evaluateRecommendation(rankingResult, states, actionabilityMap([["r1", "actionable"], ["r2", "actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation?.recordId).toBe("r2");
    expect(evaluation.candidates.find((c) => c.recordId === "r1")!.outcome).toEqual({ kind: "suppressed", code: "ALREADY_COMPLETED" });
  });
});

describe("evaluateRecommendation — F: rank 1 rejected", () => {
  it("suppresses the rejected top opportunity under default policy and selects the next", () => {
    const r1 = fixtureRecord("r1", "a1", "f1", "benefit", "842");
    const r2 = fixtureRecord("r2", "a2", "f2", "benefit", "510");
    const rankingResult = rank([r1, r2]);
    const states = decisionMap([["r1", { opportunityRecordId: "r1", status: "rejected", updatedAt: "2026-09-24T00:00:00.000Z" }]]);
    const evaluation = expectOk(evaluateRecommendation(rankingResult, states, actionabilityMap([["r1", "actionable"], ["r2", "actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation?.recordId).toBe("r2");
    expect(evaluation.candidates.find((c) => c.recordId === "r1")!.outcome).toEqual({ kind: "suppressed", code: "USER_REJECTED" });
  });
});

describe("evaluateRecommendation — G: all unknown", () => {
  it("returns no current recommendation, reason NO_ACTIONABLE_CURRENT_RECOMMENDATION", () => {
    const r1 = fixtureRecord("r1", "a1", "f1", "benefit", "842");
    const rankingResult = rank([r1]);
    const evaluation = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, noActionability, recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation).toBeNull();
    expect(evaluation.noRecommendationReasonCode).toBe("NO_ACTIONABLE_CURRENT_RECOMMENDATION");
  });
});

describe("evaluateRecommendation — H: all not actionable", () => {
  it("returns no current recommendation", () => {
    const r1 = fixtureRecord("r1", "a1", "f1", "benefit", "842");
    const r2 = fixtureRecord("r2", "a2", "f2", "benefit", "510");
    const rankingResult = rank([r1, r2]);
    const evaluation = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r1", "not_actionable"], ["r2", "not_actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation).toBeNull();
    expect(evaluation.noRecommendationReasonCode).toBe("NO_ACTIONABLE_CURRENT_RECOMMENDATION");
  });
});

describe("evaluateRecommendation — I: only genuine zero", () => {
  it("never selects a zero as the primary recommendation; reason NO_POSITIVE_CURRENT_RECOMMENDATION", () => {
    const r1 = fixtureRecord("r1", "a1", "f1", "zero", "0");
    const rankingResult = rank([r1]);
    expect(rankingResult.ranked).toHaveLength(1); // genuinely ranked by Phase 8 as a valid zero
    const evaluation = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r1", "actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation).toBeNull();
    expect(evaluation.noRecommendationReasonCode).toBe("NO_POSITIVE_CURRENT_RECOMMENDATION");
    expect(evaluation.candidates[0].outcome).toEqual({ kind: "not_applicable", code: "POLICY_NOT_APPLICABLE" });
  });
});

describe("evaluateRecommendation — J: no opportunities", () => {
  it("returns a valid empty result, reason NO_RANKED_OPPORTUNITIES — not an engine failure", () => {
    const rankingResult = rank([]);
    const outcome = evaluateRecommendation(rankingResult, noDecisionStates, noActionability, recommendationPolicy(), evaluatedAt);
    expect(outcome.status).toBe("OK");
    const evaluation = expectOk(outcome);
    expect(evaluation.primaryRecommendation).toBeNull();
    expect(evaluation.candidates).toHaveLength(0);
    expect(evaluation.noRecommendationReasonCode).toBe("NO_RANKED_OPPORTUNITIES");
  });
});

describe("evaluateRecommendation — K: reassessed previously rejected action", () => {
  it("a new assessment of the same underlying action, recorded as a NEW record, is selectable even though the old record was rejected", () => {
    const oldRecord = fixtureRecord("r-old", "action-X", "f1", "benefit", "321");
    const newAssessment = fixtureAssessment({ evaluatedActionId: "action-X", fieldId: "f1", direction: "benefit", magnitude: "500" });
    const newRecord = createRecord({ id: "r-new", assessment: { ...newAssessment, id: "assessment-new" }, recordCreatedAt: "2026-09-25T05:00:00.000Z", supersedesRecordId: "r-old" });
    const rankingResult = rank([oldRecord, newRecord]);
    // Old record is superseded (excluded by Phase 8, never even ranked); only the new one ranks.
    expect(rankingResult.ranked).toHaveLength(1);
    expect(rankingResult.ranked[0].recordId).toBe("r-new");
    const states = decisionMap([["r-old", { opportunityRecordId: "r-old", status: "rejected", updatedAt: "2026-09-24T00:00:00.000Z" }]]);
    // r-new has NO decision state recorded — defaults to "active", never
    // permanently blacklisted merely because a prior assessment of the
    // same action was rejected.
    const evaluation = expectOk(evaluateRecommendation(rankingResult, states, actionabilityMap([["r-new", "actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation?.recordId).toBe("r-new");
  });
});

describe("evaluateRecommendation — M: shuffled actionability input", () => {
  it("produces the identical result regardless of the actionability map's construction order", () => {
    const records = [fixtureRecord("r1", "a1", "f1", "benefit", "842"), fixtureRecord("r2", "a2", "f2", "benefit", "510"), fixtureRecord("r3", "a3", "f3", "benefit", "321")];
    const rankingResult = rank(records);
    const orderA = actionabilityMap([["r1", "not_actionable"], ["r2", "actionable"], ["r3", "actionable"]]);
    const orderB = actionabilityMap([["r3", "actionable"], ["r2", "actionable"], ["r1", "not_actionable"]]);
    const a = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, orderA, recommendationPolicy(), evaluatedAt));
    const b = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, orderB, recommendationPolicy(), evaluatedAt));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("evaluateRecommendation — N: mutated policy/actionability after evaluation", () => {
  it("a caller mutating its own policy or actionability map after calling does not alter the already-returned result", () => {
    const records = [fixtureRecord("r1", "a1", "f1", "benefit", "842")];
    const rankingResult = rank(records);
    const mutablePolicy = recommendationPolicy();
    const mutableActionability = actionabilityMap([["r1", "actionable"]]);
    const outcome = evaluateRecommendation(rankingResult, noDecisionStates, mutableActionability, mutablePolicy, evaluatedAt);
    const before = JSON.stringify(outcome);
    mutablePolicy.recommendableLifecycleStates.push("rejected");
    mutablePolicy.maxSelectedRecommendations = 99;
    mutableActionability.set("r1", "not_actionable");
    expect(JSON.stringify(outcome)).toBe(before);
  });
});

describe("evaluateRecommendation — O: malformed/untrusted Phase 8 input", () => {
  it("fails closed when the actionability map references an unknown recordId", () => {
    const rankingResult = rank([fixtureRecord("r1", "a1", "f1", "benefit", "842")]);
    const outcome = evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r-does-not-exist", "actionable"]]), recommendationPolicy(), evaluatedAt);
    expect(outcome.status).toBe("BLOCKED");
    if (outcome.status === "BLOCKED") expect(outcome.reasonCode).toBe("RECOMMENDATION_SELECTION_UNKNOWN_ACTIONABILITY_RECORD_ID");
  });

  it("fails closed on a structurally malformed ranking result (duplicate recordId)", () => {
    const rankingResult = rank([fixtureRecord("r1", "a1", "f1", "benefit", "842")]);
    const malformed = { ...rankingResult, ranked: [...rankingResult.ranked, { ...rankingResult.ranked[0] }] };
    const outcome = evaluateRecommendation(malformed, noDecisionStates, noActionability, recommendationPolicy(), evaluatedAt);
    expect(outcome.status).toBe("BLOCKED");
    if (outcome.status === "BLOCKED") expect(outcome.reasonCode).toBe("RECOMMENDATION_SELECTION_MALFORMED_RANKING_INPUT");
  });
});

// ---------------------------------------------------------------------------
// Required invariant tests.
// ---------------------------------------------------------------------------

describe("evaluateRecommendation — required invariants", () => {
  it("Phase 8 order preservation: never re-ranks by economic amount — a lower economic-rank candidate is never selected over a higher one that is equally eligible", () => {
    const records = [fixtureRecord("r1", "a1", "f1", "benefit", "100"), fixtureRecord("r2", "a2", "f2", "benefit", "9999")];
    const rankingResult = rank(records);
    expect(rankingResult.ranked[0].recordId).toBe("r2"); // Phase 8 already put the larger amount first
    const evaluation = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r1", "actionable"], ["r2", "actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation?.recordId).toBe("r2");
    expect(evaluation.candidates.map((c) => c.recordId)).toEqual(rankingResult.ranked.map((r) => r.recordId));
  });

  it("no-recalculation: the selected amount is the exact same value as the source RankedOpportunity's own amount, never recomputed", () => {
    const records = [fixtureRecord("r1", "a1", "f1", "benefit", "321.091")];
    const rankingResult = rank(records);
    const evaluation = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r1", "actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation?.amount).toEqual(rankingResult.ranked[0].amount);
  });

  it("determinism: repeated evaluation of identical input produces byte-identical output", () => {
    const records = [fixtureRecord("r1", "a1", "f1", "benefit", "321")];
    const rankingResult = rank(records);
    const a = evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r1", "actionable"]]), recommendationPolicy(), evaluatedAt);
    const b = evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r1", "actionable"]]), recommendationPolicy(), evaluatedAt);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("policy traceability: the result records the exact recommendation policy and the source Phase 8 ranking policy/engine identity", () => {
    const records = [fixtureRecord("r1", "a1", "f1", "benefit", "321")];
    const rankingResult = rank(records);
    const evaluation = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r1", "actionable"]]), recommendationPolicy({ id: "distinct-policy-id" }), evaluatedAt));
    expect(evaluation.policy.id).toBe("distinct-policy-id");
    expect(evaluation.sourceRankingPolicyId).toBe(rankingResult.policy.id);
    expect(evaluation.sourceRankingEngineVersion).toBe(rankingResult.engineVersion);
  });

  it("unknown fail-closed: a record with no actionability entry is never selected", () => {
    const records = [fixtureRecord("r1", "a1", "f1", "benefit", "321")];
    const rankingResult = rank(records);
    const evaluation = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, noActionability, recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation).toBeNull();
  });

  it("lifecycle suppression: a decision-state update never mutates the underlying candidate's economic amount", () => {
    const records = [fixtureRecord("r1", "a1", "f1", "benefit", "321")];
    const rankingResult = rank(records);
    let state = createOpportunityDecisionState("r1", "2026-09-24T00:00:00.000Z");
    state = updateOpportunityDecisionState(state, "accepted", "2026-09-24T01:00:00.000Z");
    const evaluation = expectOk(evaluateRecommendation(rankingResult, decisionMap([["r1", state]]), actionabilityMap([["r1", "actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation).toBeNull();
    const candidate = evaluation.candidates[0];
    expect(candidate.amount).toEqual(rankingResult.ranked[0].amount); // amount untouched by lifecycle
    expect(candidate.outcome).toEqual({ kind: "suppressed", code: "ALREADY_ACCEPTED" });
  });

  it("empty validity: 'no current recommendation' is a real OK evaluation, never a BLOCKED outcome, when input is genuinely well-formed", () => {
    const outcome = evaluateRecommendation(rank([]), noDecisionStates, noActionability, recommendationPolicy(), evaluatedAt);
    expect(outcome.status).toBe("OK");
  });

  it("audit continuity: a selected recommendation's identity fields trace directly to the source RankedOpportunity, not re-derived", () => {
    const records = [fixtureRecord("r1", "a1", "f1", "benefit", "321")];
    const rankingResult = rank(records);
    const evaluation = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r1", "actionable"]]), recommendationPolicy(), evaluatedAt));
    const src = rankingResult.ranked[0];
    const sel = evaluation.primaryRecommendation!;
    expect(sel.recordId).toBe(src.recordId);
    expect(sel.assessmentId).toBe(src.assessmentId);
    expect(sel.primaryIdentity).toBe(src.primaryIdentity);
    expect(sel.currency).toBe(src.currency);
    expect(sel.limitations).toEqual(src.limitations);
  });

  it("structured selection reason, never AI prose", () => {
    const records = [fixtureRecord("r1", "a1", "f1", "benefit", "321")];
    const rankingResult = rank(records);
    const evaluation = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r1", "actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation?.outcome).toEqual({ kind: "selected", code: "SELECTED_HIGHEST_RANKED_ACTIONABLE_OPPORTUNITY" });
  });

  it("global limitation states estimate-vs-realised, never a cash-saved claim", () => {
    const evaluation = expectOk(evaluateRecommendation(rank([]), noDecisionStates, noActionability, recommendationPolicy(), evaluatedAt));
    expect(evaluation.limitations.some((l) => l.includes("not a confirmed cash saving"))).toBe(true);
  });

  it("adverse opportunities are never reintroduced as recommendable even when Phase 8's own policy includes them", () => {
    const r1 = fixtureRecord("r1", "a1", "f1", "cost", "500");
    const rankingResult = rank([r1], { includeAdverseOutcomes: true });
    expect(rankingResult.ranked).toHaveLength(1); // Phase 8 does include it, per this test's own override
    const evaluation = expectOk(evaluateRecommendation(rankingResult, noDecisionStates, actionabilityMap([["r1", "actionable"]]), recommendationPolicy(), evaluatedAt));
    expect(evaluation.primaryRecommendation).toBeNull();
    expect(evaluation.candidates[0].outcome).toEqual({ kind: "not_applicable", code: "POLICY_NOT_APPLICABLE" });
  });

  it("maxSelectedRecommendations bounds the selected set while preserving Phase 8 order for the rest", () => {
    const records = [fixtureRecord("r1", "a1", "f1", "benefit", "900"), fixtureRecord("r2", "a2", "f2", "benefit", "800"), fixtureRecord("r3", "a3", "f3", "benefit", "700")];
    const rankingResult = rank(records);
    const evaluation = expectOk(
      evaluateRecommendation(
        rankingResult,
        noDecisionStates,
        actionabilityMap([["r1", "actionable"], ["r2", "actionable"], ["r3", "actionable"]]),
        recommendationPolicy({ maxSelectedRecommendations: 2 }),
        evaluatedAt,
      ),
    );
    expect(evaluation.selectedRecommendations.map((c) => c.recordId)).toEqual(["r1", "r2"]);
    expect(evaluation.candidates.find((c) => c.recordId === "r3")!.outcome).toEqual({ kind: "eligible_not_selected", code: "LOWER_RANKED_THAN_SELECTED" });
    expect(evaluation.primaryRecommendation?.recordId).toBe("r1");
  });
});
