# Real Mode Completion Phase 30 — Supabase integration audit

Audited by reading every migration, adapter, and Server Action written
this session (and the prior Real Farm V1 session), not just described.
One finding this same audit surfaced a live, critical bug — see
`BUILD_LOG.md` Phase 29 — which is the strongest evidence this audit is
grounded in the real code, not a checklist exercise.

## RLS

Every farm-scoped table (`farms`, `fields`, `housing`, `livestock_groups`,
`slurry_allocations`, `financial_assumptions`, `livestock_individuals`,
`livestock_weight_observations`, `supplier_quotes`) has RLS enabled with
one `for all` policy scoped to `to authenticated` using
`(select auth.uid())` (the initplan-optimised form — see Phase 1). Child
tables check ownership via a `farm_id` subquery against `farms.user_id`
rather than duplicating `user_id` on every row, so a farm can only ever
be re-parented in one place (there is no code path that re-parents a farm
today, but the schema doesn't rely on that being true). `anon` is
explicitly revoked on every table; `authenticated` is granted exactly
SELECT/INSERT/UPDATE/DELETE, never TRUNCATE/REFERENCES/TRIGGER.

**Not independently verified against the live schema** — same caveat as
every migration this session: no Supabase CLI/introspection tooling is
available in this environment. Phase 29's E2E run is the closest thing to
a real check, and it already found one real gap (a pending migration);
worth a `supabase db diff` or dashboard-side "run Security Advisor" pass
once CLI/dashboard access is available to close this out properly.

## User ownership / cross-account isolation

Every `farm-data/*.ts` query function re-derives the current user from
`supabase.auth.getUser()` server-side rather than trusting a
caller-supplied id (`src/lib/farm-data/farms.ts`'s own header comment,
following Next.js's Data Security guide). This is defence in depth on top
of RLS, not a replacement for it — the actual cross-account boundary is
enforced at the database layer regardless of what the application code
does or forgets to check. **Not tested with two real accounts this
session** (would need two real Playwright sessions against the live
project) — `REAL_MODE_AUDIT_CHECKLIST`-style manual verification (two
accounts, confirm account B cannot see account A's farm under any URL) is
recommended once the pending migrations are applied and the E2E suite can
run to completion.

## Awaited writes vs. optimistic updates

Two patterns exist, deliberately:

- **Onboarding** (`OnboardingWizard.tsx`): every write is `await`ed
  before the UI advances — Saving…/Saved/Failed to save states are real,
  driven by whether the Server Action actually returned success (Phase
  2/3, regression-tested).
- **Everywhere else** (`farm-store.tsx`'s "remote mode"): fire-and-forget
  — local state updates synchronously (identical logic to mock mode) and
  the Server Action fires afterward via `persistRemote()`, not awaited by
  the caller. **This is a real, documented limitation, not an oversight**:
  a failed write here logs to the console and leaves local state ahead of
  the database until the next full reload re-fetches `initialState`. No
  rollback UI exists for this path. Flagged in `farm-store.tsx`'s own
  header comment and repeated here because it's the single largest
  "close this properly" item this audit found — every mutation on
  Fields/Livestock/Housing/Soil after the initial create goes through
  this fire-and-forget path.

## Rehydration

`(app)/layout.tsx` re-fetches the real farm/fields/livestock/housing/
slurry server-side on every navigation into the `(app)` route group —
there is no client-side cache that could go stale across a real reload
(each page load is a fresh server render). Within one client-side session,
`farm-store.tsx`'s local state is the source of truth until the next full
navigation/reload; this is consistent with the fire-and-forget tradeoff
above (a failed background write means local state and the database can
disagree until the next reload, not indefinitely).

## Failed-write handling

Onboarding: explicit, tested (Phase 2/3). Everywhere else: `console.error`
only, no user-facing retry/rollback. This is the same gap named above,
restated here because Phase 30 explicitly asks for it.

## Duplicate record creation

The one known historical risk (onboarding's Farm step calling `create`
twice via Back-then-resubmit) was found and fixed with a regression test
in Phase 2/3. No other duplicate-creation risk was found in this audit —
every other "add" action (field, livestock group, housing, individual
animal, supplier quote, financial assumption) is a simple one-shot form
with no revisit-and-resubmit path in the current UI.

## Stale state / race conditions

`farm-store.tsx`'s `useMemo` for actions depends on `state.farm.id`/
`state.farm.ownerName`/`state.farm.location.centroid`/`state.housing`/
`remote`/`persistRemote` — verified via `npm run lint`'s
`react-hooks/exhaustive-deps` rule catching one real gap during this
session (Phase 26, `updateHousing` reading `state.housing` outside the
dependency array) and it being fixed. No other `exhaustive-deps` warnings
exist anywhere in the codebase as of this audit (confirmed: `npm run
lint` is clean). This doesn't prove there is no possible race — two
browser tabs editing the same farm concurrently would still last-write-
win with no conflict detection — but it does mean the known class of
stale-closure bug this rule catches has been swept and fixed, not just
assumed absent.

## Query error handling

Every `farm-data/*.ts` function either `throw error` (letting the
Server Action's `errorResult()` wrapper convert it to a user-facing
message) or, for the two genuinely-new-schema modules
(`individual-animals.ts`, `supplier-quotes.ts`) consumed from server
components, is wrapped in a `try/catch` that fails open to an empty list
rather than crashing the page (Phases 12/20) — the exact pattern that
made `/livestock` and `/finance` resilient to the pending-migration issue
Phase 29 found, while `/onboarding`'s farm creation (no such wrapper, by
necessity — a farm truly can't be created without that column) was not,
and that's exactly where the real failure surfaced.

## Indexes

Every farm-scoped table has an index on its `farm_id` (or `animal_id`
for the weight-observations table) — the column every RLS policy's
subquery and every list query filters on. Not verified against the live
project's actual index usage (would need `pg_stat_user_indexes`, not
available without CLI/dashboard access) — per the brief's own instruction,
not removing anything based on an assumption an empty dev database's
stats would be misleading anyway.

## Summary of real findings from this audit

1. **The fire-and-forget real-mode write path has no user-facing failure
   UI** — the single largest legitimate gap, already documented, not
   silently left out.
2. **Two-account cross-isolation hasn't been manually verified this
   session** — recommended once the pending migrations are applied.
3. **The pending-migration issue Phase 29 found** is itself the most
   concrete "Supabase integration" finding this whole build produced —
   included here for completeness, not just in the build log.
