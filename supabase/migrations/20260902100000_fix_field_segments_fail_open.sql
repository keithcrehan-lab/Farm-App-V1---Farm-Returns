-- Farm Return Next — Codex audit MEDIUM (round 5 of the Job Session /
-- Confirm Actual Dev-validation phase's own audit): `job_sessions_check_same_farm`
-- (`20260902000000_job_sessions.sql`) verifies ownership of a
-- `field_segments` array element's `fieldId` only when that element
-- genuinely has a string `fieldId` key — a missing key, or a present but
-- non-string value, is silently skipped, not rejected. This is the
-- identical fail-open pattern already found and fixed, across rounds 3
-- and 4 of the *prior* GPS Job Session build phase, for `job_actuals`'
-- own `fieldIds` array (`job_actuals_check_same_farm`,
-- `20260902010000_job_actuals.sql`) — that fix was never mirrored onto
-- `job_sessions.field_segments`, the sibling structure this same
-- migration's own trigger already loops over.
--
-- Fix: mirror the same fail-closed shape — a present array element with
-- no `fieldId` key at all is left alone (matching the domain layer's own
-- optional-field shape for a segment still being entered/exited), but a
-- `fieldId` key that IS present must be a string, and is then verified
-- exactly as before; a non-string `fieldId` now raises rather than being
-- silently skipped.
--
-- Status: VALIDATED_DEV — applied to `Farm Return V1 Dev`.
create or replace function public.job_sessions_check_same_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  segment jsonb;
begin
  perform public.assert_decision_belongs_to_farm(new.decision_id, new.farm_id);
  if new.primary_field_id is not null then
    perform public.assert_field_belongs_to_farm(new.primary_field_id, new.farm_id);
  end if;
  for segment in select * from jsonb_array_elements(coalesce(new.field_segments, '[]'::jsonb))
  loop
    if segment ? 'fieldId' then
      if jsonb_typeof(segment -> 'fieldId') <> 'string' then
        raise exception 'job_sessions: field_segments.fieldId must be a string when present (session %)', new.id
          using errcode = 'check_violation';
      end if;
      perform public.assert_field_belongs_to_farm((segment ->> 'fieldId')::uuid, new.farm_id);
    end if;
  end loop;
  return new;
end;
$$;
