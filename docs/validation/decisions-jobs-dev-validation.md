# `decisions`/`jobs` — real Dev database validation

**Date:** 2026-09-02 (Phase A, decisions/jobs real Dev-database validation,
continuing from `farm-return-next` commit `3ef77d9`).

**Dev environment:** Supabase CLI, already authenticated in the user's own
terminal (this session never read or printed the token). Project:
`Farm Return V1 Dev` (ref `whevugeisqlpfnrugfsd`, `eu-west-1`,
`ACTIVE_HEALTHY`, confirmed via `supabase projects list`). Linked and
confirmed via `supabase migration list --linked` (local = remote for every
migration, no drift) and `supabase db push --dry-run` (`upToDate: true`).

**Migrations covered:**

| Migration | Status before this phase | Status after this phase |
|---|---|---|
| `20260829000000_orchestration_foundation.sql` | `APPLIED_DEV` | `VALIDATED_DEV` |
| `20260829010000_decisions_jobs_client_access.sql` | `APPLIED_DEV` | `VALIDATED_DEV` |
| `20260829020000_jobs_weight_observation_reference.sql` | `APPLIED_DEV` | `VALIDATED_DEV` |

No new migration was required — all three were already correctly applied
to Dev (confirmed live by the product owner, 2026-09-01, and re-confirmed
by `supabase migration list` this session). This phase's own work was
entirely: (1) fixing `supabase/validation/decisions_jobs_rls_validation.sql`
itself, which had never actually produced a visible result when run via
`supabase db query` (see below), and (2) extending it to cover two real
invariants it had never touched, then running it for real and promoting
status based on the genuine result.

## Validator fixes (real, found by attempting a real run — not decorative)

1. **The script's every result line was `RAISE NOTICE`.** `supabase db
   query`'s Management-API execution path does not stream `NOTICE` output
   back — only final query results. The very first real run against Dev
   completed with zero errors but returned zero rows: a validator that had
   never actually produced visible output through this invocation path,
   only when pasted into the Supabase Dashboard's own SQL Editor console
   (which does render `NOTICE`). Fixed by converting every `raise notice`
   call to `insert into validation_results (line) values (...)` — a
   session-temporary results table, read back via a real `select` before
   the final `rollback` — exactly mirroring
   `supabase/validation/job_sessions_actuals_validation.sql`'s own
   already-correct pattern (that script was written later, in the prior
   Job Session Dev-validation phase, and had already solved this same
   problem; this older script had never been migrated to match). No test
   logic changed.
2. **The results table's own backing sequence needed an explicit grant.**
   `grant all on validation_results to authenticated, anon` does not
   extend to the table's own `serial` sequence — the very first `insert`
   while impersonating `authenticated` raised `permission denied for
   sequence validation_results_seq_seq`. Fixed with an explicit `grant
   usage, select on sequence validation_results_seq_seq to authenticated,
   anon`, matching the sibling script's own already-correct version of
   this line.
3. **Test 3d was silently skipping on this project even though a genuine,
   eligible Farm B existed.** The original farm-selection query picked
   the *earliest* other-owner farm, full stop — which on this project
   happened to be a farm with no field, leaving Test 3d's own
   cross-reference check permanently un-run (a SKIP, not a PASS). Fixed
   by preferring an other-owner farm that already has a real field,
   falling back to the earliest one only if none do — a real-data
   preference, not fabrication: it only changes which of the project's
   own already-existing farms gets used, never creates one. On this
   project, this let Test 3d genuinely PASS instead of SKIP.
4. **Two real invariants had never been exercised by any version of this
   script.** `20260829020000_jobs_weight_observation_reference.sql`'s own
   status comment named exactly this gap: its two CHECK constraints
   (`jobs_confirmed_weight_observation_requires_reference`,
   `jobs_weight_observation_id_matches_job_type`) and its extension of
   `jobs_check_same_farm` (cross-farm `weight_observation_id` rejection)
   had no live coverage. Neither `livestock_individuals` nor
   `livestock_weight_observations` had any real row in this Dev project
   to test against, so the script's own setup section now creates one
   structurally valid, explicitly-labelled fixture row per farm
   (`category: 'calf'`, `source: 'validation_probe'` — never a
   scientific/production value, the same category of thing the script's
   pre-existing `decisions`/`jobs` setup rows already are), rolled back
   with everything else at the end. New Tests 9a-9d (below) exercise all
   three invariants plus a positive control.

## Live result (`supabase db query -f
supabase/validation/decisions_jobs_rls_validation.sql --linked
--project-ref whevugeisqlpfnrugfsd`)

**29/29 checks: PASS. 0 FAIL. 0 SKIP.**

Farm A = `KC` (`3dec4855-a5dd-4948-9031-4eec938d390a`, owner
`669af686-5d81-436e-9ed7-3009b3256400`). Farm B = `E2E Test Farm
1787934894417` (`2cb08df7-2a16-444b-ad71-a3be4aa1569e`, owner
`3aba1c6b-db77-4fcb-9a3c-de3dac5c9f94`, has a real field, so Test 3d ran
for real rather than skipping).

| Test | What it proves | Result |
|---|---|---|
| 1 | User A can select their own farm's decisions/jobs | PASS |
| 2a/2b | User A sees zero rows for Farm B's decisions/jobs | PASS |
| 3a | User A cannot insert a decision against Farm B | PASS |
| 4a | User A can insert a decision for their own farm (positive control) | PASS |
| 5a/5b | User A cannot update/delete their own decisions row (no grant) | PASS |
| 4b | User A can insert a job for their own farm, referencing their own decision (positive control) | PASS |
| 3b | User A cannot insert a job against Farm B, even with a real own-farm decision | PASS |
| 3c | User A cannot insert a job for their own farm referencing Farm B's decision (`jobs_check_same_farm`) | PASS |
| 3d | User A cannot insert a decision for their own farm referencing Farm B's field (`decisions_check_field_same_farm`) | PASS |
| 6a/6b | User A cannot update/delete their own jobs row (no grant) | PASS |
| 9a | A confirmed `record_weight_observation` job cannot omit `weight_observation_id` | PASS |
| 9b | A non-`record_weight_observation` job cannot carry a real `weight_observation_id` | PASS |
| 9c | The legitimate shape inserts successfully (positive control) | PASS |
| 9d | A job cannot reference another farm's `weight_observation_id` (`jobs_check_same_farm` extension) | PASS |
| 7a/7b | User B cannot see what User A created for Farm A | PASS |
| 8a-8d | `anon` has zero table/column privileges on `decisions`/`jobs` | PASS |
| 8e/8f | Anonymous select/insert both fail in practice | PASS |

Rollback verified: a post-run query for any row matching
`calculation_kind`/`job_type = 'validation_probe'`, or
`livestock_individuals.category = 'calf'`, or
`livestock_weight_observations.source = 'validation_probe'` returns zero
rows on all four — nothing this script created or attempted persisted.

## Status

**`decisions`/`jobs` persistence layer: `VALIDATED_DEV`.** All three
migrations' own status comments updated from `APPLIED_DEV` to
`VALIDATED_DEV`, reflecting this genuine, live result — not merely code
review.

## Codex audit

See `docs/overnight/audits/decisions-jobs-dev-validation-codex-audit-round{N}.md`
for the full transcript history and `docs/farm-return-next/BUILD_STATE.json`'s
`last_codex_audit` for the current round pointer.
