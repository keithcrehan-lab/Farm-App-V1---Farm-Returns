/**
 * Server-only HTTP client for Met Éireann's point-forecast API
 * (`metno-wdb2ts/locationforecast`) — a DIFFERENT, separate product from
 * the EDR observations `edr-client.ts` ingests: this returns a forward
 * forecast (Harmonie NWP out to ~90h, then ECMWF out to 240h) for one
 * lat/long point, not historical station readings.
 *
 * ✅ LIVE, VERIFIED — 2026-08-24. Real endpoint, confirmed via the
 * dataset's own current documentation (data.gov.ie "Met Éireann forecast
 * API" resource, "API Changes" note): the OLD host
 * `metwdb-openaccess.ichec.ie` is being retired (2026-09-15) in favour of
 * `openaccess.pf.api.met.ie` — this client uses the new host directly, not
 * the one being deprecated. A real request against this farm's own
 * coordinates (lat=51.9, long=-8.4863) returned HTTP 200 with a real,
 * well-formed `weatherapi-0.4.xsd` XML document: two Harmonie/EC model
 * runs, 214 real `<time>` entries spanning now → +9 days, real rainfall
 * (0–9.5mm across the window), temperature, wind, humidity, pressure,
 * cloudiness and weather-symbol values. See `forecast-parser.ts` and
 * `docs/evidence-register.md` for the full schema write-up.
 *
 * Two real, load-bearing findings from that live request, not
 * documentation-only assumptions:
 *  1. HTTPS to this exact host times out (confirmed via a bare `curl -v`,
 *     10s timeout on port 443, independent of this app) — only HTTP:80
 *     answers. This client therefore uses `http://`, not `https://`, for
 *     this one host — a deliberate, evidence-based exception to using
 *     TLS everywhere else, not an oversight.
 *  2. The response's `Content-Type` header is `text/plain`, not
 *     `application/xml` or `text/xml`, even though the body is genuine
 *     XML — this client reads it as `.text()` and hands the raw string to
 *     `forecast-parser.ts`, rather than relying on `response.headers` or
 *     any content-type-based branching.
 *
 * ⚠️ Licensing: met.ie's Open Data documentation states it "have a custom
 * licence for certain datasets, principally 'live' forecast data" —
 * distinct from the CC-BY-4.0 licence covering most of its other open
 * datasets (including the EDR observations `edr-client.ts` uses). This
 * has NOT been fully reviewed in this pass (the licence document itself
 * wasn't fetched) — flagged here, per CLAUDE.md's "review licensing/API
 * terms before using external datasets commercially," for product/legal
 * review before this forecast is used commercially, not resolved by
 * assumption.
 */

import "server-only";

export const FORECAST_BASE_URL = "http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast";
export const FORECAST_DEFAULT_TIMEOUT_MS = 8_000;
export const FORECAST_DEFAULT_RETRIES = 2;
export const FORECAST_RETRY_BACKOFF_MS = 500;

export interface LocationForecastRequest {
  latitude: number;
  longitude: number;
  timeoutMs?: number;
  retries?: number;
}

export type LocationForecastFetchResult =
  | { status: "ok"; xmlText: string; retrievedAt: string; url: string }
  | { status: "unavailable"; reason: string; retrievedAt: string; url: string | null };

export function buildLocationForecastUrl(request: Pick<LocationForecastRequest, "latitude" | "longitude">): string {
  const { latitude, longitude } = request;
  return `${FORECAST_BASE_URL}?lat=${latitude}&long=${longitude}`;
}

/**
 * Fetches the raw forecast XML for one point, with a timeout and a small
 * number of retries on network-level failure only. Always resolves,
 * never throws — same contract as `edr-client.ts`'s
 * `fetchEdrObservations`, for the same reason: a caller should never have
 * to remember to catch this, and a failure must never be silently
 * swallowed into fabricated data.
 */
export async function fetchLocationForecast(request: LocationForecastRequest): Promise<LocationForecastFetchResult> {
  const { timeoutMs = FORECAST_DEFAULT_TIMEOUT_MS, retries = FORECAST_DEFAULT_RETRIES } = request;
  const url = buildLocationForecastUrl(request);

  let lastReason = "unknown error";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        // Server-side per-request cache — forecasts update roughly every
        // few hours (Harmonie reruns ~every 6h per the response's own
        // <model> metadata); a shorter revalidate than that is plenty
        // fresh without hammering the upstream API.
        next: { revalidate: 1800 },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        let bodyText = "";
        try {
          bodyText = await response.text();
        } catch {
          // Body unreadable — proceed without it, not fatal.
        }
        return {
          status: "unavailable",
          reason: `Forecast request failed: HTTP ${response.status} ${response.statusText}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ""}`,
          retrievedAt: new Date().toISOString(),
          url,
        };
      }

      const xmlText = await response.text();
      return { status: "ok", xmlText, retrievedAt: new Date().toISOString(), url };
    } catch (err) {
      clearTimeout(timeout);
      lastReason =
        err instanceof Error
          ? err.name === "AbortError"
            ? `Forecast request timed out after ${timeoutMs}ms`
            : err.message
          : String(err);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, FORECAST_RETRY_BACKOFF_MS * (attempt + 1)));
      }
    }
  }

  return { status: "unavailable", reason: lastReason, retrievedAt: new Date().toISOString(), url };
}
