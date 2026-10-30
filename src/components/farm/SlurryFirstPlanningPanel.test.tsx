import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/fertiliser-plan", () => ({
  previewSlurryFirstFertiliserPlanAction: vi.fn(),
}));

import { previewSlurryFirstFertiliserPlanAction } from "@/app/actions/fertiliser-plan";
import { SlurryFirstPlanningPanel } from "./SlurryFirstPlanningPanel";

const mockPreview = vi.mocked(previewSlurryFirstFertiliserPlanAction);

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
  it("is quiet by default, then exposes an explicit future-production assumption and forecast-volume shortcuts", () => {
    renderPanel();
    const toggle = screen.getByRole("button", { name: /plan slurry before fertiliser/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/use current crop and production settings/i)).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByText(/use current crop and production settings as the future-season starting assumption/i)).toBeTruthy();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /use current unallocated/i }));
    expect((screen.getByLabelText(/expected slurry available/i) as HTMLInputElement).value).toBe("120");
    fireEvent.click(screen.getByRole("button", { name: /assume recorded tanks full/i }));
    expect((screen.getByLabelText(/expected slurry available/i) as HTMLInputElement).value).toBe("500");
  });

  it("submits a forecast allocation with carry-forward basis rather than persisting live slurry", async () => {
    mockPreview.mockResolvedValue({ status: "blocked", reasonCode: "TEST", message: "test" });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /plan slurry before fertiliser/i }));
    fireEvent.change(screen.getByLabelText(/expected slurry available/i), { target: { value: "300" } });
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
