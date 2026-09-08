import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/individual-animals", () => ({ listIndividualAnimalsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/slurry", () => ({ listSlurryAllocationsForFarm: vi.fn() }));
vi.mock("@/orchestration/fertiliser-plan", () => ({ getFarmFertiliserDemand: vi.fn() }));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listIndividualAnimalsForFarm } from "@/lib/farm-data/individual-animals";
import { listSlurryAllocationsForFarm } from "@/lib/farm-data/slurry";
import { getFarmFertiliserDemand } from "@/orchestration/fertiliser-plan";
import { buildFarmContext, getFarmContextForCurrentUser, type FarmContextInputs } from "./index";
import type { Farm, Field, IndividualAnimal, LivestockGroup } from "@/domain/types";

const mockGetFarm = vi.mocked(getFarmForCurrentUser);
const mockListFields = vi.mocked(listFieldsForFarm);
const mockListGroups = vi.mocked(listLivestockGroupsForFarm);
const mockListAnimals = vi.mocked(listIndividualAnimalsForFarm);
const mockListSlurryAllocations = vi.mocked(listSlurryAllocationsForFarm);
const mockGetFarmFertiliserDemand = vi.mocked(getFarmFertiliserDemand);

afterEach(() => {
  vi.clearAllMocks();
});

const FARM_A: Farm = {
  id: "farm-a",
  name: "Farm A",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Farmer A",
};

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-a",
    name: "Home Field",
    areaHa: 4.5,
    centroid: [0, 0],
    fertility: {},
    history: [],
    ...overrides,
  };
}

function group(overrides: Partial<LivestockGroup> = {}): LivestockGroup {
  return {
    id: "group-1",
    farmId: "farm-a",
    category: "suckler_cow",
    label: "Cows",
    count: { value: 20, status: "verified", source: "Farmer entered" },
    system: "grazing",
    value: { value: 30000, status: "estimated", source: "Farm Return estimate" },
    ...overrides,
  };
}

function animal(overrides: Partial<IndividualAnimal> = {}): IndividualAnimal {
  return {
    id: "animal-1",
    farmId: "farm-a",
    category: "suckler_cow",
    ...overrides,
  };
}

const BASE_INPUTS: FarmContextInputs = {
  farm: FARM_A,
  fields: [field()],
  livestockGroups: [group()],
  individualAnimals: [animal()],
  fertiliserDemand: [],
};

const NOW = "2026-09-08T09:00:00.000Z";

describe("buildFarmContext", () => {
  it("assembles a bounded, farm-scoped snapshot from real farm-data shapes", () => {
    const context = buildFarmContext("farm-a", BASE_INPUTS, NOW);
    expect(context.farmId).toBe("farm-a");
    expect(context.generatedAt).toBe(NOW);
    expect(context.farm).toEqual({ name: "Farm A", county: "Cork", enterprises: ["suckler_beef"] });
    expect(context.fields).toEqual([{ id: "field-1", name: "Home Field", areaHa: 4.5 }]);
    expect(context.animalGroups).toEqual([{ id: "group-1", label: "Cows", category: "suckler_cow", count: { value: 20, status: "verified", source: "Farmer entered" } }]);
    expect(context.individualAnimalCount).toBe(1);
    expect(context.fertiliserDemand).toEqual([]);
  });

  it("Fertiliser Vertical campaign, item 21 — maps real farm-wide fertiliser demand rows into the context, never recomputing them", () => {
    const context = buildFarmContext(
      "farm-a",
      {
        ...BASE_INPUTS,
        fertiliserDemand: [
          { product: "18-6-12", npkAnalysis: "18-6-12", recommendedTotalKg: 1000, recommendedTotalCostEur: 620, fieldsCount: 2, plannedTotalKg: 400, confirmedAppliedTotalKg: 300, remainingTotalKg: 700 },
        ],
      },
      NOW,
    );
    expect(context.fertiliserDemand).toEqual([
      { product: "18-6-12", npkAnalysis: "18-6-12", unit: "kg", totalRequirementKg: 1000, plannedRequirementKg: 400, confirmedRequirementKg: 300, remainingRequirementKg: 700 },
    ]);
  });

  it("Codex audit LOW (round 2): copies farm.primaryEnterprises — mutating the caller's own farm object after the fact never changes an already-generated snapshot", () => {
    const farm = { ...FARM_A, primaryEnterprises: [...FARM_A.primaryEnterprises] };
    const context = buildFarmContext("farm-a", { ...BASE_INPUTS, farm }, NOW);
    farm.primaryEnterprises.push("dairy");
    expect(context.farm.enterprises).toEqual(["suckler_beef"]);
  });

  it("Codex audit HIGH (round 1): preserves each TrackedValue's own status/source, not just its bare value — a future AI answer must be able to tell farmer-verified from estimated", () => {
    const context = buildFarmContext(
      "farm-a",
      { ...BASE_INPUTS, fields: [field({ plannedUse: { value: "grazing", status: "estimated", source: "Default" } })], livestockGroups: [group({ count: { value: 15, status: "unavailable", source: "Not yet counted" } })] },
      NOW,
    );
    expect(context.fields[0].plannedUse).toEqual({ value: "grazing", status: "estimated", source: "Default" });
    expect(context.animalGroups[0].count).toEqual({ value: 15, status: "unavailable", source: "Not yet counted" });
  });

  it("includes plannedUse only when a field actually has one — never a fabricated value", () => {
    const withUse = buildFarmContext("farm-a", { ...BASE_INPUTS, fields: [field({ plannedUse: { value: "grazing", status: "estimated", source: "Default" } })] }, NOW);
    expect(withUse.fields[0].plannedUse?.value).toBe("grazing");
    const withoutUse = buildFarmContext("farm-a", BASE_INPUTS, NOW);
    expect(withoutUse.fields[0].plannedUse).toBeUndefined();
  });

  it("throws when the supplied farm itself does not match the requested farmId", () => {
    expect(() => buildFarmContext("farm-b", BASE_INPUTS, NOW)).toThrow(/farm mismatch/);
  });

  it("Codex-relevant farm-scoping regression: silently drops any field/group/animal whose own farmId does not match, rather than including cross-farm data", () => {
    const crossFarmInputs: FarmContextInputs = {
      farm: FARM_A,
      fields: [field({ id: "field-mine", farmId: "farm-a" }), field({ id: "field-not-mine", farmId: "farm-b" })],
      livestockGroups: [group({ id: "group-mine", farmId: "farm-a" }), group({ id: "group-not-mine", farmId: "farm-b" })],
      individualAnimals: [animal({ id: "animal-mine", farmId: "farm-a" }), animal({ id: "animal-not-mine", farmId: "farm-b" })],
      fertiliserDemand: [],
    };
    const context = buildFarmContext("farm-a", crossFarmInputs, NOW);
    expect(context.fields.map((f) => f.id)).toEqual(["field-mine"]);
    expect(context.animalGroups.map((g) => g.id)).toEqual(["group-mine"]);
    expect(context.individualAnimalCount).toBe(1); // the cross-farm animal never counted
  });

  it("never dumps the whole database — the snapshot shape is bounded to a fixed, small set of fields", () => {
    const context = buildFarmContext("farm-a", BASE_INPUTS, NOW);
    expect(Object.keys(context).sort()).toEqual([
      "animalGroups",
      "farm",
      "farmId",
      "fertiliserDemand",
      "fields",
      "generatedAt",
      "individualAnimalCount",
    ]);
  });
});

describe("getFarmContextForCurrentUser", () => {
  it("returns null when there is genuinely no farm for the current session — never a fabricated empty context", async () => {
    mockGetFarm.mockResolvedValue(null);
    const context = await getFarmContextForCurrentUser();
    expect(context).toBeNull();
    expect(mockListFields).not.toHaveBeenCalled();
  });

  it("resolves the current session's own farm and assembles its real context — never accepts a caller-supplied farm id (there is no such parameter)", async () => {
    mockGetFarm.mockResolvedValue(FARM_A);
    mockListFields.mockResolvedValue([field()]);
    mockListGroups.mockResolvedValue([group()]);
    mockListAnimals.mockResolvedValue([animal()]);
    mockListSlurryAllocations.mockResolvedValue([]);
    mockGetFarmFertiliserDemand.mockResolvedValue({ demand: [], truncated: false });

    const context = await getFarmContextForCurrentUser();

    expect(mockListFields).toHaveBeenCalledWith("farm-a");
    expect(mockListGroups).toHaveBeenCalledWith("farm-a");
    expect(mockListAnimals).toHaveBeenCalledWith("farm-a");
    expect(mockListSlurryAllocations).toHaveBeenCalledWith("farm-a");
    expect(mockGetFarmFertiliserDemand).toHaveBeenCalledWith(expect.objectContaining({ farmId: "farm-a" }));
    expect(context?.farmId).toBe("farm-a");
    expect(context?.fields).toHaveLength(1);
  });
});
