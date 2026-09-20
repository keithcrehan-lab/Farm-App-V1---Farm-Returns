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

// Today Map Priority Semantics Correction (2026-09-19): `MapHero` never
// renders a real map in this jsdom test environment anyway (no real
// Mapbox token), so its own per-field `getTone`/`getStatusLabel`
// callbacks are otherwise unreachable from a test — a real regression
// risk for exactly the bug this checkpoint corrects (a farm-level
// opportunity's own priority silently repainted onto every affected
// field's marker). Stubbed here purely to capture the real callbacks
// `TodayPage` passes it, so a test can call them directly with a real
// affected field and assert what colour/label they'd actually produce.
interface CapturedMapHeroProps {
  getTone: (field: { id: string }) => string;
  getStatusLabel: (field: { id: string }) => string | undefined;
  onSelectField?: (fieldId: string) => void;
  selectedFieldId?: string;
  highlightedFieldIds?: string[];
  dimUnhighlighted?: boolean;
  fitHighlightedFields?: boolean;
  children?: React.ReactNode;
}
let capturedMapHeroProps: CapturedMapHeroProps | undefined;
vi.mock("@/components/farm/MapHero", () => ({
  MapHero: (props: CapturedMapHeroProps) => {
    capturedMapHeroProps = props;
    return <div data-testid="map-hero-stub">{props.children}</div>;
  },
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
    // "What matters now" now legitimately renders twice (the desktop
    // map-overlay compact banner and the mobile PromptCard below the
    // map — CSS-gated by breakpoint, both present in this jsdom render),
    // so `queryAllByText` rather than the single-match `queryByText`.
    await waitFor(() =>
      expect(
        screen.queryAllByText(/what matters now/i).length > 0 || screen.queryByText(/nothing needs your attention/i) || screen.queryByText(/map a field/i),
      ).toBeTruthy(),
    );
  });

  it("never renders a 'Start job' action — no Act-stage job type exists for these Prompt kinds yet", async () => {
    renderToday();
    await waitFor(() => expect(screen.queryAllByText(/what matters now/i).length).toBeGreaterThan(0));
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
    await waitFor(() => expect(screen.queryAllByText(/what matters now/i).length).toBeGreaterThan(0));
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
    vi.mocked(buildAllRealPrompts).mockReturnValue([chemicalFertiliserClosedPrompt(), fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    // Farm-wide ambient fact (the one real closed-period source) — the
    // chemical-fertiliser closed period is not one of the Farm Priority
    // Tracker's four categories (Slurry/Lime/Fertiliser/Soil), so this
    // stays a chip fact — now also legitimately echoed as the Fertiliser
    // opportunity card's own summary line, so `getAllByText` (not
    // `getByText`) since more than one real element carries it.
    await waitFor(() => expect(screen.getAllByText(/chemical fertiliser.*closed period/i).length).toBeGreaterThan(0));
  });

  it("no longer lets that restriction suppress the field's real nutrient recommendation — it still reaches the tracker as a real Fertiliser opportunity", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([chemicalFertiliserClosedPrompt(), fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    // The SAME field (field-home) is chemical-fertiliser-closed (an
    // ambient, non-tracker fact) AND has a real OK nutrient
    // recommendation (Fertiliser category, MEDIUM) at once — proving the
    // closed period doesn't suppress it, as the historical bug did.
    await waitFor(() => expect(screen.getAllByText(/chemical fertiliser.*closed period/i).length).toBeGreaterThan(0));
    const strip = await screen.findByRole("button", { name: /1 medium priority/i });
    expect(within(strip).getByText("Medium priority").previousElementSibling?.textContent).toBe("1");
    // The Fertiliser opportunity's own drill-down sheet carries the same
    // real ambient status as its own summary line, independent of the
    // tracker's own counts.
    fireEvent.click(screen.getByText("Fertiliser").closest("button")!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/chemical fertiliser.*closed period/i)).toBeTruthy();
  });

  it("never presents a field as generically restricted — the bare word 'Restricted' is gone from the status strip", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([chemicalFertiliserClosedPrompt(), fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    await waitFor(() => expect(screen.getAllByText(/chemical fertiliser.*closed period/i).length).toBeGreaterThan(0));
    expect(screen.queryByText("Restricted")).toBeNull();
  });

  it("surfaces the farm's existing canonical lime requirement where available, via its own Lime opportunity card, and feeds it into the tracker", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([chemicalFertiliserClosedPrompt(), fertiliserRecommendationOkPrompt()]);
    const limeFixture = {
      fields: [{ fieldId: "field-home", fieldName: "Home Field", rateTHa: 2.5, fieldTonnes: 10, areaHa: 4 }],
      farmTotalTonnes: 10,
      fieldsWithoutLimeEvidence: 0,
    };
    // Only Today's own fetch calls this action now (`FarmLimeRequirementCard`
    // no longer renders here) — a single queued value is enough, and
    // `Once` keeps it scoped to this test only, unlike a persistent
    // override which would leak this fixture into every later test.
    vi.mocked(getFarmLimeRequirementAction).mockResolvedValueOnce(limeFixture);
    renderTodayRealMode();
    const limeCategoryLabel = await screen.findByText("Lime");
    const limeCard = limeCategoryLabel.closest("button")!;
    expect(within(limeCard).getByText("1 field has a verified lime requirement")).toBeTruthy();
    // `formatNumber` drops trailing zeros (no `minimumFractionDigits`) —
    // a whole-tonnes real figure renders as "10 t", not "10.00 t". The
    // compact rail row combines count + real metric into one line.
    expect(within(limeCard).getByText("1 field · 10 t")).toBeTruthy();
    // Lime (real requirement -> MEDIUM) and Fertiliser (real OK
    // recommendation -> MEDIUM) both contribute, independently, to the
    // same Medium priority band.
    const strip = await screen.findByRole("button", { name: /2 medium priority/i });
    expect(within(strip).getByText("Medium priority").previousElementSibling?.textContent).toBe("2");
    // Opening the card reveals the real field-level breakdown.
    fireEvent.click(limeCard);
    expect(await screen.findByText(/Verified lab test · 2\.5 t\/ha/)).toBeTruthy();
  });

  it("real closed-period logic itself is unchanged — a real OK spreading-window Prompt for the same kind still reports the calendar as open, not restricted", async () => {
    const openPrompt: Prompt = {
      ...chemicalFertiliserClosedPrompt(),
      basis: { status: "OK", value: { fieldName: "Home Field", material: "chemical_fertiliser", county: "Cork" }, evidenceState: "IRISH_MODEL" },
    };
    vi.mocked(buildAllRealPrompts).mockReturnValue([openPrompt]);
    renderTodayRealMode();
    await waitFor(() => expect(screen.getAllByText(/chemical fertiliser.*open 1\/1/i).length).toBeGreaterThan(0));
    // Chemical fertiliser isn't a tracker category at all, and this
    // fixture has no Slurry/Lime/Fertiliser/Soil Prompt — an honest
    // all-zero tracker, and no category cards at all.
    const strip = await screen.findByRole("button", { name: /0 high priority, 0 medium priority, 0 low priority, 0 for later/i });
    expect(within(strip).getByText("Medium priority").previousElementSibling?.textContent).toBe("0");
    expect(screen.queryByText("Review slurry plan")).toBeNull();
    expect(screen.queryByText("Review fertiliser plan")).toBeNull();
  });
});

/**
 * Slurry Closed-Period Wiring V1 — `buildAllRealPrompts` now emits a
 * second real `spreading_window` Prompt per field (material
 * `organic_fertiliser_other_than_FYM`, slurry's own real S.I. 588/2025
 * closed-period category, distinct from chemical fertiliser's). These
 * tests prove Today's new "Slurry" ambient chip and "Slurry closed"
 * status-strip segment are genuinely computed from that material's own
 * Prompts, independent of — never conflated with — the pre-existing
 * chemical-fertiliser chip/segment above.
 */
function slurryClosedPrompt(): Prompt {
  return {
    id: "prompt-spreading-slurry-closed",
    farmId: "farm-1",
    kind: "spreading_window",
    title: "Spreading window status needs review — Home Field",
    description: "Not permitted: organic fertiliser (other than farmyard manure) may not be applied to this field during the statutory closed period.",
    basis: {
      status: "LEGAL_PROHIBITION",
      reasonCode: "CLOSED_PERIOD_CALENDAR",
      consequence: "organic fertiliser (other than farmyard manure) may not be applied to this field during the statutory closed period",
    },
    fieldId: "field-home",
    inputsSnapshot: { county: "Cork", material: "organic_fertiliser_other_than_FYM" },
    createdAt: "2026-09-19T09:00:00Z",
  };
}

function slurryOpenPrompt(): Prompt {
  return {
    ...slurryClosedPrompt(),
    id: "prompt-spreading-slurry-open",
    basis: { status: "OK", value: { fieldName: "Home Field", material: "organic_fertiliser_other_than_FYM", county: "Cork" }, evidenceState: "IRISH_MODEL" },
  };
}

describe("TodayPage — slurry closed-period wiring (2026-09-19)", () => {
  it("shows a real, independent 'Slurry' ambient chip alongside the chemical-fertiliser one, and feeds the Farm Priority Tracker's own Slurry category independently of Fertiliser, for the same field", async () => {
    // Chemical fertiliser closed (blocks Fertiliser's own priority, not
    // a tracker category itself), slurry open (a real, currently open
    // spreading window -> Slurry HIGH), real OK fertiliser recommendation
    // blocked by the same real closed period -> Fertiliser MEDIUM —
    // proves the tracker's own categories stay genuinely independent,
    // not one shared count.
    vi.mocked(buildAllRealPrompts).mockReturnValue([chemicalFertiliserClosedPrompt(), slurryOpenPrompt(), fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    await waitFor(() => expect(screen.getAllByText(/chemical fertiliser.*closed period/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/slurry.*open 1\/1/i).length).toBeGreaterThan(0);
    const strip = await screen.findByRole("button", { name: /1 high priority, 1 medium priority, 0 low priority, 0 for later/i });
    expect(within(strip).getByText("High priority").previousElementSibling?.textContent).toBe("1");
    expect(within(strip).getByText("Medium priority").previousElementSibling?.textContent).toBe("1");
  });

  it("reports Slurry as High priority when chemical fertiliser is genuinely open, for the same field — the reverse case, proving neither category leaks into the other", async () => {
    const chemicalOpenPrompt: Prompt = {
      ...chemicalFertiliserClosedPrompt(),
      id: "prompt-spreading-chemical-open",
      basis: { status: "OK", value: { fieldName: "Home Field", material: "chemical_fertiliser", county: "Cork" }, evidenceState: "IRISH_MODEL" },
    };
    vi.mocked(buildAllRealPrompts).mockReturnValue([chemicalOpenPrompt, slurryClosedPrompt(), fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    await waitFor(() => expect(screen.getAllByText(/chemical fertiliser.*open 1\/1/i).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/slurry.*closed period/i).length).toBeGreaterThan(0);
    // Chemical fertiliser is genuinely open here, so Fertiliser's own
    // real OK recommendation is unblocked -> HIGH; Slurry's own real
    // closed-period Prompt has no field open -> blocked -> MEDIUM. Same
    // total counts as the previous test (1 high, 1 medium) but driven by
    // the OPPOSITE category each time — proving neither leaks into the
    // other.
    const strip = await screen.findByRole("button", { name: /1 high priority, 1 medium priority, 0 low priority, 0 for later/i });
    expect(within(strip).getByText("High priority").previousElementSibling?.textContent).toBe("1");
    expect(within(strip).getByText("Medium priority").previousElementSibling?.textContent).toBe("1");
  });

  it("never shows the 'Slurry' ambient chip when no real slurry Prompt exists — no fabricated fact for a farm/mock fixture without one, and the tracker's Slurry category honestly contributes nothing (not a fabricated zero-priority band)", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([chemicalFertiliserClosedPrompt(), fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    await waitFor(() => expect(screen.getAllByText(/chemical fertiliser.*closed period/i).length).toBeGreaterThan(0));
    // The chip uses "Slurry · Open"/"Slurry · Closed period" (a middle
    // dot) — distinct from the tracker's own "High priority" etc. labels.
    expect(screen.queryByText(/slurry ·/i)).toBeNull();
    // Only Fertiliser (real OK recommendation) contributes — Slurry has
    // no real Prompt at all here, so it adds to no band whatsoever.
    const strip = await screen.findByRole("button", { name: /0 high priority, 1 medium priority, 0 low priority, 0 for later/i });
    expect(within(strip).getByText("Medium priority").previousElementSibling?.textContent).toBe("1");
  });
});

describe("TodayPage — Farm Priority Tracker V1 (2026-09-19)", () => {
  it("replaces every old status-strip label with the agreed farmer-facing priority bands", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    // No chemical-fertiliser closed-period Prompt in this fixture, so
    // Fertiliser's own real OK recommendation is unblocked -> HIGH.
    const strip = await screen.findByRole("button", { name: /1 high priority, 0 medium priority, 0 low priority, 0 for later/i });
    expect(within(strip).getByText("High priority")).toBeTruthy();
    expect(within(strip).getByText("Medium priority")).toBeTruthy();
    expect(within(strip).getByText("Low priority")).toBeTruthy();
    expect(within(strip).getByText("For later")).toBeTruthy();
    expect(screen.queryByText("Nutrient action")).toBeNull();
    expect(screen.queryByText("Review")).toBeNull();
    expect(screen.queryByText("Fert. closed")).toBeNull();
    expect(screen.queryByText("Slurry closed")).toBeNull();
  });

  it("never renders more than one segment for the same priority band WITHIN the tracker tile itself", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    const strip = await screen.findByRole("button", { name: /1 high priority, 0 medium priority, 0 low priority, 0 for later/i });
    // Scoped to the tile itself — a category card's own priority Pill
    // (e.g. the Fertiliser card's "Medium priority" badge) legitimately
    // reuses the same farmer-facing label elsewhere on the page, which
    // is not "a duplicate segment" in the tile's own sense this test
    // guards against.
    expect(within(strip).getAllByText("High priority")).toHaveLength(1);
    expect(within(strip).getAllByText("Medium priority")).toHaveLength(1);
    expect(within(strip).getAllByText("Low priority")).toHaveLength(1);
    expect(within(strip).getAllByText("For later")).toHaveLength(1);
  });

  it("never renders more than one card for the same category", async () => {
    const fieldTwo: Prompt = { ...fertiliserRecommendationOkPrompt(), id: "prompt-fert-rec-2", fieldId: "field-2" };
    vi.mocked(buildAllRealPrompts).mockReturnValue([fertiliserRecommendationOkPrompt(), fieldTwo]);
    renderTodayRealMode();
    await screen.findByText("Fertiliser");
    expect(screen.getAllByText("Fertiliser")).toHaveLength(1);
  });

  it("renders an honest all-zero state when the farm has no active Today opportunity in any category", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([]);
    renderTodayRealMode();
    const strip = await screen.findByRole("button", { name: /0 high priority, 0 medium priority, 0 low priority, 0 for later/i });
    expect(within(strip).getByText("High priority").previousElementSibling?.textContent).toBe("0");
    expect(within(strip).getByText("Medium priority").previousElementSibling?.textContent).toBe("0");
    expect(within(strip).getByText("Low priority").previousElementSibling?.textContent).toBe("0");
    expect(within(strip).getByText("For later").previousElementSibling?.textContent).toBe("0");
  });

  it("counts a farm-level Slurry opportunity once, even when every field on the farm has its own real closed-period Prompt — never a per-field tally", async () => {
    const fieldTwoClosed: Prompt = { ...slurryClosedPrompt(), id: "prompt-slurry-field-2", fieldId: "field-2" };
    const fieldThreeClosed: Prompt = { ...slurryClosedPrompt(), id: "prompt-slurry-field-3", fieldId: "field-3" };
    vi.mocked(buildAllRealPrompts).mockReturnValue([slurryClosedPrompt(), fieldTwoClosed, fieldThreeClosed]);
    renderTodayRealMode();
    // Three real fields' worth of the identical real closed-period fact
    // still contribute exactly one entry, not three — with no field
    // open, this is a real blocker (MEDIUM), not HIGH.
    const strip = await screen.findByRole("button", { name: /0 high priority, 1 medium priority, 0 low priority, 0 for later/i });
    expect(within(strip).getByText("Medium priority").previousElementSibling?.textContent).toBe("1");
  });

  it("Today Control Room V1: clicking the mobile priority strip opens the rail's own 'Today's opportunities' bottom sheet (not 'Also worth a look' directly — that stays one tap further in, via the sheet's own secondary link)", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    const strip = await screen.findByRole("button", { name: /1 high priority, 0 medium priority, 0 low priority, 0 for later/i });
    fireEvent.click(strip);
    expect(screen.getByText("Today's opportunities")).toBeTruthy();
  });

  it("clicking a category card opens its own drill-down sheet, not the tracker's field-level feed", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    const card = await screen.findByText("Fertiliser");
    fireEvent.click(card.closest("button")!);
    expect(screen.queryByText("Also worth a look")).toBeNull();
    expect(await screen.findByText("Field breakdown")).toBeTruthy();
    expect(screen.getByText("Home Field")).toBeTruthy();
  });
});

describe("TodayPage — Today Map Notification Visual Hierarchy V1 (2026-09-19)", () => {
  it("never renders the old per-field 'Nutrient priority' label anywhere on the page", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    await screen.findByText("Fertiliser");
    expect(screen.queryByText("Nutrient priority")).toBeNull();
    expect(screen.queryByText(/nutrient priority/i)).toBeNull();
  });

  it("the priority tracker's own Low-priority segment is green, not blue — Priority Colour Reference", async () => {
    const soilAmbiguousPrompt: Prompt = {
      id: "prompt-soil-ambiguous",
      farmId: "farm-1",
      kind: "soil_test_age",
      title: "Soil test status ambiguous — Home Field",
      description: "d",
      basis: { status: "AMBIGUOUS", reasonCode: "R", detail: "d" },
      fieldId: "field-home",
      createdAt: "2026-09-19T09:00:00Z",
    };
    vi.mocked(buildAllRealPrompts).mockReturnValue([soilAmbiguousPrompt]);
    renderTodayRealMode();
    const strip = await screen.findByRole("button", { name: /0 high priority, 0 medium priority, 1 low priority, 0 for later/i });
    // TodayPriorityHud's own DOM shape: <span>{dot}{count}{label}</span> —
    // dot, count and label are direct siblings within one wrapper span,
    // unlike the old tile's two-level nesting.
    const countSpan = within(strip).getByText("Low priority").previousElementSibling;
    const lowDot = countSpan?.previousElementSibling;
    expect(lowDot?.className).toContain("bg-fr-good");
    expect(lowDot?.className).not.toContain("bg-fr-info");
  });
});

describe("TodayPage — Today Map Priority Semantics Correction (2026-09-19)", () => {
  it("a HIGH farm-level Slurry opportunity affecting ten fields does NOT make those field markers HIGH/red — the map stays neutral until a real field-level priority exists", async () => {
    // Real, currently OPEN spreading windows on every field — Slurry's
    // own real time-sensitive fact -> HIGH (Priority Engine V1).
    const fieldIds = Array.from({ length: 10 }, (_, i) => `slurry-field-${i}`);
    const slurryPrompts: Prompt[] = fieldIds.map((fieldId, i) => ({
      id: `prompt-slurry-${i}`,
      farmId: "farm-1",
      kind: "spreading_window",
      title: "Calendar open",
      description: "d",
      basis: { status: "OK", value: { material: "organic_fertiliser_other_than_FYM" }, evidenceState: "IRISH_MODEL" },
      fieldId,
      inputsSnapshot: { material: "organic_fertiliser_other_than_FYM" },
      createdAt: "2026-09-19T09:00:00Z",
    }));
    vi.mocked(buildAllRealPrompts).mockReturnValue(slurryPrompts);
    renderTodayRealMode();
    // The farm-level Slurry card itself stays HIGH/red — this correction
    // only touches individual field markers, never the farm-level
    // opportunity's own real priority.
    const strip = await screen.findByRole("button", { name: /1 high priority, 0 medium priority, 0 low priority, 0 for later/i });
    expect(strip).toBeTruthy();
    expect(screen.getByText("Slurry").closest("button")?.textContent).toContain("High priority");

    // The map's own per-field callbacks — captured via the mocked
    // `MapHero` above — must not colour/label any of the ten real,
    // affected fields as if Farm Return had individually ranked them.
    expect(capturedMapHeroProps).toBeDefined();
    for (const fieldId of fieldIds) {
      expect(capturedMapHeroProps!.getTone({ id: fieldId })).toBe("neutral");
      expect(capturedMapHeroProps!.getStatusLabel({ id: fieldId })).toBeUndefined();
    }
    // Also true for a field with no real opportunity at all — no field
    // is ever singled out as HIGH/MEDIUM/LOW by this map.
    expect(capturedMapHeroProps!.getTone({ id: "unrelated-field" })).toBe("neutral");
  });

  it("field selection remains functional — MapHero still receives a real onSelectField handler and a selected field id", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    await screen.findByTestId("map-hero-stub");
    expect(typeof capturedMapHeroProps).toBe("object");
    expect(typeof capturedMapHeroProps!.onSelectField).toBe("function");
    expect(capturedMapHeroProps!.selectedFieldId).toBe("field-home");
  });

  it("no category focused by default — MapHero receives no highlightedFieldIds until a rail row is selected", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    await screen.findByTestId("map-hero-stub");
    expect(capturedMapHeroProps!.highlightedFieldIds).toBeUndefined();
  });
});

describe("TodayPage — Today Control Room V1 (2026-09-19)", () => {
  it("selecting a rail row focuses that category: MapHero's own highlightedFieldIds becomes exactly that opportunity's real affectedFieldIds, dimming/fitting are real opt-ins, and the drill-down sheet opens", async () => {
    const fieldIds = ["slurry-field-0", "slurry-field-1", "slurry-field-2"];
    const slurryPrompts: Prompt[] = fieldIds.map((fieldId, i) => ({
      id: `prompt-slurry-${i}`,
      farmId: "farm-1",
      kind: "spreading_window",
      title: "Calendar open",
      description: "d",
      basis: { status: "OK", value: { material: "organic_fertiliser_other_than_FYM" }, evidenceState: "IRISH_MODEL" },
      fieldId,
      inputsSnapshot: { material: "organic_fertiliser_other_than_FYM" },
      createdAt: "2026-09-19T09:00:00Z",
    }));
    vi.mocked(buildAllRealPrompts).mockReturnValue(slurryPrompts);
    renderTodayRealMode();
    fireEvent.click((await screen.findByText("Slurry")).closest("button")!);
    expect(capturedMapHeroProps!.highlightedFieldIds).toEqual(fieldIds);
    expect(capturedMapHeroProps!.dimUnhighlighted).toBe(true);
    expect(capturedMapHeroProps!.fitHighlightedFields).toBe(true);
    expect(await screen.findByText("Field breakdown")).toBeTruthy();
  });

  it("selecting the same rail row again clears the focus and closes the drill-down sheet — a real toggle", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    const row = (await screen.findByText("Fertiliser")).closest("button")!;
    fireEvent.click(row);
    expect(capturedMapHeroProps!.highlightedFieldIds).toEqual(["field-home"]);
    fireEvent.click(row);
    expect(capturedMapHeroProps!.highlightedFieldIds).toBeUndefined();
    expect(screen.queryByText("Field breakdown")).toBeNull();
  });

  it("closing the drill-down sheet also clears the map's own focus", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    fireEvent.click((await screen.findByText("Fertiliser")).closest("button")!);
    const dialog = await screen.findByRole("dialog", { name: "Fertiliser" });
    await screen.findByText("Field breakdown");
    // `Sheet` has two real "Close" affordances (the backdrop and the
    // header's own X button, both `aria-label="Close"`) — scoped to the
    // dialog panel itself picks the real header button, not the
    // backdrop.
    fireEvent.click(within(dialog).getByLabelText("Close"));
    expect(capturedMapHeroProps!.highlightedFieldIds).toBeUndefined();
  });

  it("mobile: opening the rail bottom sheet and selecting a row closes it and opens the real opportunity's own drill-down sheet", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([fertiliserRecommendationOkPrompt()]);
    renderTodayRealMode();
    const strip = await screen.findByRole("button", { name: /1 high priority, 0 medium priority, 0 low priority, 0 for later/i });
    fireEvent.click(strip);
    // Scoped to the rail sheet's own dialog panel — the desktop overlay
    // rail's own "Fertiliser" row is also present in this jsdom render
    // (CSS-hidden, not DOM-absent), so an unscoped query would be
    // ambiguous.
    const railSheet = screen.getByRole("dialog", { name: "Today's opportunities" });
    const fertiliserRow = within(railSheet).getByText("Fertiliser").closest("button")!;
    fireEvent.click(fertiliserRow);
    expect(screen.queryByText("Today's opportunities")).toBeNull();
    expect(await screen.findByText("Field breakdown")).toBeTruthy();
    expect(screen.getByText("Home Field")).toBeTruthy();
  });
});
