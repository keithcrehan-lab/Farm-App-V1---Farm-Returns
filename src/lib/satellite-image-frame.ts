/**
 * One pixel frame for every layer of the field satellite view.
 *
 * The dated Sentinel layer is requested over a WGS84 bounding box, and the
 * Mapbox reference layer is fitted to the same box. A fixed output size
 * (e.g. 1280 × 900) stretches both to an aspect the ground does not have,
 * and Mapbox pads its fit differently from Sentinel, so the two layers
 * drift apart and read as blur. Sizing the frame to the box's true
 * ground aspect (longitude span shrinks by cos(latitude)) keeps both
 * layers and the boundary overlay registered without distortion.
 */

/** Mapbox Static Images caps each side at 1280 px. */
export const SATELLITE_FRAME_MAX_SIDE_PX = 1280;
const MIN_SIDE_PX = 256;
/** The most elongated frame the pixel limits allow undistorted (5:1). */
export const SATELLITE_FRAME_MAX_ASPECT = SATELLITE_FRAME_MAX_SIDE_PX / MIN_SIDE_PX;

type Bounds = readonly [number, number, number, number];

function groundSize(bounds: Bounds): { width: number; height: number; cosLat: number } {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const cosLat = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  return {
    width: Math.max(0, maxLng - minLng) * cosLat,
    height: Math.max(0, maxLat - minLat),
    cosLat,
  };
}

/**
 * The geographic box both layers are requested over. A field more
 * elongated than the frame's 5:1 limit would otherwise be squeezed into
 * it; instead the short side of the box is widened symmetrically (more
 * surrounding ground, never less field), so the frame below holds the
 * box's true aspect. Every provider must use these bounds — the Sentinel
 * request and the Mapbox reference fit — so they stay registered.
 */
export function satelliteViewBounds(bounds: Bounds): [number, number, number, number] {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const ground = groundSize(bounds);
  if (!(ground.width > 0) || !(ground.height > 0) || !(ground.cosLat > 0)) return [minLng, minLat, maxLng, maxLat];
  const aspect = ground.width / ground.height;
  if (aspect > SATELLITE_FRAME_MAX_ASPECT) {
    const latPad = (ground.width / SATELLITE_FRAME_MAX_ASPECT - ground.height) / 2;
    return [minLng, minLat - latPad, maxLng, maxLat + latPad];
  }
  if (aspect < 1 / SATELLITE_FRAME_MAX_ASPECT) {
    const lngPad = ((ground.height / SATELLITE_FRAME_MAX_ASPECT - ground.width) / ground.cosLat) / 2;
    return [minLng - lngPad, minLat, maxLng + lngPad, maxLat];
  }
  return [minLng, minLat, maxLng, maxLat];
}

export interface SatelliteImageFrame {
  width: number;
  height: number;
}

export function satelliteImageFrame(
  bounds: Bounds,
  maxSidePx = SATELLITE_FRAME_MAX_SIDE_PX,
): SatelliteImageFrame {
  const { width: groundWidth, height: groundHeight } = groundSize(bounds);
  if (!(groundWidth > 0) || !(groundHeight > 0))
    return { width: maxSidePx, height: maxSidePx };
  const aspect = groundWidth / groundHeight;
  return aspect >= 1
    ? {
        width: maxSidePx,
        height: Math.max(MIN_SIDE_PX, Math.round(maxSidePx / aspect)),
      }
    : {
        width: Math.max(MIN_SIDE_PX, Math.round(maxSidePx * aspect)),
        height: maxSidePx,
      };
}
