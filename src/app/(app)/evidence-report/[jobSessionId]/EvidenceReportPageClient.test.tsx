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
import { calculateNutrientPlan } from "@/domain/nutrients";
import { tracked } from "@/domain/types";
import type { Farm, Field, NutrientPlan, SlurryAllocation } from "@/domain/types";
import { mixedRequirementReport } from "@/lib/nutrient-card-presentation";

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
    fieldRequirement: { contractVersion: "field_nutrient_requirement_v1", engineVersion: "nutrient_engine_v1.4.0", fieldId: "field-1", areaHa: 1, cropContext: { basis: "grazing", plannedUseAssumed: false }, n: { status: "KNOWN" as const, kgHa: 35, totalKg: { status: "OK" as const, value: 35 * 1, evidenceState: "MEASURED" as const }, evidenceState: "MEASURED" as const, source: "Teagasc Green Book (5th Ed., 2020)", ruleRefs: [], limitations: [] }, p: { ...{ status: "KNOWN" as const, kgHa: 4, totalKg: { status: "OK" as const, value: 4 * 1, evidenceState: "MEASURED" as const }, evidenceState: "MEASURED" as const, source: "Teagasc Green Book (5th Ed., 2020)", ruleRefs: [], limitations: [] }, soilIndex: { status: "OK" as const, value: { index: 2 as const }, evidenceState: "MEASURED" as const } }, k: { ...{ status: "KNOWN" as const, kgHa: 0, totalKg: { status: "OK" as const, value: 0 * 1, evidenceState: "MEASURED" as const }, evidenceState: "MEASURED" as const, source: "Teagasc Green Book (5th Ed., 2020)", ruleRefs: [], limitations: [] }, soilIndex: { status: "OK" as const, value: { index: 3 as const }, evidenceState: "MEASURED" as const } } },
    fieldRemainingRequirement: { contractVersion: "field_nutrient_remaining_v1", requirementContractVersion: "field_nutrient_requirement_v1", engineVersion: "nutrient_engine_v1.4.0", fieldId: "field-1", areaHa: 1, n: { status: "KNOWN" as const, kgHa: 35, totalKg: { status: "OK" as const, value: 35 * 1, evidenceState: "MEASURED" as const }, requirementKgHa: 35, creditKgHa: 0, creditBasis: "NO_SLURRY_PLANNED" as const, evidenceState: "MEASURED" as const }, p: { status: "KNOWN" as const, kgHa: 4, totalKg: { status: "OK" as const, value: 4 * 1, evidenceState: "MEASURED" as const }, requirementKgHa: 4, creditKgHa: 0, creditBasis: "NO_SLURRY_PLANNED" as const, evidenceState: "MEASURED" as const }, k: { status: "KNOWN" as const, kgHa: 0, totalKg: { status: "OK" as const, value: 0 * 1, evidenceState: "MEASURED" as const }, requirementKgHa: 0, creditKgHa: 0, creditBasis: "NO_SLURRY_PLANNED" as const, evidenceState: "MEASURED" as const } },
    requirementByNutrient: {
      n: { status: "OK", value: 35, evidenceState: "IRISH_DEFAULT" },
      p: { status: "OK", value: 4, evidenceState: "IRISH_DEFAULT" },
      k: { status: "OK", value: 0, evidenceState: "IRISH_DEFAULT" },
    },
    organicApplication: {
      rateM3ha: 0,
      totalM3: 0,
      offsetN: 0,
      offsetP: 0,
      offsetK: 0,
      dmPct: 6.3,
      dmPctEvidence: { status: "estimated", source: "Teagasc Green Book Table 9-1 (national average cattle slurry dry matter %)" },
      availableNutrientAssessment: { status: "NOT_APPLICABLE", reasonCode: "SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE" },
      availableNutrientByNutrient: {
        n: { status: "NOT_APPLICABLE", reasonCode: "SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE" },
        p: { status: "NOT_APPLICABLE", reasonCode: "SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE" },
        k: { status: "NOT_APPLICABLE", reasonCode: "SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE" },
      },
      availableNutrientBasis: { status: "NOT_APPLICABLE", reasonCode: "SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE" },
    },
    requirementProvisional: { isProvisional: false },
    netRequirement: { value: { n: 35, p: 4, k: 0 }, status: "estimated", source: "Teagasc Green Book" },
    netRequirementByNutrient: {
      n: { status: "OK", value: 35, evidenceState: "IRISH_DEFAULT" },
      p: { status: "OK", value: 4, evidenceState: "IRISH_DEFAULT" },
      k: { status: "OK", value: 0, evidenceState: "IRISH_DEFAULT" },
    },
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
    expect(screen.queryByText("Gross N / P / K")).toBeNull();
  });

  // Per-nutrient P/K Increment 5b.
  const okArm = <T,>(value: T) => ({ status: "OK" as const, value, evidenceState: "IRISH_DEFAULT" as const });
  const missingArm = (input: string) => ({
    status: "BLOCKED_INSUFFICIENT_EVIDENCE" as const,
    reasonCode: "MISSING_SOIL_FERTILITY_INDEX",
    missingInputs: [input],
  });
  const provenance = {
    status: "estimated" as const,
    source: "Teagasc Green Book (5th Ed., 2020)",
    calculationVersion: "nutrient_engine_v1.4.0",
    evidence: {
      fertilityEvidenceByNutrient: { p: okArm({ index: 2 as const }), k: missingArm("fertility.kIndex") },
      requirementByNutrient: { n: okArm(35), p: okArm(30), k: missingArm("fertility.kIndex") },
      availableNutrientByNutrient: { n: okArm({ kgHa: 12 }), p: okArm({ kgHa: 9 }), k: missingArm("fertility.kIndex") },
      availableNutrientBasis: { status: "NOT_APPLICABLE" as const, reasonCode: "SLURRY_APPLICATION_CONTEXT_NOT_APPLICABLE" },
      netRequirementByNutrient: { n: okArm(23), p: okArm(21), k: missingArm("fertility.kIndex") },
      slurryDmPct: 6,
      slurryDmPctEvidence: { status: "estimated" as const, source: "Teagasc Table 9-1" },
    },
  };
  const rowValues = () =>
    ["Gross N / P / K", "Organic offset (N / P / K)", "Net requirement (N / P / K)"].map(
      (label) => screen.getByText(label).nextElementSibling?.textContent,
    );
  it("fully indexed: the paired N / P / K rows, exactly as before, with no per-nutrient line", async () => {
    mockAction.mockResolvedValue({ ...baseReport(), nutrientPlan: minimalPlan() });
    renderPage();
    await waitFor(() => expect(screen.getByText("Gross N / P / K")).toBeTruthy());
    expect(rowValues()).toEqual(["35 / 4 / 0", "0 / 0 / 0", "35 / 4 / 0"]);
    expect(screen.queryByText(/requirement isn't shown/)).toBeNull();
  });

  it.each([
    {
      known: "p",
      mixed: {
        known: "p" as const,
        missing: "k" as const,
        gross: { n: 35, p: 30, k: null },
        organicOffset: { n: 12, p: 9, k: null },
        net: { n: 23, p: 21, k: null },
        line: "K requirement isn't shown because this field's soil K Index is missing. Add a soil test to complete the plan.",
        ...provenance,
      },
      rows: ["35 / 30 / —", "12 / 9 / —", "23 / 21 / —"],
    },
    {
      known: "k",
      mixed: {
        known: "k" as const,
        missing: "p" as const,
        gross: { n: 35, p: null, k: 60 },
        organicOffset: { n: 0, p: null, k: 0 },
        net: { n: 35, p: null, k: 60 },
        line: "P requirement isn't shown because this field's soil P Index is missing. Add a soil test to complete the plan.",
        ...provenance,
      },
      rows: ["35 / — / 60", "0 / — / 0", "35 / — / 60"],
    },
  ])("$known known: per-nutrient rows with \"—\" for the unknown nutrient and the D3 line", async ({ mixed, rows }) => {
    mockAction.mockResolvedValue({
      ...baseReport(),
      nutrientPlanUnavailableReason: "This field's P/K Soil Index has not been recorded.",
      mixedNutrientRequirement: mixed,
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(mixed.line)).toBeTruthy());
    expect(rowValues()).toEqual(rows);
    // Audit F001: the engine version is disclosed and kept in the manifest.
    expect(screen.getByText("Calculation version").nextElementSibling?.textContent).toBe("nutrient_engine_v1.4.0");
    expect(screen.queryByText(/Slurry nutrient credit not included/)).toBeNull();
    expect(screen.queryByText("This field's P/K Soil Index has not been recorded.")).toBeNull();
    // Purchasing and regulatory sections stay withheld (D1 option a).
    expect(screen.queryByText("Product allocation")).toBeNull();
    expect(screen.queryByText("Regulatory constraints")).toBeNull();
  });

  it("audit F001: a mixed field's provisional slurry notice is shown and its provenance stays in the manifest", async () => {
    mockAction.mockResolvedValue({
      ...baseReport(),
      nutrientPlanUnavailableReason: "This field's P/K Soil Index has not been recorded.",
      mixedNutrientRequirement: {
        known: "p" as const,
        missing: "k" as const,
        gross: { n: 35, p: 30, k: null },
        organicOffset: { n: null, p: null, k: null },
        net: { n: null, p: null, k: null },
        line: "K requirement isn't shown because this field's soil K Index is missing. Add a soil test to complete the plan.",
        ...provenance,
        provisional: { headline: "Slurry nutrient credit not included", detail: "Fertiliser requirement is provisional." },
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/Slurry nutrient credit not included/)).toBeTruthy());
    fireEvent.click(screen.getByText(/machine-reproducible manifest/));
    const manifest = screen.getByText(/"mixedNutrientRequirement"/).textContent ?? "";
    expect(manifest).toContain('"calculationVersion": "nutrient_engine_v1.4.0"');
    expect(manifest).toContain('"evidenceState": "IRISH_DEFAULT"');
    expect(manifest).toContain('"reasonCode": "MISSING_SOIL_FERTILITY_INDEX"');
  });

  // CC-B6 / Increment 5b audit F002 — engine-driven page matrix: real
  // `calculateNutrientPlan` output, placed in the report as
  // `buildScientificEvidenceReport` does (paired plan when the requirement
  // is calculated, otherwise `mixedRequirementReport`).
  describe("engine-driven matrix (CC-B6)", () => {
    const slurryAllocation: SlurryAllocation = {
      fieldId: "field-1",
      housingId: "housing-1",
      priority: "high",
      volumeM3: 84,
      score: 90,
      applicationMethod: tracked("splashplate", "farmer_adjusted", "Farmer"),
      applicationDate: tracked("2027-03-15", "farmer_adjusted", "Farmer"),
    };
    const engineReport = (fertility: Field["fertility"], plannedUse: Field["plannedUse"] = tracked("grazing", "verified", "Farmer")) => {
      const plan = calculateNutrientPlan({
        field: { id: "field-1", farmId: "farm-1", name: "Back Meadow", areaHa: 4.2, centroid: [0, 0], plannedUse, fertility, history: [] },
        farmGrasslandAreaHa: 20,
        livestockGroups: [],
        slurryAllocation,
        asOfDate: "2026-10-02",
      });
      const available = plan.requirement.status === "estimated";
      const mixed = available ? undefined : mixedRequirementReport(plan);
      return {
        plan,
        report: {
          ...baseReport(),
          nutrientPlan: available ? plan : undefined,
          nutrientPlanUnavailableReason: available ? undefined : plan.requirement.source,
          ...(mixed ? { mixedNutrientRequirement: mixed } : {}),
        },
      };
    };
    const cell = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    const dash = (v: number | null) => (v === null ? "—" : String(v));

    it.each([
      { name: "P only", fertility: { pIndex: tracked(2 as const, "verified", "Lab") }, missing: "K" },
      { name: "K only", fertility: { kIndex: tracked(1 as const, "verified", "Lab") }, missing: "P" },
      { name: "tillage, P only", fertility: { pIndex: tracked(3 as const, "verified", "Lab") }, missing: "K", tillage: true },
    ])("$name: per-nutrient rows, \"—\", the D3 line and the slurry basis", async ({ fertility, missing, ...rest }) => {
      const { plan, report } = engineReport(fertility, "tillage" in rest ? tracked("tillage", "verified", "Farmer") : undefined);
      const mixed = report.mixedNutrientRequirement;
      if (!mixed) throw new Error("expected a mixed report");
      mockAction.mockResolvedValue(report);
      renderPage();
      await waitFor(() => expect(screen.getByText(mixed.line)).toBeTruthy());
      expect(mixed.line).toBe(`${missing} requirement isn't shown because this field's soil ${missing} Index is missing. Add a soil test to complete the plan.`);
      const row = (v: { n: number | null; p: number | null; k: number | null }) => [v.n, v.p, v.k].map(dash).join(" / ");
      expect(rowValues()).toEqual([row(mixed.gross), row(mixed.organicOffset), row(mixed.net)]);
      for (const r of rowValues()) expect(r?.split(" / ")[missing === "P" ? 1 : 2]).toBe("—");
      expect(cell("Calculation version")).toBe(plan.calculationVersion);
      // The slurry basis the paired assessment can't carry (it is blocked).
      expect(plan.organicApplication.availableNutrientAssessment.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
      const basis = plan.organicApplication.availableNutrientBasis;
      if (basis.status !== "OK") throw new Error("expected an OK basis");
      expect(cell("Slurry application method")).toBe("splashplate");
      expect(cell("Slurry timing")).toBe("spring (applied 2027-03-15)");
      expect(cell("Slurry rate / DM")).toBe("20 m³/ha at 6.3% DM");
      expect(cell("Slurry rule")).toBe(`SLURRY_TABLE_9_8 — ${basis.value.source}`);
      expect(screen.getByText(basis.value.scientificBasisNote)).toBeTruthy();
      fireEvent.click(screen.getByText(/machine-reproducible manifest/));
      expect(screen.getByText(/"availableNutrientBasis"/).textContent).toContain('"ruleId": "SLURRY_TABLE_9_8"');
    });

    it("both indices: the paired rows, unchanged, with no per-nutrient line or slurry basis rows", async () => {
      const { plan, report } = engineReport({ pIndex: tracked(2, "verified", "Lab"), kIndex: tracked(3, "verified", "Lab") });
      expect(report.mixedNutrientRequirement).toBeUndefined();
      mockAction.mockResolvedValue(report);
      renderPage();
      await waitFor(() => expect(screen.getByText("Gross N / P / K")).toBeTruthy());
      const { requirement: req, organicApplication: o, netRequirement: net } = plan;
      expect(rowValues()).toEqual([
        `${req.value.n} / ${req.value.p} / ${req.value.k}`,
        `${o.offsetN} / ${o.offsetP} / ${o.offsetK}`,
        `${net.value.n} / ${net.value.p} / ${net.value.k}`,
      ]);
      expect(screen.queryByText(/requirement isn't shown/)).toBeNull();
      expect(screen.queryByText("Slurry application method")).toBeNull();
      // The engine's basis equals the paired assessment's basis fields.
      if (o.availableNutrientAssessment.status !== "OK") throw new Error("expected OK");
      expect(o.availableNutrientAssessment.value).toMatchObject(o.availableNutrientBasis.status === "OK" ? o.availableNutrientBasis.value : {});
    });

    it("neither index: the unavailable reason, no rows and no slurry basis", async () => {
      const { report } = engineReport({});
      expect(report.mixedNutrientRequirement).toBeUndefined();
      mockAction.mockResolvedValue(report);
      renderPage();
      await waitFor(() => expect(screen.getByText(report.nutrientPlanUnavailableReason!)).toBeTruthy());
      expect(screen.queryByText("Gross N / P / K")).toBeNull();
      expect(screen.queryByText("Slurry application method")).toBeNull();
    });
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
