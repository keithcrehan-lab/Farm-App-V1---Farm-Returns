-- Fertiliser Vertical V1 — Checkpoint 1, Soil Sampling Foundation.
-- See docs/product/farm-return-next-v1.1/SOIL_SAMPLING_ARCHITECTURE.md for
-- the frozen object model this migration implements one link of:
-- SamplingSession -> CoreObservation.
--
-- Deliberate architectural reuse, not a parallel GPS/job system
-- (CLAUDE.md's Farm Return Next never-rule: "never duplicate a
-- src/domain/src/lib/farm-data calculation or query"):
--
-- - `SamplingPlan` is NOT a new table. It is the `estimate_snapshot` of a
--   real `decisions` row (`calculation_kind = 'soil_sampling_plan'`) —
--   the identical "no new Plan table, a decision row already IS the
--   plan" architecture decision `FERTILISER_VERTICAL_ARCHITECTURE.md`
--   already made for fertiliser recommendations, applied here to a
--   sampling recommendation instead.
-- - `SamplingSession` is NOT a new table either. It is a `job_sessions`
--   row with `activity_type = 'soil_sampling'` (additive
--   `ActivityType`, `src/domain/job-actual.ts`) — the same universal Job
--   Session every other real activity already uses, with its existing
--   pause/resume/interruption-gap/offline-outbox machinery unchanged.
-- - `CompositeSample` is NOT a new mutable table. A confirmed
--   `soil_sampling` job session (1:1 with its own `job_actuals` Confirm
--   Actual row) already *is* the permanent composite sample record —
--   its own `job_sessions.id` is the permanent Sample ID (formatted for
--   display as `FR-SOIL-<first 8 chars, uppercased>` by the application
--   layer, never a second, separately-generated identity). This also
--   structurally enforces the campaign's critical rule "multiple core
--   observations -> one composite sample -> one lab result": a future
--   `lab_results` row (Checkpoint 2) references this same
--   `job_sessions.id`, with a unique constraint on it — a lab result can
--   never attach to an individual `soil_core_observations` row, because
--   no such foreign key path will ever exist.
--
-- What genuinely IS new, and needs its own table: the individual GPS
-- core-observation evidence itself. Each one is a real, independent,
-- permanent record (lat/lng/accuracy/timestamp/sequence) the campaign's
-- own "V2/V3/V4 data preservation" section requires kept in full for
-- future spatial/learning work — too voluminous (20+ per sample) and too
-- independently queryable (a future "map every core this farm has ever
-- taken" screen) to bury in a jsonb blob on `job_sessions`, unlike the
-- already-established small/bounded arrays that table already carries
-- (`active_intervals`/`interruption_gaps`/`field_segments`).
--
-- Status: NOT YET APPLIED to `Farm Return V1 Dev` — this build session
-- has no live Supabase credentials (same disclosed gap every prior
-- Farm Return Next migration in this history records — see
-- `20260902030000_confirm_job_session_actual_atomic.sql`'s own header
-- for the precedent). Forward-only, additive only: no existing table,
-- column, constraint, trigger, grant or policy is altered or dropped.

create table public.soil_core_observations (
  -- Client-generated (uuid, no default) — the same offline-first
  -- idempotency-key pattern `job_sessions.id`/`job_actuals.id` already
  -- use, required because a core is recorded live in the field with poor
  -- or no connectivity (campaign "Offline / interruption") and must be
  -- addressable locally before it ever reaches the network.
  id uuid primary key,
  farm_id uuid not null references public.farms (id) on delete cascade,
  job_session_id uuid not null references public.job_sessions (id) on delete cascade,
  field_id uuid not null references public.fields (id),
  -- References `SamplingZone.zoneId` ("A", "B", ...) from the plan
  -- decision's own `estimate_snapshot` — not a foreign key to a table,
  -- because a SamplingZone is not its own persisted row (see header).
  sampling_zone_id text not null,
  -- 1-based order within this session — lets a future map/review screen
  -- reconstruct the real walked route, and is the one thing
  -- `soil_core_observations_session_sequence_unique` below uses to make
  -- an offline-queued retry of the exact same "record core" submission
  -- idempotent (the same client-generated-id retry-safety pattern
  -- `job_actuals_session_revision_unique` already established).
  sequence integer not null check (sequence > 0),
  lat double precision not null check (lat >= -90 and lat <= 90),
  lng double precision not null check (lng >= -180 and lng <= 180),
  -- Meters; null when the platform genuinely did not report one — never
  -- fabricated (`LocationPosition.accuracyMeters`,
  -- src/lib/location/location-tracking-provider.ts). A device fix is
  -- evidence the phone was approximately at this location when the
  -- farmer tapped "Record core" — it does NOT prove the physical soil
  -- core entered the sample container (campaign's own "GPS false
  -- precision" warning, preserved here rather than only in code comments
  -- so a future direct-SQL reviewer sees the same caveat).
  accuracy_m double precision null check (accuracy_m is null or accuracy_m >= 0),
  -- Device clock at the moment of the fix — distinct from `created_at`
  -- (whenever the row is actually persisted, which can lag behind this
  -- for an offline-queued core).
  recorded_at timestamptz not null,
  -- `soil-sampling-plan.ts`'s `SOIL_SAMPLING_PLAN_VERSION` at the moment
  -- this core was recorded — reproducibility (campaign "every encoded
  -- rule must have ... methodVersion") even if the methodology's own
  -- constants change later.
  methodology_version text not null,
  -- Set only when the farmer explicitly recorded a reason for skipping
  -- the planned route at this point (e.g. "gateway", "drinking trough") —
  -- never inferred. Absent is the normal case.
  deviation_reason text null,
  created_at timestamptz not null default now(),
  constraint soil_core_observations_session_sequence_unique unique (job_session_id, sequence)
);

comment on table public.soil_core_observations is
  'Fertiliser Vertical V1 Checkpoint 1 -- one row per recorded soil core (CoreObservation). Immutable, append-only evidence: never updated or deleted once inserted. Many rows per job_sessions row (the SamplingSession); job_sessions.id itself is the permanent CompositeSample/Sample ID once the session is confirmed -- see this migration''s own header comment.';

create index soil_core_observations_job_session_id_idx on public.soil_core_observations (job_session_id);
create index soil_core_observations_field_id_idx on public.soil_core_observations (field_id);

-- ---------------------------------------------------------------------------
-- RLS -- identical owner-scoped pattern to every table in this schema
-- (20260902000000_job_sessions.sql). No update/delete policy or grant at
-- all: a recorded core is permanent field evidence, never edited or
-- removed once captured (the same "provenance is permanent" rule
-- CLAUDE.md states, applied at the database level here, not only in
-- application code -- unlike job_sessions/job_actuals, which do have
-- narrow, column-scoped update grants for real lifecycle transitions
-- this table has no lifecycle of its own to transition).
-- ---------------------------------------------------------------------------
alter table public.soil_core_observations enable row level security;

create policy soil_core_observations_owner_select on public.soil_core_observations
  for select to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy soil_core_observations_owner_insert on public.soil_core_observations
  for insert to authenticated
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.soil_core_observations from anon;
grant select, insert on public.soil_core_observations to authenticated;

-- Status: PENDING_DEV_VALIDATION -- reviewed manually against this
-- schema's own established job_sessions/job_actuals patterns; not yet
-- run against a live database (no Dev credentials in this environment).
-- Apply with `supabase db push` against Farm Return V1 Dev only, never
-- production, per CLAUDE.md.
