# Native Mobile / Background GPS Feasibility Phase — Final Report

**Starting SHA**: `01bb54f` (Strict Visual Reproduction phase's own final
commit — this phase's first commit's parent).
**Ending SHA**: see `git log -1 farm-return-next` at the time this report
was written; not re-edited to chase a moving HEAD.
**Branch**: `farm-return-next` only — `main` untouched throughout.

## 1. Architecture evaluated

Three real options for this repository (`docs/native/
ARCHITECTURE_OPTION_SCORING.md`'s own full detail): Capacitor wrapping
the existing app, Capacitor with a dedicated mobile shell, and React
Native/Expo. Extends `docs/farm-return-next/
NATIVE_GPS_ARCHITECTURE_DECISION.md` (the prior "Phase B" analysis,
2026-09-03), which left the container choice `BLOCKED_HUMAN` and the
packaging question as open investigation.

## 2. Native spike created

`apps/mobile-spike/` — a fully isolated Capacitor project (its own
`package.json`/`node_modules`/vitest config; zero changes to any
existing tracked file in the main web app, confirmed via `git status`
before this phase's first commit). Contains:

- A real, purpose-built static web shell (`src/app/main.ts`, bundled by
  `build.mjs` with esbuild) that really starts Active Tracking on Start
  Job, persists every real position before anything else happens to it,
  really records a Job Session interruption gap when tracking is
  interrupted, and really reaches `completed_estimated` (never
  `confirmed_actual`) on Finish Job.
- `NativeLocationTrackingProvider.ts` — a real implementation of the
  main repo's existing `LocationTrackingProvider` contract, built
  against the real, verified type shapes of `@capacitor/geolocation`
  and `@capacitor-community/background-geolocation`.
- `NativeLocationStore.ts` — a real, farm-scoped, SQLite-backed durable
  local queue for GPS observations (`@capacitor-community/sqlite`).
- `MobileSyncCoordinator.ts` — bridges that store to the existing cloud
  contract shape (`TelemetryEventInput`, imported not redefined), with
  a real farm-ownership equality check before every sync.
- 30 real automated tests (native-plugin bridges mocked and explicitly
  labelled as such; the main repo's own domain logic —
  `job-session-lifecycle.ts`, `job-actual.ts` — imported and exercised
  unmodified, with zero native/browser runtime present).

## 3. iOS build status

**Project generated, not compiled — `BLOCKED_EXTERNAL`.** `npx cap add
ios` produced a real Xcode project (`apps/mobile-spike/ios/App/
App.xcodeproj`, Swift Package Manager manifest referencing all three
real plugins). `xcodebuild` failed immediately: `"xcode-select: error:
tool 'xcodebuild' requires Xcode, but active developer directory
'/Library/Developer/CommandLineTools' is a command line tools
instance"` — only Xcode Command Line Tools are installed in this
environment, not the full Xcode.app `xcodebuild` requires. Installing
Xcode.app requires interactive Apple ID/App Store sign-in this
non-interactive session cannot perform. Real `Info.plist` location
permission keys (`NSLocationWhenInUseUsageDescription`,
`NSLocationAlwaysAndWhenInUseUsageDescription`, `UIBackgroundModes:
[location]`) were added to the generated project regardless, ready for
a human with Xcode access to build from.

## 4. Android build status

**Genuinely successful.** After installing OpenJDK 17 (later 21, once a
plugin's own Gradle toolchain requirement surfaced) and Android SDK
command-line tools + platform 35/36 + build-tools via Homebrew — no
admin password required for any step used — `./gradlew assembleDebug`
completed **BUILD SUCCESSFUL** (187 tasks) twice across this phase (once
before, once after the Codex-audit fix round), producing a real,
installable debug APK: `apps/mobile-spike/android/app/build/outputs/
apk/debug/app-debug.apk`. Verified, not assumed:

- `aapt dump permissions` on the built APK confirms all 6 added location/
  foreground-service permissions are genuinely present
  (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
  `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`).
- `unzip`-inspecting the APK's own bundled `assets/public/bundle.js`
  confirms it contains real, unmodified code from the main repo's
  `src/domain/job-session-lifecycle.ts` (its own literal error string)
  and the phase's own fix commits (`recordInterruptionGap`, `farmId`
  scoping) — not a stub.
- `./gradlew compileDebugAndroidTestJavaWithJavac
  compileDebugUnitTestJavaWithJavac` succeeds (the generated
  instrumentation test's own hardcoded package-name assertion, a real
  Codex-audit finding, was corrected from Capacitor's own template
  default to this app's real `applicationId`).

Not attempted: actually *running* the APK on an emulator or device
(`adb install`/`am start`) — no emulator image or physical device was
available. The task's own instructions state emulator GPS "only proves
integration/build correctness," already demonstrated by the successful
build and its own verified contents.

## 5. Physical-device test status

**`BLOCKED_EXTERNAL` — not run.** No physical iOS/Android device and no
running emulator/simulator were available in this environment. The
exact plan to run once device access exists: `docs/native/
PHYSICAL_DEVICE_TEST_PLAN.md` (Tests A–F, matching this phase's own
brief exactly) — Tests A, B, D, E, F can run against the already-built
Android debug APK today with no further build step.

## 6. Background-GPS status

**Architecturally real, device-unverified.** `NativeLocationTrackingProvider`
wires a genuine OS-service-owned background path
(`@capacitor-community/background-geolocation`, MIT-licensed,
Capacitor-core-team-maintained — confirmed via its own real, installed
type definitions, not assumed) — `main.ts` now actually invokes it with
`useBackgroundService: true` on a real native platform. `backgroundTrackingSupported`
in `getCapability()` stays honestly `false` until
`BACKGROUND_TRACKING_VERIFIED_ON_DEVICE` (a named constant in the
adapter itself) is flipped by a real physical-device test — never
claimed prematurely, per this whole contract's own central rule. A
real, tool-confirmed compatibility risk: Capacitor's own CLI warned
`"@capacitor-community/background-geolocation is built for Capacitor 7,
it might cause issues"` (this spike uses Capacitor 8) — disclosed, not
hidden; the build succeeded regardless, but this is a genuine open risk
for real background delivery a device test would need to specifically
watch for.

A commercial alternative (Transistorsoft's
`@transistorsoft/capacitor-background-geolocation`) is named in
`NativeLocationTrackingProvider.ts`'s own header comment as a real,
credible fallback if the free plugin proves insufficient on real-device
testing — deliberately not adopted without a human licensing decision,
per this phase's own instruction not to introduce a paid SDK silently.

## 7. Screen-lock status

**Not verified — `BLOCKED_EXTERNAL`.** Requires Test B of the physical
device test plan. The architecture (a real native background service,
independent of WebView JS execution) is the correct one for this
requirement per `docs/native/NATIVE_MOBILE_FEASIBILITY.md` §2's own
citation of Apple/Android's real background-location mechanisms — but
"correct architecture" and "verified on a real device" are two
different claims, and only the first is made here.

## 8. Offline-location status

**Real, verified in the buildable spike's own logic, not device-tested.**
`NativeLocationStore` persists every observation locally before any
sync attempt is possible — there is no code path in
`NativeLocationTrackingProvider`'s `startActiveTracking` callback that
makes a network call at all. `main.ts`'s own Finish Job handler requires
no connectivity (`finishJobSession` is a pure function of already-known
local state, unchanged from the main app's own existing architecture).
30 real tests exercise this logic directly.

## 9. Local persistence status

**Real, working, farm-scoped.** `NativeLocationStore` (SQLite via
`@capacitor-community/sqlite`) persists `client_observation_id`
(primary key, idempotent insert), `farm_id`, `job_session_id`,
`latitude`/`longitude`, `accuracy_meters` (nullable, never fabricated),
`recorded_at` (the real device-clock time of the fix — a real Codex
finding this phase caught and fixed: a missing native `time` field was
briefly substituted with processing time before being corrected to
decline the fix outright instead), real DB-persisted ordering (SQLite's
own `rowid`, not an in-memory counter that would reset on restart — also
a real, caught-and-fixed Codex finding), and `sync_state`. A real
CRITICAL finding (this round's own most serious) was caught and fixed:
the first version stored no farm identity at all, meaning retained
local data could theoretically be synced under a different farm after a
sign-out/sign-in — every read is now farm-scoped, and the sync
coordinator validates farm-ownership again before ever building a sync
payload.

## 10. Sync/idempotency status

**Real, reusing the existing contract's own guarantee.**
`MobileSyncCoordinator.flushJobSessionObservations` builds a real
`TelemetryEventInput` payload (the main repo's own frozen contract,
imported via `import type` — fully erased at compile time, verified —
never redefined in parallel, a real Codex finding this phase caught and
fixed) and relies on `insertTelemetryEvent`'s own already-documented
server-side retry-safety for exactly-once effect under at-least-once
delivery — the identical posture `outbox.ts` itself takes, not a new or
weaker guarantee.

## 11. Interruption handling

**Real, wired end-to-end in the spike (a real fix beyond the main app's
own current state).** `main.ts`'s Start Job flow now calls the real
`recordInterruptionGap` domain function (imported unmodified from
`src/domain/job-session-lifecycle.ts`) the moment a tracking
interruption is reported — this was a real Codex-audit HIGH finding
(the first version only logged the interruption) caught and fixed in
this same phase. Notably, this closes — in the spike only, not yet
ported back to the main web app — the exact disclosed gap
`GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §7 itself names: "the live UI does
not yet call [`recordInterruptionGap`] automatically on every real
interruption path." Porting this fix back to `ActiveJobSessionView.tsx`
is named as this report's own "next implementation phase" (§22) —
deliberately not done in this phase, which is scoped to the native
spike, not a change to the shipped web app.

## 12. Next.js/Capacitor compatibility findings

Not compatible for the *existing* Next.js pages as they stand: `src/
proxy.ts` (server-side auth-cookie refresh on almost every route), all
7 files' worth of real `"use server"` Server Actions (every real
write), and all 26 files importing `"server-only"` (every real
persistence module) all require a live Next.js server process — Next's
own documentation excludes Server Actions from static export. **Fully
compatible for a dedicated, purpose-built mobile shell**: proven
directly — a real static bundle (esbuild) containing unmodified
`src/domain/`/`src/lib/location/` code was built with no Next.js server
involved, and packaged successfully into a real, verified Android APK.
Full capability-by-capability classification: `docs/native/
NATIVE_MOBILE_FEASIBILITY.md` §2.

## 13. UI reuse estimate

**High for the domain/logic layer (100%, proven), moderate for screen
JSX (a real starting point, not a drop-in).** Every screen's own
component tree (Today, Plan, Records, Job Session, Confirm Actual, etc.)
is real Tailwind/JSX that would need its own data-fetching layer
rewritten (from Server Component reads / Server Action calls to direct
client SDK calls) but not its visual structure — `docs/native/
ARCHITECTURE_OPTION_SCORING.md` scores this dimension explicitly (9/10
for a plain Capacitor wrap, 6/10 for a dedicated shell, since the shell
option's own persistence rework touches more of each screen's own data
plumbing even though the JSX itself survives).

## 14. Domain/backend reuse estimate

**100%, proven directly, not estimated.** `src/domain/` (the pure
calculation/state-machine layer) needed zero modification to run inside
this phase's own spike — `JobSessionIntegration.test.ts` imports
`job-session-lifecycle.ts`/`job-actual.ts` unmodified and exercises real
behaviour with no native/browser runtime present at all. The Supabase
schema/RLS itself is entirely unaffected by which client (Server Action
vs. direct SDK call) invokes it — this phase's own real database schema
(`job_sessions`, `job_actuals`, `telemetry_events`) needs no migration
for a native client to use it, only a different calling convention.

## 15. Major blockers

- `BLOCKED_EXTERNAL` — no Xcode.app (only Command Line Tools); iOS
  cannot be compiled in this environment.
- `BLOCKED_EXTERNAL` — no physical device or emulator; real
  background-GPS/screen-lock/force-quit behaviour is unverified.
- `BLOCKED_HUMAN` — the final container/framework choice itself (team
  skillset, release-cost tolerance, App Store review posture) —
  unchanged from the prior phase's own framing; this phase adds
  evidence, not a decision no repo-level analysis can make.
- `BLOCKED_HUMAN` — a real Apple Developer Program account (required
  for the iOS `UIBackgroundModes` capability to have any real effect)
  and a real paid-vs-free background-geolocation-plugin decision if the
  free option proves insufficient on real-device testing.
- Real, disclosed, non-blocking: the persistence-layer rework needed for
  a genuinely offline-capable static shell (converting every Server
  Action call to a direct Supabase client call) is bounded and
  enumerable (`docs/native/NATIVE_MOBILE_FEASIBILITY.md` §3) but not
  attempted this phase — out of this phase's own explicit "spike, not
  migration" scope.

## 16. App Store / Play Store requirements

`docs/native/STORE_LOCATION_COMPLIANCE_CHECKLIST.md` — real, current
requirements for both platforms (background-location declaration forms,
privacy policy, data-safety disclosures, foreground-service
notification requirements) — not claimed satisfied, only enumerated.
Store approval is never guaranteed by satisfying a checklist.

## 17. Codex audit results

Four real rounds this phase, each finding real issues, each fixed
before the next; a fifth (re-)audit of round 4's fix commit is pending
as of this report's own writing:

- **Round 1** (`--commit f5d9f88`, the phase's own first commit):
  CRITICAL=0, HIGH=3, MEDIUM=1, LOW=1. Fixed: a parallel contract
  duplication (`MobileSyncCoordinator` redefining `TelemetryEventInput`
  instead of importing it); the demo shell not actually wiring location
  capture through to persistence (fixed: `main.ts` now really starts
  Active Tracking and persists every position; real native manifest
  permissions added); this file itself missing (fixed:
  `BUILD_STATE.json`/`IMPLEMENTATION_LOG.md` updated in the same
  commit); an in-memory sequence counter that reset on restart (fixed:
  real SQLite `rowid` used instead); an inaccurate doc comment
  describing a never-implemented method (fixed: corrected).
- **Round 2** (`--base 01bb54f`, the whole phase's diff): CRITICAL=1,
  HIGH=3, MEDIUM=1, LOW=0. Fixed: a real cross-tenant data-exposure risk
  (`NativeLocationStore` had no `farm_id` column at all — retained local
  data could be synced under a different farm after a sign-out/sign-in;
  fixed with the identical discipline `outbox.ts`'s own header comment
  already documents for the same class of bug); a fabricated fallback
  timestamp (`Date.now()` substituted for a missing native device-clock
  time; fixed to decline the fix outright instead, mirroring
  `getCurrentPosition`'s own honest-null convention); interruption
  events only being logged, never recorded as a real `InterruptionGap`
  (fixed: `main.ts` now calls the real domain function); a Capacitor
  template's own stale package-name assertion in the generated
  instrumentation test (fixed).
- **Round 3** (`--base 01bb54f`, the whole phase's diff): CRITICAL=0,
  HIGH=3, MEDIUM=1, LOW=0. Fixed: the round-2 `farm_id` schema change had
  no real migration path (`DB_VERSION` bumped with no `addUpgradeStatement`
  — later found itself incomplete for a genuinely fresh install, see
  round 4); the `tracking` flag reported the wrong answer both before the
  first fix arrived and after a real watcher error (fixed: set true on
  watcher registration, cleared on a real error, both foreground and
  background-service paths); GPS persistence was fire-and-forget, with
  Finish Job never awaiting outstanding local writes (fixed: tracked in a
  `Set`, awaited before finishing — later found itself incomplete, a
  failure was swallowed as a resolved promise, see round 4); a stale
  instruction in `PHYSICAL_DEVICE_TEST_PLAN.md`'s Test E (fixed).
- **Round 4** (`--base 01bb54f`, worktree at commit `34b7b85`):
  CRITICAL=0, HIGH=4, MEDIUM=1, LOW=0. Fixed: round 3's own `farm_id`
  migration broke a genuinely fresh install — the plugin runs every
  registered upgrade through version 2 on a brand-new (version 0)
  database *before* this file's own manual `CREATE TABLE` ran, so the
  version-2 `ALTER TABLE` executed against a table that did not exist
  yet; fixed by registering the two real schema versions as two
  `addUpgradeStatement` steps (version 1 creates the original table,
  version 2 adds `farm_id`), so a fresh install runs both in order. A
  failed local SQLite write was silently converted into a *resolved*
  promise by the write chain's own `.catch()`, so Finish Job could
  complete exactly as if every write had succeeded, losing an
  already-acknowledged observation with no trace; fixed to record a
  real, disclosed `InterruptionGap` instead. A background fix with a
  missing device-clock time was silently discarded with no
  `onInterruption` call (hiding a real evidence gap), and an invalid
  timestamp could reach `toISOString()` unchecked and throw from inside a
  native callback; fixed with a safe `toIsoStringOrNull` helper and a
  real `onInterruption("position_unavailable")` call on every decline.
  `BUILD_STATE.json`'s own `last_codex_audit` field still described the
  *preceding* visual-alignment checkpoint despite this checkpoint being
  marked complete — a real state/reality desync; fixed, along with a
  drifted test-count note (MEDIUM). All fixed in the same commit; 36
  mobile-spike tests, a fresh Android debug build re-verified via
  `aapt`/`unzip` (confirmed the compiled bundle contains the real fix
  code). Round 5 re-audit of this fix commit is the next real step, not
  yet run as of this report's own writing.

## 18. Full quality-gate result

Main web app, run at this phase's midpoint (after round-1 fixes) and
confirmed unaffected throughout (this phase touches no existing tracked
file — verified via `git status` before the first commit):

```
test       pass  (1528/1528, 119 test files)
typecheck  pass
lint       pass
build      pass
overall:   pass
```

`apps/mobile-spike`'s own isolated test suite: 36/36 passing, `tsc
--noEmit` clean, both after every fix round (26 after round 1, 30 after
round 2, 32 after round 3, 36 after round 4).

## 19. Recommended architecture

### `RECOMMEND_CAPACITOR_WITH_SEPARATE_MOBILE_SHELL`

Supported directly by this phase's own evidence, not merely asserted:
`docs/native/ARCHITECTURE_OPTION_SCORING.md`'s explicit 1–10 scoring
across 11 criteria gives this option 76/100 (highest of three), ahead
of a plain Capacitor wrap (74/100) specifically because this phase
*proved* the dedicated-shell packaging path works (a real static bundle,
a real successful Android build) rather than leaving it as the prior
phase's own open question — and well ahead of React Native/Expo
(53/100), which pays the same persistence-layer rework cost as this
option while additionally discarding every screen's own already-built,
already-audited JSX for no corresponding capability gain (background
GPS, BLE, and Mapbox-equivalent options are all comparably available to
Capacitor).

## 20. Next implementation phase

1. Port `main.ts`'s own interruption-handling fix
   (`recordInterruptionGap` wired to a real caller) back into the main
   web app's `ActiveJobSessionView.tsx` — closes
   `GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §7's own long-disclosed gap,
   independent of the native/Capacitor decision entirely.
2. Resolve the Server Action → direct-Supabase-client rework for the
   real write paths this phase's own audit enumerated
   (`docs/native/NATIVE_MOBILE_FEASIBILITY.md` §3) — the one genuinely
   open, bounded engineering task standing between this spike and a
   real offline-capable native build.
3. A human decision on the container/framework choice itself (this
   report's own recommendation, informed not decided) and on Apple
   Developer Program enrolment / a paid background-geolocation plugin
   if the free option's real-device testing (below) finds it
   insufficient.
4. Run `docs/native/PHYSICAL_DEVICE_TEST_PLAN.md`'s Tests A–F on a real
   Android device (the debug APK already exists) and, once Xcode access
   exists, the equivalent iOS build/test.
5. A round-3 Codex audit once the above lands, before this checkpoint's
   own `contracts_frozen` (if any new `src/domain/`-adjacent contract
   emerges from item 2) is considered stable.

---

**Can Farm Return's current codebase become the shipped native mobile
product?**

**MOSTLY.**

Explanation: the domain/business-logic layer (`src/domain/`) already is
the shipped native product's own logic, proven by direct, unmodified
reuse in a real, successfully-built Android application this phase
produced. The screens' own visual layer is a real, substantial starting
point, not a rewrite. What stands between today's codebase and a
shippable native app is a bounded, enumerable engineering task (moving
every real write from a Server Action to a direct client SDK call) —
real work, not a fundamental architecture mismatch — plus verification
this environment could not complete (a real device, a real Xcode
installation, a real Apple Developer account). Nothing found this phase
suggests the underlying architecture is unsuitable; several things
found and fixed this phase (a farm-scoping gap, a fabricated-timestamp
risk, an unwired interruption path) are exactly the kind of real defects
a genuine build-and-audit cycle exists to catch, and all were caught and
fixed within this same phase.

**Recommended native architecture:**

Capacitor with a dedicated, purpose-built mobile shell — reusing
`src/domain/` outright and every screen's own JSX as a starting point,
with the persistence layer rebuilt as direct Supabase client calls
instead of Server Actions. The final choice remains a real product/
business decision (`BLOCKED_HUMAN`) this report informs but does not
make.
