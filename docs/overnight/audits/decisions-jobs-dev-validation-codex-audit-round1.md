# Codex audit — Phase A: decisions/jobs real Dev database validation — round 1

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `3ef77d9` (last verified baseline, prior phase's closure)
PHASE_COMMIT: `12cc478` — "Phase A: decisions/jobs real Dev database
validation — all three migrations promoted to VALIDATED_DEV"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
- HIGH — `VALIDATED_DEV` is overclaimed. The client-access migration says "Every invariant the checklist below names was confirmed," including rejection of malformed `estimate_snapshot` values and duplicate `jobs.decision_id` values. The validator contains no negative test for either constraint. It only mentions `jobs_decision_id_unique` while explaining why Tests 9a–9d use fresh decisions. The comment also incorrectly calls role/JWT impersonation "two real authenticated sessions"; the script uses one privileged transaction with `SET LOCAL ROLE`. The tested RLS and weight-observation behavior supports a narrower validation claim, but not the migration's stated complete checklist.

- MEDIUM — The recorded check total is false and internally contradictory. The SQL has exactly 25 possible `PASS — Test` result branches, matching the foundation and client-access migration comments. The report nevertheless claims 29/29, as do the weight-reference migration, `BLOCKERS.md`, and `BUILD_STATE.json`. The checklist itself expands to 25 checks; adding Tests 9a–9d appears to have been counted twice.

- MEDIUM — The machine-readable build state contradicts itself and the completed validation. `current_checkpoint` still names the prior job-session phase while `checkpoint_status` names the decisions/jobs phase. More seriously, `migrations.status` says the decisions/jobs migrations are already validated, but `next_action` still instructs automation/users to run this validator and promote them afterward.

The specifically requested mechanics otherwise check out: Farm B remains constrained to a different owner in both selection paths; Tests 9a–9d use distinct generated decision UUIDs; fixtures are clearly tagged, transactional validation data and do not reach a real screen; and `reset role`, final `SELECT`, then `ROLLBACK` are correctly ordered. Only migration comments changed—no already-applied migration SQL body was modified. The untracked `AUDIT_PROMPT.md` contains only this audit prompt.

AUDIT_SUMMARY: CRITICAL=0 HIGH=1 MEDIUM=2 LOW=0
GATE: FAIL

---

## Disposition

All three findings evaluated as legitimate and fixed in the same session:

1. **HIGH (SHAPE checklist overclaim)** — genuinely correct: every
   existing `decisions` insert in the validator used `outcome:
   'dismissed'`, which `decisions_estimate_snapshot_ok_shape` exempts
   entirely, so neither that constraint nor `jobs_decision_id_unique`
   had ever been exercised despite the migration's checklist naming both
   as confirmed. Fixed with three new tests: Test 10a (an accepted
   decision with a missing `estimate_snapshot.value` is rejected), Test
   10b (an accepted decision with an invalid `evidenceState` is
   rejected), Test 10c (the legitimate accepted-decision shape inserts
   successfully — positive control), and Test 11 (a second job
   referencing an already-referenced `decision_id` is rejected). Each
   uses `outcome: 'accepted'` specifically to engage the constraint the
   old tests never did.
2. **MEDIUM (check count arithmetically wrong)** — correct: the real
   count at the time of that commit was 25, not 29 (an off-by-four
   miscount when tallying tests across the setup notices). Re-running
   the validator after fixing finding 1 above (which added exactly four
   new PASS lines: 10a, 10b, 10c, 11) makes 29 the genuinely correct,
   freshly-counted number — confirmed live: 29/29 PASS, 0 FAIL, 0 SKIP.
   The two migration files that had said "25/25" (the number that was
   actually correct before this round's fix) are updated to "29/29" to
   match the new, larger, still-genuinely-counted total.
3. **MEDIUM (BUILD_STATE.json self-contradiction)** — correct:
   `current_checkpoint` still said `job-session-confirm-actual-dev-validation`
   and `next_action` still told a reader to run this exact validator and
   promote status, both stale relative to `checkpoint_status` and the
   real, already-complete work. Fixed: `current_checkpoint` renamed to
   `decisions-jobs-dev-validation`, `next_action` rewritten to state both
   this phase's and the prior phase's closure plainly and name the real
   remaining follow-ups (`supabase_admin` BLOCKED_EXTERNAL, CDSE
   credentials, visual reference, p-build-up-eligibility decision) plus
   the unattended session's own next phases (B/C/D).

Re-run live: 29/29 PASS (a genuinely larger, correctly-counted total,
not merely a corrected label).

Quality gate: re-run for this increment (SQL/docs-only round; no
TypeScript changed).
