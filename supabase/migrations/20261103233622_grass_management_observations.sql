-- Farm Return Grass Management — Phase 1 persistence.
--
-- Two append-only evidence ledgers:
--
-- - `grass_cover_observations`: one measured/estimated paddock cover
--   reading (kg DM/ha) for one field at one moment (a "farm walk" entry).
-- - `farm_grass_growth_observations`: one farm-level grass growth rate
--   (kg DM/ha/day) with explicit origin, so a farmer-entered figure is never
--   confused with a regional estimate, a sensor reading or an external feed.
--
-- The numeric ceilings below (cover <= 10000 kg DM/ha, growth <= 500 kg
-- DM/ha/day) are DEFENSIVE DATA-SANITY bounds that reject obvious
-- keying/unit errors. They are NOT biological claims about achievable
-- cover or growth. Presentation targets live in `src/domain/grass-management.ts`
-- and are configurable visual defaults, not agronomic or legal rules.
--
-- Rows are permanent evidence: authenticated may select/insert only (no
-- update/delete grant), anon has nothing. Owner-scoped RLS. Same-farm
-- integrity for `field_id` reuses `assert_field_belongs_to_farm`
-- (`20260829010000_decisions_jobs_client_access.sql`) via a before-insert
-- trigger, following `20260912000000_soil_core_observations.sql`.
-- No SECURITY DEFINER.
--
-- Forward-only and additive: no existing table, column, constraint, trigger,
-- grant or policy is altered or dropped.

create table public.grass_cover_observations (
  -- Client-generated (no default) — the offline-first idempotency-key
  -- pattern `soil_core_observations.id` already uses.
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  field_id uuid not null references public.fields (id),
  cover_kg_dm_ha numeric not null check (cover_kg_dm_ha > 0 and cover_kg_dm_ha <= 10000),
  method text not null check (method in ('plate_meter', 'visual_estimate', 'cut_and_weigh', 'manual_kg_dm_ha')),
  lat double precision null check (lat is null or (lat >= -90 and lat <= 90)),
  lng double precision null check (lng is null or (lng >= -180 and lng <= 180)),
  -- Meters; null when the platform did not report one — never fabricated.
  accuracy_m double precision null check (accuracy_m is null or accuracy_m >= 0),
  observed_at timestamptz not null,
  source text not null check (length(trim(source)) > 0),
  created_at timestamptz not null default now(),
  constraint grass_cover_observations_lat_lng_pair
    check ((lat is null) = (lng is null))
);

comment on table public.grass_cover_observations is
  'Grass Management Phase 1 -- one row per recorded paddock cover (kg DM/ha). Immutable, append-only evidence. The 10000 kg DM/ha ceiling is a defensive data-sanity bound, not a biological claim.';

create index grass_cover_observations_farm_observed_at_idx
  on public.grass_cover_observations (farm_id, observed_at desc);
create index grass_cover_observations_field_observed_at_idx
  on public.grass_cover_observations (field_id, observed_at desc);

create or replace function public.grass_cover_observations_check_same_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_field_belongs_to_farm(new.field_id, new.farm_id);
  return new;
end;
$$;

create trigger grass_cover_observations_same_farm
  before insert on public.grass_cover_observations
  for each row execute function public.grass_cover_observations_check_same_farm();

alter table public.grass_cover_observations enable row level security;

create policy grass_cover_observations_owner_select on public.grass_cover_observations
  for select to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy grass_cover_observations_owner_insert on public.grass_cover_observations
  for insert to authenticated
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.grass_cover_observations from anon, authenticated;
grant select, insert on public.grass_cover_observations to authenticated;

create table public.farm_grass_growth_observations (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  growth_rate_kg_dm_ha_day numeric not null
    check (growth_rate_kg_dm_ha_day > 0 and growth_rate_kg_dm_ha_day <= 500),
  origin text not null check (origin in ('farmer_entered', 'regional_estimate', 'sensor', 'external_api')),
  observed_at timestamptz not null,
  source text not null check (length(trim(source)) > 0),
  created_at timestamptz not null default now()
);

comment on table public.farm_grass_growth_observations is
  'Grass Management Phase 1 -- one row per farm-level grass growth rate (kg DM/ha/day) with explicit origin. Immutable, append-only evidence. The 500 kg DM/ha/day ceiling is a defensive data-sanity bound, not a biological claim.';

create index farm_grass_growth_observations_farm_observed_at_idx
  on public.farm_grass_growth_observations (farm_id, observed_at desc);

alter table public.farm_grass_growth_observations enable row level security;

create policy farm_grass_growth_observations_owner_select on public.farm_grass_growth_observations
  for select to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy farm_grass_growth_observations_owner_insert on public.farm_grass_growth_observations
  for insert to authenticated
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.farm_grass_growth_observations from anon, authenticated;
grant select, insert on public.farm_grass_growth_observations to authenticated;
