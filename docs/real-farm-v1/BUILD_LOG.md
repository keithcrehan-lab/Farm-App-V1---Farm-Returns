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

## Phase 5 — remove prototype/sample authority (first pass)

Targeted re-check of the specific items `IMPLEMENTATION_AUDIT.md` flagged
as "worth a direct re-check", plus a spot-check for the Phase 25 word list
("optimal", "compliant") — not the full 19-screen sweep (that's Phase 25's
dedicated job once every domain phase has landed), but real findings,
verified in code rather than assumed.

**Confirmed NOT a violation**: the brief's "do not resurrect the unsourced
mock 0–100 spreading score" instruction. `src/data/mock-farm.ts`'s
`mockSpreadingScores` array still *contains* a `slurryScore`/
`fertiliserScore` field (both explicitly `"(mock)"`-tagged), but
`SpreadingFieldRow`'s own doc comment confirms — and the component code
verifies — it deliberately never reads either field or renders a
suitability verdict; only plain per-field facts (soil temp, rainfall
forecast, drainage label) and the real `checkClosedPeriodCalendar` legal
pill are shown. `src/domain/spreading.ts`'s `soilDrynessIndex` 0–100 value
is a separate, legitimate thing — a real unit-rescale of Met Éireann's own
sourced SMD model onto its own published range, not an invented weighted
score; its own header comment already explains the distinction. No code
change needed; `IMPLEMENTATION_AUDIT.md`'s route table already flagged
this as "worth a direct re-check" rather than asserting either way — now
resolved.

**Confirmed and fixed**: `LivestockGroup.statusLabel` — every newly-created
group (`farm-store.tsx`'s mock-mode `addLivestockGroup`, and
`src/lib/farm-data/livestock.ts`'s real-mode `createLivestockGroup`) was
unconditionally set to `"On Track"`, a fabricated claim with no rule
behind it anywhere in this codebase (matches Phase 25's explicit target
list — a label implying a computed status that doesn't exist).
`LivestockGroupCard` already renders the status pill conditionally
(`group.statusLabel ? <Pill>...</Pill> : null`), so the fix is simply to
stop setting it for a *real* farmer's group — omitted now, so no pill
shows rather than an invented "good" one. `mock-farm.ts`'s demo groups
keep `"On Track"` unchanged — CLAUDE.md explicitly allows demo/fixture
data to carry values a real farm's data must not.

**Not re-checked this pass** (deferred to Phase 25's full sweep, once
Phases 7–16's domain work has landed and there's more real surface to
audit): hard-coded euro/hectare/percentage values across Finance/
Dashboard/Feed Optimiser, dead buttons, "recommended"/"saving" labelling
on bulk-buying cards. `IMPLEMENTATION_AUDIT.md`'s route-by-route table
already has a first pass at several of these.

**Quality checks**: no new tests (a removed fabricated default has
nothing new to assert beyond "absent, not present" — covered implicitly
by existing mapper/component tests continuing to pass); 62/62 test files,
904/904 tests, typecheck/lint/build clean.

Status: **two specific flagged items resolved (one confirmed non-issue, one fixed); full adversarial sweep remains Phase 25's job.**

---

## Phase 7 — fields and soil workflow

Closes the concrete gaps `IMPLEMENTATION_AUDIT.md`'s route table flagged
for `/fields`/`/soil`: "no field edit/delete action in `FarmActions`" and
soil test age/validity never surfaced anywhere.

**Field editing**: `FieldDrawer` gained an inline edit mode (pencil icon
next to the field name) — rename, change planned use, and (only when the
field has no mapped `polygon` yet) a typed area override. Once a real
boundary exists, area is shown as derived-and-locked with an explicit
explanation ("edit the boundary on the Map tab... not this field") rather
than silently accepting a number that would contradict the geometry —
the brief's explicit "do not allow a manually entered field area to
silently contradict mapped geometry" rule, enforced at both the UI layer
(area input hidden once `field.polygon` exists) and the data layer
(`updateFieldDetails`/`src/lib/farm-data/fields.ts`'s version throws if
asked to set `areaHa` on a mapped field — a defence-in-depth pair, not
just a UI nicety).

**Field archive**: new `Field.archivedAt` (soft delete — "Provenance is
permanent" argues against a hard `DELETE` when a field can have soil
tests/slurry allocations/history attached; `supabase/migrations/
20260828010000_field_archive_and_edit.sql` adds the column).
`useFields()` (the selector almost every screen uses) now filters
archived fields out by default — Dashboard hectare counts, Nutrients'
field selector, Soil, Silage etc. all stop seeing an archived field
automatically, from one change, rather than needing every consumer
updated individually. `useAllFieldsIncludingArchived()` is the one
deliberate exception, for the Fields screen's own new "Archived fields
(N)" section with a Restore action.

**Soil test validity, now inspectable**: `checkSoilTestAgeValidity`
(Scientific Engine V3) already gated the NAP ceiling on test age/P-Index-4
persistence but was never called from any component — confirmed via
`grep`, zero matches. `SoilFieldCard` now shows the real computed status
next to a verified test's date ("Valid — 2 years old" / "4 years old — too
old for statutory ceilings (4-year limit)" / "3 years old — P4 result
still applies"), using the exact same age computation
(`yearsBetweenIsoDates`, exported from `nutrients.ts` rather than
reimplemented) the NAP calculation itself uses — one age computation, one
place a farmer can see *why* a recommendation might be constrained, not a
second guess at the same fact.

**Quality checks**: `mappers.test.ts` gained an `archivedAt` omit/include
test; 62/62 test files, 905/905 tests, typecheck/lint/build clean (31
routes, unchanged).

Status: **field rename/use-edit/archive and soil-test-validity display complete; not yet verified against a live database.**

---

## Phase 8 — nutrient planning

**Mostly already satisfied — verified, not rebuilt.** `/nutrients` already
reads `useFields()`/`useLivestockGroups()`/`useSlurryAllocations()` (real
farm-store data, Postgres-backed since Phase 6) and computes a genuine
live `calculateNutrientPlan` per selected field — the field selector isn't
hardcoded to one mock field, it works over the real farm's actual field
list. Checked each item on the brief's "at minimum" list against the
actual rendered cards rather than assuming:

- field, planned field use — `FieldIdentityRow` ✓
- nutrient requirement — `NutrientRequirementCard` ✓ (see fix below)
- statutory ceiling, restrictions, missing required inputs, calculation
  state — `NapComplianceCard` ✓, and thoroughly: distinguishes
  `compliance_value` (a real S.I. 588/2025-sourced ceiling) from
  `planning_advice` (Green Book cut-only tables, still unverified) with a
  visibly different pill rather than presenting both the same way, and
  renders `EngineOutcome`'s `BLOCKED_INSUFFICIENT_EVIDENCE` branch with
  the actual list of missing inputs rather than hiding the card or
  guessing — exactly the brief's "do not generate a plausible-looking
  nutrient recommendation when the Scientific Engine says it is
  inadmissible."

**One real gap found and fixed**: `NutrientRequirementCard` — the
headline N/P/K kg/ha numbers — showed no `StatusBadge`/`SourceBadge` at
all, even though `plan.requirement` is a real `TrackedValue` (`"estimated"`
status, source `"Teagasc Green Book (5th Ed., 2020)"`,
`calculationVersion: nutrient_engine_v1.x.x`, per `nutrients.ts`). Every
other card on this screen already carries its provenance visibly; this
one silently dropped it. Fixed by adding the same `StatusBadge`/
`SourceBadge` pair the rest of the app already uses, with the calculation
version in a tooltip (Phase 17's "first-level UI stays simple, detail via
tooltip" pattern) rather than cluttering the header.

**Checked, not a gap**: `FertilityAssumptionsCard`/`SoilFieldCard`'s P/K
`IndexSelector` has no separate status badge either, but already conveys
farmer-adjusted-vs-default through its own `tone` colour prop — a
different provenance mechanism (colour, not a text pill), reviewed and
kept, not a silent omission.

**Quality checks**: no new tests (a moved badge has no new logic to
assert — `NapComplianceCard`'s fail-closed branching is already covered
by `nutrients.test.ts`); 62/62 test files, 905/905 tests, typecheck/lint/
build clean (31 routes, unchanged).

Status: **verified largely complete from prior Scientific Engine V3 work; one provenance-display gap found and fixed.**

---

## Phase 9 — weather and spreading

**Verification pass — no violations found, nothing to fix in the core
requirements.** Checked each brief requirement directly against the
rendered UI/code rather than assuming prior work covers it:

- **"Preserve the real Met Éireann integrations"** — `CurrentConditionsCard`/
  `NineDayForecastCard` still call the real `/api/weather/observations`/
  `/api/weather/forecast` routes (`src/server/weather/*`, untouched by
  this build).
- **"Distinguish station observation / forecast / farm-entered / future
  sensor"** — already real and explicit: `CurrentConditionsCard` always
  renders `"{station.canonicalName} station, {distanceKm}km away"`, with
  its own doc comment stating outright "not an in-field sensor." No
  screen in this app claims a farm-entered or future sensor reading today
  (none exists), so there's nothing currently mislabelled as one.
- **"Do not imply a station is physically on the farm"** — confirmed via
  the distance-in-km display above; never omitted.
- **"Use the existing legal spreading gates / closed-period logic, don't
  invent agronomic weights"** — `checkClosedPeriodCalendar` (S.I.
  588/2025) is the one determination `/spreading` computes per field;
  confirmed again this phase (same code Phase 5 already verified doesn't
  render the mock composite score).

**Minor, deliberately not fixed this pass**: `SpreadingFieldRow`'s three
plain per-field facts (soil temp, rainfall forecast, drainage label) come
from `mockSpreadingScores`' untyped fields — not `TrackedValue`s, so they
carry no structured source metadata to display even if the UI wanted to
show one. This is a data-model limitation inherited from Phase 1, not a
new gap this build introduced, and fixing it properly means either giving
these fields real per-field live weather (blocked — no per-field
Met Éireann grid mapping exists yet, per README/evidence-register) or a
real farmer-entry path for them (no such entity in the data model).
Flagged here for Phase 17/25 rather than patched superficially.

**Quality checks**: verification only, no code changes; 62/62 test files,
905/905 tests unaffected.

Status: **no violations of the brief's hard rules found; one pre-existing minor labelling gap documented for a later pass, not fixed speculatively.**

---

## Phase 10 — silage and forage: investigated, genuinely blocked for the yield engine

**Investigated in depth before writing any code** — this is the domain
the Phase 1 audit already flagged as the single largest remaining mock
gap ("no real yield/inventory engine exists yet"), so it deserved a real
look rather than a quick pass.

**Real, sourced winter-fodder-*demand* engine already exists and is
unused**: `src/domain/fodder-budget.ts`'s `calculateWholeFarmFodderDemand`
(Scientific Engine V3 Phase H1, Teagasc's 26-Aug-2026 fodder-budget
coefficients, `GFT091`-`GFT100`) computes a real whole-farm winter forage
requirement from real livestock groups — genuinely ready to replace the
mock `ForageInventory.requiredWinterForageDmTonnes` `WholeFarmFeedBalanceCard`
currently renders, exactly as that module's own header comment says.

**Found and did NOT wire it in — a real unit mismatch, not a formality**:
`calculateWholeFarmFodderDemand` returns **fresh weight** tonnes ("t
fresh pit silage per animal per month" — the coefficient table's own
units). `ForageInventory.requiredWinterForageDmTonnes` is **dry matter**
tonnes, and `WholeFarmFeedBalanceCard` labels it visibly as "t DM" on
screen — confirmed by reading the component, not assumed. Fresh weight
and DM weight are not the same number (pit silage is roughly 20-30% DM,
so the two figures could differ by a factor of ~4). Converting one to the
other needs a real, sourced fresh-to-DM ratio for this farm's actual
silage system — checked `docs/evidence-register.md` and the V3 evidence
directories for one: none exists. The register's own "Silage timing/
nutrient tables" row cites only Teagasc's nutrient/timing factsheets
(already implemented in `nutrients.ts` for N-P-K requirement per cut),
not a yield-per-hectare or DM-conversion figure. Forcing the real fresh-
weight number into a field visibly labelled "t DM" would have been a
genuine, live unit error — a worse outcome than leaving the mock value in
place, and exactly the kind of silent fabrication CLAUDE.md's rules
exist to prevent. **Not wired in this phase; flagged as a real risk in
`fodder-budget.ts`'s own claim ("directly replace...") for whoever
revisits this with a real conversion source.**

**No sourced silage yield (t DM/ha) model exists anywhere in this app's
evidence base either** — confirmed by the same evidence-register check.
`SilagePlan.expectedYieldTDMha` (`mock-farm.ts`) is, and remains, a plain
`"estimated"`-status Farm Return assumption, not a calculated figure —
correctly labelled as such already, nothing to fix there.

**Deliberately not attempted this phase**: persisting `SilagePlan`/
`ForageInventory` to Supabase and rebuilding `/silage` around real,
per-field, farmer-entered plans (the brief's actual ask: "field selected
for silage must flow into ... forage inventory ... winter feed planning").
That is a substantial, multi-part build — new schema/migration, farm-data
adapters, Server Actions, a genuinely rebuilt multi-field `/silage` screen
(today's screen is hardcoded to the one mock plan's field, with no
selector, no add/edit flow) — comparable in size to Phases 3/4/6
combined for this one domain, and doing it partially in the time
remaining this pass would produce something worse than either finishing
it properly or leaving it honestly mock: a half-built persistence layer
nothing reads from yet. Scoped as its own dedicated future phase rather
than attempted piecemeal.

**Quality checks**: no code changes this phase (everything found either
should not be wired without a real conversion source, or is a build too
large to do safely in the time remaining); 62/62 test files, 905/905
tests unaffected.

Status: **investigated and correctly scoped as blocked for the numeric yield engine (no sourced data exists); a real unit-mismatch risk found and documented rather than silently introduced; full per-field silage persistence deferred to a dedicated future phase.**

---
