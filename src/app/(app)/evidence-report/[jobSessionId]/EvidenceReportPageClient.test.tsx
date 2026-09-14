import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/app/actions/scientific-evidence-report", () => ({ getScientificEvidenceReportAction: vi.fn() }));

import { FarmProvider } from "@/store/farm-store";
import { getScientificEvidenceReportAction } from "@/app/actions/scientific-evidence-report";
import { EvidenceReportPageClient } from "./EvidenceReportPageClient";
import type { Farm } from "@/domain/types";

const mockAction = vi.mocked(getScientificEvidenceReportAction);

const FARM: Farm = {
  id: "farm-1",
  name: "Test Farm",
  location: { county: "Cork", centroid: [0, 0] },
  primaryEnterprises: ["suckler_beef"],
  units: "metric",
  ownerName: "Farmer",
};

function renderPage() {
  return render(
    <FarmProvider remote initialState={{ farm: FARM, fields: [], livestockGroups: [], housing: [], slurryAllocations: [] }}>
      <EvidenceReportPageClient jobSessionId="session-1" />
    </FarmProvider>,
  );
}

function baseReport() {
  return {
    reportVersion: "scientific_evidence_report_v1.0.0",
    generatedAt: "2026-09-14T09:00:00Z",
    farm: { id: "farm-1", name: "Test Farm" },
    field: { id: "field-1", name: "Back Meadow", areaHa: 4.2, lpisRef: "IE-1234-5678", centroid: [0, 0] as [number, number] },
    compositeSample: {
      sampleId: "FR-SOIL-ABCD1234",
      jobSessionId: "session-1",
      fieldId: "field-1",
      samplingZoneId: "zone-1",
      coreCount: 22,
      representedAreaHa: 4.2,
      methodology: "standard_representative" as const,
      methodologyVersion: "soil_sampling_plan_v1.0.0",
      sampleDate: "2026-09-01T09:30:00Z",
      status: "lab_result_received" as const,
    },
    labStatus: {},
    isCurrentFertilityBasis: true,
    acceptedPlans: [],
    fieldFertiliserStatus: { status: "not_applicable" as const },
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EvidenceReportPageClient", () => {
  it("shows the real, honest reason when the sample cannot be found — never a fabricated report", async () => {
    mockAction.mockResolvedValue({ status: "not_found", reasonCode: "JOB_SESSION_NOT_FOUND" });
    renderPage();
    await waitFor(() => expect(screen.getByText(/could not be found on your farm/i)).toBeTruthy());
  });

  it("shows the real, honest reason when the sample is not yet confirmed", async () => {
    mockAction.mockResolvedValue({ status: "not_confirmed", reasonCode: "SAMPLE_NOT_YET_CONFIRMED" });
    renderPage();
    await waitFor(() => expect(screen.getByText(/has not been confirmed yet/i)).toBeTruthy());
  });

  it("renders the real field, composite sample and report identity for a genuine report", async () => {
    mockAction.mockResolvedValue(baseReport());
    renderPage();
    await waitFor(() => expect(screen.getByText("FR-SOIL-ABCD1234")).toBeTruthy());
    expect(screen.getByText("Back Meadow")).toBeTruthy();
    expect(screen.getByText("IE-1234-5678")).toBeTruthy();
    expect(screen.getByText("scientific_evidence_report_v1.0.0")).toBeTruthy();
  });

  it("shows the real lab result and interpretation when present, including the conservative-treatment disclosure", async () => {
    mockAction.mockResolvedValue({
      ...baseReport(),
      labStatus: {
        labResult: {
          id: "lab-1", farmId: "farm-1", jobSessionId: "session-1", fieldId: "field-1",
          laboratory: "Lab Co", labReportRef: "REF1", analysisDate: "2026-09-02", ph: 6.2, pMgL: 5.5, kMgL: 95,
          enteredBy: "farmer" as const, enteredAt: "2026-09-02T10:00:00Z", createdAt: "2026-09-02T10:00:00Z",
        },
        interpretation: {
          labResultId: "lab-1", methodologyVersion: "soil_interpretation_v1.0.0", calculatedAt: "2026-09-02T10:00:00Z",
          pIndexOutcome: { status: "AMBIGUOUS" as const, reasonCode: "AMBIGUOUS_STATUTORY_BOUNDARY", detail: "P value in statutory gap" },
          pIndex: 4, pIndexConservativeTreatment: true, kIndex: 3, pH: 6.2, cropGroup: "grassland" as const, soilMaterial: "mineral" as const,
        },
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("Lab Co")).toBeTruthy());
    expect(screen.getByText(/statutory boundary gap/i)).toBeTruthy();
  });

  it("discloses when a newer sample has superseded this one's fertility evidence — never implies it's still current", async () => {
    mockAction.mockResolvedValue({
      ...baseReport(),
      isCurrentFertilityBasis: false,
      labStatus: {
        labResult: {
          id: "lab-1", farmId: "farm-1", jobSessionId: "session-1", fieldId: "field-1",
          laboratory: "Lab Co", labReportRef: "REF1", analysisDate: "2026-09-02", ph: 6.2, pMgL: 5.5, kMgL: 95,
          enteredBy: "farmer" as const, enteredAt: "2026-09-02T10:00:00Z", createdAt: "2026-09-02T10:00:00Z",
        },
        interpretation: {
          labResultId: "lab-1", methodologyVersion: "soil_interpretation_v1.0.0", calculatedAt: "2026-09-02T10:00:00Z",
          pIndexOutcome: { status: "OK" as const, value: 2 as const, evidenceState: "MEASURED" as const }, pIndex: 2,
          pIndexConservativeTreatment: false, kIndex: 3, pH: 6.2, cropGroup: "grassland" as const, soilMaterial: "mineral" as const,
        },
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/newer soil test has since superseded/i)).toBeTruthy());
  });

  it("shows the real, honest unavailable reason instead of a fabricated nutrient plan", async () => {
    mockAction.mockResolvedValue({ ...baseReport(), nutrientPlanUnavailableReason: "This field's P/K Soil Index has not been recorded." });
    renderPage();
    await waitFor(() => expect(screen.getByText("This field's P/K Soil Index has not been recorded.")).toBeTruthy());
  });

  it("shows the real requirement/applied/remaining kg/ha field status when available", async () => {
    mockAction.mockResolvedValue({
      ...baseReport(),
      fieldFertiliserStatus: {
        status: "ok" as const,
        requirementKgHa: { n: 35, p: 4, k: 0 },
        confirmedAppliedKgHa: { n: 10, p: 0, k: 0 },
        remainingKgHa: { n: 25, p: 4, k: 0 },
        confirmedApplications: 1,
        applicationsWithUnknownComposition: 0,
        applicationsExcludedMultiField: 0,
        truncated: false,
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("35 / 4 / 0")).toBeTruthy());
    expect(screen.getByText("25 / 4 / 0")).toBeTruthy();
  });

  it("shows an honest 'couldn't load' disclosure on a genuine fetch failure — never silently renders nothing", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAction.mockRejectedValueOnce(new Error("network error"));
    renderPage();
    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalled());
    expect(screen.getByText(/couldn't check this report/i)).toBeTruthy();
    consoleErrorSpy.mockRestore();
  });

  it("toggles the raw JSON manifest on request — the same real report object, machine-reproducible", async () => {
    mockAction.mockResolvedValue(baseReport());
    renderPage();
    await waitFor(() => expect(screen.getByText("FR-SOIL-ABCD1234")).toBeTruthy());
    expect(screen.queryByText(/"reportVersion"/)).toBeNull();
    fireEvent.click(screen.getByText(/show machine-reproducible manifest/i));
    expect(screen.getByText(/"reportVersion"/)).toBeTruthy();
  });
});
