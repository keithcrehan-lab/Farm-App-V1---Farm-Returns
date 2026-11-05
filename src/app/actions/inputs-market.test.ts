import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));
vi.mock("@/server/cattle-real/operational-view", () => ({ loadCattleOperationalView: vi.fn() }));
vi.mock("@/server/cattle-real/real-service", () => ({ loadRealCattle: vi.fn(), realGroupLiveweights: vi.fn() }));
vi.mock("./fertiliser-plan-overview", () => ({ getFertiliserPlanOverviewAction: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { loadCattleOperationalView } from "@/server/cattle-real/operational-view";
import { loadRealCattle, realGroupLiveweights } from "@/server/cattle-real/real-service";
import { getFertiliserPlanOverviewAction, type FertiliserPlanOverview } from "./fertiliser-plan-overview";
import { getInputsMarketViewAction } from "./inputs-market";
import { buildFertiliserStockBand } from "@/domain/fertiliser-stock";
import { deriveCattleGroupProductionPlanMetrics } from "@/domain/cattle-group-production-plan";
import { tracked, type Farm, type LivestockGroup } from "@/domain/types";

afterEach(() => vi.clearAllMocks());

const FARM = { id: "farm-1" } as Farm;
const GROUP = {
  id: "g-1",
  farmId: "farm-1",
  category: "steer",
  label: "Steers",
  count: tracked(10, "verified", "Farmer"),
  system: "housed",
  value: tracked(0, "estimated", "x"),
} as LivestockGroup;

function overview(): FertiliserPlanOverview {
  return {
    planningSeason: "2027",
    seasonLabel: "2027 season",
    stockColumns: [buildFertiliserStockBand({ product: "0-7-30", remainingRequirementKg: 1500 })],
    aggregation: { status: "READY", products: [] },
  } as unknown as FertiliserPlanOverview;
}

describe("getInputsMarketViewAction", () => {
  it("refuses without a server-resolved farm", async () => {
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(null);
    await expect(getInputsMarketViewAction("2026")).rejects.toThrow(/no farm/);
  });

  it("composes the fertiliser overview and the cattle plans for the requested season", async () => {
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(FARM);
    vi.mocked(getFertiliserPlanOverviewAction).mockResolvedValue(overview());
    vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([GROUP]);
    vi.mocked(loadRealCattle).mockResolvedValue({ state: "OK", evaluation: { farmId: "farm-1" } } as never);
    const liveweights = { "g-1": { state: "NOT_HELD" as const } };
    vi.mocked(realGroupLiveweights).mockReturnValue(liveweights);
    const plan = { groupId: "g-1", farmId: "farm-1", targetDate: "2099-01-10", concentrateKgHeadDay: 2 };
    vi.mocked(loadCattleOperationalView).mockResolvedValue({
      state: "OK",
      fields: [],
      groups: [
        {
          groupId: "g-1",
          category: "steer",
          system: "housed",
          headCount: 10,
          liveweight: { state: "NOT_HELD" },
          productionPlan: plan,
          productionMetrics: deriveCattleGroupProductionPlanMetrics({ plan, headCount: 10, asOfDate: "2099-01-01" }),
        },
      ],
    });

    const result = await getInputsMarketViewAction("2027");
    expect(getFertiliserPlanOverviewAction).toHaveBeenCalledWith("2027");
    // Liveweights resolved from the cattle evaluation, exactly as the Cattle workspace resolves them.
    expect(loadCattleOperationalView).toHaveBeenCalledWith("farm-1", [GROUP], expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), liveweights);
    expect(result.planningSeason).toBe("2027");
    expect(result.needs.fertiliser.status === "ready" && result.needs.fertiliser.summary.lines[0].toBuyKg).toBe(1500);
    // 2 kg × 10 head × 9 days.
    expect(result.needs.feed.status === "ready" && result.needs.feed.summary.lines[0].requirementKg).toBe(180);
  });

  it("fails each category independently", async () => {
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(FARM);
    vi.mocked(getFertiliserPlanOverviewAction).mockRejectedValue(new Error("down"));
    vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([]);
    vi.mocked(loadCattleOperationalView).mockResolvedValue({ state: "UNAVAILABLE", fields: [], groups: [] });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await getInputsMarketViewAction("2026");
    expect(result.needs.fertiliser.status).toBe("unavailable");
    expect(result.needs.feed.status).toBe("unavailable");
    expect(result.planningSeason).toBe("2026");
  });

  it("feed fails closed when the cattle evaluation can't resolve group liveweights (never a stale stored average)", async () => {
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(FARM);
    vi.mocked(getFertiliserPlanOverviewAction).mockResolvedValue(overview());
    vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([GROUP]);
    vi.mocked(loadRealCattle).mockResolvedValue({ state: "UNAVAILABLE" });
    const result = await getInputsMarketViewAction("2027");
    expect(loadCattleOperationalView).not.toHaveBeenCalled();
    expect(result.needs.feed.status).toBe("unavailable");
    expect(result.needs.fertiliser.status).toBe("ready");
  });
});
