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

## Round 4 (2026-09-04) — legacy `land_declared_for_schemes` key restored (forward-only correction)

Codex audit round 12 against the phase's own whole diff (CRITICAL) found
that Round 3's `20260904020000` migration narrowed both CHECK
constraints without ever re-admitting `land_declared_for_schemes` — a
constraint narrowing that drops a previously-accepted value is exactly
the drop/replace pattern `AGENTS.md`/`CLAUDE.md`'s forward-only rule
exists to prevent, regardless of whether this specific database
happened to have no affected rows at the time. Not fixed by editing
`20260904020000` itself (already applied to `Farm Return V1 Dev` —
rewriting an applied migration's own SQL is not this repo's correction
path): `supabase/migrations/20260904030000_support_profile_facts_restore_legacy_key.sql`
widens both constraints again, permanently, to accept
`land_declared_for_schemes` (as a boolean) alongside every current key.
Applied via `supabase db push` and re-verified live:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.support_profile_facts'::regclass order by conname;
-- support_profile_facts_key_check: key IN (..., 'declared_area_ha', 'land_declared_for_schemes')
-- support_profile_facts_value_shape_check: 'land_declared_for_schemes' now paired with jsonb_typeof(value) = 'boolean'
```

The application layer still never writes `land_declared_for_schemes`
(`support-profile.ts`'s own registered `SupportProfileFactKey` union is
unchanged) — this migration only restores the database's own willingness
to hold a legacy row using it, matching the same "never actually drop a
previously-accepted value" discipline as `20260904010000`'s own
additive widening.

## Round 5 (2026-09-04) — new genuine gap `holds_annex_j_qualification` added

Codex audit round 12 against the phase's own whole diff (HIGH) found
YFCIS's real Annex J requirement could never actually be satisfied by
`agricultural_qualification_level` alone (round 5's own, deliberate,
correct earlier fix) — leaving the sole `CONFIRMED` scheme unable to
ever progress past `MORE_INFORMATION_REQUIRED`, even once a farmer
answered every gap Farm Return asked for.
`supabase/migrations/20260904040000_support_profile_facts_add_annex_j_key.sql`
widens both constraints additively (the same pattern `20260904010000`
established) to accept a new, genuinely resolvable self-declared fact,
`holds_annex_j_qualification`. Applied via `supabase db push` and
re-verified live:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.support_profile_facts'::regclass order by conname;
-- support_profile_facts_key_check: key IN (..., 'holds_annex_j_qualification')
-- support_profile_facts_value_shape_check: 'holds_annex_j_qualification' paired with jsonb_typeof(value) = 'boolean'
```

## A disclosed, permanent limitation of the `020000`→`030000` sequence (Codex audit round 13, CRITICAL)

Round 12's own `20260904030000` fix (above) restores `land_declared_for_schemes`
acceptance — but round 13 correctly pointed out that this only helps
*after* `20260904020000` (already applied) has itself successfully run.
`020000`'s own `ADD CONSTRAINT` validates every existing row at apply
time — if any row anywhere had `key = 'land_declared_for_schemes'` at
the exact moment `020000` ran, that migration would fail outright, and
neither `030000` nor `040000` would ever get the chance to run at all.
`030000` does not, and structurally cannot, make `020000` itself safe in
the abstract; it can only repair what comes *after* a successful `020000`.

This is a real, honestly-disclosed permanent limitation of this specific
historical migration sequence, not something reachable within the
"never rewrite an already-applied migration's own SQL" discipline this
phase (and every prior one) has held to throughout — the only way to
make `020000` itself unconditionally safe would be to have never
narrowed the constraint destructively in the first place, which cannot
be fixed retroactively without rewriting applied history.

What this session can, and did, verify directly against the one real
environment this migration sequence has ever run against:

```sql
select key, count(*) from public.support_profile_facts group by key order by key;
-- (0 rows) -- no farmer has ever answered ANY fact on this table, on the
-- one real farm this environment holds, as of this check
```

Zero rows exist in this table at all right now, and `docs/farm-return-next/BUILD_STATE.json`'s
own real-farm counts (`docs/real-data/AUTHENTICATED_REAL_DATA_AUDIT.md`)
independently confirm the same real farm had 0 Support Profile facts
recorded throughout this entire phase. No seed/fixture data anywhere in
this repository ever writes `land_declared_for_schemes`, and the key was
introduced (`010000`) and retired (`020000`) within the same session,
before any realistic provisioning path could have a farmer write to it
in between. The theoretical failure mode round 13 correctly identified
has never been, and structurally cannot become, live for `Farm Return V1
Dev` specifically — but it remains a genuine, disclosed design flaw in
this exact migration file sequence that a future fresh-environment
replay assembled differently (e.g. importing pre-existing data before
running these migrations) could still hit. Recorded here rather than
re-claimed as "fixed."

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
