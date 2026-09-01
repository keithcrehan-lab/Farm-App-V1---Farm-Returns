/**
 * Server-only HTTP client for the Copernicus Data Space Ecosystem
 * (CDSE)'s public STAC (SpatioTemporal Asset Catalog) API —
 * `MASTER_SPEC.md`/`BLOCKERS.md`'s decided satellite provider
 * (product-owner decision, 2026-09-01): the official CDSE, initial
 * source Sentinel-2 Level-2A surface-reflectance imagery, behind a
 * provider boundary (this file is that boundary — nothing outside
 * `src/server/satellite/` knows CDSE's own URL shape or response
 * format).
 *
 * ✅ LIVE, VERIFIED — 2026-09-01. Real endpoint
 * (`https://catalogue.dataspace.copernicus.eu/stac`), confirmed via a
 * real request during this build session: an unauthenticated `GET` to
 * `/collections/sentinel-2-l2a/items?bbox=...&datetime=.../...&limit=...`
 * returned HTTP 200 with real Sentinel-2 L2A scenes covering Irish
 * coordinates (`bbox=-8.5,52.0,-8.0,52.5`), including real
 * `eo:cloud_cover` percentages and a real, provider-computed
 * `statistics` breakdown (water/vegetation/cloud/etc. pixel
 * percentages) per scene. **STAC catalogue search/metadata does not
 * require authentication** — only actually downloading a scene's raw
 * band data does (CDSE's own `auth:schemes` field on each asset names
 * `oidc`/`s3` credentials this build session does not have and cannot
 * create — account creation is a hard policy prohibition regardless of
 * network access). This client is therefore genuinely real and working
 * today for catalogue search; it does not and cannot download or
 * process raw band imagery (no real NDVI/vegetation-index computation
 * from raw bands is possible without those credentials — see
 * `BLOCKERS.md`'s dedicated entry). A real, live response was saved as
 * this file's own fixture (`cdse-stac-client.real-fixtures.ts`) — the
 * same "capture a real response as evidence, don't hand-write a
 * plausible-looking one" discipline `forecast-parser.real-fixtures.ts`
 * already established for Met Éireann.
 *
 * Same "always resolves, never throws" contract as
 * `forecast-client.ts`'s `fetchLocationForecast` / `edr-client.ts`'s
 * `fetchEdrObservations`, for the identical reason: a caller must never
 * have to remember to catch this, and a real failure must never be
 * silently swallowed into fabricated data.
 */
import "server-only";

export const CDSE_STAC_BASE_URL = "https://catalogue.dataspace.copernicus.eu/stac";
export const CDSE_STAC_DEFAULT_TIMEOUT_MS = 10_000;
export const CDSE_STAC_DEFAULT_RETRIES = 2;
export const CDSE_STAC_RETRY_BACKOFF_MS = 500;

/**
 * One real Sentinel-2 L2A scene's STAC metadata — only the fields this
 * app actually reads, named exactly as CDSE's own real response does
 * (`eo:cloud_cover`, `processing:level`, etc. mapped to camelCase here;
 * see this module's own doc comment for the live response this shape
 * was captured from). `statistics` is CDSE's own provider-computed,
 * scene-wide pixel-classification breakdown (percentages) — real,
 * provider-sourced evidence, but scene-wide, not field-specific, and
 * never presented as a direct vegetation-index/biomass value (see
 * `src/domain/satellite-field-coverage.ts`'s own doc comment for the
 * full disclosure this app makes about what this data can and cannot
 * claim).
 */
export interface Sentinel2L2AItem {
  id: string;
  /** [minLng, minLat, maxLng, maxLat] — the scene's own real footprint,
   * not the query bbox. */
  bbox: [number, number, number, number];
  geometry: GeoJSON.Geometry;
  /** ISO datetime — real acquisition instant. */
  datetime: string;
  /** e.g. "sentinel-2a" — the specific satellite. */
  platform: string;
  /** e.g. "sentinel-2" — the mission/constellation. */
  constellation: string;
  cloudCoverPercent: number;
  /** e.g. "L2" — real STAC `processing:level`. */
  processingLevel: string;
  /** e.g. "S2MSI2A" — real STAC `product:type`. */
  productType: string;
  /** Real STAC `processing:version` — the specific processing baseline
   * that produced this scene (e.g. "05.12"), not a Farm Return version. */
  processingVersion: string;
  /** CDSE's own real, provider-computed scene-wide pixel-classification
   * percentages — present only when the response includes them (some
   * scenes may not). Keys are CDSE's own real class names, unmapped. */
  statistics?: Record<string, number>;
}

export type StacSearchResult =
  | { status: "ok"; items: Sentinel2L2AItem[]; retrievedAt: string; url: string }
  | { status: "unavailable"; reason: string; retrievedAt: string; url: string | null };

export interface Sentinel2SearchRequest {
  /** [minLng, minLat, maxLng, maxLat] — e.g.
   * `@/domain/field-boundary`'s `boundingBox(field.polygon)`. */
  bbox: [number, number, number, number];
  /** ISO date/datetime, inclusive start of the search window. */
  dateFrom: string;
  /** ISO date/datetime, inclusive end of the search window. */
  dateTo: string;
  /** STAC page size — this client does not paginate; a caller wanting
   * more than one page's worth should narrow the date range instead
   * (kept simple deliberately — no real consumer needs pagination yet,
   * the same "don't build ahead of a real need" discipline this build
   * session has applied elsewhere). */
  limit?: number;
  timeoutMs?: number;
  retries?: number;
}

const DEFAULT_LIMIT = 20;

export function buildSentinel2SearchUrl(request: Pick<Sentinel2SearchRequest, "bbox" | "dateFrom" | "dateTo" | "limit">): string {
  const [minLng, minLat, maxLng, maxLat] = request.bbox;
  const params = new URLSearchParams({
    bbox: `${minLng},${minLat},${maxLng},${maxLat}`,
    datetime: `${request.dateFrom}/${request.dateTo}`,
    limit: String(request.limit ?? DEFAULT_LIMIT),
  });
  return `${CDSE_STAC_BASE_URL}/collections/sentinel-2-l2a/items?${params.toString()}`;
}

/** A real longitude/latitude pair is finite and within Earth's actual
 * coordinate range — never trusted merely for being `typeof === "number"`
 * (`NaN`/`Infinity`/a wildly out-of-range value all pass that check).
 * Codex audit HIGH, `docs/farm-return-next/audit-logs/
 * 20260901T152948Z.md`: the first version of `parseStacFeature` admitted
 * any JS `number`, including non-finite or impossible ones, as real
 * measured evidence. */
function isValidLngLat([lng, lat]: [unknown, unknown]): boolean {
  return typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180 && typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

/** A real STAC `eo:cloud_cover` is a finite percentage, 0-100 inclusive
 * — same "don't trust a bare `typeof number`" reasoning as
 * `isValidLngLat` above. */
function isValidPercent(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
}

/** CDSE's own real `statistics` object is a flat map of class-name to a
 * real, finite percentage — rejected wholesale (not partially trusted)
 * if any entry isn't, since a partially-malformed statistics object
 * gives no way to know which entries are still trustworthy. */
function isValidStatistics(value: unknown): value is Record<string, number> {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).every(isValidPercent);
}

/** Real STAC feature -> `Sentinel2L2AItem`. Only maps fields this app
 * actually reads (see `Sentinel2L2AItem`'s own doc comment) — a real
 * STAC feature carries dozens more (`view:sun_elevation`, `sat:orbit_state`,
 * asset hrefs requiring `oidc`/`s3` auth this client never uses, ...),
 * deliberately not carried through until a real consumer needs one. */
function parseStacFeature(feature: unknown): Sentinel2L2AItem | null {
  if (typeof feature !== "object" || feature === null) return null;
  const f = feature as Record<string, unknown>;
  const props = f.properties as Record<string, unknown> | undefined;
  if (
    typeof f.id !== "string" ||
    !Array.isArray(f.bbox) ||
    f.bbox.length !== 4 ||
    !isValidLngLat([f.bbox[0], f.bbox[1]]) ||
    !isValidLngLat([f.bbox[2], f.bbox[3]]) ||
    typeof f.geometry !== "object" ||
    f.geometry === null ||
    !props ||
    typeof props.datetime !== "string" ||
    Number.isNaN(new Date(props.datetime).getTime()) ||
    typeof props.platform !== "string" ||
    typeof props.constellation !== "string" ||
    !isValidPercent(props["eo:cloud_cover"]) ||
    typeof props["processing:level"] !== "string" ||
    typeof props["product:type"] !== "string" ||
    typeof props["processing:version"] !== "string"
  ) {
    return null;
  }
  const statistics = props.statistics;
  return {
    id: f.id,
    bbox: f.bbox as [number, number, number, number],
    geometry: f.geometry as GeoJSON.Geometry,
    datetime: props.datetime,
    platform: props.platform,
    constellation: props.constellation,
    cloudCoverPercent: props["eo:cloud_cover"] as number,
    processingLevel: props["processing:level"] as string,
    productType: props["product:type"] as string,
    processingVersion: props["processing:version"] as string,
    ...(isValidStatistics(statistics) ? { statistics } : {}),
  };
}

/**
 * Searches CDSE's public Sentinel-2 L2A STAC collection for scenes
 * covering `bbox` within `[dateFrom, dateTo]`. Unauthenticated (see this
 * module's own doc comment for why that's genuinely enough for catalogue
 * search). A feature the real response includes that fails
 * `parseStacFeature`'s own shape check is silently skipped, not fatal to
 * the whole request — the same "one malformed item doesn't poison the
 * batch" partial-tolerance already established for
 * `src/lib/offline/outbox.ts`'s `flush()`, applied here to a different
 * class of "many independent real-world items, one might be malformed"
 * problem.
 */
export async function searchSentinel2L2AScenes(request: Sentinel2SearchRequest): Promise<StacSearchResult> {
  const { timeoutMs = CDSE_STAC_DEFAULT_TIMEOUT_MS, retries = CDSE_STAC_DEFAULT_RETRIES } = request;
  const url = buildSentinel2SearchUrl(request);

  let lastReason = "unknown error";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/geo+json" },
        // Server-side per-request cache — new Sentinel-2 scenes land at
        // most every ~2-3 days over Ireland (two-satellite constellation,
        // mid-latitude revisit); a shorter revalidate than that is plenty
        // fresh without hammering the upstream catalogue.
        next: { revalidate: 3600 },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        let bodyText = "";
        try {
          bodyText = await response.text();
        } catch {
          // Body unreadable — proceed without it, not fatal.
        }
        return {
          status: "unavailable",
          reason: `CDSE STAC search failed: HTTP ${response.status} ${response.statusText}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ""}`,
          retrievedAt: new Date().toISOString(),
          url,
        };
      }

      const body = (await response.json()) as { features?: unknown[] };
      const items = (body.features ?? []).map(parseStacFeature).filter((item): item is Sentinel2L2AItem => item !== null);
      return { status: "ok", items, retrievedAt: new Date().toISOString(), url };
    } catch (err) {
      clearTimeout(timeout);
      lastReason =
        err instanceof Error
          ? err.name === "AbortError"
            ? `CDSE STAC search timed out after ${timeoutMs}ms`
            : err.message
          : String(err);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, CDSE_STAC_RETRY_BACKOFF_MS * (attempt + 1)));
      }
    }
  }

  return { status: "unavailable", reason: lastReason, retrievedAt: new Date().toISOString(), url };
}
