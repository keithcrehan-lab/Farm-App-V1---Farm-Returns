-- Farm Return Next Checkpoint 2, Vertical G (Notifications) — the
-- `notifications` table and its real, enforced lifecycle state machine.
-- Per `MASTER_SPEC.md`/`BLOCKERS.md`'s decided contract (product-owner
-- decision, 2026-09-01): in-app is the canonical first channel, built
-- independent of any push vendor; real lifecycle states (unread/viewed/
-- acted-on/dismissed/expired); notifications must be contextual and
-- actionable ("Good spreading window tomorrow — Fields 3, 4 and 6"),
-- never a generic data-update alert.
--
-- **A notification's `title`/`body` are never invented here or by any
-- caller** — `src/orchestration/notify/index.ts`'s `notificationFromPrompt`
-- copies them verbatim from a real, already-built `Prompt`'s own `title`/
-- `description` (`src/orchestration/prompt/index.ts`, computed by
-- `buildPrompt`'s existing `describeOk`/`describeBlockedBasis` machinery)
-- — this table is a lifecycle/persistence wrapper around an existing
-- Prompt, never a second place that generates suggestion copy
-- (`ARCHITECTURE.md`'s reuse boundary). Only an `OK`-status Prompt (a
-- real, actionable recommendation) may become a notification —
-- `notificationFromPrompt` throws on any other `basis.status`, matching
-- the product decision's "actionable, not a generic alert" requirement
-- structurally, not just by convention.
--
-- **Disclosed limit on the "actionable, not fabricated" guarantee above
-- — Codex audit MEDIUM, `docs/farm-return-next/audit-logs/
-- 20260901T150232Z.md`.** `notificationFromPrompt`'s `OK`-status check
-- protects the one real application code path this build session ships,
-- but `authenticated`'s `insert` grant on this table (below) is not
-- itself restricted to that path — any client holding a real session
-- JWT could call Supabase's REST API directly to insert a shape-valid
-- but fabricated `title`/`body`/`kind`, the identical, already-accepted,
-- systemic limitation `decisions.ts`'s own header comment documents at
-- length for `decisions.estimate_snapshot` (see that file for the full
-- reasoning): this schema's whole trust model is plain RLS + grants, not
-- a privileged/service-role-mediated write path that could verify
-- content truthfulness, and closing it here alone — while every sibling
-- table (`decisions`, `jobs`, `telemetry_events`) keeps the same
-- limitation — would be an inconsistent, table-specific patch to a
-- whole-app architectural trade-off, not a real fix. Not yet a live risk
-- (no notification-centre UI exists yet to render a fabricated row as if
-- genuine — `BLOCKERS.md`), but recorded here rather than silently
-- assumed safe, the same way `decisions.ts` already does for itself.
--
-- **Dedup via a real UNIQUE constraint, not a caller-side check** —
-- `(farm_id, kind, dedupe_key)`. A `Prompt` is never persisted and gets
-- a fresh `id` every time its producer runs (`ARCHITECTURE.md`'s own
-- "since a Prompt itself is never persisted" note), so naively creating
-- a notification from every re-computed Prompt would spam a duplicate
-- notification for the same underlying recurring situation on every
-- reload. `dedupe_key` is supplied by the caller (deliberately not
-- computed here — what makes two Prompts of the same `kind` "the same
-- underlying situation" is genuinely kind-specific, e.g. a spreading
-- window Prompt's natural key might be `fieldId + windowDate`, a soil
-- test Prompt's might be `fieldId` alone — and no real caller/consumer
-- exists yet to inform that design, the same "don't invent wiring ahead
-- of its real consumer" discipline Vertical A's own scoping note already
-- applied to GPS capture). `insertNotification`
-- (`src/lib/farm-data/notifications.ts`) is retry-safe against this
-- constraint the same way `insertDecision`/`insertTelemetryEvent` are
-- against their own natural keys.
--
-- **The lifecycle state machine is enforced by a real trigger, not a
-- bare column grant** — a deliberate, informed choice: an earlier
-- migration in this schema (`20260829010000_decisions_jobs_client_access.sql`)
-- shipped a bare `grant update (status) on public.jobs`, was caught by
-- Codex audit CRITICAL (`docs/farm-return-next/audit-logs/
-- 20260829T193529Z.md`) for letting a client rewrite a job's status to
-- ANY of its five values in any order with nothing enforcing a real
-- state machine, and that grant was removed entirely rather than
-- guarded. This table applies that lesson from the start: `authenticated`
-- gets `update (state)` — column-scoped, so a client cannot touch
-- `title`/`body`/`kind`/`dedupe_key`/`created_at` even if it tries to
-- include them in the same `UPDATE` statement (Postgres rejects that at
-- the grant level, before any trigger runs) — and a `before update`
-- trigger independently validates every transition against a real, small
-- state machine, rejecting anything else (including any client attempt
-- to ever set `'expired'` directly — see below).
--
-- **`'expired'` is never client-settable — only the scheduled expiry job
-- below sets it.** A farmer's own client can move a notification
-- `unread -> viewed`, `unread -> dismissed`, `viewed -> acted_on`, or
-- `viewed -> dismissed` — real actions a farmer actually takes.
-- `'expired'` means "the actionable window has passed," a system fact
-- about time, not a farmer action. The trigger below distinguishes the
-- two by `current_user`: `authenticated` (any real client request) is
-- rejected from ever setting `'expired'`; the expiry job itself runs as
-- a different, privileged role and is the only path that can. See
-- `notifications_check_valid_transition`'s own header comment (Codex
-- audit HIGH, `docs/farm-return-next/audit-logs/20260901T150232Z.md`)
-- for the real bug this design closes: a first version rejected
-- `'expired'` unconditionally, which would have also silently broken
-- the expiry job's own scheduled updates.
--
-- **Expiry enforcement ships in this same migration, not deferred** —
-- learning from Vertical A's own round-1 Codex audit finding
-- (`docs/farm-return-next/audit-logs/20260901T140609Z.md`, HIGH): a
-- migration that states a lifecycle policy as fact while deferring its
-- enforcement to an unnamed future task is a real overclaim. A `pg_cron`
-- job (`notifications_expiry`, hourly, matching
-- `20260901010000_telemetry_events_retention_job.sql`'s own corrected
-- cadence reasoning) marks any `unread`/`viewed` notification older than
-- 14 days as `'expired'`. **The 14-day window is a Farm Return
-- *operational* default, not a scientific/regulatory figure and not yet
-- a confirmed product-owner decision** (unlike `telemetry_events`'
-- 30-day retention, which was) — `BLOCKERS.md` records this explicitly
-- and asks for real confirmation; nothing about this schema hard-codes
-- 14 as anything other than this one job's own parameter, changeable in
-- a future forward-only migration without any other code change.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  kind text not null,
  dedupe_key text not null,
  title text not null,
  body text not null,
  field_id uuid null references public.fields (id),
  state text not null default 'unread' check (state in ('unread', 'viewed', 'acted_on', 'dismissed', 'expired')),
  created_at timestamptz not null default now(),
  state_changed_at timestamptz not null default now(),
  unique (farm_id, kind, dedupe_key)
);

comment on table public.notifications is
  'In-app notifications (Vertical G) -- a lifecycle wrapper around an already-real Prompt, never a second source of suggestion copy. title/body are always copied verbatim from Prompt.title/Prompt.description by notificationFromPrompt (src/orchestration/notify/index.ts). See this migration''s own header comment for the full contract.';
comment on column public.notifications.dedupe_key is
  'Caller-supplied natural key for "the same underlying recurring situation" -- kind-specific, not computed here. Combined with (farm_id, kind) into a real UNIQUE constraint so re-computing the same Prompt on a later page load does not spam a duplicate notification.';
comment on column public.notifications.state is
  'unread -> viewed -> acted_on|dismissed, or unread -> dismissed directly. expired is set only by the notifications_expiry pg_cron job below, never by a client -- see notifications_check_valid_transition.';

alter table public.notifications enable row level security;

create policy notifications_owner_select on public.notifications
  for select to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

create policy notifications_owner_insert on public.notifications
  for insert to authenticated
  with check (
    exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid()))
    and state = 'unread'
  );

create policy notifications_owner_update on public.notifications
  for update to authenticated
  using (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())))
  with check (exists (select 1 from public.farms f where f.id = farm_id and f.user_id = (select auth.uid())));

revoke all on public.notifications from anon;
grant select, insert on public.notifications to authenticated;
-- Column-scoped -- see this migration's own header comment on why, and
-- on the CRITICAL finding this design already learned from.
grant update (state) on public.notifications to authenticated;

-- ---------------------------------------------------------------------
-- Cross-farm ownership: notifications.field_id must belong to the same
-- farm as the notifications row itself -- identical reasoning and reused
-- helper to decisions.field_id's own trigger
-- (`20260829010000_decisions_jobs_client_access.sql`'s
-- `assert_field_belongs_to_farm`).
-- ---------------------------------------------------------------------
create or replace function public.notifications_check_same_farm()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.field_id is not null then
    perform public.assert_field_belongs_to_farm(new.field_id, new.farm_id);
  end if;
  return new;
end;
$$;

create trigger notifications_same_farm
  before insert or update on public.notifications
  for each row execute function public.notifications_check_same_farm();

-- ---------------------------------------------------------------------
-- Real, enforced lifecycle state machine -- see this migration's own
-- header comment for the full reasoning (the jobs.status CRITICAL this
-- design deliberately avoids repeating).
-- ---------------------------------------------------------------------
-- Codex audit HIGH, docs/farm-return-next/audit-logs/20260901T150232Z.md:
-- this function's first version rejected every transition into
-- 'expired' unconditionally -- including the notifications_expiry
-- pg_cron job's own UPDATE below, since a `before update` trigger fires
-- for *every* update regardless of which role performs it. The job
-- would have failed with 23514 on every real scheduled run, so
-- notifications would never actually expire despite the documented
-- lifecycle contract -- the exact "claims enforcement, doesn't deliver
-- it" overclaim this build session has already caught and fixed once
-- for telemetry_events' own retention job. Fixed by distinguishing the
-- executing role: `authenticated` is the only role any real client
-- request ever runs as (the same RLS-respecting session-client trust
-- boundary this entire schema already relies on -- every `insert`/
-- `select` policy in this file checks `to authenticated`); the
-- notifications_expiry job runs as whichever privileged role applied
-- this migration and called `cron.schedule` (never `authenticated`).
-- A client attempting to set 'expired' directly (e.g. by calling the
-- REST API's update endpoint with state=expired, bypassing
-- notifications.ts's own three named transition functions entirely) is
-- still rejected -- this is a second, independent enforcement layer
-- beyond "application code just doesn't expose that call", the same
-- "never assume application code is the only writer" discipline this
-- schema applies everywhere else.
create or replace function public.notifications_check_valid_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  -- Defence in depth beyond the column-scoped grant: even if this
  -- trigger were ever reached with other columns changed (e.g. a future
  -- migration widening the grant by mistake), reject it explicitly
  -- rather than silently allowing it.
  if new.farm_id <> old.farm_id
    or new.kind <> old.kind
    or new.dedupe_key <> old.dedupe_key
    or new.title <> old.title
    or new.body <> old.body
    or new.field_id is distinct from old.field_id
    or new.created_at <> old.created_at
  then
    raise exception 'notifications: only state may be updated after insert' using errcode = 'check_violation';
  end if;

  if new.state = old.state then
    return new; -- no-op update, harmless
  end if;

  if new.state = 'expired' then
    if current_user = 'authenticated' then
      raise exception 'notifications: expired may only be set by the scheduled notifications_expiry job, never by a client'
        using errcode = 'check_violation';
    end if;
    if old.state not in ('unread', 'viewed') then
      raise exception 'notifications: invalid state transition % -> % (id %)', old.state, new.state, old.id
        using errcode = 'check_violation';
    end if;
    new.state_changed_at := now();
    return new;
  end if;

  if old.state = 'unread' and new.state in ('viewed', 'dismissed') then
    -- legal
  elsif old.state = 'viewed' and new.state in ('acted_on', 'dismissed') then
    -- legal
  else
    raise exception 'notifications: invalid state transition % -> % (id %)', old.state, new.state, old.id
      using errcode = 'check_violation';
  end if;

  -- Server-set regardless of what the client sends -- the client's own
  -- grant does not even include this column (update (state) only), so a
  -- client attempt to set it directly is rejected by Postgres before
  -- this trigger ever runs; this line is what makes a *legal* transition
  -- carry a real, honest timestamp.
  new.state_changed_at := now();
  return new;
end;
$$;

create trigger notifications_valid_transition
  before update on public.notifications
  for each row execute function public.notifications_check_valid_transition();

-- ---------------------------------------------------------------------
-- Expiry enforcement -- real, scheduled, shipped now (not deferred).
-- See this migration's own header comment for the 14-day-default
-- disclosure and the cadence reasoning.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'notifications_expiry') then
    perform cron.unschedule('notifications_expiry');
  end if;
end;
$$;

select cron.schedule(
  'notifications_expiry',
  '0 * * * *',
  $$update public.notifications set state = 'expired' where state in ('unread', 'viewed') and created_at < now() - interval '14 days'$$
);

comment on extension pg_cron is
  'Enables notifications_expiry (this migration) and telemetry_events_retention (20260901010000_telemetry_events_retention_job.sql) -- both real, scheduled enforcement jobs, not documentation-only claims.';

create index notifications_farm_id_state_idx on public.notifications (farm_id, state);
create index notifications_created_at_idx on public.notifications (created_at);

-- Status: PENDING_DEV_VALIDATION -- not yet applied to any database
-- from this session (same no-network-access environment limitation as
-- every prior Checkpoint-2 migration, `BLOCKERS.md`). Apply to Farm
-- Return V1 Dev only, never production, then validate:
-- 1. An authenticated user can insert a notification for their own farm
--    with `state = 'unread'`; an insert with any other `state` is
--    rejected (`notifications_owner_insert`'s `with check`).
-- 2. A farm_id belonging to another user is rejected (RLS); a field_id
--    belonging to another farm is rejected
--    (`notifications_check_same_farm`).
-- 3. A second insert with the same `(farm_id, kind, dedupe_key)` hits
--    the real UNIQUE constraint -- confirm `insertNotification`
--    (`src/lib/farm-data/notifications.ts`) recovers via its own
--    `23505` content-comparison, the same pattern as
--    `insertDecision`/`insertTelemetryEvent`.
-- 4. As `authenticated` (the RLS-scoped session client, e.g. via
--    `SET LOCAL ROLE authenticated` the same way
--    `supabase/validation/decisions_jobs_rls_validation.sql` does):
--    `unread -> viewed`, `unread -> dismissed`, `viewed -> acted_on`,
--    `viewed -> dismissed` all succeed; `unread -> acted_on` directly,
--    ANY transition into `'expired'` (this is the specific case
--    round-1's Codex audit HIGH was about -- confirm a client attempt
--    is rejected, not silently accepted), any backward transition (e.g.
--    `dismissed -> unread`), and any attempt to change `title`/`body`/
--    `kind`/`dedupe_key`/`field_id` in the same update are all rejected.
-- 5. `select * from cron.job where jobname = 'notifications_expiry';`
--    returns exactly one row, `schedule = '0 * * * *'`, `active = true`;
--    after a real scheduled run (as the migration's own, non-
--    `authenticated` role), an `unread`/`viewed` row older than 14 days
--    is `'expired'`, a recent one is untouched -- confirming the
--    `current_user` check above does not also block the job's own
--    legitimate update.
-- 6. The anon key has no access at all (`revoke all ... from anon`).
