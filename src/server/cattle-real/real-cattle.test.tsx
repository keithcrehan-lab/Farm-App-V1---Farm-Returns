import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pilot Integration P1 — real cattle reads, end to end below the database:
 * real-shaped `livestock_*` rows → `real-records.ts` → frozen engines (`real-service.ts`) → C10 view-models → the
 * real screens and routes. The rows are written here in the database's own shape (uuid ids, lowercase sex, date-only
 * weights, timestamptz `created_at`); the synthetic demonstration herd is never a source.
 */

vi.mock("@/lib/farm-data/cattle-source", () => ({ readCattleSourceForCurrentFarm: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: vi.fn(() => true), requireSupabaseEnv: vi.fn() }));

import type { LivestockGroup } from "@/domain/types";
import type { LivestockIndividualRow, WeightObservationRow } from "@/lib/farm-data/row-types";
import { readCattleSourceForCurrentFarm } from "@/lib/farm-data/cattle-source";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { RealAnimalProfileScreen } from "@/components/cattle/AnimalProfileScreen";
import { RealGroupScreen, RealHerdScreen } from "@/components/cattle/HerdScreens";
import { CattleDemoSessionProvider } from "@/components/cattle/session/CattleDemoSessionProvider";
import { evaluateRealCattle, loadRealCattle, realAnimalView, realHerdView, type RealEvaluation } from "./real-service";
import { REAL_TAG_SCHEME, realCattleRecords } from "./real-records";
import CattlePage from "@/app/(app)/cattle/page";
import CattleAnimalPage from "@/app/(app)/cattle/animals/[tag]/page";
import CattleAnimalPlanPage from "@/app/(app)/cattle/animals/[tag]/plan/page";
import CattleGroupPage from "@/app/(app)/cattle/groups/[groupRef]/page";

// ---------------------------------------------------------------------------
// Real-shaped rows (two farms)
// ---------------------------------------------------------------------------

const FARM_A = "f0000000-0000-4000-8000-00000000000a";
const FARM_B = "f0000000-0000-4000-8000-00000000000b";
const G_BULLOCKS = "6a000000-0000-4000-8000-000000000001";
const G_HEIFERS = "6a000000-0000-4000-8000-000000000002";
const G_SUCKLERS = "6a000000-0000-4000-8000-000000000003"; // headcount only
const G_B = "6b000000-0000-4000-8000-000000000001";
const A1 = "a1000000-0000-4000-8000-000000000001"; // full record, 3 weights
const A2 = "a1000000-0000-4000-8000-000000000002"; // same tag as A1
const A3 = "a1000000-0000-4000-8000-000000000003"; // no tag, no DOB / sex / breed, no weight
const A4 = "a1000000-0000-4000-8000-000000000004"; // heifer, one weight
const A5 = "a1000000-0000-4000-8000-000000000005"; // ungrouped
const B1 = "b1000000-0000-4000-8000-000000000001"; // farm B
const VP = { effectiveAt: "2026-10-24T10:00:00Z", knowledgeCutoff: "2026-10-24T10:00:00Z" };

const group = (id: string, farmId: string, label: string, head: number): LivestockGroup => ({
  id,
  farmId,
  category: "steer",
  label,
  count: { value: head, status: "verified", source: "Sean Murphy" },
  system: "grazing",
  value: { value: 0, status: "estimated", source: "Farm Return assumption" },
});
const animal = (id: string, farmId: string, groupId: string | null, o: Partial<LivestockIndividualRow> = {}): LivestockIndividualRow => ({
  id,
  farm_id: farmId,
  group_id: groupId,
  tag_number: null,
  category: "steer",
  sex: null,
  breed: null,
  date_of_birth: null,
  goal_status: null,
  notes: null,
  created_at: "2026-07-01T08:30:00.123456+00:00",
  updated_at: "2026-07-01T08:30:00.123456+00:00",
  ...o,
});
let wn = 0;
const weight = (animalId: string, farmId: string, date: string, kg: number): WeightObservationRow => ({
  id: `c0000000-0000-4000-8000-${String(++wn).padStart(12, "0")}`,
  farm_id: farmId,
  animal_id: animalId,
  weight_kg: kg,
  observed_date: date,
  source: "Weighbridge at the mart", // free text: never read as a method
  created_at: `${date}T19:12:00+00:00`,
});

function farmA() {
  return {
    farmId: FARM_A,
    groups: [group(G_BULLOCKS, FARM_A, "Bullocks", 3), group(G_HEIFERS, FARM_A, "Heifers", 1), group(G_SUCKLERS, FARM_A, "Sucklers", 40)],
    animals: [
      animal(A1, FARM_A, G_BULLOCKS, { tag_number: "IE 372 1234", sex: "male", breed: "Charolais cross", date_of_birth: "2025-03-14", goal_status: "Finishing — on track" }),
      animal(A2, FARM_A, G_BULLOCKS, { tag_number: "IE 372 1234", sex: "male", breed: "Limousin" }),
      animal(A3, FARM_A, G_BULLOCKS),
      animal(A4, FARM_A, G_HEIFERS, { tag_number: "IE 372 5555", sex: "female" }),
      animal(A5, FARM_A, null, { tag_number: "IE 372 9999", sex: "female", breed: "Angus" }),
    ],
    weights: [weight(A1, FARM_A, "2026-07-01", 402), weight(A1, FARM_A, "2026-08-01", 433), weight(A1, FARM_A, "2026-09-01", 464), weight(A2, FARM_A, "2026-09-10", 455), weight(A4, FARM_A, "2026-09-20", 380)],
  };
}
function farmB() {
  return { farmId: FARM_B, groups: [group(G_B, FARM_B, "Farm B stores", 1)], animals: [animal(B1, FARM_B, G_B, { tag_number: "IE 999 0001" })], weights: [weight(B1, FARM_B, "2026-09-01", 610)] };
}

function evaluated(input = farmA()): RealEvaluation {
  const r = evaluateRealCattle(input, VP);
  if (!r.ok) throw new Error(r.reason);
  return r.evaluation;
}

/** Every fixture marker the demonstration herd / catalogue / economics use. */
const FIXTURE_MARKERS = /SYNTH|demonstration|Demonstration|Ballybeg|1427|1431|Finishers|Field 6|Shed 2|Synthetic|Blessington|Carnew|Example mart|Development fixture|€\s?[1-9]|DEMO_/;

beforeEach(() => {
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  vi.mocked(readCattleSourceForCurrentFarm).mockResolvedValue({ state: "OK", records: farmA() });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Translation and engine path
// ---------------------------------------------------------------------------

describe("Pilot P1 — real records through the frozen cattle stack", () => {
  it("1/15: a real farm with groups and individual animals gives the real herd", () => {
    const { herd } = realHerdView(evaluated());
    expect(herd.animalCount).toBe(5);
    expect(herd.groups.state).toBe("ITEMS");
    const groups = herd.groups.state === "ITEMS" ? herd.groups.items : [];
    expect(groups.map((g) => [g.groupRef, g.name])).toEqual([
      [G_BULLOCKS, "Bullocks"],
      [G_HEIFERS, "Heifers"],
    ]);
    const bullocks = groups[0].scope;
    expect(bullocks.state === "KNOWN" && bullocks.value.memberCount).toBe(3);
  });

  it("2/3: identity is the database uuid; two animals with the same tag, and one with none, stay distinct", () => {
    const e = evaluated();
    expect(e.outputs.ledgers.map((l) => l.animalId).sort()).toEqual([A1, A2, A3, A4, A5].sort());
    const a1 = realAnimalView(e, A1)!.profile;
    const a2 = realAnimalView(e, A2)!.profile;
    expect(a1.animalId).toBe(A1);
    expect(a2.animalId).toBe(A2);
    expect(a1.tag.value).toBe("IE 372 1234");
    expect(a2.tag.value).toBe("IE 372 1234");
    expect(a1.weight).not.toEqual(a2.weight);
    const a3 = realAnimalView(e, A3)!.profile;
    expect(a3.tag.value).toBeNull();
    expect(a3.tag.state.code).toBe("IDENTITY:UNKNOWN");
    // A tag never opens an animal.
    expect(realAnimalView(e, "IE 372 1234")).toBeNull();
  });

  it("4/5: weight history maps date, kg and knowledge time; the method is UNKNOWN (never read from the free-text source)", () => {
    const e = evaluated();
    const series = e.outputs.weights!.series.find((s) => s.animalId === A1)!;
    expect(series.observations.map((o) => [o.observedAt.slice(0, 10), o.canonicalWeight.kg, o.measurementBasis])).toEqual([
      ["2026-07-01", 402, "UNKNOWN"],
      ["2026-08-01", 433, "UNKNOWN"],
      ["2026-09-01", 464, "UNKNOWN"],
    ]);
    const rec = e.records.weights.find((w) => w.animalId === A1)!;
    expect(rec).toMatchObject({ observedAt: "2026-07-01T00:00:00Z", method: "UNKNOWN", weight: { value: 402, unit: "KILOGRAM" }, provenance: { sourceCategory: "FARMER", sourceSystem: "farm-return", receivedAt: "2026-07-01T19:12:00Z" } });
    const p = realAnimalView(e, A1)!.profile;
    expect(p.weight.state === "KNOWN" && p.weight.kg).toBe(464);
    expect(p.weight.state === "KNOWN" && p.weight.basis.kind).toBe("UNKNOWN");
    expect(p.metrics.weight.state.label).toBe("Method not recorded");
    expect(JSON.stringify(p)).not.toMatch(/Weighbridge|Weighed\b|weighed on/);
  });

  it("supported performance: gain is derived from two or more real weights; there is no target, so none is compared", () => {
    const p = realAnimalView(evaluated(), A1)!.profile;
    expect(p.metrics.gain.value).toBe("1.00");
    expect(p.gain.periodLabel).toMatch(/\+62 kg from 1 Jul to 1 Sep/);
    expect(p.target.comparisons).toEqual([]);
    expect(p.performanceState.code).toBe("TARGET:NO_TARGET");
    // One weight: no gain is claimed.
    const a4 = realAnimalView(evaluated(), A4)!.profile;
    expect(a4.metrics.gain.value).toBeNull();
  });

  it("6: missing DOB / sex / breed stay not recorded (no default)", () => {
    const p = realAnimalView(evaluated(), A3)!.profile;
    for (const f of [p.identity.breed, p.identity.sex, p.identity.age]) {
      expect(f.value).toBeNull();
      expect(f.state.code).toBe("IDENTITY:UNKNOWN");
    }
    expect(p.weight.state).not.toBe("KNOWN");
  });

  it("the not-stored parts are unknown, never none / clear / zero", () => {
    const p = realAnimalView(evaluated(), A1)!.profile;
    expect(p.identity.location.value).toBeNull();
    expect(p.identity.location.state.code).toBe("IDENTITY:UNKNOWN");
    expect(p.costs.state).toBe("UNAVAILABLE");
    expect(p.health.medicines.state).toBe("UNAVAILABLE");
    expect(p.health.programmes.state).toBe("UNAVAILABLE");
    expect(p.health.obligations.state).toBe("UNAVAILABLE");
    expect(p.goal.summary.state).not.toBe("TEXT");
    // The free-text goal_status is not parsed into a goal.
    expect(JSON.stringify(p)).not.toMatch(/Finishing — on track|"FINISHING"/);
    expect(JSON.stringify(p)).not.toMatch(/(?<!not )€0|(?<![\d.])0 kg|No treatments|Withdrawal clear/i);
  });

  it("the frozen engine's own work is shown as it reports it (incl. the insufficient-evidence programme item)", () => {
    const e = evaluated();
    expect(e.outputs.plan.ok).toBe(true);
    const a1 = realAnimalView(e, A1)!.profile;
    const titles = a1.work.open.state === "ITEMS" ? [a1.work.open.primary, ...a1.work.open.others].map((w) => w.title) : [];
    expect(titles).toContain("Complete programme treatment");
    // An animal with no weight gets the frozen RECORD_WEIGHT proposal.
    const a3 = realAnimalView(e, A3)!.profile;
    expect(a3.work.open.state === "ITEMS" && a3.work.open.primary.actionKind).toBe("RECORD_WEIGHT");
  });

  it("7: an ungrouped animal is listed, never dropped or put in a made-up group", () => {
    const e = evaluated();
    const { extras, herd } = realHerdView(e);
    expect(extras.ungrouped.map((a) => a.animalId)).toEqual([A5]);
    expect(extras.ungrouped[0].tag).toBe("IE 372 9999");
    const listed = herd.groups.state === "ITEMS" ? herd.groups.items.flatMap((g) => (g.scope.state === "KNOWN" && g.scope.value.members.state === "ITEMS" ? g.scope.value.members.items.map((m) => m.animalId) : [])) : [];
    expect(listed).not.toContain(A5);
    // Not "unresolved" in every group either (D11): a null group is a recorded "not in a group".
    const unresolved = herd.groups.state === "ITEMS" ? herd.groups.items.flatMap((g) => (g.scope.state === "KNOWN" ? g.scope.value.unresolved.map((m) => m.animalId) : [])) : [];
    expect(unresolved).toEqual([]);
    expect(realAnimalView(e, A5)!.profile.identity.group.groupRef).toBeNull();
  });

  it("8: a headcount-only group keeps its headcount and is never '0 animals'", () => {
    const e = evaluated();
    const { extras, herd } = realHerdView(e);
    expect(extras.headcountGroups).toEqual([{ groupRef: G_SUCKLERS, name: "Sucklers", summary: "40 head on Livestock · individual animals not recorded" }]);
    const groups = herd.groups.state === "ITEMS" ? herd.groups.items : [];
    expect(groups.some((g) => g.groupRef === G_SUCKLERS)).toBe(false);
    expect(JSON.stringify(extras)).not.toMatch(/\b0 animals\b/);
    // A group whose headcount differs from its individual records says so.
    expect(extras.headcountNotes).toEqual([]);
    const more = farmA();
    more.groups[0] = group(G_BULLOCKS, FARM_A, "Bullocks", 25);
    expect(realHerdView(evaluated(more)).extras.headcountNotes).toEqual([{ groupRef: G_BULLOCKS, text: "Livestock records 25 head in this group; 3 are recorded individually." }]);
  });

  it("10/12: no SYNTH id, demonstration label, fixture price, cost, target or programme reaches the real view", () => {
    const e = evaluated();
    const serialised = JSON.stringify({ herd: realHerdView(e), animals: [A1, A2, A3, A4, A5].map((id) => realAnimalView(e, id)) });
    expect(serialised).not.toMatch(FIXTURE_MARKERS);
    expect(e.records.directory.tagScheme).toBe(REAL_TAG_SCHEME);
    expect(e.records.directory).toMatchObject({ locationLabels: {}, programmeLabels: {}, obligationLabels: {}, foodProductLabels: {}, productLabels: {} });
  });

  it("an invalid stored weight (≤ 0 — no database check) makes weights explicitly unavailable, never dropped", () => {
    const bad = farmA();
    bad.weights.push(weight(A4, FARM_A, "2026-10-01", 0));
    const e = evaluated(bad);
    expect(e.outputs.weights).toBeNull();
    const p = realAnimalView(e, A1)!.profile;
    expect(p.weight.state).not.toBe("KNOWN");
    expect(p.metrics.weight.value).toBeNull();
    expect(realHerdView(e).herd.openWorkCount.state).toBe("UNAVAILABLE");
  });

  it("an animal record the frozen ledger refuses is listed as unreadable, not dropped and not evaluated half-way", () => {
    const bad = farmA();
    bad.animals.push(animal("a1000000-0000-4000-8000-000000000009", FARM_A, G_HEIFERS, { tag_number: " IE 1 " }));
    const e = evaluated(bad);
    expect(realHerdView(e).extras.unreadable).toEqual([{ animalId: "a1000000-0000-4000-8000-000000000009", label: " IE 1 : record can't be read" }]);
    expect(realAnimalView(e, "a1000000-0000-4000-8000-000000000009")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation
// ---------------------------------------------------------------------------

describe("Pilot P1 — tenant isolation", () => {
  it("13: farm A's evaluation cannot open farm B's animal or group (same answer as an unknown id)", () => {
    const e = evaluated();
    expect(realAnimalView(e, B1)).toBeNull();
    expect(realAnimalView(e, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("14: farm B rows reaching farm A's translation fail the whole read closed (never mixed in, never silently dropped)", () => {
    const a = farmA();
    const b = farmB();
    expect(realCattleRecords({ ...a, weights: [...a.weights, b.weights[0]] })).toEqual({ ok: false, reason: "FOREIGN_ROW" });
    expect(realCattleRecords({ ...a, animals: [...a.animals, b.animals[0]] })).toEqual({ ok: false, reason: "FOREIGN_ROW" });
    // A same-farm-labelled weight for another farm's animal, or a membership in another farm's group.
    expect(realCattleRecords({ ...a, weights: [...a.weights, { ...b.weights[0], farm_id: FARM_A }] })).toEqual({ ok: false, reason: "UNKNOWN_ANIMAL" });
    expect(realCattleRecords({ ...a, animals: [...a.animals, animal("a1000000-0000-4000-8000-0000000000aa", FARM_A, G_B)] })).toEqual({ ok: false, reason: "UNKNOWN_GROUP" });
  });

  it("14: farm A's view never carries farm B's weights", () => {
    const serialised = JSON.stringify({ herd: realHerdView(evaluated()), a1: realAnimalView(evaluated(), A1) });
    expect(serialised).not.toMatch(/610|IE 999 0001|Farm B stores/);
  });

  it("the routes can't be given a farm: they read the signed-in farm only, and another farm's ids are not found", async () => {
    await expect(CattleAnimalPage({ params: Promise.resolve({ tag: B1 }), searchParams: Promise.resolve({}) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    await expect(CattleGroupPage({ params: Promise.resolve({ groupRef: G_B }), searchParams: Promise.resolve({}) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    await expect(CattleAnimalPlanPage({ params: Promise.resolve({ tag: B1 }), searchParams: Promise.resolve({}) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    // A tag in the URL is not an animal id.
    await expect(CattleAnimalPage({ params: Promise.resolve({ tag: "IE 372 1234" }), searchParams: Promise.resolve({}) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    for (const call of vi.mocked(readCattleSourceForCurrentFarm).mock.calls) expect(call).toEqual([]);
  });

  it("no real-mode cattle function takes a farm id from its caller", () => {
    const src = (f: string) => readFileSync(path.resolve(__dirname, "../../..", f), "utf8");
    expect(src("src/server/cattle-real/real-service.ts")).toMatch(/export async function loadRealCattle\(now: Date = new Date\(\)\)/);
    expect(src("src/lib/farm-data/cattle-source.ts")).toMatch(/export async function readCattleSourceForCurrentFarm\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Demo isolation (architecture)
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, "../../..");
function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (base === null) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) if (existsSync(c) && !c.endsWith(path.sep) && /\.(ts|tsx)$/.test(c)) return c;
  return null;
}
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [path.join(ROOT, entry)];
  while (stack.length > 0) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
      const r = resolveImport(f, m[1]);
      if (r) stack.push(r);
    }
  }
  return seen;
}

describe("Pilot P1 — demo isolation", () => {
  it("11: nothing reachable from the real cattle service, translation or source imports the demonstration modules or the test fixtures", () => {
    for (const entry of ["src/server/cattle-real/real-service.ts", "src/server/cattle-real/real-records.ts", "src/lib/farm-data/cattle-source.ts", "src/server/cattle-plan/plan-jobs.ts"]) {
      const files = [...reachable(entry)].map((f) => path.relative(ROOT, f));
      expect(files.length).toBeGreaterThan(1);
      expect(files.filter((f) => f.startsWith("src/server/cattle-demo/") || f === "src/domain/cattle/test-fixtures.ts" || f.startsWith("src/components/cattle/session/")), entry).toEqual([]);
    }
  });

  it("18: demo mode (Supabase not configured) still serves the demonstration herd and never reads the real source", async () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    vi.mocked(readCattleSourceForCurrentFarm).mockClear();
    const page = await CattlePage({ searchParams: Promise.resolve({}) });
    render(<CattleDemoSessionProvider>{page}</CattleDemoSessionProvider>);
    expect(screen.getByText(/Demonstration herd\./)).toBeInTheDocument();
    expect(screen.getAllByText("Finishers").length).toBeGreaterThan(0);
    expect(document.querySelector('[data-cattle-mode="REAL"]')).toBeNull();
    expect(vi.mocked(readCattleSourceForCurrentFarm)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Real screens and routes
// ---------------------------------------------------------------------------

describe("Pilot P1 — real screens", () => {
  it("15: the real /cattle route renders the farm's herd, links animals by uuid, and shows no demo controls", async () => {
    const page = await CattlePage({ searchParams: Promise.resolve({}) });
    render(page);
    expect(screen.getByRole("heading", { name: "Cattle" })).toBeInTheDocument();
    expect(screen.getByText(/5 animals in 2 groups/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Bullocks/ })).toHaveAttribute("href", `/cattle/groups/${G_BULLOCKS}`);
    expect(screen.getByText("Sucklers")).toBeInTheDocument();
    expect(screen.getByText("40 head on Livestock · individual animals not recorded")).toBeInTheDocument();
    const ungrouped = screen.getByRole("heading", { name: "Not in a group" }).closest("section")!;
    expect(within(ungrouped).getByRole("link")).toHaveAttribute("href", `/cattle/animals/${A5}`);
    expect(document.body.textContent).not.toMatch(FIXTURE_MARKERS);
    expect(screen.queryByText(/Demonstration controls|Start again|Edge-state scenarios/)).toBeNull();
    expect(document.querySelectorAll("a[href*='scenario=']").length).toBe(0);
  });

  it("15: the real group route lists members by uuid (two with the same tag link to different animals)", async () => {
    const page = await CattleGroupPage({ params: Promise.resolve({ groupRef: G_BULLOCKS }), searchParams: Promise.resolve({}) });
    render(page);
    const hrefs = [...document.querySelectorAll("a[href^='/cattle/animals/']")].map((a) => a.getAttribute("href"));
    expect(hrefs.sort()).toEqual([A1, A2, A3].map((id) => `/cattle/animals/${id}`).sort());
    expect(screen.getAllByText("IE 372 1234")).toHaveLength(2);
  });

  it("8: the headcount-only group's route says individual animals aren't recorded — not '0 animals'", async () => {
    render(<RealGroupScreen view={realHerdView(evaluated())} groupRef={G_SUCKLERS} />);
    expect(screen.getByRole("heading", { name: "Sucklers" })).toBeInTheDocument();
    expect(screen.getByText("40 head on Livestock · individual animals not recorded")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b0 animals\b/);
  });

  it("16: the real animal route renders the profile from real-shaped records, read-only", async () => {
    const page = await CattleAnimalPage({ params: Promise.resolve({ tag: A1 }), searchParams: Promise.resolve({}) });
    render(page);
    expect(screen.getByRole("heading", { name: "IE 372 1234" })).toBeInTheDocument();
    expect(screen.getByText(/Charolais cross · Male/)).toBeInTheDocument();
    expect(screen.getAllByText(/Method not recorded/).length).toBeGreaterThan(0);
    expect(screen.getByText(/aren't kept in Farm Return yet, so withdrawal/)).toBeInTheDocument();
    expect(screen.getByText(/costs are unknown — not €0/)).toBeInTheDocument();
    // P1 persists nothing: no Record Weight, plan, goal or photo control, no demo copy.
    expect(screen.queryByRole("button", { name: /Record a weight|Record weight/ })).toBeNull();
    expect(screen.queryByText(/Plan this animal to sale|View animal plan/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Photos" })).toBeNull();
    expect(screen.getByText(/isn't available/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(FIXTURE_MARKERS);
    expect(screen.getByRole("link", { name: /Bullocks/ })).toHaveAttribute("href", `/cattle/groups/${G_BULLOCKS}`);
  });

  it("12: the real plan route is unavailable (no fixture economics)", async () => {
    render(await CattleAnimalPlanPage({ params: Promise.resolve({ tag: A1 }), searchParams: Promise.resolve({}) }));
    expect(screen.getByText("The animal plan isn't available for your farm yet.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(FIXTURE_MARKERS);
  });

  it("17: no farm, a failed or incomplete read, or refused records → explicit unavailable, never the demo herd", async () => {
    for (const [source, text] of [
      [{ state: "NO_FARM" }, "No farm is set up for this account yet."],
      [{ state: "UNAVAILABLE" }, "Your cattle records couldn't be read just now."],
      [{ state: "INCOMPLETE" }, "Your cattle records couldn't be read just now."],
      [{ state: "OK", records: { ...farmA(), weights: [...farmA().weights, farmB().weights[0]] } }, "Your cattle records couldn't be read just now."],
    ] as const) {
      vi.mocked(readCattleSourceForCurrentFarm).mockResolvedValue(source as never);
      const { unmount } = render(await CattlePage({ searchParams: Promise.resolve({}) }));
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(document.body.textContent).not.toMatch(FIXTURE_MARKERS);
      unmount();
    }
  });

  it("17: an engine-level failure inside the evaluation is unavailable, not a crash or a fallback", async () => {
    vi.mocked(readCattleSourceForCurrentFarm).mockResolvedValue({ state: "OK", records: { ...farmA(), groups: null } } as never);
    expect(await loadRealCattle()).toEqual({ state: "UNAVAILABLE" });
  });

  it("the real profile screen component shows the real notice and footer", () => {
    render(<RealAnimalProfileScreen view={realAnimalView(evaluated(), A4)!} />);
    expect(screen.getByText(/your farm's records \(read-only\)/)).toBeInTheDocument();
    expect(document.querySelector('[data-cattle-mode="REAL"]')).not.toBeNull();
  });

  it("the real herd screen component renders without the demonstration session provider", () => {
    render(<RealHerdScreen view={realHerdView(evaluated())} />);
    expect(screen.getByText(/read-only here for now/)).toBeInTheDocument();
  });
});
