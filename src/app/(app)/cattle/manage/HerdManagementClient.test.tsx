import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ refresh }) }));

import { FarmProvider, useLivestockGroups } from "@/store/farm-store";
import { HerdManagementClient } from "./HerdManagementClient";
import { tracked, type Farm, type LivestockGroup } from "@/domain/types";

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

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); window.localStorage.clear(); refresh.mockClear(); });

function GroupLabels() {
  const groups = useLivestockGroups();
  return (
    <>
      <output data-testid="store-groups">{groups.map((g) => g.label).join("|")}</output>
      <output data-testid="store-goals">{groups.map((g) => g.goal ?? "-").join("|")}</output>
    </>
  );
}

function renderAddCattle() {
  return render(
    <FarmProvider initialState={{ farm: FARM, fields: [], livestockGroups: [GROUP], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}>
      <HerdManagementClient farmId={FARM.id} />
      <GroupLabels />
    </FarmProvider>,
  );
}

describe("Add cattle (/cattle/manage) — an admin entry point, not a second group screen", () => {
  it("has no Overview / Groups / Housing tabs", () => {
    renderAddCattle();
    expect(screen.getAllByRole("heading", { name: "Add cattle", level: 1 }).length).toBeGreaterThan(0);
    for (const tab of ["Overview", "Groups", "Housing"]) {
      expect(screen.queryByRole("button", { name: tab })).toBeNull();
      expect(screen.queryByRole("link", { name: tab })).toBeNull();
    }
    expect(document.querySelector('a[href="/housing"]')).toBeNull();
  });

  it("does not list existing groups — they are opened from Cattle", () => {
    renderAddCattle();
    const page = document.body.cloneNode(true) as HTMLElement;
    page.querySelectorAll("option, [data-testid='store-groups']").forEach((n) => n.remove()); // the animal form's group picker and the test probe
    expect(page.textContent).not.toContain("Weanlings");
    expect(screen.queryByRole("button", { name: /open group/i })).toBeNull();
    expect(document.querySelector('a[href^="/livestock/"], a[href^="/cattle/groups/"]')).toBeNull();
    expect(screen.getByText(/Existing groups are opened from Cattle/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open herd" }).getAttribute("href")).toBe("/cattle");
  });

  it("the add-group form asks for name, category, count and an optional goal (decide later by default)", async () => {
    renderAddCattle();
    fireEvent.click(screen.getByRole("button", { name: /add new group/i }));
    const form = screen.getByRole("button", { name: /^add group$/i }).closest("form") as HTMLFormElement;
    const view = within(form);
    expect(view.queryByText(/weight/i)).toBeNull();
    expect(view.queryByText(/^system$/i)).toBeNull();
    expect(view.queryByText(/housing/i)).toBeNull();
    expect([...form.querySelectorAll("input, select")].map((el) => el.closest("label")?.querySelector("span")?.textContent)).toEqual(["Group name", "Category", "Count", "Production goal (optional)"]);
    expect(view.getByLabelText("Production goal (optional)")).toHaveProperty("value", "");

    fireEvent.change(view.getByPlaceholderText(/spring calves/i), { target: { value: "Spring calves" } });
    fireEvent.change(view.getByPlaceholderText("e.g. 12"), { target: { value: "12" } });
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByTestId("store-groups").textContent).toBe("Weanlings|Spring calves"));
    expect(screen.getByTestId("store-goals").textContent).toBe("finish_slaughter|-");
    expect(refresh).toHaveBeenCalled();
  });

  it("a goal chosen when adding the group is saved with it", async () => {
    renderAddCattle();
    fireEvent.click(screen.getByRole("button", { name: /add new group/i }));
    const form = screen.getByRole("button", { name: /^add group$/i }).closest("form") as HTMLFormElement;
    const view = within(form);
    fireEvent.change(view.getByPlaceholderText(/spring calves/i), { target: { value: "Bullocks" } });
    fireEvent.change(view.getByPlaceholderText("e.g. 12"), { target: { value: "8" } });
    fireEvent.change(view.getByLabelText("Production goal (optional)"), { target: { value: "sell_store" } });
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByTestId("store-goals").textContent).toBe("finish_slaughter|sell_store"));
  });

  it("adding an individual animal remains available", () => {
    renderAddCattle();
    expect(screen.getByText("Add an animal")).toBeTruthy();
  });

  it("offers no movement, weight, housing or production-goal editing", () => {
    renderAddCattle();
    expect(screen.queryByText(/move group/i)).toBeNull();
    expect(screen.queryByText(/record or review weights/i)).toBeNull();
    expect(screen.queryByText(/set production goal/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /save group details/i })).toBeNull();
  });
});
