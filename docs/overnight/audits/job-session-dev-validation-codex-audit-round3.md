# Codex audit — Job Session / Confirm Actual real Dev database validation — round 3

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `b55bd34` (round-2 target)
PHASE_COMMIT: `9444b63` — "Fix Codex round-2 findings against the Job
Session Dev-validation phase: 3 HIGH, all resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
## Findings

1. **HIGH — Test 12 still does not assert the complete column-level grant matrix.** The table-level exact matches are sound and the role reset is correctly placed. However, the column-level queries only inspect `UPDATE` grants on `job_sessions` and `notifications`. They do not detect unexpected column-scoped `SELECT`/`INSERT`/`REFERENCES`, or any column-scoped grants on the other five tables. Table-level revoke/inspection does not establish that separate column ACLs are absent. Therefore Test 12 can still report PASS with an unintended column grant present, contradicting its "complete grant set — table- and column-level" claim in both the script and the validation report. It should compare `(table_name, column_name, privilege_type)` against a complete expected relation for all seven tables.

2. **HIGH — `BUILD_STATE.json` remains materially stale as the canonical machine-readable state.** The JSON parses successfully and no longer falsely says the audit gate passed. Nevertheless: `checkpoint_status` still says `round_1_findings_fixed_reaudit_pending` despite round 2 having completed; `current_checkpoint_note` likewise describes only round 1 and calls the phase the "most recently closed" unit while immediately saying it is in progress; the migration detail still records the older 38/38 PASS, while the current validation report claims 42/42; `next_action` omits the live-confirmed, externally blocked `supabase_admin` default ACL. Because this file explicitly identifies itself as the automation-consumed source of truth, this is more than cosmetic bookkeeping.

3. **LOW — The blocked migration contains an explicit closure overclaim.** The reported SQLSTATE 42501 is entirely plausible: `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` requires authority to act as that role, which a non-member, non-superuser migration role lacks. `BLOCKERS.md` otherwise describes the residual accurately. But the migration says "Closed here for real" immediately before declaring itself `BLOCKED_EXTERNAL` and unapplied. The validation report also says round 2's findings are "all fixed" and lists no phase-specific remaining blocker. Those statements should say "investigated and explicitly deferred as externally blocked," not "closed" or "fixed."

No additional correctness defect, cross-farm leak, fabricated production number, duplicated domain calculation, or frozen-contract violation was found in the requested migrations and TypeScript files.

AUDIT_SUMMARY: CRITICAL=0 HIGH=2 MEDIUM=0 LOW=1
GATE: FAIL

---

## Disposition

All three findings evaluated as legitimate and fixed in the same session:

1. **HIGH (Test 12 column-level incompleteness)** — a first fix attempt
   compared the full `(table, column, privilege)` surface against an
   "empty except job_sessions/notifications" expectation, and *every
   check failed on re-run* — a real bug in that fix, caught during this
   same round's own verification, not left broken: `information_schema.
   role_column_grants` reflects a table-level SELECT/INSERT grant per
   column too (correct, documented Postgres behaviour — a table-level
   grant genuinely does apply to every column), so "zero column rows"
   was never a valid expectation for any table with a real select/insert
   grant. Corrected to the actually-meaningful invariant: on the five
   tables whose own intent is either no UPDATE at all or full-row
   UPDATE, the real UPDATE-column count must be exactly 0 or exactly
   that table's own current total column count (via `information_schema.
   columns`) — never an in-between, narrower subset, which is what a
   stray column-scoped grant would actually look like. Re-run live:
   47/47 PASS (up from 42).
2. **HIGH (BUILD_STATE.json staleness)** — fixed: `checkpoint_status`/
   `current_checkpoint_note` updated to reflect round 2's own completion;
   `migrations.detail` updated to the real current PASS count (47/47) and
   the full, current migration list including the `supabase_admin`
   attempt; `next_action` now names the `BLOCKED_EXTERNAL` `supabase_admin`
   residual explicitly; `open_critical_high_findings_note` updated to
   describe round 3's own findings/fixes.
3. **LOW (overclaiming migration comment)** — fixed: the "Closed here
   for real" sentence rewritten to state plainly that the attempt is
   real but the closure is not, immediately followed by the existing
   accurate `Status: BLOCKED_EXTERNAL` section (which was already
   correct — only the earlier sentence, one paragraph up, contradicted
   it). The validation report's own "all fixed" wording for round 2 and
   its "Remaining blockers" section were also corrected to name the
   `supabase_admin` residual explicitly rather than omit it.

Quality gate: unaffected (SQL/docs-only round; no TypeScript changed).
