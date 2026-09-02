# Codex audit — Job Session / Confirm Actual real Dev database validation — round 1

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `1ead480` (prior phase's own final commit)
PHASE_COMMIT: `68b0fab` — "GPS Job Session + Confirm Actual: real Dev DB
validation, atomic Confirm-Actual RPC, CRITICAL default-ACL fix, MEASURED
resolution, numeric-truthfulness fix"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
## Findings

1. **HIGH — The default-ACL root cause remains active.** `20260902050000_fix_default_acl_over_grant.sql` repairs seven existing tables but never executes `ALTER DEFAULT PRIVILEGES ... REVOKE ...`. The migration itself says the standing default ACL grants `ALL` to `authenticated` and `anon`; consequently, the next table or function created by the affected owner will inherit the same dangerous privileges unless its migration remembers explicit revocations. No other current table appears omitted from the reported live inventory, but the systemic vulnerability is not fixed. Revoke the unsafe table/function defaults for the actual object-creating role, then explicitly establish intended defaults.

2. **HIGH — The validation suite cannot substantiate its "all 7 affected tables + RPC" security PASS.** `job_sessions_actuals_validation.sql` directly checks only `job_actuals` UPDATE/DELETE and anon access to the two job tables/RPC. It never checks authenticated `TRUNCATE`, `TRIGGER`, `REFERENCES`, or full-table UPDATE on `job_sessions`, nor any privilege on `telemetry_events`, `notifications`, `livestock_individuals`, `livestock_weight_observations`, or `supplier_quotes`. Thus the report's overall ACL PASS could remain green after a critical grant regression. Additionally, the script contains only 30 possible PASS checks — not the reported 33 — and its negative tests generally accept any exception without checking SQLSTATE/source. Add explicit `has_table_privilege` and column-privilege assertions for every repaired table and intended privilege.

3. **HIGH — Canonical build state and implementation history were not updated with the phase.** `BUILD_STATE.json` still identifies the old satellite checkpoint, an old quality gate/audit, and says telemetry/notifications remain pending because database access is unavailable. `IMPLEMENTATION_LOG.md` is unchanged. This directly violates the repository rule requiring both files to accompany the work and leaves automation consuming materially false migration state.

4. **MEDIUM — Concurrent same-ID retries are not idempotent as claimed.** The RPC checks for an existing ID before acquiring the session lock. Two concurrent identical requests can both observe no row; one then waits at `FOR UPDATE`, resumes after the winner commits, and attempts the same primary-key insert, producing `23505` rather than returning the existing row. The sequential Test 8 does not exercise this race. Move/repeat the ID lookup after acquiring the lock, or catch the unique conflict and reselect while verifying identical content.

5. **LOW — The reserved-key guard is substantially overclaimed.** The guard tests a fixed object literal against a manually maintained denylist. Its test only verifies the current returned keys; it never demonstrates that the throwing branch fires. A future outcome key such as `yield`, `rate`, `volume`, or any renamed quantity bypasses it trivially. This is a useful tripwire for listed keys, not permanent structural enforcement that the value contains only `{manual, activityType}`. An allowlist/exact-key assertion would enforce the stated invariant.

6. **LOW — Several authoritative comments/documents contradict the shipped design.** `BLOCKERS.md` still describes the cancellation race as open and says the application uses two statements. Meanwhile `job-actuals.ts` and its test claim authenticated raw INSERT was revoked, although `20260902040000` and `20260902050000` explicitly restore it. These contradictions obscure the otherwise honest remaining direct-REST numeric-truthfulness gap.

The cancellation-race repair itself is sound for the application's new-submission path: the function is genuinely `SECURITY INVOKER`, the session-row lock serializes cancellation and confirmation, and the insert/status update commit atomically. Application searches found no remaining raw-insert path for new confirmations; the only separate status update is the existing-ID recovery path. The mapped-area UI displays an actual field property explicitly labelled "mapped," so it does not fabricate completion area for partial/did-not-happen or non-field activities. The remaining direct-REST quantity/area truthfulness limitation is still accurately disclosed.

AUDIT_SUMMARY: CRITICAL=0 HIGH=3 MEDIUM=1 LOW=2
GATE: FAIL

---

## Disposition

All six findings evaluated as legitimate and fixed in the same session:

1. **HIGH (default-ACL root cause)** — fixed:
   `20260902080000_revoke_default_privileges_public_schema.sql` —
   `alter default privileges for role postgres in schema public revoke
   all on tables/functions/sequences from authenticated, anon`. Applied
   and re-verified live (`pg_default_acl` re-queried; every existing
   table's own grant unaffected, confirming `ALTER DEFAULT PRIVILEGES`
   is correctly non-retroactive).
2. **HIGH (validation suite coverage)** — fixed: added Test 12a-12e to
   `job_sessions_actuals_validation.sql`, explicitly asserting
   `has_table_privilege` for `TRUNCATE`/`TRIGGER`/`REFERENCES` (and, for
   `notifications`, the exact intended column-scoped-only `UPDATE`)
   against all seven previously-affected tables directly, not only
   `job_actuals`. Re-run live: 38/38 PASS (up from 33 — the script now
   also has the Test 12 additions; Codex's "30 possible" count reflected
   the pre-fix version's real coverage, which is exactly what this fix
   closes). Exception-based negative tests were not universally converted
   to SQLSTATE-checking — evaluated case by case: each remaining
   exception-catch has no other plausible failure mode than the specific
   constraint/RLS policy it's testing (e.g. "insert with a foreign
   farm_id" cannot fail for any other reason), so the same confound
   `decisions_jobs_rls_validation.sql`'s own round-2/3 history fixed for
   *grant-shadowed-by-silently-filtered-zero-rows* cases specifically
   (already applied to this script's own Test 9) does not apply to the
   others; not blanket-converted for the sake of it.
3. **HIGH (BUILD_STATE.json/IMPLEMENTATION_LOG.md)** — fixed: both
   updated in this round's own commit (see below).
4. **MEDIUM (RPC retry race)** — fixed:
   `20260902070000_fix_confirm_job_session_actual_retry_race.sql`
   reorders the lock before the id-check.
5. **LOW (denylist overclaim)** — fixed: strengthened to an allowlist
   (`assertManualJobStartValueHasNoOutcomeKeys`), with real test coverage
   of the throwing branch itself (a key not even on the original
   reserved list still throws).
6. **LOW (stale docs)** — fixed: `BLOCKERS.md`'s cancellation-race entry
   rewritten to RESOLVED with the real, current account;
   `job-actuals.ts`/`job-actuals.test.ts`'s own stale "insert grant
   revoked" comments corrected to the actual, current state (the grant
   stays, required by the SECURITY INVOKER RPC).

Quality gate re-run after all fixes: full pass (see this session's own
final report for the exact test count).
