-- Paddocks split from a mapped field keep a link to the parcel they came from.
-- The parcel itself is archived (soft delete) so its history stays intact.
alter table public.fields add column if not exists split_from_field_id uuid references public.fields(id) on delete set null;
create index if not exists fields_split_from_field_id_idx on public.fields(split_from_field_id) where split_from_field_id is not null;
