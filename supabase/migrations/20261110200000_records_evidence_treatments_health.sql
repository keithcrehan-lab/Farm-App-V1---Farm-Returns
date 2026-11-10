-- Records phase 2: evidence photos, medicine usage (treatments) and animal
-- health and deaths. Additive only.

-- Private photo store, one folder per farm: <farm id>/<kind>/<uuid>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('record-evidence', 'record-evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy record_evidence_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'record-evidence' and (storage.foldername(name))[1] in (select f.id::text from public.farms f where f.user_id = (select auth.uid())));
create policy record_evidence_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'record-evidence' and (storage.foldername(name))[1] in (select f.id::text from public.farms f where f.user_id = (select auth.uid())));

alter table public.feed_records add column if not exists evidence_path text check (evidence_path is null or length(evidence_path) <= 200);
alter table public.pesticide_applications add column if not exists evidence_path text check (evidence_path is null or length(evidence_path) <= 200);

create table if not exists public.medicine_treatments (
  id uuid primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  treated_on date not null,
  medicine_purchase_id uuid,
  product_name text not null check (length(btrim(product_name)) between 1 and 160),
  batch_number text check (batch_number is null or length(batch_number) <= 60),
  livestock_group_id uuid,
  animal_tags text check (animal_tags is null or length(animal_tags) <= 2000),
  animal_count integer not null check (animal_count between 1 and 10000),
  dose numeric not null check (dose > 0),
  dose_unit text not null check (dose_unit in ('ml', 'l', 'g', 'tablet', 'dose')),
  withdrawal_meat_days integer not null check (withdrawal_meat_days between 0 and 1000),
  withdrawal_ends_on date not null,
  administered_by text not null check (length(btrim(administered_by)) between 1 and 80),
  prescribed_by text check (prescribed_by is null or length(prescribed_by) <= 120),
  reason text check (reason is null or length(reason) <= 300),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (withdrawal_ends_on >= treated_on),
  check (livestock_group_id is not null or animal_tags is not null)
);
create index if not exists medicine_treatments_farm_date_idx on public.medicine_treatments(farm_id, treated_on desc);

create table if not exists public.animal_health_events (
  id uuid primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  occurred_on date not null,
  kind text not null check (kind in ('death', 'illness', 'injury', 'other')),
  animal_tag text check (animal_tag is null or length(animal_tag) <= 40),
  livestock_group_id uuid,
  animal_count integer not null default 1 check (animal_count between 1 and 10000),
  description text not null check (length(btrim(description)) between 1 and 1000),
  vet_seen boolean not null default false,
  disposal text check (disposal is null or disposal in ('knackery', 'other')),
  disposal_ref text check (disposal_ref is null or length(disposal_ref) <= 80),
  evidence_path text check (evidence_path is null or length(evidence_path) <= 200),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists animal_health_events_farm_date_idx on public.animal_health_events(farm_id, occurred_on desc);

alter table public.record_book_confirmations drop constraint if exists record_book_confirmations_book_check;
alter table public.record_book_confirmations add constraint record_book_confirmations_book_check
  check (book in ('medicines', 'treatments', 'movements', 'feed', 'pesticides', 'slurry', 'grass', 'health', 'jobs'));

alter table public.medicine_treatments enable row level security;
alter table public.animal_health_events enable row level security;
do $$
declare t text;
begin
  foreach t in array array['medicine_treatments', 'animal_health_events'] loop
    execute format('create policy %I on public.%I for select to authenticated using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))', t || '_owner_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))', t || '_owner_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid()))) with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))', t || '_owner_update', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;
