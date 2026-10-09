/**
 * Cattle C0 — versioned rule definitions, authority classes, version-bound
 * reviews and effective-date resolution.
 *
 * A rule version is immutable content: `computeRuleFingerprint` covers every
 * field except `productionState` (including the implementation identity),
 * and a review approves exactly one (ruleId, version, fingerprint). Approving
 * v1 therefore never approves v2, and rebinding a rule to a changed source or
 * implementation needs a new version and new reviews. Scientific, legal and veterinary reviews are separate dimensions.
 *
 * Classification minimums (required review dimension, accepted source
 * authority, hard-gate role) are governance architecture for later phases,
 * not cattle law or science. No real rule is defined in this module.
 */

import { isValidIsoUtcDateTime } from "../iso-datetime";
import type { AssessmentFingerprint } from "../assessment-integrity";
import type { CattleInputScalar, RequiredInputDescriptor } from "./information";
import { computeCattleFingerprint, compareStrings, sameFingerprint, sortedUnique, type CattleHash } from "./integrity";
import { compareSourceVersionRefs, findSourceVersion, type CattleEvidenceSource, type CattleSourceAuthorityKind, type SourceVersionRef } from "./source";

export type CattleRuleClassification =
  | "LEGAL_REQUIRED"
  | "LEGAL_CONDITIONAL"
  | "SCHEME_CONDITIONAL"
  | "VETERINARY_PROGRAMME"
  | "SCIENCE_TARGET"
  | "SCIENCE_CONSTRAINT"
  | "FARMER_INTENT"
  | "SYSTEM_INFERENCE";

export type CattleReviewDimension = "SCIENTIFIC" | "LEGAL" | "VETERINARY";

/** RESEARCH -> DRAFT -> VALIDATED -> APPROVED -> PRODUCTION -> SUPERSEDED,
 * with BLOCKED where evidence/sign-off is missing. Only PRODUCTION and
 * SUPERSEDED versions are ever selected for evaluation. */
export type CattleRuleProductionState = "RESEARCH" | "DRAFT" | "VALIDATED" | "APPROVED" | "PRODUCTION" | "SUPERSEDED" | "BLOCKED";

/** HARD_GATE outcomes take precedence over any downstream optimisation. */
export type CattleRuleGateRole = "HARD_GATE" | "ADVISORY";

export interface ApplicabilityCondition {
  input: RequiredInputDescriptor;
  equals: CattleInputScalar;
}

/** C0 supports only fail-closed policies. A sourced default would need an
 * explicitly modelled future policy variant, never an implicit fallback. */
export interface UnknownConflictPolicy {
  missingRequiredInput: "INSUFFICIENT_EVIDENCE";
  conflictingInput: "CONFLICTING_EVIDENCE";
}

export const FAIL_CLOSED_UNKNOWN_POLICY: UnknownConflictPolicy = {
  missingRequiredInput: "INSUFFICIENT_EVIDENCE",
  conflictingInput: "CONFLICTING_EVIDENCE",
};

export interface RuleVersionRef {
  ruleId: string;
  version: number;
}

/** Versioned identity of the executable logic that implements a rule
 * version. It is rule content: changing the implementation changes the rule
 * fingerprint, so it needs a new rule version and renewed approval. */
export interface RuleImplementationRef {
  implementationId: string;
  /** Positive integer; bump whenever the executable logic changes. */
  version: number;
  /** Fingerprint of the approved logic's own source text
   * (`computeImplementationLogicFingerprint`, `evaluation.ts`). Evaluation
   * recomputes it from the supplied predicate, so replacement logic keeping
   * the same id + version is rejected rather than run. */
  logicFingerprint: AssessmentFingerprint;
}

export interface CattleRuleVersion {
  ruleId: string;
  /** Positive integer; higher is later. */
  version: number;
  title: string;
  classification: CattleRuleClassification;
  gateRole: CattleRuleGateRole;
  jurisdiction: string | null;
  /** Calendar date `YYYY-MM-DD`, inclusive. */
  effectiveFrom: string;
  /** Calendar date `YYYY-MM-DD`, exclusive; `null` = open-ended. */
  effectiveTo: string | null;
  applicability: ApplicabilityCondition[];
  requiredInputs: RequiredInputDescriptor[];
  assumptions: string[];
  limitations: string[];
  unknownPolicy: UnknownConflictPolicy;
  sourceBindings: SourceVersionRef[];
  implementation: RuleImplementationRef;
  supersedes: RuleVersionRef | null;
  requiredReviews: CattleReviewDimension[];
  productionState: CattleRuleProductionState;
}

export const MINIMUM_REVIEW_DIMENSIONS: Record<CattleRuleClassification, CattleReviewDimension[]> = {
  LEGAL_REQUIRED: ["LEGAL"],
  LEGAL_CONDITIONAL: ["LEGAL"],
  SCHEME_CONDITIONAL: ["LEGAL"],
  VETERINARY_PROGRAMME: ["VETERINARY"],
  SCIENCE_TARGET: ["SCIENTIFIC"],
  SCIENCE_CONSTRAINT: ["SCIENTIFIC"],
  FARMER_INTENT: [],
  SYSTEM_INFERENCE: ["SCIENTIFIC"],
};

/** Source authority kinds that can ground each classification; `null` = no
 * source required (farmer intent). Advisory science can never ground a
 * legal rule. */
export const ACCEPTED_SOURCE_AUTHORITY: Record<CattleRuleClassification, CattleSourceAuthorityKind[] | null> = {
  LEGAL_REQUIRED: ["LEGISLATION", "REGULATORY_GUIDANCE"],
  LEGAL_CONDITIONAL: ["LEGISLATION", "REGULATORY_GUIDANCE"],
  SCHEME_CONDITIONAL: ["SCHEME_TERMS", "LEGISLATION", "REGULATORY_GUIDANCE"],
  VETERINARY_PROGRAMME: ["VETERINARY_PROGRAMME", "AUTHORISED_PRODUCT_INFORMATION"],
  SCIENCE_TARGET: ["PEER_REVIEWED_SCIENCE", "ADVISORY_SCIENCE"],
  SCIENCE_CONSTRAINT: ["PEER_REVIEWED_SCIENCE", "ADVISORY_SCIENCE"],
  FARMER_INTENT: null,
  SYSTEM_INFERENCE: [
    "LEGISLATION",
    "REGULATORY_GUIDANCE",
    "SCHEME_TERMS",
    "VETERINARY_PROGRAMME",
    "AUTHORISED_PRODUCT_INFORMATION",
    "PEER_REVIEWED_SCIENCE",
    "ADVISORY_SCIENCE",
    "FARM_RECORD",
    "ENGINE_INTERNAL",
  ],
};

const MANDATORY_HARD_GATE: ReadonlySet<CattleRuleClassification> = new Set(["LEGAL_REQUIRED", "LEGAL_CONDITIONAL"]);
const NEVER_HARD_GATE: ReadonlySet<CattleRuleClassification> = new Set(["FARMER_INTENT", "SYSTEM_INFERENCE"]);

export function isValidCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidIsoUtcDateTime(`${value}T00:00:00Z`);
}

export function ruleVersionRef(rule: CattleRuleVersion): RuleVersionRef {
  return { ruleId: rule.ruleId, version: rule.version };
}

export function compareRuleVersionRefs(a: RuleVersionRef, b: RuleVersionRef): number {
  return compareStrings(a.ruleId, b.ruleId) || a.version - b.version;
}

/** Fingerprint of the rule's content — everything except `productionState`,
 * which moves through its lifecycle without changing what the rule says.
 * Unordered lists are sorted; applicability/required inputs keep order. */
export function computeRuleFingerprint(rule: CattleRuleVersion, hash: CattleHash): AssessmentFingerprint {
  return computeCattleFingerprint(
    "CATTLE_RULE_DEFINITION",
    {
      ruleId: rule.ruleId,
      version: rule.version,
      title: rule.title,
      classification: rule.classification,
      gateRole: rule.gateRole,
      jurisdiction: rule.jurisdiction,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      applicability: rule.applicability,
      requiredInputs: rule.requiredInputs,
      assumptions: [...rule.assumptions].sort(compareStrings),
      limitations: [...rule.limitations].sort(compareStrings),
      unknownPolicy: rule.unknownPolicy,
      sourceBindings: [...rule.sourceBindings].sort(compareSourceVersionRefs),
      implementation: {
        implementationId: rule.implementation.implementationId,
        version: rule.implementation.version,
        logicFingerprint: rule.implementation.logicFingerprint,
      },
      supersedes: rule.supersedes,
      requiredReviews: sortedUnique(rule.requiredReviews),
    },
    hash,
  );
}

export interface RuleValidationResult {
  valid: boolean;
  issues: string[];
}

/** Structural validation of one rule version against the source catalogue.
 * Every issue is reported; a rule with any issue must not be evaluated. */
export function validateRuleVersion(rule: CattleRuleVersion, catalogue: readonly CattleEvidenceSource[]): RuleValidationResult {
  const issues: string[] = [];
  if (rule.ruleId.trim() === "") issues.push("CATTLE_RULE_EMPTY_ID");
  if (!Number.isInteger(rule.version) || rule.version < 1) issues.push("CATTLE_RULE_INVALID_VERSION");
  if (!isValidCalendarDate(rule.effectiveFrom)) issues.push("CATTLE_RULE_INVALID_EFFECTIVE_FROM");
  if (rule.effectiveTo !== null && !isValidCalendarDate(rule.effectiveTo)) issues.push("CATTLE_RULE_INVALID_EFFECTIVE_TO");
  if (rule.effectiveTo !== null && rule.effectiveTo <= rule.effectiveFrom) issues.push("CATTLE_RULE_EMPTY_EFFECTIVE_WINDOW");
  const logic = rule.implementation.logicFingerprint;
  if (
    rule.implementation.implementationId.trim() === "" ||
    !Number.isInteger(rule.implementation.version) ||
    rule.implementation.version < 1 ||
    typeof logic !== "object" ||
    logic === null ||
    logic.algorithm !== "SHA-256" ||
    typeof logic.digest !== "string" ||
    !/^[0-9a-f]{64}$/.test(logic.digest)
  ) {
    issues.push("CATTLE_RULE_INVALID_IMPLEMENTATION_REF");
  }
  for (const dimension of MINIMUM_REVIEW_DIMENSIONS[rule.classification]) {
    if (!rule.requiredReviews.includes(dimension)) issues.push(`CATTLE_RULE_MISSING_REQUIRED_REVIEW:${dimension}`);
  }
  if (MANDATORY_HARD_GATE.has(rule.classification) && rule.gateRole !== "HARD_GATE") issues.push("CATTLE_RULE_LEGAL_MUST_BE_HARD_GATE");
  if (NEVER_HARD_GATE.has(rule.classification) && rule.gateRole === "HARD_GATE") issues.push("CATTLE_RULE_CLASS_CANNOT_BE_HARD_GATE");
  if (rule.supersedes !== null && (rule.supersedes.ruleId !== rule.ruleId || rule.supersedes.version >= rule.version)) {
    issues.push("CATTLE_RULE_INVALID_SUPERSESSION");
  }
  const keys = rule.requiredInputs.map((i) => i.inputKey);
  if (new Set(keys).size !== keys.length) issues.push("CATTLE_RULE_DUPLICATE_REQUIRED_INPUT");
  for (const input of [...rule.requiredInputs, ...rule.applicability.map((c) => c.input)]) {
    if (input.acceptedClasses.length === 0) issues.push(`CATTLE_RULE_INPUT_ACCEPTS_NO_CLASS:${input.inputKey}`);
  }
  const accepted = ACCEPTED_SOURCE_AUTHORITY[rule.classification];
  const grounded = rule.sourceBindings.some((ref) => {
    const kinds = bindingAuthorityKinds(ref, catalogue);
    return accepted !== null && kinds.length > 0 && kinds.every((k) => accepted.includes(k));
  });
  if (accepted !== null && !grounded) issues.push("CATTLE_RULE_NO_AUTHORITATIVE_SOURCE_FOR_CLASSIFICATION");
  return { valid: issues.length === 0, issues };
}

/** Authority kind of a bound source: the exact bound version's kind, or —
 * when that version has left the catalogue — every recorded kind for the
 * source id. A missing/changed version is a source-change (review) state
 * reported by `checkSourceBinding`, not a rule-definition defect. */
function bindingAuthorityKinds(ref: SourceVersionRef, catalogue: readonly CattleEvidenceSource[]): CattleSourceAuthorityKind[] {
  const exact = findSourceVersion(ref, catalogue);
  if (exact !== null) return [exact.authorityKind];
  return sortedUnique(catalogue.filter((s) => s.sourceId === ref.sourceId).map((s) => s.authorityKind)) as CattleSourceAuthorityKind[];
}

export type RuleResolution =
  | { status: "RESOLVED"; rule: CattleRuleVersion }
  | { status: "NO_EFFECTIVE_VERSION"; ruleId: string; evaluationDate: string }
  | { status: "AMBIGUOUS_EFFECTIVE_VERSIONS"; ruleId: string; evaluationDate: string; versions: number[] }
  | { status: "INVALID_SUPERSESSION_LINEAGE"; ruleId: string; evaluationDate: string; issues: string[] }
  | { status: "INVALID_EVALUATION_DATE"; ruleId: string; evaluationDate: string };

function isEffectiveOn(rule: CattleRuleVersion, date: string): boolean {
  return rule.effectiveFrom <= date && (rule.effectiveTo === null || date < rule.effectiveTo);
}

/**
 * Every version transitively superseded by `start`, walked through the
 * complete PRODUCTION/SUPERSEDED `history` regardless of effective window, so
 * an expired intermediate still links its successor to its predecessor. Each
 * link must name exactly one history entry of the same rule with a strictly
 * lower version; anything else (missing/unreleased target, duplicate version,
 * cross-rule, non-decreasing or cyclic link) is reported, never skipped.
 */
function supersededAncestry(start: CattleRuleVersion, history: readonly CattleRuleVersion[]): { ancestors: Set<number>; issues: string[] } {
  const ancestors = new Set<number>();
  const issues: string[] = [];
  const visited = new Set<number>([start.version]);
  let current = start;
  while (current.supersedes !== null) {
    const link = `v${current.version}->${current.supersedes.ruleId}@v${current.supersedes.version}`;
    if (current.supersedes.ruleId !== start.ruleId) {
      issues.push(`CATTLE_RULE_SUPERSESSION_CROSS_RULE:${link}`);
      break;
    }
    if (visited.has(current.supersedes.version)) {
      issues.push(`CATTLE_RULE_SUPERSESSION_CYCLE:${link}`);
      break;
    }
    if (!(current.supersedes.version < current.version)) {
      issues.push(`CATTLE_RULE_SUPERSESSION_NOT_DECREASING:${link}`);
      break;
    }
    const target = current.supersedes.version;
    const matches = history.filter((r) => r.version === target);
    if (matches.length !== 1) {
      issues.push(`${matches.length === 0 ? "CATTLE_RULE_SUPERSESSION_TARGET_MISSING" : "CATTLE_RULE_SUPERSESSION_TARGET_DUPLICATED"}:${link}`);
      break;
    }
    visited.add(target);
    ancestors.add(target);
    current = matches[0];
  }
  return { ancestors, issues };
}

/**
 * Selects the single PRODUCTION/SUPERSEDED version of `ruleId` effective on
 * `evaluationDate`. A version transitively superseded by another effective
 * candidate is excluded; ancestry follows the complete PRODUCTION/SUPERSEDED
 * history, so expired intermediates still count. Malformed lineage reachable
 * from an effective candidate fails closed (INVALID_SUPERSESSION_LINEAGE);
 * none left fails closed (NO_EFFECTIVE_VERSION), more than one fails closed
 * (AMBIGUOUS). Draft/unapproved versions are never selected and never
 * establish lineage.
 */
export function resolveEffectiveRuleVersion(
  versions: readonly CattleRuleVersion[],
  ruleId: string,
  evaluationDate: string,
): RuleResolution {
  if (!isValidCalendarDate(evaluationDate)) return { status: "INVALID_EVALUATION_DATE", ruleId, evaluationDate };
  const history = versions.filter((r) => r.ruleId === ruleId && (r.productionState === "PRODUCTION" || r.productionState === "SUPERSEDED"));
  const effective = history.filter((r) => isEffectiveOn(r, evaluationDate));
  const lineages = effective.map((r) => supersededAncestry(r, history));
  const lineageIssues = sortedUnique(lineages.flatMap((l) => l.issues));
  if (lineageIssues.length > 0) return { status: "INVALID_SUPERSESSION_LINEAGE", ruleId, evaluationDate, issues: lineageIssues };
  const candidates = effective.filter((r) => !lineages.some((l) => l.ancestors.has(r.version)));
  if (candidates.length === 0) return { status: "NO_EFFECTIVE_VERSION", ruleId, evaluationDate };
  if (candidates.length > 1) {
    return { status: "AMBIGUOUS_EFFECTIVE_VERSIONS", ruleId, evaluationDate, versions: candidates.map((r) => r.version).sort((a, b) => a - b) };
  }
  return { status: "RESOLVED", rule: candidates[0] };
}

/** Exact historical lookup of any version, whatever its lifecycle state. */
export function getRuleVersion(versions: readonly CattleRuleVersion[], ref: RuleVersionRef): CattleRuleVersion | null {
  return versions.find((r) => r.ruleId === ref.ruleId && r.version === ref.version) ?? null;
}

// ---------------------------------------------------------------------------
// Version-bound reviews
// ---------------------------------------------------------------------------

export interface RuleReviewRecord {
  ruleId: string;
  ruleVersion: number;
  /** The exact rule content reviewed. */
  ruleFingerprint: AssessmentFingerprint;
  dimension: CattleReviewDimension;
  decision: "APPROVED" | "REJECTED";
  reviewerRef: string;
  reviewedAt: string;
}

export type ReviewDimensionState = "APPROVED" | "REJECTED" | "PENDING";

export interface RuleReviewStatus {
  rule: RuleVersionRef;
  ruleFingerprint: AssessmentFingerprint;
  /** Only the rule's required dimensions, each judged independently. */
  dimensions: { dimension: CattleReviewDimension; state: ReviewDimensionState }[];
  fullyApproved: boolean;
}

/**
 * Review state per required dimension, counting only records for this exact
 * rule id, version and content fingerprint (a record with an invalid
 * `reviewedAt` is ignored). The latest record per dimension wins; a same-instant APPROVED/REJECTED tie is REJECTED (fail closed).
 * A review in one dimension never satisfies another.
 */
export function evaluateRuleReviews(rule: CattleRuleVersion, reviews: readonly RuleReviewRecord[], hash: CattleHash): RuleReviewStatus {
  const ruleFingerprint = computeRuleFingerprint(rule, hash);
  const bound = reviews.filter(
    (r) => r.ruleId === rule.ruleId && r.ruleVersion === rule.version && sameFingerprint(r.ruleFingerprint, ruleFingerprint),
  );
  const dimensions = sortedUnique(rule.requiredReviews).map((d) => {
    const dimension = d as CattleReviewDimension;
    const records = bound.filter((r) => r.dimension === dimension && isValidIsoUtcDateTime(r.reviewedAt));
    if (records.length === 0) return { dimension, state: "PENDING" as const };
    const latestAt = Math.max(...records.map((r) => Date.parse(r.reviewedAt)));
    const latest = records.filter((r) => Date.parse(r.reviewedAt) === latestAt);
    return { dimension, state: latest.some((r) => r.decision === "REJECTED") ? ("REJECTED" as const) : ("APPROVED" as const) };
  });
  return {
    rule: ruleVersionRef(rule),
    ruleFingerprint,
    dimensions,
    fullyApproved: dimensions.every((d) => d.state === "APPROVED"),
  };
}
