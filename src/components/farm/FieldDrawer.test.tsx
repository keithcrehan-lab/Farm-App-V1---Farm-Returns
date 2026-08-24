import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FarmProvider } from "@/store/farm-store";
import { FieldDrawer } from "./FieldDrawer";
import { mockFields } from "@/data/mock-farm";
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

describe("FieldDrawer — real field mapping entry point", () => {
  it("offers 'Map this field' (not the old disabled 'Edit Field') when no boundary exists yet", () => {
    const field = mockFields[0];
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
