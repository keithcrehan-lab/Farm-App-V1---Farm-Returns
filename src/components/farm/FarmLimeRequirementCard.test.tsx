import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/app/actions/fertiliser-plan", () => ({ getFarmLimeRequirementAction: vi.fn() }));

import { getFarmLimeRequirementAction } from "@/app/actions/fertiliser-plan";
import { FarmLimeRequirementCard } from "./FarmLimeRequirementCard";

const mockAction = vi.mocked(getFarmLimeRequirementAction);

function result(overrides: Partial<Awaited<ReturnType<typeof getFarmLimeRequirementAction>>> = {}) {
  return {
    fields: [],
    farmTotalTonnes: 0,
    fieldsWithoutLimeEvidence: 0,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FarmLimeRequirementCard", () => {
  it("renders nothing outside real mode — never fetches a real farm-scoped total without a real farm", () => {
    render(<FarmLimeRequirementCard canRecord={false} />);
    expect(mockAction).not.toHaveBeenCalled();
    expect(screen.queryByText(/farm lime requirement/i)).toBeNull();
  });

  it("shows the real per-field rate and the real farm total when real lime evidence exists", async () => {
    mockAction.mockResolvedValue(
      result({
        fields: [{ fieldId: "field-1", fieldName: "Back Meadow", rateTHa: 2.5, fieldTonnes: 12.5, areaHa: 5 }],
        farmTotalTonnes: 12.5,
      }),
    );
    render(<FarmLimeRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText(/farm lime requirement/i)).toBeTruthy());
    // Codex audit round 1 MEDIUM — a farmer with more than one field on
    // the list needs a real name to tell rows apart.
    expect(screen.getByText("Back Meadow")).toBeTruthy();
    expect(screen.getByText("2.5 t/ha")).toBeTruthy();
    expect(screen.getByText(/farm total/i)).toBeTruthy();
    expect(screen.getAllByText("12.5 t").length).toBeGreaterThan(0);
  });

  it("never labels a partial total as complete — discloses fields with no real lime evidence", async () => {
    mockAction.mockResolvedValue(
      result({
        fields: [{ fieldId: "field-1", fieldName: "Hill Field", rateTHa: 1, fieldTonnes: 4, areaHa: 4 }],
        farmTotalTonnes: 4,
        fieldsWithoutLimeEvidence: 2,
      }),
    );
    render(<FarmLimeRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText(/real but partial/i)).toBeTruthy());
  });

  it("shows an honest 'no real laboratory lime figures' message rather than a fabricated zero when no field has any lime evidence", async () => {
    mockAction.mockResolvedValue(result({ fieldsWithoutLimeEvidence: 3 }));
    render(<FarmLimeRequirementCard canRecord />);
    await waitFor(() => expect(screen.getByText(/no real laboratory lime figures on file yet/i)).toBeTruthy());
  });

  it("shows an honest 'couldn't check' disclosure on a genuine fetch failure — never silently renders nothing", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAction.mockRejectedValueOnce(new Error("network error"));
    render(<FarmLimeRequirementCard canRecord />);
    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
    expect(screen.getByRole("heading", { name: /farm lime requirement/i })).toBeTruthy();
    expect(screen.getByText(/couldn't check your farm-wide lime requirement/i)).toBeTruthy();
    consoleErrorSpy.mockRestore();
  });
});
