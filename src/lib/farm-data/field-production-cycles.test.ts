import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = {
  update: vi.fn(),
  eq: vi.fn(),
};
let response: { data: unknown; error: unknown };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const query = {
        update: (payload: unknown) => { calls.update(payload); return query; },
        eq: (column: string, value: unknown) => { calls.eq(column, value); return query; },
        select: () => query,
        maybeSingle: async () => response,
      };
      return query;
    },
  }),
}));

import { updateFieldProductionCycleCropIfUnchanged } from "./field-production-cycles";

const input = {
  id: "cycle-1",
  expectedUpdatedAt: "2026-11-06T10:00:00.123456+00:00",
  cropSystem: "GRASS_HAY" as const,
  evidence: { cropSystem: { value: "GRASS_HAY" as const, method: "FARMER_DECLARED" as const, source: "Keith" } },
};

describe("updateFieldProductionCycleCropIfUnchanged", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    response = {
      data: { id: "cycle-1", field_id: "a", season: "2026", crop_system: "GRASS_HAY", status: "closed", start_date: "2026-02-01", end_date: null, evidence: input.evidence, created_at: "c", updated_at: "u" },
      error: null,
    };
  });

  it("writes only the crop and its evidence, conditional on the revision that was read", async () => {
    const saved = await updateFieldProductionCycleCropIfUnchanged(input);
    expect(calls.update).toHaveBeenCalledWith({ crop_system: "GRASS_HAY", evidence: input.evidence });
    expect(calls.eq.mock.calls).toEqual([["id", "cycle-1"], ["updated_at", input.expectedUpdatedAt]]);
    expect(saved).toMatchObject({ id: "cycle-1", cropSystem: "GRASS_HAY", status: "closed", startDate: "2026-02-01" });
  });

  it("returns null when the database matched no row, because the cycle has moved on", async () => {
    response = { data: null, error: null };
    await expect(updateFieldProductionCycleCropIfUnchanged(input)).resolves.toBeNull();
  });

  it("throws a database error rather than reporting it as a conflict", async () => {
    response = { data: null, error: new Error("write failed") };
    await expect(updateFieldProductionCycleCropIfUnchanged(input)).rejects.toThrow("write failed");
  });
});
