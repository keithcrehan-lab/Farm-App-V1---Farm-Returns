import 'server-only';
import { parseFieldScanPayload, type FieldScanOutcome } from '@/domain/field-scan';

type Tile = { bbox: [number, number, number, number]; path: string; count: number };
type Manifest = { sourceYear: '2025'; tiles: Tile[] };
type Feature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, { id: string; parcelLabel?: string | null }>;
const base = () => process.env.LPIS_STATIC_BASE_URL?.replace(/\/$/, '');
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
  const candidates = (await Promise.all(tiles.map(async t => {
    const collection = await jsonAt<GeoJSON.FeatureCollection>(t.path);
    return collection.features.map(f => featureToCandidate(f as Feature)).filter(x => x !== null);
  }))).flat();
  const payload = { sourceLabel: 'DAFM LPIS 2025', sourceYear: '2025', coverageAtFarm: tiles.some(t => contains(t.bbox, lng, lat)), candidates: candidates.slice(0, 200) };
  return parseFieldScanPayload(payload, existingRefs);
}
export async function resolveStaticLpis(ids: string[]): Promise<FieldScanOutcome | null> {
  if (!base()) return null;
  if (ids.length > 80 || ids.some(id => !/^[\w.-]{1,120}$/.test(id))) throw new Error('Invalid LPIS references');
  const manifest = await jsonAt<Manifest>('manifest.json');
  if (manifest.tiles.length > 700) throw new Error('Static LPIS lookup requires a feature index');
  // Explicitly refuse a full-country scan: save must use a canonical indexed resolver.
  return null;
}
