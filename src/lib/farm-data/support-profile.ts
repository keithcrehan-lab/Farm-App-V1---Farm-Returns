import "server-only";

/**
 * Farm Return Next — Supports Intelligence + Farm Strategy phase. Real
 * persistence for the small set of genuinely-new farmer-answered facts
 * `src/domain/support-profile.ts`'s `SupportProfileFactKey` union
 * registers. Requires `supabase/migrations/20260904000000_support_profile_facts.sql`
 * to be applied — every call here fails with a real, honest Postgres
 * error until then, not a silently wrong result (`telemetry.ts`'s own
 * header comment establishes this same disclosed-until-applied posture).
 *
 * Plain authenticated client + RLS, not a privileged client — same
 * architecture as every other table in this file's own directory
 * (`decisions.ts`'s header comment has the full reasoning this file
 * doesn't repeat).
 */
import { createClient } from "@/lib/supabase/server";
import type { SupportProfileFact, SupportProfileFactKey } from "@/domain/support-profile";
import { rowToSupportProfileFact } from "./mappers";
import type { SupportProfileFactRow } from "./row-types";

export async function listSupportProfileFactsForFarm(farmId: string): Promise<SupportProfileFact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("support_profile_facts").select("*").eq("farm_id", farmId);
  if (error) throw error;

  return (data as SupportProfileFactRow[]).map(rowToSupportProfileFact);
}

/**
 * Upsert, not insert-only — matches `upsertFinancialAssumption`'s own
 * "farmer can correct a previous answer" rationale exactly
 * (`CLAUDE.md`: "allow correction of genuinely farmer-entered data").
 * `status` defaults to `"farmer_confirmed"` (the database column itself
 * also defaults to this) — `"self_declared"` is reserved for a future
 * caller that imports a fact rather than asking the farmer directly; no
 * current caller passes it.
 */
export async function upsertSupportProfileFact(farmId: string, key: SupportProfileFactKey, value: unknown, status: SupportProfileFact["status"] = "farmer_confirmed"): Promise<SupportProfileFact> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("support_profile_facts")
    .upsert({ farm_id: farmId, key, value, status, source: "farmer_entered" }, { onConflict: "farm_id,key" })
    .select("*")
    .single();
  if (error) throw error;

  return rowToSupportProfileFact(data as SupportProfileFactRow);
}
