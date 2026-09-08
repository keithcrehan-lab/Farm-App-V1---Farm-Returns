import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/fertiliser-plan", () => ({ getFieldFertiliserStatusAction: vi.fn() }));

import { getFieldFertiliserStatusAction } from "@/app/actions/fertiliser-plan";
import { RemainingFertiliserRequirementCard } from "./RemainingFertiliserRequirementCard";

const mockAction = vi.mocked(getFieldFertiliserStatusAction);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RemainingFertiliserRequirementCard", () => {
  it("renders nothing outside real mode — never fetches a real farm-scoped status without a real farm", () => {
    render(<RemainingFertiliserRequirementCard fieldId="field-1" canRecord={false} />);
    expect(mockAction).not.toHaveBeenCalled();
    expect(screen.queryByText(/remaining requirement/i)).toBeNull();
  });

  it("renders nothing when the real status is genuinely NOT_APPLICABLE", async () => {
    mockAction.mockResolvedValue({ status: "not_applicable" });
    render(<RemainingFertiliserRequirementCard fieldId="field-1" canRecord />);
    await waitFor(() => expect(mockAction).toHaveBeenCalledWith("field-1"));
    expect(screen.queryByText(/remaining requirement/i)).toBeNull();
  });

  it("shows the real, honest reason when the recommendation itself is blocked — never a fabricated remaining figure", async () => {
    mockAction.mockResolvedValue({ status: "blocked", reasonCode: "MISSING_SOIL_FERTILITY_INDEX" });
    render(<RemainingFertiliserRequirementCard fieldId="field-1" canRecord />);
    await waitFor(() => expect(screen.getByText(/remaining requirement/i)).toBeTruthy());
    expect(screen.getByText(/missing soil fertility index/i)).toBeTruthy();
  });

  it("shows the real requirement/applied/remaining figures per nutrient when a real status resolves", async () => {
    mockAction.mockResolvedValue({
      status: "ok",
      requirementKgHa: { n: 35, p: 4, k: 0 },
      confirmedAppliedKgHa: { n: 10, p: 0, k: 0 },
      remainingKgHa: { n: 25, p: 4, k: 0 },
      confirmedApplications: 1,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });
    render(<RemainingFertiliserRequirementCard fieldId="field-1" canRecord />);
    await waitFor(() => expect(screen.getByText(/25(\.0)? kg\/ha still required/)).toBeTruthy());
    expect(screen.getByText(/Nitrogen \(N\)/)).toBeTruthy();
    expect(screen.queryByText(/no confirmed applications yet/i)).toBeNull();
  });

  it("discloses when no confirmed applications exist yet", async () => {
    mockAction.mockResolvedValue({
      status: "ok",
      requirementKgHa: { n: 35, p: 4, k: 0 },
      confirmedAppliedKgHa: { n: 0, p: 0, k: 0 },
      remainingKgHa: { n: 35, p: 4, k: 0 },
      confirmedApplications: 0,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });
    render(<RemainingFertiliserRequirementCard fieldId="field-1" canRecord />);
    await waitFor(() => expect(screen.getByText(/no confirmed applications yet/i)).toBeTruthy());
  });

  it("discloses a confirmed application that could not be included in the nutrient total — never silently drops it", async () => {
    mockAction.mockResolvedValue({
      status: "ok",
      requirementKgHa: { n: 35, p: 4, k: 0 },
      confirmedAppliedKgHa: { n: 0, p: 0, k: 0 },
      remainingKgHa: { n: 35, p: 4, k: 0 },
      confirmedApplications: 1,
      applicationsWithUnknownComposition: 1,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });
    render(<RemainingFertiliserRequirementCard fieldId="field-1" canRecord />);
    await waitFor(() => expect(screen.getByText(/could not be/i)).toBeTruthy());
  });

  it("discloses a confirmed application that covered more than one field and could not be attributed to this one", async () => {
    mockAction.mockResolvedValue({
      status: "ok",
      requirementKgHa: { n: 35, p: 4, k: 0 },
      confirmedAppliedKgHa: { n: 0, p: 0, k: 0 },
      remainingKgHa: { n: 35, p: 4, k: 0 },
      confirmedApplications: 0,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 1,
      truncated: false,
    });
    render(<RemainingFertiliserRequirementCard fieldId="field-1" canRecord />);
    await waitFor(() => expect(screen.getByText(/covered more than/i)).toBeTruthy());
  });

  it("discloses when the real confirmed-session read was truncated", async () => {
    mockAction.mockResolvedValue({
      status: "ok",
      requirementKgHa: { n: 35, p: 4, k: 0 },
      confirmedAppliedKgHa: { n: 0, p: 0, k: 0 },
      remainingKgHa: { n: 35, p: 4, k: 0 },
      confirmedApplications: 0,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: true,
    });
    render(<RemainingFertiliserRequirementCard fieldId="field-1" canRecord />);
    await waitFor(() => expect(screen.getByText(/may be incomplete/i)).toBeTruthy());
  });

  it("shows the real, honest reason when the remaining conversion itself is blocked (e.g. missing field area)", async () => {
    mockAction.mockResolvedValue({
      status: "ok",
      requirementKgHa: { n: 35, p: 4, k: 0 },
      blockedReasonCode: "MISSING_VALID_FIELD_AREA",
      confirmedApplications: 0,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });
    render(<RemainingFertiliserRequirementCard fieldId="field-1" canRecord />);
    await waitFor(() => expect(screen.getByText(/missing valid field area/i)).toBeTruthy());
  });

  it("re-fetches when the field changes", async () => {
    mockAction.mockResolvedValue({ status: "not_applicable" });
    const { rerender } = render(<RemainingFertiliserRequirementCard fieldId="field-1" canRecord />);
    await waitFor(() => expect(mockAction).toHaveBeenCalledWith("field-1"));
    rerender(<RemainingFertiliserRequirementCard fieldId="field-2" canRecord />);
    await waitFor(() => expect(mockAction).toHaveBeenCalledWith("field-2"));
  });
});
