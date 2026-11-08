#!/usr/bin/env node
import { readFileSync } from 'node:fs';
const expected = { orgId: 'team_AEDVfh1AUUrf6CBOxw1qQ8og', projectId: 'prj_G1qM47n7nSmlQYfqr5kI2RI2sWg5' };
let actual;
try { actual = JSON.parse(readFileSync('.vercel/project.json', 'utf8')); }
catch { console.error('Farm IQ deployment blocked: missing .vercel/project.json'); process.exit(1); }
if (actual.orgId !== expected.orgId || actual.projectId !== expected.projectId) {
  console.error('Farm IQ deployment blocked: linked Vercel project is not the authorised Farm IQ project.');
  process.exit(1);
}
console.log('Verified: Farm IQ Vercel project');
