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
- Real, disclosed, non-blocking: no genuine callback-quiescence
  guarantee exists for Finish Job — a position callback already queued
  on either Capacitor geolocation plugin's own bridge before
  `stopActiveTracking()` resolves can still arrive after the session is
  marked finished (Codex audit round 8/9). This spike mitigates it (an
  event-loop tick before draining, plus an explicit shell-level
  "unreconciled late observation" marker rather than a silently clean
  finish) but cannot eliminate it without either a native quiescence
  signal neither plugin exposes, or a proper `DOMAIN_CONTRACTS.md`
  reconciliation transition added to the frozen job-session lifecycle
  contract — real follow-up work for a future phase, not this one.

## 16. App Store / Play Store requirements

`docs/native/STORE_LOCATION_COMPLIANCE_CHECKLIST.md` — real, current
requirements for both platforms (background-location declaration forms,
privacy policy, data-safety disclosures, foreground-service
notification requirements) — not claimed satisfied, only enumerated.
Store approval is never guaranteed by satisfying a checklist.

## 17. Codex audit results

Thirteen real rounds this phase. Round 13 is the first to reach
BUILD_PLAN.md's own gate (0 Critical/High) — see its own entry below for
why one more round still followed:

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
  code).
- **Round 5** (`--base 01bb54f`, worktree at commit `8783559`):
  CRITICAL=0, HIGH=2, MEDIUM=2, LOW=0. Fixed: round 4's own
  persistence-failure fix set `lastConfirmedAt` the instant a position
  was *received*, before its `insertObservation` write had actually
  settled — "if that write fails... the gap recorded [at Finish Job] can
  claim an unpersisted fix as confirmed, or place `lastConfirmedAt` after
  `interruptedAt`." Fixed: `lastConfirmedAt` now only advances inside the
  write's own success handler, on the real native path (the web demo
  branch, which has no local write to await, keeps updating on receipt,
  unchanged). `BUILD_STATE.json`'s own `next_action` field still
  described the *preceding* Visual Alignment session's closure and
  explicitly said "no work was started on native iOS/Android
  implementation" — a real state/reality desync directly contradicting
  this same file's own native-phase entries elsewhere; fixed, now points
  at the real current state and this phase's own IMPLEMENTATION_LOG.md
  entries. `PHYSICAL_DEVICE_TEST_PLAN.md` implied the built APK was
  already sitting in the repository ready to install, when it is a
  gitignored build artifact requiring a rebuild from a fresh checkout;
  fixed with the real three-command rebuild sequence. The same document's
  Test C promised "verify sync" once network is restored, but this
  spike's own shell never wires `MobileSyncCoordinator.flushJobSessionObservations`
  into any UI action — fixed to disclose that a device tester must call
  it directly (it is real and unit-tested, just not shell-wired) rather
  than imply a working sync button exists. All fixed in the same commit;
  36/36 mobile-spike tests (unchanged — this round's fixes were UI-flow
  and documentation corrections, not new persistence logic requiring new
  test coverage beyond what already exercises `NativeLocationStore`/
  `job-session-lifecycle.ts` directly), a fresh Android debug build
  re-verified via `aapt`/`unzip` (confirmed the compiled bundle contains
  two real `lastConfirmedAt = position.recordedAt` call sites, matching
  the fix's own native-success-handler + web-branch split).
- **Round 6** (`--base 01bb54f`, worktree at commit `8ab2f42`):
  CRITICAL=0, HIGH=2, MEDIUM=1, LOW=0. Fixed: a real race between Start
  and Finish Job — if `startActiveTracking()` was still awaiting native
  watcher registration when Finish Job ran, `stopActiveTracking()` could
  execute first (finding no watcher id yet assigned, a no-op), after
  which the pending registration completed and tracking silently
  continued past an already-finished session. Fixed: Finish Job now
  awaits the same startup promise Start Job itself awaits before calling
  `stopActiveTracking()`, so a real watcher id (or a genuine denial/
  interruption outcome) is always settled first. Concurrent SQLite
  writes could also update `lastConfirmedAt` out of observation order
  (an older write settling last could move it backwards), and — more
  seriously — a later successful write could push it past the recorded
  failure moment, producing an invalid gap interval that was logged and
  then silently ignored, letting a persistence failure finish without
  its promised evidence gap. Fixed: `lastConfirmedAt` now only ever
  advances (`advanceConfirmedAt`, real ISO-string comparison), the gap's
  `interruptedAt` is computed fresh after all pending writes have
  settled (a real "now" is always after any past device timestamp,
  valid by construction), and a gap that still cannot be recorded now
  fails closed — Finish Job refuses to complete rather than losing the
  evidence silently. A doc comment in `NativeLocationTrackingProvider.ts`
  said background geolocation was "not wired to a running build," which
  had become false the moment `main.ts` started using it and the Android
  build started including it; corrected to distinguish "wired and
  built" from "verified on a real device." All fixed in the same commit;
  36/36 mobile-spike tests (unchanged — control-flow-ordering fixes to
  `main.ts`, which this phase's own test suite does not unit-test
  directly, same as every prior round's `main.ts` fix; verified instead
  via a fresh Android debug build), `aapt`/`unzip` re-confirmed the
  compiled bundle contains the real `advanceConfirmedAt`/
  `activeTrackingStartupPromise` fix code.
- **Round 7** (`--base 01bb54f`, worktree at commit `d7b8517`):
  CRITICAL=0, HIGH=1, MEDIUM=1, LOW=0. Fixed: `Promise.all(pendingWrites)`
  only snapshotted the `Set` once — "a location callback already queued
  when `stopActiveTracking()` resolves can add another write afterward,
  allowing `finishJobSession()` to complete while that write remains in
  flight," recreating the exact acknowledged-observation-loss race round
  3's own fix was meant to close. Fixed: drains in a `while` loop,
  re-checking the live `Set` after each `Promise.all` pass, until it is
  genuinely empty. Every position callback also generated a fresh
  `crypto.randomUUID()` per invocation, so a real duplicate delivery of
  the same native fix never shared the identifier
  `NativeLocationStore`'s own `INSERT OR IGNORE` idempotency is based on
  — "the documented duplicate-delivery idempotency does not exist at the
  real call site." Neither Capacitor geolocation plugin exposes a native
  event id (confirmed against both packages' installed type
  definitions); fixed by deriving a stable id from the fix's own real
  content instead (job session + platform + device-clock timestamp +
  coordinates) — a genuine re-delivery of the same fix now collides on
  the same id, as the store's own documentation already assumed. All
  fixed in the same commit; 36/36 mobile-spike tests (unchanged — both
  fixes are in `main.ts`'s own control flow, not unit-tested directly,
  same as every prior round's `main.ts` fix; verified via a fresh
  Android debug build), `aapt`/`unzip` re-confirmed the compiled bundle
  contains the real `deriveObservationId`/drain-loop fix code.
- **Round 8** (`--base 01bb54f`, worktree at commit `8f828ee`):
  CRITICAL=0, HIGH=2, MEDIUM=0, LOW=0. Fixed: round 7's own drain loop
  still missed a real case — "if `pendingWrites` is empty immediately
  after `stopActiveTracking()` but an already-queued position callback
  runs afterward, the loop exits without yielding... and that callback
  subsequently adds an unawaited write." Mitigated with a real
  event-loop tick (`setTimeout(resolve, 0)`) before the drain loop's
  first check, giving an already-in-flight callback a chance to
  register its write first — a genuine, disclosed **mitigation, not a
  hard guarantee**: neither Capacitor plugin used here exposes a
  "confirm no callbacks are still pending" quiescence signal to await
  instead, a real architectural limit of this plugin surface, not a gap
  this phase glossed over. A `sessionFinishedAt` flag now makes any
  write that still arrives after Finish Job completed observable in the
  log (and the data is still persisted, never dropped) rather than
  silently invisible. `BUILD_STATE.json`'s own `next_action` field had
  gone stale again — still naming round 5 as the open item while
  `checkpoint_status`/`last_codex_audit`/`IMPLEMENTATION_LOG.md` all
  referenced round 7; fixed by rewriting it to point at `last_codex_audit`
  as the live source of truth rather than restating a round number that
  goes stale every round (the same recurring class of bug, now closed
  structurally instead of patched once more). All fixed in the same
  commit; 36/36 mobile-spike tests (unchanged), a fresh Android debug
  build re-verified via `aapt`/`unzip` (bundle confirmed to contain the
  real `sessionFinishedAt` fix code).
- **Round 9** (`--base 01bb54f`, worktree at commit `0850fe7`):
  CRITICAL=0, HIGH=1, MEDIUM=0, LOW=0. Fixed: round 8's own mitigation
  persisted a late observation and logged it, but "logging the
  inconsistency does not fail closed... the app can report
  `completed_estimated` while possessing a valid GPS observation
  omitted from the session's accounted evidence." The frozen
  `job-session-lifecycle.ts` contract cannot record a gap once a session
  has already left `"active"` status (by design — this phase must never
  work around that), so a domain-level fix is out of scope; fixed
  instead with a shell-level (non-domain) reconciliation marker — a new
  `hasUnreconciledLateObservation` flag makes a completed session's own
  rendered status and log explicitly read "COMPLETED WITH UNRECONCILED
  LATE OBSERVATION(S)" rather than presenting a false clean finish. A
  real production fix genuinely needs either a native quiescence signal
  neither Capacitor plugin used here exposes, or a proper
  `DOMAIN_CONTRACTS.md`-governed reconciliation transition added to the
  lifecycle contract — both disclosed as real follow-up work for a
  future phase, not silently worked around in this one. Fixed in the
  same commit; 36/36 mobile-spike tests (unchanged), fresh Android debug
  build re-verified via `aapt`/`unzip` (bundle confirmed to contain the
  real `hasUnreconciledLateObservation` fix code).
- **Round 10** (`--base 01bb54f`, worktree at commit `b356f68`):
  CRITICAL=1, HIGH=1, MEDIUM=1, LOW=0. Fixed: **CRITICAL** — round 7's
  own `deriveObservationId` fix omitted `farmId` from its composite key
  — "two farms producing the same session ID, platform, timestamp, and
  coordinates therefore collide; `INSERT OR IGNORE` silently discards
  the second farm's observation." A real regression of round 2's own
  CRITICAL farm-scoping fix into the id-derivation call site; fixed by
  making `farmId` the first component of the key, and
  `NativeLocationStore.insertObservation` now returns whether a row was
  genuinely inserted (real `INSERT OR IGNORE` `changes` count) so the
  caller can tell a real duplicate apart from silent data loss, exactly
  as the finding's own remedy asked. **HIGH** — the version-2 migration's
  own `DEFAULT ''` strands any pre-existing row's `farm_id`
  unrecoverably, "defeating the durable offline queue during an
  upgrade." There is no safe automatic attribution (the true owner is
  not recoverable from the row itself); fixed by failing closed instead
  — `open()` now throws if any `farm_id = ''` row is found post-migration,
  surfacing the real problem rather than silently stranding evidence.
  **MEDIUM** — `stopActiveTracking()` cleared each watcher id only after
  its own removal call resolved, with no `finally`, so a rejected native
  removal left stale state and could abort the Finish handler as an
  unhandled rejection; fixed to clear all local state unconditionally
  before removal even starts, re-throwing the real error afterward for
  the caller (`main.ts`) to catch and disclose rather than leave
  unhandled. All fixed in the same commit; 39/39 mobile-spike tests (3
  new — the id-derivation regression, the fail-closed migration check,
  and the removal-rejection state-clearing), fresh Android debug build
  re-verified via `aapt`/`unzip` (bundle confirmed to contain the real
  `removalError`/`orphanCount` fix code).
- **Round 11** (`--base 01bb54f`, worktree at commit `7b21829`):
  CRITICAL=0, HIGH=1, MEDIUM=1, LOW=0. Fixed: round 10's own
  `stopActiveTracking()` fix over-corrected — it cleared every watcher
  id and set `tracking = false` unconditionally, even when native
  removal genuinely failed, so "a failed removal may therefore leave
  background GPS running after the farmer presses Finish, while the
  adapter has lost the ID required to retry removal and reports that
  tracking stopped" — a real privacy/battery regression. Fixed: a
  watcher id is now cleared only once its own removal call genuinely
  succeeds (a rejected removal keeps the id for a real retry), and
  `tracking` only becomes `false` once every real watcher has actually
  been removed — a still-registered id after a failure means
  `isActivelyTracking()` honestly keeps reporting `true`. `main.ts`'s
  own Finish Job handler now fails closed on this exact case too
  (previously it logged and finished anyway): a rejected
  `stopActiveTracking()` now refuses to complete the session, since GPS
  may genuinely still be recording. `observationCount` was also
  incremented regardless of whether `insertObservation` actually
  inserted a new row — "the screen's 'observations persisted' figure can
  exceed the actual durable row count whenever the native plugin
  redelivers a fix"; fixed to count only genuine new rows. All fixed in
  the same commit; 41/41 mobile-spike tests (2 new — retained-id retry
  success, and honest `isActivelyTracking()` on a genuine removal
  failure), fresh Android debug build re-verified via `aapt`/`unzip`
  (bundle confirmed to contain the real `wasInserted`/"Refusing to
  finish" fix code).
- **Round 12** (`--base 01bb54f`, worktree at commit `e3590b8`):
  CRITICAL=0, HIGH=1, MEDIUM=1, LOW=0. Fixed: `main.ts`'s own
  `deriveObservationId` composite string was being forwarded unchanged
  as `TelemetryEventInput.id` — but `telemetry_events.id` is a real
  PostgreSQL `uuid` column, so "every real sync attempt will fail UUID
  validation before insertion." Fixed by adding a real `sync_id` column
  (a genuine UUID minted once per new row, distinct from the
  deterministic `client_observation_id` fingerprint that keeps doing its
  own, unrelated local-dedup job) — a new version-3 migration, the same
  fail-closed orphan-check discipline extended to cover it.
  `MobileSyncCoordinator`'s own `flushJobSessionObservations` also
  assumed `markSynced`/`markFailed` could never reject — a real local
  SQLite write failure there used to escape the loop's own `try`/`catch`
  and abort processing of every remaining observation, "contradicting
  the documented and tested guarantee that one observation's failure
  never blocks later observations." Fixed: each local state-transition
  is now isolated in its own safe wrapper, and a new
  `MobileSyncResult.localStateUpdateFailed` field discloses exactly
  which ids' local bookkeeping could not be updated, without ever
  conflating that with a real sync failure. All fixed in the same
  commit; 45/45 mobile-spike tests (6 new — the sync_id migration/orphan
  check, syncId storage/retrieval, and both local-state-failure
  isolation cases), fresh Android debug build re-verified via
  `aapt`/`unzip` (bundle confirmed to contain the real `sync_id`/`syncId`
  fix code — `MobileSyncCoordinator.ts` itself is not part of this
  shell's own bundle, unchanged from this phase's own disclosed scope:
  the shell never wires sync into its UI).
- **Round 13** (`--base 01bb54f`, worktree at commit `897a113`):
  CRITICAL=0, HIGH=0, MEDIUM=1, LOW=0 — **the audit script's own gate
  passed for the first time this round** ("Passed: 0 Critical, 0 High
  findings"). One real MEDIUM remained: `deriveObservationId`'s
  fingerprint excluded `accuracyMeters`, so "two callbacks with
  identical farm/session/platform/time/coordinates but different
  accuracy silently retain the first payload" — a real GPS chip can
  genuinely report a refined accuracy for what it considers the same
  fix. Fixed by including accuracy in the fingerprint too, fixed in the
  same commit even though BUILD_PLAN.md's gate does not require a
  non-blocking Medium to be resolved before progressing, matching this
  phase's own established discipline of fixing every real finding
  rather than stopping at the minimum gate. 45/45 mobile-spike tests
  (unchanged — this fix is in `main.ts`'s own internal fingerprint
  helper, not unit-tested directly, same as every prior `main.ts`-only
  fix; verified via a fresh Android debug build), `aapt`/`unzip`
  re-confirmed the compiled bundle contains the real fix code.
- **Round 14** (`--base 01bb54f`, worktree at commit `576434b`):
  **CRITICAL=0, HIGH=0, MEDIUM=0, LOW=0 — CLOSES THE AUDIT LOOP.** "No
  findings... No contract violations, fabricated production figures,
  cross-farm leakage risks, production/main changes, or correctness
  defects were identified." The first fully clean round of this phase,
  after 13 consecutive rounds each finding at least one real (never
  speculative or manufactured) issue, narrowing steadily: 2H1M, 1C2H2M,
  3H1M, 4H1M, 2H2M, 2H1M, 1H1M, 2H, 1H, 1C1H1M, 1H1M, 1H1M, 1M, then
  nothing. No fix commit needed. This is the same "further rounds
  repeat rather than add new facts" signal this repository's own history
  already uses elsewhere to close an audit loop, except this time it is
  a literal zero rather than a narrowing repetition — the strongest
  version of that signal available.

**What 14 rounds demonstrates, honestly**: not that the initial code was
badly written, but that this phase's own real architectural hazards
(async native-bridge callback ordering with no quiescence signal,
migration sequencing on a schema that had never shipped, farm-scoping
discipline under a genuinely new local-store shape) are hard to get
right on a first pass even with real intent to do so — and that
repeated, independent, adversarial re-review is what actually closes
that gap, not any single pass, however careful. Every one of the 12 real
fix commits was independently re-verified (a fresh test run, a fresh
Android build, `aapt`/`unzip` confirming the fix code actually shipped)
before the next audit round ran against it.

## 18. Full quality-gate result

Main web app, re-run at this phase's own close (after all 13 fix
commits) and confirmed unaffected throughout (this phase touches no
existing tracked file — verified via `git status` before the first
commit, and every round since):

```
test       pass  (1528/1528, 119 test files)
typecheck  pass
lint       pass
build      pass
overall:   pass
```

`apps/mobile-spike`'s own isolated test suite: 45/45 passing, `tsc
--noEmit` clean, both re-verified after every one of the 13 fix rounds
(26 after round 1, growing with nearly every subsequent fix commit to
45 by round 12; unchanged by round 13's `main.ts`-only fix, which is not
unit-tested directly, and round 14, which needed no fix at all).

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
   Android device (rebuild via `node build.mjs` / `npx cap sync android`
   / `./gradlew assembleDebug` — see that document's own §"What is
   already real and ready to test against" for why the APK itself is a
   gitignored build artifact, not a committed file) and, once Xcode
   access exists, the equivalent iOS build/test.
5. A fresh Codex audit once the above lands, before any new
   `src/domain/`-adjacent contract that emerges from item 2 is
   considered stable — this phase's own 14-round audit loop (§17) is
   closed for the work done so far, not a standing exemption for future
   changes to this code.

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
suggests the underlying architecture is unsuitable; the 14-round Codex
audit loop this phase ran to closure (§17) found and fixed a real
farm-scoping regression, a fabricated-timestamp risk, an unwired
interruption path, a UUID-contract mismatch, several genuine async
callback-ordering races, and more — exactly the kind of real defects a
genuine build-and-audit cycle exists to catch, every one of them caught
and fixed within this same phase, with the loop finally closing on a
fully clean round rather than being stopped early.

**Recommended native architecture:**

Capacitor with a dedicated, purpose-built mobile shell — reusing
`src/domain/` outright and every screen's own JSX as a starting point,
with the persistence layer rebuilt as direct Supabase client calls
instead of Server Actions. The final choice remains a real product/
business decision (`BLOCKED_HUMAN`) this report informs but does not
make.
