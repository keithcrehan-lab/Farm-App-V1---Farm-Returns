-- Codex remediation Priority 10 — database integrity.
--
-- Two real gaps, neither previously enforced by the schema (only ever by
-- application-level code, which is not a substitute for a real
-- constraint — CLAUDE.md's own "never assume application code is the only
-- writer"). Forward-only: no data is dropped, no table is removed, no
-- existing constraint is loosened.
--
-- ---------------------------------------------------------------------------
-- 1. One-farm-per-user — the whole app (FarmProvider, getFarmForCurrentUser,
--    (app)/layout.tsx) assumes a signed-in user has exactly one farm, but
--    nothing in the schema ever enforced that. `getFarmForCurrentUser`/
--    `getOnboardingStatusForCurrentUser` (src/lib/farm-data/farms.ts) use
--    `.maybeSingle()`, which errors — a real, user-visible outage for that
--    account, not a silent misbehaviour — the moment two rows exist for
--    one user_id. A `unique` constraint makes that impossible to reach at
--    all, rather than merely detected loudly once it happens. If duplicate
--    rows already exist in a real database, this statement fails closed
--    (the migration doesn't apply) rather than silently picking one to
--    keep — resolving a real pre-existing duplicate is a business decision
--    for a human with visibility into that data, not this migration's call
--    to make silently.
-- ---------------------------------------------------------------------------

alter table public.farms
  add constraint farms_user_id_unique unique (user_id);

-- ---------------------------------------------------------------------------
-- 2. Cross-table same-farm ownership — every child table's *own* farm_id
--    is RLS-checked against the current user (existing policies), but
--    several tables carry a SECOND foreign key into another farm-scoped
--    table with no check that the two farm_ids agree:
--      slurry_allocations.field_id   -> fields.farm_id
--      slurry_allocations.housing_id -> housing.farm_id
--      livestock_groups.housing_id   -> housing.farm_id
--      livestock_individuals.group_id -> livestock_groups.farm_id
--      livestock_weight_observations.animal_id -> livestock_individuals.farm_id
--    Postgres CHECK constraints can't reference another table, so this is
--    enforced with a `before insert or update` trigger per table — the
--    standard pattern for a cross-table invariant. Without this, RLS alone
--    would still let an authenticated user create e.g. a slurry_allocations
--    row with their own real farm_id but a field_id/housing_id belonging to
--    a DIFFERENT farm (any UUID they can supply, not just their own),
--    since RLS only ever checked the row's own farm_id column, never
--    resolved into what those secondary ids actually pointed at.
-- ---------------------------------------------------------------------------

create or replace function public.assert_field_belongs_to_farm(p_field_id uuid, p_farm_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.fields where id = p_field_id and farm_id = p_farm_id) then
    raise exception 'field % does not belong to farm %', p_field_id, p_farm_id
      using errcode = 'foreign_key_violation';
  end if;
end;
$$;

create or replace function public.assert_housing_belongs_to_farm(p_housing_id uuid, p_farm_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.housing where id = p_housing_id and farm_id = p_farm_id) then
    raise exception 'housing % does not belong to farm %', p_housing_id, p_farm_id
      using errcode = 'foreign_key_violation';
  end if;
end;
$$;

create or replace function public.assert_livestock_group_belongs_to_farm(p_group_id uuid, p_farm_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.livestock_groups where id = p_group_id and farm_id = p_farm_id) then
    raise exception 'livestock_group % does not belong to farm %', p_group_id, p_farm_id
      using errcode = 'foreign_key_violation';
  end if;
end;
$$;

create or replace function public.assert_livestock_individual_belongs_to_farm(p_animal_id uuid, p_farm_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.livestock_individuals where id = p_animal_id and farm_id = p_farm_id) then
    raise exception 'livestock_individual % does not belong to farm %', p_animal_id, p_farm_id
      using errcode = 'foreign_key_violation';
  end if;
end;
$$;

create or replace function public.slurry_allocations_check_same_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_field_belongs_to_farm(new.field_id, new.farm_id);
  perform public.assert_housing_belongs_to_farm(new.housing_id, new.farm_id);
  return new;
end;
$$;

drop trigger if exists slurry_allocations_same_farm on public.slurry_allocations;
create trigger slurry_allocations_same_farm
  before insert or update on public.slurry_allocations
  for each row execute function public.slurry_allocations_check_same_farm();

create or replace function public.livestock_groups_check_same_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.housing_id is not null then
    perform public.assert_housing_belongs_to_farm(new.housing_id, new.farm_id);
  end if;
  return new;
end;
$$;

drop trigger if exists livestock_groups_same_farm on public.livestock_groups;
create trigger livestock_groups_same_farm
  before insert or update on public.livestock_groups
  for each row execute function public.livestock_groups_check_same_farm();

create or replace function public.livestock_individuals_check_same_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.group_id is not null then
    perform public.assert_livestock_group_belongs_to_farm(new.group_id, new.farm_id);
  end if;
  return new;
end;
$$;

drop trigger if exists livestock_individuals_same_farm on public.livestock_individuals;
create trigger livestock_individuals_same_farm
  before insert or update on public.livestock_individuals
  for each row execute function public.livestock_individuals_check_same_farm();

create or replace function public.livestock_weight_observations_check_same_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_livestock_individual_belongs_to_farm(new.animal_id, new.farm_id);
  return new;
end;
$$;

drop trigger if exists livestock_weight_observations_same_farm on public.livestock_weight_observations;
create trigger livestock_weight_observations_same_farm
  before insert or update on public.livestock_weight_observations
  for each row execute function public.livestock_weight_observations_check_same_farm();
