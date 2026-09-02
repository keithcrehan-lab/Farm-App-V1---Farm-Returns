# Codex audit — Phase B: native/background GPS readiness — round 1

Command: `codex exec --sandbox read-only` from a detached worktree at PHASE_COMMIT.
BASE_COMMIT: `02c8b77` (last verified baseline, closure of Phase A)
PHASE_COMMIT: `5d2864e` — "Phase B: native/background GPS readiness —
NetworkStateProvider capability boundary, offline resilience fixes,
architecture decision document"

Full raw transcript (Codex's own file reads, in full) is not included
here — trimmed to Codex's final report only, per the overnight-run
instruction.

---

codex
1. **MEDIUM — Offline users initially receive a false "Synced" status.** `ActiveJobSessionView.tsx:120` initializes `isOnline` to `true`, and the screen renders "Synced" at line 314. `useEffect` runs after the initial commit and normally after the browser has painted, so the incorrect state is observable on a genuinely offline device; server-rendered HTML will also contain "Synced." The test at `ActiveJobSessionView.test.tsx:178` cannot catch this because Testing Library's `render` flushes effects inside `act`. Use an honest unknown/checking initial state, or derive the initial value without reading the ref during render.

2. **MEDIUM — The native architecture recommendation materially overstates how unchanged the current application can be wrapped.** `NATIVE_GPS_ARCHITECTURE_DECISION.md:32` says `src/lib/farm-data` and orchestration are framework-agnostic, but many modules import `server-only` and `@/lib/supabase/server`; orchestration also contains server-only modules. Lines 102–121 consequently cannot promise a static/hybrid export, "100%" unchanged reuse, or a bundled Next server as WebView content. This repo uses Server Actions, cookies, redirects, dynamic routes, and server-side persistence; Next.js explicitly excludes Server Actions and other server features from static exports. The claimed "zero caller changes" is also contradicted by `ActiveJobSessionView.tsx:107` and line 114, which instantiate the web adapters directly. The IndexedDB statement does acknowledge SQLite as an alternative, but it should distinguish API availability from the durability guarantee required for irreplaceable outbox data and require platform validation before declaring no migration necessary.

The repository search otherwise confirms there is no PWA manifest, service-worker registration, Capacitor configuration, Xcode project, or Android manifest. The web location adapter consistently reports `backgroundTrackingSupported: false`.

The sign-out ordering is correct: client cleanup is awaited before the server action redirects, and both flush and prune failures are caught. `pruneSynced` only selects items whose stored state is exactly "synced". Concurrent flushes are locally safe because `tryClaimItem` atomically moves only pending/failed items to syncing; stale reclamation can still cause at-least-once remote delivery, as documented, but claim tokens protect local completion state. The mount test's name says "once" without asserting call count, though repeated effect execution would remain safe.

The changed contract text is descriptive and does not alter a frozen exported contract. I found no duplicated domain calculation, fabricated production number, or browser claim of native background support.

AUDIT_SUMMARY: CRITICAL=0 HIGH=0 MEDIUM=2 LOW=0
GATE: PASS

---

## Disposition

`GATE: PASS` was already reached at this round (CRITICAL=0, HIGH=0).
Both findings were fixed as a courtesy per this phase's own instruction
that any valid Critical/High/Medium finding gets fixed before the loop
closes:

1. **MEDIUM (false "Synced" status while genuinely offline)** — fixed:
   `isOnline` state changed from `boolean` (initialised `true`) to
   `boolean | null` (initialised `null`), with `null` rendering an
   honest "Checking connection…" instead of ever claiming a sync status
   this component has not yet determined. The mount effect corrects it
   to the real value immediately.
2. **MEDIUM (architecture document overstated unchanged reuse)** —
   fixed: corrected the "framework-agnostic" claim to apply only to
   `src/domain/`, not uniformly to `src/orchestration/`/
   `src/lib/farm-data/` (both contain real `"server-only"`/Server Action
   code, confirmed by a real grep); corrected "zero caller changes" to
   note the concrete adapter instantiation call sites still need
   updating; rewrote Option A's packaging section to treat "a live
   reachable server vs. a genuine static bundle" as real, unresolved
   investigation rather than a solved detail (Next's own static-export
   docs explicitly exclude Server Actions); softened the IndexedDB-in-
   WebView durability claim to "likely, unverified on real devices"
   rather than an assumed guarantee; updated the comparison table and
   final recommendation's confidence level to match.

Also tightened the mount-time reclaim test (noted, not a formal finding)
to assert `toHaveBeenCalledTimes(1)`, matching its own "once" name.

Re-run: 18/18 `ActiveJobSessionView.test.tsx` tests pass.

Quality gate: re-run for this increment.
