import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FarmProvider, useFields } from "@/store/farm-store";
import { FieldDrawer } from "./FieldDrawer";
import { mockFields, mockSlurryAllocations } from "@/data/mock-farm";
import type { Field } from "@/domain/types";

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
    expect(screen.getByRole("button", { name: /edit boundary/i })).toBeTruthy();
  });

  it("still shows the neutral 'Under validation' spreading-suitability state, unaffected by real mapping", () => {
    renderDrawer(mockFields[0]);
    expect(screen.getByText("Under validation")).toBeTruthy();
  });
});

describe("FieldDrawer — compliance evidence capture (V3 closure pass)", () => {
  // Strict Visual Reproduction phase (2026-09-03): this evidence now
  // lives under its own "Constraints" tab (media/image3.png's own
  // literal Now/Soil/Activity/Constraints tab bar), not "Overview" by
  // default — same real fields/behaviour, just behind one real tap.
  function openConstraintsTab() {
    fireEvent.click(screen.getByRole("button", { name: "Constraints" }));
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
    expect(screen.getByLabelText(/slurry application method/i)).toBeTruthy();

    const unallocatedField = mockFields.find((f) => !mockSlurryAllocations.some((a) => a.fieldId === f.id));
    if (unallocatedField) {
      cleanup();
      renderLiveDrawer(unallocatedField.id);
      openConstraintsTab();
      expect(screen.queryByLabelText(/slurry application method/i)).toBeNull();
    }
  });
});
