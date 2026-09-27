import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/housing", () => ({ recordSlurryStoreObservation: vi.fn() }));
vi.mock("@/lib/farm-data/slurry", () => ({
  updatePlannedSlurryAllocation: vi.fn(),
  cancelPlannedSlurryAllocation: vi.fn(),
  completePlannedSlurryAllocation: vi.fn(),
}));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { recordSlurryStoreObservation } from "@/lib/farm-data/housing";
import { cancelPlannedSlurryAllocation, completePlannedSlurryAllocation, updatePlannedSlurryAllocation } from "@/lib/farm-data/slurry";
import { SlurryAllocationLifecycleRejectedError } from "@/domain/slurry-allocation-lifecycle";
import {
  cancelPlannedSlurryAllocationAction,
  completePlannedSlurryAllocationAction,
  recordSlurryStoreObservationAction,
  updatePlannedSlurryAllocationAction,
} from "./slurry-allocation-lifecycle";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getFarmForCurrentUser).mockResolvedValue({ id: "farm-a" } as never);
});

describe("slurry allocation lifecycle actions", () => {
  it("binds every write to the signed-in user's own farm, never a client-supplied one (O)", async () => {
    vi.mocked(cancelPlannedSlurryAllocation).mockResolvedValue({ status: "cancelled" } as never);
    await cancelPlannedSlurryAllocationAction("alloc-1");
    expect(cancelPlannedSlurryAllocation).toHaveBeenCalledWith("farm-a", "alloc-1");
  });

  it("refuses without a farm", async () => {
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(null as never);
    await expect(cancelPlannedSlurryAllocationAction("alloc-1")).rejects.toThrow("No farm found");
    expect(cancelPlannedSlurryAllocation).not.toHaveBeenCalled();
  });

  it("validates before any write", async () => {
    expect(await updatePlannedSlurryAllocationAction({ allocationId: "a", fieldId: "f", housingId: "h", volumeM3: "-3" })).toEqual({
      status: "rejected",
      issues: ["VOLUME_INVALID"],
    });
    expect(await completePlannedSlurryAllocationAction({ allocationId: "a", actualVolumeM3: "10", actualSpreadDate: "2999-01-01" })).toEqual({
      status: "rejected",
      issues: ["SPREAD_DATE_INVALID"],
    });
    expect(await recordSlurryStoreObservationAction({ housingId: "h", fillPct: "" }, [])).toEqual({ status: "rejected", issues: ["FILL_INVALID"] });
    expect(updatePlannedSlurryAllocation).not.toHaveBeenCalled();
    expect(completePlannedSlurryAllocation).not.toHaveBeenCalled();
    expect(recordSlurryStoreObservation).not.toHaveBeenCalled();
  });

  it("returns database refusals as issue codes (e.g. a second completion, a conflicting observation)", async () => {
    vi.mocked(completePlannedSlurryAllocation).mockRejectedValue(new SlurryAllocationLifecycleRejectedError(["ALREADY_COMPLETED"]));
    expect(await completePlannedSlurryAllocationAction({ allocationId: "a", actualVolumeM3: 10, actualSpreadDate: "2026-01-05" })).toEqual({
      status: "rejected",
      issues: ["ALREADY_COMPLETED"],
    });
    vi.mocked(recordSlurryStoreObservation).mockRejectedValue(new SlurryAllocationLifecycleRejectedError(["STORE_OBSERVATION_CONFLICT"]));
    expect(await recordSlurryStoreObservationAction({ housingId: "h", fillPct: 5 }, [])).toEqual({ status: "rejected", issues: ["STORE_OBSERVATION_CONFLICT"] });
  });

  it("passes the validated completion through unchanged — actual volume is never replaced by planned", async () => {
    vi.mocked(completePlannedSlurryAllocation).mockResolvedValue({ status: "completed" } as never);
    const result = await completePlannedSlurryAllocationAction({ allocationId: "a", actualVolumeM3: "42.5", actualSpreadDate: "2026-01-05" });
    expect(result.status).toBe("saved");
    expect(completePlannedSlurryAllocation).toHaveBeenCalledWith("farm-a", { allocationId: "a", actualVolumeM3: 42.5, actualSpreadDate: "2026-01-05" });
  });

  it("unexpected errors are not swallowed", async () => {
    vi.mocked(updatePlannedSlurryAllocation).mockRejectedValue(new Error("network"));
    await expect(updatePlannedSlurryAllocationAction({ allocationId: "a", fieldId: "f", housingId: "h", volumeM3: 5 })).rejects.toThrow("network");
  });
});
