"use server";

import { revalidatePath } from "next/cache";
import { getRegionalGrassAdminClient } from "@/lib/farm-data/regional-grass-admin";
import { REGIONAL_GROWTH_COLUMNS, toRegionalRow, type RegionalGrowthRow } from "@/lib/farm-data/regional-grass-growth";
import { extractLatestMostBatch, locateMostMap, normaliseCounty, TEAGASC_GRASS_PAGE, type ExtractionOutcome, type MostMapLocation } from "@/server/teagasc/most-growth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const adminClient = getRegionalGrassAdminClient;

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

export type LatestMapView = { status: "forbidden" } | { status: "ok"; map: MostMapLocation | null; reason?: string };

/** Finds this week's MoSt map on the Teagasc page (no AI involved). */
export async function getLatestMostMapAction(): Promise<LatestMapView> {
  const admin = await adminClient();
  if (!admin) return { status: "forbidden" };
  try {
    const page = await fetch(TEAGASC_GRASS_PAGE, { headers: { "user-agent": "FarmReturn/1.0" }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!page.ok) return { status: "ok", map: null, reason: `The Teagasc page returned HTTP ${page.status}.` };
    const map = locateMostMap(await page.text());
    return map ? { status: "ok", map } : { status: "ok", map: null, reason: "Couldn't find the MoSt map or its date on the Teagasc page. The layout may have changed." };
  } catch {
    return { status: "ok", map: null, reason: "Couldn't reach the Teagasc page just now." };
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Publishes county figures typed in by an admin from the map. */
export async function publishManualGrowthAction(input: {
  validFrom: string;
  validTo: string;
  imageUrl: string;
  caption: string;
  figures: Array<{ county: string; growth: number }>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await adminClient();
  if (!admin) return { ok: false, error: "Admins only." };
  if (!input || !ISO_DATE.test(input.validFrom) || !ISO_DATE.test(input.validTo) || input.validTo < input.validFrom) return { ok: false, error: "The map's week couldn't be read." };
  if (!Array.isArray(input.figures) || !input.figures.length || input.figures.length > 40) return { ok: false, error: "Type at least one county's figure." };
  const seen = new Set<string>();
  for (const f of input.figures) {
    const county = normaliseCounty(f.county);
    if (!county || seen.has(county)) return { ok: false, error: `Check the county "${f.county}".` };
    if (!Number.isFinite(f.growth) || f.growth < 0 || f.growth > 200) return { ok: false, error: `${county}: figures must be between 0 and 200 kg DM/ha/day.` };
    seen.add(county);
  }
  try {
    const existing = await admin.supabase.from("regional_grass_growth").select("id").eq("valid_from", input.validFrom).neq("status", "rejected").limit(1).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return { ok: false, error: "Figures for this week are already published." };
    const batchId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error } = await admin.supabase.from("regional_grass_growth").insert(input.figures.map((f) => ({
      batch_id: batchId,
      county: normaliseCounty(f.county),
      growth_kg_dm_ha_day: Math.round(f.growth * 10) / 10,
      confidence: "high",
      valid_from: input.validFrom,
      valid_to: input.validTo,
      status: "approved",
      source_url: TEAGASC_GRASS_PAGE,
      image_url: typeof input.imageUrl === "string" && input.imageUrl.startsWith("https://") ? input.imageUrl.slice(0, 500) : null,
      caption: typeof input.caption === "string" ? input.caption.slice(0, 300) : null,
      reviewed_at: now,
      reviewed_by: admin.userId,
    })));
    if (error) throw error;
    revalidatePath("/grass");
    revalidatePath("/today");
    return { ok: true };
  } catch (err) {
    console.error("[Regional growth] manual publish failed", err);
    return { ok: false, error: "Couldn't publish just now. Try again." };
  }
}
