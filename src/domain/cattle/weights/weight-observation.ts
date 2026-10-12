/**
 * Cattle C4 — the canonical bovine weight observation record.
 *
 * Weight is an OBSERVATION over time, never a mutable animal property. This
 * record is the cattle-canonical type and is distinct from the legacy
 * `src/domain/types.ts` `WeightObservation` (not modified, not re-used).
 *
 * - Identity: `recordId` (opaque, unique within the observation log); the
 *   animal is a C1 `FarmReturnAnimalId`.
 * - Valid time: `observedAt` (strict UTC instant, required). Knowledge time:
 *   `provenance.receivedAt` (C1 `AnimalDataProvenance` contract, re-validated
 *   here because C1's materialiser is module-private — C2/C3 precedent).
 *   `provenance.observedAt` is the source's own recorded time, preserved and
 *   never used as valid time.
 * - Weight: `{value, unit}` exactly as recorded (CAT-INV-011). The value is a
 *   finite, strictly positive JavaScript number; the unit comes from the closed
 *   `WEIGHT_UNITS` enumeration. The canonical kilogram value is derived only
 *   through `WEIGHT_UNIT_CONVERSIONS`: `KILOGRAM` is the identity (no
 *   arithmetic, so no rounding); `POUND` is a recognised unit with NO
 *   conversion in this campaign, so its canonical value is UNSUPPORTED. Any
 *   other unit, a missing unit or a non-positive / non-finite / non-numeric
 *   value is rejected (fail closed), never coerced.
 * - Collection method: closed `WEIGHT_COLLECTION_METHODS`, preserved exactly;
 *   an estimate is never relabelled as a measurement, and a correction may
 *   not change the method (`weightLinkAllowed`).
 * - Device, quality and conditions are kept exactly as supplied (`null` when
 *   not supplied); no confidence is ever invented.
 * - Append-only: `supersedes` names earlier record ids of the same animal and
 *   method; nothing is deleted or rewritten.
 */

import { canonicalizeValue } from "../../assessment-integrity";
import {
  ANIMAL_DATA_SOURCE_CATEGORIES,
  animalInstantKey,
  isOpaqueRef,
  isValidAnimalInstant,
  toFarmReturnAnimalId,
  type AnimalDataProvenance,
  type AnimalDataSourceCategory,
  type FarmReturnAnimalId,
} from "../animal-ledger";
import type { CattleInformationClass } from "../information";
import { compareStrings } from "../integrity";
import { hasOnlyFields, isRecord, nullableRef, oneOf } from "../health/health-input";

/** Closed unit enumeration. Only `KILOGRAM` converts (identity). */
export const WEIGHT_UNITS = ["KILOGRAM", "POUND"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

/** The canonical (authoritative) unit for live weight. */
export const CANONICAL_WEIGHT_UNIT = "KILOGRAM" as const;

/**
 * Explicit conversion table to kilograms. `IDENTITY` is the only conversion:
 * the canonical value IS the recorded value. `null` = no exact conversion is
 * documented, so the canonical value is UNSUPPORTED (a real conversion factor
 * needs separately reviewed external evidence).
 */
export const WEIGHT_UNIT_CONVERSIONS: Readonly<Record<WeightUnit, "IDENTITY" | null>> = Object.freeze({
  KILOGRAM: "IDENTITY",
  POUND: null,
});

/** Closed collection-method enumeration, preserved exactly as supplied. */
export const WEIGHT_COLLECTION_METHODS = ["SCALE", "WEIGHBRIDGE", "ESTIMATE_VISUAL", "ESTIMATE_TAPE", "DERIVED_EXTERNAL", "UNKNOWN"] as const;
export type WeightCollectionMethod = (typeof WEIGHT_COLLECTION_METHODS)[number];

/**
 * How the value was obtained, read directly from the method name (no
 * judgement of fitness for any purpose): a scale/weighbridge reading is
 * MEASURED; an `ESTIMATE_*` method is ESTIMATED; `DERIVED_EXTERNAL` is DERIVED;
 * `UNKNOWN` stays UNKNOWN.
 */
export type WeightMeasurementBasis = "MEASURED" | "ESTIMATED" | "DERIVED" | "UNKNOWN";

const BASIS: Readonly<Record<WeightCollectionMethod, WeightMeasurementBasis>> = Object.freeze({
  SCALE: "MEASURED",
  WEIGHBRIDGE: "MEASURED",
  ESTIMATE_VISUAL: "ESTIMATED",
  ESTIMATE_TAPE: "ESTIMATED",
  DERIVED_EXTERNAL: "DERIVED",
  UNKNOWN: "UNKNOWN",
});

export function weightMeasurementBasis(method: WeightCollectionMethod): WeightMeasurementBasis {
  return BASIS[method];
}

/** A derived external value is a DERIVED_VALUE; every other method an OBSERVATION. */
export function weightInformationClass(method: WeightCollectionMethod): CattleInformationClass {
  return method === "DERIVED_EXTERNAL" ? "DERIVED_VALUE" : "OBSERVATION";
}

export interface RecordedWeight {
  /** Finite, strictly positive, exactly as recorded. */
  value: number;
  unit: WeightUnit;
}

/** Supplied evidence quality/confidence, verbatim (opaque scheme + value). */
export interface SuppliedWeightQuality {
  scheme: string;
  value: string | number;
}

export interface CattleWeightObservation {
  recordId: string;
  animalId: FarmReturnAnimalId;
  /** VALID time: when the animal was weighed/estimated (strict UTC). */
  observedAt: string;
  weight: RecordedWeight;
  method: WeightCollectionMethod;
  /** Opaque device / scale identifier, if supplied. */
  deviceRef: string | null;
  quality: SuppliedWeightQuality | null;
  /** Fasted / conditions note, verbatim, if supplied. */
  conditionsNote: string | null;
  provenance: AnimalDataProvenance;
  /** Earlier record ids this record corrects (sorted, unique). */
  supersedes: string[];
}

/** The canonical kilogram value, or UNSUPPORTED when no exact conversion exists. */
export type CanonicalWeight =
  | { state: "CONVERTED"; kg: number; conversion: "IDENTITY" }
  | { state: "UNSUPPORTED"; kg: null; conversion: null };

export function canonicalWeightOf(weight: RecordedWeight): CanonicalWeight {
  return WEIGHT_UNIT_CONVERSIONS[weight.unit] === "IDENTITY"
    ? { state: "CONVERTED", kg: weight.value, conversion: "IDENTITY" }
    : { state: "UNSUPPORTED", kg: null, conversion: null };
}

export type WeightRecordIssueCode =
  | "CATTLE_WEIGHT_RECORD_NOT_OBJECT"
  | "CATTLE_WEIGHT_RECORD_UNSUPPORTED_FIELD"
  | "CATTLE_WEIGHT_RECORD_INVALID_ID"
  | "CATTLE_WEIGHT_RECORD_INVALID_ANIMAL_ID"
  | "CATTLE_WEIGHT_RECORD_INVALID_OBSERVED_AT"
  | "CATTLE_WEIGHT_RECORD_INVALID_VALUE"
  | "CATTLE_WEIGHT_RECORD_MISSING_UNIT"
  | "CATTLE_WEIGHT_RECORD_UNKNOWN_UNIT"
  | "CATTLE_WEIGHT_RECORD_INVALID_METHOD"
  | "CATTLE_WEIGHT_RECORD_INVALID_DEVICE"
  | "CATTLE_WEIGHT_RECORD_INVALID_QUALITY"
  | "CATTLE_WEIGHT_RECORD_INVALID_CONDITIONS"
  | "CATTLE_WEIGHT_RECORD_INVALID_PROVENANCE"
  | "CATTLE_WEIGHT_RECORD_INVALID_SUPERSEDES"
  | "CATTLE_WEIGHT_RECORD_SELF_SUPERSESSION";

export type WeightRecordMaterialisation =
  | { ok: true; record: CattleWeightObservation }
  | { ok: false; recordId: string | null; issues: WeightRecordIssueCode[] };

const RECORD_FIELDS = ["recordId", "animalId", "observedAt", "weight", "method", "deviceRef", "quality", "conditionsNote", "provenance", "supersedes"];
const PROVENANCE_FIELDS = ["sourceCategory", "sourceSystem", "sourceRecordRef", "observedAt", "receivedAt", "actor"];

/** The readable record id of a raw weight record, or `null`. */
export function weightRecordIdOf(raw: unknown): string | null {
  return isRecord(raw) && isOpaqueRef(raw.recordId) ? raw.recordId : null;
}

function provenanceOf(raw: unknown): AnimalDataProvenance | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, PROVENANCE_FIELDS)) return null;
  if (!oneOf(ANIMAL_DATA_SOURCE_CATEGORIES, raw.sourceCategory) || !isValidAnimalInstant(raw.receivedAt)) return null;
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
  };
}

function weightOf(raw: unknown, issues: WeightRecordIssueCode[]): RecordedWeight | null {
  if (!isRecord(raw) || !hasOnlyFields(raw, ["value", "unit"])) {
    issues.push("CATTLE_WEIGHT_RECORD_INVALID_VALUE");
    return null;
  }
  const valueOk = typeof raw.value === "number" && Number.isFinite(raw.value) && raw.value > 0;
  if (!valueOk) issues.push("CATTLE_WEIGHT_RECORD_INVALID_VALUE");
  if (raw.unit === undefined || raw.unit === null) issues.push("CATTLE_WEIGHT_RECORD_MISSING_UNIT");
  else if (!oneOf(WEIGHT_UNITS, raw.unit)) issues.push("CATTLE_WEIGHT_RECORD_UNKNOWN_UNIT");
  return valueOk && oneOf(WEIGHT_UNITS, raw.unit) ? { value: raw.value as number, unit: raw.unit } : null;
}

function qualityOf(raw: unknown): { ok: boolean; value: SuppliedWeightQuality | null } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (!isRecord(raw) || !hasOnlyFields(raw, ["scheme", "value"]) || !isOpaqueRef(raw.scheme)) return { ok: false, value: null };
  const v = raw.value;
  const valueOk = (typeof v === "string" && v.length > 0) || (typeof v === "number" && Number.isFinite(v));
  return valueOk ? { ok: true, value: { scheme: raw.scheme, value: v as string | number } } : { ok: false, value: null };
}

/**
 * Validates canonical plain data into a weight observation. Anything
 * malformed is rejected with every applicable issue, never repaired.
 */
export function materialiseWeightObservation(raw: unknown): WeightRecordMaterialisation {
  if (!isRecord(raw)) return { ok: false, recordId: null, issues: ["CATTLE_WEIGHT_RECORD_NOT_OBJECT"] };
  const recordId = weightRecordIdOf(raw);
  const issues: WeightRecordIssueCode[] = [];
  if (!hasOnlyFields(raw, RECORD_FIELDS)) issues.push("CATTLE_WEIGHT_RECORD_UNSUPPORTED_FIELD");
  if (recordId === null) issues.push("CATTLE_WEIGHT_RECORD_INVALID_ID");
  const animalId = typeof raw.animalId === "string" ? toFarmReturnAnimalId(raw.animalId) : null;
  if (animalId === null) issues.push("CATTLE_WEIGHT_RECORD_INVALID_ANIMAL_ID");
  if (!isValidAnimalInstant(raw.observedAt)) issues.push("CATTLE_WEIGHT_RECORD_INVALID_OBSERVED_AT");
  const weight = weightOf(raw.weight, issues);
  if (!oneOf(WEIGHT_COLLECTION_METHODS, raw.method)) issues.push("CATTLE_WEIGHT_RECORD_INVALID_METHOD");
  const device = nullableRef(raw.deviceRef);
  if (!device.ok) issues.push("CATTLE_WEIGHT_RECORD_INVALID_DEVICE");
  const quality = qualityOf(raw.quality);
  if (!quality.ok) issues.push("CATTLE_WEIGHT_RECORD_INVALID_QUALITY");
  const note = raw.conditionsNote ?? null;
  if (note !== null && (typeof note !== "string" || note.length === 0)) issues.push("CATTLE_WEIGHT_RECORD_INVALID_CONDITIONS");
  const provenance = provenanceOf(raw.provenance);
  if (provenance === null) issues.push("CATTLE_WEIGHT_RECORD_INVALID_PROVENANCE");
  const rawSupersedes = raw.supersedes ?? [];
  let supersedes: string[] = [];
  if (!Array.isArray(rawSupersedes) || !rawSupersedes.every(isOpaqueRef) || new Set(rawSupersedes).size !== rawSupersedes.length) {
    issues.push("CATTLE_WEIGHT_RECORD_INVALID_SUPERSEDES");
  } else {
    supersedes = [...(rawSupersedes as string[])].sort(compareStrings);
    if (recordId !== null && supersedes.includes(recordId)) issues.push("CATTLE_WEIGHT_RECORD_SELF_SUPERSESSION");
  }
  if (issues.length > 0 || recordId === null || animalId === null || weight === null || provenance === null) return { ok: false, recordId, issues };
  return {
    ok: true,
    record: {
      recordId,
      animalId,
      observedAt: raw.observedAt as string,
      weight,
      method: raw.method as WeightCollectionMethod,
      deviceRef: device.value,
      quality: quality.value,
      conditionsNote: note as string | null,
      provenance,
      supersedes,
    },
  };
}

const instantKey = (v: string | null) => (v === null ? null : animalInstantKey(v));

/** The record with every instant replaced by its canonical key (semantic form; recorded value/unit kept). */
export function semanticWeightObservation(r: CattleWeightObservation): unknown {
  return {
    ...r,
    observedAt: animalInstantKey(r.observedAt),
    provenance: { ...r.provenance, receivedAt: animalInstantKey(r.provenance.receivedAt), observedAt: instantKey(r.provenance.observedAt) },
  };
}

/** Every field; instants compared by instant, not spelling. */
export function weightObservationContentKey(r: CattleWeightObservation): string {
  return canonicalizeValue(semanticWeightObservation(r));
}

/** What competing corrections must agree on: the claim (provenance and links excluded, as in C1–C3). */
export function weightObservationClaimKey(r: CattleWeightObservation): string {
  return canonicalizeValue({
    animalId: r.animalId,
    observedAt: animalInstantKey(r.observedAt),
    weight: r.weight,
    method: r.method,
    deviceRef: r.deviceRef,
    quality: r.quality,
    conditionsNote: r.conditionsNote,
  });
}

/**
 * Supersession scope: a correction replaces an observation of the SAME animal
 * made by the SAME collection method — an estimate can never be corrected
 * into a scale reading (or vice versa); a differently collected weight is a
 * new observation, not a correction.
 */
export function weightLinkAllowed(source: CattleWeightObservation, target: CattleWeightObservation): boolean {
  return source.animalId === target.animalId && source.method === target.method;
}
