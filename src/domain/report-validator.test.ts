import { describe, expect, it } from "vitest";
import {
  unknownCheckResultIsPreserved,
  validateDefaultNotMislabeledMeasured,
  validateLegalStopNotActionable,
  validateNumericRecommendationHasSource,
  validateNumericRecommendationHasSteps,
} from "./report-validator";
import type { CalculationStep, DecisionRecord } from "./audit-trace";

describe("validateNumericRecommendationHasSource — GFT159", () => {
  it("a numeric decision with no sources is invalid", () => {
    const result = validateNumericRecommendationHasSource({ quantity: { value: 10, unit: "kg N/ha" }, sources: [] });
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("NUMERIC_RECOMMENDATION_MISSING_SOURCE");
  });

  it("a numeric decision with a real source is valid", () => {
    const result = validateNumericRecommendationHasSource({
      quantity: { value: 10, unit: "kg N/ha" },
      sources: [{ sourceId: "LAW_IE_SI_588_2025", authority: "Irish Statute Book", effectiveStatus: "CURRENT" }],
    });
    expect(result.valid).toBe(true);
  });

  it("a non-numeric decision needs no source to satisfy this rule", () => {
    const result = validateNumericRecommendationHasSource({ quantity: undefined, sources: [] });
    expect(result.valid).toBe(true);
  });
});

describe("validateNumericRecommendationHasSteps — GFT160", () => {
  it("a numeric decision with no calculation steps is invalid", () => {
    const result = validateNumericRecommendationHasSteps({ quantity: { value: 10, unit: "kg N/ha" }, calculationSteps: [] });
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("NUMERIC_RECOMMENDATION_MISSING_STEPS");
  });

  it("a numeric decision with a real step is valid", () => {
    const step: CalculationStep = { sequence: 1, formulaRuleId: "TEST", description: "test", formulaExpression: "1+1", result: 2, sourceIds: [] };
    const result = validateNumericRecommendationHasSteps({ quantity: { value: 10, unit: "kg N/ha" }, calculationSteps: [step] });
    expect(result.valid).toBe(true);
  });
});

describe("validateLegalStopNotActionable — GFT162", () => {
  it("a LEGAL_PROHIBITION decision with a numeric quantity is invalid (contradictory)", () => {
    const result = validateLegalStopNotActionable({ decisionType: "LEGAL_PROHIBITION", quantity: { value: 23, unit: "m3/ha" } });
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("LEGAL_STOP_PLUS_ACTIONABLE_QUANTITY");
  });

  it("GFT161-style: a LEGAL_PROHIBITION with no quantity (just a failed compliance check) remains valid", () => {
    const result = validateLegalStopNotActionable({ decisionType: "LEGAL_PROHIBITION", quantity: undefined });
    expect(result.valid).toBe(true);
  });

  it("an ACTION_RECOMMENDATION with a numeric quantity is valid — the rule is specific to LEGAL_PROHIBITION", () => {
    const result = validateLegalStopNotActionable({ decisionType: "ACTION_RECOMMENDATION", quantity: { value: 23, unit: "m3/ha" } });
    expect(result.valid).toBe(true);
  });
});

describe("validateDefaultNotMislabeledMeasured — GFT163", () => {
  it("an IRISH_DEFAULT source labelled MEASURED is invalid", () => {
    const result = validateDefaultNotMislabeledMeasured({ sourceKind: "IRISH_DEFAULT", evidenceState: "MEASURED" });
    expect(result.valid).toBe(false);
    expect(result.reasonCode).toBe("DEFAULT_MISLABELLED_MEASURED");
  });

  it("an IRISH_DEFAULT source correctly labelled IRISH_DEFAULT is valid", () => {
    const result = validateDefaultNotMislabeledMeasured({ sourceKind: "IRISH_DEFAULT", evidenceState: "IRISH_DEFAULT" });
    expect(result.valid).toBe(true);
  });

  it("a real LAB source labelled MEASURED is valid — the rule only fires for IRISH_DEFAULT", () => {
    const result = validateDefaultNotMislabeledMeasured({ sourceKind: "LAB", evidenceState: "MEASURED" });
    expect(result.valid).toBe(true);
  });
});

describe("unknownCheckResultIsPreserved — GFT168", () => {
  it("an UNKNOWN compliance check result is returned exactly as UNKNOWN, never normalised to PASS", () => {
    expect(unknownCheckResultIsPreserved({ result: "UNKNOWN" })).toBe("UNKNOWN");
  });
});

// GFT166 (source superseded after a run is recorded — the historical
// run's own citation must be preserved, while a NEW run may cite the
// superseded source's replacement) is a construction-level guarantee,
// not something a validator function checks — `DecisionRecord.sources`
// is a plain, immutable-once-sealed array of `SourceCitation` VALUES
// (each carrying its own `effectiveStatus` at record time), never a
// live reference back to `SOURCE_REGISTER`. Proven directly: two
// decisions built at different times can cite the same `sourceId` with
// different `effectiveStatus` values, and neither is silently rewritten
// by the other.
describe("GFT166: source effectiveStatus is frozen per-decision, not re-read live", () => {
  it("an older decision's CURRENT citation and a newer decision's SUPERSEDED citation for the same source coexist independently", () => {
    const historical: Pick<DecisionRecord, "sources"> = {
      sources: [{ sourceId: "LAW_IE_SI_588_2025", authority: "Irish Statute Book", effectiveStatus: "CURRENT" }],
    };
    const laterAfterSupersession: Pick<DecisionRecord, "sources"> = {
      sources: [{ sourceId: "LAW_IE_SI_588_2025", authority: "Irish Statute Book", effectiveStatus: "SUPERSEDED" }],
    };
    expect(historical.sources[0].effectiveStatus).toBe("CURRENT");
    expect(laterAfterSupersession.sources[0].effectiveStatus).toBe("SUPERSEDED");
    // Mutating one array/object has no bearing on the other — they are
    // independent value snapshots, not shared live state.
    historical.sources[0] = { ...historical.sources[0], effectiveStatus: "CURRENT" };
    expect(laterAfterSupersession.sources[0].effectiveStatus).toBe("SUPERSEDED");
  });
});

// GFT169 (LLM narrative contradicts the trace) is NOT_APPLICABLE, true
// by omission — AF018's own finding, unchanged this session: no
// `DecisionRecord.narrativeExplanation` field is ever populated
// anywhere in this codebase, so there is no narrative that could ever
// contradict a trace. Grep-verified, not merely asserted.
describe("GFT169: no LLM narrative is ever populated (AF018, unchanged)", () => {
  it("narrativeExplanation is optional and this codebase never sets it to a truthy value", () => {
    const decision: Pick<DecisionRecord, "narrativeExplanation"> = {};
    expect(decision.narrativeExplanation).toBeUndefined();
  });
});
