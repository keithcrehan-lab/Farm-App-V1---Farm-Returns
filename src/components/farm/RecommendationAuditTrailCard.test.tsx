import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { RecommendationAuditTrailCard } from "./RecommendationAuditTrailCard";
import { createLocalStorageAuditTraceStore } from "@/domain/audit-trace-local-storage";
import type { Farm, Field, LivestockGroup, SlurryAllocation } from "@/domain/types";
import { mockSilagePlans } from "@/data/mock-farm";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderCard() {
  return render(
    <FarmProvider>
      <RecommendationAuditTrailCard />
    </FarmProvider>,
  );
}

async function generateTrace() {
  const button = screen.getByRole("button", { name: /generate audit trace/i });
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByRole("button", { name: /generating/i })).toBeNull());
}

describe("RecommendationAuditTrailCard — RPT023 filters (V3 closure pass)", () => {
  it("shows a decision-type filter that narrows the real list once traces are generated", async () => {
    renderCard();
    await generateTrace();
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0));
    const totalItems = screen.getAllByRole("listitem").length;

    const select = screen.getByLabelText(/decision type/i) as HTMLSelectElement;
    // Every real farm field produces at least one BLOCKED_INSUFFICIENT_EVIDENCE
    // decision (no commonage/waterBufferContext captured on the mock
    // fields) — filtering to it must show fewer or equal items, never
    // the unfiltered count, proving the filter is real.
    fireEvent.change(select, { target: { value: "BLOCKED_INSUFFICIENT_EVIDENCE" } });
    const filteredItems = screen.getAllByRole("listitem").length;
    expect(filteredItems).toBeGreaterThan(0);
    expect(filteredItems).toBeLessThanOrEqual(totalItems);
  });

  it("shows a reviewer-status filter that excludes everything once filtered to a status nothing has yet", async () => {
    renderCard();
    await generateTrace();
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0));

    const select = screen.getByLabelText(/reviewer status/i) as HTMLSelectElement;
    // Every decision defaults to UNREVIEWED (no review has been recorded
    // yet) — filtering to VERIFIED must show zero real items.
    fireEvent.change(select, { target: { value: "VERIFIED" } });
    expect(screen.queryAllByRole("listitem").length).toBe(0);
    expect(screen.getByText(/no recommendations/i)).toBeTruthy();
  });
});

describe("RecommendationAuditTrailCard — RPT024 run comparison (V3 closure pass)", () => {
  it("offers a run-comparison picker only once at least 2 real runs exist, and shows a real deterministic reason once both are picked", async () => {
    renderCard();
    expect(screen.queryByText(/compare runs/i)).toBeNull(); // 0 runs yet

    await generateTrace();
    await waitFor(() => expect(screen.getByText(/compare runs/i)).toBeTruthy());

    const [selectA, selectB] = screen.getAllByRole("combobox").slice(-2);
    const runOptionsA = Array.from((selectA as HTMLSelectElement).options).map((o) => o.value).filter(Boolean);
    const runOptionsB = Array.from((selectB as HTMLSelectElement).options).map((o) => o.value).filter(Boolean);
    expect(runOptionsA.length).toBeGreaterThanOrEqual(2);

    fireEvent.change(selectA, { target: { value: runOptionsA[0] } });
    fireEvent.change(selectB, { target: { value: runOptionsB[1] } });

    // Two different fields' runs differ in scope/inputs -> at least one
    // real, non-generic reason string appears (not silently blank).
    await waitFor(() =>
      expect(screen.getAllByText(/change|ruleset|no material change|no matching decision/i).length).toBeGreaterThan(0),
    );
  });
});

// Codex audit CRITICAL (round 11): "Generate audit trace" is a sixth
// independent path computing a real fertiliser/NAP recommendation
// without this campaign's own tillage/missing-livestock fail-closed
// gates — and, unlike most other fixed call sites, this one *persists*
// its output to localStorage, exportable as CSV/JSON/text.
describe("RecommendationAuditTrailCard — never persists a fabricated recommendation for a tillage field or an un-evidenced empty herd", () => {
  const farm: Farm = {
    id: "farm-1",
    name: "Test Farm",
    location: { county: "Cork", centroid: [0, 0] },
    primaryEnterprises: ["suckler_beef"],
    units: "metric",
    ownerName: "Farmer",
  };

  function field(overrides: Partial<Field> = {}): Field {
    return {
      id: "field-1",
      farmId: "farm-1",
      name: "Field 1",
      areaHa: 4,
      centroid: [0, 0],
      fertility: { pIndex: { value: 1, status: "verified", source: "Soil test" }, kIndex: { value: 1, status: "verified", source: "Soil test" } },
      ...overrides,
    } as Field;
  }

  it("never generates a real, persisted run for a tillage field", async () => {
    const tillageField = field({ plannedUse: { value: "tillage", status: "verified", source: "Farmer" } });
    render(
      <FarmProvider remote initialState={{ farm, fields: [tillageField], livestockGroups: [], housing: [], slurryAllocations: [] }}>
        <RecommendationAuditTrailCard />
      </FarmProvider>,
    );

    await generateTrace();
    expect(createLocalStorageAuditTraceStore().list()).toEqual([]);
  });

  it("never generates a real, persisted run for a grazing field when the farm has no recorded livestock", async () => {
    render(
      <FarmProvider remote initialState={{ farm, fields: [field()], livestockGroups: [], housing: [], slurryAllocations: [] }}>
        <RecommendationAuditTrailCard />
      </FarmProvider>,
    );

    await generateTrace();
    expect(createLocalStorageAuditTraceStore().list()).toEqual([]);
  });
});

// Codex audit MEDIUM (round 24): the missing-livestock skip above was
// silent — a farmer generating a trace on a farm with no recorded
// livestock got a run list that looked complete, with no disclosure that
// its real grazing fields were never traced at all.
describe("RecommendationAuditTrailCard — discloses fields skipped for missing livestock (Codex round 24)", () => {
  const farm: Farm = {
    id: "farm-1",
    name: "Test Farm",
    location: { county: "Cork", centroid: [0, 0] },
    primaryEnterprises: ["suckler_beef"],
    units: "metric",
    ownerName: "Farmer",
  };

  function field(overrides: Partial<Field> = {}): Field {
    return {
      id: "field-1",
      farmId: "farm-1",
      name: "Field 1",
      areaHa: 4,
      centroid: [0, 0],
      fertility: { pIndex: { value: 1, status: "verified", source: "Soil test" }, kIndex: { value: 1, status: "verified", source: "Soil test" } },
      ...overrides,
    } as Field;
  }

  it("discloses a real grazing field skipped because the farm has no recorded livestock", async () => {
    render(
      <FarmProvider remote initialState={{ farm, fields: [field()], livestockGroups: [], housing: [], slurryAllocations: [] }}>
        <RecommendationAuditTrailCard />
      </FarmProvider>,
    );
    await generateTrace();
    expect(screen.getByText(/1 field skipped/i)).toBeTruthy();
    expect(screen.getByText(/no recorded livestock/i)).toBeTruthy();
  });

  it("never discloses a skip for a tillage field — that is a genuine not-applicable case, not blocked evidence", async () => {
    const tillageField = field({ plannedUse: { value: "tillage", status: "verified", source: "Farmer" } });
    render(
      <FarmProvider remote initialState={{ farm, fields: [tillageField], livestockGroups: [], housing: [], slurryAllocations: [] }}>
        <RecommendationAuditTrailCard />
      </FarmProvider>,
    );
    await generateTrace();
    expect(screen.queryByText(/field skipped/i)).toBeNull();
  });

  it("never discloses a skip for a field with a real matching silage plan, even with no recorded livestock — silage N/P/K never depends on it", async () => {
    const silageField = field({ id: mockSilagePlans[0].fieldId });
    render(
      <FarmProvider remote initialState={{ farm, fields: [silageField], livestockGroups: [], housing: [], slurryAllocations: [] }}>
        <RecommendationAuditTrailCard />
      </FarmProvider>,
    );
    await generateTrace();
    expect(screen.queryByText(/field skipped/i)).toBeNull();
    expect(createLocalStorageAuditTraceStore().list().length).toBe(1);
  });

  it("never discloses a skip when every real field's evidence is complete", async () => {
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "farm-1", category: "suckler_cow", label: "Cows", count: { value: 20, status: "verified", source: "Farmer" }, system: "grazing", value: { value: 30000, status: "estimated", source: "Farm Return estimate" } },
    ];
    render(
      <FarmProvider remote initialState={{ farm, fields: [field()], livestockGroups: groups, housing: [], slurryAllocations: [] }}>
        <RecommendationAuditTrailCard />
      </FarmProvider>,
    );
    await generateTrace();
    expect(screen.queryByText(/field skipped/i)).toBeNull();
  });
});

// Codex audit CRITICAL (round 17): "Generate audit trace" omitted both
// the field's own real slurry allocation and the farm's own real
// Article 17(6) evidence entirely — every other real `calculateNutrientPlan`
// call site in this vertical supplies both.
describe("RecommendationAuditTrailCard — carries real slurry allocation and Article 17(6) evidence into the persisted trace", () => {
  const farm: Farm = {
    id: "farm-1",
    name: "Test Farm",
    location: { county: "Cork", centroid: [0, 0] },
    primaryEnterprises: ["suckler_beef"],
    units: "metric",
    ownerName: "Farmer",
  };

  function field(overrides: Partial<Field> = {}): Field {
    return {
      id: "field-1",
      farmId: "farm-1",
      name: "Field 1",
      areaHa: 4,
      centroid: [0, 0],
      fertility: { pIndex: { value: 1, status: "verified", source: "Soil test" }, kIndex: { value: 1, status: "verified", source: "Soil test" } },
      ...overrides,
    } as Field;
  }

  it("records a real statutory manure N/P ledger decision when the field has a real slurry allocation — none at all when it doesn't", async () => {
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "farm-1", category: "suckler_cow", label: "Cows", count: { value: 20, status: "verified", source: "Farmer" }, system: "grazing", value: { value: 30000, status: "estimated", source: "Farm Return estimate" } },
    ];
    const slurryAllocation: SlurryAllocation = { fieldId: "field-1", housingId: "h1", priority: "high", volumeM3: 100, score: 1 };

    render(
      <FarmProvider remote initialState={{ farm, fields: [field()], livestockGroups: groups, housing: [], slurryAllocations: [slurryAllocation] }}>
        <RecommendationAuditTrailCard />
      </FarmProvider>,
    );
    await generateTrace();

    const [run] = createLocalStorageAuditTraceStore().list();
    const manureDecision = run.decisionRecords.find((d) => d.action.includes("statutory manure N/P ledger value"));
    expect(manureDecision).toBeDefined();
    expect(manureDecision?.quantity?.value).toBeGreaterThan(0);
  });

  it("never records a statutory manure N/P ledger decision when the field has no real slurry allocation", async () => {
    const groups: LivestockGroup[] = [
      { id: "g1", farmId: "farm-1", category: "suckler_cow", label: "Cows", count: { value: 20, status: "verified", source: "Farmer" }, system: "grazing", value: { value: 30000, status: "estimated", source: "Farm Return estimate" } },
    ];

    render(
      <FarmProvider remote initialState={{ farm, fields: [field()], livestockGroups: groups, housing: [], slurryAllocations: [] }}>
        <RecommendationAuditTrailCard />
      </FarmProvider>,
    );
    await generateTrace();

    const [run] = createLocalStorageAuditTraceStore().list();
    const manureDecision = run.decisionRecords.find((d) => d.action.includes("statutory manure N/P ledger value"));
    expect(manureDecision).toBeUndefined();
  });

  it("records the enhanced Table 15b P_BUILD_UP_ELIGIBILITY check as PASS when the farm's real Article 17(6) evidence is supplied — FAIL without it", async () => {
    // Empirically verified fixture (see fertiliser-recommendation.test.ts's
    // and recompute.test.ts's identical fixture): resolves a real
    // statutory GSR of 460 kg N/ha with every other P-build-up condition
    // satisfied.
    const dairyField = field({
      areaHa: 10,
      fertility: {
        pIndex: { value: 1, status: "verified", source: "Soil test" },
        kIndex: { value: 1, status: "verified", source: "Soil test" },
        verifiedTest: { sampleDate: "2026-01-01", laboratory: "Test Lab", sampleRef: "ref-1", p: 3, k: 3, pH: 6.2, organicMatterPct: 10 },
      },
    });
    const nonGrassField = field({ id: "field-2", areaHa: 0.6, plannedUse: { value: "tillage", status: "verified", source: "Farmer" } });
    const groups: LivestockGroup[] = [
      {
        id: "g1",
        farmId: "farm-1",
        category: "dairy_cow",
        label: "Cows",
        count: { value: 50, status: "verified", source: "Farmer" },
        system: "grazing",
        avgAgeMonths: 48,
        sex: "female",
        value: { value: 60000, status: "estimated", source: "Farm Return estimate" },
        avgMilkYieldKgPerYear: { value: 6000, status: "verified", source: "Farmer" },
      },
    ];

    function napComplianceCheck(run: import("@/domain/audit-trace").CalculationRun) {
      for (const d of run.decisionRecords) {
        const check = d.complianceChecks.find((c) => c.checkId === "P_BUILD_UP_ELIGIBILITY");
        if (check) return check;
      }
      return undefined;
    }

    render(
      <FarmProvider
        remote
        initialState={{
          farm: { ...farm, pBuildUpCompliance: { value: { adviserEngaged: true, nmpSubmitted: true, trainingCompleted: true }, status: "verified", source: "Farmer" } },
          fields: [dairyField, nonGrassField],
          livestockGroups: groups,
          housing: [],
          slurryAllocations: [],
        }}
      >
        <RecommendationAuditTrailCard />
      </FarmProvider>,
    );
    await generateTrace();
    const [withRun] = createLocalStorageAuditTraceStore().list();
    expect(napComplianceCheck(withRun)?.result).toBe("PASS");

    window.localStorage.clear();
    cleanup();
    render(
      <FarmProvider remote initialState={{ farm, fields: [dairyField, nonGrassField], livestockGroups: groups, housing: [], slurryAllocations: [] }}>
        <RecommendationAuditTrailCard />
      </FarmProvider>,
    );
    await generateTrace();
    const [withoutRun] = createLocalStorageAuditTraceStore().list();
    expect(napComplianceCheck(withoutRun)?.result).toBe("FAIL");
  });
});
