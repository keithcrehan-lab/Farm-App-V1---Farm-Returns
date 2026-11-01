alter table public.farms
  add column if not exists grazing_production_system jsonb null;

comment on column public.farms.grazing_production_system is
  'Farm-level default grazing production system. Tracked/provenanced baseline used only when stronger field-specific movement evidence or an explicit field override is unavailable.';
