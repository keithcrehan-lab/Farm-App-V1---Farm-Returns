# Codex audit — Job Session / Confirm Actual real Dev database validation — round 5

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `6ab7e65` (round-4 target)
PHASE_COMMIT: `7b4da10` — "Fix Codex round-4 findings against the Job
Session Dev-validation phase: 2 HIGH + 1 MEDIUM + 1 LOW, all resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
## Findings

1. **HIGH — Test 12 audits direct grants, not `authenticated`'s complete effective privileges.** Tests 12a–12g query `information_schema.role_table_grants` and `role_column_grants` with `grantee = 'authenticated'`. This misses privileges inherited through another role or granted to `PUBLIC`. Consequently, a table- or column-scoped privilege could remain effective for `authenticated` while the suite reports the claimed exact match. Use `has_table_privilege`/`has_column_privilege` for every privilege and column, or expand role membership and `PUBLIC` grants explicitly. Test 12g's zero direct `REFERENCES` count is otherwise correct, and the suite now covers all four column-scopeable privilege types.

2. **HIGH — The RPC's idempotency shortcut can return an unrelated Actual without validating any supplied content.** After attempting to lock `p_job_session_id`, `confirm_job_session_actual` selects solely by `p_id` and immediately returns that row. It does not verify `farm_id`, session, revision, activity, completion type, payload, note, or timestamp. A reused client-controlled UUID — or a race after the application's preliminary ID check — can therefore make confirmation appear successful with a different existing row, without confirming the requested session. The RPC must compare all immutable inputs or reject mismatches. Its lock query must also fail explicitly when the requested session was not found.

3. **MEDIUM — `job_sessions.field_segments` ownership validation remains fail-open for malformed elements and lacks a regression test.** The trigger checks ownership only when an element has a string `fieldId`; missing or non-string identifiers are silently accepted. This is the same malformed-reference pattern explicitly fixed for `job_actuals`, yet the validation suite does not exercise `field_segments`. Require an object with a string UUID `fieldId`, failing closed otherwise, and test both malformed and foreign-farm values.

4. **MEDIUM — `BLOCKERS.md` still contradicts the validation report and canonical state.** Its closing status says "four original migrations plus the six added" are applied, cites only `33→38` checks, and claims audit round 1 was clean and the final gate passed. The validation report and `BUILD_STATE.json` instead record 12 applied migrations, 46 checks, and four consecutive failed audit rounds with round 5 pending. Thus the required documentation set is not mutually consistent.

Round 4's specific repairs otherwise hold. No duplicated domain calculation, frozen-contract break, fabricated UI value, or unauthorized cross-owner RLS exposure was identified. The validation transaction ends in `ROLLBACK`, and no persistent fixture write was found.

AUDIT_SUMMARY: CRITICAL=0 HIGH=2 MEDIUM=2 LOW=0
GATE: FAIL

---

## Disposition

All four findings evaluated as legitimate and fixed in the same session
— two of them (findings 2 and 3) real, independent code bugs neither
found nor introduced by any prior round of this audit, caught only by
this round's own genuinely fresh, whole-diff pass:

1. **HIGH (Test 12's direct-grant-only blindness)** — fixed: added Test
   12h, using `has_table_privilege` (which correctly resolves *effective*
   privilege through role membership and `PUBLIC`, unlike the
   `information_schema` views the rest of Test 12 uses for exact-match
   comparison) as a second, independent measurement of the same
   dangerous privileges the original CRITICAL finding was about.
2. **HIGH (RPC returns unvalidated content on id match)** — fixed:
   `20260902110000_fix_confirm_job_session_actual_retry_content_check.sql`
   compares every immutable field of the request against the stored row
   on an id match and raises on mismatch; the parent-session lock is now
   explicit and fail-closed on its own. A deliberate, documented, narrow
   trade-off: the RPC-level comparison is stricter than the application
   layer's own (which excludes server-reconciled `areaHa` from
   comparison) — judged an acceptable, safe failure mode for a scenario
   this narrow, not worth re-deriving the fuller comparison logic in
   SQL. New regression test: Test 8b.
3. **MEDIUM (field_segments fail-open)** — fixed:
   `20260902100000_fix_field_segments_fail_open.sql` mirrors the same
   fail-closed fix already applied to `job_actuals.fieldIds` in the
   prior build phase, onto `job_sessions.field_segments`, which had
   never received it. New regression tests: Test 3e (foreign-farm
   fieldId) and Test 3f (non-string fieldId).
4. **MEDIUM (BLOCKERS.md stale closing summary)** — fixed: the older
   paragraph rewritten to point to the current, durable account (the
   "Job Session / Confirm Actual real Dev database validation" section
   and `docs/validation/job-session-actual-dev-validation.md`) rather
   than repeating its own now-superseded figures.

Re-run live: 50/50 PASS (up from 46).

Quality gate: unaffected (SQL/docs-only round; no TypeScript changed).
