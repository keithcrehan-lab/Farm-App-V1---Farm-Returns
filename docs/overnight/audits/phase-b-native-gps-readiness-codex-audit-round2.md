# Codex audit — Phase B: native/background GPS readiness — round 2

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `5d2864e` (round-1 target)
PHASE_COMMIT: `ec09c35` — "Fix Codex round-1 findings against Phase B
(native/background GPS readiness): 2 MEDIUM, both resolved"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
1. **MEDIUM — The screen still equates network-interface availability with successful synchronization.** `ActiveJobSessionView.tsx` renders "Synced" whenever `isOnline === true`. On an `online` event, the component sets that state before starting a fire-and-forget flush; it never observes the flush result. Therefore it displays "Synced" while queued items are still flushing and continues displaying it if synchronization fails. The adapter explicitly admits that `navigator.onLine` does not verify API reachability. This is a false capability/data-state claim on a real screen. Use connectivity-specific wording such as "Online," or derive synchronization status from actual outbox state and flush results.

2. **MEDIUM — The corrected architecture document retains the same framework-agnostic reuse overclaim in its React Native section.** `NATIVE_GPS_ARCHITECTURE_DECISION.md` still says to keep `src/domain/`, `src/orchestration/`, and `src/lib/farm-data/` as a shared, "already-plain TypeScript" package, followed by "Reuses unchanged" for all three layers. This directly contradicts the corrected §1 text and comparison table, which accurately acknowledge that orchestration and farm-data contain `server-only`, Supabase-server, Server Action, cookie, and redirect dependencies. The Round 1 documentation finding is consequently only partially fixed.

The `boolean | null` change itself is correct: the initial render says "Checking connection…" and cannot render "Synced" before the provider supplies a value. `null` is confined to display state; flush and action conditions continue calling `NetworkStateProvider.isOnline(): boolean` directly. The Capacitor packaging and WebView IndexedDB durability discussion is now appropriately presented as unresolved and requiring real investigation. I found no duplicated domain calculation, invented numeric value, or cross-farm outbox access in the phase diff.

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=2 LOW=0
GATE: PASS

---

## Disposition

`GATE: PASS` was already reached at this round. Both findings evaluated
as legitimate and fixed:

1. **MEDIUM (Synced conflates connectivity with sync completion)** —
   correct: this component never awaits its own fire-and-forget flush
   calls' results, so "Synced" was never actually earned by anything
   this code observed — only `navigator.onLine`'s own "a network
   interface is up" signal, which `NetworkStateProvider`'s own
   `reachabilityVerified: false` already discloses is not even verified
   reachability, let alone completed sync. Fixed: the online-state label
   changed from "Synced" to "Online" — an honest description of exactly
   what the underlying signal proves, no more. The offline label
   ("Offline — saved on this device, will sync when connected") was
   already accurate and unchanged — that claim is genuinely true by
   construction (the outbox durably persists locally regardless of
   network state).
2. **MEDIUM (Option B section still claimed unchanged reuse for
   orchestration/farm-data)** — correct, and a real gap in round 1's own
   fix: the correction was applied to §1 and Option A but never
   propagated to Option B's own prose, which still described
   `src/orchestration/`/`src/lib/farm-data/` as an "already-plain
   TypeScript" shared package reused unchanged. Fixed: Option B's own
   text now names the identical server-boundary question §1/§3 raise as
   applying equally here, and "reuses unchanged" is scoped to
   `src/domain/` only, matching §1's corrected language exactly.

Re-run: 18/18 `ActiveJobSessionView.test.tsx` tests pass, including a
strengthened test explicitly asserting no "synced" text is ever shown.

Quality gate: re-run for this increment.
