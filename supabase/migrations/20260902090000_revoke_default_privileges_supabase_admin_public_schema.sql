-- Farm Return Next — Codex audit HIGH (round 2 of the Job Session /
-- Confirm Actual Dev-validation phase's own audit): the previous
-- migration (`20260902080000_revoke_default_privileges_public_schema.sql`)
-- only revoked the `public`-schema default ACL for role `postgres` — the
-- role every migration in this schema has, in practice, always created
-- objects as (confirmed via `pg_tables.tableowner`/`pg_proc`'s owning
-- role for every table/function in this schema, checked live). Live
-- verification this round found `supabase_admin` genuinely also holds
-- `CREATE` on the `public` schema
-- (`has_schema_privilege('supabase_admin', 'public', 'CREATE')` = true)
-- and carries its own separate `public`-schema default ACL, still
-- broadly granting `authenticated`/`anon` (`pg_default_acl`). This
-- migration is not evidence `supabase_admin` has ever created, or will
-- ever create, an application table here — every object in this schema
-- today is `postgres`-owned — but "no live consequence *today*" is not
-- the same claim as "closed for every possible object-creating role,"
-- which is what round 1's own finding actually required. Closed here for
-- real rather than left as a disclosed residual.
--
-- Status: BLOCKED_EXTERNAL — attempted live against `Farm Return V1
-- Dev` via `supabase db push` and rejected: `ERROR: permission denied to
-- change default privileges (SQLSTATE 42501)`. The `postgres` role this
-- project's migrations run as (confirmed the owning role of every real
-- object in this schema, and the role every prior migration in this
-- programme has successfully run `ALTER DEFAULT PRIVILEGES` as, e.g.
-- `20260902080000`) does not have permission to alter a *different*
-- role's (`supabase_admin`) own default privileges — a genuine Supabase-
-- platform role-hierarchy boundary, not a mistake in this SQL or
-- something a differently-written statement could route around. Left
-- here, unapplied, as the documented intended fix and the real
-- evidence of why it cannot be applied from this project's own
-- migration access — the file is not deleted (a future session with
-- genuine `supabase_admin`-level access, or a change from Supabase's own
-- platform side, could apply it as-is). `docs/farm-return-next/
-- BLOCKERS.md` records this. `supabase_admin`'s own broad default
-- privileges on `public` genuinely exist (`pg_default_acl`, confirmed
-- live) but, per the same live verification, no object in this schema
-- has ever actually been created as `supabase_admin` (every table's
-- `pg_tables.tableowner` is `postgres`) — a real, live-confirmed,
-- disclosed residual, not an assumed one.
alter default privileges for role supabase_admin in schema public
  revoke all on tables from authenticated, anon;

alter default privileges for role supabase_admin in schema public
  revoke all on functions from authenticated, anon;

alter default privileges for role supabase_admin in schema public
  revoke all on sequences from authenticated, anon;
