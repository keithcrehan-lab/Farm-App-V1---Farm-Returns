-- A mistaken animal entry is reversible without erasing historical observations.
-- Records are retained for at least 30 days; no automatic purge is scheduled.
alter table public.livestock_individuals add column if not exists deleted_at timestamptz;
create index if not exists livestock_individuals_active_farm_idx
  on public.livestock_individuals (farm_id, created_at) where deleted_at is null;
