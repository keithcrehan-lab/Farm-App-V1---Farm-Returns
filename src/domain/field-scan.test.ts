import { describe, expect, it } from "vitest";
import { fieldScanBounds, fieldScanCentre, generatedFieldNames, parseFieldScanPayload, polygonFromUnknownGeometry } from "./field-scan";

const small: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [[
    [-8.47, 53.51],
    [-8.469, 53.51],
    [-8.469, 53.511],
    [-8.47, 53.511],
    [-8.47, 53.51],
  ]],
};
const large: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [[
    [-8.47, 53.51],
    [-8.467, 53.51],
    [-8.467, 53.513],
    [-8.47, 53.513],
    [-8.47, 53.51],
  ]],
};

describe("field scan map viewport", () => {
  it("centres a new scan on the farmer's existing mapped fields, not the stale farm pin", () => {
    const fallback: [number, number] = [-9.0568, 53.2707];
    expect(fieldScanBounds([small, large])).toEqual([-8.47, 53.51, -8.467, 53.513]);
    expect(fieldScanCentre([small, large], fallback)).toEqual([-8.4685, 53.5115]);
  });

  it("falls back to the farm location only when there are no mapped field polygons", () => {
    const fallback: [number, number] = [-9.0568, 53.2707];
    expect(fieldScanCentre([], fallback)).toEqual(fallback);
  });
});

describe("field scan geometry parsing", () => {
  it("accepts a valid polygon and rejects malformed external geometry", () => {
    expect(polygonFromUnknownGeometry(small)).toEqual(small);
    expect(polygonFromUnknownGeometry({ type: "LineString", coordinates: [] })).toBeNull();
    expect(polygonFromUnknownGeometry({ type: "Polygon", coordinates: [[[-8, 53], [-8, 54]]] })).toBeNull();
  });

  it("uses the largest valid component of a MultiPolygon deterministically", () => {
    const multi = {
      type: "MultiPolygon",
      coordinates: [small.coordinates, large.coordinates],
    };
    expect(polygonFromUnknownGeometry(multi)).toEqual(large);
  });

  it("exposes only valid, non-duplicate candidates and excludes fields already imported", () => {
    const outcome = parseFieldScanPayload(
      {
        sourceLabel: "DAFM LPIS 2025",
        sourceYear: "2025",
        coverageAtFarm: true,
        candidates: [
          { id: "a", lpisRef: "dafm_lpis_2025:2025:a", parcelLabel: "A", polygon: small },
          { id: "a2", lpisRef: "dafm_lpis_2025:2025:a", polygon: large },
          { id: "b", lpisRef: "dafm_lpis_2025:2025:b", polygon: large },
          { id: "bad", lpisRef: "dafm_lpis_2025:2025:bad", polygon: { type: "Polygon", coordinates: [] } },
        ],
      },
      ["dafm_lpis_2025:2025:b"],
    );
    expect(outcome.status).toBe("READY");
    if (outcome.status !== "READY") return;
    expect(outcome.candidates.map((candidate) => candidate.lpisRef)).toEqual(["dafm_lpis_2025:2025:a"]);
    expect(outcome.candidates[0].parcelLabel).toBe("A");
    expect(outcome.candidates[0].areaHa).toBeGreaterThan(0);
  });
});

describe("generated field names", () => {
  it("fills the next free Field N names without colliding with existing names", () => {
    expect(generatedFieldNames(["Home", "Field 1", "field 3"], 4)).toEqual(["Field 2", "Field 4", "Field 5", "Field 6"]);
  });
});
