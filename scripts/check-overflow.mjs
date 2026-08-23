/**
 * Checks a page for elements whose right edge extends past the viewport —
 * catches the flexbox/grid `min-width:auto` bug where one wide child (e.g.
 * a table needing horizontal scroll) forces its whole column wider than
 * the screen. Run this whenever a mobile screen has anything with an
 * intrinsic min-width (tables, long unwrapped text, fixed-size rows).
 *
 * Usage: node scripts/check-overflow.mjs <url> [width] [height]
 */
import { chromium } from "playwright";

const url = process.argv[2];
if (!url) {
  console.error("Usage: node scripts/check-overflow.mjs <url> [width] [height]");
  process.exit(1);
}
const width = Number(process.argv[3] ?? 390);
const height = Number(process.argv[4] ?? 844);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width, height } });
await page.goto(url, { waitUntil: "networkidle" });

const result = await page.evaluate(() => {
  const viewportWidth = window.innerWidth;
  const overflowing = [];
  document.querySelectorAll("body *").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right > viewportWidth + 1) {
      overflowing.push({
        tag: el.tagName,
        cls: el.className.toString().slice(0, 80),
        right: Math.round(r.right),
      });
    }
  });
  return { docWidth: document.documentElement.scrollWidth, viewportWidth, overflowing: overflowing.slice(0, 15) };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
process.exit(result.overflowing.length > 0 ? 1 : 0);
