-- Slurry allocation store-capacity invariant at the database boundary.
--
-- Codex audit MEDIUM (audit-20260925T181932Z): the store lock and capacity
-- check lived only inside `create_farmer_planned_slurry_allocation`.
-- `authenticated` still holds owner-scoped INSERT/UPDATE on
-- `slurry_allocations` (`20260828020000_rls_security_hardening.sql` — the
-- app's own method/date edits use it), so two direct inserts of 80 m³ for
-- different fields could persist 160 m³ against a 100 m³ store.
--
-- Invariant, for every write path (direct table INSERT/UPDATE, the RPC,
-- service role):
--
--   Σ slurry_allocations.volume_m3 for a store
--     ≤ housing.storage_capacity_m3 × housing.storage_fill_pct / 100
--
-- the same available figure `buildSlurryTankView`/`availableToPlanM3`
-- (`src/domain/slurry-storage.ts`, `src/domain/slurry-allocation-plan.ts`)
-- shows the farmer, at Phase 6's documented 2-decimal m³ precision. Every
-- row of the table counts towards its store (the repository has no
-- archived/cancelled allocation state). No new science and no default: a
-- store with a non-finite recorded volume has nothing available.
--
-- Enforcement: a BEFORE INSERT / UPDATE OF (volume_m3, housing_id) row
-- trigger. It is the ONLY capacity algorithm — the RPC below no longer
-- computes its own and relies on this trigger.
--
-- Which writes are checked:
--   * INSERT — always.
--   * UPDATE that keeps the store and does not increase volume — skipped:
--     it can only lower the store's total, so an unrelated edit (method,
--     date) or a reduction on a pre-existing over-allocated store is never
--     blocked.
--   * UPDATE that increases volume, or moves the row to another store —
--     checked against the destination store with this row excluded from
--     the destination's existing total (a move only ever lowers the source
--     store's total, so the source needs no check).
--   * Negative / NaN / ±Infinity `volume_m3` is rejected outright: a
--     negative row would otherwise "free" capacity for other rows.
--
-- Concurrency: the trigger takes `select … for update` on the destination
-- `public.housing` row — the resource whose capacity is consumed — before
-- summing. A concurrent writer to the same store blocks on that lock until
-- the first commits. Under READ COMMITTED (PostgREST/Supabase default) the
-- trigger's following `sum` statement takes a fresh snapshot and so sees
-- the first writer's committed row. Under SERIALIZABLE, SSI aborts one of
-- two conflicting writers. Under REPEATABLE READ the post-lock `sum` would
-- still read the transaction-start snapshot and could miss a concurrently
-- committed row, so the trigger refuses to run there (controlled error)
-- rather than silently under-count.
--
-- Lock ordering: exactly one housing row is locked per checked row write
-- (the destination), so this trigger introduces no multi-lock ordering
-- between stores. A move A→B locks only B; a concurrent move B→A locks
-- only A; neither waits on the other's store lock. (PostgreSQL's own
-- deadlock detector still covers any multi-statement transaction a caller
-- constructs; it aborts, it never over-allocates.) Housing fill-level
-- UPDATEs take the same row lock, so they serialise with allocation
-- writes to that store.
--
-- The store side of the same invariant: the canonical store-volume write
-- path is a direct owner-scoped UPDATE of `housing.storage_capacity_m3` /
-- `storage_fill_pct` (`src/lib/farm-data/housing.ts` `updateHousing`).
-- `housing_store_volume_covers_allocations` (BEFORE UPDATE OF those two
-- columns) rejects any UPDATE that would leave the store's persisted
-- allocations above its new available volume. Nothing is deleted, shrunk
-- or rewritten — the farmer must first lower or remove allocations. See
-- the second function below.
--
-- Security: `security invoker` — RLS and grants apply to the caller. The
-- trigger name sorts after `slurry_allocations_same_farm`, so the existing
-- cross-farm integrity check fires first; this trigger then only locks a
-- store visible to the caller under `housing_owner_all` (another farm's
-- store is reported as not found — no capacity figure of another farm is
-- ever revealed). The sum is over rows of the caller's own store, all of
-- which RLS shows it (same-farm integrity guarantees every allocation of a
-- store shares the store's farm). `search_path` is pinned.
--
-- Errors reuse the RPC's `slurry_allocation_plan_rejected:<ISSUE>` codes
-- so `createSlurryAllocation` maps them to the existing farmer-facing copy.
--
-- Forward-only and additive: no existing row is modified; existing grants,
-- RLS policies and triggers are unchanged.
--
-- Status: NOT YET APPLIED to `Farm Return V1 Dev`.

create or replace function public.slurry_allocations_enforce_store_capacity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  store public.housing;
  store_volume_m3 double precision;
  allocated_m3 double precision;
  available_m3 numeric;
begin
  if new.volume_m3 is null
    or new.volume_m3 = 'NaN'::double precision
    or new.volume_m3 = 'Infinity'::double precision
    or new.volume_m3 = '-Infinity'::double precision
    or new.volume_m3 < 0 then
    raise exception 'slurry_allocation_plan_rejected:VOLUME_INVALID' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and new.housing_id = old.housing_id and new.volume_m3 <= old.volume_m3 then
    return new;
  end if;

  if current_setting('transaction_isolation') = 'repeatable read' then
    raise exception 'slurry_allocation_capacity_requires_read_committed_or_serializable'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select * into store from public.housing where id = new.housing_id and farm_id = new.farm_id for update;
  if not found then
    raise exception 'slurry_allocation_plan_rejected:STORE_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;

  store_volume_m3 := store.storage_capacity_m3 * (store.storage_fill_pct / 100);
  if store_volume_m3 = 'NaN'::double precision
    or store_volume_m3 = 'Infinity'::double precision
    or store_volume_m3 = '-Infinity'::double precision then
    store_volume_m3 := 0;
  end if;

  select coalesce(sum(volume_m3), 0) into allocated_m3
    from public.slurry_allocations
    where housing_id = new.housing_id and id <> new.id;

  available_m3 := round(greatest(0, store_volume_m3 - allocated_m3)::numeric, 2);
  if new.volume_m3::numeric > available_m3 then
    raise exception 'slurry_allocation_plan_rejected:VOLUME_EXCEEDS_AVAILABLE' using errcode = 'check_violation',
      detail = format('requested %s m³, available %s m³', new.volume_m3, available_m3);
  end if;

  return new;
end;
$$;

revoke all on function public.slurry_allocations_enforce_store_capacity() from public, anon;

drop trigger if exists slurry_allocations_store_capacity on public.slurry_allocations;
create trigger slurry_allocations_store_capacity
  before insert or update of volume_m3, housing_id on public.slurry_allocations
  for each row execute function public.slurry_allocations_enforce_store_capacity();

-- Store-volume reductions. Same available-volume figure, same non-finite
-- handling (no recorded volume → nothing available) and same 2-decimal
-- precision as the allocation trigger: the UPDATE is rejected when
-- round(new store volume − Σ allocations of the store, 2) < 0, so a store
-- at 100 m³ with 80 m³ allocated can go to exactly 80 m³ but not 60 m³.
--
-- Only reductions are checked: an UPDATE whose new volume is not below the
-- old one (including re-saving the same capacity/fill from the Housing
-- form) can only increase what is available and is never blocked.
--
-- Concurrency: PostgreSQL row-locks the housing row being updated before
-- BEFORE ROW triggers run; the explicit `for update` below makes that
-- lock the documented precondition. It is the same row lock the allocation
-- trigger takes, so a store-volume reduction and an allocation write to
-- that store serialise; under READ COMMITTED the post-lock `sum` sees any
-- allocation committed while waiting. REPEATABLE READ is refused for the
-- same stale-snapshot reason as above. Only the store's own row is locked.
--
-- Security: `security invoker`, pinned `search_path` — the caller can only
-- reach this through an UPDATE that `housing_owner_all` already allowed,
-- and every allocation of that store shares its farm (same-farm trigger),
-- so RLS shows the caller the whole total.

create or replace function public.housing_enforce_store_volume_covers_allocations()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  old_volume_m3 double precision;
  new_volume_m3 double precision;
  allocated_m3 double precision;
begin
  old_volume_m3 := old.storage_capacity_m3 * (old.storage_fill_pct / 100);
  if old_volume_m3 is null
    or old_volume_m3 = 'NaN'::double precision
    or old_volume_m3 = 'Infinity'::double precision
    or old_volume_m3 = '-Infinity'::double precision then
    old_volume_m3 := 0;
  end if;

  new_volume_m3 := new.storage_capacity_m3 * (new.storage_fill_pct / 100);
  if new_volume_m3 is null
    or new_volume_m3 = 'NaN'::double precision
    or new_volume_m3 = 'Infinity'::double precision
    or new_volume_m3 = '-Infinity'::double precision then
    new_volume_m3 := 0;
  end if;

  if new_volume_m3 >= old_volume_m3 then
    return new;
  end if;

  if current_setting('transaction_isolation') = 'repeatable read' then
    raise exception 'slurry_allocation_capacity_requires_read_committed_or_serializable'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform 1 from public.housing where id = old.id for update;

  select coalesce(sum(volume_m3), 0) into allocated_m3
    from public.slurry_allocations
    where housing_id = old.id;

  if round((new_volume_m3 - allocated_m3)::numeric, 2) < 0 then
    raise exception 'housing_store_volume_below_allocated' using errcode = 'check_violation',
      detail = format('new store volume %s m³, allocated %s m³', round(new_volume_m3::numeric, 2), round(allocated_m3::numeric, 2));
  end if;

  return new;
end;
$$;

revoke all on function public.housing_enforce_store_volume_covers_allocations() from public, anon;

drop trigger if exists housing_store_volume_covers_allocations on public.housing;
create trigger housing_store_volume_covers_allocations
  before update of storage_capacity_m3, storage_fill_pct on public.housing
  for each row execute function public.housing_enforce_store_volume_covers_allocations();

-- The farmer-plan RPC keeps its farmer-plan-specific checks (volume > 0,
-- store/field ownership, one plan per field/store) and delegates the
-- store lock and capacity check to the trigger above, so there is one
-- capacity algorithm. Signature, grants and error codes are unchanged.

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

  if exists (select 1 from public.slurry_allocations where field_id = p_field_id and housing_id = p_housing_id) then
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
