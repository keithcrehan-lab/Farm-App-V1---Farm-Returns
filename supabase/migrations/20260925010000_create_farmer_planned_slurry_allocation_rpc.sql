-- Slurry planning entry — atomic, store-locked allocation creation.
--
-- Codex audit MEDIUM (audit-20260925T174821Z): `createSlurryAllocationAction`
-- read a store's available volume, validated in application code, then
-- inserted in a separate statement. Two concurrent saves could each read
-- 100 m³ available, each validate 80 m³ for different fields, and both
-- insert — 160 m³ committed against 100 m³ of real slurry. The
-- `unique (field_id, housing_id)` constraint does not prevent that.
--
-- This function re-checks ownership and available volume and inserts in
-- ONE transaction, under a row lock on the canonical slurry store
-- (`public.housing`) whose volume is being consumed. A second concurrent
-- call for the same store blocks on `for update` until the first commits;
-- under READ COMMITTED its subsequent `sum(volume_m3)` statement then sees
-- the first call's committed row, so the pair can never collectively
-- exceed the store's real volume. Housing fill-level updates take the same
-- row lock (any UPDATE does), so a fill change cannot interleave either.
--
-- Available volume is the same figure `buildSlurryTankView`/
-- `availableToPlanM3` (`src/domain/slurry-storage.ts`,
-- `src/domain/slurry-allocation-plan.ts`) shows the farmer:
-- max(0, capacity × fill% / 100 − Σ allocated), at Phase 6's documented
-- 2-decimal m³ precision (`SLURRY_VOLUME_MAX_DECIMAL_PLACES`). No new
-- science and no default: a store with no recorded volume has nothing
-- available, never a fabricated remainder.
--
-- `priority`/`score` are written as NULL — a farmer-planned allocation is
-- not ranked (`20260925000000_slurry_allocations_farmer_planned.sql`).
--
-- Rejections raise `slurry_allocation_plan_rejected:<ISSUE>` where ISSUE is
-- a `SlurryAllocationPlanIssue` code, so the application maps them to the
-- same farmer-facing copy its own pre-validation uses.
--
-- `security invoker`: the existing RLS policies, grants and the
-- `slurry_allocations_same_farm` trigger all still apply to the caller —
-- another farm's field or store is invisible here and is reported as not
-- found. Forward-only and additive: no existing object is altered.
--
-- Status: NOT YET APPLIED to `Farm Return V1 Dev`.

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
  store public.housing;
  allocated_m3 double precision;
  available_m3 numeric;
  inserted public.slurry_allocations;
begin
  if p_volume_m3 is null or p_volume_m3 = 'NaN'::double precision or p_volume_m3 = 'Infinity'::double precision or p_volume_m3 <= 0 then
    raise exception 'slurry_allocation_plan_rejected:VOLUME_INVALID' using errcode = 'check_violation';
  end if;

  select * into store from public.housing where id = p_housing_id and farm_id = p_farm_id for update;
  if not found then
    raise exception 'slurry_allocation_plan_rejected:STORE_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;

  if not exists (select 1 from public.fields where id = p_field_id and farm_id = p_farm_id and archived_at is null) then
    raise exception 'slurry_allocation_plan_rejected:FIELD_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;

  if exists (select 1 from public.slurry_allocations where field_id = p_field_id and housing_id = p_housing_id) then
    raise exception 'slurry_allocation_plan_rejected:ALREADY_PLANNED_FROM_STORE' using errcode = 'unique_violation';
  end if;

  select coalesce(sum(volume_m3), 0) into allocated_m3 from public.slurry_allocations where housing_id = p_housing_id;
  available_m3 := round(greatest(0, store.storage_capacity_m3 * (store.storage_fill_pct / 100) - allocated_m3)::numeric, 2);
  if p_volume_m3::numeric > available_m3 then
    raise exception 'slurry_allocation_plan_rejected:VOLUME_EXCEEDS_AVAILABLE' using errcode = 'check_violation',
      detail = format('requested %s m³, available %s m³', p_volume_m3, available_m3);
  end if;

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
