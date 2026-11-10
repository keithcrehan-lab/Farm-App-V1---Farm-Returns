-- Regional (county) grass growth from Teagasc MoSt predictions, read from the
-- weekly map and approved by a Farm Return admin before farmers see it.
-- Additive only.

create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
create policy app_admins_self_read on public.app_admins
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.app_admins from public, anon, authenticated;
grant select on public.app_admins to authenticated;

create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid())) $$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

create table public.regional_grass_growth (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  county text not null check (length(btrim(county)) between 1 and 40),
  growth_kg_dm_ha_day numeric not null check (growth_kg_dm_ha_day >= 0 and growth_kg_dm_ha_day <= 200),
  confidence text check (confidence in ('high', 'low')),
  valid_from date not null,
  valid_to date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  source_url text not null,
  image_url text,
  caption text,
  extracted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  unique (batch_id, county),
  check (valid_to >= valid_from)
);
create index regional_grass_growth_lookup_idx on public.regional_grass_growth(county, status, valid_from desc);
alter table public.regional_grass_growth enable row level security;
create policy regional_grass_growth_read_approved on public.regional_grass_growth
  for select to authenticated using (status = 'approved' or (select public.is_app_admin()));
create policy regional_grass_growth_admin_insert on public.regional_grass_growth
  for insert to authenticated with check ((select public.is_app_admin()));
create policy regional_grass_growth_admin_update on public.regional_grass_growth
  for update to authenticated using ((select public.is_app_admin())) with check ((select public.is_app_admin()));
revoke all on public.regional_grass_growth from public, anon, authenticated;
grant select, insert, update on public.regional_grass_growth to authenticated;
