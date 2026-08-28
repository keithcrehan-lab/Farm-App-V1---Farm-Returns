import "server-only";

/**
 * Real Farm V1 Phase 3 — Field queries/mutations. Every mutation is scoped
 * to a `farmId` the caller must already know belongs to the current user
 * (verified via `getFarmForCurrentUser`/onboarding) — RLS is the actual
 * enforcement boundary (see the migration), this is defence in depth.
 */
import { createClient } from "@/lib/supabase/server";
import type { Field } from "@/domain/types";
import { farmerAdjust } from "@/domain/provenance";
import { tracked } from "@/domain/types";
import { fieldToInsertRow, rowToField, type NewFieldInput } from "./mappers";
import type { FieldRow } from "./row-types";

async function fetchField(fieldId: string): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; field: Field }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fields").select("*").eq("id", fieldId).single();
  if (error) throw error;
  return { supabase, field: rowToField(data as FieldRow) };
}

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

/** Mirrors `farm-store.tsx`'s mock-mode `updateFieldIndex` action exactly — chains via `farmerAdjust`, never overwrites. */
export async function updateFieldIndex(
  fieldId: string,
  key: "pIndex" | "kIndex",
  value: 1 | 2 | 3 | 4,
  farmerName: string,
): Promise<Field> {
  const { supabase, field } = await fetchField(fieldId);
  const fertility = { ...field.fertility, [key]: farmerAdjust(field.fertility[key], value, farmerName) };

  const { data, error } = await supabase.from("fields").update({ fertility }).eq("id", fieldId).select("*").single();
  if (error) throw error;
  return rowToField(data as FieldRow);
}

/** Mirrors `farm-store.tsx`'s mock-mode `updateFieldCommonageStatus` action. */
export async function updateFieldCommonageStatus(
  fieldId: string,
  status: "commonage" | "not_commonage" | "unknown",
  farmerName: string,
): Promise<Field> {
  const { supabase, field } = await fetchField(fieldId);
  const commonage_status = farmerAdjust(
    field.commonageStatus ?? tracked("unknown", "estimated", "Farm Return assumption"),
    status,
    farmerName,
  );

  const { data, error } = await supabase.from("fields").update({ commonage_status }).eq("id", fieldId).select("*").single();
  if (error) throw error;
  return rowToField(data as FieldRow);
}

/** Mirrors `farm-store.tsx`'s mock-mode `updateFieldWaterBufferContext` action. */
export async function updateFieldWaterBufferContext(
  fieldId: string,
  context: NonNullable<Field["waterBufferContext"]>["value"],
  farmerName: string,
): Promise<Field> {
  const { supabase, field } = await fetchField(fieldId);
  const water_buffer_context = farmerAdjust(
    field.waterBufferContext ?? tracked({ localOverrideStatus: "unknown" as const }, "estimated", "Farm Return assumption"),
    context,
    farmerName,
  );

  const { data, error } = await supabase
    .from("fields")
    .update({ water_buffer_context })
    .eq("id", fieldId)
    .select("*")
    .single();
  if (error) throw error;
  return rowToField(data as FieldRow);
}
