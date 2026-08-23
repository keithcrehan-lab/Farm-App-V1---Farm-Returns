import { test, expect } from "@playwright/test";

/**
 * One entry per screen in CLAUDE.md's Phase 1 build order. `path` is the
 * route to visit; `name` is the snapshot file stem. Add a new screen here
 * the same day it's built, not as an afterthought.
 */
const SCREENS: { name: string; path: string }[] = [
  { name: "dashboard", path: "/dashboard" },
  { name: "fields", path: "/fields" },
  { name: "soil", path: "/soil" },
  { name: "livestock", path: "/livestock" },
  { name: "livestock-economics", path: "/livestock/lg-continental-steers" },
  { name: "housing", path: "/housing" },
  { name: "silage", path: "/silage" },
  { name: "nutrients", path: "/nutrients" },
  { name: "spreading", path: "/spreading" },
  { name: "finance", path: "/finance" },
  { name: "feed-optimiser", path: "/feed-optimiser" },
  { name: "input-planner", path: "/input-planner" },
  { name: "market-prices", path: "/market-prices" },
  { name: "reports", path: "/reports" },
  { name: "settings", path: "/settings" },
];

// Fixed clock, installed before any page script runs: MobileGreetingHeader's
// "Good morning/afternoon/evening" text reads `new Date().getHours()`, so
// without this the same unchanged screen fails the diff whenever the suite
// happens to run in a different hour band than the baseline was captured in
// (caught in practice: dashboard-mobile failed on an otherwise clean run,
// the only diff being that greeting line). Afternoon, to match the hour the
// approved baselines were originally reviewed at.
const FIXED_CLOCK_ISO = "2026-08-23T14:00:00";

for (const screen of SCREENS) {
  test(`${screen.name} matches its approved render`, async ({ page }) => {
    await page.clock.install({ time: new Date(FIXED_CLOCK_ISO) });
    await page.goto(screen.path);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot(`${screen.name}.png`, { fullPage: true });
  });
}
