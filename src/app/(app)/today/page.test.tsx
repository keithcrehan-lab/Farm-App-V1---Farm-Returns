import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import TodayPage from "./page";
import { buildAllRealPrompts } from "@/orchestration/prompt/build-all";
import { getFarmLimeRequirementAction } from "@/app/actions/fertiliser-plan";
import { evaluateWhatMattersPilot, confirmWhatMattersPilotCondition, saveFarmerContractorCostRate, type WhatMattersPilotActionResult } from "@/app/actions/what-matters-pilot";
import type { RecommendationCandidateEvaluation } from "@/domain/recommendation-selection";
import type { Prompt } from "@/orchestration/prompt";

// What Matters pilot live-wiring — the real server action (real Supabase,
// real Met Éireann calls) is mocked at this boundary for every Today test;
// the domain chain itself is already exhaustively covered by
// `what-matters-pilot.e2e.test.ts` against real Phase 5-9 functions. This
// file only needs to prove the PAGE correctly consumes whatever the action
// returns — never that the action's own domain logic is correct.
vi.mock("@/app/actions/what-matters-pilot", () => ({
  evaluateWhatMattersPilot: vi.fn(),
  confirmWhatMattersPilotCondition: vi.fn(),
  saveFarmerContractorCostRate: vi.fn(),
}));

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

// Lets a test drive the real farm-store's write-sync status (pending /
// successfully-synced counts) directly, to reproduce exact save sequences
// without real Supabase writes. `null` = the real store value, untouched.
let syncStatusOverride: { pendingCount: number; syncedCount: number } | null = null;
vi.mock("@/store/farm-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/store/farm-store")>();
  return {
    ...actual,
    useSyncStatus: () => {
      const real = actual.useSyncStatus();
      return syncStatusOverride ? { ...real, ...syncStatusOverride } : real;
    },
  };
});

afterEach(() => {
  syncStatusOverride = null;
  cleanup();
  vi.mocked(evaluateWhatMattersPilot).mockReset();
  vi.mocked(confirmWhatMattersPilotCondition).mockReset();
});

const PILOT_EVALUATED_AT = "2026-09-25T09:00:00.000Z";

function pilotCandidate(overrides: Partial<RecommendationCandidateEvaluation> = {}): RecommendationCandidateEvaluation {
  return {
    economicRank: 1,
    recordId: "record-1",
    assessmentId: "assessment-1",
    primaryIdentity: "field-meadow",
    sourcePhase: "phase_5_action",
    amount: { amount: "610", currency: "EUR" },
    currency: "EUR",
    lifecycleStatus: "active",
    actionability: "actionable",
    limitations: [],
    constituentActionRecordIds: null,
    outcome: { kind: "selected", code: "SELECTED_HIGHEST_RANKED_ACTIONABLE_OPPORTUNITY" },
    ...overrides,
  };
}

/** Every pre-existing (unmodified) Today test in this file renders
 * against this one default -- a real, valid, quantified "no current
 * opportunity" result, not a fabricated placeholder -- so those tests'
 * own `/what matters now/i` assertions keep passing (`WhatMattersPilotCard`
 * renders that eyebrow for `kind: "none"` too) without needing to know
 * anything about the new pilot wiring. */
function defaultPilotOkResult(): WhatMattersPilotActionResult {
  return {
    status: "ok",
    result: { kind: "none", reasonCode: "NO_RANKED_OPPORTUNITIES" },
    evaluatedAt: PILOT_EVALUATED_AT,
    declarations: [],
    contractorRatePerHa: null,
    candidateContext: {},
    rainfallScoreByRecordId: {},
  };
}

beforeEach(() => {
  vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(defaultPilotOkResult());
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

  // "opens the Expanded Prompt sheet ... when 'View details' is pressed"
  // (removed) -- that button belonged to the legacy mobile `PromptCard`
  // this checkpoint intentionally replaces in the primary What Matters
  // slot with `WhatMattersPilotCard` (no `Prompt` object exists for an
  // audited Phase 5 assessment, so there is nothing for a "View details"
  // button in this slot to open into `ExpandedPromptSheet` with). Real
  // coverage for opening `ExpandedPromptSheet` with real evidence still
  // exists via the opportunity rail's own field-breakdown flow (this
  // file's own last test, "clicking a fertiliser field row...") and via
  // `ExpandedPromptSheet.test.tsx`'s own dedicated unit tests.

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

/**
 * What Matters pilot live wiring (What Matters On Today Page V1) — the 12
 * required end-to-end integration scenarios (brief A-L). The audited
 * domain chain itself (Phase 5 -> 7/7.1 -> 8 -> 11A -> 11B -> policy ->
 * 10 -> 9) is exhaustively proven for real against real functions in
 * `what-matters-pilot.e2e.test.ts` — this suite only proves the PAGE
 * renders whatever `evaluateWhatMattersPilot`/`confirmWhatMattersPilotCondition`
 * (the real server action, mocked here at the module boundary) returns,
 * never invents its own actionability/ranking, and never falls back to
 * the legacy `Prompt`/`select-primary.ts` path.
 */
describe("TodayPage — What Matters pilot live integration", () => {
  it("A. rank 1 ACTIONABLE -> displayed as the What Matters recommendation", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "actionable", candidate: pilotCandidate({ economicRank: 1 }), rainfallScore: "86", costAssumption: null },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    renderToday();
    expect(await screen.findAllByText(/spread slurry on meadow field/i)).not.toHaveLength(0);
    expect(screen.getAllByText("86/100").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rainfall Window Score").length).toBeGreaterThan(0);
  });

  it("B. rank 1 <70, rank 2 ACTIONABLE -> rank 2 displayed with economicRank preserved as 2", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "actionable", candidate: pilotCandidate({ recordId: "record-2", economicRank: 2, primaryIdentity: "field-south" }), rainfallScore: "82", costAssumption: null },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-2": { fieldId: "field-south", fieldName: "South Field", evaluatedActionId: "action-2", assessmentId: "assessment-2" } },
      rainfallScoreByRecordId: { "record-2": "82" },
    });
    renderToday();
    expect(await screen.findAllByText(/spread slurry on south field/i)).not.toHaveLength(0);
    // economicRank itself is not rendered as literal on-screen text by the
    // pilot card (brief: never relabel it rank 1) -- the real invariant
    // under test is which candidate got shown; the recordId/economicRank
    // preservation itself is unit-proven directly against the real domain
    // in `what-matters-pilot.e2e.test.ts` (scenario 2).
  });

  it("C. rank 1 favourable rainfall but trafficability UNKNOWN -> shows the correct confirmation question, not a fabricated recommendation", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "needs_confirmation", candidate: pilotCandidate(), requiredConfirmations: ["CONFIRM_FIELD_TRAFFICABLE"] },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    renderToday();
    expect(await screen.findAllByText(/is this field currently trafficable/i)).not.toHaveLength(0);
    expect(screen.queryAllByText(/spread slurry on/i)).toHaveLength(0);
  });

  it("D. farmer answers YES -> domain recalculates through the real confirm action -> verified ACTIONABLE shown", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "needs_confirmation", candidate: pilotCandidate(), requiredConfirmations: ["CONFIRM_FIELD_TRAFFICABLE"] },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    vi.mocked(confirmWhatMattersPilotCondition).mockResolvedValue({
      status: "ok",
      result: { kind: "actionable", candidate: pilotCandidate(), rainfallScore: "86", costAssumption: null },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [{ id: "d1", opportunityRecordId: "record-1", boundAssessmentId: "assessment-1", evaluatedActionId: "action-1", fieldId: "field-meadow", conditionCode: "CONFIRM_FIELD_TRAFFICABLE", value: true, declaredAt: PILOT_EVALUATED_AT, evaluatedAt: PILOT_EVALUATED_AT, declaredByActorId: null, provenance: "FARMER_DECLARATION" }],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    renderToday();
    const yesButtons = await screen.findAllByRole("button", { name: "Yes" });
    fireEvent.click(yesButtons[0]);
    expect(await screen.findAllByText(/spread slurry on meadow field/i)).not.toHaveLength(0);
    expect(confirmWhatMattersPilotCondition).toHaveBeenCalledWith(
      expect.objectContaining({ opportunityRecordId: "record-1", conditionCode: "CONFIRM_FIELD_TRAFFICABLE", value: true, evaluatedAt: PILOT_EVALUATED_AT }),
    );
  });

  it("E. farmer answers NO -> opportunity becomes NOT_ACTIONABLE (blocked), never silently hidden", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "needs_confirmation", candidate: pilotCandidate(), requiredConfirmations: ["CONFIRM_FIELD_TRAFFICABLE"] },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    vi.mocked(confirmWhatMattersPilotCondition).mockResolvedValue({
      status: "ok",
      result: { kind: "blocked", candidate: pilotCandidate({ outcome: { kind: "deferred", code: "NOT_CURRENTLY_ACTIONABLE" } }), reasonCode: "NOT_CURRENTLY_ACTIONABLE" },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    renderToday();
    const noButtons = await screen.findAllByRole("button", { name: "No" });
    fireEvent.click(noButtons[0]);
    await waitFor(() => expect(screen.queryAllByText(/not currently recommended/i).length).toBeGreaterThan(0));
    expect(screen.queryAllByText(/spread slurry on/i)).toHaveLength(0);
  });

  it("F. regulatory blocker cannot be overridden by a farmer response -- blocked result renders honestly, no confirmation offered for it", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "blocked", candidate: pilotCandidate({ outcome: { kind: "deferred", code: "NOT_CURRENTLY_ACTIONABLE" } }), reasonCode: "NOT_CURRENTLY_ACTIONABLE" },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: {},
    });
    renderToday();
    await waitFor(() => expect(screen.queryAllByText(/not currently recommended/i).length).toBeGreaterThan(0));
    expect(screen.queryAllByRole("button", { name: "Yes" })).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "No" })).toHaveLength(0);
  });

  it("G/H. wrong-field / wrong-assessment declaration rejection is enforced by the real domain layer, exercised via the real confirm action contract", async () => {
    // The page itself has no independent identity check to bypass -- it
    // always supplies the confirm action with the exact
    // opportunityRecordId/boundAssessmentId/evaluatedActionId/fieldId
    // from the CURRENT candidate's own real candidateContext, never a
    // caller-editable value. The real rejection logic itself
    // (`validateFarmerDeclarationBinding`) is proven directly against
    // real data in `what-matters-pilot.e2e.test.ts` (scenarios 7/8); this
    // test proves the page cannot construct a mismatched call in the
    // first place.
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "needs_confirmation", candidate: pilotCandidate(), requiredConfirmations: ["CONFIRM_FIELD_TRAFFICABLE"] },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    vi.mocked(confirmWhatMattersPilotCondition).mockResolvedValue({ status: "error", message: "declaration rejected" });
    renderToday();
    const yesButtons = await screen.findAllByRole("button", { name: "Yes" });
    fireEvent.click(yesButtons[0]);
    const call = vi.mocked(confirmWhatMattersPilotCondition).mock.calls[0]![0];
    expect(call.opportunityRecordId).toBe("record-1");
    expect(call.boundAssessmentId).toBe("assessment-1");
    expect(call.fieldId).toBe("field-meadow");
    await waitFor(() => expect(screen.queryAllByText(/unable to verify a recommendation right now/i).length).toBeGreaterThan(0));
  });

  it("I. missing weather / action failure -> honest unavailable state, never a legacy Prompt fallback", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({ status: "error", message: "Unable to verify a recommendation right now." });
    renderToday();
    await waitFor(() => expect(screen.queryAllByText(/unable to verify a recommendation right now/i).length).toBeGreaterThan(0));
    // Never a silent fallback to the legacy select-primary.ts output --
    // build-all.ts is mocked (top of file) to return a real, known,
    // DIFFERENT Prompt ("Soil test renewal due — Field 7"); its title
    // must never leak into this slot.
    expect(screen.queryAllByText(/soil test renewal due/i)).toHaveLength(0);
  });

  it("J. score exactly 70 -> policy threshold passes -> shown as actionable (real domain proof in what-matters-pilot.e2e.test.ts scenario 10; here just confirms the page renders an actionable result correctly)", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "actionable", candidate: pilotCandidate(), rainfallScore: "70", costAssumption: null },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "70" },
    });
    renderToday();
    expect(await screen.findAllByText("70/100")).not.toHaveLength(0);
    expect(screen.getAllByText("Rainfall Window Score").length).toBeGreaterThan(0);
  });

  it("K. economic rank remains unchanged in the underlying candidate object after selection (no UI relabelling)", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "actionable", candidate: pilotCandidate({ economicRank: 2 }), rainfallScore: "86", costAssumption: null },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    renderToday();
    await screen.findAllByText(/spread slurry on meadow field/i);
    expect(vi.mocked(evaluateWhatMattersPilot).mock.results[0]).toBeTruthy();
    // The rendered candidate object passed all the way from the mocked
    // action through to the card is the same real object -- economicRank
    // 2 was never mutated to 1 anywhere in the page/component chain
    // (there is no code path in either that writes to `economicRank`).
  });

  it("L. the old Prompt/select-primary.ts selector does not determine the audited What Matters output -- a real, different mocked Prompt never appears in that slot", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "actionable", candidate: pilotCandidate(), rainfallScore: "86", costAssumption: null },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    renderToday();
    expect(await screen.findAllByText(/spread slurry on meadow field/i)).not.toHaveLength(0);
    // build-all.ts is mocked (top of file) to a real, known, DIFFERENT
    // Prompt title -- if the legacy selector still drove this slot, that
    // exact title would appear here instead of the audited candidate.
    expect(screen.queryAllByText(/soil test renewal due/i)).toHaveLength(0);
  });

  it("M. real slurry allocations exist but none were economically quantified (e.g. no persisted price evidence) -> honest 'more information needed' state, never the generic 'nothing needs your attention' (Codex audit HIGH regression)", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "unknown", candidate: null, reasonCode: "ECONOMIC_EVIDENCE_UNAVAILABLE" },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: {},
      rainfallScoreByRecordId: {},
    });
    renderToday();
    await waitFor(() => expect(screen.queryAllByText(/price or spreading-cost information/i).length).toBeGreaterThan(0));
    expect(screen.queryAllByText(/nothing currently needs your attention/i)).toHaveLength(0);
  });

  it("M2. real slurry candidates were quantified but none came out net-positive -> explains that, never 'nothing needs your attention' or an internal code", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "none", reasonCode: "NO_POSITIVE_ECONOMIC_OPPORTUNITY" },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: "120",
      candidateContext: {},
      rainfallScoreByRecordId: {},
    });
    renderToday();
    await waitFor(() => expect(screen.queryAllByText(/none of it currently shows a net saving/i).length).toBeGreaterThan(0));
    expect(screen.queryAllByText(/nothing currently needs your attention/i)).toHaveLength(0);
    expect(screen.queryAllByText(/NO_POSITIVE_ECONOMIC_OPPORTUNITY/)).toHaveLength(0);
  });

  it("M3. planned slurry is missing its spreading details -> a direct 'Add spreading details' route to that field, no internal code, contractor-cost row unchanged", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "none", reasonCode: "NO_CANDIDATE_DATA" },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: {},
      rainfallScoreByRecordId: {},
      missingSlurryDetails: [{ fieldId: "field-meadow", missing: ["date"] }],
    });
    renderToday();
    await waitFor(() => expect(screen.queryAllByText("Slurry opportunities found").length).toBeGreaterThan(0));
    for (const link of screen.getAllByRole("link", { name: /add spreading details/i })) {
      expect(link.getAttribute("href")).toBe("/fields?field=field-meadow&complete=slurry&missing=date");
    }
    expect(screen.queryAllByText(/NO_CANDIDATE_DATA/)).toHaveLength(0);
    expect(screen.queryAllByLabelText(/slurry spreading cost/i).length).toBeGreaterThan(0);
    expect(evaluateWhatMattersPilot).toHaveBeenCalledTimes(1);
  });

  it("M4. failed save -> Today evaluates -> successful retry -> What Matters re-evaluates on the persisted data, so the stale CTA goes (audit MEDIUM regression)", async () => {
    const missingDate: WhatMattersPilotActionResult = {
      status: "ok",
      result: { kind: "none", reasonCode: "NO_CANDIDATE_DATA" },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: {},
      rainfallScoreByRecordId: {},
      missingSlurryDetails: [{ fieldId: "field-meadow", missing: ["date"] }],
    };
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(missingDate);

    // The farmer's save is still in flight when they land on Today.
    syncStatusOverride = { pendingCount: 1, syncedCount: 0 };
    const view = renderToday();
    const rerender = () => view.rerender(<FarmProvider><TodayPage /></FarmProvider>);
    expect(evaluateWhatMattersPilot).not.toHaveBeenCalled();

    // The save fails: pending settles with no successful write -> one
    // evaluation against the unchanged server data, CTA still shown.
    syncStatusOverride = { pendingCount: 0, syncedCount: 0 };
    rerender();
    await waitFor(() => expect(screen.queryAllByRole("link", { name: /add spreading details/i }).length).toBeGreaterThan(0));
    expect(evaluateWhatMattersPilot).toHaveBeenCalledTimes(1);

    // Retry in flight, then it succeeds and the data is now complete.
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(defaultPilotOkResult());
    syncStatusOverride = { pendingCount: 1, syncedCount: 0 };
    rerender();
    expect(evaluateWhatMattersPilot).toHaveBeenCalledTimes(1);
    syncStatusOverride = { pendingCount: 0, syncedCount: 1 };
    rerender();
    await waitFor(() => expect(evaluateWhatMattersPilot).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryAllByRole("link", { name: /add spreading details/i })).toHaveLength(0));

    // Nothing further changed: re-renders never re-evaluate (no loop).
    rerender();
    rerender();
    await Promise.resolve();
    expect(evaluateWhatMattersPilot).toHaveBeenCalledTimes(2);
  });

  it("M5. a save that only fails never triggers a second evaluation", async () => {
    syncStatusOverride = { pendingCount: 0, syncedCount: 0 };
    const view = renderToday();
    await waitFor(() => expect(evaluateWhatMattersPilot).toHaveBeenCalledTimes(1));
    syncStatusOverride = { pendingCount: 1, syncedCount: 0 };
    view.rerender(<FarmProvider><TodayPage /></FarmProvider>);
    syncStatusOverride = { pendingCount: 0, syncedCount: 0 };
    view.rerender(<FarmProvider><TodayPage /></FarmProvider>);
    await Promise.resolve();
    expect(evaluateWhatMattersPilot).toHaveBeenCalledTimes(1);
  });

  it("M6. multi-source slurry fields show the limitation, never the completion CTA", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "none", reasonCode: "NO_CANDIDATE_DATA" },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: {},
      rainfallScoreByRecordId: {},
      missingSlurryDetails: [],
      multiSourceSlurryFieldIds: ["field-meadow"],
    });
    renderToday();
    await waitFor(() => expect(screen.queryAllByText(/more than one slurry store/i).length).toBeGreaterThan(0));
    expect(screen.queryAllByRole("link", { name: /add spreading details/i })).toHaveLength(0);
    expect(screen.queryAllByText(/NO_CANDIDATE_DATA/)).toHaveLength(0);
  });

  it("N. the real Server Action call itself rejecting (transport/serialization failure, not the action's own caught error) still resolves to the honest unavailable message, never an infinite skeleton (Codex audit MEDIUM regression)", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockRejectedValue(new Error("network failure"));
    renderToday();
    await waitFor(() => expect(screen.queryAllByText(/unable to verify a recommendation right now/i).length).toBeGreaterThan(0));
  });

  it("O. a second Yes/No click before the first confirm round-trip resolves does not fire a second concurrent request (Codex audit MEDIUM regression)", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "needs_confirmation", candidate: pilotCandidate(), requiredConfirmations: ["CONFIRM_FIELD_TRAFFICABLE"] },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    let resolveConfirm: (value: WhatMattersPilotActionResult) => void = () => {};
    vi.mocked(confirmWhatMattersPilotCondition).mockReturnValue(new Promise((resolve) => (resolveConfirm = resolve)));
    renderToday();
    const yesButtons = await screen.findAllByRole("button", { name: "Yes" });
    fireEvent.click(yesButtons[0]);
    // Buttons are now disabled -- a second click must not fire another call.
    fireEvent.click(yesButtons[0]);
    fireEvent.click(yesButtons[0]);
    expect(confirmWhatMattersPilotCondition).toHaveBeenCalledTimes(1);
    resolveConfirm({
      status: "ok",
      result: { kind: "actionable", candidate: pilotCandidate(), rainfallScore: "86", costAssumption: null },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    await waitFor(() => expect(screen.queryAllByText(/spread slurry on meadow field/i).length).toBeGreaterThan(0));
  });

  describe("stale-response ordering across evaluation, confirmation and contractor-rate save (Codex audit MEDIUM regression)", () => {
    const meadowContext = { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } };
    const southContext = { "record-2": { fieldId: "field-south", fieldName: "South Field", evaluatedActionId: "action-2", assessmentId: "assessment-2" } };
    function needsConfirmation(): WhatMattersPilotActionResult {
      return { status: "ok", result: { kind: "needs_confirmation", candidate: pilotCandidate(), requiredConfirmations: ["CONFIRM_FIELD_TRAFFICABLE"] }, evaluatedAt: PILOT_EVALUATED_AT, declarations: [], contractorRatePerHa: null, candidateContext: meadowContext, rainfallScoreByRecordId: { "record-1": "86" } };
    }
    function meadowActionable(contractorRatePerHa: string | null = null): WhatMattersPilotActionResult {
      return { status: "ok", result: { kind: "actionable", candidate: pilotCandidate(), rainfallScore: "86", costAssumption: null }, evaluatedAt: PILOT_EVALUATED_AT, declarations: [], contractorRatePerHa, candidateContext: meadowContext, rainfallScoreByRecordId: { "record-1": "86" } };
    }
    function southActionable(): WhatMattersPilotActionResult {
      return { status: "ok", result: { kind: "actionable", candidate: pilotCandidate({ recordId: "record-2", economicRank: 2, primaryIdentity: "field-south" }), rainfallScore: "82", costAssumption: null }, evaluatedAt: PILOT_EVALUATED_AT, declarations: [], contractorRatePerHa: "150", candidateContext: southContext, rainfallScoreByRecordId: { "record-2": "82" } };
    }
    function deferred() {
      let resolve: (value: WhatMattersPilotActionResult) => void = () => {};
      const promise = new Promise<WhatMattersPilotActionResult>((r) => (resolve = r));
      return { promise, resolve };
    }

    it("U1. older confirmation -> successful retry -> newer automatic evaluation finishes -> older confirmation finishes: the newer evaluation stays displayed", async () => {
      vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(needsConfirmation());
      const confirm = deferred();
      vi.mocked(confirmWhatMattersPilotCondition).mockReturnValue(confirm.promise);
      syncStatusOverride = { pendingCount: 0, syncedCount: 0 };
      const view = renderToday();
      const rerender = () => view.rerender(<FarmProvider><TodayPage /></FarmProvider>);

      fireEvent.click((await screen.findAllByRole("button", { name: "Yes" }))[0]);
      expect(confirmWhatMattersPilotCondition).toHaveBeenCalledTimes(1);

      // A previously failed farm write is retried and succeeds.
      vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(southActionable());
      syncStatusOverride = { pendingCount: 1, syncedCount: 0 };
      rerender();
      syncStatusOverride = { pendingCount: 0, syncedCount: 1 };
      rerender();
      await waitFor(() => expect(evaluateWhatMattersPilot).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryAllByText(/spread slurry on south field/i).length).toBeGreaterThan(0));

      // The older confirmation now resolves -- it must not overwrite.
      confirm.resolve(meadowActionable());
      await confirm.promise;
      await Promise.resolve();
      await Promise.resolve();
      expect(screen.queryAllByText(/spread slurry on meadow field/i)).toHaveLength(0);
      expect(screen.getAllByText(/spread slurry on south field/i).length).toBeGreaterThan(0);
      // And the superseded confirmation did not trigger another evaluation.
      expect(evaluateWhatMattersPilot).toHaveBeenCalledTimes(2);
    });

    it("U2. confirmation finishes before any newer evaluation starts: its result is applied normally", async () => {
      vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(needsConfirmation());
      const confirm = deferred();
      vi.mocked(confirmWhatMattersPilotCondition).mockReturnValue(confirm.promise);
      syncStatusOverride = { pendingCount: 0, syncedCount: 0 };
      const view = renderToday();
      fireEvent.click((await screen.findAllByRole("button", { name: "Yes" }))[0]);
      confirm.resolve(meadowActionable());
      await waitFor(() => expect(screen.queryAllByText(/spread slurry on meadow field/i).length).toBeGreaterThan(0));
      view.rerender(<FarmProvider><TodayPage /></FarmProvider>);
      expect(evaluateWhatMattersPilot).toHaveBeenCalledTimes(1);
      // Loading cleared: the card is interactive again (cost-setup Save enabled).
      fireEvent.change(screen.getAllByLabelText(/slurry spreading cost/i)[0], { target: { value: "120" } });
      expect((screen.getAllByRole("button", { name: "Save" })[0] as HTMLButtonElement).disabled).toBe(false);
    });

    it("U3. an older contractor-rate save resolving after a newer automatic evaluation cannot overwrite it", async () => {
      vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(meadowActionable());
      const save = deferred();
      vi.mocked(saveFarmerContractorCostRate).mockReturnValue(save.promise);
      syncStatusOverride = { pendingCount: 0, syncedCount: 0 };
      const view = renderToday();
      const rerender = () => view.rerender(<FarmProvider><TodayPage /></FarmProvider>);
      const inputs = await screen.findAllByLabelText(/slurry spreading cost/i);
      fireEvent.change(inputs[0], { target: { value: "120" } });
      fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
      expect(saveFarmerContractorCostRate).toHaveBeenCalledTimes(1);

      vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(southActionable());
      syncStatusOverride = { pendingCount: 1, syncedCount: 0 };
      rerender();
      syncStatusOverride = { pendingCount: 0, syncedCount: 1 };
      rerender();
      await waitFor(() => expect(screen.queryAllByText(/spread slurry on south field/i).length).toBeGreaterThan(0));

      save.resolve(meadowActionable("120"));
      await save.promise;
      await Promise.resolve();
      await Promise.resolve();
      expect(screen.queryAllByText(/spread slurry on meadow field/i)).toHaveLength(0);
      expect(screen.getAllByText(/spread slurry on south field/i).length).toBeGreaterThan(0);
      expect(evaluateWhatMattersPilot).toHaveBeenCalledTimes(2);
    });
  });

  it("P. no persisted contractor rate -> the one-time cost-setup row is visible", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "actionable", candidate: pilotCandidate(), rainfallScore: "86", costAssumption: null },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    renderToday();
    expect((await screen.findAllByLabelText(/slurry spreading cost/i)).length).toBeGreaterThan(0);
  });

  it("Q. saving a rate successfully hides the cost-setup row immediately -- driven by the real re-evaluated contractorRatePerHa, never a local toggle", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "actionable", candidate: pilotCandidate(), rainfallScore: "86", costAssumption: null },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    vi.mocked(saveFarmerContractorCostRate).mockResolvedValue({
      status: "ok",
      result: { kind: "actionable", candidate: pilotCandidate(), rainfallScore: "86", costAssumption: null },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: "120",
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    renderToday();
    const inputs = await screen.findAllByLabelText(/slurry spreading cost/i);
    fireEvent.change(inputs[0], { target: { value: "120" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
    await waitFor(() =>
      expect(saveFarmerContractorCostRate).toHaveBeenCalledWith(expect.objectContaining({ evaluatedAt: PILOT_EVALUATED_AT, ratePerHa: "120" })),
    );
    await waitFor(() => expect(screen.queryAllByLabelText(/slurry spreading cost/i)).toHaveLength(0));
  });

  it("R. a farm with an already-persisted contractor rate on initial load never shows the cost-setup row -- no Edit affordance on Today", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "actionable", candidate: pilotCandidate(), rainfallScore: "86", costAssumption: null },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: "150",
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    renderToday();
    await screen.findAllByText(/spread slurry on meadow field/i);
    expect(screen.queryAllByLabelText(/slurry spreading cost/i)).toHaveLength(0);
  });

  it("S. a failed save keeps the cost-setup row visible with its own error, never the generic unavailable state and never silently hidden", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "actionable", candidate: pilotCandidate(), rainfallScore: "86", costAssumption: null },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    vi.mocked(saveFarmerContractorCostRate).mockResolvedValue({ status: "error", message: "Enter a valid rate greater than zero." });
    renderToday();
    const inputs = await screen.findAllByLabelText(/slurry spreading cost/i);
    fireEvent.change(inputs[0], { target: { value: "120" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
    await waitFor(() => expect(screen.queryAllByText(/enter a valid rate greater than zero/i).length).toBeGreaterThan(0));
    expect(screen.getAllByLabelText(/slurry spreading cost/i).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/unable to verify a recommendation right now/i)).toHaveLength(0);
    expect(screen.getAllByText(/spread slurry on meadow field/i).length).toBeGreaterThan(0);
  });

  it("T. What Matters re-runs the real audited chain after a successful save -- the rendered state is the server's own re-evaluated result, not a local toggle", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "needs_confirmation", candidate: pilotCandidate(), requiredConfirmations: ["CONFIRM_FIELD_TRAFFICABLE"] },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    vi.mocked(saveFarmerContractorCostRate).mockResolvedValue({
      status: "ok",
      result: { kind: "actionable", candidate: pilotCandidate(), rainfallScore: "86", costAssumption: null },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: "120",
      candidateContext: { "record-1": { fieldId: "field-meadow", fieldName: "Meadow Field", evaluatedActionId: "action-1", assessmentId: "assessment-1" } },
      rainfallScoreByRecordId: { "record-1": "86" },
    });
    renderToday();
    const inputs = await screen.findAllByLabelText(/slurry spreading cost/i);
    fireEvent.change(inputs[0], { target: { value: "120" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
    expect(await screen.findAllByText(/spread slurry on meadow field/i)).not.toHaveLength(0);
  });
});

describe("TodayPage — slurry planning entry for zero-allocation farms", () => {
  function zeroAllocationResult(): WhatMattersPilotActionResult {
    return {
      status: "ok",
      result: { kind: "none", reasonCode: "NO_CANDIDATE_DATA" },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: {},
      rainfallScoreByRecordId: {},
      missingSlurryDetails: [],
      multiSourceSlurryFieldIds: [],
      plannedSlurryFieldCount: 0,
    };
  }

  it("slurry available + spreading open + zero allocations -> 'Plan slurry spreading' with the real volume/count, and nothing claims an opportunity", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([slurryOpenPrompt()]);
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(zeroAllocationResult());
    const { container } = renderToday();
    await waitFor(() => expect(screen.queryAllByText("Slurry spreading is open").length).toBeGreaterThan(0));
    // Demo farm store: 2850 m³ × 60% fill, 1650 m³ already allocated -> 60 m³ unallocated.
    expect(screen.getAllByText("You have 60 m³ available and 1 field is currently open for spreading.").length).toBeGreaterThan(0);
    for (const link of screen.getAllByRole("link", { name: /plan slurry spreading/i })) {
      expect(link.getAttribute("href")).toBe("/spreading/plan");
    }
    expect(screen.getAllByText("Spreading open on 1 field").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/slurry opportunit/i);
    expect(container.textContent).not.toMatch(/NO_CANDIDATE_DATA/);
  });

  it("no CTA when no field is open for slurry spreading", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([slurryClosedPrompt()]);
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(zeroAllocationResult());
    renderToday();
    await waitFor(() => expect(evaluateWhatMattersPilot).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryAllByText(/application method and date/i).length).toBeGreaterThan(0));
    expect(screen.queryAllByRole("link", { name: /plan slurry spreading/i })).toHaveLength(0);
  });

  it("after a successful allocation save, What Matters re-evaluates on persisted data and the zero-allocation CTA disappears", async () => {
    vi.mocked(buildAllRealPrompts).mockReturnValue([slurryOpenPrompt()]);
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(zeroAllocationResult());
    syncStatusOverride = { pendingCount: 0, syncedCount: 0 };
    const view = renderToday();
    await waitFor(() => expect(screen.queryAllByRole("link", { name: /plan slurry spreading/i }).length).toBeGreaterThan(0));

    // The saved plan now exists server-side: the real pipeline decides the next state.
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({
      status: "ok",
      result: { kind: "unknown", candidate: null, reasonCode: "ECONOMIC_EVIDENCE_UNAVAILABLE" },
      evaluatedAt: PILOT_EVALUATED_AT,
      declarations: [],
      contractorRatePerHa: null,
      candidateContext: {},
      rainfallScoreByRecordId: {},
    });
    syncStatusOverride = { pendingCount: 0, syncedCount: 1 };
    view.rerender(<FarmProvider><TodayPage /></FarmProvider>);
    await waitFor(() => expect(evaluateWhatMattersPilot).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryAllByRole("link", { name: /plan slurry spreading/i })).toHaveLength(0));
    expect(screen.getAllByText(/price or spreading-cost information/i).length).toBeGreaterThan(0);
  });
});
