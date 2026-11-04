-- Fertiliser pilot (Codex audit F003, HIGH): the latest correction of the
-- preceding-year grassland stocking rate must be chosen by an authoritative
-- database order, never by parsing timestamps in JavaScript.
--
-- `created_at` is a microsecond timestamptz, but the application parses it
-- with millisecond precision, so two corrections inserted within the same
-- millisecond (e.g. .123100 and .123900) collapsed to one instant: a false
-- conflict, or an id tie-break that could pick the stale record.
--
-- `record_order` is a database-assigned, strictly increasing insertion
-- order: a BEFORE INSERT trigger always sets it from a dedicated sequence,
-- overriding any value a client sends, so it can never be forged or tied.
-- `resolvePrecedingYearGsr` orders by it; records without it (rows inserted
-- before this migration, and the legacy `farms.preceding_year_gsr_records`
-- JSON) fall back, with lower authority, to their recorded time.
--
-- Forward-only and non-destructive: a nullable column added WITHOUT a
-- default, so no existing row is rewritten or given a made-up order. The
-- trigger is security invoker (no SECURITY DEFINER); `authenticated`
-- receives only USAGE on the sequence, which the invoker trigger needs to
-- call nextval(). The table's grants and policies are unchanged — still
-- select + insert only, never update or delete.
create sequence public.farm_preceding_year_gsr_records_record_order_seq as bigint;

alter table public.farm_preceding_year_gsr_records
  add column record_order bigint;

alter sequence public.farm_preceding_year_gsr_records_record_order_seq
  owned by public.farm_preceding_year_gsr_records.record_order;

create unique index farm_preceding_year_gsr_records_record_order_key
  on public.farm_preceding_year_gsr_records (record_order);

create or replace function public.farm_preceding_year_gsr_records_stamp_order()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.record_order := nextval('public.farm_preceding_year_gsr_records_record_order_seq');
  return new;
end;
$$;

revoke all on function public.farm_preceding_year_gsr_records_stamp_order() from public, anon;

revoke all on sequence public.farm_preceding_year_gsr_records_record_order_seq from public, anon, authenticated;
grant usage on sequence public.farm_preceding_year_gsr_records_record_order_seq to authenticated;

create trigger farm_preceding_year_gsr_records_stamp_order
  before insert on public.farm_preceding_year_gsr_records
  for each row execute function public.farm_preceding_year_gsr_records_stamp_order();

comment on column public.farm_preceding_year_gsr_records.record_order is
  'Database-assigned insertion order (trigger, from a dedicated sequence; client values are overwritten). Authoritative ordering key for the latest correction per reference year. Null only on rows inserted before 20261103135704.';
