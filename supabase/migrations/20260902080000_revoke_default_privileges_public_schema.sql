-- Farm Return Next — Codex audit HIGH (round 1 of this phase's own
-- Dev-validation audit): `20260902050000_fix_default_acl_over_grant.sql`
-- fixed the *symptom* (seven existing tables' already-over-broad
-- grants) but never touched the *root cause* — the standing
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES/FUNCTIONS TO
-- anon, authenticated, service_role` this Dev project carries for the
-- `public` schema (confirmed live via `pg_default_acl`, role `postgres`).
-- Left unaddressed, the *next* migration that creates a new table or
-- function in `public` inherits the identical excess privilege
-- automatically, unless that migration's own author remembers to
-- explicitly `revoke all ... from authenticated` first — exactly the
-- omission that caused all seven prior findings
-- (`20260902050000`'s own header comment) and is not something a
-- migration-author discipline convention alone should be relied on to
-- catch every time.
--
-- Fix: revoke the default privilege itself for future objects, so a
-- forgotten `revoke` in some future migration degrades to "authenticated
-- gets nothing on the new table until a grant is added" (loud — the
-- feature simply won't work until fixed) rather than "authenticated
-- silently gets full CRUD plus TRUNCATE" (silent — a real security gap
-- that only live validation, as happened this session, would ever
-- surface). This changes nothing about any *existing* table (those keep
-- whatever grants their own migrations explicitly established, unaffected
-- by a default-privilege change) — it only changes what a brand new
-- table/function starts with from this point forward.
--
-- `ALTER DEFAULT PRIVILEGES` is itself scoped to "objects created from
-- now on, by this role" — it is not retroactive by design, which is
-- exactly why `20260902050000`'s own table-by-table fix was still needed
-- and correct as a separate, additional step.
--
-- Status: VALIDATED_DEV — applied to `Farm Return V1 Dev` and
-- re-verified live (`pg_default_acl` re-queried after this migration;
-- see `docs/validation/job-session-actual-dev-validation.md`).
alter default privileges for role postgres in schema public
  revoke all on tables from authenticated, anon;

alter default privileges for role postgres in schema public
  revoke all on functions from authenticated, anon;

alter default privileges for role postgres in schema public
  revoke all on sequences from authenticated, anon;
