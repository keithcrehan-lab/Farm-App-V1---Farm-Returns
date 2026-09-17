import "server-only";

/**
 * Fertiliser Overview and Stock Visuals campaign —
 * `fertiliser_stock_records` queries/mutations
 * (`supabase/migrations/20260917000000_fertiliser_stock_and_slurry_provenance.sql`).
 * Insert/select only — no update/delete function exists here at all,
 * matching the migration's own RLS grants exactly (a farmer corrects a
 * mistaken figure by inserting a new record, never editing an old one —
 * see `src/domain/fertiliser-stock.ts`'s own header).
 */
import { createClient } from "@/lib/supabase/server";
import type { FertiliserStockRecord, FertiliserStockUnit, NewFertiliserStockRecordInput } from "@/domain/fertiliser-stock";

interface FertiliserStockRecordRow {
  id: string;
  farm_id: string;
  product: string;
  quantity: number;
  unit: FertiliserStockUnit;
  effective_date: string;
  source: string;
  note: string | null;
  created_at: string;
}

function rowToFertiliserStockRecord(row: FertiliserStockRecordRow): FertiliserStockRecord {
  return {
    id: row.id,
    farmId: row.farm_id,
    product: row.product,
    quantity: row.quantity,
    unit: row.unit,
    effectiveDate: row.effective_date,
    source: row.source,
    ...(row.note !== null ? { note: row.note } : {}),
    recordedAt: row.created_at,
  };
}

export async function listFertiliserStockRecordsForFarm(farmId: string): Promise<FertiliserStockRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fertiliser_stock_records").select("*").eq("farm_id", farmId);
  if (error) throw error;
  return (data as FertiliserStockRecordRow[]).map(rowToFertiliserStockRecord);
}

export async function createFertiliserStockRecord(farmId: string, input: NewFertiliserStockRecordInput): Promise<FertiliserStockRecord> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("fertiliser_stock_records")
    .insert({
      farm_id: farmId,
      product: input.product.trim(),
      quantity: input.quantity,
      unit: input.unit,
      effective_date: input.effectiveDate,
      source: input.source.trim(),
      note: input.note?.trim() ? input.note.trim() : null,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToFertiliserStockRecord(data as FertiliserStockRecordRow);
}
