import { beforeEach, describe, expect, it, vi } from "vitest";
import { tracked } from "@/domain/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/grazing-field-sessions", async () => {
  class GrazingMoveRejectedError extends Error {
    readonly code: string;
    constructor(code: string) { super(code); this.code = code; }
  }
  return {
    GrazingMoveRejectedError,
    listGrazingFieldSessionsForFarm: vi.fn(),
    recordGrazingFieldMove: vi.fn(),
  };
});

import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { listFieldsForFarm } from "@/lib/farm-data/fields";
import { listLivestockGroupsForFarm } from "@/lib/farm-data/livestock";
import { GrazingMoveRejectedError, listGrazingFieldSessionsForFarm, recordGrazingFieldMove } from "@/lib/farm-data/grazing-field-sessions";
import { loadGrazingMovementContextAction, moveLivestockGroupToFieldAction } from "./grazing-field-movements";

const FARM = { id: "farm-1", ownerName: "Keith" } as Awaited<ReturnType<typeof getFarmForCurrentUser>>;
const FIELD_A = { id: "field-a", farmId: "farm-1", name: "Home", areaHa: 5, centroid: [-8, 53], fertility: {}, history: [] } as Awaited<ReturnType<typeof listFieldsForFarm>>[number];
const FIELD_B = { ...FIELD_A, id: "field-b", name: "Back" };
const GROUP = {
  id: "group-1", farmId: "farm-1", category: "suckler_cow" as const, label: "Cows",
  count: tracked(20, "verified", "Keith"), system: "grazing" as const, value: tracked(0, "estimated", "Farm Return"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFarmForCurrentUser).mockResolvedValue(FARM);
  vi.mocked(listFieldsForFarm).mockResolvedValue([FIELD_A, FIELD_B]);
  vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([GROUP]);
  vi.mocked(listGrazingFieldSessionsForFarm).mockResolvedValue([]);
});

describe("grazing field movement actions", () => {
  it("loads the currently open field placement for each group", async () => {
    vi.mocked(listGrazingFieldSessionsForFarm).mockResolvedValue([{
      id: "session-1", farmId: "farm-1", livestockGroupId: "group-1", fieldId: "field-b",
      startedAt: "2026-05-01T00:00:00.000Z", headCountSnapshot: 20,
      livestockCategorySnapshot: "suckler_cow", livestockUnitsPerHeadSnapshot: 0.9,
      source: "Keith", createdAt: "2026-05-01T00:00:00.000Z",
    }]);
    const result = await loadGrazingMovementContextAction("field-a");
    expect(result.groups[0]).toMatchObject({ currentFieldId: "field-b", currentFieldName: "Back" });
  });

  it("refuses a group that is not in the signed-in farm's scoped group read", async () => {
    const result = await moveLivestockGroupToFieldAction({ livestockGroupId: "other-group", fieldId: "field-a", movedOn: "2026-05-02" });
    expect(result).toEqual({ status: "rejected", reasonCode: "GROUP_NOT_FOUND" });
    expect(recordGrazingFieldMove).not.toHaveBeenCalled();
  });

  it("records the move with farmer provenance and revalidates nutrient surfaces", async () => {
    vi.mocked(recordGrazingFieldMove).mockResolvedValue({
      id: "session-2", farmId: "farm-1", livestockGroupId: "group-1", fieldId: "field-a",
      startedAt: "2026-05-02T00:00:00.000Z", headCountSnapshot: 20,
      livestockCategorySnapshot: "suckler_cow", livestockUnitsPerHeadSnapshot: 0.9,
      source: "Keith", createdAt: "2026-05-02T00:00:00.000Z",
    });
    const result = await moveLivestockGroupToFieldAction({ livestockGroupId: "group-1", fieldId: "field-a", movedOn: "2026-05-02" });
    expect(result).toEqual({ status: "saved", sessionId: "session-2" });
    expect(recordGrazingFieldMove).toHaveBeenCalledWith({
      livestockGroupId: "group-1", fieldId: "field-a", startedAt: "2026-05-02T00:00:00.000Z", source: "Keith",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/fertiliser-plan");
    expect(revalidatePath).toHaveBeenCalledWith("/today/field/field-a");
  });

  it("surfaces a database movement rejection as a stable reason code", async () => {
    vi.mocked(recordGrazingFieldMove).mockRejectedValue(new GrazingMoveRejectedError("MOVE_NOT_AFTER_CURRENT_START"));
    await expect(moveLivestockGroupToFieldAction({ livestockGroupId: "group-1", fieldId: "field-a", movedOn: "2026-05-02" }))
      .resolves.toEqual({ status: "rejected", reasonCode: "MOVE_NOT_AFTER_CURRENT_START" });
  });
});
