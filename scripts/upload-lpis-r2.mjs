// Resumable, bounded-concurrency upload of the canonical LPIS publication to R2.
// Usage: node scripts/upload-lpis-r2.mjs <publishDir> <bucket> <prefix> [concurrency]
// - Uses the Cloudflare R2 object API with wrangler's existing login (token is never printed).
// - Verifies each object by comparing the returned ETag with the local MD5.
// - Records verified keys in <publishDir>/../r2-upload-ledger.jsonl so reruns resume.
// - Uploads chunks, then index nodes, then manifest.json LAST, so a reader can
//   never see a manifest that points at missing objects.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import os from 'node:os';
import { execSync } from 'node:child_process';

const [dir, bucket, prefix, conc = '16'] = process.argv.slice(2);
const ACCOUNT = '6f0d59cb2764bf623af3e4884e35996c';
const ledgerPath = path.join(dir, '..', 'r2-upload-ledger.jsonl');
const cfgPath = path.join(os.homedir(), 'Library/Preferences/.wrangler/config/default.toml');
let token = '';
const readToken = () => { token = (fs.readFileSync(cfgPath, 'utf8').match(/oauth_token\s*=\s*"([^"]+)"/) || [])[1] || ''; };
const refresh = () => { execSync('npx wrangler whoami', { stdio: 'ignore', cwd: dir }); readToken(); };
refresh();
if (!token) { console.error('No wrangler OAuth token; run `npx wrangler login`.'); process.exit(2); }

const done = new Set();
if (fs.existsSync(ledgerPath)) for (const l of fs.readFileSync(ledgerPath, 'utf8').split('\n')) if (l) done.add(JSON.parse(l).key);
const ledger = fs.createWriteStream(ledgerPath, { flags: 'a' });

const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const rel = f => path.relative(dir, f).split(path.sep).join('/');
const all = walk(dir).map(rel);
const last = ['chunks.json', 'feature-index.json', 'manifest.json'];
const rank = k => k.startsWith('chunk-') ? 0 : k.startsWith('spatial-index/') || k.startsWith('feature-index/') ? 1 : 2;
const ordered = all.filter(k => !last.includes(k)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
const todo = ordered.filter(k => !done.has(`${prefix}/${k}`));
console.log(`files=${all.length} alreadyVerified=${all.length - todo.length - last.filter(k => !done.has(`${prefix}/${k}`)).length} toUpload=${todo.length}+final`);

let ok = 0, bytes = 0, failed = 0; const t0 = Date.now();
async function put(k) {
  const key = `${prefix}/${k}`; const body = fs.readFileSync(path.join(dir, k));
  const md5 = crypto.createHash('md5').update(body).digest('hex');
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${bucket}/objects/${key}`, {
        method: 'PUT', body, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(120000),
      });
      if (res.status === 401 || res.status === 403) { refresh(); throw new Error(`auth ${res.status}`); }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json().catch(() => ({}));
      const etag = String(j?.result?.etag ?? res.headers.get('etag') ?? '').replace(/"/g, '');
      if (etag && etag !== md5) throw new Error(`etag mismatch ${etag} != ${md5}`);
      ledger.write(JSON.stringify({ key, md5, size: body.length, etagVerified: !!etag }) + '\n');
      ok++; bytes += body.length; return;
    } catch (e) {
      if (attempt === 6) { failed++; console.error(`FAILED ${key}: ${e.message}`); return; }
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}
async function pool(keys, n) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < keys.length) await put(keys[i++]); }));
}
const timer = setInterval(() => {
  const s = (Date.now() - t0) / 1000;
  fs.writeFileSync(path.join(dir, '..', 'r2-upload-status.json'), JSON.stringify({ ok, failed, remaining: todo.length - ok - failed, mb: Math.round(bytes / 1e6), mbps: +(bytes * 8 / 1e6 / s).toFixed(1), elapsedMin: +(s / 60).toFixed(1) }));
}, 5000);
await pool(todo, Number(conc));
if (failed === 0) for (const k of last) if (!done.has(`${prefix}/${k}`)) await put(k);
clearInterval(timer);
const status = { ok, failed, complete: failed === 0, mb: Math.round(bytes / 1e6), elapsedMin: +((Date.now() - t0) / 60000).toFixed(1) };
fs.writeFileSync(path.join(dir, '..', 'r2-upload-status.json'), JSON.stringify(status));
console.log('DONE', JSON.stringify(status));
ledger.end(); process.exit(failed ? 1 : 0);
