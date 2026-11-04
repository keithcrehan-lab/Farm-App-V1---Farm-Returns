-- Farm Return Grass Management — trusted regional growth forecast ledger.
--
-- Forecasts are distinct from farmer-entered growth observations because a
-- future forecast must never be back-applied as historical growth evidence.
-- Authenticated farmers can read forecasts for their own farm but cannot
-- insert/update/delete them. A future trusted server sync may insert rows
-- using the existing service-role boundary after validating the source.

create table public.farm_grass_growth_forecasts (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  growth_rate_kg_dm_ha_day numeric not null
    check (growth_rate_kg_dm_ha_day > 0 and growth_rate_kg_dm_ha_day <= 500),
  provider text not null check (provider in ('teagasc_most_regional', 'external_api')),
  scope text not null check (scope in ('county', 'farm', 'national')),
  region_label text null,
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  issued_at timestamptz not null,
  retrieved_at timestamptz not null,
  source text not null check (length(trim(source)) > 0),
  source_url text null,
  model_name text null,
  model_version text null,
  created_at timestamptz not null default now(),
  constraint farm_grass_growth_forecasts_validity
    check (valid_to >= valid_from)
);

comment on table public.farm_grass_growth_forecasts is
  'Trusted append-only future grass-growth evidence. Forecast validity is explicit and forecasts are never used as historical growth before valid_from.';

create index farm_grass_growth_forecasts_farm_validity_idx
  on public.farm_grass_growth_forecasts (farm_id, valid_from desc, valid_to desc);

alter table public.farm_grass_growth_forecasts enable row level security;

create policy farm_grass_growth_forecasts_owner_select on public.farm_grass_growth_forecasts
  for select to authenticated
  using (exists (
    select 1 from public.farms f
    where f.id = farm_id and f.user_id = (select auth.uid())
  ));

revoke all on public.farm_grass_growth_forecasts from anon, authenticated;
grant select on public.farm_grass_growth_forecasts to authenticated;
