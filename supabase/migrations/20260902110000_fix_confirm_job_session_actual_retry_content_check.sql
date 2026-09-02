-- Farm Return Next — Codex audit HIGH (round 5 of the Job Session /
-- Confirm Actual Dev-validation phase's own audit): `confirm_job_session_actual`'s
-- own id-matched retry-safety branch returned whatever row it found by
-- `id` alone, with no check that the *content* of the request actually
-- matches the stored row. `src/lib/farm-data/job-actuals.ts`'s own
-- earlier, application-layer id-check (`jsonValuesEqual`/
-- `toComparableInput`/`toComparableRow`) already does this comparison —
-- but only for the *normal, sequential* case, where that check runs, and
-- finds a match (or throws), *before* this RPC is ever called at all
-- (the RPC is only reached once the application layer has already
-- concluded no matching row exists). The RPC's own id-check exists
-- specifically for the *concurrent* case that same-sequence ordering
-- cannot cover: two truly concurrent calls, each having already passed
-- the application layer's own "not found" check before either commits.
-- In that narrow window, a client-generated `id` reused across two
-- genuinely different submissions (a real bug elsewhere, or a
-- deliberately malicious reuse of another session's already-used id)
-- would previously have made this RPC silently return the *wrong*,
-- pre-existing row — reporting apparent success while never actually
-- processing the new request's real content.
--
-- Fix: the id-matched branch now compares every immutable field of the
-- request against the stored row and raises a clear error on any
-- mismatch, mirroring the application layer's own comparison at the one
-- place it could not otherwise reach (the genuine cross-request
-- concurrent case). Also makes the parent-session lookup explicit and
-- fail-closed on its own (a `job_session_id` that does not exist, or
-- does not belong to the caller's own farm under RLS, now raises a
-- clear error immediately at the lock step, rather than silently
-- proceeding to an insert that would eventually fail downstream via
-- `job_actuals_check_same_farm`'s own, less specific error).
--
-- **Deliberately stricter than the application layer's own comparison,
-- narrow trade-off, not an oversight**: `job-actuals.ts`'s own
-- `payloadForComparison` excludes the server-reconciled `areaHa`/
-- `harvestedAreaHa` from its own "whole" completion comparison (Codex
-- audit MEDIUM, round 2 of the *prior* build phase) — real-world mapped
-- field data can legitimately drift between a first attempt and a
-- retry. This RPC-level check does not replicate that carve-out; a
-- payload comparison here is a plain `<>` over the whole `jsonb` value.
-- The failure mode this trades for is safe (a clear error the caller
-- can retry or investigate), and the scenario is narrow (requires both a
-- concurrent id collision *and* a genuine field-area change inside the
-- exact same window) — re-deriving the application layer's own nuanced
-- comparison in SQL was judged not worth the domain-logic duplication
-- for a case this rare, not something silently missed.
--
-- Status: VALIDATED_DEV — applied to `Farm Return V1 Dev`.
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
  locked_session_id uuid;
begin
  -- Lock first (see 20260902070000's own header comment for why this
  -- ordering closes the retry race). Now explicit and fail-closed on its
  -- own: a session that does not exist, or is not visible to this caller
  -- under RLS (i.e. does not belong to their own farm), raises here
  -- immediately rather than silently falling through.
  select id into locked_session_id from public.job_sessions where id = p_job_session_id for update;
  if locked_session_id is null then
    raise exception 'confirm_job_session_actual: job_session % not found (or does not belong to the current farm)', p_job_session_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Retry-safety: now runs only after the lock is held (see
  -- 20260902070000). A matching id must also match the request's own
  -- real content — a reused id with genuinely different content is a
  -- real conflict, not a legitimate retry, and must never be silently
  -- resolved to whichever row happens to already exist.
  select * into existing from public.job_actuals where id = p_id;
  if found then
    if existing.job_session_id <> p_job_session_id
      or existing.activity_type <> p_activity_type
      or existing.completion_type <> p_completion_type
      or existing.payload <> p_payload
      or existing.note is distinct from p_note
      or existing.revision <> p_revision
      or existing.supersedes_revision is distinct from p_supersedes_revision
    then
      raise exception 'confirm_job_session_actual: a job_actuals row with id % already exists with different content — refusing to silently return stale/mismatched data', p_id
        using errcode = 'unique_violation';
    end if;
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
