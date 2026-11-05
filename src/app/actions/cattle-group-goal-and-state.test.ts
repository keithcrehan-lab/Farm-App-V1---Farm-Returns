import { beforeEach, describe, expect, it, vi } from "vitest";
import { tracked, type LivestockGroup } from "@/domain/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/livestock", () => ({ listLivestockGroupsForFarm: vi.fn(), updateLivestockGroup: vi.fn() }));
vi.mock("@/lib/farm-data/cattle-group-production-plans", () => ({ saveCattleGroupProductionPlan: vi.fn(), listCattleGroupProductionPlansForFarm: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listLivestockGroupsForFarm, updateLivestockGroup } from "@/lib/farm-data/livestock";
import { saveCattleGroupProductionPlan } from "@/lib/farm-data/cattle-group-production-plans";
import { saveCattleGroupProductionPlanAction } from "./cattle-group-production-plan";
import { updateLivestockGroupAction } from "./farm";

const FARM = { id: "farm-1", ownerName: "Keith" } as Awaited<ReturnType<typeof getFarmForCurrentUser>>;
const STEERS: LivestockGroup = {
  id: "group-1", farmId: "farm-1", category: "steer", label: "Steers",
  count: tracked(10, "verified", "Keith"), system: "housed", value: tracked(0, "estimated", "Farm Return"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFarmForCurrentUser).mockResolvedValue(FARM);
  vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([STEERS]);
});

const plan = { groupId: "group-1", targetKg: null, targetDate: null, feedingSituation: null, silageQualityBasis: null, concentrateKgHeadDay: null, concentratePriceEurT: null, notes: null };

describe("group goal — set where the production target is set", () => {
  it("a chosen goal is written to the group record with the plan", async () => {
    expect(await saveCattleGroupProductionPlanAction({ ...plan, goal: "finish_slaughter" })).toEqual({ status: "saved" });
    expect(updateLivestockGroup).toHaveBeenCalledWith("group-1", { goal: "finish_slaughter", farmerName: "Keith" });
    expect(saveCattleGroupProductionPlan).toHaveBeenCalled();
  });

  it("an unchanged goal isn't rewritten; an absent goal is left as recorded", async () => {
    vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([{ ...STEERS, goal: "sell_store" }]);
    await saveCattleGroupProductionPlanAction({ ...plan, goal: "sell_store" });
    await saveCattleGroupProductionPlanAction(plan);
    expect(updateLivestockGroup).not.toHaveBeenCalled();
  });

  it("`null` clears a recorded goal", async () => {
    vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([{ ...STEERS, goal: "sell_store" }]);
    await saveCattleGroupProductionPlanAction({ ...plan, goal: null });
    expect(updateLivestockGroup).toHaveBeenCalledWith("group-1", { goal: null, farmerName: "Keith" });
  });

  it("an invalid goal or another farm's group is refused before anything is written", async () => {
    expect(await saveCattleGroupProductionPlanAction({ ...plan, goal: "win_show" as never })).toEqual({ status: "rejected", reasonCode: "GOAL_INVALID" });
    expect(await saveCattleGroupProductionPlanAction({ ...plan, groupId: "other-farm-group", goal: "grow" })).toEqual({ status: "rejected", reasonCode: "GROUP_NOT_FOUND" });
    expect(updateLivestockGroup).not.toHaveBeenCalled();
    expect(saveCattleGroupProductionPlan).not.toHaveBeenCalled();
  });
});

describe("management state — only the movement workflows change grazing/housed", () => {
  it("a generic group edit that sets system or housing is refused (one authoritative location)", async () => {
    await expect(updateLivestockGroupAction("group-1", { system: "housed", farmerName: "Keith" })).rejects.toThrow(/only by recording a move/);
    await expect(updateLivestockGroupAction("group-1", { housingId: "shed-1", farmerName: "Keith" })).rejects.toThrow(/only by recording a move/);
    await expect(updateLivestockGroupAction("group-1", { housingId: null, farmerName: "Keith" })).rejects.toThrow(/only by recording a move/);
    expect(updateLivestockGroup).not.toHaveBeenCalled();
  });
});
