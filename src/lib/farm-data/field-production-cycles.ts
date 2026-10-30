import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  CropSystem,
  FieldProductionCycle,
  FieldProductionCycleEvidence,
  ProductionCycleStatus,
} from "@/domain/fertiliser-field-evidence";

interface FieldProductionCycleRow {
  id: string;
  field_id: string;
  season: string;
  crop_system: CropSystem;
  status: ProductionCycleStatus;
  start_date: string | null;
  end_date: string | null;
  evidence: FieldProductionCycleEvidence;
  created_at: string;
  updated_at: string;
}

function rowToCycle(row: FieldProductionCycleRow): FieldProductionCycle {
  return {
    id: row.id,
    fieldId: row.field_id,
    season: row.season,
    cropSystem: row.crop_system,
    status: row.status,
    ...(row.start_date ? { startDate: row.start_date } : {}),
    ...(row.end_date ? { endDate: row.end_date } : {}),
    evidence: row.evidence ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getFieldProductionCycle(fieldId: string, season: string): Promise<FieldProductionCycle | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("field_production_cycles")
    .select("*")
    .eq("field_id", fieldId)
    .eq("season", season)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToCycle(data as FieldProductionCycleRow) : null;
}

export interface UpsertFieldProductionCycleInput {
  fieldId: string;
  season: string;
  cropSystem: CropSystem;
  status: ProductionCycleStatus;
  startDate?: string;
  endDate?: string;
  evidence: FieldProductionCycleEvidence;
}

export async function upsertFieldProductionCycle(input: UpsertFieldProductionCycleInput): Promise<FieldProductionCycle> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("field_production_cycles")
    .upsert(
      {
        field_id: input.fieldId,
        season: input.season,
        crop_system: input.cropSystem,
        status: input.status,
        start_date: input.startDate ?? null,
        end_date: input.endDate ?? null,
        evidence: input.evidence,
      },
      { onConflict: "field_id,season" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return rowToCycle(data as FieldProductionCycleRow);
}
