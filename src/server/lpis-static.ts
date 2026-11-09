import 'server-only';
import { createHash } from 'node:crypto';
import { parseFieldScanPayload, type FieldScanOutcome } from '@/domain/field-scan';

type BBox = [number, number, number, number];
type Tile = { bbox: BBox; path: string; count: number };
/** Legacy (v1) publication: flat tile list + flat feature index. */
type LegacyManifest = { sourceYear: '2025'; tiles: Tile[] };
/** Canonical national (v3) publication: hierarchical spatial index. */
type CanonicalManifest = { version: 3; sourceYear: '2025'; coverage: BBox[]; spatial: { path: string; bbox: BBox } };
type SpatialEntry = { id: string; bbox: BBox; path: string; bytes?: number };
type SpatialNode = { children?: { path: string; bbox: BBox }[]; entries?: SpatialEntry[] };
type Feature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, { id: string; parcelLabel?: string | null }>;

const SOURCE = { sourceLabel: 'DAFM LPIS 2025', sourceYear: '2025' } as const;
const SCAN_RADIUS_M = 3000;
const RESULT_LIMIT = 120;
// Parcels considered before geometry is downloaded. Comfortably above
// RESULT_LIMIT so ranking by true centroid distance is unaffected.
const PRE_RANK_LIMIT = 400;
// The national publication contains many slivers (often < 50 m2) that are not
// farmable fields; they crowd real fields out of the nearest-N result. A bbox
// area is an upper bound on polygon area, so this pre-filter is safe.
const MIN_FIELD_HA = 0.05;
const INDEX_MAX_BYTES = 1_000_000; // manifest, spatial nodes, shards (largest observed ~222 KB)
const CHUNK_MAX_BYTES = 16_500_000; // publication maxBytes is 16,000,000
const SCAN_CHUNK_BUDGET_BYTES = 48_000_000; // per request; typical scan is 10-17 MB
const MAX_SPATIAL_NODES = 120; // typical scan visits 16-52 nodes, depth 2
// Chunks per request (scan or save). Scans across 7 counties touched 4-9;
// the byte budget above is the real memory guard for scans.
const MAX_CHUNKS = 24;
const CONCURRENCY = 8; // small index files
const CHUNK_CONCURRENCY = 4; // bounds peak parse memory (chunks up to 16 MB)

const base = () => process.env.LPIS_STATIC_BUDGET_FUSE === 'OPEN' ? undefined : process.env.LPIS_STATIC_BASE_URL?.replace(/\/$/, '');
const validPath = (path: string) => /^[a-zA-Z0-9_./-]+$/.test(path) && !path.includes('..') && !path.startsWith('/');
const validId = (id: string) => /^[\w.-]{1,120}$/.test(id);

async function jsonAt<T>(path: string, maxBytes = 5_000_000, kind: 'index' | 'chunk' = 'index'): Promise<T> {
  const url = base();
  if (!url || !validPath(path)) throw new Error('LPIS static source not configured');
  // Small index files use the Next data cache; geometry chunks exceed its 2 MB
  // item limit, so they are streamed fresh from the CDN-backed bucket instead.
  const init: RequestInit & { next?: { revalidate: number } } = kind === 'index'
    ? { next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000) }
    : { cache: 'no-store', signal: AbortSignal.timeout(15000) };
  const response = await fetch(`${url}/${path}`, init);
  if (!response.ok) throw new Error(`LPIS static source HTTP ${response.status}`);
  const size = Number(response.headers.get('content-length') ?? 0);
  if (size > maxBytes) throw new Error('LPIS file exceeds response limit');
  const raw = await response.text();
  if (raw.length > maxBytes) throw new Error('LPIS file exceeds response limit');
  return JSON.parse(raw) as T;
}

/** Run async work over items with bounded concurrency, preserving order. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

function contains([west, south, east, north]: BBox, lng: number, lat: number, buffer = 0) {
  return lng >= west - buffer && lng <= east + buffer && lat >= south - buffer && lat <= north + buffer;
}
const intersects = (a: BBox, b: BBox) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const isCanonical = (m: unknown): m is CanonicalManifest => {
  const r = m as Partial<CanonicalManifest> | null;
  return !!r && r.version === 3 && r.sourceYear === '2025' && !!r.spatial && typeof r.spatial.path === 'string' && Array.isArray(r.coverage);
};

function featureToCandidate(feature: Feature) {
  const id = String(feature.properties?.id ?? feature.id ?? '');
  if (!id || !validId(id)) return null;
  return { id: `dafm-lpis-2025:${id}`, lpisRef: `dafm_lpis_2025:2025:${id}`, parcelLabel: feature.properties?.parcelLabel ?? null, sourceFeatureId: id, sourceLabel: SOURCE.sourceLabel, sourceYear: SOURCE.sourceYear, polygon: feature.geometry };
}
type Candidate = NonNullable<ReturnType<typeof featureToCandidate>>;

/** Download chunks and keep only the wanted parcel IDs (each chunk is parsed and released in turn). */
async function candidatesFromChunks(paths: string[], wanted: Set<string>): Promise<Map<string, Candidate>> {
  const byId = new Map<string, Candidate>();
  await mapLimit(paths, CHUNK_CONCURRENCY, async path => {
    const collection = await jsonAt<GeoJSON.FeatureCollection>(path, CHUNK_MAX_BYTES, 'chunk');
    for (const feature of collection.features) {
      const candidate = featureToCandidate(feature as Feature);
      if (candidate && wanted.has(candidate.sourceFeatureId) && !byId.has(candidate.sourceFeatureId)) byId.set(candidate.sourceFeatureId, candidate);
    }
  });
  return byId;
}

function haversine(lng: number, lat: number, x: number, y: number) {
  const radians = Math.PI / 180;
  const dLat = (y - lat) * radians;
  const dLon = (x - lng) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * radians) * Math.cos(y * radians) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function rankNearest(validated: FieldScanOutcome, lng: number, lat: number): FieldScanOutcome {
  if (validated.status !== 'READY') return validated;
  return {
    ...validated,
    candidates: validated.candidates
      .map(candidate => ({ candidate, metres: haversine(lng, lat, candidate.centroid[0], candidate.centroid[1]) }))
      .filter(item => item.metres <= SCAN_RADIUS_M && item.candidate.areaHa >= MIN_FIELD_HA)
      .sort((a, b) => a.metres - b.metres)
      .slice(0, RESULT_LIMIT)
      .map(item => item.candidate),
  };
}

async function scanCanonical(manifest: CanonicalManifest, lng: number, lat: number, existingRefs: string[]): Promise<FieldScanOutcome | null> {
  // Search box sized to the scan radius (plus a margin for parcels whose
  // centroid is inside the radius but whose bbox centre is not).
  const dLat = (SCAN_RADIUS_M + 500) / 111_320;
  const dLng = dLat / Math.cos(lat * Math.PI / 180);
  const box: BBox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
  if (!intersects(manifest.spatial.bbox, box)) return null;

  let frontier = [manifest.spatial.path];
  let visited = 0;
  const entries = new Map<string, SpatialEntry>();
  while (frontier.length > 0) {
    visited += frontier.length;
    if (visited > MAX_SPATIAL_NODES) throw new Error('LPIS scan exceeded spatial index limit');
    const nodes = await mapLimit(frontier, CONCURRENCY, path => jsonAt<SpatialNode>(path, INDEX_MAX_BYTES));
    frontier = [];
    for (const node of nodes) {
      for (const child of node.children ?? []) if (validPath(child.path) && intersects(child.bbox, box)) frontier.push(child.path);
      for (const entry of node.entries ?? []) {
        if (validId(entry.id) && validPath(entry.path) && intersects(entry.bbox, box)) entries.set(entry.id, entry); // dedupes cross-leaf IDs
      }
    }
  }
  if (entries.size === 0) return null;

  // Pre-rank by bbox centre so only the chunks holding the nearest parcels are downloaded.
  const minM2 = MIN_FIELD_HA * 10_000;
  const bboxM2 = (b: BBox) => (b[2] - b[0]) * 111_320 * Math.cos(lat * Math.PI / 180) * (b[3] - b[1]) * 111_320;
  const nearest = [...entries.values()]
    .filter(e => bboxM2(e.bbox) >= minM2)
    .map(e => ({ e, metres: haversine(lng, lat, (e.bbox[0] + e.bbox[2]) / 2, (e.bbox[1] + e.bbox[3]) / 2) }))
    .sort((a, b) => a.metres - b.metres)
    .slice(0, PRE_RANK_LIMIT)
    .map(x => x.e);
  const chunkBytes = new Map<string, number>();
  for (const e of nearest) chunkBytes.set(e.path, e.bytes ?? 0);
  if (chunkBytes.size > MAX_CHUNKS) throw new Error('LPIS scan exceeded chunk limit');
  const total = [...chunkBytes.values()].reduce((a, b) => a + b, 0);
  if (total > SCAN_CHUNK_BUDGET_BYTES) throw new Error('LPIS scan exceeded byte budget');

  const byId = await candidatesFromChunks([...chunkBytes.keys()], new Set(nearest.map(e => e.id)));
  const validated = parseFieldScanPayload({
    ...SOURCE,
    coverageAtFarm: manifest.coverage.some(cell => contains(cell, lng, lat)),
    candidates: [...byId.values()],
  }, existingRefs);
  return rankNearest(validated, lng, lat);
}

async function scanLegacy(manifest: LegacyManifest, lng: number, lat: number, existingRefs: string[]): Promise<FieldScanOutcome | null> {
  const buffer = 0.035;
  const tiles = manifest.tiles.filter(t => contains(t.bbox, lng, lat, buffer));
  if (tiles.length > 9) throw new Error('LPIS scan exceeded tile limit');
  if (tiles.length === 0) return null;
  const candidates = (await Promise.all(tiles.map(async t => {
    const collection = await jsonAt<GeoJSON.FeatureCollection>(t.path);
    return collection.features.map(f => featureToCandidate(f as Feature)).filter(x => x !== null);
  }))).flat();
  const validated = parseFieldScanPayload({ ...SOURCE, coverageAtFarm: tiles.some(t => contains(t.bbox, lng, lat)), candidates }, existingRefs);
  return rankNearest(validated, lng, lat);
}

export async function scanStaticLpis(lng: number, lat: number, existingRefs: string[]): Promise<FieldScanOutcome | null> {
  if (!base()) return null;
  const manifest = await jsonAt<unknown>('manifest.json', INDEX_MAX_BYTES);
  if (isCanonical(manifest)) return scanCanonical(manifest, lng, lat, existingRefs);
  const legacy = manifest as LegacyManifest;
  if (legacy?.sourceYear !== '2025' || !Array.isArray(legacy.tiles)) throw new Error('Invalid LPIS manifest');
  return scanLegacy(legacy, lng, lat, existingRefs);
}

type ShardedIndex = { version: 2; sourceYear: '2025'; algorithm: 'sha256-prefix-3'; shards: Record<string, string> };
type LegacyIndex = { sourceYear: string; features: Record<string, string> };

/** Map canonical parcel IDs to their immutable geometry chunk. */
async function chunkPathsFor(ids: string[]): Promise<Map<string, string | undefined>> {
  const index = await jsonAt<ShardedIndex | LegacyIndex>('feature-index.json', INDEX_MAX_BYTES);
  if (index.sourceYear !== '2025') throw new Error('Invalid LPIS feature index');
  if ('shards' in index) {
    if (index.version !== 2 || index.algorithm !== 'sha256-prefix-3' || !index.shards || typeof index.shards !== 'object') throw new Error('Invalid LPIS feature index');
    const shardOf = (id: string) => createHash('sha256').update(id).digest('hex').slice(0, 3);
    const keys = [...new Set(ids.map(shardOf))];
    const shardPaths = keys.map(k => index.shards[k]);
    if (shardPaths.some(p => !p || !validPath(p))) throw new Error('Selected LPIS parcel not indexed');
    const shards = await mapLimit(shardPaths, CONCURRENCY, p => jsonAt<{ shard: string; sourceYear: string; features: Record<string, string> }>(p, INDEX_MAX_BYTES));
    const byKey = new Map(keys.map((k, i) => [k, shards[i]]));
    return new Map(ids.map(id => {
      const shard = byKey.get(shardOf(id));
      return [id, shard && shard.shard === shardOf(id) && shard.sourceYear === '2025' ? shard.features?.[id] : undefined];
    }));
  }
  if (!index.features || typeof index.features !== 'object') throw new Error('Invalid LPIS feature index');
  return new Map(ids.map(id => [id, index.features[id]]));
}

export async function resolveStaticLpis(ids: string[]): Promise<FieldScanOutcome | null> {
  if (!base()) return null;
  if (ids.length > 80 || ids.some(id => !validId(id))) throw new Error('Invalid LPIS references');
  if (ids.length === 0) return parseFieldScanPayload({ ...SOURCE, coverageAtFarm: true, candidates: [] });
  // The published index maps a canonical source feature ID to its immutable
  // chunk. Never accept a chunk URL or geometry supplied by the farmer's browser.
  const pathById = await chunkPathsFor(ids);
  const paths = [...new Set(pathById.values())];
  if (paths.some(path => !path || !validPath(path))) throw new Error('Selected LPIS parcel not indexed');
  if (paths.length > MAX_CHUNKS) throw new Error('Too many LPIS tiles selected at once');
  const byId = await candidatesFromChunks(paths as string[], new Set(ids));
  if (byId.size !== new Set(ids).size) throw new Error('Selected LPIS boundary missing from canonical tile');
  return parseFieldScanPayload({ ...SOURCE, coverageAtFarm: true, candidates: ids.map(id => byId.get(id)) });
}
