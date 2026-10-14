/**
 * Cattle C7 — veterinary health-programme engine. Explicitly declared,
 * versioned, reviewed programme definitions (veterinarian ⇒
 * VETERINARY_PROGRAMME, farmer ⇒ FARMER_INTENT), deterministic occurrence
 * derivation from declared schedule data, explicit completion evidence and
 * per-occurrence state at an explicit (`effectiveAt`, `knowledgeCutoff`). No
 * universal schedule, prescribing, diagnosing or real programme content. See
 * `docs/farm-return-next/DOMAIN_CONTRACTS.md` ("Cattle C7").
 */

// Admission and materialisation (`admitProgrammeDefinitions`,
// `admitProgrammeReviews`, `admitProgrammeCompletions`,
// `materialiseProgrammeDefinition`) trust already-canonical input and are
// module-internal: the public paths are `evaluateHealthProgrammes`,
// `verifyProgrammeStatusEvaluation`, `projectProgrammeHardGates` and
// `computeProgrammeDefinitionFingerprint`, which run the canonical boundary
// first (CAT-INV-001/002).
export {
  PROGRAMME_ANCHOR_KINDS,
  PROGRAMME_CLASSIFICATIONS,
  PROGRAMME_CLASSIFICATION_DECLARER,
  PROGRAMME_COMPLETION_RECORD_KINDS,
  PROGRAMME_DECLARER_ROLES,
  PROGRAMME_MAX_OCCURRENCES_PER_ACTION,
  PROGRAMME_REVIEW_DIMENSIONS,
  PROGRAMME_WINDOW_BOUNDARIES,
  PRODUCTION_HEALTH_PROGRAMME_DEFINITIONS,
  computeProgrammeDefinitionFingerprint,
  programmeInformationClass,
  type HealthProgrammeDefinition,
  type ProgrammeAction,
  type ProgrammeAnchor,
  type ProgrammeAnchorKind,
  type ProgrammeApplicability,
  type ProgrammeClassification,
  type ProgrammeCompletionCriteria,
  type ProgrammeCompletionRecordKind,
  type ProgrammeDeclarer,
  type ProgrammeDeclarerRole,
  type ProgrammeProductRef,
  type ProgrammeProvenance,
  type ProgrammeRecordIssue,
  type ProgrammeRecordIssueCode,
  type ProgrammeReviewRecord,
  type ProgrammeReviewState,
  type ProgrammeSchedule,
  type ProgrammeVersionHistory,
  type ProgrammeVersionRef,
  type ProgrammeWindowBoundary,
} from "./programme-definition";
export type {
  CompletionIssue,
  CompletionIssueCode,
  ProgrammeCompletionEvidence,
  ProgrammeCompletionProvenance,
  ProgrammeCompletionRecord,
} from "./programme-completion";
export { programmeOccurrenceId, type ProgrammeOccurrence, type WindowPosition } from "./programme-schedule";
export { PROGRAMME_OCCURRENCE_STATES, PROGRAMME_STATUS_PRECEDENCE, foldProgrammeStates, type ProgrammeOccurrenceState } from "./programme-state";
export type { UnresolvedOutcome } from "./programme-evidence";
export type * from "./programme-types";
export * from "./programme-engine";
export * from "./programme-hard-gates";
export * from "./programme-integrity";
