/**
 * Provider-independent weather-observation schema + pure derived
 * calculations — Phase 5, the layer between `weather-stations.ts`
 * (station identity/selection) and any actual data provider
 * (`src/server/weather/`, currently Met Éireann's EDR API).
 *
 * Deliberately provider-agnostic: nothing here mentions Met Éireann,
 * EDR, or CoverageJSON. The parsing/mapping from a specific provider's
 * response shape into `WeatherObservation` lives entirely in
 * `src/server/weather/`, so this schema — and every agronomic rule built
 * on it (rainfall totals, and eventually `spreading.ts`'s hard stops) —
 * never needs to change if the upstream provider or API ever does.
 *
 * Per the user's explicit instruction: only populate fields the source
 * collection actually supplies. Use `null` for anything unavailable —
 * never substitute 0 or any other placeholder for a missing reading.
 */

export const WEATHER_OBSERVATION_SCHEMA_VERSION = "weather_observation_schema_v1.1.0";

// ---------------------------------------------------------------------------
// Freshness/status — LIVE / STALE / UNAVAILABLE / UNVERIFIED. Two different
// axes are deliberately folded into one enum here because callers only ever
// need one answer — "can I trust this observation right now" — but they
// mean different things:
//  - LIVE / STALE / UNAVAILABLE describe a genuine request outcome (data
//    exists and is fresh; data exists but is old; no data came back).
//  - UNVERIFIED means something categorically different: the underlying
//    Met Éireann integration has never completed a real, successful
//    request from any runtime that could reach it — so even a technical
//    "success" here couldn't yet be trusted as proof the pipeline works.
//    `src/server/weather/edr-client.ts` sets this specifically when a
//    fetch fails with this sandboxed session's own known network-egress
//    block, not a real upstream failure — see its `blockedByRuntime` flag.
// ---------------------------------------------------------------------------

export type ObservationFreshness = "LIVE" | "STALE" | "UNAVAILABLE" | "UNVERIFIED";

export interface WeatherObservation {
  stationId: string;
  stationName: string;
  /** ISO datetime the observation itself was recorded for (not when
   * Farm Return fetched it — see `retrievedAt`). */
  observedAt: string;
  rainfallMm: number | null;
  airTemperatureC: number | null;
  relativeHumidityPct: number | null;
  windSpeedMps: number | null;
  windDirectionDeg: number | null;
  pressureHPa: number | null;
  solarRadiationWM2: number | null;
  soilTemperatureC: number | null;
  grassTemperatureC: number | null;
  /** e.g. "Met Éireann EDR observations-swob-nrt-60min" — which
   * provider/collection this reading came from. */
  source: string;
  /** ISO datetime Farm Return retrieved this observation. */
  retrievedAt: string;
  /** This observation's own freshness *as of `retrievedAt`* — i.e. "was
   * this fresh when we got it," a fact fixed at parse time. Distinct from
   * calling `classifyObservationFreshness(observedAt, nowAtDisplayTime)`
   * later, which answers "is it still fresh right now" and can change
   * (LIVE -> STALE) purely with the passage of time without a new fetch. */
  dataStatus: ObservationFreshness;
}

/**
 * Default staleness threshold: Farm Return's own operational choice, not
 * a Met Éireann-published figure — 90 minutes gives one missed hourly
 * publication cycle of slack on the `observations-swob-nrt-60min`
 * collection before a reading is flagged stale. Revisit once the real
 * publication cadence/lag is confirmed against a live response.
 */
export const DEFAULT_STALE_AFTER_MINUTES = 90;

/**
 * Classifies a single observation's freshness against `now`. `null`
 * `observedAt` (no observation at all — a failed/empty fetch) is always
 * UNAVAILABLE. A future `observedAt` (clock skew or bad data) is also
 * treated as UNAVAILABLE rather than trusted as LIVE. Never returns
 * UNVERIFIED — that status describes the integration, not a timestamp,
 * and is set explicitly by the caller (`weather-service.ts`) instead.
 */
export function classifyObservationFreshness(
  observedAt: string | null,
  now: Date,
  staleAfterMinutes: number = DEFAULT_STALE_AFTER_MINUTES,
): "LIVE" | "STALE" | "UNAVAILABLE" {
  if (!observedAt) return "UNAVAILABLE";
  const ageMinutes = (now.getTime() - new Date(observedAt).getTime()) / 60_000;
  if (!Number.isFinite(ageMinutes) || ageMinutes < 0) return "UNAVAILABLE";
  return ageMinutes <= staleAfterMinutes ? "LIVE" : "STALE";
}

// ---------------------------------------------------------------------------
// Rolling rainfall totals — the first consumer named by the user, since it
// feeds slurry/fertiliser spreading suitability, trafficability, grazing
// and silage-cutting conditions, and wet-ground warnings.
// ---------------------------------------------------------------------------

export const ROLLING_RAINFALL_WINDOW_HOURS = [1, 6, 12, 24, 48, 72, 168] as const;

export interface RollingRainfallWindow {
  windowHours: number;
  /** Sum of real observed rainfall in this window, in mm. `null` — not
   * 0 — whenever the window isn't fully covered by real hourly
   * observations, per "never substitute zero for unavailable weather
   * data": a partial sum would understate true rainfall, so an
   * incomplete window reports no total at all rather than a
   * misleadingly low one. Same fact as `complete` below, kept as two
   * fields because `totalMm: null` alone doesn't distinguish "genuinely
   * zero rainfall, fully observed" from "not observed." */
  totalMm: number | null;
  complete: boolean;
  observationCount: number;
  /** Assumes ~hourly observations (the `-60min` collection's cadence) —
   * one expected reading per window hour. Revisit if a different-cadence
   * collection is ever used. */
  expectedObservationCount: number;
  /** ISO bounds of the window this total covers, so a total can always be
   * traced back to the exact period it summarises. */
  windowStart: string;
  windowEnd: string;
  /** Which station and source these observations came from, and when
   * Farm Return retrieved them — every total is traceable, never a bare
   * number with no provenance. */
  stationId: string;
  source: string;
  retrievedAt: string;
}

export interface RollingRainfallContext {
  stationId: string;
  source: string;
  retrievedAt: string;
}

/**
 * Real rolling rainfall totals over the windows above, computed purely
 * from the `rainfallMm` values already present in `observations` — never
 * from a model or an assumption. `asOf` anchors the windows (usually the
 * latest observation's own timestamp, but passed explicitly so this stays
 * a pure function). `context` attaches full provenance to every window so
 * a total is never presented as a bare, unsourced number.
 */
export function calculateRollingRainfallTotals(
  observations: WeatherObservation[],
  asOf: Date,
  context: RollingRainfallContext,
): RollingRainfallWindow[] {
  return ROLLING_RAINFALL_WINDOW_HOURS.map((windowHours) => {
    const windowStartMs = asOf.getTime() - windowHours * 60 * 60 * 1000;
    const inWindow = observations.filter((obs) => {
      const t = new Date(obs.observedAt).getTime();
      return t > windowStartMs && t <= asOf.getTime();
    });
    const withRainfall = inWindow.filter((obs) => obs.rainfallMm !== null);
    const expectedObservationCount = windowHours;
    const noGaps = inWindow.length > 0 && withRainfall.length === inWindow.length;
    const sufficientCoverage = inWindow.length >= expectedObservationCount;
    const complete = noGaps && sufficientCoverage;
    return {
      windowHours,
      totalMm: complete ? round1(withRainfall.reduce((sum, obs) => sum + (obs.rainfallMm ?? 0), 0)) : null,
      complete,
      observationCount: inWindow.length,
      expectedObservationCount,
      windowStart: new Date(windowStartMs).toISOString(),
      windowEnd: asOf.toISOString(),
      stationId: context.stationId,
      source: context.source,
      retrievedAt: context.retrievedAt,
    };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
