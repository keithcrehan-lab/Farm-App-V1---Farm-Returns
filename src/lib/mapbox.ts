/**
 * Mapbox configuration — real satellite imagery, search and polygon
 * drawing (spec's `Maps` row: "MapLibre/Mapbox or suitable satellite
 * mapping provider; field polygon drawing/editing"), closing the open
 * question `docs/product-requirements.md` § "Mapping provider account"
 * flagged since Phase 0.
 *
 * `NEXT_PUBLIC_MAPBOX_TOKEN` is a Mapbox *public* token (starts `pk.`),
 * the type Mapbox's own docs say is safe to ship in client-side code —
 * unlike a secret key, it's meant to be visible in the browser bundle.
 * Still never hardcoded here: read from an env var (`.env.local`,
 * gitignored) so it's never committed and easy to rotate.
 *
 * `mapboxConfigured` lets every consumer show an honest "not configured"
 * state instead of crashing or silently rendering a broken map when the
 * token is missing — same convention as this app's UNAVAILABLE/UNVERIFIED
 * weather states.
 */
export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export const mapboxConfigured = MAPBOX_TOKEN.length > 0;

/** Mapbox's real satellite-with-labels style — the closest built-in match
 * to "satellite/aerial field map as hero surface" (design-system.md). Default
 * base style for field-boundary mapping: tracing a physical field boundary
 * needs to see the actual ground, not a schematic road map. */
export const MAPBOX_SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

/** Mapbox's plain satellite style — no street/place-name labels. The
 * calm, uncluttered aerial-photo surface every Farm Return Next v1.1
 * reference image shows (`media/image2.png` etc.); `MAPBOX_SATELLITE_STYLE`
 * above stays the boundary-drawing default, where labels genuinely help
 * (`FieldBoundaryMapModal`'s search/geocoder flow). */
export const MAPBOX_PLAIN_SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-v9";

/** Mapbox's real standard vector street style — the "Map" side of the
 * boundary modal's Map/Satellite toggle. Useful when a field's edges line
 * up with a road, townland boundary or other mapped line that's clearer on
 * a vector map than in aerial imagery. */
export const MAPBOX_STREETS_STYLE = "mapbox://styles/mapbox/streets-v12";

/** Biases search results toward Ireland without hard-restricting them —
 * a farmer's field is always in Ireland for this app's current scope, but
 * a bounding box (not a country filter) still lets a boundary-adjacent
 * search resolve sensibly. Real Ireland bounding box (incl. offshore
 * islands), not invented. */
export const IRELAND_BBOX: [number, number, number, number] = [-10.85, 51.2, -5.34, 55.7];
