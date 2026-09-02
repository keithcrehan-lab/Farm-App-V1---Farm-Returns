# Codex audit — Job Session / Confirm Actual real Dev database validation — round 8

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `2080e75` (round-7 target)
PHASE_COMMIT: `c824bba` — "Fix Codex round-7 findings against the Job
Session Dev-validation phase: 1 HIGH + 3 MEDIUM, all resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
## Findings

1. **MEDIUM — Migration #17's area-drift retry behavior is not actually exercised by the live validation suite.** The SQL logic correctly strips `areaHa` and `harvestedAreaHa` for `"whole"` retries and otherwise matches `payloadForComparison`. However, Tests 8/8b only cover an identical retry and a clearly different non-area payload. No test retries the same ID with only a changed derived-area key, nor confirms that another changed key still fails. Thus the reported 54/54 live validation does not validate the behavior introduced by `20260902140000`.

2. **LOW — `BUILD_STATE.json` contains a self-contradictory bookkeeping claim.** Its migration detail explicitly repeats "17 real migrations" and "54/54 PASS," then says readers should use the validation report instead of "this field repeating a number" and claims the field now avoids that practice. The current values are consistent with the report, but the stated anti-staleness fix is factually inaccurate and remains vulnerable to the same future drift.

Round 7's four findings are otherwise genuinely fixed:

- Test 12j covers every real column of all seven filtered tables with the intended UPDATE mapping. Its `ELSE NULL` is unreachable because every table admitted by the `WHERE` clause has a preceding branch.
- JSONB key removal is safe for absent keys. Null input fails comparison against the non-null stored payload; new inserts are independently constrained non-null. Its whole/non-whole behavior matches the application comparison.
- Tests 3g and 3h correctly exercise missing `fieldId` and a non-object array element.
- The revised `IMPLEMENTATION_LOG.md` and `BLOCKERS.md` paragraphs remove their duplicated totals while retaining useful pointers and validation context.
- No new fabricated screen value, duplicated domain calculation, frozen-contract violation, or cross-farm leakage was found.

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=1 LOW=1
GATE: PASS

---

## Disposition

`GATE: PASS` was already reached at this round (CRITICAL=0, HIGH=0). Both
remaining findings were fixed as a courtesy per the phase's own
instruction that any valid Critical/High/Medium finding gets fixed before
the loop closes, not just anything blocking the gate itself:

1. **MEDIUM (area-drift retry behaviour unexercised)** — fixed: added
   Test 8c and Test 8d to
   `supabase/validation/job_sessions_actuals_validation.sql`, using a
   fresh `session_a3`/`actual_a3` fixture (fertiliser_spreading, `"whole"`
   completion, `field_a_id`). Test 8c retries the same client-generated
   id with *only* `areaHa` changed (0.62 → 0.71, simulating a genuine
   mapped-area edit between attempts) and asserts the RPC still succeeds,
   returning the original row unchanged — proving migration #17's own
   exclusion logic is actually exercised, not merely present in the SQL.
   Test 8d retries the same id with a genuinely different non-area field
   (`product`) changed and asserts the RPC still rejects it — proving the
   exclusion is narrowly scoped to the two derived-area keys, not a
   blanket bypass of the whole content check. Re-run live: 56/56 PASS (up
   from 54), with both new checks confirmed passing by name in the
   output.
2. **LOW (BUILD_STATE.json self-contradiction)** — fixed: rewrote
   `migrations.detail` to genuinely stop stating an exact migration/check
   count (rather than stating one while claiming not to), pointing to
   `docs/validation/job-session-actual-dev-validation.md` for the current
   authoritative numbers, and explicitly noting that round 8 caught the
   prior version's exact self-contradiction so the same mistake isn't
   silently repeated.

Re-run live: 56/56 PASS (up from 54).

Quality gate: re-run for this increment (SQL/docs-only; no TypeScript
changed).
