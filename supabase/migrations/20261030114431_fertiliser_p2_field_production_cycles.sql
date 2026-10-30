-- Fertiliser P2 — crop-extensible field production-cycle ledger.
--
-- One field can move through different crop systems over time. Crop state is
-- therefore stored as an appendable season/cycle record rather than a mutable
-- permanent property on fields.
--
-- This migration stores evidence only. It does not change nutrient maths.

create table public.field_production_cycles (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id) on delete cascade,
  season text not null check (season ~ '^[0-9]{4}$'),
  crop_system text not null check (
    crop_system in (
      'GRASS_GRAZING',
      'GRASS_FIRST_CUT_SILAGE',
      'GRASS_SECOND_CUT_SILAGE',
      'GRASS_THIRD_CUT_SILAGE',
      'GRASS_HAY',
      'GRASS_MIXED',
      'GRASS_WHITE_CLOVER_GRAZING',
      'GRASS_WHITE_CLOVER_SILAGE',
      'RED_CLOVER_SILAGE',
      'FORAGE_KALE',
      'FORAGE_RAPE',
      'CEREAL_OTHER',
      'HORTICULTURE_OTHER',
      'OTHER_UNSUPPORTED'
    )
  ),
  status text not null default 'planned' check (status in ('planned', 'active', 'closed')),
  start_date date,
  end_date date,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_production_cycles_end_after_start
    check (end_date is null or start_date is null or end_date >= start_date),
  constraint field_production_cycles_field_season_unique
    unique (field_id, season)
);

create index field_production_cycles_field_id_idx
  on public.field_production_cycles(field_id);

create index field_production_cycles_field_status_idx
  on public.field_production_cycles(field_id, status);

create trigger field_production_cycles_set_updated_at
  before update on public.field_production_cycles
  for each row execute function public.set_updated_at();

alter table public.field_production_cycles enable row level security;

create policy "field_production_cycles_owner_all"
  on public.field_production_cycles
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.fields fld
      join public.farms frm on frm.id = fld.farm_id
      where fld.id = field_id
        and frm.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.fields fld
      join public.farms frm on frm.id = fld.farm_id
      where fld.id = field_id
        and frm.user_id = (select auth.uid())
    )
  );

revoke all on table public.field_production_cycles from anon;
grant select, insert, update, delete on table public.field_production_cycles to authenticated;
