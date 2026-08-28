-- Real Mode Completion Phase 20 — market-data subsystem, supplier-quote half.
--
-- The brief's "market price observation" half (a public reference-price
-- table fed by an automated source) is deliberately NOT built as a live
-- table this phase — there is no automated feed to populate it with (see
-- BUILD_LOG.md Phase 22 for the researched-and-documented reasoning), and
-- an empty scaffold table would be worse than being honest that the
-- reference tier of the price hierarchy is still the existing real,
-- sourced, versioned CSO series in src/domain/market.ts (code constants,
-- re-fetched from a public dataset, not farm data — a legitimate
-- ownership/read model already, just not a database table). This
-- migration builds the half that's genuinely new and immediately real:
-- a farmer's own supplier quotes, which rank above the CSO reference tier
-- in the price hierarchy (src/domain/price-resolution.ts) precisely
-- because they're this farm's own, not a regional average.

create table public.supplier_quotes (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  supplier_name text not null,
  product text not null,
  quantity numeric,
  unit text not null,
  price_eur numeric not null,
  delivery_included boolean not null default false,
  quote_date date not null,
  valid_until date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger supplier_quotes_set_updated_at
  before update on public.supplier_quotes
  for each row execute function public.set_updated_at();

create index supplier_quotes_farm_id_idx on public.supplier_quotes (farm_id);

alter table public.supplier_quotes enable row level security;

create policy "supplier_quotes_owner_all" on public.supplier_quotes
  for all
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.supplier_quotes from anon;
grant select, insert, update, delete on public.supplier_quotes to authenticated;
