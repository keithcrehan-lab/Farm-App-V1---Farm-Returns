/**
 * Cattle C3 — canonical, append-only, bitemporal health records.
 *
 * Health is a timeline, never a status flag. Record kinds:
 * - `HEALTH_OBSERVATION` — an observed sign/finding (`OBSERVED_SIGN`) or a
 *   suspected-condition note (`SUSPECTED_CONDITION`) that stays labelled as
 *   such; free text or source-coded, never auto-classified.
 * - `SYMPTOM` — reported/observed; never upgraded to a diagnosis (a
 *   correction may only supersede a record of its own kind).
 * - `DIAGNOSIS` — accepted ONLY with diagnosing-source provenance: actor role
 *   `VETERINARIAN` received from a `VETERINARY_SOURCE`, or `LABORATORY`
 *   received from a `VETERINARY_SOURCE` or `OTHER` (a laboratory) source. A
 *   farmer/staff/system record can never create one; it is rejected.
 * - `VETERINARY_EVENT` — visit/examination/procedure with an opaque
 *   practitioner ref.
 * - `TREATMENT` — a course/episode; administrations name it by record id.
 * - `MEDICINE_ADMINISTRATION` — product id (opaque ref to a supplied
 *   `AuthorisedProductRecord`), batch, dose/route/site exactly as supplied,
 *   administered-at instant (`occurredAt`; `null` = time not supplied),
 *   administered-by actor, prescription ref and any explicitly supplied
 *   prescriber-specified withdrawal periods.
 * - `RETRACTION` — retracts the records it supersedes (no claim of its own).
 *
 * Every record carries the C1 `FarmReturnAnimalId`, valid time `occurredAt`,
 * operational provenance (C1 `AnimalDataProvenance` contract plus a closed
 * `actorRole`; `receivedAt` is KNOWLEDGE time) and an optional C0
 * `SourceVersionRef` for a source document. Nothing here infers, classifies,
 * diagnoses, prescribes or chooses a dose/route.
 *
 * C1's provenance materialiser is module-private (C1 is frozen), so the same
 * `AnimalDataProvenance` contract is validated here, as C2 does.
 */

import { canonicalizeValue } from "../../assessment-integrity";
import {
  ANIMAL_DATA_SOURCE_CATEGORIES,
  animalInstantKey,
  isOpaqueRef,
  isValidAnimalInstant,
  type AnimalDataProvenance,
  type AnimalDataSourceCategory,
  type FarmReturnAnimalId,
} from "../animal-ledger";
import type { CattleInformationClass } from "../information";
import { compareStrings } from "../integrity";
import type { SourceVersionRef } from "../source";
import { isRecord, nullableRef, oneOf, sourceVersionRefOf, suppliedQuantityOf, type Raw } from "./health-input";

export const HEALTH_RECORD_KINDS = [
  "HEALTH_OBSERVATION",
  "SYMPTOM",
  "DIAGNOSIS",
  "VETERINARY_EVENT",
  "TREATMENT",
  "MEDICINE_ADMINISTRATION",
  "RETRACTION",
] as const;
export type HealthRecordKind = (typeof HEALTH_RECORD_KINDS)[number];

/** Who produced the record. A role never implies a connected integration. */
export const HEALTH_ACTOR_ROLES = ["VETERINARIAN", "LABORATORY", "FARMER", "FARM_STAFF", "SYSTEM", "OTHER"] as const;
export type HealthActorRole = (typeof HEALTH_ACTOR_ROLES)[number];

export const HEALTH_OBSERVATION_NOTE_KINDS = ["OBSERVED_SIGN", "SUSPECTED_CONDITION"] as const;
export type HealthObservationNoteKind = (typeof HEALTH_OBSERVATION_NOTE_KINDS)[number];

export const VETERINARY_EVENT_TYPES = ["VISIT", "EXAMINATION", "PROCEDURE", "OTHER"] as const;
export type VeterinaryEventType = (typeof VETERINARY_EVENT_TYPES)[number];

export interface HealthRecordProvenance extends AnimalDataProvenance {
  actorRole: HealthActorRole;
}

/** A finding exactly as supplied: source code (system + code) and/or free text. Never classified. */
export interface HealthFinding {
  codeSystem: string | null;
  code: string | null;
  text: string | null;
}

/** A quantity exactly as supplied (value + opaque unit); never converted or rounded. */
export interface SuppliedQuantity {
  amount: number;
  unit: string;
}

export interface ProductAuthorisationRef {
  scheme: string;
  number: string;
}

export interface PrescriberWithdrawalPeriod {
  /** Opaque food-product code, matched exactly. */
  foodProduct: string;
  period: SuppliedQuantity;
}

/** Withdrawal periods a prescriber explicitly specified for this administration. */
export interface PrescriberWithdrawal {
  prescriberRef: string;
  /** Sorted by food product; one per food product. */
  periods: PrescriberWithdrawalPeriod[];
}

interface HealthRecordCommon {
  recordId: string;
  animalId: FarmReturnAnimalId;
  /** VALID time the event/administration happened; `null` = not supplied (unknown). */
  occurredAt: string | null;
  provenance: HealthRecordProvenance;
  /** Optional C0 source binding of a supporting document (e.g. a report). */
  sourceDocument: SourceVersionRef | null;
  /** Earlier record ids (same animal) this record corrects. Sorted. */
  supersedes: string[];
}

export interface MedicineAdministrationDetail {
  kind: "MEDICINE_ADMINISTRATION";
  /** Opaque product id of a supplied `AuthorisedProductRecord`; `null` = product not identified. */
  productId: string | null;
  /** Authorisation as recorded at administration, when supplied; compared exactly with the product record. */
  recordedAuthorisation: ProductAuthorisationRef | null;
  recordedLabel: string | null;
  batchRef: string | null;
  dose: SuppliedQuantity | null;
  route: string | null;
  site: string | null;
  administeredByRef: string | null;
  prescriptionRef: string | null;
  /** Record id of the TREATMENT (course) this administration belongs to. */
  treatmentRecordId: string | null;
  prescriberWithdrawal: PrescriberWithdrawal | null;
}

export type HealthRecordDetail =
  | { kind: "HEALTH_OBSERVATION"; noteKind: HealthObservationNoteKind; finding: HealthFinding }
  | { kind: "SYMPTOM"; finding: HealthFinding }
  | { kind: "DIAGNOSIS"; condition: HealthFinding; diagnosedByRef: string }
  | { kind: "VETERINARY_EVENT"; eventType: VeterinaryEventType; practitionerRef: string; finding: HealthFinding | null }
  | { kind: "TREATMENT"; prescriptionRef: string | null; practitionerRef: string | null; finding: HealthFinding | null }
  | MedicineAdministrationDetail
  | { kind: "RETRACTION" };

export type HealthRecord = HealthRecordCommon & HealthRecordDetail;
export type MedicineAdministrationRecord = HealthRecordCommon & MedicineAdministrationDetail;

/** Information class of each kind (a diagnosis is a sourced finding, not a FACT). */
export function healthRecordInformationClass(kind: HealthRecordKind): CattleInformationClass | null {
  switch (kind) {
    case "HEALTH_OBSERVATION":
    case "SYMPTOM":
    case "DIAGNOSIS":
      return "OBSERVATION";
    case "VETERINARY_EVENT":
    case "TREATMENT":
    case "MEDICINE_ADMINISTRATION":
      return "FACT";
    case "RETRACTION":
      return null;
  }
}

export type HealthRecordIssueCode =
  | "CATTLE_HEALTH_RECORD_NOT_OBJECT"
  | "CATTLE_HEALTH_RECORD_INVALID_ID"
  | "CATTLE_HEALTH_RECORD_FOR_OTHER_ANIMAL"
  | "CATTLE_HEALTH_RECORD_INVALID_KIND"
  | "CATTLE_HEALTH_RECORD_INVALID_OCCURRED_AT"
  | "CATTLE_HEALTH_RECORD_INVALID_PROVENANCE"
  | "CATTLE_HEALTH_RECORD_INVALID_SOURCE_DOCUMENT"
  | "CATTLE_HEALTH_RECORD_INVALID_SUPERSEDES"
  | "CATTLE_HEALTH_RECORD_SELF_SUPERSESSION"
  | "CATTLE_HEALTH_RECORD_INVALID_DETAIL"
  | "CATTLE_HEALTH_DIAGNOSIS_SOURCE_NOT_DIAGNOSTIC"
  | "CATTLE_HEALTH_RETRACTION_WITHOUT_TARGET";

// ---------------------------------------------------------------------------
// Materialisation
// ---------------------------------------------------------------------------

function provenanceOf(raw: unknown): HealthRecordProvenance | null {
  if (!isRecord(raw)) return null;
  if (!oneOf(ANIMAL_DATA_SOURCE_CATEGORIES, raw.sourceCategory) || !oneOf(HEALTH_ACTOR_ROLES, raw.actorRole)) return null;
  if (!isValidAnimalInstant(raw.receivedAt)) return null;
  const observedAt = raw.observedAt ?? null;
  if (observedAt !== null && !isValidAnimalInstant(observedAt)) return null;
  const system = nullableRef(raw.sourceSystem);
  const record = nullableRef(raw.sourceRecordRef);
  const actor = nullableRef(raw.actor);
  if (!system.ok || !record.ok || !actor.ok) return null;
  return {
    sourceCategory: raw.sourceCategory as AnimalDataSourceCategory,
    sourceSystem: system.value,
    sourceRecordRef: record.value,
    observedAt: observedAt as string | null,
    receivedAt: raw.receivedAt,
    actor: actor.value,
    actorRole: raw.actorRole,
  };
}

function findingOf(raw: unknown): HealthFinding | null {
  if (!isRecord(raw)) return null;
  const codeSystem = nullableRef(raw.codeSystem);
  const code = nullableRef(raw.code);
  const text = raw.text ?? null;
  if (!codeSystem.ok || !code.ok || (codeSystem.value === null) !== (code.value === null)) return null;
  if (text !== null && (typeof text !== "string" || text.length === 0)) return null;
  if (code.value === null && text === null) return null;
  return { codeSystem: codeSystem.value, code: code.value, text: text as string | null };
}

function nullableFinding(raw: unknown): { ok: boolean; value: HealthFinding | null } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  const finding = findingOf(raw);
  return finding ? { ok: true, value: finding } : { ok: false, value: null };
}

/** A diagnosis needs a diagnosing source: a veterinarian via a veterinary source, or a laboratory. */
export function isDiagnosingProvenance(provenance: HealthRecordProvenance): boolean {
  if (provenance.actorRole === "VETERINARIAN") return provenance.sourceCategory === "VETERINARY_SOURCE";
  if (provenance.actorRole === "LABORATORY") return provenance.sourceCategory === "VETERINARY_SOURCE" || provenance.sourceCategory === "OTHER";
  return false;
}

function prescriberWithdrawalOf(raw: unknown): { ok: boolean; value: PrescriberWithdrawal | null } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (!isRecord(raw) || !isOpaqueRef(raw.prescriberRef) || !Array.isArray(raw.periods) || raw.periods.length === 0) return { ok: false, value: null };
  const periods: PrescriberWithdrawalPeriod[] = [];
  for (const p of raw.periods) {
    const period = isRecord(p) ? suppliedQuantityOf(p.period) : null;
    if (!isRecord(p) || !isOpaqueRef(p.foodProduct) || period === null) return { ok: false, value: null };
    periods.push({ foodProduct: p.foodProduct, period });
  }
  if (new Set(periods.map((p) => p.foodProduct)).size !== periods.length) return { ok: false, value: null };
  periods.sort((a, b) => compareStrings(a.foodProduct, b.foodProduct));
  return { ok: true, value: { prescriberRef: raw.prescriberRef, periods } };
}

function administrationDetailOf(raw: Raw): MedicineAdministrationDetail | null {
  const refs = ["productId", "recordedLabel", "batchRef", "route", "site", "administeredByRef", "prescriptionRef", "treatmentRecordId"].map((k) => nullableRef(raw[k]));
  if (refs.some((r) => !r.ok)) return null;
  const [productId, recordedLabel, batchRef, route, site, administeredByRef, prescriptionRef, treatmentRecordId] = refs.map((r) => r.value);
  let recordedAuthorisation: ProductAuthorisationRef | null = null;
  const auth = raw.recordedAuthorisation ?? null;
  if (auth !== null) {
    if (!isRecord(auth) || !isOpaqueRef(auth.scheme) || !isOpaqueRef(auth.number)) return null;
    recordedAuthorisation = { scheme: auth.scheme, number: auth.number };
  }
  const rawDose = raw.dose ?? null;
  const dose = rawDose === null ? null : suppliedQuantityOf(rawDose);
  if (rawDose !== null && dose === null) return null;
  const prescriber = prescriberWithdrawalOf(raw.prescriberWithdrawal);
  if (!prescriber.ok) return null;
  return {
    kind: "MEDICINE_ADMINISTRATION",
    productId,
    recordedAuthorisation,
    recordedLabel,
    batchRef,
    dose,
    route,
    site,
    administeredByRef,
    prescriptionRef,
    treatmentRecordId,
    prescriberWithdrawal: prescriber.value,
  };
}

function detailOf(kind: HealthRecordKind, raw: Raw): HealthRecordDetail | null {
  switch (kind) {
    case "HEALTH_OBSERVATION": {
      const finding = findingOf(raw.finding);
      return finding && oneOf(HEALTH_OBSERVATION_NOTE_KINDS, raw.noteKind) ? { kind, noteKind: raw.noteKind, finding } : null;
    }
    case "SYMPTOM": {
      const finding = findingOf(raw.finding);
      return finding ? { kind, finding } : null;
    }
    case "DIAGNOSIS": {
      const condition = findingOf(raw.condition);
      return condition && isOpaqueRef(raw.diagnosedByRef) ? { kind, condition, diagnosedByRef: raw.diagnosedByRef } : null;
    }
    case "VETERINARY_EVENT": {
      const finding = nullableFinding(raw.finding);
      if (!finding.ok || !oneOf(VETERINARY_EVENT_TYPES, raw.eventType) || !isOpaqueRef(raw.practitionerRef)) return null;
      return { kind, eventType: raw.eventType, practitionerRef: raw.practitionerRef, finding: finding.value };
    }
    case "TREATMENT": {
      const finding = nullableFinding(raw.finding);
      const prescriptionRef = nullableRef(raw.prescriptionRef);
      const practitionerRef = nullableRef(raw.practitionerRef);
      if (!finding.ok || !prescriptionRef.ok || !practitionerRef.ok) return null;
      return { kind, prescriptionRef: prescriptionRef.value, practitionerRef: practitionerRef.value, finding: finding.value };
    }
    case "MEDICINE_ADMINISTRATION":
      return administrationDetailOf(raw);
    case "RETRACTION":
      return { kind };
  }
}

/** Fields each kind may carry beyond the common ones (anything else is malformed). */
const DETAIL_FIELDS: Record<HealthRecordKind, readonly string[]> = {
  HEALTH_OBSERVATION: ["noteKind", "finding"],
  SYMPTOM: ["finding"],
  DIAGNOSIS: ["condition", "diagnosedByRef"],
  VETERINARY_EVENT: ["eventType", "practitionerRef", "finding"],
  TREATMENT: ["prescriptionRef", "practitionerRef", "finding"],
  MEDICINE_ADMINISTRATION: [
    "productId",
    "recordedAuthorisation",
    "recordedLabel",
    "batchRef",
    "dose",
    "route",
    "site",
    "administeredByRef",
    "prescriptionRef",
    "treatmentRecordId",
    "prescriberWithdrawal",
  ],
  RETRACTION: [],
};
const COMMON_FIELDS = ["recordId", "animalId", "kind", "occurredAt", "provenance", "sourceDocument", "supersedes"];

export type HealthRecordMaterialisation = { ok: true; record: HealthRecord } | { ok: false; recordId: string | null; issues: HealthRecordIssueCode[] };

/** The readable record id of a canonical raw record, or `null`. */
export function healthRecordIdOf(raw: unknown): string | null {
  return isRecord(raw) && isOpaqueRef(raw.recordId) ? raw.recordId : null;
}

/**
 * Validates one canonical raw record for `animalId` and rebuilds it from known
 * fields. Malformed content is reported, never repaired or coerced; an unknown
 * field is malformed (a value must never be silently dropped).
 */
export function materialiseHealthRecord(animalId: FarmReturnAnimalId, raw: unknown): HealthRecordMaterialisation {
  if (!isRecord(raw)) return { ok: false, recordId: null, issues: ["CATTLE_HEALTH_RECORD_NOT_OBJECT"] };
  const recordId = healthRecordIdOf(raw);
  const issues: HealthRecordIssueCode[] = [];
  if (recordId === null) issues.push("CATTLE_HEALTH_RECORD_INVALID_ID");
  if (raw.animalId !== animalId) issues.push("CATTLE_HEALTH_RECORD_FOR_OTHER_ANIMAL");
  const kind = oneOf(HEALTH_RECORD_KINDS, raw.kind) ? raw.kind : null;
  if (kind === null) issues.push("CATTLE_HEALTH_RECORD_INVALID_KIND");
  const occurredAt = raw.occurredAt ?? null;
  if (occurredAt !== null && !isValidAnimalInstant(occurredAt)) issues.push("CATTLE_HEALTH_RECORD_INVALID_OCCURRED_AT");
  if (kind === "RETRACTION" && occurredAt !== null) issues.push("CATTLE_HEALTH_RECORD_INVALID_OCCURRED_AT");
  const provenance = provenanceOf(raw.provenance);
  if (provenance === null) issues.push("CATTLE_HEALTH_RECORD_INVALID_PROVENANCE");
  const rawSource = raw.sourceDocument ?? null;
  const sourceDocument = rawSource === null ? null : sourceVersionRefOf(rawSource);
  if (rawSource !== null && sourceDocument === null) issues.push("CATTLE_HEALTH_RECORD_INVALID_SOURCE_DOCUMENT");
  const rawSupersedes = raw.supersedes ?? [];
  let supersedes: string[] = [];
  if (!Array.isArray(rawSupersedes) || !rawSupersedes.every(isOpaqueRef) || new Set(rawSupersedes).size !== rawSupersedes.length) {
    issues.push("CATTLE_HEALTH_RECORD_INVALID_SUPERSEDES");
  } else {
    supersedes = [...(rawSupersedes as string[])].sort(compareStrings);
    if (recordId !== null && supersedes.includes(recordId)) issues.push("CATTLE_HEALTH_RECORD_SELF_SUPERSESSION");
    if (kind === "RETRACTION" && supersedes.length === 0) issues.push("CATTLE_HEALTH_RETRACTION_WITHOUT_TARGET");
  }
  let detail: HealthRecordDetail | null = null;
  if (kind !== null) {
    const allowed = new Set([...COMMON_FIELDS, ...DETAIL_FIELDS[kind]]);
    detail = Object.keys(raw).every((k) => allowed.has(k)) ? detailOf(kind, raw) : null;
    if (detail === null) issues.push("CATTLE_HEALTH_RECORD_INVALID_DETAIL");
  }
  if (kind === "DIAGNOSIS" && provenance !== null && !isDiagnosingProvenance(provenance)) issues.push("CATTLE_HEALTH_DIAGNOSIS_SOURCE_NOT_DIAGNOSTIC");
  if (issues.length > 0 || recordId === null || provenance === null || detail === null) return { ok: false, recordId, issues };
  return {
    ok: true,
    record: { recordId, animalId, occurredAt: occurredAt as string | null, provenance, sourceDocument, supersedes, ...detail } as HealthRecord,
  };
}

// ---------------------------------------------------------------------------
// Semantic keys
// ---------------------------------------------------------------------------

const instantKey = (v: string | null) => (v === null ? null : animalInstantKey(v));

/** The record with every instant replaced by its canonical key (semantic form). */
export function semanticHealthRecord(r: HealthRecord): unknown {
  return {
    ...r,
    occurredAt: instantKey(r.occurredAt),
    provenance: { ...r.provenance, receivedAt: animalInstantKey(r.provenance.receivedAt), observedAt: instantKey(r.provenance.observedAt) },
  };
}

/** Every field; instants compared by instant, not spelling. */
export function healthRecordContentKey(r: HealthRecord): string {
  return canonicalizeValue(semanticHealthRecord(r));
}

/** What competing corrections must agree on: the claim (provenance, source document and links excluded, as in C1/C2). */
export function healthRecordClaimKey(r: HealthRecord): string {
  const { recordId, animalId, provenance, sourceDocument, supersedes, ...claim } = r;
  void recordId;
  void animalId;
  void provenance;
  void sourceDocument;
  void supersedes;
  return canonicalizeValue({ ...claim, occurredAt: instantKey(r.occurredAt) });
}

/**
 * Supersession scope: a correction replaces a record of its own kind (so a
 * symptom can never be corrected into a diagnosis); a RETRACTION may retract
 * any non-retraction record. Same animal is guaranteed by materialisation.
 */
export function healthLinkAllowed(source: HealthRecord, target: HealthRecord): boolean {
  if (target.kind === "RETRACTION") return false;
  return source.kind === "RETRACTION" || source.kind === target.kind;
}
