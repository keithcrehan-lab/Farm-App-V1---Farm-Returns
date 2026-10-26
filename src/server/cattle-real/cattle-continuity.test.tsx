import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cattle continuity — the signed-in Cattle home and group pages
 * (docs/design/cattle-home-continuity-reference.html) over real-shaped rows:
 * recorded headcounts, real weights, D16-gated work wording, database-id
 * links through to the Living Animal Record, and demo/real isolation.
 */

vi.mock("@/lib/farm-data/cattle-source", () => ({ readCattleSourceForCurrentFarm: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: vi.fn(() => true), requireSupabaseEnv: vi.fn() }));

import type { LivestockGoal, LivestockGroup } from "@/domain/types";
import type { LivestockIndividualRow, WeightObservationRow } from "@/lib/farm-data/row-types";
import { readCattleSourceForCurrentFarm } from "@/lib/farm-data/cattle-source";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { HerdScreen, RealGroupScreen, RealHerdScreen } from "@/components/cattle/HerdScreens";
import { CattleDemoSessionProvider } from "@/components/cattle/session/CattleDemoSessionProvider";
import { EMPTY_CATTLE_DEMO_SESSION } from "@/components/cattle/session/demo-session";
import { demoHerdView } from "@/server/cattle-demo/demo-service";
import { evaluateRealCattle, realHerdView, type RealEvaluation } from "./real-service";
import CattlePage from "@/app/(app)/cattle/page";
import CattleGroupPage from "@/app/(app)/cattle/groups/[groupRef]/page";
import CattleAnimalPage from "@/app/(app)/cattle/animals/[tag]/page";

const FARM = "f0000000-0000-4000-8000-0000000000c1";
const G_WEAN = "6c000000-0000-4000-8000-000000000001";
const G_OTHER = "6c000000-0000-4000-8000-000000000002";
const A_TEST = "ac000000-0000-4000-8000-000000000001";
const A_NEW = "ac000000-0000-4000-8000-000000000002";
const VP = { effectiveAt: "2026-10-26T10:00:00Z", knowledgeCutoff: "2026-10-26T10:00:00Z" };

const group = (id: string, label: string, head: number | null, goal?: LivestockGoal): LivestockGroup => ({
  id,
  farmId: FARM,
  category: "weanling",
  label,
  count: head === null ? (undefined as never) : { value: head, status: "verified", source: "Farmer" },
  system: "grazing",
  value: { value: 0, status: "estimated", source: "Farm Return assumption" },
  ...(goal ? { goal } : {}),
});
const animal = (id: string, groupId: string | null, o: Partial<LivestockIndividualRow> = {}): LivestockIndividualRow => ({
  id,
  farm_id: FARM,
  group_id: groupId,
  tag_number: null,
  category: "weanling",
  sex: null,
  breed: null,
  date_of_birth: null,
  goal_status: null,
  notes: null,
  created_at: "2026-07-01T08:30:00+00:00",
  updated_at: "2026-07-01T08:30:00+00:00",
  ...o,
});
let wn = 0;
const weight = (animalId: string, date: string, kg: number): WeightObservationRow => ({
  id: `cc000000-0000-4000-8000-${String(++wn).padStart(12, "0")}`,
  farm_id: FARM,
  animal_id: animalId,
  weight_kg: kg,
  observed_date: date,
  source: null as never,
  created_at: `${date}T19:12:00+00:00`,
});

/** The pilot farm's shape: one group of 20 head with one individually recorded, weighed animal. */
const weanlings = (o: { head?: number | null; goal?: LivestockGoal; weights?: WeightObservationRow[]; extra?: LivestockIndividualRow[] } = {}) => ({
  farmId: FARM,
  groups: [group(G_WEAN, "Weanlings", o.head === undefined ? 20 : o.head, o.goal)],
  animals: [animal(A_TEST, G_WEAN, { tag_number: "test", sex: "male", breed: "Belgian Blue" }), ...(o.extra ?? [])],
  weights: o.weights ?? [weight(A_TEST, "2026-09-01", 560), weight(A_TEST, "2026-10-25", 601)],
});

function evaluated(input = weanlings()): RealEvaluation {
  const r = evaluateRealCattle(input, VP);
  if (!r.ok) throw new Error(r.reason);
  return r.evaluation;
}

const objectOf = (groupRef: string) => document.querySelector(`[data-group-object="${groupRef}"]`) as HTMLElement;
const UNSUPPORTED_CLAIM = /nothing (currently )?needs attention|all clear|healthy|compliant|\b0 head\b|\b0 animals\b/i;

beforeEach(() => {
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  vi.mocked(readCattleSourceForCurrentFarm).mockResolvedValue({ state: "OK", records: weanlings() } as never);
});
afterEach(() => cleanup());

describe("Cattle home — the group object", () => {
  it("shows the real headcount, group count and the group as one strong object", () => {
    render(<RealHerdScreen view={realHerdView(evaluated())} />);
    expect(screen.getByRole("heading", { level: 1, name: "Cattle" })).toBeInTheDocument();
    expect(document.querySelector("[data-herd-headline]")).toHaveTextContent("20 head · 1 group");
    const g = objectOf(G_WEAN);
    expect(within(g).getByRole("heading", { name: "Weanlings" })).toBeInTheDocument();
    expect(within(g).getByText("20")).toBeInTheDocument();
    expect(within(g).getByText("19 head held as group count · 1 animal recorded individually")).toBeInTheDocument();
  });

  it("states individual records and the latest real weight with its date", () => {
    render(<RealHerdScreen view={realHerdView(evaluated())} />);
    const g = objectOf(G_WEAN);
    expect(within(g).getByText("Individual records").nextElementSibling).toHaveTextContent("1");
    expect(within(g).getByText("Latest weight").nextElementSibling).toHaveTextContent("601");
    expect(within(g).getByText("kg · 25 Oct")).toBeInTheDocument();
  });

  it("the whole object is entered by one link to the group's database id; Manage herd stays secondary and correct", () => {
    render(<RealHerdScreen view={realHerdView(evaluated())} />);
    const g = objectOf(G_WEAN);
    const links = within(g).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Open Weanlings");
    expect(links[0]).toHaveAttribute("href", `/cattle/groups/${G_WEAN}`);
    expect(screen.getByRole("link", { name: /Manage herd/ })).toHaveAttribute("href", "/cattle/manage");
  });

  it("says precisely what work was checked: no open weighing work, other work not inferred — never 'nothing needs attention'", () => {
    render(<RealHerdScreen view={realHerdView(evaluated())} />);
    const g = objectOf(G_WEAN);
    expect(within(g).getByText("No open weighing work")).toBeInTheDocument();
    expect(within(g).getByText("Other work not inferred")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(UNSUPPORTED_CLAIM);
  });

  it("an unweighed animal is open weighing work (the frozen Record Weight proposal), counted per animal", () => {
    const e = evaluated(weanlings({ extra: [animal(A_NEW, G_WEAN, { tag_number: "new" })] }));
    render(<RealHerdScreen view={realHerdView(e)} />);
    const g = objectOf(G_WEAN);
    expect(within(g).getByText("1 animal needs weighing")).toBeInTheDocument();
    expect(within(g).getByText("18 head held as group count · 2 animals recorded individually")).toBeInTheDocument();
    expect(within(g).getByText("Latest individual weight")).toBeInTheDocument();
  });

  it("caveats are one interaction away (About records, Quick view), not a banner", () => {
    render(<RealHerdScreen view={realHerdView(evaluated())} />);
    const about = screen.getByText("About records").closest("details")!;
    expect(about).not.toHaveAttribute("open");
    expect(within(about).getByText(/weighing work only for now/)).toBeInTheDocument();
    const quick = screen.getByRole("button", { name: "Quick view" });
    const panel = document.getElementById(quick.getAttribute("aria-controls")!)!;
    expect(panel).not.toBeVisible();
    fireEvent.click(quick);
    expect(quick).toHaveAttribute("aria-expanded", "true");
    expect(panel).toBeVisible();
    expect(within(panel).getByText("Location").nextElementSibling).toHaveTextContent("Not recorded");
    expect(within(panel).getByText("Production goal").nextElementSibling).toHaveTextContent("Not recorded");
    expect(within(panel).getByText("Last weighing").nextElementSibling).toHaveTextContent("25 Oct 2026");
  });

  it("a group goal set in Manage herd is shown as recorded, never invented", () => {
    render(<RealHerdScreen view={realHerdView(evaluated(weanlings({ goal: "grow" })))} />);
    const panel = within(objectOf(G_WEAN).parentElement!);
    expect(panel.getByText("Production goal").nextElementSibling).toHaveTextContent("Grow");
  });
});

describe("Cattle home — unknown is never zero", () => {
  it("an unreadable headcount gives no herd total and no '0 head' — the individual records are said as such", () => {
    render(<RealHerdScreen view={realHerdView(evaluated(weanlings({ head: null })))} />);
    expect(document.querySelector("[data-herd-headline]")).toHaveTextContent("1 animal recorded individually · 1 group");
    expect(screen.getByText(/no herd total is shown/)).toBeInTheDocument();
    expect(within(objectOf(G_WEAN)).getByText("Group headcount can't be read · 1 animal recorded individually")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(UNSUPPORTED_CLAIM);
  });

  it("a headcount below the individual records is a disagreement, not a size", () => {
    const e = evaluated({ ...weanlings({ head: 1 }), animals: [animal(A_TEST, G_WEAN, { tag_number: "test" }), animal(A_NEW, G_WEAN, { tag_number: "new" })] });
    render(<RealHerdScreen view={realHerdView(e)} />);
    expect(within(objectOf(G_WEAN)).getByText("The group's headcount is 1; 2 are recorded individually.")).toBeInTheDocument();
    expect(screen.getByText(/no herd total is shown/)).toBeInTheDocument();
  });

  it("a headcount-only group shows its head and is not checked for work — never '0 animals' or 'no open work'", () => {
    const e = evaluated({ ...weanlings(), groups: [...weanlings().groups, group(G_OTHER, "Sucklers", 40)] });
    render(<RealHerdScreen view={realHerdView(e)} />);
    const g = objectOf(G_OTHER);
    expect(within(g).getByText("40 head recorded for the group · individual animals not recorded")).toBeInTheDocument();
    expect(within(g).getByText("Not checked")).toBeInTheDocument();
    expect(within(g).queryByText(/No open/)).toBeNull();
    expect(document.querySelector("[data-herd-headline]")).toHaveTextContent("60 head · 2 groups");
  });

  it("a farm with no cattle recorded says so — not '0 head'", () => {
    render(<RealHerdScreen view={realHerdView(evaluated({ farmId: FARM, groups: [], animals: [], weights: [] }))} />);
    expect(document.querySelector("[data-herd-headline]")).toHaveTextContent("— no cattle recorded yet · 0 groups");
    expect(document.body.textContent).not.toMatch(/\b0 head\b/);
  });
});

describe("Group page — the group stays the working object", () => {
  it("dark group header with the real headcount, then the individual animal linked by database id", () => {
    render(<RealGroupScreen view={realHerdView(evaluated())} groupRef={G_WEAN} />);
    expect(screen.getByRole("heading", { level: 1, name: "Weanlings" })).toBeInTheDocument();
    expect(screen.getByText("1 of 20 head is recorded individually.")).toBeInTheDocument();
    const animals = screen.getByRole("region", { name: "Individual animals" });
    const row = within(animals).getByRole("link", { name: /test/ });
    expect(row).toHaveAttribute("href", `/cattle/animals/${A_TEST}`);
    expect(within(row).getByText("601 kg")).toBeInTheDocument();
    expect(within(row).getByText(/^25 Oct/)).toBeInTheDocument();
    expect(within(row).getByText("No open weighing work")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit this group in Manage herd" })).toHaveAttribute("href", "/cattle/manage?tab=Groups");
    expect(screen.getByRole("link", { name: "← Cattle" })).toHaveAttribute("href", "/cattle");
  });

  it("the context says location and goal are not recorded — never zero or clear", () => {
    render(<RealGroupScreen view={realHerdView(evaluated())} groupRef={G_WEAN} />);
    const ctx = screen.getByRole("complementary", { name: "Group context" });
    expect(within(ctx).getByText("Location").nextElementSibling).toHaveTextContent(/^Not recorded/);
    expect(within(ctx).getByText("Production goal").nextElementSibling).toHaveTextContent(/^Not recorded/);
    expect(within(ctx).getByText("Supported work").nextElementSibling).toHaveTextContent(/^No open weighing work/);
    expect(document.body.textContent).not.toMatch(UNSUPPORTED_CLAIM);
  });

  it("route → group → animal: the row's href opens the existing Living Animal Record", async () => {
    render(await CattlePage({ searchParams: Promise.resolve({}) }));
    const groupHref = within(objectOf(G_WEAN)).getByRole("link").getAttribute("href")!;
    cleanup();
    const groupRef = decodeURIComponent(groupHref.split("/").pop()!);
    render(await CattleGroupPage({ params: Promise.resolve({ groupRef }), searchParams: Promise.resolve({}) }));
    const animalHref = screen.getByRole("link", { name: /test/ }).getAttribute("href")!;
    expect(animalHref).toBe(`/cattle/animals/${A_TEST}`);
    cleanup();
    render(await CattleAnimalPage({ params: Promise.resolve({ tag: animalHref.split("/").pop()! }), searchParams: Promise.resolve({}) }));
    expect(document.querySelector('[data-cattle-mode="REAL"]')).not.toBeNull();
    expect(screen.getByRole("heading", { name: "test" })).toBeInTheDocument();
  });
});

describe("Demo / real isolation", () => {
  it("the demonstration herd keeps its own screen (no continuity objects), and the real screens carry no demo routes", () => {
    render(
      <CattleDemoSessionProvider>
        <HerdScreen initial={demoHerdView(EMPTY_CATTLE_DEMO_SESSION, "STANDARD")} scenario="STANDARD" />
      </CattleDemoSessionProvider>,
    );
    expect(document.querySelector("[data-group-object]")).toBeNull();
    cleanup();
    render(<RealHerdScreen view={realHerdView(evaluated())} />);
    expect(document.querySelectorAll("a[href*='scenario=']").length).toBe(0);
    expect(document.body.textContent).not.toMatch(/SYNTH|Synthetic|demonstration/i);
  });
});
