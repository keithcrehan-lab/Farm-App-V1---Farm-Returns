import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/app/actions/scientific-evidence-report", () => ({
  getScientificEvidenceReportAction: vi.fn(),
  getScientificEvidenceReportForFieldAction: vi.fn(),
}));

import { FarmProvider } from "@/store/farm-store";
import { getScientificEvidenceReportAction, getScientificEvidenceReportForFieldAction } from "@/app/actions/scientific-evidence-report";
import { EvidenceReportPageClient } from "./EvidenceReportPageClient";
import type { Farm, NutrientPlan } from "@/domain/types";

const mockAction = vi.mocked(getScientificEvidenceReportAction);
const mockFieldAction = vi.mocked(getScientificEvidenceReportForFieldAction);

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
    <FarmProvider remote initialState={{ farm: FARM, fields: [], livestockGroups: [], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}>
      <EvidenceReportPageClient jobSessionId="session-1" />
    </FarmProvider>,
  );
}

function renderFieldPage() {
  return render(
    <FarmProvider remote initialState={{ farm: FARM, fields: [], livestockGroups: [], housing: [], slurryAllocations: [], slurryCompositionRecords: [] }}>
      <EvidenceReportPageClient fieldId="field-1" />
    </FarmProvider>,
  );
}

function manualEntryReport() {
  const full = baseReport();
  return {
    ...full,
    compositeSample: undefined,
    manualEntry: {
      sampleRef: "SAL-2026-0113",
      sampleDate: "2026-08-20",
      laboratory: "Southern Agri Labs",
      pH: 6.23,
      p: 8.16,
      k: 95.4,
      limeRequirement: 2.5,
    },
  };
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
    fertilityBasisStatus: "current" as const,
    acceptedPlans: [],
    acceptedPlansTruncated: false,
    fieldFertiliserStatus: { status: "not_applicable" as const },
  };
}

function minimalPlan(): NutrientPlan {
  return {
    fieldId: "field-1",
    fertilityEvidence: { status: "OK", value: { pIndex: 2, kIndex: 3 }, evidenceState: "MEASURED" },
    fertilityEvidenceByNutrient: {
      p: { status: "OK", value: { index: 2 }, evidenceState: "MEASURED" },
      k: { status: "OK", value: { index: 3 }, evidenceState: "MEASURED" },
    },
    requirement: { value: { n: 35, p: 4, k: 0 }, status: "estimated", source: "Teagasc Green Book" },
    organicApplication: {
      rateM3ha: 0,
      totalM3: 0,
      offsetN: 0,
      offsetP: 0,
      offsetK: 0,
      dmPct: 6.3,
      dmPctEvidence: { status: "estimated", source: "Teagasc Green Book Table 9-1 (national average cattle slurry dry matter %)" },
      availableNutrientAssessment: { status: "NOT_APPLICABLE", reasonCode: "SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE" },
    },
    requirementProvisional: { isProvisional: false },
    netRequirement: { value: { n: 35, p: 4, k: 0 }, status: "estimated", source: "Teagasc Green Book" },
    purchasedProducts: [],
    deliveredKgHa: { n: 0, p: 0, k: 0 },
    napCompliance: { status: "NOT_APPLICABLE", reasonCode: "NAP_NOT_APPLICABLE" },
    statutoryManureValue: { status: "NOT_APPLICABLE", reasonCode: "NO_SLURRY_ALLOCATION" },
    commonageFertiliserGate: { status: "NOT_APPLICABLE", reasonCode: "COMMONAGE_GATE_NOT_APPLICABLE" },
    lessMethodCompliance: { status: "NOT_APPLICABLE", reasonCode: "LESS_GATE_NOT_APPLICABLE" },
    localBufferOverrideStatus: { status: "OK", value: "NATIONAL_BASELINE_APPLIES", evidenceState: "IRISH_DEFAULT" },
    nationalBufferDistanceStatus: { status: "NOT_APPLICABLE", reasonCode: "NATIONAL_BUFFER_GATE_NOT_APPLICABLE" },
    soilTestAgeValidity: { status: "NOT_APPLICABLE", reasonCode: "NOT_APPLICABLE_TO_THIS_SPECIFIC_RULE" },
    estimatedFieldCostEur: 0,
    calculationVersion: "nutrient_engine_v1.0.0",
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

  function labStatusWithInterpretation() {
    return {
      labResult: {
        id: "lab-1", farmId: "farm-1", jobSessionId: "session-1", fieldId: "field-1",
        laboratory: "Lab Co", labReportRef: "REF1", analysisDate: "2026-09-02", ph: 6.2, pMgL: 5.5, kMgL: 95,
        enteredBy: "farmer" as const, enteredAt: "2026-09-02T10:00:00Z", createdAt: "2026-09-02T10:00:00Z",
      },
      interpretation: {
        labResultId: "lab-1", methodologyVersion: "soil_interpretation_v1.0.0", calculatedAt: "2026-09-02T10:00:00Z",
        pIndexOutcome: { status: "OK" as const, value: 2 as const, evidenceState: "MEASURED" as const }, pIndex: 2 as const,
        pIndexConservativeTreatment: false, kIndex: 3 as const, pH: 6.2, cropGroup: "grassland" as const, soilMaterial: "mineral" as const,
      },
    };
  }

  it("discloses when a real, later-dated test has superseded this one's fertility evidence and a real current plan exists — never implies it's still current", async () => {
    mockAction.mockResolvedValue({
      ...baseReport(),
      fertilityBasisStatus: "superseded_by_newer_test" as const,
      nutrientPlan: minimalPlan(),
      labStatus: labStatusWithInterpretation(),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/later-dated soil test has since superseded/i)).toBeTruthy());
    expect(screen.getByText(/not necessarily this specific sample/i)).toBeTruthy();
  });

  it("discloses supersession honestly even when no real current plan exists at all — never claims fertility evidence the Nutrient Requirement doesn't have", async () => {
    mockAction.mockResolvedValue({
      ...baseReport(),
      fertilityBasisStatus: "superseded_by_newer_test" as const,
      labStatus: labStatusWithInterpretation(),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/later-dated soil test has since superseded/i)).toBeTruthy());
    expect(screen.getByText(/Nutrient Requirement is not currently available at all/i)).toBeTruthy();
  });

  // Codex audit HIGH (round 1): "unknown" must never be rendered as if
  // it were a confident "superseded" claim — the two need genuinely
  // distinct copy.
  it("discloses fertilityBasisStatus: unknown with its own distinct, honest copy and a real current plan — never the 'superseded' claim it cannot back", async () => {
    mockAction.mockResolvedValue({
      ...baseReport(),
      fertilityBasisStatus: "unknown" as const,
      nutrientPlan: minimalPlan(),
      labStatus: labStatusWithInterpretation(),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/does not establish whether this sample remains/i)).toBeTruthy());
    expect(screen.queryByText(/later-dated soil test has since superseded/i)).toBeNull();
    // Codex audit HIGH (round 2): the "unknown" copy must stay neutral
    // about WHY it's unknown — it covers both "no active evidence at
    // all" and "a real active test whose own date doesn't establish
    // supersession", and must never assert a specific reason (e.g. "no
    // dated evidence") that isn't true for every real case this status
    // can mean.
    expect(screen.queryByText(/no dated,? linked evidence/i)).toBeNull();
    expect(screen.getByText(/may or may not derive from this sample/i)).toBeTruthy();
  });

  // Codex audit HIGH (round 3): "unknown" also covers "no active
  // fertility evidence at all" — the copy must never claim the Nutrient
  // Requirement "reflects the field's current fertility evidence" in
  // that case, since none may exist.
  it("discloses fertilityBasisStatus: unknown without claiming current fertility evidence exists, when no real plan is available", async () => {
    mockAction.mockResolvedValue({
      ...baseReport(),
      fertilityBasisStatus: "unknown" as const,
      labStatus: labStatusWithInterpretation(),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/does not establish whether this sample remains/i)).toBeTruthy());
    expect(screen.getByText(/Nutrient Requirement is not currently available at all/i)).toBeTruthy();
    expect(screen.queryByText(/reflects the field's current fertility evidence/i)).toBeNull();
  });

  it("discloses when the real farm-wide decisions read was truncated — the accepted-plans count may understate the truth", async () => {
    mockAction.mockResolvedValue({ ...baseReport(), acceptedPlansTruncated: true });
    renderPage();
    await waitFor(() => expect(screen.getByText(/more decisions than could be checked/i)).toBeTruthy());
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

// Grassland Fertiliser Pilot Completion, Checkpoint B (audit finding
// F6/F10) — the legacy/manual entry path, keyed by fieldId rather than
// jobSessionId.
describe("EvidenceReportPageClient — legacy/manual entry (fieldId)", () => {
  it("calls the field-scoped action, never the job-session one, when given a fieldId", async () => {
    mockFieldAction.mockResolvedValue(manualEntryReport());
    renderFieldPage();
    await waitFor(() => expect(mockFieldAction).toHaveBeenCalledWith("field-1"));
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("renders the real manual lab entry — laboratory, sample ref, pH/P/K, lime — with no fabricated composite sample section", async () => {
    mockFieldAction.mockResolvedValue(manualEntryReport());
    renderFieldPage();
    await waitFor(() => expect(screen.getByText("Southern Agri Labs")).toBeTruthy());
    expect(screen.getByText("SAL-2026-0113")).toBeTruthy();
    expect(screen.getByText("6.23")).toBeTruthy();
    expect(screen.getByText("8.16 mg/l")).toBeTruthy();
    expect(screen.getByText("95.4 mg/l")).toBeTruthy();
    expect(screen.getByText("2.5 t/ha")).toBeTruthy();
    expect(screen.getByText(/not a gps-guided composite sample/i)).toBeTruthy();
  });

  it("shows the real, honest reason when the field has no real soil test on file — never fabricates one", async () => {
    mockFieldAction.mockResolvedValue({ status: "not_confirmed", reasonCode: "NO_REAL_SOIL_TEST_ON_FILE" });
    renderFieldPage();
    await waitFor(() => expect(screen.getByText(/no real laboratory soil test on file yet/i)).toBeTruthy());
  });
});
