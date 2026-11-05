import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh }) }));

import { FarmProvider } from "@/store/farm-store";
import { HerdManagementClient } from "./HerdManagementClient";
import { tracked, type Farm, type LivestockGroup } from "@/domain/types";
import type { ManageHerdContext, ManageHerdGroupContext } from "@/server/cattle-real/manage-herd-view";

const FARM: Farm = {
  id: "farm-1",
  name: "Test Farm",
  location: { county: "Cork", centroid: [-8.5, 51.9] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Farmer",
};

const GROUP: LivestockGroup = {
  id: "g1",
  farmId: FARM.id,
  category: "weanling",
  label: "Weanlings",
  count: tracked(20, "verified", "Farmer"),
  avgWeightKg: tracked(310, "farmer_adjusted", "Farmer"),
  system: "housed",
  housingId: "h1",
  goal: "finish_slaughter",
  value: tracked(12000, "estimated", "Farm Return estimate"),
};

const headcountOnly: ManageHerdGroupContext = {
  groupId: "g1",
  individuals: 0,
  headcountNote: null,
  currentField: { state: "NOT_RECORDED", detail: "No current field movement is recorded for this group." },
  latestIndividualWeight: { state: "NOT_RECORDED", detail: "No individual animals are recorded in this group." },
  production: { target: { state: "NOT_RECORDED", detail: "Set a target weight and date in the group's production plan." }, requiredAdg: { state: "NOT_RECORDED", detail: "x" }, hasTarget: false },
};

const withAnimals: ManageHerdGroupContext = {
  groupId: "g1",
  individuals: 3,
  headcountNote: "The group record holds 20 head, but 3 animals are recorded individually. Neither figure is changed here.",
  currentField: { state: "KNOWN", value: "Long Acre", detail: "Since 1 Oct 2026 · from the latest field movement" },
  latestIndividualWeight: { state: "KNOWN", value: "480 kg", detail: "Latest individual weight · 20 Oct 2026" },
  production: {
    target: { state: "KNOWN", value: "650 kg by 5 Mar 2027", detail: "From the group's production plan." },
    requiredAdg: { state: "KNOWN", value: "1.67 kg/day", detail: "From the production plan's target and the group's current weight." },
    hasTarget: true,
  },
};

const ctx = (g: ManageHerdGroupContext): ManageHerdContext => ({ state: "OK", groups: { g1: g } });

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); window.localStorage.clear(); refresh.mockClear(); });

function renderManage(context?: ManageHerdContext, initialTab: "Groups" | "Overview" = "Groups") {
  return render(
    <FarmProvider
      initialState={{
        farm: FARM,
        fields: [],
        livestockGroups: [GROUP],
        housing: [{ id: "h1", farmId: FARM.id, shedName: "Slatted shed", shedType: "slatted", housingPeriod: { start: "11-01", end: "03-31" }, storageCapacityM3: 100, storageFill: tracked(40, "estimated", "x"), linkedGroupIds: ["g1"] } as never],
        slurryAllocations: [],
        slurryCompositionRecords: [],
      }}
    >
      <HerdManagementClient farmId={FARM.id} initialTab={initialTab} context={context} />
    </FarmProvider>,
  );
}

const openGroup = () => fireEvent.click(screen.getByRole("button", { name: /open group/i }));
const section = (name: string) => within(screen.getByRole("region", { name }));

describe("Manage herd — object-first groups, no double entry", () => {
  it("opens a group to Group details, Current state and Production", () => {
    renderManage(ctx(headcountOnly));
    expect(screen.getByText("Weanlings")).toBeTruthy();
    expect(screen.queryByText("Group name")).toBeNull();
    openGroup();
    expect(screen.getByRole("region", { name: "Group details" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Current state" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Production" })).toBeTruthy();
    expect(document.querySelectorAll("details")).toHaveLength(0);
  });

  it("no longer edits average weight, system, housing link or finishing goal", () => {
    renderManage(ctx(headcountOnly));
    openGroup();
    expect(screen.queryByLabelText(/average weight/i)).toBeNull();
    expect(screen.queryByLabelText(/current system/i)).toBeNull();
    expect(screen.queryByLabelText(/housing link/i)).toBeNull();
    expect(screen.queryByLabelText(/finishing goal/i)).toBeNull();
    // The only form controls are the group-owned facts.
    expect(document.querySelectorAll("select")).toHaveLength(0);
    expect([...document.querySelectorAll("input")].map((i) => i.closest("label")?.querySelector("span")?.textContent)).toEqual(["Group name", "Breed", "Headcount"]);
  });

  it("a headcount-only group still edits its count through the canonical update path", () => {
    renderManage(ctx(headcountOnly));
    openGroup();
    const details = section("Group details");
    fireEvent.change(details.getByLabelText(/headcount/i), { target: { value: "24" } });
    fireEvent.change(details.getByLabelText(/group name/i), { target: { value: "Weanling heifers" } });
    fireEvent.change(details.getByLabelText(/breed/i), { target: { value: "Angus" } });
    fireEvent.click(screen.getByRole("button", { name: /save group details/i }));

    expect(screen.getByText("Weanling heifers")).toBeTruthy();
    expect(screen.getByText("24", { selector: "strong" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save group details/i })).toBeNull();
    openGroup();
    expect((section("Group details").getByLabelText(/breed/i) as HTMLInputElement).value).toBe("Angus");
  });

  it("a group with individual animals shows the derived count, no editable headcount, and the discrepancy", () => {
    renderManage(ctx(withAnimals));
    expect(screen.getByText("3", { selector: "strong" })).toBeTruthy();
    openGroup();
    const details = section("Group details");
    expect(details.queryByLabelText(/headcount/i)).toBeNull();
    expect(details.getByText("3 animals recorded")).toBeTruthy();
    expect(details.getByText(/headcount comes from the animals recorded in this group/i)).toBeTruthy();
    expect(details.getByText(/group record holds 20 head, but 3 animals are recorded individually/i)).toBeTruthy();

    // Saving group details never sends a count.
    fireEvent.change(details.getByLabelText(/group name/i), { target: { value: "Weanlings A" } });
    fireEvent.click(screen.getByRole("button", { name: /save group details/i }));
    expect(screen.getByText("Weanlings A")).toBeTruthy();
    expect(screen.getByText("3", { selector: "strong" })).toBeTruthy();
  });

  it("current field comes from the grazing session; actions point to the existing workflows", () => {
    renderManage(ctx(withAnimals));
    openGroup();
    const state = section("Current state");
    expect(state.getByText("Long Acre")).toBeTruthy();
    expect(state.getByText(/since 1 oct 2026 · from the latest field movement/i)).toBeTruthy();
    // An open movement replaces the older group-record system as the current state.
    expect(document.querySelector('[data-manage-fact="legacy-system"]')).toBeNull();
    expect(state.getByRole("link", { name: /move group/i })).toHaveProperty("pathname", "/cattle/groups/g1");
    expect(state.getByRole("link", { name: /record or review weights/i })).toHaveProperty("pathname", "/cattle/groups/g1");
    expect(state.getByRole("link", { name: /^housing/i })).toHaveProperty("pathname", "/housing");
    // Weight is read-only: the recorded group figure, labelled as such, and the latest individual weighing.
    expect(state.getByText("310 kg")).toBeTruthy();
    expect(state.getByText(/recorded group average .* not a weighing/i)).toBeTruthy();
    expect(state.getByText("480 kg")).toBeTruthy();
  });

  it("production target comes from the production plan and its CTA opens the group workspace", () => {
    renderManage(ctx(withAnimals));
    openGroup();
    const production = section("Production");
    expect(production.getByText("650 kg by 5 Mar 2027")).toBeTruthy();
    expect(production.getByText("1.67 kg/day")).toBeTruthy();
    expect(production.getByRole("link", { name: /view feeding plan/i })).toHaveProperty("pathname", "/cattle/groups/g1");
    // The older group goal is context only.
    expect(production.getByText("Finish to slaughter")).toBeTruthy();
    expect(production.getByText(/from the older group record/i)).toBeTruthy();
  });

  it("missing operational data says not recorded / unavailable, never a made-up value", () => {
    renderManage(ctx(headcountOnly));
    openGroup();
    const state = section("Current state");
    expect(state.getByText("Not recorded")).toBeTruthy();
    expect(state.getByText(/no current field movement is recorded/i)).toBeTruthy();
    expect(state.getByText("Housed · Slatted shed")).toBeTruthy();
    expect(state.getByText(/not a recorded move/i)).toBeTruthy();
    const production = section("Production");
    expect(production.getByText("No target set")).toBeTruthy();
    expect(production.getByRole("link", { name: /set production goal/i })).toHaveProperty("pathname", "/cattle/groups/g1");
    cleanup();

    // No context at all (the loader failed): unavailable, and the headcount isn't editable.
    renderManage(undefined);
    expect(screen.getByText(/some linked records couldn.t be read/i)).toBeTruthy();
    openGroup();
    expect(section("Group details").queryByLabelText(/headcount/i)).toBeNull();
    expect(section("Group details").getByText(/couldn.t be checked/i)).toBeTruthy();
    expect(section("Current state").getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(section("Production").getByText("Unavailable")).toBeTruthy();
  });

  it("requires explicit confirmation before permanently deleting a group", () => {
    renderManage(ctx(headcountOnly));
    openGroup();
    fireEvent.click(screen.getByRole("button", { name: /^delete group$/i }));

    expect(screen.getByText(/delete weanlings\?/i)).toBeTruthy();
    expect(screen.getByText(/individual animals linked to this group are not deleted/i)).toBeTruthy();
    expect(screen.getByText(/deletes the field movements recorded for it/i)).toBeTruthy();
    expect(screen.getByText(/fall back to the farm-level stocking rate in the fertiliser plan/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /keep group/i }));
    expect(screen.getByText("Weanlings")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^delete group$/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete group permanently/i }));
    expect(screen.queryByText("Weanlings")).toBeNull();
    expect(screen.getByText(/no livestock groups yet/i)).toBeTruthy();
  });

  it("the add-group form asks only for name, category and count", async () => {
    renderManage(ctx(headcountOnly), "Overview");
    fireEvent.click(screen.getByRole("button", { name: /add new group/i }));
    const form = screen.getByRole("button", { name: /^add group$/i }).closest("form") as HTMLFormElement;
    const view = within(form);
    expect(view.queryByText(/avg weight/i)).toBeNull();
    expect(view.queryByText(/^system$/i)).toBeNull();
    expect(view.queryByText(/housing/i)).toBeNull();
    expect([...form.querySelectorAll("input, select")].map((el) => el.closest("label")?.querySelector("span")?.textContent)).toEqual(["Group name", "Category", "Count"]);

    fireEvent.change(view.getByPlaceholderText(/spring calves/i), { target: { value: "Spring calves" } });
    fireEvent.change(view.getByPlaceholderText("e.g. 12"), { target: { value: "12" } });
    fireEvent.submit(form);
    await screen.findByText("Spring calves");
    expect(refresh).toHaveBeenCalled();
  });

  it("the page copy no longer claims to manage housing links", () => {
    renderManage(ctx(headcountOnly));
    expect(screen.queryByText(/housing links/i)).toBeNull();
  });
});
