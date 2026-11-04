import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import {
  GrassManagementRowError,
  insertFarmGrassGrowthObservation,
  insertGrassCoverObservation,
  listFarmGrassGrowthObservations,
  listGrassCoverObservationsForFarm,
  parseFarmGrassGrowthObservationRow,
  parseGrassCoverObservationRow,
  type FarmGrassGrowthObservationRow,
  type GrassCoverObservationRow,
} from "./grass-management";

const COVER_ROW: GrassCoverObservationRow = {
  id: "11111111-1111-4111-8111-111111111111",
  farm_id: "farm-1",
  field_id: "field-1",
  cover_kg_dm_ha: "1450",
  method: "plate_meter",
  lat: 53.1,
  lng: -8.2,
  accuracy_m: 4,
  observed_at: "2026-05-08T12:00:00+00:00",
  source: "Keith",
  created_at: "2026-05-08T12:00:01+00:00",
};

const GROWTH_ROW: FarmGrassGrowthObservationRow = {
  id: "22222222-2222-4222-8222-222222222222",
  farm_id: "farm-1",
  growth_rate_kg_dm_ha_day: 55,
  origin: "farmer_entered",
  observed_at: "2026-05-08T12:00:00+00:00",
  source: "Keith",
  created_at: "2026-05-08T12:00:01+00:00",
};

type Result = { data: unknown; error: { code?: string; message: string } | null };

/** Minimal chainable Supabase stub: records calls, returns scripted results. */
function fakeClient(results: { list?: Result; insert?: Result; byId?: Result }) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const builder = (table: string) => {
    let mode: "list" | "insert" | "byId" = "list";
    const chain = {
      select: (...args: unknown[]) => (calls.push({ table, op: "select", args }), chain),
      eq: (...args: unknown[]) => {
        calls.push({ table, op: "eq", args });
        if (args[0] === "id") mode = "byId";
        return chain;
      },
      order: (...args: unknown[]) => (calls.push({ table, op: "order", args }), chain),
      insert: (...args: unknown[]) => {
        calls.push({ table, op: "insert", args });
        mode = "insert";
        return chain;
      },
      single: async () => results.insert,
      maybeSingle: async () => results.byId,
      then: (resolve: (value: Result) => unknown) => resolve(results[mode] ?? results.list!),
    };
    return chain;
  };
  vi.mocked(createClient).mockResolvedValue({ from: builder } as never);
  return calls;
}

beforeEach(() => vi.clearAllMocks());

describe("grass row parsers", () => {
  it("parses numeric strings and both-or-neither GPS", () => {
    expect(parseGrassCoverObservationRow(COVER_ROW)).toMatchObject({ coverKgDmHa: 1450, lat: 53.1, lng: -8.2, accuracyM: 4 });
    const noGps = parseGrassCoverObservationRow({ ...COVER_ROW, lat: null, lng: null, accuracy_m: null });
    expect(noGps).not.toHaveProperty("lat");
    expect(noGps).not.toHaveProperty("accuracyM");
    expect(parseFarmGrassGrowthObservationRow(GROWTH_ROW)).toMatchObject({ growthRateKgDmHaDay: 55, origin: "farmer_entered" });
  });

  it.each([
    ["non-numeric cover", { cover_kg_dm_ha: "abc" }],
    ["zero cover", { cover_kg_dm_ha: 0 }],
    ["cover over ceiling", { cover_kg_dm_ha: 10_001 }],
    ["unknown method", { method: "drone" }],
    ["half GPS pair", { lng: null }],
    ["lat out of range", { lat: 91 }],
    ["negative accuracy", { accuracy_m: -1 }],
    ["bad timestamp", { observed_at: "yesterday" }],
    ["empty source", { source: " " }],
  ])("rejects a malformed cover row: %s", (_label, patch) => {
    expect(() => parseGrassCoverObservationRow({ ...COVER_ROW, ...patch } as GrassCoverObservationRow)).toThrow(GrassManagementRowError);
  });

  it.each([
    ["non-finite rate", { growth_rate_kg_dm_ha_day: "NaN" }],
    ["rate over ceiling", { growth_rate_kg_dm_ha_day: 501 }],
    ["unknown origin", { origin: "guess" }],
  ])("rejects a malformed growth row: %s", (_label, patch) => {
    expect(() => parseFarmGrassGrowthObservationRow({ ...GROWTH_ROW, ...patch } as FarmGrassGrowthObservationRow)).toThrow(GrassManagementRowError);
  });
});

describe("grass data access", () => {
  it("lists farm-scoped cover observations newest first and fails on a malformed row", async () => {
    const calls = fakeClient({ list: { data: [COVER_ROW], error: null } });
    await expect(listGrassCoverObservationsForFarm("farm-1")).resolves.toHaveLength(1);
    expect(calls).toContainEqual({ table: "grass_cover_observations", op: "eq", args: ["farm_id", "farm-1"] });
    expect(calls).toContainEqual({ table: "grass_cover_observations", op: "order", args: ["observed_at", { ascending: false }] });

    fakeClient({ list: { data: [{ ...COVER_ROW, method: "drone" }], error: null } });
    await expect(listGrassCoverObservationsForFarm("farm-1")).rejects.toThrow(GrassManagementRowError);
  });

  it("lists farm growth observations", async () => {
    const calls = fakeClient({ list: { data: [GROWTH_ROW], error: null } });
    await expect(listFarmGrassGrowthObservations("farm-1")).resolves.toMatchObject([{ growthRateKgDmHaDay: 55 }]);
    expect(calls).toContainEqual({ table: "farm_grass_growth_observations", op: "eq", args: ["farm_id", "farm-1"] });
  });

  const coverInput = {
    id: COVER_ROW.id,
    farmId: "farm-1",
    fieldId: "field-1",
    coverKgDmHa: 1450,
    method: "plate_meter" as const,
    lat: 53.1,
    lng: -8.2,
    accuracyM: 4,
    observedAt: "2026-05-08T12:00:00.000Z",
    source: "Keith",
  };

  it("inserts a cover observation with the client id and snake_case columns", async () => {
    const calls = fakeClient({ insert: { data: COVER_ROW, error: null } });
    await expect(insertGrassCoverObservation(coverInput)).resolves.toMatchObject({ id: COVER_ROW.id, coverKgDmHa: 1450 });
    expect(calls.find((call) => call.op === "insert")?.args[0]).toEqual({
      id: COVER_ROW.id,
      farm_id: "farm-1",
      field_id: "field-1",
      cover_kg_dm_ha: 1450,
      method: "plate_meter",
      lat: 53.1,
      lng: -8.2,
      accuracy_m: 4,
      observed_at: "2026-05-08T12:00:00.000Z",
      source: "Keith",
    });
  });

  it("an identical retry returns the stored row; a conflicting retry throws", async () => {
    const duplicate = { data: null, error: { code: "23505", message: "duplicate key" } };
    fakeClient({ insert: duplicate, byId: { data: COVER_ROW, error: null } });
    await expect(insertGrassCoverObservation(coverInput)).resolves.toMatchObject({ id: COVER_ROW.id });

    fakeClient({ insert: duplicate, byId: { data: COVER_ROW, error: null } });
    await expect(insertGrassCoverObservation({ ...coverInput, coverKgDmHa: 1500 })).rejects.toThrow(/different content/);
  });

  it("growth insert is retry-safe by id", async () => {
    const duplicate = { data: null, error: { code: "23505", message: "duplicate key" } };
    const input = {
      id: GROWTH_ROW.id,
      farmId: "farm-1",
      growthRateKgDmHaDay: 55,
      origin: "farmer_entered" as const,
      observedAt: "2026-05-08T12:00:00.000Z",
      source: "Keith",
    };
    fakeClient({ insert: duplicate, byId: { data: GROWTH_ROW, error: null } });
    await expect(insertFarmGrassGrowthObservation(input)).resolves.toMatchObject({ id: GROWTH_ROW.id });
    fakeClient({ insert: duplicate, byId: { data: GROWTH_ROW, error: null } });
    await expect(insertFarmGrassGrowthObservation({ ...input, origin: "sensor" })).rejects.toThrow(/different content/);
  });
});

describe("grass management migration", () => {
  const FILE = "20261103233622_grass_management_observations.sql";
  const sql = readFileSync(path.resolve(__dirname, "../../../supabase/migrations", FILE), "utf8").replace(/--[^\n]*/g, "");

  it("creates both tables with client ids and defensive numeric bounds", () => {
    expect(sql).toMatch(/create table public\.grass_cover_observations \(\s*id uuid primary key,/i);
    expect(sql).toMatch(/create table public\.farm_grass_growth_observations \(\s*id uuid primary key,/i);
    expect(sql).toMatch(/cover_kg_dm_ha > 0 and cover_kg_dm_ha <= 10000/i);
    expect(sql).toMatch(/growth_rate_kg_dm_ha_day > 0 and growth_rate_kg_dm_ha_day <= 500/i);
    expect(sql).toMatch(/method in \('plate_meter', 'visual_estimate', 'cut_and_weigh', 'manual_kg_dm_ha'\)/i);
    expect(sql).toMatch(/origin in \('farmer_entered', 'regional_estimate', 'sensor', 'external_api'\)/i);
    expect(sql).toMatch(/\(lat is null\) = \(lng is null\)/i);
  });

  it("enforces same-farm field ownership with the existing helper", () => {
    expect(sql).toMatch(/perform public\.assert_field_belongs_to_farm\(new\.field_id, new\.farm_id\)/i);
    expect(sql).toMatch(/before insert on public\.grass_cover_observations/i);
  });

  it("is append-only, owner-scoped and never security definer", () => {
    for (const table of ["grass_cover_observations", "farm_grass_growth_observations"]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, "i"));
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${table} from anon, authenticated`, "i"));
      expect(sql).toMatch(new RegExp(`grant select, insert on public\\.${table} to authenticated`, "i"));
      expect(sql).toMatch(new RegExp(`${table}_owner_select[\\s\\S]*f\\.user_id = \\(select auth\\.uid\\(\\)\\)`, "i"));
    }
    expect(sql).not.toMatch(/grant[^;]*(update|delete)/i);
    expect(sql).not.toMatch(/for (update|delete)/i);
    expect(sql).not.toMatch(/security definer/i);
  });
});
