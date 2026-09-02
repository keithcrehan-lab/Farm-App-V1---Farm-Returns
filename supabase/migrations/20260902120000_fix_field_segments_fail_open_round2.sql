-- Farm Return Next — Codex audit MEDIUM (round 6 of the Job Session /
-- Confirm Actual Dev-validation phase's own audit): round 5's own fix
-- (`20260902100000_fix_field_segments_fail_open.sql`) only required a
-- *present* `fieldId` to be a string — an array element with no
-- `fieldId` key at all, or a non-object array element, was still
-- silently accepted. This was reasoned, at the time, as matching "the
-- domain layer's own optional-field shape for a segment still being
-- entered/exited" — verified this round against the real domain type
-- (`FieldSegmentInput`, `src/lib/farm-data/job-sessions.ts`) and that
-- reasoning was simply wrong: `fieldId: string` is a required field
-- there, never optional. A `field_segments` array element with no
-- `fieldId`, or one that isn't even a JSON object, is not a genuine
-- domain state at all — it should fail closed exactly like every other
-- malformed reference in this schema, matching `job_actuals.fieldIds`'
-- own sibling implementation precisely (which validates the array
-- itself, then every element).
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
  if new.field_segments is not null and jsonb_typeof(new.field_segments) <> 'array' then
    raise exception 'job_sessions: field_segments must be a JSON array (session %)', new.id
      using errcode = 'check_violation';
  end if;
  for segment in select * from jsonb_array_elements(coalesce(new.field_segments, '[]'::jsonb))
  loop
    if jsonb_typeof(segment) <> 'object' then
      raise exception 'job_sessions: every field_segments element must be a JSON object (session %)', new.id
        using errcode = 'check_violation';
    end if;
    if not (segment ? 'fieldId') or jsonb_typeof(segment -> 'fieldId') <> 'string' then
      raise exception 'job_sessions: every field_segments element must have a string fieldId (session %)', new.id
        using errcode = 'check_violation';
    end if;
    perform public.assert_field_belongs_to_farm((segment ->> 'fieldId')::uuid, new.farm_id);
  end loop;
  return new;
end;
$$;
