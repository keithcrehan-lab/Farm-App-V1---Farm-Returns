# Codex audit — Job Session / Confirm Actual real Dev database validation — round 7

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `daef6e3` (round-6 target)
PHASE_COMMIT: `2080e75` — "Fix Codex round-6 findings against the Job
Session Dev-validation phase: 2 HIGH + 2 MEDIUM, all resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
## Findings

1. **HIGH — Round 6's effective column-level `UPDATE` privilege gap remains open.** Tests 12h/12i now cover all seven tables for effective `TRUNCATE`, `TRIGGER`, and `REFERENCES`, but they do not cover `UPDATE` inherited through `PUBLIC` or role membership. `has_table_privilege(..., 'UPDATE')` detects only table-level `UPDATE`; Test 12f's `information_schema.role_column_grants` queries see only direct grants. Consequently, an inherited column-level grant on a prohibited column — such as `job_sessions.farm_id`, or any `job_actuals` column — can pass every check. This requires membership-aware `has_column_privilege` checks against each table's intended column allowlist.

2. **MEDIUM — The SQL retry comparison can reject a legitimate concurrent retry after mapped-area drift.** The application intentionally removes server-derived `areaHa`/`harvestedAreaHa` from whole-completion retry comparisons because mapped field area can change between attempts. The RPC instead compares the complete reconciled payload. Two concurrent deliveries of the same id can reconcile on opposite sides of a field-boundary edit; the first inserts, while the second reaches the post-lock retry branch with a different derived area and receives a mismatched-content error. The SQL comparison's payload semantics conflict with the application's documented legitimate-retry semantics.

3. **MEDIUM — The round-6 `field_segments` fix was not validated against the malformed shapes it added.** The trigger logic correctly rejects missing `fieldId`, non-object/JSON-null elements, non-string values, empty strings, and invalid UUID strings. But Test 3f still exercises only a numeric `fieldId`; it never tests the two exact round-6 regressions — missing `fieldId` and a non-object element.

4. **MEDIUM — Phase bookkeeping still contains stale validation totals.** The canonical validation report is internally consistent, and `BUILD_STATE.json` agrees. However, `IMPLEMENTATION_LOG.md` still calls the phase live-validated at 38/38. `BLOCKERS.md` also ends its current phase section repeating an exact check/migration count that had already gone stale again.

No fabricated numeric value reaching a real screen, duplicated domain calculation, cross-farm leakage, or unprotocolled frozen-contract change was found in the full phase diff.

AUDIT_SUMMARY: CRITICAL=0 HIGH=1 MEDIUM=3 LOW=0
GATE: FAIL

---

## Disposition

All four findings evaluated as legitimate and fixed in the same session:

1. **HIGH (effective column-level UPDATE gap)** — fixed: added Test 12j,
   a genuinely generic, per-column, per-table `has_column_privilege`
   check (PUBLIC/membership-aware) across every real column of all seven
   tables, comparing the actual effective UPDATE privilege against this
   schema's own real, documented intent for that exact column (none on
   `job_actuals`/`telemetry_events`; only the seven named columns on
   `job_sessions`; only `state` on `notifications`; every column on the
   three full-CRUD V1 tables). Re-run live: 0 violations found.
2. **MEDIUM (RPC rejects legitimate area-drift retry)** — fixed:
   `20260902140000_fix_confirm_job_session_actual_retry_area_exclusion.sql`
   mirrors `payloadForComparison`'s own exact rule at the RPC level —
   `areaHa`/`harvestedAreaHa` excluded from a `"whole"` completion's
   payload comparison specifically, every other key and completion type
   compared exactly as before. What rounds 5/6 had left as a disclosed,
   accepted trade-off is now genuinely closed, since the fix was cheap
   and directly mirrors already-established application-layer logic (not
   a new calculation).
3. **MEDIUM (field_segments regressions untested)** — fixed: added Test
   3g (missing `fieldId` key) and Test 3h (non-object array element),
   directly exercising the two exact cases round 6's own fix
   (`20260902120000`) added handling for.
4. **MEDIUM (stale bookkeeping totals)** — fixed differently from
   previous rounds' pattern of updating the number yet again:
   `IMPLEMENTATION_LOG.md`'s and `BLOCKERS.md`'s own repeated-number
   paragraphs are rewritten to stop repeating an exact count that keeps
   drifting every round, pointing to the durable, always-current source
   (this validation report / `BUILD_STATE.json`) instead — closing this
   specific class of recurring finding for good, not just this round's
   instance of it.

Re-run live: 54/54 PASS (up from 51).

Quality gate: unaffected (SQL/docs-only round; no TypeScript changed).
