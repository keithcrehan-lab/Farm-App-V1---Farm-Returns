-- Grass surveys: a walk, quad run or drone flight saved as one record.
-- Additive only: two new tables and one nullable column on grass_cover_observations.

create table public.grass_surveys (
  -- Client-generated, so a retried start never creates a second survey.
  id uuid primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  mode text not null check (mode in ('walk', 'quad', 'drone')),
  status text not null default 'in_progress' check (status in ('in_progress', 'finished')),
  started_at timestamptz not null,
  finished_at timestamptz,
  distance_m numeric check (distance_m is null or distance_m >= 0),
  weather jsonb,
  results jsonb,
  marked_grazed_field_ids uuid[] not null default '{}',
  skipped_field_ids uuid[] not null default '{}',
  device text check (device is null or length(device) <= 200),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (finished_at is null or finished_at >= started_at)
);
create index grass_surveys_farm_started_idx on public.grass_surveys(farm_id, started_at desc);
alter table public.grass_surveys enable row level security;
create policy grass_surveys_owner_read on public.grass_surveys
  for select to authenticated using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
create policy grass_surveys_owner_insert on public.grass_surveys
  for insert to authenticated with check (created_by = (select auth.uid()) and exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
create policy grass_surveys_owner_update on public.grass_surveys
  for update to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
revoke all on public.grass_surveys from public, anon, authenticated;
grant select, insert, update on public.grass_surveys to authenticated;

create table public.grass_survey_track_points (
  survey_id uuid not null references public.grass_surveys(id) on delete cascade,
  farm_id uuid not null references public.farms(id) on delete cascade,
  recorded_at timestamptz not null,
  lat double precision not null check (lat >= -90 and lat <= 90),
  lng double precision not null check (lng >= -180 and lng <= 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  primary key (survey_id, recorded_at)
);
alter table public.grass_survey_track_points enable row level security;
create policy grass_survey_track_owner_read on public.grass_survey_track_points
  for select to authenticated using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));
create policy grass_survey_track_owner_insert on public.grass_survey_track_points
  for insert to authenticated with check (
    exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid()))
    and exists (select 1 from public.grass_surveys s where s.id = survey_id and s.farm_id = grass_survey_track_points.farm_id));
revoke all on public.grass_survey_track_points from public, anon, authenticated;
grant select, insert on public.grass_survey_track_points to authenticated;

alter table public.grass_cover_observations
  add column survey_id uuid references public.grass_surveys(id) on delete set null;
create index grass_cover_observations_survey_idx on public.grass_cover_observations(survey_id) where survey_id is not null;
