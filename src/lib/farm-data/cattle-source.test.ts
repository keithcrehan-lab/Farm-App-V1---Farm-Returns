import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pilot Integration P1 — `readCattleSourceForCurrentFarm`: the farm comes from the signed-in user only, every query
 * is filtered by it, and a history longer than one response (or than the server's row cap) is read completely or
 * fails closed — never silently truncated. Mocks `@/lib/supabase/server` directly (same precedent as `jobs.test.ts`)
 * with a fake PostgREST that enforces its own max-rows cap and the farm filter.
 */
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("./farms", () => ({ getFarmForCurrentUser: vi.fn() }));
vi.mock("./livestock", () => ({ listLivestockGroupsForFarm: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { CATTLE_SOURCE_PAGE_SIZE, readCattleSourceForCurrentFarm } from "./cattle-source";
import { getFarmForCurrentUser } from "./farms";
import { listLivestockGroupsForFarm } from "./livestock";

const FARM_A = "aaaaaaaa-0000-4000-8000-000000000000";
const FARM_B = "bbbbbbbb-0000-4000-8000-000000000000";

type Row = { id: string; farm_id: string; created_at: string } & Record<string, unknown>;

/** A fake PostgREST: honours eq / order / range, caps each response at `cap` rows, reports an exact count. */
function fakeClient(tables: Record<string, Row[]>, opts: { cap: number; mutate?: (table: string, call: number) => void }) {
  const calls: { table: string; eq: [string, unknown][]; range: [number, number] | null }[] = [];
  const perTable: Record<string, number> = {};
  const from = (table: string) => {
    const call = { table, eq: [] as [string, unknown][], range: null as [number, number] | null };
    calls.push(call);
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => (call.eq.push([col, v]), q),
      order: () => q,
      range: (a: number, b: number) => {
        call.range = [a, b];
        const n = (perTable[table] = (perTable[table] ?? 0) + 1);
        opts.mutate?.(table, n);
        const rows = (tables[table] ?? [])
          .filter((r) => call.eq.every(([c, v]) => r[c] === v))
          .sort((x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : x.id < y.id ? -1 : 1));
        const page = rows.slice(a, Math.min(b + 1, a + opts.cap));
        return Promise.resolve({ data: page, error: null, count: rows.length });
      },
    };
    return q;
  };
  return { client: { from } as never, calls };
}

const animal = (i: number, farm = FARM_A): Row => ({ id: `${farm.slice(0, 8)}-a-${String(i).padStart(5, "0")}`, farm_id: farm, group_id: null, tag_number: `T${i}`, category: "steer", sex: null, breed: null, date_of_birth: null, goal_status: null, notes: null, created_at: "2026-08-01T09:00:00+00:00", updated_at: "2026-08-01T09:00:00+00:00" });
const weight = (i: number, farm = FARM_A): Row => ({ id: `${farm.slice(0, 8)}-w-${String(i).padStart(5, "0")}`, farm_id: farm, animal_id: `${farm.slice(0, 8)}-a-00000`, weight_kg: 300 + (i % 50), observed_date: "2026-09-01", source: "Farmer entered", created_at: `2026-09-01T10:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}+00:00` });

beforeEach(() => {
  vi.mocked(getFarmForCurrentUser).mockResolvedValue({ id: FARM_A } as never);
  vi.mocked(listLivestockGroupsForFarm).mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("Pilot P1 — cattle source read", () => {
  it("takes no farm argument: the farm is the signed-in user's, resolved server-side", () => {
    expect(readCattleSourceForCurrentFarm.length).toBe(0);
  });

  it("no signed-in farm → NO_FARM (no query runs)", async () => {
    vi.mocked(getFarmForCurrentUser).mockResolvedValue(null);
    const { client, calls } = fakeClient({}, { cap: 1000 });
    vi.mocked(createClient).mockResolvedValue(client);
    expect(await readCattleSourceForCurrentFarm()).toEqual({ state: "NO_FARM" });
    expect(calls).toEqual([]);
  });

  it("reads a weight history longer than one page AND than the server's row cap completely, in order", async () => {
    const weights = Array.from({ length: 2 * CATTLE_SOURCE_PAGE_SIZE + 350 }, (_, i) => weight(i));
    // The server returns at most 400 rows per response, below the requested page size: a short page is not the end.
    const { client, calls } = fakeClient({ livestock_individuals: [animal(0)], livestock_weight_observations: weights }, { cap: 400 });
    vi.mocked(createClient).mockResolvedValue(client);
    const r = await readCattleSourceForCurrentFarm();
    expect(r.state).toBe("OK");
    if (r.state !== "OK") return;
    expect(r.records.weights).toHaveLength(weights.length);
    expect(new Set(r.records.weights.map((w) => w.id)).size).toBe(weights.length);
    expect(calls.filter((c) => c.table === "livestock_weight_observations").length).toBeGreaterThan(5);
  });

  it("every query is filtered by the server-resolved farm: farm B's rows never arrive", async () => {
    const { client, calls } = fakeClient(
      { livestock_individuals: [animal(0), animal(1, FARM_B)], livestock_weight_observations: [weight(0), weight(1, FARM_B)] },
      { cap: 1000 },
    );
    vi.mocked(createClient).mockResolvedValue(client);
    const r = await readCattleSourceForCurrentFarm();
    if (r.state !== "OK") throw new Error(r.state);
    expect(r.records.farmId).toBe(FARM_A);
    expect([...r.records.animals, ...r.records.weights].every((x) => x.farm_id === FARM_A)).toBe(true);
    expect(calls.every((c) => c.eq.some(([col, v]) => col === "farm_id" && v === FARM_A))).toBe(true);
    expect(vi.mocked(listLivestockGroupsForFarm)).toHaveBeenCalledWith(FARM_A);
  });

  it("rows vanishing between pages (the count can't be met) → INCOMPLETE, never a short history", async () => {
    const weights = Array.from({ length: CATTLE_SOURCE_PAGE_SIZE + 10 }, (_, i) => weight(i));
    const tables = { livestock_individuals: [animal(0)], livestock_weight_observations: weights };
    const { client } = fakeClient(tables, {
      cap: 1000,
      mutate: (t, n) => {
        if (t === "livestock_weight_observations" && n === 2) tables.livestock_weight_observations = weights.slice(0, 500);
      },
    });
    vi.mocked(createClient).mockResolvedValue(client);
    expect(await readCattleSourceForCurrentFarm()).toEqual({ state: "INCOMPLETE" });
  });

  it("a response with no count → INCOMPLETE; a query error → UNAVAILABLE", async () => {
    const noCount = { from: () => { const q = { select: () => q, eq: () => q, order: () => q, range: () => Promise.resolve({ data: [], error: null, count: null }) }; return q; } };
    vi.mocked(createClient).mockResolvedValue(noCount as never);
    expect(await readCattleSourceForCurrentFarm()).toEqual({ state: "INCOMPLETE" });
    const failing = { from: () => { const q = { select: () => q, eq: () => q, order: () => q, range: () => Promise.resolve({ data: null, error: { message: "boom" }, count: null }) }; return q; } };
    vi.mocked(createClient).mockResolvedValue(failing as never);
    expect(await readCattleSourceForCurrentFarm()).toEqual({ state: "UNAVAILABLE" });
  });

  it("a full page of groups from the existing (unpaged) reader fails closed", async () => {
    vi.mocked(listLivestockGroupsForFarm).mockResolvedValue(Array.from({ length: CATTLE_SOURCE_PAGE_SIZE }, (_, i) => ({ id: `g${i}`, farmId: FARM_A }) as never));
    const { client } = fakeClient({}, { cap: 1000 });
    vi.mocked(createClient).mockResolvedValue(client);
    expect(await readCattleSourceForCurrentFarm()).toEqual({ state: "INCOMPLETE" });
  });
});
