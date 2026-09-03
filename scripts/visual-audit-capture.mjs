import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Farm Return Next — Visual Alignment / UI Rebuild screenshot capture.
 *
 * Real local Playwright (chromium.launch() with no explicit
 * executablePath — this repo's committed scripts/screenshot.mjs points
 * at /opt/pw-browsers/chromium, which doesn't exist in this environment;
 * this uses the real local cache at ~/Library/Caches/ms-playwright
 * instead, same as the earlier `docs/visual-audit/current/` capture).
 *
 * Usage: node scripts/visual-audit-capture.mjs <phase-slug> <route>[,route2,...] [baseUrl]
 *   node scripts/visual-audit-capture.mjs v1-today /today
 *   node scripts/visual-audit-capture.mjs v2-farm /fields,/fields?field=xyz
 *
 * Saves <slug>-mobile-after.png (390x844) and <slug>-desktop-after.png
 * (1440x900, only for the first route unless --desktop-all is passed) to
 * docs/visual-audit/rebuild/<phase-slug>/.
 */
const [, , phase, routesArg, baseUrl = "http://localhost:3100"] = process.argv;
if (!phase || !routesArg) {
  console.error("Usage: node scripts/visual-audit-capture.mjs <phase-slug> <route>[,route2,...] [baseUrl]");
  process.exit(1);
}
const routes = routesArg.split(",");

const outDir = new URL(`../docs/visual-audit/rebuild/${phase}/`, import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

const browser = await chromium.launch();

async function shot(route, viewport, filename) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${baseUrl}${route}`, { waitUntil: "load", timeout: 45000 });
  try {
    await page.waitForSelector(".mapboxgl-canvas", { timeout: 15000 });
  } catch {
    // no map on this screen — fine
  }
  await page.waitForTimeout(2500); // Mapbox tiles + mounted-gated effects settling
  await page.screenshot({ path: `${outDir}${filename}`, fullPage: true });
  console.log(`Saved ${filename}`);
  await page.close();
}

for (const [i, route] of routes.entries()) {
  const slug = routes.length > 1 ? `${phase}-${i + 1}` : phase;
  await shot(route, MOBILE, `${slug}-mobile-after.png`);
  await shot(route, DESKTOP, `${slug}-desktop-after.png`);
}

await browser.close();
console.log("done");
