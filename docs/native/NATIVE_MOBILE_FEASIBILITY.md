# Native Mobile Feasibility — capability audit

Native Mobile / Background GPS Feasibility Phase, 2026-09-04. Answers
this phase's own first question — **"is Capacitor a viable native shell
for the CURRENT Farm Return Next architecture?"** — from a real audit of
this repository (not assumed), extending
`docs/farm-return-next/NATIVE_GPS_ARCHITECTURE_DECISION.md` (the prior
"Phase B" analysis, 2026-09-03) with the concrete capability-by-
capability classification that document's own §3 named as still-open
investigation, and with a real, buildable Capacitor spike
(`apps/mobile-spike/`, see `NATIVE_MOBILE_FEASIBILITY_FINAL_REPORT.md`
for what it actually proved).

**Starting SHA**: `01bb54f` (this phase's first commit's parent).

## 1. Real starting facts (verified this session)

- Next.js 16.3.2, App Router, React 19.2.8, TypeScript, Supabase JS.
- **Route protection is server-owned**: `src/proxy.ts` (Next 16's renamed
  `middleware.ts`) runs `updateSession` (`src/lib/supabase/proxy.ts`,
  `@supabase/ssr`) on almost every route (`matcher` excludes only static
  assets) — a live server process refreshing an auth cookie on every
  request. No static export can execute this.
- **7 files carry real `"use server"` Server Actions**
  (`src/app/actions/{telemetry,auth-state,job-sessions,farm,decisions,
  onboarding,auth}.ts`) — every real write path (Start/Pause/Resume/
  Finish Job, Confirm Actual, Decide, farm mutation, auth) goes through
  one of these. Server Actions require a live Next.js server at
  invocation time; Next's own documentation excludes them from static
  export.
- **26 files import `"server-only"`** — `src/lib/farm-data/*.ts` (every
  real persistence module) and most of `src/orchestration/`. These
  cannot run inside a browser/WebView bundle at all, by design (the
  `server-only` package throws if imported outside a server context).
- **Auth session storage is cookie-based, not localStorage-based**:
  `src/lib/supabase/client.ts`'s own "browser" client is
  `@supabase/ssr`'s `createBrowserClient`, whose session lives in
  cookies specifically so `proxy.ts`'s own server-side refresh can see
  and renew it. A genuinely static/offline-capable shell would need
  plain `@supabase/supabase-js`'s `createClient()` (localStorage/native-
  secure-storage session persistence) instead — a real, scoped,
  well-understood swap (Supabase's own JS client supports both), not a
  full auth rearchitecture.
- **The domain layer (`src/domain/`) is genuinely framework-agnostic** —
  confirmed directly by this phase's own spike
  (`apps/mobile-spike/src/native/JobSessionIntegration.test.ts`): real,
  unmodified imports of `job-session-lifecycle.ts`/`job-actual.ts` run
  and pass with zero native/browser runtime present at all.
- **The platform-capability boundary (`LocationTrackingProvider`/
  `NetworkStateProvider`) is real and honest**, but every call site
  (`ActiveJobSessionView.tsx`) still instantiates the concrete web
  adapter directly — no platform-selection factory exists in the main
  app yet (this phase's spike adds one, `apps/mobile-spike/src/app/
  main.ts`'s `selectLocationProvider`, as a proof, not yet ported back
  into the main app — see the final report's own "next implementation
  phase").
- **The offline outbox (`src/lib/offline/outbox.ts`) is IndexedDB-based**
  — real, durable, farm-scoped, at-least-once-safe. Whether IndexedDB is
  durable enough inside a Capacitor WebView under real storage pressure
  is **unverified** (no device available this session — see §4 and the
  final report's own "BLOCKED_EXTERNAL" list); this phase's own native
  spike instead built a parallel SQLite-backed store
  (`apps/mobile-spike/src/native/NativeLocationStore.ts`) for the one
  write path (background-service GPS callbacks) least likely to be safe
  inside a WebView's own JS execution context regardless of storage API.
- **No PWA scaffolding exists** (no manifest, no service worker) —
  unchanged since the prior phase's own finding.

## 2. Capability classification

| Capability | Classification | Basis |
|---|---|---|
| `src/domain/*` (all pure calculation/state-machine modules) | `CAPACITOR_READY` | Zero React/Next/browser/server dependency — verified by direct import + test execution from `apps/mobile-spike` with no native runtime present. |
| Screen UI (JSX/Tailwind component trees — Today, Plan, Records, Job Session, Confirm Actual, etc.) | `CAPACITOR_ADAPTABLE` | Real, substantial reuse as a starting point for a purpose-built mobile shell's own screens — but every one of these components currently reads data via a Server Component/Server Action data path (see below), so the component *markup* is reusable, its *data-fetching* is not, unchanged. |
| `LocationTrackingProvider`/`NetworkStateProvider` interfaces | `CAPACITOR_READY` | Pure TypeScript interfaces; a native adapter is a drop-in implementation, proven this phase (`NativeLocationTrackingProvider.ts`, real, type-checked against the real interface). |
| Web `LocationTrackingProvider`/`NetworkStateProvider` adapters | N/A (stay web-only) | Unchanged, remain the web app's own real adapters — never modified by this phase, per the phase's own instruction. |
| `src/lib/offline/outbox.ts` (IndexedDB queue) | `CAPACITOR_ADAPTABLE` | IndexedDB is available in both `WKWebView` and Android `WebView` in principle; real durability under a Capacitor app's own background/storage-pressure/app-update lifecycle is **unverified** (`BLOCKED_EXTERNAL` — no device). Treated as adaptable-with-a-caveat, not ready-as-is. |
| Native background GPS write path (a background-service watcher's own callback) | `NATIVE_REPLACEMENT_REQUIRED` | A background-service callback firing while the WebView's own JS may not be reliably alive is not a verified-safe context for an IndexedDB write — this phase built a real, separate SQLite-backed store (`NativeLocationStore.ts`) for this one path instead of assuming outbox reuse. |
| `src/proxy.ts` (Next's renamed middleware — auth session refresh) | `REQUIRES_SERVER` | Runs on a live Next.js server process per-request; cannot execute in a static bundle or a WebView with no reachable server. |
| Every `"use server"` Server Action (Start/Pause/Resume/Finish Job, Confirm Actual, Decide, farm mutation, auth) | `REQUIRES_SERVER` (as currently implemented) → `NATIVE_REPLACEMENT_REQUIRED` (for a genuinely offline-capable shell) | Requires a live Next.js server today. A native/offline-capable shell needs each real write converted to a direct `@supabase/supabase-js` call (the underlying SQL/RLS is unchanged — only the calling convention moves from "Server Action" to "client SDK call"), OR the shell must ship pointed at a permanently-reachable hosted server (see §5 of the final report). |
| Every `"server-only"`-gated `src/lib/farm-data/*.ts` read/write module | `NATIVE_REPLACEMENT_REQUIRED` (for a static/offline-capable shell) | Cannot be imported into a browser/WebView bundle at all (the `server-only` package enforces this at import time, not just at runtime) — its own real SQL/mapping logic is a reference for a client-side reimplementation against the same tables/RLS, not a module that ships unchanged. |
| Auth session storage (`@supabase/ssr` cookie-based) | `NATIVE_REPLACEMENT_REQUIRED` (for a static/offline-capable shell) | Needs `@supabase/supabase-js`'s own client-persisted-session mode instead — real, scoped, not attempted this phase (out of the phase's own "do not build native visual migration" boundary). |
| Mapbox GL JS (`mapbox-gl`, used in `MapHero`/`FieldBoundaryMapModal`) | `CAPACITOR_ADAPTABLE` | A real WebGL map inside a Capacitor WebView is a well-established, widely-shipped pattern (Mapbox's own documented Capacitor/Cordova compatibility) — not verified on a real device this session, but not a novel risk either. |
| `@supabase/ssr`'s `createServerClient` (used by every Server Action/Server Component data read) | `REQUIRES_SERVER` | By definition — a server-side cookie-aware client. |
| API routes (`src/app/api/weather/{forecast,observations}/route.ts`) | `REQUIRES_SERVER` (as currently implemented) → `CAPACITOR_ADAPTABLE` | These proxy a real external weather API; a native shell can call the same external API directly from the client (no Farm Return-specific server logic in the route beyond the proxy itself, based on this session's own reading), or keep calling a hosted version of these two routes over HTTPS — much lower migration cost than the write-path Server Actions above. |
| GPS Job Session lifecycle state machine (`job-session-lifecycle.ts`) | `CAPACITOR_READY` | Proven directly — see §1. |
| Confirm Actual validators (`job-actual.ts`) | `CAPACITOR_READY` | Proven directly — see §1. |
| Push/local notifications | `NATIVE_REPLACEMENT_REQUIRED` (net-new) | No `NotificationDeliveryProvider` boundary or any real consumer exists yet anywhere in this repo (confirmed, zero hits) — net-new work, not a migration, deliberately not built this phase (§19 scope boundary; also the prior phase's own documented reasoning for why now is not yet the right time — see `NATIVE_GPS_ARCHITECTURE_DECISION.md` §2.3). |
| App Store / Play Store release pipeline (signing, provisioning, listings) | `BLOCKED_HUMAN` | A real business/account/credential decision no repo-level evidence can resolve — see `docs/native/STORE_LOCATION_COMPLIANCE_CHECKLIST.md`. |
| Physical-device background-GPS verification (screen lock, force-quit, OEM battery management) | `BLOCKED_EXTERNAL` | No physical iOS/Android device, no Xcode.app, no Android emulator image available in this build environment — see the final report's own environment section and `docs/native/PHYSICAL_DEVICE_TEST_PLAN.md`. |
| iOS Xcode build (compiling the real generated Xcode project) | `BLOCKED_EXTERNAL` | Only Xcode Command Line Tools are installed, not the full Xcode.app `xcodebuild` requires (`xcode-select: error: tool 'xcodebuild' requires Xcode`) — installing Xcode requires an Apple ID/App Store sign-in this session cannot perform. The Xcode *project itself* was successfully generated (`apps/mobile-spike/ios/`, real `.xcodeproj` + Swift Package Manager manifest) — only compiling it is blocked. |
| Android Gradle build (compiling the real generated Android project) | **Resolved this phase, not blocked** — see the final report. A real Java 21 toolchain + Android SDK were installed via Homebrew (no admin password required for the formula path used) and produced a genuine, verified debug APK. |

## 3. Answering §5's own packaging question directly

**Can the production mobile application package its UI locally?**
Not the *existing* Next.js app's pages as they stand — they depend on a
live server for auth refresh, every real write, and every real
server-rendered read. **A dedicated, purpose-built mobile shell can**,
proven directly this phase: `apps/mobile-spike`'s own `build.mjs`
(esbuild) produces a genuine static bundle (no Next.js server, no
SSR, no Server Action) containing real, unmodified code imported
straight from `src/domain/` and `src/lib/location/`, and that bundle
was verified to run correctly packaged inside a real, successfully
Gradle-built Android debug APK (`apps/mobile-spike/android/app/build/
outputs/apk/debug/app-debug.apk`).

**Which current Next.js features prevent local packaging?** `proxy.ts`
(server-side auth refresh), every `"use server"` Server Action (every
real write), and every `"server-only"`-gated `src/lib/farm-data/*.ts`
module (every real read/write's actual SQL) — see §2's table.

**Can those features be moved behind APIs without rewriting the entire
product?** Yes, in principle, and the cost is bounded and enumerable —
not a rewrite of `src/domain/` (untouched) or of the screens' own JSX
(reused as a starting point), but a real, scoped rework of exactly the
persistence-calling convention in `src/lib/farm-data/*.ts` and
`src/app/actions/*.ts` (from "Server Action calling a `server-only`
module" to "client SDK call the mobile shell makes directly"), plus the
auth session-storage swap named in §1. This is real, non-trivial work —
this phase did not attempt it (out of scope: "do not build... unrelated
visual redesign" and the phase's own explicit spike-not-migration
framing) — but it is bounded, not open-ended.

**Would a dedicated mobile shell be cleaner?** Yes — see
`NATIVE_GPS_ARCHITECTURE_DECISION.md` §3's own Option A vs. B comparison,
extended by this phase's own real evidence in the final report's
decision gate: a dedicated shell (Option A-with-shell) reuses the
screens' own JSX/Tailwind and the entire domain layer while giving the
persistence layer a single, deliberate rewrite target, rather than
either (a) shipping a WebView pointed at a permanently-reachable Next.js
server (real, but narrows "offline-first" considerably — the whole
write path depends on that server being reachable) or (b) a full React
Native rewrite (discards the reusable JSX layer for no reuse benefit on
the one layer — persistence — that genuinely needs rework either way).

## 4. What this phase's own environment could and could not verify

Real, run this session: `npm install` of real Capacitor packages,
`npx cap init`/`cap add android`/`cap add ios` (both platform projects
genuinely generated), a real `esbuild` static bundle build, a real
**successful Android Gradle debug build** (after installing OpenJDK 17
→ 21 and Android SDK command-line tools + platform/build-tools via
Homebrew, all without requiring an admin password), and 25 real
automated tests against the native adapter/store/sync-coordinator code
and the shared domain contracts.

Not available in this environment, honestly marked `BLOCKED_EXTERNAL`
rather than assumed either way: a full Xcode.app installation (requires
interactive Apple ID/App Store sign-in), any physical iOS/Android
device, any running Android emulator image (a real system-image
download this phase judged out of proportion to its own value — the
task's own instructions already state emulator GPS "only proves
integration/build correctness," which the successful Gradle build
already demonstrates without needing to run it). See the final report
for the complete, itemised list.
