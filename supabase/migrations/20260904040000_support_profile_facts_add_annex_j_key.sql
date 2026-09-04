-- Farm Return Next — Supports Intelligence + Farm Strategy phase.
-- Codex audit round 12 (2026-09-04, HIGH): YFCIS's real Annex J
-- qualification requirement could never actually be satisfied by
-- `agricultural_qualification_level` alone (round 5's own, deliberate,
-- correct fix), leaving the scheme unable to ever progress past
-- `MORE_INFORMATION_REQUIRED` even once a farmer answered every gap
-- Farm Return asked for. Fixed in `src/domain/support-profile.ts`/
-- `scheme-eligibility.ts` by adding a genuinely new, directly-resolvable
-- self-declared gap fact, `holds_annex_j_qualification` — this migration
-- widens both CHECK constraints additively, the same pattern
-- `20260904010000` already established (every previously-valid key/
-- value-shape pairing stays valid; no existing row can violate either
-- new constraint, since both are strict supersets of the old ones).
--
-- Status: VALIDATED_DEV — applied to `Farm Return V1 Dev` (never
-- production) and re-verified for real. See
-- `docs/validation/support-profile-facts-dev-validation.md`'s own
-- "round 5" addendum.

alter table public.support_profile_facts drop constraint support_profile_facts_key_check;

alter table public.support_profile_facts
  add constraint support_profile_facts_key_check
  check (key in ('date_of_birth', 'head_of_holding_since', 'agricultural_qualification_level', 'biss_participant_2026', 'declared_area_ha', 'land_declared_for_schemes', 'holds_annex_j_qualification'));

alter table public.support_profile_facts drop constraint support_profile_facts_value_shape_check;

alter table public.support_profile_facts
  add constraint support_profile_facts_value_shape_check
  check (
    (key in ('date_of_birth', 'head_of_holding_since') and jsonb_typeof(value) = 'string')
    or (key in ('agricultural_qualification_level', 'declared_area_ha') and jsonb_typeof(value) = 'number')
    or (key in ('biss_participant_2026', 'land_declared_for_schemes', 'holds_annex_j_qualification') and jsonb_typeof(value) = 'boolean')
  );
