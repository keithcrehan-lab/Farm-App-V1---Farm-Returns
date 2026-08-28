import "server-only";

/** Real Farm V1 Phase 3/4 — Livestock group queries/mutations. */
import { createClient } from "@/lib/supabase/server";
import type { LivestockCategory, LivestockGoal, LivestockGroup } from "@/domain/types";
import { rowToLivestockGroup } from "./mappers";
import type { LivestockGroupRow } from "./row-types";

export async function listLivestockGroupsForFarm(farmId: string): Promise<LivestockGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("livestock_groups")
    .select("*")
    .eq("farm_id", farmId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data as LivestockGroupRow[]).map(rowToLivestockGroup);
}

/**
 * Same indicative-value placeholder `farm-store.tsx`'s `addLivestockGroup`
 * already uses for a newly-created group, before the Phase 4 finance
 * engine prices it for real — kept identical here so onboarding and the
 * existing mock-mode action don't quietly diverge on what a "new group"
 * looks like.
 */
const INDICATIVE_LIVEWEIGHT_EUR_PER_KG = 2.5;

export interface NewLivestockGroupInput {
  label: string;
  category: LivestockCategory;
  count: number;
  avgWeightKg?: number;
  system: "grazing" | "housed";
  goal?: LivestockGoal;
  housingId?: string;
  farmerName: string;
}

export async function createLivestockGroup(farmId: string, input: NewLivestockGroupInput): Promise<LivestockGroup> {
  const supabase = await createClient();
  const estValue = Math.round((input.avgWeightKg ?? 0) * input.count * INDICATIVE_LIVEWEIGHT_EUR_PER_KG);

  const { data, error } = await supabase
    .from("livestock_groups")
    .insert({
      farm_id: farmId,
      category: input.category,
      label: input.label,
      count: { value: input.count, status: "verified", source: input.farmerName },
      avg_weight_kg:
        input.avgWeightKg !== undefined
          ? { value: input.avgWeightKg, status: "estimated", source: "Farm Return assumption" }
          : null,
      avg_age_months: null,
      breed: null,
      sex: null,
      system: input.system,
      housing_id: input.housingId ?? null,
      goal: input.goal ?? null,
      value: { value: estValue, status: "estimated", source: "Farm Return assumption" },
      status_label: "On Track",
      avg_milk_yield_kg_per_year: null,
    })
    .select("*")
    .single();
  if (error) throw error;

  return rowToLivestockGroup(data as LivestockGroupRow);
}
