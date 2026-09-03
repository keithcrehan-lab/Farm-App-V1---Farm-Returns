# Physical device test plan — background GPS

Native Mobile / Background GPS Feasibility Phase, 2026-09-04.
**`BLOCKED_EXTERNAL` this phase — no physical iOS/Android device, no
Xcode.app (only Command Line Tools), and no Android emulator image were
available in this build environment.** This document is the real,
specific manual test plan a human with device access must run before
`backgroundTrackingSupported` can honestly become `true` anywhere in
this codebase (`NativeLocationTrackingProvider.ts`'s own
`BACKGROUND_TRACKING_VERIFIED_ON_DEVICE` constant names this file
directly).

## What is already real and ready to test against

This phase repeatedly produced a genuine, verified Android debug build
via `./gradlew assembleDebug` (real JDK 21 + Android SDK Platform 36
toolchain), containing the real compiled
`@capacitor-community/background-geolocation`,
`@capacitor-community/sqlite`, and `@capacitor/geolocation` plugins, and
the real static web bundle produced by `apps/mobile-spike/build.mjs` —
most recently re-verified after this phase's own round-4 fix commit
(confirmed via `aapt dump permissions` and `unzip` against the freshly
built APK). **This build output is a gitignored build artifact, not a
file committed to this repository** — a fresh checkout has no APK to
install until it is rebuilt. Final Codex audit round 5 (MEDIUM): an
earlier version of this section implied the exact APK file was already
sitting in the tree ready to install; corrected. To produce it before
running Test A/B/D/E/F below: from `apps/mobile-spike/`, run
`node build.mjs`, then `npx cap sync android`, then (from
`apps/mobile-spike/android/`) `./gradlew assembleDebug` — the resulting
APK lands at
`apps/mobile-spike/android/app/build/outputs/apk/debug/app-debug.apk`,
installable via `adb install app-debug.apk`. iOS has no equivalent build
in this environment (`xcodebuild` requires a full Xcode.app installation
this session could not perform — see
`NATIVE_MOBILE_FEASIBILITY_FINAL_REPORT.md`); running these same tests
on iOS first requires a human to open
`apps/mobile-spike/ios/App/App.xcodeproj` in a real Xcode installation
and build to a device from there.

**Before running any test below**: the spike's own adapter
(`NativeLocationTrackingProvider.ts`) defaults `useBackgroundService` to
`false` — a real test of the background path requires instantiating it
with `useBackgroundService: true` (see the spike's own `main.ts` for
where to wire this for a real test build), and granting the real native
permission prompts that appear (Android: the separate
"Allow all the time" background-location dialog; iOS: accepting the
system's own upgrade-to-Always prompt after first granting When-In-Use).

## Test A — backgrounding (home-screen)

```text
Open Farm Return (mobile spike shell)
Start Job
Walk/drive
Home-screen the app (press the home button/gesture — do not force-quit)
Continue for 10 minutes
Return to Farm Return
Verify real timestamped observations captured throughout, not just
before/after the backgrounded window
```

**Pass criteria**: `NativeLocationStore`'s own `native_gps_observations`
table (queryable via `getAllForSession`) contains real fixes with
`recorded_at` timestamps spread across the full 10-minute window, not
clustered only at the start and end.

## Test B — screen lock

```text
Start Job
Lock the phone (power button)
Move for 10 minutes
Unlock
Verify observations continued through the locked period
```

**Pass criteria**: same as Test A, specifically covering the locked
interval.

## Test C — network loss

```text
Start Job
Capture an initial position
Disable Wi-Fi/mobile data (Airplane Mode)
Continue moving
Finish Job while offline
Inspect the locally-queued observations (see note below — this spike's
own shell has no sync button; queue inspection is via a debug/manual
call, not a UI action)
```

**Pass criteria**: GPS capture and local SQLite persistence continue
uninterrupted while offline (this part needs no network per this
phase's own architecture — `NativeLocationStore` writes locally
regardless of connectivity); `Finish Job` succeeds locally
(`completed_estimated` reached with no network call required, matching
`job-session-lifecycle.ts`'s own pure `finishJobSession`).

**Final Codex audit round 5 (MEDIUM)**: this test used to end with
"Restore network / Verify sync," but `main.ts` — this spike's own real
shell — never imports or calls `MobileSyncCoordinator.flushJobSessionObservations`
at all; it implements local persistence only (per this phase's own
explicit scope: proving capture-and-persist durability, not building a
full sync UI). There is today no manual or automatic sync action in the
built APK for a device tester to trigger. `flushJobSessionObservations`
itself is real and unit-tested (`MobileSyncCoordinator.test.ts`) against
the real `job-session-sync.ts` contract — a device tester who wants to
exercise the actual network round-trip must call it directly (e.g. from
a debug console attached to the running WebView:
`store.getPending(farmId, jobSessionId)` to inspect the queue, then a
manual `flushJobSessionObservations(store, farmId, jobSessionId, syncFn)`
call) rather than a shipped "sync" button — wiring that into the shell's
own UI is real, disclosed follow-up work, not part of this test.

## Test D — application switching

```text
Start Job
Open another app (e.g. Maps, Messages)
Move
Return to Farm Return
Verify tracking continuity
```

**Pass criteria**: same continuity check as Test A, specifically across
an explicit app-switch rather than a home-screen/idle state.

## Test E — interruption

```text
Start Job
Revoke location permission from OS Settings while the job is active
(a safe, real, user-controllable interruption)
Return to Farm Return
Verify:
  - a gap is recorded (a real InterruptionGap, not a silently
    continued route)
  - the route is not fabricated/interpolated across the gap
  - the farmer is asked to confirm the job's details before finishing
```

**Pass criteria**: `NativeLocationTrackingProvider.startActiveTracking`'s
own `onInterruption` callback fires with `"permission_revoked"`;
`main.ts`'s own real interruption handler maps this to
`recordInterruptionGap` (`job-session-lifecycle.ts`, imported
unmodified) and renders the updated session state showing a real,
non-zero gap count — a real Codex-audit finding this phase's own round 2
caught and fixed (an earlier version of `main.ts` only logged the
interruption). The domain function's own correctness is separately
verified by `JobSessionIntegration.test.ts`; this device test verifies
the real UI wiring calls it, not the function's own logic again.

## Test F — force quit

```text
Start Job
Force-quit the app (swipe away from the app switcher)
Wait, then reopen Farm Return
Document the ACTUAL observed OS behaviour — do not assume continuity
```

**Pass criteria**: this test's own real purpose is *disclosure*, not a
pass/fail bar — both platforms are documented to NOT guarantee
continued background location after a genuine force-quit
(`LOCATION_PERMISSION_MODEL.md` §2's own "force-quit limitation").
Record exactly what really happens (does the session show a gap on
reopen? does the app crash? does tracking silently resume?) and update
`GPS_JOB_SESSION_ACTUAL_CONTRACT.md` §7's own disclosed gap with the
real, observed answer — never promise continuity the OS does not
provide.

## Devices to test against (recommended minimum spread, not exhaustive)

- **iOS**: one recent iPhone (iOS 17+, for Capacitor 8's own minimum
  supported OS per its real `Package.swift` — `.iOS(.v15)` is the
  plugin's own floor, but background-location reliability reporting in
  public developer forums skews toward more recent OS versions being
  more consistent) and, if available, one older supported model to
  surface any real OEM-adjacent throttling behaviour.
- **Android**: at minimum one stock/near-stock device (e.g. a Pixel) and
  one from a historically more aggressive battery-management OEM
  (Samsung, Xiaomi, or OnePlus) — `LOCATION_PERMISSION_MODEL.md` §3's
  own disclosed OEM risk is exactly the kind of platform-fragmentation
  finding that only shows up on real hardware, never in an emulator.

## What this plan explicitly does not substitute for

An Android emulator run (not attempted this phase — judged lower-value
than its own setup cost, since the task's own instructions state
emulator GPS "only proves integration/build correctness," which this
phase's own successful Gradle build already demonstrated without
needing to run one) would prove nothing about real background-GPS
reliability under real OS power management even if run — only the six
tests above, on real hardware, can.
