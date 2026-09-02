# Codex audit — Phase A: decisions/jobs real Dev database validation — round 3

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `2874599` (round-2 target)
PHASE_COMMIT: `9ac1541` — "Fix Codex round-2 findings against Phase A
(decisions/jobs Dev-validation): 1 HIGH + 1 MEDIUM, both resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
- HIGH — `BUILD_STATE.json` remains internally inconsistent. `last_codex_audit` records round 2's completed FAIL and explicitly says round 3 is pending, but `current_checkpoint_note` says the "round 2 re-audit result" is pending and `next_action` says round 2 is still in progress. Since this file drives automation, the pending round must consistently be identified as round 3. The phase is correctly marked not closed, but round 2's bookkeeping finding is therefore not fully fixed.

- MEDIUM — `20260829010000_decisions_jobs_client_access.sql` now accurately admits that validation used one privileged transaction with `SET LOCAL ROLE` and synthetic `request.jwt.claims`, but still overclaims that this proves the "complete real threat model, not a proxy." It directly tests database grants and RLS under the intended roles and claims; it does not test real JWT issuance/verification, PostgREST/API behavior, or two authenticated client sessions. The narrower wording should describe it as complete database-layer RLS/grant coverage.

The fresh whole-phase pass found no substantive SQL weakening, cross-farm leakage, fabricated production value, or missing migration-invariant coverage. The validator has 29 actual PASS/FAIL test-result branches, and Tests 9a–9d, 10a–10c, and 11 cover the previously missing constraints and positive controls. `BLOCKERS.md`, the validation report, and all three migrations agree on the live 29/29 `VALIDATED_DEV` result.

AUDIT_SUMMARY: CRITICAL=0 HIGH=1 MEDIUM=1 LOW=0
GATE: FAIL

---

## Disposition

Both findings evaluated as legitimate and fixed in the same session:

1. **HIGH (round-number labeling drift)** — genuinely correct: round
   2's own fix commit correctly updated `checkpoint_status` to
   `..._round2_findings_fixed_reaudit_pending` (accurately meaning
   "round 2's findings are fixed, round 3's audit is pending"), but
   `current_checkpoint_note` and `next_action` were left saying "round 2
   re-audit ... pending" / "a round-2 confirming re-audit is in
   progress" — an off-by-one that, read literally, describes round 2's
   own (already-completed) audit as still outstanding. Fixed: both
   fields rewritten to name round 1 and round 2's real findings and
   state plainly that round 3 is the pending one.
2. **MEDIUM (still overclaiming "complete real threat model")** —
   correct, and a legitimate further narrowing of round 2's own fix:
   `SET LOCAL ROLE` + `request.jwt.claims` impersonation proves the
   complete *database-layer* access-control surface (every RLS policy
   and table grant behaves exactly as claimed under the real role/claims
   shape a PostgREST request would carry) — it does not itself exercise
   real JWT issuance/verification, PostgREST's own request path, or two
   genuinely separate client connections, none of which this schema's
   own migrations have any reach into or reason to re-validate. Fixed:
   wording narrowed to state precisely what layer is proven, crediting
   round 3's own further refinement of round 2's already-partial fix.

No SQL/RPC logic changed this round (comment/BUILD_STATE.json wording
only); the validator's own 29/29 live result is unaffected and not
re-run.

Quality gate: re-run for this increment (docs/comment-only round; no
TypeScript changed).
