# Codex audit — Phase B: native/background GPS readiness — round 5

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `9e766b3` (round-3 target — round 4's own base)
PHASE_COMMIT: `b99bd08` — "Fix Codex round-4 findings against Phase B
(native/background GPS readiness): 2 MEDIUM, both resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
1. **MEDIUM — A transient storage failure permanently leaves a misleading present-tense error banner.** In `ActiveJobSessionView.tsx`, any rejected GPS enqueue sets `storageError` to `true`, but successful later enqueues never clear it. IndexedDB failures can be transient — for example, a transaction can abort while storage is temporarily constrained and a later transaction can succeed. The screen would then continue saying "Unable to save tracking data on this device" for the rest of the mounted session even though saving has recovered. This also contradicts the comment's unsupported assertion that a broken store cannot recover mid-session. Either clear the state after a subsequent confirmed enqueue, or retain a historically accurate message such as "Some tracking data could not be saved." Add a reject-then-resolve test; the current success test starts from a clean component and cannot detect this defect.

Round 4's original silent-failure problem is otherwise fixed: the rejection is now visible and logged. The geolocation mock genuinely exercises the provider's permission, `watchPosition`, position callback, and enqueue path; its failure assertion targets text unique to the new branch rather than incidental content. The second test is weakly named — it checks only that the error is absent, not that normal online/offline text appears — but that is test coverage associated with the behavioral finding above rather than a separate defect.

The corrected paragraph in `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` is accurate and consistent with `NATIVE_GPS_ARCHITECTURE_DECISION.md`. The fresh whole-phase pass found no fabricated numeric or native-capability claim reaching a real screen, duplicated domain calculation, cross-farm operation, or additional substantive inconsistency.

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=1 LOW=0
GATE: PASS

---

## Disposition

`GATE: PASS` was already reached at this round. The finding was
evaluated as legitimate and fixed using the audit's own suggested
"historically accurate message" approach (not the alternative of
auto-clearing, which risks the opposite dishonesty — implying an
ongoing problem has definitely resolved when this code has no way to
verify that):

**MEDIUM (present-tense banner could go stale after recovery)** —
correct: `storageError` never clears, and the round-4 comment's own
claim that "a genuinely broken local store does not un-break itself
mid-session" was an unverified assertion this round correctly rejected.
Fixed: the banner text changed from the present-tense "Unable to save
tracking data on this device" to the historical-fact phrasing "Some
tracking data could not be saved on this device" — true regardless of
whether storage has since recovered, so `storageError` deliberately
still never clears (a design choice now honestly matched by its own
wording, not a remaining bug). Also strengthened the second test (noted
by the same audit round as weakly named, not a separate defect) to
assert the normal "Online" text positively, not merely the absence of
the error text, and added a genuine reject-then-resolve test proving
the banner survives a later successful enqueue rather than silently
reverting.

Re-run: 21/21 `ActiveJobSessionView.test.tsx` tests pass (20 prior + 1
new).

Quality gate: re-run for this increment.
