import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { boundaryPolygonFromRing } from "@/domain/field-boundary";
import { FieldThumbnail } from "./FieldThumbnail";
import type { Field } from "@/domain/types";

/** Same real, roughly-rectangular ~1ha field fixture `field-boundary.test.ts`
 * already uses — real coordinates, not invented ones. */
const ONE_HA_SQUARE: GeoJSON.Position[] = [
  [-8.4863, 51.8985],
  [-8.4851, 51.8985],
  [-8.4851, 51.8994],
  [-8.4863, 51.8994],
  [-8.4863, 51.8985],
];

function field(overrides: Partial<Field> = {}): Field {
  return {
    id: "field-1",
    farmId: "farm-1",
    name: "Back Meadow",
    areaHa: 4.2,
    centroid: [-8.4857, 51.899],
    fertility: {},
    ...overrides,
  } as Field;
}

afterEach(() => {
  cleanup();
});

describe("FieldThumbnail", () => {
  it("renders the field's own real boundary as an SVG polygon when a valid polygon exists", () => {
    const { container } = render(<FieldThumbnail field={field({ polygon: boundaryPolygonFromRing(ONE_HA_SQUARE) })} />);
    const svg = container.querySelector("svg");
    const polygon = container.querySelector("polygon");
    expect(svg).toBeTruthy();
    expect(polygon).toBeTruthy();
    // Real projected points, not empty/placeholder — one per real ring vertex.
    expect(polygon?.getAttribute("points")?.trim().split(/\s+/)).toHaveLength(ONE_HA_SQUARE.length);
  });

  it("falls back to the plain textured tile — no SVG boundary — when the field has no polygon at all", () => {
    const { container } = render(<FieldThumbnail field={field({ polygon: undefined })} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("polygon")).toBeNull();
  });

  it("falls back to the plain textured tile for a real but invalid/degenerate polygon — never renders a broken shape", () => {
    const degenerate: GeoJSON.Polygon = { type: "Polygon", coordinates: [[[-8.48, 51.9]]] };
    const { container } = render(<FieldThumbnail field={field({ polygon: degenerate })} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("always shows the real field name and area, regardless of boundary state", () => {
    const withBoundary = render(<FieldThumbnail field={field({ polygon: boundaryPolygonFromRing(ONE_HA_SQUARE) })} />);
    expect(withBoundary.getByText("Back Meadow")).toBeTruthy();
    expect(withBoundary.getByText("4.2 ha")).toBeTruthy();
    cleanup();

    const withoutBoundary = render(<FieldThumbnail field={field({ polygon: undefined })} />);
    expect(withoutBoundary.getByText("Back Meadow")).toBeTruthy();
    expect(withoutBoundary.getByText("4.2 ha")).toBeTruthy();
  });

  it("passes the className through to the root element, preserving the caller's sizing", () => {
    const { container } = render(<FieldThumbnail field={field()} className="h-auto w-24" />);
    expect(container.firstElementChild?.className).toContain("w-24");
  });
});
