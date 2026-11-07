-- Smart Camera V1: curated, globally readable catalogue. NO product rows are
-- seeded without independent manufacturer/supplier evidence. No farmer write
-- permissions. A barcode alone does not prove packaging/batch authenticity.
create table if not exists public.smart_camera_verified_fertiliser_products (
  gtin text primary key check (gtin ~ '^[0-9]{14}$'),
  product_name text not null check (length(trim(product_name)) > 0),
  declared_analysis text,
  source_name text not null check (length(trim(source_name)) > 0),
  source_url text not null check (source_url ~ '^https://'),
  reviewed_at date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.smart_camera_verified_fertiliser_products enable row level security;
create policy smart_camera_catalogue_verified_read on public.smart_camera_verified_fertiliser_products
  for select to authenticated using (is_active = true);
revoke all on public.smart_camera_verified_fertiliser_products from public, anon, authenticated;
grant select on public.smart_camera_verified_fertiliser_products to authenticated;
