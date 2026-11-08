# Nationwide Scan Fields — low-cost spatial data layer

## Decision
Keep farmer authentication, farm records, named fields, and edited geometries in Supabase. Store the immutable DAFM 2025 LPIS reference snapshot in a separate read-only object-storage/CDN dataset. Do not continue importing nationwide LPIS into the Free Plan PostgreSQL database (the project exceeded its storage quota during the previous attempt).

## Implementation sequence
1. Export and validate source parcels offline from the official GeoPackage with `scripts/export-lpis-static-tiles.mts`. The script accepts a WGS84 bounding box, even though the source GeoPackage uses EPSG:2157. Confirm source terms (CC BY 4.0 is recorded in our metadata) and attribution before public hosting.
2. Partition into small indexed geographic cells and publish a manifest containing source year, cell bounds, counts, checksums, and coverage. Host compressed GeoJSON or FlatGeobuf/PMTiles via an object-storage CDN. Never expose a privileged Supabase key to clients.
3. Implement a server-only lookup API that limits search radius, output count, response bytes, and request rate; resolves the relevant cells from the manifest, filters by exact geometry distance, and returns the existing `FieldScanOutcome` schema. Keep `lpisRef` stable as `dafm_lpis_2025:2025:<sourceFeatureId>`.
4. The save action must re-resolve each submitted feature ID from the immutable reference store; never trust client-submitted geometry for `lpis_imported` provenance. Keep field naming and boundary refinement as currently implemented.
5. Preserve the existing PostGIS RPC as fallback while the external reference service is incomplete. Use feature-flagged rollout and test in multiple counties before production.
6. Validate feature ID uniqueness, coordinate transforms, invalid polygons, file-size and request limits, nationwide completeness, source licensing, and actual hosting cost. Publish only after end-to-end mobile testing.

## Current limitations
The initial exporter produces one bounded GeoJSON file as a proof of the offline pipeline; it is **not** the nationwide production tile format. No CDN bucket, manifest, lookup API, or canonical feature re-resolution has been deployed. Existing production Scan Fields still uses the Supabase RPC.

## Vercel target
All deployments must use Farm IQ Vercel project `prj_G1qM47n7nSmlQYfqr5kI2RI2sWg5` in team `team_AEDVfh1AUUrf6CBOxw1qQ8og`. Run `npm run deploy:farm-iq:preview` or `npm run deploy:farm-iq:production` from the release checkout; both enforce project identity.
