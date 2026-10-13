/**
 * Cattle C6 — production goal engine. Explicit, versioned, bitemporal farmer
 * intent (INTENT, never FACT), goal snapshots, data-only goal → rule routing
 * (empty by default) and explicit-ref C5 target applicability. No inferred or
 * default goal and no built-in science. See
 * `docs/farm-return-next/DOMAIN_CONTRACTS.md` ("Cattle C6").
 */

// Admission and materialisation (`admitGoalDeclarations`,
// `materialiseGoalDeclaration`) and the projection core
// (`projectCanonicalGoals`, `readGoalRequest`) trust already-canonical input
// and are module-internal: the public paths are `projectProductionGoals`,
// `verifyGoalSnapshotRef`, `routeProductionGoals` and
// `resolveGoalTargetApplicability`, which run the canonical boundary first
// (CAT-INV-001/002).
export {
  GOAL_DECLARER_ROLES,
  GOAL_RECORD_ACTIONS,
  GOAL_TYPE_REF_PREFIX,
  PRODUCTION_GOAL_TYPES,
  goalTypeRef,
  type GoalCanonicalWeight,
  type GoalDeclarer,
  type GoalDeclarerRole,
  type GoalProvenance,
  type GoalRecordAction,
  type GoalRecordIssue,
  type GoalRecordIssueCode,
  type GoalStanding,
  type GoalSubject,
  type GoalTargetOutcome,
  type GoalTargetWeight,
  type GoalVersionRef,
  type ProductionGoalDeclaration,
  type ProductionGoalType,
} from "./goal-declaration";
export {
  MUTUALLY_EXCLUSIVE_GOAL_TYPE_PAIRS,
  projectProductionGoals,
  verifyGoalSnapshotRef,
  type GoalHistoryEntry,
  type GoalProjection,
  type GoalProjectionRequest,
  type GoalProjectionResult,
  type GoalProjectionStatus,
  type GoalQuery,
  type GoalRequestIssue,
  type GoalRequestIssueCode,
  type GoalSnapshotRef,
  type GoalSnapshotVerification,
  type IntentConflict,
  type IntentConflictKind,
  type ProjectedGoal,
} from "./goal-projection";
export * from "./goal-routing";
export * from "./goal-target-applicability";
export * from "./goal-integrity";
