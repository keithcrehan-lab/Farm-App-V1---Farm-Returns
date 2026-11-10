import { describe, expect, it } from "vitest";
import { computeSurveyResults, haversineM, trackDistanceM } from "./grass-survey";

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
    const p = (s: number, lat: number, accuracyM: number | null = 5) => ({ recordedAt: new Date(Date.UTC(2026, 10, 9, 7, 0, s)).toISOString(), lat, lng: -8.78, accuracyM });
    const d = trackDistanceM([p(0, 52.7), p(10, 52.70001), p(20, 52.701), p(30, 52.75, 400), p(40, 52.702)]);
    expect(d).toBeGreaterThan(215);
    expect(d).toBeLessThan(230);
    expect(haversineM(52.7, -8.78, 52.701, -8.78)).toBeCloseTo(111.2, 0);
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
