import { area, featureCollection, intersect, polygon as turfPolygon, union } from "@turf/turf";

export interface SpreadableAreaGeometryResult {
  grossAreaHa: number;
  excludedAreaHa: number;
  spreadableAreaHa: number;
  exclusions: GeoJSON.Polygon[];
}

function roundedHa(m2: number): number {
  return Math.round((m2 / 10_000) * 10_000) / 10_000;
}

export function calculateSpreadableAreaFromExclusions(
  fieldPolygon: GeoJSON.Polygon,
  exclusions: readonly GeoJSON.Polygon[],
): SpreadableAreaGeometryResult {
  const field = turfPolygon(fieldPolygon.coordinates);
  const clipped = exclusions
    .map((geometry) => {
      try {
        return intersect(featureCollection([field, turfPolygon(geometry.coordinates)]));
      } catch {
        return null;
      }
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  let excludedM2 = 0;
  if (clipped.length === 1) excludedM2 = area(clipped[0]);
  else if (clipped.length > 1) {
    try {
      const merged = union(featureCollection(clipped));
      excludedM2 = merged ? area(merged) : 0;
    } catch {
      // Conservative fallback: overlapping polygons may double-count here,
      // so cap at the gross field area below rather than create a negative result.
      excludedM2 = clipped.reduce((sum, polygon) => sum + area(polygon), 0);
    }
  }

  const grossM2 = area(field);
  excludedM2 = Math.min(grossM2, excludedM2);
  return {
    grossAreaHa: roundedHa(grossM2),
    excludedAreaHa: roundedHa(excludedM2),
    spreadableAreaHa: roundedHa(Math.max(0, grossM2 - excludedM2)),
    exclusions: exclusions.map((geometry) => ({ type: "Polygon", coordinates: geometry.coordinates })),
  };
}
