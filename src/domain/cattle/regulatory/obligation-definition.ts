/**
 * Cattle C2 — obligation definitions and the obligation catalogue.
 *
 * An `ObligationDefinition` binds one C0 rule VERSION to the obligation's
 * terms: an opaque, rule-declared obligation kind; a trigger anchor (an
 * explicit reference to a C1 fact/transition — the engine never decides which
 * anchor a real law uses); a due window expressed as data (offsets from the
 * anchor plus a closed boundary convention); a time basis; and the source
 * version the window is drawn from (which must be one of the rule version's
 * own C0 `sourceBindings`). Classification, hard-gate/advisory role,
 * applicability, required inputs, effective period, supersession, reviews and
 * production state all stay on the C0 `CattleRuleVersion` — never copied.
 *
 * Terms are bound INTO the rule version: the version must carry the exact
 * marker `obligationTermsMarker(definition)` (a fingerprint of the terms) in
 * its C0 `assumptions`. Assumptions are part of the C0 rule fingerprint, so a
 * C0 review approves exactly those terms and changing a window needs a new
 * rule version with renewed approval. A definition whose marker is absent is
 * UNSUPPORTED at evaluation.
 *
 * `recordedAt` is KNOWLEDGE time for the definition (when the catalogue
 * admitted this rule version's terms), so a later rule version is invisible
 * at an earlier knowledge cutoff.
 *
 * The production catalogue (`PRODUCTION_OBLIGATION_CATALOGUE`) is EMPTY: no
 * real legal, scheme or veterinary duty, deadline or window exists in code.
 * Real content must arrive through a separately authorised, evidence-reviewed
 * task using the C0 source/rule/review lifecycle.
 *
 * The catalogue is CANONICAL PLAIN DATA (`canonical-input.ts`): it is
 * checked against that contract, copied, rebuilt from known fields and
 * deep-frozen. It never carries executable code — rule implementations are
 * trusted bindings (`obligation-implementations.ts`). Any malformed or
 * contradictory admitted entry fails the whole catalogue closed.
 */

import { ASSESSMENT_FINGERPRINT_ALGORITHM, ASSESSMENT_INTEGRITY_SCHEMA_VERSION, canonicalizeValue, type AssessmentFingerprint } from "../../assessment-integrity";
import { SOURCE_REGISTER, type SourceId } from "../../source-register";
import {
  ANIMAL_LOCATION_KINDS,
  ANIMAL_PRESENCE_STATUSES,
  deepFreezeAnimalValue,
  compareInstants,
  isOpaqueRef,
  isValidAnimalInstant,
  type AnimalLocationKind,
  type AnimalPresenceStatus,
} from "../animal-ledger";
import type { CattleInformationClass, CattleInputScalar, RequiredInputDescriptor } from "../information";
import { compareStrings, type CattleHash } from "../integrity";
import type {
  ApplicabilityCondition,
  CattleReviewDimension,
  CattleRuleClassification,
  CattleRuleGateRole,
  CattleRuleProductionState,
  CattleRuleVersion,
  RuleReviewRecord,
  RuleVersionRef,
} from "../rule";
import type { CattleEvidenceSource, CattleSourceAuthorityKind, CattleSourceLifecycle, SourceVersionRef } from "../source";
import { toCanonicalPlainData } from "./canonical-input";
import { computeObligationFingerprint } from "./obligation-integrity";
import { canonicalObligationInstant, isValidObligationOffset, obligationOffsetSeconds, type ObligationOffset } from "./obligation-time";

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

/** Closed set of C1 anchors an obligation may be triggered by. */
export const OBLIGATION_ANCHOR_KINDS = ["DATE_OF_BIRTH", "LIFECYCLE_STATUS_START", "LOCATION_START"] as const;
export type ObligationAnchorKind = (typeof OBLIGATION_ANCHOR_KINDS)[number];

/**
 * - DATE_OF_BIRTH: the C1 date-of-birth fact (one occurrence; the calendar
 *   date's UTC start under the UTC time basis).
 * - LIFECYCLE_STATUS_START: each start of a period in which C1 lifecycle
 *   status equals `status`.
 * - LOCATION_START: each start of a period at one C1 location (a new
 *   location value), optionally limited to one opaque location kind.
 */
export type ObligationAnchor =
  | { kind: "DATE_OF_BIRTH" }
  | { kind: "LIFECYCLE_STATUS_START"; status: AnimalPresenceStatus }
  | { kind: "LOCATION_START"; locationKind: AnimalLocationKind | null };

/** Window boundary convention (closed). Default: inclusive start, exclusive end. */
export const OBLIGATION_WINDOW_BOUNDARIES = ["INCLUSIVE_START_EXCLUSIVE_END", "INCLUSIVE_START_INCLUSIVE_END"] as const;
export type ObligationWindowBoundary = (typeof OBLIGATION_WINDOW_BOUNDARIES)[number];

/** Window as rule data: opens at `anchor + opensAfter`, due at `anchor + dueAfter`. */
export interface ObligationWindowDefinition {
  opensAfter: ObligationOffset;
  dueAfter: ObligationOffset;
  boundary: ObligationWindowBoundary;
}

/** Recognised time bases. Only UTC is supported; a local-time rule is UNSUPPORTED. */
export const OBLIGATION_TIME_BASES = ["UTC", "HOLDING_LOCAL_TIME"] as const;
export type ObligationTimeBasis = (typeof OBLIGATION_TIME_BASES)[number];
export const SUPPORTED_OBLIGATION_TIME_BASES: readonly ObligationTimeBasis[] = ["UTC"];

export interface ObligationTerms {
  /** Opaque, rule-declared obligation kind (no engine meaning). */
  obligationKind: string;
  anchor: ObligationAnchor;
  window: ObligationWindowDefinition;
  timeBasis: ObligationTimeBasis;
  /** Source version the window is drawn from; must be one of the rule version's `sourceBindings`. */
  windowSource: SourceVersionRef;
}

export interface ObligationDefinition {
  obligationId: string;
  ruleId: string;
  ruleVersion: number;
  /** KNOWLEDGE time the catalogue admitted these terms (strict UTC). */
  recordedAt: string;
  terms: ObligationTerms;
}

/** Fingerprint of exactly what a reviewer approves: obligation id, rule ref and terms. */
export function computeObligationTermsFingerprint(definition: ObligationDefinition, hash: CattleHash): AssessmentFingerprint {
  return computeObligationFingerprint(
    "CATTLE_OBLIGATION_TERMS",
    { obligationId: definition.obligationId, ruleId: definition.ruleId, ruleVersion: definition.ruleVersion, terms: definition.terms },
    hash,
  );
}

/** The marker the bound C0 rule version must carry in `assumptions`. */
export function obligationTermsMarker(definition: ObligationDefinition, hash: CattleHash): string {
  return `cattle-obligation-terms:${definition.obligationId}:${computeObligationTermsFingerprint(definition, hash).digest}`;
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export interface ObligationCatalogue {
  definitions: readonly ObligationDefinition[];
  ruleVersions: readonly CattleRuleVersion[];
  sources: readonly CattleEvidenceSource[];
  reviews: readonly RuleReviewRecord[];
}

/** The production catalogue: deliberately EMPTY (no real obligation content). */
export const PRODUCTION_OBLIGATION_CATALOGUE: ObligationCatalogue = deepFreezeAnimalValue({
  definitions: [],
  ruleVersions: [],
  sources: [],
  reviews: [],
});

export type ObligationCatalogueIssueCode =
  | "CATTLE_OBLIGATION_CATALOGUE_MALFORMED"
  | "CATTLE_OBLIGATION_CATALOGUE_NOT_CLONEABLE"
  | "CATTLE_OBLIGATION_MALFORMED_DEFINITION"
  | "CATTLE_OBLIGATION_MALFORMED_RULE_VERSION"
  | "CATTLE_OBLIGATION_MALFORMED_SOURCE"
  | "CATTLE_OBLIGATION_MALFORMED_REVIEW"
  | "CATTLE_OBLIGATION_CATALOGUE_NON_CANONICAL"
  | "CATTLE_OBLIGATION_DUPLICATE_DEFINITION_DIFFERENT_CONTENT"
  | "CATTLE_OBLIGATION_DEFINITIONS_DISAGREE_ON_RULE"
  | "CATTLE_OBLIGATION_DUPLICATE_RULE_VERSION_DIFFERENT_CONTENT";

export interface ObligationCatalogueIssue {
  code: ObligationCatalogueIssueCode;
  /** Identifying reference (obligation id, `ruleId@vN`, ...) when readable. */
  ref: string | null;
}

/** Identity of a definition recorded after the materialisation knowledge cutoff. */
export interface LaterObligationDefinitionRef {
  obligationId: string;
  ruleId: string;
  ruleVersion: number;
}

export type ObligationCatalogueResult =
  | {
      ok: true;
      catalogue: ObligationCatalogue;
      /** Readable identities of definitions set aside as recorded after the cutoff (sorted). */
      laterDefinitions: readonly LaterObligationDefinitionRef[];
    }
  | { ok: false; issues: ObligationCatalogueIssue[] };

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const isString = (v: unknown): v is string => typeof v === "string";
const isNullableString = (v: unknown): v is string | null => v === null || typeof v === "string";
const isPositiveInteger = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 1;
const oneOf = <T extends string>(values: readonly T[], v: unknown): v is T => typeof v === "string" && (values as readonly string[]).includes(v);

const INFORMATION_CLASSES: readonly CattleInformationClass[] = [
  "FACT",
  "OBSERVATION",
  "INTENT",
  "RULE",
  "DERIVED_VALUE",
  "PREDICTION",
  "OBLIGATION_OR_CONSTRAINT",
  "RECOMMENDATION",
];
const CLASSIFICATIONS: readonly CattleRuleClassification[] = [
  "LEGAL_REQUIRED",
  "LEGAL_CONDITIONAL",
  "SCHEME_CONDITIONAL",
  "VETERINARY_PROGRAMME",
  "SCIENCE_TARGET",
  "SCIENCE_CONSTRAINT",
  "FARMER_INTENT",
  "SYSTEM_INFERENCE",
];
const GATE_ROLES: readonly CattleRuleGateRole[] = ["HARD_GATE", "ADVISORY"];
const PRODUCTION_STATES: readonly CattleRuleProductionState[] = ["RESEARCH", "DRAFT", "VALIDATED", "APPROVED", "PRODUCTION", "SUPERSEDED", "BLOCKED"];
const REVIEW_DIMENSIONS: readonly CattleReviewDimension[] = ["SCIENTIFIC", "LEGAL", "VETERINARY"];
const AUTHORITY_KINDS: readonly CattleSourceAuthorityKind[] = [
  "LEGISLATION",
  "REGULATORY_GUIDANCE",
  "SCHEME_TERMS",
  "VETERINARY_PROGRAMME",
  "AUTHORISED_PRODUCT_INFORMATION",
  "PEER_REVIEWED_SCIENCE",
  "ADVISORY_SCIENCE",
  "FARM_RECORD",
  "ENGINE_INTERNAL",
];
const SOURCE_LIFECYCLES: readonly CattleSourceLifecycle[] = ["ACTIVE", "HISTORICAL", "SUPERSEDED", "REVIEW_REQUIRED"];

/**
 * SHA-256 digest representation used by `assessment-integrity.ts` (exactly 64
 * lowercase hex characters — the shape its digest check enforces; the
 * pattern itself is module-private there, so this mirrors that documented
 * contract rather than inventing another).
 */
const SHA256_HEX_DIGEST = /^[0-9a-f]{64}$/;

/** A fingerprint exactly as `assessment-integrity.ts` produces it: current schema, SHA-256, well-formed digest. */
function fingerprintOf(raw: unknown): AssessmentFingerprint | null {
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== ASSESSMENT_INTEGRITY_SCHEMA_VERSION || raw.algorithm !== ASSESSMENT_FINGERPRINT_ALGORITHM) return null;
  if (!isString(raw.digest) || !SHA256_HEX_DIGEST.test(raw.digest)) return null;
  return { schemaVersion: ASSESSMENT_INTEGRITY_SCHEMA_VERSION, algorithm: ASSESSMENT_FINGERPRINT_ALGORITHM, digest: raw.digest };
}

function stringList(raw: unknown): string[] | null {
  return Array.isArray(raw) && raw.every(isString) ? [...raw] : null;
}

function sourceRefOf(raw: unknown): SourceVersionRef | null {
  if (!isRecord(raw) || !isString(raw.sourceId) || !isString(raw.version)) return null;
  const contentFingerprint = fingerprintOf(raw.contentFingerprint);
  return contentFingerprint ? { sourceId: raw.sourceId, version: raw.version, contentFingerprint } : null;
}

function descriptorOf(raw: unknown): RequiredInputDescriptor | null {
  if (!isRecord(raw) || !isString(raw.inputKey) || !isString(raw.description) || !isNullableString(raw.unit)) return null;
  if (!Array.isArray(raw.acceptedClasses) || !raw.acceptedClasses.every((c) => oneOf(INFORMATION_CLASSES, c))) return null;
  return { inputKey: raw.inputKey, description: raw.description, unit: raw.unit, acceptedClasses: [...(raw.acceptedClasses as CattleInformationClass[])] };
}

function isScalar(v: unknown): v is CattleInputScalar {
  return typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
}

function listOf<T>(raw: unknown, each: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(raw)) return null;
  const out: T[] = [];
  for (const item of raw) {
    const value = each(item);
    if (value === null) return null;
    out.push(value);
  }
  return out;
}

function ruleVersionOf(raw: unknown): CattleRuleVersion | null {
  if (!isRecord(raw)) return null;
  const { ruleId, version, title, classification, gateRole, jurisdiction, effectiveFrom, effectiveTo, productionState } = raw;
  if (!isString(ruleId) || !Number.isSafeInteger(version) || !isString(title)) return null;
  if (!oneOf(CLASSIFICATIONS, classification) || !oneOf(GATE_ROLES, gateRole) || !oneOf(PRODUCTION_STATES, productionState)) return null;
  if (!isNullableString(jurisdiction) || !isString(effectiveFrom) || !isNullableString(effectiveTo)) return null;
  const applicability = listOf<ApplicabilityCondition>(raw.applicability, (c) => {
    if (!isRecord(c) || !isScalar(c.equals)) return null;
    const input = descriptorOf(c.input);
    return input ? { input, equals: c.equals } : null;
  });
  const requiredInputs = listOf(raw.requiredInputs, descriptorOf);
  const assumptions = stringList(raw.assumptions);
  const limitations = stringList(raw.limitations);
  const policy = raw.unknownPolicy;
  const policyOk = isRecord(policy) && policy.missingRequiredInput === "INSUFFICIENT_EVIDENCE" && policy.conflictingInput === "CONFLICTING_EVIDENCE";
  const sourceBindings = listOf(raw.sourceBindings, sourceRefOf);
  const impl = raw.implementation;
  const logicFingerprint = isRecord(impl) ? fingerprintOf(impl.logicFingerprint) : null;
  const implementation =
    isRecord(impl) && isString(impl.implementationId) && Number.isSafeInteger(impl.version) && logicFingerprint
      ? { implementationId: impl.implementationId, version: impl.version as number, logicFingerprint }
      : null;
  const sup = raw.supersedes;
  const supersedesOk = sup === null || (isRecord(sup) && isString(sup.ruleId) && Number.isSafeInteger(sup.version));
  const requiredReviews = Array.isArray(raw.requiredReviews) && raw.requiredReviews.every((d) => oneOf(REVIEW_DIMENSIONS, d)) ? [...(raw.requiredReviews as CattleReviewDimension[])] : null;
  if (!applicability || !requiredInputs || !assumptions || !limitations || !policyOk || !sourceBindings || !implementation || !supersedesOk || !requiredReviews) return null;
  return {
    ruleId,
    version: version as number,
    title,
    classification,
    gateRole,
    jurisdiction,
    effectiveFrom,
    effectiveTo,
    applicability,
    requiredInputs,
    assumptions,
    limitations,
    unknownPolicy: { missingRequiredInput: "INSUFFICIENT_EVIDENCE", conflictingInput: "CONFLICTING_EVIDENCE" },
    sourceBindings,
    implementation,
    supersedes: sup === null ? null : { ruleId: (sup as Raw).ruleId as string, version: (sup as Raw).version as number },
    requiredReviews,
    productionState,
  };
}

function sourceOf(raw: unknown): CattleEvidenceSource | null {
  if (!isRecord(raw)) return null;
  const ref = sourceRefOf(raw);
  const { publisher, title, authorityKind, jurisdiction, context, retrievedAt, checkedAt, lifecycle, supersededByVersion, registeredSourceId } = raw;
  if (!ref || !isString(publisher) || !isString(title) || !oneOf(AUTHORITY_KINDS, authorityKind)) return null;
  // Provenance times must be strict-UTC instants (the C1 instant contract); a bare string is not provenance.
  if (!isNullableString(jurisdiction) || !isNullableString(context) || !isValidAnimalInstant(retrievedAt) || !isValidAnimalInstant(checkedAt)) return null;
  if (!oneOf(SOURCE_LIFECYCLES, lifecycle) || !isNullableString(supersededByVersion)) return null;
  if (registeredSourceId !== null && !(isString(registeredSourceId) && Object.prototype.hasOwnProperty.call(SOURCE_REGISTER, registeredSourceId))) return null;
  return {
    sourceId: ref.sourceId,
    publisher,
    title,
    authorityKind,
    jurisdiction,
    context,
    version: ref.version,
    contentFingerprint: ref.contentFingerprint,
    retrievedAt,
    checkedAt,
    lifecycle,
    supersededByVersion,
    registeredSourceId: registeredSourceId as SourceId | null,
  };
}

function reviewOf(raw: unknown): RuleReviewRecord | null {
  if (!isRecord(raw)) return null;
  const { ruleId, ruleVersion, dimension, decision, reviewerRef, reviewedAt } = raw;
  const ruleFingerprint = fingerprintOf(raw.ruleFingerprint);
  if (!isString(ruleId) || !Number.isSafeInteger(ruleVersion) || !ruleFingerprint || !oneOf(REVIEW_DIMENSIONS, dimension)) return null;
  if ((decision !== "APPROVED" && decision !== "REJECTED") || !isString(reviewerRef) || !isValidAnimalInstant(reviewedAt)) return null;
  return { ruleId, ruleVersion: ruleVersion as number, ruleFingerprint, dimension, decision, reviewerRef, reviewedAt };
}

function anchorOf(raw: unknown): ObligationAnchor | null {
  if (!isRecord(raw)) return null;
  switch (raw.kind) {
    case "DATE_OF_BIRTH":
      return { kind: "DATE_OF_BIRTH" };
    case "LIFECYCLE_STATUS_START":
      return oneOf(ANIMAL_PRESENCE_STATUSES, raw.status) ? { kind: "LIFECYCLE_STATUS_START", status: raw.status } : null;
    case "LOCATION_START": {
      const locationKind = raw.locationKind ?? null;
      return locationKind === null || oneOf(ANIMAL_LOCATION_KINDS, locationKind) ? { kind: "LOCATION_START", locationKind } : null;
    }
    default:
      return null;
  }
}

function definitionOf(raw: unknown): ObligationDefinition | null {
  if (!isRecord(raw) || !isRecord(raw.terms) || !isRecord(raw.terms.window)) return null;
  const { obligationId, ruleId, ruleVersion, recordedAt } = raw;
  const terms = raw.terms;
  const window = raw.terms.window;
  if (!isOpaqueRef(obligationId) || !isOpaqueRef(ruleId) || !isPositiveInteger(ruleVersion) || !isValidAnimalInstant(recordedAt)) return null;
  const anchor = anchorOf(terms.anchor);
  const windowSource = sourceRefOf(terms.windowSource);
  if (!isOpaqueRef(terms.obligationKind) || !anchor || !windowSource || !oneOf(OBLIGATION_TIME_BASES, terms.timeBasis)) return null;
  if (!isValidObligationOffset(window.opensAfter) || !isValidObligationOffset(window.dueAfter) || !oneOf(OBLIGATION_WINDOW_BOUNDARIES, window.boundary)) return null;
  const opensAfter = { amount: window.opensAfter.amount, unit: window.opensAfter.unit };
  const dueAfter = { amount: window.dueAfter.amount, unit: window.dueAfter.unit };
  // A window must have positive length.
  if (obligationOffsetSeconds(dueAfter) <= obligationOffsetSeconds(opensAfter)) return null;
  return {
    obligationId,
    ruleId,
    ruleVersion,
    recordedAt,
    terms: {
      obligationKind: terms.obligationKind,
      anchor,
      window: { opensAfter, dueAfter, boundary: window.boundary },
      timeBasis: terms.timeBasis,
      windowSource,
    },
  };
}

/** Content key for duplicate detection: the definition with `recordedAt` compared by instant. */
function definitionKey(d: ObligationDefinition): string {
  return canonicalizeValue({ ...d, recordedAt: canonicalObligationInstant(d.recordedAt) });
}

/** Readable `[ruleId, version]` identity of a canonical record, else `null`. */
function ruleIdentity(ruleId: unknown, version: unknown): string | null {
  return isString(ruleId) && Number.isSafeInteger(version) ? canonicalizeValue([ruleId, version]) : null;
}

/** Strict-UTC knowledge time provably after the cutoff (an unreadable time is never "after"). */
function provablyAfter(value: unknown, cutoff: string | null): boolean {
  return cutoff !== null && isValidAnimalInstant(value) && compareInstants(value, cutoff) > 0;
}

interface AdmittedCatalogue {
  definitions: unknown[];
  ruleVersions: unknown[];
  sources: unknown[];
  reviews: unknown[];
  later: Map<string, LaterObligationDefinitionRef>;
}

/**
 * Knowledge-time admission over CANONICAL records (the catalogue passed the
 * canonical plain-data contract first). Decided per record and only by
 * records known at the cutoff, so a record first known after it can never
 * change an earlier reconstruction:
 * - definitions (`recordedAt`), reviews (`reviewedAt`) and sources
 *   (`retrievedAt`): knowledge time provably after the cutoff ⇒ set aside
 *   unvalidated; otherwise (including an unreadable time) validated, so a
 *   malformed known record fails closed;
 * - rule versions carry no knowledge time: one is relevant only when an
 *   ADMITTED definition or review names it; irrelevant ones cannot affect
 *   any obligation at that cutoff and are not validated; an unreadable
 *   identity is relevant (validated, fails closed if bad).
 * Without a cutoff every record is admitted and validated.
 */
function admitKnownCatalogue(raw: { definitions: unknown[]; ruleVersions: unknown[]; sources: unknown[]; reviews: unknown[] }, cutoff: string | null): AdmittedCatalogue {
  const later = new Map<string, LaterObligationDefinitionRef>();
  const named = new Set<string>();
  const definitions: unknown[] = [];
  for (const item of raw.definitions) {
    if (isRecord(item) && provablyAfter(item.recordedAt, cutoff)) {
      const { obligationId, ruleId, ruleVersion } = item;
      if (isOpaqueRef(obligationId) && isOpaqueRef(ruleId) && isPositiveInteger(ruleVersion)) {
        later.set(canonicalizeValue([obligationId, ruleId, ruleVersion]), { obligationId, ruleId, ruleVersion });
      }
      continue;
    }
    const identity = isRecord(item) ? ruleIdentity(item.ruleId, item.ruleVersion) : null;
    if (identity) named.add(identity);
    definitions.push(item);
  }
  const reviews: unknown[] = [];
  for (const item of raw.reviews) {
    if (isRecord(item) && provablyAfter(item.reviewedAt, cutoff)) continue;
    const identity = isRecord(item) ? ruleIdentity(item.ruleId, item.ruleVersion) : null;
    if (identity) named.add(identity);
    reviews.push(item);
  }
  const sources = raw.sources.filter((item) => !(isRecord(item) && provablyAfter(item.retrievedAt, cutoff)));
  const relevant = (identity: string | null) => cutoff === null || identity === null || named.has(identity);
  const ruleVersions = raw.ruleVersions.filter((item) => relevant(isRecord(item) ? ruleIdentity(item.ruleId, item.version) : null));
  return { definitions, ruleVersions, sources, reviews, later };
}

/**
 * Validates and materialises a supplied catalogue. The catalogue must be
 * canonical plain data (`toCanonicalPlainData`): anything else is rejected
 * whole as `CATTLE_OBLIGATION_CATALOGUE_NON_CANONICAL` before any record is
 * considered. It carries data only — executable implementations are trusted
 * bindings supplied separately (`obligation-implementations.ts`).
 * Order-independent: every list is sorted canonically; identical duplicates
 * collapse; any malformed or contradictory ADMITTED entry fails the whole
 * catalogue (never partially used). With a `knowledgeCutoff`, records are
 * first admitted by knowledge time (`admitKnownCatalogue`).
 */
export function materialiseObligationCatalogue(raw: unknown, knowledgeCutoff?: string): ObligationCatalogueResult {
  const canonical = toCanonicalPlainData(raw);
  if (!canonical.ok) return { ok: false, issues: [{ code: "CATTLE_OBLIGATION_CATALOGUE_NON_CANONICAL", ref: canonical.path }] };
  const top = canonical.value;
  if (!isRecord(top)) return { ok: false, issues: [{ code: "CATTLE_OBLIGATION_CATALOGUE_MALFORMED", ref: null }] };
  const { definitions, ruleVersions, sources, reviews } = top;
  if (![definitions, ruleVersions, sources, reviews].every(Array.isArray)) {
    return { ok: false, issues: [{ code: "CATTLE_OBLIGATION_CATALOGUE_MALFORMED", ref: null }] };
  }
  const cutoff = knowledgeCutoff !== undefined && isValidAnimalInstant(knowledgeCutoff) ? knowledgeCutoff : null;
  const data = admitKnownCatalogue(
    { definitions: definitions as unknown[], ruleVersions: ruleVersions as unknown[], sources: sources as unknown[], reviews: reviews as unknown[] },
    cutoff,
  );
  const issues: ObligationCatalogueIssue[] = [];
  const later = data.later;
  const defs = new Map<string, { def: ObligationDefinition; key: string }>();
  for (const item of data.definitions) {
    const def = definitionOf(item);
    if (!def) {
      issues.push({ code: "CATTLE_OBLIGATION_MALFORMED_DEFINITION", ref: isRecord(item) && isString(item.obligationId) ? item.obligationId : null });
      continue;
    }
    const id = `${def.obligationId}@v${def.ruleVersion}`;
    const key = definitionKey(def);
    const existing = defs.get(id);
    if (!existing) defs.set(id, { def, key });
    else if (existing.key !== key) issues.push({ code: "CATTLE_OBLIGATION_DUPLICATE_DEFINITION_DIFFERENT_CONTENT", ref: id });
    else if (compareStrings(canonicalizeValue(def), canonicalizeValue(existing.def)) < 0) defs.set(id, { def, key });
  }
  const ruleOfObligation = new Map<string, Set<string>>();
  for (const { def } of defs.values()) ruleOfObligation.set(def.obligationId, (ruleOfObligation.get(def.obligationId) ?? new Set()).add(def.ruleId));
  for (const [obligationId, rules] of ruleOfObligation) {
    if (rules.size > 1) issues.push({ code: "CATTLE_OBLIGATION_DEFINITIONS_DISAGREE_ON_RULE", ref: obligationId });
  }

  const rules = new Map<string, { rule: CattleRuleVersion; key: string }>();
  for (const item of data.ruleVersions) {
    const rule = ruleVersionOf(item);
    if (!rule) {
      issues.push({ code: "CATTLE_OBLIGATION_MALFORMED_RULE_VERSION", ref: isRecord(item) && isString(item.ruleId) ? item.ruleId : null });
      continue;
    }
    const id = `${rule.ruleId}@v${rule.version}`;
    const key = canonicalizeValue(rule);
    const existing = rules.get(id);
    if (!existing) rules.set(id, { rule, key });
    else if (existing.key !== key) issues.push({ code: "CATTLE_OBLIGATION_DUPLICATE_RULE_VERSION_DIFFERENT_CONTENT", ref: id });
  }

  const sourceList: CattleEvidenceSource[] = [];
  for (const item of data.sources) {
    const source = sourceOf(item);
    if (!source) issues.push({ code: "CATTLE_OBLIGATION_MALFORMED_SOURCE", ref: isRecord(item) && isString(item.sourceId) ? item.sourceId : null });
    else sourceList.push(source);
  }
  const reviewList: RuleReviewRecord[] = [];
  for (const item of data.reviews) {
    const review = reviewOf(item);
    if (!review) issues.push({ code: "CATTLE_OBLIGATION_MALFORMED_REVIEW", ref: isRecord(item) && isString(item.ruleId) ? item.ruleId : null });
    else reviewList.push(review);
  }

  if (issues.length > 0) {
    const unique = new Map(issues.map((i) => [canonicalizeValue(i), i]));
    return { ok: false, issues: [...unique.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, i]) => i) };
  }
  const byCanonical = <T>(list: T[]): T[] =>
    list
      .map((v) => [canonicalizeValue(v), v] as const)
      .sort(([a], [b]) => compareStrings(a, b))
      .filter(([k], i, arr) => i === 0 || arr[i - 1][0] !== k)
      .map(([, v]) => v);
  const catalogue: ObligationCatalogue = {
    definitions: deepFreezeAnimalValue(
      [...defs.values()].map((e) => e.def).sort((a, b) => compareStrings(a.obligationId, b.obligationId) || a.ruleVersion - b.ruleVersion),
    ),
    ruleVersions: deepFreezeAnimalValue([...rules.values()].map((e) => e.rule).sort((a, b) => compareStrings(a.ruleId, b.ruleId) || a.version - b.version)),
    sources: deepFreezeAnimalValue(byCanonical(sourceList)),
    reviews: deepFreezeAnimalValue(byCanonical(reviewList)),
  };
  const laterDefinitions = deepFreezeAnimalValue(
    [...later.values()].sort((a, b) => compareStrings(a.obligationId, b.obligationId) || compareStrings(a.ruleId, b.ruleId) || a.ruleVersion - b.ruleVersion),
  );
  return { ok: true, catalogue: Object.freeze(catalogue), laterDefinitions };
}

/** Exact rule-version reference of a definition. */
export function obligationDefinitionRuleRef(definition: ObligationDefinition): RuleVersionRef {
  return { ruleId: definition.ruleId, version: definition.ruleVersion };
}
