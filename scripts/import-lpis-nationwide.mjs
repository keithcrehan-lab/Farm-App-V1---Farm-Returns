#!/usr/bin/env node
/** Resumable, bounded nationwide LPIS importer. Never marks an unimported tile complete. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const gpkg = process.argv[2];
const execute = process.argv.includes('--execute');
const checkpointArg = process.argv.find(a => a.startsWith('--checkpoint='));
const checkpoint = resolve(checkpointArg?.split('=').slice(1).join('=') || '.lpis-nationwide-progress.json');
if (!gpkg || gpkg.startsWith('--') || !existsSync(gpkg)) {
  console.error('Usage: node scripts/import-lpis-nationwide.mjs /path/to/LPIS.gpkg [--execute] [--checkpoint=path]');
  process.exit(1);
}
// Bounding envelope of the Republic of Ireland. Tiles with no LPIS features are not
// claimed as complete unless the bounded importer successfully completes that tile.
const bounds = [-10.8, 51.35, -5.3, 55.5];
const step = 0.2;
const round = n => Number(n.toFixed(4));
const tiles = [];
for (let lat = bounds[1]; lat < bounds[3] - 1e-8; lat += step) {
  for (let lon = bounds[0]; lon < bounds[2] - 1e-8; lon += step) {
    tiles.push([round(lon), round(lat), round(Math.min(lon + step, bounds[2])), round(Math.min(lat + step, bounds[3]))]);
  }
}
const previous = existsSync(checkpoint) ? JSON.parse(readFileSync(checkpoint, 'utf8')) : { completed: [] };
const completed = new Set(previous.completed || []);
console.log(`LPIS tiles: ${tiles.length}; completed: ${completed.size}; remaining: ${tiles.length - completed.size}; mode: ${execute ? 'IMPORT' : 'DRY RUN'}`);
if (!execute) { console.log('First 3 tiles:', tiles.slice(0, 3).map(t => t.join(','))); process.exit(0); }
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required Supabase import credentials; refusing to start.'); process.exit(1);
}
mkdirSync(dirname(checkpoint), { recursive: true });
for (const tile of tiles) {
  const key = tile.join(',');
  if (completed.has(key)) continue;
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/import-lpis-gpkg.mts', gpkg, `--bbox=${key}`], { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
  if (result.status !== 0) { console.error(`Import stopped on tile ${key}; completed tiles preserved.`); process.exit(result.status || 1); }
  completed.add(key);
  writeFileSync(checkpoint, JSON.stringify({ source: resolve(gpkg), completed: [...completed] }, null, 2));
}
console.log('All tile imports completed. Validate database counts, geographic coverage and licence before nationwide release.');
