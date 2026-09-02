-- Farm Return Next — GPS Job Session + Confirm Actual contract, schema
-- part 4. Closes the one MEDIUM Codex audit round 5 left open
-- (docs/overnight/audits/gps-job-session-actual-contract-codex-audit-round5.md,
-- `docs/farm-return-next/BLOCKERS.md`'s matching entry): a narrow,
-- same-farm cancellation race where a `job_actuals` insert and the
-- follow-up `job_sessions.status -> confirmed_actual` move were two
-- separate statements/transactions, leaving a real window in which a
-- concurrent cancel could interleave and, under PostgreSQL's READ
-- COMMITTED snapshot semantics, still succeed even after round 4's own
-- `for share`-lock mitigation (a nested `exists` sub-query inside an
-- already in-flight, lock-waiting statement keeps that statement's
-- original pre-wait snapshot — real, documented Postgres behaviour, not
-- a misdiagnosis; see round 5's own transcript for the full account).
--
-- Status: PENDING_DEV_VALIDATION — same disclosed-until-applied posture
-- as this contract's other three migrations. This build session has no
-- Dev database credentials (confirmed again this phase: the anon key
-- reaches the real `Farm Return V1 Dev` project — `farms`/`decisions`
-- return `401 permission denied` as every prior session found, proving
-- reachability — but `job_sessions`/`job_actuals` themselves return
-- `404 PGRST205 relation not found in schema cache`, confirming those
-- three prior migrations are still genuinely unapplied there; no DB
-- password, service-role key, or `SUPABASE_ACCESS_TOKEN` exists in this
-- environment to apply any of them from here). Reviewed manually against
-- this schema's own established patterns; not run against a live
-- database.
--
-- ---------------------------------------------------------------------------
-- Why an RPC, and why this one is NOT the pattern this schema's own
-- history already tried and rejected once.
--
-- `20260829010000_decisions_jobs_client_access.sql`'s own third through
-- sixth rounds are the load-bearing precedent here, read in full before
-- writing this function, not from memory:
--
-- - Round 3 introduced `insert_decision`/`insert_job`, `SECURITY DEFINER`
--   RPCs, because at that point `authenticated` had **no grant at all**
--   on `decisions`/`jobs` — a `SECURITY INVOKER` function would have hit
--   the identical missing-grant wall a raw client insert did, so
--   `SECURITY DEFINER` (bypassing RLS, re-implementing the ownership
--   check by hand) was the only way to make an RPC-only write path work.
-- - Round 5 correctly rejected that: `execute` granted to `authenticated`
--   still lets any client call the RPC *directly*, bypassing
--   `decideAsFarmer`/`actRecordWeightObservation` entirely, with a
--   shape-valid-but-fabricated payload — gating writes behind an RPC does
--   not, and structurally cannot, close the "farmer forges their own
--   farm's data" concern; it only relocates the same raw-insert-shaped
--   attack surface one layer over.
-- - Round 6 (the dedicated architectural review) went further and
--   reverted the *service-role* fix round 5 had shipped in response,
--   specifically because `SECURITY DEFINER`/a service-role client is a
--   **real defense-in-depth regression**: it bypasses RLS, leaving the
--   function's own manual ownership check as the *only* enforcement
--   layer, where the plain RLS-respecting client gets that same check
--   *and* an independent database-level RLS policy, so a bug in one
--   does not defeat the other. Round 6 restored the plain
--   `select, insert` grant + RLS-respecting client for exactly this
--   reason, and named the systemic "authenticated can forge shape-valid
--   data for their own farm" gap as real, accepted, whole-app, and *not*
--   something one checkpoint's persistence module should close
--   unilaterally by introducing this schema's first privileged
--   credential.
--
-- `confirm_job_session_actual` below is deliberately **`SECURITY
-- INVOKER`, not `SECURITY DEFINER`** — it does not bypass RLS, does not
-- re-implement any ownership check RLS would otherwise provide, and adds
-- no new grant beyond what a raw client insert already required (the
-- existing `job_actuals_owner_insert`/`job_actuals_owner_select` RLS
-- policies and the column-scoped `job_sessions` update grant below still
-- apply exactly as before, independently, unconditionally). Round 6's
-- actual objection — RLS bypass via `SECURITY DEFINER` — does not apply
-- here at all. Round 5's objection — "an RPC does not close the
-- truthfulness gap" — is correct and is **not what this function is
-- for**: calling this RPC directly (bypassing `confirmJobSessionActual`'s
-- own `reconcileAndVerifyPayload`) still lets an authenticated client
-- submit a shape-valid-but-fabricated `payload` for their own farm,
-- *exactly as a raw table insert already did* — no new exposure, the
-- same already-disclosed, already-accepted systemic risk
-- (`BLOCKERS.md`), not claimed as closed by this migration. What this
-- function actually closes is narrower and different in kind: not a
-- trust/authorisation question at all, but a pure data-integrity
-- *atomicity* question — two already-individually-authorised writes
-- (insert the Actual; move the session to `confirmed_actual`) must
-- commit together or not at all, so no third transaction can ever
-- observe (or act on) the two writes as separately-committed, partially
-- applied. This is also the "real, reviewed, whole-app decision to
-- introduce an RPC" round 6 said was the missing prerequisite — supplied
-- by this phase's own explicit brief
-- (`docs/product/farm-return-next-v1.1/GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
-- update, this phase), not improvised unilaterally here.
--
-- **Correction, found by this phase's own live Dev validation, not left
-- for a future session to discover**: an earlier version of this
-- migration also revoked the raw `insert` grant on `job_actuals` from
-- `authenticated`, reasoning that the RPC alone should be the only
-- sanctioned write path. That is wrong, and live-validation-confirmed
-- wrong (`supabase/validation/job_sessions_actuals_validation.sql`'s
-- own run against `Farm Return V1 Dev` failed with `permission denied
-- for table job_actuals` from *inside the RPC's own insert*) — exactly
-- the fact `20260829010000_decisions_jobs_client_access.sql`'s own third-
-- round note already recorded and this migration's own header comment
-- above quotes: **"a `SECURITY INVOKER` RPC still runs as the calling
-- role, which would hit the exact same missing-grant wall a raw client
-- insert does."** Revoking the grant does not make the RPC the only way
-- in; it makes the RPC unable to write *at all*, for every caller,
-- including the app's own sanctioned path. The raw `insert` grant on
-- `job_actuals` therefore stays exactly as it already was (`select,
-- insert` to `authenticated`, `20260902010000_job_actuals.sql`) —
-- unconditionally required for this `SECURITY INVOKER` function's own
-- internal insert to work at all, for the identical reason `SECURITY
-- INVOKER` was chosen over `SECURITY DEFINER` in the first place.
--
-- What this means honestly for "do not leave the unsafe legacy path
-- reachable": the *application's own* write path
-- (`confirmJobSessionActual`, `src/lib/farm-data/job-actuals.ts`)
-- exclusively calls this RPC now — 100% of real farmer usage, online or
-- offline-synced, gets the atomicity guarantee unconditionally. A client
-- that deliberately bypasses the app to issue a raw direct-REST insert
-- into `job_actuals` (skipping this RPC) could in principle still
-- reopen the original two-statement race for their *own* farm's own
-- data — but that is not a new or worse exposure than what already
-- existed: it is the identical, already-disclosed, already-accepted
-- "an authenticated client can act on their own farm's data via direct
-- REST, bypassing this app's own server code entirely" risk
-- `20260829010000_decisions_jobs_client_access.sql`'s sixth round
-- already named as real, systemic, whole-app, and not something one
-- checkpoint's persistence module should try to close unilaterally.
-- Closing *that* fully would require either `SECURITY DEFINER` (the
-- exact regression round 6 reverted once already, for the same defense-
-- in-depth reason repeated above) or a genuinely different, whole-app
-- privileged-write-path decision — not a one-line grant change. `select`
-- is untouched either way — `listActualsForJobSession`/
-- `getCurrentActualForJobSession` (`src/lib/farm-data/job-actuals.ts`)
-- read `job_actuals` directly, unaffected.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_job_session_actual(
  p_id uuid,
  p_farm_id uuid,
  p_job_session_id uuid,
  p_activity_type text,
  p_completion_type text,
  p_payload jsonb,
  p_note text,
  p_confirmed_by text,
  p_confirmed_at timestamptz,
  p_revision integer,
  p_supersedes_revision integer
)
returns public.job_actuals
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  existing public.job_actuals;
  inserted public.job_actuals;
begin
  -- Retry-safety, defense in depth: `confirmJobSessionActual`
  -- (`src/lib/farm-data/job-actuals.ts`) already checks for an
  -- id-matched row *before* ever calling this function, but two
  -- concurrent retries of the exact same queued offline submission could
  -- both pass that pre-check and both reach here — this turns what would
  -- otherwise be a confusing primary-key-violation error into a clean,
  -- idempotent "return the row that already exists" no-op, matching
  -- `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §6's own offline retry-safety
  -- requirement. RLS still applies to this `select` (`SECURITY INVOKER`)
  -- — a `p_id` belonging to a row this caller cannot see behaves exactly
  -- as "not found", falling through to the insert below, which then
  -- fails with a normal unique-violation error, the same safe behaviour
  -- a raw insert with a colliding id already had.
  --
  -- **Codex audit HIGH (round 1 of this phase's own Dev-validation
  -- audit): this id-check, running here, before the lock below, has a
  -- real residual race — see
  -- `20260902070000_fix_confirm_job_session_actual_retry_race.sql`,
  -- applied immediately after, in the same session, for the fix and the
  -- full account. Kept here exactly as originally applied (forward-only
  -- discipline — an already-applied migration's own SQL is not rewritten
  -- after the fact), not because it was correct.**
  select * into existing from public.job_actuals where id = p_id;
  if found then
    return existing;
  end if;

  -- The one statement that actually closes the round-5 cancellation
  -- race: an exclusive lock on the parent job_sessions row, held for the
  -- remainder of this transaction. Any concurrent transaction that also
  -- needs this exact row (a cancel, a competing confirm attempt) queues
  -- behind this transaction's own commit — and because it is queuing on
  -- a *fresh* statement/transaction of its own (not one already
  -- mid-execution and reusing a pre-wait snapshot, round 5's own precise
  -- finding), once unblocked it sees this transaction's fully-committed
  -- result in full: both the new job_actuals row and the session's new
  -- `confirmed_actual` status. A cancel arriving here, for example,
  -- re-evaluates `job_sessions_check_valid_transition` against the
  -- *current* `OLD` row (status now `confirmed_actual`, not
  -- `completed_estimated`) and is correctly rejected by that trigger's
  -- own terminal-state branch — no reliance on the
  -- `exists (select ... from job_actuals)` guard that branch also still
  -- carries (kept as a harmless, no-longer-load-bearing backstop for the
  -- disclosed direct-REST-insert scenario below, not removed).
  perform 1 from public.job_sessions where id = p_job_session_id for update;

  insert into public.job_actuals (
    id, farm_id, job_session_id, revision, supersedes_revision,
    activity_type, completion_type, payload, note, confirmed_by, confirmed_at
  ) values (
    p_id, p_farm_id, p_job_session_id, p_revision, p_supersedes_revision,
    p_activity_type, p_completion_type, p_payload, p_note, p_confirmed_by, p_confirmed_at
  )
  returning * into inserted;

  update public.job_sessions set status = 'confirmed_actual' where id = p_job_session_id;

  return inserted;
end;
$$;

revoke all on function public.confirm_job_session_actual(
  uuid, uuid, uuid, text, text, jsonb, text, text, timestamptz, integer, integer
) from public;
grant execute on function public.confirm_job_session_actual(
  uuid, uuid, uuid, text, text, jsonb, text, text, timestamptz, integer, integer
) to authenticated;

-- This migration, as originally applied to `Farm Return V1 Dev`, also
-- revoked `insert` on `job_actuals` from `authenticated` here — kept
-- below exactly as run, not rewritten after the fact (forward-only
-- discipline: an already-applied migration's own historical SQL is not
-- edited once real; a mistake found afterward is corrected by a new
-- migration, not by silently rewriting history). This line was wrong —
-- see this migration's own header comment's "Correction" paragraph for
-- the full account of why (a `SECURITY INVOKER` function has no
-- privilege beyond its caller's own, so revoking the grant broke the
-- RPC's own ability to write, for every caller, not just a bypass) — and
-- is undone by `20260902040000_restore_job_actuals_insert_grant.sql`,
-- applied immediately after, in the same session, once live Dev
-- validation surfaced the break.
revoke insert on public.job_actuals from authenticated;

-- Status: VALIDATED_DEV — applied to `Farm Return V1 Dev` (this line's
-- own mistake corrected by `20260902040000_restore_job_actuals_insert_grant.sql`)
-- and live-validated
-- (supabase/validation/job_sessions_actuals_validation.sql,
-- docs/validation/job-session-actual-dev-validation.md) 2026-09-02.
