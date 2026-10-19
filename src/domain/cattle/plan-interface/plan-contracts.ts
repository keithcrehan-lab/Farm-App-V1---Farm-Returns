/**
 * Cattle C9 — request, canonical object and output types (types only).
 * DOMAIN_CONTRACTS "Cattle C9 — Plan interface".
 */

import type { AssessmentFingerprint } from "../../assessment-integrity";
import type { CanonicalEvidence, PlanBlocker, PlanBlockerKind, PlanBlockerStatus, PlanJobInput, ScopeReality, SystemPriorityTier } from "../../plan";
import type { CattleRecommendationRequest } from "../recommendations";
import type { SourceVersionRef } from "../source";
import type { CATTLE_PLAN_PAYLOAD_VERSION } from "./plan-integrity";
import type { CattlePlanVocabularyRowId } from "./plan-vocabulary";

/**
 * ONE canonical request (design freeze B1): C8's canonical request plus the C4
 * group scopes to resolve. Never a C2 / C7 / C8 output, never ledgers for C4
 * beyond `cattle.ledgers`, never a mapping configuration.
 */
export interface CattlePlanRequest {
  cattle: CattleRecommendationRequest;
  groupScopes: readonly { groupRef: string }[];
}

/** The cattle phase a work item's authoritative output comes from. */
export type CattlePlanFamily = "C2_OBLIGATION" | "C7_PROGRAMME" | "C8_RECOMMENDATION";

/** The Farm Return origin of a work item (design freeze B3). */
export type CattlePlanOrigin = "OBLIGATION" | "PROGRAMME" | "DATA_GAP" | "RECOMMENDATION";

/** `[sourceFamily, authoritative output id, output fingerprint digest, gate rule id, subject type, subject id, obligation / occurrence id or null]` (D3). */
export type CattlePlanBlockerIdentity = [string, string, string, string, "CATTLE_ANIMAL", string, string | null];

export interface CattlePlanBlocker {
  /** `CATTLE_PLAN_BLOCKER:` + the JSON identity. */
  id: string;
  identity: CattlePlanBlockerIdentity;
  kind: PlanBlockerKind;
  status: PlanBlockerStatus;
  /** The consumed gate / record state, verbatim. */
  gateState: string;
  description: string;
}

export interface CattlePlanWindow {
  /** Canonical spellings, as the owning phase emitted them. */
  opensAt: string;
  dueAt: string;
  boundary: string;
}

export interface CattlePlanTiming {
  window: CattlePlanWindow | null;
  /** Why the window is recommended (`null` exactly when there is no window). */
  windowBasis: string | null;
  /** Only where B5 / D1 proves the authority uniquely. */
  hardDeadline: { dueIso: string; authority: SourceVersionRef } | null;
  /** C2 only: every rule source check the record carries (D1 provenance). */
  sourceChecks: { bound: SourceVersionRef; status: string }[];
}

/** A folded C8 restatement (D2): supporting provenance, never a job. */
export interface CattlePlanSupport {
  family: "C8_RECOMMENDATION";
  outputId: string;
  outputFingerprint: AssessmentFingerprint;
  actionKind: string;
  consumedState: string;
  reasonCodes: string[];
}

/** The one canonical C9 object every projection reads. */
export interface CattlePlanWorkItem {
  /** `JSON [family, outputId]`. */
  key: string;
  family: CattlePlanFamily;
  origin: CattlePlanOrigin;
  outputId: string;
  outputFingerprint: AssessmentFingerprint;
  animalId: string;
  /** C2 `[obligationId, occurrenceId]`, C7 `[programmeId, actionId, occurrenceId]` (JSON); `null` for C8. */
  cites: string | null;
  consumedState: string;
  reasonCodes: string[];
  vocabularyRow: CattlePlanVocabularyRowId;
  actionKey: string;
  timing: CattlePlanTiming;
  blockers: CattlePlanBlocker[];
  priority: { tier: SystemPriorityTier; basis: string };
  supporting: CattlePlanSupport[];
}

/** Work items sharing one `planJobIdentityKey`, with the merge-algebra summary (one projection). */
export interface CattlePlanProposalGroup {
  identityKey: string;
  /** Sorted by key, unique. */
  items: CattlePlanWorkItem[];
  /** Every distinct origin (sorted). */
  origins: CattlePlanOrigin[];
  priority: { tier: SystemPriorityTier; bases: string[] };
  windowBases: string[];
  /** Earliest due; the projected authority chosen by canonical key; every authority kept. */
  hardDeadline: { dueIso: string; authority: SourceVersionRef; authorities: { dueIso: string; authority: SourceVersionRef }[] } | null;
  blockerIds: string[];
  supportingReasons: string[];
}

export interface CattlePlanGroupScope {
  groupRef: string;
  /** C4 `CATTLE_GROUP_SCOPE` fingerprint of the resolution. */
  scopeFingerprint: AssessmentFingerprint;
  members: string[];
  notMembers: string[];
  unknown: string[];
  conflict: string[];
  invalid: string[];
}

export interface CattlePlanNoProposal {
  family: CattlePlanFamily;
  outputId: string;
  outputFingerprint: AssessmentFingerprint;
  animalId: string;
  consumedState: string;
  reason: string;
}

export interface CattlePlanResult {
  cattlePlanPayloadVersion: typeof CATTLE_PLAN_PAYLOAD_VERSION;
  /** Echoed from the cattle outputs (canonical spellings), never recomputed. */
  effectiveAt: string;
  knowledgeCutoff: string;
  /** Sorted by key. Folded C8 restatements appear only as `supporting`. */
  workItems: CattlePlanWorkItem[];
  /** Sorted by identity key. */
  groups: CattlePlanProposalGroup[];
  /** Plan projections (existing Plan types only), sorted by id. */
  proposals: PlanJobInput[];
  blockers: PlanBlocker[];
  scopes: CattlePlanGroupScope[];
  scopeReality: ScopeReality;
  evidence: CanonicalEvidence;
  withoutProposal: CattlePlanNoProposal[];
  fingerprint: AssessmentFingerprint;
}

export interface CattlePlanIssue {
  code: string;
  ref: string | null;
}

export type CattlePlanOutcome = { ok: true; result: CattlePlanResult } | { ok: false; issues: CattlePlanIssue[] };
