-- Fertiliser pilot (Codex audit F010): target-season slurry forecast
-- adoption, distinct from physical slurry reservations.
--
-- `slurry_allocations` reserves slurry physically in a store now. A
-- forecast for a future season is planning intent: it must feed that
-- season's fertiliser procurement and quotes without reducing today's tank
-- contents. Each row is one immutable adoption (or withdrawal) of a whole,
-- server-validated scenario; the latest row per season governs
-- (src/domain/slurry-forecast-adoption.ts).
--
-- Forward-only and non-destructive: a new append-only table. No update or
-- delete grant or policy exists.
create table public.slurry_forecast_adoptions (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  planning_season text not null check (planning_season ~ '^\d{4}$'),
  action text not null check (action in ('adopt', 'withdraw')),
  planning_date date,
  forecast_source text check (forecast_source in ('FARMER_FORECAST', 'SYSTEM_FORECAST')),
  expected_available_m3 numeric check (expected_available_m3 is null or expected_available_m3 >= 0),
  production_basis text check (production_basis in ('TARGET_SEASON_SAVED', 'CARRY_FORWARD_CURRENT_SETTINGS')),
  carried_forward_from_season text,
  scenario_version text,
  intents jsonb not null default '[]'::jsonb check (jsonb_typeof(intents) = 'array'),
  adopted_at timestamptz not null default now(),
  adopted_by text,
  constraint slurry_forecast_adoptions_adopt_complete check (
    action = 'withdraw'
    or (planning_date is not null and forecast_source is not null and expected_available_m3 is not null
        and production_basis is not null and scenario_version is not null)
  )
);

create index slurry_forecast_adoptions_farm_season_idx
  on public.slurry_forecast_adoptions(farm_id, planning_season, adopted_at);

alter table public.slurry_forecast_adoptions enable row level security;

revoke all on table public.slurry_forecast_adoptions from anon, authenticated;
grant select, insert on table public.slurry_forecast_adoptions to authenticated;

create policy "slurry_forecast_adoptions_owner_select"
  on public.slurry_forecast_adoptions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.farms f
      where f.id = slurry_forecast_adoptions.farm_id
        and f.user_id = (select auth.uid())
    )
  );

create policy "slurry_forecast_adoptions_owner_insert"
  on public.slurry_forecast_adoptions
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.farms f
      where f.id = slurry_forecast_adoptions.farm_id
        and f.user_id = (select auth.uid())
    )
  );
