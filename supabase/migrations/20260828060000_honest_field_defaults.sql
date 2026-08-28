-- Codex remediation Priority 2/6 — stop requiring a fabricated soil/
-- planned-use value at field-creation time.
--
-- `mapped_soil` and `planned_use` were `not null` because every field was
-- previously seeded with a placeholder ("Pending mapping" soil, an
-- assumed planned use) the moment it was created — exactly the fabricated-
-- default pattern the Codex audit flagged (`docs/codex-remediation/
-- REMEDIATION_LOG.md`, Priority 2 and 6). A new field is now created
-- boundary-first (polygon → derived area/centroid → name) with soil and
-- planned use genuinely absent until a real spatial lookup, farmer
-- estimate, or Field Detail edit sets them — so both columns must accept
-- NULL. Forward-only: no data is dropped, no column is removed, existing
-- non-null rows are untouched.
--
-- `fertility` stays `not null` — `{}` (no pIndex/kIndex keys) is a valid
-- non-null JSON value representing "no fertility evidence yet", so no
-- schema change is needed there; see `src/app/actions/farm.ts`.

alter table public.fields
  alter column mapped_soil drop not null;

alter table public.fields
  alter column planned_use drop not null;
