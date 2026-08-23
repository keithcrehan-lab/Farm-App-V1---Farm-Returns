import { defineConfig } from "@playwright/test";

/**
 * Visual regression suite — CLAUDE.md § Screen workflow / product-requirements.md
 * "Testing: Vitest/unit tests for domain logic + Playwright E2E and visual
 * regression."
 *
 * This locks in the *current, already-reviewed* render of every screen as
 * the accepted baseline (tests/e2e/*-snapshots/), so a future change that
 * silently breaks an approved screen fails CI instead of shipping. It is
 * not a substitute for the manual reference-pack comparison in
 * design/reference/ — that comparison already happened screen-by-screen
 * while building each one; this suite protects that approved state going
 * forward.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 30_000,
  expect: {
    // Tight on purpose: verified 0.01 (1%) silently passed a changed page
    // title on a full desktop screenshot (the changed text was well under
    // 1% of total pixels). maxDiffPixels is an absolute count, so it stays
    // sensitive regardless of a screen's total size — a same-machine,
    // same-browser re-render of unchanged content diffs at exactly 0px, so
    // this is still generous headroom for anti-aliasing jitter, not a
    // loophole for real regressions.
    toHaveScreenshot: { maxDiffPixels: 50 },
  },
  use: {
    baseURL: "http://localhost:3100",
    launchOptions: {
      executablePath: "/opt/pw-browsers/chromium",
    },
  },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 } },
    },
  ],
});
