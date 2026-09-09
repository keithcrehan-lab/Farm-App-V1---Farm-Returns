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

  // Codex audit HIGH (round 15): switching fields used to leave the
  // PREVIOUS field's real figures rendered under the new field's
  // heading until the new fetch resolved (or forever, on a rejection).
  it("clears the previous field's figures immediately on a field change, never showing them under the new field", async () => {
    mockAction.mockResolvedValueOnce({
      status: "ok",
      requirementKgHa: { n: 35, p: 4, k: 0 },
      confirmedAppliedKgHa: { n: 10, p: 0, k: 0 },
      remainingKgHa: { n: 25, p: 4, k: 0 },
      confirmedApplications: 1,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });
    const { rerender } = render(<RemainingFertiliserRequirementCard fieldId="field-1" canRecord />);
    await waitFor(() => expect(screen.getByText(/25(\.0)? kg\/ha still required/)).toBeTruthy());

    // Field B's own lookup never resolves within this test — proves the
    // reset happens synchronously on the field change itself, not only
    // once B's real figures arrive.
    let resolveFieldB: (value: Awaited<ReturnType<typeof getFieldFertiliserStatusAction>>) => void = () => {};
    mockAction.mockReturnValueOnce(new Promise((resolve) => (resolveFieldB = resolve)));
    rerender(<RemainingFertiliserRequirementCard fieldId="field-2" canRecord />);
    await waitFor(() => expect(mockAction).toHaveBeenCalledWith("field-2"));
    expect(screen.queryByText(/still required/)).toBeNull();
    expect(screen.queryByText(/remaining requirement/i)).toBeNull();

    resolveFieldB({
      status: "ok",
      requirementKgHa: { n: 50, p: 0, k: 0 },
      confirmedAppliedKgHa: { n: 0, p: 0, k: 0 },
      remainingKgHa: { n: 50, p: 0, k: 0 },
      confirmedApplications: 0,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });
    await waitFor(() => expect(screen.getByText(/50(\.0)? kg\/ha still required/)).toBeTruthy());
  });

  it("clears a stale figure rather than leaving it forever when the new field's lookup rejects", async () => {
    mockAction.mockResolvedValueOnce({
      status: "ok",
      requirementKgHa: { n: 35, p: 4, k: 0 },
      confirmedAppliedKgHa: { n: 10, p: 0, k: 0 },
      remainingKgHa: { n: 25, p: 4, k: 0 },
      confirmedApplications: 1,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });
    const { rerender } = render(<RemainingFertiliserRequirementCard fieldId="field-1" canRecord />);
    await waitFor(() => expect(screen.getByText(/25(\.0)? kg\/ha still required/)).toBeTruthy());

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAction.mockRejectedValueOnce(new Error("network error"));
    rerender(<RemainingFertiliserRequirementCard fieldId="field-2" canRecord />);
    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
    expect(screen.queryByText(/still required/)).toBeNull();
    consoleErrorSpy.mockRestore();
  });
});
