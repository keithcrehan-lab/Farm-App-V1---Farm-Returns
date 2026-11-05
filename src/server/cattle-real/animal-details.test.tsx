import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Edit animal details" end to end below the network: action (`correctRealAnimalDetails`) → server-resolved farm →
 * farm-scoped animal check → append-only insert into `livestock_individual_identity_corrections` → the P1 read
 * (`cattle-source` → `real-records` → frozen C1) → the production advisory.
 *
 * The database is the same in-memory PostgREST stand-in as `real-write.test.tsx`, extended for multi-row inserts and
 * the corrections table's own rules (owner RLS, animal foreign key, same-farm trigger, no future date of birth).
 */

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  currentFarm: null as string | null,
  failNextInsert: false,
  inserts: 0,
}));

vi.mock("@/lib/supabase/server", () => {
  type Row = Record<string, unknown>;
  const visible = (table: string) => (db.tables[table] ?? []).filter((r) => r.farm_id === db.currentFarm);
  function insertOne(table: string, row: Row): { row: Row | null; error: unknown } {
    if (row.farm_id !== db.currentFarm) return { row: null, error: { code: "42501", message: "new row violates row-level security policy" } };
    if (table === "livestock_individual_identity_corrections") {
      const animal = (db.tables.livestock_individuals ?? []).find((a) => a.id === row.animal_id);
      if (!animal) return { row: null, error: { code: "23503", message: "violates foreign key constraint" } };
      if (animal.farm_id !== row.farm_id) return { row: null, error: { code: "23503", message: "livestock_individual does not belong to farm" } };
      if (row.fact === "date_of_birth" && String(row.value) > "2099-01-01") return { row: null, error: { code: "23514", message: "identity_correction_rejected:DATE_OF_BIRTH_IN_FUTURE" } };
    }
    const at = new Date(Date.UTC(2026, 10, 5, 9, 0, db.inserts)).toISOString();
    db.inserts += 1;
    return { row: { id: `c1000000-0000-4000-8000-${String(db.inserts).padStart(12, "0")}`, created_at: at, recorded_at: at, recorded_by: "user", ...row }, error: null };
  }
  function query(table: string) {
    const filters: [string, unknown][] = [];
    let range: [number, number] | null = null;
    let insertRows: Row[] | null = null;
    let single = false;
    let maybe = false;
    let wantCount = false;
    const run = (): { data: unknown; error: unknown; count?: number | null } => {
      if (insertRows) {
        if (db.failNextInsert) {
          db.failNextInsert = false;
          return { data: null, error: { code: "08006", message: "connection failure" } };
        }
        // One statement: every row is checked before any is stored (all or nothing).
        const results = insertRows.map((r) => insertOne(table, r));
        const failed = results.find((r) => r.error);
        if (failed) return { data: null, error: failed.error };
        const stored = results.map((r) => r.row as Row);
        (db.tables[table] ??= []).push(...stored);
        return { data: single ? { ...stored[0] } : stored.map((r) => ({ ...r })), error: null };
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
      insert: (row: Row | Row[]) => ((insertRows = Array.isArray(row) ? row : [row]), q),
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
import { animalAssertionHistory } from "@/domain/cattle/animal-snapshot";
import { buildProductionAdvisoryVM, groupLiveweightOf } from "@/domain/cattle/presentation";
import { correctRealAnimalDetails } from "@/app/(app)/cattle/real-actions";
import { AnimalDetailsEditor } from "@/components/farm/AnimalDetailsEditor";
import { irelandCalendarDate } from "./record-weight";
import { loadRealCattle, realGroupAnimalFacts, type RealEvaluation } from "./real-service";
import { animalDetailsEditOf, identityCorrectionsFor, readAnimalDetailsRequest } from "./animal-details";
import { realCattleRecords } from "./real-records";

const FARM_A = "f0000000-0000-4000-8000-00000000000a";
const FARM_B = "f0000000-0000-4000-8000-00000000000b";
const G_A = "6a000000-0000-4000-8000-000000000001";
const A1 = "a1000000-0000-4000-8000-000000000001"; // DOB, sex and breed recorded
const A2 = "a1000000-0000-4000-8000-000000000002"; // added without DOB or sex
const B1 = "b1000000-0000-4000-8000-000000000001"; // farm B
const TODAY = () => irelandCalendarDate(new Date());

function seed() {
  db.currentFarm = FARM_A;
  db.failNextInsert = false;
  db.inserts = 0;
  const g = (id: string, farm: string, label: string) => ({ id, farm_id: farm, category: "weanling", label, count: { value: 2, status: "verified", source: "x" }, avg_weight_kg: null, avg_age_months: null, breed: null, sex: null, system: "housed", housing_id: null, goal: null, value: { value: 0, status: "estimated", source: "x" }, status_label: null, avg_milk_yield_kg_per_year: null, created_at: "2026-06-01T08:00:00+00:00", updated_at: "2026-06-01T08:00:00+00:00" });
  const a = (id: string, farm: string, group: string, o: Record<string, unknown>) => ({ id, farm_id: farm, group_id: group, tag_number: `IE ${id.slice(-1)}`, category: "weanling", sex: null, breed: null, date_of_birth: null, goal_status: null, notes: null, created_at: "2026-06-01T08:00:00+00:00", updated_at: "2026-06-01T08:00:00+00:00", ...o });
  db.tables = {
    livestock_groups: [g(G_A, FARM_A, "Weanlings"), g("6b000000-0000-4000-8000-000000000001", FARM_B, "B group")],
    livestock_individuals: [
      a(A1, FARM_A, G_A, { sex: "male", breed: "Charolais", date_of_birth: "2026-03-01" }),
      a(A2, FARM_A, G_A, {}),
      a(B1, FARM_B, "6b000000-0000-4000-8000-000000000001", { sex: "female", date_of_birth: "2026-02-01" }),
    ],
    livestock_weight_observations: [
      { id: "c0000000-0000-4000-8000-000000000001", farm_id: FARM_A, animal_id: A1, weight_kg: 280, observed_date: "2026-10-01", source: "Farmer entered", created_at: "2026-10-01T18:00:00+00:00" },
    ],
    livestock_individual_identity_corrections: [],
  };
}

async function evaluation(): Promise<RealEvaluation> {
  const r = await loadRealCattle();
  if (r.state !== "OK") throw new Error(r.state);
  return r.evaluation;
}
const corrections = () => db.tables.livestock_individual_identity_corrections;

beforeEach(() => {
  seed();
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  vi.mocked(revalidatePath).mockClear();
  refresh.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Edit animal details — successful correction", () => {
  it("adds a missing date of birth and sex: appended, the original row untouched, the ledger reads the correction", async () => {
    const before = animalDetailsEditOf(await evaluation(), A2, TODAY());
    expect(before).toMatchObject({ dateOfBirth: null, sex: null, breed: null });

    const result = await correctRealAnimalDetails({ animalId: A2, dateOfBirth: "2026-04-10", sex: "male" });
    expect(result).toEqual({ ok: true, changed: 2 });
    expect(corrections().map((c) => [c.animal_id, c.fact, c.value, c.source, c.farm_id])).toEqual([
      [A2, "date_of_birth", "2026-04-10", "Farmer correction", FARM_A],
      [A2, "sex", "male", "Farmer correction", FARM_A],
    ]);
    // Never an in-place rewrite of the animal row.
    expect(db.tables.livestock_individuals.find((r) => r.id === A2)).toMatchObject({ date_of_birth: null, sex: null });
    // Refresh behaviour: the cattle routes are revalidated and the next read has the correction.
    expect(revalidatePath).toHaveBeenCalledWith("/cattle", "layout");
    expect(animalDetailsEditOf(await evaluation(), A2, TODAY())).toMatchObject({ dateOfBirth: "2026-04-10", sex: "male" });
  });

  it("correcting a recorded value supersedes it; the earlier value stays in the ledger history and weights are untouched", async () => {
    const weightsBefore = structuredClone(db.tables.livestock_weight_observations);
    expect(await correctRealAnimalDetails({ animalId: A1, dateOfBirth: "2026-02-20", breed: "Limousin" })).toEqual({ ok: true, changed: 2 });
    const e = await evaluation();
    expect(e.outputs.snapshots[A1]?.dateOfBirth).toMatchObject({ state: "KNOWN", value: "2026-02-20" });
    const ledger = e.outputs.ledgers.find((l) => l.animalId === A1)!;
    const history = animalAssertionHistory(ledger, "DATE_OF_BIRTH", e.outputs.viewpoint.knowledgeCutoff)!;
    expect(history.map((h) => [h.assertion.value, h.supersededBy.length > 0])).toEqual(expect.arrayContaining([["2026-03-01", true], ["2026-02-20", false]]));
    expect(db.tables.livestock_weight_observations).toEqual(weightsBefore);
  });

  it("a repeat of the same correction writes nothing", async () => {
    await correctRealAnimalDetails({ animalId: A2, dateOfBirth: "2026-04-10" });
    const rows = corrections().length;
    expect(await correctRealAnimalDetails({ animalId: A2, dateOfBirth: "2026-04-10" })).toEqual({ ok: true, changed: 0 });
    expect(corrections()).toHaveLength(rows);
  });

  it("the production advisory becomes more complete after the correction (age evidence met, link gone)", async () => {
    const advisory = async () => {
      const facts = realGroupAnimalFacts(await evaluation())[G_A];
      return buildProductionAdvisoryVM({ category: "weanling", system: "housed", animals: facts, liveweight: groupLiveweightOf(facts, undefined), asOfDate: "2026-11-05" });
    };
    const before = (await advisory()).evidenceFacts.find((i) => i.code === "AGE")!;
    expect(before).toMatchObject({ met: false, value: "Date of birth recorded for 1 of 2 animals" });
    expect(before.action).toMatchObject({ kind: "LINK", href: `/cattle/animals/${A2}#edit-details` });

    await correctRealAnimalDetails({ animalId: A2, dateOfBirth: "2026-04-10", sex: "male" });
    const after = await advisory();
    expect(after.evidenceFacts.find((i) => i.code === "AGE")).toMatchObject({ met: true });
    expect(after.evidenceFacts.find((i) => i.code === "SEX")).toMatchObject({ met: true });
  });
});

describe("Edit animal details — refusals (nothing written)", () => {
  it("another farm's animal is refused exactly like an unknown one", async () => {
    expect(await correctRealAnimalDetails({ animalId: B1, dateOfBirth: "2026-01-01" })).toMatchObject({ ok: false, reason: "ANIMAL_NOT_FOUND" });
    expect(await correctRealAnimalDetails({ animalId: "a1000000-0000-4000-8000-000000000099", dateOfBirth: "2026-01-01" })).toMatchObject({ ok: false, reason: "ANIMAL_NOT_FOUND" });
    expect(corrections()).toEqual([]);
    expect(db.tables.livestock_individuals.find((r) => r.id === B1)).toMatchObject({ date_of_birth: "2026-02-01" });
  });

  it("a farm id or source in the request can't redirect the write", async () => {
    expect(await correctRealAnimalDetails({ animalId: B1, farmId: FARM_B, dateOfBirth: "2026-01-01" })).toMatchObject({ ok: false, reason: "INVALID_REQUEST" });
    expect(await correctRealAnimalDetails({ animalId: A2, source: "Vet", dateOfBirth: "2026-01-01" })).toMatchObject({ ok: false, reason: "INVALID_REQUEST" });
    expect(corrections()).toEqual([]);
  });

  it("an invalid or future date of birth is refused", async () => {
    expect(await correctRealAnimalDetails({ animalId: A2, dateOfBirth: "2026-02-30" })).toMatchObject({ ok: false, reason: "INVALID_DATE" });
    expect(await correctRealAnimalDetails({ animalId: A2, dateOfBirth: "05/04/2026" })).toMatchObject({ ok: false, reason: "INVALID_DATE" });
    expect(await correctRealAnimalDetails({ animalId: A2, dateOfBirth: "2999-01-01" })).toMatchObject({ ok: false, reason: "FUTURE_DATE", message: "The date of birth can't be later than today." });
    expect(corrections()).toEqual([]);
  });

  it("signed out, demonstration mode and a database failure are refused and visible", async () => {
    db.currentFarm = null;
    expect(await correctRealAnimalDetails({ animalId: A2, sex: "male" })).toMatchObject({ ok: false, reason: "NOT_SIGNED_IN" });
    db.currentFarm = FARM_A;
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    expect(await correctRealAnimalDetails({ animalId: A2, sex: "male" })).toMatchObject({ ok: false, reason: "DEMO_MODE" });
    vi.mocked(isSupabaseConfigured).mockReturnValue(true);
    db.failNextInsert = true;
    expect(await correctRealAnimalDetails({ animalId: A2, sex: "male" })).toMatchObject({ ok: false, reason: "WRITE_FAILED" });
    expect(corrections()).toEqual([]);
  });
});

describe("Edit animal details — pure request rules", () => {
  it("only the facts that differ are corrected; empty / null fields are left as recorded", () => {
    const read = readAnimalDetailsRequest({ animalId: A1, dateOfBirth: null, sex: "male", breed: "  Limousin " }, "2026-11-05");
    expect(read).toEqual({ ok: true, request: { animalId: A1, sex: "male", breed: "Limousin" } });
    expect(identityCorrectionsFor(read.ok ? read.request : { animalId: A1 }, { dateOfBirth: "2026-03-01", sex: "male", breed: "Charolais" })).toEqual([{ fact: "breed", value: "Limousin" }]);
    expect(readAnimalDetailsRequest({ animalId: A1 }, "2026-11-05")).toEqual({ ok: false, reason: "NOTHING_TO_CHANGE" });
    expect(readAnimalDetailsRequest({ animalId: A1, sex: "mixed" }, "2026-11-05")).toEqual({ ok: false, reason: "INVALID_SEX" });
    expect(readAnimalDetailsRequest({ animalId: A1, breed: "x".repeat(81) }, "2026-11-05")).toEqual({ ok: false, reason: "INVALID_BREED" });
  });

  it("the cattle read refuses a correction row of another farm or animal (fails closed, never dropped)", () => {
    const base = { farmId: FARM_A, groups: [], animals: [], weights: [] };
    const row = { id: "x", farm_id: FARM_B, animal_id: A1, fact: "sex" as const, value: "male", source: "s", recorded_by: "u", recorded_at: "2026-11-01T00:00:00Z" };
    expect(realCattleRecords({ ...base, corrections: [row] })).toEqual({ ok: false, reason: "FOREIGN_ROW" });
    expect(realCattleRecords({ ...base, corrections: [{ ...row, farm_id: FARM_A }] })).toEqual({ ok: false, reason: "UNKNOWN_ANIMAL" });
  });
});

describe("Edit animal details — the control", () => {
  it("opens on the #edit-details link, saves through the action and refreshes only after the save", async () => {
    window.location.hash = "#edit-details";
    render(<AnimalDetailsEditor record={{ animalId: A2, dateOfBirth: null, sex: null, breed: null, today: TODAY() }} />);
    const dob = await screen.findByLabelText("Date of birth");
    fireEvent.change(dob, { target: { value: "2026-04-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save animal details" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(corrections().map((c) => c.value)).toEqual(["2026-04-10"]);
    window.location.hash = "";
  });

  it("a refusal keeps the editor open with the message and doesn't refresh", async () => {
    render(<AnimalDetailsEditor record={{ animalId: B1, dateOfBirth: null, sex: null, breed: null, today: TODAY() }} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit animal details" }));
    fireEvent.change(screen.getByLabelText("Sex"), { target: { value: "female" } });
    fireEvent.click(screen.getByRole("button", { name: "Save animal details" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This animal isn't on your farm's records, so nothing was saved.");
    expect(screen.getByRole("button", { name: "Save animal details" })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
