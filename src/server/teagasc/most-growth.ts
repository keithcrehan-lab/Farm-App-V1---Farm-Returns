import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Weekly Teagasc MoSt county grass-growth predictions.
 *
 * The figures are published only as a map image on Teagasc's Current
 * Grassland Management page. This module finds that image, asks an
 * image-reading model to transcribe each county's figure, and stores the
 * result as a PENDING batch. Nothing reaches farmers until an admin has
 * compared the batch with the map and approved it.
 */

export const TEAGASC_GRASS_PAGE = "https://teagasc.ie/crops/grassland/current-grassland-management/";
export const MOST_SOURCE_LABEL = "Teagasc MoSt grass growth prediction (PastureBase Ireland / Grass10)";

export const IRISH_COUNTIES = [
  "Carlow", "Cavan", "Clare", "Cork", "Donegal", "Dublin", "Galway", "Kerry", "Kildare", "Kilkenny", "Laois", "Leitrim",
  "Limerick", "Longford", "Louth", "Mayo", "Meath", "Monaghan", "Offaly", "Roscommon", "Sligo", "Tipperary", "Waterford",
  "Westmeath", "Wexford", "Wicklow", "Antrim", "Armagh", "Down", "Fermanagh", "Derry", "Tyrone",
] as const;

/** Counties the farm-facing RoI county growth feature can serve. */
export const ROI_COUNTIES = IRISH_COUNTIES.filter((c) => !["Antrim", "Armagh", "Down", "Fermanagh", "Derry", "Tyrone"].includes(c));
const ROI_COUNTY_SET: ReadonlySet<string> = new Set(ROI_COUNTIES);

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "Co. Clare", "clare", "County Clare" → "Clare"; unknown → null. */
export function normaliseCounty(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/^(co\.?|county)\s+/i, "").replace(/londonderry/i, "Derry").trim().toLowerCase();
  return IRISH_COUNTIES.find((c) => c.toLowerCase() === cleaned) ?? null;
}

export interface MostMapLocation {
  imageUrl: string;
  validFrom: string; // YYYY-MM-DD
  validTo: string;
  caption: string;
}

/** Finds the MoSt prediction map and its start date in the page HTML. */
export function locateMostMap(html: string, pageUrl = TEAGASC_GRASS_PAGE): MostMapLocation | null {
  const captionMatch = /MoSt Grass Growth Predictions[^<]{0,160}/i.exec(html);
  if (!captionMatch) return null;
  const caption = captionMatch[0].replace(/\s+/g, " ").trim();
  const dateMatch = /from\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})/i.exec(caption);
  if (!dateMatch) return null;
  const month = MONTHS.indexOf(dateMatch[2].toLowerCase());
  if (month < 0) return null;
  const from = new Date(Date.UTC(Number(dateMatch[3]), month, Number(dateMatch[1])));
  const to = new Date(from.getTime() + 6 * 86_400_000);

  // The map is the nearest <img> to the caption (before or after it).
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => ({ tag: m[0], at: m.index ?? 0 }));
  const near = imgs
    .filter((i) => /wp-content\/uploads/i.test(i.tag) && !/logo/i.test(i.tag))
    .sort((a, b) => Math.abs(a.at - captionMatch.index) - Math.abs(b.at - captionMatch.index))[0];
  if (!near) return null;
  const srcset = /srcset="([^"]+)"/i.exec(near.tag)?.[1];
  let src = /src="([^"]+)"/i.exec(near.tag)?.[1] ?? "";
  if (srcset) {
    const largest = srcset.split(",").map((s) => s.trim().split(/\s+/)).map(([u, w]) => ({ u, w: parseInt(w ?? "0", 10) || 0 })).sort((a, b) => b.w - a.w)[0];
    if (largest?.u) src = largest.u;
  }
  src = src.replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp)$)/i, "");
  if (!src) return null;
  return {
    imageUrl: new URL(src, pageUrl).toString(),
    validFrom: from.toISOString().slice(0, 10),
    validTo: to.toISOString().slice(0, 10),
    caption,
  };
}

export interface CountyReading { county: string; growth: number; confidence: "high" | "low" }

/** Automatic publication is strictly opt-in and requires two matching reads
 * of every ROI county. This reduces transcription risk but does not make a
 * vision model infallible; the original map remains the audit source.
 */
export function verifyCountyMapPair(
  first: readonly CountyReading[],
  second: readonly CountyReading[],
  validFrom: string,
  validTo: string,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  if (today < validFrom || today > validTo) return false;
  const expectedCount = ROI_COUNTIES.length;
  const a = first.filter((reading) => ROI_COUNTY_SET.has(reading.county));
  const b = second.filter((reading) => ROI_COUNTY_SET.has(reading.county));
  if (a.length !== expectedCount || b.length !== expectedCount) return false;
  const byCounty = new Map(b.map((r) => [r.county, r]));
  if (byCounty.size !== expectedCount) return false;
  return a.every((r) => {
    const check = byCounty.get(r.county);
    // Keep zero on the review path until the grass forecast engine supports it.
    return r.confidence === "high" && check?.confidence === "high" &&
      r.growth > 0 && r.growth <= 200 && check.growth === r.growth;
  });
}

/** Strict parse of the model's JSON. Unknown counties and impossible values are dropped. */
export function parseCountyReadings(text: string): CountyReading[] {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return []; }
  const rows = (parsed as { counties?: unknown }).counties;
  if (!Array.isArray(rows)) return [];
  const out = new Map<string, CountyReading>();
  for (const row of rows) {
    const r = row as { county?: unknown; growth?: unknown; confidence?: unknown };
    const county = normaliseCounty(typeof r.county === "string" ? r.county : null);
    // A missing/null/blank number must never silently turn into 0.
    const value = r.growth;
    if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim()))) continue;
    const growth = typeof value === "number" ? value : Number(value.trim());
    if (!county || !Number.isFinite(growth) || growth < 0 || growth > 200) continue;
    const reading: CountyReading = { county, growth: Math.round(growth * 10) / 10, confidence: r.confidence === "high" ? "high" : "low" };
    if (out.has(county)) {
      // A duplicate county is ambiguous even if the two printed values agree.
      // Keep its first reading for admin review, but never auto-approve it.
      out.set(county, { ...out.get(county)!, confidence: "low" });
    } else {
      out.set(county, reading);
    }
  }
  return [...out.values()];
}

const PROMPT = `This is a dated Teagasc MoSt map of predicted grass growth in kg DM/ha/day.
Read the printed figure inside each Republic of Ireland county boundary, matching it to the county by location. Do not use map colours to guess a value, do not interpolate, and do not copy values between counties.
For any county whose figure or boundary is ambiguous, set confidence "low"; omit a county if its printed number cannot be read. One number per county, with no national mean and no fabricated counties.
Return JSON only: {"counties":[{"county":"Clare","growth":12,"confidence":"high"}]}`;

export async function readMapWithModel(image: ArrayBuffer, mediaType: string): Promise<CountyReading[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: Buffer.from(image).toString("base64") } },
          { type: "text", text: PROMPT },
        ],
      }],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Image reading failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return parseCountyReadings((body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n"));
}

export type ExtractionOutcome =
  | { status: "created"; batchId: string; validFrom: string; counties: number; autoPublished: boolean }
  | { status: "exists"; batchId: string; validFrom: string }
  | { status: "failed"; reason: string };

/** Fetches the page and map, reads it, and stores a pending batch. Idempotent per week. */
export async function extractLatestMostBatch(db: SupabaseClient): Promise<ExtractionOutcome> {
  try {
    const page = await fetch(TEAGASC_GRASS_PAGE, { headers: { "user-agent": "FarmReturn/1.0" }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!page.ok) return { status: "failed", reason: `Teagasc page returned HTTP ${page.status}` };
    const located = locateMostMap(await page.text());
    if (!located) return { status: "failed", reason: "Couldn't find the MoSt prediction map or its date on the Teagasc page. The page layout may have changed." };

    const existing = await db.from("regional_grass_growth").select("batch_id").eq("valid_from", located.validFrom).neq("status", "rejected").limit(1).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return { status: "exists", batchId: existing.data.batch_id as string, validFrom: located.validFrom };

    const img = await fetch(located.imageUrl, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!img.ok) return { status: "failed", reason: `Map image returned HTTP ${img.status}` };
    const mediaType = (img.headers.get("content-type") ?? "image/jpeg").split(";")[0];
    const imageBytes = await img.arrayBuffer();
    const readings = (await readMapWithModel(imageBytes, mediaType))
      .filter((r) => ROI_COUNTY_SET.has(r.county));
    // An incomplete extraction cannot silently become an approved feed.
    // Keep reasonably complete reads available for an administrator to correct.
    if (readings.length < 20) return { status: "failed", reason: `Only ${readings.length} of ${ROI_COUNTIES.length} Republic of Ireland counties could be read. Nothing was published.` };

    const optIn = process.env.REGIONAL_GROWTH_AUTO_PUBLISH === "true";
    const candidate = optIn && readings.length === ROI_COUNTIES.length && readings.every((r) => r.confidence === "high" && r.growth > 0);
    const secondRead = candidate ? (await readMapWithModel(imageBytes, mediaType)).filter((r) => ROI_COUNTY_SET.has(r.county)) : [];
    const autoPublished = Boolean(candidate && verifyCountyMapPair(readings, secondRead, located.validFrom, located.validTo));

    const batchId = crypto.randomUUID();
    const reviewedAt = autoPublished ? new Date().toISOString() : undefined;
    const { error } = await db.from("regional_grass_growth").insert(readings.map((r) => ({
      batch_id: batchId,
      county: r.county,
      growth_kg_dm_ha_day: r.growth,
      confidence: r.confidence,
      valid_from: located.validFrom,
      valid_to: located.validTo,
      status: autoPublished ? "approved" : "pending",
      ...(reviewedAt ? { reviewed_at: reviewedAt } : {}),
      source_url: TEAGASC_GRASS_PAGE,
      image_url: located.imageUrl,
      caption: located.caption.slice(0, 300),
    })));
    if (error) throw error;
    return { status: "created", batchId, validFrom: located.validFrom, counties: readings.length, autoPublished };
  } catch (err) {
    return { status: "failed", reason: err instanceof Error ? err.message : "Unknown error" };
  }
}
