# Real Farm V1 — build log

Sequential build session per the Real Farm V1 brief's "DEVELOPMENT METHOD."
Branched `claude/real-farm-v1` from `main` at `2170cfc`. Each entry below
records one phase: scope, what was built, tests/build result, commit.

---

## Phase 0 — baseline verification

Confirmed before branching:

```
git checkout main && git pull --ff-only origin main   # already up to date
npm test    # 58/58 test files, 881/881 tests passing
npm run build   # Next.js 16.3.2 (Turbopack) production build clean, 25 routes
```

`git checkout -b claude/real-farm-v1`.

Status: **complete.**

---

## Phase 1 — whole-application audit

Read every route (`src/app/**`), the store (`src/store/farm-store.tsx`),
the domain layer (`src/domain/*.ts`, ~50 modules), mock data
(`src/data/mock-farm.ts`), the three `localStorage` silos, `README.md`,
`OVERNIGHT_LOG.md`, and the `docs/scientific-engine/v3/` audit trail, plus
`git log` for work not yet reflected in `README.md` (the scientific-engine
v3 closure passes).

**Headline finding**: no auth, no database, one global unscoped
`localStorage` farm shared by every visitor. Domain calculation engines,
provenance system, weather integration, and CSO market data are genuinely
real and must be preserved untouched — this build is persistence/account
plumbing on top of them, not a rewrite.

Full findings: `docs/real-farm-v1/IMPLEMENTATION_AUDIT.md`.

Status: **complete.**

---

## Phase 2 — accounts and authentication (Supabase)

**Credential blocker, documented, not fabricated**: this environment has no
real Supabase project — `NEXT_PUBLIC_SUPABASE_URL`/
`NEXT_PUBLIC_SUPABASE_ANON_KEY` are unset in `.env.local`. Per the brief's
own "genuinely blocked by credentials" instruction, everything buildable
without those live values was built now; going live needs only a real
Supabase project's URL/anon key in `.env.local` (`.env.example` documents
this), no further code changes.

**What was built:**

- `npm install @supabase/supabase-js @supabase/ssr` (network-verified
  available from this environment; versions 2.112.4 / 0.12.5).
- `src/lib/supabase/env.ts` — `isSupabaseConfigured()`/`requireSupabaseEnv()`.
  Every Supabase entry point checks this first; "not configured" fails
  open (no auth gate, matching today's no-account behaviour) rather than
  locking every route behind a sign-in screen that could never succeed —
  this is itself temporary and goes away the moment real credentials are
  set, since `isSupabaseConfigured()` would then return `true`.
- `src/lib/supabase/client.ts` (Client Component browser client),
  `src/lib/supabase/server.ts` (Server Component/Action/Route Handler
  client via `next/headers` `cookies()`, async in this Next.js version).
- `src/lib/supabase/proxy.ts` + `src/proxy.ts` — session refresh and route
  protection. **Important repo-specific fact**: this Next.js version
  (16.3.2) renamed `middleware.ts` to `proxy.ts` — confirmed by reading
  `node_modules/next/dist/docs/.../file-conventions/proxy.md` before
  writing this (`middleware.ts` is a deprecated no-op file convention
  here, not just a naming preference). `matcher` runs on every route
  except static assets/images. Redirects an unauthenticated request to
  `/sign-in?next=<path>`; redirects a signed-in visitor away from
  `/sign-in`/`/sign-up`. `isPublicPath` is exported and unit tested.
- **Route restructuring**: moved all 14 existing app routes (`dashboard`,
  `fields`, `finance`, ... `spreading`) into a new `(app)` route group —
  URLs are unchanged (`/dashboard` still `/dashboard`; route groups don't
  appear in the URL), but they now share `src/app/(app)/layout.tsx`
  (`FarmProvider` + `AppShell`, moved out of the root layout) instead of
  every route being wrapped unconditionally. New `(auth)` route group
  (`src/app/(auth)/layout.tsx`, no sidebar/farm context) holds the
  sign-in/sign-up/forgot-password/update-password pages. Root
  `src/app/layout.tsx` is now just the HTML shell + fonts + metadata.
  Fixed two stale `@/app/livestock/[groupId]/...` imports
  (`feed-optimiser`, `livestock` pages) the move exposed.
- **Auth Server Actions** (`src/app/actions/auth.ts`): `signIn`, `signUp`,
  `signOut`, `requestPasswordReset`, `updatePassword` — each independently
  verifies its own inputs (Next.js's Data Security guide: a Server Action
  is reachable by direct POST regardless of which page rendered its form,
  so proxy-level protection is defence in depth, not the only check) and
  returns a typed `{ error, info }` state for `useActionState` forms
  rather than throwing (a thrown Server Action error surfaces as a
  generic error boundary, not an inline form message).
- **Pages**: `/sign-in` (reads `?next=`, wrapped in `<Suspense>` per
  `useSearchParams`'s documented prerendering requirement), `/sign-up`
  (handles the "check your email to confirm" case explicitly —
  `data.session` is null until confirmed on a default-configured Supabase
  project), `/forgot-password`, `/update-password` (only reachable via a
  real reset-link session). `/auth/callback` (Route Handler) exchanges a
  Supabase PKCE `code` for a session for both the sign-up-confirmation and
  password-reset email links.
- **Sign-out**: added an "Account" card to `/settings` (now split into a
  thin async Server Component `page.tsx` that reads the current user via
  `createClient()` and a `SettingsPageClient` for the existing farm-profile
  form) showing the signed-in email and a `<form action={signOut}>` button
  — Server Actions can be imported directly into a Client Component, no
  extra API route needed. When Supabase isn't configured, shows an honest
  "Account system not yet connected" message instead of a broken control.
- Reused existing design-system primitives throughout (`AlertBanner` for
  error/info states, the `rounded-fr-control border border-fr-border`
  input styling and `bg-fr-green-700` primary-button styling already
  established in `FieldDrawer.tsx`/`settings`) rather than introducing a
  new visual language for auth screens.

**Not yet done (later phases)**: onboarding after sign-up currently
redirects to `/onboarding`, a route that doesn't exist yet (Phase 4).
`(app)/layout.tsx`'s comment already flags that Phase 3's farm-scoped
Server Actions must re-verify the session themselves. No RLS/database yet
— that's Phase 3, which is what actually makes accounts *do* something
beyond gating routes.

**Quality checks**: 9 new tests (`env.test.ts`, `proxy.test.ts` —
`isSupabaseConfigured`/`requireSupabaseEnv`/`isPublicPath`, all pure and
independently testable without a live Supabase project); 60/60 test files,
890/890 tests passing. `npm run typecheck` clean, `npm run lint` clean,
`npm run build` clean (30 routes, including the new `/sign-in`, `/sign-up`,
`/forgot-password`, `/update-password`, `/auth/callback`, and a registered
Proxy). Visual regression suite not re-run this phase (needs Playwright
browser binaries not installed in this pass) — existing screens' URLs are
unchanged so their baselines should still be valid; new auth screens have
no baseline yet, a Phase 20 follow-up.

Status: **complete for what's buildable without live Supabase credentials.**

---

## Phase 3 — persistent farm database

**Schema**: `supabase/migrations/20260828000000_init_farm_schema.sql` —
`farms`, `fields`, `housing`, `livestock_groups`, `slurry_allocations`,
`financial_assumptions` (new — see below), all RLS-scoped to
`auth.users` via `farms.user_id` (child tables check ownership through a
`farm_id` subquery, so a farm can only ever be re-parented in one place).
Design choice, documented in the migration's own header: every
`TrackedValue<T>` field (the provenance wrapper every enterable/derivable
value already uses — `docs/data-model.md`) is stored as `jsonb` in the
exact shape the TypeScript layer uses, not normalised into separate
value/status/source columns — this makes `previous`'s recursive history
chain trivially representable and keeps the adapter layer a near-direct
passthrough rather than a second schema to hand-sync. `housing.linkedGroupIds`
(types.ts) is deliberately **not** a stored column — it's the reverse of
`livestock_groups.housing_id`, computed by the adapter from a query rather
than storing a redundant array and risking the two drifting apart.
`supabase/README.md` documents setup (create a project, copy env vars,
apply via CLI or the SQL editor, configure auth redirect URLs).

**New entity**: `FinancialAssumption` (`src/domain/types.ts`) —
farmer-editable price/cost overrides (fertiliser, concentrate feed,
contractor silage, cattle sale, fuel), explicitly kept distinct from
`src/domain/market.ts`'s sourced CSO reference series (those stay
versioned code constants; a reference price must never be silently
editable into looking like a farmer's own quote — the Phase 14 financial
rules this build must not violate). Key/value shape (`key` +
`TrackedValue<number>` `value`) rather than one column per assumption, so
adding a new assumption type later doesn't need a migration.

**Adapters, not new engines** (`src/lib/farm-data/`):
`row-types.ts` types every table's row shape 1:1 with the migration;
`mappers.ts` is pure row<->domain conversion (no Supabase import — same
"independently testable without a browser or live database" bar as
`src/domain/*.ts`) covering all six entities, plus insert-row builders for
`Farm`/`Field` matching `farm-store.tsx`'s existing `addField`/
`updateFarmProfile` semantics exactly (new fields start with no polygon,
placeholder P/K index — same as today's mock-persistence action). 12 new
tests (`mappers.test.ts`) lock the trickier conversions: centroid tuple
assembly/split, optional-field omission (a `null` DB column becomes an
absent TS property, never a `null` one — matters because e.g.
`field.commonageStatus === undefined` and `=== null` mean different things
to the gates in `input-gates.ts`), and `linkedGroupIds` batch grouping.
`farms.ts`/`fields.ts` add the first real (server-only) query/mutation
functions — `getFarmForCurrentUser`, `createFarmForCurrentUser`,
`updateFarmProfileForCurrentUser`, `listFieldsForFarm`, `createField`,
`setFieldBoundary` — each re-derives the current user itself (Data
Security guide: never trust a caller-supplied id) rather than only
relying on RLS.

**Deliberately not built this phase**: query/mutation functions for
livestock/housing/slurry/financial-assumptions (written when Phase 4's
onboarding flow defines its exact input shapes, so the function
signatures are validated by a real caller instead of guessed speculatively);
wiring `farm-store.tsx`'s Context provider to actually call these functions
instead of `localStorage` (Phase 6 — needs Phase 4's onboarding to exist
first, so a signed-in user has a real farm row to load); the two remaining
`localStorage` silos (audit trace, peer review — `supabase/README.md`
flags these as a Phase 16 follow-up, out of Phase 3's farm-model scope).
**Cannot be verified against a live database in this environment** (no
Supabase project — same Phase 2 credential blocker) — the query functions
compile and typecheck against `@supabase/ssr`'s types but have not run
against real Postgres; this is a real, open verification gap until a
project exists, called out here rather than silently assumed correct.

**Quality checks**: 12 new tests; 61/61 test files, 902/902 tests passing.
`npm run typecheck` clean, `npm run lint` clean, `npm run build` clean (30
routes, unchanged from Phase 2 — this phase added no new routes).

Status: **schema and adapters complete; live-database verification blocked on real Supabase credentials (documented, not fabricated); farm-store wiring deferred to Phase 6.**

---

## Phase 4 — farm onboarding

**Route**: `/onboarding` (`src/app/onboarding/`) — its own minimal layout
(`BrandMark` only, no `AppShell`/sidebar; `BrandMark` extracted out of the
`(auth)` layout so the two chrome-free entry points share one component
instead of two copies of the same markup). A signed-up farmer with no farm
row is sent here from `(app)/layout.tsx`'s new check (only active once
Supabase is configured — today's behaviour is unchanged); a farmer who
already has a farm is redirected straight to `/dashboard` instead of
re-onboarding.

**Six steps, one merged with the brief's list**: Farm, Fields (+ field
use — folded together rather than asked twice, since `Field.plannedUse`
is the one property both brief steps describe and CLAUDE.md's "enter
once" rule forbids capturing the same fact via two separate screens),
Soil (optional), Livestock, Housing, Financial assumptions. Local
component step-state, not URL-per-step — each step's data is written to
Supabase as soon as it's submitted (via new Server Actions,
`src/app/actions/onboarding.ts`), so leaving partway through doesn't lose
progress; only "which step to show" and the ids needed to thread forward
live in client state. Fields/Livestock/Housing/Soil are explicitly
skippable ("Continue" without adding anything) — Phase 4's "do not require
every value before continuing."

**New persistence functions** (`src/lib/farm-data/`): `livestock.ts`,
`housing.ts`, `financial-assumptions.ts`, `soil.ts` — the last one is the
one worth flagging: `addSoilTestToField` calls the *exact same*
`src/domain/nutrients.ts` P/K-Index classification functions (including
the statutory-boundary conservative-treatment handling)
`farm-store.tsx`'s mock-mode `addSoilTest` action already uses, so a real
lab result is classified identically whether entered through onboarding
or the existing Soil screen once Phase 6 wires that screen to the same
function — one classification path, not two that could quietly diverge.

**No invented numbers in the financial-assumptions step**: of the 5
`FinancialAssumption` keys, only `fertiliser_price_eur_per_t` has a real
sourced default in this codebase (`src/domain/market.ts`'s
`CSO_COMPOUND_18_6_12`, via the already-exported `latestPoint()`) — shown
prefilled and labelled "Prefilled from CSO reference, \<month\> — edit to
use your own price." The other four (concentrate feed, contractor silage,
cattle sale €/kg carcass, fuel) have no sourced series anywhere in this
app yet, so they start genuinely blank with "No public reference price
available yet," not a guessed placeholder — a left-blank field is never
persisted (stays `UNAVAILABLE`, not a fabricated `0`).

**New reference data**: `src/lib/irish-counties.ts` — the 26 counties of
the Republic with an approximate county-town centroid, used only as a
farm's starting `location.centroid` before any field is mapped (same "no
live geocoding yet, placed at a placeholder centroid" pattern
`farm-store.tsx`'s existing `addField` already uses for new fields) — the
UI says "approximate" rather than implying a precise farm position. This
is public geography, not an invented agronomic/regulatory/financial
figure, so it isn't the class of number CLAUDE.md's rule targets. 2 new
tests confirm all 26 counties are present, no duplicates, and every
centroid actually falls within Ireland's real bounding box.

**Deliberately not built this phase**: real field-boundary drawing inside
the wizard (onboarding's Fields step is manual name/area/use entry only —
the existing Mapbox draw tool on the Fields screen is reused after
onboarding rather than rebuilt a second time inside it, per CLAUDE.md's
"never create a visually similar duplicate of an existing component");
linking a livestock group to a shed during onboarding (brief's step order
puts Livestock before Housing, so no shed exists yet to link to — done
afterward on the existing Livestock/Housing screens, same as every other
"edit this later" path Phase 18 covers). **Still not visible on the
dashboard after finishing** — onboarding writes real rows via the Phase 3
adapters, but `FarmProvider` doesn't read them yet (Phase 6); a farmer who
completes onboarding today (once Supabase exists) lands on a `/dashboard`
that still shows the Phase 1 mock farm, not their own new one. Flagged
here rather than left to be discovered as a surprise gap.

**Quality checks**: 14 new tests (12 mapper tests carried from Phase 3 are
unaffected; +2 for `irish-counties.ts`); 62/62 test files, 904/904 tests
passing. `npm run typecheck` clean, `npm run lint` clean, `npm run build`
clean (31 routes, `/onboarding` new). Not verified against a live
Supabase project — same documented blocker as Phases 2/3.

Status: **onboarding UI and real writes complete; not yet visible downstream (Phase 6); live-database verification still blocked on Supabase credentials.**

---

## Phase 6 — single farm source of truth (core entities)

Closes the exact gap Phase 4 ended on: `(app)/layout.tsx` now fetches the
real farm/fields/livestock/housing/slurry rows server-side (when Supabase
is configured) and hands them to `FarmProvider` as `initialState`, and
every `farm-store.tsx` mutation writes through to Postgres instead of only
`localStorage`. A farmer who signs up, completes onboarding and lands on
`/dashboard` now sees their own real farm, not the Phase 1 mock one — the
gap flagged at the end of the Phase 4 entry above.

**Two-mode `FarmProvider`, not a rewrite**: `remote?: boolean` +
`initialState?: FarmState` props, both optional and both unused by every
existing screen and test (`<FarmProvider>` with no props still behaves
exactly as before — verified: all 904 existing tests pass unmodified,
including the 3 that mount `<FarmProvider>` directly). Real mode skips the
localStorage rehydration/persist effects entirely (nothing to rehydrate —
the server already provided real data) and adds one thing per mutation:
after the existing local `setState` call (same logic as mock mode, so the
UI still responds synchronously), a new `persistRemote()` helper fires the
matching `src/app/actions/farm.ts` Server Action.

**Deliberate tradeoff, documented in `farm-store.tsx`'s own comments**:
`persistRemote` is fire-and-forget, not awaited by the mutation itself. A
failed write logs to the console and leaves local state ahead of the
database until the next full reload re-fetches `initialState` — there is
no optimistic-UI rollback yet. This was a conscious choice over making
every mutation async-and-awaited throughout the app (which would ripple
into every calling component's event handlers and loading states) for a
V1 pass that can't be verified against a live database anyway; a proper
awaited-with-pending/error-UI version is future work, not silently
forgotten (flagged here and in Phase 19's error-state audit).

**The two creates are the exception — awaited, not fire-and-forget**:
`addField` and `addLivestockGroup` now return `Promise<Field>`/
`Promise<LivestockGroup>` instead of a synchronous value, because a
locally client-generated id would not match the real Postgres-generated
id — a farmer adding a field and immediately having it auto-selected (the
Fields screen's existing UX) needs the *real* id. Both call sites
(`(app)/fields/page.tsx`, `(app)/livestock/page.tsx`) updated to `await`
them; no other behaviour change. Every other mutation (`updateFarmProfile`,
`setFieldBoundary`, `updateFieldIndex`, `addSoilTest`,
`updateFieldCommonageStatus`, `updateFieldWaterBufferContext`,
`updateSlurryApplicationMethod`) updates an *existing* id, so this
problem doesn't apply to them.

**New**: `src/app/actions/farm.ts` (real-mode Server Actions, one per
`FarmActions` method) and `src/lib/farm-data/slurry.ts`
(`listSlurryAllocationsForFarm`, `updateSlurryApplicationMethod` — the
last farm-data module Phase 3/4 hadn't needed yet). `fields.ts` gained
`updateFieldIndex`/`updateFieldCommonageStatus`/`updateFieldWaterBufferContext`,
each mirroring `farm-store.tsx`'s mock-mode logic exactly (fetch the
current row, `farmerAdjust()` it, write back) rather than reimplementing
the provenance-chaining rule a second time.

**What this does *not* yet cover** — matches the Phase 1 audit's own
finding that these are separately-mock, not farm-model gaps: nutrient
plans, silage plans, spreading scores, most finance lines, market display
rows, alerts and dashboard timeline still come from `src/data/mock-farm.ts`
or partial real domain-engine calculations layered on top of it (Phases
8–15's job, unchanged by this phase). Screens that already computed live
from `useFields()`/`useLivestockGroups()`/etc. (Nutrients' `calculateNutrientPlan`,
Input Planner's real aggregation, Finance's real slurry-value calc) should
now automatically reflect real farm data once Supabase is live, without
needing separate wiring — they were already reading the connected store,
not a second copy — but this has not been confirmed against a live
project and should be spot-checked once one exists. `HousingRow`'s
`slurryEstimate` stays the same mock-tagged placeholder onboarding already
used (Phase 4) — the real excretion-coefficient blocker is unchanged.

**Quality checks**: no new test files (this phase is wiring, not new pure
logic — the mapper/adapter logic it uses was already tested in Phase 3);
62/62 test files, 904/904 tests still passing (confirms mock mode is
byte-for-byte behaviourally unchanged). `npm run typecheck` clean,
`npm run lint` clean (two warnings surfaced and fixed along the way — an
unnecessary eslint-disable, and a `useMemo` missing-dependency on the new
`persistRemote` helper, fixed by wrapping it in `useCallback`).
`npm run build` clean, 31 routes unchanged, still all static (○) — real
mode's extra server-side data fetching only activates when
`isSupabaseConfigured()` is true, so it has zero effect on today's build
or bundle. Not verified against a live Supabase project — same documented
blocker as Phases 2–4.

Status: **core-entity wiring complete (farm/fields/livestock/housing/slurry read+write); domain-engine/display-only screens' remaining mock data is Phases 8–15's separate, already-tracked scope; live-database verification still blocked on Supabase credentials.**

---
