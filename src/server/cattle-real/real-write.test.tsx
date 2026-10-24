import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pilot Integration P2 — the real Record Weight write, end to end below the network:
 * action (`real-actions.ts`) → server-resolved farm → farm-scoped animal check → idempotent insert into
 * `livestock_weight_observations` → the P1 read (`cattle-source` → `real-records` → `real-service` → frozen engines).
 *
 * The database is an in-memory PostgREST stand-in that enforces what the real one does for these tables: the owner
 * RLS policies (rows of the signed-in user's farm only), the primary key (23505), the animal foreign key (23503) and
 * the same-farm trigger. The repository code (`individual-animals.ts`, `cattle-source.ts`) runs unmodified on top.
 * Rows are production-shaped; the synthetic demonstration herd is never used as a source.
 */

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  /** The signed-in user's farm (`null` = signed out). RLS and `getFarmForCurrentUser` both follow it. */
  currentFarm: null as string | null,
  /** Make the next weight insert fail like a database outage. */
  failNextInsert: false,
  inserts: 0,
}));

vi.mock("@/lib/supabase/server", () => {
  type Row = Record<string, unknown>;
  const visible = (table: string) => (db.tables[table] ?? []).filter((r) => r.farm_id === db.currentFarm);
  function query(table: string) {
    const filters: [string, unknown][] = [];
    let range: [number, number] | null = null;
    let insertRow: Row | null = null;
    let single = false;
    let maybe = false;
    let wantCount = false;
    const run = (): { data: unknown; error: unknown; count?: number | null } => {
      if (insertRow) {
        if (db.failNextInsert) {
          db.failNextInsert = false;
          return { data: null, error: { code: "08006", message: "connection failure" } };
        }
        const row = insertRow;
        // RLS `with check`: only the signed-in owner's farm.
        if (row.farm_id !== db.currentFarm) return { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
        const all = (db.tables[table] ??= []);
        if (row.id !== undefined && all.some((r) => r.id === row.id)) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        if (table === "livestock_weight_observations") {
          const animal = (db.tables.livestock_individuals ?? []).find((a) => a.id === row.animal_id);
          if (!animal) return { data: null, error: { code: "23503", message: "violates foreign key constraint" } };
          if (animal.farm_id !== row.farm_id) return { data: null, error: { code: "P0001", message: "animal does not belong to farm" } };
        }
        const stored = { id: row.id ?? `gen-${all.length}`, created_at: new Date(Date.UTC(2026, 9, 24, 9, 0, db.inserts)).toISOString(), ...row };
        db.inserts += 1;
        all.push(stored);
        return { data: { ...stored }, error: null };
      }
      let rows = visible(table).filter((r) => filters.every(([c, v]) => r[c] === v));
      rows = [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
      const count = rows.length;
      if (range) rows = rows.slice(range[0], range[1] + 1);
      if (single || maybe) return rows.length === 1 ? { data: { ...rows[0] }, error: null } : maybe && rows.length === 0 ? { data: null, error: null } : { data: null, error: { code: "PGRST116" } };
      return { data: rows.map((r) => ({ ...r })), error: null, count: wantCount ? count : null };
    };
    const q = {
      select: (_c?: string, o?: { count?: string }) => ((wantCount = o?.count === "exact"), q),
      insert: (row: Row) => ((insertRow = row), q),
      eq: (c: string, v: unknown) => (filters.push([c, v]), q),
      order: () => q,
      range: (a: number, b: number) => ((range = [a, b]), q),
      single: () => ((single = true), Promise.resolve(run())),
      maybeSingle: () => ((maybe = true), Promise.resolve(run())),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  }
  return { createClient: vi.fn(async () => ({ from: (t: string) => query(t) })) };
});
vi.mock("@/lib/farm-data/farms", () => ({ getFarmForCurrentUser: vi.fn(async () => (db.currentFarm ? { id: db.currentFarm } : null)) }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: vi.fn(() => true), requireSupabaseEnv: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh }) }));

import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listWeightObservationsForFarm } from "@/lib/farm-data/individual-animals";
import { recordRealCattleWeight } from "@/app/(app)/cattle/real-actions";
import { RealAnimalProfileScreen } from "@/components/cattle/AnimalProfileScreen";
import { HerdScreen } from "@/components/cattle/HerdScreens";
import { CattleDemoSessionProvider } from "@/components/cattle/session/CattleDemoSessionProvider";
import { EMPTY_CATTLE_DEMO_SESSION } from "@/components/cattle/session/demo-session";
import { demoHerdView } from "@/server/cattle-demo/demo-service";
import { irelandCalendarDate, readRecordWeightRequest } from "./record-weight";
import { loadRealCattle, realAnimalView } from "./real-service";

const FARM_A = "f0000000-0000-4000-8000-00000000000a";
const FARM_B = "f0000000-0000-4000-8000-00000000000b";
const G_A = "6a000000-0000-4000-8000-000000000001";
const A1 = "a1000000-0000-4000-8000-000000000001"; // two weights already
const A2 = "a1000000-0000-4000-8000-000000000002"; // no weight yet
const B1 = "b1000000-0000-4000-8000-000000000001"; // farm B
let seq = 0;
const reqId = () => `9e000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const TODAY = () => irelandCalendarDate(new Date());

function seed() {
  db.currentFarm = FARM_A;
  db.failNextInsert = false;
  db.inserts = 0;
  const g = (id: string, farm: string, label: string) => ({ id, farm_id: farm, category: "steer", label, count: { value: 2, status: "verified", source: "x" }, avg_weight_kg: null, avg_age_months: null, breed: null, sex: null, system: "grazing", housing_id: null, goal: null, value: { value: 0, status: "estimated", source: "x" }, status_label: null, avg_milk_yield_kg_per_year: null, created_at: "2026-06-01T08:00:00+00:00", updated_at: "2026-06-01T08:00:00+00:00" });
  const a = (id: string, farm: string, group: string | null, tag: string | null) => ({ id, farm_id: farm, group_id: group, tag_number: tag, category: "steer", sex: "male", breed: "Charolais", date_of_birth: "2025-03-01", goal_status: null, notes: null, created_at: "2026-06-01T08:00:00+00:00", updated_at: "2026-06-01T08:00:00+00:00" });
  const w = (id: string, farm: string, animal: string, date: string, kg: number) => ({ id, farm_id: farm, animal_id: animal, weight_kg: kg, observed_date: date, source: "Farmer entered", created_at: `${date}T18:00:00+00:00` });
  db.tables = {
    livestock_groups: [g(G_A, FARM_A, "Bullocks"), g("6b000000-0000-4000-8000-000000000001", FARM_B, "B group")],
    livestock_individuals: [a(A1, FARM_A, G_A, "IE 1"), a(A2, FARM_A, G_A, "IE 2"), a(B1, FARM_B, "6b000000-0000-4000-8000-000000000001", "IE B")],
    livestock_weight_observations: [
      w("c0000000-0000-4000-8000-000000000001", FARM_A, A1, "2026-08-01", 400),
      w("c0000000-0000-4000-8000-000000000002", FARM_A, A1, "2026-09-01", 430),
      w("c0000000-0000-4000-8000-000000000003", FARM_B, B1, "2026-09-01", 610),
    ],
  };
}

async function profile(id: string) {
  const r = await loadRealCattle();
  if (r.state !== "OK") throw new Error(r.state);
  return realAnimalView(r.evaluation, id)!.profile;
}
const weightRows = () => db.tables.livestock_weight_observations;

beforeEach(() => {
  seed();
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  vi.mocked(revalidatePath).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Pilot P2 — read/write", () => {
  it("1–6: a valid weight persists for the server-resolved farm and real animal, and every later read has it", async () => {
    const id = reqId();
    const r = await recordRealCattleWeight({ requestId: id, animalId: A1, weightText: "452.5", observedDate: "2026-10-01" });
    expect(r).toEqual({ ok: true, observationId: id, replayed: false });
    const row = weightRows().find((x) => x.id === id)!;
    expect(row).toMatchObject({ farm_id: FARM_A, animal_id: A1, weight_kg: 452.5, observed_date: "2026-10-01", source: "Farmer entered" });
    // The next real read (and a reload — the same read again) shows it.
    for (let i = 0; i < 2; i++) {
      const p = await profile(A1);
      expect(p.weight.state === "KNOWN" && [p.weight.kg, p.weight.observedAt.slice(0, 10)]).toEqual([452.5, "2026-10-01"]);
      expect(p.timeline.state === "ITEMS" && p.timeline.items.some((t) => t.id === `weight:${id}`)).toBe(true);
    }
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/cattle", "layout");
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/livestock");
  });

  it("7: /livestock's own reader sees the same persisted row (one store, no sync)", async () => {
    const id = reqId();
    await recordRealCattleWeight({ requestId: id, animalId: A2, weightText: "388", observedDate: null });
    const livestock = await listWeightObservationsForFarm(FARM_A);
    expect(livestock.find((o) => o.id === id)).toEqual({ id, animalId: A2, weightKg: 388, observedDate: TODAY(), source: "Farmer entered" });
  });
});

describe("Pilot P2 — the frozen engines recompute from the stored rows", () => {
  it("8/10: a later weight becomes the latest and the gain is recomputed", async () => {
    const before = await profile(A1);
    expect(before.metrics.gain.value).toBe("0.97"); // 400 → 430 over 31 days
    await recordRealCattleWeight({ requestId: reqId(), animalId: A1, weightText: "460", observedDate: "2026-10-01" });
    const after = await profile(A1);
    expect(after.weight.state === "KNOWN" && after.weight.kg).toBe(460);
    expect(after.gain.periodLabel).toBe("+60 kg from 1 Aug to 1 Oct");
    expect(after.gain.recent.value).toBe("+30 kg from 1 Sep to 1 Oct (1.00 kg/day)");
  });

  it("9: a back-dated weight joins the history but does not become the latest", async () => {
    const id = reqId();
    await recordRealCattleWeight({ requestId: id, animalId: A1, weightText: "415", observedDate: "2026-08-15" });
    const p = await profile(A1);
    expect(p.weight.state === "KNOWN" && [p.weight.kg, p.weight.observedAt.slice(0, 10)]).toEqual([430, "2026-09-01"]);
    expect(p.chart.state === "CHART" && p.chart.points.map((x) => x.kgLabel)).toEqual(["400 kg", "415 kg", "430 kg"]);
  });

  it("an animal with no weight gets its first one: the frozen RECORD_WEIGHT work is no longer raised", async () => {
    const before = await profile(A2);
    expect(before.work.open.state === "ITEMS" && before.work.open.primary.actionKind).toBe("RECORD_WEIGHT");
    await recordRealCattleWeight({ requestId: reqId(), animalId: A2, weightText: "388", observedDate: null });
    const after = await profile(A2);
    const kinds = after.work.open.state === "ITEMS" ? [after.work.open.primary, ...after.work.open.others].map((w) => w.actionKind) : [];
    expect(kinds).not.toContain("RECORD_WEIGHT");
  });

  it("11: two different weights on the same day are reported exactly as the frozen C4 rule decides (never latest-wins)", async () => {
    await recordRealCattleWeight({ requestId: reqId(), animalId: A1, weightText: "455", observedDate: "2026-10-01" });
    await recordRealCattleWeight({ requestId: reqId(), animalId: A1, weightText: "470", observedDate: "2026-10-01" });
    const p = await profile(A1);
    expect(p.weight.state).toBe("CONFLICT");
    expect(p.metrics.weight.value).toBeNull();
  });

  it("24/25: the method stays UNKNOWN — nothing claims a scale, weighbridge or estimate", async () => {
    await recordRealCattleWeight({ requestId: reqId(), animalId: A1, weightText: "460", observedDate: "2026-10-01" });
    const p = await profile(A1);
    expect(p.weight.state === "KNOWN" && p.weight.basis.kind).toBe("UNKNOWN");
    expect(p.metrics.weight.state.label).toBe("Method not recorded");
    expect(Object.keys(weightRows().at(-1)!).sort()).toEqual(["animal_id", "created_at", "farm_id", "id", "observed_date", "source", "weight_kg"]);
  });
});

describe("Pilot P2 — validation (server-authoritative; nothing coerced)", () => {
  const base = () => ({ requestId: reqId(), animalId: A1, weightText: "450", observedDate: "2026-10-01" });
  it.each([
    ["12 blank", { weightText: "" }, "INVALID_WEIGHT"],
    ["12 spaces", { weightText: "   " }, "INVALID_WEIGHT"],
    ["13 non-number", { weightText: "heavy" }, "INVALID_WEIGHT"],
    ["14 zero", { weightText: "0" }, "INVALID_WEIGHT"],
    ["15 negative", { weightText: "-450" }, "INVALID_WEIGHT"],
    ["16 trailing text", { weightText: "500abc" }, "INVALID_WEIGHT"],
    ["16 exponent", { weightText: "1e3" }, "INVALID_WEIGHT"],
    ["16 infinity", { weightText: "Infinity" }, "INVALID_WEIGHT"],
    ["16 NaN", { weightText: "NaN" }, "INVALID_WEIGHT"],
    ["16 thousands separator", { weightText: "1,200.5" }, "INVALID_WEIGHT"],
    ["16 too many decimals", { weightText: "450.123" }, "INVALID_WEIGHT"],
    ["16 over 2000 kg", { weightText: "2500" }, "INVALID_WEIGHT"],
    ["16 a number, not text", { weightText: 450 }, "INVALID_WEIGHT"],
    ["17 not a date", { observedDate: "yesterday" }, "INVALID_DATE"],
    ["17 impossible date", { observedDate: "2026-02-30" }, "INVALID_DATE"],
    ["17 future date", { observedDate: "2999-01-01" }, "FUTURE_DATE"],
    ["missing animal id", { animalId: "" }, "INVALID_REQUEST"],
    ["malformed animal id", { animalId: "IE 1" }, "INVALID_REQUEST"],
    ["missing submission id", { requestId: "nope" }, "INVALID_REQUEST"],
  ] as const)("%s → refused, nothing written", async (_n, patch, reason) => {
    const rows = weightRows().length;
    const r = await recordRealCattleWeight({ ...base(), ...patch });
    expect(r.ok === false && r.reason).toBe(reason);
    expect(weightRows().length).toBe(rows);
  });

  it("a comma decimal is the shared parser's 52,1 = 52.1 (accepted, not rewritten)", () => {
    const r = readRecordWeightRequest({ requestId: reqId(), animalId: A1, weightText: "452,1", observedDate: "2026-10-01" }, "2026-10-24");
    expect(r.ok && r.request.weightKg).toBe(452.1);
  });

  it("'Now' is the server's Ireland calendar date; a date after it is refused (no drift across UTC midnight)", () => {
    // 00:30 in Ireland on 1 July (summer time) is still 30 June in UTC: the farmer's date is 1 July.
    expect(irelandCalendarDate(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    // 00:30 in Ireland on 1 December (UTC+0) is the same UTC date.
    expect(irelandCalendarDate(new Date("2026-12-01T00:30:00Z"))).toBe("2026-12-01");
    const now = readRecordWeightRequest({ requestId: reqId(), animalId: A1, weightText: "450", observedDate: null }, "2026-07-01");
    expect(now.ok && now.request.observedDate).toBe("2026-07-01");
    expect(readRecordWeightRequest({ requestId: reqId(), animalId: A1, weightText: "450", observedDate: "2026-07-02" }, "2026-07-01")).toEqual({ ok: false, reason: "FUTURE_DATE" });
  });
});

describe("Pilot P2 — security", () => {
  it("18: another farm's animal is refused exactly like an unknown one; nothing is written; nothing of farm B is returned", async () => {
    const rows = weightRows().length;
    const other = await recordRealCattleWeight({ requestId: reqId(), animalId: B1, weightText: "450", observedDate: "2026-10-01" });
    const unknown = await recordRealCattleWeight({ requestId: reqId(), animalId: "a1000000-0000-4000-8000-0000000000ff", weightText: "450", observedDate: "2026-10-01" });
    expect(other).toEqual(unknown);
    expect(other.ok === false && other.reason).toBe("ANIMAL_NOT_FOUND");
    expect(weightRows().length).toBe(rows);
    expect(JSON.stringify(other)).not.toMatch(/IE B|610|f0000000-0000-4000-8000-00000000000b|b1000000/);
  });

  it("19: a farm id in the request can't redirect the write (the request is refused; the farm is the server's)", async () => {
    const rows = weightRows().length;
    const r = await recordRealCattleWeight({ requestId: reqId(), animalId: A1, weightText: "450", observedDate: "2026-10-01", farmId: FARM_B });
    expect(r.ok === false && r.reason).toBe("INVALID_REQUEST");
    expect(weightRows().length).toBe(rows);
    // A method or source can't be smuggled in either.
    expect((await recordRealCattleWeight({ requestId: reqId(), animalId: A1, weightText: "450", observedDate: "2026-10-01", method: "SCALE" })).ok).toBe(false);
    // And a valid write lands on the signed-in farm only.
    const ok = await recordRealCattleWeight({ requestId: reqId(), animalId: A1, weightText: "450", observedDate: "2026-10-01" });
    expect(ok.ok && weightRows().find((x) => x.id === ok.observationId)!.farm_id).toBe(FARM_A);
  });

  it("20: an animal deleted between the check and the insert is not found; nothing is written", async () => {
    const rows = weightRows().length;
    const id = reqId();
    // Deleted the moment the ownership check has passed (the insert then hits the foreign key).
    const orig = db.tables.livestock_individuals;
    let checks = 0;
    Object.defineProperty(db.tables, "livestock_individuals", {
      configurable: true,
      get: () => (checks++ === 0 ? orig : orig.filter((a) => a.id !== A2)),
    });
    const r = await recordRealCattleWeight({ requestId: id, animalId: A2, weightText: "388", observedDate: null });
    Object.defineProperty(db.tables, "livestock_individuals", { configurable: true, writable: true, value: orig });
    expect(r.ok === false && r.reason).toBe("ANIMAL_NOT_FOUND");
    expect(weightRows().length).toBe(rows);
  });

  it("signed out: refused, nothing written", async () => {
    db.currentFarm = null;
    const r = await recordRealCattleWeight({ requestId: reqId(), animalId: A1, weightText: "450", observedDate: "2026-10-01" });
    expect(r.ok === false && r.reason).toBe("NOT_SIGNED_IN");
  });

  it("21: farm B, signed in, never sees farm A's new weight", async () => {
    const id = reqId();
    await recordRealCattleWeight({ requestId: id, animalId: A1, weightText: "460", observedDate: "2026-10-01" });
    db.currentFarm = FARM_B;
    const r = await loadRealCattle();
    expect(r.state === "OK" && JSON.stringify(r.evaluation.outputs)).not.toMatch(new RegExp(`${id}|${A1}|IE 1`));
  });
});

describe("Pilot P2 — idempotency (D13)", () => {
  it("22: the same submission repeated (double press / network / action retry) writes one row and returns it", async () => {
    const id = reqId();
    const req = { requestId: id, animalId: A1, weightText: "452", observedDate: "2026-10-01" };
    const [a, b] = await Promise.all([recordRealCattleWeight(req), recordRealCattleWeight(req)]);
    const c = await recordRealCattleWeight(req);
    expect([a, b, c].every((r) => r.ok && r.observationId === id)).toBe(true);
    expect([a, b, c].filter((r) => r.ok && r.replayed).length).toBe(2);
    expect(weightRows().filter((x) => x.id === id)).toHaveLength(1);
    const p = await profile(A1);
    expect(p.chart.state === "CHART" && p.chart.points.filter((x) => x.kgLabel === "452 kg")).toHaveLength(1);
  });

  it("23: a separate later submission with the same animal, date and kg is a second, legitimate observation", async () => {
    const req = { animalId: A1, weightText: "452", observedDate: "2026-10-01" };
    const a = await recordRealCattleWeight({ requestId: reqId(), ...req });
    const b = await recordRealCattleWeight({ requestId: reqId(), ...req });
    expect(a.ok && b.ok && a.observationId !== b.observationId).toBe(true);
    expect(weightRows().filter((x) => x.animal_id === A1 && x.observed_date === "2026-10-01")).toHaveLength(2);
  });

  it("the same submission id with different content is a conflict — never an overwrite, never a second row", async () => {
    const id = reqId();
    await recordRealCattleWeight({ requestId: id, animalId: A1, weightText: "452", observedDate: "2026-10-01" });
    const r = await recordRealCattleWeight({ requestId: id, animalId: A1, weightText: "460", observedDate: "2026-10-01" });
    expect(r.ok === false && r.reason).toBe("DUPLICATE_CONFLICT");
    expect(weightRows().filter((x) => x.id === id).map((x) => x.weight_kg)).toEqual([452]);
  });

  it("a submission id already used by another farm's row is a conflict that reveals nothing", async () => {
    const id = "c0000000-0000-4000-8000-000000000003"; // farm B's weight row id
    const r = await recordRealCattleWeight({ requestId: id, animalId: A1, weightText: "610", observedDate: "2026-09-01" });
    expect(r.ok === false && r.reason).toBe("DUPLICATE_CONFLICT");
    expect(JSON.stringify(r)).not.toMatch(/b1000000|FARM_B|IE B/);
  });
});

describe("Pilot P2 — failures are visible", () => {
  it("26/27: a database failure is reported, and the next read doesn't show the weight", async () => {
    db.failNextInsert = true;
    const id = reqId();
    const r = await recordRealCattleWeight({ requestId: id, animalId: A1, weightText: "460", observedDate: "2026-10-01" });
    expect(r).toEqual({ ok: false, reason: "WRITE_FAILED", message: "The weight couldn't be saved. Nothing was recorded — try again." });
    const p = await profile(A1);
    expect(p.weight.state === "KNOWN" && p.weight.kg).toBe(430);
    // Retrying the same submission after the outage writes it once.
    const again = await recordRealCattleWeight({ requestId: id, animalId: A1, weightText: "460", observedDate: "2026-10-01" });
    expect(again).toEqual({ ok: true, observationId: id, replayed: false });
  });

  it("a revalidation failure after a saved weight still reports the save (the client refreshes itself)", async () => {
    vi.mocked(revalidatePath).mockImplementationOnce(() => {
      throw new Error("revalidate down");
    });
    const r = await recordRealCattleWeight({ requestId: reqId(), animalId: A1, weightText: "460", observedDate: "2026-10-01" });
    expect(r.ok).toBe(true);
  });

  it("the sheet: a refusal keeps the sheet open with the reading and the message; success closes it and refreshes from the server", async () => {
    const r0 = await loadRealCattle();
    if (r0.state !== "OK") throw new Error();
    render(<RealAnimalProfileScreen view={realAnimalView(r0.evaluation, A2)!} />);
    fireEvent.click(screen.getByRole("button", { name: "Record weight" }));
    const input = screen.getByLabelText("Weight");
    expect(screen.getByText(/saved with the method not recorded/)).toBeInTheDocument();
    expect(screen.queryByText(/scale weighing|Scale reading|browser session/)).toBeNull();
    // A database failure: message shown, reading kept, nothing written, no refresh.
    db.failNextInsert = true;
    fireEvent.change(input, { target: { value: "388" } });
    fireEvent.click(screen.getByRole("button", { name: "Save weight" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The weight couldn't be saved"));
    expect(screen.getByLabelText("Weight")).toHaveValue("388");
    expect(refresh).not.toHaveBeenCalled();
    // The retry (same submission) succeeds: the sheet closes and the route is re-read from the server.
    fireEvent.click(screen.getByRole("button", { name: "Save weight" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("Weight saved");
    expect(weightRows().filter((x) => x.animal_id === A2)).toHaveLength(1);
  });
});

describe("Pilot P2 — demo separation", () => {
  it("28: the real action can't write a demonstration animal (SYNTH ids and demo tags are not real animal ids)", async () => {
    const rows = weightRows().length;
    for (const animalId of ["SYNTH-ANIMAL-1427", "1427"]) {
      const r = await recordRealCattleWeight({ requestId: reqId(), animalId, weightText: "450", observedDate: "2026-10-01" });
      expect(r.ok === false && r.reason).toBe("INVALID_REQUEST");
    }
    expect(weightRows().length).toBe(rows);
  });

  it("29: in demonstration mode the real action refuses, and the demo herd's Record Weight stays in the browser session", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    const r = await recordRealCattleWeight({ requestId: reqId(), animalId: A1, weightText: "450", observedDate: "2026-10-01" });
    expect(r.ok === false && r.reason).toBe("DEMO_MODE");
    render(
      <CattleDemoSessionProvider>
        <HerdScreen initial={demoHerdView(EMPTY_CATTLE_DEMO_SESSION)} scenario="STANDARD" />
      </CattleDemoSessionProvider>,
    );
    expect(screen.getByText(/Demonstration herd\./)).toBeInTheDocument();
    expect(db.inserts).toBe(0);
  });
});
