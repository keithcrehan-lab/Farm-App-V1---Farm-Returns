import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { mockFields } from "@/data/mock-farm";
import { FieldProductionCycleCard } from "./FieldProductionCycleCard";
import { loadFieldProductionCycleAction, saveFieldProductionCycleAction } from "@/app/actions/fertiliser-field-evidence";

vi.mock("@/app/actions/fertiliser-field-evidence", () => ({
  loadFieldProductionCycleAction: vi.fn().mockResolvedValue({ cycle: null, gate: null }),
  saveFieldProductionCycleAction: vi.fn(),
}));

const field = mockFields[0];

function renderCard() {
  return render(
    <FarmProvider>
      <FieldProductionCycleCard field={field} />
    </FarmProvider>,
  );
}

function openCard() {
  fireEvent.click(screen.getByRole("button", { name: /crop & production/i }));
}

function readySaveResult() {
  return {
    cycle: {
      id: "cycle-1",
      fieldId: field.id,
      season: String(new Date().getFullYear()),
      cropSystem: "GRASS_GRAZING",
      status: "active",
      evidence: {
        cropSystem: { value: "GRASS_GRAZING", method: "FARMER_DECLARED", source: "Farmer", observedAt: "2026-10-30T00:00:00.000Z" },
        grazingProductionSystem: { value: "SUCKLER_CALF_TO_BEEF", method: "FARMER_DECLARED", source: "Farmer", observedAt: "2026-10-30T00:00:00.000Z" },
      },
      createdAt: "2026-10-30T00:00:00.000Z",
      updatedAt: "2026-10-30T00:00:00.000Z",
    },
    gate: { status: "READY_FOR_CALCULATION", missingInputs: [] },
  } as any;
}

afterEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
  cleanup();
  vi.clearAllMocks();
  vi.mocked(loadFieldProductionCycleAction).mockResolvedValue({ cycle: null, gate: null } as any);
});

describe("FieldProductionCycleCard — streamlined chemical-fertiliser evidence", () => {
  it("opens, scrolls to and focuses grazing production system when deep-linked from quote readiness", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    window.history.replaceState(null, "", `${window.location.pathname}#grazing-production-system`);

    renderCard();

    const select = await screen.findByLabelText("Confirm or change system");
    await waitFor(() => expect(screen.getByRole("button", { name: /crop & production/i }).getAttribute("aria-expanded")).toBe("true"));
    await waitFor(() => expect(document.activeElement).toBe(select));
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("asks one farmer-facing question first and only shows N/P/K boxes after Yes", async () => {
    renderCard();
    openCard();
    await waitFor(() => expect(loadFieldProductionCycleAction).toHaveBeenCalled());

    expect(screen.queryByLabelText("Chemical N applied")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(screen.getByLabelText("Chemical N applied")).toBeTruthy();
    expect(screen.getByLabelText("Chemical P applied")).toBeTruthy();
    expect(screen.getByLabelText("Chemical K applied")).toBeTruthy();
  });

  it("No is an explicit declaration of zero for N, P and K", async () => {
    vi.mocked(saveFieldProductionCycleAction).mockResolvedValue(readySaveResult());
    renderCard();
    openCard();
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: /save production evidence/i }));

    await waitFor(() => expect(saveFieldProductionCycleAction).toHaveBeenCalled());
    expect(vi.mocked(saveFieldProductionCycleAction).mock.calls[0][0]).toMatchObject({
      chemicalNAppliedKgHa: 0,
      chemicalPAppliedKgHa: 0,
      chemicalKAppliedKgHa: 0,
    });
  });

  it("Not sure keeps chemical nutrient evidence unknown rather than silently saving zero", async () => {
    vi.mocked(saveFieldProductionCycleAction).mockResolvedValue(readySaveResult());
    renderCard();
    openCard();
    fireEvent.click(screen.getByRole("radio", { name: "Not sure" }));
    fireEvent.click(screen.getByRole("button", { name: /save production evidence/i }));

    await waitFor(() => expect(saveFieldProductionCycleAction).toHaveBeenCalled());
    const payload = vi.mocked(saveFieldProductionCycleAction).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty("chemicalNAppliedKgHa");
    expect(payload).not.toHaveProperty("chemicalPAppliedKgHa");
    expect(payload).not.toHaveProperty("chemicalKAppliedKgHa");
  });

  it("never renders a raw backend error object", async () => {
    vi.mocked(saveFieldProductionCycleAction).mockRejectedValue(new Error("{code: 23505, details: null, hint: null, message: duplicate}"));
    renderCard();
    openCard();
    fireEvent.click(screen.getByRole("button", { name: /save production evidence/i }));

    await waitFor(() => expect(screen.getByText("Could not save production evidence. Please try again.")).toBeTruthy());
    expect(document.body.textContent).not.toContain("23505");
    expect(document.body.textContent).not.toContain("details: null");
  });
});
