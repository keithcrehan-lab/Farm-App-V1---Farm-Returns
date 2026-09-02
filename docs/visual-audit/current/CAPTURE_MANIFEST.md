# Farm Return Next — current visual state capture

Read-only visual capture checkpoint, per the explicit instruction that
this is **not** a redesign phase. Nothing in the product UI, layout,
styling, navigation, domain logic, database schema, or application
behaviour was altered to make any screenshot look better. This records
exactly what is currently built, for an independent Codex visual audit
against the approved Farm Return Next v1.1 visual brief
(`docs/product/farm-return-next-v1.1/FARM_RETURN_NEXT_SPEC_v1_1.md`,
reference images under `docs/product/farm-return-next-v1.1/media/`).

## Capture metadata

- **Branch:** `farm-return-next`
- **HEAD SHA at capture time:** `85a476d`
- **Capture date:** 2026-09-02 (session date). The browser's own clock
  was fixed to `2026-09-03T14:00:00` for every capture (matching
  `tests/e2e/visual.spec.ts`'s own established `FIXED_CLOCK_ISO`
  precedent, so date-dependent Prompt text like "As of ..." and the
  greeting header's "Good afternoon" are deterministic and reproducible
  — this is why several screenshots show "2026-09-03" in their own body
  text, not an error).
- **Browser/tool used:** Playwright 1.62.1, Chromium (the same engine
  `playwright.config.ts`/`scripts/screenshot.mjs` already use in this
  repo), driven by small ad-hoc Node scripts written for this capture
  only. Those scripts were **not** committed and were deleted
  immediately after use (`rm capture-step*.mjs`) — this repo's own
  reusable tools (`scripts/screenshot.mjs`, `tests/e2e/visual.spec.ts`)
  are single-URL / CI-oriented respectively and don't already provide a
  "walk every v1.1 screen, plus its overlays, into one manifest-tracked
  output directory" flow, so a temporary harness was genuinely needed
  per the task's own instruction — none of it is a new permanent
  repository tool.
- **Canonical viewport already established in this repo:**
  `playwright.config.ts`'s own `mobile` (390×844) and `desktop`
  (1440×900) projects — this capture uses the identical values, not a
  new convention.
- **Whether any application files were changed:** **No.** `.env.local`
  (already gitignored, never tracked) was temporarily moved aside for
  the duration of the capture only, then restored **byte-for-byte**
  (diffed against a backup copy to confirm) immediately afterward. This
  was necessary to reach the app's own already-documented "fail open to
  mock/local behaviour" fallback (`src/lib/supabase/env.ts`'s own header
  comment: "no Supabase project exists... Fail open to mock/local
  behaviour rather than locking every route behind a sign-in screen that
  can never succeed") — with real Supabase credentials present,
  `src/proxy.ts` correctly redirects every route to `/sign-in` for an
  unauthenticated request, which this session has no real farmer
  credentials to satisfy (see "State selection" below for why creating
  a new one was not attempted). No source file, test file, migration, or
  config file was edited. `.next`'s build cache was cleared as routine
  cleanup (untracked, gitignored, rebuilt automatically on next `npm run
  dev`/`build`).

## State selection

Every screenshot uses this repository's own real, existing **mock/demo
farm state** — `src/store/farm-store.tsx`'s own `FarmProvider` default
(`remote={false}`), seeded from `@/data/mock-farm` and explicitly
documented in this codebase as demo data, never a real farmer's. This
is the same mock state this repo's own component test suites already
exercise, and the only farm state reachable without real signed-in
Farm Return V1 Dev credentials (which this session was not given and
must not fabricate or guess — see the "BLOCKED_CAPTURE" entries below
for exactly what that blocks).

**No scientific recommendation, price, quantity, GPS trace, livestock
record, satellite value, Actual, weather reading, or regulatory result
was invented for this capture.** Every number/label visible in these
screenshots is either this repo's own pre-existing mock/demo fixture
data (`@/data/mock-farm`), or a real, currently-running domain
calculation applied to that fixture data (e.g. the "Calendar open —
Home Field" Prompt is `spreading_window_gate_v2.0.0`'s own real output
against the mock farm's real county/field/date inputs, not a canned
string).

## Screens captured

| # | Screen | Route | File(s) | Viewport | Status | Data source | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Today / living farm world | `/today` | `01-today-mobile.png`, `01-today-desktop.png` | 390×844, 1440×900 | CAPTURED | mock/demo fixture (`@/data/mock-farm`) | Real `spreading_window`/`soil_test_age` Prompts computed live against mock data. |
| 2 | Farm / farm-world overview | `/fields` | `02-farm-mobile.png`, `02-farm-desktop.png` | 390×844, 1440×900 | CAPTURED | mock/demo fixture | "Farm" nav points at V1's existing `/fields` map/list screen — the documented honest interim for canonical screen #2 (`nav-items.ts`'s own comment; full tabbed Farm/Field exploration is not yet built, `IMPLEMENTATION_MATRIX.md` row 3). |
| 3 | Field detail / field exploration | `/fields` (same route, scrolled to the selected field's own detail panel) | `03-field-detail-mobile.png` | 390×844 (viewport, not full-page) | CAPTURED | mock/demo fixture | This is V1's pre-existing inline field-detail panel (Overview/Soil tabs, Compliance Evidence), not a separate v1.1-designed field-exploration screen — no dedicated route for that exists yet (`IMPLEMENTATION_MATRIX.md` row 3: "genuinely NOT_STARTED beyond this interim routing"). |
| 4 | Expanded Prompt / Why this matters | `/today` → "View details" overlay | `04-expanded-prompt-mobile.png` | 390×844 (full page incl. background) | CAPTURED | mock/demo fixture | Real "Evidence checked" box (calculation version, county, zone, material, rule) exactly as computed; real `Pill` evidence-tier badge ("Calculated"). |
| 5 | Plan | `/plan` | `05-plan-mobile.png`, `05-plan-desktop.png` | 390×844, 1440×900 | CAPTURED | mock/demo fixture | "No jobs scheduled yet" is a real, honest empty state (`IMPLEMENTATION_MATRIX.md` row 5), not a broken render. |
| 6 | Records | `/records` | `06-records-mobile.png`, `06-records-desktop.png` | 390×844, 1440×900 | CAPTURED (empty state) | mock/demo fixture | Genuinely empty ("No activity yet") — mock mode has no writer wired for decisions/jobs (`canRecord={isRealMode}` in `today/page.tsx`/`plan/page.tsx` is `false` in mock mode), so Records can never gain real history without a real Farm Return V1 Dev session. See item 12/17 below for what this blocks. |
| 7 | Contextual Ask AI overlay | `/today` → "Ask AI" | `07-ask-ai-mobile.png` | 390×844 (full page incl. background) | CAPTURED | mock/demo fixture | Shows the real Phase C provenance-tier tag ("Calculated") next to the Leading Prompt fact — the actual context object Ask AI would receive, verbatim, per this screen's own "fail closed, never invented" design. |
| 8 | Start Job state | `/today` → "View details" → "Start job" button visible | `04-expanded-prompt-mobile.png` (same capture as item 4 — the button is part of that sheet) | 390×844 | CAPTURED | mock/demo fixture | See also `08b-start-job-demo-mode-mobile.png` below (bonus, not in the required list) — clicking "Start job" in mock mode triggers no network call at all; it shows the real, already-coded "Demo mode — this can't start a real job here." message (`ExpandedPromptSheet.tsx`'s own `startJob` guard), which is itself real, current, non-fabricated behaviour, captured for completeness. |
| 9 | Active GPS Job Mode | `/job/[id]` | `08-active-job-mobile.png` | 390×844 | CAPTURED (demo-mode fallback only) | N/A — no real job session | **This is not the full intended Active-Tracking UI.** `src/app/(app)/job/[id]/page.tsx` renders `demoMode` whenever Supabase isn't configured (true for this capture) or no real signed-in farm exists — the actual page in that state renders only "Demo mode — Job Sessions aren't available here." The rich tracking UI (elapsed time, Pause/Finish, GPS status) only renders for a real, currently-active `job_sessions` row under a real authenticated farmer — see BLOCKED_CAPTURE note below. |
| 10 | Completed-estimated / Finish Job state | `/job/[id]` | — | — | **BLOCKED_CAPTURE** | — | Same root cause as item 9: only reachable via a real `job_sessions` row with `status: "completed_estimated"` under a real authenticated Farm Return V1 Dev session. This session has no real farmer login credentials and must not fabricate a session row or guess/reset a real account's password to reach one. |
| 11 | Confirm Actual | `/job/[id]` (`ConfirmActualSheet`, rendered by `ActiveJobSessionView` for a `completed_estimated` session) | — | — | **BLOCKED_CAPTURE** | — | Identical blocker to item 10 — this sheet only renders inside a real, non-demo-mode active job session. |
| 12 | Resulting confirmed Record | `/records` (a `JobHistoryCard`/`DecisionHistoryCard` entry) | — | — | **BLOCKED_CAPTURE** | — | Records is genuinely empty in mock mode (see item 6) — there is no code path in mock mode that ever writes a real `decisions`/`jobs` row, so no confirmed Record can exist to capture without a real Dev session. |
| 13 | Livestock world | `/livestock` | `13-livestock-mobile.png` | 390×844 | CAPTURED | mock/demo fixture | V1's pre-existing Livestock overview (Overview/Groups/Housing tabs) — real, unchanged this programme. No "Ask AI" affordance on this screen (a real, current, observed fact — not fixed, per this task's own visual-integrity rule). |
| 14 | Breeding & Births | — | — | — | **NOT_IMPLEMENTED** | — | Confirmed via `nav-items.ts` (no nav entry) and `IMPLEMENTATION_MATRIX.md` row 8 ("NOT_STARTED... no Next-specific species-aware Breeding & Births engine exists"). |
| 15 | Satellite / Vegetation Intelligence | — | — | — | **NOT_IMPLEMENTED** | — | `IMPLEMENTATION_MATRIX.md` row 9: backend scene-discovery exists (`src/domain/satellite-field-coverage.ts`) but "still no UI." No route/nav entry exists to capture. |
| 16 | Gate / Constraint presentation | — | — | — | **NOT_IMPLEMENTED (as a live screen)** | — | `GateConstraintCard.tsx` is a real, shipped, tested component, but per `IMPLEMENTATION_MATRIX.md` row 10 it is "not wired to a live screen" — no route renders it with real props, so there is nothing reachable in a real browser to screenshot without constructing an artificial harness around an unwired component, which this task's own instructions forbid ("do not build a missing screen just to satisfy this list"). |
| 17 | Evidence / "Why this number?" presentation | `/today` → "View details"; `/today` → "Ask AI" | `04-expanded-prompt-mobile.png`, `07-ask-ai-mobile.png` | 390×844 | CAPTURED (Prompt-stage only) | mock/demo fixture | The Decide-stage/Records-stage half of this (Phase D's own `DecisionHistoryCard`/`JobHistoryCard` evidence-tier + calculation-version + inputs-snapshot rendering, closed 2026-09-03) is **BLOCKED_CAPTURE** for the identical reason as items 6/12 — Records has no real decision history to render in mock mode. |
| 18 | Input Planning | `/input-planner` | `18-input-planner-mobile.png` | 390×844 | CAPTURED | mock/demo fixture, explicitly labelled "Sample data"/"(example)" on-screen | This is **V1's pre-existing** Input Planner (bulk-buying/forecast-spend tool), not the v1.1-spec "Input Planning" canonical screen concept — `IMPLEMENTATION_MATRIX.md` row 13 records the v1.1 concept itself as `NOT_STARTED`. Captured and labelled as the V1 feature for completeness, not conflated with the v1.1 concept. |
| 19 | Feed & Finish | `/feed-optimiser` | `19-feed-finish-mobile.png` (default group, unsupported state), `19b-feed-finish-supported-group-mobile.png` (bonus — Continental Steers, a supported group) | 390×844 | CAPTURED | mock/demo fixture | This is **V1's pre-existing** Feed Optimiser, unrelated to the v1.1-spec Feed & Finish engine (`IMPLEMENTATION_MATRIX.md` row 15: v1.1 concept is `NOT_STARTED`). The default-selected group ("Suckler Cows") is a real, honest "not supported for this feeding model" state, not a bug — the second capture shows a supported group's real output. |
| 20 | Financial Intelligence | `/finance` | `20-financial-mobile.png` | 390×844 | CAPTURED | mock/demo fixture, explicitly labelled "Sample data"/"Estimated" on-screen | This is **V1's pre-existing** Finance page, not the v1.1-spec Financial Intelligence concept (`IMPLEMENTATION_MATRIX.md` row 16: v1.1 concept is `NOT_STARTED`, "V1 Finance page pre-existing, unchanged"). Captured and labelled as the V1 feature for completeness. |
| 21 | Request Quote | — | — | — | **NOT_IMPLEMENTED** | — | `IMPLEMENTATION_MATRIX.md` row 18: "No Request-Quote-from-calculated-need workflow." A `supplier-quotes` schema/table exists as a separate, pre-existing, unrelated V1 feature — no route/nav entry for the v1.1 Request Quote workflow itself. |

## Screens captured beyond the required list (bonus, for context)

- `08b-start-job-demo-mode-mobile.png` — the real "Demo mode — this
  can't start a real job here." message shown after clicking "Start
  job" (see item 8's own note).
- `19b-feed-finish-supported-group-mobile.png` — the Feed Optimiser with
  a genuinely supported livestock group selected, since the
  default-selected group's own honest "unsupported" state (item 19's
  primary capture) doesn't show the tool's real working output.

## Visual-integrity observations (recorded, not fixed)

Per the task's own explicit instruction, nothing below was corrected —
these are handed to the independent audit as-is:

- **Livestock world (`/livestock`) has no "Ask AI" affordance.** Every
  v1.1-cutover screen (Today/Farm/Plan/Records, plus the Job flow) has
  one; this pre-existing V1 screen does not.
- **`/input-planner`, `/finance`, `/feed-optimiser` also have no "Ask
  AI" affordance** — same V1-vs-v1.1 boundary as above.
- **"Farm" in the primary nav is V1's existing `/fields` map/list
  screen**, not a purpose-built v1.1 Farm/Field-exploration screen with
  Now/Soil/Activity/Constraints tabs — this is a documented, deliberate
  interim (`nav-items.ts`'s own comment), not a regression, but it is a
  real, current gap against the v1.1 visual brief worth the independent
  audit seeing directly.
- **Records is empty in every real, reachable mock-mode state** — the
  screen's own layout/typography is real and complete, but its actual
  populated appearance (with real evidence-tier Pills, calculation
  versions, and inputs-snapshot summaries — Phase D's own 2026-09-03
  work) could not be captured at all this session; see the
  BLOCKED_CAPTURE entries above.

## Validation

- Every listed `CAPTURED` file exists in `docs/visual-audit/current/`
  and is a valid, non-empty PNG (confirmed via `file`/`ls -la` on all 18
  files — sizes range 12.8 KB–474 KB, dimensions match the requested
  viewports or a real full-page height multiple of them).
- `git status --porcelain` after capture and cleanup shows only the new
  `docs/visual-audit/` directory as untracked — no existing tracked file
  changed.
- `.env.local` was diffed byte-for-byte against a pre-capture backup
  after being restored and found identical.
- No temporary capture script remains in the repository.
