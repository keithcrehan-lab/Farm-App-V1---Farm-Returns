import { afterEach, describe, expect, it, vi } from "vitest";
import { assessPublicLegalSpatialEvidence } from "./legal-spatial-evidence";
import { resolveChemicalFertiliserWaterStrip } from "@/domain/chemical-fertiliser-water-strip";

const FIELD: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [[
    [-8.0000, 53.0000],
    [-7.9900, 53.0000],
    [-7.9900, 53.0100],
    [-8.0000, 53.0100],
    [-8.0000, 53.0000],
  ]],
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("public legal spatial evidence", () => {
  it("resolves an intersecting DAFM commonage indicator and the nearest EPA stream without inventing a local override", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/collections?f=json")) {
        return jsonResponse({ collections: [{ id: "lpis-2025", title: "2025 LPIS Data" }] });
      }
      if (url.includes("/collections/lpis-2025/items")) {
        return jsonResponse({
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            geometry: FIELD,
            properties: { "Commonage Indicator": "N" },
          }],
        });
      }
      if (url.includes("gis.epa.ie/geoserver/wfs")) {
        return jsonResponse({
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            geometry: { type: "LineString", coordinates: [[-7.988, 53.0], [-7.988, 53.01]] },
            properties: { NAME: "Test Stream" },
          }],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const result = await assessPublicLegalSpatialEvidence(FIELD);
    const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(calls.some((url) => url.includes("typeNames=EPA%3AWATER_RIVNETROUTES"))).toBe(true);
    expect(result.commonage).toMatchObject({ state: "resolved", value: "not_commonage" });
    expect(result.water.state).toBe("resolved");
    expect(result.water.featureType).toBe("surface_water");
    expect(result.water.nearestFeature).toBe("Test Stream");
    expect(result.water.distanceM).toBeGreaterThan(100);
    expect(result.localOverride.state).toBe("unknown");
  });

  it("keeps the mapped stream geometry only when it lies within the 3 m chemical-fertiliser strip", async () => {
    const stub = (streamLon: number) => vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/collections?f=json")) return jsonResponse({ collections: [{ id: "lpis-2025", title: "2025 LPIS Data" }] });
      if (url.includes("gis.epa.ie/geoserver/wfs")) {
        return jsonResponse({
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            geometry: { type: "LineString", coordinates: [[streamLon, 52.99], [streamLon, 53.02]] },
            properties: { NAME: "Boundary Stream" },
          }],
        });
      }
      return jsonResponse({ type: "FeatureCollection", features: [] });
    });

    // A stream along the field's east boundary: inside the strip.
    vi.stubGlobal("fetch", stub(-7.99));
    const adjoining = await assessPublicLegalSpatialEvidence(FIELD);
    expect(adjoining.water.distanceM).toBe(0);
    expect(adjoining.water.chemicalStripWaterLines?.type).toBe("MultiLineString");
    expect(adjoining.water.chemicalStripWaterLines?.coordinates.length).toBeGreaterThan(0);

    // The same stream ~130 m away: distance only, no geometry kept.
    vi.stubGlobal("fetch", stub(-7.988));
    const distant = await assessPublicLegalSpatialEvidence(FIELD);
    expect(distant.water.distanceM).toBeGreaterThan(100);
    expect(distant.water.chemicalStripWaterLines).toBeUndefined();
  });

  it("F001: keeps a just-under-3 m distance unrounded so it never becomes a whole-field pass", async () => {
    // ~2.97 m east of the field's east boundary (1° lon ≈ 66.9 km at 53° N).
    const streamLon = -7.99 + 2.97 / (111_320 * Math.cos((53.005 * Math.PI) / 180));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/collections?f=json")) return jsonResponse({ collections: [{ id: "lpis-2025", title: "2025 LPIS Data" }] });
      if (url.includes("gis.epa.ie/geoserver/wfs")) {
        return jsonResponse({
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            geometry: { type: "LineString", coordinates: [[streamLon, 52.99], [streamLon, 53.02]] },
            properties: { NAME: "Near Stream" },
          }],
        });
      }
      return jsonResponse({ type: "FeatureCollection", features: [] });
    }));
    const result = await assessPublicLegalSpatialEvidence(FIELD);
    expect(result.water.distanceM).toBeGreaterThan(2.9);
    expect(result.water.distanceM).toBeLessThan(3);
    expect(result.water.chemicalStripWaterLines?.coordinates.length).toBeGreaterThan(0);

    const strip = resolveChemicalFertiliserWaterStrip({
      fieldPolygon: FIELD,
      fieldAreaHa: 74,
      featureType: result.water.featureType,
      distanceM: result.water.distanceM,
      waterLines: result.water.chemicalStripWaterLines,
    });
    expect(strip.status).not.toBe("WHOLE_FIELD");
  });

  it("fails closed when public services are unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const result = await assessPublicLegalSpatialEvidence(FIELD);
    expect(result.commonage.state).toBe("unavailable");
    expect(result.commonage.value).toBeUndefined();
    expect(result.water.state).toBe("unavailable");
    expect(result.water.distanceM).toBeUndefined();
    expect(result.localOverride.state).toBe("unknown");
  });

  it("does not treat no LPIS parcel match or no EPA stream as evidence of absence", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/collections?f=json")) return jsonResponse({ collections: [{ id: "lpis-2025", title: "2025 LPIS Data" }] });
      return jsonResponse({ type: "FeatureCollection", features: [] });
    }));
    const result = await assessPublicLegalSpatialEvidence(FIELD);
    expect(result.commonage.state).toBe("not_found");
    expect(result.commonage.value).toBeUndefined();
    expect(result.water.state).toBe("not_found");
    expect(result.water.distanceM).toBeUndefined();
  });
});
