-- Farm calendar: the single store under every Plan view. Additive only.
create table public.calendar_entries (
  id uuid primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  kind text not null check (kind in ('appointment', 'job', 'deadline', 'season')),
  category text not null check (category in ('cattle', 'grass', 'fields', 'nutrients', 'vet', 'contractor', 'schemes', 'other')),
  title text not null check (length(btrim(title)) between 1 and 140),
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  status text not null default 'planned' check (status in ('planned', 'booked', 'done', 'cancelled')),
  assignee_name text check (assignee_name is null or length(btrim(assignee_name)) between 1 and 80),
  notes text check (notes is null or length(notes) <= 2000),
  field_ids uuid[] not null default '{}',
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check ((kind = 'appointment') = (start_time is not null)),
  check (kind = 'appointment' or end_time is null)
);
create index calendar_entries_farm_dates_idx on public.calendar_entries(farm_id, start_date, end_date);
alter table public.calendar_entries enable row level security;
create policy calendar_entries_owner_read on public.calendar_entries
  for select to authenticated using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
create policy calendar_entries_owner_insert on public.calendar_entries
  for insert to authenticated with check (created_by = (select auth.uid()) and exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
create policy calendar_entries_owner_update on public.calendar_entries
  for update to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
revoke all on public.calendar_entries from public, anon, authenticated;
grant select, insert, update on public.calendar_entries to authenticated;
