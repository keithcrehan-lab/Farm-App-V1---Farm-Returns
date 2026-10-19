/**
 * Cattle C9 — the Plan interface: a pure, cattle-owned adapter translating
 * C2 obligations, C7 programme occurrences and C8 recommendations into the
 * existing Plan kernel inputs (C8P1-frozen types) without duplicating cattle
 * truth. See `docs/farm-return-next/DOMAIN_CONTRACTS.md` ("Cattle C9 — Plan
 * interface").
 */

// The delegation, work-item, merge and evidence builders trust the delegated,
// already-canonical predecessor outputs and stay module-internal; the public
// path is `planCattleWork`, which runs the canonical boundary first. The scope
// helpers and the vocabulary table are exported for callers and documentation.
export type * from "./plan-contracts";
export { planCattleWork } from "./plan-interface";
export { CATTLE_PLAN_PAYLOAD_VERSION, computeCattlePlanFingerprint, verifyCattlePlanFingerprint, type CattlePlanFingerprintKind } from "./plan-integrity";
export { cattleAnimalScope, cattleGroupScope } from "./plan-merge";
export {
  CATTLE_PLAN_VOCABULARY,
  DEADLINE_AUTHORITY_NOT_UNIQUELY_ESTABLISHED,
  GOAL_IN_FORCE_REQUIREMENT,
  type CattlePlanCompletionForm,
  type CattlePlanVocabularyRow,
  type CattlePlanVocabularyRowId,
} from "./plan-vocabulary";
