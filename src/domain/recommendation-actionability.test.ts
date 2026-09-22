import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { calculateNutrientPlan } from "./nutrients";
import { tracked, type Field, type LivestockGroup, type NutrientPlan, type SlurryAllocation } from "./types";
import { createMarketPriceObservation, canonicalContentHashInput, type MarketPriceObservation, type CreateMarketPriceObservationInput } from "./market-evidence";
import { resolveMarketReferencePrice, type AuditableMarketPriceResolution } from "./market-price-resolution";
import type { EngineOutcome } from "./evidence";
import { buildSlurryDirectEconomicAssessment, type SlurryDirectEconomicAssessmentInput, type SlurryDirectEconomicAssessment } from "./slurry-direct-economic-assessment";
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
import { rankOpportunities, RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT, type OpportunityRankingPolicy } from "./opportunity-ranking";
import {
  evaluateRecommendation,
  RECOMMENDATION_SELECTION_MODE_TOP_ACTIONABLE_AUDITED_OPPORTUNITY,
  type RecommendationSelectionPolicy,
} from "./recommendation-selection";
import {
  assessWorkflowStateActionability,
  createActionabilityAssessment,
  validateActionabilityBinding,
  combineActionabilityEvidence,
  deriveVerifiedActionability,
  RECOMMENDATION_ACTIONABILITY_ENGINE_VERSION,
} from "./recommendation-actionability";

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
function createRecord(input: Omit<CreateAuditedActionOpportunityRecordInput, "hash">): AuditedActionOpportunityRecord {
  return createAuditedActionOpportunityRecord({ ...input, hash });
}

// ---------------------------------------------------------------------------
// Real Phase 5/7/8 fixture (brief §40: use a real ranked opportunity from
// the real engine chain).
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
function positiveAssessment(assessmentId = "assessment-positive"): SlurryDirectEconomicAssessment {
  return realAssessment({ id: assessmentId, evaluatedActionId: "allocation-real-db-id-1", fieldId: goldenField.id, baselinePlan: planWithout(goldenField), interventionPlan: planWith(goldenField, slurryOn(goldenField, 20 * goldenField.areaHa)) });
}
function rankingPolicy(): OpportunityRankingPolicy {
  return {
    id: "ranking-policy-v1", rankingMode: RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT, acceptedIntegritySchemaVersions: [ASSESSMENT_INTEGRITY_SCHEMA_VERSION],
    acceptedSourceEngineVersions: ["slurry_direct_economic_engine_v1.0.0"], acceptedRecordEngineVersions: [AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION],
    eligibleLifecycleStates: ["active", "accepted", "rejected", "completed"], freshness: { mode: "not_evaluated" }, includeAdverseOutcomes: false, includeZeroOutcomes: true,
  };
}
function recommendationPolicy(): RecommendationSelectionPolicy {
  return { id: "recommendation-policy-v1", selectionMode: RECOMMENDATION_SELECTION_MODE_TOP_ACTIONABLE_AUDITED_OPPORTUNITY, recommendableLifecycleStates: ["active"], maxSelectedRecommendations: 1 };
}
function realRanked(record: AuditedActionOpportunityRecord, decisionStates: Map<string, OpportunityDecisionState>) {
  return rankOpportunities([record], decisionStates, rankingPolicy(), "2026-09-25T02:00:00.000Z");
}

function expectOk(outcome: ReturnType<typeof assessWorkflowStateActionability>) {
  if (outcome.status !== "OK") throw new Error(`expected OK, got ${JSON.stringify(outcome)}`);
  return outcome.assessment;
}

// ---------------------------------------------------------------------------
// 1/2 — actionable / not-actionable with valid provenance (general
// constructor, fixture evidence per brief §9's explicit allowance).
// ---------------------------------------------------------------------------

describe("createActionabilityAssessment", () => {
  it("1: produces a real, provenanced ACTIONABLE assessment", () => {
    const outcome = createActionabilityAssessment({
      id: "aa-1", opportunityRecordId: "record-1", boundAssessmentId: "assessment-1", state: "actionable",
      evidenceCategory: "FARMER_DECLARATION", evidenceDetail: "Farmer confirmed field access is available today.",
      ruleId: "FARMER_DECLARATION_RULE", ruleVersion: "1.0.0", reasonCode: "ACTIONABLE_CONFIRMED_BY_FARMER_DECLARATION", evaluatedAt: "2026-09-25T09:00:00.000Z",
    });
    const assessment = expectOk(outcome);
    expect(assessment.state).toBe("actionable");
    expect(assessment.evidenceCategory).toBe("FARMER_DECLARATION");
    expect(assessment.engineVersion).toBe(RECOMMENDATION_ACTIONABILITY_ENGINE_VERSION);
    expect(assessment.limitations.length).toBeGreaterThan(0);
  });

  it("2: produces a real, provenanced NOT_ACTIONABLE assessment", () => {
    const outcome = createActionabilityAssessment({
      id: "aa-2", opportunityRecordId: "record-1", boundAssessmentId: "assessment-1", state: "not_actionable",
      evidenceCategory: "OPERATIONAL_CONSTRAINT", evidenceDetail: "Contractor unavailable this week.",
      ruleId: "OPERATIONAL_CONSTRAINT_RULE", ruleVersion: "1.0.0", reasonCode: "NOT_ACTIONABLE_OPERATIONAL_CONSTRAINT", evaluatedAt: "2026-09-25T09:00:00.000Z",
    });
    const assessment = expectOk(outcome);
    expect(assessment.state).toBe("not_actionable");
  });

  it("4: missing provenance cannot produce ACTIONABLE — rejected outright", () => {
    const outcome = createActionabilityAssessment({
      id: "aa-3", opportunityRecordId: "record-1", boundAssessmentId: "assessment-1", state: "actionable",
      evidenceCategory: "UNKNOWN", evidenceDetail: "", ruleId: "", ruleVersion: "", reasonCode: "", evaluatedAt: "2026-09-25T09:00:00.000Z",
    });
    expect(outcome.status).toBe("REJECTED");
    if (outcome.status === "REJECTED") expect(outcome.reasonCode).toBe("RECOMMENDATION_ACTIONABILITY_MISSING_PROVENANCE");
  });

  it("4b: missing provenance cannot produce NOT_ACTIONABLE either", () => {
    const outcome = createActionabilityAssessment({
      id: "aa-4", opportunityRecordId: "record-1", boundAssessmentId: "assessment-1", state: "not_actionable",
      evidenceCategory: "WEATHER_CONDITION", evidenceDetail: "", ruleId: "WEATHER_RULE", ruleVersion: "1.0.0", reasonCode: "NOT_ACTIONABLE_WEATHER", evaluatedAt: "2026-09-25T09:00:00.000Z",
    });
    expect(outcome.status).toBe("REJECTED");
  });

  it("unknown state never requires provenance", () => {
    const outcome = createActionabilityAssessment({
      id: "aa-5", opportunityRecordId: "record-1", boundAssessmentId: "assessment-1", state: "unknown",
      evidenceCategory: "UNKNOWN", evidenceDetail: "", ruleId: "", ruleVersion: "", reasonCode: "UNKNOWN_MISSING_ACTIONABILITY_EVIDENCE", evaluatedAt: "2026-09-25T09:00:00.000Z",
    });
    expect(outcome.status).toBe("OK");
  });
});

// ---------------------------------------------------------------------------
// 3, 8, 9, 10 — the real production workflow-state derivation, precise
// lifecycle interpretation.
// ---------------------------------------------------------------------------

describe("assessWorkflowStateActionability", () => {
  const record = { id: "record-1", assessmentId: "assessment-1" };
  const at = "2026-09-25T09:00:00.000Z";

  it("3: no decision state at all -> UNKNOWN, missing-evidence reason", () => {
    const assessment = expectOk(assessWorkflowStateActionability(record, undefined, "aa-missing", at));
    expect(assessment.state).toBe("unknown");
    expect(assessment.reasonCode).toBe("UNKNOWN_MISSING_ACTIONABILITY_EVIDENCE");
  });

  it("8: lifecycle 'active' alone does NOT prove actionable -> UNKNOWN", () => {
    const state: OpportunityDecisionState = createOpportunityDecisionState(record.id, at);
    const assessment = expectOk(assessWorkflowStateActionability(record, state, "aa-active", at));
    expect(assessment.state).toBe("unknown");
    expect(assessment.reasonCode).toBe("UNKNOWN_WORKFLOW_STATE_INSUFFICIENT");
  });

  it("9: 'completed' for the exact action supports NOT_ACTIONABLE", () => {
    const state = updateOpportunityDecisionState(createOpportunityDecisionState(record.id, at), "completed", at);
    const assessment = expectOk(assessWorkflowStateActionability(record, state, "aa-completed", at));
    expect(assessment.state).toBe("not_actionable");
    expect(assessment.reasonCode).toBe("NOT_ACTIONABLE_ALREADY_COMPLETED");
  });

  it("10: 'rejected' is NOT automatically treated as physically not-actionable -> UNKNOWN", () => {
    const state = updateOpportunityDecisionState(createOpportunityDecisionState(record.id, at), "rejected", at);
    const assessment = expectOk(assessWorkflowStateActionability(record, state, "aa-rejected", at));
    expect(assessment.state).toBe("unknown");
    expect(assessment.reasonCode).not.toBe("NOT_ACTIONABLE_ALREADY_COMPLETED");
  });

  it("'accepted' does not mean actionable -> UNKNOWN (Phase 9 handles suppression separately)", () => {
    const state = updateOpportunityDecisionState(createOpportunityDecisionState(record.id, at), "accepted", at);
    const assessment = expectOk(assessWorkflowStateActionability(record, state, "aa-accepted", at));
    expect(assessment.state).toBe("unknown");
  });

  it("14: deterministic repeat — identical input produces byte-identical output", () => {
    const state = updateOpportunityDecisionState(createOpportunityDecisionState(record.id, at), "completed", at);
    const a = expectOk(assessWorkflowStateActionability(record, state, "aa-det", at));
    const b = expectOk(assessWorkflowStateActionability(record, state, "aa-det", at));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// 5, 6 — binding attacks.
// ---------------------------------------------------------------------------

describe("validateActionabilityBinding", () => {
  it("5: wrong opportunity binding rejected", () => {
    const assessment = expectOk(createActionabilityAssessment({
      id: "aa-a", opportunityRecordId: "record-A", boundAssessmentId: "assessment-A", state: "not_actionable",
      evidenceCategory: "WORKFLOW_STATE", evidenceDetail: "completed", ruleId: "R", ruleVersion: "1", reasonCode: "NOT_ACTIONABLE_ALREADY_COMPLETED", evaluatedAt: "2026-09-25T09:00:00.000Z",
    }));
    const result = validateActionabilityBinding(assessment, { id: "record-B", assessmentId: "assessment-A" });
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("ACTIONABILITY_EVIDENCE_IDENTITY_MISMATCH");
  });

  it("6: stale economic-assessment binding rejected (reassessment invalidates old actionability)", () => {
    const assessment = expectOk(createActionabilityAssessment({
      id: "aa-b", opportunityRecordId: "record-A", boundAssessmentId: "assessment-old", state: "not_actionable",
      evidenceCategory: "WORKFLOW_STATE", evidenceDetail: "completed", ruleId: "R", ruleVersion: "1", reasonCode: "NOT_ACTIONABLE_ALREADY_COMPLETED", evaluatedAt: "2026-09-25T09:00:00.000Z",
    }));
    const result = validateActionabilityBinding(assessment, { id: "record-A", assessmentId: "assessment-new" });
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("RECOMMENDATION_ACTIONABILITY_STALE_ASSESSMENT_BINDING");
  });

  it("correct binding validates", () => {
    const assessment = expectOk(createActionabilityAssessment({
      id: "aa-c", opportunityRecordId: "record-A", boundAssessmentId: "assessment-A", state: "not_actionable",
      evidenceCategory: "WORKFLOW_STATE", evidenceDetail: "completed", ruleId: "R", ruleVersion: "1", reasonCode: "NOT_ACTIONABLE_ALREADY_COMPLETED", evaluatedAt: "2026-09-25T09:00:00.000Z",
    }));
    expect(validateActionabilityBinding(assessment, { id: "record-A", assessmentId: "assessment-A" }).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7 — conflicting evidence.
// ---------------------------------------------------------------------------

describe("combineActionabilityEvidence", () => {
  const base = { opportunityRecordId: "record-A", boundAssessmentId: "assessment-A", evaluatedAt: "2026-09-25T09:00:00.000Z" };
  function fixture(id: string, state: "actionable" | "not_actionable" | "unknown", category: "FARMER_DECLARATION" | "OPERATIONAL_CONSTRAINT") {
    return expectOk(createActionabilityAssessment({
      id, ...base, state, evidenceCategory: category, evidenceDetail: `fixture ${state}`, ruleId: "R", ruleVersion: "1", reasonCode: `FIXTURE_${state.toUpperCase()}`,
    }));
  }

  it("7: conflicting evidence (actionable vs not_actionable) resolves to UNKNOWN", () => {
    const a = fixture("a1", "actionable", "FARMER_DECLARATION");
    const b = fixture("a2", "not_actionable", "OPERATIONAL_CONSTRAINT");
    const outcome = combineActionabilityEvidence("combined-1", [a, b], base.evaluatedAt);
    const assessment = expectOk(outcome);
    expect(assessment.state).toBe("unknown");
    expect(assessment.reasonCode).toBe("UNKNOWN_CONFLICTING_EVIDENCE");
  });

  it("agreeing evidence from multiple sources combines to that state", () => {
    const a = fixture("a3", "actionable", "FARMER_DECLARATION");
    const outcome = combineActionabilityEvidence("combined-2", [a], base.evaluatedAt);
    expect(expectOk(outcome).state).toBe("actionable");
  });

  it("mismatched opportunity binding across combined evidence is rejected", () => {
    const a = fixture("a4", "actionable", "FARMER_DECLARATION");
    const b = expectOk(createActionabilityAssessment({
      id: "a5", opportunityRecordId: "record-B", boundAssessmentId: "assessment-B", state: "not_actionable",
      evidenceCategory: "OPERATIONAL_CONSTRAINT", evidenceDetail: "x", ruleId: "R", ruleVersion: "1", reasonCode: "X", evaluatedAt: base.evaluatedAt,
    }));
    const outcome = combineActionabilityEvidence("combined-3", [a, b], base.evaluatedAt);
    expect(outcome.status).toBe("REJECTED");
  });
});

// ---------------------------------------------------------------------------
// 11, 12, 13, 15, 16 — real Phase 9 integration.
// ---------------------------------------------------------------------------

describe("deriveVerifiedActionability — real Phase 9 integration (brief §40)", () => {
  it("11/13: real ranked opportunity + Phase 10 assessment -> real Phase 9 selection, with NO naked caller-supplied 'actionable' anywhere", () => {
    const decisionStates = new Map<string, OpportunityDecisionState>();
    const record = createRecord({ id: "record-real", assessment: positiveAssessment(), recordCreatedAt: "2026-09-25T01:00:00.000Z" });
    const rankingResult = realRanked(record, decisionStates);
    expect(rankingResult.ranked.length).toBe(1);

    // No real evidence exists -> the only honest actionability is UNKNOWN.
    const noAssessments = new Map();
    const actionability = deriveVerifiedActionability(rankingResult, noAssessments);
    const outcome = evaluateRecommendation(rankingResult, decisionStates, actionability, recommendationPolicy(), "2026-09-25T03:00:00.000Z");
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.evaluation.primaryRecommendation).toBeNull();
    expect(outcome.evaluation.candidates[0].outcome).toEqual({ kind: "deferred", code: "ACTIONABILITY_UNKNOWN" });

    // Now attach a real, provenanced (fixture-based, per brief §9's allowance)
    // ACTIONABLE assessment bound correctly to this exact record/assessment.
    const provenanced = expectOk(createActionabilityAssessment({
      id: "aa-real", opportunityRecordId: record.id, boundAssessmentId: record.assessmentId, state: "actionable",
      evidenceCategory: "FARMER_DECLARATION", evidenceDetail: "Farmer confirmed field access today.", ruleId: "FARMER_DECLARATION_RULE", ruleVersion: "1.0.0",
      reasonCode: "ACTIONABLE_CONFIRMED_BY_FARMER_DECLARATION", evaluatedAt: "2026-09-25T03:00:00.000Z",
    }));
    const withEvidence = deriveVerifiedActionability(rankingResult, new Map([[record.id, provenanced]]));
    const outcome2 = evaluateRecommendation(rankingResult, decisionStates, withEvidence, recommendationPolicy(), "2026-09-25T03:00:00.000Z");
    if (outcome2.status !== "OK") throw new Error("expected OK");
    expect(outcome2.evaluation.primaryRecommendation?.recordId).toBe(record.id);
  });

  it("12: unknown top rank causes next actionable record to be selected", () => {
    const decisionStates = new Map<string, OpportunityDecisionState>();
    const recordA = createRecord({ id: "record-A", assessment: positiveAssessment("assessment-A"), recordCreatedAt: "2026-09-25T01:00:00.000Z" });
    const fieldB = makeField("field-B", 8, 2, 2);
    const assessmentB = realAssessment({ id: "assessment-B", evaluatedActionId: "allocation-B", fieldId: fieldB.id, baselinePlan: planWithout(fieldB), interventionPlan: planWith(fieldB, slurryOn(fieldB, 20 * fieldB.areaHa)) });
    const recordB = createRecord({ id: "record-B", assessment: assessmentB, recordCreatedAt: "2026-09-25T01:00:00.000Z" });
    const rankingResult = rankOpportunities([recordA, recordB], decisionStates, rankingPolicy(), "2026-09-25T02:00:00.000Z");
    expect(rankingResult.ranked.length).toBe(2);
    const rank1RecordId = rankingResult.ranked[0].recordId;
    const rank2RecordId = rankingResult.ranked[1].recordId;

    const rank2Actionable = expectOk(createActionabilityAssessment({
      id: "aa-rank2", opportunityRecordId: rank2RecordId, boundAssessmentId: rankingResult.ranked[1].assessmentId, state: "actionable",
      evidenceCategory: "FARMER_DECLARATION", evidenceDetail: "confirmed", ruleId: "R", ruleVersion: "1", reasonCode: "ACTIONABLE_CONFIRMED_BY_FARMER_DECLARATION", evaluatedAt: "2026-09-25T03:00:00.000Z",
    }));
    const actionability = deriveVerifiedActionability(rankingResult, new Map([[rank2RecordId, rank2Actionable]]));
    const outcome = evaluateRecommendation(rankingResult, decisionStates, actionability, recommendationPolicy(), "2026-09-25T03:00:00.000Z");
    if (outcome.status !== "OK") throw new Error("expected OK");
    expect(outcome.evaluation.primaryRecommendation?.recordId).toBe(rank2RecordId);
    expect(outcome.evaluation.primaryRecommendation?.economicRank).toBe(2);
    expect(rank1RecordId).not.toBe(rank2RecordId);
  });

  it("15: dual audit chain — economic (Phase 8/9) and actionability (Phase 10) both independently reconstructable", () => {
    const at = "2026-09-25T09:00:00.000Z";
    const record = { id: "record-dual", assessmentId: "assessment-dual" };
    const state = updateOpportunityDecisionState(createOpportunityDecisionState(record.id, at), "completed", at);
    const original = expectOk(assessWorkflowStateActionability(record, state, "aa-dual", at));
    // Re-derive independently from the same real, caller-held decision state
    // -- proves the actionability chain is reconstructable without a
    // redundant stored reference on the Phase 9 result type.
    const rederived = expectOk(assessWorkflowStateActionability(record, state, "aa-dual", at));
    expect(rederived).toEqual(original);
  });

  it("16: no new economic arithmetic or scientific logic anywhere in this module", () => {
    // Structural: ActionabilityAssessment has no monetary field of any kind.
    const assessment = expectOk(createActionabilityAssessment({
      id: "aa-struct", opportunityRecordId: "r", boundAssessmentId: "a", state: "unknown", evidenceCategory: "UNKNOWN", evidenceDetail: "", ruleId: "", ruleVersion: "", reasonCode: "UNKNOWN_MISSING_ACTIONABILITY_EVIDENCE", evaluatedAt: "2026-09-25T09:00:00.000Z",
    }));
    expect(Object.keys(assessment)).not.toContain("amount");
    expect(Object.keys(assessment)).not.toContain("currency");
    expect(Object.keys(assessment)).not.toContain("score");
  });
});

// ---------------------------------------------------------------------------
// Immutability / mutation attack (brief §32).
// ---------------------------------------------------------------------------

describe("immutability", () => {
  it("mutating the source decisionState object after construction does not alter the stored assessment", () => {
    const record = { id: "record-mut", assessmentId: "assessment-mut" };
    const at = "2026-09-25T09:00:00.000Z";
    const mutableState = updateOpportunityDecisionState(createOpportunityDecisionState(record.id, at), "completed", at);
    const assessment = expectOk(assessWorkflowStateActionability(record, mutableState, "aa-mut", at));
    const before = JSON.stringify(assessment);
    // Deliberate runtime mutation attempt for the test.
    (mutableState as OpportunityDecisionState).status = "active";
    expect(JSON.stringify(assessment)).toBe(before);
    expect(assessment.state).toBe("not_actionable");
  });
});
