import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRASS_PRESENTATION_TARGETS,
  activeGrassGrowthForecast,
  buildFarmGrassSummary,
  buildGrassFieldState,
  buildGrassWedge,
  classifyGrassDataFreshness,
  grassPresentationBand,
  latestGrassGrowthObservation,
  latestGrassObservationByField,
  type FarmGrassGrowthObservation,
  type GrassCoverObservation,
} from "./grass-management";

const AS_OF = "2026-05-10T12:00:00.000Z";

function cover(overrides: Partial<GrassCoverObservation> = {}): GrassCoverObservation {
  return {
    id: "obs-1",
    farmId: "farm-1",
    fieldId: "field-a",
    coverKgDmHa: 1500,
    method: "plate_meter",
    observedAt: "2026-05-08T12:00:00.000Z",
    source: "Keith",
    ...overrides,
  };
}

function growth(overrides: Partial<FarmGrassGrowthObservation> = {}): FarmGrassGrowthObservation {
  return {
    id: "growth-1",
    farmId: "farm-1",
    growthRateKgDmHaDay: 60,
    origin: "farmer_entered",
    observedAt: "2026-05-08T12:00:00.000Z",
    source: "Keith",
    ...overrides,
  };
}

describe("latest evidence selection", () => {
  it("ignores observations after asOf", () => {
    const latest = latestGrassObservationByField(
      [cover({ id: "past" }), cover({ id: "future", observedAt: "2026-05-11T00:00:00.000Z", coverKgDmHa: 3000 })],
      AS_OF,
    );
    expect(latest.get("field-a")?.id).toBe("past");
  });

  it("returns nothing for a field whose only evidence is in the future", () => {
    const latest = latestGrassObservationByField([cover({ observedAt: "2026-06-01T00:00:00.000Z" })], AS_OF);
    expect(latest.size).toBe(0);
  });

  it("breaks equal-instant ties on id, independent of input order", () => {
    const a = cover({ id: "aaa", coverKgDmHa: 1000 });
    const b = cover({ id: "bbb", coverKgDmHa: 2000 });
    expect(latestGrassObservationByField([a, b], AS_OF).get("field-a")?.id).toBe("bbb");
    expect(latestGrassObservationByField([b, a], AS_OF).get("field-a")?.id).toBe("bbb");
  });

  it("selects per field and prefers the later instant over id", () => {
    const latest = latestGrassObservationByField(
      [
        cover({ id: "zzz", observedAt: "2026-05-01T00:00:00.000Z" }),
        cover({ id: "aaa", observedAt: "2026-05-02T00:00:00.000Z" }),
        cover({ id: "other", fieldId: "field-b" }),
      ],
      AS_OF,
    );
    expect(latest.get("field-a")?.id).toBe("aaa");
    expect(latest.get("field-b")?.id).toBe("other");
  });

  it("latest growth ignores future rows and ties on id", () => {
    expect(latestGrassGrowthObservation([], AS_OF)).toBeUndefined();
    expect(
      latestGrassGrowthObservation(
        [growth({ id: "g-a" }), growth({ id: "g-b" }), growth({ id: "g-future", observedAt: "2026-05-11T00:00:00.000Z" })],
        AS_OF,
      )?.id,
    ).toBe("g-b");
  });

  it("throws on an unparseable timestamp rather than guessing", () => {
    expect(() => latestGrassObservationByField([cover({ observedAt: "not-a-date" })], AS_OF)).toThrow(RangeError);
  });
});

describe("regional growth forecast evidence", () => {
  const forecast = {
    id: "forecast-1",
    farmId: "farm-1",
    growthRateKgDmHaDay: 40,
    provider: "teagasc_most_regional" as const,
    scope: "county" as const,
    regionLabel: "Galway",
    validFrom: "2026-05-10T00:00:00.000Z",
    validTo: "2026-05-17T23:59:59.000Z",
    issuedAt: "2026-05-09T18:00:00.000Z",
    retrievedAt: "2026-05-09T18:05:00.000Z",
    source: "Teagasc MoSt regional forecast",
    sourceUrl: "https://teagasc.ie/crops/grassland/current-grassland-management/",
    modelName: "MoSt Grass Growth",
  };

  it("selects only a forecast that covers the full requested horizon", () => {
    expect(activeGrassGrowthForecast([forecast], AS_OF, "2026-05-13T12:00:00.000Z")?.id).toBe("forecast-1");
    expect(activeGrassGrowthForecast(
      [{ ...forecast, validTo: "2026-05-12T00:00:00.000Z" }],
      AS_OF,
      "2026-05-13T12:00:00.000Z",
    )).toBeUndefined();
  });

  it("does not use a forecast issued after the as-of instant", () => {
    expect(activeGrassGrowthForecast(
      [{ ...forecast, issuedAt: "2026-05-10T13:00:00.000Z" }],
      AS_OF,
      "2026-05-13T12:00:00.000Z",
    )).toBeUndefined();
  });

  it("applies a valid forecast only from asOf forward, not back to the last grass walk", () => {
    const state = buildGrassFieldState({
      fieldId: "field-a",
      areaHa: 4,
      observation: cover({ observedAt: "2026-05-08T12:00:00.000Z", coverKgDmHa: 1500 }),
      growth: growth({ growthRateKgDmHaDay: 20 }),
      forecastGrowth: forecast,
      asOf: AS_OF,
      horizonDays: 3,
    });
    if (state.status !== "known" || state.projection?.status !== "available") throw new Error("expected forecast projection");
    expect(state.current.coverKgDmHa).toBe(1540);
    expect(state.projection.value.coverKgDmHa).toBe(1660);
    expect(state.projection.growthSource).toBe("forecast");
    expect(state.projection.forecast).toMatchObject({
      provider: "teagasc_most_regional",
      regionLabel: "Galway",
    });
  });

  it("refuses to bridge an old measurement to today using a future-only forecast", () => {
    const state = buildGrassFieldState({
      fieldId: "field-a",
      areaHa: 4,
      observation: cover({ observedAt: "2026-05-08T12:00:00.000Z" }),
      forecastGrowth: forecast,
      asOf: AS_OF,
      horizonDays: 3,
    });
    if (state.status !== "known") throw new Error("expected known state");
    expect(state.current).toMatchObject({ basis: "measured", reason: "NO_GROWTH_EVIDENCE" });
    expect(state.projection).toEqual({
      status: "unavailable",
      horizonDays: 3,
      reason: "CURRENT_GROWTH_REQUIRED",
    });
  });
});

describe("buildGrassFieldState", () => {
  it("is unknown without an observation", () => {
    expect(buildGrassFieldState({ fieldId: "field-a", areaHa: 4, asOf: AS_OF })).toMatchObject({
      status: "unknown",
      confidence: "UNKNOWN",
      band: "unknown",
    });
  });

  it("treats a future observation as not-yet-evidence", () => {
    const state = buildGrassFieldState({
      fieldId: "field-a",
      areaHa: 4,
      observation: cover({ observedAt: "2026-05-12T00:00:00.000Z" }),
      asOf: AS_OF,
    });
    expect(state.status).toBe("unknown");
  });

  it("without growth evidence shows the measured cover as measured and never projects", () => {
    const state = buildGrassFieldState({
      fieldId: "field-a",
      areaHa: 4,
      observation: cover(),
      asOf: AS_OF,
      horizonDays: 7,
    });
    expect(state.status).toBe("known");
    if (state.status !== "known") return;
    expect(state.current).toEqual({ basis: "measured", coverKgDmHa: 1500, reason: "NO_GROWTH_EVIDENCE" });
    expect(state.projection).toEqual({ status: "unavailable", horizonDays: 7, reason: "GROWTH_RATE_REQUIRED" });
    expect(state.measured).toMatchObject({ coverKgDmHa: 1500, ageDays: 2, method: "plate_meter" });
  });

  it("ignores growth evidence recorded after asOf", () => {
    const state = buildGrassFieldState({
      fieldId: "field-a",
      areaHa: 4,
      observation: cover(),
      growth: growth({ observedAt: "2026-05-11T00:00:00.000Z" }),
      asOf: AS_OF,
    });
    expect(state.status === "known" && state.current.basis).toBe("measured");
  });

  it("an observation taken exactly at asOf stays measured even with growth", () => {
    const state = buildGrassFieldState({
      fieldId: "field-a",
      areaHa: 4,
      observation: cover({ observedAt: AS_OF }),
      growth: growth(),
      asOf: AS_OF,
    });
    expect(state.status === "known" && state.current).toEqual({ basis: "measured", coverKgDmHa: 1500, reason: "OBSERVED_AT_AS_OF" });
  });

  it("estimates current cover as measured + growth × elapsed days, labelled estimated", () => {
    const state = buildGrassFieldState({ fieldId: "field-a", areaHa: 4, observation: cover(), growth: growth(), asOf: AS_OF });
    if (state.status !== "known" || state.current.basis !== "estimated") throw new Error("expected estimate");
    expect(state.current.coverKgDmHa).toBe(1500 + 60 * 2);
    expect(state.current.elapsedDays).toBe(2);
    expect(state.current.demand).toEqual({ status: "not_supplied" });
    expect(state.current.growth).toMatchObject({ observationId: "growth-1", origin: "farmer_entered" });
    expect(state.measured.coverKgDmHa).toBe(1500);
  });

  it("projects to the horizon from the measurement instant", () => {
    const state = buildGrassFieldState({
      fieldId: "field-a",
      areaHa: 4,
      observation: cover(),
      growth: growth(),
      asOf: AS_OF,
      horizonDays: 5,
    });
    if (state.status !== "known" || state.projection?.status !== "available") throw new Error("expected projection");
    expect(state.projection.value.coverKgDmHa).toBe(1500 + 60 * 7);
    expect(state.projection.value.elapsedDays).toBe(7);
    expect(state.projection.atInstant).toBe("2026-05-15T12:00:00.000Z");
  });

  it("applies optional demand per hectare and clamps the display value at zero", () => {
    const withDemand = buildGrassFieldState({
      fieldId: "field-a",
      areaHa: 4,
      observation: cover(),
      growth: growth(),
      asOf: AS_OF,
      dailyDemandKgDm: 800, // 200 kg DM/ha/day
      horizonDays: 10,
    });
    if (withDemand.status !== "known" || withDemand.current.basis !== "estimated") throw new Error("expected estimate");
    expect(withDemand.current.demand).toEqual({ status: "applied", dailyDemandKgDm: 800, demandKgDmHaDay: 200 });
    expect(withDemand.current.coverKgDmHa).toBe(1500 + (60 - 200) * 2);
    if (withDemand.projection?.status !== "available") throw new Error("expected projection");
    expect(withDemand.projection.value.rawCoverKgDmHa).toBe(1500 + (60 - 200) * 12);
    expect(withDemand.projection.value.coverKgDmHa).toBe(0);
    expect(withDemand.projection.value.clampedAtZero).toBe(true);
  });

  it("applies movement demand only from the recorded move time", () => {
    const state = buildGrassFieldState({
      fieldId: "field-a",
      areaHa: 4,
      observation: cover({ observedAt: "2026-05-08T12:00:00.000Z" }),
      growth: growth(),
      asOf: "2026-05-10T12:00:00.000Z",
      demandWindows: [{
        id: "session-1",
        dailyDemandKgDm: 400,
        startedAt: "2026-05-09T12:00:00.000Z",
        source: "Recorded cattle movement",
      }],
    });
    if (state.status !== "known" || state.current.basis !== "estimated") throw new Error("expected estimate");
    expect(state.current.coverKgDmHa).toBe(1500 + 60 * 2 - 400 / 4);
    expect(state.current.demand).toMatchObject({
      status: "time_bounded",
      currentDailyDemandKgDm: 400,
      demandRemovedKgDm: 400,
      completeness: "complete",
    });
  });

  it("stops subtracting demand when a movement session ends", () => {
    const state = buildGrassFieldState({
      fieldId: "field-a",
      areaHa: 4,
      observation: cover({ observedAt: "2026-05-08T12:00:00.000Z" }),
      growth: growth(),
      asOf: "2026-05-10T12:00:00.000Z",
      horizonDays: 2,
      demandWindows: [{
        id: "session-1",
        dailyDemandKgDm: 400,
        startedAt: "2026-05-08T12:00:00.000Z",
        endedAt: "2026-05-09T12:00:00.000Z",
        source: "Recorded cattle movement",
      }],
    });
    if (state.status !== "known" || state.projection?.status !== "available") throw new Error("expected projection");
    expect(state.projection.value.coverKgDmHa).toBe(1500 + 60 * 4 - 400 / 4);
    expect(state.projection.value.demand).toMatchObject({
      status: "time_bounded",
      currentDailyDemandKgDm: 0,
      demandRemovedKgDm: 400,
    });
  });

  it("marks a movement-derived estimate partial when an overlapping session has unresolved intake", () => {
    const state = buildGrassFieldState({
      fieldId: "field-a",
      areaHa: 4,
      observation: cover(),
      growth: growth(),
      asOf: AS_OF,
      demandWindows: [{
        id: "known-session",
        dailyDemandKgDm: 200,
        startedAt: "2026-05-09T12:00:00.000Z",
        source: "Recorded cattle movement",
      }],
      unresolvedDemandWindows: [{
        id: "missing-weight-session",
        startedAt: "2026-05-09T12:00:00.000Z",
      }],
    });
    if (state.status !== "known" || state.current.basis !== "estimated") throw new Error("expected estimate");
    expect(state.current.demand).toMatchObject({
      status: "time_bounded",
      completeness: "partial",
      unresolvedSessionCount: 1,
    });
  });

  it("rejects malformed numeric input instead of producing a figure", () => {
    const base = { fieldId: "field-a", areaHa: 4, asOf: AS_OF };
    expect(() => buildGrassFieldState({ ...base, observation: cover({ coverKgDmHa: Number.NaN }) })).toThrow(RangeError);
    expect(() => buildGrassFieldState({ ...base, observation: cover({ coverKgDmHa: 20_000 }) })).toThrow(RangeError);
    expect(() => buildGrassFieldState({ ...base, observation: cover(), growth: growth({ growthRateKgDmHaDay: -1 }) })).toThrow(RangeError);
    expect(() => buildGrassFieldState({ ...base, areaHa: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => buildGrassFieldState({ ...base, horizonDays: 0 })).toThrow(RangeError);
    expect(() => buildGrassFieldState({ ...base, dailyDemandKgDm: -5 })).toThrow(RangeError);
    expect(() => buildGrassFieldState({ ...base, areaHa: 0, observation: cover(), dailyDemandKgDm: 10 })).toThrow(RangeError);
    expect(() => buildGrassFieldState({ ...base, observation: cover({ fieldId: "field-b" }) })).toThrow(RangeError);
  });
});

describe("freshness and bands", () => {
  it("ages confidence by data freshness only", () => {
    expect(classifyGrassDataFreshness(0)).toBe("HIGH");
    expect(classifyGrassDataFreshness(3)).toBe("HIGH");
    expect(classifyGrassDataFreshness(3.01)).toBe("MEDIUM");
    expect(classifyGrassDataFreshness(7)).toBe("MEDIUM");
    expect(classifyGrassDataFreshness(14)).toBe("LOW");
    expect(classifyGrassDataFreshness(14.5)).toBe("STALE");
    expect(() => classifyGrassDataFreshness(-1)).toThrow(RangeError);
  });

  it("field confidence follows measurement age", () => {
    const state = buildGrassFieldState({
      fieldId: "field-a",
      areaHa: 4,
      observation: cover({ observedAt: "2026-04-20T12:00:00.000Z" }),
      asOf: AS_OF,
    });
    expect(state.confidence).toBe("STALE");
  });

  it("bands cover against presentation targets", () => {
    expect(grassPresentationBand(undefined)).toBe("unknown");
    expect(grassPresentationBand(900)).toBe("below_target");
    expect(grassPresentationBand(1349)).toBe("below_target");
    expect(grassPresentationBand(1350)).toBe("target");
    expect(grassPresentationBand(1650)).toBe("target");
    expect(grassPresentationBand(1700)).toBe("above_target");
    expect(grassPresentationBand(1850)).toBe("surplus");
    expect(grassPresentationBand(1200, { targetMinKgDmHa: 1000, targetMaxKgDmHa: 1300, surplusFromKgDmHa: 1500 })).toBe("target");
    expect(() => grassPresentationBand(1000, { ...DEFAULT_GRASS_PRESENTATION_TARGETS, targetMaxKgDmHa: 1000 })).toThrow(RangeError);
  });
});

describe("buildFarmGrassSummary", () => {
  const fields = [
    { id: "field-a", areaHa: 2 },
    { id: "field-b", areaHa: 6 },
    { id: "field-c", areaHa: 3 },
  ];

  it("area-weights only known fields and never counts unknown as zero", () => {
    const summary = buildFarmGrassSummary(
      fields,
      [
        cover({ id: "a", fieldId: "field-a", coverKgDmHa: 1000 }),
        cover({ id: "b", fieldId: "field-b", coverKgDmHa: 2000, observedAt: "2026-05-09T12:00:00.000Z" }),
        cover({ id: "x", fieldId: "archived-field", coverKgDmHa: 9000 }),
      ],
      [],
      AS_OF,
    );
    expect(summary.averageCoverKgDmHa).toBe((1000 * 2 + 2000 * 6) / 8);
    expect(summary.averageCoverBasis).toBe("measured");
    expect(summary.knownAreaHa).toBe(8);
    expect(summary.unknownAreaHa).toBe(3);
    expect(summary.knownCoverKgDm).toBe(14_000);
    expect(summary.counts).toEqual({ HIGH: 2, MEDIUM: 0, LOW: 0, STALE: 0, UNKNOWN: 1 });
    expect(summary.latestWalkAt).toBe("2026-05-09T12:00:00.000Z");
    expect(summary.growthRateKgDmHaDay).toBeUndefined();
  });

  it("uses the latest growth for current estimates but never reports demand or balance", () => {
    const summary = buildFarmGrassSummary(
      fields,
      [cover({ id: "a", fieldId: "field-a", coverKgDmHa: 1000 })],
      [growth({ id: "old", growthRateKgDmHaDay: 10, observedAt: "2026-05-01T00:00:00.000Z" }), growth({ id: "new", growthRateKgDmHaDay: 50 })],
      AS_OF,
    );
    expect(summary.growthRateKgDmHaDay).toBe(50);
    expect(summary.growth?.observationId).toBe("new");
    expect(summary.averageCoverKgDmHa).toBe(1000 + 50 * 2);
    expect(summary.averageCoverBasis).toBe("estimated");
    expect(summary.dailyDemandKgDm).toBeUndefined();
    expect(summary.netBalanceKgDmDay).toBeUndefined();
    expect(summary).not.toHaveProperty("daysAhead");
  });

  it("has no average when no field is known", () => {
    const summary = buildFarmGrassSummary(fields, [], [], AS_OF);
    expect(summary.averageCoverKgDmHa).toBeUndefined();
    expect(summary.knownCoverKgDm).toBeUndefined();
    expect(summary.latestWalkAt).toBeUndefined();
    expect(summary.counts.UNKNOWN).toBe(3);
  });
});

describe("buildGrassWedge", () => {
  it("ranks known cover descending, ties on fieldId, unknown last", () => {
    const states = [
      buildGrassFieldState({ fieldId: "field-u", areaHa: 1, asOf: AS_OF }),
      buildGrassFieldState({ fieldId: "field-b", areaHa: 1, observation: cover({ fieldId: "field-b", coverKgDmHa: 1200 }), asOf: AS_OF }),
      buildGrassFieldState({ fieldId: "field-a", areaHa: 1, observation: cover({ fieldId: "field-a", coverKgDmHa: 1200 }), asOf: AS_OF }),
      buildGrassFieldState({ fieldId: "field-c", areaHa: 1, observation: cover({ fieldId: "field-c", coverKgDmHa: 1900 }), asOf: AS_OF }),
    ];
    const wedge = buildGrassWedge(states);
    expect(wedge.map((entry) => entry.fieldId)).toEqual(["field-c", "field-a", "field-b", "field-u"]);
    expect(wedge.map((entry) => entry.rank)).toEqual([1, 2, 3, 4]);
    expect(wedge[0]).toMatchObject({ band: "surplus", basis: "measured" });
    expect(wedge[3]).toMatchObject({ basis: "unknown", band: "unknown" });
    expect(wedge[3].coverKgDmHa).toBeUndefined();
  });

  it("prefers an available projection for ranking", () => {
    const states = [
      buildGrassFieldState({ fieldId: "field-a", areaHa: 1, observation: cover({ fieldId: "field-a" }), growth: growth(), asOf: AS_OF, horizonDays: 3 }),
    ];
    expect(buildGrassWedge(states)[0]).toMatchObject({ basis: "projected", coverKgDmHa: 1500 + 60 * 5 });
  });
});
