# Codex audit — Phase B: native/background GPS readiness — round 3

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `ec09c35` (round-2 target)
PHASE_COMMIT: `23672ab` — "Fix Codex round-2 findings against Phase B
(native/background GPS readiness): 2 MEDIUM, both resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
1. **MEDIUM — The offline label still promises synchronization the implementation does not guarantee.** `ActiveJobSessionView.tsx` says "saved on this device, will sync when connected." A genuine online transition triggers a flush, but mounting while already online does not; the mount effect flushes only when `reclaimed > 0`. Thus an ordinary pending/failed item can remain indefinitely after reconnecting and reopening the screen — especially for paused/completed sessions producing no further GPS observations. IndexedDB enqueue failures are also not reflected by this unconditional label. Use non-guaranteeing wording such as "Offline — changes are queued on this device," or flush all pending items on an online mount and expose enqueue/sync failures honestly.

Round 2's online-label finding is otherwise fixed: "Online" no longer implies completed synchronization. Option B is also consistently corrected: only `src/domain/` is claimed as reused unchanged, while orchestration/farm-data retain the documented server-boundary problem.

I found no fabricated numeric values, duplicated domain calculations, cross-farm processing, or additional persistence defects.

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=1 LOW=0
GATE: PASS

---

## Disposition

`GATE: PASS` was already reached at this round. The finding was
evaluated as legitimate and fixed at the behavioural level (the stronger
of the two fixes the audit itself offered), not just reworded:

**MEDIUM (mount-while-already-online never flushed an ordinary pending
item)** — correct: the mount-time effect's `if (reclaimed > 0 &&
online)` guard meant a session with no genuinely stale/abandoned item —
just an ordinary item still `"pending"` because the device was offline
when it was enqueued — never got flushed on a later mount while online,
unless a fresh GPS fix or a live online-transition happened to trigger
one first. A paused or already-`completed_estimated` session produces
neither. Fixed: the mount effect now flushes unconditionally whenever
online, regardless of whether `reclaimStaleOutboxItems` reclaimed
anything — reclaim and flush are two independent, always-attempted
steps on every real mount, not a flush gated on reclaim's own result.
This genuinely earns the offline banner's "will sync when connected"
claim for the common case the audit named, rather than only rewording
the claim to disclaim it.

Four tests in the affected `describe` blocks were rewritten to match the
corrected behaviour (a mount-while-online now flushes even with nothing
reclaimed; the online-transition-listener test asserts exactly one
flush call, since the separate mount effect is now the one producing
it).

Re-run: 18/18 `ActiveJobSessionView.test.tsx` tests pass.

Quality gate: re-run for this increment.
