import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pilot Integration P4 (DECISIONS D15) — the dedicated What Matters screen, the pilot navigation and the Ask AI rule.
 * The screen shows the one real evaluation (`evaluateWhatMattersPilot`, mocked here at the action boundary — its own
 * chain is covered in `what-matters-pilot.test.ts`) and says plainly when price evidence is missing.
 */

vi.mock("@/app/actions/what-matters-pilot", () => ({
  evaluateWhatMattersPilot: vi.fn(),
  confirmWhatMattersPilotCondition: vi.fn(),
  saveFarmerContractorCostRate: vi.fn(),
}));
vi.mock("@/store/farm-store", () => ({ useSyncStatus: () => ({ pendingCount: 0, syncedCount: 0 }) }));
vi.mock("@/components/shell/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <header>{title}</header> }));
vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: vi.fn(() => true) }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ push, refresh: vi.fn() }) }));

import { evaluateWhatMattersPilot, type WhatMattersPilotActionResult, type WhatMattersEvidenceSummary } from "@/app/actions/what-matters-pilot";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { RecommendationCandidateEvaluation } from "@/domain/recommendation-selection";
import { AskAIButton } from "@/components/next/AskAI";
import { moreNavItems, pilotHiddenNavItems, primaryNavItems } from "@/components/shell/nav-items";
import WhatMattersPage from "./page";
import RootPage from "@/app/page";
import { HOME_ROUTE } from "@/lib/home-route";
import { PRICE_EVIDENCE_UNAVAILABLE, WhatMattersScreen } from "./WhatMattersScreen";

const NO_PRICES: WhatMattersEvidenceSummary = {
  fertiliserPrices: [
    { product: "0-7-30", state: "UNAVAILABLE" },
    { product: "18-6-12", state: "UNAVAILABLE" },
    { product: "Protected Urea", state: "UNAVAILABLE" },
  ],
};
const PRICES: WhatMattersEvidenceSummary = {
  fertiliserPrices: [
    { product: "0-7-30", state: "AVAILABLE", referencePeriod: "2026-07", sourceSeriesLabel: "Compound 0-7-30" },
    { product: "18-6-12", state: "UNAVAILABLE" },
    { product: "Protected Urea", state: "AVAILABLE", referencePeriod: "2026-07", sourceSeriesLabel: "Urea (46% N)" },
  ],
};
const candidate: RecommendationCandidateEvaluation = {
  economicRank: 1, recordId: "record-1", assessmentId: "assessment-1", primaryIdentity: "field-meadow", sourcePhase: "phase_5_action",
  amount: { amount: "610", currency: "EUR" }, currency: "EUR", lifecycleStatus: "active", actionability: "actionable", limitations: [],
  constituentActionRecordIds: null, outcome: { kind: "selected", code: "SELECTED_HIGHEST_RANKED_ACTIONABLE_OPPORTUNITY" },
};
function ok(result: Extract<WhatMattersPilotActionResult, { status: "ok" }>["result"], extra: Partial<Extract<WhatMattersPilotActionResult, { status: "ok" }>> = {}): WhatMattersPilotActionResult {
  return { status: "ok", result, evaluatedAt: "2026-10-24T09:00:00.000Z", declarations: [], contractorRatePerHa: null, candidateContext: {}, rainfallScoreByRecordId: {}, evidence: NO_PRICES, ...extra };
}

beforeEach(() => {
  vi.mocked(isSupabaseConfigured).mockReturnValue(true);
  vi.mocked(evaluateWhatMattersPilot).mockReset();
  push.mockClear();
});
afterEach(() => cleanup());

describe("Pilot P4 — What Matters screen (real evidence only)", () => {
  it("missing price evidence is said plainly, next to the evaluation's own reason — never an empty 'nothing to do'", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(ok({ kind: "unknown", candidate: null, reasonCode: "ECONOMIC_EVIDENCE_UNAVAILABLE" }));
    render(<WhatMattersScreen mode="REAL" />);
    expect(await screen.findByText(PRICE_EVIDENCE_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByText(/doesn't yet have the price or spreading-cost information/)).toBeInTheDocument();
    expect(screen.getByText(/No contractor rate is on record yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing currently needs your attention/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/€\s?\d/);
  });

  it("lists the real CSO series and period for each price on record, and which are missing", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(ok({ kind: "none", reasonCode: "NO_POSITIVE_ECONOMIC_OPPORTUNITY" }, { evidence: PRICES, contractorRatePerHa: "45" }));
    render(<WhatMattersScreen mode="REAL" />);
    expect(await screen.findByText("0-7-30: Compound 0-7-30, 2026-07")).toBeInTheDocument();
    expect(screen.getByText("18-6-12: no current price on record")).toBeInTheDocument();
    expect(screen.getByText("Your contractor rate on record: €45/ha.")).toBeInTheDocument();
    expect(screen.queryByText(PRICE_EVIDENCE_UNAVAILABLE)).toBeNull();
  });

  it("a real recommendation shows why and what to do, and its details open the field", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(
      ok({ kind: "actionable", candidate, rainfallScore: "86", costAssumption: null }, { evidence: PRICES, candidateContext: { "record-1": { fieldId: "f-meadow", fieldName: "Meadow", evaluatedActionId: "a1", assessmentId: "assessment-1" } } }),
    );
    render(<WhatMattersScreen mode="REAL" />);
    const card = await screen.findByRole("button", { name: /Spread slurry on Meadow/ });
    fireEvent.click(card);
    expect(push).toHaveBeenCalledWith("/fields?field=f-meadow");
  });

  it("a failed evaluation is 'unable to verify', with nothing recommended in its place", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue({ status: "error", message: "Unable to verify a recommendation right now." });
    render(<WhatMattersScreen mode="REAL" />);
    expect(await screen.findByText("Unable to verify a recommendation right now.")).toBeInTheDocument();
    expect(screen.queryByText(/Evidence used/i)).toBeNull();
  });

  it("links to where the farmer acts", async () => {
    vi.mocked(evaluateWhatMattersPilot).mockResolvedValue(ok({ kind: "none", reasonCode: "NO_CANDIDATE_DATA" }));
    render(<WhatMattersScreen mode="REAL" />);
    await waitFor(() => expect(evaluateWhatMattersPilot).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: /Fields: spreading plans/ })).toHaveAttribute("href", "/fields");
    expect(screen.getByRole("link", { name: /Farm map/ })).toHaveAttribute("href", "/today");
    expect(screen.getByRole("link", { name: /Records/ })).toHaveAttribute("href", "/records");
  });

  it("demo mode evaluates nothing and says there is no farm to evaluate", () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    const el = WhatMattersPage();
    expect(isValidElement<{ mode: string }>(el) && el.props.mode).toBe("DEMO");
    render(el);
    expect(screen.getByText(/no farm records to evaluate/)).toBeInTheDocument();
    expect(evaluateWhatMattersPilot).not.toHaveBeenCalled();
  });

  it("signed in, the route renders the real screen", () => {
    const el = WhatMattersPage();
    expect(isValidElement<{ mode: string }>(el) && el.props.mode).toBe("REAL");
  });
});

describe("Pilot P4 — navigation", () => {
  const appDir = path.join(process.cwd(), "src/app/(app)");
  const routeExists = (href: string) => existsSync(path.join(appDir, href.split("?")[0], "page.tsx"));

  it("every pilot navigation entry is a real route — no placeholders, no dead links", () => {
    for (const item of [...primaryNavItems, ...moreNavItems]) {
      expect(item.placeholderNote, item.href).toBeUndefined();
      expect(routeExists(item.href), item.href).toBe(true);
    }
  });

  it("Farm + Fields redesign: the primary destinations are Farm, Plan, Cattle, Housing, Finance and Records; What Matters stays reachable under More", () => {
    expect(primaryNavItems.map((i) => i.href)).toEqual(["/today", "/plan", "/cattle", "/housing", "/finance", "/records"]);
    expect(moreNavItems.map((i) => i.href)).toContain("/what-matters");
    expect(routeExists("/what-matters")).toBe(true);
  });

  it("a signed-in farmer lands on Farm (not the older Dashboard, not Cattle, not Finance)", () => {
    expect(HOME_ROUTE).toBe("/today");
    let digest = "";
    try {
      RootPage();
    } catch (e) {
      digest = String((e as { digest?: string }).digest);
    }
    expect(digest).toMatch(/^NEXT_REDIRECT;[a-z]+;\/today;/);
  });

  it("screens outside the pilot are kept (they still exist) but not advertised", () => {
    const shown = new Set([...primaryNavItems, ...moreNavItems].map((i) => i.href));
    for (const item of pilotHiddenNavItems) {
      expect(shown.has(item.href), item.href).toBe(false);
      expect(routeExists(item.href), item.href).toBe(true);
    }
    // Finance became first-level in the Farm + Fields redesign.
    expect(pilotHiddenNavItems.map((i) => i.href)).toEqual(expect.arrayContaining(["/silage", "/feed-optimiser", "/input-planner", "/dashboard"]));
    expect(pilotHiddenNavItems.map((i) => i.href)).not.toContain("/finance");
    expect([...shown].some((h) => h.startsWith("/livestock"))).toBe(false);
  });
});

describe("Pilot P4 — Ask AI isn't offered to a signed-in farm (no provider is connected)", () => {
  it("renders nothing when signed-in mode is configured", () => {
    render(<AskAIButton context={{ screen: "Farm", facts: {} }} />);
    expect(screen.queryByText("Ask AI")).toBeNull();
  });

  it("the demonstration keeps it, with its honest note", () => {
    vi.mocked(isSupabaseConfigured).mockReturnValue(false);
    render(<AskAIButton context={{ screen: "Farm", facts: {} }} />);
    fireEvent.click(screen.getByText("Ask AI"));
    expect(screen.getAllByText(/isn't connected yet/).length).toBeGreaterThan(0);
  });
});
