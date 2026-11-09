-- Medicine purchases (animal remedies incoming record) captured by scanning.
-- Additive only: two new tables, no change to existing tables or data.

-- 1. Shared barcode -> HPRA product links. One farmer links a GTIN to an
--    authorised HPRA product once; every Farm Return farm then recognises it.
--    Only the link is shared; no farm, purchase or user detail is exposed
--    beyond the opaque linking user id. First link wins; links are not edited
--    from the app (a wrong link is corrected administratively).
create table public.medicine_product_links (
  gtin text primary key check (gtin ~ '^[0-9]{14}$'),
  hpra_licence_number text not null check (length(btrim(hpra_licence_number)) between 1 and 60),
  product_name text not null check (length(btrim(product_name)) between 1 and 300),
  linked_by uuid not null default auth.uid() references auth.users(id),
  linked_at timestamptz not null default now()
);
alter table public.medicine_product_links enable row level security;
create policy medicine_product_links_read on public.medicine_product_links
  for select to authenticated using (true);
create policy medicine_product_links_insert on public.medicine_product_links
  for insert to authenticated with check (linked_by = (select auth.uid()));
revoke all on public.medicine_product_links from public, anon, authenticated;
grant select, insert on public.medicine_product_links to authenticated;

-- 2. Farm-scoped purchase records. Private to the farm's owner.
create table public.medicine_purchases (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  gtin text check (gtin is null or gtin ~ '^[0-9]{14}$'),
  hpra_licence_number text not null check (length(btrim(hpra_licence_number)) between 1 and 60),
  product_name text not null check (length(btrim(product_name)) between 1 and 300),
  legal_status text check (legal_status is null or length(legal_status) <= 120),
  batch_number text check (batch_number is null or length(btrim(batch_number)) between 1 and 40),
  expiry_date date,
  quantity integer not null check (quantity between 1 and 10000),
  date_received date not null,
  supplier_name text not null check (length(btrim(supplier_name)) between 1 and 200),
  supplier_address text not null check (length(btrim(supplier_address)) between 1 and 400),
  vet_name text check (vet_name is null or length(btrim(vet_name)) between 1 and 200),
  prescription_id text check (prescription_id is null or length(btrim(prescription_id)) between 1 and 80),
  capture_source text not null check (capture_source in ('datamatrix', 'barcode', 'manual')),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id)
);
create index medicine_purchases_farm_idx on public.medicine_purchases(farm_id, date_received desc);
alter table public.medicine_purchases enable row level security;
create policy medicine_purchases_owner_read on public.medicine_purchases
  for select to authenticated using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
create policy medicine_purchases_owner_insert on public.medicine_purchases
  for insert to authenticated with check (created_by = (select auth.uid()) and exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
revoke all on public.medicine_purchases from public, anon, authenticated;
grant select, insert on public.medicine_purchases to authenticated;
