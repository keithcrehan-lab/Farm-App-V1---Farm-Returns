import { beforeEach, describe, expect, it, vi } from "vitest";
import { tracked, type Field } from "@/domain/types";
import type { FieldProductionCycle } from "@/domain/fertiliser-field-evidence";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/field-production-cycles", () => ({
  getFieldProductionCycle: vi.fn(),
  upsertFieldProductionCycle: vi.fn(),
}));

import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { getFieldProductionCycle, upsertFieldProductionCycle } from "@/lib/farm-data/field-production-cycles";
import { loadFieldProductionCycleAction, saveFieldProductionCycleAction } from "./fertiliser-field-evidence";

const farm = { id: "farm-1", ownerName: "Keith" } as Awaited<ReturnType<typeof getFarmForCurrentUser>>;
const field: Field = {
  id: "field-1",
  farmId: "farm-1",
  name: "Back Meadow",
  areaHa: 4,
  centroid: [-8, 53],
  fertility: {
    pIndex: tracked(2, "verified", "Lab"),
    kIndex: tracked(3, "verified", "Lab"),
    verifiedTest: { sampleDate: "2026-01-10", laboratory: "Lab", sampleRef: "S1", p: 4, k: 90, pH: 6.3 },
  },
  history: [],
};

const savedCycle = (overrides: Partial<FieldProductionCycle> = {}): FieldProductionCycle => ({
  id: "cycle-1",
  fieldId: "field-1",
  season: "2026",
  cropSystem: "GRASS_GRAZING",
  status: "active",
  evidence: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("fertiliser field evidence actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(farm);
    vi.mocked(listFieldsForFarm).mockResolvedValue([field]);
    vi.mocked(getFieldProductionCycle).mockResolvedValue(null);
  });

  it("refuses to expose a cycle for a field outside the signed-in farm", async () => {
    vi.mocked(listFieldsForFarm).mockResolvedValue([]);
    await expect(loadFieldProductionCycleAction("other-field", "2026")).resolves.toEqual({ cycle: null, gate: null });
    expect(getFieldProductionCycle).not.toHaveBeenCalled();
  });

  it("persists explicit zero applications as farmer evidence and returns a ready grazing gate", async () => {
    const cycle = savedCycle({
      evidence: {
        cropSystem: { value: "GRASS_GRAZING", method: "FARMER_DECLARED", source: "Keith" },
        chemicalNAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Keith" },
        chemicalPAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Keith" },
        chemicalKAppliedKgHa: { value: 0, method: "FARMER_DECLARED", source: "Keith" },
      },
    });
    vi.mocked(upsertFieldProductionCycle).mockResolvedValue(cycle);

    const result = await saveFieldProductionCycleAction({
      fieldId: "field-1",
      season: "2026",
      cropSystem: "GRASS_GRAZING",
      chemicalNAppliedKgHa: 0,
      chemicalPAppliedKgHa: 0,
      chemicalKAppliedKgHa: 0,
      farmerName: "Keith",
    });

    expect(upsertFieldProductionCycle).toHaveBeenCalledWith(expect.objectContaining({
      fieldId: "field-1",
      season: "2026",
      cropSystem: "GRASS_GRAZING",
      evidence: expect.objectContaining({
        chemicalNAppliedKgHa: expect.objectContaining({ value: 0, method: "FARMER_DECLARED", source: "Keith" }),
        chemicalPAppliedKgHa: expect.objectContaining({ value: 0, method: "FARMER_DECLARED", source: "Keith" }),
        chemicalKAppliedKgHa: expect.objectContaining({ value: 0, method: "FARMER_DECLARED", source: "Keith" }),
      }),
    }));
    expect(result.gate?.status).toBe("READY_FOR_CALCULATION");
  });

  it("chains prior evidence instead of overwriting provenance on edit", async () => {
    const previous = savedCycle({
      evidence: {
        cropSystem: { value: "GRASS_GRAZING", method: "FARMER_DECLARED", source: "Keith", observedAt: "2026-01-01T00:00:00.000Z" },
        chemicalNAppliedKgHa: { value: 20, method: "FARMER_DECLARED", source: "Keith", observedAt: "2026-02-01T00:00:00.000Z" },
      },
    });
    vi.mocked(getFieldProductionCycle).mockResolvedValue(previous);
    vi.mocked(upsertFieldProductionCycle).mockImplementation(async (input) => savedCycle({ cropSystem: input.cropSystem, evidence: input.evidence }));

    await saveFieldProductionCycleAction({
      fieldId: "field-1",
      season: "2026",
      cropSystem: "GRASS_GRAZING",
      chemicalNAppliedKgHa: 35,
      farmerName: "Keith",
    });

    expect(upsertFieldProductionCycle).toHaveBeenCalledWith(expect.objectContaining({
      evidence: expect.objectContaining({
        chemicalNAppliedKgHa: expect.objectContaining({
          value: 35,
          previous: expect.objectContaining({ value: 20, source: "Keith" }),
        }),
      }),
    }));
  });

  it("records kale without ever making it a grassland-ready pathway", async () => {
    vi.mocked(upsertFieldProductionCycle).mockResolvedValue(savedCycle({ cropSystem: "FORAGE_KALE", evidence: { cropSystem: { value: "FORAGE_KALE", method: "FARMER_DECLARED", source: "Keith" } } }));
    const result = await saveFieldProductionCycleAction({
      fieldId: "field-1",
      season: "2026",
      cropSystem: "FORAGE_KALE",
      farmerName: "Keith",
    });
    expect(result.gate?.status).toBe("UNSUPPORTED_PATHWAY");
    expect(result.gate?.cropFamily).toBe("forage_brassica");
  });
});
