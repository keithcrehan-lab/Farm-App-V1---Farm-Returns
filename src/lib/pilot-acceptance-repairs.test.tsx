import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Pilot acceptance repairs (signed-in walkthrough, 2026-10-24): unknown live weight never shown as 0 kg; Supports
 * never shows internal tooling wording; Records names a decision's field; Plan shows readable material names. (The
 * headcount-only group link is covered in `src/server/cattle-real/one-cattle-product.test.tsx`.)
 */

vi.mock("@/app/actions/support-profile", () => ({ upsertSupportProfileFactAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/" }));

import type { LivestockGroup } from "@/domain/types";
import type { SupportProfile } from "@/domain/support-profile";
import { assessAllSchemes } from "@/domain/scheme-eligibility";
import { listSchemeVersions } from "@/domain/scheme-registry";
import type { DecisionRecord } from "@/lib/farm-data/mappers";
import type { Prompt } from "@/orchestration/prompt";
import { FarmProvider } from "@/store/farm-store";
import { SupportsPageClient } from "@/app/(app)/supports/SupportsPageClient";
import { ActivityTimelineCard } from "@/components/next/ActivityTimelineCard";
import { decisionFieldLabel } from "@/components/next/DecisionHistoryCard";
import { PromptListRow } from "@/components/next/PromptCard";
import { liveWeightLine, summariseLiveWeight } from "./livestock-live-weight";
import { RULES_UNVERIFIED_EXPLANATION, UNCHECKED_SOURCE_NOTE, farmerTextList, farmerWhyThisState, isInternalProvenanceText } from "./scheme-farmer-text";
import { farmerReadableText } from "./farmer-readable-codes";

afterEach(() => cleanup());

const group = (id: string, head: number, avgKg: number | null): LivestockGroup =>
  ({
    id,
    farmId: "farm-1",
    category: "weanling",
    label: id,
    count: { value: head, status: "verified", source: "Farmer" },
    ...(avgKg === null ? {} : { avgWeightKg: { value: avgKg, status: "farmer_adjusted", source: "Farmer" } }),
    system: "grazing",
    value: { value: 0, status: "estimated", source: "Farm Return assumption" },
  }) as LivestockGroup;
const kg = (n: number) => String(n);

describe("Defect 2 — live weight: UNKNOWN is never 0 kg", () => {
  it("no group has a recorded weight → 'not recorded', no total and no average", () => {
    const s = summariseLiveWeight([group("weanlings", 20, null)]);
    expect(s).toEqual({ state: "NOT_RECORDED" });
    expect(liveWeightLine(s, kg)).toBe("Live weight not recorded");
    expect(liveWeightLine(s, kg)).not.toMatch(/\b0 kg/);
  });

  it("some groups without a weight → the total and average cover only the weighed head, and say so", () => {
    const s = summariseLiveWeight([group("a", 10, 300), group("b", 20, null)]);
    expect(s).toEqual({ state: "PARTIAL", totalKg: 3000, avgKg: 300, weighedHead: 10, totalHead: 30 });
    expect(liveWeightLine(s, kg)).toBe("Live Weight 3000 kg · Avg 300 kg — for 10 of 30 head with a weight recorded");
  });

  it("a recorded 0 (or negative, or non-finite) weight is never a valid cattle weight", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(summariseLiveWeight([group("a", 10, bad)])).toEqual({ state: "NOT_RECORDED" });
    }
    expect(summariseLiveWeight([group("a", 10, 0), group("b", 5, 400)])).toEqual({ state: "PARTIAL", totalKg: 2000, avgKg: 400, weighedHead: 5, totalHead: 15 });
  });

  it("genuine weights still total and average correctly", () => {
    const s = summariseLiveWeight([group("a", 10, 300), group("b", 30, 500)]);
    expect(s).toEqual({ state: "COMPLETE", totalKg: 18000, avgKg: 450 });
    expect(liveWeightLine(s, kg)).toBe("Live Weight 18000 kg · Avg 450 kg");
    expect(summariseLiveWeight([])).toEqual({ state: "NOT_RECORDED" });
  });
});

describe("Polish 1 — Supports shows no internal tooling wording", () => {
  const profile: SupportProfile = {
    farmId: "farm-1",
    version: "support-profile-v1",
    derived: { countyLocation: "Galway", primaryEnterprises: ["suckler_beef"], totalMappedAreaHa: 13.7, forageAreaHa: 13.7, fieldsWithUnresolvedUse: 0, totalLivestockUnits: 18 },
    knownFacts: [],
    farmerFacts: {},
    gaps: [],
  };
  const INTERNAL = /this session|session's own|web ?search|web ?fetch|fetch tool|HTTP \d{3}|search result summary/i;

  it("the real registry does carry internal provenance (kept unchanged), so the guard is exercised", () => {
    const all = listSchemeVersions().flatMap((v) => v.knownLimitations);
    expect(all.some(isInternalProvenanceText)).toBe(true);
  });

  it("every scheme card, collapsed and expanded, is free of internal wording; unconfirmed schemes say so plainly", () => {
    const versions = listSchemeVersions();
    const assessments = assessAllSchemes(profile, versions, "2026-10-24T12:00:00.000Z");
    const names = Object.fromEntries(versions.map((v) => [v.schemeId, v.name]));
    render(
      <FarmProvider>
        <SupportsPageClient profile={profile} assessments={assessments} schemeNames={names} isDemoMode={false} />
      </FarmProvider>,
    );
    for (const name of Object.values(names)) {
      const card = screen.queryByText(name);
      if (card) fireEvent.click(card);
    }
    expect(document.body.textContent).not.toMatch(INTERNAL);
    if (assessments.some((a) => a.state === "RULES_UNVERIFIED")) expect(screen.getAllByText(RULES_UNVERIFIED_EXPLANATION).length).toBeGreaterThan(0);
  });

  it("internal notes become one plain note; ordinary text and other states pass unchanged", () => {
    expect(farmerTextList(["Uses HTTP 403 from this session's own fetch tool", "via a WebSearch result summary", "Needs your herd number"])).toEqual([UNCHECKED_SOURCE_NOTE, "Needs your herd number"]);
    expect(farmerWhyThisState({ state: "MORE_INFORMATION_REQUIRED", whyThisState: "Every requirement checked so far is met." })).toBe("Every requirement checked so far is met.");
  });
});

describe("Polish 2 — Records names a decision's field", () => {
  const decision = (fieldId: string): DecisionRecord =>
    ({
      id: `d-${fieldId}`,
      calculationKind: "spreading_window",
      outcome: "dismissed",
      fieldId,
      estimateSnapshot: { status: "UNKNOWN", reasonCode: "X" },
      calculationVersion: "v1",
      inputsSnapshot: undefined,
      decidedAt: "2026-09-25T10:00:00.000Z",
      createdAt: "2026-09-25T10:00:00.000Z",
    }) as unknown as DecisionRecord;
  const names = new Map([["a6a0a28d-174b-4a59-b932-1419bd22c7de", "Hill Field"]]);

  it("a known field shows its name, never the raw id; an unknown id is said truthfully, never named", () => {
    expect(decisionFieldLabel("a6a0a28d-174b-4a59-b932-1419bd22c7de", names)).toBe("Hill Field");
    expect(decisionFieldLabel("ffffffff-0000-4000-8000-000000000000", names)).toBe("A field that isn't on your farm's field list");
  });

  it("the Records timeline renders the name", () => {
    render(<ActivityTimelineCard entries={[{ type: "decision", decision: decision("a6a0a28d-174b-4a59-b932-1419bd22c7de") }]} fieldNames={names} />);
    expect(screen.getByText("Hill Field")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/a6a0a28d/);
  });
});

describe("Polish 3 — Plan shows readable material names and dates", () => {
  it("maps the closed-period codes and MM-DD windows; the rest of the text is unchanged", () => {
    expect(farmerReadableText("Not permitted: 2026-10-24 falls within the statutory closed period for organic_fertiliser_other_than_FYM in Zone B (10-01 - 01-15).")).toBe(
      "Not permitted: 2026-10-24 falls within the statutory closed period for slurry and other organic fertiliser (not farmyard manure) in Zone B (1 Oct – 15 Jan).",
    );
    expect(farmerReadableText("closed period for chemical_fertiliser in Zone B (09-15 - 01-29).")).toBe("closed period for chemical fertiliser in Zone B (15 Sep – 29 Jan).");
    expect(farmerReadableText("farmyard_manure")).toBe("farmyard manure");
    expect(farmerReadableText("Nothing to change here.")).toBe("Nothing to change here.");
  });

  it("a Plan row shows the readable text, not the code", () => {
    const prompt = { id: "p1", title: "Spreading window status needs review — Hill Field", description: "Not permitted: 2026-10-24 falls within the statutory closed period for chemical_fertiliser in Zone B (09-15 - 01-29)." } as unknown as Prompt;
    render(<PromptListRow prompt={prompt} onViewDetails={() => {}} />);
    expect(screen.getByText(/closed period for chemical fertiliser in Zone B \(15 Sep – 29 Jan\)/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/chemical_fertiliser|09-15/);
  });
});
