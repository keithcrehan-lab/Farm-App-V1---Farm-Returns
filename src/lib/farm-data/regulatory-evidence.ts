import "server-only";

/**
 * Campaign B schema and persistence — `slurry_store_neat_evidence_records`
 * and `field_spreadable_area_records` queries/mutations
 * (`supabase/migrations/20260927000000_regulatory_neat_slurry_and_spreadable_area_evidence.sql`).
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
  rowToSpreadableAreaRecord,
  spreadableAreaInsertRow,
} from "./mappers";
import type { FieldSpreadableAreaRow, SlurryStoreNeatEvidenceRow } from "./row-types";
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
  /** False when either evidence table does not exist on this project (the
   * migration is not applied): no record can exist, so every store and
   * field stays not established — never a known value. Any other read
   * error is thrown, never read as "no records". */
  evidenceTablesApplied: boolean;
}

/**
 * Campaign B live evidence wiring — every persisted neat-slurry and
 * spreadable-area record of the farm, mapped, for
 * `buildSlurryRegulatoryContextFromRecords`. Raw records only: the current
 * record is selected by the domain, never here.
 */
export async function loadRegulatoryEvidenceRecordsForFarm(farmId: string): Promise<RegulatoryEvidenceRecordsForFarm> {
  const supabase = await createClient();
  const [neat, area] = await Promise.all([
    supabase.from("slurry_store_neat_evidence_records").select("*").eq("farm_id", farmId),
    supabase.from("field_spreadable_area_records").select("*").eq("farm_id", farmId),
  ]);
  const notApplied = (error: { code?: string } | null) => error !== null && TABLE_NOT_APPLIED_CODES.has(error.code ?? "");
  if (neat.error && !notApplied(neat.error)) throw neat.error;
  if (area.error && !notApplied(area.error)) throw area.error;
  return {
    neatSlurryEvidenceRecords: neat.error ? [] : ((neat.data ?? []) as SlurryStoreNeatEvidenceRow[]).map(rowToNeatSlurryEvidenceRecord),
    spreadableAreaRecords: area.error ? [] : ((area.data ?? []) as FieldSpreadableAreaRow[]).map(rowToSpreadableAreaRecord),
    evidenceTablesApplied: !neat.error && !area.error,
  };
}

/** The farm's canonical `SlurryRegulatoryContext` from data the caller has
 * already loaded plus the farm's persisted Campaign B records. */
export async function loadSlurryRegulatoryContextForFarm(
  farmId: string,
  base: Omit<BuildSlurryRegulatoryContextFromRecordsInput, "neatSlurryEvidenceRecords" | "spreadableAreaRecords">,
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
