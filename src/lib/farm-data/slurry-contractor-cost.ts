import "server-only";

/**
 * Farmer-Entered Contractor Rate campaign —
 * `slurry_contractor_cost_declarations` queries/mutations
 * (`supabase/migrations/20260923000000_slurry_contractor_cost_declarations.sql`).
 * Insert/select only — no update/delete function exists here at all,
 * matching the migration's own RLS grants exactly (a farmer correcting
 * the rate is a NEW record, never an edit of an old one — see
 * `src/domain/slurry-realisation-cost.ts`'s own header).
 */
import { createClient } from "@/lib/supabase/server";

export interface PersistedContractorCostRate {
  /** Exact canonical decimal string, e.g. `"120"`. */
  ratePerHa: string;
  /** Server-generated — the row's own `created_at`, never a client-supplied timestamp. */
  declaredAt: string;
}

interface ContractorCostDeclarationRow {
  // Selected via PostgREST's `::text` column cast (below), never the bare
  // numeric column — Postgres `numeric` has no magnitude/precision limit,
  // but PostgREST would otherwise serialise it as a JSON number, which
  // silently loses precision for a sufficiently precise rate before it
  // ever reaches this app's own exact-decimal domain arithmetic.
  rate_per_ha: string;
  created_at: string;
}

/** The most recently declared contractor rate for this farm, or `null` if
 * none has ever been declared. There is exactly one active rate per farm
 * at a time — the latest row IS the current rate, by construction (no
 * separate "current" flag). */
export async function getLatestContractorCostRateForFarm(farmId: string): Promise<PersistedContractorCostRate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("slurry_contractor_cost_declarations")
    .select("rate_per_ha::text, created_at")
    .eq("farm_id", farmId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as ContractorCostDeclarationRow;
  return { ratePerHa: row.rate_per_ha, declaredAt: row.created_at };
}

/** Inserts one new immutable contractor-rate declaration for this farm.
 * Caller must validate `ratePerHa` first (`validateContractorCostRate`,
 * `slurry-realisation-cost.ts`) — this function trusts its input, exactly
 * like `createSlurryCompositionRecord`'s own established pattern; the
 * database's own `rate_per_ha > 0` check is the final backstop, not the
 * primary validation. */
export async function createContractorCostRateRecord(farmId: string, ratePerHa: string): Promise<PersistedContractorCostRate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("slurry_contractor_cost_declarations")
    .insert({ farm_id: farmId, rate_per_ha: ratePerHa, currency: "EUR", declared_by: user?.id ?? null })
    .select("rate_per_ha::text, created_at")
    .single();
  if (error) throw error;
  const row = data as ContractorCostDeclarationRow;
  return { ratePerHa: row.rate_per_ha, declaredAt: row.created_at };
}
