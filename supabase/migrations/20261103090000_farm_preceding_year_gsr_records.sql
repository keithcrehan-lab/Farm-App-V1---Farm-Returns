-- Fertiliser pilot (Codex audit F003): the LESS stocking-rate trigger
-- (S.I. 588/2025 Art. 19(1)(b), LESS_GSR_100) is defined on the holding's
-- PREVIOUS-year grassland stocking rate before exports. The current herd
-- record is a different year's figure, so the preceding-year figure is
-- held as explicit, provenanced, season-bound records.
--
-- Forward-only and non-destructive: a new nullable column with an empty
-- default. Records are appended, never rewritten; the domain selects the
-- record for the reference year (src/domain/preceding-year-gsr.ts).
alter table public.farms
  add column if not exists preceding_year_gsr_records jsonb not null default '[]'::jsonb;

comment on column public.farms.preceding_year_gsr_records is
  'Append-only records of the holding''s preceding-year grassland stocking rate from grazing-livestock manure before exports (kg N/ha), each with referenceYear, status, source and recordedAt. Sole evidence for the LESS_GSR_100 trigger.';
