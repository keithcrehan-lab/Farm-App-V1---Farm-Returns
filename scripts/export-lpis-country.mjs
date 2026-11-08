#!/usr/bin/env node
/** Resumable offline national export. Never writes to Supabase. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Usage: node scripts/export-lpis-country.mjs source.gpkg output-dir');
mkdirSync(destination, { recursive: true });
const step = 0.05;
let completed = 0, skipped = 0;
for (let iy = 0; iy < 83; iy++) {
  for (let ix = 0; ix < 110; ix++) {
    const west = -10.8 + ix * step, south = 51.35 + iy * step;
    const east = west + step, north = south + step;
    const values = [west, south, east, north].map(n => n.toFixed(4));
    const file = join(destination, values.join('_') + '.geojson');
    if (existsSync(file)) { skipped++; continue; }
    const result = spawnSync('node', ['--import', 'tsx', 'scripts/export-lpis-static-tiles.mts', source, destination, '--bbox=' + values.join(',')], { stdio: 'ignore' });
    if (result.status !== 0) throw new Error(`Export failed at ${values.join(',')}`);
    completed++;
    if (completed % 100 === 0) console.log(`Exported ${completed}, skipped ${skipped}`);
  }
}
console.log(`Finished: ${completed} exported, ${skipped} already present. Run node scripts/build-lpis-static-index.mjs ${destination}`);
