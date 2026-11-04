import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tracked } from "@/domain/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/grazing-field-sessions", () => ({ listGrazingFieldSessionsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/grass-growth-forecasts", () => ({ listFarmGrassGrowthForecasts: vi.fn() }));
vi.mock("@/lib/farm-data/grass-management", () => ({
  insertGrassCoverObservation: vi.fn(),
  insertFarmGrassGrowthObservation: vi.fn(),
  listGrassCoverObservationsForFarm: vi.fn(),
  listFarmGrassGrowthObservations: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { listGrazingFieldSessionsForFarm } from "@/lib/farm-data/grazing-field-sessions";
import { listFarmGrassGrowthForecasts } from "@/lib/farm-data/grass-growth-forecasts";
import {
  insertFarmGrassGrowthObservation,
  insertGrassCoverObservation,
  listFarmGrassGrowthObservations,
  listGrassCoverObservationsForFarm,
} from "@/lib/farm-data/grass-management";
import {
  getGrassManagementDataAction,
  recordGrassCoverObservationAction,
  recordGrassGrowthObservationAction,
} from "./grass-management";

const FIELD_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ARCHIVED_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const FARM = { id: "farm-1", ownerName: "Keith" } as Awaited<ReturnType<typeof getFarmForCurrentUser>>;
const FIELD = { id: FIELD_ID, farmId: "farm-1", name: "Home", areaHa: 5, centroid: [-8, 53], fertility: {}, history: [] } as Awaited<ReturnType<typeof listFieldsForFarm>>[number];
const ARCHIVED = { ...FIELD, id: ARCHIVED_ID, name: "Old", archivedAt: "2026-01-01T00:00:00.000Z" };
const GROUP = {
  id: "group-1", farmId: "farm-1", category: "suckler_cow" as const, label: "Cows",
  count: tracked(20, "verified", "Keith"),
  avgWeightKg: tracked(650, "farmer_adjusted", "Keith"),
  system: "grazing" as const,
  value: tracked(0, "estimated", "Farm Return"),
};

const coverInput = {
  id: OBS_ID,
  fieldId: FIELD_ID,
  coverKgDmHa: 1450,
  method: "plate_meter",
  observedAt: "2026-05-08T12:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
  vi.mocked(getFarmForCurrentUser).mockResolvedValue(FARM);
  vi.mocked(listFieldsForFarm).mockResolvedValue([FIELD, ARCHIVED]);
  vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([GROUP]);
  vi.mocked(listGrazingFieldSessionsForFarm).mockResolvedValue([]);
  vi.mocked(listFarmGrassGrowthForecasts).mockResolvedValue([]);
  vi.mocked(listGrassCoverObservationsForFarm).mockResolvedValue([]);
  vi.mocked(listFarmGrassGrowthObservations).mockResolvedValue([]);
  vi.mocked(insertGrassCoverObservation).mockImplementation(async (input) => ({ ...input, createdAt: input.observedAt }));
  vi.mocked(insertFarmGrassGrowthObservation).mockImplementation(async (input) => ({ ...input, createdAt: input.observedAt }));
});

afterEach(() => vi.useRealTimers());

describe("recordGrassCoverObservationAction", () => {
  it("records with the signed-in farm, farmer provenance and revalidates /grass and /today", async () => {
    const result = await recordGrassCoverObservationAction({ ...coverInput, lat: 53.1, lng: -8.2, accuracyM: 5 });
    expect(result.status).toBe("saved");
    expect(insertGrassCoverObservation).toHaveBeenCalledWith({
      id: OBS_ID, farmId: "farm-1", fieldId: FIELD_ID, coverKgDmHa: 1450, method: "plate_meter",
      lat: 53.1, lng: -8.2, accuracyM: 5, observedAt: "2026-05-08T12:00:00.000Z", source: "Keith",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/grass");
    expect(revalidatePath).toHaveBeenCalledWith("/today");
  });

  it.each([
    ["non-UUID id", { id: "obs-1" }, "INVALID_ID"],
    ["non-UUID field", { fieldId: "field-a" }, "INVALID_FIELD_ID"],
    ["zero cover", { coverKgDmHa: 0 }, "INVALID_COVER"],
    ["NaN cover", { coverKgDmHa: Number.NaN }, "INVALID_COVER"],
    ["cover over ceiling", { coverKgDmHa: 10_001 }, "INVALID_COVER"],
    ["unknown method", { method: "drone" }, "INVALID_METHOD"],
    ["non-ISO timestamp", { observedAt: "2026-05-08" }, "INVALID_OBSERVED_AT"],
    ["far-future timestamp", { observedAt: "2026-05-11T12:00:00.000Z" }, "OBSERVED_AT_IN_FUTURE"],
    ["half GPS pair", { lat: 53.1 }, "INVALID_LOCATION"],
    ["lng out of range", { lat: 53.1, lng: -181 }, "INVALID_LOCATION"],
    ["accuracy without a fix", { accuracyM: 4 }, "INVALID_LOCATION"],
  ])("rejects %s before touching the database", async (_label, patch, reasonCode) => {
    await expect(recordGrassCoverObservationAction({ ...coverInput, ...patch })).resolves.toEqual({ status: "rejected", reasonCode });
    expect(insertGrassCoverObservation).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts a timestamp within device clock-skew tolerance", async () => {
    await expect(recordGrassCoverObservationAction({ ...coverInput, observedAt: "2026-05-10T12:04:00.000Z" })).resolves.toMatchObject({ status: "saved" });
  });

  it("refuses a field outside the farm's scoped read or archived", async () => {
    await expect(recordGrassCoverObservationAction({ ...coverInput, fieldId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }))
      .resolves.toEqual({ status: "rejected", reasonCode: "FIELD_NOT_FOUND" });
    await expect(recordGrassCoverObservationAction({ ...coverInput, fieldId: ARCHIVED_ID }))
      .resolves.toEqual({ status: "rejected", reasonCode: "FIELD_NOT_FOUND" });
    expect(insertGrassCoverObservation).not.toHaveBeenCalled();
  });

  it("requires a signed-in farm", async () => {
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(null);
    await expect(recordGrassCoverObservationAction(coverInput)).resolves.toEqual({ status: "rejected", reasonCode: "NO_FARM" });
  });
});

describe("recordGrassGrowthObservationAction", () => {
  const growthInput = { id: OBS_ID, growthRateKgDmHaDay: 55, origin: "farmer_entered", observedAt: "2026-05-09T08:00:00.000Z" };

  it("records farm growth with explicit origin", async () => {
    await expect(recordGrassGrowthObservationAction(growthInput)).resolves.toMatchObject({ status: "saved" });
    expect(insertFarmGrassGrowthObservation).toHaveBeenCalledWith({ ...growthInput, farmId: "farm-1", source: "Keith" });
    expect(revalidatePath).toHaveBeenCalledWith("/grass");
  });

  it.each([
    [{ growthRateKgDmHaDay: 0 }, "INVALID_GROWTH_RATE"],
    [{ growthRateKgDmHaDay: 501 }, "INVALID_GROWTH_RATE"],
    [{ origin: "guess" }, "INVALID_ORIGIN"],
    [{ observedAt: "2027-01-01T00:00:00.000Z" }, "OBSERVED_AT_IN_FUTURE"],
  ])("rejects %o", async (patch, reasonCode) => {
    await expect(recordGrassGrowthObservationAction({ ...growthInput, ...patch })).resolves.toEqual({ status: "rejected", reasonCode });
    expect(insertFarmGrassGrowthObservation).not.toHaveBeenCalled();
  });
});

describe("getGrassManagementDataAction", () => {
  it("returns observations and open grazing sessions with display context, active fields only", async () => {
    vi.mocked(listGrazingFieldSessionsForFarm).mockResolvedValue([
      {
        id: "s-open", farmId: "farm-1", livestockGroupId: "group-1", fieldId: FIELD_ID,
        startedAt: "2026-05-01T00:00:00.000Z", headCountSnapshot: 20,
        livestockCategorySnapshot: "suckler_cow", livestockUnitsPerHeadSnapshot: 0.9, source: "Keith", createdAt: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "s-closed", farmId: "farm-1", livestockGroupId: "group-1", fieldId: ARCHIVED_ID,
        startedAt: "2026-04-01T00:00:00.000Z", endedAt: "2026-05-01T00:00:00.000Z", headCountSnapshot: 20,
        livestockCategorySnapshot: "suckler_cow", livestockUnitsPerHeadSnapshot: 0.9, source: "Keith", createdAt: "2026-04-01T00:00:00.000Z",
      },
    ]);
    const data = await getGrassManagementDataAction();
    if (data.status !== "ok") throw new Error("expected ok");
    expect(data.fields).toEqual([{ id: FIELD_ID, name: "Home", areaHa: 5 }]);
    expect(data.grazingSessions).toHaveLength(2);
    expect(data.openGrazingSessions).toEqual([
      {
        sessionId: "s-open",
        fieldId: FIELD_ID,
        fieldName: "Home",
        livestockGroupId: "group-1",
        groupLabel: "Cows",
        category: "suckler_cow",
        headCountSnapshot: 20,
        startedAt: "2026-05-01T00:00:00.000Z",
        demand: {
          status: "resolved",
          provider: "beef_liveweight_v1",
          groupId: "group-1",
          category: "suckler_cow",
          headCount: 20,
          kgDmPerHeadDay: 13,
          dailyDemandKgDm: 260,
          confidence: "medium",
          ruleId: "TEAGASC_BEEF_GRAZING_2PCT_LW",
          source: expect.stringMatching(/Teagasc/i),
          evidence: expect.arrayContaining([
            expect.objectContaining({ key: "avg_weight_kg", value: 650, source: "Keith" }),
            expect.objectContaining({ key: "head_count", value: 20 }),
          ]),
        },
      },
    ]);
    expect(data.grazingSessions[1]).toMatchObject({
      sessionId: "s-closed",
      endedAt: "2026-05-01T00:00:00.000Z",
      demand: { status: "resolved", dailyDemandKgDm: 260 },
    });
    expect(listGrassCoverObservationsForFarm).toHaveBeenCalledWith("farm-1");
    expect(listFarmGrassGrowthObservations).toHaveBeenCalledWith("farm-1");
  });

  it("returns no_farm without reading data", async () => {
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(null);
    await expect(getGrassManagementDataAction()).resolves.toEqual({ status: "no_farm" });
    expect(listGrassCoverObservationsForFarm).not.toHaveBeenCalled();
  });
});
