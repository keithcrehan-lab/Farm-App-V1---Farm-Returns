-- Fertiliser Overview and Stock Visuals campaign
-- (docs/farm-return-next/DOMAIN_CONTRACTS.md's own dated entry for this
-- campaign has the full account). Two independent, additive, forward-only
-- changes:
--
-- 1. `housing.storage_fill_status` / `storage_fill_recorded_at` -- the
--    genuinely missing provenance on `housing.storage_fill_pct` the
--    campaign brief asked to confirm before assuming anything: this
--    column existed already (20260828000000_init_farm_schema.sql) but
--    carried no source/timestamp at all -- no way to tell a real
--    farmer-typed fill level from a never-touched default, and no "when
--    was this last true". `not null default 'estimated'` backfills every
--    existing row honestly (this app cannot tell, after the fact, whether
--    an old value was ever farmer-confirmed -- never upgraded to
--    'farmer_recorded' retroactively); `storage_fill_recorded_at` is left
--    genuinely null for those same rows, for the identical reason. Every
--    NEW create/update stamps both together, real, going forward
--    (`src/lib/farm-data/housing.ts`).
--
-- 2. `fertiliser_stock_records` -- the smallest reliable record of
--    fertiliser/lime stock this campaign's brief asked for: a dated,
--    farmer-observed quantity for one product, source-attributed. Each
--    row is a full point-in-time observation ("as of this date, I have X
--    kg of Product Y"), never a delta -- the CURRENT balance for a
--    product is simply its own most recent row
--    (`src/domain/fertiliser-stock.ts`'s `currentFertiliserStockByProduct`).
--    Deliberately insert/select only, no update/delete policy at all --
--    the same "correct by adding a new row, never rewrite an old one"
--    discipline `quote_request_revisions` already established
--    (immutable, auditable correction history; CLAUDE.md "provenance is
--    permanent"). This is NOT an inventory/order-management system: no
--    delivery, application or movement automatically writes here -- see
--    this campaign's own final handover for the disclosed scope limit
--    (no reliable incoming-delivery tracking exists in this app yet, so
--    the "confirmed incoming" band of the stock visual is always 0/never
--    rendered this build).

alter table public.housing
  add column storage_fill_status text not null default 'estimated'
    check (storage_fill_status in ('estimated', 'farmer_recorded')),
  add column storage_fill_recorded_at timestamptz;

create table public.fertiliser_stock_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  product text not null check (length(btrim(product)) > 0),
  quantity numeric not null check (quantity > 0 and quantity = quantity and quantity < 'Infinity'),
  unit text not null check (unit in ('kg', 't')),
  effective_date date not null,
  source text not null check (length(btrim(source)) > 0),
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index fertiliser_stock_records_farm_id_idx on public.fertiliser_stock_records (farm_id);
create index fertiliser_stock_records_farm_product_idx on public.fertiliser_stock_records (farm_id, product);

alter table public.fertiliser_stock_records enable row level security;

create policy "fertiliser_stock_records_owner_read" on public.fertiliser_stock_records
  for select
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy "fertiliser_stock_records_owner_insert" on public.fertiliser_stock_records
  for insert
  to authenticated
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

-- No update/delete policy at all -- see this file's own header comment.
revoke all on public.fertiliser_stock_records from anon;
grant select, insert on public.fertiliser_stock_records to authenticated;
