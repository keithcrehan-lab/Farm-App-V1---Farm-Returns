-- Fertiliser Vertical — End-to-End Real Workflow campaign, Codex audit
-- round 50 (2026-09-09, HIGH): `listConfirmedJobSessionsForFarm`
-- (`src/lib/farm-data/job-sessions.ts`) ordered and capped the *parent*
-- `job_sessions` rows by `updated_at` — a database write timestamp —
-- before ever looking at each session's own current Actual. Round 49
-- (same day) already established that a confirmed Job Session record's
-- real chronological identity is its current (highest-revision)
-- `job_actuals` row's own `confirmed_at` — the farmer-asserted date the
-- application actually happened on, which can genuinely differ from
-- `updated_at` (a later revision, a delayed status-move retry, or any
-- other write after the fact). Round 49 fixed every *display*/sort/
-- group use of this fact on the client; this migration closes the one
-- place that correction couldn't reach from application code alone: the
-- database read itself already decided which 200 rows survive the
-- `MAX_CONFIRMED_JOB_SESSIONS` cap using the wrong timestamp. Once a
-- farm has more than 200 confirmed sessions, an old application whose
-- session was merely touched later could permanently displace a
-- genuinely newer one from ever being fetched at all — not recoverable
-- by re-sorting the (already-wrong) returned subset client-side.
--
-- PostgREST's embedded-resource `.order()` only orders the child rows
-- *within* each already-selected parent row; it cannot express "order
-- parent rows by an aggregate/max of a child table's column," and
-- fetching every Actual revision uncapped defeats the parent-row cap's
-- own purpose (this file's own header comment already documents why a
-- session realistically has only a handful of revisions — but a *farm*
-- can realistically have many more than 200 confirmed sessions). A real
-- server-side function is the correct fix, not a client-side
-- workaround.
--
-- This function deliberately returns only the correctly-ordered,
-- correctly-capped list of session ids — not the full nested
-- session+actuals+telemetry shape `listConfirmedJobSessionsForFarm`
-- needs — so the existing, already-correct embedded-select query (and
-- its own established "pick the highest-revision Actual client-side"
-- logic) is reused unchanged for the second step, re-ordered to match
-- this function's own authoritative order. `security invoker` (not
-- `security definer`) so the existing `job_sessions`/`job_actuals` RLS
-- policies apply exactly as they already do for every other real
-- reader in this schema — the same "RLS is a second, independent
-- enforcement layer, never bypassed by an RPC" discipline
-- `20260902030000_confirm_job_session_actual_atomic.sql`'s own header
-- comment documents at length (that migration's own round 5/6
-- history). `stable` (read-only, no side effects), matching a plain
-- read's own real semantics.
--
-- Codex audit LOW (round 51, same day, before this migration was ever
-- applied — edited in place rather than as a separate follow-up
-- migration, since a never-applied migration's own SQL is not yet real
-- history to preserve): `order by ... limit` alone gives Postgres no
-- guaranteed row order among ties on `confirmed_at` (a real,
-- farmer-supplied value, not a unique key) — two sessions confirmed at
-- the exact same instant could land on either side of the `p_limit`
-- boundary differently between two otherwise-identical reads. Added
-- `js.id desc` as a deterministic secondary sort key.
--
-- Status: PENDING_DEV_VALIDATION — this session has no `Farm Return V1
-- Dev` database credentials to apply or verify this migration against a
-- live database (consistent with every other unvalidated migration in
-- this schema's own history — see e.g.
-- `20260902030000_confirm_job_session_actual_atomic.sql`'s own header).
-- Reviewed manually against this schema's own established patterns
-- (column names/types from `20260902000000_job_sessions.sql`,
-- `20260902010000_job_actuals.sql`; RPC shape from
-- `20260902030000_confirm_job_session_actual_atomic.sql`); not run
-- against a live database.

create or replace function public.list_confirmed_job_session_ids_by_current_actual(
  p_farm_id uuid,
  p_limit integer
)
returns table (id uuid)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  return query
  select js.id
  from public.job_sessions js
  join lateral (
    select ja.confirmed_at
    from public.job_actuals ja
    where ja.job_session_id = js.id
    order by ja.revision desc
    limit 1
  ) current_actual on true
  where js.farm_id = p_farm_id
    and js.status = 'confirmed_actual'
  -- Codex audit LOW (round 51): `confirmed_at` is a real, farmer-supplied
  -- value, not a unique key -- two sessions can legitimately share the
  -- exact same confirmation instant. Without a deterministic tie-breaker,
  -- `order by ... limit` alone gives Postgres no guaranteed row order
  -- among ties, so which session lands on either side of the
  -- `p_limit` boundary could differ between two otherwise-identical
  -- reads. `js.id` (a real, stable, always-unique primary key) breaks
  -- ties deterministically without changing any real ordering among
  -- sessions that genuinely confirmed at different times.
  order by current_actual.confirmed_at desc, js.id desc
  limit p_limit;
end;
$$;

comment on function public.list_confirmed_job_session_ids_by_current_actual(uuid, integer) is
  'Returns confirmed job_sessions.id for one farm, ordered by each session''s own current (highest-revision) job_actuals.confirmed_at descending, capped at p_limit -- the one real source of truth for which confirmed sessions "survive" listConfirmedJobSessionsForFarm''s own MAX_CONFIRMED_JOB_SESSIONS cap (src/lib/farm-data/job-sessions.ts), never session.updated_at (Codex audit HIGH, round 50 of the Fertiliser Vertical campaign). A session with zero real job_actuals rows is excluded by the inner join -- it cannot legally be status = confirmed_actual without one (confirm_job_session_actual is the only path there), so this is not a real exclusion in practice, only a defensive consequence of requiring a real current_actual to order by.';

revoke all on function public.list_confirmed_job_session_ids_by_current_actual(uuid, integer) from public;
grant execute on function public.list_confirmed_job_session_ids_by_current_actual(uuid, integer) to authenticated;
