import "server-only";

import type { LivestockCategory } from "@/domain/types";
import type { GrazingFieldSession } from "@/domain/grazing-field-pressure";
import { createClient } from "@/lib/supabase/server";

interface GrazingFieldSessionRow {
  id: string;
  farm_id: string;
  livestock_group_id: string;
  field_id: string;
  started_at: string;
  ended_at: string | null;
  head_count_snapshot: number | string;
  livestock_category_snapshot: string;
  livestock_units_per_head_snapshot: number | string;
  source: string;
  recorded_by: string | null;
  created_at: string;
}

function rowToSession(row: GrazingFieldSessionRow): GrazingFieldSession {
  return {
    id: row.id,
    farmId: row.farm_id,
    livestockGroupId: row.livestock_group_id,
    fieldId: row.field_id,
    startedAt: row.started_at,
    ...(row.ended_at ? { endedAt: row.ended_at } : {}),
    headCountSnapshot: Number(row.head_count_snapshot),
    livestockCategorySnapshot: row.livestock_category_snapshot as LivestockCategory,
    livestockUnitsPerHeadSnapshot: Number(row.livestock_units_per_head_snapshot),
    source: row.source,
    ...(row.recorded_by ? { recordedBy: row.recorded_by } : {}),
    createdAt: row.created_at,
  };
}

export async function listGrazingFieldSessionsForFarm(
  farmId: string,
  startedBefore?: string,
): Promise<GrazingFieldSession[]> {
  const supabase = await createClient();
  let query = supabase
    .from("grazing_field_sessions")
    .select("*")
    .eq("farm_id", farmId)
    .order("started_at", { ascending: true })
    .order("id", { ascending: true });
  if (startedBefore) query = query.lt("started_at", startedBefore);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as GrazingFieldSessionRow[]).map(rowToSession);
}

const REJECTION = /grazing_move_rejected:([A-Z_]+)/;

export class GrazingMoveRejectedError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "GrazingMoveRejectedError";
    this.code = code;
  }
}

export async function recordGrazingFieldMove(input: {
  livestockGroupId: string;
  fieldId: string;
  startedAt: string;
  source: string;
}): Promise<GrazingFieldSession> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_grazing_field_move", {
    p_livestock_group_id: input.livestockGroupId,
    p_field_id: input.fieldId,
    p_started_at: input.startedAt,
    p_source: input.source,
  });
  if (error) {
    const match = REJECTION.exec(error.message ?? "");
    if (match) throw new GrazingMoveRejectedError(match[1]);
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as GrazingFieldSessionRow | null;
  if (!row) throw new Error("Grazing move did not return a session.");
  return rowToSession(row);
}
