# Codex audit — Job Session / Confirm Actual real Dev database validation — round 2

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `68b0fab` (round-1 target)
PHASE_COMMIT: `b55bd34` — "Fix Codex round-1 findings against the Job
Session Dev-validation phase: 3 HIGH + 1 MEDIUM + 2 LOW, all resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
## Findings

1. **HIGH — The default-ACL root cause remains open for `supabase_admin`.** The new migration only revokes defaults for `postgres` (`20260902080000_revoke_default_privileges_public_schema.sql`). Yet the repository records a second `public` default ACL owned by `supabase_admin` that still broadly grants privileges to `authenticated` and `anon` (`BLOCKERS.md`). Current table ownership by `postgres` does not establish that `supabase_admin` cannot create future tables/functions; indeed, its role-specific default ACL is relevant precisely when it does. Calling this residual "no live consequence today" does not satisfy round 1's requirement to close unsafe defaults for every possible object-creating role. Revoke the unsafe `supabase_admin` defaults too, or provide live evidence that it lacks `CREATE` on `public` and cannot create objects there.

2. **HIGH — Tests 12a–12e still do not validate the repaired grant matrix correctly or completely.** Test 12a checks only `TRUNCATE`, `TRIGGER`, and `REFERENCES` on `job_sessions`; it omits the unintended `DELETE` and blanket table-level `UPDATE` privileges explicitly identified in round 1. Tests 12a–12e also only check absence of excess privileges, not presence of intended `SELECT`/`INSERT`, column-scoped updates, or intended V1 CRUD. Consequently, the suite can report PASS if required grants are accidentally removed, and can still miss a blanket `DELETE`/`UPDATE` regression on `job_sessions`. The comment claiming it checks the "exact real grants" is therefore false.

3. **HIGH — `BUILD_STATE.json` remains materially stale and internally contradictory.** Although valid JSON, `last_codex_audit` still points to the unrelated September 1 Vertical H audit, not this phase's round-1 FAIL. Meanwhile `checkpoint_status` correctly says re-audit is pending, but `open_critical_high_findings_note` says the gate is already met. This does not fix round 1's canonical-state finding and can mislead automation consuming this file.

The retry-lock reorder closes the same-ID race without harming the normal existing-row case; the allowlist is wired in and its throwing branch is tested; and the corrected `BLOCKERS.md`/`job-actuals` comments otherwise match the current raw-INSERT/`SECURITY INVOKER` design. No new fabricated real-screen number, duplicated domain calculation, frozen-contract break, cross-farm leak, or destructive migration was found in the reviewed scope.

AUDIT_SUMMARY: CRITICAL=0 HIGH=3 MEDIUM=0 LOW=0
GATE: FAIL

---

## Disposition

All three findings evaluated as legitimate and fixed in the same session:

1. **HIGH (`supabase_admin` default ACL)** — investigated with real live
   evidence rather than argued around: `has_schema_privilege('supabase_admin',
   'public', 'CREATE')` confirmed `true` live. A matching migration
   (`20260902090000_revoke_default_privileges_supabase_admin_public_schema.sql`)
   was written and actually run against `Farm Return V1 Dev` — and
   rejected: `ERROR: permission denied to change default privileges
   (SQLSTATE 42501)`. The `postgres` role this project's migrations run
   as does not have permission to alter a *different* role's own
   defaults — a genuine Supabase platform role-hierarchy boundary, not a
   gap in this session's own effort. Documented honestly as
   `BLOCKED_EXTERNAL` (not "out of scope by choice", which round 2
   correctly rejected) in `BLOCKERS.md` and the migration's own header
   comment, with the real, live-confirmed scope of the residual risk (no
   object in this schema has ever actually been created as
   `supabase_admin`).
2. **HIGH (Test 12 coverage/correctness)** — fixed: rewrote Test 12
   entirely to assert each table's real, *complete* grant set (via
   `information_schema.role_table_grants`/`role_column_grants`,
   `string_agg`'d and compared against the exact expected string) rather
   than checking absence of a few named excess privileges. This both
   catches a blanket DELETE/UPDATE regression (round 2's own example)
   and a regression that accidentally *removes* an intended grant (which
   the old absence-only version could never catch). Found and fixed a
   real bug in the rewrite itself during verification: the query
   initially ran while the script was still impersonating `anon`
   (`information_schema` views only show grants the *current* role is
   authorised to see), producing false "<none>" results for every check
   — fixed with an explicit `reset role` before Test 12. Re-run live:
   42/42 PASS.
3. **HIGH (BUILD_STATE.json staleness/contradiction)** — fixed:
   `last_codex_audit` now points to this phase's own most recent audit
   round with an honest `fail_reaudit_in_progress` result (not a false
   "pass"); `open_critical_high_findings_note` no longer claims the gate
   is met while `checkpoint_status` says re-audit is pending — both now
   consistently describe the real, current, in-progress state.

Quality gate: unaffected (SQL/docs-only round; no TypeScript changed).
