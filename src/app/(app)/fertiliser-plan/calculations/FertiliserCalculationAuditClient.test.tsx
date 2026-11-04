import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/fertiliser-plan-overview", () => ({
  getFertiliserPlanOverviewAction: vi.fn(),
}));
vi.mock("@/app/actions/fertiliser-plan", () => ({
  getFieldFertiliserStatusAction: vi.fn(),
}));
vi.mock("@/components/shell/PageHeader", () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => <div><h1>{title}</h1><p>{subtitle}</p></div>,
}));

import { getFertiliserPlanOverviewAction } from "@/app/actions/fertiliser-plan-overview";
import { getFieldFertiliserStatusAction } from "@/app/actions/fertiliser-plan";
import { FertiliserCalculationAuditClient } from "./FertiliserCalculationAuditClient";

const mockOverview = vi.mocked(getFertiliserPlanOverviewAction);
const mockFieldStatus = vi.mocked(getFieldFertiliserStatusAction);

describe("FertiliserCalculationAuditClient P4", () => {
  it("renders the P3 engine trace and never reconstructs the legacy LU/ha stocking maths", async () => {
    mockOverview.mockResolvedValue({
      farmName: "Test Farm",
      seasonLabel: "2026",
      fieldBreakdown: [{ fieldId: "f1", fieldName: "Back Meadow", areaHa: 5, status: "OK" }],
      nutrientRequirementKg: { n: 500, p: 85, k: 342.5, fieldsIncluded: 1 },
    } as never);

    mockFieldStatus.mockResolvedValue({
      status: "ok",
      engineVersion: "grass_fertiliser_engine_v2.0.0",
      cropSystem: "GRASS_GRAZING",
      requirementKgHa: { n: 75, p: 17, k: 68.5 },
      organicCreditsKgHa: { n: 10, p: 2, k: 12 },
      confirmedAppliedKgHa: { n: 5, p: 0, k: 0 },
      remainingKgHa: { n: 60, p: 15, k: 56.5 },
      recommendedProducts: [],
      ruleTraces: {
        n: {
          ruleId: "TEAGASC_GREEN_BOOK_2020_TABLE_12_3_SUCKLER_CALF_TO_BEEF",
          source: "Teagasc Major & Micro Nutrient Advice for Productive Agricultural Crops",
          sourceVersion: "5th Edition 2020",
          inputs: {
            annualOrganicNStockingRateKgHa: 118,
            lowerOrganicN: 118,
            upperOrganicN: 118,
            interpolationFraction: 0,
          },
          resultKgHa: 75,
          method: "linear interpolation between published organic-N stocking-rate rows; clamped at published endpoints",
        },
      },
      limitations: ["Grazing N interpolation is disclosed."],
      confirmedApplications: 0,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });

    render(<FertiliserCalculationAuditClient fieldId="f1" />);

    expect(await screen.findByText("grass_fertiliser_engine_v2.0.0")).toBeTruthy();
    expect(screen.getByText("Annual organic-N stocking rate")).toBeTruthy();
    expect(screen.getAllByText("118.00 kg/ha").length).toBeGreaterThan(0);
    expect(screen.getByText(/TEAGASC_GREEN_BOOK_2020_TABLE_12_3/)).toBeTruthy();
    expect(screen.getByText("75.00 − 10.00 − 5.00 = 60.00 kg N/ha")).toBeTruthy();
    expect(screen.queryByText(/LU\/ha/i)).toBeNull();
  });

  it("shows the 3 m surface-water strip subtraction and sizes product kg to the chemical area", async () => {
    mockOverview.mockResolvedValue({
      farmName: "Test Farm",
      seasonLabel: "2027",
      fieldBreakdown: [{ fieldId: "f1", fieldName: "River Field", areaHa: 1, status: "OK" }],
      nutrientRequirementKg: { n: 125, p: 20, k: 90, fieldsIncluded: 1 },
    } as never);
    mockFieldStatus.mockResolvedValue({
      status: "ok",
      engineVersion: "grass_fertiliser_engine_v2.0.0",
      cropSystem: "GRASS_FIRST_CUT_SILAGE",
      requirementKgHa: { n: 125, p: 20, k: 90 },
      organicCreditsKgHa: { n: 0, p: 0, k: 0 },
      confirmedAppliedKgHa: { n: 0, p: 0, k: 0 },
      remainingKgHa: { n: 125, p: 20, k: 90 },
      waterStrip: {
        chemicalAreaHa: 0.97,
        excludedStripHa: 0.03,
        ruleId: "SI_588_2025_ART_18_1_CHEMICAL_FERTILISER_3M_SURFACE_WATER",
        source: "S.I. No. 588 of 2025, Article 18(1)",
      },
      recommendedProducts: [{ name: "CAN", npkAnalysis: "27-0-0", rateKgHa: 463, totalKg: 449.11, costEur: 0 }],
      ruleTraces: {},
      limitations: [],
      confirmedApplications: 0,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });

    render(<FertiliserCalculationAuditClient fieldId="f1" />);

    expect(
      await screen.findByText(/1\.00 ha − 0\.03 ha within 3 m of surface water = 0\.97 ha \(S\.I\. No\. 588 of 2025, Article 18\(1\)/),
    ).toBeTruthy();
    expect(screen.getByText("463.00 kg/ha × 0.97 ha = 449.11 kg")).toBeTruthy();
  });

  it("F007: shows the slurry credit's calculation basis — allocation, method, date, area, DM evidence, rule and source", async () => {
    mockOverview.mockResolvedValue({
      farmName: "Test Farm",
      seasonLabel: "2026",
      fieldBreakdown: [{ fieldId: "f1", fieldName: "Back Meadow", areaHa: 4.2, status: "OK" }],
      nutrientRequirementKg: { n: 0, p: 0, k: 0, fieldsIncluded: 1 },
    } as never);
    mockFieldStatus.mockResolvedValue({
      status: "ok",
      engineVersion: "grass_fertiliser_engine_v2.0.0",
      cropSystem: "GRASS_FIRST_CUT_SILAGE",
      requirementKgHa: { n: 100, p: 40, k: 175 },
      organicCreditsKgHa: { n: 5, p: 3, k: 20 },
      confirmedAppliedKgHa: { n: 0, p: 0, k: 0 },
      remainingKgHa: { n: 95, p: 37, k: 155 },
      organicCreditBasis: {
        calculationVersion: "nutrient_engine_v1.5.0",
        allocation: {
          fieldId: "f1",
          housingId: "h1",
          volumeM3: 42,
          contributing: [
            {
              housingId: "h1",
              volumeM3: 42,
              source: { kind: "PHYSICAL_RESERVATION", allocationId: "alloc-7", planRevision: 3 },
              compositionRecordId: "comp-1",
            },
          ],
        },
        applicationMethod: {
          value: "LESS",
          status: "farmer_adjusted",
          source: "Keith",
          sourceDate: "2026-02-10",
          history: [{ value: "splashplate", status: "estimated", source: "Farm Return automatic slurry planning" }],
        },
        applicationDate: { value: "2026-03-15", status: "farmer_adjusted", source: "Keith", history: [] },
        lessTrigger: {
          status: "RESOLVED",
          referenceYear: "2025",
          gsrKgNHa: 140,
          evidenceStatus: "verified",
          source: "DAFM Nitrates Statement 2025",
          recordedAt: "2026-01-20T09:00:00.000Z",
          recordId: "gsr-1",
          orderBasis: "DATABASE_RECORD_ORDER",
          version: "preceding_year_gsr_v1.1.1",
        },
        spreadableArea: {
          areaHa: 2.1,
          grossAreaHa: 4.2,
          basis: "SPREADABLE_AREA_DECLARATION",
          recordId: "area-1",
          source: "Farmer mapped no-spread areas",
          effectiveDate: "2026-02-01",
          version: "slurry_spreadable_area_v1.0.0",
        },
        applicationRateM3ha: 20,
        dryMatter: {
          dmPct: 6,
          status: "farmer_adjusted",
          source: "Farmer estimate",
          sourceDate: "2026-01-01",
          compositionRecordId: "comp-1",
          compositionVersion: "slurry_composition_v1.0.0",
        },
        rule: {
          ruleId: "SPRING_LESS_SLURRY_TABLE",
          source: "Teagasc spring LESS table",
          timingCategory: "SPRING",
          timingAssumed: false,
          soilIndexAdjustmentApplied: { p: true, k: true },
          scientificBasisNote: "Spring application.",
        },
        evidenceState: "DERIVED",
        creditOnSpreadAreaKgHa: { n: 10, p: 6, k: 40 },
        fieldAverageCreditKgHa: { n: 5, p: 3, k: 20 },
      },
      recommendedProducts: [],
      ruleTraces: {},
      limitations: [],
      confirmedApplications: 0,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });

    render(<FertiliserCalculationAuditClient fieldId="f1" />);

    expect(await screen.findByText("42.0 m³ from store h1")).toBeTruthy();
    // Allocation identity/revision and composition reference.
    expect(screen.getByText(/42\.0 m³ from h1 · planned allocation alloc-7 rev 3 · composition record comp-1/)).toBeTruthy();
    // Tracked method/date: status, source, date and replaced values.
    expect(
      screen.getByText("LESS · farmer_adjusted · Keith (2026-02-10) · replaced splashplate (estimated, Farm Return automatic slurry planning)"),
    ).toBeTruthy();
    expect(screen.getByText("2026-03-15 · farmer_adjusted · Keith")).toBeTruthy();
    // The LESS decision's own preceding-year evidence.
    expect(screen.getByText(/2025 grassland stocking rate 140 kg N\/ha \(verified, DAFM Nitrates Statement 2025; record gsr-1\)/)).toBeTruthy();
    // The separate slurry nutrient engine that produced the credit.
    expect(screen.getByText("nutrient_engine_v1.5.0")).toBeTruthy();
    expect(screen.getByText(/record comp-1 · slurry_composition_v1\.0\.0/)).toBeTruthy();
    expect(screen.getByText(/2\.10 ha of 4\.20 ha after mapped no-spread areas .*record area-1/)).toBeTruthy();
    expect(screen.getByText("20.00 m³/ha on the spreading area")).toBeTruthy();
    expect(screen.getByText(/6% DM · farmer_adjusted · Farmer estimate \(2026-01-01\)/)).toBeTruthy();
    expect(screen.getByText(/SPRING_LESS_SLURRY_TABLE · Teagasc spring LESS table · spring timing/)).toBeTruthy();
    expect(
      screen.getByText("N 10.00 · P 6.00 · K 40.00 kg/ha on the spreading area = N 5.00 · P 3.00 · K 20.00 kg/ha across the field"),
    ).toBeTruthy();
  });

  it("calculates the audit for the requested planning season, not the current season", async () => {
    mockOverview.mockClear();
    mockFieldStatus.mockClear();
    mockOverview.mockResolvedValue({
      farmName: "Test Farm",
      seasonLabel: "2027",
      fieldBreakdown: [{ fieldId: "f1", fieldName: "Back Meadow", areaHa: 5, status: "OK" }],
      nutrientRequirementKg: { n: 0, p: 0, k: 0, fieldsIncluded: 0 },
    } as never);
    mockFieldStatus.mockResolvedValue({ status: "blocked", reasonCode: "MISSING_FIELD_PRODUCTION_CYCLE" } as never);

    render(<FertiliserCalculationAuditClient fieldId="f1" planningSeason="2027" />);

    expect(await screen.findByText(/Test Farm · 2027/)).toBeTruthy();
    expect(mockOverview).toHaveBeenCalledWith("2027");
    await vi.waitFor(() => expect(mockFieldStatus).toHaveBeenCalledWith("f1", "2027"));
  });
});
