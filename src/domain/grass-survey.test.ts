import { describe, expect, it } from "vitest";
import { cleanSurveyTrack, computeSurveyResults, haversineM, surveyMapView, trackDistanceM } from "./grass-survey";

const F1 = "11111111-1111-4111-8111-111111111111";
const F2 = "22222222-2222-4222-8222-222222222222";
const F3 = "33333333-3333-4333-8333-333333333333";
const fields = [
  { id: F1, name: "Hill", areaHa: 2 },
  { id: F2, name: "Side", areaHa: 1 },
  { id: F3, name: "Road", areaHa: 1 },
];

describe("trackDistanceM", () => {
  it("sums real movement and ignores jitter and poor fixes", () => {
    const p = (min: number, lat: number, accuracyM: number | null = 5) => ({ recordedAt: new Date(Date.UTC(2026, 10, 9, 7, min)).toISOString(), lat, lng: -8.78, accuracyM });
    const d = trackDistanceM([p(0, 52.7), p(1, 52.70001), p(2, 52.701), p(3, 52.75, 400), p(4, 52.702)]);
    expect(d).toBeGreaterThan(215);
    expect(d).toBeLessThan(230);
    expect(haversineM(52.7, -8.78, 52.701, -8.78)).toBeCloseTo(111.2, 0);
  });
});

describe("cleanSurveyTrack", () => {
  const at = (s: number, lat: number, lng = -8.78, accuracyM: number | null = 5) => ({ recordedAt: new Date(Date.UTC(2026, 10, 11, 7, 0, s)).toISOString(), lat, lng, accuracyM });
  // ~11 m north every 10 s: a steady walk.
  const walk = (from: number, n: number) => Array.from({ length: n }, (_, i) => at(from + i * 10, 52.7 + i * 0.0001));

  it("drops a lone wild fix in the middle of a walk", () => {
    const pts = [...walk(0, 3), at(25, 52.9), ...walk(30, 3).map((p, i) => ({ ...p, lat: 52.7003 + i * 0.0001 }))];
    const clean = cleanSurveyTrack(pts);
    expect(clean).toHaveLength(6);
    expect(clean.every((p) => p.lat < 52.71)).toBe(true);
  });

  it("drops a bad first fix (wifi guess 20 km away) instead of the whole walk", () => {
    const pts = [at(0, 52.88, -8.6), ...walk(5, 8)];
    const clean = cleanSurveyTrack(pts);
    expect(clean).toHaveLength(8);
    expect(clean[0].lat).toBeCloseTo(52.7, 4);
    expect(trackDistanceM(pts)).toBeLessThan(100);
  });

  it("keeps fast movement on a quad that would be impossible on foot", () => {
    const quad = Array.from({ length: 5 }, (_, i) => at(i * 5, 52.7 + i * 0.0006)); // ~67 m every 5 s
    expect(cleanSurveyTrack(quad, "quad")).toHaveLength(5);
    expect(cleanSurveyTrack(quad, "walk").length).toBeLessThan(5);
  });

  it("puts fixes in time order and keeps a pause-and-resume", () => {
    const pts = [at(600, 52.705), ...walk(0, 3)];
    expect(cleanSurveyTrack(pts).map((p) => p.recordedAt.slice(14, 19))).toEqual(["00:00", "00:10", "00:20", "10:00"]);
  });
});

describe("surveyMapView", () => {
  const square = (lng: number, lat: number, d = 0.002) => [[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]];
  const route = [{ lat: 52.7, lng: -8.78 }, { lat: 52.703, lng: -8.777 }];

  it("frames the walk and the fields beside it, leaving a distant out-farm out", () => {
    const view = surveyMapView({ route, readings: [], fields: [{ id: "home", ring: square(-8.781, 52.699) }, { id: "outfarm", ring: square(-8.5, 52.9) }] });
    expect(view.fieldIds).toEqual(["home"]);
    expect(view.nearestFieldKm).toBeNull();
    expect(view.bounds![1][0]).toBeLessThan(-8.77);
  });

  it("says how far away the fields are when the walk was somewhere else", () => {
    const view = surveyMapView({ route, readings: [], fields: [{ id: "far", ring: square(-8.5, 52.9) }] });
    expect(view.fieldIds).toEqual([]);
    expect(view.nearestFieldKm).toBeGreaterThan(20);
    expect(view.bounds).toEqual([[-8.78, 52.7], [-8.777, 52.703]]);
  });

  it("falls back to the farm's fields when nothing was recorded", () => {
    const view = surveyMapView({ route: [], readings: [], fields: [{ id: "a", ring: square(-8.78, 52.7) }] });
    expect(view.fieldIds).toEqual(["a"]);
    expect(view.bounds![0]).toEqual([-8.78, 52.7]);
    expect(view.bounds![1][0]).toBeCloseTo(-8.778, 6);
    expect(view.bounds![1][1]).toBeCloseTo(52.702, 6);
  });
});

describe("computeSurveyResults", () => {
  const base = {
    fields,
    startedAt: "2026-11-09T07:40:00.000Z",
    finishedAt: "2026-11-09T08:30:00.000Z",
    grazingSessions: [],
    markedGrazedFieldIds: [],
    skippedFieldIds: [],
    distanceM: 2400,
  };

  it("works out growth from the change in cover, area weighted", () => {
    const r = computeSurveyResults({
      ...base,
      observations: [
        { id: "a", fieldId: F1, coverKgDmHa: 1500, observedAt: "2026-11-02T08:00:00.000Z" },
        { id: "b", fieldId: F1, coverKgDmHa: 1640, observedAt: "2026-11-09T07:50:00.000Z" },
        { id: "c", fieldId: F2, coverKgDmHa: 1200, observedAt: "2026-11-02T08:00:00.000Z" },
        { id: "d", fieldId: F2, coverKgDmHa: 1270, observedAt: "2026-11-09T08:00:00.000Z" },
      ],
      surveyObservationIds: ["b", "d"],
      previousFarmCoverKgDmHa: 1400,
    });
    const hill = r.fields.find((f) => f.fieldId === F1)!;
    expect(hill.growthKgDmHaDay).toBeCloseTo(20, 0);
    expect(r.fieldsMeasured).toBe(2);
    expect(r.farmCoverKgDmHa).toBe(Math.round((1640 * 2 + 1270) / 3));
    expect(r.farmCoverChange).toBe(r.farmCoverKgDmHa! - 1400);
    expect(r.farmGrowthFieldCount).toBe(2);
    expect(r.durationMin).toBe(50);
    expect(r.fields.find((f) => f.fieldId === F3)!.status).toBe("not_visited");
  });

  it("gives no growth for grazed fields, first readings or falling cover", () => {
    const r = computeSurveyResults({
      ...base,
      grazingSessions: [{ fieldId: F1, startedAt: "2026-11-05T09:00:00.000Z", endedAt: "2026-11-07T09:00:00.000Z" }],
      observations: [
        { id: "a", fieldId: F1, coverKgDmHa: 1500, observedAt: "2026-11-02T08:00:00.000Z" },
        { id: "b", fieldId: F1, coverKgDmHa: 1640, observedAt: "2026-11-09T07:50:00.000Z" },
        { id: "c", fieldId: F2, coverKgDmHa: 1300, observedAt: "2026-11-09T08:00:00.000Z" },
        { id: "e", fieldId: F3, coverKgDmHa: 1800, observedAt: "2026-11-02T08:00:00.000Z" },
        { id: "f", fieldId: F3, coverKgDmHa: 1600, observedAt: "2026-11-09T08:10:00.000Z" },
      ],
      surveyObservationIds: ["b", "c", "f"],
    });
    expect(r.fields.find((f) => f.fieldId === F1)!.growthNote).toMatch(/Grazed/);
    expect(r.fields.find((f) => f.fieldId === F2)!.growthNote).toMatch(/First/);
    expect(r.fields.find((f) => f.fieldId === F3)!.growthNote).toMatch(/fell/);
    expect(r.farmGrowthKgDmHaDay).toBeNull();
    expect(r.farmCoverChange).toBeNull();
  });

  it("records fields marked grazed or skipped on the walk", () => {
    const r = computeSurveyResults({ ...base, observations: [], surveyObservationIds: [], markedGrazedFieldIds: [F1], skippedFieldIds: [F2] });
    expect(r.fields.map((f) => f.status)).toEqual(["grazed", "skipped", "not_visited"]);
    expect(r.farmCoverKgDmHa).toBeNull();
  });
});
