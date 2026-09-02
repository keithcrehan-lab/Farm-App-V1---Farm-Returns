# Codex audit — Job Session / Confirm Actual real Dev database validation — round 4

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `9444b63` (round-3 target)
PHASE_COMMIT: `6ab7e65` — "Fix Codex round-3 findings against the Job
Session Dev-validation phase: 2 HIGH + 1 LOW, all resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
## Findings

1. **HIGH — Test 12 still misses column-scoped `REFERENCES` grants.** Tests 12f1–12f5 correctly detect forbidden or partial `UPDATE` access. Column-scoped `SELECT`/`INSERT` grants add no effective privilege because all seven tables already grant those privileges table-wide; `DELETE`, `TRUNCATE`, and `TRIGGER` cannot be column-scoped. But PostgreSQL does support column-scoped `REFERENCES`, which none of Tests 12b2, 12d2, or 12f1–12f5 inspect. A stray `GRANT REFERENCES (farm_id) ... TO authenticated` would therefore pass the claimed complete grant audit. This directly leaves round 3's requested complete `(table, column, privilege)` coverage unfinished.

2. **HIGH — `BUILD_STATE.json` is still internally stale.** The file is valid JSON, and `last_codex_audit`, `migrations.detail`, `next_action`, and `open_critical_high_findings_note` now describe round 3. However, `checkpoint_status` remains `round_2_findings_fixed_reaudit_pending`, while `current_checkpoint_note` also stops at round 2. Both contradict the same file's round-3 audit record and round-4-pending state. This is the canonical automation-consumed state file, so round 3's state-consistency finding is not genuinely fixed.

3. **MEDIUM — The deliberately unapplied migration blocks the normal migration chain.** Migration `20260902090000` is retained in the ordered migrations directory despite being known to fail under the project's migration role. Consequently, an ordinary future `supabase db push` will encounter this pending migration before any later migration and fail again, preventing subsequent migrations from being applied until external access changes or the file is moved/otherwise handled. The residual security issue is accurately disclosed, but the operational consequence of leaving the failing SQL in the active chain is not.

4. **LOW — The validation report's applied-migration total remains wrong.** Its table enumerates twelve applied migrations and one rejected migration, and explicitly says migrations through number 12 match remotely. The summary nevertheless says `PASS — 10/10`.

The `supabase_admin` residual itself is now described honestly in the migration, validation report, and blocker documentation. No additional cross-farm leak, fabricated screen value, duplicated domain calculation, frozen-contract violation, or material accessibility defect was found in the reviewed TypeScript/SQL.

AUDIT_SUMMARY: CRITICAL=0 HIGH=2 MEDIUM=1 LOW=1
GATE: FAIL

---

## Disposition

All four findings evaluated as legitimate and fixed in the same session:

1. **HIGH (column-scoped REFERENCES uncovered)** — fixed: added Test 12g,
   asserting a real, live count of zero column-scoped `REFERENCES` grants
   across all seven tables (none of the seven has any table-level
   `REFERENCES` either, per 12a-12e3's own exact-match checks, so zero
   is the correct expectation at the column level too). Re-run live:
   46/46 PASS.
2. **HIGH (BUILD_STATE.json checkpoint_status/current_checkpoint_note
   stale)** — fixed: both updated to reflect round 3's own completion
   and the real, current in-progress state.
3. **MEDIUM (blocking migration chain)** — investigated with a real
   live test, not assumed: `supabase migration repair --status
   reverted` was tried first and confirmed NOT to change `db push`'s own
   behaviour (`migration list` still shows no remote entry, `db push
   --dry-run` still lists it as pending). The migration file was removed
   from `supabase/migrations/` entirely — its exact SQL preserved as a
   code block in `BLOCKERS.md` for a future session with genuine
   `supabase_admin`-level access to apply as a fresh migration.
   `db push --dry-run` re-run and confirmed `upToDate: true`.
4. **LOW (stale "10/10" migration count)** — fixed: the validation
   report's own migration table, summary line, and PASS/FAIL table
   updated to the real, current count (12 applied, 1 genuinely
   `BLOCKED_EXTERNAL` and no longer a migration file).

Quality gate: unaffected (SQL/docs-only round; no TypeScript changed).
