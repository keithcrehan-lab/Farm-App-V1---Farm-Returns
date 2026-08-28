# Real Farm V1 — completion report

Status as of this report: **Phases 1–15 of the 26-phase brief complete or
verified; Phases 16–20 and 22–25 not yet attempted; Phase 21 (this
document's companion, `REAL_FARM_VALIDATION_CHECKLIST.md`) done.** This is
an honest interim state, not a claim of full completion — see "What
remains" below. All work is on branch `claude/real-farm-v1`, one commit
per phase, `docs/real-farm-v1/BUILD_LOG.md` has the detailed record.

## Account system

Supabase Auth: sign-up (with email confirmation), sign-in, sign-out,
password reset, session-refreshing route protection (`src/proxy.ts` — this
Next.js version renamed `middleware.ts` to `proxy.ts`). Every existing
screen moved behind an `(app)` route group gated on a signed-in session;
`(auth)` holds the unauthenticated screens. **Not verified against a live
Supabase project** — no project exists in this build environment
(documented credential blocker, Phase 2).

## Persistence architecture

Postgres/Supabase schema (`supabase/migrations/20260828000000_init_farm_schema.sql`,
`20260828010000_field_archive_and_edit.sql`): `farms`, `fields`,
`housing`, `livestock_groups`, `slurry_allocations`,
`financial_assumptions` (new entity), all Row Level Security-scoped to
`auth.users` via `farms.user_id`. Every `TrackedValue<T>` provenance field
stored as `jsonb` in its existing TypeScript shape — one schema, not two
to keep in sync.

`src/lib/farm-data/` — pure, unit-tested row↔domain mappers plus the
first real server-only query/mutation functions, called from
`src/app/actions/*.ts` Server Actions. `src/store/farm-store.tsx` gained a
"remote mode": real farm data flows in from Postgres server-side
(`(app)/layout.tsx`) and every mutation writes through
(fire-and-forget after an identical synchronous local-state update — a
documented tradeoff, no optimistic-UI rollback yet). Mock mode (every
existing test, and the app when Supabase isn't configured) is
byte-for-byte unchanged — verified by the full test suite passing
unmodified at every phase.

**Not verified against a live database** — same credential blocker.

## Database schema/migrations

Two migration files, documented in `supabase/README.md` (setup steps,
schema rationale, what's deliberately not yet migrated — the two
remaining `localStorage` silos, audit trace and peer review, out of Phase
3's farm-model scope).

## Screens completed / modules integrated

- **Auth**: sign-in, sign-up, forgot-password, update-password, sign-out
  (Settings).
- **Onboarding**: `/onboarding` — Farm → Fields+use → Soil (optional) →
  Livestock → Housing → Financial assumptions, all writing real rows.
- **Fields**: create, map (existing Mapbox tool, untouched), rename,
  change use, archive/restore, real soil-test-validity display.
- **Soil**: real lab test entry, real P/K classification (unchanged
  Scientific Engine V3 logic, now reachable from onboarding too via one
  shared `addSoilTestToField` function).
- **Nutrients**: verified already real and complete from prior Scientific
  Engine V3 work; one provenance-badge gap closed.
- **Weather/Spreading**: verified — no violations of the brief's
  station-identity/no-invented-score rules.
- **Livestock/Housing**: real `addHousing` action (previously didn't
  exist at all); two real crash bugs fixed (`useHousingList()[0]` with no
  guard, on both `/housing` and `/silage`).
- **Feed Optimiser**: blank-page bug fixed with an honest empty state;
  underlying id-keyed-registry limitation documented, not solved.
- **Input Planner**: verified already real and farm-driven; one
  mock-vs-real labelling gap fixed (bulk-buy card).
- **Finance**: verified the brief's "critical" concerns (cashflow/margin/
  opportunities mock-authority) were already correctly labelled by a
  prior audit pass; closed the one real gap — no farmer-editable
  assumption UI.
- **Dashboard**: verified already in good shape — the brief's own worked
  example (fabricated "Plan Confidence"/"Carbon Score" → honest "Not yet
  available") was already fixed by a prior pass.

## Mocks removed / relabelled

- `LivestockGroup.statusLabel` — a fabricated "On Track" with no rule
  behind it — no longer set for real farmer-created groups.
- `BuyingOpportunityCard` — three still-mock fields (regional demand,
  current/target price) and a derived "saving" figure now visibly marked
  "(example)"/"illustrative" instead of carrying the same confident
  styling as the one real field on the card.
- Confirmed, not found to be a violation: the old unsourced 0–100
  spreading score is genuinely gone from every surface (a prior pass had
  already removed it); `MarginHeroCard`/`CashflowCard`/
  `BestOpportunitiesCard` already carry "Sample data" badges;
  `/dashboard`'s Plan Confidence/Carbon Score already show an honest
  unavailable state.

## Remaining legitimate limitations

- **Silage**: no real per-field silage plan/yield/forage-inventory engine.
  Investigated in depth (Phase 10) — genuinely blocked: no sourced silage
  yield (t DM/ha) table and no sourced fresh-to-DM conversion factor exist
  anywhere in this app's evidence base. A real, sourced, ready-to-use
  winter-fodder-*demand* engine (`calculateWholeFarmFodderDemand`) exists
  but was deliberately **not** wired into the DM-tonnes-labelled UI
  field it would populate, because it returns fresh-weight tonnes — a
  real unit mismatch, documented rather than silently introduced.
- **Feed Optimiser**: tied to two exact demo livestock-group ids, not a
  real farm's categories. Fixed the resulting blank page with an honest
  empty state; making it genuinely farm-driven needs
  `FINISHING_OPTIONS` reworked from an id-keyed registry to a
  category-based one — scoped as future work.
- **Financial assumptions not yet wired into calculations**: a farmer can
  now view/edit their real fertiliser/feed/contractor/cattle/fuel price
  assumptions (Phase 14), but `FeedCostOverviewCard`/`FertiliserSlurryCard`
  still compute from domain-module constants, not those values — closing
  this means changing several already-tested pure calculation functions'
  signatures, deliberately deferred rather than rushed.
- **Livestock group editing**: add exists (and now archive/restore for
  fields); editing an existing livestock group's count/weight after
  creation does not yet exist. Deferred to Phase 18 (editability), not
  attempted piecemeal.
- **Bulk buying**: regional demand/pricing/savings remain a confirmed,
  documented blocker (both source workbooks say a live merchant/supplier
  quote is the only thing that can close it) — now clearly labelled as
  illustrative rather than silently presented as real.

## External-data dependencies

- **Met Éireann**: real observation/forecast integration, unchanged by
  this build. Forecast commercial licence review is a pre-existing,
  separately-flagged blocker (`docs/evidence-register.md`).
- **CSO**: real 24-month cattle/fertiliser/price-index series, unchanged.
- **Supabase**: this build's own new dependency — no live project exists
  in the environment this was built in.

## Scientific limitations

Unchanged from Scientific Engine V3's own documentation
(`docs/scientific-engine/v3/`) — this build did not touch calculation
logic except where explicitly noted (soil-test-validity display,
provenance badges) and never weakened a fail-closed gate, statutory
ceiling, or evidence requirement. The one new finding this build
surfaced — the fresh-weight-vs-DM-tonnes unit mismatch in the unused
fodder-demand engine — is a real risk *avoided*, not a defect introduced.

## Financial limitations

`MarginHeroCard`/`CashflowCard`/`BestOpportunitiesCard` remain
intentionally illustrative (no real sales-timing/recommendation engine
exists) — already correctly labelled before this build started, reverified
here. Bulk-buying pricing/savings remain a confirmed external blocker.
Financial assumptions are now real and farmer-editable but not yet
consumed by the cost calculations that should use them.

## Tests added

- `src/lib/supabase/env.test.ts`, `proxy.test.ts` — auth config/routing
  logic (Phase 2).
- `src/lib/farm-data/mappers.test.ts` — 13 tests covering all six
  row↔domain mapping directions, including the field-archive addition
  (Phases 3, 7).
- `src/lib/irish-counties.test.ts` — onboarding's county-centroid
  reference data (Phase 4).

Domain calculations remain independently testable without a browser or
live database, unchanged — this build's new tests follow the same
convention for the new persistence/config logic.

## Final test count

62/62 test files, 905/905 tests passing at every phase's commit (started
at 58/58 files, 881/881 tests on `main`). `npm run typecheck`/
`npm run lint` clean throughout. `npm run build` clean throughout — 31
routes (up from 25 on `main`: 5 new auth routes, `/onboarding`,
`/auth/callback`), still fully static except the two routes that were
already dynamic (`/api/weather/*`).

## Build result

Green at every phase. No test was deleted or weakened to reach green.

## Exact known blockers

1. **No live Supabase project** — blocks end-to-end verification of every
   phase from 2 onward. `supabase/README.md` has exact setup steps;
   nothing else needs to change once a project exists.
2. **No sourced silage yield/DM-conversion data** — blocks a real Silage
   domain engine; confirmed via `docs/evidence-register.md`, not assumed.
3. **No live bulk-buy commercial source** — pre-existing, reconfirmed.
4. **Met Éireann forecast commercial licence** — pre-existing, unchanged.

## Items deliberately deferred

- Phases 16 (Reports re-verification), 17 (dedicated provenance-UI pass —
  much of this was already satisfied incidentally by Phases 8/13/14's
  fixes, but not swept end-to-end), 18 (editability sweep across every
  entity), 19 (error/loading-state audit across all 19 routes beyond the
  three crash fixes already made), 20 (UI cleanup pass).
- Phase 22/23: no dedicated new integration test for the full
  sign-up→farm→field→soil→livestock→nutrients→inputs→finance→report flow
  yet — the pieces are individually real and Phase-tested, but not
  chained in one automated test.
- Phase 25: a full, dedicated adversarial sweep across all 19 screens has
  not been run as its own pass — this build found and fixed several
  adversarial-class issues opportunistically while working phase-by-phase
  (fabricated status label, unlabelled mock financial figures, two crash
  bugs), but a systematic final sweep specifically looking for what these
  phase-by-phase passes might have missed has not happened yet.

> **NDVI / satellite vegetation intelligence was deliberately deferred
> from Real Farm V1**, per the brief's own explicit instruction — no
> NDVI UI, satellite API integration, or biomass modelling was built or
> attempted.

## Recommended next steps

1. Stand up a real Supabase project and work through
   `REAL_FARM_VALIDATION_CHECKLIST.md` — the single highest-value next
   step, since it's the only way to catch anything the "compiles and
   typechecks but never ran" caveat on Phases 2–15 might be hiding.
2. Continue phase order from 16, or prioritise 18 (editability) and 19
   (error states) if real-farm testing surfaces specific rough edges.
3. Run Phase 25's full adversarial sweep once 16–20 land, not before —
   it's most valuable as a final pass over a more complete surface.
