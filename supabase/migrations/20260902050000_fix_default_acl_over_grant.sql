-- Farm Return Next — CRITICAL live-security fix, found by this phase's
-- own Dev-database validation
-- (`supabase/validation/job_sessions_actuals_validation.sql`), not by
-- static review or any of the five prior Codex audit rounds against
-- this contract (none of which had live database access to catch it).
--
-- **The real, live, confirmed finding**: `Farm Return V1 Dev` (like
-- every Supabase project, via its own dashboard-provisioned default)
-- carries a standing `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES
-- TO anon, authenticated, service_role` for the `public` schema —
-- confirmed live via `pg_default_acl`. This means **every newly created
-- table in `public` starts with `SELECT, INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES, TRIGGER` already granted to `authenticated` and
-- `anon`**, before any migration's own `grant`/`revoke` statements run.
-- `GRANT` is additive, never a full replacement — a migration that only
-- ever *grants* (`grant select, insert on public.foo to authenticated`)
-- does not remove what the default ACL already gave `authenticated`; it
-- only adds to it.
--
-- `20260829000000_orchestration_foundation.sql` (`decisions`/`jobs`)
-- correctly handles this — `revoke all on public.decisions, public.jobs
-- from authenticated` runs *before* the later migration's own `grant
-- select, insert`. A full live audit of every table's real grants this
-- session (`information_schema.role_table_grants`, not assumed from
-- migration text) found **seven** tables missing that same step —
-- three predating this phase entirely, from Farm Return V1's own first
-- days:
--
--   table                          authenticated's real privileges (before this fix)
--   -----------------------------  --------------------------------------------------
--   livestock_individuals          SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--   livestock_weight_observations  SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--   supplier_quotes                SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--   telemetry_events               SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--   notifications                  SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--   job_sessions                   SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--   job_actuals                    SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--
-- The first three's own migrations
-- (`20260828040000_individual_animals.sql`,
-- `20260828050000_supplier_quotes.sql`) already intended full
-- `select, insert, update, delete` CRUD for `authenticated` (a real
-- farmer editing/deleting their own livestock/quote records is the
-- correct, by-design posture there) — `TRUNCATE`/`TRIGGER`/`REFERENCES`
-- were never intended on top of that. The other four migrations'
-- own header comments describe an intended `select, insert`-only (or,
-- for `notifications`/`job_sessions`, plus a narrow *column-scoped*
-- `update`) posture — none of them intended `DELETE`/`TRUNCATE`/
-- full-table `UPDATE` for `authenticated` at all. Every table this
-- session found *without* this gap (`farms`, `fields`,
-- `financial_assumptions`, `housing`, `livestock_groups`,
-- `slurry_allocations`, `decisions`, `jobs`) predates whichever point
-- the project's own default-privilege setting was introduced, or (for
-- `decisions`/`jobs`) already carried the explicit revoke — confirmed by
-- their real grants matching their own migrations' intent exactly, with
-- no excess privilege at all.
-- `TRUNCATE` is the most severe consequence: it is a whole-table
-- operation **not subject to row-level security** — with this grant in
-- place, any authenticated user (a real Farm Return V1 farmer account,
-- for the three pre-existing tables) could truncate any of these seven
-- tables *for every farm*, not just their own, regardless of any RLS
-- policy, wiping every farm's livestock/quote/telemetry/notification/job
-- data in one statement. `anon` was unaffected (every one of these
-- migrations did correctly `revoke all ... from anon`) — this is
-- `authenticated`-only, and it was a real, live gap on `Farm Return V1
-- Dev`, closed by this migration, applied immediately upon discovery, in
-- the same session that found it.
--
-- `job_actuals`/`telemetry_events`/`notifications` (unlike
-- `livestock_individuals`/`livestock_weight_observations`/
-- `supplier_quotes`, which already have real `update`/`delete` RLS
-- policies matching their own intended full-CRUD grant) currently have
-- no `UPDATE`/`DELETE`-scoped RLS policy at all, so a row-level `UPDATE`/
-- `DELETE` attempt on those three was already being silently filtered to
-- zero affected rows in practice (Postgres's own "no applicable policy
-- denies by default" rule) — not a working row-data exploit for those
-- three specifically, but `TRUNCATE` bypasses that protection entirely
-- regardless, and relying solely on "no policy happens to cover this" as
-- the only defence, with a live, unintended grant sitting directly
-- beneath it, is exactly the fragile posture this schema's own "the
-- grant is what's actually reachable, RLS is a ceiling" precedent
-- (`20260829010000_decisions_jobs_client_access.sql`) exists to avoid.
-- `job_sessions` is the one table where this was closer to a live
-- read/write gap: its own real `job_sessions_owner_update` RLS policy
-- (scoped to `for update`, no column restriction of its own) meant the
-- unintended full-table grant let an authenticated owner update *any*
-- column of their own `job_sessions` row — including `farm_id`/
-- `decision_id`/`activity_type`/`origin`/`created_at`, meant to be
-- immutable — via the grant alone. `job_sessions_check_valid_transition`
-- already independently re-checks and rejects exactly those columns
-- changing (defence in depth that was, in this one case, actually load-
-- bearing rather than redundant) — but the grant itself is still fixed
-- here to match its own documented, narrower intent.
--
-- Fix: `revoke all ... from authenticated` first (removing every
-- default-ACL-derived privilege this session did not intend), then
-- re-grant exactly what each table's own migration already documented.
revoke all on public.livestock_individuals, public.livestock_weight_observations from authenticated;
grant select, insert, update, delete on public.livestock_individuals, public.livestock_weight_observations to authenticated;

revoke all on public.supplier_quotes from authenticated;
grant select, insert, update, delete on public.supplier_quotes to authenticated;

revoke all on public.telemetry_events from authenticated;
grant select, insert on public.telemetry_events to authenticated;

revoke all on public.notifications from authenticated;
grant select, insert on public.notifications to authenticated;
grant update (state) on public.notifications to authenticated;

revoke all on public.job_sessions from authenticated;
grant select, insert on public.job_sessions to authenticated;
grant update (status, primary_field_id, field_segments, active_intervals, interruption_gaps, device_metadata, cancelled_reason)
  on public.job_sessions to authenticated;

revoke all on public.job_actuals from authenticated;
grant select, insert on public.job_actuals to authenticated;

-- Status: VALIDATED_DEV — applied to `Farm Return V1 Dev` and
-- re-verified live immediately after
-- (`supabase/validation/job_sessions_actuals_validation.sql`'s
-- re-run, `docs/validation/job-session-actual-dev-validation.md`).
