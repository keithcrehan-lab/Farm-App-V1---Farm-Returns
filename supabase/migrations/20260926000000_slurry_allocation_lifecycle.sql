-- Phase 1A — canonical slurry allocation lifecycle and store reconciliation.
--
-- Design record: docs/farm-return-next/SLURRY_ALLOCATION_LIFECYCLE.md.
-- Domain mirror: src/domain/slurry-allocation-lifecycle.ts.
--
-- Before this migration a `slurry_allocations` row reserved physical slurry
-- forever: there was no edit/cancel/complete lifecycle, every row counted
-- against its store (`20260925020000_slurry_allocations_store_capacity_invariant.sql`),
-- and nothing distinguished "planned" from "spread".
--
-- PHYSICAL resource accounting only. Nothing here converts physical m³ to
-- regulatory neat slurry or derives statutory N/P from any volume
-- (docs/farm-return-next/SLURRY_RECOMMENDATION_EVIDENCE_AUDIT.md).
--
-- 1. Lifecycle (`slurry_allocations.status`): 'planned' | 'completed' |
--    'cancelled'. Permitted transitions: planned → planned (edit),
--    planned → completed, planned → cancelled. A completed or cancelled
--    row is immutable and cannot be deleted while its store and farm
--    exist. Every existing row is a current plan and becomes 'planned';
--    no completion/cancellation history is invented.
--
-- 2. Store observation baseline (`housing.store_observation_seq`,
--    `housing.store_observed_at`). The existing store model is one
--    point-in-time observation, `storage_capacity_m3 × storage_fill_pct`.
--    `storage_fill_recorded_at` cannot serve as its identity: it is set by
--    the application, nulled whenever a fill is saved as 'estimated', and
--    can be re-stamped by a form re-save. The sequence is database-owned:
--    it starts at 1 and advances ONLY on a genuine new store-volume
--    observation — a write that leaves the row `farmer_recorded` with a
--    NEW, non-null `storage_fill_recorded_at` (the canonical
--    `record_slurry_store_observation`, or the Housing form when the
--    farmer actually typed a fill this session — `housing/page.tsx`
--    `fillPctTouched`). A direct write to `store_observation_seq` or
--    `store_observed_at` is discarded (both are reset to their old
--    values), so it can never manufacture a baseline. NOT observations,
--    so completed withdrawals stay deducted: an 'estimated' fill change
--    (a correction of the current baseline, not a tank reading), a
--    capacity-only correction, a `farmer_recorded` fill change that keeps
--    the old reading timestamp, and any other housing edit.
--    Existing rows keep `store_observed_at` NULL: the observation instant
--    is unknown, bounded above by
--    coalesce(storage_fill_recorded_at, updated_at).
--
-- 3. Reconciled physical volume (the ONLY available-volume algorithm):
--
--      observed      = capacity × fill% / 100   (null/non-finite → 0)
--      withdrawn     = Σ actual_volume_m3 of completed rows of the store
--                      with store_reconciliation = 'withdrawn_after_observation'
--                      and store_observation_seq = the store's current seq
--      reconciled    = observed − withdrawn
--      reserved      = Σ volume_m3 of 'planned' rows of the store
--      available     = round(max(0, reconciled − reserved), 2)
--
--    A new observation supersedes every earlier withdrawal (they are
--    counted against an older seq), so nothing is subtracted twice, and a
--    completion is never subtracted from an observation that already
--    reflects it (rule 4).
--
-- 4. Completion. The caller supplies the actual physical volume spread
--    (> 0; planned volume is preserved separately), the actual spread date
--    (not in the future, Europe/Dublin) and how the spread relates to the
--    store's current observation:
--      spread date AFTER the observation date      → 'withdrawn_after_observation' only
--      spread date BEFORE an exactly-timed observation → 'reflected_in_observation' only
--      otherwise (same day, or before a legacy observation of unknown time)
--        → ambiguous: the caller must state which; the RPC raises
--          RECONCILIATION_REQUIRED rather than guess.
--    'withdrawn' completions need actual ≤ reconciled − other reservations
--    (actual < planned releases the rest, actual > planned only succeeds
--    when unreserved slurry exists). 'reflected' completions consume
--    nothing further — the observation already excludes that slurry.
--    `store_observation_seq` is stamped from the locked store row.
--
-- 5. Store observations that conflict with active reservations are
--    rejected (`housing_store_volume_below_allocated`, detail carries the
--    observed/withdrawn/reserved figures). Reservations are never
--    cancelled or shrunk automatically; completed/cancelled rows no longer
--    block a legitimately lower observation.
--
-- Concurrency: every consuming write (insert, volume increase, store move,
-- 'withdrawn' completion) and every store-volume reduction locks the one
-- store row it consumes (`select … for update`) before summing. Lifecycle
-- RPCs lock the allocation row first, then the store — the same order
-- every direct UPDATE takes. REPEATABLE READ is refused (stale post-lock
-- snapshot), as before.
--
-- Security: all functions are `security invoker` with a pinned
-- search_path — RLS, grants and `slurry_allocations_same_farm` still apply.
-- Direct authenticated table writes go through the same triggers as the
-- RPCs, so no path bypasses the invariant or the transition rules.
--
-- Forward-only. The `(field_id, housing_id)` unique constraint becomes a
-- partial unique index over 'planned' rows so a field can be planned again
-- from the same store after a completion/cancellation; no row is modified.
--
-- Status: NOT YET APPLIED to `Farm Return V1 Dev`; not executed against
-- any PostgreSQL server (none is available to this repository's runner).

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.housing
  add column store_observation_seq bigint not null default 1 check (store_observation_seq >= 1),
  add column store_observed_at timestamptz;

alter table public.slurry_allocations
  add column status text not null default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  add column actual_volume_m3 double precision,
  add column actual_spread_date date,
  add column store_reconciliation text check (store_reconciliation in ('withdrawn_after_observation', 'reflected_in_observation')),
  add column store_observation_seq bigint,
  add column completed_at timestamptz,
  add column completed_by uuid,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid;

alter table public.slurry_allocations
  add constraint slurry_allocations_lifecycle_valid check (
    (
      status = 'planned'
      and actual_volume_m3 is null and actual_spread_date is null and store_reconciliation is null
      and store_observation_seq is null and completed_at is null and completed_by is null
      and cancelled_at is null and cancelled_by is null
    ) or (
      status = 'completed'
      and actual_volume_m3 is not null and actual_volume_m3 > 0 and actual_volume_m3 < 'Infinity'::double precision
      and actual_spread_date is not null and store_reconciliation is not null
      and store_observation_seq is not null and completed_at is not null
      and cancelled_at is null and cancelled_by is null
    ) or (
      status = 'cancelled'
      and cancelled_at is not null
      and actual_volume_m3 is null and actual_spread_date is null and store_reconciliation is null
      and store_observation_seq is null and completed_at is null and completed_by is null
    )
  );

alter table public.slurry_allocations drop constraint slurry_allocations_field_id_housing_id_key;
create unique index slurry_allocations_one_plan_per_field_store
  on public.slurry_allocations (field_id, housing_id) where status = 'planned';

create index slurry_allocations_active_reservations_idx
  on public.slurry_allocations (housing_id) where status = 'planned';
create index slurry_allocations_store_withdrawals_idx
  on public.slurry_allocations (housing_id, store_observation_seq) where status = 'completed';

-- ---------------------------------------------------------------------------
-- Shared arithmetic — one implementation used by every trigger and RPC.
-- ---------------------------------------------------------------------------

create or replace function public.slurry_store_observed_volume_m3(p_capacity_m3 double precision, p_fill_pct double precision)
returns double precision
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when v is null or v = 'NaN'::double precision or v = 'Infinity'::double precision or v = '-Infinity'::double precision then 0::double precision
    else v
  end
  from (select p_capacity_m3 * (p_fill_pct / 100) as v) observed
$$;

create or replace function public.slurry_store_withdrawn_since_observation_m3(p_housing_id uuid, p_observation_seq bigint)
returns double precision
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce(sum(actual_volume_m3), 0)::double precision
  from public.slurry_allocations
  where housing_id = p_housing_id
    and status = 'completed'
    and store_reconciliation = 'withdrawn_after_observation'
    and store_observation_seq = p_observation_seq
$$;

create or replace function public.slurry_store_active_reserved_m3(p_housing_id uuid, p_exclude_allocation_id uuid)
returns double precision
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select coalesce(sum(volume_m3), 0)::double precision
  from public.slurry_allocations
  where housing_id = p_housing_id
    and status = 'planned'
    and id is distinct from p_exclude_allocation_id
$$;

-- Which store reconciliations a completion spread on `p_spread_date` may
-- use against the store's CURRENT observation: 'withdrawn_after_observation',
-- 'reflected_in_observation', or 'ambiguous' (either, caller must choose).
create or replace function public.slurry_store_reconciliation_for_spread(p_store public.housing, p_spread_date date)
returns text
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  observation_exact boolean := p_store.store_observed_at is not null or p_store.storage_fill_recorded_at is not null;
  observation_date date := (coalesce(p_store.store_observed_at, p_store.storage_fill_recorded_at, p_store.updated_at) at time zone 'Europe/Dublin')::date;
begin
  if p_spread_date > observation_date then
    return 'withdrawn_after_observation';
  end if;
  if p_spread_date < observation_date and observation_exact then
    return 'reflected_in_observation';
  end if;
  return 'ambiguous';
end;
$$;

revoke all on function public.slurry_store_observed_volume_m3(double precision, double precision) from public, anon;
revoke all on function public.slurry_store_withdrawn_since_observation_m3(uuid, bigint) from public, anon;
revoke all on function public.slurry_store_active_reserved_m3(uuid, uuid) from public, anon;
revoke all on function public.slurry_store_reconciliation_for_spread(public.housing, date) from public, anon;
grant execute on function public.slurry_store_observed_volume_m3(double precision, double precision) to authenticated;
grant execute on function public.slurry_store_withdrawn_since_observation_m3(uuid, bigint) to authenticated;
grant execute on function public.slurry_store_active_reserved_m3(uuid, uuid) to authenticated;
grant execute on function public.slurry_store_reconciliation_for_spread(public.housing, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Housing: database-owned observation sequence.
-- Fires before `housing_store_volume_covers_allocations` (name order).
-- ---------------------------------------------------------------------------

create or replace function public.housing_track_store_observation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.store_observation_seq := 1;
    new.store_observed_at := clock_timestamp();
    return new;
  end if;

  -- The identity columns are never taken from the write itself: a direct
  -- write to `store_observation_seq`/`store_observed_at` is discarded.
  -- Only a freshly-stamped farmer-recorded reading is a new observation.
  if new.storage_fill_status = 'farmer_recorded'
    and new.storage_fill_recorded_at is not null
    and new.storage_fill_recorded_at is distinct from old.storage_fill_recorded_at then
    new.store_observation_seq := old.store_observation_seq + 1;
    new.store_observed_at := clock_timestamp();
  else
    new.store_observation_seq := old.store_observation_seq;
    new.store_observed_at := old.store_observed_at;
  end if;
  return new;
end;
$$;

revoke all on function public.housing_track_store_observation() from public, anon;

drop trigger if exists housing_store_observation on public.housing;
create trigger housing_store_observation
  before insert or update on public.housing
  for each row execute function public.housing_track_store_observation();

-- ---------------------------------------------------------------------------
-- Housing: a store-volume change may not leave active reservations above
-- the reconciled volume. Only reductions of the reconciled volume are
-- checked, so re-saving an unchanged store is never blocked.
-- ---------------------------------------------------------------------------

create or replace function public.housing_enforce_store_volume_covers_allocations()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  old_observed_m3 double precision;
  new_observed_m3 double precision;
  old_reconciled_m3 double precision;
  new_reconciled_m3 double precision;
  withdrawn_m3 double precision;
  reserved_m3 double precision;
begin
  old_observed_m3 := public.slurry_store_observed_volume_m3(old.storage_capacity_m3, old.storage_fill_pct);
  new_observed_m3 := public.slurry_store_observed_volume_m3(new.storage_capacity_m3, new.storage_fill_pct);

  if new.store_observation_seq = old.store_observation_seq and new_observed_m3 >= old_observed_m3 then
    return new;
  end if;

  if current_setting('transaction_isolation') = 'repeatable read' then
    raise exception 'slurry_allocation_capacity_requires_read_committed_or_serializable'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform 1 from public.housing where id = old.id for update;

  old_reconciled_m3 := old_observed_m3 - public.slurry_store_withdrawn_since_observation_m3(old.id, old.store_observation_seq);
  withdrawn_m3 := public.slurry_store_withdrawn_since_observation_m3(old.id, new.store_observation_seq);
  new_reconciled_m3 := new_observed_m3 - withdrawn_m3;

  if new_reconciled_m3 >= old_reconciled_m3 then
    return new;
  end if;

  reserved_m3 := public.slurry_store_active_reserved_m3(old.id, null);

  if round((new_reconciled_m3 - reserved_m3)::numeric, 2) < 0 then
    raise exception 'housing_store_volume_below_allocated' using errcode = 'check_violation',
      detail = format('observed %s m³, withdrawn since observation %s m³, active reservations %s m³ — reconciliation required',
        round(new_observed_m3::numeric, 2), round(withdrawn_m3::numeric, 2), round(reserved_m3::numeric, 2));
  end if;

  return new;
end;
$$;

revoke all on function public.housing_enforce_store_volume_covers_allocations() from public, anon;

drop trigger if exists housing_store_volume_covers_allocations on public.housing;
-- Every UPDATE (not a column list): `before update of` matches the
-- statement's SET list, not the observation trigger's own changes, so a
-- write of only `storage_fill_recorded_at` could otherwise start a new
-- observation unchecked. The function's early return keeps unchanged
-- re-saves cheap.
create trigger housing_store_volume_covers_allocations
  before update on public.housing
  for each row execute function public.housing_enforce_store_volume_covers_allocations();

-- ---------------------------------------------------------------------------
-- Allocations: lifecycle transitions + capacity, for every write path.
-- Same function/trigger names as 20260925020000 — replaced, not duplicated.
-- ---------------------------------------------------------------------------

create or replace function public.slurry_allocations_enforce_store_capacity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  store public.housing;
  consumed_m3 double precision;
  allowed_reconciliation text;
  reconciled_m3 double precision;
  reserved_m3 double precision;
  available_m3 numeric;
begin
  if new.volume_m3 is null
    or new.volume_m3 = 'NaN'::double precision
    or new.volume_m3 = 'Infinity'::double precision
    or new.volume_m3 = '-Infinity'::double precision
    or new.volume_m3 < 0 then
    raise exception 'slurry_allocation_plan_rejected:VOLUME_INVALID' using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'planned' then
      raise exception 'slurry_allocation_lifecycle_rejected:NOT_PLANNED' using errcode = 'check_violation';
    end if;
    consumed_m3 := new.volume_m3;
  else
    if old.status <> 'planned' then
      raise exception 'slurry_allocation_lifecycle_rejected:NOT_PLANNED' using errcode = 'check_violation';
    end if;
    if new.id <> old.id or new.farm_id <> old.farm_id or new.created_at <> old.created_at then
      raise exception 'slurry_allocation_lifecycle_rejected:TRANSITION_INVALID' using errcode = 'check_violation';
    end if;

    if new.status = 'planned' then
      if new.housing_id = old.housing_id and new.volume_m3 <= old.volume_m3 then
        return new;
      end if;
      consumed_m3 := new.volume_m3;
    elsif new.status in ('completed', 'cancelled') then
      if new.volume_m3 <> old.volume_m3 or new.housing_id <> old.housing_id or new.field_id <> old.field_id then
        raise exception 'slurry_allocation_lifecycle_rejected:TRANSITION_CHANGES_PLAN' using errcode = 'check_violation';
      end if;
      if new.status = 'cancelled' then
        new.cancelled_at := clock_timestamp();
        new.cancelled_by := auth.uid();
        return new;
      end if;

      if new.actual_volume_m3 is null
        or new.actual_volume_m3 = 'NaN'::double precision
        or new.actual_volume_m3 = 'Infinity'::double precision
        or new.actual_volume_m3 <= 0 then
        raise exception 'slurry_allocation_lifecycle_rejected:ACTUAL_VOLUME_INVALID' using errcode = 'check_violation';
      end if;
      if new.actual_spread_date is null or new.actual_spread_date > (now() at time zone 'Europe/Dublin')::date then
        raise exception 'slurry_allocation_lifecycle_rejected:SPREAD_DATE_INVALID' using errcode = 'check_violation';
      end if;
      if new.store_reconciliation is null then
        raise exception 'slurry_allocation_lifecycle_rejected:RECONCILIATION_REQUIRED' using errcode = 'check_violation';
      end if;
      new.completed_at := clock_timestamp();
      new.completed_by := auth.uid();
      consumed_m3 := case when new.store_reconciliation = 'withdrawn_after_observation' then new.actual_volume_m3 end;
    else
      raise exception 'slurry_allocation_lifecycle_rejected:TRANSITION_INVALID' using errcode = 'check_violation';
    end if;
  end if;

  if current_setting('transaction_isolation') = 'repeatable read' then
    raise exception 'slurry_allocation_capacity_requires_read_committed_or_serializable'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select * into store from public.housing where id = new.housing_id and farm_id = new.farm_id for update;
  if not found then
    raise exception 'slurry_allocation_plan_rejected:STORE_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;

  if new.status = 'completed' then
    new.store_observation_seq := store.store_observation_seq;
    allowed_reconciliation := public.slurry_store_reconciliation_for_spread(store, new.actual_spread_date);
    if allowed_reconciliation <> 'ambiguous' and allowed_reconciliation <> new.store_reconciliation then
      raise exception 'slurry_allocation_lifecycle_rejected:RECONCILIATION_INVALID' using errcode = 'check_violation',
        detail = format('spread %s against store observation %s permits only %s', new.actual_spread_date, store.store_observation_seq, allowed_reconciliation);
    end if;
  end if;

  if consumed_m3 is null then
    return new;
  end if;

  reconciled_m3 := public.slurry_store_observed_volume_m3(store.storage_capacity_m3, store.storage_fill_pct)
    - public.slurry_store_withdrawn_since_observation_m3(store.id, store.store_observation_seq);
  reserved_m3 := public.slurry_store_active_reserved_m3(store.id, new.id);
  available_m3 := round(greatest(0, reconciled_m3 - reserved_m3)::numeric, 2);
  if consumed_m3::numeric > available_m3 then
    raise exception 'slurry_allocation_plan_rejected:VOLUME_EXCEEDS_AVAILABLE' using errcode = 'check_violation',
      detail = format('requested %s m³, available %s m³', consumed_m3, available_m3);
  end if;

  return new;
end;
$$;

revoke all on function public.slurry_allocations_enforce_store_capacity() from public, anon;

-- Every UPDATE, not only volume/store: status transitions and lifecycle
-- columns must go through the same checks.
drop trigger if exists slurry_allocations_store_capacity on public.slurry_allocations;
create trigger slurry_allocations_store_capacity
  before insert or update on public.slurry_allocations
  for each row execute function public.slurry_allocations_enforce_store_capacity();

-- History protection: completed/cancelled rows cannot be deleted directly.
-- A delete cascading from the store's or farm's own deletion is allowed
-- (the store/farm row is already gone by then). A field hard delete with
-- lifecycle history is refused — fields are archived, not deleted.
create or replace function public.slurry_allocations_protect_lifecycle_history()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if old.status = 'planned' then
    return old;
  end if;
  if not exists (select 1 from public.housing where id = old.housing_id)
    or not exists (select 1 from public.farms where id = old.farm_id) then
    return old;
  end if;
  raise exception 'slurry_allocation_lifecycle_rejected:HISTORY_PROTECTED' using errcode = 'check_violation';
end;
$$;

revoke all on function public.slurry_allocations_protect_lifecycle_history() from public, anon;

drop trigger if exists slurry_allocations_lifecycle_history on public.slurry_allocations;
create trigger slurry_allocations_lifecycle_history
  before delete on public.slurry_allocations
  for each row execute function public.slurry_allocations_protect_lifecycle_history();

-- ---------------------------------------------------------------------------
-- RPCs — one canonical persistence path per transition. Each checks
-- ownership and lifecycle state and performs exactly one row write; the
-- triggers above are the single capacity/transition implementation.
-- ---------------------------------------------------------------------------

create or replace function public.create_farmer_planned_slurry_allocation(
  p_farm_id uuid,
  p_field_id uuid,
  p_housing_id uuid,
  p_volume_m3 double precision,
  p_application_method jsonb,
  p_application_date jsonb
)
returns public.slurry_allocations
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  inserted public.slurry_allocations;
begin
  if p_volume_m3 is null or p_volume_m3 = 'NaN'::double precision or p_volume_m3 = 'Infinity'::double precision or p_volume_m3 <= 0 then
    raise exception 'slurry_allocation_plan_rejected:VOLUME_INVALID' using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.housing where id = p_housing_id and farm_id = p_farm_id) then
    raise exception 'slurry_allocation_plan_rejected:STORE_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;

  if not exists (select 1 from public.fields where id = p_field_id and farm_id = p_farm_id and archived_at is null) then
    raise exception 'slurry_allocation_plan_rejected:FIELD_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;

  if exists (select 1 from public.slurry_allocations where field_id = p_field_id and housing_id = p_housing_id and status = 'planned') then
    raise exception 'slurry_allocation_plan_rejected:ALREADY_PLANNED_FROM_STORE' using errcode = 'unique_violation';
  end if;

  -- Store lock + capacity: `slurry_allocations_store_capacity` trigger.
  insert into public.slurry_allocations (
    farm_id, field_id, housing_id, priority, score, volume_m3, application_method, application_date
  ) values (
    p_farm_id, p_field_id, p_housing_id, null, null, p_volume_m3, p_application_method, p_application_date
  )
  returning * into inserted;

  return inserted;
end;
$$;

revoke all on function public.create_farmer_planned_slurry_allocation(uuid, uuid, uuid, double precision, jsonb, jsonb) from public, anon;
grant execute on function public.create_farmer_planned_slurry_allocation(uuid, uuid, uuid, double precision, jsonb, jsonb) to authenticated;

create or replace function public.update_planned_slurry_allocation(
  p_farm_id uuid,
  p_allocation_id uuid,
  p_field_id uuid,
  p_housing_id uuid,
  p_volume_m3 double precision
)
returns public.slurry_allocations
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_row public.slurry_allocations;
  updated public.slurry_allocations;
begin
  if p_volume_m3 is null or p_volume_m3 = 'NaN'::double precision or p_volume_m3 = 'Infinity'::double precision or p_volume_m3 <= 0 then
    raise exception 'slurry_allocation_plan_rejected:VOLUME_INVALID' using errcode = 'check_violation';
  end if;

  select * into current_row from public.slurry_allocations where id = p_allocation_id and farm_id = p_farm_id for update;
  if not found then
    raise exception 'slurry_allocation_lifecycle_rejected:ALLOCATION_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;
  if current_row.status <> 'planned' then
    raise exception 'slurry_allocation_lifecycle_rejected:NOT_PLANNED' using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.housing where id = p_housing_id and farm_id = p_farm_id) then
    raise exception 'slurry_allocation_plan_rejected:STORE_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;
  if not exists (select 1 from public.fields where id = p_field_id and farm_id = p_farm_id and archived_at is null) then
    raise exception 'slurry_allocation_plan_rejected:FIELD_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;
  if exists (
    select 1 from public.slurry_allocations
    where field_id = p_field_id and housing_id = p_housing_id and status = 'planned' and id <> p_allocation_id
  ) then
    raise exception 'slurry_allocation_plan_rejected:ALREADY_PLANNED_FROM_STORE' using errcode = 'unique_violation';
  end if;

  -- Store lock + capacity (increase or move): the trigger.
  update public.slurry_allocations
    set field_id = p_field_id, housing_id = p_housing_id, volume_m3 = p_volume_m3
    where id = p_allocation_id
    returning * into updated;

  return updated;
end;
$$;

revoke all on function public.update_planned_slurry_allocation(uuid, uuid, uuid, uuid, double precision) from public, anon;
grant execute on function public.update_planned_slurry_allocation(uuid, uuid, uuid, uuid, double precision) to authenticated;

-- Idempotent: cancelling an already-cancelled allocation returns it unchanged.
create or replace function public.cancel_planned_slurry_allocation(p_farm_id uuid, p_allocation_id uuid)
returns public.slurry_allocations
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_row public.slurry_allocations;
  updated public.slurry_allocations;
begin
  select * into current_row from public.slurry_allocations where id = p_allocation_id and farm_id = p_farm_id for update;
  if not found then
    raise exception 'slurry_allocation_lifecycle_rejected:ALLOCATION_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;
  if current_row.status = 'cancelled' then
    return current_row;
  end if;
  if current_row.status <> 'planned' then
    raise exception 'slurry_allocation_lifecycle_rejected:NOT_PLANNED' using errcode = 'check_violation';
  end if;

  update public.slurry_allocations set status = 'cancelled' where id = p_allocation_id returning * into updated;
  return updated;
end;
$$;

revoke all on function public.cancel_planned_slurry_allocation(uuid, uuid) from public, anon;
grant execute on function public.cancel_planned_slurry_allocation(uuid, uuid) to authenticated;

-- Not idempotent by design: a second completion is rejected
-- (ALREADY_COMPLETED), so slurry can never be consumed twice.
create or replace function public.complete_planned_slurry_allocation(
  p_farm_id uuid,
  p_allocation_id uuid,
  p_actual_volume_m3 double precision,
  p_actual_spread_date date,
  p_store_reconciliation text
)
returns public.slurry_allocations
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  current_row public.slurry_allocations;
  store public.housing;
  reconciliation text := p_store_reconciliation;
  allowed_reconciliation text;
  updated public.slurry_allocations;
begin
  select * into current_row from public.slurry_allocations where id = p_allocation_id and farm_id = p_farm_id for update;
  if not found then
    raise exception 'slurry_allocation_lifecycle_rejected:ALLOCATION_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;
  if current_row.status = 'completed' then
    raise exception 'slurry_allocation_lifecycle_rejected:ALREADY_COMPLETED' using errcode = 'check_violation';
  end if;
  if current_row.status <> 'planned' then
    raise exception 'slurry_allocation_lifecycle_rejected:NOT_PLANNED' using errcode = 'check_violation';
  end if;

  if p_actual_volume_m3 is null or p_actual_volume_m3 = 'NaN'::double precision or p_actual_volume_m3 = 'Infinity'::double precision or p_actual_volume_m3 <= 0 then
    raise exception 'slurry_allocation_lifecycle_rejected:ACTUAL_VOLUME_INVALID' using errcode = 'check_violation';
  end if;
  if p_actual_spread_date is null or p_actual_spread_date > (now() at time zone 'Europe/Dublin')::date then
    raise exception 'slurry_allocation_lifecycle_rejected:SPREAD_DATE_INVALID' using errcode = 'check_violation';
  end if;
  if reconciliation is not null and reconciliation not in ('withdrawn_after_observation', 'reflected_in_observation') then
    raise exception 'slurry_allocation_lifecycle_rejected:RECONCILIATION_INVALID' using errcode = 'check_violation';
  end if;

  if current_setting('transaction_isolation') = 'repeatable read' then
    raise exception 'slurry_allocation_capacity_requires_read_committed_or_serializable'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select * into store from public.housing where id = current_row.housing_id and farm_id = p_farm_id for update;
  if not found then
    raise exception 'slurry_allocation_plan_rejected:STORE_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;

  allowed_reconciliation := public.slurry_store_reconciliation_for_spread(store, p_actual_spread_date);
  if reconciliation is null then
    if allowed_reconciliation = 'ambiguous' then
      raise exception 'slurry_allocation_lifecycle_rejected:RECONCILIATION_REQUIRED' using errcode = 'check_violation',
        detail = format('spread %s is not clearly before or after store observation %s', p_actual_spread_date, store.store_observation_seq);
    end if;
    reconciliation := allowed_reconciliation;
  end if;

  -- Transition rules, store lock and capacity: the trigger.
  update public.slurry_allocations
    set status = 'completed',
        actual_volume_m3 = p_actual_volume_m3,
        actual_spread_date = p_actual_spread_date,
        store_reconciliation = reconciliation
    where id = p_allocation_id
    returning * into updated;

  return updated;
end;
$$;

revoke all on function public.complete_planned_slurry_allocation(uuid, uuid, double precision, date, text) from public, anon;
grant execute on function public.complete_planned_slurry_allocation(uuid, uuid, double precision, date, text) to authenticated;

-- Explicit farmer re-observation of a store's fill, even at an unchanged
-- percentage: always starts a new observation (supersedes earlier
-- withdrawals). A conflict with active reservations is rejected by
-- `housing_store_volume_covers_allocations`; nothing is cancelled.
create or replace function public.record_slurry_store_observation(p_farm_id uuid, p_housing_id uuid, p_fill_pct double precision)
returns public.housing
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  updated public.housing;
begin
  if p_fill_pct is null or p_fill_pct = 'NaN'::double precision or p_fill_pct < 0 or p_fill_pct > 100 then
    raise exception 'slurry_store_observation_rejected:FILL_INVALID' using errcode = 'check_violation';
  end if;

  -- clock_timestamp(), not now(): a second observation in the same
  -- transaction must still carry a new reading timestamp, which is what
  -- `housing_store_observation` recognises as a new observation.
  update public.housing
    set storage_fill_pct = p_fill_pct,
        storage_fill_status = 'farmer_recorded',
        storage_fill_recorded_at = clock_timestamp()
    where id = p_housing_id and farm_id = p_farm_id
    returning * into updated;
  if not found then
    raise exception 'slurry_store_observation_rejected:STORE_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;

  return updated;
end;
$$;

revoke all on function public.record_slurry_store_observation(uuid, uuid, double precision) from public, anon;
grant execute on function public.record_slurry_store_observation(uuid, uuid, double precision) to authenticated;
