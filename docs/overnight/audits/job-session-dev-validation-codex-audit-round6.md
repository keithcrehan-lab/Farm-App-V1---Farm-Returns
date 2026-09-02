# Codex audit — Job Session / Confirm Actual real Dev database validation — round 6

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `7b4da10` (round-5 target)
PHASE_COMMIT: `daef6e3` — "Fix Codex round-5 findings against the Job
Session Dev-validation phase: 2 HIGH + 2 MEDIUM, all resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
## Findings

1. **HIGH — Test 12h still does not close the effective-privilege gap.** It checks only four of the seven affected tables. It omits `livestock_individuals`, `livestock_weight_observations`, and `supplier_quotes`, so effective `TRUNCATE` or `TRIGGER` inherited through `PUBLIC` or role membership remains undetected. It also never calls the advertised `has_any_column_privilege`: inherited column-level `UPDATE` on unintended columns and inherited column-level `REFERENCES` on any of the seven tables evade Tests 12a–12h. The direct-grant checks cannot compensate for this.

2. **HIGH — The RPC retry comparison remains incomplete and NULL-unsafe.** The fix does not compare `farm_id`, `confirmed_by`, or `confirmed_at`, although all are immutable request inputs and the TypeScript retry comparison includes `farmId` and `confirmedAt`. It also uses `<>` for `job_session_id`, `activity_type`, `completion_type`, `payload`, and `revision`; a NULL RPC argument makes those predicates UNKNOWN rather than true, potentially allowing a mismatched retry to return the existing row. These should use `IS DISTINCT FROM`, and every immutable input should be covered.

3. **MEDIUM — `field_segments` still fails open for malformed elements.** The fix rejects a present non-string `fieldId`, but silently accepts an object with no `fieldId` and non-object array elements. This contradicts the round-5 requirement and does not match the sibling `job_actuals.fieldIds` implementation, which validates the container and every element.

4. **MEDIUM — The canonical validation report remains internally inconsistent with `BLOCKERS.md` and `BUILD_STATE.json`.** The report correctly enumerates 14 applied migrations, but then calls the blocked migration "a 13th", and its summary still says "12/12 applied; a 13th blocked". `BLOCKERS.md` and `BUILD_STATE.json` instead describe 14 applied migrations and the rejected migration as the 15th.

The explicit session lookup is correct: a non-`STRICT` PL/pgSQL `SELECT INTO` with no row assigns NULL, so its subsequent check works. No new fabricated UI figure, duplicated domain calculation, or frozen-contract change was found in the phase diff.

AUDIT_SUMMARY: CRITICAL=0 HIGH=2 MEDIUM=2 LOW=0
GATE: FAIL

---

## Disposition

All four findings evaluated as legitimate and fixed in the same session:

1. **HIGH (Test 12h incomplete coverage)** — fixed: extended to check
   `TRUNCATE,TRIGGER` (the two privileges never intended anywhere) on
   `livestock_individuals`/`livestock_weight_observations`/
   `supplier_quotes` too; added Test 12i using `has_any_column_privilege`
   for column-scoped `REFERENCES` across all seven tables (the check
   round 5's own comment advertised but never actually wrote).
2. **HIGH (RPC content-check NULL-unsafety/incompleteness)** — fixed:
   `20260902130000_fix_confirm_job_session_actual_retry_content_check_round2.sql`
   switches every comparison to `IS DISTINCT FROM` and adds `farm_id`/
   `confirmed_by`/`confirmed_at` to the compared field set.
3. **MEDIUM (field_segments still fail-open)** — verified against the
   real domain type this time, not assumed: `FieldSegmentInput.fieldId`
   (`src/lib/farm-data/job-sessions.ts`) is required, never optional —
   round 5's own "missing fieldId is a valid partial state" reasoning
   was simply wrong. Fixed:
   `20260902120000_fix_field_segments_fail_open_round2.sql` requires
   every array element to be a JSON object with a string `fieldId`,
   matching `job_actuals.fieldIds`'s own sibling shape exactly.
4. **MEDIUM (validation report migration-count drift)** — fixed: the
   migrations table now lists all 16 real applied migrations (including
   this round's own #15/#16), with the blocked `supabase_admin` attempt
   correctly renumbered to the 17th throughout.

Re-run live: 51/51 PASS (up from 50).

Quality gate: unaffected (SQL/docs-only round; no TypeScript changed).
