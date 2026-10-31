import { describe, expect, it } from "vitest";
import { buildFarmSlurryForecast, buildSlurryStoreForecast, resolveSlurryStorageRate } from "./slurry-storage-forecast";
import { tracked, type Housing, type LivestockGroup, type SlurryAllocation } from "./types";

const group = (overrides: Partial<LivestockGroup> = {}): LivestockGroup => ({
  id: "g1", farmId: "farm", category: "suckler_cow", label: "Sucklers", count: tracked(10, "verified", "test"),
  system: "housed", housingId: "h1", value: tracked(1000, "estimated", "test"), ...overrides,
});
const store = (overrides: Partial<Housing> = {}): Housing => ({
  id: "h1", farmId: "farm", shedName: "Main tank", shedType: "slatted", linkedGroupIds: ["g1"],
  housingPeriod: { start: "2026-11-01", end: "2027-03-15" }, slurryEstimate: {} as Housing["slurryEstimate"],
  storageCapacityM3: 500, storageFillPct: 20, storageFillStatus: "farmer_recorded", storageFillRecordedAt: "2026-11-01T09:00:00.000Z", ...overrides,
});

describe("slurry storage rate — S.I. 588/2025 Table 2", () => {
  it("uses the published cattle rates and ages cattle forward across a band", () => {
    expect(resolveSlurryStorageRate(group(), "2026-11-01")).toMatchObject({ status: "READY", value: { m3PerHeadWeek: 0.29 } });
    expect(resolveSlurryStorageRate(group({ category: "weanling", avgAgeMonths: 17.5 }), "2026-11-01", "2026-11-01")).toMatchObject({ status: "READY", value: { m3PerHeadWeek: 0.15 } });
    expect(resolveSlurryStorageRate(group({ category: "weanling", avgAgeMonths: 17.5 }), "2026-12-01", "2026-11-01")).toMatchObject({ status: "READY", value: { m3PerHeadWeek: 0.26 } });
  });

  it("implements the dairy rate change on 1 October 2028", () => {
    const dairy = group({ category: "dairy_cow" });
    expect(resolveSlurryStorageRate(dairy, "2028-09-30")).toMatchObject({ status: "READY", value: { m3PerHeadWeek: 0.33 } });
    expect(resolveSlurryStorageRate(dairy, "2028-10-01")).toMatchObject({ status: "READY", value: { m3PerHeadWeek: 0.4 } });
  });
});

describe("buildSlurryStoreForecast", () => {
  it("does not backfill production before the recorded housing period begins", () => {
    const result = buildSlurryStoreForecast({ housing: store({ storageFillRecordedAt: "2026-10-20T09:00:00.000Z" }), livestockGroups: [group()], allocations: [], asOfDate: "2026-11-01", targetDate: "2026-11-08" });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.producedM3).toBeCloseTo(2.9, 6);
  });

  it("projects from the observed tank volume using housed cattle production", () => {
    const result = buildSlurryStoreForecast({ housing: store(), livestockGroups: [group()], allocations: [], asOfDate: "2026-11-01", targetDate: "2026-11-08" });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.currentReconciledM3).toBe(100);
    expect(result.producedM3).toBeCloseTo(2.9, 6); // 10 sucklers × 0.29 m3/week
    expect(result.projectedVolumeM3).toBeCloseTo(102.9, 6);
  });

  it("uses a future linked housing period for a group currently at grass", () => {
    const future = group({ system: "grazing", housingId: undefined });
    const result = buildSlurryStoreForecast({ housing: store(), livestockGroups: [future], allocations: [], asOfDate: "2026-10-01", targetDate: "2026-11-08" });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.producedM3).toBeCloseTo(2.9, 6);
  });

  it("subtracts existing planned reservations from volume available for a new future plan", () => {
    const allocations: SlurryAllocation[] = [{ fieldId: "f1", housingId: "h1", volumeM3: 60 }];
    const result = buildSlurryStoreForecast({ housing: store(), livestockGroups: [group()], allocations, asOfDate: "2026-11-01", targetDate: "2026-11-08" });
    expect(result.status).toBe("READY");
    if (result.status !== "READY") return;
    expect(result.reservedM3).toBe(60);
    expect(result.projectedAvailableForNewPlanM3).toBeCloseTo(42.9, 6);
  });

  it("fails closed when an age-dependent cattle group has no age", () => {
    const result = buildSlurryStoreForecast({ housing: store(), livestockGroups: [group({ category: "store", avgAgeMonths: undefined })], allocations: [], asOfDate: "2026-11-01", targetDate: "2026-12-01" });
    expect(result).toMatchObject({ status: "BLOCKED" });
  });

  it("does not apply slurry-tank rates to straw-bedded housing", () => {
    const result = buildSlurryStoreForecast({ housing: store({ shedType: "straw_bedded" }), livestockGroups: [group()], allocations: [], asOfDate: "2026-11-01", targetDate: "2026-12-01" });
    expect(result).toMatchObject({ status: "BLOCKED", reasonCodes: ["SLURRY_RATE_NOT_APPLICABLE_TO_NON_SLATTED_HOUSING"] });
  });
});

describe("buildFarmSlurryForecast", () => {
  it("aggregates only ready stores and exposes a future resource budget", () => {
    const result = buildFarmSlurryForecast({ housing: [store()], livestockGroups: [group()], allocations: [], asOfDate: "2026-11-01", targetDate: "2026-11-08" });
    expect(result.status).toBe("READY");
    expect(result.projectedAvailableForNewPlanM3).toBeCloseTo(102.9, 6);
  });
});
