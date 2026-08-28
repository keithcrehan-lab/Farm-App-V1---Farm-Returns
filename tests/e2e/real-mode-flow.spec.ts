import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Playwright's test-runner process doesn't load `.env.local` the way
 * Next.js's own dev/build process does (that's a Next.js-specific
 * convention, not a Node/Playwright default) — read it directly rather
 * than requiring a `dotenv` dependency just for this one check.
 */
function readEnvLocal(): Record<string, string> {
  const path = join(process.cwd(), ".env.local");
  if (!existsSync(path)) return {};
  const result: Record<string, string> = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) result[match[1]] = match[2];
  }
  return result;
}

/**
 * Real Mode Completion Phase 29 — real-mode end-to-end coverage.
 *
 * Sign up -> create farm -> basic livestock capture -> enter app -> map/
 * add field -> add soil -> inspect nutrients -> add housing -> inspect
 * inputs -> inspect finance -> inspect reports -> sign out -> sign in ->
 * confirm persistence -> edit an input -> confirm dependent output
 * updates. Does not use the demo/sample farm to satisfy this — every step
 * creates and reads back real data for a freshly-created test account.
 *
 * **Requires a real, configured Supabase project** (`NEXT_PUBLIC_SUPABASE_URL`/
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`) with email confirmation
 * disabled (so sign-up returns an immediately-usable session — this
 * project's dev setup already has this, per the brief's own "Email
 * confirmation has deliberately been disabled for V1 development"). If
 * those aren't set, every test in this file is skipped with a clear
 * reason rather than failing or being silently omitted — the documented
 * blocker the brief's Phase 29 asks for when real credentials aren't
 * available, not a fabricated pass.
 *
 * Each run creates one real throwaway account
 * (`e2e-<timestamp>@farmreturn-e2e-test.invalid` — an address on the
 * IANA-reserved `.invalid` TLD, guaranteed never to receive real mail)
 * and one real farm in whichever Supabase project `.env.local` points at.
 * Nothing here deletes it afterward — Supabase has no client-side
 * "delete my own account" API to call from a browser session, only an
 * admin-key server-side one this test intentionally never touches (a
 * service-role/secret key must never appear in a browser-driven test).
 * Periodically clean up `e2e-*@farmreturn-e2e-test.invalid` accounts from
 * the Supabase dashboard if this suite has been run repeatedly.
 */

const env = { ...readEnvLocal(), ...process.env };
const SUPABASE_CONFIGURED = Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

test.describe("Real Farm end-to-end flow", () => {
  test.skip(!SUPABASE_CONFIGURED, "No Supabase project configured (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY) — see this file's header comment.");

  const runId = Date.now();
  const email = `e2e-${runId}@farmreturn-e2e-test.invalid`;
  const password = "TestPassword123!";
  const farmName = `E2E Test Farm ${runId}`;
  const ownerName = "E2E Tester";
  const fieldName = `E2E Field ${runId}`;

  test("sign up, onboard, map a field, add soil/livestock/housing, inspect every module, sign out/in, edit and see it propagate", async ({ page }) => {
    // ---- Sign up (real account, real session — email confirmation is
    // disabled on this dev project) ----
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByRole("button", { name: /create account/i }).click();

    // Either lands straight on /onboarding (confirmation disabled), or
    // shows the "check your email" info state (confirmation enabled on
    // whatever project this points at) — the test only proceeds on the
    // former, matching this dev project's documented configuration.
    await page.waitForURL("**/onboarding", { timeout: 15_000 });

    // ---- Onboarding: Farm step ----
    // (getByRole("heading", ...), not getByText — Next.js's route
    // announcer div duplicates the heading text for screen readers,
    // which getByText would ambiguously match too)
    await expect(page.getByRole("heading", { name: "Let's set up your farm" })).toBeVisible();
    await page.getByPlaceholder(/ballybeg farm/i).fill(farmName);
    const ownerInput = page.locator("input").nth(1);
    await ownerInput.fill(ownerName);
    await page.getByRole("button", { name: /continue/i }).click();

    // ---- Onboarding: Livestock step (real, broad capture) ----
    await expect(page.getByRole("heading", { name: "Your livestock, broadly" })).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder(/suckler cows/i).fill("E2E Suckler Cows");
    await page.getByRole("spinbutton").fill("20");
    await page.getByRole("button", { name: /add group/i }).click();
    await expect(page.getByText("E2E Suckler Cows")).toBeVisible();

    // ---- Enter Farm Return ----
    await page.getByRole("button", { name: /enter farm return/i }).click();
    await page.waitForURL("**/dashboard", { timeout: 10_000 });
    await expect(page.getByText(farmName)).toBeVisible();

    // Dashboard's real setup-progress panel should point at Fields next —
    // a real, computed next-action, not a hardcoded string (BUILD_LOG.md
    // Phase 6).
    await expect(page.getByText(/map your first field/i)).toBeVisible();

    // ---- Fields: add a real field ----
    await page.goto("/fields");
    await page.getByRole("button", { name: /add field/i }).first().click();
    await page.getByPlaceholder(/bog field/i).fill(fieldName);
    await page.locator('input[type="number"]').first().fill("5.2");
    await page.getByRole("button", { name: /^add field$/i }).click();
    await expect(page.getByText(fieldName)).toBeVisible({ timeout: 10_000 });

    // ---- Soil: add a real lab test for that field ----
    await page.goto("/soil");
    const addSoilTestButton = page.getByRole("button", { name: /add soil test/i }).first();
    await addSoilTestButton.click();
    await page.locator('input[type="date"]').first().fill("2026-05-01");
    await page.getByPlaceholder(/southern agri labs/i).fill("E2E Test Lab");
    await page.getByPlaceholder(/sal-2026-0113/i).fill(`E2E-${runId}`);
    const numberInputs = page.locator('form input[type="number"]');
    await numberInputs.nth(0).fill("6.5"); // pH
    await numberInputs.nth(1).fill("6"); // P
    await numberInputs.nth(2).fill("100"); // K
    await page.getByRole("button", { name: /save test result/i }).click();
    await expect(page.getByText(/verified test on/i)).toBeVisible({ timeout: 10_000 });

    // ---- Nutrients: real plan should now exist for that field ----
    await page.goto("/nutrients");
    await expect(page.getByText(fieldName)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Nutrient requirement", { exact: true })).toBeVisible();

    // ---- Housing: add a real shed ----
    await page.goto("/housing");
    await page.getByPlaceholder(/shed 1/i).fill("E2E Shed");
    await page.locator('input[type="date"]').nth(0).fill("2026-11-01");
    await page.locator('input[type="date"]').nth(1).fill("2027-03-01");
    await page.locator('input[type="number"]').first().fill("500");
    await page.getByRole("button", { name: /^add shed$/i }).click();
    await expect(page.getByText("E2E Shed")).toBeVisible({ timeout: 10_000 });

    // ---- Input Planner: should render without crashing for this real, minimal farm ----
    await page.goto("/input-planner");
    await expect(page.getByRole("heading", { name: "Input Planner" }).first()).toBeVisible();

    // ---- Finance: should render without crashing ----
    await page.goto("/finance");
    await expect(page.getByRole("heading", { name: "Finance" }).first()).toBeVisible();

    // ---- Reports: should render without crashing ----
    await page.goto("/reports");
    await expect(page.locator("body")).not.toContainText("Application error");

    // ---- Sign out ----
    await page.goto("/settings");
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL("**/sign-in", { timeout: 10_000 });

    // ---- Sign back in — confirm the same real farm/field persisted ----
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL("**/dashboard", { timeout: 10_000 });
    await expect(page.getByText(farmName)).toBeVisible();

    await page.goto("/fields");
    await expect(page.getByText(fieldName)).toBeVisible({ timeout: 10_000 });

    // ---- Edit an underlying input — confirm the dependent output updates ----
    await page.getByText(fieldName).click();
    const editButton = page.getByRole("button", { name: /edit field name, use or archive/i });
    await editButton.click();
    const nameInput = page.locator("input").first();
    const renamedField = `${fieldName} (renamed)`;
    await nameInput.fill(renamedField);
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText(renamedField)).toBeVisible({ timeout: 10_000 });

    // The rename must propagate into Nutrients' field selector too — the
    // same real farm-store record, not a second copy.
    await page.goto("/nutrients");
    await expect(page.getByText(renamedField)).toBeVisible({ timeout: 10_000 });
  });
});
