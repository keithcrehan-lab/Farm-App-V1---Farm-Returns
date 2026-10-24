import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pilot Integration P3 — one cattle product (DECISIONS D14). Cattle is the one destination; the former Livestock
 * screen's management lives at Cattle → Manage herd and writes through the existing livestock actions, now
 * server-authorised; `/livestock` redirects there. Both the management writes and the Cattle reads use the same
 * `livestock_*` rows: the in-memory PostgREST below enforces the owner RLS policies (rows of the signed-in user's farm
 * only), the primary key and the same-farm triggers, and the repository code runs unmodified on top of it.
 */

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  currentFarm: null as string | null,
  writes: 0,
}));

vi.mock("@/lib/supabase/server", () => {
  type Row = Record<string, unknown>;
  const visible = (table: string) => (db.tables[table] ?? []).filter((r) => r.farm_id === db.currentFarm);
  const sameFarm = (table: string, row: Row): boolean => {
    const owner = (t: string, id: unknown) => (db.tables[t] ?? []).find((r) => r.id === id)?.farm_id;
    if (table === "livestock_individuals" && row.group_id != null) return owner("livestock_groups", row.group_id) === row.farm_id;
    if (table === "livestock_weight_observations") return owner("livestock_individuals", row.animal_id) === row.farm_id;
    return true;
  };
  function query(table: string) {
    const filters: [string, unknown][] = [];
    let range: [number, number] | null = null;
    let insertRow: Row | null = null;
    let patch: Row | null = null;
    let single = false;
    let maybe = false;
    let wantCount = false;
    const run = (): { data: unknown; error: unknown; count?: number | null } => {
      if (insertRow) {
        const row = insertRow;
        if (row.farm_id !== db.currentFarm) return { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
        const all = (db.tables[table] ??= []);
        if (row.id !== undefined && all.some((r) => r.id === row.id)) return { data: null, error: { code: "23505" } };
        if (!sameFarm(table, row)) return { data: null, error: { code: "P0001", message: "does not belong to farm" } };
        const at = new Date(Date.UTC(2026, 9, 24, 9, 0, db.writes)).toISOString();
        const stored = { id: row.id ?? crypto.randomUUID(), created_at: at, updated_at: at, ...row };
        db.writes += 1;
        all.push(stored);
        return { data: { ...stored }, error: null };
      }
      let rows = visible(table).filter((r) => filters.every(([c, v]) => r[c] === v));
      if (patch) {
        // RLS `using`: another farm's row is invisible, so the update matches nothing.
        for (const r of rows) Object.assign(r, patch);
        if (rows.length > 0) db.writes += 1;
      }
      rows = [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
      const count = rows.length;
      if (range) rows = rows.slice(range[0], range[1] + 1);
      if (single || maybe) return rows.length === 1 ? { data: { ...rows[0] }, error: null } : maybe && rows.length === 0 ? { data: null, error: null } : { data: null, error: { code: "PGRST116" } };
      return { data: rows.map((r) => ({ ...r })), error: null, count: wantCount ? count : null };
    };
    const q = {
      select: (_c?: string, o?: { count?: string }) => ((wantCount = o?.count === "exact"), q),
      insert: (row: Row) => ((insertRow = row), q),
      update: (row: Row) => ((patch = row), q),
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
vi.mock("@/lib/farm-data/farms", () => ({
  getFarmForCurrentUser: vi.fn(async () => (db.currentFarm ? { id: db.currentFarm, ownerName: "Owner" } : null)),
  updateFarmProfileForCurrentUser: vi.fn(),
}));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: vi.fn(() => true), requireSupabaseEnv: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh }) }));

import { revalidatePath } from "next/cache";
import { getFarmForCurrentUser } from "@/lib/farm-data/farms";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listIndividualAnimalsForFarm, listWeightObservationsForFarm } from "@/lib/farm-data/individual-animals";
import { addIndividualAnimalAction, addLivestockGroupAction, addWeightObservationAction, updateLivestockGroupAction } from "@/app/actions/farm";
import { recordRealCattleWeight } from "@/app/(app)/cattle/real-actions";
import ManageHerdPage from "@/app/(app)/cattle/manage/page";
import { HerdManagementClient } from "@/app/(app)/cattle/manage/HerdManagementClient";
import LivestockPage from "@/app/(app)/livestock/page";
import { AddAnimalCard } from "@/components/farm/AddAnimalCard";
import { RealGroupScreen, RealHerdScreen } from "@/components/cattle/HerdScreens";
import { CattleUnavailable } from "@/components/cattle/CattleUnavailable";
import { desktopNavItems, mobileNavItems, moreNavItems, primaryNavItems } from "@/components/shell/nav-items";
import { REAL_UNAVAILABLE, loadRealCattle, realAnimalView, realHerdView } from "./real-service";

const FARM_A = "f0000000-0000-4000-8000-00000000000a";
const FARM_B = "f0000000-0000-4000-8000-00000000000b";
const G_A = "6a000000-0000-4000-8000-000000000001";
const G_HEAD = "6a000000-0000-4000-8000-000000000002"; // headcount only
const G_B = "6b000000-0000-4000-8000-000000000001";
const A1 = "a1000000-0000-4000-8000-000000000001";
const A_UNGROUPED = "a1000000-0000-4000-8000-000000000002";
const B1 = "b1000000-0000-4000-8000-000000000001";

function seed() {
  db.currentFarm = FARM_A;
  db.writes = 0;
  const g = (id: string, farm: string, label: string, head: number) => ({ id, farm_id: farm, category: "steer", label, count: { value: head, status: "verified", source: "x" }, avg_weight_kg: null, avg_age_months: null, breed: null, sex: null, system: "grazing", housing_id: null, goal: null, value: { value: 0, status: "estimated", source: "x" }, status_label: null, avg_milk_yield_kg_per_year: null, created_at: "2026-06-01T08:00:00+00:00", updated_at: "2026-06-01T08:00:00+00:00" });
  const a = (id: string, farm: string, group: string | null, tag: string | null) => ({ id, farm_id: farm, group_id: group, tag_number: tag, category: "steer", sex: "male", breed: "Charolais", date_of_birth: "2025-03-01", goal_status: null, notes: null, created_at: "2026-06-01T08:00:00+00:00", updated_at: "2026-06-01T08:00:00+00:00" });
  db.tables = {
    livestock_groups: [g(G_A, FARM_A, "Bullocks", 1), g(G_HEAD, FARM_A, "Sucklers", 40), g(G_B, FARM_B, "B group", 1)],
    livestock_individuals: [a(A1, FARM_A, G_A, "IE 1"), a(A_UNGROUPED, FARM_A, null, "IE 9"), a(B1, FARM_B, G_B, "IE B")],
    livestock_weight_observations: [],
  };
}

async function herd() {
  const r = await loadRealCattle();
  if (r.state !== "OK") throw new Error(r.state);
  return r.evaluation;
}
const newGroup = (label: string) => ({ label, category: "steer" as const, count: 6, system: "grazing" as const, farmerName: "Owner" });
const rows = (t: string) => db.tables[t];

beforeEach(() => {
  seed();
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  vi.mocked(revalidatePath).mockClear();
  refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Pilot P3 — navigation", () => {
  it("1/2: Cattle is the one cattle destination in every farmer navigation list; there is no Livestock entry", () => {
    for (const list of [primaryNavItems, moreNavItems, mobileNavItems, desktopNavItems]) expect(list.some((i) => i.href.startsWith("/livestock"))).toBe(false);
    expect([...primaryNavItems, ...moreNavItems].filter((i) => i.href.startsWith("/cattle")).map((i) => [i.href, i.label])).toEqual([["/cattle", "Cattle"]]);
  });

  it("3: /livestock always redirects to Cattle → Manage herd (the same answer in demo mode)", () => {
    for (const configured of [true, false]) {
      vi.mocked(isSupabaseConfigured).mockReturnValue(configured);
      let digest = "";
      try {
        LivestockPage();
      } catch (e) {
        digest = String((e as { digest?: string }).digest);
      }
      expect(digest).toMatch(/^NEXT_REDIRECT;[a-z]+;\/cattle\/manage;/);
    }
  });

  it("4: Manage herd renders and never redirects (no loop), signed in or in demo mode", async () => {
    const real = await ManageHerdPage({ searchParams: Promise.resolve({}) });
    expect(isValidElement(real) && real.type).toBe(HerdManagementClient);
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    const demo = await ManageHerdPage({ searchParams: Promise.resolve({}) });
    expect(isValidElement(demo) && demo.type).toBe(CattleUnavailable);
  });

  it("the real herd and group screens link to Manage herd", async () => {
    const view = realHerdView(await herd());
    render(<RealHerdScreen view={view} />);
    expect(screen.getByRole("link", { name: /Manage herd: add or edit groups and animals/ })).toHaveAttribute("href", "/cattle/manage");
    cleanup();
    render(<RealGroupScreen view={view} groupRef={G_A} />);
    expect(screen.getByRole("link", { name: /Edit this group in Manage herd/ })).toHaveAttribute("href", "/cattle/manage?tab=Groups");
    cleanup();
    render(<RealGroupScreen view={view} groupRef={G_HEAD} />);
    expect(screen.getByRole("link", { name: /Edit this group in Manage herd/ })).toHaveAttribute("href", "/cattle/manage?tab=Groups");
  });

  it("Manage herd opens on the Groups tab only when asked; anything else is the overview", async () => {
    const tabOf = async (tab: unknown) => {
      const el = await ManageHerdPage({ searchParams: Promise.resolve({ tab: tab as string }) });
      return isValidElement<{ initialTab: string }>(el) ? el.props.initialTab : null;
    };
    expect(await tabOf("Groups")).toBe("Groups");
    expect(await tabOf("Housing")).toBe("Overview");
    expect(await tabOf(undefined)).toBe("Overview");
  });
});

describe("Pilot P3 — capability preserved, one store", () => {
  it("5–8: real groups, animals, ungrouped animals and headcount-only groups are all on Cattle", async () => {
    const view = realHerdView(await herd());
    expect(view.herd.overview.state === "ITEMS" && view.herd.overview.items.map((g) => g.groupRef)).toEqual([G_A]);
    expect(view.extras.ungrouped.map((a) => a.animalId)).toEqual([A_UNGROUPED]);
    expect([...view.extras.headcountGroups]).toEqual([{ groupRef: G_HEAD, name: "Sucklers", summary: "40 head recorded for the group · individual animals not recorded" }]);
  });

  it("9: a group created in Manage herd is written once, for the server's farm, and Cattle reads it", async () => {
    const before = rows("livestock_groups").length;
    const group = await addLivestockGroupAction(FARM_A, newGroup("Weanlings"));
    expect(rows("livestock_groups").length).toBe(before + 1);
    expect(rows("livestock_groups").find((r) => r.id === group.id)).toMatchObject({ farm_id: FARM_A, label: "Weanlings" });
    const view = realHerdView(await herd());
    expect(view.extras.headcountGroups.some((g) => g.groupRef === group.id && g.name === "Weanlings")).toBe(true);
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith("/cattle", "layout");
  });

  it("11: editing a group (name, headcount, housing link) updates the one row Cattle reads", async () => {
    await updateLivestockGroupAction(G_HEAD, { label: "Suckler cows", count: 42, farmerName: "Owner" });
    const row = rows("livestock_groups").find((r) => r.id === G_HEAD)!;
    expect(row).toMatchObject({ label: "Suckler cows", count: { value: 42, status: "verified", source: "Owner" } });
    const view = realHerdView(await herd());
    expect(view.extras.headcountGroups[0]).toMatchObject({ name: "Suckler cows", summary: "42 head recorded for the group · individual animals not recorded" });
  });

  it("10/13/16: an animal added in Manage herd appears on Cattle by its database id, in its group and in the shared list", async () => {
    const animal = await addIndividualAnimalAction(FARM_A, { tagNumber: "IE 7", category: "heifer", groupId: G_A });
    expect(animal.id).toMatch(/^[0-9a-f-]{36}$/);
    const e = await herd();
    expect(realAnimalView(e, animal.id)?.profile).toBeDefined();
    expect(realAnimalView(e, animal.id)).not.toBeNull();
    const view = realHerdView(e);
    const bullocks = view.herd.groups.state === "ITEMS" ? view.herd.groups.items.find((g) => g.groupRef === G_A) : undefined;
    expect(bullocks?.scope.state === "KNOWN" && bullocks.scope.value.members.state === "ITEMS" && bullocks.scope.value.members.items.map((m) => m.animalId)).toContain(animal.id);
    expect((await listIndividualAnimalsForFarm(FARM_A)).filter((a) => a.id === animal.id)).toHaveLength(1);
  });

  it("an animal added with no group is listed under Not in a group (D11), never placed in a made-up group", async () => {
    const animal = await addIndividualAnimalAction(FARM_A, { category: "calf" });
    const view = realHerdView(await herd());
    expect(view.extras.ungrouped.map((a) => a.animalId)).toContain(animal.id);
  });

  it("12/14: Record Weight on Cattle still works, and the shared store (the old Livestock reader) has exactly that row", async () => {
    const requestId = "9e000000-0000-4000-8000-000000000001";
    const r = await recordRealCattleWeight({ requestId, animalId: A1, weightText: "455", observedDate: "2026-10-01" });
    expect(r).toEqual({ ok: true, observationId: requestId, replayed: false });
    expect(await listWeightObservationsForFarm(FARM_A)).toEqual([{ id: requestId, animalId: A1, weightKg: 455, observedDate: "2026-10-01", source: "Farmer entered" }]);
  });

  it("15: reading Cattle and opening Manage herd write nothing — there is no copy or sync step", async () => {
    await herd();
    await ManageHerdPage({ searchParams: Promise.resolve({}) });
    expect(db.writes).toBe(0);
  });

  it("17/18: duplicate tags and missing tags stay separate animals, each by its own id", async () => {
    const x = await addIndividualAnimalAction(FARM_A, { tagNumber: "IE 1", category: "steer", groupId: G_A });
    const y = await addIndividualAnimalAction(FARM_A, { category: "steer" });
    const z = await addIndividualAnimalAction(FARM_A, { category: "steer" });
    const e = await herd();
    for (const id of [A1, x.id, y.id, z.id]) expect(realAnimalView(e, id)).not.toBeNull();
    expect(new Set([A1, x.id, y.id, z.id]).size).toBe(4);
  });

  it("the add-animal card saves through the action, refreshes from the server and links the new animal's Cattle page", async () => {
    render(<AddAnimalCard farmId={FARM_A} groups={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Add an individual animal/ }));
    fireEvent.change(screen.getByLabelText("Tag number"), { target: { value: "IE 55" } });
    fireEvent.click(screen.getByRole("button", { name: "Save animal" }));
    const link = await screen.findByRole("link", { name: /Open it in Cattle/ });
    const row = rows("livestock_individuals").find((r) => r.tag_number === "IE 55")!;
    expect(row.farm_id).toBe(FARM_A);
    expect(link).toHaveAttribute("href", `/cattle/animals/${row.id}`);
    expect(refresh).toHaveBeenCalled();
  });

  it("the add-animal card shows a refusal and adds nothing", async () => {
    db.currentFarm = null;
    render(<AddAnimalCard farmId={FARM_A} groups={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Add an individual animal/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save animal" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn't be saved. Nothing was added/));
    expect(refresh).not.toHaveBeenCalled();
    expect(db.writes).toBe(0);
  });
});

describe("Pilot P3 — security (the farm is the server's)", () => {
  const refused = /isn't on your farm/;

  it("19: another farm's animal can't be reached from Cattle", async () => {
    expect(realAnimalView(await herd(), B1)).toBeNull();
  });

  it("20: another farm's group can't be edited; its row is untouched", async () => {
    await expect(updateLivestockGroupAction(G_B, { label: "Taken", farmerName: "x" })).rejects.toThrow(refused);
    expect(rows("livestock_groups").find((r) => r.id === G_B)!.label).toBe("B group");
  });

  it("21: create actions use the signed-in farm; a different farm id from the browser is refused and writes nothing", async () => {
    await expect(addLivestockGroupAction(FARM_B, newGroup("Planted"))).rejects.toThrow(refused);
    await expect(addIndividualAnimalAction(FARM_B, { category: "steer" })).rejects.toThrow(refused);
    expect(db.writes).toBe(0);
    const el = await ManageHerdPage({ searchParams: Promise.resolve({}) });
    expect(isValidElement<{ farmId: string }>(el) && el.props.farmId).toBe(FARM_A);
  });

  it("an animal can't be added to another farm's group, and the refusal is the same as for an unknown group", async () => {
    await expect(addIndividualAnimalAction(FARM_A, { category: "steer", groupId: G_B })).rejects.toThrow(refused);
    await expect(addIndividualAnimalAction(FARM_A, { category: "steer", groupId: "6c000000-0000-4000-8000-000000000009" })).rejects.toThrow(refused);
    expect(db.writes).toBe(0);
  });

  it("the old Livestock weight action can't write to another farm's animal either", async () => {
    await expect(addWeightObservationAction(FARM_A, B1, 500, "2026-10-01", "Farmer entered")).rejects.toThrow(refused);
    await expect(addWeightObservationAction(FARM_B, B1, 500, "2026-10-01", "Farmer entered")).rejects.toThrow(refused);
    expect(rows("livestock_weight_observations")).toEqual([]);
  });

  it("signed out: every management write is refused", async () => {
    db.currentFarm = null;
    await expect(addLivestockGroupAction(FARM_A, newGroup("x"))).rejects.toThrow(refused);
    await expect(updateLivestockGroupAction(G_A, { label: "x", farmerName: "x" })).rejects.toThrow(refused);
    await expect(addIndividualAnimalAction(FARM_A, { category: "steer" })).rejects.toThrow(refused);
    expect(db.writes).toBe(0);
  });
});

describe("Pilot P3 — demo stays separate", () => {
  it("22: demo mode's Manage herd says there is nothing to manage and reads no farm", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    vi.mocked(getFarmForCurrentUser).mockClear();
    const el = await ManageHerdPage({ searchParams: Promise.resolve({}) });
    render(el);
    expect(screen.getByText(REAL_UNAVAILABLE.MANAGE_DEMO.title)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Cattle/ })).toHaveAttribute("href", "/cattle");
    expect(vi.mocked(getFarmForCurrentUser)).not.toHaveBeenCalled();
  });

  it("23: demonstration identities can't use the real write actions", async () => {
    await expect(addIndividualAnimalAction("farm-demo", { category: "steer" })).rejects.toThrow();
    await expect(addLivestockGroupAction("farm-demo", newGroup("Demo"))).rejects.toThrow();
    const r = await recordRealCattleWeight({ requestId: "9e000000-0000-4000-8000-000000000002", animalId: "SYNTH-ANIMAL-1427", weightText: "500", observedDate: null });
    expect(r.ok).toBe(false);
    expect(db.writes).toBe(0);
  });

  it("24: the real herd screen has no fixture animals or figures", async () => {
    render(<RealHerdScreen view={realHerdView(await herd())} />);
    expect(document.body.textContent).not.toMatch(/SYNTH|1427|€\s?[1-9]|demonstration/i);
  });
});
