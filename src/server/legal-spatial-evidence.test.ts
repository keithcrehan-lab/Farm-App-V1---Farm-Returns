import { afterEach, describe, expect, it, vi } from "vitest";
import { assessPublicLegalSpatialEvidence } from "./legal-spatial-evidence";

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
    expect(result.commonage).toMatchObject({ state: "resolved", value: "not_commonage" });
    expect(result.water.state).toBe("resolved");
    expect(result.water.featureType).toBe("surface_water");
    expect(result.water.nearestFeature).toBe("Test Stream");
    expect(result.water.distanceM).toBeGreaterThan(100);
    expect(result.localOverride.state).toBe("unknown");
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
