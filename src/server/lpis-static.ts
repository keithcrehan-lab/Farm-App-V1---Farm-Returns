import 'server-only';
import { parseFieldScanPayload, type FieldScanOutcome } from '@/domain/field-scan';

type Tile = { bbox: [number, number, number, number]; path: string; count: number };
type Manifest = { sourceYear: '2025'; tiles: Tile[] };
type Feature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, { id: string; parcelLabel?: string | null }>;
const base = () => process.env.LPIS_STATIC_BUDGET_FUSE === 'OPEN' ? undefined : process.env.LPIS_STATIC_BASE_URL?.replace(/\/$/, '');
const validPath = (path: string) => /^[a-zA-Z0-9_./-]+$/.test(path) && !path.includes('..') && !path.startsWith('/');
async function jsonAt<T>(path: string): Promise<T> {
  const url = base();
  if (!url || !validPath(path)) throw new Error('LPIS static source not configured');
  const response = await fetch(`${url}/${path}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`LPIS static source HTTP ${response.status}`);
  const size = Number(response.headers.get('content-length') ?? 0);
  if (size > 5_000_000) throw new Error('LPIS tile exceeds response limit');
  const raw = await response.text();
  if (raw.length > 5_000_000) throw new Error('LPIS tile exceeds response limit');
  return JSON.parse(raw) as T;
}
function contains([west, south, east, north]: Tile['bbox'], lng: number, lat: number, buffer = 0) {
  return lng >= west - buffer && lng <= east + buffer && lat >= south - buffer && lat <= north + buffer;
}
function featureToCandidate(feature: Feature) {
  const id = String(feature.properties?.id ?? feature.id ?? '');
  if (!id || !/^[\w.-]{1,120}$/.test(id)) return null;
  return { id: `dafm-lpis-2025:${id}`, lpisRef: `dafm_lpis_2025:2025:${id}`, parcelLabel: feature.properties?.parcelLabel ?? null, sourceFeatureId: id, sourceLabel: 'DAFM LPIS 2025', sourceYear: '2025', polygon: feature.geometry };
}
export async function scanStaticLpis(lng: number, lat: number, existingRefs: string[]): Promise<FieldScanOutcome | null> {
  if (!base()) return null;
  const manifest = await jsonAt<Manifest>('manifest.json');
  if (manifest.sourceYear !== '2025' || !Array.isArray(manifest.tiles)) throw new Error('Invalid LPIS manifest');
  const buffer = 0.035;
  const tiles = manifest.tiles.filter(t => contains(t.bbox, lng, lat, buffer));
  if (tiles.length > 9) throw new Error('LPIS scan exceeded tile limit');
  if (tiles.length === 0) return null;
  const candidates = (await Promise.all(tiles.map(async t => {
    const collection = await jsonAt<GeoJSON.FeatureCollection>(t.path);
    return collection.features.map(f => featureToCandidate(f as Feature)).filter(x => x !== null);
  }))).flat();
  // Parse/validate geometry first, then rank by actual distance to the requested
  // scan centre rather than the arbitrary ordering of a geographic tile.
  const validated = parseFieldScanPayload({
    sourceLabel: 'DAFM LPIS 2025', sourceYear: '2025',
    coverageAtFarm: tiles.some(t => contains(t.bbox, lng, lat)), candidates,
  }, existingRefs);
  if (validated.status !== 'READY') return validated;
  const distance = (x: number, y: number) => {
    const radians = Math.PI / 180;
    const dLat = (y - lat) * radians;
    const dLon = (x - lng) * radians;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * radians) * Math.cos(y * radians) * Math.sin(dLon / 2) ** 2;
    return 12742000 * Math.asin(Math.min(1, Math.sqrt(a)));
  };
  return {
    ...validated,
    candidates: validated.candidates
      .map(candidate => ({ candidate, metres: distance(candidate.centroid[0], candidate.centroid[1]) }))
      .filter(item => item.metres <= 3000)
      .sort((a, b) => a.metres - b.metres)
      .slice(0, 120)
      .map(item => item.candidate),
  };
}
export async function resolveStaticLpis(ids: string[]): Promise<FieldScanOutcome | null> {
  if (!base()) return null;
  if (ids.length > 80 || ids.some(id => !/^[\w.-]{1,120}$/.test(id))) throw new Error('Invalid LPIS references');
  if (ids.length === 0) return parseFieldScanPayload({ sourceLabel: 'DAFM LPIS 2025', sourceYear: '2025', coverageAtFarm: true, candidates: [] });
  // The manifest index maps a canonical source feature ID to its immutable tile.
  // Never accept a tile URL or geometry supplied by the farmer's browser.
  const index = await jsonAt<{ sourceYear: string; features: Record<string, string> }>('feature-index.json');
  if (index.sourceYear !== '2025' || !index.features || typeof index.features !== 'object') throw new Error('Invalid LPIS feature index');
  const paths = [...new Set(ids.map(id => index.features[id]))];
  if (paths.some(path => !path || !validPath(path))) throw new Error('Selected LPIS parcel not indexed');
  if (paths.length > 12) throw new Error('Too many LPIS tiles selected at once');
  const collections = await Promise.all(paths.map(path => jsonAt<GeoJSON.FeatureCollection>(path)));
  const requested = new Set(ids);
  const byId = new Map<string, ReturnType<typeof featureToCandidate>>();
  for (const collection of collections) {
    for (const feature of collection.features) {
      const candidate = featureToCandidate(feature as Feature);
      if (candidate && requested.has(candidate.sourceFeatureId)) byId.set(candidate.sourceFeatureId, candidate);
    }
  }
  if (byId.size !== requested.size) throw new Error('Selected LPIS boundary missing from canonical tile');
  return parseFieldScanPayload({ sourceLabel: 'DAFM LPIS 2025', sourceYear: '2025', coverageAtFarm: true, candidates: ids.map(id => byId.get(id)) });
}
