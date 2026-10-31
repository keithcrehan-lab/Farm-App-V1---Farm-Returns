import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// This suite exercises FieldDrawer's own store-driven behaviour, not the
// separate, already-tested FieldAwarenessCard
// (FieldAwarenessCard.test.tsx) it renders inside its "Now" tab — mocked
// here purely to keep this suite from exercising a real Server Action
// (createClient()/next/headers) outside a request context.
vi.mock("@/app/actions/field-awareness", () => ({ getFieldAwarenessAction: vi.fn().mockResolvedValue(null) }));
vi.mock("@/app/actions/field-workspace", () => ({
  getFieldWorkspaceContextAction: vi.fn().mockResolvedValue({ cycle: null, activities: [], activitiesTruncated: false }),
}));
vi.mock("@/app/actions/fertiliser-field-evidence", () => ({
  loadFieldProductionCycleAction: vi.fn().mockResolvedValue({ cycle: null, gate: null }),
  saveFieldProductionCycleAction: vi.fn(),
}));
// Real-mode store writes go through these canonical Server Actions — mocked
// only at that I/O boundary so the drawer + store logic run for real.
vi.mock("@/app/actions/farm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/actions/farm")>();
  return {
    ...actual,
    updateSlurryApplicationMethodAction: vi.fn().mockResolvedValue(undefined),
    updateSlurryApplicationDateAction: vi.fn().mockResolvedValue(undefined),
    autoAssessFieldLegalSpatialEvidenceAction: vi.fn().mockRejectedValue(new Error("not configured in test")),
  };
});

import { FarmProvider, useFields } from "@/store/farm-store";
import { FieldDrawer } from "./FieldDrawer";
import { mockFields, mockSlurryAllocations } from "@/data/mock-farm";
import type { Field, SlurryAllocation } from "@/domain/types";
import type { Prompt } from "@/orchestration/prompt";
import { updateSlurryApplicationDateAction, updateSlurryApplicationMethodAction } from "@/app/actions/farm";
import { getFieldWorkspaceContextAction } from "@/app/actions/field-workspace";
import { saveFieldProductionCycleAction } from "@/app/actions/fertiliser-field-evidence";

afterEach(() => {
  cleanup();
});

function renderDrawer(field: Field) {
  return render(
    <FarmProvider>
      <FieldDrawer field={field} />
    </FarmProvider>,
  );
}

/** Mirrors how `src/app/fields/page.tsx` actually renders `FieldDrawer`:
 * `field` is re-derived from live `useFields()` store state on every
 * render, not a static snapshot — so a farmer's edit (store action) is
 * reflected back into the drawer's own props, the same way a real screen
 * re-renders. Passing a frozen `Field` object directly (as the tests above
 * do, for the parts of the drawer that don't need to react to an edit)
 * would not exercise that real reactivity. */
function LiveFieldDrawer({ fieldId }: { fieldId: string }) {
  const fields = useFields();
  const field = fields.find((f) => f.id === fieldId);
  if (!field) return null;
  return <FieldDrawer field={field} />;
}

function renderLiveDrawer(fieldId: string) {
  return render(
    <FarmProvider>
      <LiveFieldDrawer fieldId={fieldId} />
    </FarmProvider>,
  );
}

describe("FieldDrawer — farmer-readable spreading status", () => {
  it("reduces a known statutory closed period to a simple action message and keeps legal detail behind evidence", () => {
    const prompt: Prompt = {
      id: "closed-1",
      farmId: mockFields[0].farmId,
      fieldId: mockFields[0].id,
      kind: "spreading_window",
      title: `Spreading window status needs review — ${mockFields[0].name}`,
      description: "Not permitted: 2026-10-31 falls within the statutory closed period for chemical_fertiliser in Zone B (09-15 - 01-29).",
      basis: { status: "LEGAL_PROHIBITION", reasonCode: "CLOSED_PERIOD_CALENDAR", consequence: "2026-10-31 falls within the statutory closed period for chemical_fertiliser in Zone B (09-15 - 01-29)." },
      inputsSnapshot: { zone: "B", material: "chemical_fertiliser", asOfDate: "2026-10-31" },
      createdAt: "2026-10-31T09:00:00.000Z",
      regulatory: "compliance_value",
    };

    render(
      <FarmProvider>
        <FieldDrawer field={mockFields[0]} leadingPrompt={prompt} onViewPrompt={() => undefined} />
      </FarmProvider>,
    );

    expect(screen.getByText("Chemical fertiliser spreading is closed")).toBeTruthy();
    expect(screen.getByText(new RegExp(`You can’t spread chemical fertiliser on ${mockFields[0].name} right now\. Reopens 30 January\.`))).toBeTruthy();
    expect(screen.getByRole("button", { name: /view rules & evidence/i })).toBeTruthy();
    expect(screen.queryByText(/Zone B/)).toBeNull();
    expect(screen.queryByText(/09-15/)).toBeNull();
    expect(screen.queryByText(/status needs review/i)).toBeNull();
  });
});

describe("FieldDrawer — automatic legal spatial evidence", () => {
  it("shows mapped DAFM/EPA evidence first and keeps manual correction behind a disclosure", () => {
    const field: Field = {
      ...mockFields[0],
      commonageStatus: { value: "not_commonage", status: "mapped", source: "DAFM Anonymous LPIS 2025 · Commonage Indicator", sourceDate: "2025-12-31", level: "high" },
      waterBufferContext: {
        value: { featureType: "surface_water", nearestFeature: "Mapped Stream", distanceM: 18.4, localOverrideStatus: "unknown" },
        status: "mapped", source: "EPA Water Flow Network / River Network Routes WFS", sourceDate: "2026-10-31", level: "high",
      },
    };
    renderDrawer(field);
    fireEvent.click(screen.getByRole("button", { name: "Nutrients" }));
    fireEvent.click(screen.getByRole("button", { name: /legal & spreading checks/i }));

    expect(screen.getByText("Automatic field checks")).toBeTruthy();
    expect(screen.getByText("Not identified as commonage")).toBeTruthy();
    expect(screen.getByText(/Mapped Stream · 18\.4 m/i)).toBeTruthy();
    expect(screen.getByText(/one check Farm Return cannot currently resolve/i)).toBeTruthy();
    const correction = screen.getByText(/review or correct automatic evidence/i).closest("details");
    expect(correction?.hasAttribute("open")).toBe(false);
  });
});

describe("FieldDrawer — real field mapping entry point", () => {
  it("offers 'Map this field' (not the old disabled 'Edit Field') when no boundary exists yet", () => {
    // Codex remediation Priority 7 — mock fields now carry real polygon
    // geometry too (the canonical FieldMap renders it, not a separate
    // illustrative shape), so this "no boundary yet" case is constructed
    // explicitly here rather than assumed of mockFields[0].
    const field: Field = { ...mockFields[0] };
    delete field.polygon;
    delete field.polygonSource;
    delete field.polygonCapturedAt;
    expect(field.polygon).toBeUndefined();
    renderDrawer(field);
    // Structural changes sit behind an explicit Manage field control.
    expect(screen.queryByRole("button", { name: /map this field/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /manage field/i }));
    const button = screen.getByRole("button", { name: /map this field/i });
    expect(button).toBeTruthy();
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByText(/edit field/i)).toBeNull();
    expect(screen.queryByText(/phase 2 data model/i)).toBeNull();
  });

  it("offers 'Edit boundary' once a real polygon exists", () => {
    const withBoundary: Field = {
      ...mockFields[0],
      polygon: {
        type: "Polygon",
        coordinates: [
          [
            [-8.4863, 51.8985],
            [-8.4851, 51.8985],
            [-8.4851, 51.8994],
            [-8.4863, 51.8994],
            [-8.4863, 51.8985],
          ],
        ],
      },
      polygonSource: "farmer_drawn",
      polygonCapturedAt: "2026-08-25T10:00:00.000Z",
    };
    renderDrawer(withBoundary);
    expect(screen.queryByRole("button", { name: /edit boundary/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /manage field/i }));
    expect(screen.getByRole("button", { name: /edit boundary/i })).toBeTruthy();
  });

  it("still shows the neutral 'Under validation' spreading-suitability state, unaffected by real mapping", () => {
    renderDrawer(mockFields[0]);
    expect(screen.getByText("Under validation")).toBeTruthy();
  });
});

describe("FieldDrawer — compliance evidence capture (V3 closure pass)", () => {
  // Farm + Fields redesign (2026-10-27): the statutory inputs the
  // nutrient plan's legal gates read now sit inside the Nutrients chapter
  // ("Legal inputs for this field") — same real fields/behaviour, one tap.
  function openConstraintsTab() {
    fireEvent.click(screen.getByRole("button", { name: "Nutrients" }));
    fireEvent.click(screen.getByRole("button", { name: /legal & spreading checks/i }));
  }

  it("defaults commonage status to 'unknown' and fails closed until a farmer sets it", () => {
    const field = mockFields[0];
    expect(field.commonageStatus).toBeUndefined();
    renderLiveDrawer(field.id);
    openConstraintsTab();
    const select = screen.getByLabelText(/commonage status/i) as HTMLSelectElement;
    expect(select.value).toBe("unknown");
  });

  it("lets a farmer record real commonage status, live-reflected the same way the real /fields screen re-renders", () => {
    const field = mockFields[0];
    renderLiveDrawer(field.id);
    openConstraintsTab();
    const select = screen.getByLabelText(/commonage status/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "commonage" } });
    expect((screen.getByLabelText(/commonage status/i) as HTMLSelectElement).value).toBe("commonage");
  });

  it("reveals distance/local-override inputs only once a water feature is selected, and captures a real distance", () => {
    const field = mockFields[0];
    renderLiveDrawer(field.id);
    openConstraintsTab();
    expect(screen.queryByLabelText(/distance to that feature/i)).toBeNull();

    const featureSelect = screen.getByLabelText(/nearest regulated water feature/i) as HTMLSelectElement;
    fireEvent.change(featureSelect, { target: { value: "surface_water" } });

    const distanceInput = screen.getByLabelText(/distance to that feature/i) as HTMLInputElement;
    fireEvent.change(distanceInput, { target: { value: "2.9" } });
    expect((screen.getByLabelText(/distance to that feature/i) as HTMLInputElement).value).toBe("2.9");
  });

  it("offers a slurry application-method selector only when this field has a real slurry allocation", () => {
    const allocated = mockSlurryAllocations.find((a) => a.fieldId === mockFields[0].id);
    expect(allocated).toBeDefined();
    renderLiveDrawer(mockFields[0].id);
    openConstraintsTab();
    expect(screen.getByLabelText(/how will this slurry be spread/i)).toBeTruthy();

    const unallocatedField = mockFields.find((f) => !mockSlurryAllocations.some((a) => a.fieldId === f.id));
    if (unallocatedField) {
      cleanup();
      renderLiveDrawer(unallocatedField.id);
      openConstraintsTab();
      expect(screen.queryByLabelText(/how will this slurry be spread/i)).toBeNull();
    }
  });

  // Codex audit HIGH (round 31): a bare `.find()` showed/edited only the
  // first of a field's own real allocations, silently hiding a real
  // second one from a different housing source — the schema's own
  // `unique (field_id, housing_id)` constraint deliberately allows this.
  it("offers a separate method selector for each real allocation when a field has more than one, from different housing sources", () => {
    const field = mockFields[0];
    const twoAllocations = [
      { fieldId: field.id, housingId: "housing-a", priority: "high" as const, volumeM3: 60, score: 90 },
      { fieldId: field.id, housingId: "housing-b", priority: "high" as const, volumeM3: 40, score: 85 },
    ];
    render(
      <FarmProvider remote initialState={{ farm: { id: "farm-1", name: "Test Farm", location: { county: "Cork", centroid: [0, 0] }, primaryEnterprises: ["suckler_beef"], units: "metric", ownerName: "Farmer" }, fields: [field], livestockGroups: [], housing: [], slurryAllocations: twoAllocations, slurryCompositionRecords: [] }}>
        <FieldDrawer field={field} />
      </FarmProvider>,
    );
    openConstraintsTab();
    const selectors = screen.getAllByLabelText(/how will this slurry be spread/i);
    expect(selectors.length).toBe(2);
    expect(screen.getByText(/60 m³ allocation/i)).toBeTruthy();
    expect(screen.getByText(/40 m³ allocation/i)).toBeTruthy();
  });

  // Slurry Application Context V1 — brief §8: "where Farm Return already
  // knows the date, reuse it" / capture it when it doesn't. The date
  // lives on `SlurryAllocation.applicationDate`, alongside the existing
  // `applicationMethod` capture above.
  it("captures a real slurry application date alongside the application method, for a field with a real allocation", () => {
    const field = mockFields[0];
    expect(mockSlurryAllocations.find((a) => a.fieldId === field.id)).toBeDefined();
    renderLiveDrawer(field.id);
    openConstraintsTab();

    const dateInput = screen.getByLabelText(/application date/i) as HTMLInputElement;
    expect(dateInput.value).toBe("");
    fireEvent.change(dateInput, { target: { value: "2026-03-14" } });
    expect((screen.getByLabelText(/application date/i) as HTMLInputElement).value).toBe("2026-03-14");
  });
});

describe("FieldDrawer — arriving from What Matters' 'Add spreading details'", () => {
  const field = mockFields[0];
  const farm = { id: "farm-1", name: "Test Farm", location: { county: "Cork", centroid: [0, 0] as [number, number] }, primaryEnterprises: ["suckler_beef" as const], units: "metric" as const, ownerName: "Farmer" };
  const tracked = <T,>(value: T) => ({ value, status: "farmer_adjusted" as const, source: "Farmer" });

  function LiveRequestedDrawer({ missing }: { missing: ("method" | "date")[] }) {
    const live = useFields().find((f) => f.id === field.id)!;
    return <FieldDrawer field={live} slurryDetailsRequest={missing} />;
  }

  function renderRequested(allocation: SlurryAllocation, missing: ("method" | "date")[]) {
    return render(
      <FarmProvider remote initialState={{ farm, fields: [field], livestockGroups: [], housing: [], slurryAllocations: [allocation], slurryCompositionRecords: [] }}>
        <LiveRequestedDrawer missing={missing} />
      </FarmProvider>,
    );
  }

  const base: SlurryAllocation = { fieldId: field.id, housingId: "h1", priority: "high", volumeM3: 100, score: 90 };

  it("opens straight on the spreading details and asks for both when both are missing", () => {
    renderRequested(base, ["method", "date"]);
    expect(screen.getByText(/planned spreading method and date for this field/i)).toBeTruthy();
    expect(screen.getByLabelText(/how will this slurry be spread/i)).toBeTruthy();
    expect(screen.getByLabelText(/application date/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to today/i }).getAttribute("href")).toBe("/today");
  });

  it("asks only for the method when the date is already on record", () => {
    renderRequested({ ...base, applicationDate: tracked("2026-02-15") }, ["method"]);
    expect(screen.getByText(/planned spreading method for this field/i)).toBeTruthy();
    expect(screen.getByLabelText(/how will this slurry be spread/i)).toBeTruthy();
    expect(screen.queryByLabelText(/application date/i)).toBeNull();
  });

  it("asks only for the date when the method is already on record", () => {
    renderRequested({ ...base, applicationMethod: tracked("LESS" as const) }, ["date"]);
    expect(screen.getByText(/planned spreading date for this field/i)).toBeTruthy();
    expect(screen.getByLabelText(/application date/i)).toBeTruthy();
    expect(screen.queryByLabelText(/how will this slurry be spread/i)).toBeNull();
  });

  it("saves through the canonical store actions and then confirms without promising a recommendation", () => {
    renderRequested(base, ["method", "date"]);
    fireEvent.change(screen.getByLabelText(/how will this slurry be spread/i), { target: { value: "LESS" } });
    fireEvent.change(screen.getByLabelText(/application date/i), { target: { value: "2026-03-14" } });
    expect(updateSlurryApplicationMethodAction).toHaveBeenCalledWith(field.id, "h1", "LESS", "Farmer");
    expect(updateSlurryApplicationDateAction).toHaveBeenCalledWith(field.id, "h1", "2026-03-14", "Farmer");
    expect(screen.getByText(/spreading details added/i)).toBeTruthy();
    expect(screen.queryByText(/for this field's slurry before/i)).toBeNull();
    // The just-filled inputs stay visible with their saved values.
    expect((screen.getByLabelText(/how will this slurry be spread/i) as HTMLSelectElement).value).toBe("LESS");
    expect(document.body.textContent).not.toMatch(/you will (get|see) a recommendation/i);
  });
});

describe("FieldDrawer — field workspace chapters (Farm + Fields redesign)", () => {
  it("has only Overview, Nutrients and History — no Soil, Activity or Constraints chapter", () => {
    renderDrawer(mockFields[0]);
    const nav = screen.getByRole("navigation", { name: "Field chapters" });
    expect(Array.from(nav.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Overview", "Nutrients", "History"]);
    for (const name of ["Soil", "Activity", "Constraints", "Now"]) expect(screen.queryByRole("button", { name })).toBeNull();
    expect(screen.getByRole("button", { name: "Overview" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Overview uses only the production cycle for crop/use and does not repeat the legacy planned-use field", () => {
    const field: Field = { ...mockFields[0], plannedUse: { value: "silage_1st_cut", status: "farmer_adjusted", source: "Farmer", sourceDate: "2026-03-02" } };
    renderDrawer(field);
    const use = screen.getByRole("region", { name: "Use" });
    expect(use.textContent).toContain("Current crop / useNot recorded");
    expect(use.textContent).not.toMatch(/Planned use/);
    expect(use.textContent).toMatch(/Livestock.*Not recorded for fields yet/);
  });

  it("lets the farmer change current field use inline using the canonical production cycle", async () => {
    const grazingCycle = {
      id: "cycle-1", fieldId: mockFields[0].id, season: "2026", cropSystem: "GRASS_GRAZING" as const, status: "active" as const,
      evidence: { cropSystem: { value: "GRASS_GRAZING" as const, method: "FARMER_DECLARED" as const, source: "Farmer", observedAt: "2026-03-10T09:00:00.000Z" } },
      createdAt: "2026-03-10T09:00:00.000Z", updatedAt: "2026-03-10T09:00:00.000Z",
    };
    const silageCycle = {
      ...grazingCycle, cropSystem: "GRASS_FIRST_CUT_SILAGE" as const,
      evidence: { cropSystem: { value: "GRASS_FIRST_CUT_SILAGE" as const, method: "FARMER_DECLARED" as const, source: "Farmer", observedAt: "2026-10-31T09:00:00.000Z", previous: grazingCycle.evidence.cropSystem } },
      updatedAt: "2026-10-31T09:00:00.000Z",
    };
    vi.mocked(getFieldWorkspaceContextAction)
      .mockResolvedValueOnce({ cycle: grazingCycle, activities: [], activitiesTruncated: false })
      .mockResolvedValueOnce({ cycle: silageCycle, activities: [], activitiesTruncated: false });
    vi.mocked(saveFieldProductionCycleAction).mockResolvedValue({ cycle: silageCycle, gate: { status: "MISSING_INPUTS", missingInputs: ["productionTargetTDMHa"] } } as unknown as Awaited<ReturnType<typeof saveFieldProductionCycleAction>>);

    renderDrawer(mockFields[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Grass — grazing" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Grass — grazing" }));
    fireEvent.change(screen.getByLabelText("Current crop / use"), { target: { value: "GRASS_FIRST_CUT_SILAGE" } });
    fireEvent.click(screen.getByRole("button", { name: /save use/i }));

    await waitFor(() => expect(saveFieldProductionCycleAction).toHaveBeenCalledWith(expect.objectContaining({
      fieldId: mockFields[0].id, season: "2026", cropSystem: "GRASS_FIRST_CUT_SILAGE", status: "active",
    })));
    await waitFor(() => expect(screen.getByRole("button", { name: "Grass — first-cut silage" })).toBeTruthy());
    expect(screen.getByText(/more production evidence may be needed/i)).toBeTruthy();
  });

  it("Overview uses the active production cycle as the sole displayed crop/use", async () => {
    vi.mocked(getFieldWorkspaceContextAction).mockResolvedValueOnce({
      cycle: {
        id: "cycle-1",
        fieldId: mockFields[0].id,
        season: "2026",
        cropSystem: "GRASS_FIRST_CUT_SILAGE",
        status: "active",
        evidence: {
          cropSystem: { value: "GRASS_FIRST_CUT_SILAGE", method: "FARMER_DECLARED", source: "Farmer", observedAt: "2026-03-10T09:00:00.000Z" },
        },
        createdAt: "2026-03-10T09:00:00.000Z",
        updatedAt: "2026-03-10T09:00:00.000Z",
      },
      activities: [],
      activitiesTruncated: false,
    });
    const field: Field = { ...mockFields[0], plannedUse: { value: "grazing", status: "farmer_adjusted", source: "Farmer", sourceDate: "2026-02-01" } };
    renderDrawer(field);
    await waitFor(() => expect(screen.getByRole("region", { name: "Use" }).textContent).toContain("Current crop / useGrass — first-cut silage"));
    expect(screen.getByRole("region", { name: "Use" }).textContent).not.toMatch(/Planned use/);
  });

  it("History includes confirmed field job actuals with provenance", async () => {
    vi.mocked(getFieldWorkspaceContextAction).mockResolvedValueOnce({
      cycle: null,
      activities: [{
        id: "actual-1",
        kind: "fertiliser_spreading",
        confirmedAt: "2026-04-12T10:00:00.000Z",
        title: "Fertiliser spreading",
        detail: "Completed · 18-6-12 · 500 kg · 4.2 ha",
        provenance: "Confirmed by farmer · manual job",
      }],
      activitiesTruncated: false,
    });
    renderDrawer(mockFields[0]);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    await waitFor(() => expect(document.body.textContent).toContain("Fertiliser spreading"));
    const activity = document.querySelector('[data-history-kind="activity"]') as HTMLElement;
    expect(activity.textContent).toContain("12 Apr 2026");
    expect(activity.textContent).toContain("Confirmed by farmer");
  });

  it("Nutrients leads with the canonical plan and progressively reveals supporting evidence", () => {
    renderDrawer(mockFields[0]);
    fireEvent.click(screen.getByRole("button", { name: "Nutrients" }));
    const chapter = document.querySelector("[data-field-nutrients]") as HTMLElement;
    expect(chapter).toBeTruthy();
    expect(screen.getByRole("heading", { name: /one field\. one evidence path/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /crop & production/i }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: /laboratory soil evidence/i }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /legal & spreading checks/i }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText(/commonage status/i)).toBeNull();
    expect(screen.getByRole("form", { name: /laboratory soil test/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /legal & spreading checks/i }));
    expect(screen.getByLabelText(/commonage status/i)).toBeTruthy();
  });

  it("History lists dated planned-use changes from the provenance chain, newest first, and points to Records", () => {
    const field: Field = {
      ...mockFields[0],
      plannedUse: {
        value: "silage_1st_cut",
        status: "farmer_adjusted",
        source: "Mary",
        sourceDate: "2026-04-10",
        previous: { value: "grazing", status: "farmer_adjusted", source: "Mary", sourceDate: "2026-02-01" },
      },
    };
    renderDrawer(field);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    const list = document.querySelector("[data-history-list]") as HTMLElement;
    const uses = Array.from(list.querySelectorAll('[data-history-kind="use"]')).map((li) => li.textContent);
    expect(uses[0]).toContain("10 Apr 2026");
    expect(uses[0]).toMatch(/Planned use changed to .*silage/i);
    expect(uses[0]).toContain("Was Grazing");
    expect(uses[1]).toContain("Planned use set to Grazing");
    expect(screen.getByRole("link", { name: "Records" }).getAttribute("href")).toBe("/records");
  });

  it("opens the requested chapter", () => {
    renderDrawerWith(<FieldDrawer field={mockFields[0]} initialChapter="history" />);
    expect(screen.getByRole("button", { name: "History" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("archiving asks in place first (no browser dialog) and Split/Merge are honestly unavailable", () => {
    renderDrawer(mockFields[0]);
    fireEvent.click(screen.getByRole("button", { name: /manage field/i }));
    expect(screen.getByText(/split and merge are not available yet/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Archive field" }));
    expect(screen.getByText(/archive .*\? its records are kept/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Archive field" })).toBeTruthy();
  });
});

function renderDrawerWith(node: React.ReactNode) {
  return render(<FarmProvider>{node}</FarmProvider>);
}
