-- Farm Return Next — Supports Intelligence + Farm Strategy phase.
-- Codex audit round 12 (2026-09-04), CRITICAL: `20260904020000_..._
-- declared_area_and_value_shape.sql` dropped and replaced the `key`
-- CHECK constraint with one that no longer accepts
-- `land_declared_for_schemes` (the boolean key `20260904010000`
-- introduced and `20260904020000` itself deprecated in favour of the
-- real numeric `declared_area_ha`). That migration's own header comment
-- argued this was safe because no real farmer had answered the legacy
-- key by the time it ran — true for `Farm Return V1 Dev` at that
-- moment, but not a property the migration itself enforces, and not the
-- kind of assumption a forward-only migration is allowed to lean on
-- (`AGENTS.md`/`CLAUDE.md`: "every migration stays forward-only... never
-- make a destructive database change"). A constraint narrowing that
-- silently drops a previously-accepted value is exactly the
-- drop/replace pattern that rule exists to prevent, regardless of
-- whether this specific database happened to have no affected rows this
-- time.
--
-- Fixed forward-only, not by editing `20260904020000` (already applied
-- to `Farm Return V1 Dev` — rewriting an applied migration's own SQL is
-- not how this repo corrects a migration mistake): both constraints are
-- widened again to permanently accept `land_declared_for_schemes`
-- alongside every current key. The application layer still never writes
-- it (`support-profile.ts`'s own registered `SupportProfileFactKey`
-- union has not changed) — this migration only restores the database's
-- own willingness to hold a legacy row using it, exactly like any other
-- deprecated-but-still-valid enum member.
--
-- Status: VALIDATED_DEV — applied to `Farm Return V1 Dev` (never
-- production) and re-verified for real (see
-- `docs/validation/support-profile-facts-dev-validation.md`'s own
-- "round 4" addendum).

alter table public.support_profile_facts drop constraint support_profile_facts_key_check;

alter table public.support_profile_facts
  add constraint support_profile_facts_key_check
  check (key in ('date_of_birth', 'head_of_holding_since', 'agricultural_qualification_level', 'biss_participant_2026', 'declared_area_ha', 'land_declared_for_schemes'));

alter table public.support_profile_facts drop constraint support_profile_facts_value_shape_check;

alter table public.support_profile_facts
  add constraint support_profile_facts_value_shape_check
  check (
    (key in ('date_of_birth', 'head_of_holding_since') and jsonb_typeof(value) = 'string')
    or (key in ('agricultural_qualification_level', 'declared_area_ha') and jsonb_typeof(value) = 'number')
    or (key in ('biss_participant_2026', 'land_declared_for_schemes') and jsonb_typeof(value) = 'boolean')
  );
