/**
 * Checks whether a page itself scrolls horizontally (document.scrollWidth
 * > window.innerWidth) — the real signal for the flexbox/grid
 * `min-width:auto` bug where one wide child (e.g. a table needing its own
 * horizontal scroll) forces its whole column wider than the screen.
 *
 * Elements that are individually wider than the viewport but sit inside a
 * legitimate `overflow-x-auto` container (a data table, the Upcoming
 * Timeline) are listed separately for context — that's by design, not a
 * bug, and does NOT fail the check. Only a scrolling *page* fails.
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
  const docWidth = document.documentElement.scrollWidth;

  function scrollsInsideContainer(el) {
    let node = el.parentElement;
    while (node) {
      const style = getComputedStyle(node);
      if ((style.overflowX === "auto" || style.overflowX === "scroll") && node.scrollWidth > node.clientWidth) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  const containedWide = [];
  const uncontainedWide = [];
  document.querySelectorAll("body *").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right > viewportWidth + 1) {
      const entry = { tag: el.tagName, cls: el.className.toString().slice(0, 60), right: Math.round(r.right) };
      (scrollsInsideContainer(el) ? containedWide : uncontainedWide).push(entry);
    }
  });

  return {
    docWidth,
    viewportWidth,
    pageScrollsHorizontally: docWidth > viewportWidth + 1,
    uncontainedWide: uncontainedWide.slice(0, 15),
    containedWideCount: containedWide.length,
  };
});

console.log(JSON.stringify(result, null, 2));
if (result.pageScrollsHorizontally) {
  console.log(
    `\nFAIL: page scrolls horizontally (${result.docWidth}px doc vs ${result.viewportWidth}px viewport). ` +
      `Check for a flex/grid child with an intrinsic min-width not wrapped in its own overflow-x-auto.`,
  );
} else if (result.uncontainedWide.length > 0) {
  console.log(
    `\nWARN: ${result.uncontainedWide.length} element(s) wider than the viewport and NOT inside a scroll container — check these.`,
  );
} else {
  console.log("\nOK: no page-level horizontal overflow.");
}
await browser.close();
process.exit(result.pageScrollsHorizontally || result.uncontainedWide.length > 0 ? 1 : 0);
