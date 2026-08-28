-- Real Farm V1 Phase 3 — persistent farm database.
--
-- Physical schema for the entities documented conceptually in
-- docs/data-model.md and typed in src/domain/types.ts. One row per real
-- farmer-entered/domain-tracked record, replacing the three unscoped
-- localStorage silos audited in docs/real-farm-v1/IMPLEMENTATION_AUDIT.md
-- ("farm-return:v1", "farm-return:audit-trace:v1", "farm-return:peer-review:v1"
-- — the latter two are out of scope for this migration; see BUILD_LOG.md
-- Phase 3 for why).
--
-- Design choice: every `TrackedValue<T>` field (docs/data-model.md's
-- provenance wrapper — {value, status, source, sourceDate, previous, ...})
-- is stored as a single `jsonb` column holding the exact same shape the
-- TypeScript domain layer already uses, rather than normalising
-- value/status/source into separate columns plus a history table. This
-- keeps `previous`'s recursive history chain (never overwritten — see
-- provenance.ts) trivially representable, and keeps the persistence
-- adapters (src/lib/farm-data/*, Phase 3 application code) a near-direct
-- passthrough between a DB row and the existing `Field`/`LivestockGroup`/
-- etc. TypeScript types — "adapters, not new engines" (CLAUDE.md / the
-- Real Farm V1 brief's Phase 6).
--
-- Apply with the Supabase CLI (`supabase db push`) once a real project
-- exists, or paste into the SQL editor at
-- https://supabase.com/dashboard/project/_/sql/new. See supabase/README.md.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- farms
-- ---------------------------------------------------------------------------

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  county text not null,
  centroid_lng double precision not null,
  centroid_lat double precision not null,
  primary_enterprises text[] not null default '{}',
  units text not null default 'metric' check (units = 'metric'),
  owner_name text not null,
  -- TrackedValue<{ adviserEngaged, nmpSubmitted, trainingCompleted }> — S.I.
  -- 119/2026 Article 17(6) P build-up eligibility conditions (types.ts
  -- Farm.pBuildUpCompliance). Absent means "not proven", same fail-closed
  -- default as the TypeScript layer.
  p_build_up_compliance jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger farms_set_updated_at
  before update on public.farms
  for each row execute function public.set_updated_at();

create index farms_user_id_idx on public.farms (user_id);

-- ---------------------------------------------------------------------------
-- fields
-- ---------------------------------------------------------------------------

create table public.fields (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  name text not null,
  area_ha double precision not null,
  centroid_lng double precision not null,
  centroid_lat double precision not null,
  -- GeoJSON.Polygon, single exterior ring only (field-boundary.ts) — absent
  -- until a real boundary is drawn; area_ha/centroid_* are placeholder/typed
  -- values until then (see farm-store.tsx's addField comment).
  polygon jsonb,
  polygon_source text check (polygon_source is null or polygon_source = 'farmer_drawn'),
  polygon_captured_at timestamptz,
  lpis_ref text,
  planned_use jsonb not null, -- TrackedValue<FieldUse>
  mapped_soil jsonb not null, -- MappedSoil
  fertility jsonb not null,   -- SoilFertility (pIndex, kIndex, pH?, verifiedTest?)
  -- V3 closure-pass farmer-capture fields — absent/"unknown" fails closed,
  -- same as the TypeScript layer (input-gates.ts).
  commonage_status jsonb,
  water_buffer_context jsonb,
  history jsonb not null default '[]', -- FieldSeasonRecord[]
  thumbnail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger fields_set_updated_at
  before update on public.fields
  for each row execute function public.set_updated_at();

create index fields_farm_id_idx on public.fields (farm_id);

-- ---------------------------------------------------------------------------
-- housing (created before livestock_groups — livestock_groups.housing_id
-- references it; the reverse link, Housing.linkedGroupIds in types.ts, is
-- computed by the adapter from livestock_groups rather than stored
-- redundantly, avoiding a circular foreign key)
-- ---------------------------------------------------------------------------

create table public.housing (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  shed_name text not null,
  shed_type text not null check (shed_type in ('slatted', 'straw_bedded', 'other')),
  housing_period_start date not null,
  housing_period_end date not null,
  tank_refinement jsonb,       -- TankDetail
  slurry_estimate jsonb not null, -- SlurryEstimate — still a mock engine (v1.0.0 (mock)) upstream; stored as-entered
  storage_capacity_m3 double precision not null,
  storage_fill_pct double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger housing_set_updated_at
  before update on public.housing
  for each row execute function public.set_updated_at();

create index housing_farm_id_idx on public.housing (farm_id);

-- ---------------------------------------------------------------------------
-- livestock_groups
-- ---------------------------------------------------------------------------

create table public.livestock_groups (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  category text not null check (
    category in ('suckler_cow', 'dairy_cow', 'bull', 'calf', 'weanling', 'store', 'steer', 'heifer')
  ),
  label text not null,
  count jsonb not null,        -- TrackedValue<number>
  avg_weight_kg jsonb,         -- TrackedValue<number>
  avg_age_months integer,
  breed text,
  sex text check (sex is null or sex in ('male', 'female', 'mixed')),
  system text not null check (system in ('grazing', 'housed')),
  housing_id uuid references public.housing (id) on delete set null,
  goal text check (goal is null or goal in ('maintain', 'grow', 'breed', 'sell_store', 'finish_slaughter')),
  value jsonb not null,        -- TrackedValue<number>
  status_label text,
  avg_milk_yield_kg_per_year jsonb, -- TrackedValue<number>, dairy_cow only
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger livestock_groups_set_updated_at
  before update on public.livestock_groups
  for each row execute function public.set_updated_at();

create index livestock_groups_farm_id_idx on public.livestock_groups (farm_id);
create index livestock_groups_housing_id_idx on public.livestock_groups (housing_id);

-- ---------------------------------------------------------------------------
-- slurry_allocations
-- ---------------------------------------------------------------------------

create table public.slurry_allocations (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  field_id uuid not null references public.fields (id) on delete cascade,
  housing_id uuid not null references public.housing (id) on delete cascade,
  priority text not null check (priority in ('high', 'medium', 'not_suitable')),
  volume_m3 double precision not null,
  score double precision not null,
  application_method jsonb, -- TrackedValue<'LESS'|'splashplate'|'incorporate_24h'|'other'>
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (field_id, housing_id)
);

create trigger slurry_allocations_set_updated_at
  before update on public.slurry_allocations
  for each row execute function public.set_updated_at();

create index slurry_allocations_farm_id_idx on public.slurry_allocations (farm_id);
create index slurry_allocations_field_id_idx on public.slurry_allocations (field_id);
create index slurry_allocations_housing_id_idx on public.slurry_allocations (housing_id);

-- ---------------------------------------------------------------------------
-- financial_assumptions — farmer-editable prices/costs, kept distinct from
-- externally-sourced reference values (src/domain/market.ts's CSO series,
-- which stay versioned code constants, not farm-scoped rows) per the
-- brief's Phase 14 "actual farm values / reference market data / farmer
-- assumptions / calculated outputs" distinction. Key/value rather than one
-- column per assumption so a new assumption type doesn't need a migration —
-- src/domain/finance.ts (Phase 14) defines the set of valid keys.
-- ---------------------------------------------------------------------------

create table public.financial_assumptions (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  key text not null,
  value jsonb not null, -- TrackedValue<number> — farmer_adjusted overrides a reference default
  unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id, key)
);

create trigger financial_assumptions_set_updated_at
  before update on public.financial_assumptions
  for each row execute function public.set_updated_at();

create index financial_assumptions_farm_id_idx on public.financial_assumptions (farm_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — every table scoped to the owning farm's user_id.
-- Child tables check ownership via a subquery against farms rather than
-- duplicating user_id on every row, so a farm can only ever be
-- re-parented (never is, today) in one place.
-- ---------------------------------------------------------------------------

alter table public.farms enable row level security;
alter table public.fields enable row level security;
alter table public.housing enable row level security;
alter table public.livestock_groups enable row level security;
alter table public.slurry_allocations enable row level security;
alter table public.financial_assumptions enable row level security;

create policy "farms_owner_all" on public.farms
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "fields_owner_all" on public.fields
  for all
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = auth.uid()));

create policy "housing_owner_all" on public.housing
  for all
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = auth.uid()));

create policy "livestock_groups_owner_all" on public.livestock_groups
  for all
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = auth.uid()));

create policy "slurry_allocations_owner_all" on public.slurry_allocations
  for all
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = auth.uid()));

create policy "financial_assumptions_owner_all" on public.financial_assumptions
  for all
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = auth.uid()));
