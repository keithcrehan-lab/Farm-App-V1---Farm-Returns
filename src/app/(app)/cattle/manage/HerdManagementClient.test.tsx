import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
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
  system: "grazing",
  value: tracked(12000, "estimated", "Farm Return estimate"),
};

afterEach(cleanup);

function renderGroups() {
  return render(
    <FarmProvider initialState={{ farm: FARM, fields: [], livestockGroups: [GROUP], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}>
      <HerdManagementClient farmId={FARM.id} initialTab="Groups" />
    </FarmProvider>,
  );
}

describe("Manage herd groups redesign", () => {
  it("shows a compact group object first and progressively discloses editing", () => {
    renderGroups();

    expect(screen.getByText("Weanlings")).toBeTruthy();
    expect(screen.getByText("Weanling")).toBeTruthy();
    expect(screen.getByText("20", { selector: "strong" })).toBeTruthy();
    expect(screen.queryByText("Group name")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /edit details/i }));

    expect(screen.getByText(/1 · core group record/i)).toBeTruthy();
    expect(screen.getByText(/2 · management/i)).toBeTruthy();
    expect(screen.getByText(/3 · housing & economics/i)).toBeTruthy();

    const details = document.querySelectorAll("details");
    expect(details).toHaveLength(3);
    expect(details[0].hasAttribute("open")).toBe(true);
    expect(details[1].hasAttribute("open")).toBe(false);
    expect(details[2].hasAttribute("open")).toBe(false);
  });

  it("keeps the existing canonical update path when a group is edited", () => {
    renderGroups();
    fireEvent.click(screen.getByRole("button", { name: /edit details/i }));

    const core = document.querySelectorAll("details")[0];
    const view = within(core as HTMLElement);
    fireEvent.change(view.getByLabelText(/headcount/i), { target: { value: "24" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(screen.getByText("24")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save changes/i })).toBeNull();
  });
});
