/**
 * Cattle C5 — performance engine. Deterministic gain / ADG, coverage,
 * explicit trend and target comparison, labelled prediction and scope
 * aggregation over the C4 read contract. No built-in target, threshold,
 * tolerance or trend boundary. See `docs/farm-return-next/DOMAIN_CONTRACTS.md`
 * ("Cattle C5").
 */

// The derivation helpers (`performancePoints`, `derivePerformanceInterval`,
// `derivePeriod`, `compareWithTarget`, ...) and the definition admission
// (`admitPerformanceTargets`, `materialisePerformanceTarget`, ...) trust
// already-canonical input and are module-internal: the public path is
// `evaluatePerformance`, which runs the canonical boundary and verifies the
// C4 read contract first (CAT-INV-001/002/023).
export {
  PERFORMANCE_DAY_CONVENTION,
  PERFORMANCE_DAY_CONVENTION_VERSION,
  type ExactElapsed,
} from "./elapsed-time";
export {
  DEFINITION_REVIEW_STATES,
  PERFORMANCE_MEASUREMENT_BASES,
  PERFORMANCE_POLICY_KINDS,
  type ApplicabilityAttribute,
  type DefinitionIssueCode,
  type DefinitionProvenance,
  type DefinitionVersionRef,
  type PerformancePolicy,
  type PerformancePolicyKind,
  type PerformancePolicyRule,
  type PerformanceTarget,
  type PerformanceTargetMetric,
  type PolicyResolution,
  type TargetApplicability,
  type TargetTolerance,
} from "./performance-definitions";
export {
  PERFORMANCE_FORMULA,
  PERFORMANCE_PREDICTION_METHOD,
  type ApplicabilityContext,
  type CalculationTrace,
  type DerivationReasonCode,
  type DerivationState,
  type EvidenceBasis,
  type IntervalDerivation,
  type PerformanceCoverage,
  type PerformanceInput,
  type PerformanceLimitationCode,
  type PerformancePoint,
  type PerformancePointState,
  type TargetComparison,
  type TargetComparisonReasonCode,
  type TargetComparisonState,
  type TrendClassification,
  type TrendState,
  type WeightPrediction,
} from "./performance-derivation";
export * from "./performance-engine";
export * from "./performance-integrity";
