import "server-only";
import type { PublicLegalSpatialEvidence } from "@/server/legal-spatial-evidence";
import { resolveFieldSpatialReference, type InternalSpatialReferenceResult } from "@/lib/farm-data/spatial-reference";

export interface FieldSpatialReferenceEvidence {
  legal: PublicLegalSpatialEvidence;
  groundwaterFeatures: InternalSpatialReferenceResult["groundwaterFeatures"];
  coverage: InternalSpatialReferenceResult["coverage"];
  basis: "INTERNAL_CACHE" | "INTERNAL_CACHE_PARTIAL";
}

export async function assessInternalSpatialEvidence(polygon: GeoJSON.Polygon): Promise<FieldSpatialReferenceEvidence> {
  const cached = await resolveFieldSpatialReference(polygon);
  const lpisCovered = cached.coverage.dafm_lpis_2025 === true;
  const waterCovered = cached.coverage.epa_water_flow_network === true;

  const commonage: PublicLegalSpatialEvidence["commonage"] =
    cached.lpis.matched && cached.lpis.commonage !== null
      ? {
          state: "resolved",
          value: cached.lpis.commonage ? "commonage" : "not_commonage",
          source: `Farm Return cache · DAFM LPIS ${cached.lpis.sourceVersion ?? "2025"}`,
          sourceDate: "2025-12-31",
          detail: `${cached.lpis.parcelCount} intersecting cached LPIS parcel${cached.lpis.parcelCount === 1 ? "" : "s"}; Commonage Indicator resolved from Farm Return's pinned DAFM snapshot.`,
        }
      : lpisCovered
        ? {
            state: "not_found",
            source: "Farm Return cache · DAFM LPIS 2025",
            detail: cached.lpis.matched
              ? "Intersecting cached LPIS parcels do not contain a usable Commonage Indicator; Farm Return will not infer a status."
              : "The field is inside the cached LPIS coverage area but no intersecting parcel was found; Farm Return will not infer non-commonage from absence alone.",
          }
        : {
            state: "unavailable",
            source: "Farm Return cache · DAFM LPIS 2025",
            detail: "This field is not yet inside a complete Farm Return LPIS cache coverage area.",
          };

  const water: PublicLegalSpatialEvidence["water"] = cached.nearestWatercourse
    ? {
        state: "resolved",
        featureType: "surface_water",
        nearestFeature: cached.nearestWatercourse.featureName ?? "EPA mapped river/stream",
        distanceM: Math.round(cached.nearestWatercourse.distanceM * 10) / 10,
        source: `Farm Return cache · EPA Water Flow Network ${cached.nearestWatercourse.sourceVersion}`,
        sourceDate: cached.nearestWatercourse.sourceVersion,
        detail: "Minimum PostGIS geometry-to-geometry distance from the mapped field to the cached EPA river network.",
      }
    : waterCovered
      ? {
          state: "not_found",
          source: "Farm Return cache · EPA Water Flow Network",
          detail: "No cached EPA river/stream was found within 2 km. This does not prove that no unmapped drain or water feature exists.",
        }
      : {
          state: "unavailable",
          source: "Farm Return cache · EPA Water Flow Network",
          detail: "This field is not yet inside a complete Farm Return EPA water-network cache coverage area.",
        };

  return {
    legal: {
      assessedAt: new Date().toISOString(),
      commonage,
      water,
      localOverride: {
        state: "unknown",
        source: "Local authority Article 18 schedules",
        detail: "Local-authority drinking-water setback intelligence is evaluated only for organic/soiled-water planning, not chemical fertiliser quote readiness.",
      },
    },
    groundwaterFeatures: cached.groundwaterFeatures,
    coverage: cached.coverage,
    basis: lpisCovered && waterCovered ? "INTERNAL_CACHE" : "INTERNAL_CACHE_PARTIAL",
  };
}
