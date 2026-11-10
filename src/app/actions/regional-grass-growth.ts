"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REGIONAL_GROWTH_COLUMNS, toRegionalRow, type RegionalGrowthRow } from "@/lib/farm-data/regional-grass-growth";
import { extractLatestMostBatch, type ExtractionOutcome } from "@/server/teagasc/most-growth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function adminClient() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase.from("app_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (error || !data) return null;
  return { supabase, userId: auth.user.id };
}

export type GrowthAdminView =
  | { status: "forbidden" }
  | { status: "ok"; batch: RegionalGrowthRow[]; aiConfigured: boolean };

/** The newest pending batch, or the newest approved one when nothing is waiting. */
export async function getGrowthAdminViewAction(): Promise<GrowthAdminView> {
  const admin = await adminClient();
  if (!admin) return { status: "forbidden" };
  const { data, error } = await admin.supabase.from("regional_grass_growth").select(REGIONAL_GROWTH_COLUMNS)
    .neq("status", "rejected").order("extracted_at", { ascending: false }).limit(200);
  if (error) throw error;
  const rows = (data ?? []).map(toRegionalRow);
  const pending = rows.find((r) => r.status === "pending");
  const batchId = pending?.batchId ?? rows[0]?.batchId;
  const batch = rows.filter((r) => r.batchId === batchId).sort((a, b) => a.county.localeCompare(b.county));
  return { status: "ok", batch, aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY) };
}

export async function fetchTeagascGrowthNowAction(): Promise<ExtractionOutcome | { status: "forbidden" }> {
  const admin = await adminClient();
  if (!admin) return { status: "forbidden" };
  return extractLatestMostBatch(admin.supabase);
}

export async function reviewGrowthBatchAction(
  batchId: string,
  decision: "approve" | "reject",
  edits: Array<{ id: string; growth: number }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID.test(String(batchId)) || !["approve", "reject"].includes(decision) || !Array.isArray(edits) || edits.length > 60) return { ok: false, error: "Invalid request." };
  const admin = await adminClient();
  if (!admin) return { ok: false, error: "Admins only." };
  for (const e of edits) {
    if (!UUID.test(String(e.id)) || !Number.isFinite(e.growth) || e.growth < 0 || e.growth > 200) return { ok: false, error: "Each figure must be between 0 and 200 kg DM/ha/day." };
  }
  const reviewedAt = new Date().toISOString();
  try {
    for (const e of edits) {
      const { error } = await admin.supabase.from("regional_grass_growth").update({ growth_kg_dm_ha_day: e.growth })
        .eq("id", e.id).eq("batch_id", batchId).eq("status", "pending");
      if (error) throw error;
    }
    const { error } = await admin.supabase.from("regional_grass_growth")
      .update({ status: decision === "approve" ? "approved" : "rejected", reviewed_at: reviewedAt, reviewed_by: admin.userId })
      .eq("batch_id", batchId).eq("status", "pending");
    if (error) throw error;
    revalidatePath("/grass");
    revalidatePath("/today");
    return { ok: true };
  } catch (err) {
    console.error("[Regional growth] review failed", err);
    return { ok: false, error: "Couldn't save the review. Try again." };
  }
}
