/**
 * The chemical-fertiliser surface-water strip (S.I. No. 588/2025,
 * Article 18(1), effective 1 January 2026): chemical fertiliser shall not
 * be applied to land within 3 m of any surface waters. The rule is
 * location-specific — it excludes the strip of land within 3 m of the
 * water, not the whole parcel — so a field whose boundary comes within
 * 3 m of a stream keeps its remaining area for chemical fertiliser.
 *
 * The strip is derived from real mapped geometry only: the field polygon
 * and the mapped water lines near it (EPA River Network Routes). Without
 * that geometry the strip area is unknown and the result fails closed —
 * never a guessed strip width × boundary length, never the whole field.
 */

import {
  area,
  booleanIntersects,
  buffer,
  featureCollection,
  intersect,
  lineString,
  multiLineString,
  polygon as turfPolygon,
} from "@turf/turf";
import { NATIONAL_BUFFER_DISTANCES_M } from "./buffer-gate";

export const CHEMICAL_WATER_STRIP_VERSION = "chemical_water_strip_v1.0.0";

export const CHEMICAL_FERTILISER_WATER_STRIP_RULE = {
  ruleId: "SI_588_2025_ART_18_1_CHEMICAL_FERTILISER_3M_SURFACE_WATER",
  source: "S.I. No. 588 of 2025, Article 18(1)",
  effectiveFrom: "2026-01-01",
  stripWidthM: NATIONAL_BUFFER_DISTANCES_M.chemicalFertiliserSurfaceWater,
} as const;

/** A strip covering this share of the field (or more) leaves no practical
 * chemical-fertiliser area; the field is treated as wholly inside it. */
const WHOLE_FIELD_SHARE = 0.999;

export interface ChemicalWaterStripInput {
  fieldPolygon?: GeoJSON.Polygon;
  /** The field's stored area — the strip is subtracted as a share of the
   * polygon so the result reconciles with every other area figure. */
  fieldAreaHa: number;
  featureType?: string;
  distanceM?: number | null;
  /** Mapped water lines near the field, in WGS84. */
  waterLines?: GeoJSON.MultiLineString;
}

export interface ChemicalWaterStripProvenance {
  ruleId: typeof CHEMICAL_FERTILISER_WATER_STRIP_RULE.ruleId;
  source: typeof CHEMICAL_FERTILISER_WATER_STRIP_RULE.source;
  stripWidthM: number;
  version: typeof CHEMICAL_WATER_STRIP_VERSION;
}

export type ChemicalWaterStripResult =
  /** The mapped water is at least 3 m from the boundary: whole field. */
  | {
      status: "WHOLE_FIELD";
      chemicalAreaHa: number;
      excludedStripHa: 0;
      provenance: ChemicalWaterStripProvenance;
    }
  /** Part of the field is within 3 m; that strip is excluded. */
  | {
      status: "STRIP_EXCLUDED";
      chemicalAreaHa: number;
      excludedStripHa: number;
      strip: GeoJSON.Polygon | GeoJSON.MultiPolygon;
      provenance: ChemicalWaterStripProvenance;
    }
  /** Effectively the whole field is within 3 m of surface water. */
  | {
      status: "WHOLE_FIELD_WITHIN_STRIP";
      chemicalAreaHa: 0;
      excludedStripHa: number;
      provenance: ChemicalWaterStripProvenance;
    }
  | {
      status: "UNKNOWN";
      reasonCode:
        | "MISSING_NATIONAL_BUFFER_ASSESSMENT"
        | "CHEMICAL_WATER_STRIP_GEOMETRY_UNRESOLVED"
        | "CHEMICAL_WATER_STRIP_GEOMETRY_CONFLICT";
      missingInputs: string[];
    };

const provenance: ChemicalWaterStripProvenance = {
  ruleId: CHEMICAL_FERTILISER_WATER_STRIP_RULE.ruleId,
  source: CHEMICAL_FERTILISER_WATER_STRIP_RULE.source,
  stripWidthM: CHEMICAL_FERTILISER_WATER_STRIP_RULE.stripWidthM,
  version: CHEMICAL_WATER_STRIP_VERSION,
};

function roundHa(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function resolveChemicalFertiliserWaterStrip(
  input: ChemicalWaterStripInput,
): ChemicalWaterStripResult {
  // Missing, null or non-finite distance is unknown evidence — never a
  // 0 m strip (null < n) nor a pass (NaN < n is false).
  if (
    !input.featureType ||
    typeof input.distanceM !== "number" ||
    !Number.isFinite(input.distanceM)
  )
    return {
      status: "UNKNOWN",
      reasonCode: "MISSING_NATIONAL_BUFFER_ASSESSMENT",
      missingInputs: ["waterBufferContext"],
    };

  const widthM = CHEMICAL_FERTILISER_WATER_STRIP_RULE.stripWidthM;
  const distanceClear = input.distanceM >= widthM;
  const lines = input.waterLines?.coordinates.filter(
    (line) => line.length >= 2,
  );
  const hasLines = !!lines && lines.length > 0;

  // No mapped water geometry on file: a recorded distance of at least
  // 3 m keeps the whole field; a sub-3 m distance cannot be measured.
  if (!hasLines && distanceClear)
    return {
      status: "WHOLE_FIELD",
      chemicalAreaHa: input.fieldAreaHa,
      excludedStripHa: 0,
      provenance,
    };
  if (!input.fieldPolygon || !hasLines)
    return {
      status: "UNKNOWN",
      reasonCode: "CHEMICAL_WATER_STRIP_GEOMETRY_UNRESOLVED",
      missingInputs: [
        ...(input.fieldPolygon ? [] : ["polygon"]),
        ...(hasLines ? [] : ["waterBufferContext.chemicalStripWaterLines"]),
      ],
    };

  // Supplied water geometry is always checked — a recorded distance of
  // 3 m or more never overrides mapped water that reaches the strip.
  let stripM2: number;
  let strip: GeoJSON.Polygon | GeoJSON.MultiPolygon | undefined;
  let fieldM2: number;
  try {
    const field = turfPolygon(input.fieldPolygon.coordinates);
    fieldM2 = area(field);
    const zone = buffer(multiLineString(lines), widthM, { units: "meters" });
    const clipped = zone
      ? intersect(featureCollection([field, zone]))
      : null;
    strip = clipped?.geometry;
    stripM2 = clipped ? area(clipped) : 0;
  } catch {
    return {
      status: "UNKNOWN",
      reasonCode: "CHEMICAL_WATER_STRIP_GEOMETRY_UNRESOLVED",
      missingInputs: ["waterBufferContext.chemicalStripWaterLines"],
    };
  }
  if (!(fieldM2 > 0))
    return {
      status: "UNKNOWN",
      reasonCode: "CHEMICAL_WATER_STRIP_GEOMETRY_UNRESOLVED",
      missingInputs: ["polygon"],
    };

  const geometryReachesField = !!strip && stripM2 > 0;
  if (!geometryReachesField && distanceClear)
    return {
      status: "WHOLE_FIELD",
      chemicalAreaHa: input.fieldAreaHa,
      excludedStripHa: 0,
      provenance,
    };
  // The recorded distance and the mapped lines disagree (in either
  // direction): neither a pass nor a strip is asserted.
  if (!geometryReachesField || distanceClear || !strip)
    return {
      status: "UNKNOWN",
      reasonCode: "CHEMICAL_WATER_STRIP_GEOMETRY_CONFLICT",
      missingInputs: ["waterBufferContext.chemicalStripWaterLines"],
    };

  const share = Math.min(1, stripM2 / fieldM2);
  const excludedStripHa = roundHa(input.fieldAreaHa * share);
  if (share >= WHOLE_FIELD_SHARE)
    return {
      status: "WHOLE_FIELD_WITHIN_STRIP",
      chemicalAreaHa: 0,
      excludedStripHa: roundHa(input.fieldAreaHa),
      provenance,
    };
  return {
    status: "STRIP_EXCLUDED",
    chemicalAreaHa: roundHa(input.fieldAreaHa - excludedStripHa),
    excludedStripHa,
    strip,
    provenance,
  };
}

/** The mapped water lines worth keeping as strip evidence: only lines
 * that come within the strip width (plus a small margin) of the field,
 * clipped to the field's neighbourhood so the stored record stays small. */
export function waterLinesNearField(
  fieldPolygon: GeoJSON.Polygon,
  lines: readonly GeoJSON.Position[][],
  marginM = CHEMICAL_FERTILISER_WATER_STRIP_RULE.stripWidthM + 10,
): GeoJSON.MultiLineString | undefined {
  const field = turfPolygon(fieldPolygon.coordinates);
  const neighbourhood = buffer(field, marginM, { units: "meters" });
  if (!neighbourhood) return undefined;
  const kept: GeoJSON.Position[][] = [];
  for (const line of lines) {
    if (line.length < 2) continue;
    // Keep every segment that touches the neighbourhood, so a long
    // segment crossing the strip is kept even with no vertex inside it.
    let run: GeoJSON.Position[] = [];
    for (let i = 1; i < line.length; i++) {
      const segment = lineString([line[i - 1], line[i]]);
      if (booleanIntersects(segment, neighbourhood)) {
        if (run.length === 0) run.push(line[i - 1]);
        run.push(line[i]);
      } else if (run.length > 0) {
        kept.push(run);
        run = [];
      }
    }
    if (run.length >= 2) kept.push(run);
  }
  return kept.length > 0
    ? { type: "MultiLineString", coordinates: kept }
    : undefined;
}
