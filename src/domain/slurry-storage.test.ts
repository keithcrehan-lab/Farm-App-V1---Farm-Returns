import { describe, expect, it } from "vitest";
import { buildFarmSlurryStorageOverview, buildSlurryTankView } from "./slurry-storage";
import { tracked } from "./types";
import type { Housing, SlurryAllocation } from "./types";

function makeHousing(overrides: Partial<Housing> = {}): Housing {
  return {
    id: "h1",
    farmId: "farm-1",
    shedName: "Shed 1",
    shedType: "slatted",
    linkedGroupIds: [],
    housingPeriod: { start: "2026-11-01", end: "2027-03-15" },
    storageCapacityM3: 200,
    storageFillPct: 50,
    storageFillStatus: "farmer_recorded",
    storageFillRecordedAt: "2026-12-12T00:00:00.000Z",
    slurryEstimate: {
      volumeM3: tracked(999999, "estimated", "slurry_engine_v1.0.0 (mock)"),
      availableN: tracked(0, "estimated", "x"),
      availableP: tracked(0, "estimated", "x"),
      availableK: tracked(0, "estimated", "x"),
      ruleSetVersion: "test",
    },
    ...overrides,
  };
}

function allocation(overrides: Partial<SlurryAllocation> = {}): SlurryAllocation {
  return { fieldId: "f1", housingId: "h1", priority: "high", volumeM3: 10, score: 1, ...overrides };
}

describe("buildSlurryTankView", () => {
  it("matches the concept reference's own worked example: 100 m3 / 200 m3 = 50%", () => {
    const view = buildSlurryTankView(makeHousing({ storageCapacityM3: 200, storageFillPct: 50 }), []);
    expect(view.volumeM3).toBe(100);
    expect(view.fillPct).toBe(50);
  });

  it("never reads the placeholder projected-production slurryEstimate for volume", () => {
    const view = buildSlurryTankView(makeHousing({ storageCapacityM3: 200, storageFillPct: 50 }), []);
    // slurryEstimate.volumeM3 above is a wildly different placeholder
    // (999999) -- the real view must never pick it up.
    expect(view.volumeM3).not.toBe(999999);
  });

  it("computes allocated/unallocated from real slurry_allocations rows, scoped to this housing", () => {
    const allocations = [allocation({ housingId: "h1", volumeM3: 60 }), allocation({ housingId: "h1", volumeM3: 10 }), allocation({ housingId: "h2", volumeM3: 500 })];
    const view = buildSlurryTankView(makeHousing({ storageCapacityM3: 200, storageFillPct: 50 }), allocations);
    expect(view.allocatedM3).toBe(70);
    expect(view.unallocatedM3).toBe(30);
    expect(view.allocationExceedsVolume).toBe(false);
  });

  it("never lets unallocated go negative, and discloses when allocation exceeds real volume", () => {
    const allocations = [allocation({ housingId: "h1", volumeM3: 150 })];
    const view = buildSlurryTankView(makeHousing({ storageCapacityM3: 200, storageFillPct: 50 }), allocations); // volume = 100
    expect(view.unallocatedM3).toBe(0);
    expect(view.allocationExceedsVolume).toBe(true);
  });

  it("carries the real recorded/estimated status and timestamp through unmodified", () => {
    const estimated = buildSlurryTankView(makeHousing({ storageFillStatus: "estimated", storageFillRecordedAt: undefined }), []);
    expect(estimated.status).toBe("estimated");
    expect(estimated.recordedAt).toBeUndefined();
  });
});

describe("buildFarmSlurryStorageOverview", () => {
  it("computes overall fill as total volume / total capacity, NOT an average of each tank's percentage", () => {
    // Tank A: 1000 m3 capacity, 90% full -> 900 m3. Tank B: 100 m3 capacity, 10% full -> 10 m3.
    // Average of percentages would say 50% -- the real total-volume/total-capacity answer is very different.
    const housingList = [
      makeHousing({ id: "a", storageCapacityM3: 1000, storageFillPct: 90 }),
      makeHousing({ id: "b", storageCapacityM3: 100, storageFillPct: 10 }),
    ];
    const overview = buildFarmSlurryStorageOverview(housingList, []);
    expect(overview.totalCapacityM3).toBe(1100);
    expect(overview.totalVolumeM3).toBe(910);
    expect(overview.farmFillPct).not.toBeCloseTo(50, 0);
    expect(overview.farmFillPct).toBeCloseTo((910 / 1100) * 100, 5);
  });

  it("handles zero total capacity safely (no real housing yet)", () => {
    const overview = buildFarmSlurryStorageOverview([], []);
    expect(overview.totalCapacityM3).toBe(0);
    expect(overview.farmFillPct).toBe(0);
    expect(overview.tanks).toEqual([]);
  });

  it("sums allocated across every tank for the farm-wide total", () => {
    const housingList = [makeHousing({ id: "a", storageCapacityM3: 200, storageFillPct: 50 }), makeHousing({ id: "b", storageCapacityM3: 300, storageFillPct: 40 })];
    const allocations = [allocation({ housingId: "a", volumeM3: 30 }), allocation({ housingId: "b", volumeM3: 20 })];
    const overview = buildFarmSlurryStorageOverview(housingList, allocations);
    expect(overview.totalAllocatedM3).toBe(50);
    expect(overview.totalUnallocatedM3).toBe(overview.totalVolumeM3 - 50);
  });
});
