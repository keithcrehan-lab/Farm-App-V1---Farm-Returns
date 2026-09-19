import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import TodayPage from "./page";
import { buildAllRealPrompts } from "@/orchestration/prompt/build-all";
import { getFarmLimeRequirementAction } from "@/app/actions/fertiliser-plan";
import type { Prompt } from "@/orchestration/prompt";

// GPS Job Session + Confirm Actual contract: ExpandedPromptSheet now
// calls useRouter() (for its own "Start job" navigation) — see
// ExpandedPromptSheet.test.tsx's identical mock for the full reasoning.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Phase C (contextual Ask AI completeness, 2026-09-03): the real mock
// farm/field data `<FarmProvider>` seeds doesn't deterministically
// produce a known evidence tier for whichever Prompt ends up primary —
// mocking this one call site's own Prompt source directly gives the new
// "Leading prompt" evidence-tier test a real, known fixture to assert
// against, the same technique `ExpandedPromptSheet.test.tsx`'s own
// fixtures already use one layer up.
vi.mock("@/orchestration/prompt/build-all", () => ({
  buildAllRealPrompts: vi.fn(() => [
    {
      id: "prompt-1",
      farmId: "farm-1",
      kind: "soil_test_age",
      title: "Soil test renewal due — Field 7",
      description: "Field 7's soil test is more than 4 years old.",
      basis: { status: "OK", value: null, evidenceState: "IRISH_MODEL" },
      fieldId: "field-7",
      regulatory: "compliance_value",
      inputsSnapshot: { county: "Cork" },
      createdAt: "2026-09-01T09:00:00Z",
    },
  ]),
}));

// Today/Homepage status-model product decision (2026-09-19):
// `FarmLimeRequirementCard` (reused verbatim, not re-implemented) calls
// this action directly — mocked the same way its own existing test file
// mocks it, so Today's own lime tests control a real, known fixture
// rather than depending on a real Supabase call.
vi.mock("@/app/actions/fertiliser-plan", () => ({
  getFarmLimeRequirementAction: vi.fn(() => Promise.resolve({ fields: [], farmTotalTonnes: 0, fieldsWithoutLimeEvidence: 0 })),
}));

afterEach(() => {
  cleanup();
});

function renderToday() {
  return render(
    <FarmProvider>
      <TodayPage />
    </FarmProvider>,
  );
}

describe("TodayPage", () => {
  it("computes and shows a real Prompt (or an honest empty state) after mount, never a fabricated placeholder", async () => {
    renderToday();
    await waitFor(() => expect(screen.queryByText(/what matters now/i) || screen.queryByText(/nothing needs your attention/i) || screen.queryByText(/map a field/i)).toBeTruthy());
  });

  it("never renders a 'Start job' action — no Act-stage job type exists for these Prompt kinds yet", async () => {
    renderToday();
    await waitFor(() => expect(screen.queryByText(/what matters now/i)).toBeTruthy());
    expect(screen.queryByText(/start job/i)).toBeNull();
  });

  it("opens the Expanded Prompt sheet with real evidence when 'View details' is pressed", async () => {
    renderToday();
    await waitFor(() => expect(screen.queryByText("View details")).toBeTruthy());
    fireEvent.click(screen.getByText("View details"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("provides a real Ask AI affordance with the current farm as context", async () => {
    renderToday();
    fireEvent.click(screen.getAllByText("Ask AI")[0]);
    expect(screen.getByText("Farm:")).toBeTruthy();
  });

  it("gives Ask AI the real evidence tier for the leading prompt, not a bare title with no provenance — Phase C, contextual Ask AI completeness (2026-09-03)", async () => {
    renderToday();
    await waitFor(() => expect(screen.queryByText(/what matters now/i)).toBeTruthy());
    fireEvent.click(screen.getAllByText("Ask AI")[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Leading prompt:")).toBeTruthy();
    expect(within(dialog).getByText("Soil test renewal due — Field 7")).toBeTruthy();
    expect(within(dialog).getByTestId("ask-ai-fact-tier").textContent).toBe("Official model");
  });
});

/**
 * Today/Homepage status-model product decision (2026-09-19): a field
 * must not have one generic legal "Restricted" status collapsing every
 * other real fact about it. These tests use the real default mock
 * farm's own `field-home` (a real, mapped field with a real polygon —
 * `src/data/mock-farm.ts`), so the per-field Ready/Review/chemical-
 * fertiliser counts genuinely reflect that field, not a synthetic id
 * with no matching `Field` record. `remote` is set so `isRealMode` is
 * true (the same gate `FarmLimeRequirementCard`'s one other real caller,
 * `NutrientsPageClient.tsx`, already uses) — mock-mode's own default is
 * `isRealMode: false`, which would hide the lime card regardless of
 * fixture content.
 */
function renderTodayRealMode() {
  return render(
    <FarmProvider remote>
      <TodayPage />
    </FarmProvider>,
  );
}

/** Real `EngineOutcome<unknown>["status"]` shapes (`src/domain/evidence.ts`)
 * — never a hand-shortened fixture missing a real required field. */
function chemicalFertiliserClosedPrompt(): Prompt {
  return {
    id: "prompt-spreading",
    farmId: "farm-1",
    kind: "spreading_window",
    title: "Spreading window status needs review — Home Field",
    description: "Not permitted: chemical fertiliser may not be applied to this field during the statutory closed period.",
    basis: { status: "LEGAL_PROHIBITION", reasonCode: "CLOSED_PERIOD_CALENDAR", consequence: "chemical fertiliser may not be applied to this field during the statutory closed period" },
    fieldId: "field-home",
    inputsSnapshot: { county: "Cork", material: "chemical_fertiliser" },
    createdAt: "2026-09-19T09:00:00Z",
  };
}

function fertiliserRecommendationOkPrompt(): Prompt {
  return {
    id: "prompt-fert-rec",
    farmId: "farm-1",
    kind: "fertiliser_recommendation",
    title: "Fertiliser recommended — Home Field",
    description: "CAN recommended for Home Field.",
    basis: {
      status: "OK",
      value: { fieldId: "field-home", areaHa: 4, requirementKgHa: 90, products: [{ name: "CAN", quantityKg: 360 }], calculationVersion: "test", napCompliance: { status: "NOT_APPLICABLE", reasonCode: "TEST" } },
      evidenceState: "IRISH_MODEL",
    },
    fieldId: "field-home",
    inputsSnapshot: { farmGrasslandAreaHa: 20, nonGrassPct: 0, asOfDate: "2026-09-19", pIndex: 2, kIndex: 3 },
    createdAt: "2026-09-19T09:00:00Z",
  };
}

describe("TodayPage — status-model product decision (chemical-fertiliser restriction no longer swallows a field's whole status, 2026-09-19)", () => {
  it("still shows the real chemical-fertiliser restriction during the closed period", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValueOnce([chemicalFertiliserClosedPrompt(), fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    await waitFor(() => expect(screen.getByText(/chemical fertiliser/i)).toBeTruthy());
    // Farm-wide ambient fact (the one real closed-period source).
    expect(screen.getByText(/chemical fertiliser.*closed period/i)).toBeTruthy();
    // Bottom status strip's own separate, explicit chemical-fertiliser
    // count — read via its own "Fert. closed" label's sibling, since
    // the Ready count can coincidentally also read "1" in this fixture.
    const strip = await screen.findByRole("button", { name: /chemical fertiliser currently restricted/i });
    expect(within(strip).getByText("Fert. closed").previousElementSibling?.textContent).toBe("1");
  });

  it("no longer lets that restriction suppress the field's real nutrient recommendation", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValueOnce([chemicalFertiliserClosedPrompt(), fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    const strip = await screen.findByRole("button", { name: /nutrient priority/i });
    // The SAME field (field-home) contributes to both counts at once —
    // proving the two facts are genuinely independent, not one
    // collapsing the other, as the bug did.
    expect(strip.getAttribute("aria-label")).toMatch(/1 fields? with a nutrient priority/i);
    expect(strip.getAttribute("aria-label")).toMatch(/1 with chemical fertiliser currently restricted/i);
  });

  it("never presents a field as generically restricted — the bare word 'Restricted' is gone from the status strip", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValueOnce([chemicalFertiliserClosedPrompt(), fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    await screen.findByRole("button", { name: /chemical fertiliser currently restricted/i });
    expect(screen.queryByText("Restricted")).toBeNull();
  });

  it("surfaces the farm's existing canonical lime requirement where available", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValueOnce([chemicalFertiliserClosedPrompt(), fertiliserRecommendationOkPrompt()]);
    vi.mocked(getFarmLimeRequirementAction).mockResolvedValueOnce({
      fields: [{ fieldId: "field-home", fieldName: "Home Field", rateTHa: 2.5, fieldTonnes: 10, areaHa: 4 }],
      farmTotalTonnes: 10,
      fieldsWithoutLimeEvidence: 0,
    });
    renderTodayRealMode();
    await waitFor(() => expect(screen.getByText("Farm lime requirement")).toBeTruthy());
    const farmTotalLabel = await screen.findByText("Farm total");
    // `formatNumber` drops trailing zeros (no `minimumFractionDigits`) —
    // a whole-tonnes real figure renders as "10 t", not "10.00 t". Read
    // via the "Farm total" label's own sibling — the field's own
    // per-field row also legitimately shows "10 t" in this fixture.
    expect(farmTotalLabel.nextElementSibling?.textContent).toBe("10 t");
  });

  it("real closed-period logic itself is unchanged — a real OK spreading-window Prompt for the same kind still reports the calendar as open, not restricted", async () => {
    const openPrompt: Prompt = {
      ...chemicalFertiliserClosedPrompt(),
      basis: { status: "OK", value: { fieldName: "Home Field", material: "chemical_fertiliser", county: "Cork" }, evidenceState: "IRISH_MODEL" },
    };
    vi.mocked(buildAllRealPrompts).mockReturnValueOnce([openPrompt]);
    renderTodayRealMode();
    await waitFor(() => expect(screen.getByText(/chemical fertiliser.*open 1\/1/i)).toBeTruthy());
    const strip = await screen.findByRole("button", { name: /0 with chemical fertiliser currently restricted/i });
    expect(within(strip).getByText("Fert. closed").previousElementSibling?.textContent).toBe("0");
  });
});
