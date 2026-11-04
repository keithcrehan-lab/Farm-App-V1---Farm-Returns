import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseFarmGrassGrowthForecastRow,
  type FarmGrassGrowthForecastRow,
} from "./grass-growth-forecasts";

const ROW: FarmGrassGrowthForecastRow = {
  id: "11111111-1111-4111-8111-111111111111",
  farm_id: "22222222-2222-4222-8222-222222222222",
  growth_rate_kg_dm_ha_day: "42.5",
  provider: "teagasc_most_regional",
  scope: "county",
  region_label: "Galway",
  valid_from: "2026-05-10T00:00:00.000Z",
  valid_to: "2026-05-17T23:59:59.000Z",
  issued_at: "2026-05-09T18:00:00.000Z",
  retrieved_at: "2026-05-09T18:05:00.000Z",
  source: "Teagasc MoSt regional forecast",
  source_url: "https://teagasc.ie/crops/grassland/current-grassland-management/",
  model_name: "MoSt Grass Growth",
  model_version: null,
  created_at: "2026-05-09T18:05:01.000Z",
};

describe("grass growth forecast persistence", () => {
  it("parses trusted forecast provenance without losing validity or region", () => {
    expect(parseFarmGrassGrowthForecastRow(ROW)).toMatchObject({
      growthRateKgDmHaDay: 42.5,
      provider: "teagasc_most_regional",
      scope: "county",
      regionLabel: "Galway",
      validFrom: ROW.valid_from,
      validTo: ROW.valid_to,
      source: ROW.source,
      modelName: "MoSt Grass Growth",
    });
  });

  it("rejects invalid validity windows and unsupported providers", () => {
    expect(() => parseFarmGrassGrowthForecastRow({ ...ROW, valid_to: "2026-05-01T00:00:00.000Z" })).toThrow();
    expect(() => parseFarmGrassGrowthForecastRow({ ...ROW, provider: "farmer_entered" })).toThrow();
  });

  it("keeps the trusted forecast table read-only for authenticated farmers", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/20261104084628_grass_growth_forecasts.sql"),
      "utf8",
    );
    expect(sql).toMatch(/grant\s+select\s+on\s+public\.farm_grass_growth_forecasts\s+to\s+authenticated/i);
    expect(sql).not.toMatch(/grant[^;]*\binsert\b[^;]*farm_grass_growth_forecasts/i);
    expect(sql).not.toMatch(/grant[^;]*\b(update|delete)\b[^;]*farm_grass_growth_forecasts/i);
    expect(sql).toMatch(/farm_grass_growth_forecasts_owner_select/i);
    expect(sql).not.toMatch(/security\s+definer/i);
  });
});
