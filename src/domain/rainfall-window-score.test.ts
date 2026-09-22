import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WeatherForFieldResult } from "@/server/weather/weather-service";
import type { ForecastResult, ForecastPoint } from "@/server/weather/forecast-provider";
import {
  buildRainfallWindowScore,
  historicalSubscoreFor,
  forecastSubscoreFor,
  RAINFALL_WINDOW_SCORE_VERSION,
  RAINFALL_WINDOW_SCORE_INCOMPLETE_EVIDENCE,
  type BuildRainfallWindowScoreInput,
} from "./rainfall-window-score";

const MODULE_SOURCE = readFileSync(join(__dirname, "rainfall-window-score.ts"), "utf-8");

const fieldCentroid: [number, number] = [-8.785556, 53.289167];
const otherCentroid: [number, number] = [-8.48611, 51.8472];
const evaluatedAt = "2026-02-15T09:00:00.000Z";
const evaluatedAtMs = new Date(evaluatedAt).getTime();
const historicalWindowStart = new Date(evaluatedAtMs - 72 * 60 * 60 * 1000).toISOString();
const forecastWindowEnd = new Date(evaluatedAtMs + 48 * 60 * 60 * 1000).toISOString();

function baseInput(overrides: Partial<BuildRainfallWindowScoreInput> = {}): BuildRainfallWindowScoreInput {
  return {
    id: "score-1",
    opportunityRecordId: "opp-1",
    boundAssessmentId: "assess-1",
    evaluatedActionId: "action-1",
    fieldId: "field-1",
    fieldCentroid,
    evaluatedAt,
    rainfallObservation: liveObservation(),
    rainfallForecast: liveForecast(),
    ...overrides,
  };
}

function liveObservation(
  opts: Partial<{
    queriedCentroid: [number, number];
    totalMm: number;
    complete: boolean;
    observationCount: number;
    expectedObservationCount: number;
    windowEnd: string;
    status: "LIVE" | "STALE" | "UNAVAILABLE" | "UNVERIFIED";
    include72: boolean;
  }> = {},
): WeatherForFieldResult {
  const {
    queriedCentroid = fieldCentroid,
    totalMm = 0,
    complete = true,
    observationCount = 72,
    expectedObservationCount = 72,
    windowEnd = evaluatedAt,
    status = "LIVE",
    include72 = true,
  } = opts;
  return {
    status,
    queriedCentroid,
    station: { id: "athenry", canonicalName: "Athenry", edrStationId: "0018", distanceKm: 0 },
    nearestGeographicStation: { id: "athenry", canonicalName: "Athenry", edrStationId: "0018", distanceKm: 0 },
    fallbackUsed: false,
    observations: [],
    rollingRainfall: include72
      ? [
          {
            windowHours: 72,
            totalMm: complete ? totalMm : null,
            complete,
            observationCount,
            expectedObservationCount,
            windowStart: new Date(new Date(windowEnd).getTime() - 72 * 60 * 60 * 1000).toISOString(),
            windowEnd,
            stationId: "athenry",
            source: "Met Éireann EDR observations-swob-nrt-60min",
            retrievedAt: windowEnd,
          },
        ]
      : [],
    retrievedAt: windowEnd,
  };
}

function point(validAt: string, windowStartIso: string | null, rainfallMm: number | null): ForecastPoint {
  return {
    validAt,
    airTemperatureC: null,
    windSpeedMps: null,
    windDirectionDeg: null,
    windGustMps: null,
    humidityPct: null,
    pressureHPa: null,
    cloudinessPct: null,
    rainfallMm,
    rainfallWindowStartIso: windowStartIso,
    symbolId: null,
    source: "Met Éireann locationforecast (Harmonie/EC)",
    retrievedAt: evaluatedAt,
  };
}

/** 48 contiguous 1-hour points tiling exactly [evaluatedAt, evaluatedAt+48h), each carrying `mmPerHour`. */
function fullForecastPoints(mmPerHour: number): ForecastPoint[] {
  const points: ForecastPoint[] = [];
  for (let h = 1; h <= 48; h++) {
    const end = new Date(evaluatedAtMs + h * 60 * 60 * 1000).toISOString();
    const start = new Date(evaluatedAtMs + (h - 1) * 60 * 60 * 1000).toISOString();
    points.push(point(end, start, mmPerHour));
  }
  return points;
}

/** 48 contiguous 1-hour points tiling exactly [evaluatedAt, evaluatedAt+48h);
 * all `totalMm` concentrated on the final hour (exact, no float division —
 * distributing evenly via JS `/48` would bake float-precision error into
 * the fixture itself, which is a test-authoring concern, not something
 * production ever does since it only ever sums whatever exact values the
 * real API returns). */
function forecastPointsWithTotal(totalMm: number): ForecastPoint[] {
  const points = fullForecastPoints(0);
  points[points.length - 1] = point(points[points.length - 1].validAt, points[points.length - 1].rainfallWindowStartIso, totalMm);
  return points;
}

function liveForecast(
  opts: Partial<{ queriedCentroid: [number, number]; points: ForecastPoint[]; status: "LIVE" | "STALE" | "UNAVAILABLE"; totalMm: number }> = {},
): ForecastResult {
  const { queriedCentroid = fieldCentroid, status = "LIVE" } = opts;
  const points = opts.points ?? forecastPointsWithTotal(opts.totalMm ?? 0);
  return { status, queriedCentroid, points, modelRunAt: "2026-02-15T06:00:00.000Z", retrievedAt: evaluatedAt };
}

// ---------------------------------------------------------------------------
// 1. 0mm historical / 0mm forecast
// ---------------------------------------------------------------------------
describe("Rainfall Window Score v1", () => {
  it("1. 0mm historical / 0mm forecast → both subscores 100, final 100", () => {
    const a = buildRainfallWindowScore(baseInput({ rainfallObservation: liveObservation({ totalMm: 0 }), rainfallForecast: liveForecast({ totalMm: 0 }) }));
    expect(a.score.status).toBe("OK");
    if (a.score.status === "OK") {
      expect(a.score.value.historicalSubscore).toBe("100");
      expect(a.score.value.forecastSubscore).toBe("100");
      expect(a.score.value.finalScore).toBe("100");
    }
  });

  // ---------------------------------------------------------------------------
  // 2. The exact worked example — 8mm historical / 4mm forecast → 86.4
  // ---------------------------------------------------------------------------
  it("2. worked example: 8mm historical (subscore 81) + 4mm forecast (subscore 90) → exact 86.4", () => {
    const a = buildRainfallWindowScore(
      baseInput({ rainfallObservation: liveObservation({ totalMm: 8 }), rainfallForecast: liveForecast({ totalMm: 4 }) }),
    );
    expect(a.score.status).toBe("OK");
    if (a.score.status === "OK") {
      expect(a.score.value.historicalSubscore).toBe("81");
      expect(a.score.value.forecastSubscore).toBe("90");
      expect(a.score.value.finalScore).toBe("86.4");
      expect(a.score.value.modelVersion).toBe(RAINFALL_WINDOW_SCORE_VERSION);
    }
  });

  // ---------------------------------------------------------------------------
  // 3/4. heavy/dry combinations
  // ---------------------------------------------------------------------------
  it("3. heavy historical (35mm) / dry forecast (0mm) → final 65", () => {
    const a = buildRainfallWindowScore(
      baseInput({ rainfallObservation: liveObservation({ totalMm: 35 }), rainfallForecast: liveForecast({ totalMm: 0 }) }),
    );
    if (a.score.status === "OK") {
      expect(a.score.value.historicalSubscore).toBe("12.5");
      expect(a.score.value.forecastSubscore).toBe("100");
      expect(a.score.value.finalScore).toBe("65");
    } else throw new Error("expected OK");
  });

  it("4. dry historical (0mm) / heavy forecast (25mm) → final 53.5", () => {
    const a = buildRainfallWindowScore(
      baseInput({ rainfallObservation: liveObservation({ totalMm: 0 }), rainfallForecast: liveForecast({ totalMm: 25 }) }),
    );
    if (a.score.status === "OK") {
      expect(a.score.value.historicalSubscore).toBe("100");
      expect(a.score.value.forecastSubscore).toBe("22.5");
      expect(a.score.value.finalScore).toBe("53.5");
    } else throw new Error("expected OK");
  });

  // ---------------------------------------------------------------------------
  // 5/6. >=40mm anchors
  // ---------------------------------------------------------------------------
  it("5. historical >= 40mm → subscore 0", () => {
    expect(historicalSubscoreFor(new Decimal(45)).toString()).toBe("0");
    expect(historicalSubscoreFor(new Decimal(40)).toString()).toBe("0");
  });
  it("6. forecast >= 40mm → subscore 0", () => {
    expect(forecastSubscoreFor(new Decimal(50)).toString()).toBe("0");
    expect(forecastSubscoreFor(new Decimal(40)).toString()).toBe("0");
  });

  // ---------------------------------------------------------------------------
  // 7/8. Missing period → UNKNOWN
  // ---------------------------------------------------------------------------
  it("7. missing/incomplete historical period → score BLOCKED_INSUFFICIENT_EVIDENCE, never a partial number", () => {
    const a = buildRainfallWindowScore(baseInput({ rainfallObservation: liveObservation({ complete: false, observationCount: 40, expectedObservationCount: 72 }) }));
    expect(a.historicalEvidence.availability).toBe("UNKNOWN");
    expect(a.score.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
    if (a.score.status === "BLOCKED_INSUFFICIENT_EVIDENCE") {
      expect(a.score.reasonCode).toBe(RAINFALL_WINDOW_SCORE_INCOMPLETE_EVIDENCE);
    }
  });

  it("8. missing forecast period (a real gap in the middle) → score BLOCKED_INSUFFICIENT_EVIDENCE", () => {
    const points = fullForecastPoints(1).filter((p) => p.validAt !== new Date(evaluatedAtMs + 24 * 60 * 60 * 1000).toISOString());
    const a = buildRainfallWindowScore(baseInput({ rainfallForecast: liveForecast({ points }) }));
    expect(a.forecastEvidence.availability).toBe("UNKNOWN");
    expect(a.score.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  // ---------------------------------------------------------------------------
  // 9/10. Stale → UNKNOWN (brief §48 — stricter than Phase 11A's own
  // STALE-tolerant convention)
  // ---------------------------------------------------------------------------
  it("9. stale observation → historical UNKNOWN, never trusted as current", () => {
    const a = buildRainfallWindowScore(baseInput({ rainfallObservation: liveObservation({ status: "STALE" }) }));
    expect(a.historicalEvidence.availability).toBe("UNKNOWN");
    expect(a.historicalEvidence.reason).toMatch(/STALE/);
  });
  it("10. stale forecast → forecast UNKNOWN, never trusted as current", () => {
    const a = buildRainfallWindowScore(baseInput({ rainfallForecast: liveForecast({ status: "STALE" }) }));
    expect(a.forecastEvidence.availability).toBe("UNKNOWN");
    expect(a.forecastEvidence.reason).toMatch(/STALE/);
  });

  // ---------------------------------------------------------------------------
  // 11/12. Wrong-field attacks
  // ---------------------------------------------------------------------------
  it("11. wrong-field observation (queriedCentroid mismatch) → rejected even though status is LIVE", () => {
    const a = buildRainfallWindowScore(baseInput({ rainfallObservation: liveObservation({ queriedCentroid: otherCentroid, totalMm: 0 }) }));
    expect(a.historicalEvidence.availability).toBe("UNKNOWN");
    expect(a.historicalEvidence.reason).toMatch(/different field centroid/);
  });
  it("12. wrong-field forecast (queriedCentroid mismatch) → rejected even though status is LIVE", () => {
    const a = buildRainfallWindowScore(baseInput({ rainfallForecast: liveForecast({ queriedCentroid: otherCentroid, totalMm: 0 }) }));
    expect(a.forecastEvidence.availability).toBe("UNKNOWN");
    expect(a.forecastEvidence.reason).toMatch(/different field centroid/);
  });

  // ---------------------------------------------------------------------------
  // 13. Duplicate interval → not double-counted
  // ---------------------------------------------------------------------------
  it("13. duplicate forecast interval (same window repeated) fails closed rather than double-counting", () => {
    const points = fullForecastPoints(1);
    points.push(point(points[10].validAt, points[10].rainfallWindowStartIso, 1)); // exact duplicate of hour 11
    const a = buildRainfallWindowScore(baseInput({ rainfallForecast: liveForecast({ points }) }));
    expect(a.forecastEvidence.availability).toBe("UNKNOWN");
    expect(a.forecastEvidence.reason).toMatch(/not contiguous|gap or overlap/);
  });

  // ---------------------------------------------------------------------------
  // 14. Shuffled observation order → identical result
  // ---------------------------------------------------------------------------
  it("14. shuffled forecast point order → identical aggregation result", () => {
    const points = fullForecastPoints(0.5);
    const shuffled = [...points].reverse();
    const a1 = buildRainfallWindowScore(baseInput({ rainfallForecast: liveForecast({ points }) }));
    const a2 = buildRainfallWindowScore(baseInput({ rainfallForecast: liveForecast({ points: shuffled }) }));
    expect(a1.forecastEvidence.totalMm).toBe(a2.forecastEvidence.totalMm);
    expect(a1.score).toEqual(a2.score);
  });

  // ---------------------------------------------------------------------------
  // 15/16. Invalid input rejection
  // ---------------------------------------------------------------------------
  it("15. invalid negative rainfall total is rejected, never scored as excellent weather", () => {
    expect(() => historicalSubscoreFor(new Decimal(-1))).toThrow(/negative/);
  });
  it("15b. a negative-rainfall forecast point fails the whole component closed", () => {
    const points = fullForecastPoints(1);
    points[5] = point(points[5].validAt, points[5].rainfallWindowStartIso, -2);
    const a = buildRainfallWindowScore(baseInput({ rainfallForecast: liveForecast({ points }) }));
    expect(a.forecastEvidence.availability).toBe("UNKNOWN");
    expect(a.forecastEvidence.reason).toMatch(/invalid rainfall/);
  });
  it("16. NaN/Infinity rainfall total is rejected", () => {
    expect(() => historicalSubscoreFor(new Decimal(NaN))).toThrow();
    expect(() => historicalSubscoreFor(new Decimal(Infinity))).toThrow(/not finite/);
  });

  // ---------------------------------------------------------------------------
  // 17/18/19. Every anchor + immediately around each
  // ---------------------------------------------------------------------------
  const historicalAnchors: [number, string][] = [
    [0, "100"],
    [2, "100"],
    [5, "90"],
    [10, "75"],
    [20, "50"],
    [30, "25"],
    [40, "0"],
  ];
  it.each(historicalAnchors)("17. historical anchor %dmm → subscore %s", (mm, expected) => {
    expect(historicalSubscoreFor(new Decimal(mm)).toString()).toBe(expected);
  });
  const forecastAnchors: [number, string][] = [
    [0, "100"],
    [1, "100"],
    [3, "95"],
    [5, "85"],
    [10, "65"],
    [20, "35"],
    [30, "10"],
    [40, "0"],
  ];
  it.each(forecastAnchors)("18. forecast anchor %dmm → subscore %s", (mm, expected) => {
    expect(forecastSubscoreFor(new Decimal(mm)).toString()).toBe(expected);
  });
  it("19. immediately around each historical anchor stays continuous (no cliff)", () => {
    for (const [mm] of historicalAnchors) {
      if (mm === 0) continue;
      const below = historicalSubscoreFor(new Decimal(mm).minus("0.01"));
      const at = historicalSubscoreFor(new Decimal(mm));
      const above = mm < 40 ? historicalSubscoreFor(new Decimal(mm).plus("0.01")) : at;
      expect(below.minus(at).abs().lte("1")).toBe(true);
      expect(at.minus(above).abs().lte("1")).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // 20. Monotonic property
  // ---------------------------------------------------------------------------
  it("20. monotonicity: increasing rainfall never improves either subscore", () => {
    const samples = [0, 0.5, 1, 2, 3, 4, 5, 7, 9, 10, 15, 20, 25, 30, 35, 39, 40, 45, 60];
    for (let i = 1; i < samples.length; i++) {
      const prevH = historicalSubscoreFor(new Decimal(samples[i - 1]));
      const curH = historicalSubscoreFor(new Decimal(samples[i]));
      expect(curH.lte(prevH)).toBe(true);
      const prevF = forecastSubscoreFor(new Decimal(samples[i - 1]));
      const curF = forecastSubscoreFor(new Decimal(samples[i]));
      expect(curF.lte(prevF)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // 21. Boundedness
  // ---------------------------------------------------------------------------
  it("21. boundedness: every subscore stays within [0,100] for a wide sample of valid inputs", () => {
    for (let mm = 0; mm <= 80; mm += 0.7) {
      const h = historicalSubscoreFor(new Decimal(mm));
      const f = forecastSubscoreFor(new Decimal(mm));
      expect(h.gte(0) && h.lte(100)).toBe(true);
      expect(f.gte(0) && f.lte(100)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // 22. Independent seeded oracle (does NOT import production interpolation)
  // ---------------------------------------------------------------------------
  it("22. independent oracle matches production for many seeded historical/forecast pairs", () => {
    function oracleInterp(mm: number, anchors: [number, number][]): number {
      if (mm < 0 || !Number.isFinite(mm)) throw new Error("invalid");
      const last = anchors[anchors.length - 1];
      if (mm >= last[0]) return last[1];
      for (let i = 0; i < anchors.length - 1; i++) {
        const [x0, y0] = anchors[i];
        const [x1, y1] = anchors[i + 1];
        if (mm >= x0 && mm <= x1) {
          const t = (mm - x0) / (x1 - x0);
          return y0 + t * (y1 - y0);
        }
      }
      throw new Error("unreachable");
    }
    const hAnchors: [number, number][] = [[0, 100], [2, 100], [5, 90], [10, 75], [20, 50], [30, 25], [40, 0]];
    const fAnchors: [number, number][] = [[0, 100], [1, 100], [3, 95], [5, 85], [10, 65], [20, 35], [30, 10], [40, 0]];
    // Small deterministic PRNG (xorshift32) — reproducible, not Math.random.
    let seed = 987654321;
    function rand() {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      seed |= 0;
      return (Math.abs(seed) % 10000) / 100; // 0.00 .. 99.99
    }
    for (let i = 0; i < 200; i++) {
      const hMm = Math.round(rand() * 100) / 100;
      const fMm = Math.round(rand() * 100) / 100;
      const expectedH = oracleInterp(hMm, hAnchors);
      const expectedF = oracleInterp(fMm, fAnchors);
      const actualH = Number(historicalSubscoreFor(new Decimal(hMm)).toString());
      const actualF = Number(forecastSubscoreFor(new Decimal(fMm)).toString());
      expect(Math.abs(actualH - expectedH)).toBeLessThan(1e-9);
      expect(Math.abs(actualF - expectedF)).toBeLessThan(1e-9);
    }
  });

  // ---------------------------------------------------------------------------
  // 23. Caller mutation snapshot safety
  // ---------------------------------------------------------------------------
  it("23. mutating the caller's input objects after construction does not alter the returned assessment", () => {
    const obs = liveObservation({ totalMm: 5 });
    const fc = liveForecast({ totalMm: 3 });
    const input = baseInput({ rainfallObservation: obs, rainfallForecast: fc });
    const a = buildRainfallWindowScore(input);
    const before = JSON.stringify(a);
    obs.rollingRainfall[0].totalMm = 9999;
    fc.points[0].rainfallMm = 9999;
    expect(JSON.stringify(a)).toBe(before);
    // Separately: the returned `limitations` array is a fresh copy per
    // call, not a shared module singleton — mutating it must not affect a
    // second, independently-built assessment.
    const a2 = buildRainfallWindowScore(input);
    a.limitations.push("mutated");
    expect(a2.limitations).not.toContain("mutated");
  });

  // ---------------------------------------------------------------------------
  // 24. Phase 11A BLOCKED cannot be overridden
  // ---------------------------------------------------------------------------
  it("24. this module never reads or produces a Phase 11A/regulatory state — a high score cannot override anything, by construction (no such coupling exists to attack)", () => {
    // Structural proof: this module's own source never imports the Phase
    // 11A module or any regulatory gate.
    expect(MODULE_SOURCE).not.toMatch(/spreading-actionability-foundation|closed-period-calendar|spreading-window-gate|buffer-gate|commonage-gate/);
    // A favourable score is still produced independent of any (absent)
    // regulatory context — proving there is no code path where this
    // module's own output could stand in for, or override, a blocker.
    const a = buildRainfallWindowScore(baseInput({ rainfallObservation: liveObservation({ totalMm: 0 }), rainfallForecast: liveForecast({ totalMm: 0 }) }));
    expect(a.score.status).toBe("OK");
  });

  // ---------------------------------------------------------------------------
  // 25. Score cannot create Phase 10 ACTIONABLE
  // ---------------------------------------------------------------------------
  it("25. no code path in this module references Phase 10/VerifiedActionabilityMap/ACTIONABLE", () => {
    expect(MODULE_SOURCE).not.toMatch(/recommendation-actionability|VerifiedActionabilityMap|"ACTIONABLE"/);
  });

  // ---------------------------------------------------------------------------
  // 26-29. Excluded inputs
  // ---------------------------------------------------------------------------
  // Note: this module's own limitations text DISCLOSES that SMD/soil
  // temperature/wind/solar radiation are excluded (brief requires this to
  // be documented) — so these checks assert no CONSUMPTION of such a
  // field/type (an actual data input or exported symbol), not a blanket
  // absence of the word anywhere in prose.
  it("26. SMD is never consumed as a data input anywhere in this module", () => {
    expect(MODULE_SOURCE).not.toMatch(/\.smdEvidence|soilMoistureDeficit|\bSMD\s*[:=]/);
  });
  it("27. soil temperature is never consumed as a data input anywhere in this module", () => {
    expect(MODULE_SOURCE).not.toMatch(/soilTemperatureC|soilTemperatureEvidence|\.soilTemperature\b/);
  });
  it("28. wind is never consumed as a data input anywhere in this module", () => {
    expect(MODULE_SOURCE).not.toMatch(/windSpeedMps|windDirectionDeg|windGustMps/);
  });
  it("29. solar radiation is never consumed as a data input anywhere in this module", () => {
    expect(MODULE_SOURCE).not.toMatch(/solarRadiationWM2|globalRadiation|sunshineDuration/);
  });

  // ---------------------------------------------------------------------------
  // Additional: naming, determinism, time windows, binding identity
  // ---------------------------------------------------------------------------
  it("naming: no exported type/function/constant claims to be a complete suitability/agronomic/trafficability score", () => {
    // Checks actual export identifiers, not prose (the module's own doc
    // comments correctly discuss — and reject — these names as things NOT
    // to call it, which a blanket text search can't distinguish from
    // actually using them).
    const exportLines = MODULE_SOURCE.split("\n").filter((l) => l.trimStart().startsWith("export "));
    for (const line of exportLines) {
      expect(line).not.toMatch(/SpreadingScore\b|SuitabilityScore|AgronomicScore|TrafficabilityScore/);
    }
    // The real, correct name is used.
    expect(MODULE_SOURCE).toMatch(/RainfallWindowScore/);
  });

  it("determinism: identical input produces byte-identical output across repeated calls", () => {
    const input = baseInput({ rainfallObservation: liveObservation({ totalMm: 12.34 }), rainfallForecast: liveForecast({ totalMm: 6.78 }) });
    const results = Array.from({ length: 5 }, () => JSON.stringify(buildRainfallWindowScore(input)));
    expect(new Set(results).size).toBe(1);
  });

  it("time windows: historical [T-72h, T) and forecast [T, T+48h) are computed as explicit half-open intervals", () => {
    const a = buildRainfallWindowScore(baseInput());
    expect(a.historicalWindow.start).toBe(historicalWindowStart);
    expect(a.historicalWindow.end).toBe(evaluatedAt);
    expect(a.forecastWindow.start).toBe(evaluatedAt);
    expect(a.forecastWindow.end).toBe(forecastWindowEnd);
  });

  it("time binding: a 72h window whose own asOf does not match evaluatedAt is rejected rather than trusted", () => {
    const mismatched = liveObservation({ totalMm: 0, windowEnd: "2026-02-15T08:00:00.000Z" }); // 1h earlier than evaluatedAt
    const a = buildRainfallWindowScore(baseInput({ rainfallObservation: mismatched }));
    expect(a.historicalEvidence.availability).toBe("UNKNOWN");
    expect(a.historicalEvidence.reason).toMatch(/not this assessment's evaluatedAt/);
  });

  it("missing 72h entry entirely → UNKNOWN with an explicit reason, never a crash", () => {
    const a = buildRainfallWindowScore(baseInput({ rainfallObservation: liveObservation({ include72: false }) }));
    expect(a.historicalEvidence.availability).toBe("UNKNOWN");
    expect(a.historicalEvidence.reason).toMatch(/no 72-hour/);
  });

  it("forecast coverage that starts late or ends early (short of the full 48h) fails closed rather than reporting a partial total", () => {
    const points = fullForecastPoints(1).slice(0, 40); // only 40 of 48 hours
    const a = buildRainfallWindowScore(baseInput({ rainfallForecast: liveForecast({ points }) }));
    expect(a.forecastEvidence.availability).toBe("UNKNOWN");
    expect(a.forecastEvidence.reason).toMatch(/does not reach the window end/);
  });

  it("model-policy provenance: limitations explicitly state the anchors/weights are Farm Return calibration, not science", () => {
    const a = buildRainfallWindowScore(baseInput());
    expect(a.limitations.some((l) => l.includes("Farm Return model-policy calibration"))).toBe(true);
    expect(a.limitations.some((l) => l.includes("not a complete spreading suitability score"))).toBe(true);
    expect(a.limitations.some((l) => l.toLowerCase().includes("trafficability"))).toBe(true);
  });

  it("opportunity/assessment/action identity binds through unchanged", () => {
    const a = buildRainfallWindowScore(baseInput({ opportunityRecordId: "opp-x", boundAssessmentId: "assess-y", evaluatedActionId: "action-z", fieldId: "field-w" }));
    expect(a.opportunityRecordId).toBe("opp-x");
    expect(a.boundAssessmentId).toBe("assess-y");
    expect(a.evaluatedActionId).toBe("action-z");
    expect(a.fieldId).toBe("field-w");
  });
});
