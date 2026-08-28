-- Real Mode Completion Phase 12 — individual animal detail foundation.
--
-- Optional layer under a livestock_group, per the brief: "Do not require
-- individual-animal tracking for farmers who only want group management."
-- `group_id` is nullable (an animal can exist before/without being
-- assigned to a group) and `on delete set null` (deleting a group must
-- not delete the animals in it — group management and individual
-- tracking are separate facts).
--
-- Weight is NOT a column on the animal itself — "prefer a structure that
-- can support historical weight observations rather than assuming an
-- animal only ever has one weight" (brief). A separate append-only
-- observations table; "current weight" is the most recent observation by
-- date, computed by the application layer, not a second place the same
-- fact could drift out of sync.

create table public.livestock_individuals (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  group_id uuid references public.livestock_groups (id) on delete set null,
  tag_number text,
  category text not null check (
    category in ('suckler_cow', 'dairy_cow', 'bull', 'calf', 'weanling', 'store', 'steer', 'heifer')
  ),
  sex text check (sex is null or sex in ('male', 'female')),
  breed text,
  date_of_birth date,
  goal_status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger livestock_individuals_set_updated_at
  before update on public.livestock_individuals
  for each row execute function public.set_updated_at();

create index livestock_individuals_farm_id_idx on public.livestock_individuals (farm_id);
create index livestock_individuals_group_id_idx on public.livestock_individuals (group_id);

create table public.livestock_weight_observations (
  id uuid primary key default gen_random_uuid(),
  -- Redundant farm_id (derivable via animal_id -> livestock_individuals
  -- -> farm_id) kept for RLS simplicity — same precedent as
  -- slurry_allocations.farm_id in the init migration.
  farm_id uuid not null references public.farms (id) on delete cascade,
  animal_id uuid not null references public.livestock_individuals (id) on delete cascade,
  weight_kg double precision not null,
  observed_date date not null,
  source text not null,
  created_at timestamptz not null default now()
);

create index livestock_weight_observations_animal_id_idx on public.livestock_weight_observations (animal_id);
create index livestock_weight_observations_farm_id_idx on public.livestock_weight_observations (farm_id);

alter table public.livestock_individuals enable row level security;
alter table public.livestock_weight_observations enable row level security;

create policy "livestock_individuals_owner_all" on public.livestock_individuals
  for all
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy "livestock_weight_observations_owner_all" on public.livestock_weight_observations
  for all
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.livestock_individuals, public.livestock_weight_observations from anon;
grant select, insert, update, delete on public.livestock_individuals, public.livestock_weight_observations to authenticated;
