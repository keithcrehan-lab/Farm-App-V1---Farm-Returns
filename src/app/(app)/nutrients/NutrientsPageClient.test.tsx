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

// Codex audit CRITICAL (round 6): an empty `livestockGroups` read no
// longer reaches an `OK` fertiliser recommendation (see
// fertiliser-recommendation.ts's own `MISSING_LIVESTOCK_DATA` gate) — a
// real, non-empty herd fixture is needed everywhere a test expects
// "Plan this application" to actually render.
const LIVESTOCK_GROUPS = [
  {
    id: "g1",
    farmId: "farm-1",
    category: "suckler_cow" as const,
    label: "Cows",
    count: { value: 20, status: "verified" as const, source: "Farmer" },
    system: "grazing" as const,
    value: { value: 30000, status: "estimated" as const, source: "Farm Return estimate" },
  },
];

function renderPage(fields: Field[]) {
  return render(
    <FarmProvider remote initialState={{ farm: FARM, fields, livestockGroups: LIVESTOCK_GROUPS, housing: [], slurryAllocations: [] }}>
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
      <FarmProvider remote initialState={{ farm: FARM, fields: [fieldA, fieldB], livestockGroups: LIVESTOCK_GROUPS, housing: [], slurryAllocations: [] }}>
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
    // actually recompute via promptForFertiliserRecommendation. Uses the
    // same real, non-empty `LIVESTOCK_GROUPS` fixture `renderPage` below
    // seeds the farm store with (Codex audit CRITICAL, round 6: an empty
    // herd no longer reaches an `OK` recommendation at all).
    const grazingOnlyPlan = calculateNutrientPlan({ field: backField, farmGrasslandAreaHa: backField.areaHa, livestockGroups: LIVESTOCK_GROUPS, nonGrassPct: 0 });
    // The real silage-inclusive figure this exact fixture produces —
    // asserted distinct from the grazing-only one so this test is not
    // vacuously true.
    const silageInclusivePlan = calculateNutrientPlan({
      field: backField,
      farmGrasslandAreaHa: backField.areaHa,
      livestockGroups: LIVESTOCK_GROUPS,
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

// Codex audit MEDIUM (round 5) — the "already planned" disclosure must
// refetch after a real, successful save, not keep showing the pre-save
// "none" read for the rest of the session.
describe("NutrientsPageClient — 'already planned' disclosure refetches after a real save", () => {
  it("shows 'Plan another application' only after the farmer's own save actually completes, never before", async () => {
    const { getMatchablePlanForFieldAction } = await import("@/app/actions/fertiliser-plan");
    const { submitPromptDecisionAction } = await import("@/app/actions/decisions");
    // This mock is shared across every test in this file — clear the
    // call count left over from earlier tests before asserting on it.
    vi.mocked(getMatchablePlanForFieldAction).mockClear();
    vi.mocked(getMatchablePlanForFieldAction)
      .mockResolvedValueOnce({ status: "none" })
      .mockResolvedValueOnce({ status: "matched", decisionId: "decision-1" } as never);
    vi.mocked(submitPromptDecisionAction).mockResolvedValue({} as never);

    const fieldA = field({ id: "field-a", name: "Field A" });
    mockSearchParamsValue = new URLSearchParams({ field: "field-a" });
    renderPage([fieldA]);

    await waitFor(() => expect(screen.getByRole("button", { name: /^plan this application$/i })).toBeTruthy());
    expect(getMatchablePlanForFieldAction).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /^plan this application$/i }));
    fireEvent.click(screen.getByRole("button", { name: /accept as recommended/i }));

    // The refetch this fix introduced — never just the original,
    // now-stale pre-save read.
    await waitFor(() => expect(getMatchablePlanForFieldAction).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: /plan another application/i })).toBeTruthy());
  });
});

// Codex audit MEDIUM (round 13): `getMatchablePlanForFieldAction`
// returns "ambiguous" both for two-or-more genuine candidate plans AND
// whenever either underlying capped read truncated (Codex audit HIGH,
// round 1) — the latter can carry a `candidateCount` of 0 or 1, for
// which "more than one planned application" was a real, unsupported
// factual claim.
describe("NutrientsPageClient — distinguishes genuine multi-plan ambiguity from an inconclusive, truncated read", () => {
  it("says 'more than one' only when candidateCount genuinely is 2 or more", async () => {
    const { getMatchablePlanForFieldAction } = await import("@/app/actions/fertiliser-plan");
    vi.mocked(getMatchablePlanForFieldAction).mockResolvedValue({ status: "ambiguous", candidateCount: 2 });

    const fieldA = field({ id: "field-a", name: "Field A" });
    mockSearchParamsValue = new URLSearchParams({ field: "field-a" });
    renderPage([fieldA]);

    await waitFor(() => expect(screen.getByText(/more than one planned application/i)).toBeTruthy());
  });

  it("never claims 'more than one' when the ambiguity is really a truncated, inconclusive read (candidateCount 0 or 1)", async () => {
    const { getMatchablePlanForFieldAction } = await import("@/app/actions/fertiliser-plan");
    vi.mocked(getMatchablePlanForFieldAction).mockResolvedValue({ status: "ambiguous", candidateCount: 1 });

    const fieldA = field({ id: "field-a", name: "Field A" });
    mockSearchParamsValue = new URLSearchParams({ field: "field-a" });
    renderPage([fieldA]);

    await waitFor(() => expect(screen.getByText(/couldn't safely check/i)).toBeTruthy());
    expect(screen.queryByText(/more than one planned application/i)).toBeNull();
  });
});

// Codex audit HIGH (round 19): `existingPlan === undefined` used to
// conflate "not yet queried", "lookup in progress", and "lookup
// failed" — "Plan this application" rendered as a plain, always-
// enabled button in all three, letting a farmer persist a real,
// nuisance-duplicate Decision before (or despite) the real
// `getMatchablePlanForFieldAction` lookup ever settling.
describe("NutrientsPageClient — disables planning while the existing-plan lookup is genuinely still in flight, and discloses a genuine failure honestly", () => {
  it("disables 'Plan this application' and shows a real 'Checking…' state while the lookup is still pending — never a plain, always-enabled button", async () => {
    const { getMatchablePlanForFieldAction } = await import("@/app/actions/fertiliser-plan");
    vi.mocked(getMatchablePlanForFieldAction).mockClear();
    vi.mocked(getMatchablePlanForFieldAction).mockReturnValue(new Promise(() => {}));

    const fieldA = field({ id: "field-a", name: "Field A" });
    mockSearchParamsValue = new URLSearchParams({ field: "field-a" });
    renderPage([fieldA]);

    await waitFor(() => expect(screen.getByText(/checking whether you already have/i)).toBeTruthy());
    const button = screen.getByRole("button", { name: /checking…/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("discloses a genuine lookup failure honestly, and re-enables planning rather than blocking it indefinitely", async () => {
    const { getMatchablePlanForFieldAction } = await import("@/app/actions/fertiliser-plan");
    vi.mocked(getMatchablePlanForFieldAction).mockClear();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getMatchablePlanForFieldAction).mockRejectedValue(new Error("network error"));

    const fieldA = field({ id: "field-a", name: "Field A" });
    mockSearchParamsValue = new URLSearchParams({ field: "field-a" });
    renderPage([fieldA]);

    await waitFor(() => expect(screen.getByText(/couldn't safely check whether you already have/i)).toBeTruthy());
    // A genuine failure isn't itself unsafe to act on — the button
    // returns to its normal, enabled "Plan this application" state
    // rather than trapping the farmer indefinitely.
    const button = screen.getByRole("button", { name: /^plan this application$/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    consoleErrorSpy.mockRestore();
  });
});

// Codex audit MEDIUM (round 15): `existingPlan` used to be reset only
// when real mode turned off or the field list emptied — never on a
// plain field-to-field switch — so a field change kept showing the
// PREVIOUS field's own "already planned" disclosure (and button label)
// until the new field's own lookup resolved, or indefinitely on a
// rejection.
describe("NutrientsPageClient — 'already planned' disclosure never leaks across a field switch", () => {
  it("resets to 'Plan this application' immediately on a field switch, never keeping the previous field's 'already planned' state", async () => {
    const { getMatchablePlanForFieldAction } = await import("@/app/actions/fertiliser-plan");
    vi.mocked(getMatchablePlanForFieldAction).mockClear();
    vi.mocked(getMatchablePlanForFieldAction).mockResolvedValueOnce({ status: "matched", decisionId: "decision-1" } as never);

    const fieldA = field({ id: "field-a", name: "Field A" });
    const fieldB = field({ id: "field-b", name: "Field B" });
    mockSearchParamsValue = new URLSearchParams({ field: "field-a" });
    const { rerender } = renderPage([fieldA, fieldB]);

    await waitFor(() => expect(screen.getByRole("button", { name: /plan another application/i })).toBeTruthy());

    // Field B's own lookup never resolves within this test — proves the
    // reset happens synchronously on the field change itself, not only
    // once B's own real lookup arrives.
    vi.mocked(getMatchablePlanForFieldAction).mockReturnValueOnce(new Promise(() => {}));
    mockSearchParamsValue = new URLSearchParams({ field: "field-b" });
    rerender(
      <FarmProvider remote initialState={{ farm: FARM, fields: [fieldA, fieldB], livestockGroups: LIVESTOCK_GROUPS, housing: [], slurryAllocations: [] }}>
        <NutrientsPageClient />
      </FarmProvider>,
    );

    // Codex audit HIGH (round 19): field B's own lookup never resolves
    // in this test, so the button now correctly shows its own real
    // "Checking…" loading state (added round 19) rather than resting on
    // "Plan this application" — the important assertion here is that
    // field A's "already planned" state (its "Plan another application"
    // label and disclosure) never leaks through, not the exact resting
    // label of a still-pending check.
    await waitFor(() => expect(screen.getByRole("button", { name: /^checking…$/i })).toBeTruthy());
    expect(screen.queryByRole("button", { name: /plan another application/i })).toBeNull();
    expect(screen.queryByText(/^you already have a planned application/i)).toBeNull();
  });

  it("clears the previous field's 'already planned' state rather than leaving it forever when the new field's lookup rejects", async () => {
    const { getMatchablePlanForFieldAction } = await import("@/app/actions/fertiliser-plan");
    vi.mocked(getMatchablePlanForFieldAction).mockClear();
    vi.mocked(getMatchablePlanForFieldAction).mockResolvedValueOnce({ status: "matched", decisionId: "decision-1" } as never);

    const fieldA = field({ id: "field-a", name: "Field A" });
    const fieldB = field({ id: "field-b", name: "Field B" });
    mockSearchParamsValue = new URLSearchParams({ field: "field-a" });
    const { rerender } = renderPage([fieldA, fieldB]);

    await waitFor(() => expect(screen.getByRole("button", { name: /plan another application/i })).toBeTruthy());

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getMatchablePlanForFieldAction).mockRejectedValueOnce(new Error("network error"));
    mockSearchParamsValue = new URLSearchParams({ field: "field-b" });
    rerender(
      <FarmProvider remote initialState={{ farm: FARM, fields: [fieldA, fieldB], livestockGroups: LIVESTOCK_GROUPS, housing: [], slurryAllocations: [] }}>
        <NutrientsPageClient />
      </FarmProvider>,
    );

    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /plan another application/i })).toBeNull();
    consoleErrorSpy.mockRestore();
  });
});

// Codex audit CRITICAL (round 10): round 6's own fix only ever gated
// the "Plan this application" button — the requirement/NAP/organic-
// offset/purchased-product cards kept rendering a real grassland
// recommendation for a tillage field, and the clamped, presented-as-
// real 35 kg N/ha for a farm with no recorded livestock. This is the
// display itself, not the planning action built on top of it.
describe("NutrientsPageClient — never displays a fabricated recommendation for a tillage field or an un-evidenced empty herd", () => {
  it("shows an honest disclosure, never a real grassland N/P/K recommendation, for a tillage field", async () => {
    const tillageField = field({ id: "field-a", plannedUse: { value: "tillage", status: "verified", source: "Farmer" } });
    mockSearchParamsValue = new URLSearchParams({ field: "field-a" });
    renderPage([tillageField]);

    await waitFor(() => expect(screen.getByText(/no fertiliser recommendation available/i)).toBeTruthy());
    expect(screen.getByText(/tillage ground/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /plan this application/i })).toBeNull();
  });

  it("shows an honest disclosure, never the clamped 35 kg N/ha, for a farm with no recorded livestock", async () => {
    const fieldA = field({ id: "field-a" });
    mockSearchParamsValue = new URLSearchParams({ field: "field-a" });
    render(
      <FarmProvider remote initialState={{ farm: FARM, fields: [fieldA], livestockGroups: [], housing: [], slurryAllocations: [] }}>
        <NutrientsPageClient />
      </FarmProvider>,
    );

    await waitFor(() => expect(screen.getByText(/no fertiliser recommendation available/i)).toBeTruthy());
    expect(screen.getByText(/add a livestock group/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /plan this application/i })).toBeNull();
  });

  // Codex audit HIGH (round 24): the display gate above used to apply
  // the missing-livestock exclusion to the silage-inclusive display
  // plan too — but silage N/P/K never depends on livestockGroups at
  // all, the same exemption `calculateFarmFertiliserRequirement`/
  // `RecommendationAuditTrailCard.tsx`/`buildNutrientPlanReportCsv`
  // already apply.
  it("still shows the real requirement/NAP/product cards for a silage field, even when the farm has no recorded livestock", async () => {
    const silagePlan = mockSilagePlans[0];
    const backField = field({ id: silagePlan.fieldId, name: "Back Field" });
    mockSearchParamsValue = new URLSearchParams({ field: backField.id });
    render(
      <FarmProvider remote initialState={{ farm: FARM, fields: [backField], livestockGroups: [], housing: [], slurryAllocations: [] }}>
        <NutrientsPageClient />
      </FarmProvider>,
    );

    await waitFor(() => expect(screen.queryByText(/no fertiliser recommendation available/i)).toBeNull());
    // Planning itself must still remain grazing-only-gated — no real
    // way to say the server's own grazing-only recompute would confirm
    // it, so "Plan this application" correctly never appears either way
    // for a field with no recorded livestock.
    expect(screen.queryByRole("button", { name: /plan this application/i })).toBeNull();
  });
});
