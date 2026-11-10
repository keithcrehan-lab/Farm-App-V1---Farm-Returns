-- Intelligent planning: link calendar entries to the recommendation they
-- came from, and keep the farmer's snooze / dismiss / done choices.
-- Additive only.
alter table public.calendar_entries
  add column if not exists source_key text check (source_key is null or length(source_key) between 1 and 200);
create index if not exists calendar_entries_farm_source_idx on public.calendar_entries(farm_id, source_key) where source_key is not null;

create table if not exists public.recommendation_states (
  farm_id uuid not null references public.farms(id) on delete cascade,
  key text not null check (length(key) between 1 and 200),
  status text not null check (status in ('active', 'snoozed', 'dismissed', 'done')),
  fingerprint text not null check (length(fingerprint) between 1 and 64),
  snoozed_until date,
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (farm_id, key),
  check (status <> 'snoozed' or snoozed_until is not null)
);
alter table public.recommendation_states enable row level security;
create policy recommendation_states_owner_read on public.recommendation_states
  for select to authenticated using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
create policy recommendation_states_owner_insert on public.recommendation_states
  for insert to authenticated with check (updated_by = (select auth.uid()) and exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
create policy recommendation_states_owner_update on public.recommendation_states
  for update to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
revoke all on public.recommendation_states from public, anon, authenticated;
grant select, insert, update on public.recommendation_states to authenticated;
