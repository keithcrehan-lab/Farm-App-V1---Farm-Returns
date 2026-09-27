/**
 * Campaign B schema and persistence — the persisted evidence records
 * behind two facts `slurry-regulatory-context.ts` already reasons about:
 *
 * - a store's REGULATORY neat cattle slurry volume
 *   (`slurry_store_neat_evidence_records`); and
 * - a field's defensible SPREADABLE area (`field_spreadable_area_records`),
 *
 * see `supabase/migrations/20260927000000_regulatory_neat_slurry_and_spreadable_area_evidence.sql`.
 *
 * Storage discipline is `slurry-composition.ts`'s: append-only, a
 * correction is a new record, the current record is derived on read and
 * every earlier record stays retrievable. A missing record is "not
 * established" — never zero, never the physical volume, never the gross
 * field area. An explicit 0 is a real, known zero.
 *
 * Three store facts stay independent: physical volume (capacity × fill,
 * `slurryStoreEvidence`), regulatory neat volume (this file) and
 * agronomic composition (`slurry-composition.ts`). Two field facts stay
 * independent: gross area (`Field.areaHa`) and spreadable area (this file).
 *
 * `status` reuses `DataStatus`. No engine estimates either fact, so a
 * persisted record is only ever `farmer_adjusted` or `verified`;
 * neat-slurry evidence may also be recorded as `unavailable` (no volume).
 * The current record is the latest `effectiveDate`, then the latest
 * `recordedAt` — both facts describe a present state, so an old verified
 * figure is not preferred over a newer declaration. The current record's
 * own status is carried through unchanged, so a reload never upgrades trust.
 */
import type { DataStatus, Field } from "./types";
import type { EvidenceFact } from "./slurry-evidence-context";
import type { RegulatoryNeatSlurryEvidence } from "./slurry-regulatory-context";

export const REGULATORY_EVIDENCE_RECORDS_VERSION = "regulatory_evidence_records_v1.0.0";

// ---------------------------------------------------------------------------
// Shared validation
// ---------------------------------------------------------------------------

function isValidCalendarDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export interface EvidenceRecordValidationError {
  field: "housingId" | "fieldId" | "status" | "neatVolumeM3" | "spreadableAreaHa" | "effectiveDate" | "source";
  message: string;
}

function validateCommon(input: { effectiveDate: string; source: string }, today: string, errors: EvidenceRecordValidationError[]): void {
  if (!input.effectiveDate || !isValidCalendarDateString(input.effectiveDate)) {
    errors.push({ field: "effectiveDate", message: "Enter a valid date" });
  } else if (input.effectiveDate > today) {
    errors.push({ field: "effectiveDate", message: "The date cannot be in the future" });
  }
  if (typeof input.source !== "string" || input.source.trim().length === 0) {
    errors.push({ field: "source", message: "Enter where this figure came from" });
  }
}

function isLaterRecord(a: { effectiveDate: string; recordedAt: string }, b: { effectiveDate: string; recordedAt: string }): boolean {
  if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate > b.effectiveDate;
  return a.recordedAt > b.recordedAt;
}

function currentBy<R extends { effectiveDate: string; recordedAt: string }>(records: readonly R[], key: (r: R) => string): Map<string, R> {
  const out = new Map<string, R>();
  for (const r of records) {
    const existing = out.get(key(r));
    if (!existing || isLaterRecord(r, existing)) out.set(key(r), r);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Regulatory neat-slurry evidence
// ---------------------------------------------------------------------------

export const NEAT_SLURRY_EVIDENCE_STATUSES = ["farmer_adjusted", "verified", "unavailable"] as const;
export type NeatSlurryEvidenceStatus = Extract<DataStatus, (typeof NEAT_SLURRY_EVIDENCE_STATUSES)[number]>;

export interface NeatSlurryEvidenceRecord {
  id: string;
  farmId: string;
  housingId: string;
  status: NeatSlurryEvidenceStatus;
  /** Present (0 included) for known evidence; absent when `unavailable`. */
  neatVolumeM3?: number;
  /** ISO date the figure is true as of. */
  effectiveDate: string;
  source: string;
  note?: string;
  /** ISO datetime Farm Return captured the record (`created_at`). */
  recordedAt: string;
}

export interface NewNeatSlurryEvidenceInput {
  housingId: string;
  status: NeatSlurryEvidenceStatus;
  neatVolumeM3?: number;
  effectiveDate: string;
  source: string;
  note?: string;
}

export function validateNewNeatSlurryEvidenceInput(input: NewNeatSlurryEvidenceInput, today: string): EvidenceRecordValidationError[] {
  const errors: EvidenceRecordValidationError[] = [];
  if (!input.housingId) errors.push({ field: "housingId", message: "Choose which store this figure belongs to" });
  if (!(NEAT_SLURRY_EVIDENCE_STATUSES as readonly string[]).includes(input.status)) {
    errors.push({ field: "status", message: "Choose whether this figure is your own, verified or unavailable" });
  } else if (input.status === "unavailable") {
    if (input.neatVolumeM3 !== undefined) errors.push({ field: "neatVolumeM3", message: "An unavailable figure has no volume" });
  } else if (!isNonNegativeFinite(input.neatVolumeM3)) {
    errors.push({ field: "neatVolumeM3", message: "Enter zero or a positive volume" });
  }
  validateCommon(input, today, errors);
  return errors;
}

export function currentNeatSlurryEvidenceByHousing(records: readonly NeatSlurryEvidenceRecord[]): Map<string, NeatSlurryEvidenceRecord> {
  return currentBy(records, (r) => r.housingId);
}

/** The persisted record in the shape `resolveRegulatoryNeatSlurryVolume`
 * reads — status, source, effective date and record id kept as held. */
export function regulatoryNeatSlurryEvidenceFromRecord(record: NeatSlurryEvidenceRecord): RegulatoryNeatSlurryEvidence {
  const ref = { source: record.source, recordedAt: record.effectiveDate, recordId: record.id };
  if (record.status === "unavailable") return { status: "unavailable", ...ref };
  // A known-status record without a volume is malformed: NaN resolves to
  // REGULATORY_NEAT_SLURRY_EVIDENCE_INVALID, never to a known zero.
  return { status: record.status, volumeM3: record.neatVolumeM3 ?? Number.NaN, ...ref };
}

/** `buildSlurryRegulatoryContext`'s `regulatoryNeatSlurryByHousing` from
 * every persisted record. A store with no record is absent (not established). */
export function regulatoryNeatSlurryEvidenceByHousing(records: readonly NeatSlurryEvidenceRecord[]): Map<string, RegulatoryNeatSlurryEvidence> {
  return new Map([...currentNeatSlurryEvidenceByHousing(records)].map(([id, r]) => [id, regulatoryNeatSlurryEvidenceFromRecord(r)]));
}

// ---------------------------------------------------------------------------
// Spreadable-area evidence
// ---------------------------------------------------------------------------

export const SPREADABLE_AREA_STATUSES = ["farmer_adjusted", "verified"] as const;
export type SpreadableAreaStatus = Extract<DataStatus, (typeof SPREADABLE_AREA_STATUSES)[number]>;

export interface SpreadableAreaRecord {
  id: string;
  farmId: string;
  fieldId: string;
  status: SpreadableAreaStatus;
  spreadableAreaHa: number;
  /** The field's gross area when this was recorded (database-stamped);
   * absent when gross area was not known then. Never updated. */
  grossAreaHaAtRecord?: number;
  effectiveDate: string;
  source: string;
  note?: string;
  recordedAt: string;
}

export interface NewSpreadableAreaInput {
  fieldId: string;
  status: SpreadableAreaStatus;
  spreadableAreaHa: number;
  effectiveDate: string;
  source: string;
  note?: string;
}

/** A field's gross area, when known — the same rule as
 * `fieldSpreadableAreaEvidence`'s `grossMappedAreaHa` (finite and > 0). */
export function knownGrossFieldAreaHa(field: Pick<Field, "areaHa">): number | undefined {
  return Number.isFinite(field.areaHa) && field.areaHa > 0 ? field.areaHa : undefined;
}

export function validateNewSpreadableAreaInput(
  input: NewSpreadableAreaInput,
  field: Pick<Field, "areaHa">,
  today: string,
): EvidenceRecordValidationError[] {
  const errors: EvidenceRecordValidationError[] = [];
  if (!input.fieldId) errors.push({ field: "fieldId", message: "Choose which field this area belongs to" });
  if (!(SPREADABLE_AREA_STATUSES as readonly string[]).includes(input.status)) {
    errors.push({ field: "status", message: "Choose whether this figure is your own or verified" });
  }
  const gross = knownGrossFieldAreaHa(field);
  if (!isNonNegativeFinite(input.spreadableAreaHa)) {
    errors.push({ field: "spreadableAreaHa", message: "Enter zero or a positive area" });
  } else if (gross !== undefined && input.spreadableAreaHa > gross) {
    errors.push({ field: "spreadableAreaHa", message: "The spreadable area cannot be more than the field's area" });
  }
  validateCommon(input, today, errors);
  return errors;
}

export function currentSpreadableAreaByField(records: readonly SpreadableAreaRecord[]): Map<string, SpreadableAreaRecord> {
  return currentBy(records, (r) => r.fieldId);
}

/**
 * A field's spreadable area against its CURRENT gross area. The record is
 * never rewritten or clamped: if the gross area has since become smaller
 * than the recorded spreadable area, both are kept as a conflict.
 */
export function resolveSpreadableAreaHa(grossMappedAreaHa: EvidenceFact<number>, record: SpreadableAreaRecord | undefined): EvidenceFact<number> {
  if (record === undefined) return { state: "missing", reasonCode: "SPREADABLE_AREA_NOT_ESTABLISHED" };
  if (!isNonNegativeFinite(record.spreadableAreaHa)) return { state: "missing", reasonCode: "SPREADABLE_AREA_EVIDENCE_INVALID" };
  const ref = { status: record.status, source: record.source, recordedAt: record.effectiveDate, recordId: record.id };
  if (grossMappedAreaHa.state === "known" && record.spreadableAreaHa > grossMappedAreaHa.value) {
    return {
      state: "conflicting",
      reasonCode: "SPREADABLE_AREA_EXCEEDS_GROSS_AREA",
      candidates: [
        { value: record.spreadableAreaHa, ...ref },
        {
          value: grossMappedAreaHa.value,
          status: grossMappedAreaHa.status,
          source: grossMappedAreaHa.source,
          ...(grossMappedAreaHa.recordedAt !== undefined ? { recordedAt: grossMappedAreaHa.recordedAt } : {}),
        },
      ],
    };
  }
  return { state: "known", value: record.spreadableAreaHa, ...ref, freshness: "NO_FRESHNESS_POLICY" };
}
