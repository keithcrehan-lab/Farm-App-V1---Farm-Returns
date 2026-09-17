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
  /**
   * Codex audit CRITICAL (Fertiliser Overview and Stock Visuals campaign,
   * round 1): the first version of this function always stamped
   * `"farmer_recorded"` whenever `storageFillPct` was present — but the
   * real Housing form (`housing/page.tsx`) silently converts a genuinely
   * BLANK "Current fill (%)" field to `0` before calling this
   * (`fillPct ? Number(fillPct) : 0`), so an unentered value was being
   * presented as a real, timestamped farmer confirmation. The caller now
   * decides explicitly, based on whether the farmer actually typed a
   * value into that field this submission — never inferred from the
   * numeric value alone (a real, deliberate `0` — "my tank is genuinely
   * empty" — is exactly as valid a farmer entry as any other number).
   * Defaults to `"estimated"` — the safe default; never assumes farmer
   * input without an explicit signal.
   */
  storageFillStatus?: "estimated" | "farmer_recorded";
}

export async function createHousing(farmId: string, input: NewHousingInput): Promise<Housing> {
  const supabase = await createClient();
  const status = input.storageFillStatus ?? "estimated";
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
      storage_fill_status: status,
      storage_fill_recorded_at: status === "farmer_recorded" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();
  if (error) throw error;

  return rowToHousing(data as HousingRow, []);
}

/** Real Mode Completion Phase 26 (editability) — rename a shed, correct
 * capacity/fill%/type/period after creation. */
export interface UpdateHousingInput {
  shedName?: string;
  shedType?: "slatted" | "straw_bedded" | "other";
  housingPeriod?: { start: string; end: string };
  storageCapacityM3?: number;
  storageFillPct?: number;
  /** Same real, caller-decided meaning as `NewHousingInput.storageFillStatus`
   * above — only consulted when `storageFillPct` is also present; defaults
   * to `"estimated"` when omitted, the same safe default. */
  storageFillStatus?: "estimated" | "farmer_recorded";
}

export async function updateHousing(housingId: string, input: UpdateHousingInput, linkedGroupIds: string[]): Promise<Housing> {
  const supabase = await createClient();
  const update: Record<string, unknown> = {};
  if (input.shedName !== undefined) update.shed_name = input.shedName;
  if (input.shedType !== undefined) update.shed_type = input.shedType;
  if (input.housingPeriod !== undefined) {
    update.housing_period_start = input.housingPeriod.start;
    update.housing_period_end = input.housingPeriod.end;
  }
  if (input.storageCapacityM3 !== undefined) update.storage_capacity_m3 = input.storageCapacityM3;
  if (input.storageFillPct !== undefined) {
    update.storage_fill_pct = input.storageFillPct;
    const status = input.storageFillStatus ?? "estimated";
    update.storage_fill_status = status;
    update.storage_fill_recorded_at = status === "farmer_recorded" ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase.from("housing").update(update).eq("id", housingId).select("*").single();
  if (error) throw error;

  return rowToHousing(data as HousingRow, linkedGroupIds);
}
