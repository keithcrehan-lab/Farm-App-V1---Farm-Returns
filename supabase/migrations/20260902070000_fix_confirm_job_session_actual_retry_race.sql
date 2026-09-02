-- Farm Return Next — Codex audit HIGH (round 1 of this phase's own
-- Dev-validation audit, docs/overnight/audits/
-- job-session-dev-validation-codex-audit-round1.md): a real residual
-- race in `confirm_job_session_actual`
-- (`20260902030000_confirm_job_session_actual_atomic.sql`) — the
-- retry-safety id-check ran *before* the `for update` lock on the parent
-- `job_sessions` row, not after.
--
-- The exact scenario: two concurrent calls with the identical
-- client-generated `id` (a genuine offline-outbox retry racing itself —
-- e.g. two flush attempts overlapping) both run the id-check while
-- neither has committed yet, so both see "not found". Both then queue on
-- the same `for update` lock (same `job_session_id`). The first to
-- proceed inserts and commits normally. The second, once unblocked, has
-- *already evaluated* its own id-check (finding nothing) before it ever
-- waited on the lock — it proceeds straight to its own insert attempt,
-- which now collides with the first caller's already-committed row on
-- the primary key, surfacing a raw `23505` unique-violation error
-- instead of this function's own intended clean, idempotent "return the
-- existing row" behaviour.
--
-- Fix: take the lock *first*, then run the id-check. The second
-- caller's id-check now only ever runs after the first caller's insert
-- has genuinely committed (or the first caller wasn't inserting this id
-- at all) — it always sees the true, current state, and returns the
-- already-inserted row cleanly rather than colliding with it.
--
-- Status: VALIDATED_DEV — applied to `Farm Return V1 Dev` immediately
-- after discovery, in the same session; re-verified via
-- `supabase/validation/job_sessions_actuals_validation.sql`'s Test 8
-- (unchanged behaviour for the non-concurrent case) plus a manual
-- reasoning check (this migration's own header comment) — see
-- `docs/validation/job-session-actual-dev-validation.md` for the full
-- account. A genuinely concurrent two-connection reproduction of this
-- specific narrower race was not additionally run this round (the
-- cancellation race's own two-connection test already exercises this
-- function's real concurrent-locking behaviour in full); the fix is a
-- pure statement-reordering with no new logic, reviewed against the
-- documented PostgreSQL locking semantics that motivated it.
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
  -- Lock first (see this migration's own header comment for why this
  -- ordering, not the reverse, is what actually closes the retry race).
  perform 1 from public.job_sessions where id = p_job_session_id for update;

  -- Retry-safety: now runs only after the lock is held, so a concurrent
  -- caller that queued behind us sees our own commit's real result, not
  -- a stale "not found" from before either of us had written anything.
  select * into existing from public.job_actuals where id = p_id;
  if found then
    return existing;
  end if;

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
