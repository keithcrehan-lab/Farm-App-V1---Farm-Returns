/**
 * Cattle C7 — request and output types shared by the evaluation layers
 * (DOMAIN_CONTRACTS "Cattle C7", Outputs and fingerprints). Types only.
 */

import type { AssessmentFingerprint } from "../../assessment-integrity";
import type { AnimalLedger } from "../animal-ledger";
import type { CattleEvaluationState } from "../evaluation";
import type { CompletionIssueCode, ProgrammeCompletionRecord } from "./programme-completion";
import type {
  ProgrammeApplicability,
  ProgrammeClassification,
  ProgrammeDeclarerRole,
  ProgrammeRecordIssueCode,
  ProgrammeReviewRecord,
  ProgrammeReviewState,
  ProgrammeVersionHistory,
} from "./programme-definition";
import type { UnresolvedOutcome } from "./programme-evidence";
import type { CATTLE_PROGRAMME_PAYLOAD_VERSION } from "./programme-integrity";
import type { ProgrammeOccurrence } from "./programme-schedule";
import type { ProgrammeOccurrenceState } from "./programme-state";

export interface HealthProgrammeQuery {
  /** VALID time. */
  effectiveAt: string;
  /** KNOWLEDGE time. */
  knowledgeCutoff: string;
}

/**
 * C3 canonical inputs. C7 composes them through the frozen C3 engine
 * (`projectAnimalHealth`, one call per listed animal); a derived C3
 * projection is never accepted as input (C7 architecture review 2026-10-14).
 */
export interface ProgrammeHealthEvidence {
  /** Opaque food-product codes C3 gates (C3 query `foodProducts`). */
  foodProducts: readonly string[];
  /** C3 authorised-product records (C3 `productRecords`). */
  productRecords: readonly unknown[];
  /** Per animal: its C3 health records. An evaluated animal not listed has no C3 evidence supplied. */
  animals: readonly { animalId: string; healthRecords: readonly unknown[] }[];
}

/**
 * C2 canonical inputs. C7 composes them through the frozen C2 engine
 * (`evaluateHerdObligations` over the request's ledgers) with the trusted
 * implementation registry passed separately; a derived C2 evaluation is never
 * accepted as input.
 */
export interface ProgrammeObligationEvidence {
  /** C2 `ObligationCatalogue` (definitions, rule versions, sources, reviews). */
  catalogue: unknown;
  obligationIds: readonly string[];
  /** C2 fulfilment evidence for any evaluated animal (partitioned by C2). */
  evidence: readonly unknown[];
}

/** Every part must be canonical plain data and every field present (CAMPAIGN.md "Canonical input contract"; field policy). */
export interface HealthProgrammeRequest {
  /** `HealthProgrammeDefinition` records (the whole append-only catalogue; empty in production). */
  definitions: readonly unknown[];
  /** `ProgrammeReviewRecord`s. */
  reviews: readonly unknown[];
  /** `ProgrammeCompletionRecord` declarations. */
  completions: readonly unknown[];
  /** C1 ledgers — the animals evaluated (one per animal). */
  ledgers: readonly AnimalLedger[];
  /** C3 canonical inputs, or `null` = no C3 evidence supplied. */
  health: ProgrammeHealthEvidence | null;
  /** C2 canonical inputs, or `null` = no C2 evidence supplied. */
  obligations: ProgrammeObligationEvidence | null;
  query: HealthProgrammeQuery;
}

export type ProgrammeMembershipState = "MEMBER" | "NOT_MEMBER" | "UNKNOWN" | "EVIDENCE_CONFLICT" | "INVALID";

export interface ProgrammeMembership {
  state: ProgrammeMembershipState;
  basis: ProgrammeApplicability["kind"];
  /** Canonical instant the membership was resolved at. */
  at: string;
  reasonCodes: string[];
  /**
   * The predecessor evidence this membership was resolved from (CAT-INV-021):
   * GROUP — the C4 `CATTLE_GROUP_SCOPE` fingerprint of that exact resolution
   * (`null` only when C4 rejected the scope); CRITERIA — the bound C1 snapshot
   * fingerprint; EXPLICIT_SET — `null` (the set is part of the bound definition).
   */
  evidenceFingerprint: AssessmentFingerprint | null;
}

export interface ProgrammeGateCheck {
  ruleId: string;
  state: CattleEvaluationState | "NOT_SUPPLIED";
  source: "C2_OBLIGATION" | "C3_WITHDRAWAL" | null;
  blocking: boolean;
}

/**
 * The evidential authority of one counted completion (human rulings B2 /
 * M1 / M2): VETERINARY when a veterinarian-authored declaration (role with
 * veterinary-source provenance) or a veterinary-recorded C3 record
 * (VETERINARY_SOURCE provenance, actor VETERINARIAN) establishes it;
 * otherwise NON_VETERINARY (valid evidence, retained, but not by itself
 * enough for a veterinary hard gate).
 */
export type CompletionAuthority = "VETERINARY" | "NON_VETERINARY";

export interface CountedCompletion {
  basis: "DECLARATION" | "HEALTH_RECORD_LINK" | "DECLARED_CRITERIA";
  authority: CompletionAuthority;
  /** Effective role of the completion declaration's declarer (`null` for DECLARED_CRITERIA: no declaration). */
  declaredBy: ProgrammeDeclarerRole | null;
  /** C3 provenance of the evidencing record (`null` for a DECLARED completion: no C3 record). */
  recordProvenance: { sourceCategory: string; actorRole: string } | null;
  declarationId: string | null;
  healthRecordId: string | null;
  /** Canonical spelling. */
  completedAt: string;
  timing: "IN_WINDOW" | "LATE";
}

/** The namespace of an evidence-note ref: identities from different namespaces never collapse. */
export type EvidenceRefKind = "DECLARATION" | "HEALTH_RECORD" | "OCCURRENCE";

export interface EvidenceNote {
  refKind: EvidenceRefKind;
  /** A declaration id, C3 record id or occurrence id, per `refKind`. */
  ref: string;
  reason: string;
}

/** A candidate whose required predecessor evidence is not resolved, with the C7 outcome it forces. */
export interface UnresolvedNote extends EvidenceNote {
  outcome: UnresolvedOutcome;
}

export interface ProgrammeCompletionSummary {
  /** Every known declaration naming this occurrence, live or superseded (sorted). */
  consideredDeclarationIds: string[];
  counted: CountedCompletion[];
  otherVersionDeclarationIds: string[];
  beforeWindow: string[];
  notYetOccurred: string[];
  unresolved: UnresolvedNote[];
  mismatched: EvidenceNote[];
  /** Declarations in a competing correction (sorted). */
  conflictingDeclarationIds: string[];
  /** C3 records in a competing correction (sorted). */
  conflictingRecordIds: string[];
}

export interface ProgrammeOccurrenceRecord {
  programmeId: string;
  programmeVersion: string | null;
  /** `null` for a programme-level record. */
  actionId: string | null;
  actionKind: string | null;
  animalId: string;
  /** `null` for a programme- or action-level record. */
  occurrence: ProgrammeOccurrence | null;
  state: ProgrammeOccurrenceState;
  reasonCodes: string[];
  completion: ProgrammeCompletionSummary | null;
  gates: ProgrammeGateCheck[];
  /** GROUP only: the C4 membership resolved when this occurrence's window opened (`null` when not consulted). */
  membershipAtOpen: ProgrammeMembership | null;
}

export interface ProgrammeAnimalInputs {
  /** C1 snapshot at (`effectiveAt`, `knowledgeCutoff`). */
  snapshotFingerprint: AssessmentFingerprint;
  health: { timeline: AssessmentFingerprint; medicineLedger: AssessmentFingerprint; withdrawalGate: AssessmentFingerprint } | null;
  /** C2 obligation state record fingerprints (sorted by digest), or `null` when no evaluation was supplied. */
  obligationRecords: AssessmentFingerprint[] | null;
}

export interface ProgrammeAnimalStatus {
  programmeId: string;
  animalId: string;
  programmeVersion: string | null;
  classification: ProgrammeClassification;
  informationClass: "RULE" | "INTENT";
  membership: ProgrammeMembership | null;
  status: ProgrammeOccurrenceState;
  /** Sorted by action id (programme-level first), then occurrence index. */
  records: ProgrammeOccurrenceRecord[];
  /** Live completion declarations for this animal and programme naming no derived occurrence (sorted). */
  unmatchedDeclarationIds: string[];
  /** Every completion declaration for this animal and programme known by the cutoff (sorted by id). */
  declarations: ProgrammeCompletionRecord[];
  inputs: ProgrammeAnimalInputs;
  fingerprint: AssessmentFingerprint;
}

export interface ProgrammeVersionEntry extends ProgrammeVersionHistory {
  /** `CATTLE_PROGRAMME_DEFINITION` review fingerprint (never the result binding on its own). */
  definitionFingerprint: AssessmentFingerprint;
}

export interface ProgrammeScopeSummary {
  applicability: ProgrammeApplicability;
  members: string[];
  notMembers: string[];
  unknown: string[];
  conflict: string[];
  invalid: string[];
  /** Explicit-set members with no supplied ledger (never assumed done or not applicable). */
  declaredMembersNotEvaluated: string[];
}

export type ProgrammeStatusValue = ProgrammeOccurrenceState | "NOT_IN_FORCE" | "NO_ANIMALS_EVALUATED";

export interface ProgrammeGoverning {
  version: ProgrammeVersionEntry;
  review: ProgrammeReviewState;
  /** The live review records bound to the governing version (sorted by id). */
  reviewRecords: ProgrammeReviewRecord[];
}

export interface ProgrammeStatus {
  programmeId: string;
  classification: ProgrammeClassification;
  informationClass: "RULE" | "INTENT";
  versionState: "GOVERNING" | "NOT_IN_FORCE" | "VERSION_CONFLICT";
  governing: ProgrammeGoverning | null;
  /** Versions effective at `effectiveAt` when in conflict (no winner). */
  conflictingVersions: ProgrammeVersionEntry[];
  /** Every known version (history, incl. superseded), sorted by version. */
  versions: ProgrammeVersionEntry[];
  scope: ProgrammeScopeSummary | null;
  status: ProgrammeStatusValue;
  animals: ProgrammeAnimalStatus[];
}

export interface ProgrammeStatusEvaluation {
  programmePayloadVersion: typeof CATTLE_PROGRAMME_PAYLOAD_VERSION;
  /** Canonical spellings. */
  effectiveAt: string;
  knowledgeCutoff: string;
  /** NO_PROGRAMME: no programme known at the cutoff (never "compliant"); NONE_IN_FORCE: none governs `effectiveAt`. */
  outcome: "NO_PROGRAMME" | "NONE_IN_FORCE" | "EVALUATED";
  animalIds: string[];
  programmes: ProgrammeStatus[];
  fingerprint: AssessmentFingerprint;
}

export type ProgrammeRequestIssueCode =
  | "CATTLE_PROGRAMME_NON_CANONICAL_INPUT"
  | "CATTLE_PROGRAMME_INVALID_REQUEST"
  | "CATTLE_PROGRAMME_INVALID_EFFECTIVE_AT"
  | "CATTLE_PROGRAMME_INVALID_KNOWLEDGE_CUTOFF"
  | "CATTLE_PROGRAMME_INVALID_LEDGER"
  | "CATTLE_PROGRAMME_DUPLICATE_ANIMAL"
  /** C3 rejected the canonical health evidence of an animal (its own validation), or its output failed C7's schema. */
  | "CATTLE_PROGRAMME_HEALTH_EVIDENCE_INVALID"
  | "CATTLE_PROGRAMME_HEALTH_EVIDENCE_UNKNOWN_ANIMAL"
  | "CATTLE_PROGRAMME_HEALTH_EVIDENCE_DUPLICATE_ANIMAL"
  /** C2 rejected the canonical obligation evidence (its own validation), or its output failed C7's schema. */
  | "CATTLE_PROGRAMME_OBLIGATION_EVIDENCE_INVALID"
  /** Obligation evidence supplied without a trusted C2 implementation registry. */
  | "CATTLE_PROGRAMME_OBLIGATION_IMPLEMENTATIONS_MISSING"
  | ProgrammeRecordIssueCode
  | CompletionIssueCode;

export interface ProgrammeIssue {
  code: ProgrammeRequestIssueCode;
  /** Record / animal / structured identity / non-canonical path when readable. */
  ref: string | null;
}

export type ProgrammeEvaluationResult = { ok: true; evaluation: ProgrammeStatusEvaluation } | { ok: false; issues: ProgrammeIssue[] };
