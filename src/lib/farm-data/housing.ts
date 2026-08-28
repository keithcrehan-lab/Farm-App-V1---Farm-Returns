import "server-only";

/** Real Farm V1 Phase 3/4 — Housing queries/mutations. */
import { createClient } from "@/lib/supabase/server";
import type { Housing } from "@/domain/types";
import { groupLivestockIdsByHousing, rowToHousing } from "./mappers";
import type { HousingRow, LivestockGroupRow } from "./row-types";

/**
 * `slurryEstimate` still needs the real S.I. 588/2025 excretion-rate
 * coefficient this build doesn't have (documented blocker,
 * `docs/evidence-register.md` "storage/excretion coefficients") — every
 * newly-created shed gets the same explicitly mock-tagged placeholder
 * `Housing.slurryEstimate` already used throughout `mock-farm.ts`, never a
 * fabricated real-looking figure.
 */
function placeholderSlurryEstimate() {
  return {
    volumeM3: { value: 0, status: "estimated" as const, source: "slurry_engine_v1.0.0 (mock)" },
    availableN: { value: 0, status: "estimated" as const, source: "slurry_engine_v1.0.0 (mock)" },
    availableP: { value: 0, status: "estimated" as const, source: "slurry_engine_v1.0.0 (mock)" },
    availableK: { value: 0, status: "estimated" as const, source: "slurry_engine_v1.0.0 (mock)" },
    ruleSetVersion: "slurry_engine_v1.0.0 (mock)",
  };
}

export async function listHousingForFarm(farmId: string): Promise<Housing[]> {
  const supabase = await createClient();
  const [{ data: housingRows, error: housingError }, { data: groupRows, error: groupError }] = await Promise.all([
    supabase.from("housing").select("*").eq("farm_id", farmId).order("created_at", { ascending: true }),
    supabase.from("livestock_groups").select("id, housing_id").eq("farm_id", farmId),
  ]);
  if (housingError) throw housingError;
  if (groupError) throw groupError;

  const byHousing = groupLivestockIdsByHousing(groupRows as Pick<LivestockGroupRow, "id" | "housing_id">[]);
  return (housingRows as HousingRow[]).map((row) => rowToHousing(row, byHousing.get(row.id) ?? []));
}

export interface NewHousingInput {
  shedName: string;
  shedType: "slatted" | "straw_bedded" | "other";
  housingPeriod: { start: string; end: string };
  storageCapacityM3: number;
  storageFillPct: number;
}

export async function createHousing(farmId: string, input: NewHousingInput): Promise<Housing> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("housing")
    .insert({
      farm_id: farmId,
      shed_name: input.shedName,
      shed_type: input.shedType,
      housing_period_start: input.housingPeriod.start,
      housing_period_end: input.housingPeriod.end,
      tank_refinement: null,
      slurry_estimate: placeholderSlurryEstimate(),
      storage_capacity_m3: input.storageCapacityM3,
      storage_fill_pct: input.storageFillPct,
    })
    .select("*")
    .single();
  if (error) throw error;

  return rowToHousing(data as HousingRow, []);
}
