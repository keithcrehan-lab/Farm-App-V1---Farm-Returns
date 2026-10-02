import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OrganicNutrientsCard } from "./OrganicNutrientsCard";
import type { NutrientPlan } from "@/domain/types";

afterEach(() => {
  cleanup();
});

/** A minimal, real-shaped `organicApplication` fixture — no slurry
 * allocated (`NOT_APPLICABLE`), matching the honest default for a field
 * with no contributing `SlurryAllocation`. */
function organic(overrides: Partial<NutrientPlan["organicApplication"]> = {}): NutrientPlan["organicApplication"] {
  return {
    rateM3ha: 0,
    totalM3: 0,
    offsetN: 0,
    offsetP: 0,
    offsetK: 0,
    dmPct: 6,
    dmPctEvidence: { status: "estimated", source: "Teagasc Table 9-1 national average" },
    availableNutrientAssessment: { status: "NOT_APPLICABLE", reasonCode: "NO_SLURRY_ALLOCATED" },
    availableNutrientByNutrient: {
      n: { status: "NOT_APPLICABLE", reasonCode: "NO_SLURRY_ALLOCATED" },
      p: { status: "NOT_APPLICABLE", reasonCode: "NO_SLURRY_ALLOCATED" },
      k: { status: "NOT_APPLICABLE", reasonCode: "NO_SLURRY_ALLOCATED" },
    },
    ...overrides,
  };
}

/**
 * Slurry Closed-Period Wiring V1 — `closedPeriod` is a new, optional prop
 * built by `NutrientsPageClient.tsx` from the real
 * `promptForSpreadingWindow`/`checkSpreadingWindowGate` gate (material
 * `organic_fertiliser_other_than_FYM`, S.I. 588/2025), never a
 * hand-rolled date check inside this component itself.
 */
describe("OrganicNutrientsCard — slurry closed-period disclosure", () => {
  it("renders nothing extra when closedPeriod is not supplied — every pre-existing caller/test keeps rendering unchanged", () => {
    render(<OrganicNutrientsCard organic={organic()} />);
    expect(screen.queryByText(/slurry spreading/i)).toBeNull();
  });

  it("discloses an OPEN slurry closed-period status with the real title/description from the gate, distinct wording from LEGAL_PROHIBITION", () => {
    render(
      <OrganicNutrientsCard
        organic={organic()}
        closedPeriod={{
          title: "Calendar open — Home Field",
          description: "As of 2026-09-19, Home Field is not inside the statutory closed period for organic fertiliser (other than farmyard manure).",
          status: "OK",
        }}
      />,
    );
    expect(screen.getByText("Slurry spreading open")).toBeTruthy();
    expect(screen.getByText("Calendar open — Home Field")).toBeTruthy();
    expect(screen.queryByText("Slurry spreading closed")).toBeNull();
  });

  it("discloses a CLOSED slurry closed-period status — a real, distinct legal prohibition, never the chemical-fertiliser wording", () => {
    render(
      <OrganicNutrientsCard
        organic={organic()}
        closedPeriod={{
          title: "Spreading window status needs review — Home Field",
          description: "Not permitted: organic fertiliser (other than farmyard manure) may not be applied to this field during the statutory closed period.",
          status: "LEGAL_PROHIBITION",
        }}
      />,
    );
    expect(screen.getByText("Slurry spreading closed")).toBeTruthy();
    expect(screen.getByText(/organic fertiliser \(other than farmyard manure\) may not be applied/i)).toBeTruthy();
    expect(screen.queryByText("Slurry spreading open")).toBeNull();
  });

  it("discloses an honest 'needs review' status for a non-OK, non-prohibited gate outcome (e.g. an unrecognised county), never a fabricated open/closed claim", () => {
    render(
      <OrganicNutrientsCard
        organic={organic()}
        closedPeriod={{
          title: "Spreading window status needs review — Home Field",
          description: "Not enough evidence yet (MISSING_COUNTY_ZONE) — missing: county.",
          status: "BLOCKED_INSUFFICIENT_EVIDENCE",
        }}
      />,
    );
    expect(screen.getByText("Slurry spreading status needs review")).toBeTruthy();
  });

  it("keeps the pre-existing available-nutrient assessment disclosure unchanged alongside the new closed-period block", () => {
    render(
      <OrganicNutrientsCard
        organic={organic()}
        closedPeriod={{ title: "Calendar open — Home Field", description: "As of 2026-09-19, open.", status: "OK" }}
      />,
    );
    // The pre-existing "no slurry applied" NOT_APPLICABLE arm renders
    // nothing for AvailableNutrientAssessment (see its own component) —
    // asserting the new block doesn't crowd it out or duplicate it.
    expect(screen.getByText("Slurry spreading open")).toBeTruthy();
    expect(screen.getByText("Dry matter used:")).toBeTruthy();
  });
});

/**
 * CC-B2 audit F004 — a supported LESS assessment blocked only because the
 * field's soil P and/or K Index is missing names the missing index, never
 * the dry-matter "no published match" explanation.
 */
describe("OrganicNutrientsCard — missing soil P/K index", () => {
  const DM_NO_MATCH = "The recorded slurry dry matter % has no exact match in the published table for this method/timing (no interpolation without validated evidence).";
  const blocked = (reasonCode: string, missingInputs: string[]) =>
    organic({
      rateM3ha: 33,
      totalM3: 99,
      offsetN: 33,
      availableNutrientAssessment: { status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode, missingInputs },
    });

  it.each([
    [["fertility.pIndex"], "This field's soil P index is missing, so the phosphorus and potassium credit from slurry isn't counted. Record the field's soil test to assess it."],
    [["fertility.kIndex"], "This field's soil K index is missing, so the phosphorus and potassium credit from slurry isn't counted. Record the field's soil test to assess it."],
    [
      ["fertility.pIndex", "fertility.kIndex"],
      "This field's soil P and K indices are missing, so the phosphorus and potassium credit from slurry isn't counted. Record the field's soil test to assess it.",
    ],
  ])("missing %j names the missing index, not the dry matter", (missingInputs, expected) => {
    render(<OrganicNutrientsCard organic={blocked("MISSING_SOIL_FERTILITY_INDEX", missingInputs)} />);
    expect(screen.getByText(expected)).toBeTruthy();
    expect(screen.queryByText(DM_NO_MATCH)).toBeNull();
    expect(screen.queryByText(/dry matter % has no exact match/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/MISSING_SOIL_FERTILITY_INDEX|fertility\.[pk]Index/);
  });

  it("an unsupported dry matter % keeps its existing explanation", () => {
    render(<OrganicNutrientsCard organic={blocked("BLOCK_NO_INTERPOLATION", ["slurry DM% matching a published spring/LESS table row (4, 6, 8, 10)"])} />);
    expect(screen.getByText(DM_NO_MATCH)).toBeTruthy();
    expect(screen.queryByText(/soil [PK]/)).toBeNull();
  });
});
