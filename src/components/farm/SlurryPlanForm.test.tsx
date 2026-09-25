import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FarmProvider, useSlurryAllocations } from "@/store/farm-store";
import { resolveFieldSlurryAllocation } from "@/domain/nutrients";
import { listMissingSlurryPlanningDetails } from "@/domain/what-matters-no-recommendation";
import { SlurryPlanForm } from "./SlurryPlanForm";
import type { SlurryAllocation } from "@/domain/types";

afterEach(() => cleanup());

let latestAllocations: SlurryAllocation[] = [];
function AllocationsProbe() {
  const allocations = useSlurryAllocations();
  useEffect(() => {
    latestAllocations = allocations;
  }, [allocations]);
  return null;
}

function renderForm(onSaved = vi.fn()) {
  render(
    <FarmProvider>
      <SlurryPlanForm onSaved={onSaved} />
      <AllocationsProbe />
    </FarmProvider>,
  );
  return onSaved;
}

describe("SlurryPlanForm", () => {
  it("uses the farm's known store and fields, pre-chooses nothing the farmer must decide, and saves nothing until complete", () => {
    const onSaved = renderForm();
    // Demo farm: one store with 60 m³ unallocated -> the only possible store.
    const store = screen.getByLabelText("Slurry store") as HTMLSelectElement;
    expect(store.value).toBe("housing-shed-1");
    expect(screen.getByRole("option", { name: /60 m³ available/ })).toBeTruthy();
    expect((screen.getByLabelText("Field") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Volume to spread (m³)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("How will this slurry be spread?") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Planned application date") as HTMLInputElement).value).toBe("");

    const before = latestAllocations.length;
    fireEvent.click(screen.getByRole("button", { name: "Save spreading plan" }));
    expect(screen.getByText("Choose a field.")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(latestAllocations).toHaveLength(before);
  });

  it("saves a complete plan as one canonical allocation that the What Matters resolver picks up, then returns", async () => {
    const onSaved = renderForm();
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "field-road" } });
    fireEvent.change(screen.getByLabelText("Volume to spread (m³)"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("How will this slurry be spread?"), { target: { value: "LESS" } });
    fireEvent.change(screen.getByLabelText("Planned application date"), { target: { value: "2026-09-26" } });
    fireEvent.click(screen.getByRole("button", { name: "Save spreading plan" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const saved = latestAllocations.find((a) => a.fieldId === "field-road");
    expect(saved).toEqual(
      expect.objectContaining({
        housingId: "housing-shed-1",
        volumeM3: 40,
        applicationMethod: expect.objectContaining({ value: "LESS", status: "farmer_adjusted" }),
        applicationDate: expect.objectContaining({ value: "2026-09-26", status: "farmer_adjusted" }),
      }),
    );
    // No invented rank and no fabricated prior estimate in the provenance chain.
    expect(saved?.priority).toBeUndefined();
    expect(saved?.score).toBeUndefined();
    expect(saved?.applicationMethod?.previous).toBeUndefined();
    expect(resolveFieldSlurryAllocation(latestAllocations, "field-road")).toBe(saved);
    // Complete: nothing left for the "Add spreading details" path to ask for.
    expect(listMissingSlurryPlanningDetails([{ id: "field-road" } as never], latestAllocations)).toEqual([]);
  });

  it("refuses a second allocation for a field already planned from the same store (edit it from the field instead)", () => {
    renderForm();
    // field-back is already planned from housing-shed-1 in the demo farm.
    // (The multi-store warning is covered by `slurry-allocation-plan.test.ts`.)
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "field-back" } });
    fireEvent.change(screen.getByLabelText("Volume to spread (m³)"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("How will this slurry be spread?"), { target: { value: "LESS" } });
    fireEvent.change(screen.getByLabelText("Planned application date"), { target: { value: "2026-09-26" } });
    fireEvent.click(screen.getByRole("button", { name: "Save spreading plan" }));
    expect(screen.getByText(/already has slurry planned from this store/i)).toBeTruthy();
  });

  it("rejects more slurry than the store has available", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "field-road" } });
    fireEvent.change(screen.getByLabelText("Volume to spread (m³)"), { target: { value: "61" } });
    fireEvent.change(screen.getByLabelText("How will this slurry be spread?"), { target: { value: "LESS" } });
    fireEvent.change(screen.getByLabelText("Planned application date"), { target: { value: "2026-09-26" } });
    fireEvent.click(screen.getByRole("button", { name: "Save spreading plan" }));
    expect(screen.getByText(/more slurry than this store has available/i)).toBeTruthy();
  });
});
