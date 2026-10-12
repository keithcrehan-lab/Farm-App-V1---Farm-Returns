/**
 * Cattle C3 — supplied authorised-product records and administration binding.
 *
 * Product facts (authorisation, label, species authorisation, withdrawal
 * periods per food product and route, how a period applies across a
 * multi-dose course) are DATA supplied with provenance, never constants in
 * code. Each record carries a C0-style source binding: publisher (authority),
 * `SourceVersionRef` (source id, version, content fingerprint — validated for
 * shape, CAT-INV-024) and `retrievedAt`/`checkedAt`. Nothing here reads or
 * interprets an SPC beyond these supplied structured fields, and no product
 * catalogue ships with the engine (CAT-INV-027).
 *
 * Identity is product id + version. Same identity + identical content
 * (instants by instant) is idempotent; same identity + different content
 * fails closed. A revision is a new version whose `supersedesVersions` names
 * earlier versions of the same product; nothing is deleted.
 *
 * Knowledge time: a record is known from the LATER of `retrievedAt` and
 * `checkedAt` (both are content of the record). At a cutoff, a record with
 * either time readable and after the cutoff is set aside unvalidated; a
 * record whose times cannot be read fails closed (CAT-INV-003/004/005).
 *
 * Binding of an administration to a product (first match wins):
 * 1. `UNKNOWN` — the administration names no product, or no record for the
 *    product id is known by the cutoff.
 * 2. `INVALID` — a supersession link among the product's records is
 *    defective (target version not known, cycle).
 * 3. `EVIDENCE_CONFLICT` — competing revisions, or more than one live
 *    (unsuperseded) version: no precedence, no latest-wins (CAT-INV-026).
 * 4. `REVIEW_REQUIRED` — the single live version's lifecycle is not ACTIVE.
 * 5. `UNSUPPORTED` — the live version records no authorisation for BOVINE.
 * 6. `EVIDENCE_CONFLICT` — the authorisation recorded on the administration
 *    differs from the product record's (exact comparison).
 * 7. `BOUND`.
 * The bound version is the single live version known at the cutoff; the
 * engine does not decide which historical product information version
 * governed a past administration (documented limitation).
 */

import { canonicalizeValue } from "../../assessment-integrity";
import { BOVINE_SPECIES, animalInstantKey, compareInstants, deepFreezeAnimalValue, isOpaqueRef, isValidAnimalInstant } from "../animal-ledger";
import { compareStrings, sortedUnique } from "../integrity";
import type { SourceVersionRef } from "../source";
import { canonicalField, toCanonicalPlainData } from "../regulatory/canonical-input";
import { collectBitemporalRecords, resolveBitemporalRecords, type BitemporalRecord } from "../regulatory/bitemporal-records";
import { hasOnlyFields, isRecord, nullableRef, oneOf, rawIdentityKey, sourceVersionRefOf, suppliedQuantityOf } from "./health-input";
import type { MedicineAdministrationRecord, ProductAuthorisationRef, SuppliedQuantity } from "./health-records";

export const PRODUCT_RECORD_LIFECYCLES = ["ACTIVE", "HISTORICAL", "REVIEW_REQUIRED"] as const;
export type ProductRecordLifecycle = (typeof PRODUCT_RECORD_LIFECYCLES)[number];

/** How a supplied withdrawal period applies across a multi-dose course, as stated by the product data. */
export const MULTI_DOSE_BASES = ["PERIOD_FROM_EACH_ADMINISTRATION"] as const;
export type MultiDoseBasis = (typeof MULTI_DOSE_BASES)[number];

export interface WithdrawalPeriodEntry {
  /** Opaque food-product code, matched exactly. */
  foodProduct: string;
  /** Opaque route the period is stated for; `null` = the supplied period is not route-specific. */
  route: string | null;
  /** The period exactly as supplied; `null` = the source states no period (unknown, never zero). */
  period: SuppliedQuantity | null;
  /** `null` = no supplied rule for multi-dose courses. */
  multiDoseBasis: MultiDoseBasis | null;
}

export interface SpeciesAuthorisation {
  /** Opaque species code; only an exact `BOVINE` entry authorises use in cattle. */
  species: string;
  /** Sorted by food product then route; one entry per (food product, route). */
  withdrawalPeriods: WithdrawalPeriodEntry[];
}

export interface ProductSourceBinding {
  /** The publishing authority, opaque. */
  publisher: string;
  sourceRef: SourceVersionRef;
  retrievedAt: string;
  checkedAt: string;
}

export interface AuthorisedProductRecord {
  productId: string;
  version: string;
  /** Earlier versions of the same product this version revises. Sorted. */
  supersedesVersions: string[];
  authorisation: ProductAuthorisationRef;
  label: string;
  lifecycle: ProductRecordLifecycle;
  /** Sorted by species; one entry per species. */
  speciesAuthorisations: SpeciesAuthorisation[];
  source: ProductSourceBinding;
}

/** The exact product version (and its source binding) an administration was bound to. */
export interface ProductVersionRef {
  productId: string;
  version: string;
  source: SourceVersionRef;
}

export type ProductRecordIssueCode =
  | "CATTLE_HEALTH_PRODUCT_RECORD_NON_CANONICAL"
  | "CATTLE_HEALTH_PRODUCT_RECORD_NOT_OBJECT"
  | "CATTLE_HEALTH_PRODUCT_RECORD_INVALID_IDENTITY"
  | "CATTLE_HEALTH_PRODUCT_RECORD_INVALID_KNOWLEDGE_TIME"
  | "CATTLE_HEALTH_PRODUCT_RECORD_INVALID_SOURCE"
  | "CATTLE_HEALTH_PRODUCT_RECORD_INVALID_CONTENT"
  | "CATTLE_HEALTH_PRODUCT_RECORD_SELF_SUPERSESSION"
  | "CATTLE_HEALTH_PRODUCT_RECORD_DUPLICATE_VERSION_DIFFERENT_CONTENT";

export interface ProductRecordIssue {
  code: ProductRecordIssueCode;
  /** `productId@version` when readable. */
  ref: string | null;
}

export function productVersionRef(record: AuthorisedProductRecord): ProductVersionRef {
  return { productId: record.productId, version: record.version, source: record.source.sourceRef };
}

export function compareProductVersionRefs(a: ProductVersionRef, b: ProductVersionRef): number {
  return compareStrings(a.productId, b.productId) || compareStrings(a.version, b.version);
}

function displayRef(productId: unknown, version: unknown): string | null {
  return isOpaqueRef(productId) && isOpaqueRef(version) ? `${productId}@${version}` : null;
}

/** KNOWLEDGE time of a valid record: the later of retrieved/checked. */
export function productKnownAt(record: AuthorisedProductRecord): string {
  return compareInstants(record.source.retrievedAt, record.source.checkedAt) >= 0 ? record.source.retrievedAt : record.source.checkedAt;
}

/** True when either readable knowledge time of a canonical raw record is after the cutoff (module-internal). */
function productRecordKnownAfter(raw: unknown, knowledgeCutoff: string): boolean {
  return [canonicalField(raw, "source", "retrievedAt"), canonicalField(raw, "source", "checkedAt")].some(
    (t) => isValidAnimalInstant(t) && compareInstants(t, knowledgeCutoff) > 0,
  );
}

function withdrawalEntryOf(raw: unknown): WithdrawalPeriodEntry | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["foodProduct", "route", "period", "multiDoseBasis"]) || !isOpaqueRef(raw.foodProduct)) return null;
  const route = nullableRef(raw.route);
  const rawPeriod = raw.period ?? null;
  const period = rawPeriod === null ? null : suppliedQuantityOf(rawPeriod);
  const basis = raw.multiDoseBasis ?? null;
  if (!route.ok || (rawPeriod !== null && period === null) || (basis !== null && !oneOf(MULTI_DOSE_BASES, basis))) return null;
  return { foodProduct: raw.foodProduct, route: route.value, period, multiDoseBasis: basis as MultiDoseBasis | null };
}

function speciesAuthorisationOf(raw: unknown): SpeciesAuthorisation | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["species", "withdrawalPeriods"]) || !isOpaqueRef(raw.species) || !Array.isArray(raw.withdrawalPeriods)) return null;
  const entries: WithdrawalPeriodEntry[] = [];
  for (const e of raw.withdrawalPeriods) {
    const entry = withdrawalEntryOf(e);
    if (entry === null) return null;
    entries.push(entry);
  }
  const keys = entries.map((e) => rawIdentityKey([e.foodProduct, e.route]));
  if (new Set(keys).size !== keys.length) return null;
  entries.sort((a, b) => compareStrings(a.foodProduct, b.foodProduct) || compareStrings(rawIdentityKey(a.route), rawIdentityKey(b.route)));
  return { species: raw.species, withdrawalPeriods: entries };
}

export type ProductRecordMaterialisation = { ok: true; record: AuthorisedProductRecord } | { ok: false; ref: string | null; issues: ProductRecordIssueCode[] };

const PRODUCT_FIELDS = new Set(["productId", "version", "supersedesVersions", "authorisation", "label", "lifecycle", "speciesAuthorisations", "source"]);

/**
 * Validates one product record and rebuilds it from known fields. The input
 * must be canonical plain data (checked first, never read through an
 * accessor); the result is detached and deep-frozen.
 */
export function materialiseProductRecord(raw: unknown): ProductRecordMaterialisation {
  const canonical = toCanonicalPlainData(raw);
  if (!canonical.ok) return deepFreezeAnimalValue({ ok: false, ref: null, issues: ["CATTLE_HEALTH_PRODUCT_RECORD_NON_CANONICAL"] });
  return deepFreezeAnimalValue(materialiseCanonicalProductRecord(canonical.value));
}

/** Validation of an already-canonical raw record (module-internal). */
function materialiseCanonicalProductRecord(raw: unknown): ProductRecordMaterialisation {
  if (!isRecord(raw)) return { ok: false, ref: null, issues: ["CATTLE_HEALTH_PRODUCT_RECORD_NOT_OBJECT"] };
  const ref = displayRef(raw.productId, raw.version);
  const issues: ProductRecordIssueCode[] = [];
  if (ref === null) issues.push("CATTLE_HEALTH_PRODUCT_RECORD_INVALID_IDENTITY");
  const src = raw.source;
  const timesOk = isRecord(src) && isValidAnimalInstant(src.retrievedAt) && isValidAnimalInstant(src.checkedAt);
  if (!timesOk) issues.push("CATTLE_HEALTH_PRODUCT_RECORD_INVALID_KNOWLEDGE_TIME");
  const sourceRef = isRecord(src) ? sourceVersionRefOf(src.sourceRef) : null;
  const sourceOk = isRecord(src) && isOpaqueRef(src.publisher) && sourceRef !== null && Object.keys(src).every((k) => ["publisher", "sourceRef", "retrievedAt", "checkedAt"].includes(k));
  if (!sourceOk) issues.push("CATTLE_HEALTH_PRODUCT_RECORD_INVALID_SOURCE");
  const auth = raw.authorisation;
  const authOk = isRecord(auth) && hasOnlyFields(auth, ["scheme", "number"]) && isOpaqueRef(auth.scheme) && isOpaqueRef(auth.number);
  const rawSupersedes = raw.supersedesVersions ?? [];
  const supersedesOk = Array.isArray(rawSupersedes) && rawSupersedes.every(isOpaqueRef) && new Set(rawSupersedes).size === rawSupersedes.length;
  const species: SpeciesAuthorisation[] = [];
  let speciesOk = Array.isArray(raw.speciesAuthorisations);
  for (const s of speciesOk ? (raw.speciesAuthorisations as unknown[]) : []) {
    const entry = speciesAuthorisationOf(s);
    if (entry === null) speciesOk = false;
    else species.push(entry);
  }
  if (speciesOk && new Set(species.map((s) => s.species)).size !== species.length) speciesOk = false;
  const contentOk =
    authOk && supersedesOk && speciesOk && isOpaqueRef(raw.label) && oneOf(PRODUCT_RECORD_LIFECYCLES, raw.lifecycle) && Object.keys(raw).every((k) => PRODUCT_FIELDS.has(k));
  if (!contentOk) issues.push("CATTLE_HEALTH_PRODUCT_RECORD_INVALID_CONTENT");
  if (supersedesOk && (rawSupersedes as string[]).includes(raw.version as string)) issues.push("CATTLE_HEALTH_PRODUCT_RECORD_SELF_SUPERSESSION");
  if (issues.length > 0 || !isRecord(src) || sourceRef === null || !isRecord(auth)) return { ok: false, ref, issues };
  return {
    ok: true,
    record: {
      productId: raw.productId as string,
      version: raw.version as string,
      supersedesVersions: [...(rawSupersedes as string[])].sort(compareStrings),
      authorisation: { scheme: auth.scheme as string, number: auth.number as string },
      label: raw.label as string,
      lifecycle: raw.lifecycle as ProductRecordLifecycle,
      speciesAuthorisations: species.sort((a, b) => compareStrings(a.species, b.species)),
      source: { publisher: src.publisher as string, sourceRef, retrievedAt: src.retrievedAt as string, checkedAt: src.checkedAt as string },
    },
  };
}

function semanticProduct(r: AuthorisedProductRecord): unknown {
  return { ...r, source: { ...r.source, retrievedAt: animalInstantKey(r.source.retrievedAt), checkedAt: animalInstantKey(r.source.checkedAt) } };
}

/** Every field; instants compared by instant. */
export function productRecordContentKey(r: AuthorisedProductRecord): string {
  return canonicalizeValue(semanticProduct(r));
}

/** What competing revisions must agree on (source binding and links excluded). */
function productClaimKey(r: AuthorisedProductRecord): string {
  return canonicalizeValue({ authorisation: r.authorisation, label: r.label, lifecycle: r.lifecycle, speciesAuthorisations: r.speciesAuthorisations });
}

type ProductEnvelope = AuthorisedProductRecord & BitemporalRecord;

const envelopeId = (productId: string, version: string) => canonicalizeValue([productId, version]);

function envelope(r: AuthorisedProductRecord): ProductEnvelope {
  return { ...r, recordId: envelopeId(r.productId, r.version), supersedes: r.supersedesVersions.map((v) => envelopeId(r.productId, v)).sort(compareStrings), receivedAt: productKnownAt(r) };
}

export type ProductAdmissionResult = { ok: true; records: AuthorisedProductRecord[] } | { ok: false; issues: ProductRecordIssue[] };

/**
 * Admission at a cutoff over canonical raw records. The complete collection
 * must be canonical plain data (checked first, collection and elements; no
 * accessor is invoked) and only the detached copy is used. Provably-later
 * records are set aside unvalidated; identity collisions among the admitted
 * are found before content validity (CAT-INV-008); then content is validated.
 * Any malformed admitted record or collision fails the whole product input
 * closed. The result is detached and deep-frozen.
 */
export function admitProductRecords(raws: readonly unknown[], knowledgeCutoff: string): ProductAdmissionResult {
  const canonical = toCanonicalPlainData(raws);
  if (!canonical.ok || !Array.isArray(canonical.value)) {
    return deepFreezeAnimalValue({ ok: false, issues: [{ code: "CATTLE_HEALTH_PRODUCT_RECORD_NON_CANONICAL", ref: null }] });
  }
  return deepFreezeAnimalValue(admitCanonicalProductRecords(canonical.value, knowledgeCutoff));
}

function admitCanonicalProductRecords(raws: readonly unknown[], knowledgeCutoff: string): ProductAdmissionResult {
  const admitted = raws.filter((raw) => !productRecordKnownAfter(raw, knowledgeCutoff));
  const issues: ProductRecordIssue[] = [];
  const materialised = admitted.map((raw) => ({ raw, result: materialiseCanonicalProductRecord(raw) }));
  const byIdentity = new Map<string, { ref: string; keys: Set<string> }>();
  for (const { raw, result } of materialised) {
    const ref = isRecord(raw) ? displayRef(raw.productId, raw.version) : null;
    if (ref === null || !isRecord(raw)) continue;
    const identity = envelopeId(raw.productId as string, raw.version as string);
    const key = result.ok ? `valid:${productRecordContentKey(result.record)}` : `raw:${rawIdentityKey(raw)}`;
    const group = byIdentity.get(identity) ?? { ref, keys: new Set<string>() };
    group.keys.add(key);
    byIdentity.set(identity, group);
  }
  for (const { ref, keys } of byIdentity.values()) {
    if (keys.size > 1) issues.push({ code: "CATTLE_HEALTH_PRODUCT_RECORD_DUPLICATE_VERSION_DIFFERENT_CONTENT", ref });
  }
  const valid: ProductEnvelope[] = [];
  for (const { result } of materialised) {
    if (result.ok) valid.push(envelope(result.record));
    else issues.push(...result.issues.map((code) => ({ code, ref: result.ref })));
  }
  const collected = collectBitemporalRecords(valid, (e) => productRecordContentKey(stripProduct(e)));
  if (!collected.ok) {
    for (const i of collected.issues) {
      const record = valid.find((v) => v.recordId === i.recordId);
      issues.push({
        code: i.code === "CATTLE_RECORD_SELF_SUPERSESSION" ? "CATTLE_HEALTH_PRODUCT_RECORD_SELF_SUPERSESSION" : "CATTLE_HEALTH_PRODUCT_RECORD_DUPLICATE_VERSION_DIFFERENT_CONTENT",
        ref: record ? `${record.productId}@${record.version}` : null,
      });
    }
  }
  if (issues.length > 0 || !collected.ok) return { ok: false, issues: uniqueIssues(issues) };
  return { ok: true, records: collected.records.map(stripProduct) };
}

function uniqueIssues(issues: ProductRecordIssue[]): ProductRecordIssue[] {
  const unique = new Map(issues.map((i) => [`${i.ref ?? ""}\u0000${i.code}`, i]));
  return [...unique.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, i]) => i);
}

function stripProduct(e: ProductEnvelope): AuthorisedProductRecord {
  const { recordId, supersedes, receivedAt, ...record } = e;
  void recordId;
  void supersedes;
  void receivedAt;
  return record;
}

export interface ProductResolution {
  productId: string;
  /** Every version known by the cutoff (sorted). */
  known: ProductVersionRef[];
  live: AuthorisedProductRecord[];
  invalidLinks: boolean;
  competing: boolean;
}

/** Resolves every product's admitted versions at the cutoff (revisions may only link within one product). */
export function resolveProductRecords(records: readonly AuthorisedProductRecord[], knowledgeCutoff: string): Map<string, ProductResolution> {
  const out = new Map<string, ProductResolution>();
  for (const productId of sortedUnique(records.map((r) => r.productId))) {
    const own = records.filter((r) => r.productId === productId).map(envelope);
    const resolution = resolveBitemporalRecords(own, knowledgeCutoff, {
      linkAllowed: (source, target) => source.productId === target.productId,
      competitionKey: productClaimKey,
    });
    out.set(productId, {
      productId,
      known: resolution.known.map((e) => productVersionRef(stripProduct(e))).sort(compareProductVersionRefs),
      live: resolution.live.map(stripProduct).sort((a, b) => compareStrings(a.version, b.version)),
      invalidLinks: resolution.linkIssues.length > 0,
      competing: resolution.competitions.length > 0,
    });
  }
  return out;
}

export type ProductBindingState = "BOUND" | "UNKNOWN" | "INVALID" | "EVIDENCE_CONFLICT" | "REVIEW_REQUIRED" | "UNSUPPORTED";

export interface ProductBinding {
  state: ProductBindingState;
  /** The bound version; set only when BOUND. */
  product: ProductVersionRef | null;
  /** Every version of the named product known by the cutoff. */
  consideredVersions: ProductVersionRef[];
  reasonCodes: string[];
}

/** Binds one administration to the supplied product data known at the cutoff (precedence in the header). */
export function bindAdministrationProduct(
  administration: MedicineAdministrationRecord,
  products: ReadonlyMap<string, ProductResolution>,
): { binding: ProductBinding; record: AuthorisedProductRecord | null } {
  const unbound = (state: ProductBindingState, reason: string, considered: ProductVersionRef[] = []) => ({
    binding: { state, product: null, consideredVersions: considered, reasonCodes: [reason] },
    record: null,
  });
  if (administration.productId === null) return unbound("UNKNOWN", "CATTLE_HEALTH_PRODUCT_NOT_IDENTIFIED");
  const resolution = products.get(administration.productId);
  if (!resolution) return unbound("UNKNOWN", "CATTLE_HEALTH_PRODUCT_RECORD_MISSING");
  const considered = resolution.known;
  if (resolution.invalidLinks) return unbound("INVALID", "CATTLE_HEALTH_PRODUCT_SUPERSESSION_INVALID", considered);
  if (resolution.competing || resolution.live.length !== 1) return unbound("EVIDENCE_CONFLICT", "CATTLE_HEALTH_PRODUCT_COMPETING_VERSIONS", considered);
  const record = resolution.live[0];
  if (record.lifecycle !== "ACTIVE") return unbound("REVIEW_REQUIRED", `CATTLE_HEALTH_PRODUCT_RECORD_NOT_CURRENT:${record.lifecycle}`, considered);
  if (!record.speciesAuthorisations.some((s) => s.species === BOVINE_SPECIES)) return unbound("UNSUPPORTED", "CATTLE_HEALTH_PRODUCT_NOT_AUTHORISED_FOR_BOVINE", considered);
  const recorded = administration.recordedAuthorisation;
  if (recorded !== null && (recorded.scheme !== record.authorisation.scheme || recorded.number !== record.authorisation.number)) {
    return unbound("EVIDENCE_CONFLICT", "CATTLE_HEALTH_PRODUCT_AUTHORISATION_MISMATCH", considered);
  }
  return { binding: { state: "BOUND", product: productVersionRef(record), consideredVersions: considered, reasonCodes: [] }, record };
}
