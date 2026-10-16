/**
 * Cattle C8 — registered, provenance-bound effect and economic models.
 *
 * A model is DATA naming a C0 rule version (`CattleRuleVersion`: classification,
 * source bindings, version-bound reviews, production state and the
 * `RuleImplementationRef` of its trusted executable). It is evaluated only
 * through C0 `evaluateCattleRule` — never re-implemented — with the
 * executable resolved from the SAME trusted implementation registry the C8
 * entry point already takes for C2 (`findObligationImplementation`; no
 * second trusted input). A model counts only when C0 returns PASS: an
 * unregistered implementation, a non-production or unapproved version, a
 * changed source or anything else C0 reports is never a supported effect or
 * a known value (CAT-INV-016/025).
 *
 * - `EFFECT` models carry an opaque `expectedEffect` statement; PASS ⇒
 *   EFFECT_SUPPORTED, FAIL ⇒ EFFECT_NOT_SUPPORTED, anything else ⇒
 *   EFFECT_UNKNOWN. No magnitude or probability is ever produced.
 * - `ECONOMIC` models carry the one value form C8 implements,
 *   `NET_OF_BOUND_OBSERVATIONS`: Σ benefit observations − Σ cost observations,
 *   every number a bound economic observation (CAT-INV-020), computed with the
 *   existing exact-decimal `money.ts` exports (`addMoney` / `subtractMoney`).
 *   The form embeds no price, cost, rate or other constant.
 *
 * CONTENT BINDING (CAT-INV-025; C2 `obligationTermsMarker` precedent): C0
 * reviews approve the rule fingerprint only, so the model's material content
 * (role, `expectedEffect`, value form with its benefit / cost keys) is bound
 * to it — the rule's `assumptions` must carry
 * `recommendationModelContentMarker(model)`, a C8 fingerprint of exactly that
 * content. A model whose content is not bound is never evaluated (UNAVAILABLE
 * ⇒ EFFECT_UNKNOWN / VALUE_UNKNOWN): changing an effect statement or a
 * benefit / cost mapping needs a new rule version and renewed approval.
 *
 * ELIGIBILITY (CAT-INV-016/025; human decision D1, 2026-10-15). C0 PASS is
 * necessary but NOT sufficient: C0 classifications legitimately differ in what
 * they require (a FARMER_INTENT rule needs no source and no review), so C8
 * applies its own, stricter, role-specific policy BEFORE evaluation —
 * `MODEL_ELIGIBILITY` (EFFECT: SCIENCE_TARGET / SCIENCE_CONSTRAINT /
 * SYSTEM_INFERENCE; ECONOMIC: SYSTEM_INFERENCE; never FARMER_INTENT, legal,
 * scheme or veterinary-programme classifications), at least one source
 * binding, SCIENTIFIC among the required reviews and production state
 * PRODUCTION (a SUPERSEDED version is never current). An ineligible model is
 * UNAVAILABLE (⇒ EFFECT_UNKNOWN / VALUE_UNKNOWN), never a request failure.
 * After evaluation the C0 record is carried only as its exact validated copy,
 * and a PASS counts only when the record itself evidences the approval: every
 * review dimension APPROVED (SCIENTIFIC among them) and every bound source
 * CURRENT. Scientific approval of an ECONOMIC model covers its value FORM —
 * which bound observation keys are benefits and which are costs — never the
 * prices: observation amounts and sources are not independently validated
 * (engine limitation, human decision D2).
 *
 * C8 v1 supplies model rules NO animal inputs: a model rule must declare no
 * applicability conditions and no required inputs (otherwise it is malformed
 * and the request fails closed). Model rules are ADVISORY: a model never acts
 * as a hard gate. Production ships no model; tests use synthetic models only.
 *
 * Admission (CAT-INV-003/004/005/008/024): model records by `recordedAt`,
 * reviews by `reviewedAt`, sources by the later of `retrievedAt` /
 * `checkedAt`; a provably later record is set aside unvalidated; an
 * unreadable knowledge time fails closed; model identity (`modelId` +
 * `version`) is judged among admitted records before validity; every
 * admitted record is validated (strict UTC instants, assessment-integrity
 * fingerprints) and any defect fails the request closed.
 */

import { compareInstants } from "../animal-ledger";
import { evaluateCattleRule, type RuleEvaluationRecord } from "../evaluation";
import { rawIdentityKey } from "../health/health-input";
import { compareStrings, type CattleHash } from "../integrity";
import type { AssessmentFingerprint } from "../../assessment-integrity";
import { computeRecommendationFingerprint } from "./recommendation-integrity";
import { canonicalObligationInstant, findObligationImplementation } from "../regulatory";
import { FAIL_CLOSED_UNKNOWN_POLICY, type CattleRuleClassification, type CattleRuleProductionState, type CattleRuleVersion, type RuleReviewRecord } from "../rule";
import { RULE_EVALUATION_RECORD, exact, type CarriedRuleEvaluation } from "./recommendation-exact";
import type { CattleEvidenceSource, CattleSourceAuthorityKind, CattleSourceLifecycle } from "../source";
import type { RecommendationModelRef } from "./candidate-actions";
import { dedupeIssues } from "./candidate-actions";
import { C0_GATE_ROLES, C0_RULE_CLASSIFICATIONS } from "../programmes/programme-consumed";
import { SOURCE_REF, withCanonicalInstants, ownedContentKey, preferredSpelling, arrayOf, code, date, fingerprint, instant, int, isPlainObject, literal, nullable, object, oneOfValues, ownedValid, ref, vocabulary } from "./recommendation-consumed";

export const RECOMMENDATION_MODEL_ROLES = ["EFFECT", "ECONOMIC"] as const;
export type RecommendationModelRole = (typeof RECOMMENDATION_MODEL_ROLES)[number];

export const ECONOMIC_VALUE_FORMS = ["NET_OF_BOUND_OBSERVATIONS"] as const;

export interface EconomicValueForm {
  form: (typeof ECONOMIC_VALUE_FORMS)[number];
  /** Value keys of bound economic observations added (exact decimal). */
  benefitKeys: string[];
  /** Value keys of bound economic observations subtracted. */
  costKeys: string[];
}

export interface RecommendationModelRecord {
  modelId: string;
  version: string;
  /** Knowledge time (strict UTC). */
  recordedAt: string;
  role: RecommendationModelRole;
  /** Governance: classification, source bindings, reviews, production state, implementation binding. Must be ADVISORY. */
  rule: CattleRuleVersion;
  /** EFFECT only: the effect the model asserts (opaque statement; never a number). */
  expectedEffect: string | null;
  /** ECONOMIC only. */
  value: EconomicValueForm | null;
}

export interface AdmittedModelCatalogue {
  /** Sorted by model id, then version. */
  records: RecommendationModelRecord[];
  reviews: RuleReviewRecord[];
  sources: CattleEvidenceSource[];
}

const PRODUCTION_STATES = vocabulary<CattleRuleProductionState>()(["RESEARCH", "DRAFT", "VALIDATED", "APPROVED", "PRODUCTION", "SUPERSEDED", "BLOCKED"]);
const AUTHORITY_KINDS = vocabulary<CattleSourceAuthorityKind>()([
  "LEGISLATION",
  "REGULATORY_GUIDANCE",
  "SCHEME_TERMS",
  "VETERINARY_PROGRAMME",
  "AUTHORISED_PRODUCT_INFORMATION",
  "PEER_REVIEWED_SCIENCE",
  "ADVISORY_SCIENCE",
  "FARM_RECORD",
  "ENGINE_INTERNAL",
]);
const SOURCE_LIFECYCLES = vocabulary<CattleSourceLifecycle>()(["ACTIVE", "HISTORICAL", "SUPERSEDED", "REVIEW_REQUIRED"]);
const REVIEW_DIMENSIONS = ["SCIENTIFIC", "LEGAL", "VETERINARY"] as const;

const RULE_SPEC = object({
  ruleId: ref,
  version: int,
  title: code,
  classification: oneOfValues(C0_RULE_CLASSIFICATIONS),
  gateRole: oneOfValues(C0_GATE_ROLES),
  jurisdiction: nullable(code),
  effectiveFrom: date,
  effectiveTo: nullable(date),
  // C8 supplies model rules no inputs: both must be empty (checked below).
  applicability: arrayOf(code),
  requiredInputs: arrayOf(code),
  assumptions: arrayOf(code),
  limitations: arrayOf(code),
  // C0 supports only its fail-closed policy (`FAIL_CLOSED_UNKNOWN_POLICY`).
  unknownPolicy: object({ missingRequiredInput: literal(FAIL_CLOSED_UNKNOWN_POLICY.missingRequiredInput), conflictingInput: literal(FAIL_CLOSED_UNKNOWN_POLICY.conflictingInput) }),
  sourceBindings: arrayOf(SOURCE_REF),
  implementation: object({ implementationId: ref, version: int, logicFingerprint: fingerprint }),
  supersedes: nullable(object({ ruleId: ref, version: int })),
  requiredReviews: arrayOf(oneOfValues(REVIEW_DIMENSIONS)),
  productionState: oneOfValues(PRODUCTION_STATES),
});

export const MODEL_SPEC = object({
  modelId: ref,
  version: ref,
  recordedAt: instant,
  role: oneOfValues(RECOMMENDATION_MODEL_ROLES),
  rule: RULE_SPEC,
  expectedEffect: nullable(code),
  value: nullable(object({ form: oneOfValues(ECONOMIC_VALUE_FORMS), benefitKeys: arrayOf(ref), costKeys: arrayOf(ref) })),
});

export const REVIEW_SPEC = object({
  ruleId: ref,
  ruleVersion: int,
  ruleFingerprint: fingerprint,
  dimension: oneOfValues(REVIEW_DIMENSIONS),
  decision: oneOfValues(["APPROVED", "REJECTED"] as const),
  reviewerRef: ref,
  reviewedAt: instant,
});

export const SOURCE_SPEC = object({
  sourceId: ref,
  publisher: code,
  title: code,
  authorityKind: oneOfValues(AUTHORITY_KINDS),
  jurisdiction: nullable(code),
  context: nullable(code),
  version: ref,
  contentFingerprint: fingerprint,
  retrievedAt: instant,
  checkedAt: instant,
  lifecycle: oneOfValues(SOURCE_LIFECYCLES),
  supersededByVersion: nullable(ref),
  registeredSourceId: nullable(ref),
});

const unique = (values: readonly string[]) => new Set(values).size === values.length;

function modelCoherent(m: RecommendationModelRecord): boolean {
  const r = m.rule;
  if (r.version < 1 || r.implementation.version < 1 || r.gateRole !== "ADVISORY" || r.applicability.length > 0 || r.requiredInputs.length > 0) return false;
  if (m.role === "EFFECT") return m.expectedEffect !== null && m.value === null;
  if (m.expectedEffect !== null || m.value === null) return false;
  const keys = [...m.value.benefitKeys, ...m.value.costKeys];
  return keys.length > 0 && unique(keys);
}

export type ModelIssueCode =
  | "CATTLE_RECOMMENDATION_MODELS_INVALID"
  | "CATTLE_RECOMMENDATION_MODEL_INVALID"
  | "CATTLE_RECOMMENDATION_MODEL_UNREADABLE_KNOWLEDGE_TIME"
  | "CATTLE_RECOMMENDATION_MODEL_DUPLICATE_DIFFERENT_CONTENT"
  | "CATTLE_RECOMMENDATION_MODEL_REVIEW_INVALID"
  | "CATTLE_RECOMMENDATION_MODEL_SOURCE_INVALID";

type Issue = { code: ModelIssueCode; ref: string | null };

/** The later of two readable knowledge times, or `null` when either is unreadable. */
function laterOf(a: unknown, b: unknown): string | null {
  const x = canonicalObligationInstant(a);
  const y = canonicalObligationInstant(b);
  if (x === null || y === null) return null;
  return compareInstants(x, y) >= 0 ? x : y;
}

/** Knowledge-time admission: provably later ⇒ set aside unvalidated; unreadable ⇒ an issue. */
function admit(records: unknown[], knowledgeTime: (r: unknown) => string | null, knowledgeCutoff: string, unreadable: ModelIssueCode, issues: Issue[]): unknown[] {
  const out: unknown[] = [];
  for (const r of records) {
    const t = knowledgeTime(r);
    if (t === null) issues.push({ code: unreadable, ref: null });
    else if (compareInstants(t, knowledgeCutoff) <= 0) out.push(r);
  }
  return out;
}

const sortedTextSet = (v: unknown): unknown => (Array.isArray(v) && v.every((x) => typeof x === "string") ? [...(v as string[])].sort(compareStrings) : v);

/** A model record with its value-form key sets in canonical (sorted) order; anything malformed is left for validation. */
function canonicalKeySets(r: unknown): unknown {
  if (!isPlainObject(r) || !isPlainObject(r.value)) return r;
  return { ...r, value: { ...r.value, benefitKeys: sortedTextSet(r.value.benefitKeys), costKeys: sortedTextSet(r.value.costKeys) } };
}

export function admitRecommendationModels(raw: unknown, knowledgeCutoff: string): { ok: true; catalogue: AdmittedModelCatalogue } | { ok: false; issues: Issue[] } {
  if (!isPlainObject(raw) || Object.keys(raw).length !== 3 || !Array.isArray(raw.records) || !Array.isArray(raw.reviews) || !Array.isArray(raw.sources)) {
    return { ok: false, issues: [{ code: "CATTLE_RECOMMENDATION_MODELS_INVALID", ref: null }] };
  }
  const issues: Issue[] = [];
  const admittedRecords = admit(raw.records, (r) => (isPlainObject(r) ? canonicalObligationInstant(r.recordedAt) : null), knowledgeCutoff, "CATTLE_RECOMMENDATION_MODEL_UNREADABLE_KNOWLEDGE_TIME", issues);
  const reviews = admit(raw.reviews, (r) => (isPlainObject(r) ? canonicalObligationInstant(r.reviewedAt) : null), knowledgeCutoff, "CATTLE_RECOMMENDATION_MODEL_REVIEW_INVALID", issues);
  const sources = admit(raw.sources, (r) => (isPlainObject(r) ? laterOf(r.retrievedAt, r.checkedAt) : null), knowledgeCutoff, "CATTLE_RECOMMENDATION_MODEL_SOURCE_INVALID", issues);

  // Benefit / cost keys are SETS (the content binding fingerprints them sorted): canonicalised at admission, so key
  // order never changes identity, the context, the pack or the recommendation fingerprint (audit F011).
  const records = admittedRecords.map(canonicalKeySets);
  // Identity before validity among admitted model records (invalid copies included).
  const byIdentity = new Map<string, string>();
  for (const r of records) {
    if (!isPlainObject(r) || typeof r.modelId !== "string" || typeof r.version !== "string") continue;
    const id = JSON.stringify([r.modelId, r.version]);
    const key = ownedContentKey(r, ["recordedAt"]);
    const seen = byIdentity.get(id);
    if (seen !== undefined && seen !== key) issues.push({ code: "CATTLE_RECOMMENDATION_MODEL_DUPLICATE_DIFFERENT_CONTENT", ref: id });
    else byIdentity.set(id, key);
  }
  const models = new Map<string, RecommendationModelRecord>();
  for (const r of records) {
    if (!ownedValid(MODEL_SPEC, r) || !modelCoherent(r as RecommendationModelRecord)) {
      issues.push({ code: "CATTLE_RECOMMENDATION_MODEL_INVALID", ref: isPlainObject(r) && typeof r.modelId === "string" ? r.modelId : null });
      continue;
    }
    const m = withCanonicalInstants(r as RecommendationModelRecord, ["recordedAt"]);
    const id = JSON.stringify([m.modelId, m.version]);
    const kept = models.get(id);
    models.set(id, kept === undefined ? m : preferredSpelling(kept, m));
  }
  for (const r of reviews) if (!ownedValid(REVIEW_SPEC, r)) issues.push({ code: "CATTLE_RECOMMENDATION_MODEL_REVIEW_INVALID", ref: null });
  for (const s of sources) if (!ownedValid(SOURCE_SPEC, s)) issues.push({ code: "CATTLE_RECOMMENDATION_MODEL_SOURCE_INVALID", ref: isPlainObject(s) && typeof s.sourceId === "string" ? s.sourceId : null });
  if (issues.length > 0) return { ok: false, issues: dedupeIssues(issues) };
  return {
    ok: true,
    catalogue: {
      records: [...models.values()].sort((a, b) => compareStrings(a.modelId, b.modelId) || compareStrings(a.version, b.version)),
      reviews: (reviews as RuleReviewRecord[]).map((r) => withCanonicalInstants(r, ["reviewedAt"])).sort((a, b) => compareStrings(rawIdentityKey(a), rawIdentityKey(b))),
      sources: (sources as CattleEvidenceSource[]).map((x) => withCanonicalInstants(x, ["retrievedAt", "checkedAt"])).sort((a, b) => compareStrings(rawIdentityKey(a), rawIdentityKey(b))),
    },
  };
}

/**
 * The catalogue a set of model refs depends on (relevance decided only by
 * admitted records — CAT-INV-006): the referenced model records, the reviews
 * naming their rule versions and the sources their rules bind. Other
 * admitted records are not dependencies of the result.
 */
export function relevantModelCatalogue(catalogue: AdmittedModelCatalogue, refs: readonly RecommendationModelRef[]): AdmittedModelCatalogue {
  const wanted = new Set(refs.map((r) => JSON.stringify([r.modelId, r.version])));
  const records = catalogue.records.filter((m) => wanted.has(JSON.stringify([m.modelId, m.version])));
  const ruleIds = new Set(records.map((m) => JSON.stringify([m.rule.ruleId, m.rule.version])));
  const sourceIds = new Set(records.flatMap((m) => m.rule.sourceBindings.map((b) => b.sourceId)));
  return {
    records,
    reviews: catalogue.reviews.filter((r) => ruleIds.has(JSON.stringify([r.ruleId, r.ruleVersion]))),
    sources: catalogue.sources.filter((s) => sourceIds.has(s.sourceId)),
  };
}

/** Fingerprint of exactly the model content a rule approval must cover (benefit / cost keys as sets). */
export function computeRecommendationModelContentFingerprint(model: RecommendationModelRecord, hash: CattleHash): AssessmentFingerprint {
  return computeRecommendationFingerprint(
    "CATTLE_RECOMMENDATION_MODEL_CONTENT",
    {
      modelId: model.modelId,
      version: model.version,
      role: model.role,
      ruleId: model.rule.ruleId,
      ruleVersion: model.rule.version,
      expectedEffect: model.expectedEffect,
      value: model.value === null ? null : { form: model.value.form, benefitKeys: [...model.value.benefitKeys].sort(compareStrings), costKeys: [...model.value.costKeys].sort(compareStrings) },
    },
    hash,
  );
}

/** The marker the model's C0 rule version must carry in `assumptions`. */
export function recommendationModelContentMarker(model: RecommendationModelRecord, hash: CattleHash): string {
  return `cattle-recommendation-model-content:${model.modelId}:${computeRecommendationModelContentFingerprint(model, hash).digest}`;
}

/** D1: the C0 classifications that may back each model role (fail closed: anything not listed is ineligible). */
export const MODEL_ELIGIBILITY: Readonly<Record<RecommendationModelRole, readonly CattleRuleClassification[]>> = Object.freeze({
  EFFECT: Object.freeze(["SCIENCE_TARGET", "SCIENCE_CONSTRAINT", "SYSTEM_INFERENCE"] as const),
  ECONOMIC: Object.freeze(["SYSTEM_INFERENCE"] as const),
});

/** The eligibility reasons of a model (empty ⇒ eligible); independent of the C0 classification semantics. */
export function modelEligibilityIssues(model: RecommendationModelRecord): string[] {
  const r = model.rule;
  const issues: string[] = [];
  if (!MODEL_ELIGIBILITY[model.role].includes(r.classification)) issues.push(`CLASSIFICATION_NOT_ELIGIBLE_FOR_${model.role}:${r.classification}`);
  if (r.sourceBindings.length === 0) issues.push("NO_SOURCE_BINDING");
  if (!r.requiredReviews.includes("SCIENTIFIC")) issues.push("NO_SCIENTIFIC_REVIEW_REQUIRED");
  if (r.productionState !== "PRODUCTION") issues.push(`NOT_IN_PRODUCTION:${r.productionState}`);
  return issues;
}

/** True when a PASS record itself evidences approval: reviews non-empty, all APPROVED, SCIENTIFIC among them; sources non-empty, all CURRENT. */
export function approvalEvidenced(record: CarriedRuleEvaluation): boolean {
  return (
    record.reviews.length > 0 &&
    record.reviews.every((x) => x.state === "APPROVED") &&
    record.reviews.some((x) => x.dimension === "SCIENTIFIC") &&
    record.sourceChecks.length > 0 &&
    record.sourceChecks.every((c) => c.status === "CURRENT")
  );
}

export type ModelEvaluation =
  | { state: "EVALUATED"; model: RecommendationModelRecord; ruleEvaluation: CarriedRuleEvaluation }
  | { state: "UNAVAILABLE"; reasonCodes: string[] };

/** Evaluates one referenced model through C0 at `evaluationDate` (no inputs supplied). */
export function evaluateRecommendationModel(
  ref: RecommendationModelRef,
  role: RecommendationModelRole,
  catalogue: AdmittedModelCatalogue,
  implementations: unknown,
  evaluationDate: string,
  hash: CattleHash,
): ModelEvaluation {
  const model = catalogue.records.find((m) => m.modelId === ref.modelId && m.version === ref.version);
  if (model === undefined) return { state: "UNAVAILABLE", reasonCodes: [`CATTLE_RECOMMENDATION_MODEL_NOT_KNOWN:${JSON.stringify([ref.modelId, ref.version])}`] };
  if (model.role !== role) return { state: "UNAVAILABLE", reasonCodes: [`CATTLE_RECOMMENDATION_MODEL_ROLE_MISMATCH:${JSON.stringify([ref.modelId, ref.version])}`] };
  if (!model.rule.assumptions.includes(recommendationModelContentMarker(model, hash))) {
    return { state: "UNAVAILABLE", reasonCodes: [`CATTLE_RECOMMENDATION_MODEL_CONTENT_NOT_BOUND_TO_RULE_VERSION:${JSON.stringify([ref.modelId, ref.version])}`] };
  }
  const id = JSON.stringify([ref.modelId, ref.version]);
  const ineligible = modelEligibilityIssues(model);
  if (ineligible.length > 0) return { state: "UNAVAILABLE", reasonCodes: ineligible.map((i) => `CATTLE_RECOMMENDATION_MODEL_NOT_ELIGIBLE:${i}:${id}`) };
  const implementation = findObligationImplementation(implementations, model.rule.implementation.implementationId, model.rule.implementation.version);
  if (implementation === null) return { state: "UNAVAILABLE", reasonCodes: [`CATTLE_RECOMMENDATION_MODEL_IMPLEMENTATION_NOT_REGISTERED:${id}`] };
  let raw: RuleEvaluationRecord;
  try {
    raw = evaluateCattleRule(model.rule, implementation, { evaluationDate, inputs: [], catalogue: catalogue.sources, reviews: catalogue.reviews }, hash);
  } catch {
    return { state: "UNAVAILABLE", reasonCodes: [`CATTLE_RECOMMENDATION_MODEL_EVALUATION_FAILED:${id}`] };
  }
  // The C0 record is carried only as its exact validated copy (CAT-INV-028).
  const ruleEvaluation = exact(RULE_EVALUATION_RECORD, raw);
  if (ruleEvaluation === null || ruleEvaluation.requestedRuleId !== model.rule.ruleId) return { state: "UNAVAILABLE", reasonCodes: [`CATTLE_RECOMMENDATION_MODEL_EVALUATION_MALFORMED:${id}`] };
  if (ruleEvaluation.state === "PASS" && !approvalEvidenced(ruleEvaluation)) return { state: "UNAVAILABLE", reasonCodes: [`CATTLE_RECOMMENDATION_MODEL_APPROVAL_NOT_EVIDENCED:${id}`] };
  return { state: "EVALUATED", model, ruleEvaluation };
}
