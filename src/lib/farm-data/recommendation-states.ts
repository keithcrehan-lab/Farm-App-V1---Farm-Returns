import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { RecommendationState } from "@/domain/recommendations";

const TABLE = "recommendation_states";

export async function listRecommendationStates(farmId: string): Promise<RecommendationState[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from(TABLE).select("key,status,fingerprint,snoozed_until").eq("farm_id", farmId).limit(1000);
  if (error) throw error;
  return (data ?? []).map((r) => ({ key: r.key, status: r.status, fingerprint: r.fingerprint, snoozedUntil: r.snoozed_until }));
}

export async function upsertRecommendationState(farmId: string, s: RecommendationState): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from(TABLE).upsert({
    farm_id: farmId,
    key: s.key,
    status: s.status,
    fingerprint: s.fingerprint,
    snoozed_until: s.status === "snoozed" ? s.snoozedUntil : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "farm_id,key" });
  if (error) throw error;
}
