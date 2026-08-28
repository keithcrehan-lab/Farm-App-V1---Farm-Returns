import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OnboardingWizard } from "./OnboardingWizard";
import type { Farm } from "@/domain/types";

/**
 * Real Mode Completion Phase 3 — "Add automated tests covering the Back
 * workflow and rehydration."
 *
 * The bug this covers: the previous wizard's Farm step always called a
 * `create` action, so revisiting it via Back and submitting again created
 * a second `farms` row. The fix is which Server Action gets called, not a
 * UI-only disable — these tests assert that behaviour directly, not just
 * that the screen looks right.
 */
vi.mock("@/app/actions/onboarding", () => ({
  createFarmStep: vi.fn(),
  updateFarmStep: vi.fn(),
  addLivestockStep: vi.fn(),
  finishOnboarding: vi.fn(),
}));

import { addLivestockStep, createFarmStep, finishOnboarding, updateFarmStep } from "@/app/actions/onboarding";

const mockCreateFarmStep = vi.mocked(createFarmStep);
const mockUpdateFarmStep = vi.mocked(updateFarmStep);
const mockAddLivestockStep = vi.mocked(addLivestockStep);
const mockFinishOnboarding = vi.mocked(finishOnboarding);

const FARM: Farm = {
  id: "farm-1",
  name: "Ballybeg Farm",
  location: { county: "Cork", centroid: [-8.49, 51.9] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Keith Crehan",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OnboardingWizard — rehydration (page reload / leave / return / sign-out-sign-in)", () => {
  it("resumes at the Livestock step when a farm already exists, instead of restarting from Farm", () => {
    render(<OnboardingWizard suggestedOwnerName="" resumeFarm={FARM} resumeLivestockGroups={[]} />);

    expect(screen.getByText(/your livestock, broadly/i)).toBeTruthy();
    expect(screen.queryByText(/let's set up your farm/i)).toBeNull();
  });

  it("shows already-added livestock groups on resume, not re-asking for them", () => {
    render(
      <OnboardingWizard
        suggestedOwnerName=""
        resumeFarm={FARM}
        resumeLivestockGroups={[
          {
            id: "lg-1",
            farmId: FARM.id,
            category: "suckler_cow",
            label: "Suckler cows",
            count: { value: 20, status: "verified", source: "Keith Crehan" },
            system: "grazing",
            value: { value: 0, status: "estimated", source: "Farm Return assumption" },
          },
        ]}
      />,
    );

    expect(screen.getByText("Suckler cows")).toBeTruthy();
    expect(screen.getByText("20 head")).toBeTruthy();
  });
});

describe("OnboardingWizard — Back-button safety (no duplicate farm creation)", () => {
  it("calls createFarmStep exactly once, then updateFarmStep (never createFarmStep again) on a revisit via Back", async () => {
    mockCreateFarmStep.mockResolvedValue({ farm: FARM });
    mockUpdateFarmStep.mockResolvedValue({ farm: { ...FARM, name: "Ballybeg Farm (updated)" } });

    render(<OnboardingWizard suggestedOwnerName="Keith Crehan" resumeFarm={null} resumeLivestockGroups={[]} />);

    // Step 1: create the farm for real.
    fireEvent.change(screen.getByPlaceholderText(/ballybeg farm/i), { target: { value: "Ballybeg Farm" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByText(/your livestock, broadly/i)).toBeTruthy());
    expect(mockCreateFarmStep).toHaveBeenCalledTimes(1);
    expect(mockUpdateFarmStep).not.toHaveBeenCalled();

    // Step 2: go Back to the Farm step — this used to be exactly where the
    // duplicate-farm bug fired, on the next submit.
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    await waitFor(() => expect(screen.getByText(/let's set up your farm/i)).toBeTruthy());

    // The farm's real name should already be prefilled — real rehydration,
    // not a blank form the farmer has to refill.
    expect((screen.getByPlaceholderText(/ballybeg farm/i) as HTMLInputElement).value).toBe("Ballybeg Farm");

    // Step 3: submit again from the revisited Farm step.
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(mockUpdateFarmStep).toHaveBeenCalledTimes(1));

    // The critical assertion: still exactly one create, ever.
    expect(mockCreateFarmStep).toHaveBeenCalledTimes(1);
    expect(mockUpdateFarmStep).toHaveBeenCalledWith(FARM.id, expect.objectContaining({ name: "Ballybeg Farm" }));
  });
});

describe("OnboardingWizard — save states are real, not decorative", () => {
  it("shows 'Failed to save' and stays on the Farm step when the write actually fails", async () => {
    mockCreateFarmStep.mockResolvedValue({ error: "Network error — please try again." });

    render(<OnboardingWizard suggestedOwnerName="Keith Crehan" resumeFarm={null} resumeLivestockGroups={[]} />);
    fireEvent.change(screen.getByPlaceholderText(/ballybeg farm/i), { target: { value: "Ballybeg Farm" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(screen.getByText(/failed to save/i)).toBeTruthy());
    expect(screen.getByText("Network error — please try again.")).toBeTruthy();
    // Must not have silently advanced to Livestock while the UI looked fine.
    expect(screen.queryByText(/your livestock, broadly/i)).toBeNull();
  });

  it("shows 'Saved' after a real successful livestock-group write", async () => {
    mockAddLivestockStep.mockResolvedValue({
      group: {
        id: "lg-1",
        farmId: FARM.id,
        category: "suckler_cow",
        label: "Suckler cows",
        count: { value: 20, status: "verified", source: "Keith Crehan" },
        system: "grazing",
        value: { value: 0, status: "estimated", source: "Farm Return assumption" },
      },
    });

    render(<OnboardingWizard suggestedOwnerName="" resumeFarm={FARM} resumeLivestockGroups={[]} />);
    fireEvent.change(screen.getByPlaceholderText(/suckler cows/i), { target: { value: "Suckler cows" } });
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /add group/i }));

    await waitFor(() => expect(screen.getByText(/^saved$/i)).toBeTruthy());
    expect(mockAddLivestockStep).toHaveBeenCalledTimes(1);
  });

  it("finishing calls finishOnboarding with the real farm id", async () => {
    mockFinishOnboarding.mockResolvedValue(undefined as never);

    render(<OnboardingWizard suggestedOwnerName="" resumeFarm={FARM} resumeLivestockGroups={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /enter farm return/i }));

    await waitFor(() => expect(mockFinishOnboarding).toHaveBeenCalledWith(FARM.id));
  });
});
