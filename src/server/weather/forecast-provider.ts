/**
 * Forecast-data provider — composes `forecast-client.ts` +
 * `forecast-parser.ts` into one `ForecastProvider`, the forecast-side
 * counterpart to `weather-service.ts`'s observation pipeline.
 *
 * ✅ LIVE, VERIFIED — 2026-08-24 (see both modules' own doc comments and
 * `docs/evidence-register.md`). Met Éireann's NWP data is published two
 * ways: raw GRIB2 model files under `opendata2.met.ie/nwp/` (inspected —
 * no forecast-cycle directories were listed at the time of this check, a
 * real, recorded finding, not a parsing failure) and this point-forecast
 * XML API (`metno-wdb2ts/locationforecast`), which IS live and working.
 * This provider uses the latter — a per-field point query is exactly
 * what this app needs, not a raw model grid this app has no GRIB2 reader
 * for.
 *
 * Per the original instruction this file's doc comment recorded: do not
 * mix forecasts with observations — this stays a fully separate pipeline
 * from `weather-service.ts`/`edr-client.ts`/`edr-parser.ts`, sharing no
 * code with them beyond the common `ObservationFreshness` type.
 */

import "server-only";
import { classifyObservationFreshness, type ObservationFreshness } from "@/domain/weather-observations";
import { fetchLocationForecast } from "./forecast-client";
import { parseLocationForecastResponse, extractForecastModelRuns, type ForecastPoint } from "./forecast-parser";

export type { ForecastPoint };

export const FORECAST_SOURCE = "Met Éireann locationforecast (Harmonie/EC)";

/** The response's own real `<model name="harmonie">` run is the primary
 * short-range model (per the live capture — covers now to ~+54h at
 * 1-hour resolution before the EC tiers take over further out). Its
 * `nextrun` timestamp is Met Éireann's OWN stated schedule for when a
 * newer run supersedes this one — used directly for freshness rather
 * than a guessed staleness threshold (unlike the fixed
 * `DEFAULT_STALE_AFTER_MINUTES` `weather-observations.ts` uses for
 * hourly station readings, which don't carry an equivalent "next
 * update due" field of their own). */
const PRIMARY_MODEL_NAME = "harmonie";

export interface ForecastResult {
  status: ObservationFreshness;
  points: ForecastPoint[];
  /** The primary short-range model run's own issue time
   * (`<model termin=...>`) — when this forecast was actually generated,
   * not to be confused with any individual point's future `validAt`. */
  modelRunAt: string | null;
  reason?: string;
  retrievedAt: string;
}

export interface ForecastProvider {
  getForecastForField(entity: { centroid: [number, number] }): Promise<ForecastResult>;
}

function unavailable(reason: string, retrievedAt: string, status: "UNAVAILABLE" = "UNAVAILABLE"): ForecastResult {
  return { status, points: [], modelRunAt: null, reason, retrievedAt };
}

/**
 * The only real implementation. Never throws — every failure mode (fetch
 * failure, unparseable body, no model metadata) resolves to a real
 * `ForecastResult` with a real `reason`, never fabricated points.
 */
export const meteireannLocationForecastProvider: ForecastProvider = {
  async getForecastForField(entity: { centroid: [number, number] }): Promise<ForecastResult> {
    const [longitude, latitude] = entity.centroid;
    const fetchResult = await fetchLocationForecast({ latitude, longitude });

    if (fetchResult.status === "unavailable") {
      return unavailable(fetchResult.reason, fetchResult.retrievedAt);
    }

    const { points } = parseLocationForecastResponse(fetchResult.xmlText, {
      source: FORECAST_SOURCE,
      retrievedAt: fetchResult.retrievedAt,
    });

    if (points.length === 0) {
      return unavailable("Forecast response parsed but contained no usable time points.", fetchResult.retrievedAt);
    }

    const modelRuns = extractForecastModelRuns(fetchResult.xmlText);
    const primary = modelRuns.find((m) => m.name === PRIMARY_MODEL_NAME) ?? modelRuns[0] ?? null;

    if (!primary?.termin) {
      // Real points exist, but we can't tell how fresh the run behind
      // them is — report the points with an honest UNAVAILABLE-for-
      // freshness status rather than guessing LIVE.
      return {
        status: "UNAVAILABLE",
        points,
        modelRunAt: null,
        reason: "Forecast parsed, but no model run-time metadata was found to assess freshness.",
        retrievedAt: fetchResult.retrievedAt,
      };
    }

    const now = new Date(fetchResult.retrievedAt);
    // nextRun is Met Éireann's own stated schedule for the next model
    // run — real evidence for staleness, not a guessed interval.
    const status: ObservationFreshness =
      primary.nextRun && now.getTime() >= new Date(primary.nextRun).getTime()
        ? "STALE"
        : classifyObservationFreshness(primary.termin, now, 24 * 60) === "UNAVAILABLE"
          ? "UNAVAILABLE"
          : "LIVE";

    return {
      status,
      points,
      modelRunAt: primary.termin,
      retrievedAt: fetchResult.retrievedAt,
    };
  },
};

/**
 * Safe fallback for any caller that hasn't opted into the real provider
 * yet, or for tests that want a guaranteed-UNAVAILABLE double. Always
 * returns UNAVAILABLE — honest behaviour, not a placeholder to be
 * quietly forgotten.
 */
export const notImplementedForecastProvider: ForecastProvider = {
  async getForecastForField() {
    return {
      status: "UNAVAILABLE",
      points: [],
      modelRunAt: null,
      reason: "This provider is a deliberate no-op stub — use meteireannLocationForecastProvider for real data.",
      retrievedAt: new Date().toISOString(),
    };
  },
};
