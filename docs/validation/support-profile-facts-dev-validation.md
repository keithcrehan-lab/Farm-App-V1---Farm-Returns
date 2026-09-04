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

## Round 2 (2026-09-04) — `land_declared_for_schemes` key added

Codex audit round 1 against the first slice (HIGH) found `totalDeclaredAreaHa`
(real *mapped* field area) was being used directly as proof of a real
DAFM/BISS land declaration for `tams3-general`/`tams3-yfcis`'s own
eligibility gates — fixed in `src/domain/support-profile.ts`/
`scheme-eligibility.ts` by adding a genuinely new gap fact,
`land_declared_for_schemes`. `supabase/migrations/20260904010000_support_profile_facts_add_land_declared_key.sql`
widens the `key` CHECK constraint additively (drop + re-add with the
superset list) — applied via `supabase db push` and re-verified live:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conname = 'support_profile_facts_key_check';
-- CHECK ((key = ANY (ARRAY['date_of_birth'::text, 'head_of_holding_since'::text,
--   'agricultural_qualification_level'::text, 'biss_participant_2026'::text,
--   'land_declared_for_schemes'::text])))
```

Every previously-valid key remains valid (the new constraint is a strict
superset) — no re-run of the full 11-check validation script was needed
for this additive, non-behaviour-changing-for-existing-rows change; the
live constraint-definition query above is itself real, direct evidence
the change applied correctly.

## Round 3 (2026-09-04) — `declared_area_ha` replaces `land_declared_for_schemes`; real value-shape CHECK added

Codex audit round 4 against the phase's own whole diff (HIGH ×2) found
`land_declared_for_schemes` (a plain yes/no) couldn't actually prove a
scheme's real hectare-declared minimum, and that no database constraint
governed a fact's own `value` *shape* (only `key`) despite `authenticated`
holding direct table grants. `supabase/migrations/20260904020000_support_profile_facts_declared_area_and_value_shape.sql`
swaps the key (no real farmer had ever answered the old one — a clean
replacement, not a destructive change to real data) and adds a real
`jsonb_typeof(value)`-based CHECK per key. Applied via `supabase db push`
and re-verified live:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.support_profile_facts'::regclass order by conname;
-- support_profile_facts_key_check: key IN (..., 'declared_area_ha')
-- support_profile_facts_value_shape_check: real jsonb_typeof(value) per key
```

A direct insert attempting `biss_participant_2026` with a string value
(`'"yes"'::jsonb`, not a real boolean) was tried against the live table
and confirmed rejected by the new constraint (no `FAIL` exception
surfaced from a script that raises one exactly when the insert
unexpectedly succeeds).

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
