/**
 * Forecast-data provider — interface only, deliberately not implemented.
 *
 * Met Éireann separately publishes numerical weather prediction (NWP)
 * data under `https://opendata2.met.ie/nwp/` — a different dataset from
 * the EDR observations this module's siblings (`edr-client.ts`,
 * `edr-parser.ts`, `weather-service.ts`) ingest. Per explicit
 * instruction: do not mix forecasts with observations, and do not build
 * assumptions about the exact forecast response schema until that NWP
 * dataset has actually been inspected — this environment cannot reach
 * `opendata2.met.ie` at all, so nothing about its shape is confirmed.
 *
 * This file exists so the eventual architecture — observed weather +
 * forecast weather + soil/field characteristics + farm operation →
 * suitability assessment — has a real seam to implement against, without
 * guessing what goes on the forecast side of it yet.
 */

import "server-only";
import type { ObservationFreshness } from "@/domain/weather-observations";

/** Provider-independent shape for a single forecast time-step — kept
 * intentionally minimal (only what every NWP forecast has: a valid time
 * and a rainfall figure) until Met Éireann's actual NWP response schema
 * is inspected and this can be extended for real, confirmed fields. */
export interface ForecastPoint {
  validAt: string;
  rainfallMm: number | null;
  source: string;
}

export interface ForecastResult {
  status: ObservationFreshness;
  points: ForecastPoint[];
  reason?: string;
  retrievedAt: string;
}

export interface ForecastProvider {
  getForecastForField(entity: { centroid: [number, number] }): Promise<ForecastResult>;
}

/**
 * The only implementation today. Always returns UNAVAILABLE — this is
 * the honest, correct behaviour until a real NWP provider is built
 * against a verified schema, not a placeholder to be quietly forgotten.
 */
export const notImplementedForecastProvider: ForecastProvider = {
  async getForecastForField() {
    return {
      status: "UNAVAILABLE",
      points: [],
      reason:
        "Forecast ingestion is not implemented — Met Éireann's NWP dataset schema (opendata2.met.ie/nwp/) has not been inspected/verified.",
      retrievedAt: new Date().toISOString(),
    };
  },
};
