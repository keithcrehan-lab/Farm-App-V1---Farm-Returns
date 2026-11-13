import { beforeEach, describe, expect, it, vi } from "vitest";
import { tracked, type Farm, type Field } from "@/domain/types";

const fake = vi.hoisted(() => ({
  fields: [] as unknown[],
  cycles: [] as unknown[],
  sessions: [] as unknown[],
  cycleRead: vi.fn(),
  sessionRead: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: fake.fields, error: null }),
        }),
      }),
    }),
  })),
}));
vi.mock("./mappers", () => ({
  rowToField: (value: unknown) => value,
  fieldToInsertRow: vi.fn(),
}));
vi.mock("./field-production-cycles", () => ({
  listFieldProductionCyclesForSeason: (...args: unknown[]) => {
    fake.cycleRead(...args);
    return Promise.resolve(fake.cycles);
  },
}));
vi.mock("./grazing-field-sessions", () => ({
  listGrazingFieldSessionsForFarm: (...args: unknown[]) => {
    fake.sessionRead(...args);
    return Promise.resolve(fake.sessions);
  },
}));

import { listFieldsForFarm } from "./fields";

const field: Field = {
  id: "field-1", farmId: "farm-1", name: "Lower Field",
  areaHa: 4, centroid: [0, 0], plannedUse: tracked("grazing", "farmer_adjusted", "Farmer"),
  fertility: { pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(2, "verified", "Lab") },
  history: [],
};
const farm: Farm = {
  id: "farm-1", name: "Farm", ownerName: "Farmer",
  location: {county: "Galway", centroid: [0, 0]}, primaryEnterprises: ["suckler_beef"], units: "metric",
  grazingProductionSystem: tracked("SUCKLER_CALF_TO_WEANING", "farmer_adjusted", "Farmer"),
};
const cycle = {
  id: "cycle-1", fieldId: field.id, season: String(new Date().getUTCFullYear()),
  cropSystem: "GRASS_GRAZING" as const, status: "active" as const,
  evidence: { cropSystem: { value: "GRASS_GRAZING", method: "FARMER_DECLARED", source: "Farmer" } },
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};
function movement(category: "suckler_cow" | "store") {
  return { id: category, farmId: farm.id, livestockGroupId: category, fieldId: field.id,
    startedAt: cycle.season + "-04-01", endedAt: cycle.season + "-05-01",
    headCountSnapshot: 5, livestockCategorySnapshot: category,
    livestockUnitsPerHeadSnapshot: 1, source: "Farmer", createdAt: cycle.season + "-04-01" };
}

beforeEach(() => {
  fake.fields = [field];
  fake.cycles = [cycle];
  fake.sessions = [];
  fake.cycleRead.mockClear();
  fake.sessionRead.mockClear();
});

describe("server field grazing-system hydration", () => {
  it("keeps a lightweight field read unchanged when resolution is not requested", async () => {
    const fields = await listFieldsForFarm(farm.id);
    expect(fields[0].grazingProductionSystemResolution).toBeUndefined();
    expect(fake.sessionRead).not.toHaveBeenCalled();
  });
  it("honours movements above a conflicting farm baseline", async () => {
    fake.sessions = [movement("suckler_cow"), movement("store")];
    const [resolved] = await listFieldsForFarm(farm.id, { farm, resolveGrazingSystems: true });
    expect(resolved.grazingProductionSystemResolution).toMatchObject({
      value: "SUCKLER_CALF_TO_BEEF", basis: "FIELD_MOVEMENTS",
    });
    expect(fake.sessionRead).toHaveBeenCalledWith(farm.id);
  });
  it("uses the declared farm baseline when movement evidence is ambiguous", async () => {
    fake.sessions = [movement("suckler_cow")];
    const [resolved] = await listFieldsForFarm(farm.id, { farm, resolveGrazingSystems: true });
    expect(resolved.grazingProductionSystemResolution).toMatchObject({
      value: "SUCKLER_CALF_TO_WEANING", basis: "FARM_BASELINE",
    });
  });
  it("does not invent a grazing system when no farm baseline exists", async () => {
    const [resolved] = await listFieldsForFarm(farm.id, {
      farm: { ...farm, grazingProductionSystem: undefined }, resolveGrazingSystems: true,
    });
    expect(resolved.grazingProductionSystemResolution).toMatchObject({
      value: null, basis: "UNRESOLVED",
    });
  });
  it("rejects a mismatch between the authorised farm and requested farm ID", async () => {
    await expect(listFieldsForFarm("another-farm", { farm, resolveGrazingSystems: true }))
      .rejects.toThrow(/Farm mismatch/);
  });
});
