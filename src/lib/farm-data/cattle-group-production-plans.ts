import "server-only";

import type { CattleGroupProductionPlan } from "@/domain/cattle-group-production-plan";
import { createClient } from "@/lib/supabase/server";

const TABLE = "cattle_group_production_plans";

interface Row {
  group_id: string;
  farm_id: string;
  target_weight_kg: number | string | null;
  target_date: string | null;
  diet_label: string | null;
  concentrate_kg_head_day: number | string | null;
  concentrate_price_eur_t: number | string | null;
  forage_cost_eur_head_day: number | string | null;
  housing_cost_eur_head_day: number | string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const numberOrUndefined = (value: number | string | null): number | undefined => {
  if (value === null) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`${TABLE}: invalid numeric value`);
  return n;
};

export function rowToCattleGroupProductionPlan(row: Row): CattleGroupProductionPlan {
  return {
    groupId: row.group_id,
    farmId: row.farm_id,
    ...(numberOrUndefined(row.target_weight_kg) !== undefined ? { targetWeightKg: numberOrUndefined(row.target_weight_kg) } : {}),
    ...(row.target_date ? { targetDate: row.target_date } : {}),
    ...(row.diet_label ? { dietLabel: row.diet_label } : {}),
    ...(numberOrUndefined(row.concentrate_kg_head_day) !== undefined ? { concentrateKgHeadDay: numberOrUndefined(row.concentrate_kg_head_day) } : {}),
    ...(numberOrUndefined(row.concentrate_price_eur_t) !== undefined ? { concentratePriceEurT: numberOrUndefined(row.concentrate_price_eur_t) } : {}),
    ...(numberOrUndefined(row.forage_cost_eur_head_day) !== undefined ? { forageCostEurHeadDay: numberOrUndefined(row.forage_cost_eur_head_day) } : {}),
    ...(numberOrUndefined(row.housing_cost_eur_head_day) !== undefined ? { housingCostEurHeadDay: numberOrUndefined(row.housing_cost_eur_head_day) } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCattleGroupProductionPlansForFarm(farmId: string): Promise<CattleGroupProductionPlan[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).select("*").eq("farm_id", farmId).order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(rowToCattleGroupProductionPlan);
}

export interface SaveCattleGroupProductionPlanInput {
  targetWeightKg?: number | null;
  targetDate?: string | null;
  dietLabel?: string | null;
  concentrateKgHeadDay?: number | null;
  concentratePriceEurT?: number | null;
  forageCostEurHeadDay?: number | null;
  housingCostEurHeadDay?: number | null;
  notes?: string | null;
}

export async function saveCattleGroupProductionPlan(
  farmId: string,
  groupId: string,
  input: SaveCattleGroupProductionPlanInput,
): Promise<CattleGroupProductionPlan> {
  const supabase = await createClient();
  const payload = {
    group_id: groupId,
    farm_id: farmId,
    target_weight_kg: input.targetWeightKg ?? null,
    target_date: input.targetDate ?? null,
    diet_label: input.dietLabel?.trim() || null,
    concentrate_kg_head_day: input.concentrateKgHeadDay ?? null,
    concentrate_price_eur_t: input.concentratePriceEurT ?? null,
    forage_cost_eur_head_day: input.forageCostEurHeadDay ?? null,
    housing_cost_eur_head_day: input.housingCostEurHeadDay ?? null,
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from(TABLE).upsert(payload, { onConflict: "group_id" }).select("*").single();
  if (error) throw error;
  return rowToCattleGroupProductionPlan(data as Row);
}
