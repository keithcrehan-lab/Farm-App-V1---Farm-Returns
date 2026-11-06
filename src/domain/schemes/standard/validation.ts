import { computeAssessmentFingerprint } from "../../assessment-integrity";
import { isValidCalendarDate } from "../../cattle/rule";
import { isValidIsoUtcDateTime } from "../../iso-datetime";
import type { SchemeDataOwner, SchemeResolutionOwner } from "../contracts";
import { registeredSchemeDataKey } from "../data-keys";
import type {
  SchemePublicationState,
  StoredSchemeDefinition,
  StoredSchemeRule,
  StoredSchemeRuleInput,
  StoredSchemeSource,
  StoredSchemeVersion,
} from "../repository";
import { validateStoredSchemeDefinition } from "../validation";
import {
  SCHEME_CONTENT_PACK_FORMAT_VERSION,
  SCHEME_SEED_PACKET_FORMAT_VERSION,
  type RequirementFinalStatus,
  type RequirementImplementationStatus,
  type RequirementKind,
  type RequirementRegisterRow,
  type SchemeContentPack,
  type SchemeSeedPacket,
  type SchemeSourceAuthorityTier,
  type SchemeSourceRecord,
  type SchemeStandardIssue,
  type SchemeVersionPin,
  type StoredSchemeAuthorityTier,
} from "./contracts";

/**
 * Fail-closed validators for scheme content. Each takes unknown input,
 * reports every issue it finds and never throws, so malformed content is a
 * reported result rather than an unhandled path. An empty array is the only
 * passing result.
 *
 * Hashing is injected, as in assessment-integrity.ts, so this module stays
 * pure and Node-independent.
 */

export type SchemeContentHash = (input: string) => string;

// Same formats as the scheme_catalogue, scheme_versions and scheme_sources
// CHECK constraints.
const SCHEME_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MIN_SCHEME_YEAR = 2000;
const MAX_SCHEME_YEAR = 2100;
const MAX_RULES_VERSION_LENGTH = 120;
const MAX_RULE_INPUT_PRIORITY = 10000;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

/** SHA-256 of the empty string. A stub or wrong hash function fails this,
 * so it cannot make two different packs verify as the same content. */
const SHA256_OF_EMPTY_STRING =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const REQUIREMENT_KINDS: Record<RequirementKind, true> = {
  eligibility_condition: true,
  obligation: true,
  deadline: true,
  payment_rule: true,
  cap: true,
  exception: true,
  exclusion: true,
  reduction: true,
  penalty: true,
  evidence_requirement: true,
};

const IMPLEMENTATION_STATUSES: Record<RequirementImplementationStatus, true> = {
  IMPLEMENTED: true,
  IMPLEMENTABLE: true,
  UNSUPPORTED: true,
  NOT_APPLICABLE: true,
};

const DATA_OWNERS: Record<SchemeDataOwner, true> = {
  farm_profile: true,
  fields: true,
  livestock: true,
  cattle: true,
  schemes: true,
  sheep: true,
};

/** Which stored authority_tier values each hierarchy tier may be seeded as.
 * Official scheme terms are tier 1 and are published by DAFM. */
const STORED_TIERS_BY_AUTHORITY_TIER: Record<
  SchemeSourceAuthorityTier,
  readonly StoredSchemeAuthorityTier[]
> = {
  1: ["statute", "eu_official", "dafm_official"],
  2: ["dafm_official"],
  3: ["authoritative_secondary"],
  4: ["teagasc_technical", "authoritative_secondary"],
};

/** A final status a frozen row may reach. Anything else needs a new version. */
const COVERAGE_TRANSITIONS: Record<
  RequirementImplementationStatus,
  readonly RequirementFinalStatus[]
> = {
  IMPLEMENTABLE: ["IMPLEMENTED", "UNSUPPORTED"],
  IMPLEMENTED: ["IMPLEMENTED"],
  UNSUPPORTED: ["UNSUPPORTED"],
  NOT_APPLICABLE: ["NOT_APPLICABLE"],
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Array every() and some() skip holes, which later traversal dereferences.
 * for...of visits each position, a hole as undefined. */
function everyPosition(
  items: readonly unknown[],
  check: (item: unknown) => boolean,
): boolean {
  for (const item of items) {
    if (!check(item)) return false;
  }
  return true;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/** Malformed values never reach a diagnostic: formatting one can throw. */
const textContext = (value: unknown) => (typeof value === "string" ? value : undefined);

function isCalendarDate(value: unknown): value is string {
  return typeof value === "string" && isValidCalendarDate(value);
}

function isSchemeYear(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_SCHEME_YEAR &&
    value <= MAX_SCHEME_YEAR
  );
}

function isVersionPin(value: unknown): value is SchemeVersionPin {
  return (
    isRecord(value) &&
    typeof value.schemeKey === "string" &&
    SCHEME_KEY_PATTERN.test(value.schemeKey) &&
    isSchemeYear(value.schemeYear) &&
    isText(value.rulesVersion) &&
    value.rulesVersion.length <= MAX_RULES_VERSION_LENGTH
  );
}

export function sameSchemeVersionPin(
  a: SchemeVersionPin,
  b: SchemeVersionPin,
): boolean {
  return (
    a.schemeKey === b.schemeKey &&
    a.schemeYear === b.schemeYear &&
    a.rulesVersion === b.rulesVersion
  );
}

/** A repository-relative path or archive key, never outside the archive. */
function isArchiveLocation(value: unknown): value is string {
  return (
    isText(value) &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.split("/").includes("..")
  );
}

function isHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function isNullableText(value: unknown): value is string | null {
  return value === null || isText(value);
}

function isReviewRecord(value: unknown): value is UnknownRecord {
  return (
    isRecord(value) &&
    isText(value.reviewer) &&
    isCalendarDate(value.reviewedOn) &&
    (value.scope === "WHOLE_DOCUMENT_AGAINST_REGISTER" ||
      value.scope === "LISTED_FACTS_ONLY") &&
    isArchiveLocation(value.recordLocation)
  );
}

function coversWholeDocument(record: unknown): boolean {
  return (
    isReviewRecord(record) && record.scope === "WHOLE_DOCUMENT_AGAINST_REGISTER"
  );
}

function validateSourceRecord(
  input: unknown,
  packPin: SchemeVersionPin | null,
  issues: SchemeStandardIssue[],
): void {
  if (!isRecord(input)) {
    issues.push({ code: "MALFORMED", detail: "A source must be an object." });
    return;
  }

  const sourceId = typeof input.sourceId === "string" ? input.sourceId : undefined;
  const push = (code: SchemeStandardIssue["code"], detail: string) =>
    issues.push({ code, detail, sourceId });

  if (!sourceId || !ID_PATTERN.test(sourceId)) {
    push("SOURCE_ID_INVALID", "A source needs a stable id.");
  }

  for (const field of ["sourceVersion", "publisher", "title"]) {
    if (!isText(input[field])) {
      push("SOURCE_FIELD_INVALID", `A source needs ${field}.`);
    }
  }
  if (!isHttpUrl(input.url)) {
    push("SOURCE_FIELD_INVALID", "A source needs an http(s) URL.");
  }
  if (!isArchiveLocation(input.archivedLocation)) {
    push("SOURCE_FIELD_INVALID", "A source needs a relative archived location.");
  }
  if (
    input.contentScope !== "WHOLE_DOCUMENT" &&
    input.contentScope !== "EXTRACT"
  ) {
    push("SOURCE_FIELD_INVALID", "contentScope must be WHOLE_DOCUMENT or EXTRACT.");
  }

  const allowedStoredTiers =
    typeof input.authorityTier === "number"
      ? STORED_TIERS_BY_AUTHORITY_TIER[
          input.authorityTier as SchemeSourceAuthorityTier
        ]
      : undefined;
  if (
    !allowedStoredTiers ||
    !allowedStoredTiers.includes(
      input.storedAuthorityTier as StoredSchemeAuthorityTier,
    )
  ) {
    push(
      "SOURCE_TIER_INVALID",
      "The authority tier and stored tier must be a permitted pair.",
    );
  }

  if (!input.contentFingerprintSha256) {
    push("SOURCE_NO_FINGERPRINT", "A source needs a SHA-256 content fingerprint.");
  } else if (
    typeof input.contentFingerprintSha256 !== "string" ||
    !SHA256_PATTERN.test(input.contentFingerprintSha256)
  ) {
    push(
      "SOURCE_FINGERPRINT_MALFORMED",
      "A fingerprint must be 64 lowercase hex characters.",
    );
  }

  if (input.governsSchemeYear === undefined || input.governsSchemeYear === null) {
    push("SOURCE_NO_YEAR", "A source must state the scheme year it governs.");
  } else if (!isSchemeYear(input.governsSchemeYear)) {
    push("SOURCE_NO_YEAR", "The governed scheme year is not a valid year.");
  } else if (packPin && input.governsSchemeYear !== packPin.schemeYear) {
    push("SOURCE_OTHER_YEAR", "The source governs a different scheme year.");
  }

  if (!isVersionPin(input.pin)) {
    push("PIN_INVALID", "A source must be pinned to one scheme version.");
  } else if (packPin && !sameSchemeVersionPin(input.pin, packPin)) {
    push("SOURCE_OTHER_VERSION", "The source is pinned to another scheme version.");
  }

  if (!isCalendarDate(input.retrievalDate)) {
    push("SOURCE_DATE_INVALID", "A source needs a real retrieval date.");
  }
  if (input.publicationDate === null) {
    if (!isText(input.publicationDateAbsentReason)) {
      push(
        "SOURCE_DATE_INVALID",
        "An undated source must say why it has no publication date.",
      );
    }
  } else if (!isCalendarDate(input.publicationDate)) {
    push("SOURCE_DATE_INVALID", "The publication date is not a real date.");
  } else if (input.publicationDateAbsentReason !== null) {
    push(
      "SOURCE_DATE_INVALID",
      "A dated source cannot also give a reason for having no date.",
    );
  } else if (
    isCalendarDate(input.retrievalDate) &&
    input.publicationDate > input.retrievalDate
  ) {
    push("SOURCE_DATE_ORDER", "A source cannot be retrieved before publication.");
  }

  if (input.reviewRecord !== null) {
    if (!isReviewRecord(input.reviewRecord)) {
      push(
        "SOURCE_REVIEW_RECORD_INVALID",
        "A review record needs a reviewer, date, scope and record location; use null when there is none.",
      );
    } else if (
      isCalendarDate(input.retrievalDate) &&
      (input.reviewRecord.reviewedOn as string) < input.retrievalDate
    ) {
      push("SOURCE_DATE_ORDER", "A source cannot be reviewed before retrieval.");
    }
  }
}

function validateCompleteness(
  input: unknown,
  sources: readonly UnknownRecord[],
  issues: SchemeStandardIssue[],
): void {
  if (!isRecord(input)) {
    issues.push({
      code: "COMPLETENESS_STATE_INVALID",
      detail: "A source pack must state whether it claims completeness.",
    });
    return;
  }

  if (input.status === "NOT_CLAIMED") {
    if (!isText(input.reason)) {
      issues.push({
        code: "COMPLETENESS_STATE_INVALID",
        detail: "A pack that claims no completeness must say why.",
      });
    }
    return;
  }

  if (input.status !== "CLAIMED") {
    issues.push({
      code: "COMPLETENESS_STATE_INVALID",
      detail: "Completeness status must be CLAIMED or NOT_CLAIMED.",
    });
    return;
  }

  if (input.reviewRecord === undefined || input.reviewRecord === null) {
    issues.push({
      code: "COMPLETENESS_NO_REVIEW_RECORD",
      detail: "A completeness claim needs a review record.",
    });
  } else if (!coversWholeDocument(input.reviewRecord)) {
    issues.push({
      code: "COMPLETENESS_REVIEW_RECORD_INVALID",
      detail:
        "The claim's review record must be complete and cover the whole documents against the register.",
    });
  }

  const covered = Array.isArray(input.coveredSourceIds)
    ? input.coveredSourceIds
    : [];
  if (covered.length === 0) {
    issues.push({
      code: "COMPLETENESS_NO_SOURCES",
      detail: "A completeness claim must name the sources it covers.",
    });
  }

  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const coveredRecords: UnknownRecord[] = [];
  for (const sourceId of covered) {
    if (typeof sourceId !== "string") {
      issues.push({
        code: "COMPLETENESS_SOURCE_UNRESOLVED",
        detail: "A covered source id must be text.",
      });
      continue;
    }
    const source = sourceById.get(sourceId);
    if (!source) {
      issues.push({
        code: "COMPLETENESS_SOURCE_UNRESOLVED",
        detail: "A covered source is not in this pack.",
        sourceId,
      });
      continue;
    }
    coveredRecords.push(source);

    if (source.contentScope !== "WHOLE_DOCUMENT" && !coversWholeDocument(source.reviewRecord)) {
      issues.push({
        code: "COMPLETENESS_EXTRACT_NOT_REVIEWED",
        detail:
          "An extract supports a claim only with a record that the whole document was reviewed against the register.",
        sourceId,
      });
    }
    if (
      isReviewRecord(input.reviewRecord) &&
      isCalendarDate(source.retrievalDate) &&
      (input.reviewRecord.reviewedOn as string) < source.retrievalDate
    ) {
      issues.push({
        code: "SOURCE_DATE_ORDER",
        detail: "The claim's review predates the retrieval of a covered source.",
        sourceId,
      });
    }
  }

  const authoritative = (source: UnknownRecord) =>
    source.authorityTier === 1 || source.authorityTier === 2;
  if (covered.length > 0 && !coveredRecords.some(authoritative)) {
    issues.push({
      code: "COMPLETENESS_NO_AUTHORITATIVE_SOURCE",
      detail: "A completeness claim must rest on at least one tier 1 or 2 source.",
    });
  }
  for (const source of sources.filter(authoritative)) {
    if (!covered.includes(source.sourceId)) {
      issues.push({
        code: "COMPLETENESS_AUTHORITATIVE_SOURCE_NOT_COVERED",
        detail: "A claim cannot leave out a tier 1 or 2 source in its own pack.",
        sourceId: textContext(source.sourceId),
      });
    }
  }
}

function validateSchemeSourcePackUnsafe(input: unknown): SchemeStandardIssue[] {
  if (!isRecord(input)) {
    return [{ code: "MALFORMED", detail: "A source pack must be an object." }];
  }

  const issues: SchemeStandardIssue[] = [];
  const pin = isVersionPin(input.pin) ? input.pin : null;
  if (!pin) {
    issues.push({ code: "PIN_INVALID", detail: "A source pack needs a valid version pin." });
  }

  if (!Array.isArray(input.sources)) {
    issues.push({ code: "MALFORMED", detail: "sources must be an array." });
    return issues;
  }
  if (input.sources.length === 0) {
    issues.push({ code: "SOURCE_PACK_EMPTY", detail: "A source pack needs at least one source." });
  }

  const seen = new Set<string>();
  for (const source of input.sources) {
    validateSourceRecord(source, pin, issues);
    if (isRecord(source) && typeof source.sourceId === "string") {
      const folded = source.sourceId.toLowerCase();
      if (seen.has(folded)) {
        issues.push({
          code: "SOURCE_DUPLICATE_ID",
          detail: "Source ids must be unique in a pack.",
          sourceId: source.sourceId,
        });
      }
      seen.add(folded);
    }
  }

  validateCompleteness(input.completeness, input.sources.filter(isRecord), issues);
  return issues;
}

function validateRowDataKeys(
  row: UnknownRecord,
  rowId: string | undefined,
  ownerByKey: Map<string, unknown>,
  issues: SchemeStandardIssue[],
): void {
  if (!Array.isArray(row.dataKeys)) {
    issues.push({
      code: "REGISTER_ROW_DATA_KEY_INVALID",
      detail: "dataKeys must be an array; use an empty array when there are none.",
      rowId,
    });
    return;
  }

  for (const entry of row.dataKeys) {
    if (
      !isRecord(entry) ||
      !isText(entry.key) ||
      typeof entry.owner !== "string" ||
      !Object.hasOwn(DATA_OWNERS, entry.owner)
    ) {
      issues.push({
        code: "REGISTER_ROW_DATA_KEY_INVALID",
        detail: "A data key needs a key and a known owner.",
        rowId,
      });
      continue;
    }

    const dataKey = entry.key;
    const registered = registeredSchemeDataKey(dataKey);
    if (
      (registered && registered.owner !== entry.owner) ||
      dataKey.startsWith("schemes.") !== (entry.owner === "schemes")
    ) {
      issues.push({
        code: "REGISTER_ROW_DATA_KEY_OWNER_MISMATCH",
        detail: "The stated owner is not this fact's canonical owner.",
        rowId,
        dataKey,
      });
    }
    if (!registered && row.status === "IMPLEMENTED") {
      issues.push({
        code: "REGISTER_ROW_DATA_KEY_UNREGISTERED",
        detail: "An implemented row can read only registered data keys.",
        rowId,
        dataKey,
      });
    }
    if (ownerByKey.has(dataKey) && ownerByKey.get(dataKey) !== entry.owner) {
      issues.push({
        code: "REGISTER_ROW_DATA_KEY_OWNER_CONFLICT",
        detail: "Two rows claim different owners for one data key.",
        rowId,
        dataKey,
      });
    }
    if (!ownerByKey.has(dataKey)) ownerByKey.set(dataKey, entry.owner);
  }
}

function validateRowStatus(
  row: UnknownRecord,
  rowId: string | undefined,
  issues: SchemeStandardIssue[],
): void {
  const push = (code: SchemeStandardIssue["code"], detail: string) =>
    issues.push({ code, detail, rowId });

  if (typeof row.status !== "string" || !Object.hasOwn(IMPLEMENTATION_STATUSES, row.status)) {
    push("REGISTER_ROW_STATUS_INVALID", "The row has no valid implementation status.");
    return;
  }

  if (!isNullableText(row.engineRuleRef) || !isNullableText(row.testRef)) {
    push(
      "REGISTER_ROW_REFERENCE_INVALID",
      "engineRuleRef and testRef must each be text or null.",
    );
  }

  switch (row.status as RequirementImplementationStatus) {
    case "IMPLEMENTED":
      if (!isText(row.engineRuleRef) || !isText(row.testRef)) {
        push(
          "REGISTER_ROW_IMPLEMENTED_NO_REFERENCE",
          "An implemented row needs an engine rule and a test.",
        );
      }
      if (row.reason !== null) {
        push("REGISTER_ROW_REASON_NOT_ALLOWED", "An implemented row has no reason.");
      }
      break;
    case "IMPLEMENTABLE":
      if (row.engineRuleRef !== null || row.testRef !== null) {
        push(
          "REGISTER_ROW_REFERENCE_NOT_ALLOWED",
          "A row not yet built cannot cite an engine rule or test.",
        );
      }
      if (row.reason !== null) {
        push("REGISTER_ROW_REASON_NOT_ALLOWED", "An implementable row has no reason.");
      }
      break;
    case "UNSUPPORTED":
      if (!isText(row.reason)) {
        push("REGISTER_ROW_UNSUPPORTED_NO_REASON", "An UNSUPPORTED row needs a reason.");
      }
      break;
    case "NOT_APPLICABLE":
      if (!isText(row.reason)) {
        push("REGISTER_ROW_NOT_APPLICABLE_NO_REASON", "A NOT_APPLICABLE row needs a reason.");
      }
      if (row.engineRuleRef !== null || row.testRef !== null) {
        push(
          "REGISTER_ROW_REFERENCE_NOT_ALLOWED",
          "A NOT_APPLICABLE row cannot cite an engine rule or test.",
        );
      }
      break;
  }
}

function validateRowSource(
  row: UnknownRecord,
  rowId: string | undefined,
  rowPin: SchemeVersionPin | null,
  sourceById: ReadonlyMap<unknown, UnknownRecord>,
  issues: SchemeStandardIssue[],
): void {
  const citation = row.source;
  if (!isRecord(citation) || !isText(citation.sourceId)) {
    issues.push({
      code: "REGISTER_ROW_NO_SOURCE",
      detail: "Every row, including an unsupported one, needs a source.",
      rowId,
    });
    return;
  }

  const sourceId = citation.sourceId;
  const push = (code: SchemeStandardIssue["code"], detail: string) =>
    issues.push({ code, detail, rowId, sourceId });

  if (
    !isText(citation.sourceVersion) ||
    !isText(citation.locator) ||
    !isText(citation.wordingReference)
  ) {
    push(
      "REGISTER_ROW_SOURCE_INCOMPLETE",
      "A citation needs the source edition, a locator and a wording reference.",
    );
  }

  const source = sourceById.get(sourceId);
  if (!source) {
    push("REGISTER_ROW_SOURCE_UNRESOLVED", "The cited source is not in the source pack.");
    return;
  }
  if (source.sourceVersion !== citation.sourceVersion) {
    push("REGISTER_ROW_SOURCE_EDITION_MISMATCH", "The row cites another edition of the source.");
  }
  if (!rowPin || !isVersionPin(source.pin) || !sameSchemeVersionPin(source.pin, rowPin)) {
    push(
      "REGISTER_ROW_SOURCE_OTHER_VERSION",
      "A row can cite only a source pinned to its own scheme version.",
    );
  }
  if (source.authorityTier === 4) {
    push(
      "REGISTER_ROW_ADVISORY_SOURCE",
      "Tier 4 material is explanation only and cannot carry a requirement.",
    );
  }
}

function validateRequirementRegisterUnsafe(
  input: unknown,
  sourcePack: unknown,
  sourcePackAlreadyValidated = false,
): SchemeStandardIssue[] {
  if (!isRecord(input)) {
    return [{ code: "MALFORMED", detail: "A register must be an object." }];
  }

  // The standalone register boundary must never certify rows against an
  // untrusted source pack. Keep those pack issues while continuing far enough
  // to report precise row/source mismatches too. Content-pack validation has
  // already performed this check and opts out to avoid duplicate diagnostics.
  const issues: SchemeStandardIssue[] = sourcePackAlreadyValidated
    ? []
    : [...validateSchemeSourcePack(sourcePack)];
  const pin = isVersionPin(input.pin) ? input.pin : null;
  if (!pin) {
    issues.push({ code: "PIN_INVALID", detail: "A register needs a valid version pin." });
  }

  const packSources =
    isRecord(sourcePack) && Array.isArray(sourcePack.sources)
      ? sourcePack.sources.filter(isRecord)
      : [];
  const packPin =
    isRecord(sourcePack) && isVersionPin(sourcePack.pin) ? sourcePack.pin : null;
  if (pin && (!packPin || !sameSchemeVersionPin(pin, packPin))) {
    issues.push({
      code: "REGISTER_OTHER_VERSION",
      detail: "A register and its source pack must pin the same scheme version.",
    });
  }

  if (!Array.isArray(input.rows)) {
    issues.push({ code: "MALFORMED", detail: "rows must be an array." });
    return issues;
  }
  if (input.rows.length === 0) {
    issues.push({ code: "REGISTER_EMPTY", detail: "A register needs at least one row." });
  }

  const sourceById = new Map<unknown, UnknownRecord>(
    packSources.map((source) => [source.sourceId, source]),
  );
  const seenIds = new Set<string>();
  const ownerByKey = new Map<string, unknown>();

  for (const row of input.rows) {
    if (!isRecord(row)) {
      issues.push({ code: "MALFORMED", detail: "A register row must be an object." });
      continue;
    }

    const rowId = typeof row.id === "string" ? row.id : undefined;
    if (!rowId || !ID_PATTERN.test(rowId)) {
      issues.push({ code: "REGISTER_ROW_ID_INVALID", detail: "A row needs a stable id.", rowId });
    }
    if (rowId) {
      const folded = rowId.toLowerCase();
      if (seenIds.has(folded)) {
        issues.push({
          code: "REGISTER_ROW_DUPLICATE_ID",
          detail: "Row ids must be unique in a register.",
          rowId,
        });
      }
      seenIds.add(folded);
    }

    const rowPin = isVersionPin(row.pin) ? row.pin : null;
    if (!rowPin) {
      issues.push({ code: "PIN_INVALID", detail: "A row needs a valid version pin.", rowId });
    } else if (pin && !sameSchemeVersionPin(rowPin, pin)) {
      issues.push({
        code: "REGISTER_ROW_OTHER_VERSION",
        detail: "The row belongs to another scheme version.",
        rowId,
      });
    }

    if (typeof row.kind !== "string" || !Object.hasOwn(REQUIREMENT_KINDS, row.kind)) {
      issues.push({ code: "REGISTER_ROW_KIND_INVALID", detail: "The row has no valid kind.", rowId });
    }
    if (!isText(row.applicability)) {
      issues.push({
        code: "REGISTER_ROW_NO_APPLICABILITY",
        detail: "A row must state to whom it applies.",
        rowId,
      });
    }

    validateRowSource(row, rowId, rowPin, sourceById, issues);
    validateRowDataKeys(row, rowId, ownerByKey, issues);
    validateRowStatus(row, rowId, issues);
  }

  return issues;
}

function fingerprintWithout(
  kind: string,
  value: object,
  fingerprintField: string,
  hash: SchemeContentHash,
): string {
  const content = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== fingerprintField),
  );
  return computeAssessmentFingerprint({ kind, content }, hash).digest;
}

export function computeSchemeContentPackFingerprint(
  pack: Omit<SchemeContentPack, "contentFingerprintSha256">,
  hash: SchemeContentHash,
): string {
  return fingerprintWithout(
    "scheme_content_pack",
    pack,
    "contentFingerprintSha256",
    hash,
  );
}

export function computeSchemeSeedPacketFingerprint(
  packet: Omit<SchemeSeedPacket, "packetFingerprintSha256">,
  hash: SchemeContentHash,
): string {
  return fingerprintWithout(
    "scheme_seed_packet",
    packet,
    "packetFingerprintSha256",
    hash,
  );
}

/** Null when verified, otherwise why it could not be trusted. */
function verifyFingerprint(
  expected: unknown,
  compute: () => string,
  hash: SchemeContentHash,
): "MISMATCH" | "UNVERIFIABLE" | null {
  try {
    if (hash("") !== SHA256_OF_EMPTY_STRING) return "UNVERIFIABLE";
    return compute() === expected ? null : "MISMATCH";
  } catch {
    return "UNVERIFIABLE";
  }
}

function validateSchemeContentPackUnsafe(
  input: unknown,
  hash: SchemeContentHash,
): SchemeStandardIssue[] {
  if (!isRecord(input)) {
    return [{ code: "MALFORMED", detail: "A content pack must be an object." }];
  }

  const sourceIssues = validateSchemeSourcePack(input.sourcePack);
  const issues: SchemeStandardIssue[] = [
    ...sourceIssues,
    ...validateRequirementRegisterUnsafe(input.register, input.sourcePack, true),
  ];

  if (input.formatVersion !== SCHEME_CONTENT_PACK_FORMAT_VERSION) {
    issues.push({
      code: "CONTENT_PACK_FORMAT_UNSUPPORTED",
      detail: "This content pack format version is not supported.",
    });
  }

  const pin = isVersionPin(input.pin) ? input.pin : null;
  if (!pin) {
    issues.push({ code: "PIN_INVALID", detail: "A content pack needs a valid version pin." });
  }

  const sourcePackPin = isRecord(input.sourcePack) ? input.sourcePack.pin : undefined;
  const registerPin = isRecord(input.register) ? input.register.pin : undefined;
  for (const partPin of [sourcePackPin, registerPin]) {
    if (pin && (!isVersionPin(partPin) || !sameSchemeVersionPin(partPin, pin))) {
      issues.push({
        code: "CONTENT_PACK_OTHER_VERSION",
        detail: "Every part of a content pack must pin the pack's scheme version.",
      });
    }
  }

  const completeness = isRecord(input.sourcePack) ? input.sourcePack.completeness : undefined;
  if (!isRecord(completeness) || completeness.status !== "CLAIMED") {
    issues.push({
      code: "CONTENT_PACK_NO_COMPLETENESS_CLAIM",
      detail: "A content pack freezes a register, which needs a completeness claim.",
    });
  }

  const supersedes = input.supersedes;
  if (supersedes !== null) {
    const valid =
      isRecord(supersedes) &&
      isVersionPin(supersedes.pin) &&
      typeof supersedes.contentFingerprintSha256 === "string" &&
      SHA256_PATTERN.test(supersedes.contentFingerprintSha256) &&
      (!pin ||
        (supersedes.pin.schemeKey === pin.schemeKey &&
          !sameSchemeVersionPin(supersedes.pin, pin)));
    if (!valid) {
      issues.push({
        code: "CONTENT_PACK_SUPERSESSION_INVALID",
        detail: "A pack supersedes null or another pinned version of the same scheme.",
      });
    }
  }

  const fingerprint = verifyFingerprint(
    input.contentFingerprintSha256,
    () =>
      computeSchemeContentPackFingerprint(
        input as unknown as Omit<SchemeContentPack, "contentFingerprintSha256">,
        hash,
      ),
    hash,
  );
  if (fingerprint === "MISMATCH") {
    issues.push({
      code: "CONTENT_PACK_FINGERPRINT_MISMATCH",
      detail: "The pack's content does not match its pinned fingerprint.",
    });
  } else if (fingerprint === "UNVERIFIABLE") {
    issues.push({
      code: "CONTENT_PACK_FINGERPRINT_UNVERIFIABLE",
      detail: "The pack's fingerprint could not be computed with a real SHA-256.",
    });
  }

  return issues;
}

function isRequirementImplementationStatus(
  value: unknown,
): value is RequirementImplementationStatus {
  return typeof value === "string" && Object.hasOwn(COVERAGE_TRANSITIONS, value);
}

/** Coverage is an exported runtime boundary: its frozen rows may have come
 * back from storage or another module and must not be trusted merely because
 * the TypeScript caller claims RequirementRegisterRow[]. Validate every field
 * the coverage algorithm dereferences before it traverses or formats it. */
function isFrozenRowsShape(rows: unknown): rows is readonly RequirementRegisterRow[] {
  return (
    Array.isArray(rows) &&
    everyPosition(
      rows,
      (row) =>
        isRecord(row) &&
        isText(row.id) &&
        isRequirementImplementationStatus(row.status) &&
        Array.isArray(row.dataKeys) &&
        everyPosition(
          row.dataKeys,
          (dataKey) =>
            isRecord(dataKey) &&
            typeof dataKey.key === "string" &&
            typeof dataKey.owner === "string" &&
            Object.hasOwn(DATA_OWNERS, dataKey.owner),
        ) &&
        isNullableText(row.engineRuleRef) &&
        isNullableText(row.testRef) &&
        isNullableText(row.reason),
    )
  );
}

/**
 * Coverage is the P2 record of each frozen row's final status. A missing or
 * unknown row fails: the register is the whole set of rules, and a rule it
 * does not hold is a stop, not an addition.
 */
function validateRegisterCoverageUnsafe(
  input: unknown,
  rows: readonly RequirementRegisterRow[],
): SchemeStandardIssue[] {
  if (!Array.isArray(input)) {
    return [{ code: "MALFORMED", detail: "coverage must be an array." }];
  }
  if (!isFrozenRowsShape(rows)) {
    return [{ code: "MALFORMED", detail: "The frozen rows must be register rows." }];
  }

  const issues: SchemeStandardIssue[] = [];
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const covered = new Set<unknown>();

  for (const entry of input) {
    if (!isRecord(entry)) {
      issues.push({ code: "MALFORMED", detail: "A coverage entry must be an object." });
      continue;
    }

    const rowId = typeof entry.rowId === "string" ? entry.rowId : undefined;
    const push = (code: SchemeStandardIssue["code"], detail: string) =>
      issues.push({ code, detail, rowId });

    const row = rowId === undefined ? undefined : rowById.get(rowId);
    if (!row) {
      push("COVERAGE_ROW_UNKNOWN", "Coverage names a row the frozen register does not hold.");
      continue;
    }
    if (covered.has(rowId)) {
      push("COVERAGE_ROW_DUPLICATE", "A row can have only one coverage entry.");
    }
    covered.add(rowId);

    const status = entry.status;
    if (status !== "IMPLEMENTED" && status !== "UNSUPPORTED" && status !== "NOT_APPLICABLE") {
      push("COVERAGE_ROW_NOT_FINAL", "Coverage must give the row a final status.");
      continue;
    }
    if (!COVERAGE_TRANSITIONS[row.status].includes(status)) {
      push(
        "COVERAGE_TRANSITION_NOT_ALLOWED",
        `A frozen ${row.status} row cannot become ${status} without a new version.`,
      );
    }
    // Only an unbuilt row gains references or a reason from coverage.
    if (
      row.status !== "IMPLEMENTABLE" &&
      (entry.engineRuleRef !== row.engineRuleRef ||
        entry.testRef !== row.testRef ||
        entry.reason !== row.reason)
    ) {
      push(
        "COVERAGE_FROZEN_ROW_DRIFT",
        "A row frozen with a final status keeps its references and reason until a new version.",
      );
    }
    if (!isNullableText(entry.engineRuleRef) || !isNullableText(entry.testRef)) {
      push("COVERAGE_REFERENCE_INVALID", "References must each be text or null.");
    }

    if (status === "IMPLEMENTED") {
      if (!isText(entry.engineRuleRef) || !isText(entry.testRef)) {
        push("COVERAGE_IMPLEMENTED_NO_REFERENCE", "An implemented row needs an engine rule and a test.");
      }
      if (entry.reason !== null) {
        push("COVERAGE_REASON_NOT_ALLOWED", "An implemented row has no reason.");
      }
      for (const { key } of row.dataKeys) {
        if (!registeredSchemeDataKey(key)) {
          issues.push({
            code: "COVERAGE_DATA_KEY_UNREGISTERED",
            detail: "An implemented row can read only registered data keys.",
            rowId,
            dataKey: key,
          });
        }
      }
    } else if (!isText(entry.reason)) {
      push(
        status === "UNSUPPORTED"
          ? "COVERAGE_UNSUPPORTED_NO_REASON"
          : "COVERAGE_NOT_APPLICABLE_NO_REASON",
        `A ${status} row needs a reason.`,
      );
    }
    if (status === "NOT_APPLICABLE" && (entry.engineRuleRef !== null || entry.testRef !== null)) {
      push("COVERAGE_REFERENCE_INVALID", "A NOT_APPLICABLE row cannot cite an engine rule or test.");
    }
  }

  for (const row of rows) {
    if (!covered.has(row.id)) {
      issues.push({
        code: "COVERAGE_ROW_MISSING",
        detail: "Every frozen row needs a final status.",
        rowId: row.id,
      });
    }
  }

  return issues;
}

function isDefinitionShape(value: unknown): value is StoredSchemeDefinition {
  return (
    isRecord(value) &&
    isRecord(value.version) &&
    Array.isArray(value.sources) &&
    everyPosition(value.sources, isRecord) &&
    Array.isArray(value.rules) &&
    everyPosition(
      value.rules,
      (rule) =>
        isRecord(rule) &&
        Array.isArray(rule.inputs) &&
        everyPosition(rule.inputs, isRecord),
    )
  );
}

type StoredFieldCheck = (value: unknown) => boolean;

const isUuid: StoredFieldCheck = (value) =>
  typeof value === "string" && UUID_PATTERN.test(value);

const isBoolean: StoredFieldCheck = (value) => typeof value === "boolean";

// PostgreSQL has no year 0000. timestamptz keeps microseconds and silently
// rounds anything finer, so a finer value would not be stored exactly.
const STORED_YEAR_ZERO_PREFIX = "0000-";
const FINER_THAN_MICROSECONDS_PATTERN = /\.\d{7,}Z$/;

const isStoredDate: StoredFieldCheck = (value) =>
  isCalendarDate(value) && !value.startsWith(STORED_YEAR_ZERO_PREFIX);

const isTimestamp: StoredFieldCheck = (value) =>
  typeof value === "string" &&
  isValidIsoUtcDateTime(value) &&
  !value.startsWith(STORED_YEAR_ZERO_PREFIX) &&
  !FINER_THAN_MICROSECONDS_PATTERN.test(value);

const isPriority: StoredFieldCheck = (value) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= MAX_RULE_INPUT_PRIORITY;

// Same measure as the CHECK constraints' length(btrim(value)): btrim strips
// spaces only, and length counts code points.
const textUpTo =
  (max: number): StoredFieldCheck =>
  (value) =>
    isText(value) && [...value.replace(/^ +| +$/g, "")].length <= max;

const nullable =
  (check: StoredFieldCheck): StoredFieldCheck =>
  (value) =>
    value === null || check(value);

const oneOf =
  (values: Record<string, true>): StoredFieldCheck =>
  (value) =>
    typeof value === "string" && Object.hasOwn(values, value);

const STORED_CATEGORIES: Record<string, true> = {
  direct_basic_support: true,
  environmental_support: true,
  young_new_farmer_support: true,
  capital_investment_support: true,
  livestock_support: true,
  safety_support: true,
  other: true,
};

const STORED_AUTHORITIES: Record<string, true> = {
  DAFM: true,
  EU_CAP: true,
  OTHER_OFFICIAL: true,
};

const STORED_PUBLICATION_STATES: Record<SchemePublicationState, true> = {
  draft: true,
  verified: true,
  superseded: true,
};

const STORED_AUTHORITY_TIERS: Record<StoredSchemeAuthorityTier, true> = {
  statute: true,
  dafm_official: true,
  eu_official: true,
  teagasc_technical: true,
  authoritative_secondary: true,
};

const STORED_RULE_TYPES: Record<StoredSchemeRule["ruleType"], true> = {
  relevance: true,
  eligibility: true,
  payment: true,
  cap: true,
  exclusion: true,
  action_obligation: true,
  evidence_obligation: true,
  compatibility: true,
  deadline: true,
};

const STORED_SUBJECT_SCOPES: Record<StoredSchemeRuleInput["subjectScope"], true> = {
  farm: true,
  field: true,
  animal: true,
  group: true,
};

const RESOLUTION_OWNERS: Record<SchemeResolutionOwner, true> = {
  farmer: true,
  adviser: true,
  system: true,
};

// Column by column from the Schemes foundation migration's CHECK constraints.
// Keyed by the row types, so a new column cannot be left unchecked.
const STORED_VERSION_FIELDS: Record<keyof StoredSchemeVersion, StoredFieldCheck> = {
  id: isUuid,
  schemeKey: (value) => typeof value === "string" && SCHEME_KEY_PATTERN.test(value),
  displayName: textUpTo(180),
  category: oneOf(STORED_CATEGORIES),
  authority: oneOf(STORED_AUTHORITIES),
  schemeYear: isSchemeYear,
  programmeGeneration: isNullableText,
  rulesVersion: textUpTo(MAX_RULES_VERSION_LENGTH),
  effectiveFrom: nullable(isStoredDate),
  effectiveTo: nullable(isStoredDate),
  applicationOpen: nullable(isTimestamp),
  applicationClose: nullable(isTimestamp),
  lateApplicationClose: nullable(isTimestamp),
  publicationState: oneOf(STORED_PUBLICATION_STATES),
  v1Enabled: isBoolean,
  enterpriseRelevance: (value) => Array.isArray(value) && everyPosition(value, isText),
  supportType: isNullableText,
  recurrenceType: isNullableText,
  requiresAdviser: isBoolean,
  verifiedAt: nullable(isTimestamp),
};

const STORED_SOURCE_FIELDS: Record<keyof StoredSchemeSource, StoredFieldCheck> = {
  id: isUuid,
  schemeVersionId: isUuid,
  sourceKey: textUpTo(120),
  authorityTier: oneOf(STORED_AUTHORITY_TIERS),
  publisher: textUpTo(180),
  title: textUpTo(300),
  url: (value) => isHttpUrl(value) && textUpTo(2000)(value),
  publicationDate: nullable(isStoredDate),
  retrievedAt: nullable(isTimestamp),
  lastVerifiedAt: nullable(isTimestamp),
  contentFingerprintSha256: nullable(
    (value) => typeof value === "string" && SHA256_PATTERN.test(value),
  ),
  archivedStoragePath: nullable(isArchiveLocation),
};

const STORED_RULE_FIELDS: Record<keyof StoredSchemeRule, StoredFieldCheck> = {
  id: isUuid,
  schemeVersionId: isUuid,
  sourceId: isUuid,
  ruleKey: textUpTo(160),
  ruleType: oneOf(STORED_RULE_TYPES),
  description: textUpTo(2000),
  operator: textUpTo(80),
  parameters: isRecord,
  consequence: isRecord,
  hardGate: isBoolean,
  effectiveFrom: nullable(isTimestamp),
  effectiveTo: nullable(isTimestamp),
  inputs: Array.isArray,
};

const STORED_RULE_INPUT_FIELDS: Record<keyof StoredSchemeRuleInput, StoredFieldCheck> = {
  ruleId: isUuid,
  schemeVersionId: isUuid,
  dataKey: textUpTo(200),
  label: textUpTo(300),
  owner: oneOf(DATA_OWNERS),
  subjectScope: oneOf(STORED_SUBJECT_SCOPES),
  required: isBoolean,
  resolutionOwner: oneOf(RESOLUTION_OWNERS),
  priority: isPriority,
  routeKey: isNullableText,
};

// text and jsonb reject NUL. jsonb rejects a lone surrogate, and text could
// only hold one by replacing it. The u flag makes this match lone ones only.
const LONE_SURROGATE_PATTERN = /[\uD800-\uDFFF]/u;

function isStorableString(value: string): boolean {
  return !value.includes("\0") && !LONE_SURROGATE_PATTERN.test(value);
}

/** Whether the database would hold this value exactly, at any depth: JSON
 * values only, since serialising anything else drops or replaces it. */
function isStorableValue(value: unknown): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return isStorableString(value);
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    return everyPosition(value, isStorableValue);
  }
  if (typeof value !== "object") return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.entries(value).every(
      ([key, nested]) => isStorableString(key) && isStorableValue(nested),
    )
  );
}

/** A cycle or depth the call stack cannot walk could not be serialised either. */
function isStorableColumn(value: unknown): boolean {
  try {
    return isStorableValue(value);
  } catch {
    return false;
  }
}

function validateStoredRowFields(
  table: string,
  row: object,
  fields: Record<string, StoredFieldCheck>,
  context: Pick<SchemeStandardIssue, "sourceId" | "ruleKey" | "dataKey">,
  issues: SchemeStandardIssue[],
): void {
  const values = row as UnknownRecord;
  for (const [field, check] of Object.entries(fields)) {
    if (
      !Object.hasOwn(values, field) ||
      !check(values[field]) ||
      !isStorableColumn(values[field])
    ) {
      issues.push({
        code: "SEED_ROW_FIELD_INVALID",
        detail: `${table}.${field} is missing or invalid.`,
        ...context,
      });
    }
  }
  for (const field of Object.keys(values)) {
    if (!Object.hasOwn(fields, field)) {
      issues.push({
        code: "SEED_ROW_FIELD_INVALID",
        detail: `${table}.${field} is not a stored column.`,
        ...context,
      });
    }
  }
}

/** Orders valid stored dates or timestamps as text, at the database's full
 * precision. Date.parse would truncate to milliseconds. */
function storedInstantKey(value: string): string {
  const [whole, fraction = ""] = value.replace(/Z$/, "").split(".");
  return `${whole}.${fraction.padEnd(6, "0")}`;
}

/** True when both bounds are present and in the wrong order. A malformed
 * bound is reported by its own field check. */
function windowReversed(from: unknown, to: unknown): boolean {
  return (
    typeof from === "string" &&
    typeof to === "string" &&
    storedInstantKey(from) > storedInstantKey(to)
  );
}

/** Every stored column, window and row key the tables would hold. The checks
 * after this one compare rows; these ones judge each row on its own. */
function validateStoredRows(
  definition: StoredSchemeDefinition,
  issues: SchemeStandardIssue[],
): void {
  const { version } = definition;
  validateStoredRowFields("scheme_versions", version, STORED_VERSION_FIELDS, {}, issues);

  const versionWindows: [string, unknown, unknown][] = [
    ["effective", version.effectiveFrom, version.effectiveTo],
    ["application", version.applicationOpen, version.applicationClose],
    ["late application", version.applicationClose, version.lateApplicationClose],
  ];
  for (const [label, from, to] of versionWindows) {
    if (windowReversed(from, to)) {
      issues.push({ code: "SEED_ROW_FIELD_INVALID", detail: `The version's ${label} dates are out of order.` });
    }
  }

  const seenSourceRowIds = new Set<unknown>();
  for (const source of definition.sources) {
    const sourceId = textContext(source.sourceKey);
    validateStoredRowFields("scheme_sources", source, STORED_SOURCE_FIELDS, { sourceId }, issues);
    if (seenSourceRowIds.has(source.id)) {
      issues.push({ code: "SEED_DUPLICATE_KEY", detail: "Source row ids must be unique.", sourceId });
    }
    seenSourceRowIds.add(source.id);
  }

  const seenRuleRowIds = new Set<unknown>();
  for (const rule of definition.rules) {
    const ruleKey = textContext(rule.ruleKey);
    validateStoredRowFields("scheme_rules", rule, STORED_RULE_FIELDS, { ruleKey }, issues);
    if (windowReversed(rule.effectiveFrom, rule.effectiveTo)) {
      issues.push({ code: "SEED_ROW_FIELD_INVALID", detail: "The rule's effective dates are out of order.", ruleKey });
    }
    if (seenRuleRowIds.has(rule.id)) {
      issues.push({ code: "SEED_DUPLICATE_KEY", detail: "Rule row ids must be unique.", ruleKey });
    }
    seenRuleRowIds.add(rule.id);

    const seenDataKeys = new Set<unknown>();
    for (const ruleInput of rule.inputs) {
      const dataKey = textContext(ruleInput.dataKey);
      validateStoredRowFields("scheme_rule_inputs", ruleInput, STORED_RULE_INPUT_FIELDS, { ruleKey, dataKey }, issues);
      if (seenDataKeys.has(ruleInput.dataKey)) {
        issues.push({ code: "SEED_DUPLICATE_KEY", detail: "A rule can read a data key only once.", ruleKey, dataKey });
      }
      seenDataKeys.add(ruleInput.dataKey);
    }
  }
}

function storedSourceDiffers(
  stored: StoredSchemeSource,
  source: SchemeSourceRecord,
): boolean {
  return (
    stored.authorityTier !== source.storedAuthorityTier ||
    stored.publisher !== source.publisher ||
    stored.title !== source.title ||
    stored.url !== source.url ||
    stored.publicationDate !== source.publicationDate ||
    typeof stored.retrievedAt !== "string" ||
    !stored.retrievedAt.startsWith(source.retrievalDate) ||
    stored.contentFingerprintSha256 !== source.contentFingerprintSha256 ||
    stored.archivedStoragePath !== source.archivedLocation
  );
}

function validateSeedDefinition(
  definition: StoredSchemeDefinition,
  pack: SchemeContentPack,
  issues: SchemeStandardIssue[],
): void {
  const { version } = definition;

  const issuesBeforeRows = issues.length;
  validateStoredRows(definition, issues);
  const rowsWellFormed = issues.length === issuesBeforeRows;

  if (
    version.schemeKey !== pack.pin.schemeKey ||
    version.schemeYear !== pack.pin.schemeYear ||
    version.rulesVersion !== pack.pin.rulesVersion
  ) {
    issues.push({ code: "SEED_OTHER_VERSION", detail: "The seeded version row is not the pack's version." });
  }

  // Loaded content stays invisible until the post-load audit makes it LIVE.
  if (
    version.publicationState !== "draft" ||
    version.v1Enabled !== false ||
    version.verifiedAt !== null
  ) {
    issues.push({
      code: "SEED_PUBLICATION_STATE_NOT_ALLOWED",
      detail: "A seed packet loads a draft, disabled, unverified version.",
    });
  }

  // The shared validator trusts its row types and formats them into details,
  // so it judges only rows that have passed the field checks.
  if (rowsWellFormed) {
    for (const issue of validateStoredSchemeDefinition(definition)) {
      issues.push({
        code: "SEED_DEFINITION_INVALID",
        detail: `${issue.code}: ${issue.detail}`,
        sourceId: issue.sourceId,
        dataKey: issue.dataKey,
      });
    }
  }

  const packSourceById = new Map(pack.sourcePack.sources.map((source) => [source.sourceId, source]));
  const seenSourceKeys = new Set<string>();

  for (const stored of definition.sources) {
    const sourceId = stored.sourceKey;
    if (stored.schemeVersionId !== version.id) {
      issues.push({ code: "SEED_ROW_OTHER_VERSION", detail: "A source row belongs to another version.", sourceId });
    }
    if (seenSourceKeys.has(sourceId)) {
      issues.push({ code: "SEED_DUPLICATE_KEY", detail: "Source keys must be unique in a version.", sourceId });
    }
    seenSourceKeys.add(sourceId);

    const source = packSourceById.get(sourceId);
    if (!source) {
      issues.push({ code: "SEED_SOURCE_NOT_IN_PACK", detail: "A source row is not in the content pack.", sourceId });
    } else if (storedSourceDiffers(stored, source)) {
      issues.push({ code: "SEED_SOURCE_MISMATCH", detail: "A source row differs from the content pack.", sourceId });
    }
  }
  for (const sourceId of packSourceById.keys()) {
    if (!seenSourceKeys.has(sourceId)) {
      issues.push({ code: "SEED_SOURCE_MISSING", detail: "A pack source has no source row.", sourceId });
    }
  }

  const seenRuleKeys = new Set<string>();
  for (const rule of definition.rules) {
    const ruleKey = rule.ruleKey;
    if (
      rule.schemeVersionId !== version.id ||
      rule.inputs.some(
        (ruleInput) => ruleInput.schemeVersionId !== version.id || ruleInput.ruleId !== rule.id,
      )
    ) {
      issues.push({ code: "SEED_ROW_OTHER_VERSION", detail: "A rule or input row belongs to another version.", ruleKey });
    }
    if (seenRuleKeys.has(ruleKey)) {
      issues.push({ code: "SEED_DUPLICATE_KEY", detail: "Rule keys must be unique in a version.", ruleKey });
    }
    seenRuleKeys.add(ruleKey);
  }
}

/** Every stored rule traces to a row, and each row's source and facts match
 * the rule that evaluates it. */
function validateSeedTraceability(
  packet: SchemeSeedPacket,
  pack: SchemeContentPack,
  issues: SchemeStandardIssue[],
): void {
  const { definition } = packet;
  const ruleByKey = new Map(definition.rules.map((rule) => [rule.ruleKey, rule]));
  const sourceById = new Map(definition.sources.map((source) => [source.id, source]));
  const rowById = new Map(pack.register.rows.map((row) => [row.id, row]));
  const rowKeysByRule = new Map<string, Set<string>>();

  for (const entry of packet.coverage) {
    const row = isRecord(entry) ? rowById.get(entry.rowId) : undefined;
    if (!row || !isText(entry.engineRuleRef)) continue;

    const ruleKey = entry.engineRuleRef;
    const rule = ruleByKey.get(ruleKey);
    if (!rule) {
      issues.push({
        code: "SEED_RULE_REFERENCE_UNRESOLVED",
        detail: "Coverage cites a rule key the packet does not load.",
        rowId: row.id,
        ruleKey,
      });
      continue;
    }

    if (sourceById.get(rule.sourceId)?.sourceKey !== row.source.sourceId) {
      issues.push({
        code: "SEED_RULE_SOURCE_MISMATCH",
        detail: "A rule cites a different source from the row it implements.",
        rowId: row.id,
        ruleKey,
      });
    }

    const keys = rowKeysByRule.get(ruleKey) ?? new Set<string>();
    row.dataKeys.forEach(({ key }) => keys.add(key));
    rowKeysByRule.set(ruleKey, keys);

    if (entry.status === "IMPLEMENTED") {
      const inputKeys = new Set(rule.inputs.map((ruleInput) => ruleInput.dataKey));
      for (const { key } of row.dataKeys) {
        if (!inputKeys.has(key)) {
          issues.push({
            code: "SEED_ROW_KEY_NOT_IN_RULE",
            detail: "An implemented row's fact is not an input of its rule.",
            rowId: row.id,
            ruleKey,
            dataKey: key,
          });
        }
      }
    }
  }

  for (const rule of definition.rules) {
    const ruleKey = rule.ruleKey;
    const rowKeys = rowKeysByRule.get(ruleKey);
    if (!rowKeys) {
      issues.push({
        code: "SEED_RULE_NOT_IN_REGISTER",
        detail: "A stored rule has no register row.",
        ruleKey,
      });
      continue;
    }
    for (const ruleInput of rule.inputs) {
      if (!rowKeys.has(ruleInput.dataKey)) {
        issues.push({
          code: "SEED_RULE_INPUT_NOT_IN_REGISTER",
          detail: "A rule reads a fact its register rows do not name.",
          ruleKey,
          dataKey: ruleInput.dataKey,
        });
      }
    }
  }
}

/**
 * Validates a seed packet against the content pack it loads. An invalid
 * pack stops here: rows cannot be judged against an untrusted register.
 */
function validateSchemeSeedPacketUnsafe(
  input: unknown,
  contentPack: unknown,
  hash: SchemeContentHash,
): SchemeStandardIssue[] {
  if (!isRecord(input)) {
    return [{ code: "MALFORMED", detail: "A seed packet must be an object." }];
  }

  const packIssues = validateSchemeContentPack(contentPack, hash);
  if (packIssues.length > 0) {
    return [
      {
        code: "SEED_CONTENT_PACK_INVALID",
        detail: `The content pack is invalid: ${[...new Set(packIssues.map((issue) => issue.code))].join(",")}`,
      },
    ];
  }
  const pack = contentPack as SchemeContentPack;

  const issues: SchemeStandardIssue[] = [];
  if (input.formatVersion !== SCHEME_SEED_PACKET_FORMAT_VERSION) {
    issues.push({ code: "SEED_FORMAT_UNSUPPORTED", detail: "This seed packet format version is not supported." });
  }
  if (!isVersionPin(input.pin) || !sameSchemeVersionPin(input.pin, pack.pin)) {
    issues.push({ code: "SEED_OTHER_VERSION", detail: "The packet is not pinned to the pack's version." });
  }
  if (input.contentPackFingerprintSha256 !== pack.contentFingerprintSha256) {
    issues.push({ code: "SEED_CONTENT_PACK_MISMATCH", detail: "The packet names a different content pack fingerprint." });
  }

  const coverageIssues = validateRegisterCoverage(input.coverage, pack.register.rows);
  issues.push(...coverageIssues);

  if (input.priorStoredVersion !== null) {
    const prior = input.priorStoredVersion;
    const valid =
      isRecord(prior) &&
      isText(prior.rulesVersion) &&
      prior.rulesVersion !== pack.pin.rulesVersion &&
      Array.isArray(prior.differences) &&
      prior.differences.length > 0 &&
      everyPosition(prior.differences, isText);
    if (!valid) {
      issues.push({
        code: "SEED_PRIOR_VERSION_INVALID",
        detail: "A prior stored version needs another rules version and listed differences.",
      });
    }
  }

  if (!isDefinitionShape(input.definition)) {
    issues.push({ code: "SEED_DEFINITION_MALFORMED", detail: "The stored rows are malformed." });
  } else {
    validateSeedDefinition(input.definition, pack, issues);
    if (Array.isArray(input.coverage)) {
      validateSeedTraceability(input as unknown as SchemeSeedPacket, pack, issues);
    }
  }

  const fingerprint = verifyFingerprint(
    input.packetFingerprintSha256,
    () =>
      computeSchemeSeedPacketFingerprint(
        input as unknown as Omit<SchemeSeedPacket, "packetFingerprintSha256">,
        hash,
      ),
    hash,
  );
  if (fingerprint === "MISMATCH") {
    issues.push({ code: "SEED_PACKET_FINGERPRINT_MISMATCH", detail: "The packet's rows do not match its fingerprint." });
  } else if (fingerprint === "UNVERIFIABLE") {
    issues.push({ code: "SEED_PACKET_FINGERPRINT_UNVERIFIABLE", detail: "The packet's fingerprint could not be computed." });
  }

  // The comparison checks above read stored rows whatever their field checks
  // found, so a malformed key can reach an issue's context here.
  return issues.map((issue) => ({
    ...issue,
    rowId: textContext(issue.rowId),
    sourceId: textContext(issue.sourceId),
    dataKey: textContext(issue.dataKey),
    ruleKey: textContext(issue.ruleKey),
  }));
}

/** Exported validators are hostile-input boundaries. They should return an
 * issue for malformed runtime/persisted data rather than letting an unexpected
 * dereference, getter or malformed container escape as an exception. */
function failClosedValidator(
  boundary: string,
  validate: () => SchemeStandardIssue[],
): SchemeStandardIssue[] {
  try {
    return validate();
  } catch {
    return [{
      code: "MALFORMED",
      detail: `${boundary} could not be validated because its runtime shape is malformed.`,
    }];
  }
}

export function validateSchemeSourcePack(input: unknown): SchemeStandardIssue[] {
  return failClosedValidator("The source pack", () => validateSchemeSourcePackUnsafe(input));
}

export function validateRequirementRegister(
  input: unknown,
  sourcePack: unknown,
): SchemeStandardIssue[] {
  return failClosedValidator("The requirement register", () =>
    validateRequirementRegisterUnsafe(input, sourcePack));
}

export function validateSchemeContentPack(
  input: unknown,
  hash: SchemeContentHash,
): SchemeStandardIssue[] {
  return failClosedValidator("The content pack", () =>
    validateSchemeContentPackUnsafe(input, hash));
}

export function validateRegisterCoverage(
  input: unknown,
  rows: readonly RequirementRegisterRow[],
): SchemeStandardIssue[] {
  return failClosedValidator("Register coverage", () =>
    validateRegisterCoverageUnsafe(input, rows));
}

export function validateSchemeSeedPacket(
  input: unknown,
  contentPack: unknown,
  hash: SchemeContentHash,
): SchemeStandardIssue[] {
  return failClosedValidator("The seed packet", () =>
    validateSchemeSeedPacketUnsafe(input, contentPack, hash));
}

/**
 * Reads a SEED_PACKET.md: exactly one fenced json block holds the packet.
 * Any other shape is an issue, never a guess at which block was meant.
 */
export function parseSeedPacketDocument(
  markdown: string,
): { packet: unknown; issues: SchemeStandardIssue[] } {
  const blocks = [...markdown.matchAll(/^```json[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm)];
  if (blocks.length !== 1) {
    return {
      packet: null,
      issues: [{ code: "SEED_DOCUMENT_INVALID", detail: "A seed packet document needs exactly one fenced json block." }],
    };
  }
  try {
    return { packet: JSON.parse(blocks[0][1]) as unknown, issues: [] };
  } catch {
    return {
      packet: null,
      issues: [{ code: "SEED_DOCUMENT_INVALID", detail: "The fenced json block is not valid JSON." }],
    };
  }
}

function assertNoIssues(label: string, issues: SchemeStandardIssue[]): void {
  if (issues.length === 0) return;
  throw new Error(`${label}:${issues.map((issue) => issue.code).join(",")}`);
}

export function assertSchemeContentPack(
  input: unknown,
  hash: SchemeContentHash,
): asserts input is SchemeContentPack {
  assertNoIssues("INVALID_SCHEME_CONTENT_PACK", validateSchemeContentPack(input, hash));
}

export function assertSchemeSeedPacket(
  input: unknown,
  contentPack: unknown,
  hash: SchemeContentHash,
): asserts input is SchemeSeedPacket {
  assertNoIssues("INVALID_SCHEME_SEED_PACKET", validateSchemeSeedPacket(input, contentPack, hash));
}
