import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/fertiliser-plan", () => ({
  getSlurryStorageForecastAction: vi.fn(),
  previewSlurryFirstFertiliserPlanAction: vi.fn(),
}));

import { getSlurryStorageForecastAction, previewSlurryFirstFertiliserPlanAction } from "@/app/actions/fertiliser-plan";
import { SlurryFirstPlanningPanel } from "./SlurryFirstPlanningPanel";

const mockForecast = vi.mocked(getSlurryStorageForecastAction);
const mockPreview = vi.mocked(previewSlurryFirstFertiliserPlanAction);

beforeEach(() => {
  mockForecast.mockResolvedValue({
    status: "ready",
    forecast: { status: "READY", targetDate: "2027-01-30", stores: [], projectedPhysicalM3: 320, projectedAvailableForNewPlanM3: 300, blockedStoreCount: 0, version: "test" },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPanel() {
  render(
    <SlurryFirstPlanningPanel
      fields={[{ fieldId: "f1", fieldName: "Back Meadow" }]}
      stores={[{ housingId: "h1", shedName: "Main tank", capacityM3: 500 }]}
      currentUnallocatedM3={120}
    />,
  );
}

describe("SlurryFirstPlanningPanel", () => {
  it("is quiet by default, then derives future slurry from livestock and store records while allowing an override", async () => {
    renderPanel();
    const toggle = screen.getByRole("button", { name: /plan slurry before fertiliser/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/use current crop and production settings/i)).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByText(/use current crop and production settings as the future-season starting assumption/i)).toBeTruthy();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);

    await waitFor(() => expect((screen.getByLabelText(/forecast slurry available/i) as HTMLInputElement).value).toBe("300"));
    expect(screen.getByText(/300 m³ forecast available/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /override with current unallocated/i }));
    expect((screen.getByLabelText(/forecast slurry available/i) as HTMLInputElement).value).toBe("120");
  });

  it("submits a forecast allocation with carry-forward basis rather than persisting live slurry", async () => {
    mockPreview.mockResolvedValue({ status: "blocked", reasonCode: "TEST", message: "test" });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /plan slurry before fertiliser/i }));
    fireEvent.change(screen.getByLabelText(/forecast slurry available/i), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: /add field/i }));
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 field"), { target: { value: "f1" } });
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 store"), { target: { value: "h1" } });
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 volume"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 method"), { target: { value: "LESS" } });
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 date"), { target: { value: "2027-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: /preview fertiliser after slurry/i }));

    await waitFor(() => expect(mockPreview).toHaveBeenCalledTimes(1));
    expect(mockPreview).toHaveBeenCalledWith(expect.objectContaining({
      expectedAvailableM3: 300,
      source: "FARMER_FORECAST",
      productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS",
      candidates: [expect.objectContaining({ fieldId: "f1", housingId: "h1", volumeM3: 100, applicationMethod: "LESS", applicationDate: "2027-02-01" })],
    }));
  });
});
