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
});
