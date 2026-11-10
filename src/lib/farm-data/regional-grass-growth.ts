import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { FarmGrassGrowthForecast, FarmGrassGrowthObservation } from "@/domain/grass-management";
import { MOST_SOURCE_LABEL, normaliseCounty } from "@/server/teagasc/most-growth";

export interface RegionalGrowthRow {
  id: string;
  batchId: string;
  county: string;
  growthKgDmHaDay: number;
  confidence: "high" | "low" | null;
  validFrom: string;
  validTo: string;
  status: "pending" | "approved" | "rejected";
  sourceUrl: string;
  imageUrl: string | null;
  caption: string | null;
  extractedAt: string;
}

const COLUMNS = "id,batch_id,county,growth_kg_dm_ha_day,confidence,valid_from,valid_to,status,source_url,image_url,caption,extracted_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toRegionalRow = (r: any): RegionalGrowthRow => ({
  id: r.id,
  batchId: r.batch_id,
  county: r.county,
  growthKgDmHaDay: Number(r.growth_kg_dm_ha_day),
  confidence: r.confidence,
  validFrom: r.valid_from,
  validTo: r.valid_to,
  status: r.status,
  sourceUrl: r.source_url,
  imageUrl: r.image_url,
  caption: r.caption,
  extractedAt: r.extracted_at,
});

export const REGIONAL_GROWTH_COLUMNS = COLUMNS;

/** Latest approved county figure that is current or at most 14 days old. */
export async function latestApprovedCountyGrowth(countyRaw: string | null | undefined): Promise<RegionalGrowthRow | null> {
  const county = normaliseCounty(countyRaw);
  if (!county) return null;
  const supabase = await createClient();
  const oldest = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from("regional_grass_growth").select(COLUMNS)
    .eq("county", county).eq("status", "approved").gte("valid_to", oldest)
    .order("valid_from", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? toRegionalRow(data) : null;
}

/**
 * The county figure in the shapes the grass engine already understands:
 * a forecast for the +3/+7 day projections and, only when the farm has no
 * recent growth of its own, a regional estimate for bringing covers forward.
 */
export function regionalGrowthEvidence(row: RegionalGrowthRow, farmId: string): { forecast: FarmGrassGrowthForecast | null; observation: FarmGrassGrowthObservation | null } {
  if (!(row.growthKgDmHaDay > 0)) return { forecast: null, observation: null };
  const validFrom = `${row.validFrom}T00:00:00.000Z`;
  const validTo = `${row.validTo}T23:59:59.000Z`;
  const source = `${MOST_SOURCE_LABEL}, Co. ${row.county}, week from ${row.validFrom}`;
  return {
    forecast: {
      id: row.id,
      farmId,
      growthRateKgDmHaDay: row.growthKgDmHaDay,
      provider: "teagasc_most_regional",
      scope: "county",
      regionLabel: `Co. ${row.county}`,
      validFrom,
      validTo,
      issuedAt: validFrom,
      retrievedAt: row.extractedAt,
      source,
      sourceUrl: row.sourceUrl,
      modelName: "Teagasc MoSt",
    },
    observation: {
      id: row.id,
      farmId,
      growthRateKgDmHaDay: row.growthKgDmHaDay,
      origin: "regional_estimate",
      observedAt: validFrom,
      source,
    },
  };
}
