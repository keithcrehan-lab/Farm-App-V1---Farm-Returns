-- Farm Return Next Checkpoint 2, Vertical A — closes a real HIGH finding
-- against `20260901000000_telemetry_events.sql` (Codex audit,
-- `docs/farm-return-next/audit-logs/20260901T140609Z.md`):
--
-- "The stated maximum 30-day retention policy is not enforced. The
-- migration only creates an index and explicitly defers deletion, so
-- once applied it can retain sensitive raw GPS history indefinitely.
-- The retention job must ship before ingestion is enabled, or the
-- documented contract/status must not claim a 30-day maximum."
--
-- This migration ships the actual scheduled deletion job, via
-- Supabase's own supported `pg_cron` extension — a real, versioned,
-- forward-only migration the same as every other one in this schema,
-- not a documentation-only softening of the claim. `cron.schedule` is
-- plain SQL, so this is genuinely deployable the same way as everything
-- else here, even though this build session cannot itself execute it
-- against a live project (`BLOCKERS.md`'s migration-access entry).
--
-- **Known, disclosed dependency this migration cannot itself verify:**
-- `pg_cron` must be enabled for the target project. Supabase's hosted
-- Postgres supports `pg_cron` as an installable extension (Database ->
-- Extensions in the dashboard, or `create extension` with sufficient
-- privilege) — this migration attempts `create extension if not exists
-- pg_cron`, which succeeds when the extension is available and already
-- enabled, or when the connecting role has privilege to enable it
-- itself; it will fail outright (not silently) if neither is true,
-- which is the correct behaviour — a retention job that appears to
-- schedule but never actually runs would be a worse, silent version of
-- exactly the gap this migration exists to close. If this migration
-- fails to apply for that reason, the honest status is: the 30-day
-- retention *policy* stands, but is *not yet enforced* until a human
-- with dashboard access enables `pg_cron` (or an equivalent external
-- scheduled job — e.g. a scheduled Edge Function or an external cron
-- hitting a service-role-authenticated API route) and this migration (or
-- an equivalent one) is re-applied successfully — see this file's own
-- validation checklist below.
--
-- **Why a scheduled SQL job, not an apparently simpler
-- `on insert` trigger that deletes old rows as new ones arrive:** a
-- trigger only fires when there is new traffic — a farm that stops
-- generating telemetry (the farmer stops using GPS capture, or churns)
-- would have its old rows never actually deleted, silently violating the
-- 30-day maximum for exactly the accounts least likely to notice.
-- `cron.schedule` runs on a fixed wall-clock cadence regardless of
-- traffic, which is what an unconditional retention *maximum* actually
-- requires.
--
-- **Why once daily at 03:00 UTC, not more frequently:** the 30-day
-- window has no operational reason to be enforced more precisely than
-- to the nearest day — a row that is 30 days and a few hours old,
-- briefly, before the next run deletes it, does not meaningfully weaken
-- the policy's intent (protecting against indefinite raw-GPS
-- accumulation), and a daily cadence keeps the job's own load
-- negligible. 03:00 UTC is a low-traffic hour for an Irish farm
-- management app (Ireland is UTC/UTC+1) — chosen to minimise any
-- contention with real farmer usage, not because the exact hour is
-- otherwise significant.

create extension if not exists pg_cron with schema extensions;

-- Idempotent re-apply safety: `cron.schedule` with an existing job name
-- updates that job's own definition in place rather than creating a
-- second, duplicate scheduled job — but `cron.unschedule` first, guarded
-- by existence, makes this migration safely re-runnable end-to-end (the
-- same "can this migration run twice without harm" bar every other
-- migration in this schema is held to) even across a Postgres/pg_cron
-- version where that in-place-update behaviour might differ.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'telemetry_events_retention') then
    perform cron.unschedule('telemetry_events_retention');
  end if;
end;
$$;

select cron.schedule(
  'telemetry_events_retention',
  '0 3 * * *',
  $$delete from public.telemetry_events where created_at < now() - interval '30 days'$$
);

comment on extension pg_cron is
  'Enables telemetry_events_retention (see 20260901010000_telemetry_events_retention_job.sql) -- the real, scheduled enforcement of telemetry_events'' 30-day maximum retention policy (20260901000000_telemetry_events.sql).';

-- Status: PENDING_DEV_VALIDATION -- not yet applied to any database
-- from this session (same no-network-access environment limitation as
-- every prior Checkpoint-2 migration, `BLOCKERS.md`). Apply to Farm
-- Return V1 Dev only, never production, from an environment with real
-- database access, immediately alongside (after)
-- `20260901000000_telemetry_events.sql`, then validate:
-- 1. `select * from cron.job where jobname = 'telemetry_events_retention';`
--    returns exactly one row, `schedule = '0 3 * * *'`, `active = true`.
-- 2. Insert a `telemetry_events` row with a real, valid `farm_id` and a
--    `created_at` more than 30 days in the past (requires a direct SQL
--    `insert ... created_at = ...` as a privileged role, since
--    `created_at` has no client-reachable override — `insertTelemetryEvent`
--    never sets it) alongside one with a recent `created_at`. Manually
--    run `select cron.schedule_in_database(...)` or simply wait for the
--    next scheduled run (or manually execute the job's own `delete`
--    statement once, as a one-off privileged check) and confirm only the
--    old row is removed, the recent row survives.
-- 3. `select * from cron.job_run_details where jobname =
--    'telemetry_events_retention' order by start_time desc limit 5;`
--    (after at least one real scheduled run has occurred) shows
--    `status = 'succeeded'`, not `'failed'`.
-- If `create extension pg_cron` itself fails (insufficient privilege, or
-- the extension genuinely unavailable on this project's plan), this
-- migration does not apply — do not work around that by removing the
-- extension line and shipping only the (then-nonfunctional) `cron.schedule`
-- call; escalate to a human with dashboard access to enable `pg_cron` via
-- the Database -> Extensions UI first, or design an external scheduled
-- job (Edge Function on a schedule, or an external cron hitting a
-- service-role API route) as a real alternative before claiming this
-- policy is enforced anywhere.
