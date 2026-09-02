-- Farm Return Next — Codex audit HIGH (round 6 of the Job Session /
-- Confirm Actual Dev-validation phase's own audit): round 5's own fix
-- (`20260902110000_fix_confirm_job_session_actual_retry_content_check.sql`)
-- was itself incomplete in two real ways:
--
-- 1. It compared `job_session_id`/`activity_type`/`completion_type`/
--    `payload`/`revision` with a plain `<>`, not `IS DISTINCT FROM`. A
--    NULL caller-supplied parameter makes `<>` evaluate to NULL (neither
--    true nor false) rather than true, so a mismatch on exactly that one
--    field, with every other field genuinely matching, could silently
--    fail to trigger the `or` chain's rejection. `IS DISTINCT FROM`
--    (already used for `note`/`supersedes_revision`) is the textbook
--    NULL-safe equality-negation and is now used uniformly for every
--    field compared.
-- 2. It omitted `farm_id`, `confirmed_by`, and `confirmed_at` —
--    genuinely immutable request inputs `src/lib/farm-data/job-actuals.ts`'s
--    own application-layer comparison (`toComparableInput`/
--    `toComparableRow`) already includes. Added.
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
  select id into locked_session_id from public.job_sessions where id = p_job_session_id for update;
  if locked_session_id is null then
    raise exception 'confirm_job_session_actual: job_session % not found (or does not belong to the current farm)', p_job_session_id
      using errcode = 'foreign_key_violation';
  end if;

  select * into existing from public.job_actuals where id = p_id;
  if found then
    if existing.farm_id is distinct from p_farm_id
      or existing.job_session_id is distinct from p_job_session_id
      or existing.activity_type is distinct from p_activity_type
      or existing.completion_type is distinct from p_completion_type
      or existing.payload is distinct from p_payload
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
