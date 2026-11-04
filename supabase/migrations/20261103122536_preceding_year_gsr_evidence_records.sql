-- Fertiliser pilot (Codex audit F003, CRITICAL): concurrent saves of the
-- preceding-year grassland stocking rate must never erase earlier evidence.
--
-- `20261103090000_farm_preceding_year_gsr_records.sql` held the records in
-- one JSON array on `farms`, written by read-then-replace: two interleaved
-- saves both read the same array and the second write discarded the first
-- record. Each record is now its own row in an insert-only child table, so
-- concurrent inserts can never overwrite one another and every record —
-- including superseded corrections — is kept as regulatory provenance.
-- The domain (`resolvePrecedingYearGsr`) still selects the latest record for
-- the reference year.
--
-- Forward-only and non-destructive: a new table only. The legacy
-- `farms.preceding_year_gsr_records` column is left untouched and still read
-- (merged by record id) so nothing already recorded there is lost; the
-- application no longer writes to it. No update or delete grant or policy
-- exists: rows are never rewritten.
--
-- Default-ACL hazard (20260902050000_fix_default_acl_over_grant.sql): the
-- new table is first revoked from anon AND authenticated, then granted
-- exactly select + insert to authenticated.

create table public.farm_preceding_year_gsr_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  reference_year text not null check (reference_year ~ '^\d{4}$'),
  gsr_kg_n_ha numeric not null check (gsr_kg_n_ha >= 0 and gsr_kg_n_ha <= 1000),
  status text not null check (status in ('farmer_adjusted', 'verified')),
  source text not null check (length(btrim(source)) > 0),
  recorded_by text,
  -- Capture provenance is database-owned (stamped by the trigger below):
  -- `created_at` uses clock_timestamp(), so two interleaved saves get
  -- distinct, ordered instants and the later correction governs.
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index farm_preceding_year_gsr_records_farm_year_idx
  on public.farm_preceding_year_gsr_records (farm_id, reference_year, created_at);

alter table public.farm_preceding_year_gsr_records enable row level security;

create policy "farm_preceding_year_gsr_records_owner_read" on public.farm_preceding_year_gsr_records
  for select
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy "farm_preceding_year_gsr_records_owner_insert" on public.farm_preceding_year_gsr_records
  for insert
  to authenticated
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

-- No update/delete policy at all — insert-only.
revoke all on public.farm_preceding_year_gsr_records from anon, authenticated;
grant select, insert on public.farm_preceding_year_gsr_records to authenticated;

-- The same security-invoker capture stamp as the other Campaign B evidence
-- tables (20261031110509_regulatory_neat_slurry_and_spreadable_area_evidence.sql).
create trigger farm_preceding_year_gsr_records_stamp_capture
  before insert on public.farm_preceding_year_gsr_records
  for each row execute function public.regulatory_evidence_records_stamp_capture();

comment on table public.farm_preceding_year_gsr_records is
  'Insert-only records of the holding''s preceding-year grassland stocking rate from grazing-livestock manure before exports (kg N/ha). Sole evidence for the LESS_GSR_100 trigger; the latest record per reference year governs (src/domain/preceding-year-gsr.ts).';
