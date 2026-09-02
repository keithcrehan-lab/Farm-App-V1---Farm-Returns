# Native / background GPS architecture decision

Phase B (native/background GPS readiness), 2026-09-03. This document
answers the question the GPS Job Session + Confirm Actual contract's own
§5 ("The web capability boundary — honest, not fictional") already
named but deliberately did not answer: **how does a future native build
actually get built**, given the concrete state of this repository today?

**Status: `BLOCKED_HUMAN` — the specific container/framework choice
below is a genuine product/business decision (App Store presence, team
skillset and hiring, release-pipeline cost, timeline) this session
cannot make on the repo's own evidence alone.** What follows is a
grounded comparison of only the credible options for *this* codebase,
not generic mobile-framework research, plus the framework-independent
work (Phase B's own `LocationTrackingProvider`/`NetworkStateProvider`
capability boundaries, the offline outbox) that stays useful regardless
of which option is chosen later — see `OVERNIGHT_BUILD_LOG.md`'s "Phase
B" section for what was actually built this phase.

## 1. The real starting point (verified this session, not assumed)

- **Stack**: Next.js 16.3.2 (App Router), React 19.2.8, TypeScript,
  Tailwind, Supabase JS client. Confirmed via `package.json`.
- **No PWA scaffolding exists today** — no `manifest.json`/
  `manifest.webmanifest`, no service worker, no installable-PWA
  configuration anywhere in the repo (confirmed by a real filesystem
  search this session). The app is a plain server-rendered/client-
  hydrated Next.js web app, not even an installable PWA yet, let alone a
  native-wrapped one.
- **No native project exists** — no Capacitor config, no `.xcodeproj`,
  no Android project, confirmed the same way.
- **The domain/orchestration layers are already framework-agnostic
  TypeScript** — `src/domain/`, `src/orchestration/`, and
  `src/lib/farm-data/` have no React/Next-specific code in them (Next's
  own layering rule, `ARCHITECTURE.md`'s "Layering" section, already
  enforces this). This is the single largest asset any native path
  reuses unchanged, regardless of which option below is chosen.
- **The platform-capability boundary already exists and is honest**:
  `LocationTrackingProvider` (`src/lib/location/location-tracking-provider.ts`)
  and, as of this phase, `NetworkStateProvider`
  (`src/lib/network/network-state-provider.ts`) are pure interfaces with
  one real web adapter each. Neither ever claims a capability (background
  tracking, verified reachability) the current platform cannot deliver.
  A native adapter for either is a drop-in implementation of the same
  interface — no caller changes.
- **The offline outbox (`src/lib/offline/outbox.ts`) is IndexedDB-based,
  already durable, already farm-scoped, already at-least-once-delivery
  safe** — a decision the product owner already made
  (`ARCHITECTURE.md`'s "Offline / GPS job mode" section, 2026-09-01) and
  this codebase has since built and independently audited (10 real
  Codex rounds against the Job Session contract's own use of it).

## 2. What a native build actually needs that the web adapter cannot give

Per `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §5 and this repo's own
`LocationTrackingProvider.backgroundTrackingSupported` always being
`false` on web:

1. **Background location while the app is backgrounded or the screen is
   locked** — Core Location (iOS, with the `Always` or
   `WhenInUseAndAlways` authorisation plus a background mode capability)
   or an Android foreground service with a location type, for the
   duration of an active Job Session only (never ambient background
   tracking outside a session — the product's own Farm Awareness/Active
   Tracking mode split, §4, already scopes this correctly).
2. **Durable local persistence that survives an OS-initiated app
   suspend/kill**, not just a browser tab reload — the exact same
   contract `outbox.ts` already implements for IndexedDB; a native
   adapter needs an equivalent durable local store (SQLite, or a native
   key-value store) behind the *same* enqueue/flush/idempotency contract,
   not a different one.
3. **Local/push notification delivery** — e.g. "tracking paused, tap to
   resume", a reminder to Confirm Actual after a session auto-ends.
   **No capability-boundary interface for this exists in this repo at
   all yet** (confirmed this session — zero real callers, zero
   `Notification`-API usage anywhere). Deliberately not built
   speculatively this phase: this codebase's own established discipline
   (`estimate_calibration`'s removal, `BLOCKERS.md`'s repeated "no
   unconsumed schema" rulings) treats an interface with no real consumer
   as itself a defect waiting to be found by the next Codex audit, not a
   harmless placeholder. The right time to add a
   `NotificationDeliveryProvider` (mirroring `LocationTrackingProvider`'s
   own pattern exactly) is alongside the first real screen/flow that
   needs to *show* one — most likely whichever native shell first wires
   real background tracking, since that is also the first time "tracking
   paused, tap to resume" becomes a real, reachable state a farmer needs
   telling about while the app isn't in the foreground.
4. **A real app-store-distributable build/release pipeline** — signing,
   provisioning, store listings, update cadence — none of which exists
   today and none of which this document can substitute a human decision
   for.

## 3. Credible options for this repo, compared

Only options with a real, non-speculative path from *this* Next.js/React
codebase are considered — a from-scratch rewrite in an unrelated stack
is not a credible option given the domain/orchestration layer this
programme has already built and repeatedly audited.

### Option A — Capacitor (wrap the existing web app)

Ship the current Next.js app (as a static/hybrid export, or Capacitor's
own local-server mode) inside a native Capacitor shell, adding native
plugins (`@capacitor/geolocation` plus a background-geolocation plugin,
`@capacitor/local-notifications`, `@capacitor/preferences` or a SQLite
plugin for the outbox) that implement this repo's own
`LocationTrackingProvider`/future `NotificationDeliveryProvider`
interfaces.

- **Reuses unchanged**: 100% of `src/domain/`, `src/orchestration/`,
  `src/lib/farm-data/`, every React component, every screen. The
  `LocationTrackingProvider`/`NetworkStateProvider` interfaces are
  designed for exactly this — a new adapter file per platform, zero
  caller changes.
- **Becomes native**: a thin adapter layer per capability
  (`ios-location-tracking-provider.ts` calling a Capacitor plugin's
  bridge, same shape as `web-location-tracking-provider.ts`), plus the
  Xcode/Android Studio project shells Capacitor generates.
- **Packaging**: `npx cap add ios`/`android` generates the native
  project; `next build` (static export or a bundled server) becomes the
  web content Capacitor's `WKWebView`/Android `WebView` loads.
- **Background GPS boundary**: a real Capacitor background-geolocation
  plugin genuinely delivers this on both platforms; the adapter reports
  `backgroundTrackingSupported: true` only once it does, per this
  interface's own rule.
- **Local storage boundary**: swap IndexedDB for a Capacitor
  SQLite/Preferences plugin behind the *same* `outbox.ts` contract
  (enqueue/getPending/flush/claim semantics unchanged) — or, since
  Capacitor's `WKWebView`/Android `WebView` both support real IndexedDB
  natively, potentially **no change at all** to `outbox.ts` — the
  smallest-migration-risk path of the three options.
- **Push notifications**: `@capacitor/push-notifications` +
  `@capacitor/local-notifications`, wired to a new
  `NotificationDeliveryProvider` adapter.
- **BLE/Farm Return Drive path**: `@capacitor-community/bluetooth-le` (or
  equivalent) feeds real observations into the identical
  `telemetry_events`-linking pattern §11 already established — no schema
  change, a new `source` value only, exactly as that section anticipates.
- **Build/release**: still requires real Apple/Google developer
  accounts, signing, and store submission — Capacitor does not remove
  that cost, only the cost of a second UI codebase.
- **Migration risk**: lowest of the three — the web app keeps working
  unchanged for browser users throughout; a native shell is additive, not
  a fork.

### Option B — React Native (share domain logic, rewrite the UI)

Keep `src/domain/`/`src/orchestration/`/`src/lib/farm-data/` as a shared
package (already-plain TypeScript, no React-DOM dependency), but rebuild
every screen's UI in React Native components instead of reusing the
existing web components.

- **Reuses unchanged**: the domain/orchestration/farm-data layers only —
  genuinely real, but a much smaller fraction of this programme's actual
  build effort than Option A reuses (every screen this program has
  built and audited — Today/Plan/Records/Job Session/Confirm Actual —
  would need a second, parallel UI implementation).
- **Becomes native**: everything UI-facing, plus
  `react-native-geolocation`/a background-geolocation library,
  `react-native-push-notification`, `react-native-sqlite-storage` (no
  browser IndexedDB exists in React Native's own JS runtime, so
  `outbox.ts`'s storage backend genuinely changes, not just its adapter
  — a real, larger migration than Option A's).
- **Migration risk**: highest of the three that reuse anything — two UI
  codebases (web + native) diverge over time unless deliberately kept in
  lockstep, and every future screen ships twice.

### Option C — Stay web/PWA-only, defer native indefinitely

Add the missing PWA scaffolding (a real `manifest.json`, a service
worker for install-ability and best-effort background sync) without
ever wrapping in a native container. `backgroundTrackingSupported`
stays `false` forever; the disclosed limitation in
`GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §5 becomes permanent product
behaviour, not a temporary gap.

- **Reuses unchanged**: everything — no new adapter, no new codebase.
- **Becomes native**: nothing; this is explicitly the "do not build
  native" option.
- **Migration risk**: none now, but does not solve the real product
  requirement this whole phase was asked to make progress on (a Job
  Session surviving app switching/screen lock/backgrounding) — only
  Options A/B do.

## 4. Comparison summary

| | A: Capacitor | B: React Native | C: Web/PWA only |
|---|---|---|---|
| Reuses existing screens | Yes, unchanged | No — rewritten | Yes, unchanged |
| Reuses domain/orchestration | Yes | Yes | Yes |
| Delivers real background GPS | Yes | Yes | No |
| Outbox storage migration needed | No (IndexedDB works in a WebView) or minimal | Yes (no IndexedDB in RN) | No |
| New UI codebase to maintain | No | Yes | No |
| Migration risk | Lowest | Highest | None (but doesn't solve the requirement) |
| App-store release pipeline needed | Yes | Yes | No |

## 5. Recommendation (informational — the final choice remains `BLOCKED_HUMAN`)

**Option A (Capacitor) is the smallest-risk path that genuinely
delivers the product requirement**, given this specific repo's own
history: every screen in this programme has been built once, against an
approved visual reference, and independently Codex-audited — rebuilding
all of it a second time in React Native (Option B) discards that work
for a UI-layer benefit (native look-and-feel) this product's own
screen-workflow discipline (`CLAUDE.md`'s "Screen workflow" section) does
not currently ask for. Option C does not deliver the actual requirement
this phase was asked to make progress on.

This recommendation does not decide the matter — team skillset with
Capacitor vs. React Native, App Store review posture, and release-cost
tolerance are real inputs only a human with that context can weigh. What
this phase *did* do, deliberately framework-independent regardless of
which option is chosen later: strengthened `LocationTrackingProvider`'s
sibling `NetworkStateProvider` boundary, closed two real offline-outbox
resilience gaps (sign-out cleanup that never destroys unsynced data;
stale-item reclaim on session mount), and named exactly where a
`NotificationDeliveryProvider` boundary belongs once a real consumer for
it exists — all genuinely useful under Option A or B, wasted under
neither.
