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
 * Usage: node scripts/visual-audit-capture.mjs <phase-slug> <route>[,route2,...] [baseUrl] [outBase] [fullPage]
 *   node scripts/visual-audit-capture.mjs v1-today /today
 *   node scripts/visual-audit-capture.mjs v2-farm /fields,/fields?field=xyz
 *   node scripts/visual-audit-capture.mjs today /today http://localhost:3100 strict-pass
 *   node scripts/visual-audit-capture.mjs field "/fields?field=x" http://localhost:3100 strict-pass viewport
 *
 * Saves <slug>-mobile-after.png (390x844) and <slug>-desktop-after.png
 * (1440x900, only for the first route unless --desktop-all is passed) to
 * docs/visual-audit/<outBase>/<phase-slug>/ (outBase defaults to "rebuild").
 *
 * `fullPage` (6th arg, default "full"): "full" captures the whole
 * scrollable page (right for most screens); "viewport" captures exactly
 * the 390x844/1440x900 frame with no scroll — the correct mode for a
 * screen with a `position: fixed` element (e.g. the floating bottom
 * nav dock) and more content than fits one screen, where a `fullPage`
 * capture would render the fixed element at its viewport-relative pixel
 * position *inside* the taller stitched image — visually misplaced
 * (appearing to overlap mid-page content) even though production
 * scrolling behaviour is correct. Not a real bug; a capture-methodology
 * artifact this flag avoids for screens tall enough to trigger it. */
const [, , phase, routesArg, baseUrl = "http://localhost:3100", outBase = "rebuild", fullPageArg = "full"] = process.argv;
if (!phase || !routesArg) {
  console.error("Usage: node scripts/visual-audit-capture.mjs <phase-slug> <route>[,route2,...] [baseUrl] [outBase] [fullPage]");
  process.exit(1);
}
const routes = routesArg.split(",");
const fullPage = fullPageArg !== "viewport";

const outDir = new URL(`../docs/visual-audit/${outBase}/${phase}/`, import.meta.url).pathname;
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
  await page.screenshot({ path: `${outDir}${filename}`, fullPage });
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
