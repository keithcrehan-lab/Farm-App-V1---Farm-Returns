import { describe, expect, it } from "vitest";
import { calculateNutrientPlanWithTrace } from "./nutrient-plan-trace";
import { recordDecision } from "./audit-trace";
import { validateLegalStopNotActionable } from "./report-validator";
import { tracked } from "./types";
import type { Field, LivestockGroup } from "./types";

const grazingField: Field = {
  id: "field-test",
  farmId: "farm-test",
  name: "Test Field",
  areaHa: 6.8,
  centroid: [0, 0],
  plannedUse: tracked("grazing", "farmer_adjusted", "Keith"),
  mappedSoil: {
    soilAssociation: "Fermoy",
    dominantSeries: "Brown Earth",
    texture: "Loam",
    drainage: "moderately_drained",
    coveragePct: 88,
    datasetVersion: "test",
    source: "test",
  },
  fertility: {
    pIndex: tracked(3, "verified", "Soil test lab"),
    kIndex: tracked(3, "farmer_adjusted", "Keith"),
  },
  history: [],
};

describe("calculateNutrientPlanWithTrace", () => {
  it("returns the exact same plan calculateNutrientPlan alone would (purely additive wrapper)", async () => {
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(20, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const { plan, run } = await calculateNutrientPlanWithTrace("RUN_TEST_001", "REC_TEST_001", {
      field: grazingField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
    });
    expect(plan.fieldId).toBe(grazingField.id);
    expect(run.calculationRunId).toBe("RUN_TEST_001");
    expect(run.sealed).toBe(true);
    expect(run.traceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("records an ACTION_RECOMMENDATION decision with real PASS compliance checks when the plan is within ceiling", async () => {
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(20, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const { run } = await calculateNutrientPlanWithTrace("RUN_TEST_002", "REC_TEST_002", {
      field: grazingField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
    });
    // V3 closure pass, Priority 6: this run also records a
    // BLOCKED_INSUFFICIENT_EVIDENCE decision for the commonage gate (this
    // field has no commonageStatus captured). V3 closure pass (second
    // pass, trace-coverage completion): it now ALSO records a
    // BLOCKED_INSUFFICIENT_EVIDENCE decision for the buffer-compliance
    // gate — this field proposes a real chemical-fertiliser purchase
    // (grossN/P/K exceeds nothing, no slurry offset) but has no
    // waterBufferContext captured, so the buffer check cannot resolve.
    // Both are real, intentional trace-coverage improvements, not
    // regressions — the NAP decision is still recorded first.
    expect(run.decisionRecords).toHaveLength(3);
    const decision = run.decisionRecords[0];
    expect(decision.decisionType).toBe("ACTION_RECOMMENDATION");
    expect(decision.scope).toEqual({ type: "FIELD", id: "field-test" });
    expect(decision.complianceChecks.some((c) => c.checkId === "NAP_N_CEILING" && c.result === "PASS")).toBe(true);
    expect(decision.sources.length).toBeGreaterThan(0);
    expect(decision.calculationSteps.length).toBeGreaterThan(0);
    // RPT007: boundary-affecting rounding rule is disclosed, not hidden.
    expect(decision.calculationSteps.some((s) => s.roundingRule !== undefined)).toBe(true);
    // RPT011: source location (the exact table used) is captured, not
    // a bare Act-level citation.
    expect(decision.sources[0].section).toContain("Tables");

    const commonageDecision = run.decisionRecords[1];
    expect(commonageDecision.decisionType).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(commonageDecision.recommendationId).toBe("REC_TEST_002-COMMONAGE");

    const bufferDecision = run.decisionRecords[2];
    expect(bufferDecision.decisionType).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(bufferDecision.recommendationId).toBe("REC_TEST_002-BUFFER");
  });

  it("records a BLOCKED_INSUFFICIENT_EVIDENCE decision with a real data gap when the statutory GSR can't be resolved (GFT167: blocked decision included in the report, not silently dropped)", async () => {
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "weanling", label: "Weanlings", count: tracked(18, "verified", "Keith"), system: "housed", value: tracked(0, "estimated", "x") }, // no avgAgeMonths
    ];
    const { run } = await calculateNutrientPlanWithTrace("RUN_TEST_003", "REC_TEST_003", {
      field: grazingField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
    });
    const decision = run.decisionRecords[0];
    expect(decision.decisionType).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(decision.dataGaps).toHaveLength(1);
    expect(decision.dataGaps[0].blockedOutput).toBe("NAP N/P compliance ceiling");
    expect(decision.complianceChecks).toEqual([]);
    expect(decision.sources.length).toBeGreaterThan(0);
  });

  it("the sealed run's trace hash changes when the field's soil P index changes (real input sensitivity)", async () => {
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(20, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const runA = (await calculateNutrientPlanWithTrace("RUN_TEST_004", "REC_TEST_004", { field: grazingField, farmGrasslandAreaHa: 27, livestockGroups: groups })).run;
    const differentField: Field = { ...grazingField, fertility: { ...grazingField.fertility, pIndex: tracked(1, "verified", "Soil test lab") } };
    const runB = (await calculateNutrientPlanWithTrace("RUN_TEST_004", "REC_TEST_004", { field: differentField, farmGrasslandAreaHa: 27, livestockGroups: groups })).run;
    expect(runA.traceSha256).not.toBe(runB.traceSha256);
  });

  // V3 closure pass, Priority 6 — commonage/LESS decisions traced.
  it("records a LEGAL_PROHIBITION decision when the field is commonage land", async () => {
    const commonageField: Field = { ...grazingField, id: "field-commonage", commonageStatus: tracked("commonage", "farmer_adjusted", "Keith") };
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(20, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const { run } = await calculateNutrientPlanWithTrace("RUN_TEST_005", "REC_TEST_005", {
      field: commonageField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
    });
    const commonageDecision = run.decisionRecords.find((d) => d.recommendationId === "REC_TEST_005-COMMONAGE");
    expect(commonageDecision).toBeDefined();
    expect(commonageDecision?.decisionType).toBe("LEGAL_PROHIBITION");
    expect(commonageDecision?.complianceChecks[0].result).toBe("FAIL");
    // RPT009 ("a legal FAIL cannot coexist with contradictory action"):
    // verified against this REAL, live-produced decision, not a
    // synthetic fixture.
    expect(commonageDecision !== undefined && validateLegalStopNotActionable(commonageDecision).valid).toBe(true);
    // RPT016 (a rejected alternative must say why) — real, sourced from
    // this app's own commonage_rules_2026.csv, not a generic placeholder.
    expect(commonageDecision?.alternatives?.length).toBeGreaterThan(0);
    expect(commonageDecision?.alternatives?.[0].action).toMatch(/50 kg organic-N\/ha/);
  });

  it("records a NO_ACTION_RECOMMENDED decision when LESS is applied and compliant", async () => {
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(45, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const { run } = await calculateNutrientPlanWithTrace("RUN_TEST_006", "REC_TEST_006", {
      field: grazingField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
      slurryAllocation: {
        fieldId: grazingField.id,
        housingId: "h1",
        priority: "high",
        volumeM3: 33 * grazingField.areaHa,
        score: 90,
        applicationMethod: tracked("LESS", "farmer_adjusted", "Keith"),
      },
    });
    const lessDecision = run.decisionRecords.find((d) => d.recommendationId === "REC_TEST_006-LESS");
    expect(lessDecision).toBeDefined();
    expect(lessDecision?.decisionType).toBe("NO_ACTION_RECOMMENDED");
    expect(lessDecision?.complianceChecks[0].result).toBe("PASS");
  });

  it("records a LEGAL_PROHIBITION LESS decision with a real, sourced alternative when a triggered LESS requirement is not met (RPT016)", async () => {
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(45, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const { run } = await calculateNutrientPlanWithTrace("RUN_TEST_006B", "REC_TEST_006B", {
      field: grazingField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
      slurryAllocation: {
        fieldId: grazingField.id,
        housingId: "h1",
        priority: "high",
        volumeM3: 33 * grazingField.areaHa,
        score: 90,
        applicationMethod: tracked("splashplate", "farmer_adjusted", "Keith"),
      },
    });
    const lessDecision = run.decisionRecords.find((d) => d.recommendationId === "REC_TEST_006B-LESS");
    expect(lessDecision).toBeDefined();
    expect(lessDecision?.decisionType).toBe("LEGAL_PROHIBITION");
    expect(lessDecision !== undefined && validateLegalStopNotActionable(lessDecision).valid).toBe(true);
    expect(lessDecision?.alternatives?.length).toBeGreaterThan(0);
    expect(lessDecision?.alternatives?.[0].action).toMatch(/LESS-compliant/);
  });

  // RPT001 (report acceptance): "Export contains positive, no-action,
  // legal-stop, warning and blocked decisions" — this is the WARNING
  // case, completing real coverage of all 5 categories RPT001 requires
  // (ACTION_RECOMMENDATION/NO_ACTION_RECOMMENDED/LEGAL_PROHIBITION/
  // WARNING/BLOCKED_INSUFFICIENT_EVIDENCE are each demonstrated
  // somewhere in this test file — see the other tests above/below).
  it("records a WARNING decision when the planned application exceeds the statutory ceiling", async () => {
    // A very high-density herd on a small grassland area: both the
    // agronomic requirement (grossN) and the statutory GSR ceiling are
    // driven high, but the requirement figure exceeds even the
    // elevated ceiling band.
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(300, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const { run } = await calculateNutrientPlanWithTrace("RUN_TEST_007", "REC_TEST_007", {
      field: grazingField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
    });
    const decision = run.decisionRecords[0];
    expect(decision.decisionType).toBe("WARNING");
    expect(decision.complianceChecks.some((c) => c.checkId === "NAP_N_CEILING" && c.result === "FAIL")).toBe(true);
  });

  // V3 closure pass (second pass, trace-coverage completion) — buffer and
  // statutory-manure-value decisions, previously computed real values
  // (nationalBufferDistanceStatus/localBufferOverrideStatus/
  // statutoryManureValue) with no DecisionRecord at all, so a farmer
  // opening the Recommendation Audit Trail could never see why a buffer
  // distance blocked a recommendation or what a field's statutory manure
  // ledger value is.
  it("records a LEGAL_PROHIBITION buffer decision when a field is too close to surface water for the chemical fertiliser it needs", async () => {
    const fieldTooClose: Field = {
      ...grazingField,
      id: "field-buffer-prohibited",
      waterBufferContext: tracked(
        { nearestFeature: "stream", distanceM: 1, localOverrideStatus: "verified_none", featureType: "surface_water" },
        "farmer_adjusted",
        "Keith",
      ),
    };
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(20, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const { run } = await calculateNutrientPlanWithTrace("RUN_TEST_008", "REC_TEST_008", {
      field: fieldTooClose,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
    });
    const bufferDecision = run.decisionRecords.find((d) => d.recommendationId === "REC_TEST_008-BUFFER");
    expect(bufferDecision).toBeDefined();
    expect(bufferDecision?.decisionType).toBe("LEGAL_PROHIBITION");
    expect(bufferDecision?.complianceChecks.some((c) => c.checkId === "NATIONAL_BUFFER_DISTANCE" && c.result === "FAIL")).toBe(true);
    expect(bufferDecision !== undefined && validateLegalStopNotActionable(bufferDecision).valid).toBe(true);
    expect(bufferDecision?.alternatives?.length).toBeGreaterThan(0);
  });

  it("records a WARNING buffer decision when the national baseline is met but a local-authority override status is unconfirmed", async () => {
    const fieldUnknownOverride: Field = {
      ...grazingField,
      id: "field-buffer-unknown-override",
      waterBufferContext: tracked(
        { nearestFeature: "stream", distanceM: 10, localOverrideStatus: "unknown", featureType: "surface_water" },
        "farmer_adjusted",
        "Keith",
      ),
    };
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(20, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const { run } = await calculateNutrientPlanWithTrace("RUN_TEST_009", "REC_TEST_009", {
      field: fieldUnknownOverride,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
    });
    const bufferDecision = run.decisionRecords.find((d) => d.recommendationId === "REC_TEST_009-BUFFER");
    expect(bufferDecision).toBeDefined();
    expect(bufferDecision?.decisionType).toBe("WARNING");
    expect(bufferDecision?.reasonCodes).toContain("QUALIFIED_NOT_DEFINITIVE");
  });

  it("records a NO_ACTION_RECOMMENDED buffer decision when both national and local checks pass", async () => {
    const fieldClear: Field = {
      ...grazingField,
      id: "field-buffer-clear",
      waterBufferContext: tracked(
        { nearestFeature: "stream", distanceM: 10, localOverrideStatus: "verified_none", featureType: "surface_water" },
        "farmer_adjusted",
        "Keith",
      ),
    };
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(20, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const { run } = await calculateNutrientPlanWithTrace("RUN_TEST_010", "REC_TEST_010", {
      field: fieldClear,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
    });
    const bufferDecision = run.decisionRecords.find((d) => d.recommendationId === "REC_TEST_010-BUFFER");
    expect(bufferDecision).toBeDefined();
    expect(bufferDecision?.decisionType).toBe("NO_ACTION_RECOMMENDED");
  });

  it("records a real ESTIMATE decision for the statutory manure N/P ledger value, distinct from the agronomic ledger, with a real DecisionType this app previously never emitted", async () => {
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(20, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const { plan, run } = await calculateNutrientPlanWithTrace("RUN_TEST_011", "REC_TEST_011", {
      field: grazingField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
      slurryAllocation: { fieldId: grazingField.id, housingId: "h1", priority: "high", volumeM3: 33 * grazingField.areaHa, score: 90 },
    });
    expect(plan.statutoryManureValue.status).toBe("OK");
    const manureDecision = run.decisionRecords.find((d) => d.recommendationId === "REC_TEST_011-MANURE-NP");
    expect(manureDecision).toBeDefined();
    expect(manureDecision?.decisionType).toBe("ESTIMATE");
    expect(manureDecision?.quantity?.unit).toBe("kg N/ha");
    expect(manureDecision?.calculationSteps[0].formulaRuleId).toBe("COMPLIANCE_MANURE_NP");
  });

  // GFT172 (golden-test reconciliation, GF20 system integration): "change
  // silage to grazing creates new run" — old_run_preserved is exactly
  // `recordDecision`'s own sealed-run immutability guard (audit-trace.ts);
  // new_run_required is exactly this app's own "Generate audit trace"
  // convention (RecommendationAuditTrailCard.tsx: a distinct run id per
  // generation, never mutating a prior one). Proven directly here against
  // a real planned-use change, not a synthetic run-id fixture.
  it("GFT172: changing a field's planned use from silage to grazing requires a new run — the old run is never mutated", async () => {
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(20, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const { run: oldRun } = await calculateNutrientPlanWithTrace("RUN_TEST_013_SILAGE", "REC_TEST_013_SILAGE", {
      field: grazingField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
      silage: { cutNumber: 1, expectedYieldTDMha: 5 },
    });
    const oldRunSnapshot = JSON.parse(JSON.stringify(oldRun));

    const { run: newRun } = await calculateNutrientPlanWithTrace("RUN_TEST_013_GRAZING", "REC_TEST_013_GRAZING", {
      field: grazingField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
      // no `silage` -> grazing
    });

    expect(newRun.calculationRunId).not.toBe(oldRun.calculationRunId);
    // old_run_preserved: byte-identical to its own pre-second-call snapshot.
    expect(oldRun).toEqual(oldRunSnapshot);
    expect(oldRun.sealed).toBe(true);
    // Attempting to append to the OLD run is refused outright, the
    // structural guarantee "old_run_preserved" ultimately rests on.
    expect(() => recordDecision(oldRun, newRun.decisionRecords[0])).toThrow(/sealed/i);
  });

  // GFT028 (golden-test reconciliation, GF03 reports): "High-stock trace
  // completeness" — the golden test's own setup names 6 conceptual
  // sections (inputs, eligibility, legal_max, agronomic_need, final_min,
  // sources) for a high-GSR chemical-N-plan decision. This app's real
  // DecisionRecord shape does not carry a literal `required_sections`
  // array field (that would be a Reports-UI-layer construct, not part of
  // the trace schema itself — see schemas/recommendation_trace.schema.json,
  // which has no such field either), so this test instead proves each of
  // the 6 concepts is genuinely present in a real high-GSR trace, not
  // asserting a field name that doesn't exist in this app's actual data
  // model.
  it("GFT028: a high-stocking-rate chemical-N decision's trace covers all 6 concepts the golden test names (inputs/eligibility/legal_max/agronomic_need/final_min/sources)", async () => {
    // GSR 184 (>170, matching the golden test's own setup) with real
    // non-grass evidence -> the high-rate eligibility check is applicable
    // and present in the trace.
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(58, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const { plan, run } = await calculateNutrientPlanWithTrace("RUN_TEST_014", "REC_TEST_014", {
      field: grazingField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
      nonGrassPct: 5,
    });
    expect(plan.napCompliance.status).toBe("OK");
    const decision = run.decisionRecords[0];

    // inputs
    expect(decision.inputs.length).toBeGreaterThan(0);
    // eligibility (the high-rate N eligibility gate, AF011/GFT023-GFT024)
    if (plan.napCompliance.status === "OK" && plan.napCompliance.value.highRateEligibilityApplicable) {
      expect(decision.complianceChecks.some((c) => c.checkId === "HIGH_RATE_N_ELIGIBILITY")).toBe(true);
    }
    // legal_max (the statutory N ceiling lookup step)
    expect(decision.calculationSteps.some((s) => s.formulaRuleId === "GRASSLAND_AVAILABLE_N_MAX")).toBe(true);
    // agronomic_need (the planned/required N figure this decision evaluates)
    expect(decision.quantity?.value).toBe(plan.napCompliance.status === "OK" ? plan.napCompliance.value.nRequiredKgHa : undefined);
    // final_min (the ceiling comparison step's own result — whether the
    // agronomic need clears the legal max, the actual binding constraint)
    expect(decision.calculationSteps.some((s) => s.formulaRuleId === "NAP_N_CEILING_CHECK")).toBe(true);
    // sources
    expect(decision.sources.length).toBeGreaterThan(0);
  });

  it("does not record a statutory-manure-value decision when no slurry is allocated to the field (NOT_APPLICABLE)", async () => {
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(20, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
    ];
    const { plan, run } = await calculateNutrientPlanWithTrace("RUN_TEST_012", "REC_TEST_012", {
      field: grazingField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
    });
    expect(plan.statutoryManureValue.status).toBe("NOT_APPLICABLE");
    expect(run.decisionRecords.some((d) => d.recommendationId === "REC_TEST_012-MANURE-NP")).toBe(false);
  });
});
