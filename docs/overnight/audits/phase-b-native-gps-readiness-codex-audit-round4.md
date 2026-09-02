# Codex audit — Phase B: native/background GPS readiness — round 4

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `23672ab` (round-2 target — round 3's own base)
PHASE_COMMIT: `9e766b3` — "Fix Codex round-3 finding against Phase B
(native/background GPS readiness): 1 MEDIUM, resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
1. **MEDIUM — The offline banner still makes an unverified durability claim.** `ActiveJobSessionView.tsx` marks tracking active before `enqueueJobSessionGpsObservation` resolves and provides no rejection handler. If IndexedDB is unavailable or the transaction fails, the screen still says "saved on this device, will sync when connected". The mount-time flush fixes stranded successfully queued items, but not the other half of round 3's finding: enqueue failures remain invisible. Track enqueue/persistence failure and show an unavailable/error state, or use wording that does not assert successful storage.

2. **MEDIUM — The GPS contract remains inconsistent with the corrected architecture decision.** `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` says a native adapter implements the interface and "No caller needs to change." The architecture decision correctly acknowledges that `ActiveJobSessionView` directly instantiates both web adapters, so native selection currently requires changing those concrete call sites. Qualify the contract claim as "calling logic need not change, but adapter instantiation does until a platform-selection factory exists."

The round-3 pending-item defect itself is genuinely fixed. Every real-mode mount awaits stale-item reclamation and then flushes whenever currently online, regardless of the reclaimed count. It does not flush before reclaim completes. An online event can cause a redundant concurrent flush, but the outbox's atomic claim transaction makes that safe; an event during reclaim also ensures the later mount flush catches newly reclaimed items.

I found no fabricated numeric values, duplicated domain calculations, or cross-farm processing. Apart from the two concrete consistency/honesty issues above, the persistence and offline-resilience design is sound.

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=2 LOW=0
GATE: PASS

---

## Disposition

`GATE: PASS` was already reached at this round. Both findings evaluated
as legitimate and fixed:

1. **MEDIUM (silent enqueue failures)** — correct: the GPS position
   callback's own `enqueueJobSessionGpsObservation(...).then(...)` had
   no rejection handler, so a real IndexedDB failure (quota exceeded,
   the store genuinely unavailable) vanished silently while the banner
   kept claiming the observation was saved locally. Fixed: added a new
   `storageError` state, set on a genuine enqueue rejection (logged via
   `console.error`, never silently swallowed), which overrides the
   banner with an honest "Unable to save tracking data on this device —
   check device storage" message instead of the normal online/offline
   text. Two new tests exercise the real GPS-observation code path for
   the first time in this test file (previously unreachable — no test
   had ever mocked `navigator.geolocation`), confirming both the failure
   banner and that a successful enqueue shows the normal text.
2. **MEDIUM (contract still overclaimed "no caller needs to change")** —
   correct, the same distinction round 1/round 2 already corrected in
   the architecture decision document but never propagated back to the
   contract document itself. Fixed: `GPS_JOB_SESSION_ACTUAL_CONTRACT.md`
   now states the interface's calling *logic* doesn't change, but
   concrete adapter instantiation does until a platform-selection
   factory exists, pointing to the architecture decision document for
   the full account.

Re-run: 20/20 `ActiveJobSessionView.test.tsx` tests pass (18 prior + 2
new).

Quality gate: re-run for this increment.
