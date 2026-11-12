import { beforeEach, describe, expect, it, vi } from "vitest";
import { tracked } from "@/domain/types";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("@/lib/farm-data/fields", () => ({ listFieldsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/housing", () => ({ listHousingForFarm: vi.fn() }));
vi.mock("@/lib/farm-data/cattle-management-state", async () => {
  class HousingMoveRejectedError extends Error {
    readonly code: string;
    constructor(code: string) { super(code); this.code = code; }
  }
  return { HousingMoveRejectedError, recordGroupHousingMove: vi.fn() };
});
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
import { listHousingForFarm } from "@/lib/farm-data/housing";
import { HousingMoveRejectedError, recordGroupHousingMove } from "@/lib/farm-data/cattle-management-state";
import { listGrazingMovementGroupsAction, loadGrazingMovementContextAction, moveLivestockGroupToFieldAction, moveLivestockGroupToHousingAction } from "./grazing-field-movements";

const FARM = { id: "farm-1", ownerName: "Keith" } as Awaited<ReturnType<typeof getFarmForCurrentUser>>;
const FIELD_A = { id: "field-a", farmId: "farm-1", name: "Home", areaHa: 5, centroid: [-8, 53], fertility: {}, history: [] } as Awaited<ReturnType<typeof listFieldsForFarm>>[number];
const FIELD_B = { ...FIELD_A, id: "field-b", name: "Back" };
const GROUP = {
  id: "group-1", farmId: "farm-1", category: "suckler_cow" as const, label: "Cows",
  count: tracked(20, "verified", "Keith"), system: "grazing" as const, value: tracked(0, "estimated", "Farm Return"),
};

const SHED = { id: "shed-1", farmId: "farm-1", shedName: "Slatted shed", shedType: "slatted", linkedGroupIds: [], housingPeriod: { start: "2026-11-01", end: "2027-03-31" } } as unknown as Awaited<ReturnType<typeof listHousingForFarm>>[number];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getFarmForCurrentUser).mockResolvedValue(FARM);
  vi.mocked(listFieldsForFarm).mockResolvedValue([FIELD_A, FIELD_B]);
  vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([GROUP]);
  vi.mocked(listGrazingFieldSessionsForFarm).mockResolvedValue([]);
  vi.mocked(listHousingForFarm).mockResolvedValue([SHED]);
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
    expect(revalidatePath).toHaveBeenCalledWith("/grass");
    expect(revalidatePath).toHaveBeenCalledWith("/fertiliser-plan");
    expect(revalidatePath).toHaveBeenCalledWith("/today/field/field-a");
    // housing → grazing: the move clears housing, so Housing is revalidated too.
    expect(revalidatePath).toHaveBeenCalledWith("/housing");
  });

  it("surfaces a database movement rejection as a stable reason code", async () => {
    vi.mocked(recordGrazingFieldMove).mockRejectedValue(new GrazingMoveRejectedError("MOVE_NOT_AFTER_CURRENT_START"));
    await expect(moveLivestockGroupToFieldAction({ livestockGroupId: "group-1", fieldId: "field-a", movedOn: "2026-05-02" }))
      .resolves.toEqual({ status: "rejected", reasonCode: "MOVE_NOT_AFTER_CURRENT_START" });
  });
});

describe("moves from the Farm map (exact time)", () => {
  const session2 = {
    id: "session-2", farmId: "farm-1", livestockGroupId: "group-1", fieldId: "field-a",
    startedAt: "2026-11-12T18:05:00.000Z", headCountSnapshot: 20,
    livestockCategorySnapshot: "suckler_cow" as const, livestockUnitsPerHeadSnapshot: 0.9,
    source: "Keith", createdAt: "2026-11-12T18:05:00.000Z",
  };

  it("records the exact time given, so a group can be moved more than once in a day", async () => {
    vi.mocked(recordGrazingFieldMove).mockResolvedValue(session2);
    const movedAt = new Date(Date.now() - 60 * 60_000).toISOString();
    const result = await moveLivestockGroupToFieldAction({ livestockGroupId: "group-1", fieldId: "field-a", movedAt });
    expect(result).toEqual({ status: "saved", sessionId: "session-2" });
    expect(recordGrazingFieldMove).toHaveBeenCalledWith({ livestockGroupId: "group-1", fieldId: "field-a", startedAt: movedAt, source: "Keith" });
  });

  it("refuses a time in the future, more than a year back, or not a time at all, and writes nothing", async () => {
    for (const movedAt of [new Date(Date.now() + 60 * 60_000).toISOString(), new Date(Date.now() - 400 * 86_400_000).toISOString(), "yesterday"]) {
      expect(await moveLivestockGroupToFieldAction({ livestockGroupId: "group-1", fieldId: "field-a", movedAt })).toEqual({ status: "rejected", reasonCode: "INVALID_MOVE_TIME" });
    }
    expect(await moveLivestockGroupToFieldAction({ livestockGroupId: "group-1", fieldId: "field-a" })).toEqual({ status: "rejected", reasonCode: "INVALID_MOVE_DATE" });
    expect(recordGrazingFieldMove).not.toHaveBeenCalled();
    expect(getFarmForCurrentUser).not.toHaveBeenCalled();
  });

  it("refuses an exact time before the group's last grazing record ended (e.g. before it was housed)", async () => {
    vi.mocked(listGrazingFieldSessionsForFarm).mockResolvedValue([{ ...session2, fieldId: "field-b", startedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(), endedAt: new Date(Date.now() - 5 * 86_400_000).toISOString() }]);
    const before = new Date(Date.now() - 7 * 86_400_000).toISOString();
    expect(await moveLivestockGroupToFieldAction({ livestockGroupId: "group-1", fieldId: "field-a", movedAt: before })).toEqual({ status: "rejected", reasonCode: "MOVE_BEFORE_LAST_RECORD" });
    expect(recordGrazingFieldMove).not.toHaveBeenCalled();
    vi.mocked(recordGrazingFieldMove).mockResolvedValue(session2);
    const after = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(await moveLivestockGroupToFieldAction({ livestockGroupId: "group-1", fieldId: "field-a", movedAt: after })).toEqual({ status: "saved", sessionId: "session-2" });
  });

  it("lists every group with animals and the field it is grazing now, for the signed-in farm only", async () => {
    vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([GROUP, { ...GROUP, id: "group-empty", label: "Empty", count: tracked(0, "verified", "Keith") }]);
    vi.mocked(listGrazingFieldSessionsForFarm).mockResolvedValue([{ ...session2, fieldId: "field-b" }]);
    expect(await listGrazingMovementGroupsAction()).toEqual([
      expect.objectContaining({ id: "group-1", label: "Cows", headCount: 20, currentFieldId: "field-b", currentFieldName: "Back", currentSince: session2.startedAt }),
    ]);
    expect(listFieldsForFarm).toHaveBeenCalledWith("farm-1");
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(null);
    expect(await listGrazingMovementGroupsAction()).toEqual([]);
  });
});

describe("housing movement action (grazing → housed)", () => {
  const move = (o: Partial<{ livestockGroupId: string; housingId: string; housedOn: string }> = {}) =>
    moveLivestockGroupToHousingAction({ livestockGroupId: "group-1", housingId: "shed-1", housedOn: "2026-11-03", ...o });

  it("records the move with farmer provenance, closes the open grazing session and revalidates every surface", async () => {
    vi.mocked(recordGroupHousingMove).mockResolvedValue({ closedSessionId: "session-1", closedFieldId: "field-b", changed: true });
    expect(await move()).toEqual({ status: "saved", closedSessionId: "session-1" });
    expect(recordGroupHousingMove).toHaveBeenCalledWith({ livestockGroupId: "group-1", housingId: "shed-1", housedAt: "2026-11-03T00:00:00.000Z", source: "Keith" });
    for (const path of ["/cattle", "/cattle/groups/group-1", "/housing", "/grass", "/fields", "/fertiliser-plan", "/today/field/field-b"]) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
  });

  it("a group with no open session is housed without a field to revalidate", async () => {
    vi.mocked(recordGroupHousingMove).mockResolvedValue({ closedSessionId: null, closedFieldId: null, changed: true });
    expect(await move()).toEqual({ status: "saved", closedSessionId: null });
    expect(vi.mocked(revalidatePath).mock.calls.some(([p]) => String(p).startsWith("/today/field/"))).toBe(false);
  });

  it("the same state again (already in that shed) is unchanged and revalidates nothing", async () => {
    vi.mocked(recordGroupHousingMove).mockResolvedValue({ closedSessionId: null, closedFieldId: null, changed: false });
    expect(await move()).toEqual({ status: "unchanged" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses another farm's (or an unknown) group or shed before any write", async () => {
    expect(await move({ livestockGroupId: "other-group" })).toEqual({ status: "rejected", reasonCode: "GROUP_NOT_FOUND" });
    expect(await move({ housingId: "other-farm-shed" })).toEqual({ status: "rejected", reasonCode: "HOUSING_NOT_FOUND" });
    expect(recordGroupHousingMove).not.toHaveBeenCalled();
  });

  it("refuses an invalid date and a signed-out request", async () => {
    expect(await move({ housedOn: "03/11/2026" })).toEqual({ status: "rejected", reasonCode: "INVALID_MOVE_DATE" });
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(null);
    expect(await move()).toEqual({ status: "rejected", reasonCode: "NO_FARM" });
    expect(recordGroupHousingMove).not.toHaveBeenCalled();
  });

  it("a housing date not after the open session's start is the database's stable rejection (history preserved)", async () => {
    vi.mocked(recordGroupHousingMove).mockRejectedValue(new HousingMoveRejectedError("MOVE_NOT_AFTER_CURRENT_START"));
    expect(await move()).toEqual({ status: "rejected", reasonCode: "MOVE_NOT_AFTER_CURRENT_START" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
