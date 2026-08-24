import { describe, expect, it } from "vitest";
import {
  calculateForecastRainfallTotals,
  forecastTemperatureRange,
  groupForecastPointsByLocalDay,
  localDateKey,
  strongestForecastWind,
} from "./weather-forecast";
import type { ForecastPoint } from "@/server/weather/forecast-parser";

function point(overrides: Partial<ForecastPoint>): ForecastPoint {
  return {
    validAt: "2026-08-25T12:00:00Z",
    airTemperatureC: null,
    windSpeedMps: null,
    windDirectionDeg: null,
    windGustMps: null,
    humidityPct: null,
    pressureHPa: null,
    cloudinessPct: null,
    rainfallMm: null,
    rainfallWindowStartIso: null,
    symbolId: null,
    source: "test",
    retrievedAt: "2026-08-25T12:00:00Z",
    ...overrides,
  };
}

/** 24 real hourly points covering one full Europe/Dublin (BST, UTC+1)
 * calendar day, 2026-08-25 local — window end at each local hour 01:00
 * through 24:00 (=00:00 the 26th). Temperature/wind vary per hour so
 * min/max are unambiguous; rainfall/symbol only set where a test needs it. */
function fullLocalDayPoints(opts: { rainfallMm?: (hour: number) => number | null; symbol?: (hour: number) => string | null } = {}): ForecastPoint[] {
  const localMidnightUtcMs = Date.UTC(2026, 7, 24, 23, 0, 0); // Aug 25 00:00 local (BST) = Aug 24 23:00Z
  const points: ForecastPoint[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const startMs = localMidnightUtcMs + hour * 3_600_000;
    const endMs = startMs + 3_600_000;
    const rainfallMm = opts.rainfallMm ? opts.rainfallMm(hour) : 0.1;
    points.push(
      point({
        validAt: new Date(endMs).toISOString(),
        airTemperatureC: 10 + hour * 0.5,
        windSpeedMps: 2 + (hour % 5),
        rainfallMm,
        rainfallWindowStartIso: rainfallMm !== null ? new Date(startMs).toISOString() : null,
        symbolId: opts.symbol ? opts.symbol(hour) : null,
      }),
    );
  }
  return points;
}

describe("localDateKey", () => {
  it("resolves a UTC instant to its Europe/Dublin (BST) calendar day", () => {
    // 2026-08-24T23:30:00Z is 2026-08-25T00:30 local during BST.
    expect(localDateKey("2026-08-24T23:30:00Z")).toBe("2026-08-25");
  });
});

describe("calculateForecastRainfallTotals", () => {
  const now = new Date("2026-08-25T00:00:00Z");

  it("sums a fully, contiguously covered window and marks it complete", () => {
    const points: ForecastPoint[] = [
      point({ validAt: "2026-08-25T01:00:00Z", rainfallWindowStartIso: "2026-08-25T00:00:00Z", rainfallMm: 0.5 }),
      point({ validAt: "2026-08-25T02:00:00Z", rainfallWindowStartIso: "2026-08-25T01:00:00Z", rainfallMm: 0.3 }),
    ];
    const [result] = calculateForecastRainfallTotals(points, now, [2], { source: "test", retrievedAt: now.toISOString() });
    expect(result.complete).toBe(true);
    expect(result.totalMm).toBe(0.8);
    expect(result.pointCount).toBe(2);
  });

  it("reports null/incomplete when there is a gap between windows", () => {
    const points: ForecastPoint[] = [
      point({ validAt: "2026-08-25T01:00:00Z", rainfallWindowStartIso: "2026-08-25T00:00:00Z", rainfallMm: 0.5 }),
      // gap: next window starts at 03:00, not 01:00
      point({ validAt: "2026-08-25T04:00:00Z", rainfallWindowStartIso: "2026-08-25T03:00:00Z", rainfallMm: 0.3 }),
    ];
    const [result] = calculateForecastRainfallTotals(points, now, [4], { source: "test", retrievedAt: now.toISOString() });
    expect(result.complete).toBe(false);
    expect(result.totalMm).toBeNull();
  });

  it("reports null/incomplete when coverage doesn't reach the requested horizon", () => {
    const points: ForecastPoint[] = [point({ validAt: "2026-08-25T01:00:00Z", rainfallWindowStartIso: "2026-08-25T00:00:00Z", rainfallMm: 0.5 })];
    const [result] = calculateForecastRainfallTotals(points, now, [24], { source: "test", retrievedAt: now.toISOString() });
    expect(result.complete).toBe(false);
    expect(result.totalMm).toBeNull();
  });

  it("never substitutes 0 for an incomplete total", () => {
    const [result] = calculateForecastRainfallTotals([], now, [24], { source: "test", retrievedAt: now.toISOString() });
    expect(result.totalMm).toBeNull();
    expect(result.complete).toBe(false);
  });

  it("computes multiple horizons independently in one call", () => {
    const points = fullLocalDayPoints();
    const results = calculateForecastRainfallTotals(points, new Date("2026-08-24T23:00:00Z"), [24, 48], {
      source: "test",
      retrievedAt: "2026-08-25T00:00:00Z",
    });
    expect(results.map((r) => r.hoursAhead)).toEqual([24, 48]);
    expect(results[0].complete).toBe(true); // 24h fully covered by the 24 hourly points
    expect(results[1].complete).toBe(false); // 48h is not — only one day of points supplied
  });
});

describe("forecastTemperatureRange", () => {
  it("returns the real min/max across available readings", () => {
    const points = [point({ airTemperatureC: 8 }), point({ airTemperatureC: 15 }), point({ airTemperatureC: 11 })];
    expect(forecastTemperatureRange(points)).toEqual({ minC: 8, maxC: 15, pointCount: 3 });
  });

  it("returns null when no point has a temperature", () => {
    expect(forecastTemperatureRange([point({}), point({})])).toBeNull();
  });

  it("ignores null readings rather than treating them as 0", () => {
    const points = [point({ airTemperatureC: null }), point({ airTemperatureC: 9 })];
    expect(forecastTemperatureRange(points)).toEqual({ minC: 9, maxC: 9, pointCount: 1 });
  });
});

describe("strongestForecastWind", () => {
  it("finds the real maximum wind speed and its timestamp", () => {
    const points = [
      point({ validAt: "2026-08-25T01:00:00Z", windSpeedMps: 5 }),
      point({ validAt: "2026-08-25T02:00:00Z", windSpeedMps: 12 }),
      point({ validAt: "2026-08-25T03:00:00Z", windSpeedMps: 7 }),
    ];
    expect(strongestForecastWind(points)).toEqual({ speedMps: 12, atIso: "2026-08-25T02:00:00Z" });
  });

  it("returns null when no point has a wind reading", () => {
    expect(strongestForecastWind([point({}), point({})])).toBeNull();
  });
});

describe("groupForecastPointsByLocalDay", () => {
  it("buckets points onto their real Europe/Dublin calendar day", () => {
    const points = fullLocalDayPoints();
    const now = new Date("2026-08-24T23:00:00Z"); // 2026-08-25T00:00 local
    const [day] = groupForecastPointsByLocalDay(points, now, 1);
    expect(day.date).toBe("2026-08-25");
    // 23, not 24: the hour-23 point's instant is timestamped exactly at
    // local 00:00 the 26th (window [23:00,24:00) 's own `to`) — that
    // instant genuinely belongs to the 26th, even though the rainfall it
    // reports covers the 25th's last hour (see the rainfall test below).
    expect(day.pointCount).toBe(23);
  });

  it("reports real min/max temperature and max wind for the day", () => {
    const points = fullLocalDayPoints();
    const now = new Date("2026-08-24T23:00:00Z");
    const [day] = groupForecastPointsByLocalDay(points, now, 1);
    expect(day.tempMinC).toBe(10); // hour 0: 10 + 0*0.5
    expect(day.tempMaxC).toBe(21); // hour 22 (the last instant this day owns): 10 + 22*0.5
    expect(day.maxWindSpeedMps).toBe(6); // 2 + (hour % 5), max at hour%5===4 => 6
  });

  it("sums a fully-covered day's rainfall and marks it complete", () => {
    const points = fullLocalDayPoints({ rainfallMm: () => 0.2 });
    const now = new Date("2026-08-24T23:00:00Z");
    const [day] = groupForecastPointsByLocalDay(points, now, 1);
    expect(day.rainfallComplete).toBe(true);
    expect(day.rainfallTotalMm).toBe(4.8); // 24 * 0.2
  });

  it("marks a day incomplete (never a partial sum) when an hour's rainfall is missing", () => {
    const points = fullLocalDayPoints({ rainfallMm: (hour) => (hour === 10 ? null : 0.2) });
    const now = new Date("2026-08-24T23:00:00Z");
    const [day] = groupForecastPointsByLocalDay(points, now, 1);
    expect(day.rainfallComplete).toBe(false);
    expect(day.rainfallTotalMm).toBeNull();
  });

  it("excludes a window straddling local midnight from both days rather than splitting it", () => {
    // Window from 2026-08-24T22:30Z to 2026-08-24T23:30Z = local 23:30 Aug24 -> 00:30 Aug25: straddles midnight.
    const straddler = point({
      validAt: "2026-08-24T23:30:00Z",
      rainfallWindowStartIso: "2026-08-24T22:30:00Z",
      rainfallMm: 5,
    });
    const points = [...fullLocalDayPoints({ rainfallMm: () => 0.2 }), straddler];
    const now = new Date("2026-08-24T22:00:00Z");
    const days = groupForecastPointsByLocalDay(points, now, 2);
    const aug25 = days.find((d) => d.date === "2026-08-25")!;
    // The straddler's rain (some of which fell in Aug25's first 30
    // minutes) is never added to Aug25's total, and never split between
    // the two days by assuming a uniform rain rate — but that also means
    // Aug25 can no longer claim a *complete* total (a real 30 minutes of
    // its day is unaccounted for), so it correctly reports null/incomplete
    // rather than a confident-looking 4.8mm that quietly omits it.
    expect(aug25.rainfallComplete).toBe(false);
    expect(aug25.rainfallTotalMm).toBeNull();
  });

  it("picks the symbol from the window closest to local midday as the day's representative", () => {
    const points = fullLocalDayPoints({
      symbol: (hour) => (hour === 11 ? "Sun" : hour === 14 ? "Rain" : null), // window ending local 12:00 vs local 15:00
    });
    const now = new Date("2026-08-24T23:00:00Z");
    const [day] = groupForecastPointsByLocalDay(points, now, 1);
    expect(day.representativeSymbolId).toBe("Sun");
  });

  it("omits a day with zero points rather than padding it in", () => {
    const days = groupForecastPointsByLocalDay([], new Date("2026-08-25T00:00:00Z"), 9);
    expect(days).toEqual([]);
  });
});
