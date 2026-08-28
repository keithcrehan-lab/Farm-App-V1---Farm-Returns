import "server-only";

/**
 * Real Farm V1 Phase 3/4 — Financial assumption queries/mutations. See
 * `src/domain/types.ts`'s `FinancialAssumption` header comment for why
 * this is a distinct entity from `src/domain/market.ts`'s sourced CSO
 * reference series.
 */
import { createClient } from "@/lib/supabase/server";
import type { FinancialAssumption, FinancialAssumptionKey } from "@/domain/types";
import { rowToFinancialAssumption } from "./mappers";
import type { FinancialAssumptionRow } from "./row-types";

export async function listFinancialAssumptionsForFarm(farmId: string): Promise<FinancialAssumption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("financial_assumptions").select("*").eq("farm_id", farmId);
  if (error) throw error;

  return (data as FinancialAssumptionRow[]).map(rowToFinancialAssumption);
}

/**
 * Upsert rather than insert-only: onboarding Step 7 lets a farmer accept a
 * reference default or immediately replace it with a real cost, and Phase
 * 14/18 (editability) needs the same "change it later" path — one
 * function for both rather than a separate update.
 */
export async function upsertFinancialAssumption(
  farmId: string,
  key: FinancialAssumptionKey,
  value: number,
  unit: string,
  status: "estimated" | "farmer_adjusted",
  source: string,
): Promise<FinancialAssumption> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("financial_assumptions")
    .upsert(
      { farm_id: farmId, key, value: { value, status, source }, unit },
      { onConflict: "farm_id,key" },
    )
    .select("*")
    .single();
  if (error) throw error;

  return rowToFinancialAssumption(data as FinancialAssumptionRow);
}
