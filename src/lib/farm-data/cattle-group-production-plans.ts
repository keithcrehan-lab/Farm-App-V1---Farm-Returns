import "server-only";

import type { CattleFeedingSituation, CattleGroupProductionPlan, SilageQualityBasis } from "@/domain/cattle-group-production-plan";
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
  /** Nutrition-context columns (20261104200000); absent before that migration. */
  feeding_situation?: string | null;
  silage_quality_basis?: string | null;
  silage_dmd_pct?: number | string | null;
  silage_cp_pct?: number | string | null;
  silage_analysis_date?: string | null;
  created_at: string;
  updated_at: string;
}

const FEEDING_SITUATIONS: readonly CattleFeedingSituation[] = ["housed_grass_silage", "at_grass", "other_diet"];
const SILAGE_BASES: readonly SilageQualityBasis[] = ["lab_analysis", "planning_scenario"];

function enumOrUndefined<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) throw new Error(`${TABLE}: invalid enum value`);
  return value as T;
}

const numberOrUndefined = (value: number | string | null | undefined): number | undefined => {
  if (value === null || value === undefined) return undefined;
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
    ...(enumOrUndefined(row.feeding_situation, FEEDING_SITUATIONS) ? { feedingSituation: enumOrUndefined(row.feeding_situation, FEEDING_SITUATIONS) } : {}),
    ...(enumOrUndefined(row.silage_quality_basis, SILAGE_BASES) ? { silageQualityBasis: enumOrUndefined(row.silage_quality_basis, SILAGE_BASES) } : {}),
    ...(numberOrUndefined(row.silage_dmd_pct) !== undefined ? { silageDmdPct: numberOrUndefined(row.silage_dmd_pct) } : {}),
    ...(numberOrUndefined(row.silage_cp_pct) !== undefined ? { silageCpPct: numberOrUndefined(row.silage_cp_pct) } : {}),
    ...(row.silage_analysis_date ? { silageAnalysisDate: row.silage_analysis_date } : {}),
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
  feedingSituation?: CattleFeedingSituation | null;
  silageQualityBasis?: SilageQualityBasis | null;
  silageDmdPct?: number | null;
  silageCpPct?: number | null;
  silageAnalysisDate?: string | null;
}

/**
 * `undefined` leaves a column untouched on update (and null on insert);
 * `null` clears it. The goal-first form no longer edits the legacy
 * forage/housing/ration fields, so saving it must never wipe them.
 */
export function cattleGroupProductionPlanPayload(farmId: string, groupId: string, input: SaveCattleGroupProductionPlanInput, updatedAt: string): Record<string, unknown> {
  const columns: [string, unknown][] = [
    ["target_weight_kg", input.targetWeightKg],
    ["target_date", input.targetDate],
    ["diet_label", input.dietLabel === undefined ? undefined : input.dietLabel?.trim() || null],
    ["concentrate_kg_head_day", input.concentrateKgHeadDay],
    ["concentrate_price_eur_t", input.concentratePriceEurT],
    ["forage_cost_eur_head_day", input.forageCostEurHeadDay],
    ["housing_cost_eur_head_day", input.housingCostEurHeadDay],
    ["notes", input.notes === undefined ? undefined : input.notes?.trim() || null],
    ["feeding_situation", input.feedingSituation],
    ["silage_quality_basis", input.silageQualityBasis],
    ["silage_dmd_pct", input.silageDmdPct],
    ["silage_cp_pct", input.silageCpPct],
    ["silage_analysis_date", input.silageAnalysisDate],
  ];
  return {
    group_id: groupId,
    farm_id: farmId,
    ...Object.fromEntries(columns.filter(([, value]) => value !== undefined)),
    updated_at: updatedAt,
  };
}

export async function saveCattleGroupProductionPlan(
  farmId: string,
  groupId: string,
  input: SaveCattleGroupProductionPlanInput,
): Promise<CattleGroupProductionPlan> {
  const supabase = await createClient();
  const payload = cattleGroupProductionPlanPayload(farmId, groupId, input, new Date().toISOString());
  const { data, error } = await supabase.from(TABLE).upsert(payload, { onConflict: "group_id" }).select("*").single();
  if (error) throw error;
  return rowToCattleGroupProductionPlan(data as Row);
}
