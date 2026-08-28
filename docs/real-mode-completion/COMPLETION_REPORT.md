# Real Mode Completion — completion report

Branch `claude/real-mode-completion`, branched from `claude/real-farm-v1`
(the prior "Real Farm V1" session's 17 commits) at the live-Supabase
`"use server"` export fix. All 36 phases of the "Farm Return V1 — Real
Mode Completion" brief complete, including live verification: the full
brief-specified real-mode flow (sign up → onboard → map/add a field → add
soil → inspect nutrients → add housing → inspect inputs/finance/reports →
sign out → sign in → confirm persistence → edit a field → confirm the
dependent Nutrients view updates) has been run end to end against the
real `Farm Return V1 Dev` project and passes. The one blocker this report
originally flagged (three pending migrations) has been resolved by the
user and re-verified live — see "Live verification" below.

## Starting state

`claude/real-farm-v1`'s own completion report (Phases 1–15 of the
earlier brief) plus one live-verified bug fix (a `"use server"` file
exporting a non-function value, found the moment the user first ran
`npm run dev` against a real Supabase project). 62/62 test files, 905/905
tests, clean build, but nothing had been exercised against a live
database beyond that one fix.

## Commits completed

17 commits on `claude/real-mode-completion`, one per phase (or logical
phase group), each with a green `npm test`/`typecheck`/`lint`/`build`
gate before committing. Full detail in `BUILD_LOG.md`.

## Onboarding changes

Redesigned from a 6-step wizard (Farm, Fields, Soil, Livestock, Housing,
Financials) to 2 steps (Farm, Livestock — broad capture only), per the
brief's explicit instruction to remove field/soil/finance capture from
onboarding entirely. Fixed a real duplicate-farm-creation bug (Back
button resubmitting `createFarmStep` instead of updating) at the
architecture level — a new `updateFarmStep` action and a new
`farms.onboarding_completed_at` column give the wizard real Back-button
safety and real cross-session resumability (a farmer who leaves after the
Farm step resumes at Livestock on return, with real data already loaded,
instead of restarting or silently skipping the rest of onboarding). 6
regression tests directly assert the fix (create → advance → Back →
resubmit results in exactly one create, never two).

## Persistence changes

`farm-store.tsx`'s "remote mode" (built in the prior session) extended
with real editability for livestock groups and housing (previously
add-only). Three new database-backed features: individual animal
tracking with historical weight observations (optional, collapsed by
default), supplier quotes, and a real price-source-hierarchy resolver
consuming both. A real, previously-undetected bug fixed:
`/spreading` was passing the demo farm's coordinates to the weather cards
for every real signed-in farmer, regardless of their own farm's real
location.

## Supabase schema changes

Three new migrations this session (six total across both sessions):

1. `20260828020000_rls_security_hardening.sql` — reconciles the repo with
   hardening already applied live (fixed `search_path`, `authenticated`-
   scoped policies, `anon` revoked).
2. `20260828030000_onboarding_completion.sql` — `farms.onboarding_completed_at`.
3. `20260828040000_individual_animals.sql` — `livestock_individuals`,
   `livestock_weight_observations`.
4. `20260828050000_supplier_quotes.sql` — `supplier_quotes`.

Migrations 2–4 were applied by the user directly to `Farm Return V1 Dev`
after this report was first drafted, and confirmed live (see "Live
verification" below) — all six migrations now match between this repo
and the live project. All follow the same RLS pattern established in
migration 1 (`to authenticated`, `(select auth.uid())`, `anon` revoked).

## Mock data removed / relabelled

See `FINAL_MOCK_AUDIT.md` for the full table. Highlights: the wrong-farm-
location bug on `/spreading`; a fabricated `ScoreRing`-rendered "Planning
Confidence" score with zero disclosure; `InputRequirementRow`'s Timing/
Confidence columns now visually distinct from real figures; `AlertsCard`'s
dead link removed.

## Modules integrated

Fields, Soil, Nutrients, Spreading, Silage, Livestock, Housing, Feed
Optimiser, Input Planner, Finance, Reports, Market Prices, Settings — all
re-verified this session against the real farm-store; most were already
correctly wired by the prior session and needed no further change.
New: individual animal tracking, supplier quotes, price-source hierarchy,
Dashboard setup-progress panel, field-detail drill-downs (Soil tab,
Nutrients deep-link), reusable financial-breakdown drill-down.

## Click-through / drill-down added

Dashboard `SetupProgressCard` (every line links to its module).
`BreakdownToggle` (generic, data-driven "How was this calculated?")
wired to the Fertiliser and Concentrate Feed cost totals. `FieldDrawer`'s
new Soil tab and "Open this field's nutrient plan" link. `/nutrients`'
`?field=` deep-linking.

## Market-data architecture

`supplier_quotes` table (the real, buildable half) and
`src/domain/price-resolution.ts`'s `resolvePrice()` (the brief's actual
Phase 21 ask — a pure, fully-tested hierarchy function: farmer-entered →
supplier quote → market reference → historical benchmark → unavailable,
never a fabricated `0`). The automated public-reference-observation half
stays the existing real `market.ts` CSO series (researched first, per
Phase 22's own instruction — no live automated feed exists to build a new
table against; bulk-buy/supplier pricing remains a confirmed blocker).

## Finance changes

`FinancialAssumptionsCard` gained resolved-source display (Phase 20/21).
New `SupplierQuotesCard`. New `BreakdownToggle` drill-downs. Verified —
not re-fixed — that `MarginHeroCard`/`CashflowCard`/`BestOpportunitiesCard`
already carry honest "Sample data" labelling from the prior session.

## Scientific changes

None to `src/domain/`'s calculation logic — this build's job was
persistence/UI, and it stayed that way. One real risk *avoided*: a
ready-to-wire winter-fodder-demand function was found to return
fresh-weight tonnes into a UI field labelled dry-matter tonnes; not
wired in, documented instead (prior session, re-confirmed this session's
`SCIENTIFIC_RECONCILIATION.md`).

## Tests added

- 6 tests, `OnboardingWizard.test.tsx` (Back-button regression, save
  states, resumability).
- 7 tests, `farm-stats.test.ts` additions (`calculateFarmSetupProgress`).
- 3 tests, `finance.test.ts` additions (`calculateFarmConcentrateFeedCostBreakdown`
  breakdown), plus 3 more post-completion (its `priceOverride` parameter).
- 9 tests, `price-resolution.test.ts` (the full hierarchy).
- 4 tests, `mappers.test.ts` additions (individual animals, weight
  observations, field-archive).
- 3 tests, `MarketWatchCard.test.tsx` (post-completion — real vs. Sample
  data per-row labelling).
- 1 new Playwright E2E spec (`real-mode-flow.spec.ts`) — genuinely run
  against the live project, not just written.

## Final test count

65/65 Vitest test files, 940/940 tests passing (up from 63/63, 918/918
at the equivalent point in the prior session's tally, 62/62, 905/905 at
this session's start, 934/934 at initial Phase 36 completion, 937/937
after the concentrate-feed-price follow-up, 940/940 after the
`MarketWatchCard` badge follow-up below). `npm run typecheck`/
`npm run lint` clean throughout. `npm run build` clean throughout — 24
routes, all `(app)` routes correctly dynamic now that Supabase is
configured.

## Build result

Green at every commit. No test skipped or deleted to reach green. The one
genuinely-failing thing found this session (the E2E flow, initially
blocked on a pending migration) was reported honestly rather than hidden
or worked around, and — once the user applied the migration — re-run to
a full, real, live pass (`BUILD_LOG.md` Phase 29). Along the way, one
real bug in the *test itself* (a Playwright strict-mode selector
ambiguity) was also found and fixed the same way: diagnosed, fixed,
re-run, not silently patched around.

## Security advisor result

Not independently re-run this session (no dashboard/CLI access) — the
brief states Security Advisor already returned zero findings after the
live hardening pass this session's migration 1 reconciles. `SUPABASE_AUDIT.md`
recommends re-running it once CLI/dashboard access exists, alongside a
`supabase db diff` to confirm this repo's migrations exactly match the
live schema.

## Live verification

The user applied the three pending migrations directly to
`Farm Return V1 Dev` and confirmed them live (columns/tables present, RLS
enabled, six migration-history entries recorded) — not re-applied or
reset by this session. `tests/e2e/real-mode-flow.spec.ts` was then
re-run against the live project: the first re-run correctly succeeded
past farm creation but surfaced a real bug in the *test itself*
(a Playwright strict-mode violation — the farm name legitimately renders
in two places, desktop sidebar and mobile-only footer); fixed, and the
second re-run passed completely, all 11 steps, using its own isolated
uniquely-timestamped account and data (the live project already has
earlier validation test data in it; this run neither read nor depended
on any of it, per the user's explicit instruction).

## Remaining external blockers

1. **No automated market-price feed** — confirmed, not just unbuilt
   (both source workbooks explicitly say a live merchant quote is the
   only thing that closes this).
3. **No sourced silage yield/DM-conversion data** — confirmed via
   `docs/evidence-register.md`, real per-field silage planning stays
   blocked.
4. **Met Éireann forecast commercial licence** — pre-existing, unchanged.

## Remaining scientific limitations

Unchanged from Scientific Engine v3's own documentation — this build
never touched calculation logic. See `SCIENTIFIC_RECONCILIATION.md`.

## Remaining financial limitations

A real farmer-entered concentrate feed price now is consumed by the whole-
farm concentrate feed cost engine (post-completion follow-up, see below);
fertiliser cost still is not — its per-product prices sit inside
`nutrients.ts`'s Green Book/NAP calculation, a materially higher-risk
place to change, deliberately left alone (`FINANCIAL_RECONCILIATION.md`).
No real monthly cashflow/total-revenue exists (no sales-log data source).
`MarketWatchCard` now shows real per-row status badges (post-completion
follow-up, see below — resolves what had been `FINAL_MOCK_AUDIT.md`'s one
remaining finding).

## Deliberately deferred work

- Livestock group split/merge (a genuinely different, bigger feature than
  the editing this build added).
- Rewiring the hardcoded fertiliser price in `nutrients.ts` into the new
  price-resolution hierarchy (concentrate feed price was closed by a
  post-completion follow-up, see "Exact known blockers" below — fertiliser
  remains deliberately deferred as the higher-risk half).
- Migrating the two remaining `localStorage` silos (audit trace,
  peer review) to Supabase.
- Full UI-consistency pass (Phase 28) — deliberately not prioritised over
  truthfulness per the brief's own instruction; the existing visual
  direction was left alone.
- Two-real-account cross-isolation manual verification (needs the
  pending migrations applied first).

> **NDVI / satellite vegetation intelligence remains deliberately
> deferred** — no NDVI UI, satellite API integration, or biomass modelling
> was built or attempted this session, consistent with every prior phase
> of this project.

## Exact known blockers — what needs to happen next

No blocker remains that prevents real use of the app — the migrations
are applied and the full flow is live-verified. Post-completion
follow-ups (this same continued session) closed two remaining items: the
concentrate-feed half of the financial-assumptions-not-consumed-by-
calculations gap (`BUILD_LOG.md`'s "concentrate feed price now consumed
by the cost engine" entry, `FINANCIAL_RECONCILIATION.md`) and
`MarketWatchCard`'s per-row status badges (`BUILD_LOG.md`'s
"MarketWatchCard per-row status badges" entry, `FINAL_MOCK_AUDIT.md`).
Recommended next steps, in priority order:

1. Work through `docs/real-farm-v1/REAL_FARM_VALIDATION_CHECKLIST.md`
   (the prior session's manual checklist) by hand — the E2E suite proves
   the happy path works, not every scientific/legal edge case (a
   4-year-old soil test's NAP-ceiling downgrade, a commonage-status legal
   prohibition, etc.).
2. Close the fertiliser half of the financial-assumptions gap — higher
   risk than the concentrate-feed half already closed, since its price
   constants sit inside `nutrients.ts`'s Green Book/NAP calculation
   (`FINANCIAL_RECONCILIATION.md`).
3. Periodically clean up `e2e-*@farmreturn-e2e-test.invalid` test
   accounts from the Supabase dashboard as the E2E suite accumulates runs
   (each run creates one real throwaway account and farm; nothing deletes
   them automatically — see `real-mode-flow.spec.ts`'s own header
   comment).
