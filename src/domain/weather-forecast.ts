/**
 * Provider-independent forecast aggregation — pure derived calculations
 * over `ForecastPoint[]` (src/server/weather/forecast-parser.ts's schema),
 * the forecast-side counterpart to `weather-observations.ts`'s
 * `calculateRollingRainfallTotals`.
 *
 * Deliberately provider-agnostic and deliberately NOT an agronomic engine:
 * everything here is a plain arithmetic/statistical summary of real
 * forecast numbers (totals, min/max, day grouping) — no rainfall
 * threshold, runoff-risk rule, trafficability judgement or spreading
 * suitability is computed anywhere in this file. Per CLAUDE.md, that kind
 * of interpretation only belongs in a versioned domain module once a real
 * source backs it (see spreading.ts's own doc comment on why the 0-100
 * composite score isn't implemented there).
 *
 * Same non-negotiable rule as `calculateRollingRainfallTotals`: a rainfall
 * total is only ever reported when the forecast windows that make it up
 * fully and contiguously cover the requested period. An incomplete period
 * reports `totalMm: null` and `complete: false` — never a partial sum that
 * would understate real rainfall.
 */

import type { ForecastPoint } from "@/server/weather/forecast-parser";

export const WEATHER_FORECAST_AGGREGATION_VERSION = "weather_forecast_aggregation_v1.0.0";

/** Ireland's own timezone — used only to bucket forecast instants into the
 * calendar days a farmer actually experiences (so "today" doesn't shift by
 * an hour depending on server timezone), never to alter any numeric value. */
export const FARM_TIMEZONE = "Europe/Dublin";

const localDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: FARM_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const localDayLabelFormatter = new Intl.DateTimeFormat("en-IE", {
  timeZone: FARM_TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** YYYY-MM-DD in `FARM_TIMEZONE`, correctly handling the Europe/Dublin
 * summer-time transition via `Intl` rather than a manual UTC offset. */
export function localDateKey(iso: string): string {
  return localDateFormatter.format(new Date(iso));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Rolling forecast rainfall totals (e.g. "next 24h", "next 3 days") —
// mirrors calculateRollingRainfallTotals's contiguous-coverage contract,
// but forward-looking and window-width-aware (a forecast window's real
// width varies with lead time — 1h out to ~90h, 3h to ~144h, 6h beyond —
// unlike an observation's fixed ~hourly cadence), so completeness here is
// judged from each window's own real [from, to) bounds, not a point count.
// ---------------------------------------------------------------------------

export interface ForecastRainfallTotal {
  hoursAhead: number;
  /** Sum of real forecast rainfall in this window, in mm. `null` — not 0
   * — whenever the windows available don't fully and contiguously cover
   * `[now, now + hoursAhead]`. */
  totalMm: number | null;
  complete: boolean;
  pointCount: number;
  windowStart: string;
  windowEnd: string;
  source: string;
  retrievedAt: string;
}

export function calculateForecastRainfallTotals(
  points: ForecastPoint[],
  now: Date,
  hoursAheadList: readonly number[],
  context: { source: string; retrievedAt: string },
): ForecastRainfallTotal[] {
  const windows = points
    .filter((p) => p.rainfallMm !== null && p.rainfallWindowStartIso !== null)
    .map((p) => ({
      startMs: new Date(p.rainfallWindowStartIso as string).getTime(),
      endMs: new Date(p.validAt).getTime(),
      mm: p.rainfallMm as number,
    }))
    .sort((a, b) => a.startMs - b.startMs);

  return hoursAheadList.map((hoursAhead) => {
    const nowMs = now.getTime();
    const targetEndMs = nowMs + hoursAhead * 60 * 60 * 1000;
    const inRange = windows.filter((w) => w.startMs >= nowMs && w.endMs <= targetEndMs);

    let complete = inRange.length > 0;
    if (complete) {
      if (inRange[0].startMs > nowMs) complete = false;
      for (let i = 1; i < inRange.length && complete; i++) {
        if (inRange[i].startMs !== inRange[i - 1].endMs) complete = false;
      }
      if (complete && inRange[inRange.length - 1].endMs < targetEndMs) complete = false;
    }

    return {
      hoursAhead,
      totalMm: complete ? round1(inRange.reduce((sum, w) => sum + w.mm, 0)) : null,
      complete,
      pointCount: inRange.length,
      windowStart: new Date(nowMs).toISOString(),
      windowEnd: new Date(targetEndMs).toISOString(),
      source: context.source,
      retrievedAt: context.retrievedAt,
    };
  });
}

// ---------------------------------------------------------------------------
// Whole-window extremes (temperature range, strongest wind) — plain min/max
// over whatever real points are present; never interpolated or estimated
// for a gap.
// ---------------------------------------------------------------------------

export interface ForecastTemperatureRange {
  minC: number;
  maxC: number;
  pointCount: number;
}

export function forecastTemperatureRange(points: ForecastPoint[]): ForecastTemperatureRange | null {
  const temps = points.map((p) => p.airTemperatureC).filter((t): t is number => t !== null);
  if (temps.length === 0) return null;
  return { minC: Math.min(...temps), maxC: Math.max(...temps), pointCount: temps.length };
}

export interface ForecastStrongestWind {
  speedMps: number;
  atIso: string;
}

export function strongestForecastWind(points: ForecastPoint[]): ForecastStrongestWind | null {
  let best: ForecastStrongestWind | null = null;
  for (const p of points) {
    if (p.windSpeedMps === null) continue;
    if (!best || p.windSpeedMps > best.speedMps) best = { speedMps: p.windSpeedMps, atIso: p.validAt };
  }
  return best;
}

// ---------------------------------------------------------------------------
// Daily summaries for the "9-Day Farm Forecast" card strip.
// ---------------------------------------------------------------------------

export interface ForecastDaySummary {
  /** YYYY-MM-DD, Europe/Dublin calendar day. */
  date: string;
  /** e.g. "Mon 25 Aug". */
  dayLabel: string;
  /** Min/max of whatever instant readings fall on this calendar day —
   * NOT a guaranteed true diurnal min/max: resolution is 1-hourly out to
   * ~90h but coarsens to 3-hourly/6-hourly further out, so a day near the
   * end of the 9-day window may summarise only 4 readings. `pointCount`
   * makes that visible rather than hiding it. */
  tempMinC: number | null;
  tempMaxC: number | null;
  maxWindSpeedMps: number | null;
  maxWindGustMps: number | null;
  /** Wind direction (degrees, meteorological convention — direction the
   * wind blows FROM) from the instant reading closest to local midday
   * that day — the same "headline snapshot" convention as
   * `representativeSymbolId`, not an average or a dominant direction
   * (averaging circular degrees naively would produce a meaningless
   * number, e.g. (350+10)/2 = 180, the opposite direction). */
  windDirectionDeg: number | null;
  /** Sum of rainfall windows whose [from, to) both fall on this calendar
   * day. `null`/`complete: false` whenever any window is missing, or a
   * window straddles local midnight (excluded from both days rather than
   * split — splitting would assume a uniform rain rate the data doesn't
   * support) — see the module doc comment. */
  rainfallTotalMm: number | null;
  rainfallComplete: boolean;
  /** Met Éireann's own raw symbol id (e.g. "LightRainSun") for the window
   * ending closest to local midday that day — a presentational "what's
   * the headline condition today" pick, not a scientific classification.
   * `null` when no symbol-bearing window falls on this day. */
  representativeSymbolId: string | null;
  pointCount: number;
}

const MIDDAY_LOCAL_HOUR = 12;

function localHour(iso: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: FARM_TIMEZONE, hour: "2-digit", hour12: false }).format(new Date(iso)));
}

/**
 * Buckets `points` into up to `days` real Europe/Dublin calendar days
 * starting from `now`'s local day, each summarised independently. A day
 * with zero points isn't included (there's nothing to summarise) rather
 * than padded with a fabricated empty row.
 */
export function groupForecastPointsByLocalDay(points: ForecastPoint[], now: Date, days = 9): ForecastDaySummary[] {
  const startKey = localDateKey(now.toISOString());
  const dayKeys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const key = localDateKey(d.toISOString());
    if (!dayKeys.includes(key)) dayKeys.push(key);
  }
  // Guarantee the starting day is present even if the loop above (DST edge
  // case) produced a slightly different first key.
  if (!dayKeys.includes(startKey)) dayKeys.unshift(startKey);

  const byDay = new Map<string, ForecastPoint[]>();
  for (const p of points) {
    const key = localDateKey(p.validAt);
    if (!dayKeys.includes(key)) continue;
    const bucket = byDay.get(key) ?? [];
    bucket.push(p);
    byDay.set(key, bucket);
  }

  const rainfallWindows = points
    .filter((p) => p.rainfallMm !== null && p.rainfallWindowStartIso !== null)
    .map((p) => {
      const startMs = new Date(p.rainfallWindowStartIso as string).getTime();
      const endMs = new Date(p.validAt).getTime();
      return {
        startKey: localDateKey(new Date(startMs).toISOString()),
        // The window is a half-open [start, end) interval — a window
        // ending exactly at local midnight covers the day that's ending,
        // not the one that's about to start, even though `end` itself is
        // that next day's first instant. Judging by the last actually-
        // covered millisecond (not `end` itself) gets that case right
        // without changing the real duration/contiguity arithmetic below,
        // which still uses the exact startMs/endMs.
        endKey: localDateKey(new Date(endMs - 1).toISOString()),
        startMs,
        endMs,
        mm: p.rainfallMm as number,
        validAtIso: p.validAt,
      };
    });

  const summaries: ForecastDaySummary[] = [];
  for (const key of dayKeys) {
    const dayPoints = byDay.get(key);
    if (!dayPoints || dayPoints.length === 0) continue;

    const temps = dayPoints.map((p) => p.airTemperatureC).filter((t): t is number => t !== null);
    const winds = dayPoints.map((p) => p.windSpeedMps).filter((w): w is number => w !== null);
    const gusts = dayPoints.map((p) => p.windGustMps).filter((g): g is number => g !== null);

    // Rainfall: only windows entirely within this calendar day (start and
    // end both land on `key`) — a straddling window is excluded here and
    // marks the day incomplete, per the module doc comment.
    const allWindowsThisDay = rainfallWindows.filter((w) => w.startKey === key || w.endKey === key);
    const wholeWindowsThisDay = allWindowsThisDay.filter((w) => w.startKey === key && w.endKey === key);
    const straddling = allWindowsThisDay.length > wholeWindowsThisDay.length;

    let rainfallComplete = wholeWindowsThisDay.length > 0 && !straddling;
    if (rainfallComplete) {
      const sorted = [...wholeWindowsThisDay].sort((a, b) => a.startMs - b.startMs);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].startMs !== sorted[i - 1].endMs) rainfallComplete = false;
      }
      const coveredMs = sorted.reduce((sum, w) => sum + (w.endMs - w.startMs), 0);
      // A local calendar day is 24h except on the two Europe/Dublin DST
      // transition dates (23h/25h) — those are a known, documented
      // exception, not silently absorbed into "complete".
      if (coveredMs < 23.5 * 60 * 60 * 1000) rainfallComplete = false;
    }

    // Looked up from the full `points` list, not `dayPoints` — a window's
    // day-membership (fixed above) and its paired instant's own day (an
    // exact-midnight instant genuinely belongs to the next day) are two
    // different questions; the symbol lives on the instant, which may not
    // be in this day's `dayPoints` bucket even when its window is.
    const symbolCandidates = wholeWindowsThisDay
      .map((w) => points.find((p) => p.validAt === w.validAtIso))
      .filter((p): p is ForecastPoint => Boolean(p?.symbolId));
    const representative =
      symbolCandidates.length > 0
        ? symbolCandidates.reduce((best, p) =>
            Math.abs(localHour(p.validAt) - MIDDAY_LOCAL_HOUR) < Math.abs(localHour(best.validAt) - MIDDAY_LOCAL_HOUR) ? p : best,
          )
        : null;

    // Same "closest to local midday" pick as the symbol, but computed
    // independently over every instant this day owns (not just the ones
    // paired with a rainfall window) — wind direction is on every instant
    // reading, unlike rainfall/symbol which only exist on window entries.
    const middayPoint = dayPoints.reduce<ForecastPoint | null>(
      (best, p) => (!best || Math.abs(localHour(p.validAt) - MIDDAY_LOCAL_HOUR) < Math.abs(localHour(best.validAt) - MIDDAY_LOCAL_HOUR) ? p : best),
      null,
    );

    summaries.push({
      date: key,
      dayLabel: localDayLabelFormatter.format(new Date(dayPoints[0].validAt)),
      tempMinC: temps.length > 0 ? Math.min(...temps) : null,
      tempMaxC: temps.length > 0 ? Math.max(...temps) : null,
      maxWindSpeedMps: winds.length > 0 ? Math.max(...winds) : null,
      maxWindGustMps: gusts.length > 0 ? Math.max(...gusts) : null,
      windDirectionDeg: middayPoint?.windDirectionDeg ?? null,
      rainfallTotalMm: rainfallComplete ? round1(wholeWindowsThisDay.reduce((sum, w) => sum + w.mm, 0)) : null,
      rainfallComplete,
      representativeSymbolId: representative?.symbolId ?? null,
      pointCount: dayPoints.length,
    });
  }

  return summaries;
}
