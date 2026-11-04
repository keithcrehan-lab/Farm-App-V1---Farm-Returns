import "server-only";

import {
  isValidGrassGrowthKgDmHaDay,
  type FarmGrassGrowthForecast,
  type GrassGrowthForecastProvider,
  type GrassGrowthForecastScope,
} from "@/domain/grass-management";
import { createClient } from "@/lib/supabase/server";

const TABLE = "farm_grass_growth_forecasts";

export interface FarmGrassGrowthForecastRow {
  id: string;
  farm_id: string;
  growth_rate_kg_dm_ha_day: number | string;
  provider: string;
  scope: string;
  region_label: string | null;
  valid_from: string;
  valid_to: string;
  issued_at: string;
  retrieved_at: string;
  source: string;
  source_url: string | null;
  model_name: string | null;
  model_version: string | null;
  created_at: string;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${TABLE}: ${field} must be non-empty text`);
  return value;
}

function instant(value: unknown, field: string): string {
  const result = text(value, field);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`${TABLE}: ${field} must be a valid timestamp`);
  return result;
}

function provider(value: unknown): GrassGrowthForecastProvider {
  if (value === "teagasc_most_regional" || value === "external_api") return value;
  throw new Error(`${TABLE}: unsupported provider ${String(value)}`);
}

function scope(value: unknown): GrassGrowthForecastScope {
  if (value === "county" || value === "farm" || value === "national") return value;
  throw new Error(`${TABLE}: unsupported scope ${String(value)}`);
}

export function parseFarmGrassGrowthForecastRow(row: FarmGrassGrowthForecastRow): FarmGrassGrowthForecast {
  const rate = typeof row.growth_rate_kg_dm_ha_day === "number"
    ? row.growth_rate_kg_dm_ha_day
    : Number(row.growth_rate_kg_dm_ha_day);
  if (!isValidGrassGrowthKgDmHaDay(rate)) throw new Error(`${TABLE}: invalid growth rate for ${row.id}`);

  const validFrom = instant(row.valid_from, "valid_from");
  const validTo = instant(row.valid_to, "valid_to");
  if (Date.parse(validTo) < Date.parse(validFrom)) throw new Error(`${TABLE}: valid_to precedes valid_from for ${row.id}`);

  return {
    id: text(row.id, "id"),
    farmId: text(row.farm_id, "farm_id"),
    growthRateKgDmHaDay: rate,
    provider: provider(row.provider),
    scope: scope(row.scope),
    ...(row.region_label ? { regionLabel: row.region_label } : {}),
    validFrom,
    validTo,
    issuedAt: instant(row.issued_at, "issued_at"),
    retrievedAt: instant(row.retrieved_at, "retrieved_at"),
    source: text(row.source, "source"),
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    ...(row.model_name ? { modelName: row.model_name } : {}),
    ...(row.model_version ? { modelVersion: row.model_version } : {}),
    createdAt: instant(row.created_at, "created_at"),
  };
}

export async function listFarmGrassGrowthForecasts(farmId: string): Promise<FarmGrassGrowthForecast[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("farm_id", farmId)
    .order("issued_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as FarmGrassGrowthForecastRow[]).map(parseFarmGrassGrowthForecastRow);
}
