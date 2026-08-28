-- Real Farm V1 Phase 7 — field archive support.
--
-- Fields and soil workflow: "remove/archive where appropriate" (brief).
-- A soft delete, not a hard DELETE — a field can have soil tests, slurry
-- allocations and (once Phase 8+ persists them) nutrient plans/history
-- referencing it, and "Provenance is permanent" (CLAUDE.md) argues against
-- ever letting a farmer's past field data simply vanish. `archived_at`
-- rather than a bare boolean so there's a real timestamp for "when",
-- matching this app's existing convention of dating every state change.

alter table public.fields
  add column archived_at timestamptz;
