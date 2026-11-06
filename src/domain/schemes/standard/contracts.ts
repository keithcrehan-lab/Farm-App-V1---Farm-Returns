import type { SchemeDataOwner } from "../contracts";
import type { StoredSchemeDefinition } from "../repository";

/**
 * Scheme Implementation Standard (S0) — typed form of the Requirement
 * Register, source pack, content pack and seed packet.
 *
 * Normative prose: docs/product/schemes/standard/SCHEME_IMPLEMENTATION_STANDARD.md.
 *
 * A content pack is a reviewed input and test fixture. Runtime code reads
 * scheme content from the database only and never falls back to one.
 */

/** Identity of one scheme version; the same triple is unique in
 * scheme_versions. */
export interface SchemeVersionPin {
  schemeKey: string;
  schemeYear: number;
  rulesVersion: string;
}

/** Campaign source hierarchy, 1 is the highest authority. Tier 4 is
 * explanation and worked examples only and can never carry a register row. */
export type SchemeSourceAuthorityTier = 1 | 2 | 3 | 4;

/** Values permitted by the scheme_sources.authority_tier CHECK constraint. */
export type StoredSchemeAuthorityTier =
  | "statute"
  | "dafm_official"
  | "eu_official"
  | "teagasc_technical"
  | "authoritative_secondary";

/** WHOLE_DOCUMENT holds the complete source. EXTRACT proves only the facts
 * it lists and cannot prove completeness by itself. */
export type SchemeSourceContentScope = "WHOLE_DOCUMENT" | "EXTRACT";

export type SchemeReviewScope =
  | "WHOLE_DOCUMENT_AGAINST_REGISTER"
  | "LISTED_FACTS_ONLY";

/** Who reviewed what and when, with the repository record that says so. */
export interface SchemeReviewRecord {
  reviewer: string;
  reviewedOn: string;
  scope: SchemeReviewScope;
  recordLocation: string;
}

export interface SchemeSourceRecord {
  sourceId: string;
  /** Edition of the source document itself. Rows cite id and edition. */
  sourceVersion: string;
  /** The one scheme version this record is pinned to. */
  pin: SchemeVersionPin;
  authorityTier: SchemeSourceAuthorityTier;
  storedAuthorityTier: StoredSchemeAuthorityTier;
  publisher: string;
  title: string;
  url: string;
  /** Null only with publicationDateAbsentReason: an undated source stays
   * visibly undated rather than borrowing another date. */
  publicationDate: string | null;
  publicationDateAbsentReason: string | null;
  retrievalDate: string;
  reviewRecord: SchemeReviewRecord | null;
  contentFingerprintSha256: string;
  archivedLocation: string;
  governsSchemeYear: number;
  contentScope: SchemeSourceContentScope;
}

export type SchemeSourcePackCompleteness =
  | { status: "NOT_CLAIMED"; reason: string }
  | {
      status: "CLAIMED";
      coveredSourceIds: string[];
      reviewRecord: SchemeReviewRecord;
    };

export interface SchemeSourcePack {
  pin: SchemeVersionPin;
  sources: SchemeSourceRecord[];
  completeness: SchemeSourcePackCompleteness;
}

export type RequirementKind =
  | "eligibility_condition"
  | "obligation"
  | "deadline"
  | "payment_rule"
  | "cap"
  | "exception"
  | "exclusion"
  | "reduction"
  | "penalty"
  | "evidence_requirement";

/**
 * Final statuses are IMPLEMENTED, UNSUPPORTED and NOT_APPLICABLE.
 * IMPLEMENTABLE exists only in a register frozen by a P1 phase, before the
 * P2 phase has built the engine rule; it claims nothing about behaviour and
 * coverage must replace it with a final status before seeding.
 */
export type RequirementImplementationStatus =
  | "IMPLEMENTED"
  | "IMPLEMENTABLE"
  | "UNSUPPORTED"
  | "NOT_APPLICABLE";

export type RequirementFinalStatus = Exclude<
  RequirementImplementationStatus,
  "IMPLEMENTABLE"
>;

export interface RequirementSourceCitation {
  sourceId: string;
  sourceVersion: string;
  /** Where in the source: section, page, table, clause. */
  locator: string;
  /** Reference to the exact wording in the archived source. */
  wordingReference: string;
}

export interface RequirementDataKey {
  key: string;
  owner: SchemeDataOwner;
}

export interface RequirementRegisterRow {
  id: string;
  pin: SchemeVersionPin;
  kind: RequirementKind;
  source: RequirementSourceCitation;
  applicability: string;
  dataKeys: RequirementDataKey[];
  status: RequirementImplementationStatus;
  /** Required for UNSUPPORTED and NOT_APPLICABLE, otherwise null. */
  reason: string | null;
  /** The stored rule_key evaluating this row. */
  engineRuleRef: string | null;
  testRef: string | null;
}

export interface RequirementRegister {
  pin: SchemeVersionPin;
  rows: RequirementRegisterRow[];
}

export const SCHEME_CONTENT_PACK_FORMAT_VERSION = 1;
export const SCHEME_SEED_PACKET_FORMAT_VERSION = 1;

export interface SchemeContentPackSupersession {
  pin: SchemeVersionPin;
  contentFingerprintSha256: string;
}

export interface SchemeContentPack {
  formatVersion: typeof SCHEME_CONTENT_PACK_FORMAT_VERSION;
  pin: SchemeVersionPin;
  sourcePack: SchemeSourcePack;
  register: RequirementRegister;
  /** The retained version this one replaces. It is never edited. */
  supersedes: SchemeContentPackSupersession | null;
  contentFingerprintSha256: string;
}

/** The final disposition of one frozen register row, published by the P2
 * phase because the P1 directory is frozen. */
export interface RequirementCoverageEntry {
  rowId: string;
  status: RequirementFinalStatus;
  reason: string | null;
  engineRuleRef: string | null;
  testRef: string | null;
}

/** A stored version this packet replaces. Its rows stay; this packet adds
 * a new version row rather than rewriting them. */
export interface SchemeSeedPriorStoredVersion {
  rulesVersion: string;
  differences: string[];
}

export interface SchemeSeedPacket {
  formatVersion: typeof SCHEME_SEED_PACKET_FORMAT_VERSION;
  pin: SchemeVersionPin;
  contentPackFingerprintSha256: string;
  /** Exact rows: scheme_catalogue and scheme_versions from version, then
   * scheme_sources, scheme_rules and scheme_rule_inputs. */
  definition: StoredSchemeDefinition;
  coverage: RequirementCoverageEntry[];
  priorStoredVersion: SchemeSeedPriorStoredVersion | null;
  packetFingerprintSha256: string;
}

export interface SchemeStandardIssue {
  code: SchemeStandardIssueCode;
  detail: string;
  rowId?: string;
  sourceId?: string;
  dataKey?: string;
  ruleKey?: string;
}

export type SchemeStandardIssueCode =
  // Shared structure
  | "PIN_INVALID"
  | "MALFORMED"
  // Source pack
  | "SOURCE_PACK_EMPTY"
  | "SOURCE_ID_INVALID"
  | "SOURCE_DUPLICATE_ID"
  | "SOURCE_FIELD_INVALID"
  | "SOURCE_TIER_INVALID"
  | "SOURCE_NO_FINGERPRINT"
  | "SOURCE_FINGERPRINT_MALFORMED"
  | "SOURCE_NO_YEAR"
  | "SOURCE_OTHER_YEAR"
  | "SOURCE_OTHER_VERSION"
  | "SOURCE_DATE_INVALID"
  | "SOURCE_DATE_ORDER"
  | "SOURCE_REVIEW_RECORD_INVALID"
  | "COMPLETENESS_STATE_INVALID"
  | "COMPLETENESS_NO_REVIEW_RECORD"
  | "COMPLETENESS_REVIEW_RECORD_INVALID"
  | "COMPLETENESS_NO_SOURCES"
  | "COMPLETENESS_SOURCE_UNRESOLVED"
  | "COMPLETENESS_NO_AUTHORITATIVE_SOURCE"
  | "COMPLETENESS_AUTHORITATIVE_SOURCE_NOT_COVERED"
  | "COMPLETENESS_EXTRACT_NOT_REVIEWED"
  // Register
  | "REGISTER_EMPTY"
  | "REGISTER_OTHER_VERSION"
  | "REGISTER_ROW_ID_INVALID"
  | "REGISTER_ROW_DUPLICATE_ID"
  | "REGISTER_ROW_OTHER_VERSION"
  | "REGISTER_ROW_KIND_INVALID"
  | "REGISTER_ROW_NO_SOURCE"
  | "REGISTER_ROW_SOURCE_INCOMPLETE"
  | "REGISTER_ROW_SOURCE_UNRESOLVED"
  | "REGISTER_ROW_SOURCE_EDITION_MISMATCH"
  | "REGISTER_ROW_SOURCE_OTHER_VERSION"
  | "REGISTER_ROW_ADVISORY_SOURCE"
  | "REGISTER_ROW_NO_APPLICABILITY"
  | "REGISTER_ROW_DATA_KEY_INVALID"
  | "REGISTER_ROW_DATA_KEY_OWNER_MISMATCH"
  | "REGISTER_ROW_DATA_KEY_OWNER_CONFLICT"
  | "REGISTER_ROW_DATA_KEY_UNREGISTERED"
  | "REGISTER_ROW_STATUS_INVALID"
  | "REGISTER_ROW_UNSUPPORTED_NO_REASON"
  | "REGISTER_ROW_NOT_APPLICABLE_NO_REASON"
  | "REGISTER_ROW_REASON_NOT_ALLOWED"
  | "REGISTER_ROW_IMPLEMENTED_NO_REFERENCE"
  | "REGISTER_ROW_REFERENCE_NOT_ALLOWED"
  | "REGISTER_ROW_REFERENCE_INVALID"
  // Content pack
  | "CONTENT_PACK_FORMAT_UNSUPPORTED"
  | "CONTENT_PACK_OTHER_VERSION"
  | "CONTENT_PACK_NO_COMPLETENESS_CLAIM"
  | "CONTENT_PACK_SUPERSESSION_INVALID"
  | "CONTENT_PACK_FINGERPRINT_MISMATCH"
  | "CONTENT_PACK_FINGERPRINT_UNVERIFIABLE"
  // Coverage
  | "COVERAGE_ROW_MISSING"
  | "COVERAGE_ROW_UNKNOWN"
  | "COVERAGE_ROW_DUPLICATE"
  | "COVERAGE_ROW_NOT_FINAL"
  | "COVERAGE_TRANSITION_NOT_ALLOWED"
  | "COVERAGE_UNSUPPORTED_NO_REASON"
  | "COVERAGE_NOT_APPLICABLE_NO_REASON"
  | "COVERAGE_REASON_NOT_ALLOWED"
  | "COVERAGE_IMPLEMENTED_NO_REFERENCE"
  | "COVERAGE_REFERENCE_INVALID"
  | "COVERAGE_DATA_KEY_UNREGISTERED"
  // Seed packet
  | "SEED_FORMAT_UNSUPPORTED"
  | "SEED_DOCUMENT_INVALID"
  | "SEED_CONTENT_PACK_INVALID"
  | "SEED_CONTENT_PACK_MISMATCH"
  | "SEED_OTHER_VERSION"
  | "SEED_DEFINITION_MALFORMED"
  | "SEED_DEFINITION_INVALID"
  | "SEED_PUBLICATION_STATE_NOT_ALLOWED"
  | "SEED_ROW_OTHER_VERSION"
  | "SEED_DUPLICATE_KEY"
  | "SEED_SOURCE_MISSING"
  | "SEED_SOURCE_NOT_IN_PACK"
  | "SEED_SOURCE_MISMATCH"
  | "SEED_RULE_NOT_IN_REGISTER"
  | "SEED_RULE_REFERENCE_UNRESOLVED"
  | "SEED_RULE_SOURCE_MISMATCH"
  | "SEED_RULE_INPUT_NOT_IN_REGISTER"
  | "SEED_ROW_KEY_NOT_IN_RULE"
  | "SEED_PRIOR_VERSION_INVALID"
  | "SEED_PACKET_FINGERPRINT_MISMATCH"
  | "SEED_PACKET_FINGERPRINT_UNVERIFIABLE";
