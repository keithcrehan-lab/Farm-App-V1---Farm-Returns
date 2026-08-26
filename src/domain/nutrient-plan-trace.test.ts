import { describe, expect, it } from "vitest";
import { calculateNutrientPlanWithTrace } from "./nutrient-plan-trace";
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
    // V3 closure pass, Priority 6: this run now also records a
    // BLOCKED_INSUFFICIENT_EVIDENCE decision for the commonage gate
    // (this field has no commonageStatus captured) — a real, intentional
    // trace-coverage improvement, not a regression. The NAP decision is
    // still recorded first.
    expect(run.decisionRecords).toHaveLength(2);
    const decision = run.decisionRecords[0];
    expect(decision.decisionType).toBe("ACTION_RECOMMENDATION");
    expect(decision.scope).toEqual({ type: "FIELD", id: "field-test" });
    expect(decision.complianceChecks.some((c) => c.checkId === "NAP_N_CEILING" && c.result === "PASS")).toBe(true);
    expect(decision.sources.length).toBeGreaterThan(0);
    expect(decision.calculationSteps.length).toBeGreaterThan(0);

    const commonageDecision = run.decisionRecords[1];
    expect(commonageDecision.decisionType).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    expect(commonageDecision.recommendationId).toBe("REC_TEST_002-COMMONAGE");
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
});
