import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/farm-data/regional-grass-admin", () => ({
  getRegionalGrassAdminClient: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { getRegionalGrassAdminClient } from "@/lib/farm-data/regional-grass-admin";
import { publishManualGrowthAction } from "./regional-grass-growth";

const insert = vi.fn(async (rows: unknown[]) => {
  expect(Array.isArray(rows)).toBe(true);
  return { error: null };
});
const maybeSingle = vi.fn(async (): Promise<{ data: { id: string } | null; error: null }> => ({ data: null, error: null }));
const client = {
  from: (table: string) => {
    if (table !== "regional_grass_growth") throw new Error("unexpected table");
    return {
      select: () => ({
        eq: () => ({
          neq: () => ({
            limit: () => ({ maybeSingle }),
          }),
        }),
      }),
      insert,
    };
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRegionalGrassAdminClient).mockResolvedValue({
    supabase: client as never,
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
});

describe("manual regional growth publication", () => {
  const input = {
    validFrom: "2026-11-13",
    validTo: "2026-11-19",
    imageUrl: "https://teagasc.ie/wp-content/uploads/growth-map.png",
    caption: "Teagasc MoSt growth map, week beginning 13 November",
    figures: [
      { county: "Galway", growth: 24.5 },
      { county: "Cork", growth: 20 },
    ],
  };

  it("inserts approved global county figures and invalidates Grass for all farm sessions", async () => {
    expect(await publishManualGrowthAction(input)).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = insert.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      county: "Galway", growth_kg_dm_ha_day: 24.5,
      status: "approved", valid_from: input.validFrom, valid_to: input.validTo,
      image_url: input.imageUrl,
    });
    expect(rows[1]).toMatchObject({ county: "Cork", growth_kg_dm_ha_day: 20 });
    expect(rows.every((row) => !("farm_id" in row))).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/grass");
    expect(revalidatePath).toHaveBeenCalledWith("/today");
  });

  it("rejects publishing from a non-admin before any database write", async () => {
    vi.mocked(getRegionalGrassAdminClient).mockResolvedValue(null);
    expect(await publishManualGrowthAction(input)).toEqual({ ok: false, error: "Admins only." });
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a second batch for the same forecast week", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id: "old" }, error: null });
    expect(await publishManualGrowthAction(input)).toEqual({ ok: false, error: "Figures for this week are already published." });
    expect(insert).not.toHaveBeenCalled();
  });
});
