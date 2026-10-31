-- Farm Return grazing field movements.
-- Applied to `Farm Return V1 Dev` on 2026-10-31.
--
-- Canonical, dated field occupancy for livestock groups. A move closes the
-- group's previous open field session and opens the next one atomically.
-- Historical sessions snapshot headcount/category/LU basis so later herd edits
-- never rewrite the grazing pressure that was actually recorded at the time.
--
-- This ledger feeds AGRONOMIC field grazing pressure only. It does not replace
-- the holding-level statutory GSR used for NAP compliance.

create table public.grazing_field_sessions (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  livestock_group_id uuid not null references public.livestock_groups(id) on delete cascade,
  field_id uuid not null references public.fields(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  head_count_snapshot numeric not null check (head_count_snapshot > 0),
  livestock_category_snapshot text not null,
  livestock_units_per_head_snapshot numeric not null check (livestock_units_per_head_snapshot > 0),
  source text not null check (length(trim(source)) > 0),
  recorded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint grazing_field_sessions_end_after_start
    check (ended_at is null or ended_at > started_at)
);

create index grazing_field_sessions_farm_id_idx
  on public.grazing_field_sessions(farm_id);
create index grazing_field_sessions_field_id_started_at_idx
  on public.grazing_field_sessions(field_id, started_at);
create index grazing_field_sessions_group_id_started_at_idx
  on public.grazing_field_sessions(livestock_group_id, started_at);
create unique index grazing_field_sessions_one_open_per_group_idx
  on public.grazing_field_sessions(livestock_group_id)
  where ended_at is null;

alter table public.grazing_field_sessions enable row level security;

revoke all on table public.grazing_field_sessions from anon, authenticated;
grant select, insert, update on table public.grazing_field_sessions to authenticated;

create policy "grazing_field_sessions_owner_select"
  on public.grazing_field_sessions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.farms f
      where f.id = grazing_field_sessions.farm_id
        and f.user_id = (select auth.uid())
    )
  );

create policy "grazing_field_sessions_owner_insert"
  on public.grazing_field_sessions
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.farms f
      where f.id = grazing_field_sessions.farm_id
        and f.user_id = (select auth.uid())
    )
  );

create policy "grazing_field_sessions_owner_update"
  on public.grazing_field_sessions
  for update
  to authenticated
  using (
    exists (
      select 1 from public.farms f
      where f.id = grazing_field_sessions.farm_id
        and f.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.farms f
      where f.id = grazing_field_sessions.farm_id
        and f.user_id = (select auth.uid())
    )
  );

-- Security-invoker (the default): the caller still needs normal table grants
-- and passes RLS. This function exists only to make close-previous/open-next
-- one atomic transaction and to snapshot trusted group values from the DB.
create or replace function public.record_grazing_field_move(
  p_livestock_group_id uuid,
  p_field_id uuid,
  p_started_at timestamptz,
  p_source text
)
returns public.grazing_field_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_group public.livestock_groups%rowtype;
  v_field public.fields%rowtype;
  v_open public.grazing_field_sessions%rowtype;
  v_result public.grazing_field_sessions%rowtype;
  v_head_count numeric;
  v_lu_per_head numeric;
begin
  if p_started_at is null or p_started_at > now() + interval '5 minutes' then
    raise exception 'grazing_move_rejected:INVALID_STARTED_AT';
  end if;
  if p_source is null or length(trim(p_source)) = 0 then
    raise exception 'grazing_move_rejected:INVALID_SOURCE';
  end if;

  select g.* into v_group
  from public.livestock_groups g
  join public.farms f on f.id = g.farm_id
  where g.id = p_livestock_group_id
    and f.user_id = (select auth.uid());
  if not found then
    raise exception 'grazing_move_rejected:GROUP_NOT_FOUND';
  end if;

  select fld.* into v_field
  from public.fields fld
  join public.farms f on f.id = fld.farm_id
  where fld.id = p_field_id
    and fld.farm_id = v_group.farm_id
    and fld.archived_at is null
    and f.user_id = (select auth.uid());
  if not found then
    raise exception 'grazing_move_rejected:FIELD_NOT_FOUND';
  end if;

  v_head_count := nullif(v_group.count ->> 'value', '')::numeric;
  if v_head_count is null or v_head_count <= 0 then
    raise exception 'grazing_move_rejected:HEADCOUNT_NOT_RECORDED';
  end if;

  v_lu_per_head := case v_group.category
    when 'suckler_cow' then 0.9
    when 'dairy_cow' then 1.0
    when 'bull' then 1.0
    when 'calf' then 0.3
    when 'weanling' then 0.3
    when 'store' then 0.7
    when 'steer' then 0.7
    when 'heifer' then 0.7
    else null
  end;
  if v_lu_per_head is null then
    raise exception 'grazing_move_rejected:UNSUPPORTED_LIVESTOCK_CATEGORY';
  end if;

  -- Moving a group onto a field is also its current management-state change:
  -- it is no longer housed. The dated session remains the historical truth.
  update public.livestock_groups
    set system = 'grazing', housing_id = null
    where id = v_group.id;

  select s.* into v_open
  from public.grazing_field_sessions s
  where s.livestock_group_id = p_livestock_group_id
    and s.ended_at is null
  for update;

  if found then
    if v_open.field_id = p_field_id then
      return v_open;
    end if;
    if p_started_at <= v_open.started_at then
      raise exception 'grazing_move_rejected:MOVE_NOT_AFTER_CURRENT_START';
    end if;
    update public.grazing_field_sessions
      set ended_at = p_started_at
      where id = v_open.id;
  end if;

  insert into public.grazing_field_sessions (
    farm_id,
    livestock_group_id,
    field_id,
    started_at,
    head_count_snapshot,
    livestock_category_snapshot,
    livestock_units_per_head_snapshot,
    source,
    recorded_by
  ) values (
    v_group.farm_id,
    v_group.id,
    v_field.id,
    p_started_at,
    v_head_count,
    v_group.category,
    v_lu_per_head,
    trim(p_source),
    (select auth.uid())
  ) returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function public.record_grazing_field_move(uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.record_grazing_field_move(uuid, uuid, timestamptz, text) to authenticated;
