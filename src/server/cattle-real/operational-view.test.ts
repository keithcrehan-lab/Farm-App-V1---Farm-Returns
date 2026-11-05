import { beforeEach, describe, expect, it, vi } from "vitest";
import { tracked, type LivestockGroup } from "@/domain/types";
import type { GroupLiveweight } from "@/domain/cattle/presentation";

vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/grazing-field-sessions", () => ({ listGrazingFieldSessionsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/cattle-group-production-plans", () => ({ listCattleGroupProductionPlansForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/housing", () => ({ listHousingForFarm: vi.fn() }));

import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listGrazingFieldSessionsForFarm } from "@/lib/farm-data/grazing-field-sessions";
import { listCattleGroupProductionPlansForFarm } from "@/lib/farm-data/cattle-group-production-plans";
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { loadCattleOperationalView } from "./operational-view";

const AS_OF = "2026-11-05";
const group = (id: string, o: Partial<LivestockGroup> = {}): LivestockGroup => ({
  id,
  farmId: "farm-1",
  category: "weanling",
  label: id,
  count: tracked(2, "verified", "Individual animal records"),
  avgWeightKg: tracked(999, "estimated", "Farm Return assumption"),
  system: "grazing",
  value: tracked(0, "estimated", "x"),
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listFieldsForFarm).mockResolvedValue([{ id: "field-1", name: "Home", areaHa: 4 }] as never);
  vi.mocked(listGrazingFieldSessionsForFarm).mockResolvedValue([]);
  vi.mocked(listCattleGroupProductionPlansForFarm).mockResolvedValue([]);
  vi.mocked(listHousingForFarm).mockResolvedValue([{ id: "shed-1", shedName: "Slatted shed" }] as never);
});

const FULL: GroupLiveweight = { state: "INDIVIDUAL_FULL", meanKg: 300, weighed: 2, members: 2, oldestAt: "2026-10-01T00:00:00Z", newestAt: "2026-10-02T00:00:00Z" };
const PARTIAL: GroupLiveweight = { state: "INDIVIDUAL_PARTIAL", coveredMeanKg: 300, weighed: 1, members: 2, oldestAt: "2026-10-01T00:00:00Z", newestAt: "2026-10-01T00:00:00Z" };

describe("operational view — individual liveweights are authoritative for production context", () => {
  it("full coverage: grass demand and plan metrics use the individual mean, never the stored legacy average", async () => {
    const g = group("g-full");
    const view = await loadCattleOperationalView("farm-1", [g], AS_OF, { "g-full": FULL });
    const v = view.groups[0];
    expect(v.liveweight).toEqual(FULL);
    expect(v.productionMetrics.currentWeightKg).toMatchObject({ status: "known", value: 300 });
    expect(v.grazingDemand?.status).toBe("resolved");
    expect(JSON.stringify(v.grazingDemand)).not.toMatch(/999/);
    // The stored average is never overwritten to synchronise.
    expect(g.avgWeightKg?.value).toBe(999);
  });

  it("partial coverage fails closed: no group current weight, no grass demand", async () => {
    const view = await loadCattleOperationalView("farm-1", [group("g-part")], AS_OF, { "g-part": PARTIAL });
    const v = view.groups[0];
    expect(v.productionMetrics.currentWeightKg.status).toBe("unknown");
    expect(v.grazingDemand?.status).toBe("unresolved");
  });

  it("a headcount-only group keeps its stored group average", async () => {
    const view = await loadCattleOperationalView("farm-1", [group("g-head", { count: tracked(20, "verified", "Keith") })], AS_OF, {});
    const v = view.groups[0];
    expect(v.liveweight).toEqual({ state: "GROUP_RECORD", kg: 999, source: "Farm Return assumption" });
    expect(v.productionMetrics.currentWeightKg).toMatchObject({ status: "known", value: 999 });
  });
});

describe("operational view — one authoritative management location", () => {
  it("a housed group carries its shed and the farm's sheds are offered", async () => {
    const view = await loadCattleOperationalView("farm-1", [group("g-h", { system: "housed", housingId: "shed-1" })], AS_OF, {});
    expect(view.housing).toEqual([{ id: "shed-1", name: "Slatted shed" }]);
    expect(view.groups[0].currentHousing).toEqual({ id: "shed-1", name: "Slatted shed" });
    expect(view.groups[0].currentField).toBeUndefined();
  });

  it("a grazing group's shed is never reported (housing only means something while housed)", async () => {
    vi.mocked(listGrazingFieldSessionsForFarm).mockResolvedValue([{ id: "s-1", farmId: "farm-1", livestockGroupId: "g-g", fieldId: "field-1", startedAt: "2026-10-01T00:00:00Z", headCountSnapshot: 2, livestockCategorySnapshot: "weanling", livestockUnitsPerHeadSnapshot: 0.3, source: "Keith", createdAt: "2026-10-01T00:00:00Z" }]);
    const view = await loadCattleOperationalView("farm-1", [group("g-g", { system: "grazing", housingId: "shed-1" })], AS_OF, {});
    expect(view.groups[0].currentField).toMatchObject({ id: "field-1", name: "Home" });
    expect(view.groups[0].currentHousing).toBeUndefined();
  });
});
