import { defineConfig } from "@playwright/test";

/**
 * Real Mode Completion Phase 29 — standalone config for
 * `tests/e2e/real-mode-flow.spec.ts`, separate from `playwright.config.ts`
 * (the visual-regression suite). No `webServer` block: this suite runs
 * against whatever `npm run dev` instance is already up (this Next.js
 * version refuses a second `next dev` in the same project directory even
 * on a different port), rather than the visual suite's own port-3100
 * auto-started server. Point `baseURL` at that dev server.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "real-mode-flow.spec.ts",
  fullyParallel: false,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 900 } } }],
});
