import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { calculateNutrientPlan } from "./nutrients";
import { tracked, type Field, type LivestockGroup, type NutrientPlan, type SlurryAllocation } from "./types";
import { createMarketPriceObservation, canonicalContentHashInput, type MarketPriceObservation, type CreateMarketPriceObservationInput } from "./market-evidence";
import { resolveMarketReferencePrice, type AuditableMarketPriceResolution } from "./market-price-resolution";
import type { EngineOutcome } from "./evidence";
import { ok, blockedInsufficientEvidence } from "./evidence";
import { buildSlurryDirectEconomicAssessment, type SlurryDirectEconomicAssessmentInput, type SlurryDirectEconomicAssessment } from "./slurry-direct-economic-assessment";
import {
  createAuditedActionOpportunityRecord,
  AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION,
  type AuditedActionOpportunityRecord,
  type CreateAuditedActionOpportunityRecordInput,
  type OpportunityDecisionState,
} from "./audited-opportunity-record";
import { ASSESSMENT_INTEGRITY_SCHEMA_VERSION } from "./assessment-integrity";
import { rankOpportunities, RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT, type OpportunityRankingPolicy } from "./opportunity-ranking";
import { RECOMMENDATION_SELECTION_MODE_TOP_ACTIONABLE_AUDITED_OPPORTUNITY, type RecommendationSelectionPolicy } from "./recommendation-selection";
import {
  evaluateSlurryActionability,
  createFarmerDeclarationEvidence,
  CONFIRM_FIELD_TRAFFICABLE,
  CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER,
  CONFIRM_NOT_FROZEN_OR_SNOW_COVERED,
  MINIMUM_RAINFALL_WINDOW_SCORE,
  type SlurryActionabilityEvaluation,
  type FarmerDeclarationEvidence,
  type FarmerConfirmationCode,
} from "./slurry-actionability-policy";
import { buildWhatMattersPilotPresentation } from "./what-matters-presentation";
import type { SpreadingActionabilityFoundationAssessment, FoundationCondition } from "./spreading-actionability-foundation";
import type { RainfallWindowScoreAssessment } from "./rainfall-window-score";

// ---------------------------------------------------------------------------
// Real Phase 5/7/8 fixture builders — same pattern recommendation-
// selection.test.ts's own "PART A" already established (calculateNutrientPlan
// -> buildSlurryDirectEconomicAssessment -> createAuditedActionOpportunityRecord
// -> rankOpportunities). Phase 11A/11B use controlled fixtures for the
// specific regulatory/rainfall/farmer-declaration scenarios under test — the
// same "PART A real, PART B controlled" split that file itself uses, not a
// shortcut invented for this test.
// ---------------------------------------------------------------------------

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
function createRecord(input: Omit<CreateAuditedActionOpportunityRecordInput, "hash">): AuditedActionOpportunityRecord {
  return createAuditedActionOpportunityRecord({ ...input, hash });
}

const livestockGroups: LivestockGroup[] = [
  { id: "g1", farmId: "farm-test", category: "suckler_cow", label: "Cows", count: tracked(20, "verified", "Farmer"), system: "grazing", value: tracked(30000, "estimated", "Farm Return estimate") },
];
const farmGrasslandAreaHa = 27;
const asOfDate = "2026-09-25";

function makeField(id: string, name: string, areaHa: number): Field {
  return {
    id,
    farmId: "farm-test",
    name,
    areaHa,
    centroid: [-8.785556, 53.289167],
    plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
    fertility: { pIndex: tracked(2, "farmer_adjusted", "Keith"), kIndex: tracked(2, "farmer_adjusted", "Keith") },
    history: [],
  };
}
const meadowField = makeField("field-meadow", "Meadow Field", 10);
const southField = makeField("field-south", "South Field", 8);

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

// Two real, differently-valued opportunities -> a genuine Phase 8 rank order.
const rankOneAssessment = realAssessment({ id: "assessment-rank-1", evaluatedActionId: "allocation-meadow", fieldId: meadowField.id, baselinePlan: planWithout(meadowField), interventionPlan: planWith(meadowField, slurryOn(meadowField, 20 * meadowField.areaHa)) });
const rankTwoAssessment = realAssessment({ id: "assessment-rank-2", evaluatedActionId: "allocation-south", fieldId: southField.id, baselinePlan: planWithout(southField), interventionPlan: planWith(southField, slurryOn(southField, 5 * southField.areaHa)) });

function rankingPolicy(overrides: Partial<OpportunityRankingPolicy> = {}): OpportunityRankingPolicy {
  return {
    id: "ranking-policy-v1", rankingMode: RANKING_MODE_AUDITED_NET_ECONOMIC_BENEFIT, acceptedIntegritySchemaVersions: [ASSESSMENT_INTEGRITY_SCHEMA_VERSION],
    acceptedSourceEngineVersions: [rankOneAssessment.engineVersion], acceptedRecordEngineVersions: [AUDITED_OPPORTUNITY_RECORD_ENGINE_VERSION],
    eligibleLifecycleStates: ["active"], freshness: { mode: "not_evaluated" }, includeAdverseOutcomes: false, includeZeroOutcomes: false, ...overrides,
  };
}
function recommendationPolicy(overrides: Partial<RecommendationSelectionPolicy> = {}): RecommendationSelectionPolicy {
  return { id: "recommendation-policy-v1", selectionMode: RECOMMENDATION_SELECTION_MODE_TOP_ACTIONABLE_AUDITED_OPPORTUNITY, recommendableLifecycleStates: ["active"], maxSelectedRecommendations: 1, ...overrides };
}

const evaluatedAt = "2026-02-15T09:00:00.000Z";
const record1 = createRecord({ id: "record-rank-1", assessment: rankOneAssessment, recordCreatedAt: "2026-09-25T01:00:00.000Z" });
const record2 = createRecord({ id: "record-rank-2", assessment: rankTwoAssessment, recordCreatedAt: "2026-09-25T01:00:00.000Z" });

function rankedResult() {
  const result = rankOpportunities([record1, record2], new Map<string, OpportunityDecisionState>(), rankingPolicy(), "2026-09-25T02:00:00.000Z");
  // Sanity: two genuinely different real amounts, record1 ranked first
  // (both are real, non-fabricated economic outputs of the science above).
  expect(result.ranked.length).toBe(2);
  return result;
}

// ---------------------------------------------------------------------------
// Controlled Phase 11A/11B fixtures — same "PART B" convention this whole
// test suite family already uses for exact-value policy scenarios.
// ---------------------------------------------------------------------------

function passCondition(): FoundationCondition {
  return { state: "PASS", outcome: ok("x", "DERIVED"), source: "test", ruleVersion: "1.0.0" };
}
function blockedCondition(): FoundationCondition {
  return { state: "BLOCKED", outcome: blockedInsufficientEvidence("X", []), source: "test", ruleVersion: "1.0.0" };
}
function foundationFor(record: AuditedActionOpportunityRecord, overrides: Partial<SpreadingActionabilityFoundationAssessment> = {}): SpreadingActionabilityFoundationAssessment {
  return {
    id: `foundation-${record.id}`, engineVersion: "spreading_actionability_foundation_v1.0.0", opportunityRecordId: record.id, boundAssessmentId: record.assessmentId,
    evaluatedActionId: record.evaluatedActionId, fieldId: record.fieldId, fieldCentroid: [0, 0], proposedMaterial: "organic_fertiliser_other_than_FYM", evaluatedAt,
    spreadingWindowGate: passCondition(), bufferCompliance: passCondition(), commonageCompliance: passCondition(),
    rainfallObservation: { availability: "AVAILABLE", source: "test", sourceTimestamp: evaluatedAt, fieldCentroid: [0, 0], limitations: [] },
    rainfallForecast: { availability: "AVAILABLE", source: "test", sourceTimestamp: evaluatedAt, fieldCentroid: [0, 0], limitations: [] },
    smdEvidence: { availability: "UNKNOWN", reasonCode: "SOURCE_UNAVAILABLE", detail: "no source" }, soilTemperatureEvidence: { availability: "UNKNOWN", reasonCode: "SOURCE_UNAVAILABLE", detail: "no source" },
    aggregateState: "UNKNOWN", aggregateReasonCode: "SPREADING_ACTIONABILITY_FOUNDATION_EVIDENCE_INCOMPLETE", limitations: [], ...overrides,
  };
}
function rainfallScoreFor(record: AuditedActionOpportunityRecord, finalScore: string | null, overrides: Partial<RainfallWindowScoreAssessment> = {}): RainfallWindowScoreAssessment {
  return {
    id: `score-${record.id}`, modelVersion: "rainfall_window_score_ie_v1.0.0", opportunityRecordId: record.id, boundAssessmentId: record.assessmentId, evaluatedActionId: record.evaluatedActionId,
    fieldId: record.fieldId, fieldCentroid: [0, 0], evaluatedAt, historicalWindow: { start: evaluatedAt, end: evaluatedAt }, forecastWindow: { start: evaluatedAt, end: evaluatedAt },
    historicalEvidence: { availability: "AVAILABLE", totalMm: "5", source: "test", windowStart: evaluatedAt, windowEnd: evaluatedAt, observationCount: 72, expectedObservationCount: 72, fieldCentroid: [0, 0], limitations: [] } as never,
    forecastEvidence: { availability: "AVAILABLE", totalMm: "5", source: "test", windowStart: evaluatedAt, windowEnd: evaluatedAt, pointCount: 48, fieldCentroid: [0, 0], limitations: [] } as never,
    score: finalScore === null ? blockedInsufficientEvidence("RAINFALL_WINDOW_SCORE_INCOMPLETE_EVIDENCE", ["test"]) : ok({ modelVersion: "rainfall_window_score_ie_v1.0.0", finalScore, historicalTotalMm: "5", historicalSubscore: "90", historicalWeight: "0.40", historicalContribution: "36", forecastTotalMm: "5", forecastSubscore: "85", forecastWeight: "0.60", forecastContribution: "51" }, "DERIVED"),
    limitations: [], ...overrides,
  };
}
function decl(record: AuditedActionOpportunityRecord, code: FarmerConfirmationCode, value: boolean): FarmerDeclarationEvidence {
  const outcome = createFarmerDeclarationEvidence({ id: `decl-${record.id}-${code}`, opportunityRecordId: record.id, boundAssessmentId: record.assessmentId, evaluatedActionId: record.evaluatedActionId, fieldId: record.fieldId, conditionCode: code, value, declaredAt: evaluatedAt, evaluatedAt });
  if (outcome.status !== "OK") throw new Error("fixture declaration should be valid");
  return outcome.declaration;
}
function allClearDeclarations(record: AuditedActionOpportunityRecord): FarmerDeclarationEvidence[] {
  return [decl(record, CONFIRM_FIELD_TRAFFICABLE, true), decl(record, CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, true), decl(record, CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, true)];
}
function evaluation(record: AuditedActionOpportunityRecord, foundation: SpreadingActionabilityFoundationAssessment, rainfallScore: RainfallWindowScoreAssessment, declarations: FarmerDeclarationEvidence[]): SlurryActionabilityEvaluation {
  return evaluateSlurryActionability({ id: `eval-${record.id}`, opportunityRecordId: record.id, boundAssessmentId: record.assessmentId, evaluatedActionId: record.evaluatedActionId, fieldId: record.fieldId, evaluatedAt, foundation, rainfallScore, farmerDeclarations: declarations });
}

// ---------------------------------------------------------------------------
// The 10 required end-to-end scenarios.
// ---------------------------------------------------------------------------

describe("What Matters pilot — real end-to-end chain (calculateNutrientPlan -> Phase 5 -> Phase 7/7.1 -> Phase 8 -> Phase 11A -> Phase 11B -> policy -> Phase 10 -> Phase 9 -> presentation)", () => {
  it("1. rank 1 actionable -> selected", () => {
    const ranking = rankedResult();
    const top = ranking.ranked[0];
    const record = top.recordId === record1.id ? record1 : record2;
    const evaluations = new Map([[top.recordId, evaluation(record, foundationFor(record), rainfallScoreFor(record, "86"), allClearDeclarations(record))]]);
    const presentation = buildWhatMattersPilotPresentation({ rankingResult: ranking, decisionStates: new Map(), actionabilityEvaluationsByRecordId: evaluations, recommendationPolicy: recommendationPolicy(), evaluatedAt });
    expect(presentation.result.kind).toBe("actionable");
    if (presentation.result.kind === "actionable") expect(presentation.result.candidate.economicRank).toBe(1);
  });

  it("2. rank 1 rainfall <70, rank 2 actionable -> rank 2 selected, economicRank preserved as 2 (not relabelled 1)", () => {
    const ranking = rankedResult();
    const [top, second] = ranking.ranked;
    const topRecord = top.recordId === record1.id ? record1 : record2;
    const secondRecord = second.recordId === record1.id ? record1 : record2;
    const evaluations = new Map([
      [top.recordId, evaluation(topRecord, foundationFor(topRecord), rainfallScoreFor(topRecord, "64"), allClearDeclarations(topRecord))],
      [second.recordId, evaluation(secondRecord, foundationFor(secondRecord), rainfallScoreFor(secondRecord, "86"), allClearDeclarations(secondRecord))],
    ]);
    const presentation = buildWhatMattersPilotPresentation({ rankingResult: ranking, decisionStates: new Map(), actionabilityEvaluationsByRecordId: evaluations, recommendationPolicy: recommendationPolicy(), evaluatedAt });
    expect(presentation.result.kind).toBe("actionable");
    if (presentation.result.kind === "actionable") {
      expect(presentation.result.candidate.recordId).toBe(second.recordId);
      expect(presentation.result.candidate.economicRank).toBe(2);
    }
  });

  it("3. rank 1 rainfall >=70 but trafficability UNKNOWN -> no recommendation from rank 1 until resolved", () => {
    const ranking = rankOpportunities([record1], new Map(), rankingPolicy(), "2026-09-25T02:00:00.000Z");
    const top = ranking.ranked[0];
    const evaluations = new Map([[top.recordId, evaluation(record1, foundationFor(record1), rainfallScoreFor(record1, "86"), [decl(record1, CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, true), decl(record1, CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, true)])]]);
    const presentation = buildWhatMattersPilotPresentation({ rankingResult: ranking, decisionStates: new Map(), actionabilityEvaluationsByRecordId: evaluations, recommendationPolicy: recommendationPolicy(), evaluatedAt });
    expect(presentation.result.kind).toBe("needs_confirmation");
    if (presentation.result.kind === "needs_confirmation") expect(presentation.result.requiredConfirmations).toEqual([CONFIRM_FIELD_TRAFFICABLE]);
  });

  it("4. farmer confirms trafficable -> real verified ACTIONABLE path", () => {
    const ranking = rankOpportunities([record1], new Map(), rankingPolicy(), "2026-09-25T02:00:00.000Z");
    const top = ranking.ranked[0];
    const evaluations = new Map([[top.recordId, evaluation(record1, foundationFor(record1), rainfallScoreFor(record1, "86"), allClearDeclarations(record1))]]);
    const presentation = buildWhatMattersPilotPresentation({ rankingResult: ranking, decisionStates: new Map(), actionabilityEvaluationsByRecordId: evaluations, recommendationPolicy: recommendationPolicy(), evaluatedAt });
    expect(presentation.result.kind).toBe("actionable");
  });

  it("5. farmer says not trafficable -> NOT_ACTIONABLE", () => {
    const ranking = rankOpportunities([record1], new Map(), rankingPolicy(), "2026-09-25T02:00:00.000Z");
    const top = ranking.ranked[0];
    const declarations = [decl(record1, CONFIRM_FIELD_TRAFFICABLE, false), decl(record1, CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, true), decl(record1, CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, true)];
    const result = evaluation(record1, foundationFor(record1), rainfallScoreFor(record1, "86"), declarations);
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") expect(result.outcome.assessment.state).toBe("not_actionable");
    const evaluations = new Map([[top.recordId, result]]);
    const presentation = buildWhatMattersPilotPresentation({ rankingResult: ranking, decisionStates: new Map(), actionabilityEvaluationsByRecordId: evaluations, recommendationPolicy: recommendationPolicy(), evaluatedAt });
    expect(presentation.result.kind).not.toBe("actionable");
  });

  it("6. authoritative legal blocker + favourable score + farmer OK -> NOT_ACTIONABLE (blocker wins), and presentation reports it as blocked, not actionable", () => {
    const result = evaluation(record1, foundationFor(record1, { spreadingWindowGate: blockedCondition(), aggregateState: "BLOCKED", aggregateReasonCode: "SPREADING_ACTIONABILITY_FOUNDATION_BLOCKED" }), rainfallScoreFor(record1, "95"), allClearDeclarations(record1));
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") {
      expect(result.outcome.assessment.state).toBe("not_actionable");
      expect(result.outcome.assessment.reasonCode).toBe("NOT_ACTIONABLE_REGULATORY_BLOCKER");
    }
    const ranking = rankOpportunities([record1], new Map(), rankingPolicy(), "2026-09-25T02:00:00.000Z");
    const presentation = buildWhatMattersPilotPresentation({ rankingResult: ranking, decisionStates: new Map(), actionabilityEvaluationsByRecordId: new Map([[record1.id, result]]), recommendationPolicy: recommendationPolicy(), evaluatedAt });
    expect(presentation.result.kind).toBe("blocked");
    if (presentation.result.kind === "blocked") expect(presentation.result.reasonCode).toBe("NOT_CURRENTLY_ACTIONABLE");
  });

  it("7. wrong-field declaration -> rejected, and presentation asks the real question rather than showing actionable", () => {
    const wrongField = decl(record2, CONFIRM_FIELD_TRAFFICABLE, true);
    const result = evaluation(record1, foundationFor(record1), rainfallScoreFor(record1, "86"), [wrongField, decl(record1, CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, true), decl(record1, CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, true)]);
    expect(result.requiredConfirmations).toEqual([CONFIRM_FIELD_TRAFFICABLE]);
    const ranking = rankOpportunities([record1], new Map(), rankingPolicy(), "2026-09-25T02:00:00.000Z");
    const presentation = buildWhatMattersPilotPresentation({ rankingResult: ranking, decisionStates: new Map(), actionabilityEvaluationsByRecordId: new Map([[record1.id, result]]), recommendationPolicy: recommendationPolicy(), evaluatedAt });
    expect(presentation.result.kind).toBe("needs_confirmation");
    if (presentation.result.kind === "needs_confirmation") expect(presentation.result.requiredConfirmations).toEqual([CONFIRM_FIELD_TRAFFICABLE]);
  });

  it("8. wrong-assessment declaration -> rejected, and presentation asks the real question rather than showing actionable", () => {
    const stale = decl(record1, CONFIRM_FIELD_TRAFFICABLE, true);
    const staleTarget = { ...stale, boundAssessmentId: "assessment-old" };
    const result = evaluation(record1, foundationFor(record1), rainfallScoreFor(record1, "86"), [staleTarget, decl(record1, CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, true), decl(record1, CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, true)]);
    expect(result.requiredConfirmations).toEqual([CONFIRM_FIELD_TRAFFICABLE]);
    const ranking = rankOpportunities([record1], new Map(), rankingPolicy(), "2026-09-25T02:00:00.000Z");
    const presentation = buildWhatMattersPilotPresentation({ rankingResult: ranking, decisionStates: new Map(), actionabilityEvaluationsByRecordId: new Map([[record1.id, result]]), recommendationPolicy: recommendationPolicy(), evaluatedAt });
    expect(presentation.result.kind).toBe("needs_confirmation");
  });

  it("9. missing weather -> UNKNOWN, and presentation reports honest uncertainty, never 'blocked' (regression: Codex adversarial-review finding, MEDIUM -- this exact case previously collapsed ACTIONABILITY_UNKNOWN into a 'blocked' presentation result)", () => {
    const result = evaluation(record1, foundationFor(record1), rainfallScoreFor(record1, null), allClearDeclarations(record1));
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") expect(result.outcome.assessment.state).toBe("unknown");
    expect(result.requiredConfirmations).toEqual([]); // no physical-condition question pending -- the score itself is what's unresolved
    const ranking = rankOpportunities([record1], new Map(), rankingPolicy(), "2026-09-25T02:00:00.000Z");
    const presentation = buildWhatMattersPilotPresentation({ rankingResult: ranking, decisionStates: new Map(), actionabilityEvaluationsByRecordId: new Map([[record1.id, result]]), recommendationPolicy: recommendationPolicy(), evaluatedAt });
    expect(presentation.result.kind).toBe("unknown");
  });

  it("10. score exactly 70 -> rainfall policy passes, and presentation selects it as actionable", () => {
    const result = evaluation(record1, foundationFor(record1), rainfallScoreFor(record1, MINIMUM_RAINFALL_WINDOW_SCORE), allClearDeclarations(record1));
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") expect(result.outcome.assessment.state).toBe("actionable");
    const ranking = rankOpportunities([record1], new Map(), rankingPolicy(), "2026-09-25T02:00:00.000Z");
    const presentation = buildWhatMattersPilotPresentation({ rankingResult: ranking, decisionStates: new Map(), actionabilityEvaluationsByRecordId: new Map([[record1.id, result]]), recommendationPolicy: recommendationPolicy(), evaluatedAt });
    expect(presentation.result.kind).toBe("actionable");
  });

  it("presentation snapshot: mutating the caller's evaluations map after building a presentation does not alter the already-returned candidateActionability (regression: Codex adversarial-review finding, MEDIUM)", () => {
    const ranking = rankOpportunities([record1], new Map(), rankingPolicy(), "2026-09-25T02:00:00.000Z");
    const mutableEvaluations = new Map([[record1.id, evaluation(record1, foundationFor(record1), rainfallScoreFor(record1, "86"), allClearDeclarations(record1))]]);
    const presentation = buildWhatMattersPilotPresentation({ rankingResult: ranking, decisionStates: new Map(), actionabilityEvaluationsByRecordId: mutableEvaluations, recommendationPolicy: recommendationPolicy(), evaluatedAt });
    const before = presentation.candidateActionability.get(record1.id);
    mutableEvaluations.set(record1.id, evaluation(record1, foundationFor(record1), rainfallScoreFor(record1, null), allClearDeclarations(record1)));
    mutableEvaluations.delete(record1.id);
    expect(presentation.candidateActionability.get(record1.id)).toBe(before);
    expect(presentation.candidateActionability.size).toBe(1);
  });

  it("presentation binding: an evaluation stored under the wrong record key is never trusted for that candidate's farmer questions (regression: Codex adversarial-review finding, MEDIUM)", () => {
    const ranking = rankOpportunities([record1], new Map(), rankingPolicy(), "2026-09-25T02:00:00.000Z");
    // A real, internally-valid evaluation -- but bound to record2's identity,
    // stored under record1's map key. Its own embedded assessment therefore
    // does NOT describe record1, even though the map key claims it does.
    const misboundEvaluation = evaluation(record2, foundationFor(record2), rainfallScoreFor(record2, "86"), [decl(record2, CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, true), decl(record2, CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, true)]);
    expect(misboundEvaluation.requiredConfirmations).toEqual([CONFIRM_FIELD_TRAFFICABLE]);
    const presentation = buildWhatMattersPilotPresentation({ rankingResult: ranking, decisionStates: new Map(), actionabilityEvaluationsByRecordId: new Map([[record1.id, misboundEvaluation]]), recommendationPolicy: recommendationPolicy(), evaluatedAt });
    // Phase 10's own binding check already rejects this for selection
    // (record1's real assessment does not match), so it can never become
    // "actionable"; the presentation-layer fix additionally ensures the
    // mismatched evaluation's requiredConfirmations are never surfaced as
    // if they belonged to record1.
    expect(presentation.result.kind).not.toBe("actionable");
    if (presentation.result.kind === "needs_confirmation") {
      throw new Error("must not present record2's farmer question as if it belonged to record1");
    }
  });

  it("real audit continuity: the selected recommendation's amount is the exact real economic figure computed by the real science/pricing chain, never re-derived", () => {
    const ranking = rankedResult();
    const top = ranking.ranked[0];
    const record = top.recordId === record1.id ? record1 : record2;
    const sourceAssessment = record.id === record1.id ? rankOneAssessment : rankTwoAssessment;
    const evaluations = new Map([[top.recordId, evaluation(record, foundationFor(record), rainfallScoreFor(record, "86"), allClearDeclarations(record))]]);
    const presentation = buildWhatMattersPilotPresentation({ rankingResult: ranking, decisionStates: new Map(), actionabilityEvaluationsByRecordId: evaluations, recommendationPolicy: recommendationPolicy(), evaluatedAt });
    expect(presentation.result.kind).toBe("actionable");
    if (presentation.result.kind === "actionable" && sourceAssessment.netEconomicResult.amount.status === "OK") {
      expect(presentation.result.candidate.amount).toEqual(sourceAssessment.netEconomicResult.amount.value);
    }
  });
});
