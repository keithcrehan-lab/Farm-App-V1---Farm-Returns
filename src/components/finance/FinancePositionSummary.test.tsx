import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { FinancePositionSummary } from "./FinancePositionSummary";
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
  category: "suckler_cow",
  label: "Suckler cows",
  count: tracked(20, "verified", "Farmer"),
  system: "grazing",
  value: tracked(30000, "estimated", "Farm Return estimate"),
};

afterEach(cleanup);

describe("FinancePositionSummary", () => {
  it("labels livestock value as estimated and reports finance evidence counts without inventing margin", () => {
    render(
      <FarmProvider initialState={{ farm: FARM, fields: [], livestockGroups: [GROUP], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}>
        <FinancePositionSummary assumptionCount={3} quoteCount={2} />
      </FarmProvider>,
    );

    const region = screen.getByRole("region", { name: "Current financial position" });
    const view = within(region);
    expect(view.getByText("Estimated livestock value")).toBeTruthy();
    expect(view.getByText(/20 cattle recorded · Farm Return estimate/i)).toBeTruthy();
    expect(view.getByText(/does not show a farm margin until real revenue and cashflow records exist/i)).toBeTruthy();
    expect(region.textContent).toContain("3");
    expect(region.textContent).toContain("2");
  });
});
