import { describe, expect, it } from "vitest";
import { boundaryPolygonFromRing } from "./field-boundary";
import { DEFAULT_LOOKBACK_DAYS, selectBestSatelliteCoverage } from "./satellite-field-coverage";
import type { Sentinel2L2AItem } from "@/server/satellite/cdse-stac-client";

/** Real-shaped Co. Cork field, same coordinates `field-boundary.test.ts`
 * already uses. */
const FIELD = boundaryPolygonFromRing([
  [-8.4863, 51.8985],
  [-8.4851, 51.8985],
  [-8.4851, 51.8994],
  [-8.4863, 51.8994],
  [-8.4863, 51.8985],
]);

/** A large scene footprint that genuinely contains the field above —
 * Sentinel-2 tiles are ~110km x 110km, so a real scene's own footprint
 * comfortably contains a single farm field; this mirrors that real
 * scale, not the field's own tiny extent. */
const COVERING_GEOMETRY: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-9.0, 51.5],
      [-8.0, 51.5],
      [-8.0, 52.5],
      [-9.0, 52.5],
      [-9.0, 51.5],
    ],
  ],
};

/** A real-scale scene footprint over Dublin — genuinely does not
 * intersect the Co. Cork field above. */
const NON_COVERING_GEOMETRY: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [-6.5, 53.0],
      [-5.5, 53.0],
      [-5.5, 54.0],
      [-6.5, 54.0],
      [-6.5, 53.0],
    ],
  ],
};

function item(overrides: Partial<Sentinel2L2AItem> = {}): Sentinel2L2AItem {
  return {
    id: "S2A_MSIL2A_20260628T115421_N0512_R023_T29UNU_20260628T194416",
    bbox: [-9.0, 51.5, -8.0, 52.5],
    geometry: COVERING_GEOMETRY,
    datetime: "2026-06-28T11:54:21.024000Z",
    platform: "sentinel-2a",
    constellation: "sentinel-2",
    cloudCoverPercent: 55.65,
    processingLevel: "L2",
    productType: "S2MSI2A",
    processingVersion: "05.12",
    ...overrides,
  };
}

const ASOF = "2026-07-01T00:00:00Z";

describe("selectBestSatelliteCoverage", () => {
  it("throws for an invalid field polygon rather than silently returning a result", () => {
    const invalid = boundaryPolygonFromRing([[-8.48, 51.9]]);
    expect(() => selectBestSatelliteCoverage(invalid, [item()], { asOf: ASOF })).toThrow(/invalid field boundary polygon/i);
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE when candidates is empty", () => {
    const result = selectBestSatelliteCoverage(FIELD, [], { asOf: ASOF });
    expect(result).toMatchObject({ status: "BLOCKED_INSUFFICIENT_EVIDENCE", reasonCode: "NO_RECENT_SATELLITE_SCENE_AVAILABLE" });
  });

  // Codex audit HIGH, docs/farm-return-next/audit-logs/20260901T152948Z.md:
  // an invalid asOf/lookbackDays previously disabled the date-window
  // filter entirely (an Invalid Date's comparisons are always false),
  // letting any candidate through regardless of real age -- the
  // function must fail closed (throw) instead.
  it("throws for an unparseable asOf rather than silently disabling the date-window filter", () => {
    expect(() => selectBestSatelliteCoverage(FIELD, [item()], { asOf: "not-a-real-date" })).toThrow(/asOf is not a valid date/);
  });

  it("throws for a non-finite lookbackDays", () => {
    expect(() => selectBestSatelliteCoverage(FIELD, [item()], { asOf: ASOF, lookbackDays: Number.NaN })).toThrow(/lookbackDays must be a finite, positive number/);
  });

  it("throws for a zero or negative lookbackDays", () => {
    expect(() => selectBestSatelliteCoverage(FIELD, [item()], { asOf: ASOF, lookbackDays: 0 })).toThrow(/lookbackDays must be a finite, positive number/);
    expect(() => selectBestSatelliteCoverage(FIELD, [item()], { asOf: ASOF, lookbackDays: -5 })).toThrow(/lookbackDays must be a finite, positive number/);
  });

  // Codex audit HIGH, docs/farm-return-next/audit-logs/20260901T153753Z.md
  // (round 2): the round-1 fix above was itself bypassable two ways.
  it("throws for asOf: '' rather than silently treating it as 'not supplied' and defaulting to now", () => {
    expect(() => selectBestSatelliteCoverage(FIELD, [item()], { asOf: "" })).toThrow(/asOf is not a valid date/);
  });

  it("throws when a finite, positive lookbackDays is large enough to push the computed cutoff outside Date's real representable range", () => {
    expect(() => selectBestSatelliteCoverage(FIELD, [item()], { asOf: ASOF, lookbackDays: Number.MAX_SAFE_INTEGER })).toThrow(/out-of-range cutoff date/);
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE when every candidate's real footprint misses the field, even with a matching bbox search", () => {
    const result = selectBestSatelliteCoverage(FIELD, [item({ geometry: NON_COVERING_GEOMETRY })], { asOf: ASOF });
    expect(result.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE when the only candidate is outside the lookback window", () => {
    const tooOld = item({ datetime: "2026-06-01T00:00:00Z" }); // 30 days before asOf
    const result = selectBestSatelliteCoverage(FIELD, [tooOld], { asOf: ASOF, lookbackDays: 10 });
    expect(result.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("BLOCKED_INSUFFICIENT_EVIDENCE when the only candidate is in the future relative to asOf (real STAC data should never be, but fail closed regardless)", () => {
    const future = item({ datetime: "2026-08-01T00:00:00Z" });
    const result = selectBestSatelliteCoverage(FIELD, [future], { asOf: ASOF, lookbackDays: 10 });
    expect(result.status).toBe("BLOCKED_INSUFFICIENT_EVIDENCE");
  });

  it("OK with the single real candidate when only one is eligible", () => {
    const result = selectBestSatelliteCoverage(FIELD, [item()], { asOf: ASOF });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.value.productId).toBe(item().id);
    expect(result.value.provider).toBe("Copernicus Data Space Ecosystem");
    expect(result.value.cloudCoverPercent).toBe(55.65);
    expect(result.evidenceState).toBe("MEASURED");
  });

  it("picks the least-cloudy eligible candidate, not the most recent", () => {
    const cloudy = item({ id: "cloudy", cloudCoverPercent: 80, datetime: "2026-06-30T00:00:00Z" });
    const clear = item({ id: "clear", cloudCoverPercent: 5, datetime: "2026-06-25T00:00:00Z" });
    const result = selectBestSatelliteCoverage(FIELD, [cloudy, clear], { asOf: ASOF });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.value.productId).toBe("clear");
  });

  it("ties on cloud cover break to the most recent acquisition", () => {
    const earlier = item({ id: "earlier", cloudCoverPercent: 20, datetime: "2026-06-20T00:00:00Z" });
    const later = item({ id: "later", cloudCoverPercent: 20, datetime: "2026-06-28T00:00:00Z" });
    const result = selectBestSatelliteCoverage(FIELD, [earlier, later], { asOf: ASOF });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.value.productId).toBe("later");
  });

  it("excludes an out-of-window or non-intersecting candidate even when a better one would otherwise lose the comparison", () => {
    const excluded = item({ id: "excluded-far-away", cloudCoverPercent: 0.1, geometry: NON_COVERING_GEOMETRY });
    const eligible = item({ id: "eligible", cloudCoverPercent: 40 });
    const result = selectBestSatelliteCoverage(FIELD, [excluded, eligible], { asOf: ASOF });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.value.productId).toBe("eligible");
  });

  it("carries vegetationPixelPercent through from real statistics.vegetation when present", () => {
    const withStats = item({ statistics: { vegetation: 13.76, water: 0.2, high_proba_clouds: 60 } });
    const result = selectBestSatelliteCoverage(FIELD, [withStats], { asOf: ASOF });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.value.vegetationPixelPercent).toBe(13.76);
  });

  it("omits vegetationPixelPercent when the real scene has no statistics field, rather than inventing a value", () => {
    const noStats = item({ statistics: undefined });
    const result = selectBestSatelliteCoverage(FIELD, [noStats], { asOf: ASOF });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.value.vegetationPixelPercent).toBeUndefined();
  });

  it("defaults the lookback window to DEFAULT_LOOKBACK_DAYS", () => {
    const withinDefault = item({ datetime: new Date(new Date(ASOF).getTime() - (DEFAULT_LOOKBACK_DAYS - 1) * 24 * 60 * 60 * 1000).toISOString() });
    const beyondDefault = item({ id: "too-old", datetime: new Date(new Date(ASOF).getTime() - (DEFAULT_LOOKBACK_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString() });
    const result = selectBestSatelliteCoverage(FIELD, [withinDefault, beyondDefault], { asOf: ASOF });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.value.productId).not.toBe("too-old");
  });

  it("never invents a value the real STAC metadata didn't already state -- every OK field traces to a real input", () => {
    const real = item({
      id: "real-scene-id",
      platform: "sentinel-2b",
      processingLevel: "L2",
      cloudCoverPercent: 12.34,
      datetime: "2026-06-29T10:00:00Z",
    });
    const result = selectBestSatelliteCoverage(FIELD, [real], { asOf: ASOF });
    expect(result.status).toBe("OK");
    if (result.status !== "OK") throw new Error("expected OK");
    expect(result.value).toMatchObject({
      provider: "Copernicus Data Space Ecosystem",
      mission: "sentinel-2b",
      productId: "real-scene-id",
      acquisitionTimestamp: "2026-06-29T10:00:00Z",
      processingLevel: "L2",
      cloudCoverPercent: 12.34,
    });
  });
});
