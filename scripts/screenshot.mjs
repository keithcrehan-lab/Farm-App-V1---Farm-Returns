import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:3100/dashboard";
const outDir = process.argv[3] ?? "/tmp/screenshots";
mkdirSync(outDir, { recursive: true });

const viewports = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});

for (const [name, viewport] of Object.entries(viewports)) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  await page.close();
  console.log(`Saved ${outDir}/${name}.png`);
}

await browser.close();
