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
