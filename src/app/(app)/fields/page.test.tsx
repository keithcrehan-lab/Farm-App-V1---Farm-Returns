import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { mockFields } from "@/data/mock-farm";
import { computeBoundaryGeometry } from "@/domain/field-boundary";
import { formatHa } from "@/lib/format";
import FieldsPage from "./page";

// Real-mode server actions touched by components under test are mocked at
// the I/O boundary only.
vi.mock("@/app/actions/field-awareness", () => ({ getFieldAwarenessAction: vi.fn().mockResolvedValue(null) }));
vi.mock("@/components/farm/FieldWindChip", () => ({ FieldWindChip: () => null }));

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
// The real boundary modal draws on Mapbox; here it hands back a real polygon.
vi.mock("@/components/farm/FieldBoundaryMapModal", () => ({
  FieldBoundaryMapModal: ({ onSave, onClose }: { onSave: (p: GeoJSON.Polygon) => void; onClose: () => void }) => (
    <div role="dialog" aria-label="Draw boundary">
      <button type="button" onClick={() => onSave(drawnPolygon)}>
        Use drawn boundary
      </button>
      <button type="button" onClick={onClose}>
        Close drawing
      </button>
    </div>
  ),
}));

beforeEach(() => {
  search.current = new URLSearchParams();
  mapProps = undefined;
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

  it("a normal tap never offers geometry edits; Manage fields does, with split/merge honestly unavailable", () => {
    renderFields();
    fireEvent.click(within(row(home.id)).getAllByRole("button")[0]);
    expect(screen.queryByRole("button", { name: /edit boundary/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Manage fields" }));
    expect(screen.getByText(/split and merge are not available yet/i, { selector: "[data-manage-mode] p" })).toBeTruthy();
    // The selection carries into Manage fields, where its structural actions appear.
    expect(within(row(home.id)).getByRole("button", { name: /edit boundary/i })).toBeTruthy();
    expect(within(row(home.id)).getByRole("button", { name: /archive field/i })).toBeTruthy();
  });

  it("Select multiple holds an explicit selection without pretending bulk planning exists, and clears on exit", () => {
    renderFields();
    fireEvent.click(screen.getByRole("button", { name: "Select multiple" }));
    act(() => mapProps!.onSelectField!(home.id));
    act(() => mapProps!.onSelectField!(other.id));
    expect(mapProps!.highlightedFieldIds).toEqual([home.id, other.id]);
    expect(mapProps!.selectedFieldId).toBeUndefined();
    const bar = document.querySelector("[data-multi-select-bar]") as HTMLElement;
    expect(bar.textContent).toContain("2 fields");
    expect(bar.textContent).toMatch(/bulk planning isn't available yet/i);
    act(() => mapProps!.onSelectField!(home.id));
    expect(mapProps!.highlightedFieldIds).toEqual([other.id]);
    fireEvent.click(within(bar).getByRole("button", { name: "Done" }));
    expect(document.querySelector("[data-multi-select-bar]")).toBeNull();
    expect(mapProps!.highlightedFieldIds).toBeUndefined();
  });

  it("Add field stays boundary-first: the area comes from the drawn polygon, and Cancel saves nothing", () => {
    renderFields();
    const before = mapProps!.fields.length;
    fireEvent.click(screen.getByRole("button", { name: /add field/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use drawn boundary" }));
    const form = document.querySelector("[data-new-field]") as HTMLElement;
    expect(form.textContent).toContain(formatHa(computeBoundaryGeometry(drawnPolygon).areaHa));
    expect(form.textContent).toMatch(/calculated from the boundary you drew, not typed/);
    expect((within(form).getByRole("button", { name: "Save field" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(document.querySelector("[data-new-field]")).toBeNull();
    expect(mapProps!.fields.length).toBe(before);
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
    expect(screen.getByRole("region", { name: "Legal inputs for this field" })).toBeTruthy();
  });

  it("tapping a neighbour on the hero map moves to that field's workspace", () => {
    renderFields("field=field-home");
    act(() => mapProps!.onSelectField!(other.id));
    expect(push).toHaveBeenCalledWith(`/fields?field=${other.id}`);
  });
});
