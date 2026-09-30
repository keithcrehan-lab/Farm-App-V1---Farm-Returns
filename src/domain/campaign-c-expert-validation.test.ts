import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compareExpertValidationCase,
  EXPERT_VALIDATION_STRATA,
  EXPERT_VALIDATION_TARGET_CASE_COUNT,
  expertValidationCalibration,
  expertValidationCoverage,
  type ExpertValidationArm,
  type FarmReturnValidationArm,
} from "./campaign-c-expert-validation";

// Framework only: no validation has taken place (EXPERT_VALIDATION_PROTOCOL.md).
const farmReturn: FarmReturnValidationArm = {
  caseId: "CCV-001",
  frozenAt: "2026-09-30T00:00:00Z",
  engineVersion: "nutrient_engine_v1.2.0",
  ruleSetVersion: "slurry-agronomy-ie-2026-v1 (DRAFT)",
  decision: "APPLY",
  recommendation: "Apply LESS slurry",
  rateM3ha: null,
  nutrients: { n: 33, p: 8.25, k: 103.95 },
  evidenceTrail: ["SPRING_LESS_SLURRY_TABLE", "CLM-TGC-OM-AVAIL"],
  confidence: "MEDIUM",
};

const expert: ExpertValidationArm = {
  caseId: "CCV-001",
  expertRef: "EXP-A",
  recordedAt: "2026-10-01T00:00:00Z",
  blinded: true,
  decision: "APPLY",
  recommendation: "Apply LESS slurry",
  rateM3ha: 33,
  nutrients: { n: 33, p: 8, k: 104 },
  reasoning: "test",
  confidence: "HIGH",
  evidenceSufficient: true,
};

describe("compareExpertValidationCase", () => {
  it("reports directional agreement and raw deviations without a tolerance", () => {
    const result = compareExpertValidationCase(farmReturn, expert);
    expect(result.directionalAgreement).toBe(true);
    expect(result.exactAgreement).toBe(false);
    expect(result.deviation.rateM3ha).toEqual({ status: "not_comparable", reason: "Farm Return gave no value" });
    expect(result.deviation.p).toMatchObject({ status: "known", absolute: 0.25 });
    expect(result.safetyDisagreement).toBe(false);
    expect(result.falseBlocking).toBe(false);
    expect(result.evidencePrincipleAgreement).toBe(true);
  });

  it("flags safety disagreement and false blocking", () => {
    expect(compareExpertValidationCase(farmReturn, { ...expert, decision: "DO_NOT_APPLY" }).safetyDisagreement).toBe(true);
    const blocked = compareExpertValidationCase({ ...farmReturn, decision: "BLOCKED_INSUFFICIENT_EVIDENCE", nutrients: { n: null, p: null, k: null } }, expert);
    expect(blocked.falseBlocking).toBe(true);
    expect(blocked.evidencePrincipleAgreement).toBe(false);
    expect(blocked.deviation.n.status).toBe("not_comparable");
  });

  it("agrees when both arms block for insufficient evidence", () => {
    const result = compareExpertValidationCase(
      { ...farmReturn, decision: "BLOCKED_INSUFFICIENT_EVIDENCE", nutrients: { n: null, p: null, k: null } },
      { ...expert, decision: "BLOCKED_INSUFFICIENT_EVIDENCE", rateM3ha: null, nutrients: { n: null, p: null, k: null }, evidenceSufficient: false },
    );
    expect(result.exactAgreement).toBe(true);
    expect(result.falseBlocking).toBe(false);
    expect(result.evidencePrincipleAgreement).toBe(true);
  });

  it("rejects mismatched or unblinded arms", () => {
    expect(() => compareExpertValidationCase(farmReturn, { ...expert, caseId: "CCV-002" })).toThrow(/mismatch/);
    expect(() => compareExpertValidationCase(farmReturn, { ...expert, blinded: false as unknown as true })).toThrow(/not blinded/);
  });
});

describe("coverage and calibration", () => {
  it("reports missing strata and duplicates against the 50-case target", () => {
    const coverage = expertValidationCoverage([
      { caseId: "A", strata: ["P_INDEX_1", "METHOD_LESS"], rawInputs: {} },
      { caseId: "A", strata: ["EXPECTED_BLOCKED"], rawInputs: {} },
    ]);
    expect(coverage.targetCaseCount).toBe(EXPERT_VALIDATION_TARGET_CASE_COUNT);
    expect(coverage.targetCaseCount).toBe(50);
    expect(coverage.duplicateCaseIds).toEqual(["A"]);
    expect(coverage.missingStrata).not.toContain("P_INDEX_1");
    expect(coverage.missingStrata).toContain("METHOD_SPLASHPLATE");
    expect(coverage.missingStrata.length).toBe(EXPERT_VALIDATION_STRATA.length - 3);
  });

  it("computes directional agreement per Farm Return confidence level; null where empty", () => {
    const agree = compareExpertValidationCase(farmReturn, expert);
    const disagree = compareExpertValidationCase(farmReturn, { ...expert, decision: "DO_NOT_APPLY" });
    const calibration = expertValidationCalibration([agree, disagree]);
    expect(calibration.MEDIUM).toEqual({ cases: 2, directionalAgreementRate: 0.5 });
    expect(calibration.HIGH).toEqual({ cases: 0, directionalAgreementRate: null });
  });

  it("the stored case-set template is empty and claims no validation", () => {
    const template = JSON.parse(
      readFileSync(join(process.cwd(), "docs/farm-return-next/campaign-c/expert-validation-cases.template.json"), "utf8"),
    );
    expect(template.validationPerformed).toBe(false);
    expect(template.status).toBe("EXPERT_VALIDATION_PENDING");
    expect(template.targetCaseCount).toBe(EXPERT_VALIDATION_TARGET_CASE_COUNT);
    expect(template.strata).toEqual([...EXPERT_VALIDATION_STRATA]);
    expect(template.cases).toEqual([]);
    expect(template.farmReturnArms).toEqual([]);
    expect(template.expertArms).toEqual([]);
    expect(template.comparisons).toEqual([]);
  });
});
