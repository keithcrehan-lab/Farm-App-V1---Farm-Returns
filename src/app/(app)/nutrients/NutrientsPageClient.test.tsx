import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Codex audit MEDIUM (round 4) — the architecture doc claimed
 * `FertiliserPlanSheet`'s `key={field.id}` fix (round 1) was covered,
 * but no real render/navigation test actually exercised it. This file
 * exists specifically to close that gap: a real field switch (the same
 * kind of `?field=` search-param change `NutrientsPageClient` reacts to)
 * must give the sheet a genuinely fresh instance, never carrying one
 * field's own typed-over value into another field's default.
 */
let mockSearchParamsValue = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParamsValue,
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/app/actions/fertiliser-plan", () => ({
  getMatchablePlanForFieldAction: vi.fn().mockResolvedValue({ status: "none" }),
  getFieldFertiliserStatusAction: vi.fn().mockResolvedValue({ status: "not_applicable" }),
}));
vi.mock("@/app/actions/decisions", () => ({ submitPromptDecisionAction: vi.fn() }));

import { FarmProvider } from "@/store/farm-store";
import { NutrientsPageClient } from "./NutrientsPageClient";
import { calculateNutrientPlan } from "@/domain/nutrients";
import { mockSilagePlans } from "@/data/mock-farm";
import type { Farm, Field } from "@/domain/types";

afterEach(() => {
  cleanup();
  mockSearchParamsValue = new URLSearchParams();
});

const FARM: Farm = {
  id: "farm-1",
  name: "Test Farm",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Farmer",
};

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Field 1",
    areaHa: 4,
    centroid: [0, 0],
    fertility: { pIndex: { value: 1, status: "verified", source: "Soil test" }, kIndex: { value: 1, status: "verified", source: "Soil test" } },
    ...overrides,
  } as Field;
}

function renderPage(fields: Field[]) {
  return render(
    <FarmProvider remote initialState={{ farm: FARM, fields, livestockGroups: [], housing: [], slurryAllocations: [] }}>
      <NutrientsPageClient />
    </FarmProvider>,
  );
}

describe("NutrientsPageClient — FertiliserPlanSheet remount on field switch", () => {
  it("gives each field a fresh, correctly-seeded FertiliserPlanSheet instance — a farmer's own typed value in one field never leaks into another field's default", async () => {
    const fieldA = field({ id: "field-a", name: "Field A" });
    const fieldB = field({ id: "field-b", name: "Field B" });
    mockSearchParamsValue = new URLSearchParams({ field: "field-a" });
    const { rerender } = renderPage([fieldA, fieldB]);

    await waitFor(() => expect(screen.getByRole("button", { name: /plan this application/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /plan this application/i }));

    const quantityInputA = screen.getByLabelText(/quantity/i) as HTMLInputElement;
    fireEvent.change(quantityInputA, { target: { value: "99999" } });
    expect((screen.getByLabelText(/quantity/i) as HTMLInputElement).value).toBe("99999");

    // A real field switch — the same real `?field=` search-param change
    // `NutrientsPageClient` reacts to (Field selector links navigate via
    // exactly this param).
    mockSearchParamsValue = new URLSearchParams({ field: "field-b" });
    rerender(
      <FarmProvider remote initialState={{ farm: FARM, fields: [fieldA, fieldB], livestockGroups: [], housing: [], slurryAllocations: [] }}>
        <NutrientsPageClient />
      </FarmProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /plan this application/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /plan this application/i }));

    // A genuinely fresh instance for Field B — never Field A's own
    // typed-over "99999" leaking through.
    const quantityInputB = screen.getByLabelText(/quantity/i) as HTMLInputElement;
    expect(quantityInputB.value).not.toBe("99999");
  });
});

// Codex audit CRITICAL (round 4) — "Plan this application" must never
// be seeded from a field's own silage-inclusive figure, which can
// include mock `SilagePlan` data; it must match exactly what the
// server will actually recompute and validate against (grazing-only).
describe("NutrientsPageClient — FertiliserPlanSheet seeded from the real grazing-only recommendation, never mock silage data", () => {
  it("seeds the default planned quantity from the real grazing-only recommendation for a field with a mock SilagePlan, not the silage-inclusive figure shown elsewhere on the screen", async () => {
    const silagePlan = mockSilagePlans[0];
    const backField = field({ id: silagePlan.fieldId, name: "Back Field" });
    mockSearchParamsValue = new URLSearchParams({ field: backField.id });

    // The real, independent grazing-only figure — what the server will
    // actually recompute via promptForFertiliserRecommendation.
    const grazingOnlyPlan = calculateNutrientPlan({ field: backField, farmGrasslandAreaHa: backField.areaHa, livestockGroups: [], nonGrassPct: 0 });
    // The real silage-inclusive figure this exact fixture produces —
    // asserted distinct from the grazing-only one so this test is not
    // vacuously true.
    const silageInclusivePlan = calculateNutrientPlan({
      field: backField,
      farmGrasslandAreaHa: backField.areaHa,
      livestockGroups: [],
      nonGrassPct: 0,
      silage: {
        cutNumber: silagePlan.cutNumber,
        expectedYieldTDMha: silagePlan.expectedYieldTDMha.value,
        intendedUse: silagePlan.intendedUse,
      },
    });
    expect(silageInclusivePlan.purchasedProducts).not.toEqual(grazingOnlyPlan.purchasedProducts);
    expect(grazingOnlyPlan.purchasedProducts.length).toBeGreaterThan(0);

    renderPage([backField]);
    await waitFor(() => expect(screen.getByRole("button", { name: /plan this application/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /plan this application/i }));

    const quantityInput = screen.getByLabelText(/quantity/i) as HTMLInputElement;
    expect(Number(quantityInput.value)).toBeCloseTo(grazingOnlyPlan.purchasedProducts[0].totalKg);
  });
});
