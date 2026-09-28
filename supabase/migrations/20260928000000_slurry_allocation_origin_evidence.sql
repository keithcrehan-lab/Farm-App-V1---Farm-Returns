-- Campaign B — slurry-origin evidence. Full rationale:
-- `src/domain/slurry-origin-evidence.ts`'s header and
-- docs/farm-return-next/IMPLEMENTATION_LOG.md (this campaign's entry).
--
-- Where the slurry in ONE planned spreading came from, as explicitly
-- declared. The subject is the planned allocation at one plan revision —
-- never the store: a store can hold home-produced and imported slurry at
-- once, and a later import would make a permanent store-level answer
-- false without anyone editing it.
--
-- - `slurry_allocations.plan_revision`: database-maintained. 1 on insert;
--   bumped on every UPDATE that changes field_id, housing_id or volume_m3;
--   otherwise pinned to its old value (a client can never set it).
--   Completion and cancellation do not change it.
-- - `slurry_allocation_origin_evidence_records`: append-only declarations
--   (insert/select only; a correction is a NEW row). The trigger stamps the
--   plan revision, field, store and planned volume from the allocation row
--   and refuses the record unless the allocation is `planned` and still at
--   the revision the client saw — so a declaration always describes the
--   plan the farmer looked at, and a completed/cancelled plan's evidence is
--   never added to or rewritten.
--
-- Additive and forward-only: one new column with a default (existing plans
-- start at revision 1), one new table, triggers and policies. Nothing is
-- backfilled — every existing plan starts with NO origin evidence; there is
-- no default origin.
--
-- Default-ACL hazard (20260902050000_fix_default_acl_over_grant.sql): the
-- new table is first revoked from anon AND authenticated, then granted
-- select/insert only.
--
-- Status: NOT YET APPLIED to `Farm Return V1 Dev`.

-- ---------------------------------------------------------------------------
-- Plan revision
-- ---------------------------------------------------------------------------

alter table public.slurry_allocations
  add column plan_revision bigint not null default 1 check (plan_revision >= 1);

create or replace function public.slurry_allocations_track_plan_revision()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.plan_revision := 1;
  elsif new.field_id is distinct from old.field_id
    or new.housing_id is distinct from old.housing_id
    or new.volume_m3 is distinct from old.volume_m3 then
    new.plan_revision := old.plan_revision + 1;
  else
    new.plan_revision := old.plan_revision;
  end if;
  return new;
end;
$$;

revoke all on function public.slurry_allocations_track_plan_revision() from public, anon;

create trigger slurry_allocations_plan_revision
  before insert or update on public.slurry_allocations
  for each row execute function public.slurry_allocations_track_plan_revision();

-- ---------------------------------------------------------------------------
-- Origin evidence
-- ---------------------------------------------------------------------------

create table public.slurry_allocation_origin_evidence_records (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  allocation_id uuid not null references public.slurry_allocations (id) on delete cascade,
  origin text not null check (origin in ('home_produced_grazing_livestock', 'imported_organic_manure', 'mixed', 'unknown')),
  status text not null check (status in ('farmer_adjusted', 'verified')),
  source text not null check (length(btrim(source)) > 0),
  note text,
  -- The client sends the revision it saw; the trigger refuses any other.
  -- The rest of the allocation snapshot is stamped by the trigger (NOT
  -- NULL is checked after BEFORE triggers run).
  plan_revision_at_record bigint not null check (plan_revision_at_record >= 1),
  field_id_at_record uuid not null,
  housing_id_at_record uuid not null,
  volume_m3_at_record double precision not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index slurry_allocation_origin_evidence_records_farm_id_idx on public.slurry_allocation_origin_evidence_records (farm_id);
create index slurry_allocation_origin_evidence_records_allocation_id_idx on public.slurry_allocation_origin_evidence_records (allocation_id);

alter table public.slurry_allocation_origin_evidence_records enable row level security;

create policy "slurry_allocation_origin_evidence_records_owner_read" on public.slurry_allocation_origin_evidence_records
  for select
  to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

-- The allocation must belong to the same (owned) farm — no cross-farm row.
create policy "slurry_allocation_origin_evidence_records_owner_insert" on public.slurry_allocation_origin_evidence_records
  for insert
  to authenticated
  with check (
    exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid()))
    and exists (
      select 1 from public.slurry_allocations a
      where a.id = slurry_allocation_origin_evidence_records.allocation_id
        and a.farm_id = slurry_allocation_origin_evidence_records.farm_id
    )
  );

-- No update/delete policy at all — append-only.
revoke all on public.slurry_allocation_origin_evidence_records from anon, authenticated;
grant select, insert on public.slurry_allocation_origin_evidence_records to authenticated;

-- The allocation snapshot is database-owned. The allocation row is locked
-- (`for share`) so a concurrent edit cannot slip between the check and the
-- insert. Security invoker: another farm's allocation reads as not found.
create or replace function public.slurry_allocation_origin_evidence_stamp_allocation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  alloc public.slurry_allocations;
begin
  select * into alloc from public.slurry_allocations a
    where a.id = new.allocation_id and a.farm_id = new.farm_id
    for share;
  if not found then
    raise exception 'slurry_origin_evidence_rejected:ALLOCATION_NOT_FOUND' using errcode = 'foreign_key_violation';
  end if;
  if alloc.status <> 'planned' then
    raise exception 'slurry_origin_evidence_rejected:NOT_PLANNED' using errcode = 'check_violation';
  end if;
  if new.plan_revision_at_record is distinct from alloc.plan_revision then
    raise exception 'slurry_origin_evidence_rejected:PLAN_CHANGED' using errcode = 'check_violation';
  end if;

  new.field_id_at_record := alloc.field_id;
  new.housing_id_at_record := alloc.housing_id;
  new.volume_m3_at_record := alloc.volume_m3;
  return new;
end;
$$;

revoke all on function public.slurry_allocation_origin_evidence_stamp_allocation() from public, anon;

create trigger slurry_allocation_origin_evidence_stamp_allocation
  before insert on public.slurry_allocation_origin_evidence_records
  for each row execute function public.slurry_allocation_origin_evidence_stamp_allocation();

-- Capture provenance (created_by / created_at) is database-owned — the same
-- function as the other Campaign B evidence tables
-- (20260927000000_regulatory_neat_slurry_and_spreadable_area_evidence.sql).
create trigger slurry_allocation_origin_evidence_records_stamp_capture
  before insert on public.slurry_allocation_origin_evidence_records
  for each row execute function public.regulatory_evidence_records_stamp_capture();
