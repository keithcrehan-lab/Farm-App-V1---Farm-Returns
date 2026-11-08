/**
 * Export a bounded LPIS GeoPackage region as compact read-only GeoJSON tiles.
 * These files belong in private-to-publish object storage/CDN, NOT Supabase DB.
 * Example: npx tsx scripts/export-lpis-static-tiles.mts source.gpkg output-dir --bbox=-9.0,53.0,-8.8,53.2
 * Upload output to an object store after checking dataset licensing and validation.
 */
import { GeoPackageAPI, BoundingBox } from '@ngageoint/geopackage';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const [input, output] = process.argv.slice(2);
const bboxArg = process.argv.find(a => a.startsWith('--bbox='));
if (!input || !output || !bboxArg) throw new Error('Usage: tsx scripts/export-lpis-static-tiles.mts file.gpkg output-dir --bbox=minLon,minLat,maxLon,maxLat');
const bounds = bboxArg.slice(7).split(',').map(Number);
if (bounds.length !== 4 || bounds.some(n => !Number.isFinite(n)) || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) throw new Error('Invalid bbox');
const gp = await GeoPackageAPI.open(resolve(input));
try {
  const table = gp.getFeatureTables().find(name => /parcel/i.test(name)) ?? gp.getFeatureTables()[0];
  if (!table) throw new Error('No feature table');
  const dao = gp.getFeatureDao(table);
  const features: GeoJSON.Feature[] = [];
  for (const feature of dao.queryForGeoJSONIndexedFeaturesWithBoundingBox(new BoundingBox(bounds[0], bounds[2], bounds[1], bounds[3]), false)) {
    if (feature.geometry?.type !== 'Polygon' && feature.geometry?.type !== 'MultiPolygon') continue;
    const properties = feature.properties ?? {};
    const label = Object.entries(properties).find(([k]) => /^(par_lab|parlab|parcel_label)$/i.test(k))?.[1];
    const id = String(feature.id ?? label ?? '');
    if (!id) continue;
    features.push({ type: 'Feature', id, properties: { id, parcelLabel: label == null ? null : String(label) }, geometry: feature.geometry });
  }
  const target = resolve(output);
  await mkdir(target, { recursive: true });
  const key = bounds.map(n => n.toFixed(4)).join('_');
  await writeFile(join(target, `${key}.geojson`), JSON.stringify({ type: 'FeatureCollection', features }));
  console.log(`Exported ${features.length} parcel geometries to ${key}.geojson`);
} finally { gp.close(); }
