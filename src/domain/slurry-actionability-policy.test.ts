import { describe, expect, it } from "vitest";
import { ok, blockedInsufficientEvidence } from "./evidence";
import type { SpreadingActionabilityFoundationAssessment, FoundationCondition } from "./spreading-actionability-foundation";
import type { RainfallWindowScoreAssessment } from "./rainfall-window-score";
import {
  evaluateSlurryActionability,
  createFarmerDeclarationEvidence,
  validateFarmerDeclarationBinding,
  CONFIRM_FIELD_TRAFFICABLE,
  CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER,
  CONFIRM_NOT_FROZEN_OR_SNOW_COVERED,
  MINIMUM_RAINFALL_WINDOW_SCORE,
  type FarmerDeclarationEvidence,
  type FarmerConfirmationCode,
} from "./slurry-actionability-policy";

const target = { opportunityRecordId: "record-1", boundAssessmentId: "assessment-1", evaluatedActionId: "action-1", fieldId: "field-1" };
const evaluatedAt = "2026-02-15T09:00:00.000Z";

function passCondition(): FoundationCondition {
  return { state: "PASS", outcome: ok("x", "DERIVED"), source: "test", ruleVersion: "1.0.0" };
}
function blockedCondition(): FoundationCondition {
  return { state: "BLOCKED", outcome: blockedInsufficientEvidence("X", []), source: "test", ruleVersion: "1.0.0" };
}

function foundation(overrides: Partial<SpreadingActionabilityFoundationAssessment> = {}): SpreadingActionabilityFoundationAssessment {
  return {
    id: "foundation-1",
    engineVersion: "spreading_actionability_foundation_v1.0.0",
    opportunityRecordId: target.opportunityRecordId,
    boundAssessmentId: target.boundAssessmentId,
    evaluatedActionId: target.evaluatedActionId,
    fieldId: target.fieldId,
    fieldCentroid: [0, 0],
    proposedMaterial: "organic_fertiliser_other_than_FYM",
    evaluatedAt,
    spreadingWindowGate: passCondition(),
    bufferCompliance: passCondition(),
    commonageCompliance: passCondition(),
    rainfallObservation: { availability: "AVAILABLE", source: "test", sourceTimestamp: evaluatedAt, fieldCentroid: [0, 0], limitations: [] },
    rainfallForecast: { availability: "AVAILABLE", source: "test", sourceTimestamp: evaluatedAt, fieldCentroid: [0, 0], limitations: [] },
    smdEvidence: { availability: "UNKNOWN", reasonCode: "SOURCE_UNAVAILABLE", detail: "no source" },
    soilTemperatureEvidence: { availability: "UNKNOWN", reasonCode: "SOURCE_UNAVAILABLE", detail: "no source" },
    aggregateState: "UNKNOWN",
    aggregateReasonCode: "SPREADING_ACTIONABILITY_FOUNDATION_EVIDENCE_INCOMPLETE",
    limitations: [],
    ...overrides,
  };
}

function rainfallScore(finalScore: string | null, overrides: Partial<RainfallWindowScoreAssessment> = {}): RainfallWindowScoreAssessment {
  return {
    id: "score-1",
    modelVersion: "rainfall_window_score_ie_v1.0.0",
    opportunityRecordId: target.opportunityRecordId,
    boundAssessmentId: target.boundAssessmentId,
    evaluatedActionId: target.evaluatedActionId,
    fieldId: target.fieldId,
    fieldCentroid: [0, 0],
    evaluatedAt,
    historicalWindow: { start: evaluatedAt, end: evaluatedAt },
    forecastWindow: { start: evaluatedAt, end: evaluatedAt },
    historicalEvidence: { availability: "AVAILABLE", totalMm: "5", source: "test", windowStart: evaluatedAt, windowEnd: evaluatedAt, observationCount: 72, expectedObservationCount: 72, fieldCentroid: [0, 0], limitations: [] } as never,
    forecastEvidence: { availability: "AVAILABLE", totalMm: "5", source: "test", windowStart: evaluatedAt, windowEnd: evaluatedAt, pointCount: 48, fieldCentroid: [0, 0], limitations: [] } as never,
    score:
      finalScore === null
        ? blockedInsufficientEvidence("RAINFALL_WINDOW_SCORE_INCOMPLETE_EVIDENCE", ["test"])
        : ok(
            {
              modelVersion: "rainfall_window_score_ie_v1.0.0",
              finalScore,
              historicalTotalMm: "5",
              historicalSubscore: "90",
              historicalWeight: "0.40",
              historicalContribution: "36",
              forecastTotalMm: "5",
              forecastSubscore: "85",
              forecastWeight: "0.60",
              forecastContribution: "51",
            },
            "DERIVED",
          ),
    limitations: [],
    ...overrides,
  };
}

function declaration(code: FarmerConfirmationCode, value: boolean, overrides: Partial<FarmerDeclarationEvidence> = {}): FarmerDeclarationEvidence {
  const outcome = createFarmerDeclarationEvidence({
    id: `decl-${code}`,
    opportunityRecordId: target.opportunityRecordId,
    boundAssessmentId: target.boundAssessmentId,
    evaluatedActionId: target.evaluatedActionId,
    fieldId: target.fieldId,
    conditionCode: code,
    value,
    declaredAt: evaluatedAt,
    evaluatedAt,
  });
  if (outcome.status !== "OK") throw new Error("fixture declaration should always be valid");
  return { ...outcome.declaration, ...overrides };
}

function allClearDeclarations(): FarmerDeclarationEvidence[] {
  return [declaration(CONFIRM_FIELD_TRAFFICABLE, true), declaration(CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, true), declaration(CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, true)];
}

describe("evaluateSlurryActionability", () => {
  it("all conditions clear → ACTIONABLE", () => {
    const result = evaluateSlurryActionability({ id: "eval-1", ...target, evaluatedAt, foundation: foundation(), rainfallScore: rainfallScore("86.4"), farmerDeclarations: allClearDeclarations() });
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") expect(result.outcome.assessment.state).toBe("actionable");
    expect(result.requiredConfirmations).toEqual([]);
  });

  it("regulatory BLOCKED wins over favourable score and farmer OK (scenario 6)", () => {
    const result = evaluateSlurryActionability({
      id: "eval-1",
      ...target,
      evaluatedAt,
      foundation: foundation({ spreadingWindowGate: blockedCondition() }),
      rainfallScore: rainfallScore("95"),
      farmerDeclarations: allClearDeclarations(),
    });
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") {
      expect(result.outcome.assessment.state).toBe("not_actionable");
      expect(result.outcome.assessment.reasonCode).toBe("NOT_ACTIONABLE_REGULATORY_BLOCKER");
    }
  });

  it("rainfall score exactly at threshold (70) passes", () => {
    const result = evaluateSlurryActionability({ id: "eval-1", ...target, evaluatedAt, foundation: foundation(), rainfallScore: rainfallScore(MINIMUM_RAINFALL_WINDOW_SCORE), farmerDeclarations: allClearDeclarations() });
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") expect(result.outcome.assessment.state).not.toBe("not_actionable");
  });

  it("rainfall score just below threshold (69.999) is NOT_ACTIONABLE", () => {
    const result = evaluateSlurryActionability({ id: "eval-1", ...target, evaluatedAt, foundation: foundation(), rainfallScore: rainfallScore("69.999"), farmerDeclarations: allClearDeclarations() });
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") {
      expect(result.outcome.assessment.state).toBe("not_actionable");
      expect(result.outcome.assessment.reasonCode).toBe("NOT_ACTIONABLE_RAINFALL_WINDOW_BELOW_THRESHOLD");
    }
  });

  it("missing weather → rainfall score blocked → overall UNKNOWN (scenario 9)", () => {
    const result = evaluateSlurryActionability({ id: "eval-1", ...target, evaluatedAt, foundation: foundation(), rainfallScore: rainfallScore(null), farmerDeclarations: allClearDeclarations() });
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") expect(result.outcome.assessment.state).toBe("unknown");
  });

  it("favourable regulatory+rainfall but trafficability UNKNOWN → overall UNKNOWN, only that condition requested (scenario 3)", () => {
    const result = evaluateSlurryActionability({
      id: "eval-1",
      ...target,
      evaluatedAt,
      foundation: foundation(),
      rainfallScore: rainfallScore("86"),
      farmerDeclarations: [declaration(CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, true), declaration(CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, true)],
    });
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") expect(result.outcome.assessment.state).toBe("unknown");
    expect(result.requiredConfirmations).toEqual([CONFIRM_FIELD_TRAFFICABLE]);
  });

  it("farmer confirms trafficable (after prior unknown) with all else clear → ACTIONABLE (scenario 4)", () => {
    const result = evaluateSlurryActionability({ id: "eval-1", ...target, evaluatedAt, foundation: foundation(), rainfallScore: rainfallScore("86"), farmerDeclarations: allClearDeclarations() });
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") expect(result.outcome.assessment.state).toBe("actionable");
  });

  it("farmer says not trafficable → NOT_ACTIONABLE (scenario 5)", () => {
    const result = evaluateSlurryActionability({
      id: "eval-1",
      ...target,
      evaluatedAt,
      foundation: foundation(),
      rainfallScore: rainfallScore("86"),
      farmerDeclarations: [declaration(CONFIRM_FIELD_TRAFFICABLE, false), declaration(CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, true), declaration(CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, true)],
    });
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") {
      expect(result.outcome.assessment.state).toBe("not_actionable");
      expect(result.outcome.assessment.reasonCode).toBe("NOT_ACTIONABLE_FIELD_NOT_TRAFFICABLE");
    }
  });

  it("wrong-field declaration is rejected and treated as absent (scenario 7)", () => {
    const wrongField = declaration(CONFIRM_FIELD_TRAFFICABLE, true, { fieldId: "field-OTHER", opportunityRecordId: "record-OTHER" });
    expect(validateFarmerDeclarationBinding(wrongField, { ...target, evaluatedAt }).valid).toBe(false);
    const result = evaluateSlurryActionability({
      id: "eval-1",
      ...target,
      evaluatedAt,
      foundation: foundation(),
      rainfallScore: rainfallScore("86"),
      farmerDeclarations: [wrongField, declaration(CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, true), declaration(CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, true)],
    });
    expect(result.requiredConfirmations).toEqual([CONFIRM_FIELD_TRAFFICABLE]);
  });

  it("wrong-assessment (stale) declaration is rejected and treated as absent (scenario 8)", () => {
    const stale = declaration(CONFIRM_FIELD_TRAFFICABLE, true, { boundAssessmentId: "assessment-OLD" });
    expect(validateFarmerDeclarationBinding(stale, { ...target, evaluatedAt }).valid).toBe(false);
    const result = evaluateSlurryActionability({
      id: "eval-1",
      ...target,
      evaluatedAt,
      foundation: foundation(),
      rainfallScore: rainfallScore("86"),
      farmerDeclarations: [stale, declaration(CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, true), declaration(CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, true)],
    });
    expect(result.requiredConfirmations).toEqual([CONFIRM_FIELD_TRAFFICABLE]);
  });

  it("mismatched foundation identity is rejected outright", () => {
    const result = evaluateSlurryActionability({ id: "eval-1", ...target, evaluatedAt, foundation: foundation({ fieldId: "field-OTHER" }), rainfallScore: rainfallScore("86"), farmerDeclarations: allClearDeclarations() });
    expect(result.outcome.status).toBe("REJECTED");
  });

  it("stale foundation assessment binding is rejected outright", () => {
    const result = evaluateSlurryActionability({ id: "eval-1", ...target, evaluatedAt, foundation: foundation({ boundAssessmentId: "assessment-OLD" }), rainfallScore: rainfallScore("86"), farmerDeclarations: allClearDeclarations() });
    expect(result.outcome.status).toBe("REJECTED");
  });

  it("a foundation assessment evaluated at a different (older) evaluatedAt is rejected outright, even with identical identities otherwise (regression: Codex adversarial-review finding, HIGH -- time-sensitive regulatory evidence must not answer a later evaluation)", () => {
    const result = evaluateSlurryActionability({ id: "eval-1", ...target, evaluatedAt, foundation: foundation({ evaluatedAt: "2026-02-14T09:00:00.000Z" }), rainfallScore: rainfallScore("86"), farmerDeclarations: allClearDeclarations() });
    expect(result.outcome.status).toBe("REJECTED");
    if (result.outcome.status === "REJECTED") expect(result.outcome.reasonCode).toBe("SLURRY_ACTIONABILITY_FOUNDATION_STALE_EVALUATION_TIME");
  });

  it("a rainfall score evaluated at a different (older) evaluatedAt is rejected outright, even with identical identities otherwise (regression: Codex adversarial-review finding, HIGH -- time-sensitive weather evidence must not answer a later evaluation)", () => {
    const result = evaluateSlurryActionability({ id: "eval-1", ...target, evaluatedAt, foundation: foundation(), rainfallScore: rainfallScore("86", { evaluatedAt: "2026-02-14T09:00:00.000Z" }), farmerDeclarations: allClearDeclarations() });
    expect(result.outcome.status).toBe("REJECTED");
    if (result.outcome.status === "REJECTED") expect(result.outcome.reasonCode).toBe("SLURRY_ACTIONABILITY_RAINFALL_SCORE_STALE_EVALUATION_TIME");
  });

  it("a farmer declaration made for a different (older) evaluatedAt is rejected/treated as absent, even with identical identities otherwise (regression: Codex adversarial-review finding, HIGH -- a declaration binds to a specific evaluation moment, not a rolling validity window)", () => {
    const staleTimeDeclaration = declaration(CONFIRM_FIELD_TRAFFICABLE, true, { evaluatedAt: "2026-02-14T09:00:00.000Z" });
    expect(validateFarmerDeclarationBinding(staleTimeDeclaration, { ...target, evaluatedAt }).valid).toBe(false);
    const result = evaluateSlurryActionability({
      id: "eval-1",
      ...target,
      evaluatedAt,
      foundation: foundation(),
      rainfallScore: rainfallScore("86"),
      farmerDeclarations: [staleTimeDeclaration, declaration(CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, true), declaration(CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, true)],
    });
    expect(result.requiredConfirmations).toEqual([CONFIRM_FIELD_TRAFFICABLE]);
  });

  it("mismatched rainfall-score identity is rejected outright", () => {
    const result = evaluateSlurryActionability({ id: "eval-1", ...target, evaluatedAt, foundation: foundation(), rainfallScore: rainfallScore("86", { fieldId: "field-OTHER" }), farmerDeclarations: allClearDeclarations() });
    expect(result.outcome.status).toBe("REJECTED");
  });

  it("regulatory UNKNOWN (unresolved gate) → overall UNKNOWN, no farmer question generated for it", () => {
    const result = evaluateSlurryActionability({
      id: "eval-1",
      ...target,
      evaluatedAt,
      foundation: foundation({ bufferCompliance: { state: "UNKNOWN", reasonCode: "NO_APPLICATION_GEOMETRY_SUPPLIED" } }),
      rainfallScore: rainfallScore("86"),
      farmerDeclarations: allClearDeclarations(),
    });
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") expect(result.outcome.assessment.state).toBe("unknown");
    expect(result.requiredConfirmations).toEqual([]);
  });

  it("deterministic repeat: identical input produces identical output", () => {
    const input = { id: "eval-1", ...target, evaluatedAt, foundation: foundation(), rainfallScore: rainfallScore("86.4"), farmerDeclarations: allClearDeclarations() };
    const a = evaluateSlurryActionability(input);
    const b = evaluateSlurryActionability(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("only the latest valid declaration for a condition is used", () => {
    const older = declaration(CONFIRM_FIELD_TRAFFICABLE, false, { id: "decl-old", declaredAt: "2026-02-15T07:00:00.000Z" });
    const newer = declaration(CONFIRM_FIELD_TRAFFICABLE, true, { id: "decl-new", declaredAt: "2026-02-15T08:00:00.000Z" });
    const result = evaluateSlurryActionability({
      id: "eval-1",
      ...target,
      evaluatedAt,
      foundation: foundation(),
      rainfallScore: rainfallScore("86"),
      farmerDeclarations: [older, newer, declaration(CONFIRM_NO_VISIBLE_WATERLOGGING_OR_STANDING_WATER, true), declaration(CONFIRM_NOT_FROZEN_OR_SNOW_COVERED, true)],
    });
    expect(result.outcome.status).toBe("OK");
    if (result.outcome.status === "OK") expect(result.outcome.assessment.state).toBe("actionable");
  });
});
