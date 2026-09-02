-- Farm Return Next — Codex audit MEDIUM (round 7 of the Job Session /
-- Confirm Actual Dev-validation phase's own audit): round 6's own fix
-- (`20260902130000_fix_confirm_job_session_actual_retry_content_check_round2.sql`)
-- compared the request's full `payload` against the stored row's
-- `payload` with no exceptions — but `src/lib/farm-data/job-actuals.ts`'s
-- own application-layer comparison (`payloadForComparison`, Codex audit
-- MEDIUM, round 2 of the *prior* build phase) deliberately excludes the
-- server-reconciled `areaHa`/`harvestedAreaHa` keys from a `"whole"`
-- completion's comparison specifically, because the real mapped area of
-- a field can legitimately drift between a first attempt and a genuine
-- retry (the farmer, or someone else, edits the field's boundary in
-- another tab). The RPC's own stricter comparison was a *deliberate,
-- disclosed* trade-off at the time (round 5/6's own migration
-- comments) — round 7 correctly pointed out the actual, concrete
-- consequence: two truly concurrent deliveries of the same
-- client-generated id, straddling a real mapped-area edit, would have
-- the second (blocked, then unblocked) delivery's own reconciled
-- `areaHa` genuinely differ from the first's already-committed value,
-- and the RPC would reject that genuinely-legitimate retry as
-- "different content" — a real reliability regression for an edge case
-- that, on reflection, is cheap enough to close properly rather than
-- leave as an accepted trade-off.
--
-- Fix: mirror `payloadForComparison`'s own exact rule at the RPC level
-- — for a `"whole"` completion, strip `areaHa`/`harvestedAreaHa` from
-- both sides of the payload comparison before comparing; every other
-- completion type, and every other payload key, is still compared
-- exactly as before.
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
  existing_payload_for_compare jsonb;
  new_payload_for_compare jsonb;
begin
  select id into locked_session_id from public.job_sessions where id = p_job_session_id for update;
  if locked_session_id is null then
    raise exception 'confirm_job_session_actual: job_session % not found (or does not belong to the current farm)', p_job_session_id
      using errcode = 'foreign_key_violation';
  end if;

  select * into existing from public.job_actuals where id = p_id;
  if found then
    -- Mirrors `payloadForComparison` (src/lib/farm-data/job-actuals.ts)
    -- exactly: only a "whole" completion's areaHa/harvestedAreaHa is
    -- server-derived and may legitimately drift between attempts.
    if p_completion_type = 'whole' then
      existing_payload_for_compare := existing.payload - 'areaHa' - 'harvestedAreaHa';
      new_payload_for_compare := p_payload - 'areaHa' - 'harvestedAreaHa';
    else
      existing_payload_for_compare := existing.payload;
      new_payload_for_compare := p_payload;
    end if;

    if existing.farm_id is distinct from p_farm_id
      or existing.job_session_id is distinct from p_job_session_id
      or existing.activity_type is distinct from p_activity_type
      or existing.completion_type is distinct from p_completion_type
      or existing_payload_for_compare is distinct from new_payload_for_compare
      or existing.note is distinct from p_note
      or existing.confirmed_by is distinct from p_confirmed_by
      or existing.confirmed_at is distinct from p_confirmed_at
      or existing.revision is distinct from p_revision
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
