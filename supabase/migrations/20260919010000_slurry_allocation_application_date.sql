-- Slurry Application Context V1 campaign
-- (docs/farm-return-next/DOMAIN_CONTRACTS.md's own dated entry for this
-- campaign has the full account; `src/domain/nutrients.ts`'s
-- `resolveAvailableSlurryNutrients` has the full scientific rationale.)
--
-- Adds `application_date` to the existing `slurry_allocations` table —
-- the narrowest correct home for "when was/will this allocation's slurry
-- actually be spread" (see `src/domain/types.ts`'s `SlurryAllocation.
-- applicationDate` doc comment for why this lives here, not on
-- `slurry_composition_records`, and not as a competing model alongside
-- `job-actual.ts`'s later-stage, job-session-confirmed
-- `SlurrySpreadingActual`). Forward-only: a nullable, purely additive
-- column on an existing table — no existing row is touched, no existing
-- read/write path changes shape (`rowToSlurryAllocation`,
-- `src/lib/farm-data/mappers.ts`, only adds the field when the column is
-- non-null).
--
-- `application_date` is `TrackedValue<string>` (jsonb), the same shape
-- `application_method` already uses on this table — no CHECK constraint
-- on its internal structure, matching that column's own precedent; app-
-- level validation (`updateSlurryApplicationDate`,
-- `src/lib/farm-data/slurry.ts`) is the real enforcement, exactly as it
-- already is for `application_method`.

alter table public.slurry_allocations
  add column application_date jsonb; -- TrackedValue<string> (ISO date)
