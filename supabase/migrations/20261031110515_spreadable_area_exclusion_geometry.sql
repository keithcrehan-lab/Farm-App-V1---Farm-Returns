-- Preserve the farmer-drawn no-spread geometry that supports each spreadable-area declaration.
-- Null = legacy/manual-area record. [] = farmer explicitly confirmed the whole mapped field is spreadable.
alter table public.field_spreadable_area_records
  add column exclusion_geometry jsonb;

comment on column public.field_spreadable_area_records.exclusion_geometry is
  'GeoJSON Polygon[] drawn by the farmer as no-spread exclusions. Empty array means the farmer explicitly confirmed the whole mapped field is spreadable; null identifies legacy/manual evidence.';
