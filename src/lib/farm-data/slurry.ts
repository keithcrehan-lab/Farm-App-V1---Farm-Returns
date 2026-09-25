import "server-only";

/** Real Farm V1 Phase 6 — Slurry allocation queries/mutations. */
import { createClient } from "@/lib/supabase/server";
import type { SlurryAllocation } from "@/domain/types";
import { farmerAdjust } from "@/domain/provenance";
import { tracked } from "@/domain/types";
import { rowToSlurryAllocation } from "./mappers";
import type { SlurryAllocationRow } from "./row-types";
import type { ValidSlurryAllocationPlan } from "@/domain/slurry-allocation-plan";

export async function listSlurryAllocationsForFarm(farmId: string): Promise<SlurryAllocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("slurry_allocations").select("*").eq("farm_id", farmId);
  if (error) throw error;

  return (data as SlurryAllocationRow[]).map(rowToSlurryAllocation);
}

/** Inserts one farmer-planned allocation (`slurry-allocation-plan.ts`,
 * already validated by the caller against this farm's own records). No
 * `priority`/`score` — nothing has ranked it. Method and date are the
 * farmer's own values with no fabricated prior estimate. RLS and the
 * `slurry_allocations_same_farm` trigger enforce farm binding in the
 * database as well. */
export async function createSlurryAllocation(farmId: string, plan: ValidSlurryAllocationPlan, farmerName: string): Promise<SlurryAllocation> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("slurry_allocations")
    .insert({
      farm_id: farmId,
      field_id: plan.fieldId,
      housing_id: plan.housingId,
      priority: null,
      score: null,
      volume_m3: plan.volumeM3,
      application_method: farmerAdjust(undefined, plan.applicationMethod, farmerName),
      application_date: farmerAdjust(undefined, plan.applicationDate, farmerName),
    })
    .select("*")
    .single();
  if (error) throw error;

  return rowToSlurryAllocation(data as SlurryAllocationRow);
}

/** Mirrors `farm-store.tsx`'s mock-mode `updateSlurryApplicationMethod` action — only meaningful once a field/housing allocation row already exists (Phase 11, not yet onboarding-created). */
export async function updateSlurryApplicationMethod(
  fieldId: string,
  housingId: string,
  method: "LESS" | "splashplate" | "incorporate_24h" | "other",
  farmerName: string,
): Promise<SlurryAllocation> {
  const supabase = await createClient();
  const { data: existingRow, error: fetchError } = await supabase
    .from("slurry_allocations")
    .select("*")
    .eq("field_id", fieldId)
    .eq("housing_id", housingId)
    .single();
  if (fetchError) throw fetchError;
  const allocation = rowToSlurryAllocation(existingRow as SlurryAllocationRow);

  const application_method = farmerAdjust(
    allocation.applicationMethod ?? tracked("other", "estimated", "Farm Return assumption"),
    method,
    farmerName,
  );

  const { data, error } = await supabase
    .from("slurry_allocations")
    .update({ application_method })
    .eq("field_id", fieldId)
    .eq("housing_id", housingId)
    .select("*")
    .single();
  if (error) throw error;

  return rowToSlurryAllocation(data as SlurryAllocationRow);
}

/** Slurry Application Context V1 — same pattern as
 * `updateSlurryApplicationMethod` above, for the new `applicationDate`
 * field (`20260919010000_slurry_allocation_application_date.sql`). Only
 * meaningful once a field/housing allocation row already exists, same as
 * that function. */
export async function updateSlurryApplicationDate(
  fieldId: string,
  housingId: string,
  isoDate: string,
  farmerName: string,
): Promise<SlurryAllocation> {
  const supabase = await createClient();
  const { data: existingRow, error: fetchError } = await supabase
    .from("slurry_allocations")
    .select("*")
    .eq("field_id", fieldId)
    .eq("housing_id", housingId)
    .single();
  if (fetchError) throw fetchError;
  const allocation = rowToSlurryAllocation(existingRow as SlurryAllocationRow);

  const application_date = farmerAdjust(
    allocation.applicationDate ?? tracked(isoDate, "estimated", "Farm Return assumption"),
    isoDate,
    farmerName,
  );

  const { data, error } = await supabase
    .from("slurry_allocations")
    .update({ application_date })
    .eq("field_id", fieldId)
    .eq("housing_id", housingId)
    .select("*")
    .single();
  if (error) throw error;

  return rowToSlurryAllocation(data as SlurryAllocationRow);
}
