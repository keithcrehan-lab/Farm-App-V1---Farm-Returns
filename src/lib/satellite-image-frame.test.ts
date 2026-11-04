import { describe, expect, it } from "vitest";
import { SATELLITE_FRAME_MAX_ASPECT, satelliteImageFrame, satelliteViewBounds } from "./satellite-image-frame";

describe("satelliteImageFrame", () => {
  it("sizes the frame to the true ground aspect, not the raw degree box", () => {
    // 0.01° × 0.01° at 53.5° N is ~663 m wide × ~1,113 m tall on the ground.
    const frame = satelliteImageFrame([-8, 53.495, -7.99, 53.505]);
    expect(frame.height).toBe(1280);
    expect(frame.width / frame.height).toBeCloseTo(Math.cos((53.5 * Math.PI) / 180), 2);
  });

  it("keeps the long side at the Mapbox static maximum for a wide field", () => {
    const frame = satelliteImageFrame([-8, 53.5, -7.95, 53.505]);
    expect(frame.width).toBe(1280);
    expect(frame.height).toBeLessThan(1280);
  });

  it("never returns a zero-sized frame for a degenerate box", () => {
    expect(satelliteImageFrame([-8, 53.5, -8, 53.5])).toEqual({ width: 1280, height: 1280 });
  });

  // ~1,000 m × 50 m at 53.5° N (1° lat ≈ 111.32 km; 1° lng ≈ 66.2 km).
  const LAT_M = 1 / 111_320;
  const LNG_M = 1 / (111_320 * Math.cos((53.5 * Math.PI) / 180));
  const groundAspect = ([minLng, minLat, maxLng, maxLat]: readonly number[]) =>
    ((maxLng - minLng) * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)) / (maxLat - minLat);
  const contains = (outer: readonly number[], inner: readonly number[]) =>
    outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];

  it.each([
    ["wide", [-8, 53.5 - 25 * LAT_M, -8 + 1000 * LNG_M, 53.5 + 25 * LAT_M]],
    ["tall", [-8, 53.5 - 500 * LAT_M, -8 + 50 * LNG_M, 53.5 + 500 * LAT_M]],
  ] as const)(
    "F012: never distorts a %s field beyond 5:1 — the view bounds widen so the frame holds the true ground aspect",
    (_label, fieldBounds) => {
      // The raw box is ~20:1; the pixel limits only allow 5:1.
      const raw = groundAspect(fieldBounds);
      expect(Math.max(raw, 1 / raw)).toBeGreaterThan(19);

      const view = satelliteViewBounds(fieldBounds);
      expect(contains(view, fieldBounds)).toBe(true);
      const viewAspect = groundAspect(view);
      expect(Math.max(viewAspect, 1 / viewAspect)).toBeCloseTo(SATELLITE_FRAME_MAX_ASPECT, 6);

      // The frame both providers request matches the view's ground aspect.
      const frame = satelliteImageFrame(view);
      expect(frame.width / frame.height).toBeCloseTo(viewAspect, 2);
      expect(Math.max(frame.width, frame.height)).toBe(1280);
    },
  );

  it("F012: leaves a box within 5:1 unchanged", () => {
    const bounds = [-8, 53.495, -7.99, 53.505] as const;
    expect(satelliteViewBounds(bounds)).toEqual([...bounds]);
  });
});
