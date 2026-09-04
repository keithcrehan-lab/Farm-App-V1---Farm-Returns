-- Farm Return Next — Supports Intelligence + Farm Strategy phase.
-- Codex audit round 4 (2026-09-04), two real findings closed together:
--
-- 1. (HIGH) `land_declared_for_schemes` (a plain yes/no) could satisfy
--    YFCIS's real 5-hectare-*declared* minimum from a farm that had only
--    a small fraction of its mapped area actually declared — the
--    boolean said nothing about *how much* was declared. Replaced with
--    `declared_area_ha`, a real farmer-entered number
--    (`src/domain/support-profile.ts`/`scheme-eligibility.ts`'s own
--    `assessLandDeclaredGate` now reads this exclusively). No real farmer
--    had ever answered `land_declared_for_schemes` (it was introduced
--    and replaced within the same session), so this is a clean swap, not
--    a destructive change to real farmer data.
-- 2. (HIGH) the `key` CHECK constraint said nothing about `value`'s own
--    shape, and `authenticated` holds direct insert/update grants on
--    this table (the same plain RLS-respecting architecture every table
--    in this schema uses — see `decisions.ts`'s own header comment for
--    why that's a deliberate choice, not an oversight) — so a write that
--    bypassed `upsertSupportProfileFactAction`'s own
--    `validateSupportProfileFactValue` call (a malformed direct
--    supabase-js call, not the shipped UI) could still reach the
--    database with a `value` whose JSON *type* doesn't match its `key`
--    at all (e.g. a string where `biss_participant_2026` needs a real
--    boolean). Application-level validation stays the primary, richer
--    check (real calendar dates, non-future, integer ranges — a CHECK
--    constraint can't express all of that) — this migration adds the
--    one thing a database constraint genuinely can enforce cheaply and
--    unconditionally: the right JSON *type* per key, closing the class
--    of bug where a non-boolean/non-number value silently misreads as
--    `false`/`NaN` in application code.
--
-- Status: VALIDATED_DEV — applied to `Farm Return V1 Dev` (never
-- production) and live-verified. See
-- `docs/validation/support-profile-facts-dev-validation.md`'s own
-- "round 3" addendum.

alter table public.support_profile_facts drop constraint support_profile_facts_key_check;

alter table public.support_profile_facts
  add constraint support_profile_facts_key_check
  check (key in ('date_of_birth', 'head_of_holding_since', 'agricultural_qualification_level', 'biss_participant_2026', 'declared_area_ha'));

alter table public.support_profile_facts
  add constraint support_profile_facts_value_shape_check
  check (
    (key in ('date_of_birth', 'head_of_holding_since') and jsonb_typeof(value) = 'string')
    or (key in ('agricultural_qualification_level', 'declared_area_ha') and jsonb_typeof(value) = 'number')
    or (key = 'biss_participant_2026' and jsonb_typeof(value) = 'boolean')
  );
