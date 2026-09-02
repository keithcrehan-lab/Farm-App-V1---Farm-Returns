-- Farm Return Next — GPS Job Session + Confirm Actual contract, schema
-- part 3 of 3. See `docs/product/farm-return-next-v1.1/
-- GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §3/§17.
--
-- Status: VALIDATED_DEV -- applied to `Farm Return V1 Dev` and
-- live-validated, same as this contract's other migrations. Purely
-- additive: no existing column, constraint, trigger, index, or policy on
-- `telemetry_events`
-- (`20260901000000_telemetry_events.sql`) is altered or dropped.
--
-- Reuses `telemetry_events` as the Job Session's own raw GPS observation
-- store, rather than inventing a second, parallel observations table —
-- `CLAUDE.md`/this build session's own explicit instruction ("reuse
-- existing domain primitives... do not duplicate already-shipped
-- architecture"). `telemetry_events.source = 'phone_gps'` is already
-- exactly the raw Observe-stage phone-GPS event this contract's §3
-- ("GPS/location observations") needs; the only real gap was that no
-- telemetry event could say *which Job Session* it belongs to. One
-- nullable column closes it -- a `phone_gps` event is not required to
-- belong to a session (Farm Awareness-mode fixes, §7, are real telemetry
-- with no active Job Session at all), but when it does, it is now a real,
-- same-farm-enforced, queryable link.
--
-- `job_session_id` is nullable, not required, on purpose: the whole
-- point of Farm Awareness mode (§7) is ambient, session-independent
-- context ("understand whether the farmer is on/near the farm") -- most
-- `telemetry_events` rows will legitimately have no session at all.
-- §17 (Farm Return Drive compatibility): this same nullable-link pattern
-- is exactly how a future non-phone observation source (tractor
-- identity, BLE implement tag, machine telemetry) becomes Observed
-- evidence on the same Job Session without a new schema concept -- it
-- only needs its own `telemetry_events.source` value alongside
-- `'phone_gps'` (a small, forward-only CHECK-constraint widening) and the
-- same `job_session_id` link this migration adds once.

alter table public.telemetry_events
  add column job_session_id uuid null references public.job_sessions (id);

comment on column public.telemetry_events.job_session_id is
  'Present when this telemetry event was captured during a real Job Session (GPS_JOB_SESSION_ACTUAL_CONTRACT.md §3) -- absent for ambient Farm Awareness-mode fixes with no active session. Same-farm-enforced by telemetry_events_check_same_farm below.';

create index telemetry_events_job_session_id_idx on public.telemetry_events (job_session_id) where job_session_id is not null;

-- ---------------------------------------------------------------------------
-- Cross-farm ownership: job_session_id must belong to the same farm as
-- this telemetry_events row -- identical shape to job_actuals.job_session_id's
-- own trigger (20260902010000_job_actuals.sql), reusing the same helper.
-- ---------------------------------------------------------------------------
create or replace function public.telemetry_events_check_same_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.job_session_id is not null then
    perform public.assert_job_session_belongs_to_farm(new.job_session_id, new.farm_id);
  end if;
  return new;
end;
$$;

create trigger telemetry_events_same_farm
  before insert on public.telemetry_events
  for each row execute function public.telemetry_events_check_same_farm();

-- No grant change needed -- telemetry_events already grants select, insert
-- to authenticated (20260901000000_telemetry_events.sql); this migration
-- only adds a nullable column and a same-farm trigger, both covered by
-- that existing grant.

-- Status: VALIDATED_DEV -- applied to `Farm Return V1 Dev` and live-validated
-- (`supabase/validation/job_sessions_actuals_validation.sql`,
-- `docs/validation/job-session-actual-dev-validation.md`) 2026-09-02.
