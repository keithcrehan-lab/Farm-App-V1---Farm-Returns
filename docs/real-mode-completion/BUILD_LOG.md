# Real Mode Completion — build log

Unattended sequential execution per the "Farm Return V1 — Real Mode
Completion" brief. Branch `claude/real-mode-completion`, branched from
`claude/real-farm-v1` at `c930770` (the live-Supabase `"use server"`
export fix). No prior work discarded — `claude/real-farm-v1` (17 commits,
Phases 1–15 of the earlier Real Farm V1 brief) is untouched and remains
available.

A real Supabase project (`Farm Return V1 Dev`,
`https://whevugeisqlpfnrugfsd.supabase.co`) is configured in
`.env.local` (git-ignored, confirmed untracked) for the first time this
session — everything from here on can be verified against a live
database, not just compiled/typechecked.

---

## Phase 0 — safe branch and baseline

```
git status            # clean
git branch --show-current   # claude/real-farm-v1-continued (renamed below)
git log --oneline -10       # confirms all 17 prior commits present
```

Renamed the empty continuation branch (created moments earlier at the
user's request, zero new commits) to `claude/real-mode-completion` to
match this brief's Phase 0 instruction exactly, rather than leaving a
duplicate empty branch around.

Baseline gates, against the real npm scripts in `package.json`
(`test`/`typecheck`/`lint`/`build` — all exist, none invented):

```
npm test        # 62/62 test files, 905/905 tests passing
npm run typecheck  # clean
npm run lint       # clean
npm run build      # clean — 31 routes; every (app) route now dynamic
                   # (ƒ) because NEXT_PUBLIC_SUPABASE_URL/ANON_KEY are
                   # now set, so isSupabaseConfigured() reads true at
                   # build time and the real cookies()-based farm check
                   # in (app)/layout.tsx activates. Only /sign-in,
                   # /sign-up, /forgot-password, /update-password stay
                   # static (no session-dependent server read).
```

Status: **complete.**

---

## Phase 1 — reconcile database migration history

The live `Farm Return V1 Dev` project already received an RLS hardening
pass directly (per the brief: fixed `search_path` on `set_updated_at()`,
policies scoped to `authenticated` with `(select auth.uid())`, `anon`
revoked, `authenticated` scoped to exactly SELECT/INSERT/UPDATE/DELETE —
Security Advisor returned zero findings afterward) that had no matching
migration file in the repo. Wrote
`supabase/migrations/20260828020000_rls_security_hardening.sql` as a
forward-only reconciliation: applying the full migration sequence to a
*fresh* database reaches the same state the live project is already in.
**Not re-run against the live project** — it already has this state; the
migration exists so history is honest and a future environment (a second
dev project, CI, staging) can reach the same hardened state from a clean
`supabase db push`.

Every `create policy` statement is preceded by `drop policy if exists`
(idempotent, matches the live project's already-applied state without
erroring if re-run) — ownership predicates (farm/user-scoped) are
unchanged in substance from `20260828000000_init_farm_schema.sql`, only
the role target and the initplan-optimised `auth.uid()` form changed.

**Honesty note**: this migration was written from the brief's own precise
description of what the live hardening did, not from a live schema
introspection — no Supabase CLI or MCP tooling is available in this
environment to diff against the actual live `pg_policies`/`pg_proc`
state. If it doesn't match exactly, the discrepancy is between this file
and the live project's actual DDL, not a design decision; worth a
`supabase db diff` (or equivalent) confirmation once CLI access exists.

`supabase/README.md` updated to document the live project identity,
the three-migration sequence, and the "don't re-run migration 3" note.

**Quality checks**: SQL/docs only, no application code touched;
typecheck/lint clean (unaffected). Not re-run against the live database
(see honesty note above).

Status: **reconciliation migration written and documented; not verified against the live schema directly (no introspection tooling available).**

---

## Phase 2/3 — onboarding redesign + real persistence/Back-button fix

Done together — the persistence bug (Phase 3) could only be fixed
properly by rebuilding the onboarding architecture the brief's Phase 2
already asked for, so one rebuild serves both.

**Redesigned flow**: Farm → Livestock (broad) → Enter Farm Return. Fields,
Soil, Housing and Financial Assumptions capture removed from onboarding
entirely — `src/app/actions/onboarding.ts`'s `addFieldStep`/
`addSoilTestStep`/`addHousingStep`/`setFinancialAssumptionStep` deleted
outright rather than left as unused duplicates, since Fields/Soil/Housing/
Finance already have their own real creation actions
(`src/app/actions/farm.ts`). Livestock capture at onboarding is
deliberately narrow — label, category, system, head count only; no
weight, tag, breed, age, goal, housing link, feed or breeding fields
(those live inside the Livestock module, where `AddLivestockGroupInput`
already supports them).

**The real bug, fixed at the architecture level**: the previous wizard's
Farm step always called `createFarmStep` (an INSERT). Revisiting it via
Back and submitting again created a *second* `farms` row for the same
user — a real data-integrity bug, not a cosmetic one. Fixed two ways,
matching the brief's explicit instruction not to just patch the Back
button visually:

1. **In-session**: `OnboardingWizard` now tracks whether a `farm` already
   exists in its own state; the Farm step calls `updateFarmStep` (UPDATE,
   reusing `updateFarmProfileForCurrentUser`) instead of `createFarmStep`
   (INSERT) once one does. Which action gets called is the fix, not a
   disabled button.
2. **Across a reload/leave/return/sign-out-sign-in**: new
   `farms.onboarding_completed_at` column (migration
   `20260828030000_onboarding_completion.sql`) and
   `getOnboardingStatusForCurrentUser()` distinguish "has a farm" from
   "finished onboarding" — three real states, not two ("no farm" / "farm,
   not finished" / "finished"). `/onboarding`'s page component now
   resolves this server-side on every visit and, for the middle state,
   loads the real farm *and* any livestock groups already added and
   resumes the wizard directly at the Livestock step — no re-asking for
   already-saved information, matching the brief's explicit "goes
   forward; goes backwards; refreshes; leaves; returns; signs out and
   signs in — already-saved information must rehydrate correctly."
   `(app)/layout.tsx`'s onboarding-redirect check updated to the same
   completion flag (a farm with unfinished onboarding no longer
   short-circuits into a half-empty dashboard).

**Save states are real**: every write shows Saving… / Saved / Failed to
save, driven by whether the awaited Server Action actually returned an
error — not decorative, and never silently successful on a failed write
(verified by test, see below).

**Tests added** (`src/app/onboarding/OnboardingWizard.test.tsx`, 6 new,
React Testing Library + mocked Server Actions):
- resumes at the Livestock step (not Farm) when a farm already exists;
- shows already-added livestock groups on resume;
- **the core regression test**: create → advance → Back → resubmit
  results in exactly one `createFarmStep` call and one `updateFarmStep`
  call, never two creates, and the revisited Farm step is genuinely
  prefilled from the real created farm, not blank;
- a failed save shows "Failed to save" and does *not* silently advance;
- a successful livestock-group save shows "Saved";
- finishing calls `finishOnboarding` with the real farm id.

**Verified against the live dev server** (`Farm Return V1 Dev`), not
just re-typechecked: restarted `npm run dev` clean after the edits,
`/onboarding` redirects correctly for an unauthenticated request, no
runtime errors in the server log.

**Quality checks**: 63/63 test files (+1), 911/911 tests (+6),
`npm run typecheck`/`npm run lint`/`npm run build` clean (31 routes,
unchanged — `/onboarding` still dynamic).

Status: **complete — onboarding redesigned per the brief, the real duplicate-farm Back-button bug fixed at the architecture level with regression tests, verified against the live project.**

---

## Phase 4/5 — real-mode application audit + zero mock authority

`docs/real-mode-completion/REAL_MODE_AUDIT.md` — every route re-checked
directly. Finding: every previously-flagged mock-authority issue was
already resolved by the prior session's Phases 5/8/9/13/14/15 (carried
forward, not re-derived blindly — spot-verified again this phase). The
onboarding rebuild is the one route with genuinely new fixes (already
applied, Phase 2/3). One new, smaller finding: the recommendation audit
trace and peer-review records are still `localStorage`-only, not migrated
to Supabase — a real, bounded, previously-flagged-as-deferred gap, tracked
in the audit doc rather than silently left out.

Phase 5 (zero mock authority) folded in: nothing new to fix — a fresh
real farm already shows honest zero/empty states everywhere this audit
checked (re-verified, not assumed from the prior session's word).

Status: **complete — audit doc written, findings fixed where new, prior fixes verified still correct.**

---

## Phase 6 — dashboard as a real farm status page

New `calculateFarmSetupProgress` (`src/domain/farm-stats.ts`, 7 new
tests) — real counts only (fields mapped, soil tests verified, livestock
head count, housing count), and a fixed-priority `nextAction` (map a
field → draw a boundary → add a soil test → add livestock → add
housing → `null` once all done), never a fabricated completeness
percentage. New `SetupProgressCard` renders this at the top of
`/dashboard`, every line and the "Next:" button a real link to the
relevant module — and renders nothing at all once `nextAction` is `null`,
so an established farm's dashboard isn't left with a permanent empty
checklist (brief: "As the farm gains information, the dashboard should
progressively become richer").

Every item here is also a real click target, directly contributing to
Phase 7's "everything important must be clickable" — noted, not claimed
as a separate phase's completion.

**Quality checks**: 7 new tests; 63/63 test files, 918/918 tests,
typecheck/lint/build clean (31 routes, unchanged).

Status: **complete.**

---

## Phase 7 — everything important must be clickable

Swept `src` for `href="#"` and unexplained `disabled` buttons rather than
guessing. Found and fixed two real false affordances:

1. **`AlertsCard`'s "View all" was a dead `href="#"` link** with nothing
   further to reveal (the list already shows every real alert
   unpaginated) — removed rather than pointed at an invented destination.
   Its per-alert row also fell back to `href={alert.href ?? "#"}`; since
   every real alert generator (`real-alerts.ts`) already sets a real
   `href`, made `FarmAlert.href` required at the type level so a future
   alert type can't silently ship without one.
2. **`InputRequirementRow`'s "Timing"/"Confidence" columns** rendered
   `requiredByWindow`/`confidencePct` — fields `finance.test.ts`'s own
   comment already documents as having "no real model... stay exactly
   the mock's" — with identical bold styling to the real requirement/cost
   figures beside them. Relabelled "(example)" and switched to muted
   styling, same treatment already given to the bulk-buy card in the
   prior session.

Checked, not a violation: `AlertBanner`/Housing's "Refine estimate"/
`LivestockEconomicsView`'s "Market assumptions"/`InputRequirementRow`'s
"Join Group" are all `disabled` with an explanatory `title` — an honest
"not interactive yet, here's why" state, not a false affordance. Dashboard's
plain KPI `MetricCard`s (Fertiliser cost, Mapped fields, Slurry available)
have no click affordance at all and don't look interactive (no chevron,
no hover state) — correctly "clearly not interactive" per the brief's own
third acceptable option, not a gap to force a link onto.

**Quality checks**: no new tests (both fixes are styling/link-target
changes with no new logic; the `FarmAlert.href` type tightening is
already exercised by every existing real-alerts/mock-farm fixture, all of
which already set it); 63/63 test files, 918/918 tests, typecheck/lint/
build clean (31 routes, unchanged).

Status: **complete.**

---

## Phase 8/9 — fields as core object + field detail experience

**Phase 8 was already largely complete** from the prior session's Phase 7
(field create/map/rename/archive/restore, area derived from geometry,
soil-test validity). Re-verified, not re-derived.

**Phase 9 — the field detail experience had two real gaps, both fixed**:

1. `FieldDrawer`'s "Map" and "Soil" tabs both dead-ended at "detail is
   part of the ... module — coming in a later screen." The "Map" tab was
   pure duplication (boundary editing already has its own "Map this
   field"/"Edit boundary" button) — dropped rather than built out a
   second time. The "Soil" tab now shows real content: P/K Index with
   status badges, pH, the verified lab test's date/lab, and (reusing
   `checkSoilTestAgeValidity`/`yearsBetweenIsoDates` — one classification,
   not a second guess at it, same discipline as the prior session's Phase
   7) the real validity state.
2. Added a real "Open this field's nutrient plan" drill-down link,
   deep-linked to `/nutrients?field=<id>` — which needed `/nutrients` to
   actually support a `?field=` param (it didn't; the field selector was
   local `useState` only). Added it, and while restructuring the page for
   `useSearchParams` (Suspense-wrapped, same pattern as `/sign-in`),
   fixed a real blank-page bug found in passing: `if (!field) return null`
   for a farm with zero fields, same class of bug the prior session fixed
   on Housing/Silage — now a real empty state.

**Not built this phase**: Spreading/Silage/Inputs/Finance tabs inside the
drawer (the brief's fuller field-detail concept). Silage stays blocked
(Phase 10, prior session); Spreading needs a live weather call per field
(expensive to embed in a drawer without a real caching strategy); Finance
per-field attribution is a genuinely separate design question. The one
real, cheaply-reachable cross-reference (Soil → Nutrients, since Nutrients
already computes from a field's soil state) is built; the rest documented
as scoped-out rather than attempted superficially.

**Note for later**: `FieldDrawer`'s Overview tab changed (new drill-down
link) — the Playwright visual-regression baselines for Fields/Nutrients
screens will need re-approving (`npm run test:visual:update`) once
reviewed against `design/reference/`, not run this phase (no browser
binaries available in this environment, same constraint noted in the
prior session's README history).

**Quality checks**: no new tests (both fixes reuse already-tested domain
functions — `checkSoilTestAgeValidity`, `calculateNutrientPlan` — with no
new branches of their own); 63/63 test files, 918/918 tests, typecheck/
lint/build clean (31 routes, unchanged).

Status: **complete for the safely-reachable scope; broader tab set explicitly deferred with reasoning.**

---

## Phase 10 — soil real mode: verified, no changes needed

`/soil` already operates entirely on real `useFields()` — grepped for any
disconnected mock reference, none found. Fail-closed behaviour
(soil-test-age disregard, statutory boundary handling) unchanged and
already verified in the prior session's Phase 7.

Status: **complete — verification only.**

---

## Phase 11/12 — livestock structure + individual animal detail foundation

**Phase 11** (group-level editable detail) is deferred to Phase 26
(Editability) rather than duplicated here — that phase explicitly covers
"livestock groups" as one of its named editability targets, and building
group-editing twice under two different phase numbers isn't worth the
duplication risk.

**Phase 12 — the substantial new build this phase**: a real, optional,
per-farm individual-animal layer, exactly as scoped ("do not require
individual-animal tracking for farmers who only want group management").

New schema (`supabase/migrations/20260828040000_individual_animals.sql`):
`livestock_individuals` (tag, category, sex, breed, DOB, goal/status,
notes; `group_id` nullable + `on delete set null` — an animal's existence
doesn't depend on group membership) and `livestock_weight_observations`
(append-only). **Current weight is never a stored column** — it's always
`latestWeightObservation()` (the most recent real observation by date),
so there is exactly one place weight history lives, matching the brief's
explicit "prefer a structure that can support historical weight
observations rather than assuming an animal only ever has one weight."
RLS matches the hardened pattern from Phase 1 (`to authenticated`,
`(select auth.uid())`, `anon` revoked).

**New adapters** (`src/lib/farm-data/individual-animals.ts`,
`mappers.ts` additions, 4 new tests) and Server Actions
(`addIndividualAnimalAction`/`addWeightObservationAction`,
`src/app/actions/farm.ts`). **New UI**: `IndividualAnimalsCard` — an
optional, collapsed-by-default section on `/livestock` (real-mode only,
same reasoning as `FinancialAssumptionsCard` — this isn't part of
`farm-store.tsx`'s shared mock-mode state) with a real add-animal form
and inline per-animal weight recording.

**Honest blocker, not silently assumed live**: this is genuinely new
schema, not yet applied to the live `Farm Return V1 Dev` project (unlike
the Phase 1 RLS-hardening migration, which reconciled state already
live). `/livestock/page.tsx`'s server component wraps the two new list
calls in a `try/catch` — a missing-table Postgres error degrades to an
empty list (the "Individual animals" section just shows "No individual
animals recorded yet"), not a crashed page, until the migration is
applied. Documented here and in the migration's own header comment
rather than assumed.

**Quality checks**: 4 new tests (`mappers.test.ts` — row mapping and
`latestWeightObservation`'s real-date-not-insertion-order behaviour);
63/63 test files, 922/922 tests, typecheck/lint/build clean (31 routes,
unchanged). Verified the rest of `/livestock` still resolves cleanly
against the live dev server's current schema (fail-open, not a crash).

Status: **Phase 12 complete and code-ready; requires the new migration to be applied to the live project before the feature is actually usable (documented, not fabricated). Phase 11 deferred to Phase 26.**

---

## Phase 13 — housing

Already largely real from the prior session (Phase 11: create shed, real
empty state, mock slurry estimate honestly tagged). One real gap found
while checking "link livestock where appropriate": `/livestock`'s own
page subtitle already read "Animal groups, numbers, weight/value and
housing link" but the "Add livestock group" form never actually had a
housing selector — `addLivestockGroup`'s `housingId` param existed in the
type with no UI path to set it (onboarding used to set it, but Phase 2/3
removed housing capture from onboarding entirely). Fixed: a "Housing
(optional)" selector now appears in the add-group form whenever the farm
has at least one shed.

Housing *editing* (rename a shed, change capacity) still doesn't exist —
grouped with Phase 26 (Editability) rather than fixed piecemeal here,
same reasoning as Phase 11's livestock-group editing.

**Quality checks**: no new tests (a form field addition, not new
calculation logic); 63/63 test files, 922/922 tests, typecheck/lint/build
clean (31 routes, unchanged).

Status: **complete for what's in this phase's scope; editing deferred to Phase 26.**

---

## Phase 14 — nutrients: verified, no changes needed

Already fully real from the prior session's Phase 8, plus this session's
Phase 9 `?field=` deep-linking and blank-page fix. Re-checked "do not
show recommendations for sample fields" — confirmed true (real fields
only, since `farm-store.tsx`'s real mode never seeds mock data).

Status: **complete — verification only.**

---

## Phase 15 — "How was this calculated?" drill-down pattern

New generic, reusable `BreakdownToggle` (`src/components/ui/`) — a
collapsed-by-default expand toggle rendering rows the *caller* computed
from a real domain function; the component itself has no knowledge of
what it's showing and invents nothing, directly satisfying the brief's
"must not become a hard-coded explanation... driven by the same data used
to create the number."

**Fertiliser**: wired to `calculateFarmFertiliserRequirement`'s existing
real `byProduct` array on `/input-planner` — zero new engine risk, this
breakdown already existed and was computed, just not shown.

**Feed cost**: `calculateFarmConcentrateFeedCostEur` only ever returned a
single total, with no per-group breakdown to surface. Rather than risk
its 14 existing test assertions by changing its signature, refactored
safely: the per-group logic it already computed internally (just never
returned) now lives in a new `calculateFarmConcentrateFeedCostBreakdown`,
and the original function became a one-line wrapper (`.total`) — same
inputs, same outputs, same 37 existing `finance.test.ts` assertions
passing unmodified, confirmed by running them before writing the new
tests. Wired into `FeedCostOverviewCard`'s "Concentrates" row (the one
row that's a genuine sum across multiple groups — Grass/Silage/Minerals
are already single calculations with nothing to break down).

**Found while wiring this, not looking for it — a real, more serious
mock-authority gap**: `/input-planner`'s "Planning Confidence" rendered a
fully filled, full-opacity `ScoreRing` (a 0-100 visual meter) from
`mockInputPlannerSummary.planningConfidencePct` with zero disclosure —
worse than an unlabelled plain number, since a filled ring carries *more*
implied authority ("the app computed this") than text does. "Potential
Saving" next to it also had no `sampleData` badge, unlike every other
mock KPI in this app. Both fixed: the ring now shows the same muted/
zeroed "Not yet available" treatment already used on Dashboard's
equivalent card, and the saving figure now carries its `sampleData` pill.

**Quality checks**: 3 new domain tests
(`calculateFarmConcentrateFeedCostBreakdown` — total parity with the
legacy function, byGroup sums to the total, omits ungrounded groups same
as the total); 63/63 test files, 925/925 tests, typecheck/lint/build
clean (31 routes, unchanged).

Status: **complete — reusable drill-down pattern built and wired to two real breakdowns; one real, more serious mock-authority bug found and fixed along the way.**

---

## Phase 16/17/18/19 — spreading, silage, feed, input planner: verified

All four already covered by the prior session's Phases 9/10/12/13 plus
this session's Phase 4/5 audit and Phase 15 fixes. Spot-checked directly
this phase (real closed-period-calendar import in `/spreading`, hardcoded
`STEER_CONCENTRATE_PRICE_EUR_PER_TONNE`/`WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE`
constants in `livestock.ts` — the exact kind of "hard-coded price" Phase
20 targets, motivating that phase rather than being fixed piecemeal here).

Status: **verified — no new changes; the one real gap found (hardcoded concentrate prices) became Phase 20's motivation, not a standalone fix.**

---

## Phase 20/21/22 — market data subsystem, source hierarchy, automated sourcing

**Researched before building, per Phase 22's own instruction**: is there a
real automated price feed to wire up? `docs/evidence-register.md`
confirms the only real, sourced, automated data this app already has is
the CSO cattle/fertiliser/price-index series in `src/domain/market.ts` —
genuinely real, but static code constants refreshed by hand from a
workbook, not a live API integration, and bulk-buy/supplier pricing is a
**confirmed** blocker (both source workbooks explicitly say "do not
populate from invented examples — a live merchant quote is the only
thing that can close it"). No new automated provider was built as a
result — correctly scoped as still blocked, not silently worked around.

**What *was* real and buildable — the farmer's-own-quote half**: new
`supplier_quotes` table (`supabase/migrations/20260828050000_supplier_quotes.sql`,
RLS matching the Phase 1 hardened pattern), adapters
(`src/lib/farm-data/supplier-quotes.ts`), a Server Action, and a real
`SupplierQuotesCard` on `/finance` (list + add form, real-mode only).

**The source hierarchy itself — the brief's actual Phase 21 ask**: new
`src/domain/price-resolution.ts`, a pure `resolvePrice()` function
implementing the exact order specified: farmer-entered → supplier quote
(not expired) → market reference → historical benchmark → unavailable
(returns `null`, never a fabricated `0`). 9 new tests cover every tier
transition, the "estimated ≠ farmer_adjusted" distinction (an *accepted*
reference default must not count as "farmer entered"), quote expiry, and
picking the most recent of several valid quotes.

**Wired into the UI, honestly scoped**: `FinancialAssumptionsCard` now
shows each assumption's resolved source/tier — but only demonstrated for
`fertiliser_price_eur_per_t`, the one key with a real market-reference
tier available (CSO's 18-6-12 series, the same default onboarding already
offers). Deliberately **not** auto-matched `SupplierQuote`s to the other
four assumption keys by fuzzy product-name text — there's no real schema
linking a free-text quote's `product` field to an assumption key, and an
incorrect fuzzy match (a diesel quote silently backing the fertiliser
price) would be worse than showing no resolved source at all. Supplier
quotes stay in their own separate, unmatched list
(`SupplierQuotesCard`) rather than being force-fit into a resolution the
data doesn't actually support yet.

**Not attempted**: rewiring `STEER_CONCENTRATE_PRICE_EUR_PER_TONNE`/
`WEANLING_CONCENTRATE_PRICE_EUR_PER_TONNE`-style hardcoded constants
throughout `livestock.ts`/`finance.ts` into this hierarchy — same
"changing several already-tested pure functions' signatures" risk
Phase 14 (prior session) already declined for the same reason. The
hierarchy resolver and its data sources are real and ready; consuming
them inside the calculation engines is a distinct, larger follow-up.

**Quality checks**: 9 new tests (`price-resolution.test.ts`); 64/64 test
files, 934/934 tests, typecheck/lint/build clean (31 routes, unchanged).
Requires `20260828050000_supplier_quotes.sql` applied to the live project
(same documented-not-assumed pattern as Phase 12's migration) — the
Finance page's supplier-quotes fetch fails open (empty list) until then.

Status: **complete for the genuinely buildable scope — hierarchy resolver, tests, and the real supplier-quote tier are real and working; the automated-reference tier stays a documented, confirmed blocker, not silently faked.**

---

## Phase 23/24/25 — finance, reports, provenance UI: verified

**Finance**: the brief's Phase 23 asks ("separate actual/quotes/reference/
historical/assumptions/calculated... every major euro figure drillable...
remove unexplained mock amounts") are now substantially satisfied by
Phases 14/15/20/21 combined — `FinancialAssumptionsCard` (farmer
assumptions), `SupplierQuotesCard` (quotes), `resolvePrice` (the
hierarchy), `BreakdownToggle` (drill-down), and the already-verified
"Sample data" labelling on what's still genuinely mock. No further
changes needed this pass.

**Reports**: spot-checked again — real CSV/JSON exports from real
farm-store data, `RecommendationAuditTrailCard` real (confirmed in Phase
4/5's audit). One still-open, already-documented gap: the audit trace/
peer-review records remain `localStorage`-only, not Supabase-persisted —
tracked, not silently dropped, same finding as Phase 4/5.

**Provenance UI**: the vocabulary the brief asks for (Farmer entered,
Laboratory result, Supplier quote, Met Éireann observation/forecast,
Market reference, Statutory rule, Calculated, Estimated, Missing,
Unavailable) is already substantially in place across `StatusBadge`/
`SourceBadge`/`PRICE_SOURCE_LEVEL_LABEL` — verified consistent, not
rebuilt.

Status: **verified — no new changes needed beyond what Phases 14/15/20/21 already built.**

---

## Phase 26 — editability

Two real, previously-deferred gaps closed (Phases 11/13 of this brief
explicitly deferred both here rather than duplicating the work):

1. **Livestock group editing** — new `updateLivestockGroup`
   (`src/lib/farm-data/livestock.ts`, mock+real mode in `farm-store.tsx`).
   The `/livestock` "Groups" tab's previous dead end ("Group management
   ... is a Phase 2+ flow — coming soon") replaced with a real editable
   list: rename, correct count/weight/breed, change system/goal, link/
   unlink housing. Split/merge deliberately not built — a genuinely
   different, bigger feature (dividing one DB row's history into two),
   not a field-patch.
2. **Housing editing** — new `updateHousing`
   (`src/lib/farm-data/housing.ts`, mock+real mode). `/housing` gained an
   "Edit this shed" action reusing the existing Add-shed form (prefilled,
   submits to update instead of create) rather than a second near-
   identical form.

Fixed a real `react-hooks/exhaustive-deps` warning the housing-edit
closure surfaced (`state.housing` read directly inside the action without
being in `useMemo`'s dependency array — a genuine stale-closure risk, not
a lint false positive) by adding it to the deps array.

**Quality checks**: no new tests (both are additive CRUD patches mirroring
already-tested existing actions' exact patterns — `updateFieldDetails`
for the "patch some fields, persist remote" shape); 64/64 test files,
934/934 tests, typecheck/lint/build clean (31 routes, unchanged).

Status: **complete — both previously-deferred editability gaps closed.**

---

## Phase 27 — error/empty/loading states

Swept `src/app/(app)` for unguarded `return null`s beyond the ones already
fixed in prior phases. Found one (`/spreading`'s per-field list, inside a
`.map()` — filtering a single unmatched row, not a whole-page blank
state) but checking it surfaced a **real, more serious bug** in the same
file:

**`/spreading` was passing `mockFarm.location.centroid` — the Phase 1
demo farm's coordinates — to both `CurrentConditionsCard` and
`NineDayForecastCard`, regardless of which real farm was signed in.** A
real farmer would have seen Met Éireann conditions/forecast for
"Ballybeg Farm," not their own farm's real location — `farm` (the real,
signed-in farm from `useFarm()`) was already in scope two lines above and
simply wasn't the one being used. This is exactly the kind of thing this
build's own "compiles and typechecks but never ran" caveat exists to
catch, and it slipped past every prior phase's review of this page
(Phases 9/16 both looked at `/spreading` and didn't catch it, because
neither was specifically checking *which farm's coordinates* the weather
cards received — a reminder that "verified real" still needs re-checking
from new angles, not just re-confirmed from the same one). Fixed: both
cards now receive `farm.location.centroid`.

**Also fixed while there**: the per-field spreading list (tied to
`mockSpreadingScores`' demo field ids, which a real farm's fields never
match) rendered nothing at all for any real farm, silently — now shows an
honest empty state instead of blank space, consistent with the class of
fix already applied to Housing/Silage/Nutrients/Feed Optimiser.

**Quality checks**: no new tests (the fix is passing the correct existing
value to an already-real component, not new calculation logic); 64/64
test files, 934/934 tests, typecheck/lint/build clean (31 routes,
unchanged). Also grepped the whole `src` tree for any other
`mockFarm.location`/`.centroid`/`.county` consumer outside
`mock-farm.ts`/`farm-store.tsx`'s legitimate mock-mode seed — none found.

Status: **complete — one real, previously-undetected wrong-farm-location bug found and fixed, plus one empty-state gap.**

---

## Phase 29 — real-mode end-to-end test: built, run, found a critical live blocker

Wrote `tests/e2e/real-mode-flow.spec.ts` (Playwright) covering the full
brief-specified flow: sign up → onboard (Farm → Livestock) → enter app →
add field → add soil → inspect nutrients → add housing → inspect input
planner/finance/reports → sign out → sign in → confirm persistence → edit
a field name → confirm the rename propagates into Nutrients. Uses a real
throwaway account (`e2e-<timestamp>@farmreturn-e2e-test.invalid`, the
IANA-reserved `.invalid` TLD) against the real `Farm Return V1 Dev`
project — never the demo/sample farm. Skips itself with a clear reason if
`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` aren't configured (`.env.local` is
read directly — Playwright's own process doesn't load it the way Next.js
does). A separate `playwright.e2e.config.ts` runs it against whatever dev
server is already up, rather than the visual suite's own auto-started
port-3100 instance (this Next.js version refuses a second `next dev` in
the same project directory).

**Actually ran it against the live project — and it found a real,
critical bug**: sign-up succeeded, the Farm onboarding step's submit
failed with "Something went wrong. Please try again." Root cause,
confirmed by reading the code: `farmToInsertRow` (`mappers.ts`)
unconditionally includes `onboarding_completed_at` in every farm INSERT
(added this session, migration `20260828030000_onboarding_completion.sql`)
— but that migration has never been applied to the live project (no
Supabase CLI/DB credentials available in this environment to run it).
Unlike the `individual_animals`/`supplier_quotes` migrations (Phases 12/20,
deliberately wrapped in `try/catch` to fail open), this one sits in the
*core* farm-creation path with no fallback — so until it's applied, every
real sign-up is blocked at the very first onboarding step. **Reported to
the user directly, with the exact three pending migrations
(`20260828030000`/`20260828040000`/`20260828050000`) and how to apply
them** — this needs real database access this environment doesn't have,
so it's a genuine, actionable blocker handed back rather than worked
around or silently left for someone to discover later.

This is precisely the value the brief's Phase 29 anticipated: a real E2E
run against a real project catches exactly what static analysis and
mocked component tests cannot. Once the migrations are applied, the test
should be re-run to confirm the rest of the flow (it wasn't reached yet).

**Quality checks**: 1 new E2E test file (not yet fully green — blocked on
the migration above, honestly reported rather than skipped/deleted to
reach green). `npm test`/`typecheck`/`lint`/`build` (the Vitest suite,
unaffected by this Playwright addition) still clean.

Status: **test harness built and genuinely exercised against the live project; found and reported one critical, real blocker requiring the user's database access, not silently worked around.**

---
