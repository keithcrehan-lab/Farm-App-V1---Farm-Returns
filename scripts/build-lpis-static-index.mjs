#!/usr/bin/env node
/** Build a stable feature-to-tile index from already-exported LPIS GeoJSON tiles. */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const dir = process.argv[2];
if (!dir) throw new Error('Usage: node scripts/build-lpis-static-index.mjs /path/to/exported-tiles');
const files = (await readdir(dir)).filter(f => f.endsWith('.geojson')).sort();
const features = Object.create(null);
const tiles = [];
for (const file of files) {
  const name = file.slice(0, -8);
  const bbox = name.split('_').map(Number);
  if (bbox.length !== 4 || bbox.some(n => !Number.isFinite(n))) throw new Error(`Unexpected tile filename: ${file}`);
  const data = JSON.parse(await readFile(join(dir, file), 'utf8'));
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error(`Invalid tile: ${file}`);
  for (const feature of data.features) {
    const id = String(feature.properties?.id ?? feature.id ?? '');
    if (!id || !/^[\w.-]{1,120}$/.test(id)) throw new Error(`Invalid feature ID in ${file}`);
    if (features[id] && features[id] !== file) throw new Error(`Duplicate feature ID across tiles: ${id}`);
    features[id] = file;
  }
  tiles.push({ bbox, path: file, count: data.features.length });
}
await writeFile(join(dir, 'manifest.json'), JSON.stringify({ sourceYear: '2025', tiles }));
await writeFile(join(dir, 'feature-index.json'), JSON.stringify({ sourceYear: '2025', features }));
console.log(`Indexed ${Object.keys(features).length} unique features across ${tiles.length} tiles`);
