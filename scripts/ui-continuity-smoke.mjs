/** Read-only, local signed-out UI regression sweep. No user or farm changes.
 * Usage: node scripts/ui-continuity-smoke.mjs http://localhost:3314
 * The real authenticated acceptance gate is separate from this demo check.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:3314';
const output = resolve(process.cwd(), 'docs/ui-continuity/smoke-screenshots');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
async function run(label, pathname, fn) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  page.setDefaultTimeout(6000);
  try {
    await page.goto(`${base}${pathname}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(500);
    const result = await fn(page);
    if (!result.pass) throw new Error(result.reason ?? 'Assertion failed');
    await page.screenshot({ path: `${output}/${label}.png`, animations: 'disabled' });
    checks.push({ label, pass: true, evidence: result.note ?? '' });
  } catch (error) {
    checks.push({ label, pass: false, error: String(error).slice(0, 300) });
  } finally { await page.close(); }
}
await run('barcode-is-product-not-field-error', '/smart-camera', async (page) => {
  await page.locator('#scanned-code').fill('3017620422003');
  const product = await page.getByText('Product barcode detected').isVisible();
  const misleading = await page.getByText(/No field in this farm matches/i).count();
  return { pass: product && misleading === 0, reason: 'A valid GTIN must show product identification without the field error' };
});
await run('orders-unreleased-schema-guard', '/smart-camera/orders', async (page) => {
  const body = await page.locator('body').innerText();
  return {
    pass: body.includes('Coming soon') && body.includes('database permissions') && !body.includes('Save confirmed purchase order'),
    reason: 'Orders must fail closed without a released, verified schema',
  };
});
await run('scheme-inputs-collapsed', '/schemes', async (page) => {
  const details = page.locator('details').filter({ hasText: /missing eligibility details/i }).first();
  return { pass: await details.count() === 1 && !(await details.evaluate(el => el.open)), reason: 'Scheme eligibility questions must start behind a disclosure' };
});
await run('supplier-return-action', '/supplier', async (page) => {
  const link = page.getByRole('link', { name: /Return to Farm Return/i });
  return { pass: await link.count() > 0 && (await link.first().getAttribute('href')) === '/today', reason: 'Supplier unavailable must offer return action' };
});
await run('plan-dated-milestone-guidance', '/plan', async (page) => {
  const content = await page.locator('body').innerText();
  return { pass: content.includes('No dated production milestones') && content.includes('Open cattle'), reason: 'Plan must distinguish dated milestones and link to Cattle' };
});
await run('farm-demo-labelled', '/today', async (page) => {
  const content = await page.locator('body').innerText();
  return { pass: content.includes('Farm Return · Current · Demo') || content.includes('FARM RETURN · CURRENT · DEMO'), reason: 'Mock Farm map must have a demo label' };
});
await run('reports-export-touch-target', '/reports', async (page) => {
  const heights = await page.getByRole('button', { name: /^Export$/ }).evaluateAll(bs => bs.map(el => el.getBoundingClientRect().height));
  return { pass: heights.length >= 3 && heights.every(h => h >= 43), note: `Export heights: ${heights.join(', ')}`, reason: 'Export controls should have 44px touch targets' };
});
writeFileSync(`${output}/results.json`, JSON.stringify(checks, null, 2));
console.log(JSON.stringify(checks, null, 2));
await browser.close();
if (checks.some(check => !check.pass)) process.exitCode = 1;
