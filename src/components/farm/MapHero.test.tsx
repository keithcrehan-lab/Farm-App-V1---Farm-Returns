import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Field } from "@/domain/types";

const fitBounds = vi.fn();

vi.mock("mapbox-gl", () => {
  class FakeMap {
    fitBounds = fitBounds;
    once = vi.fn();
    on = vi.fn();
    resize = vi.fn();
    remove = vi.fn();
    getLayer = vi.fn(() => undefined);
    getSource = vi.fn(() => undefined);
    setPaintProperty = vi.fn();
    getCanvas = vi.fn(() => ({ style: {} }));
  }
  class FakeMarker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  return { default: { Map: FakeMap, Marker: FakeMarker, accessToken: "" } };
});
vi.mock("mapbox-gl/dist/mapbox-gl.css", () => ({}));
vi.mock("@/lib/mapbox", () => ({
  MAPBOX_TOKEN: "pk.test",
  mapboxConfigured: true,
  MAPBOX_SATELLITE_STYLE: "style",
  MAPBOX_PLAIN_SATELLITE_STYLE: "plain-style",
}));

import { MapHero } from "./MapHero";

const square = (id: string, lng: number, lat: number, size: number): Field =>
  ({
    id,
    farmId: "farm",
    name: id,
    areaHa: 1,
    centroid: [lng + size / 2, lat + size / 2],
    polygon: {
      type: "Polygon",
      coordinates: [
        [
          [lng, lat],
          [lng + size, lat],
          [lng + size, lat + size],
          [lng, lat + size],
          [lng, lat],
        ],
      ],
    },
    fertility: {},
  }) as unknown as Field;

describe("MapHero back-to-field control", () => {
  beforeEach(() => {
    fitBounds.mockClear();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const fields = [square("a", -8.5, 53, 0.01), square("b", -8.4, 53.1, 0.02)];

  it("returns the camera to the selected field's own boundary in one click", () => {
    render(
      <MapHero
        fields={fields}
        getTone={() => "neutral"}
        selectedFieldId="b"
        flyToMaxZoom={16.5}
        flyToPadding={40}
        flyToDuration={0}
        showBackToSelectionControl
      />,
    );
    fitBounds.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Back to field" }));

    expect(fitBounds).toHaveBeenCalledTimes(1);
    const [bounds, options] = fitBounds.mock.calls[0];
    expect(bounds[0][0]).toBeCloseTo(-8.4);
    expect(bounds[0][1]).toBeCloseTo(53.1);
    expect(bounds[1][0]).toBeCloseTo(-8.38);
    expect(bounds[1][1]).toBeCloseTo(53.12);
    expect(options).toMatchObject({ padding: 40, maxZoom: 16.5, duration: 0 });
  });

  it("offers no back-to-field control when the selected field has no mapped boundary", () => {
    render(
      <MapHero
        fields={[...fields, { ...fields[0], id: "unmapped", polygon: undefined } as unknown as Field]}
        getTone={() => "neutral"}
        selectedFieldId="unmapped"
        showBackToSelectionControl
      />,
    );
    expect(screen.queryByRole("button", { name: "Back to field" })).toBeNull();
  });
});
