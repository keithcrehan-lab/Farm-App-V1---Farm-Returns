/**
 * Codex remediation Priority 8 — real soil spatial pipeline architecture.
 *
 * Intended shape, per the remediation brief:
 *
 *   Field polygon → spatial soil resolver → mapped soil result →
 *   provenance → persisted result → Soil UI → Nutrients
 *
 * with support for multiple soil polygons intersecting a field,
 * intersection proportions, a defensible dominant classification,
 * drainage source, provenance/lookup timestamp, recalculation after a
 * boundary edit, and a farmer correction/override that keeps its own
 * provenance (`MappedSoil.farmerOverride`, `src/domain/types.ts`).
 *
 * **Exact blocker, investigated before writing this module**: the real
 * candidate dataset is Teagasc/EPA's Irish Soil Information System (1:250,000
 * national soil map, 58 associations / 213 series —
 * `docs/evidence-register.md`'s own "Irish Soil Information System" row).
 * It is a real, citable, appropriate dataset for this purpose. It is NOT
 * usable here because:
 *
 *   1. No GeoJSON/shapefile export of it is vendored in this repository —
 *      `find . -iname "*.geojson" -o -iname "*soil*dataset*"` (this
 *      remediation pass) returns nothing under `src/`, `docs/`, or
 *      `supabase/`.
 *   2. This build environment has no outbound network access to fetch one
 *      from Teagasc/EPA/OSI at build or request time (the same constraint
 *      already documented for Met Éireann's live API in
 *      `docs/evidence-register.md`'s weather rows, before that was later
 *      separately verified from a session with real egress — soil has had
 *      no equivalent verification pass).
 *   3. Even a downloaded copy would need a genuine licence/attribution
 *      check (the dataset's terms) and a real point-in-polygon spatial
 *      join implementation (Turf.js, already a dependency via
 *      `field-boundary.ts`, is capable of this) — neither is a "wire it
 *      up" task, both are real follow-up work for whoever has the
 *      dataset in hand.
 *
 * Per the remediation brief's own instruction — "the absence of a soil
 * dataset is preferable to invented soil information" — this module's one
 * live implementation always returns `BLOCKED_INSUFFICIENT_EVIDENCE`
 * (`SOIL_DATASET_NOT_INTEGRATED`), never a plausible-looking soil class.
 * It is wired into real call sites (`farm-store.tsx`'s `addField`/
 * `setFieldBoundary`, both mock and remote) so the architecture is real
 * and exercised, not dead code — the moment a real dataset/join is
 * available, replacing this one function's body is the entire integration
 * point; every caller already expects an `EngineOutcome` and already fails
 * closed correctly.
 */

import { blockedInsufficientEvidence, type EngineOutcome } from "./evidence";
import type { Drainage, MappedSoil } from "./types";

/** One soil-dataset polygon's intersection with a field boundary — the
 * "multiple soil polygons intersecting a field" case the brief asks the
 * architecture to support. `intersectionAreaHa`/`intersectionPct` describe
 * how much of the field this one candidate covers; a resolver may return
 * several of these before a dominant classification is picked. */
export interface SoilIntersection {
  soilAssociation: string;
  dominantSeries: string;
  texture: string;
  drainage: Drainage;
  organicCarbonStatus?: "mineral" | "peat" | "high_organic";
  intersectionAreaHa: number;
  intersectionPct: number;
  datasetVersion: string;
  source: string;
}

export interface SoilResolutionResult {
  /** The dominant classification, already reduced to `MappedSoil`'s shape
   * (ready to write straight onto `Field.mappedSoil`) — `coveragePct` is
   * the dominant intersection's share of the field, `resolvedAt` is this
   * lookup's own timestamp (distinct from `datasetVersion`, the source
   * dataset's own publication version). */
  dominant: MappedSoil;
  /** Every candidate intersection, dominant one included — kept for a
   * future "this field spans two soil types" UI, not required by
   * `Field.mappedSoil` itself. */
  intersections: SoilIntersection[];
}

export interface SoilResolutionInput {
  fieldId: string;
  fieldPolygon: GeoJSON.Polygon;
  fieldAreaHa: number;
}

/**
 * Real spatial soil resolver — see this file's header for why it always
 * returns `BLOCKED_INSUFFICIENT_EVIDENCE` today. `fieldPolygon`/
 * `fieldAreaHa` are accepted (not ignored) so a real implementation is a
 * pure body replacement, not a signature change every call site would
 * need to be re-touched for.
 */
export function resolveSoilForFieldPolygon(input: SoilResolutionInput): EngineOutcome<SoilResolutionResult> {
  // `input` is intentionally unused by this always-blocked implementation
  // — kept as a real parameter (not dropped) so a future dataset-backed
  // implementation is a pure body replacement, not a signature change
  // every call site would need to be re-touched for. See this file's own
  // header for the exact blocker.
  void input;
  return blockedInsufficientEvidence("SOIL_DATASET_NOT_INTEGRATED", [
    "irish_soil_information_system_geojson_or_wfs_export",
  ]);
}
