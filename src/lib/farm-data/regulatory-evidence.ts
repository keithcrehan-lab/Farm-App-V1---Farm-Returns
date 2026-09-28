import "server-only";

/**
 * Campaign B schema and persistence — `slurry_store_neat_evidence_records`,
 * `field_spreadable_area_records`
 * (`supabase/migrations/20260927000000_regulatory_neat_slurry_and_spreadable_area_evidence.sql`)
 * and `slurry_allocation_origin_evidence_records`
 * (`20260928000000_slurry_allocation_origin_evidence.sql`) queries/mutations.
 * Insert/select only, matching the migration's grants: a correction is a
 * new record (`src/domain/regulatory-evidence-records.ts`). Both writes
 * validate before reaching the database; the migration's checks, RLS and
 * gross-area trigger are the backstop.
 */
import { createClient } from "@/lib/supabase/server";
import {
  validateNewNeatSlurryEvidenceInput,
  validateNewSpreadableAreaInput,
  type EvidenceRecordValidationError,
  type NeatSlurryEvidenceRecord,
  type NewNeatSlurryEvidenceInput,
  type NewSpreadableAreaInput,
  type SpreadableAreaRecord,
} from "@/domain/regulatory-evidence-records";
import {
  neatSlurryEvidenceInsertRow,
  rowToNeatSlurryEvidenceRecord,
  rowToSlurryOriginEvidenceRecord,
  rowToSpreadableAreaRecord,
  slurryOriginEvidenceInsertRow,
  spreadableAreaInsertRow,
} from "./mappers";
import type { FieldSpreadableAreaRow, SlurryAllocationOriginEvidenceRow, SlurryStoreNeatEvidenceRow } from "./row-types";
import {
  validateNewSlurryOriginEvidenceInput,
  type NewSlurryOriginEvidenceInput,
  type SlurryOriginEvidenceRecord,
  type SlurryOriginEvidenceRejection,
} from "@/domain/slurry-origin-evidence";
import {
  buildSlurryRegulatoryContextFromRecords,
  type BuildSlurryRegulatoryContextFromRecordsInput,
  type SlurryRegulatoryContext,
} from "@/domain/slurry-regulatory-context";

export class EvidenceRecordRejectedError extends Error {
  constructor(readonly errors: EvidenceRecordValidationError[]) {
    super(`Evidence record rejected: ${errors.map((e) => `${e.field}: ${e.message}`).join("; ")}`);
  }
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listNeatSlurryEvidenceRecordsForFarm(farmId: string): Promise<NeatSlurryEvidenceRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("slurry_store_neat_evidence_records").select("*").eq("farm_id", farmId);
  if (error) throw error;
  return (data as SlurryStoreNeatEvidenceRow[]).map(rowToNeatSlurryEvidenceRecord);
}

/** Postgres `undefined_table` and PostgREST's "table not in schema cache":
 * the evidence migration is not applied on this project. */
const TABLE_NOT_APPLIED_CODES: ReadonlySet<string> = new Set(["42P01", "PGRST205"]);

export interface RegulatoryEvidenceRecordsForFarm {
  neatSlurryEvidenceRecords: NeatSlurryEvidenceRecord[];
  spreadableAreaRecords: SpreadableAreaRecord[];
  slurryOriginEvidenceRecords: SlurryOriginEvidenceRecord[];
  /** False when any evidence table does not exist on this project (its
   * migration is not applied): no record can exist, so every store, field
   * and plan stays not established — never a known value. Any other read
   * error is thrown, never read as "no records". */
  evidenceTablesApplied: boolean;
}

const EVIDENCE_PAGE_SIZE = 1000;

/**
 * Every row of a farm's evidence table. PostgREST caps each response
 * (`max-rows`), and a truncated history could restore a superseded known
 * value, so rows are paged in `id` order until an empty page — advancing
 * by the rows actually returned, so a server cap below the page size never
 * skips rows. Tables are insert-only; a row repeated by a concurrent insert
 * shifting the offset is de-duplicated by id.
 */
async function selectAllEvidenceRows<Row extends { id: string }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "slurry_store_neat_evidence_records" | "field_spreadable_area_records" | "slurry_allocation_origin_evidence_records",
  farmId: string,
): Promise<{ data: Row[] | null; error: { code?: string } | null }> {
  const byId = new Map<string, Row>();
  for (let offset = 0; ; ) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("farm_id", farmId)
      .order("id", { ascending: true })
      .range(offset, offset + EVIDENCE_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return { data: [...byId.values()], error: null };
    for (const row of rows) byId.set(row.id, row);
    offset += rows.length;
  }
}

/**
 * Campaign B live evidence wiring — every persisted neat-slurry,
 * spreadable-area and slurry-origin record of the farm, mapped, for
 * `buildSlurryRegulatoryContextFromRecords`. Raw records only: the current
 * record is selected by the domain, never here.
 */
export async function loadRegulatoryEvidenceRecordsForFarm(farmId: string): Promise<RegulatoryEvidenceRecordsForFarm> {
  const supabase = await createClient();
  const [neat, area, origin] = await Promise.all([
    selectAllEvidenceRows<SlurryStoreNeatEvidenceRow>(supabase, "slurry_store_neat_evidence_records", farmId),
    selectAllEvidenceRows<FieldSpreadableAreaRow>(supabase, "field_spreadable_area_records", farmId),
    selectAllEvidenceRows<SlurryAllocationOriginEvidenceRow>(supabase, "slurry_allocation_origin_evidence_records", farmId),
  ]);
  const notApplied = (error: { code?: string } | null) => error !== null && TABLE_NOT_APPLIED_CODES.has(error.code ?? "");
  if (neat.error && !notApplied(neat.error)) throw neat.error;
  if (area.error && !notApplied(area.error)) throw area.error;
  if (origin.error && !notApplied(origin.error)) throw origin.error;
  return {
    neatSlurryEvidenceRecords: neat.error ? [] : ((neat.data ?? []) as SlurryStoreNeatEvidenceRow[]).map(rowToNeatSlurryEvidenceRecord),
    spreadableAreaRecords: area.error ? [] : ((area.data ?? []) as FieldSpreadableAreaRow[]).map(rowToSpreadableAreaRecord),
    slurryOriginEvidenceRecords: origin.error ? [] : ((origin.data ?? []) as SlurryAllocationOriginEvidenceRow[]).map(rowToSlurryOriginEvidenceRecord),
    evidenceTablesApplied: !neat.error && !area.error && !origin.error,
  };
}

/** Every persisted slurry-origin declaration of the farm, for the slurry
 * plan's refresh (re-read with its allocations so a correction made
 * elsewhere replaces the cached history). Same read convention as
 * `loadRegulatoryEvidenceRecordsForFarm`: table not applied = no records;
 * any other read error is thrown. */
export async function listSlurryOriginEvidenceRecordsForFarm(farmId: string): Promise<SlurryOriginEvidenceRecord[]> {
  const supabase = await createClient();
  const origin = await selectAllEvidenceRows<SlurryAllocationOriginEvidenceRow>(supabase, "slurry_allocation_origin_evidence_records", farmId);
  if (origin.error) {
    if (TABLE_NOT_APPLIED_CODES.has(origin.error.code ?? "")) return [];
    throw origin.error;
  }
  return (origin.data ?? []).map(rowToSlurryOriginEvidenceRecord);
}

/** The farm's canonical `SlurryRegulatoryContext` from data the caller has
 * already loaded plus the farm's persisted Campaign B records. */
export async function loadSlurryRegulatoryContextForFarm(
  farmId: string,
  base: Omit<BuildSlurryRegulatoryContextFromRecordsInput, "neatSlurryEvidenceRecords" | "spreadableAreaRecords" | "slurryOriginEvidenceRecords">,
): Promise<{ context: SlurryRegulatoryContext; evidenceTablesApplied: boolean }> {
  const { evidenceTablesApplied, ...records } = await loadRegulatoryEvidenceRecordsForFarm(farmId);
  return { context: buildSlurryRegulatoryContextFromRecords({ ...base, ...records }), evidenceTablesApplied };
}

export async function createNeatSlurryEvidenceRecord(farmId: string, input: NewNeatSlurryEvidenceInput): Promise<NeatSlurryEvidenceRecord> {
  const errors = validateNewNeatSlurryEvidenceInput(input, todayIsoDate());
  if (errors.length > 0) throw new EvidenceRecordRejectedError(errors);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("slurry_store_neat_evidence_records")
    .insert(neatSlurryEvidenceInsertRow(farmId, input, user?.id ?? null))
    .select("*")
    .single();
  if (error) throw error;
  return rowToNeatSlurryEvidenceRecord(data as SlurryStoreNeatEvidenceRow);
}

export async function listSpreadableAreaRecordsForFarm(farmId: string): Promise<SpreadableAreaRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("field_spreadable_area_records").select("*").eq("farm_id", farmId);
  if (error) throw error;
  return (data as FieldSpreadableAreaRow[]).map(rowToSpreadableAreaRecord);
}

export async function createSpreadableAreaRecord(farmId: string, input: NewSpreadableAreaInput): Promise<SpreadableAreaRecord> {
  const supabase = await createClient();
  // The field's gross area is read here, farm-scoped, never taken from
  // the caller.
  const { data: field, error: fieldError } = await supabase
    .from("fields")
    .select("area_ha")
    .eq("id", input.fieldId)
    .eq("farm_id", farmId)
    .maybeSingle();
  if (fieldError) throw fieldError;
  if (!field) throw new EvidenceRecordRejectedError([{ field: "fieldId", message: "Field not found on this farm" }]);
  const errors = validateNewSpreadableAreaInput(input, { areaHa: (field as { area_ha: number }).area_ha }, todayIsoDate());
  if (errors.length > 0) throw new EvidenceRecordRejectedError(errors);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("field_spreadable_area_records")
    .insert(spreadableAreaInsertRow(farmId, input, user?.id ?? null))
    .select("*")
    .single();
  if (error) throw error;
  return rowToSpreadableAreaRecord(data as FieldSpreadableAreaRow);
}

/** A declaration the database (or validation) refused, with plain issue
 * codes the UI turns into farmer-facing copy. */
export class SlurryOriginEvidenceRejectedError extends Error {
  constructor(readonly issues: SlurryOriginEvidenceRejection[]) {
    super(`Slurry origin evidence rejected: ${issues.join(", ")}`);
  }
}

const ORIGIN_REJECTION = /slurry_origin_evidence_rejected:(ALLOCATION_NOT_FOUND|NOT_PLANNED|PLAN_CHANGED)/;

/**
 * Appends one slurry-origin declaration for a planned spreading. The
 * database stamps the plan snapshot and capture provenance and refuses the
 * record if the plan is no longer planned or has changed since the farmer
 * saw it. An unapplied migration is reported as not available — never a
 * silent success. Any other error is thrown.
 */
export async function createSlurryOriginEvidenceRecord(farmId: string, input: NewSlurryOriginEvidenceInput): Promise<SlurryOriginEvidenceRecord> {
  const issues = validateNewSlurryOriginEvidenceInput(input);
  if (issues.length > 0) throw new SlurryOriginEvidenceRejectedError(issues);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("slurry_allocation_origin_evidence_records")
    .insert(slurryOriginEvidenceInsertRow(farmId, input))
    .select("*")
    .single();
  if (error) {
    const e = error as { code?: string; message?: string };
    if (TABLE_NOT_APPLIED_CODES.has(e.code ?? "")) throw new SlurryOriginEvidenceRejectedError(["NOT_AVAILABLE"]);
    const match = ORIGIN_REJECTION.exec(e.message ?? "");
    if (match) throw new SlurryOriginEvidenceRejectedError([match[1] as "ALLOCATION_NOT_FOUND" | "NOT_PLANNED" | "PLAN_CHANGED"]);
    throw error;
  }
  return rowToSlurryOriginEvidenceRecord(data as SlurryAllocationOriginEvidenceRow);
}
