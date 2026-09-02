# Codex audit — Phase A: decisions/jobs real Dev database validation — round 2

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `12cc478` (round-1 target)
PHASE_COMMIT: `2874599` — "Fix Codex round-1 findings against Phase A
(decisions/jobs Dev-validation): 1 HIGH + 2 MEDIUM, all resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
- HIGH — `BUILD_STATE.json` remains operationally contradictory. `checkpoint_status` says round-2 re-audit is pending, while `next_action` declares Phase A closed and directs work toward Phase B. The adjacent checkpoint note also incorrectly says the Codex audit has "not yet run," despite `last_codex_audit` recording round 1. Because this file drives automation, it can advance work before the mandatory audit loop passes.

- MEDIUM — The client-access migration still falsely says validation used "two real authenticated sessions." The validator uses one privileged database session/transaction and switches `request.jwt.claims` between two identities. That is a valid RLS test, but it is not two sessions — and this exact round-1 sub-finding was left unchanged.

The substantive constraint fixes are genuine: Tests 10a–10c use `outcome='accepted'`, Test 11 exercises the unique decision reference, independently generated UUID collisions would abort rather than silently produce a pass, and the validator contains 29 distinct test labels. The migration/report count claims agree at 29/29. The sole untracked file is the supplied audit prompt.

AUDIT_SUMMARY: CRITICAL=0 HIGH=1 MEDIUM=1 LOW=0
GATE: FAIL

---

## Disposition

Both findings evaluated as legitimate and fixed in the same session:

1. **HIGH (BUILD_STATE.json self-contradiction)** — genuinely correct
   and self-inflicted: the round-1 fix commit updated `next_action` to
   declare Phase A "CLOSED" and point toward Phase B/C/D *before* a
   confirming re-audit had actually run — exactly the premature-closure
   pattern this repository's own gating rule exists to prevent, and
   `current_checkpoint_note` still said "Codex audit not yet run"
   despite `last_codex_audit` already recording round 1's real FAIL.
   Fixed: both fields rewritten to state plainly that Phase A is NOT yet
   closed, round 1's findings were fixed, and a round-2 re-audit is
   pending/in-progress — while still being clear that the underlying
   live-validation result itself (29/29 PASS) is real and unaffected by
   the audit loop's own bookkeeping.
2. **MEDIUM (still "two real authenticated sessions")** — correct: round
   1's disposition addressed only the *substantive* untested-invariant
   findings and missed this exact wording sub-point despite the round-1
   audit naming it explicitly. Fixed: the migration's status comment now
   describes the technique accurately — one privileged session/
   transaction simulating two real authenticated identities via `SET
   LOCAL ROLE` + `request.jwt.claims` impersonation (Supabase's own
   documented RLS-testing technique) — while still being clear that the
   role/claims fidelity, not the session count, is what makes this the
   complete real threat model.

No SQL/RPC logic changed this round (comment and BUILD_STATE.json
wording only); the validator's own 29/29 live result from round 1 is
unaffected and not re-run.

Quality gate: re-run for this increment (docs/comment-only round; no
TypeScript changed).
