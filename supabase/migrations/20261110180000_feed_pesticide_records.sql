-- Records: feed and pesticide record books, and confirmations that a book
-- was genuinely not used for a period. Additive only.
create table if not exists public.feed_records (
  id uuid primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  received_on date not null,
  supplier_name text not null check (length(btrim(supplier_name)) between 1 and 120),
  supplier_address text check (supplier_address is null or length(supplier_address) <= 300),
  product text not null check (length(btrim(product)) between 1 and 120),
  feed_type text not null check (feed_type in ('concentrate', 'straight', 'mineral', 'forage', 'other')),
  batch_number text check (batch_number is null or length(batch_number) <= 60),
  quantity numeric not null check (quantity > 0 and quantity <= 100000),
  unit text not null check (unit in ('tonnes', 'kg', 'bags', 'bales', 'litres')),
  livestock_group_id uuid,
  home_grown boolean not null default false,
  notes text check (notes is null or length(notes) <= 1000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feed_records_farm_date_idx on public.feed_records(farm_id, received_on desc);

create table if not exists public.spray_operators (
  id uuid primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  pu_number text not null check (length(btrim(pu_number)) between 1 and 30),
  is_contractor boolean not null default false,
  address text check (address is null or length(address) <= 300),
  sprayer_cert text check (sprayer_cert is null or length(sprayer_cert) <= 40),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (not is_contractor or address is not null)
);

create table if not exists public.pesticide_applications (
  id uuid primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  spray_job_id uuid not null,
  applied_on date not null,
  field_id uuid not null,
  lpis_ref text,
  crop_situation text not null check (length(btrim(crop_situation)) between 1 and 60),
  product_name text not null check (length(btrim(product_name)) between 1 and 120),
  pcs_number text not null check (pcs_number ~ '^[0-9]{3,6}$'),
  area_ha numeric not null check (area_ha > 0 and area_ha <= 1000),
  rate numeric not null check (rate > 0),
  rate_unit text not null check (rate_unit in ('l_ha', 'ml_ha', 'kg_ha', 'g_ha')),
  water_l_ha numeric check (water_l_ha is null or water_l_ha > 0),
  reason text not null check (length(btrim(reason)) between 1 and 120),
  operator_id uuid not null references public.spray_operators(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  unique (spray_job_id, field_id)
);
create index if not exists pesticide_applications_farm_date_idx on public.pesticide_applications(farm_id, applied_on desc);

create table if not exists public.record_book_confirmations (
  farm_id uuid not null references public.farms(id) on delete cascade,
  book text not null check (book in ('medicines', 'movements', 'feed', 'pesticides', 'slurry', 'grass', 'jobs')),
  not_used_confirmed_on date not null,
  confirmed_by uuid not null default auth.uid() references auth.users(id),
  primary key (farm_id, book)
);

do $$
declare t text;
begin
  foreach t in array array['feed_records', 'spray_operators', 'pesticide_applications', 'record_book_confirmations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))', t || '_owner_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))', t || '_owner_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid()))) with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))', t || '_owner_update', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;
