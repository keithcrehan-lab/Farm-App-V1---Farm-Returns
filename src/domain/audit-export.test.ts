import { describe, expect, it } from "vitest";
import { calculateNutrientPlanWithTrace } from "./nutrient-plan-trace";
import {
  buildAuditDataPack,
  buildAssumptionsAndGapsCsv,
  buildCalculationStepsCsv,
  buildComplianceChecksCsv,
  buildPeerReviewCsv,
  buildRecommendationAuditReportText,
  buildRecommendationInputsCsv,
  buildRecommendationTraceJson,
  buildRecommendationsCsv,
  buildRunMetadataCsv,
  buildSourceReferencesCsv,
  validateRecommendationTraceJson,
} from "./audit-export";
import { tracked } from "./types";
import type { Field, LivestockGroup } from "./types";
import type { PeerReview } from "./audit-trace";

const field: Field = {
  id: "field-export-test",
  farmId: "farm-test",
  name: "Export Test Field",
  areaHa: 10,
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

const groups: LivestockGroup[] = [
  { id: "g1", farmId: "f", category: "suckler_cow", label: "Suckler Cows", count: tracked(20, "verified", "Keith"), system: "grazing", value: tracked(0, "estimated", "x") },
];

async function realRun() {
  const { run } = await calculateNutrientPlanWithTrace("RUN_EXPORT_001", "REC_EXPORT_001", {
    field,
    farmGrasslandAreaHa: 27,
    livestockGroups: groups,
  });
  return run;
}

describe("audit-export — CSV Audit Data Pack (reports/audit_export_tables.csv)", () => {
  it("run_metadata.csv carries one row with the run's real reproducibility metadata", async () => {
    const run = await realRun();
    const csv = buildRunMetadataCsv(run);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("calculation_run_id,farm_snapshot_id,calculated_at,ruleset_id,ruleset_source_checked_at,build_sha,sealed,trace_sha256");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(run.calculationRunId);
    expect(lines[1]).toContain(run.traceSha256);
  });

  it("recommendations.csv has one row per real decision, joined by calculation_run_id", async () => {
    const run = await realRun();
    const csv = buildRecommendationsCsv(run);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(1 + run.decisionRecords.length);
    for (const decision of run.decisionRecords) {
      expect(csv).toContain(decision.recommendationId);
      expect(csv).toContain(decision.decisionType);
    }
  });

  it("calculation_steps.csv rows join to a real recommendation_id and preserve every real step", async () => {
    const run = await realRun();
    const napDecision = run.decisionRecords[0];
    const csv = buildCalculationStepsCsv(run);
    expect(napDecision.calculationSteps.length).toBeGreaterThan(0);
    for (const step of napDecision.calculationSteps) {
      expect(csv).toContain(`${napDecision.recommendationId}-step-${step.sequence}`);
      expect(csv).toContain(step.formulaRuleId);
    }
  });

  it("compliance_checks.csv preserves every real PASS/FAIL check", async () => {
    const run = await realRun();
    const napDecision = run.decisionRecords[0];
    const csv = buildComplianceChecksCsv(run);
    expect(napDecision.complianceChecks.length).toBeGreaterThan(0);
    for (const check of napDecision.complianceChecks) {
      expect(csv).toContain(check.checkId);
      expect(csv).toContain(check.result);
    }
  });

  it("recommendation_inputs.csv preserves raw AND normalised values, never collapsing them into one", async () => {
    const run = await realRun();
    const napDecision = run.decisionRecords[0];
    const csv = buildRecommendationInputsCsv(run);
    expect(napDecision.inputs.length).toBeGreaterThan(0);
    for (const input of napDecision.inputs) {
      expect(csv).toContain(input.name);
    }
    // Header proves both columns exist, not just that data happens to match.
    expect(csv.split("\r\n")[0]).toContain("raw_value");
    expect(csv.split("\r\n")[0]).toContain("normalised_value");
  });

  it("assumptions_and_gaps.csv includes a real data gap for a BLOCKED_INSUFFICIENT_EVIDENCE decision", async () => {
    const groupsMissingAge: LivestockGroup[] = [
      { id: "g2", farmId: "f", category: "weanling", label: "Weanlings", count: tracked(18, "verified", "Keith"), system: "housed", value: tracked(0, "estimated", "x") },
    ];
    const { run } = await calculateNutrientPlanWithTrace("RUN_EXPORT_002", "REC_EXPORT_002", {
      field,
      farmGrasslandAreaHa: 27,
      livestockGroups: groupsMissingAge,
    });
    const blockedDecision = run.decisionRecords[0];
    expect(blockedDecision.decisionType).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    const csv = buildAssumptionsAndGapsCsv(run);
    expect(csv).toContain("MISSING_EVIDENCE");
    expect(csv).toContain(blockedDecision.dataGaps[0].blockedOutput);
  });

  it("source_references.csv joins every decision to at least one real cited source", async () => {
    const run = await realRun();
    const csv = buildSourceReferencesCsv(run);
    for (const decision of run.decisionRecords) {
      expect(decision.sources.length).toBeGreaterThan(0);
      expect(csv).toContain(decision.sources[0].sourceId);
    }
  });

  it("peer_review.csv is empty (but present, with its real header) for a run with no reviews, and populated once a real review exists", async () => {
    const run = await realRun();
    const emptyCsv = buildPeerReviewCsv(run, []);
    expect(emptyCsv.split("\r\n")).toHaveLength(1); // header only

    const review: PeerReview = {
      peerReviewId: "PR_1",
      calculationRunId: run.calculationRunId,
      recommendationId: run.decisionRecords[0].recommendationId,
      reviewStatus: "VERIFIED",
      reviewedAt: "2026-08-27T00:00:00.000Z",
    };
    const populatedCsv = buildPeerReviewCsv(run, [review, { ...review, calculationRunId: "OTHER_RUN", peerReviewId: "PR_2" }]);
    const lines = populatedCsv.split("\r\n");
    expect(lines).toHaveLength(2); // header + only the review matching THIS run
    expect(lines[1]).toContain("VERIFIED");
  });

  it("buildAuditDataPack returns exactly the 8 files reports/audit_export_tables.csv names, in its own order", async () => {
    const run = await realRun();
    const pack = buildAuditDataPack(run, []);
    expect(pack.map((f) => f.filename)).toEqual([
      "run_metadata.csv",
      "recommendations.csv",
      "recommendation_inputs.csv",
      "calculation_steps.csv",
      "compliance_checks.csv",
      "assumptions_and_gaps.csv",
      "source_references.csv",
      "peer_review.csv",
    ]);
  });
});

describe("audit-export — JSON trace (schemas/recommendation_trace.schema.json)", () => {
  it("a real sealed run's JSON export validates against the schema's own required fields/enums", async () => {
    const run = await realRun();
    const json = buildRecommendationTraceJson(run);
    const result = validateRecommendationTraceJson(json);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("the exported trace_sha256 is the run's own real sealed hash, not recomputed/reconstructed", async () => {
    const run = await realRun();
    const json = buildRecommendationTraceJson(run);
    expect((json.integrity as { trace_sha256: string }).trace_sha256).toBe(run.traceSha256);
  });

  it("rejects a trace missing a required top-level field (RPT022's own schema-validity contract)", async () => {
    const run = await realRun();
    const json = buildRecommendationTraceJson(run);
    delete json.farm_snapshot_id;
    const result = validateRecommendationTraceJson(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("farm_snapshot_id"))).toBe(true);
  });

  it("rejects a decision record with an invalid decision_type", async () => {
    const run = await realRun();
    const json = buildRecommendationTraceJson(run);
    (json.decision_records as Record<string, unknown>[])[0].decision_type = "NOT_A_REAL_TYPE";
    const result = validateRecommendationTraceJson(json);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("decision_type"))).toBe(true);
  });

  it("rejects a trace with an empty reason_codes array (schema minItems 1)", async () => {
    const run = await realRun();
    const json = buildRecommendationTraceJson(run);
    (json.decision_records as Record<string, unknown>[])[0].reason_codes = [];
    const result = validateRecommendationTraceJson(json);
    expect(result.valid).toBe(false);
  });

  it("two runs with different real inputs produce JSON traces with different trace_sha256 (RPT020: hash sensitivity)", async () => {
    const runA = await realRun();
    const differentField: Field = { ...field, fertility: { ...field.fertility, pIndex: tracked(1, "verified", "Soil test lab") } };
    const { run: runB } = await calculateNutrientPlanWithTrace("RUN_EXPORT_001", "REC_EXPORT_001", {
      field: differentField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
    });
    const jsonA = buildRecommendationTraceJson(runA);
    const jsonB = buildRecommendationTraceJson(runB);
    expect((jsonA.integrity as { trace_sha256: string }).trace_sha256).not.toBe((jsonB.integrity as { trace_sha256: string }).trace_sha256);
  });
});

describe("audit-export — human-readable Recommendation Audit Report", () => {
  it("includes the run's real identifiers, ruleset, and integrity fingerprint (not reconstructed from current state)", async () => {
    const run = await realRun();
    const text = buildRecommendationAuditReportText(run);
    expect(text).toContain(run.calculationRunId);
    expect(text).toContain(run.farmSnapshotId);
    expect(text).toContain(run.ruleset.rulesetId);
    expect(text).toContain(run.traceSha256!);
  });

  it("shows every real decision's action, reason codes and sources -- what was refused as well as what was recommended", async () => {
    const commonageField: Field = { ...field, commonageStatus: tracked("commonage", "farmer_adjusted", "Keith") };
    const { run } = await calculateNutrientPlanWithTrace("RUN_EXPORT_003", "REC_EXPORT_003", {
      field: commonageField,
      farmGrasslandAreaHa: 27,
      livestockGroups: groups,
    });
    const text = buildRecommendationAuditReportText(run);
    const commonageDecision = run.decisionRecords.find((d) => d.decisionType === "LEGAL_PROHIBITION");
    expect(commonageDecision).toBeDefined();
    expect(text).toContain(commonageDecision!.action);
    expect(text).toContain("LEGAL_PROHIBITION");
  });

  it("discloses boundary-affecting rounding rules, not just the final number (RPT007)", async () => {
    const run = await realRun();
    const text = buildRecommendationAuditReportText(run);
    expect(text).toMatch(/Rounding:/);
  });
});
