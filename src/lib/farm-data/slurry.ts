import "server-only";

/** Real Farm V1 Phase 6 — Slurry allocation queries/mutations. */
import { createClient } from "@/lib/supabase/server";
import type { SlurryAllocation } from "@/domain/types";
import { farmerAdjust } from "@/domain/provenance";
import { tracked } from "@/domain/types";
import { rowToSlurryAllocation, rowToSlurryAllocationRecord } from "./mappers";
import type { SlurryAllocationRow } from "./row-types";
import {
  SlurryAllocationPlanRejectedError,
  isSlurryAllocationPlanIssue,
  type SlurryAllocationPlanIssue,
  type ValidSlurryAllocationPlan,
} from "@/domain/slurry-allocation-plan";
import {
  SlurryAllocationLifecycleRejectedError,
  lifecycleIssueFromDbError,
  type SlurryAllocationRecord,
  type ValidSlurryAllocationCompletion,
  type ValidSlurryAllocationEdit,
} from "@/domain/slurry-allocation-lifecycle";

/** ACTIVE plans only (Phase 1A lifecycle): every planning, nutrient,
 * economic, Today and What Matters reader consumes future applications, so
 * completed and cancelled rows are excluded here, once, rather than in
 * each reader. History: `listSlurryAllocationRecordsForFarm`. */
export async function listSlurryAllocationsForFarm(farmId: string): Promise<SlurryAllocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("slurry_allocations").select("*").eq("farm_id", farmId).eq("status", "planned");
  if (error) throw error;

  return (data as SlurryAllocationRow[]).map(rowToSlurryAllocation);
}

/** Phase 1A — every allocation of the farm with its full lifecycle
 * (planned, completed, cancelled), planned and actual volumes separate. */
export async function listSlurryAllocationRecordsForFarm(farmId: string): Promise<SlurryAllocationRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("slurry_allocations").select("*").eq("farm_id", farmId);
  if (error) throw error;

  return (data as SlurryAllocationRow[]).map(rowToSlurryAllocationRecord);
}

async function lifecycleRpc(name: string, params: Record<string, unknown>): Promise<SlurryAllocationRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, params);
  if (error) {
    const issue = lifecycleIssueFromDbError(error);
    if (issue) throw new SlurryAllocationLifecycleRejectedError([issue]);
    throw error;
  }
  return rowToSlurryAllocationRecord(data as SlurryAllocationRow);
}

/** Edits a still-planned allocation (`update_planned_slurry_allocation`):
 * the allocation row is locked, then the destination store; a volume
 * increase or store move is checked against that store's available volume
 * by the `slurry_allocations_store_capacity` trigger, a decrease releases
 * the difference in the same statement. Completed/cancelled rows are
 * refused (`NOT_PLANNED`). */
export async function updatePlannedSlurryAllocation(farmId: string, edit: ValidSlurryAllocationEdit): Promise<SlurryAllocationRecord> {
  return lifecycleRpc("update_planned_slurry_allocation", {
    p_farm_id: farmId,
    p_allocation_id: edit.allocationId,
    p_field_id: edit.fieldId,
    p_housing_id: edit.housingId,
    p_volume_m3: edit.volumeM3,
  });
}

/** Cancels a planned allocation (`cancel_planned_slurry_allocation`): the
 * row is kept, stamped cancelled, and reserves nothing. Idempotent. */
export async function cancelPlannedSlurryAllocation(farmId: string, allocationId: string): Promise<SlurryAllocationRecord> {
  return lifecycleRpc("cancel_planned_slurry_allocation", { p_farm_id: farmId, p_allocation_id: allocationId });
}

/** Records a planned allocation as actually spread
 * (`complete_planned_slurry_allocation`): the actual physical volume is
 * stored beside the planned volume, the reservation is released and — for
 * a spread after the store's current observation — the actual volume is
 * withdrawn from the store so it cannot become available again. A second
 * completion is refused (`ALREADY_COMPLETED`). */
export async function completePlannedSlurryAllocation(farmId: string, completion: ValidSlurryAllocationCompletion): Promise<SlurryAllocationRecord> {
  return lifecycleRpc("complete_planned_slurry_allocation", {
    p_farm_id: farmId,
    p_allocation_id: completion.allocationId,
    p_actual_volume_m3: completion.actualVolumeM3,
    p_actual_spread_date: completion.actualSpreadDate,
    p_store_reconciliation: completion.storeReconciliation ?? null,
  });
}

const PLAN_REJECTED_PREFIX = "slurry_allocation_plan_rejected:";

/** Maps a database rejection from `create_farmer_planned_slurry_allocation`
 * (or the `(field_id, housing_id)` unique constraint, if two saves for the
 * same pair race) to its plan issue; `undefined` for any other error. */
function planIssueFromDbError(error: { code?: string; message?: string }): SlurryAllocationPlanIssue | undefined {
  const message = error.message ?? "";
  const at = message.indexOf(PLAN_REJECTED_PREFIX);
  if (at >= 0) {
    const code = message.slice(at + PLAN_REJECTED_PREFIX.length).trim().split(/\s/)[0];
    if (isSlurryAllocationPlanIssue(code)) return code;
  }
  if (error.code === "23505") return "ALREADY_PLANNED_FROM_STORE";
  return undefined;
}

/** Creates one farmer-planned allocation (`slurry-allocation-plan.ts`)
 * through `public.create_farmer_planned_slurry_allocation`
 * (`20260925010000_create_farmer_planned_slurry_allocation_rpc.sql`,
 * superseded by `20260925020000_slurry_allocations_store_capacity_invariant.sql`),
 * which re-checks field/store ownership and inserts; the table's
 * `slurry_allocations_store_capacity` trigger locks the store row and
 * checks its real available volume for every write path, so two
 * concurrent saves cannot together over-allocate it. No
 * `priority`/`score` — nothing has ranked it. Method and date are the
 * farmer's own values with no fabricated prior estimate. RLS and the
 * `slurry_allocations_same_farm` trigger still apply (security invoker).
 * A database rejection surfaces as `SlurryAllocationPlanRejectedError`. */
export async function createSlurryAllocation(farmId: string, plan: ValidSlurryAllocationPlan, farmerName: string): Promise<SlurryAllocation> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_farmer_planned_slurry_allocation", {
    p_farm_id: farmId,
    p_field_id: plan.fieldId,
    p_housing_id: plan.housingId,
    p_volume_m3: plan.volumeM3,
    p_application_method: farmerAdjust(undefined, plan.applicationMethod, farmerName),
    p_application_date: farmerAdjust(undefined, plan.applicationDate, farmerName),
  });
  if (error) {
    const issue = planIssueFromDbError(error);
    if (issue) throw new SlurryAllocationPlanRejectedError([issue]);
    throw error;
  }

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
    .eq("status", "planned")
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
    .eq("status", "planned")
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
    .eq("status", "planned")
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
    .eq("status", "planned")
    .select("*")
    .single();
  if (error) throw error;

  return rowToSlurryAllocation(data as SlurryAllocationRow);
}
