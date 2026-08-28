import "server-only";

/**
 * Real Farm V1 Phase 3 — Field queries/mutations. Every mutation is scoped
 * to a `farmId` the caller must already know belongs to the current user
 * (verified via `getFarmForCurrentUser`/onboarding) — RLS is the actual
 * enforcement boundary (see the migration), this is defence in depth.
 */
import { createClient } from "@/lib/supabase/server";
import type { Field } from "@/domain/types";
import { fieldToInsertRow, rowToField, type NewFieldInput } from "./mappers";
import type { FieldRow } from "./row-types";

export async function listFieldsForFarm(farmId: string): Promise<Field[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fields")
    .select("*")
    .eq("farm_id", farmId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data as FieldRow[]).map(rowToField);
}

export async function createField(farmId: string, input: NewFieldInput): Promise<Field> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fields")
    .insert(fieldToInsertRow(farmId, input))
    .select("*")
    .single();
  if (error) throw error;

  return rowToField(data as FieldRow);
}

export async function setFieldBoundary(fieldId: string, polygon: GeoJSON.Polygon, areaHa: number, centroid: [number, number]): Promise<Field> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fields")
    .update({
      polygon,
      polygon_source: "farmer_drawn",
      polygon_captured_at: new Date().toISOString(),
      area_ha: areaHa,
      centroid_lng: centroid[0],
      centroid_lat: centroid[1],
    })
    .eq("id", fieldId)
    .select("*")
    .single();
  if (error) throw error;

  return rowToField(data as FieldRow);
}
