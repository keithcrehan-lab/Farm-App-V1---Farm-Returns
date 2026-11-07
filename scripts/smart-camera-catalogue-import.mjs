#!/usr/bin/env node
/**
 * Review-only catalogue import: emits SQL from manually evidenced supplier
 * records. Never connects to Supabase, inserts rows, or guesses products.
 * Usage: node scripts/smart-camera-catalogue-import.mjs verified.json /tmp/catalogue-review.sql
 * Input must be an array of { gtin, productName, sourceName, sourceUrl,
 * reviewedAt, declaredAnalysis?, reviewerAttestation }. No auto-seeding.
 */
import { readFileSync, writeFileSync } from 'node:fs';

function canonicalGtin(input) {
  if (typeof input !== 'string' || !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(input)) return null;
  const digits = [...input].map(Number);
  const last = digits.pop();
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = weight === 3 ? 1 : 3) sum += digits[i] * weight;
  return (10 - sum % 10) % 10 === last ? input.padStart(14,'0') : null;
}
function quote(value) { return `'${String(value).replaceAll("'", "''")}'`; }
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year,month-1,day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day && value <= new Date().toISOString().slice(0,10);
}
const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('Specify curated JSON input and SQL output paths');
const rows = JSON.parse(readFileSync(inputPath,'utf8'));
if (!Array.isArray(rows) || rows.length === 0) throw new Error('At least one reviewed record required');
const seen = new Set();
const values = rows.map((row,index) => {
  const gtin = canonicalGtin(row.gtin);
  if (!gtin || seen.has(gtin)) throw new Error(`Row ${index+1}: invalid or repeated GTIN`);
  seen.add(gtin);
  if (!row.reviewerAttestation || row.reviewerAttestation !== 'Source independently checked') throw new Error(`Row ${index+1}: independent source review required`);
  for (const field of ['productName','sourceName']) if (typeof row[field] !== 'string' || !row[field].trim() || row[field].length > 300) throw new Error(`Row ${index+1}: invalid ${field}`);
  if (typeof row.sourceUrl !== 'string' || !row.sourceUrl.startsWith('https://')) throw new Error(`Row ${index+1}: verified source URL required`);
  if (!validDate(row.reviewedAt)) throw new Error(`Row ${index+1}: valid review date required`);
  if (row.declaredAnalysis !== undefined && (typeof row.declaredAnalysis !== 'string' || row.declaredAnalysis.length > 100)) throw new Error(`Row ${index+1}: invalid declared analysis`);
  return `(${[gtin,row.productName.trim(),row.declaredAnalysis ?? null,row.sourceName.trim(),row.sourceUrl,row.reviewedAt].map(v=>v===null?'NULL':quote(v)).join(', ')}, true)`;
});
const sql = `-- MANUAL REVIEW REQUIRED: generated from curator-evidenced records.\n-- Do not apply to production without independent verification.\ninsert into public.smart_camera_verified_fertiliser_products\n(gtin,product_name,declared_analysis,source_name,source_url,reviewed_at,is_active)\nvalues\n${values.join(',\n')}\non conflict (gtin) do nothing;\n`;
writeFileSync(outputPath,sql,{flag:'wx'});
console.log(`Generated review-only SQL for ${rows.length} verified-source entries: ${outputPath}`);
