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
 * Records tied on both timestamps are never ordered by input: equivalent
 * ones collapse by record id, contradictory ones become a conflict.
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

type OrderedRecord = { id: string; effectiveDate: string; recordedAt: string };

function compareRecordTime(a: OrderedRecord, b: OrderedRecord): number {
  if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate > b.effectiveDate ? 1 : -1;
  if (a.recordedAt !== b.recordedAt) return a.recordedAt > b.recordedAt ? 1 : -1;
  return 0;
}

/**
 * Several records tied at the latest `effectiveDate` and `recordedAt`
 * that disagree on a material fact. None is chosen — the resolvers turn
 * this into a `conflicting` fact. Ordered by record id, never by input
 * (array or database) order.
 */
export interface TiedEvidenceRecords<R> {
  tied: readonly R[];
}

export type CurrentEvidenceRecord<R> = R | TiedEvidenceRecords<R>;

export function isTiedEvidence<R extends object>(current: CurrentEvidenceRecord<R>): current is TiedEvidenceRecords<R> {
  return "tied" in current;
}

/**
 * The current record per key: latest `effectiveDate`, then latest
 * `recordedAt` (`clock_timestamp()` does not guarantee uniqueness). Tied
 * records that agree on every material fact collapse to the one with the
 * lowest record id — an immutable property, so input order never changes
 * the result. Tied records that disagree are all kept as a tie.
 */
function currentBy<R extends OrderedRecord>(
  records: readonly R[],
  key: (r: R) => string,
  equivalent: (a: R, b: R) => boolean,
): Map<string, CurrentEvidenceRecord<R>> {
  const latest = new Map<string, R[]>();
  for (const r of records) {
    const existing = latest.get(key(r));
    const order = existing ? compareRecordTime(r, existing[0]) : 1;
    if (order > 0) latest.set(key(r), [r]);
    else if (order === 0) existing!.push(r);
  }
  const out = new Map<string, CurrentEvidenceRecord<R>>();
  for (const [k, group] of latest) {
    // A singleton group is not a tie: it keeps single-record semantics and
    // is never compared with itself (an invalid value is not self-equal).
    if (group.length === 1) {
      out.set(k, group[0]);
      continue;
    }
    const byId = [...group].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    out.set(k, byId.every((r) => equivalent(r, byId[0])) ? byId[0] : { tied: byId });
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

/** Status, volume (known zero and "no volume" included) and source are
 * material: a tie differing in any of them is never collapsed, so a more
 * trusted or known record never hides a tied contradictory one. */
function equivalentNeatEvidence(a: NeatSlurryEvidenceRecord, b: NeatSlurryEvidenceRecord): boolean {
  return a.status === b.status && a.neatVolumeM3 === b.neatVolumeM3 && a.source === b.source;
}

export function currentNeatSlurryEvidenceByHousing(
  records: readonly NeatSlurryEvidenceRecord[],
): Map<string, CurrentEvidenceRecord<NeatSlurryEvidenceRecord>> {
  return currentBy(records, (r) => r.housingId, equivalentNeatEvidence);
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
export function regulatoryNeatSlurryEvidenceByHousing(
  records: readonly NeatSlurryEvidenceRecord[],
): Map<string, CurrentEvidenceRecord<RegulatoryNeatSlurryEvidence>> {
  return new Map(
    [...currentNeatSlurryEvidenceByHousing(records)].map(([id, current]) => [
      id,
      isTiedEvidence(current) ? { tied: current.tied.map(regulatoryNeatSlurryEvidenceFromRecord) } : regulatoryNeatSlurryEvidenceFromRecord(current),
    ]),
  );
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

/** Status, area and source are material (see `equivalentNeatEvidence`). */
function equivalentSpreadableArea(a: SpreadableAreaRecord, b: SpreadableAreaRecord): boolean {
  return a.status === b.status && a.spreadableAreaHa === b.spreadableAreaHa && a.source === b.source;
}

export function currentSpreadableAreaByField(records: readonly SpreadableAreaRecord[]): Map<string, CurrentEvidenceRecord<SpreadableAreaRecord>> {
  return currentBy(records, (r) => r.fieldId, equivalentSpreadableArea);
}

/**
 * A field's spreadable area against its CURRENT gross area. The record is
 * never rewritten or clamped: if the gross area has since become smaller
 * than the recorded spreadable area, both are kept as a conflict. Tied
 * contradictory records are a conflict too; only valid areas can be
 * candidates, but an invalid tied record still blocks every other one.
 */
export function resolveSpreadableAreaHa(
  grossMappedAreaHa: EvidenceFact<number>,
  record: CurrentEvidenceRecord<SpreadableAreaRecord> | undefined,
): EvidenceFact<number> {
  if (record === undefined) return { state: "missing", reasonCode: "SPREADABLE_AREA_NOT_ESTABLISHED" };
  if (isTiedEvidence(record)) {
    return {
      state: "conflicting",
      reasonCode: "SPREADABLE_AREA_TIED_OBSERVATIONS_CONFLICT",
      candidates: record.tied
        .filter((r) => isNonNegativeFinite(r.spreadableAreaHa))
        .map((r) => ({ value: r.spreadableAreaHa, status: r.status, source: r.source, recordedAt: r.effectiveDate, recordId: r.id })),
    };
  }
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
