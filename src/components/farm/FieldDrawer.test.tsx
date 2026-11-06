import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// This suite exercises FieldDrawer's own store-driven behaviour, not the
// separate, already-tested FieldAwarenessCard
// (FieldAwarenessCard.test.tsx) it renders inside its "Now" tab — mocked
// here purely to keep this suite from exercising a real Server Action
// (createClient()/next/headers) outside a request context.
vi.mock("@/app/actions/field-awareness", () => ({
  getFieldAwarenessAction: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/app/actions/field-workspace", () => ({
  getFieldWorkspaceContextAction: vi.fn().mockResolvedValue({
    cycle: null,
    activities: [],
    activitiesTruncated: false,
  }),
}));
vi.mock("@/app/actions/fertiliser-field-evidence", () => ({
  loadFieldProductionCycleAction: vi
    .fn()
    .mockResolvedValue({ cycle: null, gate: null }),
  saveFieldProductionCycleAction: vi.fn(),
}));
// Step 4's canonical v2 recommendation (real mode) — mocked at the Server
// Action boundary; each test sets the result it needs.
vi.mock("@/app/actions/fertiliser-plan", () => ({
  getFieldFertiliserStatusAction: vi
    .fn()
    .mockResolvedValue({ status: "blocked", reasonCode: "P3_MISSING_PRODUCTION_CYCLE" }),
}));
// Real-mode store writes go through these canonical Server Actions — mocked
// only at that I/O boundary so the drawer + store logic run for real.
vi.mock("@/app/actions/farm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/actions/farm")>();
  return {
    ...actual,
    updateSlurryApplicationMethodAction: vi.fn().mockResolvedValue(undefined),
    updateSlurryApplicationDateAction: vi.fn().mockResolvedValue(undefined),
    addSlurryCompositionRecordAction: vi.fn(),
    createSlurryAllocationAction: vi.fn(),
    autoAssessFieldLegalSpatialEvidenceAction: vi
      .fn()
      .mockRejectedValue(new Error("not configured in test")),
  };
});

vi.mock("@/app/actions/slurry-allocation-lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/actions/slurry-allocation-lifecycle")>();
  return {
    ...actual,
    loadSlurryPlanStateAction: vi.fn().mockResolvedValue({ housing: [], records: [], originRecords: [] }),
  };
});

import { FarmProvider, useFarmActions, useFields } from "@/store/farm-store";

type FarmActions = ReturnType<typeof useFarmActions>;
import { FieldDrawer } from "./FieldDrawer";
import { mockFields, mockSlurryAllocations } from "@/data/mock-farm";
import type { Field, SlurryAllocation } from "@/domain/types";
import type { Prompt } from "@/orchestration/prompt";
import {
  addSlurryCompositionRecordAction,
  autoAssessFieldLegalSpatialEvidenceAction,
  createSlurryAllocationAction,
  updateSlurryApplicationDateAction,
  updateSlurryApplicationMethodAction,
} from "@/app/actions/farm";
import { getFieldWorkspaceContextAction } from "@/app/actions/field-workspace";
import { saveFieldProductionCycleAction } from "@/app/actions/fertiliser-field-evidence";
import { getFieldFertiliserStatusAction } from "@/app/actions/fertiliser-plan";

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
      description:
        "Not permitted: 2026-10-31 falls within the statutory closed period for chemical_fertiliser in Zone B (09-15 - 01-29).",
      basis: {
        status: "LEGAL_PROHIBITION",
        reasonCode: "CLOSED_PERIOD_CALENDAR",
        consequence:
          "2026-10-31 falls within the statutory closed period for chemical_fertiliser in Zone B (09-15 - 01-29).",
      },
      inputsSnapshot: {
        zone: "B",
        material: "chemical_fertiliser",
        asOfDate: "2026-10-31",
      },
      createdAt: "2026-10-31T09:00:00.000Z",
      regulatory: "compliance_value",
    };

    render(
      <FarmProvider>
        <FieldDrawer
          field={mockFields[0]}
          leadingPrompt={prompt}
          onViewPrompt={() => undefined}
        />
      </FarmProvider>,
    );

    expect(
      screen.getByText("Chemical fertiliser spreading is closed"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        new RegExp(
          `You can’t spread chemical fertiliser on ${mockFields[0].name} right now\. Reopens 30 January\.`,
        ),
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /view rules & evidence/i }),
    ).toBeTruthy();
    expect(screen.queryByText(/Zone B/)).toBeNull();
    expect(screen.queryByText(/09-15/)).toBeNull();
    expect(screen.queryByText(/status needs review/i)).toBeNull();
  });
});

describe("FieldDrawer — automatic legal spatial evidence", () => {
  it("shows mapped DAFM/EPA evidence first and keeps manual correction behind a disclosure", () => {
    const field: Field = {
      ...mockFields[0],
      commonageStatus: {
        value: "not_commonage",
        status: "mapped",
        source: "DAFM Anonymous LPIS 2025 · Commonage Indicator",
        sourceDate: "2025-12-31",
        level: "high",
      },
      waterBufferContext: {
        value: {
          featureType: "surface_water",
          nearestFeature: "Mapped Stream",
          distanceM: 18.4,
          localOverrideStatus: "unknown",
        },
        status: "mapped",
        source: "EPA Water Flow Network / River Network Routes WFS",
        sourceDate: "2026-10-31",
        level: "high",
      },
    };
    renderDrawer(field);
    fireEvent.click(screen.getByRole("button", { name: "Nutrients" }));
    fireEvent.click(
      screen.getByRole("button", { name: /legal & spreading checks/i }),
    );

    expect(screen.getByText("Automatic field checks")).toBeTruthy();
    expect(screen.getByText("Not identified as commonage")).toBeTruthy();
    expect(screen.getByText(/Mapped Stream · 18\.4 m/i)).toBeTruthy();
    // Each public inference carries its source and source date.
    expect(
      screen.getByText(
        /DAFM Anonymous LPIS 2025 · Commonage Indicator · source 31 Dec 2025/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /EPA Water Flow Network \/ River Network Routes WFS · source 31 Oct 2026 · measured from the field boundary/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /No manual answer is needed for a chemical fertiliser quote/i,
      ),
    ).toBeTruthy();
    const correction = screen
      .getByText(/review or correct automatic evidence/i)
      .closest("details");
    expect(correction?.hasAttribute("open")).toBe(false);
  });

  it("never shows a reassuring check for a watercourse inside the chemical-fertiliser buffer", () => {
    const withDistance = (distanceM: number): Field => ({
      ...mockFields[0],
      commonageStatus: {
        value: "not_commonage",
        status: "mapped",
        source: "DAFM Anonymous LPIS 2025 · Commonage Indicator",
        sourceDate: "2025-12-31",
        level: "high",
      },
      waterBufferContext: {
        value: {
          featureType: "surface_water",
          nearestFeature: "Mapped Stream",
          distanceM,
          localOverrideStatus: "unknown",
        },
        status: "mapped",
        source: "EPA Water Flow Network / River Network Routes WFS",
        sourceDate: "2026-10-31",
        level: "high",
      },
    });
    const open = () => {
      fireEvent.click(screen.getByRole("button", { name: "Nutrients" }));
      fireEvent.click(
        screen.getByRole("button", { name: /legal & spreading checks/i }),
      );
    };

    renderDrawer(withDistance(0.5));
    open();
    expect(
      screen.getByText(/Within the statutory 3 m chemical-fertiliser strip/),
    ).toBeTruthy();
    // A strip, never a whole-field prohibition.
    expect(
      screen.getByText(/planned only\s+for the field outside that strip/),
    ).toBeTruthy();
    cleanup();

    renderDrawer(withDistance(18.4));
    open();
    expect(
      screen.queryByText(/Within the statutory 3 m chemical-fertiliser strip/),
    ).toBeNull();
  });

  it("treats an assessed but unresolved local-authority override as complete, matching quote readiness", () => {
    const base = mockFields.find(
      (f) => !mockSlurryAllocations.some((a) => a.fieldId === f.id),
    )!;
    const field: Field = {
      ...base,
      commonageStatus: {
        value: "not_commonage",
        status: "mapped",
        source: "DAFM Anonymous LPIS 2025 · Commonage Indicator",
      },
      waterBufferContext: {
        value: {
          featureType: "surface_water",
          nearestFeature: "Mapped Stream",
          distanceM: 18.4,
          localOverrideStatus: "unknown",
        },
        status: "mapped",
        source: "EPA Water Flow Network / River Network Routes WFS",
      },
    };
    renderDrawer(field);
    fireEvent.click(screen.getByRole("button", { name: "Nutrients" }));

    const stage = screen.getByRole("button", {
      name: /legal & spreading checks/i,
    });
    expect(stage.textContent).toMatch(/Complete ·/);
    expect(stage.getAttribute("aria-expanded")).toBe("false");
  });
});

it("surfaces a public EPA/LPIS conflict without overwriting farmer-confirmed legal evidence", async () => {
  const field: Field = {
    ...mockFields[0],
    commonageStatus: {
      value: "not_commonage",
      status: "farmer_adjusted",
      source: "Farmer",
    },
    waterBufferContext: {
      value: {
        featureType: "surface_water",
        nearestFeature: "Farmer stream",
        distanceM: 25,
        localOverrideStatus: "unknown",
      },
      status: "farmer_adjusted",
      source: "Farmer",
    },
  };
  vi.mocked(autoAssessFieldLegalSpatialEvidenceAction).mockResolvedValueOnce({
    assessment: {
      assessedAt: "2026-11-01T20:00:00.000Z",
      commonage: {
        state: "resolved",
        value: "commonage",
        source: "DAFM LPIS",
        detail: "Public LPIS match",
      },
      water: {
        state: "resolved",
        featureType: "surface_water",
        nearestFeature: "EPA Stream",
        distanceM: 8.4,
        source: "EPA Water Flow Network",
        detail: "Public EPA match",
      },
      localOverride: {
        state: "unknown",
        source: "Local authority",
        detail: "No national source",
      },
    },
    field: { ...mockFields[0] },
    groundwaterFeatures: [],
  });

  renderDrawer(field);
  fireEvent.click(screen.getByRole("button", { name: "Nutrients" }));
  fireEvent.click(
    screen.getByRole("button", { name: /legal & spreading checks/i }),
  );

  expect(
    await screen.findByText("Public mapping differs from saved field evidence"),
  ).toBeTruthy();
  expect(
    screen.getByText(
      /saved as not commonage; public LPIS currently reports commonage/i,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(
      /saved distance 25(?:\.0)? m; public EPA mapping currently reports 8\.4 m/i,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(/kept the farmer-confirmed value unchanged/i),
  ).toBeTruthy();
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
    expect(
      screen.queryByRole("button", { name: /map this field/i }),
    ).toBeNull();
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

  it("labels a public LPIS boundary as 'Refine boundary' rather than pretending the detected edge is final", () => {
    const imported: Field = {
      ...mockFields[0],
      polygonSource: "lpis_imported",
      lpisRef: "dafm_lpis_2025:2025:test-parcel",
    };
    renderDrawer(imported);
    fireEvent.click(screen.getByRole("button", { name: /manage field/i }));
    expect(screen.getByRole("button", { name: "Refine boundary" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit boundary" })).toBeNull();
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
    fireEvent.click(
      screen.getByRole("button", { name: /legal & spreading checks/i }),
    );
  }

  it("defaults commonage status to 'unknown' and fails closed until a farmer sets it", () => {
    const field = mockFields[0];
    expect(field.commonageStatus).toBeUndefined();
    renderLiveDrawer(field.id);
    openConstraintsTab();
    const select = screen.getByLabelText(
      /commonage status/i,
    ) as HTMLSelectElement;
    expect(select.value).toBe("unknown");
  });

  it("lets a farmer record real commonage status, live-reflected the same way the real /fields screen re-renders", () => {
    const field = mockFields[0];
    renderLiveDrawer(field.id);
    openConstraintsTab();
    const select = screen.getByLabelText(
      /commonage status/i,
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "commonage" } });
    expect(
      (screen.getByLabelText(/commonage status/i) as HTMLSelectElement).value,
    ).toBe("commonage");
  });

  it("reveals distance/local-override inputs only once a water feature is selected, and captures a real distance", () => {
    const field = mockFields[0];
    renderLiveDrawer(field.id);
    openConstraintsTab();
    expect(screen.queryByLabelText(/distance to that feature/i)).toBeNull();

    const featureSelect = screen.getByLabelText(
      /nearest regulated water feature/i,
    ) as HTMLSelectElement;
    fireEvent.change(featureSelect, { target: { value: "surface_water" } });

    const distanceInput = screen.getByLabelText(
      /distance to that feature/i,
    ) as HTMLInputElement;
    fireEvent.change(distanceInput, { target: { value: "2.9" } });
    expect(
      (screen.getByLabelText(/distance to that feature/i) as HTMLInputElement)
        .value,
    ).toBe("2.9");
  });

  it("offers a slurry application-method selector only when this field has a real slurry allocation", () => {
    const allocated = mockSlurryAllocations.find(
      (a) => a.fieldId === mockFields[0].id,
    );
    expect(allocated).toBeDefined();
    renderLiveDrawer(mockFields[0].id);
    openConstraintsTab();
    expect(
      screen.getByLabelText(/how will this slurry be spread/i),
    ).toBeTruthy();

    const unallocatedField = mockFields.find(
      (f) => !mockSlurryAllocations.some((a) => a.fieldId === f.id),
    );
    if (unallocatedField) {
      cleanup();
      renderLiveDrawer(unallocatedField.id);
      openConstraintsTab();
      expect(
        screen.queryByLabelText(/how will this slurry be spread/i),
      ).toBeNull();
    }
  });

  // Codex audit HIGH (round 31): a bare `.find()` showed/edited only the
  // first of a field's own real allocations, silently hiding a real
  // second one from a different housing source — the schema's own
  // `unique (field_id, housing_id)` constraint deliberately allows this.
  it("offers a separate method selector for each real allocation when a field has more than one, from different housing sources", () => {
    const field = mockFields[0];
    const twoAllocations = [
      {
        fieldId: field.id,
        housingId: "housing-a",
        priority: "high" as const,
        volumeM3: 60,
        score: 90,
      },
      {
        fieldId: field.id,
        housingId: "housing-b",
        priority: "high" as const,
        volumeM3: 40,
        score: 85,
      },
    ];
    render(
      <FarmProvider
        remote
        initialState={{
          farm: {
            id: "farm-1",
            name: "Test Farm",
            location: { county: "Cork", centroid: [0, 0] },
            primaryEnterprises: ["suckler_beef"],
            units: "metric",
            ownerName: "Farmer",
          },
          fields: [field],
          livestockGroups: [],
          housing: [],
          slurryAllocations: twoAllocations,
          slurryCompositionRecords: [],
        }}
      >
        <FieldDrawer field={field} />
      </FarmProvider>,
    );
    openConstraintsTab();
    const selectors = screen.getAllByLabelText(
      /how will this slurry be spread/i,
    );
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
    expect(
      mockSlurryAllocations.find((a) => a.fieldId === field.id),
    ).toBeDefined();
    renderLiveDrawer(field.id);
    openConstraintsTab();

    const dateInput = screen.getByLabelText(
      /application date/i,
    ) as HTMLInputElement;
    expect(dateInput.value).toBe("");
    fireEvent.change(dateInput, { target: { value: "2026-03-14" } });
    expect(
      (screen.getByLabelText(/application date/i) as HTMLInputElement).value,
    ).toBe("2026-03-14");
  });
});

describe("FieldDrawer — arriving from What Matters' 'Add spreading details'", () => {
  const field = mockFields[0];
  const farm = {
    id: "farm-1",
    name: "Test Farm",
    location: { county: "Cork", centroid: [0, 0] as [number, number] },
    primaryEnterprises: ["suckler_beef" as const],
    units: "metric" as const,
    ownerName: "Farmer",
  };
  const tracked = <T,>(value: T) => ({
    value,
    status: "farmer_adjusted" as const,
    source: "Farmer",
  });

  function LiveRequestedDrawer({
    missing,
  }: {
    missing: ("method" | "date")[];
  }) {
    const live = useFields().find((f) => f.id === field.id)!;
    return <FieldDrawer field={live} slurryDetailsRequest={missing} />;
  }

  function renderRequested(
    allocation: SlurryAllocation,
    missing: ("method" | "date")[],
  ) {
    return render(
      <FarmProvider
        remote
        initialState={{
          farm,
          fields: [field],
          livestockGroups: [],
          housing: [],
          slurryAllocations: [allocation],
          slurryCompositionRecords: [],
        }}
      >
        <LiveRequestedDrawer missing={missing} />
      </FarmProvider>,
    );
  }

  const base: SlurryAllocation = {
    fieldId: field.id,
    housingId: "h1",
    priority: "high",
    volumeM3: 100,
    score: 90,
  };

  it("opens straight on the spreading details and asks for both when both are missing", () => {
    renderRequested(base, ["method", "date"]);
    expect(
      screen.getByText(/planned spreading method and date for this field/i),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(/how will this slurry be spread/i),
    ).toBeTruthy();
    expect(screen.getByLabelText(/application date/i)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /back to today/i }).getAttribute("href"),
    ).toBe("/today");
  });

  it("asks only for the method when the date is already on record", () => {
    renderRequested({ ...base, applicationDate: tracked("2026-02-15") }, [
      "method",
    ]);
    expect(
      screen.getByText(/planned spreading method for this field/i),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(/how will this slurry be spread/i),
    ).toBeTruthy();
    expect(screen.queryByLabelText(/application date/i)).toBeNull();
  });

  it("asks only for the date when the method is already on record", () => {
    renderRequested({ ...base, applicationMethod: tracked("LESS" as const) }, [
      "date",
    ]);
    expect(
      screen.getByText(/planned spreading date for this field/i),
    ).toBeTruthy();
    expect(screen.getByLabelText(/application date/i)).toBeTruthy();
    expect(
      screen.queryByLabelText(/how will this slurry be spread/i),
    ).toBeNull();
  });

  it("saves through the canonical store actions and then confirms without promising a recommendation", () => {
    renderRequested(base, ["method", "date"]);
    fireEvent.change(screen.getByLabelText(/how will this slurry be spread/i), {
      target: { value: "LESS" },
    });
    fireEvent.change(screen.getByLabelText(/application date/i), {
      target: { value: "2026-03-14" },
    });
    expect(updateSlurryApplicationMethodAction).toHaveBeenCalledWith(
      field.id,
      "h1",
      "LESS",
      "Farmer",
    );
    expect(updateSlurryApplicationDateAction).toHaveBeenCalledWith(
      field.id,
      "h1",
      "2026-03-14",
      "Farmer",
    );
    expect(screen.getByText(/spreading details added/i)).toBeTruthy();
    expect(screen.queryByText(/for this field's slurry before/i)).toBeNull();
    // The just-filled inputs stay visible with their saved values.
    expect(
      (
        screen.getByLabelText(
          /how will this slurry be spread/i,
        ) as HTMLSelectElement
      ).value,
    ).toBe("LESS");
    expect(document.body.textContent).not.toMatch(
      /you will (get|see) a recommendation/i,
    );
  });
});

describe("FieldDrawer — field workspace chapters (Farm + Fields redesign)", () => {
  it("has only Overview, Nutrients and History — no Soil, Activity or Constraints chapter", () => {
    renderDrawer(mockFields[0]);
    const nav = screen.getByRole("navigation", { name: "Field chapters" });
    expect(
      Array.from(nav.querySelectorAll("button")).map((b) => b.textContent),
    ).toEqual(["Overview", "Nutrients", "History"]);
    for (const name of ["Soil", "Activity", "Constraints", "Now"])
      expect(screen.queryByRole("button", { name })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Overview" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("Overview uses only the production cycle for crop/use and does not repeat the legacy planned-use field", () => {
    const field: Field = {
      ...mockFields[0],
      plannedUse: {
        value: "silage_1st_cut",
        status: "farmer_adjusted",
        source: "Farmer",
        sourceDate: "2026-03-02",
      },
    };
    renderDrawer(field);
    const use = screen.getByRole("region", { name: "Use" });
    expect(use.textContent).toContain("Current crop / useNot recorded");
    expect(use.textContent).not.toMatch(/Planned use/);
    expect(use.textContent).not.toContain("Not recorded for fields yet");
    expect(use.textContent).toMatch(/Field grazing movements/i);
  });

  it("lets the farmer change current field use inline using the canonical production cycle", async () => {
    const grazingCycle = {
      id: "cycle-1",
      fieldId: mockFields[0].id,
      season: "2026",
      cropSystem: "GRASS_GRAZING" as const,
      status: "active" as const,
      evidence: {
        cropSystem: {
          value: "GRASS_GRAZING" as const,
          method: "FARMER_DECLARED" as const,
          source: "Farmer",
          observedAt: "2026-03-10T09:00:00.000Z",
        },
      },
      createdAt: "2026-03-10T09:00:00.000Z",
      updatedAt: "2026-03-10T09:00:00.000Z",
    };
    const silageCycle = {
      ...grazingCycle,
      cropSystem: "GRASS_FIRST_CUT_SILAGE" as const,
      evidence: {
        cropSystem: {
          value: "GRASS_FIRST_CUT_SILAGE" as const,
          method: "FARMER_DECLARED" as const,
          source: "Farmer",
          observedAt: "2026-10-31T09:00:00.000Z",
          previous: grazingCycle.evidence.cropSystem,
        },
      },
      updatedAt: "2026-10-31T09:00:00.000Z",
    };
    vi.mocked(getFieldWorkspaceContextAction)
      .mockResolvedValueOnce({
        cycle: grazingCycle,
        activities: [],
        activitiesTruncated: false,
      })
      .mockResolvedValueOnce({
        cycle: silageCycle,
        activities: [],
        activitiesTruncated: false,
      });
    vi.mocked(saveFieldProductionCycleAction).mockResolvedValue({
      cycle: silageCycle,
      gate: {
        status: "MISSING_INPUTS",
        missingInputs: ["productionTargetTDMHa"],
      },
    } as unknown as Awaited<ReturnType<typeof saveFieldProductionCycleAction>>);

    renderDrawer(mockFields[0]);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Grass — grazing" }),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Grass — grazing" }));
    fireEvent.change(screen.getByLabelText("Current crop / use"), {
      target: { value: "GRASS_FIRST_CUT_SILAGE" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save use/i }));

    await waitFor(() =>
      expect(saveFieldProductionCycleAction).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldId: mockFields[0].id,
          season: "2026",
          cropSystem: "GRASS_FIRST_CUT_SILAGE",
          status: "active",
        }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Grass — first-cut silage" }),
      ).toBeTruthy(),
    );
    expect(
      screen.getByText(/more production evidence may be needed/i),
    ).toBeTruthy();
  });

  it("deep-links directly into the field-use editor and focuses the exact control", async () => {
    render(
      <FarmProvider>
        <FieldDrawer
          field={mockFields[0]}
          planningSeason="2027"
          focusFieldUse
        />
      </FarmProvider>,
    );

    const select = await screen.findByLabelText("Current crop / use");
    expect(select).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(select));
    expect(document.getElementById("field-use")).toBeTruthy();
    // The chosen use is explained with an example, and follows the choice.
    const context = () =>
      document.getElementById(select.getAttribute("aria-describedby") ?? "")
        ?.textContent;
    fireEvent.change(select, { target: { value: "GRASS_FIRST_CUT_SILAGE" } });
    expect(context()).toMatch(/Closed in spring for one silage cut/);
    fireEvent.change(select, { target: { value: "GRASS_GRAZING" } });
    expect(context()).toMatch(/e\.g\. paddocks in the grazing block/);
  });

  it("renders exactly one satellite history display, only on the Overview chapter", async () => {
    render(
      <FarmProvider>
        <FieldDrawer field={mockFields[0]} />
      </FarmProvider>,
    );
    expect(
      await screen.findAllByRole("button", { name: /field through time/i }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Nutrients" }));
    expect(screen.queryByRole("button", { name: /field through time/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.queryByRole("button", { name: /field through time/i })).toBeNull();
  });

  it("deep-links the mapped-area readiness row to the boundary control that defines the field's area", async () => {
    render(
      <FarmProvider>
        <FieldDrawer
          field={mockFields[0]}
          planningSeason="2027"
          focusFieldArea
        />
      </FarmProvider>,
    );

    const boundary = await screen.findByRole("button", {
      name: mockFields[0].polygon ? "Edit boundary" : "Map this field",
    });
    expect(boundary.id).toBe("field-area");
    expect(
      screen
        .getByRole("button", { name: /manage field/i })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(boundary));
  });

  it.each([
    ["production-cycle", "1 · Crop & production"],
    ["soil-evidence", "2 · Laboratory soil evidence"],
    ["legal-checks", "3 · Legal & spreading checks"],
  ] as const)(
    "deep-links quote readiness into the %s Nutrients stage, opening and focusing it",
    async (focus, label) => {
      render(
        <FarmProvider>
          <FieldDrawer
            field={mockFields[0]}
            initialChapter="nutrients"
            planningSeason="2027"
            nutrientFocus={focus}
          />
        </FarmProvider>,
      );
      const stage = await screen.findByRole("region", { name: label });
      expect(stage.id).toBe(focus);
      const toggle = within(stage).getAllByRole("button")[0];
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      await waitFor(() =>
        expect(stage.contains(document.activeElement)).toBe(true),
      );
    },
  );

  it.each([
    ["soil-test-date", "Sample date"],
    ["soil-p", "P (mg/L)"],
    ["soil-k", "K (mg/L)"],
    ["commonage", "Commonage status"],
    ["water-buffer", "Nearest regulated water feature"],
  ] as const)(
    "deep-links quote readiness to the exact %s control, not just its stage",
    async (focus, controlLabel) => {
      const field: Field = {
        ...mockFields[0],
        fertility: {},
        commonageStatus: undefined,
        waterBufferContext: undefined,
      };
      render(
        <FarmProvider>
          <FieldDrawer
            field={field}
            initialChapter="nutrients"
            planningSeason="2027"
            nutrientFocus={focus}
          />
        </FarmProvider>,
      );
      const control = await screen.findByLabelText(controlLabel);
      await waitFor(() => expect(document.activeElement).toBe(control));
      // A control inside a closed disclosure is revealed, never focused
      // invisibly.
      expect(control.closest("details")?.open ?? true).toBe(true);
    },
  );

  it("F009: a 2027 slurry readiness link focuses the 2027 allocation, never an incomplete 2026 one listed first", async () => {
    const allocation = (
      housingId: string,
      volumeM3: number,
      date: string,
    ): SlurryAllocation => ({
      fieldId: mockFields[0].id,
      housingId,
      volumeM3,
      applicationDate: { value: date, status: "farmer_adjusted", source: "Farmer" },
    });
    const allocations = [
      allocation("h-2026", 100, "2026-03-01"),
      allocation("h-2027", 60, "2027-02-01"),
    ];
    const renderFor = (planningSeason?: string) =>
      render(
        <FarmProvider
          remote
          initialState={{
            farm: {
              id: "farm-1",
              name: "Test Farm",
              location: { county: "Cork", centroid: [0, 0] },
              primaryEnterprises: ["suckler_beef"],
              units: "metric",
              ownerName: "Farmer",
            },
            fields: [mockFields[0]],
            livestockGroups: [],
            housing: [],
            slurryAllocations: allocations,
            slurryCompositionRecords: [],
          }}
        >
          <FieldDrawer
            field={mockFields[0]}
            initialChapter="nutrients"
            {...(planningSeason ? { planningSeason } : {})}
            nutrientFocus="slurry-spreading"
          />
        </FarmProvider>,
      );

    renderFor("2027");
    const target2027 = await screen.findByLabelText(/\(60 m³ allocation\)/);
    await waitFor(() => expect(document.activeElement).toBe(target2027));
    cleanup();

    // Control: the 2026 season link still focuses the 2026 allocation.
    renderFor("2026");
    const target2026 = await screen.findByLabelText(/\(100 m³ allocation\)/);
    await waitFor(() => expect(document.activeElement).toBe(target2026));
  });

  it("focuses the prior-fertiliser answer for a current-season deep link", async () => {
    render(
      <FarmProvider>
        <FieldDrawer
          field={mockFields[0]}
          initialChapter="nutrients"
          nutrientFocus="prior-fertiliser"
        />
      </FarmProvider>,
    );
    const group = await screen.findByRole("radiogroup", {
      name: "Chemical fertiliser already applied",
    });
    const answerNo = within(group).getByRole("radio", { name: "No" });
    await waitFor(() => expect(document.activeElement).toBe(answerNo));
  });

  it("saves field use into the quote-planning season carried from Fertiliser Plan", async () => {
    const savedCycle = {
      id: "cycle-2027",
      fieldId: mockFields[0].id,
      season: "2027",
      cropSystem: "GRASS_GRAZING" as const,
      status: "active" as const,
      evidence: {
        cropSystem: {
          value: "GRASS_GRAZING" as const,
          method: "FARMER_DECLARED" as const,
          source: "Farmer",
        },
      },
      createdAt: "2026-11-01T19:00:00.000Z",
      updatedAt: "2026-11-01T19:00:00.000Z",
    };
    vi.mocked(getFieldWorkspaceContextAction)
      .mockResolvedValueOnce({
        cycle: null,
        activities: [],
        activitiesTruncated: false,
      })
      .mockResolvedValueOnce({
        cycle: savedCycle,
        activities: [],
        activitiesTruncated: false,
      });
    vi.mocked(saveFieldProductionCycleAction).mockResolvedValue({
      cycle: savedCycle,
      gate: null,
    });

    render(
      <FarmProvider>
        <FieldDrawer field={mockFields[0]} planningSeason="2027" />
      </FarmProvider>,
    );

    await waitFor(() =>
      expect(getFieldWorkspaceContextAction).toHaveBeenCalledWith(
        mockFields[0].id,
        "2027",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Not recorded" }));
    fireEvent.click(screen.getByRole("button", { name: /save use/i }));

    await waitFor(() =>
      expect(saveFieldProductionCycleAction).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldId: mockFields[0].id,
          season: "2027",
          cropSystem: "GRASS_GRAZING",
          status: "planned",
        }),
      ),
    );
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
          cropSystem: {
            value: "GRASS_FIRST_CUT_SILAGE",
            method: "FARMER_DECLARED",
            source: "Farmer",
            observedAt: "2026-03-10T09:00:00.000Z",
          },
        },
        createdAt: "2026-03-10T09:00:00.000Z",
        updatedAt: "2026-03-10T09:00:00.000Z",
      },
      activities: [],
      activitiesTruncated: false,
    });
    const field: Field = {
      ...mockFields[0],
      plannedUse: {
        value: "grazing",
        status: "farmer_adjusted",
        source: "Farmer",
        sourceDate: "2026-02-01",
      },
    };
    renderDrawer(field);
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Use" }).textContent).toContain(
        "Current crop / useGrass — first-cut silage",
      ),
    );
    expect(screen.getByRole("region", { name: "Use" }).textContent).not.toMatch(
      /Planned use/,
    );
  });

  it("History includes confirmed field job actuals with provenance", async () => {
    vi.mocked(getFieldWorkspaceContextAction).mockResolvedValueOnce({
      cycle: null,
      activities: [
        {
          id: "actual-1",
          kind: "fertiliser_spreading",
          confirmedAt: "2026-04-12T10:00:00.000Z",
          title: "Fertiliser spreading",
          detail: "Completed · 18-6-12 · 500 kg · 4.2 ha",
          provenance: "Confirmed by farmer · manual job",
        },
      ],
      activitiesTruncated: false,
    });
    renderDrawer(mockFields[0]);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    await waitFor(() =>
      expect(document.body.textContent).toContain("Fertiliser spreading"),
    );
    const activity = document.querySelector(
      '[data-history-kind="activity"]',
    ) as HTMLElement;
    expect(activity.textContent).toContain("12 Apr 2026");
    expect(activity.textContent).toContain("Confirmed by farmer");
  });

  it("Nutrients leads with the canonical plan and progressively reveals supporting evidence", () => {
    renderDrawer(mockFields[0]);
    fireEvent.click(screen.getByRole("button", { name: "Nutrients" }));
    const chapter = document.querySelector(
      "[data-field-nutrients]",
    ) as HTMLElement;
    expect(chapter).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: /one field\. one evidence path/i }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /crop & production/i })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: /laboratory soil evidence/i })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: /legal & spreading checks/i })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByLabelText(/commonage status/i)).toBeNull();
    expect(
      screen.getByRole("form", { name: /laboratory soil test/i }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /legal & spreading checks/i }),
    );
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
        previous: {
          value: "grazing",
          status: "farmer_adjusted",
          source: "Mary",
          sourceDate: "2026-02-01",
        },
      },
    };
    renderDrawer(field);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    const list = document.querySelector("[data-history-list]") as HTMLElement;
    const uses = Array.from(
      list.querySelectorAll('[data-history-kind="use"]'),
    ).map((li) => li.textContent);
    expect(uses[0]).toContain("10 Apr 2026");
    expect(uses[0]).toMatch(/Planned use changed to .*silage/i);
    expect(uses[0]).toContain("Was Grazing");
    expect(uses[1]).toContain("Planned use set to Grazing");
    expect(
      screen.getByRole("link", { name: "Records" }).getAttribute("href"),
    ).toBe("/records");
  });

  it("opens the requested chapter", () => {
    renderDrawerWith(
      <FieldDrawer field={mockFields[0]} initialChapter="history" />,
    );
    expect(
      screen
        .getByRole("button", { name: "History" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("deleting a field is deliberately hard to do by mistake and promises a 30-day restore window", () => {
    const field = mockFields[0];
    renderDrawer(field);
    fireEvent.click(screen.getByRole("button", { name: /manage field/i }));
    expect(screen.getByText(/split and merge are not available yet/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete field" }));
    expect(screen.getByText(new RegExp(`delete ${field.name}\\?`, "i"))).toBeTruthy();
    expect(screen.getByText(/restored for 30 days/i)).toBeTruthy();

    const confirm = screen.getByRole("textbox");
    const deleteButton = screen.getByRole("button", { name: "Delete field" });
    expect((deleteButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(confirm, { target: { value: "wrong field" } });
    expect((deleteButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(confirm, { target: { value: field.name } });
    expect((deleteButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Delete field" })).toBeTruthy();
  });
});

function renderDrawerWith(node: React.ReactNode) {
  return render(<FarmProvider>{node}</FarmProvider>);
}

describe("FieldDrawer — canonical step 4 recommendation (real farm)", () => {
  const realFarm = {
    id: "farm-1",
    name: "Test Farm",
    location: { county: "Cork", centroid: [0, 0] as [number, number] },
    primaryEnterprises: ["suckler_beef" as const],
    units: "metric" as const,
    ownerName: "Farmer",
  };
  function renderReal(planningSeason?: string) {
    return render(
      <FarmProvider
        remote
        initialState={{
          farm: realFarm,
          fields: [mockFields[0]],
          livestockGroups: [],
          housing: [],
          slurryAllocations: [],
          slurryCompositionRecords: [],
        }}
      >
        <FieldDrawer
          field={mockFields[0]}
          initialChapter="nutrients"
          planningSeason={planningSeason}
        />
      </FarmProvider>,
    );
  }

  it("shows the same v2 planning-season calculation the farm plan and quote use", async () => {
    vi.mocked(getFieldFertiliserStatusAction).mockResolvedValueOnce({
      status: "ok",
      engineVersion: "grass-v2",
      cropSystem: "GRASS_GRAZING",
      requirementKgHa: { n: 182, p: 20, k: 60 },
      organicCreditsKgHa: { n: 12, p: 5, k: 30 },
      confirmedAppliedKgHa: { n: 0, p: 0, k: 0 },
      remainingKgHa: { n: 170, p: 15, k: 30 },
      recommendedProducts: [
        { name: "CAN", npkAnalysis: "27-0-0", rateKgHa: 630, totalKg: 2520, costEur: 0 },
      ],
      ruleTraces: {},
      limitations: [],
      confirmedApplications: 0,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });
    renderReal("2027");

    const section = await screen.findByRole("region", {
      name: "Nutrient recommendation",
    });
    expect(getFieldFertiliserStatusAction).toHaveBeenCalledWith(
      mockFields[0].id,
      "2027",
    );
    await within(section).findByText("CAN");
    expect(within(section).getByText(/4 · Recommendation · 2027/)).toBeTruthy();
    const nRow = within(section).getByRole("row", { name: /^N/ });
    expect(nRow.textContent).toContain("182");
    expect(nRow.textContent).toContain("12");
    expect(nRow.textContent).toContain("170");
    const link = within(section).getByRole("link", {
      name: /Full calculation & evidence/,
    });
    expect(link.getAttribute("href")).toBe(
      `/fertiliser-plan/calculations?field=${encodeURIComponent(mockFields[0].id)}&season=2027`,
    );
  });

  it("F006: recalculates the recommendation after a slurry edit is saved, without reopening the drawer", async () => {
    const okResult = {
      status: "ok" as const,
      engineVersion: "grass-v2",
      cropSystem: "GRASS_GRAZING",
      requirementKgHa: { n: 182, p: 20, k: 60 },
      organicCreditsKgHa: { n: 12, p: 5, k: 30 },
      confirmedAppliedKgHa: { n: 0, p: 0, k: 0 },
      remainingKgHa: { n: 170, p: 15, k: 30 },
      recommendedProducts: [
        { name: "CAN", npkAnalysis: "27-0-0", rateKgHa: 630, totalKg: 2520, costEur: 0 },
      ],
      ruleTraces: {},
      limitations: [],
      confirmedApplications: 0,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    };
    vi.mocked(getFieldFertiliserStatusAction).mockClear();
    vi.mocked(getFieldFertiliserStatusAction)
      .mockResolvedValueOnce({ status: "blocked", reasonCode: "P3_INCOMPLETE_SLURRY_EVIDENCE" })
      .mockResolvedValueOnce(okResult);
    let resolveSave: () => void = () => {};
    vi.mocked(updateSlurryApplicationMethodAction).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSave = () => resolve(undefined as never);
        }),
    );
    render(
      <FarmProvider
        remote
        initialState={{
          farm: realFarm,
          fields: [mockFields[0]],
          livestockGroups: [],
          housing: [],
          slurryAllocations: [
            {
              fieldId: mockFields[0].id,
              housingId: "h1",
              volumeM3: 40,
              applicationDate: { value: "2026-03-01", status: "farmer_adjusted", source: "Farmer" },
            },
          ],
          slurryCompositionRecords: [],
        }}
      >
        <FieldDrawer
          field={mockFields[0]}
          initialChapter="nutrients"
          slurryDetailsRequest={["method"]}
        />
      </FarmProvider>,
    );

    const section = await screen.findByRole("region", { name: "Nutrient recommendation" });
    await within(section).findByText(/spreading method, date, store or soil index is missing/);
    expect(getFieldFertiliserStatusAction).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText(/how will this slurry be spread/i), {
      target: { value: "LESS" },
    });
    // Not recalculated before the server has saved the edit.
    expect(getFieldFertiliserStatusAction).toHaveBeenCalledTimes(1);
    resolveSave();

    await within(section).findByText("CAN");
    expect(getFieldFertiliserStatusAction).toHaveBeenCalledTimes(2);
    expect(within(section).queryByText(/spreading method, date, store or soil index is missing/)).toBeNull();
  });

  /** Exposes the real store actions to a test, inside the same provider
   * as the drawer. */
  function StoreActionsProbe({ onReady }: { onReady: (actions: FarmActions) => void }) {
    const actions = useFarmActions();
    onReady(actions);
    return null;
  }

  function renderRealDrawerWithStore() {
    let storeActions: FarmActions | undefined;
    render(
      <FarmProvider
        remote
        initialState={{
          farm: realFarm,
          fields: [mockFields[0]],
          livestockGroups: [],
          housing: [],
          slurryAllocations: [],
          slurryCompositionRecords: [],
        }}
      >
        <StoreActionsProbe onReady={(actions) => { storeActions = actions; }} />
        <FieldDrawer field={mockFields[0]} initialChapter="nutrients" />
      </FarmProvider>,
    );
    return () => storeActions!;
  }

  const blockedThenOk = () => {
    vi.mocked(getFieldFertiliserStatusAction).mockClear();
    vi.mocked(getFieldFertiliserStatusAction)
      .mockResolvedValueOnce({ status: "blocked", reasonCode: "P3_INCOMPLETE_SLURRY_EVIDENCE" })
      .mockResolvedValueOnce({
        status: "ok",
        engineVersion: "grass-v2",
        cropSystem: "GRASS_GRAZING",
        requirementKgHa: { n: 182, p: 20, k: 60 },
        organicCreditsKgHa: { n: 12, p: 5, k: 30 },
        confirmedAppliedKgHa: { n: 0, p: 0, k: 0 },
        remainingKgHa: { n: 170, p: 15, k: 30 },
        recommendedProducts: [{ name: "CAN", npkAnalysis: "27-0-0", rateKgHa: 630, totalKg: 2520, costEur: 0 }],
        ruleTraces: {},
        limitations: [],
        confirmedApplications: 0,
        applicationsWithUnknownComposition: 0,
        applicationsExcludedMultiField: 0,
        truncated: false,
      });
  };

  it("F006: recalculates the recommendation after a slurry composition record is saved", async () => {
    blockedThenOk();
    let resolveSave: (record: never) => void = () => {};
    vi.mocked(addSlurryCompositionRecordAction).mockImplementationOnce(
      () => new Promise((resolve) => { resolveSave = resolve as never; }),
    );
    const actions = renderRealDrawerWithStore();
    const section = await screen.findByRole("region", { name: "Nutrient recommendation" });
    await within(section).findByText(/spreading method, date, store or soil index is missing/);
    expect(getFieldFertiliserStatusAction).toHaveBeenCalledTimes(1);

    const saved = actions().addSlurryComposition({
      housingId: "h1",
      slurryType: "cattle",
      status: "farmer_adjusted",
      dmPct: 6,
      sampleDate: "2026-02-01",
      source: "Farmer",
    } as never);
    // Not recalculated before the server has persisted the record.
    expect(getFieldFertiliserStatusAction).toHaveBeenCalledTimes(1);
    resolveSave({ id: "comp-1", farmId: "farm-1", housingId: "h1", slurryType: "cattle", status: "farmer_adjusted", dmPct: 6, sampleDate: "2026-02-01", source: "Farmer", recordedAt: "2026-02-01T00:00:00.000Z" } as never);
    await saved;

    await within(section).findByText("CAN");
    expect(getFieldFertiliserStatusAction).toHaveBeenCalledTimes(2);
  });

  it("F006: recalculates the recommendation after a new slurry allocation is created", async () => {
    blockedThenOk();
    vi.mocked(createSlurryAllocationAction).mockResolvedValueOnce({
      status: "saved",
      allocation: {
        fieldId: mockFields[0].id,
        housingId: "h1",
        volumeM3: 40,
        applicationMethod: { value: "LESS", status: "farmer_adjusted", source: "Farmer" },
        applicationDate: { value: "2026-03-01", status: "farmer_adjusted", source: "Farmer" },
      },
    } as never);
    const actions = renderRealDrawerWithStore();
    const section = await screen.findByRole("region", { name: "Nutrient recommendation" });
    await within(section).findByText(/spreading method, date, store or soil index is missing/);
    expect(getFieldFertiliserStatusAction).toHaveBeenCalledTimes(1);

    await actions().createSlurryAllocation(
      { fieldId: mockFields[0].id, housingId: "h1", volumeM3: "40", applicationMethod: "LESS", applicationDate: "2026-03-01" },
      "Farmer",
    );

    await within(section).findByText("CAN");
    expect(getFieldFertiliserStatusAction).toHaveBeenCalledTimes(2);
  });

  it("F006: does not recalculate after a failed composition save", async () => {
    vi.mocked(getFieldFertiliserStatusAction).mockClear();
    vi.mocked(getFieldFertiliserStatusAction).mockResolvedValue({ status: "blocked", reasonCode: "P3_INCOMPLETE_SLURRY_EVIDENCE" });
    vi.mocked(addSlurryCompositionRecordAction).mockRejectedValueOnce(new Error("write failed"));
    const actions = renderRealDrawerWithStore();
    const section = await screen.findByRole("region", { name: "Nutrient recommendation" });
    await within(section).findByText(/spreading method, date, store or soil index is missing/);

    await expect(
      actions().addSlurryComposition({ housingId: "h1", slurryType: "cattle", status: "farmer_adjusted", dmPct: 6, sampleDate: "2026-02-01", source: "Farmer" } as never),
    ).rejects.toThrow("write failed");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getFieldFertiliserStatusAction).toHaveBeenCalledTimes(1);
  });

  it("shows the excluded 3 m water strip with its statutory source next to the products sized to the rest", async () => {
    vi.mocked(getFieldFertiliserStatusAction).mockResolvedValueOnce({
      status: "ok",
      engineVersion: "grass-v2",
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
      recommendedProducts: [
        { name: "CAN", npkAnalysis: "27-0-0", rateKgHa: 463, totalKg: 449.1, costEur: 0 },
      ],
      ruleTraces: {},
      limitations: [],
      confirmedApplications: 0,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });
    renderReal("2027");
    const section = await screen.findByRole("region", {
      name: "Nutrient recommendation",
    });
    const note = await within(section).findByText(/within 3 m of\s+surface water is excluded/);
    expect(note.textContent).toContain("0.03 ha");
    expect(note.textContent).toContain("S.I. No. 588 of 2025, Article 18(1)");
    expect(note.textContent).toContain("0.97 ha");
    expect(within(section).getByText("CAN")).toBeTruthy();
  });

  it("tells the farmer whether stocking came from field movements or the holding fallback", async () => {
    const holdingFallback =
      "Complete field movement history was not available, so the holding-level grazing stocking rate was used for this field.";
    vi.mocked(getFieldFertiliserStatusAction).mockResolvedValueOnce({
      status: "ok",
      engineVersion: "grass-v2",
      cropSystem: "GRASS_GRAZING",
      requirementKgHa: { n: 150, p: 10, k: 20 },
      organicCreditsKgHa: { n: 0, p: 0, k: 0 },
      confirmedAppliedKgHa: { n: 0, p: 0, k: 0 },
      remainingKgHa: { n: 150, p: 10, k: 20 },
      recommendedProducts: [],
      ruleTraces: {},
      limitations: [holdingFallback],
      confirmedApplications: 0,
      applicationsWithUnknownComposition: 0,
      applicationsExcludedMultiField: 0,
      truncated: false,
    });
    renderReal("2027");
    const section = await screen.findByRole("region", {
      name: "Nutrient recommendation",
    });
    await within(section).findByText(holdingFallback);
  });

  it("explains a blocked calculation with the canonical reason, never a figure", async () => {
    vi.mocked(getFieldFertiliserStatusAction).mockResolvedValueOnce({
      status: "blocked",
      reasonCode: "P3_UNSUPPORTED_PATHWAY",
    });
    renderReal("2027");
    const section = await screen.findByRole("region", {
      name: "Nutrient recommendation",
    });
    await within(section).findByText(/no validated Teagasc table/);
    expect(within(section).queryByRole("table")).toBeNull();
    expect(within(section).queryByRole("link")).toBeNull();
  });

  it.each([
    ["COMMONAGE_CHEMICAL_FERTILISER_PROHIBITED", /prohibited on this field because it is commonage/],
    ["WATER_BUFFER_CHEMICAL_FERTILISER_PROHIBITED", /prohibited on this field because the whole field lies within 3 m of surface water/],
  ] as const)(
    "names the legal gate (%s) for a prohibited field instead of calling it not applicable",
    async (reasonCode, message) => {
      vi.mocked(getFieldFertiliserStatusAction).mockResolvedValueOnce({
        status: "prohibited",
        reasonCode,
      });
      renderReal("2027");
      const section = await screen.findByRole("region", {
        name: "Nutrient recommendation",
      });
      await within(section).findByText(message);
      expect(within(section).queryByText(/not applicable/i)).toBeNull();
      expect(within(section).queryByRole("table")).toBeNull();
    },
  );

  it("says honestly when the calculation could not be loaded", async () => {
    vi.mocked(getFieldFertiliserStatusAction).mockRejectedValueOnce(
      new Error("network"),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderReal("2027");
    const section = await screen.findByRole("region", {
      name: "Nutrient recommendation",
    });
    await within(section).findByText(/couldn.t calculate this field/);
    spy.mockRestore();
  });
});
