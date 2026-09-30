/**
 * Campaign C — blinded expert-validation framework (storage shape and
 * comparison arithmetic only).
 *
 * Protocol: `docs/farm-return-next/campaign-c/EXPERT_VALIDATION_PROTOCOL.md`.
 * No validation has taken place. This module holds future cases, the frozen
 * Farm Return arm, the blinded expert arm and their comparison. It is not
 * wired into any production surface, persists nothing and invents no
 * tolerance: numerical deviation is reported raw, never judged against a
 * made-up threshold.
 */

export const EXPERT_VALIDATION_FRAMEWORK_VERSION = "campaign_c_expert_validation_v0.1.0-draft";
export const EXPERT_VALIDATION_TARGET_CASE_COUNT = 50;

/** Coverage strata every case set must span (protocol §2). A case may
 * carry several. */
export const EXPERT_VALIDATION_STRATA = [
  "P_INDEX_1",
  "P_INDEX_2",
  "P_INDEX_3",
  "P_INDEX_4",
  "K_INDEX_1",
  "K_INDEX_2",
  "K_INDEX_3",
  "K_INDEX_4",
  "MIXED_P_K_INDEX",
  "SLURRY_DM_CLASS",
  "METHOD_LESS",
  "METHOD_SPLASHPLATE",
  "FIRST_CUT_YIELD_DIFFERENCE",
  "MISSING_EVIDENCE",
  "LOW_INDEX_ORGANIC_SHARE",
  "REGULATORY_CONSTRAINT",
  "WEATHER_ACTIONABILITY_CONSTRAINT",
  "ECONOMIC_PRIORITISATION",
  "EXPECTED_BLOCKED",
] as const;
export type ExpertValidationStratum = (typeof EXPERT_VALIDATION_STRATA)[number];

export type ValidationDecision = "APPLY" | "DO_NOT_APPLY" | "BLOCKED_INSUFFICIENT_EVIDENCE";
export type ValidationConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface ValidationNutrients {
  /** kg/ha; `null` = not given (never zero for "unknown"). */
  n: number | null;
  p: number | null;
  k: number | null;
}

export interface ExpertValidationCase {
  caseId: string;
  strata: readonly ExpertValidationStratum[];
  /** The raw farm inputs both arms receive, identical and answer-free. */
  rawInputs: Readonly<Record<string, unknown>>;
}

export interface FarmReturnValidationArm {
  caseId: string;
  frozenAt: string;
  engineVersion: string;
  ruleSetVersion: string;
  decision: ValidationDecision;
  recommendation: string;
  /** `null` while the rate selector is deferred or the case is blocked. */
  rateM3ha: number | null;
  nutrients: ValidationNutrients;
  evidenceTrail: readonly string[];
  confidence: ValidationConfidence;
}

export interface ExpertValidationArm {
  caseId: string;
  /** Pseudonymous reviewer reference; no personal data. */
  expertRef: string;
  recordedAt: string;
  /** The expert never saw Farm Return's answer for this case. */
  blinded: true;
  decision: ValidationDecision;
  recommendation: string;
  rateM3ha: number | null;
  nutrients: ValidationNutrients;
  reasoning: string;
  confidence: ValidationConfidence;
  evidenceSufficient: boolean;
}

export type ValidationDeviation =
  | { status: "known"; farmReturn: number; expert: number; absolute: number; relative: number | null }
  | { status: "not_comparable"; reason: string };

export interface ExpertValidationComparison {
  caseId: string;
  frameworkVersion: string;
  exactAgreement: boolean;
  directionalAgreement: boolean;
  deviation: { rateM3ha: ValidationDeviation; n: ValidationDeviation; p: ValidationDeviation; k: ValidationDeviation };
  /** Farm Return would act where the expert would not. */
  safetyDisagreement: boolean;
  /** Farm Return blocked where the expert judged the evidence sufficient
   * and gave an answer. */
  falseBlocking: boolean;
  /** Both arms agree on whether the evidence is sufficient to answer. */
  evidencePrincipleAgreement: boolean;
  farmReturnConfidence: ValidationConfidence;
  expertConfidence: ValidationConfidence;
}

function deviation(farmReturn: number | null, expert: number | null): ValidationDeviation {
  if (farmReturn === null || expert === null) {
    return { status: "not_comparable", reason: farmReturn === null ? "Farm Return gave no value" : "expert gave no value" };
  }
  const absolute = farmReturn - expert;
  return { status: "known", farmReturn, expert, absolute, relative: expert === 0 ? null : absolute / expert };
}

export function compareExpertValidationCase(farmReturn: FarmReturnValidationArm, expert: ExpertValidationArm): ExpertValidationComparison {
  if (farmReturn.caseId !== expert.caseId) {
    throw new Error(`Case mismatch: ${farmReturn.caseId} vs ${expert.caseId}`);
  }
  if (expert.blinded !== true) {
    throw new Error(`Expert arm for ${expert.caseId} is not blinded`);
  }
  const sameValue = (a: number | null, b: number | null) => a === b;
  const exactAgreement =
    farmReturn.decision === expert.decision &&
    sameValue(farmReturn.rateM3ha, expert.rateM3ha) &&
    sameValue(farmReturn.nutrients.n, expert.nutrients.n) &&
    sameValue(farmReturn.nutrients.p, expert.nutrients.p) &&
    sameValue(farmReturn.nutrients.k, expert.nutrients.k);
  const farmReturnBlocked = farmReturn.decision === "BLOCKED_INSUFFICIENT_EVIDENCE";
  return {
    caseId: farmReturn.caseId,
    frameworkVersion: EXPERT_VALIDATION_FRAMEWORK_VERSION,
    exactAgreement,
    directionalAgreement: farmReturn.decision === expert.decision,
    deviation: {
      rateM3ha: deviation(farmReturn.rateM3ha, expert.rateM3ha),
      n: deviation(farmReturn.nutrients.n, expert.nutrients.n),
      p: deviation(farmReturn.nutrients.p, expert.nutrients.p),
      k: deviation(farmReturn.nutrients.k, expert.nutrients.k),
    },
    safetyDisagreement: farmReturn.decision === "APPLY" && expert.decision !== "APPLY",
    falseBlocking: farmReturnBlocked && expert.evidenceSufficient && expert.decision !== "BLOCKED_INSUFFICIENT_EVIDENCE",
    evidencePrincipleAgreement: !farmReturnBlocked === expert.evidenceSufficient,
    farmReturnConfidence: farmReturn.confidence,
    expertConfidence: expert.confidence,
  };
}

/** Case-set coverage against the protocol's target and strata. Reports
 * gaps; it does not decide whether the set is acceptable. */
export function expertValidationCoverage(cases: readonly ExpertValidationCase[]): {
  caseCount: number;
  targetCaseCount: number;
  duplicateCaseIds: string[];
  missingStrata: ExpertValidationStratum[];
} {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const covered = new Set<ExpertValidationStratum>();
  for (const c of cases) {
    if (seen.has(c.caseId)) duplicates.add(c.caseId);
    seen.add(c.caseId);
    for (const stratum of c.strata) covered.add(stratum);
  }
  return {
    caseCount: cases.length,
    targetCaseCount: EXPERT_VALIDATION_TARGET_CASE_COUNT,
    duplicateCaseIds: [...duplicates].sort(),
    missingStrata: EXPERT_VALIDATION_STRATA.filter((s) => !covered.has(s)),
  };
}

/** Confidence calibration: directional-agreement rate per Farm Return
 * confidence level. `null` where no case has that level. */
export function expertValidationCalibration(
  comparisons: readonly ExpertValidationComparison[],
): Record<ValidationConfidence, { cases: number; directionalAgreementRate: number | null }> {
  const levels: ValidationConfidence[] = ["HIGH", "MEDIUM", "LOW"];
  const result = {} as Record<ValidationConfidence, { cases: number; directionalAgreementRate: number | null }>;
  for (const level of levels) {
    const atLevel = comparisons.filter((c) => c.farmReturnConfidence === level);
    const agreed = atLevel.filter((c) => c.directionalAgreement).length;
    result[level] = { cases: atLevel.length, directionalAgreementRate: atLevel.length === 0 ? null : agreed / atLevel.length };
  }
  return result;
}
