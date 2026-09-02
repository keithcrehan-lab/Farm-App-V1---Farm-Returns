-- Farm Return Next — GPS Job Session + Confirm Actual contract, schema
-- part 1 of 3. See `docs/product/farm-return-next-v1.1/
-- GPS_JOB_SESSION_ACTUAL_CONTRACT.md` for the full frozen product/
-- architecture decision this migration implements.
--
-- Status: PENDING_DEV_VALIDATION — this build session has no Dev
-- database credentials (only the public anon key; confirmed via a real
-- `curl` returning 401 in the prior overnight session, unchanged this
-- session — same limitation `telemetry_events`' own migration already
-- discloses). Not applied or validated anywhere. Forward-only, additive:
-- no existing table, column, constraint, trigger, or policy is altered or
-- dropped.
--
-- `job_sessions` is the universal Job Session domain object
-- (`GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §3) — one table for every real
-- job type (fertiliser/slurry spreading, silage, field inspection,
-- livestock work, and whatever future activity type ships next), not a
-- separate table per activity. Activity-specific data lives entirely in
-- `job_actuals.payload` (`20260902010000_job_actuals.sql`) — this table
-- only ever needs one new column for a genuinely new *lifecycle* concept,
-- never for a new activity type.
--
-- `id` is client-generated (uuid, no default) — the same offline-first
-- idempotency-key pattern `telemetry_events.id` already established
-- (`20260901000000_telemetry_events.sql`), not `jobs.id`'s
-- server-generated pattern: `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §8
-- requires starting a job to work fully offline, which means the client
-- must be able to construct a real, addressable session id before ever
-- reaching the network, so the UI can operate on it immediately and the
-- offline outbox can sync it later using that same id as its own
-- idempotency key.
--
-- `decision_id` is not null, exactly like `jobs.decision_id` — every real
-- Job Session is authorised by a real `decisions` row, including a
-- manual/no-Prompt start (which constructs a synthetic Decision via
-- `src/orchestration/job-session/index.ts`'s own manual-start path, the
-- same "everything Act does is authorised by a Decision" invariant this
-- whole schema already enforces — see that module's own doc comment for
-- why a manual start still goes through Decide rather than bypassing it).
-- `unique (decision_id)`: one job session per decision, mirroring
-- `jobs_decision_id_unique`'s exact reasoning and retry-safety purpose.
--
-- `status`'s legal transitions are enforced twice, independently
-- (`job_sessions_check_valid_transition` below is the database-level
-- twin of `src/domain/job-session-lifecycle.ts`'s own
-- `LEGAL_TRANSITIONS` table — both must change together if this ever
-- does) — the same defense-in-depth discipline
-- `notifications_check_valid_transition`
-- (`20260901020000_notifications.sql`) already established for exactly
-- this class of problem (`jobs.status`'s own CRITICAL history is the
-- lesson both of these tables were designed to not repeat).
--
-- `active_intervals`/`interruption_gaps`/`field_segments` are `jsonb`
-- arrays, not their own child tables — each is a small, bounded,
-- always-read-with-its-parent list (never queried independently across
-- sessions), the same shape `estimate_snapshot`/`edits` already use on
-- `decisions` for exactly that reason. Their *contents'* shape is owned
-- and validated by `src/domain/job-session-lifecycle.ts`
-- (`ActiveInterval`, `InterruptionGap`) — this migration does not
-- re-encode that shape in SQL, the same reasoning
-- `decisions_estimate_snapshot_ok_shape`'s own comment gives for why a
-- CHECK constraint stops at structural shape, never a full re-encoding of
-- a TypeScript discriminated union.
--
-- Deliberately NOT duplicated on this table: `estimated_values`. A Job
-- Session's Estimate already lives on its authorising `decisions` row
-- (`estimate_snapshot`/`inputs_snapshot`/`calculation_version`) —
-- `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §15's "Prompt — Farm Return
-- estimate" provenance entry is read via `decision_id`, never copied a
-- second time onto this table (`DOMAIN_CONTRACTS.md`'s reuse boundary
-- applied to this checkpoint's own new schema, not just to existing
-- `src/domain/` modules).

create table public.job_sessions (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  decision_id uuid not null references public.decisions (id),
  activity_type text not null,
  origin text not null check (origin in ('prompt', 'plan', 'manual', 'detected')),
  status text not null check (
    status in ('ready', 'active', 'paused', 'completed_estimated', 'confirmed_actual', 'cancelled')
  ) default 'ready',
  primary_field_id uuid null references public.fields (id),
  field_segments jsonb not null default '[]'::jsonb,
  active_intervals jsonb not null default '[]'::jsonb,
  interruption_gaps jsonb not null default '[]'::jsonb,
  device_metadata jsonb null,
  cancelled_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_sessions_decision_id_unique unique (decision_id)
);

comment on table public.job_sessions is
  'The universal Job Session domain object (GPS_JOB_SESSION_ACTUAL_CONTRACT.md §3). id is client-generated for offline-first creation -- see this migration''s own header comment.';
comment on column public.job_sessions.activity_type is
  'e.g. "fertiliser_spreading", "slurry_spreading", "silage", "field_inspection", "livestock_work" -- open text, same reasoning as jobs.job_type: the set of real activity types only ever grows.';
comment on column public.job_sessions.field_segments is
  'Array of {fieldId, enteredAt?, exitedAt?} -- GPS_JOB_SESSION_ACTUAL_CONTRACT.md §13''s multi-field architecture. primary_field_id is the common single-field case''s own indexed, same-farm-enforced convenience column; this array is the one that scales to Field 7 -> Field 8 -> Field 9 later.';
comment on column public.job_sessions.active_intervals is
  'Array of {startedAt, endedAt?} -- shape owned by src/domain/job-session-lifecycle.ts''s ActiveInterval. Elapsed time is always derived from this list (computeElapsedSeconds), never separately stored.';
comment on column public.job_sessions.interruption_gaps is
  'Array of {lastConfirmedAt, interruptedAt, nextConfirmedAt?, reason?} -- GPS_JOB_SESSION_ACTUAL_CONTRACT.md §10, shape owned by src/domain/job-session-lifecycle.ts''s InterruptionGap.';

create index job_sessions_farm_id_idx on public.job_sessions (farm_id);
create index job_sessions_farm_id_status_idx on public.job_sessions (farm_id, status);
create index job_sessions_primary_field_id_idx on public.job_sessions (primary_field_id) where primary_field_id is not null;

create trigger job_sessions_set_updated_at
  before update on public.job_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cross-farm ownership: decision_id and primary_field_id must each belong
-- to the same farm as the job_sessions row itself -- identical shape and
-- reused helpers to jobs.decision_id / decisions.field_id's own triggers
-- (assert_decision_belongs_to_farm, assert_field_belongs_to_farm, both
-- already defined by earlier migrations in this schema).
-- ---------------------------------------------------------------------------
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
  -- Codex audit HIGH (round 1, docs/overnight/audits/
  -- gps-job-session-actual-contract-codex-audit-round1.md): only
  -- `primary_field_id` was same-farm-enforced -- `field_segments` (§10's
  -- multi-field array) had no equivalent check at all, even though it is
  -- part of the same column-scoped update grant a client can freely set.
  -- Every `fieldId` in the array is now checked the identical way.
  for segment in select * from jsonb_array_elements(coalesce(new.field_segments, '[]'::jsonb))
  loop
    if segment ? 'fieldId' and jsonb_typeof(segment -> 'fieldId') = 'string' then
      perform public.assert_field_belongs_to_farm((segment ->> 'fieldId')::uuid, new.farm_id);
    end if;
  end loop;
  return new;
end;
$$;

create trigger job_sessions_same_farm
  before insert or update on public.job_sessions
  for each row execute function public.job_sessions_check_same_farm();

-- ---------------------------------------------------------------------------
-- Real, enforced lifecycle state machine -- the database-level twin of
-- src/domain/job-session-lifecycle.ts's LEGAL_TRANSITIONS table. See this
-- migration's own header comment for the full reasoning.
--
-- Same-status updates (status unchanged) are always legal -- this is how
-- a metadata-only patch (appending to interruption_gaps while remaining
-- "active", updating field_segments, setting device_metadata) is written:
-- the client always round-trips status back unchanged for a metadata-only
-- update, so this trigger has exactly one rule to apply regardless of
-- what changed, mirroring notifications_check_valid_transition's own
-- "new.state = old.state then return new" no-op branch.
-- ---------------------------------------------------------------------------
create or replace function public.job_sessions_check_valid_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- Defence in depth beyond the column-scoped grant below: even if a
  -- future migration ever widened the grant by mistake, reject an
  -- attempt to change an immutable column explicitly rather than
  -- silently allowing it.
  if new.farm_id <> old.farm_id
    or new.decision_id <> old.decision_id
    or new.activity_type <> old.activity_type
    or new.origin <> old.origin
    or new.created_at <> old.created_at
  then
    raise exception 'job_sessions: farm_id/decision_id/activity_type/origin/created_at are immutable after insert'
      using errcode = 'check_violation';
  end if;

  if new.status = old.status then
    return new; -- metadata-only update (intervals/segments/gaps/etc.), harmless
  end if;

  if old.status = 'ready' and new.status in ('active', 'cancelled') then
    -- legal
  elsif old.status = 'active' and new.status in ('paused', 'completed_estimated', 'cancelled') then
    -- legal
  elsif old.status = 'paused' and new.status in ('active', 'completed_estimated', 'cancelled') then
    -- legal
  elsif old.status = 'completed_estimated' and new.status in ('confirmed_actual', 'cancelled') then
    -- legal here; `20260902010000_job_actuals.sql` re-defines this same
    -- function (create or replace) to additionally require a real
    -- job_actuals row before allowing confirmed_actual specifically,
    -- once that table exists -- it cannot be checked from this
    -- migration, which is applied before job_actuals is created. See
    -- that migration's own header comment.
  else
    raise exception 'job_sessions: invalid status transition % -> % (id %)', old.status, new.status, old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger job_sessions_valid_transition
  before update on public.job_sessions
  for each row execute function public.job_sessions_check_valid_transition();

-- ---------------------------------------------------------------------------
-- job_sessions_valid_initial_status: closes a real gap the transition
-- trigger above cannot -- `job_sessions_valid_transition` only fires
-- `before update`, so nothing stops a raw `insert` from starting a
-- session directly in `completed_estimated`/`confirmed_actual`/`cancelled`,
-- bypassing the whole lifecycle a Job Session exists to enforce. A fresh
-- session may only ever be inserted as `ready` (the default; the normal
-- Start Job flow's Decide-then-create-session ordering) or `active`
-- (a caller that starts tracking in the same request as creating the
-- session, skipping a separate immediate `ready` -> `active` round trip)
-- -- never anything past that.
-- ---------------------------------------------------------------------------
create or replace function public.job_sessions_check_valid_initial_status()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.status not in ('ready', 'active') then
    raise exception 'job_sessions: a new session may only be inserted as ready or active, not %', new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger job_sessions_valid_initial_status
  before insert on public.job_sessions
  for each row execute function public.job_sessions_check_valid_initial_status();

-- ---------------------------------------------------------------------------
-- RLS -- identical owner-scoped pattern to every table in this schema.
-- ---------------------------------------------------------------------------
alter table public.job_sessions enable row level security;

create policy job_sessions_owner_select on public.job_sessions
  for select to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy job_sessions_owner_insert on public.job_sessions
  for insert to authenticated
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy job_sessions_owner_update on public.job_sessions
  for update to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.job_sessions from anon;
grant select, insert on public.job_sessions to authenticated;
-- Column-scoped update -- farm_id/decision_id/activity_type/origin/
-- created_at/id stay genuinely immutable at the database level (the same
-- "never grant a blanket update" discipline jobs.status's own CRITICAL
-- history established), enforced twice over (the grant itself, and
-- job_sessions_check_valid_transition's own explicit re-check above, in
-- case a future migration ever widens this grant by mistake).
grant update (status, primary_field_id, field_segments, active_intervals, interruption_gaps, device_metadata, cancelled_reason)
  on public.job_sessions to authenticated;

-- Status: PENDING_DEV_VALIDATION -- not yet applied to any database
