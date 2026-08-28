import "server-only";

/**
 * Real Farm V1 Phase 3 — Farm queries/mutations. Server-only (Supabase
 * session cookies live server-side); every function re-derives the current
 * user itself rather than trusting a caller-supplied id, per Next.js's
 * Data Security guide ("verify authentication and authorization inside
 * every Server Function").
 *
 * One farm per user for V1 — the brief's Definition of Done describes a
 * single real farm per signed-in farmer, not a multi-farm switcher; `.limit(1)`
 * below is a deliberate, documented scope limit, not an oversight.
 */
import { createClient } from "@/lib/supabase/server";
import type { Farm } from "@/domain/types";
import { farmToInsertRow, rowToFarm, type NewFarmInput } from "./mappers";
import type { FarmRow } from "./row-types";

export async function getFarmForCurrentUser(): Promise<Farm | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("farms")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  return data ? rowToFarm(data as FarmRow) : null;
}

export async function createFarmForCurrentUser(input: NewFarmInput): Promise<Farm> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("farms")
    .insert(farmToInsertRow(user.id, input))
    .select("*")
    .single();
  if (error) throw error;

  return rowToFarm(data as FarmRow);
}

export async function updateFarmProfileForCurrentUser(
  farmId: string,
  patch: { name?: string; ownerName?: string; county?: string },
): Promise<Farm> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const row: Record<string, string> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.ownerName !== undefined) row.owner_name = patch.ownerName;
  if (patch.county !== undefined) row.county = patch.county;

  // RLS also enforces this, but scoping the update to user_id here too
  // means a wrong/stale farmId fails as "no row updated", not a
  // cross-account write silently scoped away only by the database.
  const { data, error } = await supabase
    .from("farms")
    .update(row)
    .eq("id", farmId)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error) throw error;

  return rowToFarm(data as FarmRow);
}
