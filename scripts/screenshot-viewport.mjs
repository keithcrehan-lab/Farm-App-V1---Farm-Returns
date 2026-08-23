import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:3100/dashboard";
const outDir = process.argv[3] ?? "/tmp/screenshots";
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.screenshot({ path: `${outDir}/mobile-viewport-top.png` });
await page.mouse.wheel(0, 900);
await page.waitForTimeout(200);
await page.screenshot({ path: `${outDir}/mobile-viewport-scrolled.png` });
await browser.close();
console.log("done");
