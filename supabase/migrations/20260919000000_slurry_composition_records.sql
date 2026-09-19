-- Slurry Evidence & Composition V1 campaign
-- (docs/farm-return-next/DOMAIN_CONTRACTS.md's own dated entry for this
-- campaign has the full account; `src/domain/slurry-composition.ts`'s own
-- header has the full data-model rationale.)
--
-- `slurry_composition_records` — the canonical slurry composition/
-- evidence record: which shed/tank (`housing_id`) a result belongs to,
-- its dry-matter % (the one figure `calculateNutrientPlan` actually
-- consumes — `src/domain/nutrients.ts`'s `resolveEffectiveSlurryComposition`),
-- and, where known, measured total N/P/K (kg/m3) — recorded for evidence
-- but NOT YET consumed by the nutrient engine (no existing Teagasc rule
-- in this repo converts a measured total composition into Table 9-8's
-- available-nutrient output; see this campaign's own completion report).
--
-- Insert/select only, exactly the same discipline
-- `fertiliser_stock_records` already established
-- (20260917000000_fertiliser_stock_and_slurry_provenance.sql): a farmer/
-- lab correction is a NEW row, never an edit of an old one (CLAUDE.md
-- "provenance is permanent" — full history via the append-only table
-- itself, never a mutable "current" pointer). The current/effective
-- record per housing is derived on read
-- (`currentSlurryCompositionByHousing`), never stored redundantly here.

create table public.slurry_composition_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  housing_id uuid not null references public.housing (id) on delete cascade,
  slurry_type text not null check (slurry_type in ('cattle_slurry')),
  status text not null check (status in ('farmer_adjusted', 'verified')),
  dm_pct numeric not null check (dm_pct > 0 and dm_pct <= 100),
  n_per_m3 numeric check (n_per_m3 is null or n_per_m3 >= 0),
  p_per_m3 numeric check (p_per_m3 is null or p_per_m3 >= 0),
  k_per_m3 numeric check (k_per_m3 is null or k_per_m3 >= 0),
  sample_date date not null,
  source text not null check (length(btrim(source)) > 0),
  laboratory text,
  sample_ref text,
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index slurry_composition_records_farm_id_idx on public.slurry_composition_records (farm_id);
create index slurry_composition_records_housing_id_idx on public.slurry_composition_records (housing_id);

alter table public.slurry_composition_records enable row level security;

create policy "slurry_composition_records_owner_read" on public.slurry_composition_records
  for select
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy "slurry_composition_records_owner_insert" on public.slurry_composition_records
  for insert
  to authenticated
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

-- No update/delete policy at all -- see this file's own header comment.
revoke all on public.slurry_composition_records from anon;
grant select, insert on public.slurry_composition_records to authenticated;
