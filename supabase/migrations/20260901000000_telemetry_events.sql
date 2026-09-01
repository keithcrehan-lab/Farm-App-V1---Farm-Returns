-- Farm Return Next Checkpoint 2, Vertical A (Observe/telemetry) — the
-- `telemetry_events` table `ARCHITECTURE.md`'s "Data model additions"
-- section named as deferred from Checkpoint 1's migration (real design
-- requirements weren't known until this vertical existed to supply
-- them — see that file's own "Deferred to their owning verticals"
-- section, and `BLOCKERS.md`'s matching entry).
--
-- Scope of this migration: raw Observe-stage phone-GPS events only —
-- the schema half of Vertical A's contract (`ARCHITECTURE.md`'s
-- "Offline / GPS job mode" section, product-owner decision 2026-09-01).
-- The client-side IndexedDB durable outbox that queues these events
-- offline and flushes them here is `src/lib/offline/outbox.ts`
-- (application code, no migration of its own). Deliberately NOT in this
-- migration, per that same decision and per this checkpoint's own
-- "don't build ahead of an approved visual reference" discipline
-- (`CLAUDE.md`'s screen workflow): any Start-Job/GPS-job-mode *screen*,
-- the derived-evidence table a confirmed job would reference, and the
-- revision/conflict-detection column `ARCHITECTURE.md` requires for
-- multi-device Confirm conflicts — all three are Vertical C's own scope
-- (`BUILD_PLAN.md`'s build-priority #4), once Vertical E has an approved
-- reference for the actual job-mode screens. This table's job is only to
-- durably and safely receive whatever a phone captured, nothing more.
--
-- **Client-generated `id` (idempotency key), not a server default** —
-- `ARCHITECTURE.md`'s explicit requirement: "deterministic event IDs/
-- idempotency keys (client-generated once, at record time — the same
-- discipline `decisions.id`/`crypto.randomUUID()` already established
-- server-side for `decideAsFarmer`, now required client-side too)".
-- This is what makes a client's offline-outbox retry after a lost
-- network response safe: the insert function
-- (`src/lib/farm-data/telemetry.ts`'s `insertTelemetryEvent`) mirrors
-- `insertDecision`'s own real `23505`-retry-safety pattern
-- (`decisions.ts`) — a duplicate `id` can only mean an earlier attempt's
-- insert already committed, so the retry fetches and content-compares
-- the existing row rather than either failing or silently inserting a
-- second copy of the same real-world GPS point.
--
-- **`recorded_at` vs `created_at`** — same split `decisions.decided_at`/
-- `created_at` already established: `recorded_at` is when the phone's
-- GPS actually captured this point (client clock, may be well before the
-- server ever sees it, given this table exists specifically for offline
-- capture); `created_at` is when this row was actually written to the
-- database. Retention (30-day, below) is measured from `created_at`
-- deliberately, not `recorded_at` — a point captured offline and synced
-- late should still get its full 30 days of availability from when it
-- actually became queryable, not be silently already-expired on arrival
-- because the phone was offline for a while.
--
-- **Payload shape is validated at the database, not trusted from the
-- client** — the same "never assume application code is the only
-- writer" discipline `decisions_estimate_snapshot_ok_shape` already
-- applies to `decisions.estimate_snapshot`. `lat`/`lng` must be present,
-- numeric, and within real coordinate range; anything else (accuracy,
-- altitude, heading, speed — all optional, phone-GPS-API-dependent) is
-- carried in `payload` unvalidated at this layer, the same "the CHECK
-- validates what it can cheaply and objectively validate, not full
-- domain correctness" posture that migration's own comment already
-- documents for its own, harder case.
--
-- **Retention (product-owner decision, 2026-09-01, `BLOCKERS.md`): raw
-- GPS observations are kept a maximum of 30 days; this table is never
-- the permanent Farm Return record.** Once Vertical C's derived-evidence
-- row exists for a confirmed job, that row — not this table — is what
-- `jobs`/any future `estimate_calibration` may reference, and is what
-- survives permanently. No automated deletion job ships in this
-- migration: actually enforcing the 30-day window is an *operational*
-- task (a scheduled job, run with the same real database access this
-- build session itself does not have — see `BLOCKERS.md`'s migration-
-- access entry), out of scope here the same way applying this migration
-- to Dev is. This migration's own job is only to make sure nothing about
-- the schema *prevents* that operational deletion once it exists: no
-- other table has (or, per the comment above, ever should have) a
-- foreign key into this one, so deleting an old row here can never
-- orphan or corrupt anything else.
--
-- **No `update`/`delete` grant to `authenticated`** — same posture as
-- `decisions`/`jobs`' own "a decision, once made, is a historical fact"
-- (`20260829000000_orchestration_foundation.sql`). A raw GPS observation
-- a farmer's own phone captured is not something the farmer's own client
-- session should be able to retroactively edit or erase either — the
-- 30-day retention deletion above is a system/operational operation
-- (implicitly a privileged one, since no client grant permits it), not
-- something reachable through the app's normal authenticated session.

create table public.telemetry_events (
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  source text not null check (source = 'phone_gps'),
  recorded_at timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.telemetry_events is
  'Raw Observe-stage phone events (Vertical A), max 30-day retention -- never the permanent Farm Return record. id is client-generated (idempotency key for the offline outbox), not server-defaulted. See this migration''s own header comment for the full contract.';
comment on column public.telemetry_events.id is
  'Client-generated (crypto.randomUUID() or equivalent) at capture time -- the offline outbox''s idempotency key. A retried insert with the same id is a safe no-op (see insertTelemetryEvent''s 23505 handling), never a duplicate row.';
comment on column public.telemetry_events.recorded_at is
  'When the phone actually captured this point (client clock) -- may be well before created_at for an offline-queued event that synced late.';
comment on column public.telemetry_events.created_at is
  'When this row was actually written to the database -- the 30-day retention window is measured from here, not recorded_at, so a late-syncing offline point still gets its full retention window.';

alter table public.telemetry_events
  add constraint telemetry_events_phone_gps_payload_shape
    check (
      source <> 'phone_gps' or (
        jsonb_typeof(payload -> 'lat') = 'number'
        and jsonb_typeof(payload -> 'lng') = 'number'
        and (payload ->> 'lat')::numeric between -90 and 90
        and (payload ->> 'lng')::numeric between -180 and 180
      )
    );

create index telemetry_events_farm_id_recorded_at_idx on public.telemetry_events (farm_id, recorded_at);
-- Supports the future operational retention job's own query shape
-- (delete rows older than 30 days) without a farm_id in scope.
create index telemetry_events_created_at_idx on public.telemetry_events (created_at);

alter table public.telemetry_events enable row level security;

create policy telemetry_events_owner_select on public.telemetry_events
  for select to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy telemetry_events_owner_insert on public.telemetry_events
  for insert to authenticated
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.telemetry_events from anon;
grant select, insert on public.telemetry_events to authenticated;

-- Status: PENDING_DEV_VALIDATION -- not yet applied to any database
-- (this build session has no working network path to Supabase's
-- Postgres/Management-API endpoints, the same limitation
-- `BLOCKERS.md`'s migration-access entry already documents for the
-- three prior Checkpoint-2 migrations). Apply to Farm Return V1 Dev
-- only, never production, from an environment with real database
-- access, then validate: an authenticated user can insert a
-- well-formed phone_gps event for their own farm; a farm_id belonging
-- to another user is rejected (RLS); a select of another farm's events
-- returns zero rows (RLS); an insert with a non-numeric or
-- out-of-range lat/lng is rejected (the CHECK constraint above); a
-- retried insert with the same id and identical content succeeds as a
-- no-op via insertTelemetryEvent, not a duplicate row; the anon key has
-- no access at all. Extend
-- supabase/validation/decisions_jobs_rls_validation.sql's own pattern
-- for this table rather than writing a new script from scratch, once
-- Vertical C's own writes exist to validate alongside it.
