import type { SystemPriorityTier } from "../plan/priority";

/**
 * Schemes foundation — stable contracts shared by the scheme repository,
 * readiness engine, future rule evaluators and the central Planning layer.
 *
 * Important ownership rule:
 * Schemes never becomes the canonical owner of a farm, field or livestock
 * fact. A requirement names the stable data key it needs and the module
 * that owns that fact. Scheme-specific facts are the only facts Schemes
 * owns itself.
 */

export type SchemeDataOwner = "farm_profile" | "fields" | "livestock" | "cattle" | "schemes" | "sheep";

export type SchemeSubject =
  | { kind: "farm"; id: string }
  | { kind: "field"; id: string }
  | { kind: "cattle_animal"; id: string }
  | { kind: "cattle_group"; id: string }
  | { kind: "sheep_group"; id: string };

export type SchemeDataState =
  | "KNOWN"
  | "MISSING"
  | "CONFLICTING"
  | "INVALID"
  | "UNSUPPORTED"
  | "REVIEW_REQUIRED"
  | "NOT_APPLICABLE";

export type SchemeResolutionOwner = "farmer" | "adviser" | "system";

export interface SchemeDataRoute {
  /** Exact in-app editor/view that owns this fact. */
  href: string;
  /** Schemes detail/checklist location to return to after save. */
  returnTo: string;
}

export interface SchemeDataEvidence {
  sourceKind: "recorded" | "derived" | "farmer_confirmed" | "adviser_confirmed" | "imported" | "verified_external";
  sourceRef?: string;
  observedAt?: string;
  receivedAt?: string;
  detail?: string;
}

export interface SchemeDataPoint {
  key: string;
  owner: SchemeDataOwner;
  state: SchemeDataState;
  value?: unknown;
  subject?: SchemeSubject;
  route?: SchemeDataRoute;
  evidence?: SchemeDataEvidence[];
  /** Who can actually resolve the current state. Unsupported/system
   * states must never be presented as something the farmer can fix. */
  resolutionOwner: SchemeResolutionOwner;
}

export type SchemeRequirementPurpose =
  | "relevance"
  | "eligibility"
  | "payment"
  | "action"
  | "evidence"
  | "deadline";

export interface SchemeRequirement {
  id: string;
  schemeVersionKey: string;
  dataKey: string;
  label: string;
  owner: SchemeDataOwner;
  purpose: SchemeRequirementPurpose;
  /** False requirements are informative dependencies and do not enter the
   * readiness denominator. */
  required: boolean;
  /** A rule engine may determine a requirement does not apply to this
   * farm. Such requirements are excluded from the denominator. */
  applicable: boolean;
  priority: number;
}

export type SchemeReadinessBucket = "already_known" | "needs_you" | "needs_review";

export interface SchemeReadinessItem {
  requirementId: string;
  dataKey: string;
  label: string;
  owner: SchemeDataOwner;
  purpose: SchemeRequirementPurpose;
  state: SchemeDataState;
  bucket: SchemeReadinessBucket;
  route?: SchemeDataRoute;
  resolutionOwner: SchemeResolutionOwner;
}

export interface SchemeReadiness {
  schemeVersionKey: string;
  completeCount: number;
  totalCount: number;
  /** Null when no applicable required data points are loaded. Never show
   * 100% merely because the denominator is empty. */
  percentage: number | null;
  assessable: boolean;
  items: SchemeReadinessItem[];
  alreadyKnown: SchemeReadinessItem[];
  needsYou: SchemeReadinessItem[];
  needsReview: SchemeReadinessItem[];
}

export type SchemeCaseStatus =
  | "DISCOVERED"
  | "ASSESSING"
  | "INFORMATION_MISSING"
  | "APPLICATION_READY"
  | "SUBMITTED_EXTERNALLY"
  | "OUTCOME_RECORDED"
  | "PAYMENT_EXPECTED"
  | "PAYMENT_RECEIVED"
  | "CLOSED";

export interface SchemeDeadlineAuthority {
  sourceId: string;
  sourceVersion: string;
  sourceFingerprintSha256: string;
}

export interface SchemeWorkCandidate {
  id: string;
  schemeVersionKey: string;
  ruleId: string;
  title: string;
  subject: SchemeSubject;
  reasonCodes: string[];
  priority: {
    tier: SystemPriorityTier;
    basis: string;
  };
  /** Canonical workflow Schemes expects Planning to open. Planning does
   * not own this data or workflow. */
  actionRoute?: SchemeDataRoute;
  recommendedWindow?: {
    opensAt?: string;
    dueAt?: string;
    boundary?: "inclusive" | "exclusive";
  };
  /** A hard deadline is allowed only when the rule has one uniquely
   * proven, current authority. */
  hardDeadline?: {
    dueAt: string;
    authority: SchemeDeadlineAuthority;
  };
  completion:
    | { kind: "DATA_COMPLETION"; dataKey: string }
    | { kind: "EVIDENCE"; evidenceKey: string }
    | { kind: "MANUAL"; note?: string };
}
