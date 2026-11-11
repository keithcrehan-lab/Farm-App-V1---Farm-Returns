import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FarmProvider, useFields } from "@/store/farm-store";
import { mockFarm, mockFields } from "@/data/mock-farm";
import { computeBoundaryGeometry } from "@/domain/field-boundary";
import { fieldScanCentre, type FieldScanExistingField, type NamedFieldScanSelection } from "@/domain/field-scan";
import { formatHa } from "@/lib/format";
import FieldsPage from "./page";

// Real-mode server actions touched by components under test are mocked at
// the I/O boundary only.
vi.mock("@/app/actions/field-awareness", () => ({ getFieldAwarenessAction: vi.fn().mockResolvedValue(null) }));
vi.mock("@/components/farm/FieldWindChip", () => ({ FieldWindChip: () => null }));
const bulk = vi.hoisted(() => ({ preview: vi.fn(), setCrop: vi.fn(), carry: vi.fn() }));
vi.mock("@/app/actions/bulk-production-cycles", () => ({
  previewBulkProductionCyclesAction: bulk.preview,
  setBulkFieldCropSystemAction: bulk.setCrop,
  carryForwardFieldCyclesAction: bulk.carry,
}));

const search = vi.hoisted(() => ({ current: new URLSearchParams() }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useSearchParams: () => search.current,
  useRouter: () => ({ push }),
  usePathname: () => "/fields",
}));

interface CapturedMapProps {
  fields: { id: string; polygon?: unknown }[];
  selectedFieldId?: string;
  highlightedFieldIds?: string[];
  selectionColor?: string;
  onSelectField?: (id: string) => void;
  onMapBackgroundClick?: () => void;
  children?: React.ReactNode;
}
let mapProps: CapturedMapProps | undefined;
vi.mock("@/components/farm/MapHero", () => ({
  MapHero: (props: CapturedMapProps) => {
    mapProps = props;
    return <div data-testid="map-hero-stub">{props.children}</div>;
  },
}));

const drawnPolygon: GeoJSON.Polygon = {
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
};
let boundaryInitialCentroid: [number, number] | undefined;
// The real boundary modal draws on Mapbox; here it hands back a real polygon.
vi.mock("@/components/farm/FieldBoundaryMapModal", () => ({
  FieldBoundaryMapModal: ({ onSave, onClose, initialCentroid }: { onSave: (p: GeoJSON.Polygon) => void; onClose: () => void; initialCentroid: [number, number] }) => {
    boundaryInitialCentroid = initialCentroid;
    return (
      <div role="dialog" aria-label="Draw boundary">
        <button type="button" onClick={() => onSave(drawnPolygon)}>
          Use drawn boundary
        </button>
        <button type="button" onClick={onClose}>
          Close drawing
        </button>
      </div>
    );
  },
}));

const scannedPolygon: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [[
    [-8.4848, 51.8985],
    [-8.4835, 51.8985],
    [-8.4835, 51.8994],
    [-8.4848, 51.8994],
    [-8.4848, 51.8985],
  ]],
};
let scanModalProps: { centre: [number, number]; existingFields: FieldScanExistingField[] } | undefined;
vi.mock("@/components/farm/FieldScanModal", () => ({
  FieldScanModal: ({ onAddSelected, onDrawInstead, onClose, centre, existingFields = [] }: {
    onAddSelected: (selections: NamedFieldScanSelection[]) => Promise<void>;
    onDrawInstead: (centre: [number, number]) => void;
    onClose: () => void;
    centre: [number, number];
    existingFields?: FieldScanExistingField[];
  }) => {
    scanModalProps = { centre, existingFields };
    return (
      <div role="dialog" aria-label="Scan fields">
        <button type="button" onClick={() => void onAddSelected([
          {
            name: "North Meadow",
            candidate: { id: "scan-a", lpisRef: "dafm_lpis_2025:2025:scan-a", polygon: drawnPolygon, areaHa: 1, centroid: [-8.4857, 51.899], sourceLabel: "DAFM LPIS 2025", sourceYear: "2025" },
          },
          {
            name: "Road Meadow",
            candidate: { id: "scan-b", lpisRef: "dafm_lpis_2025:2025:scan-b", polygon: scannedPolygon, areaHa: 1, centroid: [-8.484, 51.899], sourceLabel: "DAFM LPIS 2025", sourceYear: "2025" },
          },
        ])}>Use scanned fields</button>
        <button type="button" onClick={() => onDrawInstead(centre)}>Draw instead</button>
        <button type="button" onClick={onClose}>Close scan</button>
      </div>
    );
  },
}));

beforeEach(() => {
  search.current = new URLSearchParams();
  mapProps = undefined;
  scanModalProps = undefined;
  boundaryInitialCentroid = undefined;
  push.mockReset();
});
afterEach(cleanup);

function renderFields(query = "") {
  search.current = new URLSearchParams(query);
  return render(
    <FarmProvider>
      <FieldsPage />
    </FarmProvider>,
  );
}

const home = mockFields.find((f) => f.id === "field-home")!;
const other = mockFields.find((f) => f.id !== "field-home" && f.polygon)!;

function row(id: string) {
  return document.querySelector(`[data-field-row="${id}"]`) as HTMLElement;
}

describe("Fields companion (Farm + Fields redesign)", () => {
  it("shows the real map beside a quiet list of the farm's real fields, with a truthful mapped count", () => {
    renderFields();
    expect(screen.getByTestId("map-hero-stub")).toBeTruthy();
    expect(mapProps!.fields.map((f) => f.id)).toEqual(mockFields.filter((f) => !f.archivedAt).map((f) => f.id));
    const mapped = mockFields.filter((f) => !f.archivedAt && f.polygon).length;
    expect(screen.getAllByText(new RegExp(`^${mapped} of ${mockFields.filter((f) => !f.archivedAt).length} mapped`)).length).toBeGreaterThan(0);
    expect(mapProps!.selectionColor).toBe("#e3c77e");
  });

  it("selecting in the list and selecting on the map are one state, keyed by the real field id", () => {
    renderFields();
    fireEvent.click(within(row(home.id)).getAllByRole("button")[0]);
    expect(mapProps!.selectedFieldId).toBe(home.id);
    expect(row(home.id).getAttribute("data-selected")).toBe("true");
    act(() => mapProps!.onSelectField!(other.id));
    expect(row(other.id).getAttribute("data-selected")).toBe("true");
    expect(row(home.id).getAttribute("data-selected")).toBe("false");
    // The same selected-field panel as Farm comes forward on the map.
    const panel = document.querySelector("[data-field-drawer]") as HTMLElement;
    expect(panel.getAttribute("data-open")).toBe("true");
    expect(within(panel).getByRole("heading", { name: other.name })).toBeTruthy();
    act(() => mapProps!.onMapBackgroundClick!());
    expect(mapProps!.selectedFieldId).toBeUndefined();
  });

  it("opens the field workspace by the real id", () => {
    renderFields();
    fireEvent.click(within(row(home.id)).getAllByRole("button")[0]);
    fireEvent.click(within(row(home.id)).getByRole("button", { name: /open field workspace/i }));
    expect(push).toHaveBeenCalledWith("/fields?field=field-home");
  });

  it("shows Delete this field in the selected sidebar row and keeps the safe name-confirmation step", () => {
    renderFields();
    expect(screen.queryByRole("button", { name: "Delete this field" })).toBeNull();

    fireEvent.click(within(row(home.id)).getAllByRole("button")[0]);
    const deleteShortcut = within(row(home.id)).getByRole("button", { name: "Delete this field" });
    expect(deleteShortcut).toBeTruthy();

    fireEvent.click(deleteShortcut);
    const confirmation = document.querySelector("[data-selected-field-delete]") as HTMLElement;
    expect(within(confirmation).getByText(/restored for 30 days/i)).toBeTruthy();

    const confirmInput = within(confirmation).getByRole("textbox");
    const confirmDelete = within(confirmation).getByRole("button", { name: "Delete field" });
    expect((confirmDelete as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(confirmInput, { target: { value: home.name } });
    expect((confirmDelete as HTMLButtonElement).disabled).toBe(false);
  });

  it("a normal tap never offers geometry edits; Manage fields does, with split/merge honestly unavailable", () => {
    renderFields();
    fireEvent.click(within(row(home.id)).getAllByRole("button")[0]);
    expect(screen.queryByRole("button", { name: /edit boundary/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Manage fields" }));
    expect(screen.getByText(/split and merge are not available yet/i, { selector: "[data-manage-mode] p" })).toBeTruthy();
    // The selection carries into Manage fields, where its structural actions appear.
    expect(within(row(home.id)).getByRole("button", { name: /edit boundary/i })).toBeTruthy();
    expect(within(row(home.id)).getByRole("button", { name: /delete field/i })).toBeTruthy();
  });

  it("Select multiple holds an explicit selection with real actions, and clears on exit", () => {
    renderFields();
    fireEvent.click(screen.getByRole("button", { name: "Select multiple" }));
    act(() => mapProps!.onSelectField!(home.id));
    act(() => mapProps!.onSelectField!(other.id));
    expect(mapProps!.highlightedFieldIds).toEqual([home.id, other.id]);
    expect(mapProps!.selectedFieldId).toBeUndefined();
    const bar = document.querySelector("[data-multi-select-bar]") as HTMLElement;
    expect(bar.textContent).toContain("2 fields");
    expect(bar.textContent).not.toMatch(/isn't available yet/i);
    expect(within(bar).getByRole("button", { name: "Set crop / use" })).toBeTruthy();
    expect(within(bar).getByRole("button", { name: "Carry forward" })).toBeTruthy();
    act(() => mapProps!.onSelectField!(home.id));
    expect(mapProps!.highlightedFieldIds).toEqual([other.id]);
    fireEvent.click(within(bar).getByRole("button", { name: "Done" }));
    expect(document.querySelector("[data-multi-select-bar]")).toBeNull();
    expect(mapProps!.highlightedFieldIds).toBeUndefined();
  });

  it("offers Add another field and opens the scanner on the already-mapped field area", () => {
    renderFields();
    const addButtons = screen.getAllByRole("button", { name: "Add another field" });
    expect(addButtons.length).toBeGreaterThan(0);
    fireEvent.click(addButtons[0]);
    expect(screen.getByRole("dialog", { name: "Scan fields" })).toBeTruthy();

    const mappedPolygons = mockFields
      .filter((field) => !field.archivedAt && field.polygon)
      .map((field) => field.polygon as GeoJSON.Polygon);
    expect(scanModalProps?.centre).toEqual(fieldScanCentre(mappedPolygons, mockFarm.location.centroid));
    expect(scanModalProps?.existingFields).toHaveLength(mappedPolygons.length);
  });

  it("the add=scan deep link opens the same scan workflow", () => {
    renderFields("add=scan");
    expect(screen.getByRole("dialog", { name: "Scan fields" })).toBeTruthy();
  });

  it("Manage fields makes Scan fields primary, keeps Draw field, and bulk-adds selected public boundaries", async () => {
    renderFields();
    const before = mapProps!.fields.length;
    fireEvent.click(screen.getByRole("button", { name: "Manage fields" }));
    const manage = document.querySelector("[data-manage-mode]") as HTMLElement;
    expect(within(manage).getByRole("button", { name: "Scan fields" })).toBeTruthy();
    expect(within(manage).getByRole("button", { name: "Draw field" })).toBeTruthy();
    fireEvent.click(within(manage).getByRole("button", { name: "Scan fields" }));
    fireEvent.click(screen.getByRole("button", { name: "Use scanned fields" }));
    await vi.waitFor(() => expect(mapProps!.fields.length).toBe(before + 2));
    expect(screen.getByText("North Meadow")).toBeTruthy();
    expect(screen.getByText("Road Meadow")).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: "Scan fields" })).toBeNull());
  });

  it("deletes a field only after name confirmation and offers a 30-day restore from Manage fields", async () => {
    renderFields();
    const activeBefore = mapProps!.fields.length;
    const field = mockFields.find((candidate) => !candidate.archivedAt)!;

    fireEvent.click(screen.getByRole("button", { name: "Manage fields" }));
    const row = document.querySelector(`[data-field-row="${field.id}"]`) as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: new RegExp(field.name, "i") }));

    fireEvent.click(within(row).getByRole("button", { name: "Delete field" }));
    const confirmInput = within(row).getByRole("textbox");
    const confirmDelete = within(row).getByRole("button", { name: "Delete field" });
    expect((confirmDelete as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(confirmInput, { target: { value: field.name } });
    fireEvent.click(confirmDelete);

    await vi.waitFor(() => expect(mapProps!.fields.length).toBe(activeBefore - 1));
    expect(screen.getByText("Recently deleted (1)")).toBeTruthy();
    expect(screen.getByText(/30 days left to restore/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await vi.waitFor(() => expect(mapProps!.fields.length).toBe(activeBefore));
  });

  it("Add field stays boundary-first and opens the drawing map on the existing field area", () => {
    renderFields();
    const before = mapProps!.fields.length;
    fireEvent.click(screen.getByRole("button", { name: "Draw field" }));

    const mappedPolygons = mockFields
      .filter((field) => !field.archivedAt && field.polygon)
      .map((field) => field.polygon as GeoJSON.Polygon);
    expect(boundaryInitialCentroid).toEqual(fieldScanCentre(mappedPolygons, mockFarm.location.centroid));

    fireEvent.click(screen.getByRole("button", { name: "Use drawn boundary" }));
    const form = document.querySelector("[data-new-field]") as HTMLElement;
    expect(form.textContent).toContain(formatHa(computeBoundaryGeometry(drawnPolygon).areaHa));
    expect(form.textContent).toMatch(/calculated from the boundary you drew, not typed/);
    expect((within(form).getByRole("button", { name: "Save field" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(document.querySelector("[data-new-field]")).toBeNull();
    expect(mapProps!.fields.length).toBe(before);
  });

  it("saving a newly drawn field goes straight to that field's canonical recommendation setup", async () => {
    renderFields();
    fireEvent.click(screen.getByRole("button", { name: "Draw field" }));
    fireEvent.click(screen.getByRole("button", { name: "Use drawn boundary" }));
    const form = document.querySelector("[data-new-field]") as HTMLElement;
    fireEvent.change(within(form).getByRole("textbox"), { target: { value: "Setup Test Field" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save field" }));
    await vi.waitFor(() => expect(push).toHaveBeenCalled());
    const destination = String(push.mock.calls.at(-1)?.[0] ?? "");
    expect(destination).toMatch(/^\/fields\?field=.+&chapter=nutrients$/);
  });
});

describe("Fields bulk production-cycle actions", () => {
  const thisSeason = String(new Date().getFullYear());
  const nextSeason = String(Number(thisSeason) + 1);

  function previewOf(rows: { fieldId: string; fieldName: string; currentCropSystem?: string; targetCropSystem?: string; carryForward: string }[], targetSeason: string) {
    return { status: "ok", currentSeason: thisSeason, targetSeason, rows };
  }

  function openAction(name: "Set crop / use" | "Carry forward") {
    fireEvent.click(screen.getByRole("button", { name: "Select multiple" }));
    act(() => mapProps!.onSelectField!(home.id));
    act(() => mapProps!.onSelectField!(other.id));
    const bar = document.querySelector("[data-multi-select-bar]") as HTMLElement;
    fireEvent.click(within(bar).getByRole("button", { name }));
  }

  function chooseCrop() {
    fireEvent.change(screen.getByLabelText("Crop / use"), { target: { value: "GRASS_HAY" } });
    fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  }

  beforeEach(() => {
    bulk.preview.mockReset();
    bulk.setCrop.mockReset();
    bulk.carry.mockReset();
    bulk.preview.mockImplementation(async ({ targetSeason }: { targetSeason: string }) =>
      previewOf(
        [
          { fieldId: home.id, fieldName: home.name, targetCropSystem: "GRASS_GRAZING", carryForward: "HAS_TARGET_CYCLE" },
          { fieldId: other.id, fieldName: other.name, carryForward: "CAN_CARRY", currentCropSystem: "GRASS_HAY" },
        ],
        targetSeason,
      ),
    );
  });

  it("disables the actions until a field is selected", () => {
    renderFields();
    fireEvent.click(screen.getByRole("button", { name: "Select multiple" }));
    const bar = document.querySelector("[data-multi-select-bar]") as HTMLElement;
    expect((within(bar).getByRole("button", { name: "Set crop / use" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(bar).getByRole("button", { name: "Carry forward" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers the same actions in the phone's list view, where the map bar is hidden", () => {
    renderFields();
    fireEvent.click(screen.getByRole("button", { name: "Select multiple" }));
    const list = document.querySelector("[data-multi-select-list]") as HTMLElement;
    expect(within(list).getByRole("button", { name: "Carry forward" })).toBeTruthy();
  });

  // Codex audit F010: a bulk crop change reaches the farm store's grazing
  // sward at once, so nutrient plans never keep the previous sward.
  it("applies each saved cycle's sward to the farm store without a reload", async () => {
    function SwardProbe() {
      const current = useFields().find((candidate) => candidate.id === home.id);
      return <output data-testid="bulk-sward">{JSON.stringify(current?.grazingSward ?? null)}</output>;
    }
    const savedCycle = {
      id: "cycle-home",
      fieldId: home.id,
      season: thisSeason,
      cropSystem: "GRASS_WHITE_CLOVER_GRAZING",
      status: "active",
      evidence: {
        cropSystem: { value: "GRASS_WHITE_CLOVER_GRAZING", method: "FARMER_DECLARED", source: "Farmer", observedAt: "2026-10-30T00:00:00.000Z" },
        whiteCloverPct: { value: 5, method: "FARMER_DECLARED", source: "Farmer", observedAt: "2026-10-30T00:00:00.000Z" },
      },
      createdAt: "2026-10-30T00:00:00.000Z",
      updatedAt: "2026-10-30T00:00:00.000Z",
    };
    bulk.setCrop.mockResolvedValue({
      status: "completed",
      season: thisSeason,
      outcomes: [
        { fieldId: home.id, fieldName: home.name, outcome: "saved", gateStatus: "READY_FOR_CALCULATION", savedCycle },
        { fieldId: other.id, fieldName: other.name, outcome: "failed" },
      ],
    });
    search.current = new URLSearchParams();
    render(
      <FarmProvider>
        <FieldsPage />
        <SwardProbe />
      </FarmProvider>,
    );
    openAction("Set crop / use");
    chooseCrop();
    fireEvent.click(await screen.findByRole("button", { name: `Save 2 fields for ${thisSeason}` }));
    await vi.waitFor(() => expect(screen.getByTestId("bulk-sward").textContent).toBe(JSON.stringify({ kind: "WHITE_CLOVER", aprilWhiteCloverPct: 5 })));
  });

  it("goes from selection through confirmation to success, writing nothing before the farmer confirms", async () => {
    bulk.setCrop.mockResolvedValue({
      status: "completed",
      season: thisSeason,
      outcomes: [
        { fieldId: home.id, fieldName: home.name, outcome: "saved", gateStatus: "READY_FOR_CALCULATION" },
        { fieldId: other.id, fieldName: other.name, outcome: "saved", gateStatus: "READY_FOR_CALCULATION" },
      ],
    });
    renderFields();
    openAction("Set crop / use");
    expect((screen.getByRole("button", { name: "Review changes" }) as HTMLButtonElement).disabled).toBe(true);
    chooseCrop();

    const summary = document.querySelector("[data-bulk-summary]") as HTMLElement;
    expect(summary.textContent).toContain("2 fields");
    expect(summary.textContent).toContain("ha");
    expect(summary.textContent).toContain(`${thisSeason} season`);
    const save = await screen.findByRole("button", { name: `Save 2 fields for ${thisSeason}` });
    expect(bulk.setCrop).not.toHaveBeenCalled();

    fireEvent.click(save);
    await screen.findByText("All 2 fields saved.");
    expect(bulk.setCrop).toHaveBeenCalledWith({ fieldIds: [home.id, other.id], season: thisSeason, cropSystem: "GRASS_HAY" });
  });

  it("reports a partial failure per field, never as a success, and retries only what failed", async () => {
    bulk.setCrop.mockResolvedValueOnce({
      status: "completed",
      season: thisSeason,
      outcomes: [
        { fieldId: home.id, fieldName: home.name, outcome: "saved", gateStatus: "READY_FOR_CALCULATION" },
        { fieldId: other.id, fieldName: other.name, outcome: "failed" },
      ],
    });
    renderFields();
    openAction("Set crop / use");
    chooseCrop();
    fireEvent.click(await screen.findByRole("button", { name: `Save 2 fields for ${thisSeason}` }));

    const headline = await screen.findByRole("alert");
    expect(headline.textContent).toBe("1 of 2 fields saved. 1 could not be saved.");
    expect(screen.queryByText(/^All /)).toBeNull();
    const failedRow = document.querySelector('[data-bulk-outcome="failed"]') as HTMLElement;
    expect(failedRow.textContent).toContain(other.name);
    expect(failedRow.textContent).toContain("Not saved");

    bulk.setCrop.mockResolvedValueOnce({ status: "completed", season: thisSeason, outcomes: [{ fieldId: other.id, fieldName: other.name, outcome: "saved", gateStatus: "READY_FOR_CALCULATION" }] });
    fireEvent.click(screen.getByRole("button", { name: "Try 1 field again" }));
    await screen.findByText("All 2 fields saved.");
    expect(bulk.setCrop).toHaveBeenLastCalledWith({ fieldIds: [other.id], season: thisSeason, cropSystem: "GRASS_HAY" });
  });

  it("carry-forward shows each field's position and leaves existing target cycles alone", async () => {
    bulk.carry.mockResolvedValue({
      status: "completed",
      season: nextSeason,
      outcomes: [
        { fieldId: home.id, fieldName: home.name, outcome: "skipped_has_target" },
        { fieldId: other.id, fieldName: other.name, outcome: "saved", gateStatus: "READY_FOR_CALCULATION" },
      ],
    });
    renderFields();
    openAction("Carry forward");

    const save = await screen.findByRole("button", { name: `Carry 1 field forward to ${nextSeason}` });
    expect((document.querySelector(`[data-bulk-row="${home.id}"]`) as HTMLElement).textContent).toContain(`Already has a ${nextSeason} cycle`);
    expect((document.querySelector(`[data-bulk-row="${other.id}"]`) as HTMLElement).textContent).toContain("Can be carried forward");
    expect(bulk.carry).not.toHaveBeenCalled();

    fireEvent.click(save);
    await screen.findByText("1 of 2 fields saved. The rest needed no change.");
    expect(bulk.carry).toHaveBeenCalledWith({ fieldIds: [home.id, other.id], targetSeason: nextSeason });
  });

  it("won't let the farmer confirm a carry-forward with nothing to copy", async () => {
    bulk.preview.mockResolvedValue(
      previewOf(
        [
          { fieldId: home.id, fieldName: home.name, carryForward: "NO_CURRENT_CYCLE" },
          { fieldId: other.id, fieldName: other.name, carryForward: "NO_CURRENT_CYCLE" },
        ],
        nextSeason,
      ),
    );
    renderFields();
    openAction("Carry forward");
    await screen.findByText("None of these fields would change.");
    expect((document.querySelector(`[data-bulk-row="${home.id}"]`) as HTMLElement).textContent).toContain(`No ${thisSeason} cycle to copy`);
    expect((screen.getByRole("button", { name: /^Carry 0 fields forward/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("fails closed when the fields' cycles can't be checked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    bulk.preview.mockRejectedValue(new Error("offline"));
    renderFields();
    openAction("Carry forward");
    await screen.findByRole("alert");
    expect((screen.getByRole("button", { name: /^Carry 0 fields forward/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says so when the connection fails during a save, rather than claiming a result", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    bulk.setCrop.mockRejectedValue(new Error("offline"));
    renderFields();
    openAction("Set crop / use");
    chooseCrop();
    fireEvent.click(await screen.findByRole("button", { name: `Save 2 fields for ${thisSeason}` }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/before Farm Return could confirm/);
    expect(document.querySelector("[data-bulk-result]")).toBeNull();
  });
});

describe("Field mode from Fields", () => {
  it("opens from the list and carries the confirmed field to the map selection and quick actions", async () => {
    renderFields();
    fireEvent.click(screen.getByRole("button", { name: "Field mode" }));
    expect(document.querySelector("[data-field-mode-choose]")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/choose a field/i), { target: { value: home.id } });
    fireEvent.click(screen.getByRole("button", { name: "Use this field" }));
    expect(mapProps!.selectedFieldId).toBe(home.id);
    expect(screen.getByRole("link", { name: /record grass/i }).getAttribute("href")).toBe(`/grass?field=${home.id}`);
  });
});

describe("Field workspace (Farm + Fields redesign)", () => {
  it("opens for a real field id, with the map as hero and only Overview / Nutrients / History", () => {
    renderFields("field=field-home");
    expect(document.querySelector("[data-field-workspace-view]")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: home.name })).toBeTruthy();
    expect(mapProps!.selectedFieldId).toBe("field-home");
    const chapters = screen.getByRole("navigation", { name: "Field chapters" });
    expect(Array.from(chapters.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Overview", "Nutrients", "History"]);
    expect(screen.getByRole("link", { name: /^fields$/i }).getAttribute("href")).toBe("/fields");
    expect(screen.getByRole("link", { name: "Add another field" }).getAttribute("href")).toBe("/fields?add=scan");
  });

  it("an unknown id never opens a workspace", () => {
    renderFields("field=not-a-field");
    expect(document.querySelector("[data-field-workspace-view]")).toBeNull();
    expect(document.querySelector("[data-fields-companion]")).toBeTruthy();
  });

  it("opens the chapter a link asks for", () => {
    renderFields("field=field-home&chapter=nutrients");
    expect(screen.getByRole("button", { name: "Nutrients" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("What Matters' 'Add spreading details' link opens Nutrients on the legal inputs", () => {
    renderFields("field=field-home&complete=slurry&missing=method");
    expect(screen.getByRole("button", { name: "Nutrients" }).getAttribute("aria-pressed")).toBe("true");
    const legal = screen.getByRole("button", { name: /legal & spreading checks/i });
    expect(legal.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/planned spreading method for this field/i)).toBeTruthy();
  });

  it("tapping a neighbour on the hero map moves to that field's workspace", () => {
    renderFields("field=field-home");
    act(() => mapProps!.onSelectField!(other.id));
    expect(push).toHaveBeenCalledWith(`/fields?field=${other.id}`);
  });
});
