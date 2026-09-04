-- Farm Return Next — Supports Intelligence + Farm Strategy phase.
-- Codex audit round 1 (2026-09-04, HIGH): `totalDeclaredAreaHa` (a real
-- farmer's *mapped* field area) was being used directly as proof of
-- "declares eligible agricultural land"/"5ha declared under BISS" for
-- `tams3-general`/`tams3-yfcis` — mapped area is real, but it is not the
-- same fact as a real DAFM/BISS declaration, which Farm Return has no
-- other source for. Fixed in `src/domain/support-profile.ts` by adding a
-- new genuine gap fact, `land_declared_for_schemes` — this migration
-- widens `support_profile_facts.key`'s own CHECK constraint to accept
-- it, additively (every previously-valid key stays valid; no existing
-- row's `key` can violate the new constraint, since it is a superset of
-- the old one).
--
-- Status: VALIDATED_DEV — applied to `Farm Return V1 Dev` (never
-- production) and re-verified for real. See
-- `docs/validation/support-profile-facts-dev-validation.md`'s own
-- "round 2" addendum.

alter table public.support_profile_facts drop constraint support_profile_facts_key_check;

alter table public.support_profile_facts
  add constraint support_profile_facts_key_check
  check (key in ('date_of_birth', 'head_of_holding_since', 'agricultural_qualification_level', 'biss_participant_2026', 'land_declared_for_schemes'));
