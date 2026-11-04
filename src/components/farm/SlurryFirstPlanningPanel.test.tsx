import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/fertiliser-plan", () => ({
  getSlurryStorageForecastAction: vi.fn(),
  previewSlurryFirstFertiliserPlanAction: vi.fn(),
  getAutomaticSlurryPlanAction: vi.fn(),
  getAdoptedSlurryForecastAction: vi.fn(),
  adoptSlurryForecastScenarioAction: vi.fn(),
  withdrawSlurryForecastAdoptionAction: vi.fn(),
}));

import {
  adoptSlurryForecastScenarioAction,
  getAdoptedSlurryForecastAction,
  getSlurryStorageForecastAction,
  previewSlurryFirstFertiliserPlanAction,
  withdrawSlurryForecastAdoptionAction,
} from "@/app/actions/fertiliser-plan";
import { SlurryFirstPlanningPanel } from "./SlurryFirstPlanningPanel";

const mockForecast = vi.mocked(getSlurryStorageForecastAction);
const mockPreview = vi.mocked(previewSlurryFirstFertiliserPlanAction);

beforeEach(() => {
  vi.mocked(getAdoptedSlurryForecastAction).mockResolvedValue(null);
  mockForecast.mockResolvedValue({
    status: "ready",
    forecast: { status: "READY", targetDate: "2027-01-30", stores: [], projectedPhysicalM3: 320, projectedAvailableForNewPlanM3: 300, blockedStoreCount: 0, version: "test" },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPanel(planningSeason = "2027") {
  render(
    <SlurryFirstPlanningPanel
      planningSeason={planningSeason}
      fields={[{ fieldId: "f1", fieldName: "Back Meadow" }]}
      stores={[{ housingId: "h1", shedName: "Main tank", capacityM3: 500 }]}
      currentUnallocatedM3={120}
    />,
  );
}

describe("SlurryFirstPlanningPanel", () => {
  it("is quiet by default, then derives future slurry from livestock and store records while allowing an override", async () => {
    renderPanel();
    const toggle = screen.getByRole("button", { name: /plan 2027 slurry before fertiliser/i });
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
    fireEvent.click(screen.getByRole("button", { name: /plan 2027 slurry before fertiliser/i }));
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

  it("never shows a blocked preview as zero fertiliser need", async () => {
    const unresolvedDemand = {
      demand: [],
      purchaseRequirementTonnes: [],
      truncated: false,
      applicationsWithUnknownComposition: 0,
      fieldsWithBlockedEvidence: 1,
      aggregation: { status: "INCOMPLETE", counts: { unresolved: 1 } },
      basket: {},
    };
    mockPreview.mockResolvedValue({
      status: "ready",
      scenario: {
        planningDate: "2027-01-30",
        expectedAvailableM3: 300,
        allocatedM3: 0,
        unallocatedM3: 300,
        source: "FARMER_FORECAST",
        productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS",
      },
      allocations: [],
      baseline: unresolvedDemand,
      withPlannedSlurry: unresolvedDemand,
      automaticOptimisation: { status: "BLOCKED", reasonCode: "X", message: "x" },
    } as never);
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /plan 2027 slurry before fertiliser/i }));
    fireEvent.change(screen.getByLabelText(/forecast slurry available/i), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: /preview fertiliser after slurry/i }));

    expect((await screen.findAllByText(/Requirement not available yet — 1 field still needs evidence/)).length).toBe(2);
    expect(screen.queryByText(/No chemical fertiliser remaining/)).toBeNull();
  });

  it("plans slurry per field for the target season: dates bounded to it, and a preview listing each field's allocation", async () => {
    mockPreview.mockResolvedValue({
      status: "ready",
      scenario: { planningDate: "2027-01-30", expectedAvailableM3: 300, allocatedM3: 100, unallocatedM3: 200, source: "FARMER_FORECAST", productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS" },
      allocations: [{ fieldId: "f1", fieldName: "Back Meadow", housingId: "h1", storeName: "Main tank", volumeM3: 100, applicationDate: "2027-02-01", applicationMethod: "LESS" }],
      baseline: { purchaseRequirementTonnes: [], aggregation: { counts: { unresolved: 0 } } },
      withPlannedSlurry: { purchaseRequirementTonnes: [], aggregation: { counts: { unresolved: 0 } } },
      automaticOptimisation: { status: "BLOCKED", reasonCode: "X", message: "x" },
    } as never);
    renderPanel("2027");
    fireEvent.click(screen.getByRole("button", { name: /plan 2027 slurry before fertiliser/i }));
    expect(screen.getByText(/Field slurry proposals · 2027/)).toBeTruthy();
    const planningDate = screen.getByLabelText(/planning date/i) as HTMLInputElement;
    expect(planningDate.value).toBe("2027-01-30");
    expect(planningDate.min).toBe("2027-01-01");
    expect(planningDate.max).toBe("2027-12-31");

    fireEvent.click(screen.getByRole("button", { name: /add field/i }));
    const date = screen.getByLabelText("Slurry proposal 1 date") as HTMLInputElement;
    expect(date.min).toBe("2027-01-01");
    expect(date.max).toBe("2027-12-31");
    fireEvent.change(screen.getByLabelText(/forecast slurry available/i), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 field"), { target: { value: "f1" } });
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 store"), { target: { value: "h1" } });
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 volume"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 method"), { target: { value: "LESS" } });
    fireEvent.change(date, { target: { value: "2027-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: /preview fertiliser after slurry/i }));

    const list = await screen.findByLabelText("2027 slurry by field");
    expect(list.textContent).toContain("Back Meadow");
    expect(list.textContent).toContain("100 m³ from Main tank · LESS · 2027-02-01");
  });

  it("refuses a planning date outside the planning season instead of quietly planning another season", async () => {
    renderPanel("2027");
    fireEvent.click(screen.getByRole("button", { name: /plan 2027 slurry before fertiliser/i }));
    fireEvent.change(screen.getByLabelText(/planning date/i), { target: { value: "2026-11-30" } });
    fireEvent.click(screen.getByRole("button", { name: /preview fertiliser after slurry/i }));
    expect(await screen.findByText(/Choose a planning date in the season being planned/)).toBeTruthy();
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("offers the carry-forward assumption only for a future season", () => {
    renderPanel(String(new Date().getUTCFullYear()));
    fireEvent.click(screen.getByRole("button", { name: /slurry before fertiliser/i }));
    expect(screen.queryByText(/use current crop and production settings/i)).toBeNull();
  });

  it("F010: adopts exactly the previewed future-season scenario for quotes, and can stop using it", async () => {
    const readyPreview = {
      status: "ready",
      scenario: { planningDate: "2027-01-30", expectedAvailableM3: 300, allocatedM3: 100, unallocatedM3: 200, source: "FARMER_FORECAST", productionBasis: "CARRY_FORWARD_CURRENT_SETTINGS" },
      assessment: { asOf: "2026-11-03T00:00:00.000Z", planningSeason: "2027" },
      allocations: [{ fieldId: "f1", fieldName: "Back Meadow", housingId: "h1", storeName: "Main tank", volumeM3: 100, applicationDate: "2027-02-01", applicationMethod: "LESS" }],
      baseline: { purchaseRequirementTonnes: [], aggregation: { counts: { unresolved: 0 } } },
      withPlannedSlurry: { purchaseRequirementTonnes: [], aggregation: { counts: { unresolved: 0 } } },
      automaticOptimisation: { status: "BLOCKED", reasonCode: "X", message: "x" },
    };
    mockPreview.mockResolvedValue(readyPreview as never);
    const adoption = {
      adoptionId: "adopt-1",
      planningSeason: "2027",
      planningDate: "2027-01-30",
      forecastSource: "FARMER_FORECAST" as const,
      expectedAvailableM3: 300,
      adoptedAt: "2026-11-03T10:00:00.000Z",
      intents: [{ fieldId: "f1", fieldName: "Back Meadow", housingId: "h1", volumeM3: 100, applicationMethod: "LESS", applicationDate: "2027-02-01", countsInPlan: true }],
    };
    vi.mocked(adoptSlurryForecastScenarioAction).mockResolvedValue({ status: "adopted", adoption });
    vi.mocked(withdrawSlurryForecastAdoptionAction).mockResolvedValue(undefined);
    const onAdoptionChange = vi.fn();
    render(
      <SlurryFirstPlanningPanel
        planningSeason="2027"
        fields={[{ fieldId: "f1", fieldName: "Back Meadow" }]}
        stores={[{ housingId: "h1", shedName: "Main tank", capacityM3: 500 }]}
        currentUnallocatedM3={120}
        onAdoptionChange={onAdoptionChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /plan 2027 slurry before fertiliser/i }));
    // Nothing to adopt before a successful preview.
    expect(screen.queryByRole("button", { name: /use for 2027 quotes/i })).toBeNull();
    fireEvent.change(screen.getByLabelText(/forecast slurry available/i), { target: { value: "300" } });
    fireEvent.click(screen.getByRole("button", { name: /add field/i }));
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 field"), { target: { value: "f1" } });
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 store"), { target: { value: "h1" } });
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 volume"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 method"), { target: { value: "LESS" } });
    fireEvent.change(screen.getByLabelText("Slurry proposal 1 date"), { target: { value: "2027-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: /preview fertiliser after slurry/i }));

    const adoptButton = await screen.findByRole("button", { name: /use for 2027 quotes/i }, { timeout: 5000 });
    await act(async () => {
      fireEvent.click(adoptButton);
      await Promise.resolve();
    });
    await waitFor(() => expect(adoptSlurryForecastScenarioAction).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(vi.mocked(adoptSlurryForecastScenarioAction).mock.calls[0][0]).toEqual(mockPreview.mock.calls[0][0]);
    const status = await screen.findByLabelText("Adopted 2027 slurry forecast", {}, { timeout: 5000 });
    expect(status.textContent).toMatch(/Used for 2027 quotes/);
    expect(status.textContent).toMatch(/Tank levels and live slurry plans are unchanged/);
    expect(onAdoptionChange).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /stop using/i }));
    await waitFor(() => expect(withdrawSlurryForecastAdoptionAction).toHaveBeenCalledWith("2027"), { timeout: 5000 });
    await waitFor(() => expect(screen.queryByLabelText("Adopted 2027 slurry forecast")).toBeNull(), { timeout: 5000 });
    expect(onAdoptionChange).toHaveBeenCalledTimes(2);
  }, 20000);
});
