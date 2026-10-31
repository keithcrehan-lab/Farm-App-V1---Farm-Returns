import { describe, expect, it } from "vitest";
import { tracked, type LivestockGroup } from "./types";
import {
  calculateFieldGrazingPressure,
  organicNStockingRateFromLUHa,
  type GrazingFieldSession,
} from "./grazing-field-pressure";

const group = (id: string, overrides: Partial<LivestockGroup> = {}): LivestockGroup => ({
  id,
  farmId: "farm-1",
  category: "suckler_cow",
  label: id,
  count: tracked(20, "verified", "Farmer"),
  system: "grazing",
  value: tracked(0, "estimated", "Farm Return"),
  ...overrides,
});

const session = (
  id: string,
  groupId: string,
  fieldId: string,
  startedAt: string,
  endedAt?: string,
  overrides: Partial<GrazingFieldSession> = {},
): GrazingFieldSession => ({
  id,
  farmId: "farm-1",
  livestockGroupId: groupId,
  fieldId,
  startedAt,
  ...(endedAt ? { endedAt } : {}),
  headCountSnapshot: 20,
  livestockCategorySnapshot: "suckler_cow",
  livestockUnitsPerHeadSnapshot: 0.9,
  source: "Farmer",
  createdAt: startedAt,
  ...overrides,
});

describe("grazing field pressure", () => {
  it("uses the published Table 12-3 LU/ha to organic-N pairs", () => {
    expect(organicNStockingRateFromLUHa(1)).toBe(80);
    expect(organicNStockingRateFromLUHa(1.5)).toBe(118);
    expect(organicNStockingRateFromLUHa(3)).toBe(235);
    expect(organicNStockingRateFromLUHa(1.375)).toBeCloseTo(108.5, 8);
  });

  it("turns continuous field movement history into field-specific LU/ha", () => {
    const result = calculateFieldGrazingPressure({
      fieldId: "field-a",
      fieldAreaHa: 10,
      livestockGroups: [group("cows")],
      sessions: [
        session("a", "cows", "field-a", "2026-04-01T00:00:00.000Z", "2026-04-11T00:00:00.000Z"),
        session("b", "cows", "field-b", "2026-04-11T00:00:00.000Z"),
      ],
      seasonStart: "2026-01-01T00:00:00.000Z",
      asOf: "2026-04-21T00:00:00.000Z",
    });
    expect(result.status).toBe("READY");
    expect(result.trackingDays).toBe(20);
    expect(result.headDays).toBe(200);
    expect(result.livestockUnitDays).toBe(180);
    expect(result.averageStockingRateLUHa).toBeCloseTo(0.9, 8);
    // Table 12-3 is clamped to its lowest published row at <=1 LU/ha.
    expect(result.annualOrganicNStockingRateKgHa).toBe(80);
  });

  it("uses session snapshots so later herd edits do not rewrite historical pressure", () => {
    const result = calculateFieldGrazingPressure({
      fieldId: "field-a",
      fieldAreaHa: 5,
      livestockGroups: [group("cows", { count: tracked(50, "verified", "Farmer") })],
      sessions: [
        session("a", "cows", "field-a", "2026-05-01T00:00:00.000Z", undefined, {
          headCountSnapshot: 10,
          livestockUnitsPerHeadSnapshot: 0.9,
        }),
      ],
      seasonStart: "2026-01-01T00:00:00.000Z",
      asOf: "2026-05-11T00:00:00.000Z",
    });
    expect(result.status).toBe("READY");
    expect(result.headDays).toBe(100);
    expect(result.averageStockingRateLUHa).toBeCloseTo(1.8, 8);
  });

  it("fails closed when a currently grazing group has no field movement record", () => {
    const result = calculateFieldGrazingPressure({
      fieldId: "field-a",
      fieldAreaHa: 5,
      livestockGroups: [group("cows"), group("stores")],
      sessions: [session("a", "cows", "field-a", "2026-05-01T00:00:00.000Z")],
      seasonStart: "2026-01-01T00:00:00.000Z",
      asOf: "2026-05-11T00:00:00.000Z",
    });
    expect(result.status).toBe("INCOMPLETE_TRACKING");
    expect(result.missingGroupIds).toEqual(["stores"]);
  });

  it("fails closed on a gap in a group's location history", () => {
    const result = calculateFieldGrazingPressure({
      fieldId: "field-a",
      fieldAreaHa: 5,
      livestockGroups: [group("cows")],
      sessions: [
        session("a", "cows", "field-a", "2026-05-01T00:00:00.000Z", "2026-05-05T00:00:00.000Z"),
        session("b", "cows", "field-b", "2026-05-06T00:00:00.000Z"),
      ],
      seasonStart: "2026-01-01T00:00:00.000Z",
      asOf: "2026-05-11T00:00:00.000Z",
    });
    expect(result.status).toBe("INCOMPLETE_TRACKING");
    expect(result.missingGroupIds).toEqual(["cows"]);
  });
});
