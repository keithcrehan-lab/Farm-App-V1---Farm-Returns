import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: vi.fn(() => true) }));
vi.mock("@/server/cattle-real/real-service", () => ({ loadRealCattle: vi.fn() }));
vi.mock("@/server/cattle-real/group-record-edit", () => ({ groupMemberBreedsOf: vi.fn() }));

const db = vi.hoisted(() => ({
  inserted: [] as unknown[],
  fail: false,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table !== "livestock_individual_identity_corrections") throw new Error("unexpected table");
      return {
        insert: async (rows: unknown[]) => {
          if (db.fail) return { error: { code: "23514", message: "write refused" } };
          db.inserted.push(...rows);
          return { error: null };
        },
      };
    },
  })),
}));

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { loadRealCattle } from "@/server/cattle-real/real-service";
import { groupMemberBreedsOf } from "@/server/cattle-real/group-record-edit";
import { applyBreedToCurrentGroupMembers } from "./real-actions";

const farmId = "f0000000-0000-4000-8000-00000000000a";
const groupId = "6a000000-0000-4000-8000-000000000001";
const firstId = "a1000000-0000-4000-8000-000000000001";
const secondId = "a1000000-0000-4000-8000-000000000002";
const records = {
  farmId,
  records: {
    groupFacts: [{ groupRef: groupId, individuals: 2 }],
  },
  outputs: { snapshots: { [firstId]: {}, [secondId]: {} } },
};

const request = { groupId, breed: "Angus × Hereford", expectedAnimalIds: [firstId, secondId] };

beforeEach(() => {
  vi.clearAllMocks();
  db.inserted = [];
  db.fail = false;
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  vi.mocked(loadRealCattle).mockResolvedValue({ state: "OK", evaluation: records } as never);
  vi.mocked(groupMemberBreedsOf).mockReturnValue([
    { animalId: firstId, breed: "Charolais" },
    { animalId: secondId, breed: "Angus × Hereford" },
  ]);
});

describe("apply breed to all current group animals", () => {
  it("never runs without an explicit, valid request", async () => {
    expect(await applyBreedToCurrentGroupMembers({ ...request, expectedAnimalIds: [firstId, firstId] })).toMatchObject({
      ok: false, reason: "INVALID_REQUEST",
    });
    expect(loadRealCattle).not.toHaveBeenCalled();
    expect(db.inserted).toHaveLength(0);
  });

  it("writes only differing members with one atomic insert, keeping history", async () => {
    expect(await applyBreedToCurrentGroupMembers(request)).toEqual({ ok: true, updated: 1 });
    expect(db.inserted).toEqual([{
      farm_id: farmId, animal_id: firstId, fact: "breed",
      value: "Angus × Hereford", source: "Group details: explicitly applied breed to all members",
    }]);
    expect(revalidatePath).toHaveBeenCalledWith("/cattle", "layout");
  });

  it("refuses when a different animal has joined, even at the same headcount", async () => {
    vi.mocked(loadRealCattle).mockResolvedValue({
      state: "OK", evaluation: { ...records, outputs: { snapshots: { [firstId]: {}, [groupId]: {} } } },
    } as never);
    vi.mocked(groupMemberBreedsOf).mockReturnValue([
      { animalId: firstId, breed: "Charolais" },
      { animalId: groupId, breed: "Angus" },
    ]);
    expect(await applyBreedToCurrentGroupMembers(request)).toMatchObject({ ok: false, reason: "MEMBERS_CHANGED" });
    expect(db.inserted).toHaveLength(0);
  });

  it("refuses incomplete C1 snapshots instead of changing part of the group", async () => {
    vi.mocked(loadRealCattle).mockResolvedValue({
      state: "OK", evaluation: { ...records, outputs: { snapshots: { [firstId]: {} } } },
    } as never);
    expect(await applyBreedToCurrentGroupMembers(request)).toMatchObject({ ok: false, reason: "UNREADABLE_MEMBERS" });
    expect(db.inserted).toHaveLength(0);
  });

  it("returns an honest refusal when the single database statement fails", async () => {
    db.fail = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await applyBreedToCurrentGroupMembers(request)).toMatchObject({ ok: false, reason: "WRITE_FAILED" });
      expect(db.inserted).toHaveLength(0);
    } finally { spy.mockRestore(); }
  });

  it("never attempts the bulk write when there is no signed-in farm", async () => {
    vi.mocked(loadRealCattle).mockResolvedValue({ state: "NO_FARM" });
    expect(await applyBreedToCurrentGroupMembers(request)).toMatchObject({ ok: false, reason: "NOT_SIGNED_IN" });
    expect(db.inserted).toHaveLength(0);
  });

  it("rejects a group not in the signed-in farm", async () => {
    expect(await applyBreedToCurrentGroupMembers({ ...request, groupId: secondId })).toMatchObject({
      ok: false, reason: "GROUP_NOT_FOUND",
    });
    expect(db.inserted).toHaveLength(0);
  });
});
