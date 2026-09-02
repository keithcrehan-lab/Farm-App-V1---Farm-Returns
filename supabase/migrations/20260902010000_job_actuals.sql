-- Farm Return Next — GPS Job Session + Confirm Actual contract, schema
-- part 2 of 3. See `docs/product/farm-return-next-v1.1/
-- GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §5/§6/§14.
--
-- Status: PENDING_DEV_VALIDATION -- same disclosed-until-applied posture
-- as `20260902000000_job_sessions.sql`. Forward-only, additive.
--
-- `job_actuals` is the confirmed Actual record — one row per Confirm
-- Actual submission, **never updated or deleted, ever**
-- (`decisions`/`telemetry_events`'s own "a recorded fact, once made, is
-- historical" posture applied here, made even more load-bearing:
-- `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §14 explicitly requires revision
-- history survive an edit). Editing a confirmed Actual
-- (`src/lib/farm-data/job-actuals.ts`'s `confirmJobSessionActual`) always
-- inserts a *new* row with `revision` incremented and
-- `supersedes_revision` pointing at the one it corrects — the "current"
-- Actual for a session is simply the row with the highest `revision` for
-- that `job_session_id`, never a value mutated in place.
--
-- `payload` is `jsonb`, shape owned by `src/domain/job-actual.ts`'s
-- `JobActualPayload` discriminated union (`FertiliserSpreadingActual` |
-- `SlurrySpreadingActual` | `SilageActual` | `FieldInspectionActual` |
-- `LivestockWorkActual`) — this migration validates only the structural
-- facts a CHECK constraint can actually verify (see
-- `job_actuals_completion_type_shape` below), the same "shape, not
-- truthfulness" limit `decisions_estimate_snapshot_ok_shape`'s own
-- comment already names and accepts for this whole schema's jsonb
-- columns.
--
-- `id` is client-generated (uuid, no default) — the same offline-first
-- idempotency-key pattern `telemetry_events.id`/`job_sessions.id` already
-- establish, **not** a server default. A server-computed `revision`
-- number alone is not a safe retry key under the offline outbox's
-- at-least-once delivery model (`src/lib/offline/outbox.ts`'s own header
-- comment): a retried `syncFn` call that re-reads "current max revision"
-- fresh would see its own prior successful insert already reflected and
-- mint a *new*, duplicate revision for the same logical Confirm Actual
-- submission. `src/lib/farm-data/job-actuals.ts`'s `confirmJobSessionActual`
-- checks for an existing row by this client id *before* ever computing a
-- revision number, so a genuine retry short-circuits and can never
-- duplicate a revision.

create table public.job_actuals (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  job_session_id uuid not null references public.job_sessions (id),
  revision integer not null check (revision >= 1),
  supersedes_revision integer null check (supersedes_revision is null or supersedes_revision >= 1),
  activity_type text not null,
  completion_type text not null check (completion_type in ('whole', 'partial', 'did_not_happen')),
  payload jsonb not null,
  note text null,
  confirmed_by text not null check (confirmed_by = 'farmer'),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint job_actuals_session_revision_unique unique (job_session_id, revision)
);

-- No target-entity foreign key on `payload`'s own `fieldIds`/
-- `livestockGroupId`/`animalId` — those are validated same-farm at the
-- *domain* layer (`job-actual.ts`'s validators receive real
-- `FieldAreaContext`s the caller already fetched with its own farm-scoped
-- query) rather than a jsonb-array foreign key this schema has no way to
-- express declaratively; `primary_field_id` on the parent `job_sessions`
-- row is the one real, indexed, trigger-enforced same-farm reference this
-- contract ships at the database level (`20260902000000_job_sessions.sql`).

comment on table public.job_actuals is
  'The confirmed Actual record (GPS_JOB_SESSION_ACTUAL_CONTRACT.md §5/§6) -- insert-only, never updated/deleted. An edit is a new row (revision + 1); the "current" Actual for a session is the max(revision) row for that job_session_id. See this migration''s own header comment.';
comment on column public.job_actuals.id is
  'Client-generated (crypto.randomUUID() or equivalent) at Confirm Actual submission time -- the offline outbox''s idempotency key. See this migration''s own header comment for why a server-computed revision number alone is not a safe retry key.';
comment on column public.job_actuals.revision is
  'Starts at 1 for a session''s first confirmation. supersedes_revision names which prior revision this one corrects (null for revision 1) -- src/lib/farm-data/job-actuals.ts is the one real writer that keeps this consistent (always current-max + 1).';
comment on column public.job_actuals.payload is
  'Activity-specific Actual payload -- shape owned by src/domain/job-actual.ts''s JobActualPayload union. Structural shape only is checked here (job_actuals_completion_type_shape below); truthfulness is not and cannot be database-verified, the same limit this schema''s other jsonb-typed provenance columns already accept.';
comment on column public.job_actuals.confirmed_by is
  'Always "farmer" today -- mirrors decisions.decided_by''s own posture (no reviewed auto-rule exists yet; SCIENTIFIC_RULES.md). "It must never infer a missing Actual" (GPS_JOB_SESSION_ACTUAL_CONTRACT.md §19) applies with equal force to Confirm Actual itself, not just to Ask AI.';

create index job_actuals_farm_id_idx on public.job_actuals (farm_id);
create index job_actuals_job_session_id_idx on public.job_actuals (job_session_id, revision desc);

-- ---------------------------------------------------------------------------
-- job_actuals_completion_type_shape: the one real structural check this
-- schema can make on payload without re-encoding src/domain/job-actual.ts's
-- TypeScript union in SQL (the same reasoning
-- decisions_estimate_snapshot_ok_shape's own comment gives) -- a
-- "did_not_happen" completion should carry no fabricated quantity/area
-- keys, since job-actual.ts's own validators never populate them for that
-- completion type (see validateFertiliserSpreadingActual et al.'s own
-- resolveFieldScopedArea calls). Every branch uses the jsonb `?`
-- key-exists operator, never a bare `->>` comparison, for the same
-- NULL-safety reasoning decisions_estimate_snapshot_ok_shape's own
-- comment documents.
-- ---------------------------------------------------------------------------
alter table public.job_actuals
  add constraint job_actuals_completion_type_shape check (
    completion_type <> 'did_not_happen'
    or (
      not (payload ? 'quantity')
      and not (payload ? 'areaHa')
      and not (payload ? 'harvestedAreaHa')
      and not (payload ? 'bales')
      and not (payload ? 'tonnes')
    )
  );

-- ---------------------------------------------------------------------------
-- Cross-farm ownership: job_session_id must belong to the same farm as
-- this job_actuals row -- identical shape to jobs.decision_id's own
-- trigger.
-- ---------------------------------------------------------------------------
create or replace function public.assert_job_session_belongs_to_farm(p_job_session_id uuid, p_farm_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.job_sessions where id = p_job_session_id and farm_id = p_farm_id) then
    raise exception 'job_session % does not belong to farm %', p_job_session_id, p_farm_id
      using errcode = 'foreign_key_violation';
  end if;
end;
$$;

-- Codex audit HIGH (round 1, docs/overnight/audits/
-- gps-job-session-actual-contract-codex-audit-round1.md, finding 1's own
-- follow-up in round 2 and round 3,
-- gps-job-session-actual-contract-codex-audit-round{2,3}.md): closing
-- "confirmed_actual reachable with zero job_actuals rows"
-- (job_sessions_check_valid_transition below) still left real gaps
-- open, closed here across three rounds:
--
-- 1. (round 2) A job_actuals row was insertable for a session still
--    `ready`/`active`/`paused`, well before Finish Job. `select ...
--    into session_status` below requires `completed_estimated` or
--    `confirmed_actual` first.
-- 2. (round 3) `select ... into session_status` took no row lock --
--    under READ COMMITTED, a concurrent transaction cancelling the same
--    session could commit in between this read and this trigger's own
--    insert, leaving an Actual attached to a session that ends up
--    `cancelled`. Fixed with `for share`: this transaction now holds a
--    shared lock on the job_sessions row for its own duration, which a
--    concurrent `update ... set status = 'cancelled'` (an exclusive
--    operation) must wait for -- the two can no longer interleave.
-- 3. (round 3) `activity_type` and every `fieldId`/`livestockGroupId`/
--    `animalId` the payload references were not bound to the parent
--    session/farm at the database level at all -- only
--    `confirmJobSessionActual`'s own application-layer checks enforced
--    them, reachable only through that one sanctioned path. Both are
--    now real, cheap, *structural* checks a trigger can genuinely make
--    (a column equality; jsonb-array existence lookups against real
--    farm-scoped tables, the identical shape `job_sessions_check_same_farm`'s
--    own `field_segments` loop above already established as
--    precedent) -- neither is a re-derivation of a domain
--    *calculation*.
--
-- **What remains a real, disclosed, deliberately NOT-closed gap**
-- (`BLOCKERS.md`): the *numeric truthfulness* of a farmer-asserted
-- quantity/area (is 250kg the real amount applied? is a "whole field"
-- area genuinely the mapped area, or did a raw insert bypass
-- `confirmJobSessionActual`'s own `reconcileAndVerifyPayload` and write
-- an arbitrary number?). No CHECK constraint can re-verify that without
-- re-deriving `reconcileAndVerifyPayload`'s own real farm-data
-- computation in SQL, the same "shape, not truthfulness" limit this
-- schema's other jsonb-typed provenance columns already accept
-- (`decisions_estimate_snapshot_ok_shape`'s own comment,
-- `20260829000000_orchestration_foundation.sql`) -- a farmer forging a
-- shape-valid-but-untruthful *number* for their own farm via direct
-- REST is the same systemic, already-accepted, whole-app risk every
-- table in this schema carries (see `decisions.ts`'s own
-- extensively-documented architectural decision on exactly this
-- question) — what this migration now closes is everything
-- *structural* short of that.
create or replace function public.job_actuals_check_same_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  session_status text;
  session_activity_type text;
  field_id_elem jsonb;
begin
  perform public.assert_job_session_belongs_to_farm(new.job_session_id, new.farm_id);

  select status, activity_type into session_status, session_activity_type
    from public.job_sessions where id = new.job_session_id for share;

  if session_status not in ('completed_estimated', 'confirmed_actual') then
    raise exception 'job_actuals: cannot confirm an Actual for session % while its status is "%" -- Finish Job first', new.job_session_id, session_status
      using errcode = 'check_violation';
  end if;

  if new.activity_type <> session_activity_type then
    raise exception 'job_actuals: activity_type "%" does not match session %''s real activity_type "%"', new.activity_type, new.job_session_id, session_activity_type
      using errcode = 'check_violation';
  end if;

  -- Structural entity-ownership checks -- see this function's own
  -- header comment for why these are in scope (existence lookups, not a
  -- re-derived calculation) while a claimed quantity/area's numeric
  -- truthfulness is not.
  --
  -- Codex audit HIGH (round 4, docs/overnight/audits/
  -- gps-job-session-actual-contract-codex-audit-round4.md): round 3's
  -- own fix here (`jsonb_typeof(...) = 'string'` guards) was itself the
  -- same fail-open shape it was meant to close at the application layer
  -- -- a non-string `fieldIds` entry, a non-array `fieldIds`, or a
  -- non-string `livestockGroupId`/`animalId` simply skipped verification
  -- silently instead of being rejected, identical to the bug already
  -- fixed in `reconcileAndVerifyPayload` (`src/lib/farm-data/
  -- job-actuals.ts`). Every one of these now raises rather than skips.
  if new.payload ? 'fieldIds' then
    if jsonb_typeof(new.payload -> 'fieldIds') <> 'array' then
      raise exception 'job_actuals: fieldIds must be a JSON array (session %)', new.job_session_id
        using errcode = 'check_violation';
    end if;
    for field_id_elem in select * from jsonb_array_elements(new.payload -> 'fieldIds')
    loop
      if jsonb_typeof(field_id_elem) <> 'string' then
        raise exception 'job_actuals: fieldIds must contain only string ids, found a % (session %)', jsonb_typeof(field_id_elem), new.job_session_id
          using errcode = 'check_violation';
      end if;
      perform public.assert_field_belongs_to_farm((field_id_elem #>> '{}')::uuid, new.farm_id);
    end loop;
  end if;
  if new.payload ? 'livestockGroupId' then
    if jsonb_typeof(new.payload -> 'livestockGroupId') <> 'string' then
      raise exception 'job_actuals: livestockGroupId must be a string (session %)', new.job_session_id
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.livestock_groups
      where id = (new.payload ->> 'livestockGroupId')::uuid and farm_id = new.farm_id
    ) then
      raise exception 'job_actuals: livestock group % does not belong to farm %', new.payload ->> 'livestockGroupId', new.farm_id
        using errcode = 'check_violation';
    end if;
  end if;
  if new.payload ? 'animalId' then
    if jsonb_typeof(new.payload -> 'animalId') <> 'string' then
      raise exception 'job_actuals: animalId must be a string (session %)', new.job_session_id
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.livestock_individuals
      where id = (new.payload ->> 'animalId')::uuid and farm_id = new.farm_id
    ) then
      raise exception 'job_actuals: animal % does not belong to farm %', new.payload ->> 'animalId', new.farm_id
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger job_actuals_same_farm
  before insert on public.job_actuals
  for each row execute function public.job_actuals_check_same_farm();

-- ---------------------------------------------------------------------------
-- RLS -- select+insert only, identical posture to decisions/telemetry_events
-- ("a recorded fact, once made, is historical" -- no update/delete policy
-- or grant on this table, ever).
-- ---------------------------------------------------------------------------
alter table public.job_actuals enable row level security;

create policy job_actuals_owner_select on public.job_actuals
  for select to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy job_actuals_owner_insert on public.job_actuals
  for insert to authenticated
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.job_actuals from anon;
grant select, insert on public.job_actuals to authenticated;

-- ---------------------------------------------------------------------------
-- job_actuals_check_valid_revision: closes a real Codex audit HIGH
-- (round 1, docs/overnight/audits/
-- gps-job-session-actual-contract-codex-audit-round1.md): nothing
-- previously stopped a raw insert (or a buggy future application-layer
-- change) from choosing an arbitrary positive `revision`/
-- `supersedes_revision` pair -- a gap in the sequence, or a
-- `supersedes_revision` that doesn't actually name the immediately
-- prior revision, would corrupt the "current = max(revision)" and
-- "supersedes names what this corrects" invariants
-- `src/lib/farm-data/job-actuals.ts`'s own header comment relies on.
-- Enforced here, independent of the application layer that already
-- constructs revisions correctly by construction
-- (`confirmJobSessionActual`'s own `currentMaxRevision + 1` logic): the
-- database is not the only writer this schema ever assumes (`CLAUDE.md`).
-- ---------------------------------------------------------------------------
create or replace function public.job_actuals_check_valid_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.revision = 1 then
    if new.supersedes_revision is not null then
      raise exception 'job_actuals: revision 1 must have supersedes_revision null (session %)', new.job_session_id
        using errcode = 'check_violation';
    end if;
  else
    if new.supersedes_revision is distinct from new.revision - 1 then
      raise exception 'job_actuals: revision % must have supersedes_revision = % (session %)', new.revision, new.revision - 1, new.job_session_id
        using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.job_actuals
      where job_session_id = new.job_session_id and revision = new.revision - 1
    ) then
      raise exception 'job_actuals: revision % inserted with no prior revision % for session % -- revisions must be gapless',
        new.revision, new.revision - 1, new.job_session_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger job_actuals_valid_revision
  before insert on public.job_actuals
  for each row execute function public.job_actuals_check_valid_revision();

-- ---------------------------------------------------------------------------
-- job_sessions_check_valid_transition, re-defined (create or replace,
-- same function/trigger name `20260902000000_job_sessions.sql` already
-- created): now that `job_actuals` exists, this closes the same round-1
-- audit's own first finding -- a session could otherwise reach
-- `confirmed_actual` via a direct client `update` (the column-scoped
-- grant on `job_sessions.status` already allows the column to change;
-- nothing previously checked that a real `job_actuals` row justifies
-- this specific transition). Could not be checked in the foundation
-- migration above, which runs before this table exists -- see that
-- migration's own comment on this same function.
-- ---------------------------------------------------------------------------
create or replace function public.job_sessions_check_valid_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
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
  elsif old.status = 'completed_estimated' and new.status = 'confirmed_actual' then
    if not exists (select 1 from public.job_actuals where job_session_id = new.id) then
      raise exception 'job_sessions: cannot transition to confirmed_actual with no job_actuals row for session %', new.id
        using errcode = 'check_violation';
    end if;
  elsif old.status = 'completed_estimated' and new.status = 'cancelled' then
    -- Codex audit MEDIUM (round 4, docs/overnight/audits/
    -- gps-job-session-actual-contract-codex-audit-round4.md): round 3's
    -- own `for share` lock on job_actuals_check_same_farm's own insert
    -- only serializes against a *concurrent* cancellation racing that one
    -- insert transaction -- it does nothing once that transaction has
    -- committed. Confirming an Actual is two separate statements from
    -- the application's own perspective (`confirmJobSessionActual`
    -- inserts job_actuals, then a later, separate call moves
    -- `job_sessions.status` to `confirmed_actual`) with a real window
    -- between them; a cancellation landing in that window previously hit
    -- this exact branch and succeeded, leaving a real job_actuals row
    -- permanently attached to a `cancelled` session. Symmetric with the
    -- `confirmed_actual` branch just above (which *requires* a
    -- job_actuals row to exist): cancellation is now illegal once one
    -- already does -- a session that has recorded a real Actual is a
    -- fact of the past, not something to cancel away.
    if exists (select 1 from public.job_actuals where job_session_id = new.id) then
      raise exception 'job_sessions: cannot cancel session % -- a job_actuals row already exists for it (a recorded Actual cannot be cancelled away)', new.id
        using errcode = 'check_violation';
    end if;
  else
    raise exception 'job_sessions: invalid status transition % -> % (id %)', old.status, new.status, old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Status: PENDING_DEV_VALIDATION -- not yet applied to any database
