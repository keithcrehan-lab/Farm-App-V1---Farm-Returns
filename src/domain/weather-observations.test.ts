import { describe, expect, it } from "vitest";
import {
  DEFAULT_STALE_AFTER_MINUTES,
  calculateRollingRainfallTotals,
  classifyObservationFreshness,
  type ObservationFreshness,
  type WeatherObservation,
} from "./weather-observations";

const CONTEXT = { stationId: "0018", source: "test fixture", retrievedAt: "2026-08-24T12:00:00Z" };

function obs(observedAt: string, rainfallMm: number | null, dataStatus: ObservationFreshness = "LIVE"): WeatherObservation {
  return {
    stationId: "0018",
    stationName: "Athenry",
    observedAt,
    rainfallMm,
    airTemperatureC: null,
    relativeHumidityPct: null,
    windSpeedMps: null,
    windDirectionDeg: null,
    pressureHPa: null,
    solarRadiationWM2: null,
    soilTemperatureC: null,
    grassTemperatureC: null,
    source: "test fixture",
    retrievedAt: observedAt,
    dataStatus,
  };
}

describe("classifyObservationFreshness", () => {
  const now = new Date("2026-08-24T12:00:00Z");

  it("is UNAVAILABLE for a null observation (no data at all)", () => {
    expect(classifyObservationFreshness(null, now)).toBe("UNAVAILABLE");
  });

  it("is LIVE within the staleness threshold", () => {
    expect(classifyObservationFreshness("2026-08-24T11:00:00Z", now)).toBe("LIVE");
  });

  it("is exactly LIVE at the threshold boundary, STALE just past it", () => {
    const atThreshold = new Date(now.getTime() - DEFAULT_STALE_AFTER_MINUTES * 60_000).toISOString();
    const pastThreshold = new Date(now.getTime() - (DEFAULT_STALE_AFTER_MINUTES + 1) * 60_000).toISOString();
    expect(classifyObservationFreshness(atThreshold, now)).toBe("LIVE");
    expect(classifyObservationFreshness(pastThreshold, now)).toBe("STALE");
  });

  it("is STALE for an old observation", () => {
    expect(classifyObservationFreshness("2026-08-20T12:00:00Z", now)).toBe("STALE");
  });

  it("treats a future timestamp (clock skew) as UNAVAILABLE, not LIVE", () => {
    expect(classifyObservationFreshness("2026-08-24T13:00:00Z", now)).toBe("UNAVAILABLE");
  });

  it("respects a custom threshold", () => {
    expect(classifyObservationFreshness("2026-08-24T11:00:00Z", now, 30)).toBe("STALE");
  });

  it("never returns UNVERIFIED — that status describes the integration, set explicitly by callers", () => {
    const results = [
      classifyObservationFreshness(null, now),
      classifyObservationFreshness("2026-08-24T11:00:00Z", now),
      classifyObservationFreshness("2026-08-20T12:00:00Z", now),
    ];
    expect(results).not.toContain("UNVERIFIED");
  });
});

describe("calculateRollingRainfallTotals", () => {
  const asOf = new Date("2026-08-24T12:00:00Z");

  it("sums real hourly rainfall for a fully-covered window", () => {
    const observations: WeatherObservation[] = [
      obs("2026-08-24T10:00:00Z", 1.2),
      obs("2026-08-24T11:00:00Z", 0.5),
      obs("2026-08-24T12:00:00Z", 0.3),
    ];
    const totals = calculateRollingRainfallTotals(observations, asOf, CONTEXT);
    const oneHour = totals.find((t) => t.windowHours === 1)!;
    expect(oneHour.totalMm).toBeCloseTo(0.3, 5);
    expect(oneHour.complete).toBe(true);
    const sixHour = totals.find((t) => t.windowHours === 6)!;
    // Only 3 hourly readings exist inside a 6h window -> incomplete, not a
    // partial (understated) sum.
    expect(sixHour.totalMm).toBeNull();
    expect(sixHour.complete).toBe(false);
  });

  it("never substitutes zero for a gap — an incomplete window reports null, not a partial sum", () => {
    const observations: WeatherObservation[] = [
      obs("2026-08-24T10:00:00Z", 5), // real 5mm reading
      obs("2026-08-24T11:00:00Z", null), // a real gap in the feed
      obs("2026-08-24T12:00:00Z", 0.3),
    ];
    const totals = calculateRollingRainfallTotals(observations, asOf, CONTEXT);
    const oneHourWindow = totals.find((t) => t.windowHours === 1)!;
    expect(oneHourWindow.totalMm).toBeCloseTo(0.3, 5); // 1h window unaffected by the earlier gap
    // But any window whose coverage includes the null hour must not silently
    // treat that hour as 0mm.
  });

  it("returns null totals (not zero) with no observations at all", () => {
    const totals = calculateRollingRainfallTotals([], asOf, CONTEXT);
    for (const t of totals) {
      expect(t.totalMm).toBeNull();
      expect(t.complete).toBe(false);
      expect(t.observationCount).toBe(0);
    }
  });

  it("excludes observations outside the window boundary", () => {
    const observations: WeatherObservation[] = [
      obs("2026-08-24T12:00:00Z", 1), // exactly at asOf
      obs("2026-08-23T11:59:00Z", 100), // just over 24h before asOf
    ];
    const totals = calculateRollingRainfallTotals(observations, asOf, CONTEXT);
    const oneHour = totals.find((t) => t.windowHours === 1)!;
    expect(oneHour.observationCount).toBe(1);
    expect(oneHour.totalMm).toBeCloseTo(1, 5);
  });

  it("covers every window the user asked for: 1h, 6h, 12h, 24h, 48h, 72h, 7d", () => {
    const totals = calculateRollingRainfallTotals([], asOf, CONTEXT);
    expect(totals.map((t) => t.windowHours)).toEqual([1, 6, 12, 24, 48, 72, 168]);
  });

  it("attaches full provenance (station, source, retrieval time, exact window bounds) to every total", () => {
    const totals = calculateRollingRainfallTotals([], asOf, CONTEXT);
    const oneHour = totals.find((t) => t.windowHours === 1)!;
    expect(oneHour.stationId).toBe(CONTEXT.stationId);
    expect(oneHour.source).toBe(CONTEXT.source);
    expect(oneHour.retrievedAt).toBe(CONTEXT.retrievedAt);
    expect(oneHour.windowEnd).toBe(asOf.toISOString());
    expect(new Date(oneHour.windowStart).getTime()).toBe(asOf.getTime() - 1 * 60 * 60 * 1000);
  });
});
