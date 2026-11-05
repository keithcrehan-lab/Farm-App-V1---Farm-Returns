-- Cattle management state and identity corrections (additive, forward-only).
-- NOT yet applied to any database: apply to `Farm Return V1 Dev` before the
-- "Move to housing" and "Edit animal details" workflows can save.
--
-- 1. record_group_housing_move — the housing counterpart of
--    record_grazing_field_move. A group's current management location is ONE
--    of: an open grazing field session (system = 'grazing', housing_id null)
--    OR a shed (system = 'housed', housing_id set). Moving into housing closes
--    the group's open grazing session at the housing date and sets the shed,
--    in one transaction. Closed sessions keep their own snapshots; nothing
--    historical is rewritten or deleted.
--
-- 2. livestock_individual_identity_corrections — append-only corrections to
--    an animal's date of birth, sex or breed. The original
--    `livestock_individuals` row is never rewritten: the cattle ledger (C1) is
--    bitemporal and append-only, so each correction becomes a new assertion
--    that supersedes the earlier one, received at the correction's own time.

-- ---------------------------------------------------------------------------
-- 1. Move a group into housing
-- ---------------------------------------------------------------------------

-- Security-invoker (the default): the caller still needs normal table grants
-- and passes RLS. The function exists only to make close-session/set-shed one
-- atomic transaction with same-farm checks.
create or replace function public.record_group_housing_move(
  p_livestock_group_id uuid,
  p_housing_id uuid,
  p_housed_at timestamptz,
  p_source text
)
returns table (closed_session_id uuid, closed_field_id uuid, changed boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_group public.livestock_groups%rowtype;
  v_housing public.housing%rowtype;
  v_open public.grazing_field_sessions%rowtype;
  v_has_open boolean;
begin
  if p_housed_at is null or p_housed_at > now() + interval '5 minutes' then
    raise exception 'housing_move_rejected:INVALID_HOUSED_AT';
  end if;
  if p_source is null or length(trim(p_source)) = 0 then
    raise exception 'housing_move_rejected:INVALID_SOURCE';
  end if;

  select g.* into v_group
  from public.livestock_groups g
  join public.farms f on f.id = g.farm_id
  where g.id = p_livestock_group_id
    and f.user_id = (select auth.uid())
  for update of g;
  if not found then
    raise exception 'housing_move_rejected:GROUP_NOT_FOUND';
  end if;

  select h.* into v_housing
  from public.housing h
  join public.farms f on f.id = h.farm_id
  where h.id = p_housing_id
    and h.farm_id = v_group.farm_id
    and f.user_id = (select auth.uid());
  if not found then
    raise exception 'housing_move_rejected:HOUSING_NOT_FOUND';
  end if;

  select s.* into v_open
  from public.grazing_field_sessions s
  where s.livestock_group_id = v_group.id
    and s.ended_at is null
  for update;
  v_has_open := found;

  -- Already in this shed with no open field session: nothing to record.
  if not v_has_open and v_group.system = 'housed' and v_group.housing_id = v_housing.id then
    return query select null::uuid, null::uuid, false;
    return;
  end if;

  if v_has_open then
    if p_housed_at <= v_open.started_at then
      raise exception 'housing_move_rejected:MOVE_NOT_AFTER_CURRENT_START';
    end if;
    update public.grazing_field_sessions
      set ended_at = p_housed_at
      where id = v_open.id;
  end if;

  update public.livestock_groups
    set system = 'housed', housing_id = v_housing.id
    where id = v_group.id;

  if v_has_open then
    return query select v_open.id, v_open.field_id, true;
  else
    return query select null::uuid, null::uuid, true;
  end if;
end;
$$;

revoke execute on function public.record_group_housing_move(uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.record_group_housing_move(uuid, uuid, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Append-only animal identity corrections
-- ---------------------------------------------------------------------------

create table public.livestock_individual_identity_corrections (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  animal_id uuid not null references public.livestock_individuals (id) on delete cascade,
  fact text not null check (fact in ('date_of_birth', 'sex', 'breed')),
  value text not null,
  source text not null check (length(trim(source)) > 0),
  recorded_by uuid not null default auth.uid(),
  recorded_at timestamptz not null default now(),
  constraint livestock_identity_corrections_value_valid check (
    (fact = 'date_of_birth' and value ~ '^\d{4}-\d{2}-\d{2}$')
    or (fact = 'sex' and value in ('male', 'female'))
    or (fact = 'breed' and length(trim(value)) between 1 and 80 and value = trim(value))
  )
);

create index livestock_identity_corrections_farm_id_idx
  on public.livestock_individual_identity_corrections (farm_id);
create index livestock_identity_corrections_animal_id_idx
  on public.livestock_individual_identity_corrections (animal_id, recorded_at);

create or replace function public.livestock_identity_corrections_check()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_livestock_individual_belongs_to_farm(new.animal_id, new.farm_id);
  if new.fact = 'date_of_birth' and new.value::date > (now() at time zone 'Europe/Dublin')::date then
    raise exception 'identity_correction_rejected:DATE_OF_BIRTH_IN_FUTURE'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger livestock_identity_corrections_check
  before insert on public.livestock_individual_identity_corrections
  for each row execute function public.livestock_identity_corrections_check();

alter table public.livestock_individual_identity_corrections enable row level security;

revoke all on table public.livestock_individual_identity_corrections from anon, authenticated;
-- Append-only: no update or delete grant.
grant select, insert on table public.livestock_individual_identity_corrections to authenticated;

create policy "livestock_identity_corrections_owner_select"
  on public.livestock_individual_identity_corrections
  for select
  to authenticated
  using (
    exists (
      select 1 from public.farms f
      where f.id = livestock_individual_identity_corrections.farm_id
        and f.user_id = (select auth.uid())
    )
  );

create policy "livestock_identity_corrections_owner_insert"
  on public.livestock_individual_identity_corrections
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.farms f
      where f.id = livestock_individual_identity_corrections.farm_id
        and f.user_id = (select auth.uid())
    )
  );
