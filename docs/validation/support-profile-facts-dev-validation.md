# `support_profile_facts` — real Dev database validation

Farm Return Next, Supports Intelligence + Farm Strategy phase, 2026-09-04.
Real Supabase CLI access to `Farm Return V1 Dev` (`whevugeisqlpfnrugfsd`,
already linked from a prior session) was used to apply and live-validate
`supabase/migrations/20260904000000_support_profile_facts.sql` — never
production.

## What was done

1. `supabase migration list` confirmed every prior migration in this
   project was already `local == remote` (applied) and only
   `20260904000000_support_profile_facts.sql` was pending.
2. `supabase db push` applied it for real.
3. `supabase/validation/support_profile_facts_validation.sql` — a new
   script following `decisions_jobs_rls_validation.sql`'s own established
   technique exactly (a session-temporary `validation_results` table
   granted to `authenticated`/`anon` so results survive a role switch,
   real `set local role authenticated` + `request.jwt.claims`
   impersonation of a real `auth.uid()`, everything wrapped in one
   transaction with an unconditional `ROLLBACK` at the end) — run via
   `supabase db query -f ... --linked`.

## Live result — 11/11 PASS, 0 FAIL, 0 SKIP

This project currently holds **two** real farms/users (`KC` and a second
`E2E Test Farm...`), one more than `BUILD_STATE.json`'s older note
recorded — so the real two-tenant cross-farm isolation test (Test 5) ran
for real rather than needing the documented single-farm SKIP path.

| # | Check | Result |
|---|---|---|
| 1a | `support_profile_facts` table exists | PASS |
| 1b | RLS is enabled | PASS |
| 2a | `authenticated` has exactly select/insert/update/delete | PASS |
| 2b | `anon` has zero grants | PASS |
| 3 | An unregistered `key` is rejected by the database CHECK constraint | PASS |
| 4a | The real farm owner can insert its own row | PASS |
| 4b | Re-answering the same key upserts (one row, latest value) — matches `upsertSupportProfileFact`'s own contract | PASS |
| 5a | Farm A sees zero `support_profile_facts` rows for Farm B | PASS |
| 5b | Farm A cannot insert a row for Farm B (RLS `with check` rejects it) | PASS |

A follow-up `select count(*) from public.support_profile_facts` (outside
the validation script, after it completed) returned `0` — confirming the
validation transaction's own `ROLLBACK` left no residual data in this
real project, exactly as designed.

## What this does NOT cover (disclosed, not skipped silently)

- No application-layer (Next.js) round-trip test — `src/lib/farm-data/support-profile.ts`'s
  two functions are exercised only by this SQL-level validation and by
  `src/domain/support-profile.test.ts`'s pure-function unit tests, not by
  an end-to-end authenticated browser session (no such session is
  reachable in this environment — the same disclosed limitation every
  prior Dev-validation phase in this repo has recorded for itself).
- `SchemeVersion`/`EligibilityAssessment`/`StrategyComparison` are not
  persisted anywhere yet (`SUPPORTS_STRATEGY_CONTRACT.md`'s own "not yet
  built" section) — there is no second migration to validate this
  session.
