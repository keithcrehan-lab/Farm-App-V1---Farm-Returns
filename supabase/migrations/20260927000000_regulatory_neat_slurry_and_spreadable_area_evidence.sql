-- Campaign B schema and persistence — regulatory neat-slurry evidence and
-- spreadable-area evidence. Full rationale:
-- `src/domain/regulatory-evidence-records.ts`'s header and
-- docs/farm-return-next/IMPLEMENTATION_LOG.md (this campaign's entry).
--
-- Two new append-only evidence tables, the same storage discipline as
-- `slurry_composition_records` (20260919000000) and
-- `fertiliser_stock_records` (20260917000000): insert/select only, a
-- correction is a NEW row, never an edit, and the current record is
-- derived on read — no mutable "current" pointer.
--
-- - `slurry_store_neat_evidence_records`: a store's REGULATORY neat
--   cattle slurry volume. Independent of the store's physical volume
--   (`housing.storage_capacity_m3` × `storage_fill_pct`) and of its
--   agronomic composition (`slurry_composition_records`). `unavailable`
--   is a recorded evidence state and carries no volume. No row = not
--   established.
-- - `field_spreadable_area_records`: a field's defensible spreadable
--   area. Independent of the gross field area (`fields.area_ha`). The
--   gross area at the time of recording is stamped by the database
--   (never the client) so a later gross-area change never rewrites what
--   the record meant. No row = not established.
--
-- Additive and forward-only: no existing table, column, row, policy or
-- grant is modified; nothing is backfilled — every existing store and
-- field starts with no neat-slurry or spreadable-area evidence.
--
-- Default-ACL hazard (20260902050000_fix_default_acl_over_grant.sql):
-- every new table is first revoked from anon AND authenticated, then
-- granted select/insert only.
--
-- Status: NOT YET APPLIED to `Farm Return V1 Dev`.

-- ---------------------------------------------------------------------------
-- Regulatory neat-slurry evidence
-- ---------------------------------------------------------------------------

create table public.slurry_store_neat_evidence_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  housing_id uuid not null references public.housing (id) on delete cascade,
  status text not null check (status in ('farmer_adjusted', 'verified', 'unavailable')),
  neat_volume_m3 numeric check (
    neat_volume_m3 is null
    or (neat_volume_m3 >= 0 and neat_volume_m3 <> 'NaN'::numeric and neat_volume_m3 <> 'Infinity'::numeric)
  ),
  effective_date date not null,
  source text not null check (length(btrim(source)) > 0),
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  -- Known evidence (including an explicit 0 m³) always has a volume;
  -- unavailable evidence never has one.
  constraint slurry_store_neat_evidence_volume_matches_status check (
    (status = 'unavailable' and neat_volume_m3 is null)
    or (status <> 'unavailable' and neat_volume_m3 is not null)
  )
);

create index slurry_store_neat_evidence_records_farm_id_idx on public.slurry_store_neat_evidence_records (farm_id);
create index slurry_store_neat_evidence_records_housing_id_idx on public.slurry_store_neat_evidence_records (housing_id);

alter table public.slurry_store_neat_evidence_records enable row level security;

create policy "slurry_store_neat_evidence_records_owner_read" on public.slurry_store_neat_evidence_records
  for select
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

-- The store must belong to the same (owned) farm — no cross-farm row.
-- Outer columns are table-qualified: an unqualified `farm_id` inside the
-- housing subquery would bind to `h.farm_id`.
create policy "slurry_store_neat_evidence_records_owner_insert" on public.slurry_store_neat_evidence_records
  for insert
  to authenticated
  with check (
    exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid()))
    and exists (
      select 1 from public.housing h
      where h.id = slurry_store_neat_evidence_records.housing_id and h.farm_id = slurry_store_neat_evidence_records.farm_id
    )
  );

-- No update/delete policy at all — append-only.
revoke all on public.slurry_store_neat_evidence_records from anon, authenticated;
grant select, insert on public.slurry_store_neat_evidence_records to authenticated;

-- ---------------------------------------------------------------------------
-- Spreadable-area evidence
-- ---------------------------------------------------------------------------

create table public.field_spreadable_area_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  field_id uuid not null references public.fields (id) on delete cascade,
  status text not null check (status in ('farmer_adjusted', 'verified')),
  spreadable_area_ha numeric not null check (
    spreadable_area_ha >= 0 and spreadable_area_ha <> 'NaN'::numeric and spreadable_area_ha <> 'Infinity'::numeric
  ),
  -- Stamped by `field_spreadable_area_records_stamp_gross_area` below;
  -- null when the field's gross area was not known at recording time.
  gross_area_ha_at_record double precision,
  effective_date date not null,
  source text not null check (length(btrim(source)) > 0),
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint field_spreadable_area_within_gross_at_record check (
    gross_area_ha_at_record is null or spreadable_area_ha <= gross_area_ha_at_record::numeric
  )
);

create index field_spreadable_area_records_farm_id_idx on public.field_spreadable_area_records (farm_id);
create index field_spreadable_area_records_field_id_idx on public.field_spreadable_area_records (field_id);

alter table public.field_spreadable_area_records enable row level security;

create policy "field_spreadable_area_records_owner_read" on public.field_spreadable_area_records
  for select
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy "field_spreadable_area_records_owner_insert" on public.field_spreadable_area_records
  for insert
  to authenticated
  with check (
    exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid()))
    and exists (
      select 1 from public.fields fl
      where fl.id = field_spreadable_area_records.field_id and fl.farm_id = field_spreadable_area_records.farm_id
    )
  );

revoke all on public.field_spreadable_area_records from anon, authenticated;
grant select, insert on public.field_spreadable_area_records to authenticated;

-- The gross area a record was checked against is database-owned: any
-- client-supplied value is overwritten from `fields.area_ha`. Gross area
-- is known when finite and > 0 — the same rule as
-- `fieldSpreadableAreaEvidence` (`src/domain/slurry-regulatory-context.ts`).
-- A spreadable area above a known gross area is rejected, never clamped.
--
-- Security: `security invoker` — the field is read under the caller's own
-- RLS, so another farm's field is reported as not found and its area is
-- never revealed. `search_path` is pinned.
create or replace function public.field_spreadable_area_records_stamp_gross_area()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  gross double precision;
begin
  select fl.area_ha into gross from public.fields fl where fl.id = new.field_id and fl.farm_id = new.farm_id;
  if not found then
    raise exception 'field_spreadable_area_rejected:FIELD_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;

  if gross is null
    or gross = 'NaN'::double precision
    or gross = 'Infinity'::double precision
    or gross = '-Infinity'::double precision
    or gross <= 0 then
    new.gross_area_ha_at_record := null;
  else
    new.gross_area_ha_at_record := gross;
    if new.spreadable_area_ha > gross::numeric then
      raise exception 'field_spreadable_area_rejected:EXCEEDS_GROSS_AREA' using errcode = 'check_violation',
        detail = format('spreadable %s ha, gross %s ha', new.spreadable_area_ha, gross);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.field_spreadable_area_records_stamp_gross_area() from public, anon;

create trigger field_spreadable_area_records_stamp_gross_area
  before insert on public.field_spreadable_area_records
  for each row execute function public.field_spreadable_area_records_stamp_gross_area();
