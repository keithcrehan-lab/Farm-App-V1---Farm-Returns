import { describe, expect, it } from "vitest";
import type { Housing, SlurryAllocation } from "./types";
import { buildFarmSlurryStorageOverview } from "./slurry-storage";
import { resolveFieldSlurryAllocation } from "./nutrients";
import { buildSlurryPlanningEntry, validateNewSlurryAllocationPlan, type NewSlurryAllocationPlanInput } from "./slurry-allocation-plan";

function housing(id: string, capacityM3: number, fillPct: number, status: Housing["storageFillStatus"] = "farmer_recorded"): Housing {
  return {
    id,
    farmId: "farm-1",
    shedName: `Shed ${id}`,
    shedType: "slatted",
    linkedGroupIds: [],
    housingPeriod: { start: "2025-11-01", end: "2026-03-31" },
    slurryEstimate: {
      volumeM3: { value: 0, status: "estimated", source: "test" },
      availableN: { value: 0, status: "estimated", source: "test" },
      availableP: { value: 0, status: "estimated", source: "test" },
      availableK: { value: 0, status: "estimated", source: "test" },
      ruleSetVersion: "test",
    },
    storageCapacityM3: capacityM3,
    storageFillPct: fillPct,
    storageFillStatus: status,
  };
}

const fields = [{ id: "f1" }, { id: "f2" }, { id: "archived", archivedAt: "2026-01-01T00:00:00Z" }];
const housingList = [housing("h1", 200, 58), housing("h2", 100, 50)]; // 116 m³, 50 m³

function input(overrides: Partial<NewSlurryAllocationPlanInput> = {}): NewSlurryAllocationPlanInput {
  return { fieldId: "f1", housingId: "h1", volumeM3: "80", applicationMethod: "LESS", applicationDate: "2026-09-26", ...overrides };
}

describe("validateNewSlurryAllocationPlan", () => {
  it("accepts a complete plan and keeps exactly the farmer's own values", () => {
    const result = validateNewSlurryAllocationPlan(input(), { fields, housingList, allocations: [] });
    expect(result).toEqual(
      expect.objectContaining({
        status: "OK",
        value: { fieldId: "f1", housingId: "h1", volumeM3: 80, applicationMethod: "LESS", applicationDate: "2026-09-26", createsMultiSourcePlan: false },
      }),
    );
  });

  it("never defaults a missing field, store, volume, method or date", () => {
    const result = validateNewSlurryAllocationPlan({ fieldId: "", housingId: "", volumeM3: "", applicationMethod: "", applicationDate: "" }, { fields, housingList, allocations: [] });
    expect(result.status).toBe("INVALID");
    expect(result.status === "INVALID" && result.issues).toEqual(["FIELD_NOT_FOUND", "STORE_NOT_FOUND", "VOLUME_INVALID", "METHOD_INVALID", "DATE_INVALID"]);
  });

  it.each([["0"], ["-5"], ["abc"], ["  "]])("rejects volume %j", (volumeM3) => {
    const result = validateNewSlurryAllocationPlan(input({ volumeM3 }), { fields, housingList, allocations: [] });
    expect(result.status === "INVALID" && result.issues).toEqual(["VOLUME_INVALID"]);
  });

  it("accepts exactly the available volume the farmer was shown (no float-noise rejection)", () => {
    // 200 m³ × 58% is 115.99999999999999 in floating point.
    expect(validateNewSlurryAllocationPlan(input({ volumeM3: "116" }), { fields, housingList, allocations: [] }).status).toBe("OK");
  });

  it("rejects more slurry than the store has unallocated", () => {
    const result = validateNewSlurryAllocationPlan(input({ volumeM3: "117" }), { fields, housingList, allocations: [] });
    expect(result.status === "INVALID" && result.issues).toEqual(["VOLUME_EXCEEDS_AVAILABLE"]);
  });

  it("rejects archived or unknown fields, unknown stores, an unknown method and malformed dates", () => {
    expect(validateNewSlurryAllocationPlan(input({ fieldId: "archived" }), { fields, housingList, allocations: [] }).status).toBe("INVALID");
    expect(validateNewSlurryAllocationPlan(input({ housingId: "other-farm-store" }), { fields, housingList, allocations: [] }).status).toBe("INVALID");
    expect(validateNewSlurryAllocationPlan(input({ applicationMethod: "trailing_shoe" }), { fields, housingList, allocations: [] }).status).toBe("INVALID");
    expect(validateNewSlurryAllocationPlan(input({ applicationDate: "2026-02-30" }), { fields, housingList, allocations: [] }).status).toBe("INVALID");
  });

  it("rejects a second allocation for the same field and store", () => {
    const existing: SlurryAllocation = { fieldId: "f1", housingId: "h1", volumeM3: 10 };
    const result = validateNewSlurryAllocationPlan(input(), { fields, housingList, allocations: [existing] });
    expect(result.status === "INVALID" && result.issues).toContain("ALREADY_PLANNED_FROM_STORE");
  });

  it("flags a plan that would make the field multi-source, without blocking it", () => {
    const existing: SlurryAllocation = { fieldId: "f1", housingId: "h2", volumeM3: 10 };
    const result = validateNewSlurryAllocationPlan(input(), { fields, housingList, allocations: [existing] });
    expect(result.status === "OK" && result.value.createsMultiSourcePlan).toBe(true);
  });

  it("an unranked farmer-planned allocation is what the What Matters resolver sees for that field", () => {
    const planned: SlurryAllocation = { fieldId: "f1", housingId: "h1", volumeM3: 80 };
    expect(resolveFieldSlurryAllocation([planned], "f1")).toBe(planned);
    // Combining with another unranked allocation never invents a rank.
    const combined = resolveFieldSlurryAllocation([planned, { fieldId: "f1", housingId: "h2", volumeM3: 20 }], "f1");
    expect(combined?.priority).toBeUndefined();
    expect(combined?.score).toBeUndefined();
  });
});

describe("buildSlurryPlanningEntry", () => {
  const storage = buildFarmSlurryStorageOverview([housing("h1", 200, 58)], []);

  it("slurry available + fields open + zero allocations -> entry with the real count and volume", () => {
    expect(buildSlurryPlanningEntry({ plannedSlurryFieldCount: 0, openSlurryFieldCount: 10, storage })).toEqual({ openFieldCount: 10, availableVolumeM3: 116 });
  });

  it("omits the volume when a store's fill level is only an estimate", () => {
    const estimated = buildFarmSlurryStorageOverview([housing("h1", 200, 58, "estimated")], []);
    expect(buildSlurryPlanningEntry({ plannedSlurryFieldCount: 0, openSlurryFieldCount: 3, storage: estimated })).toEqual({ openFieldCount: 3 });
  });

  it("no entry once anything is planned, while the planned count is unknown, with no open field, or with no slurry available", () => {
    expect(buildSlurryPlanningEntry({ plannedSlurryFieldCount: 1, openSlurryFieldCount: 10, storage })).toBeUndefined();
    expect(buildSlurryPlanningEntry({ plannedSlurryFieldCount: undefined, openSlurryFieldCount: 10, storage })).toBeUndefined();
    expect(buildSlurryPlanningEntry({ plannedSlurryFieldCount: 0, openSlurryFieldCount: 0, storage })).toBeUndefined();
    const empty = buildFarmSlurryStorageOverview([housing("h1", 200, 0)], []);
    expect(buildSlurryPlanningEntry({ plannedSlurryFieldCount: 0, openSlurryFieldCount: 10, storage: empty })).toBeUndefined();
    const none = buildFarmSlurryStorageOverview([], []);
    expect(buildSlurryPlanningEntry({ plannedSlurryFieldCount: 0, openSlurryFieldCount: 10, storage: none })).toBeUndefined();
  });
});
