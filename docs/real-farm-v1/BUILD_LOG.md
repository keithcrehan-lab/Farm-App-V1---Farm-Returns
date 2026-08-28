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
