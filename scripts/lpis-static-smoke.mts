// Real-data smoke test for the static LPIS reader.
// Usage: LPIS_STATIC_BASE_URL=<url> node --conditions=react-server --import tsx scripts/lpis-static-smoke.mts [lng,lat ...]
import { scanStaticLpis, resolveStaticLpis } from '../src/server/lpis-static';

const points = process.argv.slice(2).map(p => p.split(',').map(Number) as [number, number]);
let failed = false;
for (const [lng, lat] of points) {
  const t0 = Date.now();
  const scan = await scanStaticLpis(lng, lat, []);
  const ms = Date.now() - t0;
  if (!scan || scan.status !== 'READY' || scan.candidates.length === 0) { console.log(`FAIL ${lng},${lat}`, scan); failed = true; continue; }
  const pick = scan.candidates.slice(0, 3);
  const t1 = Date.now();
  const resolved = await resolveStaticLpis(pick.map(c => c.lpisRef.split(':').pop()!));
  const same = resolved?.status === 'READY' && pick.every(c => {
    const r = resolved.candidates.find(x => x.lpisRef === c.lpisRef);
    return r && JSON.stringify(r.polygon) === JSON.stringify(c.polygon);
  });
  if (!same) failed = true;
  console.log(`${same ? 'OK  ' : 'FAIL'} ${lng},${lat} candidates=${scan.candidates.length} coverage=${scan.coverageAtFarm} nearest=${pick.map(c => `${c.lpisRef.split(':').pop()}(${c.areaHa.toFixed(2)}ha)`).join(',')} scan=${ms}ms resolve=${Date.now() - t1}ms geometryMatch=${same}`);
}
process.exit(failed ? 1 : 0);
