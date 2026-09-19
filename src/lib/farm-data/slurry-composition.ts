import "server-only";

/**
 * Slurry Evidence & Composition V1 campaign —
 * `slurry_composition_records` queries/mutations
 * (`supabase/migrations/20260919000000_slurry_composition_records.sql`).
 * Insert/select only — no update/delete function exists here at all,
 * matching the migration's own RLS grants exactly (a farmer/lab
 * correction is a NEW record, never an edit of an old one — see
 * `src/domain/slurry-composition.ts`'s own header).
 */
import { createClient } from "@/lib/supabase/server";
import type { NewSlurryCompositionInput, SlurryComposition, SlurryCompositionStatus, SlurryType } from "@/domain/slurry-composition";

interface SlurryCompositionRecordRow {
  id: string;
  farm_id: string;
  housing_id: string;
  slurry_type: SlurryType;
  status: SlurryCompositionStatus;
  dm_pct: number;
  n_per_m3: number | null;
  p_per_m3: number | null;
  k_per_m3: number | null;
  sample_date: string;
  source: string;
  laboratory: string | null;
  sample_ref: string | null;
  note: string | null;
  created_at: string;
}

function rowToSlurryComposition(row: SlurryCompositionRecordRow): SlurryComposition {
  return {
    id: row.id,
    farmId: row.farm_id,
    housingId: row.housing_id,
    slurryType: row.slurry_type,
    status: row.status,
    dmPct: row.dm_pct,
    ...(row.n_per_m3 !== null ? { nPerM3: row.n_per_m3 } : {}),
    ...(row.p_per_m3 !== null ? { pPerM3: row.p_per_m3 } : {}),
    ...(row.k_per_m3 !== null ? { kPerM3: row.k_per_m3 } : {}),
    sampleDate: row.sample_date,
    source: row.source,
    ...(row.laboratory !== null ? { laboratory: row.laboratory } : {}),
    ...(row.sample_ref !== null ? { sampleRef: row.sample_ref } : {}),
    ...(row.note !== null ? { note: row.note } : {}),
    recordedAt: row.created_at,
  };
}

export async function listSlurryCompositionRecordsForFarm(farmId: string): Promise<SlurryComposition[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("slurry_composition_records").select("*").eq("farm_id", farmId);
  if (error) throw error;
  return (data as SlurryCompositionRecordRow[]).map(rowToSlurryComposition);
}

export async function createSlurryCompositionRecord(farmId: string, input: NewSlurryCompositionInput): Promise<SlurryComposition> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("slurry_composition_records")
    .insert({
      farm_id: farmId,
      housing_id: input.housingId,
      slurry_type: input.slurryType,
      status: input.status,
      dm_pct: input.dmPct,
      n_per_m3: input.nPerM3 ?? null,
      p_per_m3: input.pPerM3 ?? null,
      k_per_m3: input.kPerM3 ?? null,
      sample_date: input.sampleDate,
      source: input.source.trim(),
      laboratory: input.laboratory?.trim() ? input.laboratory.trim() : null,
      sample_ref: input.sampleRef?.trim() ? input.sampleRef.trim() : null,
      note: input.note?.trim() ? input.note.trim() : null,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToSlurryComposition(data as SlurryCompositionRecordRow);
}
