/**
 * Farm Return Next Checkpoint 2, Vertical H (satellite field
 * intelligence) — picks the best real Sentinel-2 L2A scene covering a
 * field from a list of already-fetched candidates
 * (`@/server/satellite/cdse-stac-client`'s `searchSentinel2L2AScenes`).
 * Pure and provider-agnostic beyond the input shape, the same "no
 * network call in `src/domain/`" layering `weather-forecast.ts`
 * establishes for `ForecastPoint[]` — this file never calls `fetch`
 * itself; the caller fetches, this file only selects and evaluates.
 *
 * **What this module does NOT do, deliberately, per `MASTER_SPEC.md`'s
 * explicit instruction**: "NDVI/vegetation indices are never presented
 * as direct grass biomass — precision biomass prediction stays out of
 * scope unless genuine calibration evidence exists." This module never
 * computes NDVI or any other vegetation index — that requires
 * downloading and processing a scene's raw spectral bands, which itself
 * requires CDSE `oidc`/`s3` credentials this build session does not
 * have and cannot create (account creation is a hard policy prohibition
 * regardless of network access — see
 * `cdse-stac-client.ts`'s own doc comment). `vegetationPixelPercent`
 * below is CDSE's own real, provider-computed, scene-*wide* pixel-
 * classification statistic (from the STAC item's own `statistics`
 * field) — evidence about the scene as a whole, never a field-specific
 * measurement and never a biomass figure. The real, useful thing this
 * module delivers today is honest field/vegetation *intelligence* in
 * the narrower, defensible sense `MASTER_SPEC.md` scopes to: "here is
 * the most recent, least-cloudy real satellite pass over this field,
 * with its own real acquisition/cloud/processing evidence" — not a
 * biomass or growth-rate claim.
 *
 * `mission`/`processingLevel`/`cloudCoverPercent`/etc. are real,
 * unmodified STAC metadata carried straight through — nothing here
 * invents or estimates a number a Sentinel-2 scene's own real metadata
 * didn't already state (`CLAUDE.md`'s "never let a model invent a
 * production scientific... number").
 */
import { booleanIntersects, polygon as turfPolygon } from "@turf/turf";
import { isValidBoundaryPolygon } from "./field-boundary";
import { blockedInsufficientEvidence, ok, type EngineOutcome } from "./evidence";
import { isValidIsoUtcDateTime } from "./iso-datetime";
import type { Sentinel2L2AItem } from "@/server/satellite/cdse-stac-client";

export const SATELLITE_FIELD_COVERAGE_VERSION = "satellite_field_coverage_v1.0.0";

/** Real, engineering-chosen default lookback window — NOT a scientific
 * or regulatory figure (unlike, say, `telemetry_events`' 30-day
 * retention, which was a real product-owner decision). Chosen to
 * comfortably exceed Sentinel-2's own real revisit cadence over Ireland
 * (the two-satellite constellation typically revisits a given point
 * every 2-3 days at this latitude) while tolerating a run of cloudy days
 * — Irish weather makes several consecutive unusable (high-cloud)
 * passes common. Disclosed here, not silently assumed authoritative;
 * a caller may override via `options.lookbackDays`. */
export const DEFAULT_LOOKBACK_DAYS = 10;

export interface SatelliteFieldCoverage {
  provider: "Copernicus Data Space Ecosystem";
  /** Real STAC `platform`, e.g. "sentinel-2c" — the specific satellite. */
  mission: string;
  /** Real STAC scene id. */
  productId: string;
  /** ISO datetime — real acquisition instant. */
  acquisitionTimestamp: string;
  /** Real STAC `processing:level`, e.g. "L2". */
  processingLevel: string;
  /** Real STAC `eo:cloud_cover` — 0-100, scene-wide. */
  cloudCoverPercent: number;
  /** CDSE's own real, provider-computed scene-wide "vegetation" pixel
   * percentage, when the scene's response included it — present only
   * as raw provenance, never as a field-specific or biomass claim. See
   * this module's own header comment. */
  vegetationPixelPercent?: number;
  /** Human-readable description of the real selection method used —
   * not a hidden implementation detail, since this value directly
   * explains why this particular scene, not another, was chosen. */
  algorithm: string;
  calculationVersion: string;
}

export interface SelectSatelliteCoverageOptions {
  /** ISO datetime — defaults to real current time. Exists mainly so
   * this function's tests don't depend on the real clock. */
  asOf?: string;
  /** See `DEFAULT_LOOKBACK_DAYS`'s own doc comment. */
  lookbackDays?: number;
}

/**
 * Validates `asOf`/`lookbackDays` and returns every real candidate
 * whose acquisition falls inside `[cutoff, asOf]` and whose own real
 * footprint (`geometry`, not just the search bbox) genuinely intersects
 * `fieldPolygon` — the shared "which candidates are even in play"
 * filter both `selectBestSatelliteCoverage` and
 * `selectMostRecentUsableSatelliteCoverage` build on, extracted so the
 * two functions' selection *strategies* (least-cloud vs. most-recent-
 * usable) can differ without duplicating this validation/filtering
 * logic. Throws on a caller bug (invalid polygon/`asOf`/`lookbackDays`)
 * exactly as `selectBestSatelliteCoverage`'s own doc comment already
 * describes — see the callers below for the exact wording.
 */
function filterEligibleCandidates(
  fnName: string,
  fieldPolygon: GeoJSON.Polygon,
  candidates: Sentinel2L2AItem[],
  options: SelectSatelliteCoverageOptions,
): Sentinel2L2AItem[] {
  if (!isValidBoundaryPolygon(fieldPolygon)) {
    throw new Error(`${fnName}: invalid field boundary polygon (not closed, degenerate, has holes, or zero-area)`);
  }
  // Codex audit HIGH, docs/farm-return-next/audit-logs/20260901T152948Z.md
  // and 20260901T153753Z.md (round 2 found the round-1 fix itself still
  // bypassable two ways): an invalid `asOf`/`lookbackDays`/computed
  // `cutoff` produces an `Invalid Date` whose comparisons are always
  // `false` — silently disabling the whole date-window filter (every
  // candidate would pass, however old) rather than failing closed. Both
  // are caller-supplied options, so an invalid value here is a caller
  // bug, the same class of error `isValidBoundaryPolygon`'s own throw
  // above already treats as one — not a legitimate "insufficient
  // evidence" case this function's `EngineOutcome` return type exists to
  // describe.
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  if (!Number.isFinite(lookbackDays) || lookbackDays <= 0) {
    throw new Error(`${fnName}: lookbackDays must be a finite, positive number, got ${lookbackDays}`);
  }
  // `options.asOf !== undefined`, not a truthy check — round 2's own
  // finding: `asOf: ""` is a real, explicit (if malformed) caller value,
  // not "not supplied", and a truthy check silently treated it as the
  // latter, defaulting to the current time instead of rejecting it.
  //
  // Format validated with `isValidIsoUtcDateTime` BEFORE ever
  // constructing a `Date` from it — round 3's own finding
  // (`docs/farm-return-next/audit-logs/20260901T154550Z.md`): `new
  // Date(value)`'s lenient parser silently "fixes up" genuinely
  // malformed input (`"0"`, `"2026-02-30"`, `"2026-01-01junk"`) instead
  // of rejecting it, so a bare `Number.isNaN` check after construction
  // never catches any of those — only rejecting the string shape itself
  // does. See `iso-datetime.ts`'s own doc comment for the full account.
  if (options.asOf !== undefined && !isValidIsoUtcDateTime(options.asOf)) {
    throw new Error(`${fnName}: asOf must be a valid UTC ISO datetime (YYYY-MM-DDTHH:MM:SS[.sss]Z), got ${JSON.stringify(options.asOf)}`);
  }
  const asOf = options.asOf !== undefined ? new Date(options.asOf) : new Date();
  if (Number.isNaN(asOf.getTime())) {
    throw new Error(`${fnName}: asOf is not a valid date, got ${JSON.stringify(options.asOf)}`);
  }
  const cutoff = new Date(asOf.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  // A `lookbackDays` value large enough (e.g. Number.MAX_SAFE_INTEGER)
  // stays finite and positive on its own — passing the check above —
  // but pushes `cutoff` outside JS `Date`'s real representable range
  // (~±273,790 years from the epoch), producing a second, independent
  // `Invalid Date` the raw `lookbackDays` check alone can never catch.
  // Checking the *computed* `cutoff`'s own validity closes this
  // regardless of which input produced it.
  if (Number.isNaN(cutoff.getTime())) {
    throw new Error(`${fnName}: lookbackDays (${lookbackDays}) combined with asOf produces an out-of-range cutoff date`);
  }
  const fieldFeature = turfPolygon(fieldPolygon.coordinates);

  return candidates.filter((item) => {
    const acquired = new Date(item.datetime);
    if (Number.isNaN(acquired.getTime()) || acquired < cutoff || acquired > asOf) return false;
    try {
      return booleanIntersects(fieldFeature, item.geometry);
    } catch {
      // A malformed/unsupported real geometry excludes just this one
      // candidate, never the whole selection — the same partial-
      // tolerance discipline `cdse-stac-client.ts`'s own feature
      // parsing already applies.
      return false;
    }
  });
}

function toSatelliteFieldCoverage(best: Sentinel2L2AItem, algorithm: string): SatelliteFieldCoverage {
  return {
    provider: "Copernicus Data Space Ecosystem",
    mission: best.platform,
    productId: best.id,
    acquisitionTimestamp: best.datetime,
    processingLevel: best.processingLevel,
    cloudCoverPercent: best.cloudCoverPercent,
    ...(best.statistics?.vegetation !== undefined ? { vegetationPixelPercent: best.statistics.vegetation } : {}),
    algorithm,
    calculationVersion: SATELLITE_FIELD_COVERAGE_VERSION,
  };
}

/**
 * Selects the best real Sentinel-2 L2A scene for `fieldPolygon` from
 * `candidates` — least real `cloudCoverPercent` within the lookback
 * window, tie-broken by most recent `datetime`, restricted to scenes
 * whose own real footprint (`geometry`, not just the search bbox)
 * genuinely intersects the field's real polygon — a bbox-only search
 * can return a scene that only shares the field's bounding box, not its
 * actual shape (e.g. an irregular field near a tile edge), so this
 * function re-checks with the field's real polygon, not the looser
 * rectangle `@/domain/field-boundary`'s `boundingBox` used to build the
 * search request in the first place.
 *
 * `BLOCKED_INSUFFICIENT_EVIDENCE` (`NO_RECENT_SATELLITE_SCENE_AVAILABLE`)
 * when no candidate both intersects the field and falls inside the
 * lookback window — including when `candidates` is empty (a real CDSE
 * search failure/outage, or genuinely no coverage) or when the
 * *caller's own search bbox* was too loose (every candidate's real
 * footprint misses the field) — both real, honest "insufficient
 * evidence" cases, never silently reported as `OK` with a
 * poorly-matching scene.
 *
 * **This function has no cloud-cover usability ceiling** — it always
 * returns the least-cloudy candidate in the window, however cloudy that
 * candidate actually is (a 100%-cloud scene, if it is the only real
 * candidate, is still selected). That is deliberate for this function's
 * own "single clearest real image of this field" purpose, but a caller
 * that needs to know whether a scene is *usable* — not just "the least
 * bad one available" — should use `selectMostRecentUsableSatelliteCoverage`
 * instead (Codex audit HIGH, Farm Awareness / Satellite Field
 * Intelligence campaign round 1: the first version of that caller
 * treated this function's own result as "usable" unconditionally).
 */
export function selectBestSatelliteCoverage(
  fieldPolygon: GeoJSON.Polygon,
  candidates: Sentinel2L2AItem[],
  options: SelectSatelliteCoverageOptions = {},
): EngineOutcome<SatelliteFieldCoverage> {
  const eligible = filterEligibleCandidates("selectBestSatelliteCoverage", fieldPolygon, candidates, options);
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;

  if (eligible.length === 0) {
    return blockedInsufficientEvidence("NO_RECENT_SATELLITE_SCENE_AVAILABLE", ["sentinel2ScenesCoveringField"]);
  }

  const best = eligible.reduce((leastCloudy, candidate) => {
    if (candidate.cloudCoverPercent < leastCloudy.cloudCoverPercent) return candidate;
    if (candidate.cloudCoverPercent > leastCloudy.cloudCoverPercent) return leastCloudy;
    return new Date(candidate.datetime) > new Date(leastCloudy.datetime) ? candidate : leastCloudy;
  });

  return ok(
    toSatelliteFieldCoverage(
      best,
      `Least real scene-level cloud cover among scenes acquired within the last ${lookbackDays} days whose real footprint intersects the field (tie-break: most recent acquisition).`,
    ),
    "MEASURED",
  );
}

export interface SelectMostRecentUsableSatelliteCoverageOptions extends SelectSatelliteCoverageOptions {
  /** A candidate whose real `cloudCoverPercent` exceeds this ceiling is
   * excluded from consideration entirely — never selected, however
   * recent. Required, not defaulted here: what counts as "usable" is a
   * disclosed product-judgement call for the calling feature to own and
   * cite in its own evidence-register entry, not a silent default this
   * shared primitive would otherwise bake in unannounced. */
  maxCloudCoverPercent: number;
}

/**
 * Selects the most recently *usable* real Sentinel-2 L2A scene for
 * `fieldPolygon` — the scene, among every real candidate acquired
 * within the lookback window whose own real footprint genuinely
 * intersects the field AND whose real `cloudCoverPercent` is at or
 * below `options.maxCloudCoverPercent`, with the most recent
 * `datetime` (tie-break: least cloud cover).
 *
 * This answers a genuinely different question from
 * `selectBestSatelliteCoverage`'s "single clearest image in the
 * window" (least cloud cover, any age): *how recently* has this field
 * had a real, usable satellite look — the "monitoring currency"
 * question a freshness/attention classification (e.g.
 * `src/domain/field-awareness.ts`) actually needs. Ranking by cloud
 * cover first, the way `selectBestSatelliteCoverage` does, can pick a
 * scene many days older than a nearly-as-clear, much more recent one —
 * an honest answer to "clearest picture" but a misleading one for
 * "have we looked at this field lately" (Codex audit MEDIUM, Farm
 * Awareness / Satellite Field Intelligence campaign round 1).
 *
 * `BLOCKED_INSUFFICIENT_EVIDENCE` (`NO_RECENT_SATELLITE_SCENE_AVAILABLE`)
 * when no candidate is both eligible (window + footprint, same as
 * `selectBestSatelliteCoverage`) and at or below the cloud-cover
 * ceiling — this deliberately does not distinguish "no candidate at
 * all" from "every candidate was too cloudy" in its reason code: a
 * caller-facing message like "no usable satellite observation in the
 * last N days" is equally honest either way (see
 * `field-awareness.ts`'s own header comment on why more granularity
 * than that is not needed here).
 */
export function selectMostRecentUsableSatelliteCoverage(
  fieldPolygon: GeoJSON.Polygon,
  candidates: Sentinel2L2AItem[],
  options: SelectMostRecentUsableSatelliteCoverageOptions,
): EngineOutcome<SatelliteFieldCoverage> {
  if (!Number.isFinite(options.maxCloudCoverPercent) || options.maxCloudCoverPercent < 0 || options.maxCloudCoverPercent > 100) {
    throw new Error(
      `selectMostRecentUsableSatelliteCoverage: maxCloudCoverPercent must be a finite number between 0 and 100, got ${options.maxCloudCoverPercent}`,
    );
  }
  const eligible = filterEligibleCandidates("selectMostRecentUsableSatelliteCoverage", fieldPolygon, candidates, options);
  const usable = eligible.filter((candidate) => candidate.cloudCoverPercent <= options.maxCloudCoverPercent);
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;

  if (usable.length === 0) {
    return blockedInsufficientEvidence("NO_RECENT_SATELLITE_SCENE_AVAILABLE", ["sentinel2ScenesCoveringField"]);
  }

  const mostRecent = usable.reduce((newest, candidate) => {
    const candidateDate = new Date(candidate.datetime);
    const newestDate = new Date(newest.datetime);
    if (candidateDate > newestDate) return candidate;
    if (candidateDate < newestDate) return newest;
    return candidate.cloudCoverPercent < newest.cloudCoverPercent ? candidate : newest;
  });

  return ok(
    toSatelliteFieldCoverage(
      mostRecent,
      `Most recent real scene acquired within the last ${lookbackDays} days with real cloud cover at or below ${options.maxCloudCoverPercent}% whose real footprint intersects the field (tie-break: least cloud cover).`,
    ),
    "MEASURED",
  );
}
