import "server-only";

/** Real Farm V1 Phase 6 — Slurry allocation queries/mutations. */
import { createClient } from "@/lib/supabase/server";
import type { SlurryAllocation } from "@/domain/types";
import { farmerAdjust } from "@/domain/provenance";
import { tracked } from "@/domain/types";
import { rowToSlurryAllocation } from "./mappers";
import type { SlurryAllocationRow } from "./row-types";

export async function listSlurryAllocationsForFarm(farmId: string): Promise<SlurryAllocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("slurry_allocations").select("*").eq("farm_id", farmId);
  if (error) throw error;

  return (data as SlurryAllocationRow[]).map(rowToSlurryAllocation);
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
